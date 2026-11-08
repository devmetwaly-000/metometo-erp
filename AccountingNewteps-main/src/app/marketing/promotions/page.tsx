

"use client";

import React, { useState, useMemo, useCallback } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/auth-context';
import { PlusCircle, Loader2, MoreHorizontal, Trash2, Edit, TrendingUp, ListPlus, ArrowLeft, Search, Warehouse, AlertTriangle, Filter, Eye, Layers, Percent, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AddEntityDialog } from '@/components/add-entity-dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { MultiSelect } from '@/components/ui/multi-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from 'next/link';

interface Tier {
    id: string; // uuid for local state key
    targetType: Promotion['targetType'];
    targetId: string;
    quantity: number;
    discountPercentage: number;
}

// Updated Promotion interface with new types and warehouseIds
interface Promotion {
    id?: string;
    promoCode?: string;
    name: string;
    description?: string;
    type: 'percentage' | 'fixed_amount' | 'buy_x_get_y_discount' | 'buy_n_get_cheapest_discount' | 'tiered_quantity';
    value: number; // For percentage or fixed amount
    buyCount?: number; // For "buy_n_get_cheapest_discount"
    buyNTargetMode?: 'all' | 'specific'; // For "buy_n_get_cheapest_discount"
    targetType: 'items' | 'itemSections' | 'itemCategories' | 'itemGroups' | 'itemSubCategories1' | 'itemSubCategories2';
    targetIds: string[];
    startDate: string;
    endDate: string;
    warehouseIds?: string[]; // New field for branch targeting
    tiers?: Tier[]; // New for tiered quantity discount
}

const getPromotionTypeLabel = (type: Promotion['type']) => {
    switch (type) {
        case 'percentage': return 'خصم نسبة مئوية';
        case 'fixed_amount': return 'خصم مبلغ ثابت';
        case 'buy_x_get_y_discount': return 'اشترِ صنفين، خصم على الأرخص';
        case 'buy_n_get_cheapest_discount': return 'اشترِ N أصناف، خصم على الأرخص';
        case 'tiered_quantity': return 'خصم الكميات المتدرج';
        default: return type;
    }
}

