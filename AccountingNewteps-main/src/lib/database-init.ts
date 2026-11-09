/**
 * @fileOverview محرك إنشاء وتهيئة قواعد البيانات (Database Initialization Engine)
 * يُتيح إنشاء وتأسيس قاعدة البيانات المركزية أو الفرعية بكامل جداولها (69 جدولاً)
 * والمشغلات الآلية (Triggers) والعروض التحليلية (Views) بضغطة زر واحدة مباشرة من التطبيق.
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

        // 3. Create all 69 Core Master and Transactional Tables with Branch tracking columns
        const ddlStatements = [
            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppSettings')
            CREATE TABLE dbo.[AppSettings] (
                [SettingKey] NVARCHAR(100) NOT NULL,
                [SettingValue] NVARCHAR(MAX) NOT NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_AppSettings] PRIMARY KEY CLUSTERED ([SettingKey])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BarcodeDesigns')
            CREATE TABLE dbo.[BarcodeDesigns] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NULL,
                [ConfigJson] NVARCHAR(MAX) NOT NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_BarcodeDesigns] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashAccounts')
            CREATE TABLE dbo.[CashAccounts] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Type] NVARCHAR(50) NOT NULL DEFAULT (N'drawer'),
                [OpeningBalance] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [UserId] NVARCHAR(64) NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CurrentBalance] DECIMAL(18,2) NULL DEFAULT ((0)),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_CashAccounts] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Counters')
            CREATE TABLE dbo.[Counters] (
                [Name] NVARCHAR(100) NOT NULL,
                [CurrentValue] BIGINT NOT NULL DEFAULT ((0)),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Counters] PRIMARY KEY CLUSTERED ([Name])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CustomerPayments')
            CREATE TABLE dbo.[CustomerPayments] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [CustomerId] NVARCHAR(64) NOT NULL,
                [InvoiceId] NVARCHAR(64) NULL,
                [Amount] DECIMAL(18,4) NOT NULL,
                [PaidToAccountId] NVARCHAR(64) NOT NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_CustomerPayments] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Customers')
            CREATE TABLE dbo.[Customers] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Phone] NVARCHAR(50) NULL,
                [Address] NVARCHAR(500) NULL,
                [AllowCredit] BIT NOT NULL DEFAULT ((1)),
                [CreditLimit] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [OpeningBalance] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [CurrentBalance] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [InvoiceCount] INT NOT NULL DEFAULT ((0)),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Customers] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CustomerVisits')
            CREATE TABLE dbo.[CustomerVisits] (
                [Id] NVARCHAR(64) NOT NULL,
                [SalesRepId] NVARCHAR(64) NULL,
                [SalesRepName] NVARCHAR(255) NULL,
                [CustomerName] NVARCHAR(255) NULL,
                [Timestamp] DATETIME2 NOT NULL,
                [Location] NVARCHAR(255) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_CustomerVisits] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DeliveryStaff')
            CREATE TABLE dbo.[DeliveryStaff] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Phone] NVARCHAR(50) NULL,
                [VehicleType] NVARCHAR(100) NULL,
                [VehicleNumber] NVARCHAR(50) NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [IsActive] BIT NOT NULL DEFAULT ((1)),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_DeliveryStaff] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DepreciationRecords')
            CREATE TABLE dbo.[DepreciationRecords] (
                [Id] NVARCHAR(64) NOT NULL,
                [AssetId] NVARCHAR(64) NOT NULL,
                [Date] DATETIME2 NOT NULL,
                [Amount] DECIMAL(18,4) NOT NULL,
                [AccumulatedTotal] DECIMAL(18,4) NOT NULL,
                [RemainingValue] DECIMAL(18,4) NOT NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_DepreciationRecords] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeAdjustments')
            CREATE TABLE dbo.[EmployeeAdjustments] (
                [Id] NVARCHAR(64) NOT NULL,
                [Date] DATETIME2 NOT NULL,
                [EmployeeId] NVARCHAR(64) NOT NULL,
                [EmployeeName] NVARCHAR(255) NULL,
                [Type] NVARCHAR(50) NOT NULL,
                [Amount] DECIMAL(18,4) NOT NULL,
                [Reason] NVARCHAR(500) NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_EmployeeAdjustments] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeAdvances')
            CREATE TABLE dbo.[EmployeeAdvances] (
                [Id] NVARCHAR(64) NOT NULL,
                [Date] DATETIME2 NOT NULL,
                [EmployeeId] NVARCHAR(64) NOT NULL,
                [Amount] DECIMAL(18,4) NOT NULL,
                [PaidFromAccountId] NVARCHAR(64) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_EmployeeAdvances] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Employees')
            CREATE TABLE dbo.[Employees] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Role] NVARCHAR(100) NULL,
                [Salary] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Phone] NVARCHAR(50) NULL,
                [HireDate] DATETIME2 NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Employees] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ExceptionalIncomes')
            CREATE TABLE dbo.[ExceptionalIncomes] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [IncomeType] NVARCHAR(100) NULL,
                [Description] NVARCHAR(500) NULL,
                [Amount] DECIMAL(18,4) NOT NULL,
                [PaidToAccountId] NVARCHAR(64) NOT NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_ExceptionalIncomes] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Expenses')
            CREATE TABLE dbo.[Expenses] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [ExpenseType] NVARCHAR(100) NULL,
                [Description] NVARCHAR(500) NULL,
                [Amount] DECIMAL(18,4) NOT NULL,
                [TaxAmount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [WarehouseId] NVARCHAR(64) NULL,
                [PaidFromAccountId] NVARCHAR(64) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'completed'),
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Expenses] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FixedAssets')
            CREATE TABLE dbo.[FixedAssets] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(100) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [PurchaseDate] DATETIME2 NOT NULL,
                [PurchasePrice] DECIMAL(18,4) NOT NULL,
                [CurrentValue] DECIMAL(18,4) NOT NULL,
                [DepreciationRate] DECIMAL(5,2) NOT NULL DEFAULT ((0)),
                [DepreciationMethod] NVARCHAR(50) NOT NULL DEFAULT (N'straight_line'),
                [WarehouseId] NVARCHAR(64) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'active'),
                [Notes] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_FixedAssets] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GratuityDistributions')
            CREATE TABLE dbo.[GratuityDistributions] (
                [Id] NVARCHAR(64) NOT NULL,
                [Date] DATETIME2 NOT NULL,
                [TotalAmount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [DetailsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_GratuityDistributions] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GratuityLogs')
            CREATE TABLE dbo.[GratuityLogs] (
                [Id] NVARCHAR(64) NOT NULL,
                [Date] DATETIME2 NOT NULL,
                [Amount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [InvoiceNumber] NVARCHAR(100) NULL,
                [InvoiceId] NVARCHAR(64) NULL,
                [CashierId] NVARCHAR(64) NULL,
                [CashierName] NVARCHAR(255) NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_GratuityLogs] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'HeldInvoices')
            CREATE TABLE dbo.[HeldInvoices] (
                [Id] NVARCHAR(64) NOT NULL,
                [HeldAt] DATETIME2 NOT NULL,
                [CashierId] NVARCHAR(64) NULL,
                [CashierName] NVARCHAR(255) NULL,
                [TerminalId] NVARCHAR(64) NULL,
                [TableId] NVARCHAR(64) NULL,
                [CustomerName] NVARCHAR(255) NULL,
                [Total] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [CartData] NVARCHAR(MAX) NOT NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_HeldInvoices] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InventoryClosings')
            CREATE TABLE dbo.[InventoryClosings] (
                [Id] NVARCHAR(64) NOT NULL,
                [ClosingDate] DATETIME2 NOT NULL,
                [WarehouseId] NVARCHAR(64) NOT NULL,
                [ClosedById] NVARCHAR(64) NULL,
                [ClosedByName] NVARCHAR(255) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [BalancesJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_InventoryClosings] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InventorySections')
            CREATE TABLE dbo.[InventorySections] (
                [Id] NVARCHAR(64) NOT NULL,
                [MainWarehouseId] NVARCHAR(64) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Capacity] INT NULL DEFAULT ((0)),
                [AllowOverfill] BIT NULL DEFAULT ((1)),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_InventorySections] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InventoryZones')
            CREATE TABLE dbo.[InventoryZones] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_InventoryZones] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemCategories')
            CREATE TABLE dbo.[ItemCategories] (
                [Id] NVARCHAR(64) NOT NULL,
                [SectionId] NVARCHAR(64) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_ItemCategories] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemColors')
            CREATE TABLE dbo.[ItemColors] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(100) NOT NULL,
                [ColorCode] NVARCHAR(50) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_ItemColors] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemGroups')
            CREATE TABLE dbo.[ItemGroups] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Code] NVARCHAR(50) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_ItemGroups] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Items')
            CREATE TABLE dbo.[Items] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(100) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Cost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Price] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [BaseUnit] NVARCHAR(50) NOT NULL DEFAULT (N'piece'),
                [ItemType] NVARCHAR(50) NOT NULL DEFAULT (N'standard'),
                [ReorderPoint] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [SectionId] NVARCHAR(64) NULL,
                [CategoryId] NVARCHAR(64) NULL,
                [IsDisabled] BIT NOT NULL DEFAULT ((0)),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [Barcode] NVARCHAR(100) NULL,
                [BarcodeType] NVARCHAR(50) NULL,
                [ItemGroupId] NVARCHAR(64) NULL,
                [SubCategoryId1] NVARCHAR(64) NULL,
                [SubCategoryId2] NVARCHAR(64) NULL,
                [Color] NVARCHAR(50) NULL,
                [Size] NVARCHAR(50) NULL,
                [DefaultBinId] NVARCHAR(64) NULL,
                [SecondaryUnitsJson] NVARCHAR(MAX) NULL,
                [ComponentsJson] NVARCHAR(MAX) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Items] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSections')
            CREATE TABLE dbo.[ItemSections] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(50) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_ItemSections] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSizes')
            CREATE TABLE dbo.[ItemSizes] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(100) NOT NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_ItemSizes] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSubCategories1')
            CREATE TABLE dbo.[ItemSubCategories1] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_ItemSubCategories1] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSubCategories2')
            CREATE TABLE dbo.[ItemSubCategories2] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_ItemSubCategories2] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Licenses')
            CREATE TABLE dbo.[Licenses] (
                [Id] NVARCHAR(64) NOT NULL,
                [Key] NVARCHAR(255) NOT NULL,
                [StartDate] DATETIME2 NULL,
                [EndDate] DATETIME2 NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'active'),
                [MaxUsers] INT NOT NULL DEFAULT ((10)),
                [EnabledModules] NVARCHAR(MAX) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Licenses] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LoginHistory')
            CREATE TABLE dbo.[LoginHistory] (
                [Id] NVARCHAR(64) NOT NULL,
                [UserId] NVARCHAR(64) NULL,
                [UserName] NVARCHAR(255) NULL,
                [Timestamp] DATETIME2 NOT NULL,
                [Latitude] FLOAT NULL,
                [Longitude] FLOAT NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_LoginHistory] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Notifications')
            CREATE TABLE dbo.[Notifications] (
                [Id] NVARCHAR(64) NOT NULL,
                [Title] NVARCHAR(255) NOT NULL,
                [Body] NVARCHAR(MAX) NOT NULL,
                [Timestamp] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [IsRead] BIT NOT NULL DEFAULT ((0)),
                [TargetUserId] NVARCHAR(64) NULL,
                [Type] NVARCHAR(50) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Notifications] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Partners')
            CREATE TABLE dbo.[Partners] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [SharePercentage] DECIMAL(5,2) NOT NULL DEFAULT ((0)),
                [Contact] NVARCHAR(255) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Partners] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PaymentMethods')
            CREATE TABLE dbo.[PaymentMethods] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [AccountId] NVARCHAR(64) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_PaymentMethods] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PayrollRecords')
            CREATE TABLE dbo.[PayrollRecords] (
                [Id] NVARCHAR(64) NOT NULL,
                [Date] DATETIME2 NOT NULL,
                [Month] NVARCHAR(50) NULL,
                [PaidFromAccountId] NVARCHAR(64) NULL,
                [TotalAmount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [DetailsJson] NVARCHAR(MAX) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_PayrollRecords] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PosAuditLogs')
            CREATE TABLE dbo.[PosAuditLogs] (
                [Id] NVARCHAR(64) NOT NULL,
                [Date] DATETIME2 NOT NULL,
                [CashierId] NVARCHAR(64) NULL,
                [CashierName] NVARCHAR(255) NULL,
                [Action] NVARCHAR(100) NOT NULL,
                [Details] NVARCHAR(MAX) NULL,
                [InvoiceId] NVARCHAR(64) NULL,
                [TerminalId] NVARCHAR(64) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_PosAuditLogs] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PosSessions')
            CREATE TABLE dbo.[PosSessions] (
                [Id] NVARCHAR(64) NOT NULL,
                [StartTime] DATETIME2 NOT NULL,
                [EndTime] DATETIME2 NULL,
                [OpenedBy] NVARCHAR(64) NULL,
                [OpenedByName] NVARCHAR(255) NULL,
                [ClosedBy] NVARCHAR(64) NULL,
                [ClosedByName] NVARCHAR(255) NULL,
                [IsClosed] BIT NOT NULL DEFAULT ((0)),
                [PosTerminalId] NVARCHAR(64) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CashierSessionsJson] NVARCHAR(MAX) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_PosSessions] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PosTerminals')
            CREATE TABLE dbo.[PosTerminals] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(50) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_PosTerminals] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PriceChangeLogs')
            CREATE TABLE dbo.[PriceChangeLogs] (
                [Id] NVARCHAR(64) NOT NULL,
                [ItemId] NVARCHAR(64) NOT NULL,
                [ItemCode] NVARCHAR(100) NULL,
                [ItemName] NVARCHAR(255) NULL,
                [OldPrice] DECIMAL(18,4) NOT NULL,
                [NewPrice] DECIMAL(18,4) NOT NULL,
                [OldCost] DECIMAL(18,4) NOT NULL,
                [NewCost] DECIMAL(18,4) NOT NULL,
                [Timestamp] DATETIME2 NOT NULL,
                [ChangedById] NVARCHAR(64) NULL,
                [ChangedByName] NVARCHAR(255) NULL,
                [Reason] NVARCHAR(500) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_PriceChangeLogs] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ProfitDistributions')
            CREATE TABLE dbo.[ProfitDistributions] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [PartnerId] NVARCHAR(64) NULL,
                [PartnerName] NVARCHAR(255) NULL,
                [Amount] DECIMAL(18,4) NOT NULL,
                [PaidFromAccountId] NVARCHAR(64) NOT NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_ProfitDistributions] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Promotions')
            CREATE TABLE dbo.[Promotions] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Type] NVARCHAR(50) NOT NULL,
                [Value] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [StartDate] DATETIME2 NOT NULL,
                [EndDate] DATETIME2 NOT NULL,
                [IsActive] BIT NOT NULL DEFAULT ((1)),
                [ConditionsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Promotions] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseInvoiceItems')
            CREATE TABLE dbo.[PurchaseInvoiceItems] (
                [Id] INT IDENTITY(1,1) NOT NULL,
                [PurchaseInvoiceId] NVARCHAR(64) NOT NULL,
                [ItemId] NVARCHAR(64) NULL,
                [ItemCode] NVARCHAR(100) NULL,
                [ItemName] NVARCHAR(255) NULL,
                [Qty] DECIMAL(18,4) NOT NULL DEFAULT ((1)),
                [OriginalQty] DECIMAL(18,4) NULL,
                [OriginalUnit] NVARCHAR(50) NULL,
                [ConversionFactor] DECIMAL(18,4) NOT NULL DEFAULT ((1)),
                [Cost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [SellingPrice] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Total] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_PurchaseInvoiceItems] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseInvoices')
            CREATE TABLE dbo.[PurchaseInvoices] (
                [Id] NVARCHAR(64) NOT NULL,
                [InvoiceNumber] NVARCHAR(100) NULL,
                [BatchNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [DueDate] DATETIME2 NULL,
                [SupplierId] NVARCHAR(64) NULL,
                [SupplierName] NVARCHAR(255) NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [Subtotal] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Discount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Tax] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Total] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [PaidAmount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [PaidFromAccountId] NVARCHAR(64) NULL,
                [IsTaxIncluded] BIT NOT NULL DEFAULT ((0)),
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_PurchaseInvoices] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseOrders')
            CREATE TABLE dbo.[PurchaseOrders] (
                [Id] NVARCHAR(64) NOT NULL,
                [OrderNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [ExpectedDate] DATETIME2 NULL,
                [SupplierId] NVARCHAR(64) NULL,
                [SupplierName] NVARCHAR(255) NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'pending'),
                [Total] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_PurchaseOrders] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseReturnItems')
            CREATE TABLE dbo.[PurchaseReturnItems] (
                [Id] INT IDENTITY(1,1) NOT NULL,
                [ReturnId] NVARCHAR(64) NOT NULL,
                [ItemId] NVARCHAR(64) NULL,
                [ItemCode] NVARCHAR(100) NULL,
                [ItemName] NVARCHAR(255) NULL,
                [Qty] DECIMAL(18,4) NOT NULL DEFAULT ((1)),
                [Cost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Total] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_PurchaseReturnItems] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseReturns')
            CREATE TABLE dbo.[PurchaseReturns] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [OriginalInvoiceId] NVARCHAR(64) NULL,
                [Date] DATETIME2 NOT NULL,
                [SupplierId] NVARCHAR(64) NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [Subtotal] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Discount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Total] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [PaidAmount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [PaidToAccountId] NVARCHAR(64) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_PurchaseReturns] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RepRemittances')
            CREATE TABLE dbo.[RepRemittances] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [SalesRepId] NVARCHAR(64) NOT NULL,
                [SalesRepName] NVARCHAR(255) NULL,
                [Amount] DECIMAL(18,4) NOT NULL,
                [ToAccountId] NVARCHAR(64) NOT NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_RepRemittances] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Requisitions')
            CREATE TABLE dbo.[Requisitions] (
                [Id] NVARCHAR(64) NOT NULL,
                [RequisitionNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [RequestedById] NVARCHAR(64) NULL,
                [RequestedByName] NVARCHAR(255) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'pending'),
                [Priority] NVARCHAR(50) NOT NULL DEFAULT (N'normal'),
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Requisitions] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RestaurantTables')
            CREATE TABLE dbo.[RestaurantTables] (
                [Id] NVARCHAR(64) NOT NULL,
                [TableNumber] NVARCHAR(50) NOT NULL,
                [Capacity] INT NOT NULL DEFAULT ((4)),
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'available'),
                [Zone] NVARCHAR(100) NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_RestaurantTables] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Roles')
            CREATE TABLE dbo.[Roles] (
                [Id] NVARCHAR(100) NOT NULL,
                [PermissionsJson] NVARCHAR(MAX) NOT NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Roles] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesInvoiceItems')
            CREATE TABLE dbo.[SalesInvoiceItems] (
                [Id] INT IDENTITY(1,1) NOT NULL,
                [InvoiceId] NVARCHAR(64) NOT NULL,
                [ItemId] NVARCHAR(64) NULL,
                [ItemCode] NVARCHAR(100) NULL,
                [ItemName] NVARCHAR(255) NULL,
                [Qty] DECIMAL(18,4) NOT NULL DEFAULT ((1)),
                [Price] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Cost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Total] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_SalesInvoiceItems] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesInvoices')
            CREATE TABLE dbo.[SalesInvoices] (
                [Id] NVARCHAR(64) NOT NULL,
                [InvoiceNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [CustomerId] NVARCHAR(64) NULL,
                [CustomerName] NVARCHAR(255) NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [SalesRepId] NVARCHAR(64) NULL,
                [CashierId] NVARCHAR(64) NULL,
                [Subtotal] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Discount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Tax] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Total] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [PaidAmount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [PaidToAccountId] NVARCHAR(64) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'approved'),
                [IsDelivery] BIT NOT NULL DEFAULT ((0)),
                [DeliveryReconciled] BIT NOT NULL DEFAULT ((0)),
                [IsTaxIncluded] BIT NOT NULL DEFAULT ((0)),
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_SalesInvoices] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesReturnItems')
            CREATE TABLE dbo.[SalesReturnItems] (
                [Id] INT IDENTITY(1,1) NOT NULL,
                [ReturnId] NVARCHAR(64) NOT NULL,
                [ItemId] NVARCHAR(64) NULL,
                [ItemCode] NVARCHAR(100) NULL,
                [ItemName] NVARCHAR(255) NULL,
                [Qty] DECIMAL(18,4) NOT NULL DEFAULT ((1)),
                [Price] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Cost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Total] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_SalesReturnItems] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesReturns')
            CREATE TABLE dbo.[SalesReturns] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [OriginalInvoiceId] NVARCHAR(64) NULL,
                [Date] DATETIME2 NOT NULL,
                [CustomerId] NVARCHAR(64) NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [Subtotal] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Total] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [PaidAmount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [PaidFromAccountId] NVARCHAR(64) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_SalesReturns] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Sellers')
            CREATE TABLE dbo.[Sellers] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Phone] NVARCHAR(50) NULL,
                [CommissionRate] DECIMAL(5,2) NOT NULL DEFAULT ((0)),
                [WarehouseId] NVARCHAR(64) NULL,
                [IsActive] BIT NOT NULL DEFAULT ((1)),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Sellers] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockAdjustmentItems')
            CREATE TABLE dbo.[StockAdjustmentItems] (
                [Id] INT IDENTITY(1,1) NOT NULL,
                [AdjustmentId] NVARCHAR(64) NOT NULL,
                [ItemId] NVARCHAR(64) NULL,
                [ItemName] NVARCHAR(255) NULL,
                [SystemQty] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [ActualQty] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Difference] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_StockAdjustmentItems] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockAdjustmentRecords')
            CREATE TABLE dbo.[StockAdjustmentRecords] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [Reason] NVARCHAR(255) NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_StockAdjustmentRecords] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockInRecordItems')
            CREATE TABLE dbo.[StockInRecordItems] (
                [Id] INT IDENTITY(1,1) NOT NULL,
                [StockInId] NVARCHAR(64) NOT NULL,
                [ItemId] NVARCHAR(64) NULL,
                [ItemCode] NVARCHAR(100) NULL,
                [ItemName] NVARCHAR(255) NULL,
                [Qty] DECIMAL(18,4) NOT NULL DEFAULT ((1)),
                [Cost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Total] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_StockInRecordItems] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockInRecords')
            CREATE TABLE dbo.[StockInRecords] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [BatchNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [PurchaseInvoiceId] NVARCHAR(64) NULL,
                [Reason] NVARCHAR(255) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'approved'),
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_StockInRecords] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockIssuesToReps')
            CREATE TABLE dbo.[StockIssuesToReps] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [SalesRepId] NVARCHAR(64) NULL,
                [SalesRepName] NVARCHAR(255) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'approved'),
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_StockIssuesToReps] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockOutRecords')
            CREATE TABLE dbo.[StockOutRecords] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [SourceId] NVARCHAR(64) NULL,
                [SaleInvoiceId] NVARCHAR(64) NULL,
                [Reason] NVARCHAR(255) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'approved'),
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_StockOutRecords] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockReturnsFromReps')
            CREATE TABLE dbo.[StockReturnsFromReps] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [SalesRepId] NVARCHAR(64) NULL,
                [SalesRepName] NVARCHAR(255) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'approved'),
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_StockReturnsFromReps] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockTransferRecords')
            CREATE TABLE dbo.[StockTransferRecords] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [FromWarehouseId] NVARCHAR(64) NULL,
                [ToWarehouseId] NVARCHAR(64) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'pending'),
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_StockTransferRecords] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SupplierPayments')
            CREATE TABLE dbo.[SupplierPayments] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [SupplierId] NVARCHAR(64) NOT NULL,
                [InvoiceId] NVARCHAR(64) NULL,
                [Amount] DECIMAL(18,4) NOT NULL,
                [PaidFromAccountId] NVARCHAR(64) NOT NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_SupplierPayments] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Suppliers')
            CREATE TABLE dbo.[Suppliers] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Contact] NVARCHAR(255) NULL,
                [OpeningBalance] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CurrentBalance] DECIMAL(18,2) NULL DEFAULT ((0)),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Suppliers] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncWatermarks')
            CREATE TABLE dbo.[SyncWatermarks] (
                [TableName] NVARCHAR(128) NOT NULL,
                [LastPushWatermark] DATETIME2 NULL,
                [LastPullWatermark] DATETIME2 NULL,
                [LastSyncCheckAt] DATETIME2 NULL,
                [SyncDirection] NVARCHAR(20) NULL DEFAULT ('push'),
                [Notes] NVARCHAR(255) NULL,
                CONSTRAINT [PK_SyncWatermarks] PRIMARY KEY CLUSTERED ([TableName])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncTrackingMatrix')
            CREATE TABLE dbo.[SyncTrackingMatrix] (
                [TableName] NVARCHAR(128) NOT NULL,
                [TableDisplayName] NVARCHAR(255) NOT NULL,
                [Category] NVARCHAR(100) NOT NULL,
                [SyncDirection] NVARCHAR(30) NOT NULL DEFAULT ('push'),
                [LastLocalTimestamp] DATETIME2 NULL,
                [LastSyncedTimestamp] DATETIME2 NULL,
                [LastCentralTimestamp] DATETIME2 NULL,
                [LocalRowsCount] INT NOT NULL DEFAULT 0,
                [CentralBranchRowsCount] INT NULL DEFAULT 0,
                [CentralTotalRowsCount] INT NULL DEFAULT 0,
                [PendingChangesCount] INT NOT NULL DEFAULT 0,
                [SyncStatus] NVARCHAR(50) NOT NULL DEFAULT ('pending'),
                [LastSyncCheckAt] DATETIME2 NOT NULL DEFAULT sysutcdatetime(),
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT sysutcdatetime(),
                CONSTRAINT [PK_SyncTrackingMatrix] PRIMARY KEY CLUSTERED ([TableName])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Targets')
            CREATE TABLE dbo.[Targets] (
                [Id] NVARCHAR(64) NOT NULL,
                [TargetKey] NVARCHAR(100) NOT NULL,
                [TargetPeriod] NVARCHAR(50) NOT NULL,
                [TargetAmount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [AchievedAmount] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [DetailsJson] NVARCHAR(MAX) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Targets] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TreasuryTransactions')
            CREATE TABLE dbo.[TreasuryTransactions] (
                [Id] NVARCHAR(64) NOT NULL,
                [ReceiptNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [AccountId] NVARCHAR(64) NOT NULL,
                [Type] NVARCHAR(50) NOT NULL,
                [Amount] DECIMAL(18,4) NOT NULL,
                [Description] NVARCHAR(500) NULL,
                [LinkedTransactionId] NVARCHAR(64) NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_TreasuryTransactions] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
            CREATE TABLE dbo.[Users] (
                [Id] NVARCHAR(64) NOT NULL,
                [LoginName] NVARCHAR(100) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Password] NVARCHAR(255) NOT NULL,
                [Phone] NVARCHAR(50) NULL,
                [Role] NVARCHAR(100) NULL,
                [WarehouseIds] NVARCHAR(MAX) NULL,
                [Uid] NVARCHAR(100) NULL,
                [IsCashier] BIT NOT NULL DEFAULT ((0)),
                [IsDelivery] BIT NOT NULL DEFAULT ((0)),
                [IsSalesRep] BIT NOT NULL DEFAULT ((0)),
                [CanOpenOwnShift] BIT NOT NULL DEFAULT ((1)),
                [CanDeleteFromCart] BIT NOT NULL DEFAULT ((1)),
                [CanProcessReturn] BIT NOT NULL DEFAULT ((1)),
                [CanCancelInvoice] BIT NOT NULL DEFAULT ((0)),
                [CanBypassScannerForReturn] BIT NOT NULL DEFAULT ((0)),
                [IsDisabled] BIT NOT NULL DEFAULT ((0)),
                [ThemeSettings] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Users] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Warehouses')
            CREATE TABLE dbo.[Warehouses] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(50) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Address] NVARCHAR(500) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                CONSTRAINT [PK_Warehouses] PRIMARY KEY CLUSTERED ([Id])
            );`
        ];

        for (const ddl of ddlStatements) {
            try {
                await targetPool.request().query(ddl);
            } catch (tableErr: any) {
                console.error('Error creating table in init:', tableErr.message);
            }
        }

        // 4. Ensure branch columns & triggers are installed
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
            try {
                await targetPool.request().query(trg);
            } catch (trgErr: any) {
                console.error('Error creating trigger:', trgErr.message);
            }
        }

        // 5. Install Analytical Views
        const views = [
            `CREATE OR ALTER VIEW dbo.View_CustomerBalances AS
            SELECT 
                c.Id AS CustomerId, c.Name AS CustomerName, c.Phone, c.CreditLimit, c.OpeningBalance,
                COALESCE(inv.TotalInvoiced, 0) AS TotalInvoiced,
                COALESCE(inv.PaidOnInvoices, 0) AS PaidOnInvoices,
                COALESCE(pmt.TotalReceipts, 0) AS TotalReceipts,
                COALESCE(ret.TotalReturns, 0) AS TotalReturns,
                (c.OpeningBalance + COALESCE(inv.TotalInvoiced, 0) - COALESCE(inv.PaidOnInvoices, 0) - COALESCE(pmt.TotalReceipts, 0) - COALESCE(ret.TotalReturns, 0)) AS CurrentCalculatedBalance
            FROM dbo.Customers c
            LEFT JOIN (SELECT CustomerId, SUM(Total) AS TotalInvoiced, SUM(PaidAmount) AS PaidOnInvoices FROM dbo.SalesInvoices WHERE Status = 'approved' GROUP BY CustomerId) inv ON c.Id = inv.CustomerId
            LEFT JOIN (SELECT CustomerId, SUM(Amount) AS TotalReceipts FROM dbo.CustomerPayments GROUP BY CustomerId) pmt ON c.Id = pmt.CustomerId
            LEFT JOIN (SELECT CustomerId, SUM(Total) AS TotalReturns FROM dbo.SalesReturns GROUP BY CustomerId) ret ON c.Id = ret.CustomerId;`,

            `CREATE OR ALTER VIEW dbo.View_SupplierBalances AS
            SELECT 
                s.Id AS SupplierId, s.Name AS SupplierName, s.Contact, s.OpeningBalance,
                COALESCE(purch.TotalPurchases, 0) AS TotalPurchases,
                COALESCE(purch.PaidOnPurchases, 0) AS PaidOnPurchases,
                COALESCE(pmt.TotalDisbursements, 0) AS TotalDisbursements,
                COALESCE(ret.TotalReturns, 0) AS TotalReturns,
                (s.OpeningBalance + COALESCE(purch.TotalPurchases, 0) - COALESCE(purch.PaidOnPurchases, 0) - COALESCE(pmt.TotalDisbursements, 0) - COALESCE(ret.TotalReturns, 0)) AS CurrentCalculatedBalance
            FROM dbo.Suppliers s
            LEFT JOIN (SELECT SupplierId, SUM(Total) AS TotalPurchases, SUM(PaidAmount) AS PaidOnPurchases FROM dbo.PurchaseInvoices GROUP BY SupplierId) purch ON s.Id = purch.SupplierId
            LEFT JOIN (SELECT SupplierId, SUM(Amount) AS TotalDisbursements FROM dbo.SupplierPayments GROUP BY SupplierId) pmt ON s.Id = pmt.SupplierId
            LEFT JOIN (SELECT SupplierId, SUM(Total) AS TotalReturns FROM dbo.PurchaseReturns GROUP BY SupplierId) ret ON s.Id = ret.SupplierId;`,

            `CREATE OR ALTER VIEW dbo.View_CashAccountBalances AS
            SELECT 
                ca.Id AS AccountId, ca.Name AS AccountName, ca.Type AS AccountType, ca.OpeningBalance,
                COALESCE(cp.TotalCustomerPayments, 0) AS TotalCustomerPayments,
                COALESCE(si.TotalCashSales, 0) AS TotalCashSales,
                COALESCE(dep.TotalDeposits, 0) AS TotalDeposits,
                COALESCE(sp.TotalSupplierPayments, 0) AS TotalSupplierPayments,
                COALESCE(ex.TotalExpenses, 0) AS TotalExpenses,
                COALESCE(withd.TotalWithdrawals, 0) AS TotalWithdrawals,
                (ca.OpeningBalance + COALESCE(cp.TotalCustomerPayments, 0) + COALESCE(si.TotalCashSales, 0) + COALESCE(dep.TotalDeposits, 0) - COALESCE(sp.TotalSupplierPayments, 0) - COALESCE(ex.TotalExpenses, 0) - COALESCE(withd.TotalWithdrawals, 0)) AS CurrentBalance
            FROM dbo.CashAccounts ca
            LEFT JOIN (SELECT PaidToAccountId, SUM(Amount) AS TotalCustomerPayments FROM dbo.CustomerPayments GROUP BY PaidToAccountId) cp ON ca.Id = cp.PaidToAccountId
            LEFT JOIN (SELECT PaidToAccountId, SUM(PaidAmount) AS TotalCashSales FROM dbo.SalesInvoices WHERE Status = 'approved' GROUP BY PaidToAccountId) si ON ca.Id = si.PaidToAccountId
            LEFT JOIN (SELECT AccountId, SUM(Amount) AS TotalDeposits FROM dbo.TreasuryTransactions WHERE Type = 'deposit' GROUP BY AccountId) dep ON ca.Id = dep.AccountId
            LEFT JOIN (SELECT PaidFromAccountId, SUM(Amount) AS TotalSupplierPayments FROM dbo.SupplierPayments GROUP BY PaidFromAccountId) sp ON ca.Id = sp.PaidFromAccountId
            LEFT JOIN (SELECT PaidFromAccountId, SUM(Amount) AS TotalExpenses FROM dbo.Expenses WHERE Status <> 'pending' GROUP BY PaidFromAccountId) ex ON ca.Id = ex.PaidFromAccountId
            LEFT JOIN (SELECT AccountId, SUM(Amount) AS TotalWithdrawals FROM dbo.TreasuryTransactions WHERE Type = 'withdrawal' GROUP BY AccountId) withd ON ca.Id = withd.AccountId;`,

            `CREATE OR ALTER VIEW dbo.View_ItemStockBalances AS
            WITH InwardStock AS (
                SELECT sii.ItemId, si.WarehouseId, SUM(sii.Qty) AS Qty
                FROM dbo.StockInRecordItems sii
                JOIN dbo.StockInRecords si ON sii.StockInId = si.Id
                WHERE si.Status = 'approved'
                GROUP BY sii.ItemId, si.WarehouseId
                UNION ALL
                SELECT sri.ItemId, sr.WarehouseId, SUM(sri.Qty) AS Qty
                FROM dbo.SalesReturnItems sri
                JOIN dbo.SalesReturns sr ON sri.ReturnId = sr.Id
                GROUP BY sri.ItemId, sr.WarehouseId
            ),
            OutwardStock AS (
                SELECT sii.ItemId, si.WarehouseId, SUM(sii.Qty) AS Qty
                FROM dbo.SalesInvoiceItems sii
                JOIN dbo.SalesInvoices si ON sii.InvoiceId = si.Id
                WHERE si.Status = 'approved'
                GROUP BY sii.ItemId, si.WarehouseId
                UNION ALL
                SELECT pri.ItemId, pr.WarehouseId, SUM(pri.Qty) AS Qty
                FROM dbo.PurchaseReturnItems pri
                JOIN dbo.PurchaseReturns pr ON pri.ReturnId = pr.Id
                GROUP BY pri.ItemId, pr.WarehouseId
            )
            SELECT 
                i.Id AS ItemId, i.Code AS ItemCode, i.Name AS ItemName,
                w.Id AS WarehouseId, w.Name AS WarehouseName,
                COALESCE(inw.TotalIn, 0) AS TotalInward,
                COALESCE(outw.TotalOut, 0) AS TotalOutward,
                (COALESCE(inw.TotalIn, 0) - COALESCE(outw.TotalOut, 0)) AS CurrentStock
            FROM dbo.Items i
            CROSS JOIN dbo.Warehouses w
            LEFT JOIN (SELECT ItemId, WarehouseId, SUM(Qty) AS TotalIn FROM InwardStock GROUP BY ItemId, WarehouseId) inw ON i.Id = inw.ItemId AND w.Id = inw.WarehouseId
            LEFT JOIN (SELECT ItemId, WarehouseId, SUM(Qty) AS TotalOut FROM OutwardStock GROUP BY ItemId, WarehouseId) outw ON i.Id = outw.ItemId AND w.Id = outw.WarehouseId;`
        ];

        for (const vw of views) {
            try {
                await targetPool.request().query(vw);
            } catch (vwErr: any) {
                console.error('Error creating view:', vwErr.message);
            }
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
            message: `تم إنشاء وتهيئة كافة جداول قاعدة البيانات [${cleanDbName}] بنجاح (${tablesCount} جدولاً بالكامل)، مع تثبيت المشغلات التلقائية والعروض التحليلية ورمز الفرع (${branchCode}).`
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
