
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/data-provider";
import { Loader2, Save, Bluetooth, AlertTriangle, ListPlus, Printer, Plus, Trash2 } from "lucide-react";
import { usePermissions } from "@/contexts/permissions-context";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Combobox } from '@/components/ui/combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { printService } from '@/lib/print-service';


interface KitchenPrinterConfig {
    id: string;
    name: string;
    type: 'bluetooth' | 'ip' | 'system' | 'browser';
    address: string;
    categories: string[];
}

interface PrinterSettings {
    posPrinterType: 'bluetooth' | 'ip' | 'system' | 'browser';
    posPrinterAddress: string;
    useKitchenPrinter?: boolean; // Global toggle
    // Deprecated single printer fields (kept for backward compatibility during migration)
    kitchenPrinterType?: 'bluetooth' | 'ip' | 'system' | 'browser';
    kitchenPrinterAddress?: string;
    kitchenPrinterCategories?: string[];
    
    // New multiple kitchen printers
    kitchenPrinters?: KitchenPrinterConfig[];

    // New printers
    a4PrinterType: 'system' | 'ip';
    a4PrinterAddress: string;
    barcodePrinterType: 'system' | 'ip';
    barcodePrinterAddress: string;
}

const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
    posPrinterType: 'system',
    posPrinterAddress: '',
    useKitchenPrinter: false,
    kitchenPrinterType: 'system',
    kitchenPrinterAddress: '',
    kitchenPrinterCategories: [],
    kitchenPrinters: [],
    // New printers defaults
    a4PrinterType: 'system',
    a4PrinterAddress: '',
    barcodePrinterType: 'system',
    barcodePrinterAddress: '',
};

