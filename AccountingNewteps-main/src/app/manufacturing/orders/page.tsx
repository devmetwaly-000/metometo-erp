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
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/data-provider";
import { useAuth } from "@/contexts/auth-context";
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
    Eye
} from "lucide-react";
import * as XLSX from 'xlsx';

interface ManufacturingOrder {
    Id: string;
    OrderNumber: string;
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
    BOMDetailsJson?: string;
    Notes?: string;
    CreatedBy?: string;
    CreatedAt: string;
}

export default function ManufacturingOrdersPage() {
    const { toast } = useToast();
    const { user } = useAuth();
    const { items: allItems, warehouses, dbAction } = useData();

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
    const [notes, setNotes] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);

    // Modal state for viewing/completing order
    const [selectedOrder, setSelectedOrder] = useState<ManufacturingOrder | null>(null);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [isCompleteOpen, setIsCompleteOpen] = useState(false);
    const [producedQty, setProducedQty] = useState<number>(1);

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
            const costPerUnit = Number(rawItem?.costPrice || rawItem?.purchasePrice || 0);
            const totalComponentCost = requiredTotalQty * costPerUnit;

            // Available stock in source warehouse
            const whStock = rawItem?.stocks?.[sourceWarehouseId] ?? rawItem?.stock ?? 0;
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
    }, [selectedItem, targetQuantity, allItems, sourceWarehouseId]);

    const totalRawCost = useMemo(() => {
        return calculatedBOM.reduce((sum: number, c: any) => sum + c.totalCost, 0);
    }, [calculatedBOM]);

    const totalEstimatedCost = totalRawCost + Number(laborCost || 0) + Number(overheadCost || 0);
    const estimatedUnitCost = targetQuantity > 0 ? totalEstimatedCost / targetQuantity : 0;

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

        setSubmitting(true);
        try {
            const newOrder = {
                orderNumber: `WO-${Date.now().toString().slice(-6)}`,
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
        setNotes('');
    };

    // Handle Start Order
    const handleStartOrder = async (order: ManufacturingOrder) => {
        try {
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

    // Handle Complete Order (Executes stock deduction, addition, and GL posting)
    const handleExecuteCompletion = async () => {
        if (!selectedOrder) return;
        setSubmitting(true);
        try {
            // 1. Update order status in DB
            const res = await fetch('/api/manufacturing/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_status',
                    order: { 
                        id: selectedOrder.Id, 
                        status: 'completed',
                        producedQuantity: producedQty
                    },
                    userId: user?.id,
                    userName: user?.name
                })
            });
            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message);
            }

            // 1.5 Execute Inventory Movements (Deduct Raw Materials & Receive Finished Goods)
            try {
                let bomList: any[] = [];
                if (selectedOrder.BOMDetailsJson) {
                    try { bomList = JSON.parse(selectedOrder.BOMDetailsJson); } catch {}
                }
                if (bomList.length > 0) {
                    await dbAction('stockOutRecords', 'add', {
                        sourceId: selectedOrder.SourceWarehouseId,
                        date: new Date().toISOString(),
                        reason: 'manufacturing_consumption',
                        notes: `سحب خامات تشغيل أمر تصنيع رقم ${selectedOrder.OrderNumber} لإنتاج [${selectedOrder.FinishedItemName}]`,
                        items: bomList.map((b: any) => ({
                            id: b.itemId,
                            itemId: b.itemId,
                            name: b.name,
                            qty: Number(b.unitQty || 1) * Number(producedQty),
                            cost: Number(b.costPerUnit || 0)
                        })),
                        createdById: user?.id,
                        createdByName: user?.name
                    });
                }

                await dbAction('stockInRecords', 'add', {
                    warehouseId: selectedOrder.TargetWarehouseId,
                    date: new Date().toISOString(),
                    reason: 'manufacturing_output',
                    status: 'completed',
                    notes: `استلام منتج تام من أمر التصنيع رقم ${selectedOrder.OrderNumber}`,
                    items: [{
                        id: selectedOrder.FinishedItemId,
                        itemId: selectedOrder.FinishedItemId,
                        name: selectedOrder.FinishedItemName,
                        qty: Number(producedQty),
                        cost: Number(selectedOrder.UnitCost || 0)
                    }],
                    createdById: user?.id,
                    createdByName: user?.name
                });
            } catch (invErr) {
                console.warn('Inventory movement execution note:', invErr);
            }

            // 2. Post to General Ledger (Automatic Subledger Posting)
            try {
                await fetch('/api/accounting/posting', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourceType: 'production_order',
                        sourceId: selectedOrder.Id,
                        sourceNumber: selectedOrder.OrderNumber,
                        warehouseId: selectedOrder.TargetWarehouseId,
                        date: new Date().toISOString(),
                        description: `إثبات تكلفة إنتاج وتشغيل تامة لأمر ${selectedOrder.OrderNumber} صنف [${selectedOrder.FinishedItemName}]`,
                        lines: [
                            {
                                accountCode: '1202', // مخزون الإنتاج التام
                                accountName: 'حـ/ مخزون الإنتاج التام (Finished Goods)',
                                debit: selectedOrder.TotalCost,
                                credit: 0,
                                memo: `إضافة منتج تام كمية ${producedQty}`
                            },
                            {
                                accountCode: '1201', // مخزون المواد الخام
                                accountName: 'حـ/ مخزون الخامات والمواد الأولية (Raw Materials)',
                                debit: 0,
                                credit: selectedOrder.RawMaterialCost,
                                memo: 'صرف خامات ومواد خام لأمر التصنيع'
                            },
                            ...(selectedOrder.LaborCost > 0 ? [{
                                accountCode: '5201', // أجور وعمالة تشغيل
                                accountName: 'حـ/ أجور عمالة الإنتاج والتشغيل المباشرة',
                                debit: 0,
                                credit: selectedOrder.LaborCost,
                                memo: 'تكلفة عمالة تشغيلية محملة'
                            }] : []),
                            ...(selectedOrder.OverheadCost > 0 ? [{
                                accountCode: '5202', // مصاريف صناعية غير مباشرة
                                accountName: 'حـ/ تكاليف صناعية غير مباشرة محملة (Overhead)',
                                debit: 0,
                                credit: selectedOrder.OverheadCost,
                                memo: 'مصاريف تشغيل صناعية محملة'
                            }] : [])
                        ],
                        userId: user?.id,
                        userName: user?.name
                    })
                });
            } catch (postingErr) {
                console.warn('Auto GL Posting note:', postingErr);
            }

            toast({ 
                title: 'اكتمل أمر التصنيع بنجاح', 
                description: `تم اعتماد إنتاج ${producedQty} وحدة وترحيل قيد التكاليف الصناعية والمخزون.` 
            });

            setIsCompleteOpen(false);
            fetchOrders();
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
            'أنشئ بواسطة': o.CreatedBy
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "أوامر التصنيع");
        XLSX.writeFile(wb, `Manufacturing_Orders_${Date.now()}.xlsx`);
    };

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
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
                        <CardTitle className="text-sm font-medium text-blue-600">قيد التشغيل والتنفيذ</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{kpis.inProgress}</div>
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

                <Card className="border-purple-500/30 bg-purple-50/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-purple-600">إجمالي تكاليف الإنتاج المنفذة</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600">{kpis.totalCompletedCost.toLocaleString('ar-EG')} ج.م</div>
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
                            className="text-blue-600"
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
                                    <TableHead className="text-right">التاريخ</TableHead>
                                    <TableHead className="text-right">المنتج التام</TableHead>
                                    <TableHead className="text-right">الكمية المستهدفة</TableHead>
                                    <TableHead className="text-right">الكمية المنتجة</TableHead>
                                    <TableHead className="text-right">تكلفة الخامات</TableHead>
                                    <TableHead className="text-right">إجمالي التكلفة</TableHead>
                                    <TableHead className="text-right">تكلفة الوحدة</TableHead>
                                    <TableHead className="text-right">الحالة</TableHead>
                                    <TableHead className="text-center">الإجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                                            جاري تحميل أوامر التشغيل والتصنيع...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOrders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                                            لا توجد أوامر تشغيل مطابقة للبحث المحدد.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOrders.map(order => (
                                        <TableRow key={order.Id}>
                                            <TableCell className="font-bold text-primary">{order.OrderNumber}</TableCell>
                                            <TableCell>{new Date(order.OrderDate).toLocaleDateString('ar-EG')}</TableCell>
                                            <TableCell className="font-semibold">{order.FinishedItemName}</TableCell>
                                            <TableCell>{order.TargetQuantity}</TableCell>
                                            <TableCell>{order.ProducedQuantity || 0}</TableCell>
                                            <TableCell>{Number(order.RawMaterialCost || 0).toLocaleString('ar-EG')} ج.م</TableCell>
                                            <TableCell className="font-bold">{Number(order.TotalCost || 0).toLocaleString('ar-EG')} ج.م</TableCell>
                                            <TableCell className="text-muted-foreground">{Number(order.UnitCost || 0).toFixed(2)} ج.م</TableCell>
                                            <TableCell>
                                                {order.Status === 'draft' && <Badge variant="secondary">مسودة</Badge>}
                                                {order.Status === 'in_progress' && <Badge className="bg-blue-600">قيد التشغيل</Badge>}
                                                {order.Status === 'completed' && <Badge className="bg-green-600">مكتمل ومعتمد</Badge>}
                                                {order.Status === 'cancelled' && <Badge variant="destructive">ملغي</Badge>}
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

                                                    {order.Status === 'draft' && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="text-blue-600 border-blue-500/30 hover:bg-blue-50"
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
                                                                setSelectedOrder(order);
                                                                setProducedQty(order.TargetQuantity);
                                                                setIsCompleteOpen(true);
                                                            }}
                                                            title="إنهاء واعتماد أمر الإنتاج"
                                                        >
                                                            <PackageCheck className="h-3.5 w-3.5 ml-1" />
                                                            إنهاء واعتماد
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
                                    onChange={(e) => setOverheadCost(Number(e.target.value))} 
                                />
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
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="h-5 w-5" />
                            إنهاء واعتماد أمر الإنتاج رقم {selectedOrder?.OrderNumber}
                        </DialogTitle>
                        <DialogDescription>
                            سيتم خصم الخامات من المخزن وإضافة المنتج التام إلى مخزن الوجهة وترحيل قيد التكاليف آلياً.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>الكمية الفعلية المنتجة والصالحة</Label>
                            <Input 
                                type="number" 
                                min="1" 
                                value={producedQty} 
                                onChange={(e) => setProducedQty(Number(e.target.value))} 
                            />
                        </div>

                        <div className="p-3 bg-muted rounded-md text-xs space-y-1.5">
                            <div className="flex justify-between">
                                <span>المنتج التام:</span>
                                <span className="font-bold">{selectedOrder?.FinishedItemName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>تكلفة الخامات:</span>
                                <span>{Number(selectedOrder?.RawMaterialCost || 0).toLocaleString('ar-EG')} ج.م</span>
                            </div>
                            <div className="flex justify-between">
                                <span>تكلفة العمالة والمصاريف:</span>
                                <span>{(Number(selectedOrder?.LaborCost || 0) + Number(selectedOrder?.OverheadCost || 0)).toLocaleString('ar-EG')} ج.م</span>
                            </div>
                            <div className="flex justify-between border-t pt-1 font-bold">
                                <span>إجمالي تكلفة الدفعة:</span>
                                <span className="text-primary">{Number(selectedOrder?.TotalCost || 0).toLocaleString('ar-EG')} ج.م</span>
                            </div>
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
                            </div>

                            {selectedOrder.Notes && (
                                <div className="p-2.5 border rounded-md text-xs">
                                    <span className="font-semibold block mb-0.5">ملاحظات:</span>
                                    {selectedOrder.Notes}
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsViewOpen(false)}>إغلاق</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
