

"use client";

import React, { useState, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useData } from "@/contexts/data-provider";
import { Loader2, Eye, Filter } from "lucide-react";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Combobox } from '@/components/ui/combobox';
import { useAuth } from '@/contexts/auth-context';

interface RestaurantTable {
  id: string;
  name: string;
  number: number;
  warehouseId: string;
}
interface Sale {
  id: string;
  date: string;
  tableId?: string;
  tableName?: string;
  customerName?: string;
  total: number;
  items: any[];
  warehouseId?: string;
}
interface ReportData {
  table: RestaurantTable;
  orderCount: number;
  totalSales: number;
  customers: string[];
  allItems: { name: string; qty: number; }[];
}

export default function TablesReportPage() {
    const { restaurantTables, salesInvoices, posSales, loading, warehouses } = useData();
    const { user } = useAuth();
    const [filters, setFilters] = useState({
        fromDate: "",
        toDate: "",
        warehouseId: user?.warehouseIds?.length === 1 ? user.warehouseIds[0] : 'all',
    });
    
    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const warehouseOptions = useMemo(() => ([
        { value: 'all', label: 'كل الفروع' },
        ...warehouses.filter((w: any) => !w.isMain).map((w: any) => ({ value: w.id, label: w.name }))
    ]), [warehouses]);


    const reportData: ReportData[] = useMemo(() => {
        if (loading) return [];
        
        const allSales: Sale[] = [...salesInvoices, ...posSales];

        const filteredSales = allSales.filter(sale => {
            if (!sale.tableId) return false;
            
            const saleDate = new Date(sale.date);
            const from = filters.fromDate ? new Date(filters.fromDate) : null;
            const to = filters.toDate ? new Date(filters.toDate) : null;
            if(from) from.setHours(0,0,0,0);
            if(to) to.setHours(23,59,59,999);

            if (from && saleDate < from) return false;
            if (to && saleDate > to) return false;
            
            const saleWarehouseId = sale.warehouseId || restaurantTables.find(t => t.id === sale.tableId)?.warehouseId;
            if (filters.warehouseId !== 'all' && saleWarehouseId !== filters.warehouseId) return false;

            return true;
        });
        
        const tablesToReport = filters.warehouseId === 'all' 
            ? restaurantTables 
            : restaurantTables.filter(t => t.warehouseId === filters.warehouseId);

        return tablesToReport.map(table => {
            const tableSales = filteredSales.filter(sale => sale.tableId === table.id);
            if(tableSales.length === 0) return null;

            const customers = [...new Set(tableSales.map(s => s.customerName).filter(Boolean))];
            
            const allItemsMap = new Map<string, { name: string, qty: number }>();
            tableSales.forEach(sale => {
                sale.items.forEach(item => {
                    const existing = allItemsMap.get(item.name);
                    if (existing) {
                        existing.qty += item.qty;
                    } else {
                        allItemsMap.set(item.name, { name: item.name, qty: item.qty });
                    }
                });
            });

            return {
                table,
                orderCount: tableSales.length,
                totalSales: tableSales.reduce((acc, s) => acc + s.total, 0),
                customers,
                allItems: Array.from(allItemsMap.values()),
            };
        }).filter((item): item is ReportData => item !== null).sort((a,b) => b.totalSales - a.totalSales);

    }, [restaurantTables, salesInvoices, posSales, filters, loading]);

    return (
        <>
            <PageHeader title="تقرير الطاولات" />
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
                                placeholder="عرض كل الفروع"
                                emptyMessage="لا يوجد فروع."
                                disabled={!!(user && user.warehouseIds && user.warehouseIds.length === 1 && user.warehouseIds[0] !== 'all')}
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

                <Card>
                    <CardHeader>
                        <CardTitle>ملخص نشاط الطاولات</CardTitle>
                        <CardDescription>عرض لعدد الطلبات وإجمالي المبيعات لكل طاولة خلال الفترة المحددة.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? <Loader2 className="animate-spin mx-auto"/> : (
                             <Accordion type="single" collapsible className="w-full">
                                {reportData.length > 0 ? reportData.map(data => (
                                    <AccordionItem value={data.table.id} key={data.table.id}>
                                        <AccordionTrigger>
                                             <div className="grid grid-cols-3 md:grid-cols-5 w-full text-right rtl:text-right">
                                                <span className="font-bold">طاولة {data.table.number} ({data.table.name})</span>
                                                <span><span className="font-semibold">{data.orderCount}</span> طلب</span>
                                                <span className="font-semibold col-span-2 md:col-span-1">إجمالي: {data.totalSales.toLocaleString()} ج.م</span>
                                                <span className="hidden md:block col-span-2 text-sm text-muted-foreground truncate">
                                                    العملاء: {data.customers.join(', ') || 'N/A'}
                                                </span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <p className="font-semibold mb-2">إجمالي الأصناف المطلوبة على هذه الطاولة:</p>
                                            <Table>
                                                <TableHeader><TableRow><TableHead className="text-right">الصنف</TableHead><TableHead className="text-center">الكمية</TableHead></TableRow></TableHeader>
                                                <TableBody>
                                                    {data.allItems.map(item => (
                                                        <TableRow key={item.name}><TableCell>{item.name}</TableCell><TableCell className="text-center">{item.qty}</TableCell></TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </AccordionContent>
                                    </AccordionItem>
                                )) : <p className="text-center text-muted-foreground p-6">لا توجد بيانات لعرضها في الفترة المحددة.</p>}
                            </Accordion>
                        )}
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
