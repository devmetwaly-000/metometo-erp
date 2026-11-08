
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
import { PlusCircle, Loader2, MoreHorizontal, FileText, Undo2, Printer, FileSearch, Eye, Edit, CheckCircle, MessageCircle, Tag, Percent, CheckSquare, X, ArrowUpDown } from "lucide-react";
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
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { InvoiceTemplate } from '@/components/invoice-template';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  total: number;
  items: any[];
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
                        <TableCell className="text-center">{item.cost?.toLocaleString() || '-'}</TableCell>
                        <TableCell className="text-center font-semibold">{item.total?.toLocaleString() || '-'}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
)

export default function PurchaseInvoicesListPage() {
  const { purchaseInvoices: invoices, suppliers, warehouses, inventoryClosings, stockInRecords, supplierPayments, purchaseReturns, settings, loading, dbAction } = useData();
  const router = useRouter();
  const { toast } = useToast();

  const [filters, setFilters] = useState({
    supplierId: "all",
    warehouseId: "all",
    fromDate: "",
    toDate: "",
    receiptStatus: 'all'
  });

  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isItemsOpen, setIsItemsOpen] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);

  // Batch Discount States
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [singleInvoiceForDiscount, setSingleInvoiceForDiscount] = useState<any>(null);
  const [discountMode, setDiscountMode] = useState<'percentage' | 'distributed_amount' | 'fixed_per_invoice'>('percentage');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [discountNotes, setDiscountNotes] = useState('');
  const [isSubmittingDiscount, setIsSubmittingDiscount] = useState(false);

  // Aggressive Cleanup for Pointer Events and Scroll
  useEffect(() => {
    const cleanup = () => {
        if (!isItemsOpen && !isPrintOpen && !isDiscountModalOpen) {
            document.body.style.pointerEvents = 'auto';
            document.body.style.overflow = 'auto';
        }
    };
    cleanup();
    const timer = setTimeout(cleanup, 500);
    return () => clearTimeout(timer);
  }, [isItemsOpen, isPrintOpen, isDiscountModalOpen]);

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  const supplierOptions = useMemo(() => ([{value: 'all', label: 'كل الموردين'}, ...suppliers.map((s:any) => ({ value: s.id, label: s.name }))]), [suppliers]);
  const warehouseOptions = useMemo(() => ([{value: 'all', label: 'كل الفروع'}, ...warehouses.map((w:any) => ({ value: w.id, label: w.name }))]), [warehouses]);

  const calculateSupplierBalance = (sId: string) => {
    if (!sId) return 0;
    const supplier = suppliers.find((s: any) => s.id === sId);
    if (!supplier) return 0;

    let balance = Number(supplier.openingBalance) || 0;
    
    invoices.filter((inv: any) => inv.supplierId === sId)
        .forEach((inv: any) => {
            balance += (Number(inv.total) - Number(inv.paidAmount || 0));
        });

    supplierPayments.filter((p: any) => p.supplierId === sId && !p.invoiceId)
        .forEach((p: any) => {
            balance -= Number(p.amount);
        });

    purchaseReturns.filter((r: any) => r.supplierId === sId)
        .forEach((r: any) => {
            balance -= (Number(r.total) - Number(r.paidAmount || 0));
        });

    return balance;
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

  const receivedInvoiceIds = useMemo(() => {
    return new Set(stockInRecords.filter((rec: any) => rec.purchaseInvoiceId).map((rec: any) => rec.purchaseInvoiceId));
  }, [stockInRecords]);

  const filteredInvoices = useMemo(() => {
    return invoices.map((invoice: any) => {
        const lastClosingDate = lastClosingDates.get(invoice.warehouseId);
        const isLocked = lastClosingDate && new Date(invoice.date) <= lastClosingDate;
        const isReceived = receivedInvoiceIds.has(invoice.id);
        return { ...invoice, isLocked, isReceived };
    })
    .filter((invoice:any) => {
      const invoiceDate = new Date(invoice.date);
      const from = filters.fromDate ? new Date(filters.fromDate) : null;
      const to = filters.toDate ? new Date(filters.toDate) : null;
      if (from) from.setHours(0,0,0,0);
      if (to) to.setHours(23,59,59,999);

      if (from && invoiceDate < from) return false;
      if (to && invoiceDate > to) return false;
      if (filters.supplierId !== 'all' && invoice.supplierId !== filters.supplierId) return false;
      if (filters.warehouseId !== 'all' && invoice.warehouseId !== filters.warehouseId) return false;
      if (filters.receiptStatus === 'received' && !invoice.isReceived) return false;
      if (filters.receiptStatus === 'not_received' && invoice.isReceived) return false;
      
      return true;
    }).sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices, filters, lastClosingDates, receivedInvoiceIds]);

  const companySettings = useMemo(() => settings?.main?.general || {}, [settings]);

  const selectedInvoicesTotal = useMemo(() => {
    return filteredInvoices
      .filter((inv: any) => selectedInvoiceIds.has(inv.id))
      .reduce((sum: number, inv: any) => sum + (Number(inv.total) || 0), 0);
  }, [filteredInvoices, selectedInvoiceIds]);

  const targetInvoicesForDiscount = useMemo(() => {
    if (singleInvoiceForDiscount) return [singleInvoiceForDiscount];
    return filteredInvoices.filter((inv: any) => selectedInvoiceIds.has(inv.id));
  }, [singleInvoiceForDiscount, filteredInvoices, selectedInvoiceIds]);

  // Preview calculations for the discount modal
  const discountPreview = useMemo(() => {
    const val = Number(discountValue) || 0;
    const totalSubtotal = targetInvoicesForDiscount.reduce((sum, inv) => {
      const sub = Number(inv.subtotal) || (Number(inv.total) + (Number(inv.discount) || 0));
      return sum + sub;
    }, 0);

    return targetInvoicesForDiscount.map(inv => {
      const sub = Number(inv.subtotal) || (Number(inv.total) + (Number(inv.discount) || 0));
      let proposedDiscount = 0;

      if (discountMode === 'percentage') {
        proposedDiscount = (sub * val) / 100;
      } else if (discountMode === 'distributed_amount') {
        const ratio = totalSubtotal > 0 ? (sub / totalSubtotal) : 0;
        proposedDiscount = val * ratio;
      } else if (discountMode === 'fixed_per_invoice') {
        proposedDiscount = val;
      }

      proposedDiscount = Math.min(sub, Math.max(0, Math.round(proposedDiscount * 100) / 100));
      const proposedTotal = Math.max(0, sub - proposedDiscount);

      return {
        ...inv,
        subtotal: sub,
        currentDiscount: Number(inv.discount) || 0,
        proposedDiscount,
        proposedTotal
      };
    });
  }, [targetInvoicesForDiscount, discountMode, discountValue]);

  const totalProposedDiscount = useMemo(() => {
    return discountPreview.reduce((sum, item) => sum + item.proposedDiscount, 0);
  }, [discountPreview]);

  const handleApplyDiscount = async () => {
    if (discountPreview.length === 0) return;
    setIsSubmittingDiscount(true);
    try {
      for (const item of discountPreview) {
        const noteAddition = discountNotes ? ` [خصم مكتسب: ${item.proposedDiscount} ج.م - ${discountNotes}]` : ` [خصم مكتسب: ${item.proposedDiscount} ج.م]`;
        const updatedNotes = (item.notes ? `${item.notes} |` : '') + noteAddition;
        
        await dbAction('purchaseInvoices', 'update', {
          id: item.id,
          discount: item.proposedDiscount,
          total: item.proposedTotal,
          subtotal: item.subtotal,
          notes: updatedNotes
        });
      }

      toast({
        title: "تم تطبيق وتحديث الخصم المكتسب بنجاح",
        description: `تم تحديث ${discountPreview.length} فاتورة شراء بإجمالي خصم مكتسب ${totalProposedDiscount.toLocaleString()} ج.م وتعديل أرصدة الموردين وقيود اليومية.`
      });

      setIsDiscountModalOpen(false);
      setSingleInvoiceForDiscount(null);
      setSelectedInvoiceIds(new Set());
      setDiscountValue('');
      setDiscountNotes('');
    } catch (err: any) {
      console.error(err);
      toast({
        title: "حدث خطأ أثناء حفظ الخصم",
        description: err.message || "تعذر تحديث الفواتير",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingDiscount(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };
  
  const handleShare = (invoice: PurchaseInvoice) => {
    const text = `
*فاتورة شراء رقم: ${invoice.invoiceNumber}*
------------------------------------
*المورد:* ${invoice.supplierName}
*التاريخ:* ${new Date(invoice.date).toLocaleDateString('ar-EG')}
*الإجمالي:* ${invoice.total.toLocaleString()} ج.م
------------------------------------
تم الاستلام في: ${warehouses.find((w: any) => w.id === invoice.warehouseId)?.name || 'المستودع'}
    `;
    const encodedText = encodeURIComponent(text.trim());
    window.open(`https://wa.me/?text=${encodedText}`);
  };

  return (
    <>
      <PageHeader title="سجل فواتير الشراء">
        <Button size="sm" className="gap-1 no-print" onClick={() => router.push('/purchases/invoices')}>
          <PlusCircle className="h-4 w-4" />
          فاتورة جديدة
        </Button>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 printable-area">
        <Card className="no-print">
            <CardHeader>
                <CardTitle>فلاتر البحث</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                     <div className="space-y-2">
                        <Label>المورد</Label>
                        <Combobox
                          options={supplierOptions}
                          value={filters.supplierId}
                          onValueChange={(v) => handleFilterChange("supplierId", v)}
                          placeholder="اختر المورد..."
                          emptyMessage="لم يتم العثور على مورد."
                        />
                    </div>
                     <div className="space-y-2">
                        <Label>الفرع</Label>
                        <Combobox
                          options={warehouseOptions}
                          value={filters.warehouseId}
                          onValueChange={(v) => handleFilterChange("warehouseId", v)}
                          placeholder="اختر الفرع..."
                          emptyMessage="لم يتم العثور على فرع."
                        />
                    </div>
                     <div className="space-y-2">
                        <Label>من تاريخ</Label>
                        <Input type="date" value={filters.fromDate} onChange={(e) => handleFilterChange("fromDate", e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label>إلى تاريخ</Label>
                        <Input type="date" value={filters.toDate} onChange={(e) => handleFilterChange("toDate", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>حالة الاستلام</Label>
                        <Select value={filters.receiptStatus} onValueChange={(v) => handleFilterChange('receiptStatus', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">الكل</SelectItem>
                                <SelectItem value="received">تم الاستلام</SelectItem>
                                <SelectItem value="not_received">لم تستلم</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardContent>
        </Card>

        {/* Batch Selection Action Banner */}
        {selectedInvoiceIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-primary/10 border-2 border-primary/30 rounded-xl shadow-sm no-print animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary text-primary-foreground font-bold text-sm px-3 py-1">
                {selectedInvoiceIds.size} فاتورة محددة
              </Badge>
              <span className="text-sm font-bold text-foreground">
                إجمالي الفواتير المحددة: <span className="text-primary font-black">ج.م {selectedInvoicesTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedInvoiceIds(new Set())}>
                <X className="h-4 w-4 ml-1" /> إلغاء التحديد
              </Button>
              <Button 
                size="sm" 
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow"
                onClick={() => {
                  setSingleInvoiceForDiscount(null);
                  setIsDiscountModalOpen(true);
                }}
              >
                <Percent className="h-4 w-4" /> تطبيق خصم مكتسب على الفواتير المحددة
              </Button>
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle>قائمة فواتير الشراء</CardTitle>
                <CardDescription>عرض وتتبع فواتير الشراء وتعديل الخصومات المكتسبة والمستحقات.</CardDescription>
            </div>
            <Button size="sm" className="gap-1 no-print" onClick={() => router.push('/purchases/invoices')}>
                <PlusCircle className="h-4 w-4" />
                فاتورة جديدة
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[45px] text-center no-print">
                        <Checkbox 
                          checked={filteredInvoices.length > 0 && selectedInvoiceIds.size === filteredInvoices.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedInvoiceIds(new Set(filteredInvoices.map((inv: any) => inv.id)));
                            } else {
                              setSelectedInvoiceIds(new Set());
                            }
                          }}
                          aria-label="تحديد الكل"
                        />
                      </TableHead>
                      <TableHead>رقم الفاتورة</TableHead>
                      <TableHead>المورد</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead className="text-center">الخصم المكتسب</TableHead>
                      <TableHead className="text-center">صافي الفاتورة</TableHead>
                      <TableHead className="text-center w-[100px] no-print">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices && filteredInvoices.length > 0 ? (
                      filteredInvoices.map((invoice:any) => {
                        const isEditable = !invoice.isLocked && !invoice.isReceived;
                        const hasDiscount = Number(invoice.discount) > 0;
                        const isSelected = selectedInvoiceIds.has(invoice.id);
                        return (
                            <TableRow key={invoice.id} className={cn(
                              !isEditable && 'bg-muted/20',
                              isSelected && 'bg-primary/5 border-l-4 border-l-primary'
                            )}>
                                <TableCell className="text-center no-print">
                                  <Checkbox 
                                    checked={isSelected}
                                    onCheckedChange={(checked) => {
                                      setSelectedInvoiceIds(prev => {
                                        const next = new Set(prev);
                                        if (checked) next.add(invoice.id);
                                        else next.delete(invoice.id);
                                        return next;
                                      });
                                    }}
                                    aria-label={`تحديد فاتورة ${invoice.invoiceNumber}`}
                                  />
                                </TableCell>
                                <TableCell className="font-mono font-bold">{invoice.invoiceNumber}</TableCell>
                                <TableCell className="font-medium">{invoice.supplierName}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{new Date(invoice.date).toLocaleDateString('ar-EG')}</TableCell>
                                <TableCell>
                                    {invoice.isReceived ? (
                                        <Badge variant="default" className="bg-green-600 text-[11px]"><CheckCircle className="h-3 w-3 ml-1"/> تم الاستلام</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-amber-600 border-amber-200 text-[11px]"><FileText className="h-3 w-3 ml-1"/> لم تستلم</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-center">
                                    {hasDiscount ? (
                                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                                            {Number(invoice.discount).toLocaleString()} ج.م
                                        </Badge>
                                    ) : (
                                        <span className="text-muted-foreground text-xs">-</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-center font-black text-primary">{Number(invoice.total).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</TableCell>
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
                                                setSelectedInvoice(invoice);
                                                setTimeout(() => setIsItemsOpen(true), 150);
                                            }}>
                                                <Eye className="ml-2 h-4 w-4 text-blue-500" /> عرض الأصناف
                                            </DropdownMenuItem>

                                            <DropdownMenuItem onSelect={() => {
                                                setSelectedInvoice(invoice);
                                                setTimeout(() => setIsPrintOpen(true), 150);
                                            }}>
                                                <Printer className="ml-2 h-4 w-4" /> عرض / طباعة
                                            </DropdownMenuItem>

                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={() => {
                                                setSingleInvoiceForDiscount(invoice);
                                                setDiscountValue(Number(invoice.discount) || '');
                                                setIsDiscountModalOpen(true);
                                            }}>
                                                <Tag className="ml-2 h-4 w-4 text-emerald-600" /> تعديل الخصم المكتسب
                                            </DropdownMenuItem>

                                            <DropdownMenuItem onClick={() => router.push(`/purchases/invoices/${invoice.id}/edit`)} disabled={!isEditable}>
                                                <Edit className="ml-2 h-4 w-4" /> تعديل البيانات
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => router.push(`/reports/supplier-statement?supplierId=${invoice.supplierId}&toDate=${invoice.date}`)}>
                                                <FileSearch className="ml-2 h-4 w-4" /> كشف حساب المورد
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => router.push(`/purchases/returns/new?invoiceId=${invoice.id}`)} disabled={invoice.isLocked}>
                                                <Undo2 className="ml-2 h-4 w-4 text-amber-600" /> إجراء مرتجع
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
                          لا توجد فواتير مسجلة تطابق الفلاتر المحددة.
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

      {/* Batch / Single Earned Discount Modal */}
      <Dialog open={isDiscountModalOpen} onOpenChange={setIsDiscountModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Tag className="h-5 w-5" />
              تطبيق خصم مكتسب على فواتير المورد (تسوية / خصم تجاري)
            </DialogTitle>
            <DialogDescription>
              سيتم تعديل صافي الفواتير، تخفيض مديونية المورد، وتسجيل قيد الخصم المكتسب آلياً في شجرة الحسابات وقائمة الدخل.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>طريقة احتساب الخصم</Label>
                <Select value={discountMode} onValueChange={(v: any) => setDiscountMode(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">نسبة مئوية (%) من قيمة كل فاتورة</SelectItem>
                    <SelectItem value="distributed_amount">مبلغ إجمالي ثابت (ج.م) يوزع نسبياً</SelectItem>
                    <SelectItem value="fixed_per_invoice">مبلغ ثابت (ج.م) يطبق على كل فاتورة</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  {discountMode === 'percentage' ? 'نسبة الخصم (%)' : 'قيمة الخصم (ج.م)'}
                </Label>
                <Input 
                  type="number"
                  min="0"
                  step="any"
                  placeholder={discountMode === 'percentage' ? 'مثال: 5%' : 'مثال: 1500 ج.م'}
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>سبب الخصم / ملاحظات المعاملة</Label>
              <Input 
                placeholder="مثال: خصم تعجيل دفع / خصم كمية تجاري / تسوية حساب مع المورد"
                value={discountNotes}
                onChange={e => setDiscountNotes(e.target.value)}
              />
            </div>

            {/* Preview Table */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-muted-foreground">معاينة تأثير الخصم على الفواتير ({discountPreview.length} فاتورة):</span>
                <span className="text-xs font-black text-emerald-600">
                  إجمالي الخصم المكتسب: {totalProposedDiscount.toLocaleString()} ج.م
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="text-xs">
                      <TableHead>رقم الفاتورة</TableHead>
                      <TableHead>المورد</TableHead>
                      <TableHead className="text-center">قبل الخصم</TableHead>
                      <TableHead className="text-center text-emerald-600">الخصم المقترح</TableHead>
                      <TableHead className="text-center">الصافي الجديد</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discountPreview.map(item => (
                      <TableRow key={item.id} className="text-xs">
                        <TableCell className="font-mono font-bold">{item.invoiceNumber}</TableCell>
                        <TableCell>{item.supplierName}</TableCell>
                        <TableCell className="text-center font-mono">{item.subtotal.toLocaleString()} ج.م</TableCell>
                        <TableCell className="text-center font-mono font-bold text-emerald-600">-{item.proposedDiscount.toLocaleString()} ج.م</TableCell>
                        <TableCell className="text-center font-mono font-bold">{item.proposedTotal.toLocaleString()} ج.م</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDiscountModalOpen(false)} disabled={isSubmittingDiscount}>
              إلغاء
            </Button>
            <Button 
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
              onClick={handleApplyDiscount}
              disabled={isSubmittingDiscount || discountPreview.length === 0 || Number(discountValue) <= 0}
            >
              {isSubmittingDiscount && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد وحفظ الخصم المحاسبي ({totalProposedDiscount.toLocaleString()} ج.م)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Items Details Dialog */}
      <Dialog open={isItemsOpen} onOpenChange={setIsItemsOpen}>
        <DialogContent className="max-w-3xl">
            <DialogHeader>
                <DialogTitle>تفاصيل أصناف فاتورة شراء رقم {selectedInvoice?.invoiceNumber}</DialogTitle>
            </DialogHeader>
            <InvoiceItemsTable items={selectedInvoice?.items || []} />
        </DialogContent>
      </Dialog>

      {/* Print View Dialog */}
      <Dialog open={isPrintOpen} onOpenChange={setIsPrintOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <DialogHeader className="p-4 bg-muted/30">
                <DialogTitle>طباعة الفاتورة {selectedInvoice?.invoiceNumber}</DialogTitle>
                <DialogDescription>معاينة الفاتورة قبل الطباعة.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 bg-white">
                <div className="printable-area bg-white text-black p-4 flex justify-center">
                    {selectedInvoice && (
                        <InvoiceTemplate 
                            invoice={selectedInvoice} 
                            company={companySettings} 
                            customer={suppliers.find((s: any) => s.id === selectedInvoice.supplierId)} 
                            isPurchase={true} 
                            customerBalance={calculateSupplierBalance(selectedInvoice.supplierId)}
                        />
                    )}
                </div>
            </ScrollArea>
            <DialogFooter className="p-4 border-t flex justify-end gap-2 bg-background no-print">
                <Button onClick={() => selectedInvoice && handleShare(selectedInvoice)} variant="outline" className="bg-green-500 text-white hover:bg-green-600 hover:text-white">
                    <MessageCircle className="ml-2 h-4 w-4" /> واتساب
                </Button>
                <Button onClick={() => window.print()}><Printer className="ml-2 h-4 w-4" />طباعة</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
