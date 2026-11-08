
"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, Save, Loader2 } from "lucide-react";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { useAuth } from "@/contexts/auth-context";
import { Combobox } from "@/components/ui/combobox";

interface StockItem {
  id: string; // Will be a composite ID for local state management, e.g., 'itemId-uniqueId'
  itemId: string;
  name: string;
  qty: number;
  cost: number;
  unit: string;
  baseUnit: string;
  conversionFactor: number;
  sourceStock: number;
  destinationStock: number;
  code?: string;
  total: number;
  uniqueId: string;
}

interface Item {
    id: string;
    name: string;
    baseUnit: string;
    price?: number;
    cost?: number;
    stock?: number;
    code?: string;
    secondaryUnits?: { name: string; conversionFactor: number; price: number; barcode?: string }[];
}

interface User {
    id: string;
    name: string;
    warehouse: string;
    isSalesRep?: boolean;
}

interface Warehouse {
    id: string;
    name: string;
}

interface SecondaryUnitOption {
    value: string;
    label: string;
    factor: number;
    price?: number;
    barcode?: string;
}

export default function NewStockOutPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    const [items, setItems] = useState<StockItem[]>([]);
    const [newItem, setNewItem] = useState<{id: string; name: string; qty: number; cost: number; unit: string; code: string; sourceStock: number; destinationStock: number;}>({ id: "", name: "", qty: 1, unit: "", cost: 0, code: "", sourceStock: 0, destinationStock: 0 });
    const [selectedUnit, setSelectedUnit] = useState('base');
    const [availableUnits, setAvailableUnits] = useState<SecondaryUnitOption[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const [branchFilter, setBranchFilter] = useState<string>("all");
    const [source, setSource] = useState<string>("");
    const [notes, setNotes] = useState<string>("");
    const [reason, setReason] = useState<string>("");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    
    // State for requisitions
    const [selectedRequisitionId, setSelectedRequisitionId] = useState('');


    const { 
        items: allItems, 
        warehouses,
        inventoryZones,
        inventory,
        requisitions,
        dbAction,
        getNextId,
        loading,
        settings,
        isOnline,
        // For stock calculation
        inventoryClosings,
        stockInRecords,
        stockOutRecords,
        stockTransferRecords,
        stockAdjustmentRecords,
        salesInvoices,
        salesReturns,
        posSales,
        posReturns,
        purchaseReturns,
        stockIssuesToReps,
        stockReturnsFromReps,
    } = useData();

    const authorizedBranches = useMemo(() => {
        const b = warehouses.filter((w: any) => !w.isMain && !w.isRepWarehouse && !w.repId);
        if (user?.warehouseIds?.includes('all')) return b;
        return b.filter((w: any) => user?.warehouseIds?.includes(w.id));
    }, [warehouses, user]);

    // Effect to auto-select branch if user is assigned to only one
    useEffect(() => {
        if (authorizedBranches.length === 1) {
            setBranchFilter(authorizedBranches[0].id);
        }
    }, [authorizedBranches]);
    
     const pendingRequisitionsForSource = useMemo(() => {
        if (!source || reason !== 'requisition' || !requisitions) return [];
        return requisitions
            .filter((req: any) => req.toWarehouseId === source && req.status === 'pending')
            .map((req: any) => {
                const fromWarehouse = warehouses.find((w: any) => w.id === req.fromWarehouseId);
                return {
                    ...req,
                    fromWarehouseName: fromWarehouse?.name || 'فرع غير معروف',
                }
            });
    }, [source, reason, requisitions, warehouses]);

    const requisitionOptions = useMemo(() => {
        return pendingRequisitionsForSource.map((req: any) => ({
            value: req.id,
            label: `طلب ${req.requisitionNumber} من فرع ${req.fromWarehouseName}`
        }));
    }, [pendingRequisitionsForSource]);

     useEffect(() => {
        if (reason !== 'requisition') {
            setSelectedRequisitionId('');
            setItems([]);
        }
    }, [reason]);
    
     const calculateStock = useCallback((itemId: string, warehouseId: string): number => {
        if (!warehouseId) return 0;
        
        const closingsForWarehouse = (inventoryClosings || []).filter((c: any) => c.warehouseId === warehouseId)
            .sort((a: any,b: any) => new Date(b.closingDate).getTime() - new Date(a.date).getTime());
        
        const lastClosing = closingsForWarehouse[0] ?? null;
        const lastClosingDate = lastClosing ? new Date(lastClosing.closingDate) : new Date(0);
        let stock = lastClosing?.balances?.find((b: any) => b.itemId === itemId)?.balance || 0;

        const filterTransactions = (t: any) => new Date(t.date) > lastClosingDate;

        // INCOMING
        (stockInRecords || []).filter((si:any) => si.warehouseId === warehouseId && filterTransactions(si)).forEach((si: any) => si.items.forEach((i: any) => { if ((i.id || i.itemId) === itemId) stock += i.qty; }));
        (stockTransferRecords || []).filter((t:any) => t.toSourceId === warehouseId && filterTransactions(t)).forEach((t: any) => t.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));
        (stockAdjustmentRecords || []).filter((adj:any) => adj.warehouseId === warehouseId && filterTransactions(adj)).forEach((adj: any) => adj.items.forEach((i: any) => { if (i.itemId === itemId && i.difference > 0) stock += i.difference; }));
        (salesReturns || []).filter((sr:any) => sr.warehouseId === warehouseId && filterTransactions(sr)).forEach((sr: any) => sr.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));
        (posReturns || []).filter((pr:any) => pr.warehouseId === warehouseId && filterTransactions(pr)).forEach((pr: any) => pr.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));
        (stockReturnsFromReps || []).filter((rfr:any) => rfr.warehouseId === warehouseId && filterTransactions(rfr)).forEach((rfr: any) => rfr.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));
        
        // OUTGOING
        (salesInvoices || []).filter((s:any) => s.warehouseId === warehouseId && s.status === 'approved' && filterTransactions(s)).forEach((s: any) => s.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (posSales || []).filter((s: any) => s.warehouseId === warehouseId && filterTransactions(s)).forEach((s: any) => s.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockOutRecords || []).filter((so:any) => so.sourceId === warehouseId && filterTransactions(so)).forEach((so: any) => so.items.forEach((i:any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockTransferRecords || []).filter((t:any) => t.fromSourceId === warehouseId && filterTransactions(t)).forEach((t: any) => t.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockAdjustmentRecords || []).filter((adj:any) => adj.warehouseId === warehouseId && filterTransactions(adj)).forEach((adj: any) => adj.items.forEach((i: any) => { if (i.itemId === itemId && i.difference < 0) stock += i.difference; }));
        (purchaseReturns || []).filter((pr:any) => pr.warehouseId === warehouseId && filterTransactions(pr)).forEach((pr: any) => pr.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockIssuesToReps || []).filter((itr:any) => itr.warehouseId === warehouseId && filterTransactions(itr)).forEach((itr: any) => itr.items.filter((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        
        return stock;
    }, [inventoryClosings, stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, salesInvoices, salesReturns, posSales, posReturns, purchaseReturns, stockIssuesToReps, stockReturnsFromReps]);


    useEffect(() => {
        if (selectedRequisitionId) {
            const requisition = requisitions.find((r: any) => r.id === selectedRequisitionId);
            if (requisition) {
                const requisitionItems = requisition.items.map((item: any) => {
                    const masterItem = allItems.find((i: any) => i.id === item.itemId);
                    const destinationStock = calculateStock(item.itemId, requisition.fromWarehouseId);
                    const sourceStock = calculateStock(item.itemId, requisition.toWarehouseId);
                    return {
                        id: `${item.itemId}-${Date.now()}`,
                        itemId: item.itemId,
                        name: item.name,
                        qty: item.quantity,
                        cost: masterItem?.cost || 0,
                        unit: masterItem?.baseUnit || 'قطعة',
                        baseUnit: masterItem?.baseUnit || 'قطعة',
                        conversionFactor: 1,
                        sourceStock,
                        destinationStock,
                        total: item.quantity * (masterItem?.cost || 0),
                        uniqueId: `${item.itemId}-${Date.now()}-${Math.random()}`
                    };
                });
                setItems(requisitionItems);
                setNotes(`بناءً على طلب البضاعة رقم ${requisition.requisitionNumber}`);
            }
        }
    }, [selectedRequisitionId, requisitions, allItems, calculateStock]);


    const availableItemsWithStock = useMemo(() => {
        if (!source || !allItems.length) return [];
        const allowNegativeStock = settings?.main?.financial?.allowNegativeStock || false;
        
        return allItems.map((item: any) => ({
            ...item,
            stock: calculateStock(item.id, source)
        })).filter((item: any) => item.stock > 0 || allowNegativeStock);
    }, [source, allItems, calculateStock, settings]);


    const itemsForCombobox = useMemo(() => {
        return availableItemsWithStock.map((item: Item) => ({ 
            value: item.id, 
            label: `${item.name} (${item.code || 'N/A'}) (المتاح: ${item.stock})` 
        }));
    }, [availableItemsWithStock]);

    const handleAddItem = () => {
        if (!newItem.id || newItem.qty <= 0) {
            toast({ variant: "destructive", title: "خطأ", description: "يرجى اختيار صنف وكمية صالحة."});
            return;
        }
        const selectedItem = availableItemsWithStock.find((i: Item) => i.id === newItem.id);
        if (!selectedItem) return;
        
        const selectedUnitInfo = availableUnits.find(u => u.value === selectedUnit);
        if (!selectedUnitInfo) return;
        
        const requiredBaseQty = newItem.qty * selectedUnitInfo.factor;
        
        if (requiredBaseQty > (selectedItem.stock || 0) && !settings?.main?.financial?.allowNegativeStock) {
            toast({ variant: "destructive", title: "كمية غير متوفرة", description: `الرصيد المتاح من هذا الصنف هو ${selectedItem.stock} ${selectedItem.baseUnit} فقط.` });
            return;
        }
        
        const req = requisitions.find((r:any) => r.id === selectedRequisitionId);
        const destinationWarehouseId = req?.fromWarehouseId || null;
        const destinationStock = destinationWarehouseId ? calculateStock(selectedItem.id, destinationWarehouseId) : 0;


        setItems([
        ...items,
        { 
            id: `${selectedItem.id}-${Date.now()}`,
            itemId: selectedItem.id,
            name: selectedItem.name,
            qty: newItem.qty,
            unit: selectedUnitInfo.label,
            baseUnit: selectedItem.baseUnit,
            conversionFactor: selectedUnitInfo.factor,
            cost: newItem.cost,
            total: newItem.qty * newItem.cost,
            uniqueId: `${selectedItem.id}-${Date.now()}`,
            code: newItem.code,
            sourceStock: selectedItem.stock || 0,
            destinationStock: destinationStock,
        },
        ]);
        setNewItem({ id: "", name: "", qty: 1, unit: "", cost: 0, code: "", sourceStock: 0, destinationStock: 0 });
        setSelectedUnit('base');
        setAvailableUnits([]);
    };

    const handleItemSelect = (itemId: string) => {
        const selectedItem = availableItemsWithStock.find((i: Item) => i.id === itemId);
        if (selectedItem) {
            const baseUnitOption: SecondaryUnitOption = { value: 'base', label: selectedItem.baseUnit || 'قطعة', factor: 1, price: selectedItem.price || 0, barcode: selectedItem.code || '' };
            const secondaryUnitsOptions: SecondaryUnitOption[] = (selectedItem.secondaryUnits || []).map((u: any) => ({
                value: u.name,
                label: u.name,
                factor: u.conversionFactor,
                price: u.price || 0,
                barcode: u.barcode || '',
            }));

            const allUnits = [baseUnitOption, ...secondaryUnitsOptions];
            setAvailableUnits(allUnits);
            setSelectedUnit('base');
            
            const req = requisitions.find((r:any) => r.id === selectedRequisitionId);
            const destinationWarehouseId = req?.fromWarehouseId || null;
            
            setNewItem({
                id: itemId,
                qty: 1,
                unit: selectedItem.baseUnit,
                cost: selectedItem.cost || 0,
                name: selectedItem.name,
                code: selectedItem.code || '',
                sourceStock: selectedItem.stock || 0,
                destinationStock: destinationWarehouseId ? calculateStock(itemId, destinationWarehouseId) : 0,
            });
        }
    }
    
     const handleUnitChange = (unitName: string) => {
        setSelectedUnit(unitName);
        const unit = availableUnits.find(u => u.value === unitName);
        const item = allItems.find((i: Item) => i.id === newItem.id);
        if (unit && item) {
             const cost = (item.cost || 0) * unit.factor;
             setNewItem(prev => ({
                 ...prev, 
                 cost: cost,
                 code: unit.barcode || item.code || ''
            }));
        }
    }

    const handleRemoveItem = (id: string) => {
        setItems(items.filter((item) => item.id !== id));
    };

    const handleConfirm = async () => {
        if (!source || items.length === 0 || !reason) {
            toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "يرجى اختيار المصدر والسبب وإضافة صنف واحد على الأقل."});
            return;
        }
        
        setIsSaving(true);
        const nextId = await getNextId('stockOut');
         if(!nextId) {
            toast({ variant: "destructive", title: "خطأ", description: "فشل في إنشاء رقم الإيصال. يرجى المحاولة مرة أخرى."});
            setIsSaving(false);
            return;
        }
        
        const itemsToSave = items.map(item => ({
            id: item.itemId,
            name: item.name,
            qty: item.qty * item.conversionFactor,
            cost: item.cost / item.conversionFactor,
            sectionId: allItems.find((i:any) => i.id === item.itemId)?.defaultBinId || null,
        }));

        const now = new Date();
        const selectedDate = new Date(date);
        const finalDate = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
            now.getHours(),
            now.getMinutes(),
            now.getSeconds()
        );

        const record:any = {
            sourceId: source,
            date: finalDate.toISOString(),
            items: itemsToSave,
            reason: reason === 'requisition' ? 'صرف لفرع آخر' : reason,
            requisitionId: reason === 'requisition' ? selectedRequisitionId : null,
            notes,
            receiptNumber: `إذ-خ-${nextId}`,
            createdById: user?.id,
            createdByName: user?.name,
            type: 'stock-out-manual',
        };
        
        try {
            await dbAction('stockOutRecords', 'add', record);
            
            // If it was based on a requisition, update the requisition status
            if (reason === 'requisition' && selectedRequisitionId) {
                await dbAction('requisitions', 'update', {id: selectedRequisitionId, data: {status: 'fulfilled'}});
            }

            toast({ title: "تم بنجاح", description: `تم تأكيد صرف المخزون بنجاح برقم إيصال: ${record.receiptNumber}`});
            router.push('/inventory/movements');
        } catch(error) {
            toast({ variant: "destructive", title: "حدث خطأ", description: "فشل في حفظ إيصال الصرف. يرجى المحاولة مرة أخرى."});
            console.error("Failed to save stock out record:", error);
        } finally {
            setIsSaving(false);
        }
    };
    
    const warehouseOptions = useMemo(() => {
        const combined = [...warehouses, ...inventoryZones].filter((w: any) => !w.isRepWarehouse);
        
        // 1. Filter by User Authorized Branches first
        let filtered = combined;
        if (!user?.warehouseIds?.includes('all')) {
            filtered = combined.filter((w: any) => user?.warehouseIds?.includes(w.id));
        }

        // 2. Filter by Branch Filter if selected
        if (branchFilter !== 'all') {
            filtered = filtered.filter((w: any) => {
                if (w.id === branchFilter) return true;
                return (w as any).branchId === branchFilter;
            });
        }

        return filtered.map((w: any) => ({ value: w.id, label: w.name }));
    }, [warehouses, inventoryZones, user, branchFilter]);

    const branchOptions = useMemo(() => {
        return [{ value: 'all', label: 'كل الفروع المصرح بها' }, ...authorizedBranches.map(b => ({ value: b.id, label: b.name }))];
    }, [authorizedBranches]);


  return (
    <>
      <PageHeader title="إذن صرف مخزني يدوي" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 printable-area">
        <Card>
          <CardHeader>
            <CardTitle>إيصال صرف مخزني</CardTitle>
             <CardDescription>تستخدم هذه شاشة للصرف لأسباب إدارية مثل التوالف والعينات، أو لتلبية طلبات الفروع الأخرى.</CardDescription>
            <div className="grid md:grid-cols-3 gap-4 text-sm text-muted-foreground pt-2">
                <div>رقم الإيصال: (سيتم إنشاؤه عند الحفظ)</div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
                <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <>
                    <div className="grid md:grid-cols-4 gap-6">
                        <div className="space-y-2">
                            <Label>الفرع</Label>
                            <Combobox
                                options={branchOptions}
                                value={branchFilter}
                                onValueChange={(v) => {setBranchFilter(v); setSource(''); setReason(''); setSelectedRequisitionId(''); setItems([])}}
                                placeholder="فلترة حسب الفرع..."
                                disabled={authorizedBranches.length === 1}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="warehouse">المخزن المصدر</Label>
                            <Combobox
                                options={warehouseOptions}
                                value={source}
                                onValueChange={(v) => {setSource(v); setReason(''); setSelectedRequisitionId(''); setItems([])}}
                                placeholder="اختر المصدر"
                                emptyMessage="لا يوجد مخازن لهذا الفرع"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reason">سبب الصرف</Label>
                            <Select value={reason} onValueChange={v => setReason(v)} disabled={!source}>
                                <SelectTrigger id="reason">
                                    <SelectValue placeholder="اختر سبب الصرف" />
                                </SelectTrigger>
                                <SelectContent>
                                   <SelectItem value="requisition">صرف بناءً على طلب بضاعة</SelectItem>
                                   <SelectItem value="damaged">تالف</SelectItem>
                                   <SelectItem value="samples">عينات</SelectItem>
                                   <SelectItem value="internal_use">استخدام داخلي</SelectItem>
                                   <SelectItem value="giveaway">هدايا ترويجية</SelectItem>
                                   <SelectItem value="obsolete">بضاعة هالكة/متقادمة</SelectItem>
                                   <SelectItem value="other">أخرى</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="date">تاريخ الصرف</Label>
                            <Input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                    </div>

                    {reason === 'requisition' && (
                        <div className="space-y-2 pt-4 border-t">
                            <Label htmlFor="requisition-select">اختر طلب البضاعة</Label>
                            <Combobox
                                options={requisitionOptions}
                                value={selectedRequisitionId}
                                onValueChange={setSelectedRequisitionId}
                                placeholder="اختر الطلب المراد تنفيذه..."
                                emptyMessage="لا توجد طلبات معلقة لهذا الفرع."
                            />
                        </div>
                    )}
                    
                    <div>
                      <Label>الأصناف المصروفة</Label>
                      <div className="w-full overflow-auto border rounded-lg">
                        <Table>
                            <TableHeader>
                            <TableRow>
                                <TableHead className="w-[30%]">الصنف</TableHead>
                                <TableHead>الباركود</TableHead>
                                <TableHead className="text-center w-28">الوحدة</TableHead>
                                <TableHead className="text-center w-24">الكمية</TableHead>
                                <TableHead className="text-center w-32">رصيد المصدر</TableHead>
                                <TableHead className="text-center w-32">رصيد المستلم</TableHead>
                                <TableHead className="text-center w-[100px] no-print">الإجراء</TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {items.map((item) => (
                                <TableRow key={item.uniqueId}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                <TableCell className="text-center">{item.unit}</TableCell>
                                <TableCell><Input type="number" value={item.qty} onChange={e => setItems(items.map(i => i.id === item.id ? {...i, qty: Number(e.target.value)} : i))} className="text-center h-8" /></TableCell>
                                <TableCell className="text-center">{item.sourceStock}</TableCell>
                                <TableCell className="text-center">{item.destinationStock}</TableCell>
                                <TableCell className="text-center no-print">
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)} disabled={reason === 'requisition'}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                                </TableRow>
                            ))}
                             {reason !== 'requisition' && (
                                <TableRow className="no-print bg-muted/20">
                                    <TableCell className="p-2" colSpan={2}>
                                        <Combobox
                                            options={itemsForCombobox}
                                            value={newItem.id}
                                            onValueChange={handleItemSelect}
                                            placeholder={!source ? "اختر فرع المصدر أولاً" : "اختر صنفًا..."}
                                            emptyMessage="لا توجد أصناف."
                                            disabled={!source}
                                        />
                                    </TableCell>
                                    <TableCell className="p-2 w-40">
                                         <Combobox
                                            options={availableUnits}
                                            value={selectedUnit}
                                            onValueChange={handleUnitChange}
                                            placeholder="اختر وحدة..."
                                            emptyMessage="اختر صنفًا أولاً"
                                            disabled={!newItem.id}
                                        />
                                    </TableCell>
                                    <TableCell className="p-2 w-24">
                                        <Input type="number" placeholder="الكمية" value={newItem.qty} onChange={e => setNewItem({...newItem, qty: parseInt(e.target.value) || 1})} onFocus={e => e.target.select()} className="text-center" />
                                    </TableCell>
                                    <TableCell className="text-center font-semibold text-muted-foreground">{newItem.sourceStock}</TableCell>
                                    <TableCell className="text-center font-semibold text-muted-foreground">{newItem.destinationStock}</TableCell>
                                    <TableCell className="p-2 text-center">
                                        <Button onClick={handleAddItem} size="sm" disabled={!source || !newItem.id}>
                                            <PlusCircle className="ml-2 h-4 w-4" />
                                            إضافة
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )}
                            </TableBody>
                        </Table>
                      </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="notes">ملاحظات</Label>
                        <Textarea id="notes" placeholder="أضف أي ملاحظات هنا..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                </>
            )}
          </CardContent>
          <CardFooter className="flex justify-end no-print">
            <Button size="lg" disabled={loading || isSaving} onClick={handleConfirm}>
                 {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                تأكيد الصرف
            </Button>
          </CardFooter>
        </Card>
      </main>
    </>
  );
}
