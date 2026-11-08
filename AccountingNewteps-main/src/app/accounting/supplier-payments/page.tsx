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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Loader2, MoreHorizontal, Trash2, Wallet, AlertTriangle, Search, Calendar, User, History, ArrowRight, Info } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/auth-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from '@/contexts/data-provider';
import { Combobox } from '@/components/ui/combobox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { dictionary } from '@/lib/dictionary';
import { calculateAccountBalance } from '@/lib/accounting-utils';

interface SupplierPayment {
    id?: string;
    date: string;
    amount: number;
    supplierId: string;
    paidFromAccountId: string;
    notes?: string;
    receiptNumber?: string;
    createdById?: string;
    createdByName?: string;
    invoiceId?: string;
}

interface Supplier {
    id: string;
    name: string;
    openingBalance?: number;
}

interface CashAccount {
    id: string;
    name: string;
    warehouseId?: string;
    userId?: string;
    salesRepId?: string;
    openingBalance?: number;
    currentBalance?: number;
}

interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  total: number;
  paidAmount?: number;
  warehouseId?: string;
  date: string;
}

const PaymentForm = ({ onSave, suppliers, cashAccounts, purchaseInvoices, supplierPayments, purchaseReturns, warehouses }: { 
    onSave: (data: Omit<SupplierPayment, 'id' | 'receiptNumber'>) => void, 
    suppliers: Supplier[], 
    cashAccounts: CashAccount[], 
    purchaseInvoices: PurchaseInvoice[], 
    supplierPayments: any[], 
    purchaseReturns: any[],
    warehouses: any[]
}) => {
    const [formData, setFormData] = useState<Omit<SupplierPayment, 'id' | 'receiptNumber'>>({ 
        date: new Date().toISOString().split('T')[0], 
        amount: 0, 
        supplierId: "", 
        paidFromAccountId: "", 
        notes: "",
        invoiceId: "" 
    });
    
    const branchAndGeneralAccounts = useMemo(() => {
        return cashAccounts.filter(acc => !acc.userId && !acc.salesRepId);
    }, [cashAccounts]);

    const currentSupplierBalance = useMemo(() => {
        if (!formData.supplierId) return 0;
        const supplier = suppliers.find(s => s.id === formData.supplierId);
        if (!supplier) return 0;

        let balance = Number(supplier.openingBalance) || 0;
        
        purchaseInvoices.filter(inv => inv.supplierId === formData.supplierId)
            .forEach(inv => {
                balance += (Number(inv.total) - Number(inv.paidAmount || 0));
            });

        supplierPayments.filter(p => p.supplierId === formData.supplierId && !p.invoiceId)
            .forEach(p => {
                balance -= Number(p.amount);
            });

        purchaseReturns.filter(r => r.supplierId === formData.supplierId)
            .forEach(r => {
                balance -= (Number(r.total) - Number(r.paidAmount || 0));
            });

        return balance;
    }, [formData.supplierId, suppliers, purchaseInvoices, supplierPayments, purchaseReturns]);

    const supplierOptions = React.useMemo(() => suppliers.map((s: Supplier) => ({ value: s.id, label: s.name })), [suppliers]);
    
    const [availableCashAccounts, setAvailableCashAccounts] = useState(branchAndGeneralAccounts);
    
    const cashAccountOptions = React.useMemo(() => availableCashAccounts.map((c: CashAccount) => ({ 
        value: c.id, 
        label: `${c.name} (المتاح: ${c.currentBalance?.toLocaleString() || 0})` 
    })), [availableCashAccounts]);

    const supplierInvoicesWithBalance = useMemo(() => {
        if (!formData.supplierId) return [];
        return purchaseInvoices.filter((inv: PurchaseInvoice) => {
            if (inv.supplierId !== formData.supplierId) return false;
            const remaining = inv.total - (inv.paidAmount || 0);
            return remaining > 0.01;
        });
    }, [formData.supplierId, purchaseInvoices]);

    const selectedInvoiceDetails = useMemo(() => {
        if (!formData.invoiceId) return null;
        return supplierInvoicesWithBalance.find((inv: PurchaseInvoice) => inv.id === formData.invoiceId);
    }, [formData.invoiceId, supplierInvoicesWithBalance]);
    
    const invoiceOptions = React.useMemo(() => {
        return supplierInvoicesWithBalance.map((inv: PurchaseInvoice) => ({
            value: inv.id,
            label: `${inv.invoiceNumber} (المتبقي: ${(inv.total - (inv.paidAmount || 0)).toLocaleString()})`
        }));
    }, [supplierInvoicesWithBalance]);
    
    useEffect(() => {
        if (selectedInvoiceDetails?.warehouseId) {
            const branchCashAccount = branchAndGeneralAccounts.find((acc: CashAccount) => acc.warehouseId === selectedInvoiceDetails.warehouseId);
            if (branchCashAccount) {
                setAvailableCashAccounts([branchCashAccount, ...branchAndGeneralAccounts.filter(acc => acc.id !== branchCashAccount.id)]);
                setFormData(prev => ({...prev, paidFromAccountId: branchCashAccount.id}));
            } else {
                setAvailableCashAccounts(branchAndGeneralAccounts);
            }
        } else {
             setAvailableCashAccounts(branchAndGeneralAccounts);
        }
    }, [selectedInvoiceDetails, branchAndGeneralAccounts]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.paidFromAccountId || !formData.supplierId || formData.amount <= 0) return;
        onSave({ ...formData, amount: Number(formData.amount) });
        setFormData({ date: new Date().toISOString().split('T')[0], amount: 0, supplierId: "", paidFromAccountId: "", notes: "", invoiceId: "" });
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4">
                <div className="space-y-2">
                    <Label>التاريخ</Label>
                    <Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required/>
                </div>
                <div className="space-y-2">
                    <Label>المورد</Label>
                    <Combobox
                        options={supplierOptions}
                        value={formData.supplierId}
                        onValueChange={v => setFormData({...formData, supplierId: v, invoiceId: ''})}
                        placeholder="اختر المورد..."
                        emptyMessage="لم يتم العثور على المورد."
                    />
                    {formData.supplierId && (
                        <div className={cn(
                            "flex items-center gap-3 p-4 rounded-xl border animate-in fade-in slide-in-from-top-2 shadow-sm",
                            currentSupplierBalance > 0 ? "bg-destructive/10 border-destructive/20" : "bg-green-500/10 border-green-500/20"
                        )}>
                            <div className={cn(
                                "p-2 rounded-full",
                                currentSupplierBalance > 0 ? "bg-destructive/20" : "bg-green-500/20"
                            )}>
                                <Wallet className={cn("h-5 w-5", currentSupplierBalance > 0 ? "text-destructive" : "text-green-600 dark:text-green-400")} />
                            </div>
                            <div className="flex-1">
                                <span className={cn("text-[10px] font-bold block mb-0.5 uppercase tracking-wider", currentSupplierBalance > 0 ? "text-destructive/80" : "text-green-700 dark:text-green-300")}>
                                    {currentSupplierBalance >= 0 ? "المستحق للمورد حالياً:" : "رصيد دائن (لنا طرف المورد):"}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className={cn("text-lg font-black", currentSupplierBalance > 0 ? "text-destructive" : "text-green-700 dark:text-green-400")}>
                                        {Math.abs(currentSupplierBalance).toLocaleString()} ج.م 
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                 <div className="space-y-2">
                    <Label>ربط بفاتورة شراء</Label>
                    <Combobox
                        options={invoiceOptions}
                        value={formData.invoiceId || ''}
                        onValueChange={v => setFormData({...formData, invoiceId: v})}
                        disabled={!formData.supplierId || supplierInvoicesWithBalance.length === 0}
                        placeholder={!formData.supplierId ? "اختر المورد أولاً" : "اختياري: ربط بفاتورة"}
                        emptyMessage="لا توجد فواتير مستحقة."
                    />
                </div>
                <div className="space-y-2">
                    <Label>صرف من حساب</Label>
                    <Combobox
                        options={cashAccountOptions}
                        value={formData.paidFromAccountId}
                        onValueChange={v => setFormData({...formData, paidFromAccountId: v})}
                        placeholder="اختر حساب الصرف..."
                        emptyMessage="لا توجد حسابات متاحة."
                    />
                </div>
                 <div className="space-y-2">
                    <Label>المبلغ المدفوع</Label>
                    <Input id="payment-amount" type="number" value={formData.amount || ''} onChange={e => setFormData({...formData, amount: e.target.value as any})} placeholder="0.00" required className="text-lg font-bold" onFocus={e => e.target.select()}/>
                </div>
                <div className="space-y-2">
                    <Label>ملاحظات</Label>
                    <Textarea value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="اختياري..." className="h-20" />
                </div>
            </div>
            <Button type="submit" disabled={!formData.paidFromAccountId || !formData.supplierId || formData.amount <= 0} className="w-full h-12 text-base font-bold">
                <PlusCircle className="ml-2 h-5 w-5" />
                حفظ دفعة المورد
            </Button>
        </form>
    );
};

export default function SupplierPaymentsPage() {
    const allDataContext = useData();
    const { 
        supplierPayments: payments, 
        suppliers, 
        cashAccounts: rawCashAccounts, 
        purchaseInvoices, 
        dbAction, 
        getNextId, 
        loading 
    } = allDataContext;

    const { toast } = useToast();
    const { user } = useAuth();
    const isMobile = useIsMobile();

    const [searchTerm, setSearchTerm] = useState("");
    const [filters, setFilters] = useState({
        fromDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        toDate: new Date().toISOString().split('T')[0]
    });

    // حساب الأرصدة الحقيقية لكل حساب نقدي باستخدام المحرك الموحد
    const cashAccounts: CashAccount[] = useMemo(() => {
        if (loading) return [];
        return rawCashAccounts.map((account: any) => {
            const currentBalance = calculateAccountBalance(account, allDataContext);
            return { ...account, currentBalance };
        });
    }, [loading, rawCashAccounts, allDataContext]);
    
    const getSupplierName = (supplierId: string) => {
        return suppliers.find((s: Supplier) => s.id === supplierId)?.name || "مورد غير معروف";
    };

    const getCashAccountName = (accountId: string) => {
        return cashAccounts.find((acc: CashAccount) => acc.id === accountId)?.name || "غير معروف";
    }

    const handleSave = async (data: Omit<SupplierPayment, 'id' | 'receiptNumber'>) => {
        try {
            const receiptNumber = `س-م-${await getNextId('supplierPayment')}`;
            const now = new Date();
            const [year, month, day] = data.date.split('-').map(Number);
            const finalDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());

            const newPayment: SupplierPayment = {
                ...data,
                date: finalDate.toISOString(),
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            };
            await dbAction('supplierPayments', 'add', newPayment);
             if (data.invoiceId) {
                const invoice = purchaseInvoices.find((inv: PurchaseInvoice) => inv.id === data.invoiceId);
                if (invoice) {
                    const newPaidAmount = (invoice.paidAmount || 0) + data.amount;
                    await dbAction('purchaseInvoices', 'update', { id: data.invoiceId, data: { paidAmount: newPaidAmount } });
                }
            }
            toast({ title: "تم الحفظ بنجاح", description: `رقم السند: ${receiptNumber}` });
        } catch (error) {
            toast({ variant: "destructive", title: "خطأ", description: "فشل الحفظ" });
        }
    };
    
    const isDeletable = (payment: SupplierPayment) => {
        if (!payment.id) return false;
        
        const supplierId = payment.supplierId;
        const paymentDate = new Date(payment.date).getTime();

        const newerPayment = payments.find(p => p.supplierId === supplierId && p.id !== payment.id && new Date(p.date).getTime() > paymentDate);
        if (newerPayment) return false;

        const newerInvoice = purchaseInvoices.find(inv => inv.supplierId === supplierId && new Date(inv.date).getTime() > paymentDate);
        if (newerInvoice) return false;

        return true;
    };

    const handleDelete = async (payment: SupplierPayment) => {
        if (!isDeletable(payment)) {
            toast({ 
                variant: "destructive", 
                title: "لا يمكن الحذف", 
                description: "يوجد عمليات أحدث مسجلة لهذا المورد. يرجى حذف العمليات الأحدث أولاً لضمان دقة الرصيد." 
            });
            return;
        }

        try {
             if (payment.invoiceId) {
                const invoice = purchaseInvoices.find((inv: PurchaseInvoice) => inv.id === payment.invoiceId);
                if (invoice) {
                    const newPaidAmount = (invoice.paidAmount || 0) - payment.amount;
                    await dbAction('purchaseInvoices', 'update', { id: payment.invoiceId, data: { paidAmount: Math.max(0, newPaidAmount) } });
                }
            }
            await dbAction('supplierPayments', 'remove', { id: payment.id! });
            toast({ title: "تم الحذف بنجاح" });
        } catch (error) {
            toast({ variant: "destructive", title: "خطأ", description: "فشل الحذف" });
        }
    };

    const filteredPayments = useMemo(() => {
        return payments.filter((p: any) => {
            const date = new Date(p.date);
            const from = filters.fromDate ? new Date(filters.fromDate) : null;
            const to = filters.toDate ? new Date(filters.toDate) : null;
            if(from) from.setHours(0,0,0,0);
            if(to) to.setHours(23,59,59,999);
            if (from && date < from) return false;
            if (to && date > to) return false;

            if (searchTerm) {
                const suppName = getSupplierName(p.supplierId).toLowerCase();
                const receipt = (p.receiptNumber || "").toLowerCase();
                const searchLower = searchTerm.toLowerCase();
                return suppName.includes(searchLower) || receipt.includes(searchLower);
            }

            return true;
        }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [payments, filters, searchTerm, suppliers]);

    const totalAmount = useMemo(() => {
        return filteredPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    }, [filteredPayments]);


  return (
    <>
      <PageHeader title="مدفوعات الموردين" />
      <main className="flex flex-1 flex-col gap-4 p-2 md:p-6">
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-5 items-start">
            <Card className="lg:col-span-2 shadow-md">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2"><PlusCircle className="text-primary"/>تسجيل سداد لمورد</CardTitle>
                    <CardDescription>سجل المبالغ المدفوعة للموردين لتسوية حساباتهم.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? <div className="flex justify-center py-10"><Loader2 className='animate-spin text-primary' /></div> : (
                        <PaymentForm 
                            onSave={handleSave} 
                            suppliers={suppliers} 
                            cashAccounts={cashAccounts} 
                            purchaseInvoices={purchaseInvoices} 
                            supplierPayments={payments}
                            purchaseReturns={allDataContext.purchaseReturns}
                            warehouses={allDataContext.warehouses}
                        />
                    )}
                </CardContent>
            </Card>
            
            <Card className="lg:col-span-3 shadow-md">
                <CardHeader>
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-lg flex items-center gap-2"><History className="text-primary"/>سجل المدفوعات</CardTitle>
                            {!isMobile && <Badge variant="secondary" className="text-xs">{filteredPayments.length} سند</Badge>}
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="relative">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="بحث بالاسم أو رقم السند..." 
                                    value={searchTerm} 
                                    onChange={e => setSearchTerm(e.target.value)} 
                                    className="pr-9 h-9 text-sm"
                                />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <Input type="date" value={filters.fromDate} onChange={e => setFilters({...filters, fromDate: e.target.value})} className="h-9 text-xs pl-8" />
                                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 relative">
                                    <Input type="date" value={filters.toDate} onChange={e => setFilters({...filters, toDate: e.target.value})} className="h-9 text-xs pl-8" />
                                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 sm:p-6 sm:pt-0">
                    {loading ? (
                        <div className="flex justify-center items-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="w-full">
                            {isMobile ? (
                                <div className="space-y-3 p-3">
                                    {filteredPayments.length > 0 ? filteredPayments.map((payment: SupplierPayment) => (
                                        <Card key={payment.id} className="overflow-hidden border-r-4 border-r-primary shadow-sm">
                                            <CardContent className="p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="space-y-1">
                                                        <div className="font-bold text-base leading-tight">{getSupplierName(payment.supplierId)}</div>
                                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            <Calendar className="h-3 w-3"/>
                                                            {new Date(payment.date).toLocaleDateString('ar-EG')}
                                                            <span className="mx-1">•</span>
                                                            {payment.receiptNumber}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-lg font-black text-primary">{payment.amount.toLocaleString()} <span className="text-[10px]">ج.م</span></div>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center pt-3 border-t">
                                                    <div className="text-[10px] flex items-center gap-1 text-muted-foreground">
                                                        <User className="h-3 w-3"/>
                                                        {payment.createdByName || "غير معروف"}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-[10px] h-6">{getCashAccountName(payment.paidFromAccountId)}</Badge>
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/> تأكيد الحذف</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        {isDeletable(payment) 
                                                                            ? "سيتم حذف هذا السند بشكل نهائي. لا يمكن التراجع عن هذا الإجراء." 
                                                                            : "لا يمكن حذف هذا السند لوجود عمليات أحدث مسجلة لهذا المورد. يرجى حذف العمليات الأحدث أولاً."
                                                                        }
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>{dictionary.general.cancel}</AlertDialogCancel>
                                                                    {isDeletable(payment) && (
                                                                        <AlertDialogAction onClick={() => handleDelete(payment)} className="bg-destructive hover:bg-destructive/90">حذف السند</AlertDialogAction>
                                                                    )}
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )) : <div className="text-center py-20 text-muted-foreground">لا توجد مدفوعات مطابقة.</div>}
                                </div>
                            ) : (
                                <div className="overflow-auto border rounded-lg">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead>التاريخ والمورد</TableHead>
                                                <TableHead>حساب الصرف</TableHead>
                                                <TableHead className="text-center">{dictionary.general.amount}</TableHead>
                                                <TableHead className="text-center w-[80px]">{dictionary.general.actions}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredPayments.length > 0 ? (
                                                filteredPayments.map((payment : SupplierPayment) => (
                                                    <TableRow key={payment.id} className="hover:bg-muted/30">
                                                        <TableCell>
                                                            <div className="font-bold">{getSupplierName(payment.supplierId)}</div>
                                                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                                                <Badge variant="outline" className="text-[9px] px-1 h-4 font-mono">{payment.receiptNumber}</Badge>
                                                                <span>{new Date(payment.date).toLocaleString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-sm font-medium">{getCashAccountName(payment.paidFromAccountId)}</TableCell>
                                                        <TableCell className="text-center font-black text-primary text-base">{payment.amount.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center">
                                                            <AlertDialog>
                                                                <DropdownMenu modal={false}>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button size="icon" variant="ghost" className="h-8 w-8">
                                                                            <MoreHorizontal className="h-4 w-4" />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuLabel>إجراءات السند</DropdownMenuLabel>
                                                                        <AlertDialogTrigger asChild>
                                                                            <DropdownMenuItem className="text-destructive font-semibold" onSelect={(e) => e.preventDefault()}>
                                                                                <Trash2 className="ml-2 h-4 w-4" />
                                                                                {dictionary.general.delete}
                                                                            </DropdownMenuItem>
                                                                        </AlertDialogTrigger>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle className="flex items-center gap-2">
                                                                            {isDeletable(payment) ? <Trash2 className="text-destructive"/> : <AlertTriangle className="text-amber-500"/>}
                                                                            {isDeletable(payment) ? "هل أنت متأكد من الحذف؟" : "تنبيه: لا يمكن الحذف"}
                                                                        </AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            {isDeletable(payment) 
                                                                                ? "هذا الإجراء سيحذف السند بشكل دائم من الدفاتر المالية وسيعيد المديونية لحساب المورد. لا يمكن التراجع عنه." 
                                                                                : "عفواً، لا يمكن حذف هذا السند لوجود عمليات (فواتير أو دفعات) مسجلة لهذا المورد بتاريخ أحدث من هذا السند. لضمان سلامة الأرصدة المتراكمة، يجب حذف العمليات الأحدث أولاً."
                                                                            }
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>{dictionary.general.cancel}</AlertDialogCancel>
                                                                        {isDeletable(payment) && (
                                                                            <AlertDialogAction onClick={() => handleDelete(payment)} className="bg-destructive hover:bg-destructive/90">تأكيد الحذف النهائي</AlertDialogAction>
                                                                        )}
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center py-20 text-muted-foreground italic">لا توجد مدفوعات مسجلة.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
                {filteredPayments.length > 0 && (
                    <CardFooter className="bg-muted/20 border-t p-4 flex justify-between items-center">
                        <span className="text-sm font-bold">إجمالي مدفوعات الفترة:</span>
                        <span className="text-xl font-black text-primary">{totalAmount.toLocaleString()} ج.م</span>
                    </CardFooter>
                )}
            </Card>
        </div>
      </main>
    </>
  );
}
