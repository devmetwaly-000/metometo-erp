
"use client";

/**
 * @fileOverview محرك حسابات مركزي لحساب أرصدة الحسابات النقدية
 */

export const calculateAccountBalance = (account: any, allData: any): number => {
    const {
        customerPayments = [],
        salesInvoices = [],
        posSales = [],
        exceptionalIncomes = [],
        treasuryTransactions = [],
        purchaseReturns = [],
        repRemittances = [],
        expenses = [],
        supplierPayments = [],
        purchaseInvoices = [],
        employeeAdvances = [],
        profitDistributions = [],
        payrollRecords = [],
        salesReturns = [],
        posReturns = [],
        gratuityDistributions = []
    } = allData;

    if (!account) return 0;

    let balance = Number(account.openingBalance) || 0;

    // --- الوارد (INFLOWS +) ---
    
    // 1. مقبوضات العملاء
    customerPayments.filter((p: any) => p.paidToAccountId === account.id).forEach((p: any) => balance += Number(p.amount) || 0);
    
    // 2. نقدية مبيعات الفواتير (الجزء المدفوع لحظياً)
    const processedSaleIds = new Set<string>();
    salesInvoices.filter((s: any) => (s.status === 'approved' || s.status === 'completed' || !s.status) && s.paidToAccountId === account.id).forEach((s: any) => {
        if (s.id) processedSaleIds.add(s.id);
        const linkedPaymentsTotal = customerPayments.filter((p: any) => p.invoiceId === s.id).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
        const initialCash = (Number(s.paidAmount) || 0) - linkedPaymentsTotal;
        if (initialCash > 0) balance += initialCash;
    });

    // 3. نقدية مبيعات الكاشير (POS) - في حال لم يتم تحديد الحساب صراحة ولكن نقطة البيع مرتبطة بفرع/خزينة
    posSales.forEach((s: any) => {
        if (s.id && processedSaleIds.has(s.id)) return;
        const targetId = s.paidToAccountId || (account.warehouseId && s.warehouseId === account.warehouseId ? account.id : null);
        if (targetId === account.id) {
            if (s.id) processedSaleIds.add(s.id);
            const linkedPaymentsTotal = customerPayments.filter((p: any) => p.invoiceId === s.id).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
            const initialCash = (Number(s.paidAmount) || 0) - linkedPaymentsTotal;
            if (initialCash > 0) balance += initialCash;
        }
    });

    // 4. الدخل الاستثنائي
    exceptionalIncomes.filter((i: any) => i.paidToAccountId === account.id).forEach((i: any) => balance += Number(i.amount) || 0);
    
    // 5. إيداعات الخزينة (زيادة رأس مال / تحويل داخلي وارد)
    treasuryTransactions.filter((tx: any) => tx.accountId === account.id && tx.type === 'deposit' && !tx.linkedTransaction).forEach((tx: any) => balance += Number(tx.amount) || 0);
    
    // 6. مستردات مرتجع الشراء (نقدياً)
    purchaseReturns.filter((r: any) => r.paidToAccountId === account.id).forEach((r: any) => balance += (Number(r.paidAmount) || 0));
    
    // 7. توريدات المناديب (Inward to Main Account)
    repRemittances.filter((rem: any) => rem.toAccountId === account.id).forEach((rem: any) => balance += Number(rem.amount) || 0);

    // --- الصادر (OUTFLOWS -) ---
    
    // 8. المصروفات (المدفوعة فقط)
    expenses.filter((ex: any) => ex.paidFromAccountId === account.id && ex.status !== 'pending').forEach((ex: any) => balance -= Number(ex.amount) || 0);
    
    // 9. مدفوعات الموردين (سندات الصرف)
    supplierPayments.filter((p: any) => p.paidFromAccountId === account.id).forEach((p: any) => balance -= Number(p.amount) || 0);

    // 10. نقدية مشتريات الفواتير (الجزء المدفوع لحظياً)
    purchaseInvoices.filter((p: any) => p.paidFromAccountId === account.id).forEach((p: any) => {
        const linkedPaymentsTotal = supplierPayments.filter((sp: any) => sp.invoiceId === p.id).reduce((sum: number, sp: any) => sum + (Number(sp.amount) || 0), 0);
        const initialPaid = (Number(p.paidAmount) || 0) - linkedPaymentsTotal;
        if (initialPaid > 0) balance -= initialPaid;
    });

    // 11. سلف الموظفين
    employeeAdvances.filter((ea: any) => ea.paidFromAccountId === account.id).forEach((ea: any) => balance -= Number(ea.amount) || 0);
    
    // 12. توزيعات الأرباح
    profitDistributions.filter((pd: any) => pd.paidFromAccountId === account.id).forEach((pd: any) => balance -= Number(pd.amount) || 0);
    
    // 13. مسحوبات الخزينة (مسحوبات شركاء / تحويل داخلي صادر)
    treasuryTransactions.filter((tx: any) => tx.accountId === account.id && tx.type === 'withdrawal' && !tx.linkedTransaction).forEach((tx: any) => balance -= Number(tx.amount) || 0);
    
    // 14. الرواتب (الصافي المدفوع)
    payrollRecords.filter((pr: any) => pr.paidFromAccountId === account.id).forEach((pr: any) => {
        balance -= (pr.payrollData || []).reduce((sum: number, p: any) => sum + (Number(p.netSalary) || 0), 0);
    });

    // 15. مستردات مرتجع المبيعات (نقدياً من الفواتير)
    const processedReturnIds = new Set<string>();
    salesReturns.filter((r: any) => r.paidFromAccountId === account.id).forEach((r: any) => {
        if (r.id) processedReturnIds.add(r.id);
        balance -= (Number(r.paidAmount) || 0);
    });
    
    // 16. مستردات مرتجع الكاشير (نقدياً من نقاط البيع)
    posReturns.forEach((r: any) => {
        if (r.id && processedReturnIds.has(r.id)) return;
        if (account.warehouseId && r.warehouseId === account.warehouseId && (Number(r.paidAmount) || 0) > 0) {
            balance -= Number(r.paidAmount);
        }
    });
    
    // 17. توريدات المناديب (Outward from Rep Custody)
    repRemittances.filter((rem: any) => rem.fromAccountId === account.id).forEach((rem: any) => balance -= Number(rem.amount) || 0);

    return balance;
};

