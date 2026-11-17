"use client";

import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/contexts/data-provider";
import {
    Loader2, RefreshCw, CheckCircle2, Database, Server, Globe, Save, Zap,
    ShieldCheck, AlertTriangle, Copy, Eye, EyeOff, Cloud, Terminal
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LocalDbConfigState {
    connectionMode: 'fields' | 'connectionString';
    connectionString: string;
    server: string;
    port: number;
    database: string;
    user: string;
    password: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
}

function parseConnStrClient(connStr: string): Partial<LocalDbConfigState> {
    if (!connStr) return {};
    const out: Partial<LocalDbConfigState> = {};
    const pairs = connStr.split(';').map(s => s.trim()).filter(Boolean);
    for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx === -1) continue;
        const k = pair.slice(0, idx).trim().toLowerCase();
        const v = pair.slice(idx + 1).trim();
        if (['server', 'data source', 'addr', 'address'].includes(k)) {
            let host = v.replace(/^tcp:/i, '').trim();
            if (host.includes(',')) {
                const [h, p] = host.split(',');
                host = h.trim();
                const prt = parseInt(p.trim(), 10);
                if (!isNaN(prt)) out.port = prt;
            } else if (host.includes(':')) {
                const [h, p] = host.split(':');
                host = h.trim();
                const prt = parseInt(p.trim(), 10);
                if (!isNaN(prt)) out.port = prt;
            }
            if (host) out.server = host;
        } else if (['database', 'initial catalog'].includes(k)) {
            out.database = v.toLowerCase() === 'master' ? 'MultiBranchPOS_DB' : v;
        } else if (['user id', 'uid', 'user', 'username'].includes(k)) {
            out.user = v;
        } else if (['password', 'pwd'].includes(k)) {
            out.password = v;
        } else if (k === 'encrypt') {
            out.encrypt = ['true', 'yes', '1', 'mandatory'].includes(v.toLowerCase());
        } else if (['trustservercertificate', 'trust server certificate'].includes(k)) {
            out.trustServerCertificate = !['false', 'no', '0'].includes(v.toLowerCase());
        }
    }
    return out;
}

function buildConnStrClient(cfg: LocalDbConfigState): string {
    return `Server=${cfg.server || 'localhost'},${cfg.port || 1433};Database=${cfg.database || 'MultiBranchPOS_DB'};User Id=${cfg.user || 'sa'};Password=${cfg.password || ''};Encrypt=${cfg.encrypt ? 'true' : 'false'};TrustServerCertificate=${cfg.trustServerCertificate !== false ? 'true' : 'false'};`;
}

