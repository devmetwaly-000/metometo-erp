

"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import PageHeader from "@/components/page-header";
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
import { useData } from "@/contexts/data-provider";
import { Loader2, Target, TrendingUp, MoreHorizontal, FilePlus, ArrowRightLeft, Clock, Search, BarChart2, Filter, Lightbulb, AlertTriangle } from "lucide-react";
import { useSearchParams, useRouter } from 'next/navigation';
import { Badge } from "@/components/ui/badge";
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from '@/components/ui/input';
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


interface Recommendation {
  itemId: string;
  itemName: string;
  itemCode?: string;
  warehouseId: string;
  warehouseName: string;
  currentStock: number;
  reorderPoint?: number;
  avgDailySales?: number;
  recommendedQty: number;
  daysToCover?: number;
  status: 'needed' | 'pending_requisition' | 'pending_purchase';
  referenceId?: string;
}
interface Item { 
    id: string; 
    name: string; 
    code?: string;
    cost?: number;
    reorderPoint?: number;
    itemType?: 'standard' | 'raw_material' | 'manufactured'; 
    components?: { itemId: string; quantity: number }[];
}

const SalesChartDialog = ({ item, fromDate, toDate }: { item: Recommendation | null; fromDate: string; toDate: string }) => {
    const { posSales, salesInvoices } = useData();
    const isMobile = useIsMobile();

    const chartData = useMemo(() => {
        if (!item) return [];

        const salesByDay = new Map<string, number>();
        const allSales = [...posSales, ...salesInvoices.filter((s: any) => s.status === 'approved')];

        const start = fromDate ? new Date(fromDate) : new Date(0);
        const end = toDate ? new Date(toDate) : new Date();
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
        
        allSales.forEach(sale => {
            const saleDate = new Date(sale.date);
            if (sale.warehouseId === item.warehouseId && saleDate >= start && saleDate <= end) {
                const itemInSale = sale.items.find((i: any) => i.id === item.itemId);
                if (itemInSale) {
                    const dateKey = saleDate.toISOString().split('T')[0];
                    salesByDay.set(dateKey, (salesByDay.get(dateKey) || 0) + itemInSale.qty);
                }
            }
        });
        
        return Array.from(salesByDay.entries()).map(([date, sales]) => ({
            date: new Date(date).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
            sales,
        })).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    }, [item, fromDate, toDate, posSales, salesInvoices]);

    if (!item) return null;
    
    return (
         <DialogContent className="max-w-3xl">
            <DialogHeader>
                <DialogTitle>حركة مبيعات: {item.itemName}</DialogTitle>
                <DialogDescription>
                    عرض يومي للكميات المباعة من الصنف في فرع "{item.warehouseName}" خلال الفترة المحددة.
                </DialogDescription>
            </DialogHeader>
            <div className="h-[250px] w-full mt-4">
                 <ChartContainer config={{ sales: { label: "مبيعات", color: "hsl(var(--chart-1))" } }} className="w-full h-full">
                    <BarChart data={chartData}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
                        <YAxis tickFormatter={(value) => value.toLocaleString()} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="sales" fill="var(--color-sales)" radius={4}>
                             {!isMobile && <LabelList position="top" offset={4} className="fill-foreground" fontSize={12} />}
                        </Bar>
                    </BarChart>
                </ChartContainer>
            </div>
             {item.avgDailySales !== undefined && item.daysToCover !== undefined && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold mb-2">مبرر التوصية:</h4>
                    <p className="text-sm text-muted-foreground mb-2">تم حساب الكمية الموصى بها بناءً على المعادلة التالية:</p>
                    <code className="block text-center p-2 border bg-background rounded-md text-lg font-mono tracking-wider">
                        (متوسط البيع اليومي × عدد أيام التغطية) - الرصيد الحالي = الكمية الموصى بها
                    </code>
                     <code className="block text-center p-2 text-primary font-bold text-lg font-mono tracking-wider mt-2">
                        ({item.avgDailySales.toFixed(2)} × {item.daysToCover}) - {item.currentStock} = {item.recommendedQty}
                    </code>
                </div>
            )}
        </DialogContent>
    );
};


