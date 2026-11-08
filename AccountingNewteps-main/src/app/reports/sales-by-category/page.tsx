

"use client";

import React, { useMemo, useState } from "react";
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
import { Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";

interface Item { id: string; name: string; sectionId?: string; categoryId?: string; cost?: number; }
interface ItemSection { id: string; name: string; }
interface ItemCategory { id: string; name: string; }
interface SaleInvoice { date: string; warehouseId: string; items: { id: string; qty: number; price: number; cost?: number; }[]; status?: 'approved' | 'pending'; }
interface PosSale { date: string; warehouseId?: string; items: { id: string; qty: number; price: number; cost?: number; }[]; }
interface Warehouse { id: string; name: string; }

const chartConfig = {
    sales: { label: "المبيعات", color: "hsl(var(--chart-1))" },
};

export default function SalesByCategoryReport() {
    const { items, itemSections, itemCategories, salesInvoices, posSales, warehouses, loading } = useData();
    const { user } = useAuth();
    const [filters, setFilters] = useState({ 
        warehouseId: user?.warehouseIds?.length === 1 ? user.warehouseIds[0] : "all", 
        fromDate: "", 
        toDate: "" 
    });
    const [reportData, setReportData] = useState<{ sections: any[], categories: any[] } | null>(null);
    const isMobile = useIsMobile();

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };
    
    const warehouseOptions = useMemo(() => ([
        { value: 'all', label: 'كل الفروع' },
        ...warehouses.map((w: any) => ({ value: w.id, label: w.name }))
    ]), [warehouses]);


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

        const allSales = [
            ...salesInvoices.filter((s: SaleInvoice) => s.status === 'approved'),
            ...posSales
        ];

        const filteredSales = allSales.filter(sale => {
            if (!filterByDate(sale)) return false;
            if (filters.warehouseId !== 'all' && sale.warehouseId !== filters.warehouseId) return false;
            return true;
        });

        const sectionsMap = new Map();
        const categoriesMap = new Map();

        filteredSales.forEach(sale => {
            if (!sale.items || !Array.isArray(sale.items)) return;
            sale.items.forEach((saleItem: any) => {
                const itemMaster = items.find((i: Item) => i.id === saleItem.id);
                if (!itemMaster) return;
                
                const section = itemSections.find((s: ItemSection) => s.id === itemMaster.sectionId);
                const category = itemCategories.find((c: ItemCategory) => c.id === itemMaster.categoryId);
                
                const saleValue = saleItem.qty * saleItem.price;
                const costValue = saleItem.qty * (saleItem.cost || itemMaster.cost || 0);

                if (section) {
                    const currentSection = sectionsMap.get(section.id) || { id: section.id, name: section.name, totalQty: 0, totalSales: 0, totalCost: 0 };
                    currentSection.totalQty += saleItem.qty;
                    currentSection.totalSales += saleValue;
                    currentSection.totalCost += costValue;
                    sectionsMap.set(section.id, currentSection);
                }

                if (category) {
                    const currentCategory = categoriesMap.get(category.id) || { id: category.id, name: category.name, sectionName: section?.name || 'N/A', totalQty: 0, totalSales: 0, totalCost: 0 };
                    currentCategory.totalQty += saleItem.qty;
                    currentCategory.totalSales += saleValue;
                    currentCategory.totalCost += costValue;
                    categoriesMap.set(category.id, currentCategory);
                }
            });
        });
        
        const sectionsResult = Array.from(sectionsMap.values()).map(s => ({...s, profit: s.totalSales - s.totalCost}));
        const categoriesResult = Array.from(categoriesMap.values()).map(c => ({...c, profit: c.totalSales - c.totalCost}));

        setReportData({ sections: sectionsResult, categories: categoriesResult });
    };
    
    const topCategoriesChartData = useMemo(() => {
        if (!reportData) return [];
        return reportData.categories.sort((a,b) => b.totalSales - a.totalSales).slice(0, 10);
    }, [reportData]);


    if (loading) {
        return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-10 w-10 animate-spin" /></div>;
    }

    return (
        <>
            <PageHeader title="تقرير مبيعات الأقسام والمجموعات" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>فلاتر التقرير</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <Label>المخزن/الفرع</Label>
                                <Select value={filters.warehouseId} onValueChange={v => handleFilterChange('warehouseId', v)} disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">الكل</SelectItem>
                                        {warehouses.map((w: Warehouse) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>من تاريخ</Label>
                                <Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>إلى تاريخ</Label>
                                <Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} />
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
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                         <Card>
                            <CardHeader>
                                <CardTitle>المبيعات حسب القسم الرئيسي</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                                    <BarChart data={reportData.sections} layout="vertical" margin={{ right: 20, left: 0 }}>
                                        <CartesianGrid horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" hide={isMobile} tickLine={false} axisLine={false} tickMargin={10} width={100} />
                                        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                        <Bar dataKey="totalSales" name="المبيعات" fill="var(--color-sales)" radius={5}>
                                            {!isMobile && <LabelList position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(value: number) => value.toLocaleString()} />}
                                        </Bar>
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader>
                                <CardTitle>أعلى 10 مجموعات سلعية مبيعًا</CardTitle>
                            </CardHeader>
                            <CardContent>
                                 <ChartContainer config={chartConfig} className="h-[300px] w-full">
                                    <BarChart data={topCategoriesChartData} layout="vertical" margin={{ right: 20, left: 0 }}>
                                        <CartesianGrid horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" hide={isMobile} tickLine={false} axisLine={false} tickMargin={10} width={100}/>
                                        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                        <Bar dataKey="totalSales" name="المبيعات" fill="var(--color-sales)" radius={5}>
                                            {!isMobile && <LabelList position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(value: number) => value.toLocaleString()} />}
                                        </Bar>
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>
                     </div>
                )}
                
                {reportData && (
                     <Card>
                        <CardHeader>
                            <CardTitle>البيانات التفصيلية</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className="w-full overflow-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>القسم/المجموعة</TableHead>
                                            <TableHead className="text-center">الكمية المباعة</TableHead>
                                            <TableHead className="text-center">إجمالي المبيعات</TableHead>
                                            <TableHead className="text-center hidden sm:table-cell">إجمالي التكلفة</TableHead>
                                            <TableHead className="text-center">صافي الربح</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.sections.map(section => (
                                            <React.Fragment key={section.id}>
                                                <TableRow className="bg-muted/50 font-bold">
                                                    <TableCell>{section.name}</TableCell>
                                                    <TableCell className="text-center">{section.totalQty.toLocaleString()}</TableCell>
                                                    <TableCell className="text-center">{section.totalSales.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                                    <TableCell className="text-center hidden sm:table-cell">{section.totalCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                                    <TableCell className="text-center">{section.profit.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                                </TableRow>
                                                {reportData.categories.filter(c => c.sectionName === section.name).map(category => (
                                                    <TableRow key={category.id}>
                                                        <TableCell className="pr-8">{category.name}</TableCell>
                                                        <TableCell className="text-center">{category.totalQty.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center">{category.totalSales.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                                        <TableCell className="text-center hidden sm:table-cell">{category.totalCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                                        <TableCell className="text-center">{category.profit.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                             </div>
                        </CardContent>
                     </Card>
                )}

            </main>
        </>
    );
}

