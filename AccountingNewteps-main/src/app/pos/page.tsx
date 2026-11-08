"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, ShoppingCart, XCircle, Printer, Grip, Dot, Search, Ban, PanelLeft, Boxes, SquareCheck, ListRestart, FileClock, Eye, Loader2, Undo2, PlusCircle, UserPlus, LogOut, Percent, Truck, ArrowLeft, Banknote, Landmark, Wallet, Phone, CircleDollarSign, FileText, CreditCard, UserRound, User as UserIcon, PlayCircle, History, Coins } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/auth-context';
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

    useEffect(() => {
        setAmount(totalDue > 0 ? Number(totalDue.toFixed(2)) : 0);
        if (paymentMethods.length > 0 && !method) {
            setMethod(paymentMethods[0].name);
        }
        setTimeout(() => {
            amountInputRef.current?.focus();
            amountInputRef.current?.select();
        }, 100);
    }, [totalDue, paymentMethods, method]);

    const handleMethodSelect = (selectedMethod: string) => {
        setMethod(selectedMethod);
        amountInputRef.current?.focus();
        amountInputRef.current?.select();
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
            </UIDialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 py-4">
                         {paymentMethods.map(pm => {
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
                            className="text-2xl h-14 text-center" 
                            onFocus={e => e.target.select()}
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
                {sellersForWarehouse.map((seller: any) => (
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

const StockQueryDialog = ({ onOpenChange, ...allDataContext }: { onOpenChange: (open: boolean) => void;[key: string]: any }) => {
    const { items: allItems, warehouses, inventorySections } = allDataContext;
    const [searchTerm, setSearchTerm] = useState('');
    const [queryResult, setQueryResult] = useState<{itemName: string, results: {warehouseName: string, stock: number, price: number}[]} | null>(null);

    const handleSearch = () => {
        if (!searchTerm) return;
        
        const itemMaster = allItems.find((i: any) => i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.code === searchTerm);
        if (!itemMaster) {
            setQueryResult({ itemName: 'لم يتم العثور على الصنف', results: [] });
            return;
        }

        const results: {warehouseName: string, stock: number, price: number}[] = [];
        
        const allWarehouses = [...warehouses, ...inventorySections.map((s:any) => ({...s, isSection: true}))]

        allWarehouses.forEach((warehouse: any) => {
            const currentStock = calculateStockForItemInWarehouse(itemMaster.id, warehouse.id, allDataContext);
            
            if (currentStock > 0) {
                results.push({ warehouseName: warehouse.name, stock: currentStock, price: itemMaster.price || 0 });
            }
        });
        
        setQueryResult({ itemName: itemMaster.name, results });
    };

    return (
         <UIDialogContent className="sm:max-w-lg">
            <UIDialogHeader>
                <UIDialogTitle>الاستعلام عن أرصدة الأصناف</UIDialogTitle>
            </UIDialogHeader>
            <form onSubmit={e => {e.preventDefault(); handleSearch()}} className="flex gap-2">
                <Input placeholder="أدخل اسم الصنف أو الباركود..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                <Button type="submit"><Search className="ml-2 h-4 w-4"/> بحث</Button>
            </form>
            {queryResult && (
                <div>
                    <h4 className="font-semibold mb-2">نتائج البحث عن: {queryResult.itemName}</h4>
                    <div className="max-h-64 overflow-y-auto border rounded-md">
                        <Table>
                            <TableHeader><TableRow><TableHead>الفرع</TableHead><TableHead className="text-center">الكمية المتاحة</TableHead><TableHead className="text-center">السعر</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {queryResult.results.length > 0 ? queryResult.results.map(r => (
                                    <TableRow key={r.warehouseName}>
                                        <TableCell>{r.warehouseName}</TableCell>
                                        <TableCell className="text-center"><Badge>{r.stock}</Badge></TableCell>
                                        <TableCell className="text-center">{r.price.toLocaleString()}</TableCell>
                                    </TableRow>
                                )) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground p-4">لا توجد أرصدة متاحة لهذا الصنف في أي فرع.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
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
            </UIDialogHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 py-4">
                {deliveryStaff.map((staff: any) => (
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
                {deliveryStaff.length === 0 && (
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
        return heldInvoices.filter((inv: HeldInvoice) => !inv.tableId);
    }, [heldInvoices]);


    const handleRetrieve = (invoice: HeldInvoice) => {
        onRetrieve(invoice);
        dbAction('heldInvoices', 'remove', {id: invoice.id});
        onClose();
    }
    
    return (
        <UIDialogContent className="sm:max-w-3xl">
             <UIDialogHeader>
                <UIDialogTitle>الفواتير المعلقة (بدون طاولة)</UIDialogTitle>
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
                                    </UIDialogHeader>
                                    <Table>
                                        <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead>الكمية</TableHead><TableHead>السعر</TableHead><TableHead>الإجمالي</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {inv.cart.map(item => (
                                                <TableRow key={item.uniqueId}>
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
    
    const selectedTerminal = terminals.find(t => t.id === posTerminalId);
    const sessionWarehouseId = selectedTerminal?.warehouseId;
    const sessionWarehouseName = useMemo(() => {
        if (!sessionWarehouseId) return "اختر نقطة بيع أولاً";
        return warehouses.find(w => w.id === sessionWarehouseId)?.name || "مخزن غير معروف";
    }, [sessionWarehouseId, warehouses]);

    const availableTerminals = useMemo(() => {
        const activeTerminalIds = new Set(activeSessions.map(s => s.posTerminalId));
        return terminals.filter(t => !activeTerminalIds.has(t.id));
    }, [terminals, activeSessions]);
    
    const terminalOptions = useMemo(() => {
        return availableTerminals.map(t => {
            const warehouseName = warehouses.find(w => w.id === t.warehouseId)?.name || 'غير محدد';
            return { value: t.id, label: `${t.name} (${warehouseName})` };
        });
    }, [availableTerminals, warehouses]);

    const handleSubmit = () => {
        if (posTerminalId && sessionWarehouseId) {
            onConfirm({ posTerminalId, sessionWarehouseId });
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


export default function PosPage() {
    const allDataContext = useData();
    const { 
      items: allItems, customers, dbAction, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2, posSessions, settings, warehouses: allWarehousesData,
      salesInvoices, inventory, getNextId, heldInvoices, posTerminals: allTerminals, posReturns, promotions, deliveryStaff, restaurantTables, paymentMethods, sellers, posSales,
      customerPayments, salesReturns
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
        return allTerminals.filter((t: any) => authorizedBranchIds.includes(t.warehouseId));
    }, [allTerminals, authorizedBranchIds]);
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const posSettings = useMemo(() => settings?.main?.posSettings || {}, [settings]);
    const financialSettings = useMemo(() => settings?.main?.financial || {}, [settings]);
    const companySettings = useMemo(() => settings?.main?.general || {}, [settings]);
    
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
        if (settings?.main?.posSettings?.defaultApplyTax !== undefined) {
            setApplyTax(settings.main.posSettings.defaultApplyTax);
        }
    }, [settings?.main?.posSettings?.defaultApplyTax]);

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
    
    const subtotal = useMemo(() => cart.reduce((acc, item) => acc + item.originalPrice * item.qty, 0), [cart]);
    const promoDiscount = useMemo(() => cart.reduce((acc, item) => acc + item.discountApplied, 0), [cart]);
    
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
        const netAmount = subtotal - promoDiscount - discount;
        const finalTax = (applyTax && !isTaxIncluded) ? taxAmount : 0;
        // Total includes tips as it's what the customer pays
        return netAmount + finalTax + Number(tips || 0);
    }, [subtotal, promoDiscount, discount, applyTax, isTaxIncluded, taxAmount, tips]);

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
            const tableInvoice = heldInvoices.find((inv: HeldInvoice) => inv.tableId === tableId);
            if (tableInvoice) {
                setCurrentHeldInvoiceId(tableInvoice.id);
                setCart(tableInvoice.cart || []);
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
            const appliesToThisWarehouse = !p.warehouseIds || p.warehouseIds.length === 0 || p.warehouseIds.includes(warehouseForSession?.id);
            return now < new Date(p.endDate) && new Date(p.startDate) <= now && appliesToThisWarehouse;
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
    
    const groupsToShow = useMemo(() => {
        const categories = (itemCategories || [])
            .filter((g: ItemCategory) => g.showOnPos)
            .map((g: ItemCategory) => ({...g, type: 'category'}));
        const customGroups = (itemGroups || []).filter((g: any) => g.showOnPos).map((g: any) => ({...g, type: 'group'}));
        return [...categories, ...customGroups];
    }, [itemCategories, itemGroups]);


    const itemsToShow = useMemo(() => {
        let itemsToDisplay = availableItemsWithStock;

        if (searchTerm) {
            return itemsToDisplay.filter((item: any) => 
                item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                (item.code && item.code.includes(searchTerm))
            );
        }
        
        if (activeGroupId === 'all') {
            return posSettings.showAllItemsInitially ? itemsToDisplay : [];
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
        
        return [];
    }, [availableItemsWithStock, searchTerm, activeGroupId, activeGroupType, posSettings.showAllItemsInitially, itemCategories, itemGroups, itemSubCategories1]);
    
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
                    return;
                }
            }
        }
    
        let itemToAdd = availableItemsWithStock.find((item: any) => item.code === code);
        if (itemToAdd) {
            addItemToCart(itemToAdd, 1);
            if (barcodeInputRef.current) barcodeInputRef.current.value = "";
            return;
        }
    
        if (code.length === 13 && code.startsWith(scaleBarcodePrefix)) {
            const itemCodePart = code.substring(scaleBarcodePrefix.length, scaleBarcodePrefix.length + 5);
            
            const itemForScale = availableItemsWithStock.find((item: any) => 
                item.barcodeType === 'ean13_scale' && 
                item.code && 
                item.code.substring(2, 7) === itemCodePart
            );
            
            if (itemForScale) {
                const valuePart = parseInt(code.substring(scaleBarcodePrefix.length + 5, 12), 10);
                 if (valuePart === 0) {
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
                        const weightInKg = valuePart / 1000.0;
                        addItemToCart(itemForScale, weightInKg);
                    }
                 }
                if (barcodeInputRef.current) barcodeInputRef.current.value = "";
                return;
            }
        }
    
        toast({ variant: 'destructive', title: 'خطأ', description: `الصنف بالكود ${code} غير موجود.` });
        if (barcodeInputRef.current) barcodeInputRef.current.value = "";
    };
    
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
             const controller = new AbortController();
             const timeoutId = setTimeout(() => controller.abort(), 5000);
            try {
                await fetch(`http://${addressToUse}`, { mode: 'no-cors', signal: controller.signal });
                toast({ title: 'تم إرسال الطباعة', description: `تم إرسال الطلب إلى الطابعة ${addressToUse}` });
            } catch (e: any) {
                if (e.name === 'AbortError') {
                    toast({ variant: 'destructive', title: 'فشل الطباعة', description: 'انتهت مهلة الاتصال بالطابعة.' });
                } else {
                    toast({ variant: 'destructive', title: 'فشل الطباعة', description: 'تعذر الوصول إلى طابعة الشبكة.' });
                }
            } finally { clearTimeout(timeoutId); }
        }
    }, [settings, warehouseForSession, toast]);
    
    const handlePrintReceipt = useCallback(async (saleData: any) => {
        const allPrinterSettings = settings?.main?.printers || {};
        const branchSettings = warehouseForSession?.id ? allPrinterSettings.branchOverrides?.[warehouseForSession.id] : {};
        const printerSettings = { ...(allPrinterSettings.default || DEFAULT_PRINTER_SETTINGS), ...branchSettings };

        if (!printerSettings || !printerSettings.posPrinterType) {
            toast({ variant: "destructive", title: "خطأ في الطباعة", description: "لم يتم تكوين إعدادات طابعة الإيصالات لهذا الفرع."});
            return;
        }

        const posPrinterType = terminalForSession?.posPrinterType ?? printerSettings.posPrinterType;
        const posPrinterAddress = terminalForSession?.posPrinterAddress ?? printerSettings.posPrinterAddress;

        if (posPrinterType === 'system' && posPrinterAddress) {
            const lines = saleData.items.map((item: PosItem) => ({
                left: `${item.qty} × ${item.name}`,
                right: (item.total).toFixed(roundingPrecision)
            }));
            lines.push({ left: '---------------------------', right: '' });
            const totalAmount = saleData.total;
            const paidAmt = saleData.paidAmount ?? totalAmount;
            const remainingDue = Math.max(0, totalAmount - paidAmt);
            lines.push({ left: 'الإجمالي:', right: totalAmount.toFixed(roundingPrecision) });
            if(saleData.tips > 0) lines.push({ left: 'الإكرامية (Tips):', right: saleData.tips.toFixed(roundingPrecision) });
            lines.push({ left: 'المدفوع:', right: paidAmt.toFixed(roundingPrecision) });
            lines.push({ left: 'باقي المستحق على الفاتورة:', right: remainingDue.toFixed(roundingPrecision) });
            const title = companySettings.companyName ? `فاتورة - ${companySettings.companyName}` : 'فاتورة مبيعات';
            try {
                const res = await fetch('/api/print', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ printer: posPrinterAddress, content: { title, lines, footer: `رقم: ${saleData.invoiceNumber || ''}` } })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error || 'فشل إرسال أمر طباعة');
                toast({ title: 'تمت الطباعة بنجاح', description: `تمت الطباعة على ${posPrinterAddress}` });
            } catch (e: any) {
                toast({ variant: 'destructive', title: 'خطأ الطباعة المباشرة', description: e?.message || 'تعذر الطباعة على طابعة النظام المحددة.' });
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
                    
                    if (kitchenType === 'system' && kitchenAddress) {
                        const lines = kitchenItems.map((item: PosItem) => ({
                            left: `${item.qty} × ${item.name}`,
                            right: (item.total).toFixed(roundingPrecision)
                        }));
                        try {
                            const res = await fetch('/api/print', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ printer: kitchenAddress, content: { title: `طلب مطبخ - ${printer.name}`, lines, footer: '' } })
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data?.error || 'فشل إرسال أمر الطباعة للمطبخ');
                        } catch (e: any) {
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
        
        salesInvoices.filter((inv: any) => inv.customerId === selectedCustomerId && inv.status === 'approved')
            .forEach((inv: any) => {
                balance += (Number(inv.total) - Number(inv.paidAmount || 0));
            });

        posSales.filter((sale: any) => sale.customerId === selectedCustomerId)
            .forEach((sale: any) => {
                balance += (Number(sale.total) - Number(sale.paidAmount || 0));
            });

        customerPayments.filter((p: any) => p.customerId === selectedCustomerId && !p.invoiceId)
            .forEach((p: any) => {
                balance -= Number(p.amount);
            });

        salesReturns.filter((r: any) => r.customerId === selectedCustomerId)
            .forEach((r: any) => {
                balance -= (Number(r.total) - Number(r.paidAmount || 0));
            });
        
        posReturns.filter((r: any) => r.customerId === selectedCustomerId)
            .forEach((r: any) => {
                balance -= (Number(r.total) - Number(r.paidAmount || 0));
            });

        return balance;
    }, [selectedCustomerId, customers, salesInvoices, posSales, posReturns, customerPayments, salesReturns]);

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


            toast({
                title: 'تمت العملية بنجاح',
                description: `تم حفظ الفاتورة ${invoiceNumber}`,
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
        setCart(invoice.cart);
        setDiscount(invoice.discount);
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
        if (!customers || customerSearch.length < 3) return [];
        return customers
            .filter((c: any) => 
                c.name.toLowerCase().includes(customerSearch.toLowerCase()) || 
                (c.phone && c.phone.includes(customerSearch))
            )
            .map((c: any) => ({
                value: c.id, 
                label: `${c.name} (${c.phone})`
            }));
    }, [customers, customerSearch]);

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
        const allSales = [...salesInvoices.filter(s => s.status === 'approved'), ...posSales];
        const customerSales = allSales.filter(s => s.customerId === selectedCustomerId);
        customerSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        for (const sale of customerSales) {
            const itemInSale = sale.items.find((i: any) => i.id === itemId);
            if (itemInSale) return itemInSale.price;
        }
        return null;
    }, [selectedCustomerId, salesInvoices, posSales]);


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
                        <CardTitle className='flex items-center gap-2 text-amber-600'><Ban /> الوردية مغلقة</CardTitle>
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
    const { layout = 'cart-left', cartWidth = 40, itemsWidth = 60, groupsPosition = 'left', paymentPosition = 'bottom' } = posSettings.layout || {};

    return (
        <>
        <Dialog open={isSellerDialogOpen} onOpenChange={setIsSellerDialogOpen}>
            <SellerSelectionDialog onSelectSeller={onSellerSelected} warehouseId={warehouseForSession?.id || ''} />
        </Dialog>
        <Dialog open={isQueryModalOpen} onOpenChange={setIsQueryModalOpen}>
            <StockQueryDialog onOpenChange={setIsQueryModalOpen} {...allDataContext} />
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
            className="h-screen bg-background flex flex-col p-2 sm:p-4 gap-4 overflow-y-auto"
            onClick={handleScreenClick}
        >
            <div className={cn("flex flex-1 flex-col md:flex-row gap-3 overflow-y-auto md:overflow-hidden",
                layout === 'cart-right' ? 'md:flex-row-reverse' : ''
            )}>
                <div className="w-full md:w-[var(--cart-width)] flex flex-col gap-4 md:overflow-hidden" style={{ '--cart-width': `${cartWidth}%` } as React.CSSProperties}>
                    <Card className="flex-1 flex flex-col md:overflow-hidden">
                        <CardHeader className="shrink-0 p-3 flex-col gap-2">
                            <div className='flex items-center justify-between'>
                                <div className="flex items-center gap-2">
                                    <CardTitle className="flex items-center gap-2">
                                        <ShoppingCart/> 
                                        {tableData ? `طاولة: ${tableData.number}` : 'سلة المبيعات'}
                                    </CardTitle>
                                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground">
                                        عدد الأصناف: {totalItemsCount}
                                    </span>
                                </div>
                                {showBackButton && (
                                     <Button variant="ghost" size="icon" onClick={handleHoldInvoice}>
                                        <ArrowLeft className="h-5 w-5"/>
                                    </Button>
                                )}
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
                        <ScrollArea className="flex-1 border-t border-b max-h-48 md:max-h-full">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead style={{ width: `${widthName}%` }}>الصنف</TableHead>
                                        {posSettings.cartColumns?.showBarcode && <TableHead style={{ width: `${widthBarcode}%` }}>الباركود</TableHead>}
                                        {posSettings.cartColumns?.showPrice && <TableHead className="text-center" style={{ width: `${widthPrice}%` }}>السعر</TableHead>}
                                        <TableHead className="text-center" style={{ width: `${widthQty}%` }}>الكمية</TableHead>
                                        <TableHead className="text-center" style={{ width: `${widthTotal}%` }}>الإجمالي</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {cart.map(item => {
                                        const lastPrice = getItemLastPrice(item.id);
                                        return (
                                        <TableRow key={item.uniqueId}>
                                            <TableCell className='py-2'>
                                                <div className="flex flex-col">
                                                    <span>{item.name}</span>
                                                    <div className="flex items-center gap-1">
                                                        {item.discountApplied > 0 && <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700"><Percent className="h-2 w-2 mr-0.5"/> خصم</span>}
                                                        {lastPrice !== null && (
                                                            <div className="flex items-center gap-0.5 text-[9px] text-primary font-bold">
                                                                <History className="h-2 w-2" />
                                                                <span>آخر سعر: {lastPrice.toLocaleString()}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            {posSettings.cartColumns?.showBarcode && <TableCell className='py-2 text-xs text-muted-foreground font-mono'>{item.code}</TableCell>}
                                            {posSettings.cartColumns?.showPrice && <TableCell className='py-2 text-center'>{item.price.toFixed(roundingPrecision)}</TableCell>}
                                            <TableCell className='py-2'><Input type="number" value={item.qty} readOnly onClick={() => { setItemForQuantityUpdate(item); setIsQuantityEditDialogOpen(true); }} className="w-16 text-center mx-auto cursor-pointer focus:ring-2 focus:ring-primary" /></TableCell>
                                            <TableCell className="text-center font-bold py-2">{item.total.toFixed(roundingPrecision)}</TableCell>
                                            <TableCell className='py-2'>
                                                {user?.canDeleteFromCart && (
                                                    <Button variant="ghost" size="icon" onClick={() => updateQty(item.uniqueId, 0)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )})}
                                    {cart.length === 0 && (
                                        <TableRow><TableCell colSpan={posSettings.cartColumns?.showBarcode && posSettings.cartColumns?.showPrice ? 6 : 4} className="text-center text-muted-foreground h-24">السلة فارغة</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                        <CardFooter className="p-2 text-sm text-muted-foreground shrink-0 border-t">
                             فاتورة: <span className="font-mono">{currentInvoiceNumber}</span> | الكاشير: <span className="font-semibold">{user?.name}</span>
                        </CardFooter>
                    </Card>
                </div>
                
                <div className={cn("flex-1 flex flex-col md:overflow-hidden gap-3", paymentPosition === 'top' ? 'md:flex-col-reverse' : '')} style={{ '--items-width': `${itemsWidth}%` } as React.CSSProperties}>
                    <div className="shrink-0 flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-12 w-12 shrink-0 hidden md:flex" onClick={() => router.push('/')}>
                            <Undo2 className="h-6 w-6" />
                        </Button>
                        <form onSubmit={handleBarcodeSubmit} className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                <Input 
                                    ref={barcodeInputRef} 
                                    placeholder="امسح الباركود أو ابحث بالاسم..." 
                                    className="h-12 text-lg pl-10" 
                                    onChange={(e: any) => setSearchTerm(e.target.value)} 
                                    onFocus={(e: any) => e.target.select()}
                                    onKeyDown={handleInputKeyDown}
                                />
                            </div>
                        </form>
                        <Button variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={() => setIsQueryModalOpen(true)}>
                            <Boxes className="h-6 w-6" />
                        </Button>
                    </div>
                    
                    <div className="flex-1 flex flex-col md:flex-row gap-3 overflow-y-auto md:overflow-hidden min-h-[25vh] md:min-h-0">
                         <div className="p-2 border-b shrink-0 md:hidden">
                           <ScrollArea>
                                <div className="flex flex-row-reverse gap-2">
                                     <Button size="lg" variant={activeGroupId === 'all' ? 'secondary' : 'ghost'} onClick={() => { setActiveGroupId('all'); setActiveGroupType('all'); setSearchTerm(''); }} className="h-14 shrink-0">
                                        <Grip className="ml-2 h-5 w-5" /> كل الأصناف
                                    </Button>
                                    {groupsToShow.map((group: any) => (
                                        <Button key={group.id} size="lg" variant={activeGroupId === group.id ? 'secondary' : 'ghost'} onClick={() => { setActiveGroupId(group.id!); setActiveGroupType(group.type); setSearchTerm(''); }} className="h-14 shrink-0">
                                            <span className={`ml-2 h-5 w-5 rounded-full ${group.color || 'bg-gray-400'}`} />
                                            {group.name}
                                        </Button>
                                    ))}
                                </div>
                                <ScrollBar orientation="horizontal" />
                           </ScrollArea>
                        </div>
                        
                         <div className="flex-1 flex flex-row gap-3 overflow-hidden">
                            <div className={cn("hidden md:flex flex-col w-56 shrink-0",
                                groupsPosition === 'right' ? 'order-last' : ''
                            )}>
                                <Card className="flex-1 flex flex-col">
                                 <CardHeader className="p-2 border-b"><CardTitle className="text-base text-center">المجموعات</CardTitle></CardHeader>
                                 <ScrollArea className="flex-1">
                                     <div className="p-2 grid grid-cols-2 gap-2">
                                         <Button variant={activeGroupId === 'all' ? 'secondary' : 'outline'} onClick={() => { setActiveGroupId('all'); setActiveGroupType('all'); setSearchTerm(''); }} className="h-16 flex-col gap-1 text-xs">
                                             <Grip className="h-5 w-5" /> كل الأصناف
                                         </Button>
                                         {groupsToShow.map((group: any) => (
                                             <Button key={group.id} variant={activeGroupId === group.id ? 'secondary' : 'outline'} onClick={() => { setActiveGroupId(group.id!); setActiveGroupType(group.type); setSearchTerm(''); }} className="h-16 flex-col gap-1 text-xs justify-center">
                                                 <span className={`h-4 w-4 rounded-full ${group.color || 'bg-gray-400'}`} />
                                                 <span className="truncate">{group.name}</span>
                                             </Button>
                                         ))}
                                     </div>
                                 </ScrollArea>
                                </Card>
                            </div>
                            <ScrollArea className="flex-1 min-h-[20vh] md:min-h-0">
                                <div className="p-1 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                                    {itemsToShow.map((item: any) => (
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
                                            {posSettings.showItemStock && !allowNegativeStock && (
                                                 <div className={cn("absolute top-1 right-1", item.stock > 0 ? "bg-green-600 text-white" : "bg-destructive text-destructive-foreground","rounded-full px-2 py-0.5 text-xs font-semibold")}>
                                                    {item.itemType === 'manufactured' && <ComponentIcon className="h-3 w-3 -ml-1 inline-block mr-1" />}
                                                    <span>{item.stock}</span>
                                                </div>
                                            )}
                                            
                                            <p className="text-xs font-semibold text-center leading-tight px-1 flex-grow flex items-center">{item.name}</p>
                                        </button>
                                    ))}
                                </div>
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
                                    {payments.map(p => (
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
        </>
    );
}
