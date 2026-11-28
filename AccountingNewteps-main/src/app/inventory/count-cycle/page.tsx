"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Lock,
  PlusCircle,
  RefreshCw,
  Printer,
  Download,
  Search,
  FileCheck2,
  AlertTriangle,
  Boxes,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Eye,
  Trash2,
  FileText,
  Smartphone,
  Sparkles,
  HelpCircle
} from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

interface CountSession {
  id: string;
  sessionCode: string;
  warehouseId: string;
  warehouseSectionId?: string;
  adjustmentType: string;
  snapshotDate: string;
  snapshotDateStr: string;
  catalogScope?: string;
  scopeTargetId?: string;
  cutoffMode?: string;
  scopeLabel?: string;
  frozenBalances: Record<string, number>;
  frozenCosts?: Record<string, number>;
  status: "open" | "entry_closed" | "reviewed" | "consolidated" | "cancelled";
  createdByName?: string;
  createdAt?: string;
  consolidatedAt?: string | null;
  consolidatedRecordId?: string | null;
  sheets: {
    id: string;
    deviceName: string;
    submittedByName?: string;
    items: { itemId: string; itemName: string; itemCode?: string; actualQty: number }[];
    notes?: string;
    createdAt?: string;
  }[];
}

const LOCAL_SESSIONS_KEY = "inventory_count_sessions_v1";

