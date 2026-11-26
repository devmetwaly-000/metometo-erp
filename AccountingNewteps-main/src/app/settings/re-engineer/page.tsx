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
    Loader2, RefreshCw, CheckCircle2, Database, Server, Globe, Save,
    ShieldCheck, AlertTriangle, Copy, Eye, EyeOff, Cloud, Terminal, ArrowLeftRight,
    Building2, Store, Lock, HardDriveDownload, Flame, Activity, Layers
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
    centralHostingType: 'local' | 'vps' | 'cloud' | 'firebase';
    firebaseDatabaseUrl?: string;
    firebaseAuthToken?: string;
    firebaseProjectId?: string;
    firebaseApiKey?: string;
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

function detectHosting(server: string, encrypt?: boolean): { type: 'local' | 'cloud' | 'ip' | 'indexeddb'; label: string; icon: any } {
    const s = (server || '').toLowerCase().trim();
    if (s === 'indexeddb' || s.includes('indexeddb') || s === 'browser') {
        return { type: 'indexeddb', label: 'متصفح محلي (IndexedDB)', icon: Globe };
    }
    if (s.includes('.rds.amazonaws.com') || s.includes('.database.windows.net') || encrypt) {
        return { type: 'cloud', label: 'سحابي', icon: Cloud };
    }
    const hostOnly = s.split(':')[0].split(',')[0].replace(/^tcp:/i, '').trim();
    const isLocal =
        hostOnly === 'localhost' ||
        hostOnly === '.' ||
        hostOnly === '(local)' ||
        hostOnly.startsWith('127.') ||
        (!hostOnly.includes('.') && !hostOnly.includes(':'));

    if (isLocal) {
        return { type: 'local', label: 'سيرفر محلي', icon: Server };
    }
    return { type: 'ip', label: 'سيرفر شبكة / IP', icon: Globe };
}

