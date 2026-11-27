"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, ShoppingCart, XCircle, Printer, Grip, Dot, Search, Ban, PanelLeft, Boxes, SquareCheck, ListRestart, FileClock, Eye, Loader2, Undo2, PlusCircle, UserPlus, LogOut, Percent, Truck, ArrowLeft, Banknote, Landmark, Wallet, Phone, CircleDollarSign, FileText, CreditCard, UserRound, User as UserIcon, PlayCircle, History, Coins, Building2, LayoutDashboard, Monitor, Gift, MessageCircle, Settings2, PowerOff, Camera, AlertTriangle, PauseCircle, UtensilsCrossed, ArrowRightLeft, GitMerge } from "lucide-react";
import { transferTableOrder, mergeTableOrders } from "@/lib/table-actions";
import CameraBarcodeScanner from '@/components/camera-barcode-scanner';
import { PosSyncStatusBadge } from '@/components/pos-sync-status-badge';
import { PosSilentPrinterDialog, getPosSilentPrinterConfig } from '@/components/pos-silent-printer-dialog';
import {
    getCustomerExperienceConfig,
    calculateEarnedPoints,
    calculateInvoiceLoyaltyPoints,
    getItemPointsPromotion,
    calculateRedeemableCash,
    broadcastToCustomerDisplay,
    openCustomerDisplayWindow,
    closeCustomerDisplayWindow,
    isCustomerDisplayWindowOpen,
    buildWhatsAppInvoiceMessage,
    sendWhatsAppMessage,
} from '@/lib/customer-experience';
import { isPromotionCurrentlyActive } from '@/lib/promotions-engine';
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/auth-context';
import { usePermissions } from '@/contexts/permissions-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogClose, DialogContent as UIDialogContent, DialogFooter as UIDialogFooter, DialogHeader as UIDialogHeader, DialogTitle as UIDialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { usePosInvoiceCounter } from '@/hooks/use-pos-invoice-counter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PosReceipt } from '@/components/pos-receipt';
import { createRoot } from 'react-dom/client';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useRouter, useSearchParams } from 'next/navigation';
import { Combobox } from '@/components/ui/combobox';
import { AddEntityDialog } from '@/components/add-entity-dialog';
import { Switch } from '@/components/ui/switch';
import { renderToString } from 'react-dom/server';
import { KitchenReceipt } from '@/components/kitchen-receipt';
import { Component as ComponentIcon } from 'lucide-react';
import { calculateStockForItemInWarehouse } from '@/lib/inventory-utils';

const isWeightUnit = (unit?: string) => ['kilo', 'gram', 'meter', 'كيلو', 'جرام', 'متر'].includes(unit?.toLowerCase() || '');

const DEFAULT_POS_SETTINGS = {
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
    fontSizes: {
        companyName: 16,
        header: 12,
        items: 10,
        totals: 11,
        barcode: 12,
    }
}

const DEFAULT_KITCHEN_SETTINGS = {
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

const DEFAULT_PRINTER_SETTINGS = {
    posPrinterType: 'system',
    posPrinterAddress: '',
    useKitchenPrinter: false,
    kitchenPrinterType: 'system',
    kitchenPrinterAddress: '',
    kitchenPrinterCategories: [],
    a4PrinterType: 'system',
    a4PrinterAddress: '',
    barcodePrinterType: 'system',
    barcodePrinterAddress: '',
};

interface PosItem {
  id: string; 
  code: string;
  name: string;
  qty: number;
  price: number; 
  cost: number;
  total: number;
  originalPrice: number; 
  discountApplied: number; 
  uniqueId: string; 
  promoApplied?: string | null; 
  categoryId?: string; 
  unit: string; 
  conversionFactor: number; 
}

interface ItemCategory {
  id: string;
  name: string;
  color?: string; 
  showOnPos?: boolean;
}

interface HeldInvoice {
    id: string;
    heldAt: string;
    cashierName: string;
    itemCount: number;
    total: number;
    cart: PosItem[];
    discount: number;
    tips?: number;
    orderReference?: string;
    tableId?: string;
    tableName?: string;
}
interface Customer {
  id?: string;
  name: string;
  openingBalance: number;
  creditLimit: number;
  phone?: string;
  address?: string;
  allowCredit?: boolean;
  currentBalance?: number;
}

interface Payment {
  method: string;
  amount: number;
  id: string; 
}

const paymentMethodIcons: Record<string, React.ReactNode> = {
    cash: <Banknote className="h-8 w-8 md:h-10 md:w-10"/>,
    visa: <CreditCard className="h-8 w-8 md:h-10 md:w-10"/>,
    instapay: <CircleDollarSign className="h-8 w-8 md:h-10 md:w-10"/>,
    vodafone_cash: <Phone className="h-8 w-8 md:h-10 md:w-10"/>,
    coupon: <Percent className="h-8 w-8 md:h-10 md:w-10"/>,
    fawry: <FileText className="h-8 w-8 md:h-10 md:w-10"/>
};

const PaymentDialog = ({ onAddPayment, totalDue, paymentMethods }: { onAddPayment: (payment: Omit<Payment, 'id'>) => void, totalDue: number, paymentMethods: any[] }) => {
    const [amount, setAmount] = useState<string | number>(0);
    const [method, setMethod] = useState('');
    const amountInputRef = useRef<HTMLInputElement>(null);

    // دالة مساعدة لتركيز وتظليل المبلغ فوراً
    const focusAndSelectAmount = useCallback(() => {
        const input = amountInputRef.current;
        if (input) {
            input.focus();
            input.select();
        }
    }, []);

    useEffect(() => {
        setAmount(totalDue > 0 ? Number(totalDue.toFixed(2)) : 0);
        if (paymentMethods.length > 0 && !method) {
            setMethod(paymentMethods[0].name);
        }
        // تركيز وتظليل فوري بمجرد فتح النافذة
        const timer1 = setTimeout(focusAndSelectAmount, 50);
        const timer2 = setTimeout(focusAndSelectAmount, 150);
        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
        };
    }, [totalDue, paymentMethods, method, focusAndSelectAmount]);

    const handleMethodSelect = (selectedMethod: string) => {
        setMethod(selectedMethod);
        // عند اختيار أي طريقة دفع: تظليل المبلغ فوراً استعداداً للكتابة
        setTimeout(focusAndSelectAmount, 30);
    }

    const handleAdd = () => {
        const numericAmount = Number(amount);
        if (numericAmount > 0 && method) {
            onAddPayment({ method, amount: numericAmount });
        }
    }
    
    const handleNumpadClick = (value: string) => {
        if (value === 'C') {
            setAmount(0);
        } else if (value === 'backspace') {
            setAmount(prev => String(prev).slice(0, -1) || 0);
        } else {
            setAmount(prev => {
                const current = String(prev);
                if (value === '.' && current.includes('.')) return current;
                return current === '0' && value !== '.' ? value : current + value;
            });
        }
        amountInputRef.current?.focus();
    };


    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
        }
    };

    return (
         <UIDialogContent onKeyDown={handleKeyDown} className="sm:max-w-2xl md:max-w-3xl">
            <UIDialogHeader>
                <UIDialogTitle>إضافة طريقة دفع</UIDialogTitle>
                <DialogDescription className="sr-only">نافذة إضافة وتحديد طريقة الدفع</DialogDescription>
            </UIDialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 py-4">
                         {(paymentMethods || []).map(pm => {
                            const isSelected = method === pm.name;
                            const customStyle = pm.color ? {
                                backgroundColor: isSelected ? pm.color : 'transparent',
                                borderColor: pm.color,
                                color: isSelected ? '#ffffff' : pm.color
                            } : {};

                            return (
                            <Button 
                                key={pm.id} 
                                variant={isSelected ? 'default' : 'outline'} 
                                className="h-auto min-h-[6rem] md:min-h-[7rem] flex-col gap-2 rounded-lg px-2 py-3 text-sm md:text-base whitespace-normal break-words leading-tight hover:opacity-90 transition-opacity" 
                                style={customStyle}
                                onClick={() => handleMethodSelect(pm.name)}
                            >
                                {paymentMethodIcons[pm.code.toLowerCase().replace(/\s/g, '_')] || <Wallet className="h-8 w-8 md:h-10 md:w-10"/>}
                                <span className="font-semibold text-center w-full">{pm.name}</span>
                            </Button>
                        )})}
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="payment-amount">المبلغ</Label>
                        <Input 
                            id="payment-amount" 
                            type="number" 
                            ref={amountInputRef}
                            value={amount} 
                            onChange={(e: any) => setAmount(e.target.value)} 
                            className="text-2xl h-14 text-center font-bold" 
                            onFocus={e => e.target.select()}
                            onClick={e => (e.target as HTMLInputElement).select()}
                            autoFocus
                        />
                     </div>
                      <Button className="h-14 text-xl" onClick={handleAdd}>إضافة الدفعة</Button>
                </div>
                 <div className="grid grid-cols-3 gap-3">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'].map((key) => (
                        <Button key={key} variant="outline" className="h-16 text-2xl" onClick={() => handleNumpadClick(key)}>
                            {key === 'backspace' ? '⌫' : key}
                        </Button>
                    ))}
                    <Button variant="destructive" className="h-16 text-2xl" onClick={() => handleNumpadClick('C')}>C</Button>
                </div>
            </div>
        </UIDialogContent>
    )
};


const SellerSelectionDialog = ({ onSelectSeller, warehouseId }: { onSelectSeller: (sellerId: string) => void, warehouseId: string }) => {
    const { sellers } = useData();

    const sellersForWarehouse = useMemo(() => {
        return sellers.filter((s: any) => s.warehouseId === warehouseId);
    }, [sellers, warehouseId]);

    return (
        <UIDialogContent>
            <UIDialogHeader>
                <UIDialogTitle>اختر البائع</UIDialogTitle>
                <DialogDescription>الرجاء تحديد البائع المسؤول عن هذه الفاتورة.</DialogDescription>
            </UIDialogHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 py-4">
                {(sellersForWarehouse || []).map((seller: any) => (
                     <Button 
                        key={seller.id} 
                        variant="outline" 
                        className="h-24 flex-col gap-2"
                        onClick={() => onSelectSeller(seller.id)}
                     >
                        <div className={`w-6 h-6 rounded-full ${seller.color || 'bg-gray-400'}`} />
                        <span className="font-semibold">{seller.name}</span>
                    </Button>
                ))}
                {sellersForWarehouse.length === 0 && (
                    <p className="col-span-full text-center text-muted-foreground">لا يوجد بائعون معرفون في هذا الفرع.</p>
                )}
            </div>
        </UIDialogContent>
    )
}

const normalizeArabic = (text: string): string => {
    if (!text) return "";
    return text
        .toLowerCase()
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/[\u064B-\u065F]/g, "")
        .trim();
};

const matchesArabicSearch = (text: string | undefined, query: string): boolean => {
    const normQuery = normalizeArabic(query);
    if (!normQuery) return true;
    if (!text) return false;
    const normText = normalizeArabic(text);
    const words = normQuery.split(/\s+/).filter(Boolean);
    return words.every((w) => normText.includes(w));
};

interface StockQueryItemResult {
    item: any;
    totalStock: number;
    branches: { warehouseName: string; stock: number; price: number }[];
}

