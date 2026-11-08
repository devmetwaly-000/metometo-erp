
"use client";

import React from 'react';
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
import { PlusCircle, Loader2, MoreHorizontal, Eye } from "lucide-react";
import { useRouter } from 'next/navigation';
import { useData } from '@/contexts/data-provider';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from "@/hooks/use-mobile";


interface StockAdjustmentRecord {
  id: string;
  receiptNumber: string;
  date: string;
  warehouseId: string;
  notes?: string;
  createdByName?: string;
  reason?: 'periodic_count' | 'opening_balance';
  items: { 
    itemId: string; 
    name: string; 
    actualQty: number; 
    systemQty: number;
    difference: number;
  }[];
}

interface Warehouse {
    id: string;
    name: string;
}

export default function StockAdjustmentListPage() {
  const { stockAdjustmentRecords, warehouses, loading } = useData();
  const router = useRouter();
  const isMobile = useIsMobile();

  const getWarehouseName = (warehouseId: string) => {
    return warehouses.find((w: Warehouse) => w.id === warehouseId)?.name || 'غير معروف';
  };
  
  const getReasonLabel = (reason?: string) => {
      if (reason === 'opening_balance') return <Badge variant="secondary">جرد افتتاحي</Badge>;
      if (reason === 'periodic_count') return <Badge>جرد دوري</Badge>;
      return <Badge variant="outline">غير محدد</Badge>;
  }

  return (
    <>
      <PageHeader title="سجل تسويات المخزون">
        <Button size="sm" className="gap-1" onClick={() => router.push('/inventory/adjustment/new')}>
          <PlusCircle className="h-4 w-4" />
          إضافة تسوية جديدة
        </Button>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-2 md:p-6">
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle>قائمة إيصالات التسوية</CardTitle>
            <CardDescription>
              عرض جميع عمليات جرد وتسوية المخزون التي تمت.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-2 md:p-6">
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="w-full">
                {isMobile ? (
                  <div className="space-y-3">
                    {stockAdjustmentRecords.length > 0 ? (
                      stockAdjustmentRecords.map((record: StockAdjustmentRecord) => (
                        <Card key={record.id} className="overflow-hidden border shadow-sm">
                          <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <p className="font-mono text-sm font-bold text-primary">{record.receiptNumber}</p>
                                <p className="text-[10px] text-muted-foreground">{new Date(record.date).toLocaleString('ar-EG')}</p>
                              </div>
                              {getReasonLabel(record.reason)}
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-xs border-t pt-3">
                              <div className="space-y-1">
                                <p className="text-muted-foreground text-[10px] uppercase font-semibold">المخزن</p>
                                <p className="font-medium truncate">{getWarehouseName(record.warehouseId)}</p>
                              </div>
                              <div className="space-y-1 text-left">
                                <p className="text-muted-foreground text-[10px] uppercase font-semibold">المستخدم</p>
                                <p className="font-medium truncate">{record.createdByName || 'غير معروف'}</p>
                              </div>
                            </div>
                            <div className="flex justify-between items-center border-t pt-3">
                               <p className="text-xs text-muted-foreground">{record.items?.length || 0} أصناف</p>
                               <Button variant="secondary" size="sm" className="gap-1 h-8 px-4" onClick={() => router.push(`/inventory/adjustment/${record.id}`)}>
                                  <Eye className="h-3 w-3" />
                                  التفاصيل
                               </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">لا توجد تسويات مسجلة بعد.</div>
                    )}
                  </div>
                ) : (
                  <div className="w-full overflow-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>رقم الإيصال</TableHead>
                          <TableHead>التاريخ</TableHead>
                          <TableHead>المخزن</TableHead>
                          <TableHead>النوع</TableHead>
                          <TableHead>المستخدم</TableHead>
                          <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stockAdjustmentRecords.length > 0 ? (
                          stockAdjustmentRecords.map((record: StockAdjustmentRecord) => (
                            <TableRow key={record.id}>
                              <TableCell className="font-mono">{record.receiptNumber}</TableCell>
                              <TableCell>{new Date(record.date).toLocaleDateString('ar-EG')}</TableCell>
                              <TableCell>{getWarehouseName(record.warehouseId)}</TableCell>
                              <TableCell>{getReasonLabel(record.reason)}</TableCell>
                              <TableCell>{record.createdByName || 'غير معروف'}</TableCell>
                               <TableCell className="text-center">
                                 <Button aria-haspopup="true" size="icon" variant="ghost" onClick={() => router.push(`/inventory/adjustment/${record.id}`)}>
                                    <Eye className="h-4 w-4" />
                                    <span className="sr-only">عرض التفاصيل</span>
                                 </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                              لا توجد تسويات مسجلة بعد.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
