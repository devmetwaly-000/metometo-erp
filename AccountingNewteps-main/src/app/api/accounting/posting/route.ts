import sql from 'mssql';
import { NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/audit-logger';

function getDbConfig() {
    return {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER || 'localhost',
        database: process.env.DB_NAME,
        options: { encrypt: false, trustServerCertificate: true }
    };
}

export async function GET(req: Request) {
    try {
        const pool = await sql.connect(getDbConfig());
        // جلب كافة القيود (بدون حد أقصى) لضمان اكتمال قائمة المرحّلة
        const res = await pool.request().query(`
            SELECT Id, EntryNumber, Date, SourceType, SourceId, SourceNumber, WarehouseId,
                   Description, Status, TotalDebit, TotalCredit, LinesJson,
                   CreatedById, CreatedByName, CreatedAt
            FROM dbo.GeneralLedgerEntries
            ORDER BY Date DESC, CreatedAt DESC
        `);
        return NextResponse.json({ success: true, entries: res.recordset });
    } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { 
            sourceType, 
            sourceId, 
            sourceNumber, 
            warehouseId, 
            date, 
            description, 
            lines, 
            userId, 
            userName 
        } = body;

        if (!lines || !Array.isArray(lines) || lines.length < 2) {
            return NextResponse.json({ success: false, message: 'يجب أن يحتوي القيد على طرفين على الأقل (مدين ودائن).' }, { status: 400 });
        }

        let finalLines = [...lines];
        let totalDebit = finalLines.reduce((sum: number, l: any) => sum + (Number(l.debit) || 0), 0);
        let totalCredit = finalLines.reduce((sum: number, l: any) => sum + (Number(l.credit) || 0), 0);
        const diff = Math.abs(totalDebit - totalCredit);

        if (diff > 0.001) {
            // للتأكد التام من عدم فشل الترحيل بسبب أي فروق تقريب أو تسويات
            if (diff <= 0.05 || body.autoBalance || ['sale', 'purchase', 'expense', 'sale_return', 'purchase_return'].includes(sourceType)) {
                if (totalDebit > totalCredit) {
                    finalLines.push({
                        account: 'حساب فروق التسوية الآلية',
                        debit: 0,
                        credit: Number((totalDebit - totalCredit).toFixed(4)),
                        description: `تسوية توازن القيد آلياً - ${sourceNumber || ''}`
                    });
                } else {
                    finalLines.push({
                        account: 'حساب فروق التسوية الآلية',
                        debit: Number((totalCredit - totalDebit).toFixed(4)),
                        credit: 0,
                        description: `تسوية توازن القيد آلياً - ${sourceNumber || ''}`
                    });
                }
                totalDebit = finalLines.reduce((sum: number, l: any) => sum + (Number(l.debit) || 0), 0);
                totalCredit = finalLines.reduce((sum: number, l: any) => sum + (Number(l.credit) || 0), 0);
            } else {
                return NextResponse.json({
                    success: false,
                    message: `القيد غير متوازن! إجمالي المدين (${totalDebit.toFixed(2)}) لا يساوي إجمالي الدائن (${totalCredit.toFixed(2)}).`
                }, { status: 400 });
            }
        }

        const pool = await sql.connect(getDbConfig());

        // ── 1. منع الترحيل المزدوج: تحقق من وجود SourceId مسبقاً ──────────────
        if (sourceId) {
            const dupCheck = await pool.request()
                .input('SourceIdCheck', sql.NVarChar(64), sourceId)
                .query(`SELECT TOP 1 EntryNumber FROM dbo.GeneralLedgerEntries WHERE SourceId = @SourceIdCheck`);
            if (dupCheck.recordset.length > 0) {
                return NextResponse.json({
                    success: false,
                    message: `هذا المستند مرحَّل مسبقاً بالقيد رقم ${dupCheck.recordset[0].EntryNumber}. لا يمكن ترحيله مرة أخرى.`
                }, { status: 409 });
            }
        }

        // ── 2. توليد رقم تسلسلي للقيد ──────────────────────────────────────────
        const countRes = await pool.request().query('SELECT COUNT(*) as cnt FROM dbo.GeneralLedgerEntries');
        const nextNum = (countRes.recordset[0]?.cnt || 0) + 1;
        const entryNumber = `ق-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;
        const id = `GL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        await pool.request()
            .input('Id', sql.NVarChar(64), id)
            .input('EntryNumber', sql.NVarChar(50), entryNumber)
            .input('Date', sql.DateTime2, date ? new Date(date) : new Date())
            .input('SourceType', sql.NVarChar(50), sourceType || 'manual')
            .input('SourceId', sql.NVarChar(64), sourceId || null)
            .input('SourceNumber', sql.NVarChar(100), sourceNumber || null)
            .input('WarehouseId', sql.NVarChar(64), warehouseId || null)
            .input('Description', sql.NVarChar(sql.MAX), description || `قيد ترحيل آلي للمستند ${sourceNumber || ''}`)
            .input('Status', sql.NVarChar(30), 'posted')
            .input('TotalDebit', sql.Decimal(18, 4), totalDebit)
            .input('TotalCredit', sql.Decimal(18, 4), totalCredit)
            .input('LinesJson', sql.NVarChar(sql.MAX), JSON.stringify(finalLines))
            .input('CreatedById', sql.NVarChar(64), userId || null)
            .input('CreatedByName', sql.NVarChar(255), userName || 'المحاسب الآلي')
            .query(`
                INSERT INTO dbo.GeneralLedgerEntries (
                    Id, EntryNumber, Date, SourceType, SourceId, SourceNumber, WarehouseId,
                    Description, Status, TotalDebit, TotalCredit, LinesJson, CreatedById, CreatedByName
                ) VALUES (
                    @Id, @EntryNumber, @Date, @SourceType, @SourceId, @SourceNumber, @WarehouseId,
                    @Description, @Status, @TotalDebit, @TotalCredit, @LinesJson, @CreatedById, @CreatedByName
                );
            `);

        // Record Audit log
        await logAuditEvent({
            userId,
            userName,
            action: 'POST',
            entity: 'generalLedgerEntries',
            entityId: id,
            details: `تم ترحيل القيد رقم ${entryNumber} بقيمة ${totalDebit.toFixed(2)} ج.م للمستند ${sourceNumber || ''}`,
            newState: { entryNumber, totalDebit, linesCount: finalLines.length }
        });

        return NextResponse.json({
            success: true,
            message: `تم ترحيل القيد بنجاح برقم ${entryNumber}`,
            entryNumber,
            id
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}


// ================================================================
// DELETE — فك ترحيل قيد (حذف من GeneralLedgerEntries بالـ SourceId)
// ================================================================
export async function DELETE(req: Request) {
    try {
        const { sourceId, userId, userName } = await req.json();
        if (!sourceId) return NextResponse.json({ success: false, message: 'sourceId مطلوب.' }, { status: 400 });

        const pool = await sql.connect(getDbConfig());

        // جلب القيد أولاً للتسجيل في السجل
        const existing = await pool.request()
            .input('SrcId', sql.NVarChar(64), sourceId)
            .query(`SELECT TOP 1 Id, EntryNumber, TotalDebit FROM dbo.GeneralLedgerEntries WHERE SourceId = @SrcId`);

        if (existing.recordset.length === 0) {
            return NextResponse.json({ success: false, message: 'لا يوجد قيد مرحّل لهذا المستند.' }, { status: 404 });
        }

        const { Id: entryId, EntryNumber: entryNumber, TotalDebit: totalDebit } = existing.recordset[0];

        // حذف القيد
        await pool.request()
            .input('SrcId2', sql.NVarChar(64), sourceId)
            .query(`DELETE FROM dbo.GeneralLedgerEntries WHERE SourceId = @SrcId2`);

        await logAuditEvent({
            userId, userName,
            action: 'DELETE',
            entity: 'generalLedgerEntries',
            entityId: entryId,
            details: `فك ترحيل القيد رقم ${entryNumber} بقيمة ${Number(totalDebit).toFixed(2)} ج.م`,
            newState: { deletedEntryNumber: entryNumber, sourceId }
        });

        return NextResponse.json({
            success: true,
            message: `تم فك ترحيل القيد ${entryNumber} بنجاح.`,
            entryNumber
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}

// ================================================================
// PATCH — إعادة ترحيل قيد (فك + ترحيل جديد بسطور محدّثة)
// ================================================================
export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { sourceType, sourceId, sourceNumber, warehouseId, date, description, lines, userId, userName } = body;

        if (!sourceId) return NextResponse.json({ success: false, message: 'sourceId مطلوب.' }, { status: 400 });
        if (!lines || !Array.isArray(lines) || lines.length < 2) {
            return NextResponse.json({ success: false, message: 'القيد يجب أن يحتوي على سطرين على الأقل.' }, { status: 400 });
        }

        let finalLines = [...lines];
        let totalDebit  = finalLines.reduce((s: number, l: any) => s + (Number(l.debit)  || 0), 0);
        let totalCredit = finalLines.reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
        const diff = Math.abs(totalDebit - totalCredit);

        if (diff > 0.001) {
            if (diff <= 0.05 || body.autoBalance || ['sale', 'purchase', 'expense', 'sale_return', 'purchase_return'].includes(sourceType)) {
                if (totalDebit > totalCredit) {
                    finalLines.push({
                        account: 'حساب فروق التسوية الآلية',
                        debit: 0,
                        credit: Number((totalDebit - totalCredit).toFixed(4)),
                        description: `تسوية توازن القيد آلياً - ${sourceNumber || ''}`
                    });
                } else {
                    finalLines.push({
                        account: 'حساب فروق التسوية الآلية',
                        debit: Number((totalCredit - totalDebit).toFixed(4)),
                        credit: 0,
                        description: `تسوية توازن القيد آلياً - ${sourceNumber || ''}`
                    });
                }
                totalDebit = finalLines.reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);
                totalCredit = finalLines.reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
            } else {
                return NextResponse.json({
                    success: false,
                    message: `القيد غير متوازن! المدين (${totalDebit.toFixed(2)}) ≠ الدائن (${totalCredit.toFixed(2)}).`
                }, { status: 400 });
            }
        }

        const pool = await sql.connect(getDbConfig());

        // 1. حذف القيد القديم
        await pool.request()
            .input('SrcId', sql.NVarChar(64), sourceId)
            .query(`DELETE FROM dbo.GeneralLedgerEntries WHERE SourceId = @SrcId`);

        // 2. إنشاء قيد جديد
        const countRes = await pool.request().query('SELECT COUNT(*) as cnt FROM dbo.GeneralLedgerEntries');
        const nextNum = (countRes.recordset[0]?.cnt || 0) + 1;
        const entryNumber = `ق-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;
        const id = `GL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        await pool.request()
            .input('Id',          sql.NVarChar(64),       id)
            .input('EntryNumber', sql.NVarChar(50),        entryNumber)
            .input('Date',        sql.DateTime2,           date ? new Date(date) : new Date())
            .input('SourceType',  sql.NVarChar(50),        sourceType || 'manual')
            .input('SourceId',    sql.NVarChar(64),        sourceId)
            .input('SourceNumber',sql.NVarChar(100),       sourceNumber || null)
            .input('WarehouseId', sql.NVarChar(64),        warehouseId || null)
            .input('Description', sql.NVarChar(sql.MAX),   description || `إعادة ترحيل ${sourceNumber || ''}`)
            .input('Status',      sql.NVarChar(30),        'posted')
            .input('TotalDebit',  sql.Decimal(18, 4),      totalDebit)
            .input('TotalCredit', sql.Decimal(18, 4),      totalCredit)
            .input('LinesJson',   sql.NVarChar(sql.MAX),   JSON.stringify(finalLines))
            .input('CreatedById', sql.NVarChar(64),        userId || null)
            .input('CreatedByName', sql.NVarChar(255),     userName || 'المحاسب الآلي')
            .query(`
                INSERT INTO dbo.GeneralLedgerEntries
                    (Id, EntryNumber, Date, SourceType, SourceId, SourceNumber, WarehouseId,
                     Description, Status, TotalDebit, TotalCredit, LinesJson, CreatedById, CreatedByName)
                VALUES
                    (@Id, @EntryNumber, @Date, @SourceType, @SourceId, @SourceNumber, @WarehouseId,
                     @Description, @Status, @TotalDebit, @TotalCredit, @LinesJson, @CreatedById, @CreatedByName);
            `);

        await logAuditEvent({
            userId, userName,
            action: 'POST',
            entity: 'generalLedgerEntries',
            entityId: id,
            details: `إعادة ترحيل القيد ${entryNumber} للمستند ${sourceNumber || ''}`,
            newState: { entryNumber, totalDebit, linesCount: lines.length }
        });

        return NextResponse.json({
            success: true,
            message: `تمت إعادة الترحيل بنجاح برقم ${entryNumber}`,
            entryNumber, id
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}
