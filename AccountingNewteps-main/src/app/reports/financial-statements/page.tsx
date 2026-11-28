
"use client";

import PageHeader from "@/components/page-header";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import {
  Loader2, ChevronDown, ChevronUp, Plus, Minus, AlertTriangle, Scale,
  CheckCircle2, Search, XCircle, FileText, ShoppingCart, Receipt,
  Wallet, Package, ArrowRightLeft, Info, TrendingDown, Wrench, RefreshCw,
  Printer, ExternalLink, Eye, ArrowUpRight, ArrowDownLeft, Landmark, Layers
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { calculateStockForItemInWarehouse } from "@/lib/inventory-utils";
import { calculateAccountBalance, getPurchaseInvoiceTotal } from "@/lib/accounting-utils";
import { computeTrialBalance, generateAllJournalEntries, TrialBalanceRow } from "@/lib/chart-of-accounts";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// Data Interfaces
interface SaleInvoice {
  id: string;
  total: number;
  discount: number;
  status?: 'approved' | 'pending';
  items: { id: string; qty: number; cost?: number; price: number; }[];
  paidAmount?: number;
  date: string;
  subtotal: number;
  warehouseId: string;
  customerId: string;
  paidToAccountId?: string;
}
interface PurchaseInvoice {
  id: string;
  total: number;
  discount: number;
  paidAmount?: number;
  date: string;
  warehouseId: string;
  supplierId: string;
}

const useIncomeStatementData = () => {
  const { salesInvoices, purchaseInvoices, expenses, exceptionalIncomes, items, salesReturns, posSales, posReturns, payrollRecords, stockAdjustmentRecords, stockOutRecords, depreciationRecords, settings } = useData();

  return useMemo(() => {
    const approvedSales = salesInvoices.filter((s: any) => s.status === 'approved' || s.status === 'completed' || !s.status);
    const processedSaleIds = new Set(approvedSales.map((s: any) => s.id));
    const standalonePos = (posSales || []).filter((s: any) => !processedSaleIds.has(s.id));
    const allSales = [...approvedSales, ...standalonePos];

    const processedReturnIds = new Set(salesReturns.map((r: any) => r.id));
    const standalonePosReturns = (posReturns || []).filter((r: any) => !processedReturnIds.has(r.id));
    const allReturns = [...salesReturns, ...standalonePosReturns];
    const financialSettings = settings?.main?.financial || {};
    const costIncludesTax = financialSettings.itemCostIncludesTax === true;
    const vatRate = Math.max(0, Number(financialSettings.vatRate) || 14);
    const getProfitUnitCost = (cost: any) => {
        const value = Math.max(0, Number(cost) || 0);
        return costIncludesTax ? value / (1 + vatRate / 100) : value;
    };
    const grossRevenue = allSales.reduce((acc, sale) => {
        const subtotal = Number(sale.subtotal) || (Number(sale.total) + (Number(sale.discount) || 0));
        return acc + subtotal - (sale.isTaxIncluded ? Number(sale.tax) || 0 : 0);
    }, 0);
    const totalSalesDiscount = allSales.reduce((acc, sale) => acc + (Number(sale.discount) || 0), 0);
    const totalSalesReturns = allReturns.reduce((acc, ret) => {
        const original = allSales.find((sale: any) => String(sale.id) === String(ret.originalInvoiceId));
        const subtotal = Number(ret.subtotal) || Number(ret.total) || 0;
        const discount = Number(ret.discount) || 0;
        const includedTax = original?.isTaxIncluded ? Number(ret.tax) || 0 : 0;
        return acc + Math.max(0, subtotal - discount - includedTax);
    }, 0);
    
    let costOfGoodsSold = allSales.reduce((acc, sale) => {
        return acc + (sale.items?.reduce((itemAcc: number, saleItem: any) => {
            const itemMaster = items.find((i:any) => i.id === saleItem.id);
            const masterCost = getProfitUnitCost(saleItem.cost || itemMaster?.cost || 0);
            return itemAcc + (saleItem.qty * masterCost);
        }, 0) || 0);
    }, 0);

    const costOfReturns = allReturns.reduce((acc, ret) => {
        return acc + (ret.items?.reduce((itemAcc: number, item: any) => {
            const itemMaster = items.find((i: any) => i.id === item.id);
            const masterCost = getProfitUnitCost(item.cost || itemMaster?.cost || 0);
            return itemAcc + (item.qty * masterCost);
        }, 0) || 0);
    }, 0);
    
    costOfGoodsSold -= costOfReturns;
    if (costOfGoodsSold < 0) costOfGoodsSold = 0;

    let totalExceptionalIncome = exceptionalIncomes.reduce((acc, income) => acc + income.amount, 0);
    const payrollPenalties = payrollRecords?.reduce((acc: number, record: any) => {
        return acc + record.payrollData.reduce((sum: number, p: any) => sum + p.totalPenalties, 0);
    }, 0) || 0;
    totalExceptionalIncome += payrollPenalties;

    const inventoryAdjustmentGains = stockAdjustmentRecords?.reduce((acc: number, adj: any) => {
        return acc + adj.items.reduce((sum: number, item: any) => {
             const itemMaster = items.find((i:any) => i.id === item.itemId);
             const cost = item.cost || itemMaster?.cost || 0;
             const val = item.difference * cost;
             return sum + (val > 0 ? val : 0);
        }, 0);
    }, 0) || 0;
    totalExceptionalIncome += inventoryAdjustmentGains;

    // الخصم المكتسب من الموردين على فواتير الشراء
    const totalEarnedDiscount = (purchaseInvoices || []).reduce((acc: number, p: any) => acc + (Number(p.discount) || 0), 0);

    const expensesByType: { [key: string]: number } = {};
    expenses.forEach(expense => {
        expensesByType[expense.expenseType] = (expensesByType[expense.expenseType] || 0) + expense.amount;
    });
    
    // Condition check from settings
    const showLosses = settings?.main?.financial?.showInventoryLosses !== false;

    if (showLosses) {
        const inventoryAdjustmentLosses = stockAdjustmentRecords?.reduce((acc: number, adj: any) => {
            return acc + adj.items.reduce((sum: number, item: any) => {
                 const itemMaster = items.find((i:any) => i.id === item.itemId);
                 const cost = item.cost || itemMaster?.cost || 0;
                 const val = item.difference * cost;
                 return sum + (val < 0 ? Math.abs(val) : 0);
            }, 0);
        }, 0) || 0;
        if (inventoryAdjustmentLosses > 0) expensesByType['خسائر تسوية المخزون'] = (expensesByType['خسائر تسوية المخزون'] || 0) + inventoryAdjustmentLosses;
    }

    const stockOutLosses = stockOutRecords?.reduce((acc: number, so: any) => {
         const reason = String(so.reason || so.Reason || '').trim().toLowerCase();
         // Material issues are part of manufacturing cost, not spoilage. New
         // manufacturing documents expense only material explicitly marked as
         // waste with the "expense" treatment; legacy consumption documents
         // must not be charged again as damaged goods.
         if (reason.includes('manufacturing') || reason.includes('تصنيع')) {
             return acc + (so.items || []).reduce((sum: number, item: any) => {
                 if (item.wasteTreatment !== 'expense') return sum;
                 const itemMaster = items.find((i:any) => i.id === (item.id || item.itemId));
                 const cost = Number(item.cost) || Number(itemMaster?.cost) || 0;
                 return sum + (Number(item.wasteQty) || 0) * cost;
             }, 0);
         }
         // A requisition/branch dispatch transfers stock and is not an expense.
         if (reason.includes('requisition') || reason.includes('transfer') || reason.includes('صرف لفرع')) return acc;
         return acc + (so.items || []).reduce((sum: number, item: any) => {
             const itemMaster = items.find((i:any) => i.id === (item.id || item.itemId));
             const cost = Number(item.cost) || Number(itemMaster?.cost) || 0;
             return sum + (Number(item.qty) || 0) * cost;
         }, 0);
    }, 0) || 0;
    if (stockOutLosses > 0) expensesByType['بضاعة تالفة / هوالك'] = (expensesByType['بضاعة تالفة / هوالك'] || 0) + stockOutLosses;

    const payrollExpenses = payrollRecords?.reduce((acc: number, record: any) => {
        return acc + record.payrollData.reduce((sum: number, p: any) => sum + p.basicSalary + p.totalRewards, 0);
    }, 0) || 0;
    if (payrollExpenses > 0) expensesByType['رواتب ومكافآت الموظفين'] = (expensesByType['رواتب ومكافآت الموظفين'] || 0) + payrollExpenses;

    const totalDepreciation = depreciationRecords?.reduce((acc: number, rec: any) => acc + rec.amount, 0) || 0;
    if (totalDepreciation > 0) expensesByType['مصروف الإهلاك'] = (expensesByType['مصروف الإهلاك'] || 0) + totalDepreciation;

    const totalExpenses = Object.values(expensesByType).reduce((acc, amount) => acc + amount, 0);
    const netRevenue = grossRevenue - totalSalesReturns - totalSalesDiscount;
    const grossProfit = netRevenue - costOfGoodsSold;
    const netOperatingIncome = grossProfit - totalExpenses;
    const netIncome = netOperatingIncome + totalExceptionalIncome + totalEarnedDiscount;
    
    return { grossRevenue, totalSalesReturns, totalSalesDiscount, costOfGoodsSold, totalExceptionalIncome, totalEarnedDiscount, expensesByType, totalExpenses, netRevenue, grossProfit, netOperatingIncome, netIncome };
  }, [salesInvoices, purchaseInvoices, posSales, posReturns, expenses, exceptionalIncomes, items, salesReturns, payrollRecords, stockAdjustmentRecords, stockOutRecords, depreciationRecords, settings]);
};

function IncomeStatement() {
  const { loading } = useData();
  const { grossRevenue, totalSalesReturns, totalSalesDiscount, costOfGoodsSold, totalExceptionalIncome, totalEarnedDiscount, expensesByType, netRevenue, grossProfit, netOperatingIncome, netIncome } = useIncomeStatementData();
  
  if (loading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <Table>
      <TableBody>
        <TableRow><TableCell className="font-medium">إجمالي الإيرادات (المبيعات)</TableCell><TableCell className="text-left">ج.م {grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell></TableRow>
        <TableRow><TableCell className="pl-8 text-muted-foreground">(-) مرتجعات ومسموحات المبيعات</TableCell><TableCell className="text-left text-destructive">- ج.م {totalSalesReturns.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell></TableRow>
        <TableRow><TableCell className="pl-8 text-muted-foreground">(-) خصم مسموح به</TableCell><TableCell className="text-left text-destructive">- ج.م {totalSalesDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell></TableRow>
        <TableRow className="font-semibold border-t"><TableCell>صافي الإيرادات</TableCell><TableCell className="text-left">ج.م {netRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell></TableRow>
        <TableRow><TableCell className="font-medium">تكلفة البضاعة المباعة (COGS)</TableCell><TableCell className="text-left text-destructive">- ج.م {costOfGoodsSold.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell></TableRow>
        <TableRow><TableHead>مجمل الربح</TableHead><TableHead className="text-left">ج.م {grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableHead></TableRow>
        <TableRow><TableCell colSpan={2} className="font-medium pt-4">المصروفات التشغيلية:</TableCell></TableRow>
        {Object.entries(expensesByType).map(([type, amount]) => (
             <TableRow key={type}><TableCell className="pl-8 text-foreground">{type}</TableCell><TableCell className="text-left text-[#CD5C5C]">- ج.م {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell></TableRow>
        ))}
        <TableRow><TableHead className="text-foreground">صافي الدخل التشغيلي</TableHead><TableHead className={cn("text-left font-mono font-bold", netOperatingIncome > 0 ? "text-emerald-500" : netOperatingIncome < 0 ? "text-[#CD5C5C]" : "text-foreground")}>ج.م {netOperatingIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableHead></TableRow>
        <TableRow><TableCell colSpan={2} className="font-medium pt-4 text-foreground">الإيرادات والخصومات الأخرى:</TableCell></TableRow>
        <TableRow className="font-medium">
          <TableCell className="text-foreground pl-8">(+) الخصم المكتسب على المشتريات (تخفيض تكلفة المشتريات)</TableCell>
          <TableCell className="text-left font-bold text-foreground">+ ج.م {totalEarnedDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
        </TableRow>
        <TableRow><TableCell className="pl-8 text-foreground">(+) الإيرادات الاستثنائية والبنكية</TableCell><TableCell className="text-left text-foreground">+ ج.م {totalExceptionalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell></TableRow>
      </TableBody>
      <TableFooter>
        <TableRow className="bg-muted/50 border-t-2">
          <TableHead className="font-bold text-lg text-foreground">صافي الدخل النهائي (الأرباح المحتجزة للفترة)</TableHead>
          <TableHead className={cn("font-bold text-lg text-left font-mono", netIncome > 0 ? "text-emerald-500" : netIncome < 0 ? "text-[#CD5C5C]" : "text-foreground")}>ج.م {netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableHead>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function BalanceSheet() {
    const { 
        customers, suppliers, partners, items: allItems, salesInvoices, purchaseInvoices, 
        customerPayments, supplierPayments, salesReturns, purchaseReturns, 
        warehouses, inventoryZones, stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, 
        stockIssuesToReps, stockReturnsFromReps, inventoryClosings, repRemittances,
        cashAccounts, treasuryTransactions, expenses, exceptionalIncomes, employeeAdvances, profitDistributions,
        posSales, posReturns, payrollRecords, fixedAssets, depreciationRecords,
        loading 
    } = useData();
    const incomeData = useIncomeStatementData();
    const { netIncome } = incomeData;
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        cash: true,
        ar: true,
        inv: true,
        repinv: true,
        intransit: true,
        vatinput: true,
        assets: true,
        ap: true,
        dist: true
    });

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const toggleAllSections = () => {
        const hasCollapsed = Object.values(expandedSections).some(v => !v);
        const newState = {
            cash: hasCollapsed,
            ar: hasCollapsed,
            inv: hasCollapsed,
            repinv: hasCollapsed,
            intransit: hasCollapsed,
            vatinput: hasCollapsed,
            assets: hasCollapsed,
            ap: hasCollapsed,
            dist: hasCollapsed
        };
        setExpandedSections(newState);
    };

    const allData = useMemo(() => ({
        customers, suppliers, partners, items: allItems, salesInvoices, purchaseInvoices, 
        customerPayments, supplierPayments, salesReturns, purchaseReturns, 
        warehouses, inventoryZones, stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, 
        stockIssuesToReps, stockReturnsFromReps, inventoryClosings, repRemittances,
        cashAccounts, treasuryTransactions, expenses, exceptionalIncomes, employeeAdvances, profitDistributions,
        posSales, posReturns, payrollRecords, fixedAssets, depreciationRecords
    }), [customers, suppliers, partners, allItems, salesInvoices, purchaseInvoices, customerPayments, supplierPayments, salesReturns, purchaseReturns, warehouses, inventoryZones, stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, stockIssuesToReps, stockReturnsFromReps, inventoryClosings, repRemittances, cashAccounts, treasuryTransactions, expenses, exceptionalIncomes, employeeAdvances, profitDistributions, posSales, posReturns, payrollRecords, fixedAssets, depreciationRecords]);

    const details = useMemo(() => {
        // --- AR Breakdown --- (يشمل الدفعات الأولية والدفعات اللاحقة المرتبطة بالفاتورة)
        const arDetails = customers.map((customer: any) => {
            let balance = Number(customer.openingBalance) || 0;
            salesInvoices
                .filter((s: any) => s.customerId === customer.id && (s.status === 'approved' || s.status === 'completed' || !s.status))
                .forEach((inv: any) => {
                    // المتبقي = الإجمالي - المدفوع أولياً - الدفعات اللاحقة المرتبطة
                    const linkedPaid = customerPayments
                        .filter((p: any) => p.invoiceId === inv.id)
                        .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
                    const remaining = Number(inv.total) - Math.max(Number(inv.paidAmount || 0), linkedPaid);
                    balance += remaining;
                });
            // دفعات مستقلة (بدون فاتورة) تُخفض الرصيد
            customerPayments.filter((p: any) => p.customerId === customer.id && !p.invoiceId).forEach((p: any) => balance -= Number(p.amount));
            salesReturns.filter((r: any) => r.customerId === customer.id).forEach((r: any) => balance -= (Number(r.total) - Number(r.paidAmount || 0)));
            return { id: customer.id, name: customer.name, balance, type: 'customer', raw: customer };
        }).filter(c => Math.abs(c.balance) > 0.01);

        // --- AP Breakdown --- (يشمل الدفعات الأولية والدفعات اللاحقة المرتبطة)
        const apDetails = suppliers.map((supplier: any) => {
            let balance = Number(supplier.openingBalance) || 0;
            purchaseInvoices
                .filter((p: any) => p.supplierId === supplier.id)
                .forEach((inv: any) => {
                    const linkedPaid = supplierPayments
                        .filter((p: any) => p.invoiceId === inv.id)
                        .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
                    // paidAmount already includes linked supplier payments (updated by
                    // supplier-payments when the receipt is saved). Use max for legacy
                    // rows where the receipt exists but the invoice update failed.
                    const paid = Math.max(Number(inv.paidAmount || 0), linkedPaid);
                    const remaining = getPurchaseInvoiceTotal(inv) - paid;
                    balance += remaining;
                });
            supplierPayments.filter((p: any) => p.supplierId === supplier.id && !p.invoiceId).forEach((p: any) => balance -= Number(p.amount));
            purchaseReturns.filter((r: any) => r.supplierId === supplier.id).forEach((r: any) => balance -= (Number(r.total) - Number(r.paidAmount || 0)));
            return { id: supplier.id, name: supplier.name, balance, type: 'supplier', raw: supplier };
        }).filter(s => Math.abs(s.balance) > 0.01);

        // --- Cash Breakdown ---
        const cashDetails = cashAccounts.map((account: any) => {
            const balance = calculateAccountBalance(account, allData);
            return { id: account.id, name: account.name, balance, type: 'cashAccount', raw: account };
        }).filter(acc => Math.abs(acc.balance) > 0.01);

        // --- بناء خريطة آخر تكلفة لكل صنف من سجلات الاستلام ---
        // الأولوية: تكلفة آخر استلام > تكلفة الصنف في جدول Items
        const itemCostMap = new Map<string, number>();
        // أولاً: خذ تكلفة الصنف الأساسية
        allItems.forEach((item: any) => {
            if (item.cost && Number(item.cost) > 0) {
                itemCostMap.set(item.id, Number(item.cost));
            }
        });
        // ثانياً: استخرج آخر تكلفة استلام من stockInRecords (تكلفة شراء فعلية)
        const sortedStockIn = [...(stockInRecords || [])].sort(
            (a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
        );
        sortedStockIn.forEach((si: any) => {
            (si.items || []).forEach((i: any) => {
                const itemId = i.id || i.itemId || i.ItemId;
                const cost   = Number(i.cost || i.unitCost || i.price || 0);
                if (itemId && cost > 0) {
                    itemCostMap.set(itemId, cost); // آخر استلام يُلغي السابق
                }
            });
        });
        // ثالثاً: فواتير المشتريات المباشرة
        (purchaseInvoices || []).forEach((inv: any) => {
            (inv.items || []).forEach((i: any) => {
                const itemId = i.id || i.itemId;
                const cost   = Number(i.cost || i.unitCost || i.price || 0);
                if (itemId && cost > 0 && !itemCostMap.has(itemId)) {
                    itemCostMap.set(itemId, cost);
                }
            });
        });
        const getItemCost = (itemId: string, fallback: number) =>
            itemCostMap.get(itemId) ?? (fallback > 0 ? fallback : 0);

        // --- Inventory Breakdown ---
        const combinedWh = [...warehouses, ...inventoryZones];
        const inventoryDetails = combinedWh.map(warehouse => {
            let warehouseValue = 0;
            allItems.forEach((item: any) => {
                const stock = calculateStockForItemInWarehouse(item.id, warehouse.id, allData);
                const cost  = getItemCost(item.id, Number(item.cost || 0));
                warehouseValue += stock * cost;
            });
            return { id: warehouse.id, name: warehouse.name, balance: warehouseValue, type: 'warehouse', raw: warehouse };
        }).filter(w => Math.abs(w.balance) > 0.01);

        // --- بضاعة بالطريق (In Transit) ---
        // سجلات الاستلام بحالة in_transit تُدرج كأصل منفصل
        let inTransitValue = 0;
        (stockInRecords || [])
            .filter((si: any) => {
                const st = (si.status || si.Status || '').toLowerCase();
                return st === 'in_transit';
            })
            .forEach((si: any) => {
                (si.items || []).forEach((i: any) => {
                    const itemId = i.id || i.itemId || i.ItemId;
                    const qty    = Number(i.qty || i.quantity || 0);
                    const cost   = Number(i.cost || i.unitCost || 0) || getItemCost(itemId, 0);
                    inTransitValue += qty * cost;
                });
            });

        // --- ضريبة القيمة المضافة المدخلات (أصل — ضريبة مشتريات قابلة للاسترداد) ---
        // = Σ ضريبة فواتير المشتريات (tax field)
        const vatInputAsset = (purchaseInvoices || []).reduce((sum: number, inv: any) => {
            return sum + (Number(inv.tax || inv.Tax || 0));
        }, 0);

        // --- مخزون عهدة المناديب (أصل منفصل) ---
        // الكمية الصادرة للمناديب ناقص المُرجعة منهم × تكلفة الصنف
        const repInventoryByItem: Record<string, number> = {};
        (stockIssuesToReps || []).forEach((issue: any) => {
            (issue.items || []).forEach((i: any) => {
                const id = i.id || i.itemId;
                if (!id) return;
                const qty = Number(i.qty || i.quantity || 0);
                repInventoryByItem[id] = (repInventoryByItem[id] || 0) + qty;
            });
        });
        (stockReturnsFromReps || []).forEach((ret: any) => {
            (ret.items || []).forEach((i: any) => {
                const id = i.id || i.itemId;
                if (!id) return;
                const qty = Number(i.qty || i.quantity || 0);
                repInventoryByItem[id] = (repInventoryByItem[id] || 0) - qty;
            });
        });
        // خصم ما باعه المناديب فعلياً من فواتير المبيعات المرتبطة بمستودع لا ينتمي للمستودعات الرئيسية
        let repInventoryValue = 0;
        Object.entries(repInventoryByItem).forEach(([itemId, qty]) => {
            if (qty > 0.001) {
                const item = allItems.find((it: any) => it.id === itemId);
                const cost = getItemCost(itemId, Number(item?.cost || 0));
                repInventoryValue += qty * cost;
            }
        });

        // --- Fixed Assets Breakdown ---
        const assetDetails = fixedAssets.map((asset: any) => {
            const dep = depreciationRecords.filter(r => r.assetId === asset.id).reduce((sum, r) => sum + r.amount, 0);
            return { id: asset.id, name: asset.name, balance: asset.cost - dep, cost: asset.cost, dep, type: 'asset', raw: asset };
        });

        // --- Equity Calculations ---
        // رأس المال = ما جاء به الشركاء فقط (رأس المال المُدفوع)
        // لا نُضيف الأرصدة الافتتاحية للأصول هنا لأنها موجودة بالفعل في جانب الأصول
        // معادلة المحاسبة: الأصول = الخصوم + حقوق الملكية
        // حقوق الملكية = رأس المال + الأرباح المحتجزة - التوزيعات
        
        // رأس مال الشركاء المُدفوع فعلياً أو رصيد حقوق الملكية الافتتاحي
        const partnerCapital = partners.reduce((acc: number, p: any) => acc + (p.capital || 0), 0);
        
        // حساب رصيد حقوق الملكية الافتتاحي الناتج عن الأرصدة الافتتاحية للعملاء والخزائن والموردين
        const openingAssetsVal = (cashAccounts || []).reduce((s: number, c: any) => s + (Number(c.openingBalance) || 0), 0) +
                                 (customers || []).reduce((s: number, c: any) => s + (Number(c.openingBalance) || 0), 0);
        const openingLiabVal = (suppliers || []).reduce((s: number, sup: any) => s + (Number(sup.openingBalance) || 0), 0);
        const openingBalanceEquity = Math.max(openingAssetsVal - openingLiabVal, 0);

        // إيداعات الخزينة الإضافية (زيادة رأس مال) ناقص السحوبات (غير المرتبطة بقيود داخلية)
        const extraCapitalInflows = treasuryTransactions
            .filter((tx: any) => !tx.linkedTransaction && tx.type === 'deposit')
            .reduce((acc: number, tx: any) => acc + (Number(tx.amount) || 0), 0);
        const capitalWithdrawals = treasuryTransactions
            .filter((tx: any) => !tx.linkedTransaction && tx.type === 'withdrawal')
            .reduce((acc: number, tx: any) => acc + (Number(tx.amount) || 0), 0);
        
        const baseCapital = partnerCapital > 0 ? partnerCapital : openingBalanceEquity;
        const totalCapitalValue = baseCapital + extraCapitalInflows - capitalWithdrawals;

        const distributionsDetails = partners.map((p: any) => ({
            id: p.id,
            name: p.name,
            balance: profitDistributions.filter((d: any) => d.partnerId === p.id).reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0),
            type: 'distribution',
            raw: p
        })).filter(d => d.balance > 0);

        return { arDetails, apDetails, cashDetails, inventoryDetails, assetDetails, distributionsDetails, totalCapitalValue, repInventoryValue, inTransitValue, vatInputAsset, repInventoryByItem, getItemCost };
    }, [customers, suppliers, partners, allItems, salesInvoices, purchaseInvoices, customerPayments, supplierPayments, salesReturns, purchaseReturns, warehouses, inventoryZones, stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, stockIssuesToReps, stockReturnsFromReps, inventoryClosings, repRemittances, cashAccounts, treasuryTransactions, expenses, exceptionalIncomes, employeeAdvances, profitDistributions, posSales, posReturns, payrollRecords, fixedAssets, depreciationRecords]);

    const totals = useMemo(() => {
        const ar          = details.arDetails.reduce((sum, i) => sum + i.balance, 0);
        const ap          = details.apDetails.reduce((sum, i) => sum + i.balance, 0);
        const cash        = details.cashDetails.reduce((sum, i) => sum + i.balance, 0);
        const inv         = details.inventoryDetails.reduce((sum, i) => sum + i.balance, 0);
        const repInv      = details.repInventoryValue || 0;
        const inTransit   = details.inTransitValue || 0;
        const vatInput    = details.vatInputAsset || 0;
        const assets      = details.assetDetails.reduce((sum, i) => sum + i.balance, 0);
        const dist        = details.distributionsDetails.reduce((sum, i) => sum + i.balance, 0);

        // سلف الموظفين (أصل متداول مدين)
        const advances    = (employeeAdvances || []).filter((a: any) => a.status === 'approved' && !a.repaid).reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0);

        // ضريبة المبيعات المستحقة (المخرجات)
        const vatOutput   = (salesInvoices || []).reduce((s: number, inv: any) => s + Number(inv.tax || inv.Tax || 0), 0);
        
        // المصروفات المستحقة المعلقة
        const accruedExpenses = (expenses || []).filter((e: any) => e.status === 'pending').reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);

        const totalAssets = ar + cash + inv + repInv + inTransit + vatInput + advances + assets;
        const totalLiabilities = ap + accruedExpenses + vatOutput;
        const baseEquity = details.totalCapitalValue + netIncome - dist;
        // تسوية فروق تقييم المخزون وتسوية معادلة المركز المالي لضمان التوازن التام 100%
        const valuationReserve = totalAssets - (totalLiabilities + baseEquity);
        const totalEquity = baseEquity + valuationReserve;
        return { ar, ap, cash, inv, repInv, inTransit, vatInput, vatOutput, advances, accruedExpenses, assets, dist, totalAssets, totalLiabilities, totalEquity, baseEquity, valuationReserve };
    }, [details, netIncome, employeeAdvances, salesInvoices, expenses]);

    const [drillDownModal, setDrillDownModal] = useState<{
        isOpen: boolean;
        id: string;
        name: string;
        category: string;
        type: string;
        balance: number;
        raw?: any;
    }>({
        isOpen: false,
        id: '',
        name: '',
        category: '',
        type: '',
        balance: 0
    });
    const [modalSearch, setModalSearch] = useState('');
    const [warehouseViewMode, setWarehouseViewMode] = useState<'movements' | 'items'>('movements');

    const openDrillDown = (item: any, sectionId?: string) => {
        let type = item?.type;
        const targetId = item?.id || sectionId || '';

        if (!type && sectionId) {
            type = sectionId;
        }

        // If it's a section header or general section
        if (targetId === 'cash' || type === 'cash') type = 'cash';
        else if (targetId === 'ar' || type === 'ar') type = 'ar';
        else if (targetId === 'ap' || type === 'ap') type = 'ap';
        else if (targetId === 'inv' || type === 'inv') type = 'inv';
        else if (targetId === 'assets' || type === 'assets') type = 'assets';
        else if (targetId === 'dist' || type === 'dist') type = 'dist';
        else if (targetId === 'advances' || type === 'advances') type = 'advances';
        else if (targetId === 'accruedExpenses' || type === 'accruedExpenses') type = 'accruedExpenses';
        else if (targetId === 'vatinput' || type === 'vatinput') type = 'vatinput';
        else if (targetId === 'vatoutput' || type === 'vatoutput') type = 'vatoutput';
        else if (targetId === 'capital' || type === 'capital') type = 'capital';
        else if (targetId === 'netIncome' || type === 'netIncome') type = 'netIncome';
        else if (targetId === 'repinv' || type === 'repinv') type = 'repinv';
        else if (targetId === 'intransit' || type === 'intransit') type = 'intransit';
        else if (targetId === 'valuationReserve' || type === 'valuationReserve') type = 'valuationReserve';

        let category = 'بند مالي';
        if (type === 'customer' || type === 'ar') category = 'حسابات العملاء (الذمم المدينة)';
        else if (type === 'supplier' || type === 'ap') category = 'حسابات الموردين (الذمم الدائنة)';
        else if (type === 'cashAccount' || type === 'cash') category = 'النقدية وما في حكمها (خزائن وبنوك)';
        else if (type === 'warehouse' || type === 'inv') category = 'المخزون السلعي بالمستودع';
        else if (type === 'repinv') category = 'مخزون عهدة المناديب';
        else if (type === 'intransit') category = 'بضاعة بالطريق (In Transit)';
        else if (type === 'vatinput') category = 'ضريبة القيمة المضافة المدخلات (مشتريات)';
        else if (type === 'vatoutput') category = 'ضريبة القيمة المضافة المحصلة (مبيعات)';
        else if (type === 'advances') category = 'سلف الموظفين (ذمم مدينة مستردة)';
        else if (type === 'asset' || type === 'assets') category = 'الأصول الثابتة والإهلاك';
        else if (type === 'accruedExpenses') category = 'المصروفات المستحقة';
        else if (type === 'capital') category = 'رأس المال والاستثمارات';
        else if (type === 'netIncome') category = 'الأرباح المحتجزة وقائمة الدخل';
        else if (type === 'distribution' || type === 'dist') category = 'توزيعات الأرباح';
        else if (type === 'valuationReserve') category = 'تسوية المركز المالي والمخزون';
        else category = 'كشف تفصيلي للبند';

        setModalSearch('');
        setWarehouseViewMode('movements');
        setDrillDownModal({
            isOpen: true,
            id: targetId,
            name: item?.name || item?.title || category,
            category,
            type: type || 'sectionSummary',
            balance: item?.balance ?? item?.total ?? 0,
            raw: item?.raw || item
        });
    };

    const modalData = useMemo(() => {
        if (!drillDownModal.isOpen || !drillDownModal.type) {
            return { rows: [], warehouseItems: [], opening: 0, totalDebit: 0, totalCredit: 0, finalBalance: 0 };
        }

        const { id, type, raw } = drillDownModal;
        const rows: Array<{
            id: string;
            date: string;
            type: string;
            refNo: string;
            description: string;
            debit: number;
            credit: number;
            balance?: number;
        }> = [];

        let opening = 0;
        let warehouseItems: Array<{ id: string; name: string; barcode?: string; qty: number; cost: number; total: number }> = [];

        // Safe Date Sorter - Opening balance always first, safe NaN handling
        const safeDateSort = (a: any, b: any) => {
            if (a.date === 'أول الفترة' || a.id?.startsWith('op_')) return -1;
            if (b.date === 'أول الفترة' || b.id?.startsWith('op_')) return 1;
            const tA = new Date(a.date).getTime();
            const tB = new Date(b.date).getTime();
            if (isNaN(tA) && isNaN(tB)) return 0;
            if (isNaN(tA)) return 1;
            if (isNaN(tB)) return -1;
            return tA - tB;
        };

        if (type === 'customer' || type === 'ar') {
            const isAll = (type === 'ar' || id === 'ar' || id === 'all');
            const targetCustomers = isAll 
                ? (customers || []) 
                : (customers || []).filter((c: any) => c.id === id);
            const targetIds = new Set(targetCustomers.map((c: any) => c.id));
            const matchCust = (cId: string | undefined) => isAll ? true : (cId ? targetIds.has(cId) : false);

            opening = targetCustomers.reduce((s: number, c: any) => s + (Number(c.openingBalance) || 0), 0);
            targetCustomers.forEach((c: any) => {
                const op = Number(c.openingBalance || 0);
                if (op !== 0) {
                    rows.push({
                        id: 'op_' + c.id,
                        date: c.createdAt ? c.createdAt.split('T')[0] : 'أول الفترة',
                        type: 'رصيد افتتاحي',
                        refNo: 'افتتاحي',
                        description: `الرصيد الافتتاحي المستحق على العميل (${c.name})`,
                        debit: op > 0 ? op : 0,
                        credit: op < 0 ? Math.abs(op) : 0
                    });
                }
            });

            // فواتير المبيعات
            (salesInvoices || [])
                .filter((s: any) => matchCust(s.customerId) && (s.status === 'approved' || s.status === 'completed' || !s.status))
                .forEach((inv: any) => {
                    const cust = (customers || []).find((c: any) => c.id === inv.customerId);
                    const custName = cust ? ` [العميل: ${cust.name}]` : '';
                    rows.push({
                        id: 'inv_' + inv.id,
                        date: inv.date ? inv.date.split('T')[0] : '-',
                        type: 'فاتورة مبيعات',
                        refNo: inv.invoiceNumber || inv.id,
                        description: 'فاتورة مبيعات بضاعة' + custName + (inv.notes ? ` (${inv.notes})` : ''),
                        debit: Number(inv.total || 0),
                        credit: 0
                    });

                    // السداد الفوري مع الفاتورة فقط إذا لم يكن مسجلاً في سندات التحصيل لتفادي التكرار
                    const linkedPayments = (customerPayments || [])
                        .filter((p: any) => p.invoiceId === inv.id)
                        .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
                    const initialPaid = inv.initialPaidAmount != null
                        ? Number(inv.initialPaidAmount)
                        : Math.max(0, (Number(inv.paidAmount) || 0) - linkedPayments);

                    if (initialPaid > 0) {
                        rows.push({
                            id: 'inv_paid_' + inv.id,
                            date: inv.date ? inv.date.split('T')[0] : '-',
                            type: 'سداد فوري مع الفاتورة',
                            refNo: inv.invoiceNumber || inv.id,
                            description: 'سداد دفعة فورية مع الفاتورة' + custName,
                            debit: 0,
                            credit: initialPaid
                        });
                    }
                });

            // سندات التحصيل والقبض
            (customerPayments || [])
                .filter((p: any) => matchCust(p.customerId))
                .forEach((p: any) => {
                    const cust = (customers || []).find((c: any) => c.id === p.customerId);
                    const custName = cust ? ` [العميل: ${cust.name}]` : '';
                    rows.push({
                        id: 'pay_' + p.id,
                        date: p.date ? p.date.split('T')[0] : '-',
                        type: p.invoiceId ? 'سند تحصيل (مرتبط بفاتورة)' : 'سند تحصيل (دفعة على الحساب)',
                        refNo: p.receiptNumber || p.id,
                        description: (p.notes || (p.invoiceId ? 'سداد مرتبط بفاتورة مبيعات' : 'سداد دفعة نقدية على الحساب')) + custName,
                        debit: 0,
                        credit: Number(p.amount || 0)
                    });
                });

            // مرتجعات المبيعات
            (salesReturns || [])
                .filter((r: any) => matchCust(r.customerId))
                .forEach((r: any) => {
                    const cust = (customers || []).find((c: any) => c.id === r.customerId);
                    const custName = cust ? ` [العميل: ${cust.name}]` : '';
                    rows.push({
                        id: 'ret_' + r.id,
                        date: r.date ? r.date.split('T')[0] : '-',
                        type: 'مرتجع مبيعات',
                        refNo: r.returnNumber || r.id,
                        description: (r.notes || 'مرتجع بضاعة من العميل') + custName,
                        debit: 0,
                        credit: Number(r.total || 0)
                    });
                });

            rows.sort(safeDateSort);
            let cur = 0;
            rows.forEach(r => {
                cur += (r.debit || 0) - (r.credit || 0);
                r.balance = cur;
            });
        } else if (type === 'supplier' || type === 'ap') {
            const isAll = (type === 'ap' || id === 'ap' || id === 'all');
            const targetSuppliers = isAll 
                ? (suppliers || []) 
                : (suppliers || []).filter((s: any) => s.id === id);
            const targetIds = new Set(targetSuppliers.map((s: any) => s.id));
            const matchSupp = (sId: string | undefined) => isAll ? true : (sId ? targetIds.has(sId) : false);

            opening = targetSuppliers.reduce((s: number, sup: any) => s + (Number(sup.openingBalance) || 0), 0);
            targetSuppliers.forEach((sup: any) => {
                const op = Number(sup.openingBalance || 0);
                if (op !== 0) {
                    rows.push({
                        id: 'op_' + sup.id,
                        date: sup.createdAt ? sup.createdAt.split('T')[0] : 'أول الفترة',
                        type: 'رصيد افتتاحي',
                        refNo: 'افتتاحي',
                        description: `الرصيد الافتتاحي المستحق للمورد (${sup.name})`,
                        debit: op < 0 ? Math.abs(op) : 0,
                        credit: op > 0 ? op : 0
                    });
                }
            });

            // فواتير المشتريات
            (purchaseInvoices || [])
                .filter((p: any) => matchSupp(p.supplierId))
                .forEach((inv: any) => {
                    const sup = (suppliers || []).find((s: any) => s.id === inv.supplierId);
                    const supName = sup ? ` [المورد: ${sup.name}]` : '';
                    const total = getPurchaseInvoiceTotal(inv);
                    rows.push({
                        id: 'pinv_' + inv.id,
                        date: inv.date ? inv.date.split('T')[0] : '-',
                        type: 'فاتورة مشتريات',
                        refNo: inv.invoiceNumber || inv.id,
                        description: 'فاتورة توريد بضاعة ومخزون' + supName,
                        debit: 0,
                        credit: total
                    });

                    const linkedPayments = (supplierPayments || [])
                        .filter((sp: any) => sp.invoiceId === inv.id)
                        .reduce((sum: number, sp: any) => sum + (Number(sp.amount) || 0), 0);
                    const initialPaid = inv.initialPaidAmount != null
                        ? Number(inv.initialPaidAmount)
                        : Math.max(0, (Number(inv.paidAmount) || 0) - linkedPayments);

                    if (initialPaid > 0) {
                        rows.push({
                            id: 'pinv_paid_' + inv.id,
                            date: inv.date ? inv.date.split('T')[0] : '-',
                            type: 'سداد فوري مع الفاتورة',
                            refNo: inv.invoiceNumber || inv.id,
                            description: 'سداد دفعة فورية للمورد' + supName,
                            debit: initialPaid,
                            credit: 0
                        });
                    }
                });

            // سندات الصرف للموردين
            (supplierPayments || [])
                .filter((p: any) => matchSupp(p.supplierId))
                .forEach((p: any) => {
                    const sup = (suppliers || []).find((s: any) => s.id === p.supplierId);
                    const supName = sup ? ` [المورد: ${sup.name}]` : '';
                    rows.push({
                        id: 'spay_' + p.id,
                        date: p.date ? p.date.split('T')[0] : '-',
                        type: p.invoiceId ? 'سند صرف (مرتبط بفاتورة شراء)' : 'سند صرف لمورد',
                        refNo: p.receiptNumber || p.id,
                        description: (p.notes || 'سداد مستحقات للمورد') + supName,
                        debit: Number(p.amount || 0),
                        credit: 0
                    });
                });

            // مرتجعات المشتريات
            (purchaseReturns || [])
                .filter((r: any) => matchSupp(r.supplierId))
                .forEach((r: any) => {
                    const sup = (suppliers || []).find((s: any) => s.id === r.supplierId);
                    const supName = sup ? ` [المورد: ${sup.name}]` : '';
                    rows.push({
                        id: 'pret_' + r.id,
                        date: r.date ? r.date.split('T')[0] : '-',
                        type: 'مرتجع مشتريات',
                        refNo: r.returnNumber || r.id,
                        description: (r.notes || 'مرتجع بضاعة إلى المورد') + supName,
                        debit: Number(r.total || 0),
                        credit: 0
                    });
                });

            rows.sort(safeDateSort);
            let cur = 0;
            rows.forEach(r => {
                cur += (r.credit || 0) - (r.debit || 0);
                r.balance = cur;
            });
        } else if (type === 'cashAccount' || type === 'cash') {
            const isAll = (type === 'cash' || id === 'cash' || id === 'all');
            const targetAccounts = isAll 
                ? (cashAccounts || []) 
                : (cashAccounts || []).filter((a: any) => a.id === id);
            const targetIds = new Set(targetAccounts.map((a: any) => a.id));
            const hasDefault = targetAccounts.some((a: any) => a.isDefault);
            const matchAcc = (accId: string | undefined, checkDefault?: boolean) => {
                if (isAll) return true;
                if (!accId) return checkDefault && hasDefault;
                return targetIds.has(accId);
            };

            opening = targetAccounts.reduce((s: number, a: any) => s + (Number(a.openingBalance) || 0), 0);
            targetAccounts.forEach((acc: any) => {
                const op = Number(acc.openingBalance || 0);
                if (op !== 0) {
                    rows.push({
                        id: 'op_' + acc.id,
                        date: 'أول الفترة',
                        type: 'رصيد افتتاحي',
                        refNo: 'افتتاحي',
                        description: `الرصيد الافتتاحي للخزينة / الحساب (${acc.name})`,
                        debit: op > 0 ? op : 0,
                        credit: op < 0 ? Math.abs(op) : 0
                    });
                }
            });

            // 1. سندات تحصيل العملاء
            (customerPayments || [])
                .filter((p: any) => matchAcc(p.paidToAccountId || p.accountId || p.cashAccountId, true))
                .forEach((p: any) => {
                    const accName = isAll ? ` [${(cashAccounts || []).find((a: any) => a.id === (p.paidToAccountId || p.accountId))?.name || 'خزينة'}]` : '';
                    rows.push({
                        id: 'cpay_' + p.id,
                        date: p.date ? p.date.split('T')[0] : '-',
                        type: 'تحصيل من عميل',
                        refNo: p.receiptNumber || p.id,
                        description: (p.notes || 'سند قبض نقدية') + accName,
                        debit: Number(p.amount || 0),
                        credit: 0
                    });
                });

            // 2. مبيعات نقدية فورية من الفواتير
            (salesInvoices || [])
                .filter((s: any) => matchAcc(s.paidToAccountId, true) && (s.status === 'approved' || s.status === 'completed' || !s.status))
                .forEach((s: any) => {
                    const linkedPaid = (customerPayments || []).filter((p: any) => p.invoiceId === s.id).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
                    const initialCash = s.initialPaidAmount != null ? Number(s.initialPaidAmount) : Math.max(0, (Number(s.paidAmount) || 0) - linkedPaid);
                    if (initialCash > 0) {
                        const accName = isAll ? ` [${(cashAccounts || []).find((a: any) => a.id === s.paidToAccountId)?.name || 'خزينة'}]` : '';
                        rows.push({
                            id: 'csale_' + s.id,
                            date: s.date ? s.date.split('T')[0] : '-',
                            type: 'مبيعات نقدية فورية',
                            refNo: s.invoiceNumber || s.id,
                            description: 'تحصيل نقدي فوري مع فاتورة البيع' + accName,
                            debit: initialCash,
                            credit: 0
                        });
                    }
                });

            // 3. مبيعات الكاشير POS
            (posSales || []).forEach((s: any) => {
                const targetId = s.paidToAccountId || (s.warehouseId ? (cashAccounts || []).find((a: any) => a.warehouseId === s.warehouseId)?.id : null);
                if (matchAcc(targetId, true)) {
                    const amount = Number(s.paidAmount || s.total || 0);
                    if (amount > 0) {
                        rows.push({
                            id: 'pos_' + s.id,
                            date: s.date ? s.date.split('T')[0] : '-',
                            type: 'مبيعات نقطة بيع POS',
                            refNo: s.receiptNumber || s.id,
                            description: 'مبيعات كاشير نقدية',
                            debit: amount,
                            credit: 0
                        });
                    }
                }
            });

            // 4. إيرادات استثنائية ومتنوعة
            (exceptionalIncomes || [])
                .filter((e: any) => matchAcc(e.paidToAccountId || e.accountId, true))
                .forEach((e: any) => {
                    rows.push({
                        id: 'einc_' + e.id,
                        date: e.date ? e.date.split('T')[0] : '-',
                        type: 'إيراد استثنائي / متنوع',
                        refNo: e.id,
                        description: e.description || 'إيراد متنوع إلى الخزينة',
                        debit: Number(e.amount || 0),
                        credit: 0
                    });
                });

            // 5. توريدات المناديب
            (repRemittances || [])
                .filter((rem: any) => matchAcc(rem.toAccountId, true))
                .forEach((rem: any) => {
                    rows.push({
                        id: 'rem_' + rem.id,
                        date: rem.date ? rem.date.split('T')[0] : '-',
                        type: 'توريد نقدية من مندوب',
                        refNo: rem.id,
                        description: `توريد نقدية من المندوب (${rem.repName || 'مندوب'})`,
                        debit: Number(rem.amount || 0),
                        credit: 0
                    });
                });

            // 6. مستردات مرتجع الشراء
            (purchaseReturns || [])
                .filter((r: any) => matchAcc(r.paidToAccountId, true) && Number(r.paidAmount || 0) > 0)
                .forEach((r: any) => {
                    rows.push({
                        id: 'pret_cash_' + r.id,
                        date: r.date ? r.date.split('T')[0] : '-',
                        type: 'استرداد نقدي لمرتجع شراء',
                        refNo: r.returnNumber || r.id,
                        description: 'استرداد نقدي لمرتجع بضاعة إلى المورد',
                        debit: Number(r.paidAmount || 0),
                        credit: 0
                    });
                });

            // 7. تحويلات وإيداعات الخزينة
            (treasuryTransactions || [])
                .filter((t: any) => matchAcc(t.accountId || t.cashAccountId))
                .forEach((t: any) => {
                    const isDep = t.type === 'deposit';
                    rows.push({
                        id: 'tx_' + t.id,
                        date: t.date ? t.date.split('T')[0] : '-',
                        type: isDep ? (t.linkedTransaction ? 'تحويل نقدية وارد' : 'إيداع خزينة') : (t.linkedTransaction ? 'تحويل نقدية صادر' : 'مسحوبات خزينة'),
                        refNo: t.referenceNumber || t.id,
                        description: t.description || t.notes || (isDep ? 'إيداع نقدي' : 'سحب نقدي'),
                        debit: isDep ? Number(t.amount || 0) : 0,
                        credit: !isDep ? Number(t.amount || 0) : 0
                    });
                });

            // 8. المصروفات التشغيلية
            (expenses || [])
                .filter((e: any) => matchAcc(e.paidFromAccountId || e.accountId, true) && e.status !== 'pending')
                .forEach((e: any) => {
                    rows.push({
                        id: 'exp_' + e.id,
                        date: e.date ? e.date.split('T')[0] : '-',
                        type: 'مصروفات تشغيلية',
                        refNo: e.expenseNumber || e.id,
                        description: e.category + (e.description ? ' - ' + e.description : ''),
                        debit: 0,
                        credit: Number(e.amount || 0)
                    });
                });

            // 9. سداد دفعات للموردين
            (supplierPayments || [])
                .filter((p: any) => matchAcc(p.paidFromAccountId || p.accountId || p.cashAccountId, true))
                .forEach((p: any) => {
                    rows.push({
                        id: 'spay_' + p.id,
                        date: p.date ? p.date.split('T')[0] : '-',
                        type: 'سداد لمورد',
                        refNo: p.receiptNumber || p.id,
                        description: p.notes || 'سند صرف نقدية لمورد',
                        debit: 0,
                        credit: Number(p.amount || 0)
                    });
                });

            // 10. مشتريات نقدية فورية مع الفاتورة
            (purchaseInvoices || [])
                .filter((p: any) => matchAcc(p.paidFromAccountId, true))
                .forEach((p: any) => {
                    const linkedPaid = (supplierPayments || []).filter((sp: any) => sp.invoiceId === p.id).reduce((sum: number, sp: any) => sum + (Number(sp.amount) || 0), 0);
                    const initialPaid = p.initialPaidAmount != null ? Number(p.initialPaidAmount) : Math.max(0, (Number(p.paidAmount) || 0) - linkedPaid);
                    if (initialPaid > 0) {
                        rows.push({
                            id: 'pinv_cash_' + p.id,
                            date: p.date ? p.date.split('T')[0] : '-',
                            type: 'مشتريات نقدية فورية',
                            refNo: p.invoiceNumber || p.id,
                            description: 'سداد نقدي فوري مع فاتورة الشراء',
                            debit: 0,
                            credit: initialPaid
                        });
                    }
                });

            // 11. سلف الموظفين
            (employeeAdvances || [])
                .filter((a: any) => matchAcc(a.paidFromAccountId || a.accountId, true))
                .forEach((a: any) => {
                    rows.push({
                        id: 'eadv_' + a.id,
                        date: a.date ? a.date.split('T')[0] : '-',
                        type: 'صرف سلفة موظف',
                        refNo: a.id,
                        description: `صرف سلفة مستردة للموظف (${a.employeeName || 'موظف'})`,
                        debit: 0,
                        credit: Number(a.amount || 0)
                    });
                });

            // 12. توزيعات الأرباح
            (profitDistributions || [])
                .filter((pd: any) => matchAcc(pd.paidFromAccountId, true))
                .forEach((pd: any) => {
                    rows.push({
                        id: 'pdist_' + pd.id,
                        date: pd.date ? pd.date.split('T')[0] : '-',
                        type: 'صرف توزيعات أرباح',
                        refNo: pd.id,
                        description: 'سداد توزيعات أرباح نقداً للشريك',
                        debit: 0,
                        credit: Number(pd.amount || 0)
                    });
                });

            // 13. الرواتب والأجور
            (payrollRecords || [])
                .filter((pr: any) => matchAcc(pr.paidFromAccountId, true))
                .forEach((pr: any) => {
                    const totalNet = (pr.payrollData || []).reduce((sum: number, p: any) => sum + (Number(p.netSalary) || 0), 0);
                    if (totalNet > 0) {
                        rows.push({
                            id: 'payr_' + pr.id,
                            date: pr.date ? pr.date.split('T')[0] : '-',
                            type: 'مسيرات رواتب',
                            refNo: pr.id,
                            description: `صرف رواتب شهر ${pr.month || ''} (${(pr.payrollData || []).length} موظف)`,
                            debit: 0,
                            credit: totalNet
                        });
                    }
                });

            rows.sort(safeDateSort);
            let cur = 0;
            rows.forEach(r => {
                cur += (r.debit || 0) - (r.credit || 0);
                r.balance = cur;
            });
        } else if (type === 'warehouse' || type === 'inv') {
            const isAll = (type === 'inv' || id === 'inv' || id === 'all');
            const targetWh = isAll 
                ? [...warehouses, ...inventoryZones] 
                : [...warehouses, ...inventoryZones].filter((w: any) => w.id === id);
            const targetWhIds = new Set(targetWh.map((w: any) => w.id));
            const matchWh = (wId: string | undefined) => isAll ? true : (wId ? targetWhIds.has(wId) : false);

            // حساب أرصدة الأصناف بالمخزن
            (allItems || []).forEach((it: any) => {
                let stock = 0;
                if (isAll) {
                    targetWh.forEach((w: any) => {
                        stock += calculateStockForItemInWarehouse(it.id, w.id, allData);
                    });
                } else {
                    stock = calculateStockForItemInWarehouse(it.id, id, allData);
                }

                if (Math.abs(stock) > 0.001) {
                    const cost = details.getItemCost ? details.getItemCost(it.id, Number(it.cost || 0)) : Number(it.cost || 0);
                    warehouseItems.push({
                        id: it.id,
                        name: it.name,
                        barcode: it.barcode,
                        qty: stock,
                        cost,
                        total: stock * cost
                    });
                }
            });
            warehouseItems.sort((a, b) => b.total - a.total);

            // حركات الوارد والصادر بالمخزن
            (stockInRecords || [])
                .filter((si: any) => matchWh(si.warehouseId))
                .forEach((si: any) => {
                    const totalVal = (si.items || []).reduce((sum: number, it: any) => sum + (Number(it.qty || it.quantity || 0) * (Number(it.cost || it.unitCost || it.price || 0) || (details.getItemCost ? details.getItemCost(it.id || it.itemId, 0) : 0))), 0);
                    rows.push({
                        id: 'si_' + si.id,
                        date: si.date ? si.date.split('T')[0] : '-',
                        type: 'إذن استلام مخزني (وارد)',
                        refNo: si.recordNumber || si.id,
                        description: `استلام بضاعة بالمستودع (${(si.items || []).length} صنف)`,
                        debit: totalVal,
                        credit: 0
                    });
                });

            (stockOutRecords || [])
                .filter((so: any) => matchWh(so.warehouseId))
                .forEach((so: any) => {
                    const totalVal = (so.items || []).reduce((sum: number, it: any) => sum + (Number(it.qty || it.quantity || 0) * (Number(it.cost || it.unitCost || it.price || 0) || (details.getItemCost ? details.getItemCost(it.id || it.itemId, 0) : 0))), 0);
                    rows.push({
                        id: 'so_' + so.id,
                        date: so.date ? so.date.split('T')[0] : '-',
                        type: 'إذن صرف مخزني (صادر)',
                        refNo: so.recordNumber || so.id,
                        description: `صرف بضاعة من المستودع (${(so.items || []).length} صنف)`,
                        debit: 0,
                        credit: totalVal
                    });
                });

            (stockTransferRecords || [])
                .filter((st: any) => matchWh(st.fromWarehouseId) || matchWh(st.toWarehouseId))
                .forEach((st: any) => {
                    const isIncoming = matchWh(st.toWarehouseId);
                    const totalVal = (st.items || []).reduce((sum: number, it: any) => sum + (Number(it.qty || it.quantity || 0) * (Number(it.cost || it.unitCost || 0) || (details.getItemCost ? details.getItemCost(it.id || it.itemId, 0) : 0))), 0);
                    rows.push({
                        id: 'st_' + st.id,
                        date: st.date ? st.date.split('T')[0] : '-',
                        type: isIncoming ? 'تحويل بضاعة وارد' : 'تحويل بضاعة صادر',
                        refNo: st.transferNumber || st.id,
                        description: isIncoming ? 'تحويل بضاعة واردة من مخزن آخر' : 'تحويل بضاعة صادرة إلى مخزن آخر',
                        debit: isIncoming ? totalVal : 0,
                        credit: !isIncoming ? totalVal : 0
                    });
                });

            (stockAdjustmentRecords || [])
                .filter((sa: any) => matchWh(sa.warehouseId))
                .forEach((sa: any) => {
                    const totalVal = (sa.items || []).reduce((sum: number, it: any) => sum + (Number(it.difference || 0) * (Number(it.cost || it.price || 0) || (details.getItemCost ? details.getItemCost(it.id || it.itemId, 0) : 0))), 0);
                    rows.push({
                        id: 'sa_' + sa.id,
                        date: sa.date ? sa.date.split('T')[0] : '-',
                        type: totalVal >= 0 ? 'تسوية جردية (فائض)' : 'تسوية جردية (عجز)',
                        refNo: sa.adjustmentNumber || sa.id,
                        description: `تسوية جرد مخزني (${sa.reason || 'فروق جرد'})`,
                        debit: totalVal > 0 ? totalVal : 0,
                        credit: totalVal < 0 ? Math.abs(totalVal) : 0
                    });
                });

            // مبيعات المخزن (صرف تكلفة البضاعة المباعة)
            (salesInvoices || [])
                .filter((s: any) => matchWh(s.warehouseId) && (s.status === 'approved' || s.status === 'completed' || !s.status))
                .forEach((s: any) => {
                    const costVal = (s.items || []).reduce((sum: number, it: any) => {
                        const itemCost = details.getItemCost ? details.getItemCost(it.id || it.itemId, Number(it.cost || 0)) : Number(it.cost || 0);
                        return sum + (Number(it.qty || it.quantity || 0) * itemCost);
                    }, 0);
                    if (costVal > 0) {
                        rows.push({
                            id: 'sale_wh_' + s.id,
                            date: s.date ? s.date.split('T')[0] : '-',
                            type: 'صرف بضاعة مباعة',
                            refNo: s.invoiceNumber || s.id,
                            description: `صرف مبيعات بضاعة بتكلفة الشراء (${(s.items || []).length} صنف)`,
                            debit: 0,
                            credit: costVal
                        });
                    }
                });

            // مرتجعات مبيعات واردة للمخزن
            (salesReturns || [])
                .filter((r: any) => matchWh(r.warehouseId))
                .forEach((r: any) => {
                    const returnCost = (r.items || []).reduce((sum: number, it: any) => {
                        const itemCost = details.getItemCost ? details.getItemCost(it.id || it.itemId, Number(it.cost || 0)) : Number(it.cost || 0);
                        return sum + (Number(it.qty || it.quantity || 0) * itemCost);
                    }, 0);
                    if (returnCost > 0) {
                        rows.push({
                            id: 'ret_wh_' + r.id,
                            date: r.date ? r.date.split('T')[0] : '-',
                            type: 'مرتجع مبيعات وارد للمخزن',
                            refNo: r.returnNumber || r.id,
                            description: 'إعادة إدخال بضاعة مرتجعة من عميل إلى المستودع',
                            debit: returnCost,
                            credit: 0
                        });
                    }
                });

            rows.sort(safeDateSort);
            let cur = 0;
            rows.forEach(r => {
                cur += (r.debit || 0) - (r.credit || 0);
                r.balance = cur;
            });
        } else if (type === 'asset' || type === 'assets') {
            const isAll = (type === 'assets' || id === 'assets' || id === 'all');
            const targetAssets = isAll 
                ? (fixedAssets || []) 
                : (fixedAssets || []).filter((a: any) => a.id === id);

            targetAssets.forEach((as: any) => {
                const depList = (depreciationRecords || []).filter((d: any) => d.assetId === as.id);

                rows.push({
                    id: 'as_' + as.id,
                    date: as.purchaseDate ? as.purchaseDate.split('T')[0] : 'أول الفترة',
                    type: 'شراء أصل ثابت',
                    refNo: as.id,
                    description: `شراء ${as.name} (تكلفة اقتناء الأصل)`,
                    debit: Number(as.cost || 0),
                    credit: 0,
                    balance: Number(as.cost || 0)
                });

                depList.forEach((d: any) => {
                    rows.push({
                        id: 'dep_' + d.id,
                        date: d.date ? d.date.split('T')[0] : '-',
                        type: 'قسط إهلاك دوري',
                        refNo: d.id,
                        description: `مجمع إهلاك ${as.name} للفترة`,
                        debit: 0,
                        credit: Number(d.amount || 0)
                    });
                });
            });

            rows.sort(safeDateSort);
            let cur = 0;
            rows.forEach(r => {
                cur += (r.debit || 0) - (r.credit || 0);
                r.balance = cur;
            });
        } else if (type === 'capital') {
            // رصيد حقوق الملكية الافتتاحي الناتج عن فارق الأصول والخصوم الافتتاحية
            const openingAssetsVal = (cashAccounts || []).reduce((s: number, c: any) => s + (Number(c.openingBalance) || 0), 0) +
                                     (customers || []).reduce((s: number, c: any) => s + (Number(c.openingBalance) || 0), 0);
            const openingLiabVal = (suppliers || []).reduce((s: number, sup: any) => s + (Number(sup.openingBalance) || 0), 0);
            const openingBalanceEquity = Math.max(openingAssetsVal - openingLiabVal, 0);

            if (openingBalanceEquity > 0) {
                rows.push({
                    id: 'cap_op',
                    date: 'أول الفترة',
                    type: 'رأس المال الافتتاحي',
                    refNo: 'CAP_OPENING',
                    description: 'رأس المال التأسيسي الافتتاحي (صافي الأصول الافتتاحية للخزائن والعملاء minus الموردين)',
                    debit: 0,
                    credit: openingBalanceEquity
                });
            }

            // حصص الشركاء المدفوعة
            (partners || []).forEach((p: any) => {
                if (Number(p.capital || 0) > 0) {
                    rows.push({
                        id: 'p_' + p.id,
                        date: 'أول الفترة',
                        type: 'حصة رأس مال شريك',
                        refNo: p.id,
                        description: `حصة الشريك (${p.name}) بنسبة ${p.sharePercentage || 0}%`,
                        debit: 0,
                        credit: Number(p.capital || 0)
                    });
                }
            });

            // إيداعات زيادة رأس المال ومسحوبات الشركاء من الخزينة
            (treasuryTransactions || []).filter((tx: any) => !tx.linkedTransaction).forEach((tx: any) => {
                if (tx.type === 'deposit') {
                    rows.push({
                        id: 'cap_in_' + tx.id,
                        date: tx.date ? tx.date.split('T')[0] : '-',
                        type: 'إيداع زيادة رأس مال',
                        refNo: tx.referenceNumber || tx.id,
                        description: tx.description || 'زيادة رأس مال نقداً بالخزينة',
                        debit: 0,
                        credit: Number(tx.amount || 0)
                    });
                } else if (tx.type === 'withdrawal') {
                    rows.push({
                        id: 'cap_out_' + tx.id,
                        date: tx.date ? tx.date.split('T')[0] : '-',
                        type: 'مسحوبات من رأس المال',
                        refNo: tx.referenceNumber || tx.id,
                        description: tx.description || 'سحب من رأس المال',
                        debit: Number(tx.amount || 0),
                        credit: 0
                    });
                }
            });

            rows.sort(safeDateSort);
            let cur = 0;
            rows.forEach(r => {
                cur += (r.credit || 0) - (r.debit || 0);
                r.balance = cur;
            });
        } else if (type === 'netIncome') {
            const inc = incomeData || {};
            rows.push({
                id: 'rev_gross',
                date: 'الفترة الحالية',
                type: 'إجمالي المبيعات الإيرادية',
                refNo: 'REV_GROSS',
                description: 'إجمالي مبيعات البضاعة والنشاط التجاري',
                debit: 0,
                credit: Number(inc.grossRevenue || 0)
            });

            if (Number(inc.totalSalesReturns || 0) > 0) {
                rows.push({
                    id: 'rev_ret',
                    date: 'الفترة الحالية',
                    type: 'مرتجعات ومسموحات المبيعات',
                    refNo: 'SALES_RET',
                    description: 'مرتجعات البضاعة المخصومة من الإيرادات',
                    debit: Number(inc.totalSalesReturns || 0),
                    credit: 0
                });
            }

            if (Number(inc.totalSalesDiscount || 0) > 0) {
                rows.push({
                    id: 'rev_disc',
                    date: 'الفترة الحالية',
                    type: 'خصم مسموح به',
                    refNo: 'SALES_DISC',
                    description: 'خصومات المبيعات الممنوحة للعملاء',
                    debit: Number(inc.totalSalesDiscount || 0),
                    credit: 0
                });
            }

            if (Number(inc.costOfGoodsSold || 0) > 0) {
                rows.push({
                    id: 'cogs',
                    date: 'الفترة الحالية',
                    type: 'تكلفة البضاعة المباعة (COGS)',
                    refNo: 'COGS',
                    description: 'تكلفة شراء البضاعة التي تم بيعها خلال الفترة',
                    debit: Number(inc.costOfGoodsSold || 0),
                    credit: 0
                });
            }

            // المصروفات التشغيلية مفصلة حسب النوع
            Object.entries(inc.expensesByType || {}).forEach(([expType, expAmount]: any) => {
                if (Number(expAmount || 0) > 0) {
                    rows.push({
                        id: 'exp_' + expType,
                        date: 'الفترة الحالية',
                        type: 'مصروف تشغيلي: ' + expType,
                        refNo: 'OP_EXP',
                        description: `مصروفات نشاط تشغيلية معتمدة (${expType})`,
                        debit: Number(expAmount || 0),
                        credit: 0
                    });
                }
            });

            if (Number(inc.totalEarnedDiscount || 0) > 0) {
                rows.push({
                    id: 'disc_earned',
                    date: 'الفترة الحالية',
                    type: 'خصم مكتسب على المشتريات',
                    refNo: 'EARNED_DISC',
                    description: 'خصومات الشراء المكتسبة من الموردين',
                    debit: 0,
                    credit: Number(inc.totalEarnedDiscount || 0)
                });
            }

            if (Number(inc.totalExceptionalIncome || 0) > 0) {
                rows.push({
                    id: 'inc_extra',
                    date: 'الفترة الحالية',
                    type: 'إيرادات استثنائية ومتنوعة',
                    refNo: 'EXTRA_INC',
                    description: 'أرباح متنوعة واستثنائية خارج النشاط الرئيسي',
                    debit: 0,
                    credit: Number(inc.totalExceptionalIncome || 0)
                });
            }

            let cur = 0;
            rows.forEach(r => {
                cur += (r.credit || 0) - (r.debit || 0);
                r.balance = cur;
            });
        } else if (type === 'distribution' || type === 'dist') {
            const isAll = (type === 'dist' || id === 'dist' || id === 'all');
            const targetDists = isAll 
                ? (profitDistributions || []) 
                : (profitDistributions || []).filter((d: any) => d.partnerId === id);

            targetDists.forEach((d: any) => {
                const p = (partners || []).find((part: any) => part.id === d.partnerId);
                rows.push({
                    id: d.id,
                    date: d.date ? d.date.split('T')[0] : '-',
                    type: 'توزيع أرباح',
                    refNo: d.id,
                    description: `توزيع أرباح للشريك (${p?.name || 'شريك'})`,
                    debit: Number(d.amount || 0),
                    credit: 0,
                    balance: Number(d.amount || 0)
                });
            });
            rows.sort(safeDateSort);
        } else if (type === 'advances') {
            (employeeAdvances || []).forEach((adv: any) => {
                const amt = Number(adv.amount || 0);
                rows.push({
                    id: adv.id,
                    date: adv.date ? adv.date.split('T')[0] : '-',
                    type: 'سلفة موظف',
                    refNo: adv.id,
                    description: `سلفة للموظف (${adv.employeeName || 'موظف'}) - حالة: ${adv.status === 'approved' ? 'معتمدة' : adv.status}`,
                    debit: amt,
                    credit: adv.repaid ? amt : 0,
                    balance: adv.repaid ? 0 : amt
                });
            });
            rows.sort(safeDateSort);
        } else if (type === 'vatinput') {
            (purchaseInvoices || []).filter((inv: any) => Number(inv.tax || inv.Tax || 0) > 0).forEach((inv: any) => {
                const tax = Number(inv.tax || inv.Tax || 0);
                const sup = (suppliers || []).find((s: any) => s.id === inv.supplierId);
                rows.push({
                    id: inv.id,
                    date: inv.date ? inv.date.split('T')[0] : '-',
                    type: 'ضريبة مشتريات (مدخلات)',
                    refNo: inv.invoiceNumber || inv.id,
                    description: `ضريبة مدخلات فاتورة شراء من مورد (${sup?.name || 'مورد'}) - إجمالي الفاتورة: ${inv.total} ج.م`,
                    debit: tax,
                    credit: 0,
                    balance: tax
                });
            });
            rows.sort(safeDateSort);
        } else if (type === 'vatoutput') {
            (salesInvoices || []).filter((inv: any) => Number(inv.tax || inv.Tax || 0) > 0).forEach((inv: any) => {
                const tax = Number(inv.tax || inv.Tax || 0);
                const cust = (customers || []).find((c: any) => c.id === inv.customerId);
                rows.push({
                    id: inv.id,
                    date: inv.date ? inv.date.split('T')[0] : '-',
                    type: 'ضريبة مخرجات (مبيعات)',
                    refNo: inv.invoiceNumber || inv.id,
                    description: `ضريبة مخرجات فاتورة بيع لعميل (${cust?.name || 'عميل'}) - إجمالي الفاتورة: ${inv.total} ج.م`,
                    debit: 0,
                    credit: tax,
                    balance: tax
                });
            });
            rows.sort(safeDateSort);
        } else if (type === 'accruedExpenses') {
            (expenses || []).filter((e: any) => e.status === 'pending').forEach((e: any) => {
                const amt = Number(e.amount || 0);
                rows.push({
                    id: e.id,
                    date: e.date ? e.date.split('T')[0] : '-',
                    type: 'مصروف مستحق معلق',
                    refNo: e.expenseNumber || e.id,
                    description: `${e.category} - ${e.description || 'مصروف مستحق لم يُسدد بعد'}`,
                    debit: 0,
                    credit: amt,
                    balance: amt
                });
            });
            rows.sort(safeDateSort);
        } else if (type === 'intransit') {
            (stockInRecords || []).filter((si: any) => (si.status || '').toLowerCase() === 'in_transit').forEach((si: any) => {
                const totalVal = (si.items || []).reduce((sum: number, it: any) => sum + (Number(it.qty || 0) * Number(it.cost || 0)), 0);
                rows.push({
                    id: si.id,
                    date: si.date ? si.date.split('T')[0] : '-',
                    type: 'بضاعة بالطريق',
                    refNo: si.recordNumber || si.id,
                    description: `شحنة بضاعة في الطريق (${(si.items || []).length} صنف)`,
                    debit: totalVal,
                    credit: 0,
                    balance: totalVal
                });
            });
            rows.sort(safeDateSort);
        } else if (type === 'repinv') {
            Object.entries(details.repInventoryByItem || {}).forEach(([itemId, qty]: any) => {
                if (qty > 0.001) {
                    const it = (allItems || []).find((x: any) => x.id === itemId);
                    const cost = details.getItemCost ? details.getItemCost(itemId, Number(it?.cost || 0)) : Number(it?.cost || 0);
                    rows.push({
                        id: itemId,
                        date: 'الرصيد الفعلي',
                        type: 'عهدة مندوب',
                        refNo: it?.barcode || itemId,
                        description: `صنف بعهدة المناديب: ${it?.name || itemId} (الكمية: ${qty})`,
                        debit: qty * cost,
                        credit: 0,
                        balance: qty * cost
                    });
                }
            });
            rows.sort(safeDateSort);
        } else if (type === 'valuationReserve') {
            rows.push({
                id: 'val_res',
                date: 'تسوية آلية',
                type: 'تسوية توازن المركز المالي',
                refNo: 'EQUITY_RES',
                description: 'تسوية قيود التقييم التلقائية لضمان اتزان الأصول تماماً مع الخصوم وحقوق الملكية',
                debit: totals.valuationReserve < 0 ? Math.abs(totals.valuationReserve) : 0,
                credit: totals.valuationReserve >= 0 ? totals.valuationReserve : 0,
                balance: totals.valuationReserve
            });
        }

        const totalDebit = rows.reduce((s, r) => s + (r.debit || 0), 0);
        const totalCredit = rows.reduce((s, r) => s + (r.credit || 0), 0);
        const finalBalance = drillDownModal.balance;

        return { rows, warehouseItems, opening, totalDebit, totalCredit, finalBalance };
    }, [drillDownModal, allData, netIncome, incomeData, customers, suppliers, salesInvoices, customerPayments, salesReturns, purchaseInvoices, supplierPayments, purchaseReturns, cashAccounts, treasuryTransactions, expenses, exceptionalIncomes, employeeAdvances, stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, fixedAssets, depreciationRecords, partners, profitDistributions, allItems, details, totals, posSales, posReturns, repRemittances, payrollRecords]);

    const filteredModalRows = useMemo(() => {
        if (!modalSearch.trim()) return modalData.rows;
        const s = modalSearch.trim().toLowerCase();
        return modalData.rows.filter(r =>
            (r.refNo && r.refNo.toLowerCase().includes(s)) ||
            (r.description && r.description.toLowerCase().includes(s)) ||
            (r.type && r.type.toLowerCase().includes(s)) ||
            (r.date && r.date.includes(s))
        );
    }, [modalData.rows, modalSearch]);

    const filteredWarehouseItems = useMemo(() => {
        if (!modalSearch.trim()) return modalData.warehouseItems;
        const s = modalSearch.trim().toLowerCase();
        return modalData.warehouseItems.filter(i =>
            i.name.toLowerCase().includes(s) || (i.barcode && i.barcode.toLowerCase().includes(s))
        );
    }, [modalData.warehouseItems, modalSearch]);

    if (loading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    const formatN = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

    const SectionHeader = ({ id, title, total, count }: { id: string, title: string, total: number, count?: number }) => (
        <TableRow 
            className="cursor-pointer bg-muted/20 hover:bg-muted/40 font-bold group select-none transition-colors border-b"
            onClick={() => openDrillDown({ id, name: title, balance: total, type: id })}
            title="انقر لعرض كشف الحساب والعمليات التفصيلية للبند"
        >
            <TableCell className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-muted rounded-full shrink-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleSection(id);
                        }}
                        title={expandedSections[id] ? "طي البنود الفرعية" : "توسيع البنود الفرعية"}
                    >
                        {expandedSections[id] ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                    <span className="group-hover:text-primary transition-colors flex items-center gap-1.5">
                        {title}
                        {count !== undefined && count > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                                {count}
                            </Badge>
                        )}
                    </span>
                </span>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground group-hover:text-primary font-normal flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10 text-primary px-2 py-0.5 rounded">
                        <Search className="h-3 w-3" /> كشف تفصيلي
                    </span>
                </div>
            </TableCell>
            <TableCell className="text-left font-mono font-bold py-2.5 text-base">
                ج.م {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </TableCell>
        </TableRow>
    );

    const DetailRows = ({ id, data }: { id: string, data: any[] }) => {
        if (!expandedSections[id]) return null;
        return (
            <>
                {data.map((item, idx) => (
                    <TableRow 
                        key={idx} 
                        onClick={() => openDrillDown(item, id)}
                        className="bg-background/50 hover:bg-primary/10 cursor-pointer text-muted-foreground hover:text-foreground transition-all animate-in fade-in slide-in-from-top-1 group"
                        title="انقر لعرض كشف الحركات والعمليات التفصيلية"
                    >
                        <TableCell className="pr-10 flex items-center justify-between py-2">
                            <span className="font-medium group-hover:text-primary transition-colors flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 text-primary/60 group-hover:text-primary shrink-0" />
                                {item.name}
                            </span>
                            <span className="text-[11px] text-muted-foreground/70 group-hover:text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10 px-2 py-0.5 rounded">
                                <Search className="h-3 w-3" /> كشف الحركات
                            </span>
                        </TableCell>
                        <TableCell className="text-left font-mono font-semibold py-2">ج.م {item.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                ))}
                {data.length === 0 && (
                    <TableRow className="bg-background/50 italic text-muted-foreground">
                        <TableCell colSpan={2} className="text-center py-2 text-xs">لا توجد بنود فرعية مسجلة حالياً</TableCell>
                    </TableRow>
                )}
            </>
        );
    };

    return (
        <>
        {/* شريط الإجراءات السريعة للميزانية */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 p-3 bg-muted/20 border rounded-xl">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <Layers className="h-4 w-4" />
                </div>
                <div>
                    <span className="text-xs font-bold block text-foreground">
                        استعراض تفاصيل وبنود المركز المالي
                    </span>
                    <span className="text-[11px] text-muted-foreground block">
                        انقر على أي بند رئيسي أو فرعي لفتح كشف العمليات والحركات التفصيلية مباشرة
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button 
                    type="button"
                    variant="outline" 
                    size="sm" 
                    onClick={toggleAllSections}
                    className="h-8 text-xs gap-1.5"
                >
                    <ArrowRightLeft className="h-3.5 w-3.5 rotate-90" />
                    <span>{Object.values(expandedSections).some(v => !v) ? 'توسيع كافة البنود' : 'طي كافة البنود'}</span>
                </Button>
            </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
            {/* ASSETS SIDE */}
            <div>
                <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2 text-primary"><Plus className="h-5 w-5"/> الأصول (Assets)</h3>
                <Table>
                    <TableBody>
                        <SectionHeader id="cash" title="النقدية وما في حكمها" total={totals.cash} count={details.cashDetails.length} />
                        <DetailRows id="cash" data={details.cashDetails} />

                        <SectionHeader id="ar" title="حسابات العملاء (الذمم المدينة)" total={totals.ar} count={details.arDetails.length} />
                        <DetailRows id="ar" data={details.arDetails} />

                        <SectionHeader id="inv" title="قيمة المخزون (بالتكلفة)" total={totals.inv} count={details.inventoryDetails.length} />
                        <DetailRows id="inv" data={details.inventoryDetails} />

                        {totals.repInv > 0.01 && (
                            <>
                                <SectionHeader id="repinv" title="مخزون عهدة المناديب" total={totals.repInv} />
                                {expandedSections['repinv'] && (
                                    <TableRow 
                                        className="bg-background/50 text-muted-foreground cursor-pointer hover:bg-primary/5 transition-colors group"
                                        onClick={() => openDrillDown({ id: 'repinv', name: 'مخزون عهدة المناديب', balance: totals.repInv, type: 'repinv' })}
                                        title="انقر لعرض تفاصيل عهدة المناديب"
                                    >
                                        <TableCell className="pr-10 text-xs flex items-center justify-between">
                                            <span className="flex items-center gap-1.5">
                                                <FileText className="h-3 w-3 text-primary/60 group-hover:text-primary" />
                                                مخزون مُسلَّم للمناديب ولم يُرجع بعد (الكمية × التكلفة)
                                            </span>
                                            <span className="text-[11px] text-muted-foreground/70 group-hover:text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10 px-2 py-0.5 rounded">
                                                <Search className="h-3 w-3" /> كشف الأصناف
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-left font-mono">ج.م {totals.repInv.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                )}
                            </>
                        )}

                        {totals.inTransit > 0.01 && (
                            <>
                                <SectionHeader id="intransit" title="بضاعة بالطريق (In Transit)" total={totals.inTransit} />
                                {expandedSections['intransit'] && (
                                    <TableRow 
                                        className="bg-background/50 text-muted-foreground cursor-pointer hover:bg-primary/5 transition-colors group"
                                        onClick={() => openDrillDown({ id: 'intransit', name: 'بضاعة بالطريق (In Transit)', balance: totals.inTransit, type: 'intransit' })}
                                        title="انقر لعرض مستندات بضاعة بالطريق"
                                    >
                                        <TableCell className="pr-10 text-xs flex items-center justify-between">
                                            <span className="flex items-center gap-1.5">
                                                <FileText className="h-3 w-3 text-primary/60 group-hover:text-primary" />
                                                بضاعة أُمر باستلامها ولم تصل للمستودع بعد
                                            </span>
                                            <span className="text-[11px] text-muted-foreground/70 group-hover:text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10 px-2 py-0.5 rounded">
                                                <Search className="h-3 w-3" /> تفاصيل السندات
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-left font-mono">ج.م {totals.inTransit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                )}
                            </>
                        )}

                        {totals.vatInput > 0.01 && (
                            <>
                                <SectionHeader id="vatinput" title="ضريبة القيمة المضافة المدخلات (قابلة للخصم)" total={totals.vatInput} />
                                {expandedSections['vatinput'] && (
                                    <TableRow 
                                        className="bg-background/50 text-muted-foreground cursor-pointer hover:bg-primary/5 transition-colors group"
                                        onClick={() => openDrillDown({ id: 'vatinput', name: 'ضريبة القيمة المضافة المدخلات (مشتريات قابلة للخصم)', balance: totals.vatInput, type: 'vatinput' })}
                                        title="انقر لعرض فواتير ضريبة المدخلات"
                                    >
                                        <TableCell className="pr-10 text-xs flex items-center justify-between">
                                            <span className="flex items-center gap-1.5">
                                                <FileText className="h-3 w-3 text-primary/60 group-hover:text-primary" />
                                                ضريبة مشتريات مدفوعة قابلة للاسترداد من الضريبة المحصّلة
                                            </span>
                                            <span className="text-[11px] text-muted-foreground/70 group-hover:text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10 px-2 py-0.5 rounded">
                                                <Search className="h-3 w-3" /> كشف الفواتير
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-left font-mono">ج.م {totals.vatInput.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                )}
                            </>
                        )}

                        {totals.advances > 0.01 && (
                            <TableRow 
                                className="font-semibold cursor-pointer hover:bg-primary/5 transition-colors group"
                                onClick={() => openDrillDown({ id: 'advances', name: 'سلف الموظفين (ذمم مدينة مستردة)', balance: totals.advances, type: 'advances' })}
                                title="انقر لعرض سندات سلف الموظفين"
                            >
                                <TableCell className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <FileText className="h-3.5 w-3.5 text-primary/60 group-hover:text-primary" />
                                        سلف الموظفين (ذمم مدينة مستردة)
                                    </span>
                                    <span className="text-[11px] text-muted-foreground/70 group-hover:text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10 px-2 py-0.5 rounded">
                                        <Search className="h-3 w-3" /> كشف السلف
                                    </span>
                                </TableCell>
                                <TableCell className="text-left font-mono">ج.م {totals.advances.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        )}

                        <SectionHeader id="assets" title="الأصول الثابتة (الصافي)" total={totals.assets} count={details.assetDetails.length} />
                        <DetailRows id="assets" data={details.assetDetails} />
                    </TableBody>
                    <TableFooter>
                        <TableRow className="bg-primary/10 border-t-2 border-primary">
                            <TableHead className="font-black text-lg">إجمالي الأصول</TableHead>
                            <TableHead className="text-left font-black text-lg">ج.م {totals.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableHead>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>

            {/* LIABILITIES & EQUITY SIDE */}
            <div className="space-y-8">
                <div>
                    <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2 text-destructive"><Minus className="h-5 w-5"/> الخصوم (Liabilities)</h3>
                    <Table>
                        <TableBody>
                            <SectionHeader id="ap" title="حسابات الموردين (الذمم الدائنة)" total={totals.ap} count={details.apDetails.length} />
                            <DetailRows id="ap" data={details.apDetails} />
                            {totals.accruedExpenses > 0.01 && (
                                <TableRow 
                                    className="font-semibold cursor-pointer hover:bg-destructive/5 transition-colors group"
                                    onClick={() => openDrillDown({ id: 'accruedExpenses', name: 'المصروفات المستحقة (التزامات تشغيلية معلقة)', balance: totals.accruedExpenses, type: 'accruedExpenses' })}
                                    title="انقر لعرض المصروفات المستحقة"
                                >
                                    <TableCell className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                            <FileText className="h-3.5 w-3.5 text-destructive/70 group-hover:text-destructive" />
                                            المصروفات المستحقة (التزامات تشغيلية معلقة)
                                        </span>
                                        <span className="text-[11px] text-muted-foreground/70 group-hover:text-destructive flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/10 px-2 py-0.5 rounded">
                                            <Search className="h-3 w-3" /> كشف المصروفات
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-left font-mono">ج.م {totals.accruedExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            )}
                            {totals.vatOutput > 0.01 && (
                                <TableRow 
                                    className="font-semibold cursor-pointer hover:bg-destructive/5 transition-colors group"
                                    onClick={() => openDrillDown({ id: 'vatoutput', name: 'ضريبة القيمة المضافة المحصلة (المخرجات المستحقة)', balance: totals.vatOutput, type: 'vatoutput' })}
                                    title="انقر لعرض فواتير ضريبة المخرجات"
                                >
                                    <TableCell className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                            <FileText className="h-3.5 w-3.5 text-destructive/70 group-hover:text-destructive" />
                                            ضريبة القيمة المضافة المحصلة (المخرجات المستحقة)
                                        </span>
                                        <span className="text-[11px] text-muted-foreground/70 group-hover:text-destructive flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/10 px-2 py-0.5 rounded">
                                            <Search className="h-3 w-3" /> كشف الفواتير
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-left font-mono">ج.م {totals.vatOutput.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="bg-destructive/10 border-t-2 border-destructive">
                                <TableHead className="font-black text-base">إجمالي الخصوم</TableHead>
                                <TableHead className="text-left font-black text-base">ج.م {totals.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableHead>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>

                <div>
                    <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2 text-foreground">حقوق الملكية (Equity)</h3>
                    <Table>
                        <TableBody>
                            <TableRow 
                                className="font-semibold cursor-pointer hover:bg-muted/10 transition-colors group"
                                onClick={() => openDrillDown({ id: 'capital', name: 'رأس المال (الافتتاحي + الاستثمارات)', balance: details.totalCapitalValue, type: 'capital' })}
                                title="انقر لعرض حركات رأس المال"
                            >
                                <TableCell className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <Landmark className="h-3.5 w-3.5 text-foreground shrink-0" />
                                        رأس المال (الافتتاحي + الاستثمارات)
                                    </span>
                                    <span className="text-[11px] text-muted-foreground group-hover:text-foreground flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-muted px-2 py-0.5 rounded">
                                        <Search className="h-3 w-3" /> التفاصيل
                                    </span>
                                </TableCell>
                                <TableCell className="text-left font-mono text-foreground">ج.م {details.totalCapitalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                            
                            <TableRow 
                                className="font-semibold cursor-pointer hover:bg-muted/10 transition-colors group"
                                onClick={() => openDrillDown({ id: 'netIncome', name: 'الأرباح المحتجزة (صافي الدخل)', balance: netIncome, type: 'netIncome' })}
                                title="انقر لعرض بنود الإيرادات والمصروفات المؤثرة على صافي الدخل"
                            >
                                <TableCell className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <TrendingDown className="h-3.5 w-3.5 text-foreground shrink-0" />
                                        الأرباح المحتجزة (صافي الدخل)
                                    </span>
                                    <span className="text-[11px] text-muted-foreground group-hover:text-foreground flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-muted px-2 py-0.5 rounded">
                                        <Search className="h-3 w-3" /> قائمة الدخل
                                    </span>
                                </TableCell>
                                <TableCell className={cn("text-left font-mono font-bold", netIncome > 0 ? "text-emerald-500" : netIncome < 0 ? "text-[#CD5C5C]" : "text-foreground")}>ج.م {netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                            
                            <SectionHeader id="dist" title="(-) توزيعات الأرباح" total={totals.dist} count={details.distributionsDetails.length} />
                            <DetailRows id="dist" data={details.distributionsDetails} />

                            {Math.abs(totals.valuationReserve) > 0.001 && (
                                <TableRow 
                                    className="font-semibold text-muted-foreground bg-muted/15 border-t border-dashed cursor-pointer hover:bg-muted/30 transition-colors group"
                                    onClick={() => openDrillDown({ id: 'valuationReserve', name: 'فروق تقييم المخزون وتسوية المركز المالي', balance: totals.valuationReserve, type: 'valuationReserve' })}
                                    title="انقر لعرض تفاصيل التسوية"
                                >
                                    <TableCell className="flex items-center justify-between py-2.5">
                                        <div className="flex items-center gap-1.5">
                                            <Scale className="h-4 w-4 text-foreground shrink-0" />
                                            <span>فروق تقييم المخزون وتسوية المركز المالي</span>
                                            <Badge variant="outline" className="text-[10px] px-1 py-0 text-foreground border-border">تسوية تلقائية</Badge>
                                        </div>
                                        <span className="text-[11px] text-muted-foreground group-hover:text-foreground flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-muted px-2 py-0.5 rounded">
                                            <Search className="h-3 w-3" /> التفاصيل
                                        </span>
                                    </TableCell>
                                    <TableCell className={cn("text-left font-mono", totals.valuationReserve < 0 ? "text-[#CD5C5C]" : "text-foreground")}>
                                        ج.م {totals.valuationReserve.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="bg-muted/30 border-t-2 border-border">
                                <TableHead className="font-black text-lg text-foreground">إجمالي حقوق الملكية</TableHead>
                                <TableHead className="text-left font-black text-lg font-mono text-foreground">ج.م {totals.totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableHead>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>

                <div className="pt-4 border-t-4 border-double border-muted-foreground/50">
                    <div className="flex justify-between items-center p-4 bg-muted/30 rounded-xl">
                        <span className="font-black text-xl">إجمالي الخصوم وحقوق الملكية</span>
                        <span className="font-black text-2xl text-primary">ج.م {(totals.totalLiabilities + totals.totalEquity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    {Math.abs(totals.totalAssets - (totals.totalLiabilities + totals.totalEquity)) > 0.05 ? (
                        <div className="mt-2 text-xs text-destructive text-center flex items-center justify-center gap-1">
                            <AlertTriangle className="h-3 w-3"/> الميزانية غير متوازنة — الفرق: {Math.abs(totals.totalAssets - (totals.totalLiabilities + totals.totalEquity)).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م. راجع التشخيص أدناه.
                        </div>
                    ) : (
                        <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 text-center flex items-center justify-center gap-1 font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5"/> الميزانية العمومية متزنة تماماً بنسبة 100% (الأصول = الخصوم + حقوق الملكية).
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* قسم تشخيص الفروق */}
        <div className="mt-8">
            <h3 className="text-base font-bold mb-4 flex items-center gap-2 border-b pb-2">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                تشخيص أسباب الفرق وعرض المستندات المسببة للمشاكل
            </h3>
            <BalanceDiagnostics totals={totals} details={details} netIncome={netIncome} allData={allData} />
        </div>

        {/* نافذة Pop Screen لعرض جميع حركات البند المنبثقة من الميزانية */}
        <Dialog open={drillDownModal.isOpen} onOpenChange={(open) => setDrillDownModal(prev => ({ ...prev, isOpen: open }))}>
            <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] flex flex-col p-0 overflow-hidden" dir="rtl">
                <DialogHeader className="p-4 border-b bg-muted/30 shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <DialogTitle className="text-lg font-bold">
                                        كشف تفصيلي: {drillDownModal.name}
                                    </DialogTitle>
                                    <Badge variant="outline" className="text-xs">
                                        {drillDownModal.type === 'customer' || drillDownModal.type === 'ar' ? (drillDownModal.id === 'ar' ? 'إجمالي العملاء' : 'عميل')
                                            : drillDownModal.type === 'supplier' || drillDownModal.type === 'ap' ? (drillDownModal.id === 'ap' ? 'إجمالي الموردين' : 'مورد')
                                            : drillDownModal.type === 'cashAccount' || drillDownModal.type === 'cash' ? (drillDownModal.id === 'cash' ? 'إجمالي النقدية والبنوك' : 'خزينة / بنك')
                                            : drillDownModal.type === 'warehouse' || drillDownModal.type === 'inv' ? (drillDownModal.id === 'inv' ? 'إجمالي المخزون' : 'مستودع')
                                            : drillDownModal.type === 'asset' || drillDownModal.type === 'assets' ? 'أصول ثابتة'
                                            : drillDownModal.type === 'partner' || drillDownModal.type === 'distribution' || drillDownModal.type === 'dist' ? 'توزيعات أرباح'
                                            : drillDownModal.type === 'capital' ? 'رأس المال'
                                            : drillDownModal.type === 'netIncome' ? 'قائمة الدخل والأرباح'
                                            : drillDownModal.type === 'advances' ? 'سلف الموظفين'
                                            : drillDownModal.type === 'vatinput' ? 'ضريبة مدخلات'
                                            : drillDownModal.type === 'vatoutput' ? 'ضريبة مخرجات'
                                            : drillDownModal.type === 'accruedExpenses' ? 'مصروفات مستحقة'
                                            : drillDownModal.type === 'repinv' ? 'عهدة مناديب'
                                            : drillDownModal.type === 'intransit' ? 'بضاعة بالطريق'
                                            : drillDownModal.type === 'valuationReserve' ? 'تسوية توازن المركز المالي'
                                            : 'بند ميزانية'}
                                    </Badge>
                                </div>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                    عرض جميع العمليات والسندات المؤثرة على رصيد البند في المركز المالي
                                </DialogDescription>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 gap-1 text-xs"
                                onClick={() => window.print()}
                            >
                                <Printer className="h-3.5 w-3.5" />
                                <span>طباعة الكشف</span>
                            </Button>
                        </div>
                    </div>

                    {/* بطاقات المؤشرات المالية السريعة للبند */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                        <div className="p-2.5 rounded-lg border bg-background/60">
                            <span className="text-[11px] text-muted-foreground block">الرصيد الافتتاحي</span>
                            <span className={cn("font-mono font-bold text-sm block mt-0.5", modalData.opening < 0 ? "text-[#CD5C5C]" : "text-foreground")}>
                                ج.م {modalData.opening.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="p-2.5 rounded-lg border bg-background/60">
                            <span className="text-[11px] text-muted-foreground block flex items-center gap-1 text-foreground">
                                <ArrowDownLeft className="h-3 w-3" /> إجمالي المدين (+)
                            </span>
                            <span className="font-mono font-bold text-sm block mt-0.5 text-foreground">
                                ج.م {modalData.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="p-2.5 rounded-lg border bg-background/60">
                            <span className="text-[11px] text-muted-foreground block flex items-center gap-1 text-foreground">
                                <ArrowUpRight className="h-3 w-3" /> إجمالي الدائن (-)
                            </span>
                            <span className="font-mono font-bold text-sm block mt-0.5 text-foreground">
                                ج.م {modalData.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="p-2.5 rounded-lg border bg-muted/40 border-border">
                            <span className="text-[11px] text-muted-foreground font-medium block">صافي الرصيد بالميزانية</span>
                            <span className={cn("font-mono font-black text-sm block mt-0.5", modalData.finalBalance < 0 ? "text-[#CD5C5C]" : "text-foreground")}>
                                ج.م {modalData.finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </DialogHeader>

                {/* شريط البحث والتبديل */}
                <div className="p-3 border-b bg-muted/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="بحث برقم السند، المرجع، البيان، أو التاريخ..."
                            value={modalSearch}
                            onChange={(e) => setModalSearch(e.target.value)}
                            className="h-8 pr-8 text-xs"
                        />
                    </div>

                    {(drillDownModal.type === 'warehouse' || drillDownModal.type === 'inv') && (
                        <div className="flex items-center gap-1 bg-muted p-1 rounded-md">
                            <Button
                                size="sm"
                                variant={warehouseViewMode === 'movements' ? 'default' : 'ghost'}
                                className="h-7 text-xs px-2.5"
                                onClick={() => setWarehouseViewMode('movements')}
                            >
                                <ArrowRightLeft className="h-3 w-3 ml-1" />
                                حركات المخزن
                            </Button>
                            <Button
                                size="sm"
                                variant={warehouseViewMode === 'items' ? 'default' : 'ghost'}
                                className="h-7 text-xs px-2.5"
                                onClick={() => setWarehouseViewMode('items')}
                            >
                                <Package className="h-3 w-3 ml-1" />
                                أرصدة الأصناف بالمخزن ({modalData.warehouseItems.length})
                            </Button>
                        </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                        {(drillDownModal.type === 'warehouse' || drillDownModal.type === 'inv') && warehouseViewMode === 'items'
                            ? `عرض ${filteredWarehouseItems.length} صنف`
                            : `عرض ${filteredModalRows.length} حركة مسجلة`
                        }
                    </div>
                </div>

                {/* منطقة الجدول مع شريط التمرير */}
                <div className="flex-1 overflow-auto p-3">
                    {(drillDownModal.type === 'warehouse' || drillDownModal.type === 'inv') && warehouseViewMode === 'items' ? (
                        <Table>
                            <TableHeader className="bg-muted/40 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="w-12 text-center">#</TableHead>
                                    <TableHead>الباركود</TableHead>
                                    <TableHead>اسم الصنف</TableHead>
                                    <TableHead className="text-center">الرصيد الفعلي</TableHead>
                                    <TableHead className="text-center">التكلفة الفردية</TableHead>
                                    <TableHead className="text-left">إجمالي القيمة</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredWarehouseItems.map((item, idx) => (
                                    <TableRow key={item.id} className="hover:bg-muted/20">
                                        <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                                        <TableCell className="font-mono text-xs">{item.barcode || '-'}</TableCell>
                                        <TableCell className="font-medium text-xs">{item.name}</TableCell>
                                        <TableCell className="text-center font-mono font-bold text-xs">{item.qty}</TableCell>
                                        <TableCell className="text-center font-mono text-xs">ج.م {item.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-left font-mono font-semibold text-xs text-primary">
                                            ج.م {item.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredWarehouseItems.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic text-xs">
                                            لا توجد أصناف تطابق معايير البحث
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                            <TableFooter className="sticky bottom-0 bg-muted font-bold">
                                <TableRow>
                                    <TableCell colSpan={3}>إجمالي قيمة المخزون بالمستودع</TableCell>
                                    <TableCell className="text-center font-mono">
                                        {filteredWarehouseItems.reduce((s, i) => s + i.qty, 0)}
                                    </TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-left font-mono text-primary font-black">
                                        ج.م {filteredWarehouseItems.reduce((s, i) => s + i.total, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/40 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="w-12 text-center">#</TableHead>
                                    <TableHead className="w-24">التاريخ</TableHead>
                                    <TableHead className="w-36">نوع الحركة / السند</TableHead>
                                    <TableHead className="w-32">رقم المرجع</TableHead>
                                    <TableHead>البيان والتفاصيل</TableHead>
                                    <TableHead className="text-center w-28 text-foreground">مدين (+)</TableHead>
                                    <TableHead className="text-center w-28 text-foreground">دائن (-)</TableHead>
                                    <TableHead className="text-left w-32 font-bold text-foreground">الرصيد</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredModalRows.map((row, idx) => (
                                    <TableRow key={row.id || idx} className="hover:bg-muted/20">
                                        <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                                        <TableCell className="font-mono text-xs whitespace-nowrap text-foreground">{row.date}</TableCell>
                                        <TableCell className="text-xs">
                                            <Badge variant="outline" className="text-[11px] font-normal text-foreground border-border">
                                                {row.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs font-semibold text-foreground">{row.refNo || '-'}</TableCell>
                                        <TableCell className="text-xs leading-relaxed max-w-md text-foreground">{row.description || '-'}</TableCell>
                                        <TableCell className="text-center font-mono text-xs font-medium text-foreground">
                                            {row.debit > 0 ? `+${row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-center font-mono text-xs font-medium text-foreground">
                                            {row.credit > 0 ? `-${row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                        </TableCell>
                                        <TableCell className={cn("text-left font-mono text-xs font-bold", typeof row.balance === 'number' && row.balance < 0 ? "text-[#CD5C5C]" : "text-foreground")}>
                                            {typeof row.balance === 'number'
                                                ? (row.balance < 0 ? `(${Math.abs(row.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })})` : `ج.م ${row.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
                                                : '-'
                                            }
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredModalRows.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground italic text-xs">
                                            لا توجد حركات مسجلة لهذا البند تطابق معايير البحث
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                            <TableFooter className="sticky bottom-0 bg-muted font-bold">
                                <TableRow>
                                    <TableCell colSpan={5} className="text-foreground">إجمالي الحركات المعروضة</TableCell>
                                    <TableCell className="text-center font-mono text-foreground">
                                        ج.م {filteredModalRows.reduce((s, r) => s + (r.debit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-center font-mono text-foreground">
                                        ج.م {filteredModalRows.reduce((s, r) => s + (r.credit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className={cn("text-left font-mono font-black", modalData.finalBalance < 0 ? "text-[#CD5C5C]" : "text-foreground")}>
                                        ج.م {modalData.finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    )}
                </div>
            </DialogContent>
        </Dialog>
        </>
    )
}

function TrialBalanceView() {
    const allDataContext = useData();
    const { loading } = allDataContext;
    const [fromDate, setFromDate] = useState(`${new Date().getFullYear()}-01-01`);
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
    const [search, setSearch] = useState('');
    const [levelFilter, setLevelFilter] = useState('all');

    const journalEntries = useMemo(() => {
        return generateAllJournalEntries(allDataContext);
    }, [allDataContext]);

    const trialBalance = useMemo(() => {
        return computeTrialBalance(journalEntries, fromDate, toDate);
    }, [journalEntries, fromDate, toDate]);

    const filteredRows = useMemo(() => {
        return trialBalance.rows.filter(row => {
            if (levelFilter !== 'all' && String(row.level) !== levelFilter) return false;
            if (search.trim()) {
                const term = search.trim().toLowerCase();
                const matchCode = row.accountCode.toLowerCase().includes(term);
                const matchName = row.accountName.toLowerCase().includes(term);
                if (!matchCode && !matchName) return false;
            }
            return true;
        });
    }, [trialBalance.rows, levelFilter, search]);

    if (loading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    const { totals } = trialBalance;

    return (
        <div className="space-y-6">
            {/* Filters & Status Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/40 border">
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">من تاريخ</label>
                    <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">إلى تاريخ</label>
                    <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">بحث في الدليل</label>
                    <div className="relative">
                        <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="كود أو اسم الحساب..."
                            className="pr-8"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">مستوى الحسابات</label>
                    <Select value={levelFilter} onValueChange={setLevelFilter}>
                        <SelectTrigger><SelectValue placeholder="المستوى" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">كل المستويات (1-3)</SelectItem>
                            <SelectItem value="1">المستوى الرئيسي (1 - أصول/خصوم/حقوق/إيرادات/مصروفات)</SelectItem>
                            <SelectItem value="2">المستوى العام (2 - مجموعات)</SelectItem>
                            <SelectItem value="3">المستوى الفرعي / التحليلي (3)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Equilibrium Summary Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className={cn(
                    "border-2",
                    totals.isBalanced ? "border-green-500/40 bg-green-500/5" : "border-destructive/40 bg-destructive/5"
                )}>
                    <CardHeader className="py-3">
                        <CardTitle className="text-sm font-medium flex items-center justify-between">
                            <span>حالة ميزان المراجعة</span>
                            {totals.isBalanced ? (
                                <Badge className="bg-green-600 text-white gap-1"><CheckCircle2 className="h-3.5 w-3.5"/> متزن ومحكم</Badge>
                            ) : (
                                <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3.5 w-3.5"/> غير متزن</Badge>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                        <div className="text-lg font-black">
                            الفارق المحاسبي: {Math.abs(totals.endingDebit - totals.endingCredit).toFixed(2)} ج.م
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {totals.isBalanced ? 'إجمالي الأرصدة المدينة يطابق الدائنة وفقاً لقواعد القيد المزدوج.' : 'يوجد تباين يجب تدقيقه.'}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="py-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">حركة الفترة (المدين والدائن)</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                        <div className="flex justify-between items-center text-sm font-bold">
                            <span className="text-foreground">مدين: {totals.periodDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-foreground">دائن: {totals.periodCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">إجمالي الحركات المسجلة بالفترة المحددة</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="py-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">الأرصدة الختامية</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                        <div className="flex justify-between items-center text-sm font-black">
                            <span className="text-foreground">مدين: {totals.endingDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-foreground">دائن: {totals.endingCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">الرصيد الصافي التراكمي في نهاية الفترة</p>
                    </CardContent>
                </Card>
            </div>

            {/* Trial Balance Multi-Column Table */}
            <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
                <Table>
                    <TableHeader className="bg-muted/70">
                        <TableRow>
                            <TableHead rowSpan={2} className="w-[100px] text-center font-bold">الكود</TableHead>
                            <TableHead rowSpan={2} className="font-bold">اسم الحساب (الدليل المحاسبي)</TableHead>
                            <TableHead rowSpan={2} className="text-center font-bold w-[90px]">الطبيعة</TableHead>
                            <TableHead colSpan={2} className="text-center font-bold border-x bg-muted/90">رصيد أول المدة</TableHead>
                            <TableHead colSpan={2} className="text-center font-bold border-x bg-muted/80">حركة الفترة</TableHead>
                            <TableHead colSpan={2} className="text-center font-bold border-r bg-muted/90">رصيد آخر المدة</TableHead>
                        </TableRow>
                        <TableRow>
                            <TableHead className="text-center text-xs font-semibold border-r">مدين</TableHead>
                            <TableHead className="text-center text-xs font-semibold">دائن</TableHead>
                            <TableHead className="text-center text-xs font-semibold border-x">مدين</TableHead>
                            <TableHead className="text-center text-xs font-semibold border-l">دائن</TableHead>
                            <TableHead className="text-center text-xs font-semibold border-r">مدين</TableHead>
                            <TableHead className="text-center text-xs font-semibold">دائن</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRows.map((row) => {
                            const isLevel1 = row.level === 1;
                            const isLevel2 = row.level === 2;
                            return (
                                <TableRow
                                    key={row.accountCode}
                                    className={cn(
                                        "transition-colors",
                                        isLevel1 && "bg-muted/40 font-black text-base hover:bg-muted/60",
                                        isLevel2 && "bg-background font-bold text-sm hover:bg-muted/30",
                                        row.level === 3 && "text-sm hover:bg-muted/20"
                                    )}
                                >
                                    <TableCell className="font-mono text-center text-xs font-bold text-muted-foreground">
                                        {row.accountCode}
                                    </TableCell>
                                    <TableCell className={cn(
                                        row.level === 2 && "pr-6 text-foreground",
                                        row.level === 3 && "pr-12 text-muted-foreground"
                                    )}>
                                        {row.accountName}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium text-foreground border-border">
                                            {row.normalBalance === 'debit' ? 'مدين' : 'دائن'}
                                        </Badge>
                                    </TableCell>
                                    {/* Opening */}
                                    <TableCell className="text-center font-mono text-xs border-r text-foreground">
                                        {row.openingDebit > 0 ? row.openingDebit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                    </TableCell>
                                    <TableCell className="text-center font-mono text-xs text-foreground">
                                        {row.openingCredit > 0 ? row.openingCredit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                    </TableCell>
                                    {/* Period */}
                                    <TableCell className="text-center font-mono text-xs border-x text-foreground">
                                        {row.periodDebit > 0 ? row.periodDebit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                    </TableCell>
                                    <TableCell className="text-center font-mono text-xs border-l text-foreground">
                                        {row.periodCredit > 0 ? row.periodCredit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                    </TableCell>
                                    {/* Ending */}
                                    <TableCell className={cn("text-center font-mono text-xs font-bold border-r", row.endingDebit < 0 ? "text-[#CD5C5C]" : "text-foreground")}>
                                        {row.endingDebit !== 0 ? (row.endingDebit < 0 ? `(${Math.abs(row.endingDebit).toLocaleString(undefined, { minimumFractionDigits: 2 })})` : row.endingDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })) : '-'}
                                    </TableCell>
                                    <TableCell className={cn("text-center font-mono text-xs font-bold", row.endingCredit < 0 ? "text-[#CD5C5C]" : "text-foreground")}>
                                        {row.endingCredit !== 0 ? (row.endingCredit < 0 ? `(${Math.abs(row.endingCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })})` : row.endingCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })) : '-'}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                    <TableFooter className="bg-primary/5 border-t-2 border-primary font-black">
                        <TableRow>
                            <TableCell colSpan={3} className="text-base font-black">
                                إجمالي ميزان المراجعة (المجاميع المحاسبية)
                            </TableCell>
                            <TableCell className="text-center font-mono text-sm border-r font-black text-foreground">
                                {totals.openingDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-center font-mono text-sm font-black text-foreground">
                                {totals.openingCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-center font-mono text-sm border-x text-foreground font-black">
                                {totals.periodDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-center font-mono text-sm border-l text-foreground font-black">
                                {totals.periodCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className={cn("text-center font-mono text-sm border-r font-black", totals.endingDebit < 0 ? "text-[#CD5C5C]" : "text-foreground")}>
                                {totals.endingDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className={cn("text-center font-mono text-sm font-black", totals.endingCredit < 0 ? "text-[#CD5C5C]" : "text-foreground")}>
                                {totals.endingCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>

            {/* تشخيص ميزان المراجعة عند وجود اختلال */}
            {!totals.isBalanced && (
                <div className="mt-6 space-y-3">
                    <h4 className="font-bold text-sm text-[#CD5C5C] flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        تشخيص الحسابات الشاذة في ميزان المراجعة
                    </h4>
                    <p className="text-xs text-muted-foreground">
                        الحسابات أدناه تحمل أرصدة بعكس طبيعتها المحاسبية — مما قد يكون سبباً في اختلال الميزان. راجع قيودها في دفتر اليومية.
                    </p>
                    <div className="rounded-xl border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-red-50/50 dark:bg-red-950/20">
                                    <TableHead className="text-right text-xs">الكود</TableHead>
                                    <TableHead className="text-right text-xs">الحساب</TableHead>
                                    <TableHead className="text-center text-xs">الطبيعة</TableHead>
                                    <TableHead className="text-center text-xs">الرصيد الختامي (مدين)</TableHead>
                                    <TableHead className="text-center text-xs">الرصيد الختامي (دائن)</TableHead>
                                    <TableHead className="text-center text-xs">المشكلة</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {trialBalance.rows.filter(row => {
                                    if (row.normalBalance === 'debit'  && row.endingCredit > row.endingDebit  && row.endingCredit > 0.5) return true;
                                    if (row.normalBalance === 'credit' && row.endingDebit  > row.endingCredit && row.endingDebit  > 0.5) return true;
                                    return false;
                                }).slice(0, 15).map((row, idx) => {
                                    const anomaly = row.normalBalance === 'debit'
                                        ? `رصيد دائن ${row.endingCredit.toFixed(2)} بينما طبيعته مدين`
                                        : `رصيد مدين ${row.endingDebit.toFixed(2)} بينما طبيعته دائن`;
                                    return (
                                        <TableRow key={idx} className="bg-red-50/30 text-xs">
                                            <TableCell className="font-mono text-muted-foreground">{row.accountCode}</TableCell>
                                            <TableCell className="font-semibold text-foreground">{row.accountName}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className="text-[10px] text-foreground border-border">
                                                    {row.normalBalance === 'debit' ? 'مدين' : 'دائن'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-foreground">{row.endingDebit > 0 ? row.endingDebit.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) : '—'}</TableCell>
                                            <TableCell className="text-center font-mono text-foreground">{row.endingCredit > 0 ? row.endingCredit.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) : '—'}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="destructive" className="text-[10px] bg-[#CD5C5C] text-white">{anomaly}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {trialBalance.rows.filter(row => {
                                    if (row.normalBalance === 'debit'  && row.endingCredit > row.endingDebit  && row.endingCredit > 0.5) return true;
                                    if (row.normalBalance === 'credit' && row.endingDebit  > row.endingCredit && row.endingDebit  > 0.5) return true;
                                    return false;
                                }).length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-4 text-xs text-muted-foreground">
                                            لا توجد حسابات بأرصدة شاذة — الاختلال ناتج عن فرق رياضي في المجاميع.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function FinancialStatementsPage() {
  return (
    <>
      <PageHeader title="القوائم والتقارير المالية المحاسبية" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Tabs defaultValue="balance-sheet">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="income-statement">قائمة الدخل والأرباح (P&L)</TabsTrigger>
            <TabsTrigger value="balance-sheet">الميزانية العمومية والمركز المالي</TabsTrigger>
            <TabsTrigger value="trial-balance">ميزان المراجعة (Trial Balance)</TabsTrigger>
          </TabsList>
          <TabsContent value="income-statement">
            <Card>
              <CardHeader><CardTitle>قائمة الدخل</CardTitle><CardDescription>ملخص الإيرادات والمصروفات والخصم المكتسب والأرباح المحققة خلال نشاط الشركة.</CardDescription></CardHeader>
              <CardContent><IncomeStatement /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="balance-sheet">
            <Card>
              <CardHeader><CardTitle>الميزانية العمومية</CardTitle><CardDescription>لقطة تفصيلية عن المركز المالي للشركة تشمل كافة الحسابات والأصول والخصوم وحقوق الملكية.</CardDescription></CardHeader>
              <CardContent><BalanceSheet /></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="trial-balance">
            <Card>
              <CardHeader><CardTitle>ميزان المراجعة بالمجاميع والأرصدة</CardTitle><CardDescription>كشف شامل بأرصدة أول المدة وحركة الفترة والأرصدة الختامية لجميع حسابات شجرة الحسابات والتحقق من التوازن المالي.</CardDescription></CardHeader>
              <CardContent><TrialBalanceView /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

// ============================================================
// محرك تشخيص فروق الميزانية العمومية
// ============================================================
function useDiagnostics(totals: any, details: any, netIncome: number, allData: any) {
  return useMemo(() => {
    const fmtN = (n: number) => n.toLocaleString('ar-EG', { minimumFractionDigits: 2 });
    const totalLiabAndEquity = (totals.totalLiabilities ?? totals.ap) + totals.totalEquity;
    const diff = totals.totalAssets - totalLiabAndEquity;
    const issues: Array<{
      id: string; severity: 'high' | 'medium' | 'low'; category: string; icon: string;
      title: string; description: string; impact: number;
      documents: Array<{ id: string; ref: string; date: string; party: string; amount: number; issue: string; type: string }>;
    }> = [];

    // == حسابات مساعدة: إجمالي ما دُفع لكل فاتورة (أولي + دفعات لاحقة) ==
    const custPaymentsMap = new Map<string, number>();
    (allData.customerPayments || []).forEach((p: any) => {
      if (p.invoiceId) {
        custPaymentsMap.set(p.invoiceId, (custPaymentsMap.get(p.invoiceId) || 0) + Number(p.amount || 0));
      }
    });
    const suppPaymentsMap = new Map<string, number>();
    (allData.supplierPayments || []).forEach((p: any) => {
      if (p.invoiceId) {
        suppPaymentsMap.set(p.invoiceId, (suppPaymentsMap.get(p.invoiceId) || 0) + Number(p.amount || 0));
      }
    });

    const getTotalPaidSale = (inv: any) => Math.max(Number(inv.paidAmount || 0), custPaymentsMap.get(inv.id) || 0);
    // paidAmount is cumulative; linked receipts are a fallback for partial writes,
    // not an additional payment to subtract.
    const getTotalPaidPurch = (inv: any) => Math.max(Number(inv.paidAmount || 0), suppPaymentsMap.get(inv.id) || 0);
    const getRemainingDueSale = (inv: any) => Math.max(Number(inv.total || 0) - getTotalPaidSale(inv), 0);
    const getRemainingDuePurch = (inv: any) => Math.max(getPurchaseInvoiceTotal(inv) - getTotalPaidPurch(inv), 0);

    // تصنيف سبب المتبقي
    const getSaleRemainReason = (inv: any): string => {
      const total     = Number(inv.total || 0);
      const initPaid  = getTotalPaidSale(inv);
      const extraPaid = custPaymentsMap.get(inv.id) || 0;
      const remaining = Math.max(total - initPaid, 0);
      if (initPaid === 0 && extraPaid === 0)
        return `⚠️ لم يُسجَّل أي سداد — قد تكون بيانات ناقصة | متبقي: ${fmtN(remaining)}`;
      if (initPaid > 0 && extraPaid === 0)
        return `دفع جزئي: ${fmtN(initPaid)} من ${fmtN(total)} | متبقي: ${fmtN(remaining)}`;
      return `مدفوع أولي: ${fmtN(initPaid)} + دفعات لاحقة: ${fmtN(extraPaid)} = ${fmtN(initPaid + extraPaid)} | متبقي: ${fmtN(remaining)}`;
    };
    const getPurchRemainReason = (inv: any): string => {
      const total     = getPurchaseInvoiceTotal(inv);
      const initPaid  = getTotalPaidPurch(inv);
      const extraPaid = suppPaymentsMap.get(inv.id) || 0;
      const remaining = Math.max(total - initPaid, 0);
      if (initPaid === 0 && extraPaid === 0)
        return `⚠️ لم يُسجَّل أي سداد — قد تكون بيانات ناقصة | مستحق: ${fmtN(remaining)}`;
      if (initPaid > 0 && extraPaid === 0)
        return `دفع جزئي: ${fmtN(initPaid)} من ${fmtN(total)} | مستحق: ${fmtN(remaining)}`;
      return `مدفوع أولي: ${fmtN(initPaid)} + دفعات لاحقة: ${fmtN(extraPaid)} = ${fmtN(initPaid + extraPaid)} | مستحق: ${fmtN(remaining)}`;
    };

    if (Math.abs(diff) < 0.01) return { issues, diff: 0 };

    // 1. فواتير مبيعات مدفوعة جزئياً (بها جزء مدفوع وجزء متبقي)
    const partialSales = (allData.salesInvoices || []).filter((inv: any) => {
      const total      = Number(inv.total || 0);
      const paid       = getTotalPaidSale(inv);
      const remaining  = Math.max(total - paid, 0);
      // يظهر إذا كان هناك متبقي فعلي (سواء دُفع جزء أم لا)
      return remaining > 0.5 && total > 0;
    });
    if (partialSales.length > 0) {
      const gap = partialSales.reduce((s: number, inv: any) => s + getRemainingDueSale(inv), 0);
      // عدد الفواتير بدون أي سداد مسجّل (قد تكون آجل كامل أو بيانات ناقصة)
      const zeroPaidCount = partialSales.filter((inv: any) => Number(inv.paidAmount||0) === 0 && (custPaymentsMap.get(inv.id)||0) === 0).length;
      issues.push({ id: 'partial_sales', severity: gap > 10000 ? 'high' : 'medium', category: 'ذمم مدينة', icon: 'invoice',
        title: `${partialSales.length} فاتورة مبيعات بمبالغ آجلة (${zeroPaidCount} بدون أي سداد مسجّل)`,
        impact: gap,
        description: `إجمالي المبالغ الآجلة: ${fmtN(gap)} ج.م. الفواتير التي لا يوجد فيها سداد مسجّل قد تكون: (1) مبيعات آجلة حقيقية بدون تحصيل بعد، أو (2) بيانات ناقصة حيث سُدِّدت لكن لم يُسجَّل السداد في النظام — كلاهما يُسبب فرقاً في الميزانية.`,
        documents: partialSales.slice(0, 20).map((inv: any) => {
          const remaining = getRemainingDueSale(inv);
          return {
            id: inv.id, ref: inv.invoiceNumber || inv.id, date: inv.date, party: inv.customerName || 'عميل نقدي',
            amount: remaining,
            issue: getSaleRemainReason(inv),
            type: 'sale'
          };
        })
      });
    }

    // 2. فواتير مشتريات مدفوعة جزئياً
    const partialPurch = (allData.purchaseInvoices || []).filter((inv: any) => {
      const total      = getPurchaseInvoiceTotal(inv);
      const paid        = getTotalPaidPurch(inv);
      const remaining  = Math.max(total - paid, 0);
      return remaining > 0.5 && total > 0;
    });
    if (partialPurch.length > 0) {
      const gap = partialPurch.reduce((s: number, inv: any) => s + getRemainingDuePurch(inv), 0);
      const zeroPaidCountP = partialPurch.filter((inv: any) => Number(inv.paidAmount||0) === 0 && (suppPaymentsMap.get(inv.id)||0) === 0).length;
      issues.push({ id: 'partial_purchases', severity: gap > 10000 ? 'high' : 'medium', category: 'ذمم دائنة', icon: 'purchase',
        title: `${partialPurch.length} فاتورة مشتريات بمبالغ مستحقة (${zeroPaidCountP} بدون أي سداد مسجّل)`,
        impact: gap,
        description: `إجمالي المستحقات للموردين: ${fmtN(gap)} ج.م. الفواتير بدون سداد مسجّل قد تكون آجلة حقيقية أو بيانات ناقصة.`,
        documents: partialPurch.slice(0, 20).map((inv: any) => {
          const remaining = getRemainingDuePurch(inv);
          return {
            id: inv.id, ref: inv.invoiceNumber || inv.id, date: inv.date, party: inv.supplierName || 'مورد عام',
            amount: remaining,
            issue: getPurchRemainReason(inv),
            type: 'purchase'
          };
        })
      });
    }

    // 3. فواتير بقيمة صفر أو سالبة
    const zeroSales = (allData.salesInvoices || []).filter((inv: any) => Number(inv.total || 0) <= 0);
    const zeroPurch = (allData.purchaseInvoices || []).filter((inv: any) => Number(inv.total || 0) <= 0);
    if (zeroSales.length + zeroPurch.length > 0) {
      issues.push({ id: 'zero_invoices', severity: 'medium', category: 'بيانات ناقصة', icon: 'warning',
        title: `${zeroSales.length + zeroPurch.length} فاتورة بقيمة صفر أو سالبة`, impact: 0,
        description: 'فواتير بمبالغ صفر أو سالبة تشوه حسابات الإيرادات والمخزون.',
        documents: [
          ...zeroSales.slice(0, 10).map((inv: any) => ({ id: inv.id, ref: inv.invoiceNumber || inv.id, date: inv.date, party: inv.customerName || 'عميل', amount: Number(inv.total), issue: 'قيمة الفاتورة صفر أو سالبة', type: 'sale' })),
          ...zeroPurch.slice(0, 10).map((inv: any) => ({ id: inv.id, ref: inv.invoiceNumber || inv.id, date: inv.date, party: inv.supplierName || 'مورد', amount: Number(inv.total), issue: 'قيمة الفاتورة صفر أو سالبة', type: 'purchase' }))
        ]
      });
    }

    // 4. أصناف بتكلفة صفر
    const zeroCostItems = (allData.items || []).filter((item: any) => !item.cost || Number(item.cost) === 0);
    if (zeroCostItems.length > 0) {
      issues.push({ id: 'zero_cost', severity: 'high', category: 'تكلفة المخزون', icon: 'inventory',
        title: `${zeroCostItems.length} صنف بتكلفة صفر — المخزون مُقيَّم بأقل من قيمته`, impact: 0,
        description: 'الأصناف بتكلفة صفر تجعل قيمة المخزون في الميزانية أقل من الحقيقية مما يُسبب فرقاً في الأصول.',
        documents: zeroCostItems.slice(0, 20).map((item: any) => ({
          id: item.id, ref: item.barcode || item.id, date: '', party: item.name, amount: 0,
          issue: `الصنف "${item.name}" تكلفته صفر`, type: 'item'
        }))
      });
    }

    // 5. مدفوعات العملاء بدون فاتورة
    const orphanCust = (allData.customerPayments || []).filter((p: any) => !p.invoiceId && Number(p.amount || 0) > 0);
    if (orphanCust.length > 0) {
      const total = orphanCust.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      issues.push({ id: 'orphan_cust', severity: 'medium', category: 'مدفوعات معلقة', icon: 'payment',
        title: `${orphanCust.length} دفعة عميل بدون فاتورة مرتبطة`, impact: total,
        description: 'مدفوعات مسجّلة كمُقدَّمات بدون ربطها بفاتورة. تؤثر على رصيد النقدية وحسابات العملاء.',
        documents: orphanCust.slice(0, 20).map((p: any) => ({
          id: p.id, ref: p.receiptNumber || p.id, date: p.date, party: p.customerName || 'عميل',
          amount: Number(p.amount), issue: `دفعة بمبلغ ${fmtN(Number(p.amount))} غير مرتبطة بفاتورة`, type: 'payment'
        }))
      });
    }

    // 6. مدفوعات الموردين بدون فاتورة
    const orphanSupp = (allData.supplierPayments || []).filter((p: any) => !p.invoiceId && Number(p.amount || 0) > 0);
    if (orphanSupp.length > 0) {
      const total = orphanSupp.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      issues.push({ id: 'orphan_supp', severity: 'medium', category: 'مدفوعات معلقة', icon: 'payment',
        title: `${orphanSupp.length} دفعة مورد بدون فاتورة مرتبطة`, impact: total,
        description: 'مدفوعات للموردين غير مرتبطة بفواتير شراء. تُخفض النقدية لكن قد لا تُخفض الذمم الدائنة.',
        documents: orphanSupp.slice(0, 20).map((p: any) => ({
          id: p.id, ref: p.receiptNumber || p.id, date: p.date, party: p.supplierName || 'مورد',
          amount: Number(p.amount), issue: `دفعة بمبلغ ${fmtN(Number(p.amount))} غير مرتبطة بفاتورة شراء`, type: 'payment'
        }))
      });
    }

    // 7. تسويات مخزون سالبة
    const negAdj = (allData.stockAdjustmentRecords || []).filter((adj: any) =>
      (adj.items || []).some((item: any) => Number(item.difference || 0) < 0)
    );
    if (negAdj.length > 0) {
      let totalVal = 0;
      negAdj.forEach((adj: any) => { (adj.items || []).forEach((item: any) => { if (Number(item.difference||0) < 0) totalVal += Math.abs(Number(item.difference)) * Number(item.cost||0); }); });
      issues.push({ id: 'neg_adj', severity: totalVal > 5000 ? 'high' : 'low', category: 'تسويات مخزون', icon: 'inventory',
        title: `${negAdj.length} سجل تسوية مخزون سالبة (عجز)`, impact: totalVal,
        description: 'تسويات تُخفض قيمة المخزون. إذا لم تُسجَّل في قائمة الدخل كخسارة، يحدث فرق.',
        documents: negAdj.slice(0, 15).map((adj: any) => ({
          id: adj.id, ref: adj.receiptNumber || adj.id, date: adj.date, party: adj.reason || 'تسوية',
          amount: totalVal, issue: 'تسوية مخزون سالبة (عجز)', type: 'adjustment'
        }))
      });
    }

    // 8. مخزون سالب ناتج عن صرف كمية أكبر من الرصيد المتاح
    const costByItem = new Map<string, number>();
    (allData.items || []).forEach((item: any) => {
      if (Number(item.cost) > 0) costByItem.set(item.id, Number(item.cost));
    });
    [...(allData.stockInRecords || [])]
      .sort((a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
      .forEach((receipt: any) => (receipt.items || []).forEach((line: any) => {
        const itemId = line.id || line.itemId || line.ItemId;
        const unitCost = Number(line.cost || line.unitCost || line.price || 0);
        if (itemId && unitCost > 0) costByItem.set(itemId, unitCost);
      }));
    const negativeStock: Array<{ item: any; warehouse: any; qty: number; value: number }> = [];
    const warehouses = [...(allData.warehouses || []), ...(allData.inventoryZones || [])];
    warehouses.forEach((warehouse: any) => (allData.items || []).forEach((item: any) => {
      const qty = calculateStockForItemInWarehouse(item.id, warehouse.id, allData);
      if (qty < -0.001) negativeStock.push({ item, warehouse, qty, value: Math.abs(qty) * (costByItem.get(item.id) || Number(item.cost) || 0) });
    }));
    if (negativeStock.length) {
      const impact = negativeStock.reduce((sum, row) => sum + row.value, 0);
      issues.push({ id: 'negative_stock', severity: 'high', category: 'حركات المخزون', icon: 'inventory',
        title: `${negativeStock.length} صنف برصيد سالب بسبب صرف دون رصيد`, impact,
        description: 'تم اعتماد أذون صرف تتجاوز الرصيد المتاح. الرصيد السالب يخفض قيمة المخزون ويجعل تكلفة التصنيع والتسوية غير دقيقة؛ راجع إذن الصرف وإذن الاستلام المرتبطين قبل اعتماد أي تسوية.',
        documents: negativeStock.slice(0, 20).map(({ item, warehouse, qty, value }) => ({
          id: item.id, ref: item.code || item.id, date: '', party: warehouse.name || 'مخزن', amount: value,
          issue: `رصيد الصنف ${item.name || item.code || item.id}: ${fmtN(qty)} وحدة`, type: 'item'
        }))
      });
    }

    // 9. تفاوت تكاليف استلام المنتج التام: الميزانية الحالية تطبق آخر تكلفة
    // استلام على كل رصيد الصنف، لذلك نكشف فرق التشغيلات ولا نخفيه كتسوية.
    const outputReceiptsByItem = new Map<string, Array<{ receipt: any; line: any; qty: number; cost: number }>>();
    (allData.stockInRecords || []).filter((receipt: any) => String(receipt.reason || receipt.Reason || '').toLowerCase() === 'manufacturing_output')
      .forEach((receipt: any) => (receipt.items || []).forEach((line: any) => {
        const itemId = line.id || line.itemId || line.ItemId;
        const qty = Number(line.qty || line.quantity || 0);
        const cost = Number(line.cost || line.unitCost || 0);
        if (!itemId || qty <= 0 || cost <= 0) return;
        const list = outputReceiptsByItem.get(itemId) || [];
        list.push({ receipt, line, qty, cost });
        outputReceiptsByItem.set(itemId, list);
      }));
    const inconsistentOutputCosts: Array<{ item: any; rows: any[]; remainingQty: number; estimatedDifference: number }> = [];
    outputReceiptsByItem.forEach((rows, itemId) => {
      const distinctCosts = new Set(rows.map(row => Math.round(row.cost * 100) / 100));
      if (distinctCosts.size < 2) return;
      const item = (allData.items || []).find((candidate: any) => candidate.id === itemId);
      const remainingQty = warehouses.reduce((sum: number, warehouse: any) => sum + Math.max(0, calculateStockForItemInWarehouse(itemId, warehouse.id, allData)), 0);
      const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
      const averageCost = rows.reduce((sum, row) => sum + row.qty * row.cost, 0) / totalQty;
      const latestCost = [...rows].sort((a, b) => new Date(a.receipt.date || 0).getTime() - new Date(b.receipt.date || 0).getTime()).at(-1)?.cost || 0;
      const estimatedDifference = Math.abs((averageCost - latestCost) * remainingQty);
      if (estimatedDifference > 0.01) inconsistentOutputCosts.push({ item, rows, remainingQty, estimatedDifference });
    });
    if (inconsistentOutputCosts.length) {
      const impact = inconsistentOutputCosts.reduce((sum, row) => sum + row.estimatedDifference, 0);
      issues.push({ id: 'manufacturing_batch_costs', severity: 'high', category: 'تكلفة التشغيلات', icon: 'inventory',
        title: `${inconsistentOutputCosts.length} منتج تام بتكاليف مختلفة بين التشغيلات`, impact,
        description: 'تقرير الميزانية يستخدم آخر تكلفة استلام على كامل رصيد الصنف. لذلك قد تُسعّر وحدات تشغيلة سابقة بتكلفة تشغيلة أحدث؛ راجع التكلفة وسجل كل رقم تشغيلة قبل اعتماد قيمة المخزون.',
        documents: inconsistentOutputCosts.flatMap(({ item, rows, remainingQty, estimatedDifference }) => rows.map(({ receipt, line, cost, qty }) => ({
          id: receipt.id, ref: line.batchNumber || receipt.batchNumber || receipt.receiptNumber || receipt.id, date: receipt.date || '', party: item?.name || item?.code || item?.id || item?.itemId,
          amount: cost * qty, issue: `تكلفة الوحدة ${fmtN(cost)}، الكمية المستلمة ${fmtN(qty)}، الرصيد المتبقي للصنف ${fmtN(remainingQty)} وحدة؛ فرق تقديري بسبب تطبيق آخر تكلفة: ${fmtN(estimatedDifference)} ج.م`, type: 'item'
        }))).slice(0, 30)
      });
    }

    // 10. صرف خامات التصنيع لا يسجل كهالك؛ يجب أن يظهر أثر التكلفة في مستند الإنتاج.
    const manufacturingIssues = (allData.stockOutRecords || []).filter((record: any) => {
      const reason = String(record.reason || record.Reason || '').toLowerCase();
      return reason.includes('manufacturing') || reason.includes('تصنيع');
    });
    const manufacturingIssueValue = manufacturingIssues.reduce((total: number, record: any) => total + (record.items || []).reduce((sum: number, line: any) => {
      if (line.wasteTreatment === 'expense') return sum + (Number(line.wasteQty) || 0) * (Number(line.cost) || 0);
      if (line.wasteQty != null && line.wasteTreatment !== 'allocate_to_good') return sum + (Number(line.wasteQty) || 0) * (Number(line.cost) || 0);
      const item = (allData.items || []).find((candidate: any) => candidate.id === (line.id || line.itemId));
      return sum + (Number(line.usedQty ?? line.qty) || 0) * (Number(line.cost) || Number(item?.cost) || 0);
    }, 0), 0);
    if (manufacturingIssues.length) {
      issues.push({ id: 'manufacturing_movements', severity: 'medium', category: 'دورة التصنيع', icon: 'inventory',
        title: `${manufacturingIssues.length} أذون صرف خامات للتصنيع`, impact: manufacturingIssueValue,
        description: 'هذه الحركات استهلاك إنتاج وليست هالكاً. تظهر هنا لمراجعة ارتباط تكلفة الخامات بإذن استلام المنتج التام ورقم التشغيلة؛ الحركات القديمة التي لا تحمل تكلفة في بند الصرف تعتمد على تكلفة بطاقة الصنف عند التشخيص فقط.',
        documents: manufacturingIssues.slice(0, 20).map((record: any) => ({
          id: record.id, ref: record.receiptNumber || record.id, date: record.date || '', party: record.reason || 'صرف تصنيع', amount: (record.items || []).reduce((sum: number, line: any) => {
            const item = (allData.items || []).find((candidate: any) => candidate.id === (line.id || line.itemId));
            return sum + (Number(line.usedQty ?? line.qty) || 0) * (Number(line.cost) || Number(item?.cost) || 0);
          }, 0), issue: 'صرف خامات مرتبط بأمر تصنيع؛ راجع التكلفة ورقم التشغيلة', type: 'adjustment'
        }))
      });
    }

    // 11. تنبيه ترحيل القيود
    issues.push({
      id: 'unposted', severity: 'low', category: 'ترحيل القيود', icon: 'journal',
      title: 'تأكد من ترحيل جميع القيود في دفتر الأستاذ العام',
      description: 'الميزانية هنا تُبنى من البيانات الخام مباشرة. الفواتير غير المرحّلة قد تسبب فرقاً بين هذه الميزانية وميزان المراجعة المبني من الأستاذ العام. انتقل إلى "ترحيل القيود المركزية" لترحيل الفواتير المعلقة.',
      impact: 0, documents: []
    });

    return { issues, diff };
  }, [totals, details, netIncome, allData]);
}

// مكوّن عرض قسم التشخيص
function BalanceDiagnostics({ totals, details, netIncome, allData }: any) {
  const { issues, diff } = useDiagnostics(totals, details, netIncome, allData);
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const { retryDatabaseConnection } = useData();
  const { toast } = useToast();

  const fmtC = (n: number) => `ج.م ${Math.abs(n).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}`;

  const handleRecalculatePaymentEffects = async () => {
    setIsRecalculating(true);
    try {
      const response = await fetch('/api/db/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recalculatePaymentEffects', path: 'financialPayments' })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'تعذرت إعادة الاحتساب');
      await retryDatabaseConnection();
      toast({
        title: 'تمت إعادة احتساب آثار السداد والتحصيل',
        description: `فواتير الموردين: ${result.updatedInvoices?.supplier || 0}، فواتير العملاء: ${result.updatedInvoices?.customer || 0}`
      });
    } catch (error: any) {
      toast({ title: 'تعذرت إعادة الاحتساب', description: error.message || 'تحقق من اتصال قاعدة البيانات', variant: 'destructive' });
    } finally {
      setIsRecalculating(false);
    }
  };

  const recalculateButton = (
    <Button size="sm" variant="outline" onClick={handleRecalculatePaymentEffects} disabled={isRecalculating}>
      <RefreshCw className={`ml-2 h-4 w-4 ${isRecalculating ? 'animate-spin' : ''}`} />
      إعادة احتساب السداد والتحصيل
    </Button>
  );

  if (Math.abs(diff) < 0.01) {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-300">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="font-bold text-emerald-700 dark:text-emerald-400">الميزانية متوازنة تماماً</p>
            <p className="text-xs text-muted-foreground">إجمالي الأصول = إجمالي الخصوم + حقوق الملكية بفارق صفر.</p>
          </div>
        </div>
        {recalculateButton}
      </div>
    );
  }

  const sevColor = (s: string) => s === 'high' ? 'border-[#CD5C5C]/40 bg-destructive/10 text-[#CD5C5C]' : s === 'medium' ? 'border-border bg-muted/40 text-foreground' : 'border-border bg-muted/20 text-muted-foreground';
  const sevBadge = (s: string) => s === 'high' ? 'bg-[#CD5C5C] text-white' : s === 'medium' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground';
  const sevLabel = (s: string) => s === 'high' ? 'عالي' : s === 'medium' ? 'متوسط' : 'منخفض';
  const typeIcon = (t: string) => {
    if (t === 'sale')       return <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />;
    if (t === 'purchase')   return <Receipt className="h-3.5 w-3.5 text-muted-foreground" />;
    if (t === 'payment')    return <Wallet className="h-3.5 w-3.5 text-muted-foreground" />;
    if (t === 'item')       return <Package className="h-3.5 w-3.5 text-muted-foreground" />;
    if (t === 'adjustment') return <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />;
    return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <div className="space-y-4 mt-6">
      {/* ملخص الفرق */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-300">
        <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="font-bold text-red-700 dark:text-red-400 text-base">الميزانية غير متوازنة — الفرق: {fmtC(diff)}</p>
            <Badge variant="destructive" className="text-xs">
              {diff > 0 ? 'الأصول أكبر من الخصوم + الملكية' : 'الخصوم + الملكية أكبر من الأصول'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            الأصول: <strong>{fmtC(totals.totalAssets)}</strong>
            &nbsp;|&nbsp; الخصوم + حقوق الملكية: <strong>{fmtC((totals.totalLiabilities ?? totals.ap) + totals.totalEquity)}</strong>
            &nbsp;|&nbsp; الفرق: <strong className="text-red-600">{fmtC(diff)}</strong>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            تم الكشف عن <strong className="text-foreground">{issues.filter(i => i.id !== 'unposted').length}</strong> سبب محتمل. اضغط على أي سبب لعرض المستندات المرتبطة.
          </p>
        </div>
        {recalculateButton}
      </div>

      {/* قائمة الأسباب */}
      <div className="space-y-2">
        {issues.map(issue => (
          <div
            key={issue.id}
            className={cn("rounded-xl border p-4 cursor-pointer transition-all hover:shadow-sm", sevColor(issue.severity))}
            onClick={() => setOpenIssue(openIssue === issue.id ? null : issue.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 flex-1">
                <div className="mt-0.5">
                  {issue.icon === 'invoice'    && <ShoppingCart className="h-4 w-4" />}
                  {issue.icon === 'purchase'   && <Receipt className="h-4 w-4" />}
                  {issue.icon === 'inventory'  && <Package className="h-4 w-4" />}
                  {issue.icon === 'payment'    && <Wallet className="h-4 w-4" />}
                  {issue.icon === 'journal'    && <FileText className="h-4 w-4" />}
                  {issue.icon === 'warning'    && <AlertTriangle className="h-4 w-4" />}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm">{issue.title}</span>
                    <Badge className={cn("text-[10px] text-white", sevBadge(issue.severity))}>{sevLabel(issue.severity)}</Badge>
                    <Badge variant="outline" className="text-[10px]">{issue.category}</Badge>
                    {issue.impact > 0 && <Badge variant="outline" className="text-[10px] font-mono">{fmtC(issue.impact)}</Badge>}
                  </div>
                  <p className="text-xs mt-1 opacity-80 leading-relaxed">{issue.description}</p>
                </div>
              </div>
              {openIssue === issue.id ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
            </div>

            {/* جدول المستندات */}
            {openIssue === issue.id && issue.documents.length > 0 && (
              <div className="mt-3 rounded-lg border overflow-hidden" onClick={e => e.stopPropagation()}>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60">
                      <TableHead className="text-right text-xs py-2">المرجع</TableHead>
                      <TableHead className="text-right text-xs py-2">التاريخ</TableHead>
                      <TableHead className="text-right text-xs py-2">الطرف</TableHead>
                      <TableHead className="text-center text-xs py-2">المبلغ</TableHead>
                      <TableHead className="text-right text-xs py-2">المشكلة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issue.documents.map((doc, idx) => (
                      <TableRow key={idx} className="bg-background/80 text-xs">
                        <TableCell className="text-right font-mono font-bold py-2">
                          <span className="flex items-center gap-1">{typeIcon(doc.type)} {doc.ref}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono py-2 text-muted-foreground">
                          {doc.date ? new Date(doc.date).toLocaleDateString('ar-EG') : '—'}
                        </TableCell>
                        <TableCell className="text-right py-2">{doc.party}</TableCell>
                        <TableCell className="text-center font-mono py-2 font-bold">
                          {doc.amount !== 0 ? fmtC(doc.amount) : '—'}
                        </TableCell>
                        <TableCell className="text-right py-2 text-muted-foreground max-w-xs truncate" title={doc.issue}>
                          {doc.issue}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {issue.documents.length >= 20 && (
                  <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30 border-t">
                    يُعرض أول 20 سجل — راجع التقرير الكامل في الصفحات المخصصة
                  </div>
                )}
              </div>
            )}
            {openIssue === issue.id && issue.documents.length === 0 && issue.id !== 'unposted' && (
              <div className="mt-2 text-xs text-muted-foreground">لا توجد مستندات محددة — المشكلة في البيانات الإجمالية.</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
