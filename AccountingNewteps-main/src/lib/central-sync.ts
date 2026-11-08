/**
 * @fileOverview محرك المزامنة المركزي (Central Sync Engine)
 * يتولى الربط بين قاعدة البيانات المحلية للفرع وقاعدة البيانات المركزية للإدارة:
 * 1. اختبار الاتصال بالسيرفر المركزي (Test Connection).
 * 2. رفع حركات ومبيعات الفرع للسيرفر المركزي (Push Local -> Central).
 * 3. سحب وتحديث الأصناف والأسعار والإعدادات من السيرفر المركزي للفرع (Pull Central -> Local).
 */

import sql from 'mssql';
import { getDbPool } from '@/lib/db';

export interface CentralSyncConfig {
    currentBranchId: string;
    currentBranchCode: string;
    currentBranchName: string;
    centralServerIp: string;
    centralSqlPort: number;
    centralDatabase: string;
    centralUsername: string;
    centralPassword: string;
    autoSync: boolean;
    autoSyncIntervalMinutes: number;
    lastSyncTime?: string | null;
    lastSyncStatus?: 'success' | 'failed' | 'in_progress' | 'never' | 'ready';
    lastSyncError?: string | null;
    lastPushedCount?: number;
    lastPulledCount?: number;
}

const DEFAULT_CONFIG: CentralSyncConfig = {
    currentBranchId: '-OmnkFba_GsEb0rfdzyA',
    currentBranchCode: '900',
    currentBranchName: 'الفرع الرأيسي',
    centralServerIp: '127.0.0.1',
    centralSqlPort: 1433,
    centralDatabase: 'MultiBranchPOS_Central_DB',
    centralUsername: 'sa',
    centralPassword: '',
    autoSync: true,
    autoSyncIntervalMinutes: 5,
    lastSyncTime: null,
    lastSyncStatus: 'ready'
};

/**
 * جلب إعدادات السيرفر المركزي من قاعدة البيانات المحلية
 */
export async function getCentralConfig(): Promise<CentralSyncConfig> {
    try {
        const pool = await getDbPool();
        const res = await pool.request()
            .input('Key', sql.NVarChar(100), 'central_sync')
            .query('SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = @Key');

        if (res.recordset.length > 0 && res.recordset[0].SettingValue) {
            try {
                return { ...DEFAULT_CONFIG, ...JSON.parse(res.recordset[0].SettingValue) };
            } catch {
                return DEFAULT_CONFIG;
            }
        }
        return DEFAULT_CONFIG;
    } catch (e) {
        console.error('Error fetching central sync config:', e);
        return DEFAULT_CONFIG;
    }
}

/**
 * حفظ إعدادات السيرفر المركزي في قاعدة البيانات المحلية
 */
