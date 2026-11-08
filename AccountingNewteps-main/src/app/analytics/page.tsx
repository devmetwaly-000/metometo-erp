
"use client"

import React, { useMemo, useState, useCallback } from 'react';
import { 
  Bar, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Pie, 
  PieChart as RechartsPieChart, 
  BarChart as RechartsBarChart, 
  Cell, 
  Area, 
  AreaChart, 
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList
} from "recharts";
import { useData } from "@/contexts/data-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import PageHeader from "@/components/page-header";
import { Loader2, TrendingUp, DollarSign, ShoppingBag, Percent, Filter, Calendar, CreditCard, Wallet, PieChart, Users2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// Chart configuration
const chartConfig = {
  sales: {
    label: "المبيعات",
    color: "hsl(var(--primary))",
  },
  profit: {
    label: "الأرباح",
    color: "hsl(var(--chart-2))",
  },
  expenses: {
    label: "المصروفات",
    color: "hsl(var(--destructive))",
  },
  revenue: {
    label: "الإيراد",
    color: "hsl(var(--primary))",
  },
  rep: {
    label: "مبيعات المندوب",
    color: "hsl(var(--chart-4))",
  }
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function AnalyticsPage() {
    const allDataContext = useData();
    const { 
        items, salesInvoices, purchaseInvoices, warehouses, 
        expenses, posSales, salesReturns, posReturns, 
        exceptionalIncomes, users, loading 
    } = allDataContext;
    
    const isMobile = useIsMobile();

    // Default to last 5 months
    const [dateRange, setDateRange] = useState({
      from: new Date(new Date().setMonth(new Date().getMonth() - 5)).toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0]
    });
    const [selectedWarehouse, setSelectedWarehouse] = useState('all');

    const calculateItemCost = useCallback((itemMaster: any, saleItem?: any) => {
        if (saleItem?.cost) return saleItem.cost;
        if (!itemMaster) return 0;
        if (itemMaster.itemType === 'manufactured' && itemMaster.components) {
            return itemMaster.components.reduce((total: number, comp: any) => {
                const compMaster = items.find(i => i.id === comp.itemId);
                return total + (comp.quantity * (compMaster?.cost || 0));
            }, 0);
        }
        return itemMaster.cost || 0;
    }, [items]);

    const analytics = useMemo(() => {
        if (loading) return null;

        const start = dateRange.from ? new Date(dateRange.from) : new Date(0);
        const end = dateRange.to ? new Date(dateRange.to) : new Date();
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);

        const filterByBase = (record: any) => {
            const d = new Date(record.date);
            const inDate = d >= start && d <= end;
            const inWarehouse = selectedWarehouse === 'all' || record.warehouseId === selectedWarehouse;
            return inDate && inWarehouse;
        };

        const filteredSales = [...salesInvoices.filter(s => s.status === 'approved'), ...posSales].filter(filterByBase);
        const filteredReturns = [...salesReturns, ...posReturns].filter(filterByBase);
        const filteredExpenses = expenses.filter(e => {
            const d = new Date(e.date);
            const inDate = d >= start && d <= end;
            const inWarehouse = selectedWarehouse === 'all' || !e.warehouseId || e.warehouseId === 'none' || e.warehouseId === selectedWarehouse;
            return inDate && inWarehouse;
        });
        const filteredIncome = exceptionalIncomes.filter(filterByBase);

        const dailyDataMap = new Map<string, { date: string, sales: number, profit: number, expenses: number }>();
        let totalRevenue = 0;
        let totalCOGS = 0;
        let cashSales = 0;
        let creditSales = 0;

        const repSalesMap = new Map<string, number>();
        const itemStats = new Map<string, { name: string, qty: number, revenue: number, profit: number }>();

        filteredSales.forEach(sale => {
            const dateKey = new Date(sale.date).toISOString().split('T')[0];
            const current = dailyDataMap.get(dateKey) || { date: dateKey, sales: 0, profit: 0, expenses: 0 };
            
            const saleRevenue = sale.total;
            const saleCOGS = sale.items?.reduce((sum: number, si: any) => {
                const master = items.find(i => i.id === si.id);
                const cost = calculateItemCost(master, si);
                
                // Track per-item stats
                if (master) {
                    const stats = itemStats.get(si.id) || { name: master.name, qty: 0, revenue: 0, profit: 0 };
                    stats.qty += si.qty;
                    stats.revenue += si.qty * si.price;
                    stats.profit += (si.qty * si.price) - (si.qty * cost);
                    itemStats.set(si.id, stats);
                }

                return sum + (si.qty * cost);
            }, 0) || 0;

            current.sales += saleRevenue;
            current.profit += (saleRevenue - saleCOGS);
            totalRevenue += saleRevenue;
            totalCOGS += saleCOGS;
            
            const paid = sale.paidAmount || 0;
            cashSales += paid;
            creditSales += (sale.total - paid);

            // Rep Performance (only for standard invoices usually)
            if (sale.salesRepId) {
                repSalesMap.set(sale.salesRepId, (repSalesMap.get(sale.salesRepId) || 0) + saleRevenue);
            }

            dailyDataMap.set(dateKey, current);
        });

        filteredReturns.forEach(ret => {
            const dateKey = new Date(ret.date).toISOString().split('T')[0];
            const current = dailyDataMap.get(dateKey) || { date: dateKey, sales: 0, profit: 0, expenses: 0 };
            
            const retValue = ret.total;
            const retCOGS = ret.items?.reduce((sum: number, ri: any) => {
                const master = items.find(i => i.id === ri.id);
                const cost = calculateItemCost(master, ri);

                // Track per-item stats (reduce from stats)
                if (master) {
                    const stats = itemStats.get(ri.id) || { name: master.name, qty: 0, revenue: 0, profit: 0 };
                    stats.qty -= ri.qty;
                    stats.revenue -= ri.qty * ri.price;
                    stats.profit -= (ri.qty * ri.price) - (ri.qty * cost);
                    itemStats.set(ri.id, stats);
                }

                return sum + (ri.qty * cost);
            }, 0) || 0;

            current.sales -= retValue;
            current.profit -= (retValue - retCOGS);
            totalRevenue -= retValue;
            totalCOGS -= retCOGS;

            dailyDataMap.set(dateKey, current);
        });

        const expensesByTypeMap = new Map<string, number>();
        let totalExpAmount = 0;
        filteredExpenses.forEach(exp => {
            const dateKey = new Date(exp.date).toISOString().split('T')[0];
            const current = dailyDataMap.get(dateKey) || { date: dateKey, sales: 0, profit: 0, expenses: 0 };
            current.expenses += exp.amount;
            totalExpAmount += exp.amount;
            
            expensesByTypeMap.set(exp.expenseType, (expensesByTypeMap.get(exp.expenseType) || 0) + exp.amount);
            dailyDataMap.set(dateKey, current);
        });

        const totalExtraIncome = filteredIncome.reduce((sum, i) => sum + i.amount, 0);
        const netProfit = (totalRevenue - totalCOGS) - totalExpAmount + totalExtraIncome;
        const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCOGS) / totalRevenue) * 100 : 0;

        const paymentStats = new Map<string, number>();
        filteredSales.forEach(sale => {
            if (sale.payments && sale.payments.length > 0) {
                sale.payments.forEach((p: any) => {
                    paymentStats.set(p.method, (paymentStats.get(p.method) || 0) + p.amount);
                });
            } else {
                paymentStats.set("نقدي", (paymentStats.get("نقدي") || 0) + (sale.paidAmount || sale.total));
            }
        });

        const repPerformance = Array.from(repSalesMap.entries()).map(([repId, amount]) => {
            const user = users.find(u => u.id === repId);
            return {
                name: user?.name || "مندوب غير معروف",
                amount
            };
        }).sort((a,b) => b.amount - a.amount);

        return {
            kpis: {
                totalRevenue,
                netProfit,
                grossMargin,
                avgInvoice: filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0,
                debtRatio: totalRevenue > 0 ? (creditSales / totalRevenue) * 100 : 0,
                invoiceCount: filteredSales.length
            },
            trendData: Array.from(dailyDataMap.values()).sort((a,b) => a.date.localeCompare(b.date)).map(d => ({
                ...d,
                date: new Date(d.date).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
            })),
            itemProfitLossData: Array.from(itemStats.values()).sort((a,b) => b.profit - a.profit).slice(0, 15),
            expensesByType: Array.from(expensesByTypeMap.entries()).map(([name, value]) => ({ name, value })),
            paymentData: Array.from(paymentStats.entries()).map(([name, value]) => ({ name, value })),
            debtData: [
                { name: 'محصل نقدياً', value: cashSales },
                { name: 'آجل (ديون)', value: creditSales }
            ],
            warehouseData: warehouses.map(w => ({
                name: w.name,
                sales: filteredSales.filter(s => s.warehouseId === w.id).reduce((sum, s) => sum + s.total, 0)
            })).sort((a,b) => b.sales - a.sales),
            repPerformance
        };
    }, [loading, dateRange, selectedWarehouse, salesInvoices, posSales, salesReturns, posReturns, expenses, exceptionalIncomes, items, warehouses, users, calculateItemCost]);

    if (loading || !analytics) {
        return (
            <div className="flex h-[80vh] w-full items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-muted-foreground animate-pulse font-bold text-lg">جاري تحليل البيانات...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <PageHeader title="التحليلات الرسومية المتقدمة" />
            <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-muted/10">
                
                <Card className="shadow-sm border-primary/10">
                    <CardContent className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Calendar className="h-4 w-4"/> من تاريخ</Label>
                                <Input type="date" value={dateRange.from} onChange={(e) => setDateRange(prev => ({...prev, from: e.target.value}))} />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Calendar className="h-4 w-4"/> إلى تاريخ</Label>
                                <Input type="date" value={dateRange.to} onChange={(e) => setDateRange(prev => ({...prev, to: e.target.value}))} />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Filter className="h-4 w-4"/> الفرع</Label>
                                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                                    <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">كل الفروع</SelectItem>
                                        {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-bold">إجمالي المبيعات</CardTitle>
                            <DollarSign className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight">{analytics.kpis.totalRevenue.toLocaleString()} ج.م</div>
                            <p className="text-[10px] text-muted-foreground mt-1">إجمالي الفواتير الصافية</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-green-500/5 border-green-500/20">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-bold">صافي الربح التقديري</CardTitle>
                            <TrendingUp className="h-4 w-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className={cn("text-2xl font-bold tracking-tight", analytics.kpis.netProfit >= 0 ? "text-green-600" : "text-destructive")}>
                                {analytics.kpis.netProfit.toLocaleString()} ج.م
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">بعد خصم التكلفة والمصروفات</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-amber-500/5 border-amber-500/20">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-bold">نسبة الديون للمبيعات</CardTitle>
                            <CreditCard className="h-4 w-4 text-amber-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-amber-600">{analytics.kpis.debtRatio.toFixed(1)}%</div>
                            <p className="text-[10px] text-muted-foreground mt-1">نسبة المديونية من إجمالي المبيعات</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-blue-500/5 border-blue-500/20">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-bold">هامش الربح</CardTitle>
                            <Percent className="h-4 w-4 text-blue-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-blue-600">{analytics.kpis.grossMargin.toFixed(1)}%</div>
                            <p className="text-[10px] text-muted-foreground mt-1">من إجمالي قيمة المبيعات</p>
                        </CardContent>
                    </Card>
                </div>

                <Card className="shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><TrendingUp className="text-primary h-5 w-5"/> اتجاهات المبيعات والأرباح</CardTitle>
                        <CardDescription>مقارنة النشاط اليومي مقابل المصروفات.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig} className="h-[350px] w-full">
                            <AreaChart data={analytics.trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-profit)" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} fontSize={12} />
                                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Legend verticalAlign="top" height={36}/>
                                <Area type="monotone" dataKey="sales" name="المبيعات" stroke="var(--color-sales)" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                                <Area type="monotone" dataKey="profit" name="الأرباح" stroke="var(--color-profit)" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
                                <Area type="monotone" dataKey="expenses" name="المصروفات" stroke="var(--color-expenses)" strokeWidth={2} strokeDasharray="5 5" fill="none" />
                            </AreaChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="shadow-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Users2 className="text-primary h-5 w-5"/> أداء المناديب</CardTitle>
                            <CardDescription>إجمالي المبيعات المحققة لكل مندوب.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={chartConfig} className="h-[350px] w-full">
                                <RechartsBarChart data={analytics.repPerformance} layout="vertical" margin={{ left: isMobile ? -20 : 10, right: 40 }}>
                                    <CartesianGrid horizontal={false} opacity={0.2} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={isMobile ? 0 : 120} tickLine={false} axisLine={false} fontSize={11} tick={!isMobile} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="amount" name="المبيعات" fill="var(--color-rep)" radius={[0, 4, 4, 0]}>
                                        <LabelList dataKey="amount" position="right" fontSize={10} formatter={(v: number) => v.toLocaleString()} />
                                    </Bar>
                                </RechartsBarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>

                    <Card className="shadow-md">
                        <CardHeader>
                            <CardTitle>تقرير أرباح وخسائر الأصناف</CardTitle>
                            <CardDescription>تحليل صافي الربح لكل صنف (المبيعات مطروحاً منها التكلفة والمرتجعات).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={chartConfig} className="h-[350px] w-full">
                                <RechartsBarChart data={analytics.itemProfitLossData} layout="vertical" margin={{ left: isMobile ? -20 : 10, right: 40 }}>
                                    <CartesianGrid horizontal={false} opacity={0.2} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={isMobile ? 0 : 120} tickLine={false} axisLine={false} fontSize={11} tick={!isMobile} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="profit" name="صافي الربح" radius={[0, 4, 4, 0]}>
                                        {analytics.itemProfitLossData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? "#10b981" : "#ef4444"} />
                                        ))}
                                        <LabelList dataKey="profit" position="right" fontSize={10} formatter={(v: number) => v.toLocaleString()} />
                                    </Bar>
                                </RechartsBarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="shadow-md flex flex-col">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><PieChart className="text-destructive h-5 w-5" /> توزيع المصروفات</CardTitle>
                            <CardDescription>تحليل المصروفات التشغيلية حسب التصنيف.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 flex items-center justify-center p-0 pb-6">
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsPieChart>
                                        <Pie
                                            data={analytics.expensesByType}
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                            cx="50%"
                                            cy="50%"
                                        >
                                            {analytics.expensesByType.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(val: number) => val.toLocaleString() + " ج.م"} />
                                        <Legend verticalAlign="bottom" height={36}/>
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-md flex flex-col">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Wallet className="text-primary h-5 w-5" /> جودة المبيعات (نقد مقابل ديون)</CardTitle>
                            <CardDescription>نسبة المبالغ المحصلة فعلياً مقابل المديونيات.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 flex items-center justify-center p-0 pb-6">
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsPieChart>
                                        <Pie
                                            data={analytics.debtData}
                                            innerRadius={0}
                                            outerRadius={100}
                                            dataKey="value"
                                            label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            cx="50%"
                                            cy="50%"
                                        >
                                            <Cell fill="#10b981" stroke="none" />
                                            <Cell fill="#ef4444" stroke="none" />
                                        </Pie>
                                        <Tooltip formatter={(val: number) => val.toLocaleString() + " ج.م"} />
                                        <Legend verticalAlign="bottom" height={36}/>
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="shadow-md">
                    <CardHeader>
                        <CardTitle>أداء المبيعات حسب الفرع</CardTitle>
                        <CardDescription>مقارنة حجم المبيعات بين الفروع المختلفة.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6 pt-4">
                            {analytics.warehouseData.map((w, idx) => (
                                <div key={idx} className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="font-semibold">{w.name}</span>
                                        <span className="font-mono">{w.sales.toLocaleString()} ج.م</span>
                                    </div>
                                    <div className="h-3 w-full bg-muted rounded-full overflow-hidden border">
                                        <div 
                                            className="h-full bg-primary transition-all duration-500" 
                                            style={{ width: `${(w.sales / (analytics.kpis.totalRevenue || 1)) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                            {analytics.warehouseData.length === 0 && <p className="text-center text-muted-foreground py-4">لا توجد بيانات فروع.</p>}
                        </div>
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
