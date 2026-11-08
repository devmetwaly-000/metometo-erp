// Chart of Accounts (شجرة الحسابات المحاسبية القياسية)
// Designed according to Egyptian & International Accounting Standards (EAS / IFRS)

export interface AccountNode {
    code: string;
    name: string;
    type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
    normalBalance: 'debit' | 'credit';
    level: 1 | 2 | 3 | 4;
    parentCode?: string;
    description?: string;
}

export const CHART_OF_ACCOUNTS: AccountNode[] = [
    // -------------------------------------------------------------
    // 1. الأصول (ASSETS) - طبيعتها مدينة (Debit)
    // -------------------------------------------------------------
    { code: '1', name: 'الأصول', type: 'asset', normalBalance: 'debit', level: 1 },
    
    // 11. الأصول المتداولة (Current Assets)
    { code: '11', name: 'الأصول المتداولة', type: 'asset', normalBalance: 'debit', level: 2, parentCode: '1' },
    { code: '1101', name: 'النقدية وما في حكمها (الخزائن والبنوك)', type: 'asset', normalBalance: 'debit', level: 3, parentCode: '11' },
    { code: '1102', name: 'العملاء والذمم المدينة (Accounts Receivable)', type: 'asset', normalBalance: 'debit', level: 3, parentCode: '11' },
    { code: '1103', name: 'المخزون السلعي (Inventory)', type: 'asset', normalBalance: 'debit', level: 3, parentCode: '11' },
    { code: '1104', name: 'سلف وعهد الموظفين والمناديب', type: 'asset', normalBalance: 'debit', level: 3, parentCode: '11' },
    { code: '1105', name: 'ضريبة القيمة المضافة - مدخلات (مشتريات/مصروفات)', type: 'asset', normalBalance: 'debit', level: 3, parentCode: '11' },
    { code: '1106', name: 'مصروفات مدفوعة مقدماً وأرصدة مدينة أخرى', type: 'asset', normalBalance: 'debit', level: 3, parentCode: '11' },

    // 12. الأصول غير المتداولة / الثابتة (Fixed / Non-Current Assets)
    { code: '12', name: 'الأصول غير المتداولة والثابتة', type: 'asset', normalBalance: 'debit', level: 2, parentCode: '1' },
    { code: '1201', name: 'الأصول الثابتة (التكلفة التاريخية)', type: 'asset', normalBalance: 'debit', level: 3, parentCode: '12' },
    { code: '1209', name: 'مجمع إهلاك الأصول الثابتة (-)', type: 'asset', normalBalance: 'credit', level: 3, parentCode: '12', description: 'حساب مقابل للأصول' },

    // -------------------------------------------------------------
    // 2. الالتزامات / الخصوم (LIABILITIES) - طبيعتها دائنة (Credit)
    // -------------------------------------------------------------
    { code: '2', name: 'الالتزامات (الخصوم)', type: 'liability', normalBalance: 'credit', level: 1 },
    
    // 21. الالتزامات المتداولة (Current Liabilities)
    { code: '21', name: 'الالتزامات المتداولة', type: 'liability', normalBalance: 'credit', level: 2, parentCode: '2' },
    { code: '2101', name: 'الموردون والذمم الدائنة (Accounts Payable)', type: 'liability', normalBalance: 'credit', level: 3, parentCode: '21' },
    { code: '2102', name: 'ضريبة القيمة المضافة - مخرجات (مبيعات)', type: 'liability', normalBalance: 'credit', level: 3, parentCode: '21' },
    { code: '2103', name: 'مصروفات مستحقة ومستحقات عاملين', type: 'liability', normalBalance: 'credit', level: 3, parentCode: '21' },
    { code: '2104', name: 'أمانات وتأمينات للغير', type: 'liability', normalBalance: 'credit', level: 3, parentCode: '21' },

    // -------------------------------------------------------------
    // 3. حقوق الملكية (EQUITY) - طبيعتها دائنة (Credit)
    // -------------------------------------------------------------
    { code: '3', name: 'حقوق الملكية', type: 'equity', normalBalance: 'credit', level: 1 },
    { code: '31', name: 'رأس المال والاحتياطيات', type: 'equity', normalBalance: 'credit', level: 2, parentCode: '3' },
    { code: '3101', name: 'رأس المال المستثمر', type: 'equity', normalBalance: 'credit', level: 3, parentCode: '31' },
    { code: '3102', name: 'جاري الشركاء والمساهمين', type: 'equity', normalBalance: 'credit', level: 3, parentCode: '31' },
    { code: '3103', name: 'الأرباح المحتجزة / المرحلة من سنوات سابقة', type: 'equity', normalBalance: 'credit', level: 3, parentCode: '31' },
    { code: '3104', name: 'صافي أرباح (خسائر) الفترة الحالية', type: 'equity', normalBalance: 'credit', level: 3, parentCode: '31' },
    { code: '3105', name: 'توزيعات ومسحوبات الأرباح (-)', type: 'equity', normalBalance: 'debit', level: 3, parentCode: '31', description: 'حساب مقابل لحقوق الملكية' },

    // -------------------------------------------------------------
    // 4. الإيرادات (REVENUES) - طبيعتها دائنة (Credit)
    // -------------------------------------------------------------
    { code: '4', name: 'الإيرادات', type: 'revenue', normalBalance: 'credit', level: 1 },
    
    // 41. إيرادات النشاط التشغيلي
    { code: '41', name: 'إيرادات النشاط الرئيسي (المبيعات)', type: 'revenue', normalBalance: 'credit', level: 2, parentCode: '4' },
    { code: '4101', name: 'إيرادات المبيعات ونقاط البيع (Gross Sales)', type: 'revenue', normalBalance: 'credit', level: 3, parentCode: '41' },
    { code: '4102', name: 'مردودات ومسموحات المبيعات (-)', type: 'revenue', normalBalance: 'debit', level: 3, parentCode: '41', description: 'تخفيض من الإيراد' },
    { code: '4103', name: 'الخصم المسموح به للعملاء (-)', type: 'revenue', normalBalance: 'debit', level: 3, parentCode: '41', description: 'تخفيض من الإيراد' },

    // 42. إيرادات أخرى ومكتسبة
    { code: '42', name: 'إيرادات أخرى وتمويلية', type: 'revenue', normalBalance: 'credit', level: 2, parentCode: '4' },
    { code: '4201', name: 'الخصم المكتسب من الموردين (Earned Discount)', type: 'revenue', normalBalance: 'credit', level: 3, parentCode: '42', description: 'خصم تجاري / تعجيل دفع ممنوح من الموردين' },
    { code: '4202', name: 'إيرادات متنوعة واستثنائية', type: 'revenue', normalBalance: 'credit', level: 3, parentCode: '42' },
    { code: '4203', name: 'أرباح تسويات المخزون (فائض جرد)', type: 'revenue', normalBalance: 'credit', level: 3, parentCode: '42' },

    // -------------------------------------------------------------
    // 5. المصروفات والتكاليف (EXPENSES & COGS) - طبيعتها مدينة (Debit)
    // -------------------------------------------------------------
    { code: '5', name: 'المصروفات والتكاليف', type: 'expense', normalBalance: 'debit', level: 1 },
    
    // 51. تكلفة المبيعات (Cost of Goods Sold)
    { code: '51', name: 'تكلفة المبيعات (COGS)', type: 'expense', normalBalance: 'debit', level: 2, parentCode: '5' },
    { code: '5101', name: 'تكلفة البضاعة المباعة (المخزون المنصرف للبيع)', type: 'expense', normalBalance: 'debit', level: 3, parentCode: '51' },

    // 52. المصروفات التشغيلية والعمومية (Operating & G&A Expenses)
    { code: '52', name: 'المصروفات التشغيلية والعمومية', type: 'expense', normalBalance: 'debit', level: 2, parentCode: '5' },
    { code: '5201', name: 'رواتب وأجور ومكافآت الموظفين', type: 'expense', normalBalance: 'debit', level: 3, parentCode: '52' },
    { code: '5202', name: 'إيجار المقرات والفروع', type: 'expense', normalBalance: 'debit', level: 3, parentCode: '52' },
    { code: '5203', name: 'كهرباء ومياه ومرافق حكومية', type: 'expense', normalBalance: 'debit', level: 3, parentCode: '52' },
    { code: '5204', name: 'مواصلات ونقل وشحن وتوصيل', type: 'expense', normalBalance: 'debit', level: 3, parentCode: '52' },
    { code: '5205', name: 'صيانة ونظافة وضيافة', type: 'expense', normalBalance: 'debit', level: 3, parentCode: '52' },
    { code: '5206', name: 'مصروف إهلاك الأصول الثابتة', type: 'expense', normalBalance: 'debit', level: 3, parentCode: '52' },
    { code: '5207', name: 'خسائر عجز تسويات المخزون وتوالف', type: 'expense', normalBalance: 'debit', level: 3, parentCode: '52' },
    { code: '5208', name: 'مصروفات تشغيلية وإدارية أخرى', type: 'expense', normalBalance: 'debit', level: 3, parentCode: '52' },
];

