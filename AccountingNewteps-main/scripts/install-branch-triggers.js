const sql = require('mssql');

const config = {
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

async function main() {
    console.log('Connecting to install branch triggers...');
    const pool = await sql.connect(config);

    const triggers = [
        `CREATE OR ALTER TRIGGER trg_SalesInvoices_BranchSync
        ON dbo.SalesInvoices
        AFTER INSERT, UPDATE
        AS
        BEGIN
            SET NOCOUNT ON;
            IF TRIGGER_NESTLEVEL() > 1 RETURN;
            UPDATE s
            SET s.BranchCode = COALESCE(s.BranchCode, w.Code, '900'),
                s.BranchName = COALESCE(s.BranchName, w.Name, N'الفرع الرأيسي')
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
            SET p.BranchCode = COALESCE(p.BranchCode, w.Code, '900'),
                p.BranchName = COALESCE(p.BranchName, w.Name, N'الفرع الرأيسي')
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
            SET cp.BranchCode = COALESCE(cp.BranchCode, ca.BranchCode, '900'),
                cp.BranchName = COALESCE(cp.BranchName, ca.BranchName, N'الفرع الرأيسي')
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
            SET sp.BranchCode = COALESCE(sp.BranchCode, ca.BranchCode, '900'),
                sp.BranchName = COALESCE(sp.BranchName, ca.BranchName, N'الفرع الرأيسي')
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
            SET e.BranchCode = COALESCE(e.BranchCode, w.Code, '900'),
                e.BranchName = COALESCE(e.BranchName, w.Name, N'الفرع الرأيسي')
            FROM dbo.Expenses e
            INNER JOIN inserted i ON e.Id = i.Id
            LEFT JOIN dbo.Warehouses w ON e.WarehouseId = w.Id;
        END;`
    ];

    for (const trg of triggers) {
        await pool.request().query(trg);
        console.log('[✓] Trigger installed successfully.');
    }

    await pool.close();
    console.log('All branch sync triggers installed successfully.');
}

main().catch(console.error);
