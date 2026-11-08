"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, Loader2, Save } from "lucide-react";
import React, { useState, useMemo } from "react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/auth-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';


interface OrderItem {
  id: string; 
  itemId: string; 
  name: string;
  unit: string;
  qty: number;
  cost: number;
  total: number;
  code?: string;
}

const QuickAddDialog = ({ open, onOpenChange, onConfirm, title, label }: { open: boolean, onOpenChange: (open: boolean) => void, onConfirm: (name: string) => void, title: string, label: string }) => {
    const [name, setName] = useState('');

    const handleConfirm = () => {
        if (name) {
            onConfirm(name);
            setName('');
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="quick-add-name">{label}</Label>
                        <Input 
                            id="quick-add-name" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleConfirm();
                                }
                            }}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
                    <Button onClick={handleConfirm}>حفظ</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default function NewPurchaseOrderPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    const [items, setItems] = useState<OrderItem[]>([]);
    const [newItem, setNewItem] = useState({ id: "", qty: 1, cost: 0 });
    const [total, setTotal] = useState(0);
    const [supplierId, setSupplierId] = useState("");
    const [notes, setNotes] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isQuickSupplierOpen, setIsQuickSupplierOpen] = useState(false);
    
    const { items: allItems, suppliers, dbAction, getNextId, loading } = useData();

    const itemsForCombobox = useMemo(() => {
        return allItems.map((item: any) => ({ 
            value: item.id, 
            label: `${item.name} (${item.code || 'N/A'})` 
        }));
    }, [allItems]);

    const suppliersForCombobox = useMemo(() => {
        return suppliers.map((s: any) => ({ value: s.id, label: s.name }));
    }, [suppliers]);

    React.useEffect(() => {
        const newTotal = items.reduce((acc, item) => acc + item.total, 0);
        setTotal(newTotal);
    }, [items]);

    const handleAddItem = () => {
        if (!newItem.id || newItem.qty <= 0 || newItem.cost < 0) return;
        const selectedItem = allItems.find((i: any) => i.id === newItem.id);
        if (!selectedItem) return;

        setItems(prev => [
            ...prev,
            {
                id: `${selectedItem.id}-${Date.now()}`,
                itemId: selectedItem.id,
                name: selectedItem.name,
                unit: selectedItem.unit,
                qty: newItem.qty,
                cost: newItem.cost,
                total: newItem.qty * newItem.cost,
                code: selectedItem.code
            },
        ]);
        setNewItem({ id: "", qty: 1, cost: 0 });
    };

    const handleRemoveItem = (id: string) => {
        setItems(items.filter((item) => item.id !== id));
    };

    const handleItemSelect = (itemId: string) => {
        const selectedItem = allItems.find((i: any) => i.id === itemId);
        if (selectedItem) {
            setNewItem({
                id: itemId,
                qty: 1,
                cost: selectedItem.cost || 0,
            });
        }
    };
    
     const handleQuickAddSupplier = async (name: string) => {
      if (!name) return;
      try {
        const newSupplierId = await dbAction('suppliers', 'add', { name: name, openingBalance: 0, contact: ''});
        if(newSupplierId) setSupplierId(newSupplierId as string);
        toast({ title: "تمت إضافة المورد بنجاح"});
      } catch (e) {
          toast({ variant: 'destructive', title: 'فشل الحفظ'});
      }
    }


    const handleSaveOrder = async () => {
        if (!supplierId || items.length === 0) {
            toast({ variant: "destructive", title: "بيانات ناقصة", description: "يرجى اختيار المورد وإضافة صنف واحد على الأقل." });
            return;
        }

        setIsSaving(true);
        try {
            const orderNumber = `PO-${await getNextId('purchaseOrder')}`;
            const orderData = {
                orderNumber,
                date: new Date().toISOString(),
                supplierId,
                items: items.map(item => ({
                    id: item.itemId,
                    name: item.name,
                    qty: item.qty,
                    cost: item.cost,
                    total: item.total,
                })),
                total,
                status: 'pending', 
                notes,
                createdById: user?.id,
                createdByName: user?.name,
            };

            await dbAction('purchaseOrders', 'add', orderData);
            toast({ title: 'تم الحفظ بنجاح', description: `تم حفظ أمر الشراء رقم ${orderNumber}.` });
            router.push('/purchases/orders');
        } catch (error) {
            console.error("Failed to save purchase order:", error);
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ أمر الشراء.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <PageHeader title="أمر شراء جديد" />
             <QuickAddDialog open={isQuickSupplierOpen} onOpenChange={setIsQuickSupplierOpen} onConfirm={handleQuickAddSupplier} title="إضافة مورد جديد" label="اسم المورد"/>
            <main className="flex-1 p-4 md:p-6">
                <Card className="max-w-4xl mx-auto">
                    <CardHeader>
                        <CardTitle>إنشاء أمر شراء</CardTitle>
                        <CardDescription>
                            قم بإنشاء أمر شراء لإرساله للمورد. هذا الأمر لا يؤثر على المخزون أو الحسابات حتى يتم تحويله إلى فاتورة شراء.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {loading ? (
                            <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
                        ) : (
                            <>
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="supplier">المورد</Label>
                                        <div className="flex gap-2">
                                            <Combobox
                                                options={suppliersForCombobox}
                                                value={supplierId}
                                                onValueChange={setSupplierId}
                                                placeholder="اختر موردًا..."
                                                emptyMessage="لم يتم العثور على المورد."
                                                className="w-full"
                                            />
                                            <Button type="button" variant="outline" size="icon" onClick={() => setIsQuickSupplierOpen(true)}><PlusCircle className="h-4 w-4"/></Button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div>
                                    <Label>بنود أمر الشراء</Label>
                                    <div className="w-full overflow-auto border rounded-lg">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[40%]">الصنف</TableHead>
                                                    <TableHead>الباركود</TableHead>
                                                    <TableHead className="w-24 text-center">الوحدة</TableHead>
                                                    <TableHead className="w-24 text-center">الكمية</TableHead>
                                                    <TableHead className="w-32 text-center">التكلفة</TableHead>
                                                    <TableHead className="text-center">الإجمالي</TableHead>
                                                    <TableHead className="w-16 no-print"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {items.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell>{item.name}</TableCell>
                                                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                        <TableCell className="text-center text-muted-foreground">{item.unit}</TableCell>
                                                        <TableCell><Input type="number" value={item.qty} onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, qty: Number(e.target.value), total: Number(e.target.value) * i.cost } : i))} className="text-center h-8" /></TableCell>
                                                        <TableCell><Input type="number" value={item.cost} onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, cost: Number(e.target.value), total: i.qty * Number(e.target.value) } : i))} className="text-center h-8" /></TableCell>
                                                        <TableCell className="text-center">ج.م {item.total.toFixed(2)}</TableCell>
                                                        <TableCell><Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                                                    </TableRow>
                                                ))}
                                                <TableRow className="no-print bg-muted/20">
                                                    <TableCell className="p-2" colSpan={2}>
                                                        <Combobox options={itemsForCombobox} value={newItem.id} onValueChange={handleItemSelect} placeholder="اختر صنفًا..." emptyMessage="لا توجد أصناف." />
                                                    </TableCell>
                                                    <TableCell></TableCell>
                                                    <TableCell className="p-2"><Input type="number" placeholder="الكمية" value={newItem.qty} onChange={e => setNewItem({ ...newItem, qty: parseInt(e.target.value) || 1 })} className="text-center h-8" /></TableCell>
                                                    <TableCell className="p-2"><Input type="number" placeholder="التكلفة" value={newItem.cost} onChange={e => setNewItem({ ...newItem, cost: parseFloat(e.target.value) || 0 })} className="text-center h-8" /></TableCell>
                                                    <TableCell></TableCell>
                                                    <TableCell className="text-center p-2"><Button onClick={handleAddItem} size="sm" disabled={!newItem.id}><PlusCircle className="ml-2 h-4 w-4" />إضافة</Button></TableCell>
                                                </TableRow>
                                            </TableBody>
                                            <TableFooter>
                                                <TableRow>
                                                    <TableCell colSpan={5} className="font-bold">الإجمالي</TableCell>
                                                    <TableCell className="text-center font-bold">{total.toFixed(2)}</TableCell>
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
                    <CardFooter className="flex justify-end">
                        <Button size="lg" disabled={isSaving || loading} onClick={handleSaveOrder}>
                            {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                            حفظ أمر الشراء
                        </Button>
                    </CardFooter>
                </Card>
            </main>
        </>
    );
}
