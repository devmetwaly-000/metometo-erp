
"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2, Printer, Info } from "lucide-react";
import React, { useState, useMemo, useEffect } from "react";

// Data interfaces
interface SaleInvoice { id: string; date: string; total: number; subtotal: number; discount: number; items: { id: string, qty: number, cost?: number}[], warehouseId: string; status?: string; }
interface PosSale { id: string; date: string; total: number; subtotal: number; discount: number; items: { id: string, qty: number, cost?: number}[], warehouseId: string; }
interface Expense { id: string; date: string; amount: number; warehouseId?: string; expenseType: string; }
interface ExceptionalIncome { id: string; date: string; amount: number; warehouseId?: string; description: string; }
interface Partner { id: string; name: string; capital: number; profitShare: number; warehouseId: string; startDate: string; endDate: string; }
interface Item { id: string; cost?: number; itemType?: 'manufactured' | 'standard' | 'raw_material'; components?: {itemId: string, quantity: number}[] }


interface ReportResult {
    id: string;
    name: string;
    capital: number;
    profitSharePercentage: number;
    profitShareValue: number;
}

export default function PartnerSharesPage() {
    const [fromDate, setFromDate] = useState<string>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [toDate, setToDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [reportData, setReportData] = useState<ReportResult[] | null>(null);
    const [netIncome, setNetIncome] = useState<number | null>(null);

    const { 
        partners,
        salesInvoices,
        posSales,
        expenses,
        exceptionalIncomes,
        items,
        loading
    } = useData();

    const handleGenerateReport = () => {
        if (loading) return;

        const start = fromDate ? new Date(fromDate) : new Date(0);
        start.setHours(0, 0, 0, 0);
        const end = toDate ? new Date(toDate) : new Date();
        end.setHours(23, 59, 59, 999);

        // 1. Calculate Daily Net Profit per Warehouse
        const dailyProfitsByWarehouse: Record<string, Record<string, number>> = {};
        
        const allSales = [
            ...salesInvoices.filter((s: SaleInvoice) => s.status === 'approved'), 
            ...posSales
        ];

        allSales.forEach((sale: any) => {
            const saleDate = new Date(sale.date);
            if (saleDate < start || saleDate > end) return;
            
            const dateKey = saleDate.toISOString().split('T')[0];
            const warehouseId = sale.warehouseId || 'general';

            if (!dailyProfitsByWarehouse[warehouseId]) dailyProfitsByWarehouse[warehouseId] = {};
            if (!dailyProfitsByWarehouse[warehouseId][dateKey]) dailyProfitsByWarehouse[warehouseId][dateKey] = 0;

            const revenue = sale.subtotal || (sale.total + (sale.discount || 0));
            const cogs = sale.items.reduce((acc: number, saleItem: any) => {
                const masterItem = items.find((i: Item) => i.id === saleItem.id);
                if (!masterItem) return acc;

                let itemCost = saleItem.cost || masterItem.cost || 0;
                
                if (masterItem.itemType === 'manufactured' && masterItem.components) {
                    itemCost = masterItem.components.reduce((compAcc: number, comp: any) => {
                         const componentItem = items.find((i: Item) => i.id === comp.itemId);
                         return compAcc + (comp.quantity * (componentItem?.cost || 0));
                    }, 0);
                }

                return acc + (saleItem.qty * itemCost);
            }, 0);
            
            const profit = revenue - cogs - (sale.discount || 0);
            dailyProfitsByWarehouse[warehouseId][dateKey] += profit;
        });

        expenses.forEach((expense: Expense) => {
            const expenseDate = new Date(expense.date);
            if (expenseDate < start || expenseDate > end) return;
            const dateKey = expenseDate.toISOString().split('T')[0];
            const warehouseId = expense.warehouseId || 'general';
            
            if (!dailyProfitsByWarehouse[warehouseId]) dailyProfitsByWarehouse[warehouseId] = {};
            if (!dailyProfitsByWarehouse[warehouseId][dateKey]) dailyProfitsByWarehouse[warehouseId][dateKey] = 0;
            dailyProfitsByWarehouse[warehouseId][dateKey] -= expense.amount;
        });
        
        exceptionalIncomes.forEach((income: ExceptionalIncome) => {
            const incomeDate = new Date(income.date);
            if (incomeDate < start || incomeDate > end) return;
            const dateKey = incomeDate.toISOString().split('T')[0];
            const warehouseId = income.warehouseId || 'general';
            
            if (!dailyProfitsByWarehouse[warehouseId]) dailyProfitsByWarehouse[warehouseId] = {};
            if (!dailyProfitsByWarehouse[warehouseId][dateKey]) dailyProfitsByWarehouse[warehouseId][dateKey] = 0;
            dailyProfitsByWarehouse[warehouseId][dateKey] += income.amount;
        });

        // 2. Distribute Profits Daily based on Partnership Periods
        const partnerShares: Record<string, number> = {};
        partners.forEach((p: Partner) => partnerShares[p.id] = 0);
        
        // Loop through each warehouse that has profit data
        Object.entries(dailyProfitsByWarehouse).forEach(([warehouseId, dailyData]) => {
            // Find partners assigned to this warehouse
            const relevantPartners = partners.filter((p: Partner) => p.warehouseId === warehouseId);
            
            // Loop through each day's profit
            Object.entries(dailyData).forEach(([dateKey, profit]) => {
                const currentDate = new Date(dateKey);
                
                // Find partners whose period covers this date
                const activePartnersForDay = relevantPartners.filter((p: Partner) => {
                    const partnerStart = new Date(p.startDate);
                    const partnerEnd = new Date(p.endDate);
                    // Ensure start is beginning of day and end is end of day for comparison
                    partnerStart.setHours(0,0,0,0);
                    partnerEnd.setHours(23,59,59,999);
                    return currentDate >= partnerStart && currentDate <= partnerEnd;
                });

                // Add to each active partner's share
                activePartnersForDay.forEach((partner: Partner) => {
                    partnerShares[partner.id] += profit * (partner.profitShare / 100);
                });
            });
        });
        
        // 3. Calculate total net income for the display summary
        let totalIncomeCalc = 0;
        Object.values(dailyProfitsByWarehouse).forEach(whData => {
            Object.values(whData).forEach(p => totalIncomeCalc += p);
        });
        setNetIncome(totalIncomeCalc);

        // 4. Map results for display
        const results = partners.map((partner: Partner) => {
            return {
                id: partner.id,
                name: partner.name,
                capital: partner.capital,
                profitSharePercentage: partner.profitShare,
                profitShareValue: partnerShares[partner.id] || 0,
            };
        });

        setReportData(results);
    };
    
     useEffect(() => {
        handleGenerateReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fromDate, toDate, partners, salesInvoices, posSales, expenses, exceptionalIncomes, items]);


    const handlePrint = () => {
        window.print();
    };

    const totalCalculatedShares = reportData ? reportData.reduce((acc, item) => acc + item.profitShareValue, 0) : 0;

    return (
        <>
            <PageHeader title="تقرير حصص الشركاء (حسب فترة الشراكة)" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                <Card className="no-print">
                    <CardHeader>
                        <CardTitle>تحديد الفترة للمراجعة</CardTitle>
                        <CardDescription>سيقوم النظام بتقسيم الأرباح يومياً وتوزيعها على الشركاء النشطين في كل يوم فقط.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="from-date">من تاريخ</Label>
                                <Input id="from-date" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="to-date">إلى تاريخ</Label>
                                <Input id="to-date" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {loading ? <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
                : reportData && netIncome !== null && (
                    <Card className="printable-area">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>نتائج تقرير حصص الشركاء</CardTitle>
                                <CardDescription>
                                    الفترة من {fromDate || 'البداية'} إلى {toDate || 'النهاية'}.
                                    صافي الربح الإجمالي للفترة: <span className="font-bold">{netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
                                </CardDescription>
                            </div>
                             <Button variant="outline" size="icon" onClick={handlePrint} className="no-print">
                                <Printer className="ml-2 h-4 w-4" />
                                <span className="sr-only">طباعة</span>
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>اسم الشريك</TableHead>
                                        <TableHead className="text-center">رأس المال</TableHead>
                                        <TableHead className="text-center">نسبة الحصة</TableHead>
                                        <TableHead className="text-center">قيمة حصة الربح المستحقة</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportData.length > 0 ? reportData.map((partner) => (
                                        <TableRow key={partner.id}>
                                            <TableCell className="font-medium">{partner.name}</TableCell>
                                            <TableCell className="text-center">{partner.capital.toLocaleString()} ج.م</TableCell>
                                            <TableCell className="text-center">{partner.profitSharePercentage}%</TableCell>
                                            <TableCell className={`text-center font-semibold ${partner.profitShareValue >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                                {partner.profitShareValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                                                لا يوجد شركاء لعرضهم في هذه الفترة.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                                <TableFooter>
                                     <TableRow>
                                        <TableCell colSpan={3} className="font-bold">إجمالي الحصص الموزعة للفترة</TableCell>
                                        <TableCell className={`text-center font-bold ${totalCalculatedShares >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                            {totalCalculatedShares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                            <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-dashed text-sm">
                                <h4 className="font-bold mb-2 flex items-center gap-2"><Info className="h-4 w-4"/> ملاحظة محاسبية:</h4>
                                <p className="text-muted-foreground">يتم احتساب حصة الشريك بناءً على الأرباح المحققة فقط خلال الأيام التي كانت فيها شراكته سارية (بين تاريخ البداية والنهاية المحدد في بطاقة الشريك).</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </main>
        </>
    );
}
