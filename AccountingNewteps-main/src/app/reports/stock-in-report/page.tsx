

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2, Filter, CheckCircle, Clock } from "lucide-react";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Combobox } from '@/components/ui/combobox';
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import Link from 'next/link';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";


interface StockInRecord {
  id: string;
  receiptNumber: string;
  date: string;
  warehouseId: string;
  fromWarehouseId?: string;
  purchaseInvoiceId?: string;
  createdByName?: string;
  reason?: string;
  items: { itemId: string; name: string; qty: number }[];
  allocations?: {
      date: string;
      userId: string;
      userName: string;
      itemId: string;
      sectionId: string;
      quantity: number;
  }[];
  status?: 'completed' | 'pending_putaway';
}

const AllocationDetails = ({ record, inventorySections, items }: { record: StockInRecord; inventorySections: any[]; items: any[]; }) => {
    if (!record.allocations || record.allocations.length === 0) {
        return <p className="p-4 text-sm text-muted-foreground">لم يتم تسكين أصناف هذا الإذن بعد.</p>;
    }

    const allocationsByItem = record.allocations.reduce((acc, alloc) => {
        const itemName = items.find(i => i.id === alloc.itemId)?.name || 'صنف غير معروف';
        if (!acc[alloc.itemId]) {
            acc[alloc.itemId] = {
                name: itemName,
                totalQty: 0,
                breakdown: []
            };
        }
        acc[alloc.itemId].totalQty += alloc.quantity;
        acc[alloc.itemId].breakdown.push({
            sectionName: inventorySections.find(s => s.id === alloc.sectionId)?.name || 'قسم غير معروف',
            quantity: alloc.quantity,
            userName: alloc.userName,
            date: alloc.date,
        });
        return acc;
    }, {} as Record<string, { name: string; totalQty: number; breakdown: any[] }>);
    
    return (
        <CardContent>
             <div className="space-y-4">
                {Object.values(allocationsByItem).map((itemData, index) => (
                    <div key={index} className="border p-3 rounded-md bg-muted/30">
                        <h4 className="font-semibold">{itemData.name} (الإجمالي: {itemData.totalQty})</h4>
                        <Table>
                             <TableHeader><TableRow><TableHead>القسم</TableHead><TableHead className="text-center">الكمية</TableHead><TableHead>المستخدم</TableHead><TableHead>التاريخ</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {itemData.breakdown.map((breakdown, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>{breakdown.sectionName}</TableCell>
                                        <TableCell className="text-center">{breakdown.quantity}</TableCell>
                                        <TableCell>{breakdown.userName}</TableCell>
                                        <TableCell>{new Date(breakdown.date).toLocaleString('ar-EG')}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ))}
             </div>
        </CardContent>
    )
}


export default function StockInReportPage() {
    const { stockInRecords, warehouses, inventorySections, items, purchaseInvoices, loading } = useData();
    const { user } = useAuth();
    const [filters, setFilters] = useState({
        warehouseId: 'all',
        fromDate: '',
        toDate: '',
        status: 'all', // New filter
    });
    
    useEffect(() => {
        if (user?.warehouseIds?.length === 1 && user.warehouseIds[0] !== 'all') {
            setFilters(prev => ({...prev, warehouseId: user.warehouseIds[0]}));
        }
    }, [user]);

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const reportData = useMemo(() => {
        if (loading) return [];
        return stockInRecords
            .filter((record: StockInRecord) => {
                const recordDate = new Date(record.date);
                const from = filters.fromDate ? new Date(filters.fromDate) : null;
                const to = filters.toDate ? new Date(filters.toDate) : null;
                if(from) from.setHours(0,0,0,0);
                if(to) to.setHours(23,59,59,999);

                if (from && recordDate < from) return false;
                if (to && recordDate > to) return false;
                if (filters.warehouseId !== 'all' && record.warehouseId !== filters.warehouseId) return false;
                
                // New status filter logic
                if (filters.status !== 'all') {
                    if (filters.status === 'completed' && record.status !== 'completed') return false;
                    if (filters.status === 'pending' && record.status === 'completed') return false;
                }

                return true;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [filters, stockInRecords, loading]);

    const getSourceName = (record: StockInRecord) => {
        if (record.purchaseInvoiceId) {
            const invoice = purchaseInvoices.find((inv: any) => inv.id === record.purchaseInvoiceId);
            return `فاتورة شراء (${invoice?.supplierName || 'غير محدد'})`;
        }
        if (record.fromWarehouseId) {
            const fromWarehouse = warehouses.find((w: any) => w.id === record.fromWarehouseId);
            return `تحويل من فرع (${fromWarehouse?.name || 'غير محدد'})`;
        }
        return record.reason || 'غير محدد';
    };
    
    const warehouseOptions = useMemo(() => ([
        {value: 'all', label: 'كل الفروع'},
        ...warehouses.filter((w:any) => w.isMain).map((w: any) => ({value: w.id, label: w.name}))
    ]), [warehouses]);


    return (
        <>
            <PageHeader title="تقرير التسكين (أذونات الدخول)" />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Filter/> فلاتر التقرير</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                         <div className="space-y-2">
                            <Label>المخزن الرئيسي</Label>
                            <Combobox
                                options={warehouseOptions}
                                value={filters.warehouseId}
                                onValueChange={(v) => handleFilterChange('warehouseId', v)}
                                placeholder="اختر مخزنًا..."
                                emptyMessage="لا يوجد مخازن رئيسية."
                                disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}
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
                         <div className="space-y-2">
                            <Label>الحالة</Label>
                            <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">الكل</SelectItem>
                                    <SelectItem value="pending">معلق</SelectItem>
                                    <SelectItem value="completed">تم التسكين</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>سجل عمليات التسكين</CardTitle>
                        <CardDescription>عرض تفصيلي لجميع أذونات الدخول وعمليات التسكين التي تمت عليها.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto"/></div> : (
                            <Accordion type="single" collapsible className="w-full">
                                {reportData.length > 0 ? reportData.map((record: StockInRecord) => (
                                    <AccordionItem value={record.id} key={record.id} className="border-b">
                                        <AccordionTrigger className="hover:no-underline">
                                            <div className="grid grid-cols-3 md:grid-cols-5 w-full text-right rtl:text-right text-sm">
                                                <span className="font-semibold col-span-2 md:col-span-1">{record.receiptNumber}</span>
                                                <span className="text-muted-foreground">{new Date(record.date).toLocaleDateString('ar-EG')}</span>
                                                <span className="hidden md:block text-muted-foreground">المستلم: {warehouses.find((w:any) => w.id === record.warehouseId)?.name}</span>
                                                <span className="hidden md:block text-muted-foreground">بواسطة: {record.createdByName}</span>
                                                <span className="text-left rtl:text-right">
                                                    <Badge variant={record.status === 'completed' ? 'default' : 'outline'} className={record.status !== 'completed' ? 'border-amber-500 text-amber-500' : 'bg-green-600'}>
                                                        {record.status === 'completed' ? <CheckCircle className="ml-1 h-3 w-3"/> : <Clock className="ml-1 h-3 w-3"/>}
                                                        {record.status === 'completed' ? 'تم التسكين' : 'معلق'}
                                                    </Badge>
                                                </span>
                                            </div>
                                        </AccordionTrigger>
                                        <AllocationDetails record={record} inventorySections={inventorySections} items={items}/>
                                    </AccordionItem>
                                )) : <p className="text-center text-muted-foreground p-6">لا توجد بيانات تطابق الفلاتر المحددة.</p>}
                            </Accordion>
                        )}
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
