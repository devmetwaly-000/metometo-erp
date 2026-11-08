
"use client";

import React, { useMemo, useState } from "react";
import Link from 'next/link';
import PageHeader from "@/components/page-header";
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
import { Loader2, HandCoins, Search, Save, Wallet, AlertTriangle } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Data Interfaces
interface Customer {
  id: string;
  name: string;
  phone?: string;
  openingBalance?: number;
  creditLimit?: number;
  currentBalance?: number;
}
interface SaleInvoice { id: string; customerId: string; total: number; paidAmount?: number; status?: 'pending' | 'approved' | 'completed' | string; }
interface PosSale { id: string; customerId?: string; total: number; paidAmount?: number; }
interface CustomerPayment { id: string; customerId: string; amount: number; invoiceId?: string; }
interface SalesReturn { id: string; customerId: string; total: number; paidAmount?: number; }
interface PosReturn { id: string; customerId?: string; total: number; paidAmount?: number; }
interface CashAccount { id: string; name: string; userId?: string; salesRepId?: string; }

const QuickPaymentDialog = ({ customer, onSave }: { customer: any, onSave: () => void }) => {
    const { cashAccounts, dbAction, getNextId, warehouses } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const [amount, setAmount] = useState(customer.currentBalance > 0 ? customer.currentBalance : 0);
    const [paidToAccountId, setPaidToAccountId] = useState('');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const cashAccountOptions = useMemo(() => {
        return cashAccounts
            .filter((acc: any) => !acc.userId && !acc.salesRepId) // استبعاد المناديب
            .map((acc: any) => {
                const warehouse = warehouses.find(w => w.id === acc.warehouseId);
                return { 
                    value: acc.id, 
                    label: warehouse ? `${acc.name} (${warehouse.name})` : acc.name 
                };
            });
    }, [cashAccounts, warehouses]);

    const handleSavePayment = async () => {
        if (!amount || amount <= 0 || !paidToAccountId) {
            toast({ variant: 'destructive', title: 'بيانات غير كاملة', description: 'الرجاء إدخل مبلغ صحيح واختيار حساب الاستلام.' });
            return;
        }
        setIsSaving(true);
        try {
            const receiptNumber = `س-ع-${await getNextId('customerPayment')}`;
            
            // تسجيل بالوقت الحالي الفعلي
            const now = new Date();
            
            const newPayment = {
                date: now.toISOString(),
                amount: Number(amount),
                customerId: customer.id,
                paidToAccountId,
                notes: notes || `دفعة سريعة من تقرير مستحقات لدى العملاء`,
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            };
            await dbAction('customerPayments', 'add', newPayment);
            toast({ title: 'تم الحفظ بنجاح', description: `تم استلام دفعة من العميل ${customer.name} برقم: ${receiptNumber}` });
            onSave();
            setIsOpen(false);
        } catch (error) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ الدفعة.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline">سداد دفعة</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>تسجيل دفعة سريعة: {customer.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="bg-muted p-4 rounded-lg flex justify-between items-center border">
                        <span className="text-sm font-semibold">المستحق الحالي:</span>
                        <span className="text-xl font-bold text-destructive">{customer.currentBalance.toLocaleString()} ج.م</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="amount">المبلغ المستلم</Label>
                            <Input id="amount" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="text-lg font-bold" onFocus={e => e.target.select()} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="account">إيداع في (الخزينة/البنك)</Label>
                            <Combobox
                                options={cashAccountOptions}
                                value={paidToAccountId}
                                onValueChange={setPaidToAccountId}
                                placeholder="اختر حساب الاستلام..."
                                emptyMessage="لا يوجد خزائن متاحة."
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notes">ملاحظات</Label>
                        <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="أدخل أي ملاحظات إضافية..." />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsOpen(false)}>إلغاء</Button>
                    <Button onClick={handleSavePayment} disabled={isSaving || !paidToAccountId || amount <= 0}>
                        {isSaving ? <Loader2 className="animate-spin ml-2 h-4 w-4" /> : <Save className="ml-2 h-4 w-4" />}
                        تأكيد وحفظ الدفعة
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default function CustomerReceivablesReport() {
    const { customers, salesInvoices, customerPayments, salesReturns, loading } = useData();
    const isMobile = useIsMobile();
    const [searchTerm, setSearchTerm] = useState("");
    
    const customersWithBalance = useMemo(() => {
        if (loading) return [];
        
        return customers.map((customer: Customer) => {
            let balance = Number(customer.openingBalance) || 0;
            
            const approvedSales = salesInvoices.filter((s: SaleInvoice) => s.customerId === customer.id && (s.status === 'approved' || s.status === 'completed' || !s.status));
            approvedSales.forEach((inv: SaleInvoice) => { 
                balance += (Number(inv.total) - Number(inv.paidAmount || 0)); 
            });

            const standalonePayments = customerPayments.filter((p: CustomerPayment) => p.customerId === customer.id && !p.invoiceId);
            standalonePayments.forEach((payment: CustomerPayment) => { 
                balance -= Number(payment.amount); 
            });

            const returns = salesReturns.filter((r: SalesReturn) => r.customerId === customer.id);
            returns.forEach((ret: SalesReturn) => { 
                balance -= (Number(ret.total) - Number(ret.paidAmount || 0)); 
            });

            const invoiceCount = approvedSales.length;
            
            return { ...customer, currentBalance: balance, invoiceCount };
        }).filter((c: any) => c.currentBalance > 0.01);
    }, [customers, salesInvoices, customerPayments, salesReturns, loading]);

    const filteredCustomers = useMemo(() => {
        if (!searchTerm) {
            return customersWithBalance;
        }
        return customersWithBalance.filter(customer => 
            customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (customer.phone && customer.phone.includes(searchTerm))
        );
    }, [customersWithBalance, searchTerm]);


    const totalReceivables = useMemo(() => {
        return filteredCustomers.reduce((acc: number, customer: any) => acc + customer.currentBalance, 0);
    }, [filteredCustomers]);

    const topCustomers = useMemo(() => {
        return [...filteredCustomers]
            .sort((a: any, b: any) => b.currentBalance - a.currentBalance)
            .slice(0, 10);
    }, [filteredCustomers]);
    
    const handlePaymentSaved = () => {};

  return (
    <>
      <PageHeader title="مستحقات لدى العملاء" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 flex flex-col gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">إجمالي المستحقات</CardTitle>
                        <HandCoins className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                    {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : (
                        <>
                        <div className="text-2xl font-bold">{totalReceivables.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</div>
                        <p className="text-xs text-muted-foreground">
                            إجمالي المبالغ المستحقة للشركة طرف العملاء
                        </p>
                        </>
                    )}
                    </CardContent>
                </Card>

                <Card className="flex-1">
                    <CardHeader>
                        <CardTitle>أعلى 10 عملاء مديونية</CardTitle>
                    </CardHeader>
                    <CardContent className="w-full">
                    {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto"/> : (
                        <div className="w-full h-[300px]">
                            <ChartContainer config={{}} className="w-full h-full">
                                <BarChart data={topCustomers} layout="vertical" margin={{ right: 20 }}>
                                    <CartesianGrid horizontal={false} />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={10}
                                        width={isMobile ? 0 : 120}
                                        tick={!isMobile}
                                    />
                                    <XAxis type="number" hide />
                                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                    <Bar dataKey="currentBalance" name="المستحق" fill="hsl(var(--primary))" radius={5}>
                                        <LabelList position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(v: number) => v.toLocaleString()} />
                                    </Bar>
                                </BarChart>
                            </ChartContainer>
                        </div>
                    )}
                    </CardContent>
                </Card>
            </div>

            <Card className="flex-1 lg:flex-[2]">
                <CardHeader>
                    <CardTitle>كشف الذمم المدينة</CardTitle>
                    <CardDescription>
                         <div className="relative mt-2">
                          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="بحث بالاسم أو رقم الهاتف..." className="pr-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto"/> : (
                        <div className="w-full overflow-auto">
                            <Table>
                                <TableHeader>
                                <TableRow>
                                    <TableHead>اسم العميل</TableHead>
                                    <TableHead className="hidden sm:table-cell">رقم الموبايل</TableHead>
                                    <TableHead className="text-center">عدد الفواتير</TableHead>
                                    <TableHead className="text-center">المبلغ المستحق</TableHead>
                                    <TableHead className="text-center">الإجراء</TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {filteredCustomers.map((customer: any) => (
                                    <TableRow key={customer.id}>
                                    <TableCell>
                                        <Link href={`/reports/customer-statement?customerId=${customer.id}`} className="font-medium text-primary hover:underline">
                                            {customer.name}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell">{customer.phone || 'غير مسجل'}</TableCell>
                                    <TableCell className="text-center">{customer.invoiceCount}</TableCell>
                                    <TableCell className="text-center font-bold text-destructive">{customer.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-center">
                                       <QuickPaymentDialog customer={customer} onSave={handlePaymentSaved} />
                                    </TableCell>
                                    </TableRow>
                                ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
      </main>
    </>
  );
}
