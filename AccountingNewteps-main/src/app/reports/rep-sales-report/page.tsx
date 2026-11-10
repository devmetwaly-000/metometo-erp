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
  Users,
  DollarSign,
  TrendingUp,
  Package,
  Calendar,
  Wallet,
  Building2,
  FileText,
  Search,
  CheckCircle2,
  Clock,
  ArrowDownLeft,
  ArrowUpRight
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculateStockForItemInWarehouse } from "@/lib/inventory-utils";

export default function RepSalesReportPage() {
  const allDataContext = useData();
  const {
    users,
    sellers,
    salesInvoices,
    posSales,
    repWarehouses,
    repRemittances,
    stockIssuesToReps,
    stockReturnsFromReps,
    customers,
    items,
    loading
  } = allDataContext;

  // Filters State
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [selectedRepId, setSelectedRepId] = useState("all");
  const [activeTab, setActiveTab] = useState("summary");
  const [searchQuery, setSearchQuery] = useState("");

  // Customers Map
  const customersMap = useMemo(() => {
    const map = new Map<string, string>();
    (customers || []).forEach((c: any) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  // Sales Reps List (from users with role 'sales_rep' or sellers)
  const salesRepsList = useMemo(() => {
    const list: any[] = [];
    const ids = new Set<string>();

    (users || []).forEach((u: any) => {
      const role = String(u.role || u.Role || "").toLowerCase();
      if (role.includes("rep") || role.includes("مندوب") || u.isRep || u.IsRep) {
        if (!ids.has(u.id)) {
          ids.add(u.id);
          list.push({
            id: u.id,
            name: u.name || u.displayName || u.username,
            phone: u.phone || u.mobile || "-",
            repWarehouseId: u.repWarehouseId || u.warehouseId
          });
        }
      }
    });

    (sellers || []).forEach((s: any) => {
      if (!ids.has(s.id)) {
        ids.add(s.id);
        list.push({
          id: s.id,
          name: s.name,
          phone: s.phone || "-",
          repWarehouseId: s.repWarehouseId
        });
      }
    });

    return list;
  }, [users, sellers]);

  // Calculate Data
  const { repSummaryData, detailedInvoices, custodyMovements, summary } = useMemo(() => {
    const start = fromDate ? new Date(fromDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    const end = toDate ? new Date(toDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    let grandTotalSales = 0;
    let grandTotalPaid = 0;
    let grandTotalCredit = 0;
    let grandTotalRemitted = 0;
    let grandTotalCustody = 0;

    // Filter Rep Invoices
    const invoicesList: any[] = [];
    (salesInvoices || []).forEach((inv: any) => {
      const d = new Date(inv.date || inv.Date);
      if (start && d < start) return;
      if (end && d > end) return;

      const repId = inv.salesRepId || inv.repId || inv.sellerId || inv.userId || inv.CreatedById;
      if (!repId) return;

      // Check if this rep is in our sales rep list or if rep filter matches
      const rep = salesRepsList.find(r => r.id === repId);
      if (!rep) return;

      if (selectedRepId !== "all" && repId !== selectedRepId) return;

      const total = Number(inv.total || inv.Total) || 0;
      const paid = Number(inv.paidAmount || inv.PaidAmount) || 0;
      const remaining = Math.max(0, total - paid);
      const custName = inv.customerName || inv.CustomerName || customersMap.get(inv.customerId || inv.CustomerId) || "عميل نقدي";

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const invNum = String(inv.invoiceNumber || inv.id || "").toLowerCase();
        if (!invNum.includes(q) && !rep.name.toLowerCase().includes(q) && !custName.toLowerCase().includes(q)) {
          return;
        }
      }

      invoicesList.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id,
        date: inv.date || inv.Date,
        repId,
        repName: rep.name,
        customerId: inv.customerId || inv.CustomerId,
        customerName: custName,
        total,
        paid,
        remaining,
        warehouseName: inv.branchName || "مخزن العهدة"
      });
    });

    // Sort Invoices
    invoicesList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Remittances List
    const remittancesList = (repRemittances || []).filter((rem: any) => {
      const d = new Date(rem.date || rem.Date);
      if (start && d < start) return false;
      if (end && d > end) return false;
      if (selectedRepId !== "all" && rem.repId !== selectedRepId && rem.userId !== selectedRepId) return false;
      return true;
    });

    // Stock Issues to Reps
    const issuesList = (stockIssuesToReps || []).filter((iss: any) => {
      const d = new Date(iss.date || iss.Date);
      if (start && d < start) return false;
      if (end && d > end) return false;
      if (selectedRepId !== "all" && iss.repId !== selectedRepId) return false;
      return true;
    });

    // Reps Summary Map
    const repsMap = new Map<string, any>();
    salesRepsList.forEach(rep => {
      if (selectedRepId !== "all" && rep.id !== selectedRepId) return;

      // Find rep's warehouse
      const repWh = (repWarehouses || []).find((w: any) => w.salesRepId === rep.id || w.id === rep.repWarehouseId || w.code === `REP-${rep.id}`);
      let custodyValue = 0;
      if (repWh) {
        (items || []).forEach((it: any) => {
          const qty = calculateStockForItemInWarehouse(it.id, repWh.id, allDataContext);
          if (qty > 0) {
            custodyValue += qty * (Number(it.price || it.cost || 0));
          }
        });
      }

      repsMap.set(rep.id, {
        repId: rep.id,
        repName: rep.name,
        phone: rep.phone,
        invoicesCount: 0,
        totalSales: 0,
        cashCollected: 0,
        creditSales: 0,
        cashRemitted: 0,
        custodyValue
      });
    });

    // Populate invoices in repsMap
    invoicesList.forEach(inv => {
      const entry = repsMap.get(inv.repId);
      if (entry) {
        entry.invoicesCount++;
        entry.totalSales += inv.total;
        entry.cashCollected += inv.paid;
        entry.creditSales += inv.remaining;
      }
      grandTotalSales += inv.total;
      grandTotalPaid += inv.paid;
      grandTotalCredit += inv.remaining;
    });

    // Populate remittances in repsMap
    remittancesList.forEach((rem: any) => {
      const repId = rem.repId || rem.userId;
      const amount = Number(rem.amount || rem.Amount) || 0;
      const entry = repsMap.get(repId);
      if (entry) {
        entry.cashRemitted += amount;
      }
      grandTotalRemitted += amount;
    });

    // Calculate Grand Custody
    repsMap.forEach(r => {
      grandTotalCustody += r.custodyValue;
    });

    const summaryArray = Array.from(repsMap.values());
    summaryArray.sort((a, b) => b.totalSales - a.totalSales);

    return {
      repSummaryData: summaryArray,
      detailedInvoices: invoicesList,
      custodyMovements: {
        issues: issuesList,
        remittances: remittancesList
      },
      summary: {
        grandTotalSales,
        grandTotalPaid,
        grandTotalCredit,
        grandTotalRemitted,
        grandTotalCustody,
        repsCount: summaryArray.length,
        invoicesCount: invoicesList.length
      }
    };
  }, [salesRepsList, salesInvoices, repRemittances, stockIssuesToReps, repWarehouses, customersMap, items, fromDate, toDate, selectedRepId, searchQuery, allDataContext]);

  // Export to Excel
  const handleExportExcel = () => {
    let dataToExport: any[] = [];
    if (activeTab === "summary") {
      dataToExport = repSummaryData.map((r, idx) => ({
        "م": idx + 1,
        "اسم المندوب": r.repName,
        "الهاتف": r.phone,
        "عدد الفواتير": r.invoicesCount,
        "إجمالي المبيعات": r.totalSales,
        "التحصيل النقدي": r.cashCollected,
        "المبيعات الآجلة": r.creditSales,
        "التوريدات النقدية للخزينة": r.cashRemitted,
        "المتبقي طرف المندوب": Math.max(0, r.cashCollected - r.cashRemitted),
        "قيمة بضاعة العهدة الحالية": r.custodyValue
      }));
    } else {
      dataToExport = detailedInvoices.map((inv, idx) => ({
        "م": idx + 1,
        "رقم الفاتورة": inv.invoiceNumber,
        "التاريخ": new Date(inv.date).toLocaleDateString("ar-EG"),
        "المندوب": inv.repName,
        "العميل": inv.customerName,
        "الإجمالي": inv.total,
        "المدفوع نقداً": inv.paid,
        "المتبقي آجل": inv.remaining
      }));
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير مبيعات المناديب");
    XLSX.writeFile(wb, `تقرير_المناديب_${todayStr}.xlsx`);
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
        <p className="text-sm text-muted-foreground animate-pulse font-medium">جاري إعداد تقرير مبيعات وعمليات المناديب...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full pb-10 space-y-6">
      {/* 1. Header with Actions */}
      <PageHeader title="تقرير مبيعات وعمليات المناديب الميدانيين">
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
              <span>إجمالي مبيعات المناديب</span>
              <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-blue-700 dark:text-blue-400">
              {summary.grandTotalSales.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              مجموع {summary.invoicesCount} فاتورة بيع
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>النقدية المحصلة مع المناديب</span>
              <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {summary.grandTotalPaid.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              تحصيلات نقدية من العملاء
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>مبيعات آجلة (مديونيات عملاء)</span>
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400">
              {summary.grandTotalCredit.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              متبقي مستحق على العملاء
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-indigo-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>التوريدات النقدية للخزينة</span>
              <ArrowDownLeft className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-indigo-700 dark:text-indigo-400">
              {summary.grandTotalRemitted.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              مبالغ وردها المناديب لحساب الشركة
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-purple-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>قيمة بضاعة العهدة الحالية</span>
              <Package className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-purple-700 dark:text-purple-400">
              {summary.grandTotalCustody.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              بضاعة في حوزة سيارات المناديب
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
              <span>فلاتر تقرير المناديب</span>
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
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">المندوب</Label>
              <Select value={selectedRepId} onValueChange={setSelectedRepId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل المناديب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المناديب ({salesRepsList.length})</SelectItem>
                  {salesRepsList.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">بحث برقم الفاتورة أو العميل</Label>
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

      {/* 4. Tabs: Summary vs Invoices */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 w-72 mb-2">
          <TabsTrigger value="summary" className="text-xs">ملخص أداء المناديب</TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs">فواتير المناديب التفصيلية</TabsTrigger>
        </TabsList>

        {/* Tab 1: Summary Table */}
        <TabsContent value="summary">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-2 border-b">
              <CardTitle className="text-sm font-semibold">
                كشف أداء ومبيعات المناديب وتوريدات النقدية
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 text-xs">
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>اسم المندوب</TableHead>
                      <TableHead>الهاتف</TableHead>
                      <TableHead className="text-center font-mono">عدد الفواتير</TableHead>
                      <TableHead className="text-left font-mono font-bold">إجمالي المبيعات</TableHead>
                      <TableHead className="text-left font-mono">التحصيل النقدي</TableHead>
                      <TableHead className="text-left font-mono">الآجل للعملاء</TableHead>
                      <TableHead className="text-left font-mono text-indigo-600 dark:text-indigo-400">التوريدات للخزينة</TableHead>
                      <TableHead className="text-left font-mono font-bold text-amber-600 dark:text-amber-400">المتبقي عهدة نقدية</TableHead>
                      <TableHead className="text-left font-mono font-bold text-purple-600 dark:text-purple-400">قيمة بضاعة العهدة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repSummaryData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground text-xs">
                          لا توجد بيانات مبيعات للمناديب مطابقة للفترة المحددة.
                        </TableCell>
                      </TableRow>
                    ) : (
                      repSummaryData.map((r, idx) => {
                        const cashPendingWithRep = Math.max(0, r.cashCollected - r.cashRemitted);

                        return (
                          <TableRow key={r.repId || idx} className="text-xs hover:bg-muted/40 transition-colors border-b">
                            <TableCell className="text-center font-mono text-muted-foreground font-semibold">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="font-bold text-foreground">
                              {r.repName}
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground text-[11px]">
                              {r.phone}
                            </TableCell>
                            <TableCell className="text-center font-mono font-bold">
                              {r.invoicesCount}
                            </TableCell>
                            <TableCell className="text-left font-mono font-bold text-blue-700 dark:text-blue-400">
                              {r.totalSales.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-left font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                              {r.cashCollected.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-left font-mono text-amber-600 dark:text-amber-400">
                              {r.creditSales.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-left font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                              {r.cashRemitted.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-left font-mono font-bold">
                              <span className={cashPendingWithRep > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                                {cashPendingWithRep.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                              </span>
                            </TableCell>
                            <TableCell className="text-left font-mono font-bold text-purple-700 dark:text-purple-400">
                              {r.custodyValue.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                  <TableFooter className="bg-muted/60 text-xs font-bold border-t-2">
                    <TableRow>
                      <TableCell colSpan={4} className="text-right">
                        إجمالي النتائج:
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-blue-700 dark:text-blue-400">
                        {summary.grandTotalSales.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                        {summary.grandTotalPaid.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-amber-600 dark:text-amber-400">
                        {summary.grandTotalCredit.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-indigo-600 dark:text-indigo-400">
                        {summary.grandTotalRemitted.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-amber-600 dark:text-amber-400">
                        {Math.max(0, summary.grandTotalPaid - summary.grandTotalRemitted).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-purple-700 dark:text-purple-400">
                        {summary.grandTotalCustody.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Detailed Invoices */}
        <TabsContent value="invoices">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-2 border-b">
              <CardTitle className="text-sm font-semibold">
                فواتير البيع المحررة عبر المناديب ({detailedInvoices.length} فاتورة)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 text-xs">
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>رقم الفاتورة</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>المندوب</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead className="text-left font-mono">الإجمالي</TableHead>
                      <TableHead className="text-left font-mono">المدفوع نقداً</TableHead>
                      <TableHead className="text-left font-mono">المتبقي آجل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailedInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-xs">
                          لا توجد فواتير مناديب مسجلة خلال الفترة.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailedInvoices.map((inv, idx) => (
                        <TableRow key={inv.id || idx} className="text-xs hover:bg-muted/40 transition-colors border-b">
                          <TableCell className="text-center font-mono text-muted-foreground font-semibold">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-mono font-bold text-foreground">
                            {inv.invoiceNumber}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground text-[11px]">
                            {new Date(inv.date).toLocaleDateString("ar-EG")}
                          </TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {inv.repName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {inv.customerName}
                          </TableCell>
                          <TableCell className="text-left font-mono font-bold text-blue-700 dark:text-blue-400">
                            {inv.total.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-left font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            {inv.paid.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-left font-mono text-amber-600 dark:text-amber-400">
                            {inv.remaining > 0 ? inv.remaining.toLocaleString("ar-EG", { minimumFractionDigits: 2 }) : "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  <TableFooter className="bg-muted/60 text-xs font-bold border-t-2">
                    <TableRow>
                      <TableCell colSpan={5} className="text-right">
                        إجمالي الفواتير المعروضة:
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-blue-700 dark:text-blue-400">
                        {summary.grandTotalSales.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                        {summary.grandTotalPaid.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell className="text-left font-mono text-sm font-black text-amber-600 dark:text-amber-400">
                        {summary.grandTotalCredit.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
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

