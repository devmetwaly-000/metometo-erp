
"use client";

import React, { useMemo, useState } from 'react';
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
import { Loader2, Coins, ShoppingCart, Banknote } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { Badge } from '@/components/ui/badge';

interface SaleInvoice {
  id: string;
  deliveryPersonId?: string;
  date: string;
  total: number;
  deliveryReconciled?: boolean;
  customerName?: string;
  invoiceNumber?: string;
}

interface DeliveryStaff {
    id: string;
    name: string;
}

export default function DeliveryOperationsPage() {
    const [filters, setFilters] = useState({
        deliveryPersonId: "",
        fromDate: "",
        toDate: "",
    });

    const {
        deliveryStaff,
        salesInvoices,
        posSales,
        loading
    } = useData();

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };
    
    const deliveryStaffOptions = useMemo(() => {
        return deliveryStaff.map((d: any) => ({value: d.id, label: d.name}));
    }, [deliveryStaff]);


    const reportData = useMemo(() => {
        if (!filters.deliveryPersonId) return null;

        const filterByDate = (item: { date: string }) => {
            if (!filters.fromDate && !filters.toDate) return true;
            const itemDate = new Date(item.date);
            const start = filters.fromDate ? new Date(filters.fromDate) : null;
            const end = filters.toDate ? new Date(filters.toDate) : null;
            if(start) start.setHours(0,0,0,0);
            if(end) end.setHours(23,59,59,999);
            if (start && itemDate < start) return false;
            if (end && itemDate > end) return false;
            return true;
        };
        
        const allSales = [...salesInvoices, ...posSales].filter(s => (s as any).isDelivery);

        const deliveryPersonSales = allSales
            .filter((s: SaleInvoice) => s.deliveryPersonId === filters.deliveryPersonId && filterByDate(s));

        const totalSalesValue = deliveryPersonSales.reduce((acc, sale) => acc + sale.total, 0);

        const totalRemitted = deliveryPersonSales
            .filter(s => s.deliveryReconciled)
            .reduce((sum, s) => sum + s.total, 0);
        
        const balanceDue = totalSalesValue - totalRemitted;

        return { totalSalesValue, totalRemitted, balanceDue, detailedInvoices: deliveryPersonSales };

    }, [filters, salesInvoices, posSales, deliveryStaff]);
    

  return (
    <>
      <PageHeader title="تقرير عمليات الطيارين" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
            <CardHeader>
                <CardTitle>فلاتر البحث</CardTitle>
                <CardDescription>اختر الطيار والفترة الزمنية لعرض التقرير المفصل.</CardDescription>
            </CardHeader>
            <CardContent>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     <div className="space-y-2">
                        <Label>الطيار</Label>
                        <Combobox 
                            options={deliveryStaffOptions} 
                            value={filters.deliveryPersonId} 
                            onValueChange={v => handleFilterChange('deliveryPersonId', v)}
                            placeholder="اختر طيارًا..."
                            emptyMessage="لا يوجد طيارون"
                        />
                    </div>
                     <div className="space-y-2">
                        <Label>من تاريخ</Label>
                        <Input type="date" value={filters.fromDate} onChange={(e) => handleFilterChange("fromDate", e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label>إلى تاريخ</Label>
                        <Input type="date" value={filters.toDate} onChange={(e) => handleFilterChange("toDate", e.target.value)} />
                    </div>
                </div>
            </CardContent>
        </Card>

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>}
        
        {reportData && !loading && (
           <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>الملخص المالي للطيار</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted">
                                <div className="flex items-center gap-3">
                                    <ShoppingCart className="h-6 w-6 text-blue-500"/>
                                    <span className="font-semibold">إجمالي قيمة الفواتير</span>
                                </div>
                                <span className="font-bold text-lg">{reportData.totalSalesValue.toLocaleString()} ج.م</span>
                            </div>
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted">
                                <div className="flex items-center gap-3">
                                    <Banknote className="h-6 w-6 text-green-500"/>
                                    <span className="font-semibold">إجمالي النقدية المحصلة</span>
                                </div>
                                <span className="font-bold text-lg">{reportData.totalRemitted.toLocaleString()} ج.م</span>
                            </div>
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-destructive/10">
                                <div className="flex items-center gap-3">
                                    <Coins className="h-6 w-6 text-destructive"/>
                                    <span className="font-bold">الرصيد المستحق على الطيار</span>
                                </div>
                                <span className="font-bold text-xl text-destructive">{reportData.balanceDue.toLocaleString()} ج.م</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>جدول العمليات التفصيلي</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <div className="w-full overflow-auto border rounded-lg">
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>رقم الفاتورة</TableHead>
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead>العميل</TableHead>
                                        <TableHead className="text-center">المبلغ</TableHead>
                                        <TableHead className="text-center">الحالة</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportData.detailedInvoices.length > 0 ? reportData.detailedInvoices.map(inv => (
                                        <TableRow key={inv.id}>
                                            <TableCell className="font-mono">{inv.invoiceNumber}</TableCell>
                                            <TableCell>{new Date(inv.date).toLocaleDateString('ar-EG')}</TableCell>
                                            <TableCell>{inv.customerName || 'عميل غير محدد'}</TableCell>
                                            <TableCell className="text-center font-semibold">{inv.total.toLocaleString()}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={inv.deliveryReconciled ? 'default' : 'destructive'} className={inv.deliveryReconciled ? 'bg-green-100 text-green-700' : ''}>
                                                    {inv.deliveryReconciled ? 'تم التحصيل' : 'معلقة للتحصيل'}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد فواتير لهذا الطيار في الفترة المحددة.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                         </div>
                    </CardContent>
                </Card>
           </div>
        )}
      </main>
    </>
  );
}
