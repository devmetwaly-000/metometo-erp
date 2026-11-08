
"use client";

import React, { useState, useEffect, useMemo } from 'react';
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
import { PlusCircle, Loader2, MoreHorizontal, Trash2, Wallet, AlertTriangle, Search, Calendar, User, History, ArrowRight } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/auth-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from '@/contexts/data-provider';
import { Combobox } from '@/components/ui/combobox';
import { dictionary } from '@/lib/dictionary';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { getGeneralCashAccounts, getRepCashAccount, isRepCustodyAccount } from '@/lib/accounting-utils';

interface CustomerPayment {
    id?: string;
    date: string;
    amount: number;
    customerId: string;
    paidToAccountId: string;
    notes?: string;
    receiptNumber?: string;
    createdById?: string;
    createdByName?: string;
    invoiceId?: string;
}

interface Customer {
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
}

interface Warehouse {
    id: string;
    name: string;
}

interface SaleInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  total: number;
  paidAmount?: number;
  warehouseId?: string;
  salesRepId?: string;
  status?: 'approved' | 'pending' | 'completed' | string;
  date: string;
}

const d = dictionary.pages.customerPayments;

const PaymentForm = ({ onSave, customers, cashAccounts, salesInvoices, warehouses, customerPayments, salesReturns, posSales, posReturns }: { 
    onSave: (data: Omit<CustomerPayment, 'id' | 'receiptNumber'>) => void, 
    customers: Customer[], 
    cashAccounts: CashAccount[], 
    salesInvoices: SaleInvoice[], 
    warehouses: Warehouse[],
    customerPayments: any[],
    salesReturns: any[],
    posSales: any[],
    posReturns: any[]
}) => {
    const [formData, setFormData] = useState<Omit<CustomerPayment, 'id' | 'receiptNumber'>>({ 
        date: new Date().toISOString().split('T')[0], 
        amount: 0, 
        customerId: "", 
        paidToAccountId: "", 
        notes: "",
        invoiceId: "",
    });
    
    const [availableCashAccounts, setAvailableCashAccounts] = useState<CashAccount[]>([]);
    
    const customerOptions = React.useMemo(() => customers.map((c: Customer) => ({ value: c.id, label: c.name })), [customers]);
    
    const cashAccountOptions = React.useMemo(() => {
        return availableCashAccounts.map((c: CashAccount) => {
            const isRep = isRepCustodyAccount(c);
            const warehouse = warehouses.find(w => w.id === c.warehouseId);
            const label = isRep 
                ? `${c.name} (عهدة مندوب)`
                : (warehouse ? `${c.name} (${warehouse.name})` : c.name);
            return { value: c.id, label };
        });
    }, [availableCashAccounts, warehouses]);

    const currentCustomerBalance = useMemo(() => {
        if (!formData.customerId) return 0;
        const customer = customers.find(c => c.id === formData.customerId);
        if (!customer) return 0;

        let balance = Number(customer.openingBalance) || 0;
        
        salesInvoices.filter(inv => inv.customerId === formData.customerId && (inv.status === 'approved' || inv.status === 'completed' || !inv.status))
            .forEach(inv => {
                balance += (Number(inv.total) - Number(inv.paidAmount || 0));
            });

        customerPayments.filter(p => p.customerId === formData.customerId && !p.invoiceId)
            .forEach(p => {
                balance -= Number(p.amount);
            });

        salesReturns.filter(r => r.customerId === formData.customerId)
            .forEach(r => {
                balance -= (Number(r.total) - Number(r.paidAmount || 0));
            });

        return balance;
    }, [formData.customerId, customers, salesInvoices, customerPayments, salesReturns]);

    const customerInvoicesWithBalance = useMemo(() => {
        if (!formData.customerId) return [];
        return salesInvoices.filter((inv: SaleInvoice) => {
            if (inv.customerId !== formData.customerId || (inv.status && inv.status !== 'approved' && inv.status !== 'completed')) return false;
            const remaining = inv.total - (inv.paidAmount || 0);
            return remaining > 0.01;
        });
    }, [formData.customerId, salesInvoices]);

    const selectedInvoiceDetails = useMemo(() => {
        if (!formData.invoiceId) return null;
        return customerInvoicesWithBalance.find((inv: SaleInvoice) => inv.id === formData.invoiceId);
    }, [formData.invoiceId, customerInvoicesWithBalance]);
    
    const invoiceOptions = React.useMemo(() => {
        return customerInvoicesWithBalance.map((inv: SaleInvoice) => ({
            value: inv.id,
            label: `${inv.invoiceNumber} (${d.remaining}: ${(inv.total - (inv.paidAmount || 0)).toLocaleString()})`
        }));
    }, [customerInvoicesWithBalance]);
    
    useEffect(() => {
        const generalAccounts = getGeneralCashAccounts(cashAccounts);
        let filtered: CashAccount[] = [];

        // في حال كانت الفاتورة تابعة لمندوب مبيعات، نتيح عهدة ذلك المندوب تحديداً للاستلام
        const repAccount = selectedInvoiceDetails?.salesRepId 
            ? getRepCashAccount(selectedInvoiceDetails.salesRepId, cashAccounts) 
            : null;

        if (selectedInvoiceDetails?.warehouseId) {
            const branchCashAccount = generalAccounts.find((acc: CashAccount) => acc.warehouseId === selectedInvoiceDetails.warehouseId);
            const baseList = branchCashAccount 
                ? [branchCashAccount, ...generalAccounts.filter(acc => acc.id !== branchCashAccount.id)]
                : generalAccounts;
            filtered = repAccount ? [repAccount, ...baseList] : baseList;
            if (repAccount) {
                setFormData(prev => ({ ...prev, paidToAccountId: repAccount.id }));
            } else if (branchCashAccount) {
                setFormData(prev => ({ ...prev, paidToAccountId: branchCashAccount.id }));
            }
        } else {
            filtered = repAccount ? [repAccount, ...generalAccounts] : generalAccounts;
            if (repAccount) {
                setFormData(prev => ({ ...prev, paidToAccountId: repAccount.id }));
            }
        }
        
        setAvailableCashAccounts(filtered);
    }, [selectedInvoiceDetails, cashAccounts]);


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.paidToAccountId || !formData.customerId || formData.amount <= 0) return;
        onSave({ ...formData, amount: Number(formData.amount) });
        setFormData({ date: new Date().toISOString().split('T')[0], amount: 0, customerId: "", paidToAccountId: "", notes: "", invoiceId: "" });
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4">
                <div className="space-y-2">
                    <Label htmlFor="payment-date">{dictionary.general.date}</Label>
                    <Input id="payment-date" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required/>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="payment-customer">{dictionary.general.customer}</Label>
                    <Combobox
                        options={customerOptions}
                        value={formData.customerId}
                        onValueChange={v => setFormData({...formData, customerId: v, invoiceId: ''})}
                        placeholder={`${dictionary.general.selectPlaceholder} ${dictionary.general.customer}...`}
                        emptyMessage={`${dictionary.general.notFound} ${dictionary.general.customer}.`}
                    />
                    {formData.customerId && (
                        <div className={cn(
                            "flex items-center gap-3 p-4 rounded-xl border animate-in fade-in slide-in-from-top-2 shadow-sm",
                            currentCustomerBalance > 0 ? "bg-destructive/10 border-destructive/20" : "bg-green-500/10 border-green-500/20"
                        )}>
                            <div className={cn(
                                "p-2 rounded-full",
                                currentCustomerBalance > 0 ? "bg-destructive/20" : "bg-green-500/20"
                            )}>
                                <Wallet className={cn("h-5 w-5", currentCustomerBalance > 0 ? "text-destructive" : "text-green-600 dark:text-green-400")} />
                            </div>
                            <div className="flex-1">
                                <span className={cn("text-[10px] font-bold block mb-0.5 uppercase tracking-wider", currentCustomerBalance > 0 ? "text-destructive/80" : "text-green-700 dark:text-green-300")}>
                                    {currentCustomerBalance >= 0 ? "المستحق على العميل:" : "رصيد دائن للعميل:"}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className={cn("text-lg font-black", currentCustomerBalance > 0 ? "text-destructive" : "text-green-700 dark:text-green-400")}>
                                        {Math.abs(currentCustomerBalance).toLocaleString()} ج.م 
                                    </span>
                                </div>
                            </div>
                            {currentCustomerBalance < 0 && <AlertTriangle className="h-5 w-5 text-amber-500" />}
                        </div>
                    )}
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="payment-invoice">{d.linkToInvoice}</Label>
                    <Combobox
                        options={invoiceOptions}
                        value={formData.invoiceId || ''}
                        onValueChange={v => setFormData({...formData, invoiceId: v})}
                        disabled={!formData.customerId || customerInvoicesWithBalance.length === 0}
                        placeholder={!formData.customerId ? d.selectCustomerFirst : d.optionalLink}
                        emptyMessage={d.noDueInvoices}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="paid-to">{d.receivedIn}</Label>
                    <Combobox
                        options={cashAccountOptions}
                        value={formData.paidToAccountId}
                        onValueChange={v => setFormData({...formData, paidToAccountId: v})}
                        placeholder={availableCashAccounts.length === 0 ? "لا توجد خزينة متاحة" : d.selectReceiveAccount}
                        emptyMessage={d.noAccountFound}
                        disabled={availableCashAccounts.length === 0}
                    />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="payment-amount">{dictionary.general.amount}</Label>
                    <Input id="payment-amount" type="number" value={formData.amount || ''} onChange={e => setFormData({...formData, amount: e.target.value as any})} placeholder="0.00" required className="text-lg font-bold" onFocus={e => e.target.select()}/>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="payment-notes">{dictionary.general.notes}</Label>
                    <Textarea id="payment-notes" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder={dictionary.general.optional} className="h-20" />
                </div>
            </div>
            <Button type="submit" disabled={!formData.paidToAccountId || !formData.customerId || formData.amount <= 0} className="w-full h-12 text-base font-bold">
                <PlusCircle className="ml-2 h-5 w-5" />
                {d.savePayment}
            </Button>
        </form>
    );
};

