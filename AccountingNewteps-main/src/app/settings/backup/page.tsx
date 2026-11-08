

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
import { Download, Upload, Loader2, AlertTriangle, History, RefreshCcw, HardDriveDownload } from "lucide-react";
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

export default function BackupPage() {
    const { toast } = useToast();
    const { allData, loading: dataLoading, dbAction, isOnline } = useData();
    const [isLoadingBackup, setIsLoadingBackup] = useState(false);
    const [isLoadingRestore, setIsLoadingRestore] = useState(false);
    const [isLoadingReset, setIsLoadingReset] = useState(false);
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [lastDataState, setLastDataState] = useState("");
    const [lastModified, setLastModified] = useState<Date | null>(null);

    React.useEffect(() => {
        const currentDataState = JSON.stringify(allData);
        if (allData && Object.keys(allData).length > 0 && currentDataState !== lastDataState) {
            setLastDataState(currentDataState);
            setLastModified(new Date());
        }
    }, [allData, lastDataState]);

    const handleBackup = async () => {
        setIsLoadingBackup(true);
        try {
            const res = await fetch('/api/db/sync');
            const result = await res.json();

            if (result.success && result.data) {
                const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
                    JSON.stringify(result.data, null, 2)
                )}`;
                const link = document.createElement("a");
                link.href = jsonString;
                const date = new Date().toISOString().split('T')[0];
                link.download = `multibranch-sql-backup-${date}.json`;
                link.click();
                toast({ title: "تم بنجاح", description: "تم تنزيل ملف النسخة الاحتياطية من SQL Server بنجاح." });
            } else {
                toast({ variant: "destructive", title: "خطأ", description: "لا توجد بيانات لإنشاء نسخة احتياطية." });
            }
        } catch (error) {
            console.error("Backup failed:", error);
            toast({ variant: "destructive", title: "خطأ", description: "فشل إنشاء النسخة الاحتياطية." });
        } finally {
            setIsLoadingBackup(false);
        }
    };
    
    const handleLocalExport = () => {
        if (dataLoading || !allData || Object.keys(allData).length === 0) {
            toast({ variant: "destructive", title: "لا توجد بيانات", description: "لا توجد بيانات محلية لتصديرها." });
            return;
        }
        try {
            const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
                JSON.stringify(allData, null, 2)
            )}`;
            const link = document.createElement("a");
            link.href = jsonString;
            const date = new Date().toISOString().split('T')[0];
            link.download = `local-data-export-${date}.json`;
            link.click();
            toast({ title: "تم بنجاح", description: "تم تصدير البيانات المخزنة محليًا." });
        } catch (error) {
            console.error("Local export failed:", error);
            toast({ variant: "destructive", title: "خطأ", description: "فشل تصدير البيانات المحلية." });
        }
    };


    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setRestoreFile(event.target.files[0]);
        }
    };

    const handleRestore = async () => {
        if (!restoreFile) {
            toast({ variant: "destructive", title: "خطأ", description: "يرجى تحديد ملف لاستعادته." });
            return;
        }

        setIsLoadingRestore(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') {
                    throw new Error("فشل قراءة الملف");
                }
                const data = JSON.parse(text);
                toast({ title: "تم الاستلام", description: "جاري استعادة البيانات إلى SQL Server..." });
                setRestoreFile(null);
                const fileInput = document.getElementById('restore-file') as HTMLInputElement;
                if (fileInput) fileInput.value = '';
            } catch (error) {
                console.error("Restore failed:", error);
                toast({ variant: "destructive", title: "خطأ في الاستعادة", description: "الملف غير صالح." });
            } finally {
                setIsLoadingRestore(false);
            }
        };
        reader.readAsText(restoreFile);
    };
    
    const handleFactoryReset = async () => {
        setIsLoadingReset(true);
        try {
             const allPaths = Object.keys(allData);
             const pathsToKeep = new Set(['users', 'roles', 'warehouses', 'settings', 'cashAccounts', 'licenses', 'posTerminals']);
             const pathsToClear = allPaths.filter(p => !pathsToKeep.has(p));

            for (const path of pathsToClear) {
                await dbAction(path, 'remove', { root: true });
            }
            
            // Reset counters including batch counters
            await dbAction('counters', 'remove', { root: true });

            // Reset all cash accounts balances to zero
            if (allData.cashAccounts) {
                for (const id of Object.keys(allData.cashAccounts)) {
                    await dbAction('cashAccounts', 'update', { id, data: { openingBalance: 0 } });
                }
            }


            toast({ title: "تمت إعادة الضبط بنجاح!", description: "تم حذف البيانات الحركية والبدء من جديد." });

        } catch (error) {
            console.error("Factory reset failed:", error);
            toast({ variant: "destructive", title: "خطأ", description: "فشلت عملية إعادة الضبط." });
        } finally {
            setIsLoadingReset(false);
        }
    };


  return (
    <>
      <PageHeader title="النسخ الاحتياطي والاستعادة" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>إنشاء نسخة احتياطية</CardTitle>
                    <CardDescription>
                        تنزيل نسخة كاملة من جميع بياناتك. احتفظ بهذا الملف في مكان آمن.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4">
                    <Button onClick={handleBackup} disabled={isLoadingBackup || dataLoading || !isOnline}>
                        {isLoadingBackup || (dataLoading && isOnline) ? (
                            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="ml-2 h-4 w-4" />
                        )}
                        {isLoadingBackup ? 'جارٍ الإنشاء...' : (dataLoading && isOnline ? 'جاري فحص البيانات...' : 'نسخ احتياطي من السحابة')}
                    </Button>
                     <Button onClick={handleLocalExport} variant="secondary" disabled={dataLoading}>
                        <HardDriveDownload className="ml-2 h-4 w-4" />
                        تصدير البيانات المحلية
                    </Button>
                </CardContent>
                 <CardFooter>
                    {dataLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (lastModified &&
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <History className="h-4 w-4" />
                            <span>آخر تعديل على البيانات: {lastModified.toLocaleString('ar-EG')}</span>
                        </div>
                    )}
                </CardFooter>
            </Card>

            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="text-destructive flex items-center gap-2">
                        <AlertTriangle />
                        استعادة نسخة احتياطية
                    </CardTitle>
                    <CardDescription>
                       سيؤدي هذا الإجراء إلى مسح جميع البيانات الحالية واستبدالها بالبيانات من الملف الذي تم تحميله. لا يمكن التراجع عن هذا الإجراء.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="restore-file">ملف النسخة الاحتياطية (.json)</Label>
                        <Input id="restore-file" type="file" accept=".json" onChange={handleFileChange} />
                    </div>
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                             <Button variant="destructive" disabled={!restoreFile || isLoadingRestore}>
                                {isLoadingRestore ? (
                                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Upload className="ml-2 h-4 w-4" />
                                )}
                                {isLoadingRestore ? 'جارٍ الاستعادة...' : 'استعادة البيانات'}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                            <AlertDialogDescription>
                                هذا الإجراء سيقوم بحذف جميع البيانات الحالية بشكل دائم واستبدالها بالبيانات من الملف المحدد. لا يمكن التراجع عن هذا الإجراء.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            <AlertDialogAction onClick={handleRestore} className="bg-destructive hover:bg-destructive/90">نعم، أفهم المخاطر، قم بالاستعادة</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardContent>
            </Card>
            
            <Card className="border-destructive md:col-span-2">
                <CardHeader>
                    <CardTitle className="text-destructive flex items-center gap-2">
                        <AlertTriangle />
                        إعادة ضبط المصنع (حذف البيانات)
                    </CardTitle>
                    <CardDescription>
                        سيقوم هذا الإجراء بحذف جميع البيانات الحركية (فواتير، سندات، حركات مخزون...) وتصفير الأرصدة والعدادات.
                        <br/>
                        <span className="font-bold">سيتم الاحتفاظ بـ: </span> المستخدمين، الصلاحيات، الفروع، الخزائن، ونقاط البيع، والإعدادات.
                    </CardDescription>
                </CardHeader>
                <CardFooter>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={isLoadingReset}>
                                {isLoadingReset ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="ml-2 h-4 w-4" />}
                                {isLoadingReset ? 'جارٍ الحذف...' : 'إعادة ضبط بيانات المصنع'}
                            </Button>
                        </AlertDialogTrigger>
                         <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>تنبيه أخير! هل أنت متأكد تمامًا؟</AlertDialogTitle>
                            <AlertDialogDescription>
                                أنت على وشك حذف جميع بياناتك الحركية والبدء من جديد. لا يمكن التراجع عن هذا الإجراء مطلقًا.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction onClick={handleFactoryReset} className="bg-destructive hover:bg-destructive/90">نعم، قم بإعادة الضبط</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardFooter>
            </Card>
        </div>
      </main>
    </>
  );
}
