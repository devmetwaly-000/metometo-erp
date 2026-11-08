

"use client";

import React, { useMemo, useState } from "react";
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
import { Loader2, TrendingUp, TrendingDown, Coins } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";

interface CashierSession {
  cashierId: string;
  cashierName: string;
  endTime?: string;
  expectedCash?: number;
  actualCash?: number;
  difference?: number;
  isClosed: boolean;
}
interface PosSession {
  id: string;
  startTime: string;
  isClosed: boolean;
  cashierSessions: {
    [key: string]: CashierSession;
  };
}
interface User {
    id: string;
    name: string;
    isCashier?: boolean;
}

export default function CashierDiscrepancyReportPage() {
  const { posSessions, users, loading } = useData();
  const [filters, setFilters] = useState({
    cashierId: "all",
    fromDate: "",
    toDate: "",
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const cashierOptions = useMemo(() => {
    const cashiers = users.filter((u: User) => u.isCashier);
    return [{ value: 'all', label: 'كل الكاشيرات' }, ...cashiers.map(u => ({ value: u.id, label: u.name }))];
  }, [users]);

  const reportData = useMemo(() => {
    if (loading) return [];
    
    const discrepancyLogs: any[] = [];
    
    posSessions
        .filter((session: PosSession) => session.isClosed)
        .forEach((session: PosSession) => {
            if(session.cashierSessions) {
                Object.values(session.cashierSessions)
                    .filter((cs: CashierSession) => cs.isClosed && cs.difference !== 0)
                    .forEach((cs: CashierSession) => {
                        discrepancyLogs.push({
                            id: `${session.id}-${cs.cashierId}`,
                            date: cs.endTime,
                            cashierId: cs.cashierId,
                            cashierName: cs.cashierName,
                            difference: cs.difference,
                        });
                    });
            }
        });
        
    return discrepancyLogs
      .filter((log) => {
        const logDate = new Date(log.date);
        const from = filters.fromDate ? new Date(filters.fromDate) : null;
        const to = filters.toDate ? new Date(filters.toDate) : null;
        if(from) from.setHours(0,0,0,0);
        if(to) to.setHours(23,59,59,999);

        if (from && logDate < from) return false;
        if (to && logDate > to) return false;
        if (filters.cashierId !== 'all' && log.cashierId !== filters.cashierId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filters, posSessions, loading]);
  
  const totalOverage = useMemo(() => reportData.filter(d => d.difference > 0).reduce((sum, d) => sum + d.difference, 0), [reportData]);
  const totalShortage = useMemo(() => reportData.filter(d => d.difference < 0).reduce((sum, d) => sum + d.difference, 0), [reportData]);


  return (
    <>
      <PageHeader title="تقرير العجز والزيادة للكاشيرات" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>فلاتر البحث</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>من تاريخ</Label>
                <Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>إلى تاريخ</Label>
                <Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>الكاشير</Label>
                <Combobox options={cashierOptions} value={filters.cashierId} onValueChange={v => handleFilterChange('cashierId', v)} placeholder="الكل" emptyMessage="لا يوجد كاشيرات." />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid gap-4 md:grid-cols-2">
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">إجمالي الزيادات</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground text-green-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{totalOverage.toLocaleString()} ج.م</div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">إجمالي العجز</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground text-destructive" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-destructive">{Math.abs(totalShortage).toLocaleString()} ج.م</div>
                </CardContent>
            </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>سجل الفروقات</CardTitle>
            <CardDescription>عرض لجميع الفروقات (عجز أو زيادة) التي تم تسجيلها عند إقفال ورديات الكاشيرات.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">الكاشير</TableHead>
                      <TableHead className="text-center">المبلغ</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.length > 0 ? reportData.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{new Date(log.date).toLocaleString('ar-EG')}</TableCell>
                        <TableCell>{log.cashierName}</TableCell>
                        <TableCell className={`text-center font-semibold ${log.difference > 0 ? 'text-green-600' : 'text-destructive'}`}>
                            {Math.abs(log.difference).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={log.difference > 0 ? 'default' : 'destructive'}>
                            {log.difference > 0 ? 'زيادة' : 'عجز'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">لا توجد سجلات عجز أو زيادة تطابق الفلاتر.</TableCell>
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
