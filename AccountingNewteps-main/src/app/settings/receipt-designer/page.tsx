
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { PosReceipt, DEFAULT_RECEIPT_SECTION_ORDER } from '@/components/pos-receipt';
import { KitchenReceipt } from '@/components/kitchen-receipt';
import { useData } from '@/contexts/data-provider';
import { Combobox } from '@/components/ui/combobox';
import { useAuth } from '@/contexts/auth-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


interface BaseReceiptSettings {
    id?: string;
    receiptWidth: number;
    showLogo: boolean;
    logoUrl: string;
    showCompanyName: boolean;
    showAddress: boolean;
    showPhoneNumber: boolean;
    showCashier: boolean;
}

interface PosReceiptSettings extends BaseReceiptSettings {
    showTax: boolean;
    showDiscount: boolean;
    showBarcode: boolean;
    showCode: boolean;
    showItemPrice: boolean;
    showInvoiceNumber: boolean;
    showCustomerName: boolean;
    showCustomerPhone: boolean;
    showEInvoiceQr?: boolean;
    sectionOrder?: string[];
    fontSizes: {
        companyName: number;
        header: number;
        items: number;
        totals: number;
        barcode: number;
    };
}

interface KitchenReceiptSettings {
    receiptWidth: number;
    showOrderReference: boolean;
    showCustomerName: boolean;
    showCashierName: boolean;
    showDateTime: boolean;
    fontSizes: {
        header: number;
        items: number;
    };
}


const DEFAULT_POS_SETTINGS: PosReceiptSettings = {
    receiptWidth: 72,
    showLogo: true,
    logoUrl: "https://placehold.co/100x100.png",
    showCompanyName: true,
    showAddress: true,
    showPhoneNumber: true,
    showCashier: true,
    showTax: true,
    showDiscount: true,
    showItemPrice: true,
    showInvoiceNumber: true,
    showBarcode: true,
    showCode: true,
    showCustomerName: true,
    showCustomerPhone: true,
    showEInvoiceQr: true,
    sectionOrder: [...DEFAULT_RECEIPT_SECTION_ORDER],
    fontSizes: {
        companyName: 16,
        header: 12,
        items: 10,
        totals: 11,
        barcode: 12,
    }
}

const DEFAULT_KITCHEN_SETTINGS: KitchenReceiptSettings = {
    receiptWidth: 72,
    showOrderReference: true,
    showCustomerName: false,
    showCashierName: true,
    showDateTime: true,
    fontSizes: {
        header: 14,
        items: 16,
    }
}


const SAMPLE_INVOICE = {
    invoiceNumber: "POS-00123",
    date: new Date().toISOString(),
    cashierName: "أحمد علي",
    orderReference: "T-5",
    items: [
        { name: "صنف افتراضي 1", qty: 2, price: 15.00, total: 30.00 },
        { name: "صنف طويل جدا لاختبار التفاف النص", qty: 1, price: 25.50, total: 25.50 },
        { name: "صنف 3", qty: 3, price: 10.00, total: 30.00 },
    ],
    subtotal: 85.50,
    discount: 5.50,
    tax: 11.20,
    total: 91.20,
    paidAmount: 100.00,
    change: 8.80
}

const SAMPLE_CUSTOMER = {
    name: "عميل افتراضي",
    phone: "01234567890",
    address: "123 شارع المثال، مدينة نصر، القاهرة"
};

const SettingsToggle = ({ id, label, checked, onCheckedChange }: { id: string, label: string, checked: boolean, onCheckedChange: (checked: boolean) => void }) => (
    <div className="flex items-center justify-between">
        <Label htmlFor={id} className="cursor-pointer">{label}</Label>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
);


const FontSizeControl = ({ label, value, onChange }: { label: string, value: number, onChange: (value: number) => void }) => (
    <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Input type="number" value={value} onChange={e => onChange(Number(e.target.value))} className="w-20 h-8 text-center" />
    </div>
)


