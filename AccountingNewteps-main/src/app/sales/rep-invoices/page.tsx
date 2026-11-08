

"use client";

import React, { useState, useMemo, useEffect } from 'react';
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
import { Loader2, MoreHorizontal, CheckCircle, Trash2, MapPin, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/contexts/permissions-context';
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useData } from '@/contexts/data-provider';
import { Package, Wallet, CreditCard } from "lucide-react";


interface SaleInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  salesRepId: string;
  total: number;
  items: any[];
  status?: 'pending' | 'approved';
  paidAmount?: number;
  paidToAccountId?: string;
  location?: { latitude: number; longitude: number };
}

interface User {
  id: string;
  name: string;
  isSalesRep?: boolean;
}

const InvoiceItemsDialog = ({ items, open, onOpenChange }: { items: any[], open: boolean, onOpenChange: (open: boolean) => void }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
        <DialogHeader>
            <DialogTitle>تفاصيل أصناف الفاتورة</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto border rounded-lg mt-4">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        <TableHead>الصنف</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-center">سعر البيع</TableHead>
                        <TableHead className="text-center">التكلفة</TableHead>
                        <TableHead className="text-center">الإجمالي</TableHead>
                        <TableHead className="text-center">الربح</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items && items.length > 0 ? items.map((item, index) => {
                        const profit = (item.price - (item.cost || 0)) * item.qty;
                        return (
                            <TableRow key={index}>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell className="text-center font-bold">{item.qty.toLocaleString()}</TableCell>
                                <TableCell className="text-center text-blue-600">{item.price?.toLocaleString() || '-'}</TableCell>
                                <TableCell className="text-center text-muted-foreground italic">{item.cost?.toLocaleString() || '-'}</TableCell>
                                <TableCell className="text-center font-bold">{item.total?.toLocaleString() || '-'}</TableCell>
                                <TableCell className="text-center text-green-600">
                                    {profit.toLocaleString()}
                                </TableCell>
                            </TableRow>
                        );
                    }) : (
                         <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-10">لا توجد أصناف في هذه الفاتورة.</TableCell>
                         </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
        <div className="flex justify-between items-center mt-4 p-4 bg-muted/20 rounded-lg">
            <div className="text-sm font-medium">
                إجمالي الأصناف: <span className="font-bold">{items?.length || 0}</span>
            </div>
            <div className="text-sm font-medium">
                إجمالي الكمية: <span className="font-bold text-blue-600">{items?.reduce((acc, i) => acc + (i.qty || 0), 0).toLocaleString()}</span>
            </div>
            <div className="text-sm font-medium">
                إجمالي التكلفة: <span className="font-bold text-muted-foreground italic">{items?.reduce((acc, i) => acc + ((i.cost || 0) * i.qty), 0).toLocaleString()}</span>
            </div>
         </div>
     </DialogContent>
    </Dialog>
 );

export default function RepInvoicesPage() {
  const { salesInvoices: invoices, users, dbAction, getNextId, loading, cashAccounts } = useData();
  const [filters, setFilters] = useState({
    salesRepId: "all",
    fromDate: "",
    toDate: "",
  });
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  useEffect(() => {
    if (!isDetailsOpen) {
        document.body.style.pointerEvents = 'auto';
    }
  }, [isDetailsOpen]);

  const { can } = usePermissions();
  const { toast } = useToast();
  const loadingData = loading;
  const salesReps = users.filter((u: any) => u.isSalesRep);

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((invoice: any) => invoice.status === 'pending') // Only show pending invoices
      .filter((invoice: any) => {
        const invoiceDate = new Date(invoice.date);
        const from = filters.fromDate ? new Date(filters.fromDate) : null;
        const to = filters.toDate ? new Date(filters.toDate) : null;

        if (from) from.setHours(0,0,0,0);
        if (to) to.setHours(23,59,59,999);

        if (from && invoiceDate < from) return false;
        if (to && invoiceDate > to) return false;
        if (filters.salesRepId !== 'all' && invoice.salesRepId !== filters.salesRepId) return false;
        
        return true;
      }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices, filters]);

  const summary = useMemo(() => {
    let totalPieces = 0;
    let totalCollections = 0;
    let totalDebts = 0;

    filteredInvoices.forEach((inv: any) => {
      // Count total pieces
      inv.items?.forEach((item: any) => {
        totalPieces += (item.qty || 0);
      });
      // Count collections and debts
      totalCollections += (inv.paidAmount || 0);
      totalDebts += (inv.total - (inv.paidAmount || 0));
    });

    return { totalPieces, totalCollections, totalDebts };
  }, [filteredInvoices]);

  const handleApprove = async (invoice: SaleInvoice) => {
    if (!can('approve', 'sales_repInvoices')) {
      toast({ variant: 'destructive', title: 'غير مصرح به' });
      return;
    }
    try {
      // Step 1: Approve the invoice
      await dbAction('salesInvoices', 'update', { id: invoice.id, data: { status: 'approved' } });

      // Step 2: Find the rep's specific cash account
      const repCashAccount = cashAccounts.find((acc: any) => acc.userId === invoice.salesRepId);
      
      // Step 3: If there's a paid amount, create a customer payment record in the *rep's* cash account.
      if (invoice.paidAmount && invoice.paidAmount > 0 && repCashAccount) {
          await dbAction('customerPayments', 'add', {
              date: new Date().toISOString(),
              amount: invoice.paidAmount,
              customerId: invoice.customerId,
              paidToAccountId: repCashAccount.id, // Use the rep's cash account
              notes: `دفعة من فاتورة مندوب رقم ${invoice.invoiceNumber}`,
              receiptNumber: `س-ع-${await getNextId('customerPayment')}`,
              invoiceId: invoice.id,
          });
      } else if (invoice.paidAmount && invoice.paidAmount > 0 && !repCashAccount) {
         toast({ variant: 'destructive', title: 'خطأ في الحسابات', description: `لم يتم العثور على حساب عهدة للمندوب. لم يتم تسجيل الدفعة.` });
      }

      toast({ title: 'تم الاعتماد بنجاح', description: 'تم اعتماد الفاتورة وتحديث الحسابات.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'فشل اعتماد الفاتورة.' });
    }
  };

  const handleDelete = async (invoiceId: string) => {
     if (!can('delete', 'sales_repInvoices')) {
      toast({ variant: 'destructive', title: 'غير مصرح به' });
      return;
    }
    try {
      await dbAction('salesInvoices', 'remove', { id: invoiceId });
      toast({ title: 'تم الحذف بنجاح' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حذف الفاتورة.' });
    }
  }

  const getRepName = (repId: string) => users.find((u: any) => u.id === repId)?.name || 'غير معروف';
  
  const openMap = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
  };

  return (
    <>
      <PageHeader title="اعتماد فواتير المناديب" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-blue-800 dark:text-blue-300">إجمالي القطع المباعة</CardTitle>
                    <Package className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{summary.totalPieces.toLocaleString()} قطعة</div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">بانتظار الاعتماد والتسليم</p>
                </CardContent>
            </Card>
            <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-green-800 dark:text-green-300">إجمالي المتحصلات النقدية</CardTitle>
                    <Wallet className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-900 dark:text-green-100">{summary.totalCollections.toLocaleString()} ج.م</div>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">نقدية يجب توريدها</p>
                </CardContent>
            </Card>
            <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-300">إجمالي المديونيات الجديدة</CardTitle>
                    <CreditCard className="h-4 w-4 text-amber-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">{summary.totalDebts.toLocaleString()} ج.م</div>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">ستسجل على حسابات العملاء</p>
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
                        <Label>مندوب المبيعات</Label>
                        <Select value={filters.salesRepId} onValueChange={(v) => handleFilterChange("salesRepId", v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="اختر المندوب" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">كل المناديب</SelectItem>
                                {salesReps.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label>من تاريخ</Label>
                        <Input type="date" value={filters.fromDate} onChange={(e) => handleFilterChange("fromDate", e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label>إلى تاريخ</Label>
                        <Input type="date" value={filters.toDate} onChange={(e) => handleFilterChange("toDate", e.target.value)} />
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>الفواتير المعلقة</CardTitle>
            <CardDescription>
              عرض واعتماد الفواتير التي قام المناديب بإنشائها ولم يتم اعتمادها بعد.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingData ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم الفاتورة</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead>المندوب</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead className="text-center">الإجمالي</TableHead>
                      <TableHead className="text-center">المدفوع</TableHead>
                      <TableHead className="text-center">المتبقي</TableHead>
                      <TableHead className="text-center">موقع الفاتورة</TableHead>
                      <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.length > 0 ? (
                      filteredInvoices.map((invoice: any) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                          <TableCell>{invoice.customerName}</TableCell>
                          <TableCell>{getRepName(invoice.salesRepId)}</TableCell>
                          <TableCell>{new Date(invoice.date).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="border-amber-500 text-amber-500">معلقة</Badge>
                          </TableCell>
                          <TableCell className="text-center">{invoice.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-center">{invoice.paidAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-center font-bold">{(invoice.total - (invoice.paidAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                           <TableCell className="text-center">
                            {invoice.location ? (
                                <Button variant="outline" size="sm" onClick={() => openMap(invoice.location.latitude, invoice.location.longitude)}>
                                    <MapPin className="ml-2 h-4 w-4"/>
                                    عرض
                                </Button>
                            ) : (
                                <span className="text-xs text-muted-foreground">لم يسجل</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                             <AlertDialog>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button aria-haspopup="true" size="icon" variant="ghost">
                                            <MoreHorizontal className="h-4 w-4" />
                                            <span className="sr-only">قائمة</span>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                        <DropdownMenuItem onSelect={(e) => { 
                                            e.preventDefault(); 
                                            setSelectedInvoice(invoice); 
                                            setIsDetailsOpen(true); 
                                        }}>
                                            <Eye className="ml-2 h-4 w-4 text-blue-500" />
                                            عرض الأصناف
                                        </DropdownMenuItem>
                                        {can('approve', 'sales_repInvoices') && (
                                            <DropdownMenuItem onClick={() => handleApprove(invoice)}>
                                                <CheckCircle className="ml-2 h-4 w-4 text-green-500" />
                                                اعتماد الفاتورة
                                            </DropdownMenuItem>
                                        )}
                                         {can('delete', 'sales_repInvoices') && (
                                            <AlertDialogTrigger asChild>
                                                <DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}>
                                                    <Trash2 className="ml-2 h-4 w-4" />
                                                    حذف
                                                </DropdownMenuItem>
                                            </AlertDialogTrigger>
                                         )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>هل أنت متأكد من الحذف؟</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            سيتم حذف هذه الفاتورة المعلقة بشكل دائم. لا يمكن التراجع عن هذا الإجراء.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDelete(invoice.id)}>نعم، قم بالحذف</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                             </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                          لا توجد فواتير معلقة حاليًا.
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
      <InvoiceItemsDialog 
        items={selectedInvoice?.items || []} 
        open={isDetailsOpen} 
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) {
            // Give it time to animate out before clearing the invoice
            setTimeout(() => setSelectedInvoice(null), 300);
          }
        }} 
      />
    </>
  );
}
