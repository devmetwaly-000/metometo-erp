"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/data-provider";
import { useAuth } from "@/contexts/auth-context";
import { calculateStockForItemInWarehouse } from "@/lib/inventory-utils";
import JsBarcode from 'jsbarcode';
import { 
    Factory, 
    Plus, 
    Play, 
    CheckCircle2, 
    Clock, 
    AlertTriangle, 
    Printer, 
    Layers, 
    Calculator,
    PackageCheck,
    Coins,
    FileSpreadsheet,
    Eye,
    RotateCcw,
    Ban
} from "lucide-react";
import * as XLSX from 'xlsx';

interface ManufacturingOrder {
    Id: string;
    OrderNumber: string;
    BatchNumber?: string;
    OrderDate: string;
    FinishedItemId: string;
    FinishedItemName: string;
    TargetQuantity: number;
    ProducedQuantity: number;
    Status: 'draft' | 'in_progress' | 'completed' | 'cancelled';
    SourceWarehouseId: string;
    TargetWarehouseId: string;
    RawMaterialCost: number;
    LaborCost: number;
    OverheadCost: number;
    TotalCost: number;
    UnitCost: number;
    ProfitMarginPercent?: number;
    ExpectedScrapPercent?: number;
    NormalScrapQuantity?: number;
    AbnormalScrapQuantity?: number;
    NormalScrapCost?: number;
    EstimatedSalePrice?: number;
    SalePrice?: number;
    WasteTreatment?: 'expense' | 'allocate_to_good';
    WastedMaterialCost?: number;
    DamagedOutputCost?: number;
    BaseFinishedGoodsCost?: number;
    AllocatedWasteCost?: number;
    AllocatedWasteCostPerUnit?: number;
    ItemCostUpdated?: boolean;
    ItemSalePriceUpdated?: boolean;
    BOMDetailsJson?: string;
    Notes?: string;
    CreatedBy?: string;
    CreatedAt: string;
}

