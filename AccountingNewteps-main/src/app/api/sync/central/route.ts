import { NextResponse } from 'next/server';
import { 
    getCentralConfig, 
    saveCentralConfig, 
    testCentralConnection, 
    runFullSync, 
    getTablesSyncMatrix,
    updateTableSyncDirection,
    updateTableSyncDirectionsBulk,
    resetTableSyncDirections
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
        const { action, config, initOptions, mode, targetTable, forceFull } = body;

        // 1. تهيئة وإنشاء وتأسيس قاعدة البيانات
        if (action === 'init-database') {
            const currentCfg = await getCentralConfig();
            const options = {
                server: initOptions?.server || config?.centralServerIp || currentCfg.centralServerIp || '10.110.16.16',
                port: Number(initOptions?.port || config?.centralSqlPort || currentCfg.centralSqlPort) || 1433,
                database: initOptions?.database || config?.centralDatabase || currentCfg.centralDatabase || 'MultiBranchPOS_Central_DB',
                user: initOptions?.user || config?.centralUsername || currentCfg.centralUsername || 'gmlogins',
                password: (initOptions?.password && initOptions.password.trim() !== '')
                    ? initOptions.password.trim()
                    : (config?.centralPassword && config.centralPassword.trim() !== '')
                        ? config.centralPassword.trim()
                        : currentCfg.centralPassword,
                branchCode: initOptions?.branchCode || config?.currentBranchCode || currentCfg.currentBranchCode || '900',
                branchName: initOptions?.branchName || config?.currentBranchName || currentCfg.currentBranchName || 'الفرع الرأيسي',
                isCentral: true
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

        // 4. تشغيل المزامنة الذكية أو إعادة المزامنة الشاملة للجدول بالكامل (Force Full Sync)
        if (action === 'sync' || action === 'force-sync-table') {
            if (config && config.centralPassword && config.centralPassword.trim() !== '') {
                await saveCentralConfig(config);
            }
            const syncResult = await runFullSync({
                mode: mode || 'all',
                targetTable,
                forceFull: !!forceFull || action === 'force-sync-table'
            });
            return NextResponse.json(syncResult);
        }

        // 5. جلب وتحديث مصفوفة المزامنة اللحظية
        if (action === 'sync-matrix' || action === 'tables-comparison') {
            const syncMatrix = await getTablesSyncMatrix();
            return NextResponse.json({ success: true, syncMatrix, tablesComparison: syncMatrix });
        }

        // 6. التحويل المحمي لدور النظام (إدارة مركزية أو فرع) بكلمة مرور مسؤولة
        if (action === 'switch-role') {
            const { targetRole, password } = body;
            if (!targetRole || (targetRole !== 'branch' && targetRole !== 'central')) {
                return NextResponse.json({ success: false, error: 'دور النظام المطلوب غير صالح.' }, { status: 400 });
            }
            const cleanPass = (password || '').trim();
            if (!cleanPass) {
                return NextResponse.json({ success: false, error: 'يرجى إدخال كلمة مرور المسؤول للمتابعة.' }, { status: 400 });
            }

            const pool = await getDbPool();
            const adminUsersRes = await pool.request().query(`
                SELECT Id, LoginName, Password, Role FROM dbo.Users 
                WHERE IsDisabled = 0
            `);

            let isAuthenticated = false;

            for (const u of adminUsersRes.recordset) {
                if (u.Password && u.Password.trim() === cleanPass) {
                    isAuthenticated = true;
                    break;
                }
            }

            // كلمات مرور الإدارة القياسية
            if (!isAuthenticated && (cleanPass === '200300400' || cleanPass === '123456789' || cleanPass === 'admin@meto123')) {
                isAuthenticated = true;
            }

            if (!isAuthenticated) {
                return NextResponse.json({ 
                    success: false, 
                    error: 'كلمة المرور غير صحيحة! تم رفض تحويل دور النظام لأسباب أمنية.' 
                }, { status: 403 });
            }

            // تحديث إعداد دور النظام في قاعدة البيانات
            const currentCfg = await getCentralConfig();
            const updatedCfg = await saveCentralConfig({
                ...currentCfg,
                systemRole: targetRole
            });

            const sqlMod = await import('mssql');
            await pool.request()
                .input('Key', sqlMod.default.NVarChar(100), 'system_role')
                .input('Val', sqlMod.default.NVarChar(100), targetRole)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = @Key)
                        INSERT INTO dbo.AppSettings (SettingKey, SettingValue, SyncStatus, LastSyncedAt) VALUES (@Key, @Val, 'synced', SYSUTCDATETIME());
                    ELSE
                        UPDATE dbo.AppSettings SET SettingValue = @Val, SyncStatus = 'synced', LastSyncedAt = SYSUTCDATETIME() WHERE SettingKey = @Key;
                `);

            return NextResponse.json({ 
                success: true, 
                systemRole: targetRole,
                config: updatedCfg,
                message: targetRole === 'central' 
                    ? 'تم بنجاح تحويل دور النظام إلى [إدارة مركزية Central HQ] وحفظ الإعداد في قاعدة البيانات.' 
                    : 'تم بنجاح تحويل دور النظام إلى [فرع محلي Sub-Branch] وحفظ الإعداد في قاعدة البيانات.'
            });
        }

        // 7. تحديث اتجاه مزامنة جدول محدد
        if (action === 'update-direction') {
            const { tableName, direction } = body;
            if (!tableName || !direction) {
                return NextResponse.json({ success: false, error: 'اسم الجدول والاتجاه مطلوبان.' }, { status: 400 });
            }
            const res = await updateTableSyncDirection(tableName, direction);
            return NextResponse.json({
                success: true,
                tableName,
                direction,
                message: `تم تحديث اتجاه مزامنة "${tableName}" إلى "${direction}" وحفظه في قاعدة البيانات.`
            });
        }

        // 8. تحديث جماعي لاتجاهات المزامنة لقسم كامل أو قائمة
        if (action === 'update-directions-bulk') {
            const { category, direction, updates } = body;
            if (category && direction) {
                const pool = await getDbPool();
                const sqlMod = await import('mssql');
                await pool.request()
                    .input('Category', sqlMod.default.NVarChar(100), category)
                    .input('Direction', sqlMod.default.NVarChar(50), direction)
                    .query(`
                        UPDATE dbo.SyncTrackingMatrix 
                        SET SyncDirection = @Direction, UpdatedAt = SYSUTCDATETIME()
                        WHERE Category = @Category;
                    `);
                return NextResponse.json({
                    success: true,
                    message: `تم تحديث اتجاه مزامنة جميع جداول قسم "${category}" إلى "${direction}" بنجاح.`
                });
            }
            if (Array.isArray(updates) && updates.length > 0) {
                const res = await updateTableSyncDirectionsBulk(updates);
                return NextResponse.json(res);
            }
            return NextResponse.json({ success: false, error: 'بيانات التحديث غير صالحة.' }, { status: 400 });
        }

        // 9. استعادة اتجاهات المزامنة الافتراضية الموصى بها
        if (action === 'reset-directions') {
            await resetTableSyncDirections();
            return NextResponse.json({
                success: true,
                message: 'تمت استعادة اتجاهات المزامنة القياسية الموصى بها لجميع الجداول الـ 69 بنجاح.'
            });
        }

        return NextResponse.json({ success: false, error: 'إجراء غير مدعوم' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
