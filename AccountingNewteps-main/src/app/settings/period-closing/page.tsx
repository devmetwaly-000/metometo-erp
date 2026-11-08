
"use client";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/data-provider";
import { Loader2, AlertTriangle, History, RefreshCcw, Lock, Trash2, Calculator } from "lucide-react";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";


interface Item { id: string; name: string; code: string; }
interface Warehouse { id: string; name: string; }
interface InventoryClosing { id: string; warehouseId: string; closingDate: string; closedByName: string; balances: { itemId: string, balance: number }[] }


export default function PeriodClosingPage() {
    const { toast } = useToast();
    const [closingDate, setClosingDate] = useState("");
    const [warehouseId, setWarehouseId] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [reviewData, setReviewData] = useState<any[] | null>(null);
    const [selectedClosingDetails, setSelectedClosingDetails] = useState<InventoryClosing | null>(null);
    const { user } = useAuth();
    
    const { 
        items, warehouses, inventoryClosings, inventory, dbAction, loading: dataLoading,
        stockInRecords, salesInvoices, posSales, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, salesReturns, posReturns, purchaseReturns, stockIssuesToReps, stockReturnsFromReps,
        posSessions
    } = useData();

    const openWorkDay = useMemo(() => posSessions.find((s: any) => !s.isClosed), [posSessions]);

    const closingsForSelectedWarehouse = useMemo(() => {
        if (!warehouseId) return [];
        return inventoryClosings
            .filter((c: InventoryClosing) => c.warehouseId === warehouseId)
            .sort((a:any,b:any) => new Date(b.closingDate).getTime() - new Date(a.closingDate).getTime());
    }, [warehouseId, inventoryClosings]);

    const lastClosingDate = useMemo(() => {
        if (closingsForSelectedWarehouse.length === 0) return null;
        return new Date(closingsForSelectedWarehouse[0].closingDate);
    }, [closingsForSelectedWarehouse]);

    const calculateStock = useCallback((item: any, warehouseId: string, upToDate: Date): number => {
        const closingsForWarehouse = inventoryClosings.filter((c: any) => c.warehouseId === warehouseId);
        const lastClosing = closingsForWarehouse.length > 0 ? closingsForWarehouse.reduce((latest: any, current: any) => new Date(latest.closingDate) > new Date(current.closingDate) ? latest : current) : null;
        const lastClosingDate = lastClosing ? new Date(lastClosing.closingDate) : new Date(0);
        
        let stock = lastClosing?.balances.find((b: any) => b.itemId === item.id)?.balance || 0;
        
        const filterTransactions = (t: any) => {
            const txDate = new Date(t.date);
            return txDate > lastClosingDate && txDate <= upToDate;
        };

        // INCOMING
        stockInRecords.filter((si:any) => si.warehouseId === warehouseId && filterTransactions(si)).forEach((si: any) => si.items.filter((i: any) => (i.id || i.itemId) === item.id).forEach((i: any) => stock += i.qty));
        stockTransferRecords.filter((t:any) => t.toSourceId === warehouseId && filterTransactions(t)).forEach((t: any) => t.items.filter((i: any) => i.id === item.id).forEach((i: any) => stock += i.qty));
        stockAdjustmentRecords.filter((adj:any) => adj.warehouseId === warehouseId && filterTransactions(adj)).forEach((adj: any) => adj.items.filter((i: any) => i.itemId === item.id && i.difference > 0).forEach((i: any) => stock += i.difference));
        salesReturns.filter((sr:any) => sr.warehouseId === warehouseId && filterTransactions(sr)).forEach((sr: any) => sr.items.filter((i: any) => i.id === item.id).forEach((i: any) => stock += i.qty));
        posReturns.filter((pr:any) => (pr as any).warehouseId === warehouseId && filterTransactions(pr)).forEach((pr: any) => pr.items.filter((i: any) => i.id === item.id).forEach((i: any) => stock += i.qty));
        stockReturnsFromReps.filter((rfr:any) => rfr.warehouseId === warehouseId && filterTransactions(rfr)).forEach((rfr: any) => rfr.items.filter((i: any) => i.id === item.id).forEach((i: any) => stock += i.qty));
        
        // OUTGOING
        salesInvoices.filter((s:any) => s.warehouseId === warehouseId && s.status === 'approved' && filterTransactions(s)).forEach((s: any) => s.items.filter((i: any) => i.id === item.id).forEach((i: any) => stock -= i.qty));
        posSales.filter((s: any) => s.warehouseId === warehouseId && filterTransactions(s)).forEach((s: any) => s.items.filter((i: any) => i.id === item.id).forEach((i: any) => stock -= i.qty));
        stockOutRecords.filter((so:any) => so.sourceId === warehouseId && filterTransactions(so)).forEach((so: any) => so.items.filter((i:any) => i.id === item.id).forEach((i:any) => stock -= i.qty));
        stockTransferRecords.filter((t:any) => t.fromSourceId === warehouseId && filterTransactions(t)).forEach((t: any) => t.items.filter((i: any) => i.id === item.id).forEach((i: any) => stock -= i.qty));
        stockAdjustmentRecords.filter((adj:any) => adj.warehouseId === warehouseId && filterTransactions(adj)).forEach((adj: any) => adj.items.filter((i: any) => i.itemId === item.id && i.difference < 0).forEach((i: any) => stock += i.difference));
        purchaseReturns.filter((pr:any) => pr.warehouseId === warehouseId && filterTransactions(pr)).forEach((pr: any) => pr.items.filter((i: any) => i.id === item.id).forEach((i: any) => stock -= i.qty));
        stockIssuesToReps.filter((itr:any) => itr.warehouseId === warehouseId && filterTransactions(itr)).forEach((itr: any) => itr.items.filter((i: any) => i.id === item.id).forEach((i: any) => stock -= i.qty));
        
        return stock;

    }, [inventoryClosings, stockInRecords, stockTransferRecords, stockAdjustmentRecords, salesReturns, posReturns, stockReturnsFromReps, salesInvoices, posSales, stockOutRecords, purchaseReturns, stockIssuesToReps]);

    
    const handleCalculateBalances = () => {
        if (!closingDate || !warehouseId) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'يرجى تحديد الفرع وتاريخ الإقفال.' });
            return;
        }

        if (lastClosingDate && new Date(closingDate) <= lastClosingDate) {
            toast({ variant: 'destructive', title: 'تاريخ غير صالح', description: `تاريخ الإقفال يجب أن يكون بعد تاريخ آخر إقفال (${lastClosingDate.toLocaleDateString('ar-EG')}).` });
            return;
        }
        
        if (new Date(closingDate) > new Date()) {
             toast({ variant: 'destructive', title: 'تاريخ غير صالح', description: 'لا يمكن إقفال فترة في تاريخ مستقبلي.' });
            return;
        }

        if (openWorkDay) {
            toast({ variant: 'destructive', title: 'يوم العمل مفتوح', description: 'يجب إقفال يوم العمل الحالي في شاشة إدارة اليومية قبل إقفال الفترة المخزنية.' });
            return;
        }

        setIsLoading(true);
        const upToDate = new Date(closingDate);
        upToDate.setHours(23, 59, 59, 999);

        const balances = items
            .map((item: Item) => {
                const balance = calculateStock(item, warehouseId, upToDate);
                return {
                    itemId: item.id,
                    name: item.name,
                    code: item.code,
                    balance: balance,
                };
            })
            .filter(item => item.balance !== 0);

        setReviewData(balances);
        setIsLoading(false);
    }
    

    const handlePerformClosing = async () => {
        if (!closingDate || !warehouseId || !reviewData) {
            toast({ variant: "destructive", title: "خطأ", description: "البيانات غير جاهزة للإقفال." });
            return;
        }
        setIsLoading(true);
        try {
            await dbAction('inventoryClosings', 'add', {
                warehouseId: warehouseId,
                closingDate: new Date(closingDate).toISOString(),
                closedById: user?.id,
                closedByName: user?.name,
                balances: reviewData.map(({ itemId, balance }) => ({ itemId, balance })),
            });

            toast({ title: "تم الإقفال بنجاح!", description: `تم إقفال الأرصدة للمخزن المحدد بتاريخ ${new Date(closingDate).toLocaleDateString('ar-EG')}.` });
            setReviewData(null);
            setClosingDate("");
            setWarehouseId("");
        } catch (error) {
            toast({ variant: 'destructive', title: "خطأ", description: "فشلت عملية الإقفال." });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleDeleteClosing = async (closingId: string) => {
        setIsLoading(true);
        try {
            await dbAction('inventoryClosings', 'remove', {id: closingId});
            toast({title: "تم فك الإقفال بنجاح"});
            setSelectedClosingDetails(null); // Close details view after deletion
        } catch (error) {
             toast({ variant: 'destructive', title: "خطأ", description: "فشلت عملية فك الإقفال." });
        } finally {
            setIsLoading(false);
        }
    }


    return (
        <>
            <PageHeader title="إقفال الفترات المخزنية" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>إقفال فترة جديدة</CardTitle>
                        <CardDescription>
                            حدد المخزن وتاريخ الإقفال. سيقوم النظام بحساب الأرصدة الدفترية وحفظها كرصيد افتتاحي للفترة الجديدة، وتجميد جميع الحركات قبل هذا التاريخ.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-3 gap-4">
                       <div className="space-y-2">
                            <Label htmlFor="warehouse">المخزن (الفرع)</Label>
                            <Select value={warehouseId} onValueChange={v => {setWarehouseId(v); setReviewData(null); setSelectedClosingDetails(null);}}>
                                <SelectTrigger><SelectValue placeholder="اختر فرعًا" /></SelectTrigger>
                                <SelectContent>
                                    {warehouses.map((w: Warehouse) => <SelectItem key={w.id} value={w.id!}>{w.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {lastClosingDate && (
                                <p className="text-xs text-muted-foreground pt-1">
                                    آخر إقفال لهذا الفرع كان بتاريخ: {lastClosingDate.toLocaleDateString('ar-EG')}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="closing-date">تاريخ الإقفال</Label>
                            <Input
                                id="closing-date"
                                type="date"
                                value={closingDate}
                                onChange={(e) => setClosingDate(e.target.value)}
                            />
                        </div>
                    </CardContent>
                     <CardFooter className="gap-4">
                         <Button onClick={handleCalculateBalances} disabled={isLoading || dataLoading || !warehouseId || !closingDate}>
                             <Calculator className="ml-2 h-4 w-4" />
                             حساب الأرصدة وعرضها للمراجعة
                         </Button>
                     </CardFooter>
                </Card>

                {reviewData && (
                     <Card>
                        <CardHeader>
                            <CardTitle>مراجعة الأرصدة الدفترية قبل الإقفال</CardTitle>
                            <CardDescription>
                                هذه هي الأرصدة التي سيتم إقفالها بتاريخ {new Date(closingDate).toLocaleDateString('ar-EG')}.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="w-full overflow-auto border rounded-lg max-h-96">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>كود الصنف</TableHead>
                                            <TableHead>اسم الصنف</TableHead>
                                            <TableHead className="text-center">الرصيد الدفتري</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reviewData.map((item: any) => (
                                            <TableRow key={item.itemId}>
                                                <TableCell>{item.code}</TableCell>
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell className="text-center font-bold">{item.balance}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                             </div>
                        </CardContent>
                         <CardFooter className="flex justify-between">
                            <p className="text-sm text-muted-foreground">إجمالي الأصناف ذات الرصيد: {reviewData.length}</p>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" disabled={isLoading || !reviewData || !closingDate || !warehouseId}>
                                        {isLoading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Lock className="ml-2 h-4 w-4" />}
                                        تنفيذ الإقفال النهائي
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            سيتم إقفال جميع الحركات للمخزن المحدد حتى تاريخ <span className="font-bold">{new Date(closingDate).toLocaleDateString('ar-EG')}</span>.
                                            وستصبح الأرصدة الحالية هي أرصدة الفترة الجديدة. لا يمكن التراجع عن هذا الإجراء إلا بحذف سجل الإقفال.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                        <AlertDialogAction onClick={handlePerformClosing} className="bg-destructive hover:bg-destructive/90">نعم، قم بالإقفال</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                         </CardFooter>
                     </Card>
                )}
                
                 {closingsForSelectedWarehouse.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>سجل الإقفالات السابقة للمخزن المحدد</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>تاريخ الإقفال</TableHead>
                                        <TableHead>المستخدم</TableHead>
                                        <TableHead className="text-center">عدد الأصناف</TableHead>
                                        <TableHead className="text-center">الإجراء</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {closingsForSelectedWarehouse.map((closing: InventoryClosing, index: number) => (
                                        <TableRow key={closing.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedClosingDetails(closing)}>
                                            <TableCell>{new Date(closing.closingDate).toLocaleDateString('ar-EG')}</TableCell>
                                            <TableCell>{closing.closedByName}</TableCell>
                                            <TableCell className="text-center">{closing.balances?.length || 0}</TableCell>
                                            <TableCell className="text-center">
                                                {index === 0 && ( // Only allow deleting the most recent closing
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={(e) => e.stopPropagation()}>
                                                                <Trash2 className="h-4 w-4"/>
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>فك الإقفال؟</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    هل أنت متأكد من حذف هذا الإقفال؟ سيؤدي هذا إلى إعادة فتح الفترة للتعديل. يجب عليك إعادة إقفالها مرة أخرى لاحقًا.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDeleteClosing(closing.id!)}>نعم، قم بالحذف</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                 {selectedClosingDetails && (
                    <Card>
                        <CardHeader>
                            <CardTitle>تفاصيل الإقفال بتاريخ: {new Date(selectedClosingDetails.closingDate).toLocaleDateString('ar-EG')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className="w-full overflow-auto border rounded-lg max-h-96">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>اسم الصنف</TableHead>
                                            <TableHead className="text-center">الرصيد المقفل</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedClosingDetails.balances.map(item => {
                                            const itemDetails = items.find((i:Item) => i.id === item.itemId);
                                            return (
                                                <TableRow key={item.itemId}>
                                                    <TableCell>{itemDetails?.name || 'صنف محذوف'}</TableCell>
                                                    <TableCell className="text-center font-bold">{item.balance}</TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                             </div>
                        </CardContent>
                    </Card>
                )}

            </main>
        </>
    );
}

    