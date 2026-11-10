import { NextResponse } from 'next/server';
import sql from 'mssql';
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
        const res = await pool.request().query(`
            SELECT TOP 100 * FROM dbo.GeneralLedgerEntries ORDER BY Date DESC, CreatedAt DESC
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

        const totalDebit = lines.reduce((sum: number, l: any) => sum + (Number(l.debit) || 0), 0);
        const totalCredit = lines.reduce((sum: number, l: any) => sum + (Number(l.credit) || 0), 0);

        if (Math.abs(totalDebit - totalCredit) > 0.05) {
            return NextResponse.json({
                success: false,
                message: `القيد غير متوازن! إجمالي المدين (${totalDebit.toFixed(2)}) لا يساوي إجمالي الدائن (${totalCredit.toFixed(2)}).`
            }, { status: 400 });
        }

        const pool = await sql.connect(getDbConfig());
        
        // Count entries to generate sequential entry number
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
            .input('LinesJson', sql.NVarChar(sql.MAX), JSON.stringify(lines))
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
            newState: { entryNumber, totalDebit, linesCount: lines.length }
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

