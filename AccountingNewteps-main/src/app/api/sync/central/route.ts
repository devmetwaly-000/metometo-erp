import { NextResponse } from 'next/server';
import { getCentralConfig, saveCentralConfig, testCentralConnection, runFullSync } from '@/lib/central-sync';
import { getDbPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const config = await getCentralConfig();
        const pool = await getDbPool();

        // Calculate pending records to sync from local DB
        const pendingCountRes = await pool.request().query(`
            SELECT 
                (SELECT COUNT(*) FROM dbo.SalesInvoices WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) +
                (SELECT COUNT(*) FROM dbo.CustomerPayments WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) +
                (SELECT COUNT(*) FROM dbo.PurchaseInvoices WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) +
                (SELECT COUNT(*) FROM dbo.SupplierPayments WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) +
                (SELECT COUNT(*) FROM dbo.Expenses WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as totalPending;
        `);

        const pendingCount = pendingCountRes.recordset[0]?.totalPending || 0;

        return NextResponse.json({
            success: true,
            config,
            pendingCount
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, config } = body;

        if (action === 'test') {
            const testResult = await testCentralConnection(config);
            return NextResponse.json(testResult);
        }

        if (action === 'save') {
            const updated = await saveCentralConfig(config);
            return NextResponse.json({ success: true, config: updated, message: 'تم حفظ إعدادات السيرفر المركزي بنجاح' });
        }

        if (action === 'sync') {
            if (config) {
                await saveCentralConfig(config);
            }
            const syncResult = await runFullSync();
            return NextResponse.json(syncResult);
        }

        return NextResponse.json({ success: false, error: 'إجراء غير مدعوم' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
