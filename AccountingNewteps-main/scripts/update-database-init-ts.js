const fs = require('fs');
const schemas = JSON.parse(fs.readFileSync('scripts/tables_schema.json', 'utf8'));

function formatCol(c, pks) {
    let type = c.DATA_TYPE.toUpperCase();
    if (type === 'NVARCHAR' || type === 'VARCHAR' || type === 'CHAR' || type === 'NCHAR') {
        type += '(' + (c.CHARACTER_MAXIMUM_LENGTH === -1 ? 'MAX' : c.CHARACTER_MAXIMUM_LENGTH) + ')';
    } else if (type === 'DECIMAL' || type === 'NUMERIC') {
        type += '(' + c.NUMERIC_PRECISION + ',' + c.NUMERIC_SCALE + ')';
    }
    
    let res = '[' + c.COLUMN_NAME + '] ' + type;
    if (c.IsIdentity === 1) {
        res += ' IDENTITY(1,1)';
    }
    if (c.IS_NULLABLE === 'NO' || (pks && pks.includes(c.COLUMN_NAME))) {
        res += ' NOT NULL';
    } else {
        res += ' NULL';
    }
    if (c.COLUMN_DEFAULT) {
        res += ' DEFAULT ' + c.COLUMN_DEFAULT;
    }
    return res;
}

function generateTableDDL(s) {
    const colDefs = s.columns.map(c => '                ' + formatCol(c, s.pks));
    if (s.pks && s.pks.length > 0) {
        colDefs.push('                CONSTRAINT [PK_' + s.table + '] PRIMARY KEY CLUSTERED ([' + s.pks.join('], [') + '])');
    }
    return `            \`IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${s.table}')
            CREATE TABLE dbo.[${s.table}] (
${colDefs.join(',\n')}
            );\``;
}

const tableDDLs = schemas.map(generateTableDDL).join(',\n\n');

const fullContent = `/**
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
        await masterPool.request().query(\`
            IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'\${cleanDbName}')
            BEGIN
                CREATE DATABASE [\${cleanDbName}] COLLATE Arabic_100_CI_AS;
            END;
        \`);

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
${tableDDLs}
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
            \`CREATE OR ALTER TRIGGER trg_SalesInvoices_BranchSync
            ON dbo.SalesInvoices
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE s
                SET s.BranchCode = COALESCE(s.BranchCode, w.Code, '\${branchCode}'),
                    s.BranchName = COALESCE(s.BranchName, w.Name, N'\${branchName}')
                FROM dbo.SalesInvoices s
                INNER JOIN inserted i ON s.Id = i.Id
                LEFT JOIN dbo.Warehouses w ON s.WarehouseId = w.Id;
            END;\`,

            \`CREATE OR ALTER TRIGGER trg_PurchaseInvoices_BranchSync
            ON dbo.PurchaseInvoices
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE p
                SET p.BranchCode = COALESCE(p.BranchCode, w.Code, '\${branchCode}'),
                    p.BranchName = COALESCE(p.BranchName, w.Name, N'\${branchName}')
                FROM dbo.PurchaseInvoices p
                INNER JOIN inserted i ON p.Id = i.Id
                LEFT JOIN dbo.Warehouses w ON p.WarehouseId = w.Id;
            END;\`,

            \`CREATE OR ALTER TRIGGER trg_CustomerPayments_BranchSync
            ON dbo.CustomerPayments
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE cp
                SET cp.BranchCode = COALESCE(cp.BranchCode, ca.BranchCode, '\${branchCode}'),
                    cp.BranchName = COALESCE(cp.BranchName, ca.BranchName, N'\${branchName}')
                FROM dbo.CustomerPayments cp
                INNER JOIN inserted i ON cp.Id = i.Id
                LEFT JOIN dbo.CashAccounts ca ON cp.PaidToAccountId = ca.Id;
            END;\`,

            \`CREATE OR ALTER TRIGGER trg_SupplierPayments_BranchSync
            ON dbo.SupplierPayments
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE sp
                SET sp.BranchCode = COALESCE(sp.BranchCode, ca.BranchCode, '\${branchCode}'),
                    sp.BranchName = COALESCE(sp.BranchName, ca.BranchName, N'\${branchName}')
                FROM dbo.SupplierPayments sp
                INNER JOIN inserted i ON sp.Id = i.Id
                LEFT JOIN dbo.CashAccounts ca ON sp.PaidFromAccountId = ca.Id;
            END;\`,

            \`CREATE OR ALTER TRIGGER trg_Expenses_BranchSync
            ON dbo.Expenses
            AFTER INSERT, UPDATE
            AS
            BEGIN
                SET NOCOUNT ON;
                IF TRIGGER_NESTLEVEL() > 1 RETURN;
                UPDATE e
                SET e.BranchCode = COALESCE(e.BranchCode, w.Code, '\${branchCode}'),
                    e.BranchName = COALESCE(e.BranchName, w.Name, N'\${branchName}')
                FROM dbo.Expenses e
                INNER JOIN inserted i ON e.Id = i.Id
                LEFT JOIN dbo.Warehouses w ON e.WarehouseId = w.Id;
            END;\`
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
            \`CREATE OR ALTER VIEW dbo.View_CustomerBalances AS
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
            LEFT JOIN (SELECT CustomerId, SUM(Total) AS TotalReturns FROM dbo.SalesReturns GROUP BY CustomerId) ret ON c.Id = ret.CustomerId;\`,

            \`CREATE OR ALTER VIEW dbo.View_SupplierBalances AS
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
            LEFT JOIN (SELECT SupplierId, SUM(Total) AS TotalReturns FROM dbo.PurchaseReturns GROUP BY SupplierId) ret ON s.Id = ret.SupplierId;\`,

            \`CREATE OR ALTER VIEW dbo.View_CashAccountBalances AS
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
            LEFT JOIN (SELECT AccountId, SUM(Amount) AS TotalWithdrawals FROM dbo.TreasuryTransactions WHERE Type = 'withdrawal' GROUP BY AccountId) withd ON ca.Id = withd.AccountId;\`,

            \`CREATE OR ALTER VIEW dbo.View_ItemStockBalances AS
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
            LEFT JOIN (SELECT ItemId, WarehouseId, SUM(Qty) AS TotalOut FROM OutwardStock GROUP BY ItemId, WarehouseId) outw ON i.Id = outw.ItemId AND w.Id = outw.WarehouseId;\`
        ];

        for (const vw of views) {
            try {
                await targetPool.request().query(vw);
            } catch (vwErr: any) {
                console.error('Error creating view:', vwErr.message);
            }
        }

        // Count created tables
        const countRes = await targetPool.request().query(\`
            SELECT COUNT(*) as cnt 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME != 'sysdiagrams'
        \`);
        const tablesCount = countRes.recordset[0]?.cnt || 0;

        await targetPool.close();

        return {
            success: true,
            database: cleanDbName,
            tablesCount,
            message: \`تم إنشاء وتهيئة كافة جداول قاعدة البيانات [\${cleanDbName}] بنجاح (\${tablesCount} جدولاً بالكامل)، مع تثبيت المشغلات التلقائية والعروض التحليلية ورمز الفرع (\${branchCode}).\`
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
`;

fs.writeFileSync('src/lib/database-init.ts', fullContent, 'utf8');
console.log('Successfully updated src/lib/database-init.ts with 69 tables, 5 triggers, and 4 views!');

