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
  ShoppingCart,
  Banknote,
  Clock,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Building2,
  Calendar,
  Search,
  Eye,
  TrendingDown,
  PackageCheck
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function PurchasesReportPage() {
  const { purchaseInvoices, purchaseReturns, suppliers, warehouses, loading } = useData();

  // Filters State
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [selectedSupplierId, setSelectedSupplierId] = useState("all");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "paid" | "partial" | "credit">("all");
  const [docTypeFilter, setDocTypeFilter] = useState<"all" | "invoices" | "returns">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [selectedDocForModal, setSelectedDocForModal] = useState<any | null>(null);

  // Helper to extract items array
  const extractItems = (doc: any): any[] => {
    if (Array.isArray(doc.items) && doc.items.length > 0) return doc.items;
    if (doc.ItemsJson) {
      try {
        return typeof doc.ItemsJson === "string" ? JSON.parse(doc.ItemsJson) : doc.ItemsJson;
      } catch {
        return [];
      }
    }
    return [];
  };

  // Supplier Name Map
  const suppliersMap = useMemo(() => {
    const map = new Map<string, string>();
    (suppliers || []).forEach((s: any) => map.set(s.id, s.name));
    return map;
  }, [suppliers]);

  // Warehouse Name Map
  const warehousesMap = useMemo(() => {
    const map = new Map<string, string>();
    (warehouses || []).forEach((w: any) => map.set(w.id, w.name));
    return map;
  }, [warehouses]);

  // Combined & Filtered Records
  const { filteredRecords, summary } = useMemo(() => {
    const start = fromDate ? new Date(fromDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    const end = toDate ? new Date(toDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    const list: any[] = [];
    let totalPurchases = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let totalReturns = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    // 1. Process Purchase Invoices
    if (docTypeFilter === "all" || docTypeFilter === "invoices") {
      (purchaseInvoices || []).forEach((inv: any) => {
        const d = new Date(inv.date || inv.Date);
        if (start && d < start) return;
        if (end && d > end) return;

        if (selectedSupplierId !== "all" && inv.supplierId !== selectedSupplierId && inv.SupplierId !== selectedSupplierId) {
          return;
        }

        if (selectedWarehouseId !== "all" && inv.warehouseId !== selectedWarehouseId && inv.WarehouseId !== selectedWarehouseId) {
          return;
        }

        const total = Number(inv.total || inv.Total) || 0;
        const paid = Number(inv.paidAmount || inv.PaidAmount) || 0;
        const remaining = Math.max(0, total - paid);

        if (paymentFilter === "paid" && remaining > 0.01) return;
        if (paymentFilter === "credit" && paid > 0.01) return;
        if (paymentFilter === "partial" && (paid <= 0.01 || remaining <= 0.01)) return;

        const suppName = inv.supplierName || inv.SupplierName || suppliersMap.get(inv.supplierId || inv.SupplierId) || "مورد غير محدد";
        const invNum = inv.invoiceNumber || inv.InvoiceNumber || inv.id || inv.Id || "";
        const notes = inv.notes || inv.Notes || "";

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match = invNum.toLowerCase().includes(q) || suppName.toLowerCase().includes(q) || notes.toLowerCase().includes(q);
          if (!match) return;
        }

        const items = extractItems(inv);
        const tax = Number(inv.tax || inv.Tax) || 0;
        const discount = Number(inv.discount || inv.Discount) || 0;

        totalPurchases += total;
        totalPaid += paid;
        totalRemaining += remaining;
        totalTax += tax;
        totalDiscount += discount;

        list.push({
          id: inv.id || inv.Id,
          docType: "invoice",
          invoiceNumber: invNum,
          date: inv.date || inv.Date,
          supplierId: inv.supplierId || inv.SupplierId,
          supplierName: suppName,
          warehouseId: inv.warehouseId || inv.WarehouseId,
          warehouseName: warehousesMap.get(inv.warehouseId || inv.WarehouseId) || inv.branchName || inv.BranchName || "المخزن الرئيسي",
          total,
          paidAmount: paid,
          remaining,
          tax,
          discount,
          notes,
          items,
          itemsCount: items.length
        });
      });
    }

    // 2. Process Purchase Returns
    if (docTypeFilter === "all" || docTypeFilter === "returns") {
      (purchaseReturns || []).forEach((ret: any) => {
        const d = new Date(ret.date || ret.Date);
        if (start && d < start) return;
        if (end && d > end) return;

        if (selectedSupplierId !== "all" && ret.supplierId !== selectedSupplierId && ret.SupplierId !== selectedSupplierId) {
          return;
        }

        if (selectedWarehouseId !== "all" && ret.warehouseId !== selectedWarehouseId && ret.WarehouseId !== selectedWarehouseId) {
          return;
        }

        const total = Number(ret.total || ret.Total) || 0;
        const suppName = ret.supplierName || ret.SupplierName || suppliersMap.get(ret.supplierId || ret.SupplierId) || "مورد غير محدد";
        const retNum = ret.receiptNumber || ret.ReceiptNumber || ret.id || ret.Id || "";
        const notes = ret.notes || ret.Notes || "";

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match = retNum.toLowerCase().includes(q) || suppName.toLowerCase().includes(q) || notes.toLowerCase().includes(q);
          if (!match) return;
        }

        const items = extractItems(ret);
        totalReturns += total;

        list.push({
          id: ret.id || ret.Id,
          docType: "return",
          invoiceNumber: retNum,
          date: ret.date || ret.Date,
          supplierId: ret.supplierId || ret.SupplierId,
          supplierName: suppName,
          warehouseId: ret.warehouseId || ret.WarehouseId,
          warehouseName: warehousesMap.get(ret.warehouseId || ret.WarehouseId) || ret.branchName || ret.BranchName || "المخزن الرئيسي",
          total: -total,
          paidAmount: -(Number(ret.paidAmount || ret.PaidAmount) || total),
          remaining: 0,
          tax: 0,
          discount: Number(ret.discount || ret.Discount) || 0,
          notes,
          items,
          itemsCount: items.length
        });
      });
    }

    // Sort descending by date
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      filteredRecords: list,
      summary: {
        totalPurchases,
        totalPaid,
        totalRemaining,
        totalReturns,
        netPurchases: totalPurchases - totalReturns,
        totalTax,
        totalDiscount,
        invoicesCount: list.filter(r => r.docType === "invoice").length,
        returnsCount: list.filter(r => r.docType === "return").length
      }
    };
  }, [purchaseInvoices, purchaseReturns, fromDate, toDate, selectedSupplierId, selectedWarehouseId, paymentFilter, docTypeFilter, searchQuery, suppliersMap, warehousesMap]);

  // Export Excel
  const handleExportExcel = () => {
    const dataToExport = filteredRecords.map((r, idx) => ({
      "م": idx + 1,
      "النوع": r.docType === "invoice" ? "فاتورة شراء" : "مردود مشتريات",
      "رقم الوثيقة": r.invoiceNumber,
      "التاريخ": new Date(r.date).toLocaleDateString("ar-EG"),
      "المورد": r.supplierName,
      "الفرع / المخزن": r.warehouseName,
      "الإجمالي": Math.abs(r.total),
      "المدفوع": Math.abs(r.paidAmount),
      "المتبقي (الآجل)": r.remaining,
      "الضريبة": r.tax,
      "عدد الأصناف": r.itemsCount,
      "ملاحظات": r.notes || ""
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير المشتريات");
    XLSX.writeFile(wb, `تقرير_المشتريات_${todayStr}.xlsx`);
  };

  const handleQuickPeriod = (period: "today" | "week" | "month" | "year" | "all") => {
    const curr = new Date();
    if (period === "today") {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (period === "week") {
      const d = new Date(curr);
      d.setDate(d.getDate() - 7);
      setFromDate(d.toISOString().split("T")[0]);
      setToDate(todayStr);
    } else if (period === "month") {
      setFromDate(new Date(curr.getFullYear(), curr.getMonth(), 1).toISOString().split("T")[0]);
      setToDate(todayStr);
    } else if (period === "year") {
      setFromDate(new Date(curr.getFullYear(), 0, 1).toISOString().split("T")[0]);
      setToDate(todayStr);
    } else if (period === "all") {
      setFromDate("");
      setToDate("");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-32 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse font-medium">جاري إعداد تقرير المشتريات والموردين...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full pb-10 space-y-6">
      {/* 1. Header with Title and Actions */}
      <PageHeader title="تقرير المشتريات التفصيلي ومردودات الشراء">
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
            طباعة التقرير
          </Button>
        </div>
      </PageHeader>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <Card className="border shadow-sm bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>إجمالي المشتريات</span>
              <ShoppingCart className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-blue-700 dark:text-blue-400">
              {summary.totalPurchases.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {summary.invoicesCount} فاتورة شراء
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>المدفوع نقداً للموردين</span>
              <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {summary.totalPaid.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              سُددت نقدياً من الخزينة
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>المتبقي الآجل (مديونية)</span>
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400">
              {summary.totalRemaining.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              مستحق السداد للموردين
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-rose-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>مردودات المشتريات</span>
              <RotateCcw className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-rose-700 dark:text-rose-400">
              {summary.totalReturns.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {summary.returnsCount} إشعار رد بضاعة
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-indigo-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>صافي المشتريات الفعلي</span>
              <PackageCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-indigo-700 dark:text-indigo-400">
              {summary.netPurchases.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              بعد خصم المردودات
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
              <span>فلاتر وخيارات التقرير</span>
            </CardTitle>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handleQuickPeriod("today")}>اليوم</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handleQuickPeriod("week")}>آخر أسبوع</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handleQuickPeriod("month")}>هذا الشهر</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handleQuickPeriod("year")}>هذا العام</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-primary" onClick={() => handleQuickPeriod("all")}>كل الفترات</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">المورد</Label>
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل الموردين" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الموردين ({suppliers?.length || 0})</SelectItem>
                  {(suppliers || []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">الفرع / المخزن</Label>
              <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل الفروع والمخازن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع والمخازن</SelectItem>
                  {(warehouses || []).map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">حالة السداد</Label>
              <Select value={paymentFilter} onValueChange={(v: any) => setPaymentFilter(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="paid">مسدد بالكامل (نقدي)</SelectItem>
                  <SelectItem value="partial">مسدد جزئياً</SelectItem>
                  <SelectItem value="credit">آجل بالكامل (متبقي)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">بحث برقم الفاتورة أو الملاحظات</Label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="ابحث..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-xs pr-8"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Detailed Purchases Table */}
      <Card className="border shadow-sm">
        <CardHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">
                سجل فواتير ومردودات المشتريات
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                إجمالي {filteredRecords.length} حركة مطابقة للفلاتر
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono">
                صافي الفترة: {summary.netPurchases.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 text-xs">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead className="w-24">النوع</TableHead>
                  <TableHead>رقم الفاتورة / الوثيقة</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>المخزن / الفرع</TableHead>
                  <TableHead className="text-left font-mono">الإجمالي</TableHead>
                  <TableHead className="text-left font-mono">المدفوع</TableHead>
                  <TableHead className="text-left font-mono">المتبقي</TableHead>
                  <TableHead className="text-center">الأصناف</TableHead>
                  <TableHead className="w-20 text-center no-print">التفاصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground text-xs">
                      لا توجد فواتير أو حركات شراء مطابقة للفترة المحددة.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((r, idx) => {
                    const isExpanded = expandedInvoiceId === r.id;
                    const isReturn = r.docType === "return";

                    return (
                      <React.Fragment key={r.id}>
                        <TableRow className={cn(
                          "text-xs hover:bg-muted/40 transition-colors border-b",
                          isReturn && "bg-rose-500/[0.03] text-rose-800 dark:text-rose-300"
                        )}>
                          <TableCell className="text-center font-mono text-muted-foreground font-semibold">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            {isReturn ? (
                              <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-300">
                                مردود مشتريات
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-300">
                                فاتورة شراء
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono font-bold text-foreground">
                            {r.invoiceNumber}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {new Date(r.date).toLocaleDateString("ar-EG")}
                          </TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {r.supplierName}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-[11px]">
                            {r.warehouseName}
                          </TableCell>
                          <TableCell className="text-left font-mono font-bold">
                            <span className={isReturn ? "text-rose-600 dark:text-rose-400" : "text-foreground"}>
                              {Math.abs(r.total).toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                            </span>
                          </TableCell>
                          <TableCell className="text-left font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            {Math.abs(r.paidAmount).toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-left font-mono font-semibold">
                            {r.remaining > 0 ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {r.remaining.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-[11px]">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">
                            <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                              {r.itemsCount} صنف
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center no-print">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDocForModal(r)}
                                className="h-7 w-7 p-0"
                                title="عرض الفاتورة"
                              >
                                <Eye className="h-3.5 w-3.5 text-primary" />
                              </Button>
                              {r.items.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setExpandedInvoiceId(isExpanded ? null : r.id)}
                                  className="h-7 w-7 p-0"
                                  title="إظهار بنود الفاتورة"
                                >
                                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expandable items row */}
                        {isExpanded && r.items.length > 0 && (
                          <TableRow className="bg-muted/20 border-b">
                            <TableCell colSpan={11} className="p-3 pr-12">
                              <div className="bg-background border rounded-lg p-3 shadow-xs">
                                <div className="text-[11px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
                                  <span>بنود ومحتويات الفاتورة ({r.invoiceNumber}):</span>
                                </div>
                                <div className="overflow-x-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-muted/40 text-[11px]">
                                        <TableHead className="w-10 text-center">#</TableHead>
                                        <TableHead>كود الصنف</TableHead>
                                        <TableHead>اسم الصنف</TableHead>
                                        <TableHead className="text-center">الكمية</TableHead>
                                        <TableHead className="text-center">الوحدة</TableHead>
                                        <TableHead className="text-left font-mono">سعر التكلفة</TableHead>
                                        <TableHead className="text-left font-mono">الإجمالي</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {r.items.map((it: any, iIdx: number) => {
                                        const qty = Number(it.qty || it.Qty || it.quantity || it.Quantity) || 0;
                                        const cost = Number(it.cost || it.Cost || it.price || it.Price) || 0;
                                        const lineTotal = Number(it.total || it.Total) || (qty * cost);

                                        return (
                                          <TableRow key={iIdx} className="text-xs hover:bg-muted/30">
                                            <TableCell className="text-center font-mono text-muted-foreground">{iIdx + 1}</TableCell>
                                            <TableCell className="font-mono text-[11px] text-muted-foreground">{it.code || it.itemCode || it.ItemCode || "-"}</TableCell>
                                            <TableCell className="font-semibold">{it.name || it.itemName || it.ItemName}</TableCell>
                                            <TableCell className="text-center font-mono font-bold">{qty.toLocaleString()}</TableCell>
                                            <TableCell className="text-center text-[11px] text-muted-foreground">{it.unit || it.unitName || "قطعة"}</TableCell>
                                            <TableCell className="text-left font-mono">{cost.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-left font-mono font-bold text-primary">{lineTotal.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}</TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
              <TableFooter className="bg-muted/60 text-xs font-bold border-t-2">
                <TableRow>
                  <TableCell colSpan={6} className="text-right">
                    إجمالي نتائج التقرير ({filteredRecords.length} وثيقة):
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-foreground">
                    {summary.netPurchases.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                    {summary.totalPaid.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-amber-600 dark:text-amber-400">
                    {summary.totalRemaining.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell colSpan={2}></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 5. Invoice Drilldown Modal */}
      {selectedDocForModal && (
        <Dialog open={!!selectedDocForModal} onOpenChange={(open) => !open && setSelectedDocForModal(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader className="border-b pb-3">
              <DialogTitle className="text-base font-bold flex items-center justify-between">
                <span>تفاصيل {selectedDocForModal.docType === "return" ? "مردود الشراء" : "فاتورة الشراء"}</span>
                <Badge variant={selectedDocForModal.docType === "return" ? "destructive" : "default"}>
                  {selectedDocForModal.invoiceNumber}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                تاريخ: {new Date(selectedDocForModal.date).toLocaleDateString("ar-EG")} | المورد: {selectedDocForModal.supplierName}
              </DialogDescription>
            </DialogHeader>

            <div className="py-3 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/30 p-3 rounded-lg text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">المخزن / الفرع:</span>
                  <span className="font-semibold">{selectedDocForModal.warehouseName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">إجمالي الوثيقة:</span>
                  <span className="font-bold font-mono">{Math.abs(selectedDocForModal.total).toLocaleString()} ج.م</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">المدفوع نقداً:</span>
                  <span className="font-bold font-mono text-emerald-600">{Math.abs(selectedDocForModal.paidAmount).toLocaleString()} ج.م</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">المتبقي الآجل:</span>
                  <span className="font-bold font-mono text-amber-600">{selectedDocForModal.remaining.toLocaleString()} ج.م</span>
                </div>
              </div>

              {selectedDocForModal.notes && (
                <div className="text-xs bg-muted/20 p-2.5 rounded border">
                  <span className="font-bold text-muted-foreground ml-1">ملاحظات:</span>
                  <span>{selectedDocForModal.notes}</span>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold mb-2">الأصناف المسجلة ({selectedDocForModal.items.length}):</h4>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40 text-[11px]">
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>الصنف</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-left">سعر الوحدة</TableHead>
                        <TableHead className="text-left font-bold">الإجمالي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs">
                      {selectedDocForModal.items.map((it: any, iIdx: number) => {
                        const qty = Number(it.qty || it.Qty || it.quantity || it.Quantity) || 0;
                        const cost = Number(it.cost || it.Cost || it.price || it.Price) || 0;
                        const total = Number(it.total || it.Total) || (qty * cost);

                        return (
                          <TableRow key={iIdx}>
                            <TableCell className="font-mono text-muted-foreground">{iIdx + 1}</TableCell>
                            <TableCell className="font-semibold">{it.name || it.itemName || it.ItemName}</TableCell>
                            <TableCell className="text-center font-mono font-bold">{qty.toLocaleString()}</TableCell>
                            <TableCell className="text-left font-mono">{cost.toLocaleString()} ج.م</TableCell>
                            <TableCell className="text-left font-mono font-bold text-primary">{total.toLocaleString()} ج.م</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

