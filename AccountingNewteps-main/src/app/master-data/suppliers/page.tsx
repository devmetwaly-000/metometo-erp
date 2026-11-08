"use client";

import React, { useState, useMemo, useEffect } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, List, ShoppingBag, History, Search, X, Barcode } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";

interface Supplier {
  id?: string;
  name: string;
  contact: string;
  openingBalance: number;
  items?: string[];
}

const SupplierPurchaseHistoryDialog = ({ supplier, onClose }: { supplier: any, onClose: () => void }) => {
    const { purchaseInvoices, items: allItemsData } = useData();
    const isMobile = useIsMobile();
    const [itemSearch, setItemSearch] = useState('');
    
    const supplierPurchases = useMemo(() => {
        const history: any[] = [];
        purchaseInvoices.filter((p:any) => p.supplierId === supplier.id).forEach(purchase => {
            purchase.items.forEach((item: any) => {
                const master = allItemsData.find((i: any) => i.id === item.id);
                history.push({
                    date: purchase.date,
                    invoiceNumber: purchase.invoiceNumber,
                    itemId: item.id,
                    itemName: item.name,
                    code: item.code || master?.code || 'N/A',
                    qty: item.qty,
                    cost: item.cost,
                    price: item.sellingPrice || master?.price || 0,
                    total: item.qty * item.cost
                });
            });
        });
        return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [supplier.id, purchaseInvoices, allItemsData]);

    const filteredPurchases = useMemo(() => {
        if (!itemSearch.trim()) return supplierPurchases;
        const term = itemSearch.toLowerCase().trim();
        return supplierPurchases.filter(p => 
            p.itemName.toLowerCase().includes(term) || 
            p.code.toLowerCase().includes(term)
        );
    }, [supplierPurchases, itemSearch]);

    const totals = useMemo(() => {
        return filteredPurchases.reduce((acc, curr) => {
            const revenueTotal = (curr.price || 0) * curr.qty;
            return {
                qty: acc.qty + curr.qty,
                cost: acc.cost + curr.total,
                revenue: acc.revenue + revenueTotal,
            };
        }, { qty: 0, cost: 0, revenue: 0 });
    }, [filteredPurchases]);

    const summarizedHistory = useMemo(() => {
        const summary = new Map<string, any>();
        supplierPurchases.forEach(item => {
            const current = summary.get(item.itemId) || { 
                name: item.itemName, 
                code: item.code,
                totalQty: 0, 
                totalCost: 0, 
                totalRevenue: 0,
                lastCost: 0,
                lastDate: ''
            };
            current.totalQty += item.qty;
            current.totalCost += item.total;
            current.totalRevenue += (item.price * item.qty);
            
            if (!current.lastDate) {
                current.lastCost = item.cost;
                current.lastDate = item.date;
            }
            summary.set(item.itemId, current);
        });
        return Array.from(summary.values());
    }, [supplierPurchases]);

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
                            <History className="text-primary h-5 w-5 md:h-6 md:w-6"/> سجل توريد الأصناف: {supplier.name}
                        </DialogTitle>
                        <DialogDescription className="text-xs">تتبع الأصناف التي تم توريدها وأسعار الشراء من هذا المورد.</DialogDescription>
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
                                                <TableHead className="text-center">سعر الشراء</TableHead>
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
                                                    <TableCell className="text-center font-bold text-amber-600">{item.qty}</TableCell>
                                                    <TableCell className="text-center">{item.cost.toLocaleString()}</TableCell>
                                                    <TableCell className="text-center font-black">{item.total.toLocaleString()}</TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow><TableCell colSpan={7} className="text-center py-20 text-muted-foreground">لا توجد مشتريات مسجلة.</TableCell></TableRow>
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
                                    {filteredSummarized.map((item, idx) => (
                                        <div key={idx} className="p-3 bg-card border rounded-lg shadow-sm border-r-4 border-r-amber-500">
                                            <div className="flex justify-between items-start gap-2 mb-1">
                                                <div className="font-bold text-sm leading-tight flex-1">{item.name}</div>
                                                <Badge className="text-[10px] h-5">{item.totalQty} ق</Badge>
                                            </div>
                                            <div className="text-[10px] text-muted-foreground font-mono mb-2">{item.code}</div>
                                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] pt-2 border-t">
                                                <div><span className="text-muted-foreground">آخر تكلفة:</span> {item.lastCost.toLocaleString()}</div>
                                                <div className="text-left font-bold text-amber-600">إجمالي التكلفة: {item.totalCost.toLocaleString()}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredSummarized.length === 0 && <p className="text-center py-10 text-muted-foreground text-sm">لا توجد بيانات مطابقة.</p>}
                                </div>
                            ) : (
                                <div className="border rounded-lg mb-4">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-background z-10">
                                            <TableRow>
                                                <TableHead>الصنف</TableHead>
                                                <TableHead>الباركود</TableHead>
                                                <TableHead className="text-center">إجمالي الكمية الموردة</TableHead>
                                                <TableHead className="text-center">آخر سعر شراء</TableHead>
                                                <TableHead className="text-center">إجمالي التكلفة</TableHead>
                                                <TableHead className="text-center">القيمة البيعية التقديرية</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredSummarized.map((item, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="font-bold">{item.name}</TableCell>
                                                    <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                    <TableCell className="text-center font-bold">{item.totalQty}</TableCell>
                                                    <TableCell className="text-center text-amber-600 font-black">{item.lastCost.toLocaleString()}</TableCell>
                                                    <TableCell className="text-center font-bold">{item.totalCost.toLocaleString()}</TableCell>
                                                    <TableCell className="text-center text-green-600 italic font-semibold">{item.totalRevenue.toLocaleString()}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </div>

            <div className="p-3 bg-muted border-t grid grid-cols-2 md:grid-cols-3 gap-2">
                <div className="p-2 bg-background rounded border flex flex-col items-center shadow-sm">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground">إجمالي قطع المشتريات</span>
                    <span className="text-base font-black text-amber-600">{totals.qty.toLocaleString()}</span>
                </div>
                <div className="p-2 bg-background rounded border flex flex-col items-center shadow-sm ring-1 ring-primary/20">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground">إجمالي التكلفة (مشتريات)</span>
                    <span className="text-base font-black text-primary">{totals.cost.toLocaleString()}</span>
                </div>
                <div className="p-2 bg-background rounded border flex flex-col items-center shadow-sm col-span-2 md:col-span-1">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground">القيمة البيعية التقديرية</span>
                    <span className="text-base font-black text-green-600">{totals.revenue.toLocaleString()}</span>
                </div>
            </div>

            <DialogFooter className="p-3 border-t bg-background">
                <Button variant="outline" onClick={onClose} className="w-full text-xs h-9">إغلاق السجل</Button>
            </DialogFooter>
        </DialogContent>
    );
};

const SupplierItemsDialog = ({ supplier, allItems }: { supplier: Supplier | null, allItems: any[] }) => {
    if (!supplier) return null;

    const supplierItems = useMemo(() => {
        if (!supplier.items) return [];
        return supplier.items.map(itemId => allItems.find(item => item.id === itemId)).filter(Boolean);
    }, [supplier, allItems]);

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>الأصناف المرتبطة بالمورد: {supplier.name}</DialogTitle>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>اسم الصنف</TableHead>
                            <TableHead>كود الصنف</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {supplierItems.length > 0 ? (
                            supplierItems.map((item: any) => (
                                <TableRow key={item.id}>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell className="font-mono">{item.code || 'N/A'}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={2} className="text-center text-muted-foreground py-4">
                                    لا توجد أصناف مرتبطة بهذا المورد بعد.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </DialogContent>
    );
};

const SupplierForm = ({ supplier, onSave, onClose, hasInvoices }: { supplier?: Supplier, onSave: (supplier: Supplier) => void, onClose: () => void, hasInvoices: boolean }) => {
  const [formData, setFormData] = useState<Supplier>(
    supplier || { name: "", contact: "", openingBalance: 0 }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
        ...formData,
        openingBalance: Number(formData.openingBalance),
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="supplier-name" className={cn("text-right", hasInvoices && "text-muted-foreground")}>
            اسم المورد
          </Label>
          <Input id="supplier-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} disabled={hasInvoices} className={cn("col-span-3", hasInvoices && "bg-muted")} />
          {hasInvoices && <div className="col-start-2 col-span-3 text-[10px] text-amber-600 font-semibold">لا يمكن تعديل الاسم لوجود فواتير مرتبطة.</div>}
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="supplier-contact" className="text-right">جهة الاتصال</Label>
          <Input id="supplier-contact" value={formData.contact} onChange={(e) => setFormData({...formData, contact: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="opening-balance" className={cn("text-right", hasInvoices && "text-muted-foreground")}>
            رصيد أول المدة
          </Label>
          <Input id="opening-balance" type="number" value={formData.openingBalance} onChange={(e) => setFormData({...formData, openingBalance: e.target.value as any})} disabled={hasInvoices} className={cn("col-span-3", hasInvoices && "bg-muted")} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit">حفظ</Button>
      </div>
    </form>
  );
};

export default function SuppliersPage() {
  const { suppliers, purchaseInvoices, supplierPayments, purchaseReturns, items, loading, dbAction } = useData();
  const { toast } = useToast();
  
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [viewItemsSupplier, setViewItemsSupplier] = useState<Supplier | null>(null);
  const [historySupplier, setHistorySupplier] = useState<any>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    if (!isEditOpen && !isHistoryOpen) {
        document.body.style.pointerEvents = 'auto';
        document.body.style.overflow = 'auto';
    }
  }, [isEditOpen, isHistoryOpen]);

  const checkHasInvoices = (id: string) => {
    const hasPurchaseInvoices = (purchaseInvoices || []).some((p: any) => p.supplierId === id);
    const hasReturns = (purchaseReturns || []).some((r: any) => r.supplierId === id);
    const hasPayments = (supplierPayments || []).some((pay: any) => pay.supplierId === id);
    return hasPurchaseInvoices || hasReturns || hasPayments;
  };

  const suppliersWithBalance = useMemo(() => {
    return suppliers.map((supplier: Supplier) => {
        let balance = Number(supplier.openingBalance) || 0;

        // 1. Debits: Purchase Invoices (Add unpaid parts)
        const supplierPurchases = (purchaseInvoices || []).filter((p: any) => p.supplierId === supplier.id);
        supplierPurchases.forEach((p: any) => {
            balance += (Number(p.total) - Number(p.paidAmount || 0));
        });

        // 2. Credits: Standalone Payments (NOT linked to an invoice)
        const standalonePayments = (supplierPayments || []).filter((p: any) => p.supplierId === supplier.id && !p.invoiceId);
        standalonePayments.forEach((p: any) => {
            balance -= Number(p.amount);
        });

        // 3. Credits: Returns (Net value not refunded in cash)
        const filteredReturns = (purchaseReturns || []).filter((r: any) => r.supplierId === supplier.id);
        filteredReturns.forEach((r: any) => {
            balance -= (Number(r.total) - Number(r.paidAmount || 0));
        });

        return { ...supplier, currentBalance: balance };
    });
  }, [suppliers, purchaseInvoices, supplierPayments, purchaseReturns]);

  const handleSave = (supplier: Supplier) => {
    if (supplier.id) {
      dbAction('suppliers', 'update', { id: supplier.id, data: supplier });
      toast({ title: "تم التحديث بنجاح" });
    } else {
      dbAction('suppliers', 'add', supplier);
      toast({ title: "تمت إضافة المورد بنجاح" });
    }
  };

  const handleDelete = (id: string) => {
    if (checkHasInvoices(id)) {
        toast({
            variant: "destructive",
            title: "لا يمكن الحذف",
            description: "لا يمكن حذف هذا المورد لوجود حركات شراء مرتبطة به.",
        });
        return;
    }
    dbAction('suppliers', 'remove', { id });
    toast({ title: "تم الحذف بنجاح" });
  };

  const handleEditClick = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setTimeout(() => setIsEditOpen(true), 150);
  };

  const handleHistoryClick = (supplier: any) => {
      setHistorySupplier(supplier);
      setTimeout(() => setIsHistoryOpen(true), 150);
  };

  return (
    <>
      <PageHeader title="إدارة الموردين">
        <AddEntityDialog
          title="إضافة مورد جديد"
          description="أدخل تفاصيل المورد الجديد هنا."
          triggerButton={
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              إضافة مورد
            </Button>
          }
        >
          {({onClose}) => <SupplierForm onSave={handleSave} onClose={onClose} hasInvoices={false} />}
        </AddEntityDialog>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
          <Card>
            <CardHeader>
              <CardTitle>الموردون</CardTitle>
              <CardDescription>إدارة الموردين والأرصدة المستحقة.</CardDescription>
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
                                  <TableHead>اسم المورد</TableHead>
                                  <TableHead className="hidden sm:table-cell">جهة الاتصال</TableHead>
                                  <TableHead className="text-center">الأصناف</TableHead>
                                  <TableHead className="text-center">الرصيد الحالي</TableHead>
                                  <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {suppliersWithBalance.map((supplier: any) => (
                                  <TableRow key={supplier.id}>
                                      <TableCell className="font-medium">{supplier.name}</TableCell>
                                      <TableCell className="hidden sm:table-cell">{supplier.contact}</TableCell>
                                      <TableCell className="text-center">
                                          <Button variant="ghost" size="sm" onClick={() => setViewItemsSupplier(supplier)}>
                                              <List className="h-4 w-4 ml-2" />
                                              <Badge variant="secondary">{supplier.items?.length || 0}</Badge>
                                          </Button>
                                      </TableCell>
                                      <TableCell className="text-center font-bold text-primary">{supplier.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
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
                                                      <DropdownMenuItem onSelect={() => handleHistoryClick(supplier)}>
                                                          <History className="ml-2 h-4 w-4 text-amber-600" /> سجل توريد الأصناف
                                                      </DropdownMenuItem>
                                                      <DropdownMenuSeparator />
                                                      <DropdownMenuItem onSelect={() => handleEditClick(supplier)}>
                                                          <Edit className="ml-2 h-4 w-4" /> تعديل البيانات
                                                      </DropdownMenuItem>
                                                      <AlertDialogTrigger asChild>
                                                          <DropdownMenuItem className="text-destructive">
                                                              <Trash2 className="ml-2 h-4 w-4" /> حذف المورد
                                                          </DropdownMenuItem>
                                                      </AlertDialogTrigger>
                                                  </DropdownMenuContent>
                                              </DropdownMenu>
                                              <AlertDialogContent>
                                                  <AlertDialogHeader>
                                                  <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                                  <AlertDialogDescription>هل أنت متأكد من حذف المورد؟</AlertDialogDescription>
                                                  </AlertDialogHeader>
                                                  <AlertDialogFooter>
                                                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                  <AlertDialogAction onClick={() => handleDelete(supplier.id!)}>متابعة</AlertDialogAction>
                                                  </AlertDialogFooter>
                                              </AlertDialogContent>
                                          </AlertDialog>
                                      </TableCell>
                                  </TableRow>
                              ))}
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
            <DialogTitle>تعديل بيانات المورد</DialogTitle>
            <DialogDescription>قم بتحديث تفاصيل المورد هنا.</DialogDescription>
          </DialogHeader>
          {editingSupplier && (
            <SupplierForm 
                supplier={editingSupplier} 
                onSave={handleSave} 
                onClose={() => setIsEditOpen(false)} 
                hasInvoices={checkHasInvoices(editingSupplier.id!)} 
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewItemsSupplier} onOpenChange={(open) => !open && setViewItemsSupplier(null)}>
          <SupplierItemsDialog supplier={viewItemsSupplier} allItems={items} />
      </Dialog>

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          {historySupplier && <SupplierPurchaseHistoryDialog supplier={historySupplier} onClose={() => setIsHistoryOpen(false)} />}
      </Dialog>
    </>
  );
}