const StockQueryDialog = ({ 
    onOpenChange, 
    onAddToCart, 
    ...allDataContext 
}: { 
    onOpenChange: (open: boolean) => void; 
    onAddToCart?: (item: any) => void; 
    [key: string]: any 
}) => {
    const { items: allItems, warehouses, inventorySections } = allDataContext;
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);

    const allWarehouses = useMemo(() => {
        return [...(warehouses || []), ...(inventorySections || []).map((s: any) => ({ ...s, isSection: true }))];
    }, [warehouses, inventorySections]);

    // Live search of matching items as user types
    const matchingItems: StockQueryItemResult[] = useMemo(() => {
        const query = normalizeArabic(searchTerm);
        if (!query) return [];

        const words = query.split(/\s+/).filter(Boolean);

        const filtered = (allItems || []).filter((item: any) => {
            const normName = normalizeArabic(String(item.name ?? item.Name ?? ''));
            const normCode = String(item.code ?? item.Code ?? '').toLowerCase();
            const normBarcode = String(item.barcode ?? item.Barcode ?? '').toLowerCase();

            const nameMatches = words.every(w => normName.includes(w));
            const codeMatches = normCode.includes(query) || normBarcode.includes(query);

            return nameMatches || codeMatches;
        });

        return filtered.map((item: any) => {
            const branches: { warehouseName: string; stock: number; price: number }[] = [];
            let totalStock = 0;

            allWarehouses.forEach((w: any) => {
                const stock = calculateStockForItemInWarehouse(item.id, w.id, allDataContext);
                if (stock > 0) {
                    branches.push({ warehouseName: w.name, stock, price: item.price || 0 });
                    totalStock += stock;
                }
            });

            return { item, totalStock, branches };
        });
    }, [searchTerm, allItems, allWarehouses, allDataContext]);

    // Auto-select first item if current selected item is not in matching items
    useEffect(() => {
        if (matchingItems.length > 0) {
            if (!selectedItemId || !matchingItems.some(m => m.item.id === selectedItemId)) {
                setSelectedItemId(matchingItems[0].item.id);
            }
        } else {
            setSelectedItemId(null);
        }
    }, [matchingItems, selectedItemId]);

    const activeItemResult = useMemo(() => {
        return matchingItems.find(m => m.item.id === selectedItemId) || matchingItems[0] || null;
    }, [matchingItems, selectedItemId]);

    return (
         <UIDialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
            <UIDialogHeader>
                <UIDialogTitle className="flex items-center gap-2">
                    <Boxes className="h-5 w-5 text-primary" />
                    الاستعلام عن أرصدة الأصناف
                </UIDialogTitle>
                <DialogDescription>
                    ابحث بجزء من اسم الصنف أو الباركود لمعاينة الأرصدة في كافة الفروع والمخازن.
                </DialogDescription>
            </UIDialogHeader>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="ابحث باسم الصنف أو الكود أو الباركود..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        autoFocus
                        className="pl-9 text-base"
                    />
                </div>
                <Button 
                    type="button" 
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 shrink-0 bg-primary/10 text-primary border-primary/30 rounded-lg"
                    title="مسح الباركود بكاميرا الموبايل"
                    onClick={() => setIsCameraOpen(true)}
                >
                    <Camera className="h-4 w-4" />
                </Button>
                {searchTerm && (
                    <Button variant="ghost" size="sm" onClick={() => setSearchTerm('')}>
                        مسح
                    </Button>
                )}
            </div>

            {/* Results display */}
            <div className="flex-1 overflow-y-auto space-y-3 pt-1">
                {searchTerm.trim() ? (
                    matchingItems.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                            <p className="font-semibold">لم يتم العثور على أي صنف يحتوي على "{searchTerm}"</p>
                            <p className="text-xs text-muted-foreground mt-1">تأكد من كتابة الاسم أو جرب كلمة بحث أخرى</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Matching items selector when multiple items found */}
                            <div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5 px-0.5">
                                    <span className="font-bold text-foreground">
                                        الأصناف المطابقة ({matchingItems.length}):
                                    </span>
                                    <span>اضغط على أي صنف لمعاينة تفاصيل فروعه</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-muted/40 rounded-lg border">
                                    {matchingItems.map(m => {
                                        const isSelected = m.item.id === activeItemResult?.item.id;
                                        return (
                                            <Button
                                                key={m.item.id}
                                                size="sm"
                                                variant={isSelected ? "default" : "outline"}
                                                className={cn(
                                                    "h-auto py-1 px-2.5 text-xs flex items-center gap-2 rounded-md transition-all",
                                                    isSelected ? "shadow-sm font-bold" : "hover:bg-muted"
                                                )}
                                                onClick={() => setSelectedItemId(m.item.id)}
                                            >
                                                <span>{m.item.name}</span>
                                                <Badge 
                                                    variant={m.totalStock > 0 ? "secondary" : "destructive"} 
                                                    className={cn("text-[10px] px-1.5 py-0 h-4 font-mono", isSelected ? "bg-primary-foreground text-primary" : "")}
                                                >
                                                    {m.totalStock > 0 ? `${m.totalStock} متاح` : 'نفد'}
                                                </Badge>
                                            </Button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Details of currently active item */}
                            {activeItemResult && (
                                <div className="border rounded-lg p-3 bg-card space-y-3">
                                    <div className="flex items-center justify-between border-b pb-2">
                                        <div>
                                            <h4 className="font-bold text-base text-foreground flex items-center gap-2">
                                                {activeItemResult.item.name}
                                                <Badge variant="outline" className="font-mono text-xs font-normal">
                                                    كود: {activeItemResult.item.code || '-'}
                                                </Badge>
                                            </h4>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                السعر: <span className="font-bold text-foreground font-mono">{activeItemResult.item.price?.toLocaleString()} ج.م</span> | إجمالي الرصيد: <span className={cn("font-bold font-mono", activeItemResult.totalStock > 0 ? "text-green-600" : "text-destructive")}>{activeItemResult.totalStock}</span>
                                            </p>
                                        </div>
                                        {onAddToCart && (
                                            <Button 
                                                size="sm" 
                                                className="gap-1 font-bold"
                                                onClick={() => {
                                                    onAddToCart(activeItemResult.item);
                                                    onOpenChange(false);
                                                }}
                                            >
                                                <PlusCircle className="h-4 w-4" />
                                                إضافة للسلة
                                            </Button>
                                        )}
                                    </div>

                                    <div className="max-h-52 overflow-y-auto border rounded-md">
                                        <Table dir="rtl">
                                            <TableHeader>
                                                <TableRow className="bg-muted/50">
                                                    <TableHead className="text-right">الفرع / المخزن</TableHead>
                                                    <TableHead className="text-center">الكمية المتاحة</TableHead>
                                                    <TableHead className="text-center">السعر</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {activeItemResult.branches.length > 0 ? (
                                                    activeItemResult.branches.map(r => (
                                                        <TableRow key={r.warehouseName}>
                                                            <TableCell className="font-medium text-right">{r.warehouseName}</TableCell>
                                                            <TableCell className="text-center">
                                                                <Badge className="bg-green-600/90 text-white font-mono px-2">
                                                                    {r.stock}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-center font-mono font-semibold">
                                                                {r.price.toLocaleString()}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={3} className="text-center text-muted-foreground p-4">
                                                            لا توجد أرصدة متاحة لهذا الصنف في أي فرع حالياً.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                ) : (
                    <div className="text-center py-10 text-muted-foreground space-y-1">
                        <Search className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-sm">اكتب جزءاً من اسم الصنف لعرض كل الأصناف التي تحتوي عليه وأرصدتها فوراً.</p>
                    </div>
                )}
            </div>
            <CameraBarcodeScanner 
                isOpen={isCameraOpen} 
                onOpenChange={setIsCameraOpen} 
                onScan={(code) => setSearchTerm(code)} 
                defaultContinuous={false} 
            />
        </UIDialogContent>
    );
};



const DeliveryPersonDialog = ({ onSelect, onOpenChange }: { onSelect: (id: string) => void, onOpenChange: (open: boolean) => void }) => {
    const { deliveryStaff } = useData(); 

    const handleSelect = (id: string) => {
        onSelect(id);
        onOpenChange(false);
    };

    return (
        <UIDialogContent>
            <UIDialogHeader>
                <UIDialogTitle>اختر الطيار المسؤول</UIDialogTitle>
                <DialogDescription className="sr-only">تحديد مسؤول توصيل الطلب</DialogDescription>
            </UIDialogHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 py-4">
                {(deliveryStaff || []).map((staff: any) => (
                    <Button
                        key={staff.id}
                        variant="outline"
                        className="h-20 flex-col gap-2"
                        onClick={() => handleSelect(staff.id)}
                    >
                        <Truck className="h-6 w-6" />
                        <span>{staff.name}</span>
                    </Button>
                ))}
                {(!deliveryStaff || deliveryStaff.length === 0) && (
                    <p className="col-span-full text-center text-muted-foreground">لا يوجد موظفو توصيل معرفون في النظام.</p>
                )}
            </div>
        </UIDialogContent>
    );
};

const NewCustomerForm = ({ onSave, onClose, allCustomers }: { onSave: (customer: any) => void, onClose: () => void, allCustomers: Customer[] }) => {
    const [formData, setFormData] = useState({ name: '', phone: '', address: '', allowCredit: false });
    const { toast } = useToast();

    const handleSave = () => {
        if (!formData.name || !formData.phone?.trim()) {
            toast({
                variant: "destructive",
                title: "بيانات ناقصة",
                description: "يرجى إدخل اسم العميل ورقم الهاتف.",
            });
            return;
        }

        const isPhoneDuplicate = allCustomers.some(c => c.phone?.trim() === formData.phone?.trim());
        if (isPhoneDuplicate) {
            toast({
                variant: "destructive",
                title: "رقم هاتف مكرر",
                description: "هذا الرقم مسجل لعميل آخر. يرجى إدخل رقم مختلف.",
            });
            return;
        }

        onSave({ ...formData, openingBalance: 0, creditLimit: 0 });
        onClose();
    }

    return (
        <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cust-name" className="text-right">الاسم</Label>
                <Input id="cust-name" value={formData.name} onChange={(e: any) => setFormData((p: { name: string; phone: string; address: string; allowCredit: boolean }) => ({...p, name: e.target.value}))} className="col-span-3"/>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cust-phone" className="text-right">الهاتف</Label>
                <Input id="cust-phone" value={formData.phone} onChange={(e: any) => setFormData((p: { name: string; phone: string; address: string; allowCredit: boolean }) => ({...p, phone: e.target.value}))} className="col-span-3"/>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cust-address" className="text-right">العنوان</Label>
                <Input id="cust-address" value={formData.address} onChange={(e: any) => setFormData((p: { name: string; phone: string; address: string; allowCredit: boolean }) => ({...p, address: e.target.value}))} className="col-span-3"/>
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cust-credit" className="text-right">عميل آجل</Label>
                <div className="col-span-3">
                   <Switch id="cust-credit" checked={formData.allowCredit} onCheckedChange={checked => setFormData(p => ({...p, allowCredit: !!checked}))} />
                </div>
            </div>
             <div className="flex justify-end pt-4">
                <Button onClick={handleSave}>حفظ العميل</Button>
            </div>
        </div>
    )
}

const HeldInvoicesDialog = ({ onRetrieve, onClose }: { onRetrieve: (invoice: HeldInvoice) => void, onClose: () => void }) => {
    const { heldInvoices, dbAction, loading } = useData();

    const nonTableInvoices = useMemo(() => {
        return (heldInvoices || []).filter((inv: HeldInvoice) => inv && !inv.tableId);
    }, [heldInvoices]);


    const handleRetrieve = (invoice: HeldInvoice) => {
        const safeCart = Array.isArray(invoice.cart)
            ? invoice.cart
            : Array.isArray((invoice as any).items)
            ? (invoice as any).items
            : [];
        onRetrieve({ ...invoice, cart: safeCart });
        dbAction('heldInvoices', 'remove', {id: invoice.id});
        onClose();
    }
    
    return (
        <UIDialogContent className="sm:max-w-3xl">
             <UIDialogHeader>
                <UIDialogTitle>الفواتير المعلقة (بدون طاولة)</UIDialogTitle>
                <DialogDescription>قائمة الفواتير المحفوظة مؤقتاً للرجوع إليها واستكمال البيع.</DialogDescription>
             </UIDialogHeader>
             {loading ? <Loader2 className="animate-spin mx-auto"/> : (
             <div className="max-h-96 overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>وقت التعليق</TableHead>
                            <TableHead>الكاشير</TableHead>
                            <TableHead>المرجع/الطلب</TableHead>
                            <TableHead>الإجمالي</TableHead>
                            <TableHead className="text-center">الإجراءات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {nonTableInvoices && nonTableInvoices.length > 0 ? nonTableInvoices.map((inv: HeldInvoice) => (
                            <Dialog key={inv.id}>
                                <TableRow>
                                    <TableCell>{new Date(inv.heldAt).toLocaleTimeString('ar-EG')}</TableCell>
                                    <TableCell>{inv.cashierName}</TableCell>
                                    <TableCell>{inv.tableName || inv.orderReference || 'N/A'}</TableCell>
                                    <TableCell>{inv.total.toLocaleString()}</TableCell>
                                    <TableCell className="text-center space-x-2">
                                         <DialogTrigger asChild>
                                            <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                                        </DialogTrigger>
                                        <Button size="sm" onClick={() => handleRetrieve(inv)}>استرجاع</Button>
                                    </TableCell>
                                </TableRow>
                                <UIDialogContent>
                                    <UIDialogHeader>
                                        <UIDialogTitle>أصناف الفاتورة المعلقة</UIDialogTitle>
                                        <DialogDescription className="sr-only">عرض تفاصيل وبنود الفاتورة المعلقة</DialogDescription>
                                    </UIDialogHeader>
                                    <Table>
                                        <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead>الكمية</TableHead><TableHead>السعر</TableHead><TableHead>الإجمالي</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {(Array.isArray(inv.cart) ? inv.cart : (Array.isArray((inv as any).items) ? (inv as any).items : [])).map((item: any, idx: number) => (
                                                <TableRow key={item.uniqueId || item.id || idx}>
                                                    <TableCell>{item.name}</TableCell>
                                                    <TableCell>{item.qty}</TableCell>
                                                    <TableCell>{item.price}</TableCell>
                                                    <TableCell>{item.total}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </UIDialogContent>
                            </Dialog>
                        )) : <TableRow><TableCell colSpan={5} className="text-center py-4">لا توجد فواتير معلقة.</TableCell></TableRow>}
                    </TableBody>
                </Table>
             </div>
             )}
        </UIDialogContent>
    )
}


const ManualEntryDialog = ({ item, onConfirm, onClose, rounding, defaultFocus }: { item: any, onConfirm: (data: { qty: number, total: number }) => void, onClose: () => void, rounding: number, defaultFocus: 'weight' | 'price' }) => {
    const [weight, setWeight] = useState(0);
    const [price, setPrice] = useState(0);
    const itemPricePerUnit = item.price || 0;
    
    const weightInputRef = useRef<HTMLInputElement>(null);
    const priceInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setTimeout(() => {
            if (defaultFocus === 'weight' && weightInputRef.current) {
                weightInputRef.current.focus();
                weightInputRef.current.select();
            } else if (defaultFocus === 'price' && priceInputRef.current) {
                priceInputRef.current.focus();
                priceInputRef.current.select();
            }
        }, 100);
    }, [defaultFocus]);

    const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newWeight = parseFloat(e.target.value) || 0;
        setWeight(newWeight);
        const newPrice = newWeight * itemPricePerUnit;
        setPrice(Number(newPrice.toFixed(rounding)));
    };
    
    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPrice = parseFloat(e.target.value) || 0;
        setPrice(newPrice);
        if (itemPricePerUnit > 0) {
            const newWeight = newPrice / itemPricePerUnit;
            setWeight(Number(newWeight.toFixed(rounding + 1))); 
        }
    };
    
    const handleSubmit = () => {
        if(weight > 0 && price > 0) {
            onConfirm({ qty: weight, total: price });
        }
        onClose();
    }
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        }
    }


    return (
        <AlertDialogContent onKeyDown={(e) => { if(e.key === 'Escape') onClose()}}>
            <AlertDialogHeader>
                <AlertDialogTitle>إدخال يدوي للصنف: {item.name}</AlertDialogTitle>
                <AlertDialogDescription>سعر الوحدة: {itemPricePerUnit.toFixed(rounding)} ج.م</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="manual-weight" className="text-right">الوزن (كجم)</Label>
                    <Input ref={weightInputRef} id="manual-weight" type="number" value={weight} onFocus={e => e.target.select()} onChange={handleWeightChange} onKeyDown={handleKeyDown} className="col-span-3"/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="manual-price" className="text-right">السعر الإجمالي</Label>
                    <Input ref={priceInputRef} id="manual-price" type="number" value={price} onFocus={e => e.target.select()} onChange={handlePriceChange} onKeyDown={handleKeyDown} className="col-span-3"/>
                </div>
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={onClose}>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleSubmit}>إضافة</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    );
};

const SecondaryUnitDialog = ({ item, onSelectUnit, onClose }: { item: any, onSelectUnit: (unit: any, qty: number) => void, onClose: () => void }) => {
    const [selectedUnit, setSelectedUnit] = useState<any | null>(null);
    const [quantity, setQuantity] = useState(1);

    const units = useMemo(() => {
        const base = { name: item.baseUnit || 'قطعة', conversionFactor: 1, price: item.price };
        return [base, ...(item.secondaryUnits || [])];
    }, [item]);

    useEffect(() => {
        if (units.length > 0) {
            setSelectedUnit(units[0]);
        }
    }, [units]);

    const handleSelect = () => {
        if (selectedUnit && quantity > 0) {
            onSelectUnit(selectedUnit, quantity);
            onClose();
        }
    };
    
    if (!selectedUnit) return null;

    return (
         <UIDialogContent>
            <UIDialogHeader>
                <UIDialogTitle>اختر الوحدة والكمية لـ: {item.name}</UIDialogTitle>
                <DialogDescription className="sr-only">تحديد وحدة وكمية الصنف</DialogDescription>
            </UIDialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>الوحدة</Label>
                    <div className="flex flex-wrap gap-2">
                        {units.map(unit => (
                            <Button 
                                key={unit.name} 
                                variant={selectedUnit.name === unit.name ? "default" : "outline"}
                                onClick={() => setSelectedUnit(unit)}
                            >
                                {unit.name} ({unit.price?.toLocaleString()} ج.م)
                            </Button>
                        ))}
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="unit-quantity">الكمية</Label>
                    <Input 
                        id="unit-quantity"
                        type="number"
                        value={quantity}
                        onChange={e => setQuantity(Number(e.target.value))}
                        min={1}
                        className="text-center text-lg h-12"
                    />
                </div>
                <p className="text-sm text-muted-foreground">
                    الرصيد المتاح من الوحدة الأساسية: {item.stock?.toLocaleString()} {item.baseUnit}
                </p>
            </div>
            <UIDialogFooter>
                <Button variant="ghost" onClick={onClose}>إلغاء</Button>
                <Button onClick={handleSelect}>إضافة للسلة</Button>
            </UIDialogFooter>
        </UIDialogContent>
    );
};

const QuantityEditDialog = ({ item, onConfirm, onClose }: { item: PosItem, onConfirm: (newQty: number) => void, onClose: () => void }) => {
    const [quantity, setQuantity] = useState<string>(item.qty.toString());
    const [isFirstEdit, setIsFirstEdit] = useState(true);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 50);
    }, []);

    const handleNumpadClick = (value: string) => {
        if (value === 'C') {
            setQuantity('0');
            setIsFirstEdit(false);
        } else if (value === 'backspace') {
            setQuantity(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
            setIsFirstEdit(false);
        } else {
            if (isFirstEdit) {
                setQuantity(value === '.' ? '0.' : value);
                setIsFirstEdit(false);
            } else {
                setQuantity(prev => {
                    if (value === '.' && prev.includes('.')) return prev;
                    return prev === '0' && value !== '.' ? value : prev + value;
                });
            }
        }
        inputRef.current?.focus();
    };

    const handleConfirm = () => {
        const val = parseFloat(quantity);
        if (!isNaN(val) && val >= 0) {
            onConfirm(val);
        }
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        }
    };

    return (
        <UIDialogContent className="sm:max-w-sm">
            <UIDialogHeader>
                <UIDialogTitle>تعديل الكمية: {item.name}</UIDialogTitle>
                <DialogDescription className="sr-only">تعديل كمية الصنف في السلة</DialogDescription>
            </UIDialogHeader>
            <div className="grid gap-4 py-4">
                <div className="flex items-center gap-4">
                    <Label htmlFor="qty-edit" className="text-right w-20">الكمية</Label>
                    <Input 
                        id="qty-edit" 
                        ref={inputRef}
                        type="number" 
                        value={quantity} 
                        onChange={e => setQuantity(e.target.value)} 
                        onKeyDown={handleKeyDown}
                        className="text-2xl h-14 text-center" 
                        onFocus={e => e.target.select()}
                    />
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'].map((key) => (
                        <Button key={key} variant="outline" className="h-14 text-xl" onClick={() => handleNumpadClick(key)}>
                            {key === 'backspace' ? '⌫' : key}
                        </Button>
                    ))}
                    <Button variant="destructive" className="h-14 text-xl col-span-3" onClick={() => handleNumpadClick('C')}>مسح</Button>
                </div>
            </div>
            <UIDialogFooter>
                <Button variant="outline" onClick={onClose}>إلغاء</Button>
                <Button onClick={handleConfirm}>تأكيد</Button>
            </UIDialogFooter>
        </UIDialogContent>
    );
};

const SelfShiftOpeningDialog = ({ onConfirm, onClose, warehouses, terminals, activeSessions }: { onConfirm: (data: { posTerminalId: string, sessionWarehouseId: string }) => void, onClose: () => void, warehouses: any[], terminals: any[], activeSessions: any[] }) => {
    const [posTerminalId, setPosTerminalId] = useState('');
    
    const selectedTerminal = (terminals || []).find(t => t && (t.id || t.Id) === posTerminalId);
    const sessionWarehouseId = selectedTerminal?.warehouseId || selectedTerminal?.WarehouseId;
    const sessionWarehouseName = useMemo(() => {
        if (!sessionWarehouseId) return "اختر نقطة بيع أولاً";
        const foundWh = (warehouses || []).find(w => w && (w.id || w.Id) === sessionWarehouseId);
        return foundWh?.name || (foundWh as any)?.Name || "مخزن غير معروف";
    }, [sessionWarehouseId, warehouses]);

    const availableTerminals = useMemo(() => {
        const activeTerminalIds = new Set((activeSessions || []).map(s => s?.posTerminalId || s?.PosTerminalId));
        return (terminals || []).filter(t => t && !activeTerminalIds.has(t.id || t.Id));
    }, [terminals, activeSessions]);
    
    const terminalOptions = useMemo(() => {
        return (availableTerminals || []).map(t => {
            const wId = t.warehouseId || t.WarehouseId;
            const foundWh = (warehouses || []).find(w => w && (w.id || w.Id) === wId);
            const warehouseName = foundWh?.name || (foundWh as any)?.Name || 'غير محدد';
            return { value: t.id || t.Id, label: `${t.name || t.Name} (${warehouseName})` };
        });
    }, [availableTerminals, warehouses]);

    const handleSubmit = () => {
        const term = (terminals || []).find(t => t && (t.id || t.Id) === posTerminalId);
        const wId = sessionWarehouseId || term?.warehouseId || term?.WarehouseId;
        if (posTerminalId && wId) {
            onConfirm({ posTerminalId, sessionWarehouseId: wId });
            onClose();
        }
    };

    return (
        <UIDialogContent>
            <UIDialogHeader>
                <UIDialogTitle>بدء ورديتي</UIDialogTitle>
                <DialogDescription>اختر نقطة البيع التي ستعمل عليها لبدء ورديتك.</DialogDescription>
            </UIDialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="terminal">نقطة البيع (الكاشير)</Label>
                    <Combobox
                        options={terminalOptions}
                        value={posTerminalId}
                        onValueChange={setPosTerminalId}
                        placeholder="اختر نقطة البيع..."
                        emptyMessage="لا توجد نقاط بيع متاحة."
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="session-warehouse">مخزن الصرف لهذه الوردية</Label>
                    <Input id="session-warehouse" value={sessionWarehouseName} disabled className="bg-muted" />
                </div>
            </div>
            <UIDialogFooter>
                <Button variant="ghost" onClick={onClose}>إلغاء</Button>
                <Button onClick={handleSubmit} disabled={!posTerminalId || !sessionWarehouseId}>بدء الوردية الآن</Button>
            </UIDialogFooter>
        </UIDialogContent>
    );
}


