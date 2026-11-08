
"use client";

import React, { useMemo, useState, useCallback } from "react";
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
import { Loader2, Printer, FileText, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";

interface Sale {
  id: string;
  invoiceNumber: string;
  date: string;
  customerName?: string;
  customerPhone?: string;
  cashierName?: string;
  salesRepName?: string;
  warehouseName: string;
  subtotal: number;
  discount: number;
  total: number;
  cost: number;
  profit: number;
  type: 'Invoice' | 'POS';
  isDelivery?: boolean;
}

const chartConfig = {
  total: {
    label: "المبيعات",
    color: "hsl(var(--chart-1))",
  },
  profit: {
    label: "الأرباح",
    color: "hsl(var(--chart-2))",
  },
};

export default function SalesReportPage() {
  const { 
    salesInvoices, 
    posSales,
    items: allItems,
    users,
    warehouses,
    customers,
    loading 
  } = useData();
  const isMobile = useIsMobile();

  const [filters, setFilters] = useState({
    warehouseId: "all",
    customerId: "all",
    userId: "all", // For cashier or sales rep
    fromDate: "",
    toDate: "",
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const calculateManufacturedCost = useCallback((item: any) => {
        if (!item || item.itemType !== 'manufactured' || !item.components) {
            return item?.cost || 0;
        }
        return item.components.reduce((totalCost: number, component: any) => {
            const componentItem = allItems.find((i:any) => i.id === component.itemId);
            return totalCost + (component.quantity * (componentItem?.cost || 0));
        }, 0);
  }, [allItems]);

  const {reportData, dailySalesChartData, dailyProfitChartData} = useMemo(() => {
    if (loading) return { reportData: [], dailySalesChartData: [], dailyProfitChartData: [] };

    const warehouseMap = new Map(warehouses.map((w: any) => [w.id, w.name]));
    const userMap = new Map(users.map((u: any) => [u.id, u.name]));
    const customerMap = new Map(customers.map((c: any) => [c.id, c]));
    const itemMap = new Map(allItems.map((i: any) => [i.id, i]));

    const combinedSales: any[] = [
        ...salesInvoices.filter((inv: any) => inv.status === 'approved').map((inv: any) => ({ ...inv, type: 'Invoice' })),
        ...posSales.map((sale: any) => ({ ...sale, type: 'POS' })),
    ];
    
    const dailySales = new Map<string, number>();
    const dailyProfit = new Map<string, number>();

    const filteredData = combinedSales
        .map((sale: any) => {
            const cost = sale.items.reduce((acc: number, item: any) => {
                 const masterItem = itemMap.get(item.id);
                 const itemCost = item.cost || calculateManufacturedCost(masterItem);
                 return acc + (item.qty * itemCost);
            }, 0);
            
            const profit = (sale.subtotal || sale.total + (sale.discount || 0)) - (sale.discount || 0) - cost;
            const customer = customerMap.get(sale.customerId);
            
            const saleDate = new Date(sale.date);
            const formattedDate = saleDate.toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' });

            // Only aggregate if the sale is within the date filter
            const from = filters.fromDate ? new Date(filters.fromDate) : null;
            const to = filters.toDate ? new Date(filters.toDate) : null;
            if(from) from.setHours(0,0,0,0);
            if(to) to.setHours(23,59,59,999);
            const isInDateRange = (!from || saleDate >= from) && (!to || saleDate <= to);

            if (isInDateRange) {
                dailySales.set(formattedDate, (dailySales.get(formattedDate) || 0) + sale.total);
                dailyProfit.set(formattedDate, (dailyProfit.get(formattedDate) || 0) + profit);
            }

            return {
                id: sale.id,
                invoiceNumber: sale.invoiceNumber,
                date: sale.date,
                customerName: sale.customerName || customer?.name || '---',
                customerPhone: customer?.phone,
                cashierName: sale.cashierName,
                salesRepName: userMap.get(sale.salesRepId),
                warehouseName: warehouseMap.get(sale.warehouseId) || 'N/A',
                subtotal: sale.subtotal || (sale.total + (sale.discount || 0)),
                discount: sale.discount || 0,
                total: sale.total,
                cost: cost,
                profit: profit,
                type: sale.type,
                isDelivery: sale.isDelivery,
                // Filter fields
                warehouseId: sale.warehouseId,
                customerId: sale.customerId || customer?.phone,
                userId: sale.cashierId || sale.salesRepId,
            }
        })
        .filter((sale: any) => {
            const saleDate = new Date(sale.date);
            const from = filters.fromDate ? new Date(filters.fromDate) : null;
            const to = filters.toDate ? new Date(filters.toDate) : null;
            if(from) from.setHours(0,0,0,0);
            if(to) to.setHours(23,59,59,999);

            if (from && saleDate < from) return false;
            if (to && saleDate > to) return false;
            if (filters.warehouseId !== 'all' && sale.warehouseId !== filters.warehouseId) return false;
            if (filters.customerId !== 'all' && (sale.customerId !== filters.customerId && sale.customerPhone !== filters.customerId)) return false;
            if (filters.userId !== 'all' && sale.userId !== filters.userId) return false;
            return true;
        })
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        const finalSalesChartData = Array.from(dailySales.entries()).map(([date, total]) => ({date, total})).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const finalProfitChartData = Array.from(dailyProfit.entries()).map(([date, profit]) => ({date, profit})).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());


        return { reportData: filteredData, dailySalesChartData: finalSalesChartData, dailyProfitChartData: finalProfitChartData };
  }, [filters, salesInvoices, posSales, warehouses, users, customers, allItems, loading, calculateManufacturedCost]);

  const grandTotals = useMemo(() => {
    return reportData.reduce((acc, sale) => {
        acc.subtotal += sale.subtotal;
        acc.discount += sale.discount;
        acc.total += sale.total;
        acc.cost += sale.cost;
        acc.profit += sale.profit;
        return acc;
    }, { subtotal: 0, discount: 0, total: 0, cost: 0, profit: 0 });
  }, [reportData]);
  
  const userOptions = useMemo(() => {
      const salesUsers = users.filter((u: any) => u.isCashier || u.isSalesRep);
      return [{value: 'all', label: 'كل الموظفين'}, ...salesUsers.map((u:any) => ({value: u.id, label: u.name}))]
  }, [users]);
  
  const customerOptions = useMemo(() => [{value: 'all', label: 'كل العملاء'}, ...customers.map((c:any) => ({value: c.id, label: c.name}))], [customers]);
  const warehouseOptions = useMemo(() => [{value: 'all', label: 'كل الفروع'}, ...warehouses.map((w:any) => ({value: w.id, label: w.name}))], [warehouses]);


  const handlePrint = () => {
    window.print();
  }

  return (
    <>
      <PageHeader title="تقرير المبيعات المفصل" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card className="no-print">
            <CardHeader>
                <CardTitle>فلاتر البحث</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} /></div>
                    <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} /></div>
                    <div className="space-y-2"><Label>الفرع</Label><Combobox options={warehouseOptions} value={filters.warehouseId} onValueChange={v => handleFilterChange('warehouseId', v)} placeholder="الكل" emptyMessage="لا توجد فروع." /></div>
                    <div className="space-y-2"><Label>العميل (بالاسم)</Label><Combobox options={customerOptions} value={filters.customerId} onValueChange={v => handleFilterChange('customerId', v)} placeholder="الكل" emptyMessage="لا يوجد عملاء."/></div>
                    <div className="space-y-2"><Label>الموظف/المندوب</Label><Combobox options={userOptions} value={filters.userId} onValueChange={v => handleFilterChange('userId', v)} placeholder="الكل" emptyMessage="لا يوجد موظفون." /></div>
                </div>
            </CardContent>
        </Card>

        {reportData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>ملخص المبيعات اليومية</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig} className="h-[250px] w-full">
                            <BarChart data={dailySalesChartData}>
                                <CartesianGrid vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    tickMargin={10}
                                    axisLine={false}
                                />
                                <YAxis tickFormatter={(value) => value.toLocaleString()} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="total" fill="var(--color-total)" radius={4} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>ملخص الأرباح اليومية</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={chartConfig} className="h-[250px] w-full">
                            <BarChart data={dailyProfitChartData}>
                                <CartesianGrid vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    tickMargin={10}
                                    axisLine={false}
                                />
                                <YAxis tickFormatter={(value) => value.toLocaleString()} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="profit" fill="var(--color-profit)" radius={4} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>
        )}

        <Card className="printable-area">
          <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>نتائج التقرير</CardTitle>
                <CardDescription>
                  عرض تفصيلي لجميع المبيعات بناءً على الفلاتر المحددة.
                </CardDescription>
              </div>
              <Button variant="outline" size="icon" onClick={handlePrint} className="no-print">
                <Printer className="h-4 w-4" />
              </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
                 <div className="w-full flex justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="w-full overflow-auto border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>رقم الفاتورة</TableHead>
                                <TableHead>النوع</TableHead>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>العميل</TableHead>
                                <TableHead>الموظف/المندوب</TableHead>
                                <TableHead className="text-center">الإجمالي</TableHead>
                                <TableHead className="text-center">الخصم</TableHead>
                                <TableHead className="text-center">التكلفة</TableHead>
                                <TableHead className="text-center">صافي الربح</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reportData.length > 0 ? reportData.map((sale) => (
                            <TableRow key={sale.id}>
                                <TableCell className="font-mono">{sale.invoiceNumber}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        {sale.isDelivery ? <Truck className="h-4 w-4 text-blue-500" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                                        <span>{sale.type === 'POS' ? 'كاشير' : 'فاتورة'}</span>
                                    </div>
                                </TableCell>
                                <TableCell>{new Date(sale.date).toLocaleDateString('ar-EG')}</TableCell>
                                <TableCell>{sale.customerName}</TableCell>
                                <TableCell>{sale.cashierName || sale.salesRepName || '---'}</TableCell>
                                <TableCell className="text-center font-semibold">{sale.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                <TableCell className="text-center text-destructive">{sale.discount > 0 ? sale.discount.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</TableCell>
                                <TableCell className="text-center">{sale.cost.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                <TableCell className={`text-center font-bold ${sale.profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>{sale.profit.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                            </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                                        لا توجد بيانات مبيعات تطابق الفلاتر المحددة.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        {reportData.length > 0 && (
                            <TableFooter>
                                <TableRow className="font-bold bg-muted/50 text-base">
                                    <TableCell colSpan={5}>الإجمالي</TableCell>
                                    <TableCell className="text-center">{grandTotals.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-center text-destructive">{grandTotals.discount.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-center">{grandTotals.cost.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className={`text-center ${grandTotals.profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>{grandTotals.profit.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
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
