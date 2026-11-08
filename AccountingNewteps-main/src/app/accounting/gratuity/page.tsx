
"use client";

import React, { useState, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
  TableFooter
} from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { 
    Loader2, Coins, HandCoins, History, ArrowDownCircle, 
    CheckCircle, Trash2, Calendar, FileText, Download, 
    Filter, Users, BarChart3, TrendingUp, Percent 
} from "lucide-react";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/auth-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Combobox } from '@/components/ui/combobox';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';

export default function GratuityManagementPage() {
    const { 
        gratuityLogs, gratuityDistributions, posSales, salesInvoices,
        dbAction, getNextId, cashAccounts, loading, warehouses, users 
    } = useData();
    const { user } = useAuth();
    const { toast } = useToast();

    // Filter States
    const [filters, setFilters] = useState({
        cashierId: 'all',
        warehouseId: 'all',
        fromDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        toDate: new Date().toISOString().split('T')[0]
    });

    // Form State for Distribution
    const [distAmount, setDistAmount] = useState(0);
    const [distFromAccountId, setDistFromAccountId] = useState('');
    const [distNotes, setDistNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // 1. Calculate Fund Balance (Absolute Total)
    const totalCollectedAllTime = useMemo(() => gratuityLogs.reduce((sum, log) => sum + log.amount, 0), [gratuityLogs]);
    const totalDistributedAllTime = useMemo(() => gratuityDistributions.reduce((sum, dist) => sum + dist.amount, 0), [gratuityDistributions]);
    const currentFundBalance = totalCollectedAllTime - totalDistributedAllTime;

    // 2. Filtered Data for Reporting
    const filteredLogs = useMemo(() => {
        const start = filters.fromDate ? new Date(filters.fromDate) : new Date(0);
        const end = filters.toDate ? new Date(filters.toDate) : new Date();
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);

        return gratuityLogs.filter(log => {
            const date = new Date(log.date);
            if (date < start || date > end) return false;
            if (filters.cashierId !== 'all' && log.cashierId !== filters.cashierId) return false;
            if (filters.warehouseId !== 'all' && log.warehouseId !== filters.warehouseId) return false;
            return true;
        }).map(log => {
            // Find the original sale to get the percentage
            const allSales = [...posSales, ...salesInvoices];
            const sale = allSales.find(s => s.invoiceNumber === log.invoiceNumber);
            const saleTotal = sale ? (sale.total - log.amount) : 0; // Net sale without tip
            const tipPercent = saleTotal > 0 ? (log.amount / saleTotal) * 100 : 0;
            
            return {
                ...log,
                saleTotal,
                tipPercent
            };
        }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [gratuityLogs, filters, posSales, salesInvoices]);

    const filteredDists = useMemo(() => {
        const start = filters.fromDate ? new Date(filters.fromDate) : new Date(0);
        const end = filters.toDate ? new Date(filters.toDate) : new Date();
        return gratuityDistributions.filter(dist => {
            const date = new Date(dist.date);
            return date >= start && date <= end;
        }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [gratuityDistributions, filters]);

    // 3. KPI Calculations for Filtered Period
    const reportStats = useMemo(() => {
        const totalTips = filteredLogs.reduce((sum, log) => sum + log.amount, 0);
        const totalSales = filteredLogs.reduce((sum, log) => sum + log.saleTotal, 0);
        const avgTipPercent = totalSales > 0 ? (totalTips / totalSales) * 100 : 0;
        
        // Group by Cashier
        const byCashier: Record<string, { name: string, tips: number, sales: number, count: number }> = {};
        filteredLogs.forEach(log => {
            if (!byCashier[log.cashierId]) {
                byCashier[log.cashierId] = { name: log.cashierName, tips: 0, sales: 0, count: 0 };
            }
            byCashier[log.cashierId].tips += log.amount;
            byCashier[log.cashierId].sales += log.saleTotal;
            byCashier[log.cashierId].count += 1;
        });

        // Group by Day
        const byDay: Record<string, { date: string, tips: number, sales: number }> = {};
        filteredLogs.forEach(log => {
            const dayKey = new Date(log.date).toLocaleDateString('ar-EG');
            if (!byDay[dayKey]) {
                byDay[dayKey] = { date: dayKey, tips: 0, sales: 0 };
            }
            byDay[dayKey].tips += log.amount;
            byDay[dayKey].sales += log.saleTotal;
        });

        return {
            totalTips,
            totalSales,
            avgTipPercent,
            byCashier: Object.values(byCashier).sort((a,b) => b.tips - a.tips),
            byDay: Object.values(byDay).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        };
    }, [filteredLogs]);

    const handleDistribute = async () => {
        if (distAmount <= 0 || !distFromAccountId) {
            toast({ variant: 'destructive', title: 'بيانات ناقصة', description: 'يرجى إدخال مبلغ صحيح واختيار حساب الدفع.' });
            return;
        }

        if (distAmount > currentFundBalance) {
            if (!confirm(`المبلغ المدخل (${distAmount}) أكبر من الرصيد الحالي للصندوق (${currentFundBalance}). هل تريد المتابعة؟`)) return;
        }

        setIsSaving(true);
        try {
            const receiptNumber = `ص-ت-${await getNextId('gratuityDistribution')}`;
            const date = new Date().toISOString();

            await dbAction('gratuityDistributions', 'add', {
                date,
                amount: Number(distAmount),
                paidFromAccountId: distFromAccountId,
                notes: distNotes,
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            });

            await dbAction('expenses', 'add', {
                date,
                amount: Number(distAmount),
                expenseType: 'توزيع إكراميات',
                description: `توزيع إكراميات للموظفين - سند رقم ${receiptNumber}`,
                paidFromAccountId: distFromAccountId,
                receiptNumber,
            });

            toast({ title: 'تم التوزيع بنجاح', description: `سند رقم: ${receiptNumber}` });
            setDistAmount(0);
            setDistNotes('');
        } catch (error) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ عملية التوزيع.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportExcel = () => {
        const data = filteredLogs.map(log => ({
            'التاريخ والوقت': new Date(log.date).toLocaleString('ar-EG'),
            'رقم الفاتورة': log.invoiceNumber,
            'الكاشير': log.cashierName,
            'الفرع': warehouses.find(w => w.id === log.warehouseId)?.name || '---',
            'قيمة الفاتورة': log.saleTotal,
            'قيمة الإكرامية': log.amount,
            'النسبة المئوية': `${log.tipPercent.toFixed(2)}%`
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Tips Report");
        XLSX.writeFile(wb, `Gratuity_Report_${filters.fromDate}_to_${filters.toDate}.xlsx`);
    };

    const cashierOptions = useMemo(() => [
        { value: 'all', label: 'كل الكاشيرات' },
        ...users.filter(u => u.isCashier).map(u => ({ value: u.id, label: u.name }))
    ], [users]);

    const warehouseOptions = useMemo(() => [
        { value: 'all', label: 'كل الفروع' },
        ...warehouses.map(w => ({ value: w.id, label: w.name }))
    ], [warehouses]);

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-8 w-8" /></div>;

    return (
        <>
            <PageHeader title="إدارة وتقارير صندوق الإكراميات (Tips)" />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                
                {/* Summary Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider">إجمالي الإكراميات (الفترة)</CardTitle>
                            <Coins className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-black">{reportStats.totalTips.toLocaleString()} ج.م</div>
                            <p className="text-[10px] text-muted-foreground mt-1">بناءً على الفلاتر المختارة</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider">متوسط النسبة للفترة</CardTitle>
                            <Percent className="h-4 w-4 text-blue-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-black text-blue-700 dark:text-blue-400">{reportStats.avgTipPercent.toFixed(2)}%</div>
                            <p className="text-[10px] text-blue-600/70 mt-1">نسبة التيبس من إجمالي المبيعات</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-green-50 dark:bg-green-950/20 border-green-200">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider">توزيعات سابقة</CardTitle>
                            <HandCoins className="h-4 w-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-black text-green-700 dark:text-green-400">{totalDistributedAllTime.toLocaleString()} ج.m</div>
                            <p className="text-[10px] text-green-600/70 mt-1">تراكمي منذ بدء النظام</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-black text-amber-800 dark:text-amber-400 uppercase tracking-widest">الرصيد المتاح حالياً</CardTitle>
                            <ArrowDownCircle className="h-4 w-4 text-amber-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-amber-700 dark:text-amber-400">{currentFundBalance.toLocaleString()} ج.م</div>
                            <p className="text-[10px] text-amber-600/70 mt-1">مبالغ بالخزينة بانتظار التوزيع</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters Row */}
                <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Filter className="h-4 w-4"/> فلاتر التقرير</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                        <div className="space-y-2">
                            <Label>الكاشير</Label>
                            <Combobox options={cashierOptions} value={filters.cashierId} onValueChange={v => setFilters({...filters, cashierId: v})} />
                        </div>
                        <div className="space-y-2">
                            <Label>الفرع</Label>
                            <Combobox options={warehouseOptions} value={filters.warehouseId} onValueChange={v => setFilters({...filters, warehouseId: v})} />
                        </div>
                        <div className="space-y-2">
                            <Label>من تاريخ</Label>
                            <Input type="date" value={filters.fromDate} onChange={e => setFilters({...filters, fromDate: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label>إلى تاريخ</Label>
                            <Input type="date" value={filters.toDate} onChange={e => setFilters({...filters, toDate: e.target.value})} />
                        </div>
                        <Button variant="outline" onClick={handleExportExcel} className="gap-2">
                            <Download className="h-4 w-4" /> تصدير إكسل
                        </Button>
                    </CardContent>
                </Card>

                <div className="grid gap-6 lg:grid-cols-5">
                    {/* Left Side: Distribution & Stats */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="shadow-sm">
                            <CardHeader>
                                <CardTitle>توزيع إكراميات</CardTitle>
                                <CardDescription>تسجيل عملية صرف المبالغ من الخزينة للعاملين.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label>المبلغ المراد توزيعه</Label>
                                    <Input type="number" value={distAmount} onChange={e => setDistAmount(Number(e.target.value))} className="text-lg font-bold" />
                                </div>
                                <div className="space-y-2">
                                    <Label>يصرف من خزينة</Label>
                                    <Select value={distFromAccountId} onValueChange={setDistFromAccountId}>
                                        <SelectTrigger><SelectValue placeholder="اختر الخزينة..." /></SelectTrigger>
                                        <SelectContent>
                                            {cashAccounts.filter(acc => !acc.userId).map(acc => (
                                                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>ملاحظات التوزيع</Label>
                                    <Input value={distNotes} onChange={e => setDistNotes(e.target.value)} placeholder="مثال: توزيع أسبوعي" />
                                </div>
                                <Button className="w-full h-12" onClick={handleDistribute} disabled={isSaving || distAmount <= 0}>
                                    {isSaving ? <Loader2 className="animate-spin ml-2" /> : <CheckCircle className="ml-2" />}
                                    تأكيد التوزيع والصرف
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Analytic Summary Table */}
                        <Card>
                            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4"/> ملخص حسب الكاشير</CardTitle></CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="text-[10px] uppercase">
                                            <TableHead>الكاشير</TableHead>
                                            <TableHead className="text-center">فواتير</TableHead>
                                            <TableHead className="text-center">إجمالي التيبس</TableHead>
                                            <TableHead className="text-center">النسبة</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportStats.byCashier.map(stat => (
                                            <TableRow key={stat.name} className="text-xs">
                                                <TableCell className="font-bold">{stat.name}</TableCell>
                                                <TableCell className="text-center">{stat.count}</TableCell>
                                                <TableCell className="text-center font-bold text-primary">{stat.tips.toLocaleString()}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className="text-[10px]">{((stat.tips / (stat.sales || 1)) * 100).toFixed(1)}%</Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Side: Detailed Logs */}
                    <Card className="lg:col-span-3">
                        <Tabs defaultValue="inflow">
                            <CardHeader className="pb-0">
                                <div className="flex justify-between items-center">
                                    <CardTitle>سجل حركات الصندوق</CardTitle>
                                    <TabsList>
                                        <TabsTrigger value="inflow">المحصل (تفصيلي)</TabsTrigger>
                                        <TabsTrigger value="daily">المحصل (يومي)</TabsTrigger>
                                        <TabsTrigger value="outflow">الموزع (الصرف)</TabsTrigger>
                                    </TabsList>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <TabsContent value="inflow" className="m-0">
                                    <div className="w-full overflow-auto border rounded-md max-h-[600px]">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-muted/50">
                                                    <TableHead>التاريخ</TableHead>
                                                    <TableHead>الفاتورة / الكاشير</TableHead>
                                                    <TableHead className="text-center">قيمة الفاتورة</TableHead>
                                                    <TableHead className="text-center">التيبس</TableHead>
                                                    <TableHead className="text-center">النسبة %</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredLogs.length > 0 ? filteredLogs.map(log => (
                                                    <TableRow key={log.id} className="hover:bg-muted/30">
                                                        <TableCell className="text-[10px] leading-tight">
                                                            {new Date(log.date).toLocaleDateString('ar-EG')}<br/>
                                                            <span className="text-muted-foreground">{new Date(log.date).toLocaleTimeString('ar-EG', {hour: '2-digit', minute: '2-digit'})}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-mono text-xs font-bold text-primary">{log.invoiceNumber}</div>
                                                            <div className="text-[10px] text-muted-foreground">{log.cashierName}</div>
                                                        </TableCell>
                                                        <TableCell className="text-center text-xs font-medium">{log.saleTotal.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center font-black text-green-600">{log.amount.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant="secondary" className="text-[9px] px-1 font-mono">{log.tipPercent.toFixed(1)}%</Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                )) : <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground">لا توجد حركات مطابقة.</TableCell></TableRow>}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </TabsContent>

                                <TabsContent value="daily" className="m-0">
                                     <div className="w-full overflow-auto border rounded-md max-h-[600px]">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-muted/50">
                                                    <TableHead>التاريخ</TableHead>
                                                    <TableHead className="text-center">إجمالي المبيعات</TableHead>
                                                    <TableHead className="text-center">إجمالي التيبس</TableHead>
                                                    <TableHead className="text-center">النسبة اليومية</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {reportStats.byDay.map(day => (
                                                    <TableRow key={day.date}>
                                                        <TableCell className="font-bold">{day.date}</TableCell>
                                                        <TableCell className="text-center">{day.sales.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center font-bold text-primary">{day.tips.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge className="bg-blue-600">{((day.tips / (day.sales || 1)) * 100).toFixed(1)}%</Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                     </div>
                                </TabsContent>

                                <TabsContent value="outflow" className="m-0">
                                     <div className="w-full overflow-auto border rounded-md max-h-[600px]">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-muted/50">
                                                    <TableHead>سند الصرف</TableHead>
                                                    <TableHead>التاريخ والبيان</TableHead>
                                                    <TableHead className="text-center">المبلغ</TableHead>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredDists.length > 0 ? filteredDists.map(dist => (
                                                    <TableRow key={dist.id}>
                                                        <TableCell className="font-mono text-xs font-bold">{dist.receiptNumber}</TableCell>
                                                        <TableCell>
                                                            <div className="text-xs">{new Date(dist.date).toLocaleDateString('ar-EG')}</div>
                                                            <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{dist.notes}</div>
                                                        </TableCell>
                                                        <TableCell className="text-center font-black text-destructive">-{dist.amount.toLocaleString()}</TableCell>
                                                        <TableCell>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={async () => {
                                                                if(confirm('حذف السند؟')) await dbAction('gratuityDistributions', 'remove', {id: dist.id});
                                                            }}>
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                )) : <TableRow><TableCell colSpan={4} className="text-center py-20 text-muted-foreground">لم يتم توزيع أي مبالغ في هذه الفترة.</TableCell></TableRow>}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </TabsContent>
                            </CardContent>
                            <CardFooter className="bg-muted/20 border-t p-4 flex justify-between">
                                <div className="text-sm font-bold">إجمالي المحصل في هذه النتائج:</div>
                                <div className="text-xl font-black text-primary">{reportStats.totalTips.toLocaleString()} ج.م</div>
                            </CardFooter>
                        </Tabs>
                    </Card>
                </div>
            </main>
        </>
    );
}
