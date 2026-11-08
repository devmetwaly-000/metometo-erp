/**
 * @fileOverview محرك إنشاء وتهيئة قواعد البيانات (Database Initialization Engine)
 * يُتيح إنشاء وتأسيس قاعدة البيانات المركزية أو الفرعية بكامل جداولها (69 جدولاً)
 * والمشغلات الآلية (Triggers) والإعدادات الافتراضية بضغطة زر واحدة مباشرة من التطبيق.
 */

import sql from 'mssql';

export interface DbInitOptions {
    server: string;
    port: number;
    database: string;
    user: string;
    password: string;
    branchCode?: string;
    branchName?: string;
    isCentral?: boolean;
}

export async function createAndInitializeDatabase(options: DbInitOptions): Promise<{
    success: boolean;
    database: string;
    tablesCount: number;
    message: string;
    error?: string;
}> {
    const { server, port, database, user, password, branchCode = '900', branchName = 'الفرع الرأيسي' } = options;

    // 1. Connect to 'master' database first to create database if not exists
    const masterConfig: sql.config = {
        user,
        password,
        server,
        port: Number(port) || 1433,
        database: 'master',
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
            connectTimeout: 8000
        }
    };

    let masterPool: sql.ConnectionPool | null = null;
    let targetPool: sql.ConnectionPool | null = null;

    try {
        masterPool = await sql.connect(masterConfig);

        // Sanitize database name (alphanumeric and underscores)
        const cleanDbName = database.replace(/[^a-zA-Z0-9_]/g, '');
        if (!cleanDbName) {
            throw new Error('اسم قاعدة البيانات غير صالح.');
        }

        // Check and create database
        await masterPool.request().query(`
            IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'${cleanDbName}')
            BEGIN
                CREATE DATABASE [${cleanDbName}] COLLATE Arabic_100_CI_AS;
            END;
        `);

        await masterPool.close();
        masterPool = null;

        // 2. Connect to the newly created / existing target database
        const targetConfig: sql.config = {
            ...masterConfig,
            database: cleanDbName
        };

        targetPool = await sql.connect(targetConfig);

        // 3. Create all Core Master and Transactional Tables with BranchCode & BranchName
        const ddlStatements = [
            // Warehouses & Branches
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Warehouses')
            CREATE TABLE dbo.Warehouses (
                Id NVARCHAR(64) PRIMARY KEY,
                Code NVARCHAR(50) NULL,
                Name NVARCHAR(255) NOT NULL,
                Address NVARCHAR(500) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            // Inventory Sections & Zones
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InventorySections')
            CREATE TABLE dbo.InventorySections (
                Id NVARCHAR(64) PRIMARY KEY,
                MainWarehouseId NVARCHAR(64) NULL,
                Name NVARCHAR(255) NOT NULL,
                Capacity INT DEFAULT 0,
                AllowOverfill BIT DEFAULT 1,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InventoryZones')
            CREATE TABLE dbo.InventoryZones (
                Id NVARCHAR(64) PRIMARY KEY,
                WarehouseId NVARCHAR(64) NULL,
                Name NVARCHAR(255) NOT NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            // Items, Categories & Sections
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSections')
            CREATE TABLE dbo.ItemSections (
                Id NVARCHAR(64) PRIMARY KEY,
                Code NVARCHAR(50) NULL,
                Name NVARCHAR(255) NOT NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemCategories')
            CREATE TABLE dbo.ItemCategories (
                Id NVARCHAR(64) PRIMARY KEY,
                SectionId NVARCHAR(64) NULL,
                Name NVARCHAR(255) NOT NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemGroups')
            CREATE TABLE dbo.ItemGroups (
                Id NVARCHAR(64) PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSubCategories1')
            CREATE TABLE dbo.ItemSubCategories1 (
                Id NVARCHAR(64) PRIMARY KEY,
                CategoryId NVARCHAR(64) NULL,
                Name NVARCHAR(255) NOT NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSubCategories2')
            CREATE TABLE dbo.ItemSubCategories2 (
                Id NVARCHAR(64) PRIMARY KEY,
                SubCategory1Id NVARCHAR(64) NULL,
                Name NVARCHAR(255) NOT NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemColors')
            CREATE TABLE dbo.ItemColors (
                Id NVARCHAR(64) PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSizes')
            CREATE TABLE dbo.ItemSizes (
                Id NVARCHAR(64) PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Items')
            CREATE TABLE dbo.Items (
                Id NVARCHAR(64) PRIMARY KEY,
                Code NVARCHAR(100) NOT NULL,
                Name NVARCHAR(255) NOT NULL,
                Cost DECIMAL(18, 4) NOT NULL DEFAULT 0,
                Price DECIMAL(18, 4) NOT NULL DEFAULT 0,
                BaseUnit NVARCHAR(50) NOT NULL DEFAULT N'قطعة',
                ItemType NVARCHAR(50) NOT NULL DEFAULT 'standard',
                ReorderPoint DECIMAL(18, 4) DEFAULT 0,
                SectionId NVARCHAR(64) NULL,
                CategoryId NVARCHAR(64) NULL,
                ItemGroupId NVARCHAR(64) NULL,
                SubCategoryId1 NVARCHAR(64) NULL,
                SubCategoryId2 NVARCHAR(64) NULL,
                Color NVARCHAR(50) NULL,
                Size NVARCHAR(50) NULL,
                DefaultBinId NVARCHAR(64) NULL,
                Barcode NVARCHAR(100) NULL,
                BarcodeType NVARCHAR(50) DEFAULT 'CODE128',
                SecondaryUnitsJson NVARCHAR(MAX) NULL,
                ComponentsJson NVARCHAR(MAX) NULL,
                IsDisabled BIT NOT NULL DEFAULT 0,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            // Customers & Suppliers
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Customers')
            CREATE TABLE dbo.Customers (
                Id NVARCHAR(64) PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                Phone NVARCHAR(50) NULL,
                Address NVARCHAR(500) NULL,
                AllowCredit BIT DEFAULT 0,
                CreditLimit DECIMAL(18, 4) DEFAULT 0,
                OpeningBalance DECIMAL(18, 4) DEFAULT 0,
                CurrentBalance DECIMAL(18, 4) DEFAULT 0,
                InvoiceCount INT DEFAULT 0,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Suppliers')
            CREATE TABLE dbo.Suppliers (
                Id NVARCHAR(64) PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                Contact NVARCHAR(255) NULL,
                OpeningBalance DECIMAL(18, 4) DEFAULT 0,
                CurrentBalance DECIMAL(18, 4) DEFAULT 0,
                ItemsJson NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            // Cash Accounts & Treasury
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashAccounts')
            CREATE TABLE dbo.CashAccounts (
                Id NVARCHAR(64) PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                WarehouseId NVARCHAR(64) NULL,
                OpeningBalance DECIMAL(18, 4) DEFAULT 0,
                SalesRepId NVARCHAR(64) NULL,
                UserId NVARCHAR(64) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TreasuryTransactions')
            CREATE TABLE dbo.TreasuryTransactions (
                Id NVARCHAR(64) PRIMARY KEY,
                ReceiptNumber NVARCHAR(100) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                AccountId NVARCHAR(64) NOT NULL,
                Type NVARCHAR(50) NOT NULL,
                Amount DECIMAL(18, 4) NOT NULL,
                Description NVARCHAR(500) NULL,
                LinkedTransaction BIT DEFAULT 0,
                LinkedTransactionId NVARCHAR(64) NULL,
                CreatedById NVARCHAR(64) NULL,
                CreatedByName NVARCHAR(255) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            // Sales & Invoices
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesInvoices')
            CREATE TABLE dbo.SalesInvoices (
                Id NVARCHAR(64) PRIMARY KEY,
                InvoiceNumber NVARCHAR(100) NOT NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                DueDate DATETIME2 NULL,
                CustomerId NVARCHAR(64) NOT NULL,
                CustomerName NVARCHAR(255) NOT NULL,
                WarehouseId NVARCHAR(64) NOT NULL,
                SalesRepId NVARCHAR(64) NULL,
                CreatedById NVARCHAR(64) NULL,
                CreatedByName NVARCHAR(255) NULL,
                Subtotal DECIMAL(18, 4) NOT NULL DEFAULT 0,
                Discount DECIMAL(18, 4) NOT NULL DEFAULT 0,
                TaxAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
                Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
                PaidAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
                PaidToAccountId NVARCHAR(64) NULL,
                PaymentMethodId NVARCHAR(64) NULL,
                Status NVARCHAR(50) DEFAULT 'approved',
                IsCredit BIT DEFAULT 0,
                DeliveryStaffId NVARCHAR(64) NULL,
                DeliveryFee DECIMAL(18, 4) DEFAULT 0,
                DeliveryStatus NVARCHAR(50) NULL,
                DeliveryReconciled BIT DEFAULT 0,
                Notes NVARCHAR(MAX) NULL,
                ItemsJson NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesInvoiceItems')
            CREATE TABLE dbo.SalesInvoiceItems (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                InvoiceId NVARCHAR(64) NOT NULL,
                ItemId NVARCHAR(64) NOT NULL,
                ItemCode NVARCHAR(100) NULL,
                ItemName NVARCHAR(255) NOT NULL,
                Qty DECIMAL(18, 4) NOT NULL,
                OriginalQty DECIMAL(18, 4) NULL,
                OriginalUnit NVARCHAR(50) NULL,
                ConversionFactor DECIMAL(18, 4) DEFAULT 1,
                Price DECIMAL(18, 4) NOT NULL,
                Cost DECIMAL(18, 4) NOT NULL DEFAULT 0,
                Discount DECIMAL(18, 4) DEFAULT 0,
                Total DECIMAL(18, 4) NOT NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesReturns')
            CREATE TABLE dbo.SalesReturns (
                Id NVARCHAR(64) PRIMARY KEY,
                ReceiptNumber NVARCHAR(100) NULL,
                OriginalInvoiceId NVARCHAR(64) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                CustomerId NVARCHAR(64) NULL,
                CustomerName NVARCHAR(255) NULL,
                WarehouseId NVARCHAR(64) NOT NULL,
                CreatedById NVARCHAR(64) NULL,
                CreatedByName NVARCHAR(255) NULL,
                Subtotal DECIMAL(18, 4) NOT NULL DEFAULT 0,
                Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
                PaidAmount DECIMAL(18, 4) DEFAULT 0,
                PaidFromAccountId NVARCHAR(64) NULL,
                Notes NVARCHAR(MAX) NULL,
                ItemsJson NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            // Purchases & Invoices
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseInvoices')
            CREATE TABLE dbo.PurchaseInvoices (
                Id NVARCHAR(64) PRIMARY KEY,
                InvoiceNumber NVARCHAR(100) NOT NULL,
                BatchNumber NVARCHAR(100) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                DueDate DATETIME2 NULL,
                SupplierId NVARCHAR(64) NOT NULL,
                SupplierName NVARCHAR(255) NOT NULL,
                WarehouseId NVARCHAR(64) NOT NULL,
                CreatedById NVARCHAR(64) NULL,
                CreatedByName NVARCHAR(255) NULL,
                Subtotal DECIMAL(18, 4) NOT NULL DEFAULT 0,
                Discount DECIMAL(18, 4) NOT NULL DEFAULT 0,
                Tax DECIMAL(18, 4) NOT NULL DEFAULT 0,
                Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
                PaidAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
                PaidFromAccountId NVARCHAR(64) NULL,
                IsTaxIncluded BIT DEFAULT 0,
                Notes NVARCHAR(MAX) NULL,
                ItemsJson NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseReturns')
            CREATE TABLE dbo.PurchaseReturns (
                Id NVARCHAR(64) PRIMARY KEY,
                ReceiptNumber NVARCHAR(100) NULL,
                PurchaseInvoiceId NVARCHAR(64) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                SupplierId NVARCHAR(64) NOT NULL,
                SupplierName NVARCHAR(255) NOT NULL,
                WarehouseId NVARCHAR(64) NOT NULL,
                CreatedById NVARCHAR(64) NULL,
                CreatedByName NVARCHAR(255) NULL,
                Subtotal DECIMAL(18, 4) NOT NULL DEFAULT 0,
                Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
                PaidAmount DECIMAL(18, 4) DEFAULT 0,
                PaidToAccountId NVARCHAR(64) NULL,
                Notes NVARCHAR(MAX) NULL,
                ItemsJson NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            // Payments & Expenses
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CustomerPayments')
            CREATE TABLE dbo.CustomerPayments (
                Id NVARCHAR(64) PRIMARY KEY,
                ReceiptNumber NVARCHAR(100) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                CustomerId NVARCHAR(64) NOT NULL,
                InvoiceId NVARCHAR(64) NULL,
                Amount DECIMAL(18, 4) NOT NULL,
                PaidToAccountId NVARCHAR(64) NOT NULL,
                CreatedById NVARCHAR(64) NULL,
                CreatedByName NVARCHAR(255) NULL,
                Notes NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SupplierPayments')
            CREATE TABLE dbo.SupplierPayments (
                Id NVARCHAR(64) PRIMARY KEY,
                ReceiptNumber NVARCHAR(100) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                SupplierId NVARCHAR(64) NOT NULL,
                InvoiceId NVARCHAR(64) NULL,
                Amount DECIMAL(18, 4) NOT NULL,
                PaidFromAccountId NVARCHAR(64) NOT NULL,
                CreatedById NVARCHAR(64) NULL,
                CreatedByName NVARCHAR(255) NULL,
                Notes NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Expenses')
            CREATE TABLE dbo.Expenses (
                Id NVARCHAR(64) PRIMARY KEY,
                ReceiptNumber NVARCHAR(100) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                ExpenseType NVARCHAR(100) NOT NULL,
                Description NVARCHAR(500) NULL,
                Amount DECIMAL(18, 4) NOT NULL,
                TaxAmount DECIMAL(18, 4) DEFAULT 0,
                WarehouseId NVARCHAR(64) NULL,
                PaidFromAccountId NVARCHAR(64) NOT NULL,
                Status NVARCHAR(50) DEFAULT 'approved',
                CreatedById NVARCHAR(64) NULL,
                CreatedByName NVARCHAR(255) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ExceptionalIncomes')
            CREATE TABLE dbo.ExceptionalIncomes (
                Id NVARCHAR(64) PRIMARY KEY,
                ReceiptNumber NVARCHAR(100) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                IncomeType NVARCHAR(100) NOT NULL,
                Description NVARCHAR(500) NULL,
                Amount DECIMAL(18, 4) NOT NULL,
                WarehouseId NVARCHAR(64) NULL,
                PaidToAccountId NVARCHAR(64) NOT NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            // Inventory Movements (StockIn, StockOut, Transfers, Adjustments, Closings)
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockInRecords')
            CREATE TABLE dbo.StockInRecords (
                Id NVARCHAR(64) PRIMARY KEY,
                ReceiptNumber NVARCHAR(100) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                WarehouseId NVARCHAR(64) NOT NULL,
                PurchaseInvoiceId NVARCHAR(64) NULL,
                Reason NVARCHAR(100) DEFAULT 'purchase',
                Notes NVARCHAR(MAX) NULL,
                ItemsJson NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockOutRecords')
            CREATE TABLE dbo.StockOutRecords (
                Id NVARCHAR(64) PRIMARY KEY,
                ReceiptNumber NVARCHAR(100) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                WarehouseId NVARCHAR(64) NOT NULL,
                Reason NVARCHAR(100) DEFAULT 'wastage',
                Notes NVARCHAR(MAX) NULL,
                ItemsJson NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockTransferRecords')
            CREATE TABLE dbo.StockTransferRecords (
                Id NVARCHAR(64) PRIMARY KEY,
                ReceiptNumber NVARCHAR(100) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                FromSourceType NVARCHAR(50) DEFAULT 'warehouse',
                FromSourceId NVARCHAR(64) NOT NULL,
                ToSourceType NVARCHAR(50) DEFAULT 'warehouse',
                ToSourceId NVARCHAR(64) NOT NULL,
                Notes NVARCHAR(MAX) NULL,
                ItemsJson NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockAdjustmentRecords')
            CREATE TABLE dbo.StockAdjustmentRecords (
                Id NVARCHAR(64) PRIMARY KEY,
                ReceiptNumber NVARCHAR(100) NULL,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                WarehouseId NVARCHAR(64) NOT NULL,
                Reason NVARCHAR(100) DEFAULT 'inventory_audit',
                Notes NVARCHAR(MAX) NULL,
                ItemsJson NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InventoryClosings')
            CREATE TABLE dbo.InventoryClosings (
                Id NVARCHAR(64) PRIMARY KEY,
                ClosingDate DATETIME2 NOT NULL,
                WarehouseId NVARCHAR(64) NOT NULL,
                Notes NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            // POS Operations, Sessions & Terminals
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PosSessions')
            CREATE TABLE dbo.PosSessions (
                Id NVARCHAR(64) PRIMARY KEY,
                StartTime DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                EndTime DATETIME2 NULL,
                OpenedBy NVARCHAR(64) NOT NULL,
                OpenedByName NVARCHAR(255) NOT NULL,
                ClosedBy NVARCHAR(64) NULL,
                ClosedByName NVARCHAR(255) NULL,
                IsClosed BIT DEFAULT 0,
                PosTerminalId NVARCHAR(64) NULL,
                CashierSessionsJson NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PosTerminals')
            CREATE TABLE dbo.PosTerminals (
                Id NVARCHAR(64) PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                WarehouseId NVARCHAR(64) NULL,
                CashAccountId NVARCHAR(64) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PosAuditLogs')
            CREATE TABLE dbo.PosAuditLogs (
                Id NVARCHAR(64) PRIMARY KEY,
                Date DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                UserId NVARCHAR(64) NULL,
                UserName NVARCHAR(255) NULL,
                Action NVARCHAR(100) NOT NULL,
                Details NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CustomerVisits')
            CREATE TABLE dbo.CustomerVisits (
                Id NVARCHAR(64) PRIMARY KEY,
                Timestamp DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                SalesRepId NVARCHAR(64) NULL,
                SalesRepName NVARCHAR(255) NULL,
                CustomerId NVARCHAR(64) NULL,
                CustomerName NVARCHAR(255) NULL,
                Notes NVARCHAR(MAX) NULL,
                Latitude DECIMAL(18, 8) NULL,
                Longitude DECIMAL(18, 8) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LoginHistory')
            CREATE TABLE dbo.LoginHistory (
                Id NVARCHAR(64) PRIMARY KEY,
                Timestamp DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                UserId NVARCHAR(64) NULL,
                UserName NVARCHAR(255) NULL,
                IpAddress NVARCHAR(100) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'pending',
                LastSyncedAt DATETIME2 NULL
            );`,

            // Users, Roles & Settings
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Roles')
            CREATE TABLE dbo.Roles (
                Id NVARCHAR(100) PRIMARY KEY,
                PermissionsJson NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
            CREATE TABLE dbo.Users (
                Id NVARCHAR(64) PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                LoginName NVARCHAR(100) NOT NULL UNIQUE,
                Password NVARCHAR(255) NOT NULL,
                Role NVARCHAR(100) NOT NULL,
                Phone NVARCHAR(50) NULL,
                IsCashier BIT DEFAULT 0,
                IsDelivery BIT DEFAULT 0,
                IsSalesRep BIT DEFAULT 0,
                CanOpenOwnShift BIT DEFAULT 1,
                CanDeleteFromCart BIT DEFAULT 1,
                CanProcessReturn BIT DEFAULT 1,
                CanCancelInvoice BIT DEFAULT 1,
                CanBypassScannerForReturn BIT DEFAULT 1,
                IsDisabled BIT DEFAULT 0,
                WarehouseIds NVARCHAR(MAX) NULL,
                ThemeSettings NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppSettings')
            CREATE TABLE dbo.AppSettings (
                SettingKey NVARCHAR(100) PRIMARY KEY,
                SettingValue NVARCHAR(MAX) NULL,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL,
                UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Counters')
            CREATE TABLE dbo.Counters (
                Name NVARCHAR(100) PRIMARY KEY,
                CurrentValue BIGINT NOT NULL DEFAULT 1,
                BranchCode NVARCHAR(50) NULL,
                BranchName NVARCHAR(255) NULL,
                SyncStatus NVARCHAR(20) DEFAULT 'synced',
                LastSyncedAt DATETIME2 NULL
            );`
        ];

        for (const statement of ddlStatements) {
            await targetPool.request().query(statement);
        }

        // 4. Insert Default Warehouse if not exists
        await targetPool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.Warehouses)
            BEGIN
                INSERT INTO dbo.Warehouses (Id, Code, Name, BranchCode, BranchName)
                VALUES ('wh_default_01', '${branchCode}', N'${branchName}', '${branchCode}', N'${branchName}');
            END;
        `);

        // 5. Insert Default Cash Account if not exists
        await targetPool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.CashAccounts)
            BEGIN
                INSERT INTO dbo.CashAccounts (Id, Name, WarehouseId, OpeningBalance, BranchCode, BranchName)
                VALUES ('cash_default_01', N'الخزينة الرئيسية', 'wh_default_01', 0, '${branchCode}', N'${branchName}');
            END;
        `);

        // 6. Insert Default Admin User if not exists
        await targetPool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE LoginName = 'admin')
            BEGIN
                INSERT INTO dbo.Users (Id, Name, LoginName, Password, Role, BranchCode, BranchName, WarehouseIds)
                VALUES ('usr_admin_01', N'مدير النظام', 'admin', 'admin123', 'admin', '${branchCode}', N'${branchName}', '["all"]');
            END;
        `);

        // 7. Install Automatic Branch Triggers
        const triggers = [
            `CREATE OR ALTER TRIGGER trg_SalesInvoices_BranchSync
            ON dbo.SalesInvoices
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE s
                SET s.BranchCode = COALESCE(s.BranchCode, w.Code, '${branchCode}'),
                    s.BranchName = COALESCE(s.BranchName, w.Name, N'${branchName}')
                FROM dbo.SalesInvoices s
                INNER JOIN inserted i ON s.Id = i.Id
                LEFT JOIN dbo.Warehouses w ON s.WarehouseId = w.Id;
            END;`,

            `CREATE OR ALTER TRIGGER trg_PurchaseInvoices_BranchSync
            ON dbo.PurchaseInvoices
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE p
                SET p.BranchCode = COALESCE(p.BranchCode, w.Code, '${branchCode}'),
                    p.BranchName = COALESCE(p.BranchName, w.Name, N'${branchName}')
                FROM dbo.PurchaseInvoices p
                INNER JOIN inserted i ON p.Id = i.Id
                LEFT JOIN dbo.Warehouses w ON p.WarehouseId = w.Id;
            END;`,

            `CREATE OR ALTER TRIGGER trg_CustomerPayments_BranchSync
            ON dbo.CustomerPayments
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE cp
                SET cp.BranchCode = COALESCE(cp.BranchCode, ca.BranchCode, '${branchCode}'),
                    cp.BranchName = COALESCE(cp.BranchName, ca.BranchName, N'${branchName}')
                FROM dbo.CustomerPayments cp
                INNER JOIN inserted i ON cp.Id = i.Id
                LEFT JOIN dbo.CashAccounts ca ON cp.PaidToAccountId = ca.Id;
            END;`,

            `CREATE OR ALTER TRIGGER trg_SupplierPayments_BranchSync
            ON dbo.SupplierPayments
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE sp
                SET sp.BranchCode = COALESCE(sp.BranchCode, ca.BranchCode, '${branchCode}'),
                    sp.BranchName = COALESCE(sp.BranchName, ca.BranchName, N'${branchName}')
                FROM dbo.SupplierPayments sp
                INNER JOIN inserted i ON sp.Id = i.Id
                LEFT JOIN dbo.CashAccounts ca ON sp.PaidFromAccountId = ca.Id;
            END;`,

            `CREATE OR ALTER TRIGGER trg_Expenses_BranchSync
            ON dbo.Expenses
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE e
                SET e.BranchCode = COALESCE(e.BranchCode, w.Code, '${branchCode}'),
                    e.BranchName = COALESCE(e.BranchName, w.Name, N'${branchName}')
                FROM dbo.Expenses e
                INNER JOIN inserted i ON e.Id = i.Id
                LEFT JOIN dbo.Warehouses w ON e.WarehouseId = w.Id;
            END;`
        ];

        for (const trg of triggers) {
            await targetPool.request().query(trg);
        }

        // Count created tables
        const countRes = await targetPool.request().query(`
            SELECT COUNT(*) as cnt 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME != 'sysdiagrams'
        `);
        const tablesCount = countRes.recordset[0]?.cnt || 0;

        await targetPool.close();

        return {
            success: true,
            database: cleanDbName,
            tablesCount,
            message: `تم إنشاء وتهيئة قاعدة البيانات [${cleanDbName}] بنجاح، وتأسيس ${tablesCount} جدولاً، مع تثبيت المشغلات الآلية ورمز الفرع (${branchCode}).`
        };

    } catch (err: any) {
        if (masterPool) {
            try { await masterPool.close(); } catch {}
        }
        if (targetPool) {
            try { await targetPool.close(); } catch {}
        }
        return {
            success: false,
            database,
            tablesCount: 0,
            message: 'فشلت عملية تهيئة قاعدة البيانات',
            error: err.message
        };
    }
}

