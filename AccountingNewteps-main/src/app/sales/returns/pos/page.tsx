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
import { Loader2, Search, Save, Info, ScanLine, RotateCcw, AlertTriangle, CheckCheck, Barcode as BarcodeIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/auth-context';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from "@/components/ui/badge";
import { useRouter } from 'next/navigation';

interface PosSale {
  id: string;
  invoiceNumber: string;
  date: string;
  cashierId: string;
  cashierName: string;
  warehouseId?: string;
  posTerminalId?: string;
  items: { id: string; code?: string; barcode?: string; name: string; qty: number; price: number; cost?: number; }[];
  total: number;
  invoiceCounter?: number;
}
interface PosReturnItem {
  id: string; // original item id
  code?: string;
  barcode?: string;
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

    // User Permission checks
    const isManager = user?.role === 'مسؤول' || user?.id === 'superadmin' || user?.id === 'admin';
    const canProcessReturn = isManager || user?.canProcessReturn === true;
    const canBypassScanner = isManager || user?.canBypassScannerForReturn === true;

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

            // Map all items resolving barcode accurately
            const invoiceItems: PosReturnItem[] = (invoiceToFind.items || []).map((item: any) => {
                const master = (allItems || []).find((m: any) => m.id === item.id || m.code === item.code);
                const resolvedBarcode = item.barcode || item.code || master?.barcode || master?.code || '';
                return {
                    ...item,
                    barcode: resolvedBarcode,
                    code: item.code || master?.code || resolvedBarcode,
                    maxQty: Number(item.qty || 1),
                    previouslyReturned: returnedQuantities.get(item.id) || 0,
                    total: 0,
                    qty: 0,
                    cost: Number(item.cost || item.price || 0)
                };
            });

            if (canBypassScanner) {
                setReturnedItems(invoiceItems);
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

    const handleSelectAllReturnQty = () => {
        setReturnedItems(prev => prev.map(item => {
            const maxReturnable = Math.max(0, item.maxQty - item.previouslyReturned);
            return {
                ...item,
                qty: maxReturnable,
                total: maxReturnable * item.price
            };
        }));
    };

    const handleResetReturnQty = () => {
        setReturnedItems(prev => prev.map(item => ({
            ...item,
            qty: 0,
            total: 0
        })));
    };

    const handleItemScan = (e: React.FormEvent) => {
        e.preventDefault();
        const itemCode = scanInput.trim();
        if (!itemCode || !foundInvoice) return;

        const itemInInvoice = foundInvoice.items.find(i => {
            const master = (allItems || []).find((m: any) => m.id === i.id);
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

        const master = (allItems || []).find((m: any) => m.id === itemInInvoice.id);
        const resolvedBarcode = itemInInvoice.barcode || itemInInvoice.code || master?.barcode || master?.code || '';

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
                barcode: resolvedBarcode,
                code: itemInInvoice.code || master?.code || resolvedBarcode,
                qty: 1,
                total: itemInInvoice.price,
                maxQty: itemInInvoice.qty,
                previouslyReturned: previouslyReturned,
                cost: itemInInvoice.cost || 0
            }]);
        }
        setScanInput('');
    };

    useEffect(() => {
        const total = returnedItems.reduce((sum, item) => sum + item.total, 0);
        setReturnTotal(total);
    }, [returnedItems]);


    const handleSaveReturn = async () => {
        if (!canProcessReturn) {
            toast({ variant: "destructive", title: "غير مصرح", description: "ليس لديك صلاحية إجراء عمليات المرتجع في نقاط البيع." });
            return;
        }

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
                items: itemsToReturn.map(({ maxQty, previouslyReturned, ...rest }) => rest),
                total: returnTotal,
                warehouseId: foundInvoice.warehouseId,
            };

            await dbAction(`posReturns/${dateString}`, 'add', returnData);

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
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 max-w-7xl mx-auto w-full">
                {!canProcessReturn && (
                    <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="font-bold">غير مصرح بإجراء المرتجعات</AlertTitle>
                        <AlertDescription>
                            حسابك الحالي لا يمتلك صلاحية &quot;إجراء عمليات المرتجع&quot;. يرجى مراجعة مسؤول النظام لمنحك هذه الصلاحية.
                        </AlertDescription>
                    </Alert>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base font-bold">البحث عن الفاتورة الأصلية</CardTitle>
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
                        <CardHeader className="border-b pb-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <span>تفاصيل الفاتورة</span>
                                        <Badge variant="outline" className="font-mono text-sm px-2 py-0.5 border-primary/40 text-primary">
                                            #{foundInvoice.invoiceNumber}
                                        </Badge>
                                    </CardTitle>
                                    <CardDescription className="mt-1">
                                        تاريخ الفاتورة: {new Date(foundInvoice.date).toLocaleString('ar-EG')} | الكاشير: {foundInvoice.cashierName || '---'} | الإجمالي: {foundInvoice.total.toLocaleString()} ج.م
                                    </CardDescription>
                                </div>
                                <div>
                                    {canBypassScanner ? (
                                        <Badge className="bg-emerald-600 text-white gap-1.5 text-xs">
                                            <CheckCheck className="h-3.5 w-3.5" />
                                            صلاحية مدير: إرجاع فاتورة كاملة
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="gap-1.5 text-xs">
                                            <ScanLine className="h-3.5 w-3.5 text-muted-foreground" />
                                            نمط الكاشير: إلزام مسح الباركود
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            {canBypassScanner ? (
                                 <div className="space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <Label className="font-bold text-sm">تحديد الأصناف والكميات المرتجعة</Label>
                                            <p className="text-xs text-muted-foreground">يمكنك إدخال الكميات يدوياً أو استخدام الأزرار السريعة لإرجاع الفاتورة كاملة</p>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <Button 
                                                type="button" 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={handleSelectAllReturnQty} 
                                                className="gap-1.5 text-xs text-primary border-primary/40 hover:bg-primary/10"
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" />
                                                إرجاع الفاتورة كاملة
                                            </Button>
                                            <Button 
                                                type="button" 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={handleResetReturnQty} 
                                                className="text-xs text-muted-foreground hover:text-destructive"
                                            >
                                                تصفير الكميات
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="w-full overflow-auto border rounded-lg">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-muted/40">
                                                    <TableHead className="text-right">الصنف</TableHead>
                                                    <TableHead className="text-center w-36">الباركود</TableHead>
                                                    <TableHead className="text-center w-28">الكمية المباعة</TableHead>
                                                    <TableHead className="text-center w-28">مرتجعات سابقة</TableHead>
                                                    <TableHead className="text-center w-32">الكمية المرتجعة</TableHead>
                                                    <TableHead className="text-center w-28">السعر</TableHead>
                                                    <TableHead className="text-center w-32">إجمالي المرتجع</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {returnedItems.map(item => (
                                                    <TableRow key={item.id} className={item.qty > 0 ? "bg-primary/5" : ""}>
                                                        <TableCell className="text-right font-medium">
                                                            <div>{item.name}</div>
                                                            {item.code && item.code !== item.barcode && (
                                                                <div className="text-[11px] text-muted-foreground font-mono">كود: {item.code}</div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono text-xs">
                                                            {item.barcode ? (
                                                                <Badge variant="outline" className="font-mono text-xs gap-1 border-muted-foreground/30">
                                                                    <BarcodeIcon className="h-3 w-3 text-muted-foreground" />
                                                                    {item.barcode}
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground text-xs">---</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">{item.maxQty}</TableCell>
                                                        <TableCell className="text-center text-muted-foreground">{item.previouslyReturned}</TableCell>
                                                        <TableCell className="text-center">
                                                            <Input 
                                                                type="number" 
                                                                value={item.qty} 
                                                                onChange={(e) => handleQtyChange(item.id, Number(e.target.value))} 
                                                                className="text-center font-bold h-9 mx-auto max-w-[100px]" 
                                                                max={item.maxQty - item.previouslyReturned} 
                                                                min={0} 
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-center">{item.price.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center font-semibold text-destructive">
                                                            {item.total.toLocaleString()} ج.م
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <form onSubmit={handleItemScan} className="space-y-2">
                                            <Label htmlFor='scan-item' className="font-semibold text-sm">مسح باركود الصنف للإرجاع</Label>
                                            <div className="flex gap-2">
                                                <Input 
                                                    ref={itemScanRef} 
                                                    id="scan-item" 
                                                    dir="ltr"
                                                    className="font-mono text-left"
                                                    value={scanInput} 
                                                    onChange={e => setScanInput(e.target.value)} 
                                                    placeholder="امسح باركود الصنف المرتجع هنا..." 
                                                />
                                                <Button type="submit" variant="outline" className="gap-1.5">
                                                    <ScanLine className="h-4 w-4" />
                                                    مسح
                                                </Button>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                وفقاً لصلاحيات الكاشير، يجب تمرير وقراءة باركود الصنف فعلياً لإضافته لسلة المرتجع.
                                            </p>
                                        </form>
                                    </div>
                                    <div>
                                        <Label className="font-semibold text-sm">الأصناف المرتجعة بالسلة</Label>
                                        <div className="w-full overflow-auto border rounded-lg h-56 mt-2">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-muted/40">
                                                        <TableHead className="text-right">الصنف</TableHead>
                                                        <TableHead className="text-center">الباركود</TableHead>
                                                        <TableHead className="text-center">الكمية</TableHead>
                                                        <TableHead className="text-center">الإجمالي</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {returnedItems.map(item => (
                                                        <TableRow key={item.id}>
                                                            <TableCell className="text-right font-medium">{item.name}</TableCell>
                                                            <TableCell className="text-center font-mono text-xs">
                                                                <Badge variant="outline" className="font-mono text-[11px]">
                                                                    {item.barcode || item.code || '---'}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-center font-bold">{item.qty}</TableCell>
                                                            <TableCell className="text-center font-semibold text-destructive">{item.total.toLocaleString()} ج.م</TableCell>
                                                        </TableRow>
                                                    ))}
                                                     {returnedItems.length === 0 && (
                                                        <TableRow>
                                                            <TableCell colSpan={4} className="text-center text-muted-foreground p-6">
                                                                لم يتم مسح أي أصناف بعد. يرجى مسح باركود الصنف أعلاه.
                                                            </TableCell>
                                                        </TableRow>
                                                     )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <Alert className="mt-4 bg-muted/30">
                                <Info className="h-4 w-4 text-primary" />
                                <AlertTitle className="font-bold">التأثير المحاسبي والمخزني</AlertTitle>
                                <AlertDescription className="text-xs text-muted-foreground">
                                    عند تأكيد الحفظ، يتم استرداد الأصناف المرتجعة وزيادة رصيدها المخزني مباشرة في الفرع، وخصم قيمة المرتجع من يومية المبيعات.
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                        <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-4">
                            <p className="text-xl font-bold">
                                إجمالي قيمة المرتجع: <span className="text-destructive font-mono mr-1">{returnTotal.toLocaleString()} ج.م</span>
                            </p>
                            <Button 
                                size="lg" 
                                onClick={handleSaveReturn} 
                                disabled={returnTotal <= 0 || !canProcessReturn}
                                className="px-8 font-bold gap-2"
                            >
                                <Save className="h-4 w-4" />
                                حفظ وتأكيد المرتجع
                            </Button>
                        </CardFooter>
                    </Card>
                )}
            </main>
        </>
    );
}
