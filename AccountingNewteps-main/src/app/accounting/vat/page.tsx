"use client";

import React, { useState, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useData } from "@/contexts/data-provider";
import { 
    FileText, 
    Printer, 
    Calculator, 
    ArrowDownRight, 
    ArrowUpLeft, 
    Download, 
    CheckCircle2, 
    Building2, 
    AlertCircle,
    HelpCircle,
    ShieldCheck,
    Layers,
    FileSpreadsheet
} from "lucide-react";
import * as XLSX from 'xlsx';

export default function VatReportPage() {
    const { salesInvoices, posSales, purchaseInvoices, expenses, settings, warehouses } = useData();
    
    const financialSettings = settings?.main?.financial || {};
    const generalSettings = settings?.main?.general || {};
    const eInvoiceSettings = settings?.main?.eInvoice?.default || {};

    const companyName = generalSettings.companyName || "شركة المحاسبة المتطورة";
    const taxRegNumber = eInvoiceSettings.taxRegNumber || financialSettings.taxRegNumber || "300-123-456";
    const vatRate = financialSettings.vatRate || 14;

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    const [fromDate, setFromDate] = useState(firstDayOfMonth);
    const [toDate, setToDate] = useState(lastDayOfMonth);
    const [taxOffice, setTaxOffice] = useState("مأمورية ضرائب الشركات المساهمة / كبار الممولين");
    const [previousCreditBalance, setPreviousCreditBalance] = useState<number>(0);

    // Quick period selector
    const setPeriod = (period: 'this_month' | 'last_month' | 'q1' | 'q2' | 'q3' | 'q4' | 'year') => {
        const year = today.getFullYear();
        if (period === 'this_month') {
            setFromDate(firstDayOfMonth);
            setToDate(lastDayOfMonth);
        } else if (period === 'last_month') {
            const first = new Date(year, today.getMonth() - 1, 1).toISOString().split('T')[0];
            const last = new Date(year, today.getMonth(), 0).toISOString().split('T')[0];
            setFromDate(first);
            setToDate(last);
        } else if (period === 'q1') {
            setFromDate(`${year}-01-01`);
            setToDate(`${year}-03-31`);
        } else if (period === 'q2') {
            setFromDate(`${year}-04-01`);
            setToDate(`${year}-06-30`);
        } else if (period === 'q3') {
            setFromDate(`${year}-07-01`);
            setToDate(`${year}-09-30`);
        } else if (period === 'q4') {
            setFromDate(`${year}-10-01`);
            setToDate(`${year}-12-31`);
        } else if (period === 'year') {
            setFromDate(`${year}-01-01`);
            setToDate(`${year}-12-31`);
        }
    };

    const reportData = useMemo(() => {
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);

        // 1. Output VAT (Sales Invoices B2B)
        const filteredSales = (salesInvoices || []).filter((inv: any) => {
            const d = new Date(inv.date);
            return d >= start && d <= end && (inv.status === 'approved' || inv.status === 'completed' || !inv.status);
        });

        // Split standard sales from returns
        let salesTaxableAmount = 0;
        let salesVatAmount = 0;
        let salesReturnTaxable = 0;
        let salesReturnVat = 0;

        filteredSales.forEach((inv: any) => {
            const isReturn = inv.type === 'return' || (inv.total || 0) < 0;
            const subtotal = Math.abs(inv.subtotal || (inv.total - (inv.tax || 0)));
            const tax = Math.abs(inv.tax || 0);

            if (isReturn) {
                salesReturnTaxable += subtotal;
                salesReturnVat += tax;
            } else {
                salesTaxableAmount += subtotal;
                salesVatAmount += tax;
            }
        });

        // 2. POS B2C Sales
        const processedSaleIds = new Set(filteredSales.map((s: any) => s.id));
        const filteredPos = (posSales || []).filter((sale: any) => {
            if (sale.id && processedSaleIds.has(sale.id)) return false;
            const d = new Date(sale.date);
            return d >= start && d <= end;
        });

        let posTaxableAmount = 0;
        let posVatAmount = 0;

        filteredPos.forEach((sale: any) => {
            if (sale.applyTax === false) return;
            const rate = sale.taxRate !== undefined ? sale.taxRate * 100 : vatRate;
            let currentTax = 0;
            if (sale.taxAmount !== undefined) {
                currentTax = sale.taxAmount;
            } else if (sale.tax !== undefined) {
                currentTax = sale.tax;
            } else {
                currentTax = sale.total - (sale.total / (1 + rate / 100));
            }
            const taxable = sale.total - currentTax;
            posTaxableAmount += taxable;
            posVatAmount += currentTax;
        });

        const netSalesTaxable = salesTaxableAmount + posTaxableAmount - salesReturnTaxable;
        const totalOutputTax = salesVatAmount + posVatAmount - salesReturnVat;

        // 3. Input VAT (Purchases & Expenses)
        const filteredPurchases = (purchaseInvoices || []).filter((inv: any) => {
            const d = new Date(inv.date);
            return d >= start && d <= end;
        });

        let purchasesTaxableGoods = 0;
        let purchasesTaxGoods = 0;
        let purchasesTaxableAssets = 0; // Fixed Capital Assets (5% or refundable)
        let purchasesTaxAssets = 0;
        let purchasesReturnTaxable = 0;
        let purchasesReturnTax = 0;

        filteredPurchases.forEach((inv: any) => {
            const isReturn = inv.type === 'return' || (inv.total || 0) < 0;
            const subtotal = Math.abs(inv.subtotal || (inv.total - (inv.tax || 0)));
            const tax = Math.abs(inv.tax || 0);
            const isAsset = inv.category === 'asset' || inv.isCapitalAsset;

            if (isReturn) {
                purchasesReturnTaxable += subtotal;
                purchasesReturnTax += tax;
            } else if (isAsset) {
                purchasesTaxableAssets += subtotal;
                purchasesTaxAssets += tax;
            } else {
                purchasesTaxableGoods += subtotal;
                purchasesTaxGoods += tax;
            }
        });

        // Deductible Expenses (Taxable Services and Operations)
        const filteredExpenses = (expenses || []).filter((exp: any) => {
            const d = new Date(exp.date);
            return d >= start && d <= end && (exp.taxAmount || 0) > 0;
        });

        let expensesTaxable = 0;
        let expensesTax = 0;

        filteredExpenses.forEach((exp: any) => {
            const tax = exp.taxAmount || 0;
            const base = (exp.amount || 0) - tax;
            expensesTaxable += base;
            expensesTax += tax;
        });

        const netPurchasesTaxable = purchasesTaxableGoods + purchasesTaxableAssets + expensesTaxable - purchasesReturnTaxable;
        const totalInputTax = purchasesTaxGoods + purchasesTaxAssets + expensesTax - purchasesReturnTax;

        // 4. Net VAT Settlement
        const grossLiability = totalOutputTax - totalInputTax;
        const netPayableOrCredit = grossLiability - (previousCreditBalance || 0);

        return {
            sales: filteredSales,
            pos: filteredPos,
            purchases: filteredPurchases,
            expenses: filteredExpenses,
            // Output Breakdown
            salesTaxableAmount,
            salesVatAmount,
            posTaxableAmount,
            posVatAmount,
            salesReturnTaxable,
            salesReturnVat,
            netSalesTaxable,
            totalOutputTax,
            // Input Breakdown
            purchasesTaxableGoods,
            purchasesTaxGoods,
            purchasesTaxableAssets,
            purchasesTaxAssets,
            expensesTaxable,
            expensesTax,
            purchasesReturnTaxable,
            purchasesReturnTax,
            netPurchasesTaxable,
            totalInputTax,
            // Settlement
            grossLiability,
            previousCreditBalance,
            netPayableOrCredit,
            isPayable: netPayableOrCredit > 0
        };
    }, [fromDate, toDate, salesInvoices, posSales, purchaseInvoices, expenses, vatRate, previousCreditBalance]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(amount);
    };

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Summary Sheet (نموذج 10)
        const summaryRows = [
            ["إقرار ضريبة القيمة المضافة - نموذج 10 المعتمد"],
            [`اسم المنشأة: ${companyName}`, `رقم التسجيل الضريبي: ${taxRegNumber}`],
            [`الفترة الضريبية: من ${fromDate} إلى ${toDate}`, `المأمورية: ${taxOffice}`],
            [],
            ["القسم", "البيان", "الوعاء الضريبي (صافي القيمة)", "نسبة الضريبة", "قيمة الضريبة"],
            ["المخرجات", "مبيعات سلع وخدمات محلية عامة (B2B)", reportData.salesTaxableAmount, `${vatRate}%`, reportData.salesVatAmount],
            ["المخرجات", "مبيعات نقاط البيع للمستهلك النهائي (B2C)", reportData.posTaxableAmount, `${vatRate}%`, reportData.posVatAmount],
            ["المخرجات (خصم)", "إشعارات دائنة (مردودات مبيعات)", reportData.salesReturnTaxable, `${vatRate}%`, reportData.salesReturnVat],
            ["المخرجات", "صافي وعاء المخرجات وإجمالي الضريبة", reportData.netSalesTaxable, "", reportData.totalOutputTax],
            [],
            ["المدخلات", "مشتريات سلع وبضائع محلية", reportData.purchasesTaxableGoods, `${vatRate}%`, reportData.purchasesTaxGoods],
            ["المدخلات", "مشتريات آلات ومعدات وأصول رأسمالية", reportData.purchasesTaxableAssets, "5% / عامة", reportData.purchasesTaxAssets],
            ["المدخلات", "مصروفات تشغيلية وخدمية مؤيدة", reportData.expensesTaxable, `${vatRate}%`, reportData.expensesTax],
            ["المدخلات (خصم)", "إشعارات مدينة (مردودات مشتريات)", reportData.purchasesReturnTaxable, `${vatRate}%`, reportData.purchasesReturnTax],
            ["المدخلات", "صافي وعاء المدخلات وإجمالي الضريبة القابلة للخصم", reportData.netPurchasesTaxable, "", reportData.totalInputTax],
            [],
            ["التصفية", "إجمالي ضريبة المخرجات المستحقة", "", "", reportData.totalOutputTax],
            ["التصفية", "يخصم: إجمالي ضريبة المدخلات القابلة للخصم", "", "", reportData.totalInputTax],
            ["التصفية", "يخصم: رصيد دائن سابق مُرحل", "", "", previousCreditBalance],
            ["التصفية", reportData.isPayable ? "صافي الضريبة واجبة السداد" : "صافي الرصيد الدائن المرحل للفترة التالية", "", "", Math.abs(reportData.netPayableOrCredit)]
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
        XLSX.utils.book_append_sheet(wb, wsSummary, "نموذج 10 الإقرار المعتمد");

        // 2. Sales Details
        const salesRows = [
            ["التاريخ", "رقم الفاتورة", "اسم العميل", "رقم التسجيل الضريبي", "المبلغ بدون ضريبة", "الضريبة", "الإجمالي شامل"]
        ];
        reportData.sales.forEach((s: any) => {
            salesRows.push([
                s.date ? new Date(s.date).toLocaleDateString('ar-EG') : '',
                s.invoiceNumber || s.id,
                s.customerName || 'عميل نقدي',
                s.customerTaxReg || s.taxNumber || 'غير مسجل',
                (s.total - (s.tax || 0)),
                (s.tax || 0),
                s.total
            ]);
        });
        const wsSales = XLSX.utils.aoa_to_sheet(salesRows);
        XLSX.utils.book_append_sheet(wb, wsSales, "سجل فواتير المبيعات B2B");

        // 3. Purchases Details
        const purchasesRows = [
            ["التاريخ", "رقم الفاتورة", "اسم المورد", "رقم التسجيل الضريبي للمورد", "المبلغ بدون ضريبة", "الضريبة المخصومة", "الإجمالي شامل"]
        ];
        reportData.purchases.forEach((p: any) => {
            purchasesRows.push([
                p.date ? new Date(p.date).toLocaleDateString('ar-EG') : '',
                p.invoiceNumber || p.id,
                p.supplierName || 'مورد عام',
                p.supplierTaxReg || p.taxNumber || 'غير متوفر',
                (p.total - (p.tax || 0)),
                (p.tax || 0),
                p.total
            ]);
        });
        const wsPurchases = XLSX.utils.aoa_to_sheet(purchasesRows);
        XLSX.utils.book_append_sheet(wb, wsPurchases, "سجل المشتريات والمدخلات");

        XLSX.writeFile(wb, `VAT_Declaration_Form10_${fromDate}_${toDate}.xlsx`);
    };

    return (
        <>
            <PageHeader title="إقرار ضريبة القيمة المضافة (نموذج 10 المعتمد)">
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={exportToExcel} className="gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        تصدير الإقرار إكسيل
                    </Button>
                    <Button onClick={() => window.print()} className="gap-2 bg-primary text-primary-foreground">
                        <Printer className="h-4 w-4" />
                        طباعة نموذج 10
                    </Button>
                </div>
            </PageHeader>

            <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 printable-area">
                
                {/* Official Tax Authority Header for Print & Official View */}
                <div className="rounded-xl border bg-card p-6 shadow-sm border-primary/20">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b pb-4">
                        <div className="space-y-1 text-right">
                            <div className="flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-primary" />
                                <h2 className="text-xl font-bold tracking-tight">{companyName}</h2>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                رقم التسجيل الضريبي: <span className="font-semibold text-foreground font-mono">{taxRegNumber}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                                المأمورية المختصة: <span className="font-medium text-foreground">{taxOffice}</span>
                            </p>
                        </div>
                        <div className="text-center md:text-left space-y-1">
                            <Badge variant="outline" className="text-sm px-3 py-1 border-primary/40 text-primary">
                                <ShieldCheck className="h-4 w-4 ml-1.5" />
                                إقرار رسمي مطابق لنموذج 10 ضرائب
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                                الفترة: من <span className="font-bold text-foreground font-mono">{fromDate}</span> إلى <span className="font-bold text-foreground font-mono">{toDate}</span>
                            </p>
                        </div>
                    </div>

                    {/* Filter Controls (Hidden in Print) */}
                    <div className="no-print pt-4 flex flex-col lg:flex-row gap-4 items-end justify-between">
                        <div className="flex flex-wrap gap-2 items-center">
                            <span className="text-xs font-semibold text-muted-foreground ml-2">اختيار سريع للفترة:</span>
                            <Button size="sm" variant="secondary" onClick={() => setPeriod('this_month')}>الشهر الحالي</Button>
                            <Button size="sm" variant="outline" onClick={() => setPeriod('last_month')}>الشهر السابق</Button>
                            <Button size="sm" variant="outline" onClick={() => setPeriod('q1')}>الربع الأول (Q1)</Button>
                            <Button size="sm" variant="outline" onClick={() => setPeriod('q2')}>الربع الثاني (Q2)</Button>
                            <Button size="sm" variant="outline" onClick={() => setPeriod('q3')}>الربع الثالث (Q3)</Button>
                            <Button size="sm" variant="outline" onClick={() => setPeriod('q4')}>الربع الرابع (Q4)</Button>
                        </div>

                        <div className="flex flex-wrap gap-3 items-end">
                            <div className="space-y-1">
                                <Label htmlFor="from" className="text-xs">من تاريخ</Label>
                                <Input type="date" id="from" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-36" />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="to" className="text-xs">إلى تاريخ</Label>
                                <Input type="date" id="to" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-36" />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="credit" className="text-xs">رصيد دائن سابق مرحل</Label>
                                <Input 
                                    type="number" 
                                    id="credit" 
                                    value={previousCreditBalance} 
                                    onChange={(e) => setPreviousCreditBalance(Number(e.target.value) || 0)} 
                                    className="h-9 w-36" 
                                    placeholder="0.00" 
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI Metrics */}
                <div className="grid gap-4 md:grid-cols-3">
                    {/* Output Tax */}
                    <Card className="border-red-200/60 dark:border-red-950/40 relative overflow-hidden">
                        <div className="absolute top-0 right-0 h-1.5 w-full bg-red-500" />
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold text-muted-foreground">
                                ضريبة المخرجات (المستحقة على المبيعات)
                            </CardTitle>
                            <ArrowUpLeft className="h-5 w-5 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-extrabold text-red-600 dark:text-red-400">
                                {formatCurrency(reportData.totalOutputTax)}
                            </div>
                            <div className="mt-3 text-xs space-y-1 text-muted-foreground border-t pt-2">
                                <div className="flex justify-between">
                                    <span>فواتير الشركات (B2B):</span>
                                    <span className="font-mono font-medium">{formatCurrency(reportData.salesVatAmount)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>مبيعات نقاط البيع (B2C):</span>
                                    <span className="font-mono font-medium">{formatCurrency(reportData.posVatAmount)}</span>
                                </div>
                                {reportData.salesReturnVat > 0 && (
                                    <div className="flex justify-between text-amber-600">
                                        <span>يخصم: مردودات مبيعات:</span>
                                        <span className="font-mono font-medium">- {formatCurrency(reportData.salesReturnVat)}</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Input Tax */}
                    <Card className="border-emerald-200/60 dark:border-emerald-950/40 relative overflow-hidden">
                        <div className="absolute top-0 right-0 h-1.5 w-full bg-emerald-500" />
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold text-muted-foreground">
                                ضريبة المدخلات (القابلة للخصم)
                            </CardTitle>
                            <ArrowDownRight className="h-5 w-5 text-emerald-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(reportData.totalInputTax)}
                            </div>
                            <div className="mt-3 text-xs space-y-1 text-muted-foreground border-t pt-2">
                                <div className="flex justify-between">
                                    <span>مشتريات بضائع محلية:</span>
                                    <span className="font-mono font-medium">{formatCurrency(reportData.purchasesTaxGoods)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>مصروفات وخدمات مؤيدة:</span>
                                    <span className="font-mono font-medium">{formatCurrency(reportData.expensesTax)}</span>
                                </div>
                                {reportData.purchasesTaxAssets > 0 && (
                                    <div className="flex justify-between">
                                        <span>أصول ومعدات رأسمالية:</span>
                                        <span className="font-mono font-medium">{formatCurrency(reportData.purchasesTaxAssets)}</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Net Tax Liability */}
                    <Card className={`relative overflow-hidden ${
                        reportData.isPayable 
                            ? "border-red-300 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800" 
                            : "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800"
                    }`}>
                        <div className={`absolute top-0 right-0 h-1.5 w-full ${reportData.isPayable ? 'bg-red-600' : 'bg-emerald-600'}`} />
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">
                                {reportData.isPayable ? "صافي الضريبة واجبة السداد لمصلحة الضرائب" : "صافي الرصيد الدائن المرحل للفترة التالية"}
                            </CardTitle>
                            <Calculator className="h-5 w-5" />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-3xl font-extrabold ${reportData.isPayable ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                                {formatCurrency(Math.abs(reportData.netPayableOrCredit))}
                            </div>
                            <div className="mt-3 text-xs space-y-1 text-muted-foreground border-t pt-2">
                                <div className="flex justify-between">
                                    <span>المخرجات - المدخلات:</span>
                                    <span className="font-mono font-medium">{formatCurrency(reportData.grossLiability)}</span>
                                </div>
                                {previousCreditBalance > 0 && (
                                    <div className="flex justify-between text-blue-600">
                                        <span>يخصم: رصيد دائن سابق:</span>
                                        <span className="font-mono font-medium">- {formatCurrency(previousCreditBalance)}</span>
                                    </div>
                                )}
                                <div className="font-semibold text-foreground pt-1 flex justify-between">
                                    <span>المركز الضريبي النهائي:</span>
                                    <span>{reportData.isPayable ? "واجب السداد فوراً" : "رصيد دائن مسترد/مرحل"}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs Section */}
                <Tabs defaultValue="official_form" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 no-print">
                        <TabsTrigger value="official_form" className="gap-2">
                            <FileText className="h-4 w-4" />
                            الإقرار الرسمي (نموذج 10)
                        </TabsTrigger>
                        <TabsTrigger value="sales" className="gap-2">
                            سجل المبيعات والخدمات ({reportData.sales.length + reportData.pos.length})
                        </TabsTrigger>
                        <TabsTrigger value="purchases" className="gap-2">
                            سجل المشتريات والمدخلات ({reportData.purchases.length})
                        </TabsTrigger>
                        <TabsTrigger value="expenses" className="gap-2">
                            المصروفات الضريبية ({reportData.expenses.length})
                        </TabsTrigger>
                    </TabsList>
                    
                    {/* 1. Official Form 10 */}
                    <TabsContent value="official_form" className="space-y-6 pt-4">
                        {/* Table 1: Output VAT */}
                        <Card>
                            <CardHeader className="bg-muted/40 py-3">
                                <CardTitle className="text-base font-bold flex items-center justify-between">
                                    <span>أولاً: بيان ضريبة المخرجات (المبيعات والخدمات المؤداة)</span>
                                    <Badge variant="secondary">الجدول رقم (1)</Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/20">
                                            <TableHead className="text-right w-12">م</TableHead>
                                            <TableHead className="text-right">نوع المعاملة والبيان</TableHead>
                                            <TableHead className="text-center font-bold">الوعاء الضريبي (القيمة بدون ضريبة)</TableHead>
                                            <TableHead className="text-center w-24">فئة الضريبة</TableHead>
                                            <TableHead className="text-center font-bold">قيمة ضريبة المبيعات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell className="text-right font-medium">1</TableCell>
                                            <TableCell className="text-right">سلع وخدمات محلية عامة (فواتير الشركات B2B)</TableCell>
                                            <TableCell className="text-center font-mono font-medium">{formatCurrency(reportData.salesTaxableAmount)}</TableCell>
                                            <TableCell className="text-center"><Badge variant="outline">{vatRate}%</Badge></TableCell>
                                            <TableCell className="text-center font-mono font-bold text-red-600">{formatCurrency(reportData.salesVatAmount)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="text-right font-medium">2</TableCell>
                                            <TableCell className="text-right">مبيعات التجزئة ونقاط البيع للمستهلك النهائي (B2C)</TableCell>
                                            <TableCell className="text-center font-mono font-medium">{formatCurrency(reportData.posTaxableAmount)}</TableCell>
                                            <TableCell className="text-center"><Badge variant="outline">{vatRate}%</Badge></TableCell>
                                            <TableCell className="text-center font-mono font-bold text-red-600">{formatCurrency(reportData.posVatAmount)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="text-right font-medium">3</TableCell>
                                            <TableCell className="text-right">صادرات وسلع خاضعة لسعر صفر أو معفاة بموجب القانون</TableCell>
                                            <TableCell className="text-center font-mono font-medium">{formatCurrency(0)}</TableCell>
                                            <TableCell className="text-center"><Badge variant="outline">0% / معفى</Badge></TableCell>
                                            <TableCell className="text-center font-mono">{formatCurrency(0)}</TableCell>
                                        </TableRow>
                                        <TableRow className="text-amber-700 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/20">
                                            <TableCell className="text-right font-medium">4</TableCell>
                                            <TableCell className="text-right">يخصم: إشعارات دائنة معتمدة (مردودات مبيعات)</TableCell>
                                            <TableCell className="text-center font-mono font-medium">({formatCurrency(reportData.salesReturnTaxable)})</TableCell>
                                            <TableCell className="text-center"><Badge variant="outline">{vatRate}%</Badge></TableCell>
                                            <TableCell className="text-center font-mono font-bold">({formatCurrency(reportData.salesReturnVat)})</TableCell>
                                        </TableRow>
                                        <TableRow className="bg-muted/60 font-bold border-t-2">
                                            <TableCell colSpan={2} className="text-right text-foreground">
                                                إجمالي وعاء المخرجات وإجمالي الضريبة المستحقة (أ)
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-base">{formatCurrency(reportData.netSalesTaxable)}</TableCell>
                                            <TableCell className="text-center">-</TableCell>
                                            <TableCell className="text-center font-mono text-base text-red-600">{formatCurrency(reportData.totalOutputTax)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        {/* Table 2: Input VAT */}
                        <Card>
                            <CardHeader className="bg-muted/40 py-3">
                                <CardTitle className="text-base font-bold flex items-center justify-between">
                                    <span>ثانياً: بيان ضريبة المدخلات (المشتريات والتكاليف القابلة للخصم)</span>
                                    <Badge variant="secondary">الجدول رقم (2)</Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/20">
                                            <TableHead className="text-right w-12">م</TableHead>
                                            <TableHead className="text-right">نوع المشتريات والمدخلات</TableHead>
                                            <TableHead className="text-center font-bold">الوعاء الضريبي (القيمة بدون ضريبة)</TableHead>
                                            <TableHead className="text-center w-24">فئة الضريبة</TableHead>
                                            <TableHead className="text-center font-bold">الضريبة القابلة للخصم</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell className="text-right font-medium">1</TableCell>
                                            <TableCell className="text-right">مشتريات بضائع وسلع محلية بغرض البيع أو التصنيع</TableCell>
                                            <TableCell className="text-center font-mono font-medium">{formatCurrency(reportData.purchasesTaxableGoods)}</TableCell>
                                            <TableCell className="text-center"><Badge variant="outline">{vatRate}%</Badge></TableCell>
                                            <TableCell className="text-center font-mono font-bold text-emerald-600">{formatCurrency(reportData.purchasesTaxGoods)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="text-right font-medium">2</TableCell>
                                            <TableCell className="text-right">آلات ومعدات وأصول رأسمالية مستخدمة في النشاط</TableCell>
                                            <TableCell className="text-center font-mono font-medium">{formatCurrency(reportData.purchasesTaxableAssets)}</TableCell>
                                            <TableCell className="text-center"><Badge variant="outline">5% / عامة</Badge></TableCell>
                                            <TableCell className="text-center font-mono font-bold text-emerald-600">{formatCurrency(reportData.purchasesTaxAssets)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="text-right font-medium">3</TableCell>
                                            <TableCell className="text-right">مصروفات عمومية وخدمات تشغيلية مؤيدة بفواتير ضريبية إلكترونية</TableCell>
                                            <TableCell className="text-center font-mono font-medium">{formatCurrency(reportData.expensesTaxable)}</TableCell>
                                            <TableCell className="text-center"><Badge variant="outline">{vatRate}%</Badge></TableCell>
                                            <TableCell className="text-center font-mono font-bold text-emerald-600">{formatCurrency(reportData.expensesTax)}</TableCell>
                                        </TableRow>
                                        <TableRow className="text-amber-700 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/20">
                                            <TableCell className="text-right font-medium">4</TableCell>
                                            <TableCell className="text-right">يخصم: إشعارات مدينة (مردودات مشتريات للموردين)</TableCell>
                                            <TableCell className="text-center font-mono font-medium">({formatCurrency(reportData.purchasesReturnTaxable)})</TableCell>
                                            <TableCell className="text-center"><Badge variant="outline">{vatRate}%</Badge></TableCell>
                                            <TableCell className="text-center font-mono font-bold">({formatCurrency(reportData.purchasesReturnTax)})</TableCell>
                                        </TableRow>
                                        <TableRow className="bg-muted/60 font-bold border-t-2">
                                            <TableCell colSpan={2} className="text-right text-foreground">
                                                إجمالي وعاء المدخلات وإجمالي الضريبة المخصومة (ب)
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-base">{formatCurrency(reportData.netPurchasesTaxable)}</TableCell>
                                            <TableCell className="text-center">-</TableCell>
                                            <TableCell className="text-center font-mono text-base text-emerald-600">{formatCurrency(reportData.totalInputTax)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        {/* Table 3: Settlement (تصفية الضريبة) */}
                        <Card className="border-2 border-primary/30">
                            <CardHeader className="bg-primary/5 py-3">
                                <CardTitle className="text-base font-bold flex items-center justify-between">
                                    <span>ثالثاً: تصفية الضريبة وتحديد الالتزام النهائي</span>
                                    <Badge variant="default">جدول التسوية والحساب الختامي</Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell className="text-right font-medium w-2/3">إجمالي ضريبة المخرجات المستحقة عن الفترة (أ)</TableCell>
                                            <TableCell className="text-center font-mono font-bold text-red-600">{formatCurrency(reportData.totalOutputTax)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="text-right font-medium">يخصم: إجمالي ضريبة المدخلات القابلة للخصم (ب)</TableCell>
                                            <TableCell className="text-center font-mono font-bold text-emerald-600">({formatCurrency(reportData.totalInputTax)})</TableCell>
                                        </TableRow>
                                        <TableRow className="bg-muted/30">
                                            <TableCell className="text-right font-semibold">فارق الضريبة عن معاملات الفترة الحالية</TableCell>
                                            <TableCell className="text-center font-mono font-bold">{formatCurrency(reportData.grossLiability)}</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell className="text-right font-medium">يخصم: رصيد دائن سابق مُرحل من الإقرار السابق</TableCell>
                                            <TableCell className="text-center font-mono font-bold text-blue-600">({formatCurrency(previousCreditBalance)})</TableCell>
                                        </TableRow>
                                        <TableRow className={`text-lg font-extrabold ${reportData.isPayable ? 'bg-red-100/80 dark:bg-red-950/60 text-red-700 dark:text-red-300' : 'bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'}`}>
                                            <TableCell className="text-right">
                                                {reportData.isPayable ? "الصافي النهائي: ضريبة واجبة السداد لمصلحة الضرائب" : "الصافي النهائي: رصيد دائن يرحل للفترة التالية أو يُسترد"}
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-xl">
                                                {formatCurrency(Math.abs(reportData.netPayableOrCredit))}
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        {/* Legal Signatures block for printing */}
                        <div className="grid grid-cols-2 gap-8 border rounded-xl p-6 bg-card mt-6">
                            <div className="space-y-6 text-center">
                                <p className="font-semibold text-sm">المسؤول عن إعداد الإقرار (المدير المالي / صاحب الشأن)</p>
                                <div className="border-b border-dashed w-3/4 mx-auto pt-8"></div>
                                <p className="text-xs text-muted-foreground">التوقيع والصفة: .......................................</p>
                            </div>
                            <div className="space-y-6 text-center">
                                <p className="font-semibold text-sm">اعتماد المحاسب القانوني (سجل المحاسبين والمراجعين)</p>
                                <div className="border-b border-dashed w-3/4 mx-auto pt-8"></div>
                                <p className="text-xs text-muted-foreground">رقم القيد بالسجل: .......................................</p>
                            </div>
                        </div>
                    </TabsContent>

                    {/* 2. Sales Register */}
                    <TabsContent value="sales" className="space-y-4 pt-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <div>
                                    <CardTitle>سجل فواتير المبيعات والخدمات (B2B)</CardTitle>
                                    <CardDescription>الفواتير الضريبية المسجلة خلال الفترة وتأثيرها على ضريبة القيمة المضافة</CardDescription>
                                </div>
                                <Badge variant="outline" className="font-mono">{reportData.sales.length} فاتورة</Badge>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">رقم الفاتورة</TableHead>
                                            <TableHead className="text-right">اسم العميل</TableHead>
                                            <TableHead className="text-right">رقم التسجيل الضريبي</TableHead>
                                            <TableHead className="text-center">المبلغ قبل الضريبة</TableHead>
                                            <TableHead className="text-center">نسبة الضريبة</TableHead>
                                            <TableHead className="text-center">قيمة الضريبة</TableHead>
                                            <TableHead className="text-center">الإجمالي شامل</TableHead>
                                            <TableHead className="text-center">حالة الفاتورة الإلكترونية</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.sales.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">لا توجد فواتير مبيعات مسجلة في هذه الفترة</TableCell>
                                            </TableRow>
                                        ) : (
                                            reportData.sales.map((inv: any) => {
                                                const subtotal = inv.subtotal || (inv.total - (inv.tax || 0));
                                                return (
                                                    <TableRow key={inv.id}>
                                                        <TableCell className="text-right font-mono text-xs">{new Date(inv.date).toLocaleDateString('ar-EG')}</TableCell>
                                                        <TableCell className="text-right font-mono font-semibold">{inv.invoiceNumber || inv.id}</TableCell>
                                                        <TableCell className="text-right">{inv.customerName || 'عميل نقدي'}</TableCell>
                                                        <TableCell className="text-right font-mono text-xs">{inv.customerTaxReg || inv.taxNumber || 'غير مسجل'}</TableCell>
                                                        <TableCell className="text-center font-mono">{formatCurrency(subtotal)}</TableCell>
                                                        <TableCell className="text-center"><Badge variant="outline">{vatRate}%</Badge></TableCell>
                                                        <TableCell className="text-center font-mono font-bold text-red-600">{formatCurrency(inv.tax || 0)}</TableCell>
                                                        <TableCell className="text-center font-mono font-bold">{formatCurrency(inv.total)}</TableCell>
                                                        <TableCell className="text-center">
                                                            {inv.etaUuid || inv.uuid ? (
                                                                <Badge className="bg-emerald-600 text-white gap-1 text-[10px]">
                                                                    <CheckCircle2 className="h-3 w-3" />
                                                                    مرسلة ETA
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="secondary" className="text-[10px]">مسجلة محلياً</Badge>
                                                            )}
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

                    {/* 3. Purchases Register */}
                    <TabsContent value="purchases" className="space-y-4 pt-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <div>
                                    <CardTitle>سجل فواتير المشتريات والمدخلات</CardTitle>
                                    <CardDescription>فواتير الموردين والضريبة القابلة للخصم بموجب الفواتير الضريبية</CardDescription>
                                </div>
                                <Badge variant="outline" className="font-mono">{reportData.purchases.length} فاتورة</Badge>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">رقم الفاتورة</TableHead>
                                            <TableHead className="text-right">اسم المورد</TableHead>
                                            <TableHead className="text-right">رقم التسجيل الضريبي للمورد</TableHead>
                                            <TableHead className="text-center">نوع المدخل</TableHead>
                                            <TableHead className="text-center">المبلغ الصافي</TableHead>
                                            <TableHead className="text-center">الضريبة المخصومة</TableHead>
                                            <TableHead className="text-center">الإجمالي شامل</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.purchases.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد فواتير مشتريات مسجلة في هذه الفترة</TableCell>
                                            </TableRow>
                                        ) : (
                                            reportData.purchases.map((inv: any) => {
                                                const subtotal = inv.subtotal || (inv.total - (inv.tax || 0));
                                                return (
                                                    <TableRow key={inv.id}>
                                                        <TableCell className="text-right font-mono text-xs">{new Date(inv.date).toLocaleDateString('ar-EG')}</TableCell>
                                                        <TableCell className="text-right font-mono font-semibold">{inv.invoiceNumber || inv.id}</TableCell>
                                                        <TableCell className="text-right">{inv.supplierName || 'مورد عام'}</TableCell>
                                                        <TableCell className="text-right font-mono text-xs">{inv.supplierTaxReg || inv.taxNumber || 'غير متوفر'}</TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant="outline" className="text-xs">
                                                                {inv.category === 'asset' ? 'أصل رأسمالي' : 'بضائع ومواد'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono">{formatCurrency(subtotal)}</TableCell>
                                                        <TableCell className="text-center font-mono font-bold text-emerald-600">{formatCurrency(inv.tax || 0)}</TableCell>
                                                        <TableCell className="text-center font-mono font-bold">{formatCurrency(inv.total)}</TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* 4. Expenses Register */}
                    <TabsContent value="expenses" className="space-y-4 pt-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <div>
                                    <CardTitle>سجل المصروفات التشغيلية والعمومية الخاضعة للخصم</CardTitle>
                                    <CardDescription>المصروفات المؤيدة بمستندات وفواتير ضريبية تمنح حق خصم المدخلات</CardDescription>
                                </div>
                                <Badge variant="outline" className="font-mono">{reportData.expenses.length} حركة</Badge>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">البيان والتفاصيل</TableHead>
                                            <TableHead className="text-right">بند المصروف</TableHead>
                                            <TableHead className="text-center">المبلغ قبل الضريبة</TableHead>
                                            <TableHead className="text-center">الضريبة المخصومة</TableHead>
                                            <TableHead className="text-center">إجمالي المصروف</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.expenses.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد مصروفات ضريبية مسجلة في هذه الفترة</TableCell>
                                            </TableRow>
                                        ) : (
                                            reportData.expenses.map((exp: any) => {
                                                const tax = exp.taxAmount || 0;
                                                const base = (exp.amount || 0) - tax;
                                                return (
                                                    <TableRow key={exp.id}>
                                                        <TableCell className="text-right font-mono text-xs">{new Date(exp.date).toLocaleDateString('ar-EG')}</TableCell>
                                                        <TableCell className="text-right">{exp.description || 'مصروف عام'}</TableCell>
                                                        <TableCell className="text-right font-medium">{exp.expenseType || 'مصروف تشغيل'}</TableCell>
                                                        <TableCell className="text-center font-mono">{formatCurrency(base)}</TableCell>
                                                        <TableCell className="text-center font-mono font-bold text-emerald-600">{formatCurrency(tax)}</TableCell>
                                                        <TableCell className="text-center font-mono font-bold">{formatCurrency(exp.amount)}</TableCell>
                                                    </TableRow>
                                                );
                                            })
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
