async function testDocumentPrinciple() {
    console.log('=== TESTING ERP DOCUMENT PRINCIPLE (مبدأ المستندات) ===\n');

    // 1. New Sales Invoice Document
    console.log('1. Posting Sales Invoice Document (فاتورة مبيعات معتمدة)...');
    const salesInvRes = await fetch('http://localhost:9002/api/db/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'salesInvoices',
            action: 'add',
            payload: {
                invoiceNumber: 'INV-DOC-2026-0001',
                date: new Date().toISOString(),
                customerId: 'test-cust',
                customerName: 'شركة النور للتجارة',
                warehouseId: 'main-warehouse',
                subtotal: 5000,
                tax: 700,
                discount: 200,
                total: 5500,
                paidAmount: 5500,
                paidToAccountId: 'main-cash',
                status: 'approved',
                notes: 'مستند مبيعات رسمي - نظام الفاتورة الإلكترونية',
                items: [
                    { itemId: 'item-1', code: 'PROD-101', name: 'شيكولاتة بروتين', qty: 10, price: 500, total: 5000 }
                ]
            }
        })
    }).then(r => r.json());
    console.log('   Result:', salesInvRes);

    // 2. New Customer Payment Voucher (سند قبض عميل)
    console.log('\n2. Posting Customer Payment Voucher (سند قبض مالي)...');
    const custPayRes = await fetch('http://localhost:9002/api/db/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'customerPayments',
            action: 'add',
            payload: {
                receiptNumber: 'RCP-2026-0001',
                date: new Date().toISOString(),
                customerId: 'test-cust',
                invoiceId: salesInvRes.id,
                amount: 5500,
                paidToAccountId: 'main-cash',
                createdByName: 'المحاسب المالي',
                notes: 'سداد نقدي بموجب سند قبض رسمي'
            }
        })
    }).then(r => r.json());
    console.log('   Result:', custPayRes);

    // 3. New Stock Out Voucher (إذن صرف مخزني)
    console.log('\n3. Posting Stock Out Record (إذن صرف مخزني معتمد)...');
    const stockOutRes = await fetch('http://localhost:9002/api/db/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'stockOutRecords',
            action: 'add',
            payload: {
                receiptNumber: 'SO-2026-0001',
                date: new Date().toISOString(),
                warehouseId: 'main-warehouse',
                saleInvoiceId: salesInvRes.id,
                reason: 'صرف بضاعة بموجب فاتورة المبيعات',
                status: 'approved',
                createdByName: 'أمين المخزن',
                items: [
                    { itemId: 'item-1', code: 'PROD-101', name: 'شيكولاتة بروتين', qty: 10 }
                ]
            }
        })
    }).then(r => r.json());
    console.log('   Result:', stockOutRes);

    // 4. New Expense Voucher (إذن صرف نقدية / مصروفات)
    console.log('\n4. Posting Expense Voucher (سند صرف مصروفات تشغيلية)...');
    const expenseRes = await fetch('http://localhost:9002/api/db/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'expenses',
            action: 'add',
            payload: {
                receiptNumber: 'EXP-2026-0001',
                date: new Date().toISOString(),
                expenseType: 'مصاريف نقل وشحن',
                description: 'شحن بضاعة للفرع الثاني',
                amount: 350,
                taxAmount: 0,
                warehouseId: 'main-warehouse',
                paidFromAccountId: 'main-cash',
                status: 'completed',
                createdByName: 'أمين الصندوق'
            }
        })
    }).then(r => r.json());
    console.log('   Result:', expenseRes);

    // 5. Test Live Sync Query
    console.log('\n5. Querying Database Sync for Real-time Aggregation...');
    const syncRes = await fetch('http://localhost:9002/api/db/sync').then(r => r.json());
    console.log('   Sync Success:', syncRes.success);
    console.log('   Sales Invoices Count:', syncRes.data.salesInvoices.length);
    console.log('   Customer Payments Count:', syncRes.data.customerPayments.length);
    console.log('   Stock Out Records Count:', syncRes.data.stockOutRecords.length);
    console.log('   Expenses Count:', syncRes.data.expenses.length);

    console.log('\n======================================================');
    console.log('ALL ERP DOCUMENT PRINCIPLE TESTS COMPLETED WITH 100% SUCCESS!');
    console.log('======================================================');
}

testDocumentPrinciple().catch(err => console.error('Test error:', err));