const PromotionForm = ({ promotion, onSave, onClose }: { promotion?: Promotion, onSave: (data: Partial<Promotion>) => void, onClose: () => void }) => {
    const { warehouses, promotions: allPromotions, items, itemCategories, itemSections, itemGroups, itemSubCategories1, itemSubCategories2 } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    
    const getInitialDates = () => {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const formatForInput = (date: Date) => date.toISOString().slice(0, 16);
        return {
            startDate: formatForInput(now),
            endDate: formatForInput(tomorrow)
        };
    };

    const [formData, setFormData] = useState<Partial<Promotion>>(
        promotion ? { 
            ...promotion, 
            startDate: promotion.startDate.slice(0, 16),
            endDate: promotion.endDate.slice(0, 16),
            warehouseIds: promotion.warehouseIds || [],
            tiers: promotion.tiers || []
        } : { 
            name: '', 
            description: '', 
            type: 'percentage', 
            value: 0, 
            ...getInitialDates(),
            buyCount: 2, 
            buyNTargetMode: 'specific',
            targetType: 'items',
            warehouseIds: [],
            tiers: [],
        }
    );
    
    const handleSubmit = () => {
        const currentStart = new Date(formData.startDate!);
        const currentEnd = new Date(formData.endDate!);

        if (currentStart >= currentEnd) {
            toast({
                variant: 'destructive',
                title: 'خطأ في التواريخ',
                description: 'تاريخ انتهاء العرض يجب أن يكون بعد تاريخ البدء.'
            });
            return;
        }

        onSave({
            ...promotion,
            ...formData, 
            value: Number(formData.value),
        });
        onClose();
    };
    
    const isBundleType = formData.type === 'buy_x_get_y_discount' || formData.type === 'buy_n_get_cheapest_discount';
    const isTieredType = formData.type === 'tiered_quantity';
    
    const warehouseOptions = useMemo(() => {
        let availableWarehouses = warehouses || [];
        
        // Filter based on user permissions
        if (user && !user.warehouseIds?.includes('all')) {
             availableWarehouses = availableWarehouses.filter((w: any) => user.warehouseIds?.includes(w.id));
        }

        return availableWarehouses
            .filter((w: any) => w && w.id && w.name)
            .map((w: any) => ({ value: w.id, label: w.name }));
    }, [warehouses, user]);

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="promo-name">اسم العرض</Label>
                <Input id="promo-name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="مثال: خصومات نهاية الأسبوع"/>
            </div>
             <div className="space-y-2">
                <Label htmlFor="promo-desc">وصف العرض</Label>
                <Input id="promo-desc" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="مثال: خصم خاص على المشروبات"/>
            </div>
            <div className="space-y-2">
                <Label htmlFor="promo-warehouses">الفروع المستهدفة</Label>
                <MultiSelect
                    options={warehouseOptions}
                    selected={formData.warehouseIds || []}
                    onChange={(selected) => setFormData({...formData, warehouseIds: selected})}
                    placeholder="كل الفروع"
                    className="w-full"
                />
                 <p className="text-xs text-muted-foreground">اتركه فارغًا لتطبيق العرض على جميع الفروع.</p>
            </div>
             <div className="space-y-2">
                <Label htmlFor="promo-type">نوع العرض</Label>
                <Select value={formData.type} onValueChange={(v: any) => setFormData({...formData, type: v, targetType: v === 'buy_x_get_y_discount' ? 'items' : formData.targetType })}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="percentage">{getPromotionTypeLabel('percentage')}</SelectItem>
                        <SelectItem value="fixed_amount">{getPromotionTypeLabel('fixed_amount')}</SelectItem>
                        <SelectItem value="buy_x_get_y_discount">{getPromotionTypeLabel('buy_x_get_y_discount')}</SelectItem>
                        <SelectItem value="buy_n_get_cheapest_discount">{getPromotionTypeLabel('buy_n_get_cheapest_discount')}</SelectItem>
                        <SelectItem value="tiered_quantity">{getPromotionTypeLabel('tiered_quantity')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>
             <div className="grid grid-cols-2 gap-4">
                 {formData.type === 'buy_n_get_cheapest_discount' && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="buy-count">عدد القطع المطلوبة (N)</Label>
                            <Input id="buy-count" type="number" value={formData.buyCount || 2} onChange={e => setFormData({...formData, buyCount: Number(e.target.value)})} min={2} />
                        </div>
                         <div className="space-y-2">
                            <Label>نطاق التطبيق</Label>
                            <Select value={formData.buyNTargetMode} onValueChange={(v: any) => setFormData({...formData, buyNTargetMode: v })}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="specific">أصناف/مجموعات محددة</SelectItem>
                                    <SelectItem value="all">كل الأصناف في المتجر</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </>
                 )}
                 {!isTieredType && (
                 <div className="space-y-2">
                    <Label htmlFor="promo-value">
                        {isBundleType ? 'نسبة الخصم على الأرخص (%)' : 'قيمة الخصم'}
                    </Label>
                    <Input id="promo-value" type="number" value={formData.value} onChange={e => setFormData({...formData, value: Number(e.target.value)})} />
                </div>
                )}
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="start-date">تاريخ ووقت البدء</Label>
                    <Input id="start-date" type="datetime-local" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="end-date">تاريخ ووقت الانتهاء</Label>
                    <Input id="end-date" type="datetime-local" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                </div>
            </div>
            <div className="flex justify-end pt-4">
                <Button onClick={handleSubmit}>حفظ العرض</Button>
            </div>
        </div>
    );
};

