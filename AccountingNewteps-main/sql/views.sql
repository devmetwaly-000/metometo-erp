USE MultiBranchPOS_DB;
GO

-- 1. View: Customer Balances & Aging
IF OBJECT_ID('dbo.View_CustomerBalances', 'V') IS NOT NULL
    DROP VIEW dbo.View_CustomerBalances;
GO

CREATE VIEW dbo.View_CustomerBalances
AS
SELECT 
    c.Id AS CustomerId,
    c.Name AS CustomerName,
    c.Phone,
    c.CreditLimit,
    c.OpeningBalance,
    COALESCE(inv.TotalInvoiced, 0) AS TotalInvoiced,
    COALESCE(inv.PaidOnInvoices, 0) AS PaidOnInvoices,
    COALESCE(pmt.TotalReceipts, 0) AS TotalReceipts,
    COALESCE(ret.TotalReturns, 0) AS TotalReturns,
    (c.OpeningBalance 
     + COALESCE(inv.TotalInvoiced, 0) 
     - COALESCE(inv.PaidOnInvoices, 0) 
     - COALESCE(pmt.TotalReceipts, 0) 
     - COALESCE(ret.TotalReturns, 0)) AS CurrentCalculatedBalance
FROM dbo.Customers c
LEFT JOIN (
    SELECT CustomerId, 
           SUM(Total) AS TotalInvoiced, 
           SUM(PaidAmount) AS PaidOnInvoices
    FROM dbo.SalesInvoices
    WHERE Status = 'approved'
    GROUP BY CustomerId
) inv ON c.Id = inv.CustomerId
LEFT JOIN (
    SELECT CustomerId, 
           SUM(Amount) AS TotalReceipts
    FROM dbo.CustomerPayments
    GROUP BY CustomerId
) pmt ON c.Id = pmt.CustomerId
LEFT JOIN (
    SELECT CustomerId, 
           SUM(Total) AS TotalReturns
    FROM dbo.SalesReturns
    GROUP BY CustomerId
) ret ON c.Id = ret.CustomerId;
GO

-- 2. View: Supplier Balances
IF OBJECT_ID('dbo.View_SupplierBalances', 'V') IS NOT NULL
    DROP VIEW dbo.View_SupplierBalances;
GO

CREATE VIEW dbo.View_SupplierBalances
AS
SELECT 
    s.Id AS SupplierId,
    s.Name AS SupplierName,
    s.Contact,
    s.OpeningBalance,
    COALESCE(purch.TotalPurchases, 0) AS TotalPurchases,
    COALESCE(purch.PaidOnPurchases, 0) AS PaidOnPurchases,
    COALESCE(pmt.TotalDisbursements, 0) AS TotalDisbursements,
    COALESCE(ret.TotalReturns, 0) AS TotalReturns,
    (s.OpeningBalance 
     + COALESCE(purch.TotalPurchases, 0) 
     - COALESCE(purch.PaidOnPurchases, 0) 
     - COALESCE(pmt.TotalDisbursements, 0) 
     - COALESCE(ret.TotalReturns, 0)) AS CurrentCalculatedBalance
FROM dbo.Suppliers s
LEFT JOIN (
    SELECT SupplierId, 
           SUM(Total) AS TotalPurchases, 
           SUM(PaidAmount) AS PaidOnPurchases
    FROM dbo.PurchaseInvoices
    GROUP BY SupplierId
) purch ON s.Id = purch.SupplierId
LEFT JOIN (
    SELECT SupplierId, 
           SUM(Amount) AS TotalDisbursements
    FROM dbo.SupplierPayments
    GROUP BY SupplierId
) pmt ON s.Id = pmt.SupplierId
LEFT JOIN (
    SELECT SupplierId, 
           SUM(Total) AS TotalReturns
    FROM dbo.PurchaseReturns
    GROUP BY SupplierId
) ret ON s.Id = ret.SupplierId;
GO

-- 3. View: Item Stock Balances (Real-time by warehouse)
IF OBJECT_ID('dbo.View_ItemStockBalances', 'V') IS NOT NULL
    DROP VIEW dbo.View_ItemStockBalances;
GO

