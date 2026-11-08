
"use client"

import React, { useState, useEffect, useMemo } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Bell, BellRing, Palette, ShieldCheck, Image as ImageIcon, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { useData } from "@/contexts/data-provider";
import { useNotifications } from "@/contexts/notification-context";
import { Slider } from "@/components/ui/slider";
import Link from 'next/link';

interface GeneralSettings {
    companyName: string;
    companyAddress: string;
    logoUrl?: string;
    language: 'ar' | 'en';
    mobileFabPosition: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left' | 'middle-right' | 'middle-left';
    invoiceFooter?: string;
    desktopLayout: 'sidebar' | 'menubar' | 'modern_hub';
    toastDuration?: number;
    welcomeMessage?: string;
    isClothingStore?: boolean;
    licenseKey?: string;
    licenseStatus?: 'active' | 'inactive' | 'expired';
    showWatermark?: boolean;
    watermarkOpacity?: number;
}

interface FinancialSettings {
    openingCapital: number;
    fiscalYearStart: string;
    currency: 'EGP' | 'SAR' | 'USD';
    allowNegativeStock: boolean;
    scaleBarcodePrefix: string;
    clothingBarcodePrefix: string;
    standardItemBarcodePrefix: string;
    purchaseWorkflow: 'direct' | 'manual';
    roundingDecimals: number;
    vatRate: number;
    inventoryValuationMethod: 'average' | 'last_purchase';
    showInventoryLosses?: boolean;
}

interface PosSettings {
    workDay: string;
    scaleItemDefaultFocus: 'weight' | 'price';
    cartColumns: {
        showBarcode: boolean;
        showPrice: boolean;
        widthName?: number;
        widthBarcode?: number;
        widthPrice?: number;
        widthQty?: number;
        widthTotal?: number;
    };
    layout?: {
        layout: 'cart-left' | 'cart-right';
        cartWidth: number;
        itemsWidth: number;
        groupsPosition: 'left' | 'right';
        paymentPosition: 'top' | 'bottom';
    };
    showAllItemsInitially: boolean;
    autoPrintReceipt: boolean;
    showItemStock: boolean;
    defaultApplyTax: boolean;
}

interface Settings {
    general: GeneralSettings;
    financial: FinancialSettings;
    posSettings: PosSettings;
}

const DEFAULT_WIDTHS = {
    widthName: 35,
    widthBarcode: 20,
    widthPrice: 15,
    widthQty: 15,
    widthTotal: 15,
};