const ManageCategoriesDialog = ({ selectedCategories, onSave, onOpenChange }: { selectedCategories: string[], onSave: (selected: string[]) => void, onOpenChange: (open: boolean) => void }) => {
    const { itemCategories, items } = useData();
    const [currentlySelected, setCurrentlySelected] = useState(selectedCategories);
    const [searchTerm, setSearchTerm] = useState('');

    const handleToggleCategory = (categoryId: string) => {
        setCurrentlySelected(prev => 
            prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
        );
    };
    
    const handleSave = () => {
        onSave(currentlySelected);
        onOpenChange(false);
    }
    
    const filteredCategories = useMemo(() => {
        if (!searchTerm) return itemCategories;
        return itemCategories.filter((cat: any) => cat.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [itemCategories, searchTerm]);


    return (
        <DialogContent className="max-w-lg">
            <DialogHeader>
                <DialogTitle>إدارة مجموعات الطباعة للمطبخ</DialogTitle>
                <DialogDescription>اختر المجموعات التي سيتم طباعة أصنافها عند إتمام عملية البيع.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
                 <Input placeholder="بحث عن مجموعة..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                 <ScrollArea className="h-72 w-full rounded-md border p-2">
                    <Accordion type="multiple" className="w-full">
                       {filteredCategories.map((cat: any) => (
                         <AccordionItem value={cat.id} key={cat.id}>
                            <div className="flex items-center gap-2 py-2">
                                <Checkbox
                                    id={`cat-${cat.id}`}
                                    checked={currentlySelected.includes(cat.id)}
                                    onCheckedChange={() => handleToggleCategory(cat.id)}
                                />
                                <AccordionTrigger className="flex-1 p-0 hover:no-underline">
                                    <Label htmlFor={`cat-${cat.id}`} className="flex-1 cursor-pointer">{cat.name}</Label>
                                </AccordionTrigger>
                            </div>
                            <AccordionContent>
                                <ul className="list-disc pl-10 pr-4 text-sm text-muted-foreground space-y-1">
                                    {items.filter((item:any) => item.categoryId === cat.id).map((item:any) => (
                                        <li key={item.id}>{item.name}</li>
                                    ))}
                                    {items.filter((item:any) => item.categoryId === cat.id).length === 0 && <li>لا توجد أصناف في هذه المجموعة.</li>}
                                </ul>
                            </AccordionContent>
                         </AccordionItem>
                       ))}
                    </Accordion>
                 </ScrollArea>
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
                <Button onClick={handleSave}>حفظ التحديد ({currentlySelected.length})</Button>
            </DialogFooter>
        </DialogContent>
    );
};

const PrinterSelector = ({ type, address, onTypeChange, onAddressChange, onTest, title, allowBluetooth = false, allowIp = true, discoveredDevices, systemPrinters = [], children }: { type: 'bluetooth' | 'ip' | 'system' | 'browser', address: string, onTypeChange: (value: any) => void, onAddressChange: (value: string) => void, onTest?: (address: string) => void, title: string, allowBluetooth?: boolean, allowIp?: boolean, discoveredDevices: any[], systemPrinters?: Array<{ deviceId?: string, name: string }>, children?: React.ReactNode }) => {
    const { toast } = useToast();
    const [localAddress, setLocalAddress] = useState(address);

    useEffect(() => {
        setLocalAddress(address);
    }, [address]);
    
    const handleTestIpPrint = async (ipAddress: string) => {
        if (!ipAddress) return toast({ variant: 'destructive', title: 'خطأ', description: 'الرجاء إدخال عنوان IP أولاً.' });
        toast({ title: 'جارٍ إرسال الطباعة...', description: `يحاول الاتصال بـ ${ipAddress}` });
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
            await fetch(`http://${ipAddress}`, { mode: 'no-cors', signal: controller.signal });
            toast({ title: 'تم إرسال أمر الطباعة بنجاح' });
        } catch (error: any) {
             if (error.name === 'AbortError') toast({ variant: 'destructive', title: 'فشل الاتصال (مهلة)', description: 'انتهت مهلة الاتصال.' });
             else toast({ variant: 'destructive', title: 'فشل الاتصال', description: 'تعذر الوصول إلى الطابعة.' });
        } finally { clearTimeout(timeoutId); }
    };

    const handleTestSystemPrint = async (printerName: string) => {
        if (onTest) {
            onTest(printerName);
            return;
        }
        if (!printerName) return toast({ variant: 'destructive', title: 'خطأ', description: 'الرجاء اختيار طابعة أولاً.' });
        toast({ title: 'جارٍ إرسال الطباعة...', description: `يتم إرسال أمر طباعة تجريبي إلى ${printerName}` });
        try {
            await printService.sendToPrinter(printerName, {
                title: 'Test Print / طباعة تجريبية',
                lines: [
                    { left: 'Test Successful', right: 'تم الاختبار بنجاح' },
                    { left: 'Date', right: new Date().toLocaleString('ar-EG') }
                ],
                footer: 'NewCashier POS System'
            });
            toast({ title: 'تمت الطباعة بنجاح' });
        } catch (error: any) {
            toast({ 
                variant: 'destructive', 
                title: 'فشل الطباعة', 
                description: error.message || 'تأكد من توصيل الطابعة وتثبيتها في النظام.'
            });
        }
    };

    return (
        <Card className="flex-1">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-base font-medium">{title}</CardTitle>
                    {type === 'system' && address && (
                        <Button variant="outline" size="sm" onClick={() => handleTestSystemPrint(address)}>
                            <Printer className="mr-2 h-4 w-4" />
                            طباعة تجريبية
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <Select value={type} onValueChange={onTypeChange}>
                    <SelectTrigger><SelectValue placeholder="اختر نوع الاتصال" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="system">طابعة النظام (طباعة يدوية)</SelectItem>
                        {allowBluetooth && <SelectItem value="bluetooth">بلوتوث</SelectItem>}
                        {allowIp && <SelectItem value="ip">شبكة (IP)</SelectItem>}
                        <SelectItem value="browser">المتصفح (Browser)</SelectItem>
                    </SelectContent>
                </Select>
                {type === 'bluetooth' && allowBluetooth ? (
                    <Select value={address} onValueChange={onAddressChange}>
                         <SelectTrigger><SelectValue placeholder="اختر طابعة" /></SelectTrigger>
                         <SelectContent>
                            {discoveredDevices.length > 0 ? discoveredDevices.map(device => (
                                <SelectItem key={device.id} value={device.id}>{device.name || `جهاز (${device.id})`}</SelectItem>
                            )) : <div className="text-center text-sm text-muted-foreground p-2">لم يتم العثور على أجهزة.</div>}
                         </SelectContent>
                    </Select>
                ) : type === 'ip' && allowIp ? (
                    <div className="flex gap-2">
                        <Input value={localAddress} onChange={e => setLocalAddress(e.target.value)} onBlur={() => onAddressChange(localAddress)} placeholder="e.g., 192.168.1.100" />
                        <Button variant="outline" size="icon" onClick={() => handleTestIpPrint(localAddress)} title="طباعة تجريبية"><Printer className="h-4 w-4" /></Button>
                    </div>
                ) : type === 'system' ? (
                    systemPrinters.length > 0 ? (
                        <Select value={address} onValueChange={onAddressChange}>
                            <SelectTrigger><SelectValue placeholder="اختر طابعة النظام" /></SelectTrigger>
                            <SelectContent>
                                {systemPrinters.map((p) => (
                                    <SelectItem key={p.deviceId || p.name} value={p.name}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <div className="p-2 text-sm text-muted-foreground flex items-center gap-2">
                            <Printer className="h-4 w-4" />
                            لم يتم العثور على طابعات نظام. تأكد أن التطبيق لديه صلاحية الوصول للنظام.
                        </div>
                    )
                ) : type === 'browser' ? (
                    <div className="flex gap-2 items-center border p-2 rounded bg-muted/50">
                        <span className="text-sm text-muted-foreground flex-1">سيتم استخدام نافذة الطباعة الافتراضية للمتصفح.</span>
                        <Button variant="outline" size="icon" onClick={() => window.print()} title="تجربة طباعة المتصفح">
                            <Printer className="h-4 w-4" />
                        </Button>
                    </div>
                ) : <div className="p-2 text-sm text-muted-foreground flex items-center gap-2"><Printer className="h-4 w-4" />سيتم فتح نافذة الطباعة الخاصة بالمتصفح.</div>}
                {children}
            </CardContent>
        </Card>
    );
};

const PrinterSettingsSection = ({ settings, onSettingChange, title, allowBluetooth, discoveredDevices, systemPrinters, itemCategories = [], children }: { settings: Partial<PrinterSettings>, onSettingChange: (key: keyof PrinterSettings, value: any) => void, title: string, allowBluetooth?: boolean, discoveredDevices: any[], systemPrinters: Array<{ deviceId?: string, name: string, paperSizes?: string[] }>, itemCategories?: any[], children?: React.ReactNode }) => {
    const { toast } = useToast();
    // Migration/Initialization logic
    const effectiveKitchenPrinters: KitchenPrinterConfig[] = settings.kitchenPrinters?.length ? settings.kitchenPrinters : 
        (settings.useKitchenPrinter && settings.kitchenPrinterAddress ? [{
            id: 'legacy-default',
            name: 'طابعة المطبخ الرئيسية',
            type: settings.kitchenPrinterType || 'system',
            address: settings.kitchenPrinterAddress,
            categories: settings.kitchenPrinterCategories || []
        }] : []);

    const handleKitchenPrintersChange = (newPrinters: KitchenPrinterConfig[]) => {
        onSettingChange('kitchenPrinters', newPrinters);
    };

    const handleKitchenTestPrint = async (printerName: string, categoryIds: string[]) => {
        if (!printerName) return toast({ variant: 'destructive', title: 'خطأ', description: 'الرجاء اختيار طابعة أولاً.' });
        
        // Find category names
        const categoryNames = categoryIds.map(id => {
            const cat = itemCategories.find(c => c.id === id);
            return cat ? cat.name : id;
        });

        toast({ title: 'جارٍ إرسال الطباعة...', description: `يتم إرسال أمر طباعة تجريبي (تجهيز) إلى ${printerName}` });
        
        try {
            const lines: { left: string; right: string }[] = [];
            lines.push({ left: 'User', right: 'Admin (Test)' });
            lines.push({ left: 'Order #', right: 'TEST-001' });
            lines.push({ left: 'Date', right: new Date().toLocaleString('ar-EG') });
            lines.push({ left: '--------------------------------', right: '' });
            
            if (categoryNames.length > 0) {
                categoryNames.forEach(catName => {
                    lines.push({ left: `--- ${catName} ---`, right: '' });
                    lines.push({ left: '1x Test Item (Chicken)', right: '' });
                    lines.push({ left: '   * Spicy', right: '' });
                    lines.push({ left: '2x Test Item (Drink)', right: '' });
                });
            } else {
                lines.push({ left: 'No categories assigned', right: '' });
                lines.push({ left: 'Please assign categories', right: '' });
            }
            
            lines.push({ left: '--------------------------------', right: '' });

            await printService.sendToPrinter(printerName, {
                title: 'KITCHEN / PREPARATION',
                lines: lines,
                footer: 'Kitchen Test Receipt'
            });
            toast({ title: 'تمت الطباعة بنجاح' });
        } catch (error: any) {
            toast({ 
                variant: 'destructive', 
                title: 'فشل الطباعة', 
                description: error.message || 'تأكد من توصيل الطابعة وتثبيتها في النظام.'
            });
        }
    };

    return (
        <Card>
            <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
            <CardContent className="space-y-8">
                 <PrinterSelector
                    title="طابعة الإيصالات (الكاشير)"
                    type={settings.posPrinterType || 'system'}
                    address={settings.posPrinterAddress || ''}
                    onTypeChange={value => onSettingChange('posPrinterType', value)}
                    onAddressChange={value => onSettingChange('posPrinterAddress', value)}
                    allowBluetooth
                    discoveredDevices={discoveredDevices}
                    systemPrinters={systemPrinters}
                />

                 {/* Kitchen Printers Section */}
                 <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-medium">طابعات المطبخ</h3>
                            <p className="text-sm text-muted-foreground">تكوين طابعات المطبخ وتخصيص الأقسام لكل طابعة.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => {
                            const newPrinter: KitchenPrinterConfig = {
                                id: Math.random().toString(36).substring(7),
                                name: `طابعة مطبخ ${effectiveKitchenPrinters.length + 1}`,
                                type: 'system',
                                address: '',
                                categories: []
                            };
                            handleKitchenPrintersChange([...effectiveKitchenPrinters, newPrinter]);
                        }}>
                            <Plus className="mr-2 h-4 w-4" /> إضافة طابعة مطبخ
                        </Button>
                    </div>

                    {effectiveKitchenPrinters.length === 0 && (
                        <div className="text-center py-8 border rounded-md bg-muted/20">
                            <Printer className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                            <p className="text-muted-foreground">لا توجد طابعات مطبخ مضافة.</p>
                        </div>
                    )}

                    {effectiveKitchenPrinters.map((printer, index) => (
                        <div key={printer.id} className="relative group border rounded-lg p-4 space-y-4 bg-card">
                            <div className="flex items-center gap-4">
                                <div className="flex-1 space-y-2">
                                    <Label>اسم الطابعة</Label>
                                    <Input 
                                        value={printer.name} 
                                        onChange={(e) => {
                                            const updated = [...effectiveKitchenPrinters];
                                            updated[index] = { ...printer, name: e.target.value };
                                            handleKitchenPrintersChange(updated);
                                        }}
                                        placeholder="مثلاً: طابعة المشويات"
                                    />
                                </div>
                                <Button variant="destructive" size="icon" className="mt-6" onClick={() => {
                                    const updated = effectiveKitchenPrinters.filter((_, i) => i !== index);
                                    handleKitchenPrintersChange(updated);
                                }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                            
                            <PrinterSelector
                                title={`إعدادات الاتصال (${printer.name})`}
                                type={printer.type}
                                address={printer.address}
                                onTypeChange={(val) => {
                                    const updated = [...effectiveKitchenPrinters];
                                    updated[index] = { ...printer, type: val };
                                    handleKitchenPrintersChange(updated);
                                }}
                                onAddressChange={(val) => {
                                    const updated = [...effectiveKitchenPrinters];
                                    updated[index] = { ...printer, address: val };
                                    handleKitchenPrintersChange(updated);
                                }}
                                onTest={(addr) => handleKitchenTestPrint(addr, printer.categories)}
                                allowIp
                                discoveredDevices={discoveredDevices}
                                systemPrinters={systemPrinters}
                            >
                                <div className="pt-2">
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" className="w-full">
                                                <ListPlus className="ml-2 h-4 w-4"/> 
                                                تحديد الأقسام ({printer.categories.length})
                                            </Button>
                                        </DialogTrigger>
                                        <ManageCategoriesDialog 
                                            selectedCategories={printer.categories} 
                                            onSave={(selected) => {
                                                const updated = [...effectiveKitchenPrinters];
                                                updated[index] = { ...printer, categories: selected };
                                                handleKitchenPrintersChange(updated);
                                            }} 
                                            onOpenChange={()=>{}} 
                                        />
                                    </Dialog>
                                </div>
                            </PrinterSelector>
                        </div>
                    ))}
                 </div>

                 <PrinterSelector
                    title="طابعة الفواتير (A4)"
                    type={settings.a4PrinterType || 'system'}
                    address={settings.a4PrinterAddress || ''}
                    onTypeChange={value => onSettingChange('a4PrinterType', value)}
                    onAddressChange={value => onSettingChange('a4PrinterAddress', value)}
                     allowIp
                     discoveredDevices={discoveredDevices}
                />
                 <PrinterSelector
                    title="طابعة الباركود"
                    type={settings.barcodePrinterType || 'system'}
                    address={settings.barcodePrinterAddress || ''}
                    onTypeChange={value => onSettingChange('barcodePrinterType', value)}
                    onAddressChange={value => onSettingChange('barcodePrinterAddress', value)}
                     allowIp
                     discoveredDevices={discoveredDevices}
                />
                 {children}
            </CardContent>
        </Card>
    );
}

export default function PrintersPage() {
    const { toast } = useToast();
    const { can } = usePermissions();
    const { settings: allData, dbAction, loading: dataLoading, warehouses, itemCategories } = useData();
    const [isSaving, setIsSaving] = useState(false);
    
    const [defaultSettings, setDefaultSettings] = useState<PrinterSettings>(DEFAULT_PRINTER_SETTINGS);
    const [branchOverrides, setBranchOverrides] = useState<Record<string, Partial<PrinterSettings>>>({});
    const [selectedBranchId, setSelectedBranchId] = useState<string>('');
    
    const [discoveredDevices, setDiscoveredDevices] = useState<any[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [systemPrinters, setSystemPrinters] = useState<Array<{ deviceId?: string, name: string, paperSizes?: string[] }>>([]);
    
    useEffect(() => {
        const savedSettings = allData?.main?.printers || {};
        setDefaultSettings({ ...DEFAULT_PRINTER_SETTINGS, ...(savedSettings.default || {}) });
        setBranchOverrides(savedSettings.branchOverrides || {});
    }, [allData]);
    
    useEffect(() => {
        const fetchPrinters = async () => {
            const printers = await printService.getSystemPrinters();
            if (printers.length) setSystemPrinters(printers);
        };
        fetchPrinters();
    }, []);

    const currentBranchSettings: Partial<PrinterSettings> = useMemo(() => {
        if (!selectedBranchId) return {};
        return branchOverrides[selectedBranchId] || {};
    }, [selectedBranchId, branchOverrides]);

    const handleSettingChange = (isDefault: boolean, key: keyof PrinterSettings, value: any) => {
        if (isDefault) {
            setDefaultSettings(prev => ({ ...prev, [key]: value }));
        } else if (selectedBranchId) {
            setBranchOverrides(prev => ({
                ...prev,
                [selectedBranchId]: {
                    ...(prev[selectedBranchId] || {}),
                    [key]: value
                }
            }));
        }
    };
    
    const handleSave = async () => {
        if (!can('edit', 'settings_printers')) return toast({ variant: "destructive", title: "غير مصرح به" });
        setIsSaving(true);
        try {
            await dbAction('settings', 'update', { id: 'main', data: { printers: { default: defaultSettings, branchOverrides } } });
            toast({ title: "تم الحفظ بنجاح", description: `تم تحديث إعدادات الطابعات.` });
        } catch (error) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ الإعدادات.' });
        } finally {
            setIsSaving(false);
        }
    };
    
     const handleScanBluetooth = async () => {
        if (typeof navigator !== 'undefined' && !(navigator as any).bluetooth) {
            return toast({ variant: 'destructive', title: 'غير مدعوم', description: 'متصفحك لا يدعم Web Bluetooth أو أنك لا تستخدم اتصال HTTPS آمن.' });
        }
        setIsScanning(true);
        try {
            const device = await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true });
            setDiscoveredDevices(prev => prev.some((d: any) => d.id === device.id) ? prev : [...prev, device]);
            toast({ title: 'تم العثور على جهاز', description: `تم العثور على ${device.name || `جهاز (${device.id})`}` });
        } catch (error: any) {
             if (error.name !== 'NotFoundError' && error.name !== 'AbortError') console.error('Error scanning:', error);
        } finally {
            setIsScanning(false);
        }
    };

    if (dataLoading) {
        return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <>
            <PageHeader title="إعدادات الطباعة">
                 <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                    حفظ كل الإعدادات
                </Button>
            </PageHeader>
            <main className="flex flex-1 flex-col gap-6 p-4 md:gap-8 md:p-6">
                <Card>
                    <CardHeader><CardTitle>البحث عن طابعات البلوتوث</CardTitle><CardDescription>ابحث عن الطابعات القريبة لإضافتها إلى القوائم أدناه.</CardDescription></CardHeader>
                    <CardContent><Button onClick={handleScanBluetooth} disabled={isScanning}>{isScanning && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} {isScanning ? 'جارٍ البحث...' : 'بحث عن طابعات بلوتوث'}</Button></CardContent>
                </Card>

                <Tabs defaultValue="default">
                    <TabsList>
                        <TabsTrigger value="default">الإعدادات الافتراضية</TabsTrigger>
                        <TabsTrigger value="branch">تخصيص فرع</TabsTrigger>
                    </TabsList>
                    <TabsContent value="default">
                        <PrinterSettingsSection
                            title="الإعدادات الافتراضية للطابعات (لكل الفروع)"
                            settings={defaultSettings}
                            onSettingChange={(key, value) => handleSettingChange(true, key, value)}
                            discoveredDevices={discoveredDevices}
                            systemPrinters={systemPrinters}
                            itemCategories={itemCategories}
                        />
                    </TabsContent>
                     <TabsContent value="branch">
                        <Card>
                            <CardHeader>
                                <CardTitle>إعدادات مخصصة لفرع</CardTitle>
                                <CardDescription>اختر فرعًا لتجاوز الإعدادات الافتراضية وتعيين إعدادات طباعة خاصة به.</CardDescription>
                            </CardHeader>
                             <CardContent className="space-y-6">
                                <div className="max-w-sm space-y-2">
                                     <Label>اختر الفرع للتخصيص</Label>
                                     <Combobox options={warehouses.map((w: any) => ({value: w.id, label: w.name}))} value={selectedBranchId} onValueChange={setSelectedBranchId} placeholder="اختر فرعًا..." emptyMessage="لا توجد فروع."/>
                                </div>
                                {selectedBranchId && (
                                    <div className="pt-4 border-t">
                                        <PrinterSettingsSection
                                            title={`إعدادات فرع: ${warehouses.find((w:any) => w.id === selectedBranchId)?.name}`}
                                            settings={{...defaultSettings, ...currentBranchSettings}} // Show merged settings
                                            onSettingChange={(key, value) => handleSettingChange(false, key, value)}
                                            discoveredDevices={discoveredDevices}
                                            systemPrinters={systemPrinters}
                                            itemCategories={itemCategories}
                                        />
                                    </div>
                                )}
                             </CardContent>
                        </Card>
                     </TabsContent>
                </Tabs>
            </main>
        </>
    );
}
