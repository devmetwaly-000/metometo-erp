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
  TrendingDown,
  TrendingUp,
  CreditCard,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Search,
  BadgeCheck
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function PayrollReportPage() {
  const { employees, payrollRecords, employeeAdvances, employeeAdjustments, loading } = useData();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Process Payroll rows
  const { payrollRows, summary } = useMemo(() => {
    let totalBasic = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;
    let totalAdvancesDeducted = 0;
    let totalNet = 0;
    let paidCount = 0;
    let pendingCount = 0;

    const list = (employees || []).filter((emp: any) => {
      if (selectedEmployeeId !== "all" && emp.id !== selectedEmployeeId) return false;

      const name = String(emp.name || emp.Name || "").toLowerCase();
      const code = String(emp.code || emp.Code || "").toLowerCase();
      const title = String(emp.jobTitle || emp.JobTitle || "").toLowerCase();

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!name.includes(q) && !code.includes(q) && !title.includes(q)) {
          return false;
        }
      }

      return true;
    }).map((emp: any, idx: number) => {
      // Find matching payroll record if exists
      const pRecord = (payrollRecords || []).find((pr: any) => {
        const empMatch = (pr.employeeId === emp.id || pr.EmployeeId === emp.id);
        const mMatch = String(pr.month || pr.Month) === selectedMonth;
        const yMatch = String(pr.year || pr.Year) === selectedYear;
        return empMatch && mMatch && yMatch;
      });

      const basic = Number(pRecord?.basicSalary || pRecord?.BaseSalary || emp.basicSalary || emp.salary || 0);

      // Adjustments for month
      let allowances = Number(pRecord?.allowances || pRecord?.Allowances || 0);
      let deductions = Number(pRecord?.deductions || pRecord?.Deductions || 0);

      if (!pRecord) {
        // Calculate dynamic adjustments if not yet in payroll record
        (employeeAdjustments || []).forEach((adj: any) => {
          if (adj.employeeId !== emp.id) return;
          const d = new Date(adj.date || adj.Date);
          if (d.getMonth() + 1 === Number(selectedMonth) && d.getFullYear() === Number(selectedYear)) {
            const amt = Number(adj.amount || 0);
            if (adj.type === "bonus" || adj.type === "allowance" || adj.type === "مكافأة") {
              allowances += amt;
            } else {
              deductions += amt;
            }
          }
        });
      }

      const advancesDeducted = Number(pRecord?.advancesDeducted || pRecord?.AdvancesDeducted || 0);
      const netSalary = Math.max(0, basic + allowances - deductions - advancesDeducted);
      const isPaid = pRecord?.isPaid || pRecord?.paymentStatus === "paid" || pRecord?.status === "paid";

      if (paymentStatusFilter === "paid" && !isPaid) return null;
      if (paymentStatusFilter === "pending" && isPaid) return null;

      totalBasic += basic;
      totalAllowances += allowances;
      totalDeductions += deductions;
      totalAdvancesDeducted += advancesDeducted;
      totalNet += netSalary;

      if (isPaid) paidCount++;
      else pendingCount++;

      return {
        id: emp.id,
        code: emp.code || emp.Code || `EMP-${idx + 1}`,
        name: emp.name || emp.Name,
        jobTitle: emp.jobTitle || emp.JobTitle || emp.role || "موظف",
        department: emp.department || emp.Department || "عام",
        branchName: emp.branchName || "الفرع الرئيسي",
        basic,
        allowances,
        deductions,
        advancesDeducted,
        netSalary,
        isPaid,
        paidDate: pRecord?.paidDate || pRecord?.PaidDate
      };
    }).filter(Boolean);

    return {
      payrollRows: list,
      summary: {
        totalBasic,
        totalAllowances,
        totalDeductions,
        totalAdvancesDeducted,
        totalNet,
        paidCount,
        pendingCount,
        employeesCount: list.length
      }
    };
  }, [employees, payrollRecords, employeeAdjustments, selectedMonth, selectedYear, selectedEmployeeId, paymentStatusFilter, searchQuery]);

  // Export to Excel
  const handleExportExcel = () => {
    const dataToExport = payrollRows.map((r: any, idx: number) => ({
      "م": idx + 1,
      "كود الموظف": r.code,
      "اسم الموظف": r.name,
      "الوظيفة": r.jobTitle,
      "الفرع": r.branchName,
      "الراتب الأساسي": r.basic,
      "البدلات والمكافآت": r.allowances,
      "الخصومات والجزاءات": r.deductions,
      "السلف المستقطعة": r.advancesDeducted,
      "صافي الراتب المستحق": r.netSalary,
      "حالة الصرف": r.isPaid ? "تم الصرف" : "مستحق للصرف"
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف الرواتب والأجور");
    XLSX.writeFile(wb, `كشف_الرواتب_${selectedMonth}_${selectedYear}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-32 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse font-medium">جاري إعداد واحتساب كشف الرواتب والأجور...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full pb-10 space-y-6">
      {/* 1. Header with Actions */}
      <PageHeader title="تقرير كشف الرواتب والأجور ومستحقات الموظفين">
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
            طباعة مسير الرواتب
          </Button>
        </div>
      </PageHeader>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <Card className="border shadow-sm bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>إجمالي الرواتب الأساسية</span>
              <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-blue-700 dark:text-blue-400">
              {summary.totalBasic.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              مجموع {summary.employeesCount} موظف
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>البدلات والمكافآت</span>
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {summary.totalAllowances.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              حوافز وبدلات إضافية
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-rose-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>الخصومات والجزاءات</span>
              <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-rose-700 dark:text-rose-400">
              {summary.totalDeductions.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              استقطاعات وغيابات
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>السلف المستقطعة</span>
              <CreditCard className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400">
              {summary.totalAdvancesDeducted.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              أقساط سلف مستردة
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-gradient-to-br from-indigo-500/5 to-transparent">
          <CardHeader className="p-3.5 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>صافي الرواتب المستحقة</span>
              <BadgeCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-indigo-700 dark:text-indigo-400">
              {summary.totalNet.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              صافي مسير الرواتب للشهر
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Filter Bar */}
      <Card className="border shadow-sm no-print">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-primary" />
            <span>تحديد الشهر وخيارات كشف الرواتب</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">الشهر</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-8 text-xs font-mono">
                  <SelectValue placeholder="الشهر" />
                </SelectTrigger>
                <SelectContent>
                  {[...Array(12)].map((_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      شهر {i + 1} ({new Date(2026, i, 1).toLocaleString("ar-EG", { month: "long" })})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">السنة</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="h-8 text-xs font-mono">
                  <SelectValue placeholder="السنة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2027">2027</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">الموظف</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل الموظفين" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الموظفين ({employees?.length || 0})</SelectItem>
                  {(employees || []).map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">حالة الصرف</Label>
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="كل الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="paid">تم الصرف</SelectItem>
                  <SelectItem value="pending">مستحق / لم يصرف بعد</SelectItem>
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

      {/* 4. Table */}
      <Card className="border shadow-sm">
        <CardHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">
                مسير رواتب شهر {selectedMonth} لسنة {selectedYear} ({payrollRows.length} موظف)
              </CardTitle>
            </div>
            <Badge variant="outline" className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-400">
              صافي المسير: {summary.totalNet.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 text-xs">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>كود الموظف</TableHead>
                  <TableHead>اسم الموظف</TableHead>
                  <TableHead>الوظيفة / القسم</TableHead>
                  <TableHead>الفرع</TableHead>
                  <TableHead className="text-left font-mono">الأساسي</TableHead>
                  <TableHead className="text-left font-mono text-emerald-600">+ البدلات</TableHead>
                  <TableHead className="text-left font-mono text-rose-600">- الخصومات</TableHead>
                  <TableHead className="text-left font-mono text-amber-600">- السلف</TableHead>
                  <TableHead className="text-left font-mono font-bold">صافي الراتب</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground text-xs">
                      لا يوجد موظفون مسجلون مطابقون للشهر والفلتر المحدد.
                    </TableCell>
                  </TableRow>
                ) : (
                  payrollRows.map((r: any, idx: number) => (
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
                        {r.jobTitle}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">
                        {r.branchName}
                      </TableCell>
                      <TableCell className="text-left font-mono">
                        {r.basic.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-left font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        {r.allowances > 0 ? `+${r.allowances.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}` : "-"}
                      </TableCell>
                      <TableCell className="text-left font-mono text-rose-600 dark:text-rose-400 font-semibold">
                        {r.deductions > 0 ? `-${r.deductions.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}` : "-"}
                      </TableCell>
                      <TableCell className="text-left font-mono text-amber-600 dark:text-amber-400 font-semibold">
                        {r.advancesDeducted > 0 ? `-${r.advancesDeducted.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}` : "-"}
                      </TableCell>
                      <TableCell className="text-left font-mono font-bold text-sm text-indigo-700 dark:text-indigo-400">
                        {r.netSalary.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.isPaid ? (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-300">
                            تم الصرف
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-300">
                            مستحق
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter className="bg-muted/60 text-xs font-bold border-t-2">
                <TableRow>
                  <TableCell colSpan={5} className="text-right">
                    إجمالي مسير الرواتب:
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-foreground">
                    {summary.totalBasic.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-emerald-600">
                    {summary.totalAllowances.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-rose-600">
                    {summary.totalDeductions.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-amber-600">
                    {summary.totalAdvancesDeducted.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell className="text-left font-mono text-sm font-black text-indigo-700 dark:text-indigo-400">
                    {summary.totalNet.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

