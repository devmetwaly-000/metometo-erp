'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useData } from '@/contexts/data-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScaleItem, ScaleModel, generateScaleBarcode } from '@/lib/scale-export';
import { RegisteredScale } from '@/app/api/scales/broadcast/route';
import { 
    Scale, 
    Download, 
    Send, 
    FileSpreadsheet, 
    FileText, 
    Search, 
    Wifi, 
    CheckCircle2, 
    AlertCircle, 
    Loader2, 
    RefreshCw,
    SlidersHorizontal,
    Plus,
    Radio,
    Trash2,
    Settings,
    Edit,
    Check,
    X,
    Activity,
    Layers,
    Server,
    Sparkles
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_SCALES: RegisteredScale[] = [
    { id: 'scale-1', name: 'ميزان الجبن والألبان 1', ip: '192.168.1.151', port: 3001, model: 'mettler_toledo', departmentName: 'الأجبان', enabled: true },
    { id: 'scale-2', name: 'ميزان الجزارة واللحوم 2', ip: '192.168.1.152', port: 3001, model: 'mettler_toledo', departmentName: 'اللحوم', enabled: true },
    { id: 'scale-3', name: 'ميزان الخضار والفاكهة 3', ip: '192.168.1.153', port: 3001, model: 'mettler_toledo', departmentName: 'الخضار والفاكهة', enabled: true },
    { id: 'scale-4', name: 'ميزan الأسماك 4', ip: '192.168.1.154', port: 3001, model: 'mettler_toledo', departmentName: 'الأسماك', enabled: true },
    { id: 'scale-5', name: 'ميزان المخبوزات 5', ip: '192.168.1.155', port: 3001, model: 'mettler_toledo', departmentName: 'المخبوزات', enabled: true },
];

export default function ScaleExportPage() {
    const { allItems = [], items = [], itemCategories = [], dbAction, settings } = useData();
    const effectiveItems = allItems.length > 0 ? allItems : items;
    const { toast } = useToast();

    // Active tab
    const [activeTab, setActiveTab] = useState<'network' | 'items'>('network');

    // Scale config state
    const [selectedModel, setSelectedModel] = useState<ScaleModel>('mettler_toledo');
    const [barcodePrefix, setBarcodePrefix] = useState('21');
    const [shelfLifeDays, setShelfLifeDays] = useState(15);
    const [onlyWeighted, setOnlyWeighted] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    // Registered Scales list
    const [scales, setScales] = useState<RegisteredScale[]>([]);

    // Load registered scales from settings or localStorage
    useEffect(() => {
        try {
            const savedFromDb = settings?.main?.barcodeScales || settings?.barcodeScales;
            if (Array.isArray(savedFromDb) && savedFromDb.length > 0) {
                setScales(savedFromDb);
                return;
            }
            const local = localStorage.getItem('system_barcode_scales');
            if (local) {
                const parsed = JSON.parse(local);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setScales(parsed);
                    return;
                }
            }
            setScales(DEFAULT_SCALES);
        } catch {
            setScales(DEFAULT_SCALES);
        }
    }, [settings]);

    // Save scales list to localStorage and dbAction
    const saveScalesList = useCallback(async (newScales: RegisteredScale[]) => {
        setScales(newScales);
        try {
            localStorage.setItem('system_barcode_scales', JSON.stringify(newScales));
            if (dbAction) {
                await dbAction('settings', 'update', {
                    id: 'main',
                    data: { barcodeScales: newScales }
                });
            }
        } catch (e) {
            console.warn('Failed to persist scales list:', e);
        }
    }, [dbAction]);

    // Batch Range Generator dialog state
    const [isRangeDialogOpen, setIsRangeDialogOpen] = useState(false);
    const [rangePrefix, setRangePrefix] = useState('ميزان');
    const [rangeStartIp, setRangeStartIp] = useState('192.168.1.150');
    const [rangeCount, setRangeCount] = useState(20);
    const [rangeModel, setRangeModel] = useState<ScaleModel>('mettler_toledo');
    const [rangePort, setRangePort] = useState(3001);

    // Single Scale Edit/Add dialog state
    const [isScaleDialogOpen, setIsScaleDialogOpen] = useState(false);
    const [editingScale, setEditingScale] = useState<Partial<RegisteredScale> | null>(null);

    // Broadcast (Send to All) state
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [isPingingAll, setIsPingingAll] = useState(false);
    const [broadcastProgress, setBroadcastProgress] = useState(0);
    const [broadcastResults, setBroadcastResults] = useState<any[]>([]);
    const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);

    // Exporting file loader
    const [isExporting, setIsExporting] = useState(false);

    // Filter items suitable for scales
    const filteredItems: ScaleItem[] = useMemo(() => {
        return (effectiveItems || [])
            .filter((item: any) => {
                if (!item) return false;

                // Category filter
                if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) {
                    return false;
                }

                // Search query
                if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase().trim();
                    const nameMatch = (item.name || '').toLowerCase().includes(q);
                    const codeMatch = (item.code || '').toLowerCase().includes(q);
                    const barcodeMatch = (item.barcode || '').toLowerCase().includes(q);
                    if (!nameMatch && !codeMatch && !barcodeMatch) return false;
                }

                // Weighted items filter
                if (onlyWeighted) {
                    const unit = String(item.unit || item.baseUnit || '').toLowerCase();
                    const barcode = String(item.barcode || '');
                    const isWeightName = /كيلو|كجم|وزن|جرام|kg|gram|g|كيلوغرام/i.test(unit) ||
                                         /لحم|جبن|خضار|فاكهة|دجاج|سمك|مكسرات|بهارات|وزن/i.test(item.name || '');
                    const isWeightBarcode = barcode.startsWith('21') || barcode.startsWith('20') || barcode.startsWith('22');
                    const isWeightFlag = item.isWeightBased || item.isWeighed || item.weighed;

                    return Boolean(isWeightName || isWeightBarcode || isWeightFlag);
                }

                return true;
            })
            .map((item: any, index: number) => ({
                id: item.id || `item-${index}`,
                code: item.code || String(index + 1),
                plu: item.plu ? Number(item.plu) : (index + 1),
                pluNumber: item.plu ? Number(item.plu) : (index + 1),
                name: item.name || 'صنف بدون اسم',
                barcode: item.barcode || generateScaleBarcode(barcodePrefix, item.code || String(index + 1)),
                price: Number(item.price || item.sellingPrice || item.sellPrice || 0),
                unit: item.unit || item.baseUnit || 'كجم',
                category: itemCategories.find((c: any) => c.id === item.categoryId)?.name || 'عام',
                shelfLifeDays: item.shelfLifeDays || shelfLifeDays,
            }));
    }, [effectiveItems, itemCategories, selectedCategory, searchQuery, onlyWeighted, barcodePrefix, shelfLifeDays]);

    // Handle File Export via API
    const handleDownload = async (model: ScaleModel) => {
        if (filteredItems.length === 0) {
            toast({
                variant: 'destructive',
                title: 'لا توجد أصناف',
                description: 'يرجى التأكد من وجود أصناف مطابقة للتصدير'
            });
            return;
        }

        setIsExporting(true);
        try {
            const res = await fetch('/api/scales/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scaleModel: model,
                    items: filteredItems,
                    barcodePrefix,
                    shelfLifeDays
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || 'فشل توليد ملف الميزان');
            }

            const blob = await res.blob();
            const disposition = res.headers.get('Content-Disposition');
            let filename = `scale_export_${model}.csv`;
            if (disposition && disposition.includes('filename=')) {
                filename = decodeURIComponent(disposition.split('filename=')[1].replace(/["']/g, ''));
            } else if (model === 'universal_excel') {
                filename = `Scale_PLU_Export.xlsx`;
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast({
                title: 'تم تصدير ملف الميزان بنجاح ✅',
                description: `تم تنزيل ${filteredItems.length} صنف بصيغة ${model.toUpperCase()}`
            });
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'خطأ في التصدير',
                description: err.message
            });
        } finally {
            setIsExporting(false);
        }
    };

    // -------------------------------------------------------------
    // PING ALL SCALES (فحص اتصال الموازين الـ 20 دفعة واحدة)
    // -------------------------------------------------------------
    const handlePingAll = async () => {
        const enabledScales = scales.filter(s => s.enabled !== false);
        if (enabledScales.length === 0) {
            toast({ variant: 'destructive', title: 'لا توجد موازين مفعلة للفحص' });
            return;
        }

        setIsPingingAll(true);
        toast({ title: `جارٍ فحص اتصال ${enabledScales.length} ميزان على الشبكة... 📡` });

        try {
            const res = await fetch('/api/scales/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'ping',
                    scales: enabledScales,
                    timeoutMs: 3000
                })
            });

            const data = await res.json();
            if (data.success && Array.isArray(data.results)) {
                const resultMap = new Map(data.results.map((r: any) => [r.id, r]));
                const updated: RegisteredScale[] = scales.map(s => {
                    const r: any = resultMap.get(s.id);
                    if (r) {
                        return {
                            ...s,
                            lastStatus: (r.online ? 'online' : 'offline') as 'online' | 'offline',
                            latencyMs: r.latencyMs,
                            lastSync: new Date().toLocaleTimeString('ar-EG')
                        };
                    }
                    return s;
                });
                await saveScalesList(updated);
                toast({
                    title: `اكتمل الفحص: ${data.onlineCount} ميزان متصل 🟢 من أصل ${data.totalScales}`,
                    description: data.offlineCount > 0 ? `يوجد ${data.offlineCount} ميزان غير متصل أو مغلق 🔴` : 'جميع الموازين متصلة وجاهزة!'
                });
            } else {
                throw new Error(data.message || 'فشل الفحص');
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'خطأ في فحص الشبكة', description: err.message });
        } finally {
            setIsPingingAll(false);
        }
    };

    // -------------------------------------------------------------
    // BROADCAST SEND TO ALL SCALES (تحديث جميع الـ 20 ميزان بنقرة واحدة)
    // -------------------------------------------------------------
    const handleBroadcastToAll = async () => {
        const enabledScales = scales.filter(s => s.enabled !== false);
        if (enabledScales.length === 0) {
            toast({ variant: 'destructive', title: 'لا توجد موازين مفعلة للتحديث' });
            return;
        }

        if (filteredItems.length === 0) {
            toast({ variant: 'destructive', title: 'لا توجد أصناف للإرسال' });
            return;
        }

        setIsBroadcasting(true);
        setIsBroadcastModalOpen(true);
        setBroadcastProgress(15);
        setBroadcastResults([]);

        try {
            const res = await fetch('/api/scales/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'send',
                    scales: enabledScales,
                    items: filteredItems,
                    barcodePrefix,
                    shelfLifeDays,
                    timeoutMs: 6000
                })
            });

            const data = await res.json();
            setBroadcastProgress(100);

            if (data.success && Array.isArray(data.results)) {
                setBroadcastResults(data.results);
                const resultMap = new Map(data.results.map((r: any) => [r.id, r]));

                const updated: RegisteredScale[] = scales.map(s => {
                    const r: any = resultMap.get(s.id);
                    if (r) {
                        return {
                            ...s,
                            lastStatus: (r.success ? 'online' : 'error') as 'online' | 'error',
                            latencyMs: r.latencyMs,
                            lastSync: new Date().toLocaleTimeString('ar-EG')
                        };
                    }
                    return s;
                });
                await saveScalesList(updated);

                toast({
                    title: `تم إرسال التحديث لـ ${data.successCount} ميزان بنجاح! 🚀`,
                    description: data.failCount > 0 ? `تعذر الاتصال بـ ${data.failCount} ميزان (مغلقة أو غير موصلة بالشبكة).` : 'تم تحديث كافة الموازين بالكامل!'
                });
            } else {
                throw new Error(data.message || 'فشل التحديث الجماعي');
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'خطأ في الإرسال الجماعي', description: err.message });
        } finally {
            setIsBroadcasting(false);
        }
    };

    // -------------------------------------------------------------
    // IP RANGE GENERATOR (معالج إنشاء 20+ ميزان بضغطة واحدة)
    // -------------------------------------------------------------
    const handleGenerateIpRange = async () => {
        const parts = rangeStartIp.trim().split('.');
        if (parts.length !== 4) {
            toast({ variant: 'destructive', title: 'عنوان IP غير صالح', description: 'مثال: 192.168.1.150' });
            return;
        }

        const basePrefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
        const startNum = parseInt(parts[3], 10);

        if (isNaN(startNum) || startNum < 1 || startNum > 254) {
            toast({ variant: 'destructive', title: 'رقم النهاية غير صالح في الـ IP' });
            return;
        }

        const count = Math.min(Math.max(Number(rangeCount) || 1, 1), 100);
        const generated: RegisteredScale[] = [];

        for (let i = 0; i < count; i++) {
            const currentIpNum = startNum + i;
            if (currentIpNum > 254) break;

            const scaleNumber = i + 1;
            generated.push({
                id: `scale-auto-${Date.now()}-${scaleNumber}`,
                name: `${rangePrefix} ${scaleNumber}`,
                ip: `${basePrefix}.${currentIpNum}`,
                port: rangePort || (rangeModel === 'mettler_toledo' ? 3001 : (rangeModel === 'cas_cl5000' ? 2002 : 4001)),
                model: rangeModel,
                departmentName: 'الكل',
                enabled: true
            });
        }

        const combined = [...scales, ...generated];
        await saveScalesList(combined);
        setIsRangeDialogOpen(false);
        toast({
            title: `تم توليد وإضافة ${generated.length} ميزان بنجاح! ⚡`,
            description: `من الـ IP ${basePrefix}.${startNum} وحتى ${basePrefix}.${startNum + generated.length - 1}`
        });
    };

    // -------------------------------------------------------------
    // ADD / EDIT SINGLE SCALE
    // -------------------------------------------------------------
    const handleSaveSingleScale = async () => {
        if (!editingScale || !editingScale.name?.trim() || !editingScale.ip?.trim()) {
            toast({ variant: 'destructive', title: 'بيانات غير مكتملة', description: 'يرجى كتابة اسم الميزان وعنوان IP' });
            return;
        }

        let updated: RegisteredScale[];
        if (editingScale.id) {
            updated = scales.map(s => s.id === editingScale.id ? { ...s, ...editingScale } as RegisteredScale : s);
        } else {
            const newScale: RegisteredScale = {
                id: `scale-${Date.now()}`,
                name: editingScale.name.trim(),
                ip: editingScale.ip.trim(),
                port: Number(editingScale.port) || 3001,
                model: editingScale.model || 'mettler_toledo',
                departmentName: editingScale.departmentName || 'الكل',
                enabled: editingScale.enabled !== false
            };
            updated = [...scales, newScale];
        }

        await saveScalesList(updated);
        setIsScaleDialogOpen(false);
        setEditingScale(null);
        toast({ title: 'تم حفظ الميزان بنجاح ✅' });
    };

    const handleDeleteScale = async (id: string) => {
        const updated = scales.filter(s => s.id !== id);
        await saveScalesList(updated);
        toast({ title: 'تم حذف الميزان' });
    };

    const handleToggleScale = async (id: string, enabled: boolean) => {
        const updated = scales.map(s => s.id === id ? { ...s, enabled } : s);
        await saveScalesList(updated);
    };

    // Quick Stats
    const onlineScalesCount = scales.filter(s => s.lastStatus === 'online').length;
    const offlineScalesCount = scales.filter(s => s.lastStatus === 'offline' || s.lastStatus === 'error').length;

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6" dir="rtl">
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-card p-6 rounded-xl border shadow-sm">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Scale className="h-8 w-8 text-primary" />
                        <h1 className="text-2xl font-bold tracking-tight">مركز إدارة وبث موازين الباركود الإلكترونية (Multi-Scale Network)</h1>
                        <Badge variant="outline" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">
                            Enterprise 20+ Scales
                        </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">
                        إدارة أكثر من 20 ميزان شبكي (Mettler Toledo, CAS, Rongta, Dibal) وتحديث الأسعار جماعياً بضغطة زر واحدة عبر الشبكة المحلية (LAN/Wi-Fi).
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button 
                        variant="default"
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                        onClick={handleBroadcastToAll}
                        disabled={isBroadcasting || scales.length === 0}
                    >
                        {isBroadcasting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                جارٍ التحديث الجماعي...
                            </>
                        ) : (
                            <>
                                <Send className="h-4 w-4" />
                                تحديث جميع الموازين ({scales.filter(s => s.enabled !== false).length})
                            </>
                        )}
                    </Button>

                    <Button 
                        variant="outline" 
                        className="gap-2"
                        onClick={handlePingAll}
                        disabled={isPingingAll || scales.length === 0}
                    >
                        {isPingingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4 text-primary" />}
                        فحص اتصال الشبكة (Ping)
                    </Button>

                    <Button 
                        variant="outline" 
                        className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
                        onClick={() => setIsRangeDialogOpen(true)}
                    >
                        <Sparkles className="h-4 w-4" />
                        توليد نطاق موازين (20+)
                    </Button>
                </div>
            </div>

            {/* Quick KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="p-4 pb-2">
                        <CardDescription className="text-xs">إجمالي الموازين المسجلة</CardDescription>
                        <CardTitle className="text-2xl font-bold font-mono">{scales.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <span className="text-xs text-muted-foreground">موزعة على الأقسام</span>
                    </CardContent>
                </Card>

                <Card className="border-emerald-200 bg-emerald-50/20">
                    <CardHeader className="p-4 pb-2">
                        <CardDescription className="text-xs text-emerald-700">الموازين المتصلة بالشبكة (Online)</CardDescription>
                        <CardTitle className="text-2xl font-bold font-mono text-emerald-600">{onlineScalesCount}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <span className="text-xs text-emerald-600 font-medium">جاهزة للتحديث الفوري</span>
                    </CardContent>
                </Card>

                <Card className={offlineScalesCount > 0 ? "border-amber-200 bg-amber-50/20" : ""}>
                    <CardHeader className="p-4 pb-2">
                        <CardDescription className="text-xs text-muted-foreground">موازين غير متصلة أو مغلقة</CardDescription>
                        <CardTitle className="text-2xl font-bold font-mono text-amber-600">{offlineScalesCount}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <span className="text-xs text-muted-foreground">تحتاج مراجعة الكابل أو الطاقة</span>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="p-4 pb-2">
                        <CardDescription className="text-xs">الأصناف الموزونة النشطة</CardDescription>
                        <CardTitle className="text-2xl font-bold font-mono text-primary">{filteredItems.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <span className="text-xs text-muted-foreground">صنف جاهز للإرسال للموازين</span>
                    </CardContent>
                </Card>
            </div>

            {/* Main Tabs */}
            <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)}>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b pb-3">
                    <TabsList>
                        <TabsTrigger value="network" className="gap-2">
                            <Server className="h-4 w-4" />
                            إدارة شبكة الموازين ({scales.length} ميزان)
                        </TabsTrigger>
                        <TabsTrigger value="items" className="gap-2">
                            <Layers className="h-4 w-4" />
                            معاينة الأصناف وتصدير الملفات
                        </TabsTrigger>
                    </TabsList>

                    {activeTab === 'network' && (
                        <Button 
                            size="sm" 
                            className="gap-1.5"
                            onClick={() => {
                                setEditingScale({
                                    name: `ميزان رقم ${scales.length + 1}`,
                                    ip: '192.168.1.',
                                    port: 3001,
                                    model: 'mettler_toledo',
                                    departmentName: 'الكل',
                                    enabled: true
                                });
                                setIsScaleDialogOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            إضافة ميزان فردي
                        </Button>
                    )}
                </div>

                {/* TAB 1: NETWORK SCALES DIRECTORY (إدارة الموازين الـ 20+) */}
                <TabsContent value="network" className="space-y-4 pt-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">دليل موازين الفروع والأقسام</CardTitle>
                                    <CardDescription>
                                        يمكنك ضبط إعدادات كل ميزان، تخصيص الأصناف المرسلة لكل ميزان حسب قسمه (أجبان، جزارة، خضار)، وفحص حالة الاتصال في ثوانٍ.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="border-t overflow-auto max-h-[600px]">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                                        <TableRow>
                                            <TableHead className="w-12 text-center">تفعيل</TableHead>
                                            <TableHead className="w-16 text-center">#</TableHead>
                                            <TableHead>اسم الميزان والموقع</TableHead>
                                            <TableHead className="w-36">القسم المستهدف</TableHead>
                                            <TableHead className="w-44">طراز الميزان</TableHead>
                                            <TableHead className="w-48 font-mono">عنوان IP والمنفذ</TableHead>
                                            <TableHead className="w-32 text-center">حالة الاتصال</TableHead>
                                            <TableHead className="w-32 text-center">آخر تحديث</TableHead>
                                            <TableHead className="w-24 text-center">إجراءات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {scales.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                                                    لا توجد موازين مسجلة حتى الآن. استخدم زر "توليد نطاق موازين (20+)" لإنشاء شبكة موازينك بنقرة زر واحدة!
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            scales.map((scale, idx) => {
                                                const isOnline = scale.lastStatus === 'online';
                                                const isError = scale.lastStatus === 'offline' || scale.lastStatus === 'error';

                                                return (
                                                    <TableRow key={scale.id || idx} className={!scale.enabled ? "opacity-50" : ""}>
                                                        <TableCell className="text-center">
                                                            <Switch 
                                                                checked={scale.enabled !== false}
                                                                onCheckedChange={(checked) => handleToggleScale(scale.id, checked)}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold text-muted-foreground">
                                                            {idx + 1}
                                                        </TableCell>
                                                        <TableCell className="font-semibold">
                                                            <div className="flex items-center gap-2">
                                                                <Scale className="h-4 w-4 text-primary" />
                                                                <span>{scale.name}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="text-xs">
                                                                {scale.departmentName || 'الكل'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-xs">
                                                            {scale.model === 'mettler_toledo' && 'Mettler Toledo (ميتلر توليدو)'}
                                                            {scale.model === 'cas_cl5000' && 'CAS CL-5000 / CL-Works'}
                                                            {scale.model === 'rongta_rls1000' && 'Rongta RLS (رونغتا)'}
                                                            {scale.model === 'dibal' && 'Dibal (ديبال الإسباني)'}
                                                            {!['mettler_toledo', 'cas_cl5000', 'rongta_rls1000', 'dibal'].includes(scale.model as string) && scale.model}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs dir-ltr text-left">
                                                            <span className="font-semibold text-foreground">{scale.ip}</span>
                                                            <span className="text-muted-foreground">:{scale.port}</span>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {isOnline && (
                                                                <Badge className="bg-emerald-600 text-white gap-1 text-[11px]">
                                                                    <Check className="h-3 w-3" />
                                                                    متصل {scale.latencyMs ? `(${scale.latencyMs}ms)` : ''}
                                                                </Badge>
                                                            )}
                                                            {isError && (
                                                                <Badge variant="destructive" className="gap-1 text-[11px]">
                                                                    <X className="h-3 w-3" />
                                                                    غير متصل
                                                                </Badge>
                                                            )}
                                                            {!isOnline && !isError && (
                                                                <Badge variant="outline" className="text-muted-foreground text-[11px]">
                                                                    لم يُفحص
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center text-xs text-muted-foreground font-mono">
                                                            {scale.lastSync || '---'}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 text-primary"
                                                                    onClick={() => {
                                                                        setEditingScale(scale);
                                                                        setIsScaleDialogOpen(true);
                                                                    }}
                                                                >
                                                                    <Edit className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                                    onClick={() => handleDeleteScale(scale.id)}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* TAB 2: ITEMS PREVIEW & EXPORT (معاينة الأصناف وتصدير الملفات) */}
                <TabsContent value="items" className="space-y-4 pt-4">
                    {/* Settings & Export Controls */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base font-semibold">تصدير ملفات الأصناف للموازين يدوياً (USB / ملفات برامج الموازين)</CardTitle>
                            <CardDescription>
                                يمكنك تنزيل ملفات الأسعار بصيغة إكسل أو بصيغ الموازين المتخصصة لنقلها بفلاشة عند عدم توفر شبكة.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <Label>طراز الميزان للتصدير اليدوي</Label>
                                    <Select value={selectedModel} onValueChange={(val: ScaleModel) => setSelectedModel(val)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="اختر طراز الميزان" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="mettler_toledo">Mettler Toledo (ميتلر توليدو - bPlus / Tiger / SPCT)</SelectItem>
                                            <SelectItem value="universal_excel">Excel عام (.xlsx) - متوافق شامل</SelectItem>
                                            <SelectItem value="universal_csv">CSV عام (.csv) - متوافق مع البرامج القياسية</SelectItem>
                                            <SelectItem value="cas_cl5000">CAS CL-Series (CL-5000 / CL-5200 / CL-7000)</SelectItem>
                                            <SelectItem value="rongta_rls1000">Rongta RLS1000 / RLS1100 (رونغتا)</SelectItem>
                                            <SelectItem value="dibal">Dibal Scales (.txt)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>بادئة باركود الوزن (Prefix)</Label>
                                    <Input 
                                        value={barcodePrefix} 
                                        onChange={(e) => setBarcodePrefix(e.target.value.slice(0, 2))}
                                        placeholder="21"
                                        maxLength={2}
                                        className="font-mono text-center"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>فترة الصلاحية الافتراضية (بالأيام)</Label>
                                    <Input 
                                        type="number"
                                        min={1}
                                        max={365}
                                        value={shelfLifeDays} 
                                        onChange={(e) => setShelfLifeDays(Number(e.target.value) || 1)}
                                        className="text-center"
                                    />
                                </div>

                                <div className="flex flex-col justify-center space-y-2 pt-2">
                                    <div className="flex items-center justify-between border p-3 rounded-lg bg-muted/20">
                                        <div className="space-y-0.5">
                                            <Label className="text-sm font-medium">أصناف الوزن فقط</Label>
                                            <p className="text-xs text-muted-foreground">تصفية أصناف الكيلو والجرامات</p>
                                        </div>
                                        <Switch 
                                            checked={onlyWeighted} 
                                            onCheckedChange={setOnlyWeighted} 
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                                <Button 
                                    variant="outline" 
                                    className="gap-2"
                                    onClick={() => handleDownload('universal_excel')}
                                    disabled={isExporting || filteredItems.length === 0}
                                >
                                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                                    تصدير إكسل شامل (.xlsx)
                                </Button>
                                <Button 
                                    variant="outline" 
                                    className="gap-2"
                                    onClick={() => handleDownload('mettler_toledo')}
                                    disabled={isExporting || filteredItems.length === 0}
                                >
                                    <FileText className="h-4 w-4 text-primary" />
                                    تصدير ملف ميتلر توليدو (Mettler SPCT)
                                </Button>
                                <Button 
                                    variant="outline" 
                                    className="gap-2"
                                    onClick={() => handleDownload(selectedModel)}
                                    disabled={isExporting || filteredItems.length === 0}
                                >
                                    <FileText className="h-4 w-4 text-blue-600" />
                                    تصدير ملف ({selectedModel.split('_')[0].toUpperCase()})
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Items Table */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        placeholder="بحث باسم الصنف، الكود، أو الباركود..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pr-9"
                                    />
                                </div>
                                <div className="w-full md:w-64">
                                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="جميع التصنيفات" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">جميع التصنيفات</SelectItem>
                                            {itemCategories.map((cat: any) => (
                                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="border-t max-h-[500px] overflow-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                                        <TableRow>
                                            <TableHead className="w-16 text-center">رقم PLU</TableHead>
                                            <TableHead className="w-24">كود الصنف</TableHead>
                                            <TableHead>اسم الصنف في الميزان</TableHead>
                                            <TableHead className="w-24 text-center">الوحدة</TableHead>
                                            <TableHead className="w-28 text-left">سعر البيع</TableHead>
                                            <TableHead className="w-48 font-mono">هيكل باركود الميزان (21xxxxx)</TableHead>
                                            <TableHead className="w-28 text-center">الصلاحية</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredItems.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                    لا توجد أصناف مطابقة للشروط الحالية.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredItems.slice(0, 100).map((item, idx) => (
                                                <TableRow key={item.id || idx}>
                                                    <TableCell className="text-center font-mono font-bold text-primary">
                                                        {item.plu}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                    <TableCell className="font-medium">{item.name}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="outline" className="text-xs">{item.unit}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-left font-bold font-mono">
                                                        {item.price.toFixed(2)} ج.م
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs text-muted-foreground dir-ltr">
                                                        <span className="text-primary font-bold">{barcodePrefix}</span>
                                                        <span>{String(item.code || item.plu).padStart(5, '0').slice(-5)}</span>
                                                        <span className="text-emerald-600">00000</span>
                                                        <span className="text-xs text-gray-400">c</span>
                                                    </TableCell>
                                                    <TableCell className="text-center text-xs">
                                                        {item.shelfLifeDays || shelfLifeDays} يوم
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* DIALOG 1: معالج إنشاء نطاق موازين (IP Range Generator لـ 20+ ميزان) */}
            <Dialog open={isRangeDialogOpen} onOpenChange={setIsRangeDialogOpen}>
                <DialogContent className="max-w-md" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-primary" />
                            معالج إنشاء نطاق موازين تلقائياً (IP Range Generator)
                        </DialogTitle>
                        <DialogDescription>
                            أنشئ شبكة كاملة من 20 ميزان أو أكثر بنقرة زر واحدة وتعيين عناوين الـ IP المتسلسلة والموديل تلقائياً.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>اسم الميزان الافتراضي (البادئة)</Label>
                            <Input 
                                value={rangePrefix}
                                onChange={(e) => setRangePrefix(e.target.value)}
                                placeholder="ميزان قسم"
                            />
                            <span className="text-xs text-muted-foreground">
                                سيتم تسميتهم: {rangePrefix} 1، {rangePrefix} 2، ... إلخ
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>بداية عنوان الـ IP</Label>
                                <Input 
                                    value={rangeStartIp}
                                    onChange={(e) => setRangeStartIp(e.target.value)}
                                    placeholder="192.168.1.151"
                                    className="font-mono text-left"
                                    dir="ltr"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>عدد الموازين للإنشاء</Label>
                                <Input 
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={rangeCount}
                                    onChange={(e) => setRangeCount(Number(e.target.value) || 1)}
                                    className="font-mono text-center font-bold text-primary"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>طراز الموازين</Label>
                                <Select value={rangeModel} onValueChange={(val: ScaleModel) => {
                                    setRangeModel(val);
                                    if (val === 'mettler_toledo') setRangePort(3001);
                                    else if (val === 'cas_cl5000') setRangePort(2002);
                                    else if (val === 'rongta_rls1000') setRangePort(4001);
                                }}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="mettler_toledo">Mettler Toledo (ميتلر توليدو)</SelectItem>
                                        <SelectItem value="cas_cl5000">CAS CL-5000 / CL-Works</SelectItem>
                                        <SelectItem value="rongta_rls1000">Rongta RLS (رونغتا)</SelectItem>
                                        <SelectItem value="dibal">Dibal (ديبال الإسباني)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>المنفذ الافتراضي (Port)</Label>
                                <Input 
                                    type="number"
                                    value={rangePort}
                                    onChange={(e) => setRangePort(Number(e.target.value) || 3001)}
                                    className="font-mono text-center"
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRangeDialogOpen(false)}>إلغاء</Button>
                        <Button onClick={handleGenerateIpRange} className="gap-2">
                            <Sparkles className="h-4 w-4" />
                            إنشاء {rangeCount} ميزان فوراً
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIALOG 2: إضافة أو تعديل ميزان فردي */}
            <Dialog open={isScaleDialogOpen} onOpenChange={setIsScaleDialogOpen}>
                <DialogContent className="max-w-md" dir="rtl">
                    <DialogHeader>
                        <DialogTitle>
                            {editingScale?.id ? 'تعديل بيانات الميزان' : 'إضافة ميزان جديد للشبكة'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>اسم الميزان</Label>
                            <Input 
                                value={editingScale?.name || ''}
                                onChange={(e) => setEditingScale({ ...editingScale, name: e.target.value })}
                                placeholder="مثلاً: ميزان الجبن والألبان 1"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>عنوان IP</Label>
                                <Input 
                                    value={editingScale?.ip || ''}
                                    onChange={(e) => setEditingScale({ ...editingScale, ip: e.target.value })}
                                    placeholder="192.168.1.151"
                                    className="font-mono text-left"
                                    dir="ltr"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>المنفذ (Port)</Label>
                                <Input 
                                    type="number"
                                    value={editingScale?.port || 3001}
                                    onChange={(e) => setEditingScale({ ...editingScale, port: Number(e.target.value) || 3001 })}
                                    className="font-mono text-center"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>طراز الميزان</Label>
                                <Select 
                                    value={editingScale?.model || 'mettler_toledo'} 
                                    onValueChange={(val) => setEditingScale({ ...editingScale, model: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="mettler_toledo">Mettler Toledo</SelectItem>
                                        <SelectItem value="cas_cl5000">CAS CL-5000</SelectItem>
                                        <SelectItem value="rongta_rls1000">Rongta RLS</SelectItem>
                                        <SelectItem value="dibal">Dibal</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>القسم المخصص</Label>
                                <Select 
                                    value={editingScale?.departmentName || 'الكل'} 
                                    onValueChange={(val) => setEditingScale({ ...editingScale, departmentName: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="الكل">كافة الأقسام (شامل)</SelectItem>
                                        {itemCategories.map((c: any) => (
                                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsScaleDialogOpen(false)}>إلغاء</Button>
                        <Button onClick={handleSaveSingleScale}>حفظ الميزان</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIALOG 3: نافذة البث المباشر لجميع الموازين (Broadcast Live Modal) */}
            <Dialog open={isBroadcastModalOpen} onOpenChange={setIsBroadcastModalOpen}>
                <DialogContent className="max-w-xl" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Radio className="h-5 w-5 text-primary animate-pulse" />
                            بث التحديث لجميع الموازين ({scales.filter(s => s.enabled !== false).length} ميزان)
                        </DialogTitle>
                        <DialogDescription>
                            يتم إرسال الأصناف والأسعار المحدثة بالتوازي لجميع موازين الفروع عبر الشبكة المحلية.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-3">
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                                <span>حالة البث الجماعي</span>
                                <span>{broadcastProgress}%</span>
                            </div>
                            <Progress value={broadcastProgress} className="h-2" />
                        </div>

                        <div className="border rounded-lg max-h-[300px] overflow-auto divide-y">
                            {isBroadcasting && broadcastResults.length === 0 ? (
                                <div className="p-8 text-center space-y-2">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                                    <p className="text-sm font-semibold">جارٍ الاتصال بـ {scales.filter(s => s.enabled !== false).length} ميزان وإرسال الأسعار بالتوازي...</p>
                                </div>
                            ) : (
                                broadcastResults.map((r, i) => (
                                    <div key={i} className="p-3 flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            {r.success ? (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                            ) : (
                                                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                                            )}
                                            <div>
                                                <p className="font-semibold">{r.name}</p>
                                                <p className="text-muted-foreground font-mono">{r.ip}:{r.port}</p>
                                            </div>
                                        </div>

                                        <div className="text-left font-mono">
                                            <Badge variant={r.success ? "default" : "destructive"} className="text-[10px]">
                                                {r.success ? `نجح (${r.latencyMs}ms)` : 'فشل'}
                                            </Badge>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{r.message}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button onClick={() => setIsBroadcastModalOpen(false)}>إغلاق</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
