
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useData } from '@/contexts/data-provider';
import { Loader2, Save, Trash2, PlusCircle, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BarcodePreview } from '@/components/barcode-preview';


interface DesignElementPositions {
    y: number;
    x: number;
}
interface DesignFontSizes {
    companyName: number;
    itemName: number;
    barcode: number;
    price: number;
}
interface Design {
    id?: string;
    name: string;
    companyName: string;
    showCompanyName: boolean;
    showPrice: boolean;
    showCode: boolean;
    showBarcode: boolean;
    labelWidth: number;
    labelHeight: number;
    barcodeType: string;
    barcodeHeight: number;
    rotation: number;
    fontSizes: DesignFontSizes;
    positions: {
        companyName: DesignElementPositions;
        itemName: DesignElementPositions;
        barcode: DesignElementPositions;
        price: DesignElementPositions;
    }
}

const DEFAULT_POSITIONS = {
    companyName: { y: 10, x: 50 },
    itemName: { y: 30, x: 50 },
    barcode: { y: 60, x: 50 },
    price: { y: 85, x: 50 },
};

const DEFAULT_FONTS: DesignFontSizes = {
    companyName: 8,
    itemName: 10,
    barcode: 8,
    price: 10,
}

const DEFAULT_DESIGN: Design = {
    name: "تصميم جديد",
    companyName: "اسم شركتك",
    showCompanyName: true,
    showPrice: true,
    showCode: true,
    showBarcode: true,
    labelWidth: 50,
    labelHeight: 25,
    barcodeType: 'CODE128',
    barcodeHeight: 20,
    rotation: 0,
    fontSizes: DEFAULT_FONTS,
    positions: DEFAULT_POSITIONS
};

const SAMPLE_ITEM = {
    name: "صنف افتراضي",
    code: "123456789012",
    price: 99.99
};

const ElementControl = ({ title, show, onShowChange, posY, onPosYChange, posX, onPosXChange, fontSize, onFontSizeChange }: {
    title: string;
    show: boolean;
    onShowChange: (value: boolean) => void;
    posY: number;
    onPosYChange: (value: number) => void;
    posX: number;
    onPosXChange: (value: number) => void;
    fontSize: number;
    onFontSizeChange: (value: number) => void;
}) => (
    <div className="space-y-3 border p-3 rounded-md">
        <div className="flex items-center justify-between">
            <Label className="font-semibold">{title}</Label>
            <Switch checked={show} onCheckedChange={onShowChange} />
        </div>
        {show && (
            <div className="space-y-4">
                <div className='text-xs space-y-2'>
                    <div className="flex justify-between"><span>موضع (فوق/تحت)</span><span>{posY}%</span></div>
                    <Slider dir="rtl" defaultValue={[posY]} max={100} step={1} onValueChange={(v) => onPosYChange(v[0])} />
                </div>
                 <div className='text-xs space-y-2'>
                    <div className="flex justify-between"><span>موضع (يمين/يسار)</span><span>{posX}%</span></div>
                    <Slider dir="rtl" defaultValue={[posX]} max={100} step={1} onValueChange={(v) => onPosXChange(v[0])} />
                </div>
                 <div className='text-xs space-y-2'>
                    <Label>حجم الخط (px)</Label>
                    <Input type="number" value={fontSize} onChange={e => onFontSizeChange(Number(e.target.value))} className="h-8"/>
                </div>
            </div>
        )}
    </div>
);


