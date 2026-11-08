"use client";

import React, { useState, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/data-provider";
import { 
    Server, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, 
    Database, Network, ArrowUpRight, ArrowDownLeft, Clock, Zap, Loader2, Save
} from "lucide-react";
import { CentralSyncConfig } from '@/lib/central-sync';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

    const [pendingCount, setPendingCount] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isTesting, setIsTesting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; serverVersion?: string; error?: string } | null>(null);

    // Fetch initial settings from API
    const loadSettings = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/sync/central');
            const data = await res.json();
            if (data.success && data.config) {
                setConfig(data.config);
                setPendingCount(data.pendingCount || 0);
            }
        } catch (err: any) {
            console.error('Error loading central sync config:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

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
                title: "خطأ في الشبكة",
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
                    title: "تم حفظ الإعدادات",
                    description: "تم تحديث بيانات السيرفر المركزي وهوية الفرع بنجاح."
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
                await loadSettings();
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

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <>
            <PageHeader title="إعدادات المزامنة والسيرفر المركزي">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={isTesting}>
                        {isTesting ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Zap className="h-4 w-4 ml-1 text-amber-500" />}
                        اختبار الاتصال
                    </Button>
                    <Button 
                        size="sm" 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
                        onClick={handleSyncNow}
                        disabled={isSyncing}
                    >
                        {isSyncing ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <RefreshCw className="h-4 w-4 ml-1" />}
                        مزامنة البيانات الآن
                    </Button>
                </div>
            </PageHeader>

            <main className="flex flex-1 flex-col gap-6 p-4 md:gap-8 md:p-6 max-w-6xl mx-auto w-full">
                {/* Health & Status Banners */}
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
                                    <div className="flex items-center gap-2">
                                        <Badge className="bg-green-600 text-white gap-1"><CheckCircle2 className="h-3.5 w-3.5"/> متصل بالسيرفر</Badge>
                                        <span className="text-xs text-muted-foreground font-mono font-bold">{testResult.latencyMs}ms</span>
                                    </div>
                                ) : (
                                    <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3.5 w-3.5"/> غير متصل</Badge>
                                )
                            ) : (
                                <Badge variant="outline" className="text-muted-foreground">اضغط اختبار الاتصال للتحقق</Badge>
                            )}
                            <p className="text-xs text-muted-foreground mt-2 truncate">
                                السيرفر: {config.centralServerIp}:{config.centralSqlPort}
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
                                {pendingCount.toLocaleString()} حركة
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {pendingCount > 0 ? 'تنتظر الرفع والمزامنة مع الإدارة المركزية' : 'كافة حركات الفرع متزامنة تماماً'}
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
                                <span className="flex items-center gap-1 text-emerald-600 font-semibold"><ArrowUpRight className="h-3 w-3"/> رفع: {config.lastPushedCount || 0}</span>
                                <span className="flex items-center gap-1 text-blue-600 font-semibold"><ArrowDownLeft className="h-3 w-3"/> تنزيل: {config.lastPulledCount || 0}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Local Branch Identity */}
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
                                    تم تفعيل مشغلات SQL التلقائية لحقن كود الفرع (<code className="font-mono">{config.currentBranchCode}</code>) واسمه في جميع جداول النظام الـ 69 تلقائياً.
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

                {/* Automation & Save */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <RefreshCw className="h-5 w-5 text-emerald-600" />
                                3. جدولة المزامنة التلقائية والتحكم
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 border rounded-xl bg-background">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-bold">تشغيل المزامنة التلقائية الدورية</Label>
                                <p className="text-xs text-muted-foreground">
                                    يقوم النظام برفع الحركات الجديدة وسحب تحديثات الأصناف تلقائياً في الخلفية.
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
                    </CardContent>
                    <CardFooter className="flex justify-between items-center bg-muted/30 border-t py-4">
                        <Button variant="outline" onClick={handleTestConnection} disabled={isTesting}>
                            {isTesting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Zap className="h-4 w-4 ml-2 text-amber-500" />}
                            اختبار الاتصال بالسيرفر المركزي
                        </Button>

                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={handleSave} disabled={isSaving}>
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
                                حفظ الإعدادات
                            </Button>
                            <Button 
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
                                onClick={handleSyncNow}
                                disabled={isSyncing}
                            >
                                {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                مزامنة البيانات الآن
                            </Button>
                        </div>
                    </CardFooter>
                </Card>
            </main>
        </>
    );
}
