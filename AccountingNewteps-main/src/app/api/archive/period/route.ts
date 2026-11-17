import { NextResponse } from 'next/server';
import { getDbPool, sql } from '@/lib/db';
import { logSystemError } from '@/lib/error-logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const mode = searchParams.get('mode') || 'logs';
        const cutoffDate = searchParams.get('cutoffDate');
        const warehouseId = searchParams.get('warehouseId') || 'all';
        const batchId = searchParams.get('batchId') || null;
        const search = searchParams.get('search') || '';

        const pool = await getDbPool();

        // 1. Preview counts before archiving
        if (mode === 'preview' && cutoffDate) {
            const cutoff = new Date(`${cutoffDate}T23:59:59.999Z`);
            const req = pool.request()
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId);

            const previewRes = await req.query(`
                SELECT
                    (SELECT COUNT(*) FROM dbo.SalesInvoices WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)) AS salesInvoicesCount,
                    (SELECT COUNT(*) FROM dbo.SalesReturns WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)) AS salesReturnsCount,
                    (SELECT COUNT(*) FROM dbo.PurchaseInvoices WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)) AS purchaseInvoicesCount,
                    (SELECT COUNT(*) FROM dbo.PurchaseReturns WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)) AS purchaseReturnsCount,
                    (SELECT COUNT(*) FROM dbo.StockInRecords WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)) AS stockInCount,
                    (SELECT COUNT(*) FROM dbo.StockOutRecords WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId OR SourceId = @WarehouseId)) AS stockOutCount,
                    (SELECT COUNT(*) FROM dbo.StockTransferRecords WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR FromSourceId = @WarehouseId)) AS stockTransferCount,
                    (SELECT COUNT(*) FROM dbo.StockAdjustmentRecords WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)) AS stockAdjustmentCount,
                    (SELECT COUNT(*) FROM dbo.StockIssuesToReps WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)) AS repIssuesCount,
                    (SELECT COUNT(*) FROM dbo.StockReturnsFromReps WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)) AS repReturnsCount,
                    (SELECT COUNT(*) FROM dbo.RepRemittances WHERE Date <= @CutoffDate) AS repRemittancesCount
            `);

            const counts = previewRes.recordset[0] || {};
            const totalRecords = Object.values(counts).reduce((sum: number, val: any) => sum + Number(val || 0), 0);

            return NextResponse.json({
                success: true,
                cutoffDate,
                warehouseId,
                counts,
                totalRecords
            });
        }

        // 2. Browse archived invoices & rep transactions
        if (mode === 'browse') {
            const req = pool.request()
                .input('BatchId', sql.NVarChar(64), batchId)
                .input('Search', sql.NVarChar(100), `%${search}%`);

            const [archivedSales, archivedPurchases, archivedRepIssues, archivedRepRemittances] = await Promise.all([
                req.query(`
                    SELECT TOP 100 * FROM dbo.ArchivedSalesInvoices
                    WHERE (@BatchId IS NULL OR ArchiveBatchId = @BatchId)
                      AND (@Search = '%%' OR InvoiceNumber LIKE @Search OR CustomerName LIKE @Search OR Id LIKE @Search)
                    ORDER BY Date DESC
                `),
                pool.request()
                    .input('BatchId', sql.NVarChar(64), batchId)
                    .input('Search', sql.NVarChar(100), `%${search}%`)
                    .query(`
                        SELECT TOP 100 * FROM dbo.ArchivedPurchaseInvoices
                        WHERE (@BatchId IS NULL OR ArchiveBatchId = @BatchId)
                          AND (@Search = '%%' OR InvoiceNumber LIKE @Search OR SupplierName LIKE @Search OR Id LIKE @Search)
                        ORDER BY Date DESC
                    `),
                pool.request()
                    .input('BatchId', sql.NVarChar(64), batchId)
                    .query(`
                        SELECT TOP 100 * FROM dbo.ArchivedStockIssuesToReps
                        WHERE (@BatchId IS NULL OR ArchiveBatchId = @BatchId)
                        ORDER BY Date DESC
                    `),
                pool.request()
                    .input('BatchId', sql.NVarChar(64), batchId)
                    .query(`
                        SELECT TOP 100 * FROM dbo.ArchivedRepRemittances
                        WHERE (@BatchId IS NULL OR ArchiveBatchId = @BatchId)
                        ORDER BY Date DESC
                    `)
            ]);

            return NextResponse.json({
                success: true,
                archivedSales: archivedSales.recordset,
                archivedPurchases: archivedPurchases.recordset,
                archivedRepIssues: archivedRepIssues.recordset,
                archivedRepRemittances: archivedRepRemittances.recordset
            });
        }

        // Default: Return ArchiveLogs
        const logsRes = await pool.request().query(`
            SELECT * FROM dbo.ArchiveLogs
            ORDER BY ArchiveDate DESC
        `);

        return NextResponse.json({
            success: true,
            logs: logsRes.recordset.map((l: any) => ({
                ...l,
                summary: l.SummaryJson ? JSON.parse(l.SummaryJson) : {}
            }))
        });

    } catch (error: any) {
        console.error('Error in GET /api/archive/period:', error);
        await logSystemError({
            source: 'API:archive/period',
            action: 'GET',
            endpoint: '/api/archive/period',
            errorMessage: error.message || 'Error in GET /api/archive/period',
            errorStack: error.stack,
            statusCode: 500
        });
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { cutoffDate, warehouseId = 'all', warehouseName = 'كل الفروع', userId, userName, notes } = body;

        if (!cutoffDate) {
            return NextResponse.json({ success: false, error: 'يرجى تحديد تاريخ نهاية الفترة المراد أرشفتها.' }, { status: 400 });
        }

        const cutoff = new Date(`${cutoffDate}T23:59:59.999Z`);
        const batchId = `arch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const pool = await getDbPool();

        // Check for open POS sessions on or before cutoffDate
        const openSessionCheck = await pool.request()
            .input('CutoffDate', sql.DateTime2, cutoff)
            .query(`
                SELECT COUNT(*) AS OpenCount
                FROM dbo.PosSessions
                WHERE IsClosed = 0 AND StartTime <= @CutoffDate
            `);

        if (Number(openSessionCheck.recordset[0]?.OpenCount || 0) > 0) {
            return NextResponse.json({
                success: false,
                error: 'لا يمكن أرشفة الفترة لوجود وردية نقاط بيع مفتوحة خلال هذه الفترة. يرجى إغلاق جميع الورديات أولاً.'
            }, { status: 400 });
        }

        const tx = new sql.Transaction(pool);
        await tx.begin();

        try {
            const getCols = async (tbl: string) => {
                const r = await new sql.Request(tx).query(`
                    SELECT COLUMN_NAME
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = '${tbl}' AND DATA_TYPE NOT IN ('timestamp', 'rowversion')
                    ORDER BY ORDINAL_POSITION
                `);
                return r.recordset.map((c: any) => `[${c.COLUMN_NAME}]`).join(', ');
            };

            // 1. Preserve Customer Balances by rolling net archived debt into Customers.OpeningBalance
            await new sql.Request(tx)
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .query(`
                    UPDATE c
                    SET c.OpeningBalance = c.OpeningBalance + COALESCE(archInv.NetDebt, 0) - COALESCE(archRet.NetReturnCredit, 0)
                    FROM dbo.Customers c
                    LEFT JOIN (
                        SELECT CustomerId, SUM(Total - COALESCE(PaidAmount, 0)) AS NetDebt
                        FROM dbo.SalesInvoices
                        WHERE Date <= @CutoffDate
                          AND (Status = 'approved' OR Status = 'completed' OR Status IS NULL)
                          AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                        GROUP BY CustomerId
                    ) archInv ON c.Id = archInv.CustomerId
                    LEFT JOIN (
                        SELECT CustomerId, SUM(Total - COALESCE(PaidAmount, 0)) AS NetReturnCredit
                        FROM dbo.SalesReturns
                        WHERE Date <= @CutoffDate
                          AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                        GROUP BY CustomerId
                    ) archRet ON c.Id = archRet.CustomerId
                    WHERE archInv.CustomerId IS NOT NULL OR archRet.CustomerId IS NOT NULL;
                `);

            // 2. Preserve Supplier Balances by rolling net archived payables into Suppliers.OpeningBalance
            await new sql.Request(tx)
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .query(`
                    UPDATE s
                    SET s.OpeningBalance = s.OpeningBalance + COALESCE(archPurch.NetPayable, 0) - COALESCE(archPRet.NetPRetCredit, 0)
                    FROM dbo.Suppliers s
                    LEFT JOIN (
                        SELECT SupplierId, SUM(Total - COALESCE(PaidAmount, 0)) AS NetPayable
                        FROM dbo.PurchaseInvoices
                        WHERE Date <= @CutoffDate
                          AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                        GROUP BY SupplierId
                    ) archPurch ON s.Id = archPurch.SupplierId
                    LEFT JOIN (
                        SELECT SupplierId, SUM(Total - COALESCE(PaidAmount, 0)) AS NetPRetCredit
                        FROM dbo.PurchaseReturns
                        WHERE Date <= @CutoffDate
                          AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                        GROUP BY SupplierId
                    ) archPRet ON s.Id = archPRet.SupplierId
                    WHERE archPurch.SupplierId IS NOT NULL OR archPRet.SupplierId IS NOT NULL;
                `);

            // 3. Preserve Cash Account Balances by rolling archived cash inflows/outflows into CashAccounts.OpeningBalance
            await new sql.Request(tx)
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .query(`
                    UPDATE ca
                    SET ca.OpeningBalance = ca.OpeningBalance
                        + COALESCE(siCash.CashIn, 0)
                        + COALESCE(prCash.CashIn, 0)
                        + COALESCE(remCash.CashIn, 0)
                        - COALESCE(piCash.CashOut, 0)
                        - COALESCE(srCash.CashOut, 0)
                    FROM dbo.CashAccounts ca
                    LEFT JOIN (
                        SELECT s.PaidToAccountId,
                               SUM(CASE WHEN s.InitialPaidAmount IS NOT NULL THEN s.InitialPaidAmount
                                        WHEN (COALESCE(s.PaidAmount, 0) - COALESCE(lp.LinkedAmt, 0)) > 0 THEN (COALESCE(s.PaidAmount, 0) - COALESCE(lp.LinkedAmt, 0))
                                        ELSE 0 END) AS CashIn
                        FROM dbo.SalesInvoices s
                        LEFT JOIN (SELECT InvoiceId, SUM(Amount) AS LinkedAmt FROM dbo.CustomerPayments WHERE InvoiceId IS NOT NULL GROUP BY InvoiceId) lp ON s.Id = lp.InvoiceId
                        WHERE s.Date <= @CutoffDate
                          AND (s.Status = 'approved' OR s.Status = 'completed' OR s.Status IS NULL)
                          AND (@WarehouseId = 'all' OR s.WarehouseId = @WarehouseId)
                        GROUP BY s.PaidToAccountId
                    ) siCash ON ca.Id = siCash.PaidToAccountId
                    LEFT JOIN (
                        SELECT PaidToAccountId, SUM(COALESCE(PaidAmount, 0)) AS CashIn
                        FROM dbo.PurchaseReturns
                        WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                        GROUP BY PaidToAccountId
                    ) prCash ON ca.Id = prCash.PaidToAccountId
                    LEFT JOIN (
                        SELECT ToAccountId, SUM(COALESCE(Amount, 0)) AS CashIn
                        FROM dbo.RepRemittances
                        WHERE Date <= @CutoffDate AND @WarehouseId = 'all'
                        GROUP BY ToAccountId
                    ) remCash ON ca.Id = remCash.ToAccountId
                    LEFT JOIN (
                        SELECT p.PaidFromAccountId,
                               SUM(CASE WHEN p.InitialPaidAmount IS NOT NULL THEN p.InitialPaidAmount
                                        WHEN (COALESCE(p.PaidAmount, 0) - COALESCE(lsp.LinkedAmt, 0)) > 0 THEN (COALESCE(p.PaidAmount, 0) - COALESCE(lsp.LinkedAmt, 0))
                                        ELSE 0 END) AS CashOut
                        FROM dbo.PurchaseInvoices p
                        LEFT JOIN (SELECT InvoiceId, SUM(Amount) AS LinkedAmt FROM dbo.SupplierPayments WHERE InvoiceId IS NOT NULL GROUP BY InvoiceId) lsp ON p.Id = lsp.InvoiceId
                        WHERE p.Date <= @CutoffDate AND (@WarehouseId = 'all' OR p.WarehouseId = @WarehouseId)
                        GROUP BY p.PaidFromAccountId
                    ) piCash ON ca.Id = piCash.PaidFromAccountId
                    LEFT JOIN (
                        SELECT PaidFromAccountId, SUM(COALESCE(PaidAmount, 0)) AS CashOut
                        FROM dbo.SalesReturns
                        WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                        GROUP BY PaidFromAccountId
                    ) srCash ON ca.Id = srCash.PaidFromAccountId;
                `);

            // 4. Move records to Archived* tables and delete from active tables
            const summary: Record<string, number> = {};

            // 4.1 SalesInvoices & SalesInvoiceItems
            const siCols = await getCols('SalesInvoices');
            const siiCols = await getCols('SalesInvoiceItems');
            await new sql.Request(tx)
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .input('BatchId', sql.NVarChar(64), batchId)
                .query(`
                    INSERT INTO dbo.ArchivedSalesInvoiceItems (${siiCols}, [ArchiveBatchId], [ArchivedAt])
                    SELECT ${siiCols}, @BatchId, sysutcdatetime()
                    FROM dbo.SalesInvoiceItems
                    WHERE InvoiceId IN (
                        SELECT Id FROM dbo.SalesInvoices
                        WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                    );

                    DELETE FROM dbo.SalesInvoiceItems
                    WHERE InvoiceId IN (
                        SELECT Id FROM dbo.SalesInvoices
                        WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                    );

                    INSERT INTO dbo.ArchivedSalesInvoices (${siCols}, [ArchiveBatchId], [ArchivedAt])
                    SELECT ${siCols}, @BatchId, sysutcdatetime()
                    FROM dbo.SalesInvoices
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);
                `);

            const delSi = await new sql.Request(tx)
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .query(`
                    DELETE FROM dbo.SalesInvoices
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);
                    SELECT @@ROWCOUNT AS cnt;
                `);
            summary.salesInvoices = Number(delSi.recordset[0]?.cnt || 0);

            // 4.2 SalesReturns & SalesReturnItems
            const srCols = await getCols('SalesReturns');
            const sriCols = await getCols('SalesReturnItems');
            const delSr = await new sql.Request(tx)
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .input('BatchId', sql.NVarChar(64), batchId)
                .query(`
                    INSERT INTO dbo.ArchivedSalesReturnItems (${sriCols}, [ArchiveBatchId], [ArchivedAt])
                    SELECT ${sriCols}, @BatchId, sysutcdatetime()
                    FROM dbo.SalesReturnItems
                    WHERE ReturnId IN (
                        SELECT Id FROM dbo.SalesReturns
                        WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                    );

                    DELETE FROM dbo.SalesReturnItems
                    WHERE ReturnId IN (
                        SELECT Id FROM dbo.SalesReturns
                        WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                    );

                    INSERT INTO dbo.ArchivedSalesReturns (${srCols}, [ArchiveBatchId], [ArchivedAt])
                    SELECT ${srCols}, @BatchId, sysutcdatetime()
                    FROM dbo.SalesReturns
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);

                    DELETE FROM dbo.SalesReturns
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);
                    SELECT @@ROWCOUNT AS cnt;
                `);
            summary.salesReturns = Number(delSr.recordset[0]?.cnt || 0);

            // 4.3 PurchaseInvoices & PurchaseReturns
            const piCols = await getCols('PurchaseInvoices');
            const prCols = await getCols('PurchaseReturns');
            const delPi = await new sql.Request(tx)
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .input('BatchId', sql.NVarChar(64), batchId)
                .query(`
                    INSERT INTO dbo.ArchivedPurchaseInvoices (${piCols}, [ArchiveBatchId], [ArchivedAt])
                    SELECT ${piCols}, @BatchId, sysutcdatetime()
                    FROM dbo.PurchaseInvoices
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);

                    DELETE FROM dbo.PurchaseInvoiceItems
                    WHERE InvoiceId IN (
                        SELECT Id FROM dbo.PurchaseInvoices
                        WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                    );

                    DELETE FROM dbo.PurchaseInvoices
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);
                    SELECT @@ROWCOUNT AS cnt;
                `);
            summary.purchaseInvoices = Number(delPi.recordset[0]?.cnt || 0);

            const delPr = await new sql.Request(tx)
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .input('BatchId', sql.NVarChar(64), batchId)
                .query(`
                    INSERT INTO dbo.ArchivedPurchaseReturns (${prCols}, [ArchiveBatchId], [ArchivedAt])
                    SELECT ${prCols}, @BatchId, sysutcdatetime()
                    FROM dbo.PurchaseReturns
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);

                    DELETE FROM dbo.PurchaseReturnItems
                    WHERE ReturnId IN (
                        SELECT Id FROM dbo.PurchaseReturns
                        WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId)
                    );

                    DELETE FROM dbo.PurchaseReturns
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);
                    SELECT @@ROWCOUNT AS cnt;
                `);
            summary.purchaseReturns = Number(delPr.recordset[0]?.cnt || 0);

            // 4.4 Sales Reps Tables (StockIssuesToReps, StockReturnsFromReps, RepRemittances)
            const repIssCols = await getCols('StockIssuesToReps');
            const repRetCols = await getCols('StockReturnsFromReps');
            const repRemCols = await getCols('RepRemittances');

            const delRepIss = await new sql.Request(tx)
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .input('BatchId', sql.NVarChar(64), batchId)
                .query(`
                    INSERT INTO dbo.ArchivedStockIssuesToReps (${repIssCols}, [ArchiveBatchId], [ArchivedAt])
                    SELECT ${repIssCols}, @BatchId, sysutcdatetime()
                    FROM dbo.StockIssuesToReps
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);

                    DELETE FROM dbo.StockIssuesToReps
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);
                    SELECT @@ROWCOUNT AS cnt;
                `);
            summary.repIssues = Number(delRepIss.recordset[0]?.cnt || 0);

            const delRepRet = await new sql.Request(tx)
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .input('BatchId', sql.NVarChar(64), batchId)
                .query(`
                    INSERT INTO dbo.ArchivedStockReturnsFromReps (${repRetCols}, [ArchiveBatchId], [ArchivedAt])
                    SELECT ${repRetCols}, @BatchId, sysutcdatetime()
                    FROM dbo.StockReturnsFromReps
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);

                    DELETE FROM dbo.StockReturnsFromReps
                    WHERE Date <= @CutoffDate AND (@WarehouseId = 'all' OR WarehouseId = @WarehouseId);
                    SELECT @@ROWCOUNT AS cnt;
                `);
            summary.repReturns = Number(delRepRet.recordset[0]?.cnt || 0);

            if (warehouseId === 'all') {
                const delRepRem = await new sql.Request(tx)
                    .input('CutoffDate', sql.DateTime2, cutoff)
                    .input('BatchId', sql.NVarChar(64), batchId)
                    .query(`
                        INSERT INTO dbo.ArchivedRepRemittances (${repRemCols}, [ArchiveBatchId], [ArchivedAt])
                        SELECT ${repRemCols}, @BatchId, sysutcdatetime()
                        FROM dbo.RepRemittances
                        WHERE Date <= @CutoffDate;

                        DELETE FROM dbo.RepRemittances
                        WHERE Date <= @CutoffDate;
                        SELECT @@ROWCOUNT AS cnt;
                    `);
                summary.repRemittances = Number(delRepRem.recordset[0]?.cnt || 0);
            } else {
                summary.repRemittances = 0;
            }

            const totalArchived = Object.values(summary).reduce((a, b) => a + b, 0);

            // 5. Log the Archive Batch
            await new sql.Request(tx)
                .input('Id', sql.NVarChar(64), batchId)
                .input('CutoffDate', sql.DateTime2, cutoff)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .input('WarehouseName', sql.NVarChar(255), warehouseName)
                .input('ArchivedById', sql.NVarChar(64), userId || null)
                .input('ArchivedByName', sql.NVarChar(255), userName || 'مسؤول النظام')
                .input('TotalRecordsArchived', sql.Int, totalArchived)
                .input('SummaryJson', sql.NVarChar(sql.MAX), JSON.stringify(summary))
                .input('Notes', sql.NVarChar(sql.MAX), notes || null)
                .query(`
                    INSERT INTO dbo.ArchiveLogs (
                        Id, CutoffDate, WarehouseId, WarehouseName, ArchivedById, ArchivedByName,
                        TotalRecordsArchived, SummaryJson, Notes
                    )
                    VALUES (
                        @Id, @CutoffDate, @WarehouseId, @WarehouseName, @ArchivedById, @ArchivedByName,
                        @TotalRecordsArchived, @SummaryJson, @Notes
                    );
                `);

            await tx.commit();

            return NextResponse.json({
                success: true,
                batchId,
                totalArchived,
                summary
            });

        } catch (txErr) {
            await tx.rollback();
            throw txErr;
        }

    } catch (error: any) {
        console.error('Error in POST /api/archive/period:', error);
        await logSystemError({
            source: 'API:archive/period',
            action: 'POST',
            endpoint: '/api/archive/period',
            errorMessage: error.message || 'Error in POST /api/archive/period',
            errorStack: error.stack,
            statusCode: 500
        });
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
