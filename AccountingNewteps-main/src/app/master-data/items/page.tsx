"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
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
import { AddEntityDialog } from "@/components/add-entity-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useData } from "@/contexts/data-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/contexts/permissions-context";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { BarcodePrintDialog } from "@/components/barcode-print-dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PlusCircle, Trash2, Loader2, QrCode, TrendingUp, Search, Component, Save, History, Edit, MoreHorizontal, X, Clock, Calculator, Layers, CheckCheck, FolderTree } from "lucide-react";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/auth-context";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MultiSelect } from "@/components/ui/multi-select";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";


interface SecondaryUnit {
  name: string;
  conversionFactor: number;
  price?: number;
  barcode?: string;
}

interface Item {
  id?: string;
  code?: string;
  name: string;
  baseUnit: 'piece' | 'weight' | 'meter' | 'kilo' | 'gram';
  price: number;
  cost?: number;
  reorderPoint?: number;
  barcodeType?: 'code128' | 'ean13_scale' | 'ean13_clothing';
  sectionId?: string; 
  categoryId?: string; 
  itemGroupId?: string; 
  subCategoryId1?: string;
  subCategoryId2?: string;
  isDisabled?: boolean;
  itemType?: 'standard' | 'raw_material' | 'manufactured';
  components?: { itemId: string; quantity: number }[]; 
  color?: string; 
  size?: string;
  defaultBinId?: string;
  secondaryUnits?: SecondaryUnit[];
  stock?: number; 
}

const QuickAddDialog = ({ open, onOpenChange, onConfirm, title, label }: { open: boolean, onOpenChange: (open: boolean) => void, onConfirm: (name: string) => void, title: string, label: string }) => {
    const [name, setName] = useState('');

    const handleConfirm = () => {
        if (name) {
            onConfirm(name);
            setName('');
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="quick-add-name">{label}</Label>
                        <Input 
                            id="quick-add-name" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleConfirm();
                                }
                            }}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
                    <Button onClick={handleConfirm}>حفظ</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function PriceUpdateDialog({ items, onSave, onOpenChange }: { items: (Item | undefined)[]; onSave: (action: "increase" | "decrease", percentage: number) => void; onOpenChange: (open: boolean) => void; }) {
    const [action, setAction] = useState<"increase" | "decrease">("increase");
    const [percentage, setPercentage] = useState(0);

    const handleSave = () => {
        onSave(action, percentage);
        onOpenChange(false);
    };
    
    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>تحديث أسعار البيع</DialogTitle>
                <DialogDescription>
                    سيتم تطبيق التغيير على {items.length} صنف محدد.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>الإجراء</Label>
                    <Select value={action} onValueChange={(v: any) => setAction(v)}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="increase">زيادة السعر</SelectItem>
                            <SelectItem value="decrease">تخفيض السعر</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                 <div className="space-y-2">
                    <Label>بنسبة (%)</Label>
                    <Input type="number" value={percentage} onChange={e => setPercentage(Number(e.target.value))} />
                </div>
            </div>
             <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
                <Button onClick={handleSave} disabled={percentage <= 0}>تطبيق التغيير</Button>
            </DialogFooter>
        </DialogContent>
    )
}

