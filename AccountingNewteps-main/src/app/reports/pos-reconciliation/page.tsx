"use client";

import React, { useState, useMemo, useRef } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
import { useData } from "@/contexts/data-provider";
import {
  Loader2,
  Printer,
  ShieldCheck,
  AlertTriangle,
  Scale,
  CreditCard,
  Banknote,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  XCircle,
  FileSpreadsheet
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ItemRow {
  id: string;
  name: string;
  code?: string;
  qty: number;
  price: number;
  total: number;
}

interface PaymentRow {
  id?: string;
  method: string;
  amount: number;
}

export default function PosReconciliationAuditReportPage() {
  const { posSales, posReturns, posSessions, gratuityLogs, users, warehouses, loading } = useData();
  const printRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState({
    cashierId: "all",
    warehouseId: "all",
    statusFilter: "all", // all, discrepancy_only, matched_only
    fromDate: "",
    toDate: "",
    searchQuery: "",
  });

  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // معالجة ومطابقة كل فاتورة بين الأصناف المباعة وحركات السداد
  const auditedSales = useMemo(() => {
    if (loading) return [];

    // تجميع الإكراميات المسجلة حسب رقم الفاتورة أو معرفها
    const tipsMap = new Map<string, number>();
    for (const gl of (gratuityLogs || [])) {
      const amt = Number(gl?.amount || 0);
      if (amt > 0) {
        if (gl.invoiceNumber) tipsMap.set(String(gl.invoiceNumber), (tipsMap.get(String(gl.invoiceNumber)) || 0) + amt);
        if (gl.invoiceId) tipsMap.set(String(gl.invoiceId), (tipsMap.get(String(gl.invoiceId)) || 0) + amt);
      }
    }

    return (posSales || []).map((sale: any) => {
      const items: ItemRow[] = sale.items || [];
      const payments: PaymentRow[] = sale.payments || [];

      // 1. حساب إجمالي الأصناف الفعلي من واقع السطور (الكمية × السعر)
      const calculatedItemsGross = items.reduce((sum, it) => sum + (Number(it.qty || 0) * Number(it.price || 0)), 0);
      const discount = Number(sale.discount || 0);
      const taxAmount = Number(sale.taxAmount || 0);
      const calculatedItemsNet = Math.max(0, calculatedItemsGross - discount + taxAmount);

      // الإكرامية والباقي للعميل
      const tipsAmount = Number(sale.tips || 0) || tipsMap.get(String(sale.invoiceNumber || '')) || tipsMap.get(String(sale.id || '')) || 0;

      // 2. إجمالي الفاتورة المسجل رسمياً (مع احتساب الإكرامية إن لم تكن مضافة في Total)
      const rawInvoiceTotal = Number(sale.total || 0);
      const itemsPlusTips = Number((calculatedItemsNet + tipsAmount).toFixed(2));
      const invoiceTotal = (tipsAmount > 0 && Math.abs(rawInvoiceTotal - calculatedItemsNet) <= 0.05)
        ? itemsPlusTips
        : rawInvoiceTotal;

      // 3. إجمالي حركات السداد الموزعة (كاش + شبكة + آجل)
      let rawPaidFromPayments = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      
      // إذا لم يكن هناك مصفوفة payments صريحة، نعتمد paidAmount المسجل
      if (payments.length === 0 && (sale.paidAmount !== undefined || invoiceTotal > 0)) {
        rawPaidFromPayments = Number(sale.paidAmount ?? invoiceTotal);
      }

      // الباقي المرتجع للعميل (Change): إن وُجد صراحةً أو كفرق تسليم نقدية أكبر من قيمة الفاتورة
      const changeAmount = sale.change !== undefined
        ? Math.max(0, Number(sale.change || 0))
        : (payments.length === 0 && rawPaidFromPayments > invoiceTotal ? Number((rawPaidFromPayments - invoiceTotal).toFixed(2)) : 0);

      const totalPaidFromPayments = Math.max(0, Number((rawPaidFromPayments - changeAmount).toFixed(2)));

      // تفصيل وسائل الدفع (خصم الباقي من الكاش)
      const rawCashAmount = payments
        .filter(p => !p.method || p.method.toLowerCase().includes('cash') || p.method.includes('نقد'))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0) || (payments.length === 0 ? Number(sale.paidAmount ?? invoiceTotal) : 0);
      const cashAmount = Math.max(0, Number((rawCashAmount - changeAmount).toFixed(2)));

      const cardAmount = payments
        .filter(p => p.method && (p.method.toLowerCase().includes('card') || p.method.toLowerCase().includes('visa') || p.method.includes('شبكة') || p.method.includes('فيزا') || p.method.includes('مدى') || p.method.includes('ماستر')))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const otherAmount = Math.max(0, totalPaidFromPayments - cashAmount - cardAmount);

      // الفارق الرقابي: المطلوب (الأصناف + الإكرامية) - صافي المحصل الفعلي (بعد استبعاد الباقي المرتجع)
      const discrepancy = Number((invoiceTotal - totalPaidFromPayments).toFixed(2));
      const hasDiscrepancy = Math.abs(discrepancy) > 0.05;

      return {
        ...sale,
        itemsCount: items.length,
        itemsTotalQuantity: items.reduce((sum, it) => sum + Number(it.qty || 0), 0),
        calculatedItemsGross,
        calculatedItemsNet,
        tipsAmount,
        changeAmount,
        invoiceTotal,
        totalPaidFromPayments,
        cashAmount,
        cardAmount,
        otherAmount,
        discrepancy,
        hasDiscrepancy,
        status: hasDiscrepancy ? 'discrepancy' : 'matched',
      };
    }).filter((sale: any) => {
      const saleDate = new Date(sale.date);
      const from = filters.fromDate ? new Date(filters.fromDate) : null;
      const to = filters.toDate ? new Date(filters.toDate) : null;
      if (from) from.setHours(0, 0, 0, 0);
      if (to) to.setHours(23, 59, 59, 999);

      if (from && saleDate < from) return false;
      if (to && saleDate > to) return false;
      if (filters.cashierId !== 'all' && sale.cashierId !== filters.cashierId) return false;
      if (filters.warehouseId !== 'all' && sale.warehouseId !== filters.warehouseId) return false;
      
      if (filters.statusFilter === 'discrepancy_only' && !sale.hasDiscrepancy) return false;
      if (filters.statusFilter === 'matched_only' && sale.hasDiscrepancy) return false;

      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const num = (sale.invoiceNumber || '').toLowerCase();
        const cashier = (sale.cashierName || '').toLowerCase();
        const cust = (sale.customerName || '').toLowerCase();
        return num.includes(q) || cashier.includes(q) || cust.includes(q);
      }

      return true;
    }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [posSales, gratuityLogs, filters, loading]);

  // إحصائيات المطابقة الشاملة
  const stats = useMemo(() => {
    let totalItemsValue = 0;
    let totalPaymentsValue = 0;
    let totalCashValue = 0;
    let totalCardValue = 0;
    let totalDiscrepancies = 0;
    let discrepancyCount = 0;
    let matchedCount = 0;

    auditedSales.forEach((s: any) => {
      totalItemsValue += s.invoiceTotal;
      totalPaymentsValue += s.totalPaidFromPayments;
      totalCashValue += s.cashAmount;
      totalCardValue += s.cardAmount;
      if (s.hasDiscrepancy) {
        discrepancyCount++;
        totalDiscrepancies += Math.abs(s.discrepancy);
      } else {
        matchedCount++;
      }
    });

    const netVariance = totalItemsValue - totalPaymentsValue;

    return {
      totalInvoices: auditedSales.length,
      totalItemsValue,
      totalPaymentsValue,
      totalCashValue,
      totalCardValue,
      totalDiscrepancies,
      discrepancyCount,
      matchedCount,
      netVariance,
      accuracyRate: auditedSales.length > 0 ? ((matchedCount / auditedSales.length) * 100).toFixed(1) : "100",
    };
  }, [auditedSales]);

  // خيارات الفلاتر
  const cashierOptions = useMemo(() => {
    const list = (users || []).filter((u: any) => u.isCashier || u.role?.includes('كاشير'));
    return [
      { value: 'all', label: 'جميع الكاشيرات' },
      ...list.map((u: any) => ({ value: u.id, label: u.name }))
    ];
  }, [users]);

  const warehouseOptions = useMemo(() => {
    return [
      { value: 'all', label: 'جميع الفروع / المخازن' },
      ...(warehouses || []).map((w: any) => ({ value: w.id, label: w.name }))
    ];
  }, [warehouses]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقرير الرقابة والمطابقة لنقاط البيع (POS Audit & Reconciliation)"
        description="المطابقة الرقابية الدقيقة بين قيمة الأصناف الفعلية المباعة من واقع البنود وحركات السداد المحصلة (كاش/فيزا) لرصد أي تلاعب أو عجز."
      >
        <Button onClick={handlePrint} variant="outline" className="gap-2">
          <Printer className="h-4 w-4" />
          طباعة التقرير الرقابي
        </Button>
      </PageHeader>

      {/* بطاقات المؤشرات الرقابية العليا */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-foreground">إجمالي قيمة مبيعات الأصناف (الفعلية)</CardDescription>
            <CardTitle className="text-2xl font-black text-primary font-mono">
              {stats.totalItemsValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground flex justify-between">
            <span>عدد الفواتير: {stats.totalInvoices}</span>
            <span>نسبة الانضباط: %{stats.accuracyRate}</span>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-foreground">إجمالي حركات السداد المحصلة</CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600 font-mono">
              {stats.totalPaymentsValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground flex justify-between">
            <span className="flex items-center gap-1"><Banknote className="h-3 w-3" /> كاش: {stats.totalCashValue.toLocaleString()}</span>
            <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" /> شبكة: {stats.totalCardValue.toLocaleString()}</span>
          </CardContent>
        </Card>

        <Card className={`border-2 ${Math.abs(stats.netVariance) > 0.05 ? 'border-destructive/40 bg-destructive/5' : 'border-green-500/20 bg-green-500/5'}`}>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-foreground">صافي الفارق الرقابي (الأصناف - السداد)</CardDescription>
            <CardTitle className={`text-2xl font-black font-mono ${Math.abs(stats.netVariance) > 0.05 ? 'text-destructive' : 'text-green-600'}`}>
              {stats.netVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground flex justify-between">
            {Math.abs(stats.netVariance) > 0.05 ? (
              <span className="text-destructive font-bold flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> يوجد عدم تطابق يتطلب التدقيق
              </span>
            ) : (
              <span className="text-green-600 font-bold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> متطابق تماماً 100%
              </span>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold text-foreground">الفواتير التي بها انحراف رقابي</CardDescription>
            <CardTitle className="text-2xl font-black text-amber-600 font-mono">
              {stats.discrepancyCount} <span className="text-sm font-normal text-muted-foreground">فاتورة</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground flex justify-between">
            <span>الفواتير السليمة: {stats.matchedCount}</span>
            <span>قيمة الانحراف: {stats.totalDiscrepancies.toLocaleString()} ج.م</span>
          </CardContent>
        </Card>
      </div>

      {/* لوحة الفلاتر المتقدمة */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            فلاتر البحث والمطابقة الرقابية
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">بحث (رقم الفاتورة / الكاشير)</Label>
            <div className="relative">
              <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الإيصال..."
                value={filters.searchQuery}
                onChange={e => handleFilterChange('searchQuery', e.target.value)}
                className="pr-8 h-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">الكاشير</Label>
            <Combobox
              options={cashierOptions}
              value={filters.cashierId}
              onValueChange={v => handleFilterChange('cashierId', v)}
              placeholder="اختر كاشير..."
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">الفرع / المخزن</Label>
            <Combobox
              options={warehouseOptions}
              value={filters.warehouseId}
              onValueChange={v => handleFilterChange('warehouseId', v)}
              placeholder="اختر الفرع..."
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">من تاريخ</Label>
            <Input
              type="date"
              value={filters.fromDate}
              onChange={e => handleFilterChange('fromDate', e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">إلى تاريخ</Label>
            <Input
              type="date"
              value={filters.toDate}
              onChange={e => handleFilterChange('toDate', e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* تبويبات العرض الرقابي */}
      <Tabs defaultValue="all" onValueChange={v => handleFilterChange('statusFilter', v)} className="w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
          <TabsList className="grid grid-cols-3 w-full sm:w-[450px]">
            <TabsTrigger value="all" className="text-xs">كافة الفواتير ({stats.totalInvoices})</TabsTrigger>
            <TabsTrigger value="discrepancy_only" className="text-xs text-destructive font-bold">
              فواتير بها انحراف ({stats.discrepancyCount})
            </TabsTrigger>
            <TabsTrigger value="matched_only" className="text-xs text-green-600 font-bold">
              الفواتير المتطابقة ({stats.matchedCount})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* الجدول التفصيلي المقارن */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-center font-bold">رقم الإيصال</TableHead>
                    <TableHead className="text-center font-bold">التاريخ والوقت</TableHead>
                    <TableHead className="text-center font-bold">الكاشير</TableHead>
                    <TableHead className="text-center font-bold">عدد البنود</TableHead>
                    <TableHead className="text-center font-bold bg-primary/5 text-primary">قيمة الأصناف (المطلوب)</TableHead>
                    <TableHead className="text-center font-bold bg-emerald-500/5 text-emerald-700 dark:text-emerald-400">إجمالي السداد (المحصل)</TableHead>
                    <TableHead className="text-center font-bold">كاش</TableHead>
                    <TableHead className="text-center font-bold">شبكة / فيزا</TableHead>
                    <TableHead className="text-center font-bold">الفارق الرقابي</TableHead>
                    <TableHead className="text-center font-bold">الحالة الرقابية</TableHead>
                    <TableHead className="text-center font-bold">فحص البنود</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
                        <p className="text-sm text-muted-foreground">جاري تدقيق ومطابقة فواتير نقاط البيع...</p>
                      </TableCell>
                    </TableRow>
                  ) : auditedSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                        لا توجد فواتير مطابقة لمعايير البحث المحددة.
                      </TableCell>
                    </TableRow>
                  ) : (
                    auditedSales.map((sale: any) => (
                      <TableRow key={sale.id} className={sale.hasDiscrepancy ? 'bg-destructive/5 hover:bg-destructive/10' : ''}>
                        <TableCell className="text-center font-mono font-bold">{sale.invoiceNumber}</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground font-mono">
                          {new Date(sale.date).toLocaleDateString('ar-EG')} {new Date(sale.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell className="text-center font-medium">{sale.cashierName || 'غير محدد'}</TableCell>
                        <TableCell className="text-center font-mono">{sale.itemsCount} بند ({sale.itemsTotalQuantity} قطة)</TableCell>
                        <TableCell className="text-center font-mono font-bold bg-primary/5 text-primary">
                          {sale.invoiceTotal.toFixed(2)} ج.م
                        </TableCell>
                        <TableCell className="text-center font-mono font-bold bg-emerald-500/5 text-emerald-700 dark:text-emerald-400">
                          {sale.totalPaidFromPayments.toFixed(2)} ج.م
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">{sale.cashAmount > 0 ? `${sale.cashAmount.toFixed(2)}` : '-'}</TableCell>
                        <TableCell className="text-center font-mono text-xs">{sale.cardAmount > 0 ? `${sale.cardAmount.toFixed(2)}` : '-'}</TableCell>
                        <TableCell className="text-center font-mono font-bold">
                          {sale.hasDiscrepancy ? (
                            <span className="text-destructive font-black">
                              {sale.discrepancy > 0 ? `+${sale.discrepancy.toFixed(2)} عجز` : `${sale.discrepancy.toFixed(2)} زيادة`}
                            </span>
                          ) : (
                            <span className="text-green-600 font-bold">0.00</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {sale.hasDiscrepancy ? (
                            <Badge variant="destructive" className="gap-1 text-[10px]">
                              <AlertTriangle className="h-3 w-3" /> انحراف رقابي
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-500/30 bg-green-500/10 gap-1 text-[10px]">
                              <CheckCircle2 className="h-3 w-3" /> متطابق
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setSelectedInvoice(sale)}
                            title="مطابقة البنود ووسائل السداد"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {auditedSales.length > 0 && (
                  <TableFooter className="bg-muted font-bold">
                    <TableRow>
                      <TableCell colSpan={4} className="text-center font-black">الإجماليات العامة للمطابقة:</TableCell>
                      <TableCell className="text-center font-mono font-black text-primary text-base">
                        {stats.totalItemsValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell className="text-center font-mono font-black text-emerald-700 dark:text-emerald-400 text-base">
                        {stats.totalPaymentsValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell className="text-center font-mono">{stats.totalCashValue.toLocaleString()} ج.م</TableCell>
                      <TableCell className="text-center font-mono">{stats.totalCardValue.toLocaleString()} ج.م</TableCell>
                      <TableCell className="text-center font-mono font-black text-destructive">
                        {stats.netVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                      </TableCell>
                      <TableCell colSpan={2} className="text-center">
                        نسبة المطابقة: %{stats.accuracyRate}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
        </Card>
      </Tabs>

      {/* نافذة تفصيل الفحص والتدقيق الرقابي للإيصال المحدد */}
      <Dialog open={Boolean(selectedInvoice)} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between border-b pb-3">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                فحص وتدقيق بنود الإيصال رقم: {selectedInvoice?.invoiceNumber}
              </span>
              {selectedInvoice?.hasDiscrepancy ? (
                <Badge variant="destructive">انحراف: {selectedInvoice?.discrepancy} ج.م</Badge>
              ) : (
                <Badge className="bg-green-600 text-white">متطابق تماماً</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg text-xs">
                <div><span className="text-muted-foreground">الكاشير:</span> <strong className="block">{selectedInvoice.cashierName}</strong></div>
                <div><span className="text-muted-foreground">التاريخ:</span> <strong className="block">{new Date(selectedInvoice.date).toLocaleString('ar-EG')}</strong></div>
                <div><span className="text-muted-foreground">إجمالي الأصناف:</span> <strong className="block font-mono text-primary font-bold">{selectedInvoice.invoiceTotal} ج.م</strong></div>
                <div><span className="text-muted-foreground">المسدد بحركات الدفع:</span> <strong className="block font-mono text-emerald-600 font-bold">{selectedInvoice.totalPaidFromPayments} ج.م</strong></div>
              </div>

              {/* جدول بنود الأصناف */}
              <div>
                <h4 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                  <Scale className="h-4 w-4 text-primary" />
                  أصناف وبنود الإيصال المسجلة:
                </h4>
                <div className="border rounded-md max-h-56 overflow-y-auto">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>الصنف</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-center">السعر الفردي</TableHead>
                        <TableHead className="text-center font-bold">الإجمالي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedInvoice.items || []).map((it: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{it.name} {it.code ? `(${it.code})` : ''}</TableCell>
                          <TableCell className="text-center font-mono">{it.qty}</TableCell>
                          <TableCell className="text-center font-mono">{Number(it.price).toFixed(2)}</TableCell>
                          <TableCell className="text-center font-mono font-bold">{(Number(it.qty) * Number(it.price)).toFixed(2)} ج.م</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* جدول حركات السداد */}
              <div>
                <h4 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                  حركات السداد والتحصيل المقيدة:
                </h4>
                <div className="border rounded-md">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>طريقة الدفع</TableHead>
                        <TableHead className="text-center">المبلغ المسدد</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedInvoice.payments || []).length > 0 ? (
                        selectedInvoice.payments.map((p: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="font-semibold">{p.method}</TableCell>
                            <TableCell className="text-center font-mono font-bold text-emerald-600">{Number(p.amount).toFixed(2)} ج.م</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell className="font-semibold">سداد مباشر</TableCell>
                          <TableCell className="text-center font-mono font-bold text-emerald-600">{selectedInvoice.totalPaidFromPayments.toFixed(2)} ج.م</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
