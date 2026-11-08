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
    Undo2, ArrowLeftRight, Wallet, Users, UserCheck, Terminal, Search, Layers, Filter, CheckCircle
} from "lucide-react";
import { CentralSyncConfig, TableSyncMatrixItem, TablesSyncMatrixResponse } from '@/lib/central-sync';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function CentralSyncSettingsPage() {
    const { toast } = useToast();
    const { warehouses } = useData();

    const [config, setConfig] = useState<CentralSyncConfig>({
        currentBranchId: '',
        currentBranchCode: '900',
        currentBranchName: 'الفرع الرأيسي',
        centralServerIp: '10.110.16.16',
        centralSqlPort: 1433,
        centralDatabase: 'MultiBranchPOS_Central_DB',
        centralUsername: 'gmlogins',
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
    const [syncingMode, setSyncingMode] = useState<'all' | 'push' | 'pull' | null>(null);
    const [syncingTable, setSyncingTable] = useState<string | null>(null);
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
    const [initServer, setInitServer] = useState('10.110.16.16');
    const [initPort, setInitPort] = useState(1433);
    const [initDatabase, setInitDatabase] = useState('MultiBranchPOS_Central_DB');
    const [initUsername, setInitUsername] = useState('gmlogins');
    const [initPassword, setInitPassword] = useState('');
    const [initBranchCode, setInitBranchCode] = useState('900');
    const [initBranchName, setInitBranchName] = useState('الفرع الرأيسي');
    const [isInitializingDb, setIsInitializingDb] = useState(false);
    const [initDbResult, setInitDbResult] = useState<{ success: boolean; message: string; tablesCount?: number; error?: string } | null>(null);
    const [activeTab, setActiveTab] = useState<'monitor' | 'tables' | 'config' | 'db-init'>('tables');

    // Tables Sync Matrix State (Timestamp & Change-tracking architecture)
    const [syncMatrix, setSyncMatrix] = useState<TablesSyncMatrixResponse | null>(null);
    const [isRefreshingMatrix, setIsRefreshingMatrix] = useState(false);
    const [tableSearch, setTableSearch] = useState('');
    const [tableCategoryFilter, setTableCategoryFilter] = useState('all');
    const [tableDirectionFilter, setTableDirectionFilter] = useState<'all' | 'push' | 'pull' | 'bidirectional'>('all');
    const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'pending' | 'synced' | 'has_data'>('all');

    // Fetch initial settings & matrix from API
    const loadSettings = async (isInitial: boolean = false) => {
        try {
            const res = await fetch('/api/sync/central');
            const data = await res.json();
            if (data.success) {
                if (isInitial && data.config) {
                    setConfig(data.config);
                    setInitServer(data.config.centralServerIp || '10.110.16.16');
                    setInitPort(data.config.centralSqlPort || 1433);
                    setInitDatabase(data.config.centralDatabase || 'MultiBranchPOS_Central_DB');
                    setInitUsername(data.config.centralUsername || 'gmlogins');
                    setInitBranchCode(data.config.currentBranchCode || '900');
                    setInitBranchName(data.config.currentBranchName || 'الفرع الرأيسي');
                }
                if (data.pendingBreakdown) {
                    setPendingBreakdown(data.pendingBreakdown);
                }
                if (data.recentSyncLogs) {
                    setRecentSyncLogs(data.recentSyncLogs);
                }
                if (data.syncMatrix) {
                    setSyncMatrix(data.syncMatrix);
                }
            }
        } catch (err: any) {
            console.error('Error loading central sync config:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Manual refresh for Sync Matrix
    const handleRefreshMatrix = async () => {
        setIsRefreshingMatrix(true);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync-matrix' })
            });
            const data = await res.json();
            if (data.success && data.syncMatrix) {
                setSyncMatrix(data.syncMatrix);
                toast({
                    title: "تم تحديث مصفوفة التوقيتات والمزامنة",
                    description: `تم فحص وتحديث ${data.syncMatrix.tables.length} جدولاً بالكامل وتتبع التعديلات.`
                });
            }
        } catch (err: any) {
            toast({
                title: "خطأ في جلب بيانات مصفوفة المزامنة",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setIsRefreshingMatrix(false);
        }
    };

    // Initial load on page mount
    useEffect(() => {
        loadSettings(true);
    }, []);

    // Auto-refresh queue monitor when viewing monitor tab
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

    // Run Smart Bidirectional Sync (All, Push-only, Pull-only, or Single Table)
    const handleSyncNow = async (mode: 'all' | 'push' | 'pull' = 'all', targetTable?: string) => {
        setIsSyncing(true);
        setSyncingMode(mode);
        if (targetTable) setSyncingTable(targetTable);

        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync', config, mode, targetTable })
            });
            const data = await res.json();
            if (data.success) {
                toast({
                    title: "تمت المزامنة بنجاح!",
                    description: data.details || `تم رفع ${data.pushedCount} حركة وسحب ${data.pulledCount} تحديث.`
                });
                await loadSettings(false);
                await handleRefreshMatrix();
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
            setSyncingMode(null);
            setSyncingTable(null);
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

    // Helper: format timestamp into Arabic readable format
    const formatTimestamp = (ts: string | null) => {
        if (!ts) return <span className="text-muted-foreground text-[11px]">-</span>;
        try {
            const d = new Date(ts);
            return (
                <div className="flex flex-col text-[11px] leading-tight font-mono">
                    <span className="font-semibold text-foreground">{d.toLocaleDateString('ar-EG')}</span>
                    <span className="text-muted-foreground text-[10px]">{d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
            );
        } catch {
            return <span className="text-muted-foreground text-[11px]">{ts}</span>;
        }
    };

    // Helper: render sync direction badge
    const renderDirectionBadge = (dir: 'push' | 'pull' | 'bidirectional') => {
        if (dir === 'push') {
            return (
                <Badge variant="outline" className="text-[10px] font-bold text-amber-700 bg-amber-500/10 border-amber-500/30 gap-1">
                    <ArrowUpRight className="h-3 w-3" /> رفع للإدارة
                </Badge>
            );
        }
        if (dir === 'pull') {
            return (
                <Badge variant="outline" className="text-[10px] font-bold text-blue-700 bg-blue-500/10 border-blue-500/30 gap-1">
                    <ArrowDownLeft className="h-3 w-3" /> سحب للفرع
                </Badge>
            );
        }
        return (
            <Badge variant="outline" className="text-[10px] font-bold text-purple-700 bg-purple-500/10 border-purple-500/30 gap-1">
                <ArrowLeftRight className="h-3 w-3" /> متبادل 🔁
            </Badge>
        );
    };

    // Helper: render table sync status badge
    const renderStatusBadge = (t: TableSyncMatrixItem) => {
        switch (t.syncState) {
            case 'synced':
                return (
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-[11px]">
                        <CheckCircle2 className="h-3 w-3" /> متطابق ومحدث
                    </Badge>
                );
            case 'pending_push':
                return (
                    <Badge className="bg-amber-600 hover:bg-amber-700 text-white gap-1 text-[11px]">
                        <ArrowUpRight className="h-3 w-3" /> {t.pendingPushCount.toLocaleString()} بانتظار الرفع
                    </Badge>
                );
            case 'pending_pull':
                return (
                    <Badge className="bg-blue-600 hover:bg-blue-700 text-white gap-1 text-[11px]">
                        <ArrowDownLeft className="h-3 w-3" /> {t.pendingPullCount.toLocaleString()} تحديثات بالسيرفر
                    </Badge>
                );
            case 'pending_both':
                return (
                    <Badge className="bg-purple-600 hover:bg-purple-700 text-white gap-1 text-[11px]">
                        <ArrowLeftRight className="h-3 w-3" /> رفع ({t.pendingPushCount}) وسحب ({t.pendingPullCount})
                    </Badge>
                );
            case 'empty':
                return (
                    <Badge variant="outline" className="text-muted-foreground text-[10px]">
                        لا توجد حركات (0)
                    </Badge>
                );
            case 'unreachable':
            default:
                return (
                    <Badge variant="destructive" className="text-[10px]">
                        السيرفر غير متصل
                    </Badge>
                );
        }
    };

    // Filter and search logic for tables Sync Matrix
    const filteredTables = (syncMatrix?.tables || []).filter(t => {
        const matchesSearch = !tableSearch || 
            t.displayName.toLowerCase().includes(tableSearch.toLowerCase()) ||
            t.tableName.toLowerCase().includes(tableSearch.toLowerCase()) ||
            t.category.toLowerCase().includes(tableSearch.toLowerCase());
        
        if (!matchesSearch) return false;

        // Category filter
        if (tableCategoryFilter !== 'all' && t.category !== tableCategoryFilter) {
            return false;
        }

        // Direction filter
        if (tableDirectionFilter !== 'all' && t.direction !== tableDirectionFilter) {
            return false;
        }

        // Status filter
        if (tableStatusFilter === 'pending') {
            return t.syncState === 'pending_push' || t.syncState === 'pending_pull' || t.syncState === 'pending_both';
        }
        if (tableStatusFilter === 'synced') {
            return t.syncState === 'synced';
        }
        if (tableStatusFilter === 'has_data') {
            return t.localBranchRows > 0 || (t.centralTotalRows !== null && t.centralTotalRows > 0);
        }

        return true;
    });

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
                        onClick={() => handleSyncNow('all')}
                        disabled={isSyncing}
                    >
                        {isSyncing ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <RefreshCw className="h-4 w-4 ml-1" />}
                        مزامنة شاملة الآن 🔁
                    </Button>
                </div>
            </PageHeader>

            <main className="flex flex-1 flex-col gap-6 p-4 md:gap-8 md:p-6 max-w-7xl mx-auto w-full">
                {/* Real-time Health Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border-2 shadow-sm">
                        <CardHeader className="py-3">
                            <CardTitle className="text-sm font-medium flex items-center justify-between">
                                <span>حالة الاتصال بالسيرفر المركزي</span>
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
                                <div className="space-y-1">
                                    <div className="text-xs text-muted-foreground">اضغط اختبار الاتصال للتحقق</div>
                                    <div className="text-xs font-mono font-bold text-foreground">السيرفر: {config.centralServerIp}:{config.centralSqlPort}</div>
                                </div>
                            )}
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
                            <div className="text-2xl font-black text-amber-600">
                                {pendingBreakdown.total.toLocaleString()} حركة
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                تنتظر الرفع والمزامنة مع السيرفر المركزي
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
                    <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
                        <TabsTrigger value="tables" className="gap-2 font-bold">
                            <Database className="h-4 w-4 text-emerald-500" /> مركز المزامنة اللحظية (Sync Matrix)
                        </TabsTrigger>
                        <TabsTrigger value="monitor" className="gap-2">
                            <Activity className="h-4 w-4" /> متابعة طابور المزامنة
                        </TabsTrigger>
                        <TabsTrigger value="config" className="gap-2">
                            <Server className="h-4 w-4" /> إعدادات السيرفر المركزي
                        </TabsTrigger>
                        <TabsTrigger value="db-init" className="gap-2">
                            <Sparkles className="h-4 w-4 text-amber-500" /> إنشاء وتهيئة قاعدة البيانات
                        </TabsTrigger>
                    </TabsList>

                    {/* TAB 1: ADVANCED TIMESTAMP & WATERMARK SYNC MATRIX */}
                    <TabsContent value="tables" className="space-y-6 mt-4">
                        {/* Branch Identity & Architecture Banner */}
                        <div className="p-4 rounded-xl border bg-card/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge className="bg-primary text-primary-foreground font-bold px-2.5 py-1 text-xs gap-1.5">
                                        <Database className="h-3.5 w-3.5" /> الفرع النشط: {config.currentBranchName} (كود {config.currentBranchCode})
                                    </Badge>
                                    <Badge variant="outline" className="font-mono text-xs gap-1">
                                        <Server className="h-3.5 w-3.5 text-muted-foreground" /> السيرفر المركزي: {config.centralServerIp}:{config.centralSqlPort} ({config.centralDatabase})
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    المزامنة مبنية على <strong>الطابع الزمني (UpdatedAt) وتتبع التعديلات (Change-Tracking)</strong>. تدعم بيئة الفروع المتعددة المجمعة بالإدارة بسلاسة ودقة.
                                </p>
                            </div>

                            {/* Direct Sync Action Buttons */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={handleRefreshMatrix}
                                    disabled={isRefreshingMatrix}
                                    className="gap-1.5 text-xs"
                                >
                                    {isRefreshingMatrix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                    تحديث الفحص
                                </Button>
                                <Button 
                                    size="sm" 
                                    variant="secondary"
                                    onClick={() => handleSyncNow('push')}
                                    disabled={isSyncing}
                                    className="gap-1.5 font-bold text-amber-700 dark:text-amber-300 text-xs shadow-sm"
                                >
                                    {isSyncing && syncingMode === 'push' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                                    رفع تعديلات الفرع فقط ⬆️
                                </Button>
                                <Button 
                                    size="sm" 
                                    variant="secondary"
                                    onClick={() => handleSyncNow('pull')}
                                    disabled={isSyncing}
                                    className="gap-1.5 font-bold text-blue-700 dark:text-blue-300 text-xs shadow-sm"
                                >
                                    {isSyncing && syncingMode === 'pull' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                                    سحب تحديثات الإدارة فقط ⬇️
                                </Button>
                                <Button 
                                    size="sm" 
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 text-xs shadow"
                                    onClick={() => handleSyncNow('all')}
                                    disabled={isSyncing}
                                >
                                    {isSyncing && syncingMode === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <RefreshCw className="h-3.5 w-3.5 ml-1" />}
                                    مزامنة شاملة (رفع وتنزيل) 🔁
                                </Button>
                            </div>
                        </div>

                        {/* KPI Summary Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Card className="border shadow-sm bg-amber-500/5 border-amber-500/20">
                                <CardHeader className="py-3 pb-1">
                                    <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                                        <span>تعديلات بالفرع تنتظر الرفع (Push)</span>
                                        <ArrowUpRight className="h-4 w-4 text-amber-500" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="py-2">
                                    <div className="text-2xl font-black text-amber-600">
                                        {syncMatrix ? syncMatrix.totalPendingPush.toLocaleString() : '...'}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        حركات جديدة أو معدلة بانتظار الإرسال
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="border shadow-sm bg-blue-500/5 border-blue-500/20">
                                <CardHeader className="py-3 pb-1">
                                    <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                                        <span>تحديثات الإدارة الجاهزة للسحب (Pull)</span>
                                        <ArrowDownLeft className="h-4 w-4 text-blue-500" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="py-2">
                                    <div className="text-2xl font-black text-blue-600">
                                        {syncMatrix ? syncMatrix.totalPendingPull.toLocaleString() : '...'}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        أصناف، أسعار، أو مستخدمين جدد بالإدارة
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="border shadow-sm bg-emerald-500/5 border-emerald-500/20">
                                <CardHeader className="py-3 pb-1">
                                    <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                                        <span>الجداول المتطابقة والمحدثة</span>
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="py-2">
                                    <div className="text-2xl font-black text-emerald-600">
                                        {syncMatrix ? `${syncMatrix.syncedTablesCount} / ${syncMatrix.totalTablesCount}` : '...'}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        جداول متوافقة تماماً وبلا أي فوارق معلقة
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="border shadow-sm bg-purple-500/5 border-purple-500/20">
                                <CardHeader className="py-3 pb-1">
                                    <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                                        <span>آخر توقيت مزامنة معتمد</span>
                                        <Clock className="h-4 w-4 text-purple-500" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="py-2">
                                    <div className="text-sm font-bold text-foreground">
                                        {syncMatrix?.lastSyncTimestamp ? new Date(syncMatrix.lastSyncTimestamp).toLocaleString('ar-EG') : 'لم تتم بعد'}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                        السيرفر المركزي ({syncMatrix?.centralDatabase || config.centralDatabase})
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Main Sync Matrix Table Card */}
                        <Card className="border shadow-sm">
                            <CardHeader className="pb-3">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Database className="h-5 w-5 text-emerald-600" />
                                            مصفوفة المزامنة اللحظية الشاملة (Live Sync Matrix - 69 جدولاً)
                                        </CardTitle>
                                        <CardDescription>
                                            تتبع دقيق لآخر توقيت تعديل بالفرع، آخر توقيت مزامنة للإدارة، والتعديلات المعلقة، وسجلات الفرع بالإدارة مقابل الإجمالي التراكمي لجميع الفروع.
                                        </CardDescription>
                                    </div>
                                </div>

                                {/* Filter and Search Bar */}
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-4 pt-3 border-t">
                                    <div className="sm:col-span-4 relative">
                                        <Search className="h-4 w-4 absolute right-3 top-2.5 text-muted-foreground" />
                                        <Input 
                                            placeholder="ابحث بالاسم العربي أو الإنجليزي للجدول..."
                                            value={tableSearch}
                                            onChange={(e) => setTableSearch(e.target.value)}
                                            className="pr-9 h-9 text-xs"
                                        />
                                    </div>
                                    <div className="sm:col-span-3">
                                        <Select value={tableCategoryFilter} onValueChange={setTableCategoryFilter}>
                                            <SelectTrigger className="h-9 text-xs">
                                                <SelectValue placeholder="تصفية حسب القسم" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">جميع الأقسام (69 جدولاً)</SelectItem>
                                                <SelectItem value="فواتير وعمليات">فواتير وعمليات</SelectItem>
                                                <SelectItem value="حسابات ومالية">حسابات ومالية</SelectItem>
                                                <SelectItem value="مشتريات وموردين">مشتريات وموردين</SelectItem>
                                                <SelectItem value="عملاء ومبيعات">عملاء ومبيعات</SelectItem>
                                                <SelectItem value="مخازن وأصناف">مخازن وأصناف</SelectItem>
                                                <SelectItem value="توزيع ومندوبين">توزيع ومندوبين</SelectItem>
                                                <SelectItem value="موارد بشرية">موارد بشرية</SelectItem>
                                                <SelectItem value="نقاط البيع">نقاط البيع</SelectItem>
                                                <SelectItem value="أصول وإهلاك">أصول وإهلاك</SelectItem>
                                                <SelectItem value="إعدادات النظام">إعدادات النظام</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="sm:col-span-3">
                                        <Select value={tableDirectionFilter} onValueChange={(val: any) => setTableDirectionFilter(val)}>
                                            <SelectTrigger className="h-9 text-xs">
                                                <SelectValue placeholder="تصفية حسب الاتجاه" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">كافة الاتجاهات</SelectItem>
                                                <SelectItem value="push">رفع للإدارة فقط ⬆️</SelectItem>
                                                <SelectItem value="pull">سحب للفرع فقط ⬇️</SelectItem>
                                                <SelectItem value="bidirectional">متبادل ثنائي 🔁</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <Select value={tableStatusFilter} onValueChange={(val: any) => setTableStatusFilter(val)}>
                                            <SelectTrigger className="h-9 text-xs">
                                                <SelectValue placeholder="الحالة" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">كل الحالات ({syncMatrix?.tables.length || 0})</SelectItem>
                                                <SelectItem value="pending">بحاجة لمزامنة ⚠️ ({syncMatrix?.pendingTablesCount || 0})</SelectItem>
                                                <SelectItem value="synced">متطابق ومحدث ✅ ({syncMatrix?.syncedTablesCount || 0})</SelectItem>
                                                <SelectItem value="has_data">يحتوي بيانات</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="p-0">
                                <div className="border-t max-h-[620px] overflow-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/40 sticky top-0 z-10 shadow-sm text-xs">
                                            <TableRow>
                                                <TableHead className="w-10 text-center">#</TableHead>
                                                <TableHead className="min-w-[170px]">الجدول والقسم</TableHead>
                                                <TableHead className="text-center min-w-[100px]">الاتجاه</TableHead>
                                                <TableHead className="text-center min-w-[120px]">آخر تعديل بالفرع</TableHead>
                                                <TableHead className="text-center min-w-[120px]">آخر مزامنة للإدارة</TableHead>
                                                <TableHead className="text-center min-w-[90px] font-bold text-amber-700 bg-amber-500/5">معلق بالفرع</TableHead>
                                                <TableHead className="text-center min-w-[100px] font-bold text-blue-700 bg-blue-500/5">سجلات الفرع بالإدارة</TableHead>
                                                <TableHead className="text-center min-w-[100px] font-bold text-purple-700 bg-purple-500/5">إجمالي الإدارة (كافة الفروع)</TableHead>
                                                <TableHead className="text-center min-w-[140px]">حالة المزامنة</TableHead>
                                                <TableHead className="text-center w-24">إجراء</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredTables.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                                                        لا توجد جداول مطابقة للبحث أو الفلتر المحدد
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                filteredTables.map((t, idx) => (
                                                    <TableRow key={t.tableName} className="hover:bg-muted/20 text-xs">
                                                        <TableCell className="text-center text-muted-foreground font-mono">{idx + 1}</TableCell>
                                                        <TableCell>
                                                            <div className="font-bold text-foreground text-sm">{t.displayName}</div>
                                                            <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
                                                                <Database className="h-3 w-3 text-muted-foreground" />
                                                                <span>dbo.{t.tableName}</span>
                                                                <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                                                                    {t.category}
                                                                </Badge>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {renderDirectionBadge(t.direction)}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {formatTimestamp(t.lastLocalModified)}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {formatTimestamp(t.lastSyncedAt)}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold bg-amber-500/5">
                                                            {t.pendingPushCount > 0 ? (
                                                                <Badge variant="destructive" className="bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs px-2">
                                                                    {t.pendingPushCount.toLocaleString()}
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground">0</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold bg-blue-500/5">
                                                            {t.centralBranchRows === null ? (
                                                                <span className="text-[11px] text-muted-foreground">غير متصل</span>
                                                            ) : (
                                                                <span className={cn(t.centralBranchRows > 0 ? "text-blue-700 font-extrabold" : "text-muted-foreground")}>
                                                                    {t.centralBranchRows.toLocaleString()}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold bg-purple-500/5">
                                                            {t.centralTotalRows === null ? (
                                                                <span className="text-[11px] text-muted-foreground">غير متصل</span>
                                                            ) : (
                                                                <span className={cn(t.centralTotalRows > 0 ? "text-purple-700 font-extrabold" : "text-muted-foreground")}>
                                                                    {t.centralTotalRows.toLocaleString()}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {renderStatusBadge(t)}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 px-2 text-[11px] hover:bg-primary/10 text-primary font-bold"
                                                                onClick={() => handleSyncNow(t.direction === 'pull' ? 'pull' : 'push', t.tableName)}
                                                                disabled={isSyncing && syncingTable === t.tableName}
                                                                title={`مزامنة جدول ${t.displayName} الآن`}
                                                            >
                                                                {isSyncing && syncingTable === t.tableName ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                ) : (
                                                                    <RefreshCw className="h-3.5 w-3.5" />
                                                                )}
                                                            </Button>
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

                    {/* TAB 2: LIVE QUEUE MONITOR & LOGS */}
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
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={() => loadSettings(false)}>
                                        <RefreshCw className="h-3.5 w-3.5 ml-1" /> تحديث العدادات
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <ShoppingCart className="h-5 w-5 mx-auto text-blue-500" />
                                        <div className="text-xs text-muted-foreground">فواتير مبيعات</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.sales}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Truck className="h-5 w-5 mx-auto text-amber-500" />
                                        <div className="text-xs text-muted-foreground">فواتير مشتريات</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.purchases}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Banknote className="h-5 w-5 mx-auto text-emerald-500" />
                                        <div className="text-xs text-muted-foreground">مقبوضات عملاء</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.customerPayments}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <CreditCard className="h-5 w-5 mx-auto text-purple-500" />
                                        <div className="text-xs text-muted-foreground">مدفوعات موردين</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.supplierPayments}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Receipt className="h-5 w-5 mx-auto text-rose-500" />
                                        <div className="text-xs text-muted-foreground">مصروفات وإيراد</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.expenses}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Boxes className="h-5 w-5 mx-auto text-cyan-500" />
                                        <div className="text-xs text-muted-foreground">حركات مخازن</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.stock}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <ArrowLeftRight className="h-5 w-5 mx-auto text-indigo-500" />
                                        <div className="text-xs text-muted-foreground">تحويلات بين الفروع</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.transfers}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Wallet className="h-5 w-5 mx-auto text-emerald-600" />
                                        <div className="text-xs text-muted-foreground">حركات خزينة</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.treasury}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <Users className="h-5 w-5 mx-auto text-amber-600" />
                                        <div className="text-xs text-muted-foreground">توزيع ومندوبين</div>
                                        <div className="text-lg font-black text-foreground">{pendingBreakdown.rep}</div>
                                    </div>

                                    <div className="p-3 bg-muted/40 rounded-xl border text-center space-y-1">
                                        <UserCheck className="h-5 w-5 mx-auto text-violet-500" />
                                        <div className="text-xs text-muted-foreground">مرتبات وسلف HR</div>
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
                                    onClick={() => handleSyncNow('all')}
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

                    {/* TAB 3: CENTRAL CONNECTION SETTINGS */}
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
                                                placeholder="مثال: 10.110.16.16"
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
                                                placeholder="sa أو gmlogins"
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

                    {/* TAB 4: INITIALIZE & CREATE DATABASE */}
                    <TabsContent value="db-init" className="space-y-6 mt-4">
                        <Card className="border-2 border-amber-500/30 shadow-md">
                            <CardHeader className="bg-amber-500/5 border-b pb-4">
                                <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-400">
                                    <Sparkles className="h-5 w-5" />
                                    أداة إنشاء وتأسيس قاعدة البيانات (Database Setup & Initialization)
                                </CardTitle>
                                <CardDescription>
                                    تتيح لك هذه الأداة إنشاء وتأسيس قاعدة البيانات بكامل جداولها (70 جدولاً) والمشغلات الآلية وإعدادات الفروع بنقرة واحدة سواء على السيرفر المركزي للإدارة أو على السيرفر المحلي للفرع.
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
                                                setInitServer(config.centralServerIp || '10.110.16.16');
                                                setInitPort(config.centralSqlPort || 1433);
                                                setInitUsername(config.centralUsername || 'gmlogins');
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
                            </CardContent>
                            <CardFooter className="bg-muted/30 border-t py-4 flex justify-between items-center">
                                <span className="text-xs text-muted-foreground">
                                    تقوم هذه العملية بإنشاء قاعدة البيانات وتجهيز الهيكل كاملاً (70 جدولاً) مع كود الفرع والمشغلات التلقائية.
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
