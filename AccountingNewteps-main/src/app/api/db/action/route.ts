import { NextResponse } from 'next/server';
import { getDbPool, sql } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { path: rawPath, action, payload, counterName, startFrom } = body;
        const pool = await getDbPool();

        // 1. Atomic Counter Sequence Increment (getNextId)
        if (action === 'getNextId') {
            const name = counterName || 'default';
            const initial = Number(startFrom) || 1;

            const tx = new sql.Transaction(pool);
            await tx.begin();
            try {
                const reqTx = new sql.Request(tx);
                reqTx.input('Name', sql.NVarChar(100), name);
                reqTx.input('Initial', sql.BigInt, initial);

                const checkRes = await reqTx.query('SELECT CurrentValue FROM dbo.Counters WHERE Name = @Name');
                let nextVal = initial;

                if (checkRes.recordset.length === 0) {
                    await reqTx.query('INSERT INTO dbo.Counters (Name, CurrentValue) VALUES (@Name, @Initial)');
                } else {
                    const updateRes = await reqTx.query(`
                        DECLARE @Out TABLE (Val BIGINT);
                        UPDATE dbo.Counters
                        SET CurrentValue = CurrentValue + 1
                        OUTPUT INSERTED.CurrentValue INTO @Out
                        WHERE Name = @Name;
                        SELECT Val as CurrentValue FROM @Out;
                    `);
                    nextVal = Number(updateRes.recordset[0].CurrentValue);
                }

                await tx.commit();
                return NextResponse.json({ success: true, nextId: nextVal });
            } catch (err) {
                await tx.rollback();
                throw err;
            }
        }

        // Clean collection path
        const path = rawPath ? rawPath.split('/')[0] : '';
        const id = payload?.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const jsonString = (val: any) => (val !== undefined && val !== null ? JSON.stringify(val) : null);
        const parseDate = (d: any) => (d ? new Date(d) : new Date());

        const checkIsCentral = async (): Promise<boolean> => {
            try {
                const res = await pool.request().query("SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = 'system_role'");
                if (res.recordset.length > 0 && res.recordset[0].SettingValue === 'central') {
                    return true;
                }
            } catch {}
            return false;
        };

        // =====================================================================
        // ACTION: ADD (Document Principle: Every action generates a source record)
        // =====================================================================
        if (action === 'add') {
            // Commercial: Sales Invoices & POS Sales
            if (path === 'salesInvoices' || path === 'posSales' || path.startsWith('posSales')) {
                if (path === 'posSales' || path.startsWith('posSales') || payload.cashierId || payload.isPos) {
                    if (await checkIsCentral()) {
                        return NextResponse.json({ 
                            success: false, 
                            error: "محظور: لا يمكن تسجيل حركات بيع كاشير في الإدارة المركزية. حركات البيع تصدر حصراً من فروع البيع." 
                        }, { status: 403 });
                    }
                }
                const tx = new sql.Transaction(pool);
                await tx.begin();
                try {
                    const reqTx = new sql.Request(tx);
                    reqTx.input('Id', sql.NVarChar(64), id)
                        .input('InvoiceNumber', sql.NVarChar(100), payload.invoiceNumber ? String(payload.invoiceNumber) : null)
                        .input('Date', sql.DateTime2, parseDate(payload.date))
                        .input('CustomerId', sql.NVarChar(64), payload.customerId || null)
                        .input('CustomerName', sql.NVarChar(255), payload.customerName || null)
                        .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                        .input('SalesRepId', sql.NVarChar(64), payload.salesRepId || null)
                        .input('CashierId', sql.NVarChar(64), payload.cashierId || null)
                        .input('Subtotal', sql.Decimal(18, 4), Number(payload.subtotal) || 0)
                        .input('Discount', sql.Decimal(18, 4), Number(payload.discount) || 0)
                        .input('Tax', sql.Decimal(18, 4), Number(payload.tax) || 0)
                        .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                        .input('PaidAmount', sql.Decimal(18, 4), Number(payload.paidAmount) || 0)
                        .input('PaidToAccountId', sql.NVarChar(64), payload.paidToAccountId || null)
                        .input('Status', sql.NVarChar(50), payload.status || 'approved')
                        .input('IsDelivery', sql.Bit, payload.isDelivery ? 1 : 0)
                        .input('DeliveryReconciled', sql.Bit, payload.deliveryReconciled ? 1 : 0)
                        .input('IsTaxIncluded', sql.Bit, payload.isTaxIncluded ? 1 : 0)
                        .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                        .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items));

                    await reqTx.query(`
                        INSERT INTO dbo.SalesInvoices (
                            Id, InvoiceNumber, Date, CustomerId, CustomerName, WarehouseId, SalesRepId, CashierId,
                            Subtotal, Discount, Tax, Total, PaidAmount, PaidToAccountId, Status, IsDelivery,
                            DeliveryReconciled, IsTaxIncluded, Notes, ItemsJson
                        )
                        VALUES (
                            @Id, @InvoiceNumber, @Date, @CustomerId, @CustomerName, @WarehouseId, @SalesRepId, @CashierId,
                            @Subtotal, @Discount, @Tax, @Total, @PaidAmount, @PaidToAccountId, @Status, @IsDelivery,
                            @DeliveryReconciled, @IsTaxIncluded, @Notes, @ItemsJson
                        );
                    `);

                    if (Array.isArray(payload.items)) {
                        for (const itm of payload.items) {
                            const itmReq = new sql.Request(tx);
                            itmReq.input('InvoiceId', sql.NVarChar(64), id)
                                .input('ItemId', sql.NVarChar(64), itm.id || itm.itemId || null)
                                .input('ItemCode', sql.NVarChar(100), itm.code ? String(itm.code) : null)
                                .input('ItemName', sql.NVarChar(255), itm.name || 'Item')
                                .input('Qty', sql.Decimal(18, 4), Number(itm.qty) || 1)
                                .input('Price', sql.Decimal(18, 4), Number(itm.price) || 0)
                                .input('Cost', sql.Decimal(18, 4), Number(itm.cost) || 0)
                                .input('Total', sql.Decimal(18, 4), Number(itm.total) || 0);

                            await itmReq.query(`
                                INSERT INTO dbo.SalesInvoiceItems (InvoiceId, ItemId, ItemCode, ItemName, Qty, Price, Cost, Total)
                                VALUES (@InvoiceId, @ItemId, @ItemCode, @ItemName, @Qty, @Price, @Cost, @Total);
                            `);
                        }
                    }

                    await tx.commit();
                    return NextResponse.json({ success: true, id });
                } catch (err) {
                    await tx.rollback();
                    throw err;
                }
            }

            // Commercial: Sales Returns & POS Returns
            if (path === 'salesReturns' || path === 'posReturns' || path.startsWith('posReturns')) {
                if (path === 'posReturns' || path.startsWith('posReturns') || payload.cashierId || payload.isPos) {
                    if (await checkIsCentral()) {
                        return NextResponse.json({ 
                            success: false, 
                            error: "محظور: لا يمكن تسجيل مرتجعات كاشير في الإدارة المركزية. مرتجعات الكاشير تصدر حصراً من فروع البيع." 
                        }, { status: 403 });
                    }
                }
                const tx = new sql.Transaction(pool);
                await tx.begin();
                try {
                    const reqTx = new sql.Request(tx);
                    reqTx.input('Id', sql.NVarChar(64), id)
                        .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                        .input('OriginalInvoiceId', sql.NVarChar(64), payload.originalInvoiceId || null)
                        .input('Date', sql.DateTime2, parseDate(payload.date))
                        .input('CustomerId', sql.NVarChar(64), payload.customerId || null)
                        .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                        .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                        .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                        .input('Subtotal', sql.Decimal(18, 4), Number(payload.subtotal) || 0)
                        .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                        .input('PaidAmount', sql.Decimal(18, 4), Number(payload.paidAmount) || 0)
                        .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || null)
                        .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                        .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items));

                    await reqTx.query(`
                        INSERT INTO dbo.SalesReturns (
                            Id, ReceiptNumber, OriginalInvoiceId, Date, CustomerId, WarehouseId,
                            CreatedById, CreatedByName, Subtotal, Total, PaidAmount, PaidFromAccountId, Notes, ItemsJson
                        )
                        VALUES (
                            @Id, @ReceiptNumber, @OriginalInvoiceId, @Date, @CustomerId, @WarehouseId,
                            @CreatedById, @CreatedByName, @Subtotal, @Total, @PaidAmount, @PaidFromAccountId, @Notes, @ItemsJson
                        );
                    `);

                    if (Array.isArray(payload.items)) {
                        for (const itm of payload.items) {
                            const itmReq = new sql.Request(tx);
                            itmReq.input('ReturnId', sql.NVarChar(64), id)
                                .input('ItemId', sql.NVarChar(64), itm.id || itm.itemId || null)
                                .input('ItemCode', sql.NVarChar(100), itm.code ? String(itm.code) : null)
                                .input('ItemName', sql.NVarChar(255), itm.name || 'Item')
                                .input('Qty', sql.Decimal(18, 4), Number(itm.qty) || 1)
                                .input('Price', sql.Decimal(18, 4), Number(itm.price) || 0)
                                .input('Cost', sql.Decimal(18, 4), Number(itm.cost) || 0)
                                .input('Total', sql.Decimal(18, 4), Number(itm.total) || 0);

                            await itmReq.query(`
                                INSERT INTO dbo.SalesReturnItems (ReturnId, ItemId, ItemCode, ItemName, Qty, Price, Cost, Total)
                                VALUES (@ReturnId, @ItemId, @ItemCode, @ItemName, @Qty, @Price, @Cost, @Total);
                            `);
                        }
                    }

                    await tx.commit();
                    return NextResponse.json({ success: true, id });
                } catch (err) {
                    await tx.rollback();
                    throw err;
                }
            }

            // Commercial: Purchase Invoices
            if (path === 'purchaseInvoices') {
                const tx = new sql.Transaction(pool);
                await tx.begin();
                try {
                    const reqTx = new sql.Request(tx);
                    reqTx.input('Id', sql.NVarChar(64), id)
                        .input('InvoiceNumber', sql.NVarChar(100), payload.invoiceNumber ? String(payload.invoiceNumber) : null)
                        .input('BatchNumber', sql.NVarChar(100), payload.batchNumber ? String(payload.batchNumber) : null)
                        .input('Date', sql.DateTime2, parseDate(payload.date))
                        .input('DueDate', sql.DateTime2, payload.dueDate ? parseDate(payload.dueDate) : null)
                        .input('SupplierId', sql.NVarChar(64), payload.supplierId || null)
                        .input('SupplierName', sql.NVarChar(255), payload.supplierName || null)
                        .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                        .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                        .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                        .input('Subtotal', sql.Decimal(18, 4), Number(payload.subtotal) || 0)
                        .input('Discount', sql.Decimal(18, 4), Number(payload.discount) || 0)
                        .input('Tax', sql.Decimal(18, 4), Number(payload.tax) || 0)
                        .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                        .input('PaidAmount', sql.Decimal(18, 4), Number(payload.paidAmount) || 0)
                        .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || null)
                        .input('IsTaxIncluded', sql.Bit, payload.isTaxIncluded ? 1 : 0)
                        .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                        .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items));

                    await reqTx.query(`
                        INSERT INTO dbo.PurchaseInvoices (
                            Id, InvoiceNumber, BatchNumber, Date, DueDate, SupplierId, SupplierName, WarehouseId,
                            CreatedById, CreatedByName, Subtotal, Discount, Tax, Total, PaidAmount, PaidFromAccountId,
                            IsTaxIncluded, Notes, ItemsJson
                        )
                        VALUES (
                            @Id, @InvoiceNumber, @BatchNumber, @Date, @DueDate, @SupplierId, @SupplierName, @WarehouseId,
                            @CreatedById, @CreatedByName, @Subtotal, @Discount, @Tax, @Total, @PaidAmount, @PaidFromAccountId,
                            @IsTaxIncluded, @Notes, @ItemsJson
                        );
                    `);

                    if (Array.isArray(payload.items)) {
                        for (const itm of payload.items) {
                            const itmReq = new sql.Request(tx);
                            itmReq.input('PurchaseInvoiceId', sql.NVarChar(64), id)
                                .input('ItemId', sql.NVarChar(64), itm.id || itm.itemId || null)
                                .input('ItemCode', sql.NVarChar(100), itm.code ? String(itm.code) : null)
                                .input('ItemName', sql.NVarChar(255), itm.name || 'Item')
                                .input('Qty', sql.Decimal(18, 4), Number(itm.qty) || 1)
                                .input('OriginalQty', sql.Decimal(18, 4), Number(itm.originalQty) || null)
                                .input('OriginalUnit', sql.NVarChar(50), itm.originalUnit || null)
                                .input('ConversionFactor', sql.Decimal(18, 4), Number(itm.conversionFactor) || 1)
                                .input('Cost', sql.Decimal(18, 4), Number(itm.cost) || 0)
                                .input('SellingPrice', sql.Decimal(18, 4), Number(itm.sellingPrice) || 0)
                                .input('Total', sql.Decimal(18, 4), Number(itm.total) || 0);

                            await itmReq.query(`
                                INSERT INTO dbo.PurchaseInvoiceItems (PurchaseInvoiceId, ItemId, ItemCode, ItemName, Qty, OriginalQty, OriginalUnit, ConversionFactor, Cost, SellingPrice, Total)
                                VALUES (@PurchaseInvoiceId, @ItemId, @ItemCode, @ItemName, @Qty, @OriginalQty, @OriginalUnit, @ConversionFactor, @Cost, @SellingPrice, @Total);
                            `);
                        }
                    }

                    await tx.commit();
                    return NextResponse.json({ success: true, id });
                } catch (err) {
                    await tx.rollback();
                    throw err;
                }
            }

            // Commercial: Purchase Returns
            if (path === 'purchaseReturns') {
                const tx = new sql.Transaction(pool);
                await tx.begin();
                try {
                    const reqTx = new sql.Request(tx);
                    reqTx.input('Id', sql.NVarChar(64), id)
                        .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                        .input('OriginalInvoiceId', sql.NVarChar(64), payload.originalInvoiceId || null)
                        .input('Date', sql.DateTime2, parseDate(payload.date))
                        .input('SupplierId', sql.NVarChar(64), payload.supplierId || null)
                        .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                        .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                        .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                        .input('Subtotal', sql.Decimal(18, 4), Number(payload.subtotal) || 0)
                        .input('Discount', sql.Decimal(18, 4), Number(payload.discount) || 0)
                        .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                        .input('PaidAmount', sql.Decimal(18, 4), Number(payload.paidAmount) || 0)
                        .input('PaidToAccountId', sql.NVarChar(64), payload.paidToAccountId || null)
                        .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                        .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items));

                    await reqTx.query(`
                        INSERT INTO dbo.PurchaseReturns (
                            Id, ReceiptNumber, OriginalInvoiceId, Date, SupplierId, WarehouseId,
                            CreatedById, CreatedByName, Subtotal, Discount, Total, PaidAmount, PaidToAccountId, Notes, ItemsJson
                        )
                        VALUES (
                            @Id, @ReceiptNumber, @OriginalInvoiceId, @Date, @SupplierId, @WarehouseId,
                            @CreatedById, @CreatedByName, @Subtotal, @Discount, @Total, @PaidAmount, @PaidToAccountId, @Notes, @ItemsJson
                        );
                    `);

                    await tx.commit();
                    return NextResponse.json({ success: true, id });
                } catch (err) {
                    await tx.rollback();
                    throw err;
                }
            }

            // Commercial: Purchase Orders & Requisitions
            if (path === 'purchaseOrders') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('OrderNumber', sql.NVarChar(100), payload.orderNumber ? String(payload.orderNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('ExpectedDate', sql.DateTime2, payload.expectedDate ? parseDate(payload.expectedDate) : null)
                    .input('SupplierId', sql.NVarChar(64), payload.supplierId || null)
                    .input('SupplierName', sql.NVarChar(255), payload.supplierName || null)
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'pending')
                    .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.PurchaseOrders (Id, OrderNumber, Date, ExpectedDate, SupplierId, SupplierName, WarehouseId, Status, Total, CreatedById, CreatedByName, Notes, ItemsJson)
                        VALUES (@Id, @OrderNumber, @Date, @ExpectedDate, @SupplierId, @SupplierName, @WarehouseId, @Status, @Total, @CreatedById, @CreatedByName, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'requisitions') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('RequisitionNumber', sql.NVarChar(100), payload.requisitionNumber ? String(payload.requisitionNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('RequestedById', sql.NVarChar(64), payload.requestedById || null)
                    .input('RequestedByName', sql.NVarChar(255), payload.requestedByName || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'pending')
                    .input('Priority', sql.NVarChar(50), payload.priority || 'normal')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.Requisitions (Id, RequisitionNumber, Date, WarehouseId, RequestedById, RequestedByName, Status, Priority, Notes, ItemsJson)
                        VALUES (@Id, @RequisitionNumber, @Date, @WarehouseId, @RequestedById, @RequestedByName, @Status, @Priority, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            // Financial Documents
            if (path === 'customerPayments') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('CustomerId', sql.NVarChar(64), payload.customerId || '')
                    .input('InvoiceId', sql.NVarChar(64), payload.invoiceId || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('PaidToAccountId', sql.NVarChar(64), payload.paidToAccountId || 'main-cash')
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .query(`
                        INSERT INTO dbo.CustomerPayments (Id, ReceiptNumber, Date, CustomerId, InvoiceId, Amount, PaidToAccountId, CreatedById, CreatedByName, Notes)
                        VALUES (@Id, @ReceiptNumber, @Date, @CustomerId, @InvoiceId, @Amount, @PaidToAccountId, @CreatedById, @CreatedByName, @Notes);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'supplierPayments') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('SupplierId', sql.NVarChar(64), payload.supplierId || '')
                    .input('InvoiceId', sql.NVarChar(64), payload.invoiceId || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || 'main-cash')
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .query(`
                        INSERT INTO dbo.SupplierPayments (Id, ReceiptNumber, Date, SupplierId, InvoiceId, Amount, PaidFromAccountId, CreatedById, CreatedByName, Notes)
                        VALUES (@Id, @ReceiptNumber, @Date, @SupplierId, @InvoiceId, @Amount, @PaidFromAccountId, @CreatedById, @CreatedByName, @Notes);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'expenses') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('ExpenseType', sql.NVarChar(100), payload.expenseType || null)
                    .input('Description', sql.NVarChar(500), payload.description || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('TaxAmount', sql.Decimal(18, 4), Number(payload.taxAmount) || 0)
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'completed')
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .query(`
                        INSERT INTO dbo.Expenses (Id, ReceiptNumber, Date, ExpenseType, Description, Amount, TaxAmount, WarehouseId, PaidFromAccountId, Status, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @ExpenseType, @Description, @Amount, @TaxAmount, @WarehouseId, @PaidFromAccountId, @Status, @CreatedById, @CreatedByName);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'exceptionalIncomes') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('IncomeType', sql.NVarChar(100), payload.incomeType || null)
                    .input('Description', sql.NVarChar(500), payload.description || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('PaidToAccountId', sql.NVarChar(64), payload.paidToAccountId || 'main-cash')
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .query(`
                        INSERT INTO dbo.ExceptionalIncomes (Id, ReceiptNumber, Date, IncomeType, Description, Amount, PaidToAccountId, WarehouseId, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @IncomeType, @Description, @Amount, @PaidToAccountId, @WarehouseId, @CreatedById, @CreatedByName);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'treasuryTransactions') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('AccountId', sql.NVarChar(64), payload.accountId || 'main-cash')
                    .input('Type', sql.NVarChar(50), payload.type || 'deposit')
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('Description', sql.NVarChar(500), payload.description || null)
                    .input('LinkedTransactionId', sql.NVarChar(64), payload.linkedTransactionId || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .query(`
                        INSERT INTO dbo.TreasuryTransactions (Id, ReceiptNumber, Date, AccountId, Type, Amount, Description, LinkedTransactionId, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @AccountId, @Type, @Amount, @Description, @LinkedTransactionId, @CreatedById, @CreatedByName);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'profitDistributions') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('PartnerId', sql.NVarChar(64), payload.partnerId || null)
                    .input('PartnerName', sql.NVarChar(255), payload.partnerName || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || 'main-cash')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .query(`
                        INSERT INTO dbo.ProfitDistributions (Id, ReceiptNumber, Date, PartnerId, PartnerName, Amount, PaidFromAccountId, Notes, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @PartnerId, @PartnerName, @Amount, @PaidFromAccountId, @Notes, @CreatedById, @CreatedByName);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'repRemittances') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('SalesRepId', sql.NVarChar(64), payload.salesRepId || payload.userId || '')
                    .input('SalesRepName', sql.NVarChar(255), payload.salesRepName || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('ToAccountId', sql.NVarChar(64), payload.toAccountId || 'main-cash')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .query(`
                        INSERT INTO dbo.RepRemittances (Id, ReceiptNumber, Date, SalesRepId, SalesRepName, Amount, ToAccountId, Notes, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @SalesRepId, @SalesRepName, @Amount, @ToAccountId, @Notes, @CreatedById, @CreatedByName);
                    `);
                return NextResponse.json({ success: true, id });
            }

            // Inventory Documents
            if (path === 'stockInRecords') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('BatchNumber', sql.NVarChar(100), payload.batchNumber ? String(payload.batchNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('PurchaseInvoiceId', sql.NVarChar(64), payload.purchaseInvoiceId || null)
                    .input('Reason', sql.NVarChar(255), payload.reason || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'approved')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.StockInRecords (Id, ReceiptNumber, BatchNumber, Date, WarehouseId, PurchaseInvoiceId, Reason, Status, Notes, ItemsJson)
                        VALUES (@Id, @ReceiptNumber, @BatchNumber, @Date, @WarehouseId, @PurchaseInvoiceId, @Reason, @Status, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'stockOutRecords') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('SourceId', sql.NVarChar(64), payload.sourceId || null)
                    .input('SaleInvoiceId', sql.NVarChar(64), payload.saleInvoiceId || null)
                    .input('Reason', sql.NVarChar(255), payload.reason || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'approved')
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.StockOutRecords (Id, ReceiptNumber, Date, WarehouseId, SourceId, SaleInvoiceId, Reason, Status, CreatedById, CreatedByName, Notes, ItemsJson)
                        VALUES (@Id, @ReceiptNumber, @Date, @WarehouseId, @SourceId, @SaleInvoiceId, @Reason, @Status, @CreatedById, @CreatedByName, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'stockTransferRecords') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('FromWarehouseId', sql.NVarChar(64), payload.fromWarehouseId || payload.fromSourceId || null)
                    .input('ToWarehouseId', sql.NVarChar(64), payload.toWarehouseId || payload.toSourceId || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'pending')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.StockTransferRecords (Id, ReceiptNumber, Date, FromWarehouseId, ToWarehouseId, Status, Notes, ItemsJson)
                        VALUES (@Id, @ReceiptNumber, @Date, @FromWarehouseId, @ToWarehouseId, @Status, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'stockAdjustmentRecords') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('Reason', sql.NVarChar(255), payload.reason || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.StockAdjustmentRecords (Id, ReceiptNumber, Date, WarehouseId, Reason, CreatedById, CreatedByName, Notes, ItemsJson)
                        VALUES (@Id, @ReceiptNumber, @Date, @WarehouseId, @Reason, @CreatedById, @CreatedByName, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'stockIssuesToReps') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('SalesRepId', sql.NVarChar(64), payload.salesRepId || null)
                    .input('SalesRepName', sql.NVarChar(255), payload.salesRepName || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'approved')
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.StockIssuesToReps (Id, ReceiptNumber, Date, WarehouseId, SalesRepId, SalesRepName, Status, CreatedById, CreatedByName, Notes, ItemsJson)
                        VALUES (@Id, @ReceiptNumber, @Date, @WarehouseId, @SalesRepId, @SalesRepName, @Status, @CreatedById, @CreatedByName, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'stockReturnsFromReps') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('SalesRepId', sql.NVarChar(64), payload.salesRepId || null)
                    .input('SalesRepName', sql.NVarChar(255), payload.salesRepName || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'approved')
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.StockReturnsFromReps (Id, ReceiptNumber, Date, WarehouseId, SalesRepId, SalesRepName, Status, CreatedById, CreatedByName, Notes, ItemsJson)
                        VALUES (@Id, @ReceiptNumber, @Date, @WarehouseId, @SalesRepId, @SalesRepName, @Status, @CreatedById, @CreatedByName, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'inventoryClosings') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ClosingDate', sql.DateTime2, parseDate(payload.closingDate || payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || '')
                    .input('ClosedById', sql.NVarChar(64), payload.closedById || null)
                    .input('ClosedByName', sql.NVarChar(255), payload.closedByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('BalancesJson', sql.NVarChar(sql.MAX), jsonString(payload.balances))
                    .query(`
                        INSERT INTO dbo.InventoryClosings (Id, ClosingDate, WarehouseId, ClosedById, ClosedByName, Notes, BalancesJson)
                        VALUES (@Id, @ClosingDate, @WarehouseId, @ClosedById, @ClosedByName, @Notes, @BalancesJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            // POS Operations: Held Invoices & Audit Logs
            if (path === 'heldInvoices') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('HeldAt', sql.DateTime2, parseDate(payload.heldAt))
                    .input('CashierId', sql.NVarChar(64), payload.cashierId || null)
                    .input('CashierName', sql.NVarChar(255), payload.cashierName || null)
                    .input('TerminalId', sql.NVarChar(64), payload.terminalId || null)
                    .input('TableId', sql.NVarChar(64), payload.tableId || null)
                    .input('CustomerName', sql.NVarChar(255), payload.customerName || null)
                    .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                    .input('CartData', sql.NVarChar(sql.MAX), jsonString(payload.cart || payload.items))
                    .query(`
                        INSERT INTO dbo.HeldInvoices (Id, HeldAt, CashierId, CashierName, TerminalId, TableId, CustomerName, Total, CartData)
                        VALUES (@Id, @HeldAt, @CashierId, @CashierName, @TerminalId, @TableId, @CustomerName, @Total, @CartData);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'posAuditLogs') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date || payload.timestamp))
                    .input('CashierId', sql.NVarChar(64), payload.cashierId || null)
                    .input('CashierName', sql.NVarChar(255), payload.cashierName || null)
                    .input('Action', sql.NVarChar(100), payload.action || 'audit')
                    .input('Details', sql.NVarChar(sql.MAX), jsonString(payload.details || payload))
                    .input('InvoiceId', sql.NVarChar(64), payload.invoiceId || null)
                    .input('TerminalId', sql.NVarChar(64), payload.terminalId || null)
                    .query(`
                        INSERT INTO dbo.PosAuditLogs (Id, Date, CashierId, CashierName, Action, Details, InvoiceId, TerminalId)
                        VALUES (@Id, @Date, @CashierId, @CashierName, @Action, @Details, @InvoiceId, @TerminalId);
                    `);
                return NextResponse.json({ success: true, id });
            }

            // Fixed Assets & Depreciation
            if (path === 'fixedAssets') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(100), payload.code || null)
                    .input('Name', sql.NVarChar(255), payload.name || 'Asset')
                    .input('PurchaseDate', sql.DateTime2, parseDate(payload.purchaseDate))
                    .input('PurchasePrice', sql.Decimal(18, 4), Number(payload.purchasePrice) || 0)
                    .input('CurrentValue', sql.Decimal(18, 4), Number(payload.currentValue) || 0)
                    .input('DepreciationRate', sql.Decimal(5, 2), Number(payload.depreciationRate) || 0)
                    .input('DepreciationMethod', sql.NVarChar(50), payload.depreciationMethod || 'straight_line')
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'active')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .query(`
                        INSERT INTO dbo.FixedAssets (Id, Code, Name, PurchaseDate, PurchasePrice, CurrentValue, DepreciationRate, DepreciationMethod, WarehouseId, Status, Notes)
                        VALUES (@Id, @Code, @Name, @PurchaseDate, @PurchasePrice, @CurrentValue, @DepreciationRate, @DepreciationMethod, @WarehouseId, @Status, @Notes);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'depreciationRecords') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('AssetId', sql.NVarChar(64), payload.assetId || '')
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('AccumulatedTotal', sql.Decimal(18, 4), Number(payload.accumulatedTotal) || 0)
                    .input('RemainingValue', sql.Decimal(18, 4), Number(payload.remainingValue) || 0)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .query(`
                        INSERT INTO dbo.DepreciationRecords (Id, AssetId, Date, Amount, AccumulatedTotal, RemainingValue, Notes)
                        VALUES (@Id, @AssetId, @Date, @Amount, @AccumulatedTotal, @RemainingValue, @Notes);
                    `);
                return NextResponse.json({ success: true, id });
            }

            // Master Data: Items, Customers, Suppliers, Warehouses, Accounts
            if (path === 'items') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(100), String(payload.code || id))
                    .input('Name', sql.NVarChar(255), payload.name || 'Unnamed Item')
                    .input('Cost', sql.Decimal(18, 4), Number(payload.cost) || 0)
                    .input('Price', sql.Decimal(18, 4), Number(payload.price) || 0)
                    .input('BaseUnit', sql.NVarChar(50), payload.baseUnit || 'piece')
                    .input('ItemType', sql.NVarChar(50), payload.itemType || 'standard')
                    .input('ReorderPoint', sql.Decimal(18, 4), Number(payload.reorderPoint) || 0)
                    .input('SectionId', sql.NVarChar(64), payload.sectionId || null)
                    .input('CategoryId', sql.NVarChar(64), payload.categoryId || null)
                    .input('ItemGroupId', sql.NVarChar(64), payload.itemGroupId || null)
                    .input('SubCategoryId1', sql.NVarChar(64), payload.subCategoryId1 || null)
                    .input('SubCategoryId2', sql.NVarChar(64), payload.subCategoryId2 || null)
                    .input('Barcode', sql.NVarChar(100), payload.barcode || String(payload.code || id))
                    .input('BarcodeType', sql.NVarChar(50), payload.barcodeType || 'code128')
                    .input('Color', sql.NVarChar(50), payload.color || null)
                    .input('Size', sql.NVarChar(50), payload.size || null)
                    .input('DefaultBinId', sql.NVarChar(64), payload.defaultBinId || null)
                    .input('SecondaryUnitsJson', sql.NVarChar(sql.MAX), payload.secondaryUnits ? jsonString(payload.secondaryUnits) : null)
                    .input('ComponentsJson', sql.NVarChar(sql.MAX), payload.components ? jsonString(payload.components) : null)
                    .input('IsDisabled', sql.Bit, payload.isDisabled ? 1 : 0)
                    .query(`
                        INSERT INTO dbo.Items (Id, Code, Name, Cost, Price, BaseUnit, ItemType, ReorderPoint, SectionId, CategoryId, ItemGroupId, SubCategoryId1, SubCategoryId2, Barcode, BarcodeType, Color, Size, DefaultBinId, SecondaryUnitsJson, ComponentsJson, IsDisabled)
                        VALUES (@Id, @Code, @Name, @Cost, @Price, @BaseUnit, @ItemType, @ReorderPoint, @SectionId, @CategoryId, @ItemGroupId, @SubCategoryId1, @SubCategoryId2, @Barcode, @BarcodeType, @Color, @Size, @DefaultBinId, @SecondaryUnitsJson, @ComponentsJson, @IsDisabled);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'customers') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || 'Unnamed Customer')
                    .input('Phone', sql.NVarChar(50), payload.phone || null)
                    .input('Address', sql.NVarChar(500), payload.address || null)
                    .input('AllowCredit', sql.Bit, payload.allowCredit !== false ? 1 : 0)
                    .input('CreditLimit', sql.Decimal(18, 4), Number(payload.creditLimit) || 0)
                    .input('OpeningBalance', sql.Decimal(18, 4), Number(payload.openingBalance) || 0)
                    .input('CurrentBalance', sql.Decimal(18, 4), Number(payload.currentBalance) || 0)
                    .input('InvoiceCount', sql.Int, Number(payload.invoiceCount) || 0)
                    .query(`
                        INSERT INTO dbo.Customers (Id, Name, Phone, Address, AllowCredit, CreditLimit, OpeningBalance, CurrentBalance, InvoiceCount)
                        VALUES (@Id, @Name, @Phone, @Address, @AllowCredit, @CreditLimit, @OpeningBalance, @CurrentBalance, @InvoiceCount);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'suppliers') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || 'Unnamed Supplier')
                    .input('Contact', sql.NVarChar(255), payload.contact || null)
                    .input('OpeningBalance', sql.Decimal(18, 4), Number(payload.openingBalance) || 0)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.Suppliers (Id, Name, Contact, OpeningBalance, ItemsJson)
                        VALUES (@Id, @Name, @Contact, @OpeningBalance, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'warehouses') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(50), payload.code || null)
                    .input('Name', sql.NVarChar(255), payload.name || 'Warehouse')
                    .input('Address', sql.NVarChar(500), payload.address || null)
                    .input('WarehouseType', sql.NVarChar(50), payload.warehouseType || (payload.isRepWarehouse ? 'rep' : payload.isMain ? 'warehouse' : 'branch'))
                    .input('IsRepWarehouse', sql.Bit, payload.isRepWarehouse ? 1 : 0)
                    .input('IsMain', sql.Bit, payload.isMain ? 1 : 0)
                    .input('IsClosed', sql.Bit, payload.isClosed ? 1 : 0)
                    .input('RepId', sql.NVarChar(64), payload.repId || null)
                    .query(`
                        INSERT INTO dbo.Warehouses (Id, Code, Name, Address, WarehouseType, IsRepWarehouse, IsMain, IsClosed, RepId)
                        VALUES (@Id, @Code, @Name, @Address, @WarehouseType, @IsRepWarehouse, @IsMain, @IsClosed, @RepId);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'cashAccounts') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || 'Cash Account')
                    .input('Type', sql.NVarChar(50), payload.type || 'drawer')
                    .input('OpeningBalance', sql.Decimal(18, 4), Number(payload.openingBalance) || 0)
                    .input('UserId', sql.NVarChar(64), payload.userId || null)
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .query(`
                        INSERT INTO dbo.CashAccounts (Id, Name, Type, OpeningBalance, UserId, WarehouseId)
                        VALUES (@Id, @Name, @Type, @OpeningBalance, @UserId, @WarehouseId);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'users') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('LoginName', sql.NVarChar(100), payload.loginName)
                    .input('Name', sql.NVarChar(255), payload.name || 'User')
                    .input('Password', sql.NVarChar(255), payload.password || '123456')
                    .input('Phone', sql.NVarChar(50), payload.phone || null)
                    .input('Role', sql.NVarChar(100), payload.role || 'كاشير')
                    .input('WarehouseIds', sql.NVarChar(sql.MAX), jsonString(payload.warehouseIds))
                    .input('IsCashier', sql.Bit, payload.isCashier ? 1 : 0)
                    .input('IsDelivery', sql.Bit, payload.isDelivery ? 1 : 0)
                    .input('IsSalesRep', sql.Bit, payload.isSalesRep ? 1 : 0)
                    .input('CanOpenOwnShift', sql.Bit, payload.canOpenOwnShift !== false ? 1 : 0)
                    .input('CanDeleteFromCart', sql.Bit, payload.canDeleteFromCart !== false ? 1 : 0)
                    .input('CanProcessReturn', sql.Bit, payload.canProcessReturn !== false ? 1 : 0)
                    .input('CanCancelInvoice', sql.Bit, payload.canCancelInvoice ? 1 : 0)
                    .input('CanBypassScannerForReturn', sql.Bit, payload.canBypassScannerForReturn ? 1 : 0)
                    .input('IsDisabled', sql.Bit, payload.isDisabled ? 1 : 0)
                    .input('ThemeSettings', sql.NVarChar(sql.MAX), jsonString(payload.themeSettings))
                    .query(`
                        INSERT INTO dbo.Users (
                            Id, LoginName, Name, Password, Phone, Role, WarehouseIds,
                            IsCashier, IsDelivery, IsSalesRep, CanOpenOwnShift, CanDeleteFromCart,
                            CanProcessReturn, CanCancelInvoice, CanBypassScannerForReturn, IsDisabled, ThemeSettings
                        )
                        VALUES (
                            @Id, @LoginName, @Name, @Password, @Phone, @Role, @WarehouseIds,
                            @IsCashier, @IsDelivery, @IsSalesRep, @CanOpenOwnShift, @CanDeleteFromCart,
                            @CanProcessReturn, @CanCancelInvoice, @CanBypassScannerForReturn, @IsDisabled, @ThemeSettings
                        );
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'posSessions') {
                if (await checkIsCentral()) {
                    return NextResponse.json({ 
                        success: false, 
                        error: "محظور: لا يمكن فتح يوم عمل كاشير أو تسليم عهدة في الإدارة المركزية. الكاشير مخصص لفروع البيع فقط." 
                    }, { status: 403 });
                }
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('StartTime', sql.DateTime2, parseDate(payload.startTime))
                    .input('EndTime', sql.DateTime2, payload.endTime ? parseDate(payload.endTime) : null)
                    .input('OpenedBy', sql.NVarChar(64), payload.openedBy || null)
                    .input('OpenedByName', sql.NVarChar(255), payload.openedByName || null)
                    .input('ClosedBy', sql.NVarChar(64), payload.closedBy || null)
                    .input('ClosedByName', sql.NVarChar(255), payload.closedByName || null)
                    .input('IsClosed', sql.Bit, payload.isClosed ? 1 : 0)
                    .input('PosTerminalId', sql.NVarChar(64), payload.posTerminalId || null)
                    .input('CashierSessionsJson', sql.NVarChar(sql.MAX), payload.cashierSessions ? jsonString(payload.cashierSessions) : null)
                    .query(`
                        INSERT INTO dbo.PosSessions (Id, StartTime, EndTime, OpenedBy, OpenedByName, ClosedBy, ClosedByName, IsClosed, PosTerminalId, CashierSessionsJson)
                        VALUES (@Id, @StartTime, @EndTime, @OpenedBy, @OpenedByName, @ClosedBy, @ClosedByName, @IsClosed, @PosTerminalId, @CashierSessionsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'gratuityLogs') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('InvoiceNumber', sql.NVarChar(100), payload.invoiceNumber ? String(payload.invoiceNumber) : null)
                    .input('InvoiceId', sql.NVarChar(64), payload.invoiceId || null)
                    .input('CashierId', sql.NVarChar(64), payload.cashierId || null)
                    .input('CashierName', sql.NVarChar(255), payload.cashierName || null)
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .query(`
                        INSERT INTO dbo.GratuityLogs (Id, Date, Amount, InvoiceNumber, InvoiceId, CashierId, CashierName, WarehouseId)
                        VALUES (@Id, @Date, @Amount, @InvoiceNumber, @InvoiceId, @CashierId, @CashierName, @WarehouseId);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'gratuityDistributions') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('TotalAmount', sql.Decimal(18, 4), Number(payload.totalAmount) || 0)
                    .input('DetailsJson', sql.NVarChar(sql.MAX), jsonString(payload.details || payload))
                    .query(`
                        INSERT INTO dbo.GratuityDistributions (Id, Date, TotalAmount, DetailsJson)
                        VALUES (@Id, @Date, @TotalAmount, @DetailsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemSections') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(50), payload.code ? String(payload.code) : (payload.Code ? String(payload.Code) : null))
                    .input('Name', sql.NVarChar(255), payload.name || payload.Name || 'Unnamed Section')
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.ItemSections WHERE Id = @Id)
                            INSERT INTO dbo.ItemSections (Id, Code, Name) VALUES (@Id, @Code, @Name);
                        ELSE
                            UPDATE dbo.ItemSections SET Code = @Code, Name = @Name WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemCategories') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(50), payload.code ? String(payload.code) : (payload.Code ? String(payload.Code) : null))
                    .input('Name', sql.NVarChar(255), payload.name || payload.Name || 'Unnamed Category')
                    .input('SectionId', sql.NVarChar(64), payload.sectionId || payload.SectionId || null)
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.ItemCategories WHERE Id = @Id)
                            INSERT INTO dbo.ItemCategories (Id, Code, Name, SectionId) VALUES (@Id, @Code, @Name, @SectionId);
                        ELSE
                            UPDATE dbo.ItemCategories SET Code = @Code, Name = @Name, SectionId = @SectionId WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemGroups') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(50), payload.code ? String(payload.code) : (payload.Code ? String(payload.Code) : null))
                    .input('Name', sql.NVarChar(255), payload.name || payload.Name || 'Unnamed Group')
                    .input('ParentCategoryId', sql.NVarChar(64), payload.parentCategoryId || payload.ParentCategoryId || null)
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.ItemGroups WHERE Id = @Id)
                            INSERT INTO dbo.ItemGroups (Id, Code, Name, ParentCategoryId) VALUES (@Id, @Code, @Name, @ParentCategoryId);
                        ELSE
                            UPDATE dbo.ItemGroups SET Code = @Code, Name = @Name, ParentCategoryId = @ParentCategoryId WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemSubCategories1') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || 'Unnamed SubCategory')
                    .query(`INSERT INTO dbo.ItemSubCategories1 (Id, Name) VALUES (@Id, @Name);`);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemSubCategories2') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || 'Unnamed SubCategory')
                    .query(`INSERT INTO dbo.ItemSubCategories2 (Id, Name) VALUES (@Id, @Name);`);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'inventoryZones') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || 'Unnamed Zone')
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .query(`INSERT INTO dbo.InventoryZones (Id, Name, WarehouseId) VALUES (@Id, @Name, @WarehouseId);`);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'customerVisits') {
                const locString = payload.location ? (typeof payload.location === 'string' ? payload.location : JSON.stringify(payload.location)) : null;
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('SalesRepId', sql.NVarChar(64), payload.salesRepId || null)
                    .input('SalesRepName', sql.NVarChar(255), payload.salesRepName || null)
                    .input('CustomerName', sql.NVarChar(255), payload.customerName || 'زيارة بدون عميل محدد')
                    .input('Timestamp', sql.DateTime2, parseDate(payload.timestamp))
                    .input('Location', sql.NVarChar(sql.MAX), locString)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .query(`
                        INSERT INTO dbo.CustomerVisits (Id, SalesRepId, SalesRepName, CustomerName, Timestamp, Location, Notes)
                        VALUES (@Id, @SalesRepId, @SalesRepName, @CustomerName, @Timestamp, @Location, @Notes);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'loginHistory') {
                let lat: number | null = null;
                let lng: number | null = null;
                if (payload.location) {
                    lat = Number(payload.location.latitude) || null;
                    lng = Number(payload.location.longitude) || null;
                }
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('UserId', sql.NVarChar(64), payload.userId || null)
                    .input('UserName', sql.NVarChar(255), payload.userName || null)
                    .input('Timestamp', sql.DateTime2, parseDate(payload.timestamp))
                    .input('Latitude', sql.Float, lat)
                    .input('Longitude', sql.Float, lng)
                    .query(`
                        INSERT INTO dbo.LoginHistory (Id, UserId, UserName, Timestamp, Latitude, Longitude)
                        VALUES (@Id, @UserId, @UserName, @Timestamp, @Latitude, @Longitude);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'priceChangeLogs') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ItemId', sql.NVarChar(64), payload.itemId || null)
                    .input('ItemCode', sql.NVarChar(100), payload.itemCode ? String(payload.itemCode) : null)
                    .input('ItemName', sql.NVarChar(255), payload.itemName || null)
                    .input('OldPrice', sql.Decimal(18, 4), Number(payload.oldPrice) || 0)
                    .input('NewPrice', sql.Decimal(18, 4), Number(payload.newPrice) || 0)
                    .input('OldCost', sql.Decimal(18, 4), Number(payload.oldCost) || 0)
                    .input('NewCost', sql.Decimal(18, 4), Number(payload.newCost) || 0)
                    .input('Timestamp', sql.DateTime2, parseDate(payload.timestamp || payload.date))
                    .input('ChangedById', sql.NVarChar(64), payload.changedById || null)
                    .input('ChangedByName', sql.NVarChar(255), payload.changedByName || null)
                    .input('Reason', sql.NVarChar(sql.MAX), payload.reason || null)
                    .query(`
                        INSERT INTO dbo.PriceChangeLogs (Id, ItemId, ItemCode, ItemName, OldPrice, NewPrice, OldCost, NewCost, Timestamp, ChangedById, ChangedByName, Reason)
                        VALUES (@Id, @ItemId, @ItemCode, @ItemName, @OldPrice, @NewPrice, @OldCost, @NewCost, @Timestamp, @ChangedById, @ChangedByName, @Reason);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'employeeAdvances') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('EmployeeId', sql.NVarChar(64), payload.employeeId || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .query(`
                        INSERT INTO dbo.EmployeeAdvances (Id, Date, EmployeeId, Amount, PaidFromAccountId, Notes)
                        VALUES (@Id, @Date, @EmployeeId, @Amount, @PaidFromAccountId, @Notes);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'employeeAdjustments') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('EmployeeId', sql.NVarChar(64), payload.employeeId || null)
                    .input('EmployeeName', sql.NVarChar(255), payload.employeeName || null)
                    .input('Type', sql.NVarChar(50), payload.type || 'deduction')
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('Reason', sql.NVarChar(sql.MAX), payload.reason || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('CreatedAt', sql.DateTime2, parseDate(payload.createdAt))
                    .query(`
                        INSERT INTO dbo.EmployeeAdjustments (Id, Date, EmployeeId, EmployeeName, Type, Amount, Reason, CreatedById, CreatedByName, CreatedAt)
                        VALUES (@Id, @Date, @EmployeeId, @EmployeeName, @Type, @Amount, @Reason, @CreatedById, @CreatedByName, @CreatedAt);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'payrollRecords') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('Month', sql.NVarChar(50), payload.month || null)
                    .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || null)
                    .input('TotalAmount', sql.Decimal(18, 4), Number(payload.totalAmount) || 0)
                    .input('DetailsJson', sql.NVarChar(sql.MAX), jsonString(payload.details || payload.payrollData || payload))
                    .query(`
                        INSERT INTO dbo.PayrollRecords (Id, Date, Month, PaidFromAccountId, TotalAmount, DetailsJson)
                        VALUES (@Id, @Date, @Month, @PaidFromAccountId, @TotalAmount, @DetailsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }
        }

        // =====================================================================
        // ACTION: UPDATE
        // =====================================================================
        if (action === 'update') {
            const updateId = payload?.id;
            const data = payload?.data || payload || {};

            if (path === 'customers' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || null)
                    .input('Phone', sql.NVarChar(50), data.phone || null)
                    .input('Address', sql.NVarChar(500), data.address || null)
                    .input('CreditLimit', sql.Decimal(18, 4), data.creditLimit !== undefined ? Number(data.creditLimit) : null)
                    .input('CurrentBalance', sql.Decimal(18, 4), data.currentBalance !== undefined ? Number(data.currentBalance) : null)
                    .input('InvoiceCount', sql.Int, data.invoiceCount !== undefined ? Number(data.invoiceCount) : null)
                    .query(`
                        UPDATE dbo.Customers
                        SET 
                            Name = COALESCE(@Name, Name),
                            Phone = COALESCE(@Phone, Phone),
                            Address = COALESCE(@Address, Address),
                            CreditLimit = COALESCE(@CreditLimit, CreditLimit),
                            CurrentBalance = COALESCE(@CurrentBalance, CurrentBalance),
                            InvoiceCount = COALESCE(@InvoiceCount, InvoiceCount)
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'items' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Code', sql.NVarChar(100), data.code ? String(data.code) : null)
                    .input('Name', sql.NVarChar(255), data.name || null)
                    .input('Price', sql.Decimal(18, 4), data.price !== undefined ? Number(data.price) : null)
                    .input('Cost', sql.Decimal(18, 4), data.cost !== undefined ? Number(data.cost) : null)
                    .input('ReorderPoint', sql.Decimal(18, 4), data.reorderPoint !== undefined ? Number(data.reorderPoint) : null)
                    .input('SectionId', sql.NVarChar(64), data.sectionId || null)
                    .input('CategoryId', sql.NVarChar(64), data.categoryId || null)
                    .input('ItemGroupId', sql.NVarChar(64), data.itemGroupId || null)
                    .input('SubCategoryId1', sql.NVarChar(64), data.subCategoryId1 || null)
                    .input('SubCategoryId2', sql.NVarChar(64), data.subCategoryId2 || null)
                    .input('Barcode', sql.NVarChar(100), data.barcode || null)
                    .input('BarcodeType', sql.NVarChar(50), data.barcodeType || null)
                    .input('Color', sql.NVarChar(50), data.color || null)
                    .input('Size', sql.NVarChar(50), data.size || null)
                    .input('DefaultBinId', sql.NVarChar(64), data.defaultBinId || null)
                    .input('SecondaryUnitsJson', sql.NVarChar(sql.MAX), data.secondaryUnits ? jsonString(data.secondaryUnits) : null)
                    .input('ComponentsJson', sql.NVarChar(sql.MAX), data.components ? jsonString(data.components) : null)
                    .input('IsDisabled', sql.Bit, data.isDisabled !== undefined ? (data.isDisabled ? 1 : 0) : null)
                    .query(`
                        UPDATE dbo.Items
                        SET 
                            Code = COALESCE(@Code, Code),
                            Name = COALESCE(@Name, Name),
                            Price = COALESCE(@Price, Price),
                            Cost = COALESCE(@Cost, Cost),
                            ReorderPoint = COALESCE(@ReorderPoint, ReorderPoint),
                            SectionId = COALESCE(@SectionId, SectionId),
                            CategoryId = COALESCE(@CategoryId, CategoryId),
                            ItemGroupId = COALESCE(@ItemGroupId, ItemGroupId),
                            SubCategoryId1 = COALESCE(@SubCategoryId1, SubCategoryId1),
                            SubCategoryId2 = COALESCE(@SubCategoryId2, SubCategoryId2),
                            Barcode = COALESCE(@Barcode, Barcode),
                            BarcodeType = COALESCE(@BarcodeType, BarcodeType),
                            Color = COALESCE(@Color, Color),
                            Size = COALESCE(@Size, Size),
                            DefaultBinId = COALESCE(@DefaultBinId, DefaultBinId),
                            SecondaryUnitsJson = COALESCE(@SecondaryUnitsJson, SecondaryUnitsJson),
                            ComponentsJson = COALESCE(@ComponentsJson, ComponentsJson),
                            IsDisabled = COALESCE(@IsDisabled, IsDisabled)
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'itemSections' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || data.Name || null)
                    .input('Code', sql.NVarChar(50), data.code || data.Code || null)
                    .query(`
                        UPDATE dbo.ItemSections 
                        SET Name = COALESCE(@Name, Name), Code = COALESCE(@Code, Code) 
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'itemCategories' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || data.Name || null)
                    .input('Code', sql.NVarChar(50), data.code || data.Code || null)
                    .input('SectionId', sql.NVarChar(64), data.sectionId || data.SectionId || null)
                    .query(`
                        UPDATE dbo.ItemCategories 
                        SET Name = COALESCE(@Name, Name), Code = COALESCE(@Code, Code), SectionId = COALESCE(@SectionId, SectionId) 
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'itemGroups' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || data.Name || null)
                    .input('Code', sql.NVarChar(50), data.code || data.Code || null)
                    .input('ParentCategoryId', sql.NVarChar(64), data.parentCategoryId || data.ParentCategoryId || null)
                    .query(`
                        UPDATE dbo.ItemGroups 
                        SET Name = COALESCE(@Name, Name), Code = COALESCE(@Code, Code), ParentCategoryId = COALESCE(@ParentCategoryId, ParentCategoryId) 
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'warehouses' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || data.Name || null)
                    .input('Code', sql.NVarChar(50), data.code || data.Code || null)
                    .input('Address', sql.NVarChar(500), data.address || data.Address || null)
                    .input('WarehouseType', sql.NVarChar(50), data.warehouseType || null)
                    .input('IsRepWarehouse', sql.Bit, data.isRepWarehouse !== undefined ? (data.isRepWarehouse ? 1 : 0) : null)
                    .input('IsMain', sql.Bit, data.isMain !== undefined ? (data.isMain ? 1 : 0) : null)
                    .input('IsClosed', sql.Bit, data.isClosed !== undefined ? (data.isClosed ? 1 : 0) : null)
                    .input('RepId', sql.NVarChar(64), data.repId || null)
                    .query(`
                        UPDATE dbo.Warehouses 
                        SET 
                            Name = COALESCE(@Name, Name), 
                            Code = COALESCE(@Code, Code), 
                            Address = COALESCE(@Address, Address),
                            WarehouseType = COALESCE(@WarehouseType, WarehouseType),
                            IsRepWarehouse = COALESCE(@IsRepWarehouse, IsRepWarehouse),
                            IsMain = COALESCE(@IsMain, IsMain),
                            IsClosed = COALESCE(@IsClosed, IsClosed),
                            RepId = COALESCE(@RepId, RepId),
                            UpdatedAt = SYSUTCDATETIME()
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'salesInvoices' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Status', sql.NVarChar(50), data.status || null)
                    .input('PaidAmount', sql.Decimal(18, 4), data.paidAmount !== undefined ? Number(data.paidAmount) : null)
                    .input('DeliveryReconciled', sql.Bit, data.deliveryReconciled !== undefined ? (data.deliveryReconciled ? 1 : 0) : null)
                    .query(`
                        UPDATE dbo.SalesInvoices
                        SET 
                            Status = COALESCE(@Status, Status),
                            PaidAmount = COALESCE(@PaidAmount, PaidAmount),
                            DeliveryReconciled = COALESCE(@DeliveryReconciled, DeliveryReconciled)
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'purchaseInvoices' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Discount', sql.Decimal(18, 4), data.discount !== undefined ? Number(data.discount) : null)
                    .input('Total', sql.Decimal(18, 4), data.total !== undefined ? Number(data.total) : null)
                    .input('Subtotal', sql.Decimal(18, 4), data.subtotal !== undefined ? Number(data.subtotal) : null)
                    .input('PaidAmount', sql.Decimal(18, 4), data.paidAmount !== undefined ? Number(data.paidAmount) : null)
                    .input('Notes', sql.NVarChar(sql.MAX), data.notes !== undefined ? (data.notes || '') : null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), data.items ? jsonString(data.items) : null)
                    .query(`
                        UPDATE dbo.PurchaseInvoices
                        SET 
                            Discount = COALESCE(@Discount, Discount),
                            Total = COALESCE(@Total, Total),
                            Subtotal = COALESCE(@Subtotal, Subtotal),
                            PaidAmount = COALESCE(@PaidAmount, PaidAmount),
                            Notes = COALESCE(@Notes, Notes),
                            ItemsJson = COALESCE(@ItemsJson, ItemsJson)
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'posSessions' && updateId) {
                if (data.cashierSessions && typeof data.cashierSessions === 'object' && await checkIsCentral()) {
                    const sessions = Object.values(data.cashierSessions) as any[];
                    const hasNewlyOpened = sessions.some(s => s && !s.isClosed && !s.endTime);
                    if (hasNewlyOpened) {
                        return NextResponse.json({ 
                            success: false, 
                            error: "محظور: لا يمكن بدء أو فتح وردية كاشير في الإدارة المركزية. الكاشير مخصص لفروع البيع فقط." 
                        }, { status: 403 });
                    }
                }
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('EndTime', sql.DateTime2, data.endTime ? parseDate(data.endTime) : (data.isClosed ? new Date() : null))
                    .input('ClosedBy', sql.NVarChar(64), data.closedBy || null)
                    .input('ClosedByName', sql.NVarChar(255), data.closedByName || null)
                    .input('IsClosed', sql.Bit, data.isClosed !== undefined ? (data.isClosed ? 1 : 0) : null)
                    .input('CashierSessionsJson', sql.NVarChar(sql.MAX), data.cashierSessions ? jsonString(data.cashierSessions) : null)
                    .input('ClosingStatementJson', sql.NVarChar(sql.MAX), data.closingStatementJson || (data.closingStatement ? jsonString(data.closingStatement) : null))
                    .query(`
                        UPDATE dbo.PosSessions
                        SET 
                            EndTime = COALESCE(@EndTime, EndTime),
                            ClosedBy = COALESCE(@ClosedBy, ClosedBy),
                            ClosedByName = COALESCE(@ClosedByName, ClosedByName),
                            IsClosed = COALESCE(@IsClosed, IsClosed),
                            CashierSessionsJson = COALESCE(@CashierSessionsJson, CashierSessionsJson),
                            ClosingStatementJson = COALESCE(@ClosingStatementJson, ClosingStatementJson)
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'users' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || null)
                    .input('LoginName', sql.NVarChar(100), data.loginName || null)
                    .input('Password', sql.NVarChar(255), data.password ? String(data.password) : null)
                    .input('Role', sql.NVarChar(100), data.role || null)
                    .input('Phone', sql.NVarChar(50), data.phone || null)
                    .input('IsCashier', sql.Bit, data.isCashier !== undefined ? (data.isCashier ? 1 : 0) : null)
                    .input('IsDelivery', sql.Bit, data.isDelivery !== undefined ? (data.isDelivery ? 1 : 0) : null)
                    .input('IsSalesRep', sql.Bit, data.isSalesRep !== undefined ? (data.isSalesRep ? 1 : 0) : null)
                    .input('CanOpenOwnShift', sql.Bit, data.canOpenOwnShift !== undefined ? (data.canOpenOwnShift ? 1 : 0) : null)
                    .input('CanDeleteFromCart', sql.Bit, data.canDeleteFromCart !== undefined ? (data.canDeleteFromCart ? 1 : 0) : null)
                    .input('CanProcessReturn', sql.Bit, data.canProcessReturn !== undefined ? (data.canProcessReturn ? 1 : 0) : null)
                    .input('CanCancelInvoice', sql.Bit, data.canCancelInvoice !== undefined ? (data.canCancelInvoice ? 1 : 0) : null)
                    .input('CanBypassScannerForReturn', sql.Bit, data.canBypassScannerForReturn !== undefined ? (data.canBypassScannerForReturn ? 1 : 0) : null)
                    .input('IsDisabled', sql.Bit, data.isDisabled !== undefined ? (data.isDisabled ? 1 : 0) : null)
                    .input('WarehouseIds', sql.NVarChar(sql.MAX), data.warehouseIds ? jsonString(data.warehouseIds) : null)
                    .input('ThemeSettings', sql.NVarChar(sql.MAX), data.themeSettings ? jsonString(data.themeSettings) : null)
                    .query(`
                        UPDATE dbo.Users
                        SET 
                            Name = COALESCE(@Name, Name),
                            LoginName = COALESCE(@LoginName, LoginName),
                            Password = COALESCE(@Password, Password),
                            Role = COALESCE(@Role, Role),
                            Phone = COALESCE(@Phone, Phone),
                            IsCashier = COALESCE(@IsCashier, IsCashier),
                            IsDelivery = COALESCE(@IsDelivery, IsDelivery),
                            IsSalesRep = COALESCE(@IsSalesRep, IsSalesRep),
                            CanOpenOwnShift = COALESCE(@CanOpenOwnShift, CanOpenOwnShift),
                            CanDeleteFromCart = COALESCE(@CanDeleteFromCart, CanDeleteFromCart),
                            CanProcessReturn = COALESCE(@CanProcessReturn, CanProcessReturn),
                            CanCancelInvoice = COALESCE(@CanCancelInvoice, CanCancelInvoice),
                            CanBypassScannerForReturn = COALESCE(@CanBypassScannerForReturn, CanBypassScannerForReturn),
                            IsDisabled = COALESCE(@IsDisabled, IsDisabled),
                            WarehouseIds = COALESCE(@WarehouseIds, WarehouseIds),
                            ThemeSettings = COALESCE(@ThemeSettings, ThemeSettings)
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'roles') {
                for (const [roleName, perms] of Object.entries(data)) {
                    await pool.request()
                        .input('Id', sql.NVarChar(100), roleName)
                        .input('PermissionsJson', sql.NVarChar(sql.MAX), jsonString(perms))
                        .query(`
                            IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE Id = @Id)
                                INSERT INTO dbo.Roles (Id, PermissionsJson) VALUES (@Id, @PermissionsJson);
                            ELSE
                                UPDATE dbo.Roles SET PermissionsJson = @PermissionsJson WHERE Id = @Id;
                        `);
                }
                return NextResponse.json({ success: true });
            }

            if (path === 'settings') {
                const targetKey = updateId || 'main';
                const currentRes = await pool.request()
                    .input('SettingKey', sql.NVarChar(100), targetKey)
                    .query('SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = @SettingKey');
                
                let existingObj: any = {};
                if (currentRes.recordset.length > 0 && currentRes.recordset[0].SettingValue) {
                    try { existingObj = JSON.parse(currentRes.recordset[0].SettingValue); } catch {}
                }
                
                const merged = { ...existingObj, ...data };
                
                await pool.request()
                    .input('SettingKey', sql.NVarChar(100), targetKey)
                    .input('SettingValue', sql.NVarChar(sql.MAX), JSON.stringify(merged))
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = @SettingKey)
                            INSERT INTO dbo.AppSettings (SettingKey, SettingValue) VALUES (@SettingKey, @SettingValue);
                        ELSE
                            UPDATE dbo.AppSettings SET SettingValue = @SettingValue WHERE SettingKey = @SettingKey;
                    `);
                return NextResponse.json({ success: true });
            }
        }

        // =====================================================================
        // ACTION: REMOVE
        // =====================================================================
        if (action === 'remove') {
            const removeId = payload?.id || payload;
            if (removeId) {
                const tableMap: Record<string, string> = {
                    items: 'dbo.Items',
                    itemSections: 'dbo.ItemSections',
                    itemCategories: 'dbo.ItemCategories',
                    itemGroups: 'dbo.ItemGroups',
                    itemSubCategories1: 'dbo.ItemSubCategories1',
                    itemSubCategories2: 'dbo.ItemSubCategories2',
                    customers: 'dbo.Customers',
                    suppliers: 'dbo.Suppliers',
                    salesInvoices: 'dbo.SalesInvoices',
                    salesReturns: 'dbo.SalesReturns',
                    purchaseInvoices: 'dbo.PurchaseInvoices',
                    purchaseReturns: 'dbo.PurchaseReturns',
                    customerPayments: 'dbo.CustomerPayments',
                    supplierPayments: 'dbo.SupplierPayments',
                    expenses: 'dbo.Expenses',
                    exceptionalIncomes: 'dbo.ExceptionalIncomes',
                    treasuryTransactions: 'dbo.TreasuryTransactions',
                    profitDistributions: 'dbo.ProfitDistributions',
                    employeeAdvances: 'dbo.EmployeeAdvances',
                    employeeAdjustments: 'dbo.EmployeeAdjustments',
                    fixedAssets: 'dbo.FixedAssets',
                    depreciationRecords: 'dbo.DepreciationRecords',
                    heldInvoices: 'dbo.HeldInvoices',
                    warehouses: 'dbo.Warehouses',
                    cashAccounts: 'dbo.CashAccounts',
                    users: 'dbo.Users',
                    roles: 'dbo.Roles',
                    customerVisits: 'dbo.CustomerVisits',
                    loginHistory: 'dbo.LoginHistory',
                    priceChangeLogs: 'dbo.PriceChangeLogs',
                    payrollRecords: 'dbo.PayrollRecords',
                    stockInRecords: 'dbo.StockInRecords',
                    stockOutRecords: 'dbo.StockOutRecords',
                    stockTransferRecords: 'dbo.StockTransferRecords',
                    stockAdjustmentRecords: 'dbo.StockAdjustmentRecords',
                    stockIssuesToReps: 'dbo.StockIssuesToReps',
                    stockReturnsFromReps: 'dbo.StockReturnsFromReps',
                    inventoryClosings: 'dbo.InventoryClosings'
                };
                const tableName = tableMap[path];
                if (tableName) {
                    await pool.request()
                        .input('Id', sql.NVarChar(64), String(removeId))
                        .query(`DELETE FROM ${tableName} WHERE Id = @Id;`);
                    return NextResponse.json({ success: true });
                }
            }
        }

        return NextResponse.json({ success: true, message: 'Processed' });
    } catch (error: any) {
        console.error('Error in /api/db/action:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
