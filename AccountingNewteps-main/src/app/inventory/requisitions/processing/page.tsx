

"use client";

import React, { useState, useMemo, useCallback } from 'react';
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
import { Loader2, PackageCheck, AlertTriangle, MapPin, ShoppingCart, Filter } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Requisition {
    id: string;
    requisitionNumber?: string;
    requesterName: string;
    fromWarehouseId: string; // The branch requesting items
    toWarehouseId: string; // The warehouse items are requested from
    date: string;
    items: {
        itemId: string;
        name: string;
        quantity: number;
        cost?: number;
    }[];
    status: 'pending' | 'fulfilled' | 'rejected';
}

export default function RequisitionProcessingPage() {
    const { 
        requisitions, 
        warehouses, 
        inventory, 
        dbAction, 
        getNextId, 
        loading, 
        items: allItems,
        inventorySections
     } = useData();
    const [isSaving, setIsSaving] = useState<string | null>(null);
    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();

    const [filters, setFilters] = useState({
        warehouseId: 'all',
        fromDate: '',
        toDate: '',
        status: 'pending',
    });

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({...prev, [key]: value}));
    };

    const filteredRequisitions = useMemo(() => {
        if (loading || !requisitions) return [];
        
        const mainWarehouseIds = new Set(warehouses.filter((w: any) => w.isMain).map((w: any) => w.id));

        return requisitions
            .filter((req: Requisition) => {
                // Only show requisitions TO a main warehouse
                if (!mainWarehouseIds.has(req.toWarehouseId)) return false;

                const reqDate = new Date(req.date);
                const from = filters.fromDate ? new Date(filters.fromDate) : null;
                const to = filters.toDate ? new Date(filters.toDate) : null;
                if(from) from.setHours(0,0,0,0);
                if(to) to.setHours(23,59,59,999);
        
                if (from && reqDate < from) return false;
                if (to && reqDate > to) return false;
                if (filters.warehouseId !== 'all' && req.toWarehouseId !== filters.warehouseId) return false;
                if(filters.status !== 'all' && req.status !== filters.status) return false;
                return true;
            })
            .map((req: Requisition) => {
                const fromWarehouse = warehouses.find((w: any) => w.id === req.fromWarehouseId);
                const toWarehouse = warehouses.find((w: any) => w.id === req.toWarehouseId);
                if (!toWarehouse) return null;

                const itemsWithStock = req.items.map(item => {
                    let totalAvailableStock = 0;
                    let pickingPlan: any[] = [];
                    let hasEnoughStock = false;
                    
                    if ((toWarehouse as any).isMain) {
                        const sectionsWithItem = inventory
                            .filter((inv: any) => inv.id.startsWith(`${toWarehouse.id}-`) && inv.items && inv.items[item.itemId])
                            .map((inv: any) => {
                                const sectionId = inv.id.split('-')[1];
                                const sectionDetails = inventorySections.find((s:any) => s.id === sectionId);
                                return {
                                    sectionId: sectionId,
                                    sectionName: sectionDetails?.name || `قسم غير معروف`,
                                    stock: inv.items[item.itemId].balance || 0,
                                };
                            })
                            .filter((s:any) => s.stock > 0)
                            .sort((a:any, b:any) => a.stock - b.stock);

                        totalAvailableStock = sectionsWithItem.reduce((sum, s) => sum + s.stock, 0);
                        hasEnoughStock = totalAvailableStock >= item.quantity;
                        
                        const partialFulfillment = !hasEnoughStock; 
                        let remainingQtyToPick = partialFulfillment ? Math.min(item.quantity, totalAvailableStock) : item.quantity;
                        
                        for (const section of sectionsWithItem) {
                            if (remainingQtyToPick <= 0) break;
                            const pickFromThisSection = Math.min(section.stock, remainingQtyToPick);
                            pickingPlan.push({
                                sectionName: section.sectionName,
                                sectionId: section.sectionId,
                                available: section.stock,
                                toPick: pickFromThisSection,
                            });
                            remainingQtyToPick -= pickFromThisSection;
                        }
                    } else { // Normal Branch
                        const stockRecord = inventory.find((inv:any) => inv.id === `${toWarehouse.id}-${item.itemId}`);
                        totalAvailableStock = stockRecord?.balance || 0;
                        hasEnoughStock = totalAvailableStock >= item.quantity;
                    }
                    
                    return { ...item, availableStock: totalAvailableStock, hasEnoughStock, pickingPlan };
                });
                
                const canBeFulfilled = itemsWithStock.every(item => item.hasEnoughStock);

                return { ...req, fromWarehouseName: fromWarehouse?.name, toWarehouseName: toWarehouse?.name, items: itemsWithStock, canBeFulfilled, isMainSource: (toWarehouse as any).isMain };
            })
            .filter((req): req is NonNullable<typeof req> => !!req)
            .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [requisitions, warehouses, inventory, loading, allItems, inventorySections, filters]);


    const handleFulfill = async (requisition: any, partialFulfillment: boolean = false) => {
        setIsSaving(requisition.id);
        
        try {
             const itemsToTransfer = requisition.items.map((item: any) => {
                const qtyToFulfill = partialFulfillment ? Math.min(item.quantity, item.availableStock) : item.quantity;
                if (qtyToFulfill <= 0) return null;
                
                const masterItem = allItems.find((i: any) => i.id === item.itemId);
                return {
                    id: item.itemId,
                    name: item.name,
                    qty: qtyToFulfill,
                    cost: masterItem?.cost || 0
                };
            }).filter(Boolean);

            if (itemsToTransfer.length === 0) {
                 toast({ variant: 'default', title: 'لا يوجد رصيد', description: 'لا توجد كميات متاحة لصرفها من هذا الطلب.' });
                 setIsSaving(null);
                 return;
            }

            // Instead of creating a stock transfer, create a pending stock-in record for the destination.
            const newStockInRecord = {
                warehouseId: requisition.fromWarehouseId, // The destination
                fromWarehouseId: requisition.toWarehouseId, // The source
                date: new Date().toISOString(),
                items: itemsToTransfer.map((i: any) => ({ itemId: i.id, name: i.name, qty: i.qty, cost: i.cost})),
                reason: 'requisition_fulfillment',
                notes: `وارد من طلب بضاعة #${requisition.requisitionNumber} من ${requisition.toWarehouseName}`,
                receiptNumber: `إذ-د-${await getNextId('stockIn')}`,
                createdById: user?.id,
                createdByName: user?.name,
                requisitionId: requisition.id,
                status: 'pending_putaway', // The key status for "Goods in Transit"
            };

            const newStockInId = await dbAction('stockInRecords', 'add', newStockInRecord);
            if(!newStockInId) throw new Error("Failed to create stock-in record for transit");

            // Create a stock-out record for the source warehouse
            await dbAction('stockOutRecords', 'add', {
                sourceId: requisition.toWarehouseId,
                date: new Date().toISOString(),
                items: itemsToTransfer.map((item: any) => ({
                    ...item,
                    sectionId: requisition.items.find((reqItem: any) => reqItem.itemId === item.id)?.pickingPlan?.[0]?.sectionId
                })),
                reason: `صرف لفرع ${requisition.fromWarehouseName}`,
                receiptNumber: `إذ-خ-${await getNextId('stockOut')}`,
                requisitionId: requisition.id,
            });

            // Update the requisition status
            if (!partialFulfillment) {
                await dbAction('requisitions', 'update', { id: requisition.id, data: { status: 'fulfilled' } });
            } else {
                 const remainingItems = requisition.items.map((item:any) => ({...item, quantity: item.quantity - Math.min(item.quantity, item.availableStock)})).filter((item:any) => item.quantity > 0);
                 if(remainingItems.length > 0) {
                     await dbAction('requisitions', 'update', {id: requisition.id, data: { items: remainingItems.map((i: any) => ({itemId: i.itemId, name: i.name, quantity: i.quantity})) }});
                 } else {
                     await dbAction('requisitions', 'update', {id: requisition.id, data: { status: 'fulfilled' }});
                 }
            }
            
            toast({ title: 'تم التنفيذ', description: 'تم إنشاء إذن صرف وإذن دخول معلق في بضاعة بالطريق.' });
        } catch (error) {
            console.error("Failed to fulfill requisition:", error);
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل تنفيذ الطلب.' });
        } finally {
            setIsSaving(null);
        }
    };
    
    const getStatusBadge = (status: Requisition['status']) => {
      switch(status) {
          case 'pending':
              return <Badge variant="outline" className="border-amber-500 text-amber-500">معلق</Badge>;
          case 'fulfilled':
              return <Badge variant="default" className="bg-green-600">تم التنفيذ</Badge>;
          case 'rejected':
              return <Badge variant="destructive">مرفوض</Badge>;
          default:
              return <Badge variant="secondary">{status}</Badge>;
      }
  }
  
    const warehouseOptions = useMemo(() => {
        const options = [
            {value: 'all', label: 'كل المخازن الرئيسية'},
            ...warehouses.filter((w:any) => w.isMain).map((w: any) => ({value: w.id, label: w.name}))
        ];
        if (user?.warehouseIds?.includes('all')) return options;
        return options.filter(w => w.value !== 'all' && user?.warehouseIds?.includes(w.value));
    }, [warehouses, user]);


    if (loading) {
        return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <>
            <PageHeader title="طلبات البضاعة" />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Filter/> فلاتر البحث</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <Label>المخزن الرئيسي (المصدر)</Label>
                            <Combobox
                                options={warehouseOptions}
                                value={filters.warehouseId}
                                onValueChange={(v) => handleFilterChange('warehouseId', v)}
                                placeholder="اختر مخزنًا..."
                                emptyMessage="لا يوجد مخازن رئيسية."
                                disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>الحالة</Label>
                            <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">الكل</SelectItem>
                                    <SelectItem value="pending">معلق</SelectItem>
                                    <SelectItem value="fulfilled">تم التنفيذ</SelectItem>
                                    <SelectItem value="rejected">مرفوض</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>من تاريخ</Label>
                            <Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>إلى تاريخ</Label>
                            <Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>طلبات البضاعة الواردة</CardTitle>
                        <CardDescription>
                            قائمة بجميع الطلبات الواردة من الفروع والتي تنتظر التحضير والصرف من المخازن التي لديك صلاحية عليها.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                         <Accordion type="single" collapsible className="w-full">
                            {filteredRequisitions.length > 0 ? filteredRequisitions.map(req => {
                                return (
                                <AccordionItem value={req.id} key={req.id}>
                                    <AccordionTrigger>
                                        <div className="flex justify-between w-full pr-4 rtl:pl-4">
                                            <div className="text-right">
                                                <span className="font-semibold">{req.requisitionNumber || req.id.slice(-6)} | طلب من: {req.fromWarehouseName}</span>
                                                <span className="text-xs text-muted-foreground block">مطلوب من: {req.toWarehouseName} | بواسطة: {req.requesterName}</span>
                                            </div>
                                             <div className="flex flex-col items-end gap-1">
                                                <span className="text-sm text-muted-foreground">{new Date(req.date).toLocaleDateString('ar-EG')}</span>
                                                {getStatusBadge(req.status)}
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-4 bg-muted/50">
                                         <div className="space-y-4">
                                            {req.items.map((item: any) => (
                                                <div key={item.itemId} className="p-3 border bg-background rounded-md">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <h4 className="font-bold">{item.name}</h4>
                                                        <Badge variant={item.hasEnoughStock ? 'default' : 'destructive'}>
                                                            المطلوب: {item.quantity} / المتاح: {item.availableStock}
                                                        </Badge>
                                                    </div>
                                                    {req.isMainSource && item.pickingPlan && item.pickingPlan.length > 0 && (
                                                         <div>
                                                            <p className="text-xs font-semibold mb-1">خطة السحب المقترحة:</p>
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>الحاوية</TableHead>
                                                                        <TableHead className="text-center">الكمية للسحب</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {item.pickingPlan.map((plan: any, index: number) => (
                                                                        <TableRow key={index}>
                                                                            <TableCell className="flex items-center gap-2"><MapPin className="h-4 w-4"/>{plan.sectionName}</TableCell>
                                                                            <TableCell className="text-center font-bold text-primary">{plan.toPick}</TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    )}
                                                     {!item.hasEnoughStock && (
                                                         <div className="flex justify-end gap-2 mt-2">
                                                              <Button variant="secondary" size="sm" onClick={() => router.push(`/purchases/orders/new?itemId=${item.itemId}&qty=${item.quantity - item.availableStock}`)}>
                                                                 <ShoppingCart className="h-4 w-4 ml-2"/> إنشاء أمر شراء بالناقص
                                                              </Button>
                                                        </div>
                                                     )}
                                                </div>
                                            ))}
                                         </div>

                                         <div className="mt-4 flex flex-wrap justify-end gap-2">
                                             {req.status === 'pending' && (
                                                 <>
                                                     <Button variant="outline" onClick={() => handleFulfill(req, true)} disabled={isSaving === req.id}>
                                                        {isSaving === req.id ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <PackageCheck className="ml-2 h-4 w-4"/>}
                                                        إرسال المتاح فقط
                                                     </Button>
                                                    <Button onClick={() => handleFulfill(req)} disabled={!req.canBeFulfilled || isSaving === req.id}>
                                                        {isSaving === req.id ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <PackageCheck className="ml-2 h-4 w-4"/>}
                                                        تنفيذ الصرف الكامل
                                                    </Button>
                                                 </>
                                             )}
                                         </div>
                                         {!req.canBeFulfilled && req.status === 'pending' && (
                                            <p className="text-xs text-destructive text-right mt-2 flex items-center gap-1 justify-end">
                                                <AlertTriangle className="h-4 w-4"/>
                                                لا يمكن تنفيذ الطلب بالكامل لوجود أصناف رصيدها غير كافٍ.
                                            </p>
                                         )}
                                    </AccordionContent>
                                </AccordionItem>
                                )
                            }) : (
                                <div className="text-center text-muted-foreground p-8">لا توجد طلبات تطابق الفلاتر المحددة.</div>
                            )}
                        </Accordion>
                    </CardContent>
                </Card>
            </main>
        </>
    );
}

    