/**
 * Mapping helper: Given an operational account label from the journal or system,
 * maps it to its standard COA code and standard node.
 */
export const getCOAAccountForLabel = (label: string): AccountNode => {
    const l = (label || '').trim().toLowerCase();

    // 1. Cash & Banks
    if (l.includes('خزينة') || l.includes('بنك') || l.includes('نقدية') || l.includes('cash') || l.includes('bank')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '1101')!;
    }
    // 2. Accounts Receivable
    if (l.includes('عملاء') || l.includes('عميل') || l.includes('customer') || l.includes('receivable')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '1102')!;
    }
    // 3. Inventory
    if (l.includes('مخزون') || l.includes('بضاعة') || l.includes('inventory') || l.includes('مخزن')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '1103')!;
    }
    // 4. Employee Advances & Sales Reps
    if (l.includes('سلف') || l.includes('عهدة') || l.includes('مندوب') || l.includes('advance')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '1104')!;
    }
    // 5. Fixed Assets Cost
    if (l.includes('أصول ثابتة') || l.includes('أصل ثابت') || l.includes('fixed asset')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '1201')!;
    }
    // 6. Accounts Payable (Suppliers)
    if (l.includes('مورد') || l.includes('موردين') || l.includes('supplier') || l.includes('payable')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '2101')!;
    }
    // 7. VAT
    if (l.includes('ضريبة') || l.includes('vat') || l.includes('قيمة مضافة')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '2102')!;
    }
    // 8. Capital & Equity
    if (l.includes('رأس المال') || l.includes('capital') || l.includes('افتتاحية')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '3101')!;
    }
    if (l.includes('شريك') || l.includes('شركاء') || l.includes('partner')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '3102')!;
    }
    if (l.includes('توزيع') || l.includes('مسحوبات') || l.includes('distribution')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '3105')!;
    }
    // 9. Sales Revenue & Returns & Discounts
    if (l.includes('خصم مسموح') || l.includes('sales discount')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '4103')!;
    }
    if (l.includes('مرتجع مبيعات') || l.includes('مردودات مبيعات')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '4102')!;
    }
    if (l.includes('مبيعات') || l.includes('إيرادات المبيعات') || l.includes('revenue') || l.includes('sale')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '4101')!;
    }
    // 10. Earned Discount (الخصم المكتسب)
    if (l.includes('خصم مكتسب') || l.includes('earned discount') || l.includes('purchase discount')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '4201')!;
    }
    // 11. Exceptional Income
    if (l.includes('إيرادات متنوعة') || l.includes('دخل استثنائي') || l.includes('إيراد')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '4202')!;
    }
    // 12. COGS
    if (l.includes('تكلفة البضاعة') || l.includes('cogs') || l.includes('تكلفة المبيعات')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '5101')!;
    }
    // 13. Specific Expenses
    if (l.includes('رواتب') || l.includes('أجور') || l.includes('مرتبات') || l.includes('payroll')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '5201')!;
    }
    if (l.includes('إيجار') || l.includes('ايجار') || l.includes('rent')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '5202')!;
    }
    if (l.includes('كهرباء') || l.includes('مياه') || l.includes('غاز') || l.includes('مرافق')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '5203')!;
    }
    if (l.includes('مواصلات') || l.includes('نقل') || l.includes('شحن') || l.includes('توصيل')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '5204')!;
    }
    if (l.includes('صيانة') || l.includes('نظافة') || l.includes('ضيافة')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '5205')!;
    }
    if (l.includes('إهلاك') || l.includes('اهلاك') || l.includes('depreciation')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '5206')!;
    }
    if (l.includes('عجز') || l.includes('تالف') || l.includes('هوالك') || l.includes('خسائر')) {
        return CHART_OF_ACCOUNTS.find(a => a.code === '5207')!;
    }

    // Default to other operational expenses
    return CHART_OF_ACCOUNTS.find(a => a.code === '5208')!;
};

