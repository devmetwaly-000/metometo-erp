const sql = require('mssql');

const localConfig = {
    user: 'meto_pos',
    password: 'MetoPosPass123!',
    server: 'localhost',
    database: 'MultiBranchPOS_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

const centralConfig = {
    user: 'meto_pos',
    password: 'MetoPosPass123!',
    server: 'localhost',
    database: 'MultiBranchPOS_Central_DB',
    options: { encrypt: false, trustServerCertificate: true }
};

async function main() {
    const localPool = new sql.ConnectionPool(localConfig);
    await localPool.connect();

    const centralPool = new sql.ConnectionPool(centralConfig);
    await centralPool.connect();

    const localColsRes = await localPool.request().query(`
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE, COLUMN_DEFAULT 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME != 'sysdiagrams'
    `);
    const centralColsRes = await centralPool.request().query(`
        SELECT TABLE_NAME, COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME != 'sysdiagrams'
    `);

    const centralCols = new Set(centralColsRes.recordset.map(r => r.TABLE_NAME + '.' + r.COLUMN_NAME.toLowerCase()));

    const missingInCentral = [];
    for (const c of localColsRes.recordset) {
        const key = c.TABLE_NAME + '.' + c.COLUMN_NAME.toLowerCase();
        if (!centralCols.has(key)) {
            missingInCentral.push(c);
        }
    }

    console.log('Columns in local DB but missing in Central DB:', missingInCentral.length);

    for (const c of missingInCentral) {
        let type = c.DATA_TYPE.toUpperCase();
        if (type === 'NVARCHAR' || type === 'VARCHAR' || type === 'CHAR' || type === 'NCHAR') {
            type += '(' + (c.CHARACTER_MAXIMUM_LENGTH === -1 ? 'MAX' : c.CHARACTER_MAXIMUM_LENGTH) + ')';
        } else if (type === 'DECIMAL' || type === 'NUMERIC') {
            type += '(' + c.NUMERIC_PRECISION + ',' + c.NUMERIC_SCALE + ')';
        }

        const alterSql = `ALTER TABLE dbo.[${c.TABLE_NAME}] ADD [${c.COLUMN_NAME}] ${type} NULL;`;
        try {
            await centralPool.request().query(alterSql);
            console.log(`[+] Added column ${c.TABLE_NAME}.${c.COLUMN_NAME}`);
        } catch (err) {
            console.warn(`Error adding column ${c.TABLE_NAME}.${c.COLUMN_NAME}:`, err.message);
        }
    }

    // Now recreate all views
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

    for (const v of views) {
        try {
            await centralPool.request().query(v);
            console.log('[+] View installed successfully');
        } catch (vErr) {
            console.error('View error:', vErr.message);
        }
    }

    const finalTables = await centralPool.request().query('SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = \'BASE TABLE\' AND TABLE_NAME != \'sysdiagrams\'');
    const finalViews = await centralPool.request().query('SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.VIEWS');

    console.log('Final in Central DB: Tables =', finalTables.recordset[0].cnt, '| Views =', finalViews.recordset[0].cnt);

    await localPool.close();
    await centralPool.close();
}

main().catch(console.error);
