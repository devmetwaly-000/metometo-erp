"use client";

import React, { useMemo, useState } from "react";
import PageHeader from "@/components/page-header";
import { useData } from "@/contexts/data-provider";
import { calculateAccountBalance, getPurchaseInvoiceTotal } from "@/lib/accounting-utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
} from "recharts";
import {
  Loader2,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Printer,
  Search,
  Filter,
  TrendingUp,
  Clock,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DueInvoiceRow {
  id: string;
  type: "receivable" | "payable";
  invoiceNumber: string;
  partyId: string;
  partyName: string;
  warehouseId?: string;
  warehouseName: string;
  invoiceDate: string;
  dueDate: string;
  dueDateKey: string;
  daysDiff: number; // negative = overdue, 0 = today, positive = upcoming
  total: number;
  paid: number;
  remaining: number;
}

export default function LiquidityReportPage() {
  const allData = useData();
  const {
    salesInvoices,
    purchaseInvoices,
    customers,
    suppliers,
    warehouses,
    cashAccounts,
    loading,
  } = allData;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const formatYMD = (d: Date) => d.toISOString().split("T")[0];

  const [preset, setPreset] = useState<string>("all");
  const [fromDueDate, setFromDueDate] = useState<string>("");
  const [toDueDate, setToDueDate] = useState<string>("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all");
  const [dueStatusFilter, setDueStatusFilter] = useState<"all" | "overdue" | "upcoming">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const applyPreset = (p: string) => {
    setPreset(p);
    const base = new Date();
    base.setHours(0, 0, 0, 0);

    if (p === "all") {
      setFromDueDate("");
      setToDueDate("");
      setDueStatusFilter("all");
      return;
    }
    if (p === "overdue") {
      setFromDueDate("");
      const yesterday = new Date(base);
      yesterday.setDate(yesterday.getDate() - 1);
      setToDueDate(formatYMD(yesterday));
      setDueStatusFilter("overdue");
      return;
    }
    if (p === "today") {
      const t = formatYMD(base);
      setFromDueDate(t);
      setToDueDate(t);
      setDueStatusFilter("all");
      return;
    }
    const days = Number(p);
    if (!isNaN(days) && days > 0) {
      const end = new Date(base);
      end.setDate(end.getDate() + days);
      setFromDueDate(formatYMD(base));
      setToDueDate(formatYMD(end));
      setDueStatusFilter("all");
    }
  };

  const liquidityData = useMemo(() => {
    if (loading) return null;

    const customersMap = new Map<string, any>();
    (customers || []).forEach((c: any) => customersMap.set(c.id, c));

    const suppliersMap = new Map<string, any>();
    (suppliers || []).forEach((s: any) => suppliersMap.set(s.id, s));

    const whMap = new Map<string, string>();
    (warehouses || []).forEach((w: any) => whMap.set(w.id, w.name));

    // 1. Live Cash & Bank Balances
    const cashBalances = (cashAccounts || []).map((acc: any) => ({
      id: acc.id,
      name: acc.name,
      type: acc.type || "cash",
      balance: calculateAccountBalance(acc, allData),
    }));
    const currentAvailableCash = cashBalances.reduce((sum: number, a: any) => sum + a.balance, 0);

    // 2. Extract all open Receivable Invoices (Sales) & Payable Invoices (Purchases)
    const allDueRows: DueInvoiceRow[] = [];

    (salesInvoices || []).forEach((inv: any) => {
      if (inv.status && inv.status !== "approved" && inv.status !== "completed") return;
      const total = Number(inv.total || 0);
      const paid = Number(inv.paidAmount || 0);
      const remaining = Math.max(0, total - paid);
      if (remaining <= 0.01) return;

      const rawDue = inv.dueDate || inv.date;
      const dueObj = new Date(rawDue);
      if (isNaN(dueObj.getTime())) return;
      dueObj.setHours(0, 0, 0, 0);

      const daysDiff = Math.round((dueObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const cust = customersMap.get(inv.customerId);

      allDueRows.push({
        id: inv.id,
        type: "receivable",
        invoiceNumber: inv.invoiceNumber || inv.id,
        partyId: inv.customerId || "",
        partyName: inv.customerName || cust?.name || "عميل غير محدد",
        warehouseId: inv.warehouseId,
        warehouseName: whMap.get(inv.warehouseId) || "الفرع الرئيسي",
        invoiceDate: inv.date,
        dueDate: rawDue,
        dueDateKey: formatYMD(dueObj),
        daysDiff,
        total,
        paid,
        remaining,
      });
    });

    (purchaseInvoices || []).forEach((inv: any) => {
      const total = getPurchaseInvoiceTotal(inv);
      const paid = Number(inv.paidAmount || 0);
      const remaining = Math.max(0, total - paid);
      if (remaining <= 0.01) return;

      const rawDue = inv.dueDate || inv.date;
      const dueObj = new Date(rawDue);
      if (isNaN(dueObj.getTime())) return;
      dueObj.setHours(0, 0, 0, 0);

      const daysDiff = Math.round((dueObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const sup = suppliersMap.get(inv.supplierId);

      allDueRows.push({
        id: inv.id,
        type: "payable",
        invoiceNumber: inv.invoiceNumber || inv.id,
        partyId: inv.supplierId || "",
        partyName: inv.supplierName || sup?.name || "مورد غير محدد",
        warehouseId: inv.warehouseId,
        warehouseName: whMap.get(inv.warehouseId) || "الفرع الرئيسي",
        invoiceDate: inv.date,
        dueDate: rawDue,
        dueDateKey: formatYMD(dueObj),
        daysDiff,
        total,
        paid,
        remaining,
      });
    });

    // 3. Apply Filters
    const filteredRows = allDueRows.filter((row) => {
      if (selectedWarehouse !== "all" && row.warehouseId !== selectedWarehouse) return false;
      if (fromDueDate && row.dueDateKey < fromDueDate) return false;
      if (toDueDate && row.dueDateKey > toDueDate) return false;
      if (dueStatusFilter === "overdue" && row.daysDiff >= 0) return false;
      if (dueStatusFilter === "upcoming" && row.daysDiff < 0) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hit =
          row.partyName.toLowerCase().includes(q) ||
          row.invoiceNumber.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });

    filteredRows.sort((a, b) => a.dueDateKey.localeCompare(b.dueDateKey));

    const receivables = filteredRows.filter((r) => r.type === "receivable");
    const payables = filteredRows.filter((r) => r.type === "payable");

    const totalReceivables = receivables.reduce((s, r) => s + r.remaining, 0);
    const overdueReceivables = receivables
      .filter((r) => r.daysDiff < 0)
      .reduce((s, r) => s + r.remaining, 0);

    const totalPayables = payables.reduce((s, r) => s + r.remaining, 0);
    const overduePayables = payables
      .filter((r) => r.daysDiff < 0)
      .reduce((s, r) => s + r.remaining, 0);

    const projectedNetLiquidity = currentAvailableCash + totalReceivables - totalPayables;
    const coverageRatio =
      totalPayables > 0
        ? ((currentAvailableCash + totalReceivables) / totalPayables) * 100
        : 100;

    // 4. Build Payment & Collection Schedule Timeline grouped by Due Date
    const scheduleMap = new Map<
      string,
      {
        dueDateKey: string;
        inflow: number;
        outflow: number;
        inflowCount: number;
        outflowCount: number;
      }
    >();

    filteredRows.forEach((row) => {
      const entry = scheduleMap.get(row.dueDateKey) || {
        dueDateKey: row.dueDateKey,
        inflow: 0,
        outflow: 0,
        inflowCount: 0,
        outflowCount: 0,
      };
      if (row.type === "receivable") {
        entry.inflow += row.remaining;
        entry.inflowCount += 1;
      } else {
        entry.outflow += row.remaining;
        entry.outflowCount += 1;
      }
      scheduleMap.set(row.dueDateKey, entry);
    });

    let runningCash = currentAvailableCash;
    const scheduleTimeline = Array.from(scheduleMap.values())
      .sort((a, b) => a.dueDateKey.localeCompare(b.dueDateKey))
      .map((item) => {
        const netDay = item.inflow - item.outflow;
        runningCash += netDay;
        const dObj = new Date(item.dueDateKey);
        const daysDiff = Math.round((dObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          ...item,
          netDay,
          cumulativeLiquidity: runningCash,
          daysDiff,
          label: dObj.toLocaleDateString("ar-EG", { month: "short", day: "numeric" }),
        };
      });

    // 5. Aging Buckets (Across all filtered rows)
    const buckets = [
      { key: "over90", label: "متأخر +90 يوم", receivables: 0, payables: 0 },
      { key: "61_90", label: "متأخر 61-90", receivables: 0, payables: 0 },
      { key: "31_60", label: "متأخر 31-60", receivables: 0, payables: 0 },
      { key: "1_30", label: "متأخر 1-30", receivables: 0, payables: 0 },
      { key: "today", label: "مستحق اليوم", receivables: 0, payables: 0 },
      { key: "next7", label: "خلال 7 أيام", receivables: 0, payables: 0 },
      { key: "next30", label: "8 - 30 يوماً", receivables: 0, payables: 0 },
      { key: "after30", label: "بعد +30 يوماً", receivables: 0, payables: 0 },
    ];

    filteredRows.forEach((row) => {
      const d = row.daysDiff;
      let idx = 7;
      if (d < -90) idx = 0;
      else if (d < -60) idx = 1;
      else if (d < -30) idx = 2;
      else if (d < 0) idx = 3;
      else if (d === 0) idx = 4;
      else if (d <= 7) idx = 5;
      else if (d <= 30) idx = 6;
      else idx = 7;

      if (row.type === "receivable") buckets[idx].receivables += row.remaining;
      else buckets[idx].payables += row.remaining;
    });

    return {
      currentAvailableCash,
      cashBalances,
      receivables,
      payables,
      totalReceivables,
      overdueReceivables,
      totalPayables,
      overduePayables,
      projectedNetLiquidity,
      coverageRatio,
      scheduleTimeline,
      agingBuckets: buckets,
    };
  }, [
    loading,
    allData,
    salesInvoices,
    purchaseInvoices,
    customers,
    suppliers,
    warehouses,
    cashAccounts,
    selectedWarehouse,
    fromDueDate,
    toDueDate,
    dueStatusFilter,
    searchQuery,
    today,
  ]);

  const renderDueBadge = (daysDiff: number) => {
    if (daysDiff < 0) {
      return (
        <Badge variant="destructive" className="text-[10px]">
          متأخر {Math.abs(daysDiff)} يوم
        </Badge>
      );
    }
    if (daysDiff === 0) {
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px]">
          مستحق اليوم
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600">
        بعد {daysDiff} يوم
      </Badge>
    );
  };

  if (loading || !liquidityData) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-9 w-9 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground">جاري تحليل السيولة ومواعيد الاستحقاق...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full pb-10">
      <PageHeader
        title="تحليلات السيولة وتدفقات الاستحقاق ومواعيد السداد"
        description="تخطيط التدفقات النقدية الداخلة والخارجة بناءً على تواريخ الاستحقاق الفعلية لفواتير البيع والشراء."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="gap-1.5 text-xs font-semibold h-8 no-print"
        >
          <Printer className="h-3.5 w-3.5" />
          طباعة التقرير
        </Button>
      </PageHeader>

      <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
        {/* Filter Bar */}
        <Card className="border shadow-xs no-print">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground ml-1">فترة الاستحقاق السريعة:</span>
              {[
                { id: "all", label: "كل الاستحقاقات" },
                { id: "overdue", label: "المتأخرة فقط" },
                { id: "today", label: "مستحق اليوم" },
                { id: "7", label: "خلال 7 أيام" },
                { id: "15", label: "خلال 15 يوم" },
                { id: "30", label: "خلال 30 يوم" },
                { id: "90", label: "خلال 90 يوم" },
              ].map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant={preset === p.id ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => applyPreset(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> من تاريخ استحقاق
                </Label>
                <Input
                  type="date"
                  value={fromDueDate}
                  onChange={(e) => {
                    setPreset("custom");
                    setFromDueDate(e.target.value);
                  }}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> إلى تاريخ استحقاق
                </Label>
                <Input
                  type="date"
                  value={toDueDate}
                  onChange={(e) => {
                    setPreset("custom");
                    setToDueDate(e.target.value);
                  }}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5" /> الفرع
                </Label>
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="كل الفروع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    {warehouses.map((w: any) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> حالة الاستحقاق
                </Label>
                <Select
                  value={dueStatusFilter}
                  onValueChange={(v: any) => setDueStatusFilter(v)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل (متأخر + قادم)</SelectItem>
                    <SelectItem value="overdue">متأخر فقط</SelectItem>
                    <SelectItem value="upcoming">مستحق اليوم / قادم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5" /> بحث عميل / مورد / فاتورة
                </Label>
                <Input
                  placeholder="ابحث..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Executive KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold">السيولة المتاحة الآن</CardTitle>
              <Wallet className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-black font-mono text-primary">
                {liquidityData.currentAvailableCash.toLocaleString(undefined, { maximumFractionDigits: 2 })} ج.م
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                رصيد الخزائن والبنوك الفعلي ({liquidityData.cashBalances.length} حساب)
              </p>
            </CardContent>
          </Card>

          <Card className="bg-emerald-500/5 border-emerald-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold">تحصيلات مستحقة (داخلة)</CardTitle>
              <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-black font-mono text-emerald-600">
                +{liquidityData.totalReceivables.toLocaleString(undefined, { maximumFractionDigits: 2 })} ج.م
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                متأخر منها: <strong className="text-destructive">{liquidityData.overdueReceivables.toLocaleString()} ج.م</strong> ({liquidityData.receivables.length} فاتورة)
              </p>
            </CardContent>
          </Card>

          <Card className="bg-destructive/5 border-destructive/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold">التزامات مستحقة (خارجة)</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-black font-mono text-destructive">
                -{liquidityData.totalPayables.toLocaleString(undefined, { maximumFractionDigits: 2 })} ج.م
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                متأخر منها: <strong className="text-destructive">{liquidityData.overduePayables.toLocaleString()} ج.م</strong> ({liquidityData.payables.length} فاتورة)
              </p>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "border",
              liquidityData.projectedNetLiquidity >= 0
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-destructive/10 border-destructive/30"
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold">صافي السيولة المتوقع</CardTitle>
              {liquidityData.projectedNetLiquidity >= 0 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-xl font-black font-mono",
                  liquidityData.projectedNetLiquidity >= 0 ? "text-emerald-600" : "text-destructive"
                )}
              >
                {liquidityData.projectedNetLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })} ج.م
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {liquidityData.projectedNetLiquidity >= 0
                  ? "فائض سيولة يغطي كافة الالتزامات"
                  : "تحذير: عجز سيولة متوقع يتطلب تسريع التحصيل"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-blue-500/5 border-blue-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold">نسبة التغطية النقدية</CardTitle>
              <ShieldCheck className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-black font-mono text-blue-600">
                {liquidityData.coverageRatio.toFixed(0)}%
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                قدرة النقدية والتحصيلات على سداد الموردين
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                توقعات التدفق النقدي حسب تواريخ الاستحقاق
              </CardTitle>
              <CardDescription className="text-xs">
                مقارنة التحصيلات الداخلة والمدفوعات الخارجة مع منحنى السيولة التراكمية.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={liquidityData.scheduleTimeline}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v: number) => `${Number(v).toLocaleString()} ج.م`} />
                    <Legend />
                    <Bar dataKey="inflow" name="تحصيل عملاء" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outflow" name="سداد موردين" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="cumulativeLiquidity"
                      name="السيولة التراكمية"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                توزيع أعمار الديون ومواعيد الاستحقاق (Aging Schedule)
              </CardTitle>
              <CardDescription className="text-xs">
                توزيع المبالغ المتأخرة والمستحقة مستقبلاً على الشرائح الزمنية.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={liquidityData.agingBuckets}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="label" fontSize={10} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v: number) => `${Number(v).toLocaleString()} ج.م`} />
                    <Legend />
                    <Bar dataKey="receivables" name="مستحق لنا (عملاء)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="payables" name="مستحق علينا (موردين)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tabs */}
        <Tabs defaultValue="schedule" dir="rtl" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
            <TabsTrigger value="schedule" className="text-xs py-2">
              الجدول الزمني للاستحقاق ({liquidityData.scheduleTimeline.length})
            </TabsTrigger>
            <TabsTrigger value="receivables" className="text-xs py-2">
              فواتير بيع مستحقة ({liquidityData.receivables.length})
            </TabsTrigger>
            <TabsTrigger value="payables" className="text-xs py-2">
              فواتير شراء للسداد ({liquidityData.payables.length})
            </TabsTrigger>
            <TabsTrigger value="cash" className="text-xs py-2">
              أرصدة الخزائن والبنوك ({liquidityData.cashBalances.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Schedule Timeline */}
          <TabsContent value="schedule">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">الجدول الزمني لمواعيد السداد والتحصيل</CardTitle>
                <CardDescription className="text-xs">
                  يوضح صافي التدفق النقدي المتوقع في كل تاريخ استحقاق والرصيد التراكمي للسيولة.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">تاريخ الاستحقاق</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-center">تحصيلات متوقعة (داخلة)</TableHead>
                      <TableHead className="text-center">سدادات مطلوبة (خارجة)</TableHead>
                      <TableHead className="text-center">صافي حركة اليوم</TableHead>
                      <TableHead className="text-center">السيولة التراكمية</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liquidityData.scheduleTimeline.map((row) => (
                      <TableRow key={row.dueDateKey}>
                        <TableCell className="font-mono font-semibold">{row.dueDateKey}</TableCell>
                        <TableCell className="text-center">{renderDueBadge(row.daysDiff)}</TableCell>
                        <TableCell className="text-center font-mono text-emerald-600 font-semibold">
                          {row.inflow > 0 ? `+${row.inflow.toLocaleString()} (${row.inflowCount})` : "—"}
                        </TableCell>
                        <TableCell className="text-center font-mono text-destructive font-semibold">
                          {row.outflow > 0 ? `-${row.outflow.toLocaleString()} (${row.outflowCount})` : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-center font-mono font-bold",
                            row.netDay >= 0 ? "text-emerald-600" : "text-destructive"
                          )}
                        >
                          {row.netDay >= 0 ? "+" : ""}
                          {row.netDay.toLocaleString()}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-center font-mono font-black",
                            row.cumulativeLiquidity >= 0 ? "text-primary" : "text-destructive"
                          )}
                        >
                          {row.cumulativeLiquidity.toLocaleString()} ج.م
                        </TableCell>
                      </TableRow>
                    ))}
                    {liquidityData.scheduleTimeline.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          لا توجد مواعيد استحقاق مفتوحة ضمن الفلاتر المحددة.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Receivables */}
          <TabsContent value="receivables">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم الفاتورة</TableHead>
                      <TableHead className="text-right">العميل</TableHead>
                      <TableHead className="text-center">تاريخ الفاتورة</TableHead>
                      <TableHead className="text-center">تاريخ الاستحقاق</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-center">إجمالي الفاتورة</TableHead>
                      <TableHead className="text-center">المحصل</TableHead>
                      <TableHead className="text-center">المتبقي للتحصيل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liquidityData.receivables.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono font-semibold">{r.invoiceNumber}</TableCell>
                        <TableCell className="font-medium">{r.partyName}</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {new Date(r.invoiceDate).toLocaleDateString("ar-EG")}
                        </TableCell>
                        <TableCell className="text-center font-mono font-semibold">{r.dueDateKey}</TableCell>
                        <TableCell className="text-center">{renderDueBadge(r.daysDiff)}</TableCell>
                        <TableCell className="text-center font-mono">{r.total.toLocaleString()}</TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">{r.paid.toLocaleString()}</TableCell>
                        <TableCell className="text-center font-mono font-bold text-emerald-600">
                          {r.remaining.toLocaleString()} ج.م
                        </TableCell>
                      </TableRow>
                    ))}
                    {liquidityData.receivables.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          لا توجد فواتير بيع مستحقة التحصيل ضمن الفلتر الحالي.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {liquidityData.receivables.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={7} className="font-bold">إجمالي التحصيلات المستحقة</TableCell>
                        <TableCell className="text-center font-mono font-black text-emerald-600">
                          {liquidityData.totalReceivables.toLocaleString()} ج.م
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Payables */}
          <TabsContent value="payables">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم الفاتورة</TableHead>
                      <TableHead className="text-right">المورد</TableHead>
                      <TableHead className="text-center">تاريخ الفاتورة</TableHead>
                      <TableHead className="text-center">تاريخ الاستحقاق</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-center">إجمالي الفاتورة</TableHead>
                      <TableHead className="text-center">المسدد</TableHead>
                      <TableHead className="text-center">المتبقي للسداد</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liquidityData.payables.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono font-semibold">{p.invoiceNumber}</TableCell>
                        <TableCell className="font-medium">{p.partyName}</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {new Date(p.invoiceDate).toLocaleDateString("ar-EG")}
                        </TableCell>
                        <TableCell className="text-center font-mono font-semibold">{p.dueDateKey}</TableCell>
                        <TableCell className="text-center">{renderDueBadge(p.daysDiff)}</TableCell>
                        <TableCell className="text-center font-mono">{p.total.toLocaleString()}</TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">{p.paid.toLocaleString()}</TableCell>
                        <TableCell className="text-center font-mono font-bold text-destructive">
                          {p.remaining.toLocaleString()} ج.م
                        </TableCell>
                      </TableRow>
                    ))}
                    {liquidityData.payables.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          لا توجد فواتير شراء مستحقة السداد ضمن الفلتر الحالي.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {liquidityData.payables.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={7} className="font-bold">إجمالي الالتزامات المستحقة للسداد</TableCell>
                        <TableCell className="text-center font-mono font-black text-destructive">
                          {liquidityData.totalPayables.toLocaleString()} ج.م
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 4: Cash & Bank Accounts */}
          <TabsContent value="cash">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">اسم الخزينة / البنك</TableHead>
                      <TableHead className="text-center">النوع</TableHead>
                      <TableHead className="text-center">الرصيد الحالي المتاح</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liquidityData.cashBalances.map((acc: any) => (
                      <TableRow key={acc.id}>
                        <TableCell className="font-bold flex items-center gap-2">
                          <Landmark className="h-4 w-4 text-primary" />
                          {acc.name}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">
                            {acc.type === "bank" ? "حساب بنكي" : "خزينة نقدية"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-mono font-bold text-primary">
                          {acc.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} ج.م
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold">إجمالي السيولة النقدية المتاحة</TableCell>
                      <TableCell className="text-center font-mono font-black text-primary">
                        {liquidityData.currentAvailableCash.toLocaleString(undefined, { maximumFractionDigits: 2 })} ج.م
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
