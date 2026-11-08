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

        // الجداول المراد رفعها من الفرع للمركز (Transactional Documents & Branch Master Data)
        const tablesToPush = [
            'Warehouses',
            'CashAccounts',
            'Customers',
            'Suppliers',
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
            'StockTransferRecords',
            'StockIssuesToReps',
            'StockReturnsFromReps',
            'RepRemittances',
            'EmployeeAdvances',
            'PayrollRecords',
            'ProfitDistributions',
            'GratuityDistributions',
            'GratuityLogs',
            'InventoryClosings',
            'PosSessions',
            'PosAuditLogs',
            'CustomerVisits',
            'LoginHistory',
            'BarcodeDesigns',
            'Counters',
            'AppSettings'
        ];

        for (const tableName of tablesToPush) {
            try {
                const idField = (tableName === 'AppSettings') ? 'SettingKey' : 'Id';

                // جلب السجلات غير المزامنة من قاعدة بيانات الفرع
                const pendingRes = await localPool.request()
                    .input('BranchCode', sql.NVarChar(50), config.currentBranchCode)
                    .query(`
                        SELECT TOP 200 * FROM dbo.[${tableName}]
                        WHERE (SyncStatus = 'pending' OR LastSyncedAt IS NULL OR SyncStatus IS NULL)
                          AND (BranchCode = @BranchCode OR BranchCode IS NULL)
                        ORDER BY [${idField}]
                    `);

                const rows = pendingRes.recordset;
                if (rows.length > 0) {
                    // فحص أعمدة الجدول الموجودة فعلياً في السيرفر المركزي
                    const centralColsRes = await centralPool.request()
                        .input('Tbl', sql.NVarChar(128), tableName)
                        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @Tbl`);
                    const centralColSet = new Set(centralColsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

                    // محاذاة تلقائية لأي أعمدة ناقصة في السيرفر المركزي على الطاير
                    for (const col of Object.keys(rows[0])) {
                        if (!centralColSet.has(col.toLowerCase())) {
                            try {
                                await centralPool.request().query(`ALTER TABLE dbo.[${tableName}] ADD [${col}] NVARCHAR(MAX) NULL;`);
                                centralColSet.add(col.toLowerCase());
                            } catch {}
                        }
                    }

                    for (const row of rows) {
                        const idVal = row[idField];
                        if (!idVal) continue;

                        // التأكد من وضع كود واسم الفرع
                        row.BranchCode = row.BranchCode || config.currentBranchCode;
                        row.BranchName = row.BranchName || config.currentBranchName;
                        row.SyncStatus = 'synced';
                        row.LastSyncedAt = new Date();

                        // بناء استعلام الحفظ في السيرفر المركزي للأعمدة المتوافقة
                        const colNames = Object.keys(row).filter(c => 
                            c !== 'SyncStatus' && c !== 'LastSyncedAt' && c !== 'BranchCode' && c !== 'BranchName' &&
                            centralColSet.has(c.toLowerCase())
                        );

                        const insertCols = [...colNames, 'BranchCode', 'BranchName', 'SyncStatus', 'LastSyncedAt'].map(c => `[${c}]`).join(', ');
                        const paramCols = [...colNames.map(c => `@${c}`), `'${config.currentBranchCode}'`, `N'${config.currentBranchName}'`, `'synced'`, 'GETDATE()'].join(', ');
                        const updateSet = colNames.filter(c => c !== idField).map(c => `[${c}] = @${c}`).join(', ');

                        const centralReq = centralPool.request();
                        for (const col of colNames) {
                            let val = row[col] === undefined ? null : row[col];
                            if (tableName === 'Expenses' && col === 'ExpenseType' && !val) {
                                val = 'عام';
                            }
                            centralReq.input(col, val);
                        }

                        await centralReq.query(`
                            IF NOT EXISTS (SELECT 1 FROM dbo.[${tableName}] WHERE [${idField}] = @${idField})
                                INSERT INTO dbo.[${tableName}] (${insertCols}) VALUES (${paramCols});
                            ELSE
                                UPDATE dbo.[${tableName}]
                                SET ${updateSet}, [BranchCode] = '${config.currentBranchCode}', [BranchName] = N'${config.currentBranchName}', [SyncStatus] = 'synced', [LastSyncedAt] = GETDATE()
                                WHERE [${idField}] = @${idField};
                        `);

                        // تعليم السجل في الفرع بأنه متزامن
                        await localPool.request()
                            .input('IdVal', sql.NVarChar(128), idVal)
                            .query(`UPDATE dbo.[${tableName}] SET SyncStatus = 'synced', LastSyncedAt = GETDATE() WHERE [${idField}] = @IdVal;`);

                        // مزامنة بنود وأصناف الوثيقة التابعة تلقائياً (Child Items Synchronization)
                        const childTableMap: Record<string, { table: string; foreignKey: string }> = {
                            SalesInvoices: { table: 'SalesInvoiceItems', foreignKey: 'InvoiceId' },
                            SalesReturns: { table: 'SalesReturnItems', foreignKey: 'ReturnId' },
                            PurchaseInvoices: { table: 'PurchaseInvoiceItems', foreignKey: 'PurchaseInvoiceId' },
                            PurchaseReturns: { table: 'PurchaseReturnItems', foreignKey: 'ReturnId' },
                            StockInRecords: { table: 'StockInRecordItems', foreignKey: 'StockInId' },
                            StockAdjustmentRecords: { table: 'StockAdjustmentItems', foreignKey: 'AdjustmentId' }
                        };

                        const childConfig = childTableMap[tableName];
                        if (childConfig) {
                            try {
                                const childRowsRes = await localPool.request()
                                    .input('ParentId', sql.NVarChar(64), row.Id)
                                    .query(`SELECT * FROM dbo.[${childConfig.table}] WHERE [${childConfig.foreignKey}] = @ParentId`);

                                if (childRowsRes.recordset.length > 0) {
                                    // حذف البنود القديمة في المركز لمنع تكرارها عند التعديل
                                    await centralPool.request()
                                        .input('ParentId', sql.NVarChar(64), row.Id)
                                        .query(`DELETE FROM dbo.[${childConfig.table}] WHERE [${childConfig.foreignKey}] = @ParentId`);

                                    // إدراج البنود المحدثة
                                    for (const cRow of childRowsRes.recordset) {
                                        const cCols = Object.keys(cRow).filter(k => k !== 'Id' && k !== 'SyncStatus' && k !== 'LastSyncedAt');
                                        const cInsert = cCols.join(', ');
                                        const cParams = cCols.map(k => `@${k}`).join(', ');

                                        const cReq = centralPool.request();
                                        for (const k of cCols) {
                                            cReq.input(k, cRow[k] === undefined ? null : cRow[k]);
                                        }
                                        await cReq.query(`
                                            INSERT INTO dbo.[${childConfig.table}] (${cInsert}, BranchCode, BranchName, LastSyncedAt)
                                            VALUES (${cParams}, '${config.currentBranchCode}', N'${config.currentBranchName}', GETDATE());
                                        `);
                                    }
                                }
                            } catch (cErr: any) {
                                console.warn(`Sync child items warning on ${childConfig.table}:`, cErr.message);
                            }
                        }

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

export interface TableRowComparison {
    tableName: string;
    displayName: string;
    category: string;
    branchRows: number;
    centralRows: number | null;
    diff: number;
    status: 'synced' | 'pending' | 'central_ahead' | 'empty' | 'unreachable';
}

export const TABLE_METADATA_MAP: Record<string, { name: string; category: string }> = {
    SalesInvoices: { name: 'فواتير المبيعات', category: 'فواتير وعمليات' },
    SalesInvoiceItems: { name: 'بنود فواتير المبيعات', category: 'فواتير وعمليات' },
    SalesReturns: { name: 'مردودات المبيعات', category: 'فواتير وعمليات' },
    SalesReturnItems: { name: 'بنود مردودات المبيعات', category: 'فواتير وعمليات' },
    PurchaseInvoices: { name: 'فواتير المشتريات', category: 'مشتريات وموردين' },
    PurchaseInvoiceItems: { name: 'بنود فواتير المشتريات', category: 'مشتريات وموردين' },
    PurchaseReturns: { name: 'مردودات المشتريات', category: 'مشتريات وموردين' },
    PurchaseReturnItems: { name: 'بنود مردودات المشتريات', category: 'مشتريات وموردين' },
    PurchaseOrders: { name: 'أوامر الشراء للموردين', category: 'مشتريات وموردين' },
    Suppliers: { name: 'بيانات الموردين', category: 'مشتريات وموردين' },
    SupplierPayments: { name: 'سندات صرف الموردين', category: 'حسابات ومالية' },
    Customers: { name: 'سجل العملاء', category: 'عملاء ومبيعات' },
    CustomerPayments: { name: 'سندات قبض العملاء', category: 'حسابات ومالية' },
    CustomerVisits: { name: 'سجل زيارات العملاء', category: 'عملاء ومبيعات' },
    Expenses: { name: 'المصروفات التشغيلية', category: 'حسابات ومالية' },
    ExceptionalIncomes: { name: 'الإيرادات الاستثنائية', category: 'حسابات ومالية' },
    CashAccounts: { name: 'الخزائن والحسابات البنكية', category: 'حسابات ومالية' },
    TreasuryTransactions: { name: 'حركات الخزينة والتحويلات', category: 'حسابات ومالية' },
    ProfitDistributions: { name: 'توزيعات الأرباح', category: 'حسابات ومالية' },
    Partners: { name: 'سجل الشركاء', category: 'حسابات ومالية' },
    PaymentMethods: { name: 'طرق الدفع والتحصيل', category: 'حسابات ومالية' },
    FixedAssets: { name: 'الأصول الثابتة', category: 'أصول وإهلاك' },
    DepreciationRecords: { name: 'قيود إهلاك الأصول', category: 'أصول وإهلاك' },
    Items: { name: 'الأصناف والمنتجات', category: 'مخازن وأصناف' },
    ItemCategories: { name: 'تصنيفات ومجموعات الأصناف', category: 'مخازن وأصناف' },
    ItemSections: { name: 'أقسام الأصناف', category: 'مخازن وأصناف' },
    ItemGroups: { name: 'الفئات العامة للأصناف', category: 'مخازن وأصناف' },
    ItemSubCategories1: { name: 'تصنيفات فرعية 1 للأصناف', category: 'مخازن وأصناف' },
    ItemSubCategories2: { name: 'تصنيفات فرعية 2 للأصناف', category: 'مخازن وأصناف' },
    ItemColors: { name: 'ألوان وموديلات الأصناف', category: 'مخازن وأصناف' },
    ItemSizes: { name: 'مقاسات وأحجام الأصناف', category: 'مخازن وأصناف' },
    PriceChangeLogs: { name: 'سجل تعديلات الأسعار', category: 'مخازن وأصناف' },
    Warehouses: { name: 'المستودعات والفروع', category: 'مخازن وأصناف' },
    InventorySections: { name: 'قواطع وأقسام المستودع', category: 'مخازن وأصناف' },
    InventoryZones: { name: 'مناطق وأرفف التخزين', category: 'مخازن وأصناف' },
    StockInRecords: { name: 'أذون إضافة واستلام مخزني', category: 'مخازن وأصناف' },
    StockInRecordItems: { name: 'بنود أذون الإضافة المخزنية', category: 'مخازن وأصناف' },
    StockOutRecords: { name: 'أذون صرف وتسليم مخزني', category: 'مخازن وأصناف' },
    StockTransferRecords: { name: 'تحويلات المخزون بين الفروع', category: 'مخازن وأصناف' },
    StockAdjustmentRecords: { name: 'تسويات الجرد المخزني', category: 'مخازن وأصناف' },
    StockAdjustmentItems: { name: 'بنود تسويات الجرد المخزني', category: 'مخازن وأصناف' },
    InventoryClosings: { name: 'تقفيلات الجرد الدوري', category: 'مخازن وأصناف' },
    StockIssuesToReps: { name: 'صرف بضاعة لعهدة المندوبين', category: 'توزيع ومندوبين' },
    StockReturnsFromReps: { name: 'مرتجع بضاعة من عهدة المندوبين', category: 'توزيع ومندوبين' },
    RepRemittances: { name: 'توريدات نقدية المندوبين', category: 'توزيع ومندوبين' },
    Sellers: { name: 'البائعين والمسوقين', category: 'توزيع ومندوبين' },
    DeliveryStaff: { name: 'مناديب التوصيل والدليفري', category: 'توزيع ومندوبين' },
    Employees: { name: 'سجل الموظفين', category: 'موارد بشرية' },
    EmployeeAdvances: { name: 'سلف الموظفين', category: 'موارد بشرية' },
    EmployeeAdjustments: { name: 'بدلات وخصومات الموظفين', category: 'موارد بشرية' },
    PayrollRecords: { name: 'مسيرات الرواتب الشهرية', category: 'موارد بشرية' },
    GratuityDistributions: { name: 'توزيعات مكافأة نهاية الخدمة', category: 'موارد بشرية' },
    GratuityLogs: { name: 'سجل مكافآت وبقشيش الكاشير', category: 'موارد بشرية' },
    PosSessions: { name: 'جلسات ودورات نقاط البيع', category: 'نقاط البيع' },
    PosTerminals: { name: 'شاشات وأجهزة الكاشير', category: 'نقاط البيع' },
    PosAuditLogs: { name: 'سجل رقابة وتدقيق الكاشير', category: 'نقاط البيع' },
    HeldInvoices: { name: 'الفواتير المعلقة بالكاشير', category: 'نقاط البيع' },
    Promotions: { name: 'العروض الترويجية والخصومات', category: 'نقاط البيع' },
    RestaurantTables: { name: 'طاولات وصالات المطعم', category: 'نقاط البيع' },
    BarcodeDesigns: { name: 'تصميمات ونماذج الباركود', category: 'إعدادات النظام' },
    Users: { name: 'المستخدمين وحسابات النظام', category: 'إعدادات النظام' },
    Roles: { name: 'الأدوار والصلاحيات', category: 'إعدادات النظام' },
    Licenses: { name: 'التراخيص والنسخ', category: 'إعدادات النظام' },
    AppSettings: { name: 'إعدادات النظام والمتغيرات', category: 'إعدادات النظام' },
    Counters: { name: 'عدادات الترقيم التلقائي', category: 'إعدادات النظام' },
    Targets: { name: 'الأهداف البيعية والعمولات', category: 'إعدادات النظام' },
    Requisitions: { name: 'طلبات الاحتياج والشراء', category: 'إعدادات النظام' },
    Notifications: { name: 'الإشعارات والتنبيهات', category: 'إعدادات النظام' },
    LoginHistory: { name: 'سجل الدخول والأمان', category: 'إعدادات النظام' }
};

export async function getTablesRowCountsComparison(): Promise<{
    centralConnected: boolean;
    centralDatabase: string;
    totalBranchRows: number;
    totalCentralRows: number;
    syncedTablesCount: number;
    diffTablesCount: number;
    tables: TableRowComparison[];
}> {
    const localPool = await getDbPool();
    const config = await getCentralConfig();

    // 1. Fetch Local DB Row Counts via DMV
    const localRes = await localPool.request().query(`
        SELECT t.name as TableName, SUM(p.rows) as RowCounts 
        FROM sys.tables t 
        JOIN sys.partitions p ON t.object_id = p.object_id 
        WHERE p.index_id IN (0, 1) AND t.is_ms_shipped = 0 
        GROUP BY t.name 
        ORDER BY t.name
    `);

    const localMap = new Map<string, number>();
    for (const r of localRes.recordset) {
        localMap.set(r.TableName, Number(r.RowCounts) || 0);
    }

    // 2. Fetch Central DB Row Counts if reachable
    let centralConnected = false;
    const centralMap = new Map<string, number>();
    let centralPool: sql.ConnectionPool | null = null;

    try {
        centralPool = await connectToCentral(config);
        const centralRes = await centralPool.request().query(`
            SELECT t.name as TableName, SUM(p.rows) as RowCounts 
            FROM sys.tables t 
            JOIN sys.partitions p ON t.object_id = p.object_id 
            WHERE p.index_id IN (0, 1) AND t.is_ms_shipped = 0 
            GROUP BY t.name 
            ORDER BY t.name
        `);
        for (const r of centralRes.recordset) {
            centralMap.set(r.TableName, Number(r.RowCounts) || 0);
        }
        centralConnected = true;
        await centralPool.close();
    } catch {
        if (centralPool) {
            try { await centralPool.close(); } catch {}
        }
        centralConnected = false;
    }

    // 3. Assemble comparison for all tables
    const allTableNames = Array.from(new Set([
        ...Object.keys(TABLE_METADATA_MAP),
        ...Array.from(localMap.keys()),
        ...Array.from(centralMap.keys())
    ])).sort();

    let totalBranchRows = 0;
    let totalCentralRows = 0;
    let syncedTablesCount = 0;
    let diffTablesCount = 0;

    const tables: TableRowComparison[] = allTableNames.map(tableName => {
        const meta = TABLE_METADATA_MAP[tableName] || { name: tableName, category: 'عام' };
        const branchRows = localMap.get(tableName) || 0;
        const centralRows = centralConnected ? (centralMap.get(tableName) ?? 0) : null;
        totalBranchRows += branchRows;
        if (centralRows !== null) {
            totalCentralRows += centralRows;
        }

        let diff = 0;
        let status: TableRowComparison['status'] = 'synced';

        if (!centralConnected) {
            status = 'unreachable';
        } else if (branchRows === 0 && centralRows === 0) {
            status = 'empty';
            syncedTablesCount++;
        } else if (branchRows === centralRows) {
            status = 'synced';
            syncedTablesCount++;
        } else if (branchRows > (centralRows || 0)) {
            diff = branchRows - (centralRows || 0);
            status = 'pending';
            diffTablesCount++;
        } else {
            diff = (centralRows || 0) - branchRows;
            status = 'central_ahead';
            diffTablesCount++;
        }

        return {
            tableName,
            displayName: meta.name,
            category: meta.category,
            branchRows,
            centralRows,
            diff,
            status
        };
    });

    return {
        centralConnected,
        centralDatabase: config.centralDatabase,
        totalBranchRows,
        totalCentralRows,
        syncedTablesCount,
        diffTablesCount,
        tables
    };
}

