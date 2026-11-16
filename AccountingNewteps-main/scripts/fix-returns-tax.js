const sql = require('mssql');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function run() {
    try {
        await sql.connect({
            user:     process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server:   process.env.DB_SERVER || 'localhost',
            database: process.env.DB_NAME,
            options:  { encrypt: false, trustServerCertificate: true }
        });

        const fixes = [
            // SalesReturns — أضف Tax
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SalesReturns') AND name = 'Tax')
                ALTER TABLE dbo.SalesReturns ADD Tax DECIMAL(18,4) NULL DEFAULT 0`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SalesReturns') AND name = 'SupplierName')
                ALTER TABLE dbo.SalesReturns ADD SupplierName NVARCHAR(255) NULL`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SalesReturns') AND name = 'CustomerName')
                ALTER TABLE dbo.SalesReturns ADD CustomerName NVARCHAR(255) NULL`,

            // PurchaseReturns — أضف Tax
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PurchaseReturns') AND name = 'Tax')
                ALTER TABLE dbo.PurchaseReturns ADD Tax DECIMAL(18,4) NULL DEFAULT 0`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PurchaseReturns') AND name = 'SupplierName')
                ALTER TABLE dbo.PurchaseReturns ADD SupplierName NVARCHAR(255) NULL`,
        ];

        for (const fix of fixes) {
            await sql.query(fix);
        }
        console.log('✅ Tax columns added to SalesReturns and PurchaseReturns');

        // تحقق
        const sr = await sql.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SalesReturns' ORDER BY ORDINAL_POSITION`);
        console.log('SalesReturns:', sr.recordset.map(c => c.COLUMN_NAME).join(', '));
        const pr = await sql.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PurchaseReturns' ORDER BY ORDINAL_POSITION`);
        console.log('PurchaseReturns:', pr.recordset.map(c => c.COLUMN_NAME).join(', '));

    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        await sql.close();
    }
}
run();
