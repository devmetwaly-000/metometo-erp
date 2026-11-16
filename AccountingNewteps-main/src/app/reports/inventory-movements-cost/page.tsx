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
  PackageMinus,
  Trash2,
  Boxes,
  Search,
  Eye,
  Building2,
  AlertTriangle,
  Calendar,
  Layers,
  FileSpreadsheet
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function InventoryCostsReportPage() {
  const {
    stockOutRecords = [],
    stockTransferRecords = [],
    stockAdjustmentRecords = [],
    warehouses = [],
    inventoryZones = [],
    items = [],
    loading
  } = useData();

  // Filters State
  const now = new Date();
  const firstDayOfYear = `${now.getFullYear()}-01-01`;
  const todayStr = now.toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(firstDayOfYear);
  const [toDate, setToDate] = useState(todayStr);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("stock-out");

  // Modal State for details
  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    items: Array<{
      code?: string;
      name: string;
      qty: number;
      unit?: string;
      cost: number;
      totalCost: number;
      reason?: string;
    }>;
    totalCost: number;
  }>({
    isOpen: false,
    title: "",
    subtitle: "",
    items: [],
    totalCost: 0
  });

  // Warehouses map
  const allWarehousesList = useMemo(() => {
    return [...(warehouses || []), ...(inventoryZones || [])];
  }, [warehouses, inventoryZones]);

  const warehousesMap = useMemo(() => {
    const map = new Map<string, string>();
    allWarehousesList.forEach((w: any) => map.set(w.id, w.name));
    return map;
  }, [allWarehousesList]);

  // Items cost & data map
  const itemsMap = useMemo(() => {
    const map = new Map<string, any>();
    (items || []).forEach((it: any) => map.set(it.id, it));
    return map;
  }, [items]);

  const getItemCost = (itemId: string, itemRecordCost?: number): number => {
    if (itemRecordCost != null && Number(itemRecordCost) > 0) return Number(itemRecordCost);
    const it = itemsMap.get(itemId);
    return Number(it?.cost || it?.Cost || 0);
  };

  const getItemName = (itemId: string, fallbackName?: string): string => {
    if (fallbackName && fallbackName.trim()) return fallbackName;
    const it = itemsMap.get(itemId);
    return it?.name || it?.Name || "صنف غير معروف";
  };

  const getItemCode = (itemId: string, fallbackCode?: string): string => {
    if (fallbackCode && fallbackCode.trim()) return fallbackCode;
    const it = itemsMap.get(itemId);
    return it?.code || it?.Code || it?.barcode || it?.Barcode || "-";
  };

  // Helper: Extract items array safely
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

  // Date filtering predicate
  const isInDateRange = (dateStr?: string) => {
    if (!dateStr) return true;
    const d = new Date(dateStr);
    if (fromDate) {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      if (d < start) return false;
    }
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      if (d > end) return false;
    }
    return true;
  };

  // 1. Process Stock Out Records with Cost
  const stockOutData = useMemo(() => {
    return (stockOutRecords || [])
      .filter((rec: any) => {
        if (!isInDateRange(rec.date || rec.Date || rec.createdAt || rec.CreatedAt)) return false;
        const whId = rec.warehouseId || rec.WarehouseId || rec.sourceId || rec.SourceId;
        if (selectedWarehouseId !== "all" && whId !== selectedWarehouseId) return false;

        const num = String(rec.receiptNumber || rec.ReceiptNumber || rec.id || rec.Id || "");
        const reason = String(rec.reason || rec.Reason || "");
        const notes = String(rec.notes || rec.Notes || "");
        const q = searchQuery.toLowerCase().trim();
        if (q && !num.toLowerCase().includes(q) && !reason.toLowerCase().includes(q) && !notes.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .map((rec: any) => {
        const rawItems = extractItems(rec);
        let totalQty = 0;
        let totalCost = 0;

        const processedItems = rawItems.map((it: any) => {
          const qty = Number(it.qty || it.quantity || 1);
          const cost = getItemCost(it.id || it.itemId, it.cost || it.price);
          const lineCost = qty * cost;
          totalQty += qty;
          totalCost += lineCost;

          return {
            code: getItemCode(it.id || it.itemId, it.code),
            name: getItemName(it.id || it.itemId, it.name || it.itemName),
            qty,
            unit: it.unit || it.baseUnit || "قطعة",
            cost,
            totalCost: lineCost,
            reason: it.reason || rec.reason || "-"
          };
        });

        const whId = rec.warehouseId || rec.WarehouseId || rec.sourceId || rec.SourceId;
        return {
          id: rec.id || rec.Id,
          receiptNumber: rec.receiptNumber || rec.ReceiptNumber || `صرف-${String(rec.id || rec.Id).slice(-4)}`,
          date: rec.date || rec.Date || rec.createdAt || rec.CreatedAt,
          warehouseId: whId,
          warehouseName: warehousesMap.get(whId) || "المخزن الرئيسي",
          reason: rec.reason || rec.Reason || "صرف بضاعة / تشغيلي",
          createdByName: rec.createdByName || rec.CreatedByName || "مسؤول المخزن",
          notes: rec.notes || rec.Notes || "-",
          totalQty,
          totalCost,
          items: processedItems
        };
      });
  }, [stockOutRecords, fromDate, toDate, selectedWarehouseId, searchQuery, warehousesMap, itemsMap]);

  // 2. Process Stock Transfers with Goods Cost + Shipping
  const stockTransfersData = useMemo(() => {
    return (stockTransferRecords || [])
      .filter((tr: any) => {
        if (!isInDateRange(tr.date || tr.Date || tr.createdAt || tr.CreatedAt)) return false;
        const fromWhId = tr.fromWarehouseId || tr.FromWarehouseId || tr.fromSourceId || tr.FromSourceId;
        const toWhId = tr.toWarehouseId || tr.ToWarehouseId || tr.toSourceId || tr.ToSourceId;
        if (selectedWarehouseId !== "all" && fromWhId !== selectedWarehouseId && toWhId !== selectedWarehouseId) {
          return false;
        }

        const num = String(tr.receiptNumber || tr.ReceiptNumber || tr.id || tr.Id || "");
        const notes = String(tr.notes || tr.Notes || "");
        const q = searchQuery.toLowerCase().trim();
        if (q && !num.toLowerCase().includes(q) && !notes.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .map((tr: any) => {
        const rawItems = extractItems(tr);
        let totalQty = 0;
        let totalGoodsCost = 0;

        const processedItems = rawItems.map((it: any) => {
          const qty = Number(it.qty || it.quantity || 1);
          const cost = getItemCost(it.id || it.itemId, it.cost);
          const lineCost = qty * cost;
          totalQty += qty;
          totalGoodsCost += lineCost;

          return {
            code: getItemCode(it.id || it.itemId, it.code),
            name: getItemName(it.id || it.itemId, it.name || it.itemName),
            qty,
            unit: it.unit || it.baseUnit || "قطعة",
            cost,
            totalCost: lineCost
          };
        });

        const fromWhId = tr.fromWarehouseId || tr.FromWarehouseId || tr.fromSourceId || tr.FromSourceId;
        const toWhId = tr.toWarehouseId || tr.ToWarehouseId || tr.toSourceId || tr.ToSourceId;
        const shippingCost = Number(tr.shippingCost || tr.ShippingCost || 0);

        return {
          id: tr.id || tr.Id,
          receiptNumber: tr.receiptNumber || tr.ReceiptNumber || `تحويل-${String(tr.id || tr.Id).slice(-4)}`,
          date: tr.date || tr.Date || tr.createdAt || tr.CreatedAt,
          fromWarehouseId: fromWhId,
          fromWarehouseName: warehousesMap.get(fromWhId) || "فرع المصدر",
          toWarehouseId: toWhId,
          toWarehouseName: warehousesMap.get(toWhId) || "فرع المستلم",
          status: tr.status || tr.Status || "completed",
          shippingCost,
          goodsCost: totalGoodsCost,
          totalCost: totalGoodsCost + shippingCost,
          totalQty,
          notes: tr.notes || tr.Notes || "-",
          createdByName: tr.createdByName || tr.CreatedByName || "مسؤول التحويل",
          items: processedItems
        };
      });
  }, [stockTransferRecords, fromDate, toDate, selectedWarehouseId, searchQuery, warehousesMap, itemsMap]);

  // 3. Process Write-Offs, Scrap & Damaged Goods with Cost
  const writeOffsData = useMemo(() => {
    const list: Array<{
      id: string;
      docNumber: string;
      date: string;
      warehouseId: string;
      warehouseName: string;
      itemCode: string;
      itemName: string;
      lossType: "damage" | "expiry" | "write_off" | "shortage";
      lossTypeLabel: string;
      qty: number;
      unitCost: number;
      totalLossCost: number;
      reason: string;
      createdByName: string;
    }> = [];

    (stockAdjustmentRecords || []).forEach((adj: any) => {
      if (!isInDateRange(adj.date || adj.Date || adj.createdAt || adj.CreatedAt)) return;
      const whId = adj.warehouseId || adj.WarehouseId;
      if (selectedWarehouseId !== "all" && whId !== selectedWarehouseId) return;

      const rawItems = extractItems(adj);
      const adjReason = String(adj.reason || adj.Reason || "").toLowerCase();

      rawItems.forEach((it: any) => {
        const itReason = String(it.reason || it.Reason || adjReason).toLowerCase();
        const diff = Number(it.difference != null ? it.difference : (Number(it.newStock || it.physicalQty || 0) - Number(it.currentStock || it.systemQty || 0)));
        
        // We only care about negative diffs (deficits, damaged, expired, written off)
        const isDamage = itReason.includes("تلف") || itReason.includes("كسر") || itReason.includes("damage");
        const isExpiry = itReason.includes("صلاحية") || itReason.includes("اكسباير") || itReason.includes("expiry");
        const isWriteOff = itReason.includes("إعدام") || itReason.includes("اعدام") || itReason.includes("scrap") || itReason.includes("writeoff") || itReason.includes("هالك");
        const isDeficit = diff < 0;

        if (isDamage || isExpiry || isWriteOff || isDeficit) {
          const absQty = isDeficit ? Math.abs(diff) : Number(it.qty || it.quantity || Math.abs(diff) || 1);
          if (absQty <= 0) return;

          const unitCost = getItemCost(it.itemId || it.id, it.cost || it.Cost);
          const totalLossCost = absQty * unitCost;

          let lossType: "damage" | "expiry" | "write_off" | "shortage" = "shortage";
          let lossTypeLabel = "عجز جردي مخزني";

          if (isWriteOff) {
            lossType = "write_off";
            lossTypeLabel = "إعدام مخزني وهوالك";
          } else if (isDamage) {
            lossType = "damage";
            lossTypeLabel = "بضاعة تالفة / كسر";
          } else if (isExpiry) {
            lossType = "expiry";
            lossTypeLabel = "انتهاء صلاحية";
          }

          const q = searchQuery.toLowerCase().trim();
          const docNum = String(adj.receiptNumber || adj.ReceiptNumber || adj.id || adj.Id || "");
          const itName = getItemName(it.itemId || it.id, it.name || it.itemName);
          const itCode = getItemCode(it.itemId || it.id, it.code);

          if (q && !docNum.toLowerCase().includes(q) && !itName.toLowerCase().includes(q) && !itCode.toLowerCase().includes(q) && !itReason.includes(q)) {
            return;
          }

          list.push({
            id: `${adj.id || adj.Id}-${it.id || it.itemId}-${list.length}`,
            docNumber: docNum,
            date: adj.date || adj.Date || adj.createdAt || adj.CreatedAt,
            warehouseId: whId,
            warehouseName: warehousesMap.get(whId) || "المخزن العام",
            itemCode: itCode,
            itemName: itName,
            lossType,
            lossTypeLabel,
            qty: absQty,
            unitCost,
            totalLossCost,
            reason: it.reason || adj.reason || adj.notes || "تسوية جردية / إعدام وتالف",
            createdByName: adj.createdByName || adj.CreatedByName || "مسؤول الجرد"
          });
        }
      });
    });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [stockAdjustmentRecords, fromDate, toDate, selectedWarehouseId, searchQuery, warehousesMap, itemsMap]);

  // Overall Financial Summaries
  const kpis = useMemo(() => {
    const totalStockOutCost = stockOutData.reduce((acc, r) => acc + r.totalCost, 0);
    const totalStockOutQty = stockOutData.reduce((acc, r) => acc + r.totalQty, 0);

    const totalTransfersGoodsCost = stockTransfersData.reduce((acc, r) => acc + r.goodsCost, 0);
    const totalTransfersShippingCost = stockTransfersData.reduce((acc, r) => acc + r.shippingCost, 0);
    const totalTransfersCost = stockTransfersData.reduce((acc, r) => acc + r.totalCost, 0);
    const totalTransfersQty = stockTransfersData.reduce((acc, r) => acc + r.totalQty, 0);

    const totalLossCost = writeOffsData.reduce((acc, r) => acc + r.totalLossCost, 0);
    const totalLossQty = writeOffsData.reduce((acc, r) => acc + r.qty, 0);

    return {
      totalStockOutCost,
      totalStockOutQty,
      totalTransfersGoodsCost,
      totalTransfersShippingCost,
      totalTransfersCost,
      totalTransfersQty,
      totalLossCost,
      totalLossQty,
      grandMovementValue: totalStockOutCost + totalTransfersCost
    };
  }, [stockOutData, stockTransfersData, writeOffsData]);

  // Export to Excel handler
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Stock Out
    const ws1Data = stockOutData.map(r => ({
      "رقم إذن الصرف": r.receiptNumber,
      "التاريخ": new Date(r.date).toLocaleDateString("ar-EG"),
      "المخزن / الفرع": r.warehouseName,
      "سبب الصرف": r.reason,
      "المسؤول": r.createdByName,
      "إجمالي الكمية المنصرفة": r.totalQty,
      "إجمالي التكلفة (ج.م)": r.totalCost,
      "ملاحظات": r.notes
    }));
    const ws1 = XLSX.utils.json_to_sheet(ws1Data);
    XLSX.utils.book_append_sheet(wb, ws1, "تكاليف أذون الصرف");

    // Sheet 2: Transfers
    const ws2Data = stockTransfersData.map(r => ({
      "رقم التحويل": r.receiptNumber,
      "التاريخ": new Date(r.date).toLocaleDateString("ar-EG"),
      "من فرع": r.fromWarehouseName,
      "إلى فرع": r.toWarehouseName,
      "حالة التحويل": r.status === "completed" ? "مكتمل" : "قيد النقل",
      "إجمالي الكمية": r.totalQty,
      "تكلفة البضاعة (ج.م)": r.goodsCost,
      "تكلفة الشحن (ج.م)": r.shippingCost,
      "الإجمالي الكلي (ج.م)": r.totalCost,
      "ملاحظات": r.notes
    }));
    const ws2 = XLSX.utils.json_to_sheet(ws2Data);
    XLSX.utils.book_append_sheet(wb, ws2, "تكاليف التحويلات بين الفروع");

    // Sheet 3: Write-Offs & Scrap
    const ws3Data = writeOffsData.map(r => ({
      "رقم السند": r.docNumber,
      "التاريخ": new Date(r.date).toLocaleDateString("ar-EG"),
      "الفرع / المخزن": r.warehouseName,
      "نوع الهالك / الخسارة": r.lossTypeLabel,
      "كود الصنف": r.itemCode,
      "اسم الصنف": r.itemName,
      "الكمية التالفة/المعدومة": r.qty,
      "سعر تكلفة الوحدة": r.unitCost,
      "إجمالي الخسارة (ج.م)": r.totalLossCost,
      "السبب / البيان": r.reason,
      "المسؤول": r.createdByName
    }));
    const ws3 = XLSX.utils.json_to_sheet(ws3Data);
    XLSX.utils.book_append_sheet(wb, ws3, "تكاليف الإعدامات والهوالك");

    XLSX.writeFile(wb, `تقرير_تكاليف_المخزون_والهوالك_${todayStr}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <PageHeader title="تقرير تكاليف أذون الصرف، التحويلات، والإعدامات والهوالك" />

      <main className="flex-1 p-4 md:p-6 space-y-6">
        
        {/* Top Action Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card border rounded-xl p-4 shadow-sm">
          <div>
            <h2 className="text-xl font-black text-foreground">
              الرقابة المالية على حركات وتكاليف المخزون
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              حصر تكلفة البضاعة المنصرفة، المحولة بين الفروع، وخسائر الهوالك والتوالف والإعدام بناءً على أسعار التكلفة المحاسبية.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-2">
              <Download className="h-4 w-4" />
              تصدير إكسيل (Excel)
            </Button>
            <Button variant="default" size="sm" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" />
              طباعة التقرير
            </Button>
          </div>
        </div>

        {/* Global Filters Panel */}
        <Card className="border shadow-sm">
          <CardHeader className="py-3 px-4 bg-muted/40 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Filter className="h-4 w-4" /> فلاتر وتصفيات التقرير
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">من تاريخ</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">إلى تاريخ</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">الفرع أو المخزن</Label>
              <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="اختر المخزن أو الفرع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع والمخازن</SelectItem>
                  {allWarehousesList.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">بحث بالرقم أو الصنف أو السبب</Label>
              <div className="relative">
                <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث سريع..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-8 h-9 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top KPI Cards (Pure White & Indian Red for Loss) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">1. تكاليف أذون الصرف</p>
                  <p className="text-2xl font-black text-foreground mt-1">
                    {kpis.totalStockOutCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs font-normal">ج.م</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    إجمالي {kpis.totalStockOutQty.toLocaleString()} قطعة منصرفة ({stockOutData.length} إذن)
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-foreground">
                  <PackageMinus className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">2. تكاليف بضاعة التحويلات</p>
                  <p className="text-2xl font-black text-foreground mt-1">
                    {kpis.totalTransfersGoodsCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs font-normal">ج.م</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {kpis.totalTransfersQty.toLocaleString()} قطعة محولة بين الفروع
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-foreground">
                  <ArrowRightLeft className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">3. تكاليف الإعدامات والهوالك</p>
                  {/* Indian Red (#CD5C5C) for Deficit / Losses */}
                  <p className="text-2xl font-black text-[#CD5C5C] mt-1">
                    {kpis.totalLossCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs font-normal">ج.م</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    خسائر {kpis.totalLossQty.toLocaleString()} قطعة تالفة أو معدومة ({writeOffsData.length} بند)
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-[#CD5C5C]">
                  <Trash2 className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">4. إجمالي القيمة المنقولة</p>
                  <p className="text-2xl font-black text-foreground mt-1">
                    {kpis.grandMovementValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs font-normal">ج.م</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    شاملة تكاليف الشحن: {kpis.totalTransfersShippingCost.toLocaleString()} ج.م
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-foreground">
                  <Layers className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-11 bg-muted/60 p-1 border">
            <TabsTrigger value="stock-out" className="text-xs md:text-sm font-bold gap-2">
              <PackageMinus className="h-4 w-4" />
              1. تكاليف أذون الصرف ({stockOutData.length})
            </TabsTrigger>
            <TabsTrigger value="transfers" className="text-xs md:text-sm font-bold gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              2. تكاليف التحويل بين الفروع ({stockTransfersData.length})
            </TabsTrigger>
            <TabsTrigger value="write-offs" className="text-xs md:text-sm font-bold gap-2">
              <Trash2 className="h-4 w-4 text-[#CD5C5C]" />
              3. تكاليف الإعدامات والهوالك والتوالف ({writeOffsData.length})
            </TabsTrigger>
          </TabsList>

          {/* ===================== TAB 1: Stock Out ===================== */}
          <TabsContent value="stock-out" className="mt-4">
            <Card className="border rounded-xl shadow-sm">
              <CardHeader className="py-3 px-4 border-b bg-card">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-base font-bold text-foreground">
                      كشف تكاليف أذون الصرف المخزني
                    </CardTitle>
                    <CardDescription className="text-xs">
                      قائمة أذون الصرف الصادرة من المخازن مع تقييم كمية وتكلفة البضاعة المنصرفة.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs text-foreground">
                    إجمالي التكلفة: {kpis.totalStockOutCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/70">
                    <TableRow>
                      <TableHead className="w-[120px] text-center font-bold">رقم الإذن</TableHead>
                      <TableHead className="w-[120px] text-center font-bold">التاريخ</TableHead>
                      <TableHead className="font-bold">المخزن / الفرع</TableHead>
                      <TableHead className="font-bold">سبب وبيان الصرف</TableHead>
                      <TableHead className="font-bold">المسؤول</TableHead>
                      <TableHead className="text-center font-bold">عدد الأصناف</TableHead>
                      <TableHead className="text-center font-bold">إجمالي الكمية</TableHead>
                      <TableHead className="text-center font-bold">إجمالي التكلفة</TableHead>
                      <TableHead className="text-center font-bold w-[90px]">التفاصيل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockOutData.length > 0 ? (
                      stockOutData.map((row) => (
                        <TableRow key={row.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-center font-bold text-xs text-foreground">
                            {row.receiptNumber}
                          </TableCell>
                          <TableCell className="text-center text-xs font-mono text-muted-foreground">
                            {new Date(row.date).toLocaleDateString("ar-EG")}
                          </TableCell>
                          <TableCell className="font-semibold text-xs text-foreground">
                            {row.warehouseName}
                          </TableCell>
                          <TableCell className="text-xs text-foreground">
                            {row.reason}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.createdByName}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs text-foreground">
                            {row.items.length}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs font-bold text-foreground">
                            {row.totalQty.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs font-black text-foreground">
                            {row.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setDetailModal({
                                isOpen: true,
                                title: `تفاصيل أصناف إذن الصرف: ${row.receiptNumber}`,
                                subtitle: `المخزن: ${row.warehouseName} | السبب: ${row.reason}`,
                                items: row.items,
                                totalCost: row.totalCost
                              })}
                            >
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-xs">
                          لا توجد أذون صرف مطابقة لمعايير البحث في الفترة المحددة.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  <TableFooter className="bg-muted/40 font-black">
                    <TableRow>
                      <TableCell colSpan={6} className="text-right text-xs">الإجمالي العام لأذون الصرف:</TableCell>
                      <TableCell className="text-center font-mono text-xs">{kpis.totalStockOutQty.toLocaleString()}</TableCell>
                      <TableCell className="text-center font-mono text-xs font-black text-foreground">
                        {kpis.totalStockOutCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== TAB 2: Transfers ===================== */}
          <TabsContent value="transfers" className="mt-4">
            <Card className="border rounded-xl shadow-sm">
              <CardHeader className="py-3 px-4 border-b bg-card">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-base font-bold text-foreground">
                      كشف تكاليف البضاعة المحولة بين الفروع
                    </CardTitle>
                    <CardDescription className="text-xs">
                      رصد تكلفة البضاعة المحولة بين الفروع والمخازن مع تكاليف الشحن المصاحبة.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs text-foreground">
                    إجمالي البضاعة: {kpis.totalTransfersGoodsCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/70">
                    <TableRow>
                      <TableHead className="w-[120px] text-center font-bold">رقم التحويل</TableHead>
                      <TableHead className="w-[120px] text-center font-bold">التاريخ</TableHead>
                      <TableHead className="font-bold">من مخزن / فرع</TableHead>
                      <TableHead className="font-bold">إلى مخزن / فرع</TableHead>
                      <TableHead className="text-center font-bold">الحالة</TableHead>
                      <TableHead className="text-center font-bold">عدد الأصناف</TableHead>
                      <TableHead className="text-center font-bold">إجمالي الكمية</TableHead>
                      <TableHead className="text-center font-bold">تكلفة البضاعة</TableHead>
                      <TableHead className="text-center font-bold">تكلفة الشحن</TableHead>
                      <TableHead className="text-center font-bold">الإجمالي الكلي</TableHead>
                      <TableHead className="text-center font-bold w-[90px]">التفاصيل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockTransfersData.length > 0 ? (
                      stockTransfersData.map((row) => (
                        <TableRow key={row.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-center font-bold text-xs text-foreground">
                            {row.receiptNumber}
                          </TableCell>
                          <TableCell className="text-center text-xs font-mono text-muted-foreground">
                            {new Date(row.date).toLocaleDateString("ar-EG")}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-foreground">
                            {row.fromWarehouseName}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-foreground">
                            {row.toWarehouseName}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={row.status === "completed" ? "default" : "secondary"} className="text-[10px]">
                              {row.status === "completed" ? "مكتمل ومستلم" : "قيد النقل"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs text-foreground">
                            {row.items.length}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs font-bold text-foreground">
                            {row.totalQty.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs font-black text-foreground">
                            {row.goodsCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {row.shippingCost > 0 ? `${row.shippingCost.toLocaleString()} ج.م` : "-"}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs font-black text-foreground">
                            {row.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setDetailModal({
                                isOpen: true,
                                title: `تفاصيل أصناف التحويل: ${row.receiptNumber}`,
                                subtitle: `من: ${row.fromWarehouseName} ➔ إلى: ${row.toWarehouseName}`,
                                items: row.items,
                                totalCost: row.goodsCost
                              })}
                            >
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground text-xs">
                          لا توجد تحويلات بين الفروع مطابقة لمعايير البحث في الفترة المحددة.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  <TableFooter className="bg-muted/40 font-black">
                    <TableRow>
                      <TableCell colSpan={6} className="text-right text-xs">الإجمالي العام للتحويلات:</TableCell>
                      <TableCell className="text-center font-mono text-xs">{kpis.totalTransfersQty.toLocaleString()}</TableCell>
                      <TableCell className="text-center font-mono text-xs font-black text-foreground">
                        {kpis.totalTransfersGoodsCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">
                        {kpis.totalTransfersShippingCost.toLocaleString()} ج.م
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs font-black text-foreground">
                        {kpis.totalTransfersCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== TAB 3: Write-Offs & Losses ===================== */}
          <TabsContent value="write-offs" className="mt-4">
            <Card className="border rounded-xl shadow-sm">
              <CardHeader className="py-3 px-4 border-b bg-card">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-base font-bold text-foreground">
                      كشف خسائر وتكاليف الإعدامات والهوالك والتوالف
                    </CardTitle>
                    <CardDescription className="text-xs">
                      حصر الأصناف التالفة، منتهية الصلاحية، والهوالك الناتجة عن الجرد مسعرة بسعر التكلفة.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs text-[#CD5C5C] border-[#CD5C5C]/30">
                    إجمالي الخسارة المالية: {kpis.totalLossCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/70">
                    <TableRow>
                      <TableHead className="w-[110px] text-center font-bold">رقم السند</TableHead>
                      <TableHead className="w-[110px] text-center font-bold">التاريخ</TableHead>
                      <TableHead className="font-bold">المخزن / الفرع</TableHead>
                      <TableHead className="text-center font-bold">نوع الهالك / الخسارة</TableHead>
                      <TableHead className="w-[120px] font-bold">كود الصنف</TableHead>
                      <TableHead className="font-bold">اسم الصنف</TableHead>
                      <TableHead className="text-center font-bold">الكمية التالفة/المعدومة</TableHead>
                      <TableHead className="text-center font-bold">تكلفة الوحدة</TableHead>
                      <TableHead className="text-center font-bold">إجمالي الخسارة</TableHead>
                      <TableHead className="font-bold">السبب والملاحظات</TableHead>
                      <TableHead className="font-bold">المسؤول</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {writeOffsData.length > 0 ? (
                      writeOffsData.map((row) => (
                        <TableRow key={row.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-center font-bold text-xs text-foreground">
                            {row.docNumber}
                          </TableCell>
                          <TableCell className="text-center text-xs font-mono text-muted-foreground">
                            {new Date(row.date).toLocaleDateString("ar-EG")}
                          </TableCell>
                          <TableCell className="font-semibold text-xs text-foreground">
                            {row.warehouseName}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px] font-bold px-2 py-0.5",
                                row.lossType === "write_off" && "border-[#CD5C5C] text-[#CD5C5C] bg-[#CD5C5C]/10",
                                row.lossType === "damage" && "border-[#CD5C5C] text-[#CD5C5C] bg-[#CD5C5C]/10",
                                row.lossType === "expiry" && "border-border text-foreground bg-muted",
                                row.lossType === "shortage" && "border-[#CD5C5C]/60 text-[#CD5C5C]"
                              )}
                            >
                              {row.lossTypeLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {row.itemCode}
                          </TableCell>
                          <TableCell className="font-bold text-xs text-foreground">
                            {row.itemName}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs font-bold text-foreground">
                            {row.qty.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs text-foreground">
                            {row.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                          </TableCell>
                          {/* Indian Red (#CD5C5C) for Loss */}
                          <TableCell className="text-center font-mono text-xs font-black text-[#CD5C5C]">
                            ({row.totalLossCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}) ج.م
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={row.reason}>
                            {row.reason}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.createdByName}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground text-xs">
                          لا توجد إعدامات أو توالف مسجلة في الفترة المحددة.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  <TableFooter className="bg-muted/40 font-black">
                    <TableRow>
                      <TableCell colSpan={6} className="text-right text-xs">إجمالي خسائر وتكاليف الهوالك والإعدامات:</TableCell>
                      <TableCell className="text-center font-mono text-xs">{kpis.totalLossQty.toLocaleString()}</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-center font-mono text-xs font-black text-[#CD5C5C]">
                        ({kpis.totalLossCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}) ج.م
                      </TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal for Items Details */}
        <Dialog open={detailModal.isOpen} onOpenChange={(open) => setDetailModal(prev => ({ ...prev, isOpen: open }))}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">{detailModal.title}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">{detailModal.subtitle}</DialogDescription>
            </DialogHeader>

            <div className="max-h-96 overflow-y-auto border rounded-lg mt-2">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead className="font-bold text-xs">كود الصنف</TableHead>
                    <TableHead className="font-bold text-xs">اسم الصنف</TableHead>
                    <TableHead className="text-center font-bold text-xs">الكمية</TableHead>
                    <TableHead className="text-center font-bold text-xs">سعر التكلفة</TableHead>
                    <TableHead className="text-center font-bold text-xs">إجمالي التكلفة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailModal.items.map((it, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{it.code || "-"}</TableCell>
                      <TableCell className="font-semibold text-xs text-foreground">{it.name}</TableCell>
                      <TableCell className="text-center font-mono text-xs text-foreground">{it.qty} {it.unit}</TableCell>
                      <TableCell className="text-center font-mono text-xs text-foreground">{it.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</TableCell>
                      <TableCell className="text-center font-mono text-xs font-bold text-foreground">{it.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className="bg-muted/40 font-black">
                  <TableRow>
                    <TableCell colSpan={4} className="text-right text-xs">إجمالي تكلفة البضاعة:</TableCell>
                    <TableCell className="text-center font-mono text-xs font-black text-foreground">
                      {detailModal.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

      </main>
    </>
  );
}
