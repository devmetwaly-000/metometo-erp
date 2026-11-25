"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useData } from '@/contexts/data-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle,
    Database, Cloud, Clock, Layers, Receipt, Globe, ShieldCheck,
    Check
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function PosSyncStatusBadge({ className }: { className?: string }) {
    const {
        isOnline,
        offlineQueueCount,
        isSyncingOffline,
        flushOfflineSyncQueue,
        retryDatabaseConnection,
        allData
    } = useData();

    const { toast } = useToast();
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isCheckingConnection, setIsCheckingConnection] = useState(false);
    const [queueItems, setQueueItems] = useState<any[]>([]);

    // قراءة تفاصيل طابور العمليات الأوفلاين من التخزين المحلي
    const loadQueueItems = useCallback(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem('app_offline_sync_queue');
            if (!raw) {
                setQueueItems([]);
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setQueueItems(parsed.reverse()); // الأحدث أولاً
            } else {
                setQueueItems([]);
            }
        } catch {
            setQueueItems([]);
        }
    }, []);

    useEffect(() => {
        loadQueueItems();
        const handler = () => loadQueueItems();
        window.addEventListener('offline-queue-updated', handler);
        window.addEventListener('storage', handler);
        return () => {
            window.removeEventListener('offline-queue-updated', handler);
            window.removeEventListener('storage', handler);
        };
    }, [loadQueueItems, offlineQueueCount]);

    // حساب إجمالي مبيعات الفواتير المحفوظة أوفلاين
    const { offlineInvoicesCount, totalOfflineAmount } = useMemo(() => {
        let count = 0;
        let amount = 0;
        for (const item of queueItems) {
            const p = item.path || '';
            if (p.startsWith('posSales') || p.startsWith('salesInvoices')) {
                count++;
                const itemTotal = Number(item.payload?.total || item.payload?.finalAmount || 0);
                amount += itemTotal;
            }
        }
        return {
            offlineInvoicesCount: count || queueItems.length,
            totalOfflineAmount: amount
        };
    }, [queueItems]);

    // تنفيذ مزامنة يدوية فورية
    const handleManualSync = async () => {
        if (!navigator.onLine) {
            toast({
                variant: 'destructive',
                title: 'الجهاز غير متصل بالإنترنت',
                description: 'يرجى التأكد من اتصال الإنترنت أو كابل الشبكة قبل المزامنة.'
            });
            return;
        }

        try {
            toast({
                title: 'جارٍ بدء المزامنة الحية...',
                description: `جارٍ ترحيل ${queueItems.length} عملية مخزنة محلياً إلى السحابة.`
            });
            await flushOfflineSyncQueue();
            loadQueueItems();
            toast({
                title: 'تمت المزامنة بنجاح ✅',
                description: 'تم تحديث وترحيل جميع الفواتير والعمليات المحلية إلى السحابة.'
            });
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'فشلت المزامنة',
                description: err?.message || 'تعذر استكمال المزامنة السحابية.'
            });
        }
    };

    // فحص الاتصال بالسيرفر
    const handleCheckConnection = async () => {
        setIsCheckingConnection(true);
        try {
            const ok = await retryDatabaseConnection();
            if (ok) {
                toast({
                    title: 'الاتصال بالسيرفر نشط ✅',
                    description: 'السيرفر وقاعدة البيانات متصلان ويعملان بشكل ممتاز.'
                });
                if (queueItems.length > 0) {
                    await handleManualSync();
                }
            } else {
                toast({
                    variant: 'destructive',
                    title: 'تعذر الاتصال بالسيرفر',
                    description: 'النظام مستمر بالعمل في وضع الأوفلاين (IndexedDB) بأمان تام.'
                });
            }
        } finally {
            setIsCheckingConnection(false);
        }
    };

    // تحديد نوع السيرفر وقاعدة البيانات الحالية
    const dbTypeLabel = useMemo(() => {
        const branchServer = allData?.settings?.db_config?.server || '';
        if (branchServer === 'indexeddb' || branchServer.includes('indexeddb')) {
            return 'تخزين متصفح ذكي (IndexedDB) + سحابة Firebase';
        }
        return 'سيرفر الفرع المحلي (SQL Server) + مزامنة سحابية';
    }, [allData?.settings?.db_config]);

    // 1. حالة جاري المزامنة
    if (isSyncingOffline) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setIsDetailsOpen(true)}
                    className={cn(
                        "h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg border flex items-center gap-1.5 sm:gap-2 transition-all font-bold text-xs select-none",
                        "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/20 animate-pulse",
                        className
                    )}
                    title="جارٍ مزامنة العمليات المحلية مع السحابة"
                >
                    <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="hidden xs:inline">جاري المزامنة...</span>
                    {offlineQueueCount > 0 && (
                        <Badge className="bg-amber-600 hover:bg-amber-600 text-white text-[10px] h-4.5 px-1.5 py-0 font-mono">
                            {offlineQueueCount}
                        </Badge>
                    )}
                </button>
                {renderDetailsDialog()}
            </>
        );
    }

    // 2. حالة عدم الاتصال (Offline)
    if (!isOnline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setIsDetailsOpen(true)}
                    className={cn(
                        "h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg border flex items-center gap-1.5 sm:gap-2 transition-all font-bold text-xs select-none",
                        "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/40 hover:bg-rose-500/20",
                        className
                    )}
                    title="النظام يعمل في وضع الأوفلاين المحلي - الفواتير محفوظة بأمان في المتصفح"
                >
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
                    </span>
                    <WifiOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span className="hidden sm:inline">أوفلاين محلي</span>
                    {offlineQueueCount > 0 && (
                        <Badge variant="destructive" className="text-[10px] h-4.5 px-1.5 py-0 font-mono font-bold animate-bounce">
                            {offlineInvoicesCount} معلقة
                        </Badge>
                    )}
                </button>
                {renderDetailsDialog()}
            </>
        );
    }

    // 3. حالة متصل مع وجود فواتير معلقة بانتظار استكمال الترحيل
    if (offlineQueueCount > 0) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setIsDetailsOpen(true)}
                    className={cn(
                        "h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg border flex items-center gap-1.5 sm:gap-2 transition-all font-bold text-xs select-none",
                        "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/20",
                        className
                    )}
                    title="متصل - توجد فواتير محلية بانتظار المزامنة"
                >
                    <Wifi className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 shrink-0" />
                    <span className="hidden xs:inline">متصل</span>
                    <Badge className="bg-amber-600 hover:bg-amber-600 text-white text-[10px] h-4.5 px-1.5 py-0 font-mono">
                        {offlineInvoicesCount} بانتظار المزامنة
                    </Badge>
                </button>
                {renderDetailsDialog()}
            </>
        );
    }

    // 4. حالة متصل وجميع البيانات متزامنة 100%
    return (
        <>
            <button
                type="button"
                onClick={() => setIsDetailsOpen(true)}
                className={cn(
                    "h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg border flex items-center gap-1.5 sm:gap-2 transition-all font-bold text-xs select-none",
                    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20",
                    className
                )}
                title="متصل بالسحابة - جميع الفواتير متزامنة لحظياً"
            >
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
                <Wifi className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">متصل بالسحابة</span>
                <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 font-normal border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hidden md:inline-flex">
                    متزامن ✅
                </Badge>
            </button>
            {renderDetailsDialog()}
        </>
    );

    // نافذة تفاصيل المزامنة الحية وطابور الفواتير
    function renderDetailsDialog() {
        return (
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="sm:max-w-md w-[95vw] text-right" dir="rtl">
                    <DialogHeader className="border-b pb-3">
                        <DialogTitle className="text-base font-bold flex items-center gap-2">
                            <Layers className="h-5 w-5 text-primary" />
                            حالة المزامنة الحية وعداد فواتير الأوفلاين
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground mt-1">
                            متابعة لحظية لاتصال الكاشير مع السحابة وإدارة الفواتير المحفوظة محلياً.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3.5 py-2">
                        {/* بطاقة ملخص الحالة المباشرة */}
                        <div className={cn(
                            "p-3 rounded-xl border flex items-center justify-between gap-3",
                            isOnline 
                                ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-800 dark:text-emerald-200" 
                                : "bg-rose-500/5 border-rose-500/30 text-rose-800 dark:text-rose-200"
                        )}>
                            <div className="flex items-center gap-2.5">
                                <div className={cn(
                                    "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                                    isOnline ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"
                                )}>
                                    {isOnline ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                                </div>
                                <div>
                                    <div className="font-bold text-sm">
                                        {isOnline ? '🟢 متصل بالسحابة وقاعدة البيانات' : '🔴 وضع الأوفلاين المحلي (Offline-First)'}
                                    </div>
                                    <div className="text-[11px] opacity-80 mt-0.5 font-medium">
                                        {isOnline 
                                            ? 'الفواتير تُسجل وترحّل سحابياً بشكل فوري.' 
                                            : 'يتم حفظ الفواتير بأمان تام داخل المتصفح محلياً (IndexedDB).'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* إحصائيات طابور الأوفلاين */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-2.5 rounded-xl border bg-card text-center">
                                <div className="text-[11px] text-muted-foreground font-semibold flex items-center justify-center gap-1">
                                    <Receipt className="h-3.5 w-3.5 text-primary" />
                                    فواتير معلقة
                                </div>
                                <div className="text-xl font-bold font-mono mt-1 text-foreground">
                                    {offlineInvoicesCount}
                                </div>
                            </div>
                            <div className="p-2.5 rounded-xl border bg-card text-center">
                                <div className="text-[11px] text-muted-foreground font-semibold flex items-center justify-center gap-1">
                                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                                    إجمالي المبيعات المعلقة
                                </div>
                                <div className="text-lg font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
                                    {totalOfflineAmount > 0 ? `${totalOfflineAmount.toLocaleString()} ج.م` : '0 ج.م'}
                                </div>
                            </div>
                        </div>

                        {/* وضع التخزين الحالي */}
                        <div className="p-2.5 rounded-lg border bg-muted/40 text-xs space-y-1">
                            <div className="flex items-center justify-between text-muted-foreground font-medium">
                                <span className="flex items-center gap-1.5">
                                    <Database className="h-3.5 w-3.5 text-primary" />
                                    آلية التشغيل:
                                </span>
                                <span className="font-bold text-foreground font-mono text-[11px]">{dbTypeLabel}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t border-border/40">
                                🛡️ <strong>حماية البيانات:</strong> حتى في حال انقطاع الإنترنت أو إغلاق المتصفح، جميع عمليات البيع مخزنة في قاعدة البيانات المحلية المشفرة وستتم مزامنتها تلقائياً فور عودة الاتصال.
                            </p>
                        </div>

                        {/* قائمة العمليات المعلقة في الطابور إن وجدت */}
                        {queueItems.length > 0 && (
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs font-bold text-foreground">
                                    <span>سجل العمليات المعلقة ({queueItems.length}):</span>
                                    <span className="text-[10px] text-muted-foreground font-normal">الأحدث أولاً</span>
                                </div>
                                <ScrollArea className="h-36 rounded-lg border bg-muted/20 p-2">
                                    <div className="space-y-1.5">
                                        {queueItems.map((q, idx) => {
                                            const isSale = (q.path || '').startsWith('posSales') || (q.path || '').startsWith('salesInvoices');
                                            const invNo = q.payload?.invoiceNumber || q.payload?.id || `عملية #${idx + 1}`;
                                            const total = Number(q.payload?.total || q.payload?.finalAmount || 0);
                                            const timeStr = q.timestamp ? new Date(q.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
                                            return (
                                                <div key={q.id || idx} className="p-2 rounded-md border bg-card text-xs flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <Receipt className="h-3.5 w-3.5 text-primary shrink-0" />
                                                        <div>
                                                            <div className="font-bold font-mono text-[11px]">{invNo}</div>
                                                            <div className="text-[10px] text-muted-foreground">{isSale ? 'فاتورة كاشير' : q.path} • {timeStr}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-left font-mono font-bold text-xs">
                                                        {total > 0 ? `${total.toLocaleString()} ج.م` : <Badge variant="outline" className="text-[9px] py-0">معلق</Badge>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex flex-col sm:flex-row gap-2 border-t pt-3">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 font-bold text-xs gap-1.5 w-full sm:w-auto"
                            onClick={handleCheckConnection}
                            disabled={isCheckingConnection}
                        >
                            <RefreshCw className={cn("h-3.5 w-3.5", isCheckingConnection && "animate-spin")} />
                            {isCheckingConnection ? 'جارٍ الفحص...' : 'فحص الاتصال بالسيرفر'}
                        </Button>

                        {queueItems.length > 0 && (
                            <Button
                                type="button"
                                size="sm"
                                className="h-9 font-bold text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
                                onClick={handleManualSync}
                                disabled={isSyncingOffline}
                            >
                                <RefreshCw className={cn("h-3.5 w-3.5", isSyncingOffline && "animate-spin")} />
                                {isSyncingOffline ? 'جارٍ المزامنة الآن...' : `مزامنة الفواتير الآن (${offlineInvoicesCount}) 🚀`}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }
}