function PosPageContent() {
    const allDataContext = useData();
    const { 
      items: allItems, customers, dbAction, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2, posSessions, settings, warehouses: allWarehousesData,
      salesInvoices, inventory, getNextId, heldInvoices, posTerminals: allTerminals, posReturns, promotions, deliveryStaff, restaurantTables, paymentMethods, sellers, posSales,
      customerPayments, salesReturns, isCentral
     } = allDataContext;
    const { user } = useAuth();

    const authorizedBranchIds = useMemo(() => {
        if (!user?.warehouseIds) return [];
        if (user.warehouseIds.includes('all')) return allWarehousesData.map((w: any) => w.id);
        return user.warehouseIds;
    }, [user, allWarehousesData]);

    const warehouses = useMemo(() => {
        return allWarehousesData.filter((w: any) => authorizedBranchIds.includes(w.id));
    }, [allWarehousesData, authorizedBranchIds]);

    const posTerminals = useMemo(() => {
        return allTerminals.filter((t: any) => {
            const wId = t.warehouseId || t.WarehouseId;
            return authorizedBranchIds.includes(wId) || authorizedBranchIds.includes('all');
        });
    }, [allTerminals, authorizedBranchIds]);
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Server POS settings as source of truth
    const serverPosSettings = useMemo(() => {
        return settings?.main?.posSettings || settings?.posSettings || (allDataContext as any)?.allData?.main?.posSettings || {};
    }, [settings, allDataContext]);

    // Local cached settings for instant reactivity
    const [localPosSettings, setLocalPosSettings] = useState<any>(null);

    // Keep local cache synchronized when server settings update
    useEffect(() => {
        if (serverPosSettings && Object.keys(serverPosSettings).length > 0) {
            setLocalPosSettings(serverPosSettings);
            try {
                localStorage.setItem('app_pos_settings', JSON.stringify(serverPosSettings));
            } catch {}
        }
    }, [serverPosSettings]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const cached = localStorage.getItem('app_pos_settings');
                if (cached && !localPosSettings) setLocalPosSettings(JSON.parse(cached));
            } catch {}
            const handleUpdate = (e: any) => {
                if (e.detail) {
                    setLocalPosSettings(e.detail);
                } else {
                    try {
                        const c = localStorage.getItem('app_pos_settings');
                        if (c) setLocalPosSettings(JSON.parse(c));
                    } catch {}
                }
            };
            window.addEventListener('app_pos_settings_updated', handleUpdate);
            window.addEventListener('storage', handleUpdate);
            return () => {
                window.removeEventListener('app_pos_settings_updated', handleUpdate);
                window.removeEventListener('storage', handleUpdate);
            };
        }
    }, []);

    // Enforce immediate redirect if Central HQ
    useEffect(() => {
        if (isCentral) {
            toast({
                variant: 'destructive',
                title: 'شاشة الكاشير محظورة في الإدارة المركزية',
                description: 'تم حظر فتح الكاشير في الإدارة المركزية، حيث يقتصر البيع وفتح الورديات على فروع البيع فقط.'
            });
            router.push('/dashboard');
        }
    }, [isCentral, router, toast]);
    
    const posSettings = useMemo(() => {
        const base = serverPosSettings && Object.keys(serverPosSettings).length > 0 ? serverPosSettings : (localPosSettings || {});
        const local = localPosSettings || {};
        return {
            ...base,
            ...local,
            cartColumns: {
                ...(base?.cartColumns || {}),
                ...(local?.cartColumns || {})
            },
            layout: {
                ...(base?.layout || {}),
                ...(local?.layout || {})
            }
        };
    }, [serverPosSettings, localPosSettings]);
    const financialSettings = useMemo(() => settings?.main?.financial || settings?.financial || (allDataContext as any)?.allData?.main?.financial || {}, [settings, allDataContext]);
    const companySettings = useMemo(() => settings?.main?.general || settings?.general || (allDataContext as any)?.allData?.main?.general || {}, [settings, allDataContext]);
    
    const isClothingStore = useMemo(() => companySettings.isClothingStore || false, [companySettings]);
    const allowNegativeStock = useMemo(() => financialSettings.allowNegativeStock, [financialSettings]);
    const roundingPrecision = useMemo(() => financialSettings.roundingDecimals || 2, [financialSettings]);
    const scaleBarcodePrefix = useMemo(() => financialSettings.scaleBarcodePrefix || '21', [financialSettings]);
    
    const openWorkDay = useMemo(() => posSessions.find((s: any) => !s.isClosed), [posSessions]);
    const activeCashierSession = useMemo(() => {
        if (!openWorkDay || !user) return null;
        const sessions = openWorkDay.cashierSessions ? Object.values(openWorkDay.cashierSessions) : [];
        return sessions.find((cs: any) => cs.cashierId === user.id && !cs.isClosed) || null;
    }, [openWorkDay, user]) as { cashierId: string; posTerminalId: string; sessionWarehouseId: string; } | null;

    const terminalForSession = useMemo(() => {
        if (!activeCashierSession) return null;
        return posTerminals.find((t: any) => t.id === activeCashierSession.posTerminalId);
    }, [activeCashierSession, posTerminals]);

    const warehouseForSession = useMemo(() => {
        if (!activeCashierSession) return null;
        return warehouses.find((w: any) => w.id === activeCashierSession.sessionWarehouseId);
    }, [activeCashierSession, warehouses]);
    
    const hasOpenCashierSession = !!activeCashierSession;
    const { currentInvoiceNumber, generateInvoiceNumber } = usePosInvoiceCounter(openWorkDay?.id, activeCashierSession?.posTerminalId, terminalForSession?.code, warehouseForSession?.code);
    
    const receiptDesign = useMemo(() => {
        const allReceiptSettings = settings?.main?.posReceipts || {};
        const branchId = warehouseForSession?.id;
        return { 
            ...DEFAULT_POS_SETTINGS, 
            ...(allReceiptSettings.defaultReceiptDesign || {}), 
            ...(branchId ? allReceiptSettings[branchId] : {}) 
        };
    }, [settings, warehouseForSession]);

    const kitchenReceiptDesign = useMemo(() => {
        const allKitchenSettings = settings?.main?.kitchenReceipts || {};
        const branchId = warehouseForSession?.id;
        return { 
            ...DEFAULT_KITCHEN_SETTINGS, 
            ...(allKitchenSettings.defaultKitchenReceiptDesign || {}), 
            ...(branchId ? allKitchenSettings[branchId] : {}) 
        };
    }, [settings, warehouseForSession]);

    const enabledPaymentMethods = useMemo(() => {
        const methods = [...(paymentMethods || [])];
        const hasCash = methods.some((m:any) => m.code === 'CASH');
        if (!hasCash) {
            methods.unshift({ id: 'default-cash', name: 'نقدي', code: 'CASH', isEnabled: true });
        }
        return methods.filter((pm: any) => pm.isEnabled);
    }, [paymentMethods]);
    
    const barcodeInputRef = useRef<HTMLInputElement>(null);
    const printFrameRef = useRef<HTMLIFrameElement>(null);
    
    const [cart, setCart] = useState<PosItem[]>([]);
    const [discount, setDiscount] = useState(0);
    const [tips, setTips] = useState(0); // New state for tips
    const [payments, setPayments] = useState<Payment[]>([]); 
    const [activeGroupId, setActiveGroupId] = useState<string | 'all'>('all');
    const [activeGroupType, setActiveGroupType] = useState<'category' | 'group' | 'all'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [itemForManualEntry, setItemForManualEntry] = useState<any | null>(null);
    const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
    const [isQueryModalOpen, setIsQueryModalOpen] = useState(false);
    const [isHeldInvoicesOpen, setIsHeldInvoicesOpen] = useState(false);
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [allowCredit, setAllowCredit] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [orderReference, setOrderReference] = useState('');
    const [isDelivery, setIsDelivery] = useState(false);
    const [deliveryPersonId, setDeliveryPersonId] = useState('');
    const [isDeliveryPersonDialogOpen, setIsDeliveryPersonDialogOpen] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [isSellerDialogOpen, setIsSellerDialogOpen] = useState(false);
    const [isSelfShiftDialogOpen, setIsSelfShiftDialogOpen] = useState(false);
    
    const [applyTax, setApplyTax] = useState(false);
    useEffect(() => {
        if (posSettings?.defaultApplyTax !== undefined) {
            setApplyTax(!!posSettings.defaultApplyTax);
        }
    }, [posSettings?.defaultApplyTax]);

    const vatRate = useMemo(() => settings?.main?.financial?.vatRate || 14, [settings?.main?.financial?.vatRate]);
    const [isTaxIncluded, setIsTaxIncluded] = useState(false);
    
    const [itemForSecondaryUnit, setItemForSecondaryUnit] = useState<any | null>(null);
    const [itemForQuantityUpdate, setItemForQuantityUpdate] = useState<PosItem | null>(null);
    const [isQuantityEditDialogOpen, setIsQuantityEditDialogOpen] = useState(false);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


    const tableId = useMemo(() => searchParams.get('tableId'), [searchParams]);
    const tableData = useMemo(() => restaurantTables.find((t: any) => t.id === tableId), [tableId, restaurantTables]);
    const [showBackButton, setShowBackButton] = useState(false);
    const [currentHeldInvoiceId, setCurrentHeldInvoiceId] = useState<string | null>(null);
    const [isExitDialogOpen, setIsExitDialogOpen] = useState(false);
    const [posTableActionModal, setPosTableActionModal] = useState<'transfer' | 'merge' | 'select' | null>(null);
    const [selectedTargetTableId, setSelectedTargetTableId] = useState<string>('');
    const [isProcessingTableAction, setIsProcessingTableAction] = useState(false);
    const allowExitRef = useRef(false);

    const [customGroupsWidth, setCustomGroupsWidth] = useState<number | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            const saved = localStorage.getItem('pos_groups_width');
            const parsed = saved ? Number(saved) : NaN;
            return !isNaN(parsed) && parsed >= 150 && parsed <= 500 ? parsed : null;
        } catch {
            return null;
        }
    });

    const handleAttemptExit = useCallback(() => {
        setIsExitDialogOpen(true);
    }, []);

    // حماية الخروج من شاشة البيع: إظهار رسالة تأكيد عند محاولة إعادة التحميل (Refresh) أو إغلاق المتصفح
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!allowExitRef.current) {
                e.preventDefault();
                e.returnValue = 'هل أنت متأكد أنك تريد الخروج من شاشة البيع؟';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    // اعتراض زر الرجوع للخلف بالمتصفح (Browser Back / PopState) في مرحلة Capture لمنع Next.js Router من الخروج
    useEffect(() => {
        try {
            const currentState = window.history.state;
            window.history.pushState(currentState, '', window.location.href);
        } catch {}

        const handlePopState = (e: PopStateEvent) => {
            if (allowExitRef.current) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            try {
                window.history.pushState(window.history.state, '', window.location.href);
            } catch {}
            setIsExitDialogOpen(true);
        };

        window.addEventListener('popstate', handlePopState, true);
        return () => window.removeEventListener('popstate', handlePopState, true);
    }, []);
    
    const cxConfig = useMemo(() => getCustomerExperienceConfig(settings), [settings]);
    const { can } = usePermissions();
    const canManageLoyaltySettings = useMemo(() => {
        const role = String(user?.role || '').toLowerCase();
        return role === 'مسؤول' || role === 'admin' || can('edit', 'settings_general');
    }, [user?.role, can]);
    const hasAutoOpenedDisplayRef = useRef(false);
    const hasUserGestureOpenedDisplayRef = useRef(false);
    const [redeemedPoints, setRedeemedPoints] = useState<number>(0);

    const subtotal = useMemo(() => cart.reduce((acc, item) => acc + item.originalPrice * item.qty, 0), [cart]);
    const promoDiscount = useMemo(() => cart.reduce((acc, item) => acc + item.discountApplied, 0), [cart]);
    const loyaltyDiscount = useMemo(() => calculateRedeemableCash(redeemedPoints, cxConfig), [redeemedPoints, cxConfig]);
    
    const taxAmount = useMemo(() => {
        if (!applyTax) return 0;
        const taxableBase = Math.max(0, subtotal - promoDiscount - discount);
        if (isTaxIncluded) {
            return taxableBase - (taxableBase / (1 + vatRate / 100));
        } else {
            return taxableBase * (vatRate / 100);
        }
    }, [applyTax, isTaxIncluded, subtotal, promoDiscount, discount, vatRate]);

    const total = useMemo(() => {
        const netAmount = Math.max(0, subtotal - promoDiscount - discount);
        const finalTax = (applyTax && !isTaxIncluded) ? taxAmount : 0;
        // Total includes tips as it's what the customer pays
        return netAmount + finalTax + Number(tips || 0);
    }, [subtotal, promoDiscount, discount, applyTax, isTaxIncluded, taxAmount, tips]);

    const earnedPoints = useMemo(
        () => calculateInvoiceLoyaltyPoints({ invoiceTotal: total, items: cart, config: cxConfig }),
        [total, cart, cxConfig]
    );

    const handleToggleLoyaltyRedeem = () => {
        const cust = selectedCustomerId ? customers.find((c: any) => c.id === selectedCustomerId) : null;
        if (!cust || !cxConfig.loyalty.enabled) return;

        if (redeemedPoints > 0) {
            setDiscount(prev => Math.max(0, prev - loyaltyDiscount));
            setRedeemedPoints(0);
            toast({ title: 'تم إلغاء استبدال النقاط' });
            return;
        }

        const availPoints = Number(cust.loyaltyPoints || 0);
        if (availPoints < cxConfig.loyalty.minPointsToRedeem) {
            toast({
                variant: 'destructive',
                title: 'رصيد النقاط غير كافٍ',
                description: `الحد الأدنى للاستبدال هو ${cxConfig.loyalty.minPointsToRedeem} نقطة.`
            });
            return;
        }

        const maxPayable = Math.max(0, subtotal - promoDiscount);
        const maxCashFromPoints = calculateRedeemableCash(availPoints, cxConfig);
        const cashToRedeem = Math.min(maxPayable, maxCashFromPoints);
        const pointsUsed = Math.round((cashToRedeem / Math.max(0.1, cxConfig.loyalty.pointRedeemValue)) * 10) / 10;

        setRedeemedPoints(pointsUsed);
        setDiscount(prev => prev + cashToRedeem);
        toast({
            title: 'تم استبدال نقاط الولاء بنجاح',
            description: `تم خصم ${cashToRedeem} ج.م مقابل استبدال ${pointsUsed} نقطة ولاء.`
        });
    };

    const paidAmount = useMemo(() => payments.reduce((acc, p) => acc + Number(p.amount || 0), 0), [payments]);
    const change = useMemo(() => (paidAmount >= total ? paidAmount - total : 0), [paidAmount, total]);
    const isPaidEnough = useMemo(() => {
        const eps = 1 / Math.pow(10, roundingPrecision);
        return paidAmount + eps >= total;
    }, [paidAmount, total, roundingPrecision]);
    const totalItemsCount = useMemo(() => {
        return cart.reduce((sum, line) => {
            const master = allItems.find((i: any) => i.id === line.id);
            const isWeight = isWeightUnit(line.unit) || (master ? isWeightUnit(master.baseUnit) || master.barcodeType === 'ean13_scale' : false);
            return sum + (isWeight ? 1 : line.qty);
        }, 0);
    }, [cart, allItems]);
    
    const resetCartAndPayments = useCallback(() => {
        setCart([]);
        setDiscount(0);
        setRedeemedPoints(0);
        setTips(0); // Reset tips
        setPayments([]);
        setOrderReference('');
        setSelectedCustomerId(null);
        setAllowCredit(false);
        setIsDelivery(false);
        setDeliveryPersonId('');
        setCurrentHeldInvoiceId(null);
        setTimeout(() => barcodeInputRef.current?.focus(), 0);
    }, []);

    const resetSale = useCallback((isCancellation: boolean = false) => {
        if (isCancellation && user?.canCancelInvoice && cart.length > 0) {
            dbAction('posAuditLogs', 'add', {
                date: new Date().toISOString(),
                cashierId: user?.id,
                cashierName: user?.name,
                action: 'INVOICE_CANCELLED',
                details: {
                    invoiceNumber: currentInvoiceNumber,
                    items: cart,
                    total: total,
                }
            });
        }
        resetCartAndPayments();
    }, [user, dbAction, cart, total, currentInvoiceNumber, resetCartAndPayments]);
    
    useEffect(() => {
        if (tableId) {
            setShowBackButton(true);
            const tableInvoice = (heldInvoices || []).find((inv: HeldInvoice) => inv && inv.tableId === tableId);
            if (tableInvoice) {
                setCurrentHeldInvoiceId(tableInvoice.id);
                const safeCart = Array.isArray(tableInvoice.cart)
                    ? tableInvoice.cart
                    : Array.isArray((tableInvoice as any).items)
                    ? (tableInvoice as any).items
                    : [];
                setCart(safeCart);
                setDiscount(tableInvoice.discount || 0);
                setTips(tableInvoice.tips || 0); // Restore tips
                setOrderReference(tableInvoice.orderReference || '');
            } else {
                resetCartAndPayments();
                setCurrentHeldInvoiceId(null);
                 if (tableData) {
                    setOrderReference(tableData.number ? `طاولة ${tableData.number}` : '');
                }
            }
        } else {
            if (showBackButton) {
                resetCartAndPayments(); 
            }
            setShowBackButton(false);
        }
    }, [tableId, heldInvoices, tableData, showBackButton, resetCartAndPayments]);


     const getItemIdsForLevel = (levelType: string, levelId: string): Set<string> => {
        const ids = new Set<string>();
        if (levelType === 'items') {
            ids.add(levelId);
        } else if (levelType === 'itemSections') {
            allItems.filter((i: any) => i.sectionId === levelId).forEach((i: any) => ids.add(i.id));
        } else if (levelType === 'itemCategories') {
            allItems.filter((i: any) => i.categoryId === levelId).forEach((i: any) => ids.add(i.id));
        } else if (levelType === 'itemGroups') {
            allItems.filter((i: any) => i.itemGroupId === levelId).forEach((i: any) => ids.add(i.id));
        } else if (levelType === 'itemSubCategories1') {
            allItems.filter((i: any) => i.subCategoryId1 === levelId).forEach((i: any) => ids.add(i.id));
        } else if (levelType === 'itemSubCategories2') {
            allItems.filter((i: any) => i.subCategoryId2 === levelId).forEach((i: any) => ids.add(i.id));
        }
        return ids;
    };
    
    useEffect(() => {
        const now = new Date();
        const activePromotions = promotions.filter((p: any) => {
            return isPromotionCurrentlyActive(p, now, warehouseForSession?.id).active;
        });

        let newCart: PosItem[] = cart.map(item => ({
            ...item,
            price: item.originalPrice,
            discountApplied: 0,
            promoApplied: null
        }));

        for (const item of newCart) {
            let bestTotalDiscount = 0;
            let bestPromoId: string | null = null;

            for (const promo of activePromotions) {
                if (promo.buyNTargetMode !== 'all' && (!promo.targetIds || promo.targetIds.length === 0) && (!promo.tiers || promo.tiers.length === 0)) continue;
                
                const promoItemIds = new Set<string>();
                if (promo.targetIds) {
                    (promo.targetIds || []).forEach((id: string) => {
                        getItemIdsForLevel(promo.targetType, id).forEach(itemId => promoItemIds.add(itemId));
                    });
                }
                
                let currentTotalDiscount = 0;

                 if (promo.type === 'percentage') {
                    if (promoItemIds.has(item.id)) {
                        currentTotalDiscount = (item.originalPrice * item.qty) * (promo.value / 100);
                    }
                } else if (promo.type === 'fixed_amount') {
                    if (promoItemIds.has(item.id)) {
                        currentTotalDiscount = promo.value * item.qty;
                    }
                } else if (promo.type === 'tiered_quantity' && promo.tiers) {
                     const sortedTiers = [...promo.tiers].sort((a: any, b: any) => b.quantity - a.quantity);
                     for (const tier of sortedTiers) {
                         const tierItemIds = getItemIdsForLevel(tier.targetType, tier.targetId);
                         if (tierItemIds.has(item.id) && item.qty >= tier.quantity) {
                             currentTotalDiscount = (item.originalPrice * item.qty) * (tier.discountPercentage / 100);
                             break; 
                         }
                     }
                } else if (promo.type === 'buy_x_get_y_discount' && promo.targetIds?.length === 2) {
                    const [itemAId, itemBId] = promo.targetIds;
                     if (item.id === itemAId || item.id === itemBId) {
                         const itemAInCart = newCart.find(i => i.id === itemAId);
                         const itemBInCart = newCart.find(i => i.id === itemBId);
                         
                         if (itemAInCart && itemBInCart) {
                             let cheaperItem = itemAInCart.originalPrice < itemBInCart.originalPrice ? itemAInCart : itemBInCart;
                             if (itemAInCart.originalPrice === itemBInCart.originalPrice) {
                                 cheaperItem = itemAInCart.id < itemBInCart.id ? itemAInCart : itemBInCart;
                             }

                             const pairs = Math.min(itemAInCart.qty, itemBInCart.qty);
                             
                             if (item.id === cheaperItem.id) {
                                 currentTotalDiscount = pairs * item.originalPrice * (promo.value / 100);
                             }
                         }
                    }
                } else if (promo.type === 'buy_n_get_cheapest_discount') {
                    const getItemsInPromo = (currentCart: PosItem[]) => {
                        if (promo.buyNTargetMode === 'all') return currentCart;
                        return currentCart.filter(cartItem => promoItemIds.has(cartItem.id));
                    };
                    const eligibleItems = getItemsInPromo(newCart);
                    const totalEligibleQty = eligibleItems.reduce((sum, i) => sum + i.qty, 0);
                    const buyCount = promo.buyCount || 2;
                    
                    if (totalEligibleQty >= buyCount) {
                        const numFree = Math.floor(totalEligibleQty / buyCount);
                        
                        const allUnits: {price: number, itemId: string}[] = [];
                        eligibleItems.forEach(i => {
                            for(let k=0; k<i.qty; k++) allUnits.push({price: i.originalPrice, itemId: i.id});
                        });
                        
                        allUnits.sort((a, b) => a.price - b.price);
                        
                        const freeUnits = allUnits.slice(0, numFree);
                        const freeCountForItem = freeUnits.filter(u => u.itemId === item.id).length;
                        
                        if (freeCountForItem > 0) {
                            currentTotalDiscount = freeCountForItem * item.originalPrice * (promo.value / 100);
                        }
                    }
                }

                if (currentTotalDiscount > bestTotalDiscount) {
                    bestTotalDiscount = currentTotalDiscount;
                    bestPromoId = promo.id;
                }
            }
            
             if (item.qty > 0) {
                 const discountPerUnit = bestTotalDiscount / item.qty;
                 item.price = Math.max(0, item.originalPrice - discountPerUnit);
                 item.discountApplied = bestTotalDiscount;
                 item.promoApplied = bestPromoId;
             }
        }

        newCart.forEach(item => item.total = item.qty * item.price);
        
        if (JSON.stringify(cart.map(i => ({ p: i.price, q: i.qty, op: i.originalPrice }))) !== JSON.stringify(newCart.map(i => ({ p: i.price, q: i.qty, op: i.originalPrice })))) {
            setCart(newCart);
        }

    }, [cart, promotions, allItems, warehouseForSession]);
    
    const calculateManufacturedCost = useCallback((item: any) => {
        if (!item || item.itemType !== 'manufactured' || !item.components) {
            return item?.cost || 0;
        }
        return item.components.reduce((totalCost: number, component: any) => {
            const componentItem = allItems.find((i:any) => i.id === component.itemId);
            return totalCost + (component.quantity * (componentItem?.cost || 0));
        }, 0);
    }, [allItems]);

    const calculatePotentialStock = useCallback((item: any) => {
        if (!warehouseForSession) return 0;
        const warehouseId = warehouseForSession.id;
        
        if (item.itemType !== 'manufactured' || !item.components || item.components.length === 0) {
            return calculateStockForItemInWarehouse(item.id, warehouseId, allDataContext);
        }

        let maxPossibleUnits = Infinity;
        for (const component of item.components) {
            const componentStock = calculateStockForItemInWarehouse(component.itemId, warehouseId, allDataContext);
            const unitsPossibleFromComponent = Math.floor(componentStock / component.quantity);
            if (unitsPossibleFromComponent < maxPossibleUnits) {
                maxPossibleUnits = unitsPossibleFromComponent;
            }
        }
        return maxPossibleUnits === Infinity ? 0 : maxPossibleUnits;

    }, [warehouseForSession, allDataContext]);

    const availableItemsWithStock = useMemo(() => {
        if (!warehouseForSession || !Array.isArray(allItems)) return [];
        return allItems
            .filter((item: any) => item.itemType !== 'raw_material')
            .map((item: any) => ({
                ...item,
                stock: calculatePotentialStock(item),
            }));
    }, [warehouseForSession, allItems, calculatePotentialStock]);
    
    const [explicitShowAll, setExplicitShowAll] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    
    const matchingQuickItems = useMemo(() => {
        if (!searchTerm.trim()) return [];
        return availableItemsWithStock.filter((item: any) => 
            matchesArabicSearch(item.name, searchTerm) || 
            (item.code && item.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (item.barcode && item.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
        ).slice(0, 15);
    }, [searchTerm, availableItemsWithStock]);

    const groupsToShow = useMemo(() => {
        let categories = (itemCategories || [])
            .filter((g: ItemCategory) => g.showOnPos !== false && g.showOnPos != null ? g.showOnPos : true)
            .map((g: ItemCategory) => ({...g, type: 'category'}));
        
        // If no category has showOnPos explicitly checked, fallback to showing all active categories so sidebar is never blank
        if (categories.length === 0 && itemCategories && itemCategories.length > 0) {
            categories = itemCategories.map((g: ItemCategory) => ({...g, type: 'category'}));
        }

        const customGroups = (itemGroups || []).filter((g: any) => g.showOnPos !== false).map((g: any) => ({...g, type: 'group'}));
        return [...categories, ...customGroups];
    }, [itemCategories, itemGroups]);


    const itemsToShow = useMemo(() => {
        let itemsToDisplay = availableItemsWithStock;

        if (searchTerm) {
            return itemsToDisplay.filter((item: any) => 
                matchesArabicSearch(item.name, searchTerm) || 
                (item.code && item.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (item.barcode && item.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }
        
        if (activeGroupId === 'all') {
            const shouldShow = explicitShowAll || (posSettings.showAllItemsInitially !== false);
            return shouldShow ? itemsToDisplay : [];
        }

        if (activeGroupType === 'category') {
            const subGroupIds = new Set(
                (itemGroups || [])
                    .filter((g: any) => g.parentCategoryId === activeGroupId)
                    .map((g: any) => g.id)
            );
             const subSubGroupIds = new Set(
                (itemSubCategories1 || [])
                    .filter((sg: any) => subGroupIds.has(sg.parentGroupId))
                    .map((sg: any) => sg.id)
            );

            return itemsToDisplay.filter((item: any) => 
                item.categoryId === activeGroupId || 
                subGroupIds.has(item.itemGroupId) ||
                subSubGroupIds.has(item.subCategoryId1)
            );

        } else if (activeGroupType === 'group') {
             return itemsToDisplay.filter((item: any) => item.itemGroupId === activeGroupId);
        }
        
        return itemsToDisplay;
    }, [availableItemsWithStock, searchTerm, activeGroupId, activeGroupType, posSettings.showAllItemsInitially, explicitShowAll, itemCategories, itemGroups, itemSubCategories1]);
    
    const addItemToCart = useCallback((itemToAdd: any, quantity: number = 1, unit?: any) => {
        if (!itemToAdd || !warehouseForSession) return;
    
        if (itemToAdd.itemType === 'raw_material') {
            toast({ variant: 'destructive', title: 'خطأ', description: 'لا يمكن بيع المواد الخام مباشرة.' });
            return;
        }
        
        const selectedUnit = unit || { name: itemToAdd.baseUnit || 'قطعة', conversionFactor: 1, price: itemToAdd.price };

        const baseQuantity = quantity * selectedUnit.conversionFactor;
        const currentStock = calculatePotentialStock(itemToAdd);
        const isWeightItem = isWeightUnit(itemToAdd.baseUnit) || isWeightUnit(selectedUnit.name) || itemToAdd.barcodeType === 'ean13_scale';
        const existingItem = cart.find(item => item.id === itemToAdd.id && item.unit === selectedUnit.name);
        const cartQtyInBaseUnits = cart.reduce((sum, i) => i.id === itemToAdd.id ? sum + (i.qty * i.conversionFactor) : sum, 0);
    
        if (!allowNegativeStock && currentStock < (cartQtyInBaseUnits + baseQuantity)) {
            toast({ variant: 'destructive', title: 'كمية غير كافية', description: `لا يوجد رصيد كافٍ من صنف "${itemToAdd.name}". الرصيد المتاح: ${currentStock}` });
            return;
        }
    
        const itemPrice = selectedUnit.price || (itemToAdd.price * selectedUnit.conversionFactor) || 0;
        const itemCost = itemToAdd.itemType === 'manufactured' ? calculateManufacturedCost(itemToAdd) : ((itemToAdd.cost || 0) * selectedUnit.conversionFactor);
        
        const totalValue = quantity * itemPrice;
    
        if (!isWeightItem && existingItem && existingItem.unit === selectedUnit.name) {
            setCart(prevCart => prevCart.map(item =>
                item.id === itemToAdd.id && item.unit === selectedUnit.name
                    ? { ...item, qty: item.qty + quantity }
                    : item
            ));
        } else {
            setCart(prevCart => [...prevCart, {
                id: itemToAdd.id,
                code: itemToAdd.code || '',
                name: itemToAdd.name,
                qty: quantity,
                price: itemPrice,
                originalPrice: itemPrice,
                discountApplied: 0,
                cost: itemCost,
                total: totalValue,
                uniqueId: `${itemToAdd.id}-${selectedUnit.name}-${Date.now()}`,
                categoryId: itemToAdd.categoryId,
                unit: selectedUnit.name,
                conversionFactor: selectedUnit.conversionFactor,
            }]);
        }
        barcodeInputRef.current?.focus();
    }, [cart, warehouseForSession, allowNegativeStock, toast, calculatePotentialStock, calculateManufacturedCost, allItems, financialSettings.scaleBarcodePrefix]);
    


    const handleBarcodeSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const code = barcodeInputRef.current?.value.trim().replace(/\s/g, '');
        if (!code) return;
    
        for (const item of availableItemsWithStock) {
            if (item.secondaryUnits && item.secondaryUnits.length > 0) {
                const matchedUnit = item.secondaryUnits.find((u: any) => u.barcode === code);
                if (matchedUnit) {
                    addItemToCart(item, 1, matchedUnit);
                    if (barcodeInputRef.current) barcodeInputRef.current.value = "";
                    setSearchTerm('');
                    return;
                }
            }
        }
    
        // 1. فحص باركود الميزان أولاً (13 رقماً يبدأ ببادئة الميزان المعتمدة) لتقسيمه إلى صنف ووزن/سعر مباشرة
        if (code.length === 13 && scaleBarcodePrefix && code.startsWith(scaleBarcodePrefix)) {
            const prefixLen = scaleBarcodePrefix.length;
            const itemCodePart = code.substring(prefixLen, prefixLen + 5);
            const valuePartRaw = code.substring(prefixLen + 5, 12);
            const valuePart = parseInt(valuePartRaw, 10);

            const itemForScale = availableItemsWithStock.find((item: any) => {
                const isScaleCapable =
                    item.barcodeType === 'ean13_scale' ||
                    ['kilo', 'gram', 'meter', 'weight'].includes(String(item.baseUnit || '').toLowerCase());
                if (!isScaleCapable) return false;

                const itemCode = String(item.code || '').trim();
                const itemBarcode = String(item.barcode || '').trim();

                return (
                    (itemCode.length === 13 && itemCode.startsWith(scaleBarcodePrefix) && itemCode.substring(prefixLen, prefixLen + 5) === itemCodePart) ||
                    (itemCode.length === 5 && itemCode === itemCodePart) ||
                    (itemBarcode.length === 13 && itemBarcode.startsWith(scaleBarcodePrefix) && itemBarcode.substring(prefixLen, prefixLen + 5) === itemCodePart)
                );
            });

            if (itemForScale) {
                if (isNaN(valuePart) || valuePart === 0) {
                    setItemForManualEntry(itemForScale);
                } else {
                    const isPrice = financialSettings.scaleBarcodeValueType === 'price';
                    if (isPrice) {
                        const priceValue = valuePart / (10 ** roundingPrecision);
                        if (itemForScale.price > 0) {
                            const calculatedQty = priceValue / itemForScale.price;
                            addItemToCart(itemForScale, calculatedQty);
                        } else {
                            toast({ variant: 'destructive', title: 'خطأ', description: `سعر الصنف ${itemForScale.name} غير محدد.` });
                        }
                    } else {
                        const unitLower = String(itemForScale.baseUnit || '').toLowerCase();
                        // أصناف الجرام تُحسب بالجرام مباشرة إذا كانت مقومة بالجرام، وإلا بالكيلو/المتر (تقسيم 1000)
                        const calculatedQty = unitLower === 'gram' ? valuePart : valuePart / 1000.0;
                        addItemToCart(itemForScale, calculatedQty);
                    }
                }
                if (barcodeInputRef.current) barcodeInputRef.current.value = "";
                setSearchTerm('');
                return;
            }
        }

        let itemToAdd = availableItemsWithStock.find((item: any) => item.code === code || item.barcode === code);
        if (itemToAdd) {
            addItemToCart(itemToAdd, 1);
            if (barcodeInputRef.current) barcodeInputRef.current.value = "";
            setSearchTerm('');
            return;
        }

        // If user typed partial name and exactly 1 item matches:
        if (matchingQuickItems.length === 1) {
            addItemToCart(matchingQuickItems[0], 1);
            if (barcodeInputRef.current) barcodeInputRef.current.value = "";
            setSearchTerm('');
            return;
        } else if (matchingQuickItems.length > 1) {
            // Keep matching items displayed so user can pick
            return;
        }
    
        toast({ variant: 'destructive', title: 'خطأ', description: `الصنف بالكود ${code} غير موجود.` });
        if (barcodeInputRef.current) barcodeInputRef.current.value = "";
        setSearchTerm('');
    };

    const handleBarcodeSubmitRef = useRef(handleBarcodeSubmit);
    useEffect(() => {
        handleBarcodeSubmitRef.current = handleBarcodeSubmit;
    });

    // Auto-focus barcode input on mount and keep focus ready
    useEffect(() => {
        const timer = setTimeout(() => {
            barcodeInputRef.current?.focus();
        }, 200);
        return () => clearTimeout(timer);
    }, []);

    // Global keyboard listener: Intercept typing and barcode scanner input when no other input is focused
    useEffect(() => {
        const handleGlobalPosKeyDown = (e: KeyboardEvent) => {
            // Ignore system hotkeys / combinations (Ctrl+C, Ctrl+V, Alt+Tab, etc.)
            if (e.ctrlKey || e.altKey || e.metaKey) return;

            const target = e.target as HTMLElement | null;
            const active = document.activeElement as HTMLElement | null;

            // Check if active target or activeElement is an editable field
            const isTargetEditable = target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable ||
                target.getAttribute('role') === 'textbox' ||
                Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
            );

            const isActiveEditable = active && (
                active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA' ||
                active.tagName === 'SELECT' ||
                active.isContentEditable ||
                active.getAttribute('role') === 'textbox'
            );

            // If user is intentionally interacting with an input/textarea/select
            if (isTargetEditable || isActiveEditable) {
                // If it is already the barcode input, let standard typing proceed
                return;
            }

            // Check if any modal dialog / sheet / popover is open
            const isModalOpen = document.querySelector('[role="dialog"], [role="alertdialog"], [data-state="open"][aria-modal="true"], .dialog-content');
            if (isModalOpen) {
                return;
            }

            // Enter key from keyboard or barcode scanner
            if (e.key === 'Enter') {
                if (barcodeInputRef.current && barcodeInputRef.current.value.trim()) {
                    e.preventDefault();
                    const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                    handleBarcodeSubmitRef.current(fakeEvent);
                }
                return;
            }

            // Printable single character (numbers 0-9, letters, barcode scanner digits, Arabic chars)
            if (e.key.length === 1) {
                if (barcodeInputRef.current) {
                    e.preventDefault();
                    barcodeInputRef.current.focus();

                    const input = barcodeInputRef.current;
                    const start = input.selectionStart ?? input.value.length;
                    const end = input.selectionEnd ?? input.value.length;
                    const val = input.value || '';
                    const updatedVal = val.slice(0, start) + e.key + val.slice(end);
                    input.value = updatedVal;
                    const nextPos = start + 1;
                    input.setSelectionRange(nextPos, nextPos);
                    setSearchTerm(updatedVal);
                }
                return;
            }

            // Backspace key
            if (e.key === 'Backspace' && barcodeInputRef.current && barcodeInputRef.current.value.length > 0) {
                e.preventDefault();
                barcodeInputRef.current.focus();
                const val = barcodeInputRef.current.value;
                const updatedVal = val.slice(0, -1);
                barcodeInputRef.current.value = updatedVal;
                setSearchTerm(updatedVal);
                return;
            }

            // Escape key
            if (e.key === 'Escape' && barcodeInputRef.current) {
                e.preventDefault();
                barcodeInputRef.current.value = '';
                setSearchTerm('');
                barcodeInputRef.current.focus();
                return;
            }
        };

        window.addEventListener('keydown', handleGlobalPosKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleGlobalPosKeyDown, true);
        };
    }, []);
    
    const handleShortClick = (item: any) => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }
        if (!allowNegativeStock && item.stock <= 0) {
            toast({ variant: 'destructive', title: 'غير متاح', description: 'هذا الصنف غير متوفر في المخزون حاليًا.' });
            return;
        }
        if (item.barcodeType === 'ean13_scale') {
            setItemForManualEntry(item);
        } else {
            addItemToCart(item, 1);
        }
    };
    
    const handleLongPressStart = (item: any) => {
        if (!allowNegativeStock && item.stock <= 0) return;
        longPressTimerRef.current = setTimeout(() => {
             if (item.secondaryUnits && item.secondaryUnits.length > 0) {
                setItemForSecondaryUnit(item);
             }
        }, 500); 
    };

    const handlePressEnd = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }
    };


    const updateQty = (uniqueId: string, newQty: number) => {
        const itemInCart = cart.find(item => item.uniqueId === uniqueId);
        if(!itemInCart) return;

        const itemMaster = availableItemsWithStock.find(i => i.id === itemInCart.id);
        const currentStock = itemMaster?.stock || 0;
            
        if(!allowNegativeStock && (newQty * itemInCart.conversionFactor) > currentStock){
             toast({ variant: 'destructive', title: 'كمية غير كافية', description: `الرصيد المتاح هو ${currentStock} فقط.` });
             return;
        }

        if (newQty <= 0) {
            setCart(cart.filter(item => item.uniqueId !== uniqueId));
            return;
        }
        setCart(cart.map(item => 
            item.uniqueId === uniqueId ? { ...item, qty: newQty } : item
        ));
    };
    
    const sendToPrinter = useCallback(async (content: React.ReactElement, printerType: 'pos' | 'kitchen', specificPrinter?: { type: string, address: string }) => {
        const allPrinterSettings = settings?.main?.printers || {};
        const branchSettings = warehouseForSession?.id ? allPrinterSettings.branchOverrides?.[warehouseForSession.id] : {};
        const printerSettings = { ...(allPrinterSettings.default || DEFAULT_PRINTER_SETTINGS), ...branchSettings };

        if (!printerSettings) {
            toast({ variant: "destructive", title: "خطأ في الطباعة", description: `لم يتم تكوين إعدادات الطابعة.`});
            return;
        }
        
        let settingsToUse, addressToUse;
        
        if (specificPrinter) {
            settingsToUse = specificPrinter.type;
            addressToUse = specificPrinter.address;
        } else {
            settingsToUse = printerType === 'pos' 
                ? (terminalForSession?.posPrinterType ?? printerSettings.posPrinterType) 
                : printerSettings.kitchenPrinterType;
            addressToUse = printerType === 'pos' 
                ? (terminalForSession?.posPrinterAddress ?? printerSettings.posPrinterAddress) 
                : printerSettings.kitchenPrinterAddress;
        }

        if (settingsToUse === 'system' || settingsToUse === 'browser') {
            const frame = printFrameRef.current;
            if (frame && frame.contentWindow) {
                const doc = frame.contentWindow.document;
                doc.open();
                doc.write('<!DOCTYPE html><html dir="rtl" lang="ar"><head><title>Print</title>');
                doc.write('<style>body { margin: 0; padding: 0; direction: rtl; } @page { size: auto; margin: 0mm; }</style>');
                doc.write('</head><body><div id="receipt-root"></div></body></html>');
                doc.close();

                const container = doc.getElementById('receipt-root');
                if (container) {
                    const root = createRoot(container);
                    root.render(content);
                    setTimeout(() => {
                        try {
                            frame.contentWindow?.focus();
                            frame.contentWindow?.print();
                        } finally {
                            setTimeout(() => {
                                try { root.unmount(); } catch {}
                            }, 1200);
                        }
                    }, 350);
                    return;
                }
            }

            setTimeout(() => {
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    printWindow.document.write('<html><head><title>Print</title>');
                    printWindow.document.write('<style>body { margin: 0; padding: 0; direction: rtl; } @page { size: auto; margin: 0mm; }</style>');
                    printWindow.document.write('</head><body></body></html>');
                    printWindow.document.close();
                    
                    const container = printWindow.document.body;
                    const root = createRoot(container);
                    root.render(content);

                    setTimeout(() => {
                        printWindow.focus();
                        printWindow.print();
                        printWindow.close();
                        root.unmount();
                    }, 500);
                }
            }, 75);
        } else if (settingsToUse === 'ip' && addressToUse) {
            try {
                const res = await fetch('/api/print', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        printer: addressToUse,
                        printerType: 'ip',
                        content: {
                            title: companySettings.companyName || 'إيصال مبيعات',
                            lines: [{ left: 'تم إصدار الإيصال', right: new Date().toLocaleTimeString('ar-EG') }],
                            footer: 'شكراً لزيارتكم'
                        }
                    })
                });
                const data = await res.json();
                if (!res.ok || data?.ok === false) throw new Error(data?.error || 'فشل الاتصال بطابعة الشبكة');
                toast({ title: 'تم إرسال الطباعة', description: `تم الإرسال إلى الطابعة ${addressToUse}` });
            } catch (e: any) {
                toast({ variant: 'destructive', title: 'فشل الطباعة عبر IP', description: e?.message || 'تعذر الوصول إلى طابعة الشبكة.' });
            }
        }
    }, [settings, warehouseForSession, toast]);
    
    const handlePrintReceipt = useCallback(async (saleData: any) => {
        const silentCfg = getPosSilentPrinterConfig();
        const allPrinterSettings = settings?.main?.printers || {};
        const branchSettings = warehouseForSession?.id ? allPrinterSettings.branchOverrides?.[warehouseForSession.id] : {};
        const printerSettings = { ...(allPrinterSettings.default || DEFAULT_PRINTER_SETTINGS), ...branchSettings };

        // أولوية لطابعة الكاشير الصامتة المحددة محلياً إذا كانت مفعلة
        const posPrinterType = (silentCfg.enabled && silentCfg.printerAddress)
            ? silentCfg.printerType
            : (terminalForSession?.posPrinterType ?? printerSettings?.posPrinterType);

        const posPrinterAddress = (silentCfg.enabled && silentCfg.printerAddress)
            ? silentCfg.printerAddress
            : (terminalForSession?.posPrinterAddress ?? printerSettings?.posPrinterAddress);

        // إذا كانت الطباعة الصامتة المباشرة مفعلة وهناك طابعة محددة (نظام أو IP)
        if (silentCfg.enabled && posPrinterAddress && (posPrinterType === 'system' || posPrinterType === 'ip')) {
            const lines: Array<{ left?: string; right?: string }> = [];
            
            // بيانات رأس الإيصال طبقاً لتصميم مصمم الإيصالات
            if (warehouseForSession?.name) lines.push({ left: 'الفرع:', right: warehouseForSession.name });
            if (saleData.tableName) lines.push({ left: 'الطاولة:', right: saleData.tableName });
            if (receiptDesign?.showAddress !== false && companySettings?.companyAddress) {
                lines.push({ left: 'العنوان:', right: companySettings.companyAddress });
            }
            if (receiptDesign?.showPhoneNumber !== false && companySettings?.phone) {
                lines.push({ left: 'الهاتف:', right: companySettings.phone });
            }
            if (receiptDesign?.showCashier !== false && user?.name) {
                lines.push({ left: 'كاشير:', right: user.name });
            }
            if (receiptDesign?.showCustomerName !== false && saleData.customerName) {
                lines.push({ left: 'العميل:', right: saleData.customerName });
            }
            if (receiptDesign?.showCustomerPhone !== false && (saleData.customerPhone || saleData.customer?.phone)) {
                lines.push({ left: 'هاتف العميل:', right: saleData.customerPhone || saleData.customer?.phone });
            }
            const dateStr = new Date(saleData.date || Date.now()).toLocaleDateString('ar-EG');
            const timeStr = new Date(saleData.date || Date.now()).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            lines.push({ left: 'التاريخ والوقت:', right: `${dateStr} ${timeStr}` });
            if (receiptDesign?.showInvoiceNumber !== false && saleData.invoiceNumber) {
                lines.push({ left: 'رقم الفاتورة:', right: saleData.invoiceNumber });
            }
            lines.push({ left: '---------------------------', right: '' });

            // الأصناف طبقاً لخيارات مصمم الإيصالات
            for (const item of (saleData.items || [])) {
                let itemLabel = `${item.qty} × ${item.name}`;
                if (receiptDesign?.showCode && item.code) {
                    itemLabel += ` [${item.code}]`;
                }
                const itemRight = receiptDesign?.showItemPrice !== false 
                    ? Number(item.total).toFixed(roundingPrecision)
                    : '';
                lines.push({
                    left: itemLabel,
                    right: itemRight
                });
            }
            lines.push({ left: '---------------------------', right: '' });

            // الإجماليات طبقاً لخيارات مصمم الإيصالات
            const totalAmount = Number(saleData.total || 0);
            const paidAmt = Number(saleData.paidAmount ?? totalAmount);
            const remainingDue = Math.max(0, totalAmount - paidAmt);
            
            if (receiptDesign?.showDiscount !== false && saleData.subtotal && saleData.discount) {
                lines.push({ left: 'الإجمالي قبل الخصم:', right: Number(saleData.subtotal).toFixed(roundingPrecision) });
                lines.push({ left: 'الخصم:', right: Number(saleData.discount).toFixed(roundingPrecision) });
            }
            if (receiptDesign?.showTax !== false && saleData.taxAmount > 0) {
                lines.push({ left: 'ضريبة القيمة المضافة:', right: Number(saleData.taxAmount).toFixed(roundingPrecision) });
            }
            lines.push({ left: 'صافي الفاتورة:', right: totalAmount.toFixed(roundingPrecision) });
            if (saleData.tips > 0) lines.push({ left: 'الإكرامية (Tips):', right: Number(saleData.tips).toFixed(roundingPrecision) });
            lines.push({ left: 'المدفوع:', right: paidAmt.toFixed(roundingPrecision) });
            if (remainingDue > 0) lines.push({ left: 'المتبقي:', right: remainingDue.toFixed(roundingPrecision) });
            if (receiptDesign?.showLoyaltyPoints !== false && saleData.earnedPoints > 0) {
                lines.push({ left: 'نقاط مكتسبة:', right: `+${saleData.earnedPoints} ⭐` });
            }

            const title = (receiptDesign?.showCompanyName !== false && companySettings.companyName) 
                ? companySettings.companyName 
                : 'فاتورة مبيعات';
            const footer = companySettings.receiptFooter || 'شكراً لزيارتكم ونسعد بخدمتكم دائماً!';
            const paperWidth = silentCfg.paperWidth || (receiptDesign?.receiptWidth ? `${receiptDesign.receiptWidth}mm` : '80mm');

            try {
                const copies = Math.max(1, Number(silentCfg.copies || 1));
                for (let c = 0; c < copies; c++) {
                    const res = await fetch('/api/print', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            printer: posPrinterAddress,
                            printerType: posPrinterType,
                            options: { width: paperWidth },
                            content: { title, lines, footer: `${footer}\nرقم: ${saleData.invoiceNumber || ''}` }
                        })
                    });
                    const data = await res.json().catch(() => null);
                    if (!res.ok || data?.ok === false) throw new Error(data?.error || 'فشل إرسال أمر الطباعة');
                }
                toast({
                    title: 'تمت الطباعة الصامتة بنجاح 🖨️',
                    description: `تمت الطباعة على [${posPrinterAddress}] ${copies > 1 ? `(${copies} نسخ)` : ''}`
                });
            } catch (e: any) {
                console.warn('Direct silent print error, falling back to standard print:', e);
                toast({
                    variant: 'destructive',
                    title: 'تنبيه في الطباعة الصامتة',
                    description: `${e?.message || 'تعذر الطباعة المباشرة'}. جارٍ التحويل لمعاينة الطباعة.`
                });
                const posReceiptFallback = (
                    <PosReceipt
                        invoice={saleData}
                        company={companySettings}
                        design={receiptDesign}
                        warehouse={warehouseForSession}
                        customer={saleData.customerId ? customers.find((c: any) => c.id === saleData.customerId) : null}
                    />
                );
                await sendToPrinter(posReceiptFallback, 'pos');
            }
        } else {
            // المعاينة العادية
            const posReceiptComponent = (
                <PosReceipt
                    invoice={saleData}
                    company={companySettings}
                    design={receiptDesign}
                    warehouse={warehouseForSession}
                    customer={saleData.customerId ? customers.find((c: any) => c.id === saleData.customerId) : null}
                />
            );
            await sendToPrinter(posReceiptComponent, 'pos');
        }
        
        const kitchenPrinters = printerSettings.kitchenPrinters || [];
        const effectiveKitchenPrinters: any[] = kitchenPrinters.length > 0 ? kitchenPrinters : 
            (printerSettings.useKitchenPrinter && printerSettings.kitchenPrinterAddress ? [{
                id: 'legacy',
                name: 'Kitchen Printer',
                type: printerSettings.kitchenPrinterType || 'system',
                address: printerSettings.kitchenPrinterAddress,
                categories: printerSettings.kitchenPrinterCategories || []
            }] : []);

        if (effectiveKitchenPrinters.length > 0) {
             for (const printer of effectiveKitchenPrinters) {
                const kitchenItems = saleData.items.filter((item: PosItem) => 
                    printer.categories?.includes(item.categoryId || '')
                );
                
                if (kitchenItems.length > 0) {
                    const kitchenType = printer.type;
                    const kitchenAddress = printer.address;
                    
                    if ((kitchenType === 'system' || kitchenType === 'ip') && kitchenAddress) {
                        const lines = kitchenItems.map((item: PosItem) => ({
                            left: `${item.qty} × ${item.name}`,
                            right: (item.total).toFixed(roundingPrecision)
                        }));
                        try {
                            const res = await fetch('/api/print', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    printer: kitchenAddress,
                                    printerType: kitchenType,
                                    content: { title: `طلب مطبخ - ${printer.name}`, lines, footer: `رقم: ${saleData.invoiceNumber || ''}` }
                                })
                            });
                            const data = await res.json();
                            if (!res.ok || data?.ok === false) throw new Error(data?.error || 'فشل إرسال أمر الطباعة للمطبخ');
                        } catch (e: any) {
                            if (kitchenType === 'system') {
                                const kitchenOrderComponent = (
                                    <KitchenReceipt 
                                        invoice={{ ...saleData, items: kitchenItems }}
                                        design={kitchenReceiptDesign}
                                        customer={saleData.customerId ? customers.find((c: any) => c.id === saleData.customerId) : null}
                                        printerName={printer.name}
                                    />
                                );
                                await sendToPrinter(kitchenOrderComponent, 'kitchen', { type: kitchenType, address: kitchenAddress });
                            } else {
                                toast({ variant: 'destructive', title: 'فشل طباعة المطبخ (IP)', description: e?.message || 'تعذر الوصول لطابعة المطبخ' });
                            }
                        }
                    } else {
                        const kitchenOrderComponent = (
                            <KitchenReceipt 
                                invoice={{ ...saleData, items: kitchenItems }}
                                design={kitchenReceiptDesign}
                                customer={saleData.customerId ? customers.find((c: any) => c.id === saleData.customerId) : null}
                                printerName={printer.name}
                            />
                        );
                        await sendToPrinter(kitchenOrderComponent, 'kitchen', { type: kitchenType, address: kitchenAddress });
                    }
                }
            }
        }
    }, [companySettings, receiptDesign, kitchenReceiptDesign, warehouseForSession, customers, settings, sendToPrinter, toast]);

    const selectedCustomerBalance = useMemo(() => {
        if (!selectedCustomerId) return 0;
        const c = customers.find((cust: any) => cust.id === selectedCustomerId);
        if (!c) return 0;

        let balance = Number(c.openingBalance) || 0;
        
        const seenSaleIds = new Set<string>();
        salesInvoices.filter((inv: any) => inv.customerId === selectedCustomerId && (inv.status === 'approved' || inv.status === 'completed' || !inv.status))
            .forEach((inv: any) => {
                if (inv.id) seenSaleIds.add(inv.id);
                balance += (Number(inv.total) - Number(inv.paidAmount || 0));
            });

        posSales.filter((sale: any) => sale.customerId === selectedCustomerId && (!sale.id || !seenSaleIds.has(sale.id)))
            .forEach((sale: any) => {
                balance += (Number(sale.total) - Number(sale.paidAmount || 0));
            });

        customerPayments.filter((p: any) => p.customerId === selectedCustomerId && !p.invoiceId)
            .forEach((p: any) => {
                balance -= Number(p.amount);
            });

        const seenReturnIds = new Set<string>();
        salesReturns.filter((r: any) => r.customerId === selectedCustomerId)
            .forEach((r: any) => {
                if (r.id) seenReturnIds.add(r.id);
                balance -= (Number(r.total) - Number(r.paidAmount || 0));
            });
        
        posReturns.filter((r: any) => r.customerId === selectedCustomerId && (!r.id || !seenReturnIds.has(r.id)))
            .forEach((r: any) => {
                balance -= (Number(r.total) - Number(r.paidAmount || 0));
            });

        return balance;
    }, [selectedCustomerId, customers, salesInvoices, posSales, posReturns, customerPayments, salesReturns]);

    // البث اللحظي لشاشة عرض العميل الثانية مع كل حركة في السلة أو الدفع
    useEffect(() => {
        if (!cxConfig.dualScreen.enabled || !openWorkDay || !hasOpenCashierSession) return;
        if (!hasAutoOpenedDisplayRef.current && !isCustomerDisplayWindowOpen()) {
            hasAutoOpenedDisplayRef.current = true;
            void openCustomerDisplayWindow();
        }
    }, [cxConfig.dualScreen.enabled, openWorkDay, hasOpenCashierSession]);

    useEffect(() => {
        if (!cxConfig.dualScreen.enabled) return;
        const cust = selectedCustomerId ? customers.find((c: any) => c.id === selectedCustomerId) : null;
        broadcastToCustomerDisplay({
            step: cart.length === 0 ? 'idle' : (isPaymentDialogOpen || payments.length > 0 ? 'payment' : 'scanning'),
            timestamp: Date.now(),
            companyName: companySettings.companyName || 'متجرنا',
            branchName: warehouseForSession?.name || '',
            items: cart.map(it => ({
                id: it.id,
                name: it.name,
                qty: it.qty,
                price: it.price,
                originalPrice: it.originalPrice,
                total: it.total,
                discountApplied: it.discountApplied,
                promoApplied: it.promoApplied,
            })),
            subtotal,
            discount: promoDiscount + discount,
            loyaltyDiscount,
            redeemedPoints,
            tax: taxAmount,
            total,
            customer: cust ? {
                id: cust.id,
                name: cust.name,
                phone: cust.phone,
                loyaltyPoints: Number(cust.loyaltyPoints || 0),
                currentBalance: selectedCustomerBalance,
            } : null,
            earnedPoints,
            invoiceNumber: currentInvoiceNumber,
        });
    }, [
        cxConfig.dualScreen.enabled,
        cart,
        subtotal,
        promoDiscount,
        discount,
        loyaltyDiscount,
        redeemedPoints,
        taxAmount,
        total,
        selectedCustomerId,
        customers,
        isPaymentDialogOpen,
        payments,
        earnedPoints,
        currentInvoiceNumber,
        companySettings.companyName,
        warehouseForSession?.name,
        selectedCustomerBalance,
    ]);

    const handleFinishSale = async (sellerId?: string) => {
        if (cart.length === 0 || !warehouseForSession) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'السلة فارغة أو لم يتم تحديد المخزن.' });
            return;
        }
        
        if (isDelivery) {
            if (!deliveryPersonId) {
                 toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "يرجى تحديد موظف التوصيل." });
                return;
            }
            if (!selectedCustomerId) {
                toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "يجب تحديد عميل لفواتير التوصيل." });
                return;
            }
        }
        
        const remainingAmount = total - paidAmount;
        const customer = selectedCustomerId ? customers.find((c: any) => c.id === selectedCustomerId) : null;
        
        if (allowCredit && customer && remainingAmount > 0) {
             const currentBalance = selectedCustomerBalance;
             const creditLimit = customer.creditLimit || 0;
             if (currentBalance + remainingAmount > creditLimit) {
                 toast({ variant: "destructive", title: "تجاوز حد الائتمان", description: `لا يمكن إتمام العملية. الرصيد الحالي ${currentBalance.toLocaleString()} + الفاتورة الحالية ${remainingAmount.toLocaleString()} سيتجاوز حد الائتمان (${creditLimit.toLocaleString()}).` });
                 return;
             }
        } else if (remainingAmount > 0.01 && !allowCredit && !isDelivery && !tableId) {
             if (!tableId) { 
                toast({ variant: "destructive", title: "المبلغ المدفوع غير كافٍ", description: "يجب دفع المبلغ بالكامل أو تفعيل خيار البيع الآجل لعميل مسموح له." });
                return;
            }
        }

        if (!allowNegativeStock && warehouseForSession) {
            for (const cartItem of cart) {
                const itemMaster = allItems.find((i: any) => i.id === cartItem.id);
                const currentStock = itemMaster?.stock ?? calculatePotentialStock(cartItem.id);
                const totalCartBaseQty = cart
                    .filter(i => i.id === cartItem.id)
                    .reduce((sum, i) => sum + (i.qty * (i.conversionFactor || 1)), 0);
                if (totalCartBaseQty > currentStock) {
                    toast({
                        variant: 'destructive',
                        title: 'رصيد المخزون غير كافٍ',
                        description: `لا يمكن إتمام البيع: صنف "${cartItem.name}" رصيده المتاح (${currentStock}) غير كافٍ للكمية المطلوبة بالسلة (${totalCartBaseQty}). البيع بالسالب غير مسموح به.`
                    });
                    return;
                }
            }
        }

        setIsSaving(true);
        try {
            const invoiceNumber = await generateInvoiceNumber(user?.id); 
            if (!invoiceNumber) {
                toast({ variant: 'destructive', title: 'خطأ', description: 'فشل إنشاء رقم فاتورة. تحقق من جلسة الكاشير.' });
                setIsSaving(false);
                return;
            }
            
            const invoiceCounter = parseInt(invoiceNumber.split('-')[0] || '0', 10);
            
            const date = new Date();
            const dateString = date.toISOString().split('T')[0]; 
    
            const saleData: any = {
                invoiceNumber: invoiceNumber,
                invoiceCounter: invoiceCounter,
                date: date.toISOString(),
                items: cart.map(({ uniqueId, ...rest }) => ({...rest})),
                subtotal,
                discount,
                tips: Number(tips || 0), // Added tips
                total,
                payments,
                paidAmount: isDelivery ? 0 : paidAmount,
                change,
                cashierId: user?.id,
                cashierName: user?.name,
                warehouseId: warehouseForSession.id,
                posTerminalId: activeCashierSession?.posTerminalId,
                terminalCode: terminalForSession?.code,
                type: 'pos-sale',
                customerId: selectedCustomerId,
                customerName: customer?.name || "عميل نقدي",
                sellerId: sellerId || null,
                orderReference: orderReference,
                isDelivery,
                deliveryPersonId: isDelivery ? deliveryPersonId : null,
                deliveryPersonName: isDelivery ? deliveryStaff.find((d:any) => d.id === deliveryPersonId)?.name : null,
                tableId: tableId,
                tableName: tableData ? `طاولة ${tableData.number}` : '',
                applyTax: applyTax,
                isTaxIncluded: isTaxIncluded,
                taxAmount: taxAmount,
                taxRate: vatRate / 100,
                etaSettings: settings?.main?.eInvoice?.branchOverrides?.[warehouseForSession.id] || settings?.main?.eInvoice?.default || null,
                customerBalanceBefore: selectedCustomerBalance,
            };
    
            const newSaleId = await dbAction(`posSales/${dateString}`, 'add', saleData) as string;
            if (!newSaleId) throw new Error("Failed to save POS sale");

            // Record tips separately if exists
            if (Number(tips) > 0) {
                await dbAction('gratuityLogs', 'add', {
                    date: date.toISOString(),
                    amount: Number(tips),
                    invoiceNumber: invoiceNumber,
                    invoiceId: newSaleId,
                    cashierId: user?.id,
                    cashierName: user?.name,
                    warehouseId: warehouseForSession.id,
                });
            }
            
            for (const cartItem of cart) {
                const masterItem = allItems.find((i:any) => i.id === cartItem.id);
                if (masterItem?.itemType === 'manufactured' && masterItem.components) {
                    await dbAction('stockOutRecords', 'add', {
                        sourceId: warehouseForSession.id,
                        date: saleData.date,
                        items: masterItem.components.map((comp:any) => ({
                            id: comp.itemId,
                            qty: comp.quantity * cartItem.qty * cartItem.conversionFactor,
                            cost: allItems.find((i:any) => i.id === comp.itemId)?.cost || 0,
                        })),
                        reason: `تصنيع تلقائي لفاتورة كاشير`,
                        saleInvoiceId: newSaleId,
                        saleInvoiceNumber: invoiceNumber,
                        type: 'stock-out-pos-manufacturing',
                    });
                }
            }


            // تحديث رصيد نقاط الولاء للعميل في قاعدة البيانات
            let updatedCustomerPoints = Number(customer?.loyaltyPoints || 0);
            if (customer && cxConfig.loyalty.enabled) {
                updatedCustomerPoints = Math.max(0, Number(customer.loyaltyPoints || 0) - redeemedPoints + earnedPoints);
                const newTotalEarned = Number(customer.totalEarnedPoints || 0) + earnedPoints;
                const newTotalRedeemed = Number(customer.totalRedeemedPoints || 0) + redeemedPoints;
                try {
                    await dbAction('customers', 'update', {
                        id: customer.id,
                        data: {
                            loyaltyPoints: updatedCustomerPoints,
                            totalEarnedPoints: newTotalEarned,
                            totalRedeemedPoints: newTotalRedeemed,
                        },
                    });
                } catch (ptsErr) {
                    console.error('Failed to update customer loyalty points:', ptsErr);
                }
            }

            // تحديث شاشة عرض العميل الثانية إلى خطوة الشكر وإتمام الفاتورة
            if (cxConfig.dualScreen.enabled) {
                broadcastToCustomerDisplay({
                    step: 'completed',
                    timestamp: Date.now(),
                    companyName: companySettings.companyName || 'متجرنا',
                    branchName: warehouseForSession?.name || '',
                    items: [],
                    subtotal,
                    discount: promoDiscount + discount,
                    loyaltyDiscount,
                    redeemedPoints,
                    tax: taxAmount,
                    total,
                    customer: customer ? {
                        id: customer.id,
                        name: customer.name,
                        phone: customer.phone,
                        loyaltyPoints: updatedCustomerPoints,
                    } : null,
                    earnedPoints,
                    invoiceNumber,
                });
            }

            // إرسال إيصال الفاتورة عبر WhatsApp تلقائياً إذا كان الخيار مفعلاً
            if (cxConfig.whatsapp.enabled && cxConfig.whatsapp.autoSendOnPosCheckout && customer?.phone) {
                const waMsg = buildWhatsAppInvoiceMessage({
                    companyName: companySettings.companyName || 'متجرنا',
                    invoiceNumber,
                    customerName: customer.name,
                    date: saleData.date,
                    items: saleData.items,
                    subtotal,
                    discount: promoDiscount + discount,
                    total,
                    paidAmount: saleData.paidAmount,
                    earnedPoints,
                    totalCustomerPoints: updatedCustomerPoints,
                    config: cxConfig,
                });
                sendWhatsAppMessage(customer.phone, waMsg, cxConfig).catch(() => {});
            }

            toast({
                title: 'تمت العملية بنجاح',
                description: customer && cxConfig.loyalty.enabled && earnedPoints > 0
                    ? `تم حفظ الفاتورة ${invoiceNumber} وإضافة +${earnedPoints} نقطة ولاء للعميل`
                    : `تم حفظ الفاتورة ${invoiceNumber}`,
            });

            try {
                await dbAction('notifications', 'add', {
                    title: 'عملية بيع جديدة',
                    body: `تم بيع فاتورة رقم ${invoiceNumber} بقيمة ${total.toLocaleString()}`,
                    timestamp: new Date().toISOString(),
                    type: 'sale',
                    data: {
                        invoiceNumber,
                        total: total,
                        cashier: user?.name || 'Unknown'
                    }
                });
            } catch (err) {
                console.error('Failed to send notification', err);
            }

            if (posSettings.autoPrintReceipt) {
                await handlePrintReceipt({...saleData, id: newSaleId});
            }
            
            if (tableId) {
                if (currentHeldInvoiceId) {
                    await dbAction('heldInvoices', 'remove', { id: currentHeldInvoiceId });
                }
                await dbAction('restaurantTables', 'update', { id: tableId, data: { status: 'available' } });
                router.push('/tables');
            } else {
                resetSale();
            }
    
        } catch (error) {
            console.error("فشل في حفظ عملية البيع:", error);
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ الفاتورة أو تحديث المخزون.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmSale = () => {
        if (isClothingStore) {
            setIsSellerDialogOpen(true);
        } else {
            handleFinishSale();
        }
    }
    
    const onSellerSelected = (sellerId: string) => {
        setIsSellerDialogOpen(false);
        if(warehouseForSession){
             handleFinishSale(sellerId);
        }
    }

     const handleHoldInvoice = useCallback(async () => {
        if (cart.length === 0) {
            if (tableId) {
                 await dbAction('restaurantTables', 'update', {id: tableId, data: {status: 'available'}});
                 if (currentHeldInvoiceId) {
                    await dbAction('heldInvoices', 'remove', {id: currentHeldInvoiceId});
                 }
                 router.push('/tables');
            }
            return;
        }

        const heldInvoiceData: Partial<HeldInvoice> = {
            heldAt: new Date().toISOString(),
            cashierName: user?.name || 'غير معروف',
            itemCount: cart.length,
            total: total,
            cart: cart,
            discount: discount,
            tips: Number(tips || 0), // Added tips to partial held invoice
            orderReference: orderReference,
        };

        if (tableId && tableData) {
            heldInvoiceData.tableId = tableId;
            heldInvoiceData.tableName = (tableData as any).number ? `طاولة ${tableData.number}` : undefined;
        }
        
        try {
            if (currentHeldInvoiceId) {
                await dbAction('heldInvoices', 'update', { id: currentHeldInvoiceId, data: heldInvoiceData });
                toast({ title: 'تم تحديث الطلب', description: 'تم تحديث أصناف الطاولة بنجاح.' });
            } else {
                const newHeldId = await dbAction('heldInvoices', 'add', heldInvoiceData);
                setCurrentHeldInvoiceId(newHeldId as string);
                toast({ title: 'تم تعليق الفاتورة', description: 'يمكنك استرجاعها من قائمة الفواتير المعلقة.' });
            }
            if(tableId) {
                 await dbAction('restaurantTables', 'update', {id: tableId, data: {status: 'occupied'}});
                 router.push('/tables');
            } else {
                resetSale();
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ الطلب المعلق.' });
        }
    }, [user?.name, cart, total, discount, tips, orderReference, tableId, tableData, currentHeldInvoiceId, dbAction, toast, router, resetSale]);

    const posTableCandidates = useMemo(() => {
        if (!posTableActionModal || !restaurantTables) return [];
        const heldTableIds = new Set((heldInvoices || []).map((inv: HeldInvoice) => inv.tableId));

        return restaurantTables
            .filter((t: any) => {
                if (tableId && t.id === tableId) return false;
                if (tableData?.warehouseId && t.warehouseId !== tableData.warehouseId) return false;
                const isOccupied = heldTableIds.has(t.id);
                if (posTableActionModal === 'transfer') return !isOccupied;
                if (posTableActionModal === 'merge') return isOccupied;
                return true; // 'select' shows all tables in branch
            })
            .sort((a: any, b: any) => a.number - b.number);
    }, [posTableActionModal, restaurantTables, heldInvoices, tableId, tableData]);

    const handleExecutePosTableAction = async () => {
        if (!selectedTargetTableId) return;
        const targetTable = restaurantTables.find((t: any) => t.id === selectedTargetTableId);
        if (!targetTable) return;

        if (posTableActionModal === 'select') {
            setPosTableActionModal(null);
            setSelectedTargetTableId('');
            router.push(`/pos?tableId=${targetTable.id}`);
            return;
        }

        if (!tableData || !tableId) return;
        setIsProcessingTableAction(true);
        try {
            // Ensure current cart items are persisted to heldInvoices first
            let activeSourceInvoice = (heldInvoices || []).find((inv: HeldInvoice) => inv.id === currentHeldInvoiceId || inv.tableId === tableId);
            const currentInvoicePayload: any = {
                heldAt: new Date().toISOString(),
                cashierName: user?.name || 'كاشير',
                itemCount: cart.reduce((acc, item) => acc + item.qty, 0),
                total,
                cart,
                discount,
                tips,
                orderReference: orderReference || `طاولة ${tableData.number}`,
                tableId,
                tableName: `طاولة ${tableData.number}`,
            };

            if (activeSourceInvoice) {
                await dbAction('heldInvoices', 'update', { id: activeSourceInvoice.id, data: currentInvoicePayload });
                activeSourceInvoice = { ...activeSourceInvoice, ...currentInvoicePayload };
            } else {
                const newId = await dbAction('heldInvoices', 'add', currentInvoicePayload);
                activeSourceInvoice = { id: newId, ...currentInvoicePayload };
            }

            if (posTableActionModal === 'transfer') {
                await transferTableOrder({
                    sourceTable: tableData,
                    targetTable,
                    heldInvoice: activeSourceInvoice,
                    dbAction,
                    user,
                });
                toast({
                    title: 'تم نقل الطلب بنجاح ✅',
                    description: `تم نقل طلب طاولة ${tableData.number} إلى طاولة ${targetTable.number}.`,
                });
            } else if (posTableActionModal === 'merge') {
                const targetInvoice = (heldInvoices || []).find((inv: HeldInvoice) => inv.tableId === targetTable.id);
                await mergeTableOrders({
                    sourceTable: tableData,
                    targetTable,
                    sourceInvoice: activeSourceInvoice,
                    targetInvoice,
                    dbAction,
                    user,
                });
                toast({
                    title: 'تم دمج الطاولتين في شيك واحد ✅',
                    description: `تم دمج طاولة ${tableData.number} داخل شيك طاولة ${targetTable.number}.`,
                });
            }

            setPosTableActionModal(null);
            setSelectedTargetTableId('');
            router.push(`/pos?tableId=${targetTable.id}`);
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'تعذر إتمام العملية',
                description: err?.message || 'حدث خطأ أثناء تنفيذ العملية.',
            });
        } finally {
            setIsProcessingTableAction(false);
        }
    };


    const handleStartMyShift = async (data: { posTerminalId: string, sessionWarehouseId: string }) => {
        if (!openWorkDay || !user) return;
        
        try {
            const newCashierSession = {
                cashierId: user.id,
                cashierName: user.name,
                startTime: new Date().toISOString(),
                openingBalance: 0,
                isClosed: false,
                sessionWarehouseId: data.sessionWarehouseId,
                posTerminalId: data.posTerminalId,
                invoiceCounter: 0,
            };

            const updatedSessions = { ...(openWorkDay.cashierSessions || {}), [user.id]: newCashierSession };
            await dbAction('posSessions', 'update', { id: openWorkDay.id, data: { cashierSessions: updatedSessions } });
            toast({ title: "تم بدء الوردية", description: "يمكنك الآن البدء في عمليات البيع." });
        } catch (error) {
            toast({ variant: 'destructive', title: "خطأ", description: "فشل بدء الوردية." });
        }
    };

    const handleRetrieveInvoice = (invoice: HeldInvoice) => {
        const safeCart = Array.isArray(invoice.cart)
            ? invoice.cart
            : Array.isArray((invoice as any).items)
            ? (invoice as any).items
            : [];
        setCart(safeCart);
        setDiscount(invoice.discount || 0);
        setTips(invoice.tips || 0); // Restore tips
        setOrderReference(invoice.orderReference || '');
        toast({ title: 'تم استرجاع الفاتورة', description: 'الفاتورة جاهزة للاستكمال.' });
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            setIsPaymentDialogOpen(true);
        }
    };
    
    const handlePaymentSectionKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            if (cart.length > 0 && (paidAmount >= total || allowCredit || isDelivery || tableId)) {
                handleConfirmSale();
            }
        }
    };
    
    
    const handleAddPayment = useCallback((payment: Omit<Payment, 'id'>) => {
        setPayments(prev => [...prev, { ...payment, id: `${Date.now()}` }]);
        setIsPaymentDialogOpen(false);
    }, []);

    const handleRemovePayment = (paymentId: string) => {
        setPayments(prev => prev.filter(p => p.id !== paymentId));
    };

    const setFullCashPayment = () => {
        const cashMethod = enabledPaymentMethods.find(pm => pm.name.toLowerCase().includes('cash') || pm.name.toLowerCase().includes('نقد'));
        const methodName = cashMethod ? cashMethod.name : 'نقدي';
        if (total > 0) {
            setPayments([{ method: methodName, amount: total, id: `${Date.now()}` }]);
        }
    };

    const handleScreenClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (
            cxConfig.dualScreen.enabled &&
            !hasUserGestureOpenedDisplayRef.current &&
            !isCustomerDisplayWindowOpen()
        ) {
            hasUserGestureOpenedDisplayRef.current = true;
            void openCustomerDisplayWindow();
        }
        const target = e.target as HTMLElement;
        if (
            target.closest('button') ||
            target.closest('input') ||
            target.closest('a') ||
            target.closest('[role="dialog"]') ||
            target.closest('[data-radix-popper-content-wrapper]')
        ) {
            return;
        }
        barcodeInputRef.current?.focus();
    };
    
    const handleNewCustomerSave = async (customerData: Customer) => {
        try {
            const newId = await dbAction('customers', 'add', customerData);
            if (newId) {
                toast({ title: 'تم إضافة العميل بنجاح' });
                setSelectedCustomerId(newId as string);
            }
        } catch(e) {
            toast({ variant: 'destructive', title: 'فشل إضافة العميل' });
        }
    }
    
    const customerOptions = useMemo(() => {
        if (!customers || !Array.isArray(customers)) return [];
        const q = customerSearch.trim().toLowerCase();
        const filtered = q
            ? customers.filter((c: any) =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.phone && String(c.phone).includes(q))
              )
            : customers.slice(0, 60);

        const list = [...filtered];
        if (selectedCustomerId && !list.some((c: any) => c.id === selectedCustomerId)) {
            const current = customers.find((c: any) => c.id === selectedCustomerId);
            if (current) list.unshift(current);
        }

        return list.map((c: any) => {
            const pts = Number(c.loyaltyPoints || 0);
            const phonePart = c.phone ? ` (${c.phone})` : '';
            const ptsPart = cxConfig.loyalty.enabled && pts > 0 ? ` • ⭐ ${pts}` : '';
            return {
                value: c.id,
                label: `${c.name}${phonePart}${ptsPart}`
            };
        });
    }, [customers, customerSearch, selectedCustomerId, cxConfig.loyalty.enabled]);

    const selectedCustomer = useMemo(() => {
        if (!selectedCustomerId) return null;
        return customers.find((c: any) => c.id === selectedCustomerId);
    }, [selectedCustomerId, customers]);

    useEffect(() => {
        if (selectedCustomer && selectedCustomer.allowCredit) {
            setAllowCredit(true);
        } else {
            setAllowCredit(false);
        }
    }, [selectedCustomer]);

    const lastPriceForCustomer = useMemo(() => {
        return null;
    }, []);

    const getItemLastPrice = useCallback((itemId: string) => {
        if (!selectedCustomerId) return null;
        const approvedSales = salesInvoices.filter(s => s.status === 'approved' || s.status === 'completed' || !s.status);
        const seenSaleIds = new Set(approvedSales.map(s => s.id));
        const standalonePos = (posSales || []).filter(s => !seenSaleIds.has(s.id));
        const allSales = [...approvedSales, ...standalonePos];
        const customerSales = allSales.filter(s => s.customerId === selectedCustomerId);
        customerSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        for (const sale of customerSales) {
            const itemInSale = sale.items?.find((i: any) => i.id === itemId);
            if (itemInSale) return itemInSale.price;
        }
        return null;
    }, [selectedCustomerId, salesInvoices, posSales]);


    if (isCentral) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40 p-4">
                <Card className="w-full max-w-lg border-2 border-border shadow-xl">
                    <CardHeader className="text-center pb-3">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-foreground mb-3 border border-border">
                            <Building2 className="h-8 w-8" />
                        </div>
                        <CardTitle className="text-xl font-black text-foreground">
                            شاشة الكاشير غير مفعلة في الإدارة المركزية
                        </CardTitle>
                        <CardDescription className="text-sm">
                            هذا النظام يعمل حالياً بدور "الإدارة المركزية (Central HQ)"
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Alert className="border-border bg-muted/30 text-foreground">
                            <Ban className="h-5 w-5 text-foreground" />
                            <AlertTitle className="font-bold mr-2">منع حركات البيع المباشرة في الإدارة</AlertTitle>
                            <AlertDescription className="text-xs leading-relaxed mr-2 mt-1">
                                حركات الكاشير ونقاط البيع المباشرة، فتح الورديات، وتسليم العهد النقدية مصممة ومخصصة للعمل داخل فروع البيع الفعلية فقط.
                                الإدارة المركزية تستقبل حركات ومبيعات الفروع آلياً عبر المزامنة للمراجعة والتدقيق المالي فقط.
                            </AlertDescription>
                        </Alert>
                        <div className="p-3 bg-muted/60 rounded-lg text-xs space-y-1.5 text-muted-foreground border">
                            <div className="flex justify-between font-semibold text-foreground">
                                <span>دور النظام الحالي:</span>
                                <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[11px]">إدارة مركزية (Central HQ)</Badge>
                            </div>
                            <div className="flex justify-between">
                                <span>نطاق عمليات البيع:</span>
                                <span className="font-medium text-foreground">تُجرى من شاشات كاشيرات الفروع المحلية حصراً</span>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-2 pt-2">
                        <Button className="w-full" variant="default" onClick={() => router.push('/dashboard')}>
                            <LayoutDashboard className="ml-2 h-4 w-4" />
                            الرجوع للوحة التحكم الرئيسية
                        </Button>
                        <Button className="w-full" variant="outline" onClick={() => router.push('/settings/central-sync')}>
                            <ArrowLeft className="ml-2 h-4 w-4" />
                            الذهاب إلى شاشة إدارة المزامنة والربط
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    if (!user?.isCashier) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-muted">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-destructive"><Ban /> وصول مرفوض</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Alert variant="destructive">
                            <AlertTitle>غير مصرح به</AlertTitle>
                            <AlertDescription>
                                أنت لا تملك الصلاحيات اللازمة للوصول إلى شاشة نقاط البيع. يرجى التواصل مع مسؤول النظام.
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    if (!openWorkDay || !hasOpenCashierSession) {
         return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-muted">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className='flex items-center gap-2 text-foreground'><Ban /> الوردية مغلقة</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Alert>
                            <AlertTitle>{!openWorkDay ? "يوم العمل مغلق" : "لم يتم تسليم العهدة"}</AlertTitle>
                            <AlertDescription>
                                {!openWorkDay ? "لا يمكنك بدء عمليات البيع لأنه لا توجد يومية عمل مفتوحة. يرجى الطلب من مسؤول النظام فتح يوم عمل جديد." : (user?.canOpenOwnShift || user?.role === 'مسؤول' ? "لم يتم تسليم عهدة بداية اليوم لك. يمكنك الضغط على زر 'بدء ورديتي' أدناه للمتابعة." : "لم يتم تسليم عهدة بداية اليوم لك. يرجى الطلب من المسؤول تسليم العهدة لبدء ورديتك.")}
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-2">
                        {openWorkDay && (user?.canOpenOwnShift || user?.role === 'مسؤول') && (
                            <>
                                <Button className="w-full" onClick={() => setIsSelfShiftDialogOpen(true)}>
                                    <PlayCircle className="ml-2 h-4 w-4" />
                                    بدء ورديتي
                                </Button>
                                <Dialog open={isSelfShiftDialogOpen} onOpenChange={setIsSelfShiftDialogOpen}>
                                    <SelfShiftOpeningDialog 
                                        onConfirm={handleStartMyShift} 
                                        onClose={() => setIsSelfShiftDialogOpen(false)}
                                        warehouses={warehouses}
                                         terminals={posTerminals}
                                         activeSessions={openWorkDay.cashierSessions ? Object.values(openWorkDay.cashierSessions).filter((s: any) => !s.isClosed) : []}
                                     />
                                </Dialog>
                            </>
                        )}
                        <Button className="w-full" variant="outline" onClick={() => router.push('/')}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            الرجوع للشاشة الرئيسية
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    const { widthName = 35, widthBarcode = 20, widthPrice = 15, widthQty = 15, widthTotal = 15 } = posSettings.cartColumns || {};
    const { layout = 'cart-left', cartWidth = 40, itemsWidth = 60, groupsPosition = 'left', groupsWidth = 240, paymentPosition = 'bottom' } = posSettings.layout || {};
    const effectiveGroupsWidth = customGroupsWidth ?? (Number(groupsWidth) || 240);
    const updateGroupsWidth = (nextWidth: number) => {
        const clamped = Math.max(150, Math.min(500, nextWidth));
        setCustomGroupsWidth(clamped);
        try {
            localStorage.setItem('pos_groups_width', String(clamped));
        } catch {}
    };
    const isCartOnLeft = layout === 'cart-right' || layout === 'left';

    return (
        <>
        <Dialog open={isSellerDialogOpen} onOpenChange={setIsSellerDialogOpen}>
            <SellerSelectionDialog onSelectSeller={onSellerSelected} warehouseId={warehouseForSession?.id || ''} />
        </Dialog>
        <Dialog open={isQueryModalOpen} onOpenChange={setIsQueryModalOpen}>
            <StockQueryDialog onOpenChange={setIsQueryModalOpen} onAddToCart={(item: any) => addItemToCart(item, 1)} {...allDataContext} />
        </Dialog>
        <Dialog open={isHeldInvoicesOpen} onOpenChange={setIsHeldInvoicesOpen}>
            <HeldInvoicesDialog onClose={() => setIsHeldInvoicesOpen(false)} onRetrieve={handleRetrieveInvoice} />
        </Dialog>
        <AlertDialog open={!!itemForManualEntry} onOpenChange={(open) => !open && setItemForManualEntry(null)}>
            {itemForManualEntry && 
                <ManualEntryDialog 
                    item={itemForManualEntry} 
                    onClose={() => setItemForManualEntry(null)} 
                    onConfirm={(data) => addItemToCart(itemForManualEntry, data.qty)}
                    rounding={roundingPrecision}
                    defaultFocus={posSettings.scaleItemDefaultFocus || 'weight'}
                />
            }
        </AlertDialog>
         <Dialog open={!!itemForSecondaryUnit} onOpenChange={(open) => !open && setItemForSecondaryUnit(null)}>
            {itemForSecondaryUnit && (
                <SecondaryUnitDialog
                    item={itemForSecondaryUnit}
                    onClose={() => setItemForSecondaryUnit(null)}
                    onSelectUnit={(unit, qty) => addItemToCart(itemForSecondaryUnit, qty, unit)}
                />
            )}
        </Dialog>
        <Dialog open={isQuantityEditDialogOpen} onOpenChange={setIsQuantityEditDialogOpen}>
            {itemForQuantityUpdate && (
                <QuantityEditDialog
                    item={itemForQuantityUpdate}
                    onClose={() => setIsQuantityEditDialogOpen(false)}
                    onConfirm={(newQty) => {
                        updateQty(itemForQuantityUpdate.uniqueId, newQty);
                        setIsQuantityEditDialogOpen(false);
                    }}
                />
            )}
        </Dialog>
         <div 
            className="h-screen bg-background flex flex-col p-2 sm:p-4 gap-4 overflow-y-auto overscroll-y-contain"
            onClick={handleScreenClick}
        >
            <div className={cn("flex flex-1 flex-col gap-3 overflow-y-auto md:overflow-hidden",
                isCartOnLeft ? 'md:flex-row-reverse' : 'md:flex-row'
            )}>
                <div 
                    className="w-full pos-cart-panel flex flex-col gap-4 md:overflow-hidden" 
                    style={{ '--cart-width': `${cartWidth}%` } as React.CSSProperties}
                >
                    <Card className="flex-1 flex flex-col md:overflow-hidden">
                        <CardHeader className="shrink-0 p-3 flex-col gap-2">
                            <div className='flex items-center justify-between gap-2 flex-wrap'>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <ShoppingCart className="h-5 w-5" /> 
                                        {tableData ? (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-extrabold text-sm">
                                                <UtensilsCrossed className="h-4 w-4" />
                                                طاولة {tableData.number}
                                                {tableData.groupName ? ` (${tableData.groupName})` : ''}
                                            </span>
                                        ) : 'سلة المبيعات'}
                                    </CardTitle>
                                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground">
                                        عدد الأصناف: {totalItemsCount}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 flex-wrap">
                                    {tableData && (
                                        <>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 px-2 text-xs gap-1 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                                                disabled={cart.length === 0 && !currentHeldInvoiceId}
                                                onClick={() => { setSelectedTargetTableId(''); setPosTableActionModal('transfer'); }}
                                                title="نقل الطلب إلى طاولة أخرى"
                                            >
                                                <ArrowRightLeft className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline">نقل</span>
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 px-2 text-xs gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                                                disabled={cart.length === 0 && !currentHeldInvoiceId}
                                                onClick={() => { setSelectedTargetTableId(''); setPosTableActionModal('merge'); }}
                                                title="دمج مع طاولة أخرى في شيك واحد"
                                            >
                                                <GitMerge className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline">دمج</span>
                                            </Button>
                                        </>
                                    )}
                                    {!tableData && restaurantTables && restaurantTables.length > 0 && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 px-2.5 text-xs gap-1.5"
                                            onClick={() => { setSelectedTargetTableId(''); setPosTableActionModal('select'); }}
                                        >
                                            <UtensilsCrossed className="h-3.5 w-3.5" />
                                            <span>الطاولات</span>
                                        </Button>
                                    )}
                                    <PosSilentPrinterDialog />
                                    <PosSyncStatusBadge />
                                    {showBackButton && (
                                         <Button variant="ghost" size="icon" onClick={handleHoldInvoice} title="حفظ والعودة للطاولات">
                                            <ArrowLeft className="h-5 w-5"/>
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className='flex items-center justify-between gap-1'>
                                <Input placeholder="رقم/اسم الطلب" value={orderReference} onChange={(e: any) => setOrderReference(e.target.value)} className="h-9 flex-1"/>
                                 <Combobox
                                    options={customerOptions}
                                    value={selectedCustomerId || ''}
                                    onValueChange={setSelectedCustomerId}
                                    onInputChange={setCustomerSearch}
                                    placeholder="عميل نقدي"
                                    emptyMessage="لم يتم العثور على عميل."
                                    className="w-40"
                                />
                                <AddEntityDialog
                                    title="إضافة عميل جديد"
                                    description="أدخل عميلاً جديداً بسرعة."
                                    triggerButton={<Button size="icon" variant="outline"><UserPlus/></Button>}
                                >
                                    <NewCustomerForm onSave={handleNewCustomerSave} onClose={() => {}} allCustomers={customers} />
                                </AddEntityDialog>
                            </div>
                            {selectedCustomer && (
                                <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs">
                                    <div className="flex items-center gap-1.5 font-semibold text-amber-500">
                                        <Gift className="h-3.5 w-3.5 shrink-0" />
                                        <span>نقاط الولاء: {Number(selectedCustomer.loyaltyPoints || 0).toLocaleString()} نقطة</span>
                                        <span className="text-muted-foreground">({calculateRedeemableCash(Number(selectedCustomer.loyaltyPoints || 0), cxConfig)} ج.م)</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {cxConfig.loyalty.enabled && Number(selectedCustomer.loyaltyPoints || 0) >= cxConfig.loyalty.minPointsToRedeem && cart.length > 0 && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={redeemedPoints > 0 ? "destructive" : "default"}
                                                className="h-6 px-2 text-[11px]"
                                                onClick={handleToggleLoyaltyRedeem}
                                            >
                                                {redeemedPoints > 0 ? `إلغاء استبدال (${redeemedPoints} ن)` : 'استبدال النقاط كخصم'}
                                            </Button>
                                        )}
                                        {cxConfig.whatsapp.enabled && selectedCustomer.phone && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-6 px-2 text-[11px] gap-1 border-green-500/40 text-green-600 hover:bg-green-500/10"
                                                onClick={() => {
                                                    const msg = buildWhatsAppInvoiceMessage({
                                                        companyName: companySettings.companyName || 'متجرنا',
                                                        invoiceNumber: currentInvoiceNumber,
                                                        customerName: selectedCustomer.name,
                                                        date: new Date().toISOString(),
                                                        items: cart,
                                                        subtotal,
                                                        discount: promoDiscount + discount,
                                                        total,
                                                        paidAmount: paidAmount || total,
                                                        earnedPoints,
                                                        totalCustomerPoints: Number(selectedCustomer.loyaltyPoints || 0),
                                                        config: cxConfig,
                                                    });
                                                    sendWhatsAppMessage(selectedCustomer.phone, msg, cxConfig);
                                                }}
                                            >
                                                <MessageCircle className="h-3 w-3" />
                                                واتساب
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                             <div className="flex items-center space-x-2 rtl:space-x-reverse pt-2">
                                <Switch id="is-delivery" checked={isDelivery} onCheckedChange={(checked: any) => setIsDelivery(!!checked)} />
                                <Label htmlFor="is-delivery" className="flex items-center gap-2 cursor-pointer">
                                    <Truck className="h-5 w-5" />
                                    فاتورة توصيل (دليفري)
                                </Label>
                                {isDelivery && (
                                     <Dialog open={isDeliveryPersonDialogOpen} onOpenChange={setIsDeliveryPersonDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" className="flex-1 justify-start text-left">
                                                {deliveryPersonId ? deliveryStaff.find((d:any) => d.id === deliveryPersonId)?.name : "اختر الطيار..."}
                                            </Button>
                                        </DialogTrigger>
                                        <DeliveryPersonDialog onSelect={setDeliveryPersonId} onOpenChange={setIsDeliveryPersonDialogOpen}/>
                                    </Dialog>
                                )}
                            </div>
                        </CardHeader>
                        <ScrollArea dir="rtl" className="flex-1 border-t border-b max-h-48 md:max-h-full">
                            <Table dir="rtl" className="table-fixed w-full">
                                <colgroup>
                                    <col style={{ width: `${widthName}%` }} />
                                    {posSettings.cartColumns?.showBarcode && <col style={{ width: `${widthBarcode}%` }} />}
                                    {posSettings.cartColumns?.showPrice && <col style={{ width: `${widthPrice}%` }} />}
                                    <col style={{ width: `${widthQty}%` }} />
                                    <col style={{ width: `${widthTotal}%` }} />
                                    <col style={{ width: '40px' }} />
                                </colgroup>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead style={{ width: `${widthName}%` }} className="text-right px-2 py-2">الصنف</TableHead>
                                        {posSettings.cartColumns?.showBarcode && <TableHead style={{ width: `${widthBarcode}%` }} className="text-center px-1 py-2">الباركود</TableHead>}
                                        {posSettings.cartColumns?.showPrice && <TableHead className="text-center px-1 py-2" style={{ width: `${widthPrice}%` }}>السعر</TableHead>}
                                        <TableHead className="text-center px-1 py-2" style={{ width: `${widthQty}%` }}>الكمية</TableHead>
                                        <TableHead className="text-center px-1 py-2" style={{ width: `${widthTotal}%` }}>الإجمالي</TableHead>
                                        <TableHead style={{ width: '40px' }} className="w-10 p-1 text-center"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                 <TableBody>
                                    {(cart || []).map(item => {
                                        const lastPrice = getItemLastPrice(item.id);
                                        const itemPtsPromo = getItemPointsPromotion(item, cxConfig);
                                        return (
                                        <TableRow key={item.uniqueId}>
                                            <TableCell style={{ width: `${widthName}%` }} className='px-2 py-2 truncate text-right'>
                                                <div className="flex flex-col overflow-hidden text-right">
                                                    <span className="truncate font-medium">{item.name}</span>
                                                    <div className="flex items-center gap-1 justify-start flex-wrap">
                                                        {item.discountApplied > 0 && <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700"><Percent className="h-2 w-2 mr-0.5"/> خصم</span>}
                                                        {itemPtsPromo && (
                                                            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                                ⭐ {itemPtsPromo.pointsMode === 'multiplier' ? `${itemPtsPromo.pointsValue}x نقاط` : `+${itemPtsPromo.pointsValue} نقطة`}
                                                            </span>
                                                        )}
                                                        {lastPrice !== null && (
                                                            <div className="flex items-center gap-0.5 text-[9px] text-primary font-bold">
                                                                <History className="h-2 w-2" />
                                                                <span>آخر سعر: {lastPrice.toLocaleString()}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            {posSettings.cartColumns?.showBarcode && <TableCell style={{ width: `${widthBarcode}%` }} className='px-1 py-2 text-center text-xs text-muted-foreground font-mono truncate'>{item.code}</TableCell>}
                                            {posSettings.cartColumns?.showPrice && <TableCell style={{ width: `${widthPrice}%` }} className='px-1 py-2 text-center font-mono'>{item.price.toFixed(roundingPrecision)}</TableCell>}
                                            <TableCell style={{ width: `${widthQty}%` }} className='px-1 py-2 text-center'><Input type="number" value={item.qty} readOnly onClick={() => { setItemForQuantityUpdate(item); setIsQuantityEditDialogOpen(true); }} className="w-14 sm:w-16 h-8 text-center mx-auto cursor-pointer focus:ring-2 focus:ring-primary px-1" /></TableCell>
                                            <TableCell style={{ width: `${widthTotal}%` }} className="px-1 py-2 text-center font-bold font-mono">{item.total.toFixed(roundingPrecision)}</TableCell>
                                            <TableCell style={{ width: '40px' }} className='py-2 p-1 text-center w-10'>
                                                {user?.canDeleteFromCart && (
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive mx-auto" onClick={() => updateQty(item.uniqueId, 0)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )})}
                                    {cart.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3 + (posSettings.cartColumns?.showBarcode ? 1 : 0) + (posSettings.cartColumns?.showPrice ? 1 : 0) + 1} className="text-center text-muted-foreground h-32 py-8">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <ShoppingCart className="h-8 w-8 text-muted-foreground/30" />
                                                    <span>السلة فارغة</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                        <CardFooter className="p-2 text-sm text-muted-foreground shrink-0 border-t">
                             فاتورة: <span className="font-mono">{currentInvoiceNumber}</span> | الكاشير: <span className="font-semibold">{user?.name}</span>
                        </CardFooter>
                    </Card>
                </div>
                
                <div 
                    className={cn("w-full flex-1 pos-items-panel flex flex-col md:overflow-hidden gap-3", paymentPosition === 'top' ? 'md:flex-col-reverse' : '')} 
                    style={{ '--items-width': `${itemsWidth}%` } as React.CSSProperties}
                >
                    <div className="shrink-0 flex items-center gap-2">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-12 w-12 shrink-0 flex hover:bg-muted/60" 
                            onClick={handleAttemptExit}
                            title="الرجوع إلى لوحة التحكم (الرئيسية)"
                        >
                            <Undo2 className="h-6 w-6" />
                        </Button>
                        <form onSubmit={handleBarcodeSubmit} className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                <Input 
                                    ref={barcodeInputRef} 
                                    placeholder="امسح الباركود أو ابحث بالاسم..." 
                                    className="h-12 text-lg pl-10 pr-9" 
                                    onChange={(e: any) => setSearchTerm(e.target.value)} 
                                    onFocus={() => setIsSearchFocused(true)}
                                    onClick={(e: any) => e.currentTarget.select()}
                                    onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
                                    onKeyDown={handleInputKeyDown}
                                />
                                {searchTerm && (
                                    <button
                                        type="button"
                                        aria-label="مسح البحث"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm font-bold p-1"
                                        onClick={() => {
                                            setSearchTerm('');
                                            if (barcodeInputRef.current) barcodeInputRef.current.value = '';
                                            barcodeInputRef.current?.focus();
                                        }}
                                    >
                                        ✕
                                    </button>
                                )}

                                {/* قائمة منبثقة تفاعلية بنتائج البحث أثناء الكتابة */}
                                {isSearchFocused && searchTerm.trim().length > 0 && matchingQuickItems.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border shadow-2xl rounded-xl z-50 max-h-80 overflow-y-auto p-1.5 divide-y divide-border/40">
                                        <div className="flex items-center justify-between px-2.5 py-1 text-xs text-muted-foreground">
                                            <span className="font-semibold text-foreground">الأصناف المطابقة ({matchingQuickItems.length}):</span>
                                            <span>اضغط على أي صنف لإضافته للسلة فوراً</span>
                                        </div>
                                        {(matchingQuickItems || []).map((item: any) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                                                onMouseDown={(e) => {
                                                    e.preventDefault(); // يمنع فقدان التركيز قبل التنفيذ
                                                    addItemToCart(item, 1);
                                                    setSearchTerm('');
                                                    if (barcodeInputRef.current) barcodeInputRef.current.value = '';
                                                    barcodeInputRef.current?.focus();
                                                }}
                                            >
                                                <div className="flex flex-col text-right">
                                                    <span className="font-bold text-sm text-foreground">{item.name}</span>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        {item.code && <span className="text-[11px] text-muted-foreground font-mono">كود: {item.code}</span>}
                                                        {item.barcode && item.barcode !== item.code && <span className="text-[11px] text-muted-foreground font-mono">باركود: {item.barcode}</span>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2.5">
                                                    <span className="font-bold font-mono text-sm">{item.price?.toLocaleString()} ج.م</span>
                                                    <Badge variant={item.stock > 0 ? "secondary" : "destructive"} className="font-mono text-xs">
                                                        {item.stock > 0 ? `${item.stock} متاح` : 'نفد'}
                                                    </Badge>
                                                    <Button size="sm" variant="default" className="h-7 px-2.5 text-xs font-bold gap-1">
                                                        <PlusCircle className="h-3.5 w-3.5" />
                                                        إضافة
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </form>
                        <Button 
                            type="button"
                            variant="outline" 
                            className="h-12 px-3 gap-2 shrink-0 md:hidden bg-yellow-400/15 hover:bg-yellow-400/25 text-yellow-500 dark:text-yellow-400 border-yellow-400/50 rounded-xl"
                            onClick={() => setIsCameraScannerOpen(true)} 
                            title="مسح الباركود بكاميرا الموبايل"
                        >
                            <Camera className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
                            <span className="text-xs font-bold hidden sm:inline">كاميرا</span>
                        </Button>
                        <Button variant="outline" size="icon" className="h-12 w-12 shrink-0 rounded-xl" onClick={() => setIsQueryModalOpen(true)} title="استعلام المخزون">
                            <Boxes className="h-6 w-6" />
                        </Button>
                        <div className="hidden xl:flex items-center gap-1.5">
                            <PosSilentPrinterDialog />
                            <PosSyncStatusBadge className="h-12 rounded-xl" />
                        </div>
                    </div>
                    
                    <div className="flex-1 flex flex-col md:flex-row gap-3 overflow-y-auto md:overflow-hidden min-h-[25vh] md:min-h-0">
                         <div className="p-2 border-b shrink-0 md:hidden">
                           <ScrollArea>
                                <div className="flex flex-row-reverse gap-2">
                                     <Button size="lg" variant={activeGroupId === 'all' ? 'secondary' : 'ghost'} onClick={() => { setActiveGroupId('all'); setActiveGroupType('all'); setSearchTerm(''); setExplicitShowAll(true); }} className="h-14 shrink-0">
                                        <Grip className="ml-2 h-5 w-5" /> كل الأصناف
                                    </Button>
                                    {(groupsToShow || []).map((group: any) => {
                                        const isHex = group.color && (group.color.startsWith('#') || group.color.startsWith('rgb') || group.color.startsWith('hsl'));
                                        const borderClass = !group.color ? 'border-primary/50' : (!isHex ? (group.color.startsWith('bg-') ? group.color.replace(/^bg-/, 'border-') : group.color) : '');
                                        return (
                                            <Button
                                                key={group.id}
                                                size="lg"
                                                variant={activeGroupId === group.id ? 'secondary' : 'outline'}
                                                onClick={() => { setActiveGroupId(group.id!); setActiveGroupType(group.type); setSearchTerm(''); }}
                                                className={cn("h-12 shrink-0 border-2 px-3", borderClass, activeGroupId === group.id && "ring-2 ring-primary/50")}
                                                style={isHex ? { borderColor: group.color } : undefined}
                                            >
                                                {group.name}
                                            </Button>
                                        );
                                    })}
                                </div>
                                <ScrollBar orientation="horizontal" />
                           </ScrollArea>
                        </div>
                        
                         <div className="flex-1 flex flex-row gap-3 overflow-hidden min-h-0">
                            <div
                                className={cn("hidden md:flex flex-col shrink-0 min-h-0 h-full",
                                    groupsPosition === 'left' ? 'order-2' : 'order-1'
                                )}
                                style={{ width: `${effectiveGroupsWidth}px` }}
                            >
                                <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                 <CardHeader className="p-2 border-b shrink-0 flex flex-row items-center justify-between gap-1 space-y-0">
                                     <button
                                         type="button"
                                         onClick={() => updateGroupsWidth(effectiveGroupsWidth - 25)}
                                         className="h-6 w-6 rounded border text-xs font-bold hover:bg-accent flex items-center justify-center shrink-0"
                                         title="تصغير عرض المجموعات"
                                     >
                                         -
                                     </button>
                                     <CardTitle className="text-sm md:text-base text-center truncate">المجموعات</CardTitle>
                                     <button
                                         type="button"
                                         onClick={() => updateGroupsWidth(effectiveGroupsWidth + 25)}
                                         className="h-6 w-6 rounded border text-xs font-bold hover:bg-accent flex items-center justify-center shrink-0"
                                         title="تكبير عرض المجموعات"
                                     >
                                         +
                                     </button>
                                 </CardHeader>
                                 <ScrollArea dir="rtl" className="flex-1 min-h-0">
                                     <div className={cn("p-2 grid gap-2", effectiveGroupsWidth >= 340 ? "grid-cols-3" : "grid-cols-2")}>
                                         <Button variant={activeGroupId === 'all' ? 'secondary' : 'outline'} onClick={() => { setActiveGroupId('all'); setActiveGroupType('all'); setSearchTerm(''); setExplicitShowAll(true); }} className="h-16 flex-col gap-1 text-xs px-1">
                                             <Grip className="h-5 w-5 shrink-0" />
                                             <span className="leading-tight line-clamp-2">كل الأصناف</span>
                                         </Button>
                                         {(groupsToShow || []).map((group: any) => {
                                             const isHex = group.color && (group.color.startsWith('#') || group.color.startsWith('rgb') || group.color.startsWith('hsl'));
                                             const borderClass = !group.color ? 'border-primary/50' : (!isHex ? (group.color.startsWith('bg-') ? group.color.replace(/^bg-/, 'border-') : group.color) : '');
                                             return (
                                                 <Button
                                                     key={group.id}
                                                     variant={activeGroupId === group.id ? 'secondary' : 'outline'}
                                                     onClick={() => { setActiveGroupId(group.id!); setActiveGroupType(group.type); setSearchTerm(''); }}
                                                     className={cn("min-h-[4rem] h-auto py-1.5 px-1.5 text-xs justify-center items-center border-2", borderClass, activeGroupId === group.id && "ring-2 ring-primary/50")}
                                                     style={isHex ? { borderColor: group.color } : undefined}
                                                 >
                                                     <span className="line-clamp-3 leading-snug text-center max-w-full whitespace-normal font-medium">{group.name}</span>
                                                 </Button>
                                             );
                                         })}
                                     </div>
                                 </ScrollArea>
                                </Card>
                            </div>
                            <ScrollArea dir="rtl" className={cn("flex-1 min-h-[20vh] md:min-h-0",
                                groupsPosition === 'left' ? 'order-1' : 'order-2'
                            )}>
                                {itemsToShow.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border-2 border-dashed rounded-xl m-3 min-h-[240px]">
                                        <Boxes className="h-10 w-10 text-muted-foreground/40 mb-2" />
                                        <h4 className="font-bold text-foreground text-sm mb-1">لا توجد أصناف معروضة حالياً</h4>
                                        <p className="text-xs text-muted-foreground mb-4 max-w-xs">
                                            {searchTerm ? `لم يتم العثور على أصناف تطابق "${searchTerm}"` : 'اضغط على الزر أدناه لعرض كل الأصناف أو اختر مجموعة من القائمة'}
                                        </p>
                                        <Button 
                                            variant="secondary" 
                                            size="sm" 
                                            onClick={() => { 
                                                setActiveGroupId('all'); 
                                                setActiveGroupType('all'); 
                                                setSearchTerm(''); 
                                                setExplicitShowAll(true); 
                                            }}
                                            className="gap-2 font-bold"
                                        >
                                            <Grip className="h-4 w-4" />
                                            عرض كل الأصناف ({availableItemsWithStock.length})
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="p-1 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                                        {(itemsToShow || []).map((item: any) => (
                                            <button
                                                key={item.id}
                                                onClick={() => handleShortClick(item)}
                                                onMouseDown={() => handleLongPressStart(item)}
                                                onMouseUp={handlePressEnd}
                                                onTouchStart={() => handleLongPressStart(item)}
                                                onTouchEnd={handlePressEnd}
                                                disabled={!allowNegativeStock && item.stock <= 0}
                                                className={cn(
                                                    "aspect-square flex flex-col items-center justify-center gap-1 rounded-lg text-card-foreground shadow-sm hover:bg-accent focus:ring-2 ring-primary transition-all p-1 relative",
                                                    !allowNegativeStock && item.stock <= 0 ? 'bg-red-500/10 cursor-not-allowed' : 'bg-green-500/5 hover:bg-green-500/10'
                                                )}
                                            >
                                                {posSettings.showItemStock !== false && (
                                                     <div className={cn("absolute top-1 right-1", item.stock > 0 ? "bg-green-600 text-white" : (allowNegativeStock ? "bg-amber-600 text-white" : "bg-destructive text-destructive-foreground"), "rounded-full px-2 py-0.5 text-xs font-semibold")}>
                                                        {item.itemType === 'manufactured' && <ComponentIcon className="h-3 w-3 -ml-1 inline-block mr-1" />}
                                                        <span>{item.stock}</span>
                                                     </div>
                                                )}
                                                
                                                <p className="text-xs font-semibold text-center leading-tight px-1 flex-grow flex items-center">{item.name}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                         </div>
                    </div>
                     <Card className="shrink-0" onKeyDown={handlePaymentSectionKeyDown}>
                         <CardContent className="p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              <div className="lg:col-span-1 space-y-2">
                                <div className="flex justify-between items-center text-sm font-semibold">
                                   <span>الإجمالي الفرعي:</span>
                                   <span>{subtotal.toFixed(roundingPrecision)}</span>
                               </div>
                                <div className="flex justify-between items-center text-sm">
                                   <span>الخصم:</span>
                                   <Input type="number" value={discount} onChange={(e: any) => setDiscount(Number(e.target.value))} className="w-24 h-7 text-left font-semibold" onFocus={(e: any) => e.target.select()}/>
                               </div>
                               <div className="flex justify-between items-center text-sm">
                                   <span className="flex items-center gap-1 text-primary"><Coins className="h-3 w-3"/> إكرامية (Tips):</span>
                                   <Input type="number" value={tips} onChange={(e: any) => setTips(Number(e.target.value))} className="w-24 h-7 text-left font-bold border-primary/30" onFocus={(e: any) => e.target.select()}/>
                               </div>
                               
                               <div className="flex justify-between items-center text-sm border-t pt-1 mt-1">
                                   <div className="flex items-center gap-2">
                                       <Switch id="apply-tax" checked={applyTax} onCheckedChange={(checked: any) => setApplyTax(!!checked)} className="scale-75" />
                                       <Label htmlFor="apply-tax" className="cursor-pointer text-xs">تطبيق الضريبة</Label>
                                   </div>
                                   {applyTax && (
                                       <div className="flex items-center gap-2">
                                           <Switch id="tax-included" checked={isTaxIncluded} onCheckedChange={(checked: any) => setIsTaxIncluded(!!checked)} className="scale-75" />
                                           <Label htmlFor="tax-included" className="cursor-pointer text-xs">شاملة للضريبة</Label>
                                       </div>
                                   )}
                               </div>

                               {applyTax && (
                                   <div className="flex justify-between items-center text-sm text-muted-foreground">
                                       <span>قيمة الضريبة ({vatRate}%):</span>
                                       <span>{taxAmount.toFixed(roundingPrecision)}</span>
                                   </div>
                               )}

                               <div className="flex justify-between font-bold text-xl md:text-2xl border-t pt-1 md:pt-2 mt-1 md:mt-2">
                                   <Label>المبلغ المطلوب:</Label>
                                   <span className="font-mono">{total.toFixed(roundingPrecision)}</span>
                               </div>
                            </div>

                             <div className="lg:col-span-2 space-y-2 border-r rtl:border-r-0 rtl:border-l pr-2 rtl:pl-2 rtl:pr-0">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 min-h-[60px]">
                                    {(payments || []).map(p => (
                                        <div key={p.id} className="flex items-center justify-between text-sm bg-muted p-1 rounded-md">
                                             <div className="flex items-center gap-2">
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemovePayment(p.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                                <span>{p.method}</span>
                                            </div>
                                            <span className="font-semibold">{p.amount.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t">
                                     <Label className="font-semibold">إجمالي المدفوع:</Label>
                                     <span className="font-mono text-lg">{paidAmount.toFixed(roundingPrecision)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-lg text-green-600">
                                    <span>المتبقي:</span>
                                    <span className="font-mono">{change.toFixed(roundingPrecision)}</span>
                                </div>
                             </div>

                         </CardContent>
                         <CardFooter className="p-2 border-t flex flex-col gap-2">
                                {selectedCustomer && selectedCustomer.allowCredit && cart.length > 0 && !isDelivery && (
                                    <div className="w-full flex items-center justify-start space-x-2 rtl:space-x-reverse pt-2">
                                        <Checkbox id="allow-credit" checked={allowCredit} onCheckedChange={(checked) => setAllowCredit(!!checked)} />
                                        <Label htmlFor="allow-credit" className="cursor-pointer">
                                            ترحيل المبلغ المتبقي ({total - paidAmount > 0 ? (total - paidAmount).toFixed(roundingPrecision) : '0.00'}) إلى حساب العميل
                                        </Label>
                                    </div>
                                )}
                                <div className="w-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                                    {user?.canCancelInvoice && ( <Button variant="destructive" size="lg" className="h-full" onClick={() => resetSale(true)}><XCircle className="ml-2"/> إلغاء</Button>)}
                                    <Button variant="outline" size="lg" className="h-full" onClick={handleHoldInvoice}><FileClock className="ml-2"/> {tableId ? 'تحديث' : 'تعليق'}</Button>
                                    <Button variant="secondary" size="lg" className="h-full" onClick={() => setIsHeldInvoicesOpen(true)}><ListRestart className="ml-2"/> استرجاع</Button>
                                    <Button className="h-full" variant="outline" onClick={setFullCashPayment}>دفع الكل نقداً</Button>
                                    <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button className="h-full"><PlusCircle className="ml-2 h-4 w-4"/>إضافة دفعة</Button>
                                        </DialogTrigger>
                                        <PaymentDialog onAddPayment={handleAddPayment} totalDue={total - paidAmount} paymentMethods={enabledPaymentMethods}/>
                                    </Dialog>
                                    <Button size="lg" className="px-8 h-full" onClick={handleConfirmSale} disabled={cart.length === 0 || isSaving || (isDelivery && !deliveryPersonId) || (!isPaidEnough && (Boolean(tableId) || (!allowCredit && !isDelivery)))}>
                                        {isSaving ? <Loader2 className="animate-spin ml-2" /> : <SquareCheck className="ml-2"/>}
                                        {isSaving ? 'جارٍ الحفظ...' : tableId ? 'إنهاء وطباعة' : 'إنهاء وطباعة'}
                                    </Button>
                                </div>
                         </CardFooter>
                     </Card>
                </div>
            </div>
        </div>
        <iframe ref={printFrameRef} style={{ display: 'none' }} title="Print Frame"></iframe>

        <CameraBarcodeScanner
            isOpen={isCameraScannerOpen}
            onOpenChange={setIsCameraScannerOpen}
            scannedItems={[...(cart || [])].reverse().map((item) => ({
                id: item.uniqueId,
                name: item.name,
                qty: item.qty,
                price: item.price,
                total: item.total,
                barcode: item.code,
            }))}
            totalAmount={total}
            onUpdateQty={(uniqueId, newQty) => updateQty(uniqueId, newQty)}
            onScan={(scannedBarcode) => {
                if (barcodeInputRef.current) {
                    barcodeInputRef.current.value = scannedBarcode;
                }
                setSearchTerm(scannedBarcode);
                const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                handleBarcodeSubmitRef.current(fakeEvent);
            }}
        />

        {/* نافذة حماية وتأكيد الخروج من شاشة البيع - متوافقة تماماً مع الموبايل والشاشات اللمسية */}
        <AlertDialog open={isExitDialogOpen} onOpenChange={setIsExitDialogOpen}>
            <AlertDialogContent className="w-[94vw] max-w-md p-4 sm:p-6 rounded-2xl text-right overflow-hidden shadow-2xl border bg-card" dir="rtl">
                <AlertDialogHeader className="space-y-2 text-right">
                    <AlertDialogTitle className="flex items-center gap-2 text-base font-bold">
                        {cart.length > 0 ? (
                            <>
                                <div className="p-2 bg-destructive/10 text-destructive rounded-xl shrink-0">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <span className="text-destructive font-bold text-base sm:text-lg">تنبيه: توجد أصناف في الفاتورة</span>
                            </>
                        ) : (
                            <>
                                <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0">
                                    <LogOut className="h-5 w-5" />
                                </div>
                                <span className="font-bold text-base sm:text-lg">تأكيد الخروج من شاشة البيع</span>
                            </>
                        )}
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1">
                            {cart.length > 0 ? (
                                <>
                                    <p className="text-foreground/90 font-medium">
                                        توجد حالياً عملية بيع قيد التنفيذ. لحماية المبيعات وتفادي ضياع البيانات، يمكنك اختيار أحد الإجراءات التالية:
                                    </p>
                                    <div className="bg-muted/50 rounded-xl p-3 border border-border/60 my-3 space-y-1.5">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">عدد الأصناف في السلة:</span>
                                            <span className="font-bold text-foreground font-mono">{cart.length} أصناف</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">إجمالي الفاتورة:</span>
                                            <span className="font-bold text-primary font-mono text-sm">{total.toFixed(roundingPrecision)} ج.م</span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <p className="text-foreground/90 pt-1">
                                    هل أنت متأكد من الخروج من شاشة نقاط البيع والعودة إلى لوحة التحكم الرئيسية؟
                                </p>
                            )}
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex flex-col gap-2 w-full pt-4">
                    {cart.length > 0 ? (
                        <>
                            <AlertDialogCancel asChild>
                                <Button variant="default" className="w-full h-11 font-bold justify-center rounded-xl text-sm">
                                    <ShoppingCart className="h-4 w-4 ml-1.5" />
                                    متابعة البيع (البقاء في الفاتورة)
                                </Button>
                            </AlertDialogCancel>
                            <Button 
                                variant="outline" 
                                className="w-full h-10 font-bold border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 justify-center rounded-xl text-xs sm:text-sm"
                                onClick={async () => {
                                    setIsExitDialogOpen(false);
                                    await handleHoldInvoice();
                                    allowExitRef.current = true;
                                    router.push('/');
                                }}
                            >
                                <PauseCircle className="h-4 w-4 ml-1.5 text-amber-500" />
                                تعليق الفاتورة والعودة للرئيسية
                            </Button>
                            <Button 
                                variant="ghost" 
                                className="w-full h-9 font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive justify-center rounded-xl text-xs"
                                onClick={() => {
                                    setIsExitDialogOpen(false);
                                    setCart([]);
                                    allowExitRef.current = true;
                                    router.push('/');
                                }}
                            >
                                <Trash2 className="h-3.5 w-3.5 ml-1.5" />
                                إلغاء الفاتورة والخروج بدون حفظ
                            </Button>
                        </>
                    ) : (
                        <>
                            <AlertDialogAction asChild>
                                <Button 
                                    variant="destructive" 
                                    className="w-full h-11 font-bold justify-center rounded-xl text-sm"
                                    onClick={() => {
                                        setIsExitDialogOpen(false);
                                        allowExitRef.current = true;
                                        router.push('/');
                                    }}
                                >
                                    <LogOut className="h-4 w-4 ml-1.5" />
                                    نعم، الخروج للرئيسية
                                </Button>
                            </AlertDialogAction>
                            <AlertDialogCancel asChild>
                                <Button variant="outline" className="w-full h-10 font-bold justify-center rounded-xl text-sm">
                                    البقاء في شاشة البيع
                                </Button>
                            </AlertDialogCancel>
                        </>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* حوار اختيار / نقل / دمج الطاولة من شاشة الكاشير */}
        <Dialog open={!!posTableActionModal} onOpenChange={(open) => { if (!open) { setPosTableActionModal(null); setSelectedTargetTableId(''); } }}>
            <UIDialogContent className="sm:max-w-md" dir="rtl">
                <UIDialogHeader>
                    <UIDialogTitle className="flex items-center gap-2">
                        {posTableActionModal === 'transfer' && <><ArrowRightLeft className="h-5 w-5 text-blue-500" /> نقل طلب طاولة {tableData?.number}</>}
                        {posTableActionModal === 'merge' && <><GitMerge className="h-5 w-5 text-amber-500" /> دمج طاولة {tableData?.number} في شيك طاولة أخرى</>}
                        {posTableActionModal === 'select' && <><UtensilsCrossed className="h-5 w-5 text-primary" /> اختر طاولة للعمل عليها</>}
                    </UIDialogTitle>
                    <DialogDescription className="text-xs pt-1">
                        {posTableActionModal === 'transfer' && 'اختر الطاولة المتاحة لنقل جميع الأصناف إليها.'}
                        {posTableActionModal === 'merge' && 'اختر الطاولة المشغولة لدمج الطلبين معاً في شيك واحد.'}
                        {posTableActionModal === 'select' && 'اختر طاولة متاحة لبدء طلب جديد أو طاولة مشغولة لاستكمال شيكها.'}
                    </DialogDescription>
                </UIDialogHeader>

                <div className="py-2">
                    {posTableCandidates.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto p-1">
                            {posTableCandidates.map((t: any) => {
                                const tInv = (heldInvoices || []).find((inv: HeldInvoice) => inv.tableId === t.id);
                                const isSelected = selectedTargetTableId === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setSelectedTargetTableId(t.id)}
                                        className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                                            isSelected
                                                ? 'border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/30'
                                                : tInv
                                                ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
                                                : 'border-border hover:bg-muted/60'
                                        }`}
                                    >
                                        <span className="text-sm font-bold">طاولة {t.number}</span>
                                        {t.groupName && <span className="text-[10px] text-muted-foreground">{t.groupName}</span>}
                                        {tInv ? (
                                            <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400">
                                                مشغولة ({Number(tInv.total || 0).toLocaleString()})
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                                متاحة
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-6 text-center text-sm text-muted-foreground border rounded-xl bg-muted/20">
                            {posTableActionModal === 'transfer' && 'لا توجد طاولات متاحة حالياً للنقل إليها.'}
                            {posTableActionModal === 'merge' && 'لا توجد طاولات أخرى مشغولة حالياً للدمج معها.'}
                            {posTableActionModal === 'select' && 'لا توجد طاولات مسجلة.'}
                        </div>
                    )}
                </div>

                <UIDialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => { setPosTableActionModal(null); setSelectedTargetTableId(''); }}>
                        إلغاء
                    </Button>
                    <Button
                        disabled={!selectedTargetTableId || isProcessingTableAction}
                        onClick={handleExecutePosTableAction}
                    >
                        {isProcessingTableAction && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                        {posTableActionModal === 'transfer' && 'تأكيد النقل'}
                        {posTableActionModal === 'merge' && 'تأكيد الدمج في شيك واحد'}
                        {posTableActionModal === 'select' && 'فتح الطاولة'}
                    </Button>
                </UIDialogFooter>
            </UIDialogContent>
        </Dialog>
        </>
    );
}

export default function PosPage() {
    return (
        <React.Suspense
            fallback={
                <div className="flex h-screen w-full items-center justify-center bg-background">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            }
        >
            <PosPageContent />
        </React.Suspense>
    );
}
