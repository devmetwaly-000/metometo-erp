

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
import { Loader2, Filter, PackageMinus } from "lucide-react";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Combobox } from '@/components/ui/combobox';
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import Link from 'next/link';

interface StockOutRecord {
  id: string;
  receiptNumber: string;
  date: string;
  sourceId: string; // This is the main warehouse ID
  createdByName?: string;
  reason?: string;
  items: { 
    id: string;
    name: string;
    qty: number; 
    sectionId: string; // The specific section/bin it was picked from
  }[];
}

interface ReportRow {
    logId: string;
    date: string;
    receiptNumber: string;
    warehouseName: string;
    itemName: string;
    sectionName: string;
    quantity: number;
    userName?: string;
}

export default function StockOutReportPage() {
    const { stockOutRecords, warehouses, inventorySections, loading } = useData();
    const { user } = useAuth();
    const [filters, setFilters] = useState({
        warehouseId: 'all',
        sectionId: 'all',
        fromDate: '',
        toDate: '',
    });
    
    useEffect(() => {
        if (user?.warehouseIds?.length === 1 && user.warehouseIds[0] !== 'all') {
            setFilters(prev => ({...prev, warehouseId: user.warehouseIds[0]}));
        }
    }, [user]);

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const warehouseOptions = useMemo(() => {
        const allowedWarehouses = user?.warehouseIds?.includes('all') 
            ? warehouses.filter((w:any) => w.isMain)
            : warehouses.filter((w:any) => w.isMain && user?.warehouseIds?.includes(w.id));

        return [
            {value: 'all', label: 'كل المخازن الرئيسية'},
            ...allowedWarehouses.map((w: any) => ({value: w.id, label: w.name}))
        ];
    }, [warehouses, user]);

    const sectionOptions = useMemo(() => {
        if (filters.warehouseId === 'all') return [{ value: 'all', label: 'كل الأقسام' }];
        const sectionsForWarehouse = inventorySections.filter((s: any) => s.mainWarehouseId === filters.warehouseId);
        return [{ value: 'all', label: 'كل الأقسام' }, ...sectionsForWarehouse.map((s: any) => ({ value: s.id, label: s.name }))];
    }, [inventorySections, filters.warehouseId]);


    const reportData: ReportRow[] = useMemo(() => {
        if (loading) return [];
        
        // Flatten the data: one row per item in each stock out record
        const flattenedData = stockOutRecords.flatMap((record: StockOutRecord) =>
            record.items.map(item => ({
                logId: `${record.id}-${item.id}-${item.sectionId}`,
                date: record.date,
                receiptNumber: record.receiptNumber,
                sourceId: record.sourceId, // Main warehouse ID
                itemName: item.name,
                sectionId: item.sectionId,
                quantity: item.qty,
                userName: record.createdByName,
                reason: record.reason,
            }))
        );

        return flattenedData
            .filter((log: any) => {
                const logDate = new Date(log.date);
                const from = filters.fromDate ? new Date(filters.fromDate) : null;
                const to = filters.toDate ? new Date(filters.toDate) : null;
                if(from) from.setHours(0,0,0,0);
                if(to) to.setHours(23,59,59,999);

                if (from && logDate < from) return false;
                if (to && logDate > to) return false;
                if (filters.warehouseId !== 'all' && log.sourceId !== filters.warehouseId) return false;
                
                if (filters.warehouseId === 'all') {
                     const sourceWarehouse = warehouses.find((w: any) => w.id === log.sourceId);
                     // Ensure we only show Main Warehouses (exclude Reps)
                     if (!sourceWarehouse?.isMain) return false;
                     // Respect user permissions
                     if (!user?.warehouseIds?.includes('all') && !user?.warehouseIds?.includes(log.sourceId)) return false;
                }

                if (filters.sectionId !== 'all' && log.sectionId !== filters.sectionId) return false;
                if(log.reason === 'sales_invoice') return false; // Exclude sales invoice records

                return true;
            })
            .map(log => ({
                ...log,
                warehouseName: warehouses.find((w: any) => w.id === log.sourceId)?.name || 'غير معروف',
                sectionName: inventorySections.find((s: any) => s.id === log.sectionId)?.name || 'قسم غير معروف',
            }))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
    }, [filters, stockOutRecords, loading, warehouses, inventorySections]);


    return (
        <>
            <PageHeader title="تقرير السحب من الأقسام" />
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
                            <Label>القسم / الحاوية</Label>
                            <Combobox
                                options={sectionOptions}
                                value={filters.sectionId}
                                onValueChange={(v) => handleFilterChange('sectionId', v)}
                                placeholder="اختر قسمًا..."
                                emptyMessage="اختر مخزنًا أولاً."
                                disabled={filters.warehouseId === 'all'}
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
                        <CardTitle>سجل عمليات السحب</CardTitle>
                        <CardDescription>عرض تفصيلي لجميع الأصناف المسحوبة من الأقسام الداخلية للمخازن (لا يشمل مبيعات الفروع).</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                             <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                        ) : (
                            <div className="w-full overflow-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>التاريخ</TableHead>
                                            <TableHead>إذن الصرف</TableHead>
                                            <TableHead>الصنف</TableHead>
                                            <TableHead>القسم المسحوب منه</TableHead>
                                            <TableHead className="text-center">الكمية</TableHead>
                                            <TableHead>المستخدم</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.length > 0 ? reportData.map((log) => (
                                            <TableRow key={log.logId}>
                                                <TableCell>{new Date(log.date).toLocaleDateString('ar-EG')}</TableCell>
                                                <TableCell>
                                                    <Link href={`/inventory/stock-out/${log.logId.split('-')[0]}`} className="font-mono hover:underline text-primary">
                                                        {log.receiptNumber}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>{log.itemName}</TableCell>
                                                <TableCell className="font-semibold">{log.sectionName}</TableCell>
                                                <TableCell className="text-center font-bold">{log.quantity}</TableCell>
                                                <TableCell>{log.userName}</TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                                    لا توجد بيانات تطابق الفلاتر المحددة.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
