"use client";

import React, { useState, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/data-provider";
import { 
    Server, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, 
    Database, Network, ArrowUpRight, ArrowDownLeft, Clock, Zap, Loader2, Save,
    ShoppingCart, Truck, Banknote, CreditCard, Receipt, Boxes, Monitor, Activity, Sparkles, Check,
    Undo2, ArrowLeftRight, Wallet, Users, UserCheck, Terminal
} from "lucide-react";
import { CentralSyncConfig } from '@/lib/central-sync';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function CentralSyncSettingsPage() {
    const { toast } = useToast();
    const { warehouses } = useData();

    const [config, setConfig] = useState<CentralSyncConfig>({
        currentBranchId: '',
        currentBranchCode: '900',
        currentBranchName: 'الفرع الرأيسي',
        centralServerIp: '127.0.0.1',
        centralSqlPort: 1433,
        centralDatabase: 'MultiBranchPOS_Central_DB',
        centralUsername: 'sa',
        centralPassword: '',
        autoSync: true,
        autoSyncIntervalMinutes: 5,
        lastSyncTime: null,
        lastSyncStatus: 'ready'
    });

    const [pendingBreakdown, setPendingBreakdown] = useState({
        sales: 0,
        salesReturns: 0,
        purchases: 0,
        purchaseReturns: 0,
        customerPayments: 0,
        supplierPayments: 0,
        expenses: 0,
        treasury: 0,
        stock: 0,
        transfers: 0,
        rep: 0,
        hr: 0,
        pos: 0,
        total: 0
    });

    const [recentSyncLogs, setRecentSyncLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTesting, setIsTesting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [testResult, setTestResult] = useState<{ 
        success: boolean; 
        latencyMs?: number; 
        serverVersion?: string; 
        database?: string; 
        databaseExists?: boolean;
        message?: string;
        error?: string 
    } | null>(null);

    // Database Initialization State
    const [initTarget, setInitTarget] = useState<'central' | 'local'>('central');
    const [initServer, setInitServer] = useState('127.0.0.1');
    const [initPort, setInitPort] = useState(1433);
    const [initDatabase, setInitDatabase] = useState('MultiBranchPOS_Central_DB');
    const [initUsername, setInitUsername] = useState('sa');
    const [initPassword, setInitPassword] = useState('');
    const [initBranchCode, setInitBranchCode] = useState('900');
    const [initBranchName, setInitBranchName] = useState('الفرع الرأيسي');
    const [isInitializingDb, setIsInitializingDb] = useState(false);
    const [initDbResult, setInitDbResult] = useState<{ success: boolean; message: string; tablesCount?: number; error?: string } | null>(null);
    const [activeTab, setActiveTab] = useState<'monitor' | 'config' | 'db-init'>('monitor');

    // Fetch initial settings & queue from API
    // isInitial = true updates form inputs (on mount or manual refresh).
    // isInitial = false (periodic queue refresh) ONLY updates counters & logs, NEVER overwriting form inputs!
    const loadSettings = async (isInitial: boolean = false) => {
        try {
            const res = await fetch('/api/sync/central');
            const data = await res.json();
            if (data.success) {
                if (isInitial && data.config) {
                    setConfig(data.config);
                    // Pre-fill DB init form only on initial/explicit load
                    setInitServer(data.config.centralServerIp || '127.0.0.1');
                    setInitPort(data.config.centralSqlPort || 1433);
                    setInitDatabase(data.config.centralDatabase || 'MultiBranchPOS_Central_DB');
                    setInitUsername(data.config.centralUsername || 'sa');
                    setInitBranchCode(data.config.currentBranchCode || '900');
                    setInitBranchName(data.config.currentBranchName || 'الفرع الرأيسي');
                }
                if (data.pendingBreakdown) {
                    setPendingBreakdown(data.pendingBreakdown);
                }
                if (data.recentSyncLogs) {
                    setRecentSyncLogs(data.recentSyncLogs);
                }
            }
        } catch (err: any) {
            console.error('Error loading central sync config:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Initial load on page mount
    useEffect(() => {
        loadSettings(true);
    }, []);

    // Auto-refresh queue monitor only when viewing the monitor tab (does NOT touch form inputs)
    useEffect(() => {
        if (activeTab !== 'monitor') return;
        const timer = setInterval(() => {
            loadSettings(false);
        }, 20000);
        return () => clearInterval(timer);
    }, [activeTab]);

    const handleInputChange = (field: keyof CentralSyncConfig, value: any) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    // When selecting warehouse, automatically set branch code and name
    const handleWarehouseChange = (whId: string) => {
        const wh = warehouses.find((w: any) => w.id === whId);
        if (wh) {
            setConfig(prev => ({
                ...prev,
                currentBranchId: wh.id,
                currentBranchCode: wh.code || prev.currentBranchCode,
                currentBranchName: wh.name || prev.currentBranchName
            }));
            setInitBranchCode(wh.code || initBranchCode);
            setInitBranchName(wh.name || initBranchName);
        }
    };

    // Test connection to Central SQL Server
    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'test', config })
            });
            const data = await res.json();
            setTestResult(data);
            if (data.success) {
                toast({
                    title: "تم الاتصال بالسيرفر المركزي بنجاح",
                    description: `زمن الاستجابة: ${data.latencyMs}ms | قاعدة البيانات: ${data.database || config.centralDatabase}`
                });
            } else {
                toast({
                    title: "فشل الاتصال بالسيرفر المركزي",
                    description: data.error || "تأكد من عنوان IP، البورت، واسم المستخدم وكلمة المرور.",
                    variant: "destructive"
                });
            }
        } catch (err: any) {
            setTestResult({ success: false, error: err.message });
            toast({
                title: "خطأ في الاتصال",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setIsTesting(false);
        }
    };

    // Save Configuration
    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save', config })
            });
            const data = await res.json();
            if (data.success) {
                toast({
                    title: "تم حفظ الإعدادات بنجاح",
                    description: "تم تحديث بيانات السيرفر المركزي وهوية الفرع."
                });
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            toast({
                title: "تعذر حفظ الإعدادات",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Run Full Push/Pull Sync Now
    const handleSyncNow = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync', config })
            });
            const data = await res.json();
            if (data.success) {
                toast({
                    title: "تمت المزامنة بنجاح!",
                    description: data.details || `تم رفع ${data.pushedCount} حركة وسحب ${data.pulledCount} تحديث.`
                });
                await loadSettings(false);
            } else {
                toast({
                    title: "فشلت عملية المزامنة",
                    description: data.error || "حدث خطأ أثناء الاتصال بالسيرفر المركزي.",
                    variant: "destructive"
                });
            }
        } catch (err: any) {
            toast({
                title: "خطأ في المزامنة",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setIsSyncing(false);
        }
    };

    // Initialize & Create Database
    const handleInitializeDatabase = async () => {
        setIsInitializingDb(true);
        setInitDbResult(null);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'init-database',
                    initOptions: {
                        server: initServer,
                        port: initPort,
                        database: initDatabase,
                        user: initUsername,
                        password: initPassword,
                        branchCode: initBranchCode,
                        branchName: initBranchName,
                        isCentral: initTarget === 'central'
                    }
                })
            });
            const data = await res.json();
            setInitDbResult(data);
            if (data.success) {
                toast({
                    title: "تم إنشاء وتهيئة قاعدة البيانات بنجاح!",
                    description: data.message
                });
            } else {
                toast({
                    title: "فشل إنشاء قاعدة البيانات",
                    description: data.error || data.message,
                    variant: "destructive"
                });
            }
        } catch (err: any) {
            setInitDbResult({ success: false, message: 'خطأ في الاتصال بالخادم', error: err.message });
            toast({
                title: "خطأ في العملية",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setIsInitializingDb(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <>
            <PageHeader title="المزامنة المركزية وإدارة قواعد البيانات">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={isTesting}>
                        {isTesting ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Zap className="h-4 w-4 ml-1 text-amber-500" />}
                        اختبار الاتصال
                    </Button>
                    <Button 
                        size="sm" 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow"
                        onClick={handleSyncNow}
                        disabled={isSyncing}
                    >
                        {isSyncing ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <RefreshCw className="h-4 w-4 ml-1" />}
                        مزامنة لحظية الآن
                    </Button>
                </div>
            </PageHeader>

            <main className="flex flex-1 flex-col gap-6 p-4 md:gap-8 md:p-6 max-w-6xl mx-auto w-full">
                {/* Real-time Health Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border-2 shadow-sm">
                        <CardHeader className="py-3">
                            <CardTitle className="text-sm font-medium flex items-center justify-between">
                                <span>حالة الاتصال المركزي</span>
                                <Network className="h-4 w-4 text-muted-foreground" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2">
                            {testResult ? (
                                testResult.success ? (
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            {testResult.databaseExists === false ? (
                                                <Badge className="bg-amber-600 text-white gap-1"><AlertTriangle className="h-3.5 w-3.5"/> متصل (القاعدة غير منشأة)</Badge>
                                            ) : (
                                                <Badge className="bg-green-600 text-white gap-1"><CheckCircle2 className="h-3.5 w-3.5"/> متصل بالسيرفر</Badge>
                                            )}
                                            <span className="text-xs text-muted-foreground font-mono font-bold">{testResult.latencyMs}ms</span>
                                        </div>
                                        {testResult.message && <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{testResult.message}</p>}
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3.5 w-3.5"/> غير متصل</Badge>
                                        {testResult.error && <p className="text-[11px] text-destructive leading-relaxed mt-1 font-medium">{testResult.error}</p>}
                                    </div>
                                )
                            ) : (
                                <Badge variant="outline" className="text-muted-foreground">اضغط اختبار الاتصال للتحقق</Badge>
                            )}
                            <p className="text-xs text-muted-foreground mt-2 truncate">
                                السيرفر: <span className="font-mono">{config.centralServerIp}:{config.centralSqlPort}</span>
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-2 shadow-sm">
                        <CardHeader className="py-3">
                            <CardTitle className="text-sm font-medium flex items-center justify-between">
                                <span>العمليات المعلقة في الفرع</span>
                                <Clock className="h-4 w-4 text-muted-foreground" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2">
                            <div className="text-2xl font-black text-primary">
                                {pendingBreakdown.total.toLocaleString()} حركة
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {pendingBreakdown.total > 0 ? 'تنتظر الرفع والمزامنة مع السيرفر المركزي' : 'جميع حركات الفرع متزامنة تماماً بالكامل'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-2 shadow-sm">
                        <CardHeader className="py-3">
                            <CardTitle className="text-sm font-medium flex items-center justify-between">
                                <span>آخر مزامنة ناجحة</span>
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2">
                            <div className="text-sm font-bold text-foreground">
                                {config.lastSyncTime ? new Date(config.lastSyncTime).toLocaleString('ar-EG') : 'لم تتم المزامنة بعد'}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                                <span className="flex items-center gap-1 text-emerald-600 font-semibold"><ArrowUpRight className="h-3 w-3"/> تم رفع: {config.lastPushedCount || 0}</span>
                                <span className="flex items-center gap-1 text-blue-600 font-semibold"><ArrowDownLeft className="h-3 w-3"/> تم تنزيل: {config.lastPulledCount || 0}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="monitor" className="gap-2">
                            <Activity className="h-4 w-4" /> متابعة المزامنة اللحظية
                        </TabsTrigger>
                        <TabsTrigger value="config" className="gap-2">
                            <Server className="h-4 w-4" /> إعدادات السيرفر المركزي
                        </TabsTrigger>
                        <TabsTrigger value="db-init" className="gap-2">
                            <Sparkles className="h-4 w-4 text-amber-500" /> إنشاء وتهيئة قاعدة البيانات
                        </TabsTrigger>
                    </TabsList>

                    {/* TAB 1: LIVE SYNC MONITOR */}
                    <TabsContent value="monitor" className="space-y-6 mt-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Activity className="h-5 w-5 text-primary" />
                                        حالة طابور المزامنة التفاعلي (Live Pending Queue)
                                    </CardTitle>
                                    <CardDescription>
                                        تتبع لحظي للوثائق والحركات غير المزامنة في قاعدة بيانات الفرع وموقف كل قسم.
                                    </CardDescription>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => loadSettings(false)}>
                                    <RefreshCw className="h-3.5 w-3.5 ml-1" /> تحديث العدادات
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <ShoppingCart className="h-5 w-5 mx-auto text-blue-500" />
                                        <div className="text-xs text-muted-foreground">فواتير مبيعات</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.sales}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Undo2 className="h-5 w-5 mx-auto text-amber-600" />
                                        <div className="text-xs text-muted-foreground">مرتجع مبيعات</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.salesReturns}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Truck className="h-5 w-5 mx-auto text-indigo-500" />
                                        <div className="text-xs text-muted-foreground">فواتير مشتريات</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.purchases}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Undo2 className="h-5 w-5 mx-auto text-purple-600 rotate-180" />
                                        <div className="text-xs text-muted-foreground">مرتجع مشتريات</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.purchaseReturns}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Banknote className="h-5 w-5 mx-auto text-emerald-500" />
                                        <div className="text-xs text-muted-foreground">مقبوضات عملاء</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.customerPayments}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <CreditCard className="h-5 w-5 mx-auto text-violet-500" />
                                        <div className="text-xs text-muted-foreground">مدفوعات موردين</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.supplierPayments}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Receipt className="h-5 w-5 mx-auto text-rose-500" />
                                        <div className="text-xs text-muted-foreground">مصروفات وإيراد</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.expenses}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Wallet className="h-5 w-5 mx-auto text-amber-500" />
                                        <div className="text-xs text-muted-foreground">حركات الخزينة</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.treasury}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Boxes className="h-5 w-5 mx-auto text-teal-500" />
                                        <div className="text-xs text-muted-foreground">حركات مخازن</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.stock}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <ArrowLeftRight className="h-5 w-5 mx-auto text-sky-500" />
                                        <div className="text-xs text-muted-foreground">تحويلات فروع</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.transfers}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <UserCheck className="h-5 w-5 mx-auto text-orange-500" />
                                        <div className="text-xs text-muted-foreground">حركات مناديب</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.rep}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Users className="h-5 w-5 mx-auto text-cyan-600" />
                                        <div className="text-xs text-muted-foreground">سلف ورواتب</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.hr}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1 col-span-2 sm:col-span-1">
                                        <Terminal className="h-5 w-5 mx-auto text-pink-500" />
                                        <div className="text-xs text-muted-foreground">جلسات كاشير POS</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.pos}</div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-muted/20 border-t flex justify-between items-center py-3">
                                <span className="text-xs text-muted-foreground">
                                    الفرع النشط: <strong className="text-foreground">{config.currentBranchName} ({config.currentBranchCode})</strong>
                                </span>
                                <Button 
                                    size="sm" 
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
                                    onClick={handleSyncNow}
                                    disabled={isSyncing}
                                >
                                    {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                    مزامنة الحركات المعلقة الآن
                                </Button>
                            </CardFooter>
                        </Card>

                        {/* Recent Sync Logs */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-muted-foreground" />
                                    سجل عمليات المزامنة اللحظي (Sync Activity Log)
                                </CardTitle>
                                <CardDescription>سجل تفصيلي لآخر عمليات المزامنة والتحديثات بين الفرع والمركز.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead>وقت العملية</TableHead>
                                            <TableHead>الفرع</TableHead>
                                            <TableHead className="text-center">الحالة</TableHead>
                                            <TableHead className="text-center">رفع للمركز</TableHead>
                                            <TableHead className="text-center">تنزيل للفرع</TableHead>
                                            <TableHead>الملاحظات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {recentSyncLogs.map((log, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="font-mono text-xs">
                                                    {log.timestamp ? new Date(log.timestamp).toLocaleString('ar-EG') : 'لم تتم بعد'}
                                                </TableCell>
                                                <TableCell className="font-medium text-xs">{log.branch}</TableCell>
                                                <TableCell className="text-center">
                                                    {log.status === 'success' ? (
                                                        <Badge className="bg-green-600 text-white text-[10px]">ناجحة</Badge>
                                                    ) : log.status === 'failed' ? (
                                                        <Badge variant="destructive" className="text-[10px]">فشلت</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[10px]">جاهز</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center font-mono font-bold text-emerald-600">
                                                    +{log.pushed}
                                                </TableCell>
                                                <TableCell className="text-center font-mono font-bold text-blue-600">
                                                    +{log.pulled}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {log.error ? <span className="text-destructive font-semibold">{log.error}</span> : 'تمت المزامنة بنجاح وحفظ السجلات'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* TAB 2: CENTRAL CONNECTION SETTINGS */}
                    <TabsContent value="config" className="space-y-6 mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Branch Identity */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center gap-2 text-primary">
                                        <Database className="h-5 w-5" />
                                        1. هوية وبيانات الفرع المحلي (Local Branch Identity)
                                    </CardTitle>
                                    <CardDescription>
                                        يتم تضمين كود واسم الفرع تلقائياً في كل فاتورة، سند، وقيد يسجله هذا الجهاز لضمان تمييزه في السيرفر المركزي.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>ربط بفرع / مستودع مسجل</Label>
                                        <Select value={config.currentBranchId} onValueChange={handleWarehouseChange}>
                                            <SelectTrigger><SelectValue placeholder="اختر الفرع..." /></SelectTrigger>
                                            <SelectContent>
                                                {warehouses.map((w: any) => (
                                                    <SelectItem key={w.id} value={w.id}>
                                                        {w.name} (كود: {w.code || 'بدون'})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>كود الفرع (Branch Code)</Label>
                                            <Input 
                                                value={config.currentBranchCode} 
                                                onChange={e => handleInputChange('currentBranchCode', e.target.value)}
                                                placeholder="مثال: 900 أو BR-01"
                                                className="font-mono font-bold"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>اسم الفرع (Branch Name)</Label>
                                            <Input 
                                                value={config.currentBranchName} 
                                                onChange={e => handleInputChange('currentBranchName', e.target.value)}
                                                placeholder="مثال: الفرع الرئيسي"
                                                className="font-bold"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground flex items-center gap-2 border">
                                        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                                        <span>
                                            مشغلات SQL التلقائية تعمل بحقن كود الفرع (<code className="font-mono font-bold">{config.currentBranchCode}</code>) واسمه في جميع الجداول الـ 69 تلقائياً.
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Central SQL Server Credentials */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center gap-2 text-primary">
                                        <Server className="h-5 w-5" />
                                        2. بيانات السيرفر المركزي للإدارة (Central Server Settings)
                                    </CardTitle>
                                    <CardDescription>
                                        إعدادات الاتصال بقاعدة بيانات SQL Server المركزية في المقر الرئيسي.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-2 space-y-2">
                                            <Label>عنوان السيرفر (IP Server / Host)</Label>
                                            <Input 
                                                value={config.centralServerIp} 
                                                onChange={e => handleInputChange('centralServerIp', e.target.value)}
                                                placeholder="مثال: 192.168.1.100 أو sql.domain.com"
                                                className="font-mono text-left dir-ltr"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>البورت (SQL Port)</Label>
                                            <Input 
                                                type="number"
                                                value={config.centralSqlPort} 
                                                onChange={e => handleInputChange('centralSqlPort', Number(e.target.value))}
                                                placeholder="1433"
                                                className="font-mono text-center"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>اسم قاعدة البيانات المركزية (Database Name)</Label>
                                        <Input 
                                            value={config.centralDatabase} 
                                            onChange={e => handleInputChange('centralDatabase', e.target.value)}
                                            placeholder="MultiBranchPOS_Central_DB"
                                            className="font-mono"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>اسم المستخدم (SQL Username)</Label>
                                            <Input 
                                                value={config.centralUsername} 
                                                onChange={e => handleInputChange('centralUsername', e.target.value)}
                                                placeholder="sa أو meto_pos"
                                                className="font-mono"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>كلمة المرور (SQL Password)</Label>
                                            <Input 
                                                type="password"
                                                value={config.centralPassword} 
                                                onChange={e => handleInputChange('centralPassword', e.target.value)}
                                                placeholder="••••••••"
                                                className="font-mono"
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Automation */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <RefreshCw className="h-5 w-5 text-emerald-600" />
                                    3. جدولة المزامنة التلقائية الدورية (Background Sync)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-4 border rounded-xl bg-background">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-bold">تشغيل المزامنة التلقائية في الخلفية</Label>
                                        <p className="text-xs text-muted-foreground">
                                            رفع الحركات الجديدة وسحب تحديثات الأصناف والأسعار آلياً بدون أي تدخل يدوي.
                                        </p>
                                    </div>
                                    <Switch 
                                        checked={config.autoSync} 
                                        onCheckedChange={v => handleInputChange('autoSync', v)} 
                                    />
                                </div>

                                {config.autoSync && (
                                    <div className="flex items-center gap-4 p-4 border rounded-xl bg-muted/20">
                                        <Label className="text-sm whitespace-nowrap">فترة التكرار كل:</Label>
                                        <Input 
                                            type="number"
                                            min="1"
                                            max="120"
                                            value={config.autoSyncIntervalMinutes}
                                            onChange={e => handleInputChange('autoSyncIntervalMinutes', Number(e.target.value))}
                                            className="w-24 text-center font-bold font-mono"
                                        />
                                        <span className="text-sm text-muted-foreground">دقائق</span>
                                    </div>
                                )}

                                {testResult && (
                                    <div className={cn("p-4 rounded-xl border text-sm mt-4", testResult.success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300" : "bg-destructive/10 border-destructive/30 text-destructive")}>
                                        <div className="flex items-start gap-3">
                                            {testResult.success ? <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" /> : <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />}
                                            <div className="space-y-1">
                                                <p className="font-bold">{testResult.success ? "تم فحص الاتصال بالسيرفر بنجاح" : "تعذر الاتصال بالسيرفر"}</p>
                                                {testResult.message && <p className="text-xs leading-relaxed">{testResult.message}</p>}
                                                {testResult.error && <p className="text-xs leading-relaxed font-mono mt-1">{testResult.error}</p>}
                                                {testResult.serverVersion && <p className="text-[11px] text-muted-foreground font-mono mt-1">إصدار السيرفر: {testResult.serverVersion} | زمن الاستجابة: {testResult.latencyMs}ms</p>}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="flex justify-between items-center bg-muted/30 border-t py-4">
                                <Button variant="outline" onClick={handleTestConnection} disabled={isTesting}>
                                    {isTesting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Zap className="h-4 w-4 ml-2 text-amber-500" />}
                                    اختبار الاتصال بالسيرفر
                                </Button>
                                <Button 
                                    className="bg-primary text-primary-foreground font-bold gap-2"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                >
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
                                    حفظ الإعدادات
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* TAB 3: INITIALIZE & CREATE DATABASE */}
                    <TabsContent value="db-init" className="space-y-6 mt-4">
                        <Card className="border-2 border-amber-500/30 shadow-md">
                            <CardHeader className="bg-amber-500/5 border-b pb-4">
                                <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-400">
                                    <Sparkles className="h-5 w-5" />
                                    أداة إنشاء وتأسيس قاعدة البيانات (Database Setup & Initialization)
                                </CardTitle>
                                <CardDescription>
                                    تتيح لك هذه الأداة إنشاء وتأسيس قاعدة البيانات بكامل جداولها (69 جدولاً) والمشغلات الآلية وإعدادات الفروع بنقرة واحدة سواء على السيرفر المركزي للإدارة أو على السيرفر المحلي للفرع.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-6">
                                <div className="space-y-2">
                                    <Label className="font-bold">الموقع المستهدف لإنشاء قاعدة البيانات</Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Button 
                                            type="button" 
                                            variant={initTarget === 'central' ? 'default' : 'outline'}
                                            className={cn("h-16 flex flex-col items-center justify-center gap-1", initTarget === 'central' && "bg-primary text-primary-foreground")}
                                            onClick={() => {
                                                setInitTarget('central');
                                                setInitDatabase('MultiBranchPOS_Central_DB');
                                                setInitServer(config.centralServerIp || '127.0.0.1');
                                                setInitPort(config.centralSqlPort || 1433);
                                                setInitUsername(config.centralUsername || 'sa');
                                            }}
                                        >
                                            <Server className="h-5 w-5" />
                                            <span className="font-bold text-sm">السيرفر المركزي للإدارة (Central Server)</span>
                                        </Button>

                                        <Button 
                                            type="button" 
                                            variant={initTarget === 'local' ? 'default' : 'outline'}
                                            className={cn("h-16 flex flex-col items-center justify-center gap-1", initTarget === 'local' && "bg-primary text-primary-foreground")}
                                            onClick={() => {
                                                setInitTarget('local');
                                                setInitDatabase('MultiBranchPOS_DB');
                                                setInitServer('localhost');
                                                setInitPort(1433);
                                                setInitUsername('meto_pos');
                                            }}
                                        >
                                            <Database className="h-5 w-5" />
                                            <span className="font-bold text-sm">السيرفر المحلي للفرع (Local Branch Server)</span>
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>عنوان السيرفر المستهدف (IP / Server)</Label>
                                        <Input 
                                            value={initServer} 
                                            onChange={e => setInitServer(e.target.value)} 
                                            className="font-mono text-left dir-ltr"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>البورت (Port)</Label>
                                        <Input 
                                            type="number"
                                            value={initPort} 
                                            onChange={e => setInitPort(Number(e.target.value))} 
                                            className="font-mono text-center"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>اسم قاعدة البيانات المراد إنشاؤها</Label>
                                        <Input 
                                            value={initDatabase} 
                                            onChange={e => setInitDatabase(e.target.value)} 
                                            className="font-mono font-bold"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>اسم المستخدم (SQL Username مع صلاحية Create DB)</Label>
                                        <Input 
                                            value={initUsername} 
                                            onChange={e => setInitUsername(e.target.value)} 
                                            className="font-mono"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>كلمة المرور (SQL Password)</Label>
                                        <Input 
                                            type="password"
                                            value={initPassword} 
                                            onChange={e => setInitPassword(e.target.value)} 
                                            className="font-mono"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>كود الفرع الافتراضي (Branch Code)</Label>
                                        <Input 
                                            value={initBranchCode} 
                                            onChange={e => setInitBranchCode(e.target.value)} 
                                            className="font-mono font-bold"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>اسم الفرع الافتراضي (Branch Name)</Label>
                                        <Input 
                                            value={initBranchName} 
                                            onChange={e => setInitBranchName(e.target.value)} 
                                            className="font-bold"
                                        />
                                    </div>
                                </div>

                                {initDbResult && (
                                    <div className={cn(
                                        "p-4 rounded-xl border flex items-start gap-3",
                                        initDbResult.success ? "bg-green-500/10 border-green-500/40 text-green-900 dark:text-green-200" : "bg-destructive/10 border-destructive/40 text-destructive"
                                    )}>
                                        {initDbResult.success ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />}
                                        <div className="space-y-1">
                                            <div className="font-bold text-sm">{initDbResult.message}</div>
                                            {initDbResult.error && <p className="text-xs font-mono">{initDbResult.error}</p>}
                                            {initDbResult.tablesCount && <p className="text-xs font-semibold">إجمالي الجداول التي تم بناؤها: {initDbResult.tablesCount} جدولاً.</p>}
                                        </div>
                                    </div>
                                )}

                                {testResult && (
                                    <div className={cn("p-4 rounded-xl border text-sm mt-4", testResult.success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300" : "bg-destructive/10 border-destructive/30 text-destructive")}>
                                        <div className="flex items-start gap-3">
                                            {testResult.success ? <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" /> : <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />}
                                            <div className="space-y-1">
                                                <p className="font-bold">{testResult.success ? "تم فحص الاتصال بالسيرفر بنجاح" : "تعذر الاتصال بالسيرفر"}</p>
                                                {testResult.message && <p className="text-xs leading-relaxed">{testResult.message}</p>}
                                                {testResult.error && <p className="text-xs leading-relaxed font-mono mt-1">{testResult.error}</p>}
                                                {testResult.serverVersion && <p className="text-[11px] text-muted-foreground font-mono mt-1">إصدار السيرفر: {testResult.serverVersion} | زمن الاستجابة: {testResult.latencyMs}ms</p>}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="bg-muted/30 border-t py-4 flex justify-between items-center">
                                <span className="text-xs text-muted-foreground">
                                    تقوم هذه العملية بإنشاء قاعدة البيانات وتجهيز الهيكل كاملاً مع كود الفرع والمشغلات التلقائية.
                                </span>
                                <Button 
                                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-2 shadow"
                                    onClick={handleInitializeDatabase}
                                    disabled={isInitializingDb || !initDatabase.trim()}
                                >
                                    {isInitializingDb ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Sparkles className="h-4 w-4 ml-1" />}
                                    تأسيس وإنشاء قاعدة البيانات الآن
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </>
    );
}
