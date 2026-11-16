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

        // 1. فحص الأعمدة الحالية
        const cols = await sql.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'StockInRecords' ORDER BY ORDINAL_POSITION`);
        console.log('Existing columns:', cols.recordset.map(c => c.COLUMN_NAME).join(', '));

        // 2. إضافة الأعمدة الناقصة
        const fixes = [
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'StockTransferId') ALTER TABLE dbo.StockInRecords ADD StockTransferId NVARCHAR(64) NULL`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'ReceivedById') ALTER TABLE dbo.StockInRecords ADD ReceivedById NVARCHAR(64) NULL`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'ReceivedByName') ALTER TABLE dbo.StockInRecords ADD ReceivedByName NVARCHAR(255) NULL`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'ReceivedDate') ALTER TABLE dbo.StockInRecords ADD ReceivedDate DATETIME2 NULL`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'CreatedById') ALTER TABLE dbo.StockInRecords ADD CreatedById NVARCHAR(64) NULL`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'CreatedByName') ALTER TABLE dbo.StockInRecords ADD CreatedByName NVARCHAR(255) NULL`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'UpdatedAt') ALTER TABLE dbo.StockInRecords ADD UpdatedAt DATETIME2 NULL`,
        ];

        for (const fix of fixes) {
            await sql.query(fix);
        }
        console.log('✅ Columns ensured OK');

        // 3. فحص الأعمدة بعد الإضافة
        const cols2 = await sql.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'StockInRecords' ORDER BY ORDINAL_POSITION`);
        console.log('Updated columns:', cols2.recordset.map(c => c.COLUMN_NAME).join(', '));

    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        await sql.close();
    }
}
run();
