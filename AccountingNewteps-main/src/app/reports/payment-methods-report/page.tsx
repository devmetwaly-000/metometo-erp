

"use client";

import React, { useMemo, useState } from "react";
import PageHeader from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
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
import { Loader2, Coins } from "lucide-react";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { useAuth } from "@/contexts/auth-context";

interface Sale {
  date: string;
  warehouseId?: string;
  payments: { method: string, amount: number }[];
  paidAmount: number; // Fallback for old data
}

interface Warehouse {
  id: string;
  name: string;
}

export default function PaymentMethodsReportPage() {
  const { posSales, salesInvoices, warehouses, paymentMethods, loading } = useData();
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    warehouseId: user?.warehouseIds?.length === 1 ? user.warehouseIds[0] : "all",
    fromDate: "",
    toDate: "",
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const reportData = useMemo(() => {
    if (loading) return [];
    
    const allSales: Sale[] = [
        ...salesInvoices.filter((inv: any) => inv.status === 'approved'),
        ...posSales
    ];

    const filteredSales = allSales.filter(sale => {
      const saleDate = new Date(sale.date);
      const from = filters.fromDate ? new Date(filters.fromDate) : null;
      const to = filters.toDate ? new Date(filters.toDate) : null;
      if (from) from.setHours(0, 0, 0, 0);
      if (to) to.setHours(23, 59, 59, 999);

      if (from && saleDate < from) return false;
      if (to && saleDate > to) return false;
      if (filters.warehouseId !== 'all' && sale.warehouseId !== filters.warehouseId) return false;
      return true;
    });
    
    const warehouseTotals = new Map<string, { warehouseName: string, methods: Record<string, number>, total: number }>();

    filteredSales.forEach(sale => {
        const warehouseId = sale.warehouseId || 'unknown';
        let warehouseEntry = warehouseTotals.get(warehouseId);
        if (!warehouseEntry) {
            warehouseEntry = {
                warehouseName: warehouses.find((w: any) => w.id === warehouseId)?.name || 'فرع غير محدد',
                methods: {},
                total: 0
            };
        }

        if (sale.payments && sale.payments.length > 0) {
            sale.payments.forEach(p => {
                warehouseEntry!.methods[p.method] = (warehouseEntry!.methods[p.method] || 0) + p.amount;
            });
        } else if (sale.paidAmount > 0) { // Fallback
            const cashMethodName = paymentMethods.find((pm: any) => pm.name.toLowerCase().includes('cash') || pm.name.toLowerCase().includes('نقد'))?.name || 'نقدي';
            warehouseEntry!.methods[cashMethodName] = (warehouseEntry!.methods[cashMethodName] || 0) + sale.paidAmount;
        }

        warehouseTotals.set(warehouseId, warehouseEntry);
    });

    // Calculate totals for each warehouse
    warehouseTotals.forEach(entry => {
        entry.total = Object.values(entry.methods).reduce((sum, amount) => sum + amount, 0);
    });

    return Array.from(warehouseTotals.values());

  }, [filters, salesInvoices, posSales, warehouses, paymentMethods, loading]);
  
  const allMethodNames = useMemo(() => {
      const methods = new Set<string>();
      reportData.forEach(wh => {
          Object.keys(wh.methods).forEach(method => methods.add(method));
      });
      return Array.from(methods);
  }, [reportData]);
  
  const grandTotals = useMemo(() => {
      const totals: Record<string, number> = {};
      reportData.forEach(wh => {
          Object.entries(wh.methods).forEach(([method, amount]) => {
              totals[method] = (totals[method] || 0) + (amount as number);
          });
      });
      totals['total'] = Object.values(totals).reduce((sum, amount) => sum + amount, 0);
      return totals;
  }, [reportData]);
  
  const warehouseOptions = useMemo(() => ([
    { value: 'all', label: 'كل الفروع' },
    ...warehouses.map((w: any) => ({ value: w.id, label: w.name }))
  ]), [warehouses]);

  return (
    <>
      <PageHeader title="تقرير طرق الدفع" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>فلاتر البحث</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>من تاريخ</Label>
                <Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>إلى تاريخ</Label>
                <Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>الفرع</Label>
                <Combobox 
                    options={warehouseOptions} 
                    value={filters.warehouseId} 
                    onValueChange={v => handleFilterChange('warehouseId', v)} 
                    placeholder="الكل" 
                    emptyMessage="لا يوجد فروع." 
                    disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ملخص المبيعات حسب طرق الدفع والفروع</CardTitle>
            <CardDescription>عرض تفصيلي للمبالغ المحصلة من كل طريقة دفع في الفروع المحددة.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الفرع</TableHead>
                      {allMethodNames.map(method => (
                        <TableHead key={method} className="text-center">{method}</TableHead>
                      ))}
                      <TableHead className="text-center font-bold">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.length > 0 ? reportData.map((data) => (
                      <TableRow key={data.warehouseName}>
                        <TableCell className="font-medium">{data.warehouseName}</TableCell>
                        {allMethodNames.map(method => (
                          <TableCell key={method} className="text-center">
                            {(data.methods[method] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                        ))}
                        <TableCell className="text-center font-bold">{data.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={allMethodNames.length + 2} className="text-center py-10 text-muted-foreground">لا توجد بيانات تطابق الفلاتر.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                   {reportData.length > 0 && (
                     <TableFooter>
                        <TableRow className="bg-muted/50 font-bold">
                            <TableCell>الإجمالي الكلي</TableCell>
                            {allMethodNames.map(method => (
                                <TableCell key={`total-${method}`} className="text-center">
                                    {(grandTotals[method] || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                </TableCell>
                            ))}
                             <TableCell className="text-center">
                                {(grandTotals['total'] || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </TableCell>
                        </TableRow>
                     </TableFooter>
                   )}
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