export interface TrialBalanceRow {
    accountCode: string;
    accountName: string;
    level: number;
    parentCode?: string;
    type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
    normalBalance: 'debit' | 'credit';
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    endingDebit: number;
    endingCredit: number;
}

export interface JournalEntryLike {
    id: string;
    date: string;
    number: string;
    description: string;
    debit: number;
    credit: number;
    account: string;
    warehouseId?: string;
}

export function computeTrialBalance(
    journalEntries: JournalEntryLike[],
    fromDate?: string,
    toDate?: string
): {
    rows: TrialBalanceRow[];
    totals: {
        openingDebit: number;
        openingCredit: number;
        periodDebit: number;
        periodCredit: number;
        endingDebit: number;
        endingCredit: number;
        isBalanced: boolean;
    };
} {
    const start = fromDate ? new Date(fromDate) : null;
    const end = toDate ? new Date(toDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    // Map account code -> movements
    const accMap = new Map<string, { opDr: number; opCr: number; pDr: number; pCr: number }>();

    // Initialize all level 3 accounts
    CHART_OF_ACCOUNTS.forEach(acc => {
        accMap.set(acc.code, { opDr: 0, opCr: 0, pDr: 0, pCr: 0 });
    });

    journalEntries.forEach(entry => {
        const coaNode = getCOAAccountForLabel(entry.account);
        const data = accMap.get(coaNode.code) || { opDr: 0, opCr: 0, pDr: 0, pCr: 0 };
        const txDate = new Date(entry.date);

        if (start && txDate < start) {
            // Prior period -> goes to opening
            data.opDr += Number(entry.debit) || 0;
            data.opCr += Number(entry.credit) || 0;
        } else if (!end || txDate <= end) {
            // Within current filter period
            data.pDr += Number(entry.debit) || 0;
            data.pCr += Number(entry.credit) || 0;
        }
        accMap.set(coaNode.code, data);
    });

    // Roll up level 3 accounts into level 2 and level 1
    const getRollup = (code: string): { opDr: number; opCr: number; pDr: number; pCr: number } => {
        const direct = accMap.get(code) || { opDr: 0, opCr: 0, pDr: 0, pCr: 0 };
        const children = CHART_OF_ACCOUNTS.filter(a => a.parentCode === code);
        if (children.length === 0) return direct;

        let opDr = direct.opDr;
        let opCr = direct.opCr;
        let pDr = direct.pDr;
        let pCr = direct.pCr;

        children.forEach(child => {
            const childTotals = getRollup(child.code);
            opDr += childTotals.opDr;
            opCr += childTotals.opCr;
            pDr += childTotals.pDr;
            pCr += childTotals.pCr;
        });

        return { opDr, opCr, pDr, pCr };
    };

    const rows: TrialBalanceRow[] = CHART_OF_ACCOUNTS.map(node => {
        const totals = getRollup(node.code);
        
        let endingDebit = 0;
        let endingCredit = 0;

        const netBalance = (totals.opDr + totals.pDr) - (totals.opCr + totals.pCr);

        if (node.normalBalance === 'debit') {
            if (netBalance >= 0) {
                endingDebit = netBalance;
            } else {
                endingCredit = Math.abs(netBalance);
            }
        } else {
            // Credit normal
            if (netBalance <= 0) {
                endingCredit = Math.abs(netBalance);
            } else {
                endingDebit = netBalance;
            }
        }

        return {
            accountCode: node.code,
            accountName: node.name,
            level: node.level,
            parentCode: node.parentCode,
            type: node.type,
            normalBalance: node.normalBalance,
            openingDebit: totals.opDr,
            openingCredit: totals.opCr,
            periodDebit: totals.pDr,
            periodCredit: totals.pCr,
            endingDebit,
            endingCredit,
        };
    });

    // Calculate totals across top-level (level 1) accounts
    const level1Rows = rows.filter(r => r.level === 1);
    const totalOpeningDebit = level1Rows.reduce((sum, r) => sum + r.openingDebit, 0);
    const totalOpeningCredit = level1Rows.reduce((sum, r) => sum + r.openingCredit, 0);
    const totalPeriodDebit = level1Rows.reduce((sum, r) => sum + r.periodDebit, 0);
    const totalPeriodCredit = level1Rows.reduce((sum, r) => sum + r.periodCredit, 0);
    const totalEndingDebit = level1Rows.reduce((sum, r) => sum + r.endingDebit, 0);
    const totalEndingCredit = level1Rows.reduce((sum, r) => sum + r.endingCredit, 0);

    const isBalanced = Math.abs(totalEndingDebit - totalEndingCredit) < 1.0;

    return {
        rows,
        totals: {
            openingDebit: totalOpeningDebit,
            openingCredit: totalOpeningCredit,
            periodDebit: totalPeriodDebit,
            periodCredit: totalPeriodCredit,
            endingDebit: totalEndingDebit,
            endingCredit: totalEndingCredit,
            isBalanced,
        }
    };
}

/**
 * محرك توليد قيود اليومية الشامل (Double-Entry Bookkeeping Engine)
 * يبني كافة قيود اليومية من دورة المبيعات، المشتريات، المقبوضات، المدفوعات، الإهلاك، وتسويات المخزون.
 */
export function generateAllJournalEntries(allData: any): JournalEntryLike[] {
    const {
        salesInvoices = [],
        posSales = [],
        salesReturns = [],
        posReturns = [],
        purchaseInvoices = [],
        purchaseReturns = [],
        expenses = [],
        exceptionalIncomes = [],
        treasuryTransactions = [],
        customerPayments = [],
        supplierPayments = [],
        payrollRecords = [],
        profitDistributions = [],
        stockTransferRecords = [],
        stockAdjustmentRecords = [],
        depreciationRecords = [],
        warehouses = [],
        cashAccounts = [],
        employees = [],
        customers = [],
        suppliers = [],
        partners = [],
        items = [],
        fixedAssets = [],
        settings = {},
    } = allData || {};

    const itemsMap = new Map();
    items.forEach((item: any) => itemsMap.set(item.id, item));

    const entries: JournalEntryLike[] = [];
    const getWarehouse = (id?: string) => warehouses.find((w: any) => w.id === id);
    const getCashAccount = (id?: string) => cashAccounts.find((c: any) => c.id === id);
    const getCashAccountName = (id?: string) => getCashAccount(id)?.name || 'النقدية/البنك';
    const getCustomerName = (id?: string) => customers.find((c: any) => c.id === id)?.name || 'عميل غير معروف';
    const getSupplierName = (id?: string) => suppliers.find((s: any) => s.id === id)?.name || 'مورد غير معروف';
    const getPartnerName = (id?: string) => partners.find((p: any) => p.id === id)?.name || 'شريك غير معروف';

    const fiscalYearStart = settings?.main?.financial?.fiscalYearStart || '2024-01-01';

    // 1. Customers Opening Balances
    const totalCustomerOB = customers.reduce((sum: number, c: any) => sum + (Number(c.openingBalance) || 0), 0);
    if (totalCustomerOB > 0) {
        entries.push({ id: 'ob-ar-dr', date: fiscalYearStart, number: 'OB-001', description: 'إجمالي الأرصدة الافتتاحية للعملاء (مدين)', debit: totalCustomerOB, credit: 0, account: 'حسابات العملاء' });
        entries.push({ id: 'ob-ar-cr', date: fiscalYearStart, number: 'OB-001', description: 'رصيد افتتاحي مقابل للعملاء', debit: 0, credit: totalCustomerOB, account: 'رأس المال / أرصدة افتتاحية' });
    }

    // 2. Suppliers Opening Balances
    const totalSupplierOB = suppliers.reduce((sum: number, s: any) => sum + (Number(s.openingBalance) || 0), 0);
    if (totalSupplierOB > 0) {
        entries.push({ id: 'ob-ap-cr', date: fiscalYearStart, number: 'OB-002', description: 'إجمالي الأرصدة الافتتاحية للموردين (دائن)', debit: 0, credit: totalSupplierOB, account: 'حسابات الموردين' });
        entries.push({ id: 'ob-ap-dr', date: fiscalYearStart, number: 'OB-002', description: 'رصيد افتتاحي مقابل للموردين', debit: totalSupplierOB, credit: 0, account: 'رأس المال / أرصدة افتتاحية' });
    }

    // 3. Cash Accounts Opening Balances
    cashAccounts.forEach((acc: any) => {
        if (Number(acc.openingBalance) > 0) {
            entries.push({ id: `ob-cash-${acc.id}-dr`, date: fiscalYearStart, number: 'OB-003', warehouseId: acc.warehouseId, description: `رصيد افتتاحي: ${acc.name}`, debit: Number(acc.openingBalance), credit: 0, account: acc.name });
            entries.push({ id: `ob-cash-${acc.id}-cr`, date: fiscalYearStart, number: 'OB-003', warehouseId: acc.warehouseId, description: `رصيد افتتاحي مقابل: ${acc.name}`, debit: 0, credit: Number(acc.openingBalance), account: 'رأس المال / أرصدة افتتاحية' });
        }
    });

    // 4. Sales Invoices & POS
    const validSales = salesInvoices.filter((s: any) => s.status === 'approved' || s.status === 'completed' || !s.status);
    const processedSaleIds = new Set(validSales.map((s: any) => s.id));
    const standalonePos = (posSales || []).filter((s: any) => !processedSaleIds.has(s.id));
    const allSales = [...validSales, ...standalonePos];

    allSales.forEach((sale: any) => {
        const totalBeforeDiscount = sale.subtotal || (Number(sale.total) + (Number(sale.discount) || 0));
        const number = sale.invoiceNumber || `ف-ب-${String(sale.id).slice(-4)}`;
        const amountDue = Number(sale.total) - (Number(sale.paidAmount) || 0);
        const cashAccName = getCashAccountName(sale.paidToAccountId);

        if (sale.paidAmount && Number(sale.paidAmount) > 0) {
            entries.push({ id: `sale-cash-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number, description: `فاتورة بيع ${number} للعميل ${sale.customerName || ''}`, debit: Number(sale.paidAmount), credit: 0, account: cashAccName });
        }
        if (amountDue > 0.01) {
            entries.push({ id: `sale-ar-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number, description: `فاتورة بيع ${number} للعميل ${sale.customerName || ''}`, debit: amountDue, credit: 0, account: 'حسابات العملاء' });
        }
        if (Number(sale.discount) > 0) {
            entries.push({ id: `sale-discount-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number, description: `خصم مسموح به على فاتورة بيع ${number}`, debit: Number(sale.discount), credit: 0, account: 'خصم مسموح به' });
        }
        if (Number(sale.taxAmount) > 0) {
            entries.push({ id: `sale-tax-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number, description: `ضريبة القيمة المضافة على مبيعات ${number}`, debit: 0, credit: Number(sale.taxAmount), account: 'ضريبة القيمة المضافة' });
        }

        const revenueNetOfTax = totalBeforeDiscount - (Number(sale.taxAmount) || 0);
        entries.push({ id: `sale-rev-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number, description: `إيرادات مبيعات ${number}`, debit: 0, credit: revenueNetOfTax, account: 'إيرادات المبيعات' });

        const cogs = (sale.items || []).reduce((acc: number, i: any) => acc + (Number(i.qty || 0) * (Number(i.cost) || Number(itemsMap.get(i.id)?.cost) || 0)), 0);
        const inventoryAccount = sale.salesRepId ? 'مخزون بعهدة المندوب' : `مخزون - ${getWarehouse(sale.warehouseId)?.name || 'غير محدد'}`;
        if (cogs > 0) {
            entries.push({ id: `sale-cogs-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number, description: `تكلفة بضاعة مباعة ${number}`, debit: cogs, credit: 0, account: 'تكلفة البضاعة المباعة' });
            entries.push({ id: `sale-inv-credit-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number, description: `صرف من المخزون لفاتورة ${number}`, debit: 0, credit: cogs, account: inventoryAccount });
        }
    });

    // 5. Sales Returns
    const processedReturnIds = new Set(salesReturns.map((r: any) => r.id));
    const standalonePosReturns = (posReturns || []).filter((r: any) => !processedReturnIds.has(r.id));
    const allReturns = [...salesReturns, ...standalonePosReturns];

    allReturns.forEach((ret: any) => {
        const number = ret.receiptNumber || `م-ب-${String(ret.id).slice(-4)}`;
        const cashAccName = getCashAccountName(ret.paidFromAccountId || (ret.warehouseId ? getCashAccount(warehouses.find((w: any) => w.id === ret.warehouseId)?.id)?.id : undefined));

        entries.push({ id: `ret-rev-${ret.id}`, date: ret.date, warehouseId: ret.warehouseId, number, description: `مرتجع مبيعات ${number} من ${ret.customerName || 'عميل كاشير'}`, debit: Number(ret.total), credit: 0, account: 'إيرادات المبيعات' });

        if (ret.paidAmount && Number(ret.paidAmount) > 0) {
            entries.push({ id: `ret-cash-${ret.id}`, date: ret.date, warehouseId: ret.warehouseId, number, description: `رد نقدي لمرتجع ${number}`, debit: 0, credit: Number(ret.paidAmount), account: cashAccName });
        }

        const amountAddedToBalance = Number(ret.total) - (Number(ret.paidAmount) || 0);
        if (amountAddedToBalance > 0.01) {
            entries.push({ id: `ret-ar-${ret.id}`, date: ret.date, warehouseId: ret.warehouseId, number, description: `تخفيض مديونية عميل لمرتجع ${number}`, debit: 0, credit: amountAddedToBalance, account: 'حسابات العملاء' });
        }

        const returnedCogs = (ret.items || []).reduce((acc: number, i: any) => acc + (Number(i.qty || 0) * (Number(i.cost) || Number(itemsMap.get(i.id)?.cost) || 0)), 0);
        const inventoryAccount = `مخزون - ${getWarehouse(ret.warehouseId)?.name || 'غير محدد'}`;
        if (returnedCogs > 0) {
            entries.push({ id: `ret-inv-${ret.id}`, date: ret.date, warehouseId: ret.warehouseId, number, description: `إعادة للمخزون لمرتجع ${number}`, debit: returnedCogs, credit: 0, account: inventoryAccount });
            entries.push({ id: `ret-cogs-${ret.id}`, date: ret.date, warehouseId: ret.warehouseId, number, description: `تخفيض تكلفة البضاعة لمرتجع ${number}`, debit: 0, credit: returnedCogs, account: 'تكلفة البضاعة المباعة' });
        }
    });

    // 6. Purchase Invoices (Including Earned Discount / الخصم المكتسب)
    purchaseInvoices.forEach((p: any) => {
        const number = p.invoiceNumber || `ف-ش-${String(p.id).slice(-4)}`;
        const warehouse = getWarehouse(p.warehouseId);
        const amountDue = Number(p.total) - (Number(p.paidAmount) || 0);
        const purchaseCost = (p.items || []).reduce((acc: number, item: any) => acc + (Number(item.qty || 0) * (Number(item.cost) || 0)), 0);
        const cashAccName = getCashAccountName(p.paidFromAccountId);

        entries.push({ id: `pur-inv-debit-${p.id}`, date: p.date, warehouseId: p.warehouseId, number, description: `مشتريات لصالح مخزن ${warehouse?.name || ''}`, debit: purchaseCost || Number(p.total), credit: 0, account: `مخزون - ${warehouse?.name || 'غير محدد'}` });

        if (p.paidAmount && Number(p.paidAmount) > 0) {
            entries.push({ id: `pur-cash-${p.id}`, date: p.date, warehouseId: p.warehouseId, number, description: `دفع للمورد ${p.supplierName || ''} للفاتورة ${number}`, debit: 0, credit: Number(p.paidAmount), account: cashAccName });
        }
        if (amountDue > 0.01) {
            entries.push({ id: `pur-ap-${p.id}`, date: p.date, warehouseId: p.warehouseId, number, description: `مستحقات للمورد ${p.supplierName || ''} للفاتورة ${number}`, debit: 0, credit: amountDue, account: 'حسابات الموردين' });
        }
        if (Number(p.discount) > 0) {
            // الخصم المكتسب من المورد
            entries.push({ id: `pur-discount-${p.id}`, date: p.date, warehouseId: p.warehouseId, number, description: `خصم مكتسب على فاتورة شراء ${number}`, debit: 0, credit: Number(p.discount), account: 'خصم مكتسب' });
        }
        if (Number(p.tax) > 0) {
            entries.push({ id: `pur-tax-${p.id}`, date: p.date, warehouseId: p.warehouseId, number, description: `ضريبة مدخلات للفاتورة ${number}`, debit: Number(p.tax), credit: 0, account: 'ضريبة القيمة المضافة' });
        }
    });

    // 7. Purchase Returns
    purchaseReturns.forEach((pr: any) => {
        const number = pr.receiptNumber || `م-ش-${String(pr.id).slice(-4)}`;
        const warehouse = getWarehouse(pr.warehouseId);
        const cashAccName = getCashAccountName(pr.paidToAccountId);
        const returnedValue = Number(pr.total);

        if (pr.paidAmount && Number(pr.paidAmount) > 0) {
            entries.push({ id: `pr-cash-${pr.id}`, date: pr.date, warehouseId: pr.warehouseId, number, description: `استلام نقدي لمرتجع شراء ${number}`, debit: Number(pr.paidAmount), credit: 0, account: cashAccName });
        }
        const debtReduction = returnedValue - (Number(pr.paidAmount) || 0);
        if (debtReduction > 0.01) {
            entries.push({ id: `pr-ap-${pr.id}`, date: pr.date, warehouseId: pr.warehouseId, number, description: `تخفيض مديونية مورد لمرتجع ${number}`, debit: debtReduction, credit: 0, account: 'حسابات الموردين' });
        }
        entries.push({ id: `pr-inv-${pr.id}`, date: pr.date, warehouseId: pr.warehouseId, number, description: `صرف من المخزون لمرتجع ${number}`, debit: 0, credit: returnedValue, account: `مخزون - ${warehouse?.name || 'غير محدد'}` });
    });

    // 8. Expenses
    expenses.forEach((e: any) => {
        const number = e.receiptNumber || `م-${String(e.id).slice(-4)}`;
        const cashAccountName = getCashAccountName(e.paidFromAccountId);

        entries.push({ id: `exp-debit-${e.id}`, date: e.date, warehouseId: e.warehouseId, number, description: e.description || '', debit: Number(e.amount) - (Number(e.taxAmount) || 0), credit: 0, account: e.expenseType || 'مصروفات متنوعة' });
        if (Number(e.taxAmount) > 0) {
            entries.push({ id: `exp-tax-${e.id}`, date: e.date, warehouseId: e.warehouseId, number, description: `ضريبة مدخلات مصروف ${number}`, debit: Number(e.taxAmount), credit: 0, account: 'ضريبة القيمة المضافة' });
        }

        if (e.status !== 'pending') {
            entries.push({ id: `exp-credit-${e.id}`, date: e.date, warehouseId: e.warehouseId, number, description: `دفع مصروف ${number} من ${cashAccountName}`, debit: 0, credit: Number(e.amount), account: cashAccountName });
        } else {
            entries.push({ id: `exp-accrued-${e.id}`, date: e.date, warehouseId: e.warehouseId, number, description: `مصروف مستحق ${number}`, debit: 0, credit: Number(e.amount), account: 'مصروفات مستحقة' });
        }
    });

    // 9. Exceptional Incomes
    exceptionalIncomes.forEach((i: any) => {
        const number = i.receiptNumber || `إ-س-${String(i.id).slice(-4)}`;
        const cashAccountName = getCashAccountName(i.paidToAccountId);
        entries.push({ id: `inc-debit-${i.id}`, date: i.date, warehouseId: i.warehouseId, number, description: i.description || '', debit: Number(i.amount), credit: 0, account: cashAccountName });
        entries.push({ id: `inc-credit-${i.id}`, date: i.date, warehouseId: i.warehouseId, number, description: `دخل متنوع: ${i.description || ''}`, debit: 0, credit: Number(i.amount), account: 'إيرادات متنوعة' });
    });

    // 10. Treasury Transactions
    treasuryTransactions.forEach((tx: any) => {
        const number = tx.receiptNumber || `ح-خ-${String(tx.id).slice(-4)}`;
        const account = getCashAccount(tx.accountId);
        const accountName = account?.name || 'النقدية/البنك';
        if (!tx.linkedTransaction) {
            if (tx.type === 'deposit') {
                entries.push({ id: `tx-dep-debit-${tx.id}`, date: tx.date, warehouseId: account?.warehouseId, number, description: `إيداع: ${tx.description || ''}`, debit: Number(tx.amount), credit: 0, account: accountName });
                entries.push({ id: `tx-dep-credit-${tx.id}`, date: tx.date, warehouseId: account?.warehouseId, number, description: `إيداع رأس مال: ${tx.description || ''}`, debit: 0, credit: Number(tx.amount), account: 'رأس المال' });
            } else {
                entries.push({ id: `tx-wit-debit-${tx.id}`, date: tx.date, warehouseId: account?.warehouseId, number, description: `سحب: ${tx.description || ''}`, debit: Number(tx.amount), credit: 0, account: 'مسحوبات الشركاء' });
                entries.push({ id: `tx-wit-credit-${tx.id}`, date: tx.date, warehouseId: account?.warehouseId, number, description: `سحب نقدي: ${tx.description || ''}`, debit: 0, credit: Number(tx.amount), account: accountName });
            }
        }
    });

    // 11. Customer Payments
    customerPayments.forEach((p: any) => {
        const number = p.receiptNumber || `س-ع-${String(p.id).slice(-4)}`;
        const account = getCashAccount(p.paidToAccountId);
        const accountName = account?.name || 'النقدية/البنك';
        const whId = account?.warehouseId;
        entries.push({ id: `cust-pay-debit-${p.id}`, date: p.date, warehouseId: whId, number, description: `تحصيل من العميل ${getCustomerName(p.customerId)} - سند ${number}`, debit: Number(p.amount), credit: 0, account: accountName });
        entries.push({ id: `cust-pay-credit-${p.id}`, date: p.date, warehouseId: whId, number, description: `تخفيض مديونية العميل للسند ${number}`, debit: 0, credit: Number(p.amount), account: 'حسابات العملاء' });
    });

    // 12. Supplier Payments
    supplierPayments.forEach((p: any) => {
        const number = p.receiptNumber || `س-م-${String(p.id).slice(-4)}`;
        const account = getCashAccount(p.paidFromAccountId);
        const accountName = account?.name || 'النقدية/البنك';
        const whId = account?.warehouseId;
        entries.push({ id: `supp-pay-debit-${p.id}`, date: p.date, warehouseId: whId, number, description: `سداد للمورد ${getSupplierName(p.supplierId)} - سند ${number}`, debit: Number(p.amount), credit: 0, account: 'حسابات الموردين' });
        entries.push({ id: `supp-pay-credit-${p.id}`, date: p.date, warehouseId: whId, number, description: `دفع من ${accountName} للسند ${number}`, debit: 0, credit: Number(p.amount), account: accountName });
    });

    // 13. Payroll Records
    payrollRecords?.forEach((pr: any) => {
        const number = pr.receiptNumber || `رواتب-${String(pr.id).slice(-4)}`;
        const cashAccName = getCashAccountName(pr.paidFromAccountId);
        const totalNet = (pr.payrollData || []).reduce((sum: number, p: any) => sum + (Number(p.netSalary) || 0), 0);

        entries.push({ id: `pay-debit-${pr.id}`, date: pr.date, number, description: `رواتب شهر ${pr.month}`, debit: totalNet, credit: 0, account: 'مصروفات رواتب' });
        entries.push({ id: `pay-credit-${pr.id}`, date: pr.date, number, description: `صرف رواتب شهر ${pr.month} من ${cashAccName}`, debit: 0, credit: totalNet, account: cashAccName });
    });

    // 14. Profit Distributions
    profitDistributions?.forEach((pd: any) => {
        const number = pd.receiptNumber || `ت-أ-${String(pd.id).slice(-4)}`;
        const cashAccName = getCashAccountName(pd.paidFromAccountId);
        entries.push({ id: `dist-debit-${pd.id}`, date: pd.date, number, description: `توزيع أرباح للشريك ${getPartnerName(pd.partnerId)}`, debit: Number(pd.amount), credit: 0, account: 'مسحوبات الشركاء' });
        entries.push({ id: `dist-credit-${pd.id}`, date: pd.date, number, description: `صرف أرباح شريك من ${cashAccName}`, debit: 0, credit: Number(pd.amount), account: cashAccName });
    });

    // 15. Stock Transfers
    stockTransferRecords?.forEach((st: any) => {
        const number = st.receiptNumber || `إذ-ت-${String(st.id).slice(-4)}`;
        const fromWh = getWarehouse(st.fromSourceId);
        const toWh = getWarehouse(st.toSourceId);
        const totalCost = (st.items || []).reduce((acc: number, i: any) => acc + (Number(i.qty || 0) * (Number(i.cost) || 0)), 0);

        if (totalCost > 0) {
            entries.push({ id: `st-debit-${st.id}`, date: st.date, number, description: `تحويل مخزني إلى ${toWh?.name || ''}`, debit: totalCost, credit: 0, account: `مخزون - ${toWh?.name || 'غير محدد'}` });
            entries.push({ id: `st-credit-${st.id}`, date: st.date, number, description: `تحويل مخزني من ${fromWh?.name || ''}`, debit: 0, credit: totalCost, account: `مخزون - ${fromWh?.name || 'غير محدد'}` });
        }
    });

    // 16. Stock Adjustments
    stockAdjustmentRecords?.forEach((adj: any) => {
        const number = adj.receiptNumber || `ت-ج-${String(adj.id).slice(-4)}`;
        const warehouse = getWarehouse(adj.warehouseId);
        let totalSurplus = 0;
        let totalDeficit = 0;
        (adj.items || []).forEach((item: any) => {
            const cost = Number(item.cost) || Number(itemsMap.get(item.itemId)?.cost) || 0;
            const val = Number(item.difference || 0) * cost;
            if (val > 0) totalSurplus += val; else totalDeficit += Math.abs(val);
        });
        if (totalSurplus > 0) {
            entries.push({ id: `adj-sur-${adj.id}`, date: adj.date, warehouseId: adj.warehouseId, number, description: `تسوية جرد (زيادة) في ${warehouse?.name || ''}`, debit: totalSurplus, credit: 0, account: `مخزون - ${warehouse?.name || 'غير محدد'}` });
            entries.push({ id: `adj-sur-cr-${adj.id}`, date: adj.date, warehouseId: adj.warehouseId, number, description: `أرباح تسوية مخزون ${number}`, debit: 0, credit: totalSurplus, account: 'أرباح تسوية المخزون' });
        }
        if (totalDeficit > 0) {
            entries.push({ id: `adj-def-${adj.id}`, date: adj.date, warehouseId: adj.warehouseId, number, description: `خسائر تسوية مخزون ${number}`, debit: totalDeficit, credit: 0, account: 'خسائر تسوية المخزون' });
            entries.push({ id: `adj-def-cr-${adj.id}`, date: adj.date, warehouseId: adj.warehouseId, number, description: `تسوية جرد (عجز) في ${warehouse?.name || ''}`, debit: 0, credit: totalDeficit, account: `مخزون - ${warehouse?.name || 'غير محدد'}` });
        }
    });

    // 17. Fixed Assets Depreciation
    depreciationRecords?.forEach((dr: any) => {
        const number = `إهلاك-${String(dr.id).slice(-4)}`;
        const asset = fixedAssets.find((a: any) => a.id === dr.assetId);
        entries.push({ id: `dep-debit-${dr.id}`, date: dr.date, number, description: `إهلاك أصل ثابت: ${asset?.name || ''}`, debit: Number(dr.amount), credit: 0, account: 'مصروف الإهلاك' });
        entries.push({ id: `dep-credit-${dr.id}`, date: dr.date, number, description: `مجمع إهلاك: ${asset?.name || ''}`, debit: 0, credit: Number(dr.amount), account: 'مجمع الإهلاك' });
    });

    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