/**
 * فحص دقيق وشامل عما إذا كان الحساب النقدي هو "عهدة مندوب"
 */
export const isRepCustodyAccount = (account: any): boolean => {
    if (!account) return false;
    if (account.salesRepId || account.userId) return true;
    if (account.type === 'custody') return true;
    if (typeof account.name === 'string') {
        const trimmed = account.name.trim();
        if (
            trimmed.startsWith('عهدة:') ||
            trimmed.startsWith('عهدة :') ||
            trimmed.startsWith('عهدة ') ||
            trimmed.includes('عهدة مندوب') ||
            trimmed.includes('خزينة المندوب') ||
            trimmed.includes('عهدة:')
        ) {
            return true;
        }
    }
    return false;
};

/**
 * الحصول على الخزائن العامة والحسابات البنكية للمنشأة/الفروع مع استبعاد عهد المناديب
 */
export const getGeneralCashAccounts = (cashAccounts: any[] = []): any[] => {
    return cashAccounts.filter(acc => !isRepCustodyAccount(acc));
};

/**
 * الحصول على حسابات عهد المناديب فقط
 */
export const getRepCustodyAccounts = (cashAccounts: any[] = []): any[] => {
    return cashAccounts.filter(acc => isRepCustodyAccount(acc));
};

/**
 * الحصول على حساب عهدة مندوب محدد بواسطة معرف المندوب
 */
export const getRepCashAccount = (repId: string, cashAccounts: any[] = []): any | undefined => {
    if (!repId) return undefined;
    return cashAccounts.find(acc => acc.userId === repId || acc.salesRepId === repId);
};