export default function ManufacturingOrdersPage() {
    const { toast } = useToast();
    const { user } = useAuth();
    const { items: allItems, warehouses, allData, retryDatabaseConnection } = useData();

    const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'in_progress' | 'completed'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Modal state for creating new order
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedItemId, setSelectedItemId] = useState<string>('');
    const [targetQuantity, setTargetQuantity] = useState<number>(1);
    const [sourceWarehouseId, setSourceWarehouseId] = useState<string>('main');
    const [targetWarehouseId, setTargetWarehouseId] = useState<string>('main');
    const [laborCost, setLaborCost] = useState<number>(0);
    const [overheadCost, setOverheadCost] = useState<number>(0);
    const [profitMarginPercent, setProfitMarginPercent] = useState<number>(25);
    const [expectedScrapPercent, setExpectedScrapPercent] = useState<number>(0);
    const [notes, setNotes] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [processingOrderActionId, setProcessingOrderActionId] = useState<string | null>(null);

    // Modal state for viewing/completing order
    const [selectedOrder, setSelectedOrder] = useState<ManufacturingOrder | null>(null);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [isCompleteOpen, setIsCompleteOpen] = useState(false);
    const [producedQty, setProducedQty] = useState<number>(1);
    const [scrapQty, setScrapQty] = useState<number>(0);
    const [wasteTreatment, setWasteTreatment] = useState<'expense' | 'allocate_to_good'>('allocate_to_good');
    const [updateItemCost, setUpdateItemCost] = useState(true);
    const [updateItemSalePrice, setUpdateItemSalePrice] = useState(true);
    const [executionMaterials, setExecutionMaterials] = useState<any[]>([]);
    const [isBatchPrintOpen, setIsBatchPrintOpen] = useState(false);
    const [batchPrintOrder, setBatchPrintOrder] = useState<ManufacturingOrder | null>(null);
    const [batchPrintFormat, setBatchPrintFormat] = useState<'label_3x1_5' | 'label_4x1' | 'a4'>('label_3x1_5');
    const [batchPrintCopies, setBatchPrintCopies] = useState(1);

    // Filter manufactured items (those with components or itemType === 'manufactured')
    const manufacturedItems = useMemo(() => {
        return (allItems || []).filter((item: any) => 
            item.itemType === 'manufactured' || (item.components && item.components.length > 0)
        );
    }, [allItems]);

    // Selected manufactured item object
    const selectedItem = useMemo(() => {
        return (allItems || []).find((item: any) => item.id === selectedItemId);
    }, [allItems, selectedItemId]);

    // Calculate BOM details for the current target quantity
    const calculatedBOM = useMemo(() => {
        if (!selectedItem || !selectedItem.components) return [];

        return selectedItem.components.map((comp: any) => {
            const rawItem = (allItems || []).find((it: any) => it.id === comp.itemId);
            const unitQty = Number(comp.quantity) || 0;
            const requiredTotalQty = unitQty * (Number(targetQuantity) || 1);
            const costPerUnit = Number(rawItem?.cost) || Number(rawItem?.costPrice) || Number(rawItem?.purchasePrice) || 0;
            const totalComponentCost = requiredTotalQty * costPerUnit;

            // Available stock in source warehouse
            const whStock = calculateStockForItemInWarehouse(String(comp.itemId), sourceWarehouseId, allData);
            const isAvailable = whStock >= requiredTotalQty;

            return {
                itemId: comp.itemId,
                name: rawItem?.name || comp.itemId,
                unit: comp.unit || rawItem?.baseUnit || 'قطعة',
                unitQty,
                requiredTotalQty,
                availableStock: whStock,
                isAvailable,
                costPerUnit,
                totalCost: totalComponentCost
            };
        });
    }, [selectedItem, targetQuantity, allItems, sourceWarehouseId, allData]);

    const totalRawCost = useMemo(() => {
        return calculatedBOM.reduce((sum: number, c: any) => sum + c.totalCost, 0);
    }, [calculatedBOM]);

    const totalEstimatedCost = totalRawCost + Number(laborCost || 0) + Number(overheadCost || 0);
    const estimatedUnitCost = targetQuantity > 0 ? totalEstimatedCost / targetQuantity / (1 - Math.min(99.99, Math.max(0, expectedScrapPercent)) / 100) : 0;
    const estimatedSalePrice = profitMarginPercent >= 100 ? 0 : estimatedUnitCost / (1 - Math.max(0, profitMarginPercent) / 100);
    const actualConsumedCost = executionMaterials.reduce((sum, material) => sum + (Number(material.usedQty) || 0) * (Number(material.costPerUnit) || 0), 0);
    const actualMaterialWasteCost = executionMaterials.reduce((sum, material) => sum + (Number(material.wasteQty) || 0) * (Number(material.costPerUnit) || 0), 0);
    const actualBatchCost = actualConsumedCost + Number(selectedOrder?.LaborCost || 0) + Number(selectedOrder?.OverheadCost || 0);
    const actualOutputQty = producedQty + Math.max(0, scrapQty);
    const normalScrapAllowanceQty = Number(selectedOrder?.TargetQuantity || 0) * Number(selectedOrder?.ExpectedScrapPercent || 0) / 100;
    const normalScrapQty = Math.min(Math.max(0, scrapQty), normalScrapAllowanceQty);
    const abnormalScrapQty = Math.max(0, scrapQty - normalScrapQty);
    const baseFinishedGoodsCost = actualOutputQty > 0 ? actualBatchCost * producedQty / actualOutputQty : 0;
    const normalScrapCost = actualOutputQty > 0 ? actualBatchCost * normalScrapQty / actualOutputQty : 0;
    const abnormalScrapCost = actualOutputQty > 0 ? actualBatchCost * abnormalScrapQty / actualOutputQty : 0;
    const allocatedWasteCost = normalScrapCost + (wasteTreatment === 'allocate_to_good' ? actualMaterialWasteCost : 0);
    const allocatedWasteCostPerUnit = producedQty > 0 ? allocatedWasteCost / producedQty : 0;
    const actualFinishedGoodsCost = baseFinishedGoodsCost + allocatedWasteCost;
    const actualGoodUnitCost = producedQty > 0 ? actualFinishedGoodsCost / producedQty : 0;
    const actualWasteExpenseCost = abnormalScrapCost + (wasteTreatment === 'expense' ? actualMaterialWasteCost : 0);
    const actualTargetMargin = Math.min(99.99, Math.max(0, Number(selectedOrder?.ProfitMarginPercent ?? 25)));
    const actualSalePrice = actualGoodUnitCost / (1 - actualTargetMargin / 100);
    const exceedsScrapAllowance = scrapQty > normalScrapAllowanceQty + 0.0001;
    const exceedsTargetOutput = actualOutputQty > Number(selectedOrder?.TargetQuantity || 0) + 0.0001;
    const overPlanMaterials = executionMaterials.filter(material =>
        Number(material.usedQty || 0) + Number(material.wasteQty || 0) > Number(material.plannedQty || 0) + 0.0001
    );
    const ordersWithExtraMaterialIssue = useMemo(() => {
        const result = new Set<string>();
        for (const record of allData?.stockOutRecords || []) {
            let rows: any[] = [];
            try {
                const raw = record.itemsJson || record.ItemsJson || [];
                rows = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } catch { rows = []; }
            if (!Array.isArray(rows)) continue;
            for (const row of rows) {
                const orderId = String(row.manufacturingOrderId || row.ManufacturingOrderId || '');
                if (orderId && Number(row.extraIssuedQty || row.ExtraIssuedQty || 0) > 0) result.add(orderId);
            }
        }
        return result;
    }, [allData?.stockOutRecords]);

    const hasMissingStock = useMemo(() => {
        return calculatedBOM.some((c: any) => !c.isAvailable);
    }, [calculatedBOM]);

    // Fetch orders from API
    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/manufacturing/orders');
            const data = await res.json();
            if (data.success) {
                setOrders(data.orders || []);
            }
        } catch (err) {
            console.error('Failed to load manufacturing orders:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    // KPIs
    const kpis = useMemo(() => {
        const total = orders.length;
        const draft = orders.filter(o => o.Status === 'draft').length;
        const inProgress = orders.filter(o => o.Status === 'in_progress').length;
        const completed = orders.filter(o => o.Status === 'completed').length;
        const totalCompletedCost = orders
            .filter(o => o.Status === 'completed')
            .reduce((sum, o) => sum + (Number(o.TotalCost) || 0), 0);

        return { total, draft, inProgress, completed, totalCompletedCost };
    }, [orders]);

    // Filtered orders list
    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            if (statusFilter !== 'all' && order.Status !== statusFilter) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                return (
                    order.OrderNumber.toLowerCase().includes(q) ||
                    order.FinishedItemName.toLowerCase().includes(q) ||
                    (order.Notes && order.Notes.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [orders, statusFilter, searchQuery]);

    // Handle Create Order
    const handleCreateOrder = async (startDirectly = false) => {
        if (!selectedItemId) {
            toast({ title: 'تنبيه', description: 'يرجى اختيار المنتج المراد تصنيعه أولاً.', variant: 'destructive' });
            return;
        }
        if (targetQuantity <= 0) {
            toast({ title: 'خطأ', description: 'يجب أن تكون الكمية المستهدفة أكبر من صفر.', variant: 'destructive' });
            return;
        }
        if (profitMarginPercent < 0 || profitMarginPercent >= 100) {
            toast({ title: 'هامش ربح غير صالح', description: 'أدخل هامشًا من 0 إلى أقل من 100٪ لحساب سعر البيع.', variant: 'destructive' });
            return;
        }
        if (!Number.isFinite(expectedScrapPercent) || expectedScrapPercent < 0 || expectedScrapPercent >= 100) {
            toast({ title: 'نسبة هالك غير صالحة', description: 'أدخل نسبة هالك طبيعي من 0 إلى أقل من 100٪.', variant: 'destructive' });
            return;
        }
        if (startDirectly && hasMissingStock) {
            const shortage = calculatedBOM.find((component: any) => !component.isAvailable);
            toast({ title: 'لا يمكن بدء أمر التشغيل', description: `رصيد ${shortage?.name || 'الخامة'} غير كافٍ. المطلوب ${shortage?.requiredTotalQty} والمتاح ${shortage?.availableStock}.`, variant: 'destructive' });
            return;
        }

        setSubmitting(true);
        try {
            const newOrder = {
                orderNumber: `WO-${Date.now().toString().slice(-6)}`,
                batchNumber: `LOT-${Date.now().toString().slice(-8)}`,
                orderDate: new Date().toISOString(),
                finishedItemId: selectedItemId,
                finishedItemName: selectedItem?.name || '',
                targetQuantity,
                status: startDirectly ? 'in_progress' : 'draft',
                sourceWarehouseId,
                targetWarehouseId,
                rawMaterialCost: totalRawCost,
                laborCost: Number(laborCost) || 0,
                overheadCost: Number(overheadCost) || 0,
                profitMarginPercent: Number(profitMarginPercent) || 0,
                expectedScrapPercent: Number(expectedScrapPercent) || 0,
                estimatedSalePrice,
                bomDetails: calculatedBOM,
                notes
            };

            const res = await fetch('/api/manufacturing/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create',
                    order: newOrder,
                    userId: user?.id,
                    userName: user?.name
                })
            });

            const data = await res.json();
            if (data.success) {
                toast({ title: 'تم بنجاح', description: `تم حفظ أمر التشغيل برقم ${data.orderNumber}` });
                setIsCreateOpen(false);
                resetCreateForm();
                fetchOrders();
            } else {
                toast({ title: 'خطأ', description: data.message, variant: 'destructive' });
            }
        } catch (err: any) {
            toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    const resetCreateForm = () => {
        setSelectedItemId('');
        setTargetQuantity(1);
        setLaborCost(0);
        setOverheadCost(0);
        setProfitMarginPercent(25);
        setExpectedScrapPercent(0);
        setNotes('');
    };

    // Handle Start Order
    const handleStartOrder = async (order: ManufacturingOrder) => {
        try {
            const orderBom = (() => { try { return order.BOMDetailsJson ? JSON.parse(order.BOMDetailsJson) : []; } catch { return []; } })();
            const shortage = orderBom.find((component: any) => {
                const required = Number(component.requiredTotalQty) || Number(component.unitQty || 0) * Number(order.TargetQuantity || 0);
                return calculateStockForItemInWarehouse(String(component.itemId), order.SourceWarehouseId, allData) + 0.0001 < required;
            });
            if (shortage) {
                const required = Number(shortage.requiredTotalQty) || Number(shortage.unitQty || 0) * Number(order.TargetQuantity || 0);
                const available = calculateStockForItemInWarehouse(String(shortage.itemId), order.SourceWarehouseId, allData);
                toast({ title: 'لا يمكن بدء أمر التشغيل', description: `رصيد ${shortage.name || 'الخامة'} غير كافٍ. المطلوب ${required} والمتاح ${available}.`, variant: 'destructive' });
                return;
            }
            const res = await fetch('/api/manufacturing/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_status',
                    order: { id: order.Id, status: 'in_progress' },
                    userId: user?.id,
                    userName: user?.name
                })
            });
            const data = await res.json();
            if (data.success) {
                toast({ title: 'تم البدء', description: `بدأ تشغيل أمر التصنيع رقم ${order.OrderNumber}` });
                fetchOrders();
            }
        } catch (err: any) {
            toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
        }
    };

    const handleManufacturingOrderAction = async (order: ManufacturingOrder, action: 'recalculate_accounting' | 'cancel') => {
        const isCancel = action === 'cancel';
        if (isCancel && !window.confirm(`تأكيد إلغاء التشغيلة ${order.BatchNumber || order.OrderNumber}؟ سيتم خصم المنتج التام من المخزن، وإرجاع صافي الخامات، وترحيل القيود العكسية. يجب أن تكون كمية المنتج كاملة بالمخزن دون حركات بيع أو تحويل لاحقة.`)) return;
        setProcessingOrderActionId(order.Id);
        try {
            const response = await fetch('/api/manufacturing/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, orderId: order.Id, userId: user?.id, userName: user?.name })
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || 'تعذر تنفيذ الإجراء على التشغيلة.');
            await retryDatabaseConnection();
            await fetchOrders();
            toast({ title: isCancel ? 'تم إلغاء التشغيلة' : 'تمت إعادة احتساب القيود', description: data.message });
        } catch (error: any) {
            toast({ title: isCancel ? 'تعذر إلغاء التشغيلة' : 'تعذرت إعادة الاحتساب', description: error.message, variant: 'destructive' });
        } finally {
            setProcessingOrderActionId(null);
        }
    };

    // Handle complete: server saves the stock documents, actual costs and journal in one transaction.
    const handleExecuteCompletion = async () => {
        if (!selectedOrder) return;
        if (!Number.isFinite(producedQty) || producedQty <= 0 || !Number.isFinite(scrapQty) || scrapQty < 0) {
            toast({ title: 'راجع كميات الإنتاج', description: 'أدخل كمية إنتاج سليمة أكبر من صفر وكمية هالك لا تقل عن صفر.', variant: 'destructive' });
            return;
        }
        const invalidMaterial = executionMaterials.find(material =>
            !Number.isFinite(Number(material.usedQty)) || !Number.isFinite(Number(material.wasteQty)) || Number(material.usedQty) < 0 || Number(material.wasteQty) < 0
        );
        if (invalidMaterial) {
            toast({ title: 'راجع تسوية الخامات', description: `أدخل كميات صحيحة غير سالبة للخامة ${invalidMaterial.name}.`, variant: 'destructive' });
            return;
        }
        const stockShortage = executionMaterials.find(material => {
            const required = Math.max(Number(material.plannedQty) || 0, (Number(material.usedQty) || 0) + (Number(material.wasteQty) || 0));
            return calculateStockForItemInWarehouse(String(material.itemId), selectedOrder.SourceWarehouseId, allData) + 0.0001 < required;
        });
        if (stockShortage) {
            const required = Math.max(Number(stockShortage.plannedQty) || 0, (Number(stockShortage.usedQty) || 0) + (Number(stockShortage.wasteQty) || 0));
            const available = calculateStockForItemInWarehouse(String(stockShortage.itemId), selectedOrder.SourceWarehouseId, allData);
            toast({ title: 'لا يمكن صرف الخامات', description: `الرصيد الفعلي من ${stockShortage.name || 'الخامة'} لا يكفي للاستخدام والهدر المسجلين. المطلوب صرفه ${required} والمتاح ${available}.`, variant: 'destructive' });
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch('/api/manufacturing/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'complete',
                    orderId: selectedOrder.Id,
                    producedQty,
                    scrapQty,
                    wasteTreatment,
                    updateItemCost,
                    updateItemSalePrice,
                    materials: executionMaterials.map(({ itemId, usedQty, wasteQty }) => ({ itemId, usedQty: Number(usedQty) || 0, wasteQty: Number(wasteQty) || 0 })),
                    userId: user?.id,
                    userName: user?.name
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || 'تعذر اعتماد مستندات الإنتاج.');
            await retryDatabaseConnection();
            toast({
                title: 'اكتمل أمر التصنيع',
                description: `تم استلام ${producedQty} قطعة من التشغيلة. تكلفة الإنتاج الفعلية للوحدة: ${Number(data.costs?.finishedGoodsUnitCost || 0).toFixed(4)} ج.م. ${updateItemCost ? `تم تحديث سعر التكلفة في بطاقة الصنف إلى ${Number(data.costs?.finishedGoodsUnitCost || 0).toFixed(4)} ج.م/قطعة.` : 'لم تُحدّث تكلفة بطاقة الصنف.'} الهالك الطبيعي الموزع: ${Number(data.costs?.normalScrapCost || 0).toLocaleString('ar-EG')} ج.م، وغير الطبيعي المحمل على الخسائر: ${Number(data.costs?.abnormalScrapCost || 0).toLocaleString('ar-EG')} ج.م. هدر الخامات ${wasteTreatment === 'allocate_to_good' ? 'الموزع على القطع السليمة' : 'المحمل على المصروفات'}: ${Number(data.costs?.wastedMaterialCost || 0).toLocaleString('ar-EG')} ج.م. نصيب القطعة من التكاليف الموزعة: ${Number(data.tracking?.allocatedWasteCostPerUnit || 0).toFixed(4)} ج.م. ${exceedsScrapAllowance ? 'تنبيه: تجاوز الهالك السماحية وسُجلت الزيادة كهالك غير طبيعي.' : ''} ${exceedsTargetOutput ? 'تنبيه: إجمالي الإنتاج والهالك تجاوز مستهدف الأمر.' : ''} ${overPlanMaterials.length ? `تم تسجيل صرف إضافي موثق للخامات: ${overPlanMaterials.map(material => material.name).join('، ')}.` : ''} ${updateItemSalePrice ? `تم تحديث سعر البيع إلى ${Number(data.pricing?.salePrice || 0).toFixed(4)} ج.م.` : 'لم يُحدّث سعر بطاقة الصنف.'}`
            });

            setIsCompleteOpen(false);
            await fetchOrders();
        } catch (err: any) {
            toast({ title: 'خطأ في الاعتماد', description: err.message, variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    // Export Excel
    const handleExportExcel = () => {
        const rows = filteredOrders.map(o => ({
            'رقم الأمر': o.OrderNumber,
            'رقم التشغيلة': o.BatchNumber || `LOT-${o.OrderNumber}`,
            'التاريخ': new Date(o.OrderDate).toLocaleDateString('ar-EG'),
            'المنتج التام': o.FinishedItemName,
            'الكمية المستهدفة': o.TargetQuantity,
            'الكمية الفعلية': o.ProducedQuantity,
            'الحالة': o.Status === 'completed' ? 'مكتمل' : o.Status === 'in_progress' ? 'قيد التشغيل' : 'مسودة',
            'تكلفة الخامات': o.RawMaterialCost,
            'أجور العمالة': o.LaborCost,
            'مصاريف صناعية': o.OverheadCost,
            'إجمالي التكلفة': o.TotalCost,
            'تكلفة الوحدة': o.UnitCost,
            'سياسة الهدر': o.WasteTreatment === 'allocate_to_good' ? 'موزع على المنتج السليم' : 'خسائر تصنيع',
            'نسبة الهالك الطبيعي المسموح %': o.ExpectedScrapPercent || 0,
            'كمية الهالك الطبيعي': o.NormalScrapQuantity || 0,
            'تكلفة الهالك الطبيعي': o.NormalScrapCost || 0,
            'كمية الهالك غير الطبيعي': o.AbnormalScrapQuantity || 0,
            'تكلفة مواد الهدر': o.WastedMaterialCost || 0,
            'تكلفة الهالك النهائي': o.DamagedOutputCost || 0,
            'تكلفة الهدر الموزعة': o.AllocatedWasteCost || 0,
            'حصة القطعة من الهدر': o.AllocatedWasteCostPerUnit || 0,
            'هامش ربح التصنيع %': o.ProfitMarginPercent ?? 25,
            'سعر البيع المستهدف / الفعلي': o.SalePrice || o.EstimatedSalePrice || 0,
            'تم تحديث تكلفة بطاقة الصنف': o.ItemCostUpdated ? 'نعم' : 'لا',
            'تم تحديث سعر بطاقة الصنف': o.ItemSalePriceUpdated ? 'نعم' : 'لا',
            'أنشئ بواسطة': o.CreatedBy
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "أوامر التصنيع");
        XLSX.writeFile(wb, `Manufacturing_Orders_${Date.now()}.xlsx`);
    };

    const openBatchPrint = (order: ManufacturingOrder) => {
        setBatchPrintOrder(order);
        setBatchPrintFormat('label_3x1_5');
        setBatchPrintCopies(1);
        setIsBatchPrintOpen(true);
    };

    const handlePrintBatch = () => {
        if (!batchPrintOrder) return;
        const escapeEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' };
        const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>\"']/g, char => escapeEntities[char] || char);
        const batchNumber = String(batchPrintOrder.BatchNumber || `LOT-${batchPrintOrder.OrderNumber}`);
        const productName = String(batchPrintOrder.FinishedItemName || 'منتج تصنيع');
        const barcodeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        try {
            JsBarcode(barcodeSvg, batchNumber, { format: 'CODE128', width: 1.2, height: 48, displayValue: false, margin: 0 });
        } catch {
            toast({ title: 'تعذر إنشاء الباركود', description: 'راجع رقم التشغيلة قبل الطباعة.', variant: 'destructive' });
            return;
        }

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            toast({ title: 'تعذر فتح الطباعة', description: 'اسمح بفتح نافذة الطباعة لهذا الموقع ثم أعد المحاولة.', variant: 'destructive' });
            return;
        }

        const targetWarehouse = warehouses.find((warehouse: any) => String(warehouse.id || warehouse.Id) === String(batchPrintOrder.TargetWarehouseId));
        const sourceWarehouse = warehouses.find((warehouse: any) => String(warehouse.id || warehouse.Id) === String(batchPrintOrder.SourceWarehouseId));
        let plannedMaterials: any[] = [];
        try { plannedMaterials = JSON.parse(batchPrintOrder.BOMDetailsJson || '[]'); } catch { plannedMaterials = []; }
        const issueRecords = Array.isArray(allData?.stockOutRecords) ? allData.stockOutRecords : [];
        const actualIssueItems = issueRecords.flatMap((record: any) => {
            let docItems: any[] = [];
            try { docItems = typeof (record.itemsJson || record.ItemsJson) === 'string' ? JSON.parse(record.itemsJson || record.ItemsJson) : (record.itemsJson || record.ItemsJson || []); } catch { docItems = []; }
            return Array.isArray(docItems) ? docItems.filter((item: any) => String(item.manufacturingOrderId || item.ManufacturingOrderId || '') === String(batchPrintOrder.Id)) : [];
        });
        const materialsForPrint = actualIssueItems.length ? actualIssueItems : plannedMaterials.map((material: any) => ({
            name: material.name,
            plannedQty: material.requiredTotalQty || Number(material.unitQty || 0) * Number(batchPrintOrder.TargetQuantity || 0),
            qty: material.requiredTotalQty || Number(material.unitQty || 0) * Number(batchPrintOrder.TargetQuantity || 0),
            usedQty: '—', wasteQty: '—', returnedQty: '—', extraIssuedQty: 0, unit: material.unit
        }));
        const materialRows = materialsForPrint.map((material: any) => `
            <tr><td>${escapeHtml(material.name || material.itemName || material.ItemName || material.itemId || material.ItemId)}</td>
            <td>${escapeHtml(material.plannedQty ?? material.qty ?? material.Qty ?? '—')} ${escapeHtml(material.unit || '')}</td>
            <td>${escapeHtml(material.usedQty ?? '—')}</td><td>${escapeHtml(material.wasteQty ?? '—')}</td>
            <td>${escapeHtml(material.returnedQty ?? '—')}</td><td>${escapeHtml(material.extraIssuedQty ?? 0)}</td></tr>`).join('');
        const copies = Math.max(1, Math.min(500, Math.floor(Number(batchPrintCopies) || 1)));
        const dateLabel = batchPrintOrder.OrderDate ? new Date(batchPrintOrder.OrderDate).toLocaleDateString('ar-EG') : '—';
        const barcodeText = `<div class="batch-code">${escapeHtml(batchNumber)}</div>`;

        let printBody = '';
        let printStyles = '';
        if (batchPrintFormat === 'a4') {
            printStyles = `@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;direction:rtl;margin:0;font-size:12px}.report{page-break-after:always}.report:last-child{page-break-after:auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 8px;border-bottom:1px solid #999;padding-bottom:4px}.sub{color:#555;margin-bottom:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px}.field{border:1px solid #bbb;padding:8px;border-radius:4px}.field b{display:block;color:#555;font-size:10px;margin-bottom:3px}.batch{font-family:monospace;font-size:18px;font-weight:bold;direction:ltr;text-align:right}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #888;padding:6px;text-align:right}th{background:#eee}.costs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.warning{color:#a33;font-weight:bold}`;
            const targetQty = Number(batchPrintOrder.TargetQuantity || 0);
            const scrapAllowance = targetQty * Number(batchPrintOrder.ExpectedScrapPercent || 0) / 100;
            const abnormalScrap = Number(batchPrintOrder.AbnormalScrapQuantity || 0);
            printBody = Array.from({ length: copies }, () => `
                <section class="report"><h1>تقرير تشغيلة تصنيع</h1><div class="sub">مستند تتبع التشغيلة والإنتاج والتكلفة</div>
                    <div class="grid">
                        <div class="field"><b>رقم التشغيلة</b><span class="batch">${escapeHtml(batchNumber)}</span></div>
                        <div class="field"><b>رقم أمر التصنيع</b>${escapeHtml(batchPrintOrder.OrderNumber)}</div>
                        <div class="field"><b>اسم الصنف</b>${escapeHtml(productName)}</div>
                        <div class="field"><b>تاريخ الأمر</b>${escapeHtml(dateLabel)}</div>
                        <div class="field"><b>مخزن الخامات</b>${escapeHtml(sourceWarehouse?.name || sourceWarehouse?.Name || batchPrintOrder.SourceWarehouseId)}</div>
                        <div class="field"><b>مخزن المنتج التام</b>${escapeHtml(targetWarehouse?.name || targetWarehouse?.Name || batchPrintOrder.TargetWarehouseId)}</div>
                        <div class="field"><b>الكمية المستهدفة / المنتجة</b>${escapeHtml(targetQty)} / ${escapeHtml(batchPrintOrder.ProducedQuantity || 0)}</div>
                        <div class="field"><b>الحالة</b>${escapeHtml(batchPrintOrder.Status === 'completed' ? 'مكتمل ومعتمد' : batchPrintOrder.Status === 'in_progress' ? 'قيد التشغيل' : batchPrintOrder.Status === 'cancelled' ? 'ملغي' : 'مسودة')}</div>
                        <div class="field"><b>كمية الهالك الفعلية</b>${escapeHtml(Number(batchPrintOrder.NormalScrapQuantity || 0) + abnormalScrap)} — السماحية ${escapeHtml(scrapAllowance)} (${escapeHtml(batchPrintOrder.ExpectedScrapPercent || 0)}%)</div>
                        <div class="field ${abnormalScrap > 0 ? 'warning' : ''}"><b>الهالك غير الطبيعي</b>${escapeHtml(abnormalScrap)} ${abnormalScrap > 0 ? ' — تجاوز حد السماحية' : ''}</div>
                    </div>
                    <h2>الخامات والتسوية</h2><table><thead><tr><th>الخامة</th><th>المخطط / المصروف</th><th>المستخدم</th><th>هدر الخامة</th><th>مرتجع</th><th>صرف إضافي</th></tr></thead><tbody>${materialRows || '<tr><td colspan="6">لا توجد تفاصيل خامات مسجلة</td></tr>'}</tbody></table>
                    <h2>التكلفة والتسعير</h2><div class="costs">
                        <div class="field"><b>تكلفة الخامات المخططة</b>${escapeHtml(Number(batchPrintOrder.RawMaterialCost || 0).toFixed(4))} ج.م</div>
                        <div class="field"><b>العمالة</b>${escapeHtml(Number(batchPrintOrder.LaborCost || 0).toFixed(4))} ج.م</div>
                        <div class="field"><b>المصاريف الصناعية</b>${escapeHtml(Number(batchPrintOrder.OverheadCost || 0).toFixed(4))} ج.م</div>
                        <div class="field"><b>إجمالي تكلفة الأمر</b>${escapeHtml(Number(batchPrintOrder.TotalCost || 0).toFixed(4))} ج.م</div>
                        <div class="field"><b>تكلفة الوحدة الفعلية</b>${escapeHtml(Number(batchPrintOrder.UnitCost || 0).toFixed(4))} ج.م</div>
                        <div class="field"><b>تكلفة هدر الخامات</b>${escapeHtml(Number(batchPrintOrder.WastedMaterialCost || 0).toFixed(4))} ج.م</div>
                        <div class="field"><b>تكلفة الهالك النهائي</b>${escapeHtml(Number(batchPrintOrder.DamagedOutputCost || 0).toFixed(4))} ج.م</div>
                        <div class="field"><b>التكلفة الموزعة على المنتج السليم</b>${escapeHtml(Number(batchPrintOrder.AllocatedWasteCost || 0).toFixed(4))} ج.م</div>
                        <div class="field"><b>هامش الربح المستهدف</b>${escapeHtml(Number(batchPrintOrder.ProfitMarginPercent ?? 25))}%</div>
                        <div class="field"><b>سعر البيع المقترح / المعتمد</b>${escapeHtml(Number(batchPrintOrder.SalePrice || batchPrintOrder.EstimatedSalePrice || 0).toFixed(4))} ج.م</div>
                    </div><h2>ملاحظات</h2><div class="field">${escapeHtml(batchPrintOrder.Notes || 'لا توجد ملاحظات.')}</div>
                </section>`).join('');
        } else {
            const labelWidth = batchPrintFormat === 'label_4x1' ? '4cm' : '3cm';
            const labelHeight = batchPrintFormat === 'label_4x1' ? '1cm' : '1.5cm';
            printStyles = `@page{size:${labelWidth} ${labelHeight};margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:${labelWidth};height:${labelHeight};font-family:Arial,sans-serif;color:#000}.label{width:${labelWidth};height:${labelHeight};overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1mm;page-break-after:always;break-after:page}.label:last-child{page-break-after:auto;break-after:auto}.name{font-weight:bold;text-align:center;font-size:${batchPrintFormat === 'label_4x1' ? '7pt' : '8pt'};line-height:1.1;max-height:.35cm;overflow:hidden;width:100%;white-space:nowrap;text-overflow:ellipsis}.barcode{display:block;width:96%;height:${batchPrintFormat === 'label_4x1' ? '.45cm' : '.68cm'};max-height:55%;}.batch-code{font-family:monospace;font-size:${batchPrintFormat === 'label_4x1' ? '6pt' : '7pt'};line-height:1;direction:ltr}`;
            printBody = Array.from({ length: copies }, () => `<div class="label"><div class="name">${escapeHtml(productName)}</div>${barcodeSvg.outerHTML.replace('<svg ', '<svg class="barcode" ')}${barcodeText}</div>`).join('');
        }

        printWindow.document.open();
        printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تشغيلة ${escapeHtml(batchNumber)}</title><style>${printStyles}</style></head><body>${printBody}</body></html>`);
        printWindow.document.close();
        setTimeout(() => { printWindow.focus(); printWindow.print(); }, 350);
    };

    return (
        <div className="w-full max-w-none mx-0 px-3 sm:px-4 lg:px-6 py-4 md:py-6 space-y-6">
            <PageHeader 
                title="إدارة التصنيع وتكاليف أوامر التشغيل (BOM & Work Orders)" 
                description="إدارة خطة الإنتاج، سحب الخامات، استلام المنتج التام، واحتساب تكاليف التشغيل والترحيل الآلي للقيود"
            >
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportExcel}>
                        <FileSpreadsheet className="h-4 w-4 ml-2" />
                        تصدير إكسيل
                    </Button>
                    <Button size="sm" onClick={() => setIsCreateOpen(true)} className="bg-primary text-primary-foreground">
                        <Plus className="h-4 w-4 ml-2" />
                        أمر تشغيل جديد
                    </Button>
                </div>
            </PageHeader>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي أوامر التشغيل</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpis.total}</div>
                        <p className="text-xs text-muted-foreground mt-1">مسودة: {kpis.draft}</p>
                    </CardContent>
                </Card>

                <Card className="border-blue-500/30 bg-blue-50/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-foreground">قيد التشغيل والتنفيذ</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{kpis.inProgress}</div>
                        <p className="text-xs text-muted-foreground mt-1">خطوط الإنتاج نشطة حالياً</p>
                    </CardContent>
                </Card>

                <Card className="border-green-500/30 bg-green-50/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-600">أوامر مكتملة ومعتمدة</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{kpis.completed}</div>
                        <p className="text-xs text-muted-foreground mt-1">تم تسليمها للمخازن</p>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-foreground">إجمالي تكاليف الإنتاج المنفذة</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{kpis.totalCompletedCost.toLocaleString('ar-EG')} ج.م</div>
                        <p className="text-xs text-muted-foreground mt-1">خامات + أجور + مصاريف</p>
                    </CardContent>
                </Card>
            </div>

            {/* Controls & Filter */}
            <Card>
                <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <Input 
                            placeholder="بحث برقم الأمر أو اسم الصنف..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="max-w-xs"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button 
                            size="sm" 
                            variant={statusFilter === 'all' ? 'default' : 'outline'}
                            onClick={() => setStatusFilter('all')}
                        >
                            الكل ({orders.length})
                        </Button>
                        <Button 
                            size="sm" 
                            variant={statusFilter === 'draft' ? 'default' : 'outline'}
                            onClick={() => setStatusFilter('draft')}
                        >
                            مسودة ({kpis.draft})
                        </Button>
                        <Button 
                            size="sm" 
                            variant={statusFilter === 'in_progress' ? 'default' : 'outline'}
                            onClick={() => setStatusFilter('in_progress')}
                            className="text-foreground"
                        >
                            قيد التشغيل ({kpis.inProgress})
                        </Button>
                        <Button 
                            size="sm" 
                            variant={statusFilter === 'completed' ? 'default' : 'outline'}
                            onClick={() => setStatusFilter('completed')}
                            className="text-green-600"
                        >
                            مكتمل ({kpis.completed})
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Orders Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Layers className="h-5 w-5 text-primary" />
                        سجل أوامر التشغيل ومراحل الإنتاج
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-right">رقم الأمر</TableHead>
                                    <TableHead className="text-right">رقم التشغيلة</TableHead>
                                    <TableHead className="text-right">التاريخ</TableHead>
                                    <TableHead className="text-right">المنتج التام</TableHead>
                                    <TableHead className="text-right">الكمية المستهدفة</TableHead>
                                    <TableHead className="text-right">الكمية المنتجة</TableHead>
                                    <TableHead className="text-right">تكلفة الخامات</TableHead>
                                    <TableHead className="text-right">إجمالي التكلفة</TableHead>
                                    <TableHead className="text-right">تكلفة الوحدة</TableHead>
                                    <TableHead className="text-right">هامش التصنيع / سعر البيع</TableHead>
                                    <TableHead className="text-right">الحالة</TableHead>
                                    <TableHead className="text-center">الإجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                                            جاري تحميل أوامر التشغيل والتصنيع...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOrders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                                            لا توجد أوامر تشغيل مطابقة للبحث المحدد.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOrders.map(order => (
                                        <TableRow key={order.Id}>
                                            <TableCell className="font-bold text-primary">{order.OrderNumber}</TableCell>
                                            <TableCell className="font-mono">{order.BatchNumber || `LOT-${order.OrderNumber}`}</TableCell>
                                            <TableCell>{new Date(order.OrderDate).toLocaleDateString('ar-EG')}</TableCell>
                                            <TableCell className="font-semibold">{order.FinishedItemName}</TableCell>
                                            <TableCell>{order.TargetQuantity}{Number(order.ExpectedScrapPercent || 0) > 0 && <div className="text-[10px] text-muted-foreground">هالك طبيعي مسموح: {Number(order.ExpectedScrapPercent).toFixed(2)}%</div>}</TableCell>
                                            <TableCell>{order.ProducedQuantity || 0}</TableCell>
                                            <TableCell>{Number(order.RawMaterialCost || 0).toLocaleString('ar-EG')} ج.م</TableCell>
                                            <TableCell className="font-bold">{Number(order.TotalCost || 0).toLocaleString('ar-EG')} ج.م</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                <div>{Number(order.UnitCost || 0).toFixed(4)} ج.م</div>
                                                {order.Status === 'completed' && Number(order.AllocatedWasteCostPerUnit || 0) > 0 && <div className="text-[10px] text-foreground">هدر موزع/قطعة: {Number(order.AllocatedWasteCostPerUnit).toFixed(4)} ج.م</div>}
                                            </TableCell>
                                            <TableCell>{Number(order.ProfitMarginPercent ?? 25)}% / {Number(order.SalePrice || order.EstimatedSalePrice || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م</TableCell>
                                            <TableCell>
                                                {order.Status === 'draft' && <Badge variant="secondary">مسودة</Badge>}
                                                {order.Status === 'in_progress' && <Badge className="bg-blue-600">قيد التشغيل</Badge>}
                                                {order.Status === 'completed' && <Badge className="bg-green-600">مكتمل ومعتمد</Badge>}
                                                {order.Status === 'cancelled' && <Badge variant="destructive">ملغي</Badge>}
                                                {order.Status === 'completed' && (Number(order.AbnormalScrapQuantity || 0) > 0 || ordersWithExtraMaterialIssue.has(String(order.Id))) && (
                                                    <Badge variant="destructive" className="mt-1">تجاوز حد الهالك أو الهدر</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        onClick={() => { setSelectedOrder(order); setIsViewOpen(true); }}
                                                        title="عرض التفاصيل ومعادلة التصنيع"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openBatchPrint(order)}
                                                        title="طباعة باركود التشغيلة أو تقرير A4"
                                                    >
                                                        <Printer className="h-4 w-4" />
                                                    </Button>

                                                    {order.Status === 'completed' && (
                                                        <Button variant="outline" size="sm" disabled={processingOrderActionId === order.Id}
                                                            onClick={() => handleManufacturingOrderAction(order, 'recalculate_accounting')} title="إعادة إنشاء قيود التشغيلة من مستنداتها">
                                                            <RotateCcw className="h-3.5 w-3.5 ml-1" />
                                                            احتساب القيد
                                                        </Button>
                                                    )}

                                                    {order.Status === 'draft' && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="text-foreground border-blue-500/30 hover:bg-blue-50"
                                                            onClick={() => handleStartOrder(order)}
                                                            title="بدء تشغيل الأمر"
                                                        >
                                                            <Play className="h-3.5 w-3.5 ml-1" />
                                                            تشغيل
                                                        </Button>
                                                    )}

                                                    {order.Status === 'in_progress' && (
                                                        <Button 
                                                            size="sm" 
                                                            className="bg-green-600 hover:bg-green-700 text-white"
                                                            onClick={() => {
                                                                let bom: any[] = [];
                                                                try { bom = order.BOMDetailsJson ? JSON.parse(order.BOMDetailsJson) : []; } catch { bom = []; }
                                                                setSelectedOrder(order);
                                                                setProducedQty(order.TargetQuantity);
                                                                setScrapQty(0);
                                                                setWasteTreatment('allocate_to_good');
                                                                setUpdateItemCost(true);
                                                                setUpdateItemSalePrice(true);
                                                                setExecutionMaterials(bom.map((component: any) => {
                                                                    const rawItem = allItems.find((item: any) => String(item.id) === String(component.itemId));
                                                                    const savedCost = Number(component.costPerUnit) || 0;
                                                                    const currentCost = Number(rawItem?.cost) || Number(rawItem?.costPrice) || Number(rawItem?.purchasePrice) || 0;
                                                                    const costPerUnit = currentCost || savedCost;
                                                                    return ({
                                                                    itemId: component.itemId,
                                                                    name: component.name || rawItem?.name || component.itemId,
                                                                    unit: component.unit || '',
                                                                    plannedQty: Number(component.requiredTotalQty) || Number(component.unitQty || 0) * Number(order.TargetQuantity || 0),
                                                                    usedQty: Number(component.requiredTotalQty) || Number(component.unitQty || 0) * Number(order.TargetQuantity || 0),
                                                                    wasteQty: 0,
                                                                    costPerUnit,
                                                                });}));
                                                                setIsCompleteOpen(true);
                                                            }}
                                                            title="إنهاء واعتماد أمر الإنتاج"
                                                        >
                                                            <PackageCheck className="h-3.5 w-3.5 ml-1" />
                                                            إنهاء واعتماد
                                                        </Button>
                                                    )}

                                                    {order.Status !== 'cancelled' && (
                                                        <Button variant="outline" size="sm" disabled={processingOrderActionId === order.Id}
                                                            className="text-destructive border-destructive/40 hover:bg-destructive/10"
                                                            onClick={() => handleManufacturingOrderAction(order, 'cancel')} title="إلغاء الأمر أو عكس التشغيلة">
                                                            <Ban className="h-3.5 w-3.5 ml-1" />
                                                            إلغاء
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* CREATE WORK ORDER MODAL */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-primary">
                            <Factory className="h-5 w-5" />
                            إنشاء أمر تشغيل وتصنيع جديد (Work Order)
                        </DialogTitle>
                        <DialogDescription>
                            حدد المنتج المصنّع، الكمية المطلوبة، ومخازن السحب والإيداع مع فحص توفر الخامات
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Main Settings */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>المنتج المطلوب تصنيعه *</Label>
                                <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="اختر صنف مصنّع من القائمة..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {manufacturedItems.map((item: any) => (
                                            <SelectItem key={item.id} value={item.id}>
                                                {item.name} {item.barcode ? `(${item.barcode})` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>الكمية المستهدفة للإنتاج *</Label>
                                <Input 
                                    type="number" 
                                    min="1" 
                                    step="1"
                                    value={targetQuantity} 
                                    onFocus={e => e.currentTarget.select()}
                                    onChange={(e) => setTargetQuantity(Math.max(1, Number(e.target.value)))} 
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>مخزن سحب المواد الخام (المصدر)</Label>
                                <Select value={sourceWarehouseId} onValueChange={setSourceWarehouseId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="مخزن الخامات..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {warehouses?.map((wh: any) => (
                                            <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>مخزن استقبال المنتج التام (الوجهة)</Label>
                                <Select value={targetWarehouseId} onValueChange={setTargetWarehouseId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="مخزن المنتج التام..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {warehouses?.map((wh: any) => (
                                            <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* BOM Materials Checker */}
                        {selectedItem && (
                            <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                                <div className="flex items-center justify-between">
                                    <Label className="font-bold flex items-center gap-1.5 text-sm">
                                        <Calculator className="h-4 w-4 text-primary" />
                                        احتياجات المواد الخام حسب معادلة التصنيع (BOM Breakdown)
                                    </Label>
                                    {hasMissingStock && (
                                        <span className="text-xs text-destructive font-semibold flex items-center gap-1">
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            تنبيه: بعض الخامات رصيدها غير كافٍ في المخزن المختار
                                        </span>
                                    )}
                                </div>

                                <Table className="text-xs">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-right">الخامة</TableHead>
                                            <TableHead className="text-right">للوحدة</TableHead>
                                            <TableHead className="text-right">المطلوب للدفعة</TableHead>
                                            <TableHead className="text-right">الرصيد المتاح</TableHead>
                                            <TableHead className="text-right">التكلفة التقديرية</TableHead>
                                            <TableHead className="text-center">الحالة</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {calculatedBOM.map((c: any) => (
                                            <TableRow key={c.itemId} className={!c.isAvailable ? 'bg-destructive/10' : ''}>
                                                <TableCell className="font-semibold">{c.name}</TableCell>
                                                <TableCell>{c.unitQty} {c.unit}</TableCell>
                                                <TableCell className="font-bold">{c.requiredTotalQty} {c.unit}</TableCell>
                                                <TableCell>{c.availableStock} {c.unit}</TableCell>
                                                <TableCell>{c.totalCost.toLocaleString('ar-EG')} ج.م</TableCell>
                                                <TableCell className="text-center">
                                                    {c.isAvailable ? (
                                                        <Badge className="bg-green-600 text-[10px]">متوفر</Badge>
                                                    ) : (
                                                        <Badge variant="destructive" className="text-[10px]">عجز بالمخزن</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}

                        {/* Additional Costs: Labor & Overhead */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">أجور وعمالة الإنتاج المباشرة (ج.م)</Label>
                                <Input 
                                    type="number" 
                                    min="0" 
                                    step="0.5"
                                    value={laborCost} 
                                    onFocus={e => e.currentTarget.select()}
                                    onChange={(e) => setLaborCost(Number(e.target.value))} 
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">تكاليف صناعية غير مباشرة / تشغيل (ج.م)</Label>
                                <Input 
                                    type="number" 
                                    min="0" 
                                    step="0.5"
                                    value={overheadCost} 
                                    onFocus={e => e.currentTarget.select()}
                                    onChange={(e) => setOverheadCost(Number(e.target.value))} 
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">هامش ربح التصنيع المستهدف (%)</Label>
                                <Input type="number" min="0" max="99.99" step="0.1" value={profitMarginPercent} onFocus={e => e.currentTarget.select()} onChange={e => setProfitMarginPercent(Number(e.target.value))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">نسبة الهالك الطبيعي المسموح (%)</Label>
                                <Input type="number" min="0" max="99.99" step="0.1" value={expectedScrapPercent} onFocus={e => e.currentTarget.select()} onChange={e => setExpectedScrapPercent(Number(e.target.value))} />
                                <p className="text-[10px] text-muted-foreground">حتى هذه النسبة تُحمّل على تكلفة الإنتاج السليم؛ والزيادة تُسجل هالكًا غير طبيعي على المصروفات.</p>
                            </div>
                            <div className="rounded-md bg-primary/5 p-3 text-sm">
                                <div className="flex justify-between"><span>تكلفة الوحدة التقديرية</span><strong>{estimatedUnitCost.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م</strong></div>
                                <div className="mt-1 flex justify-between text-primary"><span>سعر البيع المقترح بهامش {profitMarginPercent}%</span><strong>{estimatedSalePrice.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م</strong></div>
                                <p className="mt-1 text-[10px] text-muted-foreground">السعر يُعاد احتسابه بالتكلفة الفعلية عند اعتماد التشغيلة ويُحدّث سعر الصنف.</p>
                            </div>
                        </div>

                        {/* Total Cost Summary */}
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between">
                            <div>
                                <span className="text-xs text-muted-foreground block">إجمالي تكلفة أمر التشغيل</span>
                                <span className="text-lg font-bold text-primary">{totalEstimatedCost.toLocaleString('ar-EG')} ج.م</span>
                            </div>
                            <div className="text-left">
                                <span className="text-xs text-muted-foreground block">تكلفة الوحدة الواحدة التقديرية</span>
                                <span className="text-lg font-bold text-foreground">{estimatedUnitCost.toFixed(2)} ج.م</span>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs">ملاحظات وتعليمات التشغيل</Label>
                            <Input 
                                placeholder="أي ملاحظات خاصة بخط الإنتاج أو الفنيين..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
                        <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>إلغاء</Button>
                        <div className="flex gap-2">
                            <Button 
                                variant="outline" 
                                onClick={() => handleCreateOrder(false)} 
                                disabled={submitting || !selectedItemId}
                            >
                                حفظ كمسودة
                            </Button>
                            <Button 
                                onClick={() => handleCreateOrder(true)} 
                                disabled={submitting || !selectedItemId}
                                className="bg-primary text-primary-foreground"
                            >
                                بدء التشغيل الفوري
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* COMPLETION MODAL */}
            <Dialog open={isCompleteOpen} onOpenChange={setIsCompleteOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="h-5 w-5" />
                            إنهاء واعتماد أمر الإنتاج رقم {selectedOrder?.OrderNumber}
                        </DialogTitle>
                        <DialogDescription>
                            راجع الإنتاج الفعلي، ثم سوِّ الخامات المستخدمة والهدر والمتبقي. سيُحفظ الصرف والمرتجع واستلام المنتج والقيد كوحدة اعتماد واحدة.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>كمية المنتج السليم المستلمة في مخزن المنتج التام</Label>
                            <Input 
                                type="number" 
                                min="0.0001"
                                step="0.0001"
                                value={producedQty} 
                                onFocus={e => e.currentTarget.select()}
                                onChange={(e) => setProducedQty(Number(e.target.value))} 
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>كمية المنتج التالف أو الهالك من التشغيل</Label>
                            <Input type="number" min="0" step="0.0001" value={scrapQty} onFocus={e => e.currentTarget.select()} onChange={e => setScrapQty(Number(e.target.value))} className={exceedsScrapAllowance ? 'border-destructive bg-destructive/5 focus-visible:ring-destructive' : ''} />
                            <p className="text-xs text-muted-foreground">لا تدخل الكمية التالفة في رصيد المنتج التام. تُسجل الزيادة عن السماحية كهالك غير طبيعي.</p>
                            {exceedsScrapAllowance && (
                                <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <div>تجاوز الهالك الحد المحدد: المسموح {normalScrapAllowanceQty.toLocaleString('ar-EG')}، الفعلي {Number(scrapQty).toLocaleString('ar-EG')}، والزيادة {abnormalScrapQty.toLocaleString('ar-EG')}. سيُسمح بالإكمال وتُسجل الزيادة كهالك غير طبيعي.</div>
                                </div>
                            )}
                            {exceedsTargetOutput && (
                                <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground dark:text-foreground">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <div>إجمالي المنتج السليم والهالك ({actualOutputQty.toLocaleString('ar-EG')}) يتجاوز مستهدف الأمر ({Number(selectedOrder?.TargetQuantity || 0).toLocaleString('ar-EG')}). سيُعتمد مع تسجيل التنبيه.</div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>معالجة هدر الخامات</Label>
                            <Select value={wasteTreatment} onValueChange={(value: 'expense' | 'allocate_to_good') => setWasteTreatment(value)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="expense">تحميل تكلفة هدر الخامات على خسائر التصنيع</SelectItem>
                                    <SelectItem value="allocate_to_good">توزيع تكلفة هدر الخامات على المنتج السليم</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">الهالك الطبيعي المسموح: {normalScrapAllowanceQty.toLocaleString('ar-EG')} وحدة، الطبيعي المحسوب: {normalScrapQty.toLocaleString('ar-EG')}، الزائد غير الطبيعي: {abnormalScrapQty.toLocaleString('ar-EG')}. رقم التشغيلة: <span className="font-mono font-semibold">{selectedOrder?.BatchNumber || `LOT-${selectedOrder?.OrderNumber || ''}`}</span></p>
                        </div>

                        <div className="space-y-2">
                            <Label className="font-semibold">تسوية الخامات بالمستند</Label>
                            <p className="text-xs text-muted-foreground">المخطط يوزع بين المستخدم والهدر والمرتجع. إذا زاد الاستخدام أو الهدر، يسجل النظام صرفاً إضافياً موثقاً بشرط كفاية رصيد المخزن.</p>
                            {overPlanMaterials.length > 0 && (
                                <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-foreground dark:text-foreground">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <div>تجاوزت الكمية المستخدمة والهدر المخطط للخامات التالية. سيُسجل الفرق كصرف إضافي ويُخصم من المخزون بعد التحقق من الرصيد: {overPlanMaterials.map(material => `${material.name} (+${Math.max(0, Number(material.usedQty || 0) + Number(material.wasteQty || 0) - Number(material.plannedQty || 0)).toLocaleString('ar-EG')} ${material.unit || ''})`).join('، ')}.</div>
                                </div>
                            )}
                            <div className="overflow-x-auto rounded-md border">
                                <Table>
                                    <TableHeader><TableRow>
                                                <TableHead>الخامة</TableHead><TableHead>المخطط</TableHead><TableHead>المستخدم</TableHead><TableHead>هدر خامات</TableHead><TableHead>صرف إضافي</TableHead><TableHead>مرتجع</TableHead><TableHead>تكلفة الوحدة</TableHead><TableHead>تكلفة المستخدم والهدر</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>
                                        {executionMaterials.map((material, index) => {
                                            const returnedQty = Math.max(0, Number(material.plannedQty) - (Number(material.usedQty) || 0) - (Number(material.wasteQty) || 0));
                                            const extraIssueQty = Math.max(0, (Number(material.usedQty) || 0) + (Number(material.wasteQty) || 0) - Number(material.plannedQty || 0));
                                            return <TableRow key={material.itemId} className={extraIssueQty > 0 ? 'bg-amber-500/10' : undefined}>
                                                <TableCell className="font-medium">{material.name}</TableCell>
                                                <TableCell>{Number(material.plannedQty).toLocaleString('ar-EG')} {material.unit}</TableCell>
                                                <TableCell><Input className="w-28" type="number" min="0" step="0.0001" value={material.usedQty} onFocus={e => e.currentTarget.select()} onChange={e => setExecutionMaterials(current => current.map((row, i) => i === index ? { ...row, usedQty: Number(e.target.value) } : row))} /></TableCell>
                                                <TableCell><Input className={`w-28 ${extraIssueQty > 0 ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : ''}`} type="number" min="0" step="0.0001" value={material.wasteQty} onFocus={e => e.currentTarget.select()} onChange={e => setExecutionMaterials(current => current.map((row, i) => i === index ? { ...row, wasteQty: Number(e.target.value) } : row))} /></TableCell>
                                                <TableCell className={extraIssueQty > 0 ? 'font-bold text-foreground dark:text-foreground' : 'text-muted-foreground'}>{extraIssueQty.toLocaleString('ar-EG')} {material.unit}</TableCell>
                                                <TableCell className="font-semibold">{returnedQty.toLocaleString('ar-EG')} {material.unit}</TableCell>
                                                <TableCell>{Number(material.costPerUnit).toLocaleString('ar-EG')} ج.م</TableCell>
                                                <TableCell className="font-semibold">{(((Number(material.usedQty) || 0) + (Number(material.wasteQty) || 0)) * (Number(material.costPerUnit) || 0)).toLocaleString('ar-EG')} ج.م</TableCell>
                                            </TableRow>;
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <div className="p-3 bg-muted rounded-md text-xs space-y-1.5">
                            <div className="flex justify-between">
                                <span>المنتج التام:</span>
                                <span className="font-bold">{selectedOrder?.FinishedItemName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>تكلفة الخامات المستخدمة فعليًا:</span>
                                <span>{actualConsumedCost.toLocaleString('ar-EG')} ج.م</span>
                            </div>
                            <div className="flex justify-between">
                                <span>تكلفة العمالة والمصاريف:</span>
                                <span>{(Number(selectedOrder?.LaborCost || 0) + Number(selectedOrder?.OverheadCost || 0)).toLocaleString('ar-EG')} ج.م</span>
                            </div>
                            <div className="flex justify-between">
                                <span>تكلفة القطع السليمة قبل الهدر الطبيعي:</span>
                                <span>{baseFinishedGoodsCost.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م</span>
                            </div>
                            <div className="flex justify-between text-foreground">
                                <span>تكلفة الهالك الطبيعي المحملة على التشغيلة:</span>
                                <span>{normalScrapCost.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م</span>
                            </div>
                            <div className="flex justify-between text-destructive"><span>تكلفة الهالك غير الطبيعي المحملة على المصروفات:</span><span>{abnormalScrapCost.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م</span></div>
                            <div className={`flex justify-between ${wasteTreatment === 'expense' ? 'text-destructive' : 'text-foreground'}`}>
                                <span>{wasteTreatment === 'allocate_to_good' ? 'هدر الخامات الموزع على التشغيلة:' : 'هدر الخامات المحمل على المصروفات:'}</span>
                                <span>{actualMaterialWasteCost.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م</span>
                            </div>
                            <div className="flex justify-between font-semibold text-foreground">
                                <span>نصيب القطعة السليمة من الهالك الطبيعي{wasteTreatment === 'allocate_to_good' ? ' وهدر الخامات' : ''} ({producedQty} قطعة):</span>
                                <span>{allocatedWasteCostPerUnit.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م/قطعة</span>
                            </div>
                            <div className="flex justify-between font-semibold">
                                <span>إجمالي تكلفة المنتج السليم المستلم:</span>
                                <span>{actualFinishedGoodsCost.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م</span>
                            </div>
                            <div className="flex justify-between border-t pt-1 font-bold">
                                <span>تكلفة المنتج السليم للوحدة:</span>
                                <span className="text-primary">{actualGoodUnitCost.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م</span>
                            </div>
                            <div className="flex justify-between font-bold text-emerald-700">
                                <span>سعر البيع المقترح لتحقيق هامش {actualTargetMargin}%:</span>
                                <span>{actualSalePrice.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م</span>
                            </div>
                        </div>

                        <div className="rounded-md border p-3 space-y-3">
                            <p className="text-sm font-semibold">تحديث بطاقة الصنف بعد اعتماد التشغيلة</p>
                            <label htmlFor="update-manufactured-cost" className="flex items-center gap-2 cursor-pointer text-sm">
                                <Checkbox id="update-manufactured-cost" checked={updateItemCost} onCheckedChange={checked => setUpdateItemCost(checked === true)} />
                                <span>تحديث تكلفة الصنف إلى التكلفة الفعلية: {actualGoodUnitCost.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م/قطعة</span>
                            </label>
                            <label htmlFor="update-manufactured-price" className="flex items-center gap-2 cursor-pointer text-sm">
                                <Checkbox id="update-manufactured-price" checked={updateItemSalePrice} onCheckedChange={checked => setUpdateItemSalePrice(checked === true)} />
                                <span>تحديث سعر البيع إلى السعر المقترح: {actualSalePrice.toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م</span>
                            </label>
                            <p className="text-xs text-muted-foreground">ستظل التكلفة والسعر المحسوبان محفوظين في مستند التشغيلة حتى عند إلغاء التحديث في بطاقة الصنف.</p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsCompleteOpen(false)}>إلغاء</Button>
                        <Button 
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={handleExecuteCompletion}
                            disabled={submitting}
                        >
                            تأكيد الانتهاء والترحيل
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* VIEW ORDER DETAILS MODAL */}
            <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Layers className="h-5 w-5 text-primary" />
                            تفاصيل أمر التشغيل {selectedOrder?.OrderNumber}
                        </DialogTitle>
                    </DialogHeader>

                    {selectedOrder && (
                        <div className="space-y-4 text-sm">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-muted/40 rounded-lg">
                                <div>
                                    <span className="text-xs text-muted-foreground block">الصنف المصنّع</span>
                                    <span className="font-bold">{selectedOrder.FinishedItemName}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground block">رقم التشغيلة</span>
                                    <span className="font-mono font-bold">{selectedOrder.BatchNumber || `LOT-${selectedOrder.OrderNumber}`}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground block">الكمية المستهدفة</span>
                                    <span className="font-bold">{selectedOrder.TargetQuantity}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground block">الكمية المنتجة</span>
                                    <span className="font-bold">{selectedOrder.ProducedQuantity || 0}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground block">تكلفة الخامات</span>
                                    <span>{Number(selectedOrder.RawMaterialCost || 0).toLocaleString('ar-EG')} ج.م</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground block">إجمالي التكلفة</span>
                                    <span className="font-bold text-primary">{Number(selectedOrder.TotalCost || 0).toLocaleString('ar-EG')} ج.م</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground block">تكلفة الوحدة</span>
                                    <span className="font-bold">{Number(selectedOrder.UnitCost || 0).toFixed(2)} ج.م</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground block">هامش ربح التصنيع</span>
                                    <span>{Number(selectedOrder.ProfitMarginPercent ?? 25)}%</span>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground block">سعر البيع المستهدف / الفعلي</span>
                                    <span className="font-bold text-emerald-700">{Number(selectedOrder.SalePrice || selectedOrder.EstimatedSalePrice || 0).toLocaleString('ar-EG', { maximumFractionDigits: 4 })} ج.م</span>
                                </div>
                            </div>

                            {selectedOrder.Status === 'completed' && (
                                <div className="rounded-lg border p-3 space-y-2">
                                    <h3 className="font-semibold">تتبع التكلفة والهالك والتحديثات — التشغيلة {selectedOrder.BatchNumber || `LOT-${selectedOrder.OrderNumber}`}</h3>
                                    {(Number(selectedOrder.AbnormalScrapQuantity || 0) > 0 || ordersWithExtraMaterialIssue.has(String(selectedOrder.Id))) && (
                                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs font-semibold text-destructive">
                                            <AlertTriangle className="h-4 w-4 shrink-0" />
                                            <span>تم تجاوز حد الهالك أو الهدر. تم تمييز الهالك غير الطبيعي، وتوثيق أي صرف خامات إضافي في مستند حركة الخامات المرتبط بالتشغيلة.</span>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>طريقة المعالجة: <strong>{selectedOrder.WasteTreatment === 'allocate_to_good' ? 'توزيع على القطع السليمة' : 'تحميل على خسائر التصنيع'}</strong></div>
                                        <div>الهالك الطبيعي (النسبة المسموحة): <strong>{Number(selectedOrder.NormalScrapQuantity || 0)} وحدة ({Number(selectedOrder.ExpectedScrapPercent || 0)}%)</strong></div>
                                        <div className={Number(selectedOrder.AbnormalScrapQuantity || 0) > 0 ? 'font-semibold text-destructive' : ''}>الهالك غير الطبيعي: <strong>{Number(selectedOrder.AbnormalScrapQuantity || 0)} وحدة</strong></div>
                                        <div>تكلفة الهالك الطبيعي الموزعة: <strong>{Number(selectedOrder.NormalScrapCost || 0).toFixed(4)} ج.م</strong></div>
                                        <div>تكلفة خامات الهدر: <strong>{Number(selectedOrder.WastedMaterialCost || 0).toFixed(4)} ج.م</strong></div>
                                        <div>تكلفة المنتج النهائي الهالك: <strong>{Number(selectedOrder.DamagedOutputCost || 0).toFixed(4)} ج.م</strong></div>
                                        <div>تكلفة الإنتاج قبل التوزيع: <strong>{Number(selectedOrder.BaseFinishedGoodsCost || 0).toFixed(4)} ج.م</strong></div>
                                        <div>الموزع على التشغيلة: <strong>{Number(selectedOrder.AllocatedWasteCost || 0).toFixed(4)} ج.م</strong></div>
                                        <div>حصة القطعة من الهدر: <strong>{Number(selectedOrder.AllocatedWasteCostPerUnit || 0).toFixed(4)} ج.م</strong></div>
                                        <div>تحديث تكلفة الصنف: <strong>{selectedOrder.ItemCostUpdated ? 'تم' : 'لم يتم'}</strong></div>
                                        <div>تحديث سعر البيع: <strong>{selectedOrder.ItemSalePriceUpdated ? 'تم' : 'لم يتم'}</strong></div>
                                    </div>
                                    <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-2 text-sm">
                                        <span>هامش مستهدف: <strong>{Number(selectedOrder.ProfitMarginPercent ?? 25)}%</strong></span>
                                        <span>السعر المقترح/المسجل: <strong className="text-emerald-700">{Number(selectedOrder.SalePrice || 0).toFixed(4)} ج.م</strong></span>
                                    </div>
                                </div>
                            )}

                            {selectedOrder.Notes && (
                                <div className="p-2.5 border rounded-md text-xs">
                                    <span className="font-semibold block mb-0.5">ملاحظات:</span>
                                    {selectedOrder.Notes}
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        {selectedOrder && <Button variant="outline" onClick={() => openBatchPrint(selectedOrder)}><Printer className="ml-2 h-4 w-4" />طباعة التشغيلة</Button>}
                        <Button variant="outline" onClick={() => setIsViewOpen(false)}>إغلاق</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isBatchPrintOpen} onOpenChange={setIsBatchPrintOpen}>
                <DialogContent className="max-w-md" dir="rtl">
                    <DialogHeader>
                        <DialogTitle>طباعة بيانات التشغيلة</DialogTitle>
                        <DialogDescription>
                            {batchPrintOrder?.FinishedItemName} — رقم التشغيلة {batchPrintOrder?.BatchNumber || `LOT-${batchPrintOrder?.OrderNumber || ''}`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>نوع الطباعة</Label>
                            <Select value={batchPrintFormat} onValueChange={(value: 'label_3x1_5' | 'label_4x1' | 'a4') => { setBatchPrintFormat(value); if (value === 'a4') setBatchPrintCopies(1); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="label_3x1_5">ملصق باركود 3 × 1.5 سم</SelectItem>
                                    <SelectItem value="label_4x1">ملصق باركود 4 × 1 سم</SelectItem>
                                    <SelectItem value="a4">تقرير التشغيلة كامل — A4</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {batchPrintFormat !== 'a4' && (
                            <div className="space-y-2">
                                <Label>عدد نسخ الملصق</Label>
                                <Input type="number" min="1" max="500" step="1" value={batchPrintCopies} onFocus={event => event.currentTarget.select()} onChange={event => setBatchPrintCopies(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} />
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">سيظهر اسم الصنف ورقم التشغيلة، ويتضمن الباركود رقم التشغيلة لقراءته بجهاز المسح.</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsBatchPrintOpen(false)}>إلغاء</Button>
                        <Button onClick={handlePrintBatch} disabled={!batchPrintOrder}><Printer className="ml-2 h-4 w-4" />طباعة</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
