"use client";

import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
    ShieldCheck, 
    Lock, 
    Search, 
    RefreshCw, 
    Filter, 
    FileSpreadsheet, 
    AlertCircle, 
    CheckCircle2, 
    User, 
    Eye,
    Bug,
    Terminal,
    AlertTriangle,
    Database
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as XLSX from 'xlsx';

export default function AuditTrailPage() {
    const [activeTab, setActiveTab] = useState<'audit' | 'errors'>('audit');

    // Audit Trail State
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [actionFilter, setActionFilter] = useState("all");
    const [selectedLog, setSelectedLog] = useState<any | null>(null);

    // System Errors State
    const [errorLogs, setErrorLogs] = useState<any[]>([]);
    const [loadingErrors, setLoadingErrors] = useState(false);
    const [errorSearchTerm, setErrorSearchTerm] = useState("");
    const [errorSourceFilter, setErrorSourceFilter] = useState("all");
    const [selectedError, setSelectedError] = useState<any | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/audit-trail');
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs || []);
            }
        } catch (e) {
            console.error("Failed to fetch audit logs", e);
        } finally {
            setLoading(false);
        }
    };

    const fetchErrorLogs = async () => {
        setLoadingErrors(true);
        try {
            const res = await fetch('/api/system/log-error?limit=250');
            if (res.ok) {
                const data = await res.json();
                setErrorLogs(data.errors || []);
            }
        } catch (e) {
            console.error("Failed to fetch error logs", e);
        } finally {
            setLoadingErrors(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        fetchErrorLogs();
    }, []);

    const filteredLogs = useMemo(() => {
        return logs.filter((log: any) => {
            const matchesSearch = 
                !searchTerm ||
                log.UserName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.Entity?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.Details?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.EntityId?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesAction = actionFilter === "all" || log.Action === actionFilter;

            return matchesSearch && matchesAction;
        });
    }, [logs, searchTerm, actionFilter]);

    const filteredErrors = useMemo(() => {
        return errorLogs.filter((err: any) => {
            const matchesSearch = 
                !errorSearchTerm ||
                err.ErrorMessage?.toLowerCase().includes(errorSearchTerm.toLowerCase()) ||
                err.Source?.toLowerCase().includes(errorSearchTerm.toLowerCase()) ||
                err.Action?.toLowerCase().includes(errorSearchTerm.toLowerCase()) ||
                err.UserName?.toLowerCase().includes(errorSearchTerm.toLowerCase()) ||
                err.Id?.toLowerCase().includes(errorSearchTerm.toLowerCase());

            const matchesSource = errorSourceFilter === "all" || err.Source === errorSourceFilter;

            return matchesSearch && matchesSource;
        });
    }, [errorLogs, errorSearchTerm, errorSourceFilter]);

    const exportAuditToExcel = () => {
        const wb = XLSX.utils.book_new();
        const rows = [
            ["التاريخ والوقت", "المستخدم", "نوع الإجراء", "الشاشة / الكيان", "رقم الكيان", "التفاصيل", "عنوان IP", "بصمة التشفير (SHA-256)"]
        ];
        filteredLogs.forEach((l: any) => {
            rows.push([
                new Date(l.Timestamp).toLocaleString('ar-EG'),
                l.UserName || 'النظام',
                l.Action,
                l.Entity,
                l.EntityId || '',
                l.Details || '',
                l.IpAddress || '',
                l.Hash || ''
            ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "سجل التدقيق الرقابي");
        XLSX.writeFile(wb, `Audit_Trail_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const exportErrorsToExcel = () => {
        const wb = XLSX.utils.book_new();
        const rows = [
            ["المعرف", "التاريخ والوقت", "المصدر", "الإجراء", "رسالة الخطأ", "كود الخطأ", "المستخدم", "الفرع", "IP", "المسار البرمجي"]
        ];
        filteredErrors.forEach((e: any) => {
            rows.push([
                e.Id,
                new Date(e.Timestamp).toLocaleString('ar-EG'),
                e.Source,
                e.Action || '',
                e.ErrorMessage,
                e.ErrorCode || e.StatusCode || '',
                e.UserName || '',
                e.BranchCode || '',
                e.IpAddress || '',
                e.ErrorStack || ''
            ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "سجل أخطاء النظام");
        XLSX.writeFile(wb, `System_Errors_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const getActionBadge = (action: string) => {
        switch (action) {
            case 'INSERT': return <Badge className="bg-emerald-600 text-white">إضافة جديدة</Badge>;
            case 'UPDATE': return <Badge className="bg-blue-600 text-white">تعديل بيانات</Badge>;
            case 'DELETE': return <Badge className="bg-red-600 text-white">حذف</Badge>;
            case 'POST': return <Badge className="bg-primary text-primary-foreground">ترحيل قيد</Badge>;
            case 'APPROVE': return <Badge className="bg-indigo-600 text-white">اعتماد</Badge>;
            case 'DEPRECIATE': return <Badge className="bg-amber-600 text-white">إهلاك أصول</Badge>;
            case 'PUTAWAY': return <Badge className="bg-teal-600 text-white">تسكين مخزني</Badge>;
            default: return <Badge variant="secondary">{action}</Badge>;
        }
    };

    return (
        <>
            <PageHeader
                title="سجل الرقابة وتتبع أخطاء النظام"
                description="متابعة الحركات المحاسبية والرقابية بالإضافة إلى سجل تتبع وتشخيص أخطاء SQL والنظام"
            >
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={activeTab === 'audit' ? fetchLogs : fetchErrorLogs} className="gap-1.5">
                        <RefreshCw className={`h-4 w-4 ${(loading || loadingErrors) ? 'animate-spin' : ''}`} />
                        تحديث
                    </Button>
                    <Button variant="outline" size="sm" onClick={activeTab === 'audit' ? exportAuditToExcel : exportErrorsToExcel} className="gap-1.5">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        تصدير Excel
                    </Button>
                </div>
            </PageHeader>

            <main className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
                <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)}>
                    <TabsList className="grid grid-cols-2 max-w-md mb-2">
                        <TabsTrigger value="audit" className="gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                            سجل التدقيق الرقابي
                        </TabsTrigger>
                        <TabsTrigger value="errors" className="gap-2">
                            <Bug className="h-4 w-4 text-destructive" />
                            سجل أخطاء SQL والنظام
                            {errorLogs.length > 0 && (
                                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                                    {errorLogs.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Audit Trail */}
                    <TabsContent value="audit" className="space-y-4 mt-0">
                        {/* Summary Header */}
                        <div className="p-4 rounded-xl border bg-card/60 backdrop-blur-sm flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                                    <ShieldCheck className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base flex items-center gap-2">
                                        نظام التسجيل الرقابي المشفر المقفل (Append-Only Cryptographic Log)
                                        <Badge variant="outline" className="text-xs border-emerald-500 text-emerald-600 font-mono">
                                            SHA-256 Verified
                                        </Badge>
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        كافة الحركات والعمليات المالية والمخزنية تُسجل تلقائياً ببصمة تجزئة مشفرة غير قابلة للتعديل أو المسح لتلبية معايير الحوكمة والمراجعة القانونية.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                                <span>إجمالي العمليات: <strong className="text-foreground">{logs.length}</strong></span>
                            </div>
                        </div>

                        {/* Filters */}
                        <Card className="no-print">
                            <CardHeader className="py-3">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                    <Filter className="h-4 w-4" />
                                    فلاتر البحث السريع
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">بحث بنص البيان أو المستخدم أو المعرف</Label>
                                    <div className="relative">
                                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            placeholder="ابحث بالاسم، المعرف، الكيان..." 
                                            className="pr-9 h-9" 
                                            value={searchTerm} 
                                            onChange={e => setSearchTerm(e.target.value)} 
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">تصفية بنوع الإجراء</Label>
                                    <Select value={actionFilter} onValueChange={setActionFilter}>
                                        <SelectTrigger className="h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">كل الإجراءات</SelectItem>
                                            <SelectItem value="INSERT">إضافة جديدة (INSERT)</SelectItem>
                                            <SelectItem value="UPDATE">تعديل بيانات (UPDATE)</SelectItem>
                                            <SelectItem value="DELETE">حذف (DELETE)</SelectItem>
                                            <SelectItem value="POST">ترحيل قيد (POST)</SelectItem>
                                            <SelectItem value="APPROVE">اعتماد (APPROVE)</SelectItem>
                                            <SelectItem value="DEPRECIATE">إهلاك أصول (DEPRECIATE)</SelectItem>
                                            <SelectItem value="PUTAWAY">تسكين مخزني (PUTAWAY)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Logs Table */}
                        <Card>
                            <CardHeader className="py-3 flex flex-row items-center justify-between">
                                <CardTitle className="text-base font-bold">سجلات التدقيق الرقابي</CardTitle>
                                <Badge variant="outline" className="font-mono text-xs">{filteredLogs.length} سجل مطابق</Badge>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="text-right w-44">الوقت والتاريخ</TableHead>
                                            <TableHead className="text-right">المستخدم</TableHead>
                                            <TableHead className="text-center w-28">نوع الإجراء</TableHead>
                                            <TableHead className="text-right">الشاشة / الكيان</TableHead>
                                            <TableHead className="text-right">التفاصيل والبيان</TableHead>
                                            <TableHead className="text-center w-28">بصمة التشفير</TableHead>
                                            <TableHead className="text-center w-16">عرض</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">جاري تحميل السجلات الرقابية...</TableCell>
                                            </TableRow>
                                        ) : filteredLogs.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">لا توجد حركات مسجلة تطابق شروط الفلترة الحالية.</TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredLogs.map((log: any) => (
                                                <TableRow key={log.Id} className="hover:bg-muted/20">
                                                    <TableCell className="text-right font-mono text-xs">
                                                        {new Date(log.Timestamp).toLocaleString('ar-EG')}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        <div className="flex items-center gap-1.5">
                                                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                                                            <span>{log.UserName || 'النظام'}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {getActionBadge(log.Action)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs text-primary">
                                                        {log.Entity}
                                                    </TableCell>
                                                    <TableCell className="text-right text-xs">
                                                        <span className="line-clamp-1">{log.Details || '---'}</span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {log.Hash ? (
                                                            <Badge variant="outline" className="font-mono text-[10px] gap-1 max-w-[90px] truncate" title={log.Hash}>
                                                                <Lock className="h-2.5 w-2.5 text-emerald-600" />
                                                                {log.Hash.slice(0, 8)}...
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">---</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedLog(log)}>
                                                            <Eye className="h-4 w-4 text-foreground" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Tab 2: System Error Logs */}
                    <TabsContent value="errors" className="space-y-4 mt-0">
                        {/* Errors Header */}
                        <div className="p-4 rounded-xl border bg-destructive/5 border-destructive/20 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0 border border-destructive/20">
                                    <Database className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base flex items-center gap-2">
                                        سجل تتبع أخطاء SQL والنظام (dbo.SystemErrorLogs)
                                        <Badge variant="outline" className="text-xs border-destructive/40 text-destructive font-mono">
                                            SQL Server Live Trace
                                        </Badge>
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        يتم توثيق أي خطأ في قاعدة البيانات، المزامنة، أو العمليات الحسابية تلقائياً بمساره البرمجي وبيانات الطلب لضمان سرعة التشخيص والمعالجة الدائمة.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                                <span>إجمالي الأخطاء: <strong className="text-destructive font-bold">{errorLogs.length}</strong></span>
                            </div>
                        </div>

                        {/* Error Filters */}
                        <Card className="no-print">
                            <CardHeader className="py-3">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                    <Filter className="h-4 w-4" />
                                    تصفية الأخطاء
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                                <div className="space-y-1.5 md:col-span-2">
                                    <Label className="text-xs">بحث بنص الخطأ أو الإجراء أو المستخدم أو الكود</Label>
                                    <div className="relative">
                                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            placeholder="ابحث بنص الخطأ، كود الخطأ، الشاشة..." 
                                            className="pr-9 h-9" 
                                            value={errorSearchTerm} 
                                            onChange={e => setErrorSearchTerm(e.target.value)} 
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">تصفية بمصدر الخطأ</Label>
                                    <Select value={errorSourceFilter} onValueChange={setErrorSourceFilter}>
                                        <SelectTrigger className="h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">كل المصادر</SelectItem>
                                            <SelectItem value="API:db/action">عمليات البيانات (API:db/action)</SelectItem>
                                            <SelectItem value="API:db/sync">المزامنة الشاملة (API:db/sync)</SelectItem>
                                            <SelectItem value="Client:dbAction">أخطاء واجهة المستخدم (Client:dbAction)</SelectItem>
                                            <SelectItem value="Client:Global">أخطاء المتصفح العامة</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Errors Table */}
                        <Card>
                            <CardHeader className="py-3 flex flex-row items-center justify-between">
                                <CardTitle className="text-base font-bold">الأخطاء المسجلة في جدول SQL</CardTitle>
                                <Badge variant="outline" className="font-mono text-xs">{filteredErrors.length} خطأ مطابق</Badge>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="text-right w-44">الوقت والتاريخ</TableHead>
                                            <TableHead className="text-right w-36">المصدر</TableHead>
                                            <TableHead className="text-right w-40">الإجراء / الشاشة</TableHead>
                                            <TableHead className="text-right">رسالة الخطأ (Error Message)</TableHead>
                                            <TableHead className="text-center w-24">كود الخطأ</TableHead>
                                            <TableHead className="text-right w-32">المستخدم</TableHead>
                                            <TableHead className="text-center w-16">عرض</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loadingErrors ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">جاري فحص وتحديث سجل أخطاء SQL...</TableCell>
                                            </TableRow>
                                        ) : filteredErrors.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-12 text-emerald-600">
                                                    <div className="flex flex-col items-center justify-center gap-2">
                                                        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                                                        <span>لا توجد أي أخطاء مسجلة حالياً! النظام يعمل بكفاءة تامة.</span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredErrors.map((err: any) => (
                                                <TableRow key={err.Id} className="hover:bg-muted/20">
                                                    <TableCell className="text-right font-mono text-xs">
                                                        {new Date(err.Timestamp).toLocaleString('ar-EG')}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant="outline" className="font-mono text-[11px]">
                                                            {err.Source}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs text-primary">
                                                        {err.Action || err.Endpoint || '---'}
                                                    </TableCell>
                                                    <TableCell className="text-right text-xs">
                                                        <span className="font-mono text-destructive font-semibold line-clamp-1">
                                                            {err.ErrorMessage}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono text-xs">
                                                        <Badge variant="secondary" className="font-mono text-[10px]">
                                                            {err.ErrorCode || err.StatusCode || '500'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right text-xs">
                                                        {err.UserName || '---'}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => setSelectedError(err)}>
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* Audit Log Details Modal */}
                {selectedLog && (
                    <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
                        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <ShieldCheck className="h-5 w-5 text-primary" />
                                    تفاصيل القيد الرقابي #{selectedLog.Id}
                                </DialogTitle>
                                <DialogDescription>
                                    تاريخ التسجيل: {new Date(selectedLog.Timestamp).toLocaleString('ar-EG')}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 pt-2 text-sm">
                                <div className="grid grid-cols-2 gap-4 p-3 rounded-lg border bg-muted/20">
                                    <div>
                                        <span className="text-xs text-muted-foreground">المستخدم المنفذ:</span>
                                        <p className="font-semibold">{selectedLog.UserName} (ID: {selectedLog.UserId || 'System'})</p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">نوع الإجراء:</span>
                                        <div>{getActionBadge(selectedLog.Action)}</div>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">الشاشة / الكيان:</span>
                                        <p className="font-mono font-bold text-primary">{selectedLog.Entity}</p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">عنوان IP:</span>
                                        <p className="font-mono">{selectedLog.IpAddress || 'Local'}</p>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <span className="text-xs text-muted-foreground">بيان العملية:</span>
                                    <p className="p-2.5 rounded border bg-background text-xs font-mono">{selectedLog.Details || 'بدون تفاصيل إضافية'}</p>
                                </div>

                                {selectedLog.Hash && (
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">بصمة التجزئة المشفرة (SHA-256 Hash):</span>
                                        <p className="p-2 rounded bg-muted/40 font-mono text-[11px] break-all border text-emerald-600 dark:text-emerald-400">
                                            {selectedLog.Hash}
                                        </p>
                                    </div>
                                )}

                                {selectedLog.PreviousState && (
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">الحالة السابقة قبل التعديل:</span>
                                        <pre className="p-2.5 rounded bg-muted/30 font-mono text-xs overflow-x-auto max-h-36">
                                            {selectedLog.PreviousState}
                                        </pre>
                                    </div>
                                )}

                                {selectedLog.NewState && (
                                    <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">الحالة الجديدة بعد التعديل:</span>
                                        <pre className="p-2.5 rounded bg-muted/30 font-mono text-xs overflow-x-auto max-h-36">
                                            {selectedLog.NewState}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                )}

                {/* Error Details Modal */}
                {selectedError && (
                    <Dialog open={!!selectedError} onOpenChange={() => setSelectedError(null)}>
                        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-destructive">
                                    <AlertTriangle className="h-5 w-5" />
                                    تفاصيل خطأ النظام #{selectedError.Id}
                                </DialogTitle>
                                <DialogDescription>
                                    التوقيت: {new Date(selectedError.Timestamp).toLocaleString('ar-EG')}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 pt-2 text-sm">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 rounded-lg border bg-muted/20">
                                    <div>
                                        <span className="text-xs text-muted-foreground">المصدر:</span>
                                        <p className="font-mono font-bold text-xs">{selectedError.Source}</p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">الإجراء:</span>
                                        <p className="font-mono text-xs">{selectedError.Action || '---'}</p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">كود الخطأ:</span>
                                        <p className="font-mono text-xs text-destructive font-bold">{selectedError.ErrorCode || selectedError.StatusCode || '500'}</p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">المستخدم:</span>
                                        <p className="text-xs">{selectedError.UserName || '---'} ({selectedError.UserId || 'none'})</p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">الفرع:</span>
                                        <p className="text-xs font-mono">{selectedError.BranchCode || selectedError.WarehouseId || '---'}</p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">عنوان IP:</span>
                                        <p className="font-mono text-xs">{selectedError.IpAddress || 'Local'}</p>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <span className="text-xs font-semibold text-destructive">نص رسالة الخطأ (Error Message):</span>
                                    <div className="p-3 rounded border bg-destructive/10 text-destructive text-xs font-mono whitespace-pre-wrap break-all">
                                        {selectedError.ErrorMessage}
                                    </div>
                                </div>

                                {selectedError.RequestPayload && (
                                    <div className="space-y-1">
                                        <span className="text-xs font-semibold text-muted-foreground">بيانات الطلب المرسلة (Request Payload):</span>
                                        <pre className="p-3 rounded bg-muted/40 font-mono text-xs overflow-x-auto max-h-48 border">
                                            {typeof selectedError.RequestPayload === 'object' ? JSON.stringify(selectedError.RequestPayload, null, 2) : selectedError.RequestPayload}
                                        </pre>
                                    </div>
                                )}

                                {selectedError.ErrorStack && (
                                    <div className="space-y-1">
                                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                                            <Terminal className="h-3.5 w-3.5" />
                                            المسار البرمجي للخطأ (Stack Trace):
                                        </span>
                                        <pre className="p-3 rounded bg-neutral-900 text-neutral-200 font-mono text-[11px] overflow-x-auto max-h-60 border" dir="ltr">
                                            {selectedError.ErrorStack}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                )}
            </main>
        </>
    );
}
