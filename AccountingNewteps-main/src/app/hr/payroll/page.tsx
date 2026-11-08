
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Loader2, Calculator, Printer, FileText } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddEntityDialog } from '@/components/add-entity-dialog';
import { useAuth } from '@/contexts/auth-context';
import { useData } from '@/contexts/data-provider';
import { Combobox } from '@/components/ui/combobox';

interface Employee {
  id: string;
  name: string;
  basicSalary: number;
}

interface EmployeeAdvance {
    id: string;
    date: string;
    amount: number;
    employeeId: string;
    paidFromAccountId: string;
}

interface EmployeeAdjustment {
    id: string;
    date: string;
    employeeId: string;
    type: 'reward' | 'penalty';
    amount: number;
}

interface CashAccount {
    id: string;
    name: string;
}

interface PayrollResult {
    employeeId: string;
    employeeName: string;
    basicSalary: number;
    totalAdvances: number;
    totalRewards: number;
    totalPenalties: number;
    netSalary: number;
}

// Balance Calculation dependencies
interface CustomerPayment { amount: number; paidToAccountId: string; }
interface SaleInvoice { paidAmount?: number; paidToAccountId?: string; status?: 'approved'|'pending' }
interface PosSale { warehouseId: string; payments: { method: string, amount: number }[]; paidAmount?: number; total: number; }
interface Expense { amount: number; paidFromAccountId: string; }
interface SupplierPayment { amount: number; paidFromAccountId: string; }
interface TreasuryTransaction { type: 'deposit' | 'withdrawal'; amount: number; accountId: string; }


const PaymentDialogContent = ({ onConfirm, cashAccounts, accountBalances, payrollData, onClose }: { onConfirm: (accountId: string, payrollData: PayrollResult[]) => void, cashAccounts: CashAccount[], accountBalances: Map<string, number>, payrollData: PayrollResult[] | null, onClose: () => void }) => {
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const { toast } = useToast();

    const handleConfirm = () => {
        if (!selectedAccountId) {
            toast({ variant: "destructive", title: "خطأ", description: 'يرجى اختيار حساب الدفع.' });
            return;
        }
        if (payrollData) {
            const totalNetSalary = payrollData.reduce((sum, p) => sum + p.netSalary, 0);
            const accountBalance = accountBalances.get(selectedAccountId) || 0;
            if (accountBalance < totalNetSalary) {
                toast({ variant: "destructive", title: "رصيد غير كافٍ", description: `رصيد الخزينة المحدد (${accountBalance.toLocaleString()}) لا يكفي لصرف الرواتب (${totalNetSalary.toLocaleString()}).` });
                return;
            }
            onConfirm(selectedAccountId, payrollData);
        }
        onClose();
    }

    const accountOptions = useMemo(() => {
        return cashAccounts.map(acc => ({
            value: acc.id,
            label: `${acc.name} (الرصيد: ${(accountBalances.get(acc.id) || 0).toLocaleString()})`
        }));
    }, [cashAccounts, accountBalances]);

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="payment-account">حساب الدفع</Label>
                <Combobox
                    options={accountOptions}
                    value={selectedAccountId}
                    onValueChange={setSelectedAccountId}
                    placeholder="اختر حساب الخزينة/البنك"
                    emptyMessage="لم يتم العثور على حساب."
                />
            </div>
            <div className="flex justify-end">
                <Button onClick={handleConfirm}>تأكيد الصرف</Button>
            </div>
        </div>
    )
}

const usePayrollPageLogic = () => {
    const { employees, employeeAdvances, employeeAdjustments } = useData();
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
    const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
    const [payrollData, setPayrollData] = useState<PayrollResult[] | null>(null);

     const handleCalculatePayroll = () => {
        if (!selectedMonth || !selectedYear) return;

        const year = parseInt(selectedYear);
        const month = parseInt(selectedMonth);

        const results = employees.map(employee => {
            const filterByMonth = (item: { date: string, employeeId: string }) => {
                const itemDate = new Date(item.date);
                return item.employeeId === employee.id &&
                       itemDate.getFullYear() === year &&
                       itemDate.getMonth() + 1 === month;
            }

            const totalAdvances = employeeAdvances
                .filter(filterByMonth)
                .reduce((sum, item) => sum + item.amount, 0);

            const totalRewards = employeeAdjustments
                .filter(item => item.type === 'reward' && filterByMonth(item))
                .reduce((sum, item) => sum + item.amount, 0);

            const totalPenalties = employeeAdjustments
                .filter(item => item.type === 'penalty' && filterByMonth(item))
                .reduce((sum, item) => sum + item.amount, 0);
            
            const netSalary = employee.basicSalary + totalRewards - totalAdvances - totalPenalties;

            return {
                employeeId: employee.id,
                employeeName: employee.name,
                basicSalary: employee.basicSalary,
                totalAdvances: totalAdvances,
                totalRewards: totalRewards,
                totalPenalties: totalPenalties,
                netSalary: netSalary,
            };
        });
        
        setPayrollData(results);
    };

    return { employees, employeeAdvances, employeeAdjustments, selectedMonth, setSelectedMonth, selectedYear, setSelectedYear, payrollData, handleCalculatePayroll, setPayrollData };
}


