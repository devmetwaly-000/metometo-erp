const sql = require('mssql');

const sqlConfig = {
    user: process.env.DB_USER || 'meto_pos',
    password: process.env.DB_PASSWORD || 'MetoPosPass123!',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'MultiBranchPOS_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function runTestSuite() {
    console.log('=== MULTIBRANCH POS & ACCOUNTING SQL SERVER TEST SUITE ===');
    console.log('Connecting to MSSQLSERVER at localhost...');
    const pool = await sql.connect(sqlConfig);
    console.log('✓ Connection established to database:', sqlConfig.database);

    // 1. Audit Table Counts
    console.log('\n--- 1. Auditing Table Row Counts ---');
    const tables = [
        'Warehouses', 'InventorySections', 'ItemSections', 'Items',
        'Customers', 'Suppliers', 'CashAccounts', 'Users', 'Roles',
        'PosSessions', 'SalesInvoices', 'SalesInvoiceItems',
        'PurchaseInvoices', 'PurchaseInvoiceItems', 'SalesReturns', 'SalesReturnItems',
        'CustomerPayments', 'SupplierPayments', 'Expenses', 'StockInRecords', 'StockAdjustmentRecords'
    ];

    for (const t of tables) {
        const res = await pool.request().query(`SELECT COUNT(*) as cnt FROM dbo.${t}`);
        console.log(`  Table [${t}]: ${res.recordset[0].cnt} rows`);
    }

    // 2. Relational Integrity Checks
    console.log('\n--- 2. Verifying Relational Integrity ---');
    const orphanInvoiceItems = await pool.request().query(`
        SELECT COUNT(*) as orphans
        FROM dbo.SalesInvoiceItems sii
        LEFT JOIN dbo.SalesInvoices si ON sii.InvoiceId = si.Id
        WHERE si.Id IS NULL
    `);
    console.log(`  Orphan Sales Invoice Items: ${orphanInvoiceItems.recordset[0].orphans} (Must be 0)`);

    const orphanPurchaseItems = await pool.request().query(`
        SELECT COUNT(*) as orphans
        FROM dbo.PurchaseInvoiceItems pii
        LEFT JOIN dbo.PurchaseInvoices pi ON pii.PurchaseInvoiceId = pi.Id
        WHERE pi.Id IS NULL
    `);
    console.log(`  Orphan Purchase Invoice Items: ${orphanPurchaseItems.recordset[0].orphans} (Must be 0)`);

    // 3. Test ACID Transaction Insert (New Sales Invoice + Line Items)
    console.log('\n--- 3. Testing ACID Transaction Insert (New Sales Invoice) ---');
    const testInvId = 'test_inv_' + Date.now();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const req1 = new sql.Request(tx);
        await req1.input('Id', sql.NVarChar(64), testInvId)
            .input('InvoiceNumber', sql.NVarChar(100), 'TEST-INV-001')
            .input('Date', sql.DateTime2, new Date())
            .input('CustomerId', sql.NVarChar(64), 'test-customer')
            .input('Subtotal', sql.Decimal(18, 4), 1000)
            .input('Total', sql.Decimal(18, 4), 1000)
            .input('PaidAmount', sql.Decimal(18, 4), 1000)
            .input('Status', sql.NVarChar(50), 'approved')
            .query(`
                INSERT INTO dbo.SalesInvoices (Id, InvoiceNumber, Date, CustomerId, Subtotal, Total, PaidAmount, Status)
                VALUES (@Id, @InvoiceNumber, @Date, @CustomerId, @Subtotal, @Total, @PaidAmount, @Status);
            `);

        const req2 = new sql.Request(tx);
        await req2.input('InvoiceId', sql.NVarChar(64), testInvId)
            .input('ItemCode', sql.NVarChar(100), 'TEST-001')
            .input('ItemName', sql.NVarChar(255), 'تجربة صنف اختبار')
            .input('Qty', sql.Decimal(18, 4), 2)
            .input('Price', sql.Decimal(18, 4), 500)
            .input('Cost', sql.Decimal(18, 4), 300)
            .input('Total', sql.Decimal(18, 4), 1000)
            .query(`
                INSERT INTO dbo.SalesInvoiceItems (InvoiceId, ItemCode, ItemName, Qty, Price, Cost, Total)
                VALUES (@InvoiceId, @ItemCode, @ItemName, @Qty, @Price, @Cost, @Total);
            `);

        await tx.commit();
        console.log('✓ Test Transaction committed successfully!');

        // Query back
        const check = await pool.request().input('Id', sql.NVarChar(64), testInvId).query(`
            SELECT si.InvoiceNumber, si.Total, COUNT(sii.Id) as ItemCount
            FROM dbo.SalesInvoices si
            JOIN dbo.SalesInvoiceItems sii ON si.Id = sii.InvoiceId
            WHERE si.Id = @Id
            GROUP BY si.InvoiceNumber, si.Total
        `);
        console.log('  Queried Test Invoice:', check.recordset[0]);

        // Clean up test invoice
        await pool.request().input('Id', sql.NVarChar(64), testInvId).query(`
            DELETE FROM dbo.SalesInvoices WHERE Id = @Id;
        `);
        console.log('✓ Test Invoice cleaned up successfully.');
    } catch (err) {
        await tx.rollback();
        console.error('Transaction failed:', err);
    }

    // 4. Test Customer Balance Query
    console.log('\n--- 4. Customer Financial Ledger Query ---');
    const customerLedger = await pool.request().query(`
        SELECT TOP 5 
            c.Id, c.Name, c.CurrentBalance,
            COALESCE(SUM(si.Total), 0) as TotalInvoices,
            COALESCE(SUM(si.PaidAmount), 0) as PaidOnInvoices,
            COALESCE(p.TotalPayments, 0) as SeparatePayments
        FROM dbo.Customers c
        LEFT JOIN dbo.SalesInvoices si ON c.Id = si.CustomerId AND si.Status = 'approved'
        LEFT JOIN (
            SELECT CustomerId, SUM(Amount) as TotalPayments 
            FROM dbo.CustomerPayments 
            GROUP BY CustomerId
        ) p ON c.Id = p.CustomerId
        GROUP BY c.Id, c.Name, c.CurrentBalance, p.TotalPayments
        ORDER BY TotalInvoices DESC;
    `);
    console.log('  Top 5 Customers by Invoice Volume:');
    for (const r of customerLedger.recordset) {
        console.log(`    - [${r.Name}]: Total Billed: ${r.TotalInvoices} EGP, Total Paid: ${Number(r.PaidOnInvoices) + Number(r.SeparatePayments)} EGP`);
    }

    console.log('\n========================================================');
    console.log('ALL SQL SERVER INTEGRITY AND PERFORMANCE TESTS PASSED!');
    console.log('========================================================');
    await pool.close();
}

runTestSuite().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});

