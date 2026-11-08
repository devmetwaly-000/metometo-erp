

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
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { Combobox } from "@/components/ui/combobox";

interface ReturnItem {
  id: string; // The database ID of the item
  name: string;
  qty: number;
  unit: string;
  uniqueId: string; // A unique ID for the list key
}

interface Item {
    id: string;
    name: string;
    unit: string;
    code?: string;
}

interface User {
    id: string;
    name: string;
    warehouse: string;
    isSalesRep?: boolean;
}

export default function ReturnFromRepPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    const [items, setItems] = useState<ReturnItem[]>([]);
    const [newItem, setNewItem] = useState({ id: "", qty: 1 });
    const [selectedRep, setSelectedRep] = useState<string>("");
    const [notes, setNotes] = useState<string>("");
    
    const { items: availableItems, users, warehouses, dbAction, getNextId, loading } = useData();

    const reps = useMemo(() => {
        return users.filter((u: any) => u.isSalesRep || u.role === 'مندوب' || (u.role && u.role.includes('مندوب')));
    }, [users]);

    const itemsForCombobox = useMemo(() => {
        return availableItems.map((item: any) => ({ 
            value: item.id, 
            label: `${item.name} (${item.code || 'N/A'})` 
        }));
    }, [availableItems]);

    const handleAddItem = () => {
        if (!newItem.id || newItem.qty <= 0) {
            toast({ variant: "destructive", title: "خطأ", description: "يرجى اختيار صنف وكمية صالحة."});
            return;
        }
        const selectedItem: Item | undefined = availableItems.find((i: any) => i.id === newItem.id);
        if (!selectedItem) return;

        setItems(prev => [...prev, { 
            id: selectedItem.id,
            name: selectedItem.name,
            qty: newItem.qty,
            unit: selectedItem.unit,
            uniqueId: `${selectedItem.id}-${Date.now()}`
        }]);
        setNewItem({ id: "", qty: 1 });
    };

    const handleRemoveItem = (uniqueId: string) => {
        setItems(items.filter((item) => item.uniqueId !== uniqueId));
    };

    const handleConfirm = async () => {
        if (!selectedRep || items.length === 0) {
            toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "يرجى اختيار المندوب وإضافة صنف واحد على الأقل." });
            return;
        }
        
        const rep = reps.find((r: any) => r.id === selectedRep);
        if (!rep) return;

        try {
            const nextCounter = await getNextId('stockReturnFromRep');
            const receiptNumber = `م-م-${nextCounter}`;

            const record = {
                receiptNumber,
                salesRepId: selectedRep,
                salesRepName: rep.name,
                warehouseId: (rep.warehouseIds && rep.warehouseIds[0]) || rep.warehouse || warehouses[0]?.id,
                date: new Date().toISOString(),
                items: items.map(({id, name, qty}) => ({id, name, qty})),
                createdById: user?.id || null,
                createdByName: user?.name || null,
                notes,
            };

            await dbAction('stockReturnsFromReps', 'add', record);
            toast({ title: "تم بنجاح", description: `تم تسجيل مرتجع البضاعة برقم ${receiptNumber}.` });
            router.push('/sales/rep-operations');
        } catch(error: any) {
             toast({ variant: "destructive", title: "حدث خطأ", description: error?.message || "فشل في حفظ حركة المرتجع." });
        }
    };

  return (
    <>
      <PageHeader title="مرتجع بضاعة من مندوب" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>إذن مرتجع بضاعة</CardTitle>
            <CardDescription>
                استخدم هذه الشاشة لتسجيل البضاعة المتبقية مع المندوب وإعادتها إلى المخزن الرئيسي.
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
                            <Label>إلى مخزن</Label>
                            <Input value={users.find((u: any) => u.id === selectedRep)?.name || 'اختر مندوبًا أولاً'} readOnly disabled />
                         </div>
                    </div>
                    
                    <div>
                      <Label>الأصناف المرتجعة</Label>
                      <div className="w-full overflow-auto border rounded-lg">
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
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="text-center">{item.unit}</TableCell>
                                <TableCell className="text-center">{item.qty}</TableCell>
                                <TableCell className="text-center">
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.uniqueId)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                                </TableRow>
                            ))}
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
                                <TableCell></TableCell>
                                <TableCell className="p-2">
                                    <Input type="number" placeholder="الكمية" value={newItem.qty} onChange={e => setNewItem({...newItem, qty: parseInt(e.target.value) || 1})} />
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
                        <Label htmlFor="notes">ملاحظات</Label>
                        <Textarea id="notes" placeholder="أضف أي ملاحظات هنا..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                </>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button size="lg" disabled={loading} onClick={handleConfirm}>
                <Save className="ml-2 h-4 w-4" />
                تأكيد الاستلام
            </Button>
          </CardFooter>
        </Card>
      </main>
    </>
  );
}
