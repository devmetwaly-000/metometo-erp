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
  TableFooter,
} from "@/components/ui/table";
import { PlusCircle, Loader2, MoreHorizontal, FileText, Search, Eye, Printer, MessageCircle, Image as ImageIcon } from "lucide-react";
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
import { toPng } from 'html-to-image';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { useAuth } from '@/contexts/auth-context';

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

export default function SalesReturnsListPage() {
  const { salesReturns: returns, posReturns, customers, warehouses, salesInvoices, posSales, customerPayments, settings, loading } = useData();
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const shareRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState({
    customerId: "all",
    warehouseId: "all",
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
  });

  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [isItemsOpen, setIsItemsOpen] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Manual cleanup for body locking issues
  useEffect(() => {
    const cleanup = () => {
        if (!isItemsOpen && !isPrintOpen && !isSharing) {
            document.body.style.pointerEvents = 'auto';
            document.body.style.overflow = 'auto';
        }
    };
    cleanup();
    const timer = setTimeout(cleanup, 500);
    return () => clearTimeout(timer);
  }, [isItemsOpen, isPrintOpen, isSharing]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const allReturns = useMemo(() => {
      const sales = (returns || []).map((r: any) => ({ ...r, source: 'Sales' }));
      const pos = (posReturns || []).map((r: any) => ({ ...r, source: 'POS' }));
      return [...sales, ...pos];
  }, [returns, posReturns]);

  const filteredReturns = useMemo(() => {
    return allReturns.filter((ret: any) => {
      const retDate = new Date(ret.date);
      const from = filters.fromDate ? new Date(filters.fromDate) : null;
      const to = filters.toDate ? new Date(filters.toDate) : null;

      if (from) from.setHours(0,0,0,0);
      if (to) to.setHours(23,59,59,999);

      if (from && retDate < from) return false;
      if (to && retDate > to) return false;
      if (filters.customerId !== 'all' && ret.customerId !== filters.customerId) return false;
      if (filters.warehouseId !== 'all' && ret.warehouseId !== filters.warehouseId) return false;
      
      return true;
    }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allReturns, filters]);

  const grandTotal = useMemo(() => {
      return filteredReturns.reduce((sum, r) => sum + (r.total || 0), 0);
  }, [filteredReturns]);

  const getCustomerName = (customerId: string) => {
    return customers.find((c: any) => c.id === customerId)?.name || 'غير معروف';
  }

  const getWarehouseName = (warehouseId: string) => {
    return warehouses.find((w: any) => w.id === warehouseId)?.name || 'غير معروف';
  }

  const calculateCustomerBalance = (cId: string) => {
    const customer = customers.find((c: any) => c.id === cId);
    if (!customer) return 0;

    let balance = Number(customer.openingBalance) || 0;
    
    salesInvoices.filter((inv: any) => inv.customerId === cId && inv.status === 'approved')
        .forEach((inv: any) => balance += (Number(inv.total) - Number(inv.paidAmount || 0)));

    posSales.filter((sale: any) => sale.customerId === cId)
        .forEach((sale: any) => balance += (Number(sale.total) - Number(sale.paidAmount || 0)));

    customerPayments.filter((p: any) => p.customerId === cId && !p.invoiceId)
        .forEach((p: any) => balance -= Number(p.amount));

    returns.filter((r: any) => r.customerId === cId)
        .forEach((r: any) => balance -= (Number(r.total) - Number(r.paidAmount || 0)));
    
    posReturns.filter((r: any) => r.customerId === cId)
        .forEach((r: any) => balance -= (Number(r.total) - Number(r.paidAmount || 0)));

    return balance;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShareAsImage = async (ret: any) => {
    setSelectedReturn(ret);
    setIsSharing(true);

    await new Promise(resolve => setTimeout(resolve, 500));

    if (!shareRef.current) {
        setIsSharing(false);
        return;
    }

    try {
        const dataUrl = await toPng(shareRef.current, { 
            cacheBust: true, 
            quality: 0.95,
            pixelRatio: 2,
            backgroundColor: '#ffffff'
        });
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `${ret.receiptNumber || 'return'}.png`, { type: blob.type });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: `مرتجع ${ret.receiptNumber}`,
                text: `إشعار دائن من ${settings?.main?.general?.companyName || 'المتجر'}`,
            });
        } else {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `${ret.receiptNumber || 'return'}.png`;
            link.click();
            toast({ title: 'تم التحميل', description: 'تم تحميل صورة المرتجع لعدم دعم المشاركة المباشرة.' });
        }
    } catch (err) {
        console.error('Sharing failed', err);
        toast({ variant: 'destructive', title: 'فشلت المشاركة', description: 'حدث خطأ أثناء معالجة الصورة.' });
    } finally {
        setIsSharing(false);
        setSelectedReturn(null);
    }
  };

  const customerOptions = useMemo(() => ([{value: 'all', label: 'كل العملاء'}, ...customers.map((c:any) => ({ value: c.id, label: c.name }))]), [customers]);
  const warehouseOptions = useMemo(() => ([{value: 'all', label: 'كل الفروع'}, ...warehouses.map((w:any) => ({ value: w.id, label: w.name }))]), [warehouses]);

  return (
    <>
      <PageHeader title="سجل مرتجعات المبيعات">
        <Button size="sm" className="gap-1" onClick={() => router.push('/sales/returns/new')}>
          <PlusCircle className="h-4 w-4" />
          إضافة مرتجع جديد
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
            <CardTitle className="text-xl">قائمة المرتجعات المسجلة</CardTitle>
            <CardDescription>
              عرض وتتبع جميع عمليات إرجاع البضاعة من العملاء.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 md:p-6 md:pt-0">
            {loading || isSharing ? (
              <div className="flex flex-col justify-center items-center py-10 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                {isSharing && <p className="text-sm font-semibold animate-pulse text-primary">جاري معالجة صورة المرتجع...</p>}
              </div>
            ) : (
              <div className="w-full overflow-x-auto border-t md:border border-muted-foreground/10 md:rounded-lg">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>رقم المرتجع</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead>الفرع</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>المصدر</TableHead>
                      <TableHead className="text-center">إجمالي القيمة</TableHead>
                      <TableHead className="text-center w-[100px] no-print">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReturns.length > 0 ? (
                      filteredReturns.map((sreturn: any) => (
                        <TableRow key={sreturn.id} className="hover:bg-muted/20">
                          <TableCell className="font-mono font-bold text-destructive">{sreturn.receiptNumber || sreturn.id.slice(-6).toUpperCase()}</TableCell>
                          <TableCell className="font-medium">{getCustomerName(sreturn.customerId)}</TableCell>
                          <TableCell className="text-xs">{getWarehouseName(sreturn.warehouseId)}</TableCell>
                          <TableCell className="text-xs">{new Date(sreturn.date).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell>
                             <Badge variant="outline">{sreturn.source === 'POS' ? 'نقاط بيع' : 'فاتورة عادية'}</Badge>
                          </TableCell>
                          <TableCell className="text-center font-bold text-destructive">{sreturn.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-center no-print">
                             <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button aria-haspopup="true" size="icon" variant="ghost" className="h-8 w-8">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                    <DropdownMenuItem onSelect={() => {
                                        setSelectedReturn(sreturn);
                                        setTimeout(() => setIsItemsOpen(true), 150);
                                    }}>
                                        <Eye className="ml-2 h-4 w-4 text-blue-500"/> عرض الأصناف
                                    </DropdownMenuItem>
                                     <DropdownMenuItem onSelect={() => {
                                        setSelectedReturn(sreturn);
                                        setTimeout(() => setIsPrintOpen(true), 150);
                                    }}>
                                        <Printer className="ml-2 h-4 w-4"/> معاينة / طباعة
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleShareAsImage(sreturn)} className="text-green-600 font-semibold">
                                        <ImageIcon className="ml-2 h-4 w-4" /> مشاركة كصورة
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-20 text-muted-foreground italic">
                          لا توجد مرتجعات مسجلة تطابق الفلاتر.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {filteredReturns.length > 0 && (
                      <TableFooter className="bg-muted/30">
                          <TableRow className="font-bold text-lg">
                              <TableCell colSpan={5}>إجمالي المرتجعات للفترة المحددة</TableCell>
                              <TableCell className="text-center text-destructive">{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</TableCell>
                              <TableCell className="no-print"></TableCell>
                          </TableRow>
                      </TableFooter>
                  )}
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Items Details Dialog */}
      <Dialog open={isItemsOpen} onOpenChange={setIsItemsOpen}>
        <DialogContent className="max-w-3xl">
            <DialogHeader>
                <DialogTitle>أصناف المرتجع رقم {selectedReturn?.receiptNumber}</DialogTitle>
            </DialogHeader>
            <div className="w-full overflow-x-auto border rounded-lg mt-4">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead>الصنف</TableHead>
                            <TableHead className="text-center">الكمية</TableHead>
                            <TableHead className="text-center">سعر الوحدة</TableHead>
                            <TableHead className="text-center">الإجمالي</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {selectedReturn?.items?.map((item: any, idx: number) => (
                            <TableRow key={idx}>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell className="text-center font-bold">{item.qty}</TableCell>
                                <TableCell className="text-center">{item.price?.toLocaleString()}</TableCell>
                                <TableCell className="text-center font-semibold">{item.total?.toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </DialogContent>
      </Dialog>

      {/* Print Preview Dialog */}
      <Dialog open={isPrintOpen} onOpenChange={setIsPrintOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <DialogHeader className="p-4 shrink-0 bg-muted/30">
                <DialogTitle>طباعة إشعار مرتجع {selectedReturn?.receiptNumber}</DialogTitle>
                <DialogDescription>معاينة مستند المرتجع قبل الطباعة.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 bg-white">
                <div className="printable-area bg-white text-black p-4 flex justify-center">
                    {selectedReturn && (
                        <InvoiceTemplate 
                            invoice={selectedReturn} 
                            company={settings?.main?.general || {}} 
                            customer={customers.find(c => c.id === selectedReturn.customerId)} 
                            isReturn={true}
                            customerBalance={calculateCustomerBalance(selectedReturn.customerId)}
                        />
                    )}
                </div>
            </ScrollArea>
            <DialogFooter className="p-4 border-t bg-muted/10 shrink-0 flex gap-2 sm:justify-end no-print">
                <Button variant="ghost" onClick={() => setIsPrintOpen(false)}>إغلاق</Button>
                <Button onClick={handlePrint} className="gap-2"><Printer className="h-4 w-4" />طباعة المستند</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden div for generating share image */}
      <div style={{ position: 'fixed', top: '200vh', left: 0, zIndex: -100 }}>
          <div ref={shareRef} className="bg-white">
              {selectedReturn && isSharing && (
                  <InvoiceTemplate 
                      invoice={selectedReturn} 
                      company={settings?.main?.general || {}} 
                      customer={customers.find(c => c.id === selectedReturn.customerId)} 
                      isReturn={true}
                      customerBalance={calculateCustomerBalance(selectedReturn.customerId)}
                  />
              )}
          </div>
      </div>
    </>
  );
}
