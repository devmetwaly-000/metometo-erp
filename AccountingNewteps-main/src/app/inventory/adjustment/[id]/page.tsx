
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
  reason?: 'periodic_count' | 'opening_balance' | 'surplus' | 'deficit' | string;
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
  
  const { stockAdjustmentRecords, warehouses, inventoryZones, items: allItems, loading } = useData();
  
  useEffect(() => {
    if (stockAdjustmentRecords.length > 0 && id) {
      const foundRecord = stockAdjustmentRecords.find((r:any) => r.id === id);
      setRecord(foundRecord || null);
    }
  }, [stockAdjustmentRecords, id]);
  
  const getWarehouseName = (warehouseId: string) => {
    const found =
      (warehouses || []).find((w: any) => w.id === warehouseId) ||
      (inventoryZones || []).find((z: any) => z.id === warehouseId);
    return found?.name || 'غير معروف';
  };

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
  const isSurplusDoc =
    record.reason === 'surplus' ||
    record.reason === 'periodic_count_surplus' ||
    String(record.receiptNumber).startsWith('ف-ج') ||
    String(record.receiptNumber).includes('فائض');
  const isDeficitDoc =
    record.reason === 'deficit' ||
    record.reason === 'periodic_count_deficit' ||
    String(record.receiptNumber).startsWith('ع-ج') ||
    String(record.receiptNumber).includes('عجز');

  const voucherTypeLabel = isOpeningBalance
    ? 'إذن جرد افتتاحي (رصيد أول مدة)'
    : isSurplusDoc
      ? 'إذن تسوية فائض جرد (زيادة مخزنية)'
      : isDeficitDoc
        ? 'إذن تسوية عجز جرد (نقص مخزني)'
        : 'إيصال تسوية مخزنية';

  const warehouseName = getWarehouseName(record.warehouseId);

  let totalSurplusValue = 0;
  let totalDeficitValue = 0;
  record.items.forEach((item: any) => {
    const cost = Number(item.cost) || Number((allItems || []).find((i: any) => i.id === item.itemId)?.cost) || 0;
    const val = (Number(item.difference) || 0) * cost;
    if (val > 0) totalSurplusValue += val;
    else if (val < 0) totalDeficitValue += Math.abs(val);
  });

  const journalRows: { account: string; description: string; debit: number; credit: number }[] = [];
  if (totalSurplusValue > 0) {
    journalRows.push({
      account: `مخزون - ${warehouseName}`,
      description: isOpeningBalance
        ? `رصيد افتتاحي مخزون في ${warehouseName}`
        : `تسوية جرد (فائض / زيادة) في ${warehouseName}`,
      debit: totalSurplusValue,
      credit: 0
    });
    journalRows.push({
      account: isOpeningBalance ? 'رأس المال / أرصدة افتتاحية' : 'أرباح تسوية المخزون (فائض جرد)',
      description: isOpeningBalance
        ? `مقابل رصيد افتتاحي مخزون ${record.receiptNumber}`
        : `أرباح تسوية المخزون (فائض جرد) ${record.receiptNumber}`,
      debit: 0,
      credit: totalSurplusValue
    });
  }
  if (totalDeficitValue > 0) {
    journalRows.push({
      account: 'خسائر تسوية المخزون (عجز جرد)',
      description: `خسائر تسوية المخزون (عجز جرد) ${record.receiptNumber}`,
      debit: totalDeficitValue,
      credit: 0
    });
    journalRows.push({
      account: `مخزون - ${warehouseName}`,
      description: `تسوية جرد (عجز) في ${warehouseName}`,
      debit: 0,
      credit: totalDeficitValue
    });
  }

  return (
    <>
      <PageHeader title={`${voucherTypeLabel}: ${record.receiptNumber}`}>
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
                <div><span className="font-bold text-foreground">نوع المستند:</span> {voucherTypeLabel}</div>
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

        {journalRows.length > 0 && (
          <Card>
            <CardHeader className="p-4 md:p-6 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base md:text-lg">القيد المحاسبي لتسوية الجرد (فائض وعجز)</CardTitle>
                  <CardDescription>
                    القيد اليومي التلقائي المُرحّل إلى دفتر اليومية وميزان المراجعة بتكلفة الأصناف.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="no-print w-fit"
                  onClick={() => router.push('/accounting/journal')}
                >
                  عرض في دفتر اليومية
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-2 md:p-6">
              <div className="w-full overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الحساب</TableHead>
                      <TableHead>البيان</TableHead>
                      <TableHead className="text-center">مدين</TableHead>
                      <TableHead className="text-center">دائن</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-semibold">{row.account}</TableCell>
                        <TableCell className="text-muted-foreground text-xs md:text-sm">{row.description}</TableCell>
                        <TableCell className="text-center font-mono font-bold text-emerald-600">
                          {row.debit > 0 ? row.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                        </TableCell>
                        <TableCell className="text-center font-mono font-bold text-destructive">
                          {row.credit > 0 ? row.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
