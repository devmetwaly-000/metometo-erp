

"use client";

import React, { useMemo, useState, useEffect } from "react";
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
import { Loader2, Eye, Filter } from "lucide-react";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Combobox } from '@/components/ui/combobox';
import { Button } from "@/components/ui/button";

interface Item {
    id: string;
    name: string;
    code?: string;
    cost?: number;
    itemType?: 'standard' | 'raw_material' | 'manufactured';
    components?: { itemId: string; quantity: number }[];
}

interface Sale {
  id: string;
  invoiceNumber: string;
  date: string;
  items: {
    id: string;
    name: string;
    qty: number;
  }[];
  type: 'Invoice' | 'POS';
  warehouseId?: string;
}

const ComponentConsumptionDialog = ({ sale, allItems }: { sale: Sale, allItems: Item[] }) => {
    const consumedComponents = useMemo(() => {
        const componentsMap = new Map<string, { name: string, code?: string, totalQty: number }>();

        sale.items.forEach(saleItem => {
            const masterItem = allItems.find(i => i.id === saleItem.id);
            if (masterItem?.itemType === 'manufactured' && masterItem.components) {
                masterItem.components.forEach((component: any) => {
                    const componentMaster = allItems.find(i => i.id === component.itemId);
                    if (componentMaster) {
                        const consumedQty = component.quantity * saleItem.qty;
                        const existing = componentsMap.get(component.itemId);
                        if (existing) {
                            existing.totalQty += consumedQty;
                        } else {
                            componentsMap.set(component.itemId, {
                                name: componentMaster.name,
                                code: componentMaster.code,
                                totalQty: consumedQty,
                            });
                        }
                    }
                });
            }
        });

        return Array.from(componentsMap.values());
    }, [sale, allItems]);

    return (
        <CardContent>
            <p className="text-sm text-muted-foreground mb-2">المواد الخام التي تم سحبها من المخزون لهذه الفاتورة:</p>
            <Table>
                <TableHeader><TableRow><TableHead>المادة الخام</TableHead><TableHead>الكود</TableHead><TableHead className="text-center">الكمية المسحوبة</TableHead></TableRow></TableHeader>
                <TableBody>
                    {consumedComponents.length > 0 ? consumedComponents.map((c: any, index: number) => (
                        <TableRow key={index}>
                            <TableCell>{c.name}</TableCell>
                            <TableCell>{c.code || 'N/A'}</TableCell>
                            <TableCell className="text-center">{c.totalQty.toFixed(3)}</TableCell>
                        </TableRow>
                    )) : <TableRow><TableCell colSpan={3} className="text-center">لم يتم سحب مكونات لهذه الفاتورة.</TableCell></TableRow>}
                </TableBody>
            </Table>
        </CardContent>
    );
};