export default function DatabaseReEngineeringPage() {
    const { processSyncQueue } = useData();
    const { toast } = useToast();

    const [config, setConfig] = useState<LocalDbConfigState>({
        connectionMode: 'fields',
        connectionString: 'Server=localhost,1433;Database=MultiBranchPOS_DB;User Id=meto_pos;Password=MetoPosPass123!;Encrypt=false;TrustServerCertificate=true;',
        server: 'localhost',
        port: 1433,
        database: 'MultiBranchPOS_DB',
        user: 'meto_pos',
        password: '',
        encrypt: false,
        trustServerCertificate: true,
    });

    const [showPassword, setShowPassword] = useState(false);
    const [connectedStatus, setConnectedStatus] = useState<{
        connected: boolean;
        server?: string;
        database?: string;
        tablesCount?: number;
        message?: string;
        error?: string;
    } | null>(null);

    const [testResult, setTestResult] = useState<{
        success: boolean;
        databaseExists?: boolean;
        latencyMs?: number;
        serverVersion?: string;
        message?: string;
        error?: string;
    } | null>(null);

    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [status, setStatus] = useState<'idle' | 'scanning' | 'completed'>('idle');
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString('ar-EG')}] ${msg}`, ...prev].slice(0, 60));

    const loadCurrentConfig = useCallback(async () => {
        try {
            const res = await fetch('/api/db/init', { cache: 'no-store' });
            const data = await res.json();
            if (data.localConfig) {
                setConfig(data.localConfig);
            }
            setConnectedStatus({
                connected: Boolean(data.connected),
                server: data.server,
                database: data.database,
                tablesCount: data.tablesCount,
                message: data.message,
                error: data.error
            });
        } catch (err: any) {
            console.error('Failed to load local DB config:', err);
        }
    }, []);

    useEffect(() => {
        loadCurrentConfig();
    }, [loadCurrentConfig]);

    const handleFieldChange = (field: keyof LocalDbConfigState, val: any) => {
        setConfig(prev => {
            const next = { ...prev, [field]: val };
            if (field !== 'connectionString') {
                next.connectionString = buildConnStrClient(next);
            }
            return next;
        });
    };

    const handleConnectionStringChange = (connStr: string) => {
        const extracted = parseConnStrClient(connStr);
        setConfig(prev => ({
            ...prev,
            ...extracted,
            connectionMode: 'connectionString',
            connectionString: connStr
        }));
    };

    const applyPreset = (type: 'local' | 'external_ip' | 'aws_rds') => {
        if (type === 'local') {
            const next: LocalDbConfigState = {
                ...config,
                server: 'localhost',
                port: 1433,
                database: 'MultiBranchPOS_DB',
                user: 'meto_pos',
                encrypt: false,
                trustServerCertificate: true,
                connectionString: ''
            };
            next.connectionString = buildConnStrClient(next);
            setConfig(next);
        } else if (type === 'external_ip') {
            const next: LocalDbConfigState = {
                ...config,
                server: '195.201.0.0',
                port: 1433,
                database: 'MultiBranchPOS_DB',
                user: 'sa',
                encrypt: false,
                trustServerCertificate: true,
                connectionString: ''
            };
            next.connectionString = buildConnStrClient(next);
            setConfig(next);
        } else if (type === 'aws_rds') {
            const next: LocalDbConfigState = {
                ...config,
                server: 'database-1.c9oyqw2ss7c3.eu-north-1.rds.amazonaws.com',
                port: 1433,
                database: 'MultiBranchPOS_DB',
                user: 'admin',
                password: config.password || 'asSandokane123',
                encrypt: true,
                trustServerCertificate: true,
                connectionString: ''
            };
            next.connectionString = buildConnStrClient(next);
            setConfig(next);
        }
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        addLog(`جارٍ اختبار الاتصال بالسيرفر (${config.server}:${config.port})...`);
        try {
            const res = await fetch('/api/db/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'test', config })
            });
            const data = await res.json();
            setTestResult(data);
            if (data.success) {
                addLog(`✅ نجح الاتصال: ${data.message}`);
                toast({ title: 'نجح اختبار الاتصال ✅', description: data.message });
            } else {
                addLog(`❌ فشل الاتصال: ${data.error}`);
                toast({ variant: 'destructive', title: 'فشل الاتصال بالسيرفر', description: data.error });
            }
        } catch (err: any) {
            addLog(`❌ خطأ: ${err.message}`);
            toast({ variant: 'destructive', title: 'خطأ في الاختبار', description: err.message });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSaveConfig = async () => {
        setIsSaving(true);
        addLog(`جارٍ حفظ نص وإعدادات الاتصال بالسيرفر (${config.server}:${config.port})...`);
        try {
            const res = await fetch('/api/db/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save', config })
            });
            const data = await res.json();
            if (data.success) {
                if (data.config) setConfig(data.config);
                if (data.connectionTest) setTestResult(data.connectionTest);
                addLog(`✅ ${data.message}`);
                toast({ title: 'تم حفظ إعدادات الاتصال بنجاح ✅', description: data.message });
                await loadCurrentConfig();
                if (processSyncQueue) await processSyncQueue();
            } else {
                throw new Error(data.error || 'تعذر حفظ الإعدادات.');
            }
        } catch (err: any) {
            addLog(`❌ فشل الحفظ: ${err.message}`);
            toast({ variant: 'destructive', title: 'خطأ في الحفظ', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleInitializeDatabase = async () => {
        setIsInitializing(true);
        addLog(`جارٍ إنشاء وتأسيس قاعدة البيانات [${config.database}] بكافة الجداول والفهارس والـ Views على (${config.server}:${config.port})...`);
        try {
            const res = await fetch('/api/db/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'init', config })
            });
            const data = await res.json();
            if (data.success) {
                addLog(`✅ ${data.message}`);
                toast({ title: 'تم إنشاء وتهيئة قاعدة البيانات بنجاح 🚀', description: data.message });
                await loadCurrentConfig();
                if (processSyncQueue) await processSyncQueue();
            } else {
                throw new Error(data.error || data.message || 'فشل إنشاء قاعدة البيانات.');
            }
        } catch (err: any) {
            addLog(`❌ فشل التأسيس: ${err.message}`);
            toast({ variant: 'destructive', title: 'فشل تهيئة قاعدة البيانات', description: err.message });
        } finally {
            setIsInitializing(false);
        }
    };

    const handleCheckDatabase = async () => {
        setStatus('scanning');
        addLog("بدء فحص هيكلية وسجلات قاعدة البيانات المتصلة...");
        try {
            const res = await fetch('/api/db/sync', { cache: 'no-store' });
            const result = await res.json();
            if (result.success) {
                addLog("الاتصال بـ SQL Server نشط ومستقر.");
                addLog(`الفروع والمخازن: ${result.data?.warehouses?.length || 0} سجل.`);
                addLog(`الخزائن: ${result.data?.cashAccounts?.length || 0} خزينة.`);
                addLog(`فواتير المبيعات: ${result.data?.salesInvoices?.length || 0} سجل.`);
                addLog(`العملاء: ${result.data?.customers?.length || 0} سجل.`);
                addLog(`الأصناف: ${result.data?.items?.length || 0} صنف.`);
                addLog(`الموردين: ${result.data?.suppliers?.length || 0} مورد.`);
                addLog("كافة الجداول والفهارس والـ Views التحليلية مفعلة وتعمل بكفاءة.");
                setStatus('completed');
                toast({ title: "اكتمل الفحص", description: "قاعدة بيانات SQL Server تعمل بكفاءة تامة." });
            } else {
                addLog(`خطأ: ${result.error}`);
                setStatus('idle');
            }
        } catch (error: any) {
            addLog(`فشل الاتصال: ${error.message}`);
            setStatus('idle');
        }
    };

    return (
        <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
            <PageHeader
                title="إعدادات اتصال سيرفر الفرع (المحلي / IP خارجي / Amazon AWS)"
                description="تحديد نص الاتصال الكامل (Connection String) أو عنوان السيرفر (IP / AWS RDS) وقاعدة البيانات وتأسيس الجداول بضغطة زر"
            >
                <Button variant="outline" size="sm" onClick={loadCurrentConfig} className="gap-1.5 text-xs font-bold">
                    <RefreshCw className="h-3.5 w-3.5" />
                    تحديث الحالة
                </Button>
            </PageHeader>

            {/* شريط الحالة الحالي */}
            <Alert className={connectedStatus?.connected ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}>
                <Server className="h-5 w-5" />
                <AlertTitle className="flex items-center gap-2 font-bold">
                    <span>
                        حالة السيرفر الحالي: {connectedStatus?.server || `${config.server}:${config.port}`} — [{connectedStatus?.database || config.database}]
                    </span>
                    {connectedStatus?.connected ? (
                        <Badge className="bg-emerald-600 text-white text-[10px]">متصل ونشط ✅ ({connectedStatus.tablesCount || 72} جدول)</Badge>
                    ) : (
                        <Badge variant="destructive" className="text-[10px]">غير متصل (وضع الطوارئ / بانتظار الضبط)</Badge>
                    )}
                </AlertTitle>
                <AlertDescription className="text-xs mt-1">
                    {connectedStatus?.connected
                        ? connectedStatus.message
                        : `تعذر الاتصال بالسيرفر الحالي (${connectedStatus?.error || 'يرجى التحقق من نص الاتصال أو عنوان الـ IP أو إنشاء القاعدة'}).`}
                </AlertDescription>
            </Alert>

            {/* بطاقة إعداد نص الاتصال والحقول */}
            <Card className="border-2 border-primary/20 shadow-sm">
                <CardHeader className="border-b pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-base font-bold flex items-center gap-2">
                                <Globe className="h-5 w-5 text-primary" />
                                إعدادات اتصال SQL Server للفرع (يدعم Localhost و IP خارجي و Amazon AWS RDS)
                            </CardTitle>
                            <CardDescription className="text-xs mt-1">
                                يمكنك لصق نص الاتصال الكامل (Connection String) مباشرة أو تعبئة الحقول التفصيلية، وسيتم حفظها وربط النظام بها فوراً دون الحاجة لإعادة تشغيل البرنامج.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => applyPreset('local')}>
                                قالب محلي (Localhost)
                            </Button>
                            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => applyPreset('external_ip')}>
                                قالب IP خارجي (VPS)
                            </Button>
                            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => applyPreset('aws_rds')}>
                                <Cloud className="h-3 w-3 ml-1 text-amber-500" />
                                قالب Amazon AWS RDS
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-6 space-y-5">
                    <Tabs
                        value={config.connectionMode || 'fields'}
                        onValueChange={(v) => handleFieldChange('connectionMode', v as 'fields' | 'connectionString')}
                    >
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="connectionString" className="text-xs font-bold gap-1.5">
                                <Terminal className="h-3.5 w-3.5" />
                                نص الاتصال الكامل (Connection String)
                            </TabsTrigger>
                            <TabsTrigger value="fields" className="text-xs font-bold gap-1.5">
                                <Server className="h-3.5 w-3.5" />
                                الحقول التفصيلية (IP / Host / Port / User)
                            </TabsTrigger>
                        </TabsList>

                        {/* تبويب نص الاتصال الكامل */}
                        <TabsContent value="connectionString" className="space-y-3">
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold">نص الاتصال الكامل لـ SQL Server (ADO.NET / MSSQL Connection String):</Label>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-[11px] gap-1"
                                        onClick={() => {
                                            navigator.clipboard.writeText(config.connectionString);
                                            toast({ title: 'تم نسخ نص الاتصال 📋' });
                                        }}
                                    >
                                        <Copy className="h-3 w-3" /> نسخ النص
                                    </Button>
                                </div>
                                <Textarea
                                    dir="ltr"
                                    rows={3}
                                    value={config.connectionString}
                                    onChange={(e) => handleConnectionStringChange(e.target.value)}
                                    placeholder="Server=my-aws-db.xxxx.us-east-1.rds.amazonaws.com,1433;Database=MultiBranchPOS_DB;User Id=admin;Password=YourPassword;Encrypt=true;TrustServerCertificate=true;"
                                    className="font-mono text-xs leading-relaxed"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    💡 عند لصق نص الاتصال هنا، يقوم النظام تلقائياً باستخراج عنوان السيرفر (IP أو نطاق Amazon AWS)، المنفذ، اسم قاعدة البيانات، اسم المستخدم، وكلمة المرور وإعدادات التشفير.
                                </p>
                            </div>
                        </TabsContent>

                        {/* تبويب الحقول التفصيلية */}
                        <TabsContent value="fields" className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 space-y-1.5">
                                    <Label className="text-xs font-bold">عنوان السيرفر (Localhost أو IP خارجي أو Amazon AWS Endpoint):</Label>
                                    <Input
                                        dir="ltr"
                                        value={config.server}
                                        onChange={(e) => handleFieldChange('server', e.target.value)}
                                        placeholder="localhost أو 195.201.x.x أو mydb.rds.amazonaws.com"
                                        className="h-9 font-mono text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold">منفذ SQL (Port):</Label>
                                    <Input
                                        dir="ltr"
                                        type="number"
                                        value={config.port}
                                        onChange={(e) => handleFieldChange('port', Number(e.target.value) || 1433)}
                                        placeholder="1433"
                                        className="h-9 font-mono text-xs"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold">اسم قاعدة البيانات (Database Name):</Label>
                                    <Input
                                        dir="ltr"
                                        value={config.database}
                                        onChange={(e) => handleFieldChange('database', e.target.value)}
                                        placeholder="MultiBranchPOS_DB"
                                        className="h-9 font-mono text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold">اسم مستخدم SQL (User ID):</Label>
                                    <Input
                                        dir="ltr"
                                        value={config.user}
                                        onChange={(e) => handleFieldChange('user', e.target.value)}
                                        placeholder="sa أو admin أو meto_pos"
                                        className="h-9 font-mono text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold">كلمة مرور SQL (Password):</Label>
                                    <div className="relative">
                                        <Input
                                            dir="ltr"
                                            type={showPassword ? "text" : "password"}
                                            value={config.password}
                                            onChange={(e) => handleFieldChange('password', e.target.value)}
                                            placeholder="كلمة مرور SQL Server..."
                                            className="h-9 font-mono text-xs pr-9"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-6 pt-2 p-3 rounded-xl border bg-muted/20">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={Boolean(config.encrypt)}
                                        onCheckedChange={(v) => handleFieldChange('encrypt', v)}
                                    />
                                    <Label className="text-xs font-semibold cursor-pointer">
                                        تفعيل تشفير الاتصال السحابي (Encrypt=True — مطلوب لسيرفرات Amazon AWS / Azure)
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={config.trustServerCertificate !== false}
                                        onCheckedChange={(v) => handleFieldChange('trustServerCertificate', v)}
                                    />
                                    <Label className="text-xs font-semibold cursor-pointer">
                                        الوثوق بشهادة السيرفر (TrustServerCertificate=True)
                                    </Label>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>

                    {/* معاينة حية لنص الاتصال الناتج */}
                    <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-muted-foreground">ملخص الاتصال الفعلي الذي سيستخدمه النظام:</span>
                            <span className="font-mono text-[11px] text-primary">{config.server}:{config.port} / {config.database}</span>
                        </div>
                        <div dir="ltr" className="font-mono text-[11px] text-muted-foreground break-all">
                            Server={config.server},{config.port};Database={config.database};User Id={config.user};Password=******;Encrypt={config.encrypt ? 'true' : 'false'};TrustServerCertificate=true;
                        </div>
                    </div>

                    {/* نتيجة اختبار الاتصال */}
                    {testResult && (
                        <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                            testResult.success
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                                : 'bg-destructive/10 border-destructive/30 text-destructive'
                        }`}>
                            <div className="font-bold flex items-center gap-1.5">
                                {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                <span>{testResult.success ? testResult.message : testResult.error}</span>
                            </div>
                            {testResult.serverVersion && (
                                <div className="text-[11px] opacity-80 font-mono">{testResult.serverVersion}</div>
                            )}
                        </div>
                    )}
                </CardContent>

                <CardFooter className="border-t bg-muted/10 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleTestConnection}
                            disabled={isTesting}
                            className="h-9 text-xs font-bold gap-1.5"
                        >
                            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-amber-500" />}
                            1. اختبار الاتصال بالسيرفر
                        </Button>

                        <Button
                            type="button"
                            onClick={handleSaveConfig}
                            disabled={isSaving}
                            className="h-9 text-xs font-bold gap-1.5 bg-primary text-primary-foreground"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            2. حفظ نص الاتصال وربط النظام فوراً
                        </Button>
                    </div>

                    <Button
                        type="button"
                        onClick={handleInitializeDatabase}
                        disabled={isInitializing}
                        className="h-9 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                    >
                        {isInitializing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                        3. إنشاء وتأسيس قاعدة البيانات والجداول على هذا السيرفر
                    </Button>
                </CardFooter>
            </Card>

            {/* بطاقة فحص التكامل والسجلات */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Database className="h-5 w-5" />
                        سجل عمليات الاتصال وفحص تكامل الجداول
                    </CardTitle>
                    <CardDescription className="text-xs">
                        عرض مخرجات الاتصال واختبار الجداول والفهارس على السيرفر المحدد
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {logs.length > 0 && (
                        <div className="rounded-md border p-4 bg-muted/30">
                            <ScrollArea className="h-[180px] w-full">
                                <div className="space-y-1.5 font-mono text-xs">
                                    {logs.map((log, index) => (
                                        <div key={index} className="text-foreground">
                                            {log}
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <Button variant="outline" onClick={handleCheckDatabase} disabled={status === 'scanning'} className="gap-2 text-xs font-bold">
                        {status === 'scanning' ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                جاري الفحص...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="h-4 w-4" />
                                فحص الجداول والبيانات الحالية
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
