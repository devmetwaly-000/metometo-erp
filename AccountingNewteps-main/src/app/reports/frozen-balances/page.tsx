"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useData } from "@/contexts/data-provider";
import { Loader2, Download, Printer, RefreshCw, Lock, Boxes, Layers, FileCheck2, ChevronDown, ChevronUp } from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

interface FrozenSession {
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
  status: "open" | "consolidated" | "cancelled";
  createdByName?: string;
  createdAt?: string;
  consolidatedAt?: string | null;
  sheets: {
    id: string;
    deviceName: string;
    submittedByName?: string;
    items: { itemId: string; actualQty: number }[];
  }[];
}

const LOCAL_SESSIONS_KEY = "inventory_count_sessions_v1";

const getScopeLabelAr = (scope?: string) => {
  switch (scope) {
    case "section":
      return "على مستوى القسم";
    case "category":
      return "على مستوى الفئة";
    case "sub_group":
      return "على مستوى المجموعة الفرعية";
    case "item":
      return "على مستوى صنف محدد";
    default:
      return "كل المخزن";
  }
};

const getStatusBadge = (status: string) => {
  if (status === "consolidated") {
    return <Badge className="bg-emerald-600 text-white">معتمد ومجمّع</Badge>;
  }
  if (status === "cancelled") {
    return <Badge variant="destructive">ملغاة</Badge>;
  }
  return <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">مفتوحة (مجنّبة)</Badge>;
};

