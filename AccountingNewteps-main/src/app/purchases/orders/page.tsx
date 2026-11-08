

"use client";

import React, { useState, useMemo } from 'react';
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
} from "@/components/ui/table";
import { PlusCircle, Loader2, MoreHorizontal, FileText, CheckCircle, Clock, ArrowRightLeft, Eye } from "lucide-react";
import { useRouter } from 'next/navigation';
import { useData } from '@/contexts/data-provider';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  date: string;
  supplierId: string;
  total: number;
  items: any[];
  status: 'pending' | 'fulfilled';
  warehouseId?: string;
}

const OrderItemsDialog = ({ items }: { items: any[] }) => (
    <DialogContent>
        <DialogHeader>
            <DialogTitle>تفاصيل أصناف أمر الشراء</DialogTitle>
        </DialogHeader>
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>الصنف</TableHead>
                    <TableHead className="text-center">الكمية</TableHead>
                    <TableHead className="text-center">التكلفة</TableHead>
                    <TableHead className="text-center">الإجمالي</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items && items.map((item, idx) => (
                    <TableRow key={idx}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-center">{item.qty}</TableCell>
                        <TableCell className="text-center">{item.cost?.toLocaleString() || '-'}</TableCell>
                        <TableCell className="text-center">{item.total?.toLocaleString() || '-'}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </DialogContent>
);


export default function PurchaseOrdersListPage() {
  const { purchaseOrders = [], suppliers, warehouses, loading } = useData();
  const router = useRouter();
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

  const [filters, setFilters] = useState({
    supplierId: "",
    warehouseId: "",
    fromDate: "",
    toDate: "",
  });

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const getSupplierName = (supplierId: string) => {
    return suppliers.find((s: any) => s.id === supplierId)?.name || 'غير معروف';
  };
  
   const getWarehouseName = (warehouseId: string) => {
    return warehouses.find((w: any) => w.id === warehouseId)?.name || 'غير معروف';
  };


  const sortedOrders = useMemo(() => {
    return [...purchaseOrders].filter((order: PurchaseOrder) => {
        const orderDate = new Date(order.date);
        const from = filters.fromDate ? new Date(filters.fromDate) : null;
        const to = filters.toDate ? new Date(filters.toDate) : null;
        if(from) from.setHours(0,0,0,0);
        if(to) to.setHours(23,59,59,999);

        if (from && orderDate < from) return false;
        if (to && orderDate > to) return false;
        if (filters.supplierId && filters.supplierId !== 'all' && order.supplierId !== filters.supplierId) return false;
        if (filters.warehouseId && filters.warehouseId !== 'all' && order.warehouseId !== filters.warehouseId) return false;
        return true;
    }).sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [purchaseOrders, filters]);
  
  const getStatusBadge = (status: string) => {
    switch (status) {
        case 'pending': return <Badge variant="outline" className="text-amber-500 border-amber-500 flex items-center gap-1"><Clock className="h-3 w-3"/>معلق</Badge>;
        case 'fulfilled': return <Badge variant="default" className="bg-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3"/>تم التحويل لفاتورة</Badge>;
        default: return <Badge variant="secondary">{status}</Badge>;
    }
  }
  
  const supplierOptions = useMemo(() => ([{value: 'all', label: 'كل الموردين'}, ...suppliers.map((s:any) => ({ value: s.id, label: s.name }))]), [suppliers]);
  const warehouseOptions = useMemo(() => ([{value: 'all', label: 'كل الفروع'}, ...warehouses.map((w:any) => ({ value: w.id, label: w.name }))]), [warehouses]);


  return (
    <>
      <PageHeader title="أوامر الشراء">
        <Button size="sm" className="gap-1" onClick={() => router.push('/purchases/orders/new')}>
          <PlusCircle className="h-4 w-4" />
          إضافة أمر شراء جديد
        </Button>
      </PageHeader>
      <main className="flex-1 p-4 md:p-6 space-y-4">
        <Card>
            <CardHeader>
                <CardTitle>فلاتر البحث</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                     <div className="space-y-2">
                        <Label>المورد</Label>
                        <Combobox options={supplierOptions} value={filters.supplierId} onValueChange={(v) => handleFilterChange("supplierId", v)} placeholder="اختر مورد..." emptyMessage="لا يوجد موردين." />
                    </div>
                     <div className="space-y-2">
                        <Label>الفرع</Label>
                         <Combobox options={warehouseOptions} value={filters.warehouseId} onValueChange={(v) => handleFilterChange("warehouseId", v)} placeholder="اختر فرع..." emptyMessage="لا يوجد فروع." />
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
        <Card>
          <CardHeader>
            <CardTitle>قائمة أوامر الشراء</CardTitle>
            <CardDescription>
              عرض وتتبع جميع أوامر الشراء الصادرة للموردين.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Dialog onOpenChange={(open) => !open && setSelectedOrder(null)}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم الأمر</TableHead>
                      <TableHead>المورد</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead className="text-center">الإجمالي</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                       <TableHead className="text-center w-[150px]">الإجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedOrders.length > 0 ? sortedOrders.map((order: any) => (
                      <TableRow key={order.id} >
                        <TableCell className="font-mono">
                            <Link href={`/purchases/orders/${order.id}`} className="hover:underline text-primary">
                                {order.orderNumber}
                            </Link>
                        </TableCell>
                        <TableCell>{getSupplierName(order.supplierId)}</TableCell>
                        <TableCell>{new Date(order.date).toLocaleDateString('ar-EG')}</TableCell>
                        <TableCell className="text-center">{order.total.toLocaleString()}</TableCell>
                        <TableCell className="text-center">{getStatusBadge(order.status)}</TableCell>
                         <TableCell className="text-center">
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}><Eye className="ml-2 h-4 w-4"/> عرض الأصناف</Button>
                            </DialogTrigger>
                             {order.status === 'pending' && (
                                <Button variant="outline" size="icon" className="mr-2 h-8 w-8" onClick={() => router.push(`/purchases/invoices/new?from_po=${order.id}`)}>
                                    <ArrowRightLeft className="h-4 w-4"/>
                                </Button>
                            )}
                          </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">لا توجد أوامر شراء بعد.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {selectedOrder && <OrderItemsDialog items={selectedOrder.items} />}
                </Dialog>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
