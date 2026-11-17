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
import { Loader2, AlertTriangle, Lock, Trash2, Calculator, CheckCircle2, Archive, Database, Search, History, FileCheck2 } from "lucide-react";
import React, { useState, useMemo, useEffect, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
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
    
    // حالة أرشفة الفترات والسنوات المالية المغلقة
    const [archiveCutoffDate, setArchiveCutoffDate] = useState("");
    const [archiveWarehouseId, setArchiveWarehouseId] = useState("all");
    const [archivePreview, setArchivePreview] = useState<any | null>(null);
    const [isArchiving, setIsArchiving] = useState(false);
    const [archiveLogs, setArchiveLogs] = useState<any[]>([]);
    const [archiveSearch, setArchiveSearch] = useState("");
    const [archivedBrowseData, setArchivedBrowseData] = useState<any | null>(null);
    const [isBrowsingArchive, setIsBrowsingArchive] = useState(false);

    const { 
        items, warehouses, inventoryClosings, allData, dbAction, loading: dataLoading,
        posSessions, settings
    } = useData();

    const fetchArchiveLogs = useCallback(async () => {
        try {
            const res = await fetch('/api/archive/period?mode=logs');
            const json = await res.json();
            if (json.success) {
                setArchiveLogs(json.logs || []);
            }
        } catch (e) {
            console.error("Failed to load archive logs:", e);
        }
    }, []);

    useEffect(() => {
        fetchArchiveLogs();
    }, [fetchArchiveLogs]);

    const handlePreviewArchive = async () => {
        if (!archiveCutoffDate) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'يرجى تحديد تاريخ نهاية الفترة المراد أرشفتها.' });
            return;
        }
        setIsArchiving(true);
        try {
            const params = new URLSearchParams({
                mode: 'preview',
                cutoffDate: archiveCutoffDate,
                warehouseId: archiveWarehouseId
            });
            const res = await fetch(`/api/archive/period?${params.toString()}`);
            const json = await res.json();
            if (json.success) {
                setArchivePreview(json);
            } else {
                toast({ variant: 'destructive', title: 'خطأ', description: json.error || 'تعذر معاينة بيانات الأرشفة.' });
            }
        } catch (e) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'تعذر الاتصال بالخادم.' });
        } finally {
            setIsArchiving(false);
        }
    };

    const handleExecuteArchive = async () => {
        if (!archiveCutoffDate) return;
        setIsArchiving(true);
        try {
            const whObj = warehouses.find((w: Warehouse) => w.id === archiveWarehouseId);
            const res = await fetch('/api/archive/period', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cutoffDate: archiveCutoffDate,
                    warehouseId: archiveWarehouseId,
                    warehouseName: archiveWarehouseId === 'all' ? 'كل الفروع والمخازن' : (whObj?.name || archiveWarehouseId),
                    userId: user?.id,
                    userName: user?.name
                })
            });
            const json = await res.json();
            if (json.success) {
                toast({
                    title: 'تمت أرشفة الفترة بنجاح!',
                    description: `تم ترحيل ${json.totalArchived} سجل إلى الجداول التاريخية مع الحفاظ التام على جميع الأرصدة الافتتاحية للعملاء والموردين والخزائن والمناديب.`
                });
                setArchivePreview(null);
                fetchArchiveLogs();
            } else {
                toast({ variant: 'destructive', title: 'تعذر تنفيذ الأرشفة', description: json.error || 'حدث خطأ أثناء الأرشفة.' });
            }
        } catch (e) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل الاتصال بالخادم.' });
        } finally {
            setIsArchiving(false);
        }
    };

    const handleBrowseArchive = async (batchId?: string) => {
        setIsBrowsingArchive(true);
        try {
            const params = new URLSearchParams({ mode: 'browse' });
            if (batchId) params.set('batchId', batchId);
            if (archiveSearch) params.set('search', archiveSearch);
            const res = await fetch(`/api/archive/period?${params.toString()}`);
            const json = await res.json();
            if (json.success) {
                setArchivedBrowseData(json);
            }
        } catch (e) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'تعذر جلب سجلات الأرشيف.' });
        } finally {
            setIsBrowsingArchive(false);
        }
    };

    // فحص حالة اليوم المحدد في يوميات العمل (هل اليوم مغلق أم لا يزال مفتوحاً)
    const selectedDayStatus = useMemo(() => {
        if (!closingDate) return null;

        const selectedDateStr = new Date(closingDate).toLocaleDateString('en-CA');
        const todayStr = new Date().toLocaleDateString('en-CA');
        const activePosWorkDay = settings?.main?.posSettings?.workDay;

        const openSessions = (posSessions || []).filter((s: any) => !s.isClosed);

        const openSessionOnSelectedDate = openSessions.find((s: any) => {
            const sDate = s.workDayDate 
                || s.closingStatement?.workDayDate 
                || (s.startTime ? new Date(s.startTime).toLocaleDateString('en-CA') : null)
                || activePosWorkDay;
            return sDate === selectedDateStr;
        });

        const isTodayOpen = (selectedDateStr === todayStr && openSessions.length > 0);
        const isActiveWorkDayOpen = Boolean(activePosWorkDay && selectedDateStr === activePosWorkDay && openSessions.length > 0);

        if (openSessionOnSelectedDate || isTodayOpen || isActiveWorkDayOpen) {
            return {
                isClosed: false,
                isOpen: true,
                message: `يوم العمل لتاريخ (${selectedDateStr}) ما زال مفتوحاً ونشطاً في نقاط البيع.`
            };
        }

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

        if (selectedDayStatus && selectedDayStatus.isOpen) {
            toast({ 
                variant: 'destructive', 
                title: 'يوم العمل لا يزال مفتوحاً', 
                description: `${selectedDayStatus.message} يجب إقفال يوم العمل أولاً في شاشة إدارة اليومية قبل إقفال الفترة المخزنية.` 
            });
            return;
        }

        setIsLoading(true);
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
            <PageHeader title="إقفال وأرشفة الفترات والسنوات المالية" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>1. إقفال فترة مخزنية جديدة وتكوين رصيد افتتاحي</CardTitle>
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
                                        : "bg-amber-500/10 text-foreground dark:text-foreground border border-amber-500/20"
                                )}>
                                    {selectedDayStatus.isClosed ? (
                                        <>
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                            <span>{selectedDayStatus.message} (جاهز للإقفال)</span>
                                        </>
                                    ) : (
                                        <>
                                            <AlertTriangle className="h-4 w-4 shrink-0 text-foreground dark:text-foreground" />
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

                {/* القسم الثاني: أرشفة الفترات والسنوات المالية المغلقة (ترحيل الجداول التاريخية) */}
                <Card className="border-primary/30 shadow-sm">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Archive className="h-5 w-5 text-primary" />
                            <CardTitle>2. أرشفة الفترات والسنوات المالية المغلقة (ترحيل الجداول التاريخية)</CardTitle>
                        </div>
                        <CardDescription>
                            ترحيل الفواتير والحركات القديمة وعهد وتوريدات المناديب إلى جداول الأرشيف التاريخية (`dbo.Archived*`) بعد دمج صافي أثرها المالي تلقائياً في الأرصدة الافتتاحية للعملاء والموردين والخزائن ليبقى النظام خفيفاً وسريعاً للأبد.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid md:grid-cols-3 gap-4 items-end">
                            <div className="space-y-2">
                                <Label>نطاق الفرع / المخزن</Label>
                                <Select value={archiveWarehouseId} onValueChange={v => { setArchiveWarehouseId(v); setArchivePreview(null); }}>
                                    <SelectTrigger><SelectValue placeholder="كل الفروع والمخازن" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">كل الفروع والمخازن (شامل توريدات المناديب)</SelectItem>
                                        {warehouses.map((w: Warehouse) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>أرشفة الحركات حتى نهاية تاريخ</Label>
                                <Input
                                    type="date"
                                    value={archiveCutoffDate}
                                    onChange={(e) => {
                                        setArchiveCutoffDate(e.target.value);
                                        setArchivePreview(null);
                                    }}
                                />
                            </div>
                            <div>
                                <Button onClick={handlePreviewArchive} disabled={isArchiving || !archiveCutoffDate} className="w-full md:w-auto">
                                    {isArchiving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Database className="ml-2 h-4 w-4" />}
                                    معاينة السجلات القابلة للأرشفة
                                </Button>
                            </div>
                        </div>

                        {archivePreview && (
                            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-sm flex items-center gap-2">
                                        <FileCheck2 className="h-4 w-4 text-emerald-500" />
                                        نتيجة فحص السجلات حتى تاريخ {new Date(archivePreview.cutoffDate).toLocaleDateString('ar-EG')}
                                    </h4>
                                    <Badge variant="default">
                                        إجمالي السجلات: {Number(archivePreview.totalRecords || 0).toLocaleString()} سجل
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                                    <div className="p-3 rounded-md border bg-background">
                                        <div className="text-xs text-muted-foreground">فواتير المبيعات والكاشير</div>
                                        <div className="text-lg font-bold text-primary mt-1">{archivePreview.counts?.salesInvoicesCount || 0}</div>
                                    </div>
                                    <div className="p-3 rounded-md border bg-background">
                                        <div className="text-xs text-muted-foreground">مرتجعات المبيعات</div>
                                        <div className="text-lg font-bold mt-1">{archivePreview.counts?.salesReturnsCount || 0}</div>
                                    </div>
                                    <div className="p-3 rounded-md border bg-background">
                                        <div className="text-xs text-muted-foreground">فواتير ومرتجعات الشراء</div>
                                        <div className="text-lg font-bold mt-1">
                                            {Number(archivePreview.counts?.purchaseInvoicesCount || 0) + Number(archivePreview.counts?.purchaseReturnsCount || 0)}
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-md border bg-background">
                                        <div className="text-xs text-muted-foreground">حركات وتوريدات المناديب</div>
                                        <div className="text-lg font-bold text-amber-500 mt-1">
                                            {Number(archivePreview.counts?.repIssuesCount || 0) + Number(archivePreview.counts?.repReturnsCount || 0) + Number(archivePreview.counts?.repRemittancesCount || 0)}
                                        </div>
                                    </div>
                                </div>

                                {Number(archivePreview.totalRecords || 0) > 0 && (
                                    <div className="flex justify-end pt-2">
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" disabled={isArchiving}>
                                                    <Archive className="ml-2 h-4 w-4" />
                                                    تنفيذ الأرشفة وترحيل الأرصدة الافتتاحية الآن
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>تأكيد أرشفة الفترة وترحيل السجلات التاريخية</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        سيقوم النظام بدمج صافي أثر الفواتير والحركات حتى تاريخ <span className="font-bold text-foreground">{new Date(archiveCutoffDate).toLocaleDateString('ar-EG')}</span> في الأرصدة الافتتاحية للعملاء والموردين والخزائن، ثم نقل ({archivePreview.totalRecords}) سجل إلى جداول الأرشيف التاريخية. ستبقى جميع الفواتير المؤرشفة متاحة للبحث والعرض في قسم الأرشيف أدناه.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleExecuteArchive} className="bg-destructive hover:bg-destructive/90">
                                                        نعم، نفذ الأرشفة الآمنة
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* القسم الثالث: سجل عمليات الأرشفة واستعراض الفواتير المؤرشفة */}
                <Card>
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <History className="h-5 w-5 text-muted-foreground" />
                                سجل عمليات الأرشفة واستعراض الأرشيف التاريخي
                            </CardTitle>
                            <CardDescription>البحث في الفواتير والحركات التاريخية المرحلة إلى الأرشيف.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="ابحث برقم الفاتورة أو اسم العميل..."
                                value={archiveSearch}
                                onChange={(e) => setArchiveSearch(e.target.value)}
                                className="w-60 h-9"
                            />
                            <Button variant="outline" size="sm" onClick={() => handleBrowseArchive()} disabled={isBrowsingArchive}>
                                {isBrowsingArchive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 ml-1" />}
                                بحث في الأرشيف
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {archiveLogs.length > 0 ? (
                            <div className="w-full overflow-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>تاريخ تنفيذ الأرشفة</TableHead>
                                            <TableHead>تاريخ قطع الفترة</TableHead>
                                            <TableHead>النطاق</TableHead>
                                            <TableHead>بواسطة</TableHead>
                                            <TableHead className="text-center">إجمالي السجلات المؤرشفة</TableHead>
                                            <TableHead className="text-center">استعراض</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {archiveLogs.map((log: any) => (
                                            <TableRow key={log.Id}>
                                                <TableCell className="text-xs font-mono">{new Date(log.ArchiveDate).toLocaleString('ar-EG')}</TableCell>
                                                <TableCell className="font-semibold">{new Date(log.CutoffDate).toLocaleDateString('ar-EG')}</TableCell>
                                                <TableCell>{log.WarehouseName || 'كل الفروع'}</TableCell>
                                                <TableCell>{log.ArchivedByName || '-'}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="secondary">{log.TotalRecordsArchived} سجل</Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Button variant="ghost" size="sm" onClick={() => handleBrowseArchive(log.Id)}>
                                                        عرض السجلات
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <p className="text-center text-sm text-muted-foreground py-6">لا توجد عمليات أرشفة مسجلة حتى الآن.</p>
                        )}

                        {archivedBrowseData && (
                            <div className="space-y-4 pt-2 border-t">
                                <h4 className="font-bold text-sm">نتائج البحث في الأرشيف التاريخي ({archivedBrowseData.archivedSales?.length || 0} فاتورة بيع)</h4>
                                <div className="w-full overflow-auto border rounded-lg max-h-80">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>رقم الفاتورة</TableHead>
                                                <TableHead>التاريخ</TableHead>
                                                <TableHead>العميل</TableHead>
                                                <TableHead className="text-center">الإجمالي</TableHead>
                                                <TableHead className="text-center">المدفوع</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(archivedBrowseData.archivedSales || []).length > 0 ? (
                                                archivedBrowseData.archivedSales.map((inv: any) => (
                                                    <TableRow key={inv.Id}>
                                                        <TableCell className="font-mono font-bold">{inv.InvoiceNumber}</TableCell>
                                                        <TableCell className="text-xs">{new Date(inv.Date).toLocaleDateString('ar-EG')}</TableCell>
                                                        <TableCell>{inv.CustomerName || 'عميل نقدي'}</TableCell>
                                                        <TableCell className="text-center font-bold">{Number(inv.Total || 0).toLocaleString()} ج.م</TableCell>
                                                        <TableCell className="text-center text-emerald-500">{Number(inv.PaidAmount || 0).toLocaleString()} ج.م</TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">لا توجد فواتير مؤرشفة مطابقة.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

            </main>
        </>
    );
}
