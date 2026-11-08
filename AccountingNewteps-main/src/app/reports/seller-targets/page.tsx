

"use client";

import React, { useMemo, useState, useEffect } from "react";
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
import { useData } from "@/contexts/data-provider";
import { Loader2, Target, TrendingUp } from "lucide-react";
import { useSearchParams } from 'next/navigation';
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/auth-context";


interface Seller {
    id: string;
    name: string;
    warehouseId?: string;
}
interface Sale {
    sellerId?: string;
    warehouseId?: string;
    total: number;
    date: string;
}
interface Warehouse {
    id: string;
    name: string;
    isMain?: boolean;
}

const chartConfig = {
  achievement: {
    label: "الإنجاز",
    color: "hsl(var(--chart-1))",
  },
};

export default function SellerTargetReportPage() {
    const { sellers, posSales, salesInvoices, targets, warehouses, loading } = useData();
    const searchParams = useSearchParams();
    const isMobile = useIsMobile();
    const { user } = useAuth();
    
    const [month, setMonth] = useState(String(new Date().getMonth() + 1));
    const [year, setYear] = useState(String(new Date().getFullYear()));
    const [warehouseFilter, setWarehouseFilter] = useState('all');
    
    useEffect(() => {
        if (user?.warehouseIds?.length === 1 && user.warehouseIds[0] !== 'all') {
            setWarehouseFilter(user.warehouseIds[0]);
        }
    }, [user]);

    const sellerIdFromQuery = searchParams.get('sellerId');

    const reportData = useMemo(() => {
        if (loading) return { branches: [], sellers: [] };

        const startDate = new Date(Number(year), Number(month) - 1, 1);
        const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);

        const allSales: Sale[] = [
            ...posSales,
            ...salesInvoices.filter((inv: any) => inv.status === 'approved')
        ];

        const filteredSales = allSales.filter((sale: Sale) => {
            const saleDate = new Date(sale.date);
            const inDateRange = saleDate >= startDate && saleDate <= endDate;
            if (!inDateRange) return false;
            if (warehouseFilter !== 'all' && sale.warehouseId !== warehouseFilter) return false;
            return true;
        });

        // Branch Targets
        const branchReport = warehouses.filter((w: Warehouse) => !w.isMain).map((warehouse: Warehouse) => {
            const branchSales = filteredSales.filter(s => s.warehouseId === warehouse.id);
            const totalSales = branchSales.reduce((acc, s) => acc + s.total, 0);
            const target = targets?.branches?.[warehouse.id] || 0;
            const achievement = target > 0 ? (totalSales / target) * 100 : 0;
            return {
                id: warehouse.id,
                name: warehouse.name,
                target,
                totalSales,
                achievement: Math.min(100, achievement),
                realAchievement: achievement,
            };
        }).sort((a,b) => b.achievement - a.achievement);

        // Seller Targets
        let sellersToReport = sellers;
        if(sellerIdFromQuery) {
            sellersToReport = sellers.filter((s: Seller) => s.id === sellerIdFromQuery);
        } else if (warehouseFilter !== 'all') {
            sellersToReport = sellers.filter((s: Seller) => s.warehouseId === warehouseFilter);
        }

        const sellerReport = sellersToReport.map((seller: Seller) => {
            const sellerSales = filteredSales.filter(s => s.sellerId === seller.id);
            const totalSales = sellerSales.reduce((acc, s) => acc + s.total, 0);
            const target = targets?.sellers?.[seller.id] || 0;
            const achievement = target > 0 ? (totalSales / target) * 100 : 0;

            return {
                id: seller.id,
                name: seller.name,
                target,
                totalSales,
                achievement: Math.min(100, achievement),
                realAchievement: achievement,
            };
        }).sort((a,b) => b.achievement - a.achievement);

        return { branches: branchReport, sellers: sellerReport };

    }, [sellers, posSales, salesInvoices, targets, month, year, sellerIdFromQuery, warehouseFilter, warehouses, loading]);
    
    const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
    const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(0, i).toLocaleString('ar-EG', { month: 'long' }) }));
    const warehouseOptions = React.useMemo(() => [{value: 'all', label: 'كل الفروع'}, ...warehouses.filter((w: any) => !w.isMain).map((w: any) => ({ value: w.id, label: w.name }))], [warehouses]);


    return (
        <>
            <PageHeader title={sellerIdFromQuery ? `تقرير هدف البائع: ${sellers.find((s:any) => s.id === sellerIdFromQuery)?.name}` : "تقرير أهداف المبيعات"} />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                 <Card>
                    <CardHeader>
                        <CardTitle>فترة التقرير</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="branch-filter">الفرع</Label>
                                <Combobox options={warehouseOptions} value={warehouseFilter} onValueChange={setWarehouseFilter} placeholder="الكل" emptyMessage="لا يوجد فروع" disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="month">الشهر</Label>
                                <Select value={month} onValueChange={setMonth}>
                                    <SelectTrigger id="month"><SelectValue/></SelectTrigger>
                                    <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="year">السنة</Label>
                                <Select value={year} onValueChange={setYear}>
                                    <SelectTrigger id="year"><SelectValue/></SelectTrigger>
                                    <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Tabs defaultValue="sellers">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="sellers">أداء البائعين</TabsTrigger>
                        <TabsTrigger value="branches">أداء الفروع</TabsTrigger>
                    </TabsList>
                    <TabsContent value="sellers">
                         <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
                            <Card className="lg:col-span-3">
                                <CardHeader>
                                    <CardTitle>أداء المبيعات الشهري للبائعين</CardTitle>
                                    <CardDescription>
                                        مقارنة بين المبيعات المحققة والهدف الشهري لكل بائع في الفرع المحدد.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                     {loading ? (
                                        <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                                    ) : (
                                         <div className="w-full overflow-auto border rounded-lg">
                                            <Table>
                                                <TableHeader><TableRow><TableHead>البائع</TableHead><TableHead className="text-center">الهدف الشهري</TableHead><TableHead className="text-center">المبيعات المحققة</TableHead><TableHead className="w-[250px] text-center">نسبة الإنجاز</TableHead></TableRow></TableHeader>
                                                <TableBody>
                                                    {reportData.sellers.length > 0 ? reportData.sellers.map(d => (
                                                        <TableRow key={d.id}>
                                                            <TableCell>{d.name}</TableCell>
                                                            <TableCell className="text-center">{d.target.toLocaleString()} ج.م</TableCell>
                                                            <TableCell className="text-center">{d.totalSales.toLocaleString()} ج.م</TableCell>
                                                            <TableCell>
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <Progress value={d.achievement} className="w-full h-3 flex-1"/>
                                                                    <Badge className={cn(d.realAchievement >= 100 ? "bg-green-500" : "bg-amber-500")}>
                                                                        {d.realAchievement.toFixed(1)}%
                                                                    </Badge>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )) : <TableRow><TableCell colSpan={4} className="text-center py-6">لا توجد بيانات</TableCell></TableRow>}
                                                </TableBody>
                                            </Table>
                                         </div>
                                    )}
                                </CardContent>
                            </Card>
                            <Card className="lg:col-span-2">
                                <CardHeader>
                                     <CardTitle>رسم بياني للإنجاز (البائعون)</CardTitle>
                                </CardHeader>
                                 <CardContent>
                                     {loading ? (
                                        <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                                    ) : (
                                    <div className="w-full h-[400px]">
                                       <ChartContainer config={chartConfig} className="w-full h-full">
                                        <BarChart data={reportData.sellers} layout="vertical" margin={{ left: isMobile ? -20 : 10, right: 40 }}>
                                                <CartesianGrid horizontal={false} />
                                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={isMobile ? 0 : 80} tick={!isMobile} />
                                                <XAxis type="number" hide />
                                                <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value, name, item) => [`${item.payload.realAchievement.toFixed(1)}%`, name]} labelFormatter={(label) => `البائع: ${label}`} />} />
                                                <Bar dataKey="achievement" name="نسبة الإنجاز" fill="var(--color-achievement)" radius={5}>
                                                    {!isMobile && (
                                                        <LabelList dataKey="realAchievement" position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(value: number) => `${value.toFixed(1)}%`} />
                                                    )}
                                                </Bar>
                                            </BarChart>
                                        </ChartContainer>
                                    </div>
                                    )}
                                 </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                    <TabsContent value="branches">
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
                            <Card className="lg:col-span-3">
                                <CardHeader>
                                    <CardTitle>أداء المبيعات الشهري للفروع</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {loading ? (
                                        <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                                    ) : (
                                         <div className="w-full overflow-auto border rounded-lg">
                                            <Table>
                                                <TableHeader><TableRow><TableHead>الفرع</TableHead><TableHead className="text-center">الهدف</TableHead><TableHead className="text-center">المحقق</TableHead><TableHead className="w-[250px] text-center">الإنجاز</TableHead></TableRow></TableHeader>
                                                <TableBody>
                                                    {reportData.branches.map(d => (
                                                        <TableRow key={d.id}><TableCell>{d.name}</TableCell><TableCell className="text-center">{d.target.toLocaleString()} ج.م</TableCell><TableCell className="text-center">{d.totalSales.toLocaleString()} ج.م</TableCell><TableCell><div className="flex items-center justify-center gap-2"><Progress value={d.achievement} className="w-full h-3 flex-1"/><Badge className={cn(d.realAchievement >= 100 ? "bg-green-500" : "bg-amber-500")}>{d.realAchievement.toFixed(1)}%</Badge></div></TableCell></TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                         </div>
                                    )}
                                </CardContent>
                            </Card>
                             <Card className="lg:col-span-2">
                                <CardHeader><CardTitle>رسم بياني للإنجاز (الفروع)</CardTitle></CardHeader>
                                 <CardContent>
                                     {loading ? (
                                        <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                                    ) : (
                                    <div className="w-full h-[400px]">
                                       <ChartContainer config={chartConfig} className="w-full h-full">
                                         <BarChart data={reportData.branches} layout="vertical" margin={{ left: isMobile ? -20 : 10, right: 40 }}>
                                                <CartesianGrid horizontal={false} />
                                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={isMobile ? 0 : 80} tick={!isMobile} />
                                                <XAxis type="number" hide />
                                                <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value, name, item) => [`${item.payload.realAchievement.toFixed(1)}%`, name]} labelFormatter={(label) => `الفرع: ${label}`} />} />
                                                <Bar dataKey="achievement" name="نسبة الإنجاز" fill="var(--color-achievement)" radius={5}>
                                                    {!isMobile && (
                                                        <LabelList dataKey="realAchievement" position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(value: number) => `${value.toFixed(1)}%`} />
                                                    )}
                                                </Bar>
                                            </BarChart>
                                        </ChartContainer>
                                    </div>
                                    )}
                                 </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </main>
        </>
    );
}
