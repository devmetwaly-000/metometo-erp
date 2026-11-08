
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2, DollarSign, Users, Building, Package, TrendingUp, TrendingDown, AlertTriangle, Clock, ShoppingCart, Calculator, Info, Banknote, Tag, Wallet, ArrowUpCircle, ArrowDownCircle, Minus, Plus, Boxes, Printer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, CartesianGrid, XAxis, YAxis, Legend, Bar, ResponsiveContainer, LabelList } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { calculateStockForItemInWarehouse } from "@/lib/inventory-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

// Data Interfaces
interface Item { id: string; name: string; cost?: number; reorderPoint?: number; }
interface Sale { id: string; date: string; warehouseId?: string; total: number; items: { id: string; qty: number; cost?: number; }[]; discount: number; subtotal: number; paidAmount?: number; paidToAccountId?: string; }
interface Purchase { id: string; date: string; warehouseId: string; total: number; paidAmount?: number; }
interface Customer { id: string; name: string; openingBalance: number; phone?: string; }
interface Supplier { id: string; name: string; openingBalance: number; }
interface CustomerPayment { amount: number; paidToAccountId: string; invoiceId?: string; customerId: string; }
interface SupplierPayment { amount: number; paidFromAccountId: string; invoiceId?: string; supplierId: string; }
interface SalesReturn { total: number; paidAmount?: number; paidFromAccountId?: string; warehouseId: string; items: any[]; date: string; }
interface PurchaseReturn { total: number; paidAmount?: number; paidToAccountId?: string; warehouseId: string; }
interface CashAccount { id: string; name: string; openingBalance: number; warehouseId?: string; salesRepId?: string; userId?: string; }
interface Expense { amount: number; paidFromAccountId: string; date: string; warehouseId?: string; }
interface ExceptionalIncome { amount: number; paidToAccountId: string; date: string; }
interface TreasuryTransaction { type: 'deposit' | 'withdrawal'; amount: number; accountId: string; linkedTransaction?: boolean; }
interface EmployeeAdvance { amount: number; paidFromAccountId: string; }
interface ProfitDistribution { amount: number; paidFromAccountId: string; }
interface PayrollRecord { payrollData: { netSalary: number }[]; paidFromAccountId: string; }

const chartConfig = {
  sales: { label: "المبيعات", color: "hsl(var(--chart-1))" },
  profit: { label: "الأرباح", color: "hsl(var(--chart-2))" },
  visits: { label: "عدد الفواتير", color: "hsl(var(--chart-4))" },
};

