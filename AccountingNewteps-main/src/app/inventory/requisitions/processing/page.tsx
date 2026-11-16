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
import {
  Loader2,
  PackageCheck,
  AlertTriangle,
  MapPin,
  ShoppingCart,
  Filter,
  Boxes,
  Clock,
  CheckCircle2,
  PlayCircle,
  Truck,
  FileText,
  ArrowLeft,
  XCircle,
} from "lucide-react";
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
import { calculateStockForItemInWarehouse } from '@/lib/inventory-utils';

export default function RequisitionProcessingPage() {
    const dataContext = useData();
    const { 
        requisitions, 
        stockOutRecords,
        warehouses, 
        inventory, 
        dbAction, 
        getNextId, 
        loading, 
        items: allItems,
        inventorySections,
        settings,
    } = dataContext;

    const [isSaving, setIsSaving] = useState<string | null>(null);
    // Custom container overrides selected during preparation: { [orderId_itemId]: sectionId }
    const [selectedSections, setSelectedSections] = useState<Record<string, string>>({});
    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();

    const [filters, setFilters] = useState({
        warehouseId: 'all',
        fromDate: '',
        toDate: '',
        status: 'active', // 'active' = pending_preparation, pending, preparing, prepared
        docType: 'all', // 'all' | 'stock_out' | 'requisition'
    });

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const mainWarehouses = useMemo(() => {
        return warehouses.filter((w: any) => w.isMain || w.warehouseType === 'warehouse');
    }, [warehouses]);

    const mainWarehouseIds = useMemo(() => {
        return new Set(mainWarehouses.map((w: any) => w.id));
    }, [mainWarehouses]);

    // Helper to compute stock & container picking plan for an item in a logistics warehouse
    const buildItemPickingInfo = useCallback((itemId: string, itemName: string, requestedQty: number, sourceWarehouse: any, currentSectionId?: string) => {
        const warehouseTotalStock = calculateStockForItemInWarehouse(itemId, sourceWarehouse.id, dataContext);
        const sectionsForWarehouse = (inventorySections || []).filter((s: any) => (s.mainWarehouseId || s.MainWarehouseId) === sourceWarehouse.id);

        const sectionsWithItem = (inventory || [])
            .filter((inv: any) => inv.id.startsWith(`${sourceWarehouse.id}-`) && inv.items && inv.items[itemId])
            .map((inv: any) => {
                const sectionId = inv.id.slice(sourceWarehouse.id.length + 1);
                const sectionDetails = sectionsForWarehouse.find((s: any) => s.id === sectionId) || (inventorySections || []).find((s: any) => s.id === sectionId);
                return {
                    sectionId,
                    sectionName: sectionDetails?.name || `حاوية (${sectionId.slice(-4)})`,
                    stock: Number(inv.items[itemId]?.balance || 0),
                };
            })
            .filter((s: any) => s.stock > 0)
            .sort((a: any, b: any) => b.stock - a.stock);

        const containerTotalStock = sectionsWithItem.reduce((sum: number, s: any) => sum + s.stock, 0);
        const totalAvailableStock = Math.max(warehouseTotalStock, containerTotalStock);
        const allowNegative = Boolean(settings?.main?.financial?.allowNegativeStock);
        const hasEnoughStock = totalAvailableStock >= requestedQty || allowNegative;

        const pickingPlan: any[] = [];
        let remainingQtyToPick = Math.min(requestedQty, Math.max(containerTotalStock, requestedQty));

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

        const defaultSecId = currentSectionId || pickingPlan[0]?.sectionId || sectionsForWarehouse[0]?.id || '';

        return {
            itemId,
            name: itemName,
            quantity: requestedQty,
            availableStock: totalAvailableStock,
            hasEnoughStock,
            pickingPlan,
            sectionsForWarehouse,
            selectedSectionId: defaultSecId,
        };
    }, [dataContext, inventory, inventorySections, settings]);

    // Combine Logistics Stock-Out Orders AND Branch Requisitions into a unified preparation & dispatch queue
    const unifiedOrders = useMemo(() => {
        if (loading) return [];
        const list: any[] = [];

        // 1. Stock-Out Vouchers from Logistics Warehouses
        const linkedRequisitionIds = new Set<string>();
        (stockOutRecords || []).forEach((so: any) => {
            const sourceId = so.sourceId || so.warehouseId;
            if (!mainWarehouseIds.has(sourceId)) return;
            if (so.requisitionId) linkedRequisitionIds.add(so.requisitionId);

            const sourceWh = warehouses.find((w: any) => w.id === sourceId);
            if (!sourceWh) return;

            const destWh = so.toWarehouseId ? warehouses.find((w: any) => w.id === so.toWarehouseId) : null;
            const rawStatus = so.status || so.Status || 'approved';
            // Normalize status for display
            const normalizedStatus =
                rawStatus === 'pending_preparation' || rawStatus === 'pending'
                    ? 'pending_preparation'
                    : rawStatus === 'preparing'
                    ? 'preparing'
                    : rawStatus === 'prepared'
                    ? 'prepared'
                    : rawStatus === 'approved' || rawStatus === 'completed' || rawStatus === 'fulfilled'
                    ? 'dispatched'
                    : rawStatus;

            const itemsWithStock = (so.items || []).map((itm: any) => {
                const itemId = itm.id || itm.itemId;
                const masterItem = allItems.find((i: any) => i.id === itemId);
                const qty = Number(itm.qty || itm.quantity || 0);
                const overrideKey = `${so.id}_${itemId}`;
                const chosenSec = selectedSections[overrideKey] || itm.sectionId;
                return buildItemPickingInfo(itemId, itm.name || masterItem?.name || 'صنف', qty, sourceWh, chosenSec);
            });

            const canBeFulfilled = itemsWithStock.every((i: any) => i.hasEnoughStock);

            list.push({
                id: so.id,
                docType: 'stock_out',
                referenceNumber: so.receiptNumber || `إذ-خ-${so.id.slice(-6)}`,
                date: so.date,
                sourceWarehouseId: sourceId,
                sourceWarehouseName: sourceWh.name,
                destinationWarehouseId: so.toWarehouseId || null,
                destinationWarehouseName: destWh?.name || so.reason || 'صرف مخزني',
                reason: so.reason || 'صرف مخزني',
                createdByName: so.createdByName || 'مسؤول المخزن',
                notes: so.notes || '',
                status: normalizedStatus,
                rawStatus,
                requisitionId: so.requisitionId || null,
                items: itemsWithStock,
                canBeFulfilled,
                isMainSource: true,
                originalRecord: so,
            });
        });

        // 2. Branch Requisitions to Logistics Warehouses (that don't already have a stock-out voucher)
        (requisitions || []).forEach((req: any) => {
            if (!mainWarehouseIds.has(req.toWarehouseId)) return;
            if (linkedRequisitionIds.has(req.id)) return; // Already represented by its linked stock-out voucher

            const sourceWh = warehouses.find((w: any) => w.id === req.toWarehouseId);
            const destWh = warehouses.find((w: any) => w.id === req.fromWarehouseId);
            if (!sourceWh) return;

            const rawStatus = req.status || 'pending';
            const normalizedStatus =
                rawStatus === 'pending' || rawStatus === 'pending_preparation'
                    ? 'pending_preparation'
                    : rawStatus === 'preparing'
                    ? 'preparing'
                    : rawStatus === 'prepared'
                    ? 'prepared'
                    : rawStatus === 'fulfilled' || rawStatus === 'approved' || rawStatus === 'completed'
                    ? 'dispatched'
                    : rawStatus;

            const itemsWithStock = (req.items || []).map((itm: any) => {
                const itemId = itm.itemId || itm.id;
                const masterItem = allItems.find((i: any) => i.id === itemId);
                const qty = Number(itm.quantity || itm.qty || 0);
                const overrideKey = `${req.id}_${itemId}`;
                const chosenSec = selectedSections[overrideKey] || itm.sectionId;
                return buildItemPickingInfo(itemId, itm.name || masterItem?.name || 'صنف', qty, sourceWh, chosenSec);
            });

            const canBeFulfilled = itemsWithStock.every((i: any) => i.hasEnoughStock);

            list.push({
                id: req.id,
                docType: 'requisition',
                referenceNumber: req.requisitionNumber || `ط-ب-${req.id.slice(-6)}`,
                date: req.date,
                sourceWarehouseId: req.toWarehouseId,
                sourceWarehouseName: sourceWh.name,
                destinationWarehouseId: req.fromWarehouseId,
                destinationWarehouseName: destWh?.name || 'فرع طالب',
                reason: `طلب بضاعة لفرع ${destWh?.name || ''}`,
                createdByName: req.requesterName || req.requestedByName || req.userName || 'مسؤول الفرع',
                notes: req.notes || '',
                status: normalizedStatus,
                rawStatus,
                requisitionId: req.id,
                items: itemsWithStock,
                canBeFulfilled,
                isMainSource: true,
                originalRecord: req,
            });
        });

        // Filter the combined queue
        return list
            .filter(order => {
                if (filters.docType !== 'all' && order.docType !== filters.docType) return false;
                if (filters.warehouseId !== 'all' && order.sourceWarehouseId !== filters.warehouseId) return false;

                if (filters.status === 'active') {
                    if (!['pending_preparation', 'preparing', 'prepared'].includes(order.status)) return false;
                } else if (filters.status !== 'all') {
                    if (order.status !== filters.status) return false;
                }

                const orderDate = new Date(order.date);
                const from = filters.fromDate ? new Date(filters.fromDate) : null;
                const to = filters.toDate ? new Date(filters.toDate) : null;
                if (from) from.setHours(0, 0, 0, 0);
                if (to) to.setHours(23, 59, 59, 999);
                if (from && orderDate < from) return false;
                if (to && orderDate > to) return false;

                return true;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [loading, stockOutRecords, requisitions, mainWarehouseIds, warehouses, allItems, selectedSections, buildItemPickingInfo, filters]);

    // Stage 1 -> Stage 2: Start Preparation (تحويل إلى جاري التحضير)
    const handleStartPreparation = async (order: any) => {
        setIsSaving(order.id);
        try {
            if (order.docType === 'stock_out') {
                await dbAction('stockOutRecords', 'update', {
                    id: order.id,
                    data: { status: 'preparing' }
                });
                if (order.requisitionId) {
                    await dbAction('requisitions', 'update', {
                        id: order.requisitionId,
                        data: { status: 'preparing' }
                    });
                }
            } else {
                await dbAction('requisitions', 'update', {
                    id: order.id,
                    data: { status: 'preparing' }
                });
            }
            toast({
                title: "بدء مرحلة التحضير 📦",
                description: `تم تحويل (${order.referenceNumber}) إلى مرحلة "جاري التحضير وتجهيز الحاويات". الرصيد لم يُخصم بعد.`
            });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'خطأ', description: 'تعذر تحديث حالة التحضير.' });
        } finally {
            setIsSaving(null);
        }
    };

    // Stage 2 -> Stage 3: Mark Prepared with selected containers (تأكيد انتهاء التحضير وجاهزية الصرف)
    const handleMarkPrepared = async (order: any) => {
        setIsSaving(order.id);
        try {
            if (order.docType === 'stock_out') {
                const updatedItems = (order.originalRecord.items || []).map((itm: any) => {
                    const itemId = itm.id || itm.itemId;
                    const chosenSec = selectedSections[`${order.id}_${itemId}`] || order.items.find((i: any) => i.itemId === itemId)?.selectedSectionId || itm.sectionId || null;
                    return { ...itm, sectionId: chosenSec };
                });
                await dbAction('stockOutRecords', 'update', {
                    id: order.id,
                    data: { status: 'prepared', items: updatedItems }
                });
                if (order.requisitionId) {
                    await dbAction('requisitions', 'update', {
                        id: order.requisitionId,
                        data: { status: 'prepared' }
                    });
                }
            } else {
                const updatedItems = (order.originalRecord.items || []).map((itm: any) => {
                    const itemId = itm.itemId || itm.id;
                    const chosenSec = selectedSections[`${order.id}_${itemId}`] || order.items.find((i: any) => i.itemId === itemId)?.selectedSectionId || itm.sectionId || null;
                    return { ...itm, sectionId: chosenSec };
                });
                await dbAction('requisitions', 'update', {
                    id: order.id,
                    data: { status: 'prepared', items: updatedItems }
                });
            }
            toast({
                title: "تم إتمام التحضير بنجاح ✅",
                description: `الإذن (${order.referenceNumber}) جاهز الآن للمرحلة الأخيرة: "اعتماد الصرف النهائي وخصم الرصيد".`
            });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'خطأ', description: 'تعذر حفظ بيانات التحضير.' });
        } finally {
            setIsSaving(null);
        }
    };

    // Stage 3 -> Final Dispatch: Approve Stock-Out & Deduct Balance (اعتماد الصرف النهائي وخصم الرصيد الفعلي)
    const handleConfirmFinalDispatch = async (order: any, partialFulfillment: boolean = false) => {
        setIsSaving(order.id);
        try {
            const itemsToDispatch = order.items.map((item: any) => {
                const qtyToFulfill = partialFulfillment ? Math.min(item.quantity, item.availableStock) : item.quantity;
                if (qtyToFulfill <= 0) return null;
                const masterItem = allItems.find((i: any) => i.id === item.itemId);
                const chosenSec = selectedSections[`${order.id}_${item.itemId}`] || item.selectedSectionId || item.pickingPlan?.[0]?.sectionId || masterItem?.defaultBinId || null;
                return {
                    id: item.itemId,
                    itemId: item.itemId,
                    name: item.name,
                    qty: qtyToFulfill,
                    cost: masterItem?.cost || 0,
                    sectionId: chosenSec,
                };
            }).filter(Boolean);

            if (itemsToDispatch.length === 0) {
                toast({ variant: 'destructive', title: 'لا يوجد رصيد متاح', description: 'لا توجد كميات متاحة لصرفها.' });
                setIsSaving(null);
                return;
            }

            if (order.docType === 'stock_out') {
                // 1. Update existing StockOutRecord to 'approved' -> THIS triggers actual stock deduction!
                await dbAction('stockOutRecords', 'update', {
                    id: order.id,
                    data: {
                        status: 'approved',
                        items: itemsToDispatch,
                        notes: `${order.notes ? order.notes + ' | ' : ''}تم التحضير واعتماد الصرف النهائي بواسطة ${user?.name || 'مسؤول المخزن'}`
                    }
                });

                // 2. If linked to a branch requisition, mark requisition fulfilled and create goods-in-transit if not already created
                if (order.requisitionId && order.destinationWarehouseId) {
                    const destWarehouse = warehouses.find((w: any) => w.id === order.destinationWarehouseId);
                    const isDestMain = Boolean(destWarehouse?.isMain);
                    const newStockInRecord = {
                        warehouseId: order.destinationWarehouseId,
                        fromWarehouseId: order.sourceWarehouseId,
                        date: new Date().toISOString(),
                        items: itemsToDispatch.map((i: any) => ({ itemId: i.id, name: i.name, qty: i.qty, cost: i.cost })),
                        reason: 'requisition_fulfillment',
                        notes: `وارد من إذن صرف لوجستي #${order.referenceNumber} (${order.sourceWarehouseName})`,
                        receiptNumber: `إذ-د-${await getNextId('stockIn')}`,
                        createdById: user?.id,
                        createdByName: user?.name,
                        requisitionId: order.requisitionId,
                        status: isDestMain ? 'pending_putaway' : 'in_transit',
                    };
                    await dbAction('stockInRecords', 'add', newStockInRecord);
                    await dbAction('requisitions', 'update', { id: order.requisitionId, data: { status: 'fulfilled' } });
                }

                toast({
                    title: 'تم اعتماد الصرف النهائي وخصم الرصيد 🎉',
                    description: `تم تغيير حالة إذن الصرف (${order.referenceNumber}) إلى "تم الصرف" وتم خصم الكميات فعلياً من رصيد المخزن اللوجستي.`
                });
            } else {
                // Requisition flow -> Create approved StockOutRecord + Transit StockInRecord + Update Requisition
                const destWarehouse = warehouses.find((w: any) => w.id === order.destinationWarehouseId);
                const isDestMain = Boolean(destWarehouse?.isMain);

                const newStockInRecord = {
                    warehouseId: order.destinationWarehouseId,
                    fromWarehouseId: order.sourceWarehouseId,
                    date: new Date().toISOString(),
                    items: itemsToDispatch.map((i: any) => ({ itemId: i.id, name: i.name, qty: i.qty, cost: i.cost })),
                    reason: 'requisition_fulfillment',
                    notes: `وارد من طلب بضاعة #${order.referenceNumber} من ${order.sourceWarehouseName}`,
                    receiptNumber: `إذ-د-${await getNextId('stockIn')}`,
                    createdById: user?.id,
                    createdByName: user?.name,
                    requisitionId: order.id,
                    status: isDestMain ? 'pending_putaway' : 'in_transit',
                };

                await dbAction('stockInRecords', 'add', newStockInRecord);

                const stockOutReceipt = `إذ-خ-${await getNextId('stockOut')}`;
                await dbAction('stockOutRecords', 'add', {
                    warehouseId: order.sourceWarehouseId,
                    sourceId: order.sourceWarehouseId,
                    date: new Date().toISOString(),
                    items: itemsToDispatch,
                    reason: `صرف لفرع ${order.destinationWarehouseName}`,
                    status: 'approved',
                    receiptNumber: stockOutReceipt,
                    requisitionId: order.id,
                    createdById: user?.id,
                    createdByName: user?.name,
                });

                if (!partialFulfillment) {
                    await dbAction('requisitions', 'update', { id: order.id, data: { status: 'fulfilled' } });
                } else {
                    const remainingItems = order.items
                        .map((item: any) => ({ ...item, quantity: item.quantity - Math.min(item.quantity, item.availableStock) }))
                        .filter((item: any) => item.quantity > 0);
                    if (remainingItems.length > 0) {
                        await dbAction('requisitions', 'update', {
                            id: order.id,
                            data: { items: remainingItems.map((i: any) => ({ itemId: i.itemId, name: i.name, quantity: i.quantity })) }
                        });
                    } else {
                        await dbAction('requisitions', 'update', { id: order.id, data: { status: 'fulfilled' } });
                    }
                }

                toast({
                    title: 'تم اعتماد الصرف النهائي وخصم الرصيد 🎉',
                    description: `تم إصدار إذن الصرف (${stockOutReceipt}) وخصم الرصيد فعلياً وتحويل البضاعة إلى بضاعة بالطريق.`
                });
            }
        } catch (error) {
            console.error("Failed to dispatch order:", error);
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل في اعتماد الصرف النهائي.' });
        } finally {
            setIsSaving(null);
        }
    };

    const handleCancelOrder = async (order: any) => {
        setIsSaving(order.id);
        try {
            if (order.docType === 'stock_out') {
                await dbAction('stockOutRecords', 'update', { id: order.id, data: { status: 'cancelled' } });
            } else {
                await dbAction('requisitions', 'update', { id: order.id, data: { status: 'rejected' } });
            }
            toast({ title: 'تم إلغاء الطلب/الإذن', description: `تم إلغاء (${order.referenceNumber}) دون خصم أي رصيد.` });
        } catch (err) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'تعذر إلغاء الإذن.' });
        } finally {
            setIsSaving(null);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending_preparation':
                return <Badge variant="outline" className="border-amber-500 text-foreground bg-amber-500/10 gap-1"><Clock className="h-3 w-3" /> 1. بانتظار التحضير (الرصيد لم يُخصم)</Badge>;
            case 'preparing':
                return <Badge variant="outline" className="border-blue-500 text-foreground bg-blue-500/10 gap-1"><Boxes className="h-3 w-3" /> 2. جاري التحضير من الحاويات (الرصيد لم يُخصم)</Badge>;
            case 'prepared':
                return <Badge variant="outline" className="border-border text-foreground bg-muted/40 gap-1"><PackageCheck className="h-3 w-3" /> 3. تم التحضير وبانتظار الصرف النهائي</Badge>;
            case 'dispatched':
                return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" /> 4. تم الصرف النهائي وخصم الرصيد</Badge>;
            case 'cancelled':
            case 'rejected':
                return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> ملغي / مرفوض</Badge>;
            default:
                return <Badge variant="secondary">{status}</Badge>;
        }
    };

    const warehouseOptions = useMemo(() => {
        const options = [
            { value: 'all', label: 'كل المخازن اللوجستية والرئيسية' },
            ...mainWarehouses.map((w: any) => ({ value: w.id, label: w.name }))
        ];
        if (user?.role === 'مسؤول' || user?.warehouseIds?.includes('all')) return options;
        const filtered = options.filter(w => w.value === 'all' || user?.warehouseIds?.includes(w.value));
        return filtered.length > 1 ? filtered : options;
    }, [mainWarehouses, user]);

    // Summary counters
    const stageCounts = useMemo(() => {
        const counts = { pending_preparation: 0, preparing: 0, prepared: 0, dispatched: 0 };
        unifiedOrders.forEach(o => {
            if (o.status in counts) counts[o.status as keyof typeof counts]++;
        });
        return counts;
    }, [unifiedOrders]);

    if (loading) {
        return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <>
            <PageHeader title="تحضير وصرف الطلبات وأذونات المخازن اللوجستية" />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                {/* Summary KPI Cards for Stages */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="border-amber-500/30 bg-amber-500/5">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">المرحلة 1: بانتظار التحضير</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{stageCounts.pending_preparation}</p>
                                <p className="text-[11px] text-muted-foreground">أذونات وطلبات لم يبدأ تحضيرها</p>
                            </div>
                            <div className="p-3 rounded-full bg-amber-500/15 text-foreground">
                                <Clock className="h-6 w-6" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-blue-500/30 bg-blue-500/5">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">المرحلة 2: جاري التحضير</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{stageCounts.preparing}</p>
                                <p className="text-[11px] text-muted-foreground">جاري سحبها وتجهيزها من الحاويات</p>
                            </div>
                            <div className="p-3 rounded-full bg-blue-500/15 text-foreground">
                                <Boxes className="h-6 w-6" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border bg-card">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">المرحلة 3: جاهز للصرف النهائي</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{stageCounts.prepared}</p>
                                <p className="text-[11px] text-muted-foreground">بانتظار اعتماد الصرف وخصم الرصيد</p>
                            </div>
                            <div className="p-3 rounded-full bg-muted text-foreground">
                                <PackageCheck className="h-6 w-6" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-emerald-500/30 bg-emerald-500/5">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">المرحلة 4: تم الصرف وخصم الرصيد</p>
                                <p className="text-2xl font-bold text-emerald-600 mt-1">{stageCounts.dispatched}</p>
                                <p className="text-[11px] text-muted-foreground">تم خروج البضاعة واحتساب الرصيد</p>
                            </div>
                            <div className="p-3 rounded-full bg-emerald-500/15 text-emerald-600">
                                <Truck className="h-6 w-6" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" /> فلاتر البحث</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="space-y-2">
                            <Label>المخزن اللوجستي (المصدر)</Label>
                            <Combobox
                                options={warehouseOptions}
                                value={filters.warehouseId}
                                onValueChange={(v) => handleFilterChange('warehouseId', v)}
                                placeholder="اختر مخزنًا..."
                                emptyMessage="لا يوجد مخازن رئيسية."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>نوع المستند</Label>
                            <Select value={filters.docType} onValueChange={(v) => handleFilterChange('docType', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">الكل (أذونات صرف + طلبات فروع)</SelectItem>
                                    <SelectItem value="stock_out">أذونات صرف مخزن لوجستي</SelectItem>
                                    <SelectItem value="requisition">طلبات بضاعة من الفروع</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>مرحلة التحضير والصرف</Label>
                            <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">قيد التحضير والصرف (النشطة)</SelectItem>
                                    <SelectItem value="all">كل المراحل</SelectItem>
                                    <SelectItem value="pending_preparation">1. بانتظار التحضير</SelectItem>
                                    <SelectItem value="preparing">2. جاري التحضير</SelectItem>
                                    <SelectItem value="prepared">3. جاهز للصرف النهائي</SelectItem>
                                    <SelectItem value="dispatched">4. تم الصرف النهائي (مخصوم)</SelectItem>
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

                {/* Queue List */}
                <Card>
                    <CardHeader>
                        <CardTitle>قائمة التحضير والصرف اللوجستي ({unifiedOrders.length})</CardTitle>
                        <CardDescription>
                            أي إذن صرف بضاعة من مخزن لوجستي يمر بـ 3 مراحل (بانتظار التحضير ⬅ جاري التحضير وتحديد الحاويات ⬅ اعتماد الصرف النهائي) حتى تتغير حالته ويُخصم رصيده الفعلي.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Accordion type="single" collapsible className="w-full space-y-3">
                            {unifiedOrders.length > 0 ? unifiedOrders.map(order => {
                                const stepIndex =
                                    order.status === 'pending_preparation' ? 1 :
                                    order.status === 'preparing' ? 2 :
                                    order.status === 'prepared' ? 3 :
                                    order.status === 'dispatched' ? 4 : 0;

                                return (
                                    <AccordionItem value={order.id} key={`${order.docType}-${order.id}`} className="border rounded-xl px-3 bg-card shadow-sm">
                                        <AccordionTrigger className="hover:no-underline py-4">
                                            <div className="flex flex-col md:flex-row justify-between w-full pr-2 rtl:pl-4 gap-3 text-right">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <Badge variant={order.docType === 'stock_out' ? 'default' : 'secondary'} className="text-xs">
                                                            <FileText className="h-3 w-3 ml-1" />
                                                            {order.docType === 'stock_out' ? 'إذن صرف لوجستي' : 'طلب بضاعة فرع'}
                                                        </Badge>
                                                        <span className="font-bold font-mono text-base text-primary">{order.referenceNumber}</span>
                                                        <span className="text-sm font-semibold">
                                                            من: {order.sourceWarehouseName}
                                                        </span>
                                                        <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
                                                        <span className="text-sm text-muted-foreground">
                                                            {order.destinationWarehouseName}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                                                        <span>التاريخ: {new Date(order.date).toLocaleString('ar-EG')}</span>
                                                        <span>•</span>
                                                        <span>بواسطة: {order.createdByName}</span>
                                                        <span>•</span>
                                                        <span>عدد الأصناف: {order.items.length}</span>
                                                        {order.notes && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="text-foreground dark:text-foreground">ملاحظات: {order.notes}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end justify-center gap-1.5">
                                                    {getStatusBadge(order.status)}
                                                </div>
                                            </div>
                                        </AccordionTrigger>

                                        <AccordionContent className="p-4 bg-muted/30 rounded-lg border-t space-y-5">
                                            {/* Visual 3-Stage Stepper */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-background rounded-xl border">
                                                <div className={`flex items-center gap-3 p-2.5 rounded-lg border ${stepIndex === 1 ? 'border-amber-500 bg-amber-500/10' : stepIndex > 1 ? 'border-emerald-500/40 bg-emerald-500/5' : 'opacity-50'}`}>
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${stepIndex > 1 ? 'bg-emerald-600 text-white' : stepIndex === 1 ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                                                        {stepIndex > 1 ? '✓' : '1'}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold">المرحلة 1: استلام أمر الصرف</div>
                                                        <div className="text-[11px] text-muted-foreground">مراجعة الأصناف وبدء التحضير</div>
                                                    </div>
                                                </div>

                                                <div className={`flex items-center gap-3 p-2.5 rounded-lg border ${stepIndex === 2 ? 'border-blue-500 bg-blue-500/10' : stepIndex > 2 ? 'border-emerald-500/40 bg-emerald-500/5' : 'opacity-50'}`}>
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${stepIndex > 2 ? 'bg-emerald-600 text-white' : stepIndex === 2 ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                                                        {stepIndex > 2 ? '✓' : '2'}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold">المرحلة 2: التحضير وتحديد الحاويات</div>
                                                        <div className="text-[11px] text-muted-foreground">سحب الأصناف من حاويات المخزن اللوجستي</div>
                                                    </div>
                                                </div>

                                                <div className={`flex items-center gap-3 p-2.5 rounded-lg border ${stepIndex === 3 ? 'border-primary bg-primary/10' : stepIndex === 4 ? 'border-emerald-500 bg-emerald-500/10' : 'opacity-50'}`}>
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${stepIndex === 4 ? 'bg-emerald-600 text-white' : stepIndex === 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                                        {stepIndex === 4 ? '✓' : '3'}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold">المرحلة 3: اعتماد الصرف وخصم الرصيد</div>
                                                        <div className="text-[11px] text-muted-foreground">خروج البضاعة واحتساب الرصيد الفعلي</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Items & Container Picking Plan */}
                                            <div className="space-y-3">
                                                {order.items.map((item: any) => {
                                                    const overrideKey = `${order.id}_${item.itemId}`;
                                                    const currentSecId = selectedSections[overrideKey] ?? item.selectedSectionId ?? '';

                                                    return (
                                                        <div key={item.itemId} className="p-3.5 border bg-background rounded-xl space-y-3">
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <h4 className="font-bold text-sm">{item.name}</h4>
                                                                </div>
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <Badge variant={item.hasEnoughStock ? 'default' : 'destructive'}>
                                                                        الكمية المطلوبة: {item.quantity} | المتاح بالمخزن اللوجستي: {item.availableStock}
                                                                    </Badge>
                                                                </div>
                                                            </div>

                                                            {/* Container selector for logistics warehouse */}
                                                            {order.status !== 'dispatched' && item.sectionsForWarehouse && item.sectionsForWarehouse.length > 0 && (
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t">
                                                                    <div className="space-y-1.5">
                                                                        <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                                                                            <MapPin className="h-3.5 w-3.5 text-primary" />
                                                                            تحديد الحاوية / القسم المسحوب منه الصنف:
                                                                        </Label>
                                                                        <Select
                                                                            value={currentSecId || 'none'}
                                                                            onValueChange={(val) => setSelectedSections(prev => ({ ...prev, [overrideKey]: val === 'none' ? '' : val }))}
                                                                        >
                                                                            <SelectTrigger className="h-9 text-xs">
                                                                                <SelectValue placeholder="اختر الحاوية المسحوب منها..." />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="none">سحب عام من المخزن اللوجستي</SelectItem>
                                                                                {item.sectionsForWarehouse.map((sec: any) => {
                                                                                    const planMatch = item.pickingPlan?.find((p: any) => p.sectionId === sec.id);
                                                                                    return (
                                                                                        <SelectItem key={sec.id} value={sec.id}>
                                                                                            {sec.name} {planMatch ? `(رصيد الحاوية: ${planMatch.available})` : ''}
                                                                                        </SelectItem>
                                                                                    );
                                                                                })}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>

                                                                    {item.pickingPlan && item.pickingPlan.length > 0 && (
                                                                        <div>
                                                                            <p className="text-xs font-semibold mb-1 text-muted-foreground">خطة السحب المقترحة من الحاويات:</p>
                                                                            <Table>
                                                                                <TableHeader>
                                                                                    <TableRow className="h-7">
                                                                                        <TableHead className="text-xs py-1">الحاوية</TableHead>
                                                                                        <TableHead className="text-center text-xs py-1">المتاح بالحاوية</TableHead>
                                                                                        <TableHead className="text-center text-xs py-1">الكمية المقترح سحبها</TableHead>
                                                                                    </TableRow>
                                                                                </TableHeader>
                                                                                <TableBody>
                                                                                    {item.pickingPlan.map((plan: any, idx: number) => (
                                                                                        <TableRow key={idx} className="h-8">
                                                                                            <TableCell className="text-xs py-1 flex items-center gap-1.5">
                                                                                                <MapPin className="h-3.5 w-3.5 text-primary" />
                                                                                                {plan.sectionName}
                                                                                            </TableCell>
                                                                                            <TableCell className="text-center text-xs py-1">{plan.available}</TableCell>
                                                                                            <TableCell className="text-center text-xs py-1 font-bold text-primary">{plan.toPick}</TableCell>
                                                                                        </TableRow>
                                                                                    ))}
                                                                                </TableBody>
                                                                            </Table>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {!item.hasEnoughStock && order.status !== 'dispatched' && (
                                                                <div className="flex justify-end gap-2 mt-2">
                                                                    <Button
                                                                        variant="secondary"
                                                                        size="sm"
                                                                        onClick={() => router.push(`/purchases/orders/new?itemId=${item.itemId}&qty=${Math.max(1, item.quantity - item.availableStock)}`)}
                                                                    >
                                                                        <ShoppingCart className="h-4 w-4 ml-2" /> إنشاء أمر شراء بالناقص
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Stage Action Buttons */}
                                            {order.status !== 'dispatched' && order.status !== 'cancelled' && order.status !== 'rejected' && (
                                                <div className="pt-3 border-t flex flex-wrap items-center justify-between gap-3">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleCancelOrder(order)}
                                                        disabled={isSaving === order.id}
                                                    >
                                                        <XCircle className="ml-1.5 h-4 w-4" />
                                                        إلغاء الإذن
                                                    </Button>

                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {order.status === 'pending_preparation' && (
                                                            <Button
                                                                onClick={() => handleStartPreparation(order)}
                                                                disabled={isSaving === order.id}
                                                                className="bg-amber-600 hover:bg-amber-700 text-white"
                                                            >
                                                                {isSaving === order.id ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <PlayCircle className="ml-2 h-4 w-4" />}
                                                                المرحلة 1: بدء التحضير وتجهيز الحاويات
                                                            </Button>
                                                        )}

                                                        {(order.status === 'pending_preparation' || order.status === 'preparing') && (
                                                            <Button
                                                                onClick={() => handleMarkPrepared(order)}
                                                                disabled={isSaving === order.id}
                                                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                                            >
                                                                {isSaving === order.id ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Boxes className="ml-2 h-4 w-4" />}
                                                                المرحلة 2: تأكيد إتمام التحضير وجاهزية الصرف
                                                            </Button>
                                                        )}

                                                        {order.status === 'prepared' && (
                                                            <>
                                                                {!order.canBeFulfilled && (
                                                                    <Button
                                                                        variant="outline"
                                                                        onClick={() => handleConfirmFinalDispatch(order, true)}
                                                                        disabled={isSaving === order.id}
                                                                    >
                                                                        {isSaving === order.id ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <PackageCheck className="ml-2 h-4 w-4" />}
                                                                        اعتماد صرف المتاح فقط وخصم الرصيد
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    onClick={() => handleConfirmFinalDispatch(order, false)}
                                                                    disabled={!order.canBeFulfilled || isSaving === order.id}
                                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                                                >
                                                                    {isSaving === order.id ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Truck className="ml-2 h-4 w-4" />}
                                                                    المرحلة 3: اعتماد الصرف النهائي وخصم الرصيد الفعلي
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {!order.canBeFulfilled && order.status !== 'dispatched' && (
                                                <p className="text-xs text-destructive text-right flex items-center gap-1 justify-end">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    تنبيه: بعض الأصناف رصيدها المتاح أقل من الكمية المطلوبة.
                                                </p>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            }) : (
                                <div className="text-center text-muted-foreground p-10 border border-dashed rounded-xl">
                                    لا توجد أذونات صرف لوجستية أو طلبات بضاعة في هذه المرحلة حالياً.
                                </div>
                            )}
                        </Accordion>
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
