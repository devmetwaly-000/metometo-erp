"use client";

import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useData } from "@/contexts/data-provider";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
    BookCheck, Send, RefreshCw, CheckCircle2, AlertCircle,
    Loader2, Receipt, ShoppingCart, CreditCard,
    Check, SkipForward, Scale, XCircle,
    Eye, Building2, User, Calendar, FileText, Hash,
    Undo2, RotateCcw
} from "lucide-react";
import * as XLSX from 'xlsx';

export default function SubledgerPostingPage() {
    const {
        salesInvoices, purchaseInvoices, expenses,
        salesReturns, purchaseReturns,
        cashAccounts, warehouses, customers, suppliers, settings
    } = useData();    const { user } = useAuth();
    const { toast } = useToast();

    const [postedEntries, setPostedEntries]   = useState<any[]>([]);
    const [loadingPosted, setLoadingPosted]   = useState(true);
    const [isPosting, setIsPosting]           = useState<string | null>(null);
    const [batchPosting, setBatchPosting]     = useState(false);
    const [skippedIds, setSkippedIds]         = useState<Set<string>>(new Set());
    const [isSkipping, setIsSkipping]         = useState<string | null>(null);
    const [justPostedIds, setJustPostedIds]   = useState<Set<string>>(new Set());
    const [previewInv, setPreviewInv]         = useState<any | null>(null);
    const [previewType, setPreviewType]       = useState<'sale' | 'purchase'>('sale');
    const [activeTab, setActiveTab]           = useState<string>('sales');

    // == جلب القيود المرحّلة ==
    const fetchPostedEntries = async () => {
        setLoadingPosted(true);
        try {
            const res = await fetch('/api/accounting/posting');
            if (res.ok) {
                const data = await res.json();
                setPostedEntries(data.entries || []);
            }
        } catch (e) {
            console.error("Failed to load posted entries", e);
        } finally {
            setLoadingPosted(false);
        }
    };

    useEffect(() => { fetchPostedEntries(); }, []);

    const postedSourceIds = useMemo(() => {
        const s = new Set(postedEntries.map((e: any) => e.SourceId).filter(Boolean));
        justPostedIds.forEach(id => s.add(id));
        return s;
    }, [postedEntries, justPostedIds]);

    const unpostedSales     = useMemo(() => (salesInvoices    || []).filter((inv: any) => !postedSourceIds.has(inv.id)), [salesInvoices,    postedSourceIds]);
    const unpostedPurchases = useMemo(() => (purchaseInvoices || []).filter((inv: any) => !postedSourceIds.has(inv.id)), [purchaseInvoices, postedSourceIds]);
    const unpostedExpenses  = useMemo(() => (expenses         || []).filter((exp: any) => !postedSourceIds.has(exp.id)), [expenses,         postedSourceIds]);
    const unpostedSalesReturns    = useMemo(() => (salesReturns    || []).filter((r: any) => !postedSourceIds.has(r.id)), [salesReturns,    postedSourceIds]);
    const unpostedPurchaseReturns = useMemo(() => (purchaseReturns || []).filter((r: any) => !postedSourceIds.has(r.id)), [purchaseReturns, postedSourceIds]);

    const formatCurrency = (amt: number) =>
        new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amt);

    // == بناء سطور قيد مبيعات ==
    const buildSaleLines = (inv: any): any[] => {
        const total       = Number(inv.total || 0);
        const tax         = Number(inv.tax || 0);
        const discount    = Number(inv.discount || 0);
        
        let grossSales = 0;
        if (inv.subtotal && Number(inv.subtotal) > 0) {
            const rawSub = Number(inv.subtotal);
            if (rawSub >= total && discount > 0) {
                grossSales = rawSub;
            } else {
                grossSales = rawSub + (discount > 0 && Math.abs(rawSub + tax - total) < 0.01 ? discount : 0);
            }
        } else {
            grossSales = Math.max(total - tax + discount, 0);
        }

        const paidAmount  = Math.min(Number(inv.paidAmount || 0), total);
        const remaining   = Math.max(total - paidAmount, 0);
        const cashAcc     = cashAccounts.find((c: any) => c.id === inv.paidToAccountId)?.name || 'النقدية / البنك';
        const lines: any[] = [];
        if (paidAmount  > 0.001) lines.push({ account: cashAcc,                                           debit: paidAmount, credit: 0,        description: `تحصيل نقدي - فاتورة ${inv.invoiceNumber}` });
        if (remaining   > 0.001) lines.push({ account: `حسابات العملاء (${inv.customerName || 'عام'})`,  debit: remaining,  credit: 0,        description: `متبقي آجل - فاتورة ${inv.invoiceNumber}` });
        if (discount    > 0.001) lines.push({ account: 'خصم مسموح به (مبيعات)',                          debit: discount,   credit: 0,        description: `خصم تجاري فاتورة ${inv.invoiceNumber}` });
        if (tax         > 0.001) lines.push({ account: 'ضريبة القيمة المضافة المستحقة (المخرجات)',       debit: 0,          credit: tax,       description: `ضريبة فاتورة ${inv.invoiceNumber}` });
        if (grossSales  > 0.001) lines.push({ account: 'إيرادات المبيعات',                                debit: 0,          credit: grossSales, description: `إيراد مبيعات فاتورة ${inv.invoiceNumber}` });
        return autoBalance(lines, inv.invoiceNumber);
    };

    // == بناء سطور قيد مشتريات ==
    const buildPurchaseLines = (inv: any): any[] => {
        const total       = Number(inv.total || 0);
        const tax         = Number(inv.tax || 0);
        const discount    = Number(inv.discount || 0);
        
        let grossPurchases = 0;
        if (inv.subtotal && Number(inv.subtotal) > 0) {
            const rawSub = Number(inv.subtotal);
            if (rawSub >= total && discount > 0) {
                grossPurchases = rawSub;
            } else {
                grossPurchases = rawSub + (discount > 0 && Math.abs(rawSub + tax - total) < 0.01 ? discount : 0);
            }
        } else {
            grossPurchases = Math.max(total - tax + discount, 0);
        }

        const paidAmount  = Math.min(Number(inv.paidAmount || 0), total);
        const remaining   = Math.max(total - paidAmount, 0);
        const cashAcc     = cashAccounts.find((c: any) => c.id === inv.paidFromAccountId)?.name || 'النقدية / البنك';
        const lines: any[] = [];
        if (grossPurchases > 0.001) lines.push({ account: 'مخزون البضائع والمشتريات',                     debit: grossPurchases, credit: 0,        description: `إضافة مخزون فاتورة ${inv.invoiceNumber}` });
        if (tax            > 0.001) lines.push({ account: 'ضريبة القيمة المضافة المخصومة (المدخلات)',     debit: tax,            credit: 0,        description: `ضريبة مشتريات فاتورة ${inv.invoiceNumber}` });
        if (paidAmount     > 0.001) lines.push({ account: cashAcc,                                        debit: 0,              credit: paidAmount, description: `سداد نقدي لفاتورة ${inv.invoiceNumber}` });
        if (remaining      > 0.001) lines.push({ account: `حسابات الموردين (${inv.supplierName || 'عام'})`, debit: 0,            credit: remaining,  description: `مستحق للمورد فاتورة ${inv.invoiceNumber}` });
        if (discount       > 0.001) lines.push({ account: 'خصم مكتسب (مشتريات)',                          debit: 0,              credit: discount,   description: `خصم مكتسب فاتورة ${inv.invoiceNumber}` });
        return autoBalance(lines, inv.invoiceNumber);
    };

    // == بناء سطور قيد مصروفات ==
    const buildExpenseLines = (exp: any): any[] => {
        const amount    = exp.amount    || 0;
        const taxAmount = exp.taxAmount || 0;
        const total     = amount + taxAmount;
        if (total <= 0) return [];
        const cashAcc       = cashAccounts.find((c: any) => c.id === exp.cashAccountId)?.name || 'النقدية / البنك';
        const expenseAccName = exp.expenseType || 'مصروفات تشغيلية';
        const lines: any[] = [];
        lines.push({ account: expenseAccName, debit: amount, credit: 0, description: exp.description || `مصروف: ${expenseAccName}` });
        if (taxAmount > 0.001) lines.push({ account: 'ضريبة القيمة المضافة المخصومة (المدخلات)', debit: taxAmount, credit: 0, description: `ضريبة مصروف: ${expenseAccName}` });
        lines.push({ account: cashAcc, debit: 0, credit: total, description: `سداد ${expenseAccName}` });
        return autoBalance(lines, exp.id);
    };

    // == بناء سطور قيد مرتجع مبيعات ==
    // عكس قيد المبيعات: دائن النقدية/العملاء + مدين الإيرادات + مدين الضريبة
    const buildSaleReturnLines = (ret: any): any[] => {
        const subtotal   = Number(ret.subtotal || ret.total || 0);
        const tax        = Number(ret.tax || 0);
        const total      = Number(ret.total || (subtotal + tax));
        const paidAmount = Math.min(Number(ret.paidAmount || 0), total);
        const remaining  = Math.max(total - paidAmount, 0);
        const cashAcc    = cashAccounts.find((c: any) => c.id === ret.paidFromAccountId)?.name || 'النقدية / البنك';
        const refNum     = ret.receiptNumber || ret.id;

        const lines: any[] = [];
        // مدين: عكس الإيراد والضريبة
        if (subtotal > 0.001) lines.push({ account: 'مرتجعات المبيعات',                                     debit: subtotal, credit: 0,        description: `مرتجع مبيعات ${refNum}` });
        if (tax      > 0.001) lines.push({ account: 'ضريبة القيمة المضافة المستحقة (المخرجات)',              debit: tax,      credit: 0,        description: `استرداد ضريبة مرتجع ${refNum}` });
        // دائن: النقدية أو حساب العميل
        if (paidAmount > 0.001) lines.push({ account: cashAcc,                                                debit: 0, credit: paidAmount,  description: `رد نقدي للعميل - مرتجع ${refNum}` });
        if (remaining  > 0.001) lines.push({ account: `حسابات العملاء (${ret.customerName || 'عام'})`,       debit: 0, credit: remaining,   description: `تخفيض رصيد عميل - مرتجع ${refNum}` });
        return autoBalance(lines, refNum);
    };

    // == بناء سطور قيد مرتجع مشتريات ==
    // عكس قيد المشتريات: مدين النقدية/الموردين + دائن المخزون + دائن الضريبة
    const buildPurchaseReturnLines = (ret: any): any[] => {
        const subtotal   = Number(ret.subtotal || ret.total || 0);
        const tax        = Number(ret.tax || 0);
        const total      = Number(ret.total || (subtotal + tax));
        const paidAmount = Math.min(Number(ret.paidAmount || 0), total);
        const remaining  = Math.max(total - paidAmount, 0);
        const cashAcc    = cashAccounts.find((c: any) => c.id === ret.paidToAccountId)?.name || 'النقدية / البنك';
        const refNum     = ret.receiptNumber || ret.id;

        const lines: any[] = [];
        // مدين: النقدية أو حساب المورد
        if (paidAmount > 0.001) lines.push({ account: cashAcc,                                                      debit: paidAmount, credit: 0,         description: `استرداد نقدي من المورد - مرتجع ${refNum}` });
        if (remaining  > 0.001) lines.push({ account: `حسابات الموردين (${ret.supplierName || 'عام'})`,             debit: remaining,  credit: 0,         description: `تخفيض رصيد مورد - مرتجع ${refNum}` });
        // دائن: عكس المخزون والضريبة
        if (subtotal > 0.001) lines.push({ account: 'مخزون البضائع والمشتريات',                                    debit: 0, credit: subtotal,   description: `إخراج بضاعة مرتجعة ${refNum}` });
        if (tax      > 0.001) lines.push({ account: 'ضريبة القيمة المضافة المخصومة (المدخلات)',                    debit: 0, credit: tax,        description: `استرداد ضريبة مرتجع مشتريات ${refNum}` });
        return autoBalance(lines, refNum);
    };

    const handlePostSaleReturn = (ret: any) => postEntry({
        sourceType: 'sale_return', sourceId: ret.id, sourceNumber: ret.receiptNumber || ret.id,
        warehouseId: ret.warehouseId, date: ret.date,
        description: `قيد مرتجع مبيعات رقم ${ret.receiptNumber || ret.id} للعميل ${ret.customerName || 'عام'}`,
        lines: buildSaleReturnLines(ret)
    }, ret.id);

    const handlePostPurchaseReturn = (ret: any) => postEntry({
        sourceType: 'purchase_return', sourceId: ret.id, sourceNumber: ret.receiptNumber || ret.id,
        warehouseId: ret.warehouseId, date: ret.date,
        description: `قيد مرتجع مشتريات رقم ${ret.receiptNumber || ret.id} للمورد ${ret.supplierName || 'عام'}`,
        lines: buildPurchaseReturnLines(ret)
    }, ret.id);

    const handleBatchPostSalesReturns = async () => {
        if (unpostedSalesReturns.length === 0) return;
        setBatchPosting(true);
        setBatchProgress({ done: 0, total: unpostedSalesReturns.length, type: 'مرتجعات مبيعات' });
        await postChunk([...unpostedSalesReturns], handlePostSaleReturn);
        setBatchProgress(null);
        setBatchPosting(false);
    };

    const handleBatchPostPurchaseReturns = async () => {
        if (unpostedPurchaseReturns.length === 0) return;
        setBatchPosting(true);
        setBatchProgress({ done: 0, total: unpostedPurchaseReturns.length, type: 'مرتجعات مشتريات' });
        await postChunk([...unpostedPurchaseReturns], handlePostPurchaseReturn);
        setBatchProgress(null);
        setBatchPosting(false);
    };

    // == تسوية آلية لضمان التوازن ==
    const autoBalance = (lines: any[], ref: string): any[] => {        const dr   = lines.reduce((s, l) => s + (l.debit  || 0), 0);
        const cr   = lines.reduce((s, l) => s + (l.credit || 0), 0);
        const diff = dr - cr;
        if (Math.abs(diff) > 0.001) {
            diff > 0
                ? lines.push({ account: 'حساب فروق التسوية الآلية', debit: 0,            credit: diff,       description: `تسوية آلية - ${ref}` })
                : lines.push({ account: 'حساب فروق التسوية الآلية', debit: Math.abs(diff), credit: 0,          description: `تسوية آلية - ${ref}` });
        }
        return lines;
    };

    // == كشف عدم التوازن الخام ==
    const getImbalanceInfo = (inv: any, type: 'sale' | 'purchase') => {
        const total = Number(inv.total || 0);
        const tax = Number(inv.tax || 0);
        const discount = Number(inv.discount || 0);
        const paidAmount = Math.min(Number(inv.paidAmount || 0), total);
        const remaining = Math.max(total - paidAmount, 0);
        
        let rawDr = 0, rawCr = 0;
        if (type === 'sale') {
            let grossSales = 0;
            if (inv.subtotal && Number(inv.subtotal) > 0) {
                const rawSub = Number(inv.subtotal);
                grossSales = (rawSub >= total && discount > 0) ? rawSub : (rawSub + (discount > 0 && Math.abs(rawSub + tax - total) < 0.01 ? discount : 0));
            } else {
                grossSales = Math.max(total - tax + discount, 0);
            }
            rawDr = paidAmount + remaining + discount;
            rawCr = grossSales + tax;
        } else {
            let grossPurchases = 0;
            if (inv.subtotal && Number(inv.subtotal) > 0) {
                const rawSub = Number(inv.subtotal);
                grossPurchases = (rawSub >= total && discount > 0) ? rawSub : (rawSub + (discount > 0 && Math.abs(rawSub + tax - total) < 0.01 ? discount : 0));
            } else {
                grossPurchases = Math.max(total - tax + discount, 0);
            }
            rawDr = grossPurchases + tax;
            rawCr = paidAmount + remaining + discount;
        }
        if (rawDr === 0 && rawCr === 0) return { isImbalanced: false, diff: 0, rawDr: 0, rawCr: 0 };
        const diff = Math.abs(rawDr - rawCr);
        return { isImbalanced: diff > 0.05, diff, rawDr, rawCr };
    };

    const imbalancedSales     = useMemo(() => unpostedSales.filter((inv: any)    => getImbalanceInfo(inv, 'sale').isImbalanced    && !skippedIds.has(inv.id)), [unpostedSales,     skippedIds]);
    const imbalancedPurchases = useMemo(() => unpostedPurchases.filter((inv: any) => getImbalanceInfo(inv, 'purchase').isImbalanced && !skippedIds.has(inv.id)), [unpostedPurchases, skippedIds]);
    const totalImbalanced     = imbalancedSales.length + imbalancedPurchases.length;

    // == فك الترحيل ==
    const [isUnposting, setIsUnposting] = useState<string | null>(null);

    const handleUnpost = async (sourceId: string, sourceNumber: string) => {
        if (!sourceId) return;
        setIsUnposting(sourceId);
        try {
            const res  = await fetch('/api/accounting/posting', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId, userId: user?.id, userName: user?.name })
            });
            const data = await res.json();
            if (data.success) {
                // إزالة من justPostedIds لتظهر مرة أخرى في قائمة غير المرحّلة
                setJustPostedIds(prev => { const s = new Set(prev); s.delete(sourceId); return s; });
                toast({ title: 'تم فك الترحيل', description: data.message });
                fetchPostedEntries();
            } else {
                toast({ variant: 'destructive', title: 'فشل فك الترحيل', description: data.message });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'خطأ', description: e.message });
        } finally {
            setIsUnposting(null);
        }
    };

    // == إعادة الترحيل (فك + ترحيل جديد) ==
    const handleRepost = async (entry: any) => {
        if (!entry.SourceId) return;
        setIsUnposting(entry.SourceId);
        // إيجاد الفاتورة الأصلية لبناء السطور
        const sourceType = entry.SourceType;
        let lines: any[] = [];
        if (sourceType === 'sale') {
            const inv = (salesInvoices || []).find((i: any) => i.id === entry.SourceId);
            if (inv) lines = buildSaleLines(inv);
        } else if (sourceType === 'purchase') {
            const inv = (purchaseInvoices || []).find((i: any) => i.id === entry.SourceId);
            if (inv) lines = buildPurchaseLines(inv);
        }
        if (lines.length === 0) {
            // استخدام السطور الأصلية من LinesJson
            try { lines = JSON.parse(entry.LinesJson || '[]'); } catch { lines = []; }
        }
        if (lines.length < 2) {
            toast({ variant: 'destructive', title: 'لا يمكن إعادة الترحيل', description: 'تعذّر بناء سطور القيد. يمكنك فك الترحيل ثم إعادته يدوياً.' });
            setIsUnposting(null);
            return;
        }
        try {
            const res  = await fetch('/api/accounting/posting', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceType, sourceId: entry.SourceId, sourceNumber: entry.SourceNumber,
                    warehouseId: entry.WarehouseId, date: entry.Date,
                    description: `[إعادة ترحيل] ${entry.Description || ''}`,
                    lines, userId: user?.id, userName: user?.name
                })
            });
            const data = await res.json();
            if (data.success) {
                toast({ title: 'تمت إعادة الترحيل', description: data.message });
                fetchPostedEntries();
            } else {
                toast({ variant: 'destructive', title: 'فشل إعادة الترحيل', description: data.message });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'خطأ', description: e.message });
        } finally {
            setIsUnposting(null);
        }
    };

    // == ترحيل مع فحص ازدواجية ==
    const addPosted = (id: string) => setJustPostedIds(prev => new Set(prev).add(id));
    const removePosted = (id: string) => setJustPostedIds(prev => { const s = new Set(prev); s.delete(id); return s; });

    const postEntry = async (payload: any, sourceId: string) => {
        if (postedSourceIds.has(sourceId) || isPosting === sourceId) return false;
        setIsPosting(sourceId);
        addPosted(sourceId); // منع الضغط المزدوج فوراً
        try {
            const res  = await fetch('/api/accounting/posting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, userId: user?.id, userName: user?.name }) });
            const data = await res.json();
            if (data.success) {
                toast({ title: 'تم الترحيل بنجاح', description: data.message });
                fetchPostedEntries();
                return true;
            } else {
                removePosted(sourceId);
                toast({ variant: 'destructive', title: 'فشل الترحيل', description: data.message });
                return false;
            }
        } catch (e: any) {
            removePosted(sourceId);
            toast({ variant: 'destructive', title: 'خطأ', description: e.message });
            return false;
        } finally {
            setIsPosting(null);
        }
    };

    const handlePostSale = async (inv: any): Promise<boolean> => {
        const imb = getImbalanceInfo(inv, 'sale');
        if (imb.isImbalanced) {
            toast({
                variant: 'destructive',
                title: 'قيد غير متوازن',
                description: `الفاتورة ${inv.invoiceNumber} غير متوازنة (المدين: ${imb.rawDr.toFixed(2)} ≠ الدائن: ${imb.rawCr.toFixed(2)}). يمكنك ترحيلها مع تسوية آلية من تبويب القيود غير المتوازنة.`
            });
            setActiveTab('imbalanced');
            return false;
        }
        return (await postEntry({
            sourceType: 'sale', sourceId: inv.id, sourceNumber: inv.invoiceNumber,
            warehouseId: inv.warehouseId, date: inv.date,
            description: `قيد ترحيل مبيعات الفاتورة رقم ${inv.invoiceNumber} للعميل ${inv.customerName || 'نقدي'}`,
            lines: buildSaleLines(inv)
        }, inv.id)) || false;
    };

    const handlePostPurchase = async (inv: any): Promise<boolean> => {
        const imb = getImbalanceInfo(inv, 'purchase');
        if (imb.isImbalanced) {
            toast({
                variant: 'destructive',
                title: 'قيد غير متوازن',
                description: `فاتورة المشتريات ${inv.invoiceNumber} غير متوازنة (المدين: ${imb.rawDr.toFixed(2)} ≠ الدائن: ${imb.rawCr.toFixed(2)}). يمكنك ترحيلها مع تسوية آلية من تبويب القيود غير المتوازنة.`
            });
            setActiveTab('imbalanced');
            return false;
        }
        return (await postEntry({
            sourceType: 'purchase', sourceId: inv.id, sourceNumber: inv.invoiceNumber,
            warehouseId: inv.warehouseId, date: inv.date,
            description: `قيد ترحيل مشتريات الفاتورة رقم ${inv.invoiceNumber} من المورد ${inv.supplierName || 'عام'}`,
            lines: buildPurchaseLines(inv)
        }, inv.id)) || false;
    };

    const handlePostExpense = async (exp: any): Promise<boolean> => {
        const lines = buildExpenseLines(exp);
        if (lines.length === 0) { toast({ variant: 'destructive', title: 'قيمة صفر', description: 'هذا المصروف بقيمة صفر لا يُرحَّل.' }); return false; }
        return (await postEntry({
            sourceType: 'expense', sourceId: exp.id, sourceNumber: exp.expenseNumber || exp.id,
            date: exp.date,
            description: `قيد ترحيل مصروف: ${exp.expenseType || exp.description || 'مصروف عام'}`,
            lines
        }, exp.id)) || false;
    };

    const handleSkipAndPost = async (inv: any, type: 'sale' | 'purchase') => {
        if (postedSourceIds.has(inv.id)) return;
        setIsSkipping(inv.id);
        addPosted(inv.id);
        const lines  = type === 'sale' ? buildSaleLines(inv) : buildPurchaseLines(inv);
        const totalDr = lines.reduce((s: number, l: any) => s + (l.debit  || 0), 0);
        const totalCr = lines.reduce((s: number, l: any) => s + (l.credit || 0), 0);
        try {
            const res  = await fetch('/api/accounting/posting', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceType: type, sourceId: inv.id, sourceNumber: inv.invoiceNumber,
                    warehouseId: inv.warehouseId, date: inv.date,
                    description: `[تسوية آلية] ترحيل ${type === 'sale' ? 'مبيعات' : 'مشتريات'} رقم ${inv.invoiceNumber}`,
                    lines, userId: user?.id, userName: user?.name
                })
            });
            const data = await res.json();
            if (data.success) {
                setSkippedIds(prev => new Set(prev).add(inv.id));
                toast({ title: 'تم الترحيل مع تسوية', description: `${data.message} — فرق: ${formatCurrency(Math.abs(totalDr - totalCr))}` });
                fetchPostedEntries();
            } else {
                removePosted(inv.id);
                toast({ variant: 'destructive', title: 'فشل الترحيل', description: data.message });
            }
        } catch (e: any) {
            removePosted(inv.id);
            toast({ variant: 'destructive', title: 'خطأ', description: e.message });
        } finally {
            setIsSkipping(null);
        }
    };

    const handleDismiss = (id: string) => {
        setSkippedIds(prev => new Set(prev).add(id));
        toast({ title: 'تم التجاهل', description: 'تم إخفاء هذا القيد مؤقتاً.' });
    };

    const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; type: string } | null>(null);

    // ترحيل دُفعة من الفواتير بشكل متوازٍ (5 في وقت واحد)
    const postChunk = async (items: any[], postFn: (item: any) => Promise<any>) => {
        const CHUNK_SIZE = 5;
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
            const chunk = items.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(item => postFn(item)));
            setBatchProgress(prev => prev ? { ...prev, done: Math.min(i + CHUNK_SIZE, items.length) } : null);
        }
    };

    const handleBatchPostSales = async () => {
        if (unpostedSales.length === 0) return;

        // فرز الفواتير: قيود متوازنة vs قيود غير متوازنة (يتم تخطيها آلياً)
        const balanced = unpostedSales.filter((inv: any) => !getImbalanceInfo(inv, 'sale').isImbalanced);
        const imbalanced = unpostedSales.filter((inv: any) => getImbalanceInfo(inv, 'sale').isImbalanced);

        if (balanced.length === 0 && imbalanced.length > 0) {
            toast({
                variant: 'destructive',
                title: 'تنبيه: جميع الفواتير المتبقية غير متوازنة',
                description: `يوجد ${imbalanced.length} فاتورة بها فروق محاسبية. يمكنك ترحيلها مع تسوية آلية من تبويب "القيود غير المتوازنة".`
            });
            setActiveTab('imbalanced');
            return;
        }

        setBatchPosting(true);
        setBatchProgress({ done: 0, total: balanced.length, type: 'مبيعات' });
        await postChunk(balanced, handlePostSale);
        setBatchProgress(null);
        setBatchPosting(false);

        if (imbalanced.length > 0) {
            toast({
                title: 'اكتمل الترحيل وتخطي القيود غير المتزنة',
                description: `تم ترحيل ${balanced.length} فاتورة سليمة. تم تخطي ${imbalanced.length} فاتورة غير متوازنة وعرضها في تبويب "القيود غير المتوازنة" للمراجعة والتسوية.`
            });
            setActiveTab('imbalanced');
        } else {
            toast({ title: 'اكتمل الترحيل المجمع', description: `تم ترحيل ${balanced.length} فاتورة مبيعات بنجاح.` });
        }
    };

    const handleBatchPostExpenses = async () => {
        if (unpostedExpenses.length === 0) return;
        setBatchPosting(true);
        setBatchProgress({ done: 0, total: unpostedExpenses.length, type: 'مصروفات' });
        await postChunk([...unpostedExpenses], handlePostExpense);
        setBatchProgress(null);
        setBatchPosting(false);
        toast({ title: 'اكتمل الترحيل المجمع', description: `تم ترحيل ${unpostedExpenses.length} مصروف.` });
    };

    const handleBatchPostPurchases = async () => {
        if (unpostedPurchases.length === 0) return;

        const balanced = unpostedPurchases.filter((inv: any) => !getImbalanceInfo(inv, 'purchase').isImbalanced);
        const imbalanced = unpostedPurchases.filter((inv: any) => getImbalanceInfo(inv, 'purchase').isImbalanced);

        if (balanced.length === 0 && imbalanced.length > 0) {
            toast({
                variant: 'destructive',
                title: 'تنبيه: جميع فواتير المشتريات المتبقية غير متوازنة',
                description: `يوجد ${imbalanced.length} فاتورة بها فروق محاسبية. يمكنك ترحيلها مع تسوية آلية من تبويب "القيود غير المتوازنة".`
            });
            setActiveTab('imbalanced');
            return;
        }

        setBatchPosting(true);
        setBatchProgress({ done: 0, total: balanced.length, type: 'مشتريات' });
        await postChunk(balanced, handlePostPurchase);
        setBatchProgress(null);
        setBatchPosting(false);

        if (imbalanced.length > 0) {
            toast({
                title: 'اكتمل الترحيل وتخطي القيود غير المتزنة',
                description: `تم ترحيل ${balanced.length} فاتورة مشتريات سليمة. تم تخطي ${imbalanced.length} فاتورة غير متوازنة وعرضها في تبويب "القيود غير المتوازنة".`
            });
            setActiveTab('imbalanced');
        } else {
            toast({ title: 'اكتمل الترحيل المجمع', description: `تم ترحيل ${balanced.length} فاتورة مشتريات بنجاح.` });
        }
    };

    const handleBatchSkipAll = async () => {
        const all = [...imbalancedSales.map((i: any) => ({ inv: i, type: 'sale' as const })), ...imbalancedPurchases.map((i: any) => ({ inv: i, type: 'purchase' as const }))];
        if (all.length === 0) return;
        setBatchPosting(true);
        setBatchProgress({ done: 0, total: all.length, type: 'قيود غير متوازنة' });
        for (let i = 0; i < all.length; i++) {
            await handleSkipAndPost(all[i].inv, all[i].type);
            setBatchProgress(prev => prev ? { ...prev, done: i + 1 } : null);
        }
        setBatchProgress(null);
        setBatchPosting(false);
        toast({ title: 'اكتمل الترحيل مع التسوية', description: `تم ترحيل ${all.length} قيد غير متوازن بتسوية آلية.` });
    };

    return (
        <>
            <PageHeader title="الترحيل الآلي للقيود إلى دفتر الأستاذ العام (Posting Controller)">
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={fetchPostedEntries} disabled={loadingPosted} className="gap-1.5">
                        <RefreshCw className={`h-4 w-4 ${loadingPosted ? 'animate-spin' : ''}`} />
                        تحديث
                    </Button>
                    {totalImbalanced > 0 && (
                        <Button size="sm" variant="destructive" onClick={handleBatchSkipAll} disabled={batchPosting} className="gap-1.5">
                            {batchPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                            ترحيل الكل مع تسوية ({totalImbalanced})
                        </Button>
                    )}
                    <Button size="sm" onClick={handleBatchPostPurchases} disabled={batchPosting || unpostedPurchases.length === 0} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                        {batchPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookCheck className="h-4 w-4" />}
                        ترحيل مجمع للمشتريات ({unpostedPurchases.length})
                    </Button>
                    <Button size="sm" onClick={handleBatchPostSales} disabled={batchPosting || unpostedSales.length === 0} className="gap-1.5 bg-primary text-primary-foreground">
                        {batchPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookCheck className="h-4 w-4" />}
                        ترحيل مجمع للمبيعات ({unpostedSales.length})
                    </Button>
                </div>
            </PageHeader>

            {/* شريط تقدم الترحيل المجمع */}
            {batchProgress && (
                <div className="mx-4 mt-2 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                    <div className="flex-1">
                        <div className="flex justify-between text-xs font-semibold mb-1">
                            <span>جارٍ ترحيل {batchProgress.type}...</span>
                            <span className="font-mono">{batchProgress.done} / {batchProgress.total}</span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-2 bg-primary rounded-full transition-all duration-300"
                                style={{ width: `${batchProgress.total > 0 ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }}
                            />
                        </div>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                        {batchProgress.total > 0 ? Math.round((batchProgress.done / batchProgress.total) * 100) : 0}%
                    </span>
                </div>
            )}

            <main className="flex-1 p-4 md:p-6 space-y-6">
                {/* KPI Cards */}
                <div className="grid gap-4 md:grid-cols-5">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">مبيعات بانتظار الترحيل</CardTitle>
                            <ShoppingCart className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold text-amber-600">{unpostedSales.length}</div>
                            <p className="text-xs text-muted-foreground mt-1">القيمة: {formatCurrency(unpostedSales.reduce((s, i) => s + (i.total || 0), 0))}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">مشتريات بانتظار الترحيل</CardTitle>
                            <Receipt className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold text-blue-600">{unpostedPurchases.length}</div>
                            <p className="text-xs text-muted-foreground mt-1">القيمة: {formatCurrency(unpostedPurchases.reduce((s, i) => s + (i.total || 0), 0))}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">مصروفات معلقة</CardTitle>
                            <CreditCard className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold text-purple-600">{unpostedExpenses.length}</div>
                            <p className="text-xs text-muted-foreground mt-1">القيمة: {formatCurrency(unpostedExpenses.reduce((s, e) => s + (e.amount || 0), 0))}</p>
                        </CardContent>
                    </Card>
                    <Card className={totalImbalanced > 0 ? "border-red-300 bg-red-50/40 dark:bg-red-950/20" : ""}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className={`text-sm font-semibold ${totalImbalanced > 0 ? 'text-red-800 dark:text-red-300' : 'text-muted-foreground'}`}>قيود غير متوازنة</CardTitle>
                            <Scale className={`h-4 w-4 ${totalImbalanced > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-extrabold ${totalImbalanced > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>{totalImbalanced}</div>
                            <p className="text-xs text-muted-foreground mt-1">{totalImbalanced > 0 ? 'تحتاج مراجعة أو تسوية آلية' : 'لا توجد قيود غير متوازنة'}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">القيود المرحّلة</CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">{postedEntries.length}</div>
                            <p className="text-xs text-muted-foreground mt-1">قيود مثبتة في الأستاذ العام</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-7">
                        <TabsTrigger value="sales">مبيعات ({unpostedSales.length})</TabsTrigger>
                        <TabsTrigger value="purchases">مشتريات ({unpostedPurchases.length})</TabsTrigger>
                        <TabsTrigger value="expenses">مصروفات ({unpostedExpenses.length})</TabsTrigger>
                        <TabsTrigger value="sales_returns" className="text-amber-700 dark:text-amber-400">مرتجع مبيعات ({unpostedSalesReturns.length})</TabsTrigger>
                        <TabsTrigger value="purchase_returns" className="text-blue-700 dark:text-blue-400">مرتجع مشتريات ({unpostedPurchaseReturns.length})</TabsTrigger>
                        <TabsTrigger value="imbalanced" className={totalImbalanced > 0 ? 'text-red-600' : ''}>
                            غير متوازنة
                            {totalImbalanced > 0 && <Badge variant="destructive" className="mr-1 h-4 px-1 text-[10px]">{totalImbalanced}</Badge>}
                        </TabsTrigger>
                        <TabsTrigger value="posted_ledger">سجل القيود ({postedEntries.length})</TabsTrigger>
                    </TabsList>

                    {/* == تبويب المبيعات == */}
                    <TabsContent value="sales" className="pt-4">
                        <Card>
                            <CardHeader className="py-3 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>فواتير المبيعات غير المرحّلة</CardTitle>
                                    <CardDescription>اضغط على رقم الفاتورة لعرض تفاصيلها والقيد المحاسبي.</CardDescription>
                                </div>
                                <Button size="sm" onClick={handleBatchPostSales} disabled={batchPosting || unpostedSales.length === 0} className="gap-1.5">
                                    <BookCheck className="h-4 w-4" /> ترحيل الكل
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">رقم الفاتورة</TableHead>
                                            <TableHead className="text-right">العميل</TableHead>
                                            <TableHead className="text-center">المبلغ قبل الضريبة</TableHead>
                                            <TableHead className="text-center">الضريبة</TableHead>
                                            <TableHead className="text-center">الإجمالي</TableHead>
                                            <TableHead className="text-center w-40">إجراء</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {unpostedSales.length === 0 ? (
                                            <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">كافة فواتير المبيعات مرحّلة.</TableCell></TableRow>
                                        ) : unpostedSales.map((inv: any) => {
                                            const subtotal  = inv.subtotal || (inv.total - (inv.tax || 0));
                                            const imbalance = getImbalanceInfo(inv, 'sale');
                                            return (
                                                <TableRow key={inv.id} className={imbalance.isImbalanced ? 'bg-red-50/40 dark:bg-red-950/10' : ''}>
                                                    <TableCell className="text-right font-mono text-xs">{new Date(inv.date).toLocaleDateString('ar-EG')}</TableCell>
                                                    <TableCell className="text-right font-mono font-bold">
                                                        <button className="hover:text-primary hover:underline" onClick={() => { setPreviewInv(inv); setPreviewType('sale'); }}>
                                                            {inv.invoiceNumber}
                                                        </button>
                                                        {imbalance.isImbalanced && <Badge variant="destructive" className="mr-1 h-4 px-1 text-[10px]">غير متوازن</Badge>}
                                                    </TableCell>
                                                    <TableCell className="text-right">{inv.customerName || 'نقدي'}</TableCell>
                                                    <TableCell className="text-center font-mono">{formatCurrency(subtotal)}</TableCell>
                                                    <TableCell className="text-center font-mono text-muted-foreground">{formatCurrency(inv.tax || 0)}</TableCell>
                                                    <TableCell className="text-center font-mono font-bold">{formatCurrency(inv.total)}</TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex items-center gap-1 justify-center">
                                                            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => { setPreviewInv(inv); setPreviewType('sale'); }} title="عرض التفاصيل">
                                                                <Eye className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                className={`h-8 gap-1 text-xs text-white ${imbalance.isImbalanced ? 'bg-orange-500 hover:bg-orange-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                                                onClick={() => handlePostSale(inv)}
                                                                disabled={isPosting === inv.id || postedSourceIds.has(inv.id)}
                                                            >
                                                                {isPosting === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                                                {imbalance.isImbalanced ? 'ترحيل+تسوية' : 'ترحيل'}
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* == تبويب المشتريات == */}
                    <TabsContent value="purchases" className="pt-4">
                        <Card>
                            <CardHeader className="py-3 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>فواتير المشتريات غير المرحّلة</CardTitle>
                                    <CardDescription>اضغط على رقم الفاتورة لعرض تفاصيلها والقيد المحاسبي.</CardDescription>
                                </div>
                                <Button size="sm" onClick={handleBatchPostPurchases} disabled={batchPosting || unpostedPurchases.length === 0} className="gap-1.5">
                                    <BookCheck className="h-4 w-4" /> ترحيل الكل ({unpostedPurchases.length})
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">رقم الفاتورة</TableHead>
                                            <TableHead className="text-right">المورد</TableHead>
                                            <TableHead className="text-center">المبلغ الصافي</TableHead>
                                            <TableHead className="text-center">الضريبة</TableHead>
                                            <TableHead className="text-center">الإجمالي</TableHead>
                                            <TableHead className="text-center w-40">إجراء</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {unpostedPurchases.length === 0 ? (
                                            <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">كافة فواتير المشتريات مرحّلة.</TableCell></TableRow>
                                        ) : unpostedPurchases.map((inv: any) => {
                                            const subtotal  = inv.subtotal || (inv.total - (inv.tax || 0));
                                            const imbalance = getImbalanceInfo(inv, 'purchase');
                                            return (
                                                <TableRow key={inv.id} className={imbalance.isImbalanced ? 'bg-red-50/40 dark:bg-red-950/10' : ''}>
                                                    <TableCell className="text-right font-mono text-xs">{new Date(inv.date).toLocaleDateString('ar-EG')}</TableCell>
                                                    <TableCell className="text-right font-mono font-bold">
                                                        <button className="hover:text-primary hover:underline" onClick={() => { setPreviewInv(inv); setPreviewType('purchase'); }}>
                                                            {inv.invoiceNumber}
                                                        </button>
                                                        {imbalance.isImbalanced && <Badge variant="destructive" className="mr-1 h-4 px-1 text-[10px]">غير متوازن</Badge>}
                                                    </TableCell>
                                                    <TableCell className="text-right">{inv.supplierName || 'مورد عام'}</TableCell>
                                                    <TableCell className="text-center font-mono">{formatCurrency(subtotal)}</TableCell>
                                                    <TableCell className="text-center font-mono text-muted-foreground">{formatCurrency(inv.tax || 0)}</TableCell>
                                                    <TableCell className="text-center font-mono font-bold">{formatCurrency(inv.total)}</TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex items-center gap-1 justify-center">
                                                            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => { setPreviewInv(inv); setPreviewType('purchase'); }} title="عرض التفاصيل">
                                                                <Eye className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                className={`h-8 gap-1 text-xs text-white ${imbalance.isImbalanced ? 'bg-orange-500 hover:bg-orange-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                                                onClick={() => handlePostPurchase(inv)}
                                                                disabled={isPosting === inv.id || postedSourceIds.has(inv.id)}
                                                            >
                                                                {isPosting === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                                                {imbalance.isImbalanced ? 'ترحيل+تسوية' : 'ترحيل'}
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* == تبويب المصروفات == */}
                    <TabsContent value="expenses" className="pt-4">
                        <Card>
                            <CardHeader className="py-3 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>المصروفات المعلقة</CardTitle>
                                    <CardDescription>ترحيل المصروفات التشغيلية والعمومية لدفتر الأستاذ العام.</CardDescription>
                                </div>
                                <Button size="sm" onClick={handleBatchPostExpenses} disabled={batchPosting || unpostedExpenses.length === 0} className="gap-1.5">
                                    <BookCheck className="h-4 w-4" /> ترحيل الكل
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">البيان</TableHead>
                                            <TableHead className="text-right">بند المصروف</TableHead>
                                            <TableHead className="text-center">المبلغ</TableHead>
                                            <TableHead className="text-center">الضريبة</TableHead>
                                            <TableHead className="text-center w-32">إجراء</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {unpostedExpenses.length === 0 ? (
                                            <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">كافة المصروفات مرحّلة.</TableCell></TableRow>
                                        ) : unpostedExpenses.map((exp: any) => (
                                            <TableRow key={exp.id}>
                                                <TableCell className="text-right font-mono text-xs">{new Date(exp.date).toLocaleDateString('ar-EG')}</TableCell>
                                                <TableCell className="text-right">{exp.description || 'مصروف عام'}</TableCell>
                                                <TableCell className="text-right font-medium">{exp.expenseType || 'تشغيل'}</TableCell>
                                                <TableCell className="text-center font-mono font-bold">{formatCurrency(exp.amount)}</TableCell>
                                                <TableCell className="text-center font-mono text-muted-foreground">{formatCurrency(exp.taxAmount || 0)}</TableCell>
                                                <TableCell className="text-center">
                                                    <Button
                                                        size="sm"
                                                        className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                                        onClick={() => handlePostExpense(exp)}
                                                        disabled={isPosting === exp.id || postedSourceIds.has(exp.id)}
                                                    >
                                                        {isPosting === exp.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                                        ترحيل
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* == تبويب مرتجعات المبيعات == */}
                    <TabsContent value="sales_returns" className="pt-4">
                        <Card className="border-amber-200">
                            <CardHeader className="py-3 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-amber-700 dark:text-amber-400">مرتجعات المبيعات غير المرحّلة</CardTitle>
                                    <CardDescription>قيد المرتجع: مدين إيرادات المبيعات + مدين الضريبة | دائن النقدية أو حساب العميل.</CardDescription>
                                </div>
                                <Button size="sm" onClick={handleBatchPostSalesReturns} disabled={batchPosting || unpostedSalesReturns.length === 0} className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
                                    <BookCheck className="h-4 w-4" /> ترحيل الكل ({unpostedSalesReturns.length})
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-amber-50/40 dark:bg-amber-950/10">
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">رقم الإيصال</TableHead>
                                            <TableHead className="text-right">العميل</TableHead>
                                            <TableHead className="text-center">الإجمالي قبل الضريبة</TableHead>
                                            <TableHead className="text-center">الضريبة</TableHead>
                                            <TableHead className="text-center">الإجمالي</TableHead>
                                            <TableHead className="text-center w-32">إجراء</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {unpostedSalesReturns.length === 0 ? (
                                            <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">كافة مرتجعات المبيعات مرحّلة.</TableCell></TableRow>
                                        ) : unpostedSalesReturns.map((ret: any) => (
                                            <TableRow key={ret.id}>
                                                <TableCell className="text-right font-mono text-xs">{new Date(ret.date).toLocaleDateString('ar-EG')}</TableCell>
                                                <TableCell className="text-right font-mono font-bold">{ret.receiptNumber || ret.id}</TableCell>
                                                <TableCell className="text-right">{ret.customerName || 'عميل'}</TableCell>
                                                <TableCell className="text-center font-mono">{formatCurrency(Number(ret.subtotal || ret.total || 0))}</TableCell>
                                                <TableCell className="text-center font-mono text-amber-700">{formatCurrency(Number(ret.tax || 0))}</TableCell>
                                                <TableCell className="text-center font-mono font-bold">{formatCurrency(Number(ret.total || 0))}</TableCell>
                                                <TableCell className="text-center">
                                                    <Button size="sm" className="h-8 gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                                                        onClick={() => handlePostSaleReturn(ret)}
                                                        disabled={isPosting === ret.id || postedSourceIds.has(ret.id)}>
                                                        {isPosting === ret.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                                        ترحيل
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* == تبويب مرتجعات المشتريات == */}
                    <TabsContent value="purchase_returns" className="pt-4">
                        <Card className="border-blue-200">
                            <CardHeader className="py-3 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-blue-700 dark:text-blue-400">مرتجعات المشتريات غير المرحّلة</CardTitle>
                                    <CardDescription>قيد المرتجع: مدين النقدية أو المورد | دائن المخزون + دائن الضريبة المدخلات.</CardDescription>
                                </div>
                                <Button size="sm" onClick={handleBatchPostPurchaseReturns} disabled={batchPosting || unpostedPurchaseReturns.length === 0} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                                    <BookCheck className="h-4 w-4" /> ترحيل الكل ({unpostedPurchaseReturns.length})
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-blue-50/40 dark:bg-blue-950/10">
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">رقم الإيصال</TableHead>
                                            <TableHead className="text-right">المورد</TableHead>
                                            <TableHead className="text-center">الإجمالي قبل الضريبة</TableHead>
                                            <TableHead className="text-center">الضريبة</TableHead>
                                            <TableHead className="text-center">الإجمالي</TableHead>
                                            <TableHead className="text-center w-32">إجراء</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {unpostedPurchaseReturns.length === 0 ? (
                                            <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">كافة مرتجعات المشتريات مرحّلة.</TableCell></TableRow>
                                        ) : unpostedPurchaseReturns.map((ret: any) => (
                                            <TableRow key={ret.id}>
                                                <TableCell className="text-right font-mono text-xs">{new Date(ret.date).toLocaleDateString('ar-EG')}</TableCell>
                                                <TableCell className="text-right font-mono font-bold">{ret.receiptNumber || ret.id}</TableCell>
                                                <TableCell className="text-right">{ret.supplierName || 'مورد'}</TableCell>
                                                <TableCell className="text-center font-mono">{formatCurrency(Number(ret.subtotal || ret.total || 0))}</TableCell>
                                                <TableCell className="text-center font-mono text-blue-700">{formatCurrency(Number(ret.tax || 0))}</TableCell>
                                                <TableCell className="text-center font-mono font-bold">{formatCurrency(Number(ret.total || 0))}</TableCell>
                                                <TableCell className="text-center">
                                                    <Button size="sm" className="h-8 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                                        onClick={() => handlePostPurchaseReturn(ret)}
                                                        disabled={isPosting === ret.id || postedSourceIds.has(ret.id)}>
                                                        {isPosting === ret.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                                        ترحيل
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* == تبويب غير متوازنة == */}
                    <TabsContent value="imbalanced" className="pt-4">
                        {totalImbalanced === 0 ? (
                            <Card className="border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20">
                                <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                                    <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                                    <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">لا توجد قيود غير متوازنة</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <Card className="border-red-200">
                                <CardHeader className="py-3 flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle className="text-red-700 flex items-center gap-2">
                                            <AlertCircle className="h-5 w-5" /> القيود غير المتوازنة ({totalImbalanced})
                                        </CardTitle>
                                        <CardDescription className="mt-1">ترحيل مع إضافة سطر تسوية آلي، أو تجاهل مؤقت.</CardDescription>
                                    </div>
                                    <Button size="sm" variant="destructive" onClick={handleBatchSkipAll} disabled={batchPosting} className="gap-1.5">
                                        {batchPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                                        ترحيل الكل مع تسوية
                                    </Button>
                                </CardHeader>
                                <CardContent className="p-0 overflow-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-red-50/50 dark:bg-red-950/20">
                                                <TableHead className="text-right">التاريخ</TableHead>
                                                <TableHead className="text-right">رقم الفاتورة</TableHead>
                                                <TableHead className="text-right">الطرف</TableHead>
                                                <TableHead className="text-right">النوع</TableHead>
                                                <TableHead className="text-center">المدين</TableHead>
                                                <TableHead className="text-center">الدائن</TableHead>
                                                <TableHead className="text-center text-red-600">الفرق</TableHead>
                                                <TableHead className="text-center w-44">الإجراء</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {[...imbalancedSales.map((i: any) => ({ inv: i, type: 'sale' as const })), ...imbalancedPurchases.map((i: any) => ({ inv: i, type: 'purchase' as const }))].map(({ inv, type }) => {
                                                const info = getImbalanceInfo(inv, type);
                                                return (
                                                    <TableRow key={inv.id} className="bg-red-50/30 hover:bg-red-100/50">
                                                        <TableCell className="text-right font-mono text-xs">{new Date(inv.date).toLocaleDateString('ar-EG')}</TableCell>
                                                        <TableCell className="text-right font-mono font-bold">{inv.invoiceNumber}</TableCell>
                                                        <TableCell className="text-right text-sm">{type === 'sale' ? (inv.customerName || 'نقدي') : (inv.supplierName || 'مورد عام')}</TableCell>
                                                        <TableCell><Badge variant="outline" className={`text-xs ${type === 'sale' ? 'border-amber-500 text-amber-700' : 'border-blue-500 text-blue-700'}`}>{type === 'sale' ? 'مبيعات' : 'مشتريات'}</Badge></TableCell>
                                                        <TableCell className="text-center font-mono text-sm">{formatCurrency(info.rawDr)}</TableCell>
                                                        <TableCell className="text-center font-mono text-sm">{formatCurrency(info.rawCr)}</TableCell>
                                                        <TableCell className="text-center font-mono font-bold text-red-600">{formatCurrency(info.diff)}</TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="flex items-center gap-1 justify-center">
                                                                <Button size="sm" className="h-7 gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white px-2" onClick={() => handleSkipAndPost(inv, type)} disabled={isSkipping === inv.id}>
                                                                    {isSkipping === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <SkipForward className="h-3 w-3" />}
                                                                    ترحيل + تسوية
                                                                </Button>
                                                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDismiss(inv.id)}>
                                                                    <XCircle className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                                <CardFooter className="py-3 px-4 bg-amber-50/50 border-t border-amber-200">
                                    <div className="flex items-start gap-2 text-xs text-amber-800">
                                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                        <span><strong>ملاحظة:</strong> سطر التسوية الآلي يُضاف إلى حساب "فروق التسوية الآلية". يُنصح بمراجعة بيانات الفاتورة وتصحيحها لاحقاً.</span>
                                    </div>
                                </CardFooter>
                            </Card>
                        )}
                    </TabsContent>

                    {/* == تبويب سجل القيود المرحّلة == */}
                    <TabsContent value="posted_ledger" className="pt-4">
                        <Card>
                            <CardHeader className="py-3 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>سجل القيود المركزية المرحّلة (General Ledger)</CardTitle>
                                    <CardDescription>القيود المزدوجة المتوازنة المثبتة بشكل دائم في الأستاذ العام.</CardDescription>
                                </div>
                                <Badge className="bg-emerald-600 font-mono text-xs">{postedEntries.length} قيد مرحّل</Badge>
                            </CardHeader>
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="text-right w-36">رقم القيد</TableHead>
                                            <TableHead className="text-right">التاريخ</TableHead>
                                            <TableHead className="text-right">المستند</TableHead>
                                            <TableHead className="text-right">البيان</TableHead>
                                            <TableHead className="text-center">إجمالي المدين</TableHead>
                                            <TableHead className="text-center">إجمالي الدائن</TableHead>
                                            <TableHead className="text-center">الحالة</TableHead>
                                            <TableHead className="text-center w-32">إجراء</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {postedEntries.length === 0 ? (
                                            <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">لا توجد قيود مرحّلة حالياً.</TableCell></TableRow>
                                        ) : postedEntries.map((entry: any) => {
                                            const linesData = entry.LinesJson ? (() => { try { return JSON.parse(entry.LinesJson); } catch { return []; } })() : [];
                                            const hasSettlementLine = linesData.some((l: any) => l.account?.includes('فروق التسوية'));
                                            const isUnpostingThis = isUnposting === entry.SourceId;
                                            return (
                                                <TableRow key={entry.Id} className={hasSettlementLine ? 'bg-orange-50/30 dark:bg-orange-950/10' : ''}>
                                                    <TableCell className="text-right font-mono font-bold text-primary">{entry.EntryNumber}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs">{new Date(entry.Date).toLocaleDateString('ar-EG')}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs font-semibold">{entry.SourceNumber || entry.SourceType}</TableCell>
                                                    <TableCell className="text-right text-xs max-w-[200px] truncate" title={entry.Description}>{entry.Description}</TableCell>
                                                    <TableCell className="text-center font-mono font-bold">{formatCurrency(Number(entry.TotalDebit))}</TableCell>
                                                    <TableCell className="text-center font-mono font-bold">{formatCurrency(Number(entry.TotalCredit))}</TableCell>
                                                    <TableCell className="text-center">
                                                        {hasSettlementLine ? (
                                                            <Badge className="bg-orange-500 text-white gap-1 text-[11px]">
                                                                <AlertCircle className="h-3 w-3" /> مرحّل + تسوية
                                                            </Badge>
                                                        ) : (
                                                            <Badge className="bg-emerald-600 text-white gap-1 text-[11px]">
                                                                <Check className="h-3 w-3" /> مرحّل
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex items-center gap-1 justify-center">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                                                onClick={() => handleRepost(entry)}
                                                                disabled={isUnpostingThis}
                                                                title="إعادة الترحيل (فك + ترحيل بسطور محدّثة)"
                                                            >
                                                                {isUnpostingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-red-50"
                                                                onClick={() => handleUnpost(entry.SourceId, entry.SourceNumber)}
                                                                disabled={isUnpostingThis}
                                                                title="فك الترحيل (حذف القيد من الأستاذ العام)"
                                                            >
                                                                {isUnpostingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>

            {/* Preview Dialog */}
            <InvoicePreviewDialog
                inv={previewInv}
                type={previewType}
                isPosted={previewInv ? postedSourceIds.has(previewInv.id) : false}
                cashAccounts={cashAccounts}
                lines={previewInv ? (previewType === 'sale' ? buildSaleLines(previewInv) : buildPurchaseLines(previewInv)) : []}
                formatCurrency={formatCurrency}
                onClose={() => setPreviewInv(null)}
                onPost={() => {
                    if (previewInv) {
                        previewType === 'sale' ? handlePostSale(previewInv) : handlePostPurchase(previewInv);
                        setPreviewInv(null);
                    }
                }}
                isPosting={previewInv ? isPosting === previewInv.id : false}
            />
        </>
    );
}

// == مكوّن Dialog عرض الفاتورة ==
function InvoicePreviewDialog({
    inv, type, isPosted, cashAccounts, lines, formatCurrency, onClose, onPost, isPosting
}: {
    inv: any;
    type: 'sale' | 'purchase';
    isPosted: boolean;
    cashAccounts: any[];
    lines: any[];
    formatCurrency: (n: number) => string;
    onClose: () => void;
    onPost: () => void;
    isPosting: boolean;
}) {
    if (!inv) return null;

    const items: any[] = (() => { try { return JSON.parse(inv.itemsJson || inv.ItemsJson || '[]'); } catch { return []; } })();
    const subtotal  = inv.subtotal  ?? (inv.total - (inv.tax || 0));
    const tax       = inv.tax       || 0;
    const discount  = inv.discount  || 0;
    const total     = inv.total     || 0;
    const paid      = inv.paidAmount || 0;
    const remaining = Math.max(total - paid, 0);
    const totalDr   = lines.reduce((s, l) => s + (l.debit  || 0), 0);
    const totalCr   = lines.reduce((s, l) => s + (l.credit || 0), 0);
    const hasSettlement = lines.some(l => l.account?.includes('فروق التسوية'));
    const isSale    = type === 'sale';
    const partyName = isSale ? (inv.customerName || 'نقدي') : (inv.supplierName || 'مورد عام');
    const cashAcc   = cashAccounts.find((c: any) => c.id === (isSale ? inv.paidToAccountId : inv.paidFromAccountId))?.name || 'النقدية / البنك';

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <Receipt className="h-5 w-5 text-primary" />
                        {isSale ? 'فاتورة مبيعات' : 'فاتورة مشتريات'} — {inv.invoiceNumber}
                        {isPosted
                            ? <Badge className="bg-emerald-600 text-white text-xs gap-1"><Check className="h-3 w-3" />مرحَّل</Badge>
                            : <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">بانتظار الترحيل</Badge>}
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" />رقم الفاتورة</span>
                        <span className="font-bold font-mono">{inv.invoiceNumber}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />التاريخ</span>
                        <span className="font-mono">{new Date(inv.date).toLocaleDateString('ar-EG')}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{isSale ? 'العميل' : 'المورد'}</span>
                        <span className="font-semibold">{partyName}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />حساب الدفع</span>
                        <span className="font-semibold text-xs">{cashAcc}</span>
                    </div>
                </div>

                <div className="mt-2">
                    <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                        <ShoppingCart className="h-4 w-4 text-primary" /> الأصناف ({items.length})
                    </h3>
                    {items.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">لا توجد أصناف مسجّلة</p>
                    ) : (
                        <div className="rounded-lg border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 text-xs">
                                        <TableHead className="text-right py-2">#</TableHead>
                                        <TableHead className="text-right py-2">الصنف</TableHead>
                                        <TableHead className="text-center py-2">الكمية</TableHead>
                                        <TableHead className="text-center py-2">الوحدة</TableHead>
                                        <TableHead className="text-center py-2">سعر الوحدة</TableHead>
                                        <TableHead className="text-center py-2">الخصم</TableHead>
                                        <TableHead className="text-center py-2">الإجمالي</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item: any, idx: number) => {
                                        const qty   = Number(item.quantity || item.qty   || 0);
                                        const price = Number(item.price    || item.unitPrice || 0);
                                        const disc  = Number(item.discount || 0);
                                        return (
                                            <TableRow key={idx} className="text-xs">
                                                <TableCell className="text-right text-muted-foreground">{idx + 1}</TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {item.productName || item.name || item.itemName || `صنف ${idx + 1}`}
                                                    {item.barcode && <span className="block text-[10px] text-muted-foreground font-mono">{item.barcode}</span>}
                                                </TableCell>
                                                <TableCell className="text-center font-mono">{qty.toLocaleString('ar-EG')}</TableCell>
                                                <TableCell className="text-center text-muted-foreground">{item.unit || item.unitName || '—'}</TableCell>
                                                <TableCell className="text-center font-mono">{formatCurrency(price)}</TableCell>
                                                <TableCell className="text-center text-muted-foreground">{disc > 0 ? `${disc}%` : '—'}</TableCell>
                                                <TableCell className="text-center font-mono font-bold">{formatCurrency(qty * price * (1 - disc / 100))}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                <div className="flex justify-end mt-1">
                    <div className="w-72 space-y-1 text-sm border rounded-lg p-3 bg-muted/30">
                        <div className="flex justify-between"><span className="text-muted-foreground">المبلغ قبل الضريبة</span><span className="font-mono">{formatCurrency(subtotal)}</span></div>
                        {discount > 0 && <div className="flex justify-between text-red-600"><span>الخصم</span><span className="font-mono">- {formatCurrency(discount)}</span></div>}
                        {tax     > 0 && <div className="flex justify-between text-amber-700"><span>ضريبة القيمة المضافة (14%)</span><span className="font-mono">{formatCurrency(tax)}</span></div>}
                        <Separator />
                        <div className="flex justify-between font-bold text-base"><span>الإجمالي</span><span className="font-mono">{formatCurrency(total)}</span></div>
                        <div className="flex justify-between text-emerald-700"><span>المدفوع</span><span className="font-mono">{formatCurrency(paid)}</span></div>
                        {remaining > 0.01 && <div className="flex justify-between text-red-600 font-semibold"><span>المتبقي (آجل)</span><span className="font-mono">{formatCurrency(remaining)}</span></div>}
                    </div>
                </div>

                <Separator className="my-1" />

                <div>
                    <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-primary" />
                        القيد المحاسبي {isPosted ? 'المرحَّل' : 'المقترح'}
                        {hasSettlement && <Badge variant="outline" className="text-orange-600 border-orange-400 text-[10px] gap-1"><AlertCircle className="h-3 w-3" />يحتوي سطر تسوية آلي</Badge>}
                    </h3>
                    <div className="rounded-lg border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 text-xs">
                                    <TableHead className="text-right py-2">الحساب</TableHead>
                                    <TableHead className="text-right py-2">البيان</TableHead>
                                    <TableHead className="text-center py-2 text-blue-700">مدين</TableHead>
                                    <TableHead className="text-center py-2 text-red-700">دائن</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lines.map((line: any, idx: number) => (
                                    <TableRow key={idx} className={`text-xs ${line.account?.includes('فروق التسوية') ? 'bg-orange-50/50' : ''}`}>
                                        <TableCell className="text-right font-semibold">{line.account}</TableCell>
                                        <TableCell className="text-right text-muted-foreground text-[11px]">{line.description}</TableCell>
                                        <TableCell className="text-center font-mono text-blue-700">{line.debit  > 0 ? formatCurrency(line.debit)  : '—'}</TableCell>
                                        <TableCell className="text-center font-mono text-red-700"> {line.credit > 0 ? formatCurrency(line.credit) : '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex justify-between mt-2 px-2 text-sm font-bold">
                        <div className="flex gap-6">
                            <span className="text-blue-700">إجمالي المدين: <span className="font-mono">{formatCurrency(totalDr)}</span></span>
                            <span className="text-red-700">إجمالي الدائن: <span className="font-mono">{formatCurrency(totalCr)}</span></span>
                        </div>
                        <Badge className={Math.abs(totalDr - totalCr) < 0.01 ? 'bg-emerald-600' : 'bg-red-600'}>
                            {Math.abs(totalDr - totalCr) < 0.01 ? 'متوازن' : `فرق: ${formatCurrency(Math.abs(totalDr - totalCr))}`}
                        </Badge>
                    </div>
                </div>

                {!isPosted && (
                    <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button variant="outline" onClick={onClose}>إغلاق</Button>
                        <Button onClick={onPost} disabled={isPosting} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                            {isPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookCheck className="h-4 w-4" />}
                            ترحيل القيد الآن
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
