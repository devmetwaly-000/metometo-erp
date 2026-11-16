
"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Plus, CheckCircle2, Trash2, Loader2, Save, Truck, DollarSign, Info } from "lucide-react";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/auth-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

    // Transport & Handling Expenses State
    interface TransportExpenseItem {
        id: string;
        type: string;
        amount: number;
        paidFromAccountId: string;
        notes: string;
    }

    const [transportExpenses, setTransportExpenses] = useState<TransportExpenseItem[]>([
        { id: 'exp-1', type: 'نولون شحن ونقل', amount: 0, paidFromAccountId: '', notes: '' },
        { id: 'exp-2', type: 'مصاريف تحميل وتعتيق', amount: 0, paidFromAccountId: '', notes: '' },
        { id: 'exp-3', type: 'مصاريف تغليف وحزم', amount: 0, paidFromAccountId: '', notes: '' },
    ]);
    const [shippingTreatment, setShippingTreatment] = useState<'capitalized' | 'expense'>('capitalized');
    const [shippingPaidBy, setShippingPaidBy] = useState<'source' | 'destination' | 'central'>('source');
    const [carrierName, setCarrierName] = useState<string>("");
    const [trackingNumber, setTrackingNumber] = useState<string>("");

    const { 
        items: allItems,
        users, 
        warehouses, 
        inventoryZones,
        dbAction,
        getNextId,
        loading,
        settings,
        cashAccounts,
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

    const cashAccountOptions = useMemo(() => {
        return (cashAccounts || []).map((acc: any) => ({
            value: acc.id,
            label: `${acc.name} (${(Number(acc.currentBalance) || 0).toLocaleString()} ج.م)`
        }));
    }, [cashAccounts]);

    const handleAddExpense = (type = 'مصروف نقل إضافي') => {
        const defaultAcc = cashAccounts?.find((a: any) => a.warehouseId === fromSource)?.id || cashAccounts?.[0]?.id || '';
        setTransportExpenses(prev => [
            ...prev,
            { id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`, type, amount: 0, paidFromAccountId: defaultAcc, notes: '' }
        ]);
    };

    const handleRemoveExpense = (id: string) => {
        setTransportExpenses(prev => prev.filter(e => e.id !== id));
    };

    const handleExpenseChange = (id: string, field: keyof TransportExpenseItem, value: any) => {
        setTransportExpenses(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const totalExpenses = useMemo(() => {
        return transportExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    }, [transportExpenses]);

    const baseGoodsValue = useMemo(() => {
        return items.reduce((sum, item) => {
            const masterItem = (allItems || []).find((i: Item) => i.id === item.itemId);
            const unitCost = masterItem?.cost || item.cost || 0;
            return sum + (item.qty * item.conversionFactor * unitCost);
        }, 0);
    }, [items, allItems]);

    const totalTransferredValue = useMemo(() => {
        return baseGoodsValue + (shippingTreatment === 'capitalized' ? totalExpenses : 0);
    }, [baseGoodsValue, totalExpenses, shippingTreatment]);

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
        
        const numericShippingCost = totalExpenses;
        let createdExpenseId: string | null = null;

        const itemsToTransfer = items.map(item => {
            const masterItem = allItems.find((i: Item) => i.id === item.itemId);
            const baseCost = masterItem?.cost || item.cost || 0;
            const baseQty = item.qty * item.conversionFactor;
            const itemBaseValue = baseQty * baseCost;
            let allocatedShippingPerUnit = 0;

            if (numericShippingCost > 0 && shippingTreatment === 'capitalized') {
                if (baseGoodsValue > 0) {
                    const itemShareRatio = itemBaseValue / baseGoodsValue;
                    allocatedShippingPerUnit = (numericShippingCost * itemShareRatio) / (baseQty || 1);
                } else if (items.length > 0) {
                    const totalBaseUnits = items.reduce((sum, it) => sum + (it.qty * it.conversionFactor), 0);
                    allocatedShippingPerUnit = numericShippingCost / (totalBaseUnits || 1);
                }
            }

            const finalUnitCost = Number((baseCost + allocatedShippingPerUnit).toFixed(4));

            return {
                id: item.itemId,
                name: item.name,
                qty: baseQty,
                cost: finalUnitCost,
                originalCost: baseCost,
                shippingAllocPerUnit: Number(allocatedShippingPerUnit.toFixed(4)),
            };
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

        const transferReceiptNumber = `إذ-ت-${nextId}`;
        const fromWhObj = [...warehouses, ...inventoryZones].find((w: any) => w.id === fromSource);
        const toWhObj = [...warehouses, ...inventoryZones].find((w: any) => w.id === destination);

        // Record individual expense vouchers for each active expense item (نولون، تحميل، تغليف...)
        const validExpenses = transportExpenses.filter(e => (Number(e.amount) || 0) > 0);
        for (const exp of validExpenses) {
            const expAmount = Number(exp.amount) || 0;
            const expenseReceiptNum = `م-${await getNextId('expense')}`;
            const expenseType = exp.type || 'مصاريف نقل وشحن';
            const expDesc = `${expenseType} لإذن تحويل ${transferReceiptNumber} من ${fromWhObj?.name || 'مخزن المصدر'} إلى ${toWhObj?.name || 'المستلم'}${exp.notes ? ` (${exp.notes})` : ''}${carrierName ? ` - الناقل: ${carrierName}` : ''}${trackingNumber ? ` (بوليصة: ${trackingNumber})` : ''}`;

            const expenseWarehouseId = shippingPaidBy === 'destination' ? destination : fromSource;
            const expensePaidFromAccountId = exp.paidFromAccountId || cashAccounts?.find((a: any) => a.warehouseId === fromSource)?.id || cashAccounts?.[0]?.id || 'main-cash';

            const expensePayload = {
                receiptNumber: expenseReceiptNum,
                date: finalDate.toISOString(),
                expenseType: shippingTreatment === 'capitalized' ? `رسملة ${expenseType} على المخزون` : expenseType,
                description: expDesc,
                amount: expAmount,
                taxAmount: 0,
                warehouseId: expenseWarehouseId,
                paidFromAccountId: expensePaidFromAccountId,
                status: 'completed',
                createdById: user?.id,
                createdByName: user?.name,
            };
            try {
                const resExp = await dbAction('expenses', 'add', expensePayload);
                if (!createdExpenseId && typeof resExp === 'string') {
                    createdExpenseId = resExp;
                }
            } catch (expErr) {
                console.error("Failed to create shipping expense record:", expErr);
            }
        }

        const record = {
            fromSourceId: fromSource,
            toSourceId: destination,
            date: finalDate.toISOString(),
            items: itemsToTransfer,
            notes,
            receiptNumber: transferReceiptNumber,
            createdById: user?.id,
            createdByName: user?.name,
            shippingCost: numericShippingCost,
            expenses: validExpenses,
            shippingPaidBy,
            shippingPaidFromAccountId: validExpenses[0]?.paidFromAccountId || null,
            shippingTreatment,
            carrierName: carrierName.trim() || null,
            trackingNumber: trackingNumber.trim() || null,
            expenseId: createdExpenseId,
            totalGoodsValue: baseGoodsValue,
            totalTransferredValue: baseGoodsValue + (shippingTreatment === 'capitalized' ? numericShippingCost : 0),
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
                    notes: `وارد من إذن تحويل رقم ${record.receiptNumber} من ${fromWhObj?.name || ''}${numericShippingCost > 0 ? ` (مصاريف شحن: ${numericShippingCost} ج.م ${shippingTreatment === 'capitalized' ? 'مرسملة على الأصناف' : 'كمصروف تشغيلي'})` : ''}`,
                    receiptNumber: `إذ-د-${await getNextId('stockIn')}`,
                    createdById: user?.id,
                    createdByName: user?.name,
                    fromWarehouseId: fromSource,
                    stockTransferId: newTransferId,
                });
                toast({ title: "تم التحويل بنجاح", description: `تم إنشاء إذن تحويل مخزني ${numericShippingCost > 0 ? `مع قيد مصاريف الشحن (${numericShippingCost} ج.م)` : ''} وإذن دخول معلق في الفرع المستلم.` });
                router.push('/inventory/goods-in-transit');
            } else {
                 toast({ title: "تم بنجاح", description: `تم تأكيد تحويل المخزون بنجاح برقم إيصال: ${record.receiptNumber}${numericShippingCost > 0 ? ` ومصاريف الشحن (${numericShippingCost} ج.م)` : ''}`});
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

                {/* Shipping & Freight Management Section */}
                <div className="p-4 border rounded-lg bg-card shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-2 gap-2">
                        <div className="flex items-center gap-2">
                            <Truck className="h-5 w-5 text-primary" />
                            <h4 className="font-semibold text-base">مصاريف وبيانات الشحن والنقل</h4>
                        </div>
                        <span className="text-xs text-muted-foreground">معالجة تكاليف النقل والشحن المحاسبية والتكاليفية</span>
                    </div>

                    {/* Quick Add Buttons for Common Transport Expenses */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 p-2.5 rounded-lg border">
                        <div className="text-xs font-semibold text-muted-foreground">إضافة بنود المصاريف المباشرة على النقل:</div>
                        <div className="flex flex-wrap gap-1.5">
                            <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleAddExpense('نولون شحن ونقل')}>
                                <Plus className="h-3 w-3" /> نولون شحن ونقل
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleAddExpense('مصاريف تحميل وتعتيق')}>
                                <Plus className="h-3 w-3" /> مصاريف تحميل وتعتيق
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleAddExpense('مصاريف تغليف وحزم')}>
                                <Plus className="h-3 w-3" /> مصاريف تغليف وحزم
                            </Button>
                            <Button type="button" size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => handleAddExpense('مصروف نقل إضافي')}>
                                <Plus className="h-3 w-3" /> بند آخر...
                            </Button>
                        </div>
                    </div>

                    {/* Dynamic Transport Expenses Table */}
                    <div className="rounded-lg border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/60 text-xs">
                                    <TableHead className="text-right py-2">نوع المصروف (نولون / تحميل / تغليف...)</TableHead>
                                    <TableHead className="text-center py-2 w-36">المبلغ (ج.م)</TableHead>
                                    <TableHead className="text-right py-2 w-64">خزينة / وسيلة السداد</TableHead>
                                    <TableHead className="text-right py-2">ملاحظات / رقم الإيصال</TableHead>
                                    <TableHead className="text-center py-2 w-12"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transportExpenses.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-4 text-xs text-muted-foreground">
                                            لا توجد مصاريف مضافة على عملية النقل (تكلفة النقل 0.00 ج.م)
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    transportExpenses.map((exp) => (
                                        <TableRow key={exp.id} className="text-xs">
                                            <TableCell className="p-2">
                                                <Input
                                                    className="h-8 text-xs font-medium"
                                                    value={exp.type}
                                                    onChange={(e) => handleExpenseChange(exp.id, 'type', e.target.value)}
                                                    placeholder="نوع المصروف..."
                                                />
                                            </TableCell>
                                            <TableCell className="p-2">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    className="h-8 text-xs font-mono text-center font-bold"
                                                    value={exp.amount || ''}
                                                    placeholder="0.00"
                                                    onChange={(e) => handleExpenseChange(exp.id, 'amount', parseFloat(e.target.value) || 0)}
                                                />
                                            </TableCell>
                                            <TableCell className="p-2">
                                                <Select value={exp.paidFromAccountId} onValueChange={(val) => handleExpenseChange(exp.id, 'paidFromAccountId', val)}>
                                                    <SelectTrigger className="h-8 text-xs">
                                                        <SelectValue placeholder="اختر الخزينة..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {cashAccountOptions.map((acc: any) => (
                                                            <SelectItem key={acc.value} value={acc.value}>
                                                                {acc.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="p-2">
                                                <Input
                                                    className="h-8 text-xs"
                                                    value={exp.notes}
                                                    onChange={(e) => handleExpenseChange(exp.id, 'notes', e.target.value)}
                                                    placeholder="شرح إضافي / السائق..."
                                                />
                                            </TableCell>
                                            <TableCell className="p-2 text-center">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleRemoveExpense(exp.id)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                        {/* Accounting Treatment */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">طريقة المعالجة المحاسبية والتكاليفية</Label>
                            <Select value={shippingTreatment} onValueChange={(v: any) => setShippingTreatment(v)}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="اختر المعالجة..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="capitalized">رسملة وإضافة لتكلفة البضاعة المنقولة (Landed Cost)</SelectItem>
                                    <SelectItem value="expense">مصروف تشغيلي منفصل (دون التأثير على تكلفة الصنف)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Paid By Warehouse / Party */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">الجهة المتحملة لمصاريف النقل</Label>
                            <Select value={shippingPaidBy} onValueChange={(v: any) => setShippingPaidBy(v)}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="اختر جهة السداد..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="source">فرع المصدر (المحول منه)</SelectItem>
                                    <SelectItem value="destination">فرع المستلم (المحول إليه)</SelectItem>
                                    <SelectItem value="central">خزينة رئيسية / إدارة</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Carrier / Driver Name */}
                        <div className="space-y-1.5">
                            <Label htmlFor="carrierName" className="text-xs font-medium">شركة الشحن / اسم السائق</Label>
                            <Input
                                id="carrierName"
                                placeholder="مثال: شركة أرامكس / السائق محمد..."
                                value={carrierName}
                                onChange={(e) => setCarrierName(e.target.value)}
                                className="h-9 text-xs"
                            />
                        </div>

                        {/* Waybill / Tracking Number */}
                        <div className="space-y-1.5">
                            <Label htmlFor="trackingNumber" className="text-xs font-medium">رقم البوليصة / التتبع</Label>
                            <Input
                                id="trackingNumber"
                                placeholder="مثال: TRK-98421..."
                                value={trackingNumber}
                                onChange={(e) => setTrackingNumber(e.target.value)}
                                className="h-9 text-xs font-mono"
                            />
                        </div>
                    </div>

                    {/* Landed Calculation Summary Card */}
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-primary/10 pb-3">
                            <div>
                                <h5 className="font-bold text-sm text-primary flex items-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4" /> ملخص تكوين إجمالي قيمة البضاعة المنقولة الواصلة
                                </h5>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {shippingTreatment === 'capitalized'
                                        ? 'يتم توزيع إجمالي المصاريف بالتناسب على الأصناف لرسملتها وتحديد التكلفة الواصلة لكل صنف بدقة.'
                                        : 'يتم إثبات المصاريف كمصروفات تشغيلية دون رسملتها على تكلفة الصنف.'}
                                </p>
                            </div>
                            <div className="text-left font-mono">
                                <span className="text-xs text-muted-foreground block">إجمالي القيمة المنقولة الواصلة</span>
                                <span className="text-xl font-bold text-primary">{totalTransferredValue.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div className="p-2.5 rounded bg-background border flex justify-between items-center">
                                <span className="text-muted-foreground">قيمة البضاعة الأساسية:</span>
                                <span className="font-mono font-bold">{baseGoodsValue.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</span>
                            </div>
                            <div className="p-2.5 rounded bg-background border flex justify-between items-center">
                                <span className="text-muted-foreground">إجمالي المصاريف المضافة:</span>
                                <span className="font-mono font-bold text-foreground">+ {totalExpenses.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</span>
                            </div>
                            <div className="p-2.5 rounded bg-primary/10 border border-primary/30 flex justify-between items-center font-bold">
                                <span className="text-primary">إجمالي القيمة الواصلة:</span>
                                <span className="font-mono text-primary text-sm">{totalTransferredValue.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</span>
                            </div>
                        </div>
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
