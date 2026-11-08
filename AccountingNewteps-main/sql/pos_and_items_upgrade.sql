-- Update Schema for Comprehensive ERP Operations
-- 1. Alter dbo.PosSessions
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PosSessions') AND name = 'CashierSessionsJson')
BEGIN
    ALTER TABLE dbo.PosSessions ADD CashierSessionsJson NVARCHAR(MAX) NULL;
END
GO

-- 2. Alter dbo.Items
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Items') AND name = 'Barcode')
BEGIN
    ALTER TABLE dbo.Items ADD Barcode NVARCHAR(100) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Items') AND name = 'BarcodeType')
BEGIN
    ALTER TABLE dbo.Items ADD BarcodeType NVARCHAR(50) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Items') AND name = 'ItemGroupId')
BEGIN
    ALTER TABLE dbo.Items ADD ItemGroupId NVARCHAR(64) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Items') AND name = 'SubCategoryId1')
BEGIN
    ALTER TABLE dbo.Items ADD SubCategoryId1 NVARCHAR(64) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Items') AND name = 'SubCategoryId2')
BEGIN
    ALTER TABLE dbo.Items ADD SubCategoryId2 NVARCHAR(64) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Items') AND name = 'Color')
BEGIN
    ALTER TABLE dbo.Items ADD Color NVARCHAR(50) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Items') AND name = 'Size')
BEGIN
    ALTER TABLE dbo.Items ADD Size NVARCHAR(50) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Items') AND name = 'DefaultBinId')
BEGIN
    ALTER TABLE dbo.Items ADD DefaultBinId NVARCHAR(64) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Items') AND name = 'SecondaryUnitsJson')
BEGIN
    ALTER TABLE dbo.Items ADD SecondaryUnitsJson NVARCHAR(MAX) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Items') AND name = 'ComponentsJson')
BEGIN
    ALTER TABLE dbo.Items ADD ComponentsJson NVARCHAR(MAX) NULL;
END
GO

-- 3. Create dbo.GratuityLogs
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'GratuityLogs')
BEGIN
    CREATE TABLE dbo.GratuityLogs (
        Id NVARCHAR(64) PRIMARY KEY,
        Date DATETIME2 NOT NULL,
        Amount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        InvoiceNumber NVARCHAR(100) NULL,
        InvoiceId NVARCHAR(64) NULL,
        CashierId NVARCHAR(64) NULL,
        CashierName NVARCHAR(255) NULL,
        WarehouseId NVARCHAR(64) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 4. Create dbo.GratuityDistributions
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'GratuityDistributions')
BEGIN
    CREATE TABLE dbo.GratuityDistributions (
        Id NVARCHAR(64) PRIMARY KEY,
        Date DATETIME2 NOT NULL,
        TotalAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        DetailsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 5. Create dbo.ItemSubCategories1
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ItemSubCategories1')
BEGIN
    CREATE TABLE dbo.ItemSubCategories1 (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 6. Create dbo.ItemSubCategories2
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ItemSubCategories2')
BEGIN
    CREATE TABLE dbo.ItemSubCategories2 (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 7. Create dbo.InventoryZones
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InventoryZones')
BEGIN
    CREATE TABLE dbo.InventoryZones (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        WarehouseId NVARCHAR(64) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

