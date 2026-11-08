import { NextResponse } from 'next/server';
import { 
    getCentralConfig, 
    saveCentralConfig, 
    testCentralConnection, 
    runFullSync, 
    getTablesSyncMatrix 
} from '@/lib/central-sync';
import { createAndInitializeDatabase } from '@/lib/database-init';
import { getDbPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const config = await getCentralConfig();
        const pool = await getDbPool();

        // إحصائيات سريعة للوثائق المعلقة من قاعدة البيانات المحلية
        const queueRes = await pool.request().query(`
            SELECT 
                (SELECT COUNT(*) FROM dbo.SalesInvoices WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as salesPending,
                (SELECT COUNT(*) FROM dbo.SalesReturns WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as salesReturnsPending,
                (SELECT COUNT(*) FROM dbo.PurchaseInvoices WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as purchasesPending,
                (SELECT COUNT(*) FROM dbo.PurchaseReturns WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as purchaseReturnsPending,
                (SELECT COUNT(*) FROM dbo.CustomerPayments WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as customerPaymentsPending,
                (SELECT COUNT(*) FROM dbo.SupplierPayments WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as supplierPaymentsPending,
                (SELECT COUNT(*) FROM dbo.Expenses WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) +
                (SELECT COUNT(*) FROM dbo.ExceptionalIncomes WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as expensesPending,
                (SELECT COUNT(*) FROM dbo.TreasuryTransactions WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as treasuryPending,
                (SELECT COUNT(*) FROM dbo.StockInRecords WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) +
                (SELECT COUNT(*) FROM dbo.StockOutRecords WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) +
                (SELECT COUNT(*) FROM dbo.StockAdjustmentRecords WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as stockPending,
                (SELECT COUNT(*) FROM dbo.StockTransferRecords WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as transfersPending,
                (SELECT COUNT(*) FROM dbo.RepRemittances WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) +
                (SELECT COUNT(*) FROM dbo.StockIssuesToReps WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) +
                (SELECT COUNT(*) FROM dbo.StockReturnsFromReps WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as repPending,
                (SELECT COUNT(*) FROM dbo.EmployeeAdvances WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) +
                (SELECT COUNT(*) FROM dbo.PayrollRecords WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as hrPending,
                (SELECT COUNT(*) FROM dbo.PosSessions WHERE SyncStatus = 'pending' OR LastSyncedAt IS NULL) as posPending;
        `);

        const q = queueRes.recordset[0] || {};
        const totalPending = (q.salesPending || 0) + (q.salesReturnsPending || 0) +
                             (q.purchasesPending || 0) + (q.purchaseReturnsPending || 0) +
                             (q.customerPaymentsPending || 0) + (q.supplierPaymentsPending || 0) + 
                             (q.expensesPending || 0) + (q.treasuryPending || 0) +
                             (q.stockPending || 0) + (q.transfersPending || 0) +
                             (q.repPending || 0) + (q.hrPending || 0) + (q.posPending || 0);

        // سجل عمليات المزامنة الأخيرة
        const recentSyncLogs = [
            {
                id: 'log_latest',
                timestamp: config.lastSyncTime || null,
                status: config.lastSyncStatus || 'ready',
                pushed: config.lastPushedCount || 0,
                pulled: config.lastPulledCount || 0,
                error: config.lastSyncError || null,
                branch: `${config.currentBranchName} (${config.currentBranchCode})`
            }
        ];

        // مصفوفة المزامنة الشاملة المعتمدة على التوقيت الزمني (Sync Matrix)
        let syncMatrix: Awaited<ReturnType<typeof getTablesSyncMatrix>> | null = null;
        try {
            syncMatrix = await getTablesSyncMatrix();
        } catch (tableErr: any) {
            console.warn('Failed to get tables sync matrix:', tableErr.message);
        }

        return NextResponse.json({
            success: true,
            config,
            pendingBreakdown: {
                sales: q.salesPending || 0,
                salesReturns: q.salesReturnsPending || 0,
                purchases: q.purchasesPending || 0,
                purchaseReturns: q.purchaseReturnsPending || 0,
                customerPayments: q.customerPaymentsPending || 0,
                supplierPayments: q.supplierPaymentsPending || 0,
                expenses: q.expensesPending || 0,
                treasury: q.treasuryPending || 0,
                stock: q.stockPending || 0,
                transfers: q.transfersPending || 0,
                rep: q.repPending || 0,
                hr: q.hrPending || 0,
                pos: q.posPending || 0,
                total: totalPending
            },
            pendingCount: totalPending,
            recentSyncLogs,
            syncMatrix,
            tablesComparison: syncMatrix
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, config, initOptions, mode, targetTable } = body;

        // 1. تهيئة وإنشاء قاعدة البيانات
        if (action === 'init-database') {
            const options = initOptions || {
                server: config?.centralServerIp || '10.110.16.16',
                port: Number(config?.centralSqlPort) || 1433,
                database: config?.centralDatabase || 'MultiBranchPOS_Central_DB',
                user: config?.centralUsername || 'gmlogins',
                password: config?.centralPassword || 'retgomladb',
                branchCode: config?.currentBranchCode || '900',
                branchName: config?.currentBranchName || 'الفرع الرأيسي'
            };

            const initResult = await createAndInitializeDatabase(options);
            return NextResponse.json(initResult);
        }

        // 2. اختبار الاتصال بالسيرفر
        if (action === 'test') {
            const testResult = await testCentralConnection(config);
            return NextResponse.json(testResult);
        }

        // 3. حفظ إعدادات المزامنة
        if (action === 'save') {
            const updated = await saveCentralConfig(config);
            return NextResponse.json({ success: true, config: updated, message: 'تم حفظ إعدادات السيرفر المركزي بنجاح' });
        }

        // 4. تشغيل المزامنة الذكية (شاملة، رفع فقط، سحب فقط، أو لجدول محدد)
        if (action === 'sync') {
            if (config) {
                await saveCentralConfig(config);
            }
            const syncResult = await runFullSync({
                mode: mode || 'all',
                targetTable
            });
            return NextResponse.json(syncResult);
        }

        // 5. جلب وتحديث مصفوفة المزامنة اللحظية
        if (action === 'sync-matrix' || action === 'tables-comparison') {
            const syncMatrix = await getTablesSyncMatrix();
            return NextResponse.json({ success: true, syncMatrix, tablesComparison: syncMatrix });
        }

        return NextResponse.json({ success: false, error: 'إجراء غير مدعوم' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
