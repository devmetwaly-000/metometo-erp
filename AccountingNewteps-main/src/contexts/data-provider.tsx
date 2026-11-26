"use client";

import React, { createContext, useContext, ReactNode, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import localforage from 'localforage';

export const PARTITION_CONFIG: Record<string, string> = {
    salesInvoices: 'date',
    posSales: 'date',
    salesReturns: 'date',
    posReturns: 'date',
    purchaseInvoices: 'date',
    purchaseReturns: 'date',
    purchaseOrders: 'date',
    stockInRecords: 'date',
    stockOutRecords: 'date',
    stockTransferRecords: 'date',
    stockAdjustmentRecords: 'date',
    stockIssuesToReps: 'date',
    stockReturnsFromReps: 'date',
    expenses: 'date',
    customerPayments: 'date',
    supplierPayments: 'date',
    treasuryTransactions: 'date',
    profitDistributions: 'date',
    employeeAdvances: 'date',
    employeeAdjustments: 'date',
    repRemittances: 'date',
    payrollRecords: 'date',
    priceChangeLogs: 'timestamp',
    gratuityLogs: 'date',
    gratuityDistributions: 'date',
    customerVisits: 'timestamp',
    loginHistory: 'timestamp',
    syncHistory: 'timestamp',
    posAuditLogs: 'date',
    posReconciliations: 'date',
    depreciationRecords: 'date',
    inventoryClosings: 'closingDate'
};

interface DataContextType {
    // Master Data
    allItems: any[];
    items: any[];
    customers: any[];
    suppliers: any[];
    warehouses: any[];
    allWarehouses: any[];
    repWarehouses: any[];
    cashAccounts: any[];
    partners: any[];
    users: any[];
    deliveryStaff: any[];
    itemGroups: any[];
    itemSections: any[];
    itemCategories: any[];
    itemSubCategories1: any[];
    itemSubCategories2: any[];
    inventoryZones: any[];
    inventorySections: any[];
    itemColors: any[];
    itemSizes: any[];
    barcodeDesigns: any[];
    posTerminals: any[];
    promotions: any[];
    paymentMethods: any[];
    sellers: any[];
    roles: any; 
    settings: any;
    inventory: any[];
    restaurantTables: any[];
    targets: any;
    licenses: any[];
    snoozedRecommendations: any[];
    syncHistory: any[];
    customerVisits: any[]; 
    loginHistory: any[]; 

    // Inventory
    stockInRecords: any[];
    stockOutRecords: any[];
    stockTransferRecords: any[];
    stockAdjustmentRecords: any[];
    stockIssuesToReps: any[];
    stockReturnsFromReps: any[];
    inventoryClosings: any[];
    requisitions: any[];

    // Sales & Purchases
    salesInvoices: any[];
    salesReturns: any[];
    purchaseInvoices: any[];
    purchaseReturns: any[];
    purchaseOrders: any[];
    posSales: any[];
    posReturns: any[];
    posSessions: any[];
    posAuditLogs: any[];
    posReconciliations: any[];
    heldInvoices: any[];
    posCounters: any;

    // Accounting
    expenses: any[];
    exceptionalIncomes: any[];
    customerPayments: any[];
    supplierPayments: any[];
    treasuryTransactions: any[];
    profitDistributions: any[];
    priceChangeLogs: any[];
    gratuityLogs: any[];
    gratuityDistributions: any[];
    
    // HR
    employees: any[];
    employeeAdvances: any[];
    employeeAdjustments: any[];
    repRemittances: any[];
    payrollRecords: any[];
    
    // Assets
    fixedAssets: any[];
    depreciationRecords: any[];

    // Actions
    dbAction: (path: string, action: 'add' | 'update' | 'remove' | 'transaction', payload?: any, priority?: 'high' | 'normal' | 'low') => Promise<string | void>;
    getNextId: (counterName: string, startFrom?: number) => Promise<number | null>;

    loading: boolean;
    isOnline: boolean;
    hasCheckedConnection: boolean;
    databaseSetupRequired: boolean;
    databaseName: string;
    createLocalDatabase: () => Promise<void>;
    retryDatabaseConnection: () => Promise<boolean>;
    databaseSetupError: string | null;
    isCreatingLocalDatabase: boolean;
    syncQueueCount: number;
    offlineQueueCount: number;
    isSyncingOffline: boolean;
    flushOfflineSyncQueue: () => Promise<void>;
    unreconciledDeliveryCount: number; 
    processSyncQueue: () => Promise<void>;
    allData: any;
    systemRole: 'branch' | 'central';
    isCentral: boolean;
    goOffline: () => void;
    goOnline: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);
const CACHE_KEY = 'multibranch-pos-sql-cache-v5';

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [allData, setAllData] = useState<any>({});
    const [isOnline, setIsOnline] = useState(true);
    const [hasCheckedConnection, setHasCheckedConnection] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [databaseSetupRequired, setDatabaseSetupRequired] = useState(false);
    const [databaseName, setDatabaseName] = useState('MultiBranchPOS_DB');
    const [databaseSetupError, setDatabaseSetupError] = useState<string | null>(null);
    const [isCreatingLocalDatabase, setIsCreatingLocalDatabase] = useState(false);
    const isOnlineRef = useRef(isOnline);
    const isCheckingHealthRef = useRef(false);
    const lastHealthCheckAtRef = useRef(0);

    useEffect(() => {
        isOnlineRef.current = isOnline;
    }, [isOnline]);

    const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0);
    const [isSyncingOffline, setIsSyncingOffline] = useState<boolean>(false);

    const refreshOfflineQueueCount = useCallback(() => {
        if (typeof window === 'undefined') return 0;
        try {
            const raw = localStorage.getItem('app_offline_sync_queue');
            if (!raw) {
                setOfflineQueueCount(0);
                return 0;
            }
            const q = JSON.parse(raw);
            const count = Array.isArray(q) ? q.length : 0;
            setOfflineQueueCount(count);
            return count;
        } catch {
            setOfflineQueueCount(0);
            return 0;
        }
    }, []);

    useEffect(() => {
        refreshOfflineQueueCount();
        const handler = () => refreshOfflineQueueCount();
        window.addEventListener('offline-queue-updated', handler);
        window.addEventListener('storage', handler);
        return () => {
            window.removeEventListener('offline-queue-updated', handler);
            window.removeEventListener('storage', handler);
        };
    }, [refreshOfflineQueueCount]);

    const flushOfflineSyncQueue = useCallback(async () => {
        if (typeof window === 'undefined' || !navigator.onLine) return;
        setIsSyncingOffline(true);
        try {
            const queueKey = 'app_offline_sync_queue';
            const rawQueue = localStorage.getItem(queueKey);
            if (!rawQueue) {
                setOfflineQueueCount(0);
                return;
            }
            const queue: any[] = JSON.parse(rawQueue);
            if (!Array.isArray(queue) || queue.length === 0) {
                setOfflineQueueCount(0);
                return;
            }

            console.log(`[OfflineSync] Processing ${queue.length} offline queued actions...`);
            const remaining: any[] = [];
            for (const item of queue) {
                try {
                    const res = await fetch('/api/db/action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            path: item.path,
                            action: item.action,
                            payload: item.payload
                        })
                    });
                    if (!res.ok) {
                        remaining.push(item);
                    }
                } catch {
                    remaining.push(item);
                }
            }
            if (remaining.length > 0) {
                localStorage.setItem(queueKey, JSON.stringify(remaining));
                setOfflineQueueCount(remaining.length);
            } else {
                localStorage.removeItem(queueKey);
                setOfflineQueueCount(0);
                console.log('[OfflineSync] All pending offline actions synced successfully!');
            }
            window.dispatchEvent(new Event('offline-queue-updated'));
        } catch (err) {
            console.warn('[OfflineSync] Flush failed:', err);
        } finally {
            setIsSyncingOffline(false);
        }
    }, []);

    const refreshDataFromSqlServer = useCallback(async (): Promise<boolean> => {
        let connected = false;

        // فحص سريع إذا كان الجهاز غير متصل بالإنترنت
        if (typeof window !== 'undefined' && !navigator.onLine) {
            setIsOnline(false);
            try {
                const cached = await localforage.getItem<any>(CACHE_KEY);
                if (cached && Object.keys(cached).length > 0) {
                    setAllData(cached);
                }
            } catch {}
            setHasCheckedConnection(true);
            setIsLoading(false);
            return false;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        try {
            const res = await fetch('/api/db/sync', { cache: 'no-store', signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                const json = await res.json();
                if (json.isIndexedDb) {
                    const cached = await localforage.getItem<any>(CACHE_KEY);
                    if (cached && Object.keys(cached).length > 0) {
                        setAllData(cached);
                    } else {
                        const initialDefaults = {
                            items: [], customers: [], suppliers: [],
                            warehouses: [{ id: 'wh_main', name: 'المخزن الرئيسي', isDefault: true }],
                            cashAccounts: [{ id: 'cash_main', name: 'الخزينة الرئيسية', isDefault: true }],
                            users: [], settings: { main: { systemName: 'نظام نقاط البيع وإدارة الفروع' } },
                            salesInvoices: [], posSales: []
                        };
                        setAllData(initialDefaults);
                        await localforage.setItem(CACHE_KEY, initialDefaults);
                    }
                    setDatabaseSetupRequired(false);
                    setDatabaseSetupError(null);
                    setIsOnline(true);
                    connected = true;
                } else if (json.success && json.data) {
                    setAllData(json.data);
                    await localforage.setItem(CACHE_KEY, json.data);
                    setDatabaseSetupRequired(false);
                    setDatabaseSetupError(null);
                    setIsOnline(true);
                    connected = true;
                }
            } else {
                const json = await res.json().catch(() => null);
                setIsOnline(false);
                if (json?.code === 'LOCAL_DATABASE_MISSING') {
                    setDatabaseName(json.database || 'MultiBranchPOS_DB');
                    setDatabaseSetupRequired(true);
                    setDatabaseSetupError(null);
                } else {
                    throw new Error(json?.error || `تعذر الاتصال بقاعدة البيانات (${res.status})`);
                }
            }
        } catch (error) {
            clearTimeout(timeoutId);
            setIsOnline(false);
            console.warn('Could not sync with SQL Server, operating with cached data:', error);
            try {
                const cached = await localforage.getItem<any>(CACHE_KEY);
                if (cached && Object.keys(cached).length > 0) {
                    setAllData(cached);
                }
            } catch {}
        } finally {
            setHasCheckedConnection(true);
            setIsLoading(false);
        }
        return connected;
    }, []);

    const createLocalDatabase = useCallback(async () => {
        setIsCreatingLocalDatabase(true);
        setDatabaseSetupError(null);
        try {
            const res = await fetch('/api/db/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const result = await res.json().catch(() => null);
            if (!res.ok || !result?.success) {
                throw new Error(result?.error || result?.message || 'تعذر إنشاء قاعدة البيانات المحلية.');
            }
            const connected = await refreshDataFromSqlServer();
            if (!connected) {
                throw new Error('تم إنشاء القاعدة، لكن تعذر الاتصال بها. تحقق من خدمة SQL Server ثم أعد المحاولة.');
            }
        } catch (error: any) {
            setDatabaseSetupError(error?.message || 'حدث خطأ أثناء إنشاء قاعدة البيانات المحلية.');
            throw error;
        } finally {
            setIsCreatingLocalDatabase(false);
        }
    }, [refreshDataFromSqlServer]);

    useEffect(() => {
        let isMounted = true;
        const init = async () => {
            // First load from local storage cache for instant UI response
            try {
                const cached = await localforage.getItem<any>(CACHE_KEY);
                if (isMounted && cached && Object.keys(cached).length > 0) {
                    setAllData(cached);
                    setIsLoading(false);
                }
            } catch (err) {
                console.warn('Local cache read error:', err);
            }

            // Then fetch live data from server or process pending offline queue
            await flushOfflineSyncQueue();
            await refreshDataFromSqlServer();
        };

        init();

        const handleOnline = () => {
            setIsOnline(true);
            flushOfflineSyncQueue().then(() => {
                refreshDataFromSqlServer();
            });
        };
        const handleOffline = () => {
            setIsOnline(false);
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            isMounted = false;
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [flushOfflineSyncQueue, refreshDataFromSqlServer]);

    const checkServerHealth = useCallback(async (force = false) => {
        const now = Date.now();
        if (isCheckingHealthRef.current) return;
        if (!force && now - lastHealthCheckAtRef.current < 2000) return;

        isCheckingHealthRef.current = true;
        lastHealthCheckAtRef.current = now;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
            const res = await fetch('/api/db/health', {
                cache: 'no-store',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const json = await res.json().catch(() => null);

            if (res.ok && json?.ok) {
                const wasOffline = !isOnlineRef.current;
                setIsOnline(true);
                setDatabaseSetupRequired(false);
                setDatabaseSetupError(null);
                if (wasOffline && !json.isIndexedDb) {
                    // Re-sync latest data in background without blocking online status or flipping back to offline
                    void refreshDataFromSqlServer().catch((err) => {
                        console.warn('Background sync after reconnect failed:', err);
                    });
                }
            } else {
                setIsOnline(false);
                if (json?.code === 'LOCAL_DATABASE_MISSING') {
                    setDatabaseName(json.database || 'MultiBranchPOS_DB');
                    setDatabaseSetupRequired(true);
                }
            }
        } catch {
            clearTimeout(timeoutId);
            setIsOnline(false);
        } finally {
            setHasCheckedConnection(true);
            isCheckingHealthRef.current = false;
        }
    }, [refreshDataFromSqlServer]);

    useEffect(() => {
        if (!hasCheckedConnection) return;

        const intervalMs = isOnline ? 15000 : 5000;
        const intervalId = setInterval(() => {
            void checkServerHealth();
        }, intervalMs);

        const handleBrowserOnline = () => {
            void checkServerHealth(true);
        };
        const handleBrowserOffline = () => {
            void checkServerHealth(true);
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void checkServerHealth();
            }
        };
        const handleWindowFocus = () => {
            void checkServerHealth();
        };

        window.addEventListener('online', handleBrowserOnline);
        window.addEventListener('offline', handleBrowserOffline);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleWindowFocus);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('online', handleBrowserOnline);
            window.removeEventListener('offline', handleBrowserOffline);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, [hasCheckedConnection, isOnline, checkServerHealth]);

    const getNextId = useCallback(async (counterName: string, startFrom = 1): Promise<number | null> => {
        try {
            const res = await fetch('/api/db/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'getNextId',
                    counterName,
                    startFrom
                })
            });
            if (res.ok) {
                const json = await res.json();
                if (json.success) {
                    return json.nextId;
                }
            }
        } catch (err) {
            console.error('Failed to getNextId from SQL Server:', err);
        }

        // Fallback local counter
        const currentVal = allData?.counters?.[counterName] || startFrom - 1;
        const nextVal = currentVal + 1;
        setAllData((prev: any) => ({
            ...prev,
            counters: { ...(prev?.counters || {}), [counterName]: nextVal }
        }));
        return nextVal;
    }, [allData?.counters]);

    const dbAction = useCallback(async (
        rawPath: string,
        action: 'add' | 'update' | 'remove' | 'transaction',
        payload?: any
    ): Promise<string | void> => {
        const path = rawPath.split('/')[0];
        const generatedId = payload?.id || `gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        // Optimistic UI state update
        setAllData((prev: any) => {
            const slice = prev[path];
            if (Array.isArray(slice)) {
                if (action === 'add') {
                    const newItem = { id: generatedId, ...payload };
                    return { ...prev, [path]: [newItem, ...slice] };
                } else if (action === 'update') {
                    const updated = slice.map((item: any) =>
                        item.id === payload.id ? { ...item, ...(payload.data || payload) } : item
                    );
                    return { ...prev, [path]: updated };
                } else if (action === 'remove') {
                    const filtered = slice.filter((item: any) => item.id !== (payload.id || payload));
                    return { ...prev, [path]: filtered };
                }
            } else if (path === 'settings' || (slice && typeof slice === 'object')) {
                if (action === 'update' || action === 'add') {
                    const targetKey = payload?.id || 'main';
                    const dataObj = payload?.data || payload;
                    const prevSettings = prev?.settings || {};
                    const updatedTarget = { ...(prevSettings[targetKey] || {}), ...dataObj };
                    const nextSettings = { ...prevSettings, [targetKey]: updatedTarget };
                    const nextState = {
                        ...prev,
                        settings: nextSettings,
                        main: targetKey === 'main' ? { ...(prev.main || {}), ...dataObj } : prev.main
                    };
                    try { localforage.setItem(CACHE_KEY, nextState); } catch {}
                    return nextState;
                }
            }
            return prev;
        });

        // Persist optimistic mutation directly to IndexedDB / localforage
        try {
            const currentCache = (await localforage.getItem<any>(CACHE_KEY)) || {};
            const slice = currentCache[path];
            let nextCache = { ...currentCache };
            if (Array.isArray(slice)) {
                if (action === 'add') {
                    nextCache[path] = [{ id: generatedId, ...payload }, ...slice];
                } else if (action === 'update') {
                    nextCache[path] = slice.map((item: any) =>
                        item.id === payload.id ? { ...item, ...(payload.data || payload) } : item
                    );
                } else if (action === 'remove') {
                    nextCache[path] = slice.filter((item: any) => item.id !== (payload.id || payload));
                }
            } else if (path === 'settings' || typeof slice === 'object') {
                nextCache[path] = { ...(slice || {}), ...(payload.data || payload) };
            }
            await localforage.setItem(CACHE_KEY, nextCache);
        } catch (e) {
            console.warn('Failed to persist to IndexedDB:', e);
        }

        // If currently offline, queue mutation locally and return immediately without throwing
        const isCurrentlyOffline = typeof window !== 'undefined' && (!navigator.onLine || !isOnlineRef.current);
        if (isCurrentlyOffline) {
            try {
                const queueKey = 'app_offline_sync_queue';
                const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
                queue.push({
                    id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    path,
                    action,
                    payload: action === 'add' ? { id: generatedId, ...payload } : payload,
                    timestamp: Date.now()
                });
                localStorage.setItem(queueKey, JSON.stringify(queue));
                window.dispatchEvent(new Event('offline-queue-updated'));
            } catch {}
            return generatedId;
        }

        // Persist to SQL Server
        try {
            const res = await fetch('/api/db/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path,
                    action,
                    payload: action === 'add' ? { id: generatedId, ...payload } : payload
                })
            });
            if (res.ok) {
                const json = await res.json();
                if (json.success) {
                    if (!isOnlineRef.current) {
                        setIsOnline(true);
                    }
                    if (path === 'settings' || path === 'licenses') {
                        setTimeout(() => refreshDataFromSqlServer?.(), 200);
                    }
                    return json.id || (action === 'add' ? generatedId : undefined);
                }
                const message = json.error || json.message || `فشل حفظ ${path}`;
                console.error(`dbAction failed for ${path}/${action}:`, message);
                setTimeout(() => refreshDataFromSqlServer?.(), 1000);
                throw new Error(message);
            } else {
                const responseError = await res.json().catch(() => null);
                const message = responseError?.error || responseError?.message || `تعذر حفظ البيانات (${res.status})`;
                console.error(`dbAction HTTP error ${res.status} for ${path}/${action}:`, message);
                setTimeout(() => refreshDataFromSqlServer?.(), 1000);
                throw new Error(message);
            }
        } catch (err: any) {
            console.warn(`dbAction network error for path ${path}, falling back to offline queue:`, err);
            try {
                const queueKey = 'app_offline_sync_queue';
                const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
                queue.push({
                    id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    path,
                    action,
                    payload: action === 'add' ? { id: generatedId, ...payload } : payload,
                    timestamp: Date.now()
                });
                localStorage.setItem(queueKey, JSON.stringify(queue));
                window.dispatchEvent(new Event('offline-queue-updated'));
            } catch {}
            setIsOnline(false);
            return generatedId;
        }
    }, [refreshDataFromSqlServer]);

    // Master Data Slices
    const allItems = useMemo(() => allData?.items || [], [allData?.items]);
    const items = useMemo(() => (allData?.items || []).filter((i: any) => !i.isDisabled), [allData?.items]);
    const customers = useMemo(() => allData?.customers || [], [allData?.customers]);
    const suppliers = useMemo(() => allData?.suppliers || [], [allData?.suppliers]);
    const allWarehouses = useMemo(() => allData?.warehouses || [], [allData?.warehouses]);
    const warehouses = useMemo(() => (allData?.warehouses || []).filter((w: any) => !w.isRepWarehouse && w.warehouseType !== 'rep' && !w.repId), [allData?.warehouses]);
    const repWarehouses = useMemo(() => (allData?.warehouses || []).filter((w: any) => Boolean(w.isRepWarehouse) || w.warehouseType === 'rep' || Boolean(w.repId)), [allData?.warehouses]);
    const cashAccounts = useMemo(() => allData?.cashAccounts || [], [allData?.cashAccounts]);
    const partners = useMemo(() => allData?.partners || [], [allData?.partners]);
    const users = useMemo(() => allData?.users || [], [allData?.users]);
    const deliveryStaff = useMemo(() => allData?.deliveryStaff || [], [allData?.deliveryStaff]);
    const itemGroups = useMemo(() => allData?.itemGroups || [], [allData?.itemGroups]);
    const itemSections = useMemo(() => allData?.itemSections || [], [allData?.itemSections]);
    const itemCategories = useMemo(() => allData?.itemCategories || [], [allData?.itemCategories]);
    const itemSubCategories1 = useMemo(() => allData?.itemSubCategories1 || [], [allData?.itemSubCategories1]);
    const itemSubCategories2 = useMemo(() => allData?.itemSubCategories2 || [], [allData?.itemSubCategories2]);
    const inventoryZones = useMemo(() => allData?.inventoryZones || [], [allData?.inventoryZones]);
    const inventorySections = useMemo(() => allData?.inventorySections || [], [allData?.inventorySections]);
    const itemColors = useMemo(() => allData?.itemColors || [], [allData?.itemColors]);
    const itemSizes = useMemo(() => allData?.itemSizes || [], [allData?.itemSizes]);
    const barcodeDesigns = useMemo(() => allData?.barcodeDesigns || [], [allData?.barcodeDesigns]);
    const posTerminals = useMemo(() => allData?.posTerminals || [], [allData?.posTerminals]);
    const promotions = useMemo(() => allData?.promotions || [], [allData?.promotions]);
    const paymentMethods = useMemo(() => allData?.paymentMethods || [], [allData?.paymentMethods]);
    const sellers = useMemo(() => allData?.sellers || [], [allData?.sellers]);
    const roles = useMemo(() => allData?.roles || {}, [allData?.roles]);
    const settings = useMemo(() => allData?.settings || {}, [allData?.settings]);
    const licenses = useMemo(() => allData?.licenses || [], [allData?.licenses]);
    const restaurantTables = useMemo(() => allData?.restaurantTables || [], [allData?.restaurantTables]);
    const targets = useMemo(() => allData?.targets || {}, [allData?.targets]);
    const snoozedRecommendations = useMemo(() => allData?.snoozedRecommendations || [], [allData?.snoozedRecommendations]);
    const syncHistory = useMemo(() => allData?.syncHistory || [], [allData?.syncHistory]);
    const customerVisits = useMemo(() => allData?.customerVisits || [], [allData?.customerVisits]);
    const loginHistory = useMemo(() => allData?.loginHistory || [], [allData?.loginHistory]);
    const gratuityLogs = useMemo(() => allData?.gratuityLogs || [], [allData?.gratuityLogs]);
    const gratuityDistributions = useMemo(() => allData?.gratuityDistributions || [], [allData?.gratuityDistributions]);

    // Inventory
    const stockInRecords = useMemo(() => allData?.stockInRecords || [], [allData?.stockInRecords]);
    const stockOutRecords = useMemo(() => allData?.stockOutRecords || [], [allData?.stockOutRecords]);
    const stockTransferRecords = useMemo(() => allData?.stockTransferRecords || [], [allData?.stockTransferRecords]);
    const stockAdjustmentRecords = useMemo(() => allData?.stockAdjustmentRecords || [], [allData?.stockAdjustmentRecords]);
    const stockIssuesToReps = useMemo(() => allData?.stockIssuesToReps || [], [allData?.stockIssuesToReps]);
    const stockReturnsFromReps = useMemo(() => allData?.stockReturnsFromReps || [], [allData?.stockReturnsFromReps]);
    const inventoryClosings = useMemo(() => allData?.inventoryClosings || [], [allData?.inventoryClosings]);
    const requisitions = useMemo(() => allData?.requisitions || [], [allData?.requisitions]);

    // Sales & Purchases
    const salesInvoices = useMemo(() => allData?.salesInvoices || [], [allData?.salesInvoices]);
    const salesReturns = useMemo(() => allData?.salesReturns || [], [allData?.salesReturns]);
    const purchaseInvoices = useMemo(() => allData?.purchaseInvoices || [], [allData?.purchaseInvoices]);
    const purchaseReturns = useMemo(() => allData?.purchaseReturns || [], [allData?.purchaseReturns]);
    const purchaseOrders = useMemo(() => allData?.purchaseOrders || [], [allData?.purchaseOrders]);
    const posSales = useMemo(() => allData?.posSales || [], [allData?.posSales]);
    const posReturns = useMemo(() => allData?.posReturns || [], [allData?.posReturns]);
    const posSessions = useMemo(() => allData?.posSessions || [], [allData?.posSessions]);
    const posAuditLogs = useMemo(() => allData?.posAuditLogs || [], [allData?.posAuditLogs]);
    const posReconciliations = useMemo(() => allData?.posReconciliations || [], [allData?.posReconciliations]);
    const heldInvoices = useMemo(() => allData?.heldInvoices || [], [allData?.heldInvoices]);
    const posCounters = useMemo(() => allData?.posCounters || {}, [allData?.posCounters]);

    // Accounting
    const expenses = useMemo(() => allData?.expenses || [], [allData?.expenses]);
    const exceptionalIncomes = useMemo(() => allData?.exceptionalIncomes || [], [allData?.exceptionalIncomes]);
    const customerPayments = useMemo(() => allData?.customerPayments || [], [allData?.customerPayments]);
    const supplierPayments = useMemo(() => allData?.supplierPayments || [], [allData?.supplierPayments]);
    const treasuryTransactions = useMemo(() => allData?.treasuryTransactions || [], [allData?.treasuryTransactions]);
    const profitDistributions = useMemo(() => allData?.profitDistributions || [], [allData?.profitDistributions]);
    const priceChangeLogs = useMemo(() => allData?.priceChangeLogs || [], [allData?.priceChangeLogs]);

    // HR & Assets
    const employees = useMemo(() => allData?.employees || [], [allData?.employees]);
    const employeeAdvances = useMemo(() => allData?.employeeAdvances || [], [allData?.employeeAdvances]);
    const employeeAdjustments = useMemo(() => allData?.employeeAdjustments || [], [allData?.employeeAdjustments]);
    const repRemittances = useMemo(() => allData?.repRemittances || [], [allData?.repRemittances]);
    const payrollRecords = useMemo(() => allData?.payrollRecords || [], [allData?.payrollRecords]);
    const fixedAssets = useMemo(() => allData?.fixedAssets || [], [allData?.fixedAssets]);
    const depreciationRecords = useMemo(() => allData?.depreciationRecords || [], [allData?.depreciationRecords]);

    const inventory = useMemo(() => {
        const sectionMap = new Map<string, Record<string, { balance: number }>>();

        // Initialize existing inventory if provided
        if (Array.isArray(allData?.inventory)) {
            allData.inventory.forEach((inv: any) => {
                if (inv?.id && inv?.items) {
                    sectionMap.set(inv.id, { ...inv.items });
                }
            });
        }

        const addSectionQty = (whId: string, secId: string, itemId: string, delta: number) => {
            if (!whId || !secId || !itemId || !delta) return;
            const key = `${whId}-${secId}`;
            const currentItems = sectionMap.get(key) || {};
            const prevBal = Number(currentItems[itemId]?.balance || 0);
            currentItems[itemId] = { balance: prevBal + delta };
            sectionMap.set(key, currentItems);
        };

        // 1. Add allocations from stockInRecords
        stockInRecords.forEach((rec: any) => {
            if (rec?.status === 'cancelled') return;
            const whId = rec.warehouseId;
            if (Array.isArray(rec.allocations)) {
                rec.allocations.forEach((alloc: any) => {
                    addSectionQty(whId, alloc.sectionId, alloc.itemId, Number(alloc.quantity || 0));
                });
            }
        });

        // 2. Subtract from stockOutRecords if sectionId is specified on items or sourceId (Only when approved/completed/dispatched)
        stockOutRecords.forEach((rec: any) => {
            const st = rec?.status || rec?.Status;
            const isDeducted = !st || st === 'approved' || st === 'completed' || st === 'fulfilled';
            if (!isDeducted) return;
            const whId = rec.warehouseId || rec.sourceId;
            if (Array.isArray(rec.items)) {
                rec.items.forEach((itm: any) => {
                    const secId = itm.sectionId || rec.sectionId;
                    if (secId) {
                        addSectionQty(whId, secId, itm.itemId || itm.id, -Number(itm.qty || itm.quantity || 0));
                    }
                });
            }
        });

        // 3. Subtract/Add from stockTransferRecords if sectionId is specified
        stockTransferRecords.forEach((rec: any) => {
            if (rec?.status === 'cancelled') return;
            const fromWh = rec.fromWarehouseId || rec.fromSourceId;
            const toWh = rec.toWarehouseId || rec.toSourceId;
            if (Array.isArray(rec.items)) {
                rec.items.forEach((itm: any) => {
                    const fromSec = itm.fromSectionId || itm.sectionId || rec.fromSectionId;
                    const toSec = itm.toSectionId || rec.toSectionId;
                    const itemId = itm.itemId || itm.id;
                    const qty = Number(itm.qty || itm.quantity || 0);
                    if (fromWh && fromSec) addSectionQty(fromWh, fromSec, itemId, -qty);
                    if (toWh && toSec) addSectionQty(toWh, toSec, itemId, qty);
                });
            }
        });

        return Array.from(sectionMap.entries()).map(([id, itemsObj]) => ({
            id,
            items: itemsObj
        }));
    }, [allData?.inventory, stockInRecords, stockOutRecords, stockTransferRecords]);

    const unreconciledDeliveryCount = useMemo(() => {
        const seenSaleIds = new Set((salesInvoices || []).map((s: any) => s.id));
        const standalonePos = (posSales || []).filter((s: any) => !seenSaleIds.has(s.id));
        const allSales = [...(salesInvoices || []), ...standalonePos];
        return allSales.filter(inv => inv?.isDelivery && !inv?.deliveryReconciled).length;
    }, [salesInvoices, posSales]);

    const processSyncQueue = useCallback(async () => {
        await refreshDataFromSqlServer();
    }, [refreshDataFromSqlServer]);

    // ==========================================
    // المشغل التلقائي الدوري للمزامنة في الخلفية (Background Auto-Sync Heartbeat)
    // ==========================================
    useEffect(() => {
        const syncConfig = allData?.settings?.central_sync;
        if (!syncConfig || syncConfig.autoSync === false || syncConfig.systemRole === 'central') return;

        const intervalMinutes = Math.max(1, Number(syncConfig.autoSyncIntervalMinutes) || 5);
        const intervalMs = intervalMinutes * 60 * 1000;

        let isSyncing = false;

        const runAutoSyncTick = async () => {
            if (isSyncing || typeof window === 'undefined') return;

            // تنسيق بين التابات لمنع تكرار الطلب في نفس اللحظة
            const lastTrigger = Number(localStorage.getItem('app_last_auto_sync_trigger') || '0');
            const now = Date.now();
            if (now - lastTrigger < intervalMs - 5000) return;

            localStorage.setItem('app_last_auto_sync_trigger', String(now));
            try {
                isSyncing = true;
                const res = await fetch('/api/sync/central', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'sync', mode: 'all' })
                });
                const data = await res.json();
                if (data.success && data.pulledCount > 0) {
                    refreshDataFromSqlServer();
                }
            } catch (tickErr) {
                console.warn('[AutoSync Heartbeat] tick error:', tickErr);
            } finally {
                isSyncing = false;
            }
        };

        // فحص مبدئي إذا مر وقت كافٍ منذ آخر مزامنة
        const lastSyncTime = syncConfig.lastSyncTime ? new Date(syncConfig.lastSyncTime).getTime() : 0;
        if (Date.now() - lastSyncTime > intervalMs) {
            const timeout = setTimeout(() => {
                runAutoSyncTick();
            }, 5000);
            const interval = setInterval(runAutoSyncTick, Math.min(intervalMs, 60000));
            return () => {
                clearTimeout(timeout);
                clearInterval(interval);
            };
        }

        const interval = setInterval(runAutoSyncTick, Math.min(intervalMs, 60000));
        return () => clearInterval(interval);
    }, [allData?.settings?.central_sync, refreshDataFromSqlServer]);

    const systemRole: 'branch' | 'central' = useMemo(() => {
        const sRole = allData?.settings?.system_role || allData?.settings?.central_sync?.systemRole;
        return sRole === 'central' ? 'central' : 'branch';
    }, [allData?.settings]);
    const isCentral = systemRole === 'central';

    const retryDatabaseConnection = useCallback(async (): Promise<boolean> => {
        try {
            const healthRes = await fetch('/api/db/health', { cache: 'no-store' });
            const healthJson = await healthRes.json().catch(() => null);
            if (healthRes.ok && healthJson?.ok) {
                setIsOnline(true);
                setDatabaseSetupRequired(false);
                setDatabaseSetupError(null);
                void refreshDataFromSqlServer().catch(() => {});
                return true;
            } else {
                setIsOnline(false);
                return false;
            }
        } catch {
            setIsOnline(false);
            return false;
        }
    }, [refreshDataFromSqlServer]);

    const value: DataContextType = {
        allItems, items, customers, suppliers, warehouses, allWarehouses, repWarehouses, cashAccounts, partners, users, deliveryStaff, itemGroups, itemSections, itemCategories, itemSubCategories1, itemSubCategories2, inventoryZones, inventorySections, itemColors, itemSizes, barcodeDesigns, posTerminals, promotions, roles, settings, inventory, restaurantTables, paymentMethods, sellers, targets, licenses, snoozedRecommendations, syncHistory, customerVisits, loginHistory, gratuityLogs, gratuityDistributions,
        stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, stockIssuesToReps, stockReturnsFromReps, inventoryClosings, requisitions,
        salesInvoices, salesReturns, purchaseInvoices, purchaseReturns, posSales, posReturns, posSessions, posAuditLogs, posReconciliations, heldInvoices, posCounters,
        expenses, exceptionalIncomes, customerPayments, supplierPayments, treasuryTransactions, profitDistributions, priceChangeLogs,
        purchaseOrders,
        employees, employeeAdvances, employeeAdjustments, repRemittances, payrollRecords, fixedAssets, depreciationRecords,
        dbAction, getNextId,
        loading: isLoading,
        isOnline,
        hasCheckedConnection,
        databaseSetupRequired,
        databaseName,
        createLocalDatabase,
        retryDatabaseConnection,
        databaseSetupError,
        isCreatingLocalDatabase,
        syncQueueCount: 0,
        offlineQueueCount,
        isSyncingOffline,
        flushOfflineSyncQueue,
        unreconciledDeliveryCount,
        processSyncQueue,
        allData,
        systemRole,
        isCentral,
        goOffline: () => setIsOnline(false),
        goOnline: () => setIsOnline(true)
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = (): DataContextType => {
    const context = useContext(DataContext);
    if (context === undefined) throw new Error('useData must be used within a DataProvider');
    return context;
};
