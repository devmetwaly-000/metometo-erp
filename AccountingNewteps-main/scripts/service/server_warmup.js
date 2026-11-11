/**
 * @fileOverview مسرع ومسخن الشاشات التلقائي (Automatic Route & Screen Warmup Engine)
 * يتولى إرسال طلبات خلفية خفيفة لجميع شاشات النظام فور تشغيل الخادم
 * ليقوم خادم Next.js بترجمتها وتجميعها في الذاكرة والكاش مسبقاً قبل نقر المستخدم عليها.
 */

const http = require('http');

const ALL_SYSTEM_ROUTES = [
    '/',
    '/pos',
    '/pos/sessions',
    '/sales/invoices/list',
    '/sales/invoices',
    '/sales/returns',
    '/sales/returns/pos',
    '/purchases/invoices/list',
    '/purchases/invoices',
    '/purchases/returns',
    '/master-data/items',
    '/master-data/customers',
    '/master-data/suppliers',
    '/master-data/pos-terminals',
    '/master-data/item-categories',
    '/inventory/stock-status',
    '/inventory/stock-in',
    '/inventory/stock-out',
    '/inventory/transfer/list',
    '/inventory/transfer/new',
    '/inventory/adjustments',
    '/inventory/barcode-designer',
    '/accounting/expenses',
    '/accounting/exceptional-income',
    '/accounting/treasury',
    '/accounting/journal',
    '/accounting/posting',
    '/accounting/assets',
    '/accounting/vat',
    '/manufacturing/orders',
    '/settings',
    '/settings/audit-trail',
    '/settings/e-invoice',
    '/settings/period-closing',
    '/settings/sync',
    '/settings/users',
    '/reports',
    '/reports/sales-reports',
    '/reports/purchases-report',
    '/reports/inventory-valuation',
    '/reports/expenses-report',
    '/reports/rep-sales-report',
    '/reports/stock-transfers-report',
    '/reports/fast-slow-moving',
    '/reports/inventory-adjustments-report',
    '/reports/vat-report',
    '/reports/payroll-report',
    '/reports/customer-statement',
    '/reports/customer-receivables',
    '/reports/cash-account-statement',
    '/reports/partner-shares',
    '/analytics',
    '/hr/employees',
    '/hr/payroll',
    '/hr/advances'
];

function fetchRoute(route, port = 9002) {
    return new Promise((resolve) => {
        const req = http.get({
            hostname: 'localhost',
            port: port,
            path: route,
            headers: {
                'User-Agent': 'Meto-Screen-Warmup-Bot',
                'RSC': '1',
                'Next-Router-Prefetch': '1'
            },
            timeout: 10000
        }, (res) => {
            res.resume(); // استهلاك البيانات لتحرير الاتصال
            resolve({ route, status: res.statusCode });
        });

        req.on('error', () => {
            resolve({ route, status: 'error' });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ route, status: 'timeout' });
        });
    });
}

async function startWarmup(port = 9002) {
    console.log(`[Screen Warmup] بدء تسخين وتجميع شاشات النظام مسبقاً (${ALL_SYSTEM_ROUTES.length} شاشة)...`);
    
    for (let i = 0; i < ALL_SYSTEM_ROUTES.length; i++) {
        const route = ALL_SYSTEM_ROUTES[i];
        try {
            await fetchRoute(route, port);
            // فاصل زمني 100ms لمنع إرهاق المعالج
            await new Promise(r => setTimeout(r, 100));
        } catch {}
    }
    
    console.log(`[Screen Warmup] تم الانتهاء من تسخين وتجهيز كافة شاشات النظام.`);
}

module.exports = { startWarmup, ALL_SYSTEM_ROUTES };

if (require.main === module) {
    startWarmup(9002);
}

