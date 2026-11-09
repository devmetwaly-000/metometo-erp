/**
 * @fileOverview محرك المزامنة المركزي المتقدم المبني على التوقيت الزمني وتتبع التعديلات (Timestamp & Watermark Sync Engine)
 * يتولى الربط والتبادل الذكي بين قاعدة بيانات الفرع المحلية والسيرفر المركزي للإدارة:
 * 1. تتبع التعديلات والتوقيتات الزمنية (UpdatedAt, LastSyncedAt, CreatedAt) على مستوى كل جدول.
 * 2. جدول تتبع المزامنة المركزي في قاعدة البيانات: dbo.SyncTrackingMatrix (يخزن لكل جدول آخر تعديل وآخر مزامنة ناجحة).
 * 3. المزامنة الذكية القائمة على التحقق من وجود السطر (إذا وجد يُحدث، وإذا لم يوجد يُضاف - Upsert / Merge).
 * 4. دعم بيئة الفروع المتعددة: الإدارة تستقبل بيانات فروع متعددة بدون خلط الأعداد.
 */

import sql from 'mssql';
import { getDbPool } from '@/lib/db';

export interface CentralSyncConfig {
    systemRole?: 'branch' | 'central';
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
    systemRole: 'branch',
    currentBranchId: '-OmnkFba_GsEb0rfdzyA',
    currentBranchCode: '900',
    currentBranchName: 'الفرع الرأيسي',
    centralServerIp: '10.110.16.16',
    centralSqlPort: 1433,
    centralDatabase: 'MultiBranchPOS_Central_DB',
    centralUsername: 'gmlogins',
    centralPassword: 'retgomladb',
    autoSync: true,
    autoSyncIntervalMinutes: 5,
    lastSyncTime: null,
    lastSyncStatus: 'ready'
};

export type SyncDirection = 'push' | 'pull' | 'bidirectional';

export interface TableSyncMeta {
    name: string;
    category: string;
    direction: SyncDirection;
    idColumn: string;
    childTable?: string;
    foreignKey?: string;
}

/**
 * خريطة بيانات ومحددات جميع جداول النظام الـ 69
 */
