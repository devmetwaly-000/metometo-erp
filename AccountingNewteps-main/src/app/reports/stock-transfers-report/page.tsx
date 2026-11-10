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
  ArrowRightLeft,
  Truck,
  CheckCircle2,
  Clock,
  Search,
  Building2,
  ChevronDown,
  ChevronUp,
  Eye,
  Boxes
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function StockTransfersReportPage() {
  const { stockTransferRecords, warehouses, inventoryZones, loading } = useData();

  // Filters State
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [fromWarehouseId, setFromWarehouseId] = useState("all");
  const [toWarehouseId, setToWarehouseId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTransferId, setExpandedTransferId] = useState<string | null>(null);
  const [selectedTransferForModal, setSelectedTransferForModal] = useState<any | null>(null);

  // All warehouses combined
  const allWarehousesList = useMemo(() => {
    return [...(warehouses || []), ...(inventoryZones || [])];
  }, [warehouses, inventoryZones]);

  const warehousesMap = useMemo(() => {
    const map = new Map<string, string>();
    allWarehousesList.forEach((w: any) => map.set(w.id, w.name));
    return map;
  }, [allWarehousesList]);

  // Extract items helper
  const extractItems = (record: any): any[] => {
    if (Array.isArray(record.items) && record.items.length > 0) return record.items;
    if (record.ItemsJson) {
      try {
        return typeof record.ItemsJson === "string" ? JSON.parse(record.ItemsJson) : record.ItemsJson;
      } catch {
        return [];
      }
    }
    return [];
  };

  // Filtered transfers
  const { filteredTransfers, summary } = useMemo(() => {
    const start = fromDate ? new Date(fromDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    const end = toDate ? new Date(toDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    let totalQtyTransferred = 0;
    let completedCount = 0;
    let inTransitCount = 0;

    const list = (stockTransferRecords || []).filter((tr: any) => {
      const d = new Date(tr.date || tr.Date || tr.createdAt || tr.CreatedAt);
      if (start && d < start) return false;
      if (end && d > end) return false;

      const fromWh = tr.fromWarehouseId || tr.FromWarehouseId;
      if (fromWarehouseId !== "all" && fromWh !== fromWarehouseId) return false;

      const toWh = tr.toWarehouseId || tr.ToWarehouseId;
      if (toWarehouseId !== "all" && toWh !== toWarehouseId) return false;

      const status = String(tr.status || tr.Status || "completed").toLowerCase();
      if (statusFilter !== "all") {
        if (statusFilter === "completed" && status !== "completed" && status !== "received") return false;
        if (statusFilter === "in_transit" && status !== "in_transit" && status !== "pending") return false;
      }

      const receiptNum = String(tr.receiptNumber || tr.ReceiptNumber || tr.id || tr.Id || "");
      const notes = String(tr.notes || tr.Notes || "");
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!receiptNum.toLowerCase().includes(q) && !notes.toLowerCase().includes(q)) {
          return false;
        }
      }

      const items = extractItems(tr);
      let itemsTotalQty = 0;
      items.forEach((it: any) => {
        itemsTotalQty += Number(it.qty || it.Qty || it.quantity || it.Quantity || 0);
      });

      totalQtyTransferred += itemsTotalQty;
      if (status === "completed" || status === "received") {
        completedCount++;
      } else {
        inTransitCount++;
      }

      return true;
    }).map((tr: any) => {
      const items = extractItems(tr);
      let itemsTotalQty = 0;
      items.forEach((it: any) => {
        itemsTotalQty += Number(it.qty || it.Qty || it.quantity || it.Quantity || 0);
      });

      return {
        id: tr.id || tr.Id,
        receiptNumber: tr.receiptNumber || tr.ReceiptNumber || tr.id || "-",
        date: tr.date || tr.Date || tr.createdAt || tr.CreatedAt,
        fromWarehouseId: tr.fromWarehouseId || tr.FromWarehouseId,
        fromWarehouseName: warehousesMap.get(tr.fromWarehouseId || tr.FromWarehouseId) || "مخزن محلي",
        toWarehouseId: tr.toWarehouseId || tr.ToWarehouseId,
        toWarehouseName: warehousesMap.get(tr.toWarehouseId || tr.ToWarehouseId) || "مخزن محلي",
        status: tr.status || tr.Status || "completed",
        notes: tr.notes || tr.Notes || "",
        items,
        itemsCount: items.length,
        itemsTotalQty
      };
    });

    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      filteredTransfers: list,
      summary: {
        totalTransfers: list.length,
        totalQtyTransferred,
        completedCount,
        inTransitCount
      }
    };
  }, [stockTransferRecords, fromDate, toDate, fromWarehouseId, toWarehouseId, statusFilter, searchQuery, warehousesMap]);

  // Export to Excel
  const handleExportExcel = () => {
    const dataToExport = filteredTransfers.map((tr: any, idx: number) => ({
      "م": idx + 1,
      "رقم إذن التحويل": tr.receiptNumber,
      "التاريخ": new Date(tr.date).toLocaleDateString("ar-EG"),
      "من مخزن": tr.fromWarehouseName,
      "إلى مخزن": tr.toWarehouseName,
      "الحالة": tr.status === "completed" ? "مكتمل ومستلم" : "قيد النقل / معلق",
      "عدد الأصناف": tr.itemsCount,
      "إجمالي الكمية المحولة": tr.itemsTotalQty,
      "الملاحظات": tr.notes || ""
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير تحويلات المخازن");
    XLSX.writeFile(wb, `تقرير_تحويلات_المخازن_${todayStr}.xlsx`);
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
        <p className="text-sm text-muted-foreground animate-pulse font-medium">جاري إعداد تقرير حركات التحويل بين الفروع والمخازن...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full pb-10 space-y-6">
      {/* 1. Header with Actions */}
      <PageHeader title="تقرير حركة التحويلات بين الفروع والمخازن">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="border shadow-sm bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>إجمالي عمليات التحويل</span>
              <ArrowRightLeft className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-blue-700 dark:text-blue-400">
              {summary.totalTransfers}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              إذن تحويل بين الفروع
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-indigo-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>إجمالي الوحدات المحولة</span>
              <Boxes className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-indigo-700 dark:text-indigo-400">
              {summary.totalQtyTransferred.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              قطعة بضاعة تم نقلها
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>تحويلات مكتملة ومستلمة</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {summary.completedCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              تم تسليمها للفرع المستلم بنجاح
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>بضاعة في الطريق / معلقة</span>
              <Truck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400">
              {summary.inTransitCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              قيد الشحن أو بانتظار تأكيد الاستلام
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
              <span>فلاتر حركات التحويل</span>
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
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">من مخزن / فرع</Label>
              <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل المخازن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المخازن</SelectItem>
                  {allWarehousesList.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">إلى مخزن / فرع</Label>
              <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل المخازن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المخازن</SelectItem>
                  {allWarehousesList.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">حالة التحويل</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="completed">مكتمل ومستلم</SelectItem>
                  <SelectItem value="in_transit">قيد النقل / معلق</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">بحث برقم الإذن أو الملاحظات</Label>
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

      {/* 4. Table */}
      <Card className="border shadow-sm">
        <CardHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              سجل أذونات التحويل بين الفروع ({filteredTransfers.length} عملية)
            </CardTitle>
            <Badge variant="outline" className="text-xs font-mono">
              إجمالي الكمية: {summary.totalQtyTransferred.toLocaleString()} قطعة
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 text-xs">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>رقم إذن التحويل</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>من مخزن</TableHead>
                  <TableHead>إلى مخزن</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center font-mono">عدد الأصناف</TableHead>
                  <TableHead className="text-center font-mono font-bold">الكمية الإجمالية</TableHead>
                  <TableHead>الملاحظات</TableHead>
                  <TableHead className="w-20 text-center no-print">التفاصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground text-xs">
                      لا توجد أذونات تحويل مطابقة للفترة المحددة.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransfers.map((tr, idx) => {
                    const isExpanded = expandedTransferId === tr.id;
                    const isCompleted = tr.status === "completed" || tr.status === "received";

                    return (
                      <React.Fragment key={tr.id || idx}>
                        <TableRow className="text-xs hover:bg-muted/40 transition-colors border-b">
                          <TableCell className="text-center font-mono text-muted-foreground font-semibold">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-mono font-bold text-foreground">
                            {tr.receiptNumber}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground text-[11px]">
                            {new Date(tr.date).toLocaleDateString("ar-EG")}
                          </TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {tr.fromWarehouseName}
                          </TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {tr.toWarehouseName}
                          </TableCell>
                          <TableCell className="text-center">
                            {isCompleted ? (
                              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-300">
                                مكتمل ومستلم
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-300">
                                قيد النقل
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold">
                            {tr.itemsCount} صنف
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold text-indigo-700 dark:text-indigo-400">
                            {tr.itemsTotalQty.toLocaleString()}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-[11px] text-muted-foreground" title={tr.notes}>
                            {tr.notes || "-"}
                          </TableCell>
                          <TableCell className="text-center no-print">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedTransferForModal(tr)}
                                className="h-7 w-7 p-0"
                                title="عرض التفاصيل"
                              >
                                <Eye className="h-3.5 w-3.5 text-primary" />
                              </Button>
                              {tr.items.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setExpandedTransferId(isExpanded ? null : tr.id)}
                                  className="h-7 w-7 p-0"
                                  title="إظهار الأصناف"
                                >
                                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expandable items row */}
                        {isExpanded && tr.items.length > 0 && (
                          <TableRow className="bg-muted/20 border-b">
                            <TableCell colSpan={10} className="p-3 pr-12">
                              <div className="bg-background border rounded-lg p-3 shadow-xs">
                                <div className="text-[11px] font-bold text-muted-foreground mb-2">
                                  أصناف إذن التحويل ({tr.receiptNumber}):
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/40 text-[11px]">
                                      <TableHead className="w-8">#</TableHead>
                                      <TableHead>كود الصنف</TableHead>
                                      <TableHead>اسم الصنف</TableHead>
                                      <TableHead className="text-center">الكمية المحولة</TableHead>
                                      <TableHead className="text-center">الوحدة</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {tr.items.map((it: any, iIdx: number) => {
                                      const qty = Number(it.qty || it.Qty || it.quantity || it.Quantity || 0);

                                      return (
                                        <TableRow key={iIdx} className="text-xs hover:bg-muted/30">
                                          <TableCell className="text-center font-mono text-muted-foreground">{iIdx + 1}</TableCell>
                                          <TableCell className="font-mono text-[11px] text-muted-foreground">{it.code || it.itemCode || "-"}</TableCell>
                                          <TableCell className="font-semibold">{it.name || it.itemName || it.ItemName}</TableCell>
                                          <TableCell className="text-center font-mono font-bold text-primary">{qty.toLocaleString()}</TableCell>
                                          <TableCell className="text-center text-[11px] text-muted-foreground">{it.unit || "قطعة"}</TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
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
                  <TableCell colSpan={7} className="text-right">
                    إجمالي نتائج التقرير:
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm font-black text-indigo-700 dark:text-indigo-400">
                    {summary.totalQtyTransferred.toLocaleString()} قطعة
                  </TableCell>
                  <TableCell colSpan={2}></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 5. Modal */}
      {selectedTransferForModal && (
        <Dialog open={!!selectedTransferForModal} onOpenChange={(open) => !open && setSelectedTransferForModal(null)}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader className="border-b pb-3">
              <DialogTitle className="text-base font-bold flex items-center justify-between">
                <span>تفاصيل إذن التحويل المخزني</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedTransferForModal.receiptNumber}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                تاريخ: {new Date(selectedTransferForModal.date).toLocaleDateString("ar-EG")}
              </DialogDescription>
            </DialogHeader>

            <div className="py-3 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-muted/30 p-3 rounded-lg text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">المخزن المصدر (من):</span>
                  <span className="font-bold">{selectedTransferForModal.fromWarehouseName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">المخزن المستلم (إلى):</span>
                  <span className="font-bold">{selectedTransferForModal.toWarehouseName}</span>
                </div>
              </div>

              {selectedTransferForModal.notes && (
                <div className="text-xs bg-muted/20 p-2.5 rounded border">
                  <span className="font-bold text-muted-foreground ml-1">ملاحظات التحويل:</span>
                  <span>{selectedTransferForModal.notes}</span>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold mb-2">الأصناف المحولة ({selectedTransferForModal.items.length}):</h4>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40 text-[11px]">
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>الصنف</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-center">الوحدة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs">
                      {selectedTransferForModal.items.map((it: any, iIdx: number) => (
                        <TableRow key={iIdx}>
                          <TableCell className="font-mono text-muted-foreground">{iIdx + 1}</TableCell>
                          <TableCell className="font-semibold">{it.name || it.itemName || it.ItemName}</TableCell>
                          <TableCell className="text-center font-mono font-bold text-primary">
                            {Number(it.qty || it.quantity || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">{it.unit || "قطعة"}</TableCell>
                        </TableRow>
                      ))}
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

