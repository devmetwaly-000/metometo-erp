
"use client";

import React, { useMemo, useState, useEffect } from 'react';
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
import { Loader2, Truck, CheckCircle } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/auth-context';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  supplierName: string;
  warehouseId: string;
  items: any[];
}

interface StockTransferRecord {
    id: string;
    receiptNumber: string;
    date: string;
    fromSourceId: string;
    toSourceId: string;
    items: any[];
    shippingCost?: number;
    carrierName?: string;
    trackingNumber?: string;
}

interface StockInRecord {
  id: string;
  purchaseInvoiceId?: string;
  stockTransferId?: string;
  requisitionId?: string;
  status?: string;
  receiptNumber?: string;
  date: string;
  warehouseId: string;
  fromWarehouseId?: string;
  items: any[];
}

export default function GoodsInTransitPage() {
  const { purchaseInvoices, stockInRecords, stockTransferRecords, warehouses, inventoryZones, inventorySections, settings, loading, dbAction, getNextId, processSyncQueue } = useData();
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [isReceiving, setIsReceiving] = useState<string | null>(null);

  // إعداد workflow من الإعدادات
  const purchaseWorkflow: string = settings?.main?.financial?.purchaseWorkflow || settings?.main?.inventory?.purchaseWorkflow || 'direct';

  const allWarehouses = useMemo(() => [...warehouses, ...inventoryZones], [warehouses, inventoryZones]);
  
  useEffect(() => {
        if (user?.warehouseIds?.length === 1 && user.warehouseIds[0] !== 'all') {
            setWarehouseFilter(user.warehouseIds[0]);
        }
    }, [user]);

  const goodsInTransit = useMemo(() => {
    if (loading) return [];

    // فاتورة تُعتبر "مستلمة" فقط إذا كان لها stockInRecord بحالة مكتملة (وليس pending_putaway أو in_transit)
    // أي إذن غير ملغى مرتبط بالفاتورة يمنع إنشاء صف فاتورة مكرر؛ الأذونات المعلقة تظهر بالأسفل.
    const purchaseInvoicesWithStockIn = new Set(
        stockInRecords
            .filter((rec: StockInRecord) => rec.purchaseInvoiceId && (rec.status || '').toLowerCase() !== 'cancelled')
            .map((rec: StockInRecord) => rec.purchaseInvoiceId)
    );
    const receivedTransferIds = new Set(
        stockInRecords
            .filter((rec: StockInRecord) => {
                if (!rec.stockTransferId) return false;
                const st = (rec.status || '').toLowerCase();
                return st !== 'in_transit' && st !== 'pending_putaway' && st !== 'pending' && st !== 'draft';
            })
            .map((rec: StockInRecord) => rec.stockTransferId)
    );

    // الاستلام المباشر ينشئ إذن المخزون تلقائياً عادةً. أظهر أي فاتورة بلا إذن
    // هنا كحالة استرداد حتى لا تضيع المشتريات التي فشل إنشاء إذنها.
    const pendingPurchases = purchaseInvoices
            .filter((invoice: PurchaseInvoice) => !purchaseInvoicesWithStockIn.has(invoice.id))
            .map((invoice: PurchaseInvoice) => ({
                id: invoice.id,
                type: 'purchase',
                number: invoice.invoiceNumber,
                date: invoice.date,
                source: invoice.supplierName,
                warehouseId: invoice.warehouseId,
                warehouseName: allWarehouses.find((w: any) => w.id === invoice.warehouseId)?.name || 'غير محدد',
                itemCount: invoice.items?.length || 0,
                actionId: invoice.id,
                actionType: 'purchaseInvoiceId'
            }));
        
    const pendingTransfers = stockTransferRecords
        .filter((transfer: StockTransferRecord) => !receivedTransferIds.has(transfer.id))
        .map((transfer: StockTransferRecord) => ({
            id: transfer.id,
            type: 'transfer',
            number: transfer.receiptNumber,
            date: transfer.date,
            source: `تحويل من ${allWarehouses.find((w: any) => w.id === transfer.fromSourceId)?.name || 'غير معروف'}${transfer.carrierName ? ` (الناقل: ${transfer.carrierName})` : ''}${transfer.trackingNumber ? ` [بوليصة: ${transfer.trackingNumber}]` : ''}`,
            warehouseId: transfer.toSourceId,
            warehouseName: allWarehouses.find((w: any) => w.id === transfer.toSourceId)?.name || 'غير محدد',
            itemCount: transfer.items.length,
            actionId: transfer.id,
            actionType: 'stockTransferId'
        }));
        
    const pendingRequisitions = stockInRecords
        .filter((rec: StockInRecord) => ['pending_putaway', 'in_transit', 'pending', 'draft'].includes((rec.status || '').toLowerCase()))
        .map((rec: StockInRecord) => ({
             id: rec.id,
             type: 'requisition',
             number: rec.receiptNumber,
             date: rec.date,
             source: `طلب من ${allWarehouses.find((w:any) => w.id === rec.fromWarehouseId)?.name || 'المخزن الرئيسي'}`,
             warehouseId: rec.warehouseId,
             warehouseName: allWarehouses.find((w: any) => w.id === rec.warehouseId)?.name || 'غير محدد',
             itemCount: rec.items.length,
             actionId: rec.id,
             actionType: 'stockInId'
        }));


    return [...pendingPurchases, ...pendingTransfers, ...pendingRequisitions]
        .filter(item => {
            if (warehouseFilter !== 'all' && item.warehouseId !== warehouseFilter) return false;
            
            // Respect permissions
            if (!user?.warehouseIds?.includes('all') && !user?.warehouseIds?.includes(item.warehouseId)) return false;

            return true;
        })
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  }, [purchaseInvoices, stockInRecords, stockTransferRecords, allWarehouses, loading, user, warehouseFilter]);

 const handleReceive = async (item: any) => {
    const warehouse = allWarehouses.find((w:any) => w.id === item.warehouseId);
    const isMainWarehouse = Boolean(
        warehouse?.isMain ||
        inventorySections.some((section: any) => (section.mainWarehouseId || section.MainWarehouseId) === item.warehouseId) ||
        inventoryZones.some((zone: any) => zone.id === item.warehouseId)
    );
    
    // If it's a main warehouse, redirect to the put-away screen
    if (isMainWarehouse) {
        if (item.actionType === 'purchaseInvoiceId') {
            const invoice = purchaseInvoices.find((inv: any) => inv.id === item.actionId);
            if (!invoice) {
                toast({ variant: 'destructive', title: 'خطأ', description: 'لم يتم العثور على فاتورة الشراء الأصلية.' });
                return;
            }
            setIsReceiving(item.id);
            try {
                let stockInRecord = stockInRecords.find((rec: StockInRecord) =>
                    rec.purchaseInvoiceId === invoice.id && (rec.status || '').toLowerCase() !== 'cancelled'
                );
                if (!stockInRecord) {
                    const newStockInId = await dbAction('stockInRecords', 'add', {
                        warehouseId: invoice.warehouseId,
                        date: invoice.date || new Date().toISOString(),
                        items: (invoice.items || []).map((i: any) => ({
                            ...i,
                            itemId: i.itemId || i.id,
                            name: i.name,
                        })),
                        reason: 'purchase',
                        notes: `إذن استلام مستدرك من فاتورة شراء رقم ${invoice.invoiceNumber}`,
                        receiptNumber: `إذ-د-${await getNextId('stockIn')}`,
                        purchaseInvoiceId: invoice.id,
                        batchNumber: invoice.batchNumber,
                        createdById: user?.id,
                        createdByName: user?.name,
                        status: 'pending_putaway',
                    });
                    stockInRecord = { id: String(newStockInId || '') } as StockInRecord;
                }
                if (!stockInRecord.id) throw new Error('تعذر إنشاء إذن المخزون المرتبط بفاتورة الشراء.');
                router.push(`/inventory/stock-in?stockInId=${encodeURIComponent(stockInRecord.id)}`);
            } catch (error) {
                console.error('Failed to recover missing purchase stock-in record:', error);
                toast({ variant: 'destructive', title: 'خطأ', description: 'تعذر إنشاء إذن استلام البضاعة لهذه الفاتورة.' });
            } finally {
                setIsReceiving(null);
            }
            return;
        }
        const queryParam = item.actionType === 'stockInId' ? 'stockInId' : item.actionType;
        const queryValue = item.actionId;
        router.push(`/inventory/stock-in?${queryParam}=${queryValue}`);
        return;
    }
    
    // Direct Receive logic for normal branches
    if (!user) {
        toast({ variant: "destructive", title: "خطأ", description: "لم يتم التعرف على المستخدم. يرجى إعادة تحميل الصفحة." });
        return;
    }
    
    setIsReceiving(item.id);
    try {
        if (item.actionType === 'stockInId') {
            // For requisitions (stockInRecords with pending_putaway), 
            // we just need to update the existing record's status to completed.
            await dbAction('stockInRecords', 'update', {
                id: item.actionId,
                data: { 
                    status: 'completed',
                    receivedById: user?.id,
                    receivedByName: user?.name,
                    receivedDate: new Date().toISOString()
                }
            });
            
            toast({
                title: "تم الاستلام بنجاح",
                description: `تم تحديث حالة الطلب إلى مكتمل في ${item.warehouseName}.`,
            });
            return;
        }

        // For Purchases and Transfers, check if there's already a pending_putaway record first
        let itemsToReceive: any[] = [];
        let sourceDescription = '';
        let originalDocument: any;

        if (item.actionType === 'purchaseInvoiceId') {
          originalDocument = purchaseInvoices.find((inv:any) => inv.id === item.actionId);
          if (originalDocument) {
            itemsToReceive = originalDocument.items;
            sourceDescription = `استلام مباشر من فاتورة شراء #${originalDocument.invoiceNumber}`;
          }
        } else if (item.actionType === 'stockTransferId') {
            originalDocument = stockTransferRecords.find((t:any) => t.id === item.actionId);
            if (originalDocument) {
                itemsToReceive = originalDocument.items;
                sourceDescription = `استلام مباشر من إذن تحويل #${originalDocument.receiptNumber}`;
            }
        }
        
        if (itemsToReceive.length === 0) {
          throw new Error('لم يتم العثور على الأصناف الأصلية.');
        }

        // هل يوجد سجل pending_putaway لهذه الفاتورة/التحويل؟ نُحدِّثه بدل إنشاء جديد
        const existingPendingRecord = stockInRecords.find((rec: StockInRecord) => {
            const st = (rec.status || '').toLowerCase();
            if (item.actionType === 'purchaseInvoiceId') return rec.purchaseInvoiceId === item.actionId && (st === 'pending_putaway' || st === 'in_transit');
            if (item.actionType === 'stockTransferId') return rec.stockTransferId === item.actionId && (st === 'pending_putaway' || st === 'in_transit');
            return false;
        });

        if (existingPendingRecord) {
            // حدِّث السجل الموجود إلى completed بدل إنشاء جديد
            await dbAction('stockInRecords', 'update', {
                id: existingPendingRecord.id,
                data: {
                    status: 'completed',
                    receivedById: user?.id,
                    receivedByName: user?.name,
                    receivedDate: new Date().toISOString()
                }
            });
            toast({
                title: "تم الاستلام بنجاح",
                description: `تم تأكيد استلام البضاعة في ${item.warehouseName}.`,
            });
        } else {
            // لا يوجد سجل موجود — أنشئ جديداً
            const newStockInRecord = {
              warehouseId: item.warehouseId,
              date: new Date().toISOString(),
              items: itemsToReceive.map((i:any) => ({ ...i, itemId: i.itemId || i.id, name: i.name })),
              reason: item.type,
              notes: sourceDescription,
              receiptNumber: `إذ-د-${await getNextId('stockIn')}`,
              createdById: user?.id,
              createdByName: user?.name,
              [item.actionType]: item.actionId,
              status: 'completed',
            };
            await dbAction('stockInRecords', 'add', newStockInRecord);
            toast({
              title: "تم الاستلام بنجاح",
              description: `تم إنشاء إذن دخول مخزني للفرع ${item.warehouseName}.`,
            });
        }
        // sync فوري لتحديث أرصدة المخزون
        setTimeout(() => processSyncQueue?.(), 800);
    } catch (error) {
        console.error("Direct receive failed:", error);
        toast({ variant: 'destructive', title: 'خطأ', description: 'فشل إتمام عملية الاستلام.' });
    } finally {
        setIsReceiving(null);
    }
  };
  
  const warehouseOptions = useMemo(() => {
    const options = [
        { value: 'all', label: 'كل الفروع والمخازن' },
        ...allWarehouses.map((w: any) => ({ value: w.id, label: w.name }))
    ];
    if (user?.warehouseIds?.includes('all')) return options;
    return options.filter(w => w.value !== 'all' && user?.warehouseIds?.includes(w.value));
  }, [allWarehouses, user]);


  return (
    <>
      <PageHeader title="بضاعة بالطريق" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
            <CardHeader>
                <CardTitle>فلترة حسب الفرع</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="max-w-sm space-y-2">
                    <Label>عرض الشحنات المتجهة إلى:</Label>
                    <Combobox
                        options={warehouseOptions}
                        value={warehouseFilter}
                        onValueChange={setWarehouseFilter}
                        placeholder="اختر فرعاً..."
                        emptyMessage="لا يوجد فروع."
                        disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}
                    />
                </div>
            </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle>الشحنات المعلقة للاستلام</CardTitle>
                <CardDescription>
                  {purchaseWorkflow === 'direct'
                    ? 'وضع الاستلام المباشر: تُسجل الفواتير بالمخزون تلقائياً. تظهر هنا أي فاتورة لم يُنشأ لها إذن مخزون لاستكمال الاستلام.'
                    : 'وضع البضاعة بالطريق: الفواتير تنتظر الاستلام اليدوي قبل دخول المخزن.'}
                </CardDescription>
            </div>
            <Badge variant="outline" className={purchaseWorkflow === 'direct' ? 'border-emerald-500 text-emerald-700 bg-emerald-50' : 'border-amber-500 text-foreground bg-amber-50'}>
                {purchaseWorkflow === 'direct' ? '⚡ استلام مباشر' : '🚛 بضاعة بالطريق'}
            </Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم المرجع</TableHead>
                      <TableHead>المصدر</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>المخزن المستلم</TableHead>
                      <TableHead className="text-center">عدد الأصناف</TableHead>
                      <TableHead className="text-center w-[120px]">الإجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {goodsInTransit.length > 0 ? (
                      goodsInTransit.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono">{item.number}</TableCell>
                          <TableCell>{item.source}</TableCell>
                          <TableCell>{new Date(item.date).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell>{item.warehouseName}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{item.itemCount}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                             <Button size="sm" onClick={() => handleReceive(item)} disabled={isReceiving === item.id}>
                                {isReceiving === item.id ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <CheckCircle className="ml-2 h-4 w-4" />}
                                استلام
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          لا توجد بضاعة بالطريق حاليًا تطابق الفلاتر المحددة.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
