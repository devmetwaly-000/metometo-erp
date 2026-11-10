const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
  const pool = await sql.connect(config);
  
  // 1. Ensure AllocationsJson column exists
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'AllocationsJson')
    BEGIN
      ALTER TABLE dbo.StockInRecords ADD [AllocationsJson] NVARCHAR(MAX) NULL;
      PRINT 'AllocationsJson column added successfully.';
    END
  `);

  // 2. Find all main warehouses
  const mainWhRes = await pool.request().query(`
    SELECT Id FROM dbo.Warehouses WHERE IsMain = 1
    UNION
    SELECT MainWarehouseId FROM dbo.InventorySections
  `);
  const mainWhIds = mainWhRes.recordset.map(r => r.Id).filter(Boolean);

  // 3. Update records for these warehouses that have no allocations to pending_putaway
  if (mainWhIds.length > 0) {
    const inClause = mainWhIds.map(id => `'${id}'`).join(',');
    const updateRes = await pool.request().query(`
      UPDATE dbo.StockInRecords
      SET Status = 'pending_putaway'
      WHERE WarehouseId IN (${inClause})
        AND (AllocationsJson IS NULL OR AllocationsJson = '' OR AllocationsJson = '[]')
        AND Status = 'completed';
    `);
    console.log('Updated stock-in records count to pending_putaway:', updateRes.rowsAffected[0]);
  }

  const check = await pool.request().query(`SELECT Id, ReceiptNumber, WarehouseId, Status FROM dbo.StockInRecords WHERE Id = 'gen_1794350023185_ao4zm'`);
  console.log('Record gen_1794350023185_ao4zm:', check.recordset[0]);

  await pool.close();
}

run().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

