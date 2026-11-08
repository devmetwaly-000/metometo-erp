
"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useData } from "@/contexts/data-provider";
import { Loader2, Package, Save, Boxes, AlertTriangle, Filter, CheckCircle, Clock, Settings, Printer, Eye } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useSearchParams, useRouter } from 'next/navigation';
import { Combobox } from '@/components/ui/combobox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


interface PutAwayItem {
    itemId: string;
    name: string;
    cost: number;
    totalQty: number; // Total quantity from the stock-in record
    previouslyAllocated: number; // Quantity already put away in previous operations for this record
    locations: {
        sectionId: string;
        quantity: number;
    }[];
}

const SectionSettingsPopover = ({ section, onSave }: { section: any, onSave: (id: string, data: any) => void }) => {
    const [allowOverfill, setAllowOverfill] = useState(section.allowOverfill || false);

    const handleSave = () => {
        onSave(section.id, { allowOverfill });
    };

    return (
        <PopoverContent onClick={e => e.stopPropagation()}>
            <div className="space-y-4">
                <p className="font-semibold text-sm">إعدادات القسم: {section.name}</p>
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <Switch id={`overfill-${section.id}`} checked={allowOverfill} onCheckedChange={setAllowOverfill} />
                    <Label htmlFor={`overfill-${section.id}`}>السماح بتجاوز السعة</Label>
                </div>
                <Button onClick={handleSave} size="sm" className="w-full">حفظ الإعدادات</Button>
            </div>
        </PopoverContent>
    );
};


