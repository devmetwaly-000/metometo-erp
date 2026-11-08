

"use client";

import React, { useMemo, useState } from "react";
import PageHeader from "@/components/page-header";
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
} from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

interface Sale {
  date: string;
  warehouseId?: string;
  items: { id: string }[];
  status?: string;
}

interface Item {
  id: string;
  name: string;
  code?: string;
}

interface Warehouse {
  id: string;
  name: string;
}

export default function ItemSalesCountReportPage() {
  const { salesInvoices, posSales, items: allItems, warehouses, loading } = useData();
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
    
    const combinedSales: Sale[] = [
      ...salesInvoices.filter((inv: any) => inv.status === 'approved'),
      ...posSales,
    ];

    const filteredSales = combinedSales.filter(sale => {
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

    const salesCountMap = new Map<string, number>();

    filteredSales.forEach(sale => {
        sale.items.forEach(item => {
            salesCountMap.set(item.id, (salesCountMap.get(item.id) || 0) + 1);
        });
    });

    return Array.from(salesCountMap.entries())
      .map(([itemId, count]) => {
        const itemDetails = allItems.find((i: Item) => i.id === itemId);
        return {
          itemId,
          itemName: itemDetails?.name || 'صنف غير معروف',
          itemCode: itemDetails?.code || 'N/A',
          salesCount: count,
        };
      })
      .sort((a, b) => b.salesCount - a.salesCount);

  }, [filters, salesInvoices, posSales, allItems, loading]);
  
  const warehouseOptions = useMemo(() => ([
    { value: 'all', label: 'كل الفروع' },
    ...warehouses.map((w: any) => ({ value: w.id, label: w.name }))
  ]), [warehouses]);


  return (
    <>
      <PageHeader title="تقرير عدد مرات بيع الأصناف" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>فلاتر البحث</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>الفرع</Label>
                <Combobox
                  options={warehouseOptions}
                  value={filters.warehouseId}
                  onValueChange={(v) => handleFilterChange('warehouseId', v)}
                  placeholder="اختر الفرع..."
                  emptyMessage="لم يتم العثور على فرع."
                  disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}
                />
              </div>
              <div className="space-y-2">
                <Label>من تاريخ</Label>
                <Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>إلى تاريخ</Label>
                <Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>نتائج التقرير</CardTitle>
            <CardDescription>
              عرض الأصناف مرتبة حسب عدد المرات التي ظهرت فيها في فواتير البيع ونقاط البيع خلال الفترة المحددة.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">اسم الصنف</TableHead>
                      <TableHead className="text-right">الباركود</TableHead>
                      <TableHead className="text-center">عدد مرات البيع</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.length > 0 ? reportData.map((item) => (
                      <TableRow key={item.itemId}>
                        <TableCell className="font-medium">{item.itemName}</TableCell>
                        <TableCell className="font-mono">{item.itemCode}</TableCell>
                        <TableCell className="text-center font-bold text-lg">{item.salesCount}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                          لا توجد بيانات مبيعات تطابق الفلاتر المحددة.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

