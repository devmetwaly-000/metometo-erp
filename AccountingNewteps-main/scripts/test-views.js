const sql = require('mssql');

const config = {
    user: 'meto_pos',
    password: 'MetoPosPass123!',
    server: 'localhost',
    database: 'MultiBranchPOS_Central_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

async function testViews() {
    const pool = await sql.connect(config);

    try {
        await pool.request().query(`
            CREATE OR ALTER VIEW dbo.View_CashAccountBalances AS
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
            LEFT JOIN (SELECT AccountId, SUM(Amount) AS TotalWithdrawals FROM dbo.TreasuryTransactions WHERE Type = 'withdrawal' GROUP BY AccountId) withd ON ca.Id = withd.AccountId;
        `);
        console.log('View_CashAccountBalances: SUCCESS');
    } catch (err) {
        console.error('View_CashAccountBalances ERROR:', err.message);
    }

    try {
        await pool.request().query(`
            CREATE OR ALTER VIEW dbo.View_ItemStockBalances AS
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
            LEFT JOIN (SELECT ItemId, WarehouseId, SUM(Qty) AS TotalOut FROM OutwardStock GROUP BY ItemId, WarehouseId) outw ON i.Id = outw.ItemId AND w.Id = outw.WarehouseId;
        `);
        console.log('View_ItemStockBalances: SUCCESS');
    } catch (err) {
        console.error('View_ItemStockBalances ERROR:', err.message);
    }

    const views = await pool.request().query('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS');
    console.log('All Views now in Central DB:', views.recordset.map(r => r.TABLE_NAME));
    await pool.close();
}

testViews().catch(console.error);