CREATE VIEW dbo.View_ItemStockBalances
AS
WITH InwardStock AS (
    -- Stock In from purchases or openings
    SELECT sii.ItemId, si.WarehouseId, SUM(sii.Qty) AS Qty
    FROM dbo.StockInRecordItems sii
    JOIN dbo.StockInRecords si ON sii.StockInId = si.Id
    WHERE si.Status = 'approved'
    GROUP BY sii.ItemId, si.WarehouseId

    UNION ALL

    -- Sales Returns
    SELECT sri.ItemId, sr.WarehouseId, SUM(sri.Qty) AS Qty
    FROM dbo.SalesReturnItems sri
    JOIN dbo.SalesReturns sr ON sri.ReturnId = sr.Id
    GROUP BY sri.ItemId, sr.WarehouseId
),
OutwardStock AS (
    -- Sales Invoices
    SELECT sii.ItemId, si.WarehouseId, SUM(sii.Qty) AS Qty
    FROM dbo.SalesInvoiceItems sii
    JOIN dbo.SalesInvoices si ON sii.InvoiceId = si.Id
    WHERE si.Status = 'approved'
    GROUP BY sii.ItemId, si.WarehouseId

    UNION ALL

    -- Purchase Returns
    SELECT pri.ItemId, pr.WarehouseId, SUM(pri.Qty) AS Qty
    FROM dbo.PurchaseReturnItems pri
    JOIN dbo.PurchaseReturns pr ON pri.ReturnId = pr.Id
    GROUP BY pri.ItemId, pr.WarehouseId
)
SELECT 
    i.Id AS ItemId,
    i.Code AS ItemCode,
    i.Name AS ItemName,
    w.Id AS WarehouseId,
    w.Name AS WarehouseName,
    COALESCE(inw.TotalIn, 0) AS TotalInward,
    COALESCE(outw.TotalOut, 0) AS TotalOutward,
    (COALESCE(inw.TotalIn, 0) - COALESCE(outw.TotalOut, 0)) AS CurrentStock
FROM dbo.Items i
CROSS JOIN dbo.Warehouses w
LEFT JOIN (
    SELECT ItemId, WarehouseId, SUM(Qty) AS TotalIn
    FROM InwardStock
    GROUP BY ItemId, WarehouseId
) inw ON i.Id = inw.ItemId AND w.Id = inw.WarehouseId
LEFT JOIN (
    SELECT ItemId, WarehouseId, SUM(Qty) AS TotalOut
    FROM OutwardStock
    GROUP BY ItemId, WarehouseId
) outw ON i.Id = outw.ItemId AND w.Id = outw.WarehouseId;
GO

-- 4. View: Cash Account Balances
IF OBJECT_ID('dbo.View_CashAccountBalances', 'V') IS NOT NULL
    DROP VIEW dbo.View_CashAccountBalances;
GO

CREATE VIEW dbo.View_CashAccountBalances
AS
SELECT 
    ca.Id AS AccountId,
    ca.Name AS AccountName,
    ca.Type AS AccountType,
    ca.OpeningBalance,
    COALESCE(cp.TotalCustomerPayments, 0) AS TotalCustomerPayments,
    COALESCE(si.TotalCashSales, 0) AS TotalCashSales,
    COALESCE(dep.TotalDeposits, 0) AS TotalDeposits,
    COALESCE(sp.TotalSupplierPayments, 0) AS TotalSupplierPayments,
    COALESCE(ex.TotalExpenses, 0) AS TotalExpenses,
    COALESCE(withd.TotalWithdrawals, 0) AS TotalWithdrawals,
    (ca.OpeningBalance 
     + COALESCE(cp.TotalCustomerPayments, 0)
     + COALESCE(si.TotalCashSales, 0)
     + COALESCE(dep.TotalDeposits, 0)
     - COALESCE(sp.TotalSupplierPayments, 0)
     - COALESCE(ex.TotalExpenses, 0)
     - COALESCE(withd.TotalWithdrawals, 0)) AS CurrentBalance
FROM dbo.CashAccounts ca
LEFT JOIN (
    SELECT PaidToAccountId, SUM(Amount) AS TotalCustomerPayments
    FROM dbo.CustomerPayments
    GROUP BY PaidToAccountId
) cp ON ca.Id = cp.PaidToAccountId
LEFT JOIN (
    SELECT PaidToAccountId, SUM(PaidAmount) AS TotalCashSales
    FROM dbo.SalesInvoices
    WHERE Status = 'approved'
    GROUP BY PaidToAccountId
) si ON ca.Id = si.PaidToAccountId
LEFT JOIN (
    SELECT AccountId, SUM(Amount) AS TotalDeposits
    FROM dbo.TreasuryTransactions
    WHERE Type = 'deposit'
    GROUP BY AccountId
) dep ON ca.Id = dep.AccountId
LEFT JOIN (
    SELECT PaidFromAccountId, SUM(Amount) AS TotalSupplierPayments
    FROM dbo.SupplierPayments
    GROUP BY PaidFromAccountId
) sp ON ca.Id = sp.PaidFromAccountId
LEFT JOIN (
    SELECT PaidFromAccountId, SUM(Amount) AS TotalExpenses
    FROM dbo.Expenses
    WHERE Status <> 'pending'
    GROUP BY PaidFromAccountId
) ex ON ca.Id = ex.PaidFromAccountId
LEFT JOIN (
    SELECT AccountId, SUM(Amount) AS TotalWithdrawals
    FROM dbo.TreasuryTransactions
    WHERE Type = 'withdrawal'
    GROUP BY AccountId
) withd ON ca.Id = withd.AccountId;
GO

PRINT 'All SQL Server Analytics Views Created Successfully!';
GO

