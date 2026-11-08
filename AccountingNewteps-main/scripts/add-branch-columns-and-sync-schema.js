/**
 * scripts/add-branch-columns-and-sync-schema.js
 * يُضيف كود الفرع (BranchCode) واسم الفرع (BranchName) وأعمدة المزامنة لكافة جداول قاعدة البيانات
 * مع تحديث السجلات القديمة تلقائياً ببيانات الفروع المرتبطة.
 */

const sql = require('mssql');

const config = {
    user: process.env.DB_USER || 'meto_pos',
    password: process.env.DB_PASSWORD || 'MetoPosPass123!',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'MultiBranchPOS_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function main() {
    console.log('Connecting to SQL Server to add BranchCode & BranchName to all tables...');
    const pool = await sql.connect(config);

    // 1. Get all base tables
    const tablesRes = await pool.request().query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE' 
          AND TABLE_NAME != 'sysdiagrams'
        ORDER BY TABLE_NAME
    `);

    const tableNames = tablesRes.recordset.map(r => r.TABLE_NAME);
    console.log(`Found ${tableNames.length} tables to verify.`);

    // 2. Loop through each table and add BranchCode, BranchName, SyncStatus, LastSyncedAt if missing
    for (const tableName of tableNames) {
        const colsRes = await pool.request()
            .input('TableName', sql.NVarChar(128), tableName)
            .query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = @TableName
            `);
        const existingCols = new Set(colsRes.recordset.map(c => c.COLUMN_NAME.toLowerCase()));

        const alterQueries = [];

        if (!existingCols.has('branchcode')) {
            alterQueries.push(`ALTER TABLE dbo.[${tableName}] ADD BranchCode NVARCHAR(50) NULL;`);
        }
        if (!existingCols.has('branchname')) {
            alterQueries.push(`ALTER TABLE dbo.[${tableName}] ADD BranchName NVARCHAR(255) NULL;`);
        }
        if (!existingCols.has('syncstatus')) {
            alterQueries.push(`ALTER TABLE dbo.[${tableName}] ADD SyncStatus NVARCHAR(20) NULL CONSTRAINT DF_${tableName}_SyncStatus DEFAULT 'synced';`);
        }
        if (!existingCols.has('lastsyncedat')) {
            alterQueries.push(`ALTER TABLE dbo.[${tableName}] ADD LastSyncedAt DATETIME2 NULL;`);
        }

        for (const query of alterQueries) {
            try {
                await pool.request().query(query);
                console.log(`[+] Added column to ${tableName}`);
            } catch (err) {
                console.warn(`Warning on ${tableName}:`, err.message);
            }
        }
    }

    // 3. Backfill data for tables with WarehouseId
    console.log('Backfilling BranchCode & BranchName for tables linked to Warehouses...');
    const tablesWithWh = [
        'SalesInvoices', 'SalesReturns', 'PurchaseInvoices', 'PurchaseReturns',
        'Expenses', 'ExceptionalIncomes', 'StockInRecords', 'StockOutRecords',
        'StockAdjustmentRecords', 'StockIssuesToReps', 'StockReturnsFromReps',
        'InventoryClosings', 'CashAccounts', 'PosTerminals', 'RestaurantTables',
        'PurchaseOrders', 'Requisitions', 'FixedAssets', 'InventoryZones',
        'DeliveryStaff', 'Sellers', 'GratuityLogs'
    ];

    for (const t of tablesWithWh) {
        try {
            await pool.request().query(`
                UPDATE t
                SET t.BranchCode = COALESCE(w.Code, '900'),
                    t.BranchName = COALESCE(w.Name, N'الفرع الرأيسي')
                FROM dbo.[${t}] t
                LEFT JOIN dbo.Warehouses w ON t.WarehouseId = w.Id
                WHERE t.BranchCode IS NULL OR t.BranchName IS NULL;
            `);
            console.log(`[✓] Backfilled ${t}`);
        } catch (e) {
            console.warn(`Backfill notice on ${t}:`, e.message);
        }
    }

    // 4. Backfill payments through CashAccounts
    try {
        await pool.request().query(`
            UPDATE cp
            SET cp.BranchCode = COALESCE(ca.BranchCode, '900'),
                cp.BranchName = COALESCE(ca.BranchName, N'الفرع الرأيسي')
            FROM dbo.CustomerPayments cp
            LEFT JOIN dbo.CashAccounts ca ON cp.PaidToAccountId = ca.Id
            WHERE cp.BranchCode IS NULL OR cp.BranchName IS NULL;
        `);
        console.log('[✓] Backfilled CustomerPayments from CashAccounts');
    } catch (e) {
        console.warn(e.message);
    }

    try {
        await pool.request().query(`
            UPDATE sp
            SET sp.BranchCode = COALESCE(ca.BranchCode, '900'),
                sp.BranchName = COALESCE(ca.BranchName, N'الفرع الرأيسي')
            FROM dbo.SupplierPayments sp
            LEFT JOIN dbo.CashAccounts ca ON sp.PaidFromAccountId = ca.Id
            WHERE sp.BranchCode IS NULL OR sp.BranchName IS NULL;
        `);
        console.log('[✓] Backfilled SupplierPayments from CashAccounts');
    } catch (e) {
        console.warn(e.message);
    }

    try {
        await pool.request().query(`
            UPDATE tt
            SET tt.BranchCode = COALESCE(ca.BranchCode, '900'),
                tt.BranchName = COALESCE(ca.BranchName, N'الفرع الرأيسي')
            FROM dbo.TreasuryTransactions tt
            LEFT JOIN dbo.CashAccounts ca ON tt.AccountId = ca.Id
            WHERE tt.BranchCode IS NULL OR tt.BranchName IS NULL;
        `);
        console.log('[✓] Backfilled TreasuryTransactions from CashAccounts');
    } catch (e) {
        console.warn(e.message);
    }

    // 5. Backfill all remaining tables with default branch '900' and 'الفرع الرأيسي'
    for (const t of tableNames) {
        try {
            await pool.request().query(`
                UPDATE dbo.[${t}]
                SET BranchCode = '900',
                    BranchName = N'الفرع الرأيسي'
                WHERE BranchCode IS NULL OR BranchName IS NULL;
            `);
        } catch (e) {}
    }
    console.log('[✓] All tables now have BranchCode & BranchName populated.');

    // 6. Ensure default Central Sync Settings exist in AppSettings
    const centralSettingsCheck = await pool.request()
        .input('Key', sql.NVarChar(100), 'central_sync')
        .query('SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = @Key');

    if (centralSettingsCheck.recordset.length === 0) {
        const defaultCentralConfig = {
            currentBranchId: '-OmnkFba_GsEb0rfdzyA',
            currentBranchCode: '900',
            currentBranchName: 'الفرع الرأيسي',
            centralServerIp: '192.168.1.100',
            centralSqlPort: 1433,
            centralDatabase: 'MultiBranchPOS_Central_DB',
            centralUsername: 'sa',
            centralPassword: '',
            autoSync: true,
            autoSyncIntervalMinutes: 5,
            lastSyncTime: null,
            lastSyncStatus: 'ready'
        };

        await pool.request()
            .input('Key', sql.NVarChar(100), 'central_sync')
            .input('Val', sql.NVarChar(sql.MAX), JSON.stringify(defaultCentralConfig))
            .query('INSERT INTO dbo.AppSettings (SettingKey, SettingValue) VALUES (@Key, @Val);');
        console.log('[✓] Created default central_sync settings in AppSettings.');
    } else {
        console.log('[✓] central_sync settings already exist in AppSettings.');
    }

    await pool.close();
    console.log('Branch columns & Sync schema migration completed successfully!');
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});

