"use client";

import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/contexts/data-provider";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { 
    BookCheck, 
    Send, 
    RefreshCw, 
    CheckCircle2, 
    AlertCircle, 
    FileText, 
    FileSpreadsheet, 
    Layers, 
    Loader2, 
    Receipt, 
    ShoppingCart, 
    CreditCard, 
    ArrowRightLeft,
    Check
} from "lucide-react";
import * as XLSX from 'xlsx';

export default function SubledgerPostingPage() {
    const { 
        salesInvoices, 
        purchaseInvoices, 
        expenses, 
        exceptionalIncomes, 
        cashAccounts, 
        warehouses, 
        customers, 
        suppliers, 
        settings 
    } = useData();
    const { user } = useAuth();
    const { toast } = useToast();

    const [postedEntries, setPostedEntries] = useState<any[]>([]);
    const [loadingPosted, setLoadingPosted] = useState(true);
    const [isPosting, setIsPosting] = useState<string | null>(null);
    const [batchPosting, setBatchPosting] = useState(false);

    const fetchPostedEntries = async () => {
        setLoadingPosted(true);
        try {
            const res = await fetch('/api/accounting/posting');
            if (res.ok) {
                const data = await res.json();
                setPostedEntries(data.entries || []);
            }
        } catch (e) {
            console.error("Failed to load posted entries", e);
        } finally {
            setLoadingPosted(false);
        }
    };

    useEffect(() => {
        fetchPostedEntries();
    }, []);

    const postedSourceIds = useMemo(() => {
        return new Set(postedEntries.map((e: any) => e.SourceId).filter(Boolean));
    }, [postedEntries]);

    // Unposted Sales Invoices
    const unpostedSales = useMemo(() => {
        return (salesInvoices || []).filter((inv: any) => !postedSourceIds.has(inv.id));
    }, [salesInvoices, postedSourceIds]);

    // Unposted Purchases
    const unpostedPurchases = useMemo(() => {
        return (purchaseInvoices || []).filter((inv: any) => !postedSourceIds.has(inv.id));
    }, [purchaseInvoices, postedSourceIds]);

    // Unposted Expenses
    const unpostedExpenses = useMemo(() => {
        return (expenses || []).filter((exp: any) => !postedSourceIds.has(exp.id));
    }, [expenses, postedSourceIds]);

    const formatCurrency = (amt: number) => {
        return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amt);
    };

    // Post a sales invoice to General Ledger
    const handlePostSale = async (inv: any) => {
        setIsPosting(inv.id);
        const subtotal = inv.subtotal || (inv.total - (inv.tax || 0));
        const tax = inv.tax || 0;
        const total = inv.total || (subtotal + tax);
        const paidAmount = inv.paidAmount || 0;
        const remainingDue = total - paidAmount;

        const cashAcc = cashAccounts.find((c: any) => c.id === inv.paidToAccountId)?.name || 'النقدية / البنك';

        const lines: any[] = [];
        if (paidAmount > 0) {
            lines.push({ account: cashAcc, debit: paidAmount, credit: 0, description: `تحصيل نقدي - فاتورة ${inv.invoiceNumber}` });
        }
        if (remainingDue > 0.01) {
            lines.push({ account: `حسابات العملاء (${inv.customerName || 'عام'})`, debit: remainingDue, credit: 0, description: `متبقي آجل - فاتورة ${inv.invoiceNumber}` });
        }
        if (tax > 0) {
            lines.push({ account: 'ضريبة القيمة المضافة المستحقة (المخرجات)', debit: 0, credit: tax, description: `ضريبة 14% فاتورة ${inv.invoiceNumber}` });
        }
        lines.push({ account: 'إيرادات المبيعات', debit: 0, credit: subtotal, description: `إيراد مبيعات فاتورة ${inv.invoiceNumber}` });

        try {
            const res = await fetch('/api/accounting/posting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceType: 'sale',
                    sourceId: inv.id,
                    sourceNumber: inv.invoiceNumber,
                    warehouseId: inv.warehouseId,
                    date: inv.date,
                    description: `قيد ترحيل مبيعات الفاتورة رقم ${inv.invoiceNumber} للعميل ${inv.customerName || 'نقدي'}`,
                    lines,
                    userId: user?.id,
                    userName: user?.name
                })
            });
            const data = await res.json();
            if (data.success) {
                toast({ title: 'تم الترحيل بنجاح', description: data.message });
                fetchPostedEntries();
            } else {
                toast({ variant: 'destructive', title: 'فشل الترحيل', description: data.message });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'خطأ', description: e.message });
        } finally {
            setIsPosting(null);
        }
    };

    // Post a purchase invoice to General Ledger
    const handlePostPurchase = async (inv: any) => {
        setIsPosting(inv.id);
        const subtotal = inv.subtotal || (inv.total - (inv.tax || 0));
        const tax = inv.tax || 0;
        const total = inv.total || (subtotal + tax);
        const paidAmount = inv.paidAmount || 0;
        const remainingDue = total - paidAmount;

        const cashAcc = cashAccounts.find((c: any) => c.id === inv.paidFromAccountId)?.name || 'النقدية / البنك';

        const lines: any[] = [];
        lines.push({ account: 'مخزون البضائع والمشتريات', debit: subtotal, credit: 0, description: `إضافة مخزون فاتورة شراء ${inv.invoiceNumber}` });
        if (tax > 0) {
            lines.push({ account: 'ضريبة القيمة المضافة المخصومة (المدخلات)', debit: tax, credit: 0, description: `ضريبة مشتريات فاتورة ${inv.invoiceNumber}` });
        }
        if (paidAmount > 0) {
            lines.push({ account: cashAcc, debit: 0, credit: paidAmount, description: `سداد نقدي من ${cashAcc} لفاتورة ${inv.invoiceNumber}` });
        }
        if (remainingDue > 0.01) {
            lines.push({ account: `حسابات الموردين (${inv.supplierName || 'عام'})`, debit: 0, credit: remainingDue, description: `مستحق للمورد فاتورة شراء ${inv.invoiceNumber}` });
        }

        try {
            const res = await fetch('/api/accounting/posting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceType: 'purchase',
                    sourceId: inv.id,
                    sourceNumber: inv.invoiceNumber,
                    warehouseId: inv.warehouseId,
                    date: inv.date,
                    description: `قيد ترحيل مشتريات الفاتورة رقم ${inv.invoiceNumber} من المورد ${inv.supplierName || 'عام'}`,
                    lines,
                    userId: user?.id,
                    userName: user?.name
                })
            });
            const data = await res.json();
            if (data.success) {
                toast({ title: 'تم الترحيل بنجاح', description: data.message });
                fetchPostedEntries();
            } else {
                toast({ variant: 'destructive', title: 'فشل الترحيل', description: data.message });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'خطأ', description: e.message });
        } finally {
            setIsPosting(null);
        }
    };

    // Batch post all pending sales
    const handleBatchPostSales = async () => {
        if (unpostedSales.length === 0) return;
        setBatchPosting(true);
        let successCount = 0;
        for (const s of unpostedSales.slice(0, 20)) {
            await handlePostSale(s);
            successCount++;
        }
        setBatchPosting(false);
        toast({ title: 'اكتمل الترحيل المجمع', description: `تم ترحيل ${successCount} قيد بنجاح إلى دفتر الأستاذ العام.` });
    };

    return (
        <>
            <PageHeader title="الترحيل الآلي للقيود إلى دفتر الأستاذ العام (Posting Controller)">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchPostedEntries} disabled={loadingPosted} className="gap-1.5">
                        <RefreshCw className={`h-4 w-4 ${loadingPosted ? 'animate-spin' : ''}`} />
                        تحديث الأرصدة
                    </Button>
                    <Button size="sm" onClick={handleBatchPostSales} disabled={batchPosting || unpostedSales.length === 0} className="gap-1.5 bg-primary text-primary-foreground">
                        {batchPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookCheck className="h-4 w-4" />}
                        ترحيل مجمع للمبيعات المعلقة ({unpostedSales.length})
                    </Button>
                </div>
            </PageHeader>

            <main className="flex-1 p-4 md:p-6 space-y-6">
                
                {/* Status KPI Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">فواتير مبيعات بانتظار الترحيل</CardTitle>
                            <ShoppingCart className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold text-amber-600">{unpostedSales.length}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                القيمة: {formatCurrency(unpostedSales.reduce((sum, s) => sum + (s.total || 0), 0))}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">فواتير مشتريات بانتظار الترحيل</CardTitle>
                            <Receipt className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold text-blue-600">{unpostedPurchases.length}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                القيمة: {formatCurrency(unpostedPurchases.reduce((sum, p) => sum + (p.total || 0), 0))}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">مصروفات معلقة</CardTitle>
                            <CreditCard className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold text-purple-600">{unpostedExpenses.length}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                القيمة: {formatCurrency(unpostedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0))}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">القيود المرحّلة في الأستاذ العام</CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">{postedEntries.length}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                قيود مثبتة ومعتمدة في الدليل المحاسبي
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs */}
                <Tabs defaultValue="sales" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="sales" className="gap-2">
                            فواتير المبيعات ({unpostedSales.length})
                        </TabsTrigger>
                        <TabsTrigger value="purchases" className="gap-2">
                            فواتير المشتريات ({unpostedPurchases.length})
                        </TabsTrigger>
                        <TabsTrigger value="expenses" className="gap-2">
                            المصروفات ({unpostedExpenses.length})
                        </TabsTrigger>
                        <TabsTrigger value="posted_ledger" className="gap-2">
                            سجل القيود المرحّلة ({postedEntries.length})
                        </TabsTrigger>
                    </TabsList>

                    {/* Sales Subledger */}
                    <TabsContent value="sales" className="pt-4 space-y-4">
                        <Card>
                            <CardHeader className="py-3 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>فواتير المبيعات غير المرحّلة</CardTitle>
                                    <CardDescription>الضغط على ترحيل يقوم بإنشاء وتثبيت القيد المزدوج المتوازن تلقائياً في دفتر الأستاذ العام.</CardDescription>
                                </div>
                                <Button size="sm" onClick={handleBatchPostSales} disabled={batchPosting || unpostedSales.length === 0} className="gap-1.5">
                                    <BookCheck className="h-4 w-4" />
                                    ترحيل الكل
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">رقم الفاتورة</TableHead>
                                            <TableHead className="text-right">العميل</TableHead>
                                            <TableHead className="text-center">المبلغ قبل الضريبة</TableHead>
                                            <TableHead className="text-center">الضريبة</TableHead>
                                            <TableHead className="text-center">الإجمالي شامل</TableHead>
                                            <TableHead className="text-center w-28">إجراء الترحيل</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {unpostedSales.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                                    كافة فواتير المبيعات مرحّلة بالكامل لدفتر الأستاذ العام.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            unpostedSales.map((inv: any) => {
                                                const subtotal = inv.subtotal || (inv.total - (inv.tax || 0));
                                                return (
                                                    <TableRow key={inv.id}>
                                                        <TableCell className="text-right font-mono text-xs">{new Date(inv.date).toLocaleDateString('ar-EG')}</TableCell>
                                                        <TableCell className="text-right font-mono font-bold">{inv.invoiceNumber}</TableCell>
                                                        <TableCell className="text-right">{inv.customerName || 'عميل نقدي'}</TableCell>
                                                        <TableCell className="text-center font-mono">{formatCurrency(subtotal)}</TableCell>
                                                        <TableCell className="text-center font-mono text-muted-foreground">{formatCurrency(inv.tax || 0)}</TableCell>
                                                        <TableCell className="text-center font-mono font-bold">{formatCurrency(inv.total)}</TableCell>
                                                        <TableCell className="text-center">
                                                            <Button 
                                                                size="sm" 
                                                                className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" 
                                                                onClick={() => handlePostSale(inv)}
                                                                disabled={isPosting === inv.id}
                                                            >
                                                                {isPosting === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                                                ترحيل القيد
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Purchases Subledger */}
                    <TabsContent value="purchases" className="pt-4 space-y-4">
                        <Card>
                            <CardHeader className="py-3">
                                <CardTitle>فواتير المشتريات غير المرحّلة</CardTitle>
                                <CardDescription>ترحيل تكلفة البضاعة لحساب المخزون وحساب المورد والضريبة القابلة للخصم.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">رقم الفاتورة</TableHead>
                                            <TableHead className="text-right">المورد</TableHead>
                                            <TableHead className="text-center">المبلغ الصافي</TableHead>
                                            <TableHead className="text-center">الضريبة</TableHead>
                                            <TableHead className="text-center">الإجمالي شامل</TableHead>
                                            <TableHead className="text-center w-28">إجراء الترحيل</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {unpostedPurchases.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                                    كافة فواتير المشتريات مرحّلة بالكامل لدفتر الأستاذ العام.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            unpostedPurchases.map((inv: any) => {
                                                const subtotal = inv.subtotal || (inv.total - (inv.tax || 0));
                                                return (
                                                    <TableRow key={inv.id}>
                                                        <TableCell className="text-right font-mono text-xs">{new Date(inv.date).toLocaleDateString('ar-EG')}</TableCell>
                                                        <TableCell className="text-right font-mono font-bold">{inv.invoiceNumber}</TableCell>
                                                        <TableCell className="text-right">{inv.supplierName || 'مورد عام'}</TableCell>
                                                        <TableCell className="text-center font-mono">{formatCurrency(subtotal)}</TableCell>
                                                        <TableCell className="text-center font-mono text-muted-foreground">{formatCurrency(inv.tax || 0)}</TableCell>
                                                        <TableCell className="text-center font-mono font-bold">{formatCurrency(inv.total)}</TableCell>
                                                        <TableCell className="text-center">
                                                            <Button 
                                                                size="sm" 
                                                                className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" 
                                                                onClick={() => handlePostPurchase(inv)}
                                                                disabled={isPosting === inv.id}
                                                            >
                                                                {isPosting === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                                                ترحيل القيد
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Expenses Subledger */}
                    <TabsContent value="expenses" className="pt-4 space-y-4">
                        <Card>
                            <CardHeader className="py-3">
                                <CardTitle>المصروفات والمدفوعات المعلقة</CardTitle>
                                <CardDescription>ترحيل المصروفات التشغيلية والعمومية لدفتر الأستاذ العام.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">البيان</TableHead>
                                            <TableHead className="text-right">بند المصروف</TableHead>
                                            <TableHead className="text-center">المبلغ</TableHead>
                                            <TableHead className="text-center">الضريبة</TableHead>
                                            <TableHead className="text-center w-28">إجراء الترحيل</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {unpostedExpenses.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                                    كافة المصروفات مرحّلة بالكامل.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            unpostedExpenses.map((exp: any) => (
                                                <TableRow key={exp.id}>
                                                    <TableCell className="text-right font-mono text-xs">{new Date(exp.date).toLocaleDateString('ar-EG')}</TableCell>
                                                    <TableCell className="text-right">{exp.description || 'مصروف عام'}</TableCell>
                                                    <TableCell className="text-right font-medium">{exp.expenseType || 'تشغيل'}</TableCell>
                                                    <TableCell className="text-center font-mono font-bold">{formatCurrency(exp.amount)}</TableCell>
                                                    <TableCell className="text-center font-mono text-muted-foreground">{formatCurrency(exp.taxAmount || 0)}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="outline" className="text-xs">جاهز للترحيل</Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Posted General Ledger */}
                    <TabsContent value="posted_ledger" className="pt-4 space-y-4">
                        <Card>
                            <CardHeader className="py-3 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>سجل القيود المركزية اليومية المرحّلة (General Ledger)</CardTitle>
                                    <CardDescription>القيود المزدوجة المتوازنة المثبتة بشكل دائم ومقفل في الدليل المحاسبي.</CardDescription>
                                </div>
                                <Badge className="bg-emerald-600 font-mono text-xs">{postedEntries.length} قيد مرحّل</Badge>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="text-right w-36">رقم القيد</TableHead>
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">المستند المصدر</TableHead>
                                            <TableHead className="text-right">البيان والشرح</TableHead>
                                            <TableHead className="text-center">إجمالي المدين</TableHead>
                                            <TableHead className="text-center">إجمالي الدائن</TableHead>
                                            <TableHead className="text-center">الحالة</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {postedEntries.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                                    لا توجد قيود مرحّلة في جدول دفتر الأستاذ العام حالياً.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            postedEntries.map((entry: any) => (
                                                <TableRow key={entry.Id}>
                                                    <TableCell className="text-right font-mono font-bold text-primary">{entry.EntryNumber}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs">{new Date(entry.Date).toLocaleDateString('ar-EG')}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs font-semibold">{entry.SourceNumber || entry.SourceType}</TableCell>
                                                    <TableCell className="text-right text-xs">{entry.Description}</TableCell>
                                                    <TableCell className="text-center font-mono font-bold">{formatCurrency(Number(entry.TotalDebit))}</TableCell>
                                                    <TableCell className="text-center font-mono font-bold">{formatCurrency(Number(entry.TotalCredit))}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge className="bg-emerald-600 text-white gap-1 text-[11px]">
                                                            <Check className="h-3 w-3" />
                                                            مرحّل
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </>
    );
}

