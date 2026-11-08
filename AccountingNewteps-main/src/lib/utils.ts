

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// دالة مساعدة لدمج وتنسيق أسماء الفئات (classes) في Tailwind CSS بشكل شرطي
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2
  }).format(amount);
}


/**
 * دالة مساعدة لإنشاء رابط صحيح لصفحة تفاصيل إيصال معين بناءً على نوعه ورقمه.
 * @param receiptNumber - رقم الإيصال الذي قد يحتوي على بادئة مميزة (e.g., 'إذ-د-').
 * @param id - المعرف الفريد (ID) للسجل.
 * @param type - نوع الحركة (e.g., 'in', 'out', 'transfer').
 * @param saleInvoiceId - معرف فاتورة البيع (إذا كان الإذن مرتبطًا بواحدة).
 * @returns سلسلة نصية تحتوي على المسار الصحيح (URL).
 */
export function getLinkForReceipt(receiptNumber?: string, id?: string, type?: string): string {
    if (!id) return '#'; // If no ID, no link
    
    // Fallback to receiptNumber if it exists
    const finalReceipt = receiptNumber || `ID-${id}`;

    const prefixes: Record<string, string> = {
        'ف-ب-': `/sales/invoices/list`, // Requires more logic to find specific invoice
        'ف-ش-': `/purchases/invoices/list`,
        'م-ب-': `/sales/returns`,
        'م-ش-': `/purchases/returns/list`, // Changed to list view
        'إذ-د-': `/inventory/stock-in/${id}`,
        'إذ-خ-': `/inventory/stock-out/${id}`,
        'إذ-ت-': `/inventory/transfer/${id}`,
        'ت-م-': `/inventory/adjustment/${id}`, 
        'ص-م-': `/sales/issue-to-rep/${id}`,
        'م-ع-': `/sales/return-from-rep/${id}`,
        'POS-': `/reports/pos-reports`,
        'س-ع-': `/accounting/customer-payments`,
        'س-م-': `/accounting/supplier-payments`,
        'م-': `/accounting/expenses`,
        'إ-س-': `/accounting/exceptional-income`,
        'ت-أ-': `/accounting/profit-distribution`,
        'ح-خ-': `/accounting/treasury`,
        'رواتب-': `/hr/payroll`,
    };

    // البحث عن البادئة في رقم الإيصال وإرجاع المسار المطابق
    for (const prefix in prefixes) {
        if (finalReceipt.startsWith(prefix)) {
            return prefixes[prefix];
        }
    }
    return '#'; // رابط احتياطي للبادئات غير المعروفة
}