export default function PayrollPage() {
    const { 
        cashAccounts, 
        dbAction, 
        getNextId, 
        loading,
        customerPayments, salesInvoices, exceptionalIncomes, treasuryTransactions,
        expenses, supplierPayments, employeeAdvances: allAdvances, posSales,
        profitDistributions, payrollRecords
     } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    
    const { selectedMonth, setSelectedMonth, selectedYear, setSelectedYear, payrollData, handleCalculatePayroll, setPayrollData } = usePayrollPageLogic();

    const [isPosting, setIsPosting] = useState(false);
    
    const accountBalances = useMemo(() => {
        const balances = new Map<string, number>();
        cashAccounts.forEach((account: any) => {
            let balance = account.openingBalance || 0;

            customerPayments.filter((p:any) => p.paidToAccountId === account.id).forEach((p:any) => balance += p.amount);
            salesInvoices.filter((s:any) => s.status === 'approved' && s.paidToAccountId === account.id).forEach((s: any) => {
                const linkedPaymentsTotal = customerPayments.filter(p => p.invoiceId === s.id).reduce((sum, p) => sum + p.amount, 0);
                const initialCash = (s.paidAmount || 0) - linkedPaymentsTotal;
                if (initialCash > 0) balance += initialCash;
            });
            posSales.forEach((s: any) => {
                const targetId = s.paidToAccountId || (account.warehouseId && s.warehouseId === account.warehouseId ? account.id : null);
                if (targetId === account.id) {
                    const linkedPaymentsTotal = customerPayments.filter(p => p.invoiceId === s.id).reduce((sum, p) => sum + p.amount, 0);
                    const initialCash = (s.paidAmount || 0) - linkedPaymentsTotal;
                    if (initialCash > 0) balance += initialCash;
                }
            });
            exceptionalIncomes.filter((i:any) => i.paidToAccountId === account.id).forEach((i:any) => balance += i.amount);
            treasuryTransactions.filter((tx: any) => tx.accountId === account.id && tx.type === 'deposit' && !tx.linkedTransaction).forEach((tx: any) => balance += tx.amount);

            expenses.filter((ex: any) => ex.paidFromAccountId === account.id).forEach((ex: any) => balance -= ex.amount);
            supplierPayments.filter((sp: any) => sp.paidFromAccountId === account.id).forEach((sp: any) => balance -= sp.amount);
            allAdvances.filter((ea: any) => ea.paidFromAccountId === account.id).forEach((ea: any) => balance -= ea.amount);
            profitDistributions.filter((pd: any) => pd.paidFromAccountId === account.id).forEach((pd: any) => balance -= pd.amount);
            treasuryTransactions.filter((tx: any) => tx.accountId === account.id && tx.type === 'withdrawal' && !tx.linkedTransaction).forEach((tx: any) => balance -= tx.amount);
            (payrollRecords || []).filter((pr: any) => pr.paidFromAccountId === account.id).forEach((pr: any) => {
                balance -= (pr.payrollData || []).reduce((sum: number, p: any) => sum + p.netSalary, 0);
            });

            balances.set(account.id, balance);
        });
        return balances;
    }, [cashAccounts, customerPayments, salesInvoices, exceptionalIncomes, treasuryTransactions, expenses, supplierPayments, allAdvances, posSales, profitDistributions, payrollRecords]);


    const handlePostJournalEntry = async (accountId: string, payrollDataToPost: PayrollResult[]) => {
        if (!payrollDataToPost) return;
        setIsPosting(true);

        const monthName = months.find(m => m.value === selectedMonth)?.label;
        
        try {
            await dbAction('payrollRecords', 'add', {
                date: new Date(parseInt(selectedYear), parseInt(selectedMonth) -1, 28).toISOString(),
                payrollData: payrollDataToPost,
                paidFromAccountId: accountId,
                month: `${monthName} ${selectedYear}`,
                receiptNumber: `رواتب-${await getNextId('payroll')}`,
                createdById: user?.id,
                createdByName: user?.name,
            });
            
            toast({ title: "تم الترحيل بنجاح", description: "تم إنشاء قيد الرواتب في دفتر اليومية." });
            setPayrollData(null); // Reset the view after posting
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "خطأ", description: "فشل ترحيل قيد الرواتب." });
        } finally {
            setIsPosting(false);
        }
    }


    const handlePrint = () => {
        window.print();
    }

    const totalBasicSalaries = useMemo(() => payrollData?.reduce((sum, p) => sum + p.basicSalary, 0) || 0, [payrollData]);
    const totalAdvances = useMemo(() => payrollData?.reduce((sum, p) => sum + p.totalAdvances, 0) || 0, [payrollData]);
    const totalRewards = useMemo(() => payrollData?.reduce((sum, p) => sum + p.totalRewards, 0) || 0, [payrollData]);
    const totalPenalties = useMemo(() => payrollData?.reduce((sum, p) => sum + p.totalPenalties, 0) || 0, [payrollData]);
    const totalNetSalaries = useMemo(() => payrollData?.reduce((sum, p) => sum + p.netSalary, 0) || 0, [payrollData]);
    
    const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
    const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(0, i).toLocaleString('ar-EG', { month: 'long' }) }));

    return (
    <>
      <PageHeader title="احتساب الرواتب" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card className="no-print">
            <CardHeader>
                <CardTitle>تحديد فترة الرواتب</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="month">الشهر</Label>
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger id="month">
                                <SelectValue placeholder="اختر الشهر" />
                            </SelectTrigger>
                            <SelectContent>
                                {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                         <Label htmlFor="year">السنة</Label>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger id="year">
                                <SelectValue placeholder="اختر السنة" />
                            </SelectTrigger>
                            <SelectContent>
                                {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-end">
                        <Button className="w-full" onClick={handleCalculatePayroll} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin" /> : <Calculator className="ml-2 h-4 w-4" />}
                            احتساب الرواتب
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>

        {payrollData && (
             <Card className="printable-area">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>كشف رواتب شهر {months.find(m => m.value === selectedMonth)?.label} {selectedYear}</CardTitle>
                        <CardDescription>
                            عرض تفصيلي لرواتب الموظفين والخصومات وصافي المستحق.
                        </CardDescription>
                    </div>
                    <div className="flex gap-2 no-print">
                        <Button variant="outline" onClick={handlePrint}>
                            <Printer className="ml-2 h-4 w-4" />
                            طباعة
                        </Button>
                        <AddEntityDialog
                            title="تأكيد صرف الرواتب"
                            description="اختر الحساب الذي سيتم صرف الرواتب منه لتسجيل قيد اليومية."
                            triggerButton={
                                 <Button disabled={isPosting}>
                                    {isPosting ? <Loader2 className="animate-spin ml-2 h-4 w-4"/> : <FileText className="ml-2 h-4 w-4" />}
                                    {isPosting ? 'جارٍ الترحيل...' : 'ترحيل قيد الصرف'}
                                </Button>
                            }
                        >
                            <PaymentDialogContent onConfirm={(accountId) => handlePostJournalEntry(accountId, payrollData)} cashAccounts={cashAccounts} accountBalances={accountBalances} onClose={() => {}} payrollData={payrollData} />
                        </AddEntityDialog>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="w-full overflow-auto border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>اسم الموظف</TableHead>
                                <TableHead className="text-center">الراتب الأساسي</TableHead>
                                <TableHead className="text-center">المكافآت</TableHead>
                                <TableHead className="text-center">السلف</TableHead>
                                <TableHead className="text-center">الجزاءات</TableHead>
                                <TableHead className="text-center">صافي الراتب</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payrollData.map(p => (
                                <TableRow key={p.employeeId}>
                                    <TableCell>{p.employeeName}</TableCell>
                                    <TableCell className="text-center">{p.basicSalary.toLocaleString()} ج.م</TableCell>
                                    <TableCell className="text-center text-green-600">{p.totalRewards > 0 ? `${p.totalRewards.toLocaleString()} ج.م` : '-'}</TableCell>
                                    <TableCell className="text-center text-destructive">{p.totalAdvances > 0 ? `${p.totalAdvances.toLocaleString()} ج.م` : '-'}</TableCell>
                                    <TableCell className="text-center text-destructive">{p.totalPenalties > 0 ? `${p.totalPenalties.toLocaleString()} ج.م` : '-'}</TableCell>
                                    <TableCell className="text-center font-bold text-primary">{p.netSalary.toLocaleString()} ج.م</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="font-bold bg-muted/50">
                                <TableCell>الإجمالي</TableCell>
                                <TableCell className="text-center">{totalBasicSalaries.toLocaleString()} ج.م</TableCell>
                                <TableCell className="text-center text-green-600">{totalRewards.toLocaleString()} ج.م</TableCell>
                                <TableCell className="text-center text-destructive">{totalAdvances.toLocaleString()} ج.م</TableCell>
                                <TableCell className="text-center text-destructive">{totalPenalties.toLocaleString()} ج.م</TableCell>
                                <TableCell className="text-center text-primary">{totalNetSalaries.toLocaleString()} ج.م</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                    </div>
                </CardContent>
            </Card>
        )}
      </main>
    </>
    );
}
