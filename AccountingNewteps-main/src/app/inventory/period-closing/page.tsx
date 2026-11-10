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
import { Loader2, AlertTriangle, Lock, Trash2, Calculator, CheckCircle2 } from "lucide-react";
import React, { useState, useMemo } from "react";
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
import { calculateStockForItemInWarehouse } from "@/lib/inventory-utils";
import { cn } from "@/lib/utils";

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
        items, warehouses, inventoryClosings, allData, dbAction, loading: dataLoading,
        posSessions, settings
    } = useData();

    // فحص حالة اليوم المحدد في يوميات العمل (هل اليوم مغلق أم لا يزال مفتوحاً)
    const selectedDayStatus = useMemo(() => {
        if (!closingDate) return null;

        // استخراج تاريخ الإقفال المختار بصيغة YYYY-MM-DD
        const selectedDateStr = new Date(closingDate).toLocaleDateString('en-CA');
        const todayStr = new Date().toLocaleDateString('en-CA');
        const activePosWorkDay = settings?.main?.posSettings?.workDay;

        const openSessions = (posSessions || []).filter((s: any) => !s.isClosed);

        // هل توجد جلسة عمل مفتوحة تطابق اليوم المختار تحديداً؟
        const openSessionOnSelectedDate = openSessions.find((s: any) => {
            const sDate = s.workDayDate 
                || s.closingStatement?.workDayDate 
                || (s.startTime ? new Date(s.startTime).toLocaleDateString('en-CA') : null)
                || activePosWorkDay;
            return sDate === selectedDateStr;
        });

        // إذا كان اليوم المختار هو تاريخ اليوم الفعلي وتوجد جلسة عمل مفتوحة لم تُقفل بعد
        const isTodayOpen = (selectedDateStr === todayStr && openSessions.length > 0);

        // إذا كان اليوم المختار يطابق يوم العمل النشط في إعدادات نقاط البيع ولم يُقفل
        const isActiveWorkDayOpen = Boolean(activePosWorkDay && selectedDateStr === activePosWorkDay && openSessions.length > 0);

        if (openSessionOnSelectedDate || isTodayOpen || isActiveWorkDayOpen) {
            return {
                isClosed: false,
                isOpen: true,
                message: `يوم العمل لتاريخ (${selectedDateStr}) ما زال مفتوحاً ونشطاً في نقاط البيع.`
            };
        }

        // البحث عما إذا كان هناك سجل إقفال مثبت ليوم العمل لهذا التاريخ
        const closedSession = (posSessions || []).find((s: any) => {
            if (!s.isClosed) return false;
            const sDate = s.workDayDate 
                || s.closingStatement?.workDayDate 
                || (s.startTime ? new Date(s.startTime).toLocaleDateString('en-CA') : null);
            return sDate === selectedDateStr;
        });

        return {
            isClosed: true,
            isOpen: false,
            message: closedSession 
                ? `يوم العمل لتاريخ (${selectedDateStr}) مغلق في سجل اليوميات.` 
                : `تاريخ (${selectedDateStr}) مغلق وجاهز للإقفال وتكوين الرصيد الافتتاحي.`
        };
    }, [closingDate, posSessions, settings]);

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

    const handleCalculateBalances = () => {
        if (!closingDate || !warehouseId) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'يرجى تحديد الفرع وتاريخ الإقفال.' });
            return;
        }

        if (lastClosingDate && new Date(closingDate) <= lastClosingDate) {
            toast({ 
                variant: 'destructive', 
                title: 'تاريخ غير صالح', 
                description: `تاريخ الإقفال يجب أن يكون بعد تاريخ آخر إقفال (${lastClosingDate.toLocaleDateString('ar-EG')}).` 
            });
            return;
        }
        
        if (new Date(closingDate) > new Date()) {
            toast({ variant: 'destructive', title: 'تاريخ غير صالح', description: 'لا يمكن إقفال فترة في تاريخ مستقبلي.' });
            return;
        }

        // إذا كان اليوم المختار بالذات ما زال مفتوحاً كـ يوم عمل في نقاط البيع
        if (selectedDayStatus && selectedDayStatus.isOpen) {
            toast({ 
                variant: 'destructive', 
                title: 'يوم العمل لا يزال مفتوحاً', 
                description: `${selectedDayStatus.message} يجب إقفال يوم العمل أولاً في شاشة إدارة اليومية قبل إقفال الفترة المخزنية.` 
            });
            return;
        }

        setIsLoading(true);
        // حساب الرصيد الدفتري الدقيق لكل صنف في المخزن المحدد حتى تاريخ ونهاية يوم الإقفال
        const balances = items
            .map((item: Item) => {
                const balance = calculateStockForItemInWarehouse(item.id, warehouseId, allData, closingDate);
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
    };

    const handlePerformClosing = async () => {
        if (!closingDate || !warehouseId || !reviewData) {
            toast({ variant: "destructive", title: "خطأ", description: "البيانات غير جاهزة للإقفال." });
            return;
        }

        if (selectedDayStatus && selectedDayStatus.isOpen) {
            toast({ 
                variant: 'destructive', 
                title: 'يوم العمل لا يزال مفتوحاً', 
                description: `${selectedDayStatus.message} يجب إقفال يوم العمل أولاً قبل إقفال الفترة.` 
            });
            return;
        }

        setIsLoading(true);
        try {
            const closingDateTime = new Date(closingDate);
            closingDateTime.setHours(23, 59, 59, 999);

            await dbAction('inventoryClosings', 'add', {
                warehouseId: warehouseId,
                closingDate: closingDateTime.toISOString(),
                closedById: user?.id,
                closedByName: user?.name,
                balances: reviewData.map(({ itemId, balance }) => ({ itemId, balance })),
            });

            toast({ 
                title: "تم الإقفال بنجاح!", 
                description: `تم إقفال الأرصدة للمخزن المحدد وتكوين الرصيد الافتتاحي الجديد بتاريخ ${new Date(closingDate).toLocaleDateString('ar-EG')}.` 
            });
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
            await dbAction('inventoryClosings', 'remove', { id: closingId });
            toast({ title: "تم فك الإقفال بنجاح" });
            setSelectedClosingDetails(null);
        } catch (error) {
            toast({ variant: 'destructive', title: "خطأ", description: "فشلت عملية فك الإقفال." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <PageHeader title="إقفال الفترات المخزنية والأرصدة الافتتاحية" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>إقفال فترة جديدة وتكوين رصيد افتتاحي</CardTitle>
                        <CardDescription>
                            حدد المخزن وتاريخ الإقفال. سيقوم النظام بحساب الأرصدة الدفترية وحفظها كرصيد افتتاحي للفترة الجديدة، مع التحقق من أن اليوم المختار مغلق في يوميات العمل.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-3 gap-4">
                       <div className="space-y-2">
                            <Label htmlFor="warehouse">المخزن (الفرع)</Label>
                            <Select value={warehouseId} onValueChange={v => { setWarehouseId(v); setReviewData(null); setSelectedClosingDetails(null); }}>
                                <SelectTrigger><SelectValue placeholder="اختر فرعًا" /></SelectTrigger>
                                <SelectContent>
                                    {warehouses.map((w: Warehouse) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
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
                                onChange={(e) => {
                                    setClosingDate(e.target.value);
                                    setReviewData(null);
                                }}
                            />
                            {closingDate && selectedDayStatus && (
                                <div className={cn(
                                    "text-xs px-2.5 py-1.5 rounded flex items-center gap-1.5 font-medium mt-1",
                                    selectedDayStatus.isClosed 
                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20" 
                                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                                )}>
                                    {selectedDayStatus.isClosed ? (
                                        <>
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                            <span>{selectedDayStatus.message} (جاهز للإقفال)</span>
                                        </>
                                    ) : (
                                        <>
                                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                            <span>{selectedDayStatus.message} (يجب إقفال اليوم أولاً)</span>
                                        </>
                                    )}
                                </div>
                            )}
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
                                هذه هي الأرصدة التي سيتم اعتمادها كرصيد افتتاحي جديد بتاريخ {new Date(closingDate).toLocaleDateString('ar-EG')}.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="w-full overflow-auto border rounded-lg max-h-96">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>كود الصنف</TableHead>
                                            <TableHead>اسم الصنف</TableHead>
                                            <TableHead className="text-center">الرصيد الدفتري المحسوب</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reviewData.map((item: any) => (
                                            <TableRow key={item.itemId}>
                                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                <TableCell className="font-medium">{item.name}</TableCell>
                                                <TableCell className="text-center font-bold text-primary">{item.balance}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                             </div>
                        </CardContent>
                         <CardFooter className="flex justify-between items-center">
                            <p className="text-sm text-muted-foreground">إجمالي الأصناف ذات الرصيد: <span className="font-bold text-foreground">{reviewData.length}</span></p>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" disabled={isLoading || !reviewData || !closingDate || !warehouseId}>
                                        {isLoading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Lock className="ml-2 h-4 w-4" />}
                                        اعتماد وتثبيت الإقفال النهائي
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>تأكيد الإقفال وتكوين الرصيد الافتتاحي</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            سيتم إقفال جميع الحركات للمخزن المحدد حتى نهاية تاريخ <span className="font-bold text-foreground">{new Date(closingDate).toLocaleDateString('ar-EG')}</span>.
                                            وستتحول هذه الأرصدة إلى رصيد افتتاحي رسمي للفترة الجديدة.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                        <AlertDialogAction onClick={handlePerformClosing} className="bg-destructive hover:bg-destructive/90">
                                            نعم، قم بالإقفال وتكوين الرصيد
                                        </AlertDialogAction>
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
                                        <TableHead className="text-center">عدد الأصناف المقفلة</TableHead>
                                        <TableHead className="text-center">الإجراء</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {closingsForSelectedWarehouse.map((closing: InventoryClosing, index: number) => (
                                        <TableRow key={closing.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedClosingDetails(closing)}>
                                            <TableCell className="font-medium">{new Date(closing.closingDate).toLocaleDateString('ar-EG')}</TableCell>
                                            <TableCell>{closing.closedByName || 'غير محدد'}</TableCell>
                                            <TableCell className="text-center font-bold">{closing.balances?.length || 0}</TableCell>
                                            <TableCell className="text-center">
                                                {index === 0 && (
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={(e) => e.stopPropagation()}>
                                                                <Trash2 className="h-4 w-4"/>
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>فك الإقفال الأخير؟</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    هل أنت متأكد من حذف هذا الإقفال؟ سيؤدي هذا إلى إلغاء الرصيد الافتتاحي وإعادة فتح الفترة للتعديل.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDeleteClosing(closing.id)}>نعم، قم بالحذف</AlertDialogAction>
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
                            <CardTitle>تفاصيل الأرصدة المقفلة بتاريخ: {new Date(selectedClosingDetails.closingDate).toLocaleDateString('ar-EG')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className="w-full overflow-auto border rounded-lg max-h-96">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>كود الصنف</TableHead>
                                            <TableHead>اسم الصنف</TableHead>
                                            <TableHead className="text-center">الرصيد المقفل</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedClosingDetails.balances.map(item => {
                                            const itemDetails = items.find((i: Item) => i.id === item.itemId);
                                            return (
                                                <TableRow key={item.itemId}>
                                                    <TableCell className="font-mono text-xs">{itemDetails?.code || '-'}</TableCell>
                                                    <TableCell>{itemDetails?.name || 'صنف محذوف'}</TableCell>
                                                    <TableCell className="text-center font-bold text-primary">{item.balance}</TableCell>
                                                </TableRow>
                                            );
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
