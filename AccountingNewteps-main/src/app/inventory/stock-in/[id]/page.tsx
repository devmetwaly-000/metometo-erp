"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useData } from '@/contexts/data-provider';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Loader2, Printer, MessageCircle, Boxes, CheckCircle2, Clock } from 'lucide-react';

interface StockInRecord {
  id: string;
  receiptNumber: string;
  date: string;
  warehouseId: string;
  reason: string;
  notes?: string;
  purchaseInvoiceId?: string;
  createdByName?: string;
  batchNumber?: string;
  status?: string;
  allocations?: {
    date: string;
    userId?: string;
    userName?: string;
    itemId: string;
    sectionId: string;
    quantity: number;
  }[];
  items: { 
    itemId: string; 
    id?: string;
    name: string; 
    qty: number; 
    cost: number;
    expiryDate?: string;
  }[];
}

export default function StockInDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<StockInRecord | null>(null);
  const { stockInRecords, warehouses, inventorySections, purchaseInvoices, loading } = useData();
  
  useEffect(() => {
    if (stockInRecords.length > 0 && id) {
      const foundRecord = stockInRecords.find((r:any) => r.id === id);
      setRecord(foundRecord || null);
    }
  }, [stockInRecords, id]);
  
  const getWarehouseName = (warehouseId: string) => warehouses.find((w:any) => w.id === warehouseId)?.name || 'غير معروف';
  const getSectionName = (sectionId: string) => {
    const sec = (inventorySections || []).find((s: any) => (s.id || s.Id) === sectionId);
    return sec?.name || sec?.Name || sectionId;
  };
  const getItemName = (itemId: string) => {
    const itm = record?.items.find((i: any) => (i.itemId || i.id) === itemId);
    return itm?.name || 'صنف';
  };

  const isMainWarehouse = Boolean(
    warehouses.find((w: any) => w.id === record?.warehouseId)?.isMain ||
    (inventorySections || []).some((s: any) => (s.mainWarehouseId || s.MainWarehouseId) === record?.warehouseId)
  );

  const originalInvoice = record?.purchaseInvoiceId ? purchaseInvoices.find((inv: any) => inv.id === record.purchaseInvoiceId) : null;
  
  const getReasonLabel = (reason: string, invoiceNumber?: string) => {
    if ((reason === 'purchase' || reason === 'opening_stock' ) && invoiceNumber) {
      return `استلام من فاتورة شراء: ${invoiceNumber}`;
    }
    const reasons: { [key: string]: string } = {
        opening_stock: 'رصيد افتتاحي',
        customer_return: 'مرتجع من عميل',
        other: 'أخرى',
    };
    return reasons[reason] || reason;
  };

  const handlePrint = () => {
    window.print();
  };
  
  const handleShare = () => {
    if (!record) return;
    const totalValue = record.items.reduce((sum, item) => sum + item.qty * item.cost, 0);
    const text = `
*إذن دخول مخزني*
------------------------------------
*رقم الإذن:* ${record.receiptNumber}
*التاريخ:* ${new Date(record.date).toLocaleDateString('ar-EG')}
*المخزن:* ${getWarehouseName(record.warehouseId)}
*السبب:* ${getReasonLabel(record.reason, originalInvoice?.invoiceNumber)}
*إجمالي الأصناف:* ${record.items.length}
*إجمالي القيمة:* ${totalValue.toLocaleString()} ج.م
    `;
    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encodedText}`);
  };


  if (loading) {
    return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-10 w-10 animate-spin" /></div>;
  }
  
  if (!record) {
    return <div className="flex flex-1 justify-center items-center"><p>لم يتم العثور على إيصال الدخول.</p></div>;
  }

  const totalValue = record.items.reduce((sum, item) => sum + item.qty * item.cost, 0);
  const hasAllocations = Array.isArray(record.allocations) && record.allocations.length > 0;

  return (
    <>
      <PageHeader title={`إذن دخول: ${record.receiptNumber}`}>
        <div className="flex flex-wrap gap-2 no-print">
            {isMainWarehouse && (
              <Button
                onClick={() => router.push(`/inventory/stock-in?stockInId=${record.id}`)}
                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Boxes className="h-4 w-4" />
                {record.status === 'pending_putaway' || !hasAllocations ? 'تسكين في الحاويات الآن' : 'إدارة / تعديل تسكين الحاويات'}
              </Button>
            )}
            <Button onClick={handleShare} variant="outline" className="bg-green-500 text-white hover:bg-green-600 hover:text-white">
                <MessageCircle className="ml-2 h-4 w-4" />
                واتساب
            </Button>
            <Button onClick={handlePrint} variant="outline">
                <Printer className="ml-2 h-4 w-4" />
                طباعة
            </Button>
            <Button onClick={() => router.back()}>الرجوع</Button>
        </div>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 printable-area">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>تفاصيل إذن دخول مخزني</CardTitle>
              {isMainWarehouse && (
                record.status === 'pending_putaway' || !hasAllocations ? (
                  <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1 px-3 py-1">
                    <Clock className="h-3.5 w-3.5" />
                    بانتظار التسكين في الحاويات
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-600 text-white gap-1 px-3 py-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    تم التسكين في الحاويات
                  </Badge>
                )
              )}
            </div>
            <div className="grid md:grid-cols-3 gap-4 text-sm text-muted-foreground pt-2">
                <div>رقم الإذن: <strong className="text-foreground">{record.receiptNumber}</strong></div>
                <div>تاريخ الاستلام: <strong className="text-foreground">{new Date(record.date).toLocaleDateString('ar-EG')}</strong></div>
                <div>في مخزن: <strong className="text-foreground">{getWarehouseName(record.warehouseId)}</strong></div>
                <div className="md:col-span-2">السبب: <strong className="text-foreground">{getReasonLabel(record.reason, originalInvoice?.invoiceNumber)}</strong></div>
                {record.batchNumber && <div>رقم التشغيلة (الباتش): <strong className="text-foreground">{record.batchNumber}</strong></div>}
                <div className="md:col-span-3">بواسطة: <strong className="text-foreground">{record.createdByName || 'غير معروف'}</strong></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="w-full overflow-auto border rounded-lg">
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>الصنف</TableHead>
                          <TableHead className="text-center">الكمية المستلمة</TableHead>
                          <TableHead className="text-center">تكلفة الوحدة</TableHead>
                          <TableHead className="text-center">تاريخ الصلاحية</TableHead>
                          <TableHead className="text-center">إجمالي التكلفة</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {record.items.map((item, index) => (
                          <TableRow key={index}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell className="text-center font-bold">{item.qty}</TableCell>
                              <TableCell className="text-center">{item.cost.toLocaleString()}</TableCell>
                              <TableCell className="text-center">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('ar-EG') : '-'}</TableCell>
                              <TableCell className="text-center font-semibold">{(item.qty * item.cost).toLocaleString()}</TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
                   <TableFooter>
                    <TableRow>
                        <TableCell colSpan={4} className="font-bold text-base">إجمالي قيمة البضاعة المستلمة</TableCell>
                        <TableCell className="text-center font-bold text-base">{totalValue.toLocaleString()}</TableCell>
                    </TableRow>
                  </TableFooter>
              </Table>
            </div>

            {isMainWarehouse && (
              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-base flex items-center gap-2 text-primary">
                  <Boxes className="h-5 w-5" />
                  تفاصيل التسكين وتوزيع الحاويات والأقسام الداخلية
                </h4>
                {hasAllocations ? (
                  <div className="w-full overflow-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>الصنف</TableHead>
                          <TableHead>رقم / اسم الحاوية (القسم)</TableHead>
                          <TableHead className="text-center">الكمية المسكنة</TableHead>
                          <TableHead>تاريخ التسكين</TableHead>
                          <TableHead>بواسطة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {record.allocations!.map((alloc, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{getItemName(alloc.itemId)}</TableCell>
                            <TableCell className="font-bold text-primary">{getSectionName(alloc.sectionId)}</TableCell>
                            <TableCell className="text-center font-bold text-emerald-600">{alloc.quantity}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {alloc.date ? new Date(alloc.date).toLocaleString('ar-EG') : '-'}
                            </TableCell>
                            <TableCell className="text-xs">{alloc.userName || 'مستخدم النظام'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="p-4 border border-dashed border-amber-500/50 rounded-lg bg-amber-500/10 flex items-center justify-between">
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                      لم يتم توزيع وتسكين أصناف هذا الإذن على الحاويات الداخلية حتى الآن.
                    </span>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/inventory/stock-in?stockInId=${record.id}`)}
                      className="no-print gap-1"
                    >
                      <Boxes className="h-4 w-4" />
                      تسكين الآن
                    </Button>
                  </div>
                )}
              </div>
            )}

            {record.notes && (
                <div className="mt-4 border-t pt-4">
                    <h4 className="font-semibold">ملاحظات:</h4>
                    <p className="text-muted-foreground">{record.notes}</p>
                </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
