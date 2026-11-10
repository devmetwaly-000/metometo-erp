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
  Scale,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Trash2,
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

export default function InventoryAdjustmentsReportPage() {
  const { stockAdjustmentRecords, warehouses, inventoryZones, items, loading } = useData();

  // Filters State
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");
  const [adjustmentTypeFilter, setAdjustmentTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedAdjForModal, setSelectedAdjForModal] = useState<any | null>(null);

  const allWarehousesList = useMemo(() => {
    return [...(warehouses || []), ...(inventoryZones || [])];
  }, [warehouses, inventoryZones]);

  const warehousesMap = useMemo(() => {
    const map = new Map<string, string>();
    allWarehousesList.forEach((w: any) => map.set(w.id, w.name));
    return map;
  }, [allWarehousesList]);

  const itemsCostMap = useMemo(() => {
    const map = new Map<string, number>();
    (items || []).forEach((it: any) => map.set(it.id, Number(it.cost || it.Cost || 0)));
    return map;
  }, [items]);

  // Extract items
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

  // Filter and process adjustments
  const { filteredAdjustments, summary } = useMemo(() => {
    const start = fromDate ? new Date(fromDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    const end = toDate ? new Date(toDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    let totalShortageCost = 0;
    let totalSurplusCost = 0;
    let totalDamagedCost = 0;

    const list = (stockAdjustmentRecords || []).filter((adj: any) => {
      const d = new Date(adj.date || adj.Date || adj.createdAt || adj.CreatedAt);
      if (start && d < start) return false;
      if (end && d > end) return false;

      const whId = adj.warehouseId || adj.WarehouseId;
      if (selectedWarehouseId !== "all" && whId !== selectedWarehouseId) return false;

      const reason = String(adj.reason || adj.Reason || "").toLowerCase();
      if (adjustmentTypeFilter !== "all") {
        if (adjustmentTypeFilter === "shortage" && !reason.includes("عجز") && !reason.includes("shortage")) return false;
        if (adjustmentTypeFilter === "surplus" && !reason.includes("زيادة") && !reason.includes("surplus")) return false;
        if (adjustmentTypeFilter === "damage" && !reason.includes("تلف") && !reason.includes("إعدام") && !reason.includes("damage")) return false;
      }

      const receiptNum = String(adj.receiptNumber || adj.ReceiptNumber || adj.id || adj.Id || "");
      const notes = String(adj.notes || adj.Notes || "");
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!receiptNum.toLowerCase().includes(q) && !reason.toLowerCase().includes(q) && !notes.toLowerCase().includes(q)) {
          return false;
        }
      }

      return true;
    }).map((adj: any) => {
      const rawItems = extractItems(adj);
      let adjShortageCost = 0;
      let adjSurplusCost = 0;
      let adjDamagedCost = 0;

      const processedItems = rawItems.map((it: any) => {
        const diff = Number(it.difference || it.adjustmentQty || it.diff || 0);
        const cost = Number(it.cost || it.Cost || itemsCostMap.get(it.itemId || it.id) || 0);
        const costDiff = diff * cost;
        const itReason = String(it.reason || adj.reason || "").toLowerCase();

        if (itReason.includes("تلف") || itReason.includes("إعدام") || itReason.includes("damage")) {
          adjDamagedCost += Math.abs(costDiff);
        } else if (diff < 0) {
          adjShortageCost += Math.abs(costDiff);
        } else {
          adjSurplusCost += costDiff;
        }

        return {
          ...it,
          diff,
          cost,
          costDiff,
          currentStock: Number(it.currentStock || it.systemQty || 0),
          newStock: Number(it.newStock || it.physicalQty || 0)
        };
      });

      totalShortageCost += adjShortageCost;
      totalSurplusCost += adjSurplusCost;
      totalDamagedCost += adjDamagedCost;

      const netCost = adjSurplusCost - adjShortageCost - adjDamagedCost;

      return {
        id: adj.id || adj.Id,
        receiptNumber: adj.receiptNumber || adj.ReceiptNumber || adj.id || "-",
        date: adj.date || adj.Date || adj.createdAt || adj.CreatedAt,
        warehouseId: adj.warehouseId || adj.WarehouseId,
        warehouseName: warehousesMap.get(adj.warehouseId || adj.WarehouseId) || adj.branchName || "المخزن الرئيسي",
        reason: adj.reason || adj.Reason || "تسوية جردية",
        createdByName: adj.createdByName || adj.CreatedByName || adj.userName || "-",
        notes: adj.notes || adj.Notes || "",
        items: processedItems,
        itemsCount: processedItems.length,
        shortageCost: adjShortageCost,
        surplusCost: adjSurplusCost,
        damagedCost: adjDamagedCost,
        netCost
      };
    });

    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      filteredAdjustments: list,
      summary: {
        totalAdjustments: list.length,
        totalShortageCost,
        totalSurplusCost,
        totalDamagedCost,
        netCostDifference: totalSurplusCost - totalShortageCost - totalDamagedCost
      }
    };
  }, [stockAdjustmentRecords, fromDate, toDate, selectedWarehouseId, adjustmentTypeFilter, searchQuery, warehousesMap, itemsCostMap]);

  // Export to Excel
  const handleExportExcel = () => {
    const dataToExport = filteredAdjustments.map((adj, idx) => ({
      "م": idx + 1,
      "رقم إذن التسوية": adj.receiptNumber,
      "التاريخ": new Date(adj.date).toLocaleDateString("ar-EG"),
      "المخزن / الفرع": adj.warehouseName,
      "السبب / النوع": adj.reason,
      "تكلفة العجز": adj.shortageCost,
      "قيمة الزيادة": adj.surplusCost,
      "تكلفة التالف والمعدم": adj.damagedCost,
      "صافي الفارق المالي": adj.netCost,
      "عدد الأصناف": adj.itemsCount,
      "المسؤول": adj.createdByName,
      "ملاحظات": adj.notes || ""
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تسويات_المخزون_والجرد");
    XLSX.writeFile(wb, `تسويات_المخزون_${todayStr}.xlsx`);
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
        <p className="text-sm text-muted-foreground animate-pulse font-medium">جاري فحص وتجميع تسويات الجرد والعجز المخزني...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full pb-10 space-y-6">
      {/* 1. Header with Actions */}
      <PageHeader title="تقرير تسويات الجرد والعجز والزيادة والإعدامات">
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
        <Card className="border shadow-sm bg-gradient-to-br from-rose-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>تكلفة العجز المخزني</span>
              <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-400">
              {summary.totalShortageCost.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              خسائر عجز في الكميات المطابقة للجرد
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>تكلفة التالف والإعدامات</span>
              <Trash2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400">
              {summary.totalDamagedCost.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              بضاعة تم إعدامها وتخريدها
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>قيمة الزيادة في الجرد</span>
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {summary.totalSurplusCost.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              فروقات زيادة مسجلة في المخزون
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>صافي الفارق المالي للتسويات</span>
              <Scale className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className={cn(
              "text-2xl font-bold font-mono",
              summary.netCostDifference < 0 ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
            )}>
              {summary.netCostDifference.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              الأثر النهائي على الأرباح والخسائر
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
              <span>فلاتر تقرير الجرد والتسويات</span>
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
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">الفرع / المخزن</Label>
              <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل المخازن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المخازن والفروع</SelectItem>
                  {allWarehousesList.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">نوع التسوية</Label>
              <Select value={adjustmentTypeFilter} onValueChange={setAdjustmentTypeFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل الأنواع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  <SelectItem value="shortage">عجز جرد فقط</SelectItem>
                  <SelectItem value="surplus">زيادة جرد فقط</SelectItem>
                  <SelectItem value="damage">إعدامات وتوالف فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Table */}
      <Card className="border shadow-sm">
        <CardHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              سجل أذونات التسوية المخزنية والجرد ({filteredAdjustments.length} عملية)
            </CardTitle>
            <Badge variant="outline" className="text-xs font-mono">
              صافي الفارق: {summary.netCostDifference.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 text-xs">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>رقم الإذن</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>المخزن / الفرع</TableHead>
                  <TableHead>السبب / البيان</TableHead>
                  <TableHead className="text-center font-mono">الأصناف</TableHead>
                  <TableHead className="text-left font-mono text-rose-600">تكلفة العجز</TableHead>
                  <TableHead className="text-left font-mono text-amber-600">تكلفة التالف</TableHead>
                  <TableHead className="text-left font-mono text-emerald-600">قيمة الزيادة</TableHead>
                  <TableHead className="text-left font-mono font-bold">صافي الأثر</TableHead>
                  <TableHead className="w-20 text-center no-print">التفاصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAdjustments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground text-xs">
                      لا توجد أذونات تسوية جردية مطابقة للفترة المحددة.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAdjustments.map((adj, idx) => {
                    const isExpanded = expandedId === adj.id;

                    return (
                      <React.Fragment key={adj.id || idx}>
                        <TableRow className="text-xs hover:bg-muted/40 transition-colors border-b">
                          <TableCell className="text-center font-mono text-muted-foreground font-semibold">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-mono font-bold text-foreground">
                            {adj.receiptNumber}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground text-[11px]">
                            {new Date(adj.date).toLocaleDateString("ar-EG")}
                          </TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {adj.warehouseName}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                              {adj.reason}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold">
                            {adj.itemsCount}
                          </TableCell>
                          <TableCell className="text-left font-mono text-rose-600 dark:text-rose-400 font-semibold">
                            {adj.shortageCost > 0 ? adj.shortageCost.toLocaleString("ar-EG", { minimumFractionDigits: 2 }) : "-"}
                          </TableCell>
                          <TableCell className="text-left font-mono text-amber-600 dark:text-amber-400 font-semibold">
                            {adj.damagedCost > 0 ? adj.damagedCost.toLocaleString("ar-EG", { minimumFractionDigits: 2 }) : "-"}
                          </TableCell>
                          <TableCell className="text-left font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            {adj.surplusCost > 0 ? adj.surplusCost.toLocaleString("ar-EG", { minimumFractionDigits: 2 }) : "-"}
                          </TableCell>
                          <TableCell className={cn(
                            "text-left font-mono font-bold",
                            adj.netCost < 0 ? "text-rose-600" : "text-emerald-600"
                          )}>
                            {adj.netCost.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center no-print">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedAdjForModal(adj)}
                                className="h-7 w-7 p-0"
                                title="عرض التفاصيل"
                              >
                                <Eye className="h-3.5 w-3.5 text-primary" />
                              </Button>
                              {adj.items.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setExpandedId(isExpanded ? null : adj.id)}
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
                        {isExpanded && adj.items.length > 0 && (
                          <TableRow className="bg-muted/20 border-b">
                            <TableCell colSpan={11} className="p-3 pr-12">
                              <div className="bg-background border rounded-lg p-3 shadow-xs">
                                <div className="text-[11px] font-bold text-muted-foreground mb-2">
                                  فروقات أصناف التسوية ({adj.receiptNumber}):
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/40 text-[11px]">
                                      <TableHead className="w-8">#</TableHead>
                                      <TableHead>الصنف</TableHead>
                                      <TableHead className="text-center font-mono">الرصيد الدفتري</TableHead>
                                      <TableHead className="text-center font-mono">الرصيد الفعلي بعد الجرد</TableHead>
                                      <TableHead className="text-center font-mono">فارق الكمية</TableHead>
                                      <TableHead className="text-left font-mono">التكلفة</TableHead>
                                      <TableHead className="text-left font-mono font-bold">الأثر المالي</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {adj.items.map((it: any, iIdx: number) => (
                                      <TableRow key={iIdx} className="text-xs hover:bg-muted/30">
                                        <TableCell className="text-center font-mono text-muted-foreground">{iIdx + 1}</TableCell>
                                        <TableCell className="font-semibold">{it.name || it.itemName || it.ItemName}</TableCell>
                                        <TableCell className="text-center font-mono">{it.currentStock}</TableCell>
                                        <TableCell className="text-center font-mono font-bold">{it.newStock}</TableCell>
                                        <TableCell className={cn(
                                          "text-center font-mono font-bold",
                                          it.diff < 0 ? "text-rose-600" : "text-emerald-600"
                                        )}>
                                          {it.diff > 0 ? `+${it.diff}` : it.diff}
                                        </TableCell>
                                        <TableCell className="text-left font-mono">{it.cost.toLocaleString()}</TableCell>
                                        <TableCell className={cn(
                                          "text-left font-mono font-bold",
                                          it.costDiff < 0 ? "text-rose-600" : "text-emerald-600"
                                        )}>
                                          {it.costDiff.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                                        </TableCell>
                                      </TableRow>
                                    ))}
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
                  <TableCell colSpan={6} className="text-right">
                    إجمالي نتائج التسويات:
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-rose-600">
                    {summary.totalShortageCost.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-amber-600">
                    {summary.totalDamagedCost.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-emerald-600">
                    {summary.totalSurplusCost.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell className={cn(
                    "text-left font-mono text-sm font-black",
                    summary.netCostDifference < 0 ? "text-rose-600" : "text-emerald-600"
                  )}>
                    {summary.netCostDifference.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 5. Modal */}
      {selectedAdjForModal && (
        <Dialog open={!!selectedAdjForModal} onOpenChange={(open) => !open && setSelectedAdjForModal(null)}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader className="border-b pb-3">
              <DialogTitle className="text-base font-bold flex items-center justify-between">
                <span>تفاصيل إذن التسوية المخزنية</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedAdjForModal.receiptNumber}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                تاريخ: {new Date(selectedAdjForModal.date).toLocaleDateString("ar-EG")} | المخزن: {selectedAdjForModal.warehouseName}
              </DialogDescription>
            </DialogHeader>

            <div className="py-3 space-y-4">
              <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-lg text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">السبب / البيان:</span>
                  <span className="font-bold">{selectedAdjForModal.reason}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">المسؤول عن التسجيل:</span>
                  <span className="font-bold">{selectedAdjForModal.createdByName}</span>
                </div>
              </div>

              {selectedAdjForModal.notes && (
                <div className="text-xs bg-muted/20 p-2.5 rounded border">
                  <span className="font-bold text-muted-foreground ml-1">ملاحظات:</span>
                  <span>{selectedAdjForModal.notes}</span>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold mb-2">الأصناف والتسويات ({selectedAdjForModal.items.length}):</h4>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40 text-[11px]">
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>الصنف</TableHead>
                        <TableHead className="text-center font-mono">الفعلي</TableHead>
                        <TableHead className="text-center font-mono">الفارق</TableHead>
                        <TableHead className="text-left font-mono font-bold">التكلفة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs">
                      {selectedAdjForModal.items.map((it: any, iIdx: number) => (
                        <TableRow key={iIdx}>
                          <TableCell className="font-mono text-muted-foreground">{iIdx + 1}</TableCell>
                          <TableCell className="font-semibold">{it.name || it.itemName || it.ItemName}</TableCell>
                          <TableCell className="text-center font-mono font-bold">{it.newStock}</TableCell>
                          <TableCell className={cn(
                            "text-center font-mono font-bold",
                            it.diff < 0 ? "text-rose-600" : "text-emerald-600"
                          )}>
                            {it.diff > 0 ? `+${it.diff}` : it.diff}
                          </TableCell>
                          <TableCell className={cn(
                            "text-left font-mono font-bold",
                            it.costDiff < 0 ? "text-rose-600" : "text-emerald-600"
                          )}>
                            {it.costDiff.toLocaleString()} ج.م
                          </TableCell>
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

