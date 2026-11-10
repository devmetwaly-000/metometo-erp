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
  Flame,
  Snowflake,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Package,
  Search,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  Boxes
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculateStockForItemInWarehouse } from "@/lib/inventory-utils";

export default function FastSlowMovingReportPage() {
  const allDataContext = useData();
  const { salesInvoices, posSales, items: allItems, warehouses, inventoryZones, loading } = allDataContext;

  // Filters State
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const fromDefault = thirtyDaysAgo.toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(fromDefault);
  const [toDate, setToDate] = useState(todayStr);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");
  const [activeTab, setActiveTab] = useState("fast");
  const [searchQuery, setSearchQuery] = useState("");

  const allWarehousesList = useMemo(() => {
    return [...(warehouses || []), ...(inventoryZones || [])];
  }, [warehouses, inventoryZones]);

  // Aggregate Sales and Stock per Item
  const { fastMovingList, slowMovingList, summary } = useMemo(() => {
    const start = fromDate ? new Date(fromDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    const end = toDate ? new Date(toDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    // Map: ItemId -> { qtySold, revenue, costOfSold }
    const salesMap = new Map<string, { qtySold: number; revenue: number; costOfSold: number }>();

    const recordSaleItem = (itemId: string, qty: number, price: number, cost: number) => {
      if (!itemId) return;
      const existing = salesMap.get(itemId) || { qtySold: 0, revenue: 0, costOfSold: 0 };
      existing.qtySold += qty;
      existing.revenue += (qty * price);
      existing.costOfSold += (qty * cost);
      salesMap.set(itemId, existing);
    };

    // 1. Process Sales Invoices
    (salesInvoices || []).forEach((inv: any) => {
      const d = new Date(inv.date || inv.Date);
      if (start && d < start) return;
      if (end && d > end) return;
      if (selectedWarehouseId !== "all" && inv.warehouseId !== selectedWarehouseId && inv.WarehouseId !== selectedWarehouseId) {
        return;
      }

      const items = Array.isArray(inv.items) ? inv.items : (inv.ItemsJson ? JSON.parse(inv.ItemsJson) : []);
      items.forEach((it: any) => {
        const id = it.itemId || it.id || it.ItemId;
        const qty = Number(it.qty || it.quantity || it.Qty || 0);
        const price = Number(it.price || it.unitPrice || it.Price || 0);
        const cost = Number(it.cost || it.Cost || 0);
        recordSaleItem(id, qty, price, cost);
      });
    });

    // 2. Process POS Sales
    (posSales || []).forEach((sale: any) => {
      const d = new Date(sale.date || sale.Date);
      if (start && d < start) return;
      if (end && d > end) return;
      if (selectedWarehouseId !== "all" && sale.warehouseId !== selectedWarehouseId && sale.WarehouseId !== selectedWarehouseId) {
        return;
      }

      const items = Array.isArray(sale.items) ? sale.items : (sale.ItemsJson ? JSON.parse(sale.ItemsJson) : []);
      items.forEach((it: any) => {
        const id = it.itemId || it.id || it.ItemId;
        const qty = Number(it.qty || it.quantity || it.Qty || 0);
        const price = Number(it.price || it.unitPrice || it.Price || 0);
        const cost = Number(it.cost || it.Cost || 0);
        recordSaleItem(id, qty, price, cost);
      });
    });

    // Classify all catalog items
    const fastList: any[] = [];
    const slowList: any[] = [];
    let fastRevenue = 0;
    let fastProfit = 0;
    let deadStockFrozenCapital = 0;
    let topProfitItemName = "-";
    let topProfitItemVal = 0;

    (allItems || []).forEach((item: any) => {
      let currentStock = 0;
      if (selectedWarehouseId === "all") {
        for (const wh of allWarehousesList) {
          currentStock += calculateStockForItemInWarehouse(item.id, wh.id, allDataContext);
        }
      } else {
        currentStock = calculateStockForItemInWarehouse(item.id, selectedWarehouseId, allDataContext);
      }

      const cost = Number(item.cost || item.Cost || item.purchasePrice || 0) || 0;
      const price = Number(item.price || item.Price || item.sellingPrice || 0) || 0;
      const sales = salesMap.get(item.id);

      const code = item.code || item.Code || "-";
      const name = item.name || item.Name;
      const category = item.categoryName || item.category || "-";

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!code.toLowerCase().includes(q) && !name.toLowerCase().includes(q)) {
          return;
        }
      }

      if (sales && sales.qtySold > 0) {
        // Fast / Active item
        const profit = sales.revenue - sales.costOfSold;
        const marginPct = sales.revenue > 0 ? (profit / sales.revenue) * 100 : 0;

        fastRevenue += sales.revenue;
        fastProfit += profit;
        if (profit > topProfitItemVal) {
          topProfitItemVal = profit;
          topProfitItemName = name;
        }

        fastList.push({
          id: item.id,
          code,
          name,
          category,
          unit: item.unit || "قطعة",
          qtySold: sales.qtySold,
          revenue: sales.revenue,
          profit,
          marginPct,
          currentStock,
          cost,
          price
        });
      } else if (currentStock > 0) {
        // Dead / Slow-moving item (has stock on shelf but 0 sales in period)
        const frozenValue = currentStock * cost;
        deadStockFrozenCapital += frozenValue;

        slowList.push({
          id: item.id,
          code,
          name,
          category,
          unit: item.unit || "قطعة",
          currentStock,
          cost,
          price,
          frozenValue,
          retailValue: currentStock * price
        });
      }
    });

    // Sort fast list descending by revenue
    fastList.sort((a, b) => b.revenue - a.revenue);

    // Sort slow list descending by frozen capital
    slowList.sort((a, b) => b.frozenValue - a.frozenValue);

    return {
      fastMovingList: fastList,
      slowMovingList: slowList,
      summary: {
        fastRevenue,
        fastProfit,
        deadStockFrozenCapital,
        fastItemsCount: fastList.length,
        deadItemsCount: slowList.length,
        topProfitItemName,
        topProfitItemVal
      }
    };
  }, [salesInvoices, posSales, allItems, fromDate, toDate, selectedWarehouseId, searchQuery, allWarehousesList, allDataContext]);

  // Export to Excel
  const handleExportExcel = () => {
    let dataToExport: any[] = [];
    if (activeTab === "fast") {
      dataToExport = fastMovingList.map((r, idx) => ({
        "م": idx + 1,
        "كود الصنف": r.code,
        "اسم الصنف": r.name,
        "التصنيف": r.category,
        "الوحدة": r.unit,
        "الكمية المباعة": r.qtySold,
        "إجمالي الإيراد": r.revenue,
        "مجمل الربح": r.profit,
        "نسبة هامش الربح": `${r.marginPct.toFixed(1)}%`,
        "الرصيد المتبقي بالمخزن": r.currentStock
      }));
    } else {
      dataToExport = slowMovingList.map((r, idx) => ({
        "م": idx + 1,
        "كود الصنف": r.code,
        "اسم الصنف": r.name,
        "التصنيف": r.category,
        "الوحدة": r.unit,
        "الرصيد الراكد بالمخزن": r.currentStock,
        "سعر التكلفة": r.cost,
        "رأس المال المجمد (تكلفة)": r.frozenValue,
        "القيمة بسعر البيع": r.retailValue,
        "الإجراء المقترح": "عمل خصم / تصفية / إيقاف إعادة الطلب"
      }));
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab === "fast" ? "الأكثر مبيعا" : "الأصناف الراكدة");
    XLSX.writeFile(wb, `تقرير_${activeTab === "fast" ? "الأكثر_مبيعا" : "الراكد"}_${todayStr}.xlsx`);
  };

  const handlePeriod = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    setFromDate(d.toISOString().split("T")[0]);
    setToDate(todayStr);
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-32 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse font-medium">جاري تحليل معدلات دوران المخزون وحركة الأصناف...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full pb-10 space-y-6">
      {/* 1. Header with Actions */}
      <PageHeader title="تقرير الأصناف الأكثر طلباً ومبيعاً والأصناف الراكدة">
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
        <Card className="border shadow-sm bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>مبيعات الأصناف السريعة</span>
              <Flame className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400">
              {summary.fastRevenue.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              مجموع {summary.fastItemsCount} صنف نشط مباع
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>أرباح الأصناف السريعة</span>
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {summary.fastProfit.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              مجمل الربح المحقق منها
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>الأصناف الراكدة (بدون مبيعات)</span>
              <Snowflake className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-blue-700 dark:text-blue-400">
              {summary.deadItemsCount} صنف
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              بضاعة بالمخزن لم تتحرك خلال الفترة
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-rose-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>رأس المال المجمد في الراكد</span>
              <DollarSign className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-400">
              {summary.deadStockFrozenCapital.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              سيولة مجمدة تتطلب عروض وتصفيات
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
              <span>فترة التحليل والفروع</span>
            </CardTitle>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handlePeriod(15)}>آخر 15 يوم</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handlePeriod(30)}>آخر 30 يوم</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handlePeriod(60)}>آخر شهرين</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handlePeriod(90)}>آخر 3 أشهر</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handlePeriod(180)}>آخر 6 أشهر</Button>
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
                  <SelectValue placeholder="كل الفروع والمخازن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع والمخازن (مجمع)</SelectItem>
                  {allWarehousesList.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">بحث بالاسم أو الكود</Label>
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

      {/* 4. Tabs: Fast-Moving vs Dead Stock */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 w-80 mb-2">
          <TabsTrigger value="fast" className="text-xs gap-1.5">
            <Flame className="h-3.5 w-3.5 text-amber-500" />
            الأكثر مبيعاً وطلباً ({fastMovingList.length})
          </TabsTrigger>
          <TabsTrigger value="slow" className="text-xs gap-1.5">
            <Snowflake className="h-3.5 w-3.5 text-blue-500" />
            الأصناف الراكدة والمجمدة ({slowMovingList.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Fast Moving Table */}
        <TabsContent value="fast">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-2 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <Flame className="h-4 w-4 text-amber-500" />
                    <span>قائمة الأصناف الأكثر طلباً ومبيعاً</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    مرتبة تنازلياً حسب أعلى إيرادات محققة
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-mono font-bold text-emerald-600">
                  إجمالي الأرباح: {summary.fastProfit.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 text-xs">
                      <TableHead className="w-12 text-center">الترتيب</TableHead>
                      <TableHead>كود الصنف</TableHead>
                      <TableHead>اسم الصنف</TableHead>
                      <TableHead>التصنيف</TableHead>
                      <TableHead className="text-center">الوحدة</TableHead>
                      <TableHead className="text-center font-mono font-bold">الكمية المباعة</TableHead>
                      <TableHead className="text-left font-mono font-bold">إجمالي الإيراد</TableHead>
                      <TableHead className="text-left font-mono font-bold">مجمل الربح</TableHead>
                      <TableHead className="text-center font-mono">هامش الربح</TableHead>
                      <TableHead className="text-center font-mono">الرصيد المتبقي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fastMovingList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground text-xs">
                          لا توجد مبيعات مسجلة خلال الفترة المحددة.
                        </TableCell>
                      </TableRow>
                    ) : (
                      fastMovingList.map((r, idx) => (
                        <TableRow key={r.id || idx} className="text-xs hover:bg-muted/40 transition-colors border-b">
                          <TableCell className="text-center font-mono font-bold text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground text-[11px]">
                            {r.code}
                          </TableCell>
                          <TableCell className="font-bold text-foreground">
                            {r.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-[11px]">
                            {r.category}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground text-[11px]">
                            {r.unit}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold text-amber-700 dark:text-amber-400 text-sm">
                            {r.qtySold.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-left font-mono font-bold text-foreground">
                            {r.revenue.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-left font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {r.profit.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center font-mono">
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-300">
                              {r.marginPct.toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold">
                            <span className={r.currentStock <= 5 ? "text-rose-600" : "text-muted-foreground"}>
                              {r.currentStock.toLocaleString()}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  <TableFooter className="bg-muted/60 text-xs font-bold border-t-2">
                    <TableRow>
                      <TableCell colSpan={6} className="text-right">
                        إجمالي إيرادات وأرباح الأصناف السريعة:
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-foreground">
                        {summary.fastRevenue.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                        {summary.fastProfit.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Dead / Slow Moving Table */}
        <TabsContent value="slow">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-2 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                    <Snowflake className="h-4 w-4" />
                    <span>قائمة الأصناف الراكدة والمجمدة في المخازن</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    أصناف يتوفر لها رصيد بالمخزن ولكن لم تسجل أي حركة بيع خلال الفترة
                  </CardDescription>
                </div>
                <Badge variant="destructive" className="text-xs font-mono">
                  رأس المال المجمد: {summary.deadStockFrozenCapital.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
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
                      <TableHead>التصنيف</TableHead>
                      <TableHead className="text-center">الوحدة</TableHead>
                      <TableHead className="text-center font-mono font-bold">الرصيد الراكد</TableHead>
                      <TableHead className="text-left font-mono">سعر التكلفة</TableHead>
                      <TableHead className="text-left font-mono font-bold">رأس المال المجمد (تكلفة)</TableHead>
                      <TableHead className="text-left font-mono">القيمة بسعر البيع</TableHead>
                      <TableHead className="text-center">التوصية المقترحة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slowMovingList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-emerald-600 font-semibold text-xs">
                          ممتاز! لا توجد أصناف راكدة بدون حركة في مخازن الشركة خلال هذه الفترة.
                        </TableCell>
                      </TableRow>
                    ) : (
                      slowMovingList.map((r, idx) => (
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
                          <TableCell className="text-muted-foreground text-[11px]">
                            {r.category}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground text-[11px]">
                            {r.unit}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold text-blue-700 dark:text-blue-400 text-sm">
                            {r.currentStock.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-left font-mono">
                            {r.cost.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-left font-mono font-bold text-rose-600 dark:text-rose-400">
                            {r.frozenValue.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-left font-mono text-muted-foreground">
                            {r.retailValue.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-300">
                              تخفيض / عرض ترويجي
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  <TableFooter className="bg-muted/60 text-xs font-bold border-t-2">
                    <TableRow>
                      <TableCell colSpan={7} className="text-right">
                        إجمالي رأس المال المجمد في البضاعة الراكدة:
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-rose-600 dark:text-rose-400">
                        {summary.deadStockFrozenCapital.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

