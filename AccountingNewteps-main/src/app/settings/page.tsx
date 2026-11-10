"use client"

import React, { useState, useEffect } from "react";
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
import { Loader2, Bell, BellRing, Image as ImageIcon, Database, CheckCircle2 } from "lucide-react";
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
                description: "تم تحديث وحفظ كافة الإعدادات بنجاح.",
            });
        } catch (error) {
            console.error("Failed to save settings: ", error);
            toast({
                variant: "destructive",
                title: "خطأ",
                description: "فشل حفظ الإعدادات. يرجى المحاولة مرة أخرى.",
            });
        }
    };
    
    const handleGeneralChange = (field: keyof GeneralSettings, value: any) => {
        setSettings(prev => prev ? { ...prev, general: { ...prev.general, [field]: value } } : null);
    };
    
    const handleFinancialChange = (field: keyof FinancialSettings, value: any) => {
         setSettings(prev => prev ? { ...prev, financial: { ...prev.financial, [field]: value } } : null);
    };
    
    const handlePosSettingsChange = (field: keyof PosSettings, value: any) => {
        setSettings(prev => prev ? { ...prev, posSettings: { ...prev.posSettings, [field]: value } } : null);
    };
    
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
    };

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
    };

    const handleActivateLicense = async () => {
        const keyToActivate = settings?.general.licenseKey?.trim();
        if (!keyToActivate) {
            toast({ variant: "destructive", title: "خطأ", description: "الرجاء إدخال مفتاح الترخيص أولاً." });
            return;
        }

        const licenseToUpdate = licenses.find((lic: any) => lic.key === keyToActivate);

        if (!licenseToUpdate) {
            toast({ variant: "destructive", title: "مفتاح غير صالح", description: "مفتاح الترخيص الذي أدخلته غير موجود." });
            return;
        }

        if (licenseToUpdate.status === 'assigned') {
            toast({ variant: "destructive", title: "مفتاح مستخدم", description: "هذا المفتاح تم استخدامه وتعيينه لعميل آخر بالفعل." });
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
                licenseStatus: 'active' as const,
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
      <PageHeader title="الإعدادات العامة والتشغيلية" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">إعدادات عامة</TabsTrigger>
            <TabsTrigger value="financial">إعدادات مالية ومخزون</TabsTrigger>
            <TabsTrigger value="pos">إعدادات نقاط البيع</TabsTrigger>
          </TabsList>

          {/* ======================= الإعدادات العامة ======================= */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>إعدادات عامة ومعلومات المنشأة</CardTitle>
                <CardDescription>
                  تكوين معلومات الشركة واللغة والخيارات العامة وواجهة الاستخدام.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company-name">اسم الشركة / المنشأة</Label>
                  <Input id="company-name" placeholder="أدخل اسم الشركة" value={settings.general.companyName} onChange={e => handleGeneralChange('companyName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-address">عنوان الشركة</Label>
                  <Textarea id="company-address" placeholder="أدخل عنوان الشركة" value={settings.general.companyAddress} onChange={e => handleGeneralChange('companyAddress', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logo-url">رابط شعار الشركة (URL)</Label>
                  <Input id="logo-url" placeholder="مثال: /logo.png" value={settings.general.logoUrl || ''} onChange={e => handleGeneralChange('logoUrl', e.target.value)} />
                  <p className="text-xs text-muted-foreground">افتراضياً يستخدم النظام الملف المرفوع في Public باسم logo.png. يمكنك تغيير المسار هنا.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="welcome-message">الرسالة الترحيبية</Label>
                  <Textarea id="welcome-message" placeholder="مرحباً بك في نظام الإدارة..." value={settings.general.welcomeMessage || ''} onChange={e => handleGeneralChange('welcomeMessage', e.target.value)} />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="company-footer">تذييل الفاتورة المطبوعة</Label>
                  <Textarea id="company-footer" placeholder="أضف رسالة شكر أو معلومات إضافية تظهر في نهاية كل فاتورة..." value={settings.general.invoiceFooter || ''} onChange={e => handleGeneralChange('invoiceFooter', e.target.value)} />
                </div>
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="language">اللغة</Label>
                      <Select value={settings.general.language} onValueChange={(value: GeneralSettings['language']) => handleGeneralChange('language', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر اللغة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ar">العربية</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                     <div className="space-y-2">
                      <Label htmlFor="fab-position">موضع زر القائمة (موبايل)</Label>
                      <Select value={settings.general.mobileFabPosition || 'bottom-right'} onValueChange={(value: GeneralSettings['mobileFabPosition']) => handleGeneralChange('mobileFabPosition', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر الموضع" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bottom-right">أسفل اليمين</SelectItem>
                          <SelectItem value="top-right">أعلى اليمين</SelectItem>
                          <SelectItem value="middle-right">وسط اليمين</SelectItem>
                          <SelectItem value="bottom-left">أسفل اليسار</SelectItem>
                          <SelectItem value="top-left">أعلى اليسار</SelectItem>
                          <SelectItem value="middle-left">وسط اليسار</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                     <div className="space-y-2">
                      <Label htmlFor="desktop-layout">تخطيط سطح المكتب</Label>
                      <Select value={settings.general.desktopLayout || 'sidebar'} onValueChange={(value: GeneralSettings['desktopLayout']) => handleGeneralChange('desktopLayout', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر التخطيط" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sidebar">الشريط الجانبي (قابل للطي)</SelectItem>
                          <SelectItem value="menubar">شريط القوائم العلوي</SelectItem>
                           <SelectItem value="modern_hub">المركز العصري (واجهة البطاقات)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="toast-duration">مدة ظهور الإشعارات (بالثواني)</Label>
                      <Input id="toast-duration" type="number" placeholder="5" value={settings.general.toastDuration || 5} onChange={e => handleGeneralChange('toastDuration', parseFloat(e.target.value))} step="0.1" />
                    </div>
                 </div>

                 {/* العلامة المائية */}
                 <div className="pt-4 border-t space-y-4">
                    <h3 className="font-bold flex items-center gap-2 text-primary"><ImageIcon className="h-5 w-5"/> إعدادات العلامة المائية (Logo Watermark)</h3>
                    <div className="flex items-center justify-between rounded-lg border p-4 shadow-sm bg-muted/20">
                        <div className="space-y-0.5">
                            <Label htmlFor="show-watermark">تفعيل العلامة المائية في الفواتير</Label>
                            <p className="text-xs text-muted-foreground">
                                إظهار شعار الشركة بشكل باهت في خلفية فواتير A4 وإيصالات الكاشير.
                            </p>
                        </div>
                        <Switch id="show-watermark" checked={settings.general.showWatermark} onCheckedChange={checked => handleGeneralChange('showWatermark', checked)} />
                    </div>
                    {settings.general.showWatermark && (
                        <div className="p-4 border rounded-lg space-y-4 animate-in fade-in slide-in-from-top-1">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label>درجة شفافية العلامة المائية: {Math.round((settings.general.watermarkOpacity || 0.1) * 100)}%</Label>
                                    <span className="text-xs text-muted-foreground">ينصح بـ 10% للوضوح الأمثل</span>
                                </div>
                                <Slider 
                                    defaultValue={[settings.general.watermarkOpacity || 0.1]} 
                                    max={0.5} 
                                    min={0.05} 
                                    step={0.01} 
                                    onValueChange={(val) => handleGeneralChange('watermarkOpacity', val[0])}
                                />
                            </div>
                        </div>
                    )}
                 </div>

                 {/* وضع محلات الملابس */}
                 <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label htmlFor="is-clothing-store">تفعيل وضع محلات الملابس</Label>
                     <p className="text-xs text-muted-foreground">
                      إظهار حقول اللون والمقاس في شاشة الأصناف وتفعيل نظام باركود EAN-13 المخصص.
                    </p>
                  </div>
                  <Switch id="is-clothing-store" checked={settings.general.isClothingStore} onCheckedChange={checked => handleGeneralChange('isClothingStore', checked)} />
                </div>

                 {/* الترخيص */}
                 <Card>
                    <CardHeader>
                        <CardTitle>الترخيص وحالة البرنامج</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="space-y-2">
                            <Label htmlFor="licenseKey">مفتاح الترخيص</Label>
                            <div className="flex gap-2">
                                <Input id="licenseKey" value={settings.general.licenseKey || ''} onChange={e => handleGeneralChange('licenseKey', e.target.value)} placeholder="أدخل مفتاح الترخيص هنا..." className="font-mono text-left tracking-widest" dir="ltr"/>
                                <Button onClick={handleActivateLicense}>تفعيل</Button>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                            <span className="text-muted-foreground">حالة الترخيص:</span>
                            <span className={cn("font-bold px-2 py-0.5 rounded text-xs", {
                                'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400': settings.general.licenseStatus === 'active',
                                'bg-destructive/10 text-destructive': settings.general.licenseStatus === 'inactive' || settings.general.licenseStatus === 'expired',
                            })}>
                                {settings.general.licenseStatus === 'active' ? 'فعال ومفعل' : (settings.general.licenseStatus === 'expired' ? 'منتهي الصلاحية' : 'غير مرخص')}
                            </span>
                        </div>
                    </CardContent>
                 </Card>

                 {/* إشعارات المبيعات داخل التطبيق */}
                 <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="notifications-toggle">إشعارات المبيعات داخل التطبيق</Label>
                      {notificationsEnabled ? <BellRing className="h-4 w-4 text-primary" /> : <Bell className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      عرض إشعارات فورية عند حدوث عملية بيع أثناء استخدام البرنامج.
                    </p>
                  </div>
                  <Switch 
                    id="notifications-toggle" 
                    checked={notificationsEnabled} 
                    onCheckedChange={toggleNotifications}
                  />
                 </div>

                 {/* صيانة وتنظيم قاعدة البيانات */}
                 <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-bold flex items-center gap-2"><Database className="h-4 w-4 text-primary"/> صيانة وتنظيم قاعدة البيانات</CardTitle>
                        <CardDescription className="text-xs">
                            إعادة بناء الفهارس وضبط هياكل الجداول لضمان سرعة لحظية وتناسق البيانات.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Link href="/settings/re-engineer" className="w-full">
                            <Button variant="outline" className="w-full border-primary/50 hover:bg-primary/10">إعادة هندسة وتنظيم قاعدة البيانات</Button>
                        </Link>
                    </CardFooter>
                 </Card>

              </CardContent>
              <CardFooter>
                <Button onClick={handleSave}>حفظ التغييرات</Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* ======================= الإعدادات المالية والمخزون ======================= */}
          <TabsContent value="financial">
            <Card>
              <CardHeader>
                <CardTitle>إعدادات مالية ومخزون</CardTitle>
                <CardDescription>
                  إدارة الإعدادات المتعلقة بالمحاسبة والمالية والمخزون والباركود.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="space-y-2">
                  <Label htmlFor="opening-capital">رأس مال أول الفترة</Label>
                  <Input id="opening-capital" type="number" placeholder="أدخل رأس مال أول الفترة" value={settings.financial.openingCapital} onChange={e => handleFinancialChange('openingCapital', Number(e.target.value))} />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currency">العملة الأساسية</Label>
                      <Select value={settings.financial.currency} onValueChange={(value: FinancialSettings['currency']) => handleFinancialChange('currency', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر العملة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EGP">الجنيه المصري (EGP)</SelectItem>
                          <SelectItem value="SAR">الريال السعودي (SAR)</SelectItem>
                          <SelectItem value="USD">الدولار الأمريكي (USD)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="vat-rate">نسبة ضريبة القيمة المضافة (%)</Label>
                        <Input id="vat-rate" type="number" placeholder="مثال: 14" value={settings.financial.vatRate || 14} onChange={e => handleFinancialChange('vatRate', Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fiscal-year-start">بداية السنة المالية</Label>
                      <Input id="fiscal-year-start" type="date" value={settings.financial.fiscalYearStart} onChange={e => handleFinancialChange('fiscalYearStart', e.target.value)} />
                    </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                     <div className="space-y-2">
                        <Label htmlFor="valuation-method">طريقة احتساب تكلفة المخزون</Label>
                        <Select value={settings.financial.inventoryValuationMethod} onValueChange={(value: any) => handleFinancialChange('inventoryValuationMethod', value)}>
                            <SelectTrigger id="valuation-method">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="average">متوسط التكلفة (Moving Average)</SelectItem>
                                <SelectItem value="last_purchase">آخر سعر شراء</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">المتوسط يحسب بناءً على (الرصيد الحالي * التكلفة الحالية + الكمية الجديدة * السعر الجديد) / الرصيد الكلي.</p>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="standard-prefix">بادئة باركود الأصناف العادية</Label>
                        <Input id="standard-prefix" type="text" placeholder="مثال: 25" maxLength={2} value={settings.financial.standardItemBarcodePrefix || '25'} onChange={e => handleFinancialChange('standardItemBarcodePrefix', e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="scale-prefix">بادئة باركود الميزان</Label>
                        <Input id="scale-prefix" type="text" placeholder="مثال: 21" value={settings.financial.scaleBarcodePrefix || '21'} onChange={e => handleFinancialChange('scaleBarcodePrefix', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="clothing-prefix">بادئة باركود الملابس</Label>
                        <Input id="clothing-prefix" type="text" placeholder="مثال: 23" value={settings.financial.clothingBarcodePrefix || '23'} onChange={e => handleFinancialChange('clothingBarcodePrefix', e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="purchase-workflow">آلية استلام المشتريات</Label>
                        <Select value={settings.financial.purchaseWorkflow || 'direct'} onValueChange={(value: FinancialSettings['purchaseWorkflow']) => handleFinancialChange('purchaseWorkflow', value)}>
                            <SelectTrigger id="purchase-workflow">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="manual">يدوي (تحويل إلى بضاعة بالطريق)</SelectItem>
                                <SelectItem value="direct">تلقائي (استلام مباشر في المخزن)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="rounding-decimals">خانات التقريب العشرية</Label>
                        <Input id="rounding-decimals" type="number" placeholder="مثال: 2" value={settings.financial.roundingDecimals ?? 2} onChange={e => handleFinancialChange('roundingDecimals', Number(e.target.value))} />
                    </div>
                  </div>
                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label htmlFor="allow-negative-stock">السماح بالبيع بالرصيد السالب</Label>
                     <p className="text-xs text-muted-foreground">
                      السماح بإنشاء فواتير بيع حتى لو كان رصيد الصنف صفر أو أقل.
                    </p>
                  </div>
                  <Switch id="allow-negative-stock" checked={settings.financial.allowNegativeStock} onCheckedChange={checked => handleFinancialChange('allowNegativeStock', checked)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label htmlFor="show-inventory-losses">إظهار خسائر تسوية المخزون في قائمة الدخل</Label>
                     <p className="text-xs text-muted-foreground">
                      عند التفعيل، سيتم خصم خسائر عجز الجرد من صافي الربح في التقارير المالية.
                    </p>
                  </div>
                  <Switch id="show-inventory-losses" checked={settings.financial.showInventoryLosses ?? true} onCheckedChange={checked => handleFinancialChange('showInventoryLosses', checked)} />
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={handleSave}>حفظ التغييرات</Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* ======================= إعدادات نقاط البيع والكاشير ======================= */}
          <TabsContent value="pos">
            <Card>
              <CardHeader>
                <CardTitle>إعدادات نقاط البيع والكاشير</CardTitle>
                <CardDescription>
                  إدارة الإعدادات الخاصة بنظام الكاشير ويوم العمل وتخطيط الشاشة وسلة المبيعات.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="space-y-2">
                  <Label htmlFor="work-day">يوم العمل الحالي</Label>
                  <Input id="work-day" type="date" value={settings.posSettings?.workDay || ''} onChange={e => handlePosSettingsChange('workDay', e.target.value)} />
                   <p className="text-xs text-muted-foreground">هذا التاريخ يستخدم لتوليد أرقام فواتير الكاشير ويتحدث تلقائياً عند إقفال اليومية.</p>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="scale-item-focus">التركيز التلقائي في شاشة الصنف الموزون</Label>
                    <Select value={settings.posSettings.scaleItemDefaultFocus || 'weight'} onValueChange={(value: PosSettings['scaleItemDefaultFocus']) => handlePosSettingsChange('scaleItemDefaultFocus', value)}>
                        <SelectTrigger id="scale-item-focus">
                            <SelectValue placeholder="اختر الحقل" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="weight">التركيز على حقل الوزن</SelectItem>
                            <SelectItem value="price">التركيز على حقل السعر</SelectItem>
                        </SelectContent>
                    </Select>
                     <p className="text-xs text-muted-foreground">يحدد الحقل الذي سيتم التركيز عليه تلقائيًا عند إدخال صنف يتطلب وزنًا.</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-print">طباعة الإيصال تلقائياً</Label>
                    <p className="text-xs text-muted-foreground">
                      بدء عملية الطباعة فور حفظ الفاتورة.
                    </p>
                  </div>
                  <Switch id="auto-print" checked={settings.posSettings.autoPrintReceipt} onCheckedChange={checked => handlePosSettingsChange('autoPrintReceipt', checked)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label htmlFor="default-apply-tax">تفعيل الضريبة تلقائياً</Label>
                    <p className="text-xs text-muted-foreground">
                      تفعيل خيار الضريبة بشكل افتراضي عند فتح شاشة المبيعات.
                    </p>
                  </div>
                  <Switch id="default-apply-tax" checked={settings.posSettings.defaultApplyTax} onCheckedChange={checked => handlePosSettingsChange('defaultApplyTax', checked)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                        <Label htmlFor="showAllItemsInitially">عرض كل الأصناف عند بدء الكاشير</Label>
                        <p className="text-xs text-muted-foreground">
                        عند تفعيل هذا الخيار، ستظهر جميع الأصناف في الشبكة عند فتح شاشة الكاشير.
                        </p>
                    </div>
                    <Switch id="showAllItemsInitially" checked={settings.posSettings.showAllItemsInitially} onCheckedChange={checked => handlePosSettingsChange('showAllItemsInitially', checked)} />
                </div>
                 <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                        <Label htmlFor="showItemStock">إظهار الرصيد المتاح على بطاقة الصنف</Label>
                        <p className="text-xs text-muted-foreground">
                            عرض الكمية المتاحة كشارة صغيرة على كل صنف في شبكة العرض.
                        </p>
                    </div>
                    <Switch id="showItemStock" checked={settings.posSettings.showItemStock ?? true} onCheckedChange={checked => handlePosSettingsChange('showItemStock', checked)} />
                </div>
                 
                 {/* إعدادات سلة المبيعات */}
                 <div>
                    <h3 className="text-sm font-semibold mb-2 pt-4 text-primary">إعدادات سلة المبيعات والأعمدة</h3>
                    <div className="space-y-3 rounded-lg border p-4 bg-muted/10">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="show-barcode">إظهار عمود باركود الصنف</Label>
                            <Switch id="show-barcode" checked={settings.posSettings.cartColumns?.showBarcode} onCheckedChange={checked => handleCartColumnChange('showBarcode', checked)} />
                        </div>
                         <div className="flex items-center justify-between">
                            <Label htmlFor="show-price">إظهار عمود سعر الوحدة</Label>
                            <Switch id="show-price" checked={settings.posSettings.cartColumns?.showPrice} onCheckedChange={checked => handleCartColumnChange('showPrice', checked)} />
                        </div>
                        <div className="space-y-2 pt-2">
                            <Label>عرض الأعمدة (%)</Label>
                             <div className="grid grid-cols-5 gap-2">
                                <div className="space-y-1 text-center"><Label className="text-xs">الصنف</Label><Input type="number" value={settings.posSettings.cartColumns.widthName} onChange={e => handleCartColumnChange('widthName', Number(e.target.value))} /></div>
                                <div className="space-y-1 text-center"><Label className="text-xs">الباركود</Label><Input type="number" value={settings.posSettings.cartColumns.widthBarcode} onChange={e => handleCartColumnChange('widthBarcode', Number(e.target.value))} disabled={!settings.posSettings.cartColumns.showBarcode} /></div>
                                <div className="space-y-1 text-center"><Label className="text-xs">السعر</Label><Input type="number" value={settings.posSettings.cartColumns.widthPrice} onChange={e => handleCartColumnChange('widthPrice', Number(e.target.value))} disabled={!settings.posSettings.cartColumns.showPrice}/></div>
                                <div className="space-y-1 text-center"><Label className="text-xs">الكمية</Label><Input type="number" value={settings.posSettings.cartColumns.widthQty} onChange={e => handleCartColumnChange('widthQty', Number(e.target.value))} /></div>
                                <div className="space-y-1 text-center"><Label className="text-xs">الإجمالي</Label><Input type="number" value={settings.posSettings.cartColumns.widthTotal} onChange={e => handleCartColumnChange('widthTotal', Number(e.target.value))} /></div>
                            </div>
                            <p className="text-xs text-muted-foreground">مجموع النسب يجب أن يكون قريباً من 100% لتوزيع مثالي.</p>
                        </div>
                    </div>
                </div>

                 {/* إعدادات تخطيط الشاشة */}
                 <div>
                    <h3 className="text-sm font-semibold mb-2 pt-4 text-primary">إعدادات تخطيط الشاشة</h3>
                    <div className="space-y-3 rounded-lg border p-4 bg-muted/10">
                         <div className="space-y-2">
                            <Label htmlFor="layout-select">موضع سلة المبيعات (حاسوب)</Label>
                            <Select value={settings.posSettings.layout?.layout || 'cart-left'} onValueChange={(value: any) => handleLayoutChange('layout', value)}>
                                <SelectTrigger id="layout-select"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cart-left">السلة على اليمين</SelectItem>
                                    <SelectItem value="cart-right">السلة على اليسار</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="groups-position-select">موضع عمود المجموعات (حاسوب)</Label>
                            <Select value={settings.posSettings.layout?.groupsPosition || 'left'} onValueChange={(value: any) => handleLayoutChange('groupsPosition', value)}>
                                <SelectTrigger id="groups-position-select"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="left">يسار شبكة الأصناف</SelectItem>
                                    <SelectItem value="right">يمين شبكة الأصناف</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="payment-position-select">موضع قسم الدفع (موبايل)</Label>
                            <Select value={settings.posSettings.layout?.paymentPosition || 'bottom'} onValueChange={(value: any) => handleLayoutChange('paymentPosition', value)}>
                                <SelectTrigger id="payment-position-select"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="bottom">أسفل الشاشة</SelectItem>
                                    <SelectItem value="top">أعلى الشاشة</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label>عرض السلة (%)</Label>
                                <Input type="number" value={settings.posSettings.layout?.cartWidth || 40} onChange={e => handleLayoutChange('cartWidth', Number(e.target.value))} />
                            </div>
                             <div className="space-y-2">
                                <Label>عرض منطقة الأصناف (%)</Label>
                                <Input type="number" value={settings.posSettings.layout?.itemsWidth || 60} onChange={e => handleLayoutChange('itemsWidth', Number(e.target.value))} />
                            </div>
                         </div>
                         <p className="text-xs text-muted-foreground">مجموع النسب يجب أن يكون 100%.</p>
                    </div>
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
