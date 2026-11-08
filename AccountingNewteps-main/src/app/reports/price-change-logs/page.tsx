

"use client";

import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2, ArrowRight } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";

interface PriceChangeLog {
  id: string;
  itemId: string;
  itemName: string;
  userId: string;
  userName: string;
  timestamp: string;
  oldPrice: number;
  newPrice: number;
  oldCost: number;
  newCost: number;
  source: string;
}

export default function PriceChangeLogsPage() {
  const { priceChangeLogs, items, users, loading } = useData();

  const [filters, setFilters] = useState({
    itemId: "",
    userId: "",
    fromDate: "",
    toDate: "",
  });

  useEffect(() => {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - 30);
    setFilters(prev => ({
        ...prev,
        fromDate: pastDate.toISOString().split('T')[0],
        toDate: today.toISOString().split('T')[0]
    }));
  }, []);


  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const filteredLogs = useMemo(() => {
    return priceChangeLogs.filter((log: PriceChangeLog) => {
      const logDate = new Date(log.timestamp);
      const from = filters.fromDate ? new Date(filters.fromDate) : null;
      const to = filters.toDate ? new Date(filters.toDate) : null;
      
      if (from) from.setHours(0, 0, 0, 0);
      if (to) to.setHours(23, 59, 59, 999);

      if (filters.itemId && log.itemId !== filters.itemId) return false;
      if (filters.userId && log.userId !== filters.userId) return false;
      if (from && logDate < from) return false;
      if (to && logDate > to) return false;

      return true;
    }).sort((a: PriceChangeLog, b: PriceChangeLog) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [priceChangeLogs, filters]);
  
  const itemOptions = useMemo(() => items.map((i: any) => ({ value: i.id, label: i.name })), [items]);
  const userOptions = useMemo(() => users.map((u: any) => ({ value: u.id, label: u.name })), [users]);


  return (
    <>
      <PageHeader title="سجل تغييرات الأسعار" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
            <CardHeader>
                <CardTitle>فلاتر البحث</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                     <div className="space-y-2">
                        <Label>الصنف</Label>
                        <Combobox options={itemOptions} value={filters.itemId} onValueChange={v => handleFilterChange('itemId', v)} placeholder="كل الأصناف" emptyMessage="لم يتم العثور على صنف." />
                    </div>
                     <div className="space-y-2">
                        <Label>المستخدم</Label>
                         <Combobox options={userOptions} value={filters.userId} onValueChange={v => handleFilterChange('userId', v)} placeholder="كل المستخدمين" emptyMessage="لم يتم العثور على مستخدم." />
                    </div>
                     <div className="space-y-2">
                        <Label>من تاريخ</Label>
                        <Input type="date" value={filters.fromDate} onChange={(e) => handleFilterChange("fromDate", e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label>إلى تاريخ</Label>
                        <Input type="date" value={filters.toDate} onChange={(e) => handleFilterChange("toDate", e.target.value)} />
                    </div>
                </div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle>سجل التغييرات</CardTitle>
                <CardDescription>عرض لجميع عمليات تغيير أسعار وتكاليف الأصناف التي تمت في النظام.</CardDescription>
            </CardHeader>
            <CardContent>
                 {loading ? (
                    <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : (
                    <div className="w-full overflow-auto border rounded-lg">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>التاريخ والوقت</TableHead>
                                    <TableHead>اسم الصنف</TableHead>
                                    <TableHead>المستخدم</TableHead>
                                    <TableHead>المصدر</TableHead>
                                    <TableHead className="text-center">التكلفة القديمة</TableHead>
                                    <TableHead className="text-center">التكلفة الجديدة</TableHead>
                                    <TableHead className="text-center">السعر القديم</TableHead>
                                    <TableHead className="text-center">السعر الجديد</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredLogs.map((log: PriceChangeLog) => (
                                    <TableRow key={log.id}>
                                        <TableCell>{new Date(log.timestamp).toLocaleString('ar-EG')}</TableCell>
                                        <TableCell className="font-medium">{log.itemName}</TableCell>
                                        <TableCell>{log.userName}</TableCell>
                                        <TableCell>{log.source === 'Excel Update' ? 'تحديث جماعي' : 'نموذج الصنف'}</TableCell>
                                        <TableCell className="text-center text-muted-foreground">{log.oldCost.toFixed(2)}</TableCell>
                                        <TableCell className={`text-center font-semibold ${log.newCost > log.oldCost ? 'text-green-500' : 'text-red-500'}`}>{log.newCost.toFixed(2)}</TableCell>
                                        <TableCell className="text-center text-muted-foreground">{log.oldPrice.toFixed(2)}</TableCell>
                                        <TableCell className={`text-center font-semibold ${log.newPrice > log.oldPrice ? 'text-green-500' : 'text-red-500'}`}>{log.newPrice.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                                {filteredLogs.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">لا توجد سجلات تطابق البحث.</TableCell>
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