const PutAwaySection = ({ record, onPutAway, onOpenChange }: { record: any, onPutAway: (recordId: string, allocations: Record<string, PutAwayItem>) => void, onOpenChange: (open: boolean) => void }) => {
    const { inventorySections, inventory, dbAction } = useData();
    const [allocations, setAllocations] = useState<Record<string, PutAwayItem>>({});
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();
    const [capacityWarning, setCapacityWarning] = useState<{ sectionName: string, itemName: string } | null>(null);


    React.useEffect(() => {
        const initialAllocations: Record<string, PutAwayItem> = {};
        record.items.forEach((item: any) => {
            const itemId = item.itemId || item.id;
            const alreadyAllocated = (record.allocations || [])
                .filter((alloc: any) => alloc.itemId === itemId)
                .reduce((sum: number, alloc: any) => sum + alloc.quantity, 0);

            initialAllocations[itemId] = {
                itemId: itemId,
                name: item.name,
                cost: item.cost,
                totalQty: item.qty,
                previouslyAllocated: alreadyAllocated,
                locations: []
            };
        });
        setAllocations(initialAllocations);
    }, [record]);
    
    const sectionsForWarehouse = useMemo(() => {
        return inventorySections
            .filter((s:any) => s.mainWarehouseId === record.warehouseId)
            .map((section: any) => {
                 const sectionInventory = inventory.find((inv: any) => inv.id === `${record.warehouseId}-${section.id}`);
                 const currentStock = sectionInventory ? Object.values(sectionInventory.items || {}).reduce((sum: number, item: any) => sum + item.balance, 0) : 0;
                return { ...section, currentStock };
            });
    }, [inventorySections, inventory, record.warehouseId]);


    const handleLocationQtyChange = (itemId: string, sectionId: string, qty: number) => {
        setAllocations(prev => {
            const itemToUpdate = { ...prev[itemId] };
            const newQty = Math.max(0, qty);
            
            let location = itemToUpdate.locations.find(loc => loc.sectionId === sectionId);

            if (location) {
                location.quantity = newQty;
            } else {
                itemToUpdate.locations.push({ sectionId, quantity: newQty });
            }
            
            // Clean up zero entries
            itemToUpdate.locations = itemToUpdate.locations.filter(loc => loc.quantity > 0);

            return { ...prev, [itemId]: itemToUpdate };
        });
    };
    
    const handleSavePutAway = () => {
         // Validation check for total quantity
        for (const item of Object.values(allocations)) {
            const newlyAllocatedQty = item.locations.reduce((sum, loc) => sum + loc.quantity, 0);
            const totalAllocated = item.previouslyAllocated + newlyAllocatedQty;
            if (totalAllocated > item.totalQty) {
                toast({
                    variant: 'destructive',
                    title: 'كمية زائدة',
                    description: `الكمية الإجمالية للصنف "${item.name}" (${totalAllocated}) أكبر من الكمية المستلمة (${item.totalQty}).`
                });
                return;
            }
        }
        
        // Capacity check
        for(const section of sectionsForWarehouse) {
            if (section.allowOverfill) continue; // Skip check if overfill is allowed
            const sectionAllocations = Object.values(allocations).flatMap(item => item.locations.filter(loc => loc.sectionId === section.id));
            const newStockInSection = sectionAllocations.reduce((sum, alloc) => sum + alloc.quantity, 0);
            if(section.capacity > 0 && (section.currentStock + newStockInSection) > section.capacity) {
                const offendingItemName = Object.values(allocations).find(item => item.locations.some(loc => loc.sectionId === section.id))?.name || 'أحد الأصناف';
                setCapacityWarning({ sectionName: section.name, itemName: offendingItemName });
                return;
            }
        }

        confirmAndSave();
    }
    
    const confirmAndSave = () => {
        setCapacityWarning(null);
        setIsSaving(true);
        onPutAway(record.id, allocations);
        onOpenChange(false);
    }
    
    const getRemainingQty = (item: PutAwayItem) => {
        const newlyAllocated = item.locations.reduce((sum, loc) => sum + loc.quantity, 0);
        return item.totalQty - item.previouslyAllocated - newlyAllocated;
    };
    
    const getCurrentStockInSection = (itemId: string, sectionId: string) => {
         const sectionInventory = inventory.find((inv: any) => inv.id === `${record.warehouseId}-${sectionId}`);
         return sectionInventory?.items?.[itemId]?.balance || 0;
    }

    return (
        <>
         <AlertDialog open={!!capacityWarning} onOpenChange={() => setCapacityWarning(null)}>
            <AlertDialogContent>
                 <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/> تجاوز السعة الاستيعابية</AlertDialogTitle>
                    <AlertDialogDescription>
                        إضافة الكمية المحددة للصنف "{capacityWarning?.itemName}" ستؤدي إلى تجاوز الطاقة الاستيعابية للقسم "{capacityWarning?.sectionName}". هل تريد المتابعة على أي حال؟
                    </AlertDialogDescription>
                </AlertDialogHeader>
                 <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmAndSave}>نعم، متابعة</AlertDialogAction>
                 </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

        <CardContent className="border-t pt-4">
             <h3 className="font-semibold text-lg mb-2">تسكين أصناف الإذن: {record.receiptNumber}</h3>
             <div className="space-y-6">
                {Object.values(allocations).map(item => (
                    <div key={item.itemId} className="p-4 border rounded-lg bg-card shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <p className="font-bold text-primary">{item.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    الكمية المستلمة: {item.totalQty} | تم تسكين: {item.previouslyAllocated}
                                </p>
                            </div>
                            <Badge variant={getRemainingQty(item) === 0 ? 'default' : 'destructive'} className="text-base">
                                المتبقي للتسكين: {getRemainingQty(item)}
                            </Badge>
                        </div>
                        <div className="space-y-2">
                             <Label>توزيع على الأقسام (الحاويات):</Label>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {sectionsForWarehouse.map((section: any) => {
                                    const currentStock = getCurrentStockInSection(item.itemId, section.id);
                                    return (
                                        <div key={section.id} className="relative p-3 border rounded-md bg-background space-y-1">
                                            <div className="flex items-center justify-between">
                                                <p className="font-semibold text-sm">{section.name}</p>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                         <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => e.stopPropagation()}><Settings className="h-4 w-4 text-muted-foreground"/></Button>
                                                    </PopoverTrigger>
                                                    <SectionSettingsPopover section={section} onSave={(id, data) => dbAction('inventorySections', 'update', {id, data})} />
                                                </Popover>
                                            </div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Boxes className="h-3 w-3" />
                                                <span>الرصيد الحالي: {currentStock}</span>
                                            </div>
                                            <Input
                                                id={`${item.itemId}-${section.id}`}
                                                type="number"
                                                placeholder="الكمية"
                                                min={0}
                                                value={item.locations.find(loc => loc.sectionId === section.id)?.quantity || ''}
                                                onChange={e => handleLocationQtyChange(item.itemId, section.id, Number(e.target.value))}
                                                className="h-9"
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                ))}
             </div>
             <div className="mt-6 flex justify-end">
                <Button onClick={handleSavePutAway} disabled={isSaving}>
                    {isSaving && <Loader2 className="animate-spin ml-2 h-4 w-4"/>}
                    تأكيد التسكين
                </Button>
             </div>
        </CardContent>
        </>
    )
}

export default function StockInPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    
    const { 
        stockInRecords,
        warehouses, 
        inventorySections,
        items,
        dbAction, 
        loading 
    } = useData();

    const [filters, setFilters] = useState({
        warehouseId: user?.warehouseIds?.[0] !== 'all' ? user?.warehouseIds?.[0] || 'all' : 'all',
        fromDate: '',
        toDate: '',
    });

    // Aggressive Cleanup for Pointer Events and Scroll
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

    const records = useMemo(() => {
        if (loading) return [];
        
        const stockInId = searchParams.get('stockInId');

        return stockInRecords
            .filter((rec: any) => {
                 if (stockInId) {
                    return rec.id === stockInId;
                }
                
                const recordDate = new Date(rec.date);
                const from = filters.fromDate ? new Date(filters.fromDate) : null;
                const to = filters.toDate ? new Date(filters.toDate) : null;
                if(from) from.setHours(0,0,0,0);
                if(to) to.setHours(23,59,59,999);

                if (from && recordDate < from) return false;
                if (to && recordDate > to) return false;
                if (filters.warehouseId !== 'all' && rec.warehouseId !== filters.warehouseId) return false;
                
                return true; 
            })
            .sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [searchParams, stockInRecords, filters, loading]);

    const pendingRecords = useMemo(() => records.filter(r => r.status === 'pending_putaway' || !r.status), [records]);
    const completedRecords = useMemo(() => records.filter(r => r.status === 'completed'), [records]);

    const warehouseOptions = useMemo(() => {
        const options = [
            {value: 'all', label: 'كل المخازن الرئيسية'},
            ...warehouses.filter((w:any) => w.isMain).map((w: any) => ({value: w.id, label: w.name}))
        ];
        if (user?.warehouseIds?.includes('all')) return options;
        return options.filter(w => w.value !== 'all' && user?.warehouseIds?.includes(w.value));
    }, [warehouses, user]);


    const handlePutAway = async (recordId: string, allocations: Record<string, PutAwayItem>) => {
        const recordToUpdate = stockInRecords.find((r: any) => r.id === recordId);
        if (!recordToUpdate) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'لم يتم العثور على إذن الاستلام.' });
            return;
        }
    
        try {
            const newAllocationsLog = [...(recordToUpdate.allocations || [])];
    
            for (const item of Object.values(allocations)) {
                for (const loc of item.locations) {
                    if (loc.quantity > 0) {
                         newAllocationsLog.push({
                            date: new Date().toISOString(),
                            userId: user?.id,
                            userName: user?.name,
                            itemId: item.itemId,
                            sectionId: loc.sectionId,
                            quantity: loc.quantity,
                        });
                    }
                }
            }
    
            const finalAllocationsLog = [...(recordToUpdate.allocations || []), ...newAllocationsLog];
            const isFullyAllocated = recordToUpdate.items.every((item: any) => {
                const totalAllocated = finalAllocationsLog
                    .filter(alloc => alloc.itemId === (item.itemId || item.id))
                    .reduce((sum, alloc) => sum + alloc.quantity, 0);
                return totalAllocated >= item.qty;
            });
    
            await dbAction('stockInRecords', 'update', {
                id: recordId,
                data: {
                    status: isFullyAllocated ? 'completed' : 'pending_putaway',
                    allocations: newAllocationsLog,
                }
            });
    
            toast({ title: 'تم التسكين بنجاح' });
        } catch (e) {
            console.error("Failed to put away items:", e);
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل عملية التسكين.' });
        }
    };
    

    return (
        <>
            <PageHeader title="تسكين وإدارة البضاعة الواردة" />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                 <Card className="no-print">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Filter/> فلاتر البحث</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div className="space-y-2">
                            <Label>المخزن الرئيسي</Label>
                            <Combobox
                                options={warehouseOptions}
                                value={filters.warehouseId}
                                onValueChange={(v) => handleFilterChange('warehouseId', v)}
                                placeholder="اختر مخزنًا..."
                                emptyMessage="لا يوجد مخازن رئيسية."
                                disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>من تاريخ</Label>
                            <Input type="date" value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>إلى تاريخ</Label>
                            <Input type="date" value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} />
                        </div>
                    </CardContent>
                </Card>

                <Tabs defaultValue="pending">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="pending">أذونات بانتظار التسكين ({pendingRecords.length})</TabsTrigger>
                        <TabsTrigger value="history">سجل الأذونات المكتملة ({completedRecords.length})</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="pending">
                        <Card>
                            <CardHeader>
                                <CardTitle>أذونات الدخول المعلقة</CardTitle>
                                <CardDescription>
                                    هذه قائمة بأذونات الدخول التي تنتظر توزيع أصنافها على الأقسام الداخلية (الحاويات).
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loading ? (
                                    <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto"/></div>
                                ) : (
                                    <Accordion type="single" collapsible className="w-full">
                                        {pendingRecords.length > 0 ? pendingRecords.map((record: any) => (
                                            <AccordionItem value={record.id} key={record.id} className="border-b">
                                                <AccordionTrigger className="hover:no-underline">
                                                    <div className="grid grid-cols-2 md:grid-cols-4 w-full text-right rtl:text-right text-sm">
                                                        <span className="font-bold">{record.receiptNumber}</span>
                                                        <span className="text-muted-foreground">{new Date(record.date).toLocaleDateString('ar-EG')}</span>
                                                        <span className="hidden md:block text-muted-foreground">المستلم: {warehouses.find((w:any) => w.id === record.warehouseId)?.name}</span>
                                                        <span className="text-left rtl:text-right">
                                                            <Badge variant="outline" className="border-amber-500 text-amber-500">
                                                                <Clock className="ml-1 h-3 w-3"/>
                                                                انتظار التسكين
                                                            </Badge>
                                                        </span>
                                                    </div>
                                                </AccordionTrigger>
                                                <PutAwaySection record={record} onPutAway={handlePutAway} onOpenChange={()=>{}} />
                                            </AccordionItem>
                                        )) : <p className="text-center text-muted-foreground p-6">لا توجد أذونات بانتظار التسكين.</p>}
                                    </Accordion>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="history">
                        <Card>
                            <CardHeader>
                                <CardTitle>سجل الأذونات المكتملة</CardTitle>
                                <CardDescription>عرض وتفاصيل الأذونات التي تم استلامها وتسكينها بالكامل.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="w-full overflow-auto border rounded-lg">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead>رقم الإذن</TableHead>
                                                <TableHead>التاريخ</TableHead>
                                                <TableHead>المخزن</TableHead>
                                                <TableHead>بواسطة</TableHead>
                                                <TableHead className="text-center">الأصناف</TableHead>
                                                <TableHead className="text-center w-[120px]">الإجراءات</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {completedRecords.length > 0 ? completedRecords.map((record: any) => (
                                                <TableRow key={record.id}>
                                                    <TableCell className="font-mono font-bold">{record.receiptNumber}</TableCell>
                                                    <TableCell>{new Date(record.date).toLocaleDateString('ar-EG')}</TableCell>
                                                    <TableCell>{warehouses.find((w:any) => w.id === record.warehouseId)?.name}</TableCell>
                                                    <TableCell className="text-xs">{record.createdByName || '---'}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="secondary">{record.items.length}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex justify-center gap-2">
                                                            <Button variant="ghost" size="icon" onClick={() => {
                                                                setTimeout(() => router.push(`/inventory/stock-in/${record.id}`), 150);
                                                            }} title="عرض التفاصيل">
                                                                <Eye className="h-4 w-4 text-blue-500" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" onClick={() => {
                                                                setTimeout(() => router.push(`/inventory/stock-in/${record.id}`), 150);
                                                            }} title="طباعة">
                                                                <Printer className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">لا توجد سجلات مكتملة.</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </>
    )
}
