
"use client";

import React, { useState, useMemo, useEffect } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useData } from "@/contexts/data-provider";
import { Loader2, PlusCircle, LayoutGrid, Edit, Trash2, MoreHorizontal, Eye, ArrowLeft, Package, Boxes, Warehouse as WarehouseIcon, Coins, Tag, Search, AlertTriangle, Archive } from "lucide-react";
import { AddEntityDialog } from "@/components/add-entity-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent as UIDialogContent, DialogHeader as UIDialogHeader, DialogTitle as UIDialogTitle, DialogTrigger, DialogClose, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Link from 'next/link';
import { useAuth } from "@/contexts/auth-context";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";

// Interfaces
interface MainWarehouse {
  id?: string;
  name: string;
  isMain: boolean;
  address?: string;
  code?: string;
  branchId?: string; // Linked to a Branch (warehouse with isMain: false)
}

interface InternalDivision {
  id?: string;
  name: string;
  mainWarehouseId: string;
  capacity?: number;
  allowOverfill?: boolean; // New property
}

interface SectionStockItem {
    itemId: string;
    balance: number; // Changed from quantity to balance for consistency
}

interface Item {
    id: string;
    name: string;
    code?: string;
    cost?: number; // Ensure item has cost
}

const SectionContentsDialog = ({ division, items, inventory }: { division: any | null; items: Item[]; inventory: any[] }) => {
    if (!division) return null;

    const itemsInSection = useMemo(() => {
        const sectionInventory = inventory.find((inv: any) => inv.id === `${division.mainWarehouseId}-${division.id}`);
        if (!sectionInventory || !sectionInventory.items) return [];

        return Object.entries(sectionInventory.items)
            .map(([itemId, stockData]: [string, any]) => {
                const itemDetails = items.find(i => i.id === itemId);
                return {
                    name: itemDetails?.name || 'صنف غير معروف',
                    code: itemDetails?.code || 'N/A',
                    quantity: stockData.balance || 0,
                };
            })
            .filter(item => item.quantity > 0);
    }, [division, items, inventory]);

    return (
        <UIDialogContent>
            <UIDialogHeader>
                <UIDialogTitle>محتويات القسم: {division.name}</UIDialogTitle>
            </UIDialogHeader>
            <div className="max-h-96 overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>الصنف</TableHead>
                            <TableHead>الباركود</TableHead>
                            <TableHead className="text-center">الكمية</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {itemsInSection.length > 0 ? (
                            itemsInSection.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell>{item.code}</TableCell>
                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground p-6">
                                    هذا القسم فارغ حاليًا.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </UIDialogContent>
    );
};


// MainWarehouse Form
const MainWarehouseForm = ({ onSave, onClose, mainWarehouse, allWarehouses, branches }: { onSave: (data: Partial<MainWarehouse>) => void, onClose: () => void, mainWarehouse?: MainWarehouse, allWarehouses: MainWarehouse[], branches: any[] }) => {
    const [formData, setFormData] = useState<Partial<MainWarehouse>>(mainWarehouse || { name: '', isMain: true, address: '', code: '', branchId: '' });
    const { toast } = useToast();

    const branchOptions = useMemo(() => branches.map(b => ({ value: b.id, label: b.name })), [branches]);

    const handleSubmit = () => {
        if (!formData.name || !formData.code || !formData.branchId) {
            toast({ variant: 'destructive', title: 'بيانات ناقصة', description: 'يرجى إدخال اسم وكود المخزن واختيار الفرع التابع له.' });
            return;
        }

        const isCodeDuplicate = allWarehouses.some(
            w => w.code === formData.code && w.id !== formData.id
        );

        if (isCodeDuplicate) {
             toast({ variant: 'destructive', title: 'كود مكرر', description: 'هذا الكود مستخدم بالفعل في فرع أو مخزن رئيسي آخر.' });
            return;
        }

        onSave(formData);
        onClose();
    };

    return (
        <div className="space-y-4">
             <div className="space-y-2">
                <Label htmlFor="branch-select">الفرع التابع له</Label>
                <Combobox
                  options={branchOptions}
                  value={formData.branchId || ""}
                  onValueChange={(v) => setFormData(p => ({ ...p, branchId: v }))}
                  placeholder="اختر الفرع..."
                  emptyMessage="لا يوجد فروع."
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="warehouse-name">اسم المخزن الرئيسي</Label>
                <Input id="warehouse-name" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} />
            </div>
             <div className="space-y-2">
                <Label htmlFor="warehouse-code">كود المخزن</Label>
                <Input id="warehouse-code" value={formData.code} onChange={(e) => setFormData(p => ({ ...p, code: e.target.value }))} />
            </div>
             <div className="space-y-2">
                <Label htmlFor="warehouse-address">العنوان</Label>
                <Input id="warehouse-address" value={formData.address} onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="flex justify-end">
                <Button onClick={handleSubmit}>حفظ المخزن الرئيسي</Button>
            </div>
        </div>
    );
};

// InternalDivision Form
const InternalDivisionForm = ({ onSave, onClose, mainWarehouseId, division }: { onSave: (data: Partial<InternalDivision>) => void, onClose: () => void, mainWarehouseId: string, division?: InternalDivision }) => {
    const [formData, setFormData] = useState<Partial<InternalDivision>>(division || { name: '', capacity: 100, allowOverfill: false });
    const { toast } = useToast();

    const handleSubmit = () => {
        if (!formData.name) {
             toast({ variant: 'destructive', title: 'بيانات ناقصة', description: 'يرجى إدخال اسم القسم.' });
            return;
        }
        onSave({ ...formData, mainWarehouseId: mainWarehouseId, capacity: Number(formData.capacity) || 0 });
        onClose();
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="division-name">اسم القسم الداخلي / الحاوية</Label>
                <Input id="division-name" value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="division-capacity">الطاقة الاستيعابية (وحدة)</Label>
                <Input id="division-capacity" type="number" value={formData.capacity} onChange={(e) => setFormData(p => ({...p, capacity: Number(e.target.value)}))} />
            </div>
            <div className="flex items-center space-x-2 rtl:space-x-reverse pt-2">
                <Checkbox id="allowOverfill" checked={formData.allowOverfill} onCheckedChange={(checked) => setFormData(p => ({...p, allowOverfill: !!checked}))} />
                <Label htmlFor="allowOverfill" className="cursor-pointer">السماح بتجاوز السعة الاستيعابية</Label>
            </div>
            <div className="flex justify-end">
                <Button onClick={handleSubmit}>حفظ القسم</Button>
            </div>
        </div>
    );
};

// Main Component
export default function MainWarehousesPage() {
  const { warehouses, inventorySections, inventory, items, licenses, dbAction, loading } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [selectedDivisionForView, setSelectedDivisionForView] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const branches = useMemo(() => {
    const b = warehouses.filter((w: any) => !w.isMain && !w.isRepWarehouse && !w.repId) || [];
    if (user?.warehouseIds?.includes('all')) return b;
    return b.filter((w: any) => user?.warehouseIds?.includes(w.id));
  }, [warehouses, user]);

  const mainWarehouses = useMemo(() => {
    const main = warehouses.filter((w: any) => w.isMain) || [];
    
    // Filter by User Authorized Branches first
    let filtered = main;
    if (!user?.warehouseIds?.includes('all')) {
        filtered = main.filter((w: any) => user?.warehouseIds?.includes(w.id));
    }

    // Then filter by Branch Filter if selected
    if (branchFilter !== 'all') {
        filtered = filtered.filter((w: any) => w.branchId === branchFilter);
    }

    return filtered;
  }, [warehouses, user, branchFilter]);

  const handleSaveMainWarehouse = async (data: Partial<MainWarehouse>) => {
    try {
      if (data.id) {
        await dbAction('warehouses', 'update', { id: data.id, data: { name: data.name, code: data.code, address: data.address, branchId: data.branchId } });
        toast({ title: 'تم تحديث المخزن الرئيسي بنجاح' });
      } else {
        const newWarehouseId = await dbAction('warehouses', 'add', { ...data, isMain: true });
        if (newWarehouseId && user) {
            const licenseKey = user.themeSettings?.licenseKey;
            const license = licenses.find((l: any) => l.key === licenseKey);
            
            if (license && license.assignedWarehouseIds && !license.assignedWarehouseIds.includes('all')) {
                const updatedWarehouses = [...license.assignedWarehouseIds, newWarehouseId];
                await dbAction('licenses', 'update', { id: license.id, data: { assignedWarehouseIds: updatedWarehouses } });
                
                const updatedUserWarehouses = [...(user.warehouseIds || []), newWarehouseId];
                 await dbAction('users', 'update', { id: user.id, data: { warehouseIds: updatedUserWarehouses } });

                toast({ title: 'تمت الإضافة', description: 'تمت إضافة المخزن الرئيسي وتخصيصه لرخصتك الحالية.' });
            } else {
                 toast({ title: 'تمت إضافة المخزن الرئيسي بنجاح' });
            }
        }
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ المخزن الرئيسي' });
    }
  };

  const handleDeleteMainWarehouse = async (id: string) => {
    try {
      await dbAction('warehouses', 'remove', { id });
      toast({ title: 'تم حذف المخزن الرئيسي' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حذف المخزن الرئيسي' });
    }
  };

  const handleSaveInternalDivision = async (data: Partial<InternalDivision>) => {
    try {
      if (data.id) {
        await dbAction('inventorySections', 'update', { id: data.id, data });
        toast({ title: 'تم تحديث القسم الداخلي بنجاح' });
      } else {
        await dbAction('inventorySections', 'add', data);
        toast({ title: 'تمت إضافة القسم الداخلي بنجاح' });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ القسم الداخلي' });
    }
  };
  
    const handleDeleteInternalDivision = async (id: string) => {
    try {
      await dbAction('inventorySections', 'remove', { id });
      toast({ title: 'تم حذف القسم الداخلي' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حذف القسم الداخلي' });
    }
  };

  const mainWarehousesWithDetails = useMemo(() => {
    if (loading) return [];
    
    return mainWarehouses.map((mw: MainWarehouse) => {
        const divisionsForWarehouse = inventorySections.filter((div: InternalDivision) => div.mainWarehouseId === mw.id);
        
        let totalStockValue = 0;
        const uniqueItemIds = new Set<string>();

        const divisionsWithStock = divisionsForWarehouse.map((div: InternalDivision) => {
            const sectionInventory = inventory.find((inv: any) => inv.id === `${mw.id}-${div.id}`);
            const sectionItems = sectionInventory?.items || {};
            
            const currentStock = Object.values(sectionItems).reduce((sum: number, item: any) => sum + (item.balance || 0), 0);
            
            Object.entries(sectionItems).forEach(([itemId, itemData]: [string, any]) => {
                uniqueItemIds.add(itemId);
                const itemDetails = items.find((i: Item) => i.id === itemId);
                const itemCost = itemDetails?.cost || 0;
                const balance = (itemData as any).balance || 0;
                totalStockValue += balance * itemCost;
            });

            const fillPercentage = div.capacity && div.capacity > 0 ? Math.min(100, (currentStock / div.capacity) * 100) : 0;
            return { ...div, currentStock, fillPercentage, sectionStock: Object.keys(sectionItems).map(itemId => ({itemId, quantity: (sectionItems[itemId] as any).balance})) };
        });
        
        // Ensure items in sections are also counted for unique items even if the section itself has 0 stock now
        inventory.filter((inv: any) => inv.id.startsWith(`${mw.id}-`)).forEach((inv: any) => {
             Object.keys(inv.items || {}).forEach(itemId => uniqueItemIds.add(itemId));
        });


        return {
            ...mw,
            divisions: divisionsWithStock,
            totalUniqueItems: uniqueItemIds.size,
            totalStockValue,
        };
    });
  }, [mainWarehouses, inventorySections, inventory, items, loading]);
  
  const selectedWarehouse = useMemo(() => {
      if (!selectedWarehouseId) return null;
      return mainWarehousesWithDetails.find(wh => wh.id === selectedWarehouseId) || null;
  }, [selectedWarehouseId, mainWarehousesWithDetails]);


  const filteredDivisions = useMemo(() => {
    if (!selectedWarehouse) return [];
    
    const divisionsWithItemData = selectedWarehouse.divisions.map((division: any) => {
        const hasMatchingItem = division.sectionStock.some((stockItem: any) => {
            if (!searchTerm.trim()) return true;
            const lowercasedTerm = searchTerm.toLowerCase();
            const itemDetails = items.find((item: Item) => item.id === stockItem.itemId);
            if (!itemDetails) return false;
            return itemDetails.name.toLowerCase().includes(lowercasedTerm) || 
                   (itemDetails.code && itemDetails.code.includes(lowercasedTerm));
        });

        return { ...division, isSearchResult: searchTerm.trim() ? hasMatchingItem : false };
    });

    if (searchTerm.trim()) {
        return divisionsWithItemData.filter((d: any) => d.isSearchResult);
    }
    
    return divisionsWithItemData;

  }, [selectedWarehouse, searchTerm, items]);
  
  if (loading) {
    return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>
  }
  
  const getFillColor = (percentage: number) => {
    if (percentage > 80) return 'bg-red-500/20 border-red-500/50 hover:border-red-600';
    if (percentage > 60) return 'bg-orange-500/20 border-orange-500/50 hover:border-orange-600';
    if (percentage > 40) return 'bg-yellow-500/20 border-yellow-500/50 hover:border-yellow-600';
    if (percentage > 20) return 'bg-green-500/10 border-green-500/30 hover:border-green-600';
    return 'bg-blue-500/20 border-blue-500/50 hover:border-blue-600';
  };
  
  if(selectedWarehouse) {
      return (
         <>
            <PageHeader title={`أقسام المخزن: ${selectedWarehouse.name}`}>
                <div className="flex items-center gap-2">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="بحث عن صنف بالاسم أو الباركود..." 
                            className="pr-9"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" onClick={() => { setSelectedWarehouseId(null); setSearchTerm(''); }}>
                        <ArrowLeft className="ml-2 h-4 w-4" /> العودة للمخازن
                    </Button>
                    <AddEntityDialog title={`إضافة قسم جديد في ${selectedWarehouse.name}`} description="القسم هو تقسيم فرعي داخل المخزن الرئيسي (مثال: رف A1)." triggerButton={<Button size="sm"><PlusCircle className="ml-2 h-4 w-4" /> إضافة قسم</Button>}>
                        {({onClose}) => <InternalDivisionForm onSave={(data) => handleSaveInternalDivision({ ...data, mainWarehouseId: selectedWarehouse.id })} onClose={onClose} mainWarehouseId={selectedWarehouse.id!} />}
                    </AddEntityDialog>
                </div>
            </PageHeader>
            <main className="flex-1 p-4 md:p-6">
                <Dialog onOpenChange={(open) => !open && setSelectedDivisionForView(null)}>
                <TooltipProvider>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {filteredDivisions.map((division: any) => (
                           <div key={division.id} className="relative group">
                             <Link href={`/inventory/zones/${division.id}`}>
                               <Card className={cn(
                                   "flex flex-col items-center justify-center p-4 aspect-square transition-all duration-200 cursor-pointer", 
                                   getFillColor(division.fillPercentage),
                                   division.isSearchResult && 'ring-2 ring-primary' // Highlight search result
                               )}>
                                   <div className="absolute top-2 right-2 flex items-center gap-1">
                                        {division.allowOverfill && (
                                          <Tooltip>
                                              <TooltipTrigger asChild>
                                                  <Archive className="h-5 w-5 text-blue-500"/>
                                              </TooltipTrigger>
                                              <TooltipContent><p>مسموح بتجاوز السعة الاستيعابية</p></TooltipContent>
                                          </Tooltip>
                                        )}
                                        {division.capacity > 0 && division.currentStock > division.capacity && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <AlertTriangle className="h-5 w-5 text-destructive"/>
                                                </TooltipTrigger>
                                                <TooltipContent><p>تم تجاوز السعة الاستيعابية</p></TooltipContent>
                                            </Tooltip>
                                        )}
                                    </div>
                                   <Boxes className="w-12 h-12 text-muted-foreground mb-2"/>
                                   <h3 className="font-bold text-center">{division.name}</h3>
                                   <p className="text-sm text-muted-foreground">({division.currentStock} / {division.capacity || '∞'})</p>
                                   <Progress value={division.fillPercentage} className="w-full h-1.5 mt-2" />
                               </Card>
                             </Link>
                             <div className="absolute top-2 left-2 rtl:left-auto rtl:right-2">
                                <AlertDialog>
                                  <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4"/></Button>
                                      </DropdownMenuTrigger>
                                       <DropdownMenuContent>
                                          <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                          <DropdownMenuSeparator />
                                          <DialogTrigger asChild>
                                               <DropdownMenuItem onSelect={e => e.preventDefault()} onClick={() => setSelectedDivisionForView(division)}>
                                                  <Eye className="ml-2 h-4 w-4"/> عرض المحتويات
                                               </DropdownMenuItem>
                                           </DialogTrigger>
                                          <AddEntityDialog title="تعديل القسم" description="" triggerButton={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><Edit className="ml-2 h-4 w-4"/>تعديل</DropdownMenuItem>}>
                                              {({onClose}) => <InternalDivisionForm onSave={handleSaveInternalDivision} onClose={onClose} mainWarehouseId={selectedWarehouse.id!} division={division} />}
                                          </AddEntityDialog>
                                          <AlertDialogTrigger asChild>
                                              <DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}><Trash2 className="ml-2 h-4 w-4"/>حذف</DropdownMenuItem>
                                          </AlertDialogTrigger>
                                      </DropdownMenuContent>
                                  </DropdownMenu>
                                   <AlertDialogContent>
                                      <AlertDialogHeader><AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle><AlertDialogDescription>سيتم حذف هذا القسم نهائياً.</AlertDialogDescription></AlertDialogHeader>
                                      <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteInternalDivision(division.id!)}>متابعة</AlertDialogAction></AlertDialogFooter>
                                  </AlertDialogContent>
                               </AlertDialog>
                             </div>
                           </div>
                        ))}
                    </div>
                </TooltipProvider>
                <SectionContentsDialog 
                    division={selectedDivisionForView} 
                    items={items}
                    inventory={inventory}
                />
                </Dialog>
            </main>
         </>
      )
  }

  return (
    <>
      <PageHeader title="المخازن الرئيسية والأقسام (الحاويات)">
        <div className="flex items-center gap-4">
             {branches.length > 1 && (
                <div className="w-64">
                    <Combobox
                        options={[{ value: 'all', label: 'كل الفروع' }, ...branches.map(b => ({ value: b.id, label: b.name }))]}
                        value={branchFilter}
                        onValueChange={setBranchFilter}
                        placeholder="فلترة حسب الفرع..."
                    />
                </div>
            )}
            <AddEntityDialog
            title="إضافة مخزن رئيسي جديد"
            description="المخزن الرئيسي يعمل كمركز توزيع للمخازن الفرعية."
            triggerButton={<Button size="sm"><PlusCircle className="ml-2 h-4 w-4" /> إضافة مخزن رئيسي</Button>}
            >
            {({onClose}) => <MainWarehouseForm onSave={handleSaveMainWarehouse} onClose={onClose} allWarehouses={warehouses} branches={branches} />}
            </AddEntityDialog>
        </div>
      </PageHeader>
      <main className="flex-1 p-4 md:p-6 space-y-6">
            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {mainWarehousesWithDetails.map((mw: any) => (
                <Card key={mw.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedWarehouseId(mw.id)}>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <WarehouseIcon className="h-5 w-5 text-primary"/>
                            {mw.name}
                        </CardTitle>
                        <CardDescription>{mw.address || 'مخزن رئيسي'}</CardDescription>
                    </div>
                     <AlertDialog>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={e => e.stopPropagation()}><MoreHorizontal className="h-4 w-4"/></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <AddEntityDialog title="تعديل المخزن الرئيسي" description="" triggerButton={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><Edit className="ml-2 h-4 w-4"/>تعديل</DropdownMenuItem>}>
                                {({onClose}) => <MainWarehouseForm onSave={handleSaveMainWarehouse} onClose={onClose} mainWarehouse={mw} allWarehouses={warehouses} branches={branches} />}
                            </AddEntityDialog>
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}><Trash2 className="ml-2 h-4 w-4"/>حذف</DropdownMenuItem>
                            </AlertDialogTrigger>
                        </DropdownMenuContent>
                        </DropdownMenu>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle><AlertDialogDescription>سيتم حذف هذا المخزن الرئيسي وجميع الأقسام الداخلية بداخلها.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteMainWarehouse(mw.id!)}>متابعة</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardHeader>
                <CardContent>
                   <div className="text-sm text-muted-foreground space-y-2">
                         <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1"><LayoutGrid className="h-4 w-4"/> عدد الأقسام الداخلية</span>
                            <span className="font-bold text-lg text-foreground">{mw.divisions.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1"><Tag className="h-4 w-4"/> عدد الاصناف داخل المخزن</span>
                            <span className="font-bold text-lg text-foreground">{mw.totalUniqueItems}</span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-2 mt-2">
                            <span className="flex items-center gap-1 font-semibold"><Coins className="h-4 w-4"/> إجمالي قيمة المخزون</span>
                            <span className="font-bold text-lg text-primary">{mw.totalStockValue.toLocaleString()} ج.م</span>
                        </div>
                   </div>
                </CardContent>
                </Card>
            ))}
            {mainWarehousesWithDetails.length === 0 && (
                    <Card className="md:col-span-3">
                        <CardContent className="p-10 text-center text-muted-foreground">
                            لم يتم إضافة أي مخازن رئيسية بعد.
                        </CardContent>
                    </Card>
            )}
            </div>
      </main>
    </>
  );
}