export default function RecommendationsPage() {
    const {
        items: allItems, warehouses, inventory, snoozedRecommendations, requisitions,
        salesInvoices, posSales,
        dbAction, getNextId, loading,
        purchaseOrders, // Fetch POs
        stockInRecords,
        // For accurate stock calculation
        inventoryClosings, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, salesReturns, posReturns, purchaseReturns, stockIssuesToReps, stockReturnsFromReps
    } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [warehouseId, setWarehouseId] = useState("");
    const [method, setMethod] = useState<"reorder_point" | "sales_velocity">("reorder_point");
    const [daysToCover, setDaysToCover] = useState(15);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoadingAction, setIsLoadingAction] = useState<string | null>(null);
    const [selectedItemForChart, setSelectedItemForChart] = useState<Recommendation | null>(null);
    const [dateRange, setDateRange] = useState({
        from: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
    });
    
    useEffect(() => {
        if (user?.warehouseIds?.length === 1 && user.warehouseIds[0] !== 'all') {
            setWarehouseId(user.warehouseIds[0]);
        }
    }, [user]);

    const warehouseOptions = useMemo(
        () => warehouses.filter((w: any) => !w.isMain).map((w: any) => ({ value: w.id, label: w.name })),
        [warehouses]
    );
    
    const calculateStockForItemInWarehouse = useCallback((itemId: string, whId: string, allData: any): number => {
      const {
        inventoryClosings, stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords,
        salesInvoices, salesReturns, posSales, posReturns, purchaseReturns,
        stockIssuesToReps, stockReturnsFromReps
      } = allData;
        if (!whId) return 0;
        
        const closingsForWarehouse = (inventoryClosings || []).filter((c: any) => c.warehouseId === whId)
            .sort((a: any,b: any) => new Date(b.closingDate).getTime() - new Date(a.date).getTime());
        
        const lastClosing = closingsForWarehouse[0] ?? null;
        let lastClosingDate = lastClosing ? new Date(lastClosing.closingDate) : new Date(0);
        let stock = lastClosing?.balances?.find((b: any) => b.itemId === itemId)?.balance || 0;

        if (lastClosing) {
            lastClosingDate.setDate(lastClosingDate.getDate() + 1);
            lastClosingDate.setHours(0, 0, 0, 0);
        }
        
        const filterTransactions = (t: any) => new Date(t.date) >= lastClosingDate;

        // INCOMING
        (stockInRecords || []).filter((si:any) => si.warehouseId === whId && filterTransactions(si)).forEach((si: any) => si.items.forEach((i: any) => { if ((i.id || i.itemId) === itemId) stock += i.qty; }));
        (stockTransferRecords || []).filter((t:any) => t.toSourceId === whId && filterTransactions(t)).forEach((t: any) => t.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));
        (stockAdjustmentRecords || []).filter((adj:any) => adj.warehouseId === whId && filterTransactions(adj)).forEach((adj: any) => adj.items.forEach((i: any) => { if (i.itemId === itemId && i.difference > 0) stock += i.difference; }));
        (salesReturns || []).filter((sr:any) => sr.warehouseId === whId && filterTransactions(sr)).forEach((sr: any) => sr.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));
        (posReturns || []).filter((pr:any) => (pr as any).warehouseId === whId && filterTransactions(pr)).forEach((pr: any) => pr.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));
        (stockReturnsFromReps || []).filter((rfr:any) => rfr.warehouseId === whId && filterTransactions(rfr)).forEach((rfr: any) => rfr.items.forEach((i: any) => { if (i.id === itemId) stock += i.qty; }));
        
        // OUTGOING
        (salesInvoices || []).filter((s:any) => s.warehouseId === whId && s.status === 'approved' && filterTransactions(s)).forEach((s: any) => s.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (posSales || []).filter((s: any) => s.warehouseId === whId && filterTransactions(s)).forEach((s: any) => s.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockOutRecords || []).filter((so:any) => so.sourceId === whId && filterTransactions(so)).forEach((so: any) => so.items.forEach((i:any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockTransferRecords || []).filter((t:any) => t.fromSourceId === whId && filterTransactions(t)).forEach((t: any) => t.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockAdjustmentRecords || []).filter((adj:any) => adj.warehouseId === whId && filterTransactions(adj)).forEach((adj: any) => adj.items.forEach((i: any) => { if (i.itemId === itemId && i.difference < 0) stock += i.difference; }));
        (purchaseReturns || []).filter((pr:any) => pr.warehouseId === whId && filterTransactions(pr)).forEach((pr: any) => pr.items.forEach((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        (stockIssuesToReps || []).filter((itr:any) => itr.warehouseId === whId && filterTransactions(itr)).forEach((itr: any) => itr.items.filter((i: any) => { if (i.id === itemId) stock -= i.qty; }));
        
        return stock;
    }, [inventoryClosings, stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords, salesInvoices, salesReturns, posSales, posReturns, purchaseReturns, stockIssuesToReps, stockReturnsFromReps]);


    const calculateManufacturableStock = useCallback((item: Item, warehouseId: string, allData: any): number => {
        if (!item.components || item.components.length === 0) {
            return 0; // Not a manufacturable item
        }
        
        let maxPossibleUnits = Infinity;

        for (const component of item.components) {
            const componentStock = calculateStockForItemInWarehouse(component.itemId, warehouseId, allData);
            const unitsPossibleFromComponent = Math.floor(componentStock / component.quantity);
            if (unitsPossibleFromComponent < maxPossibleUnits) {
                maxPossibleUnits = unitsPossibleFromComponent;
            }
        }
        
        return maxPossibleUnits === Infinity ? 0 : maxPossibleUnits;
    }, [calculateStockForItemInWarehouse]);

    const generateRecommendations = useCallback(() => {
        if (!warehouseId) {
            toast({ variant: "destructive", title: "خطأ", description: "يرجى تحديد فرع أولاً." });
            return;
        }
        setIsGenerating(true);
        const warehouseName = warehouses.find((w: any) => w.id === warehouseId)?.name || '';
        
        const allDataForCalc = {
             inventoryClosings,
            stockInRecords,
            stockOutRecords,
            stockTransferRecords,
            stockAdjustmentRecords,
            salesInvoices,
            salesReturns,
            posSales,
            posReturns,
            purchaseReturns,
            stockIssuesToReps,
            stockReturnsFromReps,
        };

        const pendingRequisitionItems = new Map<string, string>();
        requisitions.filter((r: any) => r.fromWarehouseId === warehouseId && r.status === 'pending').forEach((r: any) => {
            r.items.forEach((item: any) => pendingRequisitionItems.set(item.itemId, r.id.slice(-6)));
        });

        const receivedPurchaseInvoiceIds = new Set(stockInRecords.map((rec:any) => rec.purchaseInvoiceId));
        const pendingPurchaseItems = new Map<string, string>();
        purchaseOrders.filter((inv:any) => inv.status === 'pending' && inv.warehouseId === warehouseId).forEach((inv: any) => {
            inv.items.forEach((item: any) => pendingPurchaseItems.set(item.id, inv.orderNumber));
        });

        const now = new Date().getTime();
        const snoozedItems = new Set<string>();
        snoozedRecommendations.filter((s: any) => s.warehouseId === warehouseId && new Date(s.snoozedUntil).getTime() > now).forEach((s: any) => {
            snoozedItems.add(s.itemId);
        });

        let newRecommendations: Recommendation[] = [];

        const itemsToEvaluate = allItems.filter((item: any) => !snoozedItems.has(item.id));
        
        if (method === "reorder_point") {
            const recommendationsFromMap = itemsToEvaluate
                .filter((item: any) => item.reorderPoint > 0)
                .map((item: any) => {
                    const currentStock = calculateStockForItemInWarehouse(item.id, warehouseId, allDataForCalc);
                    if (currentStock < item.reorderPoint) {
                        const recommendedQty = item.reorderPoint - currentStock;
                        let status: Recommendation['status'] = 'needed';
                        let referenceId: string | undefined = undefined;

                        if (pendingRequisitionItems.has(item.id)) {
                            status = 'pending_requisition';
                            referenceId = `طلب #${pendingRequisitionItems.get(item.id)}`;
                        } else if (pendingPurchaseItems.has(item.id)) {
                            status = 'pending_purchase';
                            referenceId = `شراء #${pendingPurchaseItems.get(item.id)}`;
                        }

                        return { itemId: item.id, itemName: item.name, itemCode: item.code, warehouseId, warehouseName, currentStock, reorderPoint: item.reorderPoint, recommendedQty, status, referenceId };
                    }
                    return null;
                });
            newRecommendations = recommendationsFromMap.filter(Boolean) as Recommendation[];

        } else if (method === "sales_velocity") {
            const allSales = [...salesInvoices.filter((s: any) => s.status === 'approved'), ...posSales];
            const startDate = new Date(dateRange.from);
            const endDate = new Date(dateRange.to);
            
            const salesInPeriod = allSales.filter(s => {
                const saleDate = new Date(s.date);
                return s.warehouseId === warehouseId && saleDate >= startDate && saleDate <= endDate;
            });

            const itemSalesMap = new Map<string, { totalSold: number, sellingDays: Set<string> }>();
            salesInPeriod.forEach(s => { 
                s.items.forEach((item: any) => {
                    const saleDateString = new Date(s.date).toISOString().split('T')[0];
                    const current = itemSalesMap.get(item.id) || { totalSold: 0, sellingDays: new Set<string>() };
                    current.totalSold += item.qty;
                    current.sellingDays.add(saleDateString);
                    itemSalesMap.set(item.id, current);
                }); 
            });

            const recommendationsFromMap = itemsToEvaluate
                .map((item: any) => {
                    const salesData = itemSalesMap.get(item.id);
                    if (!salesData || salesData.totalSold === 0) return null;
                    
                    const numberOfSellingDays = salesData.sellingDays.size;
                    const avgDailySales = numberOfSellingDays > 0 ? salesData.totalSold / numberOfSellingDays : 0;
                    
                    const isManufactured = item.itemType === 'manufactured';
                    const currentStock = isManufactured ? calculateManufacturableStock(item, warehouseId, allDataForCalc) : calculateStockForItemInWarehouse(item.id, warehouseId, allDataForCalc);

                    const targetStock = avgDailySales * daysToCover;
                    if (currentStock < targetStock) {
                        let status: Recommendation['status'] = 'needed';
                        let referenceId: string | undefined = undefined;

                        if (pendingRequisitionItems.has(item.id)) {
                            status = 'pending_requisition';
                            referenceId = `طلب #${pendingRequisitionItems.get(item.id)}`;
                        } else if (pendingPurchaseItems.has(item.id)) {
                            status = 'pending_purchase';
                            referenceId = `شراء #${pendingPurchaseItems.get(item.id)}`;
                        }

                        return { 
                            itemId: item.id, 
                            itemName: item.name, 
                            itemCode: item.code, 
                            warehouseId, 
                            warehouseName, 
                            currentStock, 
                            avgDailySales, 
                            recommendedQty: Math.ceil(targetStock - currentStock), 
                            daysToCover,
                            status, 
                            referenceId 
                        };
                    }
                    return null;
                });
            newRecommendations = recommendationsFromMap.filter(Boolean) as Recommendation[];
        }
        setRecommendations(newRecommendations);
        setIsGenerating(false);
    }, [warehouseId, method, allItems, snoozedRecommendations, toast, warehouses, requisitions, purchaseOrders, stockInRecords, dateRange, daysToCover, salesInvoices, posSales, calculateStockForItemInWarehouse, calculateManufacturableStock]);
    
    const { newRecommendations, pendingOrders } = useMemo(() => {
        const needed = recommendations.filter(r => r.status === 'needed');
        const pending = recommendations.filter(r => r.status !== 'needed');
        return { newRecommendations: needed, pendingOrders: pending };
    }, [recommendations]);


    const handleAction = async (actionType: 'requisition' | 'purchase', itemsToProcess: Recommendation[]) => {
        if (itemsToProcess.length === 0) return;
        setIsLoadingAction('bulk');
        try {
            if (actionType === 'requisition') {
                 await dbAction('requisitions', 'add', {
                    fromWarehouseId: itemsToProcess[0].warehouseId,
                    requesterId: user?.id,
                    requesterName: user?.name,
                    date: new Date().toISOString(),
                    status: 'pending',
                    fromRecommendation: true,
                    items: itemsToProcess.map(({ itemId, itemName, recommendedQty }) => ({ itemId, name: itemName, quantity: recommendedQty })),
                });
                toast({ title: 'تم إنشاء الطلب', description: `تم إرسال طلب بضاعة لـ ${itemsToProcess.length} صنف.` });
            } else if (actionType === 'purchase') {
                const poNumber = `PO-${await getNextId('purchaseOrder')}`;
                await dbAction('purchaseOrders', 'add', {
                    warehouseId: itemsToProcess[0].warehouseId, // Assuming all items are for the same warehouse
                    orderNumber: poNumber,
                    date: new Date().toISOString(),
                    status: 'pending',
                    fromRecommendation: true,
                    items: itemsToProcess.map(({ itemId, itemName, recommendedQty }) => ({
                        id: itemId,
                        name: itemName,
                        qty: recommendedQty,
                        cost: allItems.find((i:any) => i.id === itemId)?.cost || 0,
                        total: recommendedQty * (allItems.find((i:any) => i.id === itemId)?.cost || 0),
                    })),
                    total: itemsToProcess.reduce((sum, item) => sum + (item.recommendedQty * (allItems.find((i:any) => i.id === item.itemId)?.cost || 0)), 0),
                });
                toast({ title: 'تم إنشاء أمر الشراء', description: `تم إنشاء أمر شراء ${poNumber} لـ ${itemsToProcess.length} صنف.` });
            }
             generateRecommendations(); // Refresh recommendations after action
        } catch (error) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل اتخاذ الإجراء المجمع.' });
        } finally {
            setIsLoadingAction(null);
        }
    }
    
    const handleCreateRequisition = (rec: Recommendation) => handleAction('requisition', [rec]);
    const handleCreatePurchaseInvoice = (rec: Recommendation) => handleAction('purchase', [rec]);


    const handleSnooze = async (rec: Recommendation, days: number) => {
      setIsLoadingAction(rec.itemId);
      try {
        const snoozedUntil = new Date();
        snoozedUntil.setDate(snoozedUntil.getDate() + days);
        await dbAction('snoozedRecommendations', 'add', { itemId: rec.itemId, warehouseId: rec.warehouseId, snoozedUntil: snoozedUntil.toISOString() });
        toast({ title: 'تم التأجيل', description: `تم تأجيل طلب الصنف ${rec.itemName} لمدة ${days} يوم.` });
        setRecommendations(prev => prev.filter(r => r.itemId !== rec.itemId));
      } catch (error) {
          toast({ variant: "destructive", title: "خطأ", description: "فشل تأجيل الطلب." });
      } finally {
          setIsLoadingAction(null);
      }
    };
    
    return (
        <>
            <PageHeader title="توصيات طلبات البضاعة" />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Filter/> تحديد المعايير</CardTitle>
                        <CardDescription>اختر الفرع وطريقة حساب التوصيات ثم اضغط على زر "عرض التوصيات".</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>الفرع</Label>
                                <Combobox options={warehouseOptions} value={warehouseId} onValueChange={setWarehouseId} placeholder="اختر فرعًا..." emptyMessage="لا يوجد فروع" disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')} />
                            </div>
                            <div className="space-y-2">
                                <Label>طريقة إنشاء التوصيات</Label>
                                <RadioGroup value={method} onValueChange={(v: any) => setMethod(v)} className="flex gap-4 pt-2">
                                    <div className="flex items-center space-x-2 rtl:space-x-reverse"><RadioGroupItem value="reorder_point" id="r1" /><Label htmlFor="r1">بناءً على حد الطلب</Label></div>
                                    <div className="flex items-center space-x-2 rtl:space-x-reverse"><RadioGroupItem value="sales_velocity" id="r2" /><Label htmlFor="r2">بناءً على معدلات البيع</Label></div>
                                </RadioGroup>
                            </div>
                        </div>
                        {method === 'sales_velocity' && (
                            <div className="pt-4 border-t grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div className="space-y-2">
                                    <Label>تغطية مبيعات لـ (يوم)</Label>
                                    <Input id="days-to-cover" type="number" value={daysToCover} onChange={e => setDaysToCover(Number(e.target.value))} />
                                </div>
                                 <div className="space-y-2">
                                    <Label>من تاريخ</Label>
                                    <Input type="date" value={dateRange.from} onChange={e => setDateRange(prev => ({...prev, from: e.target.value}))} />
                                </div>
                                <div className="space-y-2">
                                    <Label>إلى تاريخ</Label>
                                    <Input type="date" value={dateRange.to} onChange={e => setDateRange(prev => ({...prev, to: e.target.value}))} />
                                </div>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button onClick={generateRecommendations} disabled={!warehouseId || isGenerating}>
                            {isGenerating ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Lightbulb className="ml-2 h-4 w-4" />}
                            {isGenerating ? 'جارٍ التحليل...' : 'عرض التوصيات'}
                        </Button>
                    </CardFooter>
                </Card>

                 <Tabs defaultValue="new">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="new">توصيات جديدة ({newRecommendations.length})</TabsTrigger>
                        <TabsTrigger value="pending">طلبات قيد التنفيذ ({pendingOrders.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="new">
                        <Dialog onOpenChange={(open) => !open && setSelectedItemForChart(null)}>
                        <Card>
                            <CardHeader>
                                <CardTitle>قائمة التوصيات الجديدة</CardTitle>
                                <CardDescription>الأصناف التي تحتاج إلى إجراء فوري.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="w-full overflow-auto border rounded-lg">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead className="text-center">الرصيد الحالي</TableHead><TableHead className="text-center">{method === 'reorder_point' ? 'حد الطلب' : 'متوسط البيع اليومي'}</TableHead><TableHead className="text-center">الكمية الموصى بها</TableHead><TableHead className="text-center w-[200px]">الإجراء</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {newRecommendations.map(rec => (
                                                <TableRow key={rec.itemId}>
                                                    <TableCell><p className="font-semibold">{rec.itemName}</p><p className="text-xs text-muted-foreground font-mono">{rec.itemCode}</p></TableCell>
                                                    <TableCell className="text-center">{rec.currentStock}</TableCell>
                                                    <TableCell className="text-center">{method === 'reorder_point' ? rec.reorderPoint : rec.avgDailySales?.toFixed(2)}</TableCell>
                                                    <TableCell className="text-center font-bold text-lg text-primary">{rec.recommendedQty}</TableCell>
                                                    <TableCell className="text-center">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="outline" size="sm" disabled={isLoadingAction === rec.itemId}>
                                                                    {isLoadingAction === rec.itemId ? <Loader2 className="h-4 w-4 animate-spin"/> : 'اختر إجراء'}
                                                                    <MoreHorizontal className="mr-2 h-4 w-4"/>
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent>
                                                                <DialogTrigger asChild>
                                                                    <DropdownMenuItem onSelect={e => e.preventDefault()} onClick={() => setSelectedItemForChart(rec)}>
                                                                        <BarChart2 className="ml-2 h-4 w-4 text-blue-500"/> تحليل المبيعات
                                                                    </DropdownMenuItem>
                                                                </DialogTrigger>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem onClick={() => handleCreateRequisition(rec)}>
                                                                    <ArrowRightLeft className="ml-2 h-4 w-4"/> طلب بضاعة من المخزن
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleCreatePurchaseInvoice(rec)}>
                                                                    <FilePlus className="ml-2 h-4 w-4"/> إنشاء أمر شراء
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuSub>
                                                                    <DropdownMenuSubTrigger>
                                                                        <Clock className="ml-2 h-4 w-4"/> تأجيل التوصية
                                                                    </DropdownMenuSubTrigger>
                                                                    <DropdownMenuPortal>
                                                                        <DropdownMenuSubContent>
                                                                            <DropdownMenuItem onSelect={() => handleSnooze(rec, 1)}><Clock className="ml-2 h-4 w-4"/> تأجيل (يوم واحد)</DropdownMenuItem>
                                                                            <DropdownMenuItem onSelect={() => handleSnooze(rec, 7)}><Clock className="ml-2 h-4 w-4"/> تأجيل (أسبوع)</DropdownMenuItem>
                                                                            <DropdownMenuItem onSelect={() => handleSnooze(rec, 30)}><Clock className="ml-2 h-4 w-4"/> تأجيل (شهر)</DropdownMenuItem>
                                                                        </DropdownMenuSubContent>
                                                                    </DropdownMenuPortal>
                                                                </DropdownMenuSub>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                             {newRecommendations.length === 0 && <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">لا توجد توصيات جديدة.</TableCell></TableRow>}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                             <CardFooter className="flex justify-end gap-2">
                                 <Button variant="secondary" onClick={() => handleAction('purchase', newRecommendations)} disabled={isLoadingAction === 'bulk' || newRecommendations.length === 0}><FilePlus className="ml-2 h-4 w-4"/> إنشاء أمر شراء بالكل</Button>
                                 <Button onClick={() => handleAction('requisition', newRecommendations)} disabled={isLoadingAction === 'bulk' || newRecommendations.length === 0}><ArrowRightLeft className="ml-2 h-4 w-4"/> إنشاء طلب بضاعة بالكل</Button>
                             </CardFooter>
                        </Card>
                        {selectedItemForChart && (
                            <SalesChartDialog item={selectedItemForChart} fromDate={dateRange.from} toDate={dateRange.to} />
                        )}
                        </Dialog>
                    </TabsContent>
                    <TabsContent value="pending">
                       <Card>
                            <CardHeader>
                                <CardTitle>قائمة الطلبات قيد التنفيذ</CardTitle>
                                <CardDescription>الأصناف التي تم إنشاء طلب بضاعة أو أمر شراء لها وتنتظر التنفيذ.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="w-full overflow-auto border rounded-lg">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead className="text-center">الكمية الموصى بها</TableHead><TableHead className="text-center">الحالة</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {pendingOrders.map(rec => (
                                                <TableRow key={rec.itemId}>
                                                    <TableCell><p className="font-semibold">{rec.itemName}</p><p className="text-xs text-muted-foreground font-mono">{rec.itemCode}</p></TableCell>
                                                    <TableCell className="text-center">{rec.recommendedQty}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="secondary">{rec.referenceId}</Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {pendingOrders.length === 0 && <TableRow><TableCell colSpan={3} className="text-center h-24 text-muted-foreground">لا توجد طلبات قيد التنفيذ.</TableCell></TableRow>}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

            </main>
        </>
    );
}

