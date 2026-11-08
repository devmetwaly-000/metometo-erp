"use client";

import React, { useState, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/contexts/data-provider";
import { FileText, Printer, Calculator } from "lucide-react";

export default function VatReportPage() {
    const { salesInvoices, posSales, purchaseInvoices, expenses, settings } = useData();
    
    const vatRate = useMemo(() => settings?.main?.financial?.vatRate || 14, [settings?.main?.financial?.vatRate]);
    
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    const [fromDate, setFromDate] = useState(firstDayOfMonth);
    const [toDate, setToDate] = useState(lastDayOfMonth);

    const reportData = useMemo(() => {
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);

        // 1. Output VAT (Sales)
        const filteredSales = salesInvoices.filter((inv: any) => {
            const d = new Date(inv.date);
            return d >= start && d <= end && (inv.status === 'approved' || inv.status === 'completed' || !inv.status);
        });

        const processedSaleIds = new Set(filteredSales.map((s: any) => s.id));
        const filteredPos = posSales.filter((sale: any) => {
            if (sale.id && processedSaleIds.has(sale.id)) return false;
            const d = new Date(sale.date);
            return d >= start && d <= end;
        });

        const salesTax = filteredSales.reduce((acc: number, inv: any) => acc + (inv.tax || 0), 0);
        
        // POS tax calculation using dynamic vatRate
        const posTax = filteredPos.reduce((acc: number, sale: any) => {
            if (sale.applyTax === false) return acc;
            
            // If the sale already has taxAmount stored, use it
            if (sale.taxAmount !== undefined) return acc + sale.taxAmount;
            if (sale.tax !== undefined) return acc + sale.tax;

            // Otherwise calculate based on settings (assuming inclusive for legacy or if not specified)
            const rate = sale.taxRate !== undefined ? sale.taxRate * 100 : vatRate;
            return acc + (sale.total - (sale.total / (1 + rate / 100)));
        }, 0);

        const totalOutputTax = salesTax + posTax;

        // 2. Input VAT (Purchases & Expenses)
        const filteredPurchases = purchaseInvoices.filter((inv: any) => {
            const d = new Date(inv.date);
            return d >= start && d <= end;
        });

        const filteredExpenses = expenses.filter((exp: any) => {
            const d = new Date(exp.date);
            return d >= start && d <= end && (exp.taxAmount || 0) > 0;
        });

        const purchasesTax = filteredPurchases.reduce((acc: number, inv: any) => acc + (inv.tax || 0), 0);
        const expensesTax = filteredExpenses.reduce((acc: number, exp: any) => acc + (exp.taxAmount || 0), 0);

        const totalInputTax = purchasesTax + expensesTax;

        // 3. Net VAT
        const netVat = totalOutputTax - totalInputTax;

        return {
            sales: filteredSales,
            pos: filteredPos,
            purchases: filteredPurchases,
            expenses: filteredExpenses,
            salesTax,
            posTax,
            purchasesTax,
            expensesTax,
            totalOutputTax,
            totalInputTax,
            netVat
        };
    }, [fromDate, toDate, salesInvoices, posSales, purchaseInvoices, expenses]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount);
    };

    return (
        <>
            <PageHeader title="إقرار ضريبة القيمة المضافة" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 printable-area">
                
                {/* Filters */}
                <Card className="no-print">
                    <CardHeader>
                        <CardTitle>فترة التقرير</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <Label htmlFor="from">من تاريخ</Label>
                            <Input type="date" id="from" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                        </div>
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <Label htmlFor="to">إلى تاريخ</Label>
                            <Input type="date" id="to" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                        </div>
                        <Button variant="outline" onClick={() => window.print()}>
                            <Printer className="ml-2 h-4 w-4" />
                            طباعة
                        </Button>
                    </CardContent>
                </Card>

                {/* Summary Cards */}
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">إجمالي ضريبة المخرجات (مستحقة)</CardTitle>
                            <FileText className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-600">{formatCurrency(reportData.totalOutputTax)}</div>
                            <p className="text-xs text-muted-foreground">
                                مبيعات الفواتير: {formatCurrency(reportData.salesTax)} <br/>
                                مبيعات الكاشير: {formatCurrency(reportData.posTax)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">إجمالي ضريبة المدخلات (مخصومة)</CardTitle>
                            <FileText className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">{formatCurrency(reportData.totalInputTax)}</div>
                            <p className="text-xs text-muted-foreground">
                                المشتريات: {formatCurrency(reportData.purchasesTax)} <br/>
                                المصروفات: {formatCurrency(reportData.expensesTax)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card className={reportData.netVat > 0 ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">صافي الضريبة المستحقة</CardTitle>
                            <Calculator className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {formatCurrency(Math.abs(reportData.netVat))}
                                <span className="text-sm font-normal text-muted-foreground mx-2">
                                    {reportData.netVat > 0 ? "(واجبة السداد)" : "(رصيد دائن/استرداد)"}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Details Tabs */}
                <Tabs defaultValue="sales" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="sales">فواتير المبيعات</TabsTrigger>
                        <TabsTrigger value="pos">مبيعات الكاشير</TabsTrigger>
                        <TabsTrigger value="purchases">المشتريات</TabsTrigger>
                        <TabsTrigger value="expenses">المصروفات</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="sales">
                        <Card>
                            <CardHeader><CardTitle>تفاصيل فواتير المبيعات</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-center">التاريخ</TableHead>
                                            <TableHead className="text-center">رقم الفاتورة</TableHead>
                                            <TableHead className="text-center">العميل</TableHead>
                                            <TableHead className="text-center">الإجمالي (شامل)</TableHead>
                                            <TableHead className="text-center">الضريبة</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.sales.map((inv: any) => (
                                            <TableRow key={inv.id}>
                                                <TableCell className="text-center">{new Date(inv.date).toLocaleDateString('ar-EG')}</TableCell>
                                                <TableCell className="text-center">{inv.invoiceNumber}</TableCell>
                                                <TableCell className="text-center">{inv.customerName}</TableCell>
                                                <TableCell className="text-center">{formatCurrency(inv.total)}</TableCell>
                                                <TableCell className="text-center">{formatCurrency(inv.tax || 0)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="pos">
                        <Card>
                            <CardHeader><CardTitle>تفاصيل مبيعات الكاشير</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-center">التاريخ</TableHead>
                                            <TableHead className="text-center">رقم العملية</TableHead>
                                            <TableHead className="text-center">الإجمالي (شامل)</TableHead>
                                            <TableHead className="text-center">الضريبة المحتسبة ({vatRate}%)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.pos.map((sale: any) => {
                                            const currentTax = sale.applyTax === false ? 0 : 
                                                (sale.taxAmount ?? sale.tax ?? (sale.total - (sale.total / (1 + (sale.taxRate !== undefined ? sale.taxRate * 100 : vatRate) / 100))));
                                            
                                            return (
                                                <TableRow key={sale.id}>
                                                    <TableCell className="text-center">{new Date(sale.date).toLocaleDateString('ar-EG')}</TableCell>
                                                    <TableCell className="text-center">{sale.invoiceNumber}</TableCell>
                                                    <TableCell className="text-center">{formatCurrency(sale.total)}</TableCell>
                                                    <TableCell className="text-center">{formatCurrency(currentTax)}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="purchases">
                        <Card>
                            <CardHeader><CardTitle>تفاصيل فواتير المشتريات</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-center">التاريخ</TableHead>
                                            <TableHead className="text-center">رقم الفاتورة</TableHead>
                                            <TableHead className="text-center">المورد</TableHead>
                                            <TableHead className="text-center">الإجمالي (شامل)</TableHead>
                                            <TableHead className="text-center">الضريبة</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.purchases.map((inv: any) => (
                                            <TableRow key={inv.id}>
                                                <TableCell className="text-center">{new Date(inv.date).toLocaleDateString('ar-EG')}</TableCell>
                                                <TableCell className="text-center">{inv.invoiceNumber}</TableCell>
                                                <TableCell className="text-center">{inv.supplierName}</TableCell>
                                                <TableCell className="text-center">{formatCurrency(inv.total)}</TableCell>
                                                <TableCell className="text-center">{formatCurrency(inv.tax || 0)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="expenses">
                        <Card>
                            <CardHeader><CardTitle>تفاصيل المصروفات الضريبية</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-center">التاريخ</TableHead>
                                            <TableHead className="text-center">البيان</TableHead>
                                            <TableHead className="text-center">نوع المصروف</TableHead>
                                            <TableHead className="text-center">المبلغ الإجمالي</TableHead>
                                            <TableHead className="text-center">الضريبة</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.expenses.map((exp: any) => (
                                            <TableRow key={exp.id}>
                                                <TableCell className="text-center">{new Date(exp.date).toLocaleDateString('ar-EG')}</TableCell>
                                                <TableCell className="text-center">{exp.description}</TableCell>
                                                <TableCell className="text-center">{exp.expenseType}</TableCell>
                                                <TableCell className="text-center">{formatCurrency(exp.amount)}</TableCell>
                                                <TableCell className="text-center">{formatCurrency(exp.taxAmount || 0)}</TableCell>
                                            </TableRow>
                                        ))}
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