export const TABLE_METADATA_MAP: Record<string, TableSyncMeta> = {
    // 1. فواتير وعمليات (فواتير، مرتجعات، كاشير)
    SalesInvoices: { name: 'فواتير المبيعات', category: 'فواتير وعمليات', direction: 'push', idColumn: 'Id', childTable: 'SalesInvoiceItems', foreignKey: 'InvoiceId' },
    SalesInvoiceItems: { name: 'بنود فواتير المبيعات', category: 'فواتير وعمليات', direction: 'push', idColumn: 'Id' },
    SalesReturns: { name: 'مردودات المبيعات', category: 'فواتير وعمليات', direction: 'push', idColumn: 'Id', childTable: 'SalesReturnItems', foreignKey: 'ReturnId' },
    SalesReturnItems: { name: 'بنود مردودات المبيعات', category: 'فواتير وعمليات', direction: 'push', idColumn: 'Id' },
    HeldInvoices: { name: 'الفواتير المعلقة بالكاشير', category: 'فواتير وعمليات', direction: 'push', idColumn: 'Id' },

    // 2. مشتريات وموردين
    PurchaseInvoices: { name: 'فواتير المشتريات', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id', childTable: 'PurchaseInvoiceItems', foreignKey: 'PurchaseInvoiceId' },
    PurchaseInvoiceItems: { name: 'بنود فواتير المشتريات', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id' },
    PurchaseReturns: { name: 'مردودات المشتريات', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id', childTable: 'PurchaseReturnItems', foreignKey: 'ReturnId' },
    PurchaseReturnItems: { name: 'بنود مردودات المشتريات', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id' },
    PurchaseOrders: { name: 'أوامر الشراء للموردين', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id' },
    Suppliers: { name: 'سجل الموردين', category: 'مشتريات وموردين', direction: 'bidirectional', idColumn: 'Id' },
    SupplierPayments: { name: 'سندات صرف الموردين', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id' },

    // 3. عملاء ومبيعات
    Customers: { name: 'سجل العملاء', category: 'عملاء ومبيعات', direction: 'bidirectional', idColumn: 'Id' },
    CustomerPayments: { name: 'سندات قبض العملاء', category: 'عملاء ومبيعات', direction: 'push', idColumn: 'Id' },
    CustomerVisits: { name: 'سجل زيارات العملاء', category: 'عملاء ومبيعات', direction: 'push', idColumn: 'Id' },

    // 4. حسابات ومالية
    CashAccounts: { name: 'الخزائن والحسابات البنكية', category: 'حسابات ومالية', direction: 'bidirectional', idColumn: 'Id' },
    TreasuryTransactions: { name: 'حركات الخزينة والتحويلات', category: 'حسابات ومالية', direction: 'push', idColumn: 'Id' },
    Expenses: { name: 'المصروفات التشغيلية', category: 'حسابات ومالية', direction: 'push', idColumn: 'Id' },
    ExceptionalIncomes: { name: 'الإيرادات الاستثنائية', category: 'حسابات ومالية', direction: 'push', idColumn: 'Id' },
    ProfitDistributions: { name: 'توزيعات الأرباح', category: 'حسابات ومالية', direction: 'push', idColumn: 'Id' },
    Partners: { name: 'سجل الشركاء والمساهمين', category: 'حسابات ومالية', direction: 'bidirectional', idColumn: 'Id' },
    PaymentMethods: { name: 'طرق الدفع والتحصيل', category: 'حسابات ومالية', direction: 'bidirectional', idColumn: 'Id' },

    // 5. أصول وإهلاك
    FixedAssets: { name: 'الأصول الثابتة', category: 'أصول وإهلاك', direction: 'bidirectional', idColumn: 'Id' },
    DepreciationRecords: { name: 'قيود إهلاك الأصول', category: 'أصول وإهلاك', direction: 'push', idColumn: 'Id' },

    // 6. مخازن وأصناف
    Items: { name: 'الأصناف والمنتجات', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    ItemCategories: { name: 'تصنيفات ومجموعات الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    ItemSections: { name: 'أقسام الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    ItemGroups: { name: 'الفئات العامة للأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    ItemSubCategories1: { name: 'تصنيفات فرعية 1 للأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    ItemSubCategories2: { name: 'تصنيفات فرعية 2 للأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    ItemColors: { name: 'ألوان وموديلات الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    ItemSizes: { name: 'مقاسات وأحجام الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    PriceChangeLogs: { name: 'سجل تعديلات الأسعار', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    Warehouses: { name: 'المستودعات والفروع', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    InventorySections: { name: 'قواطع وأقسام المستودع', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    InventoryZones: { name: 'مناطق وأرفف التخزين', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id' },
    StockInRecords: { name: 'أذون إضافة واستلام مخزني', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id', childTable: 'StockInRecordItems', foreignKey: 'StockInId' },
    StockInRecordItems: { name: 'بنود أذون الإضافة المخزنية', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id' },
    StockOutRecords: { name: 'أذون صرف وتسليم مخزني', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id' },
    StockTransferRecords: { name: 'تحويلات المخزون بين الفروع', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id' },
    StockAdjustmentRecords: { name: 'تسويات الجرد المخزني', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id', childTable: 'StockAdjustmentItems', foreignKey: 'AdjustmentId' },
    StockAdjustmentItems: { name: 'بنود تسويات الجرد المخزني', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id' },
    InventoryClosings: { name: 'تقفيلات الجرد الدوري', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id' },

    // 7. توزيع ومندوبين
    StockIssuesToReps: { name: 'صرف بضاعة لعهدة المندوبين', category: 'توزيع ومندوبين', direction: 'push', idColumn: 'Id' },
    StockReturnsFromReps: { name: 'مرتجع بضاعة من عهدة المندوبين', category: 'توزيع ومندوبين', direction: 'push', idColumn: 'Id' },
    RepRemittances: { name: 'توريدات نقدية المندوبين', category: 'توزيع ومندوبين', direction: 'push', idColumn: 'Id' },
    Sellers: { name: 'البائعين والمسوقين', category: 'توزيع ومندوبين', direction: 'bidirectional', idColumn: 'Id' },
    DeliveryStaff: { name: 'مناديب التوصيل والدليفري', category: 'توزيع ومندوبين', direction: 'bidirectional', idColumn: 'Id' },

    // 8. موارد بشرية
    Employees: { name: 'سجل الموظفين', category: 'موارد بشرية', direction: 'bidirectional', idColumn: 'Id' },
    EmployeeAdvances: { name: 'سلف الموظفين', category: 'موارد بشرية', direction: 'push', idColumn: 'Id' },
    EmployeeAdjustments: { name: 'بدلات وخصومات الموظفين', category: 'موارد بشرية', direction: 'push', idColumn: 'Id' },
    PayrollRecords: { name: 'مسيرات الرواتب الشهرية', category: 'موارد بشرية', direction: 'push', idColumn: 'Id' },
    GratuityDistributions: { name: 'توزيعات مكافأة نهاية الخدمة', category: 'موارد بشرية', direction: 'push', idColumn: 'Id' },
    GratuityLogs: { name: 'سجل مكافآت وبقشيش الكاشير', category: 'موارد بشرية', direction: 'push', idColumn: 'Id' },

    // 9. نقاط البيع
    PosSessions: { name: 'جلسات ودورات نقاط البيع', category: 'نقاط البيع', direction: 'push', idColumn: 'Id' },
    PosTerminals: { name: 'شاشات وأجهزة الكاشير', category: 'نقاط البيع', direction: 'bidirectional', idColumn: 'Id' },
    PosAuditLogs: { name: 'سجل رقابة وتدقيق الكاشير', category: 'نقاط البيع', direction: 'push', idColumn: 'Id' },
    Promotions: { name: 'العروض الترويجية والخصومات', category: 'نقاط البيع', direction: 'bidirectional', idColumn: 'Id' },
    RestaurantTables: { name: 'طاولات وصالات المطعم', category: 'نقاط البيع', direction: 'bidirectional', idColumn: 'Id' },

    // 10. إعدادات النظام ومستخدمين
    BarcodeDesigns: { name: 'تصميمات ونماذج الباركود', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'Id' },
    Users: { name: 'المستخدمين وحسابات الدخول', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'Id' },
    Roles: { name: 'الأدوار ومصفوفة الصلاحيات', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'Id' },
    Licenses: { name: 'التراخيص والنسخ المرخصة', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'Id' },
    AppSettings: { name: 'إعدادات النظام والمتغيرات', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'SettingKey' },
    Counters: { name: 'عدادات الترقيم التلقائي', category: 'إعدادات النظام', direction: 'push', idColumn: 'Name' },
    Targets: { name: 'الأهداف البيعية والعمولات', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'Id' },
    Requisitions: { name: 'طلبات الاحتياج والشراء', category: 'إعدادات النظام', direction: 'push', idColumn: 'Id' },
    Notifications: { name: 'الإشعارات والتنبيهات', category: 'إعدادات النظام', direction: 'push', idColumn: 'Id' },
    LoginHistory: { name: 'سجل الدخول والأمان', category: 'إعدادات النظام', direction: 'push', idColumn: 'Id' }
};

/**
 * خريطة المفاتيح الأجنبية للجداول الفرعية ذات عمود Identity
 */
export const CHILD_TABLE_FK_MAP: Record<string, string> = {
    SalesInvoiceItems: 'InvoiceId',
    SalesReturnItems: 'ReturnId',
    PurchaseInvoiceItems: 'PurchaseInvoiceId',
    PurchaseReturnItems: 'ReturnId',
    StockInRecordItems: 'StockInId',
    StockAdjustmentItems: 'AdjustmentId'
};

/**
 * بنية عنصر مصفوفة المزامنة لكل جدول
 */
export interface TableSyncMatrixItem {
    tableName: string;
    displayName: string;
    category: string;
    direction: SyncDirection;

    // تواريخ التعديل والمزامنة (Timestamps)
    lastLocalModified: string | null;     // آخر timestamp في الجدول
    lastSyncedAt: string | null;          // آخر timestamp تم مزامنته بنجاح في الإدارة
    lastCentralModified: string | null;   // آخر timestamp في الإدارة

    // أعداد السطور والتعديلات
    localBranchRows: number;
    pendingPushCount: number;
    centralBranchRows: number | null;
    centralTotalRows: number | null;
    pendingPullCount: number;

    // الحالة التفاعلية
    syncState: 'synced' | 'pending_push' | 'pending_pull' | 'pending_both' | 'empty' | 'unreachable';
    syncStateLabel: string;
}

export interface TablesSyncMatrixResponse {
    centralConnected: boolean;
    centralServer: string;
    centralDatabase: string;
    currentBranchCode: string;
    currentBranchName: string;
    lastSyncTimestamp: string | null;

    // مؤشرات KPI الكلية
    totalPendingPush: number;
    totalPendingPull: number;
    syncedTablesCount: number;
    pendingTablesCount: number;
    totalTablesCount: number;

    tables: TableSyncMatrixItem[];
}

/**
 * جلب إعدادات السيرفر المركزي من قاعدة البيانات المحلية
 */
export async function getCentralConfig(): Promise<CentralSyncConfig> {
    try {
        const pool = await getDbPool();
        const res = await pool.request()
            .input('Key', sql.NVarChar(100), 'central_sync')
            .query('SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = @Key');

        const roleRes = await pool.request()
            .input('RKey', sql.NVarChar(100), 'system_role')
            .query('SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = @RKey');

        const explicitRole = roleRes.recordset[0]?.SettingValue as ('branch' | 'central' | undefined);

        if (res.recordset.length > 0 && res.recordset[0].SettingValue) {
            try {
                const parsed = JSON.parse(res.recordset[0].SettingValue);
                return { 
                    ...DEFAULT_CONFIG, 
                    ...parsed,
                    systemRole: explicitRole || parsed.systemRole || DEFAULT_CONFIG.systemRole
                };
            } catch {
                return { ...DEFAULT_CONFIG, systemRole: explicitRole || DEFAULT_CONFIG.systemRole };
            }
        }
        return { ...DEFAULT_CONFIG, systemRole: explicitRole || DEFAULT_CONFIG.systemRole };
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
                INSERT INTO dbo.AppSettings (SettingKey, SettingValue, SyncStatus, LastSyncedAt) VALUES (@Key, @Val, 'synced', SYSUTCDATETIME());
            ELSE
                UPDATE dbo.AppSettings SET SettingValue = @Val, SyncStatus = 'synced', LastSyncedAt = SYSUTCDATETIME() WHERE SettingKey = @Key;
        `);

    return updated;
}

/**
 * إنشاء اتصال منفصل بالسيرفر المركزي للإدارة
 */
export async function connectToCentral(config: CentralSyncConfig, targetDatabase?: string): Promise<sql.ConnectionPool> {
    let cleanServer = (config.centralServerIp || '10.110.16.16').trim();
    let port = Number(config.centralSqlPort) || 1433;

    if (cleanServer.includes(':')) {
        const [hostPart, portPart] = cleanServer.split(':');
        cleanServer = hostPart.trim();
        port = parseInt(portPart, 10) || port;
    }
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
            connectTimeout: 9000
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
    databaseExists?: boolean;
    message?: string;
    error?: string;
}> {
    const current = await getCentralConfig();
    const cleanOverride = { ...(configOverride || {}) };
    
    if (!cleanOverride.centralPassword && current.centralPassword) {
        cleanOverride.centralPassword = current.centralPassword;
    }

    const config: CentralSyncConfig = { ...current, ...cleanOverride };
    const startTime = Date.now();
    let centralPool: sql.ConnectionPool | null = null;

    try {
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
        if (errMsg.toLowerCase().includes('cannot open database') || errMsg.includes('4060')) {
            try {
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
                    message: `تم الاتصال بالسيرفر (${config.centralServerIp}) بنجاح! لكن قاعدة البيانات (${config.centralDatabase}) غير موجودة بعد.`
                };
            } catch {}
        }

        let userFriendlyError = errMsg;
        if (errMsg.toLowerCase().includes('failed to connect') || errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('etimedout')) {
            userFriendlyError = `تعذر الاتصال بعنوان السيرفر (${config.centralServerIp}:${config.centralSqlPort}). تأكد من أن السيرفر يعمل وتفعيل TCP/IP وجدار الحماية.`;
        } else if (errMsg.toLowerCase().includes('login failed') || errMsg.toLowerCase().includes('elogin')) {
            userFriendlyError = `فشل تسجيل الدخول للمستخدم (${config.centralUsername}). يرجى التحقق من صحة كلمة المرور وتفعيل Mixed Mode في SQL Server.`;
        }

        return {
            success: false,
            error: userFriendlyError
        };
    }
}

/**
 * التأكد من وجود جدول dbo.SyncTrackingMatrix وتحديثه في قاعدة البيانات
 */
async function ensureSyncTrackingMatrixTable(pool: sql.ConnectionPool) {
    await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncTrackingMatrix')
        BEGIN
            CREATE TABLE dbo.SyncTrackingMatrix (
                TableName NVARCHAR(128) NOT NULL,
                TableDisplayName NVARCHAR(255) NOT NULL,
                Category NVARCHAR(100) NOT NULL,
                SyncDirection NVARCHAR(30) NOT NULL DEFAULT ('push'),
                LastLocalTimestamp DATETIME2 NULL,
                LastSyncedTimestamp DATETIME2 NULL,
                LastCentralTimestamp DATETIME2 NULL,
                LocalRowsCount INT NOT NULL DEFAULT 0,
                CentralBranchRowsCount INT NULL DEFAULT 0,
                CentralTotalRowsCount INT NULL DEFAULT 0,
                PendingChangesCount INT NOT NULL DEFAULT 0,
                SyncStatus NVARCHAR(50) NOT NULL DEFAULT ('pending'),
                LastSyncCheckAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                CONSTRAINT PK_SyncTrackingMatrix PRIMARY KEY CLUSTERED (TableName)
            );
        END
    `);
}

/**
 * استخراج مصفوفة المزامنة الدقيقة لجميع الجداول وتحديث جدول dbo.SyncTrackingMatrix في قاعدة البيانات
 */
export async function getTablesSyncMatrix(): Promise<TablesSyncMatrixResponse> {
    const localPool = await getDbPool();
    const config = await getCentralConfig();
    const branchCode = config.currentBranchCode || '900';

    await ensureSyncTrackingMatrixTable(localPool);

    // 1. استعلام محلي موحد فائق السرعة
    const localTableEntries = Object.keys(TABLE_METADATA_MAP);
    const localUnionQueries = localTableEntries.map(table => `
        SELECT 
            '${table}' as tableName,
            COUNT(*) as localRows,
            SUM(CASE WHEN SyncStatus = 'pending' OR LastSyncedAt IS NULL OR (UpdatedAt > LastSyncedAt AND LastSyncedAt IS NOT NULL) THEN 1 ELSE 0 END) as pendingPush,
            MAX(UpdatedAt) as lastLocalModified,
            MAX(LastSyncedAt) as lastSyncedAt
        FROM dbo.[${table}]
    `).join(' UNION ALL ');

    const localRes = await localPool.request().query(localUnionQueries);
    const localDataMap = new Map<string, {
        localRows: number;
        pendingPush: number;
        lastLocalModified: string | null;
        lastSyncedAt: string | null;
    }>();

    for (const row of localRes.recordset) {
        localDataMap.set(row.tableName, {
            localRows: Number(row.localRows) || 0,
            pendingPush: Number(row.pendingPush) || 0,
            lastLocalModified: row.lastLocalModified ? new Date(row.lastLocalModified).toISOString() : null,
            lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt).toISOString() : null
        });
    }

    // 2. استعلام السيرفر المركزي
    let centralConnected = false;
    let centralPool: sql.ConnectionPool | null = null;
    const centralDataMap = new Map<string, {
        centralTotalRows: number;
        centralBranchRows: number;
        lastCentralModified: string | null;
    }>();

    try {
        centralPool = await connectToCentral(config);
        await ensureSyncTrackingMatrixTable(centralPool);
        
        const tablesInCentralRes = await centralPool.request().query(`
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'
        `);
        const centralExistingTables = new Set(tablesInCentralRes.recordset.map(r => r.TABLE_NAME));

        const centralValidTables = localTableEntries.filter(t => centralExistingTables.has(t));
        if (centralValidTables.length > 0) {
            const centralUnionQueries = centralValidTables.map(table => `
                SELECT 
                    '${table}' as tableName,
                    COUNT(*) as centralTotalRows,
                    SUM(CASE WHEN BranchCode = '${branchCode}' THEN 1 ELSE 0 END) as centralBranchRows,
                    MAX(UpdatedAt) as lastCentralModified
                FROM dbo.[${table}]
            `).join(' UNION ALL ');

            const centralRes = await centralPool.request().query(centralUnionQueries);
            for (const row of centralRes.recordset) {
                centralDataMap.set(row.tableName, {
                    centralTotalRows: Number(row.centralTotalRows) || 0,
                    centralBranchRows: Number(row.centralBranchRows) || 0,
                    lastCentralModified: row.lastCentralModified ? new Date(row.lastCentralModified).toISOString() : null
                });
            }
        }

        centralConnected = true;
        await centralPool.close();
    } catch {
        if (centralPool) {
            try { await centralPool.close(); } catch {}
        }
        centralConnected = false;
    }

    // 3. تركيب المصفوفة وتحديث جدول dbo.SyncTrackingMatrix في SQL
    let totalPendingPush = 0;
    let totalPendingPull = 0;
    let syncedTablesCount = 0;
    let pendingTablesCount = 0;

    const tables: TableSyncMatrixItem[] = localTableEntries.map(tableName => {
        const meta = TABLE_METADATA_MAP[tableName];
        const local = localDataMap.get(tableName) || {
            localRows: 0,
            pendingPush: 0,
            lastLocalModified: null,
            lastSyncedAt: null
        };
        const central = centralDataMap.get(tableName) || null;

        totalPendingPush += local.pendingPush;

        let pendingPullCount = 0;
        if (central && (meta.direction === 'pull' || meta.direction === 'bidirectional')) {
            if (central.lastCentralModified) {
                if (!local.lastSyncedAt || new Date(central.lastCentralModified) > new Date(local.lastSyncedAt)) {
                    pendingPullCount = Math.max(0, central.centralTotalRows - local.localRows);
                    if (pendingPullCount === 0 && central.lastCentralModified !== local.lastLocalModified) {
                        pendingPullCount = 1;
                    }
                }
            }
        }
        totalPendingPull += pendingPullCount;

        let syncState: TableSyncMatrixItem['syncState'] = 'synced';
        let syncStateLabel = 'متطابق ومتزامن ✅';

        if (!centralConnected) {
            syncState = 'unreachable';
            syncStateLabel = 'السيرفر غير متصل ⚠️';
        } else if (local.localRows === 0 && (!central || central.centralTotalRows === 0)) {
            syncState = 'empty';
            syncStateLabel = 'لا توجد بيانات ⚪';
            syncedTablesCount++;
        } else if (local.pendingPush > 0 && pendingPullCount > 0) {
            syncState = 'pending_both';
            syncStateLabel = 'تعديلات وسحب معلق 🔁';
            pendingTablesCount++;
        } else if (local.pendingPush > 0) {
            syncState = 'pending_push';
            syncStateLabel = `بانتظار الرفع (${local.pendingPush}) ⬆️`;
            pendingTablesCount++;
        } else if (pendingPullCount > 0) {
            syncState = 'pending_pull';
            syncStateLabel = `تحديثات جاهزة للسحب (${pendingPullCount}) ⬇️`;
            pendingTablesCount++;
        } else {
            syncState = 'synced';
            syncStateLabel = 'متطابق ومحدث ✅';
            syncedTablesCount++;
        }

        return {
            tableName,
            displayName: meta.name,
            category: meta.category,
            direction: meta.direction,
            lastLocalModified: local.lastLocalModified,
            lastSyncedAt: local.lastSyncedAt,
            lastCentralModified: central?.lastCentralModified || null,
            localBranchRows: local.localRows,
            pendingPushCount: local.pendingPush,
            centralBranchRows: central ? central.centralBranchRows : null,
            centralTotalRows: central ? central.centralTotalRows : null,
            pendingPullCount,
            syncState,
            syncStateLabel
        };
    });

    // حفظ وتحديث بيانات كل جدول في dbo.SyncTrackingMatrix في قاعدة البيانات
    try {
        for (const t of tables) {
            const maxLocal = t.lastLocalModified ? `'${t.lastLocalModified}'` : 'NULL';
            const maxSynced = t.lastSyncedAt ? `'${t.lastSyncedAt}'` : 'NULL';
            const maxCentral = t.lastCentralModified ? `'${t.lastCentralModified}'` : 'NULL';
            const cBranch = t.centralBranchRows !== null ? t.centralBranchRows : 'NULL';
            const cTotal = t.centralTotalRows !== null ? t.centralTotalRows : 'NULL';

            await localPool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM dbo.SyncTrackingMatrix WHERE TableName = '${t.tableName}')
                BEGIN
                    INSERT INTO dbo.SyncTrackingMatrix (
                        TableName, TableDisplayName, Category, SyncDirection,
                        LastLocalTimestamp, LastSyncedTimestamp, LastCentralTimestamp,
                        LocalRowsCount, CentralBranchRowsCount, CentralTotalRowsCount,
                        PendingChangesCount, SyncStatus, LastSyncCheckAt, UpdatedAt
                    ) VALUES (
                        '${t.tableName}', N'${t.displayName}', N'${t.category}', '${t.direction}',
                        ${maxLocal}, ${maxSynced}, ${maxCentral},
                        ${t.localBranchRows}, ${cBranch}, ${cTotal},
                        ${t.pendingPushCount}, '${t.syncState}', SYSUTCDATETIME(), SYSUTCDATETIME()
                    );
                END
                ELSE
                BEGIN
                    UPDATE dbo.SyncTrackingMatrix
                    SET TableDisplayName = N'${t.displayName}',
                        Category = N'${t.category}',
                        SyncDirection = '${t.direction}',
                        LastLocalTimestamp = ${maxLocal},
                        LastSyncedTimestamp = ${maxSynced},
                        LastCentralTimestamp = ${maxCentral},
                        LocalRowsCount = ${t.localBranchRows},
                        CentralBranchRowsCount = ${cBranch},
                        CentralTotalRowsCount = ${cTotal},
                        PendingChangesCount = ${t.pendingPushCount},
                        SyncStatus = '${t.syncState}',
                        LastSyncCheckAt = SYSUTCDATETIME()
                    WHERE TableName = '${t.tableName}';
                END
            `);
        }
    } catch (e: any) {
        console.warn('SyncTrackingMatrix update warning:', e.message);
    }

    return {
        centralConnected,
        centralServer: `${config.centralServerIp}:${config.centralSqlPort}`,
        centralDatabase: config.centralDatabase,
        currentBranchCode: branchCode,
        currentBranchName: config.currentBranchName || 'الفرع الرأيسي',
        lastSyncTimestamp: config.lastSyncTime || null,
        totalPendingPush,
        totalPendingPull,
        syncedTablesCount,
        pendingTablesCount,
        totalTablesCount: tables.length,
        tables
    };
}

/**
 * تشغيل دورة المزامنة الذكية ثنائية الاتجاه:
 * "إذا كان السطر موجوداً قم بتحديثه، وإذا لم يكن موجوداً قم بإضافته" (Upsert)
 */
export async function runFullSync(options?: {
    mode?: 'all' | 'push' | 'pull';
    targetTable?: string;
}): Promise<{
    success: boolean;
    pushedCount: number;
    pulledCount: number;
    error?: string;
    details?: string;
}> {
    const localPool = await getDbPool();
    const config = await getCentralConfig();
    const mode = options?.mode || 'all';

    let centralPool: sql.ConnectionPool | null = null;
    let totalPushed = 0;
    let totalPulled = 0;

    try {
        await saveCentralConfig({ lastSyncStatus: 'in_progress' });
        centralPool = await connectToCentral(config);

        await ensureSyncTrackingMatrixTable(localPool);
        await ensureSyncTrackingMatrixTable(centralPool);

        // وضع CONTEXT_INFO لمنع مشغلات التعديل من إعادة تعليم السجلات كـ pending أثناء دورة المزامنة
        await localPool.request().query("SET CONTEXT_INFO 0x53594E43;");
        await centralPool.request().query("SET CONTEXT_INFO 0x53594E43;");

        const tableEntries = Object.entries(TABLE_METADATA_MAP).filter(([tableName]) => {
            if (options?.targetTable) return tableName === options.targetTable;
            return true;
        });

        // -------------------------------------------------------------
        // المرحلة 1: رفع التعديلات والحركات من الفرع للإدارة (Push: Insert or Update)
        // -------------------------------------------------------------
        if (mode === 'all' || mode === 'push') {
            const pushTables = tableEntries.filter(([_, meta]) => meta.direction === 'push' || meta.direction === 'bidirectional');

            for (const [tableName, meta] of pushTables) {
                try {
                    const idCol = meta.idColumn;

                    // جلب السجلات غير المزامنة أو التي تم تعديلها بعد آخر مزامنة
                    const pendingRes = await localPool.request()
                        .input('BranchCode', sql.NVarChar(50), config.currentBranchCode)
                        .query(`
                            SELECT TOP 300 * FROM dbo.[${tableName}]
                            WHERE (SyncStatus = 'pending' OR LastSyncedAt IS NULL OR (UpdatedAt > LastSyncedAt AND LastSyncedAt IS NOT NULL))
                              AND (BranchCode = @BranchCode OR BranchCode IS NULL)
                            ORDER BY [UpdatedAt] ASC
                        `);

                    const rows = pendingRes.recordset;
                    if (rows.length > 0) {
                        // محاذاة الأعمدة بالسيرفر المركزي
                        const centralColsRes = await centralPool.request()
                            .input('Tbl', sql.NVarChar(128), tableName)
                            .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @Tbl`);
                        const centralColSet = new Set(centralColsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

                        for (const col of Object.keys(rows[0])) {
                            if (!centralColSet.has(col.toLowerCase())) {
                                try {
                                    await centralPool.request().query(`ALTER TABLE dbo.[${tableName}] ADD [${col}] NVARCHAR(MAX) NULL;`);
                                    centralColSet.add(col.toLowerCase());
                                } catch {}
                            }
                        }

                        let lastPushedTimestamp: Date | null = null;
                        const isChildTableFk = CHILD_TABLE_FK_MAP[tableName];

                        for (const row of rows) {
                            const idVal = row[idCol];
                            if (idVal === undefined || idVal === null) continue;

                            const rowUpdatedAt = row.UpdatedAt ? new Date(row.UpdatedAt) : new Date();
                            if (!lastPushedTimestamp || rowUpdatedAt > lastPushedTimestamp) {
                                lastPushedTimestamp = rowUpdatedAt;
                            }

                            // تصفية الأعمدة المتوافقة واستبعاد Id إذا كان الجدول فرعياً به Identity
                            const colNames = Object.keys(row).filter(c => 
                                (isChildTableFk ? c !== 'Id' : true) &&
                                c !== 'SyncStatus' && c !== 'LastSyncedAt' && c !== 'BranchCode' && c !== 'BranchName' &&
                                centralColSet.has(c.toLowerCase())
                            );

                            const insertCols = [...colNames, 'BranchCode', 'BranchName', 'SyncStatus', 'LastSyncedAt'].map(c => `[${c}]`).join(', ');
                            const paramCols = [...colNames.map(c => `@${c}`), `'${config.currentBranchCode}'`, `N'${config.currentBranchName}'`, `'synced'`, 'SYSUTCDATETIME()'].join(', ');

                            const centralReq = centralPool.request();
                            for (const col of colNames) {
                                let val = row[col] === undefined ? null : row[col];
                                if (tableName === 'Expenses' && col === 'ExpenseType' && !val) {
                                    val = 'عام';
                                }
                                if ((tableName === 'PurchaseReturns' || tableName === 'PurchaseInvoices') && col === 'SupplierName' && !val) {
                                    val = 'مورد عام';
                                }
                                centralReq.input(col, val);
                            }

                            if (isChildTableFk) {
                                // معالجة الجداول الفرعية ذات عمود Identity
                                const fk = isChildTableFk;
                                const updateSet = colNames.filter(c => c !== fk && c !== 'ItemId').map(c => `[${c}] = @${c}`).join(', ');
                                await centralReq.query(`
                                    IF EXISTS (
                                        SELECT 1 FROM dbo.[${tableName}] 
                                        WHERE [${fk}] = @${fk} 
                                          AND [ItemId] = @ItemId 
                                          AND ([BranchCode] = '${config.currentBranchCode}' OR [BranchCode] IS NULL)
                                    )
                                    BEGIN
                                        UPDATE dbo.[${tableName}]
                                        SET ${updateSet}, 
                                            [BranchCode] = '${config.currentBranchCode}', 
                                            [BranchName] = N'${config.currentBranchName}', 
                                            [SyncStatus] = 'synced', 
                                            [LastSyncedAt] = SYSUTCDATETIME()
                                        WHERE [${fk}] = @${fk} 
                                          AND [ItemId] = @ItemId 
                                          AND ([BranchCode] = '${config.currentBranchCode}' OR [BranchCode] IS NULL);
                                    END
                                    ELSE
                                    BEGIN
                                        INSERT INTO dbo.[${tableName}] (${insertCols}) 
                                        VALUES (${paramCols});
                                    END
                                `);
                            } else {
                                // التنفيذ الذكي للجداول العادية: إذا كان موجوداً قم بتحديثه، وإذا لم يكن موجوداً قم بإضافته
                                const isUsersTable = tableName === 'Users';
                                const checkCondition = isUsersTable 
                                    ? `([Id] = @Id OR [LoginName] = @LoginName)`
                                    : `[${idCol}] = @${idCol}`;

                                const updateSet = colNames.filter(c => c !== idCol).map(c => `[${c}] = @${c}`).join(', ');
                                await centralReq.query(`
                                    IF EXISTS (SELECT 1 FROM dbo.[${tableName}] WHERE ${checkCondition})
                                    BEGIN
                                        UPDATE dbo.[${tableName}]
                                        SET ${updateSet}, 
                                            [BranchCode] = '${config.currentBranchCode}', 
                                            [BranchName] = N'${config.currentBranchName}', 
                                            [SyncStatus] = 'synced', 
                                            [LastSyncedAt] = SYSUTCDATETIME()
                                        WHERE ${checkCondition};
                                    END
                                    ELSE
                                    BEGIN
                                        INSERT INTO dbo.[${tableName}] (${insertCols}) 
                                        VALUES (${paramCols});
                                    END
                                `);
                            }

                            // مزامنة البنود التابعة (Child line items)
                            if (meta.childTable && meta.foreignKey) {
                                try {
                                    const childRowsRes = await localPool.request()
                                        .input('ParentId', sql.NVarChar(128), idVal)
                                        .query(`SELECT * FROM dbo.[${meta.childTable}] WHERE [${meta.foreignKey}] = @ParentId`);

                                    if (childRowsRes.recordset.length > 0) {
                                        // جلب أعمدة الجدول الفرعي في السيرفر المركزي
                                        const cColsRes = await centralPool.request()
                                            .input('Tbl', sql.NVarChar(128), meta.childTable)
                                            .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @Tbl`);
                                        const cCentralCols = new Set(cColsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

                                        // حذف البنود القديمة في المركز لمنع التكرار لهذا المستند
                                        await centralPool.request()
                                            .input('ParentId', sql.NVarChar(128), idVal)
                                            .input('BranchCode', sql.NVarChar(50), config.currentBranchCode)
                                            .query(`DELETE FROM dbo.[${meta.childTable}] WHERE [${meta.foreignKey}] = @ParentId AND (BranchCode = @BranchCode OR BranchCode IS NULL)`);

                                        for (const cRow of childRowsRes.recordset) {
                                            const cCols = Object.keys(cRow).filter(k => 
                                                k !== 'Id' && 
                                                k !== 'SyncStatus' && 
                                                k !== 'LastSyncedAt' && 
                                                k !== 'BranchCode' && 
                                                k !== 'BranchName' &&
                                                cCentralCols.has(k.toLowerCase())
                                            );
                                            const cInsert = [...cCols, 'BranchCode', 'BranchName', 'SyncStatus', 'LastSyncedAt'].map(c => `[${c}]`).join(', ');
                                            const cParams = [...cCols.map(k => `@${k}`), `'${config.currentBranchCode}'`, `N'${config.currentBranchName}'`, `'synced'`, 'SYSUTCDATETIME()'].join(', ');

                                            const cReq = centralPool.request();
                                            for (const k of cCols) {
                                                cReq.input(k, cRow[k] === undefined ? null : cRow[k]);
                                            }
                                            await cReq.query(`
                                                INSERT INTO dbo.[${meta.childTable}] (${cInsert})
                                                VALUES (${cParams});
                                            `);
                                        }

                                        // تعليم البنود المحلية بأنها متزامنة وتحديث LastSyncedAt
                                        await localPool.request()
                                            .input('ParentId', sql.NVarChar(128), idVal)
                                            .query(`
                                                UPDATE dbo.[${meta.childTable}]
                                                SET SyncStatus = 'synced', LastSyncedAt = SYSUTCDATETIME()
                                                WHERE [${meta.foreignKey}] = @ParentId;
                                            `);
                                    }
                                } catch (cErr: any) {
                                    console.warn(`Child sync error on ${meta.childTable}:`, cErr.message);
                                }
                            }

                            // تعليم السجل المحلي بأنه متزامن وتحديث LastSyncedAt
                            await localPool.request()
                                .input('IdVal', isChildTableFk ? sql.Int : sql.NVarChar(128), idVal)
                                .query(`
                                    UPDATE dbo.[${tableName}] 
                                    SET SyncStatus = 'synced', LastSyncedAt = SYSUTCDATETIME() 
                                    WHERE [${idCol}] = @IdVal;
                                `);

                            totalPushed++;
                        }

                        // تحديث جدول تتبع المزامنة في قاعدة البيانات
                        const maxLocalRes = await localPool.request().query(`SELECT MAX(UpdatedAt) as maxU, COUNT(*) as c FROM dbo.[${tableName}]`);
                        const maxU = maxLocalRes.recordset[0]?.maxU ? `'${new Date(maxLocalRes.recordset[0].maxU).toISOString()}'` : 'NULL';
                        const totalRows = maxLocalRes.recordset[0]?.c || 0;

                        await localPool.request().query(`
                            UPDATE dbo.SyncTrackingMatrix
                            SET LastLocalTimestamp = ${maxU},
                                LastSyncedTimestamp = SYSUTCDATETIME(),
                                LocalRowsCount = ${totalRows},
                                PendingChangesCount = 0,
                                SyncStatus = 'synced',
                                LastSyncCheckAt = SYSUTCDATETIME()
                            WHERE TableName = '${tableName}';
                        `);

                        if (meta.childTable) {
                            const cMaxRes = await localPool.request().query(`SELECT MAX(UpdatedAt) as maxU, COUNT(*) as c FROM dbo.[${meta.childTable}]`);
                            const cMaxU = cMaxRes.recordset[0]?.maxU ? `'${new Date(cMaxRes.recordset[0].maxU).toISOString()}'` : 'NULL';
                            const cTotalRows = cMaxRes.recordset[0]?.c || 0;
                            await localPool.request().query(`
                                UPDATE dbo.SyncTrackingMatrix
                                SET LastLocalTimestamp = ${cMaxU},
                                    LastSyncedTimestamp = SYSUTCDATETIME(),
                                    LocalRowsCount = ${cTotalRows},
                                    PendingChangesCount = 0,
                                    SyncStatus = 'synced',
                                    LastSyncCheckAt = SYSUTCDATETIME()
                                WHERE TableName = '${meta.childTable}';
                            `);
                        }
                    }
                } catch (pushErr: any) {
                    console.warn(`Sync push error on table ${tableName}:`, pushErr.message);
                }
            }
        }

        // -------------------------------------------------------------
        // المرحلة 2: سحب التحديثات المركزية من الإدارة للفرع (Pull: Insert or Update)
        // -------------------------------------------------------------
        if (mode === 'all' || mode === 'pull') {
            const pullTables = tableEntries.filter(([_, meta]) => meta.direction === 'pull' || meta.direction === 'bidirectional');

            for (const [tableName, meta] of pullTables) {
                try {
                    const idCol = meta.idColumn;

                    // معرفة آخر توقيت تم سحبه لهذا الجدول
                    const matrixRes = await localPool.request()
                        .input('Tbl', sql.NVarChar(128), tableName)
                        .query(`SELECT LastSyncedTimestamp FROM dbo.SyncTrackingMatrix WHERE TableName = @Tbl`);
                    const lastSyncTs = matrixRes.recordset[0]?.LastSyncedTimestamp || null;

                    let centralQuery = `SELECT * FROM dbo.[${tableName}]`;
                    const centralReq = centralPool.request();
                    if (lastSyncTs) {
                        centralReq.input('Watermark', sql.DateTime2, lastSyncTs);
                        centralQuery += ` WHERE UpdatedAt > @Watermark`;
                    }
                    centralQuery += ` ORDER BY UpdatedAt ASC`;

                    const centralRes = await centralReq.query(centralQuery);
                    const centralRows = centralRes.recordset;

                    if (centralRows.length > 0) {
                        let maxCentralUpdatedAt: Date | null = null;

                        for (const row of centralRows) {
                            const idVal = row[idCol];
                            if (!idVal) continue;

                            // تخطي السجلات التي رفعها هذا الفرع ولم تعدل بالإدارة
                            if (row.BranchCode === config.currentBranchCode && row.LastSyncedAt) {
                                continue;
                            }

                            if (row.UpdatedAt && (!maxCentralUpdatedAt || new Date(row.UpdatedAt) > maxCentralUpdatedAt)) {
                                maxCentralUpdatedAt = new Date(row.UpdatedAt);
                            }

                            const colNames = Object.keys(row).filter(c => c !== 'SyncStatus' && c !== 'LastSyncedAt');
                            const insertCols = colNames.map(c => `[${c}]`).join(', ');
                            const paramCols = colNames.map(c => `@${c}`).join(', ');
                            const updateSet = colNames.filter(c => c !== idCol).map(c => `[${c}] = @${c}`).join(', ');

                            const localReq = localPool.request();
                            for (const c of colNames) {
                                localReq.input(c, row[c] === undefined ? null : row[c]);
                            }

                            // تطبيق قاعدة المستخدم: إذا كان موجوداً قم بتحديثه، وإذا لم يكن موجوداً قم بإضافته
                            await localReq.query(`
                                IF EXISTS (SELECT 1 FROM dbo.[${tableName}] WHERE [${idCol}] = @${idCol})
                                BEGIN
                                    UPDATE dbo.[${tableName}]
                                    SET ${updateSet}, SyncStatus = 'synced', LastSyncedAt = SYSUTCDATETIME()
                                    WHERE [${idCol}] = @${idCol};
                                END
                                ELSE
                                BEGIN
                                    INSERT INTO dbo.[${tableName}] (${insertCols}, SyncStatus, LastSyncedAt)
                                    VALUES (${paramCols}, 'synced', SYSUTCDATETIME());
                                END
                            `);

                            totalPulled++;
                        }

                        // تحديث آخر مزامنة في جدول التتبع
                        await localPool.request().query(`
                            UPDATE dbo.SyncTrackingMatrix
                            SET LastSyncedTimestamp = SYSUTCDATETIME(),
                                LastSyncCheckAt = SYSUTCDATETIME()
                            WHERE TableName = '${tableName}';
                        `);
                    }
                } catch (pullErr: any) {
                    console.warn(`Sync pull error on table ${tableName}:`, pullErr.message);
                }
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
            details: `تمت المزامنة بنجاح: تم رفع وتحديث ${totalPushed} حركة من الفرع، وسحب ${totalPulled} تحديث من الإدارة.`
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

/**
 * دالة مساعدة متوافقة مع الواجهات السابقة
 */
export async function getTablesRowCountsComparison() {
    return await getTablesSyncMatrix();
}
