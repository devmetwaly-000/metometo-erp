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
  Boxes,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Package,
  Search,
  Scale,
  Building2,
  ShieldAlert
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { calculateStockForItemInWarehouse } from "@/lib/inventory-utils";

export default function InventoryValuationReportPage() {
  const allDataContext = useData();
  const { items: allItems, warehouses, inventoryZones, loading } = allDataContext;

  const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");
  const [stockHealthFilter, setStockHealthFilter] = useState<"all" | "reorder" | "out_of_stock" | "negative" | "adequate">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const allWarehousesList = useMemo(() => {
    return [...(warehouses || []), ...(inventoryZones || [])];
  }, [warehouses, inventoryZones]);

  // Compute stock and valuation for each item
  const { rows, summary } = useMemo(() => {
    let totalCostValuation = 0;
    let totalRetailValuation = 0;
    let reorderCount = 0;
    let outOfStockCount = 0;
    let negativeCount = 0;
    let totalItemsQty = 0;

    const list: any[] = [];

    (allItems || []).forEach((item: any) => {
      let qty = 0;

      if (selectedWarehouseId === "all") {
        // Sum stock across all warehouses
        for (const wh of allWarehousesList) {
          qty += calculateStockForItemInWarehouse(item.id, wh.id, allDataContext);
        }
      } else {
        qty = calculateStockForItemInWarehouse(item.id, selectedWarehouseId, allDataContext);
      }

      const cost = Number(item.cost || item.Cost || item.purchasePrice || 0) || 0;
      const price = Number(item.price || item.Price || item.sellingPrice || 0) || 0;
      const reorderPoint = Number(item.reorderPoint || item.ReorderPoint || item.minStock || 0) || 0;

      const totalCost = qty * cost;
      const totalRetail = qty * price;
      const potentialProfit = totalRetail - totalCost;

      // Status classification
      let health: "adequate" | "reorder" | "out_of_stock" | "negative" = "adequate";
      if (qty < 0) {
        health = "negative";
        negativeCount++;
      } else if (qty === 0) {
        health = "out_of_stock";
        outOfStockCount++;
      } else if (reorderPoint > 0 && qty <= reorderPoint) {
        health = "reorder";
        reorderCount++;
      }

      if (qty > 0) {
        totalCostValuation += totalCost;
        totalRetailValuation += totalRetail;
        totalItemsQty += qty;
      }

      // Filter by stock health
      if (stockHealthFilter !== "all" && health !== stockHealthFilter) {
        return;
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const code = (item.code || item.Code || "").toLowerCase();
        const name = (item.name || item.Name || "").toLowerCase();
        if (!code.includes(q) && !name.includes(q)) {
          return;
        }
      }

      list.push({
        id: item.id,
        code: item.code || item.Code || "-",
        name: item.name || item.Name,
        category: item.categoryName || item.category || "-",
        unit: item.unit || item.baseUnit || "قطعة",
        qty,
        cost,
        price,
        reorderPoint,
        totalCost,
        totalRetail,
        potentialProfit,
        health
      });
    });

    // Sort by total cost valuation descending
    list.sort((a, b) => b.totalCost - a.totalCost);

    return {
      rows: list,
      summary: {
        totalCostValuation,
        totalRetailValuation,
        potentialProfit: totalRetailValuation - totalCostValuation,
        totalItemsQty,
        reorderCount,
        outOfStockCount,
        negativeCount,
        totalCatalogItems: allItems?.length || 0
      }
    };
  }, [allItems, selectedWarehouseId, stockHealthFilter, searchQuery, allWarehousesList, allDataContext]);

  // Export to Excel
  const handleExportExcel = () => {
    const dataToExport = rows.map((r, idx) => ({
      "م": idx + 1,
      "كود الصنف": r.code,
      "اسم الصنف": r.name,
      "التصنيف": r.category,
      "الوحدة": r.unit,
      "الرصيد الحالي": r.qty,
      "حد إعادة الطلب": r.reorderPoint,
      "سعر التكلفة": r.cost,
      "سعر البيع": r.price,
      "إجمالي قيمة التكلفة": r.totalCost,
      "إجمالي القيمة بسعر البيع": r.totalRetail,
      "الربح المتوقع": r.potentialProfit,
      "حالة المخزون": r.health === "reorder" ? "في حد الطلب" : r.health === "out_of_stock" ? "نفد من المخزن" : r.health === "negative" ? "سالب" : "كافي"
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقييم المخزون والنواقص");
    XLSX.writeFile(wb, `تقييم_المخزون_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-32 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse font-medium">جاري احتساب أرصدة وتقييم المخزون لكافة الفروع...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full pb-10 space-y-6">
      {/* 1. Header with Actions */}
      <PageHeader title="تقرير تقييم المخزون وحد إعادة الطلب والنواقص">
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
              <span>قيمة المخزون (سعر التكلفة)</span>
              <Boxes className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-blue-700 dark:text-blue-400">
              {summary.totalCostValuation.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              رأس المال المستثمر في البضاعة
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-indigo-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>قيمة المخزون (سعر البيع)</span>
              <DollarSign className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-indigo-700 dark:text-indigo-400">
              {summary.totalRetailValuation.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              القيمة البيعية الإجمالية للبضاعة
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>هامش الربح المتوقع بالمخزن</span>
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {summary.potentialProfit.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              الأرباح المحققة عند بيع كامل المخزون
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>نواقص وحد إعادة الطلب</span>
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400">
              {summary.reorderCount} صنف
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              أصناف بلغت الحد الأدنى وتتطلب أمر شراء
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-rose-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>أصناف نفدت بالكامل</span>
              <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-rose-700 dark:text-rose-400">
              {summary.outOfStockCount} صنف
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              رصيد صفر (غير متوفرة للبيع)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Filter Bar */}
      <Card className="border shadow-sm no-print">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-primary" />
            <span>خيارات وفلاتر التقييم والمخازن</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">الفرع / المستودع</Label>
              <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل الفروع والمخازن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع والمخازن (مجمع)</SelectItem>
                  {allWarehousesList.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">حالة رصيد الصنف وتنبيه الطلب</Label>
              <Select value={stockHealthFilter} onValueChange={(v: any) => setStockHealthFilter(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل الأصناف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأصناف ({summary.totalCatalogItems})</SelectItem>
                  <SelectItem value="reorder">نواقص بلغت حد إعادة الطلب ({summary.reorderCount})</SelectItem>
                  <SelectItem value="out_of_stock">أصناف نفدت تماماً رصيد صفر ({summary.outOfStockCount})</SelectItem>
                  <SelectItem value="negative">أرصدة سالبة ({summary.negativeCount})</SelectItem>
                  <SelectItem value="adequate">أرصدة كافية وطبيعية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">بحث باسم أو كود الصنف</Label>
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
            <div>
              <CardTitle className="text-sm font-semibold">
                جدول تقييم أصناف المخزون والنواقص ({rows.length} صنف)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                مرتبة تنازلياً حسب أعلى قيمة تكلفة مستثمرة
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              إجمالي القطع في المخزن: {summary.totalItemsQty.toLocaleString()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 text-xs">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>كود الصنف</TableHead>
                  <TableHead>اسم الصنف</TableHead>
                  <TableHead className="text-center">الوحدة</TableHead>
                  <TableHead className="text-center font-mono">الرصيد الحالي</TableHead>
                  <TableHead className="text-center font-mono">حد الطلب</TableHead>
                  <TableHead className="text-center">حالة الرصيد</TableHead>
                  <TableHead className="text-left font-mono">سعر التكلفة</TableHead>
                  <TableHead className="text-left font-mono">سعر البيع</TableHead>
                  <TableHead className="text-left font-mono font-bold">قيمة التكلفة</TableHead>
                  <TableHead className="text-left font-mono font-bold">القيمة البيعية</TableHead>
                  <TableHead className="text-left font-mono font-bold">الربح المتوقع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12 text-muted-foreground text-xs">
                      لا توجد أصناف مطابقة للبحث أو الفلتر المحدد.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r, idx) => (
                    <TableRow key={r.id || idx} className="text-xs hover:bg-muted/40 transition-colors border-b">
                      <TableCell className="text-center font-mono text-muted-foreground font-semibold">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground text-[11px]">
                        {r.code}
                      </TableCell>
                      <TableCell className="font-bold text-foreground">
                        {r.name}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground text-[11px]">
                        {r.unit}
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold text-sm">
                        <span className={r.qty <= 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}>
                          {r.qty.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono text-muted-foreground">
                        {r.reorderPoint > 0 ? r.reorderPoint : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.health === "reorder" && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-300">
                            حد الطلب
                          </Badge>
                        )}
                        {r.health === "out_of_stock" && (
                          <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-300">
                            منتهي
                          </Badge>
                        )}
                        {r.health === "negative" && (
                          <Badge variant="destructive" className="text-[10px]">
                            سالب
                          </Badge>
                        )}
                        {r.health === "adequate" && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-300">
                            كافي
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-left font-mono">
                        {r.cost.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-left font-mono">
                        {r.price.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-left font-mono font-bold text-blue-700 dark:text-blue-400">
                        {r.totalCost.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-left font-mono font-bold text-indigo-700 dark:text-indigo-400">
                        {r.totalRetail.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-left font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {r.potentialProfit.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter className="bg-muted/60 text-xs font-bold border-t-2">
                <TableRow>
                  <TableCell colSpan={9} className="text-right">
                    إجمالي تقييم الأصناف المعروضة:
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-blue-700 dark:text-blue-400">
                    {summary.totalCostValuation.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-indigo-700 dark:text-indigo-400">
                    {summary.totalRetailValuation.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-emerald-700 dark:text-emerald-400">
                    {summary.potentialProfit.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

