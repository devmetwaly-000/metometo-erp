

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
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2, Printer, Eye } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InvoiceTemplate } from "@/components/invoice-template";
import { PosReceipt } from "@/components/pos-receipt";
import { createRoot } from "react-dom/client";
import { Label } from "@/components/ui/label";

interface Customer {
  id: string;
  name: string;
  phone?: string;
}
interface Sale {
  id: string;
  invoiceNumber: string;
  date: string;
  total: number;
  type: 'Invoice' | 'POS';
  items: any[];
  // Include other relevant fields for printing
  subtotal?: number;
  discount?: number;
  tax?: number;
  paidAmount?: number;
  change?: number;
  cashierName?: string;
  warehouseId?: string;
  customerId?: string;
  customerName?: string;
}

const SaleItemsDialog = ({ items }: { items: any[] }) => (
    <DialogContent>
        <DialogHeader>
            <DialogTitle>تفاصيل أصناف الفاتورة</DialogTitle>
        </DialogHeader>
        <Table>
            <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead>الباركود</TableHead><TableHead className="text-center">الكمية</TableHead><TableHead className="text-center">السعر</TableHead><TableHead className="text-center">الإجمالي</TableHead></TableRow></TableHeader>
            <TableBody>
                {items && items.map((item, idx) => (
                    <TableRow key={idx}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="font-mono">{item.code || 'N/A'}</TableCell>
                        <TableCell className="text-center">{item.qty}</TableCell>
                        <TableCell className="text-center">{item.price?.toLocaleString() || '-'}</TableCell>
                        <TableCell className="text-center">{item.total?.toLocaleString() || '-'}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </DialogContent>
)


export default function CustomerPurchasesReport() {
    const { customers, salesInvoices, posSales, settings, warehouses, loading } = useData();
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
    const printFrameRef = React.useRef<HTMLIFrameElement>(null);
  
    const customerOptions = useMemo(() => {
        return customers.map((c: Customer) => ({
            value: c.id,
            label: `${c.name} (${c.phone || 'لا يوجد هاتف'})`
        }))
    }, [customers]);

    const reportData: Sale[] = useMemo(() => {
        if (!selectedCustomerId || loading) return [];

        const customerSalesInvoices = salesInvoices.filter((inv: any) => inv.customerId === selectedCustomerId && inv.status === 'approved');
        const customerPosSales = posSales.filter((sale: any) => sale.customerId === selectedCustomerId);

        const combinedSales = [
            ...customerSalesInvoices.map((inv: any) => ({ ...inv, type: 'Invoice' })),
            ...customerPosSales.map((sale: any) => ({ ...sale, type: 'POS' })),
        ];

        return combinedSales.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    }, [selectedCustomerId, salesInvoices, posSales, loading]);
    
    const companySettings = useMemo(() => settings?.main?.general || {}, [settings]);
    const receiptDesign = useMemo(() => settings?.main?.posReceipt || {}, [settings]);

    const handlePrint = (sale: Sale) => {
        if (printFrameRef.current) {
            const printDocument = printFrameRef.current.contentWindow?.document;
            if (printDocument) {
                const customer = customers.find((c: any) => c.id === sale.customerId);
                const warehouse = warehouses.find((w: any) => w.id === sale.warehouseId);
                const root = createRoot(printDocument.body);
                root.render(
                    <React.StrictMode>
                        {sale.type === 'Invoice' ? (
                            <InvoiceTemplate invoice={sale} company={companySettings} customer={customer} />
                        ) : (
                            <PosReceipt invoice={sale} company={companySettings} design={receiptDesign} warehouse={warehouse} customer={customer}/>
                        )}
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


  return (
    <>
      <PageHeader title="تقرير مشتريات العميل" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>تحديد العميل</CardTitle>
             <CardDescription>ابحث بالاسم أو رقم الهاتف لعرض جميع فواتيره.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-md space-y-2">
                <Label htmlFor="customer-search">العميل</Label>
                <Combobox
                    options={customerOptions}
                    value={selectedCustomerId}
                    onValueChange={setSelectedCustomerId}
                    placeholder="ابحث عن عميل..."
                    emptyMessage="لم يتم العثور على عميل."
                />
            </div>
          </CardContent>
        </Card>

        {selectedCustomerId && (
        <Card>
          <CardHeader>
            <CardTitle>قائمة الفواتير</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                 <Dialog>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>رقم الفاتورة</TableHead>
                          <TableHead>التاريخ</TableHead>
                          <TableHead>النوع</TableHead>
                          <TableHead className="text-center">الإجمالي</TableHead>
                          <TableHead className="text-center">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.length > 0 ? reportData.map((sale) => (
                            <TableRow key={sale.id}>
                                <TableCell className="font-mono">{sale.invoiceNumber}</TableCell>
                                <TableCell>{new Date(sale.date).toLocaleString('ar-EG')}</TableCell>
                                <TableCell>{sale.type === 'POS' ? 'نقاط بيع' : 'فاتورة عادية'}</TableCell>
                                <TableCell className="text-center font-semibold">{sale.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-center flex items-center justify-center gap-1">
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                                    </DialogTrigger>
                                    <Button variant="ghost" size="icon" onClick={() => handlePrint(sale)}><Printer className="h-4 w-4" /></Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد فواتير لهذا العميل.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    <SaleItemsDialog items={reportData.find(s => s.id === reportData[0]?.id)?.items || []} />
                </Dialog>
              </div>
            )}
          </CardContent>
        </Card>
        )}
      </main>
      <iframe ref={printFrameRef} style={{ display: 'none' }} title="Print Frame"></iframe>
    </>
  );
}
