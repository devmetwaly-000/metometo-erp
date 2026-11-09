const sql = require('mssql');

const localConfig = {
    user: 'meto_pos',
    password: 'MetoPosPass123!',
    server: 'localhost',
    database: 'MultiBranchPOS_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

const centralConfig = {
    user: 'gmlogins',
    password: 'retgomladb',
    server: '10.110.16.16',
    database: 'MultiBranchPOS_Central_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

const localCentralConfig = {
    user: 'meto_pos',
    password: 'MetoPosPass123!',
    server: 'localhost',
    database: 'MultiBranchPOS_Central_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

const TABLES_METADATA = [
    // 1. فواتير وعمليات
    { table: 'SalesInvoices', name: 'فواتير المبيعات', category: 'فواتير وعمليات', direction: 'push', idCol: 'Id' },
    { table: 'SalesInvoiceItems', name: 'بنود فواتير المبيعات', category: 'فواتير وعمليات', direction: 'push', idCol: 'Id' },
    { table: 'SalesReturns', name: 'مردودات المبيعات', category: 'فواتير وعمليات', direction: 'push', idCol: 'Id' },
    { table: 'SalesReturnItems', name: 'بنود مردودات المبيعات', category: 'فواتير وعمليات', direction: 'push', idCol: 'Id' },
    { table: 'HeldInvoices', name: 'الفواتير المعلقة بالكاشير', category: 'فواتير وعمليات', direction: 'push', idCol: 'Id' },

    // 2. مشتريات وموردين
    { table: 'PurchaseInvoices', name: 'فواتير المشتريات', category: 'مشتريات وموردين', direction: 'push', idCol: 'Id' },
    { table: 'PurchaseInvoiceItems', name: 'بنود فواتير المشتريات', category: 'مشتريات وموردين', direction: 'push', idCol: 'Id' },
    { table: 'PurchaseReturns', name: 'مردودات المشتريات', category: 'مشتريات وموردين', direction: 'push', idCol: 'Id' },
    { table: 'PurchaseReturnItems', name: 'بنود مردودات المشتريات', category: 'مشتريات وموردين', direction: 'push', idCol: 'Id' },
    { table: 'PurchaseOrders', name: 'أوامر الشراء للموردين', category: 'مشتريات وموردين', direction: 'push', idCol: 'Id' },
    { table: 'Suppliers', name: 'سجل الموردين', category: 'مشتريات وموردين', direction: 'bidirectional', idCol: 'Id' },
    { table: 'SupplierPayments', name: 'سندات صرف الموردين', category: 'مشتريات وموردين', direction: 'push', idCol: 'Id' },

    // 3. عملاء ومبيعات
    { table: 'Customers', name: 'سجل العملاء', category: 'عملاء ومبيعات', direction: 'bidirectional', idCol: 'Id' },
    { table: 'CustomerPayments', name: 'سندات قبض العملاء', category: 'عملاء ومبيعات', direction: 'push', idCol: 'Id' },
    { table: 'CustomerVisits', name: 'سجل زيارات العملاء', category: 'عملاء ومبيعات', direction: 'push', idCol: 'Id' },

    // 4. حسابات ومالية
    { table: 'CashAccounts', name: 'الخزائن والحسابات البنكية', category: 'حسابات ومالية', direction: 'bidirectional', idCol: 'Id' },
    { table: 'TreasuryTransactions', name: 'حركات الخزينة والتحويلات', category: 'حسابات ومالية', direction: 'push', idCol: 'Id' },
    { table: 'Expenses', name: 'المصروفات التشغيلية', category: 'حسابات ومالية', direction: 'push', idCol: 'Id' },
    { table: 'ExceptionalIncomes', name: 'الإيرادات الاستثنائية', category: 'حسابات ومالية', direction: 'push', idCol: 'Id' },
    { table: 'ProfitDistributions', name: 'توزيعات الأرباح', category: 'حسابات ومالية', direction: 'push', idCol: 'Id' },
    { table: 'Partners', name: 'سجل الشركاء والمساهمين', category: 'حسابات ومالية', direction: 'bidirectional', idCol: 'Id' },
    { table: 'PaymentMethods', name: 'طرق الدفع والتحصيل', category: 'حسابات ومالية', direction: 'bidirectional', idCol: 'Id' },

    // 5. أصول وإهلاك
    { table: 'FixedAssets', name: 'الأصول الثابتة', category: 'أصول وإهلاك', direction: 'bidirectional', idCol: 'Id' },
    { table: 'DepreciationRecords', name: 'قيود إهلاك الأصول', category: 'أصول وإهلاك', direction: 'push', idCol: 'Id' },

    // 6. مخازن وأصناف
    { table: 'Items', name: 'الأصناف والمنتجات', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'ItemCategories', name: 'تصنيفات ومجموعات الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'ItemSections', name: 'أقسام الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'ItemGroups', name: 'الفئات العامة للأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'ItemSubCategories1', name: 'تصنيفات فرعية 1 للأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'ItemSubCategories2', name: 'تصنيفات فرعية 2 للأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'ItemColors', name: 'ألوان وموديلات الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'ItemSizes', name: 'مقاسات وأحجام الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'PriceChangeLogs', name: 'سجل تعديلات الأسعار', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'Warehouses', name: 'المستودعات والفروع', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'InventorySections', name: 'قواطع وأقسام المستودع', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'InventoryZones', name: 'مناطق وأرفف التخزين', category: 'مخازن وأصناف', direction: 'bidirectional', idCol: 'Id' },
    { table: 'StockInRecords', name: 'أذون إضافة واستلام مخزني', category: 'مخازن وأصناف', direction: 'push', idCol: 'Id' },
    { table: 'StockInRecordItems', name: 'بنود أذون الإضافة المخزنية', category: 'مخازن وأصناف', direction: 'push', idCol: 'Id' },
    { table: 'StockOutRecords', name: 'أذون صرف وتسليم مخزني', category: 'مخازن وأصناف', direction: 'push', idCol: 'Id' },
    { table: 'StockTransferRecords', name: 'تحويلات المخزون بين الفروع', category: 'مخازن وأصناف', direction: 'push', idCol: 'Id' },
    { table: 'StockAdjustmentRecords', name: 'تسويات الجرد المخزني', category: 'مخازن وأصناف', direction: 'push', idCol: 'Id' },
    { table: 'StockAdjustmentItems', name: 'بنود تسويات الجرد المخزني', category: 'مخازن وأصناف', direction: 'push', idCol: 'Id' },
    { table: 'InventoryClosings', name: 'تقفيلات الجرد الدوري', category: 'مخازن وأصناف', direction: 'push', idCol: 'Id' },

    // 7. توزيع ومندوبين
    { table: 'StockIssuesToReps', name: 'صرف بضاعة لعهدة المندوبين', category: 'توزيع ومندوبين', direction: 'push', idCol: 'Id' },
    { table: 'StockReturnsFromReps', name: 'مرتجع بضاعة من عهدة المندوبين', category: 'توزيع ومندوبين', direction: 'push', idCol: 'Id' },
    { table: 'RepRemittances', name: 'توريدات نقدية المندوبين', category: 'توزيع ومندوبين', direction: 'push', idCol: 'Id' },
    { table: 'Sellers', name: 'البائعين والمسوقين', category: 'توزيع ومندوبين', direction: 'bidirectional', idCol: 'Id' },
    { table: 'DeliveryStaff', name: 'مناديب التوصيل والدليفري', category: 'توزيع ومندوبين', direction: 'bidirectional', idCol: 'Id' },

    // 8. موارد بشرية
    { table: 'Employees', name: 'سجل الموظفين', category: 'موارد بشرية', direction: 'bidirectional', idCol: 'Id' },
    { table: 'EmployeeAdvances', name: 'سلف الموظفين', category: 'موارد بشرية', direction: 'push', idCol: 'Id' },
    { table: 'EmployeeAdjustments', name: 'بدلات وخصومات الموظفين', category: 'موارد بشرية', direction: 'push', idCol: 'Id' },
    { table: 'PayrollRecords', name: 'مسيرات الرواتب الشهرية', category: 'موارد بشرية', direction: 'push', idCol: 'Id' },
    { table: 'GratuityDistributions', name: 'توزيعات مكافأة نهاية الخدمة', category: 'موارد بشرية', direction: 'push', idCol: 'Id' },
    { table: 'GratuityLogs', name: 'سجل مكافآت وبقشيش الكاشير', category: 'موارد بشرية', direction: 'push', idCol: 'Id' },

    // 9. نقاط البيع
    { table: 'PosSessions', name: 'جلسات ودورات نقاط البيع', category: 'نقاط البيع', direction: 'push', idCol: 'Id' },
    { table: 'PosTerminals', name: 'شاشات وأجهزة الكاشير', category: 'نقاط البيع', direction: 'bidirectional', idCol: 'Id' },
    { table: 'PosAuditLogs', name: 'سجل رقابة وتدقيق الكاشير', category: 'نقاط البيع', direction: 'push', idCol: 'Id' },
    { table: 'Promotions', name: 'العروض الترويجية والخصومات', category: 'نقاط البيع', direction: 'bidirectional', idCol: 'Id' },
    { table: 'RestaurantTables', name: 'طاولات وصالات المطعم', category: 'نقاط البيع', direction: 'bidirectional', idCol: 'Id' },

    // 10. إعدادات النظام ومستخدمين
    { table: 'BarcodeDesigns', name: 'تصميمات ونماذج الباركود', category: 'إعدادات النظام', direction: 'bidirectional', idCol: 'Id' },
    { table: 'Users', name: 'المستخدمين وحسابات الدخول', category: 'إعدادات النظام', direction: 'bidirectional', idCol: 'Id' },
    { table: 'Roles', name: 'الأدوار ومصفوفة الصلاحيات', category: 'إعدادات النظام', direction: 'bidirectional', idCol: 'Id' },
    { table: 'Licenses', name: 'التراخيص والنسخ المرخصة', category: 'إعدادات النظام', direction: 'bidirectional', idCol: 'Id' },
    { table: 'AppSettings', name: 'إعدادات النظام والمتغيرات', category: 'إعدادات النظام', direction: 'bidirectional', idCol: 'SettingKey' },
    { table: 'Counters', name: 'عدادات الترقيم التلقائي', category: 'إعدادات النظام', direction: 'push', idCol: 'Name' },
    { table: 'Targets', name: 'الأهداف البيعية والعمولات', category: 'إعدادات النظام', direction: 'bidirectional', idCol: 'Id' },
    { table: 'Requisitions', name: 'طلبات الاحتياج والشراء', category: 'إعدادات النظام', direction: 'push', idCol: 'Id' },
    { table: 'Notifications', name: 'الإشعارات والتنبيهات', category: 'إعدادات النظام', direction: 'push', idCol: 'Id' },
    { table: 'LoginHistory', name: 'سجل الدخول والأمان', category: 'إعدادات النظام', direction: 'push', idCol: 'Id' }
];

async function setupDatabaseTracking(pool, dbName, isCentral = false) {
    console.log(`\n======================================================`);
    console.log(`  تهيئة جدول مركز تتبع المزامنة في [${dbName}]...`);
    console.log(`======================================================`);

    // 1. إنشاء جدول تتبع المزامنة الجديد بالهيكل الدقيق المطلوب
    await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncTrackingMatrix')
        BEGIN
            CREATE TABLE dbo.SyncTrackingMatrix (
                TableName NVARCHAR(128) NOT NULL,
                TableDisplayName NVARCHAR(255) NOT NULL,
                Category NVARCHAR(100) NOT NULL,
                SyncDirection NVARCHAR(30) NOT NULL DEFAULT ('push'),
                LastLocalTimestamp DATETIME2 NULL,        -- آخر timestamp فى الجدول بالفرع
                LastSyncedTimestamp DATETIME2 NULL,       -- آخر timestamp تم مزامنتة بنجاح فى الادارة
                LastCentralTimestamp DATETIME2 NULL,      -- آخر timestamp في قاعدة بيانات الادارة
                LocalRowsCount INT NOT NULL DEFAULT 0,
                CentralBranchRowsCount INT NULL DEFAULT 0,
                CentralTotalRowsCount INT NULL DEFAULT 0,
                PendingChangesCount INT NOT NULL DEFAULT 0,
                SyncStatus NVARCHAR(50) NOT NULL DEFAULT ('pending'),
                LastSyncCheckAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                CONSTRAINT PK_SyncTrackingMatrix PRIMARY KEY CLUSTERED (TableName)
            );
            PRINT 'Created dbo.SyncTrackingMatrix successfully.';
        END
    `);

    // 2. التحقق من وجود الأعمدة الـ 6 في جميع الجداول الـ 69
    for (const item of TABLES_METADATA) {
        const t = item.table;
        const colsRes = await pool.request().query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${t}'
        `);
        const colSet = new Set(colsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

        if (!colSet.has('updatedat')) {
            await pool.request().query(`ALTER TABLE dbo.[${t}] ADD UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_${t}_UpdatedAt DEFAULT SYSUTCDATETIME();`);
        }
        if (!colSet.has('createdat')) {
            await pool.request().query(`ALTER TABLE dbo.[${t}] ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_${t}_CreatedAt DEFAULT SYSUTCDATETIME();`);
        }
        if (!colSet.has('branchcode')) {
            await pool.request().query(`ALTER TABLE dbo.[${t}] ADD BranchCode NVARCHAR(50) NULL DEFAULT ('900');`);
        }
        if (!colSet.has('branchname')) {
            await pool.request().query(`ALTER TABLE dbo.[${t}] ADD BranchName NVARCHAR(255) NULL DEFAULT (N'الفرع الرأيسي');`);
        }
        if (!colSet.has('syncstatus')) {
            await pool.request().query(`ALTER TABLE dbo.[${t}] ADD SyncStatus NVARCHAR(50) NULL DEFAULT ('synced');`);
        }
        if (!colSet.has('lastsyncedat')) {
            await pool.request().query(`ALTER TABLE dbo.[${t}] ADD LastSyncedAt DATETIME2 NULL;`);
        }

        // 3. تركيب مشغل تتبع التعديلات الذكي الذي يراعي عمليات المزامنة
        const idCol = item.idCol;
        const trgSql = `
            CREATE OR ALTER TRIGGER dbo.[trg_${t}_TrackChanges]
            ON dbo.[${t}]
            AFTER UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                IF CONTEXT_INFO() = 0x53594E43 RETURN; -- تجاوز مشغل التعديل عند تنفيذ المزامنة

                -- إذا كان التعديل فقط لتحديث حالة المزامنة نتجاوز التكرار
                IF (UPDATE(LastSyncedAt) AND UPDATE(SyncStatus) AND NOT UPDATE(${idCol})) RETURN;

                UPDATE target
                SET target.UpdatedAt = SYSUTCDATETIME(),
                    target.SyncStatus = 'pending'
                FROM dbo.[${t}] target
                INNER JOIN inserted i ON target.[${idCol}] = i.[${idCol}];
            END;
        `;
        try {
            await pool.request().query(trgSql);
        } catch (e) {
            console.warn(`Trigger warning on ${t}:`, e.message);
        }

        // 4. إدراج أو تحديث السطر الخاص بالجدول في dbo.SyncTrackingMatrix
        const statsRes = await pool.request().query(`
            SELECT 
                COUNT(*) as totalRows,
                MAX(UpdatedAt) as maxUpdated,
                MAX(LastSyncedAt) as maxSynced,
                SUM(CASE WHEN SyncStatus = 'pending' OR LastSyncedAt IS NULL OR (UpdatedAt > LastSyncedAt AND LastSyncedAt IS NOT NULL) THEN 1 ELSE 0 END) as pendingCount
            FROM dbo.[${t}]
        `);
        const s = statsRes.recordset[0] || {};
        const totalRows = Number(s.totalRows) || 0;
        const pendingCount = Number(s.pendingCount) || 0;
        const maxUpdated = s.maxUpdated ? `'${new Date(s.maxUpdated).toISOString()}'` : 'NULL';
        const maxSynced = s.maxSynced ? `'${new Date(s.maxSynced).toISOString()}'` : 'NULL';
        const status = pendingCount > 0 ? 'pending' : (totalRows === 0 ? 'empty' : 'synced');

        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.SyncTrackingMatrix WHERE TableName = '${t}')
            BEGIN
                INSERT INTO dbo.SyncTrackingMatrix (
                    TableName, TableDisplayName, Category, SyncDirection,
                    LastLocalTimestamp, LastSyncedTimestamp,
                    LocalRowsCount, PendingChangesCount, SyncStatus,
                    LastSyncCheckAt, UpdatedAt
                ) VALUES (
                    '${t}', N'${item.name}', N'${item.category}', '${item.direction}',
                    ${maxUpdated}, ${maxSynced},
                    ${totalRows}, ${pendingCount}, '${status}',
                    SYSUTCDATETIME(), SYSUTCDATETIME()
                );
            END
            ELSE
            BEGIN
                UPDATE dbo.SyncTrackingMatrix
                SET TableDisplayName = N'${item.name}',
                    Category = N'${item.category}',
                    SyncDirection = '${item.direction}',
                    LastLocalTimestamp = ${maxUpdated},
                    LastSyncedTimestamp = ${maxSynced},
                    LocalRowsCount = ${totalRows},
                    PendingChangesCount = ${pendingCount},
                    SyncStatus = '${status}',
                    LastSyncCheckAt = SYSUTCDATETIME()
                WHERE TableName = '${t}';
            END
        `);
    }

    console.log(`✓ تم تسجيل وتحديث 69 جدولاً بالكامل داخل dbo.SyncTrackingMatrix في [${dbName}].`);
}

async function run() {
    console.log('=== بدء تثبيت هيكل تتبع المزامنة وجدول Matrix الشامل ===');
    
    // 1. المحلي
    const local = await sql.connect(localConfig);
    await setupDatabaseTracking(local, 'Local: MultiBranchPOS_DB', false);
    await local.close();

    // 2. المركزي المحلي (Localhost Central)
    try {
        const localCentral = await sql.connect(localCentralConfig);
        await setupDatabaseTracking(localCentral, 'Localhost Central: MultiBranchPOS_Central_DB', true);
        await localCentral.close();
    } catch (e) {
        console.warn('Localhost Central setup warning:', e.message);
    }

    // 3. المركزي البعيد (Remote Central: 10.110.16.16)
    try {
        const central = await sql.connect(centralConfig);
        await setupDatabaseTracking(central, 'Remote Central: MultiBranchPOS_Central_DB', true);
        await central.close();
    } catch (e) {
        console.warn('Remote Central setup warning:', e.message);
    }

    console.log('\n=== اكتملت العملية بنجاح تام! ===');
}

run().catch(console.error);

