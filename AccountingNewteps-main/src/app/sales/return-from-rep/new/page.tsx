

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
import React, { useState, useMemo, useEffect } from "react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/auth-context";

interface ReturnItem {
  id: string; // original item id
  name: string;
  qty: number;
  unit: string;
  uniqueId: string; // for list key
  price: number;
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
    const [selectedRep, setSelectedRep] = useState<string>("");
    const [notes, setNotes] = useState<string>("");
    
    const { 
        items: allItems, 
        users, 
        warehouses, 
        salesInvoices,
        stockIssuesToReps,
        stockReturnsFromReps,
        dbAction, 
        getNextId, 
        loading 
    } = useData();

    const reps = users.filter((u: User) => u.isSalesRep);
    
    const itemsInRepCustody = useMemo(() => {
        if (!selectedRep || !allItems.length) return [];
        
        const repStock = new Map<string, number>();

        stockIssuesToReps
            .filter((issue:any) => issue.salesRepId === selectedRep)
            .forEach((issue:any) => {
                issue.items.forEach((item:any) => {
                    repStock.set(item.id, (repStock.get(item.id) || 0) + item.qty);
                });
            });

        salesInvoices
            .filter((sale:any) => sale.salesRepId === selectedRep && sale.status === 'approved')
            .forEach((sale:any) => {
                sale.items.forEach((item:any) => {
                    repStock.set(item.id, (repStock.get(item.id) || 0) - item.qty);
                });
            });

        stockReturnsFromReps
            .filter((ret:any) => ret.salesRepId === selectedRep)
            .forEach((ret:any) => {
                ret.items.forEach((item:any) => {
                    repStock.set(item.id, (repStock.get(item.id) || 0) - item.qty);
                });
            });
            
        return allItems
            .map((item:any) => ({...item, stock: repStock.get(item.id) || 0}))
            .filter((item:any) => item.stock > 0);
    }, [selectedRep, allItems, stockIssuesToReps, salesInvoices, stockReturnsFromReps]);


    const handleFillFromCustody = () => {
        if (itemsInRepCustody.length === 0) {
            toast({ variant: 'default', title: 'العهدة فارغة', description: 'لا توجد بضاعة متبقية في عهدة هذا المندوب.' });
            return;
        }

        const itemsToReturn = itemsInRepCustody.map(item => ({
            id: item.id,
            name: item.name,
            qty: item.stock,
            unit: item.unit,
            price: item.price || 0,
            uniqueId: `${item.id}-${Date.now()}`
        }));
        setItems(itemsToReturn);
        toast({ title: 'تم ملء الأصناف', description: 'تمت إضافة جميع الأصناف المتبقية في عهدة المندوب إلى القائمة.' });
    };

    const handleRemoveItem = (uniqueId: string) => {
        setItems(items.filter((item) => item.uniqueId !== uniqueId));
    };

    const handleConfirm = async () => {
        if (!selectedRep || items.length === 0) {
            toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "يرجى اختيار المندوب والتأكد من وجود أصناف للإرجاع." });
            return;
        }
        
        const rep = reps.find((r: User) => r.id === selectedRep);
        if (!rep) return;

        const receiptNumber = `م-ع-${await getNextId('returnFromRep')}`;

        const record = {
            salesRepId: selectedRep,
            warehouseId: rep.warehouse, // From rep's master data
            date: new Date().toISOString(),
            items: items.map(({id, name, qty}) => ({id, name, qty})),
            notes,
            receiptNumber,
            createdById: user?.id,
            createdByName: user?.name,
        };

        try {
            await dbAction('stockReturnsFromReps', 'add', record);
            toast({ title: "تم بنجاح", description: `تم تسجيل مرتجع البضاعة من المندوب.` });
            router.push('/sales/return-from-rep/list');
        } catch(error) {
             toast({ variant: "destructive", title: "حدث خطأ", description: "فشل في حفظ حركة المرتجع." });
        }
    };

  return (
    <>
      <PageHeader title="مرتجع بضاعة من مندوب (تفريغ حمولة)" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>إذن مرتجع بضاعة</CardTitle>
            <CardDescription>
                اختر المندوب ثم اضغط على "تعبئة تلقائية" لحساب وإضافة البضاعة المتبقية في عهدته.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
                 <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
                <>
                    <div className="flex items-end gap-4">
                        <div className="space-y-2 flex-1">
                            <Label htmlFor="rep">مندوب المبيعات</Label>
                            <Select value={selectedRep} onValueChange={setSelectedRep}>
                                <SelectTrigger id="rep"><SelectValue placeholder="اختر المندوب" /></SelectTrigger>
                                <SelectContent>
                                   {reps.map((r: User) => <SelectItem key={r.id} value={r.id!}>{r.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleFillFromCustody} disabled={!selectedRep}>تعبئة تلقائية من العهدة</Button>
                    </div>
                    
                    <div>
                      <Label>الأصناف المرتجعة</Label>
                      <div className="w-full overflow-auto border rounded-lg">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[60%]">الصنف</TableHead>
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
                                <TableCell className="text-center">
                                     <Input type="number" value={item.qty} onChange={(e) => setItems(prev => prev.map(i => i.uniqueId === item.uniqueId ? {...i, qty: Number(e.target.value)} : i))} className="w-24 mx-auto text-center" />
                                </TableCell>
                                <TableCell className="text-center">
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.uniqueId)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                                </TableRow>
                            ))}
                             {items.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                        {selectedRep ? 'اضغط على "تعبئة تلقائية" لبدء العملية.' : 'يرجى اختيار مندوب أولاً.'}
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
          <CardFooter className="flex justify-end">
            <Button size="lg" disabled={loading} onClick={handleConfirm}>
                <Save className="ml-2 h-4 w-4" />
                حفظ إذن المرتجع
            </Button>
          </CardFooter>
        </Card>
      </main>
    </>
  );
}
