"use client";

import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/data-provider";
import {
  Download, Upload, Loader2, AlertTriangle, 
  HardDriveDownload, Database, ShieldAlert, FileCheck, Lock, Server, Copy,
  Trash2, RefreshCw, Building2, Globe, CheckCircle2
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import localforage from 'localforage';
import { cn } from "@/lib/utils";

interface DbStats {
    salesCount: number;
    salesItemsCount: number;
    purchasesCount: number;
    itemsCount: number;
    customersCount: number;
    suppliersCount: number;
    warehousesCount: number;
    cashAccountsCount: number;
    repsCount: number;
    cashiersCount: number;
    usersCount: number;
}

interface HostingDetail {
    type: 'local' | 'cloud' | 'ip';
    label: string;
    server: string;
    database: string;
}

interface BackupInfo {
    database: string;
    localServer?: string;
    isCloudLocal?: boolean;
    branchHosting?: HostingDetail;
    centralDatabase?: string;
    centralServer?: string;
    centralConnected?: boolean;
    centralHosting?: HostingDetail;
    branchCode: string;
    branchName: string;
    defaultBackupPath: string;
    lastBackupAt: string | null;
    stats: DbStats;
    centralStats?: DbStats | null;
}

export default function BackupPage() {
    const { toast } = useToast();
    const { processSyncQueue, allWarehouses, warehouses, inventoryZones } = useData();

    const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
    const [isLoadingInfo, setIsLoadingInfo] = useState(false);

    // Backup states
    const [exportTarget, setExportTarget] = useState<'branch' | 'central'>('branch');
    const [restoreTarget, setRestoreTarget] = useState<'branch' | 'central'>('branch');
    const [isLoadingJsonBackup, setIsLoadingJsonBackup] = useState(false);
    const [isLoadingBakBackup, setIsLoadingBakBackup] = useState(false);
    const [lastBakPath, setLastBakPath] = useState<string | null>(null);
    const [customBakDir, setCustomBakDir] = useState('');

    // Restore states
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [restoreFileSummary, setRestoreFileSummary] = useState<{ totalTables: number; totalRecords: number; createdAt: string } | null>(null);
    const [isLoadingRestore, setIsLoadingRestore] = useState(false);
    const [parsedBackupData, setParsedBackupData] = useState<any>(null);

    // Reset / Purge states
    const [resetType, setResetType] = useState<'transactions_only' | 'factory_reset'>('factory_reset');
    const [targetScope, setTargetScope] = useState<'both' | 'local' | 'central'>('both');
    const [adminPassword, setAdminPassword] = useState('');
    const [isLoadingReset, setIsLoadingReset] = useState(false);
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

    // Branch purge states (C)
    const [selectedBranchId, setSelectedBranchId] = useState('');
    const [deleteBranchEntity, setDeleteBranchEntity] = useState(true);
    const [branchTargetScope, setBranchTargetScope] = useState<'both' | 'local' | 'central'>('both');
    const [branchPassword, setBranchPassword] = useState('');
    const [isLoadingBranchPurge, setIsLoadingBranchPurge] = useState(false);
    const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);

    const allBranches = [...(allWarehouses || warehouses || []), ...(inventoryZones || [])];
    const selectedBranch = allBranches.find((w: any) => w.id === selectedBranchId);

    // جلب معلومات وإحصائيات قاعدة البيانات (الفرع + المركزية)
    const fetchBackupInfo = useCallback(async () => {
        setIsLoadingInfo(true);
        try {
            const res = await fetch('/api/db/backup', { cache: 'no-store' });
            const data = await res.json();
            if (data.success) {
                setBackupInfo(data);
                if (!customBakDir && data.defaultBackupPath) {
                    setCustomBakDir(data.defaultBackupPath);
                }
            }
        } catch (e: any) {
            console.error("Failed to load backup info:", e);
        } finally {
            setIsLoadingInfo(false);
        }
    }, [customBakDir]);

    useEffect(() => {
        fetchBackupInfo();
    }, [fetchBackupInfo]);

    // 1. تصدير وتحميل النسخة الاحتياطية الشاملة (JSON) - للفرع أو للإدارة المركزية
    const handleExportJson = async () => {
        setIsLoadingJsonBackup(true);
        try {
            const res = await fetch('/api/db/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'export-json', target: exportTarget })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'فشل استخراج النسخة الاحتياطية.');
            }

            const data = await res.json();
            if (data.success && data.tables) {
                const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(jsonBlob);
                const link = document.createElement("a");
                link.href = url;
                const dateStr = new Date().toISOString().split('T')[0];
                const targetTag = exportTarget === 'central' ? 'CentralHQ' : (backupInfo?.branchCode || 'Branch');
                link.download = `MultiBranchPOS_${targetTag}_Backup_${dateStr}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                const targetLabel = exportTarget === 'central' ? 'قاعدة الإدارة المركزية' : 'قاعدة بيانات الفرع';
                toast({
                    title: `تم استخراج النسخة الاحتياطية بنجاح 💾`,
                    description: `تم تصدير ${data.metadata?.tablesCount || 72} جدولاً بإجمالي ${data.metadata?.totalRecords || 0} حركة وسجل من [${targetLabel}].`
                });
                await fetchBackupInfo();
            } else {
                throw new Error(data.error || 'فشلت معالجة البيانات.');
            }
        } catch (error: any) {
            console.error("Backup failed:", error);
            toast({
                variant: "destructive",
                title: "خطأ في النسخ الاحتياطي",
                description: error.message || "فشل إنشاء النسخة الاحتياطية."
            });
        } finally {
            setIsLoadingJsonBackup(false);
        }
    };

    // 2. إنشاء نسخة SQL Server أصلية على القرص (.BAK)
    const handleCreateSqlBak = async () => {
        setIsLoadingBakBackup(true);
        try {
            const res = await fetch('/api/db/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'sql-bak',
                    customPath: customBakDir
                })
            });

            const data = await res.json();
            if (data.success) {
                setLastBakPath(data.filePath);
                toast({
                    title: "تم إنشاء النسخة الاحتياطية الأصلية بنجاح ✅",
                    description: `تم حفظ الملف: ${data.fileName}`
                });
            } else {
                throw new Error(data.error || 'فشل حفظ النسخة على السيرفر.');
            }
        } catch (error: any) {
            console.error("SQL BAK failed:", error);
            toast({
                variant: "destructive",
                title: "فشل النسخ الاحتياطي لسيرفر SQL",
                description: error.message
            });
        } finally {
            setIsLoadingBakBackup(false);
        }
    };

    // 3. اختيار وفحص ملف الاستعادة
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            setRestoreFile(file);
            setRestoreFileSummary(null);
            setParsedBackupData(null);

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target?.result;
                    if (typeof text !== 'string') return;
                    const parsed = JSON.parse(text);
                    if (parsed.tables && typeof parsed.tables === 'object') {
                        setParsedBackupData(parsed);
                        const tableKeys = Object.keys(parsed.tables);
                        let totalRows = 0;
                        tableKeys.forEach(k => {
                            if (Array.isArray(parsed.tables[k])) totalRows += parsed.tables[k].length;
                        });
                        setRestoreFileSummary({
                            totalTables: tableKeys.length,
                            totalRecords: totalRows,
                            createdAt: parsed.metadata?.createdAt ? new Date(parsed.metadata.createdAt).toLocaleString('ar-EG') : 'غير محدد'
                        });
                    } else {
                        toast({
                            variant: 'destructive',
                            title: 'ملف غير متوافق',
                            description: 'الملف لا يحتوي على بنية جداول صحيحة لقاعدة البيانات.'
                        });
                        setRestoreFile(null);
                    }
                } catch {
                    toast({
                        variant: 'destructive',
                        title: 'خطأ في قراءة الملف',
                        description: 'الملف ليس بتنسيق JSON سليم.'
                    });
                    setRestoreFile(null);
                }
            };
            reader.readAsText(file);
        }
    };

    // 4. تنفيذ الاستعادة الفعلية إلى SQL Server (للفرع أو للإدارة المركزية)
    const handleRestoreConfirm = async () => {
        if (!parsedBackupData) {
            toast({ variant: "destructive", title: "خطأ", description: "يرجى تحديد ملف نسخة احتياطية صالح أولاً." });
            return;
        }

        setIsLoadingRestore(true);
        try {
            const res = await fetch('/api/db/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'restore-json',
                    target: restoreTarget,
                    backupData: parsedBackupData
                })
            });

            const result = await res.json();
            if (result.success) {
                toast({
                    title: "تمت الاستعادة بنجاح! 🚀",
                    description: result.message
                });
                setRestoreFile(null);
                setRestoreFileSummary(null);
                setParsedBackupData(null);
                const fileInput = document.getElementById('restore-file') as HTMLInputElement;
                if (fileInput) fileInput.value = '';

                try { await localforage.clear(); } catch {}
                if (processSyncQueue) {
                    await processSyncQueue();
                }
                await fetchBackupInfo();
            } else {
                throw new Error(result.error || 'فشلت الاستعادة.');
            }
        } catch (error: any) {
            console.error("Restore failed:", error);
            toast({
                variant: "destructive",
                title: "فشل استعادة البيانات",
                description: error.message || "حدث خطأ أثناء الكتابة في قاعدة البيانات."
            });
        } finally {
            setIsLoadingRestore(false);
        }
    };

    // 5. تنفيذ حذف وتصفير البيانات (من الإدارة المركزية والفرع)
    const handleExecuteReset = async () => {
        if (!adminPassword.trim()) {
            toast({ variant: "destructive", title: "تنبيه", description: "يرجى إدخال كلمة مرور الإدارة لتأكيد الحذف." });
            return;
        }

        setIsLoadingReset(true);
        try {
            const res = await fetch('/api/db/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'reset-data',
                    resetType,
                    targetScope,
                    adminPassword
                })
            });

            const result = await res.json();
            if (result.success) {
                // مسح الكاش المحلي في المتصفح بالكامل لضمان اختفاء الفروع والمخازن والخزن والمناديب والكاشيرات فوراً
                try {
                    await localforage.clear();
                } catch {}

                toast({
                    title: "تم تنفيذ الحذف والتصفير بنجاح ✅",
                    description: result.message
                });
                setAdminPassword('');
                setIsResetDialogOpen(false);

                // تحديث الشاشات المحلية من السيرفر بعد التصفير
                if (processSyncQueue) {
                    await processSyncQueue();
                }
                await fetchBackupInfo();
            } else {
                throw new Error(result.error || 'فشلت عملية التصفير.');
            }
        } catch (error: any) {
            console.error("Reset failed:", error);
            toast({
                variant: "destructive",
                title: "فشل تنفيذ الإجراء",
                description: error.message || "فشلت عملية الحذف أو أن كلمة المرور غير صحيحة."
            });
        } finally {
            setIsLoadingReset(false);
        }
    };

    // 6. تنفيذ حذف بيانات فرع محدد (مع خيار حذف الفرع نفسه ومخازنه وخزينته وكاشيراته)
    const handleExecuteBranchPurge = async () => {
        if (!selectedBranchId) {
            toast({ variant: 'destructive', title: 'تنبيه', description: 'يرجى اختيار الفرع المراد حذف بياناته.' });
            return;
        }
        if (!branchPassword.trim()) {
            toast({ variant: 'destructive', title: 'تنبيه', description: 'يرجى إدخال كلمة مرور الإدارة.' });
            return;
        }
        setIsLoadingBranchPurge(true);
        try {
            const res = await fetch('/api/db/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'reset-branch',
                    warehouseId: selectedBranchId,
                    branchLabel: selectedBranch?.name || selectedBranchId,
                    deleteBranchEntity,
                    targetScope: branchTargetScope,
                    adminPassword: branchPassword
                })
            });
            const result = await res.json();
            if (result.success) {
                try { await localforage.clear(); } catch {}
                toast({ title: 'تم حذف بيانات الفرع بنجاح ✅', description: result.message });
                setBranchPassword('');
                setSelectedBranchId('');
                setIsBranchDialogOpen(false);
                if (processSyncQueue) await processSyncQueue();
                await fetchBackupInfo();
            } else {
                throw new Error(result.error || 'فشل حذف بيانات الفرع.');
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'فشل الحذف', description: error.message });
        } finally {
            setIsLoadingBranchPurge(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: "تم النسخ للحافظة 📋" });
    };

    const renderStatsRow = (stats: DbStats) => (
        <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                <span className="text-[10px] text-muted-foreground block">الفروع والمخازن</span>
                <span className="font-bold text-foreground">{stats.warehousesCount}</span>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                <span className="text-[10px] text-muted-foreground block">الخزائن والعهد</span>
                <span className="font-bold text-foreground">{stats.cashAccountsCount}</span>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                <span className="text-[10px] text-muted-foreground block">المناديب</span>
                <span className="font-bold text-foreground">{stats.repsCount}</span>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                <span className="text-[10px] text-muted-foreground block">الكاشيرات والأجهزة</span>
                <span className="font-bold text-foreground">{stats.cashiersCount}</span>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                <span className="text-[10px] text-muted-foreground block">الأصناف</span>
                <span className="font-bold text-foreground">{stats.itemsCount}</span>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                <span className="text-[10px] text-muted-foreground block">العملاء</span>
                <span className="font-bold text-foreground">{stats.customersCount}</span>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                <span className="text-[10px] text-muted-foreground block">الموردين</span>
                <span className="font-bold text-foreground">{stats.suppliersCount}</span>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                <span className="text-[10px] text-muted-foreground block">فواتير البيع</span>
                <span className="font-bold text-foreground">{stats.salesCount}</span>
            </div>
        </div>
    );

    return (
        <>
            <PageHeader title="النسخ الاحتياطي وحذف وإعادة ضبط البيانات (الإدارة المركزية والفرع)">
                <div className="w-full sm:w-auto grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 sm:gap-2">
                    <Button 
                        asChild
                        variant="outline" 
                        size="sm" 
                        className="col-span-1 w-full sm:w-auto justify-center gap-1.5 text-xs font-bold h-8.5 sm:h-8"
                    >
                        <a href="/settings/re-engineer">
                            <Server className="h-3.5 w-3.5 text-primary" />
                            مركز إدارة السيرفرات
                        </a>
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={fetchBackupInfo} 
                        disabled={isLoadingInfo}
                        className="col-span-1 w-full sm:w-auto justify-center gap-1.5 text-xs font-bold h-8.5 sm:h-8"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isLoadingInfo ? 'animate-spin' : ''}`} />
                        تحديث الإحصائيات
                    </Button>
                </div>
            </PageHeader>

            <main className="flex flex-1 flex-col gap-4 sm:gap-6 p-3 sm:p-4 md:gap-6 md:p-6 max-w-7xl mx-auto w-full">
                {/* شريط معلومات قاعدة بيانات الفرع والإدارة المركزية */}
                <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
                    {/* بطاقة قاعدة بيانات الفرع */}
                    <Card className="border bg-card/60 backdrop-blur-xs shadow-xs">
                        <CardContent className="p-3.5 sm:p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                        <Database className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="text-sm font-bold text-foreground">
                                                قاعدة بيانات الفرع: {backupInfo?.database || 'MultiBranchPOS_DB'}
                                            </h2>
                                            <Badge variant="outline" className={cn(
                                                "text-[10px] font-bold",
                                                backupInfo?.branchHosting?.type === 'cloud' || backupInfo?.isCloudLocal
                                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                                    : backupInfo?.branchHosting?.type === 'ip'
                                                    ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30"
                                                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                            )}>
                                                {backupInfo?.branchHosting?.label || (backupInfo?.isCloudLocal ? '☁️ سحابي' : '💻 محلي')}
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                                متصلة ✅
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            الفرع النشط: <strong className="text-foreground">{backupInfo?.branchName || 'الفرع الرئيسي'} ({backupInfo?.branchCode || '900'})</strong>
                                            {backupInfo?.localServer && (
                                                <span className="block font-mono text-[10px] text-muted-foreground/90 mt-0.5 break-all" dir="ltr">
                                                    السيرفر: {backupInfo.localServer}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {backupInfo?.stats && renderStatsRow(backupInfo.stats)}
                        </CardContent>
                    </Card>

                    {/* بطاقة قاعدة بيانات الإدارة المركزية */}
                    <Card className="border bg-card/60 backdrop-blur-xs shadow-xs">
                        <CardContent className="p-3.5 sm:p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                                        <Globe className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="text-sm font-bold text-foreground">
                                                قاعدة الإدارة المركزية: {backupInfo?.centralDatabase || 'MultiBranchPOS_Central_DB'}
                                            </h2>
                                            <Badge variant="outline" className={cn(
                                                "text-[10px] font-bold",
                                                backupInfo?.centralHosting?.type === 'cloud'
                                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                                    : backupInfo?.centralHosting?.type === 'ip'
                                                    ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30"
                                                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                            )}>
                                                {backupInfo?.centralHosting?.label || '🌐 سيرفر IP / شبكة'}
                                            </Badge>
                                            {backupInfo?.centralConnected ? (
                                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                                    متصلة بالسيرفر المركزي ✅
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
                                                    غير متصلة حالياً
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            السيرفر المركزي: <strong className="text-foreground font-mono break-all">{backupInfo?.centralServer || '10.110.16.16:1433'}</strong>
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {backupInfo?.centralStats ? (
                                renderStatsRow(backupInfo.centralStats)
                            ) : (
                                <p className="text-xs text-muted-foreground py-2">
                                    تعذر قراءة إحصائيات السيرفر المركزي حالياً (تأكد من الاتصال بالشبكة أو إعدادات المزامنة المركزية).
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* القسم 3 (مقدم للأعلى لأهميته): حذف وتصفير كل البيانات من الإدارة المركزية والفرع */}
                <Card className="border-2 border-destructive/50 bg-card shadow-sm">
                    <CardHeader className="border-b pb-4 bg-destructive/5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-base font-bold text-destructive flex items-center gap-2">
                                <ShieldAlert className="h-5 w-5" />
                                حذف وتصفير كل البيانات من الإدارة المركزية والفرع (إعادة الضبط الشاملة)
                            </CardTitle>
                            <Badge variant="destructive" className="text-xs">
                                يشمل الفروع والمخازن والخزن والمناديب والكاشيرات وكل شيء
                            </Badge>
                        </div>
                        <CardDescription className="text-xs leading-relaxed mt-1">
                            يتيح لك مسح كافة البيانات من <strong>قاعدة بيانات الإدارة المركزية</strong> و<strong>قاعدة بيانات الفرع</strong> معاً في خطوة واحدة، لضمان عدم عودة أي بيانات محذوفة عبر المزامنة التلقائية والبدء على نظافة تامة.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 space-y-6">
                        {/* أولاً: اختيار نطاق القواعد المراد حذفها */}
                        <div className="space-y-2.5">
                            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Globe className="h-4 w-4 text-primary" />
                                أولاً: اختر نطاق الحذف (أين تريد تطبيق المسح؟):
                            </Label>
                            <RadioGroup
                                value={targetScope}
                                onValueChange={(v: any) => setTargetScope(v)}
                                className="grid grid-cols-1 md:grid-cols-3 gap-3"
                            >
                                <Label
                                    htmlFor="scope-both"
                                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-1.5 ${
                                        targetScope === 'both'
                                            ? 'border-destructive bg-destructive/10 shadow-xs'
                                            : 'border-border hover:bg-muted/30 opacity-75'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-xs text-foreground flex items-center gap-2">
                                            <RadioGroupItem value="both" id="scope-both" />
                                            الإدارة المركزية والفرع معاً
                                        </span>
                                        <Badge variant="destructive" className="text-[10px]">الموصى به</Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        يحذف البيانات من قاعدة بيانات الفرع [{backupInfo?.database || 'MultiBranchPOS_DB'} على {backupInfo?.branchHosting?.label || 'السيرفر'}] ومن قاعدة الإدارة المركزية [{backupInfo?.centralDatabase || 'MultiBranchPOS_Central_DB'} على {backupInfo?.centralHosting?.label || 'السيرفر'}] في نفس اللحظة لمنع عودتها بالمزامنة.
                                    </p>
                                </Label>

                                <Label
                                    htmlFor="scope-local"
                                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-1.5 ${
                                        targetScope === 'local'
                                            ? 'border-primary bg-primary/5 shadow-xs'
                                            : 'border-border hover:bg-muted/30 opacity-75'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-xs text-foreground flex items-center gap-2">
                                            <RadioGroupItem value="local" id="scope-local" />
                                            قاعدة بيانات الفرع فقط
                                        </span>
                                        <Badge variant="outline" className="text-[9px]">
                                            {backupInfo?.branchHosting?.label || 'سيرفر الفرع'}
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        يمسح بيانات قاعدة الفرع الحالية ({backupInfo?.database || 'MultiBranchPOS_DB'} على {backupInfo?.localServer || 'السيرفر'}) فقط دون المساس بالإدارة المركزية.
                                    </p>
                                </Label>

                                <Label
                                    htmlFor="scope-central"
                                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-1.5 ${
                                        targetScope === 'central'
                                            ? 'border-indigo-600 bg-indigo-500/10 shadow-xs'
                                            : 'border-border hover:bg-muted/30 opacity-75'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-xs text-foreground flex items-center gap-2">
                                            <RadioGroupItem value="central" id="scope-central" />
                                            قاعدة الإدارة المركزية فقط
                                        </span>
                                        <Badge variant="outline" className="text-[9px]">
                                            {backupInfo?.centralHosting?.label || 'السيرفر المركزي'}
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        يمسح بيانات قاعدة الإدارة المركزية ({backupInfo?.centralDatabase || 'MultiBranchPOS_Central_DB'} على {backupInfo?.centralServer || 'السيرفر'}) فقط دون المساس بقاعدة الفرع.
                                    </p>
                                </Label>
                            </RadioGroup>
                        </div>

                        {/* ثانياً: اختيار نوع المسح */}
                        <div className="space-y-2.5">
                            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Trash2 className="h-4 w-4 text-destructive" />
                                ثانياً: اختر مستوى المسح:
                            </Label>
                            <RadioGroup 
                                value={resetType} 
                                onValueChange={(v: any) => setResetType(v)}
                                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                            >
                                {/* الخيار أ: ضبط المصنع الكامل (مسح كل شيء) */}
                                <Label 
                                    htmlFor="opt-factory"
                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-2 ${
                                        resetType === 'factory_reset' 
                                            ? 'border-destructive bg-destructive/5 shadow-xs' 
                                            : 'border-border hover:bg-muted/30 opacity-70'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-xs text-destructive flex items-center gap-2">
                                            <RadioGroupItem value="factory_reset" id="opt-factory" />
                                            حذف كل البيانات بالكامل (شامل الفروع والمخازن والخزن والمناديب والكاشيرات)
                                        </span>
                                        <Badge variant="destructive" className="text-[10px]">
                                            شامل وتام 100%
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        يمسح جميع <strong>الفروع، المخازن، الأقسام، الخزائن، الحسابات البنكية، المناديب وعهدهم، الكاشيرات وشاشات الكاشير، الموظفين، الأصناف، التصنيفات، العملاء، الموردين، الفواتير، الحركات، والأرشيف التاريخي</strong>.
                                    </p>
                                    <div className="text-[10px] font-bold text-foreground pt-1">
                                        🛡️ يتم الإبقاء فقط على: حساب المدير الرئيسي (`admin`) للدخول للنظام + الأدوار وإعدادات الاتصال.
                                    </div>
                                </Label>

                                {/* الخيار ب: تصفير الحركات فقط */}
                                <Label 
                                    htmlFor="opt-trans"
                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-2 ${
                                        resetType === 'transactions_only' 
                                            ? 'border-primary bg-primary/5 shadow-xs' 
                                            : 'border-border hover:bg-muted/30 opacity-70'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-xs text-foreground flex items-center gap-2">
                                            <RadioGroupItem value="transactions_only" id="opt-trans" />
                                            تصفير الحركات والفواتير والأرشيف فقط (مع بقاء الفروع والأصناف)
                                        </span>
                                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                            حركات فقط
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        يحذف جميع الفواتير والسندات وحركات المخزون وعهد المناديب وأوامر التصنيع وسجل التدقيق والأرشيف، ويصفر أرصدة الخزائن والعملاء والموردين.
                                    </p>
                                    <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 pt-1">
                                        ✅ يتم الحفاظ على: الفروع، المخازن، الخزائن، المناديب، الكاشيرات، الأصناف، العملاء، والموردين.
                                    </div>
                                </Label>
                            </RadioGroup>
                        </div>

                        {/* نافذة التأكيد المحمية بكلمة مرور */}
                        <div className="pt-2 flex justify-end">
                            <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                                <AlertDialogTrigger asChild>
                                    <Button 
                                        variant="destructive" 
                                        className="h-10 px-6 text-xs font-bold gap-2 shadow-sm"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        {resetType === 'factory_reset'
                                            ? 'حذف كل البيانات الآن (الفروع والمخازن والخزن والمناديب والكاشيرات وكل شيء)'
                                            : 'تصفير الحركات والعمليات الآن'}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="text-right" dir="rtl">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                                            <AlertTriangle className="h-5 w-5" />
                                            تأكيد الحذف النهائي (يلزم كلمة مرور الإدارة)
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-xs space-y-3 leading-relaxed">
                                            <div className="p-2.5 rounded-lg bg-muted border space-y-1 text-foreground">
                                                <div>
                                                    • <strong>النطاق المختار:</strong>{' '}
                                                    {targetScope === 'both'
                                                        ? 'الإدارة المركزية + الفرع المحلي معاً'
                                                        : targetScope === 'local'
                                                        ? 'قاعدة بيانات الفرع المحلي فقط'
                                                        : 'قاعدة بيانات الإدارة المركزية فقط'}
                                                </div>
                                                <div>
                                                    • <strong>مستوى الحذف:</strong>{' '}
                                                    {resetType === 'factory_reset'
                                                        ? 'مسح شامل لكل شيء (الفروع، المخازن، الخزن، المناديب، الكاشيرات، الأصناف، العملاء، الموردين، والحركات)'
                                                        : 'حذف جميع الحركات والفواتير وتصفير الأرصدة فقط'}
                                                </div>
                                            </div>
                                            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px] font-medium leading-relaxed">
                                                ⚠️ هذا الإجراء نهائي ولا يمكن التراجع عنه! سيتم أيضاً تفريغ الذاكرة المؤقتة للمتصفح وتصفير عدادات المزامنة.
                                            </div>
                                            <div className="space-y-1.5 pt-2">
                                                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                                    أدخل كلمة مرور الإدارة للمتابعة:
                                                </Label>
                                                <Input 
                                                    type="password"
                                                    value={adminPassword}
                                                    onChange={e => setAdminPassword(e.target.value)}
                                                    placeholder="كلمة مرور الإدارة..."
                                                    className="h-9 text-xs bg-background"
                                                    autoFocus
                                                />
                                            </div>
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="flex-row-reverse gap-2">
                                        <AlertDialogCancel className="h-9 text-xs font-bold">إلغاء</AlertDialogCancel>
                                        <AlertDialogAction 
                                            onClick={handleExecuteReset}
                                            disabled={!adminPassword.trim() || isLoadingReset}
                                            className="h-9 text-xs font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-1.5"
                                        >
                                            {isLoadingReset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                            {isLoadingReset ? 'جارٍ المسح الشامل...' : 'تأكيد وحذف البيانات الآن'}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </CardContent>
                </Card>

                {/* القسم 4: حذف فرع / مستودع محدد بالكامل من الفرع والإدارة المركزية */}
                <Card className="border-orange-400/40 bg-card shadow-xs">
                    <CardHeader className="border-b pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                                <Building2 className="h-5 w-5" />
                                حذف فرع أو مخزن أو عهدة مندوب محددة (من الفرع والإدارة المركزية)
                            </CardTitle>
                            <Badge variant="outline" className="text-xs border-orange-400/40 text-foreground bg-orange-500/5">
                                حذف انتقائي للفرع وملحقاته
                            </Badge>
                        </div>
                        <CardDescription className="text-xs leading-relaxed mt-1">
                            يتيح حذف فرع أو مستودع أو عهدة مندوب معينة بكافة حركاتها وخزينتها وكاشيراتها من كل من الفرع المحلي والإدارة المركزية.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 space-y-5">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="p-4 rounded-xl border bg-orange-50/40 dark:bg-orange-950/20 space-y-2">
                                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                    <Trash2 className="h-3.5 w-3.5" /> ما يتم حذفه للفرع / المخزن المحدد:
                                </p>
                                <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                                    <li>جميع فواتير المبيعات والمشتريات والمرتجعات الخاصة بالفرع</li>
                                    <li>جميع حركات المخزون (إضافة، صرف، تحويل، تسوية، عهد مناديب)</li>
                                    <li>جلسات الكاشير والفواتير المعلقة وسجلات الإكراميات</li>
                                    <li>عند تفعيل خيار <strong>حذف الفرع نفسه</strong>: يتم أيضاً حذف سجل الفرع/المخزن وخزينته وشاشات الكاشير وأقسامه ومناديبه المرتبطين به.</li>
                                </ul>
                            </div>

                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold">اختر الفرع / المخزن / عهدة المندوب:</Label>
                                    <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                                        <SelectTrigger className="h-9 text-xs">
                                            <SelectValue placeholder="-- اختر الفرع أو المخزن المراد حذفه --" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allBranches.map((w: any) => (
                                                <SelectItem key={w.id} value={w.id} className="text-xs">
                                                    {w.name} {w.code ? `(${w.code})` : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center space-x-2 rtl:space-x-reverse pt-1">
                                    <Checkbox
                                        id="del-branch-entity"
                                        checked={deleteBranchEntity}
                                        onCheckedChange={(c) => setDeleteBranchEntity(Boolean(c))}
                                    />
                                    <Label htmlFor="del-branch-entity" className="text-xs font-bold cursor-pointer">
                                        حذف الفرع/المخزن نفسه نهائياً مع خزينته وكاشيراته وأقسامه (بالإضافة لحركاته)
                                    </Label>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold">نطاق حذف الفرع:</Label>
                                    <Select value={branchTargetScope} onValueChange={(v: any) => setBranchTargetScope(v)}>
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="both" className="text-xs">من الإدارة المركزية والفرع معاً (الموصى به)</SelectItem>
                                            <SelectItem value="local" className="text-xs">من الفرع المحلي فقط</SelectItem>
                                            <SelectItem value="central" className="text-xs">من الإدارة المركزية فقط</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="pt-2 flex justify-end">
                                    <AlertDialog open={isBranchDialogOpen} onOpenChange={setIsBranchDialogOpen}>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="outline"
                                                disabled={!selectedBranchId}
                                                className="h-9 px-5 text-xs font-bold gap-2 border-orange-500/40 text-foreground hover:bg-orange-500/10"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                حذف الفرع المحدد وبياناته
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="text-right" dir="rtl">
                                            <AlertDialogHeader>
                                                <AlertDialogTitle className="flex items-center gap-2 text-foreground">
                                                    <AlertTriangle className="h-5 w-5" />
                                                    تأكيد حذف: {selectedBranch?.name}
                                                </AlertDialogTitle>
                                                <AlertDialogDescription className="text-xs space-y-3 leading-relaxed">
                                                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px] font-medium leading-relaxed">
                                                        ⚠️ سيتم حذف {deleteBranchEntity ? 'الفرع بالكامل مع خزينته وكاشيراته وكافة حركاته' : 'جميع الحركات والعمليات الخاصة بالفرع'} لـ <strong>{selectedBranch?.name}</strong> بشكل نهائي.
                                                    </div>
                                                    <div className="space-y-1.5 pt-2">
                                                        <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                                            أدخل كلمة مرور الإدارة:
                                                        </Label>
                                                        <Input
                                                            type="password"
                                                            value={branchPassword}
                                                            onChange={e => setBranchPassword(e.target.value)}
                                                            placeholder="كلمة مرور الإدارة..."
                                                            className="h-8 text-xs bg-background"
                                                            autoFocus
                                                        />
                                                    </div>
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter className="flex-row-reverse gap-2">
                                                <AlertDialogCancel className="h-8 text-xs font-bold">إلغاء</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={handleExecuteBranchPurge}
                                                    disabled={!branchPassword.trim() || isLoadingBranchPurge}
                                                    className="h-8 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
                                                >
                                                    {isLoadingBranchPurge ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                    {isLoadingBranchPurge ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* القسم 1 و 2: النسخ الاحتياطي والاستعادة */}
                <div className="grid gap-6 md:grid-cols-2">
                    {/* القسم 1: إنشاء النسخ الاحتياطية */}
                    <Card className="border shadow-xs flex flex-col justify-between">
                        <CardHeader>
                            <CardTitle className="text-base font-bold flex items-center gap-2">
                                <Download className="h-5 w-5 text-foreground" />
                                إنشاء وتنزيل نسخة احتياطية
                            </CardTitle>
                            <CardDescription className="text-xs">
                                يمكنك تصدير كافة بيانات الجداول والعمليات بصيغة JSON شاملة وقابلة للنقل، أو حفظ نسخة أصلية (.bak) مباشرة على سيرفر SQL.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* اختيار قاعدة البيانات المراد نسخها */}
                            <div className="space-y-1.5 p-2.5 rounded-lg border bg-muted/20">
                                <Label className="text-xs font-bold text-foreground">تحديد قاعدة البيانات المراد نسخها:</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={exportTarget === 'branch' ? 'default' : 'outline'}
                                        className="h-8 text-[11px] font-bold"
                                        onClick={() => setExportTarget('branch')}
                                    >
                                        قاعدة الفرع ({backupInfo?.database || 'MultiBranchPOS_DB'})
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={exportTarget === 'central' ? 'default' : 'outline'}
                                        className="h-8 text-[11px] font-bold"
                                        disabled={!backupInfo?.centralConnected}
                                        onClick={() => setExportTarget('central')}
                                    >
                                        قاعدة الإدارة ({backupInfo?.centralDatabase || 'MultiBranchPOS_Central_DB'})
                                    </Button>
                                </div>
                            </div>

                            <div className="p-3.5 rounded-xl border bg-muted/30 space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs flex items-center gap-1.5">
                                        <HardDriveDownload className="h-4 w-4 text-emerald-600" />
                                        نسخة احتياطية ذكية شاملة (.json)
                                    </span>
                                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                        الموصى بها (تعمل سحابياً ومحلياً)
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    تقوم بسحب كافة الجداول في ملف JSON موثق، وتنزيلها مباشرة إلى جهازك بنقرة زر. تعمل بكفاءة تامة على الخوادم السحابية والسيرفرات المحلية دون قيود صلاحيات.
                                </p>
                                <Button 
                                    onClick={handleExportJson} 
                                    disabled={isLoadingJsonBackup}
                                    className="w-full h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
                                >
                                    {isLoadingJsonBackup ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Download className="h-4 w-4" />
                                    )}
                                    {isLoadingJsonBackup ? 'جارٍ تجميع وتجهيز الملف...' : `تنزيل نسخة [${exportTarget === 'central' ? 'الإدارة المركزية' : 'قاعدة الفرع'}] الآن`}
                                </Button>
                            </div>

                            <div className="p-3.5 rounded-xl border bg-muted/30 space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs flex items-center gap-1.5">
                                        <Server className="h-4 w-4 text-foreground" />
                                        نسخة احتياطية أصلية للسيرفر (Native SQL .BAK)
                                    </span>
                                    <Badge variant="outline" className="text-[9px]">خاصة بالسيرفر المحلي / VPS</Badge>
                                </div>
                                {(backupInfo?.branchHosting?.type === 'cloud' || backupInfo?.isCloudLocal) && (
                                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] leading-relaxed">
                                        💡 <strong>تنبيه السيرفرات السحابية:</strong> خوادم قواعد البيانات السحابية تمنع إنشاء ملفات .BAK المحلية المباشرة على القرص. يُرجى استخدام [النسخ الاحتياطي الذكي .json] أعلاه فهو يعمل بسلاسة على كافة أنواع السيرفرات.
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-muted-foreground">مسار المجلد على السيرفر (اختياري):</Label>
                                    <Input 
                                        value={customBakDir} 
                                        onChange={e => setCustomBakDir(e.target.value)}
                                        placeholder="C:\SQL_Backups" 
                                        className="h-8 text-xs font-mono"
                                    />
                                </div>
                                <Button 
                                    variant="outline" 
                                    onClick={handleCreateSqlBak} 
                                    disabled={isLoadingBakBackup || Boolean(backupInfo?.branchHosting?.type === 'cloud' || backupInfo?.isCloudLocal)}
                                    className="w-full h-8 text-xs font-bold gap-2 border-sky-500/30 hover:bg-sky-500/10 text-foreground"
                                >
                                    {isLoadingBakBackup ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Database className="h-3.5 w-3.5 text-foreground" />
                                    )}
                                    {isLoadingBakBackup ? 'جارٍ إنشاء ملف .BAK في السيرفر...' : 'إنشاء نسخة .BAK على القرص الصلب'}
                                </Button>
                                {lastBakPath && (
                                    <div className="p-2 rounded bg-muted text-[11px] font-mono flex items-center justify-between gap-2 border">
                                        <span className="truncate" title={lastBakPath}>{lastBakPath}</span>
                                        <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="h-6 w-6 shrink-0" 
                                            onClick={() => copyToClipboard(lastBakPath)}
                                            title="نسخ المسار"
                                        >
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* القسم 2: استعادة نسخة احتياطية */}
                    <Card className="border shadow-xs flex flex-col justify-between">
                        <CardHeader>
                            <CardTitle className="text-base font-bold flex items-center gap-2">
                                <Upload className="h-5 w-5 text-foreground" />
                                استعادة نسخة احتياطية
                            </CardTitle>
                            <CardDescription className="text-xs">
                                يمكنك استرجاع بياناتك كاملة من أي ملف نسخة احتياطية (.json) محفوظ مسبقاً، مع تحديد القاعدة المستهدفة (الفرع أو الإدارة المركزية).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* اختيار قاعدة البيانات المستهدفة للاستعادة */}
                            <div className="space-y-1.5 p-2.5 rounded-lg border bg-muted/20">
                                <Label className="text-xs font-bold text-foreground">تحديد قاعدة البيانات المستهدفة للاستعادة إليها:</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={restoreTarget === 'branch' ? 'default' : 'outline'}
                                        className="h-8 text-[11px] font-bold"
                                        onClick={() => setRestoreTarget('branch')}
                                    >
                                        قاعدة الفرع ({backupInfo?.database || 'MultiBranchPOS_DB'})
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={restoreTarget === 'central' ? 'default' : 'outline'}
                                        className="h-8 text-[11px] font-bold"
                                        disabled={!backupInfo?.centralConnected}
                                        onClick={() => setRestoreTarget('central')}
                                    >
                                        قاعدة الإدارة ({backupInfo?.centralDatabase || 'MultiBranchPOS_Central_DB'})
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2 border-2 border-dashed rounded-xl p-4 text-center bg-muted/20">
                                <input
                                    id="restore-file"
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                                <Label 
                                    htmlFor="restore-file" 
                                    className="cursor-pointer flex flex-col items-center justify-center gap-2 py-3"
                                >
                                    <div className="h-10 w-10 rounded-full bg-amber-500/10 text-foreground flex items-center justify-center">
                                        <Upload className="h-5 w-5" />
                                    </div>
                                    <span className="font-bold text-xs text-foreground">
                                        {restoreFile ? restoreFile.name : 'اضغط هنا لاختيار ملف النسخة الاحتياطية (.json)'}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                        {restoreFile ? `${(restoreFile.size / 1024 / 1024).toFixed(2)} ميجابايت` : 'يدعم ملفات JSON المنتجة بواسطة النظام'}
                                    </span>
                                </Label>
                            </div>

                            {restoreFileSummary && (
                                <div className="p-3 rounded-xl border bg-amber-500/5 border-amber-500/20 space-y-1.5 animate-in fade-in-50">
                                    <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                                        <FileCheck className="h-4 w-4" />
                                        تم التحقق من سلامة الملف
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                                        <div className="p-1.5 rounded bg-background border">
                                            <span className="text-[10px] text-muted-foreground block">عدد الجداول</span>
                                            <strong className="text-foreground">{restoreFileSummary.totalTables}</strong>
                                        </div>
                                        <div className="p-1.5 rounded bg-background border">
                                            <span className="text-[10px] text-muted-foreground block">إجمالي السجلات</span>
                                            <strong className="text-foreground">{restoreFileSummary.totalRecords}</strong>
                                        </div>
                                        <div className="p-1.5 rounded bg-background border">
                                            <span className="text-[10px] text-muted-foreground block">تاريخ الإنشاء</span>
                                            <span className="text-[10px] font-bold text-foreground truncate block">{restoreFileSummary.createdAt}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button 
                                        disabled={!parsedBackupData || isLoadingRestore}
                                        className="w-full h-9 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-2 shadow-sm"
                                    >
                                        {isLoadingRestore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                        {isLoadingRestore ? 'جارٍ استعادة البيانات إلى SQL...' : `استعادة النسخة إلى [${restoreTarget === 'central' ? 'الإدارة المركزية' : 'قاعدة الفرع'}]`}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="text-right w-[94vw] sm:max-w-lg" dir="rtl">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="flex items-center gap-2 text-foreground">
                                            <AlertTriangle className="h-5 w-5" />
                                            تأكيد استعادة النسخة الاحتياطية
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-xs space-y-2 leading-relaxed">
                                            <span>
                                                أنت على وشك استعادة <strong>{restoreFileSummary?.totalRecords}</strong> حركة وسجل عبر <strong>{restoreFileSummary?.totalTables}</strong> جدولاً إلى <strong>[{restoreTarget === 'central' ? 'قاعدة بيانات الإدارة المركزية' : 'قاعدة بيانات الفرع'}]</strong>.
                                            </span>
                                            <br />
                                            <span className="font-bold text-destructive block mt-2">
                                                ⚠️ تنبيه: سيتم استبدال البيانات المسجلة في القاعدة المستهدفة بالبيانات الواردة في ملف النسخة الاحتياطية. يرجى التأكد قبل المتابعة.
                                            </span>
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t">
                                        <AlertDialogCancel className="h-8.5 sm:h-8 text-xs font-bold w-full sm:w-auto">إلغاء</AlertDialogCancel>
                                        <AlertDialogAction 
                                            onClick={handleRestoreConfirm}
                                            className="h-8.5 sm:h-8 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white w-full sm:w-auto"
                                        >
                                            نعم، تابع الاستعادة الآن
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </>
    );
}
