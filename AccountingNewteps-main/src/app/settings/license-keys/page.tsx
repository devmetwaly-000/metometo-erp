
"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { useAuth } from '@/contexts/auth-context';
import { Loader2, PlusCircle, KeyRound, ClipboardCopy, Lock, Trash2, MoreHorizontal, Settings, Save, UserRound, Edit, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { permissionsConfig, getModuleGroupLabel } from "@/contexts/permissions-context";
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { MultiSelect } from '@/components/ui/multi-select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


// A simple UUID generator as a fallback if uuid package is not available
const simpleUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16).toUpperCase();
  });
};


interface License {
    id: string;
    key: string;
    createdAt: string;
    startDate?: string;
    endDate?: string;
    status: 'available' | 'assigned';
    assignedTo?: string;
    enabledModules?: Record<string, boolean>;
    assignedWarehouseIds?: string[]; // New field
    maxUsers?: number; // Maximum number of users allowed for this license
}

const ManageLicenseModulesDialog = ({ license, onSave, onOpenChange }: { license: License | null, onSave: (licenseId: string, enabledModules: Record<string, boolean>) => void, onOpenChange: (open: boolean) => void }) => {
    const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>({});

    React.useEffect(() => {
        if (license?.enabledModules) {
            setEnabledModules(license.enabledModules);
        } else {
            // Default to all enabled if not set
            const allEnabled = Object.keys(permissionsConfig).reduce((acc, key) => {
                acc[key] = true;
                return acc;
            }, {} as Record<string, boolean>);
            setEnabledModules(allEnabled);
        }
    }, [license]);

    const handleToggleModule = (moduleKey: string, isChecked: boolean) => {
        setEnabledModules(prev => ({
            ...prev,
            [moduleKey]: isChecked
        }));
    };

    const orderedGroupKeys = [
        "general", "pos", "marketing", "items", "warehouses", "logistics", 
        "customers", "suppliers", "accounting", "salesReps", "delivery", "hr", "reports", "settings"
    ];

    const groupedModules = useMemo(() => {
        const groups: Record<string, any[]> = {};
        Object.entries(permissionsConfig).forEach(([key, value]) => {
            const groupKey = value.group;
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push({ key, ...value });
        });

        const orderedGroups: Record<string, any[]> = {};
        orderedGroupKeys.forEach(key => {
            if (groups[key]) {
                orderedGroups[key] = groups[key];
            }
        });
        return orderedGroups;

    }, []);

    const handleToggleGroup = (modules: any[], isChecked: boolean) => {
        const moduleKeys = modules.map(m => m.key);
        setEnabledModules(prev => {
            const newModules = { ...prev };
            moduleKeys.forEach(key => {
                newModules[key] = isChecked;
            });
            return newModules;
        });
    };

    if (!license) return null;

    return (
        <DialogContent className="max-w-4xl" hideOverlay>
            <DialogHeader>
                <DialogTitle>إدارة الوحدات للترخيص: {license.key}</DialogTitle>
                <DialogDescription>
                    حدد الوحدات والشاشات التي سيتم تفعيلها بواسطة هذا المفتاح.
                </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[60vh] border rounded-md p-4">
                <Accordion type="multiple" className="w-full space-y-2">
                    {Object.entries(groupedModules).map(([groupKey, modules]) => {
                        const allInGroupEnabled = modules.every(m => enabledModules[m.key]);
                        return (
                        <AccordionItem value={groupKey} key={groupKey} className="border-b-0 rounded-lg border bg-card">
                           <div className="flex items-center px-4">
                                <AccordionTrigger className="flex-1 text-primary font-semibold hover:no-underline">
                                    {getModuleGroupLabel(groupKey)}
                                </AccordionTrigger>
                                <div className="flex items-center gap-2">
                                     <Label htmlFor={`group-check-${groupKey}`} className="text-xs">تحديد الكل</Label>
                                     <Checkbox
                                        id={`group-check-${groupKey}`}
                                        checked={allInGroupEnabled}
                                        onCheckedChange={(checked) => handleToggleGroup(modules, !!checked)}
                                    />
                                </div>
                            </div>
                            <AccordionContent className="p-4 pt-2">
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                                    {modules.map((module: any) => (
                                        <div key={module.key} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={module.key}
                                                checked={!!enabledModules[module.key]}
                                                onCheckedChange={(checked) => handleToggleModule(module.key, !!checked)}
                                            />
                                            <label htmlFor={module.key} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                {module.label}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    )})}
                </Accordion>
            </ScrollArea>
             <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
                <Button onClick={() => onSave(license.id, enabledModules)}>
                    <Save className="ml-2 h-4 w-4"/>
                    حفظ صلاحيات الترخيص
                </Button>
            </DialogFooter>
        </DialogContent>
    );
};


const GenerateLicenseDialog = ({ onGenerate, onOpenChange, warehouses }: { onGenerate: (data: {startDate: string, endDate: string, warehouseIds: string[], maxUsers: number}) => void, onOpenChange: (open: boolean) => void, warehouses: any[] }) => {
    const { user } = useAuth();
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(() => {
        const date = new Date();
        date.setFullYear(date.getFullYear() + 1);
        return date.toISOString().split('T')[0];
    });
    const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
    const [maxUsers, setMaxUsers] = useState<number>(5);

    const warehouseOptions = useMemo(() => {
        let availableWarehouses = warehouses || [];
        if (user && !user.warehouseIds?.includes('all')) {
            availableWarehouses = availableWarehouses.filter(w => user.warehouseIds?.includes(w.id));
        }
        return availableWarehouses.map(w => ({ value: w.id, label: w.name }));
    }, [warehouses, user]);

    const handleConfirm = () => {
        onGenerate({ startDate, endDate, warehouseIds, maxUsers });
        onOpenChange(false);
    };

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>إنشاء مفتاح ترخيص جديد</DialogTitle>
                <DialogDescription>حدد فترة صلاحية المفتاح، الفروع، وعدد المستخدمين المسموح به.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="start-date">تاريخ البدء</Label>
                    <Input id="start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="end-date">تاريخ الانتهاء</Label>
                    <Input id="end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="max-users">عدد المستخدمين المسموح</Label>
                    <Input id="max-users" type="number" min={1} value={maxUsers} onChange={e => setMaxUsers(parseInt(e.target.value) || 1)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="warehouse-ids">تخصيص لفروع (اختياري)</Label>
                    <MultiSelect
                        options={warehouseOptions}
                        selected={warehouseIds}
                        onChange={setWarehouseIds}
                        placeholder="اتركه فارغاً ليكون صالحاً لكل الفروع"
                    />
                </div>
            </div>
            <DialogFooter>
                 <DialogClose asChild>
                    <Button variant="ghost">إلغاء</Button>
                </DialogClose>
                <Button onClick={handleConfirm} disabled={!startDate || !endDate || new Date(startDate) > new Date(endDate)}>
                    <PlusCircle className="ml-2 h-4 w-4"/> إنشاء
                </Button>
            </DialogFooter>
        </DialogContent>
    );
};

const EditLicenseDialog = ({ license, onSave, onOpenChange, warehouses }: { license: License | null, onSave: (id: string, data: Partial<Omit<License, 'id' | 'key'>>) => void, onOpenChange: (open: boolean) => void, warehouses: any[] }) => {
    const { user } = useAuth();
    const [formData, setFormData] = useState<{startDate?: string, endDate?: string, assignedWarehouseIds?: string[], maxUsers?: number}>({});
    
    useEffect(() => {
        if (license) {
            setFormData({
                startDate: license.startDate ? new Date(license.startDate).toISOString().split('T')[0] : '',
                endDate: license.endDate ? new Date(license.endDate).toISOString().split('T')[0] : '',
                assignedWarehouseIds: license.assignedWarehouseIds || [],
                maxUsers: license.maxUsers || 5
            });
        }
    }, [license]);

    const warehouseOptions = useMemo(() => {
        let availableWarehouses = warehouses || [];
        if (user && !user.warehouseIds?.includes('all')) {
            availableWarehouses = availableWarehouses.filter(w => user.warehouseIds?.includes(w.id));
        }
        return availableWarehouses.map(w => ({ value: w.id, label: w.name }));
    }, [warehouses, user]);

    const handleConfirm = () => {
        if (!license) return;
        const dataToSave: Partial<Omit<License, 'id' | 'key'>> = {
            startDate: formData.startDate ? new Date(formData.startDate).toISOString() : undefined,
            endDate: formData.endDate ? new Date(formData.endDate).toISOString() : undefined,
            assignedWarehouseIds: formData.assignedWarehouseIds && formData.assignedWarehouseIds.length > 0 ? formData.assignedWarehouseIds : undefined,
            maxUsers: formData.maxUsers
        };
        onSave(license.id, dataToSave);
        onOpenChange(false);
    };

    if (!license) return null;

    return (
        <DialogContent hideOverlay>
            <DialogHeader>
                <DialogTitle>تعديل الترخيص</DialogTitle>
                <DialogDescription>تعديل فترة الصلاحية، الفروع، وعدد المستخدمين للمفتاح: {license.key}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-start-date">تاريخ البدء</Label>
                    <Input id="edit-start-date" type="date" value={formData.startDate} onChange={e => setFormData(p => ({...p, startDate: e.target.value}))} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="edit-end-date">تاريخ الانتهاء</Label>
                    <Input id="edit-end-date" type="date" value={formData.endDate} onChange={e => setFormData(p => ({...p, endDate: e.target.value}))} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="edit-max-users">عدد المستخدمين المسموح</Label>
                    <Input id="edit-max-users" type="number" min={1} value={formData.maxUsers} onChange={e => setFormData(p => ({...p, maxUsers: parseInt(e.target.value) || 1}))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="edit-warehouse-ids">الفروع المخصصة (اختياري)</Label>
                    <MultiSelect
                        options={warehouseOptions}
                        selected={formData.assignedWarehouseIds || []}
                        onChange={(selected) => setFormData(p => ({...p, assignedWarehouseIds: selected}))}
                        placeholder="اتركه فارغاً ليكون صالحاً لكل الفروع"
                    />
                </div>
            </div>
            <DialogFooter>
                 <DialogClose asChild><Button variant="ghost">إلغاء</Button></DialogClose>
                <Button onClick={handleConfirm}>
                    <Save className="ml-2 h-4 w-4"/> حفظ التعديلات
                </Button>
            </DialogFooter>
        </DialogContent>
    )
}

export default function LicenseKeysPage() {
    const { licenses, users, dbAction, loading, warehouses, inventoryZones } = useData();
    const { toast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
    const [selectedLicenseForModules, setSelectedLicenseForModules] = useState<License | null>(null);
    const [licenseToEdit, setLicenseToEdit] = useState<License | null>(null);


    const [viewUsersLicense, setViewUsersLicense] = useState<License | null>(null);
    const [isUsersDialogOpen, setIsUsersDialogOpen] = useState(false);

    const [isModulesDialogOpen, setIsModulesDialogOpen] = useState(false);
    const [isEditLicenseOpen, setIsEditLicenseOpen] = useState(false);

    const handleViewUsers = (license: License) => {
        setViewUsersLicense(license);
        setIsUsersDialogOpen(true);
    };

    const handleOpenModules = (license: License) => {
        setSelectedLicenseForModules(license);
        // Increased timeout to prevent race conditions with DropdownMenu closing animation
        setTimeout(() => setIsModulesDialogOpen(true), 300);
    };

    const handleOpenEdit = (license: License) => {
        setLicenseToEdit(license);
        // Increased timeout to prevent race conditions with DropdownMenu closing animation
        setTimeout(() => setIsEditLicenseOpen(true), 300);
    };

    const allWarehouses = useMemo(() => {
        const combined = [...warehouses, ...inventoryZones];
        return combined.filter(w => w && w.id && w.name);
    }, [warehouses, inventoryZones]);


    const getLicenseUsers = (license: License) => {
        if (!license || !users) return [];
        return users.filter((u: any) => {
            if (u.isDisabled) return false;
            const coveredWarehouses = license.assignedWarehouseIds || [];
            const userWarehouses = u.warehouseIds || [];

            // Global License
            if (coveredWarehouses.length === 0) return true;

            // Specific License
            if (userWarehouses.includes('all')) return true;
            return userWarehouses.some((id: string) => coveredWarehouses.includes(id));
        });
    };

    const handleForceLogout = async (userToLogout: any) => {
        try {
            await dbAction('users', 'update', { id: userToLogout.id, data: { isDisabled: true } });
            toast({ title: "تم تسجيل الخروج", description: `تم تعطيل حساب ${userToLogout.name} وتسجيل خروجه.` });
        } catch (error) {
            toast({ variant: "destructive", title: "خطأ", description: "فشل تسجيل الخروج." });
        }
    };

    const handleGenerateKey = async (data: {startDate: string, endDate: string, warehouseIds: string[], maxUsers: number}) => {
        setIsGenerating(true);
        try {
            const newKey = `SA-KEY-${simpleUUID().substring(0, 8)}-${simpleUUID().substring(0, 8)}`;
            
            const allModulesEnabled = Object.keys(permissionsConfig).reduce((acc, key) => {
                acc[key] = true;
                return acc;
            }, {} as Record<string, boolean>);
            
            const newLicense: Omit<License, 'id'> = {
                key: newKey,
                createdAt: new Date().toISOString(),
                status: 'available',
                startDate: new Date(data.startDate).toISOString(),
                endDate: new Date(data.endDate).toISOString(),
                enabledModules: allModulesEnabled,
                assignedWarehouseIds: data.warehouseIds && data.warehouseIds.length > 0 ? data.warehouseIds : undefined,
                maxUsers: data.maxUsers
            };

            const newId = await dbAction('licenses', 'add', newLicense);
            if(newId){
               toast({ title: "تم إنشاء مفتاح جديد بنجاح" });
            } else {
                 throw new Error("Failed to get new ID from dbAction");
            }
        } catch (error) {
            toast({ variant: "destructive", title: "خطأ", description: "فشل إنشاء مفتاح الترخيص." });
            console.error("License generation failed:", error);
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleSaveModules = async (licenseId: string, enabledModules: Record<string, boolean>) => {
        try {
            await dbAction('licenses', 'update', { id: licenseId, data: { enabledModules } });
            toast({ title: 'تم الحفظ', description: 'تم تحديث صلاحيات مفتاح الترخيص.' });
            setIsModulesDialogOpen(false);
        } catch (error) {
            toast({ variant: "destructive", title: "خطأ", description: "فشل تحديث صلاحيات المفتاح." });
        }
    };
    
    const handleUpdateLicense = async (licenseId: string, data: Partial<Omit<License, 'id' | 'key'>>) => {
        try {
            await dbAction('licenses', 'update', { id: licenseId, data });
            
            // --- Sync Branches to Users ---
            // If assignedWarehouseIds was updated, find all users using this license and update their branches
            if (data.assignedWarehouseIds) {
                const license = licenses.find((l: any) => l.id === licenseId);
                if (license) {
                    const usersToUpdate = users.filter((u: any) => u.themeSettings?.licenseKey === license.key);
                    for (const user of usersToUpdate) {
                        // Merge the new branches with any special warehouses the user might have (like rep warehouses)
                        // Actually, the user's request says "add the branches to the users automatically".
                        // This usually means overwriting their warehouseIds with the license branches.
                        // We should preserve Rep warehouses if they are reps.
                        
                        let newWarehouseIds = [...data.assignedWarehouseIds];
                        if (user.isSalesRep) {
                            const repWarehouse = warehouses.find((w: any) => w.repId === user.id);
                            if (repWarehouse && !newWarehouseIds.includes(repWarehouse.id)) {
                                newWarehouseIds.push(repWarehouse.id);
                            }
                        }
                        
                        await dbAction('users', 'update', { 
                            id: user.id, 
                            data: { warehouseIds: newWarehouseIds } 
                        });
                    }
                }
            }
            // --- End Sync ---

            toast({ title: 'تم الحفظ', description: 'تم تحديث بيانات الترخيص بنجاح.' });
            setIsEditLicenseOpen(false);
        } catch (error) {
            toast({ variant: "destructive", title: "خطأ", description: "فشل تحديث الترخيص." });
        }
    };


    const handleDeleteKey = async (licenseId: string) => {
        try {
            const licenseToDelete = licenses.find((lic: any) => lic.id === licenseId);
            if (!licenseToDelete) return;

            // 1. Find and update users with this key
            const usersWithKey = users.filter((u: any) => u.themeSettings?.licenseKey === licenseToDelete.key);
            for (const userToUpdate of usersWithKey) {
                const newThemeSettings = { ...userToUpdate.themeSettings, licenseKey: '', licenseStatus: 'inactive' };
                await dbAction('users', 'update', { id: userToUpdate.id, data: { themeSettings: newThemeSettings } });
            }

            // 2. Delete the license key itself
            await dbAction('licenses', 'remove', { id: licenseId });

            toast({ title: "تم الحذف", description: `تم حذف المفتاح وإلغاء تفعيله من ${usersWithKey.length} مستخدم.` });
        } catch (error) {
            toast({ variant: "destructive", title: "خطأ", description: "فشل حذف المفتاح." });
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: "تم النسخ", description: "تم نسخ مفتاح الترخيص إلى الحافظة." });
    }

    const sortedLicenses = useMemo(() => {
        return [...(licenses || [])].sort((a: License, b: License) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [licenses]);
    
    const getStatusBadge = (license: License) => {
        if (license.status === 'assigned') {
            const now = new Date();
            const endDate = license.endDate ? new Date(license.endDate) : null;
            if (endDate && now > endDate) {
                return <Badge variant="destructive">منتهي الصلاحية</Badge>;
            }
            return <Badge variant="secondary">مُستخدم</Badge>;
        }
        return <Badge variant="default">متاح</Badge>;
    }


    return (
        <>
            <PageHeader title="إنشاء وتراخيص البرنامج">
                 <Dialog open={isGeneratorOpen} onOpenChange={setIsGeneratorOpen}>
                    <DialogTrigger asChild>
                         <Button disabled={isGenerating}>
                            {isGenerating ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <PlusCircle className="ml-2 h-4 w-4" />}
                            إنشاء مفتاح ترخيص جديد
                        </Button>
                    </DialogTrigger>
                    <GenerateLicenseDialog onGenerate={handleGenerateKey} onOpenChange={setIsGeneratorOpen} warehouses={allWarehouses} />
                </Dialog>

            </PageHeader>
            <main className="flex-1 p-4 md:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>قائمة التراخيص</CardTitle>
                        <CardDescription>
                            هذه قائمة بجميع مفاتيح التراخيص التي تم إنشاؤها. قدم هذه المفاتيح لعملائك لتفعيل برامجهم.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                        ) : (
                            <div className="w-full overflow-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="min-w-[280px]">مفتاح الترخيص</TableHead>
                                            <TableHead className="text-center">تاريخ الإنشاء</TableHead>
                                            <TableHead className="text-center">صالح من</TableHead>
                                            <TableHead className="text-center">صالح إلى</TableHead>
                                            <TableHead className="text-center">الحالة</TableHead>
                                            <TableHead className="text-center">الفرع المخصص</TableHead>
                                            <TableHead className="text-center">المستخدمين</TableHead>
                                            <TableHead className="text-center flex items-center justify-center gap-2"><UserRound className="h-4 w-4"/>العميل/الشركة</TableHead>
                                            <TableHead className="text-center w-[50px]">إجراء</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedLicenses.length > 0 ? sortedLicenses.map((license: License) => (
                                            <TableRow key={license.id}>
                                                <TableCell className="font-mono text-left" dir="ltr">
                                                    <div className="flex items-center gap-2">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(license.key)}>
                                                            <ClipboardCopy className="h-4 w-4" />
                                                        </Button>
                                                        <span>{license.key}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">{new Date(license.createdAt).toLocaleDateString('ar-EG')}</TableCell>
                                                <TableCell className="text-center">{license.startDate ? new Date(license.startDate).toLocaleDateString('ar-EG') : '-'}</TableCell>
                                                <TableCell className="text-center">{license.endDate ? new Date(license.endDate).toLocaleDateString('ar-EG') : '-'}</TableCell>
                                                <TableCell className="text-center">{getStatusBadge(license)}</TableCell>
                                                <TableCell className="text-center">{license.assignedWarehouseIds && license.assignedWarehouseIds.length > 0 ? license.assignedWarehouseIds.map(id => allWarehouses.find((w: any) => w.id === id)?.name).join(', ') : 'كل الفروع'}</TableCell>
                                                <TableCell className="text-center">
                                                    <Button 
                                                        variant="ghost" 
                                                        className="hover:underline h-8"
                                                        onClick={() => handleViewUsers(license)}
                                                    >
                                                        {getLicenseUsers(license).length} / {license.maxUsers || 5}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="text-center">{license.assignedTo || '-'}</TableCell>
                                                <TableCell className="text-center">
                                                    <AlertDialog>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                                                    <DropdownMenuItem onSelect={() => handleOpenEdit(license)}>
                                                                        <Edit className="ml-2 h-4 w-4"/> تعديل الترخيص والفروع
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onSelect={() => handleOpenModules(license)}>
                                                                        <Settings className="ml-2 h-4 w-4"/> إدارة الوحدات
                                                                    </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <AlertDialogTrigger asChild>
                                                                    <DropdownMenuItem className="text-destructive" onSelect={e => e.preventDefault()}>
                                                                        <Trash2 className="ml-2 h-4 w-4" /> حذف المفتاح
                                                                    </DropdownMenuItem>
                                                                </AlertDialogTrigger>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                                                                <AlertDialogDescription>سيتم حذف مفتاح الترخيص هذا بشكل نهائي، وسيتم إلغاء تفعيله من أي مستخدم مرتبط به.</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDeleteKey(license.id)} className="bg-destructive hover:bg-destructive/90">نعم، قم بالحذف</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                                    لم يتم إنشاء أي مفاتيح ترخيص بعد.
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

            <Dialog open={isUsersDialogOpen} onOpenChange={setIsUsersDialogOpen} modal={false}>
                <DialogContent className="max-w-md" hideOverlay>
                    <DialogHeader>
                        <DialogTitle>المستخدمين المتصلين - {viewUsersLicense?.key}</DialogTitle>
                        <DialogDescription>
                            قائمة المستخدمين الذين يستهلكون هذا الترخيص.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[300px] mt-4 border rounded-md p-2">
                        {viewUsersLicense && getLicenseUsers(viewUsersLicense).length > 0 ? (
                            <div className="space-y-2">
                                {getLicenseUsers(viewUsersLicense).map((u: any) => (
                                    <div key={u.id} className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
                                        <div className="flex flex-col text-right">
                                            <span className="font-medium">{u.name}</span>
                                            <span className="text-xs text-muted-foreground">{u.loginName}</span>
                                        </div>
                                        <Button 
                                            variant="destructive" 
                                            size="sm" 
                                            onClick={() => handleForceLogout(u)}
                                            title="تعطيل المستخدم وتسجيل خروجه"
                                        >
                                            <LogOut className="h-4 w-4 ml-1" />
                                            إخراج
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-muted-foreground">لا يوجد مستخدمين متصلين حالياً</div>
                        )}
                    </ScrollArea>
                    <DialogFooter>
                        <Button onClick={() => setIsUsersDialogOpen(false)}>إغلاق</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isModulesDialogOpen} onOpenChange={setIsModulesDialogOpen} modal={false}>
                {selectedLicenseForModules && (
                    <ManageLicenseModulesDialog 
                        license={selectedLicenseForModules} 
                        onSave={handleSaveModules} 
                        onOpenChange={setIsModulesDialogOpen} 
                    />
                )}
            </Dialog>

            <Dialog open={isEditLicenseOpen} onOpenChange={setIsEditLicenseOpen} modal={false}>
                {licenseToEdit && (
                    <EditLicenseDialog
                        license={licenseToEdit}
                        onSave={handleUpdateLicense}
                        onOpenChange={setIsEditLicenseOpen}
                        warehouses={allWarehouses}
                    />
                )}
            </Dialog>
        </>
    );
}
