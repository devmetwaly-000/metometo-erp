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
    centralServerIp: 'localhost',
    centralSqlPort: 1433,
    centralDatabase: 'MultiBranchPOS_Central_DB',
    centralUsername: process.env.DB_USER || 'meto_pos',
    centralPassword: process.env.DB_PASSWORD || 'MetoPosPass123!',
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
export async function connectToCentral(config: CentralSyncConfig, targetDatabase?: string): Promise<sql.ConnectionPool> {
    let cleanServer = (config.centralServerIp || 'localhost').trim();
    let port = Number(config.centralSqlPort) || 1433;

    // Handle "server:port" pattern if entered in IP field
    if (cleanServer.includes(':')) {
        const [hostPart, portPart] = cleanServer.split(':');
        cleanServer = hostPart.trim();
        port = parseInt(portPart, 10) || port;
    }
    // Clean http:// or https:// if accidentally pasted
    cleanServer = cleanServer.replace(/^https?:\/\//i, '').replace(/\/$/, '');

    const centralSqlConfig: sql.config = {
        user: config.centralUsername,
        password: config.centralPassword,
        server: cleanServer,
        port: port,
        database: targetDatabase || config.centralDatabase,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
            connectTimeout: 8000
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
 * اختبار الاتصال بالسيرفر المركزي مع معالجة ذكية للأخطاء
 */
export async function testCentralConnection(configOverride?: Partial<CentralSyncConfig>): Promise<{
    success: boolean;
    latencyMs?: number;
    serverVersion?: string;
    database?: string;
    databaseExists?: boolean;
    message?: string;
    error?: string;
}> {
    const current = await getCentralConfig();
    const cleanOverride = { ...(configOverride || {}) };
    
    // Fall back to saved or env password if empty
    if (!cleanOverride.centralPassword && current.centralPassword) {
        cleanOverride.centralPassword = current.centralPassword;
    }

    const config: CentralSyncConfig = { ...current, ...cleanOverride };
    const startTime = Date.now();
    let centralPool: sql.ConnectionPool | null = null;

    try {
        // First try connecting to the specified database
        centralPool = await connectToCentral(config);
        const res = await centralPool.request().query('SELECT @@VERSION as version, DB_NAME() as dbName;');
        const latencyMs = Date.now() - startTime;

        await centralPool.close();
        return {
            success: true,
            databaseExists: true,
            latencyMs,
            serverVersion: res.recordset[0]?.version?.split('\n')[0] || 'Microsoft SQL Server',
            database: res.recordset[0]?.dbName || config.centralDatabase,
            message: 'تم الاتصال بالسيرفر المركزي وقاعدة البيانات بنجاح تام.'
        };
    } catch (err: any) {
        if (centralPool) {
            try { await centralPool.close(); } catch {}
            centralPool = null;
        }

        const errMsg: string = err.message || '';

        // Check if error is because the database does not exist on the server
        if (errMsg.toLowerCase().includes('cannot open database') || errMsg.includes('4060')) {
            try {
                // Try connecting to master to verify server connection & credentials
                const masterPool = await connectToCentral(config, 'master');
                const masterRes = await masterPool.request().query('SELECT @@VERSION as version;');
                const latencyMs = Date.now() - startTime;
                await masterPool.close();

                return {
                    success: true,
                    databaseExists: false,
                    latencyMs,
                    serverVersion: masterRes.recordset[0]?.version?.split('\n')[0] || 'Microsoft SQL Server',
                    database: config.centralDatabase,
                    message: `تم الاتصال بالسيرفر (${config.centralServerIp}) بنجاح! لكن قاعدة البيانات (${config.centralDatabase}) غير موجودة بعد. يمكنك إنشاؤها بنقرة واحدة من تبويب "تهيئة وإنشاء قاعدة البيانات".`
                };
            } catch {
                // If connecting to master fails too, fall through to general error reporting
            }
        }

        let userFriendlyError = errMsg;
        if (errMsg.toLowerCase().includes('failed to connect') || errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('etimedout')) {
            userFriendlyError = `تعذر الاتصال بعنوان السيرفر (${config.centralServerIp}:${config.centralSqlPort}). تأكد من أن السيرفر يعمل وعنوان IP صحيح وتفعيل بروتوكول TCP/IP في SQL Server Configuration Manager وجدار الحماية.`;
        } else if (errMsg.toLowerCase().includes('login failed') || errMsg.toLowerCase().includes('elogin')) {
            userFriendlyError = `فشل تسجيل الدخول للمستخدم (${config.centralUsername}). يرجى التأكد من اسم المستخدم وكلمة المرور وتفعيل نمط SQL Server and Windows Authentication (Mixed Mode).`;
        }

        return {
            success: false,
            error: userFriendlyError
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

