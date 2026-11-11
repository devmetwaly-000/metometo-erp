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
import {
  Loader2,
  Package,
  Boxes,
  AlertTriangle,
  Filter,
  CheckCircle2,
  Clock,
  Settings,
  Printer,
  Eye,
  PlusCircle,
  ArrowDownToLine
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSearchParams, useRouter } from 'next/navigation';
import { Combobox } from '@/components/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


interface PutAwayItem {
    itemId: string;
    name: string;
    cost: number;
    totalQty: number;
    previouslyAllocated: number;
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
                <p className="font-semibold text-sm">إعدادات الحاوية / القسم: {section.name}</p>
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <Switch id={`overfill-${section.id}`} checked={allowOverfill} onCheckedChange={setAllowOverfill} />
                    <Label htmlFor={`overfill-${section.id}`}>السماح بتجاوز السعة</Label>
                </div>
                <Button onClick={handleSave} size="sm" className="w-full">حفظ الإعدادات</Button>
            </div>
        </PopoverContent>
    );
};


const PutAwaySection = ({
    record,
    onPutAway,
    onOpenChange,
    isReallocate = false
}: {
    record: any;
    onPutAway: (recordId: string, allocations: Record<string, PutAwayItem>, replaceAll?: boolean) => Promise<void>;
    onOpenChange: (open: boolean) => void;
    isReallocate?: boolean;
}) => {
    const { inventorySections, inventory, warehouses, dbAction } = useData();
    const [allocations, setAllocations] = useState<Record<string, PutAwayItem>>({});
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();
    const [capacityWarning, setCapacityWarning] = useState<{ sectionName: string, itemName: string } | null>(null);

    // Quick add new container/section state
    const [showNewContainerForm, setShowNewContainerForm] = useState(false);
    const [newContainerName, setNewContainerName] = useState('');
    const [newContainerCapacity, setNewContainerCapacity] = useState<number>(500);
    const [isAddingContainer, setIsAddingContainer] = useState(false);

    const warehouseName = useMemo(() => {
        return warehouses.find((w: any) => w.id === record.warehouseId)?.name || 'المخزن الرئيسي';
    }, [warehouses, record.warehouseId]);

    React.useEffect(() => {
        const initialAllocations: Record<string, PutAwayItem> = {};
        (record.items || []).forEach((item: any) => {
            const itemId = item.itemId || item.id;
            const itemAllocations = (record.allocations || []).filter((alloc: any) => alloc.itemId === itemId);

            if (isReallocate) {
                // Pre-fill existing container quantities so user can edit/redistribute them
                const locMap = new Map<string, number>();
                itemAllocations.forEach((alloc: any) => {
                    locMap.set(alloc.sectionId, (locMap.get(alloc.sectionId) || 0) + Number(alloc.quantity || 0));
                });
                initialAllocations[itemId] = {
                    itemId,
                    name: item.name,
                    cost: item.cost,
                    totalQty: Number(item.qty || 0),
                    previouslyAllocated: 0,
                    locations: Array.from(locMap.entries())
                        .filter(([, q]) => q > 0)
                        .map(([sectionId, quantity]) => ({ sectionId, quantity }))
                };
            } else {
                const alreadyAllocated = itemAllocations.reduce((sum: number, alloc: any) => sum + Number(alloc.quantity || 0), 0);
                initialAllocations[itemId] = {
                    itemId,
                    name: item.name,
                    cost: item.cost,
                    totalQty: Number(item.qty || 0),
                    previouslyAllocated: alreadyAllocated,
                    locations: []
                };
            }
        });
        setAllocations(initialAllocations);
    }, [record, isReallocate]);
    
    const sectionsForWarehouse = useMemo(() => {
        return (inventorySections || [])
            .filter((s: any) => (s.mainWarehouseId || s.MainWarehouseId) === record.warehouseId)
            .map((section: any) => {
                 const sectionInventory = inventory.find((inv: any) => inv.id === `${record.warehouseId}-${section.id}`);
                 const currentStock = sectionInventory
                     ? Object.values(sectionInventory.items || {}).reduce((sum: number, item: any) => sum + Number(item.balance || 0), 0)
                     : 0;
                return {
                    ...section,
                    id: section.id || section.Id,
                    name: section.name || section.Name,
                    capacity: Number(section.capacity ?? section.Capacity ?? 0),
                    allowOverfill: section.allowOverfill !== undefined ? !!section.allowOverfill : true,
                    currentStock
                };
            });
    }, [inventorySections, inventory, record.warehouseId]);

    const handleQuickAddContainer = async () => {
        if (!newContainerName.trim()) {
            toast({ variant: 'destructive', title: 'بيانات ناقصة', description: 'يرجى إدخال رقم أو اسم الحاوية / القسم.' });
            return;
        }
        setIsAddingContainer(true);
        try {
            await dbAction('inventorySections', 'add', {
                mainWarehouseId: record.warehouseId,
                name: newContainerName.trim(),
                capacity: Number(newContainerCapacity) || 0,
                allowOverfill: true
            });
            toast({
                title: 'تمت إضافة الحاوية بنجاح',
                description: `تمت إضافة الحاوية "${newContainerName.trim()}" إلى مخزن "${warehouseName}". يمكنك الآن إدخال الكمية المراد تسكينها فيها.`
            });
            setNewContainerName('');
            setShowNewContainerForm(false);
        } catch (e) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'تعذر إضافة الحاوية الجديدة.' });
        } finally {
            setIsAddingContainer(false);
        }
    };

    const handleLocationQtyChange = (itemId: string, sectionId: string, qty: number) => {
        setAllocations(prev => {
            const currentItem = prev[itemId];
            if (!currentItem) return prev;
            const itemToUpdate = {
                ...currentItem,
                locations: [...currentItem.locations.map(l => ({ ...l }))]
            };
            const newQty = Math.max(0, Number(qty) || 0);
            
            const existingIdx = itemToUpdate.locations.findIndex(loc => loc.sectionId === sectionId);
            if (existingIdx >= 0) {
                itemToUpdate.locations[existingIdx].quantity = newQty;
            } else if (newQty > 0) {
                itemToUpdate.locations.push({ sectionId, quantity: newQty });
            }
            
            // Clean up zero entries
            itemToUpdate.locations = itemToUpdate.locations.filter(loc => loc.quantity > 0);

            return { ...prev, [itemId]: itemToUpdate };
        });
    };

    const handleFillRemainingToSection = (item: PutAwayItem, sectionId: string) => {
        const otherSectionsAllocated = item.locations
            .filter(loc => loc.sectionId !== sectionId)
            .reduce((sum, loc) => sum + loc.quantity, 0);
        const maxAvailableForThisSection = Math.max(0, item.totalQty - item.previouslyAllocated - otherSectionsAllocated);
        handleLocationQtyChange(item.itemId, sectionId, maxAvailableForThisSection);
    };
    
    const handleSavePutAway = () => {
        if (sectionsForWarehouse.length === 0) {
            toast({
                variant: 'destructive',
                title: 'لا توجد حاويات مسجلة لهذا المخزن',
                description: 'يرجى الضغط على زر "+ إضافة حاوية جديدة" وإدخال رقم الحاوية أولاً قبل تأكيد التسكين.'
            });
            setShowNewContainerForm(true);
            return;
        }

        // Check that at least some quantity > 0 was entered across containers
        const totalEnteredAcrossAllItems = Object.values(allocations).reduce(
            (sum, item) => sum + item.locations.reduce((s, loc) => s + loc.quantity, 0),
            0
        );

        if (totalEnteredAcrossAllItems <= 0) {
            toast({
                variant: 'destructive',
                title: 'لم يتم تحديد الكمية أو الحاوية!',
                description: 'يرجى إدخال الكمية المراد تسكينها أمام رقم الحاوية المطلوبة قبل الضغط على تأكيد التسكين.'
            });
            return;
        }

        // Validation check for total quantity per item
        for (const item of Object.values(allocations)) {
            const newlyAllocatedQty = item.locations.reduce((sum, loc) => sum + loc.quantity, 0);
            const totalAllocated = item.previouslyAllocated + newlyAllocatedQty;
            if (totalAllocated > item.totalQty) {
                toast({
                    variant: 'destructive',
                    title: 'كمية زائدة عن المستلم',
                    description: `الكمية الموزعة للصنف "${item.name}" (${totalAllocated}) أكبر من الكمية المستلمة في الإذن (${item.totalQty}).`
                });
                return;
            }
        }
        
        // Capacity check
        for (const section of sectionsForWarehouse) {
            if (section.allowOverfill) continue;
            const sectionAllocations = Object.values(allocations).flatMap(item => item.locations.filter(loc => loc.sectionId === section.id));
            const newStockInSection = sectionAllocations.reduce((sum, alloc) => sum + alloc.quantity, 0);
            if (section.capacity > 0 && newStockInSection > 0 && (section.currentStock + newStockInSection) > section.capacity) {
                const offendingItemName = Object.values(allocations).find(item => item.locations.some(loc => loc.sectionId === section.id))?.name || 'أحد الأصناف';
                setCapacityWarning({ sectionName: section.name, itemName: offendingItemName });
                return;
            }
        }

        confirmAndSave();
    };
    
    const confirmAndSave = async () => {
        setCapacityWarning(null);
        setIsSaving(true);
        try {
            await onPutAway(record.id, allocations, isReallocate);
            onOpenChange(false);
        } finally {
            setIsSaving(false);
        }
    };
    
    const getRemainingQty = (item: PutAwayItem) => {
        const newlyAllocated = item.locations.reduce((sum, loc) => sum + loc.quantity, 0);
        return item.totalQty - item.previouslyAllocated - newlyAllocated;
    };
    
    const getCurrentStockInSection = (itemId: string, sectionId: string) => {
         const sectionInventory = inventory.find((inv: any) => inv.id === `${record.warehouseId}-${sectionId}`);
         return sectionInventory?.items?.[itemId]?.balance || 0;
    };

    return (
        <>
         <AlertDialog open={!!capacityWarning} onOpenChange={() => setCapacityWarning(null)}>
            <AlertDialogContent>
                 <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/> تجاوز السعة الاستيعابية للحاوية</AlertDialogTitle>
                    <AlertDialogDescription>
                        إضافة الكمية المحددة للصنف &quot;{capacityWarning?.itemName}&quot; ستؤدي إلى تجاوز الطاقة الاستيعابية للحاوية &quot;{capacityWarning?.sectionName}&quot;. هل تريد المتابعة والتسكين على أي حال؟
                    </AlertDialogDescription>
                </AlertDialogHeader>
                 <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmAndSave}>نعم، متابعة وتأكيد التسكين</AlertDialogAction>
                 </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

        <CardContent className="border-t pt-4 bg-muted/10">
             <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                 <div>
                     <h3 className="font-bold text-base md:text-lg flex items-center gap-2">
                         <Boxes className="h-5 w-5 text-primary" />
                         تسكين وتوزيع أصناف الإذن ({record.receiptNumber}) على حاويات مخزن: {warehouseName}
                     </h3>
                     <p className="text-xs text-muted-foreground mt-0.5">
                         حدد رقم الحاوية وأدخل الكمية المراد تسكينها في كل حاوية (يمكنك توزيع الصنف الواحد على حاوية واحدة أو عدة حاويات).
                     </p>
                 </div>
                 <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     onClick={() => setShowNewContainerForm(prev => !prev)}
                     className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                 >
                     <PlusCircle className="h-4 w-4" />
                     إضافة حاوية / رف جديد
                 </Button>
             </div>

             {showNewContainerForm && (
                 <div className="mb-4 p-4 border-2 border-primary/30 rounded-lg bg-primary/5 space-y-3">
                     <p className="text-sm font-bold text-primary">إضافة حاوية / قسم جديد في مخزن {warehouseName}:</p>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                         <div className="space-y-1">
                             <Label className="text-xs">رقم أو اسم الحاوية / القسم</Label>
                             <Input
                                 placeholder="مثال: حاوية C-101 أو رف A1"
                                 value={newContainerName}
                                 onChange={e => setNewContainerName(e.target.value)}
                             />
                         </div>
                         <div className="space-y-1">
                             <Label className="text-xs">السعة الاستيعابية (وحدة)</Label>
                             <Input
                                 type="number"
                                 min={0}
                                 value={newContainerCapacity}
                                 onChange={e => setNewContainerCapacity(Number(e.target.value))}
                             />
                         </div>
                         <div className="flex gap-2">
                             <Button type="button" onClick={handleQuickAddContainer} disabled={isAddingContainer} className="flex-1">
                                 {isAddingContainer && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
                                 حفظ الحاوية
                             </Button>
                             <Button type="button" variant="ghost" onClick={() => setShowNewContainerForm(false)}>
                                 إلغاء
                             </Button>
                         </div>
                     </div>
                 </div>
             )}

             <div className="space-y-6">
                {Object.values(allocations).map(item => {
                    const remaining = getRemainingQty(item);
                    const currentlyEntering = item.locations.reduce((s, l) => s + l.quantity, 0);
                    return (
                        <div key={item.itemId} className="p-4 border rounded-xl bg-card shadow-sm">
                            <div className="flex flex-wrap justify-between items-center gap-2 mb-4 pb-3 border-b">
                                <div>
                                    <p className="font-bold text-base text-primary">{item.name}</p>
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                                        <span>إجمالي الكمية المستلمة: <strong className="text-foreground">{item.totalQty}</strong></span>
                                        {!isReallocate && item.previouslyAllocated > 0 && (
                                            <span>| تم تسكينه سابقاً: <strong className="text-emerald-600">{item.previouslyAllocated}</strong></span>
                                        )}
                                        <span>| موزع حالياً على الحاويات: <strong className="text-blue-600">{currentlyEntering}</strong></span>
                                    </div>
                                </div>
                                <Badge
                                    variant={remaining === 0 ? 'default' : remaining < 0 ? 'destructive' : 'secondary'}
                                    className={cn(
                                        "text-sm px-3 py-1 font-bold",
                                        remaining === 0 && "bg-emerald-600 hover:bg-emerald-700 text-white",
                                        remaining > 0 && "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40"
                                    )}
                                >
                                    {remaining === 0 ? (
                                        <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> تم توزيع كامل الكمية</span>
                                    ) : (
                                        <span>المتبقي للتسكين: {remaining}</span>
                                    )}
                                </Badge>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-semibold flex items-center gap-1.5">
                                    <Boxes className="h-4 w-4 text-primary" />
                                    اختر الحاوية وأدخل الكمية المراد تسكينها في كل حاوية:
                                </Label>

                                {sectionsForWarehouse.length === 0 ? (
                                    <div className="p-4 border border-dashed border-amber-500/50 rounded-lg bg-amber-500/10 text-center space-y-2">
                                        <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
                                            لا توجد حاويات أو أقسام معرفة داخل مخزن &quot;{warehouseName}&quot; حتى الآن.
                                        </p>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => setShowNewContainerForm(true)}
                                            className="gap-1"
                                        >
                                            <PlusCircle className="h-4 w-4" />
                                            إضافة حاوية الآن للتسكين فيها
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-1">
                                        {sectionsForWarehouse.map((section: any) => {
                                            const currentStock = getCurrentStockInSection(item.itemId, section.id);
                                            const allocatedHere = item.locations.find(loc => loc.sectionId === section.id)?.quantity || 0;
                                            return (
                                                <div
                                                    key={section.id}
                                                    className={cn(
                                                        "relative p-3 border-2 rounded-lg transition-all space-y-2",
                                                        allocatedHere > 0
                                                            ? "border-primary bg-primary/5 shadow-sm"
                                                            : "border-border bg-background hover:border-primary/40"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5">
                                                            <Boxes className={cn("h-4 w-4", allocatedHere > 0 ? "text-primary" : "text-muted-foreground")} />
                                                            <span className="font-bold text-sm">حاوية: {section.name}</span>
                                                        </div>
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => e.stopPropagation()}>
                                                                    <Settings className="h-3.5 w-3.5 text-muted-foreground"/>
                                                                </Button>
                                                            </PopoverTrigger>
                                                            <SectionSettingsPopover section={section} onSave={(id, data) => dbAction('inventorySections', 'update', { id, data })} />
                                                        </Popover>
                                                    </div>

                                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                        <span>رصيد الصنف بالحاوية: <strong>{currentStock}</strong></span>
                                                        <span>السعة: {section.capacity > 0 ? `${section.currentStock}/${section.capacity}` : 'مفتوحة'}</span>
                                                    </div>

                                                    <div className="space-y-1.5 pt-1">
                                                        <div className="flex items-center justify-between">
                                                            <Label htmlFor={`${item.itemId}-${section.id}`} className="text-xs font-medium">
                                                                الكمية بهذه الحاوية:
                                                            </Label>
                                                            {remaining > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleFillRemainingToSection(item, section.id)}
                                                                    className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5"
                                                                    title="تسكين كامل الكمية المتبقية في هذه الحاوية"
                                                                >
                                                                    <ArrowDownToLine className="h-3 w-3" />
                                                                    تسكين المتبقي ({remaining + allocatedHere})
                                                                </button>
                                                            )}
                                                        </div>
                                                        <Input
                                                            id={`${item.itemId}-${section.id}`}
                                                            type="number"
                                                            placeholder="أدخل الكمية..."
                                                            min={0}
                                                            max={item.totalQty - item.previouslyAllocated}
                                                            value={allocatedHere > 0 ? allocatedHere : ''}
                                                            onChange={e => handleLocationQtyChange(item.itemId, section.id, Number(e.target.value))}
                                                            className={cn(
                                                                "h-9 font-bold text-center",
                                                                allocatedHere > 0 && "border-primary bg-background text-primary"
                                                            )}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
             </div>

             <div className="mt-6 flex items-center justify-between border-t pt-4">
                <div className="text-xs text-muted-foreground">
                    {Object.values(allocations).every(item => getRemainingQty(item) === 0) ? (
                        <span className="text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            تم توزيع كافة الكميات المستلمة بالكامل على الحاويات، جاهز للحفظ.
                        </span>
                    ) : (
                        <span className="text-amber-600 font-medium">
                            ملاحظة: إذا قمت بتسكين جزء فقط من الكمية، سيبقى الإذن في قائمة الانتظار لتسكين الكمية المتبقية لاحقاً.
                        </span>
                    )}
                </div>
                <Button onClick={handleSavePutAway} disabled={isSaving} size="lg" className="gap-2 font-bold">
                    {isSaving ? <Loader2 className="animate-spin h-4 w-4"/> : <Boxes className="h-4 w-4" />}
                    تأكيد التسكين وحفظ توزيع الحاويات
                </Button>
             </div>
        </CardContent>
        </>
    );
};

export default function StockInPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    
    const { 
        stockInRecords,
        warehouses, 
        inventorySections,
        inventoryZones,
        dbAction, 
        loading 
    } = useData();

    const [filters, setFilters] = useState({
        warehouseId: user?.warehouseIds?.[0] !== 'all' ? user?.warehouseIds?.[0] || 'all' : 'all',
        fromDate: '',
        toDate: '',
    });

    const [activeTab, setActiveTab] = useState<string>('pending');
    const [openAccordionId, setOpenAccordionId] = useState<string>('');
    const [modalRecord, setModalRecord] = useState<{ record: any; isReallocate: boolean } | null>(null);

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

    const isMainWarehouse = useCallback((warehouseId?: string) => {
        if (!warehouseId) return false;
        const wh = warehouses.find((w: any) => w.id === warehouseId);
        const hasSections = (inventorySections || []).some((s: any) => (s.mainWarehouseId || s.MainWarehouseId) === warehouseId);
        const inZones = (inventoryZones || []).some((z: any) => z.id === warehouseId);
        return Boolean(wh?.isMain || hasSections || inZones);
    }, [warehouses, inventorySections, inventoryZones]);

    const records = useMemo(() => {
        if (loading) return [];
        
        const stockInId = searchParams.get('stockInId');

        return stockInRecords
            .filter((rec: any) => {
                 if (!isMainWarehouse(rec.warehouseId)) return false;

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
    }, [searchParams, stockInRecords, filters, loading, isMainWarehouse]);

    const pendingRecords = useMemo(() => {
        return records.filter((r: any) => {
            if (r.status === 'pending_putaway') return true;
            const isAllocated = Array.isArray(r.allocations) && r.allocations.length > 0;
            return !isAllocated && r.status !== 'cancelled';
        });
    }, [records]);

    const completedRecords = useMemo(() => {
        return records.filter((r: any) => {
            const isAllocated = Array.isArray(r.allocations) && r.allocations.length > 0;
            return (r.status === 'completed' || r.status === 'approved') && isAllocated;
        });
    }, [records]);

    // Auto-expand the target stockInId or the first pending record so container inputs are immediately visible
    useEffect(() => {
        const stockInId = searchParams.get('stockInId');
        if (stockInId && pendingRecords.some((r: any) => r.id === stockInId)) {
            setOpenAccordionId(stockInId);
        } else if (pendingRecords.length > 0 && !openAccordionId) {
            setOpenAccordionId(pendingRecords[0].id);
        }
    }, [pendingRecords, searchParams, openAccordionId]);

    const warehouseOptions = useMemo(() => {
        const mainWhs = warehouses.filter((w: any) => isMainWarehouse(w.id));
        const options = [
            {value: 'all', label: 'كل المخازن الرئيسية واللوجستية'},
            ...mainWhs.map((w: any) => ({value: w.id, label: w.name}))
        ];
        if (user?.warehouseIds?.includes('all')) return options;
        return options.filter(w => w.value !== 'all' && user?.warehouseIds?.includes(w.value));
    }, [warehouses, isMainWarehouse, user]);


    const handlePutAway = async (
        recordId: string,
        allocations: Record<string, PutAwayItem>,
        replaceAll: boolean = false
    ) => {
        const recordToUpdate = stockInRecords.find((r: any) => r.id === recordId);
        if (!recordToUpdate) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'لم يتم العثور على إذن الاستلام.' });
            return;
        }
    
        try {
            const updatedAllocationsLog = replaceAll ? [] : [...(recordToUpdate.allocations || [])];
    
            for (const item of Object.values(allocations)) {
                for (const loc of item.locations) {
                    if (loc.quantity > 0) {
                         updatedAllocationsLog.push({
                            date: new Date().toISOString(),
                            userId: user?.id,
                            userName: user?.name,
                            itemId: item.itemId,
                            sectionId: loc.sectionId,
                            quantity: Number(loc.quantity),
                        });
                    }
                }
            }
    
            const isFullyAllocated = (recordToUpdate.items || []).every((item: any) => {
                const totalAllocated = updatedAllocationsLog
                    .filter(alloc => alloc.itemId === (item.itemId || item.id))
                    .reduce((sum, alloc) => sum + Number(alloc.quantity || 0), 0);
                return totalAllocated >= Number(item.qty || 0);
            });
    
            await dbAction('stockInRecords', 'update', {
                id: recordId,
                data: {
                    status: isFullyAllocated ? 'completed' : 'pending_putaway',
                    allocations: updatedAllocationsLog,
                }
            });
    
            toast({
                title: isFullyAllocated ? 'تم التسكين الكامل بنجاح' : 'تم حفظ التسكين الجزئي بنجاح',
                description: isFullyAllocated
                    ? `تم توزيع جميع أصناف الإذن (${recordToUpdate.receiptNumber}) على الحاويات المحددة ونقله لسجل الأذونات المكتملة.`
                    : `تم حفظ الكميات المسكنة في الحاويات، ويبقى الإذن مفتوحاً لاستكمال تسكين المتبقي.`
            });
        } catch (e) {
            console.error("Failed to put away items:", e);
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل عملية التسكين.' });
        }
    };

    const getAllocatedSummary = (record: any) => {
        if (!Array.isArray(record.allocations) || record.allocations.length === 0) return 'لم يتم التسكين بعد';
        return record.allocations.map((a: any) => {
            const sec = (inventorySections || []).find((s: any) => (s.id || s.Id) === a.sectionId);
            return `${sec?.name || sec?.Name || 'حاوية'}: (${a.quantity})`;
        }).join(' ، ');
    };

    return (
        <>
            <PageHeader title="تسكين وإدارة البضاعة الواردة (الحاويات والأقسام)" />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                 <Card className="no-print">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Filter/> فلاتر البحث</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div className="space-y-2">
                            <Label>المخزن الرئيسي / اللوجستي</Label>
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

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="pending">أذونات بانتظار التسكين ({pendingRecords.length})</TabsTrigger>
                        <TabsTrigger value="history">سجل الأذونات المكتملة ({completedRecords.length})</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="pending">
                        <Card>
                            <CardHeader>
                                <CardTitle>أذونات الدخول المعلقة بانتظار التسكين في الحاويات</CardTitle>
                                <CardDescription>
                                    اختر الإذن لتحديد رقم الحاوية والكمية المراد تسكينها في كل حاوية داخل المخزن اللوجستي.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loading ? (
                                    <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto"/></div>
                                ) : (
                                    <Accordion
                                        type="single"
                                        collapsible
                                        value={openAccordionId}
                                        onValueChange={setOpenAccordionId}
                                        className="w-full space-y-3"
                                    >
                                        {pendingRecords.length > 0 ? pendingRecords.map((record: any) => (
                                            <AccordionItem value={record.id} key={record.id} className="border rounded-lg overflow-hidden">
                                                <AccordionTrigger className="hover:no-underline px-4 py-3 bg-muted/30">
                                                    <div className="grid grid-cols-2 md:grid-cols-5 w-full text-right rtl:text-right text-sm items-center gap-2">
                                                        <span className="font-bold text-primary">{record.receiptNumber}</span>
                                                        <span className="text-muted-foreground">{new Date(record.date).toLocaleDateString('ar-EG')}</span>
                                                        <span className="hidden md:block font-medium">
                                                            المخزن: {warehouses.find((w:any) => w.id === record.warehouseId)?.name}
                                                        </span>
                                                        <span className="hidden md:block text-xs text-muted-foreground">
                                                            الأصناف: {(record.items || []).length} صنف
                                                        </span>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
                                                                <Clock className="ml-1 h-3 w-3"/>
                                                                بانتظار تحديد الحاويات
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </AccordionTrigger>
                                                <AccordionContent className="pt-0 pb-0">
                                                    <PutAwaySection
                                                        record={record}
                                                        onPutAway={handlePutAway}
                                                        onOpenChange={() => {}}
                                                    />
                                                </AccordionContent>
                                            </AccordionItem>
                                        )) : (
                                            <div className="text-center p-8 border rounded-lg border-dashed bg-muted/20">
                                                <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                                                <p className="font-bold text-foreground text-sm">لا توجد أذونات استلام بانتظار التسكين</p>
                                                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                                                    تسكين البضاعة وتوزيعها على الأقسام والحاويات مخصص للمخازن الرئيسية واللوجستية.
                                                </p>
                                            </div>
                                        )}
                                    </Accordion>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="history">
                        <Card>
                            <CardHeader>
                                <CardTitle>سجل الأذونات المكتملة</CardTitle>
                                <CardDescription>عرض وتفاصيل الأذونات التي تم استلامها وتسكينها في الحاويات مع إمكانية تعديل التسكين.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="w-full overflow-auto border rounded-lg">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead>رقم الإذن</TableHead>
                                                <TableHead>التاريخ</TableHead>
                                                <TableHead>المخزن</TableHead>
                                                <TableHead>توزيع الحاويات</TableHead>
                                                <TableHead className="text-center">الأصناف</TableHead>
                                                <TableHead className="text-center w-[180px]">الإجراءات</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {completedRecords.length > 0 ? completedRecords.map((record: any) => (
                                                <TableRow key={record.id}>
                                                    <TableCell className="font-mono font-bold">{record.receiptNumber}</TableCell>
                                                    <TableCell>{new Date(record.date).toLocaleDateString('ar-EG')}</TableCell>
                                                    <TableCell>{warehouses.find((w:any) => w.id === record.warehouseId)?.name}</TableCell>
                                                    <TableCell className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                                        {getAllocatedSummary(record)}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="secondary">{record.items.length}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex justify-center items-center gap-1.5">
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
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 text-xs gap-1 border-amber-400 text-amber-700 dark:text-amber-400 font-bold"
                                                                onClick={() => setModalRecord({ record, isReallocate: true })}
                                                                title="تعديل تسكين الحاويات والكميات"
                                                            >
                                                                <Boxes className="h-3.5 w-3.5" />
                                                                تعديل التسكين
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

                {/* Put-Away Modal Dialog for Direct / Reallocate Put-Away */}
                <Dialog open={!!modalRecord} onOpenChange={(open) => !open && setModalRecord(null)}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Boxes className="h-5 w-5 text-primary" />
                                {modalRecord?.isReallocate ? 'إعادة توزيع وتسكين البضاعة في الحاويات' : 'تسكين البضاعة الواردة في الحاويات'}
                            </DialogTitle>
                            <DialogDescription>
                                حدد رقم الحاوية وأدخل الكمية المراد تسكينها في كل حاوية ثم اضغط على تأكيد التسكين.
                            </DialogDescription>
                        </DialogHeader>
                        {modalRecord && (
                            <PutAwaySection
                                record={modalRecord.record}
                                onPutAway={handlePutAway}
                                onOpenChange={(open) => !open && setModalRecord(null)}
                                isReallocate={modalRecord.isReallocate}
                            />
                        )}
                    </DialogContent>
                </Dialog>
            </main>
        </>
    );
}