export default function DashboardPage() {
    const allDataContext = useData();
    const { 
        items, salesInvoices, posSales, purchaseInvoices, customers, suppliers,
        customerPayments, supplierPayments, salesReturns, purchaseReturns,
        cashAccounts, expenses, exceptionalIncomes, treasuryTransactions,
        employeeAdvances, profitDistributions, inventory, warehouses, loading, stockOutRecords,
        inventoryClosings, stockInRecords, stockTransferRecords, stockAdjustmentRecords,
        posReturns, stockIssuesToReps, stockReturnsFromReps, payrollRecords, settings
    } = allDataContext;
    const { user } = useAuth();
    const isMobile = useIsMobile();
    const [filters, setFilters] = useState({
        warehouseId: "all",
        fromDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        toDate: new Date().toISOString().split('T')[0]
    });
    
    // UI Dialog States
    const [isNetProfitBreakdownOpen, setIsNetProfitBreakdownOpen] = useState(false);
    const [isCashBreakdownOpen, setIsCashBreakdownOpen] = useState(false);
    const [isReceivablesBreakdownOpen, setIsReceivablesBreakdownOpen] = useState(false);
    
    useEffect(() => {
        const cleanup = () => {
            document.body.style.pointerEvents = 'auto';
            document.body.style.overflow = 'auto';
        };
        cleanup();
        const timer = setTimeout(cleanup, 500);
        return () => clearTimeout(timer);
    }, [isNetProfitBreakdownOpen, isCashBreakdownOpen, isReceivablesBreakdownOpen]);

    useEffect(() => {
        if (user?.warehouseIds?.length === 1 && user.warehouseIds[0] !== 'all') {
            setFilters(prev => ({...prev, warehouseId: user.warehouseIds[0]}));
        }
    }, [user]);

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };
    
    const warehouseOptions = useMemo(() => {
        const options: { value: string; label: string }[] = [];
        if (user?.warehouseIds?.includes('all')) {
            options.push({ value: 'all', label: 'كل الفروع' });
            warehouses.forEach((w: any) => options.push({ value: w.id, label: w.name }));
        } else {
            if (user?.warehouseIds && user.warehouseIds.length > 1) {
                options.push({ value: 'all', label: 'كل الفروع المصرح بها' });
            }
            warehouses
                .filter((w: any) => user?.warehouseIds?.includes(w.id))
                .forEach((w: any) => options.push({ value: w.id, label: w.name }));
        }
        return options;
    }, [warehouses, user]);


    const filteredData = useMemo(() => {
        const filterByDate = (date: string) => {
            if (!filters.fromDate && !filters.toDate) return true;
            const itemDate = new Date(date);
            const from = filters.fromDate ? new Date(filters.fromDate) : null;
            const to = filters.toDate ? new Date(filters.toDate) : null;
            if(from) from.setHours(0,0,0,0);
            if(to) to.setHours(23,59,59,999);
            if (from && itemDate < from) return false;
            if (to && itemDate > to) return false;
            return true;
        };

        const filterByWarehouse = (wId?: string) => {
            if (filters.warehouseId === 'all') {
                if (user?.warehouseIds?.includes('all')) return true;
                return user?.warehouseIds?.includes(wId || '');
            }
            return wId === filters.warehouseId;
        };
        
        const sales = salesInvoices
            .filter((s: any) => s.status === 'approved' || !s.status || s.status === 'completed')
            .filter((s: any) => filterByDate(s.date) && filterByWarehouse(s.warehouseId));
        const purchases = purchaseInvoices.filter((p: any) => filterByDate(p.date) && filterByWarehouse(p.warehouseId));
        
        const salesReturnsFiltered = salesReturns
            .filter((r: any) => filterByDate(r.date) && filterByWarehouse(r.warehouseId));

        const purchaseReturnsFiltered = purchaseReturns.filter((r: any) => filterByDate(r.date) && filterByWarehouse(r.warehouseId));
        const filteredExpenses = expenses.filter((e: any) => filterByDate(e.date) && (filters.warehouseId === 'all' || e.warehouseId === filters.warehouseId || !e.warehouseId));
        const filteredIncome = exceptionalIncomes.filter((i: any) => filterByDate(i.date));
            
        return { sales, purchases, salesReturnsFiltered, purchaseReturnsFiltered, filteredExpenses, filteredIncome };

    }, [filters, salesInvoices, purchaseInvoices, salesReturns, purchaseReturns, expenses, exceptionalIncomes, user]);

    // New Memo for Automatic Accurate Inventory Calculation
    const accurateInventoryValue = useMemo(() => {
        if (loading) return 0;
        
        const userWarehouseIds = user?.warehouseIds || [];
        const isSuperAdmin = userWarehouseIds.includes('all');
        const activeWarehouseId = filters.warehouseId;
        
        const isWarehouseAllowed = (wId?: string) => {
            if (activeWarehouseId !== 'all') return wId === activeWarehouseId;
            if (isSuperAdmin) return true;
            return userWarehouseIds.includes(wId || '');
        };
        
        const warehousesToConsider = warehouses.filter((w: any) => isWarehouseAllowed(w.id));
        
        let total = 0;
        items.forEach((item: any) => {
            const itemCost = Number(item.cost) || 0;
            let totalQty = 0;
            warehousesToConsider.forEach((w: any) => {
                const qty = calculateStockForItemInWarehouse(item.id, w.id, allDataContext);
                totalQty += Number(qty) || 0;
            });
            total += totalQty * itemCost;
        });
        return total;
    }, [loading, items, warehouses, user, filters.warehouseId, inventoryClosings, stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, salesInvoices, salesReturns, posSales, posReturns, purchaseReturns, stockIssuesToReps, stockReturnsFromReps]);

    const kpiData = useMemo(() => {
        const userWarehouseIds = user?.warehouseIds || [];
        const isSuperAdmin = userWarehouseIds.includes('all');
        const activeWarehouseId = filters.warehouseId;
        
        const isAccountAllowed = (acc: CashAccount) => {
            if (activeWarehouseId !== 'all') return acc.warehouseId === activeWarehouseId;
            if (isSuperAdmin) return true;
            return !acc.warehouseId || userWarehouseIds.includes(acc.warehouseId);
        };

        const filteredCashAccounts = cashAccounts.filter(isAccountAllowed);
        const filteredCashAccountIds = new Set(filteredCashAccounts.map(acc => acc.id));

        let openingCash = filteredCashAccounts.reduce((sum, acc) => sum + (Number(acc.openingBalance) || 0), 0);
        let customerPaymentsTotal = 0;
        let extraIncomeTotal = 0;
        let treasuryDeposits = 0;
        let purchaseReturnsCash = 0;
        let salesInitialCash = 0;

        // Inflows
        customerPayments.forEach((p: CustomerPayment) => {
            if (filteredCashAccountIds.has(p.paidToAccountId)) customerPaymentsTotal += Number(p.amount) || 0;
        });
        
        exceptionalIncomes.forEach((i: ExceptionalIncome) => {
            if (filteredCashAccountIds.has(i.paidToAccountId)) extraIncomeTotal += Number(i.amount) || 0;
        });
        
        treasuryDeposits = treasuryTransactions.filter((tx: TreasuryTransaction) => tx.type === 'deposit' && !tx.linkedTransaction).reduce((sum, tx) => {
            if (filteredCashAccountIds.has(tx.accountId)) return sum + (Number(tx.amount) || 0);
            return sum;
        }, 0);

        purchaseReturns.forEach((r: any) => {
            if (filteredCashAccountIds.has(r.paidToAccountId)) purchaseReturnsCash += Number(r.paidAmount) || 0;
        });
        
        const allSales = salesInvoices.filter((s: any) => s.status === 'approved' || !s.status || s.status === 'completed');
        allSales.forEach((s: any) => {
            const targetId = s.paidToAccountId || (filteredCashAccounts.find(acc => acc.warehouseId === s.warehouseId)?.id);
            if (targetId && filteredCashAccountIds.has(targetId)) {
                const linkedPaymentsTotal = customerPayments
                    .filter((p: CustomerPayment) => p.invoiceId === s.id)
                    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                
                const initialCash = (Number(s.paidAmount) || 0) - linkedPaymentsTotal;
                if (initialCash > 0) salesInitialCash += initialCash;
            }
        });
        
        // Outflows
        let expensesOut = 0;
        let supplierPaymentsOut = 0;
        let purchasesCashOut = 0;
        let hrAdvancesOut = 0;
        let profitDistributionsOut = 0;
        let treasuryWithdrawalsOut = 0;
        let payrollOut = 0;
        let returnsOut = 0;

        expenses.forEach((e: Expense) => {
            if (filteredCashAccountIds.has(e.paidFromAccountId)) expensesOut += Number(e.amount) || 0;
        });
        
        supplierPayments.forEach((p: SupplierPayment) => {
            if (filteredCashAccountIds.has(p.paidFromAccountId)) supplierPaymentsOut += Number(p.amount) || 0;
        });
        
        purchaseInvoices.forEach((p: any) => {
            if (filteredCashAccountIds.has(p.paidFromAccountId)) {
                const linkedPaymentsTotal = supplierPayments
                    .filter((sp: SupplierPayment) => sp.invoiceId === p.id)
                    .reduce((sum, sp) => sum + (Number(sp.amount) || 0), 0);
                const initialPaid = (Number(p.paidAmount) || 0) - linkedPaymentsTotal;
                if (initialPaid > 0) purchasesCashOut += initialPaid;
            }
        });
        
        employeeAdvances.forEach((ea: any) => {
            if (filteredCashAccountIds.has(ea.paidFromAccountId)) hrAdvancesOut += Number(ea.amount) || 0;
        });
        
        profitDistributions.forEach((pd: any) => {
            if (filteredCashAccountIds.has(pd.paidFromAccountId)) profitDistributionsOut += Number(pd.amount) || 0;
        });
        
        treasuryWithdrawalsOut = treasuryTransactions.filter((tx: any) => tx.type === 'withdrawal' && !tx.linkedTransaction).reduce((sum, tx) => {
            if (filteredCashAccountIds.has(tx.accountId)) return sum + (Number(tx.amount) || 0);
            return sum;
        }, 0);

        payrollRecords?.forEach((pr: any) => {
            if (filteredCashAccountIds.has(pr.paidFromAccountId)) {
                payrollOut += (pr.payrollData || []).reduce((sum: number, p: any) => sum + (Number(p.netSalary) || 0), 0);
            }
        });

        salesReturns.forEach((r: any) => {
            const targetId = r.paidFromAccountId || (filteredCashAccounts.find(acc => acc.warehouseId === r.warehouseId)?.id);
            if (targetId && filteredCashAccountIds.has(targetId)) {
                returnsOut += (Number(r.paidAmount) || 0);
            }
        });

        const totalCash = openingCash + customerPaymentsTotal + extraIncomeTotal + treasuryDeposits + purchaseReturnsCash + salesInitialCash - (expensesOut + supplierPaymentsOut + purchasesCashOut + hrAdvancesOut + profitDistributionsOut + treasuryWithdrawalsOut + payrollOut + returnsOut);

        const isWarehouseAllowed = (wId?: string) => {
            if (activeWarehouseId !== 'all') return wId === activeWarehouseId;
            if (isSuperAdmin) return true;
            return userWarehouseIds.includes(wId || '');
        };

        let totalArOpening = 0;
        let totalArSalesUnpaid = 0;
        let totalArStandalonePayments = 0;
        let totalArReturns = 0;

        customers.forEach((c: any) => {
            totalArOpening += Number(c.openingBalance) || 0;
            
            salesInvoices.filter((s:any) => (s.status === 'approved' || !s.status || s.status === 'completed') && s.customerId === c.id && isWarehouseAllowed(s.warehouseId))
                .forEach((s: any) => totalArSalesUnpaid += (Number(s.total) - Number(s.paidAmount || 0)));
            
            customerPayments.filter((p: any) => p.customerId === c.id && !p.invoiceId)
                .forEach((p: any) => totalArStandalonePayments += Number(p.amount));
            
            salesReturns.filter((r: any) => r.customerId === c.id && isWarehouseAllowed(r.warehouseId))
                .forEach((r: any) => totalArReturns += (Number(r.total) - Number(r.paidAmount || 0)));
        });

        const totalReceivables = totalArOpening + totalArSalesUnpaid - totalArStandalonePayments - totalArReturns;

        let ap = 0;
        suppliers.forEach((s: any) => {
            let balance = Number(s.openingBalance) || 0;
            purchaseInvoices.filter((p: any) => p.supplierId === s.id && isWarehouseAllowed(p.warehouseId))
                .forEach((p: any) => balance += (Number(p.total) - Number(p.paidAmount || 0)));
            supplierPayments.filter((p: any) => p.supplierId === s.id && !p.invoiceId)
                .forEach((p: any) => balance -= Number(p.amount));
            purchaseReturns.filter((r: any) => r.supplierId === s.id && isWarehouseAllowed(r.warehouseId))
                .forEach((r: any) => balance -= (Number(r.total) - Number(r.paidAmount || 0)));
            ap += balance;
        });

        const totalExpenses = filteredData.filteredExpenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
        const totalPurchases = filteredData.purchases.reduce((sum: number, p: any) => sum + Number(p.total || 0), 0);
        const totalSalesReturns = filteredData.salesReturnsFiltered.reduce((sum: number, r: any) => sum + Number(r.total || 0), 0);
        
        let costOfReturnedGoods = 0;
        filteredData.salesReturnsFiltered.forEach((ret: any) => {
            const retCost = (ret.items || []).reduce((acc: number, item: any) => {
                const master = items.find((i: any) => i.id === (item.id || item.itemId));
                const unitCost = Number(item.cost ?? master?.cost ?? 0);
                return acc + (Number(item.qty || 0) * unitCost);
            }, 0);
            costOfReturnedGoods += retCost;
        });

        const unrealizedProfit = totalSalesReturns - costOfReturnedGoods;

        const totalExtraIncome = filteredData.filteredIncome.reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);
        
        let totalCOGS = 0;
        let totalRevenue = 0;
        let totalCashFromSales = 0;
        filteredData.sales.forEach((sale: any) => {
            const saleCost = sale.items.reduce((acc: number, item: any) => {
                const master = items.find((i:any) => i.id === item.id);
                const unitCost = Number(item.cost ?? master?.cost ?? 0);
                return acc + (Number(item.qty || 0) * unitCost);
            }, 0);
            totalCOGS += saleCost;
            totalRevenue += Number(sale.total);
            totalCashFromSales += Number(sale.paidAmount || 0);
        });

        const grossProfit = totalRevenue - totalCOGS;
        const netProfitValue = grossProfit - unrealizedProfit - totalExpenses + totalExtraIncome;

        return { 
            totalCash, 
            cashBreakdown: {
                opening: openingCash,
                customerPayments: customerPaymentsTotal,
                salesInitial: salesInitialCash,
                extraIncome: extraIncomeTotal,
                treasuryDeposits,
                purchaseReturns: purchaseReturnsCash,
                outflows: {
                    expenses: expensesOut,
                    supplierPayments: supplierPaymentsOut,
                    purchases: purchasesCashOut,
                    hrAdvances: hrAdvancesOut,
                    distributions: profitDistributionsOut,
                    treasuryWithdrawals: treasuryWithdrawalsOut,
                    payroll: payrollOut,
                    returns: returnsOut
                }
            },
            accountsReceivable: totalReceivables, 
            receivablesBreakdown: {
                opening: totalArOpening,
                salesUnpaid: totalArSalesUnpaid,
                standalonePayments: totalArStandalonePayments,
                returns: totalArReturns
            },
            accountsPayable: ap, 
            totalRevenue,
            totalCashFromSales,
            totalExpenses,
            totalSalesReturns,
            costOfReturnedGoods,
            unrealizedProfit,
            totalPurchases,
            totalCOGS,
            totalExtraIncome,
            grossProfit,
            netProfit: netProfitValue,
            customersCount: customers.length,
            suppliersCount: suppliers.length,
            productsCount: items.length,
            balanceExplanation: `إجمالي السيولة النقدية في ${filteredCashAccounts.length} حساب/خزينة متاحة للفلاتر المختارة.`
        };
    }, [
        cashAccounts, customerPayments, exceptionalIncomes, treasuryTransactions, expenses, 
        supplierPayments, purchaseInvoices, employeeAdvances, profitDistributions, customers, 
        salesInvoices, posSales, salesReturns, suppliers, purchaseReturns, items, warehouses, filters.warehouseId, user, filteredData, posReturns, payrollRecords
    ]);

    const handlePrintCustomersReport = () => {
        const userWarehouseIds = user?.warehouseIds || [];
        const isSuperAdmin = userWarehouseIds.includes('all');
        const activeWarehouseId = filters.warehouseId;
        
        const isWarehouseAllowed = (wId?: string) => {
            if (activeWarehouseId !== 'all') return wId === activeWarehouseId;
            if (isSuperAdmin) return true;
            return userWarehouseIds.includes(wId || '');
        };

        const customerDetailedBalances = customers.map((customer: Customer) => {
            let balance = Number(customer.openingBalance) || 0;
            
            salesInvoices.filter((s: any) => (s.status === 'approved' || !s.status || s.status === 'completed') && s.customerId === customer.id && isWarehouseAllowed(s.warehouseId))
                .forEach((s: any) => balance += (Number(s.total) - Number(s.paidAmount || 0)));
            
            customerPayments.filter((p: any) => p.customerId === customer.id && !p.invoiceId)
                .forEach((p: any) => balance -= Number(p.amount));
            
            salesReturns.filter((r: any) => r.customerId === customer.id && isWarehouseAllowed(r.warehouseId))
                .forEach((r: any) => balance -= (Number(r.total) - Number(r.paidAmount || 0)));

            return {
                name: customer.name,
                phone: (customer as any).phone || '-',
                balance
            };
        }).filter(c => Math.abs(c.balance) > 0.01).sort((a,b) => b.balance - a.balance);

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const tableHtml = `
            <html dir="rtl" lang="ar">
            <head>
                <title>تقرير مديونيات العملاء</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
                    h1 { text-align: center; color: #333; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
                    th { bg-color: #f4f4f4; font-weight: bold; }
                    .total { font-weight: bold; font-size: 1.2em; margin-top: 20px; text-align: left; }
                    .negative { color: #d32f2f; }
                    .positive { color: #2e7d32; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <h1>تقرير أرصدة ومديونيات العملاء</h1>
                <p>التاريخ: ${new Date().toLocaleString('ar-EG')}</p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>اسم العميل</th>
                            <th>رقم الهاتف</th>
                            <th>الرصيد الحالي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${customerDetailedBalances.map((c, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${c.name}</td>
                                <td>${c.phone}</td>
                                <td class="${c.balance > 0 ? 'negative' : 'positive'}">${c.balance.toLocaleString()} ج.م</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="total">إجمالي المديونيات المستحقة: ${kpiData.accountsReceivable.toLocaleString()} ج.م</div>
                <script>window.onload = () => { window.print(); window.close(); }</script>
            </body>
            </html>
        `;

        printWindow.document.write(tableHtml);
        printWindow.document.close();
    };

    const salesAndProfitChartData = useMemo(() => {
        const dailyData: { [date: string]: { sales: number; profit: number } } = {};
        filteredData.sales.forEach((sale: any) => {
            const date = new Date(sale.date).toISOString().split('T')[0];
            if (!dailyData[date]) dailyData[date] = { sales: 0, profit: 0 };
            
            const saleCost = sale.items.reduce((acc: number, item: any) => {
                const master = items.find((i:any) => i.id === item.id);
                return acc + (Number(item.qty) * (Number(item.cost) || Number(master?.cost) || 0));
            }, 0);
            
            dailyData[date].sales += Number(sale.total) || 0;
            dailyData[date].profit += (Number(sale.total) - saleCost);
        });
        
        return Object.entries(dailyData).map(([date, data]) => ({ date: new Date(date).toLocaleDateString('ar-EG', {month: 'short', day: 'numeric'}), ...data }))
          .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [filteredData.sales, items]);
    
    const topBranchesChartData = useMemo(() => {
        const branchSales: {[id: string]: number} = {};
        filteredData.sales.forEach((s: any) => {
            if(s.warehouseId) {
                branchSales[s.warehouseId] = (branchSales[s.warehouseId] || 0) + Number(s.total);
            }
        });
        return Object.entries(branchSales)
            .map(([id, total]) => ({ name: warehouses.find((w:any) => w.id === id)?.name || 'غير معروف', total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    }, [filteredData.sales, warehouses]);

    const peakHoursChartData = useMemo(() => {
        const hours = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            label: `${(i % 12 === 0 ? 12 : i % 12)} ${i < 12 ? 'ص' : 'م'}`,
            visits: 0,
        }));

        filteredData.sales.forEach(sale => {
            const saleHour = new Date(sale.date).getHours();
            if (hours[saleHour]) {
                hours[saleHour].visits += 1;
            }
        });
        return hours;
    }, [filteredData.sales]);


    const topSellingItems = useMemo(() => {
        const itemSales = new Map<string, {name: string, qty: number, value: number}>();
        filteredData.sales.forEach(sale => {
            sale.items.forEach((item: any) => {
                const itemMaster = items.find((i:any) => i.id === item.id);
                if (!itemMaster) return;
                const current = itemSales.get(item.id) || { name: itemMaster.name, qty: 0, value: 0 };
                current.qty += Number(item.qty) || 0;
                current.value += (Number(item.qty) || 0) * (Number(item.price) || Number(itemMaster.price) || 0);
                itemSales.set(item.id, current);
            });
        });
        return Array.from(itemSales.values()).sort((a, b) => b.value - a.value).slice(0, 20);
    }, [filteredData.sales, items]);

    const reorderItems = useMemo(() => {
        const userWarehouseIds = user?.warehouseIds || [];
        const isSuperAdmin = userWarehouseIds.includes('all');
        const activeWarehouseId = filters.warehouseId;
        
        const isWarehouseAllowed = (wId?: string) => {
            if (activeWarehouseId !== 'all') return wId === activeWarehouseId;
            if (isSuperAdmin) return true;
            return userWarehouseIds.includes(wId || '');
        };

        return inventory
            .filter((inv: any) => isWarehouseAllowed(inv.id.split('-')[0]))
            .map((inv: any) => {
                const itemId = inv.id.split('-')[1];
                const itemMaster = items.find((i: Item) => i.id === itemId);
                if (!itemMaster || !itemMaster.reorderPoint || Number(inv.balance) > Number(itemMaster.reorderPoint)) return null;
                
                return {
                    name: itemMaster.name,
                    stock: inv.balance,
                    reorderPoint: itemMaster.reorderPoint,
                    warehouseName: warehouses.find((w: any) => w.id === inv.id.split('-')[0])?.name || ''
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .slice(0, 20);
    }, [inventory, items, warehouses, user, filters.warehouseId]);

    if (loading) {
        return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

  return (
    <>
      <PageHeader title="المعلومات الرئيسية" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
            <CardContent className="pt-6">
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     <div className="space-y-2">
                        <Label>من تاريخ</Label>
                        <Input type="date" value={filters.fromDate} onChange={(e) => handleFilterChange("fromDate", e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label>إلى تاريخ</Label>
                        <Input type="date" value={filters.toDate} onChange={(e) => handleFilterChange("toDate", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>الفرع</Label>
                        <Combobox
                          options={warehouseOptions}
                          value={filters.warehouseId}
                          onValueChange={(v) => {
                              handleFilterChange("warehouseId", v || "all");
                          }}
                          placeholder="كل الفروع"
                          emptyMessage="لم يتم العثور على فرع."
                          disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Dialog open={isCashBreakdownOpen} onOpenChange={setIsCashBreakdownOpen}>
                <DialogTrigger asChild>
                    <Card className="cursor-pointer hover:bg-muted/50 transition-colors border-primary/20 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">إجمالي الأرصدة (السيولة)</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground text-primary"/>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{kpiData.totalCash.toLocaleString()} ج.م</div>
                            <p className="text-[10px] text-muted-foreground mt-1">انقر لعرض مصادر وتدفق السيولة</p>
                        </CardContent>
                    </Card>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-primary"/>
                            مصادر وتدفق السيولة النقدية
                        </DialogTitle>
                        <DialogDescription>تفصيل المبالغ التي ساهمت في تكوين رصيد السيولة الحالي للفترة المختارة.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">الإيرادات والمدخلات (+)</div>
                            <div className="flex justify-between text-sm items-center">
                                <span>أرصدة افتتاحية (الخزائن):</span>
                                <span className="font-semibold text-green-600 flex items-center gap-1"><Plus className="h-3 w-3"/>{kpiData.cashBreakdown.opening.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                                <span>مقبوضات من العملاء:</span>
                                <span className="font-semibold text-green-600 flex items-center gap-1"><Plus className="h-3 w-3"/>{kpiData.cashBreakdown.customerPayments.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                                <span>محصل نقدياً من الفواتير:</span>
                                <span className="font-semibold text-green-600 flex items-center gap-1"><Plus className="h-3 w-3"/>{kpiData.cashBreakdown.salesInitial.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                                <span>دخل متنوع (إضافي):</span>
                                <span className="font-semibold text-green-600 flex items-center gap-1"><Plus className="h-3 w-3"/>{kpiData.cashBreakdown.extraIncome.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                                <span>إيداعات رأس مال:</span>
                                <span className="font-semibold text-green-600 flex items-center gap-1"><Plus className="h-3 w-3"/>{kpiData.cashBreakdown.treasuryDeposits.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                                <span>مبالغ مستردة (مرتجع شراء):</span>
                                <span className="font-semibold text-green-600 flex items-center gap-1"><Plus className="h-3 w-3"/>{kpiData.cashBreakdown.purchaseReturns.toLocaleString()}</span>
                            </div>
                        </div>
                        <Separator />
                        <div className="space-y-2">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">المدفوعات والمخرجات (-)</div>
                            <div className="flex justify-between text-sm items-center">
                                <span>مصروفات تشغيلية:</span>
                                <span className="font-semibold text-destructive flex items-center gap-1"><Minus className="h-3 w-3"/>{kpiData.cashBreakdown.outflows.expenses.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                                <span>مدفوعات للموردين:</span>
                                <span className="font-semibold text-destructive flex items-center gap-1"><Minus className="h-3 w-3"/>{kpiData.cashBreakdown.outflows.supplierPayments.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                                <span>مشتريات نقدية:</span>
                                <span className="font-semibold text-destructive flex items-center gap-1"><Minus className="h-3 w-3"/>{kpiData.cashBreakdown.outflows.purchases.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                                <span>رواتب (صافي):</span>
                                <span className="font-semibold text-destructive flex items-center gap-1"><Minus className="h-3 w-3"/>{kpiData.cashBreakdown.outflows.payroll.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                                <span>سحوبات وتوزيعات أرباح:</span>
                                <span className="font-semibold text-destructive flex items-center gap-1"><Minus className="h-3 w-3"/>{kpiData.cashBreakdown.outflows.distributions.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm items-center">
                                <span>رد نقدية (مرتجع مبيعات):</span>
                                <span className="font-semibold text-destructive flex items-center gap-1"><Minus className="h-3 w-3"/>{kpiData.cashBreakdown.outflows.returns.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="p-4 bg-muted rounded-lg flex justify-between items-center border-2 border-primary/20">
                            <span className="font-bold text-lg">السيولة المتاحة:</span>
                            <span className="font-black text-2xl text-primary">{kpiData.totalCash.toLocaleString()} ج.م</span>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isReceivablesBreakdownOpen} onOpenChange={setIsReceivablesBreakdownOpen}>
                <DialogTrigger asChild>
                    <Card className="cursor-pointer hover:bg-muted/50 transition-colors border-amber-200 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">مستحقات العملاء (مديونيات)</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground text-amber-600"/>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-amber-600">{kpiData.accountsReceivable.toLocaleString()} ج.م</div>
                            <p className="text-[10px] text-muted-foreground mt-1">انقر لعرض تفاصيل المديونيات</p>
                        </CardContent>
                    </Card>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ArrowUpCircle className="h-5 w-5 text-amber-600"/>
                            تفاصيل مديونيات العملاء
                        </DialogTitle>
                        <DialogDescription>توضيح لكيفية احتساب إجمالي المبالغ المطلوبة من العملاء.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span>أرصدة افتتاحية (قديمة):</span>
                                <span className="font-semibold">+{kpiData.receivablesBreakdown.opening.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span>إجمالي مبيعات آجلة (جديدة):</span>
                                <span className="font-semibold">+{kpiData.receivablesBreakdown.salesUnpaid.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>(-) تحصيلات مستقلة:</span>
                                <span className="font-semibold text-green-600">-{kpiData.receivablesBreakdown.standalonePayments.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>(-) قيمة مرتجعات مبيعات:</span>
                                <span className="font-semibold text-green-600">-{kpiData.receivablesBreakdown.returns.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex justify-between items-center border-2 border-amber-200">
                            <span className="font-bold text-lg">صافي المديونية:</span>
                            <span className="font-black text-2xl text-amber-600">{kpiData.accountsReceivable.toLocaleString()} ج.م</span>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">مستحقات الموردين</CardTitle><Building className="h-4 w-4 text-muted-foreground"/></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{kpiData.accountsPayable.toLocaleString()} ج.م</div></CardContent></Card>
            
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">قيمة المخزون (بالتكلفة)</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground"/>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{accurateInventoryValue.toLocaleString()} ج.م</div>
                    <p className="text-[10px] text-muted-foreground mt-1">يتم احتسابه آلياً بناءً على الأرصدة الحقيقية</p>
                </CardContent>
            </Card>

            <Dialog open={isNetProfitBreakdownOpen} onOpenChange={setIsNetProfitBreakdownOpen}>
                <DialogTrigger asChild>
                    <Card className="cursor-pointer hover:bg-muted/50 transition-all border-green-600/30 bg-green-500/5 shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-bold text-green-700 dark:text-green-400">صافي الربح التقديري</CardTitle>
                            <TrendingUp className="h-4 w-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className={cn("text-2xl font-black tracking-tight", kpiData.netProfit >= 0 ? "text-green-600" : "text-destructive")}>
                                {kpiData.netProfit.toLocaleString()} ج.م
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">انقر لعرض ملخص تحليل الأرباح</p>
                        </CardContent>
                    </Card>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Calculator className="h-5 w-5 text-green-600"/>
                            تحليل صافي الربح للفترة
                        </DialogTitle>
                        <DialogDescription>توضيح لكيفية احتساب صافي الربح النهائي بعد خصم كافة المصاريف والتكاليف.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span>إجمالي المبيعات (الإيرادات):</span>
                                <span className="font-semibold">+{kpiData.totalRevenue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>(-) تكلفة البضاعة المباعة (COGS):</span>
                                <span className="font-semibold text-destructive">-{kpiData.totalCOGS.toLocaleString()}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between font-bold text-sm">
                                <span>(=) مجمل الربح:</span>
                                <span className="text-green-600">{kpiData.grossProfit.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm text-muted-foreground italic">
                                <span>(-) أرباح المرتجعات غير المحققة:</span>
                                <span className="font-semibold">-{kpiData.unrealizedProfit.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>(-) إجمالي المصروفات التشغيلية:</span>
                                <span className="font-semibold text-destructive">-{kpiData.totalExpenses.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>(+) دخل استثنائي / متنوع:</span>
                                <span className="font-semibold text-green-600">+{kpiData.totalExtraIncome.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className={cn(
                            "p-5 rounded-xl flex justify-between items-center border-2",
                            kpiData.netProfit >= 0 ? "bg-background border-green-200" : "bg-background border-red-200"
                        )}>
                            <span className="font-black text-xl">صافي الربح النهائي:</span>
                            <span className={cn("font-black text-2xl", kpiData.netProfit >= 0 ? "text-green-600" : "text-destructive")}>
                                {kpiData.netProfit.toLocaleString()} ج.م
                            </span>
                        </div>
                        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded text-[10px] text-muted-foreground">
                            <Info className="h-3 w-3 shrink-0" />
                            <span>يتم احتساب الربح بناءً على أسعار التكلفة المسجلة في الأصناف وقت البيع.</span>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">إجمالي المبيعات</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-primary"/>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpiData.totalRevenue.toLocaleString()} ج.م</div>
                    <p className="text-[10px] text-muted-foreground mt-1">إجمالي الفواتير الصادرة</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">المحصل نقداً</CardTitle>
                    <Banknote className="h-4 w-4 text-green-500"/>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{kpiData.totalCashFromSales.toLocaleString()} ج.م</div>
                    <p className="text-[10px] text-muted-foreground mt-1">المبالغ المستلمة فعلياً</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">تكلفة البضاعة المباعة</CardTitle>
                    <Tag className="h-4 w-4 text-amber-600"/>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-amber-600">{kpiData.totalCOGS.toLocaleString()} ج.م</div>
                    <p className="text-[10px] text-muted-foreground mt-1">COGS للفترة المحددة</p>
                </CardContent>
            </Card>
            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground"/></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{kpiData.totalExpenses.toLocaleString()} ج.م</div></CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">إجمالي المرتجعات</CardTitle><TrendingDown className="h-4 w-4 text-muted-foreground"/></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{kpiData.totalSalesReturns.toLocaleString()} ج.م</div></CardContent></Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={handlePrintCustomersReport}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">إجمالي العملاء</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground text-blue-500"/>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpiData.customersCount}</div>
                    <p className="text-[10px] text-muted-foreground mt-1">انقر لطباعة تقرير مديونيات العملاء</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">إجمالي الموردين</CardTitle>
                    <Building className="h-4 w-4 text-muted-foreground text-orange-500"/>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpiData.suppliersCount}</div>
                    <p className="text-[10px] text-muted-foreground mt-1">عدد الموردين المسجلين</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">إجمالي الأصناف</CardTitle>
                    <Boxes className="h-4 w-4 text-muted-foreground text-purple-500"/>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{kpiData.productsCount}</div>
                    <p className="text-[10px] text-muted-foreground mt-1">إجمالي دليل الأصناف</p>
                </CardContent>
            </Card>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
                <CardHeader><CardTitle>المبيعات والأرباح</CardTitle></CardHeader>
                <CardContent className="h-[300px]">
                     <ChartContainer config={chartConfig} className="h-full w-full">
                         <BarChart data={salesAndProfitChartData}>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value/1000}k`} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Legend />
                            <Bar dataKey="sales" fill="var(--color-sales)" name="المبيعات" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="profit" fill="var(--color-profit)" name="الأرباح" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>
             <Card>
                <CardHeader><CardTitle>أعلى 5 فروع مبيعًا</CardTitle></CardHeader>
                <CardContent className="h-[300px]">
                     <ChartContainer config={chartConfig} className="w-full h-full">
                        <BarChart data={topBranchesChartData} layout="vertical">
                            <CartesianGrid horizontal={false} />
                            <YAxis dataKey="name" type="category" width={isMobile ? 0 : 80} tick={!isMobile} tickLine={false} axisLine={false} />
                            <XAxis type="number" hide />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="total" name="إجمالي المبيعات" fill="hsl(var(--chart-3))" radius={5}>
                                <LabelList position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(v: number) => v.toLocaleString()} />
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>
        </div>
        
        <div className="grid grid-cols-1 gap-4">
             <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Clock /> أوقات الذروة (عدد الفواتير)</CardTitle></CardHeader>
                <CardContent className="h-[300px]">
                    <ChartContainer config={chartConfig} className="h-full w-full">
                        <BarChart data={peakHoursChartData}>
                            <CartesianGrid vertical={false} />
                            <XAxis
                                dataKey="label"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                angle={isMobile ? -45 : 0}
                                textAnchor={isMobile ? "end" : "middle"}
                                height={isMobile ? 50 : 30}
                            />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="visits" fill="var(--color-visits)" name="عدد الفواتير" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
                <CardHeader><CardTitle>أفضل 20 صنف مبيعًا</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead className="text-center">الكمية</TableHead><TableHead className="text-center">القيمة</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {topSellingItems.map(item => (
                                <TableRow key={item.name}><TableCell>{item.name}</TableCell><TableCell className="text-center">{item.qty}</TableCell><TableCell className="text-center">{item.value.toLocaleString()}</TableCell></TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex items-center gap-2"><AlertTriangle className="text-amber-500" />أصناف وصلت لحد الطلب</CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead>الفرع</TableHead><TableHead className="text-center">الرصيد</TableHead><TableHead className="text-center">حد الطلب</TableHead></TableRow></TableHeader>
                        <TableBody>
                             {reorderItems.map(item => (
                                <TableRow key={`${item.name}-${item.warehouseName}`} className="bg-amber-500/10">
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell>{item.warehouseName}</TableCell>
                                    <TableCell className="text-center font-bold text-destructive">{item.stock}</TableCell>
                                    <TableCell className="text-center">{item.reorderPoint}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
      </main>
    </>
  );
}
