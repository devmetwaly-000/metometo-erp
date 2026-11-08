-- ==============================================================================
-- MultiBranch POS & Accounting System - Microsoft SQL Server Database Schema
-- Database: MultiBranchPOS_DB
-- ==============================================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'MultiBranchPOS_DB')
BEGIN
    CREATE DATABASE MultiBranchPOS_DB COLLATE Arabic_100_CI_AS;
END
GO

USE MultiBranchPOS_DB;
GO

-- 1. Master Data: Warehouses & Branches
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Warehouses')
BEGIN
    CREATE TABLE dbo.Warehouses (
        Id NVARCHAR(64) PRIMARY KEY,
        Code NVARCHAR(50) NULL,
        Name NVARCHAR(255) NOT NULL,
        Address NVARCHAR(500) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 2. Master Data: Warehouse Sections / Zones
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InventorySections')
BEGIN
    CREATE TABLE dbo.InventorySections (
        Id NVARCHAR(64) PRIMARY KEY,
        MainWarehouseId NVARCHAR(64) NULL,
        Name NVARCHAR(255) NOT NULL,
        Capacity INT DEFAULT 0,
        AllowOverfill BIT DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 3. Master Data: Item Sections & Categories
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemSections')
BEGIN
    CREATE TABLE dbo.ItemSections (
        Id NVARCHAR(64) PRIMARY KEY,
        Code NVARCHAR(50) NULL,
        Name NVARCHAR(255) NOT NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ItemCategories')
BEGIN
    CREATE TABLE dbo.ItemCategories (
        Id NVARCHAR(64) PRIMARY KEY,
        SectionId NVARCHAR(64) NULL,
        Name NVARCHAR(255) NOT NULL
    );
END
GO

-- 4. Master Data: Items (Products)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Items')
BEGIN
    CREATE TABLE dbo.Items (
        Id NVARCHAR(64) PRIMARY KEY,
        Code NVARCHAR(100) NOT NULL,
        Name NVARCHAR(255) NOT NULL,
        Cost DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Price DECIMAL(18, 4) NOT NULL DEFAULT 0,
        BaseUnit NVARCHAR(50) NOT NULL DEFAULT N'piece',
        ItemType NVARCHAR(50) NOT NULL DEFAULT N'standard',
        ReorderPoint DECIMAL(18, 4) NOT NULL DEFAULT 0,
        SectionId NVARCHAR(64) NULL,
        CategoryId NVARCHAR(64) NULL,
        IsDisabled BIT NOT NULL DEFAULT 0,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_Items_Code ON dbo.Items (Code);
    CREATE INDEX IX_Items_Name ON dbo.Items (Name);
END
GO

-- 5. Master Data: Customers
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Customers')
BEGIN
    CREATE TABLE dbo.Customers (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Phone NVARCHAR(50) NULL,
        Address NVARCHAR(500) NULL,
        AllowCredit BIT NOT NULL DEFAULT 1,
        CreditLimit DECIMAL(18, 4) NOT NULL DEFAULT 0,
        OpeningBalance DECIMAL(18, 4) NOT NULL DEFAULT 0,
        CurrentBalance DECIMAL(18, 4) NOT NULL DEFAULT 0,
        InvoiceCount INT NOT NULL DEFAULT 0,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_Customers_Name ON dbo.Customers (Name);
    CREATE INDEX IX_Customers_Phone ON dbo.Customers (Phone);
END
GO

-- 6. Master Data: Suppliers
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Suppliers')
BEGIN
    CREATE TABLE dbo.Suppliers (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Contact NVARCHAR(255) NULL,
        OpeningBalance DECIMAL(18, 4) NOT NULL DEFAULT 0,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_Suppliers_Name ON dbo.Suppliers (Name);
END
GO

-- 7. Master Data: Cash Accounts & Treasuries
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashAccounts')
BEGIN
    CREATE TABLE dbo.CashAccounts (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Type NVARCHAR(50) NOT NULL DEFAULT N'drawer',
        OpeningBalance DECIMAL(18, 4) NOT NULL DEFAULT 0,
        UserId NVARCHAR(64) NULL,
        WarehouseId NVARCHAR(64) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 8. Security: Roles & Permissions
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Roles')
BEGIN
    CREATE TABLE dbo.Roles (
        Id NVARCHAR(100) PRIMARY KEY, -- e.g. مسؤول, كاشير
        PermissionsJson NVARCHAR(MAX) NOT NULL
    );
END
GO

-- 9. Security: Users
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE dbo.Users (
        Id NVARCHAR(64) PRIMARY KEY,
        LoginName NVARCHAR(100) NOT NULL UNIQUE,
        Name NVARCHAR(255) NOT NULL,
        Password NVARCHAR(255) NOT NULL,
        Phone NVARCHAR(50) NULL,
        Role NVARCHAR(100) NULL,
        WarehouseIds NVARCHAR(MAX) NULL,
        Uid NVARCHAR(100) NULL,
        IsCashier BIT NOT NULL DEFAULT 0,
        IsDelivery BIT NOT NULL DEFAULT 0,
        IsSalesRep BIT NOT NULL DEFAULT 0,
        CanOpenOwnShift BIT NOT NULL DEFAULT 1,
        CanDeleteFromCart BIT NOT NULL DEFAULT 1,
        CanProcessReturn BIT NOT NULL DEFAULT 1,
        CanCancelInvoice BIT NOT NULL DEFAULT 0,
        CanBypassScannerForReturn BIT NOT NULL DEFAULT 0,
        IsDisabled BIT NOT NULL DEFAULT 0,
        ThemeSettings NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_Users_LoginName ON dbo.Users (LoginName);
END
GO

-- 10. Operations: POS Sessions & Cashier Shifts
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PosSessions')
BEGIN
    CREATE TABLE dbo.PosSessions (
        Id NVARCHAR(64) PRIMARY KEY,
        StartTime DATETIME2 NOT NULL,
        EndTime DATETIME2 NULL,
        OpenedBy NVARCHAR(64) NULL,
        OpenedByName NVARCHAR(255) NULL,
        ClosedBy NVARCHAR(64) NULL,
        ClosedByName NVARCHAR(255) NULL,
        IsClosed BIT NOT NULL DEFAULT 0,
        PosTerminalId NVARCHAR(64) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 11. Transactions: Sales Invoices (Header & Items)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesInvoices')
BEGIN
    CREATE TABLE dbo.SalesInvoices (
        Id NVARCHAR(64) PRIMARY KEY,
        InvoiceNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        CustomerId NVARCHAR(64) NULL,
        CustomerName NVARCHAR(255) NULL,
        WarehouseId NVARCHAR(64) NULL,
        SalesRepId NVARCHAR(64) NULL,
        CashierId NVARCHAR(64) NULL,
        Subtotal DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Discount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Tax DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
        PaidAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        PaidToAccountId NVARCHAR(64) NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'approved',
        IsDelivery BIT NOT NULL DEFAULT 0,
        DeliveryReconciled BIT NOT NULL DEFAULT 0,
        IsTaxIncluded BIT NOT NULL DEFAULT 0,
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_SalesInvoices_Date ON dbo.SalesInvoices (Date);
    CREATE INDEX IX_SalesInvoices_CustomerId ON dbo.SalesInvoices (CustomerId);
    CREATE INDEX IX_SalesInvoices_WarehouseId ON dbo.SalesInvoices (WarehouseId);
    CREATE INDEX IX_SalesInvoices_Status ON dbo.SalesInvoices (Status);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesInvoiceItems')
BEGIN
    CREATE TABLE dbo.SalesInvoiceItems (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        InvoiceId NVARCHAR(64) NOT NULL,
        ItemId NVARCHAR(64) NULL,
        ItemCode NVARCHAR(100) NULL,
        ItemName NVARCHAR(255) NULL,
        Qty DECIMAL(18, 4) NOT NULL DEFAULT 1,
        Price DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Cost DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
        CONSTRAINT FK_SalesInvoiceItems_Invoice FOREIGN KEY (InvoiceId) REFERENCES dbo.SalesInvoices(Id) ON DELETE CASCADE
    );
    CREATE INDEX IX_SalesInvoiceItems_InvoiceId ON dbo.SalesInvoiceItems (InvoiceId);
    CREATE INDEX IX_SalesInvoiceItems_ItemId ON dbo.SalesInvoiceItems (ItemId);
END
GO

-- 12. Transactions: Sales Returns (Header & Items)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesReturns')
BEGIN
    CREATE TABLE dbo.SalesReturns (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        OriginalInvoiceId NVARCHAR(64) NULL,
        Date DATETIME2 NOT NULL,
        CustomerId NVARCHAR(64) NULL,
        WarehouseId NVARCHAR(64) NULL,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        Subtotal DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
        PaidAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        PaidFromAccountId NVARCHAR(64) NULL,
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_SalesReturns_Date ON dbo.SalesReturns (Date);
    CREATE INDEX IX_SalesReturns_CustomerId ON dbo.SalesReturns (CustomerId);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesReturnItems')
BEGIN
    CREATE TABLE dbo.SalesReturnItems (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ReturnId NVARCHAR(64) NOT NULL,
        ItemId NVARCHAR(64) NULL,
        ItemCode NVARCHAR(100) NULL,
        ItemName NVARCHAR(255) NULL,
        Qty DECIMAL(18, 4) NOT NULL DEFAULT 1,
        Price DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Cost DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
        CONSTRAINT FK_SalesReturnItems_Return FOREIGN KEY (ReturnId) REFERENCES dbo.SalesReturns(Id) ON DELETE CASCADE
    );
    CREATE INDEX IX_SalesReturnItems_ReturnId ON dbo.SalesReturnItems (ReturnId);
END
GO

-- 13. Transactions: Purchase Invoices (Header & Items)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseInvoices')
BEGIN
    CREATE TABLE dbo.PurchaseInvoices (
        Id NVARCHAR(64) PRIMARY KEY,
        InvoiceNumber NVARCHAR(100) NULL,
        BatchNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        DueDate DATETIME2 NULL,
        SupplierId NVARCHAR(64) NULL,
        SupplierName NVARCHAR(255) NULL,
        WarehouseId NVARCHAR(64) NULL,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        Subtotal DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Discount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Tax DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
        PaidAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        PaidFromAccountId NVARCHAR(64) NULL,
        IsTaxIncluded BIT NOT NULL DEFAULT 0,
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_PurchaseInvoices_Date ON dbo.PurchaseInvoices (Date);
    CREATE INDEX IX_PurchaseInvoices_SupplierId ON dbo.PurchaseInvoices (SupplierId);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseInvoiceItems')
BEGIN
    CREATE TABLE dbo.PurchaseInvoiceItems (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        PurchaseInvoiceId NVARCHAR(64) NOT NULL,
        ItemId NVARCHAR(64) NULL,
        ItemCode NVARCHAR(100) NULL,
        ItemName NVARCHAR(255) NULL,
        Qty DECIMAL(18, 4) NOT NULL DEFAULT 1,
        OriginalQty DECIMAL(18, 4) NULL,
        OriginalUnit NVARCHAR(50) NULL,
        ConversionFactor DECIMAL(18, 4) NOT NULL DEFAULT 1,
        Cost DECIMAL(18, 4) NOT NULL DEFAULT 0,
        SellingPrice DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
        CONSTRAINT FK_PurchaseInvoiceItems_Invoice FOREIGN KEY (PurchaseInvoiceId) REFERENCES dbo.PurchaseInvoices(Id) ON DELETE CASCADE
    );
    CREATE INDEX IX_PurchaseInvoiceItems_InvoiceId ON dbo.PurchaseInvoiceItems (PurchaseInvoiceId);
END
GO

-- 14. Transactions: Purchase Returns (Header & Items)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseReturns')
BEGIN
    CREATE TABLE dbo.PurchaseReturns (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        OriginalInvoiceId NVARCHAR(64) NULL,
        Date DATETIME2 NOT NULL,
        SupplierId NVARCHAR(64) NULL,
        WarehouseId NVARCHAR(64) NULL,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        Subtotal DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Discount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
        PaidAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        PaidToAccountId NVARCHAR(64) NULL,
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_PurchaseReturns_Date ON dbo.PurchaseReturns (Date);
    CREATE INDEX IX_PurchaseReturns_SupplierId ON dbo.PurchaseReturns (SupplierId);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseReturnItems')
BEGIN
    CREATE TABLE dbo.PurchaseReturnItems (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ReturnId NVARCHAR(64) NOT NULL,
        ItemId NVARCHAR(64) NULL,
        ItemCode NVARCHAR(100) NULL,
        ItemName NVARCHAR(255) NULL,
        Qty DECIMAL(18, 4) NOT NULL DEFAULT 1,
        Cost DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
        CONSTRAINT FK_PurchaseReturnItems_Return FOREIGN KEY (ReturnId) REFERENCES dbo.PurchaseReturns(Id) ON DELETE CASCADE
    );
    CREATE INDEX IX_PurchaseReturnItems_ReturnId ON dbo.PurchaseReturnItems (ReturnId);
END
GO

-- 15. Financials: Customer Payments (Receipts)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CustomerPayments')
BEGIN
    CREATE TABLE dbo.CustomerPayments (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        CustomerId NVARCHAR(64) NOT NULL,
        InvoiceId NVARCHAR(64) NULL,
        Amount DECIMAL(18, 4) NOT NULL,
        PaidToAccountId NVARCHAR(64) NOT NULL,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        Notes NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_CustomerPayments_Date ON dbo.CustomerPayments (Date);
    CREATE INDEX IX_CustomerPayments_CustomerId ON dbo.CustomerPayments (CustomerId);
    CREATE INDEX IX_CustomerPayments_PaidToAccount ON dbo.CustomerPayments (PaidToAccountId);
END
GO

-- 16. Financials: Supplier Payments (Disbursements)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SupplierPayments')
BEGIN
    CREATE TABLE dbo.SupplierPayments (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        SupplierId NVARCHAR(64) NOT NULL,
        InvoiceId NVARCHAR(64) NULL,
        Amount DECIMAL(18, 4) NOT NULL,
        PaidFromAccountId NVARCHAR(64) NOT NULL,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        Notes NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_SupplierPayments_Date ON dbo.SupplierPayments (Date);
    CREATE INDEX IX_SupplierPayments_SupplierId ON dbo.SupplierPayments (SupplierId);
    CREATE INDEX IX_SupplierPayments_PaidFromAccount ON dbo.SupplierPayments (PaidFromAccountId);
END
GO

-- 17. Financials: Expenses
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Expenses')
BEGIN
    CREATE TABLE dbo.Expenses (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        ExpenseType NVARCHAR(100) NULL,
        Description NVARCHAR(500) NULL,
        Amount DECIMAL(18, 4) NOT NULL,
        TaxAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        WarehouseId NVARCHAR(64) NULL,
        PaidFromAccountId NVARCHAR(64) NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'completed',
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_Expenses_Date ON dbo.Expenses (Date);
    CREATE INDEX IX_Expenses_WarehouseId ON dbo.Expenses (WarehouseId);
END
GO

-- 18. Financials: Treasury Transactions (Deposits, Withdrawals, Internal Transfers)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TreasuryTransactions')
BEGIN
    CREATE TABLE dbo.TreasuryTransactions (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        AccountId NVARCHAR(64) NOT NULL,
        Type NVARCHAR(50) NOT NULL, -- deposit, withdrawal, transfer
        Amount DECIMAL(18, 4) NOT NULL,
        Description NVARCHAR(500) NULL,
        LinkedTransactionId NVARCHAR(64) NULL,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_TreasuryTransactions_Date ON dbo.TreasuryTransactions (Date);
    CREATE INDEX IX_TreasuryTransactions_AccountId ON dbo.TreasuryTransactions (AccountId);
END
GO

-- 19. Inventory Operations: Stock In Records
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockInRecords')
BEGIN
    CREATE TABLE dbo.StockInRecords (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        BatchNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        WarehouseId NVARCHAR(64) NULL,
        PurchaseInvoiceId NVARCHAR(64) NULL,
        Reason NVARCHAR(255) NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'approved',
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_StockInRecords_Date ON dbo.StockInRecords (Date);
    CREATE INDEX IX_StockInRecords_WarehouseId ON dbo.StockInRecords (WarehouseId);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockInRecordItems')
BEGIN
    CREATE TABLE dbo.StockInRecordItems (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        StockInId NVARCHAR(64) NOT NULL,
        ItemId NVARCHAR(64) NULL,
        ItemCode NVARCHAR(100) NULL,
        ItemName NVARCHAR(255) NULL,
        Qty DECIMAL(18, 4) NOT NULL DEFAULT 1,
        Cost DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Total DECIMAL(18, 4) NOT NULL DEFAULT 0,
        CONSTRAINT FK_StockInRecordItems_StockIn FOREIGN KEY (StockInId) REFERENCES dbo.StockInRecords(Id) ON DELETE CASCADE
    );
    CREATE INDEX IX_StockInRecordItems_StockInId ON dbo.StockInRecordItems (StockInId);
END
GO

-- 20. Inventory Operations: Stock Adjustment Records (Inventory Count)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockAdjustmentRecords')
BEGIN
    CREATE TABLE dbo.StockAdjustmentRecords (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        WarehouseId NVARCHAR(64) NULL,
        Reason NVARCHAR(255) NULL,
        CreatedById NVARCHAR(64) NULL,
        CreatedByName NVARCHAR(255) NULL,
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_StockAdjustmentRecords_Date ON dbo.StockAdjustmentRecords (Date);
    CREATE INDEX IX_StockAdjustmentRecords_WarehouseId ON dbo.StockAdjustmentRecords (WarehouseId);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockAdjustmentItems')
BEGIN
    CREATE TABLE dbo.StockAdjustmentItems (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        AdjustmentId NVARCHAR(64) NOT NULL,
        ItemId NVARCHAR(64) NULL,
        ItemName NVARCHAR(255) NULL,
        SystemQty DECIMAL(18, 4) NOT NULL DEFAULT 0,
        ActualQty DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Difference DECIMAL(18, 4) NOT NULL DEFAULT 0,
        CONSTRAINT FK_StockAdjustmentItems_Adjustment FOREIGN KEY (AdjustmentId) REFERENCES dbo.StockAdjustmentRecords(Id) ON DELETE CASCADE
    );
    CREATE INDEX IX_StockAdjustmentItems_AdjustmentId ON dbo.StockAdjustmentItems (AdjustmentId);
END
GO

-- 21. Inventory Operations: Stock Transfers Between Warehouses
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StockTransferRecords')
BEGIN
    CREATE TABLE dbo.StockTransferRecords (
        Id NVARCHAR(64) PRIMARY KEY,
        ReceiptNumber NVARCHAR(100) NULL,
        Date DATETIME2 NOT NULL,
        FromWarehouseId NVARCHAR(64) NULL,
        ToWarehouseId NVARCHAR(64) NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'pending',
        Notes NVARCHAR(MAX) NULL,
        ItemsJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 22. System: Counters (Sequence Generators)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Counters')
BEGIN
    CREATE TABLE dbo.Counters (
        Name NVARCHAR(100) PRIMARY KEY,
        CurrentValue BIGINT NOT NULL DEFAULT 0
    );
END
GO

-- 23. System: Settings & Barcode Configurations
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppSettings')
BEGIN
    CREATE TABLE dbo.AppSettings (
        SettingKey NVARCHAR(100) PRIMARY KEY,
        SettingValue NVARCHAR(MAX) NOT NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BarcodeDesigns')
BEGIN
    CREATE TABLE dbo.BarcodeDesigns (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NULL,
        ConfigJson NVARCHAR(MAX) NOT NULL
    );
END
GO

-- 24. Master Data: POS Terminals, Payment Methods, Partners, Staff
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PosTerminals')
BEGIN
    CREATE TABLE dbo.PosTerminals (
        Id NVARCHAR(64) PRIMARY KEY,
        Code NVARCHAR(50) NULL,
        Name NVARCHAR(255) NOT NULL,
        WarehouseId NVARCHAR(64) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PaymentMethods')
BEGIN
    CREATE TABLE dbo.PaymentMethods (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        AccountId NVARCHAR(64) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Partners')
BEGIN
    CREATE TABLE dbo.Partners (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        SharePercentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
        Contact NVARCHAR(255) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Employees')
BEGIN
    CREATE TABLE dbo.Employees (
        Id NVARCHAR(64) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Role NVARCHAR(100) NULL,
        Salary DECIMAL(18, 4) NOT NULL DEFAULT 0,
        Phone NVARCHAR(50) NULL,
        HireDate DATETIME2 NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeAdvances')
BEGIN
    CREATE TABLE dbo.EmployeeAdvances (
        Id NVARCHAR(64) PRIMARY KEY,
        Date DATETIME2 NOT NULL,
        EmployeeId NVARCHAR(64) NOT NULL,
        Amount DECIMAL(18, 4) NOT NULL,
        PaidFromAccountId NVARCHAR(64) NULL,
        Notes NVARCHAR(MAX) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PayrollRecords')
BEGIN
    CREATE TABLE dbo.PayrollRecords (
        Id NVARCHAR(64) PRIMARY KEY,
        Date DATETIME2 NOT NULL,
        Month NVARCHAR(50) NULL,
        PaidFromAccountId NVARCHAR(64) NULL,
        TotalAmount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        DetailsJson NVARCHAR(MAX) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LoginHistory')
BEGIN
    CREATE TABLE dbo.LoginHistory (
        Id NVARCHAR(64) PRIMARY KEY,
        UserId NVARCHAR(64) NULL,
        UserName NVARCHAR(255) NULL,
        Timestamp DATETIME2 NOT NULL,
        Latitude FLOAT NULL,
        Longitude FLOAT NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CustomerVisits')
BEGIN
    CREATE TABLE dbo.CustomerVisits (
        Id NVARCHAR(64) PRIMARY KEY,
        SalesRepId NVARCHAR(64) NULL,
        SalesRepName NVARCHAR(255) NULL,
        CustomerName NVARCHAR(255) NULL,
        Timestamp DATETIME2 NOT NULL,
        Location NVARCHAR(255) NULL,
        Notes NVARCHAR(MAX) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Licenses')
BEGIN
    CREATE TABLE dbo.Licenses (
        Id NVARCHAR(64) PRIMARY KEY,
        [Key] NVARCHAR(255) NOT NULL,
        StartDate DATETIME2 NULL,
        EndDate DATETIME2 NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT N'active',
        MaxUsers INT NOT NULL DEFAULT 10,
        EnabledModules NVARCHAR(MAX) NULL
    );
END
GO

-- 25. SEED INITIAL ESSENTIAL DATA (Default Admin, Warehouse, Cash Account, Roles)
IF NOT EXISTS (SELECT 1 FROM dbo.Warehouses WHERE Id = 'main-warehouse')
BEGIN
    INSERT INTO dbo.Warehouses (Id, Code, Name, Address)
    VALUES ('main-warehouse', 'WH-01', N'المخزن الرئيسي', N'الفرع الرئيسي');
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.CashAccounts WHERE Id = 'main-cash')
BEGIN
    INSERT INTO dbo.CashAccounts (Id, Name, Type, OpeningBalance, WarehouseId)
    VALUES ('main-cash', N'الخزينة الرئيسية', 'drawer', 0, 'main-warehouse');
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE Id = N'مسؤول')
BEGIN
    INSERT INTO dbo.Roles (Id, PermissionsJson)
    VALUES (N'مسؤول', N'{"all": true, "pos": true, "sales_invoices": true, "inventory_stockStatus": true, "accounting_customerPayments": true, "users": true}');
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE LoginName = 'admin')
BEGIN
    INSERT INTO dbo.Users (
        Id, LoginName, Name, Password, Role, WarehouseIds,
        IsCashier, IsDelivery, IsSalesRep, CanOpenOwnShift, CanDeleteFromCart, CanProcessReturn, CanCancelInvoice
    )
    VALUES (
        'superadmin', 'admin', N'المدير العام', '200300400', N'مسؤول', '["all"]',
        1, 1, 1, 1, 1, 1, 1
    );
END
GO

PRINT 'MultiBranchPOS_DB schema and seed data created successfully.';
GO

