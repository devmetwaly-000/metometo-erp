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
import { 
    ShieldCheck, 
    Lock, 
    Search, 
    RefreshCw, 
    Filter, 
    Printer, 
    FileSpreadsheet, 
    AlertCircle, 
    CheckCircle2, 
    User, 
    Clock, 
    Eye,
    Hash
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import * as XLSX from 'xlsx';

export default function AuditTrailPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [actionFilter, setActionFilter] = useState("all");
    const [selectedLog, setSelectedLog] = useState<any | null>(null);

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

    useEffect(() => {
        fetchLogs();
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

    const exportToExcel = () => {
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

    const getActionBadge = (action: string) => {
        switch (action) {
            case 'INSERT': return <Badge className="bg-emerald-600 text-white">إضافة جديدة</Badge>;
            case 'UPDATE': return <Badge className="bg-blue-600 text-white">تعديل بيانات</Badge>;
            case 'DELETE': return <Badge className="bg-red-600 text-white">حذف</Badge>;
            case 'POST': return <Badge className="bg-purple-600 text-white">ترحيل قيد</Badge>;
            case 'APPROVE': return <Badge className="bg-indigo-600 text-white">اعتماد</Badge>;
            case 'DEPRECIATE': return <Badge className="bg-amber-600 text-white">إهلاك أصول</Badge>;
            case 'PUTAWAY': return <Badge className="bg-teal-600 text-white">تسكين مخزني</Badge>;
            default: return <Badge variant="secondary">{action}</Badge>;
        }
    };

    return (
        <>
            <PageHeader title="سجل التدقيق الرقابي غير القابل للتعديل (Immutable Audit Trail)">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="gap-1.5">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        تحديث
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-1.5">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        تصدير إكسيل
                    </Button>
                    <Button size="sm" onClick={() => window.print()} className="gap-1.5">
                        <Printer className="h-4 w-4" />
                        طباعة
                    </Button>
                </div>
            </PageHeader>

            <main className="flex-1 p-4 md:p-6 space-y-6 printable-area">
                {/* Security Guarantee Notice */}
                <div className="rounded-xl border bg-card p-4 shadow-sm border-primary/20 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
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
                                                    <Eye className="h-4 w-4 text-blue-500" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Log Details Modal */}
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
            </main>
        </>
    );
}

