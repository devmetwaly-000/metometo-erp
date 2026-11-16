

"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useData } from '@/contexts/data-provider';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Printer, ArrowRight, MessageCircle, Truck, DollarSign, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StockTransferRecord {
  id: string;
  receiptNumber: string;
  date: string;
  fromSourceId: string;
  toSourceId: string;
  notes?: string;
  items: { id: string; name: string; qty: number; cost?: number; originalCost?: number; shippingAllocPerUnit?: number }[];
  shippingCost?: number;
  shippingPaidBy?: string;
  shippingPaidFromAccountId?: string;
  shippingTreatment?: string;
  carrierName?: string;
  trackingNumber?: string;
  expenseId?: string;
}

interface Warehouse {
  id: string;
  name: string;
}

export default function StockTransferDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<StockTransferRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const { stockTransferRecords, warehouses, cashAccounts, loading: dataLoading } = useData();
  
  useEffect(() => {
    if (stockTransferRecords.length > 0 && id) {
      const foundRecord = stockTransferRecords.find((r: any) => r.id === id);
      setRecord(foundRecord || null);
      setLoading(false);
    }
  }, [stockTransferRecords, id]);
  
  const getWarehouseName = (warehouseId: string) => warehouses.find((w: any) => w.id === warehouseId)?.name || 'غير معروف';
  const getCashAccountName = (accId?: string) => cashAccounts?.find((a: any) => a.id === accId)?.name || 'الخزينة المحددة';

  const handlePrint = () => {
    window.print();
  };
  
    const handleShare = () => {
    if (!record) return;
    const shippingInfo = (record.shippingCost && record.shippingCost > 0)
      ? `\n*مصاريف الشحن:* ${Number(record.shippingCost).toLocaleString()} ج.م (${record.shippingTreatment === 'capitalized' ? 'مرسملة على المخزون' : 'مصروف تشغيلي'})${record.carrierName ? `\n*شركة الشحن:* ${record.carrierName}` : ''}${record.trackingNumber ? `\n*رقم البوليصة:* ${record.trackingNumber}` : ''}`
      : '';

    const text = `
*إذن تحويل مخزني*
--------------------------
*رقم الإذن:* ${record.receiptNumber}
*التاريخ:* ${new Date(record.date).toLocaleDateString('ar-EG')}
*من مخزن:* ${getWarehouseName(record.fromSourceId)}
*إلى مخزن:* ${getWarehouseName(record.toSourceId)}
*إجمالي الأصناف:* ${record.items.length}
*إجمالي الكمية:* ${record.items.reduce((sum, item) => sum + item.qty, 0)}${shippingInfo}
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

  return (
    <>
      <PageHeader title={`إيصال تحويل: ${record.receiptNumber}`}>
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
            <CardTitle>تفاصيل إيصال تحويل مخزني</CardTitle>
             <div className="grid md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>رقم الإيصال: {record.receiptNumber}</div>
                <div>تاريخ التحويل: {new Date(record.date).toLocaleDateString('ar-EG')}</div>
            </div>
            <div className="flex items-center gap-2 text-lg font-semibold pt-2">
                <span>من: {getWarehouseName(record.fromSourceId)}</span>
                <ArrowRight className="h-5 w-5"/>
                <span>إلى: {getWarehouseName(record.toSourceId)}</span>
            </div>

            {/* Shipping & Freight Summary Banner */}
            {record.shippingCost && record.shippingCost > 0 ? (
                <div className="mt-3 p-3.5 rounded-lg border bg-muted/30 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-primary shrink-0" />
                        <div>
                            <span className="text-muted-foreground block">مصاريف الشحن والنقل:</span>
                            <span className="font-bold text-sm text-primary">{Number(record.shippingCost).toLocaleString()} ج.م</span>
                        </div>
                    </div>
                    <div>
                        <span className="text-muted-foreground block">المعالجة المحاسبية:</span>
                        <Badge variant="outline" className={record.shippingTreatment === 'capitalized' ? 'bg-amber-500/10 text-foreground border-amber-300' : 'bg-blue-500/10 text-foreground border-blue-300'}>
                            {record.shippingTreatment === 'capitalized' ? 'مرسملة على المخزون' : 'مصروف نقل تشغيلي'}
                        </Badge>
                    </div>
                    <div>
                        <span className="text-muted-foreground block">حساب الخزينة المسدد:</span>
                        <span className="font-medium">{getCashAccountName(record.shippingPaidFromAccountId)}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground block">الناقل / بوليصة الشحن:</span>
                        <span className="font-medium">
                            {record.carrierName || 'غير محدد'} {record.trackingNumber ? `(${record.trackingNumber})` : ''}
                        </span>
                    </div>
                </div>
            ) : null}
          </CardHeader>
          <CardContent>
             <div className="w-full overflow-auto">
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>الصنف</TableHead>
                          <TableHead className="text-center">الكمية المحولة</TableHead>
                          {record.items.some((i: any) => i.shippingAllocPerUnit) && (
                              <>
                                  <TableHead className="text-center">التكلفة الأساسية</TableHead>
                                  <TableHead className="text-center">نصيب الوحدة من الشحن</TableHead>
                                  <TableHead className="text-center font-bold">التكلفة المرسملة الواصلة</TableHead>
                              </>
                          )}
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {record.items.map((item: any) => (
                          <TableRow key={item.id}>
                              <TableCell>{item.name}</TableCell>
                              <TableCell className="text-center font-semibold">{item.qty}</TableCell>
                              {record.items.some((i: any) => i.shippingAllocPerUnit) && (
                                  <>
                                      <TableCell className="text-center font-mono">{Number(item.originalCost || item.cost || 0).toFixed(2)} ج.م</TableCell>
                                      <TableCell className="text-center font-mono text-emerald-600">+{Number(item.shippingAllocPerUnit || 0).toFixed(2)} ج.م</TableCell>
                                      <TableCell className="text-center font-mono font-bold text-primary">{Number(item.cost || 0).toFixed(2)} ج.م</TableCell>
                                  </>
                              )}
                          </TableRow>
                      ))}
                  </TableBody>
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
