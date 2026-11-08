

"use client";

import React, { useMemo, useState } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2, ArrowLeft, ShoppingCart, TrendingUp, HandCoins } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";

// Data Interfaces
interface Promotion {
  id?: string;
  promoCode?: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed_amount' | 'buy_x_get_y_discount' | 'buy_n_get_cheapest_discount';
  value: number;
  buyCount?: number;
  buyNTargetMode?: 'all' | 'specific';
  targetType: 'category' | 'items';
  targetIds: string[];
  startDate: string;
  endDate: string;
  warehouseIds?: string[];
}

const getPromotionTypeLabel = (type: Promotion['type']) => {
    switch (type) {
        case 'percentage': return 'خصم نسبة مئوية';
        case 'fixed_amount': return 'خصم مبلغ ثابت';
        case 'buy_x_get_y_discount': return 'اشترِ صنفين، خصم على الأرخص';
        case 'buy_n_get_cheapest_discount': return 'اشترِ N أصناف، خصم على الأرخص';
        default: return type;
    }
}

const chartConfig = {
  profit: {
    label: "ربح",
    color: "hsl(var(--chart-2))",
  },
  loss: {
    label: "خسارة",
    color: "hsl(var(--destructive))",
  },
}

export default function PromotionReportPage() {
    const { promotions, posSales, salesInvoices, items, itemCategories, warehouses, loading } = useData();
    const router = useRouter();
    const params = useParams();
    const promotionId = params.id as string;
    const isMobile = useIsMobile();


    const reportData = useMemo(() => {
        if (loading || !promotionId) return null;

        const promotion = promotions.find((p: Promotion) => p.id === promotionId);
        if (!promotion) return { promotion: null, sales: [], itemDetails: [], totals: { sales: 0, profit: 0, itemsSold: 0 } };

        const allSales = [
            ...salesInvoices.filter((s: any) => s.status === 'approved'),
            ...posSales,
        ];

        const itemDetailsMap = new Map<string, any>();
        const salesWithPromo: any[] = [];
        
        let totalSalesValue = 0;
        let totalItemsSoldCount = 0;

        for (const sale of allSales) {
            let promoAppliedInSale = false;
            let profitOnPromoItems = 0;
            let promoItemsCountInSale = 0; // New counter for items affected in this sale

            for (const item of sale.items) {
                if (item.promoApplied === promotionId) {
                    promoAppliedInSale = true;
                    promoItemsCountInSale++; // Increment counter
                    
                    const masterItem = items.find((i: any) => i.id === item.id);
                    const itemCost = item.cost || masterItem?.cost || 0;
                    
                    let entry = itemDetailsMap.get(item.id);
                    if (!entry) {
                         entry = {
                            id: item.id,
                            name: item.name,
                            totalQty: 0,
                            totalRevenue: 0,
                            totalCost: 0,
                            totalDiscount: 0,
                        };
                    }
                    
                    const itemRevenue = item.price * item.qty;
                    const itemTotalCost = itemCost * item.qty;

                    entry.totalQty += item.qty;
                    entry.totalRevenue += itemRevenue;
                    entry.totalCost += itemTotalCost;
                    entry.totalDiscount += (item.originalPrice - item.price) * item.qty;
                    
                    profitOnPromoItems += (itemRevenue - itemTotalCost);

                    itemDetailsMap.set(item.id, entry);
                }
            }
            if(promoAppliedInSale){
                salesWithPromo.push({...sale, profitOnPromoItems, promoItemsCountInSale});
                totalSalesValue += sale.total;
            }
        }
        
        const finalItemDetails = Array.from(itemDetailsMap.values()).map(item => {
            const profit = item.totalRevenue - item.totalCost;
            return {
                ...item,
                profit: profit,
                loss: profit < 0 ? -profit : 0, // for chart stacking
                profitDisplay: profit, // for table display
            }
        });

        totalItemsSoldCount = finalItemDetails.reduce((acc, item) => acc + item.totalQty, 0);
        const totalProfit = finalItemDetails.reduce((acc, item) => acc + item.profit, 0);


        return { 
            promotion, 
            sales: salesWithPromo, 
            itemDetails: finalItemDetails,
            totals: { sales: totalSalesValue, profit: totalProfit, itemsSold: totalItemsSoldCount } 
        };

    }, [promotionId, promotions, posSales, salesInvoices, items, loading]);
    
    const targetItemsAndCategories = useMemo(() => {
        if (!reportData?.promotion) return { items: [], categories: [] };
        const { targetType, targetIds } = reportData.promotion;
        if (targetType === 'items') {
            return {
                items: items.filter((i: any) => targetIds.includes(i.id)),
                categories: []
            };
        }
        if (targetType === 'category') {
             return {
                items: [],
                categories: itemCategories.filter((c: any) => targetIds.includes(c.id))
            };
        }
        return { items: [], categories: [] };
    }, [reportData, items, itemCategories]);


    if (loading || !reportData) {
        return (
            <div className="flex flex-1 justify-center items-center">
                <Loader2 className="h-10 w-10 animate-spin" />
            </div>
        );
    }
    
    if(!reportData.promotion) {
        return (
            <>
            <PageHeader title="خطأ" />
            <main className="flex-1 p-4 md:p-6"><Card><CardContent className="p-6 text-center">لم يتم العثور على العرض المطلوب.</CardContent></Card></main>
            </>
        )
    }

    const { promotion, sales, itemDetails, totals } = reportData;

    return (
        <>
            <PageHeader title={`تقرير العرض: ${promotion.name}`}>
                 <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="ml-2 h-4 w-4" /> الرجوع
                </Button>
            </PageHeader>
            <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">إجمالي المبيعات</CardTitle><ShoppingCart className="h-4 w-4 text-muted-foreground"/></CardHeader>
                        <CardContent><div className="text-2xl font-bold">{totals.sales.toLocaleString()} ج.م</div><p className="text-xs text-muted-foreground">قيمة الفواتير التي استفادت من العرض</p></CardContent>
                    </Card>
                     <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">إجمالي الأرباح</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground"/></CardHeader>
                        <CardContent><div className="text-2xl font-bold text-green-600">{totals.profit.toLocaleString()} ج.م</div><p className="text-xs text-muted-foreground">الأرباح من الأصناف التي شملها العرض فقط</p></CardContent>
                    </Card>
                     <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">إجمالي الوحدات المباعة</CardTitle><HandCoins className="h-4 w-4 text-muted-foreground"/></CardHeader>
                        <CardContent><div className="text-2xl font-bold">{totals.itemsSold.toLocaleString()}</div><p className="text-xs text-muted-foreground">عدد الوحدات التي تم بيعها ضمن هذا العرض</p></CardContent>
                    </Card>
                </div>
                 <Card>
                    <CardHeader><CardTitle>تفاصيل العرض</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                            <div><Label>الاسم:</Label><p>{promotion.name}</p></div>
                            <div><Label>الكود:</Label><p className="font-mono">{promotion.promoCode}</p></div>
                            <div><Label>النوع:</Label><p>{getPromotionTypeLabel(promotion.type)}</p></div>
                            <div><Label>القيمة:</Label><p>{promotion.value}{promotion.type === 'percentage' ? '%' : ' ج.م'}</p></div>
                             <div><Label>تاريخ البدء:</Label><p>{new Date(promotion.startDate).toLocaleString('ar-EG')}</p></div>
                            <div><Label>تاريخ الانتهاء:</Label><p>{new Date(promotion.endDate).toLocaleString('ar-EG')}</p></div>
                             <div><Label>الفروع:</Label><p>{promotion.warehouseIds && promotion.warehouseIds.length > 0 ? promotion.warehouseIds.map((id:string) => warehouses.find((w:any) => w.id === id)?.name).join(', ') : 'كل الفروع'}</p></div>
                        </div>
                        <div>
                             <Label>الأصناف / المجموعات المستهدفة:</Label>
                             <div className="flex flex-wrap gap-2 mt-2">
                                {targetItemsAndCategories.items.map((item: any) => <Badge key={item.id} variant="secondary">{item.name}</Badge>)}
                                {targetItemsAndCategories.categories.map((cat: any) => <Badge key={cat.id}>{cat.name}</Badge>)}
                             </div>
                        </div>
                    </CardContent>
                 </Card>

                 <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>أداء الأصناف</CardTitle>
                            <CardDescription>رسم بياني يوضح ربح وخسارة كل صنف داخل العرض.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={chartConfig} className="h-[300px] w-full">
                                <BarChart data={itemDetails} layout="vertical" margin={{ right: 20, left: isMobile ? 0 : 5 }}>
                                    <CartesianGrid horizontal={false} />
                                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={isMobile ? 0 : 100} tick={!isMobile} />
                                    <XAxis type="number" hide />
                                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                    <Bar dataKey="profit" name="ربح" fill="var(--color-profit)" radius={5} stackId="a">
                                        <LabelList position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(v: number) => v.toLocaleString()} />
                                    </Bar>
                                    <Bar dataKey="loss" name="خسارة" fill="var(--color-loss)" radius={5} stackId="a">
                                         <LabelList position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(v: number) => v.toLocaleString()} />
                                    </Bar>
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader>
                            <CardTitle>البيانات التفصيلية للأصناف</CardTitle>
                            <CardDescription>جدول يوضح أداء كل صنف على حدة.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="w-full overflow-auto border rounded-lg h-[340px]">
                                <Table>
                                    <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead className="text-center">الكمية</TableHead><TableHead className="text-center">الإيراد</TableHead><TableHead className="text-center">الربح</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {itemDetails.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell className="text-center">{item.totalQty}</TableCell>
                                                <TableCell className="text-center">{item.totalRevenue.toLocaleString()}</TableCell>
                                                <TableCell className={`text-center font-semibold ${item.profitDisplay >= 0 ? 'text-green-600' : 'text-destructive'}`}>{item.profitDisplay.toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                             </div>
                        </CardContent>
                     </Card>
                 </div>
                 
                 <Card>
                    <CardHeader><CardTitle>الفواتير المتأثرة بالعرض</CardTitle></CardHeader>
                    <CardContent>
                         <div className="w-full overflow-auto border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>رقم الفاتورة</TableHead>
                                        <TableHead>العميل</TableHead>
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead className="text-center">الأصناف المتأثرة</TableHead>
                                        <TableHead className="text-center">إجمالي الفاتورة</TableHead>
                                        <TableHead className="text-center">ربح الأصناف بالعرض</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sales.length > 0 ? sales.map(sale => (
                                        <TableRow key={sale.id}>
                                            <TableCell className="font-mono">{sale.invoiceNumber}</TableCell>
                                            <TableCell>{(sale as any).customerName}</TableCell>
                                            <TableCell>{new Date(sale.date).toLocaleDateString('ar-EG')}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="secondary">{(sale as any).promoItemsCountInSale}</Badge>
                                            </TableCell>
                                            <TableCell className="text-center">{sale.total.toLocaleString()}</TableCell>
                                            <TableCell className="text-center font-semibold text-green-600">{(sale as any).profitOnPromoItems.toLocaleString()}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground p-6">لم يتم استخدام هذا العرض في أي فاتورة بعد.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                         </div>
                    </CardContent>
                 </Card>
            </main>
        </>
    );
}
