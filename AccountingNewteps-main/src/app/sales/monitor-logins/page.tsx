
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

interface LoginRecord {
    id: string;
    userId: string;
    userName: string;
    timestamp: string;
    location?: {
        latitude: number;
        longitude: number;
    } | null;
    error?: string;
}

export default function MonitorLoginsPage() {
    const { users, loginHistory, loading } = useData();
    const [filters, setFilters] = useState({
        userId: 'all',
        fromDate: '2026-01-01',
        toDate: new Date().toISOString().split('T')[0],
    });

    const userOptions = useMemo(() => {
        return [{value: 'all', label: 'كل المستخدمين'}, ...users.map((r: any) => ({value: r.id, label: r.name}))];
    }, [users]);
    
    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({...prev, [key]: value}));
    };

    const reportData: LoginRecord[] = useMemo(() => {
        if (loading || !loginHistory) return [];

        return loginHistory.filter((log: LoginRecord) => {
            const logDate = new Date(log.timestamp);
            const from = filters.fromDate ? new Date(filters.fromDate) : null;
            const to = filters.toDate ? new Date(filters.toDate) : null;
            if(from) from.setHours(0,0,0,0);
            if(to) to.setHours(23,59,59,999);

            if (from && logDate < from) return false;
            if (to && logDate > to) return false;
            if (filters.userId !== 'all' && log.userId !== filters.userId) return false;
            
            return true;
        }).sort((a: LoginRecord, b: LoginRecord) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [filters, loginHistory, loading]);
    
    const openMap = (lat: number, lng: number) => {
        window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
    };

    return (
        <>
            <PageHeader title="مراقبة تسجيلات الدخول" />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>فلاتر البحث</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>المستخدم</Label>
                                <Combobox options={userOptions} value={filters.userId} onValueChange={(v) => handleFilterChange('userId', v)} placeholder="اختر مستخدمًا..." emptyMessage="لا يوجد مستخدمون."/>
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
                        <CardTitle>سجل الدخول</CardTitle>
                        <CardDescription>عرض لجميع عمليات تسجيل الدخول الناجحة مع الموقع الجغرافي المسجل.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin"/></div> : (
                            <div className="w-full overflow-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>التاريخ والوقت</TableHead>
                                            <TableHead>المستخدم</TableHead>
                                            <TableHead className="text-center">الموقع</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reportData.length > 0 ? reportData.map(log => (
                                            <TableRow key={log.id}>
                                                <TableCell>{new Date(log.timestamp).toLocaleString('ar-EG')}</TableCell>
                                                <TableCell>{log.userName}</TableCell>
                                                <TableCell className="text-center">
                                                    {log.location ? (
                                                        <Button variant="outline" size="sm" onClick={() => openMap(log.location!.latitude, log.location!.longitude)}>
                                                            <MapPin className="ml-2 h-4 w-4"/>
                                                            عرض على الخريطة
                                                        </Button>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">{log.error || "لم يتم تحديد الموقع"}</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                                                    لا توجد سجلات دخول تطابق الفلاتر المحددة.
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