const ManageTieredQuantityDialog = ({ promotion, onClose, onSave }: { promotion: Promotion | null, onClose: () => void, onSave: (tiers: Tier[]) => void }) => {
    const { items, itemSections, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2 } = useData();
    const [tiers, setTiers] = useState<Tier[]>(promotion?.tiers || []);
    
    const getDataSource = (type: Promotion['targetType']) => {
        switch (type) {
            case 'items': return items;
            case 'itemSections': return itemSections;
            case 'itemCategories': return itemCategories;
            case 'itemGroups': return itemGroups;
            case 'itemSubCategories1': return itemSubCategories1;
            case 'itemSubCategories2': return itemSubCategories2;
            default: return [];
        }
    };
    
    const getOptionLabel = (targetType: Promotion['targetType'], targetId: string) => {
        const source = getDataSource(targetType);
        return source.find((i:any) => i.id === targetId)?.name || 'غير معروف';
    };

    const targetTypeOptions = [
        { value: 'items', label: 'صنف محدد' },
        { value: 'itemSections', label: 'فئة (مستوى 1)' },
        { value: 'itemCategories', label: 'قسم (مستوى 2)' },
        { value: 'itemGroups', label: 'مجموعة (مستوى 3)' },
        { value: 'itemSubCategories1', label: 'مجموعة فرعية 1' },
        { value: 'itemSubCategories2', label: 'مجموعة فرعية 2' },
    ];
    
    const targetIdOptions = (targetType: Promotion['targetType']) => {
        return getDataSource(targetType).map((i:any) => ({ value: i.id, label: i.name }));
    };

    const handleAddTier = () => {
        setTiers(prev => [...prev, {
            id: `tier-${Date.now()}`,
            targetType: 'itemSections',
            targetId: '',
            quantity: 2,
            discountPercentage: 10
        }]);
    };
    
    const handleRemoveTier = (id: string) => {
        setTiers(prev => prev.filter(t => t.id !== id));
    };

    const handleTierChange = (id: string, field: keyof Tier, value: any) => {
        setTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    if (!promotion) return null;

    return (
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>إدارة طبقات الخصم المتدرج: {promotion.name}</DialogTitle>
                <DialogDescription>
                    عرّف الشروط والخصومات لكل طبقة. سيقوم النظام بتطبيق الخصم على جميع الأصناف المؤهلة في السلة عند تحقيق الشرط.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto p-2">
                {tiers.map(tier => (
                    <div key={tier.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end p-4 border rounded-md relative">
                         <Button variant="ghost" size="icon" className="absolute top-1 left-1 h-6 w-6" onClick={() => handleRemoveTier(tier.id)}><X className="h-4 w-4"/></Button>
                         <div className="space-y-2">
                             <Label>عند شراء</Label>
                             <Input type="number" value={tier.quantity} onChange={e => handleTierChange(tier.id, 'quantity', Number(e.target.value))} />
                         </div>
                         <div className="space-y-2 col-span-2">
                            <Label>من</Label>
                            <div className="flex gap-2">
                                <Select value={tier.targetType} onValueChange={(v: any) => handleTierChange(tier.id, 'targetType', v)}>
                                    <SelectTrigger className="w-[150px]"><SelectValue/></SelectTrigger>
                                    <SelectContent>{targetTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                                </Select>
                                 <Combobox
                                    options={targetIdOptions(tier.targetType)}
                                    value={tier.targetId}
                                    onValueChange={v => handleTierChange(tier.id, 'targetId', v)}
                                    placeholder="اختر..."
                                    emptyMessage="لا توجد عناصر."
                                    className="flex-1"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                             <Label>احصل على خصم (%)</Label>
                             <Input type="number" value={tier.discountPercentage} onChange={e => handleTierChange(tier.id, 'discountPercentage', Number(e.target.value))} />
                         </div>
                    </div>
                ))}
                 <Button variant="outline" className="w-full" onClick={handleAddTier}>
                    <PlusCircle className="ml-2 h-4 w-4"/>
                    إضافة طبقة خصم جديدة
                </Button>
            </div>
             <DialogFooter>
                 <DialogClose asChild><Button variant="ghost">إلغاء</Button></DialogClose>
                 <Button onClick={() => onSave(tiers)}>حفظ الطبقات</Button>
            </DialogFooter>
        </DialogContent>
    );
};



const ManagePromotionItemsDialog = ({ promotion, onClose }: { promotion: Promotion | null, onClose: () => void }) => {
    const { items, itemSections, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2, dbAction, promotions: allPromotions } = useData();
    const { toast } = useToast();
    
    const [selectedIds, setSelectedIds] = useState<string[]>(promotion?.targetIds || []);
    const [targetType, setTargetType] = useState<Promotion['targetType']>(promotion?.targetType || 'items');
    const [searchTerm, setSearchTerm] = useState('');

    if (!promotion) return null;
    
    const isBuyXGetY = promotion.type === 'buy_x_get_y_discount';

    const getDataSource = (type: Promotion['targetType']) => {
        switch (type) {
            case 'items': return items;
            case 'itemSections': return itemSections;
            case 'itemCategories': return itemCategories;
            case 'itemGroups': return itemGroups;
            case 'itemSubCategories1': return itemSubCategories1;
            case 'itemSubCategories2': return itemSubCategories2;
            default: return [];
        }
    };
    
    const getItemIdsForCategoryLevel = (levelType: Promotion['targetType'], levelId: string): string[] => {
        if (levelType === 'items') return [levelId];
        let itemIds = new Set<string>();

        const collectItems = (filter: (item: any) => boolean) => {
            items.filter(filter).forEach((item: any) => itemIds.add(item.id));
        };

        if (levelType === 'itemSections') collectItems(i => i.sectionId === levelId);
        else if (levelType === 'itemCategories') collectItems(i => i.categoryId === levelId);
        else if (levelType === 'itemGroups') collectItems(i => i.itemGroupId === levelId);
        else if (levelType === 'itemSubCategories1') collectItems(i => i.subCategoryId1 === levelId);
        else if (levelType === 'itemSubCategories2') collectItems(i => i.subCategoryId2 === levelId);

        return Array.from(itemIds);
    };

    const conflictingItemIds = useMemo(() => {
        if (!promotion) return new Set<string>();
        const currentStart = new Date(promotion.startDate);
        const currentEnd = new Date(promotion.endDate);
        const conflictingIds = new Set<string>();

        for (const otherPromo of (allPromotions || [])) {
            if (otherPromo.id === promotion.id) continue;
            const promoStart = new Date(otherPromo.startDate);
            const promoEnd = new Date(otherPromo.endDate);
            
            if (currentStart < promoEnd && currentEnd > promoStart) {
                (otherPromo.targetIds || []).forEach((id: string) => {
                     getItemIdsForCategoryLevel(otherPromo.targetType, id).forEach(itemId => conflictingIds.add(itemId));
                });
            }
        }
        return conflictingIds;
    }, [allPromotions, promotion, items]);


    const availableOptions = useMemo(() => {
        const sourceData = getDataSource(targetType);
        return sourceData
            .filter((item: any) => !selectedIds.includes(item.id))
            .filter((item: any) => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [targetType, selectedIds, searchTerm, items, itemSections, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2]);

    const selectedOptions = useMemo(() => {
        const sourceData = getDataSource(targetType);
        return sourceData.filter((item: any) => selectedIds.includes(item.id));
    }, [targetType, selectedIds, items, itemSections, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2]);
    
    const handleAdd = useCallback((id: string) => {
        if (isBuyXGetY && selectedIds.length >= 2) {
             toast({ variant: 'destructive', title: 'خطأ', description: 'هذا العرض يتطلب اختيار صنفين فقط.' });
            return;
        }
        setSelectedIds(prev => [...prev, id]);
    }, [isBuyXGetY, selectedIds, toast]);
    
    const handleRemove = useCallback((id: string) => {
        setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    }, []);
    
    const handleSave = async () => {
        if (isBuyXGetY && selectedIds.length !== 2) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'يجب اختيار صنفين بالضبط لهذا النوع من العروض.' });
            return;
        }

        try {
            await dbAction('promotions', 'update', { id: promotion.id, data: { targetType: targetType, targetIds: selectedIds } });
            toast({ title: "تم الحفظ بنجاح" });
            onClose();
        } catch (e) {
            toast({ variant: 'destructive', title: "فشل الحفظ" });
        }
    }

    const isConflicting = (id: string) => {
        const itemsToCheck = getItemIdsForCategoryLevel(targetType, id);
        return itemsToCheck.some(itemId => conflictingItemIds.has(itemId));
    };

    const targetTypeOptions = [
        { value: 'items', label: 'أصناف محددة' },
        { value: 'itemSections', label: 'فئة (مستوى 1)' },
        { value: 'itemCategories', label: 'قسم (مستوى 2)' },
        { value: 'itemGroups', label: 'مجموعة (مستوى 3)' },
        { value: 'itemSubCategories1', label: 'مجموعة فرعية 1 (UDF)' },
        { value: 'itemSubCategories2', label: 'مجموعة فرعية 2 (UDF)' },
    ];

    return (
         <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>إدارة الأصناف والمجموعات للعرض: {promotion.name}</DialogTitle>
                <DialogDescription>اختر مستوى التصنيف الذي تريد تطبيق العرض عليه، ثم قم بإضافة العناصر المطلوبة.</DialogDescription>
            </DialogHeader>
             <div className="space-y-4">
                 <div className="w-full md:w-1/2">
                    <Label>تطبيق العرض على مستوى</Label>
                    <Select value={targetType} onValueChange={(v: any) => { setTargetType(v); setSelectedIds([]); }} disabled={isBuyXGetY}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {targetTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                 </div>
                
                <div className="grid grid-cols-2 gap-4 items-start">
                     <Card>
                        <CardHeader className="p-2">
                            <div className="relative">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="بحث..." className="pr-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-72">
                                <Table>
                                    <TableBody>
                                        {availableOptions.map((item: any) => (
                                            <TableRow key={item.id} className={cn("cursor-pointer", isConflicting(item.id) ? 'bg-red-500/10 hover:bg-red-500/20 text-destructive' : 'hover:bg-muted')} onClick={() => handleAdd(item.id)}>
                                                <TableCell>
                                                    {item.name}
                                                    {isConflicting(item.id) && <AlertTriangle className="h-4 w-4 text-destructive inline-block mr-2"/>}
                                                </TableCell>
                                                <TableCell className="text-left"><ArrowLeft className="h-4 w-4"/></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader className="p-2">
                            <CardTitle className="text-sm text-center">العناصر المشمولة في العرض ({selectedOptions.length})</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-72">
                                <Table>
                                     <TableBody>
                                        {selectedOptions.map((item: any) => (
                                            <TableRow key={item.id} className="cursor-pointer" onClick={() => handleRemove(item.id)}>
                                                 <TableCell><Trash2 className="h-4 w-4 text-destructive"/></TableCell>
                                                <TableCell>{item.name}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>
             <DialogFooter>
                 <DialogClose asChild><Button variant="ghost">إلغاء</Button></DialogClose>
                 <Button onClick={handleSave}>حفظ التغييرات</Button>
            </DialogFooter>
        </DialogContent>
    );
};


export default function PromotionsPage() {
    const { promotions, dbAction, getNextId, loading, warehouses, salesInvoices, posSales } = useData();
    const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
    const { toast } = useToast();
    const [filters, setFilters] = useState({
        status: 'active',
        searchTerm: '',
        fromDate: '',
        toDate: ''
    });

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({...prev, [key]: value}));
    };

    const handleSave = async (data: Partial<Promotion>) => {
        const { id, ...promotionData } = data;

        // Sanitize data to remove undefined values
        Object.keys(promotionData).forEach(key => {
            if (promotionData[key as keyof typeof promotionData] === undefined) {
                delete promotionData[key as keyof typeof promotionData];
            }
        });
        
        try {
            if (id) { // Update
                await dbAction('promotions', 'update', {id, data: promotionData});
                toast({ title: 'تم التحديث بنجاح' });
            } else { // Add new
                const nextId = await getNextId('promotion', 100);
                
                const fullPromoData: Omit<Promotion, 'id'> = {
                    name: data.name!,
                    description: data.description || '',
                    type: data.type!,
                    value: data.value!,
                    startDate: data.startDate!,
                    endDate: data.endDate!,
                    targetType: data.targetType || 'items',
                    targetIds: [],
                    promoCode: `PROMO-${nextId}`,
                    buyNTargetMode: data.buyNTargetMode || 'specific',
                    warehouseIds: data.warehouseIds || [],
                    tiers: data.type === 'tiered_quantity' ? (data.tiers || []) : [],
                };
                
                 if (data.type === 'buy_n_get_cheapest_discount') {
                    fullPromoData.buyCount = data.buyCount || 2;
                }

                await dbAction('promotions', 'add', fullPromoData);
                toast({ title: 'تم إنشاء العرض بنجاح', description: 'يمكنك الآن إضافة الأصناف/المجموعات له.' });
            }
        } catch (e) {
            console.error(e);
             toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ العرض.' });
        }
    };
    
    const usedPromotionIds = useMemo(() => {
        const ids = new Set<string>();
        const allSales = [...salesInvoices, ...posSales];
        allSales.forEach(sale => {
            sale.items?.forEach((item: any) => {
                if (item.promoApplied) {
                    ids.add(item.promoApplied);
                }
            });
        });
        return ids;
    }, [salesInvoices, posSales]);

    const handleDelete = async (id: string) => {
        if (usedPromotionIds.has(id)) {
            toast({
                variant: 'destructive',
                title: 'لا يمكن الحذف',
                description: 'لا يمكن حذف هذا العرض لأنه تم استخدامه بالفعل في عمليات بيع سابقة.'
            });
            return;
        }
        await dbAction('promotions', 'remove', {id});
        toast({ title: 'تم الحذف بنجاح' });
    };

    const handleDeleteAll = async () => {
        if (promotions.length === 0) {
            toast({ title: 'لا يوجد ما يمكن حذفه', description: 'لا توجد أي عروض حاليًا.' });
            return;
        }
        try {
            await dbAction('promotions', 'remove', { root: true }); // Special flag to delete the entire node
            toast({ title: 'تم الحذف بنجاح', description: `تم حذف جميع العروض من النظام.` });
        } catch (error) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حذف العروض.' });
        }
    };


    const getStatus = (promo: Promotion) => {
        const now = new Date();
        const start = new Date(promo.startDate);
        const end = new Date(promo.endDate);
        if (now < start) return { text: "قادم", color: "bg-blue-500", key: "upcoming" };
        if (now > end) return { text: "منتهي", color: "bg-gray-500", key: "expired" };
        return { text: "نشط", color: "bg-green-500", key: "active" };
    };
    
    const warehouseMap = useMemo(() => new Map((warehouses || []).map((w: any) => [w.id, w.name])), [warehouses]);
    
    const filteredPromotions = useMemo(() => {
        return (promotions || []).filter((promo: Promotion) => {
            const status = getStatus(promo).key;
            if (filters.status !== 'all' && status !== filters.status) {
                return false;
            }

            const searchTermLower = filters.searchTerm.toLowerCase();
            if (filters.searchTerm && 
                !promo.name.toLowerCase().includes(searchTermLower) &&
                !(promo.description || '').toLowerCase().includes(searchTermLower) &&
                !(promo.promoCode || '').toLowerCase().includes(searchTermLower)
            ) {
                return false;
            }
            
            const promoStart = new Date(promo.startDate);
            const promoEnd = new Date(promo.endDate);
            const from = filters.fromDate ? new Date(filters.fromDate) : null;
            const to = filters.toDate ? new Date(filters.toDate) : null;
            if(from) from.setHours(0,0,0,0);
            if(to) to.setHours(23,59,59,999);

            if(from && promoEnd < from) return false;
            if(to && promoStart > to) return false;
            
            return true;
        }).sort((a: Promotion, b: Promotion) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [promotions, filters]);

    return (
        <>
            <PageHeader title="إدارة العروض والخصومات">
                <div className="flex gap-2">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                                <Trash2 className="ml-2 h-4 w-4" /> حذف كل العروض
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                <AlertDialogDescription>
                                    سيؤدي هذا الإجراء إلى حذف جميع العروض الترويجية من النظام بشكل نهائي، سواء كانت مستخدمة أم لا. لا يمكن التراجع عن هذا الإجراء.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteAll}>نعم، قم بالحذف</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <AddEntityDialog
                        title="إنشاء عرض جديد"
                        description="حدد تفاصيل العرض الترويجي. يمكنك إضافة الأصناف لاحقًا."
                        triggerButton={<Button><PlusCircle className="ml-2 h-4 w-4" /> إضافة عرض</Button>}
                    >
                        <PromotionForm onSave={handleSave} onClose={() => {}} />
                    </AddEntityDialog>
                </div>
            </PageHeader>
            <main className="flex-1 p-4 md:p-6 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Filter/> فلاتر العرض</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-4">
                            <Tabs value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                                <TabsList>
                                    <TabsTrigger value="all">كل العروض</TabsTrigger>
                                    <TabsTrigger value="active">النشطة</TabsTrigger>
                                    <TabsTrigger value="upcoming">القادمة</TabsTrigger>
                                    <TabsTrigger value="expired">المنتهية</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                        <div className="space-y-2">
                             <Label>بحث</Label>
                             <Input placeholder="ابحث بالاسم، الوصف، أو الرقم..." value={filters.searchTerm} onChange={e => handleFilterChange('searchTerm', e.target.value)} />
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
                 <Dialog onOpenChange={(open) => !open && setSelectedPromotion(null)}>
                 <Card>
                    <CardHeader>
                        <CardTitle>قائمة العروض الترويجية</CardTitle>
                        <CardDescription>عرض وإدارة جميع الخصومات والعروض الخاصة بك.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         {loading ? <Loader2 className="animate-spin mx-auto" /> : (
                            <div className="w-full overflow-auto border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>رقم العرض</TableHead>
                                        <TableHead>اسم العرض</TableHead>
                                        <TableHead>النوع</TableHead>
                                        <TableHead>الفروع</TableHead>
                                        <TableHead>الحالة</TableHead>
                                        <TableHead className="text-center">الإجراءات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredPromotions && filteredPromotions.map((promo: Promotion) => {
                                        const status = getStatus(promo);
                                        const showManageItems = !(promo.type === 'buy_n_get_cheapest_discount' && promo.buyNTargetMode === 'all');
                                        const appliedWarehouses = promo.warehouseIds && promo.warehouseIds.length > 0 
                                            ? promo.warehouseIds.map(id => warehouseMap.get(id) || 'فرع محذوف').join(', ')
                                            : 'كل الفروع';
                                        return (
                                        <TableRow key={promo.id}>
                                            <TableCell>
                                                <Link href={`/reports/promotions/${promo.id}`} className='font-mono hover:underline text-primary'>
                                                    {promo.promoCode}
                                                </Link>
                                            </TableCell>
                                            <TableCell>{promo.name}</TableCell>
                                            <TableCell>{getPromotionTypeLabel(promo.type)}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Warehouse className="h-4 w-4 text-muted-foreground" />
                                                    <span className="text-xs">{appliedWarehouses}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell><Badge className={status.color}>{status.text}</Badge></TableCell>
                                            <TableCell className="text-center">
                                                <AlertDialog>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                                            {showManageItems && (
                                                                <DialogTrigger asChild>
                                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSelectedPromotion(promo); }}>
                                                                        {promo.type === 'tiered_quantity' ? <Layers className="ml-2 h-4 w-4" /> : <ListPlus className="ml-2 h-4 w-4" />}
                                                                        {promo.type === 'tiered_quantity' ? 'إدارة طبقات الخصم' : 'إدارة الأصناف/المجموعات'}
                                                                    </DropdownMenuItem>
                                                                </DialogTrigger>
                                                            )}
                                                             <AddEntityDialog
                                                                title="تعديل العرض"
                                                                description="تعديل تفاصيل العرض."
                                                                triggerButton={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><Edit className="ml-2 h-4 w-4"/>تعديل</DropdownMenuItem>}
                                                            >
                                                                <PromotionForm promotion={promo} onSave={handleSave} onClose={() => {}} />
                                                            </AddEntityDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()} disabled={usedPromotionIds.has(promo.id!)}>
                                                                    <Trash2 className="ml-2 h-4 w-4"/>حذف
                                                                </DropdownMenuItem>
                                                            </AlertDialogTrigger>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                                                            <AlertDialogDescription>سيتم حذف هذا العرض بشكل نهائي.</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDelete(promo.id!)}>متابعة</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    )})}
                                </TableBody>
                            </Table>
                            </div>
                         )}
                    </CardContent>
                 </Card>
                 {selectedPromotion && (
                    selectedPromotion.type === 'tiered_quantity' 
                    ? <ManageTieredQuantityDialog promotion={selectedPromotion} onClose={() => setSelectedPromotion(null)} onSave={(tiers) => dbAction('promotions', 'update', {id: selectedPromotion.id, data: {tiers}})} />
                    : <ManagePromotionItemsDialog promotion={selectedPromotion} onClose={() => setSelectedPromotion(null)} />
                 )}
                </Dialog>
            </main>
        </>
    );
}
