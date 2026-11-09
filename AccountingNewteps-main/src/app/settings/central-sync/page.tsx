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
    Database, ArrowUpRight, ArrowDownLeft, Clock, Zap, Loader2, Save,
    ShoppingCart, Truck, Banknote, CreditCard, Receipt, Boxes, Activity, Sparkles,
    ArrowLeftRight, Wallet, Users, UserCheck, Terminal, Search, CheckCircle,
    HardDrive, Cpu, AlertCircle, FileText, CheckCheck, X, ListChecks, ShieldAlert
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

    // Active Tab: 'matrix' | 'queue' | 'config'
    const [activeTab, setActiveTab] = useState<'matrix' | 'queue' | 'config'>('matrix');

    // Matrix Filters State
    const [syncMatrix, setSyncMatrix] = useState<TablesSyncMatrixResponse | null>(null);
    const [isRefreshingMatrix, setIsRefreshingMatrix] = useState(false);
    const [tableSearch, setTableSearch] = useState('');
    const [tableCategoryFilter, setTableCategoryFilter] = useState('all');
    const [tableDirectionFilter, setTableDirectionFilter] = useState<'all' | 'push' | 'pull' | 'bidirectional'>('all');
    const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'pending' | 'synced' | 'has_data'>('all');

    // Load Central Sync configuration and sync status
    const loadSettings = async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
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
                    title: "تم تحديث مصفوفة المزامنة",
                    description: `تم فحص توقيتات وسجلات ${data.syncMatrix.tables.length} جدولاً بنجاح.`
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
        }, 15000);
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
        if (!ts) return <span className="text-muted-foreground/60 text-xs">-</span>;
        try {
            const d = new Date(ts);
            return (
                <div className="flex flex-col text-[11px] leading-tight font-mono text-center">
                    <span className="font-semibold text-foreground">{d.toLocaleDateString('ar-EG')}</span>
                    <span className="text-muted-foreground text-[10px]">{d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            );
        } catch {
            return <span className="text-muted-foreground text-xs">{ts}</span>;
        }
    };

    // Helper: render sync direction badge (NO PURPLE - uses Amber, Sky, Teal)
    const renderDirectionBadge = (dir: 'push' | 'pull' | 'bidirectional') => {
        if (dir === 'push') {
            return (
                <Badge variant="outline" className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30 gap-1 px-2 py-0.5">
                    <ArrowUpRight className="h-3 w-3" /> رفع للإدارة
                </Badge>
            );
        }
        if (dir === 'pull') {
            return (
                <Badge variant="outline" className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/10 border-sky-500/30 gap-1 px-2 py-0.5">
                    <ArrowDownLeft className="h-3 w-3" /> سحب للفرع
                </Badge>
            );
        }
        return (
            <Badge variant="outline" className="text-[10px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-500/10 border-teal-500/30 gap-1 px-2 py-0.5">
                <ArrowLeftRight className="h-3 w-3" /> متبادل
            </Badge>
        );
    };

    // Helper: render table sync status badge (NO PURPLE - uses Emerald, Amber, Sky, Cyan)
    const renderStatusBadge = (t: TableSyncMatrixItem) => {
        switch (t.syncState) {
            case 'synced':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        متطابق ومحدث
                    </span>
                );
            case 'pending_push':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        <ArrowUpRight className="h-3 w-3" />
                        {t.pendingPushCount.toLocaleString()} بانتظار الرفع
                    </span>
                );
            case 'pending_pull':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                        <ArrowDownLeft className="h-3 w-3" />
                        {t.pendingPullCount.toLocaleString()} سحب معلق
                    </span>
                );
            case 'pending_both':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                        <ArrowLeftRight className="h-3 w-3" />
                        رفع ({t.pendingPushCount}) وسحب ({t.pendingPullCount})
                    </span>
                );
            case 'empty':
                return (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] text-muted-foreground bg-muted/40 font-medium">
                        لا حركات (0)
                    </span>
                );
            case 'unreachable':
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-600 border border-rose-500/20">
                        السيرفر غير متصل
                    </span>
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

    // Tables with pending sync operations (Used in the Queue tab)
    const pendingTablesList = useMemo(() => {
        return (syncMatrix?.tables || []).filter(t => t.pendingPushCount > 0 || t.pendingPullCount > 0);
    }, [syncMatrix]);

    if (isLoading) {
        return (
            <div className="flex flex-col justify-center items-center py-32 gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground animate-pulse font-medium">جاري فحص حالة المزامنة ومطابقة السجلات مع الإدارة...</p>
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
                        className="gap-1.5 text-xs font-semibold h-8"
                    >
                        {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-amber-500" />}
                        فحص الاتصال
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleRefreshMatrix} 
                        disabled={isRefreshingMatrix}
                        className="gap-1.5 text-xs font-semibold h-8"
                    >
                        {isRefreshingMatrix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 text-sky-500" />}
                        تحديث الفحص
                    </Button>
                    <Button 
                        size="sm" 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 text-xs shadow-md h-8"
                        onClick={() => handleSyncNow('all')}
                        disabled={isSyncing}
                    >
                        {isSyncing && syncingMode === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <RefreshCw className="h-3.5 w-3.5 ml-1" />}
                        مزامنة شاملة الآن
                    </Button>
                </div>
            </PageHeader>

            <main className="flex flex-1 flex-col gap-5 p-4 md:p-6 max-w-7xl mx-auto w-full">
                
                {/* 2. Top Unified Executive Dashboard Banner */}
                <div className="rounded-xl border bg-card p-4 shadow-sm relative overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        {/* Branch Identity */}
                        <div className="md:col-span-4 space-y-1 md:border-l md:pl-4">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                    فرع #{config.currentBranchCode}
                                </span>
                                <span className="text-xs text-muted-foreground font-medium">محطة فرعية نشطة</span>
                            </div>
                            <h2 className="text-lg font-black text-foreground tracking-tight">
                                {config.currentBranchName}
                            </h2>
                            <p className="text-[11px] text-muted-foreground">
                                مطابقة آلية فورية لجميع الجداول عبر مفاتيح الربط ومحددات الفروع.
                            </p>
                        </div>

                        {/* Central Server Live Status */}
                        <div className="md:col-span-4 space-y-1 md:border-l md:pl-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-semibold">
                                    <Server className="h-3.5 w-3.5 text-sky-600" />
                                    سيرفر الإدارة المركزي
                                </span>
                                {testResult ? (
                                    testResult.success ? (
                                        <Badge className="bg-emerald-600 text-white text-[10px] gap-1 px-2 font-mono">
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
                                    <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
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
                        <div className="md:col-span-4 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
                                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                                    العمليات المعلقة حالياً
                                </span>
                                <Badge 
                                    className={cn(
                                        "font-mono font-black text-xs px-2.5 py-0.5",
                                        pendingBreakdown.total > 0 ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                    )}
                                >
                                    {pendingBreakdown.total > 0 ? `${pendingBreakdown.total.toLocaleString()} حركة معلقة` : '0 - متطابق كلياً'}
                                </Badge>
                            </div>

                            <div className="flex items-center justify-between text-xs pt-1 border-t">
                                <span className="text-muted-foreground">آخر مزامنة ناجحة:</span>
                                <span className="font-bold text-foreground">
                                    {config.lastSyncTime ? new Date(config.lastSyncTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'محدثة الآن'}
                                </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                                <span className="flex items-center gap-1 text-emerald-600 font-bold">
                                    <ArrowUpRight className="h-3 w-3" /> مرفوع: {config.lastPushedCount || 0}
                                </span>
                                <span className="flex items-center gap-1 text-sky-600 font-bold">
                                    <ArrowDownLeft className="h-3 w-3" /> مسحوب: {config.lastPulledCount || 0}
                                </span>
                                <span className="text-muted-foreground font-sans">
                                    المجدول: {config.autoSync ? `كل ${config.autoSyncIntervalMinutes} د` : 'يدوي'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Re-engineered Navigation Tabs */}
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 max-w-xl mx-auto h-11 bg-muted/60 p-1 rounded-xl shadow-inner border">
                        <TabsTrigger value="matrix" className="gap-2 font-bold text-xs rounded-lg data-[state=active]:shadow-sm">
                            <Database className="h-4 w-4 text-emerald-600" /> 
                            مصفوفة الجداول ({syncMatrix?.tables.length || 69})
                        </TabsTrigger>
                        <TabsTrigger value="queue" className="gap-2 font-bold text-xs rounded-lg data-[state=active]:shadow-sm">
                            <Activity className="h-4 w-4 text-amber-600" /> 
                            طابور الحركات المعلقة
                            {pendingBreakdown.total > 0 && (
                                <span className="mr-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-600 text-white font-bold">
                                    {pendingBreakdown.total}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="config" className="gap-2 font-bold text-xs rounded-lg data-[state=active]:shadow-sm">
                            <Server className="h-4 w-4 text-sky-600" /> 
                            إعدادات الربط وتأسيس القاعدة
                        </TabsTrigger>
                    </TabsList>

                    {/* ========================================================= */}
                    {/* TAB 1: MASTER SYNC MATRIX (مصفوفة الجداول والتزامن) */}
                    {/* ========================================================= */}
                    <TabsContent value="matrix" className="space-y-4 mt-4">
                        
                        {/* Matrix Control Bar */}
                        <div className="p-3 rounded-xl border bg-card shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs gap-1.5 font-medium px-2.5 py-1">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    المتطابق: <strong className="text-foreground">{syncMatrix?.syncedTablesCount || 0} من {syncMatrix?.totalTablesCount || 69} جدولاً</strong>
                                </Badge>
                                {(syncMatrix?.totalPendingPush || 0) > 0 && (
                                    <Badge className="bg-amber-600 text-white text-xs font-bold gap-1 shadow-sm px-2.5 py-1">
                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                        {syncMatrix?.totalPendingPush.toLocaleString()} حركة بالفرع بانتظار الرفع
                                    </Badge>
                                )}
                            </div>

                            {/* Direct Action Buttons */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleSyncNow('push')}
                                    disabled={isSyncing}
                                    className="gap-1.5 font-bold text-amber-700 dark:text-amber-300 text-xs h-8 border-amber-500/30 hover:bg-amber-500/10"
                                >
                                    {isSyncing && syncingMode === 'push' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                                    رفع حركات الفرع ⬆️
                                </Button>
                                <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleSyncNow('pull')}
                                    disabled={isSyncing}
                                    className="gap-1.5 font-bold text-sky-700 dark:text-sky-300 text-xs h-8 border-sky-500/30 hover:bg-sky-500/10"
                                >
                                    {isSyncing && syncingMode === 'pull' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                                    سحب من الإدارة ⬇️
                                </Button>
                                <Button 
                                    size="sm" 
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 text-xs shadow-sm h-8"
                                    onClick={() => handleSyncNow('all')}
                                    disabled={isSyncing}
                                >
                                    {isSyncing && syncingMode === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <RefreshCw className="h-3.5 w-3.5 ml-1" />}
                                    مزامنة شاملة
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
                                            مصفوفة المزامنة والطوابع الزمنية لكافة الجداول
                                        </CardTitle>
                                        <CardDescription>
                                            تتبع لحظي للطوابع الزمنية (UpdatedAt / LastSyncedAt) وحجم البيانات بالفرع والإدارة.
                                        </CardDescription>
                                    </div>

                                    {/* Quick Status Filter Pills */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <Button 
                                            size="sm" 
                                            variant={tableStatusFilter === 'all' ? 'default' : 'outline'}
                                            onClick={() => setTableStatusFilter('all')}
                                            className="h-7 text-xs px-2.5 font-medium"
                                        >
                                            الكل ({syncMatrix?.tables.length || 0})
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            variant={tableStatusFilter === 'pending' ? 'default' : 'outline'}
                                            onClick={() => setTableStatusFilter('pending')}
                                            className={cn("h-7 text-xs px-2.5 font-bold", tableStatusFilter === 'pending' && "bg-amber-600 hover:bg-amber-700 text-white")}
                                        >
                                            معلق فقط ({syncMatrix?.pendingTablesCount || 0})
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            variant={tableStatusFilter === 'synced' ? 'default' : 'outline'}
                                            onClick={() => setTableStatusFilter('synced')}
                                            className={cn("h-7 text-xs px-2.5 font-bold", tableStatusFilter === 'synced' && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                                        >
                                            متطابق ({syncMatrix?.syncedTablesCount || 0})
                                        </Button>
                                    </div>
                                </div>

                                {/* Advanced Search and Filter Bar */}
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t">
                                    <div className="sm:col-span-6 relative">
                                        <Search className="h-4 w-4 absolute right-3 top-2.5 text-muted-foreground" />
                                        <Input 
                                            placeholder="ابحث بالاسم، اسم الجدول dbo.*، أو القسم..."
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
                                    <div className="sm:col-span-3">
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
                                                <SelectItem value="push">رفع للإدارة ⬆️</SelectItem>
                                                <SelectItem value="pull">سحب للفرع ⬇️</SelectItem>
                                                <SelectItem value="bidirectional">متبادل ثنائي 🔁</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="p-0">
                                <div className="border-t max-h-[620px] overflow-auto relative">
                                    <Table>
                                        <TableHeader className="bg-muted/70 sticky top-0 z-20 shadow-xs text-xs">
                                            <TableRow className="border-b">
                                                <TableHead className="w-10 text-center font-bold">#</TableHead>
                                                <TableHead className="min-w-[190px] font-bold">اسم الجدول والقسم</TableHead>
                                                <TableHead className="text-center min-w-[100px] font-bold">الاتجاه</TableHead>
                                                <TableHead className="text-center min-w-[125px] font-bold">آخر تعديل بالفرع</TableHead>
                                                <TableHead className="text-center min-w-[125px] font-bold">آخر مزامنة للإدارة</TableHead>
                                                <TableHead className="text-center min-w-[90px] font-bold text-amber-600">معلق بالفرع</TableHead>
                                                <TableHead className="text-center min-w-[100px] font-bold text-sky-600">سطور الفرع بالإدارة</TableHead>
                                                <TableHead className="text-center min-w-[100px] font-bold text-slate-700 dark:text-slate-300">إجمالي الإدارة</TableHead>
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
                                                    <TableRow key={t.tableName} className="hover:bg-muted/40 text-xs transition-colors border-b">
                                                        <TableCell className="text-center text-muted-foreground font-mono">{idx + 1}</TableCell>
                                                        <TableCell>
                                                            <div className="font-bold text-foreground text-sm flex items-center gap-1.5">
                                                                <span>{t.displayName}</span>
                                                            </div>
                                                            <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
                                                                <Database className="h-3 w-3 text-muted-foreground/60" />
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
                                                        <TableCell className="text-center font-mono font-bold">
                                                            {t.pendingPushCount > 0 ? (
                                                                <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                                                                    {t.pendingPushCount.toLocaleString()}
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground/60 font-mono">0</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-semibold">
                                                            {t.centralBranchRows === null ? (
                                                                <span className="text-[11px] text-muted-foreground/50">-</span>
                                                            ) : (
                                                                <span className={cn(t.centralBranchRows > 0 ? "text-sky-700 dark:text-sky-400 font-bold" : "text-muted-foreground/60")}>
                                                                    {t.centralBranchRows.toLocaleString()}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-semibold">
                                                            {t.centralTotalRows === null ? (
                                                                <span className="text-[11px] text-muted-foreground/50">-</span>
                                                            ) : (
                                                                <span className={cn(t.centralTotalRows > 0 ? "text-foreground font-bold" : "text-muted-foreground/60")}>
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
                    {/* TAB 2: RE-ENGINEERED QUEUE & AUDIT LOGS (طابور الحركات المعلقة) */}
                    {/* ========================================================= */}
                    <TabsContent value="queue" className="space-y-5 mt-4">
                        
                        {/* Queue Hero Status */}
                        <div className="p-4 rounded-xl border bg-card shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "p-3 rounded-xl border",
                                    pendingBreakdown.total > 0 ? "bg-amber-500/10 border-amber-500/20 text-amber-600" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                                )}>
                                    {pendingBreakdown.total > 0 ? <AlertCircle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-foreground">
                                        {pendingBreakdown.total > 0 ? `يوجد ${pendingBreakdown.total.toLocaleString()} حركة بانتظار الرفع للإدارة` : 'طابور الحركات فارغ تماماً - جميع الحركات متزامنة'}
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {pendingBreakdown.total > 0 ? 'الحركات مسجلة محلياً في قاعدة البيانات الفرعية وتنتظر الإرسال للإدارة.' : 'كافة الفواتير والسندات والحركات المخزنية مطابقة ومسجلة في السيرفر المركزي.'}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => loadSettings(false)} 
                                    className="gap-1.5 text-xs h-8"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" /> تحديث العدادات
                                </Button>
                                <Button 
                                    size="sm" 
                                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5 text-xs h-8 shadow-sm"
                                    onClick={() => handleSyncNow('push')}
                                    disabled={isSyncing || pendingBreakdown.total === 0}
                                >
                                    {isSyncing && syncingMode === 'push' ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <ArrowUpRight className="h-3.5 w-3.5 ml-1" />}
                                    رفع كافة المعلق الآن
                                </Button>
                            </div>
                        </div>

                        {/* Interactive Queue Breakdown Cards (NO PURPLE - Pure Clean Tones) */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                pendingBreakdown.sales > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <ShoppingCart className="h-5 w-5 mx-auto text-sky-600" />
                                <div className="text-xs text-muted-foreground font-medium">فواتير مبيعات</div>
                                <div className={cn("text-xl font-black font-mono", pendingBreakdown.sales > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.sales}
                                </div>
                            </div>

                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                pendingBreakdown.salesReturns > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <Receipt className="h-5 w-5 mx-auto text-rose-500" />
                                <div className="text-xs text-muted-foreground font-medium">مرتجع مبيعات</div>
                                <div className={cn("text-xl font-black font-mono", pendingBreakdown.salesReturns > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.salesReturns}
                                </div>
                            </div>

                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                pendingBreakdown.purchases > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <Truck className="h-5 w-5 mx-auto text-amber-500" />
                                <div className="text-xs text-muted-foreground font-medium">فواتير مشتريات</div>
                                <div className={cn("text-xl font-black font-mono", pendingBreakdown.purchases > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.purchases}
                                </div>
                            </div>

                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                pendingBreakdown.purchaseReturns > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <Boxes className="h-5 w-5 mx-auto text-teal-600" />
                                <div className="text-xs text-muted-foreground font-medium">مرتجع مشتريات</div>
                                <div className={cn("text-xl font-black font-mono", pendingBreakdown.purchaseReturns > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.purchaseReturns}
                                </div>
                            </div>

                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                pendingBreakdown.customerPayments > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <Banknote className="h-5 w-5 mx-auto text-emerald-600" />
                                <div className="text-xs text-muted-foreground font-medium">سندات قبض</div>
                                <div className={cn("text-xl font-black font-mono", pendingBreakdown.customerPayments > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.customerPayments}
                                </div>
                            </div>

                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                pendingBreakdown.supplierPayments > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <CreditCard className="h-5 w-5 mx-auto text-indigo-600" />
                                <div className="text-xs text-muted-foreground font-medium">سندات صرف</div>
                                <div className={cn("text-xl font-black font-mono", pendingBreakdown.supplierPayments > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.supplierPayments}
                                </div>
                            </div>

                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                pendingBreakdown.expenses > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <Receipt className="h-5 w-5 mx-auto text-slate-600 dark:text-slate-400" />
                                <div className="text-xs text-muted-foreground font-medium">مصروفات وإيراد</div>
                                <div className={cn("text-xl font-black font-mono", pendingBreakdown.expenses > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.expenses}
                                </div>
                            </div>

                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                pendingBreakdown.stock > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <Boxes className="h-5 w-5 mx-auto text-cyan-600" />
                                <div className="text-xs text-muted-foreground font-medium">حركات مخازن</div>
                                <div className={cn("text-xl font-black font-mono", pendingBreakdown.stock > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.stock}
                                </div>
                            </div>

                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                pendingBreakdown.transfers > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <ArrowLeftRight className="h-5 w-5 mx-auto text-sky-600" />
                                <div className="text-xs text-muted-foreground font-medium">تحويلات فروع</div>
                                <div className={cn("text-xl font-black font-mono", pendingBreakdown.transfers > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.transfers}
                                </div>
                            </div>

                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                pendingBreakdown.treasury > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <Wallet className="h-5 w-5 mx-auto text-emerald-700" />
                                <div className="text-xs text-muted-foreground font-medium">حركات خزينة</div>
                                <div className={cn("text-xl font-black font-mono", pendingBreakdown.treasury > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.treasury}
                                </div>
                            </div>

                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                pendingBreakdown.rep > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <Users className="h-5 w-5 mx-auto text-amber-600" />
                                <div className="text-xs text-muted-foreground font-medium">مندوبين وتوزيع</div>
                                <div className={cn("text-xl font-black font-mono", pendingBreakdown.rep > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.rep}
                                </div>
                            </div>

                            <div className={cn(
                                "p-3 rounded-xl border text-center space-y-1 transition-all",
                                (pendingBreakdown.hr + pendingBreakdown.pos) > 0 ? "bg-amber-500/10 border-amber-500/30 shadow-xs" : "bg-card hover:bg-muted/30"
                            )}>
                                <Terminal className="h-5 w-5 mx-auto text-teal-600" />
                                <div className="text-xs text-muted-foreground font-medium">كاشير وHR</div>
                                <div className={cn("text-xl font-black font-mono", (pendingBreakdown.hr + pendingBreakdown.pos) > 0 ? "text-amber-600" : "text-foreground")}>
                                    {pendingBreakdown.hr + pendingBreakdown.pos}
                                </div>
                            </div>
                        </div>

                        {/* Detailed Table for Pending Queues (Shows only tables that currently need sync) */}
                        <Card className="border shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <ListChecks className="h-5 w-5 text-amber-600" />
                                    قائمة الجداول التي بها حركات معلقة حالياً ({pendingTablesList.length})
                                </CardTitle>
                                <CardDescription>
                                    تتيح لك هذه القائمة فحص ومزامنة الجداول المعلقة حصراً دون الحاجة للبحث في كامل الـ 69 جدولاً.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                {pendingTablesList.length === 0 ? (
                                    <div className="py-12 text-center text-muted-foreground space-y-2">
                                        <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                                        <p className="font-bold text-foreground">لا توجد أي حركات أو تعديلات معلقة بالفرع</p>
                                        <p className="text-xs text-muted-foreground">كافة الجداول الـ 69 متزامنة ومطابقة تماماً مع الإدارة.</p>
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader className="bg-muted/60 text-xs">
                                            <TableRow>
                                                <TableHead>اسم الجدول والقسم</TableHead>
                                                <TableHead className="text-center">بانتظار الرفع (فرع)</TableHead>
                                                <TableHead className="text-center">بانتظار السحب (إدارة)</TableHead>
                                                <TableHead className="text-center">آخر تعديل محلي</TableHead>
                                                <TableHead className="text-center">حالة المزامنة</TableHead>
                                                <TableHead className="text-center w-28">إجراء</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {pendingTablesList.map((t) => (
                                                <TableRow key={t.tableName} className="text-xs hover:bg-muted/30">
                                                    <TableCell>
                                                        <div className="font-bold text-foreground">{t.displayName}</div>
                                                        <div className="text-[11px] font-mono text-muted-foreground">dbo.{t.tableName} ({t.category})</div>
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono font-bold">
                                                        {t.pendingPushCount > 0 ? (
                                                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-mono font-bold">
                                                                {t.pendingPushCount.toLocaleString()}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground/60">0</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono font-bold">
                                                        {t.pendingPullCount > 0 ? (
                                                            <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-400 font-mono font-bold">
                                                                {t.pendingPullCount.toLocaleString()}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground/60">0</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {formatTimestamp(t.lastLocalModified)}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {renderStatusBadge(t)}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Button
                                                            size="sm"
                                                            variant="default"
                                                            className="h-7 px-3 text-[11px] font-bold bg-primary text-primary-foreground shadow-xs"
                                                            onClick={() => handleSyncNow(t.direction === 'pull' ? 'pull' : 'push', t.tableName)}
                                                            disabled={isSyncing && syncingTable === t.tableName}
                                                        >
                                                            {isSyncing && syncingTable === t.tableName ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                'مزامنة فورية'
                                                            )}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>

                        {/* Recent Sync Activity Log */}
                        <Card className="border shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-muted-foreground" />
                                    سجل عمليات المزامنة اللحظي (Sync Activity Log)
                                </CardTitle>
                                <CardDescription>تاريخ تفصيلي لعمليات الرفع والسحب التي تمت بين هذا الفرع والخادم المركزي.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="border-t">
                                    <Table>
                                        <TableHeader className="bg-muted/50 text-xs">
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
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                                    ناجحة ✅
                                                                </span>
                                                            ) : log.status === 'failed' ? (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                                                    فشلت ❌
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">
                                                                    جاهز
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold text-emerald-600">
                                                            +{log.pushed || 0}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-bold text-sky-600">
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

                    {/* ========================================================= */}
                    {/* TAB 3: CONNECTION & DATABASE PROVISIONING (إعدادات الربط وتأسيس القاعدة) */}
                    {/* ========================================================= */}
                    <TabsContent value="config" className="space-y-5 mt-4">
                        
                        {/* Settings & Configuration Card */}
                        <Card className="border shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Server className="h-5 w-5 text-sky-600" />
                                    إعدادات الربط السحابي وبيانات الخادم المركزي
                                </CardTitle>
                                <CardDescription>
                                    تحديد عنوان السيرفر المركزي للإدارة وربط هوية هذا الجهاز بالفرع والمستودع المسجل.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                
                                {/* Section 1: Local Branch Identity */}
                                <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
                                    <div className="flex items-center gap-2 border-b pb-2">
                                        <Database className="h-4 w-4 text-primary" />
                                        <span className="font-bold text-sm">1. هوية وبيانات الفرع المحلي (Local Branch Identity)</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">ربط بمستودع / فرع مسجل</Label>
                                            <Select value={config.currentBranchId} onValueChange={handleWarehouseChange}>
                                                <SelectTrigger className="h-9 text-xs">
                                                    <SelectValue placeholder="اختر الفرع أو المستودع" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {warehouses.map((w: any) => (
                                                        <SelectItem key={w.id} value={w.id}>
                                                            {w.name} ({w.code || 'بدون كود'})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">كود الفرع (BranchCode)</Label>
                                            <Input 
                                                value={config.currentBranchCode} 
                                                onChange={(e) => handleInputChange('currentBranchCode', e.target.value)}
                                                className="h-9 text-xs font-mono font-bold"
                                                placeholder="900"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">اسم الفرع (BranchName)</Label>
                                            <Input 
                                                value={config.currentBranchName} 
                                                onChange={(e) => handleInputChange('currentBranchName', e.target.value)}
                                                className="h-9 text-xs font-bold"
                                                placeholder="الفرع الرئيسي"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Central SQL Server Credentials */}
                                <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
                                    <div className="flex items-center gap-2 border-b pb-2">
                                        <Server className="h-4 w-4 text-sky-600" />
                                        <span className="font-bold text-sm">2. خادم قاعدة بيانات الإدارة (Central SQL Server)</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">عنوان السيرفر (IP أو اسم الجهاز)</Label>
                                            <Input 
                                                value={config.centralServerIp} 
                                                onChange={(e) => handleInputChange('centralServerIp', e.target.value)}
                                                className="h-9 text-xs font-mono font-semibold"
                                                placeholder="10.110.16.16"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">رقم المنفذ (Port)</Label>
                                            <Input 
                                                type="number"
                                                value={config.centralSqlPort} 
                                                onChange={(e) => handleInputChange('centralSqlPort', parseInt(e.target.value) || 1433)}
                                                className="h-9 text-xs font-mono"
                                                placeholder="1433"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">اسم قاعدة البيانات المركزية</Label>
                                            <Input 
                                                value={config.centralDatabase} 
                                                onChange={(e) => handleInputChange('centralDatabase', e.target.value)}
                                                className="h-9 text-xs font-mono font-bold text-foreground"
                                                placeholder="MultiBranchPOS_Central_DB"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">اسم مستخدم SQL</Label>
                                            <Input 
                                                value={config.centralUsername} 
                                                onChange={(e) => handleInputChange('centralUsername', e.target.value)}
                                                className="h-9 text-xs font-mono"
                                                placeholder="gmlogins"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">كلمة المرور</Label>
                                            <Input 
                                                type="password"
                                                value={config.centralPassword} 
                                                onChange={(e) => handleInputChange('centralPassword', e.target.value)}
                                                className="h-9 text-xs font-mono"
                                                placeholder="••••••••"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">المزامنة التلقائية الخلفية</Label>
                                            <div className="flex items-center justify-between p-2 rounded-lg border bg-background h-9">
                                                <span className="text-xs text-muted-foreground font-medium">تشغيل المزامنة الدورية</span>
                                                <Switch 
                                                    checked={config.autoSync} 
                                                    onCheckedChange={(checked) => handleInputChange('autoSync', checked)} 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-muted/20 border-t flex justify-between items-center py-3">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={handleTestConnection}
                                    disabled={isTesting}
                                    className="gap-1.5 text-xs font-semibold h-8"
                                >
                                    {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-amber-500" />}
                                    فحص صحة الاتصال
                                </Button>
                                <Button 
                                    size="sm" 
                                    onClick={handleSave} 
                                    disabled={isSaving}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-1.5 text-xs h-8 shadow-sm"
                                >
                                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    حفظ الإعدادات
                                </Button>
                            </CardFooter>
                        </Card>

                        {/* Database Initialization & Provisioning Card */}
                        <Card className="border border-sky-500/20 bg-sky-500/5 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-sky-600" />
                                    تأسيس وبناء قاعدة البيانات المركزية ومطابقة الجداول (71 جدولاً)
                                </CardTitle>
                                <CardDescription>
                                    في حال كان السيرفر المركزي فارغاً أو قاعدة البيانات جديدة، يقوم هذا الزر بإنشاء كافة الجداول وتأسيس العلاقات ومفاتيح الربط آلياً.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {initDbResult && (
                                    <div className={cn(
                                        "p-3 rounded-lg border text-xs font-medium space-y-1",
                                        initDbResult.success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 border-destructive/30 text-destructive"
                                    )}>
                                        <div className="font-bold flex items-center gap-1.5">
                                            {initDbResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                            {initDbResult.message}
                                        </div>
                                        {initDbResult.tablesCount && (
                                            <div>عدد الجداول التي تم بناؤها بنجاح: {initDbResult.tablesCount} جدولاً.</div>
                                        )}
                                        {initDbResult.error && (
                                            <div className="font-mono text-[11px]">{initDbResult.error}</div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="border-t pt-3 flex justify-end">
                                <Button 
                                    size="sm" 
                                    className="bg-sky-600 hover:bg-sky-700 text-white font-bold gap-1.5 text-xs shadow-sm h-8"
                                    onClick={handleInitializeDatabase}
                                    disabled={isInitializingDb || !config.centralDatabase.trim()}
                                >
                                    {isInitializingDb ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" />
                                            جاري تأسيس وبناء الجداول...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-3.5 w-3.5 ml-1" />
                                            تأسيس وبناء قاعدة البيانات الآن (71 جدولاً)
                                        </>
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
