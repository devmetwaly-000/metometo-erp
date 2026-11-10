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
  DollarSign,
  PieChart,
  Calendar,
  Wallet,
  TrendingUp,
  Building2,
  FileSpreadsheet,
  Search,
  Tag
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function ExpensesReportPage() {
  const { expenses, cashAccounts, warehouses, loading } = useData();

  // Filters State
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Cash Accounts Map
  const accountsMap = useMemo(() => {
    const map = new Map<string, string>();
    (cashAccounts || []).forEach((acc: any) => map.set(acc.id, acc.name));
    return map;
  }, [cashAccounts]);

  // Unique Categories
  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    (expenses || []).forEach((exp: any) => {
      const cat = exp.category || exp.Category || exp.expenseType || "مصروفات عامة";
      if (cat) set.add(cat);
    });
    return Array.from(set).sort();
  }, [expenses]);

  // Unique Branches
  const uniqueBranches = useMemo(() => {
    const set = new Set<string>();
    (expenses || []).forEach((exp: any) => {
      const b = exp.branchName || exp.BranchName;
      if (b) set.add(b);
    });
    return Array.from(set).sort();
  }, [expenses]);

  // Filtered Expenses & Aggregations
  const { filteredExpenses, summary, categoryBreakdown } = useMemo(() => {
    const start = fromDate ? new Date(fromDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    const end = toDate ? new Date(toDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    let totalAmount = 0;
    const catMap = new Map<string, number>();

    const list = (expenses || []).filter((exp: any) => {
      const d = new Date(exp.date || exp.Date);
      if (start && d < start) return false;
      if (end && d > end) return false;

      const cat = exp.category || exp.Category || exp.expenseType || "مصروفات عامة";
      if (selectedCategory !== "all" && cat !== selectedCategory) return false;

      const branch = exp.branchName || exp.BranchName;
      if (selectedBranch !== "all" && branch !== selectedBranch) return false;

      const accId = exp.accountId || exp.AccountId || exp.cashAccountId;
      if (selectedAccountId !== "all" && accId !== selectedAccountId) return false;

      const notes = exp.notes || exp.Notes || exp.description || "";
      const voucher = exp.voucherNumber || exp.VoucherNumber || exp.receiptNumber || "";
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!notes.toLowerCase().includes(q) && !voucher.toLowerCase().includes(q) && !cat.toLowerCase().includes(q)) {
          return false;
        }
      }

      const amount = Number(exp.amount || exp.Amount) || 0;
      totalAmount += amount;
      catMap.set(cat, (catMap.get(cat) || 0) + amount);

      return true;
    });

    list.sort((a, b) => new Date(b.date || b.Date).getTime() - new Date(a.date || a.Date).getTime());

    // Calculate days for average
    let daysDiff = 1;
    if (start && end) {
      daysDiff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    }

    // Top Category
    let topCatName = "-";
    let topCatAmount = 0;
    const catArray = Array.from(catMap.entries()).map(([name, amount]) => {
      if (amount > topCatAmount) {
        topCatAmount = amount;
        topCatName = name;
      }
      return {
        name,
        amount,
        percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0
      };
    });
    catArray.sort((a, b) => b.amount - a.amount);

    return {
      filteredExpenses: list,
      summary: {
        totalAmount,
        vouchersCount: list.length,
        dailyAverage: totalAmount / daysDiff,
        topCategoryName: topCatName,
        topCategoryAmount: topCatAmount
      },
      categoryBreakdown: catArray
    };
  }, [expenses, fromDate, toDate, selectedCategory, selectedBranch, selectedAccountId, searchQuery]);

  // Export to Excel
  const handleExportExcel = () => {
    const dataToExport = filteredExpenses.map((exp: any, idx: number) => ({
      "م": idx + 1,
      "رقم السند": exp.voucherNumber || exp.VoucherNumber || exp.id || "-",
      "التاريخ": new Date(exp.date || exp.Date).toLocaleDateString("ar-EG"),
      "الفرع": exp.branchName || exp.BranchName || "الفرع الرئيسي",
      "التصنيف": exp.category || exp.Category || exp.expenseType || "مصروفات عامة",
      "البند الفرعي": exp.subCategory || exp.SubCategory || "-",
      "المبلغ": Number(exp.amount || exp.Amount) || 0,
      "حساب الصرف (الخزينة)": accountsMap.get(exp.accountId || exp.AccountId) || "الخزينة الرئيسية",
      "البيان / الملاحظات": exp.notes || exp.Notes || exp.description || "-",
      "المسؤول": exp.createdByName || exp.CreatedByName || exp.userName || "-"
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير المصروفات");
    XLSX.writeFile(wb, `تقرير_المصروفات_${todayStr}.xlsx`);
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
        <p className="text-sm text-muted-foreground animate-pulse font-medium">جاري إعداد تقرير وتحليل المصروفات...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full pb-10 space-y-6">
      {/* 1. Header with Actions */}
      <PageHeader title="تقرير المصروفات والتحليل المالي">
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
              <span>إجمالي المصروفات في الفترة</span>
              <DollarSign className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-400">
              {summary.totalAmount.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              مجموع {summary.vouchersCount} سند صرف
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>أعلى بند استهلاك للمصروفات</span>
              <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-lg font-bold truncate text-amber-700 dark:text-amber-400" title={summary.topCategoryName}>
              {summary.topCategoryName}
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
              {summary.topCategoryAmount.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>متوسط الإنفاق اليومي</span>
              <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-blue-700 dark:text-blue-400">
              {summary.dailyAverage.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              معدل الصرف اليومي خلال الفترة
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>عدد بنود وتصنيفات الصرف</span>
              <Tag className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {categoryBreakdown.length}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              بند مصروف تشغيلي مختلف
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Category Distribution Bars */}
      {categoryBreakdown.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="p-4 pb-2 border-b">
            <CardTitle className="text-xs font-bold text-muted-foreground flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              <span>توزيع المصروفات حسب البنود الرئيسية ونسبتها من الإجمالي:</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {categoryBreakdown.slice(0, 6).map((cat, idx) => (
                <div key={idx} className="bg-muted/30 p-2.5 rounded-lg border text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-medium">
                    <span className="truncate">{cat.name}</span>
                    <span className="font-mono font-bold text-primary">{cat.amount.toLocaleString()} ج.م</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={cat.percentage} className="h-2 flex-1" />
                    <span className="font-mono text-[11px] text-muted-foreground w-10 text-left font-semibold">
                      {cat.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. Filter Bar */}
      <Card className="border shadow-sm no-print">
        <CardHeader className="p-4 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-primary" />
              <span>خيارات وفلاتر التقرير</span>
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
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">بند المصروف</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل البنود" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل البنود ({uniqueCategories.length})</SelectItem>
                  {uniqueCategories.map((c: string) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">الفرع</Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل الفروع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  {uniqueBranches.map((b: string) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">الخزينة / الحساب المنصرف منه</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل الخزائن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الخزائن والحسابات</SelectItem>
                  {(cashAccounts || []).map((acc: any) => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">بحث في البيان والسندات</Label>
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

      {/* 5. Detailed Expenses Table */}
      <Card className="border shadow-sm">
        <CardHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              سندات وحركات المصروفات التفصيلية ({filteredExpenses.length})
            </CardTitle>
            <Badge variant="outline" className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
              الإجمالي: {summary.totalAmount.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 text-xs">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>رقم السند</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الفرع</TableHead>
                  <TableHead>بند المصروف</TableHead>
                  <TableHead>البند الفرعي</TableHead>
                  <TableHead className="text-left font-mono">المبلغ</TableHead>
                  <TableHead>حساب الخزينة المنصرف منه</TableHead>
                  <TableHead>البيان والملاحظات</TableHead>
                  <TableHead className="w-28 text-center">المسؤول</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground text-xs">
                      لا توجد سندات مصروفات مطابقة للبحث والفترة المحددة.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExpenses.map((exp: any, idx: number) => {
                    const amount = Number(exp.amount || exp.Amount) || 0;

                    return (
                      <TableRow key={exp.id || idx} className="text-xs hover:bg-muted/40 transition-colors border-b">
                        <TableCell className="text-center font-mono text-muted-foreground font-semibold">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-mono font-bold text-foreground">
                          {exp.voucherNumber || exp.VoucherNumber || exp.id?.slice(0, 8) || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {new Date(exp.date || exp.Date).toLocaleDateString("ar-EG")}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[11px]">
                          {exp.branchName || exp.BranchName || "الفرع الرئيسي"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20 px-1.5 py-0">
                            {exp.category || exp.Category || exp.expenseType || "مصروفات عامة"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[11px]">
                          {exp.subCategory || exp.SubCategory || "-"}
                        </TableCell>
                        <TableCell className="text-left font-mono font-bold text-rose-600 dark:text-rose-400">
                          {amount.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[11px] font-medium">
                          {accountsMap.get(exp.accountId || exp.AccountId) || "الخزينة الرئيسية"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-[11px]" title={exp.notes || exp.Notes || exp.description}>
                          {exp.notes || exp.Notes || exp.description || "-"}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground text-[11px]">
                          {exp.createdByName || exp.CreatedByName || exp.userName || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              <TableFooter className="bg-muted/60 text-xs font-bold border-t-2">
                <TableRow>
                  <TableCell colSpan={6} className="text-right">
                    إجمالي سندات المصروفات ({filteredExpenses.length} سند):
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-rose-600 dark:text-rose-400">
                    {summary.totalAmount.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell colSpan={3}></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
