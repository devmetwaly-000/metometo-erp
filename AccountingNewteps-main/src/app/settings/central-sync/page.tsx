"use client";

import React, { useState, useEffect, useMemo } from 'react';
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
    Undo2, ArrowLeftRight, Wallet, Users, UserCheck, Terminal, Search, Layers, Filter, CheckCircle,
    HardDrive, Cpu, AlertCircle, FileText, ChevronRight, Play, CheckCheck, X
} from "lucide-react";
import { CentralSyncConfig, TableSyncMatrixItem, TablesSyncMatrixResponse } from '@/lib/central-sync';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function CentralSyncSettingsPage() {
    const { toast } = useToast();
    const { warehouses } = useData();

    // 1. Settings State
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
    
    // Connection test status
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
    const [isInitializingDb, setIsInitializingDb] = useState(false);
    const [initDbResult, setInitDbResult] = useState<{ success: boolean; message: string; tablesCount?: number; error?: string } | null>(null);

    // Active Tab: 'matrix' (المصفوفة والجداول) | 'config' (الإعدادات والتأسيس) | 'queue' (طابور الحركات والسجل)
    const [activeTab, setActiveTab] = useState<'matrix' | 'config' | 'queue'>('matrix');

    // Matrix Filters State
    const [syncMatrix, setSyncMatrix] = useState<TablesSyncMatrixResponse | null>(null);
    const [isRefreshingMatrix, setIsRefreshingMatrix] = useState(false);
    const [tableSearch, setTableSearch] = useState('');
    const [tableCategoryFilter, setTableCategoryFilter] = useState('all');
    const [tableDirectionFilter, setTableDirectionFilter] = useState<'all' | 'push' | 'pull' | 'bidirectional'>('all');
    const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'pending' | 'synced' | 'has_data'>('all');

    // Load initial settings and matrix from API
    const loadSettings = async (isInitial: boolean = false) => {
        try {
            const res = await fetch('/api/sync/central');
            const data = await res.json();
            if (data.success) {
                if (isInitial && data.config) {
                    setConfig(data.config);
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
                    title: "تم فحص وتحديث مصفوفة المزامنة",
                    description: `تم تحديث توقيتات وتعديلات ${data.syncMatrix.tables.length} جدولاً بالكامل.`
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

    useEffect(() => {
        loadSettings(true);
    }, []);

    // Auto-refresh when viewing queue monitor tab
    useEffect(() => {
        if (activeTab !== 'queue') return;
        const timer = setInterval(() => {
            loadSettings(false);
        }, 20000);
        return () => clearInterval(timer);
    }, [activeTab]);

    const handleInputChange = (field: keyof CentralSyncConfig, value: any) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleWarehouseChange = (whId: string) => {
        const wh = warehouses.find((w: any) => w.id === whId);
        if (wh) {
            setConfig(prev => ({
                ...prev,
                currentBranchId: wh.id,
                currentBranchCode: wh.code || prev.currentBranchCode,
                currentBranchName: wh.name || prev.currentBranchName
            }));
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
                await handleRefreshMatrix();
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

    // Initialize & Create Database (Uses the exact config fields without duplicate typing)
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
                        server: config.centralServerIp,
                        port: Number(config.centralSqlPort) || 1433,
                        database: config.centralDatabase,
                        user: config.centralUsername,
                        password: config.centralPassword,
                        branchCode: config.currentBranchCode,
                        branchName: config.currentBranchName,
                        isCentral: true
                    }
                })
            });
            const data = await res.json();
            setInitDbResult(data);
            if (data.success) {
                toast({
                    title: "تم تأسيس وتهيئة قاعدة البيانات بنجاح!",
                    description: data.message
                });
                await handleRefreshMatrix();
            } else {
                toast({
                    title: "فشل تأسيس قاعدة البيانات",
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
                        <ArrowDownLeft className="h-3 w-3" /> {t.pendingPullCount.toLocaleString()} تحديثات بالإدارة
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
    const filteredTables = useMemo(() => {
        return (syncMatrix?.tables || []).filter(t => {
            const matchesSearch = !tableSearch || 
                t.displayName.toLowerCase().includes(tableSearch.toLowerCase()) ||
                t.tableName.toLowerCase().includes(tableSearch.toLowerCase()) ||
                t.category.toLowerCase().includes(tableSearch.toLowerCase());
            
            if (!matchesSearch) return false;

            if (tableCategoryFilter !== 'all' && t.category !== tableCategoryFilter) {
                return false;
            }

            if (tableDirectionFilter !== 'all' && t.direction !== tableDirectionFilter) {
                return false;
            }

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
    }, [syncMatrix, tableSearch, tableCategoryFilter, tableDirectionFilter, tableStatusFilter]);

    if (isLoading) {
        return (
            <div className="flex flex-col justify-center items-center py-32 gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground animate-pulse">جاري تحميل لوحة المزامنة وإحصائيات الربط السحابي...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full min-h-full pb-10">
            {/* 1. Header with Title and Global Action Buttons */}
            <PageHeader title="المزامنة المركزية وإدارة الربط السحابي">
                <div className="flex items-center gap-2 flex-wrap">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleTestConnection} 
                        disabled={isTesting}
                        className="gap-1.5 text-xs font-semibold"
                    >
                        {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-amber-500" />}
                        فحص الاتصال الفوري
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleRefreshMatrix} 
                        disabled={isRefreshingMatrix}
                        className="gap-1.5 text-xs font-semibold"
                    >
                        {isRefreshingMatrix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 text-blue-500" />}
                        تحديث الفحص اللحظي
                    </Button>
                    <Button 
                        size="sm" 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 text-xs shadow-md"
                        onClick={() => handleSyncNow('all')}
                        disabled={isSyncing}
                    >
                        {isSyncing && syncingMode === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <RefreshCw className="h-3.5 w-3.5 ml-1" />}
                        مزامنة شاملة الآن 🔁
                    </Button>
                </div>
            </PageHeader>

            <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-7xl mx-auto w-full">
                
                {/* 2. Top Unified Command Ribbon (شريط القيادة والاتصال الحي الموحد) */}
                <div className="rounded-2xl border bg-gradient-to-r from-card via-card/95 to-muted/30 p-5 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
                    
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                        {/* Branch Identity */}
                        <div className="md:col-span-4 space-y-1.5 border-b md:border-b-0 md:border-l md:pl-4 pb-3 md:pb-0">
                            <div className="flex items-center gap-2">
                                <Badge className="bg-primary text-primary-foreground font-bold px-2.5 py-0.5 text-xs gap-1 shadow-sm">
                                    <Database className="h-3.5 w-3.5" />
                                    الفرع النشط
                                </Badge>
                                <span className="font-mono text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                    كود: {config.currentBranchCode}
                                </span>
                            </div>
                            <h2 className="text-lg font-black text-foreground tracking-tight">
                                {config.currentBranchName}
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                المزامنة الذكية قائمة على الطابع الزمني <strong>(UpdatedAt)</strong> ومبدأ <strong>الـ UPSERT</strong> لضمان سلامة حركات الفروع.
                            </p>
                        </div>

                        {/* Central Server Live Status */}
                        <div className="md:col-span-4 space-y-1.5 border-b md:border-b-0 md:border-l md:pl-4 pb-3 md:pb-0">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-semibold">
                                    <Server className="h-3.5 w-3.5 text-primary" />
                                    السيرفر المركزي للإدارة
                                </span>
                                {testResult ? (
                                    testResult.success ? (
                                        <Badge className="bg-emerald-600 text-white text-[10px] gap-1 px-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                            متصل ({testResult.latencyMs}ms)
                                        </Badge>
                                    ) : (
                                        <Badge variant="destructive" className="text-[10px] gap-1 px-2">
                                            <AlertTriangle className="h-3 w-3" />
                                            غير متصل
                                        </Badge>
                                    )
                                ) : (
                                    <Badge variant="outline" className="text-[10px] font-mono">
                                        جاهز للفحص
                                    </Badge>
                                )}
                            </div>
                            <div className="font-mono font-bold text-sm text-foreground truncate">
                                {config.centralServerIp}:{config.centralSqlPort}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono flex items-center gap-1.5">
                                <span>قاعدة البيانات:</span>
                                <span className="font-bold text-foreground">{config.centralDatabase}</span>
                            </div>
                        </div>

                        {/* Sync Activity & Pending Counter */}
                        <div className="md:col-span-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
                                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                                    الحركات المعلقة بالفرع
                                </span>
                                <Badge 
                                    className={cn(
                                        "font-mono font-black text-xs px-2.5 py-0.5",
                                        pendingBreakdown.total > 0 ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-muted text-muted-foreground"
                                    )}
                                >
                                    {pendingBreakdown.total.toLocaleString()} حركة
                                </Badge>
                            </div>

                            <div className="flex items-center justify-between text-xs pt-1 border-t">
                                <span className="text-muted-foreground">آخر مزامنة ناجحة:</span>
                                <span className="font-bold text-foreground">
                                    {config.lastSyncTime ? new Date(config.lastSyncTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'لم تتم بعد'}
                                </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1 text-emerald-600 font-bold">
                                    <ArrowUpRight className="h-3 w-3" /> رفع: {config.lastPushedCount || 0}
                                </span>
                                <span className="flex items-center gap-1 text-blue-600 font-bold">
                                    <ArrowDownLeft className="h-3 w-3" /> تنزيل: {config.lastPulledCount || 0}
                                </span>
                                <span className="text-muted-foreground">
                                    المجدول: {config.autoSync ? `كل ${config.autoSyncIntervalMinutes} د` : 'متوقف'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Re-engineered Navigation Tabs */}
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 max-w-xl mx-auto h-11 bg-muted/70 p-1 rounded-xl shadow-inner">
                        <TabsTrigger value="matrix" className="gap-2 font-bold text-xs rounded-lg data-[state=active]:shadow-sm">
                            <Database className="h-4 w-4 text-emerald-500" /> 
                            مصفوفة الجداول ({syncMatrix?.tables.length || 69})
                        </TabsTrigger>
                        <TabsTrigger value="config" className="gap-2 font-bold text-xs rounded-lg data-[state=active]:shadow-sm">
                            <Server className="h-4 w-4 text-blue-500" /> 
                            إعدادات الربط وتأسيس القاعدة
                        </TabsTrigger>
                        <TabsTrigger value="queue" className="gap-2 font-bold text-xs rounded-lg data-[state=active]:shadow-sm">
                            <Activity className="h-4 w-4 text-amber-500" /> 
                            طابور الحركات وسجل المزامنة
                        </TabsTrigger>
                    </TabsList>

                    {/* ========================================================= */}
                    {/* TAB 1: MASTER SYNC MATRIX (المصفوفة اللحظية لكافة الـ 69 جدولاً) */}
                    {/* ========================================================= */}
                    <TabsContent value="matrix" className="space-y-5 mt-5">
                        
                        {/* Quick Action Ribbon */}
                        <div className="p-3.5 rounded-xl border bg-card/60 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs gap-1 font-semibold">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    الجداول المتطابقة: <strong className="text-foreground mr-1">{syncMatrix?.syncedTablesCount || 0} من أصل {syncMatrix?.totalTablesCount || 69}</strong>
                                </Badge>
                                {(syncMatrix?.totalPendingPush || 0) > 0 && (
                                    <Badge className="bg-amber-600 text-white text-xs font-bold gap-1 shadow-sm">
                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                        {syncMatrix?.totalPendingPush.toLocaleString()} حركة بالفرع بانتظار الرفع
                                    </Badge>
                                )}
                            </div>

                            {/* Direct Action Buttons */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button 
                                    size="sm" 
                                    variant="secondary"
                                    onClick={() => handleSyncNow('push')}
                                    disabled={isSyncing}
                                    className="gap-1.5 font-bold text-amber-700 dark:text-amber-300 text-xs shadow-sm"
                                >
                                    {isSyncing && syncingMode === 'push' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                                    رفع حركات الفرع فقط ⬆️
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
                                    مزامنة شاملة متزامنة 🔁
                                </Button>
                            </div>
                        </div>

                        {/* Master Matrix Table Card */}
                        <Card className="border shadow-sm">
                            <CardHeader className="pb-3 space-y-3">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Database className="h-5 w-5 text-emerald-600" />
                                            مصفوفة تتبع التعديلات والطوابع الزمنية (Live Sync Matrix)
                                        </CardTitle>
                                        <CardDescription>
                                            جدول مركزي يوضح آخر تعديل بالفرع، آخر مزامنة مع الإدارة، وحجم العمليات المعلقة لكل جدول على حدة.
                                        </CardDescription>
                                    </div>

                                    {/* Quick Status Filter Pills */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <Button 
                                            size="sm" 
                                            variant={tableStatusFilter === 'all' ? 'default' : 'outline'}
                                            onClick={() => setTableStatusFilter('all')}
                                            className="h-7 text-xs px-2.5"
                                        >
                                            الكل ({syncMatrix?.tables.length || 0})
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            variant={tableStatusFilter === 'pending' ? 'default' : 'outline'}
                                            onClick={() => setTableStatusFilter('pending')}
                                            className={cn("h-7 text-xs px-2.5", tableStatusFilter === 'pending' && "bg-amber-600 hover:bg-amber-700")}
                                        >
                                            معلق فقط ({syncMatrix?.pendingTablesCount || 0})
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            variant={tableStatusFilter === 'synced' ? 'default' : 'outline'}
                                            onClick={() => setTableStatusFilter('synced')}
                                            className={cn("h-7 text-xs px-2.5", tableStatusFilter === 'synced' && "bg-emerald-600 hover:bg-emerald-700")}
                                        >
                                            متطابق ({syncMatrix?.syncedTablesCount || 0})
                                        </Button>
                                    </div>
                                </div>

                                {/* Advanced Search and Filter Bar */}
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t">
                                    <div className="sm:col-span-5 relative">
                                        <Search className="h-4 w-4 absolute right-3 top-2.5 text-muted-foreground" />
                                        <Input 
                                            placeholder="ابحث بالاسم العربي، اسم الجدول، أو القسم..."
                                            value={tableSearch}
                                            onChange={(e) => setTableSearch(e.target.value)}
                                            className="pr-9 h-9 text-xs"
                                        />
                                        {tableSearch && (
                                            <button 
                                                onClick={() => setTableSearch('')} 
                                                className="absolute left-3 top-2.5 text-muted-foreground hover:text-foreground"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="sm:col-span-4">
                                        <Select value={tableCategoryFilter} onValueChange={setTableCategoryFilter}>
                                            <SelectTrigger className="h-9 text-xs">
                                                <SelectValue placeholder="تصفية حسب القسم" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">جميع الأقسام ({syncMatrix?.tables.length || 69} جدولاً)</SelectItem>
                                                <SelectItem value="فواتير وعمليات">فواتير وعمليات</SelectItem>
                                                <SelectItem value="مشتريات وموردين">مشتريات وموردين</SelectItem>
                                                <SelectItem value="عملاء ومبيعات">عملاء ومبيعات</SelectItem>
                                                <SelectItem value="حسابات ومالية">حسابات ومالية</SelectItem>
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
                                </div>
                            </CardHeader>

                            <CardContent className="p-0">
                                <div className="border-t max-h-[600px] overflow-auto relative">
                                    <Table>
                                        <TableHeader className="bg-muted/60 sticky top-0 z-20 shadow-sm text-xs">
                                            <TableRow className="border-b">
                                                <TableHead className="w-10 text-center font-bold">#</TableHead>
                                                <TableHead className="min-w-[180px] font-bold">الجدول والقسم</TableHead>
                                                <TableHead className="text-center min-w-[100px] font-bold">الاتجاه</TableHead>
                                                <TableHead className="text-center min-w-[130px] font-bold">آخر تعديل بالفرع</TableHead>
                                                <TableHead className="text-center min-w-[130px] font-bold">آخر مزامنة للإدارة</TableHead>
                                                <TableHead className="text-center min-w-[95px] font-bold text-amber-700 bg-amber-500/5">معلق بالفرع</TableHead>
                                                <TableHead className="text-center min-w-[100px] font-bold text-blue-700 bg-blue-500/5">سطور الفرع بالإدارة</TableHead>
                                                <TableHead className="text-center min-w-[100px] font-bold text-purple-700 bg-purple-500/5">إجمالي الإدارة</TableHead>
                                                <TableHead className="text-center min-w-[130px] font-bold">حالة المزامنة</TableHead>
                                                <TableHead className="text-center w-24 font-bold">إجراء فوري</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredTables.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                                                        <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                                                        لا توجد جداول مطابقة للبحث أو الفلتر المحدد
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                filteredTables.map((t, idx) => (
                                                    <TableRow key={t.tableName} className="hover:bg-muted/30 text-xs transition-colors">
                                                        <TableCell className="text-center text-muted-foreground font-mono">{idx + 1}</TableCell>
                                                        <TableCell>
                                                            <div className="font-bold text-foreground text-sm flex items-center gap-1.5">
                                                                <span>{t.displayName}</span>
                                                            </div>
                                                            <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
                                                                <Database className="h-3 w-3 text-muted-foreground/70" />
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
                                                                <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs px-2 shadow-sm">
                                                                    {t.pendingPushCount.toLocaleString()}
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground">0</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold bg-blue-500/5">
                                                            {t.centralBranchRows === null ? (
                                                                <span className="text-[11px] text-muted-foreground">-</span>
                                                            ) : (
                                                                <span className={cn(t.centralBranchRows > 0 ? "text-blue-700 font-extrabold" : "text-muted-foreground")}>
                                                                    {t.centralBranchRows.toLocaleString()}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold bg-purple-500/5">
                                                            {t.centralTotalRows === null ? (
                                                                <span className="text-[11px] text-muted-foreground">-</span>
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
                                                                variant="outline"
                                                                className="h-7 px-2.5 text-[11px] hover:bg-primary hover:text-primary-foreground font-bold shadow-xs transition-colors"
                                                                onClick={() => handleSyncNow(t.direction === 'pull' ? 'pull' : 'push', t.tableName)}
                                                                disabled={isSyncing && syncingTable === t.tableName}
                                                                title={`مزامنة جدول ${t.displayName} الآن`}
                                                            >
                                                                {isSyncing && syncingTable === t.tableName ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <RefreshCw className="h-3 w-3 ml-1" />
                                                                        مزامنة
                                                                    </>
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

                    {/* ========================================================= */}
                    {/* TAB 2: CONNECTION & DATABASE PROVISIONING (إعدادات الربط وتأسيس القاعدة) */}
                    {/* ========================================================= */}
                    <TabsContent value="config" className="space-y-6 mt-5">
                        
                        {/* Settings & Configuration Card */}
                        <Card className="border shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Server className="h-5 w-5 text-primary" />
                                    إعدادات الربط السحابي وبيانات الخادم المركزي
                                </CardTitle>
                                <CardDescription>
                                    تحديد عنوان السيرفر المركزي للإدارة وربط هوية هذا الجهاز بالفرع والمستودع المسجل.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                
                                {/* Section 1: Local Branch Identity */}
                                <div className="p-4 rounded-xl border bg-muted/20 space-y-4">
                                    <div className="flex items-center gap-2 border-b pb-2">
                                        <Database className="h-4 w-4 text-primary" />
                                        <span className="font-bold text-sm">1. هوية وبيانات الفرع المحلي (Local Branch Identity)</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">ربط بمستودع / فرع مسجل</Label>
                                            <Select value={config.currentBranchId} onValueChange={handleWarehouseChange}>
                                                <SelectTrigger className="h-9 text-xs">
                                                    <SelectValue placeholder="اختر الفرع أو المستودع..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {warehouses.map((w: any) => (
                                                        <SelectItem key={w.id} value={w.id}>
                                                            {w.name} (كود: {w.code || '-'})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">كود الفرع (Branch Code)</Label>
                                            <Input 
                                                value={config.currentBranchCode} 
                                                onChange={e => handleInputChange('currentBranchCode', e.target.value)} 
                                                className="h-9 font-mono font-bold text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">اسم الفرع (Branch Name)</Label>
                                            <Input 
                                                value={config.currentBranchName} 
                                                onChange={e => handleInputChange('currentBranchName', e.target.value)} 
                                                className="h-9 font-bold text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Central SQL Server Settings */}
                                <div className="p-4 rounded-xl border bg-muted/20 space-y-4">
                                    <div className="flex items-center gap-2 border-b pb-2">
                                        <Network className="h-4 w-4 text-primary" />
                                        <span className="font-bold text-sm">2. إعدادات خادم SQL Server للإدارة المركزية</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                        <div className="md:col-span-8 space-y-1.5">
                                            <Label className="text-xs font-bold">عنوان السيرفر (IP Server / Host)</Label>
                                            <Input 
                                                value={config.centralServerIp} 
                                                onChange={e => handleInputChange('centralServerIp', e.target.value)} 
                                                placeholder="مثال: 10.110.16.16 أو central.company.com أو localhost" 
                                                className="h-9 font-mono text-xs"
                                            />
                                        </div>
                                        <div className="md:col-span-4 space-y-1.5">
                                            <Label className="text-xs font-bold">البورت (SQL Port)</Label>
                                            <Input 
                                                type="number" 
                                                value={config.centralSqlPort} 
                                                onChange={e => handleInputChange('centralSqlPort', Number(e.target.value))} 
                                                className="h-9 font-mono text-xs"
                                            />
                                        </div>
                                        <div className="md:col-span-4 space-y-1.5">
                                            <Label className="text-xs font-bold">اسم قاعدة البيانات المركزية</Label>
                                            <Input 
                                                value={config.centralDatabase} 
                                                onChange={e => handleInputChange('centralDatabase', e.target.value)} 
                                                className="h-9 font-mono font-bold text-xs"
                                            />
                                        </div>
                                        <div className="md:col-span-4 space-y-1.5">
                                            <Label className="text-xs font-bold">اسم المستخدم (SQL Username)</Label>
                                            <Input 
                                                value={config.centralUsername} 
                                                onChange={e => handleInputChange('centralUsername', e.target.value)} 
                                                className="h-9 font-mono text-xs"
                                            />
                                        </div>
                                        <div className="md:col-span-4 space-y-1.5">
                                            <Label className="text-xs font-bold">كلمة المرور (SQL Password)</Label>
                                            <Input 
                                                type="password" 
                                                value={config.centralPassword} 
                                                onChange={e => handleInputChange('centralPassword', e.target.value)} 
                                                placeholder="••••••••••••" 
                                                className="h-9 font-mono text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 3: Background Auto-Sync Schedule */}
                                <div className="p-4 rounded-xl border bg-muted/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="font-bold text-sm flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-emerald-600" />
                                            جدولة المزامنة التلقائية بالخلفية (Background Sync Service)
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            رفع العمليات الجديدة وسحب تحديثات الأصناف والأسعار تلقائياً دون تدخل بشري.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs">تكرار كل:</Label>
                                            <Select 
                                                value={String(config.autoSyncIntervalMinutes || 5)} 
                                                onValueChange={v => handleInputChange('autoSyncIntervalMinutes', Number(v))}
                                                disabled={!config.autoSync}
                                            >
                                                <SelectTrigger className="h-8 w-24 text-xs font-mono font-bold">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="1">1 دقيقة</SelectItem>
                                                    <SelectItem value="2">2 دقيقة</SelectItem>
                                                    <SelectItem value="5">5 دقائق</SelectItem>
                                                    <SelectItem value="10">10 دقائق</SelectItem>
                                                    <SelectItem value="15">15 دقيقة</SelectItem>
                                                    <SelectItem value="30">30 دقيقة</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex items-center gap-2 border-r pr-3">
                                            <Switch 
                                                checked={config.autoSync} 
                                                onCheckedChange={c => handleInputChange('autoSync', c)} 
                                            />
                                            <span className="text-xs font-bold">{config.autoSync ? 'مفعل' : 'معطل'}</span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>

                            <CardFooter className="bg-muted/30 border-t py-3 flex justify-between items-center">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={handleTestConnection} 
                                    disabled={isTesting}
                                    className="gap-1.5 text-xs"
                                >
                                    {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-amber-500" />}
                                    اختبار الاتصال بالسيرفر المركزي
                                </Button>
                                <Button 
                                    size="sm" 
                                    onClick={handleSave} 
                                    disabled={isSaving}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-1.5 text-xs shadow"
                                >
                                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 ml-1" />}
                                    حفظ الإعدادات المحدثة
                                </Button>
                            </CardFooter>
                        </Card>

                        {/* Database Provisioning & Architecture Card (One-click complete DB Setup) */}
                        <Card className="border shadow-sm border-amber-500/30 bg-gradient-to-b from-card to-amber-500/5">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base flex items-center gap-2 text-amber-900 dark:text-amber-200">
                                            <Sparkles className="h-5 w-5 text-amber-500" />
                                            تأسيس وهندسة قاعدة البيانات المركزية (71 جدولاً بالكامل)
                                        </CardTitle>
                                        <CardDescription>
                                            إنشاء وتأسيس قاعدة البيانات المركزية ومصفوفة الجداول بكامل الجداول الـ 71 والمشغلات والعروض التحليلية بضغطة زر واحدة استناداً للإعدادات المسجلة أعلاه.
                                        </CardDescription>
                                    </div>
                                    <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-xs gap-1">
                                        <HardDrive className="h-3.5 w-3.5" /> 71 جدولاً شاملاً
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                                    <p className="font-semibold mb-1">ما الذي تقوم به هذه العملية؟</p>
                                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                                        <li>إنشاء قاعدة البيانات <strong>[{config.centralDatabase}]</strong> على السيرفر المركزي إن لم تكن موجودة.</li>
                                        <li>بناء وتحديث <strong>كافة الجداول الـ 71</strong> بالهيكل المعتمد والمشغلات التلقائية لحقن كود الفرع.</li>
                                        <li>تثبيت أعمدة التتبع الزمني: <code>UpdatedAt</code>, <code>CreatedAt</code>, <code>BranchCode</code>, <code>SyncStatus</code>, <code>LastSyncedAt</code>.</li>
                                        <li>تأسيس جدول مصفوفة المزامنة <strong>dbo.SyncTrackingMatrix</strong> لتتبع كل جدول لحظياً.</li>
                                    </ul>
                                </div>

                                {initDbResult && (
                                    <div className={cn(
                                        "p-4 rounded-xl border flex items-start gap-3",
                                        initDbResult.success ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-200" : "bg-destructive/10 border-destructive/40 text-destructive"
                                    )}>
                                        {initDbResult.success ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />}
                                        <div className="space-y-1 text-xs">
                                            <div className="font-bold text-sm">{initDbResult.message}</div>
                                            {initDbResult.tablesCount && <p className="font-semibold">إجمالي الجداول التي تم بناؤها وتأسيسها: {initDbResult.tablesCount} جدولاً بالكامل.</p>}
                                            {initDbResult.error && <p className="font-mono text-destructive">{initDbResult.error}</p>}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="bg-muted/30 border-t py-3 flex justify-between items-center">
                                <span className="text-xs text-muted-foreground">
                                    الهدف: السيرفر <strong className="text-foreground">{config.centralServerIp}</strong> | القاعدة: <strong className="text-foreground">{config.centralDatabase}</strong>
                                </span>
                                <Button 
                                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-2 text-xs shadow-md"
                                    onClick={handleInitializeDatabase}
                                    disabled={isInitializingDb || !config.centralDatabase.trim()}
                                >
                                    {isInitializingDb ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin ml-1" />
                                            جاري تأسيس وبناء الجداول...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4 ml-1" />
                                            تأسيس وبناء قاعدة البيانات الآن (71 جدولاً)
                                        </>
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* ========================================================= */}
                    {/* TAB 3: QUEUE ANALYTICS & AUDIT LOGS (طابور الحركات وسجل المزامنة) */}
                    {/* ========================================================= */}
                    <TabsContent value="queue" className="space-y-6 mt-5">
                        
                        {/* Pending Queue Breakdown Grid */}
                        <Card className="border shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between pb-3">
                                <div>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Activity className="h-5 w-5 text-amber-500" />
                                        توزيع الحركات المعلقة بالفرع حسب الأقسام
                                    </CardTitle>
                                    <CardDescription>
                                        تتبع لحظي للوثائق والحركات التي تنتظر الرفع للسيرفر المركزي.
                                    </CardDescription>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => loadSettings(false)} className="gap-1.5 text-xs">
                                    <RefreshCw className="h-3 w-3" /> تحديث العدادات
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                    <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border text-center space-y-1">
                                        <ShoppingCart className="h-5 w-5 mx-auto text-blue-500" />
                                        <div className="text-xs text-muted-foreground font-medium">فواتير مبيعات</div>
                                        <div className="text-xl font-black text-foreground">{pendingBreakdown.sales}</div>
                                    </div>

                                    <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border text-center space-y-1">
                                        <Truck className="h-5 w-5 mx-auto text-amber-500" />
                                        <div className="text-xs text-muted-foreground font-medium">فواتير مشتريات</div>
                                        <div className="text-xl font-black text-foreground">{pendingBreakdown.purchases}</div>
                                    </div>

                                    <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border text-center space-y-1">
                                        <Banknote className="h-5 w-5 mx-auto text-emerald-500" />
                                        <div className="text-xs text-muted-foreground font-medium">سندات قبض</div>
                                        <div className="text-xl font-black text-foreground">{pendingBreakdown.customerPayments}</div>
                                    </div>

                                    <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border text-center space-y-1">
                                        <CreditCard className="h-5 w-5 mx-auto text-purple-500" />
                                        <div className="text-xs text-muted-foreground font-medium">سندات صرف</div>
                                        <div className="text-xl font-black text-foreground">{pendingBreakdown.supplierPayments}</div>
                                    </div>

                                    <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border text-center space-y-1">
                                        <Receipt className="h-5 w-5 mx-auto text-rose-500" />
                                        <div className="text-xs text-muted-foreground font-medium">مصروفات وإيراد</div>
                                        <div className="text-xl font-black text-foreground">{pendingBreakdown.expenses}</div>
                                    </div>

                                    <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border text-center space-y-1">
                                        <Boxes className="h-5 w-5 mx-auto text-cyan-500" />
                                        <div className="text-xs text-muted-foreground font-medium">حركات مخازن</div>
                                        <div className="text-xl font-black text-foreground">{pendingBreakdown.stock}</div>
                                    </div>

                                    <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border text-center space-y-1">
                                        <ArrowLeftRight className="h-5 w-5 mx-auto text-indigo-500" />
                                        <div className="text-xs text-muted-foreground font-medium">تحويلات فروع</div>
                                        <div className="text-xl font-black text-foreground">{pendingBreakdown.transfers}</div>
                                    </div>

                                    <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border text-center space-y-1">
                                        <Wallet className="h-5 w-5 mx-auto text-emerald-600" />
                                        <div className="text-xs text-muted-foreground font-medium">حركات خزينة</div>
                                        <div className="text-xl font-black text-foreground">{pendingBreakdown.treasury}</div>
                                    </div>

                                    <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border text-center space-y-1">
                                        <Users className="h-5 w-5 mx-auto text-amber-600" />
                                        <div className="text-xs text-muted-foreground font-medium">مندوبين وتوزيع</div>
                                        <div className="text-xl font-black text-foreground">{pendingBreakdown.rep}</div>
                                    </div>

                                    <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border text-center space-y-1">
                                        <UserCheck className="h-5 w-5 mx-auto text-violet-500" />
                                        <div className="text-xs text-muted-foreground font-medium">مرتبات وسلف HR</div>
                                        <div className="text-xl font-black text-foreground">{pendingBreakdown.hr}</div>
                                    </div>

                                    <div className="p-3 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border text-center space-y-1 col-span-2 sm:col-span-2">
                                        <Terminal className="h-5 w-5 mx-auto text-pink-500" />
                                        <div className="text-xs text-muted-foreground font-medium">جلسات كاشير POS</div>
                                        <div className="text-xl font-black text-foreground">{pendingBreakdown.pos}</div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-muted/20 border-t flex justify-between items-center py-3">
                                <span className="text-xs text-muted-foreground">
                                    إجمالي المعلق: <strong className="text-foreground">{pendingBreakdown.total.toLocaleString()} حركة</strong>
                                </span>
                                <Button 
                                    size="sm" 
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-2 text-xs"
                                    onClick={() => handleSyncNow('push')}
                                    disabled={isSyncing}
                                >
                                    {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                                    مزامنة ورفع المعلق الآن
                                </Button>
                            </CardFooter>
                        </Card>

                        {/* Recent Sync Activity Log */}
                        <Card className="border shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-muted-foreground" />
                                    سجل عمليات المزامنة اللحظي (Sync Activity Log)
                                </CardTitle>
                                <CardDescription>تاريخ تفصيلي لعمليات الرفع والسحب التي تمت بين هذا الفرع والخادم المركزي.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="border-t">
                                    <Table>
                                        <TableHeader className="bg-muted/40 text-xs">
                                            <TableRow>
                                                <TableHead>وقت العملية</TableHead>
                                                <TableHead>الفرع</TableHead>
                                                <TableHead className="text-center">الحالة</TableHead>
                                                <TableHead className="text-center">تم الرفع</TableHead>
                                                <TableHead className="text-center">تم التنزيل</TableHead>
                                                <TableHead>الملاحظات والتفاصيل</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {recentSyncLogs.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-xs">
                                                        لا توجد سجلات مزامنة سابقة بعد
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                recentSyncLogs.map((log, idx) => (
                                                    <TableRow key={idx} className="text-xs hover:bg-muted/20">
                                                        <TableCell className="font-mono">
                                                            {log.timestamp ? new Date(log.timestamp).toLocaleString('ar-EG') : 'الآن'}
                                                        </TableCell>
                                                        <TableCell className="font-medium">{log.branch}</TableCell>
                                                        <TableCell className="text-center">
                                                            {log.status === 'success' ? (
                                                                <Badge className="bg-emerald-600 text-white text-[10px]">ناجحة ✅</Badge>
                                                            ) : log.status === 'failed' ? (
                                                                <Badge variant="destructive" className="text-[10px]">فشلت ❌</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-[10px]">جاهز</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold text-emerald-600">
                                                            +{log.pushed || 0}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold text-blue-600">
                                                            +{log.pulled || 0}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground text-xs truncate max-w-xs">
                                                            {log.error ? (
                                                                <span className="text-destructive font-semibold">{log.error}</span>
                                                            ) : (
                                                                log.details || 'تمت المزامنة بنجاح وحفظ التوقيتات'
                                                            )}
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
            </main>
        </div>
    );
}