function BulkCategoryUpdateDialog({
    items,
    itemSections,
    itemCategories,
    itemGroups,
    itemSubCategories1,
    itemSubCategories2,
    isOpen,
    onOpenChange,
    onSave,
    isSaving,
    dbAction,
    getNextId
}: {
    items: any[];
    itemSections: any[];
    itemCategories: any[];
    itemGroups: any[];
    itemSubCategories1: any[];
    itemSubCategories2: any[];
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (options: {
        mode: 'all' | 'only_empty';
        sectionId?: string;
        categoryId?: string;
        itemGroupId?: string;
        subCategoryId1?: string;
        subCategoryId2?: string;
    }) => Promise<void>;
    isSaving: boolean;
    dbAction: any;
    getNextId: any;
}) {
    const { toast } = useToast();
    const [mode, setMode] = useState<'all' | 'only_empty'>('all');
    
    // Values: '__NO_CHANGE__' | '__CLEAR__' | specific id
    const [sectionId, setSectionId] = useState<string>('__NO_CHANGE__');
    const [categoryId, setCategoryId] = useState<string>('__NO_CHANGE__');
    const [itemGroupId, setItemGroupId] = useState<string>('__NO_CHANGE__');
    const [subCategoryId1, setSubCategoryId1] = useState<string>('__NO_CHANGE__');
    const [subCategoryId2, setSubCategoryId2] = useState<string>('__NO_CHANGE__');

    // Local lists for immediate dynamic reflection when adding new items
    const [localSections, setLocalSections] = useState<any[]>(itemSections);
    const [localCategories, setLocalCategories] = useState<any[]>(itemCategories);
    const [localGroups, setLocalGroups] = useState<any[]>(itemGroups);
    const [localSubs1, setLocalSubs1] = useState<any[]>(itemSubCategories1);
    const [localSubs2, setLocalSubs2] = useState<any[]>(itemSubCategories2);

    useEffect(() => setLocalSections(itemSections), [itemSections]);
    useEffect(() => setLocalCategories(itemCategories), [itemCategories]);
    useEffect(() => setLocalGroups(itemGroups), [itemGroups]);
    useEffect(() => setLocalSubs1(itemSubCategories1), [itemSubCategories1]);
    useEffect(() => setLocalSubs2(itemSubCategories2), [itemSubCategories2]);

    // Quick Add inline states
    const [isAddingSection, setIsAddingSection] = useState(false);
    const [newSectionName, setNewSectionName] = useState('');
    const [isSavingSection, setIsSavingSection] = useState(false);

    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [isSavingCategory, setIsSavingCategory] = useState(false);

    const [isAddingGroup, setIsAddingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [isSavingGroup, setIsSavingGroup] = useState(false);

    // الربط الذكي: عند اختيار مجموعة يتم تلقائياً ضبط الفئة والقسم التابعين لها
    useEffect(() => {
        if (itemGroupId && itemGroupId !== '__NO_CHANGE__' && itemGroupId !== '__CLEAR__') {
            const group = localGroups.find(g => g.id === itemGroupId);
            if (group && group.parentCategoryId) {
                const cat = localCategories.find(c => c.id === group.parentCategoryId);
                if (cat) {
                    setCategoryId(cat.id);
                    if (cat.sectionId) {
                        setSectionId(cat.sectionId);
                    }
                }
            }
        }
    }, [itemGroupId, localGroups, localCategories]);

    useEffect(() => {
        if (categoryId && categoryId !== '__NO_CHANGE__' && categoryId !== '__CLEAR__') {
            const cat = localCategories.find(c => c.id === categoryId);
            if (cat && cat.sectionId) {
                setSectionId(cat.sectionId);
            }
        }
    }, [categoryId, localCategories]);

    // الفئات المتاحة استناداً إلى القسم المختار
    const availableCategories = useMemo(() => {
        if (sectionId && sectionId !== '__NO_CHANGE__' && sectionId !== '__CLEAR__') {
            return localCategories.filter(c => c.sectionId === sectionId);
        }
        return localCategories;
    }, [localCategories, sectionId]);

    // المجموعات المتاحة استناداً إلى الفئة المختارة
    const availableGroups = useMemo(() => {
        if (categoryId && categoryId !== '__NO_CHANGE__' && categoryId !== '__CLEAR__') {
            return localGroups.filter(g => g.parentCategoryId === categoryId);
        }
        return localGroups;
    }, [localGroups, categoryId]);

    // إحصاء الأصناف الشاغرة
    const emptyStats = useMemo(() => {
        let noSection = 0;
        let noCategory = 0;
        let noGroup = 0;
        items.forEach(item => {
            if (!item?.sectionId) noSection++;
            if (!item?.categoryId) noCategory++;
            if (!item?.itemGroupId) noGroup++;
        });
        return { noSection, noCategory, noGroup };
    }, [items]);

    // Helper: إضافة قسم جديد فوراً
    const handleCreateSection = async () => {
        if (!newSectionName.trim()) return;
        setIsSavingSection(true);
        try {
            const codes = localSections.map(i => parseInt(i.code || '0', 10)).filter(n => !isNaN(n));
            const currentMax = (codes.length > 0 ? Math.max(...codes) : 0) + 1;
            let code = '01';
            if (getNextId) {
                const nextNum = await getNextId('itemSectionCode', currentMax);
                if (nextNum) code = String(nextNum).padStart(2, '0');
            }
            const newId = await dbAction('itemSections', 'add', { name: newSectionName.trim(), code });
            const newItem = { id: newId, name: newSectionName.trim(), code };
            setLocalSections(prev => [...prev, newItem]);
            setSectionId(newId);
            setNewSectionName('');
            setIsAddingSection(false);
            toast({ title: 'تمت إضافة القسم الجديد بنجاح', description: `تم تعيين قسم "${newItem.name}" للأصناف المحددة.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'فشل إضافة القسم', description: e.message });
        } finally {
            setIsSavingSection(false);
        }
    };

    // Helper: إضافة فئة جديدة فوراً
    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return;
        setIsSavingCategory(true);
        try {
            const parentSection = localSections.find(s => s.id === sectionId);
            const parentCode = parentSection?.code || '00';
            const siblings = localCategories.filter(c => c.sectionId === sectionId);
            const currentMax = siblings.length + 1;
            let code = `${parentCode}-${currentMax}`;
            if (getNextId && sectionId && sectionId !== '__NO_CHANGE__' && sectionId !== '__CLEAR__') {
                const nextNum = await getNextId(`itemCategoryCode_${sectionId}`, currentMax);
                if (nextNum) code = `${parentCode}-${nextNum}`;
            }
            const dataToAdd: any = { name: newCategoryName.trim(), code };
            if (sectionId && sectionId !== '__NO_CHANGE__' && sectionId !== '__CLEAR__') {
                dataToAdd.sectionId = sectionId;
            }
            const newId = await dbAction('itemCategories', 'add', dataToAdd);
            const newItem = { id: newId, ...dataToAdd };
            setLocalCategories(prev => [...prev, newItem]);
            setCategoryId(newId);
            setNewCategoryName('');
            setIsAddingCategory(false);
            toast({ title: 'تمت إضافة الفئة الجديدة بنجاح', description: `تم تعيين فئة "${newItem.name}" للأصناف.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'فشل إضافة الفئة', description: e.message });
        } finally {
            setIsSavingCategory(false);
        }
    };

    // Helper: إضافة مجموعة جديدة فوراً
    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) return;
        setIsSavingGroup(true);
        try {
            const parentCat = localCategories.find(c => c.id === categoryId);
            const parentCode = parentCat?.code || '00-0';
            const siblings = localGroups.filter(g => g.parentCategoryId === categoryId);
            const currentMax = siblings.length + 1;
            let code = `${parentCode}-${currentMax}`;
            if (getNextId && categoryId && categoryId !== '__NO_CHANGE__' && categoryId !== '__CLEAR__') {
                const nextNum = await getNextId(`itemGroupCode_${categoryId}`, currentMax);
                if (nextNum) code = `${parentCode}-${nextNum}`;
            }
            const dataToAdd: any = { name: newGroupName.trim(), code };
            if (categoryId && categoryId !== '__NO_CHANGE__' && categoryId !== '__CLEAR__') {
                dataToAdd.parentCategoryId = categoryId;
            }
            const newId = await dbAction('itemGroups', 'add', dataToAdd);
            const newItem = { id: newId, ...dataToAdd };
            setLocalGroups(prev => [...prev, newItem]);
            setItemGroupId(newId);
            setNewGroupName('');
            setIsAddingGroup(false);
            toast({ title: 'تمت إضافة المجموعة بنجاح', description: `تم تعيين مجموعة "${newItem.name}" للأصناف.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'فشل إضافة المجموعة', description: e.message });
        } finally {
            setIsSavingGroup(false);
        }
    };

    const hasAnyChange = sectionId !== '__NO_CHANGE__' || 
                         categoryId !== '__NO_CHANGE__' || 
                         itemGroupId !== '__NO_CHANGE__' || 
                         subCategoryId1 !== '__NO_CHANGE__' || 
                         subCategoryId2 !== '__NO_CHANGE__';

    const handleConfirm = async () => {
        if (!hasAnyChange) return;
        await onSave({
            mode,
            sectionId,
            categoryId,
            itemGroupId,
            subCategoryId1,
            subCategoryId2
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
                <DialogHeader className="border-b pb-3">
                    <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                        <Layers className="h-5 w-5 text-primary" />
                        الإجراء الجماعي: تعديل وتسكين تصنيفات الأصناف
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        تطبيق التصنيفات على <strong className="text-foreground">{items.length} صنفاً محدداً</strong> مع إمكانية إضافة أقسام وفئات جديدة فوراً دون مغادرة الشاشة.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-3">
                    {/* 1. اختيار نمط الإجراء الجماعي */}
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-foreground flex items-center justify-between">
                            <span>1. اختر نطاق التطبيق على الأصناف:</span>
                            <span className="text-[11px] text-muted-foreground font-normal">
                                {items.length} صنف محدد
                            </span>
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div 
                                onClick={() => setMode('all')}
                                className={cn(
                                    "p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-1 text-right",
                                    mode === 'all' 
                                        ? "border-primary bg-primary/10 shadow-sm" 
                                        : "border-border hover:bg-muted/40 opacity-80"
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs text-foreground">🔄 تحويل ونقل الكل (إجباري)</span>
                                    {mode === 'all' && <Check className="h-4 w-4 text-primary" />}
                                </div>
                                <span className="text-[11px] text-muted-foreground leading-relaxed">
                                    تغيير وتعيين التصنيف لكافة الأصناف المحددة حتى لو كان لها قسم أو فئة مسجلة سابقاً.
                                </span>
                            </div>

                            <div 
                                onClick={() => setMode('only_empty')}
                                className={cn(
                                    "p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-1 text-right",
                                    mode === 'only_empty' 
                                        ? "border-primary bg-primary/10 shadow-sm" 
                                        : "border-border hover:bg-muted/40 opacity-80"
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs text-foreground">🎯 تسكين الشواغر فقط (إذا لم يكن لها)</span>
                                    {mode === 'only_empty' && <Check className="h-4 w-4 text-primary" />}
                                </div>
                                <span className="text-[11px] text-muted-foreground leading-relaxed">
                                    تطبيق التصنيف فقط على الأصناف غير المصنفة، مع الحفاظ على تصنيف الأصناف المصنفة كما هو.
                                </span>
                            </div>
                        </div>

                        {/* إحصائيات سريعة للشواغر */}
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                            {emptyStats.noSection > 0 ? (
                                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30 gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {emptyStats.noSection} صنف بلا قسم
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-500/10 border-emerald-500/30 gap-1">
                                    <Check className="h-3 w-3" />
                                    كافة الأصناف لها قسم
                                </Badge>
                            )}
                            {emptyStats.noCategory > 0 && (
                                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30 gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {emptyStats.noCategory} صنف بلا فئة
                                </Badge>
                            )}
                            {emptyStats.noGroup > 0 && (
                                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30 gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {emptyStats.noGroup} صنف بلا مجموعة
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* 2. الأقسام والفئات والمجموعات مع إمكانية الإضافة الفورية */}
                    <div className="space-y-4 border rounded-xl p-4 bg-muted/20">
                        <div className="font-bold text-xs text-foreground border-b pb-2 flex items-center justify-between">
                            <span>2. تحديد التصنيفات الجديدة المطلوبة:</span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                                أي حقل تتركه بدون تغيير لن يتم المساس به
                            </span>
                        </div>

                        {/* المستوى 1: القسم الرئيسي (Section) */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                    <span>القسم الرئيسي (Section)</span>
                                    <span className="text-muted-foreground text-[10px] font-normal">(مستوى 1 - مثل: مكملات، أغذية، أدوات)</span>
                                </Label>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setIsAddingSection(!isAddingSection)}
                                    className="h-6 text-[11px] gap-1 px-2 font-bold text-primary border-primary/40 hover:bg-primary/10"
                                >
                                    <PlusCircle className="h-3 w-3" />
                                    {isAddingSection ? 'إلغاء' : '+ إضافة قسم جديد فوراً'}
                                </Button>
                            </div>

                            {/* خانة إضافة قسم جديد السريعة */}
                            {isAddingSection && (
                                <div className="p-2.5 rounded-lg border bg-primary/5 flex items-center gap-2 animate-in fade-in-50 duration-200">
                                    <Input 
                                        placeholder="اكتب اسم القسم الجديد هنا (مثال: مكملات غذائية)..."
                                        value={newSectionName}
                                        onChange={e => setNewSectionName(e.target.value)}
                                        className="h-8 text-xs font-bold bg-background"
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateSection(); } }}
                                        autoFocus
                                    />
                                    <Button 
                                        type="button" 
                                        size="sm" 
                                        onClick={handleCreateSection}
                                        disabled={!newSectionName.trim() || isSavingSection}
                                        className="h-8 px-3 text-xs font-bold gap-1 shrink-0"
                                    >
                                        {isSavingSection ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                        حفظ وتعيين
                                    </Button>
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <Select value={sectionId} onValueChange={setSectionId}>
                                    <SelectTrigger className="h-9 text-xs flex-1">
                                        <SelectValue placeholder="اختر القسم الرئيسي..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__NO_CHANGE__" className="text-muted-foreground italic">
                                            -- عدم التغيير (يبقى القسم الحالي كما هو) --
                                        </SelectItem>
                                        <SelectItem value="__CLEAR__" className="text-destructive font-medium">
                                            -- تفريغ / إزالة القسم من الأصناف --
                                        </SelectItem>
                                        {localSections.map((s: any) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name} {s.code ? `(${s.code})` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {sectionId !== '__NO_CHANGE__' && (
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
                                        onClick={() => setSectionId('__NO_CHANGE__')}
                                        title="إلغاء التغيير على هذا الحقل"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* المستوى 2: الفئة / التصنيف (Category) */}
                        <div className="space-y-2 pt-2 border-t">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                    <span>الفئة / التصنيف (Category)</span>
                                    <span className="text-muted-foreground text-[10px] font-normal">(مستوى 2 - مثل: بروتينات، كرياتين، فيتامينات)</span>
                                </Label>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setIsAddingCategory(!isAddingCategory)}
                                    className="h-6 text-[11px] gap-1 px-2 font-bold text-primary border-primary/40 hover:bg-primary/10"
                                >
                                    <PlusCircle className="h-3 w-3" />
                                    {isAddingCategory ? 'إلغاء' : '+ إضافة فئة جديدة فوراً'}
                                </Button>
                            </div>

                            {/* خانة إضافة فئة جديدة السريعة */}
                            {isAddingCategory && (
                                <div className="p-2.5 rounded-lg border bg-primary/5 flex items-center gap-2 animate-in fade-in-50 duration-200">
                                    <Input 
                                        placeholder="اكتب اسم الفئة الجديدة هنا (مثال: واي بروتين)..."
                                        value={newCategoryName}
                                        onChange={e => setNewCategoryName(e.target.value)}
                                        className="h-8 text-xs font-bold bg-background"
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory(); } }}
                                        autoFocus
                                    />
                                    <Button 
                                        type="button" 
                                        size="sm" 
                                        onClick={handleCreateCategory}
                                        disabled={!newCategoryName.trim() || isSavingCategory}
                                        className="h-8 px-3 text-xs font-bold gap-1 shrink-0"
                                    >
                                        {isSavingCategory ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                        حفظ وتعيين
                                    </Button>
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <Select value={categoryId} onValueChange={setCategoryId}>
                                    <SelectTrigger className="h-9 text-xs flex-1">
                                        <SelectValue placeholder="اختر الفئة / التصنيف..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__NO_CHANGE__" className="text-muted-foreground italic">
                                            -- عدم التغيير (تبقى الفئة الحالية كما هي) --
                                        </SelectItem>
                                        <SelectItem value="__CLEAR__" className="text-destructive font-medium">
                                            -- تفريغ / إزالة الفئة من الأصناف --
                                        </SelectItem>
                                        {availableCategories.map((c: any) => {
                                            const secName = localSections.find((s: any) => s.id === c.sectionId)?.name;
                                            return (
                                                <SelectItem key={c.id} value={c.id}>
                                                    {c.name} {secName ? `(${secName})` : ''}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                                {categoryId !== '__NO_CHANGE__' && (
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
                                        onClick={() => setCategoryId('__NO_CHANGE__')}
                                        title="إلغاء التغيير على هذا الحقل"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* المستوى 3: المجموعة العامة (Item Group) */}
                        <div className="space-y-2 pt-2 border-t">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                    <span>المجموعة العامة (Item Group)</span>
                                    <span className="text-muted-foreground text-[10px] font-normal">(مستوى 3 - مجموعة تفصيلية تابعة للفئة)</span>
                                </Label>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setIsAddingGroup(!isAddingGroup)}
                                    className="h-6 text-[11px] gap-1 px-2 font-bold text-primary border-primary/40 hover:bg-primary/10"
                                >
                                    <PlusCircle className="h-3 w-3" />
                                    {isAddingGroup ? 'إلغاء' : '+ إضافة مجموعة جديدة'}
                                </Button>
                            </div>

                            {/* خانة إضافة مجموعة جديدة السريعة */}
                            {isAddingGroup && (
                                <div className="p-2.5 rounded-lg border bg-primary/5 flex items-center gap-2 animate-in fade-in-50 duration-200">
                                    <Input 
                                        placeholder="اكتب اسم المجموعة الجديدة هنا..."
                                        value={newGroupName}
                                        onChange={e => setNewGroupName(e.target.value)}
                                        className="h-8 text-xs font-bold bg-background"
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateGroup(); } }}
                                        autoFocus
                                    />
                                    <Button 
                                        type="button" 
                                        size="sm" 
                                        onClick={handleCreateGroup}
                                        disabled={!newGroupName.trim() || isSavingGroup}
                                        className="h-8 px-3 text-xs font-bold gap-1 shrink-0"
                                    >
                                        {isSavingGroup ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                        حفظ وتعيين
                                    </Button>
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <Select value={itemGroupId} onValueChange={setItemGroupId}>
                                    <SelectTrigger className="h-9 text-xs flex-1">
                                        <SelectValue placeholder="اختر المجموعة العامة..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__NO_CHANGE__" className="text-muted-foreground italic">
                                            -- عدم التغيير (تبقى المجموعة كما هي) --
                                        </SelectItem>
                                        <SelectItem value="__CLEAR__" className="text-destructive font-medium">
                                            -- تفريغ / إزالة المجموعة من الأصناف --
                                        </SelectItem>
                                        {availableGroups.map((g: any) => {
                                            const catName = localCategories.find((c: any) => c.id === g.parentCategoryId)?.name;
                                            return (
                                                <SelectItem key={g.id} value={g.id}>
                                                    {g.name} {catName ? `(${catName})` : ''}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                                {itemGroupId !== '__NO_CHANGE__' && (
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
                                        onClick={() => setItemGroupId('__NO_CHANGE__')}
                                        title="إلغاء التغيير على هذا الحقل"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* تصنيفات فرعية إضافية (ماركة وموديل) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold">تصنيف فرعي 1 (ماركة / UDF1)</Label>
                                <Select value={subCategoryId1} onValueChange={setSubCategoryId1}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="اختر تصنيف فرعي 1..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__NO_CHANGE__" className="text-muted-foreground italic">-- عدم التغيير --</SelectItem>
                                        <SelectItem value="__CLEAR__" className="text-destructive font-medium">-- تفريغ الحالي --</SelectItem>
                                        {localSubs1.map((u: any) => (
                                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold">تصنيف فرعي 2 (موديل / UDF2)</Label>
                                <Select value={subCategoryId2} onValueChange={setSubCategoryId2}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="اختر تصنيف فرعي 2..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__NO_CHANGE__" className="text-muted-foreground italic">-- عدم التغيير --</SelectItem>
                                        <SelectItem value="__CLEAR__" className="text-destructive font-medium">-- تفريغ الحالي --</SelectItem>
                                        {localSubs2.map((u: any) => (
                                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0 border-t pt-3 flex justify-between items-center">
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        إلغاء
                    </Button>
                    <Button 
                        size="sm" 
                        onClick={handleConfirm} 
                        disabled={!hasAnyChange || isSaving}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-1.5 shadow-sm"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin ml-1" />
                                جاري تطبيق التعديل الجماعي...
                            </>
                        ) : (
                            <>
                                <CheckCheck className="h-4 w-4 ml-1" />
                                حفظ وتطبيق التعديل على {items.length} صنف
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const MatrixGeneratorDialog = ({ onSave, onOpenChange, itemSections, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2, settings, getNextId }: {
    onSave: (items: any[]) => void;
    onOpenChange: (open: boolean) => void;
    itemSections: any[];
    itemCategories: any[];
    itemGroups: any[];
    itemSubCategories1: any[];
    itemSubCategories2: any[];
    allItems: Item[];
    settings: any;
    getNextId: (counterName: string, startFrom?: number) => Promise<number | null>;
}) => {
    const [baseItem, setBaseItem] = useState({ name: '', sectionId: '', categoryId: '', itemGroupId: '', cost: 0, price: 0 });
    const [selectedUDF1, setSelectedUDF1] = useState<string[]>([]);
    const [selectedUDF2, setSelectedUDF2] = useState<string[]>([]);
    
    const sectionOptions = useMemo(() => itemSections.map(s => ({ value: s.id, label: s.name })), [itemSections]);
    const categoryOptions = useMemo(() => {
        if (!baseItem.sectionId) return [];
        return itemCategories.filter(c => c.sectionId === baseItem.sectionId).map(c => ({ value: c.id, label: c.name }));
    }, [itemCategories, baseItem.sectionId]);
    const groupOptions = useMemo(() => {
        if (!baseItem.categoryId) return [];
        return itemGroups.filter(g => g.parentCategoryId === baseItem.categoryId).map(g => ({ value: g.id, label: g.name }));
    }, [itemGroups, baseItem.categoryId]);
    
    const udf1Options = useMemo(() => itemSubCategories1.map(c => ({ value: c.id, label: c.name })), [itemSubCategories1]);
    const udf2Options = useMemo(() => itemSubCategories2.map(s => ({ value: s.id, label: s.name })), [itemSubCategories2]);

    useEffect(() => {
        const { itemGroupId, categoryId, sectionId } = baseItem;
        if (itemGroupId && (!categoryId || !sectionId)) {
            const group = itemGroups.find(g => g.id === itemGroupId);
            if (group && group.parentCategoryId) {
                const category = itemCategories.find(c => c.id === group.parentCategoryId);
                if (category) {
                    const section = itemSections.find(s => s.id === category.sectionId);
                    if (section) {
                        setBaseItem(prev => ({
                            ...prev,
                            categoryId: category.id,
                            sectionId: section.id,
                        }));
                    }
                }
            }
        } else if (categoryId && !sectionId) {
            const category = itemCategories.find(c => c.id === categoryId);
            if(category && category.sectionId) {
                 setBaseItem(prev => ({ ...prev, sectionId: category.sectionId }));
            }
        }
    }, [baseItem.itemGroupId, baseItem.categoryId, itemSections, itemCategories, itemGroups]);
    
    
    const handleGenerate = async () => {
        if (!baseItem.name) {
            alert("الرجاء إدخل اسم أساسي للمصفوفة.");
            return;
        }

        const calculateEan13CheckDigit = (barcode: string) => {
            if (barcode.length !== 12) return '0';
            let sumEven = 0, sumOdd = 0;
            barcode.split('').forEach((char, index) => {
                const digit = parseInt(char, 10);
                if ((index + 1) % 2 === 0) sumEven += digit;
                else sumOdd += digit;
            });
            const totalSum = sumOdd + (sumEven * 3);
            const remainder = totalSum % 10;
            return String((remainder === 0) ? 0 : 10 - remainder);
        };

        const itemsToCreate: any[] = [];
        
        for (const udf1Id of selectedUDF1) {
            for (const udf2Id of selectedUDF2) {
                const udf1 = itemSubCategories1.find(c => c.id === udf1Id);
                const udf2 = itemSubCategories2.find(s => s.id === udf2Id);
                if (udf1 && udf2) {
                    const nextId = await getNextId('clothingItemCode', 1000);
                     if (nextId === null) {
                         alert("فشل في إنشاء كود فريد للصنف. يرجى المحاولة مرة أخرى.");
                         return;
                    }
                    
                    const newItemData = {
                        ...baseItem,
                        name: `${baseItem.name} - ${udf1.name} - ${udf2.name}`,
                        subCategoryId1: udf1Id,
                        subCategoryId2: udf2Id,
                        baseUnit: 'piece',
                        itemType: 'standard',
                        barcodeType: 'ean13_clothing',
                    };
                    
                    const section = itemSections.find((s:any) => s.id === newItemData.sectionId);
                    const category = itemCategories.find((c:any) => c.id === newItemData.categoryId);
                    const clothingPrefix = settings?.main?.financial?.clothingBarcodePrefix || '23';

                    const sectionCode = String(section?.code || '00').padStart(2, '0');
                    const categoryCode = String(category?.code?.split('-')[1] || '00').padStart(2, '0');
                    const udf1Code = String(udf1?.code || '00').padStart(2, '0');
                    const udf2Code = String(udf2?.code || '00').padStart(2, '0');
                    const itemIndexCode = String(nextId).padStart(3, '0');
                    const parentIdCode = '000'; // Fixed the missing variable

                    const base = `${clothingPrefix}${sectionCode}${categoryCode}${parentIdCode}${udf1Code}${udf2Code}${itemIndexCode}`.slice(0, 12);
                    const checkDigit = calculateEan13CheckDigit(base);
                    const finalBarcode = `${base}${checkDigit}`;

                    itemsToCreate.push({ ...newItemData, code: finalBarcode });
                }
            }
        }
        onSave(itemsToCreate);
    };


    return (
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>إنشاء مصفوفة أصناف</DialogTitle>
                <DialogDescription>
                    أدخل بيانات الصنف الأساسي، ثم اختر قيم الحقول المخصصة لإنشاء جميع التشكيلات تلقائيًا مع باركود فريد لكل منها.
                </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="space-y-4 p-4 border rounded-md">
                    <h3 className="font-semibold">1. بيانات الصنف الأساسي</h3>
                    <div className="space-y-2">
                        <Label>الاسم الأساسي</Label>
                        <Input value={baseItem.name} onChange={e => setBaseItem(p => ({ ...p, name: e.target.value }))} placeholder="مثال: تيشيرت بولو" />
                    </div>
                     <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>الفئة</Label>
                            <Combobox options={sectionOptions} value={baseItem.sectionId} onValueChange={v => setBaseItem(p => ({ ...p, sectionId: v, categoryId: '', itemGroupId: '' }))} placeholder="اختر فئة" emptyMessage="لا يوجد فئات"/>
                        </div>
                         <div className="space-y-2">
                            <Label>القسم</Label>
                            <Combobox options={categoryOptions} value={baseItem.categoryId} onValueChange={v => setBaseItem(p => ({ ...p, categoryId: v, itemGroupId: '' }))} placeholder="اختر قسم" emptyMessage="اختر فئة أولا" disabled={!baseItem.sectionId} />
                        </div>
                        <div className="space-y-2">
                            <Label>المجموعة</Label>
                            <Combobox options={groupOptions} value={baseItem.itemGroupId} onValueChange={v => setBaseItem(p => ({ ...p, itemGroupId: v }))} placeholder="اختر مجموعة" emptyMessage="اختر قسماً أولاً" disabled={!baseItem.categoryId} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>التكلفة</Label>
                            <Input type="number" value={baseItem.cost} onChange={e => setBaseItem(p => ({ ...p, cost: Number(e.target.value) }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>سعر البيع</Label>
                            <Input type="number" value={baseItem.price} onChange={e => setBaseItem(p => ({ ...p, price: Number(e.target.value) }))} />
                        </div>
                    </div>
                </div>

                <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                     <h3 className="font-semibold">2. تحديد الحقول المخصصة (UDF)</h3>
                     <div className="space-y-2">
                        <Label>مجموعة فرعية 1 (مثال: اللون)</Label>
                        <MultiSelect
                            options={udf1Options}
                            selected={selectedUDF1}
                            onChange={setSelectedUDF1}
                            placeholder="اختر قيمة أو أكثر..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>مجموعة فرعية 2 (مثال: المقاس)</Label>
                        <MultiSelect
                            options={udf2Options}
                            selected={selectedUDF2}
                            onChange={setSelectedUDF2}
                            placeholder="اختر قيمة أو أكثر..."
                        />
                    </div>
                    <div className="mt-4 p-2 bg-muted rounded-md text-center text-sm font-semibold">
                       سيتم إنشاء {selectedUDF1.length * selectedUDF2.length} صنف جديد.
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
                <Button onClick={handleGenerate} disabled={!baseItem.name || selectedUDF1.length === 0 || selectedUDF2.length === 0}>
                    إنشاء الأصناف
                </Button>
            </DialogFooter>
        </DialogContent>
    )
}

const SecondaryUnitDialog = ({ unit, onSave, onClose }: { unit: Partial<SecondaryUnit>, onSave: (unit: SecondaryUnit) => void, onClose: () => void }) => {
    const [formData, setFormData] = useState<Partial<SecondaryUnit>>({
        name: unit.name || '',
        conversionFactor: unit.conversionFactor || 0,
        price: unit.price,
        barcode: unit.barcode || ''
    });

    const handleSave = () => {
        if (!formData.name || !formData.conversionFactor) return;
        onSave(formData as SecondaryUnit);
        onClose();
    };

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{unit.name ? 'تعديل الوحدة' : 'إضافة وحدة ثانوية جديدة'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="unit-name">اسم الوحدة</Label>
                    <Input id="unit-name" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="مثال: كرتونة، دستة" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="unit-factor">معامل التحويل (عدد الوحدات الأساسية)</Label>
                    <Input id="unit-factor" type="number" value={formData.conversionFactor} onChange={e => setFormData(p => ({ ...p, conversionFactor: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="unit-price">سعر بيع هذه الوحدة</Label>
                    <Input id="unit-price" type="number" value={formData.price || ''} onChange={e => setFormData(p => ({ ...p, price: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="unit-barcode">باركود الوحدة (اختياري)</Label>
                    <Input id="unit-barcode" value={formData.barcode || ''} onChange={e => setFormData(p => ({ ...p, barcode: e.target.value }))} placeholder="اتركه فارغًا للإنشاء التلقائي" />
                </div>
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={onClose}>إلغاء</Button>
                <Button onClick={handleSave}>حفظ الوحدة</Button>
            </DialogFooter>
        </DialogContent>
    );
};


const ComponentManagement = ({ components, onComponentsChange, allItems }: { 
    components: { itemId: string; quantity: number }[],
    onComponentsChange: (components: { itemId: string; quantity: number }[]) => void, 
    allItems: Item[] 
}) => {
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newComponent, setNewComponent] = useState({ itemId: '', quantity: 1, cost: 0 });
    
    const availableRawMaterials = useMemo(() => {
        return allItems
            .filter(i => i.itemType === 'raw_material')
            .map(i => ({ value: i.id!, label: `${i.name} (التكلفة: ${i.cost || 0})` }));
    }, [allItems]);
    
    const handleAddComponent = () => {
        if (!newComponent.itemId || newComponent.quantity <= 0) return;
        const alreadyAdded = components.some(c => c.itemId === newComponent.itemId);
        if (alreadyAdded) return;
        onComponentsChange([...components, { itemId: newComponent.itemId, quantity: newComponent.quantity }]);
        setNewComponent({ itemId: '', quantity: 1, cost: 0 });
        setIsAddDialogOpen(false);
    };

    const handleRemoveComponent = (itemId: string) => {
        onComponentsChange(components.filter(c => c.itemId !== itemId));
    };

    const handleQuantityChange = (itemId: string, qty: number) => {
        onComponentsChange(components.map(c => c.itemId === itemId ? { ...c, quantity: qty } : c));
    };

    const totalCalculatedCost = useMemo(() => {
        return components.reduce((sum, comp) => {
            const master = allItems.find(i => i.id === comp.itemId);
            return sum + (comp.quantity * (master?.cost || 0));
        }, 0);
    }, [components, allItems]);

    return (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
                <Label className="font-bold">مكونات الصنف (الخلطة / الوصفة)</Label>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" variant="outline"><PlusCircle className="ml-2 h-4 w-4"/>إضافة مادة خام</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>إضافة مكون جديد</DialogTitle>
                            <DialogDescription>اختر المادة الخام وحدد الكمية المستخدمة في هذا المنتج.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>المادة الخام</Label>
                                <Combobox 
                                    options={availableRawMaterials} 
                                    value={newComponent.itemId} 
                                    onValueChange={v => {
                                        const master = allItems.find(i => i.id === v);
                                        setNewComponent(p => ({ ...p, itemId: v, cost: master?.cost || 0 }));
                                    }} 
                                    placeholder="اختر مادة خام..." 
                                    emptyMessage="لا يوجد مواد خام."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>الكمية المستخدمة</Label>
                                    <Input type="number" value={newComponent.quantity} onChange={e => setNewComponent(p => ({ ...p, quantity: Number(e.target.value) }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label>سعر التكلفة الحالي</Label>
                                    <Input value={newComponent.cost} disabled className="bg-muted" />
                                </div>
                            </div>
                            <div className="p-3 bg-primary/5 rounded-md border border-primary/20 flex justify-between items-center">
                                <span className="text-sm">إجمالي تكلفة البند:</span>
                                <span className="font-bold">{(newComponent.quantity * newComponent.cost).toLocaleString()} ج.م</span>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setIsAddDialogOpen(false)}>إلغاء</Button>
                            <Button onClick={handleAddComponent} disabled={!newComponent.itemId || newComponent.quantity <= 0}>إضافة للبند</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="w-full overflow-auto border rounded-lg max-h-60 bg-background">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40%]">المادة الخام</TableHead>
                            <TableHead className="text-center">الكمية</TableHead>
                            <TableHead className="text-center">تكلفة الوحدة</TableHead>
                            <TableHead className="text-center">إجمالي التكلفة</TableHead>
                            <TableHead className="w-16"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {components.map(comp => {
                            const master = allItems.find(i => i.id === comp.itemId);
                            const unitCost = master?.cost || 0;
                            const lineTotal = comp.quantity * unitCost;
                            return (
                                <TableRow key={comp.itemId}>
                                    <TableCell className="font-medium">{master?.name}</TableCell>
                                    <TableCell className="w-24"><Input type="number" value={comp.quantity} onChange={e => handleQuantityChange(comp.itemId, Number(e.target.value))} className="text-center h-8"/></TableCell>
                                    <TableCell className="text-center text-muted-foreground">{unitCost.toLocaleString()}</TableCell>
                                    <TableCell className="text-center font-semibold">{lineTotal.toLocaleString()}</TableCell>
                                    <TableCell><Button variant="ghost" size="icon" onClick={() => handleRemoveComponent(comp.itemId)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                                </TableRow>
                            );
                        })}
                        {components.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">لا توجد مكونات مضافة بعد.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                    <TableFooter>
                        <TableRow>
                            <TableCell colSpan={3} className="font-bold">إجمالي تكلفة المكونات</TableCell>
                            <TableCell className="text-center font-bold text-primary">{totalCalculatedCost.toLocaleString()} ج.م</TableCell>
                            <TableCell></TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
        </div>
    );
}

function ItemForm({ item, onSave, onClose, itemSections, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2, allItems, settings, inventorySections, dbAction, getNextId, itemColors, itemSizes }: { 
    item?: Item, 
    onSave: (item: Omit<Item, 'id' | 'code'> & { id?: string, code?: string }) => Promise<void>,
    onClose: () => void, 
    itemSections: any[],
    itemCategories: any[],
    itemGroups: any[],
    itemSubCategories1: any[],
    itemSubCategories2: any[],
    allItems: Item[],
    itemColors: any[],
    itemSizes: any[],
    settings: any,
    inventorySections: any[],
    dbAction: (path: string, action: 'add' | 'update' | 'remove' | 'transaction', payload?: any) => Promise<string | void>;
    getNextId: (counterName: string, startFrom?: number) => Promise<number | null>;
}) {
  const [formData, setFormData] = useState<Item>(item || { name: "", price: 0, cost: 0, reorderPoint: 0, baseUnit: 'piece', itemType: 'standard' });
  const [isSecondaryUnitOpen, setIsSecondaryUnitOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Partial<SecondaryUnit> | null>(null);

  const [isQuickAddSectionOpen, setIsQuickAddSectionOpen] = useState(false);
  const [isQuickAddCategoryOpen, setIsQuickAddCategoryOpen] = useState(false);
  const [isQuickAddGroupOpen, setIsQuickAddGroupOpen] = useState(false);
  const [isQuickAddSubCategory1Open, setIsQuickAddSubCategory1Open] = useState(false);
  const [isQuickAddSubCategory2Open, setIsQuickAddSubCategory2Open] = useState(false);

  const { toast } = useToast();
  
    useEffect(() => {
        const { itemGroupId, categoryId, sectionId } = formData;
        
        if (itemGroupId && (!categoryId || !sectionId)) {
            const group = itemGroups.find(g => g.id === itemGroupId);
            if (group && group.parentCategoryId) {
                const category = itemCategories.find(c => c.id === group.parentCategoryId);
                if (category) {
                    const section = itemSections.find(s => s.id === category.sectionId);
                    setFormData(prev => ({
                        ...prev,
                        categoryId: category.id,
                        sectionId: section ? section.id : prev.sectionId,
                    }));
                }
            }
        } else if (categoryId && !sectionId) {
            const category = itemCategories.find(c => c.id === categoryId);
            if (category && category.sectionId) {
                setFormData(prev => ({
                    ...prev,
                    sectionId: category.sectionId,
                }));
            }
        }
    }, [formData.itemGroupId, formData.categoryId, formData.sectionId, itemSections, itemCategories, itemGroups]);

    // Auto-calculate cost for manufactured items
    useEffect(() => {
        if (formData.itemType === 'manufactured' && formData.components) {
            const totalCost = formData.components.reduce((sum, comp) => {
                const master = allItems.find(i => i.id === comp.itemId);
                return sum + (comp.quantity * (master?.cost || 0));
            }, 0);
            if (formData.cost !== totalCost) {
                setFormData(prev => ({ ...prev, cost: totalCost }));
            }
        }
    }, [formData.components, formData.itemType, allItems, formData.cost]);


  const sectionOptions = useMemo(() => itemSections.map(s => ({ value: s.id, label: s.name })), [itemSections]);
  const categoryOptions = useMemo(() => {
    if (!formData.sectionId) return [];
    const filtered = itemCategories.filter(c => c.sectionId === formData.sectionId);
    return filtered.map(c => ({ value: c.id, label: c.name }));
  }, [itemCategories, formData.sectionId]);

  const itemGroupOptions = useMemo(() => {
    if (!formData.categoryId) return [];
    const filtered = itemGroups.filter(g => g.parentCategoryId === formData.categoryId);
    return filtered.map((g: any) => ({ value: g.id, label: g.name }));
  }, [formData.categoryId, itemGroups]);
  const subCategory1Options = useMemo(() => itemSubCategories1.map(s => ({ value: s.id, label: s.name })), [itemSubCategories1]);
  const subCategory2Options = useMemo(() => itemSubCategories2.map(s => ({ value: s.id, label: s.name })), [itemSubCategories2]);
  
  const binOptions = useMemo(() => inventorySections.map(s => ({value: s.id, label: `${s.name} (${s.mainWarehouseName || 'N/A'})`})), [inventorySections]);

  const calculateEan13CheckDigit = (barcodeWithoutCheckDigit: string): string => {
    if (barcodeWithoutCheckDigit.length !== 12) return '0';
    let sumEven = 0, sumOdd = 0;
    barcodeWithoutCheckDigit.split('').forEach((char, index) => {
        const digit = parseInt(char, 10);
        if ((index + 1) % 2 === 0) { sumEven += digit; } 
        else { sumOdd += digit; }
    });
    const totalSum = sumOdd + (sumEven * 3);
    const remainder = totalSum % 10;
    const checkDigit = (remainder === 0) ? 0 : 10 - remainder;
    return String(checkDigit);
};


  const handleSaveSecondaryUnit = async (unit: SecondaryUnit) => {
    let unitWithBarcode = { ...unit };

    if (!unit.barcode) {
        const standardPrefix = settings?.main?.financial?.standardItemBarcodePrefix || '25';
        const nextId = await getNextId('standardItemCode', 1);
        if (nextId === null) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل إنشاء باركود تلقائي.' });
            return;
        }
        const uniquePart = String(nextId).padStart(10, '0');
        const baseCode = `${standardPrefix}${uniquePart}`;
        const checkDigit = calculateEan13CheckDigit(baseCode);
        unitWithBarcode.barcode = `${baseCode}${checkDigit}`;
    }

    setFormData(prev => {
        const existingUnits = prev.secondaryUnits || [];
        const existingIndex = existingUnits.findIndex(u => u.name === unitWithBarcode.name);
        if (existingIndex > -1) {
            const updatedUnits = [...existingUnits];
            updatedUnits[existingIndex] = unitWithBarcode;
            return { ...prev, secondaryUnits: updatedUnits };
        } else {
            return { ...prev, secondaryUnits: [...existingUnits, unitWithBarcode] };
        }
    });
    setEditingUnit(null);
  };
  
  const handleRemoveSecondaryUnit = (unitName: string) => {
      setFormData(prev => ({...prev, secondaryUnits: (prev.secondaryUnits || []).filter(u => u.name !== unitName) }));
  }

  const handleSubmit = () => {
    if (!formData.name) return toast({ variant: "destructive", title: "خطأ", description: "اسم الصنف مطلوب." });
    onSave(formData);
    onClose();
  };
  
  const handleQuickAdd = async (level: number, name: string) => {
    const dbPaths: Record<number, string> = { 1: "itemSections", 2: "itemCategories", 3: "itemGroups", 4: "itemSubCategories1", 5: "itemSubCategories2" };
    const path = dbPaths[level];
    if (!path) return;

    const parentIdKeys: Record<number, string> = { 2: 'sectionId', 3: 'parentCategoryId' };
    const parentPathValues: Record<number, string | undefined> = { 2: formData.sectionId, 3: formData.categoryId };
    
    const parentKey = parentIdKeys[level];
    const parentId = parentPathValues[level];

    const dataToAdd: any = { name };
    if (parentKey && parentId) {
        dataToAdd[parentKey] = parentId;
    }

    try {
        let newCodeData: { code?: string } = {};

        const calculateNextCodePart = (siblings: any[]) => {
            if(siblings.length === 0) return 1;
            const codes = siblings.map((i: any) => {
                const parts = String(i.code || '0').split('-');
                const lastPart = parts[parts.length - 1];
                const num = parseInt(lastPart || '0', 10);
                return isNaN(num) ? 0 : num;
            });
            return Math.max(...codes) + 1;
        };

        if (level === 1) { 
            const codes = itemSections.map(i => parseInt(i.code || '0', 10)).filter(n => !isNaN(n));
            const currentMax = (codes.length > 0 ? Math.max(...codes) : 0) + 1;
            
            const nextNum = await getNextId('itemSectionCode', currentMax);
            if (nextNum) newCodeData.code = String(nextNum).padStart(2, '0');
        } else if (level === 2 && formData.sectionId) { 
            const siblings = itemCategories.filter(c => c.sectionId === formData.sectionId);
            const currentMax = calculateNextCodePart(siblings);
            
            const parent = itemSections.find(s => s.id === formData.sectionId);
            const parentCode = parent?.code || '00';
            
            const nextNum = await getNextId(`itemCategoryCode_${formData.sectionId}`, currentMax);
            if (nextNum) newCodeData.code = `${parentCode}-${nextNum}`;
        } else if (level === 3 && formData.categoryId) { 
            const siblings = itemGroups.filter(g => g.parentCategoryId === formData.categoryId);
            const currentMax = calculateNextCodePart(siblings);
            
            const parent = itemCategories.find(c => c.id === formData.categoryId);
            const parentCode = parent?.code || '00-0';
            
            const nextNum = await getNextId(`itemGroupCode_${formData.categoryId}`, currentMax);
            if (nextNum) newCodeData.code = `${parentCode}-${nextNum}`;
        }
        
        const finalData = { ...dataToAdd, ...newCodeData };
        const newId = await dbAction(path, 'add', finalData);
        
        toast({ title: 'تمت الإضافة بنجاح', description: newCodeData.code ? `تم إنشاء الكود: ${newCodeData.code}` : undefined });
        
         if (level === 1) setFormData(prev => ({...prev, sectionId: newId as string}));
         if (level === 2) setFormData(prev => ({...prev, categoryId: newId as string}));
         if (level === 3) setFormData(prev => ({...prev, itemGroupId: newId as string}));
         if (level === 4) setFormData(prev => ({...prev, subCategoryId1: newId as string}));
         if (level === 5) setFormData(prev => ({...prev, subCategoryId2: newId as string}));
    } catch (e) {
        toast({ variant: 'destructive', title: 'فشل الحفظ'});
    }
};


  return (
    <div className="space-y-4 py-2 pb-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="item-name">اسم الصنف</Label>
          <Input id="item-name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="item-type">نوع الصنف</Label>
            <Select value={formData.itemType} onValueChange={(v: any) => setFormData({ ...formData, itemType: v })}>
              <SelectTrigger id="item-type"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">منتج عادي</SelectItem>
                <SelectItem value="raw_material">مادة خام</SelectItem>
                <SelectItem value="manufactured">منتج مصنع</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-code">الباركود</Label>
            <Input id="item-code" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="اتركه فارغاً للتلقائي" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-unit">الوحدة الأساسية</Label>
            <Select value={formData.baseUnit} onValueChange={(v: any) => setFormData({ ...formData, baseUnit: v })}>
              <SelectTrigger id="item-unit"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="piece">قطعة</SelectItem>
                <SelectItem value="kilo">كيلو</SelectItem>
                <SelectItem value="gram">جرام</SelectItem>
                <SelectItem value="meter">متر</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-rop">حد الطلب</Label>
            <Input id="item-rop" type="number" value={formData.reorderPoint} onChange={e => setFormData({ ...formData, reorderPoint: Number(e.target.value) })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="item-cost">سعر التكلفة</Label>
            <Input 
                id="item-cost" 
                type="number" 
                value={formData.cost} 
                onChange={e => setFormData({ ...formData, cost: Number(e.target.value) })} 
                disabled={formData.itemType === 'manufactured'}
                className={cn(formData.itemType === 'manufactured' && "bg-muted font-bold text-primary")}
            />
            {formData.itemType === 'manufactured' && <p className="text-[10px] text-muted-foreground">يتم احتسابه تلقائياً من المكونات.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-price">سعر البيع</Label>
            <Input id="item-price" type="number" value={formData.price} onChange={e => setFormData({ ...formData, price: Number(e.target.value) })} />
          </div>
        </div>
      </div>
      <div className="space-y-2 pt-4">
        <h4 className="font-medium text-sm">التصنيفات</h4>
        <Separator />
      </div>
      <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
        <div className="space-y-2">
            <Label>الفئة (م1)</Label>
            <div className="flex gap-2">
                <Combobox options={sectionOptions} value={formData.sectionId || ''} onValueChange={v => setFormData({ ...formData, sectionId: v, categoryId: '', itemGroupId: '' })} placeholder="اختر فئة..." emptyMessage="لا يوجد." className="flex-1"/>
                <Button variant="ghost" size="icon" onClick={() => setIsQuickAddSectionOpen(true)}><PlusCircle className="h-5 w-5"/></Button>
            </div>
        </div>
         <div className="space-y-2">
            <Label>القسم (م2)</Label>
             <div className="flex gap-2">
                <Combobox options={categoryOptions} value={formData.categoryId || ''} onValueChange={v => setFormData({ ...formData, categoryId: v, itemGroupId: '' })} placeholder="اختر قسماً..." emptyMessage="اختر فئة أولاً" disabled={!formData.sectionId} className="flex-1"/>
                <Button variant="ghost" size="icon" onClick={() => setIsQuickAddCategoryOpen(true)} disabled={!formData.sectionId}><PlusCircle className="h-5 w-5"/></Button>
            </div>
        </div>
         <div className="space-y-2">
            <Label>المجموعة (م3)</Label>
            <div className="flex gap-2">
                <Combobox options={itemGroupOptions} value={formData.itemGroupId || ''} onValueChange={v => setFormData({ ...formData, itemGroupId: v })} placeholder="اختر مجموعة..." emptyMessage="اختر قسماً أولاً" disabled={!formData.categoryId} className="flex-1"/>
                <Button variant="ghost" size="icon" onClick={() => setIsQuickAddGroupOpen(true)} disabled={!formData.categoryId}><PlusCircle className="h-5 w-5"/></Button>
            </div>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="space-y-2">
                <Label>مجموعة فرعية 1</Label>
                <div className="flex gap-2">
                    <Combobox options={subCategory1Options} value={formData.subCategoryId1 || ''} onValueChange={v => setFormData({ ...formData, subCategoryId1: v })} placeholder="اختر..." emptyMessage="لا يوجد." className="flex-1"/>
                    <Button variant="ghost" size="icon" onClick={() => setIsQuickAddSubCategory1Open(true)}><PlusCircle className="h-5 w-5"/></Button>
                </div>
            </div>
            <div className="space-y-2">
                <Label>مجموعة فرعية 2</Label>
                 <div className="flex gap-2">
                    <Combobox options={subCategory2Options} value={formData.subCategoryId2 || ''} onValueChange={v => setFormData({ ...formData, subCategoryId2: v })} placeholder="اختر..." emptyMessage="لا يوجد." className="flex-1"/>
                    <Button variant="ghost" size="icon" onClick={() => setIsQuickAddSubCategory2Open(true)}><PlusCircle className="h-5 w-5"/></Button>
                </div>
            </div>
        </div>
      </div>
      <div className="space-y-2 pt-4">
        <h4 className="font-medium text-sm">إعدادات متقدمة</h4>
        <Separator />
      </div>
      <div className="space-y-6 p-4 border rounded-lg bg-muted/50">
        {formData.itemType === 'manufactured' && (
            <ComponentManagement 
                components={formData.components || []} 
                onComponentsChange={(newComponents) => setFormData(prev => ({ ...prev, components: newComponents }))} 
                allItems={allItems} 
            />
        )}
        <div className="space-y-2">
              <Label>الوحدات الثانوية</Label>
              <div className="border rounded-md p-4">
                <Table>
                    <TableHeader><TableRow><TableHead>اسم الوحدة</TableHead><TableHead>معامل التحويل</TableHead><TableHead>سعر البيع</TableHead><TableHead>باركود</TableHead><TableHead></TableHead></TableRow></TableHeader>
                    <TableBody>
                        {(formData.secondaryUnits || []).map(unit => (
                            <TableRow key={unit.name}>
                                <TableCell>{unit.name}</TableCell>
                                <TableCell>{unit.conversionFactor}x {formData.baseUnit}</TableCell>
                                <TableCell>{unit.price}</TableCell>
                                <TableCell>{unit.barcode}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => { setEditingUnit(unit); setIsSecondaryUnitOpen(true); }}><Edit className="h-4 w-4"/></Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveSecondaryUnit(unit.name)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => { setEditingUnit({name: '', conversionFactor: 0, price: 0, barcode: ''}); setIsSecondaryUnitOpen(true); }}><PlusCircle className="ml-2 h-4 w-4"/> إضافة وحدة</Button>
                {isSecondaryUnitOpen && (
                    <SecondaryUnitDialog
                        unit={editingUnit!}
                        onSave={handleSaveSecondaryUnit}
                        onClose={() => setIsSecondaryUnitOpen(false)}
                    />
                )}
              </div>
        </div>
        <div className="space-y-2">
              <Label>القسم الافتراضي للتسكين (للمخازن الرئيسية)</Label>
              <Combobox options={binOptions} value={formData.defaultBinId || ''} onValueChange={v => setFormData({ ...formData, defaultBinId: v })} placeholder="اختر قسمًا..." emptyMessage="لا توجد أقسام معرفة."/>
        </div>
      </div>
        <QuickAddDialog open={isQuickAddSectionOpen} onOpenChange={setIsQuickAddSectionOpen} onConfirm={(name) => handleQuickAdd(1, name)} title="إضافة فئة جديدة" label="اسم فئة (م1)" />
        <QuickAddDialog open={isQuickAddCategoryOpen} onOpenChange={setIsQuickAddCategoryOpen} onConfirm={(name) => handleQuickAdd(2, name)} title="إضافة قسم جديد" label="اسم قسم (م2)" />
        <QuickAddDialog open={isQuickAddGroupOpen} onOpenChange={setIsQuickAddGroupOpen} onConfirm={(name) => handleQuickAdd(3, name)} title="إضافة مجموعة جديدة" label="اسم مجموعة (م3)" />
        <QuickAddDialog open={isQuickAddSubCategory1Open} onOpenChange={setIsQuickAddSubCategory1Open} onConfirm={(name) => handleQuickAdd(4, name)} title="إضافة مجموعة فرعية 1" label="اسم المجموعة" />
        <QuickAddDialog open={isQuickAddSubCategory2Open} onOpenChange={setIsQuickAddSubCategory2Open} onConfirm={(name) => handleQuickAdd(5, name)} title="إضافة مجموعة فرعية 2" label="اسم المجموعة" />

      <div className="flex justify-end pt-4">
        <Button onClick={handleSubmit}>حفظ الصنف</Button>
      </div>
    </div>
  );
}

const UNIT_LABELS: Record<string, string> = {
  piece: 'قطعة',
  kilo: 'كيلو',
  gram: 'جرام',
  meter: 'متر',
  weight: 'وزن'
};

export default function ItemsPage() {
    const { allItems, dbAction, loading: dataLoading, itemSections, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2, itemColors, itemSizes, settings, inventorySections, getNextId, barcodeDesigns } = useData();
    const { toast } = useToast();
    const { can } = usePermissions();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [isPriceUpdateOpen, setIsPriceUpdateOpen] = useState(false);
    const [isBulkCategoryOpen, setIsBulkCategoryOpen] = useState(false);
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [isMatrixOpen, setIsMatrixOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
    const router = useRouter();

    const [filters, setFilters] = useState({
        sectionId: '',
        categoryId: '',
        itemGroupId: '',
        subCategoryId1: '',
        subCategoryId2: '',
        hideZeroStock: true,
    });
    
     const handleUpdatePrices = async (action: "increase" | "decrease", percentage: number) => {
        if (selectedItems.length === 0 || percentage <= 0) return;
        const multiplier = action === 'increase' ? 1 + (percentage / 100) : 1 - (percentage / 100);
    
        try {
            for (const itemId of selectedItems) {
                const item = allItems.find((i: any) => i.id === itemId);
                if (item) {
                    const oldPrice = item.price || 0;
                    const newPrice = oldPrice * multiplier;
    
                    if (newPrice !== oldPrice) {
                         await dbAction('items', 'update', { id: itemId, data: { price: newPrice } });
                         await dbAction('priceChangeLogs', 'add', {
                            itemId: itemId,
                            itemName: item.name,
                            timestamp: new Date().toISOString(),
                            oldPrice: oldPrice,
                            newPrice: newPrice,
                            oldCost: item.cost || 0,
                            newCost: item.cost || 0, 
                            source: 'Bulk Price Update'
                        });
                    }
                }
            }
            toast({ title: "تم التحديث", description: `تم تحديث أسعار ${selectedItems.length} صنف.` });
            setSelectedItems([]);
        } catch (error) {
             toast({ variant: "destructive", title: "خطأ", description: "فشل تحديث الأسعار." });
        }
    };

    const handleBulkCategoryUpdate = async (options: {
        mode: 'all' | 'only_empty';
        sectionId?: string;
        categoryId?: string;
        itemGroupId?: string;
        subCategoryId1?: string;
        subCategoryId2?: string;
    }) => {
        if (selectedItems.length === 0) return;
        setIsBulkUpdating(true);
        let updatedCount = 0;

        try {
            for (const itemId of selectedItems) {
                const item = allItems.find((i: any) => i.id === itemId);
                if (!item) continue;

                const dataToUpdate: any = {};

                const applyField = (field: string, val?: string) => {
                    if (!val || val === '__NO_CHANGE__') return;
                    if (options.mode === 'only_empty') {
                        // تسكين الشواغر فقط: نعدل فقط إن كان الحقل فارغاً
                        if (!item[field]) {
                            dataToUpdate[field] = val === '__CLEAR__' ? null : val;
                        }
                    } else {
                        // تحويل ونقل إجباري لكافة الأصناف المحددة
                        dataToUpdate[field] = val === '__CLEAR__' ? null : val;
                    }
                };

                applyField('sectionId', options.sectionId);
                applyField('categoryId', options.categoryId);
                applyField('itemGroupId', options.itemGroupId);
                applyField('subCategoryId1', options.subCategoryId1);
                applyField('subCategoryId2', options.subCategoryId2);

                if (Object.keys(dataToUpdate).length > 0) {
                    await dbAction('items', 'update', { id: itemId, data: dataToUpdate });
                    updatedCount++;
                }
            }

            toast({
                title: "اكتمل التعديل الجماعي بنجاح",
                description: `تم تحديث التصنيفات لـ ${updatedCount} من أصل ${selectedItems.length} صنف محدد.`
            });
            setIsBulkCategoryOpen(false);
            setSelectedItems([]);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "خطأ أثناء التعديل الجماعي",
                description: error.message || "فشلت عملية التعديل الجماعي للأصناف."
            });
        } finally {
            setIsBulkUpdating(false);
        }
    };

    const handleFilterChange = (key: keyof typeof filters, value: string | boolean) => {
        const newFilters = { ...filters, [key]: value };
        if (key === 'sectionId') {
            newFilters.categoryId = 'all';
            newFilters.itemGroupId = 'all';
        }
        if (key === 'categoryId') {
            newFilters.itemGroupId = 'all';
        }
        setFilters(newFilters);
    };

    const sectionOptions = useMemo(() => [{ value: 'all', label: 'كل الفئات' }, ...itemSections.map((s: any) => ({ value: s.id, label: s.name }))], [itemSections]);
    const categoryOptions = useMemo(() => [{ value: 'all', label: 'كل الأقسام' }, ...itemCategories.filter((c: any) => filters.sectionId === 'all' || !filters.sectionId || c.sectionId === filters.sectionId).map((c: any) => ({ value: c.id, label: c.name }))], [itemCategories, filters.sectionId]);
    const groupOptions = useMemo(() => [{ value: 'all', label: 'كل المجموعات' }, ...itemGroups.filter((g: any) => filters.categoryId === 'all' || !filters.categoryId || g.parentCategoryId === filters.categoryId).map((g: any) => ({ value: g.id, label: g.name }))], [itemGroups, filters.categoryId]);
    const subCategory1Options = useMemo(() => [{ value: 'all', label: 'الكل' }, ...itemSubCategories1.map((s: any) => ({ value: s.id, label: s.name }))], [itemSubCategories1]);
    const subCategory2Options = useMemo(() => [{ value: 'all', label: 'الكل' }, ...itemSubCategories2.map((s: any) => ({ value: s.id, label: s.name }))], [itemSubCategories2]);

    const moduleName = "inventory_items_list";

    const handleSave = async (itemData: Omit<Item, 'id' | 'code'> & { id?: string, code?: string }) => {
        const { id, ...dataToSave } = itemData;
        
        const cleanData: any = {};
        const allowedFields = [
            'code', 'name', 'baseUnit', 'price', 'cost', 'reorderPoint', 
            'barcodeType', 'sectionId', 'categoryId', 'itemGroupId', 
            'subCategoryId1', 'subCategoryId2', 'isDisabled', 'itemType', 
            'components', 'color', 'size', 'defaultBinId', 'secondaryUnits'
        ];
        
        allowedFields.forEach(field => {
            if (dataToSave.hasOwnProperty(field)) {
                cleanData[field] = (dataToSave as any)[field];
            }
        });

        try {
            if (id) {
                if (!can("edit", moduleName)) {
                    toast({ variant: "destructive", title: "غير مصرح به" });
                    return;
                }
                await dbAction('items', 'update', { id, data: cleanData });
                toast({ title: "تم تحديث الصنف بنجاح" });
            } else {
                 if (!can("add", moduleName)) {
                     toast({ variant: "destructive", title: "غير مصرح به" });
                     return;
                 }

                 let codeToSave = cleanData.code ? String(cleanData.code) : null;
                 if (!codeToSave) {
                        const { itemType, barcodeType } = cleanData;
                        if (itemType === 'raw_material') {
                            const nextId = await getNextId('rawMaterialCode', 1000);
                            codeToSave = `RAW-${nextId}`;
                        } else if (barcodeType === 'ean13_clothing') {
                           toast({ variant: 'destructive', title: 'خطأ', description: 'يرجى استخدام مولد مصفوفة الأصناف للملابس لضمان إنشاء باركود صحيح.' });
                           return;
                        } else if (barcodeType === 'ean13_scale') {
                             toast({ variant: 'destructive', title: 'خطأ', description: 'يجب إدخال كود من 5 أرقام لأصناف الميزان.' });
                             return;
                        } else {
                            const standardPrefix = settings?.main?.financial?.standardItemBarcodePrefix || '25';
                            const nextId = await getNextId('standardItemCode', 1);
                            if (nextId === null) throw new Error("Failed to get next ID for standard item");
                            const uniquePart = String(nextId).padStart(10, '0');
                            const baseCode = `${standardPrefix}${uniquePart}`;
                            const checkDigit = '0'; 
                            codeToSave = `${baseCode}${checkDigit}`;
                        }
                    }
                await dbAction('items', 'add', { ...cleanData, code: codeToSave });
                toast({ title: "تمت إضافة الصنف بنجاح" });
            }
        } catch(e) {
             toast({ variant: "destructive", title: "خطأ في الحفظ", description: "فشل حفظ بيانات الصنف." });
        }
    };
    
    const handleSaveMatrix = async (itemsToCreate: any[]) => {
        setIsMatrixOpen(false);
        for (const itemData of itemsToCreate) {
             await handleSave(itemData);
        }
        toast({title: "اكتمل الإنشاء", description: `تم إنشاء ${itemsToCreate.length} صنف بنجاح.`});
    };


  const handleDelete = async (itemId: string) => {
    try {
      await dbAction('items', 'update', { id: itemId, data: { isDisabled: true } });
      toast({ title: "تم الحذف", description: "تم نقل الصنف إلى سلة المحذوفات." });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف الصنف." });
    }
  };
  
   const handleDeleteSelected = async () => {
        if (selectedItems.length === 0) return;
        try {
            for (const itemId of selectedItems) {
                await dbAction('items', 'update', { id: itemId, data: { isDisabled: true } });
            }
            toast({ title: "تم الحذف", description: `تم حذف ${selectedItems.length} صنف.` });
            setSelectedItems([]);
        } catch (error) {
             toast({ variant: "destructive", title: "خطأ", description: "فشل حذف الأصناف المحددة." });
        }
    };
  
  const filteredItems = useMemo(() => {
    if(!allItems) return [];
    
    const activeItems = allItems.filter((item: any) => !item.isDisabled);
    
    let itemsToFilter = activeItems;

    const filterFunctions: ((item: any) => boolean)[] = [];

    if (searchTerm) {
        filterFunctions.push(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.code && item.code.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }
    if (filters.sectionId && filters.sectionId !== 'all') {
        filterFunctions.push(item => item.sectionId === filters.sectionId);
    }
    if (filters.categoryId && filters.categoryId !== 'all') {
        filterFunctions.push(item => item.categoryId === filters.categoryId);
    }
    if (filters.itemGroupId && filters.itemGroupId !== 'all') {
        filterFunctions.push(item => item.itemGroupId === filters.itemGroupId);
    }
     if (filters.subCategoryId1 && filters.subCategoryId1 !== 'all') {
        filterFunctions.push(item => item.subCategoryId1 === filters.subCategoryId1);
    }
    if (filters.subCategoryId2 && filters.subCategoryId2 !== 'all') {
        filterFunctions.push(item => item.subCategoryId2 === filters.subCategoryId2);
    }

    return itemsToFilter.filter(item => filterFunctions.every(fn => fn(item)));
        
  }, [allItems, searchTerm, filters]);
  
  const handleSelectAll = (checked: boolean) => {
    setSelectedItems(checked ? filteredItems.map((item: any) => item.id) : []);
  };
  
  const handleSelectOne = (itemId: string, checked: boolean) => {
      setSelectedItems(prev => checked ? [...prev, itemId] : prev.filter(id => id !== itemId));
  }

  return (
    <>
      <PageHeader title="بطاقة الأصناف">
        <div className="flex items-center gap-2">
           {settings?.main?.general?.isClothingStore && (
            <Dialog open={isMatrixOpen} onOpenChange={setIsMatrixOpen}>
              <DialogTrigger asChild>
                 <Button variant="outline">انشاء اكثر من صنف</Button>
              </DialogTrigger>
              <MatrixGeneratorDialog onSave={handleSaveMatrix} onOpenChange={setIsMatrixOpen} {...{itemSections, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2, allItems, settings, getNextId}} />
            </Dialog>
           )}
           {can("add", moduleName) && (
             <AddEntityDialog
                title="إضافة صنف جديد"
                description="أدخل بيانات الصنف الأساسية والتصنيفات."
                triggerButton={
                    <Button size="sm" className="gap-1">
                    <PlusCircle className="h-4 w-4" />
                    إضافة صنف
                    </Button>
                }>
              {({ onClose }) => <ItemForm onSave={handleSave} onClose={onClose} itemSections={itemSections} itemCategories={itemCategories} itemGroups={itemGroups} itemSubCategories1={itemSubCategories1} itemSubCategories2={itemSubCategories2} allItems={allItems} itemColors={itemColors} itemSizes={itemSizes} settings={settings} inventorySections={inventorySections} dbAction={dbAction} getNextId={getNextId} />}
            </AddEntityDialog>
           )}
        </div>
      </PageHeader>

      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
            <CardHeader>
                <CardTitle>فلترة الأصناف</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 items-end">
                    <div className="space-y-2 col-span-2">
                        <Label>بحث بالاسم أو الباركود</Label>
                        <Input placeholder="ابحث..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <div className="space-y-2"><Label>الفئة (م1)</Label><Combobox options={sectionOptions} value={filters.sectionId} onValueChange={(v) => handleFilterChange('sectionId', v)} placeholder="الكل" emptyMessage="لا يوجد"/></div>
                    <div className="space-y-2"><Label>القسم (م2)</Label><Combobox options={categoryOptions} value={filters.categoryId} onValueChange={(v) => handleFilterChange('categoryId', v)} placeholder="الكل" emptyMessage="اختر فئة أولاً" disabled={!filters.sectionId || filters.sectionId === 'all'}/></div>
                    <div className="space-y-2"><Label>المجموعة (م3)</Label><Combobox options={groupOptions} value={filters.itemGroupId} onValueChange={(v) => handleFilterChange('itemGroupId', v)} placeholder="الكل" emptyMessage="اختر قسماً أولاً" disabled={!filters.categoryId || filters.categoryId === 'all'}/></div>
                    <div className="space-y-2"><Label>م. فرعية 1</Label><Combobox options={subCategory1Options} value={filters.subCategoryId1} onValueChange={(v) => handleFilterChange('subCategoryId1', v)} placeholder="الكل" emptyMessage="لا يوجد."/></div>
                    <div className="space-y-2"><Label>م. فرعية 2</Label><Combobox options={subCategory2Options} value={filters.subCategoryId2} onValueChange={(v) => handleFilterChange('subCategoryId2', v)} placeholder="الكل" emptyMessage="لا يوجد."/></div>
                </div>
                 <div className="flex items-center space-x-2 rtl:space-x-reverse pt-4">
                    <Checkbox id="hide-zero-stock" checked={filters.hideZeroStock} onCheckedChange={(checked) => handleFilterChange('hideZeroStock', !!checked)} />
                    <Label htmlFor="hide-zero-stock">عرض الأصناف التي لها رصيد فقط</Label>
                </div>
            </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>قائمة الأصناف</CardTitle>
            <CardDescription>
                عرض وتعديل جميع الأصناف في النظام.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* الشريط العلوي للإجراءات الجماعية عند تحديد الأصناف */}
            {selectedItems.length > 0 && (
                <div className="p-3 bg-muted/90 border border-primary/40 rounded-xl flex items-center justify-between gap-3 mb-4 sticky top-0 z-30 backdrop-blur-md shadow-md animate-in fade-in-50">
                    <div className="flex items-center gap-2.5">
                        <Badge className="bg-primary text-primary-foreground font-bold px-3 py-1 text-sm shadow-sm gap-1.5">
                            <Layers className="h-4 w-4" />
                            تم تحديد {selectedItems.length} صنف
                        </Badge>
                        <span className="text-xs text-muted-foreground hidden md:inline font-medium">
                            يمكنك تطبيق إجراء جماعي على الأصناف المحددة مباشرة
                        </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button 
                            variant="default" 
                            size="sm" 
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-1.5 shadow"
                            onClick={() => setIsBulkCategoryOpen(true)}
                        >
                            <Layers className="h-4 w-4 ml-1" />
                            تعديل الأقسام والفئات (إجراء جماعي)
                        </Button>
                        <Dialog open={isPriceUpdateOpen} onOpenChange={setIsPriceUpdateOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="font-bold gap-1.5 shadow-sm bg-background">
                                    <TrendingUp className="h-4 w-4 ml-1 text-emerald-600" />
                                    تعديل الأسعار
                                </Button>
                            </DialogTrigger>
                            <PriceUpdateDialog items={selectedItems.map(id => allItems.find((i:any) => i.id === id))} onSave={handleUpdatePrices} onOpenChange={setIsPriceUpdateOpen} />
                        </Dialog>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" className="font-bold gap-1.5 shadow-sm">
                                    <Trash2 className="h-4 w-4 ml-1" />
                                    حذف المحدد
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>هل أنت متأكد من حذف الأصناف المحددة؟</AlertDialogTitle>
                                    <AlertDialogDescription>سيتم نقل {selectedItems.length} صنف إلى سلة المحذوفات ويمكن استرجاعها لاحقاً.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteSelected}>نعم، قم بالحذف</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            )}

            {dataLoading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg max-h-[calc(100vh-320px)] relative">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-background/95 backdrop-blur-md shadow-sm border-b">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-12 bg-muted/95 font-bold sticky top-0 py-3 z-20"><Checkbox onCheckedChange={handleSelectAll} checked={selectedItems.length > 0 && selectedItems.length === filteredItems.length} /></TableHead>
                      <TableHead className="bg-muted/95 font-bold sticky top-0 py-3 z-20">الباركود</TableHead>
                      <TableHead className="bg-muted/95 font-bold sticky top-0 py-3 z-20">اسم الصنف</TableHead>
                      <TableHead className="bg-muted/95 font-bold sticky top-0 py-3 z-20">الوحدة</TableHead>
                      <TableHead className="hidden md:table-cell bg-muted/95 font-bold sticky top-0 py-3 z-20">التكلفة</TableHead>
                      <TableHead className="hidden md:table-cell bg-muted/95 font-bold sticky top-0 py-3 z-20">السعر</TableHead>
                      <TableHead className="text-center w-[100px] bg-muted/95 font-bold sticky top-0 py-3 z-20">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item: any) => {
                      return (
                        <TableRow key={item.id}>
                        <TableCell><Checkbox onCheckedChange={(checked) => handleSelectOne(item.id, !!checked)} checked={selectedItems.includes(item.id)} /></TableCell>
                        <TableCell className="font-mono text-xs">{item.code || "-"}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <span className="font-semibold text-xs">
                              {UNIT_LABELS[item.baseUnit] || item.baseUnit || 'قطعة'}
                            </span>
                            {item.secondaryUnits && item.secondaryUnits.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {item.secondaryUnits.map((u: any, idx: number) => (
                                  <Badge key={idx} variant="outline" className="text-[10px] px-1 py-0 bg-muted/60 border-primary/30 text-primary font-normal">
                                    {u.name} (x{u.conversionFactor})
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{item.cost?.toLocaleString() || "-"}</TableCell>
                        <TableCell className="hidden md:table-cell">{item.price?.toLocaleString() || "-"}</TableCell>
                        <TableCell className="text-center">
                          <AlertDialog>
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button aria-haspopup="true" size="icon" variant="ghost">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                {can("edit", moduleName) && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingItem(item);
                                      setTimeout(() => setIsEditOpen(true), 150);
                                    }}
                                  >
                                    <Edit className="ml-2 h-4 w-4" /> تعديل
                                  </DropdownMenuItem>
                                )}
                                 <BarcodePrintDialog item={item} barcodeDesigns={barcodeDesigns} trigger={
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                        <QrCode className="ml-2 h-4 w-4" /> طباعة باركود
                                    </DropdownMenuItem>
                                } />
                                <DropdownMenuItem onClick={() => router.push(`/reports/item-ledger?itemId=${item.id}`)}>
                                    <History className="ml-2 h-4 w-4" /> كارت الصنف
                                </DropdownMenuItem>
                                {can("delete", moduleName) && (
                                    <>
                                     <DropdownMenuSeparator />
                                      <AlertDialogTrigger asChild>
                                        <DropdownMenuItem
                                          className="text-destructive"
                                          onSelect={(e) => e.preventDefault()}
                                        >
                                          <Trash2 className="ml-2 h-4 w-4" /> حذف
                                        </DropdownMenuItem>
                                      </AlertDialogTrigger>
                                    </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                                    <AlertDialogDescription>سيتم نقل هذا الصنف إلى سلة المحذوفات ويمكن استرجاعه لاحقاً.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(item.id!)}>متابعة</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <BulkCategoryUpdateDialog
          items={selectedItems.map(id => allItems.find((i: any) => i.id === id)).filter(Boolean)}
          itemSections={itemSections}
          itemCategories={itemCategories}
          itemGroups={itemGroups}
          itemSubCategories1={itemSubCategories1}
          itemSubCategories2={itemSubCategories2}
          isOpen={isBulkCategoryOpen}
          onOpenChange={setIsBulkCategoryOpen}
          onSave={handleBulkCategoryUpdate}
          isSaving={isBulkUpdating}
          dbAction={dbAction}
          getNextId={getNextId}
      />

      <Dialog open={isEditOpen} onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) setEditingItem(null);
      }}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                  <DialogTitle>تعديل صنف</DialogTitle>
                  <DialogDescription>قم بتحديث تفاصيل الصنف هنا.</DialogDescription>
              </DialogHeader>
              {editingItem && (
                  <ItemForm 
                      item={editingItem} 
                      onSave={handleSave} 
                      onClose={() => setIsEditOpen(false)} 
                      itemSections={itemSections} 
                      itemCategories={itemCategories} 
                      itemGroups={itemGroups} 
                      itemSubCategories1={itemSubCategories1} 
                      itemSubCategories2={itemSubCategories2} 
                      allItems={allItems} 
                      itemColors={itemColors} 
                      itemSizes={itemSizes} 
                      settings={settings} 
                      inventorySections={inventorySections} 
                      dbAction={dbAction} 
                      getNextId={getNextId} 
                  />
              )}
          </DialogContent>
      </Dialog>
    </>
  );
}
