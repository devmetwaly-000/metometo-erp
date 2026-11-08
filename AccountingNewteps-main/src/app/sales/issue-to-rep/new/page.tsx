

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
import { calculateStockForItemInWarehouse } from "@/lib/inventory-utils";


interface IssueItem {
  id: string; 
  itemId: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
  total: number;
  unit: string;
  baseUnit: string;
  conversionFactor: number;
  code?: string;
  sourceStock?: number;
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
    warehouseIds?: string[];
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

export default function IssueToRepPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    const allDataContext = useData();
    const { 
        items: allItems,
        users, 
        warehouses, 
        dbAction, 
        getNextId,
        loading,
        settings,
     } = allDataContext;

    const [items, setItems] = useState<IssueItem[]>([]);
    const [newItem, setNewItem] = useState<{ id: string; qty: number; price: number; }>({ id: "", qty: 1, price: 0 });
    const [selectedUnit, setSelectedUnit] = useState('base');
    const [availableUnits, setAvailableUnits] = useState<SecondaryUnitOption[]>([]);
    const [selectedRepId, setSelectedRepId] = useState<string>("");
    const [warehouseId, setWarehouseId] = useState<string>(""); // Source warehouse
    const [notes, setNotes] = useState<string>("");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [isSaving, setIsSaving] = useState(false);

    const reps = useMemo(() => users.filter((u: User) => u.isSalesRep), [users]);
    const warehouseOptions = useMemo(() => warehouses.map((w: Warehouse) => ({ value: w.id, label: w.name })), [warehouses]);
    const repOptions = useMemo(() => reps.map((r: User) => ({ value: r.id, label: r.name })), [reps]);
    
    
    const availableItemsWithStock = useMemo(() => {
        if (!warehouseId || warehouseId === "all" || !allItems.length) return [];
        const allowNegativeStock = settings?.main?.financial?.allowNegativeStock || false;

        return allItems
            .filter((item: any) => item.itemType !== 'manufactured')
            .map((item: any) => ({
                ...item,
                stock: calculateStockForItemInWarehouse(item.id, warehouseId, allDataContext)
            })).filter((item: any) => item.stock > 0 || allowNegativeStock);
    }, [warehouseId, allItems, settings, allDataContext]);


    const itemsForCombobox = useMemo(() => {
        return availableItemsWithStock.map((item: Item) => ({ 
            value: item.id, 
            label: `${item.name} (${item.code || 'N/A'}) (المتاح: ${item.stock})` 
        }));
    }, [availableItemsWithStock]);
    
