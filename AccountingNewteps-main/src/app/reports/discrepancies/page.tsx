

"use client";

import React, { useMemo, useState } from "react";
import PageHeader from "@/components/page-header";
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
import { useData } from "@/contexts/data-provider";
import { Loader2, Eye, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


interface PosSale {
  id: string;
  invoiceNumber: string;
  date: string;
  cashierName: string;
  items: any[];
  total: number;
  warehouseId?: string;
  saleInvoiceId?: string;
  type?: 'stock-out-pos' | 'stock-out-manual';
}

interface PurchaseInvoice {
    id: string;
    invoiceNumber: string;
    date: string;
    items: { id: string, name: string, qty: number }[];
    supplierName: string;
}

interface StockInRecord {
    id: string;
    purchaseInvoiceId?: string;
    items: { itemId: string, name: string, qty: number }[];
}

interface StockOutRecord {
    id: string;
    saleInvoiceId?: string;
}

const DiscrepancyItemsDialog = ({ sale, type, allItems, stockInRecords }: { sale: any | null, type: 'pos' | 'purchase', allItems: any[], stockInRecords: StockInRecord[] }) => {
    if (!sale) return null;

    const content = useMemo(() => {
        if (type === 'pos') {
            return (
                <>
                    <DialogHeader>
                        <DialogTitle>تفاصيل فاتورة البيع غير المرحلة: {sale.invoiceNumber}</DialogTitle>
                        <DialogDescription>توضح هذه الشاشة الأصناف التي تم بيعها ولم يتم خصمها من المخزون.</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-96 overflow-y-auto">
                        <Table>
                            <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead className="text-center">الكمية</TableHead><TableHead className="text-center">السعر</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {(sale.items || []).map((item: any, index: number) => (
                                    <TableRow key={index}>
                                        <TableCell>{item.name || 'صنف غير معروف'}</TableCell>
                                        <TableCell className="text-center">{item.qty}</TableCell>
                                        <TableCell className="text-center">{item.price?.toLocaleString() || '-'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            );
        } else if (type === 'purchase') {
            const receivedQuantities = new Map<string, number>();
            stockInRecords
                .filter(rec => rec.purchaseInvoiceId === sale.id)
                .forEach(rec => {
                    rec.items.forEach(item => {
                        const itemId = item.itemId || (item as any).id;
                        receivedQuantities.set(itemId, (receivedQuantities.get(itemId) || 0) + item.qty);
                    });
                });
            
            const itemsWithRemaining = sale.items
                .map((item: any) => ({
                    ...item,
                    receivedQty: receivedQuantities.get(item.id) || 0,
                    remainingQty: item.qty - (receivedQuantities.get(item.id) || 0),
                }))
                .filter((item: any) => item.remainingQty > 0);

            return (
                 <>
                    <DialogHeader>
                        <DialogTitle>تفاصيل فاتورة الشراء غير المستلمة بالكامل: {sale.invoiceNumber}</DialogTitle>
                        <DialogDescription>توضح هذه الشاشة الأصناف التي تم شراؤها ولم يتم استلامها بالكامل في المخزن.</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-96 overflow-y-auto">
                        <Table>
                            <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead className="text-center">الكمية المشتراة</TableHead><TableHead className="text-center">الكمية المستلمة</TableHead><TableHead className="text-center">الكمية المتبقية</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {itemsWithRemaining.map((item: any, index: number) => (
                                    <TableRow key={index}>
                                        <TableCell>{item.name || 'صنف غير معروف'}</TableCell>
                                        <TableCell className="text-center">{item.qty}</TableCell>
                                        <TableCell className="text-center">{item.receivedQty}</TableCell>
                                        <TableCell className="text-center font-bold text-destructive">{item.remainingQty}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            );
        }
        return null;
    }, [sale, type, stockInRecords]);

    return <DialogContent className="max-w-4xl">{content}</DialogContent>;
}

export default function DiscrepancyReportPage() {
  const { posSales, stockOutRecords, purchaseInvoices, stockInRecords, items: allItems, loading } = useData();
  const [selectedSale, setSelectedSale] = useState<PosSale | PurchaseInvoice | null>(null);
  const [activeDialog, setActiveDialog] = useState<'pos' | 'purchase' | null>(null);

  const posDiscrepancies: PosSale[] = useMemo(() => {
    if (loading) return [];
    const deductedSaleIds = new Set(
        stockOutRecords
            .filter((rec: StockOutRecord) => rec.saleInvoiceId)
            .map((rec: StockOutRecord) => rec.saleInvoiceId)
    );
    return posSales
      .filter((sale: PosSale) => !deductedSaleIds.has(sale.id))
      .sort((a: PosSale, b: PosSale) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [posSales, stockOutRecords, loading]);

  const purchaseDiscrepancies = useMemo(() => {
      if (loading) return [];
      const receivedInvoiceItems = new Map<string, Map<string, number>>(); // invoiceId -> Map<itemId, qty>
      
      stockInRecords.forEach((record: StockInRecord) => {
          if (record.purchaseInvoiceId) {
              if (!receivedInvoiceItems.has(record.purchaseInvoiceId)) {
                  receivedInvoiceItems.set(record.purchaseInvoiceId, new Map());
              }
              const itemMap = receivedInvoiceItems.get(record.purchaseInvoiceId)!;
              record.items.forEach(item => {
                  const itemId = item.itemId || (item as any).id;
                  itemMap.set(itemId, (itemMap.get(itemId) || 0) + item.qty);
              });
          }
      });

      return purchaseInvoices.filter((invoice: PurchaseInvoice) => {
          const receivedItems = receivedInvoiceItems.get(invoice.id);
          if (!receivedItems) { // Not received at all
              return true;
          }
          // Check for quantity discrepancies
          return invoice.items.some(invoiceItem => {
              const receivedQty = receivedItems.get(invoiceItem.id) || 0;
              return receivedQty < invoiceItem.qty;
          });
      });
  }, [purchaseInvoices, stockInRecords, loading]);

  return (
    <>
      <PageHeader title="تقرير عدم تطابق المخزون" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Tabs defaultValue="pos">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pos">مبيعات لم ترحل ({posDiscrepancies.length})</TabsTrigger>
            <TabsTrigger value="purchases">مشتريات لم تستلم ({purchaseDiscrepancies.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pos">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle />
                    فواتير بيع لم يتم خصمها من المخزون
                </CardTitle>
                <CardDescription>
                  يعرض هذا التقرير جميع فواتير نقاط البيع التي تم تسجيلها ماليًا ولكن لم يتم إنشاء إذن صرف مخزني مقابل لها.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="w-full overflow-auto border rounded-lg">
                    <Dialog onOpenChange={(open) => !open && setSelectedSale(null)}>
                        <Table>
                          <TableHeader><TableRow><TableHead>رقم الفاتورة</TableHead><TableHead>تاريخ البيع</TableHead><TableHead>الكاشير</TableHead><TableHead className="text-center">إجمالي القيمة</TableHead><TableHead className="text-center">عرض التفاصيل</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {posDiscrepancies.length > 0 ? posDiscrepancies.map((sale) => (
                              <TableRow key={sale.id}>
                                <TableCell className="font-mono">{sale.invoiceNumber}</TableCell>
                                <TableCell>{new Date(sale.date).toLocaleString('ar-EG')}</TableCell>
                                <TableCell>{sale.cashierName}</TableCell>
                                <TableCell className="text-center font-semibold">{sale.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-center">
                                    <DialogTrigger asChild><Button variant="ghost" size="icon" onClick={() => { setSelectedSale(sale); setActiveDialog('pos'); }}><Eye className="h-4 w-4" /></Button></DialogTrigger>
                                </TableCell>
                              </TableRow>
                            )) : (
                              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد فواتير بيع غير متطابقة. هذا مؤشر جيد على صحة البيانات.</TableCell></TableRow>
                            )}
                          </TableBody>
                        </Table>
                        {selectedSale && activeDialog === 'pos' && <DiscrepancyItemsDialog sale={selectedSale} type="pos" allItems={allItems} stockInRecords={stockInRecords} />}
                    </Dialog>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
           <TabsContent value="purchases">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle />
                    فواتير شراء لم يتم استلامها بالكامل
                </CardTitle>
                <CardDescription>
                  يعرض هذا التقرير فواتير الشراء التي لم يتم استلامها بعد، أو تم استلام كميات أقل من المطلوب.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="w-full overflow-auto border rounded-lg">
                    <Dialog onOpenChange={(open) => !open && setSelectedSale(null)}>
                        <Table>
                          <TableHeader><TableRow><TableHead>رقم الفاتورة</TableHead><TableHead>تاريخ الشراء</TableHead><TableHead>المورد</TableHead><TableHead className="text-center">عدد الأصناف</TableHead><TableHead className="text-center">عرض التفاصيل</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {purchaseDiscrepancies.length > 0 ? purchaseDiscrepancies.map((invoice) => (
                              <TableRow key={invoice.id}>
                                <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                                <TableCell>{new Date(invoice.date).toLocaleDateString('ar-EG')}</TableCell>
                                <TableCell>{invoice.supplierName}</TableCell>
                                <TableCell className="text-center">{invoice.items.length}</TableCell>
                                <TableCell className="text-center">
                                    <DialogTrigger asChild><Button variant="ghost" size="icon" onClick={() => { setSelectedSale(invoice); setActiveDialog('purchase'); }}><Eye className="h-4 w-4" /></Button></DialogTrigger>
                                </TableCell>
                              </TableRow>
                            )) : (
                              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد فواتير شراء غير متطابقة.</TableCell></TableRow>
                            )}
                          </TableBody>
                        </Table>
                         {selectedSale && activeDialog === 'purchase' && <DiscrepancyItemsDialog sale={selectedSale} type="purchase" allItems={allItems} stockInRecords={stockInRecords} />}
                    </Dialog>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
