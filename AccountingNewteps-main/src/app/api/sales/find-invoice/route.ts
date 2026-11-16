import { NextRequest, NextResponse } from 'next/server';
import { getDbPool, sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

function parseJson(str: any, fallback: any = []) {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const rawQuery = (searchParams.get('query') || '').trim();

        if (!rawQuery) {
            return NextResponse.json({ success: false, error: 'استعلام البحث فارغ' }, { status: 400 });
        }

        const pool = await getDbPool();
        const cleaned = rawQuery.replace(/\s+/g, '');
        const parts = cleaned.split(/[-_/]/).filter(Boolean);

        // 1. Direct Exact Match on InvoiceNumber or Id
        let request = pool.request()
            .input('ExactQuery', sql.NVarChar(100), cleaned)
            .input('RawQuery', sql.NVarChar(100), rawQuery);

        let res = await request.query(`
            SELECT TOP 1 * FROM dbo.SalesInvoices
            WHERE InvoiceNumber = @ExactQuery 
               OR InvoiceNumber = @RawQuery 
               OR Id = @ExactQuery 
               OR Id = @RawQuery;
        `);

        // 2. Permutation / Reversal Match
        // If input is C1-10-161126-1 (Terminal-Warehouse-Date-Count), reversed format is 1-C1-10-161126 (Count-Terminal-Warehouse-Date)
        if (!res.recordset.length && parts.length === 4) {
            const variant1 = `${parts[3]}-${parts[0]}-${parts[1]}-${parts[2]}`; // 1-C1-10-161126
            const variant2 = `${parts[3]}-${parts[1]}-${parts[0]}-${parts[2]}`; // 1-10-C1-161126
            const variant3 = `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;

            const varRequest = pool.request()
                .input('Var1', sql.NVarChar(100), variant1)
                .input('Var2', sql.NVarChar(100), variant2)
                .input('Var3', sql.NVarChar(100), variant3);

            res = await varRequest.query(`
                SELECT TOP 1 * FROM dbo.SalesInvoices
                WHERE InvoiceNumber IN (@Var1, @Var2, @Var3);
            `);
        }

        // 3. Token-set LIKE Match
        if (!res.recordset.length && parts.length >= 2) {
            let tokenQuery = 'SELECT TOP 1 * FROM dbo.SalesInvoices WHERE 1=1';
            const tokenReq = pool.request();
            parts.forEach((p, idx) => {
                tokenQuery += ` AND InvoiceNumber LIKE @Token${idx}`;
                tokenReq.input(`Token${idx}`, sql.NVarChar(50), `%${p}%`);
            });
            tokenQuery += ' ORDER BY Date DESC;';
            res = await tokenReq.query(tokenQuery);
        }

        if (!res.recordset.length) {
            return NextResponse.json({ success: false, message: 'لم يتم العثور على الفاتورة' }, { status: 404 });
        }

        const raw = res.recordset[0];
        const items = parseJson(raw.ItemsJson, []);

        const invoice = {
            id: raw.Id,
            invoiceNumber: raw.InvoiceNumber,
            date: raw.Date ? new Date(raw.Date).toISOString() : new Date().toISOString(),
            customerId: raw.CustomerId,
            customerName: raw.CustomerName,
            warehouseId: raw.WarehouseId,
            cashierId: raw.CashierId,
            cashierName: raw.CashierName || raw.CustomerName || 'كاشير',
            total: Number(raw.Total || 0),
            subtotal: Number(raw.Subtotal || 0),
            discount: Number(raw.Discount || 0),
            tax: Number(raw.Tax || 0),
            items: items.map((i: any) => ({
                id: i.id || i.itemId,
                code: i.code || i.barcode || '',
                barcode: i.barcode || i.code || '',
                name: i.name || i.itemName || 'صنف',
                qty: Number(i.qty || 1),
                price: Number(i.price || 0),
                cost: Number(i.cost || i.avgCost || 0),
                total: Number(i.total || (Number(i.qty || 1) * Number(i.price || 0)))
            }))
        };

        return NextResponse.json({ success: true, invoice });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