export default function CustomerPaymentsPage() {
    const { 
        customerPayments: payments, 
        customers, 
        cashAccounts, 
        salesInvoices, 
        salesReturns,
        posSales,
        posReturns,
        warehouses,
        dbAction, 
        getNextId, 
        loading 
    } = useData();

    const { toast } = useToast();
    const { user } = useAuth();
    const isMobile = useIsMobile();

    const [searchTerm, setSearchTerm] = useState("");
    const [filters, setFilters] = useState({
        fromDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        toDate: new Date().toISOString().split('T')[0]
    });
    
     const getCustomerName = (customerId: string) => {
        return customers.find((c: Customer) => c.id === customerId)?.name || d.unknownCustomer;
    };

    const getCashAccountName = (accountId: string) => {
        return cashAccounts.find((acc: CashAccount) => acc.id === accountId)?.name || d.unknownUser;
    }

    const handleSave = async (data: Omit<CustomerPayment, 'id' | 'receiptNumber'>) => {
        try {
            const receiptNumber = `س-ع-${await getNextId('customerPayment')}`;
            
            const now = new Date();
            const [year, month, day] = data.date.split('-').map(Number);
            const finalDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());

            const newPayment: CustomerPayment = {
                ...data,
                date: finalDate.toISOString(),
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            };
            await dbAction('customerPayments', 'add', newPayment);
             if (data.invoiceId) {
                const invoice = salesInvoices.find((inv: SaleInvoice) => inv.id === data.invoiceId);
                if (invoice) {
                    const newPaidAmount = (invoice.paidAmount || 0) + data.amount;
                    await dbAction('salesInvoices', 'update', { id: data.invoiceId, data: { paidAmount: newPaidAmount } });
                }
            }
            toast({ title: dictionary.general.success, description: `${dictionary.general.receiptNumber}: ${receiptNumber}` });
        } catch (error) {
            toast({ variant: "destructive", title: dictionary.general.error, description: "فشل الحفظ" });
        }
    };
    
    // Logic to check if this is the absolute latest transaction for the customer
    const isDeletable = (payment: CustomerPayment) => {
        if (!payment.id) return false;
        
        const customerId = payment.customerId;
        const paymentDate = new Date(payment.date).getTime();

        // Check other payments
        const newerPayment = payments.find(p => p.customerId === customerId && p.id !== payment.id && new Date(p.date).getTime() > paymentDate);
        if (newerPayment) return false;

        // Check invoices
        const newerInvoice = salesInvoices.find(inv => inv.customerId === customerId && new Date(inv.date).getTime() > paymentDate);
        if (newerInvoice) return false;

        // Check POS sales
        const newerPosSale = posSales.find(sale => sale.customerId === customerId && new Date(sale.date).getTime() > paymentDate);
        if (newerPosSale) return false;

        // Check Returns
        const newerReturn = [...salesReturns, ...posReturns].find(ret => ret.customerId === customerId && new Date(ret.date).getTime() > paymentDate);
        if (newerReturn) return false;

        return true;
    };

    const handleDelete = async (payment: CustomerPayment) => {
        if (!isDeletable(payment)) {
            toast({ 
                variant: "destructive", 
                title: "لا يمكن الحذف", 
                description: "يوجد عمليات أحدث مسجلة لهذا العميل. يرجى حذف العمليات الأحدث أولاً لضمان دقة الرصيد." 
            });
            return;
        }

        try {
             if (payment.invoiceId) {
                const invoice = salesInvoices.find((inv: SaleInvoice) => inv.id === payment.invoiceId);
                if (invoice) {
                    const newPaidAmount = (invoice.paidAmount || 0) - payment.amount;
                    await dbAction('salesInvoices', 'update', { id: payment.invoiceId, data: { paidAmount: Math.max(0, newPaidAmount) } });
                }
            }
            await dbAction('customerPayments', 'remove', { id: payment.id! });
            toast({ title: dictionary.general.success });
        } catch (error) {
            toast({ variant: "destructive", title: dictionary.general.error, description: "فشل الحذف" });
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
                const custName = getCustomerName(p.customerId).toLowerCase();
                const receipt = (p.receiptNumber || "").toLowerCase();
                const searchLower = searchTerm.toLowerCase();
                return custName.includes(searchLower) || receipt.includes(searchLower);
            }

            return true;
        }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [payments, filters, searchTerm, customers]);

    const totalAmount = useMemo(() => {
        return filteredPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    }, [filteredPayments]);


  return (
    <>
      <PageHeader title={d.title} />
      <main className="flex flex-1 flex-col gap-4 p-2 md:p-6">
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-5 items-start">
            <Card className="lg:col-span-2 shadow-md">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2"><PlusCircle className="text-primary"/>{d.addNewPayment}</CardTitle>
                    <CardDescription>{d.addNewPaymentDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? <div className="flex justify-center py-10"><Loader2 className='animate-spin text-primary' /></div> : (
                        <PaymentForm 
                            onSave={handleSave} 
                            customers={customers} 
                            cashAccounts={cashAccounts} 
                            salesInvoices={salesInvoices} 
                            warehouses={warehouses} 
                            customerPayments={payments}
                            salesReturns={salesReturns}
                            posSales={posSales}
                            posReturns={posReturns}
                        />
                    )}
                </CardContent>
            </Card>
            
            <Card className="lg:col-span-3 shadow-md">
                <CardHeader>
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-lg flex items-center gap-2"><History className="text-primary"/>{d.paymentsLog}</CardTitle>
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
                <CardContent className="p-0 sm:p-6">
                    {loading ? (
                        <div className="flex justify-center items-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="w-full">
                            {isMobile ? (
                                <div className="space-y-3 p-3">
                                    {filteredPayments.length > 0 ? filteredPayments.map((payment: CustomerPayment) => (
                                        <Card key={payment.id} className="overflow-hidden border-r-4 border-r-primary shadow-sm">
                                            <CardContent className="p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="space-y-1">
                                                        <div className="font-bold text-base leading-tight">{getCustomerName(payment.customerId)}</div>
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
                                                        {payment.createdByName || d.unknownUser}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-[10px] h-6">{getCashAccountName(payment.paidToAccountId)}</Badge>
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
                                                                            : "لا يمكن حذف هذا السند لوجود عمليات أحدث مسجلة لهذا العميل. يرجى حذف العمليات الأحدث أولاً."
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
                                    )) : <div className="text-center py-20 text-muted-foreground">لا توجد مقبوضات مطابقة.</div>}
                                </div>
                            ) : (
                                <div className="overflow-auto border rounded-lg">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead>التاريخ والعميل</TableHead>
                                                <TableHead>حساب الاستلام</TableHead>
                                                <TableHead className="text-center">{dictionary.general.amount}</TableHead>
                                                <TableHead className="text-center w-[80px]">{dictionary.general.actions}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredPayments.length > 0 ? (
                                                filteredPayments.map((payment : CustomerPayment) => (
                                                    <TableRow key={payment.id} className="hover:bg-muted/30">
                                                        <TableCell>
                                                            <div className="font-bold">{getCustomerName(payment.customerId)}</div>
                                                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                                                <Badge variant="outline" className="text-[9px] px-1 h-4 font-mono">{payment.receiptNumber}</Badge>
                                                                <span>{new Date(payment.date).toLocaleString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-sm font-medium">{getCashAccountName(payment.paidToAccountId)}</TableCell>
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
                                                                                ? "هذا الإجراء سيحذف السند بشكل دائم من الدفاتر المالية وسيعيد المديونية لحساب العميل. لا يمكن التراجع عنه." 
                                                                                : "عفواً، لا يمكن حذف هذا السند لوجود عمليات (فواتير أو دفعات) مسجلة لهذا العميل بتاريخ أحدث من هذا السند. لضمان سلامة الأرصدة المتراكمة، يجب حذف العمليات الأحدث أولاً."
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
                                                    <TableCell colSpan={4} className="text-center py-20 text-muted-foreground italic">لا توجد مقبوضات مسجلة للفترة المحددة.</TableCell>
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
                        <span className="text-sm font-bold">إجمالي مقبوضات الفترة:</span>
                        <span className="text-xl font-black text-primary">{totalAmount.toLocaleString()} ج.م</span>
                    </CardFooter>
                )}
            </Card>
        </div>
      </main>
    </>
  );
}
