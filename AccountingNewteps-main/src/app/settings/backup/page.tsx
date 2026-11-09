"use client";

import React, { useState, useEffect, useCallback } from 'react';
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
import { 
  Download, 
  Upload, 
  Loader2, 
  AlertTriangle, 
  RefreshCcw, 
  HardDriveDownload, 
  Database, 
  ShieldAlert, 
  FileCheck, 
  CheckCircle2, 
  Lock, 
  Server, 
  Copy, 
  FileText,
  Trash2,
  Layers,
  RefreshCw
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface DbStats {
    salesCount: number;
    salesItemsCount: number;
    purchasesCount: number;
    itemsCount: number;
    customersCount: number;
    suppliersCount: number;
    warehousesCount: number;
    cashAccountsCount: number;
    usersCount: number;
}

interface BackupInfo {
    database: string;
    branchCode: string;
    branchName: string;
    defaultBackupPath: string;
    lastBackupAt: string | null;
    stats: DbStats;
}

export default function BackupPage() {
    const { toast } = useToast();
    const { processSyncQueue } = useData();

    const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
    const [isLoadingInfo, setIsLoadingInfo] = useState(false);

    // Backup states
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
    const [resetType, setResetType] = useState<'transactions_only' | 'factory_reset'>('transactions_only');
    const [adminPassword, setAdminPassword] = useState('');
    const [isLoadingReset, setIsLoadingReset] = useState(false);
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

    // جلب معلومات وإحصائيات قاعدة البيانات
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

    // 1. تصدير وتحميل النسخة الاحتياطية الشاملة (JSON)
    const handleExportJson = async () => {
        setIsLoadingJsonBackup(true);
        try {
            const res = await fetch('/api/db/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'export-json' })
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
                link.download = `MultiBranchPOS_${backupInfo?.branchCode || '900'}_Backup_${dateStr}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                toast({
                    title: "تم استخراج النسخة الاحتياطية بنجاح 💾",
                    description: `تم تصدير ${data.metadata?.tablesCount || 71} جدولاً بإجمالي ${data.metadata?.totalRecords || 0} حركة وسجل.`
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

    // 4. تنفيذ الاستعادة الفعلية إلى SQL Server
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

                // تحديث بيانات النظام المحلي
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

    // 5. تنفيذ حذف وتصفير البيانات
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
                    adminPassword
                })
            });

            const result = await res.json();
            if (result.success) {
                toast({
                    title: "تم تنفيذ الإجراء بنجاح ✅",
                    description: result.message
                });
                setAdminPassword('');
                setIsResetDialogOpen(false);

                // تحديث الشاشات المحلية
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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: "تم النسخ للحافظة 📋" });
    };

    return (
        <>
            <PageHeader title="النسخ الاحتياطي وحذف وإعادة ضبط البيانات">
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fetchBackupInfo} 
                    disabled={isLoadingInfo}
                    className="gap-1.5 text-xs font-bold"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingInfo ? 'animate-spin' : ''}`} />
                    تحديث الإحصائيات
                </Button>
            </PageHeader>

            <main className="flex flex-1 flex-col gap-6 p-4 md:gap-6 md:p-6 max-w-7xl mx-auto w-full">
                {/* شريط معلومات قاعدة البيانات المحلية */}
                <Card className="border bg-card/60 backdrop-blur-xs shadow-xs">
                    <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <Database className="h-6 w-6" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-base font-bold text-foreground">
                                            قاعدة البيانات المحلية: {backupInfo?.database || 'MultiBranchPOS_DB'}
                                        </h2>
                                        <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                            متصلة ومحدثة ✅
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        الفرع النشط: <strong className="text-foreground">{backupInfo?.branchName || 'الفرع الرأيسي'} ({backupInfo?.branchCode || '900'})</strong>
                                        {backupInfo?.lastBackupAt && (
                                            <span className="mr-3">
                                                | آخر نسخة احتياطية: {new Date(backupInfo.lastBackupAt).toLocaleString('ar-EG')}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>

                            {/* ملخص أعداد الحركات والبيانات في النظام */}
                            {backupInfo?.stats && (
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                                        <span className="text-[10px] text-muted-foreground block">فواتير مبيعات</span>
                                        <span className="font-bold text-foreground">{backupInfo.stats.salesCount}</span>
                                    </div>
                                    <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                                        <span className="text-[10px] text-muted-foreground block">بنود مبيعات</span>
                                        <span className="font-bold text-foreground">{backupInfo.stats.salesItemsCount}</span>
                                    </div>
                                    <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                                        <span className="text-[10px] text-muted-foreground block">أصناف الكتالوج</span>
                                        <span className="font-bold text-foreground">{backupInfo.stats.itemsCount}</span>
                                    </div>
                                    <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                                        <span className="text-[10px] text-muted-foreground block">العملاء</span>
                                        <span className="font-bold text-foreground">{backupInfo.stats.customersCount}</span>
                                    </div>
                                    <div className="px-2.5 py-1 rounded-lg bg-muted/60 border text-center">
                                        <span className="text-[10px] text-muted-foreground block">الموردين</span>
                                        <span className="font-bold text-foreground">{backupInfo.stats.suppliersCount}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <div className="grid gap-6 md:grid-cols-2">
                    {/* القسم 1: إنشاء النسخ الاحتياطية */}
                    <Card className="border shadow-xs flex flex-col justify-between">
                        <CardHeader>
                            <CardTitle className="text-base font-bold flex items-center gap-2">
                                <Download className="h-5 w-5 text-sky-600" />
                                1. إنشاء وتنزيل نسخة احتياطية
                            </CardTitle>
                            <CardDescription className="text-xs">
                                يمكنك تصدير كافة بيانات الجداول والعمليات بصيغة JSON شاملة وقابلة للنقل، أو حفظ نسخة أصلية (.bak) مباشرة على سيرفر SQL.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* الخيار الأول: تصدير JSON فوري */}
                            <div className="p-3.5 rounded-xl border bg-muted/30 space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs flex items-center gap-1.5">
                                        <HardDriveDownload className="h-4 w-4 text-emerald-600" />
                                        نسخة احتياطية ذكية شاملة (.json)
                                    </span>
                                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                        الموصى بها
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    تقوم بسحب كافة الـ 71 جدولاً (الأصناف، الفواتير، الحسابات، الإعدادات، والبنود) في ملف JSON موثق، وتنزيلها مباشرة إلى جهازك بنقرة زر.
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
                                    {isLoadingJsonBackup ? 'جارٍ تجميع وتجهيز الملف...' : 'تنزيل النسخة الاحتياطية الكاملة الآن'}
                                </Button>
                            </div>

                            {/* الخيار الثاني: نسخة SQL الأصلية (.BAK) */}
                            <div className="p-3.5 rounded-xl border bg-muted/30 space-y-2.5">
                                <span className="font-bold text-xs flex items-center gap-1.5">
                                    <Server className="h-4 w-4 text-sky-600" />
                                    نسخة احتياطية أصلية للسيرفر (Native SQL .BAK)
                                </span>
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
                                    disabled={isLoadingBakBackup}
                                    className="w-full h-8 text-xs font-bold gap-2 border-sky-500/30 hover:bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                >
                                    {isLoadingBakBackup ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Database className="h-3.5 w-3.5 text-sky-600" />
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
                                <Upload className="h-5 w-5 text-amber-600" />
                                2. استعادة نسخة احتياطية
                            </CardTitle>
                            <CardDescription className="text-xs">
                                يمكنك استرجاع بياناتك كاملة من أي ملف نسخة احتياطية (.json) محفوظ مسبقاً، مع معالجة وتثبيت القيود آلياً.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                                    <div className="h-10 w-10 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
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

                            {/* ملخص الفحص للملف المختار */}
                            {restoreFileSummary && (
                                <div className="p-3 rounded-xl border bg-amber-500/5 border-amber-500/20 space-y-1.5 animate-in fade-in-50">
                                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-700 dark:text-amber-400">
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

                            {/* زر الاستعادة مع نافذة تأكيد */}
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button 
                                        disabled={!parsedBackupData || isLoadingRestore}
                                        className="w-full h-9 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-2 shadow-sm"
                                    >
                                        {isLoadingRestore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                        {isLoadingRestore ? 'جارٍ استعادة البيانات إلى SQL...' : 'استعادة ملف النسخة الاحتياطية'}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="text-right" dir="rtl">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                                            <AlertTriangle className="h-5 w-5" />
                                            تأكيد استعادة النسخة الاحتياطية
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-xs space-y-2 leading-relaxed">
                                            <span>
                                                أنت على وشك استعادة <strong>{restoreFileSummary?.totalRecords}</strong> حركة وسجل عبر <strong>{restoreFileSummary?.totalTables}</strong> جدولاً في قاعدة البيانات الحالية.
                                            </span>
                                            <br />
                                            <span className="font-bold text-destructive block mt-2">
                                                ⚠️ تنبيه: سيتم استبدال البيانات المسجلة بالبيانات الواردة في ملف النسخة الاحتياطية. يرجى التأكد قبل المتابعة.
                                            </span>
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="flex-row-reverse gap-2">
                                        <AlertDialogCancel className="h-8 text-xs font-bold">إلغاء</AlertDialogCancel>
                                        <AlertDialogAction 
                                            onClick={handleRestoreConfirm}
                                            className="h-8 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
                                        >
                                            نعم، تابع الاستعادة الآن
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardContent>
                    </Card>
                </div>

                {/* القسم 3: حذف وتصفير البيانات الحساسة (إعادة ضبط المصنع) */}
                <Card className="border-destructive/40 bg-card shadow-xs">
                    <CardHeader className="border-b pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-bold text-destructive flex items-center gap-2">
                                <ShieldAlert className="h-5 w-5" />
                                3. تصفير وحذف البيانات (إعادة الضبط)
                            </CardTitle>
                            <Badge variant="outline" className="text-xs border-destructive/40 text-destructive bg-destructive/5">
                                إجراء حساس محمي بكلمة مرور
                            </Badge>
                        </div>
                        <CardDescription className="text-xs leading-relaxed mt-1">
                            يتيح لك النظام تفريغ قاعدة البيانات لبدء سنة مالية جديدة أو تصفير حركات الفروع مع التحكم الكامل فيما ترغب في الاحتفاظ به.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 space-y-5">
                        <RadioGroup 
                            value={resetType} 
                            onValueChange={(v: any) => setResetType(v)}
                            className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                            {/* الخيار أ: تصفير الحركات فقط */}
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
                                        تصفير الحركات والعمليات فقط (الموصى به)
                                    </span>
                                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                        آمن ومناسب
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    يحذف جميع فواتير المبيعات، المشتريات، المردودات، سندات الصرف والقبض، حركات المخزون، ويصفر أرصدة الخزائن والعدادات.
                                </p>
                                <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 pt-1">
                                    ✅ يتم الحفاظ التام على: الأصناف، الباركودات، التصنيفات، العملاء، الموردين، المستخدمين، الفروع، والإعدادات.
                                </div>
                            </Label>

                            {/* الخيار ب: ضبط المصنع الكامل */}
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
                                        إعادة ضبط المصنع الكاملة (مسح كل شيء)
                                    </span>
                                    <Badge variant="destructive" className="text-[10px]">
                                        شامل وتام
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    يمسح كافة الحركات بالإضافة إلى قائمة الأصناف والكتالوج بالكامل والعملاء والموردين لتهيئة النظام من نقطة الصفر.
                                </p>
                                <div className="text-[10px] font-bold text-amber-700 dark:text-amber-400 pt-1">
                                    🛡️ يتم الاحتفاظ فقط بـ: حساب المدير، الأدوار والصلاحيات، الفرع الرئيسي، وإعدادات النظام الأساسية.
                                </div>
                            </Label>
                        </RadioGroup>

                        {/* نافذة التأكيد المحمية بكلمة مرور */}
                        <div className="pt-2 flex justify-end">
                            <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                                <AlertDialogTrigger asChild>
                                    <Button 
                                        variant="destructive" 
                                        className="h-9 px-5 text-xs font-bold gap-2 shadow-xs"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        متابعة إجراء حذف البيانات المحددة
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="text-right" dir="rtl">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                                            <AlertTriangle className="h-5 w-5" />
                                            تأكيد إذن حذف البيانات (يلزم كلمة مرور الإدارة)
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-xs space-y-3 leading-relaxed">
                                            <span>
                                                النوع المختار: <strong className="text-foreground">
                                                    {resetType === 'transactions_only' ? 'تصفير الحركات والعمليات المالية والمخزنية فقط' : 'إعادة ضبط المصنع الكاملة'}
                                                </strong>
                                            </span>
                                            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px] font-medium leading-relaxed">
                                                ⚠️ هذا الإجراء لا يمكن التراجع عنه بأي شكل! يُنصح بشدة بأخذ نسخة احتياطية أولاً قبل تنفيذ هذا الإجراء.
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
                                                    className="h-8 text-xs bg-background"
                                                    autoFocus
                                                />
                                            </div>
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="flex-row-reverse gap-2">
                                        <AlertDialogCancel className="h-8 text-xs font-bold">إلغاء</AlertDialogCancel>
                                        <AlertDialogAction 
                                            onClick={handleExecuteReset}
                                            disabled={!adminPassword.trim() || isLoadingReset}
                                            className="h-8 text-xs font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-1.5"
                                        >
                                            {isLoadingReset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                            {isLoadingReset ? 'جارٍ تنفيذ الحذف والتصفير...' : 'تأكيد وحذف البيانات الآن'}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