export async function saveCentralConfig(config: Partial<CentralSyncConfig>): Promise<CentralSyncConfig> {
    const pool = await getDbPool();
    const current = await getCentralConfig();
    const updated: CentralSyncConfig = { ...current, ...config };

    await pool.request()
        .input('Key', sql.NVarChar(100), 'central_sync')
        .input('Val', sql.NVarChar(sql.MAX), JSON.stringify(updated))
        .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = @Key)
                INSERT INTO dbo.AppSettings (SettingKey, SettingValue) VALUES (@Key, @Val);
            ELSE
                UPDATE dbo.AppSettings SET SettingValue = @Val WHERE SettingKey = @Key;
        `);

    return updated;
}

/**
 * إنشاء اتصال منفصل بالسيرفر المركزي للإدارة
 */
export async function connectToCentral(config: CentralSyncConfig): Promise<sql.ConnectionPool> {
    const centralSqlConfig: sql.config = {
        user: config.centralUsername,
        password: config.centralPassword,
        server: config.centralServerIp,
        port: Number(config.centralSqlPort) || 1433,
        database: config.centralDatabase,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
            connectTimeout: 7000
        },
        pool: {
            max: 5,
            min: 1,
            idleTimeoutMillis: 10000
        }
    };

    const centralPool = new sql.ConnectionPool(centralSqlConfig);
    await centralPool.connect();
    return centralPool;
}

/**
 * اختبار الاتصال بالسيرفر المركزي
 */
export async function testCentralConnection(configOverride?: Partial<CentralSyncConfig>): Promise<{
    success: boolean;
    latencyMs?: number;
    serverVersion?: string;
    database?: string;
    error?: string;
}> {
    const current = await getCentralConfig();
    const config: CentralSyncConfig = { ...current, ...(configOverride || {}) };

    const startTime = Date.now();
    let centralPool: sql.ConnectionPool | null = null;

    try {
        centralPool = await connectToCentral(config);
        const res = await centralPool.request().query('SELECT @@VERSION as version, DB_NAME() as dbName;');
        const latencyMs = Date.now() - startTime;

        await centralPool.close();
        return {
            success: true,
            latencyMs,
            serverVersion: res.recordset[0]?.version?.split('\n')[0] || 'Microsoft SQL Server',
            database: res.recordset[0]?.dbName || config.centralDatabase
        };
    } catch (err: any) {
        if (centralPool) {
            try { await centralPool.close(); } catch {}
        }
        return {
            success: false,
            error: err.message || 'تعذر الاتصال بالسيرفر المركزي، يرجى التحقق من عنوان IP والبورت وصلاحيات المستخدم.'
        };
    }
}

/**
 * تشغيل دورة المزامنة الكاملة (رفع العمليات المحلية وتنزيل تحديثات الإدارة)
 */
export async function runFullSync(): Promise<{
    success: boolean;
    pushedCount: number;
    pulledCount: number;
    error?: string;
    details?: string;
}> {
    const localPool = await getDbPool();
    const config = await getCentralConfig();

    let centralPool: sql.ConnectionPool | null = null;
    let totalPushed = 0;
    let totalPulled = 0;

    try {
        await saveCentralConfig({ lastSyncStatus: 'in_progress' });
        centralPool = await connectToCentral(config);

        // الجداول المراد رفعها من الفرع للمركز (Transactional Documents)
        const tablesToPush = [
            'SalesInvoices',
            'SalesReturns',
            'PurchaseInvoices',
            'PurchaseReturns',
            'CustomerPayments',
            'SupplierPayments',
            'Expenses',
            'ExceptionalIncomes',
            'TreasuryTransactions',
            'StockInRecords',
            'StockOutRecords',
            'StockAdjustmentRecords',
            'InventoryClosings',
            'PosSessions',
            'PosAuditLogs',
            'CustomerVisits',
            'LoginHistory'
        ];

        for (const tableName of tablesToPush) {
            try {
                // جلب السجلات غير المزامنة من قاعدة بيانات الفرع
                const pendingRes = await localPool.request()
                    .input('BranchCode', sql.NVarChar(50), config.currentBranchCode)
                    .query(`
                        SELECT TOP 200 * FROM dbo.[${tableName}]
                        WHERE (SyncStatus = 'pending' OR LastSyncedAt IS NULL OR SyncStatus IS NULL)
                          AND (BranchCode = @BranchCode OR BranchCode IS NULL)
                        ORDER BY Id
                    `);

                const rows = pendingRes.recordset;
                if (rows.length > 0) {
                    for (const row of rows) {
                        // التأكد من وضع كود واسم الفرع
                        row.BranchCode = row.BranchCode || config.currentBranchCode;
                        row.BranchName = row.BranchName || config.currentBranchName;
                        row.SyncStatus = 'synced';
                        row.LastSyncedAt = new Date();

                        // بناء استعلام الحفظ في السيرفر المركزي
                        const colNames = Object.keys(row).filter(c => c !== 'SyncStatus' && c !== 'LastSyncedAt');
                        const insertCols = colNames.join(', ');
                        const paramCols = colNames.map(c => `@${c}`).join(', ');
                        const updateSet = colNames.filter(c => c !== 'Id').map(c => `target.[${c}] = source.[${c}]`).join(', ');

                        const centralReq = centralPool.request();
                        for (const col of colNames) {
                            centralReq.input(col, row[col] === undefined ? null : row[col]);
                        }

                        await centralReq.query(`
                            IF NOT EXISTS (SELECT 1 FROM dbo.[${tableName}] WHERE Id = @Id)
                                INSERT INTO dbo.[${tableName}] (${insertCols}, BranchCode, BranchName, LastSyncedAt)
                                VALUES (${paramCols}, '${config.currentBranchCode}', N'${config.currentBranchName}', GETDATE());
                            ELSE
                                UPDATE dbo.[${tableName}]
                                SET ${updateSet}, BranchCode = '${config.currentBranchCode}', BranchName = N'${config.currentBranchName}', LastSyncedAt = GETDATE()
                                WHERE Id = @Id;
                        `);

                        // تعليم السجل في الفرع بأنه متزامن
                        await localPool.request()
                            .input('Id', sql.NVarChar(64), row.Id)
                            .query(`UPDATE dbo.[${tableName}] SET SyncStatus = 'synced', LastSyncedAt = GETDATE() WHERE Id = @Id;`);

                        totalPushed++;
                    }
                }
            } catch (tableErr: any) {
                console.warn(`Sync push warning on table ${tableName}:`, tableErr.message);
            }
        }

        // الجداول المراد سحبها من المركز للفرع (Master Catalog Updates)
        const tablesToPull = ['Items', 'ItemCategories', 'ItemSections', 'ItemGroups', 'AppSettings', 'Promotions'];
        for (const tableName of tablesToPull) {
            try {
                const centralItemsRes = await centralPool.request().query(`SELECT * FROM dbo.[${tableName}]`);
                for (const item of centralItemsRes.recordset) {
                    const colNames = Object.keys(item).filter(c => c !== 'SyncStatus' && c !== 'LastSyncedAt');
                    const localReq = localPool.request();
                    for (const col of colNames) {
                        localReq.input(col, item[col] === undefined ? null : item[col]);
                    }

                    if (item.Id) {
                        const insertCols = colNames.join(', ');
                        const paramCols = colNames.map(c => `@${c}`).join(', ');
                        const updateSet = colNames.filter(c => c !== 'Id').map(c => `target.[${c}] = source.[${c}]`).join(', ');

                        await localReq.query(`
                            IF NOT EXISTS (SELECT 1 FROM dbo.[${tableName}] WHERE Id = @Id)
                                INSERT INTO dbo.[${tableName}] (${insertCols}) VALUES (${paramCols});
                            ELSE
                                UPDATE dbo.[${tableName}]
                                SET ${colNames.filter(c => c !== 'Id').map(c => `[${c}] = @${c}`).join(', ')}
                                WHERE Id = @Id;
                        `);
                        totalPulled++;
                    }
                }
            } catch (pullErr: any) {
                console.warn(`Sync pull warning on table ${tableName}:`, pullErr.message);
            }
        }

        const now = new Date().toISOString();
        await saveCentralConfig({
            lastSyncTime: now,
            lastSyncStatus: 'success',
            lastSyncError: null,
            lastPushedCount: totalPushed,
            lastPulledCount: totalPulled
        });

        await centralPool.close();
        return {
            success: true,
            pushedCount: totalPushed,
            pulledCount: totalPulled,
            details: `تمت المزامنة بنجاح: تم رفع ${totalPushed} حركة من الفرع، وسحب ${totalPulled} تحديث من المركز.`
        };

    } catch (err: any) {
        if (centralPool) {
            try { await centralPool.close(); } catch {}
        }

        await saveCentralConfig({
            lastSyncStatus: 'failed',
            lastSyncError: err.message
        });

        return {
            success: false,
            pushedCount: totalPushed,
            pulledCount: totalPulled,
            error: err.message || 'حدث خطأ أثناء إجراء المزامنة مع السيرفر المركزي.'
        };
    }
}

