

"use client";

import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Printer } from 'lucide-react';
import { BarcodePreview } from './barcode-preview';
import { useData } from '@/contexts/data-provider';

interface Item {
  id?: string;
  code?: string;
  name: string;
  price: number;
  barcodeType?: 'code128' | 'ean13_scale';
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
    rotation?: number;
    fontSizes: any;
    positions: any;
}

export const BarcodePrintDialog = ({ item, barcodeDesigns, trigger }: { item: Item, barcodeDesigns: Design[], trigger: React.ReactNode }) => {
    const { settings } = useData();
    const [isOpen, setIsOpen] = useState(false);
    const [selectedDesignId, setSelectedDesignId] = useState('');
    const [quantity, setQuantity] = useState(1);

    useEffect(() => {
        if (isOpen && barcodeDesigns.length > 0 && !selectedDesignId) {
            setSelectedDesignId(barcodeDesigns[0].id!);
        }
    }, [isOpen, barcodeDesigns, selectedDesignId]);

    const activeDesign = useMemo(() => {
        return barcodeDesigns.find(d => d.id === selectedDesignId) || null;
    }, [selectedDesignId, barcodeDesigns]);

    const handlePrint = () => {
        if (!activeDesign) return;
        setTimeout(() => {
            const printWindow = window.open('', '_blank', 'height=600,width=800');
            if (printWindow) {
                 printWindow.document.write(`
                    <html><head><title>طباعة الباركود</title>
                    <style>
                        @media print { @page { size: auto; margin: 0mm; } body { margin: 0; } }
                        body { display: flex; flex-wrap: wrap; justify-content: flex-start; align-items: flex-start; }
                        .label-wrapper { display: inline-block; vertical-align: top; page-break-inside: avoid; }
                    </style>
                    </head><body>
                `);
                
                for (let i = 0; i < quantity; i++) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'label-wrapper';
                    const root = require('react-dom/client').createRoot(wrapper);
                    root.render(<BarcodePreview item={item} design={activeDesign} settings={settings} />);
                    printWindow.document.body.appendChild(wrapper);
                }
                
                printWindow.document.close();
                setTimeout(() => {
                    printWindow.focus();
                    printWindow.print();
                    printWindow.close();
                }, 500);
            }
        }, 75);
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {React.cloneElement(trigger as React.ReactElement, { onClick: () => setIsOpen(true) })}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>طباعة باركود لـ: {item.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>تصميم الملصق</Label>
                            <Select value={selectedDesignId} onValueChange={setSelectedDesignId}>
                                <SelectTrigger><SelectValue placeholder="اختر تصميمًا..." /></SelectTrigger>
                                <SelectContent>
                                    {barcodeDesigns.map(d => <SelectItem key={d.id} value={d.id!}>{d.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>الكمية</Label>
                            <Input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} min={1} />
                        </div>
                    </div>
                    {activeDesign && (
                        <div className="space-y-2">
                            <Label>معاينة</Label>
                             <div className="p-4 bg-muted rounded-md flex justify-center items-center min-h-[150px]">
                                <BarcodePreview item={item} design={activeDesign} settings={settings} />
                            </div>
                        </div>
                    )}
                </div>
                 <div className="flex justify-end pt-4">
                    <Button onClick={handlePrint} disabled={!activeDesign || quantity < 1}>
                        <Printer className="ml-2 h-4 w-4" />
                        طباعة
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