export default function ReceiptDesignerPage() {
    const { settings: allData, dbAction, loading: dataLoading, warehouses } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    
    const [posDesign, setPosDesign] = useState<PosReceiptSettings>(DEFAULT_POS_SETTINGS);
    const [kitchenDesign, setKitchenDesign] = useState<KitchenReceiptSettings>(DEFAULT_KITCHEN_SETTINGS);

    const [loading, setLoading] = useState(true);
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
    
    useEffect(() => {
        if (user && user.warehouseIds && user.warehouseIds.length === 1 && user.warehouseIds[0] !== 'all') {
            setSelectedWarehouseId(user.warehouseIds[0]);
        } else if (!selectedWarehouseId && warehouses && warehouses.length > 0) {
            setSelectedWarehouseId(warehouses[0].id);
        }
    }, [user, warehouses, selectedWarehouseId]);

    useEffect(() => {
        if (!selectedWarehouseId) {
            setPosDesign(DEFAULT_POS_SETTINGS);
            setKitchenDesign(DEFAULT_KITCHEN_SETTINGS);
            setLoading(false);
            return;
        }
        
        const posReceiptsData = allData?.main?.posReceipts?.[selectedWarehouseId] || {};
        const kitchenReceiptsData = allData?.main?.kitchenReceipts?.[selectedWarehouseId] || {};
        
        setPosDesign({ ...DEFAULT_POS_SETTINGS, ...posReceiptsData });
        setKitchenDesign({ ...DEFAULT_KITCHEN_SETTINGS, ...kitchenReceiptsData });

        setLoading(false);
    }, [selectedWarehouseId, allData]);


    const handleSave = async () => {
         if (!selectedWarehouseId) {
            toast({ variant: "destructive", title: "لم يتم تحديد الفرع", description: "الرجاء اختيار فرع لحفظ التصميم له." });
            return;
        }
        setLoading(true);
        try {
            const currentPosReceipts = allData?.main?.posReceipts || {};
            const currentKitchenReceipts = allData?.main?.kitchenReceipts || {};
            
            const updatedPosReceipts = { ...currentPosReceipts, [selectedWarehouseId]: posDesign };
            const updatedKitchenReceipts = { ...currentKitchenReceipts, [selectedWarehouseId]: kitchenDesign };
            
            await dbAction('settings', 'update', { id: 'main', data: { 
                posReceipts: updatedPosReceipts,
                kitchenReceipts: updatedKitchenReceipts,
            }});
            toast({ title: 'تم الحفظ', description: `تم تحديث تصميمات إيصالات الفرع المحدد.` });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ التصميم.' });
        } finally {
            setLoading(false);
        }
    };
    
    const sectionLabels: Record<string, string> = {
        logo: 'الشعار',
        companyInfo: 'اسم الشركة والعنوان والهاتف',
        barcode: 'الباركود (صورة ورقم)',
        invoiceMeta: 'بيانات الفاتورة والعميل والكاشير',
        items: 'جدول الأصناف',
        totals: 'الإجماليات والخصم والضريبة',
        qr: 'رمز QR الإيصال الإلكتروني',
        footer: 'نص التذييل (الخاتمة)',
    };

    const currentSectionOrder = useMemo(() => {
        const saved: string[] = Array.isArray(posDesign.sectionOrder) ? posDesign.sectionOrder : [];
        const validSaved = saved.filter((k) => (DEFAULT_RECEIPT_SECTION_ORDER as readonly string[]).includes(k));
        const missing = DEFAULT_RECEIPT_SECTION_ORDER.filter((k) => !validSaved.includes(k));
        return [...validSaved, ...missing];
    }, [posDesign.sectionOrder]);

    const moveSection = (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= currentSectionOrder.length) return;
        const nextOrder = [...currentSectionOrder];
        const [moved] = nextOrder.splice(index, 1);
        nextOrder.splice(targetIndex, 0, moved);
        setPosDesign((p) => ({ ...p, sectionOrder: nextOrder }));
    };

    const companySettings = allData?.main?.general || {};
    const warehouseOptions = useMemo(() => warehouses.map((w: any) => ({ value: w.id, label: w.name })), [warehouses]);


    if (dataLoading) {
        return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <>
            <PageHeader title="مصمم الإيصالات">
                 <Button onClick={handleSave} disabled={loading}>
                    {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                    <Save className="ml-2 h-4 w-4" />
                    حفظ التصميمات لهذا الفرع
                </Button>
            </PageHeader>
            <main className="flex flex-col md:flex-row h-[calc(100vh-120px)] p-4 md:p-6 gap-4">
                <Card className="w-full md:w-1/3 lg:w-1/4 flex flex-col flex-none overflow-y-auto">
                    <CardHeader>
                         <div className="space-y-2">
                             <Label>تطبيق الإعدادات على الفرع</Label>
                             <Combobox
                                options={warehouseOptions}
                                value={selectedWarehouseId}
                                onValueChange={setSelectedWarehouseId}
                                placeholder="اختر فرعًا..."
                                emptyMessage="لم يتم العثور على فروع."
                                disabled={!!(user && user.warehouseIds && user.warehouseIds.length === 1 && user.warehouseIds[0] !== 'all')}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                        {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto"/> : selectedWarehouseId ? (
                         <Tabs defaultValue="pos-receipt">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="pos-receipt">إيصال الكاشير</TabsTrigger>
                                <TabsTrigger value="kitchen-receipt">إيصال المطبخ</TabsTrigger>
                            </TabsList>
                            <TabsContent value="pos-receipt">
                                <Accordion type="multiple" defaultValue={['item-1']} className="w-full">
                                    <AccordionItem value="item-1">
                                        <AccordionTrigger>الأساسيات</AccordionTrigger>
                                        <AccordionContent className="space-y-4 pt-4">
                                            <div className="space-y-2"><Label>عرض الإيصال (mm)</Label><Input type="number" value={posDesign.receiptWidth} onChange={e => setPosDesign(p => ({...p, receiptWidth: Number(e.target.value)}))} /></div>
                                            <div className="space-y-2"><Label>رابط الشعار</Label><Input value={posDesign.logoUrl} onChange={e => setPosDesign(p => ({...p, logoUrl: e.target.value}))} /></div>
                                        </AccordionContent>
                                    </AccordionItem>
                                    <AccordionItem value="item-2">
                                        <AccordionTrigger>إظهار/إخفاء</AccordionTrigger>
                                        <AccordionContent className="space-y-3 pt-4">
                                            <SettingsToggle id="pos-show-logo" label="الشعار" checked={posDesign.showLogo} onCheckedChange={v => setPosDesign(p => ({...p, showLogo: v}))} />
                                            <SettingsToggle id="pos-show-company" label="اسم الشركة" checked={posDesign.showCompanyName} onCheckedChange={v => setPosDesign(p => ({...p, showCompanyName: v}))} />
                                            <SettingsToggle id="pos-show-address" label="العنوان" checked={posDesign.showAddress} onCheckedChange={v => setPosDesign(p => ({...p, showAddress: v}))} />
                                            <SettingsToggle id="pos-show-phone" label="رقم الهاتف" checked={posDesign.showPhoneNumber} onCheckedChange={v => setPosDesign(p => ({...p, showPhoneNumber: v}))} />
                                            <SettingsToggle id="pos-show-cashier" label="اسم الكاشير" checked={posDesign.showCashier} onCheckedChange={v => setPosDesign(p => ({...p, showCashier: v}))} />
                                            <SettingsToggle id="pos-show-customer" label="اسم العميل" checked={posDesign.showCustomerName} onCheckedChange={v => setPosDesign(p => ({...p, showCustomerName: v}))} />
                                            <SettingsToggle id="pos-show-customer-phone" label="هاتف العميل" checked={posDesign.showCustomerPhone} onCheckedChange={v => setPosDesign(p => ({...p, showCustomerPhone: v}))} />
                                            <SettingsToggle id="pos-show-discount" label="الخصم" checked={posDesign.showDiscount} onCheckedChange={v => setPosDesign(p => ({...p, showDiscount: v}))} />
                                            <SettingsToggle id="pos-show-tax" label="الضريبة" checked={posDesign.showTax} onCheckedChange={v => setPosDesign(p => ({...p, showTax: v}))} />
                                            <SettingsToggle id="pos-show-barcode" label="الباركود (صورة)" checked={posDesign.showBarcode} onCheckedChange={v => setPosDesign(p => ({...p, showBarcode: v}))} />
                                            <SettingsToggle id="pos-show-code" label="قيمة الباركود (نص)" checked={posDesign.showCode} onCheckedChange={v => setPosDesign(p => ({...p, showCode: v}))} />
                                            <SettingsToggle id="pos-show-invoice-num" label="رقم الفاتورة" checked={posDesign.showInvoiceNumber} onCheckedChange={v => setPosDesign(p => ({...p, showInvoiceNumber: v}))} />
                                            <SettingsToggle id="pos-show-item-price" label="سعر الوحدة" checked={posDesign.showItemPrice} onCheckedChange={v => setPosDesign(p => ({...p, showItemPrice: v}))} />
                                            <SettingsToggle id="pos-show-einvoice-qr" label="رمز QR الإيصال الإلكتروني" checked={posDesign.showEInvoiceQr ?? true} onCheckedChange={v => setPosDesign(p => ({...p, showEInvoiceQr: v}))} />
                                        </AccordionContent>
                                    </AccordionItem>
                                    <AccordionItem value="item-3">
                                        <AccordionTrigger>أحجام الخطوط</AccordionTrigger>
                                        <AccordionContent className="space-y-3 pt-4">
                                            <FontSizeControl label="اسم الشركة" value={posDesign.fontSizes.companyName} onChange={v => setPosDesign(p => ({...p, fontSizes: {...p.fontSizes, companyName: v}}))} />
                                            <FontSizeControl label="العناوين الفرعية" value={posDesign.fontSizes.header} onChange={v => setPosDesign(p => ({...p, fontSizes: {...p.fontSizes, header: v}}))} />
                                            <FontSizeControl label="بنود الفاتورة" value={posDesign.fontSizes.items} onChange={v => setPosDesign(p => ({...p, fontSizes: {...p.fontSizes, items: v}}))} />
                                            <FontSizeControl label="الإجماليات" value={posDesign.fontSizes.totals} onChange={v => setPosDesign(p => ({...p, fontSizes: {...p.fontSizes, totals: v}}))} />
                                            <FontSizeControl label="نص الباركود" value={posDesign.fontSizes.barcode} onChange={v => setPosDesign(p => ({...p, fontSizes: {...p.fontSizes, barcode: v}}))} />
                                        </AccordionContent>
                                    </AccordionItem>
                                    <AccordionItem value="item-4">
                                        <AccordionTrigger>ترتيب العناصر عمودياً</AccordionTrigger>
                                        <AccordionContent className="space-y-2 pt-3">
                                            <p className="text-xs text-muted-foreground mb-2">
                                                استخدم الأسهم لتحريك أي قسم للأعلى أو للأسفل في الإيصال:
                                            </p>
                                            <div className="space-y-1.5">
                                                {currentSectionOrder.map((key, idx) => (
                                                    <div key={key} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 bg-muted/20">
                                                        <span className="text-xs font-medium">{sectionLabels[key] || key}</span>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6"
                                                                disabled={idx === 0}
                                                                onClick={() => moveSection(idx, -1)}
                                                                title="تحريك لأعلى"
                                                            >
                                                                <ArrowUp className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6"
                                                                disabled={idx === currentSectionOrder.length - 1}
                                                                onClick={() => moveSection(idx, 1)}
                                                                title="تحريك لأسفل"
                                                            >
                                                                <ArrowDown className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="w-full mt-2 gap-1.5 text-xs"
                                                onClick={() => setPosDesign(p => ({ ...p, sectionOrder: [...DEFAULT_RECEIPT_SECTION_ORDER] }))}
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" />
                                                إعادة الترتيب الافتراضي
                                            </Button>
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            </TabsContent>
                            <TabsContent value="kitchen-receipt">
                                 <Accordion type="multiple" defaultValue={['item-1']} className="w-full">
                                    <AccordionItem value="item-1">
                                        <AccordionTrigger>إظهار/إخفاء</AccordionTrigger>
                                        <AccordionContent className="space-y-3 pt-4">
                                            <SettingsToggle id="k-show-ref" label="رقم الطلب المرجعي" checked={kitchenDesign.showOrderReference} onCheckedChange={v => setKitchenDesign(p => ({...p, showOrderReference: v}))} />
                                            <SettingsToggle id="k-show-customer" label="اسم العميل" checked={kitchenDesign.showCustomerName} onCheckedChange={v => setKitchenDesign(p => ({...p, showCustomerName: v}))} />
                                            <SettingsToggle id="k-show-cashier" label="اسم الكاشير" checked={kitchenDesign.showCashierName} onCheckedChange={v => setKitchenDesign(p => ({...p, showCashierName: v}))} />
                                            <SettingsToggle id="k-show-datetime" label="الوقت والتاريخ" checked={kitchenDesign.showDateTime} onCheckedChange={v => setKitchenDesign(p => ({...p, showDateTime: v}))} />
                                        </AccordionContent>
                                    </AccordionItem>
                                     <AccordionItem value="item-2">
                                        <AccordionTrigger>أحجام الخطوط</AccordionTrigger>
                                        <AccordionContent className="space-y-3 pt-4">
                                            <FontSizeControl label="العناوين" value={kitchenDesign.fontSizes.header} onChange={v => setKitchenDesign(p => ({...p, fontSizes: {...p.fontSizes, header: v}}))} />
                                            <FontSizeControl label="الأصناف" value={kitchenDesign.fontSizes.items} onChange={v => setKitchenDesign(p => ({...p, fontSizes: {...p.fontSizes, items: v}}))} />
                                        </AccordionContent>
                                    </AccordionItem>
                                 </Accordion>
                            </TabsContent>
                         </Tabs>
                        ) : (
                             <p className="text-sm text-center text-muted-foreground p-4">يرجى اختيار فرع أولاً.</p>
                        )}
                    </CardContent>
                </Card>
                 <div className="flex-1 flex bg-muted rounded-lg items-start justify-center p-4 overflow-y-auto">
                    <div className="my-auto space-y-8">
                        {selectedWarehouseId && posDesign && <PosReceipt invoice={SAMPLE_INVOICE} company={companySettings} design={posDesign} customer={SAMPLE_CUSTOMER} />}
                        {selectedWarehouseId && kitchenDesign && <KitchenReceipt invoice={SAMPLE_INVOICE} design={kitchenDesign} customer={SAMPLE_CUSTOMER} />}
                    </div>
                </div>
            </main>
        </>
    );
};
