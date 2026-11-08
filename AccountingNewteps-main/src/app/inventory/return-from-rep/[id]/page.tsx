

"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Loader2, Printer, MessageCircle } from 'lucide-react';
import { useData } from '@/contexts/data-provider';

interface ReturnFromRep {
  id: string;
  receiptNumber?: string;
  date: string;
  salesRepId: string;
  warehouseId: string;
  notes?: string;
  items: { id: string; name: string; qty: number; }[];
}

interface User {
  id: string;
  name: string;
}
interface Warehouse {
  id: string;
  name: string;
}

export default function ReturnFromRepDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<ReturnFromRep | null>(null);

  const { stockReturnsFromReps: returns, users, warehouses, loading } = useData();
  
  useEffect(() => {
    if (returns.length > 0 && id) {
      const foundRecord = returns.find((r: any) => r.id === id);
      setRecord(foundRecord || null);
    }
  }, [returns, id]);
  
  const getWarehouseName = (warehouseId: string) => warehouses.find((w: any) => w.id === warehouseId)?.name || 'غير معروف';
  const getRepName = (repId: string) => users.find((u: any) => u.id === repId)?.name || 'غير معروف';

  const handlePrint = () => {
    window.print();
  };
  
  const handleShare = () => {
    if (!record) return;
    const text = `
*إذن مرتجع بضاعة من مندوب*
------------------------------------
*رقم الإذن:* ${record.receiptNumber || record.id.slice(-6)}
*التاريخ:* ${new Date(record.date).toLocaleDateString('ar-EG')}
*المندوب:* ${getRepName(record.salesRepId)}
*إلى مخزن:* ${getWarehouseName(record.warehouseId)}
*إجمالي عدد الأصناف:* ${record.items.length}
*إجمالي الكمية المرتجعة:* ${record.items.reduce((sum, item) => sum + item.qty, 0)}
    `;
    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encodedText}`);
  };


  if (loading && !record) {
    return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-10 w-10 animate-spin" /></div>;
  }
  
  if (!record) {
    return <div className="flex flex-1 justify-center items-center"><p>لم يتم العثور على الإذن.</p></div>;
  }
  
  const totalQty = record.items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <>
      <PageHeader title={`إذن مرتجع من مندوب: ${record.receiptNumber || record.id.slice(-6)}`}>
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
            <CardTitle>تفاصيل إذن مرتجع بضاعة من مندوب</CardTitle>
             <div className="grid md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                <div>رقم الإذن: {record.receiptNumber || record.id.slice(-6)}</div>
                <div>تاريخ المرتجع: {new Date(record.date).toLocaleDateString('ar-EG')}</div>
                <div>المندوب: {getRepName(record.salesRepId)}</div>
                <div>إلى مخزن: {getWarehouseName(record.warehouseId)}</div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>الصنف</TableHead>
                        <TableHead className="text-center">الكمية المرتجعة</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {record.items.map(item => (
                        <TableRow key={item.id}>
                            <TableCell>{item.name}</TableCell>
                            <TableCell className="text-center">{item.qty}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                    <TableRow className="font-bold">
                        <TableCell>الإجمالي</TableCell>
                        <TableCell className="text-center">{totalQty}</TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
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
