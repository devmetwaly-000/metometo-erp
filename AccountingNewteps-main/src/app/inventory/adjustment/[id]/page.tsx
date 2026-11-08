
"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/contexts/data-provider';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Printer, ArrowDown, ArrowUp } from 'lucide-react';

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

export default function StockAdjustmentDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<StockAdjustmentRecord | null>(null);
  
  const { stockAdjustmentRecords, warehouses, loading } = useData();
  
  useEffect(() => {
    if (stockAdjustmentRecords.length > 0 && id) {
      const foundRecord = stockAdjustmentRecords.find((r:any) => r.id === id);
      setRecord(foundRecord || null);
    }
  }, [stockAdjustmentRecords, id]);
  
  const getWarehouseName = (warehouseId: string) => warehouses.find((w:any) => w.id === warehouseId)?.name || 'غير معروف';

  const handlePrint = () => {
    window.print();
  };
  
  if (loading) {
    return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-10 w-10 animate-spin" /></div>;
  }
  
  if (!record) {
    return <div className="flex flex-1 justify-center items-center"><p>لم يتم العثور على إيصال التسوية.</p></div>;
  }

  const isOpeningBalance = record.reason === 'opening_balance';

  return (
    <>
      <PageHeader title={`إيصال تسوية: ${record.receiptNumber}`}>
        <div className="flex gap-2 no-print">
            <Button onClick={handlePrint} variant="outline">
                <Printer className="ml-2 h-4 w-4" />
                طباعة
            </Button>
             <Button onClick={() => router.back()}>الرجوع</Button>
        </div>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-2 md:p-6 printable-area">
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle>تفاصيل إيصال تسوية مخزنية</CardTitle>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground mt-2">
                <div><span className="font-bold text-foreground">رقم الإيصال:</span> {record.receiptNumber}</div>
                <div><span className="font-bold text-foreground">تاريخ التسوية:</span> {new Date(record.date).toLocaleDateString('ar-EG')}</div>
                <div><span className="font-bold text-foreground">في مخزن:</span> {getWarehouseName(record.warehouseId)}</div>
                <div><span className="font-bold text-foreground">نوع التسوية:</span> {isOpeningBalance ? 'جرد افتتاحي' : 'جرد دوري'}</div>
                <div className="md:col-span-2"><span className="font-bold text-foreground">بواسطة:</span> {record.createdByName || 'غير معروف'}</div>
            </div>
          </CardHeader>
          <CardContent className="p-2 md:p-6">
            <div className="w-full overflow-x-auto border rounded-lg">
              <Table className="min-w-[600px]">
                  <TableHeader>
                      <TableRow>
                          <TableHead>الصنف</TableHead>
                          {!isOpeningBalance && <TableHead className="text-center">الرصيد الدفتري</TableHead>}
                          <TableHead className="text-center">الرصيد الفعلي</TableHead>
                          <TableHead className="text-center">الفرق (التسوية)</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {record.items.map((item, index) => (
                          <TableRow key={index}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              {!isOpeningBalance && <TableCell className="text-center font-mono">{item.systemQty}</TableCell>}
                              <TableCell className="text-center font-mono">{item.actualQty}</TableCell>
                              <TableCell className={`text-center font-bold ${item.difference > 0 ? 'text-green-500' : item.difference < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                <span className="flex items-center justify-center gap-1">
                                    {item.difference > 0 ? <ArrowUp className="h-3 w-3" /> : item.difference < 0 ? <ArrowDown className="h-3 w-3" /> : null}
                                    {item.difference > 0 ? `+${item.difference}` : item.difference}
                                </span>
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
            </div>
            {record.notes && (
                <div className="mt-6 p-4 border rounded-lg bg-muted/20">
                    <h4 className="font-semibold mb-1">ملاحظات:</h4>
                    <p className="text-sm text-muted-foreground">{record.notes}</p>
                </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
