"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, Loader2, Save } from "lucide-react";
import React, { useState, useMemo } from "react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/auth-context";

interface ReturnItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  uniqueId: string;
}

export default function ReturnFromRepPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    const [items, setItems] = useState<ReturnItem[]>([]);
    const [newItem, setNewItem] = useState({ id: "", qty: 1 });
    const [selectedRep, setSelectedRep] = useState<string>("");
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
    const [notes, setNotes] = useState<string>("");
    const [isSaving, setIsSaving] = useState(false);
    
    const { 
        items: availableItems, 
        users, 
        warehouses, 
        dbAction, 
        getNextId, 
        loading 
    } = useData();

    const reps = useMemo(() => {
        return users.filter((u: any) => u.isSalesRep || u.role === 'مندوب' || (u.role && u.role.includes('مندوب')));
    }, [users]);

    // Default to first warehouse
    React.useEffect(() => {
        if (!selectedWarehouseId && warehouses.length > 0) {
            setSelectedWarehouseId(warehouses[0].id);
        }
    }, [warehouses, selectedWarehouseId]);

    const itemsForCombobox = useMemo(() => {
        return (availableItems || []).map((item: any) => ({ 
            value: item.id, 
            label: `${item.name} (${item.code || 'N/A'})` 
        }));
    }, [availableItems]);

    const handleAddItem = () => {
        if (!newItem.id || newItem.qty <= 0) {
            toast({ variant: "destructive", title: "خطأ", description: "يرجى اختيار صنف وكمية صالحة."});
            return;
        }
        const selectedItem = (availableItems || []).find((i: any) => i.id === newItem.id);
        if (!selectedItem) return;

        setItems(prev => [...prev, { 
            id: selectedItem.id,
            name: selectedItem.name,
            qty: newItem.qty,
            unit: selectedItem.baseUnit || selectedItem.unit || 'قطعة',
            uniqueId: `${selectedItem.id}-${Date.now()}`
        }]);
        setNewItem({ id: "", qty: 1 });
    };

    const handleRemoveItem = (uniqueId: string) => {
        setItems(items.filter((item) => item.uniqueId !== uniqueId));
    };

    const handleConfirm = async () => {
        if (!selectedRep || !selectedWarehouseId || items.length === 0) {
            toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "يرجى اختيار المندوب والمخزن وإضافة صنف واحد على الأقل." });
            return;
        }
        
        const rep = reps.find((r: any) => r.id === selectedRep);
        if (!rep) return;

        setIsSaving(true);
        try {
            const nextCounter = await getNextId('stockReturnFromRep');
            const receiptNumber = `م-م-${nextCounter}`;

            const record = {
                receiptNumber,
                salesRepId: selectedRep,
                salesRepName: rep.name,
                warehouseId: selectedWarehouseId,
                date: new Date().toISOString(),
                items: items.map(({ id, name, qty }) => ({ id, name, qty })),
                createdById: user?.id || null,
                createdByName: user?.name || null,
                notes,
            };

            await dbAction('stockReturnsFromReps', 'add', record);
            toast({ title: "تم بنجاح", description: `تم حفظ مستند مرتجع البضاعة برقم ${receiptNumber}.` });
            router.push('/sales/rep-operations');
        } catch(error: any) {
            toast({ variant: "destructive", title: "حدث خطأ", description: error?.message || "فشل في حفظ حركة المرتجع." });
        } finally {
            setIsSaving(false);
        }
    };

    return (
    <>
      <PageHeader title="مرتجع بضاعة من مندوب" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>إذن استلام مرتجع بضاعة من مندوب</CardTitle>
            <CardDescription>
                مبدأ المستندات: يتم تسجيل حركة إرجاع عهدة البضاعة من المندوب وإضافتها إلى رصيد المخزن المحدد مع إصدار رقم مستند رسمي.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
                 <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
                <>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="rep">مندوب المبيعات</Label>
                            <Select value={selectedRep} onValueChange={setSelectedRep}>
                                <SelectTrigger id="rep"><SelectValue placeholder="اختر المندوب" /></SelectTrigger>
                                <SelectContent>
                                   {reps.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="warehouse">المخزن المستلم (الفرع)</Label>
                            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                                <SelectTrigger id="warehouse"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                                <SelectContent>
                                   {(warehouses || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    
                    <div>
                      <Label className="text-base font-semibold">الأصناف المرتجعة</Label>
                      <div className="w-full overflow-auto border rounded-lg mt-2">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50%]">الصنف</TableHead>
                                    <TableHead className="text-center">الوحدة</TableHead>
                                    <TableHead className="text-center">الكمية</TableHead>
                                    <TableHead className="text-center w-[100px]">الإجراء</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {items.map((item) => (
                                <TableRow key={item.uniqueId}>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell className="text-center">{item.unit}</TableCell>
                                <TableCell className="text-center font-bold">{item.qty}</TableCell>
                                <TableCell className="text-center">
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.uniqueId)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                                </TableRow>
                            ))}
                            {items.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                                        لم يتم إضافة أي صنف بعد.
                                    </TableCell>
                                </TableRow>
                            )}
                            <TableRow className="bg-muted/30">
                                <TableCell className="p-2">
                                    <Combobox
                                        options={itemsForCombobox}
                                        value={newItem.id}
                                        onValueChange={(value: any) => setNewItem({ ...newItem, id: value })}
                                        placeholder="ابحث عن صنف..."
                                        emptyMessage="لم يتم العثور على الصنف."
                                    />
                                </TableCell>
                                <TableCell className="text-center text-sm text-muted-foreground">-</TableCell>
                                <TableCell className="p-2">
                                    <Input 
                                        type="number" 
                                        min="1" 
                                        placeholder="الكمية" 
                                        value={newItem.qty} 
                                        onChange={e => setNewItem({...newItem, qty: Math.max(1, parseInt(e.target.value) || 1)})} 
                                    />
                                </TableCell>
                                <TableCell className="text-center">
                                    <Button onClick={handleAddItem} size="sm">
                                        <PlusCircle className="ml-2 h-4 w-4" />
                                        إضافة
                                    </Button>
                                </TableCell>
                            </TableRow>
                            </TableBody>
                        </Table>
                      </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notes">ملاحظات المستند</Label>
                        <Textarea id="notes" placeholder="أضف أي ملاحظات أو أسباب الإرجاع هنا..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                </>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button size="lg" disabled={loading || isSaving || items.length === 0} onClick={handleConfirm}>
                {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                تأكيد وحفظ إذن المرتجع
            </Button>
          </CardFooter>
        </Card>
      </main>
    </>
  );
}
