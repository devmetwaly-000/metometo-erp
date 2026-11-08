
"use client";

import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2, FileText, Eye, SlidersHorizontal, ArrowLeft, ArrowRight, ArrowDown, Filter, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import React, { useState, useMemo } from "react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import Link from 'next/link';
import { getLinkForReceipt } from "@/lib/utils";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

interface PosSale {
  id: string;
  invoiceNumber: string;
  date: string;
  cashierName: string;
  items: any[];
  total: number;
  warehouseId?: string;
  saleInvoiceId?: string;
  type?: 'stock-out-pos' | 'stock-out-manual';
}

interface StockOutRecord {
    id: string;
    saleInvoiceId?: string;
    receiptNumber?: string;
    saleInvoiceNumber?: string;
}

interface Warehouse {
    id: string;
    name: string;
    code?: string;
}

const ItemsDetailsDialog = ({ move, allItems, salesInvoices, posSales }: { move: any | null, allItems: any[], salesInvoices: any[], posSales: any[] }) => {
    if (!move) return null;
    
    const isSale = move.type === 'out' && (move.reason === 'sales_invoice' || move.reason === 'pos_sale' || move.type === 'stock-out-pos');
    const isAdjustment = move.type === 'adjustment';
    const referenceNumber = move.saleInvoiceNumber || move.invoiceNumber || move.receiptNumber;

    const itemsWithDetails = useMemo(() => {
        if (!move.items) return [];
        const originalInvoice = isSale ? [...salesInvoices, ...posSales].find((s:any) => s.id === (move.saleInvoiceId || move.id)) : null;
        
        return move.items.map((item: any) => {
            const masterItem = allItems.find(i => (i as any).id === (item.itemId || item.id));
            const invoiceItem = originalInvoice?.items.find((invItem:any) => invItem.id === (item.itemId || item.id));

            const cost = item.cost || (masterItem as any)?.cost || 0;
            const price = item.price || invoiceItem?.price || (masterItem as any)?.price || 0;
            const totalQty = item.qty !== undefined ? item.qty : Math.abs(item.difference || 0);
            const profit = (price - cost) * totalQty;
            
            return {
                ...item,
                name: item.name || (masterItem as any)?.name || 'صنف غير معروف',
                code: item.code || (masterItem as any)?.code || 'N/A',
                cost,
                price,
                profit,
                totalQty
            }
        });
    }, [move, allItems, salesInvoices, posSales, isSale]);
    


    return (
        <DialogContent className="max-w-3xl">
            <DialogHeader>
                <DialogTitle>تفاصيل الأصناف</DialogTitle>
                <DialogDescription>
                    إيصال رقم: {referenceNumber}
                </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>الصنف</TableHead>
                            <TableHead>الباركود</TableHead>
                             {isAdjustment ? (
                                <>
                                <TableHead className="text-center">رصيد النظام</TableHead>
                                <TableHead className="text-center">الرصيد الفعلي</TableHead>
                                <TableHead className="text-center">الفرق</TableHead>
                                </>
                            ) : (
                                <>
                                <TableHead className="text-center">الكمية</TableHead>
                                <TableHead className="text-center">التكلفة</TableHead>
                                {isSale && <TableHead className="text-center">سعر البيع</TableHead>}
                                {isSale && <TableHead className="text-center">الربح</TableHead>}
                                </>
                            )}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {itemsWithDetails.map((item: any, idx: number) => (
                            <TableRow key={idx}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="font-mono">{item.code}</TableCell>
                                {isAdjustment ? (
                                    <>
                                        <TableCell className="text-center">{item.systemQty}</TableCell>
                                        <TableCell className="text-center">{item.actualQty}</TableCell>
                                        <TableCell className={`text-center font-bold ${item.difference > 0 ? 'text-green-500' : 'text-destructive'}`}>
                                            {item.difference > 0 ? `+${item.difference}` : item.difference}
                                        </TableCell>
                                    </>
                                ) : (
                                     <>
                                        <TableCell className="text-center">{item.totalQty}</TableCell>
                                        <TableCell className="text-center">{item.cost?.toLocaleString() || '-'}</TableCell>
                                        {isSale && <TableCell className="text-center">{item.price?.toLocaleString() || '-'}</TableCell>}
                                        {isSale && <TableCell className={`text-center font-semibold ${item.profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                            {item.profit?.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                        </TableCell>}
                                     </>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </DialogContent>
    );
}


export default function InventoryMovementsPage() {
  const [filters, setFilters] = useState({
    branchId: "all",
    warehouseId: "all",
    type: "all",
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0]
  });
  
  const [selectedMove, setSelectedMove] = useState<any | null>(null);

  const { stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, warehouses, inventoryZones, items: allItems, posSales, salesInvoices, salesReturns, posReturns, purchaseReturns, stockIssuesToReps, stockReturnsFromReps, loading } = useData();
  const { user } = useAuth();

  const authorizedBranches = useMemo(() => {
    const b = warehouses.filter((w: any) => !w.isMain && !w.isRepWarehouse && !w.repId);
    if (user?.warehouseIds?.includes('all')) return b;
    return b.filter((w: any) => user?.warehouseIds?.includes(w.id));
  }, [warehouses, user]);

  const allWarehouses = useMemo(() => {
    const combined = [...warehouses, ...inventoryZones].filter((w: any) => !w.isRepWarehouse);
    
    let filtered = combined;
    if (!user?.warehouseIds?.includes('all')) {
        filtered = combined.filter((w: any) => user?.warehouseIds?.includes(w.id));
    }

    if (filters.branchId !== 'all') {
        filtered = filtered.filter((w: any) => {
            if (w.id === filters.branchId) return true;
            return (w as any).branchId === filters.branchId;
        });
    }

    return filtered;
  }, [warehouses, inventoryZones, user, filters.branchId]);

  const getSourceInfo = (id: string) => {
    const warehouse = allWarehouses.find((w: Warehouse) => w.id === id);
    return warehouse ? warehouse.name : id;
  };
  
    const getTypeLabel = (move: any) => {
        if (move.type === 'in') return move.reason === 'pos_return' ? 'مرتجع كاشير' : move.reason === 'sales_return' ? 'مرتجع مبيعات' : move.reason === 'purchase' ? 'شراء' : move.reason === 'rep_return' ? 'مرتجع من مندوب' : 'استلام';
        if (move.type === 'transfer') return 'تحويل';
        if (move.type === 'adjustment') return 'تسوية جرد';
        if (move.type === 'out') {
            if (move.reason === 'sales_invoice') return 'صرف (فاتورة بيع)';
            if (move.reason === 'pos_sale') return 'صرف (بيع كاشير)';
            if (move.reason === 'purchase_return') return 'مرتجع شراء';
            if (move.reason === 'rep_issue') return 'صرف لمندوب';
            return `صرف (${move.reason || 'يدوي'})`;
        }
        return 'غير معروف';
    };


  const filteredMovements = useMemo(() => {
    
    const allMovements: any[] = [];
    
    // IN
    stockInRecords.forEach((r: any) => allMovements.push({ ...r, type: 'in', warehouseId: r.warehouseId }));
    salesReturns.forEach((r: any) => allMovements.push({ ...r, type: 'in', warehouseId: r.warehouseId, reason: 'sales_return'}));
    posReturns.forEach((r: any) => allMovements.push({ ...r, type: 'in', warehouseId: r.warehouseId, reason: 'pos_return'}));
    stockReturnsFromReps.forEach((r: any) => allMovements.push({ ...r, type: 'in', warehouseId: r.warehouseId, reason: 'rep_return' }));

    // OUT - Add Sales explicitly to movements to be consistent with Item Ledger
    stockOutRecords.forEach((r: any) => allMovements.push({ ...r, type: 'out', warehouseId: r.sourceId }));
    
    // Filter sales that don't already have an explicit stock-out record (to avoid double counting manual/manufacturing stock-outs)
    salesInvoices.filter((s:any) => s.status === 'approved' && !stockOutRecords.some(so => so.saleInvoiceId === s.id)).forEach((s: any) => {
        allMovements.push({ ...s, type: 'out', reason: 'sales_invoice', warehouseId: s.warehouseId });
    });
    
    posSales.filter((s:any) => !stockOutRecords.some(so => so.saleInvoiceId === s.id)).forEach((s: any) => {
        allMovements.push({ ...s, type: 'out', reason: 'pos_sale', warehouseId: s.warehouseId });
    });

    purchaseReturns.forEach((r: any) => allMovements.push({ ...r, type: 'out', warehouseId: r.warehouseId, reason: 'purchase_return' }));
    stockIssuesToReps.forEach((r: any) => allMovements.push({ ...r, type: 'out', warehouseId: r.warehouseId, reason: 'rep_issue'}));

    // OTHERS
    stockTransferRecords.forEach((r: any) => {
        allMovements.push({ ...r, type: 'transfer', warehouseId: r.fromSourceId });
    });
    stockAdjustmentRecords.forEach((r: any) => allMovements.push({ ...r, type: 'adjustment', warehouseId: r.warehouseId }));


    return allMovements.filter((move: any) => {
      const moveDate = new Date(move.date);
      const fromDate = filters.fromDate ? new Date(filters.fromDate) : null;
      const toDate = filters.toDate ? new Date(filters.toDate) : null;

      if (fromDate) fromDate.setHours(0,0,0,0);
      if (toDate) toDate.setHours(23,59,59,999);

      if (fromDate && moveDate < fromDate) return false;
      if (toDate && moveDate > toDate) return false;
      if (filters.type !== 'all' && move.type !== filters.type) return false;
      
      if (filters.warehouseId !== 'all') {
        const whId = filters.warehouseId;
        if (move.type === 'transfer') {
             return move.fromSourceId === whId || move.toSourceId === whId;
        }
        return move.warehouseId === whId;
      }
      
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
  }, [
    stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords,
    salesReturns, posReturns, purchaseReturns, stockIssuesToReps, stockReturnsFromReps,
    salesInvoices, posSales, filters
  ]);


  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({...prev, [key]: value}));
  }

  if (loading && allWarehouses.length === 0) {
    return (
      <div className="flex flex-1 justify-center items-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  const getReceiptTooltip = (move: any): string => {
    const num = move.saleInvoiceNumber || move.invoiceNumber || move.receiptNumber;
    if (!num) return "رقم مرجعي";
    if (num.startsWith('ف-ب-') || move.reason === 'pos_sale') return "فاتورة مبيعات";
    if (num.startsWith('إذ-د-')) return "إذن دخول مخزني";
    if (num.startsWith('إذ-خ-')) return "إذن صرف مخزني";
    if (num.startsWith('إذ-ت-')) return "إذن تحويل مخزني";
    if (num.startsWith('ت-م-')) return "إيصال تسوية مخزنية";
    if (num.startsWith('م-ب-')) return "مرتجع بيع";
    if (num.startsWith('م-ش-')) return "مرتجع شراء";
    if (num.startsWith('ص-م-')) return "صرف بضاعة لمندوب";
    if (num.startsWith('م-ع-')) return "مرتجع من مندوب";
    return "رقم مرجعي";
  }


  return (
    <TooltipProvider>
    <>
      <PageHeader title="سجل حركات المخزون" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
            <CardHeader>
                <CardTitle>فلاتر البحث</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                     <div className="space-y-2">
                        <Label>الفرع</Label>
                        <Select value={filters.branchId} onValueChange={(v) => {
                             handleFilterChange("branchId", v);
                             handleFilterChange("warehouseId", "all");
                        }}>
                            <SelectTrigger>
                                <SelectValue placeholder="اختر الفرع" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">كل الفروع المصرح بها</SelectItem>
                                {authorizedBranches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label>المخزن</Label>
                        <Select value={filters.warehouseId} onValueChange={(v) => handleFilterChange("warehouseId", v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="اختر المخزن" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">كل المخازن التابعة للفرع</SelectItem>
                                {allWarehouses.map((w: Warehouse) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label>نوع الحركة</Label>
                        <Select value={filters.type} onValueChange={(v) => handleFilterChange("type", v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="اختر النوع" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">الكل</SelectItem>
                                <SelectItem value="in">استلام (وارد)</SelectItem>
                                <SelectItem value="out">صرف (صادر)</SelectItem>
                                <SelectItem value="transfer">تحويل</SelectItem>
                                <SelectItem value="adjustment">تسوية</SelectItem>
                            </SelectContent>
                        </Select>
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
            <CardTitle>سجل حركات المخزون</CardTitle>
            <CardDescription>
              عرض لجميع عمليات الاستلام والصرف والتحويل والتسويات والمبيعات التي تمت في المخازن.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
                 <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="w-full overflow-auto border rounded-lg">
                    <Dialog onOpenChange={(open) => !open && setSelectedMove(null)}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead>المرجع</TableHead>
                            <TableHead className="text-center">النوع</TableHead>
                            <TableHead className="text-center">التفاصيل الإضافية</TableHead>
                            <TableHead className="text-center">عدد الأصناف</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredMovements.length > 0 ? filteredMovements.map((move: any) => (
                            <TableRow key={`${move.type}-${move.id}`}>
                                <TableCell>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Link href={getLinkForReceipt(move.saleInvoiceNumber || move.invoiceNumber || move.receiptNumber, move.id) || '#'} className="hover:underline hover:text-primary font-mono">
                                                <span>{move.saleInvoiceNumber || move.invoiceNumber || move.receiptNumber}</span>
                                            </Link>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>{getReceiptTooltip(move)}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                     <div className="text-xs text-muted-foreground font-semibold">{new Date(move.date).toLocaleString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                                     <div className="text-[10px] text-muted-foreground">بواسطة: {move.createdByName || move.cashierName || 'غير معروف'}</div>
                                </TableCell>
                                <TableCell className="text-center">
                                    <Badge variant={
                                        move.type === 'in' ? 'default' :
                                        move.type === 'out' ? 'destructive' :
                                        move.type === 'adjustment' ? 'outline' :
                                        'secondary'
                                    }>
                                        <span className="flex items-center gap-1">
                                            {move.type === 'adjustment' && <SlidersHorizontal className="h-3 w-3" />}
                                            {getTypeLabel(move)}
                                        </span>
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                    {move.type === 'in' && <div className="flex items-center justify-center gap-2"><ArrowDown className="text-green-500 h-4 w-4"/> إلى: {getSourceInfo(move.warehouseId)}</div>}
                                    {move.type === 'out' && <div className="flex items-center justify-center gap-2"><ArrowLeft className="text-red-500 h-4 w-4"/> من: {getSourceInfo(move.warehouseId)}</div>}
                                    {move.type === 'transfer' && <div className="flex items-center justify-center gap-2">من: {getSourceInfo(move.fromSourceId)} <ArrowRight className="h-4 w-4 text-blue-500"/> إلى: {getSourceInfo(move.toSourceId)}</div>}
                                    {move.type === 'adjustment' && <div className="flex items-center justify-center gap-2"><SlidersHorizontal className="h-4 w-4 text-purple-500"/> في: {getSourceInfo(move.warehouseId)}</div>}
                                </TableCell>
                                <TableCell className="text-center">
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="sm" onClick={() => setSelectedMove(move)}>
                                            <Eye className="ml-2 h-4 w-4"/>
                                            {move.items?.length || 0}
                                        </Button>
                                    </DialogTrigger>
                                </TableCell>
                            </TableRow>
                            )) : (
                            <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                                        لا توجد حركات مخزون مسجلة تطابق الفلاتر.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    <ItemsDetailsDialog move={selectedMove} allItems={allItems} salesInvoices={salesInvoices} posSales={posSales} />
                    </Dialog>
                </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
    </TooltipProvider>
  );
}
