
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useData } from '@/contexts/data-provider';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Loader2, Printer, ArrowRightLeft, FileCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Label } from '@/components/ui/label';

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  date: string;
  supplierId: string;
  total: number;
  items: { id: string; name: string; qty: number; cost: number; total: number }[];
  status: 'pending' | 'fulfilled';
  notes?: string;
}

export default function PurchaseOrderDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  
  const { purchaseOrders, suppliers, loading } = useData();
  
  useEffect(() => {
    if (purchaseOrders && id) {
      const foundOrder = purchaseOrders.find((o: any) => o.id === id);
      setOrder(foundOrder || null);
    }
  }, [purchaseOrders, id]);
  
  const getSupplierName = (supplierId: string) => suppliers.find((s:any) => s.id === supplierId)?.name || 'غير معروف';

  const handlePrint = () => window.print();

  if (loading || !order) {
    return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-10 w-10 animate-spin" /></div>;
  }
  
  const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <>
      <PageHeader title={`أمر شراء: ${order.orderNumber}`}>
        <div className="flex gap-2 no-print">
            <Button onClick={handlePrint} variant="outline">
                <Printer className="ml-2 h-4 w-4" /> طباعة
            </Button>
            {order.status === 'pending' && (
                 <Link href={`/purchases/invoices/new?from_po=${order.id}`}>
                    <Button>
                        <ArrowRightLeft className="ml-2 h-4 w-4"/>
                        تحويل إلى فاتورة شراء
                    </Button>
                </Link>
            )}
             <Button onClick={() => router.back()} variant="ghost">الرجوع</Button>
        </div>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 printable-area">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle>تفاصيل أمر شراء</CardTitle>
                    <div className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-sm text-muted-foreground mt-2">
                        <div><span className="font-semibold">رقم الأمر:</span> {order.orderNumber}</div>
                        <div><span className="font-semibold">التاريخ:</span> {new Date(order.date).toLocaleDateString('ar-EG')}</div>
                        <div><span className="font-semibold">المورد:</span> {getSupplierName(order.supplierId)}</div>
                    </div>
                </div>
                 <div>
                    <Label className="text-xs">الحالة</Label>
                    <div className="mt-1">
                        {order.status === 'fulfilled' 
                            ? <Badge variant="default" className="bg-green-600"><FileCheck className="ml-1 h-3 w-3"/>تم التحويل لفاتورة</Badge> 
                            : <Badge variant="secondary">معلق</Badge>
                        }
                    </div>
                </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-auto">
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
                      {order.items.map((item, index) => (
                          <TableRow key={index}>
                              <TableCell>{item.name}</TableCell>
                              <TableCell className="text-center">{item.qty}</TableCell>
                              <TableCell className="text-center">{item.cost.toLocaleString()}</TableCell>
                              <TableCell className="text-center font-semibold">{item.total.toLocaleString()}</TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
                   <TableFooter>
                    <TableRow>
                        <TableCell className="font-bold text-base">الإجمالي</TableCell>
                        <TableCell className="text-center font-bold text-base">{totalQty}</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-center font-bold text-base">{order.total.toLocaleString()}</TableCell>
                    </TableRow>
                  </TableFooter>
              </Table>
            </div>
            {order.notes && (
                <div className="mt-4 border-t pt-4">
                    <h4 className="font-semibold">ملاحظات:</h4>
                    <p className="text-muted-foreground">{order.notes}</p>
                </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
