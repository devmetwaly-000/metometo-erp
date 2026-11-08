
"use client";

import React, { useState, useMemo } from 'react';
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
import { Loader2, MapPin } from "lucide-react";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';

interface Visit {
    id: string;
    salesRepId: string;
    salesRepName: string;
    customerId: string;
    customerName: string;
    timestamp: string;
    notes: string;
    location: {
        latitude: number;
        longitude: number;
    };
}

export default function MonitorVisitsPage() {
    const { users, customerVisits, loading } = useData();
    const [filters, setFilters] = useState({
        salesRepId: 'all',
        fromDate: '2026-01-01',
        toDate: new Date().toISOString().split('T')[0],
    });

    const salesRepOptions = useMemo(() => {
        const reps = users.filter((u: any) => u.isSalesRep);
        return [{value: 'all', label: 'كل المناديب'}, ...reps.map((r: any) => ({value: r.id, label: r.name}))];
    }, [users]);
    
    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({...prev, [key]: value}));
    };

    const reportData: Visit[] = useMemo(() => {
        if (loading || !customerVisits) return [];

        return customerVisits.filter((visit: Visit) => {
            const visitDate = new Date(visit.timestamp);
            const from = filters.fromDate ? new Date(filters.fromDate) : null;
            const to = filters.toDate ? new Date(filters.toDate) : null;
            if(from) from.setHours(0,0,0,0);
            if(to) to.setHours(23,59,59,999);

            if (from && visitDate < from) return false;
            if (to && visitDate > to) return false;
            if (filters.salesRepId !== 'all' && visit.salesRepId !== filters.salesRepId) return false;
            
            return true;
        }).sort((a: Visit, b: Visit) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [filters, customerVisits, loading]);
    
    const openMap = (lat: number, lng: number) => {
        window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
    };

    return (
        <>
            <PageHeader title="متابعة زيارات المناديب" />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>فلاتر البحث</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>المندوب</Label>
                                <Combobox options={salesRepOptions} value={filters.salesRepId} onValueChange={(v) => handleFilterChange('salesRepId', v)} placeholder="اختر مندوبًا..." emptyMessage="لا يوجد مناديب."/>
                            </div>
                            <div className="space-y-2">
                                <Label>من تاريخ</Label>
                                <Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>إلى تاريخ</Label>
                                <Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader>
                        <CardTitle>سجل الزيارات</CardTitle>
                        <CardDescription>عرض لجميع الزيارات المسجلة من قبل المناديب خلال الفترة المحددة.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin"/></div> : (
                            <div className="w-full overflow-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>التاريخ والوقت</TableHead>
                                            <TableHead>المندوب</TableHead>
                                            <TableHead>العميل</TableHead>
                                            <TableHead>الملاحظات</TableHead>
                                            <TableHead className="text-center">الموقع</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.length > 0 ? reportData.map(visit => (
                                            <TableRow key={visit.id}>
                                                <TableCell>{new Date(visit.timestamp).toLocaleString('ar-EG')}</TableCell>
                                                <TableCell>{visit.salesRepName}</TableCell>
                                                <TableCell>{visit.customerName}</TableCell>
                                                <TableCell className="max-w-xs truncate">{visit.notes}</TableCell>
                                                <TableCell className="text-center">
                                                    <Button variant="outline" size="sm" onClick={() => openMap(visit.location.latitude, visit.location.longitude)}>
                                                        <MapPin className="ml-2 h-4 w-4"/>
                                                        عرض على الخريطة
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                                    لا توجد زيارات مسجلة تطابق الفلاتر المحددة.
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
