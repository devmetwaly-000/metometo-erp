

"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { useData } from '@/contexts/data-provider';
import { Loader2, Search, Undo2, Save, Trash2, Info, ScanLine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/auth-context';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';

interface PosSale {
  id: string;
  invoiceNumber: string;
  date: string;
  cashierId: string;
  cashierName: string;
  warehouseId?: string;
  posTerminalId?: string;
  items: { id: string; name: string; qty: number; price: number; cost?: number; }[];
  total: number;
  invoiceCounter?: number;
}
interface PosReturnItem {
  id: string; // original item id
  name: string;
  qty: number;
  price: number;
  cost: number;
  total: number;
  maxQty: number; // max qty that can be returned from original invoice
  previouslyReturned: number; // qty returned in previous transactions for this invoice
}

export default function PosReturnPage() {
    const { posSales, salesInvoices, posReturns, dbAction, loading, getNextId, warehouses, posTerminals, items: allItems } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [barcodeInput, setBarcodeInput] = useState('');
    const [scanInput, setScanInput] = useState('');
    const [foundInvoice, setFoundInvoice] = useState<PosSale | null>(null);
    const [returnedItems, setReturnedItems] = useState<PosReturnItem[]>([]);
    const [returnTotal, setReturnTotal] = useState(0);
    const [isSearching, setIsSearching] = useState(false);

    const itemScanRef = useRef<HTMLInputElement>(null);
    
    // Permission check for return mode
    const canBypassScanner = user?.canBypassScannerForReturn === true;

    const handleSearch = async () => {
        const rawInput = barcodeInput.trim();
        if (!rawInput) return;
        setIsSearching(true);

        const cleanedInput = rawInput.replace(/\s+/g, '');
        const inputTokens = cleanedInput.toLowerCase().split(/[-_/]/).filter(Boolean);
        const inputSortedTokens = [...inputTokens].sort().join('-');

        const allAvailableSales = [...(posSales || []), ...(salesInvoices || [])];

        const matchInvoice = (s: any) => {
            if (!s) return false;
            const invNum = String(s.invoiceNumber || s.InvoiceNumber || '').trim().replace(/\s+/g, '');
            const invId = String(s.id || s.Id || '').trim();

            // 1. Direct match (exact or case-insensitive)
            if (invNum.toLowerCase() === cleanedInput.toLowerCase() || invId.toLowerCase() === cleanedInput.toLowerCase()) {
                return true;
            }

            // 2. Token-set match (e.g. C1-10-161126-1 matches 1-C1-10-161126)
            const sTokens = invNum.toLowerCase().split(/[-_/]/).filter(Boolean);
            const sSortedTokens = [...sTokens].sort().join('-');
            if (inputSortedTokens && sSortedTokens === inputSortedTokens) {
                return true;
            }

            // 3. Reversed 4-part match (Terminal-Warehouse-Date-Count <-> Count-Terminal-Warehouse-Date)
            if (inputTokens.length === 4) {
                const rev1 = `${inputTokens[3]}-${inputTokens[0]}-${inputTokens[1]}-${inputTokens[2]}`;
                const rev2 = `${inputTokens[3]}-${inputTokens[1]}-${inputTokens[0]}-${inputTokens[2]}`;
                const sClean = invNum.toLowerCase();
                if (sClean === rev1 || sClean === rev2) {
                    return true;
                }
            }

            return false;
        };

        let invoiceToFind: any = allAvailableSales.find(matchInvoice);

        // If not found in client memory, query backend API directly!
        if (!invoiceToFind) {
            try {
                const res = await fetch(`/api/sales/find-invoice?query=${encodeURIComponent(cleanedInput)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.invoice) {
                        invoiceToFind = data.invoice;
                    }
                }
            } catch (err) {
                console.warn('Backend search error:', err);
            }
        }

        setIsSearching(false);

        if (invoiceToFind) {
            setFoundInvoice(invoiceToFind);
            const previousReturnsForInvoice = (posReturns || []).filter((pr: any) => pr.originalInvoiceId === invoiceToFind!.id || pr.originalInvoiceNumber === invoiceToFind!.invoiceNumber);
            
            const returnedQuantities = new Map<string, number>();
            previousReturnsForInvoice.forEach((pr: any) => {
                (pr.items || []).forEach((item: any) => {
                    returnedQuantities.set(item.id, (returnedQuantities.get(item.id) || 0) + Number(item.qty || 0));
                });
            });

            if (canBypassScanner) {
                setReturnedItems((invoiceToFind.items || []).map((item: any) => ({
                    ...item, 
                    maxQty: Number(item.qty || 1), 
                    previouslyReturned: returnedQuantities.get(item.id) || 0,
                    total: 0, 
                    qty: 0, 
                    cost: Number(item.cost || item.price || 0) 
                })));
            } else {
                setReturnedItems([]);
                setTimeout(() => itemScanRef.current?.focus(), 100);
            }
            toast({ title: 'تم العثور على الفاتورة', description: `فاتورة رقم ${invoiceToFind.invoiceNumber}` });
        } else {
            toast({ variant: 'destructive', title: 'خطأ', description: `لم يتم العثور على فاتورة برقم "${rawInput}".` });
            setFoundInvoice(null);
            setReturnedItems([]);
        }
    };
    
    const handleQtyChange = (id: string, newQty: number) => {
        setReturnedItems(prev => prev.map(item => {
            if (item.id === id) {
                const maxReturnable = item.maxQty - item.previouslyReturned;
                const safeQty = Math.max(0, Math.min(newQty, maxReturnable));
                return { ...item, qty: safeQty, total: safeQty * item.price };
            }
            return item;
        }));
    };
    
    const handleItemScan = (e: React.FormEvent) => {
        e.preventDefault();
        const itemCode = scanInput.trim();
        if (!itemCode || !foundInvoice) return;

        const itemInInvoice = foundInvoice.items.find(i => {
            const master = allItems.find((m: any) => m.id === i.id);
            return i.code === itemCode || (i as any).barcode === itemCode || master?.code === itemCode || master?.barcode === itemCode || i.id === itemCode;
        });
        
        if (!itemInInvoice) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'هذا الصنف غير موجود في الفاتورة الأصلية.' });
            setScanInput('');
            return;
        }

        const previouslyReturned = (posReturns || [])
            .filter((pr: any) => pr.originalInvoiceId === foundInvoice.id)
            .flatMap((pr: any) => pr.items || [])
            .filter((item: any) => item.id === itemInInvoice.id)
            .reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0);

        const qtyInCart = returnedItems.find(i => i.id === itemInInvoice.id)?.qty || 0;
        const maxReturnable = itemInInvoice.qty - previouslyReturned;

        if (qtyInCart >= maxReturnable) {
             toast({ variant: 'destructive', title: 'تنبيه', description: 'لقد وصلت للحد الأقصى للإرجاع من هذا الصنف.' });
             setScanInput('');
             return;
        }
        
        // Add or increment the item in the return cart
        const existingItemIndex = returnedItems.findIndex(i => i.id === itemInInvoice.id);
        if (existingItemIndex > -1) {
            const updatedItems = [...returnedItems];
            updatedItems[existingItemIndex].qty += 1;
            updatedItems[existingItemIndex].total = updatedItems[existingItemIndex].qty * updatedItems[existingItemIndex].price;
            setReturnedItems(updatedItems);
        } else {
            setReturnedItems(prev => [...prev, {
                ...itemInInvoice,
                qty: 1,
                total: itemInInvoice.price,
                maxQty: itemInInvoice.qty,
                previouslyReturned: previouslyReturned,
                cost: itemInInvoice.cost || 0
            }]);
        }
        setScanInput('');
    };

    React.useEffect(() => {
        const total = returnedItems.reduce((sum, item) => sum + item.total, 0);
        setReturnTotal(total);
    }, [returnedItems]);


    const handleSaveReturn = async () => {
        if (!foundInvoice || returnTotal <= 0) {
            toast({ variant: "destructive", title: "خطأ", description: "لا توجد أصناف أو قيمة للمرتجع." });
            return;
        }

        const itemsToReturn = returnedItems.filter(item => item.qty > 0);
        if (itemsToReturn.length === 0) {
            toast({ variant: "destructive", title: "خطأ", description: "يرجى تحديد كمية صنف واحد على الأقل." });
            return;
        }

        try {
            const receiptNumber = `م-ن-${await getNextId('posReturn')}`;
            const date = new Date();
            const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
            
            const returnData = {
                date: date.toISOString(),
                receiptNumber,
                originalInvoiceId: foundInvoice.id,
                originalInvoiceNumber: foundInvoice.invoiceNumber,
                cashierId: user?.id,
                cashierName: user?.name,
                items: itemsToReturn.map(({maxQty, previouslyReturned, ...rest}) => rest),
                total: returnTotal,
                warehouseId: foundInvoice.warehouseId,
            };

            // Save to the new structure
            const newReturnRef = await dbAction(`posReturns/${dateString}`, 'add', returnData);
            
            toast({ title: 'تم الحفظ بنجاح', description: `تم تسجيل مرتجع بقيمة ${returnTotal.toLocaleString()}` });
            router.push('/pos');

        } catch (error) {
            console.error("Failed to save POS return:", error);
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ المرتجع.' });
        }
    };


    return (
        <>
            <PageHeader title="مرتجع نقاط البيع" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>البحث عن الفاتورة الأصلية</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex items-end gap-2">
                             <div className="space-y-2 flex-1">
                                <Label htmlFor="invoiceNumber">رقم فاتورة الكاشير أو الباركود</Label>
                                <Input 
                                    id="invoiceNumber" 
                                    dir="ltr"
                                    className="font-mono text-left tracking-wide"
                                    value={barcodeInput} 
                                    onChange={e => setBarcodeInput(e.target.value)} 
                                    placeholder="مثال: C1-10-161126-1 أو 1-C1-10-161126 أو امسح الباركود..." 
                                    autoFocus
                                />
                            </div>
                            <Button type="submit" disabled={loading || isSearching || !barcodeInput.trim()} className="gap-2 px-6">
                                {isSearching ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}
                                بحث عن الفاتورة
                            </Button>
                        </form>
                    </CardContent>
                </Card>
                
                {foundInvoice && (
                    <Card>
                        <CardHeader>
                            <CardTitle>تفاصيل الفاتورة #{foundInvoice.invoiceNumber}</CardTitle>
                             <CardDescription>
                                تاريخ: {new Date(foundInvoice.date).toLocaleString('ar-EG')} | الكاشير: {foundInvoice.cashierName} | الإجمالي: {foundInvoice.total.toLocaleString()} ج.م
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {canBypassScanner ? (
                                 <div className="space-y-4">
                                    <Label>تحديد الأصناف والكميات المرتجعة</Label>
                                    <div className="w-full overflow-auto border rounded-lg">
                                        <Table>
                                            <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead className="text-center">الكمية المباعة</TableHead><TableHead className="text-center">مرتجعات سابقة</TableHead><TableHead className="text-center">الكمية المرتجعة</TableHead><TableHead className="text-center">السعر</TableHead><TableHead className="text-center">إجمالي المرتجع</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {returnedItems.map(item => (
                                                    <TableRow key={item.id}>
                                                        <TableCell>{item.name}</TableCell>
                                                        <TableCell className="text-center">{item.maxQty}</TableCell>
                                                        <TableCell className="text-center text-muted-foreground">{item.previouslyReturned}</TableCell>
                                                        <TableCell className="text-center w-32"><Input type="number" value={item.qty} onChange={(e) => handleQtyChange(item.id, Number(e.target.value))} className="text-center" max={item.maxQty - item.previouslyReturned} min={0} /></TableCell>
                                                        <TableCell className="text-center">{item.price.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center font-semibold">{item.total.toLocaleString()}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid md:grid-cols-2 gap-6">
                                     <div>
                                        <form onSubmit={handleItemScan}>
                                            <Label htmlFor='scan-item'>مسح باركود الصنف</Label>
                                             <div className="flex gap-2">
                                                <Input ref={itemScanRef} id="scan-item" value={scanInput} onChange={e => setScanInput(e.target.value)} placeholder="امسح الباركود هنا..." />
                                                <Button type="submit" variant="outline"><ScanLine className="h-4 w-4" /></Button>
                                            </div>
                                        </form>
                                    </div>
                                    <div>
                                        <Label>الأصناف المرتجعة</Label>
                                        <div className="w-full overflow-auto border rounded-lg h-48">
                                             <Table>
                                                <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead className="text-center">الكمية</TableHead><TableHead className="text-center">الإجمالي</TableHead></TableRow></TableHeader>
                                                <TableBody>
                                                    {returnedItems.map(item => (
                                                        <TableRow key={item.id}>
                                                            <TableCell>{item.name}</TableCell>
                                                            <TableCell className="text-center">{item.qty}</TableCell>
                                                            <TableCell className="text-center">{item.total.toLocaleString()}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                     {returnedItems.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground p-4">لم يتم إضافة أصناف بعد</TableCell></TableRow>}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                </div>
                            )}
                             <Alert className="mt-4">
                                <Info className="h-4 w-4" />
                                <AlertTitle>التأثير المحاسبي والمخزني</AlertTitle>
                                <AlertDescription>
                                    عند الحفظ، سيتم زيادة رصيد الأصناف المرتجعة في المخزن.
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                         <CardFooter className="flex justify-between items-center">
                            <p className="text-xl font-bold">إجمالي قيمة المرتجع: <span className="text-destructive">{returnTotal.toLocaleString()} ج.م</span></p>
                            <Button size="lg" onClick={handleSaveReturn} disabled={returnTotal <= 0}>
                                <Save className="ml-2 h-4 w-4" />
                                حفظ المرتجع
                            </Button>
                        </CardFooter>
                    </Card>
                )}
            </main>
        </>
    );
}
