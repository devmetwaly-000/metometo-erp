

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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";

// Data Interfaces
interface Return {
  id: string;
  receiptNumber?: string;
  date: string;
  customerId: string;
  customerName?: string;
  warehouseId: string;
  warehouseName?: string;
  originalInvoiceNumber?: string;
  total: number;
  items: { id: string; name: string; qty: number; price: number; total: number; code?: string; }[];
  type: 'Sales Return' | 'POS Return';
}

const ReturnItemsDialog = ({ items }: { items: any[] }) => (
    <DialogContent>
        <DialogHeader>
            <DialogTitle>تفاصيل الأصناف المرتجعة</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>الصنف</TableHead>
                        <TableHead>الباركود</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-center">السعر</TableHead>
                        <TableHead className="text-center">الإجمالي</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items && items.length > 0 ? items.map((item, index) => (
                        <TableRow key={index}>
                            <TableCell>{item.name || 'صنف غير معروف'}</TableCell>
                            <TableCell className="font-mono">{item.code || 'N/A'}</TableCell>
                            <TableCell className="text-center">{item.qty}</TableCell>
                            <TableCell className="text-center">{item.price?.toLocaleString() || '-'}</TableCell>
                            <TableCell className="text-center">{item.total?.toLocaleString() || '-'}</TableCell>
                        </TableRow>
                    )) : (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground p-4">لا توجد أصناف في هذا المرتجع.</TableCell></TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    </DialogContent>
);

export default function SalesReturnsReportPage() {
  const { salesReturns, posReturns, customers, warehouses, loading } = useData();
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    customerId: "all",
    warehouseId: user?.warehouseIds?.length === 1 ? user.warehouseIds[0] : "all",
    fromDate: "",
    toDate: "",
  });
  const isMobile = useIsMobile();

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  const customerOptions = useMemo(() => ([{value: 'all', label: 'كل العملاء'}, ...customers.map((c:any) => ({value: c.id, label: c.name}))]), [customers]);
  const warehouseOptions = useMemo(() => {
      const options = [{value: 'all', label: 'كل الفروع'}, ...warehouses.map((w:any) => ({value: w.id, label: w.name}))];
      if (user?.warehouseIds?.includes('all')) return options;
      return options.filter(w => w.value !== 'all' && user?.warehouseIds?.includes(w.value));
  }, [warehouses, user]);


  const { reportData, topReturnedItems } = useMemo(() => {
    if (loading) return { reportData: [], topReturnedItems: [] };
    
    const warehouseMap = new Map(warehouses.map((w: any) => [w.id, w.name]));
    const customerMap = new Map(customers.map((c: any) => [c.id, c.name]));
    const itemReturnCount = new Map<string, { name: string, count: number }>();

    const combinedReturns: Return[] = [
      ...salesReturns.map((r: any) => ({ ...r, type: 'Sales Return' })),
      ...posReturns.map((r: any) => ({ ...r, type: 'POS Return' })),
    ];

    const filteredData = combinedReturns.filter((ret: Return) => {
        const retDate = new Date(ret.date);
        const from = filters.fromDate ? new Date(filters.fromDate) : null;
        const to = filters.toDate ? new Date(filters.toDate) : null;
        if(from) from.setHours(0,0,0,0);
        if(to) to.setHours(23,59,59,999);

        if (from && retDate < from) return false;
        if (to && retDate > to) return false;
        if (filters.customerId !== 'all' && ret.customerId !== filters.customerId) return false;
        if (filters.warehouseId !== 'all' && ret.warehouseId !== filters.warehouseId) return false;
        return true;
    }).map((ret: Return) => {
        ret.items.forEach(item => {
            const current = itemReturnCount.get(item.id) || { name: item.name, count: 0 };
            current.count += item.qty;
            itemReturnCount.set(item.id, current);
        });

        return {
            ...ret,
            customerName: customerMap.get(ret.customerId) || 'عميل غير محدد',
            warehouseName: warehouseMap.get(ret.warehouseId) || 'غير محدد',
        }
    }).sort((a: Return, b: Return) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const topItems = Array.from(itemReturnCount.entries())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a,b) => b.count - a.count)
        .slice(0, 10);

    return { reportData: filteredData, topReturnedItems: topItems };

  }, [filters, salesReturns, posReturns, customers, warehouses, loading]);

  return (
    <>
      <PageHeader title="تقرير مرتجعات المبيعات" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>فلاتر البحث</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} /></div>
              <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} /></div>
              <div className="space-y-2"><Label>العميل</Label><Combobox options={customerOptions} value={filters.customerId} onValueChange={v => handleFilterChange('customerId', v)} placeholder="الكل" emptyMessage="لا يوجد عملاء."/></div>
              <div className="space-y-2">
                <Label>الفرع</Label>
                <Combobox 
                    options={warehouseOptions} 
                    value={filters.warehouseId} 
                    onValueChange={v => handleFilterChange('warehouseId', v)} 
                    placeholder="الكل" 
                    emptyMessage="لا يوجد فروع."
                    disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            <Card className="flex-1 lg:w-2/3">
              <CardHeader>
                <CardTitle>سجل المرتجعات</CardTitle>
                <CardDescription>عرض لجميع المرتجعات التي تمت بناءً على الفلاتر المحددة.</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="w-full overflow-auto border rounded-lg">
                     <Dialog>
                        <Table>
                          <TableHeader><TableRow><TableHead>رقم المرتجع</TableHead><TableHead>العميل</TableHead><TableHead className="hidden md:table-cell">التاريخ</TableHead><TableHead className="text-center">القيمة</TableHead><TableHead className="text-center">التفاصيل</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {reportData.length > 0 ? reportData.map((ret) => (
                              <TableRow key={ret.id}>
                                <TableCell className="font-mono">{ret.receiptNumber || 'N/A'}</TableCell>
                                <TableCell>{ret.customerName}</TableCell>
                                <TableCell className="hidden md:table-cell">{new Date(ret.date).toLocaleDateString('ar-EG')}</TableCell>
                                <TableCell className="text-center font-semibold text-destructive">{ret.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-center">
                                    <DialogTrigger asChild><Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button></DialogTrigger>
                                    <ReturnItemsDialog items={ret.items} />
                                </TableCell>
                              </TableRow>
                            )) : (
                              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد مرتجعات تطابق الفلاتر.</TableCell></TableRow>
                            )}
                          </TableBody>
                        </Table>
                    </Dialog>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="flex-1 lg:w-1/3">
                <CardHeader>
                    <CardTitle>أكثر الأصناف المرتجعة</CardTitle>
                    <CardDescription>الكميات المرتجعة لأكثر 10 أصناف.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                         <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <div className="h-[400px]">
                        <ChartContainer config={{}} className="w-full h-full">
                            <BarChart data={topReturnedItems} layout="vertical" margin={{ right: isMobile ? 5 : 20, left: 0 }}>
                                <CartesianGrid horizontal={false} />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} width={isMobile ? 0 : 100} tick={!isMobile} />
                                <XAxis type="number" hide />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                <Bar dataKey="count" name="الكمية المرتجعة" fill="hsl(var(--destructive))" radius={5}>
                                    <LabelList position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(v: number) => v.toLocaleString()} />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
      </main>
    </>
  );
}

    
