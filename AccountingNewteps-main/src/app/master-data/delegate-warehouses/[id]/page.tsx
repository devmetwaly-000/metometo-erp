"use client";

import React, { useMemo } from "react";
import PageHeader from "@/components/page-header";
import { useData } from "@/contexts/data-provider";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Package, DollarSign, ShoppingCart, ArrowLeftRight, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useState } from "react";

const InvoiceRow = ({ sale, warehouseId, stockIssuesToReps, stockReturnsFromReps, salesInvoices, salesReturns }: { sale: any, warehouseId: string, stockIssuesToReps: any[], stockReturnsFromReps: any[], salesInvoices: any[], salesReturns: any[] }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const getHistoricalStock = (itemId: string, dateStr: string) => {
        const targetDate = new Date(dateStr).getTime();
        
        // 1. In (Issues to Rep + Sales Returns)
        const issuesQty = stockIssuesToReps
            .filter(r => r.toWarehouseId === warehouseId && new Date(r.createdAt || r.date).getTime() < targetDate)
            .reduce((acc, r) => {
                const item = r.items?.find((i: any) => (i.id === itemId || i.itemId === itemId));
                return acc + (item?.qty || 0);
            }, 0);
            
        const returnsInQty = salesReturns
            .filter(r => r.warehouseId === warehouseId && new Date(r.createdAt || r.date).getTime() < targetDate)
            .reduce((acc, r) => {
                const item = r.items?.find((i: any) => (i.id === itemId || i.itemId === itemId));
                return acc + (item?.qty || 0);
            }, 0);

        // 2. Out (Sales + Returns from Rep)
        const salesOutQty = salesInvoices
            .filter(r => r.warehouseId === warehouseId && r.status !== 'void' && new Date(r.createdAt || r.date).getTime() < targetDate)
            .reduce((acc, r) => {
                const item = r.items?.find((i: any) => (i.id === itemId || i.itemId === itemId));
                return acc + (item?.qty || 0);
            }, 0);
            
        const returnsOutQty = stockReturnsFromReps
            .filter(r => r.fromWarehouseId === warehouseId && new Date(r.createdAt || r.date).getTime() < targetDate)
            .reduce((acc, r) => {
                const item = r.items?.find((i: any) => (i.id === itemId || i.itemId === itemId));
                return acc + (item?.qty || 0);
            }, 0);

        return (issuesQty + returnsInQty) - (salesOutQty + returnsOutQty);
    };

    return (
        <>
            <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setIsExpanded(!isExpanded)}>
                <TableCell className="font-mono font-medium">
                    <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        #{sale.invoiceNumber}
                    </div>
                </TableCell>
                <TableCell>{format(new Date(sale.createdAt), "PPP p", { locale: ar })}</TableCell>
                <TableCell>{sale.customerName}</TableCell>
                <TableCell className="text-center font-bold text-green-600">{formatCurrency(sale.totalAmount)}</TableCell>
            </TableRow>
            {isExpanded && (
                <TableRow className="bg-muted/30">
                    <TableCell colSpan={4} className="p-4">
                        <div className="rounded-md border bg-background p-4">
                            <h4 className="mb-4 text-sm font-semibold">تفاصيل الأصناف وحركة المخزون</h4>
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead>الصنف</TableHead>
                                        <TableHead className="text-center">رصيد قبل</TableHead>
                                        <TableHead className="text-center">الكمية المباعة (الحركة)</TableHead>
                                        <TableHead className="text-center">رصيد بعد</TableHead>
                                        <TableHead className="text-center">الإجمالي</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sale.items.map((item: any, idx: number) => {
                                        const stockBefore = getHistoricalStock(item.id, sale.createdAt || sale.date);
                                        const stockAfter = stockBefore - item.qty;
                                        return (
                                            <TableRow key={idx} className="hover:bg-transparent">
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell className="text-center font-mono">{stockBefore}</TableCell>
                                                <TableCell className="text-center font-bold text-red-600">-{item.qty}</TableCell>
                                                <TableCell className="text-center font-mono">{stockAfter}</TableCell>
                                                <TableCell className="text-center">{formatCurrency(item.total)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </>
    );
};

export default function DelegateWarehouseDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { 
    warehouses, 
    users, 
    inventory, 
    allItems, 
    stockIssuesToReps, 
    stockReturnsFromReps,
    salesInvoices,
    salesReturns,
    customers,
    loading 
  } = useData();

  // 1. Get Warehouse & Delegate Info
  const warehouse = useMemo(() => warehouses.find((w: any) => w.id === id), [warehouses, id]);
  const delegate = useMemo(() => users.find((u: any) => u.id === warehouse?.repId), [users, warehouse]);

  // 2. Get Inventory Data
  const warehouseInventory = useMemo(() => {
    if (!id || !inventory) return [];
    
    // Filter inventory for this warehouse
    const itemsInStock = inventory.filter((item: any) => item.warehouseId === id && item.quantity > 0);
    
    // Map to product details
    return itemsInStock.map((stockItem: any) => {
      const product = allItems.find((p: any) => p.id === stockItem.itemId);
      return {
        ...stockItem,
        productName: product?.name || "منتج غير معروف",
        productCode: product?.barcode || product?.code || "-",
        costPrice: product?.costPrice || 0,
        totalCost: (product?.costPrice || 0) * stockItem.quantity,
        sellPrice: product?.sellPrice || 0
      };
    });
  }, [inventory, allItems, id]);

  const inventoryStats = useMemo(() => {
    const totalItems = warehouseInventory.reduce((acc, item) => acc + item.quantity, 0);
    const totalCost = warehouseInventory.reduce((acc, item) => acc + item.totalCost, 0);
    const totalSellValue = warehouseInventory.reduce((acc, item) => acc + (item.sellPrice * item.quantity), 0);
    return { totalItems, totalCost, totalSellValue };
  }, [warehouseInventory]);

  // 3. Get Movements Data (Issues & Returns)
  const movements = useMemo(() => {
    const issues = (stockIssuesToReps || []).filter((r: any) => r.toWarehouseId === id).map((r: any) => ({
      ...r,
      type: 'issue',
      typeLabel: 'استلام بضاعة (صرف للمندوب)',
      date: r.createdAt || r.date,
      refNumber: r.refNumber || r.id.substring(0, 8)
    }));

    const returns = (stockReturnsFromReps || []).filter((r: any) => r.fromWarehouseId === id).map((r: any) => ({
      ...r,
      type: 'return',
      typeLabel: 'إرجاع بضاعة (مرتجع من المندوب)',
      date: r.createdAt || r.date,
      refNumber: r.refNumber || r.id.substring(0, 8)
    }));

    // Sort by date desc
    return [...issues, ...returns].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [stockIssuesToReps, stockReturnsFromReps, id]);

  // 4. Get Sales Data
  const sales = useMemo(() => {
    if (!salesInvoices) return [];
    return salesInvoices
      .filter((inv: any) => inv.warehouseId === id)
      .map((inv: any) => {
        const customer = customers.find((c: any) => c.id === inv.customerId);
        return {
          ...inv,
          customerName: customer?.name || "عميل نقدي/غير مسجل"
        };
      })
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [salesInvoices, customers, id]);

  const salesStats = useMemo(() => {
    const totalSales = sales.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
    const totalInvoices = sales.length;
    return { totalSales, totalInvoices };
  }, [sales]);


  if (loading) {
    return <div className="flex justify-center items-center h-screen">تحميل البيانات...</div>;
  }

  if (!warehouse) {
    return (
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
            <h2 className="text-xl font-bold">المخزن غير موجود</h2>
            <Button onClick={() => router.back()}>عودة</Button>
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div>
            <h1 className="text-2xl font-bold tracking-tight">{warehouse.name}</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-sm">المندوب المسؤول:</span>
                <Badge variant="outline" className="font-medium">{delegate?.name || "غير محدد"}</Badge>
            </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">قيمة المخزون (التكلفة)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(inventoryStats.totalCost)}</div>
            <p className="text-xs text-muted-foreground">
              عدد الأصناف: {inventoryStats.totalItems}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المبيعات</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(salesStats.totalSales)}</div>
            <p className="text-xs text-muted-foreground">
              عدد الفواتير: {salesStats.totalInvoices}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">آخر حركة</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium truncate">
                {movements.length > 0 ? movements[0].typeLabel : "لا توجد حركات"}
            </div>
            <p className="text-xs text-muted-foreground">
              {movements.length > 0 ? format(new Date(movements[0].date), "PPP p", { locale: ar }) : "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
            <TabsTrigger value="inventory" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
                محتويات المخزن (الجرد)
            </TabsTrigger>
            <TabsTrigger value="movements" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
                سجل الحركات (صرف/إرجاع)
            </TabsTrigger>
            <TabsTrigger value="sales" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
                المبيعات والفواتير
            </TabsTrigger>
        </TabsList>
        
        {/* Inventory Tab */}
        <TabsContent value="inventory" className="pt-4">
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-right">المنتج</TableHead>
                                <TableHead className="text-right">الكود</TableHead>
                                <TableHead className="text-center">الكمية</TableHead>
                                <TableHead className="text-center">التكلفة (للوحدة)</TableHead>
                                <TableHead className="text-center">الإجمالي (تكلفة)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {warehouseInventory.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        المخزن فارغ حالياً.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                warehouseInventory.map((item: any) => (
                                    <TableRow key={item.id || item.itemId}>
                                        <TableCell className="font-medium">{item.productName}</TableCell>
                                        <TableCell>{item.productCode}</TableCell>
                                        <TableCell className="text-center font-bold">{item.quantity}</TableCell>
                                        <TableCell className="text-center">{formatCurrency(item.costPrice)}</TableCell>
                                        <TableCell className="text-center font-bold text-primary">{formatCurrency(item.totalCost)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>

        {/* Movements Tab */}
        <TabsContent value="movements" className="pt-4">
             <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-right">التاريخ</TableHead>
                                <TableHead className="text-right">نوع الحركة</TableHead>
                                <TableHead className="text-right">رقم المرجع</TableHead>
                                <TableHead className="text-center">عدد الأصناف</TableHead>
                                <TableHead className="text-center">الحالة</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {movements.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        لا توجد حركات مسجلة.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                movements.map((mov: any, idx: number) => (
                                    <TableRow key={idx}>
                                        <TableCell>{format(new Date(mov.date), "PPP p", { locale: ar })}</TableCell>
                                        <TableCell>
                                            <Badge variant={mov.type === 'issue' ? 'default' : 'secondary'}>
                                                {mov.typeLabel}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{mov.refNumber}</TableCell>
                                        <TableCell className="text-center">{mov.items?.length || 0}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">مكتمل</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>

        {/* Sales Tab */}
        <TabsContent value="sales" className="pt-4">
             <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-right">رقم الفاتورة</TableHead>
                                <TableHead className="text-right">التاريخ</TableHead>
                                <TableHead className="text-right">العميل</TableHead>
                                <TableHead className="text-center">القيمة</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sales.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                        لا توجد مبيعات مسجلة لهذا المخزن.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sales.map((sale: any) => (
                                    <InvoiceRow 
                                        key={sale.id} 
                                        sale={sale} 
                                        warehouseId={id}
                                        stockIssuesToReps={stockIssuesToReps}
                                        stockReturnsFromReps={stockReturnsFromReps}
                                        salesInvoices={salesInvoices}
                                        salesReturns={salesReturns}
                                    />
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
