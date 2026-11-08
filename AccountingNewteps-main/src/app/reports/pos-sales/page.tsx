
"use client";

import React, { useState, useMemo, useEffect } from "react";
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
import { useAuth } from "@/contexts/auth-context";
import { Loader2, Printer, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";


interface ItemReportData {
    itemId: string;
    itemName: string;
    itemCode: string;
    totalQty: number;
    totalValue: number;
    totalCost: number;
    totalProfit: number;
    totalTax: number;
}

const ItemSalesDetailsDialog = ({ itemId, itemName, salesData }: { itemId: string; itemName: string; salesData: any[] }) => {
    const detailedSales = useMemo(() => {
        const salesForItem: any[] = [];
        salesData.forEach(sale => {
            const itemInSale = sale.items.find((i: any) => i.id === itemId);
            if (itemInSale) {
                const itemCost = itemInSale.cost || 0;
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
    }, [itemId, salesData]);

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


export default function PosSalesSummaryPage() {
  const { posSales, items: allItems, warehouses: allWarehouses, posTerminals: allTerminals, loading } = useData();
  const { user } = useAuth();

  const authorizedBranchIds = useMemo(() => {
    if (!user?.warehouseIds) return [];
    if (user.warehouseIds.includes('all')) return allWarehouses.map((w: any) => w.id);
    return user.warehouseIds;
  }, [user, allWarehouses]);

  const warehouses = useMemo(() => {
    return allWarehouses.filter((w: any) => authorizedBranchIds.includes(w.id));
  }, [allWarehouses, authorizedBranchIds]);

  const posTerminals = useMemo(() => {
    return allTerminals.filter((t: any) => authorizedBranchIds.includes(t.warehouseId));
  }, [allTerminals, authorizedBranchIds]);

  const [filters, setFilters] = useState({
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
    warehouseId: "all",
    terminalId: "all",
  });
  
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<ItemReportData | null>(null);

  useEffect(() => {
    if (user && user.warehouseIds && user.warehouseIds.length === 1 && user.warehouseIds[0] !== 'all') {
      setFilters(prev => ({...prev, warehouseId: user.warehouseIds![0]}));
    }
  }, [user]);


  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const { reportData, filteredSales } = useMemo(() => {
    if (loading) return { reportData: [], filteredSales: [] };
    
    const itemMap = new Map<string, ItemReportData>();

    const sales = posSales.filter((sale: any) => {
        const saleDate = new Date(sale.date);
        const from = filters.fromDate ? new Date(filters.fromDate) : null;
        const to = filters.toDate ? new Date(filters.toDate) : null;
        if(from) from.setHours(0,0,0,0);
        if(to) to.setHours(23,59,59,999);

        if (from && saleDate < from) return false;
        if (to && saleDate > to) return false;
        if (filters.warehouseId !== 'all' && sale.warehouseId !== filters.warehouseId) return false;
        if (filters.terminalId !== 'all' && sale.posTerminalId !== filters.terminalId) return false;
        
        if (user && user.warehouseIds && user.warehouseIds.length === 1 && user.warehouseIds[0] !== 'all' && sale.warehouseId !== user.warehouseIds[0]) return false;

        return true;
    });

    sales.forEach(sale => {
        sale.items.forEach((item: any) => {
            let entry = itemMap.get(item.id);
            if (!entry) {
                const itemMaster = allItems.find((i: any) => i.id === item.id);
                entry = {
                    itemId: item.id,
                    itemName: item.name || 'صنف غير معروف',
                    itemCode: itemMaster?.code || 'N/A',
                    totalQty: 0,
                    totalValue: 0,
                    totalCost: 0,
                    totalProfit: 0,
                    totalTax: 0,
                };
                itemMap.set(item.id, entry);
            }
            
            const itemCost = item.cost || 0;
            const itemValue = item.qty * item.price;
            const itemTotalCost = item.qty * itemCost;
            const itemTax = item.taxAmount || 0;

            entry.totalQty += item.qty;
            entry.totalValue += itemValue;
            entry.totalCost += itemTotalCost;
            entry.totalProfit += (itemValue - itemTotalCost);
            entry.totalTax += itemTax;
        });
    });

    return { 
        reportData: Array.from(itemMap.values()).sort((a, b) => b.totalValue - a.totalValue),
        filteredSales: sales 
    };

  }, [filters, posSales, allItems, loading, user]);

  const grandTotals = useMemo(() => {
    return reportData.reduce((acc, item) => {
        acc.qty += item.totalQty;
        acc.value += item.totalValue;
        acc.cost += item.totalCost;
        acc.profit += item.totalProfit;
        acc.tax += item.totalTax;
        return acc;
    }, { qty: 0, value: 0, cost: 0, profit: 0, tax: 0 });
  }, [reportData]);
  
  const warehouseOptions = useMemo(() => {
     const options = warehouses.map((w: any) => ({ value: w.id, label: w.name }));
     if (user && user.warehouseIds && user.warehouseIds.length === 1 && user.warehouseIds[0] !== 'all') {
         return options.filter(opt => opt.value === user.warehouseIds![0]);
     }
     return [{ value: 'all', label: 'كل الفروع' }, ...options];
  }, [warehouses, user]);
  
  const terminalOptions = useMemo(() => {
    let terminals = posTerminals;
    if (filters.warehouseId !== 'all') {
      terminals = posTerminals.filter((t: any) => t.warehouseId === filters.warehouseId);
    }
    const options = terminals.map((t: any) => ({ value: t.id, label: t.name }));
    return [{ value: 'all', label: 'كل نقاط البيع' }, ...options];
  }, [posTerminals, filters.warehouseId]);


  return (
    <>
      <PageHeader title="تقرير مبيعات نقاط البيع (مجمع)" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card className="no-print">
            <CardHeader><CardTitle>فلاتر البحث</CardTitle></CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} /></div>
                    <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} /></div>
                    <div className="space-y-2">
                        <Label>الفرع</Label>
                        <Combobox
                          options={warehouseOptions}
                          value={filters.warehouseId}
                          onValueChange={(v) => handleFilterChange("warehouseId", v)}
                          placeholder="اختر الفرع..."
                          emptyMessage="لم يتم العثور على فرع."
                          disabled={user?.warehouseIds?.length === 1 && user.warehouseIds[0] !== 'all'}
                        />
                    </div>
                     <div className="space-y-2">
                        <Label>نقطة البيع</Label>
                        <Combobox
                          options={terminalOptions}
                          value={filters.terminalId}
                          onValueChange={(v) => handleFilterChange("terminalId", v)}
                          placeholder="اختر نقطة البيع..."
                          emptyMessage="لم يتم العثور على نقطة بيع."
                        />
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card className="printable-area">
          <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>ملخص مبيعات الأصناف</CardTitle>
                <CardDescription>عرض مجمع لكميات وقيم وأرباح مبيعات كل صنف خلال الفترة المحددة.</CardDescription>
              </div>
          </CardHeader>
          <CardContent>
            {loading ? (
                 <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
                <div className="w-full overflow-auto border rounded-lg">
                    <Dialog onOpenChange={(open) => !open && setSelectedItemForDetails(null)}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>الصنف</TableHead>
                                <TableHead>الباركود</TableHead>
                                <TableHead className="text-center">إجمالي الكمية المباعة</TableHead>
                                <TableHead className="text-center">إجمالي قيمة البيع</TableHead>
                                <TableHead className="text-center">إجمالي الضريبة</TableHead>
                                <TableHead className="text-center">إجمالي التكلفة</TableHead>
                                <TableHead className="text-center">إجمالي الربح</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reportData.length > 0 ? reportData.map((item) => (
                                <TableRow key={item.itemId}>
                                    <TableCell className="font-medium">{item.itemName}</TableCell>
                                    <TableCell className="font-mono">{item.itemCode}</TableCell>
                                    <TableCell className="text-center">
                                        <DialogTrigger asChild>
                                            <Button variant="link" className="font-bold" onClick={() => setSelectedItemForDetails(item)}>
                                                {item.totalQty.toLocaleString()}
                                            </Button>
                                        </DialogTrigger>
                                    </TableCell>
                                    <TableCell className="text-center">{item.totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-center">{item.totalTax.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-center">{item.totalCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className={`text-center font-semibold ${item.totalProfit > 0 ? 'text-green-600' : 'text-destructive'}`}>
                                        {item.totalProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">لا توجد مبيعات تطابق الفلاتر.</TableCell></TableRow>
                            )}
                        </TableBody>
                        {reportData.length > 0 && (
                            <TableFooter>
                                <TableRow className="font-bold bg-muted/50 text-base">
                                    <TableCell colSpan={2}>الإجمالي</TableCell>
                                    <TableCell className="text-center">{grandTotals.qty.toLocaleString()}</TableCell>
                                    <TableCell className="text-center">{grandTotals.value.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-center">{grandTotals.tax.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className="text-center">{grandTotals.cost.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                    <TableCell className={`text-center ${grandTotals.profit > 0 ? 'text-green-600' : 'text-destructive'}`}>
                                        {grandTotals.profit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        )}
                    </Table>
                    {selectedItemForDetails && (
                        <ItemSalesDetailsDialog 
                            itemId={selectedItemForDetails.itemId} 
                            itemName={selectedItemForDetails.itemName} 
                            salesData={filteredSales}
                        />
                    )}
                    </Dialog>
                </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
