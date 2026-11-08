
"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, Loader2, Save } from "lucide-react";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/auth-context";

interface StockItem {
  id: string;
  itemId: string;
  name: string;
  qty: number;
  unit: string;
  baseUnit: string;
  conversionFactor: number;
  cost: number;
  total: number;
  uniqueId: string;
  code?: string;
  sourceStock?: number;
  destinationStock?: number;
}

interface Item {
    id: string;
    name: string;
    baseUnit: string;
    price?: number;
    cost?: number;
    code?: string;
    stock?: number;
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

export default function NewStockTransferPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [items, setItems] = useState<StockItem[]>([]);
    const [newItem, setNewItem] = useState({ id: "", name: "", qty: 1, cost: 0, unit: "", code: "" });
    const [selectedUnit, setSelectedUnit] = useState('base');
    const [availableUnits, setAvailableUnits] = useState<SecondaryUnitOption[]>([]);

    const [fromBranch, setFromBranch] = useState<string>("all");
    const [fromSource, setFromSource] = useState<string>("");
    const [toBranch, setToBranch] = useState<string>("all");
    const [toSource, setToSource] = useState<string>("");
    const { user } = useAuth();
    const [notes, setNotes] = useState<string>("");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    const { 
        items: allItems,
        users, 
        warehouses, 
        inventoryZones,
        dbAction,
        getNextId,
        loading,
        settings,
        salesInvoices,
        stockInRecords,
        stockOutRecords,
        stockTransferRecords,
        stockAdjustmentRecords,
        salesReturns,
        stockReturnsFromReps,
        posSales,
        posReturns,
        purchaseReturns,
        stockIssuesToReps,
        inventoryClosings,
        requisitions,
     } = useData();

    const authorizedBranches = useMemo(() => {
        const b = warehouses.filter((w: any) => !w.isMain && !w.isRepWarehouse && !w.repId);
        if (user?.warehouseIds?.includes('all')) return b;
        return b.filter((w: any) => user?.warehouseIds?.includes(w.id));
    }, [warehouses, user]);
     
    useEffect(() => {
        if (authorizedBranches.length === 1) {
            setFromBranch(authorizedBranches[0].id);
        }
    }, [authorizedBranches]);

    
    const fromWarehouses = useMemo(() => {
        const combined = [...warehouses, ...inventoryZones].filter((w: any) => !w.isRepWarehouse);
        
        // 1. Filter by User Authorized Branches first
        let filtered = combined;
        if (!user?.warehouseIds?.includes('all')) {
            filtered = combined.filter((w: any) => user?.warehouseIds?.includes(w.id));
        }

        // 2. Filter by Branch Filter if selected
        if (fromBranch !== 'all') {
            filtered = filtered.filter((w: any) => {
                if (w.id === fromBranch) return true;
                return (w as any).branchId === fromBranch;
            });
        }

        return filtered;
    }, [warehouses, inventoryZones, user, fromBranch]);

    const toWarehouses = useMemo(() => {
        const combined = [...warehouses, ...inventoryZones].filter((w: any) => !w.isRepWarehouse);
        
        // 1. Filter by User Authorized Branches first
        let filtered = combined;
        if (!user?.warehouseIds?.includes('all')) {
            filtered = combined.filter((w: any) => user?.warehouseIds?.includes(w.id));
        }

        // 2. Filter by Branch Filter if selected
        if (toBranch !== 'all') {
            filtered = filtered.filter((w: any) => {
                if (w.id === toBranch) return true;
                return (w as any).branchId === toBranch;
            });
        }

        return filtered;
    }, [warehouses, inventoryZones, user, toBranch]);


    const reps = users.filter((u: User) => u.isSalesRep);
    const [selectedRepId, setSelectedRepId] = useState<string>('');


    const selectedRepWarehouseId = useMemo(() => {
        if (!selectedRepId) return null;
        return reps.find((r: User) => r.id === selectedRepId)?.warehouse;
    }, [selectedRepId, reps]);

