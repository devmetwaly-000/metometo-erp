

"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useData } from '@/contexts/data-provider';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Loader2, Printer, MessageCircle } from 'lucide-react';
import Link from 'next/link';

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
  items: { 
    itemId: string; 
    name: string; 
    qty: number; 
    cost: number;
    expiryDate?: string;
  }[];
}

interface Warehouse {
  id: string;
  name: string;
}

export default function StockInDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<StockInRecord | null>(null);
  const { stockInRecords, warehouses, purchaseInvoices, loading } = useData();
  
  useEffect(() => {
    if (stockInRecords.length > 0 && id) {
      const foundRecord = stockInRecords.find((r:any) => r.id === id);
      setRecord(foundRecord || null);
    }
  }, [stockInRecords, id]);
  
  const getWarehouseName = (warehouseId: string) => warehouses.find((w:any) => w.id === warehouseId)?.name || 'غير معروف';
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
  }

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

  return (
    <>
      <PageHeader title={`إذن دخول: ${record.receiptNumber}`}>
        <div className="flex gap-2 no-print">
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
            <CardTitle>تفاصيل إذن دخول مخزني</CardTitle>
             <div className="grid md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                <div>رقم الإذن: {record.receiptNumber}</div>
                <div>تاريخ الاستلام: {new Date(record.date).toLocaleDateString('ar-EG')}</div>
                <div>في مخزن: {getWarehouseName(record.warehouseId)}</div>
                <div className="md:col-span-2">السبب: {getReasonLabel(record.reason, originalInvoice?.invoiceNumber)}</div>
                {record.batchNumber && <div>رقم التشغيلة (الباتش): {record.batchNumber}</div>}
                 <div className="md:col-span-3">بواسطة: {record.createdByName || 'غير معروف'}</div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-auto">
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
                              <TableCell>{item.name}</TableCell>
                              <TableCell className="text-center">{item.qty}</TableCell>
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
