
"use client";

import React, { useState, useMemo, useEffect } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2, Printer, FileText, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PosReceipt } from "@/components/pos-receipt";
import { createRoot } from "react-dom/client";


interface PosSale {
  id: string;
  invoiceNumber: string;
  date: string;
  cashierId: string;
  cashierName: string;
  customerId?: string;
  warehouseId?: string;
  items: { id: string; name: string; qty: number; price: number; cost: number; total: number; code?: string; }[];
  total: number;
  discount: number;
  subtotal: number;
  taxAmount?: number;
  taxRate?: number;
  applyTax?: boolean;
  isTaxIncluded?: boolean;
  etaSettings?: any;
  paidAmount?: number;
}
interface User {
  id: string;
  name: string;
  isCashier?: boolean;
}
interface PosTerminal {
    id: string;
    name: string;
}

export default function PosSalesReportPage() {
  const { posSales, users, posTerminals, settings, loading, customers, warehouses } = useData();
  const printFrameRef = React.useRef<HTMLIFrameElement>(null);

  const [filters, setFilters] = useState({
    cashierId: "all",
    terminalId: "all",
    fromDate: "",
    toDate: "",
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const reportData: PosSale[] = useMemo(() => {
    if (loading) return [];

    return posSales.filter((sale: any) => {
        const saleDate = new Date(sale.date);
        const from = filters.fromDate ? new Date(filters.fromDate) : null;
        const to = filters.toDate ? new Date(filters.toDate) : null;
        if(from) from.setHours(0,0,0,0);
        if(to) to.setHours(23,59,59,999);

        if (from && saleDate < from) return false;
        if (to && saleDate > to) return false;
        if (filters.cashierId !== 'all' && sale.cashierId !== filters.cashierId) return false;
        if (filters.terminalId !== 'all' && sale.posTerminalId !== filters.terminalId) return false;
        return true;
    }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filters, posSales, loading]);

  const grandTotals = useMemo(() => {
    return reportData.reduce((acc, sale) => {
        acc.subtotal += sale.subtotal;
        acc.discount += sale.discount;
        acc.tax += (sale.taxAmount || 0);
        acc.total += sale.total;
        return acc;
    }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
  }, [reportData]);
  
  const cashierOptions = useMemo(() => {
      const salesUsers = users.filter((u: any) => u.isCashier);
      return [{value: 'all', label: 'كل الكاشيرات'}, ...salesUsers.map((u:any) => ({value: u.id, label: u.name}))]
  }, [users]);
  
  const terminalOptions = useMemo(() => [{value: 'all', label: 'كل نقاط البيع'}, ...posTerminals.map((t:any) => ({value: t.id, label: t.name}))], [posTerminals]);
  
  const companySettings = useMemo(() => settings?.main?.general || {}, [settings]);
  const receiptDesign = useMemo(() => settings?.main?.posReceipt || {}, [settings]);

  const handlePrintReceipt = (saleData: any) => {
    const customer = saleData.customerId ? customers.find((c:any) => c.id === saleData.customerId) : undefined;
    const warehouse = saleData.warehouseId ? warehouses.find((w:any) => w.id === saleData.warehouseId) : undefined;
    if (printFrameRef.current) {
        const printDocument = printFrameRef.current.contentWindow?.document;
        if (printDocument) {
            const root = createRoot(printDocument.body);
            root.render(
                <React.StrictMode>
                    <PosReceipt invoice={saleData} company={companySettings} design={receiptDesign} warehouse={warehouse} customer={customer} />
                </React.StrictMode>
            );
            
            setTimeout(() => {
                printFrameRef.current?.contentWindow?.focus();
                printFrameRef.current?.contentWindow?.print();
                root.unmount();
            }, 500); 
        }
    }
  };

  const InvoiceItemsDialog = ({ items }: { items: any[] }) => (
    <DialogContent>
        <DialogHeader><DialogTitle>تفاصيل أصناف الفاتورة</DialogTitle></DialogHeader>
        <Table>
            <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead>الباركود</TableHead><TableHead className="text-center">الكمية</TableHead><TableHead className="text-center">السعر</TableHead><TableHead className="text-center">الضريبة</TableHead><TableHead className="text-center">الإجمالي</TableHead></TableRow></TableHeader>
            <TableBody>
                {items && items.length > 0 ? items.map((item, index) => (
                    <TableRow key={index}>
                        <TableCell>{item.name || 'صنف غير معروف'}</TableCell>
                        <TableCell className="font-mono">{item.code || 'N/A'}</TableCell>
                        <TableCell className="text-center">{item.qty}</TableCell>
                        <TableCell className="text-center">{item.price?.toLocaleString() || '-'}</TableCell>
                        <TableCell className="text-center">{(item.taxAmount || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-center">{item.total?.toLocaleString() || '-'}</TableCell>
                    </TableRow>
                )) : (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground p-4">لا توجد أصناف في هذه الفاتورة.</TableCell></TableRow>
                )}
            </TableBody>
        </Table>
    </DialogContent>
  );

  return (
    <>
      <PageHeader title="تقرير فواتير نقاط البيع" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card className="no-print">
            <CardHeader><CardTitle>فلاتر البحث</CardTitle></CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} /></div>
                    <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} /></div>
                    <div className="space-y-2"><Label>الكاشير</Label><Combobox options={cashierOptions} value={filters.cashierId} onValueChange={v => handleFilterChange('cashierId', v)} placeholder="الكل" emptyMessage="لا يوجد كاشيرات." /></div>
                    <div className="space-y-2"><Label>نقطة البيع</Label><Combobox options={terminalOptions} value={filters.terminalId} onValueChange={v => handleFilterChange('terminalId', v)} placeholder="الكل" emptyMessage="لا توجد نقاط بيع." /></div>
                </div>
            </CardContent>
        </Card>

        <Card className="printable-area">
          <CardHeader>
              <CardTitle>نتائج التقرير</CardTitle>
              <CardDescription>عرض تفصيلي لجميع مبيعات نقاط البيع بناءً على الفلاتر المحددة.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
                 <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
                <div className="w-full overflow-auto border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-center">رقم الفاتورة</TableHead>
                                <TableHead className="text-center">التاريخ</TableHead>
                                <TableHead className="text-center">الكاشير</TableHead>
                                <TableHead className="text-center">الإجمالي</TableHead>
                                <TableHead className="text-center">الخصم</TableHead>
                                <TableHead className="text-center">الضريبة</TableHead>
                                <TableHead className="text-center">الصافي</TableHead>
                                <TableHead className="text-center">الإجراءات</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reportData.length > 0 ? reportData.map((sale) => (
                                <Dialog key={sale.id}>
                                    <TableRow>
                                        <TableCell className="text-center font-mono">{sale.invoiceNumber}</TableCell>
                                        <TableCell className="text-center">{new Date(sale.date).toLocaleString('ar-EG')}</TableCell>
                                        <TableCell className="text-center">{sale.cashierName}</TableCell>
                                        <TableCell className="text-center">{sale.subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                        <TableCell className="text-center text-destructive">{sale.discount > 0 ? sale.discount.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</TableCell>
                                        <TableCell className="text-center">{sale.taxAmount ? sale.taxAmount.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</TableCell>
                                        <TableCell className="text-center font-semibold">{sale.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                        <TableCell className="text-center flex items-center justify-center gap-1">
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                                            </DialogTrigger>
                                            <Button variant="ghost" size="icon" onClick={() => handlePrintReceipt(sale)}><Printer className="h-4 w-4" /></Button>
                                        </TableCell>
                                    </TableRow>
                                    <InvoiceItemsDialog items={sale.items} />
                                </Dialog>
                            )) : (
                                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">لا توجد فواتير تطابق الفلاتر.</TableCell></TableRow>
                            )}
                        </TableBody>
                        {reportData.length > 0 && (
                            <TableFooter>
                                <TableRow className="font-bold bg-muted/50 text-base">
                                    <TableCell colSpan={3}>الإجمالي</TableCell>
                                    <TableCell className="text-center">{grandTotals.subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-center text-destructive">{grandTotals.discount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-center">{grandTotals.tax.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-center">{grandTotals.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                            </TableFooter>
                        )}
                    </Table>
                </div>
            )}
          </CardContent>
        </Card>
        <iframe ref={printFrameRef} style={{ display: 'none' }} title="Print Frame"></iframe>
      </main>
    </>
  );
}