export default function DatabaseReEngineeringPage() {
    const { processSyncQueue } = useData();
    const { toast } = useToast();

    // Password lock state
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [accessPassword, setAccessPassword] = useState('');
    const [isCheckingPassword, setIsCheckingPassword] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = sessionStorage.getItem('central_sync_authenticated');
            if (stored === 'true') {
                setIsUnlocked(true);
            }
        }
    }, []);

    const handleVerifyAccessPassword = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!accessPassword.trim()) {
            setAuthError('يرجى إدخال كلمة المرور للمتابعة.');
            return;
        }
        setIsCheckingPassword(true);
        setAuthError(null);
        try {
            const res = await fetch('/api/auth/verify-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: accessPassword.trim() })
            });
            const data = await res.json();
            if (data.success) {
                setIsUnlocked(true);
                sessionStorage.setItem('central_sync_authenticated', 'true');
                toast({ title: 'تم التحقق بنجاح' });
            } else {
                setAuthError(data.error || 'كلمة المرور غير صحيحة!');
            }
        } catch (err: any) {
            setAuthError(err.message || 'خطأ في الاتصال');
        } finally {
            setIsCheckingPassword(false);
        }
    };

    const handleLockScreen = () => {
        setIsUnlocked(false);
        setAccessPassword('');
        sessionStorage.removeItem('central_sync_authenticated');
        toast({ title: 'تم قفل الشاشة 🔒' });
    };

    const [activeTab, setActiveTab] = useState<'branch' | 'central' | 'topology'>('branch');

    // -------------------------------------------------------------
    // Branch DB State
    // -------------------------------------------------------------
    const [isConfigLoading, setIsConfigLoading] = useState(true);
    const [branchConfig, setBranchConfig] = useState<BranchDbConfigState>({
        connectionMode: 'connectionString',
        connectionString: '',
        server: '',
        port: 1433,
        database: 'MultiBranchPOS_DB',
        user: '',
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
        firebaseDatabaseUrl: '',
        firebaseAuthToken: '',
        firebaseProjectId: '',
        firebaseApiKey: '',
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
                    firebaseDatabaseUrl: c.firebaseDatabaseUrl || '',
                    firebaseAuthToken: c.firebaseAuthToken || '',
                    firebaseProjectId: c.firebaseProjectId || '',
                    firebaseApiKey: c.firebaseApiKey || '',
                }));
            }
        } catch (err: any) {
            console.error('Failed to load central sync config:', err);
        } finally {
            setIsConfigLoading(false);
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

    const applyBranchPreset = (type: 'local' | 'external_ip' | 'aws_rds' | 'indexeddb_firebase') => {
        if (type === 'indexeddb_firebase') {
            const next: BranchDbConfigState = {
                ...branchConfig,
                server: 'indexeddb',
                port: 0,
                database: 'MultiBranchPOS_IndexedDB',
                user: 'browser_user',
                password: '',
                encrypt: true,
                trustServerCertificate: true,
                connectionString: 'Engine=IndexedDB;Mode=BrowserLocal;Sync=FirebaseRTDB;'
            };
            setBranchConfig(next);
            try { localStorage.setItem('system_storage_engine', 'indexeddb_firebase'); } catch {}
            setCentralConfig(prev => ({ ...prev, centralHostingType: 'firebase' }));
        } else if (type === 'local') {
            try { localStorage.setItem('system_storage_engine', 'sql'); } catch {}
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

    
    const handleFirebaseSmartPaste = (raw: string) => {
        let dbUrl = '';
        let projId = '';
        let key = '';

        const dbUrlMatch = raw.match(/databaseURL\s*:\s*["']([^"']+)["']/i) || 
                           raw.match(/https:\/\/[a-z0-9-]+\.(?:europe-west1\.|asia-southeast1\.)?firebasedatabase\.app/i) || 
                           raw.match(/https:\/\/[a-z0-9-]+-default-rtdb\.firebaseio\.com/i) || 
                           raw.match(/https:\/\/[a-z0-9-]+\.firebaseio\.com/i);
        if (dbUrlMatch) dbUrl = dbUrlMatch[1] || dbUrlMatch[0];

        const projMatch = raw.match(/projectId\s*:\s*["']([^"']+)["']/i);
        if (projMatch) projId = projMatch[1];

        const keyMatch = raw.match(/apiKey\s*:\s*["']([^"']+)["']/i) || 
                         raw.match(/auth[_\s-]*token\s*[:=]\s*["']?([a-zA-Z0-9_\-]+)["']?/i);
        if (keyMatch) key = keyMatch[1];

        setCentralConfig(prev => ({
            ...prev,
            centralHostingType: 'firebase',
            firebaseDatabaseUrl: dbUrl || prev.firebaseDatabaseUrl,
            firebaseProjectId: projId || prev.firebaseProjectId,
            firebaseAuthToken: key || prev.firebaseAuthToken
        }));
        toast({ title: 'تم استخراج بيانات Firebase بنجاح 📋' });
    };

    const applyArchitectureScenario = async (scenarioId: number) => {
        if (scenarioId === 1) {
            applyBranchPreset('local');
            applyCentralPreset('external_ip');
            toast({ title: 'تم تفعيل السيناريو 1: سيكوال محلي ➔ سيكوال شبكة LAN' });
        } else if (scenarioId === 2) {
            applyBranchPreset('local');
            applyCentralPreset('aws_rds');
            toast({ title: 'تم تفعيل السيناريو 2: سيكوال محلي ➔ سيكوال أمازون AWS' });
        } else if (scenarioId === 3) {
            applyBranchPreset('local');
            setCentralConfig(prev => ({
                ...prev,
                centralHostingType: 'vps',
                centralServerIp: '10.110.16.16',
                centralSqlPort: 1433,
                centralDatabase: 'MultiBranchPOS_Central_DB',
                centralUsername: 'sa'
            }));
            toast({ title: 'تم تفعيل السيناريو 3: سيكوال محلي ➔ سيكوال خارجي VPS IP' });
        } else if (scenarioId === 4) {
            applyBranchPreset('aws_rds');
            setCentralConfig(prev => ({
                ...prev,
                centralHostingType: 'vps',
                centralServerIp: '10.110.16.16',
                centralSqlPort: 1433,
                centralDatabase: 'MultiBranchPOS_Central_DB',
                centralUsername: 'sa'
            }));
            toast({ title: 'تم تفعيل السيناريو 4: سيكوال سحابي ➔ سيكوال خارجي VPS IP' });
        } else if (scenarioId === 5) {
            applyBranchPreset('aws_rds');
            applyCentralPreset('aws_rds');
            toast({ title: 'تم تفعيل السيناريو 5: سيكوال أمازون ➔ سيكوال مركزي أمازون AWS' });
        } else if (scenarioId === 6) {
            applyBranchPreset('aws_rds');
            applyCentralPreset('local');
            toast({ title: 'تم تفعيل السيناريو 6: سيكوال سحابي ➔ سيكوال مركزي لوكال IP' });
        } else if (scenarioId === 7) {
            applyBranchPreset('indexeddb_firebase');
            setCentralConfig(prev => ({
                ...prev,
                centralHostingType: 'firebase'
            }));
            toast({ title: 'تم تفعيل السيناريو 7: متصفح محلي Index DB ➔ سحابة مركزية Firebase' });
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
            if (branchConfig.server === 'indexeddb') {
                try {
                    localStorage.setItem('system_storage_engine', 'indexeddb_firebase');
                    localStorage.setItem('branch_db_config', JSON.stringify(branchConfig));
                } catch {}
            }
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

    const applyCentralPreset = (type: 'local' | 'external_ip' | 'aws_rds' | 'firebase') => {
        if (type === 'firebase') {
            setCentralConfig(prev => ({
                ...prev,
                centralHostingType: 'firebase',
            }));
            return;
        }
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

    if (!isUnlocked) {
        return (
            <div className="flex flex-col w-full min-h-[75vh] items-center justify-center p-4">
                <Card className="w-full max-w-md border border-border shadow-xl bg-card text-card-foreground">
                    <CardHeader className="text-center pb-4">
                        <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-3 text-amber-600 dark:text-amber-400">
                            <Lock className="w-7 h-7" />
                        </div>
                        <CardTitle className="text-xl font-bold">
                            شاشة إعدادات السيرفرات محمية
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            إعدادات السيرفر وقواعد البيانات حساسة. يرجى إدخال كلمة مرور الإدارة للمتابعة.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleVerifyAccessPassword} className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">كلمة مرور الإدارة / النظام</Label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="أدخل كلمة المرور..."
                                        value={accessPassword}
                                        onChange={(e) => {
                                            setAccessPassword(e.target.value);
                                            if (authError) setAuthError(null);
                                        }}
                                        autoFocus
                                        className="h-10 text-center font-mono tracking-widest text-base pl-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs p-1"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                {authError && (
                                    <div className="flex items-center gap-1.5 text-xs text-rose-500 font-medium bg-rose-500/10 p-2.5 rounded-md border border-rose-500/20">
                                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                        <span>{authError}</span>
                                    </div>
                                )}
                            </div>

                            <Button 
                                type="submit" 
                                className="w-full h-10 font-bold gap-2 text-sm"
                                disabled={isCheckingPassword || !accessPassword.trim()}
                            >
                                {isCheckingPassword ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>جارٍ التحقق...</span>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="h-4 w-4" />
                                        <span>تأكيد والدخول للإعدادات</span>
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6 max-w-7xl mx-auto w-full">
            <PageHeader
                title="مركز إدارة السيرفرات وقواعد البيانات (الفرع والإدارة المركزية)"
                description="إدارة اتصال قاعدة بيانات الفرع وقاعدة بيانات الإدارة المركزية"
            >
                <div className="w-full sm:w-auto grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 sm:gap-2">
                    <Button asChild variant="outline" size="sm" className="col-span-1 w-full sm:w-auto justify-center gap-1.5 text-xs font-bold h-8.5 sm:h-8">
                        <Link href="/settings/backup">
                            <HardDriveDownload className="h-3.5 w-3.5 text-primary" />
                            النسخ والضبط
                        </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="col-span-1 w-full sm:w-auto justify-center gap-1.5 text-xs font-bold h-8.5 sm:h-8">
                        <Link href="/settings/central-sync">
                            <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
                            المزامنة المركزية
                        </Link>
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleLockScreen} className="col-span-1 w-full sm:w-auto justify-center gap-1.5 text-xs font-bold text-rose-500 hover:text-rose-600 h-8.5 sm:h-8">
                        <Lock className="h-3.5 w-3.5" />
                        قفل الشاشة
                    </Button>
                    <Button variant="outline" size="sm" onClick={loadAllConfigs} className="col-span-1 w-full sm:w-auto justify-center gap-1.5 text-xs font-bold h-8.5 sm:h-8">
                        <RefreshCw className="h-3.5 w-3.5" />
                        تحديث الحالة
                    </Button>
                </div>
            </PageHeader>

            {/* شريط الملخص العلوي للفرع والإدارة */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {/* 1. بطاقة ملخص الفرع (تظهر أولاً) */}
                <Card className={cn(
                    "border-2 transition-all",
                    branchConnectedStatus?.connected ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"
                )}>
                    <CardContent className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <Database className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-foreground">قاعدة بيانات الفرع</span>
                                    {isConfigLoading ? (
                                        <Badge variant="outline" className="text-[10px] animate-pulse">جارٍ فحص الاستضافة...</Badge>
                                    ) : (
                                        <Badge variant="outline" className={cn(
                                            "text-[10px] font-bold",
                                            branchHosting.type === 'indexeddb' ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30" :
                                            branchHosting.type === 'cloud' ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" :
                                            branchHosting.type === 'ip' ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30" :
                                            "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                        )}>
                                            {branchHosting.label}
                                        </Badge>
                                    )}
                                    {isConfigLoading ? (
                                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 animate-pulse">...</Badge>
                                    ) : branchConnectedStatus?.connected ? (
                                        <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0">متصلة ✅</Badge>
                                    ) : (
                                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0">غير متصلة</Badge>
                                    )}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5 font-mono break-all" dir="ltr">
                                    {isConfigLoading ? 'جارٍ جلب السيرفر المتصل...' : `${branchConfig.server}:${branchConfig.port} [${branchConfig.database}]`}
                                </div>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant={activeTab === 'branch' ? 'default' : 'outline'}
                            className="h-8 text-xs font-bold w-full sm:w-auto shrink-0 justify-center"
                            onClick={() => setActiveTab('branch')}
                        >
                            تعديل إعدادات الفرع
                        </Button>
                    </CardContent>
                </Card>

                {/* 2. بطاقة ملخص الإدارة المركزية (تظهر ثانياً) */}
                <Card className={cn(
                    "border-2 transition-all",
                    centralConnectedStatus?.connected ? "border-emerald-500/40 bg-emerald-500/5" : "border-indigo-500/40 bg-indigo-500/5"
                )}>
                    <CardContent className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                                <Globe className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
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
                                <div className="text-[11px] text-muted-foreground mt-0.5 font-mono break-all" dir="ltr">
                                    {centralConfig.centralServerIp}:{centralConfig.centralSqlPort} [{centralConfig.centralDatabase}]
                                </div>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant={activeTab === 'central' ? 'default' : 'outline'}
                            className="h-8 text-xs font-bold w-full sm:w-auto shrink-0 justify-center"
                            onClick={() => setActiveTab('central')}
                        >
                            تعديل إعدادات الإدارة
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* التبويبات الرئيسية الموحدة بترتيب عربي متوافق تماماً */}
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} dir="rtl" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-auto sm:h-11 p-1 bg-muted/60 gap-1">
                    <TabsTrigger value="branch" className="text-[11px] sm:text-xs font-bold gap-1 sm:gap-2 py-2 px-1 text-center justify-center">
                        <Store className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                        <span className="truncate">1. قاعدة الفرع</span>
                    </TabsTrigger>
                    <TabsTrigger value="central" className="text-[11px] sm:text-xs font-bold gap-1 sm:gap-2 py-2 px-1 text-center justify-center">
                        <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                        <span className="truncate">2. قاعدة الإدارة</span>
                    </TabsTrigger>
                    <TabsTrigger value="topology" className="text-[11px] sm:text-xs font-bold gap-1 sm:gap-2 py-2 px-1 text-center justify-center">
                        <ArrowLeftRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                        <span className="truncate">3. تخطيط الربط</span>
                    </TabsTrigger>
                </TabsList>

                {/* ========================================================= */}
                {/* تبويب 1: إعدادات اتصال الفرع */}
                {/* ========================================================= */}
                <TabsContent value="branch" className="space-y-4 sm:space-y-5 mt-4">
                    <Card className="border shadow-sm">
                        <CardHeader className="border-b pb-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                                <div>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <Store className="h-5 w-5 text-primary" />
                                        إعدادات اتصال سيرفر الفرع
                                    </CardTitle>
                                    <CardDescription className="text-xs mt-1">
                                        قاعدة البيانات المحلية المخصصة للفرع ونقطة البيع.
                                    </CardDescription>
                                </div>
                                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 w-full sm:w-auto">
                                    <Button type="button" variant="outline" size="sm" className="h-8 sm:h-7 text-[11px] font-bold w-full sm:w-auto justify-center border-purple-500/40 text-purple-700 dark:text-purple-300 hover:bg-purple-500/10" onClick={() => applyBranchPreset('indexeddb_firebase')}>
                                        <Globe className="h-3.5 w-3.5 ml-1 text-purple-600" />
                                        متصفح (IndexedDB + فايربيز)
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-8 sm:h-7 text-[11px] font-bold w-full sm:w-auto justify-center" onClick={() => applyBranchPreset('local')}>
                                        💻 محلي
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-8 sm:h-7 text-[11px] font-bold w-full sm:w-auto justify-center" onClick={() => applyBranchPreset('external_ip')}>
                                        🌐 شبكة / IP
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-8 sm:h-7 text-[11px] font-bold w-full sm:w-auto justify-center" onClick={() => applyBranchPreset('aws_rds')}>
                                        <Cloud className="h-3 w-3 ml-1 text-amber-500" />
                                        ☁️ سحابي
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-3.5 sm:p-6 space-y-4 sm:space-y-5">
                            {branchConfig.server === 'indexeddb' && (
                                <div className="space-y-3 mb-4">
                                    <Alert className="border-purple-500/30 bg-purple-500/5">
                                        <CheckCircle2 className="h-4 w-4 text-purple-600" />
                                        <AlertTitle className="text-xs font-bold text-purple-800 dark:text-purple-200">وضع المتصفح الذكي (IndexedDB) نشط محلياً</AlertTitle>
                                        <AlertDescription className="text-xs text-purple-700/90 dark:text-purple-300/90 mt-1">
                                            يعمل هذا الفرع حالياً بتخزين محلي فائق السرعة داخل المتصفح (IndexedDB) بدون الحاجة لتثبيت أي سيرفر محلي. وتعتبر سحابة Firebase Realtime هي القاعدة المركزية لجميع الأجهزة المشتركة.
                                        </AlertDescription>
                                    </Alert>

                                    {/* بطاقة إدخال بيانات سحابة Firebase المركزية الإلزامية */}
                                    <div className="p-4 rounded-xl border-2 border-orange-500/30 bg-orange-500/5 space-y-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <Flame className="h-5 w-5 text-orange-600 shrink-0" />
                                                <span className="font-bold text-xs text-foreground">بيانات سحابة Firebase المركزية (مطلوبة لمزامنة الأجهزة)</span>
                                            </div>
                                            <Badge variant="outline" className="text-[10px] w-fit border-orange-500/40 text-orange-700 dark:text-orange-300 font-bold">
                                                القاعدة المركزية المشتركة 🔥
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            عند استخدام المتصفح (IndexedDB)، تكون سحابة Firebase هي المرجع المركزي لجميع الأجهزة والفروع لمزامنة الفواتير والأصناف والأسعار.
                                        </p>

                                        {/* مربع اللصق الذكي */}
                                        <div className="space-y-1">
                                            <Label className="text-[11px] font-bold">لصق كود أو إعدادات Firebase مباشرة (Smart Paste):</Label>
                                            <Textarea
                                                dir="ltr"
                                                rows={2}
                                                placeholder='الصق كود الـ JSON أو الـ Config كاملاً (databaseURL, apiKey, projectId...)'
                                                onChange={(e) => handleFirebaseSmartPaste(e.target.value)}
                                                className="font-mono text-xs"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="sm:col-span-2 space-y-1">
                                                <Label className="text-[11px] font-bold">رابط قاعدة البيانات (Database URL) *:</Label>
                                                <Input
                                                    dir="ltr"
                                                    value={centralConfig.firebaseDatabaseUrl || ''}
                                                    onChange={(e) => handleCentralFieldChange('firebaseDatabaseUrl', e.target.value)}
                                                    placeholder="https://your-app-default-rtdb.firebaseio.com"
                                                    className="h-8 font-mono text-xs font-bold"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-bold">معرف المشروع (Project ID):</Label>
                                                <Input
                                                    dir="ltr"
                                                    value={centralConfig.firebaseProjectId || ''}
                                                    onChange={(e) => handleCentralFieldChange('firebaseProjectId', e.target.value)}
                                                    placeholder="your-project-id"
                                                    className="h-8 font-mono text-xs"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-[11px] font-bold">المفتاح السري أو رمز المصادقة (Auth Token / Secret):</Label>
                                            <div className="relative">
                                                <Input
                                                    dir="ltr"
                                                    type={showCentralPassword ? "text" : "password"}
                                                    value={centralConfig.firebaseAuthToken || centralConfig.firebaseApiKey || ''}
                                                    onChange={(e) => {
                                                        handleCentralFieldChange('firebaseAuthToken', e.target.value);
                                                        handleCentralFieldChange('firebaseApiKey', e.target.value);
                                                    }}
                                                    placeholder="Database Secret or Web API Key"
                                                    className="h-8 font-mono text-xs pl-9"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="absolute left-1 top-1 h-6 w-6 p-0 text-muted-foreground"
                                                    onClick={() => setShowCentralPassword(!showCentralPassword)}
                                                >
                                                    {showCentralPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleTestCentralConnection}
                                                disabled={isTestingCentral}
                                                className="h-8 text-xs font-bold gap-1.5"
                                            >
                                                {isTestingCentral ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5 text-orange-600" />}
                                                اختبار اتصال Firebase
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={handleSaveCentralConfig}
                                                disabled={isSavingCentral}
                                                className="h-8 text-xs font-bold gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
                                            >
                                                {isSavingCentral ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                                حفظ إعدادات Firebase المركزية
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <Tabs
                                value={branchConfig.connectionMode || 'fields'}
                                onValueChange={(v) => handleBranchFieldChange('connectionMode', v as 'fields' | 'connectionString')}
                            >
                                <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 mb-4 h-auto gap-1 p-1 bg-muted/60">
                                    <TabsTrigger value="connectionString" className="text-[11px] sm:text-xs font-bold gap-1.5 py-2">
                                        <Terminal className="h-3.5 w-3.5" />
                                        نص الاتصال (Connection String)
                                    </TabsTrigger>
                                    <TabsTrigger value="fields" className="text-[11px] sm:text-xs font-bold gap-1.5 py-2">
                                        <Server className="h-3.5 w-3.5" />
                                        الحقول التفصيلية (Host / Database / User)
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
                                            placeholder="Server=localhost,1433;Database=MultiBranchPOS_DB;User Id=sa;Password=***;"
                                            className="font-mono text-xs leading-relaxed"
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent value="fields" className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                                        <div className="sm:col-span-2 space-y-1.5">
                                            <Label className="text-xs font-bold">عنوان السيرفر:</Label>
                                            <Input
                                                dir="ltr"
                                                value={branchConfig.server}
                                                onChange={(e) => handleBranchFieldChange('server', e.target.value)}
                                                placeholder="localhost أو 192.168.1.100"
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

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
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
                                        <div className="space-y-1.5 sm:col-span-2 md:col-span-1">
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

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold">تشفير الاتصال (Encrypt SSL):</Label>
                                                <p className="text-[10px] text-muted-foreground">يلزم تفعيله (True) للسيرفرات السحابية المشفرة</p>
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
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleTestBranchConnection}
                                    disabled={isTestingBranch}
                                    className="gap-2 text-xs font-bold h-8.5 sm:h-8 w-full sm:w-auto justify-center"
                                >
                                    {isTestingBranch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4 text-emerald-600" />}
                                    {isTestingBranch ? 'جارٍ الاختبار...' : 'اختبار الاتصال بالسيرفر'}
                                </Button>

                                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
                                    <Button
                                        type="button"
                                        onClick={handleSaveBranchConfig}
                                        disabled={isSavingBranch}
                                        className="gap-2 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground h-8.5 sm:h-8 w-full sm:w-auto justify-center"
                                    >
                                        {isSavingBranch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        {isSavingBranch ? 'جارٍ الحفظ...' : 'حفظ وتفعيل الاتصال فوراً'}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={handleInitializeBranchDatabase}
                                        disabled={isInitializingBranch}
                                        className="gap-2 text-xs font-bold border h-8.5 sm:h-8 w-full sm:w-auto justify-center"
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
                <TabsContent value="central" className="space-y-4 sm:space-y-5 mt-4">
                    <Card className="border shadow-sm">
                        <CardHeader className="border-b pb-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                                <div>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <Building2 className="h-5 w-5 text-indigo-600" />
                                        إعدادات اتصال سيرفر الإدارة المركزية
                                    </CardTitle>
                                    <CardDescription className="text-xs mt-1">
                                        قاعدة البيانات الرئيسية التي تتجمع فيها حركات ومبيعات الفروع.
                                    </CardDescription>
                                </div>
                                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 w-full sm:w-auto">
                                    <Button type="button" variant="outline" size="sm" className="h-8 sm:h-7 text-[11px] font-bold w-full sm:w-auto justify-center border-orange-500/40 text-orange-700 dark:text-orange-300 hover:bg-orange-500/10" onClick={() => applyCentralPreset('firebase')}>
                                        <Flame className="h-3 w-3 ml-1 text-orange-600" />
                                        🔥 سحابة Firebase
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-8 sm:h-7 text-[11px] font-bold w-full sm:w-auto justify-center" onClick={() => applyCentralPreset('local')}>
                                        💻 محلي
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-8 sm:h-7 text-[11px] font-bold w-full sm:w-auto justify-center" onClick={() => applyCentralPreset('external_ip')}>
                                        🌐 شبكة / IP
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="h-8 sm:h-7 text-[11px] font-bold w-full sm:w-auto justify-center" onClick={() => applyCentralPreset('aws_rds')}>
                                        <Cloud className="h-3 w-3 ml-1 text-amber-500" />
                                        ☁️ سحابي
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-3.5 sm:p-6 space-y-4 sm:space-y-5">
                            {/* خيار دور النظام المحمي */}
                            <div className="p-3.5 rounded-xl border-2 border-indigo-500/20 bg-indigo-500/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                                <div>
                                    <span className="font-bold text-xs text-foreground block">دور النظام:</span>
                                    <span className="text-[11px] text-muted-foreground">
                                        الوضع الحالي: <strong>{centralConfig.systemRole === 'central' ? 'إدارة مركزية' : 'فرع محلي'}</strong>
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:flex items-center gap-1.5 w-full sm:w-auto">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={centralConfig.systemRole === 'branch' ? 'default' : 'outline'}
                                        className="h-8 text-xs font-bold w-full sm:w-auto justify-center"
                                        onClick={() => {
                                            setRoleTarget('branch');
                                            setIsRoleDialogOpen(true);
                                        }}
                                    >
                                        <Store className="h-3.5 w-3.5 ml-1" />
                                        نمط فرع
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={centralConfig.systemRole === 'central' ? 'default' : 'outline'}
                                        className="h-8 text-xs font-bold w-full sm:w-auto justify-center"
                                        onClick={() => {
                                            setRoleTarget('central');
                                            setIsRoleDialogOpen(true);
                                        }}
                                    >
                                        <Building2 className="h-3.5 w-3.5 ml-1" />
                                        نمط إدارة مركزية
                                    </Button>
                                </div>
                            </div>

                            {/* إذا كان المزود المركزي هو سحابة Firebase Realtime */}
                            {centralConfig.centralHostingType === 'firebase' ? (
                                <div className="space-y-4 p-4 rounded-xl border-2 border-orange-500/30 bg-orange-500/5">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-orange-500/20 pb-2">
                                        <div className="flex items-center gap-2">
                                            <Flame className="h-5 w-5 text-orange-600" />
                                            <span className="font-bold text-sm text-foreground">بيانات سحابة Firebase Realtime Database المركزية</span>
                                        </div>
                                        <Badge variant="outline" className="border-orange-500/40 text-orange-700 dark:text-orange-300 font-bold text-[10px]">
                                            سحابة مركزية NoSQL 🔥
                                        </Badge>
                                    </div>

                                    {/* مربع اللصق الذكي */}
                                    <div className="space-y-1">
                                        <Label className="text-xs font-bold">لصق كود أو إعدادات Firebase مباشرة (Smart Paste):</Label>
                                        <Textarea
                                            dir="ltr"
                                            rows={2}
                                            placeholder='الصق كود الـ JSON أو الـ Config كاملاً (databaseURL, apiKey, projectId...)'
                                            onChange={(e) => handleFirebaseSmartPaste(e.target.value)}
                                            className="font-mono text-xs"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                                        <div className="sm:col-span-2 space-y-1.5">
                                            <Label className="text-xs font-bold">رابط قاعدة بيانات Firebase (Database URL) *:</Label>
                                            <Input
                                                dir="ltr"
                                                value={centralConfig.firebaseDatabaseUrl || ''}
                                                onChange={(e) => handleCentralFieldChange('firebaseDatabaseUrl', e.target.value)}
                                                placeholder="https://your-app-default-rtdb.firebaseio.com"
                                                className="h-9 font-mono text-xs font-bold"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold">معرف المشروع (Project ID):</Label>
                                            <Input
                                                dir="ltr"
                                                value={centralConfig.firebaseProjectId || ''}
                                                onChange={(e) => handleCentralFieldChange('firebaseProjectId', e.target.value)}
                                                placeholder="your-project-id"
                                                className="h-9 font-mono text-xs"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold">رمز المصادقة أو المفتاح السري (Auth Token / Database Secret):</Label>
                                        <div className="relative">
                                            <Input
                                                dir="ltr"
                                                type={showCentralPassword ? "text" : "password"}
                                                value={centralConfig.firebaseAuthToken || centralConfig.firebaseApiKey || ''}
                                                onChange={(e) => {
                                                    handleCentralFieldChange('firebaseAuthToken', e.target.value);
                                                    handleCentralFieldChange('firebaseApiKey', e.target.value);
                                                }}
                                                placeholder="Database Secret or API Key"
                                                className="h-9 font-mono text-xs pl-9"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute left-1 top-1 h-7 w-7 p-0 text-muted-foreground"
                                                onClick={() => setShowCentralPassword(!showCentralPassword)}
                                            >
                                                {showCentralPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                            <>
                            {/* الحقول التفصيلية لسيرفر SQL Server المركزي */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                                <div className="sm:col-span-2 space-y-1.5">
                                    <Label className="text-xs font-bold">عنوان السيرفر المركزي (IP أو النطاق أو Localhost):</Label>
                                    <Input
                                        dir="ltr"
                                        value={centralConfig.centralServerIp}
                                        onChange={(e) => handleCentralFieldChange('centralServerIp', e.target.value)}
                                        placeholder="10.110.16.16 أو central-db.example.com"
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

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
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
                                <div className="space-y-1.5 sm:col-span-2 md:col-span-1">
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

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                                    <div className="space-y-0.5">
                                        <Label className="text-xs font-bold">تشفير الاتصال للسيرفر المركزي (Encrypt SSL):</Label>
                                        <p className="text-[10px] text-muted-foreground">يُفعل في حالة الاتصال بالسيرفرات السحابية المشفرة</p>
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

                            </>)}

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
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleTestCentralConnection}
                                    disabled={isTestingCentral}
                                    className="gap-2 text-xs font-bold h-8.5 sm:h-8 w-full sm:w-auto justify-center"
                                >
                                    {isTestingCentral ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4 text-indigo-600" />}
                                    {isTestingCentral ? 'جارٍ الاختبار...' : 'اختبار الاتصال بالسيرفر المركزي'}
                                </Button>

                                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
                                    <Button
                                        type="button"
                                        onClick={handleSaveCentralConfig}
                                        disabled={isSavingCentral}
                                        className="gap-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white h-8.5 sm:h-8 w-full sm:w-auto justify-center"
                                    >
                                        {isSavingCentral ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        {isSavingCentral ? 'جارٍ الحفظ...' : 'حفظ إعدادات السيرفر المركزي'}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={handleInitializeCentralDatabase}
                                        disabled={isInitializingCentral}
                                        className="gap-2 text-xs font-bold border h-8.5 sm:h-8 w-full sm:w-auto justify-center"
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

                        <CardContent className="p-6 space-y-6">
                            {/* مصفوفة السيناريوهات السبعة للربط والمزامنة */}
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                                    <div>
                                        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                                            <Layers className="h-4 w-4 text-primary" />
                                            السيناريوهات السبعة المعتمدة لمعمارية النظام (Architecture Scenarios)
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">
                                            اضغط على أي سيناريو أدناه لتهيئة وضبط السيرفر المحلي والمركزي تلقائياً بضغطة زر واحدة:
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="text-[10px] font-mono w-fit">
                                        7 سيناريوهات تشغيلية
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                                    {[
                                        { id: 1, title: '1. سيكوال محلي ➔ سيكوال مركزي (LAN IP)', badge: 'شبكة داخلية', desc: 'سيرفر SQL محلي بالفرع، وسيرفر SQL رئيسي على شبكة المحل (LAN)', color: 'border-emerald-500/30 bg-emerald-500/5' },
                                        { id: 2, title: '2. سيكوال محلي ➔ سيكوال مركزي (أمازون AWS)', badge: 'هجين سحابي', desc: 'سيرفر SQL محلي سريع بالفرع، ومزامنة مع قاعدة سحابية على AWS RDS', color: 'border-sky-500/30 bg-sky-500/5' },
                                        { id: 3, title: '3. سيكوال محلي ➔ سيكوال مركزي (VPS IP)', badge: 'سيرفر VPS', desc: 'سيرفر SQL محلي بالفرع، ومزامنة مع سيرفر VPS خارجي بـ Real IP', color: 'border-indigo-500/30 bg-indigo-500/5' },
                                        { id: 4, title: '4. سيكوال سحابي ➔ سيكوال مركزي (VPS IP)', badge: 'سحابي متعدد', desc: 'سيرفر الفرع سحابي مشفر، وسيرفر الإدارة على VPS خارجي', color: 'border-amber-500/30 bg-amber-500/5' },
                                        { id: 5, title: '5. سيكوال أمازون ➔ سيكوال مركزي (أمازون AWS)', badge: 'سحابي موحد', desc: 'الفرع والإدارة يعملان على نفس السيرفر السحابي عالي الأداء AWS RDS', color: 'border-blue-500/30 bg-blue-500/5' },
                                        { id: 6, title: '6. سيكوال سحابي ➔ سيكوال مركزي (لوكال IP)', badge: 'عكسي محلي', desc: 'الفرع مربوط بسيرفر سحابي، بينما سيرفر الإدارة على سيرفر محلي LAN', color: 'border-teal-500/30 bg-teal-500/5' },
                                        { id: 7, title: '7. متصفح محلي (Index DB) ➔ سحابة Firebase', badge: 'Zero-Install 🔥', desc: 'الفرع على المتصفح بـ Index DB بدون تثبيت، وسحابة Firebase قاعدة مركزية لجميع الأجهزة', color: 'border-purple-500/40 bg-purple-500/10' }
                                    ].map(sc => (
                                        <div key={sc.id} className={cn("p-3.5 rounded-xl border-2 flex flex-col justify-between gap-2.5 transition-all hover:shadow-sm", sc.color)}>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="font-bold text-xs text-foreground">{sc.title}</span>
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0">{sc.badge}</Badge>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground leading-snug">{sc.desc}</p>
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="w-full text-xs font-bold h-7.5 bg-background/80 hover:bg-background"
                                                onClick={() => applyArchitectureScenario(sc.id)}
                                            >
                                                تطبيق هذا السيناريو
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="border-t pt-5 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
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
                                                <span className="text-emerald-600 font-bold text-[10px]">متصلة ✅ ({branchConnectedStatus.tablesCount || 98} جدول)</span>
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
                <DialogContent className="text-right w-[94vw] sm:max-w-md" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base">
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
                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t">
                        <Button variant="outline" size="sm" onClick={() => setIsRoleDialogOpen(false)} className="w-full sm:w-auto">إلغاء</Button>
                        <Button
                            size="sm"
                            disabled={!rolePassword.trim() || isSwitchingRole}
                            onClick={handleExecuteRoleSwitch}
                            className="bg-primary text-primary-foreground font-bold w-full sm:w-auto"
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
