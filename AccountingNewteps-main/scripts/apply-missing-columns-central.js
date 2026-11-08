const sql = require('mssql');

const centralConfig = {
    user: 'meto_pos',
    password: 'MetoPosPass123!',
    server: 'localhost',
    database: 'MultiBranchPOS_Central_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

async function fix() {
    const pool = new sql.ConnectionPool(centralConfig);
    await pool.connect();

    const statements = [
        // SalesInvoices
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SalesInvoices' AND COLUMN_NAME = 'IsTaxIncluded') ALTER TABLE dbo.SalesInvoices ADD IsTaxIncluded BIT NULL;",
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SalesInvoices' AND COLUMN_NAME = 'IsDelivery') ALTER TABLE dbo.SalesInvoices ADD IsDelivery BIT NULL;",
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SalesInvoices' AND COLUMN_NAME = 'Tax') ALTER TABLE dbo.SalesInvoices ADD Tax DECIMAL(18,4) NULL;",
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SalesInvoices' AND COLUMN_NAME = 'CashierId') ALTER TABLE dbo.SalesInvoices ADD CashierId NVARCHAR(64) NULL;",

        // PurchaseReturns
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PurchaseReturns' AND COLUMN_NAME = 'Discount') ALTER TABLE dbo.PurchaseReturns ADD Discount DECIMAL(18,4) NULL;",
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PurchaseReturns' AND COLUMN_NAME = 'OriginalInvoiceId') ALTER TABLE dbo.PurchaseReturns ADD OriginalInvoiceId NVARCHAR(64) NULL;",

        // Expenses
        "ALTER TABLE dbo.Expenses ALTER COLUMN ExpenseType NVARCHAR(100) NULL;",

        // StockInRecords
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'StockInRecords' AND COLUMN_NAME = 'Status') ALTER TABLE dbo.StockInRecords ADD Status NVARCHAR(50) NULL;",
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'StockInRecords' AND COLUMN_NAME = 'BatchNumber') ALTER TABLE dbo.StockInRecords ADD BatchNumber NVARCHAR(100) NULL;",

        // StockAdjustmentRecords
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'StockAdjustmentRecords' AND COLUMN_NAME = 'CreatedByName') ALTER TABLE dbo.StockAdjustmentRecords ADD CreatedByName NVARCHAR(255) NULL;",
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'StockAdjustmentRecords' AND COLUMN_NAME = 'CreatedById') ALTER TABLE dbo.StockAdjustmentRecords ADD CreatedById NVARCHAR(64) NULL;",

        // CustomerVisits
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CustomerVisits' AND COLUMN_NAME = 'Location') ALTER TABLE dbo.CustomerVisits ADD Location NVARCHAR(500) NULL;",

        // LoginHistory
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'LoginHistory' AND COLUMN_NAME = 'Longitude') ALTER TABLE dbo.LoginHistory ADD Longitude FLOAT NULL;",
        "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'LoginHistory' AND COLUMN_NAME = 'Latitude') ALTER TABLE dbo.LoginHistory ADD Latitude FLOAT NULL;"
    ];

    for (const stmt of statements) {
        try {
            await pool.request().query(stmt);
            console.log('EXECUTED:', stmt.substring(0, 70));
        } catch (e) {
            console.error('ERROR:', e.message);
        }
    }

    await pool.close();
    console.log('Finished applying missing columns!');
}

fix().catch(console.error);

