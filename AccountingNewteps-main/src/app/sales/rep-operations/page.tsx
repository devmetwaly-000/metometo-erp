

"use client";

import React, { useMemo, useState } from 'react';
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
import { Loader2, Coins, Package, ShoppingCart, Undo, Banknote } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

// Data Interfaces
interface User {
    id: string;
    name: string;
    isSalesRep?: boolean;
}
interface Item {
    id: string;
    name: string;
}
interface IssueToRep {
    id: string;
    salesRepId: string;
    date: string;
    receiptNumber?: string;
    items: { id: string; qty: number; price: number; }[];
}
interface ReturnFromRep {
    id: string;
    salesRepId: string;
    date: string;
    receiptNumber?: string;
    items: { id: string; qty: number; price: number; }[];
}
interface SaleInvoice {
    id: string;
    salesRepId: string;
    date: string;
    invoiceNumber: string;
    total: number;
    items: { id: string; qty: number; }[];
    status?: 'pending' | 'approved';
    paidAmount?: number;
}
interface RepRemittance {
    id: string;
    userId: string;
    date: string;
    amount: number;
    receiptNumber?: string;
}

export default function RepOperationsPage() {
    const [filters, setFilters] = useState({
        salesRepId: "",
        fromDate: "",
        toDate: "",
    });

    const {
        users,
        items: allItems,
        stockIssuesToReps: issues,
        stockReturnsFromReps: returns,
        salesInvoices: sales,
        repRemittances: remittances,
        loading
    } = useData();
    
    const salesReps = users.filter((u: any) => u.isSalesRep || u.role === 'مندوب' || (u.role && u.role.includes('مندوب')));

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({...prev, [key]: value}));
    };

    const reportData = useMemo(() => {
        if (!filters.salesRepId || loading) return null;

        const filterByDate = (item: { date: string }) => {
            const itemDate = new Date(item.date);
            const start = filters.fromDate ? new Date(filters.fromDate) : null;
            const end = filters.toDate ? new Date(filters.toDate) : null;
            if(start) start.setHours(0,0,0,0);
            if(end) end.setHours(23,59,59,999);
            if (start && itemDate < start) return false;
            if (end && itemDate > end) return false;
            return true;
        };
        
        const itemMovements = new Map<string, { name: string; issued: number; sold: number; returned: number; }>();
        const transactionLog: any[] = [];
        
        allItems.forEach((item: any) => {
            itemMovements.set(item.id, { name: item.name, issued: 0, sold: 0, returned: 0 });
        });

        let totalCollectedByRep = 0;
        let totalSoldByRep = 0;
        
        const approvedSales = sales.filter((s:any) => (s.salesRepId === filters.salesRepId || s.userId === filters.salesRepId) && (s.status === 'approved' || !s.status || s.status === 'completed') && filterByDate(s));

        approvedSales.forEach((sale: SaleInvoice) => {
             transactionLog.push({
                date: sale.date,
                type: 'فاتورة بيع',
                ref: sale.invoiceNumber,
                value: -sale.total,
                isSale: true
            });
            totalSoldByRep += sale.total;
            if(sale.paidAmount) {
                totalCollectedByRep += sale.paidAmount;
                transactionLog.push({
                    date: sale.date,
                    type: 'دفعة على فاتورة',
                    ref: sale.invoiceNumber,
                    value: sale.paidAmount,
                    isPayment: true
                });
            }
            sale.items.forEach(item => {
                const current = itemMovements.get(item.id);
                if (current) {
                    current.sold += item.qty;
                }
            });
        });

        issues.filter((i:any) => i.salesRepId === filters.salesRepId && filterByDate(i)).forEach((issue: IssueToRep) => {
            transactionLog.push({
                date: issue.date,
                type: 'صرف عهدة',
                ref: issue.receiptNumber,
                isIssue: true,
            });
            issue.items.forEach(item => {
                const current = itemMovements.get(item.id);
                if (current) {
                    current.issued += item.qty;
                }
            });
        });

        returns.filter((r:any) => r.salesRepId === filters.salesRepId && filterByDate(r)).forEach((ret: ReturnFromRep) => {
             transactionLog.push({
                date: ret.date,
                type: 'مرتجع عهدة',
                ref: ret.receiptNumber,
                isReturn: true,
            });
            ret.items.forEach(item => {
                const current = itemMovements.get(item.id);
                 if (current) {
                    current.returned += item.qty;
                }
            });
        });
        
        remittances
            .filter((rem: RepRemittance) => ((rem as any).salesRepId === filters.salesRepId || rem.userId === filters.salesRepId) && filterByDate(rem))
            .forEach((rem: RepRemittance) => {
                 transactionLog.push({
                    date: rem.date,
                    type: 'توريد نقدية',
                    ref: rem.receiptNumber,
                    value: rem.amount,
                    isRemittance: true
                });
            });

        const totalRemitted = remittances
            .filter((rem: RepRemittance) => ((rem as any).salesRepId === filters.salesRepId || rem.userId === filters.salesRepId) && filterByDate(rem))
            .reduce((sum, rem) => sum + rem.amount, 0);

        const inventory = Array.from(itemMovements.values())
            .filter(d => d.issued > 0 || d.sold > 0 || d.returned > 0)
            .map(d => ({
                ...d,
                balance: d.issued - d.sold - d.returned,
            }));
        
        return { inventory, totalRemitted, totalSoldValue: totalSoldByRep, totalCollectedValue: totalCollectedByRep, transactionLog: transactionLog.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()) };

    }, [filters, issues, sales, returns, allItems, remittances, loading]);
    

  return (
    <>
      <PageHeader title="مراقبة حركة ومستحقات المندوب" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
            <CardHeader>
                <CardTitle>فلاتر البحث</CardTitle>
                <CardDescription>اختر المندوب والفترة الزمنية لعرض التقرير المفصل.</CardDescription>
            </CardHeader>
            <CardContent>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     <div className="space-y-2">
                        <Label htmlFor="rep">المندوب</Label>
                        <Select value={filters.salesRepId} onValueChange={(v) => handleFilterChange("salesRepId", v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="اختر مندوبًا" />
                            </SelectTrigger>
                            <SelectContent>
                                {salesReps.map((r:any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
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

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>}
        
        {reportData && !loading && (
            <div className="grid gap-6">
            
             <Card>
                <CardHeader>
                    <CardTitle>الملخص المالي للمندوب</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                            <ShoppingCart className="h-6 w-6 text-green-500"/>
                            <span className="font-semibold">إجمالي قيمة المبيعات المعتمدة</span>
                        </div>
                        <span className="font-bold text-lg">{reportData.totalSoldValue.toLocaleString()} ج.م</span>
                    </div>
                     <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                            <Banknote className="h-6 w-6 text-blue-500"/>
                            <span className="font-semibold">إجمالي النقدية الموردة</span>
                        </div>
                        <span className="font-bold text-lg">{reportData.totalRemitted.toLocaleString()} ج.م</span>
                    </div>
                     <div className="flex items-center justify-between p-4 border rounded-lg bg-muted">
                        <div className="flex items-center gap-3">
                            <Coins className="h-6 w-6 text-destructive"/>
                            <span className="font-bold">الرصيد النقدي المستحق على المندوب</span>
                        </div>
                        <span className="font-bold text-xl text-destructive">{(reportData.totalCollectedValue - reportData.totalRemitted).toLocaleString()} ج.م</span>
                    </div>
                </CardContent>
             </Card>

             <div className="grid gap-6 lg:grid-cols-2">
                 <Card>
                    <CardHeader>
                        <CardTitle>تقرير حركة الأصناف</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full overflow-auto border rounded-lg max-h-96">
                            <Table>
                            <TableHeader>
                                <TableRow>
                                <TableHead>الصنف</TableHead>
                                <TableHead className="text-center">مصروف</TableHead>
                                <TableHead className="text-center">مباع</TableHead>
                                <TableHead className="text-center">مرتجع</TableHead>
                                <TableHead className="text-center font-bold">الرصيد</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportData.inventory.length > 0 ? reportData.inventory.map((item) => (
                                <TableRow key={item.name}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell className="text-center">{item.issued > 0 ? item.issued : '-'}</TableCell>
                                    <TableCell className="text-center text-green-600">{item.sold > 0 ? item.sold : '-'}</TableCell>
                                    <TableCell className="text-center text-amber-600">{item.returned > 0 ? item.returned: '-'}</TableCell>
                                    <TableCell className={`text-center font-bold ${item.balance < 0 ? 'text-destructive' : 'text-primary'}`}>{item.balance}</TableCell>
                                </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-10">لا توجد حركات للأصناف.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>سجل العمليات</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full overflow-auto border rounded-lg max-h-96">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead>البيان</TableHead>
                                        <TableHead className="text-center">القيمة</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportData.transactionLog.map((log: any, index: number) => (
                                        <TableRow key={index}>
                                            <TableCell>{new Date(log.date).toLocaleDateString('ar-EG')}</TableCell>
                                            <TableCell>
                                                <Link href={`#`} className="hover:underline text-primary">
                                                    {log.type} ({log.ref})
                                                </Link>
                                            </TableCell>
                                            <TableCell className={`text-center font-semibold ${log.isPayment || log.isRemittance ? 'text-green-600' : log.isSale ? 'text-destructive' : ''}`}>
                                                {log.value ? log.value.toLocaleString() : '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                 </Card>
            </div>
            </div>
        )}

      </main>
    </>
  );
}
