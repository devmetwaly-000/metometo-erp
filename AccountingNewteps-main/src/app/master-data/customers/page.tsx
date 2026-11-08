"use client";

import React, { useState, useMemo, useEffect } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, List, Wallet, AlertTriangle, Info, CheckCircle, Save, Search, History, ShoppingBag, Tag, Barcode, X, Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { AddEntityDialog } from "@/components/add-entity-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useData } from "@/contexts/data-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/auth-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";

interface Customer {
  id?: string;
  name: string;
  openingBalance: number;
  creditLimit: number;
  phone?: string;
  address?: string;
  allowCredit?: boolean;
}

const PurchaseHistoryDialog = ({ customer, onClose }: { customer: any, onClose: () => void }) => {
    const { salesInvoices, items: allItemsData } = useData();
    const isMobile = useIsMobile();
    const [itemSearch, setItemSearch] = useState('');
    
    const customerPurchases = useMemo(() => {
        const history: any[] = [];
        const allSales = salesInvoices.filter(s => s.status === 'approved' || s.status === 'completed' || !s.status);
        
        allSales.filter(s => s.customerId === customer.id).forEach(sale => {
            (sale.items || []).forEach((item: any) => {
                const master = allItemsData.find((i: any) => i.id === item.id);
                history.push({
                    date: sale.date,
                    invoiceNumber: sale.invoiceNumber,
                    itemId: item.id,
                    itemName: item.name,
                    code: item.code || master?.code || 'N/A',
                    qty: item.qty,
                    price: item.price,
                    cost: item.cost || master?.cost || 0,
                    total: item.total
                });
            });
        });
        return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [customer.id, salesInvoices, allItemsData]);

    const filteredPurchases = useMemo(() => {
        if (!itemSearch.trim()) return customerPurchases;
        const term = itemSearch.toLowerCase().trim();
        return customerPurchases.filter(p => 
            p.itemName.toLowerCase().includes(term) || 
            p.code.toLowerCase().includes(term)
        );
    }, [customerPurchases, itemSearch]);

    const totals = useMemo(() => {
        return filteredPurchases.reduce((acc, curr) => {
            const costTotal = (curr.cost || 0) * curr.qty;
            const profitTotal = curr.total - costTotal;
            return {
                qty: acc.qty + curr.qty,
                revenue: acc.revenue + curr.total,
                cost: acc.cost + costTotal,
                profit: acc.profit + profitTotal
            };
        }, { qty: 0, revenue: 0, cost: 0, profit: 0 });
    }, [filteredPurchases]);

    const summarizedHistory = useMemo(() => {
        const summary = new Map<string, any>();
        customerPurchases.forEach(item => {
            const current = summary.get(item.itemId) || { 
                name: item.itemName, 
                code: item.code,
                totalQty: 0, 
                totalValue: 0, 
                totalCost: 0,
                lastPrice: 0,
                lastDate: ''
            };
            current.totalQty += item.qty;
            current.totalValue += item.total;
            current.totalCost += (item.cost * item.qty);
            
            if (!current.lastDate) {
                current.lastPrice = item.price;
                current.lastDate = item.date;
            }
            summary.set(item.itemId, current);
        });
        return Array.from(summary.values());
    }, [customerPurchases]);

    const filteredSummarized = useMemo(() => {
        if (!itemSearch.trim()) return summarizedHistory;
        const term = itemSearch.toLowerCase().trim();
        return summarizedHistory.filter(p => 
            p.name.toLowerCase().includes(term) || 
            p.code.toLowerCase().includes(term)
        );
    }, [summarizedHistory, itemSearch]);

    return (
        <DialogContent className="max-w-6xl h-[95vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="p-4 pb-2 border-b bg-muted/30">
                <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                        <DialogTitle className="flex items-center gap-2 text-lg md:text-xl">
                            <ShoppingBag className="text-primary h-5 w-5 md:h-6 md:w-6"/> سجل المشتريات: {customer.name}
                        </DialogTitle>
                        <DialogDescription className="text-xs">تتبع الأصناف والأسعار والربحية لهذا العميل.</DialogDescription>
                    </div>
                    <div className="relative w-full max-w-[200px] md:max-w-xs">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input 
                            placeholder="بحث عن صنف..." 
                            value={itemSearch} 
                            onChange={e => setItemSearch(e.target.value)}
                            className="h-8 pr-7 text-xs bg-background"
                        />
                        {itemSearch && (
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-6"
                                onClick={() => setItemSearch('')}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                </div>
            </DialogHeader>
            
            <div className="flex-1 overflow-hidden flex flex-col">
                <Tabs defaultValue="detailed" className="flex-1 overflow-hidden flex flex-col">
                    <div className="px-4 pt-2">
                        <TabsList className="grid w-full grid-cols-2 mb-2">
                            <TabsTrigger value="detailed">عرض تفصيلي</TabsTrigger>
                            <TabsTrigger value="summary">حسب الأصناف</TabsTrigger>
                        </TabsList>
                    </div>
                    
                    <TabsContent value="detailed" className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full px-4">
                            {isMobile ? (
                                <div className="space-y-2 pb-4">
                                    {filteredPurchases.map((item, idx) => (
                                        <div key={idx} className="p-3 bg-card border rounded-lg shadow-sm border-r-4 border-r-primary">
                                            <div className="flex justify-between items-start gap-2 mb-1">
                                                <div className="font-bold text-sm leading-tight flex-1">{item.itemName}</div>
                                                <Badge variant="secondary" className="text-[10px] h-5">{item.qty} ق</Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono mb-2">
                                                <Barcode className="h-3 w-3"/> {item.code}
                                            </div>
                                            <div className="flex justify-between items-center text-[11px] pt-2 border-t">
                                                <div className="text-muted-foreground">{new Date(item.date).toLocaleDateString('ar-EG')} • {item.invoiceNumber}</div>
                                                <div className="font-bold text-primary">{item.total.toLocaleString()} ج.م</div>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredPurchases.length === 0 && <p className="text-center py-10 text-muted-foreground text-sm">لا توجد حركات مطابقة.</p>}
                                </div>
                            ) : (
                                <div className="border rounded-lg mb-4">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-background z-10">
                                            <TableRow>
                                                <TableHead>التاريخ</TableHead>
                                                <TableHead>الفاتورة</TableHead>
                                                <TableHead>الصنف</TableHead>
                                                <TableHead>الباركود</TableHead>
                                                <TableHead className="text-center">الكمية</TableHead>
                                                <TableHead className="text-center">البيع</TableHead>
                                                <TableHead className="text-center">التكلفة</TableHead>
                                                <TableHead className="text-center">الإجمالي</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredPurchases.length > 0 ? filteredPurchases.map((item, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="text-xs">{new Date(item.date).toLocaleDateString('ar-EG')}</TableCell>
                                                    <TableCell className="font-mono text-xs">{item.invoiceNumber}</TableCell>
                                                    <TableCell className="font-bold">{item.itemName}</TableCell>
                                                    <TableCell className="font-mono text-xs text-muted-foreground">{item.code}</TableCell>
                                                    <TableCell className="text-center font-bold text-blue-600">{item.qty}</TableCell>
                                                    <TableCell className="text-center">{item.price.toLocaleString()}</TableCell>
                                                    <TableCell className="text-center text-muted-foreground italic">{item.cost.toLocaleString()}</TableCell>
                                                    <TableCell className="text-center font-black">{item.total.toLocaleString()}</TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow><TableCell colSpan={8} className="text-center py-20 text-muted-foreground">لا توجد مشتريات مسجلة.</TableCell></TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="summary" className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full px-4">
                            {isMobile ? (
                                <div className="space-y-2 pb-4">
                                    {filteredSummarized.map((item, idx) => {
                                        const profit = item.totalValue - item.totalCost;
                                        return (
                                            <div key={idx} className="p-3 bg-card border rounded-lg shadow-sm border-r-4 border-r-green-500">
                                                <div className="flex justify-between items-start gap-2 mb-1">
                                                    <div className="font-bold text-sm leading-tight flex-1">{item.name}</div>
                                                    <Badge className="text-[10px] h-5">{item.totalQty} ق</Badge>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground font-mono mb-2">{item.code}</div>
                                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] pt-2 border-t">
                                                    <div><span className="text-muted-foreground">آخر سعر:</span> {item.lastPrice.toLocaleString()}</div>
                                                    <div className="text-left"><span className="text-muted-foreground">الإيراد:</span> {item.totalValue.toLocaleString()}</div>
                                                    <div className={cn("col-span-2 text-left font-bold", profit >= 0 ? "text-green-600" : "text-destructive")}>
                                                        الربح: {profit.toLocaleString()} ج.م
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {filteredSummarized.length === 0 && <p className="text-center py-10 text-muted-foreground text-sm">لا توجد بيانات مطابقة.</p>}
                                </div>
                            ) : (
                                <div className="border rounded-lg mb-4">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-background z-10">
                                            <TableRow>
                                                <TableHead>الصنف</TableHead>
                                                <TableHead>الباركود</TableHead>
                                                <TableHead className="text-center">إجمالي الكمية</TableHead>
                                                <TableHead className="text-center">آخر سعر بيع</TableHead>
                                                <TableHead className="text-center">إجمالي الإيراد</TableHead>
                                                <TableHead className="text-center">إجمالي التكلفة</TableHead>
                                                <TableHead className="text-center">إجمالي الربح</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredSummarized.map((item, idx) => {
                                                const profit = item.totalValue - item.totalCost;
                                                return (
                                                    <TableRow key={idx}>
                                                        <TableCell className="font-bold">{item.name}</TableCell>
                                                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                        <TableCell className="text-center font-bold">{item.totalQty}</TableCell>
                                                        <TableCell className="text-center text-primary font-black">{item.lastPrice.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center font-bold">{item.totalValue.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center text-muted-foreground italic">{item.totalCost.toLocaleString()}</TableCell>
                                                        <TableCell className={cn("text-center font-bold text-lg", profit >= 0 ? "text-green-600" : "text-destructive")}>
                                                            {profit.toLocaleString()}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </div>

            <div className="p-3 bg-muted border-t grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="p-2 bg-background rounded border flex flex-col items-center shadow-sm">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground">إجمالي القطع</span>
                    <span className="text-base font-black text-blue-600">{totals.qty.toLocaleString()}</span>
                </div>
                <div className="p-2 bg-background rounded border flex flex-col items-center shadow-sm">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground">إجمالي التكلفة</span>
                    <span className="text-base font-black text-amber-600">{totals.cost.toLocaleString()}</span>
                </div>
                <div className="p-2 bg-background rounded border flex flex-col items-center shadow-sm">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground">صافي الإيراد</span>
                    <span className="text-base font-black text-primary">{totals.revenue.toLocaleString()}</span>
                </div>
                <div className="p-2 bg-background rounded border flex flex-col items-center ring-1 ring-primary/20 shadow-sm">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground">إجمالي الربح</span>
                    <span className={cn("text-base font-black", totals.profit >= 0 ? "text-green-600" : "text-destructive")}>
                        {totals.profit.toLocaleString()}
                    </span>
                </div>
            </div>

            <DialogFooter className="p-3 border-t bg-background">
                <Button variant="outline" onClick={onClose} className="w-full text-xs h-9">إغلاق السجل</Button>
            </DialogFooter>
        </DialogContent>
    );
};

const QuickPaymentDialog = ({ customer, onClose }: { customer: any, onClose: () => void }) => {
    const { cashAccounts, dbAction, getNextId, warehouses } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const [amount, setAmount] = useState(customer.currentBalance > 0 ? customer.currentBalance : 0);
    const [paidToAccountId, setPaidToAccountId] = useState('');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const cashAccountOptions = useMemo(() => {
        return cashAccounts
            .filter((acc: any) => !acc.userId && !acc.salesRepId) // استبعاد المناديب
            .map((acc: any) => {
                const warehouse = warehouses.find(w => w.id === acc.warehouseId);
                return { 
                    value: acc.id, 
                    label: warehouse ? `${acc.name} (${warehouse.name})` : acc.name 
                };
            });
    }, [cashAccounts, warehouses]);

    const handleSavePayment = async () => {
        if (!amount || amount <= 0 || !paidToAccountId) {
            toast({ variant: 'destructive', title: 'بيانات غير كاملة', description: 'الرجاء إدخال مبلغ صحيح واختيار حساب الاستلام.' });
            return;
        }
        setIsSaving(true);
        try {
            const receiptNumber = `س-ع-${await getNextId('customerPayment')}`;
            const newPayment = {
                date: new Date().toISOString(),
                amount: Number(amount),
                customerId: customer.id,
                paidToAccountId,
                notes: notes || `دفعة سريعة من شاشة العملاء`,
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            };
            await dbAction('customerPayments', 'add', newPayment);
            toast({ title: 'تم الحفظ بنجاح', description: `تم استلام دفعة من العميل ${customer.name} برقم: ${receiptNumber}` });
            onClose();
        } catch (error) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ الدفعة.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 py-4">
            <div className={cn(
                "flex items-center gap-4 p-5 rounded-xl border animate-in fade-in slide-in-from-top-2 shadow-sm",
                customer.currentBalance > 0 
                    ? "bg-destructive/10 border-destructive/20" 
                    : "bg-green-500/10 border-green-500/20"
            )}>
                <div className={cn(
                    "p-3 rounded-full shrink-0",
                    customer.currentBalance > 0 ? "bg-destructive/20" : "bg-green-500/20"
                )}>
                    <Wallet className={cn("h-6 w-6", customer.currentBalance > 0 ? "text-destructive" : "text-green-600 dark:text-green-400")} />
                </div>
                <div className="flex-1">
                    <span className={cn(
                        "text-xs font-bold block mb-1 uppercase tracking-wider",
                        customer.currentBalance > 0 ? "text-destructive/80" : "text-green-700 dark:text-green-300"
                    )}>
                        {customer.currentBalance >= 0 ? "إجمالي المستحق على العميل الآن:" : "المبلغ المستحق للعميل (رصيد دائن):"}
                    </span>
                    <div className="flex items-center gap-3">
                        <span className={cn(
                            "text-3xl font-black tracking-tight",
                            customer.currentBalance > 0 ? "text-destructive" : "text-green-700 dark:text-green-400"
                        )}>
                            {Math.abs(customer.currentBalance).toLocaleString()} ج.م
                        </span>
                        {customer.currentBalance < 0 && (
                            <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800 font-bold">
                                رصيد له
                            </Badge>
                        )}
                    </div>
                </div>
                {customer.currentBalance < 0 && (
                    <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full">
                        <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                )}
            </div>

            <div className="grid gap-4 border-t pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="amount" className="font-bold">المبلغ المستلم</Label>
                        <Input 
                            id="amount" 
                            type="number" 
                            value={amount} 
                            onChange={e => setAmount(Number(e.target.value))} 
                            className="text-xl h-12 font-bold border-primary/50 focus:ring-primary" 
                            onFocus={e => e.target.select()}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="account">إيداع في (الخزينة/البنك)</Label>
                        <Combobox
                            options={cashAccountOptions}
                            value={paidToAccountId}
                            onValueChange={setPaidToAccountId}
                            placeholder="اختر حساب الاستلام..."
                            emptyMessage="لا يوجد خزائن متاحة."
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="notes">ملاحظات</Label>
                    <Textarea 
                        id="notes" 
                        value={notes} 
                        onChange={e => setNotes(e.target.value)} 
                        placeholder="أدخل أي ملاحظات إضافية هنا..."
                        className="h-20"
                    />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="ghost" onClick={onClose} disabled={isSaving}>إلغاء</Button>
                <Button onClick={handleSavePayment} disabled={isSaving || !paidToAccountId || amount <= 0} className="px-8">
                    {isSaving ? <Loader2 className="animate-spin ml-2 h-4 w-4" /> : <Save className="ml-2 h-4 w-4" />}
                    تأكيد وحفظ السند
                </Button>
            </div>
        </div>
    );
};

const CustomerForm = ({ customer, onSave, onClose, allCustomers, hasInvoices }: { customer?: Customer, onSave: (customer: Customer) => void, onClose: () => void, allCustomers: Customer[], hasInvoices: boolean }) => {
  const [formData, setFormData] = useState<Customer>(
    customer || { name: "", openingBalance: 0, creditLimit: 0, phone: "", address: "", allowCredit: false }
  );
  const { toast } = useToast();
  const [isBalanceUnlocked, setIsBalanceUnlocked] = useState(false);

  const handleUnlock = () => {
    const pass = prompt("أدخل كلمة المرور لتعديل الرصيد الافتتاحي:");
    if (pass === 'metoomar') {
        setIsBalanceUnlocked(true);
        toast({ title: "تم فك القفل", description: "يمكنك الآن تعديل الرصيد الافتتاحي." });
    } else if (pass !== null) {
        toast({ variant: "destructive", title: "خطأ", description: "كلمة المرور غير صحيحة." });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
     if (!formData.name || !formData.phone?.trim()) {
        toast({
            variant: "destructive",
            title: "بيانات ناقصة",
            description: "يرجى إدخال اسم العميل ورقم الهاتف.",
        });
        return;
    }
    const isPhoneDuplicate = allCustomers.some((c: Customer) => c.phone?.trim() === formData.phone?.trim() && c.id !== customer?.id);
    if (isPhoneDuplicate) {
        toast({
            variant: "destructive",
            title: "رقم هاتف مكرر",
            description: "هذا الرقم مسجل لعميل آخر. يرجى إدخال رقم مختلف.",
        });
        return;
    }

    onSave({
      ...formData,
      openingBalance: Number(formData.openingBalance),
      creditLimit: Number(formData.creditLimit),
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="customer-name" className={hasInvoices ? "text-muted-foreground" : ""}>اسم العميل</Label>
          <Input id="customer-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} disabled={hasInvoices} className={hasInvoices ? "bg-muted" : ""} />
          {hasInvoices && <p className="text-[10px] text-amber-600 font-semibold">لا يمكن تعديل الاسم لوجود فواتير مرتبطة.</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-phone">رقم الهاتف</Label>
          <Input id="customer-phone" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
        </div>
         <div className="space-y-2">
          <Label htmlFor="customer-address">العنوان</Label>
          <Input id="customer-address" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="opening-balance" className={hasInvoices && !isBalanceUnlocked ? "text-muted-foreground" : ""}>رصيد أول المدة</Label>
            {hasInvoices && !isBalanceUnlocked && (
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={handleUnlock}>
                    <Lock className="h-3.5 w-3.5" /> تعديل الرصيد المحمي
                </Button>
            )}
          </div>
          <Input id="opening-balance" type="number" value={formData.openingBalance} onChange={(e) => setFormData({...formData, openingBalance: Number(e.target.value)})} disabled={hasInvoices && !isBalanceUnlocked} className={hasInvoices && !isBalanceUnlocked ? "bg-muted" : ""} />
        </div>
         <div className="space-y-2">
          <Label htmlFor="credit-limit">حد الائتمان</Label>
          <Input id="credit-limit" type="number" value={formData.creditLimit} onChange={(e) => setFormData({...formData, creditLimit: Number(e.target.value)})} />
        </div>
        <div className="flex items-center space-x-2 rtl:space-x-reverse pt-2">
            <Switch id="allow-credit" checked={formData.allowCredit} onCheckedChange={(checked: boolean) => setFormData({...formData, allowCredit: checked})} />
            <Label htmlFor="allow-credit" className="cursor-pointer">
                السماح بالبيع الآجل (التقسيط)
            </Label>
        </div>
      </div>
      <div className="flex justify-end pt-4">
        <Button type="submit">حفظ</Button>
      </div>
    </form>
  );
};

export default function CustomersPage() {
  const { customers, salesInvoices, customerPayments, salesReturns, loading, dbAction } = useData();
  const router = useRouter();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  
  const [paymentCustomer, setPaymentCustomer] = useState<any>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const [historyCustomer, setHistoryCustomer] = useState<any>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [userToDelete, setUserToDelete] = useState<Customer | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  useEffect(() => {
    if (!isEditOpen && !isPaymentOpen && !isDeleteAlertOpen && !isHistoryOpen) {
        document.body.style.pointerEvents = 'auto';
        document.body.style.overflow = 'auto';
    }
  }, [isEditOpen, isPaymentOpen, isDeleteAlertOpen, isHistoryOpen]);

  const checkHasInvoices = (id: string) => {
    const hasSalesInvoices = (salesInvoices || []).some((inv: any) => inv.customerId === id);
    const hasReturns = (salesReturns || []).some((ret: any) => ret.customerId === id);
    const hasPayments = (customerPayments || []).some((pay: any) => pay.customerId === id);
    return hasSalesInvoices || hasReturns || hasPayments;
  };

  const customersWithBalance = useMemo(() => {
    return customers.map((customer: Customer) => {
        let balance = Number(customer.openingBalance) || 0;
        
        const approvedSales = salesInvoices.filter((s: any) => s.customerId === customer.id && (s.status === 'approved' || s.status === 'completed' || !s.status));
        approvedSales.forEach((inv: any) => { 
            balance += (Number(inv.total) - Number(inv.paidAmount || 0)); 
        });

        const standalonePayments = customerPayments.filter((p: any) => p.customerId === customer.id && !p.invoiceId);
        standalonePayments.forEach((payment: any) => { 
            balance -= Number(payment.amount); 
        });

        const returns = salesReturns.filter((r: any) => r.customerId === customer.id);
        returns.forEach((ret: any) => { 
            balance -= (Number(ret.total) - Number(ret.paidAmount || 0)); 
        });
        
        return { ...customer, currentBalance: balance, invoiceCount: approvedSales.length };
    });
  }, [customers, salesInvoices, customerPayments, salesReturns]);

  const filteredCustomers = useMemo(() => {
      if (!searchTerm) return customersWithBalance;
      const lowerSearch = searchTerm.toLowerCase();
      return customersWithBalance.filter(c => 
        c.name.toLowerCase().includes(lowerSearch) || 
        (c.phone && c.phone.includes(searchTerm))
      );
  }, [customersWithBalance, searchTerm]);

  const handleSave = (customer: Customer) => {
    if (customer.id) {
      dbAction('customers', 'update', { id: customer.id, data: customer });
      toast({ title: "تم التحديث بنجاح" });
    } else {
      dbAction('customers', 'add', customer);
      toast({ title: "تمت إضافة العميل بنجاح" });
    }
  };

  const handleEditClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setTimeout(() => setIsEditOpen(true), 150);
  };

  const handlePaymentClick = (customer: any) => {
      setPaymentCustomer(customer);
      setTimeout(() => setIsPaymentOpen(true), 150);
  };

  const handleHistoryClick = (customer: any) => {
      setHistoryCustomer(customer);
      setTimeout(() => setIsHistoryOpen(true), 150);
  };

  const handleDelete = (id: string) => {
    if (checkHasInvoices(id)) {
        toast({
            variant: "destructive",
            title: "لا يمكن الحذف",
            description: "لا يمكن حذف هذا العميل لوجود حركات مالية مرتبطة به. يمكنك تعطيله بدلاً من حذفه.",
        });
        return;
    }
    dbAction('customers', 'remove', { id });
    toast({ title: "تم الحذف بنجاح" });
  };

  return (
    <>
      <PageHeader title="إدارة العملاء">
        <AddEntityDialog
          title="إضافة عميل جديد"
          description="أدخل تفاصيل العميل الجديد هنا."
          triggerButton={
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              إضافة عميل
            </Button>
          }
        >
          {({onClose}) => <CustomerForm onSave={handleSave} onClose={onClose} allCustomers={customers} hasInvoices={false} />}
        </AddEntityDialog>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <CardTitle>العملاء</CardTitle>
                    <CardDescription>إدارة العملاء مع حدود الائتمان والأرصدة الحالية.</CardDescription>
                </div>
                <div className="relative w-full max-w-sm">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="بحث بالاسم أو رقم الهاتف..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        className="pr-9 h-10 border-primary/20"
                    />
                </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
                <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="w-full overflow-auto border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>اسم العميل</TableHead>
                                <TableHead className="hidden md:table-cell">الهاتف</TableHead>
                                <TableHead className="text-center">حد الائتمان</TableHead>
                                <TableHead className="text-center">الرصيد الحالي</TableHead>
                                <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredCustomers.map((customer: any) => (
                                <TableRow key={customer.id}>
                                    <TableCell className="font-medium">{customer.name}</TableCell>
                                    <TableCell className="hidden md:table-cell">{customer.phone || '-'}</TableCell>
                                    <TableCell className="text-center">{customer.creditLimit?.toLocaleString() || '0'}</TableCell>
                                    <TableCell className={cn("text-center font-bold", customer.currentBalance > 0.01 ? "text-destructive" : "text-primary")}>
                                        {customer.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-center">
                                         <AlertDialog>
                                            <DropdownMenu modal={false}>
                                                <DropdownMenuTrigger asChild>
                                                <Button size="icon" variant="ghost">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                                    <DropdownMenuItem onSelect={() => handlePaymentClick(customer)}>
                                                        <PlusCircle className="ml-2 h-4 w-4 text-green-600" /> تسجيل دفعة
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => handleHistoryClick(customer)}>
                                                        <History className="ml-2 h-4 w-4 text-blue-600" /> سجل مشتريات الأصناف
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => router.push(`/reports/customer-statement?customerId=${customer.id}`)}>
                                                        <List className="ml-2 h-4 w-4" /> كشف حساب مالي
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onSelect={() => handleEditClick(customer)}>
                                                        <Edit className="ml-2 h-4 w-4" /> تعديل البيانات
                                                    </DropdownMenuItem>
                                                    <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem className="text-destructive">
                                                            <Trash2 className="ml-2 h-4 w-4" /> حذف العميل
                                                        </DropdownMenuItem>
                                                    </AlertDialogTrigger>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                                <AlertDialogDescription>هل أنت متأكد من حذف العميل؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDelete(customer.id!)}>متابعة</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filteredCustomers.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground italic">لم يتم العثور على عملاء يطابقون البحث.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>تعديل بيانات العميل</DialogTitle>
            <DialogDescription>قم بتحديث بيانات العميل هنا.</DialogDescription>
          </DialogHeader>
          {editingCustomer && (
            <CustomerForm 
                customer={editingCustomer} 
                onSave={handleSave} 
                onClose={() => setIsEditOpen(false)} 
                allCustomers={customers} 
                hasInvoices={checkHasInvoices(editingCustomer.id!)} 
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة جديدة</DialogTitle>
            <DialogDescription>تسجيل مقبوضات نقدية من العميل: {paymentCustomer?.name}</DialogDescription>
          </DialogHeader>
          {paymentCustomer && (
            <QuickPaymentDialog 
                customer={paymentCustomer} 
                onClose={() => setIsPaymentOpen(false)} 
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          {historyCustomer && <PurchaseHistoryDialog customer={historyCustomer} onClose={() => setIsHistoryOpen(false)} />}
      </Dialog>
    </>
  );
}
