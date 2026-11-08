
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusCircle, Loader2, MoreHorizontal, FileText, ArrowLeftRight, Printer, Eye, Filter } from "lucide-react";
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useData } from '@/contexts/data-provider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { useAuth } from '@/contexts/auth-context';

interface StockTransferRecord {
  id: string;
  receiptNumber: string;
  date: string;
  fromSourceId: string;
  toSourceId: string;
  items: { name: string; qty: number }[];
}

export default function StockTransferListPage() {
  const { stockTransferRecords, warehouses, loading } = useData();
  const { user } = useAuth();
  const router = useRouter();

  const [filters, setFilters] = useState({
    warehouseId: user?.warehouseIds?.length === 1 ? user.warehouseIds[0] : "all",
    fromDate: "",
    toDate: "",
  });

  // Aggressive Cleanup for Pointer Events
  useEffect(() => {
    const cleanup = () => {
        document.body.style.pointerEvents = 'auto';
        document.body.style.overflow = 'auto';
    };
    cleanup();
    const timer = setTimeout(cleanup, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const warehouseOptions = useMemo(() => ([
    { value: 'all', label: 'كل الفروع والمخازن' },
    ...warehouses.map((w: any) => ({ value: w.id, label: w.name }))
  ]), [warehouses]);

  const filteredRecords = useMemo(() => {
    return stockTransferRecords.filter((record: any) => {
      const recordDate = new Date(record.date);
      const from = filters.fromDate ? new Date(filters.fromDate) : null;
      const to = filters.toDate ? new Date(filters.toDate) : null;

      if (from) from.setHours(0,0,0,0);
      if (to) to.setHours(23,59,59,999);

      if (from && recordDate < from) return false;
      if (to && recordDate > to) return false;
      
      if (filters.warehouseId !== 'all') {
          return record.fromSourceId === filters.warehouseId || record.toSourceId === filters.warehouseId;
      }
      
      return true;
    }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [stockTransferRecords, filters]);

  const getWarehouseName = (warehouseId: string) => {
    return warehouses.find((w: any) => w.id === warehouseId)?.name || 'غير معروف';
  };

  return (
    <>
      <PageHeader title="سجل تحويلات المخزون">
        <div className="flex gap-2 no-print">
            <Button variant="outline" onClick={() => window.print()}>
                <Printer className="ml-2 h-4 w-4" />
                طباعة السجل
            </Button>
            <Button className="gap-1" onClick={() => router.push('/inventory/transfer/new')}>
                <PlusCircle className="h-4 w-4" />
                إضافة إذن تحويل
            </Button>
        </div>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 printable-area">
        <Card className="no-print">
            <CardHeader>
                <CardTitle>فلاتر البحث</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     <div className="space-y-2">
                        <Label>المخزن (المحول منه أو إليه)</Label>
                        <Combobox
                          options={warehouseOptions}
                          value={filters.warehouseId}
                          onValueChange={(v) => handleFilterChange("warehouseId", v)}
                          placeholder="كل المخازن"
                          emptyMessage="لم يتم العثور على مخزن."
                          disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}
                        />
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
            <CardTitle>قائمة إيصالات التحويل</CardTitle>
            <CardDescription>
              عرض جميع عمليات تحويل المخزون التي تمت بين المخازن.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>رقم الإيصال</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>من مخزن</TableHead>
                      <TableHead>إلى مخزن</TableHead>
                      <TableHead className="text-center">الأصناف</TableHead>
                      <TableHead className="text-center w-[120px] no-print">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.length > 0 ? (
                      filteredRecords.map((record: any) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono font-bold">{record.receiptNumber}</TableCell>
                          <TableCell>{new Date(record.date).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell>{getWarehouseName(record.fromSourceId)}</TableCell>
                          <TableCell>{getWarehouseName(record.toSourceId)}</TableCell>
                          <TableCell className="text-center">{record.items.length}</TableCell>
                           <TableCell className="text-center no-print">
                             <div className="flex justify-center gap-2">
                                <Button variant="ghost" size="icon" onClick={() => router.push(`/inventory/transfer/${record.id}`)} title="عرض وتفاصيل">
                                    <Eye className="h-4 w-4 text-blue-500" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => router.push(`/inventory/transfer/${record.id}`)} title="طباعة">
                                    <Printer className="h-4 w-4" />
                                </Button>
                             </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          لا توجد إيصالات تحويل مسجلة.
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
