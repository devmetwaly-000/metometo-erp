

"use client";

import React, { useMemo, useState } from "react";
import PageHeader from "@/components/page-header";
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
import { useData } from "@/contexts/data-provider";
import { Loader2, Printer, Download } from "lucide-react";
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";

// Data Interfaces
interface Customer {
  id: string;
  name: string;
  openingBalance: number;
}
interface SaleInvoice { id: string; customerId: string; total: number; paidAmount?: number; status?: 'pending' | 'approved'; }
interface PosSale { id: string; customerId?: string; total: number; paidAmount?: number; }
interface CustomerPayment { id: string; customerId: string; amount: number; }
interface SalesReturn { id: string; customerId: string; total: number; }

export default function CustomerPurchasesReport() { // Renamed component
  const { customers, salesInvoices, posSales, customerPayments, salesReturns, loading } = useData();

  const reportData = useMemo(() => {
    if (loading) return [];

    return customers.map((customer: Customer) => {
        const approvedSalesInvoices: SaleInvoice[] = salesInvoices.filter((s: SaleInvoice) => s.customerId === customer.id && s.status === 'approved');
        const customerPosSales: PosSale[] = posSales.filter((s: PosSale) => s.customerId === customer.id);
        const filteredPayments: CustomerPayment[] = customerPayments.filter((p: CustomerPayment) => p.customerId === customer.id);
        const filteredReturns: SalesReturn[] = salesReturns.filter((r: SalesReturn) => r.customerId === customer.id);

        const totalSalesValue = approvedSalesInvoices.reduce((acc, s) => acc + s.total, 0) + customerPosSales.reduce((acc, s) => acc + s.total, 0);
        const totalPayments = filteredPayments.reduce((acc, p) => acc + p.amount, 0) 
                            + approvedSalesInvoices.reduce((acc, s) => acc + (s.paidAmount || 0), 0)
                            + customerPosSales.reduce((acc, s) => acc + (s.paidAmount || 0), 0);
      const totalReturns = filteredReturns.reduce((acc, r) => acc + r.total, 0);
      
      const balance = (customer.openingBalance || 0) + totalSalesValue - totalPayments - totalReturns;
      
      if(totalSalesValue === 0 && balance === 0) return null;

      return {
        id: customer.id,
        name: customer.name,
        totalSales: totalSalesValue,
        totalPayments: totalPayments + totalReturns, // payments and returns both reduce the balance
        currentBalance: balance
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null).sort((a: any,b: any) => (b.currentBalance || 0) - (a.currentBalance || 0));

  }, [customers, salesInvoices, posSales, customerPayments, salesReturns, loading]);

  const grandTotals = useMemo(() => {
      return reportData.reduce((acc: any, item: any) => {
          acc.totalSales += item?.totalSales || 0;
          acc.totalPayments += item?.totalPayments || 0;
          acc.currentBalance += item?.currentBalance || 0;
          return acc;
      }, { totalSales: 0, totalPayments: 0, currentBalance: 0});
  }, [reportData]);
  
  const handlePrint = () => window.print();

  const handleExportExcel = () => {
    if (!reportData) return;
    const dataForExport = reportData.map(item => ({
        'العميل': item?.name,
        'إجمالي المبيعات': item?.totalSales,
        'إجمالي المدفوعات والمرتجعات': item?.totalPayments,
        'الرصيد الحالي': item?.currentBalance,
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataForExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales By Customer");
    XLSX.writeFile(workbook, `SalesByCustomer_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <>
      <PageHeader title="تقرير مبيعات العملاء" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card className="printable-area">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>ملخص أرصدة العملاء</CardTitle>
              <CardDescription>عرض لجميع العملاء مع إجمالي مبيعاتهم ومدفوعاتهم ورصيدهم الحالي.</CardDescription>
            </div>
            <div className="flex items-center gap-2 no-print">
               <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!reportData || reportData.length === 0}>
                  <Download className="ml-2 h-4 w-4" /> تصدير Excel
               </Button>
               <Button variant="outline" size="icon" onClick={handlePrint}>
                  <Printer className="h-4 w-4" />
               </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العميل</TableHead>
                      <TableHead className="text-center">إجمالي المبيعات</TableHead>
                      <TableHead className="text-center hidden sm:table-cell">إجمالي المدفوعات والمرتجعات</TableHead>
                      <TableHead className="text-center">الرصيد الحالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.length > 0 ? reportData.map((item: any) => (
                      <TableRow key={item?.id}>
                        <TableCell className="font-medium">{item?.name}</TableCell>
                        <TableCell className="text-center">{item?.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-center hidden sm:table-cell">{item?.totalPayments.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-center font-bold">{item?.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">لا توجد بيانات لعرضها.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                   {reportData.length > 0 && (
                        <TableFooter>
                            <TableRow className="bg-muted font-bold">
                                <TableCell>الإجمالي</TableCell>
                                <TableCell className="text-center">{grandTotals.totalSales.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                <TableCell className="text-center hidden sm:table-cell">{grandTotals.totalPayments.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                <TableCell className="text-center">{grandTotals.currentBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                            </TableRow>
                        </TableFooter>
                    )}
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

    
