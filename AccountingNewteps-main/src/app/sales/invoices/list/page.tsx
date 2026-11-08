
"use client";

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
} from "@/components/ui/table";
import { PlusCircle, Loader2, MoreHorizontal, FileText, Undo2, Printer, FileSearch, Eye, Edit, CheckCircle, MessageCircle, Image as ImageIcon, Search, Truck } from "lucide-react";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/data-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { InvoiceTemplate } from '@/components/invoice-template';
import { PosReceipt } from '@/components/pos-receipt';
import { Combobox } from '@/components/ui/combobox';
import { toPng } from 'html-to-image';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { renderToString } from 'react-dom/server';

interface SaleInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  warehouseId: string;
  total: number;
  paidAmount?: number;
  items: any[];
  isDelivery?: boolean;
  deliveryPersonName?: string;
  subtotal: number;
  discount: number;
  tax?: number;
  isLocked?: boolean;
}

const InvoiceItemsTable = ({ items }: { items: any[] }) => (
    <div className="max-h-96 overflow-y-auto mt-4">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>الصنف</TableHead>
                    <TableHead>الباركود</TableHead>
                    <TableHead className="text-center">الكمية</TableHead>
                    <TableHead className="text-center">سعر الشراء</TableHead>
                    <TableHead className="text-center">الإجمالي</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {items && items.map((item, idx) => (
                    <TableRow key={idx}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="font-mono text-xs">{item.code || 'N/A'}</TableCell>
                        <TableCell className="text-center font-bold">{item.qty}</TableCell>
                        <TableCell className="text-center">{item.price?.toLocaleString() || '-'}</TableCell>
                        <TableCell className="text-center font-semibold">{item.total?.toLocaleString() || '-'}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
)

export default function SalesInvoicesListPage() {
  const { salesInvoices: invoices, customers, warehouses, inventoryClosings, customerPayments, salesReturns, posSales, posReturns, settings, loading } = useData();
  const router = useRouter();
  const shareRef = useRef<HTMLDivElement>(null);
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const { toast } = useToast();
  
  const [filters, setFilters] = useState({
    customerId: "all",
    warehouseId: "all",
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
  });

  const [printModal, setPrintModal] = useState<{ open: boolean, type: 'A4' | 'Thermal', invoice: SaleInvoice | null }>({
    open: false,
    type: 'A4',
    invoice: null
  });

  const [itemsModal, setItemsModal] = useState<{ open: boolean, items: any[] }>({
    open: false,
    items: []
  });

  const [isSharing, setIsSharing] = useState(false);
  const [sharingData, setSharingData] = useState<{ invoice: SaleInvoice, type: 'A4' | 'Thermal' } | null>(null);

  // Aggressive Cleanup for Pointer Events and Scroll
  useEffect(() => {
    const cleanup = () => {
        if (!printModal.open && !isSharing && !itemsModal.open) {
            if (typeof document !== 'undefined') {
                document.body.style.pointerEvents = 'auto';
                document.body.style.overflow = 'auto';
            }
        }
    };
    cleanup();
    const timer = setTimeout(cleanup, 500);
    return () => clearTimeout(timer);
  }, [printModal.open, isSharing, itemsModal.open]);

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  const lastClosingDates = useMemo(() => {
    const dates = new Map<string, Date>();
    warehouses.forEach((wh: any) => {
        const closings = inventoryClosings.filter((c: any) => c.warehouseId === wh.id);
        if (closings.length > 0) {
            const lastDate = new Date(Math.max(...closings.map((c: any) => new Date(c.closingDate).getTime())));
            dates.set(wh.id, lastDate);
        }
    });
    return dates;
  }, [warehouses, inventoryClosings]);
  
  const customerOptions = useMemo(() => ([{value: 'all', label: 'كل العملاء'}, ...customers.map((c:any) => ({ value: c.id, label: c.name }))]), [customers]);
  const warehouseOptions = useMemo(() => ([{value: 'all', label: 'كل الفروع'}, ...warehouses.map((w:any) => ({ value: w.id, label: w.name }))]), [warehouses]);

  const calculateCustomerBalance = (customerId: string) => {
    const customer = customers.find((c: any) => c.id === customerId);
    if (!customer) return 0;

    let balance = Number(customer.openingBalance) || 0;
    
    invoices.filter((inv: any) => inv.customerId === customerId && inv.status === 'approved')
        .forEach((inv: any) => {
            balance += (Number(inv.total) - Number(inv.paidAmount || 0));
        });

    posSales.filter((sale: any) => sale.customerId === customerId)
        .forEach((sale: any) => {
            balance += (Number(sale.total) - Number(sale.paidAmount || 0));
        });

    customerPayments.filter((p: any) => p.customerId === customerId && !p.invoiceId)
        .forEach((p: any) => {
            balance -= Number(p.amount);
        });

    salesReturns.filter((r: any) => r.customerId === customerId)
        .forEach((r: any) => {
            // Net impact: reduce debt by total, but increase by cash given back
            balance -= (Number(r.total) - Number(r.paidAmount || 0));
        });
    
    posReturns.filter((r: any) => r.customerId === customerId)
        .forEach((r: any) => {
            balance -= (Number(r.total) - Number(r.paidAmount || 0));
        });

    return balance;
  };

  const filteredInvoices = useMemo(() => {
    return invoices
      .map((invoice: any) => {
        const lastClosingDate = lastClosingDates.get(invoice.warehouseId);
        const isLocked = lastClosingDate && new Date(invoice.date) <= lastClosingDate;
        return { ...invoice, isLocked };
      })
      .filter((invoice: any) => {
        const invoiceDate = new Date(invoice.date);
        const from = filters.fromDate ? new Date(filters.fromDate) : null;
        const to = filters.toDate ? new Date(filters.toDate) : null;

        if (from) from.setHours(0,0,0,0);
        if (to) to.setHours(23,59,59,999);

        if (from && invoiceDate < from) return false;
        if (to && invoiceDate > to) return false;
        if (filters.customerId && filters.customerId !== 'all' && invoice.customerId !== filters.customerId) return false;
        if (filters.warehouseId && filters.warehouseId !== 'all' && invoice.warehouseId !== filters.warehouseId) return false;
        
        return true;
      }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices, filters, lastClosingDates]);

  const companySettings = useMemo(() => settings?.main?.general || {}, [settings]);
  const posReceiptDesign = useMemo(() => settings?.main?.posReceipts?.defaultReceiptDesign || {}, [settings]);

  const handlePrint = () => {
    if (!printModal.invoice || !printFrameRef.current) return;

    const invoice = printModal.invoice;
    const customer = customers.find(c => c.id === invoice.customerId);
    const warehouse = warehouses.find(w => w.id === invoice.warehouseId);
    const balance = calculateCustomerBalance(invoice.customerId);

    const printElement = printModal.type === 'A4' ? (
        <InvoiceTemplate 
            invoice={invoice} 
            company={companySettings} 
            customer={customer} 
            customerBalance={balance}
        />
    ) : (
        <PosReceipt 
            invoice={invoice} 
            company={companySettings} 
            design={posReceiptDesign}
            warehouse={warehouse}
            customer={customer}
            customerBalance={balance}
        />
    );

    const htmlContent = renderToString(printElement);
    const printDoc = printFrameRef.current.contentWindow?.document;

    if (printDoc) {
        printDoc.open();
        printDoc.write(`
            <html>
                <head>
                    <title>Invoice ${invoice.invoiceNumber}</title>
                    <style>
                        body { margin: 0; padding: 0; direction: rtl; }
                        @media print {
                            @page { margin: 0; size: auto; }
                            body { margin: 0; }
                        }
                    </style>
                </head>
                <body>
                    ${htmlContent}
                    <script>
                        window.onload = function() {
                            window.focus();
                            window.print();
                        };
                    </script>
                </body>
            </html>
        `);
        printDoc.close();
    }
  };

  const handleShareAsImage = async (invoice: SaleInvoice, type: 'A4' | 'Thermal') => {
    setSharingData({ invoice, type });
    setIsSharing(true);

    await new Promise(resolve => setTimeout(resolve, 500));

    if (!shareRef.current) {
        setIsSharing(false);
        setSharingData(null);
        return;
    }

    try {
        const dataUrl = await toPng(shareRef.current, { 
            cacheBust: true, 
            quality: 0.95,
            pixelRatio: 2,
            backgroundColor: '#ffffff',
            imagePlaceholder: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        });
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `${invoice.invoiceNumber}.png`, { type: blob.type });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: `فاتورة ${invoice.invoiceNumber}`,
                text: `فاتورة مبيعات من ${companySettings.companyName}`,
            });
        } else {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `${invoice.invoiceNumber}.png`;
            link.click();
            toast({ title: 'تم التحميل', description: 'تم تحميل صورة الفاتورة لعدم دعم المشاركة المباشرة.' });
        }
    } catch (err) {
        console.error('Sharing failed', err);
        toast({ variant: 'destructive', title: 'فشلت المشاركة', description: 'حدث خطأ أثناء معالجة الصورة.' });
    } finally {
        setIsSharing(false);
        setSharingData(null);
    }
  };

  return (
    <>
      <PageHeader title="سجل فواتير البيع">
        <Button size="sm" className="gap-1 no-print" onClick={() => router.push('/sales/invoices')}>
          <PlusCircle className="h-4 w-4" />
          إضافة فاتورة جديدة
        </Button>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-2 md:p-6 printable-area">
        <Card className="no-print">
            <CardHeader className="p-4"><CardTitle className="text-lg flex items-center gap-2"><Search className="h-4 w-4"/> فلاتر البحث</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                        <Label className="text-xs">العميل</Label>
                        <Combobox options={customerOptions} value={filters.customerId} onValueChange={(v) => handleFilterChange("customerId", v)} placeholder="كل العملاء" emptyMessage="لا يوجد عملاء."/>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs">الفرع</Label>
                        <Combobox options={warehouseOptions} value={filters.warehouseId} onValueChange={(v) => handleFilterChange("warehouseId", v)} placeholder="كل الفروع" emptyMessage="لا توجد فروع."/>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs">من تاريخ</Label>
                        <Input type="date" value={filters.fromDate} onChange={(e) => handleFilterChange("fromDate", e.target.value)} className="h-9"/>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs">إلى تاريخ</Label>
                        <Input type="date" value={filters.toDate} onChange={(e) => handleFilterChange("toDate", e.target.value)} className="h-9" />
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-xl">قائمة فواتير المبيعات</CardTitle>
            <CardDescription>عرض وتتتبع فواتير المبيعات مع خيارات الطباعة والمشاركة.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 md:p-6 md:pt-0">
            {loading || isSharing ? (
              <div className="flex flex-col justify-center items-center py-10 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                {isSharing && <p className="text-sm font-semibold animate-pulse text-primary">جاري معالجة صورة الفاتورة...</p>}
              </div>
            ) : (
              <div className="w-full overflow-x-auto border-t md:border border-muted-foreground/10 md:rounded-lg">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>رقم الفاتورة</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>النوع</TableHead>
                      <TableHead className="text-center">الإجمالي</TableHead>
                      <TableHead className="text-center">المدفوع</TableHead>
                      <TableHead className="text-center">المتبقي</TableHead>
                      <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.length > 0 ? (
                      filteredInvoices.map((invoice:any) => {
                        const paid = invoice.paidAmount || 0;
                        const remaining = invoice.total - paid;
                        return (
                            <TableRow key={invoice.id} className={cn(invoice.isLocked ? 'bg-muted/30 opacity-80' : '', "hover:bg-muted/20")}>
                            <TableCell className="font-mono font-bold">{invoice.invoiceNumber}</TableCell>
                            <TableCell className="font-medium">{invoice.customerName}</TableCell>
                            <TableCell className="text-xs">{new Date(invoice.date).toLocaleDateString('ar-EG')}</TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    {invoice.isDelivery ? (
                                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50/50"><Truck className="h-3 w-3 ml-1"/> دليفري</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-muted-foreground"><FileText className="h-3 w-3 ml-1"/> {invoice.items?.length || 0} صنف</Badge>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="text-center font-bold">{invoice.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-center text-green-600">{paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className={cn("text-center font-bold", remaining > 0.01 ? 'text-destructive' : 'text-muted-foreground')}>
                                {remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-center">
                                <DropdownMenu modal={false}>
                                    <DropdownMenuTrigger asChild>
                                        <Button aria-haspopup="true" size="icon" variant="ghost" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                        <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                        <DropdownMenuItem onClick={() => { 
                                            setTimeout(() => setItemsModal({ open: true, items: invoice.items }), 150);
                                        }}>
                                            <Eye className="ml-2 h-4 w-4 text-blue-500" />
                                            عرض الأصناف
                                        </DropdownMenuItem>
                                        
                                        <DropdownMenuItem onClick={() => {
                                            setTimeout(() => setPrintModal({ open: true, type: 'A4', invoice }), 150);
                                        }}>
                                            <Printer className="ml-2 h-4 w-4" /> طباعة A4
                                        </DropdownMenuItem>
                                        
                                        <DropdownMenuItem onClick={() => {
                                            setTimeout(() => setPrintModal({ open: true, type: 'Thermal', invoice }), 150);
                                        }}>
                                            <Printer className="ml-2 h-4 w-4" /> طباعة إيصال (حراري)
                                        </DropdownMenuItem>

                                        <DropdownMenuSeparator />
                                        
                                        <DropdownMenuItem onClick={() => handleShareAsImage(invoice, 'A4')} className="text-primary font-semibold">
                                            <ImageIcon className="ml-2 h-4 w-4" /> مشاركة كصورة (A4)
                                        </DropdownMenuItem>
                                        
                                        <DropdownMenuItem onClick={() => handleShareAsImage(invoice, 'Thermal')} className="text-green-600 font-semibold">
                                            <ImageIcon className="ml-2 h-4 w-4" /> مشاركة كصورة (إيصال)
                                        </DropdownMenuItem>

                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => router.push(`/sales/returns/new?invoiceId=${invoice.id}`)} disabled={invoice.isLocked}>
                                            <Undo2 className="ml-2 h-4 w-4 text-amber-600" />
                                            إجراء مرتجع
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                            </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-20 text-muted-foreground italic">
                          لا توجد فواتير تطابق معايير البحث الحالية.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={itemsModal.open} onOpenChange={(open) => setItemsModal({ ...itemsModal, open })}>
        <DialogContent className="max-w-3xl">
            <DialogHeader>
                <DialogTitle>تفاصيل أصناف الفاتورة</DialogTitle>
            </DialogHeader>
            <div className="w-full overflow-x-auto border-t">
                <Table className="min-w-[500px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>الصنف</TableHead>
                            <TableHead className="text-center">الكمية</TableHead>
                            <TableHead className="text-center">السعر</TableHead>
                            <TableHead className="text-center">الإجمالي</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {itemsModal.items.map((item, idx) => (
                            <TableRow key={idx}>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell className="text-center font-bold">{item.qty}</TableCell>
                                <TableCell className="text-center">{item.price?.toLocaleString() || '-'}</TableCell>
                                <TableCell className="text-center font-semibold">{item.total?.toLocaleString() || '-'}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </DialogContent>
      </Dialog>

      <Dialog open={printModal.open} onOpenChange={(open) => setPrintModal({ ...printModal, open })}>
        <DialogContent className={cn("p-0 overflow-hidden flex flex-col max-h-[90vh]", printModal.type === 'A4' ? "max-w-4xl" : "max-w-sm")}>
            <DialogHeader className="p-4 shrink-0 bg-muted/30">
                <DialogTitle>طباعة الفاتورة {printModal.invoice?.invoiceNumber}</DialogTitle>
                <DialogDescription>معاينة الفاتورة قبل الطباعة.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full w-full bg-muted/20">
                    <div className="p-4 flex justify-center">
                        <div className="bg-white shadow-2xl overflow-x-auto max-w-full rounded-sm border">
                            {printModal.invoice && (
                                printModal.type === 'A4' ? (
                                    <InvoiceTemplate 
                                        invoice={printModal.invoice} 
                                        company={companySettings} 
                                        customer={customers.find(c => c.id === printModal.invoice!.customerId)} 
                                        customerBalance={calculateCustomerBalance(printModal.invoice!.customerId)}
                                    />
                                ) : (
                                    <PosReceipt 
                                        invoice={printModal.invoice} 
                                        company={companySettings} 
                                        design={posReceiptDesign}
                                        warehouse={warehouses.find(w => w.id === printModal.invoice!.warehouseId)}
                                        customer={customers.find(c => c.id === printModal.invoice!.customerId)}
                                        customerBalance={calculateCustomerBalance(printModal.invoice!.customerId)}
                                    />
                                )
                            )}
                        </div>
                    </div>
                    <ScrollBar orientation="horizontal" />
                    <ScrollBar orientation="vertical" />
                </ScrollArea>
            </div>
            <DialogFooter className="p-4 border-t bg-background shrink-0 flex gap-2 sm:justify-end no-print">
                <Button variant="ghost" onClick={() => setPrintModal({ ...printModal, open: false })}>إغلاق</Button>
                <Button onClick={handlePrint} className="gap-2"><Printer className="h-4 w-4" />طباعة المستند</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <iframe ref={printFrameRef} style={{ position: 'fixed', width: 0, height: 0, border: 'none', pointerEvents: 'none' }} title="Print Frame"></iframe>

      <div style={{ position: 'fixed', top: '200vh', left: 0, zIndex: -100 }}>
          <div ref={shareRef} className="bg-white">
              {sharingData && (
                  sharingData.type === 'A4' ? (
                      <InvoiceTemplate 
                          invoice={sharingData.invoice} 
                          company={companySettings} 
                          customer={customers.find(c => c.id === sharingData.invoice.customerId)} 
                          customerBalance={calculateCustomerBalance(sharingData.invoice.customerId)}
                      />
                  ) : (
                      <div className="p-4">
                          <PosReceipt 
                              invoice={sharingData.invoice} 
                              company={companySettings} 
                              design={posReceiptDesign}
                              warehouse={warehouses.find(w => w.id === sharingData.invoice.warehouseId)}
                              customer={customers.find(c => c.id === sharingData.invoice.customerId)}
                              customerBalance={calculateCustomerBalance(sharingData.invoice.customerId)}
                          />
                      </div>
                  )
              )}
          </div>
      </div>
    </>
  );
}