export default function SettingsPage() {
    const { toast } = useToast();
    const { notificationsEnabled, toggleNotifications } = useNotifications();
    const { settings: allData, licenses, dbAction, loading: dataLoading } = useData();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (allData?.main) {
            const loadedSettings = allData.main;
            
            const defaultGeneral: GeneralSettings = { 
                companyName: '', 
                companyAddress: '', 
                logoUrl: "/logo.png", 
                language: 'ar', 
                mobileFabPosition: 'bottom-right', 
                invoiceFooter: '', 
                desktopLayout: 'sidebar', 
                toastDuration: 5, 
                welcomeMessage: '', 
                isClothingStore: false, 
                licenseKey: '', 
                licenseStatus: 'inactive',
                showWatermark: false, 
                watermarkOpacity: 0.1 
            };

            const defaultFinancial: FinancialSettings = {
                openingCapital: 0, 
                fiscalYearStart: '', 
                currency: 'EGP', 
                allowNegativeStock: false, 
                scaleBarcodePrefix: '21', 
                clothingBarcodePrefix: '23', 
                standardItemBarcodePrefix: '25', 
                purchaseWorkflow: 'direct', 
                roundingDecimals: 2, 
                vatRate: 14,
                inventoryValuationMethod: 'last_purchase',
                showInventoryLosses: true
            };

            setSettings({
                general: {
                    ...defaultGeneral,
                    ...(loadedSettings.general || {}),
                },
                financial: {
                    ...defaultFinancial,
                    ...(loadedSettings.financial || {})
                },
                posSettings: {
                    workDay: loadedSettings.posSettings?.workDay || new Date().toISOString().split('T')[0],
                    scaleItemDefaultFocus: loadedSettings.posSettings?.scaleItemDefaultFocus || 'weight',
                    cartColumns: { 
                        showBarcode: loadedSettings.posSettings?.cartColumns?.showBarcode ?? true,
                        showPrice: loadedSettings.posSettings?.cartColumns?.showPrice ?? true,
                        ...DEFAULT_WIDTHS,
                        ...(loadedSettings.posSettings?.cartColumns || {}),
                    },
                    layout: loadedSettings.posSettings?.layout || { layout: 'cart-left', cartWidth: 40, itemsWidth: 60, groupsPosition: 'left', paymentPosition: 'bottom' },
                    showAllItemsInitially: loadedSettings.posSettings?.showAllItemsInitially || false,
                    autoPrintReceipt: loadedSettings.posSettings?.autoPrintReceipt ?? true,
                    showItemStock: loadedSettings.posSettings?.showItemStock ?? true,
                    defaultApplyTax: loadedSettings.posSettings?.defaultApplyTax ?? false,
                }
            });
        } else {
             const defaultWorkDay = new Date().toISOString().split('T')[0];
                const defaultSettings: Settings = {
                    general: { companyName: '', companyAddress: '', logoUrl: "/logo.png", language: 'ar', mobileFabPosition: 'bottom-right', invoiceFooter: '', desktopLayout: 'sidebar', toastDuration: 5, welcomeMessage: '', isClothingStore: false, licenseKey: '', licenseStatus: 'inactive', showWatermark: false, watermarkOpacity: 0.1 },
                    financial: { openingCapital: 0, fiscalYearStart: '', currency: 'EGP', allowNegativeStock: false, scaleBarcodePrefix: '21', clothingBarcodePrefix: '23', standardItemBarcodePrefix: '25', purchaseWorkflow: 'direct', roundingDecimals: 2, vatRate: 14, inventoryValuationMethod: 'last_purchase', showInventoryLosses: true },
                    posSettings: { 
                        workDay: defaultWorkDay, 
                        scaleItemDefaultFocus: 'weight',
                        cartColumns: { showBarcode: true, showPrice: true, ...DEFAULT_WIDTHS },
                        layout: { layout: 'cart-left', cartWidth: 40, itemsWidth: 60, groupsPosition: 'left', paymentPosition: 'bottom' },
                        showAllItemsInitially: false,
                        autoPrintReceipt: true,
                        showItemStock: true,
                        defaultApplyTax: false,
                    }
                };
                setSettings(defaultSettings);
        }
        setLoading(false);
    }, [allData]);

    const handleSave = async () => {
        if (!settings) return;
        try {
            await dbAction('settings', 'update', { id: 'main', data: settings });
            toast({
                title: "تم الحفظ بنجاح",
                description: "تم تحديث الإعدادات.",
            });
        } catch (error) {
            console.error("Failed to save settings: ", error);
            toast({
                variant: "destructive",
                title: "خطأ",
                description: "فشل حفظ الإعدادات.",
            });
        }
    };
    
    const handleGeneralChange = (field: keyof GeneralSettings, value: any) => {
        setSettings(prev => prev ? { ...prev, general: { ...prev.general, [field]: value } } : null);
    }
    
    const handleFinancialChange = (field: keyof FinancialSettings, value: any) => {
         setSettings(prev => prev ? { ...prev, financial: { ...prev.financial, [field]: value } } : null);
    }
    
    const handlePosSettingsChange = (field: keyof PosSettings, value: any) => {
        setSettings(prev => prev ? { ...prev, posSettings: { ...prev.posSettings, [field]: value } } : null);
    }
    
    const handleCartColumnChange = (field: keyof PosSettings['cartColumns'], value: any) => {
        setSettings(prev => {
            if (!prev) return null;
            return {
                ...prev,
                posSettings: {
                    ...prev.posSettings,
                    cartColumns: {
                        ...prev.posSettings.cartColumns,
                        [field]: value
                    }
                }
            };
        });
    }

    const handleLayoutChange = (field: keyof NonNullable<PosSettings['layout']>, value: any) => {
        setSettings(prev => {
            if (!prev) return null;
            return {
                ...prev,
                posSettings: {
                    ...prev.posSettings,
                    layout: {
                        ...(prev.posSettings.layout || { layout: 'cart-left', cartWidth: 40, itemsWidth: 60, groupsPosition: 'left', paymentPosition: 'bottom' }),
                        [field]: value
                    }
                }
            };
        });
    }

    const handleActivateLicense = async () => {
        const keyToActivate = settings?.general.licenseKey?.trim();
        if (!keyToActivate) {
            toast({ variant: "destructive", title: "خطأ", description: "الرجاء إدخال مفتاح الترخيص أولاً." });
            return;
        }

        const licenseToUpdate = licenses.find((lic: any) => lic.key === keyToActivate);

        if (!licenseToUpdate) {
            toast({ variant: "destructive", title: "مفتاح غير صالح", description: "مفتاح الترخيص غير موجود." });
            return;
        }

        if (licenseToUpdate.status === 'assigned') {
            toast({ variant: "destructive", title: "مفتاح مستخدم", description: "هذا المفتاح تم استخدامه مسبقاً." });
            return;
        }
        
        try {
            await dbAction('licenses', 'update', { 
                id: licenseToUpdate.id, 
                data: { 
                    status: 'assigned', 
                    assignedTo: settings?.general.companyName || 'Unknown Company' 
                }
            });
            
            const updatedGeneralSettings = {
                ...settings!.general,
                licenseStatus: 'active',
            };
            await dbAction('settings', 'update', { id: 'main', data: { general: updatedGeneralSettings }});
            
            toast({ title: "تم التفعيل", description: "تم تفعيل الترخيص بنجاح." });

        } catch (error) {
             toast({ variant: "destructive", title: "خطأ", description: "فشل تفعيل الترخيص." });
        }
    };


    if (loading || dataLoading || !settings) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin"/>
            </div>
        );
    }

  return (
    <>
      <PageHeader title="الإعدادات" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Tabs defaultValue="general">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">إعدادات عامة</TabsTrigger>
            <TabsTrigger value="financial">إعدادات مالية ومخزون</TabsTrigger>
            <TabsTrigger value="pos">إعدادات نقاط البيع</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>إعدادات عامة</CardTitle>
                <CardDescription>
                  تكوين معلومات الشركة واللغة والخيارات العامة الأخرى.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company-name">اسم الشركة</Label>
                  <Input id="company-name" placeholder="أدخل اسم الشركة" value={settings.general.companyName} onChange={e => handleGeneralChange('companyName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-address">عنوان الشركة</Label>
                  <Textarea id="company-address" placeholder="أدخل عنوان الشركة" value={settings.general.companyAddress} onChange={e => handleGeneralChange('companyAddress', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logo-url">رابط شعار الشركة (URL)</Label>
                  <Input id="logo-url" placeholder="مثال: /logo.png" value={settings.general.logoUrl || ''} onChange={e => handleGeneralChange('logoUrl', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="welcome-message">الرسالة الترحيبية</Label>
                  <Textarea id="welcome-message" placeholder="مرحباً بك في نظام الإدارة..." value={settings.general.welcomeMessage || ''} onChange={e => handleGeneralChange('welcomeMessage', e.target.value)} />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="company-footer">تذييل الفاتورة</Label>
                  <Textarea id="company-footer" placeholder="أضف رسالة شكر..." value={settings.general.invoiceFooter || ''} onChange={e => handleGeneralChange('invoiceFooter', e.target.value)} />
                </div>
                 <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="language">اللغة</Label>
                      <Select value={settings.general.language} onValueChange={(value: any) => handleGeneralChange('language', value)}>
                        <SelectTrigger><SelectValue placeholder="اختر اللغة" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ar">العربية</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                     <div className="space-y-2">
                      <Label htmlFor="desktop-layout">تخطيط سطح المكتب</Label>
                      <Select value={settings.general.desktopLayout || 'sidebar'} onValueChange={(value: any) => handleGeneralChange('desktopLayout', value)}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sidebar">الشريط الجانبي</SelectItem>
                          <SelectItem value="menubar">شريط القوائم العلوي</SelectItem>
                           <SelectItem value="modern_hub">المركز العصري</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="toast-duration">مدة ظهور الإشعارات (ثانية)</Label>
                      <Input id="toast-duration" type="number" value={settings.general.toastDuration || 5} onChange={e => handleGeneralChange('toastDuration', parseFloat(e.target.value))} />
                    </div>
                 </div>

                 <div className="pt-4 border-t space-y-4">
                    <h3 className="font-bold flex items-center gap-2 text-primary"><ImageIcon className="h-5 w-5"/> إعدادات العلامة المائية</h3>
                    <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/20">
                        <Label htmlFor="show-watermark">تفعيل العلامة المائية في الفواتير</Label>
                        <Switch id="show-watermark" checked={settings.general.showWatermark} onCheckedChange={checked => handleGeneralChange('showWatermark', checked)} />
                    </div>
                    {settings.general.showWatermark && (
                        <div className="p-4 border rounded-lg space-y-4">
                            <Label>درجة شفافية العلامة المائية: {Math.round((settings.general.watermarkOpacity || 0.1) * 100)}%</Label>
                            <Slider defaultValue={[settings.general.watermarkOpacity || 0.1]} max={0.5} min={0.05} step={0.01} onValueChange={(val) => handleGeneralChange('watermarkOpacity', val[0])}/>
                        </div>
                    )}
                 </div>

                 <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-bold flex items-center gap-2"><Database className="h-4 w-4"/> صيانة البيانات</CardTitle>
                    </CardHeader>
                    <CardFooter>
                        <Link href="/settings/re-engineer" className="w-full">
                            <Button variant="outline" className="w-full border-primary/50 hover:bg-primary/10">إعادة هندسة وتنظيم قاعدة البيانات</Button>
                        </Link>
                    </CardFooter>
                 </Card>

                 <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label htmlFor="is-clothing-store">تفعيل وضع محلات الملابس</Label>
                  </div>
                  <Switch id="is-clothing-store" checked={settings.general.isClothingStore} onCheckedChange={checked => handleGeneralChange('isClothingStore', checked)} />
                </div>
                 <Card>
                    <CardHeader><CardTitle>الترخيص وحالة البرنامج</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                         <div className="space-y-2">
                            <Label htmlFor="licenseKey">مفتاح الترخيص</Label>
                            <div className="flex gap-2">
                                <Input id="licenseKey" value={settings.general.licenseKey || ''} onChange={e => handleGeneralChange('licenseKey', e.target.value)} placeholder="أدخل مفتاح الترخيص..." className="font-mono text-left" dir="ltr"/>
                                <Button onClick={handleActivateLicense}>تفعيل</Button>
                            </div>
                        </div>
                    </CardContent>
                 </Card>
              </CardContent>
              <CardFooter>
                <Button onClick={handleSave}>حفظ التغييرات</Button>
              </CardFooter>
            </Card>
          </TabsContent>
          <TabsContent value="financial">
            <Card>
              <CardHeader>
                <CardTitle>إعدادات مالية ومخزون</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currency">العملة</Label>
                      <Select value={settings.financial.currency} onValueChange={(value: any) => handleFinancialChange('currency', value)}>
                        <SelectTrigger><SelectValue placeholder="اختر العملة" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EGP">الجنيه المصري</SelectItem>
                          <SelectItem value="SAR">الريال السعودي</SelectItem>
                          <SelectItem value="USD">الدولار الأمريكي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="vat-rate">نسبة ضريبة القيمة المضافة (%)</Label>
                        <Input id="vat-rate" type="number" value={settings.financial.vatRate || 14} onChange={e => handleFinancialChange('vatRate', Number(e.target.value))} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="valuation-method">طريقة احتساب تكلفة المخزون</Label>
                        <Select value={settings.financial.inventoryValuationMethod} onValueChange={(value: any) => handleFinancialChange('inventoryValuationMethod', value)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="average">متوسط التكلفة</SelectItem>
                                <SelectItem value="last_purchase">آخر سعر شراء</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label htmlFor="allow-negative-stock">السماح بالبيع بالرصيد السالب</Label>
                  </div>
                  <Switch id="allow-negative-stock" checked={settings.financial.allowNegativeStock} onCheckedChange={checked => handleFinancialChange('allowNegativeStock', checked)} />
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={handleSave}>حفظ التغييرات</Button>
              </CardFooter>
            </Card>
          </TabsContent>
           <TabsContent value="pos">
            <Card>
              <CardHeader><CardTitle>إعدادات نقاط البيع</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                 <div className="space-y-2">
                  <Label htmlFor="work-day">يوم العمل الحالي</Label>
                  <Input id="work-day" type="date" value={settings.posSettings?.workDay || ''} onChange={e => handlePosSettingsChange('workDay', e.target.value)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5"><Label htmlFor="auto-print">طباعة الإيصال تلقائياً</Label></div>
                  <Switch id="auto-print" checked={settings.posSettings.autoPrintReceipt} onCheckedChange={checked => handlePosSettingsChange('autoPrintReceipt', checked)} />
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={handleSave}>حفظ التغييرات</Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
