
"use client";

// استيراد المكونات والأدوات اللازمة
import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Loader2, BookOpen, List, History, ArrowRight, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useData } from '@/contexts/data-provider';
import { Combobox } from '@/components/ui/combobox';
import { getLinkForReceipt } from "@/lib/utils";
import { useAuth } from '@/contexts/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';


// تعريف واجهات البيانات (Interfaces)
interface JournalEntry {
  id: string;
  date: string;
  warehouseId?: string;
  number: string;
  description: string;
  debit: number;
  credit: number;
  account: string;
}

interface GroupedJournalEntry {
    number: string;
    date: string;
    description: string;
    debits: { account: string; amount: number }[];
    credits: { account: string; amount: number }[];
    total: number;
}


export default function JournalPage() {
    const { user } = useAuth();
    const [filters, setFilters] = useState({
        warehouseId: user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all') ? user.warehouseIds[0] : 'all',
        fromDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        toDate: new Date().toISOString().split('T')[0]
    });

    const [activeView, setActiveTab] = useState("detailed-view");
    const [selectedAccountForLedger, setSelectedAccountForLedger] = useState<string | null>(null);

    const {
        salesInvoices, purchaseInvoices, expenses, exceptionalIncomes, warehouses,
        stockTransferRecords, items: itemsData, cashAccounts,
        treasuryTransactions, employeeAdvances, employees,
        employeeAdjustments, salesReturns, purchaseReturns, customers,
        suppliers, supplierPayments, customerPayments, stockOutRecords,
        profitDistributions, partners, payrollRecords, stockInRecords,
        stockIssuesToReps, stockReturnsFromReps, stockAdjustmentRecords,
        deliveryStaff, fixedAssets, depreciationRecords, posSales, posReturns, loading,
        users, settings
    } = useData();

    const itemsMap = useMemo(() => {
        const map = new Map();
        itemsData.forEach((item: any) => map.set(item.id, item));
        return map;
    }, [itemsData]);

    const journalEntries = useMemo(() => {
        const entries: JournalEntry[] = [];
        const getWarehouse = (id?: string) => warehouses.find((w: any) => w.id === id);
        const getCashAccount = (id?: string) => cashAccounts.find((c: any) => c.id === id);
        const getCashAccountName = (id?: string) => getCashAccount(id)?.name || 'النقدية/البنك';
        const getEmployeeName = (id?: string) => employees.find((e: any) => e.id === id)?.name || 'موظف غير معروف';
        const getCustomerName = (id?: string) => customers.find((c: any) => c.id === id)?.name || 'عميل غير معروف';
        const getSupplierName = (id?: string) => suppliers.find((s: any) => s.id === id)?.name || 'مورد غير معروف';
        const getPartnerName = (id?: string) => partners.find((p: any) => p.id === id)?.name || 'شريك غير معروف';
        
        const fiscalYearStart = settings?.main?.financial?.fiscalYearStart || '2024-01-01';

        // --- Opening Balances (The missing piece for accurate General Ledger) ---
        
        // 1. Customers OB
        const totalCustomerOB = customers.reduce((sum: number, c: any) => sum + (Number(c.openingBalance) || 0), 0);
        if (totalCustomerOB > 0) {
            entries.push({ id: 'ob-ar-dr', date: fiscalYearStart, number: 'OB-001', description: 'إجمالي الأرصدة الافتتاحية للعملاء (مدين)', debit: totalCustomerOB, credit: 0, account: 'حسابات العملاء' });
            entries.push({ id: 'ob-ar-cr', date: fiscalYearStart, number: 'OB-001', description: 'رصيد افتتاحي مقابل للعملاء', debit: 0, credit: totalCustomerOB, account: 'رأس المال / أرصدة افتتاحية' });
        }

        // 2. Suppliers OB
        const totalSupplierOB = suppliers.reduce((sum: number, s: any) => sum + (Number(s.openingBalance) || 0), 0);
        if (totalSupplierOB > 0) {
            entries.push({ id: 'ob-ap-cr', date: fiscalYearStart, number: 'OB-002', description: 'إجمالي الأرصدة الافتتاحية للموردين (دائن)', debit: 0, credit: totalSupplierOB, account: 'حسابات الموردين' });
            entries.push({ id: 'ob-ap-dr', date: fiscalYearStart, number: 'OB-002', description: 'رصيد افتتاحي مقابل للموردين', debit: totalSupplierOB, credit: 0, account: 'رأس المال / أرصدة افتتاحية' });
        }

        // 3. Cash Accounts OB
        cashAccounts.forEach((acc: any) => {
            if (acc.openingBalance > 0) {
                entries.push({ id: `ob-cash-${acc.id}-dr`, date: fiscalYearStart, number: 'OB-003', warehouseId: acc.warehouseId, description: `رصيد افتتاحي: ${acc.name}`, debit: acc.openingBalance, credit: 0, account: acc.name });
                entries.push({ id: `ob-cash-${acc.id}-cr`, date: fiscalYearStart, number: 'OB-003', warehouseId: acc.warehouseId, description: `رصيد افتتاحي مقابل: ${acc.name}`, debit: 0, credit: acc.openingBalance, account: 'رأس المال / أرصدة افتتاحية' });
            }
        });

        // --- Sales (Standard Invoices + POS) ---
        const validSales = salesInvoices.filter((s: any) => s.status === 'approved' || s.status === 'completed' || !s.status);
        const processedSaleIds = new Set(validSales.map((s: any) => s.id));
        const standalonePos = (posSales || []).filter((s: any) => !processedSaleIds.has(s.id));
        const allSales = [...validSales, ...standalonePos];
        allSales.forEach((sale: any) => {
            const totalBeforeDiscount = sale.subtotal || (sale.total + (sale.discount || 0));
            const number = sale.invoiceNumber || `ف-ب-${sale.id.slice(-4)}`;
            const amountDue = sale.total - (sale.paidAmount || 0);
            const cashAccName = getCashAccountName(sale.paidToAccountId);

            if (sale.paidAmount && sale.paidAmount > 0) {
                 entries.push({ id: `sale-cash-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number: number, description: `فاتورة بيع ${number} للعميل ${sale.customerName}`, debit: sale.paidAmount, credit: 0, account: cashAccName });
            }
             if (amountDue > 0.01) {
                 entries.push({ id: `sale-ar-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number: number, description: `فاتورة بيع ${number} للعميل ${sale.customerName}`, debit: amountDue, credit: 0, account: 'حسابات العملاء' });
            }
            if (sale.discount > 0) {
                 entries.push({ id: `sale-discount-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number: number, description: `خصم مسموح به على فاتورة بيع ${number}`, debit: sale.discount, credit: 0, account: 'خصم مسموح به' });
            }
            if (sale.taxAmount > 0) {
                 entries.push({ id: `sale-tax-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number: number, description: `ضريبة القيمة المضافة على مبيعات ${number}`, debit: 0, credit: sale.taxAmount, account: 'ضريبة القيمة المضافة' });
            }
            
            const revenueNetOfTax = totalBeforeDiscount - (sale.taxAmount || 0);
            entries.push({ id: `sale-rev-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number: number, description: `إيرادات مبيعات ${number}`, debit: 0, credit: revenueNetOfTax, account: 'إيرادات المبيعات' });
            
            const cogs = sale.items.reduce((acc, i) => acc + (i.qty * (i.cost || 0)), 0);
            const inventoryAccount = sale.salesRepId ? 'مخزون بعهدة المندوب' : `مخزون - ${getWarehouse(sale.warehouseId)?.name || 'غير محدد'}`;
            if (cogs > 0) {
                 entries.push({ id: `sale-cogs-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number: number, description: `تكلفة بضاعة مباعة ${number}`, debit: cogs, credit: 0, account: 'تكلفة البضاعة المباعة' });
                 entries.push({ id: `sale-inv-credit-${sale.id}`, date: sale.date, warehouseId: sale.warehouseId, number: number, description: `صرف من المخزون لفاتورة ${number}`, debit: 0, credit: cogs, account: inventoryAccount });
            }
        });

        // --- Sales Returns ---
        const processedReturnIds = new Set(salesReturns.map((r: any) => r.id));
        const standalonePosReturns = (posReturns || []).filter((r: any) => !processedReturnIds.has(r.id));
        const allReturns = [...salesReturns, ...standalonePosReturns];
        allReturns.forEach((ret: any) => {
            const number = ret.receiptNumber || `م-ب-${ret.id.slice(-4)}`;
            const cashAccName = getCashAccountName(ret.paidFromAccountId || (ret.warehouseId ? getCashAccount(warehouses.find(w => w.id === ret.warehouseId)?.id)?.id : undefined));
            
            entries.push({ id: `ret-rev-${ret.id}`, date: ret.date, warehouseId: ret.warehouseId, number: number, description: `مرتجع مبيعات ${number} من ${ret.customerName || 'عميل كاشير'}`, debit: ret.total, credit: 0, account: 'إيرادات المبيعات' });
            
            if (ret.paidAmount && ret.paidAmount > 0) {
                entries.push({ id: `ret-cash-${ret.id}`, date: ret.date, warehouseId: ret.warehouseId, number: number, description: `رد نقدي لمرتجع ${number}`, debit: 0, credit: ret.paidAmount, account: cashAccName });
            }
            
            const amountAddedToBalance = ret.total - (ret.paidAmount || 0);
            if (amountAddedToBalance > 0.01) {
                entries.push({ id: `ret-ar-${ret.id}`, date: ret.date, warehouseId: ret.warehouseId, number: number, description: `تخفيض مديونية عميل لمرتجع ${number}`, debit: 0, credit: amountAddedToBalance, account: 'حسابات العملاء' });
            }

            const returnedCogs = ret.items.reduce((acc, i) => acc + (i.qty * (i.cost || 0)), 0);
            const inventoryAccount = `مخزون - ${getWarehouse(ret.warehouseId)?.name || 'غير محدد'}`;
            if (returnedCogs > 0) {
                entries.push({ id: `ret-inv-${ret.id}`, date: ret.date, warehouseId: ret.warehouseId, number: number, description: `إعادة للمخزون لمرتجع ${number}`, debit: returnedCogs, credit: 0, account: inventoryAccount });
                entries.push({ id: `ret-cogs-${ret.id}`, date: ret.date, warehouseId: ret.warehouseId, number: number, description: `تخفيض تكلفة البضاعة لمرتجع ${number}`, debit: 0, credit: returnedCogs, account: 'تكلفة البضاعة المباعة' });
            }
        });

        // --- Purchase Invoices ---
        purchaseInvoices.forEach((p: any) => {
             const number = p.invoiceNumber || `ف-ش-${p.id.slice(-4)}`;
             const warehouse = getWarehouse(p.warehouseId);
             const amountDue = p.total - (p.paidAmount || 0);
             const purchaseCost = p.items.reduce((acc, item) => acc + (item.qty * (item.cost || 0)), 0);
             const cashAccName = getCashAccountName(p.paidFromAccountId);

             entries.push({ id: `pur-inv-debit-${p.id}`, date: p.date, warehouseId: p.warehouseId, number: number, description: `مشتريات لصالح مخزن ${warehouse?.name}`, debit: purchaseCost, credit: 0, account: `مخزون - ${warehouse?.name || 'غير محدد'}` });

            if (p.paidAmount && p.paidAmount > 0) {
                 entries.push({ id: `pur-cash-${p.id}`, date: p.date, warehouseId: p.warehouseId, number: number, description: `دفع للمورد ${p.supplierName} للفاتورة ${number}`, debit: 0, credit: p.paidAmount, account: cashAccName });
            }
            if (amountDue > 0.01) {
                 entries.push({ id: `pur-ap-${p.id}`, date: p.date, warehouseId: p.warehouseId, number: number, description: `مستحقات للمورد ${p.supplierName} للفاتورة ${number}`, debit: 0, credit: amountDue, account: 'حسابات الموردين' });
            }
            if (p.discount > 0) {
                 entries.push({ id: `pur-discount-${p.id}`, date: p.date, warehouseId: p.warehouseId, number: number, description: `خصم مكتسب على فاتورة شراء ${number}`, debit: 0, credit: p.discount, account: 'خصم مكتسب' });
            }
            if (p.tax > 0) {
                entries.push({ id: `pur-tax-${p.id}`, date: p.date, warehouseId: p.warehouseId, number: number, description: `ضريبة مدخلات للفاتورة ${number}`, debit: p.tax, credit: 0, account: 'ضريبة القيمة المضافة' });
            }
        });
        
        // --- Purchase Returns ---
        purchaseReturns.forEach((pr: any) => {
            const number = pr.receiptNumber || `م-ش-${pr.id.slice(-4)}`;
            const warehouse = getWarehouse(pr.warehouseId);
            const cashAccName = getCashAccountName(pr.paidToAccountId);
            const returnedValue = pr.total;

            if (pr.paidAmount && pr.paidAmount > 0) {
                entries.push({ id: `pr-cash-${pr.id}`, date: pr.date, warehouseId: pr.warehouseId, number: number, description: `استلام نقدي لمرتجع شراء ${number}`, debit: pr.paidAmount, credit: 0, account: cashAccName });
            }
            const debtReduction = pr.total - (pr.paidAmount || 0);
            if (debtReduction > 0.01) {
                entries.push({ id: `pr-ap-${pr.id}`, date: pr.date, warehouseId: pr.warehouseId, number: number, description: `تخفيض مديونية مورد لمرتجع ${number}`, debit: debtReduction, credit: 0, account: 'حسابات الموردين' });
            }
            entries.push({ id: `pr-inv-${pr.id}`, date: pr.date, warehouseId: pr.warehouseId, number: number, description: `صرف من المخزون لمرتجع ${number}`, debit: 0, credit: returnedValue, account: `مخزون - ${warehouse?.name || 'غير محدد'}` });
        });

        // --- Expenses ---
        expenses.forEach((e: any) => {
            const number = e.receiptNumber || `م-${e.id.slice(-4)}`;
            const cashAccountName = getCashAccountName(e.paidFromAccountId);
            
            entries.push({ id: `exp-debit-${e.id}`, date: e.date, warehouseId: e.warehouseId, number: number, description: e.description, debit: e.amount - (e.taxAmount || 0), credit: 0, account: e.expenseType });
            if (e.taxAmount > 0) {
                entries.push({ id: `exp-tax-${e.id}`, date: e.date, warehouseId: e.warehouseId, number: number, description: `ضريبة مدخلات مصروف ${number}`, debit: e.taxAmount, credit: 0, account: 'ضريبة القيمة المضافة' });
            }
            
            if (e.status !== 'pending') {
                entries.push({ id: `exp-credit-${e.id}`, date: e.date, warehouseId: e.warehouseId, number: number, description: `دفع مصروف ${number} من ${cashAccountName}`, debit: 0, credit: e.amount, account: cashAccountName });
            } else {
                entries.push({ id: `exp-accrued-${e.id}`, date: e.date, warehouseId: e.warehouseId, number: number, description: `مصروف مستحق ${number}`, debit: 0, credit: e.amount, account: 'مصروفات مستحقة' });
            }
        });

        // --- Exceptional Incomes ---
        exceptionalIncomes.forEach((i: any) => {
            const number = i.receiptNumber || `إ-س-${i.id.slice(-4)}`;
            const cashAccountName = getCashAccountName(i.paidToAccountId);
            entries.push({ id: `inc-debit-${i.id}`, date: i.date, warehouseId: i.warehouseId, number: number, description: i.description, debit: i.amount, credit: 0, account: cashAccountName });
            entries.push({ id: `inc-credit-${i.id}`, date: i.date, warehouseId: i.warehouseId, number: number, description: `دخل متنوع: ${i.description}`, debit: 0, credit: i.amount, account: 'إيرادات متنوعة' });
        });

        // --- Treasury Transactions (Capital/Partners) ---
        treasuryTransactions.forEach((tx: any) => {
            const number = tx.receiptNumber || `ح-خ-${tx.id.slice(-4)}`;
            const account = getCashAccount(tx.accountId);
            const accountName = account?.name || 'النقدية/البنك';
            if (!tx.linkedTransaction) {
                if (tx.type === 'deposit') {
                    entries.push({ id: `tx-dep-debit-${tx.id}`, date: tx.date, warehouseId: account?.warehouseId, number: number, description: `إيداع: ${tx.description}`, debit: tx.amount, credit: 0, account: accountName });
                    entries.push({ id: `tx-dep-credit-${tx.id}`, date: tx.date, warehouseId: account?.warehouseId, number: number, description: `إيداع رأس مال: ${tx.description}`, debit: 0, credit: tx.amount, account: 'رأس المال' });
                } else {
                     entries.push({ id: `tx-wit-debit-${tx.id}`, date: tx.date, warehouseId: account?.warehouseId, number: number, description: `سحب: ${tx.description}`, debit: tx.amount, credit: 0, account: 'مسحوبات الشركاء' });
                     entries.push({ id: `tx-wit-credit-${tx.id}`, date: tx.date, warehouseId: account?.warehouseId, number: number, description: `سحب نقدي: ${tx.description}`, debit: 0, credit: tx.amount, account: accountName });
                }
            }
        });

        // --- Customer Payments ---
        customerPayments.forEach((p: any) => {
            const number = p.receiptNumber || `س-ع-${p.id.slice(-4)}`;
            const account = getCashAccount(p.paidToAccountId);
            const accountName = account?.name || 'النقدية/البنك';
            const whId = account?.warehouseId;
            entries.push({ id: `cust-pay-debit-${p.id}`, date: p.date, warehouseId: whId, number: number, description: `تحصيل من العميل ${getCustomerName(p.customerId)} - سند ${number}`, debit: p.amount, credit: 0, account: accountName });
            entries.push({ id: `cust-pay-credit-${p.id}`, date: p.date, warehouseId: whId, number: number, description: `تخفيض مديونية العميل للسند ${number}`, debit: 0, credit: p.amount, account: 'حسابات العملاء' });
        });

        // --- Supplier Payments ---
        supplierPayments.forEach((p: any) => {
            const number = p.receiptNumber || `س-م-${p.id.slice(-4)}`;
            const account = getCashAccount(p.paidFromAccountId);
            const accountName = account?.name || 'النقدية/البنك';
            const whId = account?.warehouseId;
            entries.push({ id: `supp-pay-debit-${p.id}`, date: p.date, warehouseId: whId, number: number, description: `سداد للمورد ${getSupplierName(p.supplierId)} - سند ${number}`, debit: p.amount, credit: 0, account: 'حسابات الموردين' });
            entries.push({ id: `supp-pay-credit-${p.id}`, date: p.date, warehouseId: whId, number: number, description: `دفع من ${accountName} للسند ${number}`, debit: 0, credit: p.amount, account: accountName });
        });

        // --- Payroll Records ---
        payrollRecords?.forEach((pr: any) => {
            const number = pr.receiptNumber || `رواتب-${pr.id.slice(-4)}`;
            const cashAccName = getCashAccountName(pr.paidFromAccountId);
            const totalNet = pr.payrollData.reduce((sum: number, p: any) => sum + p.netSalary, 0);
            
            entries.push({ id: `pay-debit-${pr.id}`, date: pr.date, number: number, description: `رواتب شهر ${pr.month}`, debit: totalNet, credit: 0, account: 'مصروفات رواتب' });
            entries.push({ id: `pay-credit-${pr.id}`, date: pr.date, number: number, description: `صرف رواتب شهر ${pr.month} من ${cashAccName}`, debit: 0, credit: totalNet, account: cashAccName });
        });

        // --- Profit Distributions ---
        profitDistributions?.forEach((pd: any) => {
            const number = pd.receiptNumber || `ت-أ-${pd.id.slice(-4)}`;
            const cashAccName = getCashAccountName(pd.paidFromAccountId);
            entries.push({ id: `dist-debit-${pd.id}`, date: pd.date, number: number, description: `توزيع أرباح للشريك ${getPartnerName(pd.partnerId)}`, debit: pd.amount, credit: 0, account: 'مسحوبات الشركاء' });
            entries.push({ id: `dist-credit-${pd.id}`, date: pd.date, number: number, description: `صرف أرباح شريك من ${cashAccName}`, debit: 0, credit: pd.amount, account: cashAccName });
        });

        // --- Stock Transfers ---
        stockTransferRecords?.forEach((st: any) => {
            const number = st.receiptNumber || `إذ-ت-${st.id.slice(-4)}`;
            const fromWh = getWarehouse(st.fromSourceId);
            const toWh = getWarehouse(st.toSourceId);
            const totalCost = st.items.reduce((acc, i) => acc + (i.qty * (i.cost || 0)), 0);
            
            if (totalCost > 0) {
                entries.push({ id: `st-debit-${st.id}`, date: st.date, number: number, description: `تحويل مخزني إلى ${toWh?.name}`, debit: totalCost, credit: 0, account: `مخزون - ${toWh?.name || 'غير محدد'}` });
                entries.push({ id: `st-credit-${st.id}`, date: st.date, number: number, description: `تحويل مخزني من ${fromWh?.name}`, debit: 0, credit: totalCost, account: `مخزون - ${fromWh?.name || 'غير محدد'}` });
            }
        });

        // --- Stock Adjustments ---
        stockAdjustmentRecords?.forEach((adj: any) => {
             const number = adj.receiptNumber || `ت-ج-${adj.id.slice(-4)}`;
             const warehouse = getWarehouse(adj.warehouseId);
             let totalSurplus = 0;
             let totalDeficit = 0;
             adj.items.forEach((item: any) => {
                 const cost = item.cost || itemsMap.get(item.itemId)?.cost || 0;
                 const val = item.difference * cost;
                 if (val > 0) totalSurplus += val; else totalDeficit += Math.abs(val);
             });
             if (totalSurplus > 0) {
                 entries.push({ id: `adj-sur-${adj.id}`, date: adj.date, warehouseId: adj.warehouseId, number, description: `تسوية جرد (زيادة) في ${warehouse?.name}`, debit: totalSurplus, credit: 0, account: `مخزون - ${warehouse?.name || 'غير محدد'}` });
                 entries.push({ id: `adj-sur-cr-${adj.id}`, date: adj.date, warehouseId: adj.warehouseId, number, description: `أرباح تسوية مخزون ${number}`, debit: 0, credit: totalSurplus, account: 'أرباح تسوية المخزون' });
             }
             if (totalDeficit > 0) {
                 entries.push({ id: `adj-def-${adj.id}`, date: adj.date, warehouseId: adj.warehouseId, number, description: `خسائر تسوية مخزون ${number}`, debit: totalDeficit, credit: 0, account: 'خسائر تسوية المخزون' });
                 entries.push({ id: `adj-def-cr-${adj.id}`, date: adj.date, warehouseId: adj.warehouseId, number, description: `تسوية جرد (عجز) في ${warehouse?.name}`, debit: 0, credit: totalDeficit, account: `مخزون - ${warehouse?.name || 'غير محدد'}` });
             }
        });

        // --- Depreciation Records ---
        depreciationRecords?.forEach((dr: any) => {
            const number = `إهلاك-${dr.id.slice(-4)}`;
            const asset = fixedAssets.find(a => a.id === dr.assetId);
            entries.push({ id: `dep-debit-${dr.id}`, date: dr.date, number, description: `إهلاك أصل ثابت: ${asset?.name || ''}`, debit: dr.amount, credit: 0, account: 'مصروف الإهلاك' });
            entries.push({ id: `dep-credit-${dr.id}`, date: dr.date, number, description: `مجمع إهلاك: ${asset?.name || ''}`, debit: 0, credit: dr.amount, account: 'مجمع الإهلاك' });
        });

        return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [salesInvoices, posSales, salesReturns, posReturns, purchaseInvoices, purchaseReturns, expenses, exceptionalIncomes, treasuryTransactions, customerPayments, supplierPayments, payrollRecords, profitDistributions, stockTransferRecords, stockAdjustmentRecords, depreciationRecords, warehouses, employees, customers, suppliers, partners, itemsMap, fixedAssets, users, settings]);

    const uniqueAccounts = useMemo(() => {
        const accs = new Set<string>();
        journalEntries.forEach(e => accs.add(e.account));
        return Array.from(accs).sort();
    }, [journalEntries]);

    const filteredEntries = useMemo(() => journalEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        const from = filters.fromDate ? new Date(filters.fromDate) : null;
        const to = filters.toDate ? new Date(filters.toDate) : null;
        if (from) from.setHours(0,0,0,0);
        if (to) to.setHours(23,59,59,999);

        if (from && entryDate < from) return false;
        if (to && entryDate > to) return false;
        if (filters.warehouseId && filters.warehouseId !== 'all' && entry.warehouseId !== filters.warehouseId && entry.warehouseId !== undefined) return false;

        return true;
    }), [journalEntries, filters]);

    const groupedEntries = useMemo((): GroupedJournalEntry[] => {
        const groups: { [key: string]: GroupedJournalEntry } = {};
        filteredEntries.forEach(entry => {
            if (!groups[entry.number]) {
                groups[entry.number] = { number: entry.number, date: entry.date, description: entry.description, debits: [], credits: [], total: 0 };
            }
            if (entry.debit > 0) {
                groups[entry.number].debits.push({ account: entry.account, amount: entry.debit });
                groups[entry.number].total += entry.debit;
            }
            if (entry.credit > 0) groups[entry.number].credits.push({ account: entry.account, amount: entry.credit });
        });
        return Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [filteredEntries]);

    const ledgerData = useMemo(() => {
        if (!selectedAccountForLedger) return [];
        let runningBalance = 0;
        
        // Step 1: Filter and sort CHRONOLOGICALLY (ascending) to calculate balance correctly
        return journalEntries
            .filter(e => e.account === selectedAccountForLedger)
            .sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                if (dateA !== dateB) return dateA - dateB;
                // Important tie-breaker for chronological order
                return a.id.localeCompare(b.id); 
            })
            .map(e => {
                runningBalance += (e.debit - e.credit);
                return { ...e, balance: runningBalance };
            })
            // Step 2: Sort for DISPLAY (descending - newest first)
            .sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                if (dateA !== dateB) return dateB - dateA;
                return b.id.localeCompare(a.id);
            });
    }, [journalEntries, selectedAccountForLedger]);

    const warehouseOptions = React.useMemo(() => {
        const options = [{ value: 'all', label: 'كل المخازن' }, ...warehouses.map((w: any) => ({ value: w.id, label: w.name }))];
        if (user?.warehouseIds?.includes('all')) return options;
        return options.filter(w => w.value !== 'all' && user?.warehouseIds?.includes(w.value));
    }, [warehouses, user]);

  return (
    <TooltipProvider>
    <>
      <PageHeader title="قيود اليومية والأستاذ العام" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card className="no-print">
            <CardHeader><CardTitle>فلاتر البحث</CardTitle></CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     <div className="space-y-2">
                        <Label>المخزن</Label>
                        <Combobox options={warehouseOptions} value={filters.warehouseId} onValueChange={(v) => setFilters(p => ({...p, warehouseId: v}))} placeholder="اختر المخزن" disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')} />
                    </div>
                     <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" value={filters.fromDate} onChange={(e) => setFilters(p => ({...p, fromDate: e.target.value}))} /></div>
                     <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" value={filters.toDate} onChange={(e) => setFilters(p => ({...p, toDate: e.target.value}))} /></div>
                </div>
            </CardContent>
        </Card>
        
        <Tabs value={activeView} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="detailed-view">عرض تفصيلي</TabsTrigger>
                <TabsTrigger value="journal-view">عرض القيد المزدوج</TabsTrigger>
                <TabsTrigger value="accounts-list">دليل الحسابات المستخدمة</TabsTrigger>
                <TabsTrigger value="ledger-view" disabled={!selectedAccountForLedger}>حساب الأستاذ {selectedAccountForLedger && `(${selectedAccountForLedger})`}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="detailed-view">
                <Card>
                <CardHeader><CardTitle>سجل قيود اليومية</CardTitle></CardHeader>
                <CardContent>
                    {loading ? <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                        <div className="w-full overflow-auto border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead>رقم القيد</TableHead>
                                        <TableHead>البيان</TableHead>
                                        <TableHead>الحساب</TableHead>
                                        <TableHead className="text-center">مدين</TableHead>
                                        <TableHead className="text-center">دائن</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredEntries.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{new Date(entry.date).toLocaleDateString('ar-EG')}</TableCell>
                                            <TableCell className="font-mono text-xs">{entry.number}</TableCell>
                                            <TableCell className="text-xs">{entry.description}</TableCell>
                                            <TableCell>
                                                <Button variant="link" className="p-0 h-auto font-semibold" onClick={() => { setSelectedAccountForLedger(entry.account); setActiveTab('ledger-view'); }}>
                                                    {entry.account}
                                                </Button>
                                            </TableCell>
                                            <TableCell className="text-center font-mono">{entry.debit > 0.01 ? entry.debit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</TableCell>
                                            <TableCell className="text-center font-mono">{entry.credit > 0.01 ? entry.credit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
                </Card>
            </TabsContent>
            
            <TabsContent value="journal-view">
                 <div className="space-y-4 max-w-4xl mx-auto">
                    {groupedEntries.map(entry => (
                        <Card key={entry.number}>
                            <CardHeader className='pb-2'>
                                <div className="flex justify-between items-baseline">
                                    <CardTitle className="text-sm font-mono">قيد رقم: #{entry.number}</CardTitle>
                                    <span className='text-xs text-muted-foreground'>{new Date(entry.date).toLocaleDateString('ar-EG')}</span>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableBody>
                                        {entry.debits.map((d, i) => (
                                            <TableRow key={`d-${i}`} className="border-none">
                                                <TableCell className="font-bold">من ح/ {d.account}</TableCell>
                                                <TableCell className="text-left font-mono">{d.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                                <TableCell className="text-left">-</TableCell>
                                            </TableRow>
                                        ))}
                                        {entry.credits.map((c, i) => (
                                            <TableRow key={`c-${i}`} className="border-none">
                                                <TableCell className="pr-10 text-muted-foreground">إلى ح/ {c.account}</TableCell>
                                                <TableCell className="text-left">-</TableCell>
                                                <TableCell className="text-left font-mono">{c.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                            <CardFooter className='pt-2 border-t'><p className="text-[10px] text-muted-foreground italic">{entry.description}</p></CardFooter>
                        </Card>
                    ))}
                 </div>
            </TabsContent>

            <TabsContent value="accounts-list">
                <Card>
                    <CardHeader>
                        <CardTitle>قائمة بنود الحسابات</CardTitle>
                        <CardDescription>جميع الحسابات التي تم استخدامها في القيود المحاسبية.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {uniqueAccounts.map(acc => (
                                <Button key={acc} variant="outline" className="h-16 flex justify-between px-4 items-center" onClick={() => { setSelectedAccountForLedger(acc); setActiveTab('ledger-view'); }}>
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="h-4 w-4 text-primary" />
                                        <span className="font-bold">{acc}</span>
                                    </div>
                                    <ArrowRight className="h-4 w-4 opacity-50" />
                                </Button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="ledger-view">
                {selectedAccountForLedger && (
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>حساب الأستاذ: {selectedAccountForLedger}</CardTitle>
                                <CardDescription>كشف حركة تفصيلي للحساب مع رصيد تراكمي.</CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedAccountForLedger(null)}><Undo2 className="ml-2 h-4 w-4" />إلغاء التحديد</Button>
                        </CardHeader>
                        <CardContent>
                            <div className="w-full overflow-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>التاريخ</TableHead>
                                            <TableHead>رقم المرجع</TableHead>
                                            <TableHead>البيان</TableHead>
                                            <TableHead className="text-center">مدين (+)</TableHead>
                                            <TableHead className="text-center">دائن (-)</TableHead>
                                            <TableHead className="text-center">الرصيد</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {ledgerData.map((tx, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="text-xs">{new Date(tx.date).toLocaleString('ar-EG')}</TableCell>
                                                <TableCell className="font-mono text-xs">{tx.number}</TableCell>
                                                <TableCell className="text-xs">{tx.description}</TableCell>
                                                <TableCell className="text-center text-green-600">{tx.debit > 0.01 ? tx.debit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</TableCell>
                                                <TableCell className="text-center text-destructive">{tx.credit > 0.01 ? tx.credit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</TableCell>
                                                <TableCell className="text-center font-bold">{tx.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                    <TableFooter>
                                        <TableRow className="bg-muted/50 font-bold">
                                            <TableCell colSpan={5}>إجمالي الرصيد الحالي</TableCell>
                                            <TableCell className="text-center text-primary text-lg">{ledgerData[0]?.balance.toLocaleString(undefined, {minimumFractionDigits: 2}) || '0.00'}</TableCell>
                                        </TableRow>
                                    </TableFooter>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </TabsContent>
        </Tabs>
      </main>
    </>
    </TooltipProvider>
  );
}