    const { totalValue, totalQty } = useMemo(() => {
        return items.reduce((acc, item) => {
            acc.totalValue += item.total;
            acc.totalQty += item.qty;
            return acc;
        }, { totalValue: 0, totalQty: 0 });
    }, [items]);

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
                qty: 1,
                price: selectedItem.price || 0,
            });
        }
    };
    
    const handleUnitChange = (unitName: string) => {
        setSelectedUnit(unitName);
        const unit = availableUnits.find(u => u.value === unitName);
        const item = allItems.find((i: Item) => i.id === newItem.id);
        if (unit && item) {
             setNewItem(prev => ({...prev, price: unit.price || (item.price || 0) * unit.factor}));
        }
    };

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
            toast({ variant: "destructive", title: "كمية غير متوفرة", description: `الرصيد المتاح هو ${selectedItem.stock || 0} فقط.`});
            return;
        }

        const itemCost = (selectedItem.cost || 0) * selectedUnitInfo.factor;

        setItems(prev => [...prev, { 
            id: `${selectedItem.id}-${Date.now()}`,
            itemId: selectedItem.id,
            name: selectedItem.name,
            qty: newItem.qty,
            price: newItem.price,
            cost: itemCost,
            total: newItem.qty * newItem.price,
            unit: selectedUnitInfo.label,
            baseUnit: selectedItem.baseUnit,
            conversionFactor: selectedUnitInfo.factor,
            code: selectedItem.code,
            sourceStock: selectedItem.stock,
            uniqueId: `${selectedItem.id}-${Date.now()}-${Math.random()}`
        }]);
        setNewItem({ id: "", qty: 1, price: 0 });
        setSelectedUnit('base');
        setAvailableUnits([]);
    };

    const handleRemoveItem = (uniqueId: string) => {
        setItems(items.filter((item) => item.uniqueId !== uniqueId));
    };

    const handleConfirm = async () => {
        if (!selectedRepId || !warehouseId || items.length === 0) {
            toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "يرجى اختيار المندوب والمخزن المصدر وإضافة صنف واحد على الأقل." });
            return;
        }
        
        const rep = reps.find((r: User) => r.id === selectedRepId);
        if (!rep) {
             toast({ variant: "destructive", title: "خطأ", description: "المندوب المحدد غير موجود." });
            return;
        }
        
        setIsSaving(true);
        const receiptNumber = `ص-م-${await getNextId('stockIssuesToReps')}`;

        try {
            // Only create one record: stockIssuesToReps. The item-ledger will treat this as an 'out' record.
            await dbAction('stockIssuesToReps', 'add', {
                salesRepId: selectedRepId,
                warehouseId: warehouseId,
                date: new Date().toISOString(), // Use current timestamp for accuracy
                items: items.map(item => ({
                    id: item.itemId, name: item.name, qty: item.qty * item.conversionFactor, 
                    price: item.price / item.conversionFactor, cost: item.cost / item.conversionFactor, total: item.total
                })),
                notes,
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            });

            toast({ title: "تم بنجاح", description: `تم حفظ إذن الصرف للمندوب برقم: ${receiptNumber}` });
            router.push('/sales/issue-to-rep/list');
        } catch(error) {
             toast({ variant: "destructive", title: "حدث خطأ", description: "فشل في حفظ إذن الصرف." });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <PageHeader title="صرف بضاعة لمندوب" />
            <main className="flex-1 p-4 md:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>إذن صرف بضاعة</CardTitle>
                        <CardDescription>
                            تسجيل البضاعة المصروفة من المخزن إلى عهدة المندوب.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {loading ? <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                            <>
                                <div className="grid md:grid-cols-3 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="rep">مندوب المبيعات</Label>
                                        <Combobox options={repOptions} value={selectedRepId} onValueChange={setSelectedRepId} placeholder="اختر المندوب..." emptyMessage="لا يوجد مناديب." />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>من مخزن</Label>
                                         <Combobox
                                            options={warehouseOptions}
                                            value={warehouseId}
                                            onValueChange={setWarehouseId}
                                            placeholder="اختر المخزن..."
                                            emptyMessage="لا توجد مخازن."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="date">تاريخ الصرف</Label>
                                        <Input type="date" id="date" value={date} readOnly disabled className="bg-muted"/>
                                    </div>
                                </div>
                                
                                <div>
                                    <Label>الأصناف المصروفة</Label>
                                    <div className="w-full overflow-auto border rounded-lg">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[30%]">الصنف</TableHead>
                                                    <TableHead>الباركود</TableHead>
                                                    <TableHead className="text-center">رصيد المصدر</TableHead>
                                                    <TableHead className="text-center w-40">الوحدة</TableHead>
                                                    <TableHead className="text-center w-24">الكمية</TableHead>
                                                    <TableHead className="text-center w-32">سعر البيع</TableHead>
                                                    <TableHead className="text-center w-32">الإجمالي</TableHead>
                                                    <TableHead className="text-center w-16">الإجراء</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {items.map((item) => (
                                                    <TableRow key={item.uniqueId}>
                                                        <TableCell>{item.name}</TableCell>
                                                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                        <TableCell className="text-center">{item.sourceStock}</TableCell>
                                                        <TableCell className="text-center">{item.unit}</TableCell>
                                                        <TableCell className="text-center">{item.qty}</TableCell>
                                                        <TableCell className="text-center">{item.price.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center font-semibold">{item.total.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center">
                                                            <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.uniqueId)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                                <TableRow className="no-print bg-muted/20">
                                                    <TableCell className="p-2" colSpan={2}>
                                                        <Combobox options={itemsForCombobox} value={newItem.id} onValueChange={handleItemSelect} placeholder={!warehouseId ? "اختر مخزنًا أولاً" : "اختر صنفًا..."} emptyMessage="لا توجد أصناف." disabled={!warehouseId} />
                                                    </TableCell>
                                                    <TableCell></TableCell>
                                                    <TableCell className="p-2 w-40">
                                                        <Combobox options={availableUnits} value={selectedUnit} onValueChange={handleUnitChange} placeholder="اختر وحدة..." emptyMessage="اختر صنفًا أولاً" disabled={!newItem.id} />
                                                    </TableCell>
                                                    <TableCell className="p-2 w-24">
                                                        <Input type="number" placeholder="الكمية" value={newItem.qty} onChange={e => setNewItem({...newItem, qty: parseInt(e.target.value) || 1})} onFocus={e => e.target.select()} className="text-center" />
                                                    </TableCell>
                                                    <TableCell className="p-2 w-32">
                                                        <Input type="number" placeholder="السعر" value={newItem.price} onChange={e => setNewItem({...newItem, price: parseFloat(e.target.value) || 0})} onFocus={e => e.target.select()} className="text-center" />
                                                    </TableCell>
                                                    <TableCell></TableCell>
                                                    <TableCell className="text-center"><Button onClick={handleAddItem} size="sm" disabled={!newItem.id || !selectedRepId}><PlusCircle className="ml-2 h-4 w-4" />إضافة</Button></TableCell>
                                                </TableRow>
                                            </TableBody>
                                            <TableFooter>
                                                <TableRow><TableCell colSpan={6} className="font-bold">الإجمالي</TableCell><TableCell className="text-center font-bold">{totalValue.toLocaleString()}</TableCell><TableCell/></TableRow>
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
                    <CardFooter className="flex justify-end">
                        <Button size="lg" disabled={loading || isSaving} onClick={handleConfirm}>
                            {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                            {isSaving ? 'جارٍ الحفظ...' : 'تأكيد الصرف'}
                        </Button>
                    </CardFooter>
                </Card>
            </main>
        </>
    );
}


