
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Loader2, MoreHorizontal, Trash2, Info, User, DollarSign, TrendingUp, Wallet, PieChart, Calendar } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuItem as DropdownMenuItemShadcn } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from '@/contexts/data-provider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

interface ProfitDistribution {
    id?: string;
    date: string;
    amount: number;
    partnerId: string;
    paidFromAccountId: string;
    notes?: string;
    receiptNumber?: string;
    createdById?: string;
    createdByName?: string;
}

interface Partner {
    id: string;
    name: string;
    profitShare: number;
    warehouseId: string;
    startDate: string;
    endDate: string;
    capital: number;
}

export default function ProfitDistributionPage() {
    const { 
        profitDistributions: distributions, 
        partners, 
        cashAccounts, 
        salesInvoices, 
        posSales, 
        expenses, 
        exceptionalIncomes, 
        items,
        dbAction, 
        getNextId, 
        loading 
    } = useData();

    const { toast } = useToast();
    const { user } = useAuth();
    
    // Form State
    const [formData, setFormData] = useState({ 
        date: new Date().toISOString().split('T')[0], 
        amount: 0, 
        partnerId: "", 
        paidFromAccountId: "", 
        notes: "" 
    });

    // 1. Calculate Daily Net Profit per Warehouse and Partner Shares
    const { dailyNetProfits, partnerStats, systemTotals } = useMemo(() => {
        const profits: Record<string, number> = {}; // date -> totalNet
        const warehouseDaily: Record<string, Record<string, number>> = {}; // warehouseId -> date -> net
        
        // Helper to get item cost (supporting manufactured items)
        const getItemCost = (saleItem: any) => {
            const master = items.find((i: any) => i.id === saleItem.id);
            if (!master) return 0;
            if (master.itemType === 'manufactured' && master.components) {
                return master.components.reduce((sum: number, comp: any) => {
                    const compMaster = items.find((i: any) => i.id === comp.itemId);
                    return sum + (comp.quantity * (compMaster?.cost || 0));
                }, 0);
            }
            return saleItem.cost || master.cost || 0;
        };

        // Process Sales (Invoices + POS)
        const allSales = [...salesInvoices.filter((s:any) => s.status === 'approved'), ...posSales];
        allSales.forEach(sale => {
            const date = new Date(sale.date).toISOString().split('T')[0];
            const whId = sale.warehouseId || 'general';
            if (!warehouseDaily[whId]) warehouseDaily[whId] = {};
            if (!warehouseDaily[whId][date]) warehouseDaily[whId][date] = 0;

            const revenue = sale.total;
            const cogs = sale.items?.reduce((sum: number, i: any) => sum + (i.qty * getItemCost(i)), 0) || 0;
            const profit = revenue - cogs;
            
            warehouseDaily[whId][date] += profit;
            profits[date] = (profits[date] || 0) + profit;
        });

        // Process Expenses
        expenses.forEach(exp => {
            const date = new Date(exp.date).toISOString().split('T')[0];
            const whId = exp.warehouseId || 'general';
            if (!warehouseDaily[whId]) warehouseDaily[whId] = {};
            if (!warehouseDaily[whId][date]) warehouseDaily[whId][date] = 0;
            
            warehouseDaily[whId][date] -= exp.amount;
            profits[date] = (profits[date] || 0) - exp.amount;
        });

        // Process Income
        exceptionalIncomes.forEach(inc => {
            const date = new Date(inc.date).toISOString().split('T')[0];
            const whId = inc.warehouseId || 'general';
            if (!warehouseDaily[whId]) warehouseDaily[whId] = {};
            if (!warehouseDaily[whId][date]) warehouseDaily[whId][date] = 0;
            
            warehouseDaily[whId][date] += inc.amount;
            profits[date] = (profits[date] || 0) + inc.amount;
        });

        // Calculate Accrued Shares for each partner
        const accrued: Record<string, number> = {};
        partners.forEach((p: Partner) => {
            accrued[p.id] = 0;
            const whData = warehouseDaily[p.warehouseId] || {};
            const pStart = new Date(p.startDate);
            const pEnd = new Date(p.endDate);
            pStart.setHours(0,0,0,0);
            pEnd.setHours(23,59,59,999);

            Object.entries(whData).forEach(([dateStr, profit]) => {
                const currentDate = new Date(dateStr);
                if (currentDate >= pStart && currentDate <= pEnd) {
                    accrued[p.id] += profit * (p.profitShare / 100);
                }
            });
        });

        // Calculate Paid amounts
        const paid: Record<string, number> = {};
        distributions.forEach(d => {
            paid[d.partnerId] = (paid[d.partnerId] || 0) + d.amount;
        });

        const stats = partners.map((p: Partner) => ({
            ...p,
            totalAccrued: accrued[p.id] || 0,
            totalPaid: paid[p.id] || 0,
            balance: (accrued[p.id] || 0) - (paid[p.id] || 0)
        }));

        const totalSystemNet = Object.values(profits).reduce((sum, p) => sum + p, 0);
        const totalDistributed = distributions.reduce((sum, d) => sum + d.amount, 0);

        return { 
            dailyNetProfits: profits, 
            partnerStats: stats,
            systemTotals: {
                net: totalSystemNet,
                distributed: totalDistributed,
                remaining: totalSystemNet - totalDistributed
            }
        };
    }, [salesInvoices, posSales, expenses, exceptionalIncomes, items, partners, distributions]);

    const selectedPartnerInfo = useMemo(() => {
        return partnerStats.find(s => s.id === formData.partnerId);
    }, [formData.partnerId, partnerStats]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.partnerId || !formData.paidFromAccountId || formData.amount <= 0) return;

        if (selectedPartnerInfo && formData.amount > selectedPartnerInfo.balance) {
            if (!confirm(`المبلغ المدخل (${formData.amount}) يتجاوز الرصيد المستحق للشريك (${selectedPartnerInfo.balance.toFixed(2)}). هل تريد المتابعة؟`)) {
                return;
            }
        }

        try {
            const receiptNumber = `ت-أ-${await getNextId('profitDistribution')}`;
            const now = new Date();
            const selectedDate = new Date(formData.date);
            const finalDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());

            await dbAction('profitDistributions', 'add', {
                ...formData,
                amount: Number(formData.amount),
                date: finalDate.toISOString(),
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            });
            
            toast({ title: "تم التوزيع بنجاح", description: `رقم الإيصال: ${receiptNumber}` });
            setFormData({ date: new Date().toISOString().split('T')[0], amount: 0, partnerId: "", paidFromAccountId: "", notes: "" });
        } catch (error) {
            toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ التوزيع" });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await dbAction('profitDistributions', 'remove', { id });
            toast({ title: "تم الحذف بنجاح" });
        } catch (error) {
            toast({ variant: "destructive", title: "خطأ" });
        }
    };

    if (loading) return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <>
            <PageHeader title="توزيعات أرباح الشركاء" />
            <main className="flex flex-1 flex-col gap-6 p-4 md:gap-8 md:p-6">
                
                {/* Summary Cards */}
                <div className="grid gap-4 md:grid-cols-3">
                    <Card className="border-primary/20 bg-primary/5">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">صافي أرباح النظام (التراكمي)</CardTitle>
                            <TrendingUp className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{systemTotals.net.toLocaleString()} ج.م</div>
                            <p className="text-xs text-muted-foreground mt-1">بعد خصم كافة المصروفات المباشرة والعامة</p>
                        </CardContent>
                    </Card>
                    <Card className="border-green-200 bg-green-50 dark:bg-green-900/10">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">إجمالي التوزيعات السابقة</CardTitle>
                            <Wallet className="h-4 w-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{systemTotals.distributed.toLocaleString()} ج.م</div>
                            <p className="text-xs text-green-600/70 mt-1">المبالغ التي استلمها الشركاء فعلياً</p>
                        </CardContent>
                    </Card>
                    <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">الأرباح المحتجزة (المتبقية)</CardTitle>
                            <PieChart className="h-4 w-4 text-amber-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{systemTotals.remaining.toLocaleString()} ج.م</div>
                            <p className="text-xs text-amber-600/70 mt-1">أرباح جاهزة للتوزيع أو إعادة الاستثمار</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-5">
                    {/* Distribution Form */}
                    <Card className="lg:col-span-2 shadow-md">
                        <CardHeader>
                            <CardTitle>تسجيل عملية صرف أرباح</CardTitle>
                            <CardDescription>صرف مبالغ نقدية للشريك من نصيبه في الأرباح.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSave} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>الشريك</Label>
                                    <Select value={formData.partnerId} onValueChange={v => setFormData({...formData, partnerId: v})}>
                                        <SelectTrigger><SelectValue placeholder="اختر شريكًا" /></SelectTrigger>
                                        <SelectContent>
                                            {partners.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {selectedPartnerInfo && (
                                    <div className="p-4 rounded-lg bg-muted/50 border space-y-2 animate-in fade-in slide-in-from-top-1">
                                        <div className="flex justify-between text-sm">
                                            <span>إجمالي النصيب المستحق (التراكمي):</span>
                                            <span className="font-bold text-primary">{selectedPartnerInfo.totalAccrued.toLocaleString()} ج.م</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span>إجمالي ما تم صرفه سابقاً:</span>
                                            <span className="font-bold text-destructive">{selectedPartnerInfo.totalPaid.toLocaleString()} ج.م</span>
                                        </div>
                                        <Separator />
                                        <div className="flex justify-between font-bold text-lg">
                                            <span>الرصيد المتاح حالياً:</span>
                                            <span className="text-green-600">{selectedPartnerInfo.balance.toLocaleString()} ج.م</span>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label>المبلغ المراد صرفه</Label>
                                    <Input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} placeholder="0.00" />
                                </div>

                                <div className="space-y-2">
                                    <Label>يصرف من حساب</Label>
                                    <Select value={formData.paidFromAccountId} onValueChange={v => setFormData({...formData, paidFromAccountId: v})}>
                                        <SelectTrigger><SelectValue placeholder="اختر حساب الدفع" /></SelectTrigger>
                                        <SelectContent>
                                            {cashAccounts.filter((acc:any) => !acc.userId).map((acc: any) => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>ملاحظات</Label>
                                    <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="سبب الصرف أو ملاحظات إضافية..." />
                                </div>

                                <Button type="submit" className="w-full" disabled={!formData.partnerId || formData.amount <= 0}>
                                    <PlusCircle className="ml-2 h-4 w-4" /> تأكيد وحفظ التوزيع
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Accruals and History Logs */}
                    <div className="lg:col-span-3 space-y-6">
                        <Tabs defaultValue="log">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="log">سجل الصرف (المدفوعات)</TabsTrigger>
                                <TabsTrigger value="daily">تفاصيل الربح اليومي</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="log">
                                <Card>
                                    <CardHeader><CardTitle>سجل عمليات الصرف للشركاء</CardTitle></CardHeader>
                                    <CardContent>
                                        <div className="w-full overflow-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>الشريك</TableHead>
                                                        <TableHead>التاريخ</TableHead>
                                                        <TableHead className="text-center">المبلغ</TableHead>
                                                        <TableHead className="text-center">الإجراءات</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {distributions.length > 0 ? distributions.map((dist: any) => (
                                                        <TableRow key={dist.id}>
                                                            <TableCell>
                                                                <div className="font-medium flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{partners.find((p:any) => p.id === dist.partnerId)?.name || 'غير معروف'}</div>
                                                                <div className="text-[10px] text-muted-foreground">بواسطة: {dist.createdByName}</div>
                                                            </TableCell>
                                                            <TableCell className="text-xs">{new Date(dist.date).toLocaleDateString('ar-EG')}</TableCell>
                                                            <TableCell className="text-center font-bold text-destructive">{dist.amount.toLocaleString()}</TableCell>
                                                            <TableCell className="text-center">
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader><AlertDialogTitle>حذف العملية؟</AlertDialogTitle><AlertDialogDescription>سيتم إعادة المبلغ إلى رصيد الشريك المستحق.</AlertDialogDescription></AlertDialogHeader>
                                                                        <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(dist.id!)}>تأكيد الحذف</AlertDialogAction></AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            </TableCell>
                                                        </TableRow>
                                                    )) : <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">لا توجد عمليات صرف مسجلة.</TableCell></TableRow>}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="daily">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>سجل الربح اليومي التراكمي للنظام</CardTitle>
                                        <CardDescription>صافي الأرباح المحققة يومياً بعد خصم المصروفات.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="w-full overflow-auto max-h-[400px]">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>التاريخ</TableHead>
                                                        <TableHead className="text-center">صافي الربح</TableHead>
                                                        <TableHead className="text-center">الحالة</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {Object.entries(dailyNetProfits).sort((a,b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()).map(([date, profit]) => (
                                                        <TableRow key={date}>
                                                            <TableCell className="font-mono text-xs">{new Date(date).toLocaleDateString('ar-EG')}</TableCell>
                                                            <TableCell className={`text-center font-bold ${profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                                                {profit.toLocaleString()} ج.م
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Badge variant={profit >= 0 ? 'default' : 'destructive'} className="text-[10px]">
                                                                    {profit >= 0 ? 'ربح محقق' : 'خسارة يومية'}
                                                                </Badge>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </main>
        </>
    );
}
