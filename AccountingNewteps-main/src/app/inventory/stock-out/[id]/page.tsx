

"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Loader2, Printer, MessageCircle } from 'lucide-react';
import { useData } from '@/contexts/data-provider';
import Link from 'next/link';

interface StockOutRecord {
  id: string;
  receiptNumber: string;
  date: string;
  sourceId: string;
  reason: string;
  notes?: string;
  items: { id: string; name: string; qty: number; cost?: number; price?: number; code?: string; }[];
  saleInvoiceId?: string;
  saleInvoiceNumber?: string;
  type?: 'stock-out-pos' | 'stock-out-manual';
}

interface Warehouse {
  id: string;
  name: string;
}

interface Item {
    id: string;
    code?: string;
}

export default function StockOutDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<StockOutRecord | null>(null);
  const { stockOutRecords, warehouses, items: allItems, salesInvoices, posSales, loading } = useData();
  
  useEffect(() => {
    if (stockOutRecords.length > 0 && id) {
      const foundRecord = stockOutRecords.find((r:any) => r.id === id);
      setRecord(foundRecord || null);
    }
  }, [stockOutRecords, id]);
  
  const getWarehouseName = (warehouseId: string) => warehouses.find((w: Warehouse) => w.id === warehouseId)?.name || 'غير معروف';
  
  const originalInvoice = useMemo(() => {
      if (!record?.saleInvoiceId) return null;
      // Search in both standard sales and POS sales
      return salesInvoices.find((inv:any) => inv.id === record.saleInvoiceId) || posSales.find((inv:any) => inv.id === record.saleInvoiceId);
  }, [record, salesInvoices, posSales]);


  const itemsWithDetails = useMemo(() => {
    if (!record) return [];
    return record.items.map(item => {
        const masterItem = allItems.find((i:Item) => i.id === item.id);
        const invoiceItem = originalInvoice?.items.find((invItem:any) => invItem.id === item.id);
        const cost = item.cost || (masterItem as any)?.cost || 0;
        const price = item.price || invoiceItem?.price || 0;
        const total = item.qty * cost;

        return {
            ...item,
            barcode: item.code || masterItem?.code || 'N/A',
            price: price,
            cost: cost,
            total: total
        }
    });
  }, [record, allItems, originalInvoice]);

  const handlePrint = () => {
    window.print();
  };
  
  const handleShare = () => {
    if (!record) return;
    const totalValue = itemsWithDetails.reduce((sum, item) => sum + (item.total || 0), 0);
    const text = `
*إذن صرف مخزني*
------------------------------------
*رقم الإذن:* ${record.receiptNumber}
*التاريخ:* ${new Date(record.date).toLocaleDateString('ar-EG')}
*من مخزن:* ${getWarehouseName(record.sourceId)}
*السبب:* ${getReasonLabel(record.reason, record.saleInvoiceNumber)}
*إجمالي الأصناف:* ${record.items.length}
*إجمالي القيمة (بالتكلفة):* ${totalValue.toLocaleString()} ج.م
    `;
    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encodedText}`);
  };


  if (loading) {
    return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-10 w-10 animate-spin" /></div>;
  }
  
  if (!record) {
    return <div className="flex flex-1 justify-center items-center"><p>لم يتم العثور على الإيصال.</p></div>;
  }
  
  const totalValue = itemsWithDetails.reduce((sum, item) => sum + (item.total || 0), 0);
  const getReasonLabel = (reason: string, invoiceNumber?: string) => {
    if ((reason === 'sales_invoice' || record.type === 'stock-out-pos') && invoiceNumber) {
        return `صرف بناءً على فاتورة بيع: ${invoiceNumber}`;
    }
    const reasons: { [key: string]: string } = {
        damaged: 'بضاعة تالفة',
        samples: 'عينات',
        internal_use: 'استخدام داخلي',
        giveaway: 'هدايا ترويجية',
        obsolete: 'بضاعة هالكة/متقادمة',
        other: 'أخرى'
    };
    return reasons[reason] || reason;
  }


  return (
    <>
      <PageHeader title={`إذن صرف: ${record.receiptNumber}`}>
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
            <CardTitle>تفاصيل إذن صرف مخزني</CardTitle>
             <div className="grid md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                <div><span className="font-semibold">رقم الإذن:</span> {record.receiptNumber}</div>
                <div><span className="font-semibold">تاريخ الصرف:</span> {new Date(record.date).toLocaleDateString('ar-EG')}</div>
                <div><span className="font-semibold">المصروف من:</span> {getWarehouseName(record.sourceId)}</div>
                <div className="md:col-span-3"><span className="font-semibold">السبب:</span> {getReasonLabel(record.reason, record.saleInvoiceNumber)}</div>
            </div>
          </CardHeader>
          <CardContent>
             <div className="w-full overflow-auto">
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>اسم الصنف</TableHead>
                          <TableHead>الباركود</TableHead>
                          <TableHead className="text-center">سعر البيع</TableHead>
                          <TableHead className="text-center">التكلفة</TableHead>
                          <TableHead className="text-center">الكمية</TableHead>
                          <TableHead className="text-center">إجمالي التكلفة</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {itemsWithDetails.map(item => (
                          <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                               <TableCell className="font-mono">{item.barcode}</TableCell>
                              <TableCell className="text-center">{record.reason === 'sales_invoice' || record.type === 'stock-out-pos' ? item.price.toLocaleString() : '-'}</TableCell>
                              <TableCell className="text-center">{item.cost.toLocaleString()}</TableCell>
                              <TableCell className="text-center font-bold">{item.qty}</TableCell>
                              <TableCell className="text-center">{item.total.toLocaleString()}</TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                        <TableCell colSpan={5} className="font-bold text-base">إجمالي قيمة البضاعة المصروفة (بالتكلفة)</TableCell>
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
