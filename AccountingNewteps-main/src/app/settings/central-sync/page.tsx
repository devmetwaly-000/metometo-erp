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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/data-provider";
import { 
    Server, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, 
    Database, ArrowUpRight, ArrowDownLeft, Clock, Zap, Loader2, Save,
    ShoppingCart, Truck, Banknote, CreditCard, Receipt, Boxes, Activity, Sparkles,
    ArrowLeftRight, Wallet, Users, UserCheck, Terminal, Search, CheckCircle,
    HardDrive, Cpu, AlertCircle, FileText, CheckCheck, X, ListChecks, ShieldAlert,
    Lock, Key, Building2, Store, Shield, SlidersHorizontal, RotateCcw, PauseCircle, PlayCircle, Filter, ArrowUp, ArrowDown
} from "lucide-react";
import { CentralSyncConfig, TableSyncMatrixItem, TablesSyncMatrixResponse, SyncDirection } from '@/lib/central-sync';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function CentralSyncSettingsPage() {
    const { toast } = useToast();
    const { warehouses } = useData();

    // 1. Settings State
    const [config, setConfig] = useState<CentralSyncConfig>({
        systemRole: 'branch',
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

    // Active Tab: 'matrix' | 'directions' | 'queue' | 'config'
    const [activeTab, setActiveTab] = useState<'matrix' | 'directions' | 'queue' | 'config'>('matrix');

    // Matrix Filters State
    const [syncMatrix, setSyncMatrix] = useState<TablesSyncMatrixResponse | null>(null);
    const [isRefreshingMatrix, setIsRefreshingMatrix] = useState(false);
    const [tableSearch, setTableSearch] = useState('');
    const [tableCategoryFilter, setTableCategoryFilter] = useState('all');
    const [tableDirectionFilter, setTableDirectionFilter] = useState<'all' | 'push' | 'pull' | 'bidirectional' | 'disabled'>('all');
    const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'pending' | 'synced' | 'has_data'>('all');

    // Directions Tab Filters & State
    const [dirSearch, setDirSearch] = useState('');
    const [dirCategoryFilter, setDirCategoryFilter] = useState('all');
    const [dirTypeFilter, setDirTypeFilter] = useState<'all' | 'push' | 'pull' | 'bidirectional' | 'disabled'>('all');
    const [updatingDirTable, setUpdatingDirTable] = useState<string | null>(null);
    const [isResettingDirs, setIsResettingDirs] = useState(false);
    const [bulkCategoryDir, setBulkCategoryDir] = useState<string>('push');
    const [isApplyingBulkDir, setIsApplyingBulkDir] = useState(false);

    // Role Switch Security Modal State
    const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
    const [targetRoleToSwitch, setTargetRoleToSwitch] = useState<'branch' | 'central'>('central');
    const [rolePassword, setRolePassword] = useState('');
    const [isSwitchingRole, setIsSwitchingRole] = useState(false);
    const [roleSwitchError, setRoleSwitchError] = useState<string | null>(null);

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

    // Open Role Switch Dialog with Password Check
    const handleOpenRoleDialog = (role: 'branch' | 'central') => {
        if (config.systemRole === role) return;
        setTargetRoleToSwitch(role);
        setRolePassword('');
        setRoleSwitchError(null);
        setIsRoleDialogOpen(true);
    };

    // Confirm Switch Role with Server-side Authentication & Database Save
    const handleConfirmSwitchRole = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!rolePassword.trim()) {
            setRoleSwitchError('يرجى إدخال كلمة مرور المسؤول للمتابعة.');
            return;
        }
        setIsSwitchingRole(true);
        setRoleSwitchError(null);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'switch-role',
                    targetRole: targetRoleToSwitch,
                    password: rolePassword.trim()
                })
            });
            const data = await res.json();
            if (data.success) {
                setConfig(prev => ({ ...prev, systemRole: targetRoleToSwitch }));
                setIsRoleDialogOpen(false);
                toast({
                    title: "تم تغيير دور النظام بنجاح!",
                    description: data.message
                });
                await loadSettings(false);
                await handleRefreshMatrix();
            } else {
                setRoleSwitchError(data.error || 'فشل التحقق من كلمة المرور.');
            }
        } catch (err: any) {
            setRoleSwitchError(err.message || 'حدث خطأ أثناء الاتصال بالخادم.');
        } finally {
            setIsSwitchingRole(false);
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

    // Helper: render sync direction badge (NO PURPLE - uses Amber, Sky, Teal, Rose)
    const renderDirectionBadge = (dir: SyncDirection) => {
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
        if (dir === 'bidirectional') {
            return (
                <Badge variant="outline" className="text-[10px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-500/10 border-teal-500/30 gap-1 px-2 py-0.5">
                    <ArrowLeftRight className="h-3 w-3" /> متبادل
                </Badge>
            );
        }
        return (
            <Badge variant="outline" className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/30 gap-1 px-2 py-0.5">
                <PauseCircle className="h-3 w-3" /> إيقاف المزامنة
            </Badge>
        );
    };

    // Helper: Direction operational impact
    const getDirectionImpactText = (dir: SyncDirection) => {
        switch (dir) {
            case 'push':
                return {
                    title: 'رفع للإدارة فقط (Push)',
                    desc: 'الفرع يرسل حركاته وسجلاته للإدارة المركزية ولا يستقبل تعديلات من السيرفر المركزي.',
                    color: 'text-amber-700 dark:text-amber-400',
                    border: 'border-amber-500/25',
                    bg: 'bg-amber-500/5'
                };
            case 'pull':
                return {
                    title: 'سحب من الإدارة فقط (Pull)',
                    desc: 'الفرع يستقبل التحديثات الصادرة من المركز ولا يقوم برفع أي تعديلات مسجلة بالفرع.',
                    color: 'text-sky-700 dark:text-sky-400',
                    border: 'border-sky-500/25',
                    bg: 'bg-sky-500/5'
                };
            case 'bidirectional':
                return {
                    title: 'مزامنة تبادلية كاملة (Bidirectional)',
                    desc: 'مزامنة ثنائية: أي حركة أو تعديل بالفرع يُرفع للإدارة وأي تعديل بالمركز يُسحب للفرع.',
                    color: 'text-teal-700 dark:text-teal-400',
                    border: 'border-teal-500/25',
                    bg: 'bg-teal-500/5'
                };
            case 'disabled':
                return {
                    title: 'مزامنة موقوفة تماماً (Disabled)',
                    desc: 'الجدول مستثنى تماماً من دورات المزامنة؛ لن يتم رفع أو سحب أي سجل منه نهائياً.',
                    color: 'text-rose-700 dark:text-rose-400',
                    border: 'border-rose-500/25',
                    bg: 'bg-rose-500/5'
                };
        }
    };

    // Update direction of a single table in DB
    const handleUpdateTableDirection = async (tableName: string, newDir: SyncDirection) => {
        setUpdatingDirTable(tableName);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-direction',
                    tableName,
                    direction: newDir
                })
            });
            const data = await res.json();
            if (data.success) {
                toast({
                    title: "تم حفظ اتجاه المزامنة بنجاح",
                    description: `تم تعيين اتجاه جدول "${tableName}" إلى "${newDir}".`
                });
                setSyncMatrix(prev => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        tables: prev.tables.map(t => t.tableName === tableName ? { ...t, direction: newDir } : t)
                    };
                });
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            toast({
                title: "فشل حفظ اتجاه المزامنة",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setUpdatingDirTable(null);
        }
    };

    // Bulk apply direction to all tables in the selected category
    const handleApplyBulkCategoryDir = async () => {
        if (!dirCategoryFilter || dirCategoryFilter === 'all') {
            toast({
                title: "يرجى اختيار قسم محدد",
                description: "اختر القسم المراد تطبيق الاتجاه عليه جماعياً من قائمة الفلترة أولاً.",
                variant: "destructive"
            });
            return;
        }
        setIsApplyingBulkDir(true);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-directions-bulk',
                    category: dirCategoryFilter,
                    direction: bulkCategoryDir
                })
            });
            const data = await res.json();
            if (data.success) {
                toast({
                    title: "تم التطبيق الجماعي بنجاح",
                    description: data.message
                });
                await handleRefreshMatrix();
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            toast({
                title: "خطأ في التطبيق الجماعي",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setIsApplyingBulkDir(false);
        }
    };

    // Reset directions to recommended standard configuration
    const handleResetDirections = async () => {
        if (!confirm('هل تريد فعلاً استعادة اتجاهات المزامنة القياسية الموصى بها لكافة الجداول الـ 69؟')) {
            return;
        }
        setIsResettingDirs(true);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reset-directions' })
            });
            const data = await res.json();
            if (data.success) {
                toast({
                    title: "تمت استعادة الاتجاهات القياسية",
                    description: data.message
                });
                await handleRefreshMatrix();
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            toast({
                title: "خطأ في استعادة الاتجاهات",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setIsResettingDirs(false);
        }
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

    // Filter and search logic for Directions Tab
    const filteredDirectionsTables = useMemo(() => {
        return (syncMatrix?.tables || []).filter(t => {
            const matchesSearch = !dirSearch || 
                t.displayName.toLowerCase().includes(dirSearch.toLowerCase()) ||
                t.tableName.toLowerCase().includes(dirSearch.toLowerCase()) ||
                (t.description && t.description.toLowerCase().includes(dirSearch.toLowerCase())) ||
                (t.dataScope && t.dataScope.toLowerCase().includes(dirSearch.toLowerCase())) ||
                t.category.toLowerCase().includes(dirSearch.toLowerCase());
            
            if (!matchesSearch) return false;

            if (dirCategoryFilter !== 'all' && t.category !== dirCategoryFilter) {
                return false;
            }

            if (dirTypeFilter !== 'all' && t.direction !== dirTypeFilter) {
                return false;
            }

            return true;
        });
    }, [syncMatrix, dirSearch, dirCategoryFilter, dirTypeFilter]);

    // Statistics counts for sync directions
    const dirStats = useMemo(() => {
        const list = syncMatrix?.tables || [];
        let push = 0, pull = 0, bidirectional = 0, disabled = 0;
        for (const t of list) {
            if (t.direction === 'push') push++;
            else if (t.direction === 'pull') pull++;
            else if (t.direction === 'bidirectional') bidirectional++;
            else if (t.direction === 'disabled') disabled++;
        }
        return { total: list.length, push, pull, bidirectional, disabled };
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
                
                {/* 2. Top Unified Executive Dashboard Banner with System Role Indicator */}
                <div className="rounded-xl border bg-card p-4 shadow-sm relative overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        {/* System Role & Identity */}
                        <div className="md:col-span-4 space-y-1 md:border-l md:pl-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                {config.systemRole === 'central' ? (
                                    <Badge className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-2.5 py-0.5 text-xs gap-1.5 shadow-sm">
                                        <Building2 className="h-3.5 w-3.5" />
                                        إدارة مركزية (Central HQ)
                                    </Badge>
                                ) : (
                                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-0.5 text-xs gap-1.5 shadow-sm">
                                        <Store className="h-3.5 w-3.5" />
                                        فرع محلي #{config.currentBranchCode}
                                    </Badge>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenRoleDialog(config.systemRole === 'central' ? 'branch' : 'central')}
                                    className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground font-semibold gap-1 border border-border/60 hover:bg-muted"
                                    title="تغيير دور النظام بباسورد الإدارة"
                                >
                                    <Lock className="h-3 w-3 text-amber-500" />
                                    تبديل الدور 🔒
                                </Button>
                            </div>
                            <h2 className="text-lg font-black text-foreground tracking-tight">
                                {config.systemRole === 'central' ? 'المركز الرئيسي للإدارة' : config.currentBranchName}
                            </h2>
                            <p className="text-[11px] text-muted-foreground">
                                {config.systemRole === 'central' 
                                    ? 'خادم مركزي مجمّع: يستقبل ويطابق حركات ومبيعات كافة الفروع.'
                                    : 'محطة فرعية: تُسجل الفواتير محلياً وتُزامن الحركات مع سيرفر الإدارة.'}
                            </p>
                        </div>

                        {/* Central Server Live Status */}
                        <div className="md:col-span-4 space-y-1 md:border-l md:pl-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-semibold">
                                    <Server className="h-3.5 w-3.5 text-sky-600" />
                                    {config.systemRole === 'central' ? 'سيرفر الإدارة المحلي' : 'سيرفر الإدارة المركزي'}
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
                    <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 max-w-3xl mx-auto h-auto md:h-11 bg-muted/60 p-1 rounded-xl shadow-inner border gap-1">
                        <TabsTrigger value="matrix" className="gap-2 font-bold text-xs rounded-lg data-[state=active]:shadow-sm py-2 md:py-1.5">
                            <Database className="h-4 w-4 text-emerald-600" /> 
                            مصفوفة الجداول ({syncMatrix?.tables.length || 69})
                        </TabsTrigger>
                        <TabsTrigger value="directions" className="gap-2 font-bold text-xs rounded-lg data-[state=active]:shadow-sm py-2 md:py-1.5">
                            <SlidersHorizontal className="h-4 w-4 text-teal-600" />
                            اتجاهات المزامنة 🎛️
                            {dirStats.disabled > 0 && (
                                <span className="mr-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-600 text-white font-bold">
                                    {dirStats.disabled} معطل
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="queue" className="gap-2 font-bold text-xs rounded-lg data-[state=active]:shadow-sm py-2 md:py-1.5">
                            <Activity className="h-4 w-4 text-amber-600" /> 
                            طابور الحركات
                            {pendingBreakdown.total > 0 && (
                                <span className="mr-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-600 text-white font-bold">
                                    {pendingBreakdown.total}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="config" className="gap-2 font-bold text-xs rounded-lg data-[state=active]:shadow-sm py-2 md:py-1.5">
                            <Server className="h-4 w-4 text-sky-600" /> 
                            إعدادات الربط والنظام
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
                                                <SelectItem value="disabled">معطل ومستثنى ⏸️</SelectItem>
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
                    {/* TAB 2: SYNC DIRECTIONS CONTROL PANEL (التحكم في اتجاهات المزامنة) */}
                    {/* ========================================================= */}
                    <TabsContent value="directions" className="space-y-5 mt-4">
                        
                        {/* 1. Header Overview & Operational Concept Banner */}
                        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-base font-black text-foreground flex items-center gap-2">
                                        <SlidersHorizontal className="h-5 w-5 text-teal-600" />
                                        لوحة التحكم في اتجاهات وسلوك مزامنة الجداول
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        حدد وجهة تدفق البيانات لكل جدول بين الفرع المحلي والإدارة المركزية. كافة دورات المزامنة المجدولة واليدوية تلتزم بالاتجاهات المحددة هنا والمخزنة في قاعدة البيانات.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleResetDirections}
                                        disabled={isResettingDirs}
                                        className="h-8 text-xs font-semibold gap-1.5 border-border hover:bg-muted"
                                        title="إرجاع جميع الجداول للوضع القياسي المعتمد"
                                    >
                                        {isResettingDirs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />}
                                        استعادة التوزيع القياسي الموصى به
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleRefreshMatrix}
                                        disabled={isRefreshingMatrix}
                                        className="h-8 text-xs font-semibold gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                                    >
                                        {isRefreshingMatrix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                        تحديث الفحص
                                    </Button>
                                </div>
                            </div>

                            {/* 2. 5 Direction Metric Summary Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2 border-t">
                                <div className="rounded-lg border bg-muted/30 p-2.5 text-center">
                                    <span className="text-[11px] font-semibold text-muted-foreground block">إجمالي الجداول</span>
                                    <span className="text-xl font-black text-foreground font-mono">{dirStats.total}</span>
                                    <span className="text-[10px] text-muted-foreground/80 block mt-0.5">جدول نظام متكامل</span>
                                </div>

                                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 text-center">
                                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1">
                                        <ArrowUpRight className="h-3 w-3" /> رفع للإدارة فقط
                                    </span>
                                    <span className="text-xl font-black text-amber-700 dark:text-amber-400 font-mono">{dirStats.push}</span>
                                    <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 block mt-0.5">فواتير وسندات وحركات</span>
                                </div>

                                <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-2.5 text-center">
                                    <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 flex items-center justify-center gap-1">
                                        <ArrowDownLeft className="h-3 w-3" /> سحب للفرع فقط
                                    </span>
                                    <span className="text-xl font-black text-sky-700 dark:text-sky-400 font-mono">{dirStats.pull}</span>
                                    <span className="text-[10px] text-sky-700/80 dark:text-sky-400/80 block mt-0.5">تحديثات مركزية</span>
                                </div>

                                <div className="rounded-lg border border-teal-500/25 bg-teal-500/5 p-2.5 text-center">
                                    <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 flex items-center justify-center gap-1">
                                        <ArrowLeftRight className="h-3 w-3" /> تبادلي ثنائي
                                    </span>
                                    <span className="text-xl font-black text-teal-700 dark:text-teal-400 font-mono">{dirStats.bidirectional}</span>
                                    <span className="text-[10px] text-teal-700/80 dark:text-teal-400/80 block mt-0.5">أصناف، عملاء، أسعار</span>
                                </div>

                                <div className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-2.5 text-center">
                                    <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 flex items-center justify-center gap-1">
                                        <PauseCircle className="h-3 w-3" /> موقوفة ومعطلة
                                    </span>
                                    <span className="text-xl font-black text-rose-700 dark:text-rose-400 font-mono">{dirStats.disabled}</span>
                                    <span className="text-[10px] text-rose-700/80 dark:text-rose-400/80 block mt-0.5">مستثناة من المزامنة</span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Bulk Category Management Card */}
                        <div className="rounded-xl border bg-card p-4 shadow-sm">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="space-y-0.5">
                                    <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                                        <Zap className="h-4 w-4 text-amber-500" />
                                        إجراء تطبيق جماعي على قسم كامل
                                    </h4>
                                    <p className="text-[11px] text-muted-foreground">
                                        اختر قسماً وقم بتطبيق اتجاه مزامنة موحد لكافة الجداول التابعة له بضغطة زر واحدة وحفظها في قاعدة البيانات.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Select value={dirCategoryFilter} onValueChange={setDirCategoryFilter}>
                                        <SelectTrigger className="w-[180px] h-8 text-xs font-semibold">
                                            <SelectValue placeholder="اختر القسم" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">-- حدد قسماً للتطبيق --</SelectItem>
                                            <SelectItem value="فواتير وعمليات">فواتير وعمليات (5 جداول)</SelectItem>
                                            <SelectItem value="مشتريات وموردين">مشتريات وموردين (7 جداول)</SelectItem>
                                            <SelectItem value="عملاء ومبيعات">عملاء ومبيعات (3 جداول)</SelectItem>
                                            <SelectItem value="حسابات ومالية">حسابات ومالية (8 جداول)</SelectItem>
                                            <SelectItem value="مخازن وأصناف">مخازن وأصناف (20 جدولاً)</SelectItem>
                                            <SelectItem value="توزيع ومندوبين">توزيع ومندوبين (5 جداول)</SelectItem>
                                            <SelectItem value="موارد بشرية">موارد بشرية (6 جداول)</SelectItem>
                                            <SelectItem value="نقاط البيع">نقاط البيع (5 جداول)</SelectItem>
                                            <SelectItem value="أصول وإهلاك">أصول وإهلاك (2 جدول)</SelectItem>
                                            <SelectItem value="إعدادات النظام">إعدادات النظام (8 جداول)</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select value={bulkCategoryDir} onValueChange={setBulkCategoryDir}>
                                        <SelectTrigger className="w-[160px] h-8 text-xs font-semibold">
                                            <SelectValue placeholder="الاتجاه المطلوب" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="push">⬆️ رفع للإدارة فقط</SelectItem>
                                            <SelectItem value="pull">⬇️ سحب للفرع فقط</SelectItem>
                                            <SelectItem value="bidirectional">🔁 تبادلي متزامن</SelectItem>
                                            <SelectItem value="disabled">⏸️ إيقاف المزامنة</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Button
                                        size="sm"
                                        onClick={handleApplyBulkCategoryDir}
                                        disabled={isApplyingBulkDir || dirCategoryFilter === 'all'}
                                        className="h-8 text-xs font-bold bg-foreground text-background hover:bg-foreground/90 gap-1.5"
                                    >
                                        {isApplyingBulkDir ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                                        تطبيق على القسم
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* 4. Table Controls: Search & Direction Filter */}
                        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                            <div className="p-3 bg-muted/20 border-b flex flex-col md:flex-row items-center justify-between gap-3">
                                <div className="flex items-center gap-2 w-full md:w-auto flex-1">
                                    <div className="relative flex-1 max-w-md">
                                        <Search className="h-4 w-4 absolute right-3 top-2.5 text-muted-foreground" />
                                        <Input
                                            placeholder="ابحث باسم الجدول العربي أو التقني dbo.* أو نوع البيانات..."
                                            value={dirSearch}
                                            onChange={(e) => setDirSearch(e.target.value)}
                                            className="pr-9 h-9 text-xs"
                                        />
                                        {dirSearch && (
                                            <button 
                                                onClick={() => setDirSearch('')} 
                                                className="absolute left-3 top-2.5 text-muted-foreground hover:text-foreground"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                    <Select value={dirTypeFilter} onValueChange={(val: any) => setDirTypeFilter(val)}>
                                        <SelectTrigger className="w-[150px] h-9 text-xs font-semibold">
                                            <SelectValue placeholder="تصفية بالاتجاه" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">كافة الاتجاهات ({dirStats.total})</SelectItem>
                                            <SelectItem value="push">⬆️ رفع فقط ({dirStats.push})</SelectItem>
                                            <SelectItem value="pull">⬇️ سحب فقط ({dirStats.pull})</SelectItem>
                                            <SelectItem value="bidirectional">🔁 تبادلي ({dirStats.bidirectional})</SelectItem>
                                            <SelectItem value="disabled">⏸️ معطل ({dirStats.disabled})</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="text-xs text-muted-foreground font-semibold">
                                    عرض <strong className="text-foreground">{filteredDirectionsTables.length}</strong> من <strong className="text-foreground">{dirStats.total}</strong> جدولاً
                                </div>
                            </div>

                            {/* 5. Master Directions Interactive Table */}
                            <div className="max-h-[650px] overflow-auto">
                                <Table>
                                    <TableHeader className="bg-muted/40 sticky top-0 z-10 shadow-xs">
                                        <TableRow className="border-b">
                                            <TableHead className="w-[45px] text-center font-bold text-xs">#</TableHead>
                                            <TableHead className="w-[240px] text-right font-bold text-xs">اسم الجدول والتعريف</TableHead>
                                            <TableHead className="w-[300px] text-right font-bold text-xs">نوع ومحتوى البيانات بداخل الجدول</TableHead>
                                            <TableHead className="w-[200px] text-center font-bold text-xs">تحديد اتجاه المزامنة</TableHead>
                                            <TableHead className="text-right font-bold text-xs">الأثر التشغيلي للمزامنة</TableHead>
                                            <TableHead className="w-[100px] text-center font-bold text-xs">إجراء فوري</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredDirectionsTables.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-16 text-muted-foreground text-xs">
                                                    <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                                                    لا توجد جداول مطابقة للبحث أو الفلتر المحدد.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredDirectionsTables.map((t, idx) => {
                                                const impact = getDirectionImpactText(t.direction);
                                                const isUpdating = updatingDirTable === t.tableName;

                                                return (
                                                    <TableRow 
                                                        key={t.tableName} 
                                                        className={cn(
                                                            "hover:bg-muted/40 text-xs transition-colors border-b",
                                                            t.direction === 'disabled' && "bg-rose-500/[0.02] opacity-80"
                                                        )}
                                                    >
                                                        {/* 1. Index */}
                                                        <TableCell className="text-center font-mono text-muted-foreground font-semibold">
                                                            {idx + 1}
                                                        </TableCell>

                                                        {/* 2. Table Name & Identity */}
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

                                                        {/* 3. Data Type & Description */}
                                                        <TableCell>
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <Badge 
                                                                    variant="outline" 
                                                                    className="text-[10px] font-semibold bg-primary/5 text-primary border-primary/20 px-2 py-0.5"
                                                                >
                                                                    {t.dataScope || 'بيانات عامة'}
                                                                </Badge>
                                                                {t.localBranchRows > 0 && (
                                                                    <span className="text-[10px] text-muted-foreground font-mono">
                                                                        ({t.localBranchRows.toLocaleString()} سجل بالفرع)
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                                {t.description || 'جدول تشغيلي لحفظ وتوثيق بيانات ومعاملات النظام.'}
                                                            </p>
                                                        </TableCell>

                                                        {/* 4. Direction Selector (Saves directly to DB) */}
                                                        <TableCell className="text-center">
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                {isUpdating ? (
                                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                                                                        <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                                                                        <span>جاري الحفظ...</span>
                                                                    </div>
                                                                ) : (
                                                                    <Select
                                                                        value={t.direction}
                                                                        onValueChange={(newVal: SyncDirection) => handleUpdateTableDirection(t.tableName, newVal)}
                                                                    >
                                                                        <SelectTrigger className={cn(
                                                                            "h-8 text-xs font-bold w-[165px] border shadow-xs transition-colors",
                                                                            t.direction === 'push' && "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                                                                            t.direction === 'pull' && "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
                                                                            t.direction === 'bidirectional' && "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
                                                                            t.direction === 'disabled' && "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                                                                        )}>
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="push" className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                                                                    <span>⬆️ رفع للإدارة (Push)</span>
                                                                                </div>
                                                                            </SelectItem>
                                                                            <SelectItem value="pull" className="text-xs font-bold text-sky-700 dark:text-sky-300">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <ArrowDownLeft className="h-3.5 w-3.5" />
                                                                                    <span>⬇️ سحب للفرع (Pull)</span>
                                                                                </div>
                                                                            </SelectItem>
                                                                            <SelectItem value="bidirectional" className="text-xs font-bold text-teal-700 dark:text-teal-300">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <ArrowLeftRight className="h-3.5 w-3.5" />
                                                                                    <span>🔁 تبادلي (Bidirectional)</span>
                                                                                </div>
                                                                            </SelectItem>
                                                                            <SelectItem value="disabled" className="text-xs font-bold text-rose-700 dark:text-rose-400">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <PauseCircle className="h-3.5 w-3.5" />
                                                                                    <span>⏸️ إيقاف المزامنة (Disabled)</span>
                                                                                </div>
                                                                            </SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                )}
                                                            </div>
                                                        </TableCell>

                                                        {/* 5. Operational Impact Card */}
                                                        <TableCell>
                                                            <div className={cn(
                                                                "p-2 rounded-lg border text-[11px] leading-relaxed transition-all",
                                                                impact.bg, impact.border
                                                            )}>
                                                                <strong className={cn("font-bold block mb-0.5", impact.color)}>
                                                                    {impact.title}
                                                                </strong>
                                                                <span className="text-muted-foreground text-[10.5px]">
                                                                    {impact.desc}
                                                                </span>
                                                            </div>
                                                        </TableCell>

                                                        {/* 6. Single Sync Action */}
                                                        <TableCell className="text-center">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className={cn(
                                                                    "h-7 px-2.5 text-[11px] font-bold shadow-xs transition-colors",
                                                                    t.direction === 'disabled' && "opacity-40 cursor-not-allowed"
                                                                )}
                                                                onClick={() => handleSyncNow(t.direction === 'pull' ? 'pull' : 'push', t.tableName)}
                                                                disabled={t.direction === 'disabled' || (isSyncing && syncingTable === t.tableName)}
                                                                title={t.direction === 'disabled' ? "الجدول معطل من المزامنة" : `مزامنة جدول ${t.displayName} فوراً`}
                                                            >
                                                                {isSyncing && syncingTable === t.tableName ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <RefreshCw className="h-3 w-3 ml-1 text-teal-600" />
                                                                        مزامنة
                                                                    </>
                                                                )}
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </TabsContent>
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
                                <CreditCard className="h-5 w-5 mx-auto text-blue-600" />
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
                    {/* TAB 3: CONNECTION & DATABASE PROVISIONING (إعدادات الربط ونمط النظام) */}
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
                                    تحديد دور النظام في قاعدة البيانات (إدارة أو فرع) وضبط بيانات السيرفر المركزي.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                
                                {/* Section 0: System Role Selection Protected by Password */}
                                <div className="p-4 rounded-xl border-2 border-primary/20 bg-primary/5 space-y-3">
                                    <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                                        <div className="flex items-center gap-2">
                                            <ShieldCheck className="h-5 w-5 text-primary" />
                                            <div>
                                                <span className="font-black text-sm text-foreground">دور ونمط تشغيل هذا الجهاز (System Role Mode)</span>
                                                <span className="text-[11px] text-muted-foreground block">إعداد أمني مُخزّن في قاعدة البيانات، يتطلب كلمة مرور المسؤول للتبديل بين الإدارة والفرع.</span>
                                            </div>
                                        </div>
                                        <Badge variant="outline" className="text-xs font-mono font-bold px-2.5 py-0.5 bg-background border-primary/30">
                                            الحالي: {config.systemRole === 'central' ? '🏢 إدارة مركزية' : '🏪 فرع محلي'}
                                        </Badge>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                        {/* Branch Option Card */}
                                        <div 
                                            onClick={() => handleOpenRoleDialog('branch')}
                                            className={cn(
                                                "p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 relative",
                                                config.systemRole !== 'central' 
                                                    ? "border-emerald-600 bg-emerald-500/10 shadow-xs" 
                                                    : "border-border/70 hover:border-emerald-500/50 bg-card hover:bg-muted/20"
                                            )}
                                        >
                                            <div className={cn(
                                                "p-2.5 rounded-lg shrink-0",
                                                config.systemRole !== 'central' ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                                            )}>
                                                <Store className="h-5 w-5" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-sm text-foreground">1. فرع محلي (Sub-Branch Mode)</span>
                                                    {config.systemRole !== 'central' && (
                                                        <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 font-bold">نشط</Badge>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                    يعمل النظام ككاشير أو نقطة بيع أو مستودع فرعي، يُسجل حركاته بكود الفرع ويرفعها لسيرفر الإدارة.
                                                </p>
                                            </div>
                                            {config.systemRole === 'central' && (
                                                <div className="absolute top-3 left-3 text-muted-foreground" title="يتطلب باسورد المدير">
                                                    <Lock className="h-4 w-4 text-amber-500" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Central HQ Option Card */}
                                        <div 
                                            onClick={() => handleOpenRoleDialog('central')}
                                            className={cn(
                                                "p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 relative",
                                                config.systemRole === 'central' 
                                                    ? "border-sky-600 bg-sky-500/10 shadow-xs" 
                                                    : "border-border/70 hover:border-sky-500/50 bg-card hover:bg-muted/20"
                                            )}
                                        >
                                            <div className={cn(
                                                "p-2.5 rounded-lg shrink-0",
                                                config.systemRole === 'central' ? "bg-sky-600 text-white" : "bg-muted text-muted-foreground"
                                            )}>
                                                <Building2 className="h-5 w-5" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-sm text-foreground">2. إدارة مركزية (Central HQ Mode)</span>
                                                    {config.systemRole === 'central' && (
                                                        <Badge className="bg-sky-600 text-white text-[9px] px-1.5 py-0 font-bold">نشط</Badge>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                    خادم الإدارة الرئيسي: يستقبل ويجمع مبيعات وحركات كافة الفروع، ولا يقوم برفع بياناته لأي خادم آخر.
                                                </p>
                                            </div>
                                            {config.systemRole !== 'central' && (
                                                <div className="absolute top-3 left-3 text-muted-foreground" title="يتطلب باسورد المدير">
                                                    <Lock className="h-4 w-4 text-amber-500" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

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

            {/* Password-Protected Role Switch Confirmation Dialog */}
            <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader className="border-b pb-3">
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                            <ShieldCheck className="h-5 w-5 text-amber-500" />
                            تأكيد تغيير دور النظام في قاعدة البيانات
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            أنت على وشك تحويل دور هذا الجهاز إلى: <strong className="text-foreground">{targetRoleToSwitch === 'central' ? '🏢 إدارة مركزية (Central HQ)' : '🏪 فرع محلي (Sub-Branch)'}</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleConfirmSwitchRole} className="space-y-4 py-2">
                        <div className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                            <div className="font-bold flex items-center gap-1">
                                <Lock className="h-3.5 w-3.5" />
                                إجراء محمي بكلمة المرور
                            </div>
                            <p className="text-[11px]">
                                يتم تخزين هذا الخيار في جدول إعدادات قاعدة البيانات (<span className="font-mono">dbo.AppSettings</span>)، وتغييره يؤثر على سلوك مزامنة الحركات.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold">كلمة مرور المسؤول (Admin Password)</Label>
                            <Input 
                                type="password"
                                placeholder="أدخل كلمة مرور المسؤول..."
                                value={rolePassword}
                                onChange={(e) => {
                                    setRolePassword(e.target.value);
                                    setRoleSwitchError(null);
                                }}
                                autoFocus
                                className="h-9 text-xs"
                            />
                        </div>

                        {roleSwitchError && (
                            <div className="p-2.5 rounded-lg border bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5 animate-in fade-in-50">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{roleSwitchError}</span>
                            </div>
                        )}

                        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setIsRoleDialogOpen(false)}
                                disabled={isSwitchingRole}
                            >
                                إلغاء
                            </Button>
                            <Button 
                                type="submit" 
                                size="sm" 
                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-1.5 text-xs shadow-sm"
                                disabled={isSwitchingRole || !rolePassword.trim()}
                            >
                                {isSwitchingRole ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" />
                                        جاري التحقق والتحديث...
                                    </>
                                ) : (
                                    <>
                                        <Key className="h-3.5 w-3.5 ml-1" />
                                        تأكيد التحويل وحفظ الإعداد 🔒
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
