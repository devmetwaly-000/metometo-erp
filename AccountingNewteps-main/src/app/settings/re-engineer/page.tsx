"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
    ShieldCheck, AlertTriangle, Copy, Eye, EyeOff, Cloud, Terminal, ArrowLeftRight,
    Building2, Store, Lock, HardDriveDownload
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// واجهة إعدادات قاعدة بيانات الفرع
interface BranchDbConfigState {
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

// واجهة إعدادات قاعدة بيانات الإدارة المركزية
interface CentralDbConfigState {
    systemRole: 'branch' | 'central';
    centralHostingType: 'local' | 'vps' | 'cloud';
    centralConnectionString: string;
    centralServerIp: string;
    centralSqlPort: number;
    centralDatabase: string;
    centralUsername: string;
    centralPassword: string;
    centralEncrypt: boolean;
    centralTrustServerCertificate: boolean;
    currentBranchCode: string;
    currentBranchName: string;
}

function parseConnStr(connStr: string): Partial<BranchDbConfigState> {
    if (!connStr) return {};
    const out: Partial<BranchDbConfigState> = {};
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

function buildConnStr(cfg: BranchDbConfigState): string {
    return `Server=${cfg.server || 'localhost'},${cfg.port || 1433};Database=${cfg.database || 'MultiBranchPOS_DB'};User Id=${cfg.user || 'sa'};Password=${cfg.password || ''};Encrypt=${cfg.encrypt ? 'true' : 'false'};TrustServerCertificate=${cfg.trustServerCertificate !== false ? 'true' : 'false'};`;
}

function detectHosting(server: string, encrypt?: boolean): { type: 'local' | 'cloud' | 'ip'; label: string; icon: any } {
    const s = (server || '').toLowerCase().trim();
    if (s.includes('.rds.amazonaws.com')) {
        return { type: 'cloud', label: 'سحابي (Amazon AWS RDS)', icon: Cloud };
    }
    if (s.includes('.database.windows.net')) {
        return { type: 'cloud', label: 'سحابي (Azure SQL)', icon: Cloud };
    }
    const hostOnly = s.split(':')[0].split(',')[0].replace(/^tcp:/i, '').trim();
    const isLocal =
        hostOnly === 'localhost' ||
        hostOnly === '.' ||
        hostOnly === '(local)' ||
        hostOnly.startsWith('127.') ||
        (!hostOnly.includes('.') && !hostOnly.includes(':'));

    if (isLocal && !encrypt) {
        return { type: 'local', label: 'سيرفر محلي (Localhost)', icon: Server };
    }
    return { type: 'ip', label: 'سيرفر شبكة / خارجي (IP Server)', icon: Globe };
}

export default function DatabaseReEngineeringPage() {
    const { processSyncQueue } = useData();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = useState<'branch' | 'central' | 'topology'>('branch');

    // -------------------------------------------------------------
    // Branch DB State
    // -------------------------------------------------------------
    const [branchConfig, setBranchConfig] = useState<BranchDbConfigState>({
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
    const [showBranchPassword, setShowBranchPassword] = useState(false);
    const [branchConnectedStatus, setBranchConnectedStatus] = useState<{
        connected: boolean;
        server?: string;
        database?: string;
        tablesCount?: number;
        message?: string;
        error?: string;
    } | null>(null);
    const [branchTestResult, setBranchTestResult] = useState<{
        success: boolean;
        databaseExists?: boolean;
        latencyMs?: number;
        serverVersion?: string;
        message?: string;
        error?: string;
    } | null>(null);
    const [isTestingBranch, setIsTestingBranch] = useState(false);
    const [isSavingBranch, setIsSavingBranch] = useState(false);
    const [isInitializingBranch, setIsInitializingBranch] = useState(false);

    // -------------------------------------------------------------
    // Central DB State
    // -------------------------------------------------------------
    const [centralConfig, setCentralConfig] = useState<CentralDbConfigState>({
        systemRole: 'branch',
        centralHostingType: 'local',
        centralConnectionString: '',
        centralServerIp: '10.110.16.16',
        centralSqlPort: 1433,
        centralDatabase: 'MultiBranchPOS_Central_DB',
        centralUsername: 'sa',
        centralPassword: '',
        centralEncrypt: false,
        centralTrustServerCertificate: true,
        currentBranchCode: '900',
        currentBranchName: 'الفرع الرئيسي',
    });
    const [showCentralPassword, setShowCentralPassword] = useState(false);
    const [centralConnectedStatus, setCentralConnectedStatus] = useState<{
        connected: boolean;
        server?: string;
        database?: string;
        tablesCount?: number;
        message?: string;
        error?: string;
    } | null>(null);
    const [centralTestResult, setCentralTestResult] = useState<{
        success: boolean;
        latencyMs?: number;
        serverVersion?: string;
        message?: string;
        error?: string;
    } | null>(null);
    const [isTestingCentral, setIsTestingCentral] = useState(false);
    const [isSavingCentral, setIsSavingCentral] = useState(false);
    const [isInitializingCentral, setIsInitializingCentral] = useState(false);

    // System role dialog state
    const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
    const [roleTarget, setRoleTarget] = useState<'branch' | 'central'>('branch');
    const [rolePassword, setRolePassword] = useState('');
    const [isSwitchingRole, setIsSwitchingRole] = useState(false);

    // Logs
    const [logs, setLogs] = useState<string[]>([]);
    const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString('ar-EG')}] ${msg}`, ...prev].slice(0, 60));

    // -------------------------------------------------------------
    // Load configurations from backend
    // -------------------------------------------------------------
    const loadAllConfigs = useCallback(async () => {
        // 1. جلب إعدادات الفرع
        try {
            const res = await fetch('/api/db/init', { cache: 'no-store' });
            const data = await res.json();
            if (data.localConfig) {
                setBranchConfig(prev => ({
                    ...prev,
                    ...data.localConfig,
                    connectionString: data.localConfig.connectionString || buildConnStr(data.localConfig)
                }));
            }
            setBranchConnectedStatus({
                connected: Boolean(data.connected),
                server: data.server,
                database: data.database,
                tablesCount: data.tablesCount,
                message: data.message,
                error: data.error
            });
        } catch (err: any) {
            console.error('Failed to load branch DB config:', err);
        }

        // 2. جلب إعدادات الإدارة المركزية
        try {
            const res = await fetch('/api/sync/central', { cache: 'no-store' });
            const data = await res.json();
            if (data.config) {
                const c = data.config;
                setCentralConfig(prev => ({
                    ...prev,
                    systemRole: c.systemRole || 'branch',
                    centralHostingType: c.centralHostingType || 'local',
                    centralConnectionString: c.centralConnectionString || '',
                    centralServerIp: c.centralServerIp || '10.110.16.16',
                    centralSqlPort: c.centralSqlPort || 1433,
                    centralDatabase: c.centralDatabase || 'MultiBranchPOS_Central_DB',
                    centralUsername: c.centralUsername || 'sa',
                    centralPassword: c.centralPassword || '',
                    centralEncrypt: Boolean(c.centralEncrypt),
                    centralTrustServerCertificate: c.centralTrustServerCertificate !== false,
                    currentBranchCode: c.currentBranchCode || '900',
                    currentBranchName: c.currentBranchName || 'الفرع الرئيسي',
                }));
            }
        } catch (err: any) {
            console.error('Failed to load central sync config:', err);
        }
    }, []);

    useEffect(() => {
        loadAllConfigs();
    }, [loadAllConfigs]);

    // -------------------------------------------------------------
    // Branch handlers
    // -------------------------------------------------------------
    const handleBranchFieldChange = (field: keyof BranchDbConfigState, val: any) => {
        setBranchConfig(prev => {
            const next = { ...prev, [field]: val };
            if (field !== 'connectionString') {
                next.connectionString = buildConnStr(next);
            }
            return next;
        });
    };

    const handleBranchConnStrChange = (connStr: string) => {
        const extracted = parseConnStr(connStr);
        setBranchConfig(prev => ({
            ...prev,
            ...extracted,
            connectionMode: 'connectionString',
            connectionString: connStr
        }));
    };

    const applyBranchPreset = (type: 'local' | 'external_ip' | 'aws_rds') => {
        if (type === 'local') {
            const next: BranchDbConfigState = {
                ...branchConfig,
                server: 'localhost',
                port: 1433,
                database: 'MultiBranchPOS_DB',
                user: 'meto_pos',
                encrypt: false,
                trustServerCertificate: true,
                connectionString: ''
            };
            next.connectionString = buildConnStr(next);
            setBranchConfig(next);
        } else if (type === 'external_ip') {
            const next: BranchDbConfigState = {
                ...branchConfig,
                server: '192.168.1.100',
                port: 1433,
                database: 'MultiBranchPOS_DB',
                user: 'sa',
                encrypt: false,
                trustServerCertificate: true,
                connectionString: ''
            };
            next.connectionString = buildConnStr(next);
            setBranchConfig(next);
        } else if (type === 'aws_rds') {
            const next: BranchDbConfigState = {
                ...branchConfig,
                server: 'master.c9oyqw2ss7c3.eu-north-1.rds.amazonaws.com',
                port: 1433,
                database: 'MultiBranchPOS_DB',
                user: 'admin',
                password: branchConfig.password || 'ahmedmetwally',
                encrypt: true,
                trustServerCertificate: true,
                connectionString: ''
            };
            next.connectionString = buildConnStr(next);
            setBranchConfig(next);
        }
    };

    const handleTestBranchConnection = async () => {
        setIsTestingBranch(true);
        setBranchTestResult(null);
        addLog(`[الفرع] جارٍ اختبار الاتصال بالسيرفر (${branchConfig.server}:${branchConfig.port})...`);
        try {
            const res = await fetch('/api/db/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'test', config: branchConfig })
            });
            const data = await res.json();
            setBranchTestResult(data);
            if (data.success) {
                addLog(`[الفرع] ✅ نجح الاتصال: ${data.message}`);
                toast({ title: 'نجح اختبار اتصال سيرفر الفرع ✅', description: data.message });
            } else {
                addLog(`[الفرع] ❌ فشل الاتصال: ${data.error}`);
                toast({ variant: 'destructive', title: 'فشل الاتصال بسيرفر الفرع', description: data.error });
            }
        } catch (err: any) {
            addLog(`[الفرع] ❌ خطأ: ${err.message}`);
            toast({ variant: 'destructive', title: 'خطأ في الاختبار', description: err.message });
        } finally {
            setIsTestingBranch(false);
        }
    };

    const handleSaveBranchConfig = async () => {
        setIsSavingBranch(true);
        addLog(`[الفرع] جارٍ حفظ إعدادات الاتصال بالسيرفر (${branchConfig.server}:${branchConfig.port})...`);
        try {
            const res = await fetch('/api/db/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save', config: branchConfig })
            });
            const data = await res.json();
            if (data.success) {
                if (data.config) setBranchConfig(data.config);
                if (data.connectionTest) setBranchTestResult(data.connectionTest);
                addLog(`[الفرع] ✅ ${data.message}`);
                toast({ title: 'تم حفظ وتفعيل اتصال سيرفر الفرع بنجاح ✅', description: data.message });
                await loadAllConfigs();
                if (processSyncQueue) await processSyncQueue();
            } else {
                throw new Error(data.error || 'تعذر حفظ الإعدادات.');
            }
        } catch (err: any) {
            addLog(`[الفرع] ❌ فشل الحفظ: ${err.message}`);
            toast({ variant: 'destructive', title: 'خطأ في حفظ إعدادات الفرع', description: err.message });
        } finally {
            setIsSavingBranch(false);
        }
    };

    const handleInitializeBranchDatabase = async () => {
        setIsInitializingBranch(true);
        addLog(`[الفرع] جارٍ تأسيس وإنشاء الجداول في [${branchConfig.database}] على (${branchConfig.server}:${branchConfig.port})...`);
        try {
            const res = await fetch('/api/db/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'init', config: branchConfig })
            });
            const data = await res.json();
            if (data.success) {
                addLog(`[الفرع] ✅ ${data.message}`);
                toast({ title: 'تم تأسيس وتهيئة قاعدة بيانات الفرع بنجاح 🚀', description: data.message });
                await loadAllConfigs();
                if (processSyncQueue) await processSyncQueue();
            } else {
                throw new Error(data.error || data.message || 'فشل تأسيس قاعدة البيانات.');
            }
        } catch (err: any) {
            addLog(`[الفرع] ❌ فشل التأسيس: ${err.message}`);
            toast({ variant: 'destructive', title: 'فشل تهيئة قاعدة بيانات الفرع', description: err.message });
        } finally {
            setIsInitializingBranch(false);
        }
    };

    // -------------------------------------------------------------
    // Central DB handlers
    // -------------------------------------------------------------
    const handleCentralFieldChange = (field: keyof CentralDbConfigState, val: any) => {
        setCentralConfig(prev => ({ ...prev, [field]: val }));
    };

    const applyCentralPreset = (type: 'local' | 'external_ip' | 'aws_rds') => {
        if (type === 'local') {
            setCentralConfig(prev => ({
                ...prev,
                centralHostingType: 'local',
                centralServerIp: 'localhost',
                centralSqlPort: 1433,
                centralDatabase: 'MultiBranchPOS_Central_DB',
                centralUsername: 'sa',
                centralEncrypt: false,
                centralTrustServerCertificate: true,
            }));
        } else if (type === 'external_ip') {
            setCentralConfig(prev => ({
                ...prev,
                centralHostingType: 'vps',
                centralServerIp: '10.110.16.16',
                centralSqlPort: 1433,
                centralDatabase: 'MultiBranchPOS_Central_DB',
                centralUsername: 'sa',
                centralEncrypt: false,
                centralTrustServerCertificate: true,
            }));
        } else if (type === 'aws_rds') {
            setCentralConfig(prev => ({
                ...prev,
                centralHostingType: 'cloud',
                centralServerIp: 'master.c9oyqw2ss7c3.eu-north-1.rds.amazonaws.com',
                centralSqlPort: 1433,
                centralDatabase: 'MultiBranchPOS_Central_DB',
                centralUsername: 'admin',
                centralEncrypt: true,
                centralTrustServerCertificate: true,
            }));
        }
    };

    const handleTestCentralConnection = async () => {
        setIsTestingCentral(true);
        setCentralTestResult(null);
        addLog(`[الإدارة] جارٍ اختبار الاتصال بالسيرفر المركزي (${centralConfig.centralServerIp}:${centralConfig.centralSqlPort})...`);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'test', config: centralConfig })
            });
            const data = await res.json();
            setCentralTestResult(data);
            if (data.success) {
                setCentralConnectedStatus({
                    connected: true,
                    server: `${centralConfig.centralServerIp}:${centralConfig.centralSqlPort}`,
                    database: centralConfig.centralDatabase,
                    message: data.message
                });
                addLog(`[الإدارة] ✅ نجح الاتصال بالسيرفر المركزي: ${data.message}`);
                toast({ title: 'نجح اختبار اتصال السيرفر المركزي ✅', description: data.message });
            } else {
                setCentralConnectedStatus({
                    connected: false,
                    server: `${centralConfig.centralServerIp}:${centralConfig.centralSqlPort}`,
                    database: centralConfig.centralDatabase,
                    error: data.error
                });
                addLog(`[الإدارة] ❌ فشل الاتصال بالسيرفر المركزي: ${data.error}`);
                toast({ variant: 'destructive', title: 'فشل الاتصال بالسيرفر المركزي', description: data.error });
            }
        } catch (err: any) {
            addLog(`[الإدارة] ❌ خطأ: ${err.message}`);
            toast({ variant: 'destructive', title: 'خطأ في الاختبار', description: err.message });
        } finally {
            setIsTestingCentral(false);
        }
    };

    const handleSaveCentralConfig = async () => {
        setIsSavingCentral(true);
        addLog(`[الإدارة] جارٍ حفظ بيانات اتصال السيرفر المركزي (${centralConfig.centralServerIp}:${centralConfig.centralSqlPort})...`);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save', config: centralConfig })
            });
            const data = await res.json();
            if (data.success) {
                addLog(`[الإدارة] ✅ ${data.message}`);
                toast({ title: 'تم حفظ إعدادات السيرفر المركزي بنجاح ✅', description: data.message });
                await loadAllConfigs();
            } else {
                throw new Error(data.error || 'فشل حفظ الإعدادات.');
            }
        } catch (err: any) {
            addLog(`[الإدارة] ❌ فشل الحفظ: ${err.message}`);
            toast({ variant: 'destructive', title: 'خطأ في الحفظ', description: err.message });
        } finally {
            setIsSavingCentral(false);
        }
    };

    const handleInitializeCentralDatabase = async () => {
        setIsInitializingCentral(true);
        addLog(`[الإدارة] جارٍ تأسيس قاعدة بيانات الإدارة المركزية [${centralConfig.centralDatabase}] على (${centralConfig.centralServerIp}:${centralConfig.centralSqlPort})...`);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'init-database',
                    config: centralConfig,
                    initOptions: {
                        server: centralConfig.centralServerIp,
                        port: centralConfig.centralSqlPort,
                        database: centralConfig.centralDatabase,
                        user: centralConfig.centralUsername,
                        password: centralConfig.centralPassword,
                        encrypt: centralConfig.centralEncrypt
                    }
                })
            });
            const data = await res.json();
            if (data.success) {
                addLog(`[الإدارة] ✅ ${data.message || 'تم تأسيس قاعدة الإدارة المركزية بنجاح'}`);
                toast({ title: 'تم تأسيس قاعدة الإدارة المركزية بنجاح 🚀', description: data.message });
                await loadAllConfigs();
            } else {
                throw new Error(data.error || data.message || 'فشل التأسيس.');
            }
        } catch (err: any) {
            addLog(`[الإدارة] ❌ فشل التأسيس: ${err.message}`);
            toast({ variant: 'destructive', title: 'فشل تأسيس قاعدة الإدارة المركزية', description: err.message });
        } finally {
            setIsInitializingCentral(false);
        }
    };

    const handleExecuteRoleSwitch = async () => {
        if (!rolePassword.trim()) {
            toast({ variant: 'destructive', title: 'تنبيه', description: 'يرجى إدخال كلمة مرور المسؤول.' });
            return;
        }
        setIsSwitchingRole(true);
        try {
            const res = await fetch('/api/sync/central', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'switch-role',
                    targetRole: roleTarget,
                    password: rolePassword
                })
            });
            const data = await res.json();
            if (data.success) {
                toast({ title: 'تم تبديل دور النظام بنجاح ✅', description: data.message });
                setIsRoleDialogOpen(false);
                setRolePassword('');
                await loadAllConfigs();
            } else {
                throw new Error(data.error || 'فشل التبديل.');
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'خطأ في التبديل', description: err.message });
        } finally {
            setIsSwitchingRole(false);
        }
    };

    const branchHosting = detectHosting(branchConfig.server, branchConfig.encrypt);
    const centralHosting = detectHosting(centralConfig.centralServerIp, centralConfig.centralEncrypt);

    return (
        <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
            <PageHeader
                title="مركز إدارة السيرفرات وقواعد البيانات (الفرع والإدارة المركزية)"
                description="إدارة شاملة وموحدة لاتصال قاعدة بيانات الفرع وقاعدة بيانات الإدارة المركزية (محلي Localhost، سيرفر شبكة / VPS، وسحابي Amazon AWS RDS / Azure SQL)"
            >
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs font-bold">
                        <Link href="/settings/backup">
                            <HardDriveDownload className="h-3.5 w-3.5 text-primary" />
                            النسخ الاحتياطي وإعادة الضبط
                        </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs font-bold">
                        <Link href="/settings/central-sync">
                            <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
                            المزامنة المركزية اللحظية
                        </Link>
                    </Button>
                    <Button variant="outline" size="sm" onClick={loadAllConfigs} className="gap-1.5 text-xs font-bold">
                        <RefreshCw className="h-3.5 w-3.5" />
                        تحديث الحالة
                    </Button>
                </div>
            </PageHeader>

            {/* شريط الملخص العلوي للفرع والإدارة */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* بطاقة ملخص الفرع */}
                <Card className={cn(
                    "border-2 transition-all",
                    branchConnectedStatus?.connected ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"
                )}>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <Database className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-foreground">قاعدة بيانات الفرع</span>
                                    <Badge variant="outline" className={cn(
                                        "text-[10px] font-bold",
                                        branchHosting.type === 'cloud' ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" :
                                        branchHosting.type === 'ip' ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30" :
                                        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                    )}>
                                        {branchHosting.label}
                                    </Badge>
                                    {branchConnectedStatus?.connected ? (
                                        <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0">متصلة ✅</Badge>
                                    ) : (
                                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0">غير متصلة</Badge>
                                    )}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5 font-mono" dir="ltr">
                                    {branchConfig.server}:{branchConfig.port} [{branchConfig.database}]
                                </div>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant={activeTab === 'branch' ? 'default' : 'outline'}
                            className="h-8 text-xs font-bold shrink-0"
                            onClick={() => setActiveTab('branch')}
                        >
                            تعديل إعدادات الفرع
                        </Button>
                    </CardContent>
                </Card>

                {/* بطاقة ملخص الإدارة المركزية */}
                <Card className={cn(
                    "border-2 transition-all",
                    centralConnectedStatus?.connected ? "border-emerald-500/40 bg-emerald-500/5" : "border-indigo-500/40 bg-indigo-500/5"
                )}>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                                <Globe className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-foreground">قاعدة الإدارة المركزية</span>
                                    <Badge variant="outline" className={cn(
                                        "text-[10px] font-bold",
                                        centralHosting.type === 'cloud' ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" :
                                        centralHosting.type === 'ip' ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30" :
                                        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                    )}>
                                        {centralHosting.label}
                                    </Badge>
                                    {centralConnectedStatus?.connected ? (
                                        <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0">متصلة ✅</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-indigo-400">جاهزة للربط</Badge>
                                    )}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5 font-mono" dir="ltr">
                                    {centralConfig.centralServerIp}:{centralConfig.centralSqlPort} [{centralConfig.centralDatabase}]
                                </div>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant={activeTab === 'central' ? 'default' : 'outline'}
                            className="h-8 text-xs font-bold shrink-0"
                            onClick={() => setActiveTab('central')}
                        >
                            تعديل إعدادات الإدارة
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* التبويبات الرئيسية الموحدة */}
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
                <TabsList className="grid w-full grid-cols-3 h-11 p-1 bg-muted/60">
                    <TabsTrigger value="branch" className="text-xs font-bold gap-2">
                        <Store className="h-4 w-4" />
                        1. سيرفر وقاعدة بيانات الفرع (Branch DB)
                    </TabsTrigger>
                    <TabsTrigger value="central" className="text-xs font-bold gap-2">
                        <Building2 className="h-4 w-4" />
                        2. سيرفر وقاعدة الإدارة المركزية (Central DB)
                    </TabsTrigger>
                    <TabsTrigger value="topology" className="text-xs font-bold gap-2">
                        <ArrowLeftRight className="h-4 w-4" />
                        3. نظرة عامة وتخطيط الربط (Architecture)
                    </TabsTrigger>
                </TabsList>

                {/* ========================================================= */}
                {/* تبويب 1: إعدادات اتصال الفرع */}
                {/* ========================================================= */}
                <TabsContent value="branch" className="space-y-5 mt-4">
                    <Card className="border shadow-sm">
                        <CardHeader className="border-b pb-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <Store className="h-5 w-5 text-primary" />
                                        إعدادات اتصال سيرفر الفرع (يدعم Localhost و IP خارجي و Amazon AWS RDS)
                                    </CardTitle>
                                    <CardDescription className="text-xs mt-1">
                                        هذه هي قاعدة البيانات التي يعمل عليها البرنامج حالياً ككاشير أو نقطة بيع أو إدارة فرعية.
                                    </CardDescription>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] font-bold" onClick={() => applyBranchPreset('local')}>
                                        💻 قالب محلي (Localhost)
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] font-bold" onClick={() => applyBranchPreset('external_ip')}>
                                        🌐 قالب IP خارجي (VPS)
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] font-bold" onClick={() => applyBranchPreset('aws_rds')}>
                                        <Cloud className="h-3 w-3 ml-1 text-amber-500" />
                                        ☁️ قالب Amazon AWS RDS
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-4 sm:p-6 space-y-5">
                            <Tabs
                                value={branchConfig.connectionMode || 'fields'}
                                onValueChange={(v) => handleBranchFieldChange('connectionMode', v as 'fields' | 'connectionString')}
                            >
                                <TabsList className="grid w-full grid-cols-2 mb-4">
                                    <TabsTrigger value="connectionString" className="text-xs font-bold gap-1.5">
                                        <Terminal className="h-3.5 w-3.5" />
                                        نص الاتصال الكامل (Connection String)
                                    </TabsTrigger>
                                    <TabsTrigger value="fields" className="text-xs font-bold gap-1.5">
                                        <Server className="h-3.5 w-3.5" />
                                        الحقول التفصيلية (Host / Port / Database / User)
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="connectionString" className="space-y-3">
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-bold">نص الاتصال الكامل لـ SQL Server:</Label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-[11px] gap-1"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(branchConfig.connectionString);
                                                    toast({ title: 'تم نسخ نص الاتصال 📋' });
                                                }}
                                            >
                                                <Copy className="h-3 w-3" /> نسخ
                                            </Button>
                                        </div>
                                        <Textarea
                                            dir="ltr"
                                            rows={3}
                                            value={branchConfig.connectionString}
                                            onChange={(e) => handleBranchConnStrChange(e.target.value)}
                                            placeholder="Server=my-db.xxxx.rds.amazonaws.com,1433;Database=MultiBranchPOS_DB;User Id=admin;Password=YourPass;Encrypt=true;TrustServerCertificate=true;"
                                            className="font-mono text-xs leading-relaxed"
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent value="fields" className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="md:col-span-2 space-y-1.5">
                                            <Label className="text-xs font-bold">عنوان السيرفر (Localhost أو IP خارجي أو AWS RDS Endpoint):</Label>
                                            <Input
                                                dir="ltr"
                                                value={branchConfig.server}
                                                onChange={(e) => handleBranchFieldChange('server', e.target.value)}
                                                placeholder="localhost أو 192.168.1.100 أو mydb.rds.amazonaws.com"
                                                className="h-9 font-mono text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">رقم المنفذ (Port):</Label>
                                            <Input
                                                dir="ltr"
                                                type="number"
                                                value={branchConfig.port}
                                                onChange={(e) => handleBranchFieldChange('port', parseInt(e.target.value, 10) || 1433)}
                                                placeholder="1433"
                                                className="h-9 font-mono text-xs"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">اسم قاعدة البيانات:</Label>
                                            <Input
                                                dir="ltr"
                                                value={branchConfig.database}
                                                onChange={(e) => handleBranchFieldChange('database', e.target.value)}
                                                placeholder="MultiBranchPOS_DB"
                                                className="h-9 font-mono text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">اسم المستخدم (User ID):</Label>
                                            <Input
                                                dir="ltr"
                                                value={branchConfig.user}
                                                onChange={(e) => handleBranchFieldChange('user', e.target.value)}
                                                placeholder="sa أو admin"
                                                className="h-9 font-mono text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">كلمة المرور (Password):</Label>
                                            <div className="relative">
                                                <Input
                                                    dir="ltr"
                                                    type={showBranchPassword ? "text" : "password"}
                                                    value={branchConfig.password}
                                                    onChange={(e) => handleBranchFieldChange('password', e.target.value)}
                                                    placeholder="••••••••"
                                                    className="h-9 font-mono text-xs pr-9"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    tabIndex={-1}
                                                    onClick={() => setShowBranchPassword(!showBranchPassword)}
                                                    className="absolute left-1 top-1 h-7 w-7 text-muted-foreground"
                                                >
                                                    {showBranchPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold">تشفير الاتصال (Encrypt SSL):</Label>
                                                <p className="text-[10px] text-muted-foreground">يلزم تفعيله (True) لـ Amazon AWS RDS و Azure SQL</p>
                                            </div>
                                            <Switch
                                                checked={branchConfig.encrypt}
                                                onCheckedChange={(checked) => handleBranchFieldChange('encrypt', checked)}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold">الوثوق بالشهادة (Trust Certificate):</Label>
                                                <p className="text-[10px] text-muted-foreground">تجاوز الشهادات الذاتية للسيرفر المحلي و VPS</p>
                                            </div>
                                            <Switch
                                                checked={branchConfig.trustServerCertificate}
                                                onCheckedChange={(checked) => handleBranchFieldChange('trustServerCertificate', checked)}
                                            />
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>

                            {/* نتيجة فحص الاتصال لسيرفر الفرع */}
                            {branchTestResult && (
                                <Alert className={branchTestResult.success ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10"}>
                                    <div className="flex items-center gap-2">
                                        {branchTestResult.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                                        <AlertTitle className="text-xs font-bold">
                                            {branchTestResult.success ? "نجح الاتصال بسيرفر الفرع بنجاح ✅" : "تعذر الاتصال بسيرفر الفرع"}
                                        </AlertTitle>
                                    </div>
                                    <AlertDescription className="text-xs mt-1">
                                        {branchTestResult.message || branchTestResult.error}
                                        {branchTestResult.latencyMs !== undefined && (
                                            <span className="block text-[10px] text-muted-foreground mt-0.5">
                                                زمن الاستجابة: {branchTestResult.latencyMs} مللي ثانية | الإصدار: {branchTestResult.serverVersion || 'SQL Server'}
                                            </span>
                                        )}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* أزرار الإجراءات للفرع */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleTestBranchConnection}
                                    disabled={isTestingBranch}
                                    className="gap-2 text-xs font-bold"
                                >
                                    {isTestingBranch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-amber-500" />}
                                    {isTestingBranch ? 'جارٍ الاختبار...' : 'اختبار الاتصال بالسيرفر'}
                                </Button>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        type="button"
                                        onClick={handleSaveBranchConfig}
                                        disabled={isSavingBranch}
                                        className="gap-2 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
                                    >
                                        {isSavingBranch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        {isSavingBranch ? 'جارٍ الحفظ...' : 'حفظ وتفعيل الاتصال فوراً'}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={handleInitializeBranchDatabase}
                                        disabled={isInitializingBranch}
                                        className="gap-2 text-xs font-bold border"
                                    >
                                        {isInitializingBranch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4 text-primary" />}
                                        {isInitializingBranch ? 'جارٍ التأسيس...' : 'تأسيس وإنشاء الجداول'}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ========================================================= */}
                {/* تبويب 2: إعدادات اتصال الإدارة المركزية */}
                {/* ========================================================= */}
                <TabsContent value="central" className="space-y-5 mt-4">
                    <Card className="border shadow-sm">
                        <CardHeader className="border-b pb-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <Building2 className="h-5 w-5 text-indigo-600" />
                                        إعدادات اتصال سيرفر الإدارة المركزية (Central HQ SQL Server)
                                    </CardTitle>
                                    <CardDescription className="text-xs mt-1">
                                        قاعدة البيانات الرئيسية التي تتجمع فيها مبيعات وحركات كافة الفروع (تدعم محلي Localhost و IP سيرفر وسحابي AWS RDS).
                                    </CardDescription>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] font-bold" onClick={() => applyCentralPreset('local')}>
                                        💻 قالب محلي (Localhost)
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] font-bold" onClick={() => applyCentralPreset('external_ip')}>
                                        🌐 قالب مركزي (10.110.16.16)
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] font-bold" onClick={() => applyCentralPreset('aws_rds')}>
                                        <Cloud className="h-3 w-3 ml-1 text-amber-500" />
                                        ☁️ قالب Amazon AWS RDS
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-4 sm:p-6 space-y-5">
                            {/* خيار دور النظام المحمي */}
                            <div className="p-3.5 rounded-xl border-2 border-indigo-500/20 bg-indigo-500/5 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <span className="font-bold text-xs text-foreground block">دور النظام ونمط التشغيل (System Role Mode):</span>
                                    <span className="text-[11px] text-muted-foreground">
                                        الوضع الحالي: <strong>{centralConfig.systemRole === 'central' ? '🏢 إدارة مركزية (Central HQ)' : '🏪 فرع محلي (Sub-Branch)'}</strong>
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={centralConfig.systemRole === 'branch' ? 'default' : 'outline'}
                                        className="h-8 text-xs font-bold"
                                        onClick={() => {
                                            setRoleTarget('branch');
                                            setIsRoleDialogOpen(true);
                                        }}
                                    >
                                        <Store className="h-3.5 w-3.5 ml-1" />
                                        نمط فرع (Branch)
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={centralConfig.systemRole === 'central' ? 'default' : 'outline'}
                                        className="h-8 text-xs font-bold"
                                        onClick={() => {
                                            setRoleTarget('central');
                                            setIsRoleDialogOpen(true);
                                        }}
                                    >
                                        <Building2 className="h-3.5 w-3.5 ml-1" />
                                        نمط إدارة مركزية (HQ)
                                    </Button>
                                </div>
                            </div>

                            {/* الحقول التفصيلية للسيرفر المركزي */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 space-y-1.5">
                                    <Label className="text-xs font-bold">عنوان السيرفر المركزي (IP أو نطاق AWS RDS أو Localhost):</Label>
                                    <Input
                                        dir="ltr"
                                        value={centralConfig.centralServerIp}
                                        onChange={(e) => handleCentralFieldChange('centralServerIp', e.target.value)}
                                        placeholder="10.110.16.16 أو mydb.rds.amazonaws.com"
                                        className="h-9 font-mono text-xs font-bold"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold">منفذ السيرفر (Port):</Label>
                                    <Input
                                        dir="ltr"
                                        type="number"
                                        value={centralConfig.centralSqlPort}
                                        onChange={(e) => handleCentralFieldChange('centralSqlPort', parseInt(e.target.value, 10) || 1433)}
                                        placeholder="1433"
                                        className="h-9 font-mono text-xs"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold">اسم قاعدة بيانات الإدارة المركزية:</Label>
                                    <Input
                                        dir="ltr"
                                        value={centralConfig.centralDatabase}
                                        onChange={(e) => handleCentralFieldChange('centralDatabase', e.target.value)}
                                        placeholder="MultiBranchPOS_Central_DB"
                                        className="h-9 font-mono text-xs font-bold"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold">اسم المستخدم (User ID):</Label>
                                    <Input
                                        dir="ltr"
                                        value={centralConfig.centralUsername}
                                        onChange={(e) => handleCentralFieldChange('centralUsername', e.target.value)}
                                        placeholder="sa أو admin"
                                        className="h-9 font-mono text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold">كلمة المرور (Password):</Label>
                                    <div className="relative">
                                        <Input
                                            dir="ltr"
                                            type={showCentralPassword ? "text" : "password"}
                                            value={centralConfig.centralPassword}
                                            onChange={(e) => handleCentralFieldChange('centralPassword', e.target.value)}
                                            placeholder="••••••••"
                                            className="h-9 font-mono text-xs pr-9"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            tabIndex={-1}
                                            onClick={() => setShowCentralPassword(!showCentralPassword)}
                                            className="absolute left-1 top-1 h-7 w-7 text-muted-foreground"
                                        >
                                            {showCentralPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                                    <div className="space-y-0.5">
                                        <Label className="text-xs font-bold">تشفير الاتصال للسيرفر المركزي (Encrypt SSL):</Label>
                                        <p className="text-[10px] text-muted-foreground">يُفعل في حالة السيرفرات السحابية AWS RDS و Azure</p>
                                    </div>
                                    <Switch
                                        checked={centralConfig.centralEncrypt}
                                        onCheckedChange={(checked) => handleCentralFieldChange('centralEncrypt', checked)}
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                                    <div className="space-y-0.5">
                                        <Label className="text-xs font-bold">الوثوق بشهادة السيرفر المركزي (Trust Certificate):</Label>
                                        <p className="text-[10px] text-muted-foreground">ضروري لسيرفرات الشبكة الداخلية و VPS</p>
                                    </div>
                                    <Switch
                                        checked={centralConfig.centralTrustServerCertificate}
                                        onCheckedChange={(checked) => handleCentralFieldChange('centralTrustServerCertificate', checked)}
                                    />
                                </div>
                            </div>

                            {/* نتيجة فحص اتصال السيرفر المركزي */}
                            {centralTestResult && (
                                <Alert className={centralTestResult.success ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10"}>
                                    <div className="flex items-center gap-2">
                                        {centralTestResult.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                                        <AlertTitle className="text-xs font-bold">
                                            {centralTestResult.success ? "الاتصال بالسيرفر المركزي نشط ومستقر ✅" : "تعذر الاتصال بالسيرفر المركزي"}
                                        </AlertTitle>
                                    </div>
                                    <AlertDescription className="text-xs mt-1">
                                        {centralTestResult.message || centralTestResult.error}
                                        {centralTestResult.latencyMs !== undefined && (
                                            <span className="block text-[10px] text-muted-foreground mt-0.5">
                                                زمن الاستجابة: {centralTestResult.latencyMs} مللي ثانية
                                            </span>
                                        )}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* أزرار الإجراءات للسيرفر المركزي */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleTestCentralConnection}
                                    disabled={isTestingCentral}
                                    className="gap-2 text-xs font-bold"
                                >
                                    {isTestingCentral ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-indigo-600" />}
                                    {isTestingCentral ? 'جارٍ الاختبار...' : 'اختبار الاتصال بالسيرفر المركزي'}
                                </Button>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        type="button"
                                        onClick={handleSaveCentralConfig}
                                        disabled={isSavingCentral}
                                        className="gap-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                                    >
                                        {isSavingCentral ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        {isSavingCentral ? 'جارٍ الحفظ...' : 'حفظ إعدادات السيرفر المركزي'}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={handleInitializeCentralDatabase}
                                        disabled={isInitializingCentral}
                                        className="gap-2 text-xs font-bold border"
                                    >
                                        {isInitializingCentral ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4 text-indigo-600" />}
                                        {isInitializingCentral ? 'جارٍ التأسيس...' : 'تأسيس قاعدة الإدارة المركزية'}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ========================================================= */}
                {/* تبويب 3: تخطيط الربط والمعمارية (Topology Overview) */}
                {/* ========================================================= */}
                <TabsContent value="topology" className="space-y-5 mt-4">
                    <Card className="border shadow-sm">
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-base font-bold flex items-center gap-2">
                                <ArrowLeftRight className="h-5 w-5 text-primary" />
                                معمارية اتصال السيرفرات والمزامنة (Architecture Topology)
                            </CardTitle>
                            <CardDescription className="text-xs mt-1">
                                رسم تخطيطي يوضح موقع واستضافة قاعدة بيانات الفرع وقاعدة بيانات الإدارة ومسار المزامنة وتبادل البيانات بينهما.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="p-6">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                                {/* الطرف الأول: قاعدة بيانات الفرع */}
                                <div className="p-5 rounded-2xl border-2 border-primary/30 bg-primary/5 space-y-3 text-center">
                                    <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center">
                                        <Store className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm text-foreground">قاعدة بيانات الفرع</h3>
                                        <p className="text-[11px] text-muted-foreground">{centralConfig.currentBranchName || 'الفرع الرئيسي'} ({centralConfig.currentBranchCode || '900'})</p>
                                    </div>
                                    <div className="p-2.5 rounded-xl bg-background border space-y-1 text-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">نوع الاستضافة:</span>
                                            <Badge variant="outline" className="font-bold text-[10px]">{branchHosting.label}</Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">السيرفر:</span>
                                            <span className="font-mono text-[10px]" dir="ltr">{branchConfig.server}:{branchConfig.port}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">القاعدة:</span>
                                            <span className="font-mono font-bold text-[10px]">{branchConfig.database}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">الحالة:</span>
                                            {branchConnectedStatus?.connected ? (
                                                <span className="text-emerald-600 font-bold text-[10px]">متصلة ✅ ({branchConnectedStatus.tablesCount || 72} جدول)</span>
                                            ) : (
                                                <span className="text-destructive font-bold text-[10px]">غير متصلة ❌</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* المسار الأوسط: تدفق المزامنة */}
                                <div className="p-4 rounded-2xl border bg-muted/20 text-center space-y-3">
                                    <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center text-primary">
                                        <ArrowLeftRight className="h-5 w-5" />
                                    </div>
                                    <span className="font-bold text-xs block text-foreground">المزامنة الذاتية ثنائية الاتجاه</span>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        رفع فواتير المبيعات، سندات القبض والصرف، وحركات المخزون من الفرع إلى الإدارة ⬆️
                                        <br />
                                        سحب الأصناف، الأسعار، العروض الترويجية، وشجرة الحسابات من الإدارة إلى الفرع ⬇️
                                    </p>
                                    <div className="pt-1">
                                        <Button asChild size="sm" variant="outline" className="h-7 text-[11px] font-bold">
                                            <Link href="/settings/central-sync">فتح شاشة المزامنة والجدولة</Link>
                                        </Button>
                                    </div>
                                </div>

                                {/* الطرف الثاني: قاعدة الإدارة المركزية */}
                                <div className="p-5 rounded-2xl border-2 border-indigo-500/30 bg-indigo-500/5 space-y-3 text-center">
                                    <div className="mx-auto h-12 w-12 rounded-2xl bg-indigo-500/20 text-indigo-600 flex items-center justify-center">
                                        <Building2 className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm text-foreground">قاعدة الإدارة المركزية</h3>
                                        <p className="text-[11px] text-muted-foreground">خادم المقر الرئيسي (Central HQ)</p>
                                    </div>
                                    <div className="p-2.5 rounded-xl bg-background border space-y-1 text-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">نوع الاستضافة:</span>
                                            <Badge variant="outline" className="font-bold text-[10px]">{centralHosting.label}</Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">السيرفر:</span>
                                            <span className="font-mono text-[10px]" dir="ltr">{centralConfig.centralServerIp}:{centralConfig.centralSqlPort}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">القاعدة:</span>
                                            <span className="font-mono font-bold text-[10px]">{centralConfig.centralDatabase}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">الحالة:</span>
                                            {centralConnectedStatus?.connected ? (
                                                <span className="text-emerald-600 font-bold text-[10px]">متصلة ✅</span>
                                            ) : (
                                                <span className="text-amber-600 font-bold text-[10px]">بانتظار الاختبار / الربط</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* سجل العمليات والملاحظات اللحظية */}
            {logs.length > 0 && (
                <Card className="border bg-card">
                    <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
                        <span className="text-xs font-bold flex items-center gap-2">
                            <Terminal className="h-4 w-4 text-primary" />
                            سجل العمليات والفحص المباشر:
                        </span>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setLogs([])}>
                            مسح السجل
                        </Button>
                    </CardHeader>
                    <CardContent className="p-3">
                        <ScrollArea className="h-28 w-full rounded font-mono text-[11px] leading-relaxed p-2 bg-muted/40" dir="ltr">
                            {logs.map((log, idx) => (
                                <div key={idx} className="whitespace-pre-wrap">{log}</div>
                            ))}
                        </ScrollArea>
                    </CardContent>
                </Card>
            )}

            {/* نافذة تأكيد تبديل دور النظام */}
            <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                <DialogContent className="text-right" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            تأكيد تغيير دور النظام إلى [{roleTarget === 'central' ? 'إدارة مركزية' : 'فرع محلي'}]
                        </DialogTitle>
                        <DialogDescription className="text-xs leading-relaxed pt-2">
                            هذا الإجراء يغير طريقة عمل النظام على هذا الجهاز. يرجى إدخال كلمة مرور مسؤول النظام للتأكيد.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Label className="text-xs font-bold">كلمة مرور المسؤول (مثل كلمة مرور admin):</Label>
                        <Input
                            type="password"
                            value={rolePassword}
                            onChange={(e) => setRolePassword(e.target.value)}
                            placeholder="كلمة مرور الإدارة..."
                            className="h-9 text-xs"
                            autoFocus
                        />
                    </div>
                    <DialogFooter className="flex-row-reverse gap-2">
                        <Button variant="outline" size="sm" onClick={() => setIsRoleDialogOpen(false)}>إلغاء</Button>
                        <Button
                            size="sm"
                            disabled={!rolePassword.trim() || isSwitchingRole}
                            onClick={handleExecuteRoleSwitch}
                            className="bg-primary text-primary-foreground font-bold"
                        >
                            {isSwitchingRole ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : null}
                            تأكيد التبديل
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
