import { NextResponse } from 'next/server';
import sql from 'mssql';
import { logAuditEvent } from '@/lib/audit-logger';

export const dynamic = 'force-dynamic';

function getDbPool() {
    return sql.connect({
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server:   process.env.DB_SERVER || 'localhost',
        database: process.env.DB_NAME,
        options:  { encrypt: false, trustServerCertificate: true }
    });
}

// ================================================================
// POST — إلغاء/حذف فاتورة مشتريات مع إلغاء الأثر المحاسبي
// ================================================================
export async function POST(req: Request) {
    try {
        const { invoiceId, invoiceType, userId, userName } = await req.json();

        if (!invoiceId) return NextResponse.json({ success: false, message: 'invoiceId مطلوب.' }, { status: 400 });

        const pool = await getDbPool();

        // ── 1. جلب بيانات الفاتورة ──────────────────────────────────────────
        const tableMap: Record<string, string> = {
            purchase:    'PurchaseInvoices',
            sale:        'SalesInvoices',
            expense:     'Expenses',
        };
        const tableName = tableMap[invoiceType || 'purchase'];
        if (!tableName) return NextResponse.json({ success: false, message: 'نوع الفاتورة غير معروف.' }, { status: 400 });

        const invRes = await pool.request()
            .input('InvId', sql.NVarChar(64), invoiceId)
            .query(`SELECT TOP 1 * FROM dbo.${tableName} WHERE Id = @InvId`);

        if (invRes.recordset.length === 0) {
            return NextResponse.json({ success: false, message: 'الفاتورة غير موجودة.' }, { status: 404 });
        }
        const inv = invRes.recordset[0];

        // ── 2. تعطيل القيود لضمان حذف سلس ──────────────────────────────────
        await pool.request().query(`EXEC sp_MSforeachtable "ALTER TABLE ? NOCHECK CONSTRAINT all";`);

        try {
            // ── 3. حذف القيد المحاسبي المرحّل (إن وجد) ──────────────────────
            const glRes = await pool.request()
                .input('SrcId', sql.NVarChar(64), invoiceId)
                .query(`SELECT TOP 1 EntryNumber FROM dbo.GeneralLedgerEntries WHERE SourceId = @SrcId`);
            
            const hadEntry = glRes.recordset.length > 0;
            const entryNumber = hadEntry ? glRes.recordset[0].EntryNumber : null;

            if (hadEntry) {
                await pool.request()
                    .input('SrcId2', sql.NVarChar(64), invoiceId)
                    .query(`DELETE FROM dbo.GeneralLedgerEntries WHERE SourceId = @SrcId2`);
            }

            // ── 4. حذف بنود الفاتورة (SubItems) ─────────────────────────────
            if (invoiceType === 'purchase') {
                await pool.request().input('IId', sql.NVarChar(64), invoiceId)
                    .query(`DELETE FROM dbo.PurchaseInvoiceItems WHERE InvoiceId = @IId`);
                
                // حذف سجل الاستلام المرتبط بهذه الفاتورة
                await pool.request().input('IId2', sql.NVarChar(64), invoiceId)
                    .query(`DELETE FROM dbo.StockInRecordItems WHERE StockInId IN (SELECT Id FROM dbo.StockInRecords WHERE PurchaseInvoiceId = @IId2)`);
                await pool.request().input('IId3', sql.NVarChar(64), invoiceId)
                    .query(`DELETE FROM dbo.StockInRecords WHERE PurchaseInvoiceId = @IId3`);
                
                // إلغاء ربط الدفعات بهذه الفاتورة
                await pool.request().input('IId4', sql.NVarChar(64), invoiceId)
                    .query(`UPDATE dbo.SupplierPayments SET InvoiceId = NULL WHERE InvoiceId = @IId4`);
            }

            if (invoiceType === 'sale') {
                await pool.request().input('IId', sql.NVarChar(64), invoiceId)
                    .query(`DELETE FROM dbo.SalesInvoiceItems WHERE InvoiceId = @IId`);
                await pool.request().input('IId4', sql.NVarChar(64), invoiceId)
                    .query(`UPDATE dbo.CustomerPayments SET InvoiceId = NULL WHERE InvoiceId = @IId4`);
            }

            // ── 5. حذف الفاتورة الرئيسية ─────────────────────────────────────
            await pool.request()
                .input('DelId', sql.NVarChar(64), invoiceId)
                .query(`DELETE FROM dbo.${tableName} WHERE Id = @DelId`);

            // ── 6. تسجيل في سجل التدقيق ─────────────────────────────────────
            await logAuditEvent({
                userId, userName,
                action: 'DELETE',
                entity: tableName,
                entityId: invoiceId,
                details: `إلغاء وحذف الفاتورة ${invoiceType === 'purchase' ? 'مشتريات' : 'مبيعات'} رقم ${inv.InvoiceNumber || invoiceId} مع إلغاء القيد ${entryNumber || 'لم يكن مرحَّلاً'}`,
                newState: { invoiceId, entryNumber, hadEntry }
            });

        } finally {
            await pool.request().query(`EXEC sp_MSforeachtable "ALTER TABLE ? WITH CHECK CHECK CONSTRAINT all";`);
        }

        return NextResponse.json({
            success: true,
            message: `تم إلغاء الفاتورة وحذفها مع إلغاء أثرها المحاسبي بنجاح.`
        });

    } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}