export default function InventoryCountCycleDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const { items, warehouses, inventoryZones, itemSections, itemCategories, itemGroups, stockAdjustmentRecords, loading: dataLoading } = useData();

  const [sessions, setSessions] = useState<CountSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("overview");

  // Inquiries & Audit filters
  const [itemInquirySearch, setItemInquirySearch] = useState("");
  const [preparedSheetScope, setPreparedSheetScope] = useState("all");
  const [preparedWarehouseId, setPreparedWarehouseId] = useState("");

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/inventory/count-sessions?status=all", { cache: "no-store" });
      const json = await res.json();
      if (json.isIndexedDb) {
        try {
          const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
          const list = raw ? JSON.parse(raw) : [];
          setSessions(list);
          if (!selectedSessionId && list.length > 0) setSelectedSessionId(list[0].id);
        } catch {
          setSessions([]);
        }
      } else if (json.success) {
        setSessions(json.sessions || []);
        if (!selectedSessionId && (json.sessions || []).length > 0) {
          const firstOpen = json.sessions.find((s: any) => s.status === "open") || json.sessions[0];
          setSelectedSessionId(firstOpen.id);
        }
      }
    } catch {
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const allWarehouses = useMemo(() => {
    return [...(warehouses || []), ...(inventoryZones || [])];
  }, [warehouses, inventoryZones]);

  const getWarehouseName = useCallback(
    (id: string) => allWarehouses.find((w: any) => w.id === id)?.name || "غير محدد",
    [allWarehouses]
  );

  const itemsMap = useMemo(() => {
    const map = new Map<string, any>();
    (items || []).forEach((it: any) => map.set(it.id, it));
    return map;
  }, [items]);

  const selectedSession = useMemo(() => {
    return sessions.find((s) => s.id === selectedSessionId) || sessions[0] || null;
  }, [sessions, selectedSessionId]);

  // Aggregated quantities from all submitted sheets in the selected session
  const sessionAggregation = useMemo(() => {
    if (!selectedSession) {
      return {
        countedMap: new Map<string, number>(),
        uncountedItemIds: [] as string[],
        misplacedItems: [] as any[],
        variances: [] as any[],
        totalFrozenValue: 0,
        totalCountedValue: 0,
        netDifferenceValue: 0
      };
    }

    const countedMap = new Map<string, number>();
    const sheetCountsByItem = new Map<string, { device: string; qty: number }[]>();

    (selectedSession.sheets || []).forEach((sheet) => {
      (sheet.items || []).forEach((it) => {
        const cur = countedMap.get(it.itemId) || 0;
        countedMap.set(it.itemId, Number((cur + (Number(it.actualQty) || 0)).toFixed(3)));

        const list = sheetCountsByItem.get(it.itemId) || [];
        list.push({ device: sheet.deviceName || "جهاز", qty: Number(it.actualQty) || 0 });
        sheetCountsByItem.set(it.itemId, list);
      });
    });

    const frozenEntries = Object.entries(selectedSession.frozenBalances || {});
    const uncountedItemIds: string[] = [];
    const variances: any[] = [];
    let totalFrozenValue = 0;
    let totalCountedValue = 0;

    frozenEntries.forEach(([itemId, frozenQty]) => {
      const it = itemsMap.get(itemId);
      const unitCost = Number(selectedSession.frozenCosts?.[itemId] ?? it?.cost ?? 0);
      const frozenNum = Number(frozenQty) || 0;
      totalFrozenValue += frozenNum * unitCost;

      const hasCount = countedMap.has(itemId);
      const actQty = hasCount ? countedMap.get(itemId)! : 0;
      totalCountedValue += actQty * unitCost;

      if (!hasCount && frozenNum !== 0) {
        uncountedItemIds.push(itemId);
      }

      const diff = Number((actQty - frozenNum).toFixed(3));
      const valDiff = diff * unitCost;

      variances.push({
        itemId,
        code: it?.code || itemId,
        name: it?.name || "صنف غير معروف",
        sectionId: it?.sectionId,
        frozenQty: frozenNum,
        actualQty: actQty,
        difference: diff,
        unitCost,
        valueDifference: valDiff,
        hasCount,
        deviceDetails: sheetCountsByItem.get(itemId) || []
      });
    });

    // Check misplaced items (items counted but not in the session scope)
    const misplacedItems: any[] = [];
    countedMap.forEach((actQty, itemId) => {
      if (!Object.prototype.hasOwnProperty.call(selectedSession.frozenBalances || {}, itemId)) {
        const it = itemsMap.get(itemId);
        const cost = Number(it?.cost || 0);
        misplacedItems.push({
          itemId,
          code: it?.code || itemId,
          name: it?.name || "صنف غير مدرج بالنطاق",
          actualQty: actQty,
          unitCost: cost,
          value: actQty * cost,
          deviceDetails: sheetCountsByItem.get(itemId) || []
        });
      }
    });

    return {
      countedMap,
      uncountedItemIds,
      misplacedItems,
      variances,
      totalFrozenValue,
      totalCountedValue,
      netDifferenceValue: totalCountedValue - totalFrozenValue
    };
  }, [selectedSession, itemsMap]);

  // Handle printing prepared/blank sheets for counting teams
  const handlePrintPreparedBlankSheet = () => {
    window.print();
  };

  // Export prepared sheet to Excel
  const handleExportPreparedSheetExcel = () => {
    const whId = preparedWarehouseId || selectedSession?.warehouseId;
    const targetItems = (items || []).filter((i: any) => i.itemType !== "manufactured");
    const exportRows = targetItems.map((it: any) => ({
      "كود الصنف": it.code || it.id,
      "اسم الصنف": it.name,
      "القسم": (itemSections || []).find((s: any) => s.id === it.sectionId)?.name || "-",
      "الوحدة الأساسية": it.unit || it.baseUnit || "قطعة",
      "الكمية الفعلية المجرودة": ""
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BlankCountSheet");
    XLSX.writeFile(wb, `كشف_جرد_مفرغ_${getWarehouseName(whId || "")}.xlsx`);
  };

  return (
    <>
      <PageHeader title="دورة الجرد المخزني الرقابي (ERP Inventory Audit)">
        <div className="flex flex-wrap items-center gap-2 no-print">
          <Button size="sm" variant="outline" onClick={loadSessions} disabled={isLoading}>
            <RefreshCw className={cn("ml-1.5 h-4 w-4", isLoading && "animate-spin")} />
            تحديث
          </Button>
          <Button size="sm" variant="secondary" onClick={() => router.push("/reports/frozen-balances")}>
            <FileText className="ml-1.5 h-4 w-4 text-amber-600" />
            تقرير الأرصدة المجنّبة
          </Button>
          <Button size="sm" variant="default" className="font-bold gap-1.5" onClick={() => router.push("/inventory/adjustment/new")}>
            <PlusCircle className="h-4 w-4" />
            بدء جلسة وتجنيب جديد
          </Button>
        </div>
      </PageHeader>

      <main className="flex flex-1 flex-col gap-4 p-2 md:p-6 printable-area">
        {/* شريط اختيار الجلسة الحالية والملخص السريع */}
        <Card className="no-print border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-foreground">جلسة الجرد النشطة قيد العمل والمراجعة:</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                  <SelectTrigger className="h-9 w-80 text-xs bg-background">
                    <SelectValue placeholder="اختر جلسة جرد..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.sessionCode} — {getWarehouseName(s.warehouseId)} ({s.snapshotDateStr}) [
                        {s.status === "open" ? "مفتوحة" : s.status === "consolidated" ? "معتمدة" : s.status}]
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedSession && (
                  <Badge variant={selectedSession.status === "open" ? "default" : "secondary"} className="text-xs">
                    {selectedSession.status === "open"
                      ? "جلسة جرد مفتوحة"
                      : selectedSession.status === "consolidated"
                        ? "معتمدة ومرحّلة"
                        : "ملغاة"}
                  </Badge>
                )}
              </div>
            </div>

            {selectedSession && (
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">المخزن:</span>{" "}
                  <strong className="text-foreground">{getWarehouseName(selectedSession.warehouseId)}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">تاريخ التجنيب:</span>{" "}
                  <strong className="font-mono text-foreground">{selectedSession.snapshotDateStr}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">الكشوف المستلمة:</span>{" "}
                  <strong className="font-mono text-primary">{selectedSession.sheets?.length || 0} كشف</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">الأصناف المجنّبة:</span>{" "}
                  <strong className="font-mono">{Object.keys(selectedSession.frozenBalances || {}).length} صنف</strong>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* التبويبات التنفيذية لدورة الجرد */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-2 sm:grid-cols-5 h-auto p-1 bg-muted/60 no-print">
            <TabsTrigger value="overview" className="text-xs py-2 gap-1.5 font-bold">
              <Boxes className="h-3.5 w-3.5" />
              1. مسار دورة الجرد
            </TabsTrigger>
            <TabsTrigger value="sheets" className="text-xs py-2 gap-1.5 font-bold">
              <Smartphone className="h-3.5 w-3.5" />
              2. كشوف الأجهزة ({selectedSession?.sheets?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-xs py-2 gap-1.5 font-bold">
              <ShieldCheck className="h-3.5 w-3.5" />
              3. المراجعة والرقابة قبل الترحيل
            </TabsTrigger>
            <TabsTrigger value="uncounted" className="text-xs py-2 gap-1.5 font-bold">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              4. أصناف لم تُجرد ({sessionAggregation.uncountedItemIds.length})
            </TabsTrigger>
            <TabsTrigger value="prepared" className="text-xs py-2 gap-1.5 font-bold">
              <Printer className="h-3.5 w-3.5" />
              5. طباعة الكشوف الميدانية
            </TabsTrigger>
          </TabsList>

          {/* تبويب 1: نظرة عامة ومسار دورة الجرد الرقابي */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Card className="border-r-4 border-r-amber-500">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">الخطوة 1: التجنيب</span>
                    <Lock className="h-4 w-4 text-amber-500" />
                  </div>
                  <CardTitle className="text-sm">تجنيب الأرصدة الدفترية</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-xs text-muted-foreground space-y-2">
                  <p>تجميد الأرصدة الدفترية في تاريخ ووقت محدد (مخزن / قسم / مجموعة / صنف) لضمان عدم تأثرها بالبيع.</p>
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs font-bold" onClick={() => router.push("/inventory/adjustment/new")}>
                    فتح جلسة تجنيب جديدة
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-r-4 border-r-sky-500">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">الخطوة 2: الإدخال</span>
                    <Smartphone className="h-4 w-4 text-sky-500" />
                  </div>
                  <CardTitle className="text-sm">كشوف الأجهزة المتعددة</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-xs text-muted-foreground space-y-2">
                  <p>تسجيل الجرد الفعلي من الهواتف وأجهزة الباركود والإكسيل دون المساس بأرصدة المخزن.</p>
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs font-bold" onClick={() => setActiveTab("sheets")}>
                    عرض كشوف الجلسة ({selectedSession?.sheets?.length || 0})
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-r-4 border-r-purple-500">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">الخطوة 3: الرقابة</span>
                    <ShieldCheck className="h-4 w-4 text-purple-500" />
                  </div>
                  <CardTitle className="text-sm">المراجعة وفروق الجرد</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-xs text-muted-foreground space-y-2">
                  <p>مطابقة الفعلي بالمجنّب، كشف الأصناف غير المجرودة، والأصناف المجرودة بالخطأ خارج قسمها.</p>
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs font-bold" onClick={() => setActiveTab("audit")}>
                    فحص الفروق قبل الاعتماد
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-r-4 border-r-emerald-500">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">الخطوة 4: الترحيل</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <CardTitle className="text-sm">الترحيل وفصل أذون الفائض والعجز</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-xs text-muted-foreground space-y-2">
                  <p>اعتماد التجميع، تصفير غير المجرود، إصدار إذن فائض جرد منفصل وإذن عجز جرد منفصل، وترحيل قيود اليومية آلياً.</p>
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs font-bold" onClick={() => router.push("/inventory/adjustment")}>
                    سجل أذون التسوية والقيود
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* ملخص أرقام الجلسة المحددة */}
            {selectedSession && (
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base">تحليل أرقام جلسة الجرد ({selectedSession.sessionCode})</CardTitle>
                  <CardDescription className="text-xs">
                    مقارنة القيمة الدفترية المجنّبة بإجمالي القيمة المجرودة فعلياً من الكشوف
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl border bg-muted/20">
                    <div>
                      <p className="text-xs text-muted-foreground">إجمالي القيمة الدفترية المجنّبة</p>
                      <p className="text-xl font-bold font-mono">
                        {sessionAggregation.totalFrozenValue.toLocaleString("en-US", { minimumFractionDigits: 2 })} ج.م
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">إجمالي القيمة المجرودة فعلياً</p>
                      <p className="text-xl font-bold font-mono text-primary">
                        {sessionAggregation.totalCountedValue.toLocaleString("en-US", { minimumFractionDigits: 2 })} ج.م
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">صافي الفارق المالي (فائض / عجز)</p>
                      <p
                        className={cn(
                          "text-xl font-bold font-mono",
                          sessionAggregation.netDifferenceValue > 0
                            ? "text-emerald-600"
                            : sessionAggregation.netDifferenceValue < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                        )}
                      >
                        {sessionAggregation.netDifferenceValue > 0 ? "+" : ""}
                        {sessionAggregation.netDifferenceValue.toLocaleString("en-US", { minimumFractionDigits: 2 })} ج.م
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* تبويب 2: كشوف الأجهزة */}
          <TabsContent value="sheets" className="space-y-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">كشوف الجرد الميدانية المستلمة من الأجهزة</CardTitle>
                    <CardDescription className="text-xs">
                      استعراض كشوف الجرد الفعلي المرسلة من مختلف الهواتف والماسحات قبل التجميع
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="default" className="text-xs font-bold gap-1" onClick={() => router.push("/inventory/adjustment/new")}>
                    <PlusCircle className="h-3.5 w-3.5" />
                    إضافة / إرسال كشف جديد للجلسة
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {!selectedSession || (selectedSession.sheets || []).length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    لا توجد كشوف جرد مستلمة في هذه الجلسة حتى الآن.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedSession.sheets.map((sheet, index) => {
                      const totalQty = (sheet.items || []).reduce((sum, i) => sum + (Number(i.actualQty) || 0), 0);
                      return (
                        <div key={sheet.id} className="p-3 rounded-lg border bg-background flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">كشف #{index + 1}: {sheet.deviceName}</span>
                              <Badge variant="outline">{sheet.items?.length || 0} صنف</Badge>
                            </div>
                            <p className="text-muted-foreground">
                              بواسطة: <strong>{sheet.submittedByName || "غير محدد"}</strong> | الوقت:{" "}
                              {sheet.createdAt ? new Date(sheet.createdAt).toLocaleTimeString("ar-EG") : "-"}
                            </p>
                            {sheet.notes && <p className="text-muted-foreground italic">ملاحظات: {sheet.notes}</p>}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-left font-mono">
                              <p className="text-muted-foreground text-[10px]">إجمالي الكمية المجرودة</p>
                              <p className="font-bold text-sm text-primary">{totalQty}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* تبويب 3: المراجعة والرقابة قبل الترحيل */}
          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">تقرير مراجعة فروق الجرد قبل الترحيل (Pre-Posting Variance)</CardTitle>
                    <CardDescription className="text-xs">
                      مقارنة دقيقة بين الرصيد الدفتري المجنّب والمجمّع من كشوف الأجهزة قبل اعتماد القيود
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => window.print()}>
                    <Printer className="ml-1.5 h-3.5 w-3.5" />
                    طباعة التقرير
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="w-full overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>كود الصنف</TableHead>
                        <TableHead>اسم الصنف</TableHead>
                        <TableHead className="text-center">المجنّب دفترياً</TableHead>
                        <TableHead className="text-center">المجرود فعلياً</TableHead>
                        <TableHead className="text-center">فارق الكمية</TableHead>
                        <TableHead className="text-center">التكلفة</TableHead>
                        <TableHead className="text-center">فارق القيمة</TableHead>
                        <TableHead className="text-center">الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessionAggregation.variances.map((v) => (
                        <TableRow key={v.itemId}>
                          <TableCell className="font-mono text-xs">{v.code}</TableCell>
                          <TableCell className="font-medium text-xs">{v.name}</TableCell>
                          <TableCell className="text-center font-mono font-bold">{v.frozenQty}</TableCell>
                          <TableCell className="text-center font-mono font-bold text-primary">{v.actualQty}</TableCell>
                          <TableCell
                            className={cn(
                              "text-center font-mono font-bold",
                              v.difference > 0 ? "text-emerald-600" : v.difference < 0 ? "text-destructive" : "text-muted-foreground"
                            )}
                          >
                            {v.difference > 0 ? `+${v.difference}` : v.difference}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">{v.unitCost.toFixed(2)}</TableCell>
                          <TableCell
                            className={cn(
                              "text-center font-mono font-semibold",
                              v.valueDifference > 0 ? "text-emerald-600" : v.valueDifference < 0 ? "text-destructive" : "text-muted-foreground"
                            )}
                          >
                            {v.valueDifference.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center">
                            {v.difference === 0 ? (
                              <Badge variant="outline" className="text-[10px]">مطابق</Badge>
                            ) : v.difference > 0 ? (
                              <Badge className="bg-emerald-600 text-[10px]">زيادة (فائض)</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">عجز</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* تبويب 4: الأصناف التي ليس لها جرد */}
          <TabsContent value="uncounted" className="space-y-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base text-amber-600">الأصناف المجنّبة التي لم تُجرد في كشوف الأجهزة ({sessionAggregation.uncountedItemIds.length} صنف)</CardTitle>
                <CardDescription className="text-xs">
                  هذه الأصناف لها رصيد دفتري مجنّب ولكن لم يقم أي جهاز بمسحها أو تسجيل كميتها
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {sessionAggregation.uncountedItemIds.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    جميع الأصناف المجنّبة تم جردها وإدراجها في كشوف الأجهزة.
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>كود الصنف</TableHead>
                          <TableHead>اسم الصنف</TableHead>
                          <TableHead className="text-center">الرصيد الدفتري المجنّب</TableHead>
                          <TableHead className="text-center">التكلفة</TableHead>
                          <TableHead className="text-center">القيمة المعرضة للعجز</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessionAggregation.uncountedItemIds.map((itemId) => {
                          const it = itemsMap.get(itemId);
                          const frozenQty = Number(selectedSession?.frozenBalances?.[itemId] || 0);
                          const cost = Number(it?.cost || 0);
                          return (
                            <TableRow key={itemId}>
                              <TableCell className="font-mono text-xs">{it?.code || itemId}</TableCell>
                              <TableCell className="font-medium text-xs">{it?.name || "صنف غير معروف"}</TableCell>
                              <TableCell className="text-center font-mono font-bold text-destructive">{frozenQty}</TableCell>
                              <TableCell className="text-center font-mono text-xs">{cost.toFixed(2)}</TableCell>
                              <TableCell className="text-center font-mono text-destructive font-semibold">
                                {(frozenQty * cost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* تبويب 5: طباعة الكشوف الميدانية */}
          <TabsContent value="prepared" className="space-y-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">طباعة الكشوف المُعدّة للجرد الميداني (Blank / Prepared Sheets)</CardTitle>
                    <CardDescription className="text-xs">
                      توليد كشوف جرد ورقية مفرغة مع أكواد الأصناف وأماكن كتابة الكميات لتوزيعها على لجان الجرد اليدوي
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-xs" onClick={handleExportPreparedSheetExcel}>
                      <Download className="ml-1.5 h-3.5 w-3.5" />
                      تصدير إكسيل
                    </Button>
                    <Button size="sm" variant="default" className="text-xs font-bold" onClick={handlePrintPreparedBlankSheet}>
                      <Printer className="ml-1.5 h-3.5 w-3.5" />
                      طباعة النموذج الورقي
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="border rounded-lg p-4 bg-background space-y-4">
                  <div className="flex justify-between items-center border-b pb-3">
                    <div>
                      <h3 className="font-bold text-base">استمارة محضر الجرد الفعلي للمخزون</h3>
                      <p className="text-xs text-muted-foreground">
                        المخزن: <strong>{getWarehouseName(selectedSession?.warehouseId || "")}</strong> | التاريخ:{" "}
                        <strong className="font-mono">{selectedSession?.snapshotDateStr || "-"}</strong>
                      </p>
                    </div>
                    <div className="text-left text-xs text-muted-foreground">
                      <p>اسم عضو لجنة الجرد: ___________________</p>
                      <p>التوقيع: ___________________</p>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">م</TableHead>
                        <TableHead>كود الصنف</TableHead>
                        <TableHead>اسم الصنف</TableHead>
                        <TableHead>القسم / التصنيف</TableHead>
                        <TableHead className="w-32 text-center">الكمية الفعلية</TableHead>
                        <TableHead className="w-40 text-center">ملاحظات الفاحص</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(items || []).slice(0, 50).map((it: any, idx: number) => (
                        <TableRow key={it.id}>
                          <TableCell className="text-center font-mono text-xs">{idx + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{it.code || it.id}</TableCell>
                          <TableCell className="font-medium text-xs">{it.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {(itemSections || []).find((s: any) => s.id === it.sectionId)?.name || "-"}
                          </TableCell>
                          <TableCell className="text-center font-mono border-x">__________</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">__________</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
