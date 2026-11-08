
"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Printer, Search, Trash2, PlusCircle, ChevronsUpDown, MinusCircle, Link } from 'lucide-react';
import { useData } from '@/contexts/data-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { BarcodePreview } from '@/components/barcode-preview';
import { useToast } from '@/hooks/use-toast';

interface PrintQueueItem {
    id: string;
    code?: string;
    name: string;
    price: number;
    barcodeType?: 'code128' | 'ean13_scale';
    quantity: number;
    designId: string;
}

export default function BulkBarcodePrintPage() {
    const { items, itemSections, itemCategories, barcodeDesigns, loading, settings } = useData();
    const { toast } = useToast();

    const [printQueue, setPrintQueue] = useState<PrintQueueItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItemForPreview, setSelectedItemForPreview] = useState<PrintQueueItem | null>(null);

    const [globalDesignId, setGlobalDesignId] = useState('');
    const [globalQuantity, setGlobalQuantity] = useState(1);

    useEffect(() => {
        if (barcodeDesigns?.length > 0) {
            setGlobalDesignId(barcodeDesigns[0].id);
        }
    }, [barcodeDesigns]);

    const itemsByCategories = useMemo(() => {
        if (loading) return {};
        const categorized: Record<string, any[]> = {};
        items.forEach((item: any) => {
            const categoryId = item.categoryId || 'uncategorized';
            if (!categorized[categoryId]) {
                categorized[categoryId] = [];
            }
            categorized[categoryId].push(item);
        });
        return categorized;
    }, [items, loading]);
    
    const sectionsWithDetails = useMemo(() => {
        if(loading) return [];
        return itemSections.map((section: any) => ({
            ...section,
            categories: itemCategories.filter((cat: any) => cat.sectionId === section.id)
        })).filter((section: any) => section.categories.length > 0);
    }, [itemSections, itemCategories, loading]);
    
    const filteredItems = useMemo(() => {
        if (!searchTerm) return [];
        const term = searchTerm.toLowerCase();
        return items.filter((item: any) => 
            item.name.toLowerCase().includes(term) || 
            (item.code && String(item.code).includes(term))
        );
    }, [items, searchTerm]);
    

    const handleAddItemToQueue = (item: any) => {
        const isInQueue = printQueue.some(pqItem => pqItem.id === item.id);
        if (isInQueue) {
            toast({ title: 'الصنف موجود بالفعل', description: 'يمكنك زيادة الكمية من قائمة الطباعة.', variant: 'default' });
            return;
        }
        setPrintQueue(prev => [...prev, { ...item, quantity: 1, designId: globalDesignId || barcodeDesigns[0]?.id }]);
    };

    const handleRemoveFromQueue = (itemId: string) => {
        setPrintQueue(prev => prev.filter(item => item.id !== itemId));
        if (selectedItemForPreview?.id === itemId) {
            setSelectedItemForPreview(null);
        }
    };
    
    const handleQueueItemChange = (itemId: string, field: 'quantity' | 'designId', value: any) => {
        setPrintQueue(prev => prev.map(item => 
            item.id === itemId ? { ...item, [field]: value } : item
        ));
    };

    const applyGlobalDesign = () => {
        if (!globalDesignId) return;
        setPrintQueue(prev => prev.map(item => ({ ...item, designId: globalDesignId })));
        toast({ title: 'تم تطبيق التصميم على الكل' });
    };

    const applyGlobalQuantity = () => {
        if (globalQuantity <= 0) return;
        setPrintQueue(prev => prev.map(item => ({ ...item, quantity: globalQuantity })));
        toast({ title: 'تم تطبيق الكمية على الكل' });
    };

    const handlePrint = () => {
        if (printQueue.length === 0) {
            toast({ variant: 'destructive', title: 'القائمة فارغة', description: 'الرجاء إضافة صنف واحد على الأقل للطباعة.' });
            return;
        }
        if (printQueue.some(item => !item.designId)) {
             toast({ variant: 'destructive', title: 'تصميم ناقص', description: 'يرجى تحديد تصميم لكل الأصناف في القائمة.' });
            return;
        }
        setTimeout(() => {
            const printWindow = window.open('', '_blank', 'height=600,width=800');
            if (printWindow) {
                 printWindow.document.write(`
                    <html><head><title>طباعة الباركود</title>
                    <style>
                        @media print { @page { size: auto; margin: 0; } body { margin: 0; } }
                        body { display: flex; flex-wrap: wrap; justify-content: flex-start; align-items: flex-start; direction: rtl; }
                        .label-wrapper { display: inline-block; vertical-align: top; page-break-inside: avoid; }
                    </style>
                    </head><body>
                `);
                
                printQueue.forEach(item => {
                     const design = barcodeDesigns.find((d: any) => d.id === item.designId);
                     if(design) {
                         for (let i = 0; i < item.quantity; i++) {
                            const wrapper = document.createElement('div');
                            wrapper.className = 'label-wrapper';
                            const root = require('react-dom/client').createRoot(wrapper);
                            root.render(<BarcodePreview item={item} design={design} settings={settings}/>);
                            printWindow.document.body.appendChild(wrapper);
                         }
                     }
                });
                
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
        <>
            <PageHeader title="طباعة مجموعة اصناف" />
            <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-10rem)]">
                <div className="lg:col-span-1 flex flex-col gap-4 h-full">
                   <Card className="flex-1 flex flex-col">
                        <CardHeader>
                            <CardTitle>قائمة الأصناف</CardTitle>
                            <div className="relative pt-2">
                                <Search className="absolute right-3 top-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="بحث بالاسم أو الباركود..." 
                                    className="pr-9" 
                                    value={searchTerm} 
                                    onChange={e => setSearchTerm(e.target.value)} 
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-hidden p-2">
                             {loading ? <Loader2 className="animate-spin mx-auto mt-10"/> : (
                             <ScrollArea className="h-full">
                                {searchTerm ? (
                                    <div className="space-y-1">
                                        {filteredItems.map((item: any) => (
                                            <div key={item.id} className="flex items-center justify-between p-2 hover:bg-muted rounded-md">
                                                <span>{item.name}</span>
                                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleAddItemToQueue(item)}>
                                                    <PlusCircle className="text-primary"/>
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                <Accordion type="multiple" className="w-full">
                                    {sectionsWithDetails.map((section: any) => (
                                        <AccordionItem value={section.id} key={section.id}>
                                            <AccordionTrigger>{section.name}</AccordionTrigger>
                                            <AccordionContent>
                                                <Accordion type="multiple" className="w-full pr-4">
                                                    {section.categories.map((category: any) => (
                                                        <AccordionItem value={category.id} key={category.id}>
                                                            <AccordionTrigger>{category.name}</AccordionTrigger>
                                                            <AccordionContent className="space-y-1 pr-4">
                                                                {itemsByCategories[category.id]?.map((item: any) => (
                                                                    <div key={item.id} className="flex items-center justify-between p-2 hover:bg-muted rounded-md">
                                                                        <span>{item.name}</span>
                                                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleAddItemToQueue(item)}>
                                                                            <PlusCircle className="text-primary"/>
                                                                        </Button>
                                                                    </div>
                                                                ))}
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    ))}
                                                </Accordion>
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                                )}
                             </ScrollArea>
                             )}
                        </CardContent>
                   </Card>
                </div>

                <div className="lg:col-span-2 flex flex-col gap-4 h-full">
                    <Card>
                         <CardHeader>
                            <CardTitle>قائمة الطباعة</CardTitle>
                        </CardHeader>
                         <CardContent>
                             <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                 <div className="space-y-2">
                                    <Label>توحيد التصميم</Label>
                                    <div className="flex gap-1">
                                        <Select value={globalDesignId} onValueChange={setGlobalDesignId}>
                                            <SelectTrigger><SelectValue placeholder="اختر تصميمًا..." /></SelectTrigger>
                                            <SelectContent>
                                                {barcodeDesigns.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Button variant="secondary" onClick={applyGlobalDesign} disabled={!globalDesignId}>تطبيق</Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>توحيد الكمية</Label>
                                    <div className="flex gap-1">
                                        <Input type="number" value={globalQuantity} onChange={e => setGlobalQuantity(Number(e.target.value))} min="1" />
                                        <Button variant="secondary" onClick={applyGlobalQuantity}>تطبيق</Button>
                                    </div>
                                </div>
                             </div>
                        </CardContent>
                    </Card>
                     <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-hidden">
                        <Card className="md:col-span-2 flex flex-col">
                            <CardContent className="p-2 flex-1 overflow-hidden">
                                <ScrollArea className="h-full">
                                <Table>
                                    <TableHeader>
                                        <TableRow><TableHead>الصنف</TableHead><TableHead className="w-28 text-center">الكمية</TableHead><TableHead className="w-40">التصميم</TableHead><TableHead className="w-12"></TableHead></TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {printQueue.map(item => (
                                            <TableRow key={item.id} onClick={() => setSelectedItemForPreview(item)} className="cursor-pointer" data-state={selectedItemForPreview?.id === item.id ? 'selected' : ''}>
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell><Input type="number" value={item.quantity} onChange={e => handleQueueItemChange(item.id, 'quantity', Number(e.target.value))} min={1} className="h-8 text-center" /></TableCell>
                                                <TableCell>
                                                    <Select value={item.designId} onValueChange={(v) => handleQueueItemChange(item.id, 'designId', v)}>
                                                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                           {barcodeDesigns.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveFromQueue(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                                            </TableRow>
                                        ))}
                                         {printQueue.length === 0 && <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">قائمة الطباعة فارغة</TableCell></TableRow>}
                                    </TableBody>
                                </Table>
                                </ScrollArea>
                            </CardContent>
                             <CardFooter className="p-2 border-t justify-end">
                                <Button size="lg" onClick={handlePrint} disabled={printQueue.length === 0}>
                                    <Printer className="ml-2 h-4 w-4" />
                                    طباعة الكل ({printQueue.reduce((acc, item) => acc + item.quantity, 0)})
                                </Button>
                            </CardFooter>
                        </Card>
                        <Card className="flex flex-col items-center justify-center p-4">
                            <CardHeader><CardTitle>معاينة</CardTitle></CardHeader>
                            <CardContent className="flex-1 flex items-center justify-center">
                                {selectedItemForPreview ? (
                                    <BarcodePreview item={selectedItemForPreview} design={barcodeDesigns.find((d: any) => d.id === selectedItemForPreview.designId)} settings={settings} />
                                ) : (
                                    <p className="text-muted-foreground">اختر صنفًا من القائمة لعرض معاينة</p>
                                )}
                            </CardContent>
                        </Card>
                     </div>
                </div>
            </main>
        </>
    );
}
