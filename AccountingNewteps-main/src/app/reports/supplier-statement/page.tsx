
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
import { useSearchParams } from 'next/navigation';


interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  supplierId: string;
  total: number;
  paidAmount?: number;
}

interface PurchaseReturn {
    id: string;
    receiptNumber?: string;
    date: string;
    supplierId: string;
    total: number;
    paidAmount?: number;
}

interface SupplierPayment {
    id: string;
    receiptNumber?: string;
    date: string;
    supplierId: string;
    amount: number;
    notes?: string;
    invoiceId?: string;
}

interface Supplier {
  id: string;
  name: string;
  openingBalance: number;
}

export default function SupplierStatementPage() {
  const searchParams = useSearchParams();
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [reportData, setReportData] = useState<any[] | null>(null);

  const { 
    suppliers, 
    purchaseInvoices, 
    supplierPayments, 
    purchaseReturns, 
    loading 
  } = useData();
  
  const supplierOptions = React.useMemo(() => suppliers.map((s: Supplier) => ({ value: s.id, label: s.name })), [suppliers]);

  // Effect to read query params on initial load
  useEffect(() => {
    const supplierIdFromQuery = searchParams.get('supplierId');
    const toDateFromQuery = searchParams.get('toDate');

    if (supplierIdFromQuery) {
      setSelectedSupplierId(supplierIdFromQuery);
    }
    if (toDateFromQuery) {
        const date = new Date(toDateFromQuery).toISOString().split('T')[0];
        setToDate(date);
    }
  }, [searchParams]);

  const handleGenerateReport = useCallback(() => {
    if (!selectedSupplierId) return;

    const supplier = suppliers.find((s: Supplier) => s.id === selectedSupplierId);
    if (!supplier) return;

    const allTransactions: any[] = [];

    // 1. الرصيد الافتتاحي
    allTransactions.push({
      date: new Date(0),
      sortDate: new Date(0),
      description: 'رصيد أول المدة',
      debit: 0, 
      credit: Number(supplier.openingBalance) || 0,
    });
    
    // 2. فواتير الشراء
    purchaseInvoices
      .filter((p: PurchaseInvoice) => p.supplierId === selectedSupplierId)
      .forEach((purchase: PurchaseInvoice) => {
        allTransactions.push({
            date: new Date(purchase.date),
            sortDate: new Date(purchase.date),
            description: `فاتورة شراء رقم ${purchase.invoiceNumber}`,
            debit: 0,
            credit: Number(purchase.total)
        });

        // النقدية المسددة وقت الفاتورة (التي لم تسجل كسند منفصل)
        const linkedPaymentsTotal = supplierPayments
            .filter((p: SupplierPayment) => p.invoiceId === purchase.id)
            .reduce((sum, p) => sum + Number(p.amount), 0);
        
        const initialCash = Number(purchase.paidAmount || 0) - linkedPaymentsTotal;
        if (initialCash > 0.01) {
            allTransactions.push({
                date: new Date(purchase.date),
                sortDate: new Date(purchase.date),
                description: `دفعة نقدية مسددة للفاتورة ${purchase.invoiceNumber}`,
                debit: initialCash,
                credit: 0,
            });
        }
      });

    // 3. المرتجعات
    purchaseReturns
        .filter((pr: PurchaseReturn) => pr.supplierId === selectedSupplierId)
        .forEach((pr: PurchaseReturn) => {
            // Debit: The item value returned (reduces debt)
            allTransactions.push({
                date: new Date(pr.date),
                sortDate: new Date(pr.date),
                description: `مرتجع مشتريات رقم ${pr.receiptNumber}`,
                debit: Number(pr.total),
                credit: 0,
            });
            
            // Credit: If cash was received back, it offsets the debit
            if (pr.paidAmount && pr.paidAmount > 0) {
                allTransactions.push({
                    date: new Date(pr.date),
                    sortDate: new Date(pr.date),
                    description: `استلام نقدي لمرتجع مشتريات رقم ${pr.receiptNumber}`,
                    debit: 0,
                    credit: Number(pr.paidAmount),
                });
            }
        });
      
    // 4. سندات الصرف (المدفوعات)
    supplierPayments
      .filter((p: SupplierPayment) => p.supplierId === selectedSupplierId)
      .forEach((payment: SupplierPayment) => {
        allTransactions.push({
            date: new Date(payment.date),
            sortDate: new Date(payment.date),
            description: `سند صرف رقم ${payment.receiptNumber} ${payment.notes ? `(${payment.notes})` : ''}`,
            debit: Number(payment.amount),
            credit: 0
        });
      });

    // التصفية وحساب الرصيد الافتتاحي لما قبل الفترة
    const start = fromDate ? new Date(fromDate) : null;
    const end = toDate ? new Date(toDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    let periodOpeningCredit = Number(supplier.openingBalance) || 0;
    let periodOpeningDebit = 0;
    const inRangeTransactions: any[] = [];

    allTransactions.forEach(tx => {
        if (tx.sortDate.getTime() === new Date(0).getTime()) return;
        
        if (start && tx.sortDate < start) {
            periodOpeningCredit += tx.credit;
            periodOpeningDebit += tx.debit;
        } else if (!end || tx.sortDate <= end) {
            inRangeTransactions.push(tx);
        }
    });

    inRangeTransactions.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

    const netOpening = periodOpeningCredit - periodOpeningDebit;
    const openingEntry = {
        date: 'رصيد افتتاحي',
        sortDate: new Date(0),
        description: fromDate ? 'رصيد ما قبل الفترة' : 'رصيد أول المدة',
        debit: netOpening < 0 ? Math.abs(netOpening) : 0,
        credit: netOpening >= 0 ? netOpening : 0,
        balance: netOpening
    };

    let runningBalance = netOpening;
    const finalReport = [
        openingEntry,
        ...inRangeTransactions.map(tx => {
            runningBalance = runningBalance + tx.credit - tx.debit;
            return {
                ...tx,
                date: tx.date.toLocaleDateString('ar-EG'),
                balance: runningBalance
            };
        })
    ];

    setReportData(finalReport);
  }, [selectedSupplierId, fromDate, toDate, suppliers, purchaseInvoices, supplierPayments, purchaseReturns]);

  useEffect(() => {
      if (selectedSupplierId) {
          handleGenerateReport();
      } else {
          setReportData(null);
      }
  }, [selectedSupplierId, fromDate, toDate, handleGenerateReport]);

  const handlePrint = () => {
    window.print();
  };
  
  return (
    <>
      <PageHeader title="كشف حساب الموردين" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card className="no-print">
            <CardHeader>
                <CardTitle>تحديد المورد والفترة</CardTitle>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <Loader2 className="animate-spin" />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="supplier">المورد</Label>
                            <Combobox
                                options={supplierOptions}
                                value={selectedSupplierId}
                                onValueChange={setSelectedSupplierId}
                                placeholder="اختر موردًا..."
                                emptyMessage="لم يتم العثور على مورد."
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
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4 mb-4">
                <div>
                    <CardTitle>كشف الحساب لـ: {suppliers.find((s: Supplier) => s.id === selectedSupplierId)?.name}</CardTitle>
                    <CardDescription>
                        عرض مفصل لمعاملات المورد من {fromDate || 'البداية'} إلى {toDate || 'النهاية'}.
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
                            <TableHead className="text-center">مدين (مدفوعات ومرتجعات)</TableHead>
                            <TableHead className="text-center">دائن (مشتريات ونقدي خارج)</TableHead>
                            <TableHead className="text-center">الرصيد</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {reportData.map((tx, index) => (
                            <TableRow key={index}>
                                <TableCell>{tx.date}</TableCell>
                                <TableCell>{tx.description}</TableCell>
                                <TableCell className="text-center">{tx.debit > 0 ? tx.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</TableCell>
                                <TableCell className="text-center">{tx.credit > 0 ? tx.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</TableCell>
                                <TableCell className="text-center font-medium">{tx.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="bg-muted/50 font-bold">
                            <TableCell colSpan={4} className="text-base">الرصيد النهائي (مستحق للمورد)</TableCell>
                            <TableCell className="text-center text-base">{reportData.at(-1)?.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
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
