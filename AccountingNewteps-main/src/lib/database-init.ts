/**
 * @fileOverview محرك إنشاء وتهيئة قواعد البيانات (Database Initialization Engine)
 * يُتيح إنشاء وتأسيس قاعدة البيانات المركزية أو الفرعية بكامل جداولها (72+ جدولاً شاملة ركائز الـ ERP المؤسسية)
 * وترقية الأعمدة تلقائياً والمشغلات الآلية (Triggers) والعروض التحليلية (Views) بضغطة زر واحدة مباشرة من التطبيق.
 */

import sql from 'mssql';
import { TABLE_METADATA_MAP } from './central-sync';

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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_Expenses] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FixedAssets')
            CREATE TABLE dbo.[FixedAssets] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(100) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [PurchaseDate] DATETIME2 NOT NULL,
                [PurchasePrice] DECIMAL(18,4) NOT NULL,
                [Cost] DECIMAL(18,4) NULL DEFAULT ((0)),
                [CurrentValue] DECIMAL(18,4) NOT NULL,
                [UsefulLifeYears] INT NULL DEFAULT ((5)),
                [SalvageValue] DECIMAL(18,4) NULL DEFAULT ((0)),
                [DepreciationRate] DECIMAL(5,2) NOT NULL DEFAULT ((0)),
                [DepreciationMethod] NVARCHAR(50) NOT NULL DEFAULT (N'straight_line'),
                [WarehouseId] NVARCHAR(64) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'active'),
                [DisposedDate] DATETIME2 NULL,
                [SaleProceeds] DECIMAL(18,4) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_InventoryClosings] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InventorySections')
            CREATE TABLE dbo.[InventorySections] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(50) NULL,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_InventoryZones] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemCategories')
            CREATE TABLE dbo.[ItemCategories] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(50) NULL,
                [SectionId] NVARCHAR(64) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_ItemColors] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemGroups')
            CREATE TABLE dbo.[ItemGroups] (
                [Id] NVARCHAR(64) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Code] NVARCHAR(50) NULL,
                [ParentCategoryId] NVARCHAR(64) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_ItemSizes] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSubCategories1')
            CREATE TABLE dbo.[ItemSubCategories1] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(50) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_ItemSubCategories1] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSubCategories2')
            CREATE TABLE dbo.[ItemSubCategories2] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(50) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [ClosingStatementJson] NVARCHAR(MAX) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_PosSessions] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PosTerminals')
            CREATE TABLE dbo.[PosTerminals] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(50) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [PosPrinterType] NVARCHAR(50) NULL DEFAULT (N'system'),
                [PosPrinterAddress] NVARCHAR(255) NULL,
                [EnableKitchenPrinter] BIT NULL DEFAULT ((0)),
                [KitchenPrinterType] NVARCHAR(50) NULL DEFAULT (N'system'),
                [KitchenPrinterAddress] NVARCHAR(255) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_RepRemittances] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Requisitions')
            CREATE TABLE dbo.[Requisitions] (
                [Id] NVARCHAR(64) NOT NULL,
                [RequisitionNumber] NVARCHAR(100) NULL,
                [Date] DATETIME2 NOT NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [FromWarehouseId] NVARCHAR(64) NULL,
                [ToWarehouseId] NVARCHAR(64) NULL,
                [RequestedById] NVARCHAR(64) NULL,
                [RequestedByName] NVARCHAR(255) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'pending'),
                [Priority] NVARCHAR(50) NOT NULL DEFAULT (N'normal'),
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [DetailsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [EtaUuid] NVARCHAR(64) NULL,
                [EtaStatus] NVARCHAR(50) NULL,
                [EtaSubmissionId] NVARCHAR(64) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [StockTransferId] NVARCHAR(64) NULL,
                [Reason] NVARCHAR(255) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT (N'approved'),
                [Notes] NVARCHAR(MAX) NULL,
                [ItemsJson] NVARCHAR(MAX) NULL,
                [AllocationsJson] NVARCHAR(MAX) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_SyncWatermarks] PRIMARY KEY CLUSTERED ([TableName])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncTrackingMatrix')
            CREATE TABLE dbo.[SyncTrackingMatrix] (
                [TableName] NVARCHAR(128) NOT NULL,
                [TableDisplayName] NVARCHAR(255) NOT NULL,
                [Category] NVARCHAR(100) NOT NULL,
                [SyncDirection] NVARCHAR(30) NOT NULL DEFAULT ('push'),
                [DataDescription] NVARCHAR(500) NULL,
                [DataScope] NVARCHAR(100) NULL,
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
                [LastPushRowVersion] BIGINT NULL,
                [LastPullRowVersion] BIGINT NULL,
                [CurrentLocalRowVersion] BIGINT NULL,
                [CurrentCentralRowVersion] BIGINT NULL,
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
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
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_TreasuryTransactions] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
            CREATE TABLE dbo.[Users] (
                [Id] NVARCHAR(64) NOT NULL,
                [LoginName] NVARCHAR(100) NOT NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Password] NVARCHAR(255) NOT NULL,
                [Phone] NVARCHAR(50) NULL,
                [Email] NVARCHAR(255) NULL,
                [NationalId] NVARCHAR(50) NULL,
                [SocialInsuranceNumber] NVARCHAR(50) NULL,
                [JobTitle] NVARCHAR(100) NULL,
                [Department] NVARCHAR(100) NULL,
                [HiringDate] NVARCHAR(50) NULL,
                [BasicSalary] DECIMAL(18,4) NULL DEFAULT ((0)),
                [HousingAllowance] DECIMAL(18,4) NULL DEFAULT ((0)),
                [TransportAllowance] DECIMAL(18,4) NULL DEFAULT ((0)),
                [SocialInsuranceDeduction] DECIMAL(18,4) NULL DEFAULT ((0)),
                [Status] NVARCHAR(50) NULL DEFAULT (N'active'),
                [BranchId] NVARCHAR(64) NULL,
                [Notes] NVARCHAR(MAX) NULL,
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
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_Users] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Warehouses')
            CREATE TABLE dbo.[Warehouses] (
                [Id] NVARCHAR(64) NOT NULL,
                [Code] NVARCHAR(50) NULL,
                [Name] NVARCHAR(255) NOT NULL,
                [Address] NVARCHAR(500) NULL,
                [WarehouseType] NVARCHAR(50) NOT NULL DEFAULT ('branch'),
                [IsRepWarehouse] BIT NOT NULL DEFAULT (0),
                [IsMain] BIT NOT NULL DEFAULT (0),
                [IsClosed] BIT NOT NULL DEFAULT (0),
                [RepId] NVARCHAR(64) NULL,
                [BranchId] NVARCHAR(64) NULL,
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_Warehouses] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditTrailLogs')
            CREATE TABLE dbo.[AuditTrailLogs] (
                [Id] NVARCHAR(64) NOT NULL,
                [Timestamp] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [UserId] NVARCHAR(64) NULL,
                [UserName] NVARCHAR(255) NULL,
                [Action] NVARCHAR(50) NOT NULL,
                [Entity] NVARCHAR(100) NOT NULL,
                [EntityId] NVARCHAR(100) NULL,
                [Details] NVARCHAR(MAX) NULL,
                [PreviousState] NVARCHAR(MAX) NULL,
                [NewState] NVARCHAR(MAX) NULL,
                [IpAddress] NVARCHAR(50) NULL,
                [Hash] NVARCHAR(128) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_AuditTrailLogs] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GeneralLedgerEntries')
            CREATE TABLE dbo.[GeneralLedgerEntries] (
                [Id] NVARCHAR(64) NOT NULL,
                [EntryNumber] NVARCHAR(100) NOT NULL,
                [Date] DATETIME2 NOT NULL,
                [SourceType] NVARCHAR(50) NOT NULL,
                [SourceId] NVARCHAR(64) NOT NULL,
                [SourceNumber] NVARCHAR(100) NULL,
                [WarehouseId] NVARCHAR(64) NULL,
                [Description] NVARCHAR(500) NULL,
                [Status] NVARCHAR(50) NOT NULL DEFAULT ('posted'),
                [TotalDebit] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [TotalCredit] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [LinesJson] NVARCHAR(MAX) NOT NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_GeneralLedgerEntries] PRIMARY KEY CLUSTERED ([Id])
            );`,

            `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ManufacturingOrders')
            CREATE TABLE dbo.[ManufacturingOrders] (
                [Id] NVARCHAR(64) NOT NULL,
                [OrderNumber] NVARCHAR(100) NOT NULL,
                [Date] DATETIME2 NULL DEFAULT (sysutcdatetime()),
                [OrderDate] DATETIME2 NULL DEFAULT (sysutcdatetime()),
                [ProductId] NVARCHAR(64) NULL,
                [ProductName] NVARCHAR(255) NULL,
                [FinishedItemId] NVARCHAR(64) NULL,
                [FinishedItemName] NVARCHAR(255) NULL,
                [QuantityToProduce] DECIMAL(18,4) NULL DEFAULT ((1)),
                [TargetQuantity] DECIMAL(18,4) NULL DEFAULT ((1)),
                [ProducedQuantity] DECIMAL(18,4) NULL DEFAULT ((0)),
                [RawMaterialsWarehouseId] NVARCHAR(64) NULL,
                [FinishedGoodsWarehouseId] NVARCHAR(64) NULL,
                [SourceWarehouseId] NVARCHAR(64) NULL,
                [TargetWarehouseId] NVARCHAR(64) NULL,
                [RawMaterialCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [TotalRawMaterialCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [LaborCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [OverheadCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [TotalCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [TotalProductionCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [UnitCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [UnitProductionCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)),
                [Status] NVARCHAR(50) NOT NULL DEFAULT ('completed'),
                [BomSnapshotJson] NVARCHAR(MAX) NULL,
                [BOMDetailsJson] NVARCHAR(MAX) NULL,
                [Notes] NVARCHAR(MAX) NULL,
                [CreatedBy] NVARCHAR(255) NULL,
                [CreatedById] NVARCHAR(64) NULL,
                [CreatedByName] NVARCHAR(255) NULL,
                [BranchCode] NVARCHAR(50) NULL,
                [BranchName] NVARCHAR(255) NULL,
                [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'),
                [LastSyncedAt] DATETIME2 NULL,
                [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()),
                [RowVersion] ROWVERSION,
                CONSTRAINT [PK_ManufacturingOrders] PRIMARY KEY CLUSTERED ([Id])
            );`
        ];

        for (const ddl of ddlStatements) {
            try {
                await targetPool.request().query(ddl);
            } catch (tableErr: any) {
                console.error('Error creating table in init:', tableErr.message);
            }
        }

        // 3b. Schema Upgrades & Column Migrations for Existing Databases (Local & Central)
        const schemaUpgrades = [
            // StockInRecords: Logistics Container Put-Away Allocations & Transfers
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'AllocationsJson')
                ALTER TABLE dbo.StockInRecords ADD [AllocationsJson] NVARCHAR(MAX) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'StockTransferId')
                ALTER TABLE dbo.StockInRecords ADD [StockTransferId] NVARCHAR(64) NULL;`,

            // SalesInvoices: E-Invoicing (ETA / ZATCA) Columns
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SalesInvoices') AND name = 'EtaUuid')
                ALTER TABLE dbo.SalesInvoices ADD [EtaUuid] NVARCHAR(64) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SalesInvoices') AND name = 'EtaStatus')
                ALTER TABLE dbo.SalesInvoices ADD [EtaStatus] NVARCHAR(50) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SalesInvoices') AND name = 'EtaSubmissionId')
                ALTER TABLE dbo.SalesInvoices ADD [EtaSubmissionId] NVARCHAR(64) NULL;`,

            // FixedAssets: Depreciation Engine Columns
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.FixedAssets') AND name = 'Cost')
                ALTER TABLE dbo.FixedAssets ADD [Cost] DECIMAL(18,4) NULL DEFAULT ((0));`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.FixedAssets') AND name = 'UsefulLifeYears')
                ALTER TABLE dbo.FixedAssets ADD [UsefulLifeYears] INT NULL DEFAULT ((5));`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.FixedAssets') AND name = 'SalvageValue')
                ALTER TABLE dbo.FixedAssets ADD [SalvageValue] DECIMAL(18,4) NULL DEFAULT ((0));`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.FixedAssets') AND name = 'DisposedDate')
                ALTER TABLE dbo.FixedAssets ADD [DisposedDate] DATETIME2 NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.FixedAssets') AND name = 'SaleProceeds')
                ALTER TABLE dbo.FixedAssets ADD [SaleProceeds] DECIMAL(18,4) NULL;`,

            // Users: HRMS & Payroll Columns
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'Email')
                ALTER TABLE dbo.Users ADD [Email] NVARCHAR(255) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'NationalId')
                ALTER TABLE dbo.Users ADD [NationalId] NVARCHAR(50) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'SocialInsuranceNumber')
                ALTER TABLE dbo.Users ADD [SocialInsuranceNumber] NVARCHAR(50) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'JobTitle')
                ALTER TABLE dbo.Users ADD [JobTitle] NVARCHAR(100) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'Department')
                ALTER TABLE dbo.Users ADD [Department] NVARCHAR(100) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'HiringDate')
                ALTER TABLE dbo.Users ADD [HiringDate] NVARCHAR(50) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'BasicSalary')
                ALTER TABLE dbo.Users ADD [BasicSalary] DECIMAL(18,4) NULL DEFAULT ((0));`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'HousingAllowance')
                ALTER TABLE dbo.Users ADD [HousingAllowance] DECIMAL(18,4) NULL DEFAULT ((0));`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'TransportAllowance')
                ALTER TABLE dbo.Users ADD [TransportAllowance] DECIMAL(18,4) NULL DEFAULT ((0));`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'SocialInsuranceDeduction')
                ALTER TABLE dbo.Users ADD [SocialInsuranceDeduction] DECIMAL(18,4) NULL DEFAULT ((0));`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'Status')
                ALTER TABLE dbo.Users ADD [Status] NVARCHAR(50) NULL DEFAULT (N'active');`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'BranchId')
                ALTER TABLE dbo.Users ADD [BranchId] NVARCHAR(64) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'Notes')
                ALTER TABLE dbo.Users ADD [Notes] NVARCHAR(MAX) NULL;`,

            // InventorySections, ItemCategories, ItemGroups, ItemSubCategories, PosTerminals, Requisitions, Warehouses
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InventorySections') AND name = 'Code')
                ALTER TABLE dbo.InventorySections ADD [Code] NVARCHAR(50) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InventorySections') AND name = 'MainWarehouseId')
                ALTER TABLE dbo.InventorySections ADD [MainWarehouseId] NVARCHAR(64) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InventorySections') AND name = 'Capacity')
                ALTER TABLE dbo.InventorySections ADD [Capacity] INT NULL DEFAULT ((0));`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InventorySections') AND name = 'AllowOverfill')
                ALTER TABLE dbo.InventorySections ADD [AllowOverfill] BIT NULL DEFAULT ((1));`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ItemCategories') AND name = 'Code')
                ALTER TABLE dbo.ItemCategories ADD [Code] NVARCHAR(50) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ItemGroups') AND name = 'ParentCategoryId')
                ALTER TABLE dbo.ItemGroups ADD [ParentCategoryId] NVARCHAR(64) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ItemSubCategories1') AND name = 'Code')
                ALTER TABLE dbo.ItemSubCategories1 ADD [Code] NVARCHAR(50) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ItemSubCategories2') AND name = 'Code')
                ALTER TABLE dbo.ItemSubCategories2 ADD [Code] NVARCHAR(50) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PosTerminals') AND name = 'PosPrinterType')
                ALTER TABLE dbo.PosTerminals ADD [PosPrinterType] NVARCHAR(50) NULL DEFAULT (N'system');`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PosTerminals') AND name = 'PosPrinterAddress')
                ALTER TABLE dbo.PosTerminals ADD [PosPrinterAddress] NVARCHAR(255) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PosTerminals') AND name = 'EnableKitchenPrinter')
                ALTER TABLE dbo.PosTerminals ADD [EnableKitchenPrinter] BIT NULL DEFAULT ((0));`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PosTerminals') AND name = 'KitchenPrinterType')
                ALTER TABLE dbo.PosTerminals ADD [KitchenPrinterType] NVARCHAR(50) NULL DEFAULT (N'system');`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PosTerminals') AND name = 'KitchenPrinterAddress')
                ALTER TABLE dbo.PosTerminals ADD [KitchenPrinterAddress] NVARCHAR(255) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Requisitions') AND name = 'FromWarehouseId')
                ALTER TABLE dbo.Requisitions ADD [FromWarehouseId] NVARCHAR(64) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Requisitions') AND name = 'ToWarehouseId')
                ALTER TABLE dbo.Requisitions ADD [ToWarehouseId] NVARCHAR(64) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Requisitions') AND name = 'DetailsJson')
                ALTER TABLE dbo.Requisitions ADD [DetailsJson] NVARCHAR(MAX) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Warehouses') AND name = 'BranchId')
                ALTER TABLE dbo.Warehouses ADD [BranchId] NVARCHAR(64) NULL;`,

            // AuditTrailLogs, GeneralLedgerEntries, ManufacturingOrders sync & compatibility columns
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AuditTrailLogs') AND name = 'BranchCode')
                ALTER TABLE dbo.AuditTrailLogs ADD [BranchCode] NVARCHAR(50) NULL, [BranchName] NVARCHAR(255) NULL, [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'), [LastSyncedAt] DATETIME2 NULL, [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime()), [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime());`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.GeneralLedgerEntries') AND name = 'BranchCode')
                ALTER TABLE dbo.GeneralLedgerEntries ADD [BranchCode] NVARCHAR(50) NULL, [BranchName] NVARCHAR(255) NULL, [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'), [LastSyncedAt] DATETIME2 NULL, [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime());`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ManufacturingOrders') AND name = 'BranchCode')
                ALTER TABLE dbo.ManufacturingOrders ADD [BranchCode] NVARCHAR(50) NULL, [BranchName] NVARCHAR(255) NULL, [SyncStatus] NVARCHAR(20) NULL DEFAULT ('synced'), [LastSyncedAt] DATETIME2 NULL, [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysutcdatetime());`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ManufacturingOrders') AND name = 'FinishedItemId')
                ALTER TABLE dbo.ManufacturingOrders ADD [OrderDate] DATETIME2 NULL DEFAULT (sysutcdatetime()), [FinishedItemId] NVARCHAR(64) NULL, [FinishedItemName] NVARCHAR(255) NULL, [TargetQuantity] DECIMAL(18,4) NULL DEFAULT ((1)), [ProducedQuantity] DECIMAL(18,4) NULL DEFAULT ((0)), [SourceWarehouseId] NVARCHAR(64) NULL, [TargetWarehouseId] NVARCHAR(64) NULL, [TotalRawMaterialCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)), [TotalProductionCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)), [UnitProductionCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)), [BOMDetailsJson] NVARCHAR(MAX) NULL, [CreatedBy] NVARCHAR(255) NULL;`,
            `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ManufacturingOrders') AND name = 'ProductId')
                ALTER TABLE dbo.ManufacturingOrders ADD [Date] DATETIME2 NULL DEFAULT (sysutcdatetime()), [ProductId] NVARCHAR(64) NULL, [ProductName] NVARCHAR(255) NULL, [QuantityToProduce] DECIMAL(18,4) NULL DEFAULT ((1)), [RawMaterialsWarehouseId] NVARCHAR(64) NULL, [FinishedGoodsWarehouseId] NVARCHAR(64) NULL, [RawMaterialCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)), [TotalCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)), [UnitCost] DECIMAL(18,4) NOT NULL DEFAULT ((0)), [BomSnapshotJson] NVARCHAR(MAX) NULL, [CreatedById] NVARCHAR(64) NULL, [CreatedByName] NVARCHAR(255) NULL;`
        ];

        for (const upg of schemaUpgrades) {
            try {
                await targetPool.request().query(upg);
            } catch (upgErr: any) {
                console.warn('Schema upgrade warning:', upgErr.message);
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
            END;`,

            `CREATE OR ALTER TRIGGER trg_GeneralLedgerEntries_BranchSync
            ON dbo.GeneralLedgerEntries
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE g
                SET g.BranchCode = COALESCE(g.BranchCode, w.Code, '${branchCode}'),
                    g.BranchName = COALESCE(g.BranchName, w.Name, N'${branchName}')
                FROM dbo.GeneralLedgerEntries g
                INNER JOIN inserted i ON g.Id = i.Id
                LEFT JOIN dbo.Warehouses w ON g.WarehouseId = w.Id;
            END;`,

            `CREATE OR ALTER TRIGGER trg_ManufacturingOrders_BranchSync
            ON dbo.ManufacturingOrders
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE m
                SET m.BranchCode = COALESCE(m.BranchCode, w.Code, '${branchCode}'),
                    m.BranchName = COALESCE(m.BranchName, w.Name, N'${branchName}')
                FROM dbo.ManufacturingOrders m
                INNER JOIN inserted i ON m.Id = i.Id
                LEFT JOIN dbo.Warehouses w ON COALESCE(m.RawMaterialsWarehouseId, m.SourceWarehouseId) = w.Id;
            END;`,

            `CREATE OR ALTER TRIGGER trg_StockInRecords_BranchSync
            ON dbo.StockInRecords
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE si
                SET si.BranchCode = COALESCE(si.BranchCode, w.Code, '${branchCode}'),
                    si.BranchName = COALESCE(si.BranchName, w.Name, N'${branchName}')
                FROM dbo.StockInRecords si
                INNER JOIN inserted i ON si.Id = i.Id
                LEFT JOIN dbo.Warehouses w ON si.WarehouseId = w.Id;
            END;`,

            `CREATE OR ALTER TRIGGER trg_StockOutRecords_BranchSync
            ON dbo.StockOutRecords
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE so
                SET so.BranchCode = COALESCE(so.BranchCode, w.Code, '${branchCode}'),
                    so.BranchName = COALESCE(so.BranchName, w.Name, N'${branchName}')
                FROM dbo.StockOutRecords so
                INNER JOIN inserted i ON so.Id = i.Id
                LEFT JOIN dbo.Warehouses w ON COALESCE(so.WarehouseId, so.SourceId) = w.Id;
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

        // 6. Seed SyncTrackingMatrix with all 69 tables and metadata
        for (const [tableName, meta] of Object.entries(TABLE_METADATA_MAP)) {
            try {
                await targetPool.request()
                    .input('Tbl', sql.NVarChar(128), tableName)
                    .input('Name', sql.NVarChar(255), meta.name)
                    .input('Cat', sql.NVarChar(100), meta.category)
                    .input('Dir', sql.NVarChar(30), meta.direction)
                    .input('Desc', sql.NVarChar(500), meta.description || '')
                    .input('Scope', sql.NVarChar(100), meta.dataScope || '')
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.SyncTrackingMatrix WHERE TableName = @Tbl)
                        BEGIN
                            INSERT INTO dbo.SyncTrackingMatrix (TableName, TableDisplayName, Category, SyncDirection, DataDescription, DataScope, SyncStatus)
                            VALUES (@Tbl, @Name, @Cat, @Dir, @Desc, @Scope, 'synced');
                        END
                        ELSE
                        BEGIN
                            UPDATE dbo.SyncTrackingMatrix 
                            SET TableDisplayName = @Name, Category = @Cat, DataDescription = @Desc, DataScope = @Scope
                            WHERE TableName = @Tbl;
                        END
                    `);
            } catch (seedErr: any) {
                console.warn(`SyncTrackingMatrix seed error for ${tableName}:`, seedErr.message);
            }
        }

        // 7. Seed canonical Warehouses
        const warehousesSeed = [
            { id: '-OmnkFba_GsEb0rfdzyA', code: branchCode, name: branchName, type: 'branch', isRep: 0, isMain: 1 },
            { id: '-P2S4PYETwslu4f4ym70', code: '5000', name: 'المخزن الرئيسي (ألنهضة)', type: 'warehouse', isRep: 0, isMain: 1 },
            { id: '-OnwGtz2HzhPQCqm55No', code: 'REP-01', name: 'عهدة المندوب: محاسب', type: 'rep', isRep: 1, isMain: 0, repId: '-OnwGtvQ3IuU_85UL0l9' }
        ];

        for (const w of warehousesSeed) {
            try {
                await targetPool.request()
                    .input('Id', sql.NVarChar(64), w.id)
                    .input('Code', sql.NVarChar(50), w.code)
                    .input('Name', sql.NVarChar(255), w.name)
                    .input('Type', sql.NVarChar(50), w.type)
                    .input('IsRep', sql.Bit, w.isRep)
                    .input('IsMain', sql.Bit, w.isMain)
                    .input('RepId', sql.NVarChar(64), w.repId || null)
                    .input('BranchCode', sql.NVarChar(50), branchCode)
                    .input('BranchName', sql.NVarChar(255), branchName)
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.Warehouses WHERE Id = @Id)
                        BEGIN
                            INSERT INTO dbo.Warehouses (Id, Code, Name, WarehouseType, IsRepWarehouse, IsMain, RepId, BranchCode, BranchName, SyncStatus)
                            VALUES (@Id, @Code, @Name, @Type, @IsRep, @IsMain, @RepId, @BranchCode, @BranchName, 'synced');
                        END
                        ELSE
                        BEGIN
                            UPDATE dbo.Warehouses 
                            SET Code = @Code, Name = @Name, WarehouseType = @Type, IsRepWarehouse = @IsRep, IsMain = @IsMain, RepId = @RepId
                            WHERE Id = @Id;
                        END
                    `);
            } catch (wErr: any) {
                console.warn(`Warehouse seed error:`, wErr.message);
            }
        }

        // 8. Seed default CashAccount
        try {
            await targetPool.request()
                .input('Id', sql.NVarChar(64), '-OmnkFeLDTdEKiFIrlq7')
                .input('Name', sql.NVarChar(255), `خزينة فرع: ${branchName}`)
                .input('Type', sql.NVarChar(50), 'cash')
                .input('WarehouseId', sql.NVarChar(64), '-OmnkFba_GsEb0rfdzyA')
                .input('BranchCode', sql.NVarChar(50), branchCode)
                .input('BranchName', sql.NVarChar(255), branchName)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.CashAccounts WHERE Id = @Id)
                    BEGIN
                        INSERT INTO dbo.CashAccounts (Id, Name, Type, OpeningBalance, WarehouseId, BranchCode, BranchName, SyncStatus)
                        VALUES (@Id, @Name, @Type, 0, @WarehouseId, @BranchCode, @BranchName, 'synced');
                    END
                `);
        } catch {}

        // 9. Seed default Roles & Permissions
        try {
            const defaultRoles = [
                {
                    id: 'مسؤول',
                    perms: JSON.stringify({
                        dashboard: { view: true },
                        pos: { view: true },
                        pos_sessions: { view: true },
                        pos_itemGroups: { view: true },
                        pos_terminals: { view: true },
                        pos_paymentMethods: { view: true },
                        sales_invoices: { view: true, add: true, edit: true, delete: true, print: true },
                        sales_returns: { view: true, add: true, edit: true, delete: true, print: true },
                        sales_posReturns: { view: true, add: true },
                        purchases_invoices: { view: true, add: true, edit: true, delete: true, print: true },
                        purchases_returns: { view: true, add: true, edit: true, delete: true, print: true },
                        purchases_orders: { view: true, add: true, edit: true, delete: true },
                        inventory_items: { view: true, add: true, edit: true, delete: true },
                        inventory_items_categories: { view: true, add: true, edit: true, delete: true },
                        inventory_warehouses: { view: true, add: true, edit: true, delete: true },
                        inventory_movements: { view: true },
                        inventory_stockIn: { view: true, add: true, delete: true, print: true },
                        inventory_stockOut: { view: true, add: true, print: true },
                        inventory_transfer: { view: true, add: true },
                        inventory_adjustment: { view: true, add: true, delete: true, print: true },
                        inventory_stockStatus: { view: true, generate: true, print: true },
                        manufacturing_orders: { view: true, add: true, edit: true, delete: true, print: true },
                        accounting_treasury: { view: true, add: true },
                        accounting_expenses: { view: true, add: true },
                        accounting_customerPayments: { view: true, add: true, delete: true },
                        accounting_supplierPayments: { view: true, add: true, delete: true },
                        accounting_posting: { view: true, add: true, edit: true, print: true },
                        accounting_assets: { view: true, add: true, edit: true, delete: true, print: true },
                        hr_employees: { view: true, add: true, edit: true, delete: true },
                        hr_payroll: { view: true, add: true, edit: true, print: true },
                        reports_sales: { view: true },
                        reports_posSales: { view: true },
                        reports_itemLedger: { view: true },
                        reports_financialStatements: { view: true },
                        reports_taxDeclaration: { view: true, print: true },
                        reports_discrepancies: { view: true },
                        settings_users: { view: true, add: true, edit: true, delete: true },
                        settings_cashAccounts: { view: true, add: true, edit: true, delete: true },
                        settings_printers: { view: true, edit: true },
                        settings_auditTrail: { view: true, print: true },
                        settings_eInvoice: { view: true, add: true, edit: true },
                        users: { view: true, add: true, edit: true, delete: true }
                    })
                },
                {
                    id: 'كاشير',
                    perms: JSON.stringify({
                        pos: { view: true },
                        sales_invoices: { view: true, add: true, print: true },
                        sales_posReturns: { view: true, add: true },
                        accounting_customerPayments: { view: true, add: true },
                        customers_data: { view: true, add: true }
                    })
                },
                {
                    id: 'محاسب',
                    perms: JSON.stringify({
                        dashboard: { view: true },
                        sales_invoices: { view: true, add: true, edit: true, print: true },
                        purchases_invoices: { view: true, add: true, edit: true, print: true },
                        inventory_movements: { view: true },
                        inventory_stockStatus: { view: true, print: true },
                        manufacturing_orders: { view: true, add: true, print: true },
                        accounting_treasury: { view: true, add: true },
                        accounting_expenses: { view: true, add: true },
                        accounting_customerPayments: { view: true, add: true },
                        accounting_supplierPayments: { view: true, add: true },
                        accounting_posting: { view: true, add: true, print: true },
                        accounting_assets: { view: true, add: true, edit: true, print: true },
                        hr_employees: { view: true, add: true, edit: true },
                        hr_payroll: { view: true, add: true, print: true },
                        reports_sales: { view: true },
                        reports_financialStatements: { view: true },
                        reports_taxDeclaration: { view: true, print: true },
                        settings_eInvoice: { view: true, edit: true }
                    })
                }
            ];

            for (const r of defaultRoles) {
                await targetPool.request()
                    .input('Id', sql.NVarChar(100), r.id)
                    .input('Perms', sql.NVarChar(sql.MAX), r.perms)
                    .input('BranchCode', sql.NVarChar(50), branchCode)
                    .input('BranchName', sql.NVarChar(255), branchName)
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE Id = @Id)
                            INSERT INTO dbo.Roles (Id, PermissionsJson, BranchCode, BranchName, SyncStatus)
                            VALUES (@Id, @Perms, @BranchCode, @BranchName, 'synced');
                    `);
            }
        } catch (rErr: any) {
            console.warn('Roles seed error:', rErr.message);
        }

        // 10. Seed default Users (Ensures system is never locked on fresh install)
        try {
            const defaultUsers = [
                {
                    id: 'admin_master',
                    loginName: 'admin',
                    name: 'مدير النظام',
                    password: 'admin',
                    phone: '01000000000',
                    role: 'مسؤول',
                    warehouseIds: JSON.stringify(['all']),
                    uid: 'admin_master',
                    isCashier: 1,
                    isDelivery: 1,
                    isSalesRep: 1,
                    canOpenOwnShift: 1,
                    canDeleteFromCart: 1,
                    canProcessReturn: 1,
                    canCancelInvoice: 1,
                    canBypassScannerForReturn: 1,
                    isDisabled: 0,
                    themeSettings: JSON.stringify({ licenseKey: 'SA-KEY-99ED28E7-023953BC', licenseStatus: 'active', zoomLevel: 1.0 })
                },
                {
                    id: 'cashier_default',
                    loginName: 'cashier',
                    name: 'كاشير الفرع',
                    password: '1234',
                    phone: '01100000000',
                    role: 'كاشير',
                    warehouseIds: JSON.stringify(['-OmnkFba_GsEb0rfdzyA']),
                    uid: 'cashier_default',
                    isCashier: 1,
                    isDelivery: 0,
                    isSalesRep: 0,
                    canOpenOwnShift: 1,
                    canDeleteFromCart: 0,
                    canProcessReturn: 1,
                    canCancelInvoice: 0,
                    canBypassScannerForReturn: 0,
                    isDisabled: 0,
                    themeSettings: JSON.stringify({ licenseKey: 'SA-KEY-99ED28E7-023953BC', licenseStatus: 'active', zoomLevel: 1.0 })
                }
            ];

            for (const u of defaultUsers) {
                await targetPool.request()
                    .input('Id', sql.NVarChar(64), u.id)
                    .input('LoginName', sql.NVarChar(100), u.loginName)
                    .input('Name', sql.NVarChar(255), u.name)
                    .input('Password', sql.NVarChar(255), u.password)
                    .input('Phone', sql.NVarChar(50), u.phone)
                    .input('Role', sql.NVarChar(100), u.role)
                    .input('WarehouseIds', sql.NVarChar(sql.MAX), u.warehouseIds)
                    .input('Uid', sql.NVarChar(100), u.uid)
                    .input('IsCashier', sql.Bit, u.isCashier)
                    .input('IsDelivery', sql.Bit, u.isDelivery)
                    .input('IsSalesRep', sql.Bit, u.isSalesRep)
                    .input('CanOpenOwnShift', sql.Bit, u.canOpenOwnShift)
                    .input('CanDeleteFromCart', sql.Bit, u.canDeleteFromCart)
                    .input('CanProcessReturn', sql.Bit, u.canProcessReturn)
                    .input('CanCancelInvoice', sql.Bit, u.canCancelInvoice)
                    .input('CanBypassScannerForReturn', sql.Bit, u.canBypassScannerForReturn)
                    .input('IsDisabled', sql.Bit, u.isDisabled)
                    .input('ThemeSettings', sql.NVarChar(sql.MAX), u.themeSettings)
                    .input('BranchCode', sql.NVarChar(50), branchCode)
                    .input('BranchName', sql.NVarChar(255), branchName)
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE LoginName = @LoginName OR Id = @Id)
                        BEGIN
                            INSERT INTO dbo.Users (Id, LoginName, Name, Password, Phone, Role, WarehouseIds, Uid, IsCashier, IsDelivery, IsSalesRep, CanOpenOwnShift, CanDeleteFromCart, CanProcessReturn, CanCancelInvoice, CanBypassScannerForReturn, IsDisabled, ThemeSettings, BranchCode, BranchName, SyncStatus)
                            VALUES (@Id, @LoginName, @Name, @Password, @Phone, @Role, @WarehouseIds, @Uid, @IsCashier, @IsDelivery, @IsSalesRep, @CanOpenOwnShift, @CanDeleteFromCart, @CanProcessReturn, @CanCancelInvoice, @CanBypassScannerForReturn, @IsDisabled, @ThemeSettings, @BranchCode, @BranchName, 'synced');
                        END
                    `);
            }
        } catch (uErr: any) {
            console.warn('Users seed error:', uErr.message);
        }

        // 10b. Ensure all sales reps have a dedicated rep warehouse and cash custody account
        try {
            const repsRes = await targetPool.request().query(`
                SELECT Id, Name, WarehouseIds FROM dbo.Users 
                WHERE IsSalesRep = 1 OR Role = 'مندوب' OR Role LIKE '%مندوب%'
            `);
            for (const r of repsRes.recordset) {
                const whCheck = await targetPool.request()
                    .input('RepId', sql.NVarChar(64), r.Id)
                    .query(`SELECT Id FROM dbo.Warehouses WHERE RepId = @RepId`);
                
                let repWhId = whCheck.recordset[0]?.Id;
                if (!repWhId) {
                    const countRes = await targetPool.request().query(`SELECT COUNT(*) as cnt FROM dbo.Warehouses WHERE IsRepWarehouse = 1 OR WarehouseType = 'rep'`);
                    const nextNum = (countRes.recordset[0]?.cnt || 0) + 1;
                    const nextCode = `REP-${String(nextNum).padStart(2, '0')}`;
                    repWhId = `rep_wh_${r.Id}`;
                    const repWhName = `عهدة المندوب: ${r.Name}`;

                    await targetPool.request()
                        .input('Id', sql.NVarChar(64), repWhId)
                        .input('Code', sql.NVarChar(50), nextCode)
                        .input('Name', sql.NVarChar(255), repWhName)
                        .input('WarehouseType', sql.NVarChar(50), 'rep')
                        .input('IsRepWarehouse', sql.Bit, 1)
                        .input('IsMain', sql.Bit, 0)
                        .input('IsClosed', sql.Bit, 0)
                        .input('RepId', sql.NVarChar(64), r.Id)
                        .input('BranchCode', sql.NVarChar(50), nextCode)
                        .input('BranchName', sql.NVarChar(255), repWhName)
                        .query(`
                            IF NOT EXISTS (SELECT 1 FROM dbo.Warehouses WHERE Id = @Id OR RepId = @RepId)
                            BEGIN
                                INSERT INTO dbo.Warehouses (Id, Code, Name, WarehouseType, IsRepWarehouse, IsMain, IsClosed, RepId, BranchCode, BranchName, SyncStatus)
                                VALUES (@Id, @Code, @Name, @WarehouseType, @IsRepWarehouse, @IsMain, @IsClosed, @RepId, @BranchCode, @BranchName, 'synced');
                            END
                        `);
                }

                // Ensure rep custody cash account
                const cashCheck = await targetPool.request()
                    .input('UserId', sql.NVarChar(64), r.Id)
                    .query(`SELECT Id FROM dbo.CashAccounts WHERE UserId = @UserId`);
                if (cashCheck.recordset.length === 0) {
                    const cashId = `rep_cash_${r.Id}`;
                    const cashName = `عهدة: ${r.Name}`;
                    await targetPool.request()
                        .input('Id', sql.NVarChar(64), cashId)
                        .input('Name', sql.NVarChar(255), cashName)
                        .input('Type', sql.NVarChar(50), 'cash')
                        .input('OpeningBalance', sql.Decimal(18, 4), 0)
                        .input('UserId', sql.NVarChar(64), r.Id)
                        .input('WarehouseId', sql.NVarChar(64), repWhId)
                        .query(`
                            IF NOT EXISTS (SELECT 1 FROM dbo.CashAccounts WHERE Id = @Id OR UserId = @UserId)
                            BEGIN
                                INSERT INTO dbo.CashAccounts (Id, Name, Type, OpeningBalance, UserId, WarehouseId)
                                VALUES (@Id, @Name, @Type, @OpeningBalance, @UserId, @WarehouseId);
                            END
                        `);
                }

                // Ensure linked in User.WarehouseIds
                let wids: string[] = [];
                try {
                    wids = JSON.parse(r.WarehouseIds || '[]');
                } catch {
                    wids = [];
                }
                if (!Array.isArray(wids)) wids = [];
                if (!wids.includes(repWhId)) {
                    wids.push(repWhId);
                    await targetPool.request()
                        .input('Id', sql.NVarChar(64), r.Id)
                        .input('WarehouseIds', sql.NVarChar(sql.MAX), JSON.stringify(wids))
                        .query(`UPDATE dbo.Users SET WarehouseIds = @WarehouseIds WHERE Id = @Id`);
                }
            }
        } catch (repSyncErr: any) {
            console.warn('Rep warehouses sync warning:', repSyncErr.message);
        }

        // 11. Seed default Active License
        try {
            await targetPool.request()
                .input('Id', sql.NVarChar(64), 'default_license')
                .input('Key', sql.NVarChar(255), 'SA-KEY-99ED28E7-023953BC')
                .input('Status', sql.NVarChar(50), 'active')
                .input('BranchCode', sql.NVarChar(50), branchCode)
                .input('BranchName', sql.NVarChar(255), branchName)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.Licenses WHERE [Key] = @Key)
                    BEGIN
                        INSERT INTO dbo.Licenses (Id, [Key], StartDate, EndDate, Status, MaxUsers, BranchCode, BranchName, SyncStatus)
                        VALUES (@Id, @Key, '2025-01-01', '2099-12-31', @Status, 100, @BranchCode, @BranchName, 'synced');
                    END
                `);
        } catch {}

        // 12. Seed default PaymentMethods
        try {
            const defaultMethods = [
                { id: 'cash', name: 'نقدي' },
                { id: 'visa', name: 'شبكة / فيزا' },
                { id: 'transfer', name: 'تحويل بنكي' }
            ];
            for (const pm of defaultMethods) {
                await targetPool.request()
                    .input('Id', sql.NVarChar(64), pm.id)
                    .input('Name', sql.NVarChar(255), pm.name)
                    .input('AccountId', sql.NVarChar(64), '-OmnkFeLDTdEKiFIrlq7')
                    .input('BranchCode', sql.NVarChar(50), branchCode)
                    .input('BranchName', sql.NVarChar(255), branchName)
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.PaymentMethods WHERE Id = @Id)
                            INSERT INTO dbo.PaymentMethods (Id, Name, AccountId, BranchCode, BranchName, SyncStatus)
                            VALUES (@Id, @Name, @AccountId, @BranchCode, @BranchName, 'synced');
                    `);
            }
        } catch {}

        // 13. Seed default AppSettings ('main' & 'system_role')
        try {
            const roleVal = options.isCentral ? 'central' : 'branch';
            await targetPool.request()
                .input('Key', sql.NVarChar(100), 'system_role')
                .input('Val', sql.NVarChar(100), roleVal)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = @Key)
                        INSERT INTO dbo.AppSettings (SettingKey, SettingValue, SyncStatus, LastSyncedAt) VALUES (@Key, @Val, 'synced', SYSUTCDATETIME());
                    ELSE
                        UPDATE dbo.AppSettings SET SettingValue = @Val WHERE SettingKey = @Key;
                `);

            const defaultMainSettings = JSON.stringify({
                general: {
                    companyName: branchName || 'نظام إدارة الفروع ونقاط البيع',
                    companyAddress: 'الفرع الرئيسي',
                    language: 'ar',
                    licenseKey: 'SA-KEY-99ED28E7-023953BC',
                    licenseStatus: 'active',
                    isClothingStore: false,
                    desktopLayout: 'sidebar',
                    toastDuration: 2
                },
                financial: {
                    currency: 'EGP',
                    vatRate: 14,
                    allowNegativeStock: false,
                    standardItemBarcodePrefix: '25',
                    scaleBarcodePrefix: '21',
                    clothingBarcodePrefix: '23',
                    roundingDecimals: 2
                },
                posSettings: {
                    workDay: new Date().toISOString().split('T')[0],
                    autoPrintReceipt: true,
                    showItemStock: true,
                    layout: { layout: 'cart-left', cartWidth: 50, itemsWidth: 50, groupsPosition: 'right', paymentPosition: 'bottom' }
                },
                eInvoice: {
                    provider: 'ETA',
                    environment: 'sandbox',
                    simulationMode: true,
                    taxRegistrationNumber: '100-200-300',
                    branchCode: branchCode || '0',
                    activityCode: '4711',
                    companyTradeName: branchName || 'نظام إدارة الفروع ونقاط البيع',
                    autoSubmitPOS: false,
                    autoSubmitB2B: false
                }
            });

            await targetPool.request()
                .input('Key', sql.NVarChar(100), 'main')
                .input('Val', sql.NVarChar(sql.MAX), defaultMainSettings)
                .input('BranchCode', sql.NVarChar(50), branchCode)
                .input('BranchName', sql.NVarChar(255), branchName)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = @Key)
                        INSERT INTO dbo.AppSettings (SettingKey, SettingValue, BranchCode, BranchName, SyncStatus)
                        VALUES (@Key, @Val, @BranchCode, @BranchName, 'synced');
                `);
        } catch (sErr: any) {
            console.warn('AppSettings seed error:', sErr.message);
        }

        // 14. Seed default Counters
        try {
            const defaultCounters = [
                { name: 'standardItemCode', val: 1 },
                { name: 'rawMaterialCode', val: 1000 },
                { name: 'salesInvoice', val: 1 },
                { name: 'purchaseInvoice', val: 1 },
                { name: 'stockInReceipt', val: 1 },
                { name: 'stockOutReceipt', val: 1 },
                { name: 'stockTransferReceipt', val: 1 },
                { name: 'stockAdjustmentReceipt', val: 1 },
                { name: 'manufacturingOrder', val: 1 },
                { name: 'journalEntry', val: 1 }
            ];
            for (const c of defaultCounters) {
                await targetPool.request()
                    .input('Name', sql.NVarChar(100), c.name)
                    .input('Val', sql.BigInt, c.val)
                    .input('BranchCode', sql.NVarChar(50), branchCode)
                    .input('BranchName', sql.NVarChar(255), branchName)
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.Counters WHERE Name = @Name)
                            INSERT INTO dbo.Counters (Name, CurrentValue, BranchCode, BranchName, SyncStatus)
                            VALUES (@Name, @Val, @BranchCode, @BranchName, 'synced');
                    `);
            }
        } catch {}

        // 15. Create high-performance database indexes
        const performanceIndexes = [
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Items_IsDisabled_Name' AND object_id = OBJECT_ID('dbo.Items'))
             CREATE NONCLUSTERED INDEX IX_Items_IsDisabled_Name ON dbo.Items (IsDisabled, Name) INCLUDE (Code, Price, Cost, BaseUnit, SectionId, CategoryId, ItemGroupId);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Items_Code' AND object_id = OBJECT_ID('dbo.Items'))
             CREATE NONCLUSTERED INDEX IX_Items_Code ON dbo.Items (Code);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Items_SectionId' AND object_id = OBJECT_ID('dbo.Items'))
             CREATE NONCLUSTERED INDEX IX_Items_SectionId ON dbo.Items (SectionId, IsDisabled);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Items_CategoryId' AND object_id = OBJECT_ID('dbo.Items'))
             CREATE NONCLUSTERED INDEX IX_Items_CategoryId ON dbo.Items (CategoryId, IsDisabled);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Items_ItemGroupId' AND object_id = OBJECT_ID('dbo.Items'))
             CREATE NONCLUSTERED INDEX IX_Items_ItemGroupId ON dbo.Items (ItemGroupId, IsDisabled);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SalesInvoices_CashierId' AND object_id = OBJECT_ID('dbo.SalesInvoices'))
             CREATE NONCLUSTERED INDEX IX_SalesInvoices_CashierId ON dbo.SalesInvoices (CashierId, Date DESC);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SalesInvoices_InvoiceNumber' AND object_id = OBJECT_ID('dbo.SalesInvoices'))
             CREATE NONCLUSTERED INDEX IX_SalesInvoices_InvoiceNumber ON dbo.SalesInvoices (InvoiceNumber);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockInRecords_PurchaseInvoiceId' AND object_id = OBJECT_ID('dbo.StockInRecords'))
             CREATE NONCLUSTERED INDEX IX_StockInRecords_PurchaseInvoiceId ON dbo.StockInRecords (PurchaseInvoiceId);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockInRecords_Status' AND object_id = OBJECT_ID('dbo.StockInRecords'))
             CREATE NONCLUSTERED INDEX IX_StockInRecords_Status ON dbo.StockInRecords (Status);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockOutRecords_SaleInvoiceId' AND object_id = OBJECT_ID('dbo.StockOutRecords'))
             CREATE NONCLUSTERED INDEX IX_StockOutRecords_SaleInvoiceId ON dbo.StockOutRecords (SaleInvoiceId);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockOutRecords_Status' AND object_id = OBJECT_ID('dbo.StockOutRecords'))
             CREATE NONCLUSTERED INDEX IX_StockOutRecords_Status ON dbo.StockOutRecords (Status);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PurchaseInvoices_InvoiceNumber' AND object_id = OBJECT_ID('dbo.PurchaseInvoices'))
             CREATE NONCLUSTERED INDEX IX_PurchaseInvoices_InvoiceNumber ON dbo.PurchaseInvoices (InvoiceNumber);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Customers_Name' AND object_id = OBJECT_ID('dbo.Customers'))
             CREATE NONCLUSTERED INDEX IX_Customers_Name ON dbo.Customers (Name);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Suppliers_Name' AND object_id = OBJECT_ID('dbo.Suppliers'))
             CREATE NONCLUSTERED INDEX IX_Suppliers_Name ON dbo.Suppliers (Name);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GeneralLedgerEntries_Source' AND object_id = OBJECT_ID('dbo.GeneralLedgerEntries'))
             CREATE NONCLUSTERED INDEX IX_GeneralLedgerEntries_Source ON dbo.GeneralLedgerEntries (SourceType, SourceId, Date DESC);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AuditTrailLogs_Timestamp' AND object_id = OBJECT_ID('dbo.AuditTrailLogs'))
             CREATE NONCLUSTERED INDEX IX_AuditTrailLogs_Timestamp ON dbo.AuditTrailLogs (Timestamp DESC, Entity, Action);`,
            `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ManufacturingOrders_Status' AND object_id = OBJECT_ID('dbo.ManufacturingOrders'))
             CREATE NONCLUSTERED INDEX IX_ManufacturingOrders_Status ON dbo.ManufacturingOrders (Status, CreatedAt DESC);`
        ];

        for (const idxSql of performanceIndexes) {
            try {
                await targetPool.request().query(idxSql);
            } catch (idxErr: any) {
                console.warn('Index creation warning:', idxErr.message);
            }
        }

        // 10. Ensure ROWVERSION on all tables for monotonic synchronization
        try {
            const allTablesRes = await targetPool.request().query(`
                SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME != 'sysdiagrams';
            `);
            for (const t of allTablesRes.recordset.map((r: any) => r.TABLE_NAME)) {
                try {
                    const hasRv = await targetPool.request().query(`
                        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${t}' AND DATA_TYPE = 'timestamp';
                    `);
                    if (hasRv.recordset.length === 0) {
                        await targetPool.request().query(`ALTER TABLE dbo.[${t}] ADD [RowVersion] ROWVERSION;`);
                    }
                } catch {}
            }
        } catch {}

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