export default function RecipeReportsPage() {
  const { salesInvoices, posSales, items: allItems, warehouses, loading } = useData();
  const [filters, setFilters] = useState({
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
    warehouseId: 'all',
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  const warehouseOptions = useMemo(() => ([
    { value: 'all', label: 'كل الفروع' },
    ...warehouses.map((w: any) => ({ value: w.id, label: w.name }))
  ]), [warehouses]);


  const { detailedReportData, summaryReportData } = useMemo(() => {
    if (loading) return { detailedReportData: [], summaryReportData: [] };

    const combinedSales: Sale[] = [
      ...salesInvoices.filter((inv: any) => inv.status === 'approved').map((inv: any) => ({ ...inv, type: 'Invoice' })),
      ...posSales.map((sale: any) => ({ ...sale, type: 'POS' })),
    ];
    
    const salesWithManufacturedItems = combinedSales.filter(sale => 
        sale.items.some(item => {
            const masterItem = allItems.find(i => i.id === item.id);
            return masterItem?.itemType === 'manufactured';
        })
    );

    const filteredSales = salesWithManufacturedItems.filter(sale => {
      const saleDate = new Date(sale.date);
      const from = filters.fromDate ? new Date(filters.fromDate) : null;
      const to = filters.toDate ? new Date(filters.toDate) : null;
      if (from) from.setHours(0, 0, 0, 0);
      if (to) to.setHours(23, 59, 59, 999);
      if (from && saleDate < from) return false;
      if (to && saleDate > to) return false;
      if (filters.warehouseId !== 'all' && sale.warehouseId !== filters.warehouseId) return false;
      return true;
    });

    const summaryMap = new Map<string, { name: string, code?: string, totalQty: number, totalValue: number }>();
    filteredSales.forEach(sale => {
        sale.items.forEach(saleItem => {
            const masterItem = allItems.find(i => i.id === saleItem.id);
            if (masterItem?.itemType === 'manufactured' && masterItem.components) {
                masterItem.components.forEach((component: any) => {
                    const componentMaster = allItems.find(i => i.id === component.itemId);
                    if (componentMaster) {
                        const consumedQty = component.quantity * saleItem.qty;
                        const consumedValue = consumedQty * (componentMaster.cost || 0);
                        const existing = summaryMap.get(component.itemId);
                        if (existing) {
                            existing.totalQty += consumedQty;
                            existing.totalValue += consumedValue;
                        } else {
                            summaryMap.set(component.itemId, {
                                name: componentMaster.name,
                                code: componentMaster.code,
                                totalQty: consumedQty,
                                totalValue: consumedValue,
                            });
                        }
                    }
                });
            }
        });
    });

    return {
      detailedReportData: filteredSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      summaryReportData: Array.from(summaryMap.values()).map(item => ({...item, avgCost: item.totalValue / item.totalQty})).sort((a,b) => b.totalValue - a.totalValue)
    };
  }, [filters, salesInvoices, posSales, allItems, loading]);
  
  const grandTotalValue = useMemo(() => summaryReportData.reduce((acc, item) => acc + item.totalValue, 0), [summaryReportData]);

  return (
    <>
      <PageHeader title="تقارير التصنيع والمكونات" />
      <main className="flex-1 p-4 md:p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Filter/> فلاتر التقرير</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div className="space-y-2">
                            <Label>الفرع</Label>
                            <Combobox
                                options={warehouseOptions}
                                value={filters.warehouseId}
                                onValueChange={(v) => handleFilterChange('warehouseId', v)}
                                placeholder="اختر فرع..."
                                emptyMessage="لا يوجد فروع."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>من تاريخ</Label>
                            <Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>إلى تاريخ</Label>
                            <Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} />
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle>ملخص استهلاك المواد الخام</CardTitle>
                            <CardDescription>إجمالي الكميات المسحوبة من كل مادة خام خلال الفترة.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             {loading ? (
                                <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                            ) : (
                                 <div className="w-full overflow-auto border rounded-lg h-[60vh]">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>المادة الخام</TableHead><TableHead className="text-center">الكمية</TableHead><TableHead className="text-center">التكلفة</TableHead><TableHead className="text-center">الإجمالي</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {summaryReportData.length > 0 ? summaryReportData.map(item => (
                                                <TableRow key={item.code}>
                                                    <TableCell>{item.name}</TableCell>
                                                    <TableCell className="text-center font-bold">{item.totalQty.toFixed(3)}</TableCell>
                                                     <TableCell className="text-center text-muted-foreground">{item.avgCost.toFixed(2)}</TableCell>
                                                     <TableCell className="text-center font-semibold">{item.totalValue.toFixed(2)}</TableCell>
                                                </TableRow>
                                            )) : <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">لا توجد بيانات.</TableCell></TableRow>}
                                        </TableBody>
                                        <TableFooter>
                                            <TableRow>
                                                <TableCell colSpan={3} className="font-bold">الإجمالي</TableCell>
                                                <TableCell className="text-center font-bold">{grandTotalValue.toFixed(2)}</TableCell>
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                 </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle>تقرير السحب التفصيلي</CardTitle>
                        <CardDescription>عرض تفصيلي لاستهلاك المواد الخام لكل فاتورة بيع لمنتج مُصنَّع.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {loading ? (
                          <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                        ) : (
                          <Accordion type="single" collapsible className="w-full">
                             {detailedReportData.length > 0 ? detailedReportData.map((sale) => (
                              <AccordionItem value={sale.id} key={sale.id}>
                                <AccordionTrigger>
                                    <div className="flex justify-between w-full pr-4">
                                        <span>فاتورة: {sale.invoiceNumber}</span>
                                        <span className="text-sm text-muted-foreground">{new Date(sale.date).toLocaleString('ar-EG')}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                   <ComponentConsumptionDialog sale={sale} allItems={allItems} />
                                </AccordionContent>
                              </AccordionItem>
                            )) : (
                                <div className="text-center py-10 text-muted-foreground">لا توجد فواتير منتجات مصنعة في الفترة المحددة.</div>
                            )}
                          </Accordion>
                        )}
                      </CardContent>
                    </Card>
                </div>
            </main>
        </>
    );
}
