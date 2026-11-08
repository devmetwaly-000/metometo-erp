
"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2, Printer } from "lucide-react";
import React, { useState, useEffect, useCallback } from "react";
import { Combobox } from "@/components/ui/combobox";
import { useSearchParams } from "next/navigation";
import Link from 'next/link';
import { getLinkForReceipt } from "@/lib/utils";

interface SaleInvoice {
  id: string;
  invoiceNumber?: string;
  date: string;
  customerId: string;
  total: number;
  paidAmount?: number;
  status?: 'pending' | 'approved' | 'completed' | string;
}

interface PosSale {
  id: string;
  invoiceNumber?: string;
  date: string;
  customerId?: string;
  total: number;
  paidAmount?: number;
}

interface SalesReturn {
    id: string;
    receiptNumber?: string;
    date: string;
    customerId: string;
    total: number;
    paidAmount?: number;
}

interface Customer {
  id:string;
  name: string;
  openingBalance: number;
}

interface CustomerPayment {
    id: string;
    receiptNumber?: string;
    date: string;
    customerId: string;
    amount: number;
    notes?: string;
    invoiceId?: string;
}

export default function CustomerStatementPage() {
  const searchParams = useSearchParams();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [reportData, setReportData] = useState<any[] | null>(null);

  const { customers, salesInvoices, customerPayments, salesReturns, loading } = useData();
  
  const customerOptions = React.useMemo(() => customers.map((c: Customer) => ({ value: c.id, label: c.name })), [customers]);

   useEffect(() => {
    const customerIdFromQuery = searchParams.get('customerId');
    if (customerIdFromQuery) {
      setSelectedCustomerId(customerIdFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
      if (selectedCustomerId) {
          handleGenerateReport();
      } else {
          setReportData(null);
      }
  }, [selectedCustomerId, fromDate, toDate, customers, salesInvoices, customerPayments, salesReturns]);
  
  const handleGenerateReport = useCallback(() => {
    if (!selectedCustomerId) {
      return;
    }

    const customer = customers.find((c: Customer) => c.id === selectedCustomerId);
    if (!customer) return;

    const allTransactions: any[] = [];

    // 1. الرصيد الافتتاحي
    allTransactions.push({
      date: new Date(0),
      sortDate: new Date(0),
      description: 'رصيد أول المدة',
      ref: '#',
      debit: Number(customer.openingBalance) || 0,
      credit: 0,
    });
    
    // 2. فواتير المبيعات المعتمدة
    salesInvoices
      .filter((s: SaleInvoice) => s.customerId === selectedCustomerId && (s.status === 'approved' || s.status === 'completed' || !s.status))
      .forEach((sale: SaleInvoice) => {
        allTransactions.push({
            date: new Date(sale.date),
            sortDate: new Date(sale.date),
            description: `فاتورة بيع رقم ${sale.invoiceNumber}`,
            ref: getLinkForReceipt(sale.invoiceNumber, sale.id, 'sales_invoices'),
            debit: Number(sale.total),
            credit: 0,
        });

        // حساب الدفعة النقدية الأولية (التي تمت عند إنشاء الفاتورة ولم تسجل كسند منفصل)
        const linkedPaymentsTotal = customerPayments
            .filter((p: CustomerPayment) => p.invoiceId === sale.id)
            .reduce((sum, p) => sum + Number(p.amount), 0);
        
        const initialCash = Number(sale.paidAmount || 0) - linkedPaymentsTotal;
        if (initialCash > 0.01) {
            allTransactions.push({
                date: new Date(sale.date),
                sortDate: new Date(sale.date),
                description: `دفعة نقدية عند استلام فاتورة ${sale.invoiceNumber}`,
                ref: getLinkForReceipt(sale.invoiceNumber, sale.id, 'sales_invoices'),
                debit: 0,
                credit: initialCash,
            });
        }
    });
    
    // 3. المرتجعات
    salesReturns
        .filter((sr: SalesReturn) => sr.customerId === selectedCustomerId)
        .forEach((sr: SalesReturn) => {
            // Credit: The item value returned
            allTransactions.push({
                date: new Date(sr.date),
                sortDate: new Date(sr.date),
                description: `مرتجع مبيعات رقم ${sr.receiptNumber}`,
                ref: getLinkForReceipt(sr.receiptNumber, sr.id, 'sales_returns'),
                debit: 0,
                credit: Number(sr.total),
            });
            
            // Debit: If cash was given back, it offsets the credit
            if (sr.paidAmount && sr.paidAmount > 0) {
                allTransactions.push({
                    date: new Date(sr.date),
                    sortDate: new Date(sr.date),
                    description: `رد نقدي لمرتجع مبيعات رقم ${sr.receiptNumber}`,
                    ref: getLinkForReceipt(sr.receiptNumber, sr.id, 'sales_returns'),
                    debit: Number(sr.paidAmount),
                    credit: 0,
                });
            }
        });

    // 4. سندات القبض (المدفوعات)
    customerPayments
      .filter((p: CustomerPayment) => p.customerId === selectedCustomerId)
      .forEach((payment: CustomerPayment) => {
          allTransactions.push({
              date: new Date(payment.date),
              sortDate: new Date(payment.date),
              description: `سند قبض رقم ${payment.receiptNumber} ${payment.notes ? `(${payment.notes})` : ''}`,
              ref: getLinkForReceipt(payment.receiptNumber, payment.id, 'customer_payments'),
              debit: 0,
              credit: Number(payment.amount),
          });
      });

    // التصفية وحساب الرصيد الافتتاحي لما قبل الفترة
    const start = fromDate ? new Date(fromDate) : null;
    const end = toDate ? new Date(toDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    let periodOpeningDebit = Number(customer.openingBalance) || 0;
    let periodOpeningCredit = 0;
    const inRangeTransactions: any[] = [];

    allTransactions.forEach(tx => {
        if (tx.sortDate.getTime() === new Date(0).getTime()) return;
        
        if (start && tx.sortDate < start) {
            periodOpeningDebit += tx.debit;
            periodOpeningCredit += tx.credit;
        } else if (!end || tx.sortDate <= end) {
            inRangeTransactions.push(tx);
        }
    });

    inRangeTransactions.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

    const netOpening = periodOpeningDebit - periodOpeningCredit;
    const openingEntry = {
        date: 'رصيد افتتاحي',
        sortDate: new Date(0),
        description: fromDate ? 'رصيد ما قبل الفترة' : 'رصيد أول المدة',
        ref: '#',
        debit: netOpening >= 0 ? netOpening : 0,
        credit: netOpening < 0 ? Math.abs(netOpening) : 0,
        balance: netOpening
    };

    let runningBalance = netOpening;
    const finalReport = [
        openingEntry,
        ...inRangeTransactions.map(tx => {
            runningBalance = runningBalance + tx.debit - tx.credit;
            return {
                ...tx,
                date: tx.date.toLocaleString('ar-EG'),
                balance: runningBalance
            };
        })
    ];

    setReportData(finalReport);
  }, [selectedCustomerId, fromDate, toDate, customers, salesInvoices, customerPayments, salesReturns]);
  
  const handlePrint = () => {
    window.print();
  };
  
  const getSelectedCustomer = () => customers.find((c: Customer) => c.id === selectedCustomerId);

  return (
    <>
      <PageHeader title="كشف حساب العملاء" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card className="no-print">
            <CardHeader>
                <CardTitle>تحديد العميل والفترة</CardTitle>
                <CardDescription>اختر العميل والفترة الزمنية لعرض كشف الحساب.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center items-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="mr-2">جارٍ تحميل البيانات...</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="customer">العميل</Label>
                            <Combobox
                                options={customerOptions}
                                value={selectedCustomerId}
                                onValueChange={setSelectedCustomerId}
                                placeholder="اختر عميلاً..."
                                emptyMessage="لم يتم العثور على العميل."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="from-date">من تاريخ</Label>
                            <Input id="from-date" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="to-date">إلى تاريخ</Label>
                            <Input id="to-date" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>

        {reportData && (
            <Card className="printable-area">
            <CardHeader className="flex flex-row items-center justify-between border-b mb-4 pb-4">
                <div>
                    <CardTitle>كشف حساب العميل: {getSelectedCustomer()?.name}</CardTitle>
                    <CardDescription>
                        عرض مفصل لمعاملات العميل من {fromDate ? new Date(fromDate).toLocaleDateString('ar-EG') : 'البداية'} إلى {toDate ? new Date(toDate).toLocaleDateString('ar-EG') : 'النهاية'}.
                    </CardDescription>
                </div>
                <Button variant="outline" size="icon" onClick={handlePrint} className="no-print">
                    <Printer className="h-4 w-4" />
                    <span className="sr-only">طباعة</span>
                </Button>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>التاريخ</TableHead>
                            <TableHead>البيان</TableHead>
                            <TableHead className="text-center">مدين (فواتير ونقدي خارج)</TableHead>
                            <TableHead className="text-center">دائن (دفعات ومرتجعات)</TableHead>
                            <TableHead className="text-center">الرصيد</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {reportData.map((tx, index) => (
                            <TableRow key={index}>
                                <TableCell>{tx.date}</TableCell>
                                <TableCell>
                                     <Link href={tx.ref} className="hover:underline hover:text-primary">
                                        {tx.description}
                                    </Link>
                                </TableCell>
                                <TableCell className="text-center">{tx.debit > 0 ? tx.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</TableCell>
                                <TableCell className="text-center">{tx.credit > 0 ? tx.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</TableCell>
                                <TableCell className="text-center font-medium">{tx.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="bg-muted/50 font-bold text-base">
                            <TableCell colSpan={4}>الرصيد النهائي</TableCell>
                            <TableCell className="text-center">{reportData.at(-1)?.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
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
