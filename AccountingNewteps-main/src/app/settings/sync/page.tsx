
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Download, Upload, Loader2, AlertTriangle, History, RefreshCcw, HardDriveDownload, FileJson, CheckCircle, Clock, Trash2, Library, UploadCloud } from "lucide-react";
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
} from "@/components/ui/alert-dialog"
import localforage from 'localforage';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { navStructure } from '@/components/app-layout';
import { usePermissions } from '@/contexts/permissions-context';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const SYNC_QUEUE_KEY = 'firebase-sync-queue';

interface QueuedItem {
    path: string;
    action: 'add' | 'update' | 'remove' | 'transaction';
    payload?: any;
    id?: string;
    timestamp: string;
    syncedAt?: string;
}

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


export default function OfflineSyncStatusPage() {
    const { isOnline, syncQueueCount, processSyncQueue, syncHistory, loading: dataLoading, allData, dbAction } = useData();
    const [pendingQueue, setPendingQueue] = useState<QueuedItem[]>([]);
    const [loadingQueue, setLoadingQueue] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isReloading, setIsReloading] = useState(false);
    const [isCheckingPages, setIsCheckingPages] = useState(false);
    const [pageCheckStatus, setPageCheckStatus] = useState<Record<string, 'pending' | 'checked' | 'error' | 'uncached'>>({});
    const [pageCheckProgress, setPageCheckProgress] = useState(0);
    const [checkSummary, setCheckSummary] = useState<{ available: number; unavailable: number } | null>(null);

    const [dataSizes, setDataSizes] = useState<Record<string, number>>({});
    const { toast } = useToast();
    const { can } = usePermissions();
    const [isSecure, setIsSecure] = useState(true);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setIsSecure(window.isSecureContext);
        }
    }, []);

    const fetchQueue = useCallback(async () => {
        setLoadingQueue(true);
        const storedQueue = await localforage.getItem<any[]>(SYNC_QUEUE_KEY) || [];
        const queueWithTimestamp = storedQueue.map(item => ({ ...item, timestamp: item.timestamp || new Date().toISOString() }));
        setPendingQueue(queueWithTimestamp.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        setLoadingQueue(false);
    }, []);

    useEffect(() => {
        fetchQueue();
    }, [fetchQueue, syncQueueCount]);

    useEffect(() => {
        if (allData) {
            const sizes: Record<string, number> = {};
            for (const key in allData) {
                if (Object.prototype.hasOwnProperty.call(allData, key)) {
                    const size = new Blob([JSON.stringify(allData[key])]).size;
                    sizes[key] = size;
                }
            }
            setDataSizes(sizes);
        }
    }, [allData]);

    const totalDataSize = useMemo(() => {
        return Object.values(dataSizes).reduce((sum, size) => sum + size, 0);
    }, [dataSizes]);


    const handleManualSync = async () => {
        setIsSyncing(true);
        await processSyncQueue();
        await fetchQueue();
        setIsSyncing(false);
    };

    const handleReloadData = async () => {
        if (!isOnline) {
            toast({ variant: "destructive", title: "غير متصل", description: "يجب أن تكون متصلاً بالإنترنت لإعادة تحميل البيانات." });
            return;
        }
        setIsReloading(true);
        try {
            await localforage.clear();
            await localforage.setItem(SYNC_QUEUE_KEY, pendingQueue); // Keep the sync queue
            window.location.reload();
        } catch (error) {
            console.error("Failed to clear local cache:", error);
            toast({ variant: "destructive", title: "خطأ", description: "فشل مسح البيانات المحلية." });
            setIsReloading(false);
        }
    };
    
     const handleDeleteHistory = async () => {
        try {
            await dbAction('syncHistory', 'remove', { root: true });
            toast({ title: 'تم حذف سجل المزامنة' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حذف سجل المزامنة.' });
        }
    };

    const sortedSyncHistory = useMemo(() => {
        return [...syncHistory].sort((a,b) => new Date(b.syncedAt || 0).getTime() - new Date(a.syncedAt || 0).getTime());
    }, [syncHistory]);
    
    const getPermittedPages = useCallback((structure: readonly any[]) => {
        let pages = new Map<string, {title: string, href: string}>();
        const traverse = (items: readonly any[]) => {
            items.forEach(item => {
                if (item.module && can('view', item.module) && item.href && !pages.has(item.href)) {
                    pages.set(item.href, {title: item.title, href: item.href});
                }
                if (item.children) {
                    traverse(item.children);
                }
            });
        };
        traverse(structure);
        return Array.from(pages.values());
    }, [can]);
    
    const offlineReadyPages = useMemo(() => getPermittedPages(navStructure), [getPermittedPages]);
    
    const checkInitialCacheStatus = useCallback(async () => {
        if (typeof window === 'undefined' || !('caches' in window)) return;
        
        const statusUpdate: Record<string, 'pending' | 'checked' | 'error' | 'uncached'> = {};
        
        for (const page of offlineReadyPages) {
            try {
                const response = await caches.match(page.href);
                if (response) {
                    statusUpdate[page.href] = 'checked';
                } else {
                    statusUpdate[page.href] = 'uncached';
                }
            } catch (e) {
                statusUpdate[page.href] = 'uncached';
            }
        }
        setPageCheckStatus(prev => ({...prev, ...statusUpdate}));
        
        const available = Object.values(statusUpdate).filter(s => s === 'checked').length;
        const unavailable = Object.values(statusUpdate).filter(s => s !== 'checked').length;
        setCheckSummary({ available, unavailable });
    }, [offlineReadyPages]);

    useEffect(() => {
        checkInitialCacheStatus();
    }, [checkInitialCacheStatus]);

    const handleCheckPages = async (mode: 'check' | 'download' = 'check') => {
        if (mode === 'download' && !isOnline) {
             toast({ variant: "destructive", title: "غير متصل", description: "يجب أن تكون متصلاً بالإنترنت لتحميل الصفحات." });
             return;
        }

        setIsCheckingPages(true);
        setPageCheckStatus({});
        setPageCheckProgress(0);

        const pagesToCheck = offlineReadyPages.map(p => p.href);
        let checkedCount = 0;
        const newStatuses: Record<string, 'pending' | 'checked' | 'error' | 'uncached'> = {};

        // Helper to find the best cache to store pages in
        const getRuntimeCache = async () => {
            // Check for secure context first
            if (typeof window !== 'undefined' && !window.isSecureContext) {
                 return null;
            }

            if ('caches' in window) {
                try {
                    // Try to find our explicitly named cache first
                    const hasPagesCache = await caches.has('pages-cache');
                    if (hasPagesCache) {
                        return caches.open('pages-cache');
                    }
                    
                    // Fallback to searching
                    const keys = await caches.keys();
                    const runtimeKey = keys.find(k => k.includes('runtime') || k.includes('pages'));
                    if (runtimeKey) return caches.open(runtimeKey);
                    
                    // Final fallback
                    return caches.open('pages-cache'); // Create it if not exists
                } catch (e) {
                     console.error("Cache open failed", e);
                     return null;
                }
            }
            return null;
        };

        for (const href of pagesToCheck) {
            setPageCheckStatus(prev => ({ ...prev, [href]: 'pending' }));
            let status: 'checked' | 'error' | 'uncached' = 'uncached';

            try {
                if (mode === 'download') {
                     try {
                        // 1. Fetch the page
                        const response = await fetch(href, { cache: "no-cache" }); 
                        
                        if (response.ok) {
                            // 2. Explicitly store in cache
                            try {
                                const cache = await getRuntimeCache();
                                if (cache) {
                                    await cache.put(href, response.clone());
                                    status = 'checked';
                                } else {
                                    throw new Error("Offline storage unavailable (HTTPS required)");
                                }
                            } catch (cacheError) {
                                console.error(`Failed to cache ${href}:`, cacheError);
                                status = 'error';
                                if (checkedCount === 0) throw cacheError; // Re-throw to show toast
                            }
                        } else {
                            status = 'error';
                        }
                    } catch (e: any) {
                        console.warn(`Fetch failed for ${href}`);
                        status = 'error';
                        if (checkedCount === 0 && e.message.includes("HTTPS")) throw e;
                    }
                } else {
                     // Check mode
                     if ('caches' in window) {
                        const match = await caches.match(href);
                        if (match) status = 'checked';
                        else status = 'uncached';
                    } else {
                        status = 'uncached';
                    }
                }
                
                // Double check cache availability after download
                if (mode === 'download' && status === 'checked' && 'caches' in window) {
                     const match = await caches.match(href);
                     if (!match) {
                        // If strict match fails, try ignoreSearch
                        const matchLoose = await caches.match(href, { ignoreSearch: true });
                        if (!matchLoose) status = 'error'; 
                     }
                }

                setPageCheckStatus(prev => ({ ...prev, [href]: status }));
                newStatuses[href] = status;
            } catch (error: any) {
                setPageCheckStatus(prev => ({ ...prev, [href]: 'error' }));
                newStatuses[href] = 'error';
                if (checkedCount === 0) { // Show error toast only on first failure to avoid spam
                     toast({ 
                        variant: "destructive", 
                        title: "خطأ في التخزين المؤقت", 
                        description: error.message || "لا يمكن الوصول لواجهة التخزين. تأكد من استخدام HTTPS أو localhost." 
                    });
                }
            }
            checkedCount++;
            setPageCheckProgress((checkedCount / pagesToCheck.length) * 100);
            await new Promise(res => setTimeout(res, 50)); // Small delay between requests
        }
        
        const availableCount = Object.values(newStatuses).filter(s => s === 'checked').length;
        const unavailableCount = Object.values(newStatuses).filter(s => s !== 'checked').length;
        setCheckSummary({ available: availableCount, unavailable: unavailableCount });

        setIsCheckingPages(false);
        toast({ title: 'اكتمل الفحص', description: mode === 'download' ? `تم تحديث وتخزين الصفحات. المتاح: ${availableCount}` : `تم فحص حالة الصفحات. المتاح: ${availableCount}` });
    };


    return (
        <>
            <PageHeader title="حالة المزامنة والعمل أوفلاين">
                <div className="flex gap-2">
                    <Button onClick={handleManualSync} disabled={isSyncing || !isOnline || pendingQueue.length === 0}>
                        {isSyncing ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <UploadCloud className="ml-2 h-4 w-4" />}
                        {isSyncing ? "جارٍ المزامنة..." : "محاولة مزامنة يدوية"}
                    </Button>
                </div>
            </PageHeader>
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                {!isSecure && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>تحذير أمني (HTTPS)</AlertTitle>
                        <AlertDescription>
                            ميزات التخزين المؤقت والعمل أوفلاين غير مدعومة في هذا الاتصال.
                            <br/>
                            للتجربة من الموبايل، يرجى استخدام <b>Port Forwarding</b> عبر الكمبيوتر أو إعداد شهادة SSL (HTTPS).
                        </AlertDescription>
                    </Alert>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>البيانات المتاحة أوفلاين</CardTitle>
                            <CardDescription>
                                هذه قائمة بمجموعات البيانات التي تم تحميلها وتخزينها على جهازك للعمل في وضع عدم الاتصال. 
                                <br />
                                الإجمالي: {Object.keys(dataSizes).length} مجموعة بيانات، بحجم {formatBytes(totalDataSize)}.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <ScrollArea className="h-60 w-full rounded-md border p-2">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                    {Object.keys(dataSizes).sort().map(key => (
                                        <div key={key} className="flex items-center justify-between text-sm p-1 rounded hover:bg-muted">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle className="h-4 w-4 text-green-500" />
                                                <span className="font-mono text-xs">{key}</span>
                                            </div>
                                            <Badge variant="secondary">{formatBytes(dataSizes[key])}</Badge>
                                        </div>
                                    ))}
                                </div>
                             </ScrollArea>
                        </CardContent>
                        <CardFooter>
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" disabled={isReloading}>
                                        {isReloading ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <RefreshCcw className="ml-2 h-4 w-4"/>}
                                        إعادة تحميل كل البيانات
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            سيؤدي هذا إلى مسح ذاكرة التخزين المؤقت المحلية وإعادة تحميل جميع البيانات من الخادم. قد تستغرق هذه العملية بعض الوقت.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleReloadData}>نعم، قم بإعادة التحميل</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardFooter>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>الصفحات المتاحة أوفلاين</CardTitle>
                             <CardDescription>
                                جميع الصفحات التي يمكنك الوصول إليها حتى بدون اتصال بالإنترنت.
                                <br />
                                الإجمالي: {offlineReadyPages.length} صفحة متاحة.
                                {checkSummary && (
                                    <span className="mt-1 block font-medium">
                                        <span className="text-green-600 ml-3">متاح: {checkSummary.available}</span>
                                        <span className="text-destructive">غير متاح: {checkSummary.unavailable}</span>
                                    </span>
                                )}
                            </CardDescription>
                        </CardHeader>
                         <CardContent>
                             <div className="mb-4 space-y-1">
                                 <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>جاهزية العمل أوفلاين</span>
                                    <span>{Math.round((checkSummary?.available || 0) / (offlineReadyPages.length || 1) * 100)}%</span>
                                 </div>
                                 <Progress value={(checkSummary?.available || 0) / (offlineReadyPages.length || 1) * 100} className="h-2" />
                             </div>
                             <ScrollArea className="h-52 w-full rounded-md border p-2">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                    {offlineReadyPages.map(page => (
                                        <div key={page.href} className="flex items-center gap-2 text-sm p-1">
                                            {pageCheckStatus[page.href] === 'pending' ? <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                                            : pageCheckStatus[page.href] === 'checked' ? <CheckCircle className="h-4 w-4 text-green-500" />
                                            : pageCheckStatus[page.href] === 'error' ? <AlertTriangle className="h-4 w-4 text-destructive" />
                                            : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" title="غير مخزن" />
                                            }
                                            <span className={pageCheckStatus[page.href] === 'checked' ? '' : 'text-muted-foreground'}>{page.title}</span>
                                        </div>
                                    ))}
                                </div>
                             </ScrollArea>
                        </CardContent>
                         <CardFooter>
                             <div className="w-full space-y-2">
                                {isCheckingPages && <Progress value={pageCheckProgress} />}
                                <div className="flex gap-2">
                                    <Button variant="outline" className="flex-1" disabled={isCheckingPages || !isSecure} onClick={() => handleCheckPages('check')}>
                                        {isCheckingPages ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Library className="ml-2 h-4 w-4"/>}
                                        {isCheckingPages ? 'جارٍ الفحص...' : 'فحص الحالة'}
                                    </Button>
                                    <Button variant="secondary" className="flex-1" disabled={isCheckingPages || !isOnline || !isSecure} onClick={() => handleCheckPages('download')}>
                                        {isCheckingPages ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <HardDriveDownload className="ml-2 h-4 w-4"/>}
                                        {isCheckingPages ? 'جارٍ التحميل...' : 'تحديث وتخزين'}
                                    </Button>
                                </div>
                             </div>
                        </CardFooter>
                    </Card>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>المعاملات المعلقة للمزامنة</CardTitle>
                        <CardDescription>
                            هذه قائمة بالعمليات التي تنتظر المزامنة مع السحابة. 
                            الحالة الحالية: {isOnline ? <span className="text-green-500 font-bold">متصل</span> : <span className="text-destructive font-bold">غير متصل</span>}.
                             إجمالي المعاملات المعلقة: <Badge>{pendingQueue.length}</Badge>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingQueue ? (
                            <div className="flex justify-center items-center py-10">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="w-full overflow-auto border rounded-lg max-h-[40vh]">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>وقت الإنشاء (أوفلاين)</TableHead>
                                            <TableHead>النوع</TableHead>
                                            <TableHead>المسار</TableHead>
                                            <TableHead className="text-center">عرض البيانات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingQueue.length > 0 ? pendingQueue.map((item, index) => (
                                            <TableRow key={index} className="bg-amber-500/10">
                                                <TableCell>{new Date(item.timestamp).toLocaleString('ar-EG')}</TableCell>
                                                <TableCell>
                                                    <Badge variant={
                                                        item.action === 'add' ? 'default' :
                                                        item.action === 'update' ? 'secondary' :
                                                        item.action === 'remove' ? 'destructive' : 'outline'
                                                    }>{item.action}</Badge>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">{item.path}/{item.id || item.payload?.id || ''}</TableCell>
                                                <TableCell className="text-center">
                                                    <Dialog>
                                                        <DialogTrigger asChild>
                                                            <Button variant="ghost" size="icon">
                                                                <FileJson className="h-4 w-4" />
                                                            </Button>
                                                        </DialogTrigger>
                                                        <DialogContent>
                                                            <DialogHeader>
                                                                <DialogTitle>تفاصيل العملية المعلقة</DialogTitle>
                                                            </DialogHeader>
                                                            <ScrollArea className="max-h-80 w-full rounded-md border p-4 bg-muted">
                                                                <pre className="text-sm">
                                                                    {JSON.stringify(item.payload || { info: "No payload available." }, null, 2)}
                                                                </pre>
                                                            </ScrollArea>
                                                        </DialogContent>
                                                    </Dialog>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                                    قائمة انتظار المزامنة فارغة. كل البيانات محدّثة.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader className="flex-row items-center justify-between">
                         <div>
                            <CardTitle>سجل المزامنة (آخر 100 عملية)</CardTitle>
                            <CardDescription>
                                هذه قائمة بالعمليات التي تمت مزامنتها بنجاح مع السحابة.
                            </CardDescription>
                        </div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                    <Trash2 className="ml-2 h-4 w-4" />
                                    حذف السجل
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                                    <AlertDialogDescription>سيتم حذف سجل المزامنة من قاعدة البيانات نهائياً. هذا الإجراء لن يؤثر على بياناتك الفعلية.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteHistory}>نعم، قم بالحذف</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardHeader>
                    <CardContent>
                        {dataLoading && syncHistory.length === 0 ? (
                            <div className="flex justify-center items-center py-10">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="w-full overflow-auto border rounded-lg max-h-[60vh]">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>وقت الإنشاء</TableHead>
                                            <TableHead>وقت المزامنة</TableHead>
                                            <TableHead>النوع</TableHead>
                                            <TableHead>المسار</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedSyncHistory.length > 0 ? sortedSyncHistory.map((item: any) => (
                                            <TableRow key={item.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                                        {new Date(item.timestamp).toLocaleString('ar-EG')}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2 text-green-600">
                                                        <CheckCircle className="h-4 w-4"/>
                                                        {item.syncedAt ? new Date(item.syncedAt).toLocaleString('ar-EG') : '-'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant='secondary'>{item.action}</Badge>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">{item.path}/{item.originalId || item.payload?.id || ''}</TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                                   لا يوجد سجل مزامنة حتى الآن.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