export default function FrozenBalancesReportPage() {
  const { items, warehouses, inventoryZones, itemSections, itemGroups, loading: dataLoading } = useData();
  const [sessions, setSessions] = useState<FrozenSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/inventory/count-sessions?status=all", { cache: "no-store" });
      const json = await res.json();
      if (json.isIndexedDb) {
        try {
          const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
          setSessions(raw ? JSON.parse(raw) : []);
        } catch {
          setSessions([]);
        }
      } else if (json.success) {
        setSessions(json.sessions || []);
      }
    } catch {
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const allWarehousesList = useMemo(() => {
    return [...(warehouses || []), ...(inventoryZones || [])];
  }, [warehouses, inventoryZones]);

  const getWarehouseName = useCallback(
    (id: string) => allWarehousesList.find((w: any) => w.id === id)?.name || "غير معروف",
    [allWarehousesList]
  );

  const itemsMap = useMemo(() => {
    const map = new Map<string, any>();
    (items || []).forEach((it: any) => map.set(it.id, it));
    return map;
  }, [items]);

  const sectionsMap = useMemo(() => {
    const map = new Map<string, string>();
    (itemSections || []).forEach((s: any) => map.set(s.id, s.name));
    return map;
  }, [itemSections]);

  const groupsMap = useMemo(() => {
    const map = new Map<string, string>();
    (itemGroups || []).forEach((g: any) => map.set(g.id, g.name));
    return map;
  }, [itemGroups]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sessions
      .filter((s) => {
        if (fromDate && s.snapshotDateStr < fromDate) return false;
        if (toDate && s.snapshotDateStr > toDate) return false;
        if (warehouseFilter !== "all" && s.warehouseId !== warehouseFilter) return false;
        if (scopeFilter !== "all" && (s.catalogScope || "all") !== scopeFilter) return false;
        if (statusFilter !== "all" && s.status !== statusFilter) return false;
        if (q) {
          const matchCode = (s.sessionCode || "").toLowerCase().includes(q);
          const matchWh = getWarehouseName(s.warehouseId).toLowerCase().includes(q);
          const matchItem = Object.keys(s.frozenBalances || {}).some((itemId) => {
            const it = itemsMap.get(itemId);
            return (
              it &&
              ((it.name || "").toLowerCase().includes(q) || (it.code || "").toLowerCase().includes(q))
            );
          });
          if (!matchCode && !matchWh && !matchItem) return false;
        }
        return true;
      })
      .map((s) => {
        const sheetTotals = new Map<string, number>();
        (s.sheets || []).forEach((sh) => {
          (sh.items || []).forEach((it) => {
            sheetTotals.set(it.itemId, (sheetTotals.get(it.itemId) || 0) + (Number(it.actualQty) || 0));
          });
        });

        const rows = Object.entries(s.frozenBalances || {}).map(([itemId, qty]) => {
          const it = itemsMap.get(itemId);
          const frozenQty = Number(qty) || 0;
          const unitCost = Number(s.frozenCosts?.[itemId] ?? it?.cost ?? 0);
          const frozenValue = frozenQty * unitCost;
          const hasCounted = sheetTotals.has(itemId);
          const actualQty = hasCounted ? sheetTotals.get(itemId)! : null;
          const diff = actualQty !== null ? Number((actualQty - frozenQty).toFixed(3)) : null;

          return {
            itemId,
            code: it?.code || itemId,
            name: it?.name || "صنف محذوف",
            sectionName: it?.sectionId ? sectionsMap.get(it.sectionId) || "-" : "-",
            groupName: it?.itemGroupId ? groupsMap.get(it.itemGroupId) || "-" : "-",
            frozenQty,
            unitCost,
            frozenValue,
            actualQty,
            diff
          };
        });

        const totalFrozenValue = rows.reduce((sum, r) => sum + r.frozenValue, 0);
        const totalFrozenQty = rows.reduce((sum, r) => sum + r.frozenQty, 0);

        return {
          ...s,
          rows,
          totalFrozenValue,
          totalFrozenQty
        };
      });
  }, [sessions, fromDate, toDate, warehouseFilter, scopeFilter, statusFilter, searchQuery, getWarehouseName, itemsMap, sectionsMap, groupsMap]);

  const summary = useMemo(() => {
    let totalItems = 0;
    let totalValue = 0;
    let totalSheets = 0;
    filteredSessions.forEach((s) => {
      totalItems += s.rows.length;
      totalValue += s.totalFrozenValue;
      totalSheets += s.sheets?.length || 0;
    });
    return {
      sessionsCount: filteredSessions.length,
      totalItems,
      totalValue,
      totalSheets
    };
  }, [filteredSessions]);

  const handleExportSessionExcel = (sess: (typeof filteredSessions)[number]) => {
    const exportRows = sess.rows.map((r) => ({
      "رقم الجلسة": sess.sessionCode,
      "تاريخ التجنيب": sess.snapshotDateStr,
      "المخزن": getWarehouseName(sess.warehouseId),
      "كود الصنف": r.code,
      "اسم الصنف": r.name,
      "القسم": r.sectionName,
      "المجموعة": r.groupName,
      "الرصيد الدفتري المجنّب": r.frozenQty,
      "التكلفة": r.unitCost,
      "القيمة الدفترية المجنّبة": r.frozenValue,
      "المجمّع من الأجهزة": r.actualQty !== null ? r.actualQty : "-",
      "الفرق": r.diff !== null ? r.diff : "-"
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "FrozenBalances");
    XLSX.writeFile(wb, `FrozenBalances_${sess.sessionCode}.xlsx`);
  };

  const handleExportAllExcel = () => {
    const allRows: any[] = [];
    filteredSessions.forEach((sess) => {
      sess.rows.forEach((r) => {
        allRows.push({
          "رقم الجلسة": sess.sessionCode,
          "تاريخ التجنيب": sess.snapshotDateStr,
          "المخزن": getWarehouseName(sess.warehouseId),
          "مستوى التجنيب": getScopeLabelAr(sess.catalogScope),
          "كود الصنف": r.code,
          "اسم الصنف": r.name,
          "الرصيد الدفتري المجنّب": r.frozenQty,
          "التكلفة": r.unitCost,
          "القيمة المجنّبة": r.frozenValue,
          "المجمّع من الأجهزة": r.actualQty !== null ? r.actualQty : "-",
          "الفرق": r.diff !== null ? r.diff : "-"
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(allRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AllFrozenBalances");
    XLSX.writeFile(wb, `FrozenBalances_Report_${fromDate}_to_${toDate}.xlsx`);
  };

  return (
    <>
      <PageHeader title="تقرير الأرصدة الدفترية المجنّبة">
        <div className="flex items-center gap-2 no-print">
          <Button variant="outline" size="sm" onClick={loadSessions} disabled={isLoading}>
            <RefreshCw className={cn("ml-1.5 h-4 w-4", isLoading && "animate-spin")} />
            تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportAllExcel} disabled={filteredSessions.length === 0}>
            <Download className="ml-1.5 h-4 w-4" />
            تصدير إكسيل
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="ml-1.5 h-4 w-4" />
            طباعة
          </Button>
        </div>
      </PageHeader>

      <main className="flex flex-1 flex-col gap-4 p-2 md:p-6 printable-area">
        {/* بطاقات الملخص */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">جلسات التجنيب</p>
                <p className="text-2xl font-bold font-mono">{summary.sessionsCount}</p>
              </div>
              <Lock className="h-7 w-7 text-amber-500 opacity-80" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الأصناف المجنّبة</p>
                <p className="text-2xl font-bold font-mono">{summary.totalItems}</p>
              </div>
              <Boxes className="h-7 w-7 text-primary opacity-80" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">إجمالي القيمة المجنّبة</p>
                <p className="text-xl md:text-2xl font-bold font-mono text-emerald-600">
                  {summary.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <Layers className="h-7 w-7 text-emerald-500 opacity-80" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">كشوف الأجهزة المستلمة</p>
                <p className="text-2xl font-bold font-mono">{summary.totalSheets}</p>
              </div>
              <FileCheck2 className="h-7 w-7 text-sky-500 opacity-80" />
            </CardContent>
          </Card>
        </div>

        {/* الفلاتر */}
        <Card className="no-print">
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">إلى تاريخ</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">المخزن</Label>
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المخازن</SelectItem>
                  {allWarehousesList.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">مستوى التجنيب</Label>
              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المستويات</SelectItem>
                  <SelectItem value="section">قسم</SelectItem>
                  <SelectItem value="category">فئة</SelectItem>
                  <SelectItem value="sub_group">مجموعة فرعية</SelectItem>
                  <SelectItem value="item">صنف محدد</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">حالة الجلسة</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="open">مفتوحة (مجنّبة)</SelectItem>
                  <SelectItem value="consolidated">معتمدة ومجمّعة</SelectItem>
                  <SelectItem value="cancelled">ملغاة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">بحث (جلسة / صنف)</Label>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث..."
                className="h-9 text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* قائمة جلسات التجنيب وتفاصيلها */}
        {isLoading || dataLoading ? (
          <div className="flex justify-center items-center py-14">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              لا توجد جلسات تجنيب أرصدة مطابقة للفلاتر المحددة.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((sess) => {
              const isExpanded = expandedSessionId === sess.id;
              return (
                <Card key={sess.id} className="overflow-hidden">
                  <CardHeader
                    className="p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedSessionId(isExpanded ? null : sess.id)}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-base font-mono">{sess.sessionCode}</CardTitle>
                          {getStatusBadge(sess.status)}
                          <Badge variant="outline">{getScopeLabelAr(sess.catalogScope)}</Badge>
                          <Badge variant="outline">
                            {sess.cutoffMode === "exact_now" ? "قطع لحظي" : "نهاية اليوم"}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs">
                          المخزن: <strong className="text-foreground">{getWarehouseName(sess.warehouseId)}</strong> | تاريخ التجنيب:{" "}
                          <strong className="text-foreground font-mono">{sess.snapshotDateStr}</strong> | النطاق: {sess.scopeLabel || "-"} | بواسطة:{" "}
                          {sess.createdByName || "-"}
                        </CardDescription>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-left">
                          <p className="text-[11px] text-muted-foreground">القيمة الدفترية المجنّبة</p>
                          <p className="font-mono font-bold text-sm text-emerald-600">
                            {sess.totalFrozenValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs no-print"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportSessionExcel(sess);
                          }}
                        >
                          <Download className="ml-1 h-3.5 w-3.5" />
                          Excel
                        </Button>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="p-2 md:p-4 border-t bg-muted/5">
                      <div className="w-full overflow-x-auto border rounded-lg bg-background">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>الكود</TableHead>
                              <TableHead>الصنف</TableHead>
                              <TableHead>القسم / المجموعة</TableHead>
                              <TableHead className="text-center">الرصيد المجنّب</TableHead>
                              <TableHead className="text-center">التكلفة</TableHead>
                              <TableHead className="text-center">القيمة المجنّبة</TableHead>
                              <TableHead className="text-center">المجمّع من الأجهزة</TableHead>
                              <TableHead className="text-center">الفارق</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sess.rows.map((r) => (
                              <TableRow key={r.itemId}>
                                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                                <TableCell className="font-medium">{r.name}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {r.sectionName} / {r.groupName}
                                </TableCell>
                                <TableCell className="text-center font-mono font-bold">{r.frozenQty}</TableCell>
                                <TableCell className="text-center font-mono text-xs">
                                  {r.unitCost.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-center font-mono font-semibold">
                                  {r.frozenValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-center font-mono">
                                  {r.actualQty !== null ? r.actualQty : "-"}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-center font-mono font-bold",
                                    r.diff === null
                                      ? "text-muted-foreground"
                                      : r.diff > 0
                                        ? "text-emerald-600"
                                        : r.diff < 0
                                          ? "text-destructive"
                                          : "text-muted-foreground"
                                  )}
                                >
                                  {r.diff === null ? "-" : r.diff > 0 ? `+${r.diff}` : r.diff}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
