
"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, Printer, Save, Loader2, Info, Truck, MapPin, MessageCircle, Image as ImageIcon, History } from "lucide-react";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/contexts/permissions-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/auth-context";
import { Combobox } from "@/components/ui/combobox";
import { toPng } from 'html-to-image';
import { InvoiceTemplate } from '@/components/invoice-template';

interface InvoiceItem {
  id: string; 
  itemId: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
  total: number;
  unit: string;
  baseUnit: string;
  conversionFactor: number;
  code?: string;
  uniqueId: string;
}

interface SecondaryUnitOption {
    value: string;
    label: string;
    factor: number;
    price?: number;
}

interface Item {
    id: string;
    name: string;
    baseUnit: string;
    price?: number;
    cost?: number;
    stock?: number;
    code?: string;
    secondaryUnits?: { name: string; conversionFactor: number; price: number; barcode?: string }[];
}

interface Customer {
    id: string;
    name: string;
}

export default function SalesRepInvoicePage() {
    const { toast } = useToast();
    const router = useRouter();
    const { can } = usePermissions();
    const { user } = useAuth();
    const invoiceRef = useRef<HTMLDivElement>(null);

    const [items, setItems] = useState<InvoiceItem[]>([]);
    const [newItem, setNewItem] = useState({ id: "", name: "", qty: 1, price: 0, cost: 0, unit: "" });
    const [selectedUnit, setSelectedUnit] = useState('base');
    const [availableUnits, setAvailableUnits] = useState<{ value: string; label: string; factor: number; price?: number }[]>([]);

    const [subtotal, setSubtotal] = useState(0);
    const [discount, setDiscount] = useState(0);
    const [tax, setTax] = useState(0);
    const [total, setTotal] = useState(0);
    const [paidAmount, setPaidAmount] = useState(0);
    const [applyTax, setApplyTax] = useState(true);
    const [customerId, setCustomerId] = useState("");
    const [notes, setNotes] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    
    const [isDelivery, setIsDelivery] = useState(false);
    const [deliveryPersonId, setDeliveryPersonId] = useState("");
    
    const [invoiceDate, setInvoiceDate] = useState<string>('');
    const [dueDate, setDueDate] = useState<string>('');
    const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null);
    const [locationError, setLocationError] = useState<string | null>("لم يتم تحديد الموقع بعد");
    const [isSharing, setIsLoadingShare] = useState(false);
    const [invoiceToShare, setInvoiceToShare] = useState<any>(null);


    const allDataContext = useData();
    const { 
        items: allItems, 
        customers, 
        warehouses, 
        cashAccounts, 
        salesInvoices, 
        stockIssuesToReps: issuesToReps, 
        stockReturnsFromReps: returnsFromReps,
        settings, 
        dbAction,
        getNextId,
        loading,
        users,
        posSales,
        customerPayments,
        posReturns,
        salesReturns
    } = allDataContext;
    
    const companySettings = useMemo(() => settings?.main?.general || {}, [settings]);
    const deliveryStaff = useMemo(() => users.filter((u: any) => u.isDelivery), [users]);
    const isRep = !!user?.isSalesRep;

    const requestLocation = () => {
        if (!navigator.geolocation) {
            setLocationError("المتصفح لا يدعم تحديد الموقع.");
            return;
        }

        setLocationError("جاري تحديد الموقع...");
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
                setLocationError(null);
            },
            (error) => {
                const errorMessage = `خطأ في تحديد الموقع: ${error.message}`;
                setLocationError(errorMessage);
                toast({ variant: 'destructive', title: "خطأ في الموقع", description: "لم نتمكن من تحديد موقعك الحالي. سيتم حفظ الفاتورة بدون موقع." });
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const calculateCustomerBalance = useCallback((cId: string) => {
        const customer = customers.find((c: any) => c.id === cId);
        if (!customer) return 0;

        let balance = Number(customer.openingBalance) || 0;
        
        salesInvoices.filter((inv: any) => inv.customerId === cId && inv.status === 'approved')
            .forEach((inv: any) => {
                balance += (Number(inv.total) - Number(inv.paidAmount || 0));
            });

        posSales.filter((sale: any) => sale.customerId === cId)
            .forEach((sale: any) => {
                balance += (Number(sale.total) - Number(sale.paidAmount || 0));
            });

        customerPayments.filter((p: any) => p.customerId === cId && !p.invoiceId)
            .forEach((p: any) => {
                balance -= Number(p.amount);
            });

        salesReturns.filter((r: any) => r.customerId === cId)
            .forEach((r: any) => {
                balance -= (Number(r.total) - Number(r.paidAmount || 0));
            });
        
        posReturns.filter((r: any) => r.customerId === cId)
            .forEach((r: any) => {
                balance -= (Number(r.total) - Number(r.paidAmount || 0));
            });

        return balance;
    }, [customers, salesInvoices, posSales, customerPayments, salesReturns, posReturns]);

    const itemsInRepCustody = useMemo(() => {
        if (!isRep || !user?.id || !allItems.length) return [];
        
        const repWarehouse = warehouses.find((w: any) => w.repId === user.id);
        if (repWarehouse?.isClosed) return [];
        
        const repStock = new Map<string, number>();
        const sourceWarehouseMap = new Map<string, string>();

        issuesToReps
            .filter((issue: any) => issue.salesRepId === user.id)
            .forEach((issue: any) => {
                issue.items.forEach((item: any) => {
                    repStock.set(item.id, (repStock.get(item.id) || 0) + item.qty);
                    if (!sourceWarehouseMap.has(item.id)) {
                        sourceWarehouseMap.set(item.id, issue.warehouseId);
                    }
                });
            });

        salesInvoices
            .filter((sale: any) => sale.salesRepId === user.id)
            .forEach((sale: any) => {
                sale.items.forEach((item: any) => {
                    repStock.set(item.id, (repStock.get(item.id) || 0) - item.qty);
                });
            });

        returnsFromReps
            .filter((ret: any) => ret.salesRepId === user.id)
            .forEach((ret: any) => {
                ret.items.forEach((item: any) => {
                    repStock.set(item.id, (repStock.get(item.id) || 0) - item.qty);
                });
            });
            
        return allItems
            .map((item: any) => ({ ...item, stock: repStock.get(item.id) || 0, sourceWarehouseId: sourceWarehouseMap.get(item.id) }))
            .filter((item: any) => item.stock > 0);
    }, [isRep, user?.id, allItems, issuesToReps, salesInvoices, returnsFromReps, warehouses]);


    const itemsForCombobox = useMemo(() => {
        return itemsInRepCustody.map((item: Item) => ({ 
            value: item.id, 
            label: `${item.name} (${item.code || 'N/A'}) (المتاح: ${item.stock})` 
        }));
    }, [itemsInRepCustody]);


    useEffect(() => {
        const newSubtotal = items.reduce((acc, item) => acc + item.total, 0);
        const newTax = applyTax ? (newSubtotal - discount) * 0.14 : 0;
        const newTotal = newSubtotal - discount + newTax;
        setSubtotal(newSubtotal);
        setTax(newTax);
        setTotal(newTotal);
        setPaidAmount(newTotal);
    }, [items, discount, applyTax]);

    useEffect(() => {
        setInvoiceDate(new Date().toISOString().split('T')[0]);
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        setDueDate(futureDate.toISOString().split('T')[0]);
    }, []);

    const handleUpdateItem = (uniqueId: string, field: keyof InvoiceItem, value: any) => {
        const itemToUpdate = items.find(item => item.uniqueId === uniqueId);
        if (!itemToUpdate) return;
        
        const selectedItem = itemsInRepCustody.find((i: Item) => i.id === itemToUpdate.itemId);
        if (!selectedItem) return;

        if (field === 'qty') {
            const newQty = Number(value);
            const requiredBaseQty = newQty * itemToUpdate.conversionFactor;
            const currentStock = selectedItem.stock || 0;
            const mainSettings = settings?.main;
            
            if (!mainSettings?.financial?.allowNegativeStock && requiredBaseQty > currentStock) {
                 toast({ variant: 'destructive', title: 'كمية غير متوفرة', description: `الرصيد المتاح هو ${currentStock} فقط.` });
                 return;
            }
        }
        
        setItems(prevItems => prevItems.map(item => {
            if (item.uniqueId === uniqueId) {
                const updatedItem = { ...item, [field]: value };
                if (field === 'qty' || field === 'price') {
                    updatedItem.total = updatedItem.qty * updatedItem.price;
                }
                return updatedItem;
            }
            return item;
        }));
    };
    
    const lastPriceForCustomer = useMemo<number | null>(() => {
        if (!customerId || !newItem.id) return null;
        const allSales = salesInvoices.filter((s: any) => s.status === 'approved' || !s.status || s.status === 'completed');
        const customerSales = allSales.filter(s => s.customerId === customerId);
        
        let lastPrice = null;
        customerSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        for (const sale of customerSales) {
            const itemInSale = sale.items.find((i: any) => i.id === newItem.id);
            if (itemInSale) {
                lastPrice = itemInSale.price;
                break;
            }
        }
        return lastPrice;
    }, [customerId, newItem.id, salesInvoices, posSales]);

    const handleAddItem = () => {
        if (!newItem.id || newItem.qty <= 0 || newItem.price < 0) return;
        
        const selectedItem = itemsInRepCustody.find((i: Item) => i.id === newItem.id);
        if (!selectedItem) return;

        const selectedUnitInfo = availableUnits.find(u => u.value === selectedUnit);
        if (!selectedUnitInfo) return;

        const requiredBaseQty = newItem.qty * selectedUnitInfo.factor;
        const currentStock = selectedItem.stock || 0;
        
        const existingItemInCart = items.find(i => i.itemId === newItem.id && i.unit === selectedUnitInfo.label);
        const cartQtyInBaseUnits = (existingItemInCart?.qty || 0) * (existingItemInCart?.conversionFactor || 0);
        
        const mainSettings = settings?.main;
        if (!mainSettings?.financial?.allowNegativeStock && currentStock < (cartQtyInBaseUnits + requiredBaseQty)) {
            toast({
                variant: 'destructive',
                title: 'كمية غير متوفرة',
                description: `الرصيد المتاح من ${selectedItem.name} هو ${currentStock} فقط.`
            });
            return;
        }

        if (existingItemInCart) {
             toast({ title: 'صنف مكرر', description: `تم زيادة كمية ${existingItemInCart.name}.`, duration: 2000 });
             handleUpdateItem(existingItemInCart.uniqueId, 'qty', existingItemInCart.qty + newItem.qty);
             setNewItem({ id: "", name: "", qty: 1, price: 0, cost: 0, unit: "" });
             setSelectedUnit('base');
             setAvailableUnits([]);
             return;
        }

        setItems(prev => [
            ...prev,
            { 
                id: `${selectedItem.id}-${Date.now()}`,
                itemId: selectedItem.id,
                name: selectedItem.name,
                qty: newItem.qty,
                price: newItem.price,
                cost: (selectedItem.cost || 0) * selectedUnitInfo.factor,
                total: newItem.qty * newItem.price,
                unit: selectedUnitInfo.label,
                baseUnit: selectedItem.baseUnit,
                conversionFactor: selectedUnitInfo.factor,
                code: selectedItem.code,
                uniqueId: `${selectedItem.id}-${Date.now()}-${Math.random()}`
            },
        ]);
        setNewItem({ id: "", name: "", qty: 1, price: 0, cost: 0, unit: "" });
        setSelectedUnit('base');
        setAvailableUnits([]);
    };


    const handleRemoveItem = (uniqueId: string) => {
        setItems(items.filter((item) => item.uniqueId !== uniqueId));
    };

    const handleItemSelect = (itemId: string) => {
        const selectedItem = itemsInRepCustody.find((i: Item) => i.id === itemId);
        if (selectedItem) {
            const baseUnitOption = { value: 'base', label: selectedItem.baseUnit || 'قطعة', factor: 1, price: selectedItem.price || 0 };
            const secondaryUnitsOptions = (selectedItem.secondaryUnits || []).map((u: any) => ({
                value: u.name,
                label: u.name,
                factor: u.conversionFactor,
                price: u.price || 0
            }));

            const allUnits = [baseUnitOption, ...secondaryUnitsOptions];
            setAvailableUnits(allUnits);
            setSelectedUnit('base');

            setNewItem({
                id: itemId,
                name: selectedItem.name,
                qty: 1,
                price: selectedItem.price || 0,
                cost: selectedItem.cost || 0,
                unit: selectedItem.baseUnit,
            });
        }
    }

     const handleUnitChange = (unitName: string) => {
        setSelectedUnit(unitName);
        const unit = availableUnits.find(u => u.value === unitName);
        const item = allItems.find((i: Item) => i.id === newItem.id);
        if (unit && item) {
             setNewItem(prev => ({...prev, price: unit.price || (item.price || 0) * unit.factor}));
        }
    }
    
    const shareInvoice = async (invoiceData: any) => {
        setIsLoadingShare(true);
        setInvoiceToShare(invoiceData);
    
        await new Promise(resolve => setTimeout(resolve, 300)); 
    
        if (invoiceRef.current === null) {
            console.error('Invoice ref is not available.');
            setIsLoadingShare(false);
            setInvoiceToShare(null);
            return;
        }
    
        try {
            const dataUrl = await toPng(invoiceRef.current, { 
                cacheBust: true, 
                quality: 0.95,
                backgroundColor: '#ffffff'
            });
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], `${invoiceData.invoiceNumber}.png`, { type: blob.type });
    
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `فاتورة ${invoiceData.invoiceNumber}`,
                    text: `فاتورة مبيعات من ${companySettings.companyName}`,
                });
            } else {
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = `${invoiceData.invoiceNumber}.png`;
                link.click();
            }
        } catch (err: any) {
            console.error('Share failed:', err);
             if (err.name !== 'AbortError') {
                toast({variant: 'destructive', title: 'فشلت المشاركة', description: 'قد لا يكون متصفحك مدعومًا.'});
             }
        } finally {
            setIsLoadingShare(false);
            setInvoiceToShare(null);
            router.push('/sales/my-invoices');
        }
    };
        
    const handleSaveInvoice = async () => {
        if (!customerId || items.length === 0) {
            toast({ variant: 'destructive', title: 'بيانات ناقصة', description: 'يرجى اختيار العميل وإضافة صنف واحد على الأقل.' });
            return;
        }
        if (isDelivery && !deliveryPersonId) {
             toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "يرجى تحديد موظف التوصيل." });
            return;
        }
        
        const repCashAccount = cashAccounts.find((acc: any) => acc.userId === user?.id);
        if (paidAmount > 0 && !repCashAccount) {
            toast({ variant: "destructive", title: "خطأ في الحسابات", description: `لم يتم العثور على حساب عهدة لهذا المندوب لاستلام الدفعة.` });
            return;
        }
        
         const findDominantSourceWarehouse = (): string | undefined => {
            const itemSources = new Map<string, number>();
            items.forEach(item => {
                const itemInCustody = itemsInRepCustody.find((i: any) => i.id === item.itemId);
                if (itemInCustody?.sourceWarehouseId) {
                    const sourceId = itemInCustody.sourceWarehouseId;
                    itemSources.set(sourceId, (itemSources.get(sourceId) || 0) + item.total);
                }
            });

            if (itemSources.size === 0 && user?.warehouseIds?.[0]) return user.warehouseIds[0];
            
            if (itemSources.size > 0) {
                 return [...itemSources.entries()].sort((a,b) => b[1] - a[1])[0][0];
            }
            return user?.warehouseIds?.[0];
        };
        
        const warehouseId = findDominantSourceWarehouse();
        if (!warehouseId) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'لم يتمكن النظام من تحديد الفرع المصدر للبضاعة.' });
            return;
        }

        setIsSaving(true);
        try {
            const invoiceNumber = `ف-ب-${await getNextId('salesInvoice')}`;
            const customerName = customers.find((c:any) => c.id === customerId)?.name || '';
            const customerBalanceBefore = calculateCustomerBalance(customerId);
            
            const invoiceItems = items.map(item => {
                return {
                    id: item.itemId, name: item.name,
                    qty: item.qty * item.conversionFactor, 
                    price: item.price / item.conversionFactor, 
                    total: item.total,
                    cost: item.cost / item.conversionFactor,
                }
            });

            const invoiceData: any = {
                invoiceNumber, date: new Date(invoiceDate).toISOString(), customerId, customerName, warehouseId,
                salesRepId: user?.id, status: 'pending', items: invoiceItems, subtotal, discount,
                tax, total, paidAmount: paidAmount || 0, paidToAccountId: paidAmount > 0 ? repCashAccount?.id : null,
                notes, isDelivery, deliveryPersonId: isDelivery ? deliveryPersonId : null,
                deliveryPersonName: isDelivery ? deliveryStaff.find((d:any) => d.id === deliveryPersonId)?.name : null,
                customerBalanceBefore,
            };
            
            if (location) invoiceData.location = location;
            
            const newInvoiceId = await dbAction(`salesInvoices`, 'add', invoiceData);
            if (!newInvoiceId) throw new Error("Failed to save invoice.");
            
            toast({ title: 'تم الحفظ', description: 'جاري تجهيز الفاتورة للمشاركة كصورة...' });
            
            await shareInvoice({ ...invoiceData, id: newInvoiceId });

        } catch (error) {
            console.error("Failed to save invoice:", error);
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ الفاتورة.' });
            setIsSaving(false);
        }
    };

    
    const customersForCombobox = useMemo(() => {
        return customers.map((c: any) => ({ value: c.id, label: c.name }));
    }, [customers]);
    
    const deliveryStaffOptions = useMemo(() => deliveryStaff.map((d: any) => ({ value: d.id, label: d.name })), [deliveryStaff]);


    if (!isRep) {
        return (
            <div className="flex flex-1 justify-center items-center">
                <Card className="w-full max-w-md">
                    <CardHeader><CardTitle>وصول غير مصرح به</CardTitle></CardHeader>
                    <CardContent>
                        <p>هذه الشاشة مخصصة لمناديب المبيعات فقط.</p>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={() => router.back()}>العودة</Button>
                    </CardFooter>
                </Card>
            </div>
        )
    }

  return (
    <>
      <PageHeader title="فاتورة بيع مندوب" />
      <main className="flex-1 p-4 md:p-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <CardTitle>فاتورة مبيعات</CardTitle>
                    <CardDescription>
                        مندوب: {user?.name}
                    </CardDescription>
                </div>
                 <div className="text-left text-sm flex items-center gap-2">
                    {locationError ? (
                        <div className="flex items-center gap-2 text-amber-600">
                            <Loader2 className="h-4 w-4 animate-spin"/>
                            <span>{locationError}</span>
                        </div>
                    ) : location ? (
                         <div className="flex items-center gap-2 text-green-500">
                             <MapPin className="h-4 w-4"/>
                            <span>تم تحديد الموقع بنجاح</span>
                        </div>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={requestLocation}>تحديد الموقع</Button>
                </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
                <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <>
                    <div className="grid md:grid-cols-2 gap-6">
                         <div className="space-y-2">
                            <Label htmlFor="customer">العميل</Label>
                            <Combobox
                                options={customersForCombobox}
                                value={customerId}
                                onValueChange={setCustomerId}
                                placeholder="اختر عميلاً..."
                                emptyMessage="لم يتم العثور على العميل."
                            />
                        </div>
                    </div>
                     <div className="space-y-4 pt-2">
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                            <Switch id="is-delivery" checked={isDelivery} onCheckedChange={setIsDelivery} />
                            <Label htmlFor="is-delivery" className="flex items-center gap-2 text-base cursor-pointer">
                                <Truck className="h-5 w-5" />
                                فاتورة توصيل (دليفري)
                            </Label>
                        </div>
                        {isDelivery && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-8 rtl:pr-8">
                                <div className="space-y-2">
                                    <Label htmlFor="delivery-person">موظف التوصيل (الطيار)</Label>
                                    <Combobox
                                        options={deliveryStaffOptions}
                                        value={deliveryPersonId}
                                        onValueChange={setDeliveryPersonId}
                                        placeholder="اختر الطيار..."
                                        emptyMessage="لا يوجد طيارون."
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div>
                    <Label>بنود الفاتورة</Label>
                    <div className="w-full overflow-auto border rounded-lg">
                        <Table>
                            <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40%]">الصنف</TableHead>
                                <TableHead>الباركود</TableHead>
                                <TableHead className="text-center w-40">الوحدة</TableHead>
                                <TableHead className="text-center w-24">الكمية</TableHead>
                                <TableHead className="text-center w-32">سعر الوحدة</TableHead>
                                <TableHead className="text-center">الإجمالي</TableHead>
                                <TableHead className="text-center w-[100px] no-print">الإجراء</TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {items.map((item) => (
                                <TableRow key={item.uniqueId}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                <TableCell className="text-center">{item.unit}</TableCell>
                                <TableCell><Input type="number" value={item.qty} onChange={(e) => handleUpdateItem(item.uniqueId, 'qty', Number(e.target.value))} className="text-center h-8" /></TableCell>
                                <TableCell><Input type="number" value={item.price} onChange={(e) => handleUpdateItem(item.uniqueId, 'price', Number(e.target.value))} className="text-center h-8" /></TableCell>
                                <TableCell className="text-center">ج.م {item.total.toFixed(2)}</TableCell>
                                <TableCell className="text-center no-print">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveItem(item.uniqueId)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="no-print bg-muted/20">
                                <TableCell className="p-2" colSpan={2}>
                                     <div className="space-y-1">
                                        <Combobox
                                            options={itemsForCombobox}
                                            value={newItem.id}
                                            onValueChange={handleItemSelect}
                                            placeholder={"اختر صنفًا من عهدتك..."}
                                            emptyMessage="لا توجد أصناف."
                                            className="w-full"
                                        />
                                        {lastPriceForCustomer !== null && (
                                            <div className="flex items-center gap-1 text-[10px] text-primary font-bold animate-in fade-in slide-in-from-top-1">
                                                <History className="h-3 w-3" />
                                                <span>آخر سعر بيع لهذا العميل: {Number(lastPriceForCustomer).toLocaleString()} ج.م</span>
                                            </div>
                                        )}
                                     </div>
                                </TableCell>
                                <TableCell className="p-2 w-40">
                                     <Combobox
                                        options={availableUnits}
                                        value={selectedUnit}
                                        onValueChange={handleUnitChange}
                                        placeholder="اختر وحدة..."
                                        emptyMessage="اختر صنفًا أولاً"
                                        disabled={!newItem.id}
                                    />
                                </TableCell>
                                <TableCell className="p-2 w-24">
                                    <Input type="number" placeholder="الكمية" value={newItem.qty} onChange={e => setNewItem({...newItem, qty: parseInt(e.target.value) || 1})} onFocus={e => e.target.select()} className="text-center" />
                                </TableCell>
                                <TableCell className="p-2 w-32">
                                    <Input type="number" placeholder="السعر" value={newItem.price} onChange={e => setNewItem({...newItem, price: parseFloat(e.target.value) || 0})} onFocus={e => e.target.select()} className="text-center" readOnly={!can('edit', 'sales_invoices')} />
                                </TableCell>
                                <TableCell></TableCell>
                                <TableCell className="text-center">
                                    <Button onClick={handleAddItem} disabled={!newItem.id}>
                                        <PlusCircle className="ml-2 h-4 w-4" />
                                        إضافة
                                    </Button>
                                </TableCell>
                            </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                    </div>
                    
                    <div className="flex flex-col-reverse md:flex-row justify-between items-start gap-8">
                        <div className="w-full md:max-w-sm space-y-2 text-sm mt-4 md:mt-0">
                             <Label>المبلغ المستلم</Label>
                             <Input type="number" value={paidAmount} onFocus={e => e.target.select()} onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)} className="h-10 text-lg" placeholder="0.00"/>
                             <p className="text-xs text-muted-foreground">سيتم إيداع المبلغ المستلم في خزينة المندوب.</p>
                        </div>
                        <div className="w-full md:max-w-sm space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span>الإجمالي الفرعي</span>
                                    <span>ج.م {subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span>الخصم</span>
                                    <Input type="number" value={discount} onFocus={e => e.target.select()} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} className="h-8 max-w-[120px] text-left" placeholder="0.00"/>
                                </div>
                                <div className="flex justify-between font-bold text-base border-t pt-2">
                                    <span>الإجمالي الكلي</span>
                                    <span>ج.م {total.toFixed(2)}</span>
                                </div>
                            </div>
                              <div className="space-y-2 border-t pt-4">
                                <div className="flex justify-between items-center">
                                    <Label className="font-semibold">إجمالي المدفوع</Label>
                                    <span className="font-bold text-lg">{paidAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                </div>
                                <div className="flex justify-between font-bold text-lg text-destructive">
                                    <span>المبلغ المتبقي</span>
                                    <span>ج.م {(total - paidAmount).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">ملاحظات الفاتورة</Label>
                        <Textarea id="notes" placeholder="أضف أي ملاحظات تظهر في الفاتورة هنا..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                </>
            )}
          </CardContent>
          <CardFooter className="flex justify-end no-print">
            <Button size="lg" disabled={loading || isSaving || isSharing} onClick={handleSaveInvoice}>
                {isSaving || isSharing ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                {isSaving ? 'جارٍ الحفظ...' : (isSharing ? 'جاري المشاركة...' : 'حفظ وإرسال للمراجعة')}
            </Button>
          </CardFooter>
        </Card>
      </main>
      
      <div style={{ position: 'fixed', top: '200vh', left: 0, zIndex: -100 }}>
          <div ref={invoiceRef} className="bg-white">
              {invoiceToShare && (
                  <InvoiceTemplate 
                      invoice={invoiceToShare} 
                      company={companySettings} 
                      customer={customers.find((c: any) => c.id === invoiceToShare.customerId)}
                      customerBalance={calculateCustomerBalance(invoiceToShare.customerId)}
                  />
              )}
          </div>
      </div>
    </>
  );
}
