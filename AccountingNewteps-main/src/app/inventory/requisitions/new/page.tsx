
"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, PlusCircle, Save, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";

interface RequisitionItem {
  itemId: string;
  name: string;
  code?: string;
  unit: string;
  quantity: number;
  uniqueId: string;
  requesterStock: number; // Stock in the requesting warehouse
  sourceStock: number; // Stock in the source warehouse
}

interface NewItemState {
    itemId: string;
    quantity: number;
    sourceStock: number;
    requesterStock: number;
}


export default function NewRequisitionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const { 
      warehouses, 
      inventoryZones,
      items: allItems, 
      dbAction, 
      getNextId,
      loading,
      // Add all data slices needed for stock calculation
      inventoryClosings,
      stockInRecords,
      salesInvoices,
      posSales,
      stockOutRecords,
      stockTransferRecords,
      stockAdjustmentRecords,
      salesReturns,
      posReturns,
      purchaseReturns,
      stockIssuesToReps,
      stockReturnsFromReps,
  } = useData();

  const [fromWarehouseId, setFromWarehouseId] = useState(''); // The source of items
  const [requestingWarehouseId, setRequestingWarehouseId] = useState(''); // The destination
  const [items, setItems] = useState<RequisitionItem[]>([]);
  const [newItem, setNewItem] = useState<NewItemState>({ itemId: '', quantity: 1, sourceStock: 0, requesterStock: 0 });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Auto-select warehouse if the user is assigned to one
    if (user?.warehouseIds && user.warehouseIds.length === 1 && user.warehouseIds[0] !== 'all') {
      setRequestingWarehouseId(user.warehouseIds[0]);
    }
  }, [user]);

  const allWarehouses = useMemo(() => [...warehouses, ...inventoryZones], [warehouses, inventoryZones]);
  const warehouseOptions = useMemo(() => {
      const options = allWarehouses.map((w: any) => ({ value: w.id, label: w.name }));
      if (user?.warehouseIds?.includes('all')) return options;
      return options.filter((w: any) => user?.warehouseIds?.includes(w.value));
  }, [allWarehouses, user]);

  const calculateStock = useCallback((itemId: string, warehouseId: string): number => {
    if (!itemId || !warehouseId) return 0;

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
  }, [inventoryClosings, stockInRecords, salesInvoices, posSales, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, salesReturns, posReturns, purchaseReturns, stockIssuesToReps, stockReturnsFromReps]);


  // When the source warehouse changes, re-calculate stock for all items already in the list
  useEffect(() => {
    if (items.length > 0 && fromWarehouseId) {
        setItems(prevItems => 
            prevItems.map(item => ({
                ...item,
                sourceStock: calculateStock(item.itemId, fromWarehouseId)
            }))
        );
    }
    // Also reset the new item form's stock display if an item is selected
    if (newItem.itemId) {
        setNewItem(prev => ({
            ...prev,
            sourceStock: calculateStock(prev.itemId, fromWarehouseId),
        }));
    }
  }, [fromWarehouseId, calculateStock, items.length, newItem.itemId]); 


  const availableItemsForCombobox = useMemo(() => {
    return allItems
        .filter((item: any) => !item.isDisabled && item.itemType !== 'manufactured')
        .map((item: any) => ({
            value: item.id,
            label: `${item.name} (${item.code || 'N/A'})`
        }));
  }, [allItems]);


  const handleAddItem = () => {
    if (!newItem.itemId || newItem.quantity <= 0) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'يرجى اختيار صنف وكمية صحيحة.' });
      return;
    }
    const existingItem = items.find(i => i.itemId === newItem.itemId);
    if (existingItem) {
      toast({ variant: 'destructive', title: 'صنف مكرر', description: 'هذا الصنف موجود بالفعل في الطلب.' });
      return;
    }
    const itemDetails = allItems.find((i: any) => i.id === newItem.itemId);
    if (!itemDetails) return;
    
    setItems(prev => [
      ...prev,
      {
        itemId: newItem.itemId,
        name: itemDetails.name,
        code: itemDetails.code,
        unit: itemDetails.baseUnit || itemDetails.unit,
        quantity: newItem.quantity,
        uniqueId: `${newItem.itemId}-${Date.now()}`,
        requesterStock: newItem.requesterStock,
        sourceStock: newItem.sourceStock,
      }
    ]);
    setNewItem({ itemId: '', quantity: 1, sourceStock: 0, requesterStock: 0 });
  };

  const handleRemoveItem = (uniqueId: string) => {
    setItems(prev => prev.filter(item => item.uniqueId !== uniqueId));
  };
  
  const handleItemSelect = (value: string) => {
    if (value) {
        const sourceStock = calculateStock(value, fromWarehouseId);
        const requesterStock = calculateStock(value, requestingWarehouseId);
        setNewItem(prev => ({...prev, itemId: value, sourceStock, requesterStock}));
    } else {
        setNewItem({ itemId: '', quantity: 1, sourceStock: 0, requesterStock: 0 });
    }
  };
  
  const handleSaveRequisition = async () => {
    if (!requestingWarehouseId || !fromWarehouseId || items.length === 0) {
        toast({ variant: 'destructive', title: 'بيانات ناقصة', description: 'يجب تحديد الفرع الطالب والمخزن المصدر وإضافة صنف واحد على الأقل.' });
        return;
    }
    setIsSaving(true);
    try {
        const nextId = await getNextId('requisition', 1001);
        if (!nextId) throw new Error("Failed to generate requisition number");
        
        const requisitionData = {
            requisitionNumber: `REQ-${nextId}`,
            fromWarehouseId: requestingWarehouseId, // The one asking
            toWarehouseId: fromWarehouseId, // The one being asked from
            requesterId: user?.id,
            requesterName: user?.name,
            date: new Date().toISOString(),
            status: 'pending',
            items: items.map(({ itemId, name, quantity }) => ({ itemId, name, quantity })),
        };
        await dbAction('requisitions', 'add', requisitionData);
        toast({ title: 'تم إرسال الطلب بنجاح', description: `تم حفظ الطلب برقم ${requisitionData.requisitionNumber}` });
        router.push('/inventory/requisitions');
    } catch(error) {
        toast({ variant: 'destructive', title: 'خطأ', description: 'فشل إرسال الطلب.' });
    } finally {
        setIsSaving(false);
    }
  };


  return (
    <>
      <PageHeader title="إنشاء طلب بضاعة جديد" />
      <main className="flex-1 p-4 md:p-6">
        <Card className="max-w-7xl mx-auto">
          <CardHeader>
            <CardTitle>طلب بضاعة</CardTitle>
            <CardDescription>
              استخدم هذه الشاشة لطلب الأصناف من الفروع أو المخازن الرئيسية الأخرى.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="requester-warehouse">الفرع الطالب</Label>
                     <Combobox
                        options={warehouseOptions}
                        value={requestingWarehouseId}
                        onValueChange={setRequestingWarehouseId}
                        placeholder="اختر الفرع الطالب..."
                        emptyMessage="لا يوجد فروع"
                        disabled={!!(user?.warehouseIds && user.warehouseIds.length === 1 && user.warehouseIds[0] !== 'all')}
                    />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="source-warehouse">الطلب من المخزن/الفرع</Label>
                    <Combobox
                        options={warehouseOptions.filter(w => w.value !== requestingWarehouseId)}
                        value={fromWarehouseId}
                        onValueChange={setFromWarehouseId}
                        placeholder="اختر المخزن المصدر..."
                        emptyMessage="لا يوجد مخازن"
                    />
                </div>
            </div>
            
            <div>
              <Label>الأصناف المطلوبة</Label>
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-1/3">الصنف</TableHead>
                            <TableHead>الباركود</TableHead>
                            <TableHead className="text-center">الوحدة</TableHead>
                            <TableHead className="text-center">رصيد المصدر</TableHead>
                            <TableHead className="text-center">رصيدك الحالي</TableHead>
                            <TableHead className="text-center">الكمية المطلوبة</TableHead>
                            <TableHead className="text-center w-20">إجراء</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map(item => (
                            <TableRow key={item.uniqueId}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="font-mono">{item.code}</TableCell>
                                <TableCell className="text-center">{item.unit}</TableCell>
                                <TableCell className="text-center">{item.sourceStock}</TableCell>
                                <TableCell className="text-center text-muted-foreground">{item.requesterStock}</TableCell>
                                <TableCell className="text-center">{item.quantity}</TableCell>
                                <TableCell className="text-center">
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.uniqueId)}>
                                        <Trash2 className="h-4 w-4 text-destructive"/>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                         <TableRow className="no-print bg-muted/50">
                            <TableCell className="p-2" colSpan={3}>
                                <Combobox
                                    options={availableItemsForCombobox}
                                    value={newItem.itemId}
                                    onValueChange={handleItemSelect}
                                    placeholder={!fromWarehouseId ? "اختر مخزن المصدر أولاً" : "ابحث عن صنف بالاسم أو الباركود..."}
                                    emptyMessage="لم يتم العثور على الصنف."
                                    disabled={!fromWarehouseId}
                                />
                            </TableCell>
                            <TableCell className="text-center font-semibold">{newItem.itemId ? newItem.sourceStock : '-'}</TableCell>
                            <TableCell className="text-center font-semibold text-muted-foreground">{newItem.itemId ? newItem.requesterStock : '-'}</TableCell>
                             <TableCell className="p-2">
                                <Input type="number" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: Number(e.target.value)})} min="1" className="text-center"/>
                            </TableCell>
                            <TableCell className="p-2 text-center">
                                <Button size="sm" onClick={handleAddItem} disabled={!newItem.itemId}>
                                    <PlusCircle className="ml-2 h-4 w-4"/>
                                    إضافة
                                </Button>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
             <Button size="lg" disabled={isSaving || loading} onClick={handleSaveRequisition}>
                {isSaving ? <Loader2 className="animate-spin ml-2 h-4 w-4"/> : <Save className="ml-2 h-4 w-4"/>}
                إرسال الطلب
             </Button>
          </CardFooter>
        </Card>
      </main>
    </>
  );
}

    