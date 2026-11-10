"use client";

import React, { useState, useMemo } from "react";
import PageHeader from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { useData } from "@/contexts/data-provider";
import {
  Loader2,
  Printer,
  Download,
  Filter,
  Receipt,
  DollarSign,
  Scale,
  Building2,
  Calendar,
  FileCheck2,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Percent
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function VatDeclarationReportPage() {
  const { salesInvoices, posSales, salesReturns, posReturns, purchaseInvoices, purchaseReturns, settings, loading } = useData();

  const vatRate = useMemo(() => {
    return Number(settings?.main?.financial?.vatRate || settings?.vatRate || 14);
  }, [settings]);

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(lastDayOfMonth);

  // Compute Tax Return Figures
  const taxDeclaration = useMemo(() => {
    const start = fromDate ? new Date(fromDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    const end = toDate ? new Date(toDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    const isInRange = (dateStr: string) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    };

    // 1. Output VAT (المبيعات)
    let grossSales = 0;
    let outputTax = 0;

    (salesInvoices || []).forEach((inv: any) => {
      if (!isInRange(inv.date || inv.Date)) return;
      const total = Number(inv.total || inv.Total) || 0;
      const tax = Number(inv.tax || inv.Tax) || 0;
      grossSales += total;
      outputTax += tax > 0 ? tax : (total * (vatRate / 100));
    });

    (posSales || []).forEach((sale: any) => {
      if (!isInRange(sale.date || sale.Date)) return;
      const total = Number(sale.total || sale.Total) || 0;
      const tax = Number(sale.tax || sale.Tax || sale.taxAmount) || 0;
      grossSales += total;
      outputTax += tax > 0 ? tax : (total - (total / (1 + vatRate / 100)));
    });

    // 2. Output VAT Returns Deductions (مردودات المبيعات)
    let grossSalesReturns = 0;
    let salesReturnsTax = 0;

    (salesReturns || []).forEach((ret: any) => {
      if (!isInRange(ret.date || ret.Date)) return;
      const total = Number(ret.total || ret.Total) || 0;
      const tax = Number(ret.tax || ret.Tax) || 0;
      grossSalesReturns += total;
      salesReturnsTax += tax > 0 ? tax : (total * (vatRate / 100));
    });

    (posReturns || []).forEach((ret: any) => {
      if (!isInRange(ret.date || ret.Date)) return;
      const total = Number(ret.total || ret.Total) || 0;
      const tax = Number(ret.tax || ret.Tax) || 0;
      grossSalesReturns += total;
      salesReturnsTax += tax > 0 ? tax : (total - (total / (1 + vatRate / 100)));
    });

    // Net Output Tax
    const netOutputTax = Math.max(0, outputTax - salesReturnsTax);

    // 3. Input VAT (المشتريات)
    let grossPurchases = 0;
    let inputTax = 0;

    (purchaseInvoices || []).forEach((inv: any) => {
      if (!isInRange(inv.date || inv.Date)) return;
      const total = Number(inv.total || inv.Total) || 0;
      const tax = Number(inv.tax || inv.Tax) || 0;
      grossPurchases += total;
      inputTax += tax > 0 ? tax : (total * (vatRate / 100));
    });

    // 4. Input VAT Returns (مردودات المشتريات)
    let grossPurchaseReturns = 0;
    let purchaseReturnsTax = 0;

    (purchaseReturns || []).forEach((ret: any) => {
      if (!isInRange(ret.date || ret.Date)) return;
      const total = Number(ret.total || ret.Total) || 0;
      const tax = Number(ret.tax || ret.Tax) || 0;
      grossPurchaseReturns += total;
      purchaseReturnsTax += tax > 0 ? tax : (total * (vatRate / 100));
    });

    // Net Input Tax
    const netInputTax = Math.max(0, inputTax - purchaseReturnsTax);

    // Final Net VAT Payable or Refundable
    const netVatPayable = netOutputTax - netInputTax;

    return {
      grossSales,
      outputTax,
      grossSalesReturns,
      salesReturnsTax,
      netSales: grossSales - grossSalesReturns,
      netOutputTax,

      grossPurchases,
      inputTax,
      grossPurchaseReturns,
      purchaseReturnsTax,
      netPurchases: grossPurchases - grossPurchaseReturns,
      netInputTax,

      netVatPayable,
      vatRate
    };
  }, [salesInvoices, posSales, salesReturns, posReturns, purchaseInvoices, purchaseReturns, fromDate, toDate, vatRate]);

  // Export to Excel
  const handleExportExcel = () => {
    const dataToExport = [
      { "البند": "إجمالي المبيعات الخاضعة للضريبة", "القيمة بدون ضريبة": taxDeclaration.grossSales - taxDeclaration.outputTax, "قيمة الضريبة": taxDeclaration.outputTax },
      { "البند": "مردودات المبيعات", "القيمة بدون ضريبة": taxDeclaration.grossSalesReturns - taxDeclaration.salesReturnsTax, "قيمة الضريبة": -taxDeclaration.salesReturnsTax },
      { "البند": "صافي ضريبة المخرجات (المبيعات)", "القيمة بدون ضريبة": taxDeclaration.netSales, "قيمة الضريبة": taxDeclaration.netOutputTax },
      { "البند": "إجمالي المشتريات الخاضعة للضريبة", "القيمة بدون ضريبة": taxDeclaration.grossPurchases - taxDeclaration.inputTax, "قيمة الضريبة": taxDeclaration.inputTax },
      { "البند": "مردودات المشتريات", "القيمة بدون ضريبة": taxDeclaration.grossPurchaseReturns - taxDeclaration.purchaseReturnsTax, "قيمة الضريبة": -taxDeclaration.purchaseReturnsTax },
      { "البند": "صافي ضريبة المدخلات (المشتريات القابلة للخصم)", "القيمة بدون ضريبة": taxDeclaration.netPurchases, "قيمة الضريبة": taxDeclaration.netInputTax },
      { "البند": "صافي الضريبة المستحقة للإقرار (للسداد أو الاسترداد)", "القيمة بدون ضريبة": "-", "قيمة الضريبة": taxDeclaration.netVatPayable }
    ];

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الإقرار الضريبي");
    XLSX.writeFile(wb, `الإقرار_الضريبي_${todayStr}.xlsx`);
  };

  const handlePeriod = (type: "current_month" | "last_month" | "quarter" | "year") => {
    const curr = new Date();
    if (type === "current_month") {
      setFromDate(new Date(curr.getFullYear(), curr.getMonth(), 1).toISOString().split("T")[0]);
      setToDate(new Date(curr.getFullYear(), curr.getMonth() + 1, 0).toISOString().split("T")[0]);
    } else if (type === "last_month") {
      setFromDate(new Date(curr.getFullYear(), curr.getMonth() - 1, 1).toISOString().split("T")[0]);
      setToDate(new Date(curr.getFullYear(), curr.getMonth(), 0).toISOString().split("T")[0]);
    } else if (type === "quarter") {
      const qMonth = Math.floor(curr.getMonth() / 3) * 3;
      setFromDate(new Date(curr.getFullYear(), qMonth, 1).toISOString().split("T")[0]);
      setToDate(new Date(curr.getFullYear(), qMonth + 3, 0).toISOString().split("T")[0]);
    } else if (type === "year") {
      setFromDate(new Date(curr.getFullYear(), 0, 1).toISOString().split("T")[0]);
      setToDate(new Date(curr.getFullYear(), 11, 31).toISOString().split("T")[0]);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-32 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse font-medium">جاري إعداد احتساب الإقرار الضريبي...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full pb-10 space-y-6">
      {/* 1. Header with Actions */}
      <PageHeader title="تقرير إقرار ضريبة القيمة المضافة (VAT Return)">
        <div className="flex items-center gap-2 flex-wrap no-print">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="gap-1.5 text-xs font-semibold h-8"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            تصدير إلى Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-1.5 text-xs font-semibold h-8"
          >
            <Printer className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            طباعة الإقرار الضريبي
          </Button>
        </div>
      </PageHeader>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="border shadow-sm bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>ضريبة المخرجات (المبيعات)</span>
              <Receipt className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-blue-700 dark:text-blue-400">
              {taxDeclaration.netOutputTax.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              محصلة من مبيعات الفترة بنسبة {taxDeclaration.vatRate}%
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>ضريبة المدخلات (المشتريات)</span>
              <TrendingDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {taxDeclaration.netInputTax.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              ضريبة مشتريات قابلة للخصم والرد
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-indigo-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>نسبة الضريبة المطبقة</span>
              <Percent className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-indigo-700 dark:text-indigo-400">
              {taxDeclaration.vatRate}%
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              النسبة النظامية المعتمدة
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>صافي الضريبة للإقرار</span>
              <Scale className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className={cn(
              "text-2xl font-bold font-mono",
              taxDeclaration.netVatPayable >= 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
            )}>
              {Math.abs(taxDeclaration.netVatPayable).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-semibold">
              {taxDeclaration.netVatPayable >= 0 ? "مستحقة السداد لمصلحة الضرائب" : "رصيد ضريبي دائن مسترد"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Filter Bar */}
      <Card className="border shadow-sm no-print">
        <CardHeader className="p-4 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-primary" />
              <span>فترة الإقرار الضريبي</span>
            </CardTitle>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handlePeriod("current_month")}>الشهر الحالي</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handlePeriod("last_month")}>الشهر السابق</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handlePeriod("quarter")}>الربع الحالي (3 أشهر)</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-primary" onClick={() => handlePeriod("year")}>السنة بالكامل</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">من تاريخ</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">إلى تاريخ</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Tax Return Formal Declaration Table */}
      <Card className="border shadow-sm">
        <CardHeader className="p-4 pb-2 border-b">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-primary" />
            <span>نموذج الإقرار الضريبي الدوري لضريبة القيمة المضافة</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            الفترة من {new Date(fromDate).toLocaleDateString("ar-EG")} إلى {new Date(toDate).toLocaleDateString("ar-EG")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 text-xs">
                <TableHead className="w-12 text-center">البند</TableHead>
                <TableHead>البيان والتفصيل</TableHead>
                <TableHead className="text-left font-mono">القيمة الخاضعة للضريبة</TableHead>
                <TableHead className="text-center font-mono">النسبة</TableHead>
                <TableHead className="text-left font-mono font-bold">قيمة الضريبة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs">
              {/* Sales Section */}
              <TableRow className="bg-muted/10 font-bold border-b">
                <TableCell colSpan={5} className="text-primary">
                  أولاً: ضريبة المخرجات (المبيعات والخدمات المؤداة)
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-muted/30 border-b">
                <TableCell className="text-center font-mono font-bold">1</TableCell>
                <TableCell className="font-semibold">المبيعات الخاضعة للنسبة الأساسية (فواتير بيع + نقاط البيع)</TableCell>
                <TableCell className="text-left font-mono">{taxDeclaration.grossSales.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</TableCell>
                <TableCell className="text-center font-mono">{taxDeclaration.vatRate}%</TableCell>
                <TableCell className="text-left font-mono font-bold text-blue-700 dark:text-blue-400">
                  {taxDeclaration.outputTax.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-muted/30 border-b text-rose-600">
                <TableCell className="text-center font-mono font-bold">2</TableCell>
                <TableCell className="font-semibold">يخصم: مردودات وإشعارات دائنة للمبيعات</TableCell>
                <TableCell className="text-left font-mono">({taxDeclaration.grossSalesReturns.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}) ج.م</TableCell>
                <TableCell className="text-center font-mono">{taxDeclaration.vatRate}%</TableCell>
                <TableCell className="text-left font-mono font-bold">
                  ({taxDeclaration.salesReturnsTax.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}) ج.م
                </TableCell>
              </TableRow>
              <TableRow className="bg-blue-500/[0.04] font-bold border-b">
                <TableCell className="text-center font-mono">3</TableCell>
                <TableCell>صافي ضريبة المخرجات المستحقة (1 - 2)</TableCell>
                <TableCell className="text-left font-mono">{taxDeclaration.netSales.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</TableCell>
                <TableCell className="text-center font-mono">-</TableCell>
                <TableCell className="text-left font-mono font-black text-blue-700 dark:text-blue-400">
                  {taxDeclaration.netOutputTax.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                </TableCell>
              </TableRow>

              {/* Purchases Section */}
              <TableRow className="bg-muted/10 font-bold border-b">
                <TableCell colSpan={5} className="text-primary">
                  ثانياً: ضريبة المدخلات (المشتريات المحلية والمستوردة القابلة للخصم)
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-muted/30 border-b">
                <TableCell className="text-center font-mono font-bold">4</TableCell>
                <TableCell className="font-semibold">المشتريات الخاضعة للضريبة بموجب فواتير ضريبية</TableCell>
                <TableCell className="text-left font-mono">{taxDeclaration.grossPurchases.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</TableCell>
                <TableCell className="text-center font-mono">{taxDeclaration.vatRate}%</TableCell>
                <TableCell className="text-left font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {taxDeclaration.inputTax.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-muted/30 border-b text-rose-600">
                <TableCell className="text-center font-mono font-bold">5</TableCell>
                <TableCell className="font-semibold">يخصم: مردودات وإشعارات دائنة للمشتريات</TableCell>
                <TableCell className="text-left font-mono">({taxDeclaration.grossPurchaseReturns.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}) ج.م</TableCell>
                <TableCell className="text-center font-mono">{taxDeclaration.vatRate}%</TableCell>
                <TableCell className="text-left font-mono font-bold">
                  ({taxDeclaration.purchaseReturnsTax.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}) ج.م
                </TableCell>
              </TableRow>
              <TableRow className="bg-emerald-500/[0.04] font-bold border-b">
                <TableCell className="text-center font-mono">6</TableCell>
                <TableCell>صافي ضريبة المدخلات القابلة للخصم (4 - 5)</TableCell>
                <TableCell className="text-left font-mono">{taxDeclaration.netPurchases.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</TableCell>
                <TableCell className="text-center font-mono">-</TableCell>
                <TableCell className="text-left font-mono font-black text-emerald-700 dark:text-emerald-400">
                  {taxDeclaration.netInputTax.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                </TableCell>
              </TableRow>

              {/* Net Result */}
              <TableRow className="bg-amber-500/[0.08] text-sm font-black border-t-2">
                <TableCell className="text-center font-mono">7</TableCell>
                <TableCell colSpan={3}>
                  صافي الضريبة المستحقة للإقرار (الضريبة الصافية واجبة السداد لمصلحة الضرائب) (3 - 6)
                </TableCell>
                <TableCell className={cn(
                  "text-left font-mono text-base font-black",
                  taxDeclaration.netVatPayable >= 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                )}>
                  {taxDeclaration.netVatPayable.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
