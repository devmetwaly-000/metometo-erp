import { NextResponse } from 'next/server';
import { getDbPool, sql } from '@/lib/db';
import { logSystemError } from '@/lib/error-logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'overview';
        const fromDate = searchParams.get('fromDate') || null;
        const toDate = searchParams.get('toDate') || null;
        const warehouseId = searchParams.get('warehouseId') || 'all';
        const salesRepId = searchParams.get('salesRepId') || null;
        const customerId = searchParams.get('customerId') || null;
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const pageSize = Math.min(200, Math.max(10, parseInt(searchParams.get('pageSize') || '50', 10)));

        const pool = await getDbPool();

        const startDateTime = fromDate ? new Date(`${fromDate}T00:00:00.000Z`) : null;
        const endDateTime = toDate ? new Date(`${toDate}T23:59:59.999Z`) : null;

        // 1. Customer Balances (SQL View GROUP BY & SUM)
        if (type === 'customer-balances') {
            const res = await pool.request().query(`
                SELECT * FROM dbo.View_CustomerBalances
                ORDER BY CurrentCalculatedBalance DESC
            `);
            return NextResponse.json({ success: true, data: res.recordset });
        }

        // 2. Supplier Balances (SQL View GROUP BY & SUM)
        if (type === 'supplier-balances') {
            const res = await pool.request().query(`
                SELECT * FROM dbo.View_SupplierBalances
                ORDER BY CurrentCalculatedBalance DESC
            `);
            return NextResponse.json({ success: true, data: res.recordset });
        }

        // 3. Cash Account Balances (SQL View GROUP BY & SUM)
        if (type === 'cash-balances') {
            const res = await pool.request().query(`
                SELECT * FROM dbo.View_CashAccountBalances
                ORDER BY AccountName ASC
            `);
            return NextResponse.json({ success: true, data: res.recordset });
        }

        // 4. Sales Rep Balances & Operations Summary (SQL GROUP BY & SUM)
        if (type === 'rep-summary') {
            const repBalancesRes = await pool.request().query(`
                SELECT * FROM dbo.View_SalesRepBalances
                ORDER BY TotalSoldValue DESC
            `);

            let detailedRepSummary = null;
            if (salesRepId && salesRepId !== 'all') {
                const req = pool.request()
                    .input('RepId', sql.NVarChar(64), salesRepId)
                    .input('FromDate', sql.DateTime2, startDateTime)
                    .input('ToDate', sql.DateTime2, endDateTime);

                const [salesAgg, returnsAgg, remitAgg] = await Promise.all([
                    req.query(`
                        SELECT 
                            COUNT(Id) AS InvoicesCount,
                            COALESCE(SUM(Total), 0) AS TotalSoldValue,
                            COALESCE(SUM(PaidAmount), 0) AS TotalCollectedValue
                        FROM dbo.SalesInvoices
                        WHERE SalesRepId = @RepId
                          AND (Status = 'approved' OR Status = 'completed' OR Status IS NULL)
                          AND (@FromDate IS NULL OR Date >= @FromDate)
                          AND (@ToDate IS NULL OR Date <= @ToDate)
                    `),
                    pool.request()
                        .input('RepId', sql.NVarChar(64), salesRepId)
                        .input('FromDate', sql.DateTime2, startDateTime)
                        .input('ToDate', sql.DateTime2, endDateTime)
                        .query(`
                            SELECT 
                                COUNT(Id) AS ReturnsCount,
                                COALESCE(SUM(Total), 0) AS TotalReturnsValue,
                                COALESCE(SUM(PaidAmount), 0) AS TotalRefundedValue
                            FROM dbo.SalesReturns
                            WHERE (SalesRepId = @RepId OR CreatedById = @RepId)
                              AND (@FromDate IS NULL OR Date >= @FromDate)
                              AND (@ToDate IS NULL OR Date <= @ToDate)
                        `),
                    pool.request()
                        .input('RepId', sql.NVarChar(64), salesRepId)
                        .input('FromDate', sql.DateTime2, startDateTime)
                        .input('ToDate', sql.DateTime2, endDateTime)
                        .query(`
                            SELECT 
                                COUNT(Id) AS RemittancesCount,
                                COALESCE(SUM(Amount), 0) AS TotalRemittedValue
                            FROM dbo.RepRemittances
                            WHERE SalesRepId = @RepId
                              AND (@FromDate IS NULL OR Date >= @FromDate)
                              AND (@ToDate IS NULL OR Date <= @ToDate)
                        `)
                ]);

                const sRow = salesAgg.recordset[0] || {};
                const rRow = returnsAgg.recordset[0] || {};
                const mRow = remitAgg.recordset[0] || {};

                detailedRepSummary = {
                    salesRepId,
                    invoicesCount: Number(sRow.InvoicesCount || 0),
                    totalSoldValue: Number(sRow.TotalSoldValue || 0),
                    totalCollectedValue: Number(sRow.TotalCollectedValue || 0) - Number(rRow.TotalRefundedValue || 0),
                    returnsCount: Number(rRow.ReturnsCount || 0),
                    totalReturnsValue: Number(rRow.TotalReturnsValue || 0),
                    remittancesCount: Number(mRow.RemittancesCount || 0),
                    totalRemitted: Number(mRow.TotalRemittedValue || 0),
                    netCashCustody: Number(sRow.TotalCollectedValue || 0) - Number(rRow.TotalRefundedValue || 0) - Number(mRow.TotalRemittedValue || 0)
                };
            }

            return NextResponse.json({
                success: true,
                reps: repBalancesRes.recordset,
                detailedRepSummary
            });
        }

        // 5. Item Profit & Loss Report (SQL GROUP BY & SUM on SalesInvoiceItems & SalesReturnItems)
        if (type === 'item-profit-loss') {
            const req = pool.request()
                .input('FromDate', sql.DateTime2, startDateTime)
                .input('ToDate', sql.DateTime2, endDateTime)
                .input('WarehouseId', sql.NVarChar(64), warehouseId);

            const res = await req.query(`
                SELECT 
                    i.Id AS id,
                    i.Name AS name,
                    i.Code AS code,
                    COALESCE(s.SoldQty, 0) AS totalSoldQty,
                    COALESCE(s.SoldValue, 0) AS totalSoldValue,
                    COALESCE(s.SoldCost, 0) AS totalSoldCost,
                    COALESCE(s.SoldCount, 0) AS totalSoldCount,
                    COALESCE(r.ReturnedQty, 0) AS totalReturnedQty,
                    COALESCE(r.ReturnedValue, 0) AS totalReturnedValue,
                    COALESCE(r.ReturnedCost, 0) AS totalReturnedCost
                FROM dbo.Items i
                LEFT JOIN (
                    SELECT 
                        sii.ItemId,
                        SUM(sii.Qty) AS SoldQty,
                        SUM(sii.Total) AS SoldValue,
                        SUM(sii.Qty * COALESCE(NULLIF(sii.Cost, 0), it.Cost, 0)) AS SoldCost,
                        COUNT(DISTINCT si.Id) AS SoldCount
                    FROM dbo.SalesInvoiceItems sii
                    INNER JOIN dbo.SalesInvoices si ON sii.InvoiceId = si.Id
                    LEFT JOIN dbo.Items it ON sii.ItemId = it.Id
                    WHERE (si.Status = 'approved' OR si.Status = 'completed' OR si.Status IS NULL)
                      AND (@FromDate IS NULL OR si.Date >= @FromDate)
                      AND (@ToDate IS NULL OR si.Date <= @ToDate)
                      AND (@WarehouseId = 'all' OR si.WarehouseId = @WarehouseId)
                    GROUP BY sii.ItemId
                ) s ON i.Id = s.ItemId
                LEFT JOIN (
                    SELECT 
                        sri.ItemId,
                        SUM(sri.Qty) AS ReturnedQty,
                        SUM(sri.Total) AS ReturnedValue,
                        SUM(sri.Qty * COALESCE(it.Cost, 0)) AS ReturnedCost
                    FROM dbo.SalesReturnItems sri
                    INNER JOIN dbo.SalesReturns sr ON sri.ReturnId = sr.Id
                    LEFT JOIN dbo.Items it ON sri.ItemId = it.Id
                    WHERE (@FromDate IS NULL OR sr.Date >= @FromDate)
                      AND (@ToDate IS NULL OR sr.Date <= @ToDate)
                      AND (@WarehouseId = 'all' OR sr.WarehouseId = @WarehouseId)
                    GROUP BY sri.ItemId
                ) r ON i.Id = r.ItemId
                WHERE COALESCE(s.SoldQty, 0) > 0 OR COALESCE(r.ReturnedQty, 0) > 0
                ORDER BY (COALESCE(s.SoldValue, 0) - COALESCE(r.ReturnedValue, 0)) DESC
            `);

            const formatted = res.recordset.map((row: any) => {
                const totalSoldValue = Number(row.totalSoldValue || 0);
                const totalReturnedValue = Number(row.totalReturnedValue || 0);
                const totalCost = Number(row.totalSoldCost || 0) - Number(row.totalReturnedCost || 0);
                const netRevenue = totalSoldValue - totalReturnedValue;
                const profit = netRevenue - totalCost;
                const margin = netRevenue > 0 ? ((profit / netRevenue) * 100).toFixed(2) + '%' : '0.00%';
                return {
                    id: row.id,
                    name: row.name,
                    code: row.code,
                    totalSoldQty: Number(row.totalSoldQty || 0),
                    totalSoldValue,
                    totalSoldCount: Number(row.totalSoldCount || 0),
                    totalReturnedQty: Number(row.totalReturnedQty || 0),
                    totalReturnedValue,
                    totalCost,
                    netRevenue,
                    profit,
                    margin
                };
            });

            return NextResponse.json({ success: true, data: formatted });
        }

        // 6. Paginated Invoices (SQL OFFSET / FETCH NEXT)
        if (type === 'paginated-invoices') {
            const offset = (page - 1) * pageSize;
            const req = pool.request()
                .input('FromDate', sql.DateTime2, startDateTime)
                .input('ToDate', sql.DateTime2, endDateTime)
                .input('WarehouseId', sql.NVarChar(64), warehouseId)
                .input('CustomerId', sql.NVarChar(64), customerId || 'all')
                .input('SalesRepId', sql.NVarChar(64), salesRepId || 'all')
                .input('Offset', sql.Int, offset)
                .input('PageSize', sql.Int, pageSize);

            const res = await req.query(`
                SELECT 
                    si.*,
                    COUNT(*) OVER() AS TotalRowCount
                FROM dbo.SalesInvoices si
                WHERE (@FromDate IS NULL OR si.Date >= @FromDate)
                  AND (@ToDate IS NULL OR si.Date <= @ToDate)
                  AND (@WarehouseId = 'all' OR si.WarehouseId = @WarehouseId)
                  AND (@CustomerId = 'all' OR si.CustomerId = @CustomerId)
                  AND (@SalesRepId = 'all' OR si.SalesRepId = @SalesRepId)
                ORDER BY si.Date DESC
                OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
            `);

            const totalCount = res.recordset.length > 0 ? Number(res.recordset[0].TotalRowCount || 0) : 0;
            return NextResponse.json({
                success: true,
                page,
                pageSize,
                totalCount,
                totalPages: Math.ceil(totalCount / pageSize),
                data: res.recordset
            });
        }

        // Default Overview (All aggregated balances at once)
        const [customersRes, suppliersRes, cashRes, repsRes] = await Promise.all([
            pool.request().query('SELECT * FROM dbo.View_CustomerBalances'),
            pool.request().query('SELECT * FROM dbo.View_SupplierBalances'),
            pool.request().query('SELECT * FROM dbo.View_CashAccountBalances'),
            pool.request().query('SELECT * FROM dbo.View_SalesRepBalances')
        ]);

        return NextResponse.json({
            success: true,
            customerBalances: customersRes.recordset,
            supplierBalances: suppliersRes.recordset,
            cashBalances: cashRes.recordset,
            repBalances: repsRes.recordset
        });

    } catch (error: any) {
        console.error('Error in /api/reports/aggregated:', error);
        await logSystemError({
            source: 'API:reports/aggregated',
            action: 'GET',
            endpoint: '/api/reports/aggregated',
            errorMessage: error.message || 'Error in /api/reports/aggregated',
            errorStack: error.stack,
            statusCode: 500
        });
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
