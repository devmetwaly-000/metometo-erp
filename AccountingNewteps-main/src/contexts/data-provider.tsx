"use client";

import React, { createContext, useContext, ReactNode, useEffect, useMemo, useState, useCallback } from 'react';
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
    syncQueueCount: number;
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
    const [isLoading, setIsLoading] = useState(true);

    const refreshDataFromSqlServer = useCallback(async () => {
        try {
            const res = await fetch('/api/db/sync', { cache: 'no-store' });
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    setAllData(json.data);
                    await localforage.setItem(CACHE_KEY, json.data);
                }
            }
        } catch (error) {
            console.warn('Could not sync with SQL Server, attempting cache fallback:', error);
            const cached = await localforage.getItem<any>(CACHE_KEY);
            if (cached) {
                setAllData(cached);
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

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

            // Then fetch live data from SQL Server
            await refreshDataFromSqlServer();
        };

        init();
        return () => {
            isMounted = false;
        };
    }, [refreshDataFromSqlServer]);

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
            } else if (slice && typeof slice === 'object') {
                if (action === 'update' || action === 'add') {
                    return {
                        ...prev,
                        [path]: { ...slice, ...(payload.id ? { [payload.id]: payload.data || payload } : payload) }
                    };
                }
            }
            return prev;
        });

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
                if (json.success && json.id) {
                    return json.id;
                }
            }
        } catch (err) {
            console.error(`dbAction error for path ${path}:`, err);
        }

        return generatedId;
    }, []);

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
        if (!allData?.inventory) return [];
        return allData.inventory;
    }, [allData?.inventory]);

    const unreconciledDeliveryCount = useMemo(() => {
        const allSales = [...salesInvoices, ...posSales];
        return allSales.filter(inv => inv?.isDelivery && !inv?.deliveryReconciled).length;
    }, [salesInvoices, posSales]);

    const processSyncQueue = useCallback(async () => {
        await refreshDataFromSqlServer();
    }, [refreshDataFromSqlServer]);

    const systemRole: 'branch' | 'central' = useMemo(() => {
        const sRole = allData?.settings?.system_role || allData?.settings?.central_sync?.systemRole;
        return sRole === 'central' ? 'central' : 'branch';
    }, [allData?.settings]);
    const isCentral = systemRole === 'central';

    const value: DataContextType = {
        allItems, items, customers, suppliers, warehouses, allWarehouses, repWarehouses, cashAccounts, partners, users, deliveryStaff, itemGroups, itemSections, itemCategories, itemSubCategories1, itemSubCategories2, inventoryZones, inventorySections, itemColors, itemSizes, barcodeDesigns, posTerminals, promotions, roles, settings, inventory, restaurantTables, paymentMethods, sellers, targets, licenses, snoozedRecommendations, syncHistory, customerVisits, loginHistory, gratuityLogs, gratuityDistributions,
        stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, stockIssuesToReps, stockReturnsFromReps, inventoryClosings, requisitions,
        salesInvoices, salesReturns, purchaseInvoices, purchaseReturns, posSales, posReturns, posSessions, posAuditLogs, heldInvoices, posCounters,
        expenses, exceptionalIncomes, customerPayments, supplierPayments, treasuryTransactions, profitDistributions, priceChangeLogs,
        purchaseOrders,
        employees, employeeAdvances, employeeAdjustments, repRemittances, payrollRecords, fixedAssets, depreciationRecords,
        dbAction, getNextId,
        loading: isLoading,
        isOnline,
        syncQueueCount: 0,
        unreconciledDeliveryCount,
        processSyncQueue,
        allData,
        systemRole,
        isCentral,
        goOffline: () => setIsOnline(false),
        goOnline: () => setIsOnline(true)
    };

    if (isLoading && !Object.keys(allData).length) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="mr-2">جارٍ الاتصال بقاعدة بيانات SQL Server والتحميل...</p>
            </div>
        );
    }

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = (): DataContextType => {
    const context = useContext(DataContext);
    if (context === undefined) throw new Error('useData must be used within a DataProvider');
    return context;
};
