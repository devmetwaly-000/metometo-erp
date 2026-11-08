"use client";

import React, { useState, useMemo, useRef } from 'react';
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Eye, CheckCircle, Clock, MoreHorizontal, MessageCircle, Image as ImageIcon } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toPng } from 'html-to-image';
import { InvoiceTemplate } from '@/components/invoice-template';
import { Wallet, CreditCard, ShoppingBag, MapPin } from "lucide-react";

interface SaleInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  total: number;
  paidAmount?: number;
  status: 'pending' | 'approved';
  items: any[];
  customer?: any; // Added for template
  location?: { latitude: number; longitude: number };
  customerId: string;
}

const InvoiceItemsDialog = ({ items }: { items: any[] }) => (
    <DialogContent>
        <DialogHeader>
            <DialogTitle>تفاصيل أصناف الفاتورة</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>الصنف</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-center">السعر</TableHead>
                        <TableHead className="text-center">الإجمالي</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items && items.length > 0 ? items.map((item, index) => (
                        <TableRow key={index}>
                            <TableCell>{item.name}</TableCell>
                            <TableCell className="text-center">{item.qty}</TableCell>
                            <TableCell className="text-center">{item.price?.toLocaleString() || '-'}</TableCell>
                            <TableCell className="text-center">{item.total?.toLocaleString() || '-'}</TableCell>
                        </TableRow>
                    )) : (
                         <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">لا توجد أصناف في هذه الفاتورة.</TableCell>
                         </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    </DialogContent>
);

export default function MyInvoicesPage() {
    const { user, loading: authLoading } = useAuth();
    const { salesInvoices, customers, loading: dataLoading, settings, customerPayments, salesReturns, posSales, posReturns } = useData();
    const router = useRouter();
    const invoiceRef = useRef<HTMLDivElement>(null);
    const [isLoadingShare, setIsLoadingShare] = useState(false);


    const [filters, setFilters] = useState({
        customerName: "",
        fromDate: "",
        toDate: "",
    });
     const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const openMap = (lat: number, lng: number) => {
        window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
    };

    const myInvoices = useMemo(() => {
        if (!user || !user.isSalesRep || !salesInvoices) return [];
        
        return salesInvoices
            .filter((inv: any) => inv.salesRepId === user.id)
            .filter((inv: any) => {
                const invoiceDate = new Date(inv.date);
                const from = filters.fromDate ? new Date(filters.fromDate) : null;
                const to = filters.toDate ? new Date(filters.toDate) : null;
                if(from) from.setHours(0,0,0,0);
                if(to) to.setHours(23,59,59,999);

                if (from && invoiceDate < from) return false;
                if (to && invoiceDate > to) return false;
                if (filters.customerName && !inv.customerName.toLowerCase().includes(filters.customerName.toLowerCase())) return false;
                
                return true;
            })
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
    }, [user, salesInvoices, filters]);

    const summary = useMemo(() => {
        let totalSales = 0;
        let totalCash = 0;
        let totalDebt = 0;

        myInvoices.forEach((inv: any) => {
            totalSales += inv.total;
            totalCash += (inv.paidAmount || 0);
            totalDebt += (inv.total - (inv.paidAmount || 0));
        });

        return { totalSales, totalCash, totalDebt };
    }, [myInvoices]);

    const companySettings = useMemo(() => settings?.main?.general || {}, [settings]);

    const calculateCustomerBalance = (customerId: string) => {
        const customer = customers.find((c: any) => c.id === customerId);
        if (!customer) return 0;

        let balance = Number(customer.openingBalance) || 0;
        
        salesInvoices.filter((inv: any) => inv.customerId === customerId && inv.status === 'approved')
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
                balance -= Number(r.total);
            });
        
        posReturns.filter((r: any) => r.customerId === customerId)
            .forEach((r: any) => {
                balance -= Number(r.total);
            });

        return balance;
    };

    const handleShare = async (invoice: SaleInvoice) => {
        setIsLoadingShare(true);
        setSelectedInvoice(invoice);

        // A small delay to allow React to render the hidden invoice component
        await new Promise(resolve => setTimeout(resolve, 150));
    
        if (invoiceRef.current === null) {
            console.error('Invoice ref is not available.');
            setIsLoadingShare(false);
            setSelectedInvoice(null);
            return;
        }

        try {
            const dataUrl = await toPng(invoiceRef.current, { cacheBust: true, quality: 0.95 });
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], `${invoice.invoiceNumber}.png`, { type: blob.type });

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `فاتورة ${invoice.invoiceNumber}`,
                    text: `فاتورة مبيعات من ${companySettings.companyName}`,
                });
            } else {
                 // Fallback: Download
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = `${invoice.invoiceNumber}.png`;
                link.click();
            }
        } catch (err: any) {
            console.error('Share failed:', err);
             if (err.name !== 'AbortError') {
                alert('فشلت المشاركة. قد لا يكون متصفحك مدعومًا.');
             }
        } finally {
            setIsLoadingShare(false);
            setSelectedInvoice(null);
        }
    };


    if (authLoading || dataLoading) {
        return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!user?.isSalesRep) {
        return (
            <div className="flex flex-1 justify-center items-center p-8">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>وصول غير مصرح به</CardTitle>
                        <CardDescription>هذه الصفحة متاحة للمناديب فقط.</CardDescription>
                    </CardHeader>
                    <CardFooter>
                         <Button onClick={() => router.push('/')}>العودة للرئيسية</Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }
    
    return (
        <>
            <PageHeader title="فواتيري" />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">إجمالي مبيعاتي</CardTitle>
                            <ShoppingBag className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{summary.totalSales.toLocaleString()} ج.م</div>
                            <p className="text-xs text-muted-foreground mt-1">إجمالي الفواتير المسجلة</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">إجمالي التحصيلات</CardTitle>
                            <Wallet className="h-4 w-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{summary.totalCash.toLocaleString()} ج.م</div>
                            <p className="text-xs text-green-600/70 mt-1">النقدية التي تم استلامها</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">إجمالي المديونيات</CardTitle>
                            <CreditCard className="h-4 w-4 text-amber-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{summary.totalDebt.toLocaleString()} ج.م</div>
                            <p className="text-xs text-amber-600/70 mt-1">مستحقات متبقية على العملاء</p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>فلاتر البحث</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>اسم العميل</Label>
                                <Input value={filters.customerName} onChange={e => handleFilterChange('customerName', e.target.value)} placeholder="ابحث بالاسم..." />
                            </div>
                            <div className="space-y-2">
                                <Label>من تاريخ</Label>
                                <Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>إلى تاريخ</Label>
                                <Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>سجل الفواتير</CardTitle>
                        <CardDescription>قائمة بجميع الفواتير التي قمت بإنشائها.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <div className="w-full overflow-auto border rounded-lg">
                             <Dialog>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>رقم الفاتورة</TableHead>
                                            <TableHead>العميل</TableHead>
                                            <TableHead>التاريخ</TableHead>
                                            <TableHead className="text-center">الحالة</TableHead>
                                            <TableHead className="text-center">إجمالي</TableHead>
                                            <TableHead className="text-center">المدفوع</TableHead>
                                            <TableHead className="text-center">المتبقي</TableHead>
                                            <TableHead className="text-center">الموقع</TableHead>
                                            <TableHead className="text-center">الإجراءات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {myInvoices.length > 0 ? myInvoices.map((inv: SaleInvoice) => (
                                            <TableRow key={inv.id}>
                                                <TableCell className="font-mono">{inv.invoiceNumber}</TableCell>
                                                <TableCell>{inv.customerName}</TableCell>
                                                <TableCell>{new Date(inv.date).toLocaleString('ar-EG')}</TableCell>
                                                <TableCell className="text-center">
                                                    {inv.status === 'approved' 
                                                        ? <Badge variant="default" className="bg-green-600"><CheckCircle className="ml-1 h-3 w-3"/>معتمدة</Badge>
                                                        : <Badge variant="outline" className="border-amber-500 text-amber-500"><Clock className="ml-1 h-3 w-3"/>معلقة</Badge>
                                                    }
                                                </TableCell>
                                                <TableCell className="text-center font-bold">{inv.total.toLocaleString()}</TableCell>
                                                <TableCell className="text-center text-green-600">{(inv.paidAmount || 0).toLocaleString()}</TableCell>
                                                <TableCell className="text-center text-destructive">{(inv.total - (inv.paidAmount || 0)).toLocaleString()}</TableCell>
                                                <TableCell className="text-center">
                                                    {inv.location ? (
                                                        <Button variant="outline" size="sm" onClick={() => openMap(inv.location!.latitude, inv.location!.longitude)}>
                                                            <MapPin className="ml-1 h-4 w-4 text-blue-600"/>
                                                            عرض
                                                        </Button>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground italic">غير مسجل</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button aria-haspopup="true" size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4"/></Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent>
                                                             <DialogTrigger asChild>
                                                                <DropdownMenuItem onSelect={e => { e.preventDefault(); setSelectedInvoice(inv); }}>
                                                                    <Eye className="ml-2 h-4 w-4"/> عرض الأصناف
                                                                </DropdownMenuItem>
                                                            </DialogTrigger>
                                                            <DropdownMenuItem onClick={() => handleShare(inv)} disabled={isLoadingShare && selectedInvoice?.id === inv.id}>
                                                                {isLoadingShare && selectedInvoice?.id === inv.id ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <ImageIcon className="ml-2 h-4 w-4"/>}
                                                                مشاركة كصورة
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">لا توجد فواتير لعرضها.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                                {selectedInvoice && <InvoiceItemsDialog items={selectedInvoice.items}/>}
                             </Dialog>
                         </div>
                    </CardContent>
                </Card>
            </main>
             {/* Hidden div for generating image */}
             <div style={{ position: 'fixed', top: '200vh', left: 0, zIndex: -100 }}>
                <div ref={invoiceRef} className="bg-white">
                    {selectedInvoice && (
                        <InvoiceTemplate 
                            invoice={selectedInvoice} 
                            company={companySettings} 
                            customer={customers.find((c: any) => c.id === selectedInvoice.customerId)} 
                            customerBalance={calculateCustomerBalance(selectedInvoice.customerId)}
                        />
                    )}
                </div>
            </div>
        </>
    )
}
