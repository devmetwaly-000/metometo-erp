

"use client";

// استيراد المكونات والأدوات اللازمة
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2, Printer, Download } from "lucide-react";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Combobox } from "@/components/ui/combobox";
import { useSearchParams } from "next/navigation";
import * as XLSX from 'xlsx';
import Link from "next/link";
import { getLinkForReceipt } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

// تعريف واجهات البيانات (Interfaces) لضمان تطابق أنواع البيانات
interface Item { id: string; name: string; code?: string; itemType?: string; }
interface Warehouse { id: string; name: string; }
interface SaleInvoice { id: string; invoiceNumber?: string; warehouseId: string; items: { id: string; qty: number; }[]; status?: 'approved' | 'pending'; date: string;}
interface PosSale { id: string; invoiceNumber?: string; warehouseId: string; items: { id: string; qty: number; }[]; date: string; }
interface StockInRecord { id: string; receiptNumber?: string; warehouseId: string; items: { itemId?: string; id?: string, qty: number; cost?: number; }[]; date: string; purchaseInvoiceId?: string; reason?: string; batchNumber?: string; }
interface StockOutRecord { id: string; receiptNumber?: string; sourceId: string; items: { id: string; qty: number; cost?: number; }[]; reason?: string; saleInvoiceId?: string; type?: string; saleInvoiceNumber?: string; date: string; }
interface StockTransferRecord { id: string; receiptNumber?: string; fromSourceId: string; toSourceId: string; items: { id: string; qty: number; }[]; date: string; }
interface StockAdjustmentRecord { id: string; receiptNumber?: string; warehouseId: string; items: { itemId:string; difference: number; }[]; date: string; }
interface SalesReturn { id: string; receiptNumber?: string; warehouseId: string; items: { id: string; qty: number; }[]; date: string; }
interface PurchaseReturn { id: string; receiptNumber?: string; warehouseId: string; items: { id: string; qty: number; }[]; date: string; }
interface IssueToRep { id: string; receiptNumber?: string; warehouseId: string; items: { id: string; qty: number; cost?: number; }[]; date: string; }
interface ReturnFromRep { id: string; receiptNumber?: string; warehouseId: string; items: { id: string; qty: number; }[]; date:string; }
interface InventoryClosing { id: string; warehouseId: string; closingDate: string; balances: { itemId: string, balance: number }[] }
interface PosReturn { id: string; receiptNumber?: string; warehouseId: string; items: { id: string; qty: number; }[]; date: string; }


/**
 * المكون الرئيسي لصفحة كارت الصنف `ItemLedgerPage`.
 * هذا المكون مسؤول عن عرض تقرير مفصل لجميع حركات صنف معين في مخزن معين خلال فترة زمنية.
 * @returns {JSX.Element} واجهة مستخدم كاملة لعرض كارت الصنف.
 */