const BarcodeDesignerPage = () => {
    const { barcodeDesigns, dbAction, loading, settings } = useData();
    const { toast } = useToast();
    const [currentDesign, setCurrentDesign] = useState<Design>(DEFAULT_DESIGN);
    const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);

    const deepMergeWithDefaults = useCallback((loadedDesign: Partial<Design>): Design => {
        return {
            ...DEFAULT_DESIGN,
            ...loadedDesign,
            positions: {
                ...DEFAULT_DESIGN.positions,
                ...(loadedDesign.positions || {})
            },
            fontSizes: {
                ...DEFAULT_DESIGN.fontSizes,
                ...(loadedDesign.fontSizes || {})
            }
        };
    }, []);

    useEffect(() => {
        if (selectedDesignId) {
            const loadedDesign = barcodeDesigns.find((d: Design) => d.id === selectedDesignId);
            if (loadedDesign) {
                setCurrentDesign(deepMergeWithDefaults(loadedDesign));
            }
        } else {
            setCurrentDesign(DEFAULT_DESIGN);
        }
    }, [selectedDesignId, barcodeDesigns, deepMergeWithDefaults]);
    
    const handleSettingChange = (key: keyof Design, value: any) => {
        setCurrentDesign(prev => ({ ...prev, [key]: value }));
    };
    
    const handlePositionChange = (element: keyof Design['positions'], axis: 'x' | 'y', value: number) => {
        setCurrentDesign(prev => ({
            ...prev,
            positions: {
                ...prev.positions,
                [element]: { ...prev.positions[element], [axis]: value }
            }
        }))
    }
    
    const handleFontSizeChange = (element: keyof DesignFontSizes, value: number) => {
        setCurrentDesign(prev => ({
            ...prev,
            fontSizes: {
                ...prev.fontSizes,
                [element]: value
            }
        }))
    }

    const handleSaveDesign = async () => {
        if (!currentDesign.name) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'يجب إدخال اسم للتصميم.' });
            return;
        }

        try {
            if (currentDesign.id) {
                await dbAction('barcodeDesigns', 'update', { id: currentDesign.id, data: currentDesign });
                toast({ title: 'تم التحديث', description: 'تم تحديث تصميم الباركود بنجاح.' });
            } else {
                const newId = await dbAction('barcodeDesigns', 'add', currentDesign);
                toast({ title: 'تم الحفظ', description: 'تم حفظ تصميم الباركود الجديد.' });
                if (newId) setSelectedDesignId(newId as string);
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ التصميم.' });
        }
    };
    
    const handleDeleteDesign = async (id: string) => {
        if (confirm('هل أنت متأكد من حذف هذا التصميم؟')) {
            await dbAction('barcodeDesigns', 'remove', {id});
            if(selectedDesignId === id) {
                setSelectedDesignId(null);
            }
            toast({title: 'تم الحذف بنجاح'});
        }
    }

    const handleNewDesign = () => {
        setSelectedDesignId(null);
        setCurrentDesign(DEFAULT_DESIGN);
    }
    
    if (loading) {
        return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <>
            <PageHeader title="مصمم ملصقات الباركود">
                <Button onClick={handleSaveDesign}>
                    <Save className="ml-2 h-4 w-4" />
                    حفظ التصميم الحالي
                </Button>
            </PageHeader>
            <main className="flex flex-col md:flex-row h-[calc(100vh-120px)] p-4 md:p-6 gap-4">
                <Card className="w-full md:w-1/3 lg:w-1/4 flex flex-col flex-none md:h-full overflow-hidden">
                     <ScrollArea className="flex-grow">
                        <CardContent className="p-4 space-y-4">
                            {/* Templates */}
                            <div className="space-y-2">
                                <div className='flex justify-between items-center'>
                                    <Label className="font-semibold">القوالب</Label>
                                    <Button size="sm" variant="outline" onClick={handleNewDesign}>
                                        <PlusCircle className="ml-2 h-4 w-4"/> جديد
                                    </Button>
                                </div>
                                <div className="h-32 border rounded-md p-2 space-y-1">
                                    <ScrollArea className="h-full">
                                    {barcodeDesigns.length > 0 ? barcodeDesigns.map((design: Design) => (
                                        <div key={design.id} className="flex items-center justify-between gap-2 p-1 hover:bg-muted rounded-md">
                                            <Button variant="link" className="p-0 h-auto flex-1 justify-start" onClick={() => setSelectedDesignId(design.id!)}>{design.name}</Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteDesign(design.id!)}><Trash2 className="h-3 w-3"/></Button>
                                        </div>
                                    )) : <p className="text-sm text-muted-foreground text-center p-4">لا توجد تصاميم محفوظة.</p>}
                                    </ScrollArea>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">اسم التصميم الحالي</Label>
                                    <Input value={currentDesign.name} onChange={e => handleSettingChange('name', e.target.value)} placeholder="مثال: ملصق 5x2.5" />
                                </div>
                            </div>
                            
                            {/* General Settings */}
                            <Accordion type="single" collapsible defaultValue="item-1">
                                <AccordionItem value="item-1">
                                    <AccordionTrigger>الإعدادات العامة</AccordionTrigger>
                                    <AccordionContent className="space-y-4 pt-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs">اسم الشركة</Label>
                                            <Input value={currentDesign.companyName} onChange={e => handleSettingChange('companyName', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">نوع الباركود</Label>
                                            <Select value={currentDesign.barcodeType} onValueChange={v => handleSettingChange('barcodeType', v)}>
                                                <SelectTrigger><SelectValue/></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="CODE128">Code 128</SelectItem>
                                                    <SelectItem value="CODE39">Code 39</SelectItem>
                                                    <SelectItem value="EAN13">EAN-13</SelectItem>
                                                    <SelectItem value="UPC">UPC</SelectItem>
                                                    <SelectItem value="QR">QR Code</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-2"><Label className="text-xs">عرض (mm)</Label><Input type="number" value={currentDesign.labelWidth} onChange={e => handleSettingChange('labelWidth', Number(e.target.value))} /></div>
                                            <div className="space-y-2"><Label className="text-xs">ارتفاع (mm)</Label><Input type="number" value={currentDesign.labelHeight} onChange={e => handleSettingChange('labelHeight', Number(e.target.value))} /></div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">تدوير الملصق: {currentDesign.rotation || 0}°</Label>
                                            <Slider defaultValue={[currentDesign.rotation || 0]} max={360} step={1} onValueChange={v => handleSettingChange('rotation', v[0])} />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                                 <AccordionItem value="item-2">
                                    <AccordionTrigger>إعدادات العناصر</AccordionTrigger>
                                    <AccordionContent className="space-y-4 pt-4">
                                         <ElementControl 
                                            title="اسم الشركة"
                                            show={currentDesign.showCompanyName}
                                            onShowChange={v => handleSettingChange('showCompanyName', v)}
                                            posY={currentDesign.positions.companyName.y}
                                            onPosYChange={v => handlePositionChange('companyName', 'y', v)}
                                            posX={currentDesign.positions.companyName.x}
                                            onPosXChange={v => handlePositionChange('companyName', 'x', v)}
                                            fontSize={currentDesign.fontSizes.companyName}
                                            onFontSizeChange={v => handleFontSizeChange('companyName', v)}
                                        />
                                        <ElementControl 
                                            title="اسم الصنف"
                                            show={true} // Item name is always shown
                                            onShowChange={() => {}} // No-op
                                            posY={currentDesign.positions.itemName.y}
                                            onPosYChange={v => handlePositionChange('itemName', 'y', v)}
                                            posX={currentDesign.positions.itemName.x}
                                            onPosXChange={v => handlePositionChange('itemName', 'x', v)}
                                            fontSize={currentDesign.fontSizes.itemName}
                                            onFontSizeChange={v => handleFontSizeChange('itemName', v)}
                                        />
                                        <ElementControl 
                                            title="السعر"
                                            show={currentDesign.showPrice}
                                            onShowChange={v => handleSettingChange('showPrice', v)}
                                            posY={currentDesign.positions.price.y}
                                            onPosYChange={v => handlePositionChange('price', 'y', v)}
                                            posX={currentDesign.positions.price.x}
                                            onPosXChange={v => handlePositionChange('price', 'x', v)}
                                            fontSize={currentDesign.fontSizes.price}
                                            onFontSizeChange={v => handleFontSizeChange('price', v)}
                                        />
                                        <div className="space-y-3 border p-3 rounded-md">
                                            <div className="flex items-center justify-between">
                                                <Label className="font-semibold">الباركود</Label>
                                                <Switch checked={currentDesign.showBarcode} onCheckedChange={v => handleSettingChange('showBarcode', v)} />
                                            </div>
                                            {currentDesign.showBarcode && (
                                                <div className="space-y-4">
                                                     <div className="flex items-center justify-between"><Label className="text-xs">إظهار الكود (نص)</Label><Switch checked={currentDesign.showCode} onCheckedChange={v => handleSettingChange('showCode', v)} /></div>
                                                     <div className='text-xs space-y-2'>
                                                        <Label>ارتفاع الباركود (px)</Label>
                                                        <Input type="number" value={currentDesign.barcodeHeight} onChange={e => handleSettingChange('barcodeHeight', Number(e.target.value))} className="h-8"/>
                                                     </div>
                                                     <div className='text-xs space-y-2'>
                                                        <div className="flex justify-between"><span>موضع (فوق/تحت)</span><span>{currentDesign.positions.barcode.y}%</span></div>
                                                        <Slider dir="rtl" defaultValue={[currentDesign.positions.barcode.y]} max={100} step={1} onValueChange={(v) => handlePositionChange('barcode', 'y', v[0])} />
                                                    </div>
                                                    <div className='text-xs space-y-2'>
                                                        <div className="flex justify-between"><span>موضع (يمين/يسار)</span><span>{currentDesign.positions.barcode.x}%</span></div>
                                                        <Slider dir="rtl" defaultValue={[currentDesign.positions.barcode.x]} max={100} step={1} onValueChange={(v) => handlePositionChange('barcode', 'x', v[0])} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </CardContent>
                    </ScrollArea>
                </Card>
                
                <div className="flex-1 flex bg-muted rounded-lg items-center justify-center p-4 overflow-hidden h-1/3 md:h-full">
                    <div className="transform scale-125 md:scale-100 lg:scale-125 origin-center">
                        <BarcodePreview item={SAMPLE_ITEM} design={currentDesign} settings={settings} />
                    </div>
                </div>
            </main>
        </>
    );
};

export default BarcodeDesignerPage;
