const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

async function migrate() {
  const pool = await sql.connect(config);
  
  // 1. SalesInvoices ETA fields
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SalesInvoices') AND name = 'EtaUuid')
      ALTER TABLE dbo.SalesInvoices ADD [EtaUuid] NVARCHAR(64) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SalesInvoices') AND name = 'EtaStatus')
      ALTER TABLE dbo.SalesInvoices ADD [EtaStatus] NVARCHAR(50) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SalesInvoices') AND name = 'EtaSubmissionId')
      ALTER TABLE dbo.SalesInvoices ADD [EtaSubmissionId] NVARCHAR(64) NULL;
  `);

  // 2. Create AuditTrailLogs table (Immutable Audit Trail)
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditTrailLogs')
    BEGIN
      CREATE TABLE dbo.[AuditTrailLogs] (
        [Id] NVARCHAR(64) NOT NULL PRIMARY KEY CLUSTERED,
        [Timestamp] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
        [UserId] NVARCHAR(64) NULL,
        [UserName] NVARCHAR(255) NULL,
        [Action] NVARCHAR(50) NOT NULL, -- INSERT, UPDATE, DELETE, LOGIN, APPROVE, POST
        [Entity] NVARCHAR(100) NOT NULL, -- salesInvoices, purchaseInvoices, inventory, etc.
        [EntityId] NVARCHAR(64) NULL,
        [Details] NVARCHAR(MAX) NULL,
        [PreviousState] NVARCHAR(MAX) NULL,
        [NewState] NVARCHAR(MAX) NULL,
        [IpAddress] NVARCHAR(50) NULL,
        [Hash] NVARCHAR(128) NULL
      );
      CREATE NONCLUSTERED INDEX IX_AuditTrailLogs_Timestamp ON dbo.AuditTrailLogs (Timestamp DESC);
      CREATE NONCLUSTERED INDEX IX_AuditTrailLogs_Entity ON dbo.AuditTrailLogs (Entity, Action);
    END
  `);

  // 3. Create GeneralLedgerEntries table (Subledger Posting Engine)
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GeneralLedgerEntries')
    BEGIN
      CREATE TABLE dbo.[GeneralLedgerEntries] (
        [Id] NVARCHAR(64) NOT NULL PRIMARY KEY CLUSTERED,
        [EntryNumber] NVARCHAR(50) NOT NULL,
        [Date] DATETIME2 NOT NULL,
        [SourceType] NVARCHAR(50) NOT NULL, -- sale, purchase, expense, payment, asset, production
        [SourceId] NVARCHAR(64) NULL,
        [SourceNumber] NVARCHAR(100) NULL,
        [WarehouseId] NVARCHAR(64) NULL,
        [Description] NVARCHAR(MAX) NULL,
        [Status] NVARCHAR(30) NOT NULL DEFAULT ('posted'), -- posted, draft, reversed
        [TotalDebit] DECIMAL(18, 4) NOT NULL DEFAULT 0,
        [TotalCredit] DECIMAL(18, 4) NOT NULL DEFAULT 0,
        [LinesJson] NVARCHAR(MAX) NOT NULL,
        [CreatedById] NVARCHAR(64) NULL,
        [CreatedByName] NVARCHAR(255) NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime())
      );
      CREATE NONCLUSTERED INDEX IX_GLEntries_Date ON dbo.GeneralLedgerEntries (Date DESC);
      CREATE NONCLUSTERED INDEX IX_GLEntries_Source ON dbo.GeneralLedgerEntries (SourceType, SourceId);
      CREATE NONCLUSTERED INDEX IX_GLEntries_Status ON dbo.GeneralLedgerEntries (Status);
    END
  `);

  // 4. Create ManufacturingOrders table (BOM & Work Orders)
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ManufacturingOrders')
    BEGIN
      CREATE TABLE dbo.[ManufacturingOrders] (
        [Id] NVARCHAR(64) NOT NULL PRIMARY KEY CLUSTERED,
        [OrderNumber] NVARCHAR(50) NOT NULL,
        [Date] DATETIME2 NOT NULL,
        [ProductId] NVARCHAR(64) NOT NULL,
        [ProductName] NVARCHAR(255) NOT NULL,
        [QuantityToProduce] DECIMAL(18, 4) NOT NULL,
        [ProducedQuantity] DECIMAL(18, 4) NOT NULL DEFAULT 0,
        [RawMaterialsWarehouseId] NVARCHAR(64) NOT NULL,
        [FinishedGoodsWarehouseId] NVARCHAR(64) NOT NULL,
        [LaborCost] DECIMAL(18, 4) NOT NULL DEFAULT 0,
        [OverheadCost] DECIMAL(18, 4) NOT NULL DEFAULT 0,
        [TotalRawMaterialCost] DECIMAL(18, 4) NOT NULL DEFAULT 0,
        [TotalProductionCost] DECIMAL(18, 4) NOT NULL DEFAULT 0,
        [UnitProductionCost] DECIMAL(18, 4) NOT NULL DEFAULT 0,
        [Status] NVARCHAR(30) NOT NULL DEFAULT ('draft'), -- draft, in_progress, completed, cancelled
        [BomSnapshotJson] NVARCHAR(MAX) NULL,
        [Notes] NVARCHAR(MAX) NULL,
        [CreatedById] NVARCHAR(64) NULL,
        [CreatedByName] NVARCHAR(255) NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime())
      );
      CREATE NONCLUSTERED INDEX IX_MfgOrders_Date ON dbo.ManufacturingOrders (Date DESC);
      CREATE NONCLUSTERED INDEX IX_MfgOrders_Status ON dbo.ManufacturingOrders (Status);
    END
  `);

  console.log('All ERP enterprise tables (SalesInvoices ETA, AuditTrailLogs, GeneralLedgerEntries, ManufacturingOrders) migrated successfully.');
  await pool.close();
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

