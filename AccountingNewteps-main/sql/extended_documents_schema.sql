USE MultiBranchPOS_DB;
GO

-- ==============================================================================
-- 1. المخازن: أذون الصرف المخزني (Stock Out Records)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockOutRecords')
BEGIN
    CREATE TABLE dbo.StockOutRecords (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        WarehouseId NVARCHAR(64) NULL,
        SourceId NVARCHAR(64) NULL,
        SaleInvoiceId NVARCHAR(64) NULL,
        Reason NVARCHAR(255) NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'approved',
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_StockOutRecords_Date ON dbo.StockOutRecords (Date);
    CREATE INDEX IX_StockOutRecords_WarehouseId ON dbo.StockOutRecords (WarehouseId);
END
GO

-- ==============================================================================
-- 2. المخازن: أذون تسليم عهدة للمناديب (Stock Issues To Reps)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockIssuesToReps')
BEGIN
    CREATE TABLE dbo.StockIssuesToReps (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        WarehouseId NVARCHAR(64) NULL,
        SalesRepId NVARCHAR(64) NULL,
        SalesRepName NVARCHAR(255) NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'approved',
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_StockIssuesToReps_Date ON dbo.StockIssuesToReps (Date);
    CREATE INDEX IX_StockIssuesToReps_SalesRepId ON dbo.StockIssuesToReps (SalesRepId);
END
GO

-- ==============================================================================
-- 3. المخازن: أذون استلام عهدة مرتجعة من المناديب (Stock Returns From Reps)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockReturnsFromReps')
BEGIN
    CREATE TABLE dbo.StockReturnsFromReps (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        WarehouseId NVARCHAR(64) NULL,
        SalesRepId NVARCHAR(64) NULL,
        SalesRepName NVARCHAR(255) NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'approved',
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_StockReturnsFromReps_Date ON dbo.StockReturnsFromReps (Date);
    CREATE INDEX IX_StockReturnsFromReps_SalesRepId ON dbo.StockReturnsFromReps (SalesRepId);
END
GO

-- ==============================================================================
-- 4. المخازن: محاضر إقفال وجرد الفترات المخزنية (Inventory Closings)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InventoryClosings')
BEGIN
    CREATE TABLE dbo.InventoryClosings (
        Id NVARCHAR(64) PRIMARY KEY,
        ClosingDate DATETIME2 NOT NULL,
        WarehouseId NVARCHAR(64) NOT NULL,
        ClosedById NVARCHAR(64) NULL,
        ClosedByName NVARCHAR(255) NULL,
        Notes NVARCHAR(MAX) NULL,
        BalancesJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_InventoryClosings_WarehouseId ON dbo.InventoryClosings (WarehouseId);
END
GO

-- ==============================================================================
-- 5. المشتريات: طلبات وأوامر الشراء (Purchase Orders)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseOrders')
BEGIN
    CREATE TABLE dbo.PurchaseOrders (
        Id NVARCHAR(64) PRIMARY KEY,
        OrderNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        ExpectedDate DATETIME2 NULL,
        SupplierId NVARCHAR(64) NULL,
        SupplierName NVARCHAR(255) NULL,
        WarehouseId NVARCHAR(64) NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'pending',
        Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_PurchaseOrders_Date ON dbo.PurchaseOrders (Date);
END
GO

-- ==============================================================================
-- 6. المخازن: طلبات صرف واحتياج المواد (Requisitions)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Requisitions')
BEGIN
    CREATE TABLE dbo.Requisitions (
        Id NVARCHAR(64) PRIMARY KEY,
        RequisitionNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        WarehouseId NVARCHAR(64) NULL,
        RequestedById NVARCHAR(64) NULL,
        RequestedByName NVARCHAR(255) NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'pending',
        Priority NVARCHAR(50) NOT NULL DEFAULT N'normal',
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- ==============================================================================
-- 7. الحسابات: سندات الإيرادات الاستثنائية والأخرى (Exceptional Incomes)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ExceptionalIncomes')
BEGIN
    CREATE TABLE dbo.ExceptionalIncomes (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        IncomeType NVARCHAR(100) NULL,
        Description NVARCHAR(500) NULL,
        Amount DECIMAL(18, 4) NOT NULL,
        PaidToAccountId NVARCHAR(64) NOT NULL,
        WarehouseId NVARCHAR(64) NULL,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ExceptionalIncomes_Date ON dbo.ExceptionalIncomes (Date);
END
GO

-- ==============================================================================
-- 8. الحسابات: سندات توزيع الأرباح على الشركاء (Profit Distributions)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ProfitDistributions')
BEGIN
    CREATE TABLE dbo.ProfitDistributions (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        PartnerId NVARCHAR(64) NULL,
        PartnerName NVARCHAR(255) NULL,
        Amount DECIMAL(18, 4) NOT NULL,
        PaidFromAccountId NVARCHAR(64) NOT NULL,
        Notes NVARCHAR(MAX) NULL,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- ==============================================================================
-- 9. الحسابات: سندات توريد نقدية المناديب (Sales Rep Remittances)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RepRemittances')
BEGIN
    CREATE TABLE dbo.RepRemittances (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        SalesRepId NVARCHAR(64) NOT NULL,
        SalesRepName NVARCHAR(255) NULL,
        Amount DECIMAL(18, 4) NOT NULL,
        ToAccountId NVARCHAR(64) NOT NULL,
        Notes NVARCHAR(MAX) NULL,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- ==============================================================================
-- 10. شؤون الموظفين: سندات تسويات وخصومات ومكافآت (Employee Adjustments)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeAdjustments')
BEGIN
    CREATE TABLE dbo.EmployeeAdjustments (
        Id NVARCHAR(64) PRIMARY KEY,
        Date DATETIME2 NOT NULL,
        EmployeeId NVARCHAR(64) NOT NULL,
        EmployeeName NVARCHAR(255) NULL,
        Type NVARCHAR(50) NOT NULL, -- bonus, deduction, reward, penalty
        Amount DECIMAL(18, 4) NOT NULL,
        Reason NVARCHAR(500) NULL,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- ==============================================================================
-- 11. الأصول الثابتة وإهلاكها (Fixed Assets & Depreciation)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FixedAssets')
BEGIN
    CREATE TABLE dbo.FixedAssets (
        Id NVARCHAR(64) PRIMARY KEY,
        Code NVARCHAR(100) NULL,
        Name NVARCHAR(255) NOT NULL,
        PurchaseDate DATETIME2 NOT NULL,
        PurchasePrice DECIMAL(18, 4) NOT NULL,
        CurrentValue DECIMAL(18, 4) NOT NULL,
        DepreciationRate DECIMAL(5, 2) NOT NULL DEFAULT 0,
        DepreciationMethod NVARCHAR(50) NOT NULL DEFAULT N'straight_line',
        WarehouseId NVARCHAR(64) NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'active',
        Notes NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DepreciationRecords')
BEGIN
    CREATE TABLE dbo.DepreciationRecords (
        Id NVARCHAR(64) PRIMARY KEY,
        AssetId NVARCHAR(64) NOT NULL,
        Date DATETIME2 NOT NULL,
        Amount DECIMAL(18, 4) NOT NULL,
        AccumulatedTotal DECIMAL(18, 4) NOT NULL,
        RemainingValue DECIMAL(18, 4) NOT NULL,
        Notes NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- ==============================================================================
-- 12. الرقابة والتدقيق: سجل تعديلات الأسعار (Price Change Logs)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PriceChangeLogs')
BEGIN
    CREATE TABLE dbo.PriceChangeLogs (
        Id NVARCHAR(64) PRIMARY KEY,
        ItemId NVARCHAR(64) NOT NULL,
        ItemCode NVARCHAR(100) NULL,
        ItemName NVARCHAR(255) NULL,
        OldPrice DECIMAL(18, 4) NOT NULL,
        NewPrice DECIMAL(18, 4) NOT NULL,
        OldCost DECIMAL(18, 4) NOT NULL,
        NewCost DECIMAL(18, 4) NOT NULL,
        Timestamp DATETIME2 NOT NULL,
        ChangedById NVARCHAR(64) NULL,
        ChangedByName NVARCHAR(255) NULL,
        Reason NVARCHAR(500) NULL
    );
END
GO

-- ==============================================================================
-- 13. نقاط البيع: الفواتير المعلقة (Held Invoices)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'HeldInvoices')
BEGIN
    CREATE TABLE dbo.HeldInvoices (
        Id NVARCHAR(64) PRIMARY KEY,
        HeldAt DATETIME2 NOT NULL,
        CashierId NVARCHAR(64) NULL,
        CashierName NVARCHAR(255) NULL,
        TerminalId NVARCHAR(64) NULL,
        TableId NVARCHAR(64) NULL,
        CustomerName NVARCHAR(255) NULL,
        Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
        CartData NVARCHAR(MAX) NOT NULL
    );
END
GO

-- ==============================================================================
-- 14. نقاط البيع: سجل الرقابة والتدقيق (POS Audit Logs)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PosAuditLogs')
BEGIN
    CREATE TABLE dbo.PosAuditLogs (
        Id NVARCHAR(64) PRIMARY KEY,
        Date DATETIME2 NOT NULL,
        CashierId NVARCHAR(64) NULL,
        CashierName NVARCHAR(255) NULL,
        Action NVARCHAR(100) NOT NULL, -- delete_item, cancel_cart, bypass_scan, open_drawer, discount_applied
        Details NVARCHAR(MAX) NULL,
        InvoiceId NVARCHAR(64) NULL,
        TerminalId NVARCHAR(64) NULL
    );
END
GO

-- ==============================================================================
-- 15. قطاع المطاعم: الطاولات والصالات (Restaurant Tables)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RestaurantTables')
BEGIN
    CREATE TABLE dbo.RestaurantTables (
        Id NVARCHAR(64) PRIMARY KEY,
        TableNumber NVARCHAR(50) NOT NULL,
        Capacity INT NOT NULL DEFAULT 4,
        Status NVARCHAR(50) NOT NULL DEFAULT N'available', -- available, occupied, reserved
        Zone NVARCHAR(100) NULL,
        WarehouseId NVARCHAR(64) NULL
    );
END
GO

-- ==============================================================================
-- 16. التسويق والولاء: العروض والخصومات (Promotions)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Promotions')
BEGIN
    CREATE TABLE dbo.Promotions (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Type NVARCHAR(50) NOT NULL, -- percentage, fixed_amount, buy_x_get_y, bundle
        Value DECIMAL(18, 4) NOT NULL DEFAULT 0,
        StartDate DATETIME2 NOT NULL,
        EndDate DATETIME2 NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        ConditionsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- ==============================================================================
-- 17. المستهدفات البيعية (Sales Targets)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Targets')
BEGIN
    CREATE TABLE dbo.Targets (
        Id NVARCHAR(64) PRIMARY KEY,
        TargetKey NVARCHAR(100) NOT NULL, -- branch, rep, cashier, item
        TargetPeriod NVARCHAR(50) NOT NULL, -- 2026-11, Q4-2026
        TargetAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        AchievedAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        DetailsJson NVARCHAR(MAX) NULL
    );
END
GO

-- ==============================================================================
-- 18. التوصيل والمناديب والمبيعات (DeliveryStaff, Sellers, ItemGroups, Colors, Sizes)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DeliveryStaff')
BEGIN
    CREATE TABLE dbo.DeliveryStaff (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Phone NVARCHAR(50) NULL,
        VehicleType NVARCHAR(100) NULL,
        VehicleNumber NVARCHAR(50) NULL,
        WarehouseId NVARCHAR(64) NULL,
        IsActive BIT NOT NULL DEFAULT 1
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Sellers')
BEGIN
    CREATE TABLE dbo.Sellers (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Phone NVARCHAR(50) NULL,
        CommissionRate DECIMAL(5, 2) NOT NULL DEFAULT 0,
        WarehouseId NVARCHAR(64) NULL,
        IsActive BIT NOT NULL DEFAULT 1
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemGroups')
BEGIN
    CREATE TABLE dbo.ItemGroups (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Code NVARCHAR(50) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemColors')
BEGIN
    CREATE TABLE dbo.ItemColors (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(100) NOT NULL,
        ColorCode NVARCHAR(50) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSizes')
BEGIN
    CREATE TABLE dbo.ItemSizes (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(100) NOT NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Notifications')
BEGIN
    CREATE TABLE dbo.Notifications (
        Id NVARCHAR(64) PRIMARY KEY,
        Title NVARCHAR(255) NOT NULL,
        Body NVARCHAR(MAX) NOT NULL,
        Timestamp DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        IsRead BIT NOT NULL DEFAULT 0,
        TargetUserId NVARCHAR(64) NULL,
        Type NVARCHAR(50) NULL
    );
END
GO

PRINT 'All Extended ERP Document Tables Created Successfully in SQL Server!';
GO