export default function ItemLedgerPage() {
    const searchParams = useSearchParams();
    const { user } = useAuth();
    // حالات (States) لإدارة فلاتر البحث والبيانات المعروضة
    const [filters, setFilters] = useState({
        itemId: "",
        warehouseId: "",
        fromDate: "",
        toDate: ""
    });
    const [reportData, setReportData] = useState<any[] | null>(null);
    const [openingBalance, setOpeningBalance] = useState(0);

    // استدعاء جميع البيانات اللازمة من السياق المركزي `useData`
    const { 
        items, warehouses, salesInvoices, posSales, stockInRecords, stockOutRecords, 
        stockTransferRecords, stockAdjustmentRecords, salesReturns, posReturns, 
        purchaseReturns, stockIssuesToReps, stockReturnsFromReps, inventoryClosings, 
        purchaseInvoices, loading 
    } = useData();
    
    // `useEffect` لقراءة الفلاتر من رابط URL عند تحميل الصفحة
    useEffect(() => {
        const itemId = searchParams.get('itemId');
        const warehouseId = searchParams.get('warehouseId');
        if (itemId) setFilters(prev => ({...prev, itemId}));
        if (warehouseId) {
            setFilters(prev => ({...prev, warehouseId}));
        } else if (user?.warehouseIds?.length === 1 && user.warehouseIds[0] !== 'all') {
            setFilters(prev => ({...prev, warehouseId: user.warehouseIds[0]}));
        }
    }, [searchParams, user]);

    /**
     * دالة `handleGenerateReport`
     * @type {Function}
     * تستخدم `useCallback` لتحسين الأداء ومنع إعادة تعريف الدالة إلا عند تغير مدخلاتها.
     * تقوم بحساب رصيد أول المدة ثم تجمع كل الحركات (وارد وصادر) للصنف المحدد في الفترة المحددة،
     * وتحسب الرصيد بعد كل حركة، ثم تحدث حالة `reportData` لعرض النتائج.
     */
    const handleGenerateReport = useCallback(() => {
        if (!filters.itemId || !filters.warehouseId) {
            alert("يرجى اختيار صنف ومخزن.");
            return;
        }

        const { itemId, warehouseId, fromDate, toDate } = filters;
        
        // البحث عن آخر إقفال للمخزن المحدد لتحديد نقطة بداية الحساب
        const closingsForWarehouse: InventoryClosing[] = (inventoryClosings || []).filter((c: InventoryClosing) => c.warehouseId === warehouseId)
            .sort((a:any,b:any) => new Date(b.closingDate).getTime() - new Date(a.closingDate).getTime());
        
        const lastClosing = closingsForWarehouse[0] ?? null;
        const lastClosingDate = lastClosing ? new Date(lastClosing.closingDate) : new Date(0);
        let ob = lastClosing?.balances?.find((b: any) => b.itemId === itemId)?.balance || 0;

        // دالة داخلية لحساب التغير في الرصيد بين تاريخين (لحساب رصيد أول المدة)
        const calculateDelta = (startDate: Date, endDate: Date) => {
            let delta = 0;
            const filterForOpening = (t: {date: string}) => new Date(t.date) > startDate && new Date(t.date) < endDate;
            
            // إضافة الوارد
            (stockInRecords || []).filter((t: StockInRecord) => t.warehouseId === warehouseId && t.items.some((i: any) => (i.itemId || i.id) === itemId) && filterForOpening(t)).forEach((t: StockInRecord) => { t.items.filter((i: any) => (i.itemId || i.id) === itemId).forEach((i: any) => delta += i.qty); });
            (stockTransferRecords || []).filter((t: StockTransferRecord) => t.toSourceId === warehouseId && t.items.some((i: any) => (i.id || (i as any).itemId) === itemId) && filterForOpening(t)).forEach((t: StockTransferRecord) => { t.items.filter((i: any) => (i.id || (i as any).itemId) === itemId).forEach((i: any) => delta += i.qty); });
            (salesReturns || []).filter((t: SalesReturn) => t.warehouseId === warehouseId && t.items.some((i: any) => (i.id || (i as any).itemId) === itemId) && filterForOpening(t)).forEach((t: SalesReturn) => { t.items.filter((i: any) => (i.id || (i as any).itemId) === itemId).forEach((i: any) => delta += i.qty); });
            (stockReturnsFromReps || []).filter((t: ReturnFromRep) => t.warehouseId === warehouseId && t.items.some((i: any) => (i.id || (i as any).itemId) === itemId) && filterForOpening(t)).forEach((t: ReturnFromRep) => { t.items.filter((i: any) => (i.id || (i as any).itemId) === itemId).forEach((i: any) => delta += i.qty); });
            (stockAdjustmentRecords || []).filter((t: StockAdjustmentRecord) => t.warehouseId === warehouseId && t.items.some((i: any) => i.itemId === itemId) && filterForOpening(t)).forEach((t: StockAdjustmentRecord) => { t.items.filter((i: any) => i.itemId === itemId && i.difference > 0).forEach((i: any) => delta += i.difference); });
            
            // خصم الصادر
            (salesInvoices || []).filter((s: any) => s.warehouseId === warehouseId && (s.status === 'approved' || !s.status || s.status === 'completed') && s.items.some((i: any) => (i.id || i.itemId) === itemId) && filterForOpening(s)).forEach((s: any) => { s.items.filter((i: any) => (i.id || i.itemId) === itemId).forEach((i: any) => delta -= Number(i.qty || 0)); });
            (stockOutRecords || []).filter((t: StockOutRecord) => !t.saleInvoiceId && t.sourceId === warehouseId && t.items.some((i: any) => i.id === itemId) && filterForOpening(t)).forEach((t: StockOutRecord) => { t.items.filter((i: any) => i.id === itemId).forEach((i: any) => delta -= i.qty); });
            (stockTransferRecords || []).filter((t: StockTransferRecord) => t.fromSourceId === warehouseId && t.items.some((i: any) => i.id === itemId) && filterForOpening(t)).forEach((t: StockTransferRecord) => { t.items.filter((i: any) => i.id === itemId).forEach((i: any) => delta -= i.qty); });
            (purchaseReturns || []).filter((t: PurchaseReturn) => t.warehouseId === warehouseId && t.items.some((i: any) => i.id === itemId) && filterForOpening(t)).forEach((t: PurchaseReturn) => { t.items.filter((i: any) => i.id === itemId).forEach((i: any) => delta -= i.qty); });
            (stockIssuesToReps || []).filter((t: IssueToRep) => t.warehouseId === warehouseId && t.items.some((i: any) => i.id === itemId) && filterForOpening(t)).forEach((t: IssueToRep) => { t.items.filter((i: any) => i.id === itemId).forEach((i: any) => delta -= i.qty); });
            (stockAdjustmentRecords || []).filter((t: StockAdjustmentRecord) => t.warehouseId === warehouseId && t.items.some((i: any) => i.itemId === itemId) && filterForOpening(t)).forEach((t: StockAdjustmentRecord) => { t.items.filter((i: any) => i.itemId === itemId && i.difference < 0).forEach((i: any) => delta += i.difference); });
            
            return delta;
        }

        // إذا تم تحديد تاريخ بداية، يتم حساب الرصيد الافتتاحي حتى هذا التاريخ
        if (fromDate) {
            ob += calculateDelta(lastClosingDate, new Date(fromDate));
        }
        
        setOpeningBalance(ob);

        // تجميع كل الحركات في مصفوفة واحدة
        const allTransactions: any[] = [];
        const filterPeriod = (t: { date: string }) => {
            const itemDate = new Date(t.date);
            const fromDateObj = fromDate ? new Date(fromDate) : null;
            const toDateObj = toDate ? new Date(toDate) : null;
            if(fromDateObj) fromDateObj.setHours(0,0,0,0);
            if(toDateObj) toDateObj.setHours(23,59,59,999);
            if(fromDateObj && itemDate < fromDateObj) return false;
            if(toDateObj && itemDate > toDateObj) return false;
            return true;
        }

        // إضافة جميع أنواع الحركات (وارد وصادر) إلى المصفوفة
        (stockInRecords || []).filter((t:StockInRecord) => t.warehouseId === warehouseId && filterPeriod(t)).forEach((t:StockInRecord) => { t.items.filter((i:any) => (i.id || i.itemId) === itemId).forEach((i:any) => {
            const purchaseInvoice = t.purchaseInvoiceId ? (purchaseInvoices || []).find((inv:any) => inv.id === t.purchaseInvoiceId) : null;
            const description = purchaseInvoice ? `استلام من فاتورة شراء` : `استلام (${t.reason})`;
            allTransactions.push({ date: t.date, type: description, ref: purchaseInvoice ? purchaseInvoice.invoiceNumber : t.receiptNumber, incoming: i.qty, outgoing: 0, cost: i.cost, batchNumber: t.batchNumber });
        })});

        (salesReturns || []).filter((t: SalesReturn) => t.warehouseId === warehouseId && filterPeriod(t)).forEach((t: SalesReturn) => { t.items.filter((i:any) => (i.id || (i as any).itemId) === itemId).forEach((i:any) => allTransactions.push({ date: t.date, type: 'مرتجع بيع', ref: t.receiptNumber, incoming: i.qty, outgoing: 0, cost: (i as any).price })); });
        (stockReturnsFromReps || []).filter((t: ReturnFromRep) => t.warehouseId === warehouseId && filterPeriod(t)).forEach((t: ReturnFromRep) => { t.items.filter((i:any) => (i.id || (i as any).itemId) === itemId).forEach((i:any) => allTransactions.push({ date: t.date, type: 'مرتجع من مندوب', ref: t.receiptNumber, incoming: i.qty, outgoing: 0, cost: (i as any).cost })); });
        (stockAdjustmentRecords || []).filter((t: StockAdjustmentRecord) => t.warehouseId === warehouseId && filterPeriod(t)).forEach((t: StockAdjustmentRecord) => { t.items.filter((i:any) => i.itemId === itemId && i.difference > 0).forEach((i:any) => allTransactions.push({ date: t.date, type: 'تسوية (زيادة)', ref: t.receiptNumber, incoming: i.difference, outgoing: 0 })); });
        (stockTransferRecords || []).filter((t: StockTransferRecord) => t.toSourceId === warehouseId && filterPeriod(t)).forEach((t: StockTransferRecord) => { t.items.filter((i:any) => i.id === itemId).forEach((i:any) => allTransactions.push({ date: t.date, type: `تحويل من ${warehouses.find((w:any)=>w.id===t.fromSourceId)?.name}`, ref: t.receiptNumber, incoming: i.qty, outgoing: 0 })); });
        
        // فواتير المبيعات (المعتمدة / المكتملة)
        (salesInvoices || []).filter((s: any) => s.warehouseId === warehouseId && (s.status === 'approved' || !s.status || s.status === 'completed') && filterPeriod(s)).forEach((s: any) => {
            s.items.filter((i: any) => (i.id || i.itemId) === itemId).forEach((i: any) => {
                const desc = s.cashierId || (s.invoiceNumber && s.invoiceNumber.startsWith('POS')) ? 'بيع كاشير (POS)' : 'فاتورة مبيعات';
                allTransactions.push({ date: s.date, type: desc, ref: s.invoiceNumber || s.id, incoming: 0, outgoing: Number(i.qty || 0), cost: i.cost, price: i.price });
            });
        });

        // حركات الصرف المخزني اليدوي (التالف / العينات / غير المرتبط بفاتورة مبيعات)
        (stockOutRecords || []).filter((t: StockOutRecord) => !t.saleInvoiceId && (t.sourceId === warehouseId || (t as any).warehouseId === warehouseId) && filterPeriod(t)).forEach((t: StockOutRecord) => { t.items.filter((i:any) => i.id === itemId).forEach((i:any) => {
            let type = t.reason ? `صرف (${t.reason})` : 'صرف مخزني';
            allTransactions.push({ date: t.date, type, ref: t.saleInvoiceNumber || t.receiptNumber, incoming: 0, outgoing: i.qty, cost: i.cost })
        })});
        
        (purchaseReturns || []).filter((t: PurchaseReturn) => t.warehouseId === warehouseId && filterPeriod(t)).forEach((t: PurchaseReturn) => { t.items.filter((i:any) => i.id === itemId).forEach((i:any) => allTransactions.push({ date: t.date, type: 'مرتجع شراء', ref: t.receiptNumber, incoming: 0, outgoing: i.qty, cost: i.price })); });
        (stockIssuesToReps || []).filter((t: IssueToRep) => t.warehouseId === warehouseId && filterPeriod(t)).forEach((t: IssueToRep) => { t.items.filter((i:any) => i.id === itemId).forEach((i:any) => allTransactions.push({ date: t.date, type: 'صرف لمندوب', ref: t.receiptNumber, incoming: 0, outgoing: i.qty, cost: i.cost })); });
        (stockAdjustmentRecords || []).filter((t: StockAdjustmentRecord) => t.warehouseId === warehouseId && filterPeriod(t)).forEach((t: StockAdjustmentRecord) => { t.items.filter((i:any) => i.itemId === itemId && i.difference < 0).forEach((i:any) => allTransactions.push({ date: t.date, type: 'تسوية (عجز)', ref: t.receiptNumber, incoming: 0, outgoing: Math.abs(i.difference) })); });
        (stockTransferRecords || []).filter((t: StockTransferRecord) => t.fromSourceId === warehouseId && filterPeriod(t)).forEach((t: StockTransferRecord) => { t.items.filter((i:any) => i.id === itemId).forEach((i:any) => allTransactions.push({ date: t.date, type: `تحويل إلى ${warehouses.find((w:any)=>w.id===t.toSourceId)?.name}`, ref: t.receiptNumber, incoming: 0, outgoing: i.qty })); });
        
        // ترتيب الحركات حسب التاريخ
        allTransactions.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        // حساب الرصيد المرحل بعد كل حركة
        let runningBalance = ob;
        const finalReport = allTransactions.map(tx => {
            runningBalance = runningBalance + tx.incoming - tx.outgoing;
            return { ...tx, balance: runningBalance };
        });
        
        setReportData(finalReport);
    }, [filters, inventoryClosings, stockInRecords, stockTransferRecords, salesReturns, posReturns, stockReturnsFromReps, stockAdjustmentRecords, stockOutRecords, purchaseReturns, stockIssuesToReps, purchaseInvoices, warehouses, salesInvoices, posSales, items]);

    // `useEffect` لتشغيل التقرير تلقائيًا عند تغيير الفلاتر
    useEffect(() => {
        if(filters.itemId && filters.warehouseId) {
            handleGenerateReport();
        }
    }, [filters.itemId, filters.warehouseId, filters.fromDate, filters.toDate, handleGenerateReport]);


    // `useMemo` لتجهيز خيارات الأصناف والمخازن لعرضها في قوائم الاختيار
    const itemOptions = React.useMemo(() => (items || []).map((i: Item) => ({ value: i.id, label: `${i.name} (${i.code})` })), [items]);
    const warehouseOptions = React.useMemo(() => {
        const allowedWarehouses = user?.warehouseIds?.includes('all') 
            ? warehouses 
            : (warehouses || []).filter((w: Warehouse) => user?.warehouseIds?.includes(w.id));
        return allowedWarehouses.map((w: Warehouse) => ({ value: w.id, label: w.name }));
    }, [warehouses, user]);

    /**
     * دالة `handleFilterChange`
     * @param {keyof typeof filters} key - اسم حقل الفلتر.
     * @param {string} value - القيمة الجديدة للفلتر.
     * تقوم بتحديث حالة الفلاتر.
     */
    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({...prev, [key]: value}));
    };
    
    /**
     * دالة `handlePrint`
     * تقوم بفتح نافذة الطباعة الخاصة بالمتصفح.
     */
    const handlePrint = () => window.print();

    /**
     * دالة `handleExportExcel`
     * تقوم بتصدير بيانات التقرير المعروض إلى ملف Excel.
     */
    const handleExportExcel = () => {
        if (!reportData) return;

        const dataForExport = [
            {
                'التاريخ': 'رصيد أول الفترة',
                'البيان': '',
                'المرجع': '',
                'الباتش': '',
                'التكلفة': '',
                'وارد': '',
                'صادر': '',
                'الرصيد': openingBalance
            },
            ...reportData.map(tx => ({
                'التاريخ': new Date(tx.date).toLocaleDateString('ar-EG'),
                'البيان': tx.type,
                'المرجع': tx.ref || '',
                'الباتش': tx.batchNumber || '',
                'التكلفة': tx.cost || 0,
                'وارد': tx.incoming || 0,
                'صادر': tx.outgoing || 0,
                'الرصيد': tx.balance
            })),
            {
                 'التاريخ': 'الرصيد النهائي',
                'البيان': '',
                'المرجع': '',
                'الباتش': '',
                'التكلفة': '',
                'وارد': '',
                'صادر': '',
                'الرصيد': reportData.at(-1)?.balance ?? openingBalance
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(dataForExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Item Ledger");
        XLSX.writeFile(workbook, `ItemLedger_${filters.itemId}.xlsx`);
    };

    return (
        <>
            <PageHeader title="كارت حركة الصنف" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                <Card className="no-print">
                    <CardHeader><CardTitle>فلاتر البحث</CardTitle></CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-2"><Label>الصنف</Label><Combobox options={itemOptions} value={filters.itemId} onValueChange={(v) => handleFilterChange("itemId", v)} placeholder="اختر صنفًا..." emptyMessage="لم يتم العثور على الصنف." /></div>
                            <div className="space-y-2">
                                <Label>المخزن</Label>
                                <Combobox 
                                    options={warehouseOptions} 
                                    value={filters.warehouseId} 
                                    onValueChange={(v) => handleFilterChange("warehouseId", v)} 
                                    placeholder="اختر مخزنًا..." 
                                    emptyMessage="لم يتم العثور على مخزن."
                                    disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}
                                />
                            </div>
                            <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" value={filters.fromDate} onChange={(e) => handleFilterChange("fromDate", e.target.value)} /></div>
                            <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" value={filters.toDate} onChange={(e) => handleFilterChange("toDate", e.target.value)} /></div>
                        </div>
                    </CardContent>
                </Card>

                {loading && !reportData && (
                     <div className="flex justify-center items-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                )}


                {reportData && (
                    <Card className="printable-area">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>كارت حركة: {items.find((i:any) => i.id === filters.itemId)?.name}</CardTitle>
                                <CardDescription>المخزن: {warehouses.find((w:any) => w.id === filters.warehouseId)?.name} | الفترة: من {filters.fromDate || 'البداية'} إلى {filters.toDate || 'النهاية'}</CardDescription>
                            </div>
                             <div className="flex items-center gap-2 no-print">
                                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                                    <Download className="ml-2 h-4 w-4" />
                                    تصدير Excel
                                </Button>
                                <Button variant="outline" size="icon" onClick={handlePrint}>
                                    <Printer className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="w-full overflow-auto border rounded-lg">
                                <Table>
                                    <TableHeader><TableRow><TableHead>التاريخ والوقت</TableHead><TableHead>البيان</TableHead><TableHead>المرجع</TableHead><TableHead>الباتش</TableHead><TableHead className="text-center">التكلفة</TableHead><TableHead className="text-center">وارد</TableHead><TableHead className="text-center">صادر</TableHead><TableHead className="text-center">الرصيد</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        <TableRow className="bg-muted/50 font-medium"><TableCell colSpan={7}>رصيد أول الفترة</TableCell><TableCell className="text-center">{openingBalance.toLocaleString()}</TableCell></TableRow>
                                        {reportData.map((tx, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{new Date(tx.date).toLocaleString('ar-EG')}</TableCell>
                                                <TableCell>
                                                     <Link href={getLinkForReceipt(tx.ref) || '#'} className="hover:underline hover:text-primary">
                                                        {tx.type}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>{tx.ref}</TableCell>
                                                <TableCell>{tx.batchNumber || '-'}</TableCell>
                                                <TableCell className="text-center">{tx.cost ? tx.cost.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</TableCell>
                                                <TableCell className="text-center text-green-600">{tx.incoming > 0 ? tx.incoming.toLocaleString() : '-'}</TableCell>
                                                <TableCell className="text-center text-destructive">{tx.outgoing > 0 ? tx.outgoing.toLocaleString() : '-'}</TableCell>
                                                <TableCell className="text-center font-semibold">{tx.balance.toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                    <TableFooter>
                                        <TableRow className="bg-muted font-bold text-base"><TableCell colSpan={7}>الرصيد النهائي</TableCell><TableCell className="text-center">{reportData.at(-1)?.balance.toLocaleString() ?? openingBalance.toLocaleString()}</TableCell></TableRow>
                                    </TableFooter>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </main>
        </>
    );
}
    


    



    

    

    