
"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList } from "recharts";
import { useData } from "@/contexts/data-provider";
import { Loader2, Printer, Eye } from "lucide-react";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";


interface Item {
    id: string;
    name: string;
    price: number;
    cost?: number; // Assume cost is part of item master data
    code?: string;
    itemType?: 'standard' | 'raw_material' | 'manufactured';
    components?: { itemId: string; quantity: number }[];
}

interface SaleInvoice {
    id: string;
    date: string;
    warehouseId: string;
    items: { id: string; qty: number; price: number; cost?: number; }[];
    status?: 'pending' | 'approved';
    invoiceNumber: string;
}

interface PosSale {
  id: string;
  date: string;
  warehouseId?: string; // POS might not always have a warehouse
  items: { id: string; qty: number; price: number; cost?: number; }[];
  invoiceNumber: string;
}

interface SalesReturn {
    id: string;
    date: string;
    warehouseId: string;
    items: { id: string; qty: number; price: number; cost?: number; }[];
}

interface PosReturn {
    id: string;
    date: string;
    items: { id: string; qty: number; price: number; cost?: number; }[];
}


interface Warehouse {
    id: string;
    name: string;
}

const ItemSalesDetailsDialog = ({ itemId, itemName, salesData, allItems }: { itemId: string; itemName: string; salesData: any[], allItems: any[] }) => {

    const calculateManufacturedCost = (item: any) => {
        if (!item || item.itemType !== 'manufactured' || !item.components) {
            return item?.cost || 0;
        }
        return item.components.reduce((totalCost: number, component: any) => {
            const componentItem = allItems.find(i => i.id === component.itemId);
            return totalCost + (component.quantity * (componentItem?.cost || 0));
        }, 0);
    }

    const detailedSales = useMemo(() => {
        const salesForItem: any[] = [];
        salesData.forEach(sale => {
            const itemInSale = sale.items.find((i: any) => i.id === itemId);
            if (itemInSale) {
                const masterItem = allItems.find((i: any) => i.id === itemId);
                const itemCost = sale.type === 'POS' 
                    ? (itemInSale.cost || calculateManufacturedCost(masterItem))
                    : (itemInSale.cost || 0);

                const itemValue = itemInSale.qty * itemInSale.price;
                const itemProfit = itemValue - (itemInSale.qty * itemCost);
                salesForItem.push({
                    date: sale.date,
                    invoiceNumber: sale.invoiceNumber,
                    qty: itemInSale.qty,
                    price: itemInSale.price,
                    cost: itemCost,
                    profit: itemProfit,
                });
            }
        });
        return salesForItem;
    }, [itemId, salesData, allItems]);

    return (
        <DialogContent className="max-w-3xl">
            <DialogHeader>
                <DialogTitle>تفاصيل مبيعات صنف: {itemName}</DialogTitle>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>التاريخ</TableHead>
                            <TableHead>الفاتورة</TableHead>
                            <TableHead className="text-center">الكمية</TableHead>
                            <TableHead className="text-center">سعر البيع</TableHead>
                            <TableHead className="text-center">التكلفة</TableHead>
                            <TableHead className="text-center">الربح</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {detailedSales.map((sale, index) => (
                            <TableRow key={index}>
                                <TableCell>{new Date(sale.date).toLocaleString('ar-EG')}</TableCell>
                                <TableCell className="font-mono">{sale.invoiceNumber}</TableCell>
                                <TableCell className="text-center">{sale.qty}</TableCell>
                                <TableCell className="text-center">{sale.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                <TableCell className="text-center">{sale.cost.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                <TableCell className={`text-center font-semibold ${sale.profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>{sale.profit.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </DialogContent>
    );
};


export default function ItemProfitLossPage() {
    const [filters, setFilters] = useState({
        warehouseId: "all",
        fromDate: "",
        toDate: ""
    });
    const [reportData, setReportData] = useState<any[] | null>(null);
    const [filteredSales, setFilteredSales] = useState<any[]>([]);
     const [selectedItem, setSelectedItem] = useState<{id: string, name: string} | null>(null);


    const { items, salesInvoices, posSales, salesReturns, posReturns, warehouses, loading } = useData();
    
    useEffect(() => {
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - 30);
        setFilters(prev => ({
            ...prev,
            fromDate: fromDate.toISOString().split('T')[0],
            toDate: toDate.toISOString().split('T')[0]
        }));
    }, []);

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({...prev, [key]: value}));
    };
    
    const calculateManufacturedCost = useCallback((item: any) => {
        if (!item || item.itemType !== 'manufactured' || !item.components) {
            return item?.cost || 0;
        }
        return item.components.reduce((totalCost: number, component: any) => {
            const componentItem = items.find((i:any) => i.id === component.itemId);
            return totalCost + (component.quantity * (componentItem?.cost || 0));
        }, 0);
    }, [items]);


    const handleGenerateReport = () => {
        
        const filterByDate = (item: { date: string }) => {
            const itemDate = new Date(item.date);
            const fromDate = filters.fromDate ? new Date(filters.fromDate) : null;
            const toDate = filters.toDate ? new Date(filters.toDate) : null;

            if(fromDate) fromDate.setHours(0,0,0,0);
            if(toDate) toDate.setHours(23,59,59,999);

            if (fromDate && itemDate < fromDate) return false;
            if (toDate && itemDate > toDate) return false;
            return true;
        }

        const approvedSales = salesInvoices.filter((sale: any) => {
            if (sale.status !== 'approved') return false;
            if (!filterByDate(sale)) return false;
            if (filters.warehouseId !== 'all' && sale.warehouseId !== filters.warehouseId) return false;
            return true;
        });

        const filteredPosSales = posSales.filter((sale: any) => {
            if (!filterByDate(sale)) return false;
            if (filters.warehouseId !== 'all' && sale.warehouseId !== filters.warehouseId) return false;
            return true;
        });

        const allFilteredSales = [...approvedSales, ...filteredPosSales];
        setFilteredSales(allFilteredSales);

        const filteredSalesReturns = salesReturns.filter((ret: any) => {
             if (!filterByDate(ret)) return false;
            if (filters.warehouseId !== 'all' && ret.warehouseId !== filters.warehouseId) return false;
            return true;
        });
        
        const filteredPosReturns = posReturns.filter((ret: any) => filterByDate(ret));
        
        const resultsMap = new Map();
        
        // Initialize map with all items
        items.forEach((item: Item) => {
             resultsMap.set(item.id, {
                id: item.id,
                name: item.name,
                code: item.code,
                totalSoldQty: 0,
                totalSoldValue: 0,
                totalSoldCount: 0,
                totalReturnedQty: 0,
                totalReturnedValue: 0,
                totalCost: 0,
            });
        });

        // Process Sales
        const processSales = (sales: any[]) => {
            sales.forEach(sale => {
                 if (!sale.items || !Array.isArray(sale.items)) return;
                 sale.items.forEach((saleItem: any) => {
                    if (!saleItem.id) return;
                    if (resultsMap.has(saleItem.id)) {
                        const existing = resultsMap.get(saleItem.id);
                        const masterItem = items.find((i:any) => i.id === saleItem.id);
                        
                        existing.totalSoldQty += saleItem.qty;
                        existing.totalSoldValue += saleItem.qty * saleItem.price;
                        existing.totalSoldCount += 1;
                        
                        const itemCost = saleItem.cost || calculateManufacturedCost(masterItem);
                        existing.totalCost += saleItem.qty * itemCost;
                    }
                });
            });
        };
        processSales(allFilteredSales);
        
        // Process Returns
         const processReturns = (returns: any[]) => {
            returns.forEach(ret => {
                 if (!ret.items || !Array.isArray(ret.items)) return;
                 ret.items.forEach((retItem: any) => {
                    if (!retItem.id) return;
                    if (resultsMap.has(retItem.id)) {
                        const existing = resultsMap.get(retItem.id);
                        const masterItem = items.find((i:any) => i.id === retItem.id);
                        
                        existing.totalReturnedQty += retItem.qty;
                        existing.totalReturnedValue += retItem.qty * retItem.price;

                        const itemCost = retItem.cost || calculateManufacturedCost(masterItem);
                        existing.totalCost -= retItem.qty * itemCost;
                    }
                });
            });
        };
        processReturns(filteredSalesReturns);
        processReturns(filteredPosReturns);


        const results = Array.from(resultsMap.values())
            .filter(data => data.totalSoldQty > 0 || data.totalReturnedQty > 0) // Only show items that were sold or returned
            .map(data => {
                const netRevenue = data.totalSoldValue - data.totalReturnedValue;
                const profit = netRevenue - data.totalCost;
                const margin = netRevenue > 0 ? (profit / netRevenue) * 100 : 0;
                return {
                    ...data,
                    netRevenue,
                    profit,
                    margin: margin.toFixed(2) + '%'
                };
            });

        setReportData(results);
    };

    const handlePrint = () => {
        window.print();
    };
    
    const grandTotals = useMemo(() => {
        if (!reportData) return null;
        return {
            soldValue: reportData.reduce((acc, item) => acc + item.totalSoldValue, 0),
            returnedValue: reportData.reduce((acc, item) => acc + item.totalReturnedValue, 0),
            cost: reportData.reduce((acc, item) => acc + item.totalCost, 0),
            profit: reportData.reduce((acc, item) => acc + item.profit, 0),
        }
    }, [reportData]);

    return (
    <>
      <PageHeader title="تقرير أرباح وخسائر الأصناف" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card className="no-print">
            <CardHeader>
                <CardTitle>تحديد الفلاتر</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="warehouse">المخزن</Label>
                        <Select value={filters.warehouseId} onValueChange={v => handleFilterChange('warehouseId', v)}>
                            <SelectTrigger disabled={loading}>
                                <SelectValue placeholder="كل المخازن" />
                            </SelectTrigger>
                            <SelectContent>
                               <SelectItem value="all">كل المخازن</SelectItem>
                               {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="from-date">من تاريخ</Label>
                        <Input id="from-date" type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="to-date">إلى تاريخ</Label>
                        <Input id="to-date" type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} />
                    </div>
                     <div className="flex items-end">
                        <Button className="w-full" onClick={handleGenerateReport} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin" /> : "عرض التقرير"}
                        </Button>
                    </div>
                 </div>
            </CardContent>
        </Card>

        {reportData && (
            <Dialog onOpenChange={(open) => !open && setSelectedItem(null)}>
            <Card className="printable-area">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>نتائج التقرير</CardTitle>
                    <CardDescription>
                    تحليل أرباح وخسائر كل صنف خلال الفترة المحددة.
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
                            <TableHead>الصنف</TableHead>
                            <TableHead>الباركود</TableHead>
                            <TableHead className="text-center">إجمالي المبيعات</TableHead>
                            <TableHead className="text-center">إجمالي المرتجعات</TableHead>
                            <TableHead className="text-center">إجمالي التكلفة</TableHead>
                            <TableHead className="text-center">الربح / الخسارة</TableHead>
                            <TableHead className="text-center">هامش الربح</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {reportData.length > 0 ? reportData.map((data: any) => (
                            <TableRow key={data.id}>
                                <TableCell>
                                    <div className="font-medium">{data.name}</div>
                                </TableCell>
                                <TableCell className="font-mono">{data.code || 'N/A'}</TableCell>
                                <TableCell className="text-center">
                                    <DialogTrigger asChild>
                                        <Button variant="link" onClick={() => setSelectedItem(data)}>
                                            <div>{data.totalSoldValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                            <div className="text-xs text-muted-foreground">({data.totalSoldQty} وحدة)</div>
                                        </Button>
                                    </DialogTrigger>
                                </TableCell>
                                 <TableCell className="text-center text-destructive">
                                    <div>{data.totalReturnedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                    <div className="text-xs text-muted-foreground">({data.totalReturnedQty} وحدة)</div>
                                </TableCell>
                                <TableCell className="text-center">ج.م {data.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className={`text-center font-bold ${data.profit >= 0 ? "text-green-500" : "text-destructive"}`}>
                                    ج.م {data.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className={`text-center font-bold ${data.profit >= 0 ? "text-green-500" : "text-destructive"}`}>
                                    {data.margin}
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                                    لا توجد بيانات مبيعات لعرضها في الفترة المحددة.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                    {reportData.length > 0 && grandTotals && (
                        <TableFooter>
                            <TableRow className="bg-muted/50 font-bold">
                                <TableCell colSpan={2}>الإجمالي</TableCell>
                                <TableCell className="text-center">ج.م {grandTotals.soldValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-center">ج.م {grandTotals.returnedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-center">ج.م {grandTotals.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-center">ج.م {grandTotals.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        </TableFooter>
                    )}
                </Table>
                </div>
            </CardContent>
            </Card>
            {selectedItem && (
                <ItemSalesDetailsDialog
                    itemId={selectedItem.id}
                    itemName={selectedItem.name}
                    salesData={filteredSales}
                    allItems={items}
                />
            )}
            </Dialog>
        )}
      </main>
    </>
  );
}