    const calculateStock = useCallback((itemId: string, warehouseId: string): number => {
        if (!warehouseId) return 0;
        
        const closingsForWarehouse = (inventoryClosings || []).filter((c: any) => c.warehouseId === warehouseId)
            .sort((a: any,b: any) => new Date(b.closingDate).getTime() - new Date(a.date).getTime());
        
        const lastClosing = closingsForWarehouse[0] ?? null;
        const lastClosingDate = lastClosing ? new Date(lastClosing.closingDate) : new Date(0);
        let stock = lastClosing?.balances?.find((b: any) => b.itemId === itemId)?.balance || 0;

        const filterTransactions = (t: any) => new Date(t.date) > lastClosingDate;

        (stockInRecords || []).filter((si:any) => si.warehouseId === warehouseId && filterTransactions(si)).forEach((si: any) => si.items.forEach((i: any) => { if ((i.id || i.itemId) === itemId) stock += i.qty; }));
        (stockTransferRecords || []).filter((t:any) => t.toSourceId === warehouseId && filterTransactions(t)).forEach((t: any) => t.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));
        (stockAdjustmentRecords || []).filter((adj:any) => adj.warehouseId === warehouseId && filterTransactions(adj)).forEach((adj: any) => adj.items.forEach((i: any) => { if (i.itemId === itemId && i.difference > 0) stock += i.difference; }));
        (salesReturns || []).filter((sr:any) => sr.warehouseId === warehouseId && filterTransactions(sr)).forEach((sr: any) => sr.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));
        (posReturns || []).filter((pr:any) => pr.warehouseId === warehouseId && filterTransactions(pr)).forEach((pr: any) => pr.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));
        (stockReturnsFromReps || []).filter((rfr:any) => rfr.warehouseId === warehouseId && filterTransactions(rfr)).forEach((rfr: any) => rfr.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));

        (salesInvoices || []).filter((s:any) => s.warehouseId === warehouseId && s.status === 'approved' && filterTransactions(s)).forEach((s: any) => s.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (posSales || []).filter((s: any) => s.warehouseId === warehouseId && filterTransactions(s)).forEach((s: any) => s.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockOutRecords || []).filter((so:any) => so.sourceId === warehouseId && filterTransactions(so)).forEach((so: any) => so.items.forEach((i:any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockTransferRecords || []).filter((t:any) => t.fromSourceId === warehouseId && filterTransactions(t)).forEach((t: any) => t.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockAdjustmentRecords || []).filter((adj:any) => adj.warehouseId === warehouseId && filterTransactions(adj)).forEach((adj: any) => adj.items.forEach((i: any) => { if (i.itemId === itemId && i.difference < 0) stock += i.difference; }));
        (purchaseReturns || []).filter((pr:any) => pr.warehouseId === warehouseId && filterTransactions(pr)).forEach((pr: any) => pr.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockIssuesToReps || []).filter((itr:any) => itr.warehouseId === warehouseId && filterTransactions(itr)).forEach((itr: any) => itr.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        
        return stock;
    }, [inventoryClosings, stockInRecords, stockTransferRecords, stockAdjustmentRecords, salesReturns, posReturns, stockReturnsFromReps, salesInvoices, posSales, stockOutRecords, purchaseReturns, stockIssuesToReps]);

    const availableItemsWithStock = useMemo(() => {
        if (!fromSource || !allItems.length) return [];
        const allowNegativeStock = settings?.main?.financial?.allowNegativeStock || false;
        
        return allItems.map((item: any) => ({
            ...item,
            stock: calculateStock(item.id, fromSource)
        })).filter((item: any) => item.stock > 0 || allowNegativeStock);
    }, [fromSource, allItems, calculateStock, settings]);


    const itemsForCombobox = React.useMemo(() => {
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
        const allowNegativeStock = settings?.main?.financial?.allowNegativeStock || false;
        
        if (requiredBaseQty > (selectedItem.stock || 0) && !allowNegativeStock) {
            toast({ variant: "destructive", title: "كمية غير متوفرة", description: `الرصيد المتاح من هذا الصنف هو ${selectedItem.stock} ${selectedItem.baseUnit} فقط.` });
            return;
        }

        const destinationWarehouseId = toSource || selectedRepWarehouseId;
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
            cost: selectedItem.cost || 0,
            total: newItem.qty * (selectedItem.cost || 0),
            uniqueId: `${selectedItem.id}-${Date.now()}`,
            code: newItem.code,
            sourceStock: selectedItem.stock,
            destinationStock: destinationStock,
        },
        ]);
        setNewItem({ id: "", name: "", qty: 1, unit: "", cost: 0, code: "" });
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

            setNewItem({
                id: itemId,
                name: selectedItem.name,
                qty: 1,
                cost: selectedItem.cost || 0,
                code: selectedItem.code || '',
                unit: selectedItem.baseUnit,
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


    const handleRemoveItem = (uniqueId: string) => {
        setItems(items.filter((item) => item.uniqueId !== uniqueId));
    };

    const handleConfirm = async () => {
        if (!fromSource || (!toSource && !selectedRepId) || items.length === 0) {
            toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "يرجى اختيار جهة التحويل وإضافة صنف واحد على الأقل."});
            return;
        }

        const destination = toSource || selectedRepWarehouseId;
        if(fromSource === destination) {
            toast({ variant: "destructive", title: "خطأ", description: "لا يمكن التحويل من وإلى نفس الفرع."});
            return;
        }
        
        const nextId = await getNextId('stockTransfer');
        if(!nextId) {
            toast({
                variant: "destructive",
                title: "حدث خطأ",
                description: "فشل في إنشاء رقم الإيصال. يرجى المحاولة مرة أخرى.",
            });
            return;
        }
        
        const itemsToTransfer = items.map(item => {
            const masterItem = allItems.find((i:Item) => i.id === item.itemId);
            return {
                id: item.itemId,
                name: item.name,
                qty: item.qty * item.conversionFactor,
                cost: masterItem?.cost || 0
            }
        });

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

        const record = {
            fromSourceId: fromSource,
            toSourceId: destination,
            date: finalDate.toISOString(),
            items: itemsToTransfer,
            notes,
            receiptNumber: `إذ-ت-${nextId}`,
            createdById: user?.id,
            createdByName: user?.name,
        };

        try {
            const newTransferId = await dbAction('stockTransferRecords', 'add', record);
            
            const toWarehouse = [...warehouses, ...inventoryZones].find((w: any) => w.id === toSource);
            if (toWarehouse && !toWarehouse.isMain) {
                // If transferring to a branch (non-main), create a pending stock-in record
                await dbAction('stockInRecords', 'add', {
                    warehouseId: toSource,
                    date: finalDate.toISOString(),
                    items: itemsToTransfer,
                    reason: 'transfer',
                    notes: `وارد من إذن تحويل رقم ${record.receiptNumber} من ${[...warehouses, ...inventoryZones].find((w:any) => w.id === fromSource)?.name}`,
                    receiptNumber: `إذ-د-${await getNextId('stockIn')}`,
                    createdById: user?.id,
                    createdByName: user?.name,
                    fromWarehouseId: fromSource,
                    stockTransferId: newTransferId,
                });
                toast({ title: "تم التحويل بنجاح", description: `تم إنشاء إذن دخول معلق في الفرع المستلم.` });
                router.push('/inventory/goods-in-transit');
            } else {
                 toast({ title: "تم بنجاح", description: `تم تأكيد تحويل المخزون بنجاح برقم إيصال: ${record.receiptNumber}`});
                 router.push('/inventory/movements');
            }

        } catch(error) {
            toast({ variant: "destructive", title: "حدث خطأ", description: "فشل في حفظ إيصال التحويل. يرجى المحاولة مرة أخرى."});
            console.error("Failed to save stock transfer record:", error);
        }
    };
    
    const fromWarehouseOptions = useMemo(() => {
        return fromWarehouses.map((w: Warehouse) => ({ value: w.id, label: w.name }));
    }, [fromWarehouses]);

    const toWarehouseOptions = useMemo(() => {
        return toWarehouses.map((w: Warehouse) => ({ value: w.id, label: w.name }));
    }, [toWarehouses]);

    const branchOptions = useMemo(() => {
        return [{ value: 'all', label: 'كل الفروع المصرح بها' }, ...authorizedBranches.map(b => ({ value: b.id, label: b.name }))];
    }, [authorizedBranches]);

    const repOptions = useMemo(() => {
        return users
            .filter((u: any) => u.isSalesRep)
            .filter((u: any) => {
                const repWarehouse = warehouses.find((w: any) => w.repId === u.id);
                return repWarehouse && !repWarehouse.isClosed; // Only show reps with open warehouses
            })
            .map((u: any) => ({ value: u.id, label: u.name }));
    }, [users, warehouses]);


    return (
    <>
      <PageHeader title="إذن تحويل مخزني جديد" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 printable-area">
        <Card>
          <CardHeader>
            <CardTitle>إيصال تحويل مخزني</CardTitle>
            <div className="grid md:grid-cols-3 gap-4 text-sm text-muted-foreground">
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
                <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Source Selection */}
                    <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                        <h4 className="font-semibold text-primary border-b pb-2">جهة المصدر (المحول منه)</h4>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <Label>الفرع</Label>
                                <Combobox
                                    options={branchOptions}
                                    value={fromBranch}
                                    onValueChange={(v) => {
                                        setFromBranch(v);
                                        setFromSource('');
                                    }}
                                    placeholder="فلترة حسب الفرع..."
                                    disabled={authorizedBranches.length === 1}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>المخزن / القسم</Label>
                                <Combobox
                                    options={fromWarehouseOptions}
                                    value={fromSource}
                                    onValueChange={setFromSource}
                                    placeholder="اختر المخزن المصدر..."
                                    emptyMessage="لا يوجد مخازن لهذا الفرع."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Destination Selection */}
                    <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                        <h4 className="font-semibold text-primary border-b pb-2">جهة المستلم (المحول إليه)</h4>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <Label>الفرع / المندوب</Label>
                                <div className="flex gap-2">
                                    <Combobox
                                        options={branchOptions}
                                        value={toBranch}
                                        onValueChange={(v) => {
                                            setToBranch(v);
                                            setToSource('');
                                            setSelectedRepId('');
                                        }}
                                        placeholder="فلترة حسب الفرع..."
                                        disabled={!!selectedRepId}
                                    />
                                    <span className="self-center text-xs text-muted-foreground">أو</span>
                                    <Combobox
                                        options={repOptions}
                                        value={selectedRepId}
                                        onValueChange={(v) => {
                                            setSelectedRepId(v);
                                            setToSource('');
                                            setToBranch('all');
                                        }}
                                        placeholder="اختر مندوب..."
                                        emptyMessage="لا يوجد مناديب."
                                        disabled={toSource !== ''}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>المخزن المستلم</Label>
                                <Combobox
                                    options={toWarehouseOptions.filter(w => w.value !== fromSource)}
                                    value={toSource}
                                    onValueChange={(v) => {
                                        setToSource(v);
                                        setSelectedRepId('');
                                    }}
                                    placeholder="اختر المخزن المستلم..."
                                    emptyMessage="لا يوجد مخازن لهذا الفرع."
                                    disabled={!!selectedRepId}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                     <div className="space-y-2">
                        <Label htmlFor="date">تاريخ التحويل</Label>
                        <Input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                </div>
                
                <div>
                <Label>الأصناف المحولة</Label>
                 <div className="w-full overflow-auto border rounded-lg">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead className="w-[30%]">الصنف</TableHead>
                            <TableHead>الباركود</TableHead>
                            <TableHead className="text-center">الوحدة</TableHead>
                            <TableHead className="text-center">رصيد المصدر</TableHead>
                            <TableHead className="text-center">رصيد المستلم</TableHead>
                            <TableHead className="text-center">الكمية</TableHead>
                            <TableHead className="text-center w-[100px] no-print">الإجراء</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.uniqueId}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                <TableCell className="text-center">{item.unit}</TableCell>
                                <TableCell className="text-center">{item.sourceStock}</TableCell>
                                <TableCell className="text-center">{item.destinationStock}</TableCell>
                                <TableCell className="text-center">{item.qty}</TableCell>
                                <TableCell className="text-center no-print">
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.uniqueId)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        <TableRow className="no-print bg-muted/20">
                            <TableCell className="p-2">
                                <Combobox
                                    options={itemsForCombobox}
                                    value={newItem.id}
                                    onValueChange={handleItemSelect}
                                    placeholder={!fromSource ? "اختر فرع المصدر أولاً" : "اختر صنفًا..."}
                                    emptyMessage="لا توجد أصناف."
                                    disabled={!fromSource}
                                />
                            </TableCell>
                            <TableCell className="p-2 font-mono text-xs">{newItem.code}</TableCell>
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
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell className="p-2 w-24">
                                <Input type="number" placeholder="الكمية" value={newItem.qty} onChange={e => setNewItem({...newItem, qty: parseInt(e.target.value) || 1})} onFocus={e => e.target.select()} className="text-center" />
                            </TableCell>
                            <TableCell className="text-center p-2">
                                <Button onClick={handleAddItem} size="sm" disabled={!fromSource || !newItem.id || (!toSource && !selectedRepId)}>
                                    <PlusCircle className="ml-2 h-4 w-4" />
                                    إضافة
                                </Button>
                            </TableCell>
                        </TableRow>
                        </TableBody>
                         <TableFooter>
                            <TableRow>
                                <TableCell colSpan={4} className="font-bold">الإجمالي</TableCell>
                                <TableCell className="text-center font-bold">{items.reduce((sum, i) => sum + i.qty, 0)}</TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        </TableFooter>
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
            <Button size="lg" disabled={loading} onClick={handleConfirm}>
                <Save className="ml-2 h-4 w-4" />
                تأكيد التحويل
            </Button>
          </CardFooter>
        </Card>
      </main>
    </>
  );
}
