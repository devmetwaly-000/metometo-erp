
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
import { Loader2, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface PosAuditLog {
  id: string;
  date: string;
  cashierId: string;
  cashierName: string;
  action: 'INVOICE_CANCELLED';
  details: {
    invoiceNumber: string;
    items: any[];
    total: number;
  };
}

interface User {
  id: string;
  name: string;
  isCashier?: boolean;
}

const InvoiceItemsDialog = ({ items }: { items: any[] }) => (
    <DialogContent>
        <DialogHeader>
            <DialogTitle>تفاصيل الأصناف الملغاة</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>الصنف</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-center">السعر</TableHead>
                        <TableHead className="text-center">الإجمالي</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items && items.length > 0 ? items.map((item, index) => (
                        <TableRow key={index}>
                            <TableCell>{item.name || 'صنف غير معروف'}</TableCell>
                            <TableCell className="text-center">{item.qty}</TableCell>
                            <TableCell className="text-center">{item.price?.toLocaleString() || '-'}</TableCell>
                            <TableCell className="text-center">{item.total?.toLocaleString() || '-'}</TableCell>
                        </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground p-4">لا توجد أصناف في هذه الفاتورة.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    </DialogContent>
);


export default function CancelledInvoicesReportPage() {
  const { posAuditLogs, users, loading } = useData();
  const [filters, setFilters] = useState({
    cashierId: "all",
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
  });
  const [selectedLog, setSelectedLog] = useState<PosAuditLog | null>(null);


  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const cashierOptions = useMemo(() => {
    const salesUsers = users.filter((u: User) => u.isCashier);
    return [{ value: 'all', label: 'كل الكاشيرات' }, ...salesUsers.map(u => ({ value: u.id, label: u.name }))];
  }, [users]);

  const reportData = useMemo(() => {
    if (loading) return [];
    return posAuditLogs
      .filter((log: PosAuditLog) => log.action === 'INVOICE_CANCELLED')
      .filter((log: PosAuditLog) => {
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
      .sort((a: PosAuditLog, b: PosAuditLog) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filters, posAuditLogs, loading]);

  return (
    <>
      <PageHeader title="تقرير الفواتير الملغاة" />
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

        <Card>
          <CardHeader>
            <CardTitle>سجل الإلغاء</CardTitle>
            <CardDescription>عرض لجميع فواتير نقاط البيع التي تم إلغاؤها بواسطة الكاشير.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                 <Dialog onOpenChange={(open) => !open && setSelectedLog(null)}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>رقم الفاتورة الملغاة</TableHead>
                          <TableHead>تاريخ الإلغاء</TableHead>
                          <TableHead>الكاشير</TableHead>
                          <TableHead className="text-center">إجمالي القيمة</TableHead>
                          <TableHead className="text-center">التفاصيل</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.length > 0 ? reportData.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="font-mono">{log.details.invoiceNumber}</TableCell>
                            <TableCell>{new Date(log.date).toLocaleString('ar-EG')}</TableCell>
                            <TableCell>{log.cashierName}</TableCell>
                            <TableCell className="text-center font-semibold">{log.details.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-center">
                                <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)}>
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                </DialogTrigger>
                            </TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد فواتير ملغاة تطابق الفلاتر.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    {selectedLog && <InvoiceItemsDialog items={selectedLog.details.items} />}
                </Dialog>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

    