
"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Save, Loader2, Info, Wallet, AlertTriangle } from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter, useSearchParams } from 'next/navigation';
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/auth-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ReturnItem {
  id: string; 
  name: string;
  qty: number;
  price: number;
  cost: number; 
  total: number;
  unit: string;
  code?: string;
  uniqueId: string;
  soldQty: number;
  returnedBefore: number;
}

export default function NewSalesReturnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const { 
    salesReturns, cashAccounts, customerPayments, salesInvoices: allSales, posSales, posReturns, 
    exceptionalIncomes, treasuryTransactions, expenses, supplierPayments, employeeAdvances, 
    profitDistributions, dbAction, getNextId, loading, items: allItemsData, customers: allCustomersData, warehouses: allWarehousesData
  } = useData();
  
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(searchParams.get('invoiceId'));
  const [items, setItems] = useState<ReturnItem[]>([]);
  
  const [subtotal, setSubtotal] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [total, setTotal] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paidFromAccountId, setPaidFromAccountId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [returnDate, setReturnDate] = useState('');

  const [filters, setFilters] = useState({
    customerId: '',
    warehouseId: '',
    date: ''
  });
  
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setReturnDate(today);
  }, []);

  const filteredInvoices = useMemo(() => {
    if (!allSales) return [];
    return allSales.filter((inv: any) => {
        const invDate = new Date(inv.date).toISOString().split('T')[0];
        const filterDate = filters.date ? new Date(filters.date).toISOString().split('T')[0] : '';
        
        return (filters.customerId && filters.customerId !== 'all' ? inv.customerId === filters.customerId : true) &&
               (filters.warehouseId && filters.warehouseId !== 'all' ? inv.warehouseId === filters.warehouseId : true) &&
               (filters.date ? invDate === filterDate : true);
    });
  }, [allSales, filters]);

  const invoiceOptions = useMemo(() => {
      return filteredInvoices.map((inv: any) => {
          // Calculate if fully or partially returned
          const previousReturns = (salesReturns || []).filter((r: any) => String(r.originalInvoiceId) === String(inv.id));
          const totalSold = (inv.items || []).reduce((acc: number, item: any) => acc + item.qty, 0);
          const totalReturned = previousReturns.reduce((acc: number, r: any) => {
              return acc + (r.items || []).reduce((subAcc: number, item: any) => subAcc + item.qty, 0);
          }, 0);

          let statusLabel = '';
          let isFull = false;
          let isPartial = false;

          if (totalReturned >= totalSold && totalSold > 0) {
              statusLabel = '[مرتجعة كلياً]';
              isFull = true;
          } else if (totalReturned > 0) {
              statusLabel = `[مرتجع جزئي: ${totalReturned}/${totalSold}]`;
              isPartial = true;
          }

          return {
              value: inv.id,
              label: `${inv.invoiceNumber} - ${inv.customerName} ${statusLabel}`,
              isFull,
              isPartial
          };
      });
  }, [filteredInvoices, salesReturns]);

  const customerOptions = useMemo(() => ([{value: 'all', label: 'كل العملاء'}, ...allCustomersData.map((c:any) => ({value: c.id, label: c.name}))]), [allCustomersData]);
  const warehouseOptions = useMemo(() => ([{value: 'all', label: 'كل المخازن'}, ...allWarehousesData.map((w:any) => ({value: w.id, label: w.name}))]), [allWarehousesData]);

  useEffect(() => {
    if (selectedInvoiceId && allSales.length > 0 && allItemsData.length > 0) {
      const invoice = allSales.find((inv: any) => inv.id === selectedInvoiceId);
      if (invoice) {
        setCustomerId(invoice.customerId);
        setWarehouseId(invoice.warehouseId);

        const previousReturns = (salesReturns || []).filter((r: any) => String(r.originalInvoiceId) === String(selectedInvoiceId));
        const prevReturnedByItem = new Map<string, number>();
        previousReturns.forEach((r: any) => {
            (r.items || []).forEach((it: any) => {
                const key = String(it.id || it.itemId);
                prevReturnedByItem.set(key, (prevReturnedByItem.get(key) || 0) + (it.qty || 0));
            });
        });

        const invoiceItems = invoice.items.map((item: any, index: any) => {
          const master = allItemsData.find((i: any) => i.id === item.id);
          const returnedBefore = prevReturnedByItem.get(String(item.id)) || 0;
          const remaining = Math.max(0, item.qty - returnedBefore);

          return {
            id: item.id,
            name: item.name,
            qty: remaining, 
            soldQty: item.qty,
            returnedBefore: returnedBefore,
            price: item.price,
            cost: item.cost || master?.cost || 0,
            total: remaining * item.price,
            unit: master?.unit || 'قطعة',
            code: master?.code,
            uniqueId: `${item.id}-${Date.now()}-${index}`
          };
        });
        setItems(invoiceItems.filter((i: any) => i.soldQty > i.returnedBefore));
      }
    } else {
        setItems([]);
        setCustomerId("");
        setWarehouseId("");
    }
  }, [selectedInvoiceId, allSales, allItemsData, salesReturns]);
  
  useEffect(() => {
    const newSubtotal = items.reduce((acc, item) => acc + item.total, 0);
    setSubtotal(newSubtotal);
    setTotal(newSubtotal - discount);
  }, [items, discount]);

  const currentCustomerBalance = useMemo(() => {
    if (!customerId) return 0;
    const c = allCustomersData.find((cust: any) => cust.id === customerId);
    if (!c) return 0;

    let balance = Number(c.openingBalance) || 0;
    
    allSales.filter((inv: any) => inv.customerId === customerId && inv.status === 'approved')
        .forEach((inv: any) => {
            balance += (Number(inv.total) - Number(inv.paidAmount || 0));
        });

    posSales.filter((sale: any) => sale.customerId === customerId)
        .forEach((sale: any) => {
            balance += (Number(sale.total) - Number(sale.paidAmount || 0));
        });

    customerPayments.filter((p: any) => p.customerId === customerId && !p.invoiceId)
        .forEach((p: any) => {
            balance -= Number(p.amount);
        });

    salesReturns.filter((r: any) => r.customerId === customerId)
        .forEach((r: any) => {
            balance -= Number(r.total);
        });
    
    posReturns.filter((r: any) => r.customerId === customerId)
        .forEach((r: any) => {
            balance -= Number(r.total);
        });

    return balance;
  }, [customerId, allCustomersData, allSales, posSales, posReturns, customerPayments, salesReturns]);

  const accountBalances = useMemo(() => {
    const balances = new Map<string, number>();
    cashAccounts.forEach((account: any) => {
        let balance = account.openingBalance || 0;
        customerPayments.forEach((p:any) => { if(p.paidToAccountId === account.id) balance += p.amount });
        allSales.forEach((s: any) => { if (s.status === 'approved' && s.paidToAccountId === account.id) balance += (s.paidAmount || 0) });
        posSales.forEach((sale: any) => {
            if (account.warehouseId && sale.warehouseId === account.warehouseId) {
                const totalPaidOnSale = sale.paidAmount ?? sale.payments?.reduce((sum: number, p: any) => sum + p.amount, 0) ?? sale.total;
                balance += totalPaidOnSale;
            }
        });
        exceptionalIncomes.forEach((i:any) => { if (i.paidToAccountId === account.id) balance += i.amount });
        treasuryTransactions.forEach((tx: any) => { if (tx.accountId === account.id && tx.type === 'deposit') balance += tx.amount });
        expenses.forEach((ex: any) => { if (ex.paidFromAccountId === account.id) balance -= ex.amount });
        supplierPayments.forEach((sp: any) => { if (sp.paidFromAccountId === account.id) balance -= sp.amount });
        employeeAdvances.forEach((ea: any) => { if (ea.paidFromAccountId === account.id) balance -= ea.amount });
        profitDistributions.forEach((pd: any) => { if (pd.paidFromAccountId === account.id) balance -= pd.amount });
        treasuryTransactions.forEach((tx: any) => { if (tx.accountId === account.id && tx.type === 'withdrawal') balance -= tx.amount });
        balances.set(account.id, balance);
    });
    return balances;
  }, [cashAccounts, customerPayments, allSales, exceptionalIncomes, treasuryTransactions, posSales, expenses, supplierPayments, employeeAdvances, profitDistributions]);

  const availableCashAccounts = useMemo(() => {
    if (warehouseId) {
        const branchAccount = cashAccounts.find((acc: any) => acc.warehouseId === warehouseId);
        if (branchAccount) return [branchAccount];
    }
    return cashAccounts.filter((acc: any) => !acc.warehouseId);
  }, [warehouseId, cashAccounts]);

  const cashAccountOptions = useMemo(() => {
    return availableCashAccounts.map((acc: any) => ({
        value: acc.id,
        label: `${acc.name} (الرصيد: ${(accountBalances.get(acc.id) || 0).toLocaleString()})`
    }));
  }, [availableCashAccounts, accountBalances]);
  
  const handleRemoveItem = (uniqueId: string) => {
    setItems(items.filter((item) => item.uniqueId !== uniqueId));
  };
  
  const handleSaveReturn = async () => {
    if (!customerId || !warehouseId || items.length === 0) {
        toast({ variant: 'destructive', title: 'بيانات ناقصة', description: 'يرجى اختيار العميل والمخزن وإضافة صنف واحد على الأقل.' });
        return;
    }

    if (paidAmount > 0 && !paidFromAccountId) {
        toast({ variant: 'destructive', title: 'بيانات ناقصة', description: 'يرجى اختيار الخزينة التي تم دفع المبلغ منها.' });
        return;
    }

    setIsSaving(true);
    try {
        const receiptNumber = `م-ب-${await getNextId('salesReturn')}`;
        
        // Fix: Include current time
        const now = new Date();
        const selectedDate = new Date(returnDate);
        const finalDate = new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
            now.getHours(),
            now.getMinutes(),
            now.getSeconds()
        );

        const returnData = {
            date: finalDate.toISOString(),
            customerId,
            warehouseId,
            items: items.map(item => ({
                id: item.id,
                name: item.name,
                qty: item.qty,
                price: item.price,
                cost: item.cost, 
                total: item.total,
                code: item.code,
            })),
            total,
            paidAmount: Number(paidAmount) || 0,
            paidFromAccountId: paidAmount > 0 ? paidFromAccountId : null,
            notes,
            receiptNumber,
            originalInvoiceId: selectedInvoiceId,
            createdById: user?.id,
            createdByName: user?.name,
        };
        await dbAction('salesReturns', 'add', returnData);
        toast({ title: 'تم الحفظ بنجاح', description: `تم حفظ مرتجع المبيعات برقم: ${receiptNumber}` });
        router.push('/sales/returns');
    } catch (error) {
        toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ مرتجع المبيعات.' });
    } finally {
        setIsSaving(false);
    }
  }

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({...prev, [key]: value}));
  };

  const ReturnForm = () => (
    <>
        <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-2">
                <Label htmlFor="customer">العميل</Label>
                <div className="flex flex-col gap-2">
                    <Input value={allCustomersData.find((c: any) => c.id === customerId)?.name} disabled className="bg-muted" />
                    <div className="flex items-center gap-2 p-2 rounded bg-muted/50 border">
                        <Wallet className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold">المديونية الحالية:</span>
                        <Badge variant={currentCustomerBalance > 0 ? "destructive" : "default"} className="text-xs">
                            {Math.abs(currentCustomerBalance).toLocaleString()} ج.م 
                            {currentCustomerBalance > 0 ? " (عليه)" : currentCustomerBalance < 0 ? " (له)" : ""}
                        </Badge>
                    </div>
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="warehouse">إلى مخزن</Label>
                <Input value={allWarehousesData.find((w: any) => w.id === warehouseId)?.name} disabled className="bg-muted" />
            </div>
             <div className="space-y-2">
                <Label htmlFor="return-date">تاريخ المرتجع</Label>
                <Input id="return-date" type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
            </div>
        </div>

        <div>
        <Label className="mb-2 block font-bold">الأصناف المرتجعة</Label>
        <div className="w-full overflow-auto border rounded-lg">
            <Table>
                <TableHeader>
                <TableRow className="bg-muted/50">
                    <TableHead className="w-[30%]">الصنف</TableHead>
                    <TableHead className="text-center">المباع</TableHead>
                    <TableHead className="text-center">المرتجع سابقاً</TableHead>
                    <TableHead className="text-center">الكمية المراد إرجاعها</TableHead>
                    <TableHead className="text-center">سعر الوحدة</TableHead>
                    <TableHead className="text-center">الإجمالي</TableHead>
                    <TableHead className="text-center w-[100px]">الإجراء</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {items.map((item) => (
                    <TableRow key={item.uniqueId}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-center">{item.soldQty}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{item.returnedBefore}</TableCell>
                    <TableCell><Input type="number" value={item.qty} onChange={e => setItems(items.map(i => i.uniqueId === item.uniqueId ? {...i, qty: Number(e.target.value), total: Number(e.target.value) * i.price} : i))} className="text-center h-8 w-24 mx-auto font-bold" /></TableCell>
                    <TableCell className="text-center">ج.م {item.price.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">ج.م {item.total.toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.uniqueId)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </div>
        </div>
        
        <div className="flex flex-col-reverse md:flex-row justify-between items-start gap-8">
            <div className="w-full md:max-w-sm space-y-2 text-sm mt-4 md:mt-0">
                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>الرد النقدي</AlertTitle>
                    <AlertDescription>
                        إذا قمت برد مبلغ نقدي للعميل، أدخل القيمة أدناه واختر الخزينة. سيتم خصمها من الخزينة ولن تؤثر على رصيد مديونية العميل.
                    </AlertDescription>
                </Alert>
            </div>
            <div className="w-full md:max-w-sm space-y-4">
                <div className="space-y-2">
                    <div className="flex justify-between font-bold text-base border-b pb-2">
                        <span>إجمالي قيمة المرتجع</span>
                        <span className="text-primary">ج.م {total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                        <Label htmlFor="paidAmount" className="font-semibold">المبلغ المردود نقداً</Label>
                        <Input id="paidAmount" type="number" value={paidAmount} onFocus={e => e.target.select()} onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)} className="h-10 text-lg w-32 text-left" />
                    </div>
                    {paidAmount > 0 && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                            <Label htmlFor="paidFromAccount">الصرف من خزينة</Label>
                            <Combobox
                                options={cashAccountOptions}
                                value={paidFromAccountId}
                                onValueChange={setPaidFromAccountId}
                                placeholder="اختر الخزينة..."
                                emptyMessage="لا يوجد خزائن متاحة."
                            />
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-sm text-muted-foreground border-t pt-2">
                        <span>الصافي المضاف لرصيد العميل</span>
                        <span>ج.م {(total - paidAmount).toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات</Label>
            <Textarea id="notes" placeholder="أضف سبب الإرجاع أو أي ملاحظات..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
    </>
  );


  return (
    <>
      <PageHeader title="مرتجع مبيعات جديد" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>إذن مرتجع مبيعات</CardTitle>
            <CardDescription>
              تسجيل الأصناف المرتجعة من العميل وتأثيرها على المخزون وحسابه.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
                 <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : !selectedInvoiceId ? (
                <div className="space-y-6">
                     <Card>
                        <CardHeader>
                            <CardTitle>البحث عن فاتورة البيع الأصلية</CardTitle>
                            <CardDescription>استخدم الفلاتر للبحث عن الفاتورة التي تريد عمل مرتجع لها.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>العميل</Label>
                                    <Combobox options={customerOptions} value={filters.customerId} onValueChange={(v) => handleFilterChange('customerId', v)} placeholder="كل العملاء" emptyMessage="لا يوجد عملاء."/>
                                </div>
                                <div className="space-y-2">
                                    <Label>المخزن</Label>
                                     <Combobox options={warehouseOptions} value={filters.warehouseId} onValueChange={(v) => handleFilterChange('warehouseId', v)} placeholder="كل المخازن" emptyMessage="لا يوجد مخازن."/>
                                </div>
                                <div className="space-y-2">
                                    <Label>التاريخ</Label>
                                    <Input type="date" value={filters.date} onChange={(e) => handleFilterChange('date', e.target.value)} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <div className="space-y-2">
                        <Label htmlFor="invoice-select">اختر فاتورة البيع</Label>
                        <div className="w-full">
                            <Combobox
                                options={invoiceOptions}
                                value={selectedInvoiceId || ''}
                                onValueChange={setSelectedInvoiceId}
                                placeholder="اختر فاتورة..."
                                emptyMessage="لا توجد فواتير تطابق البحث."
                                className="w-full"
                            />
                        </div>
                        {/* Legend for colors */}
                        <div className="flex gap-4 mt-2 text-xs">
                            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-100 border border-red-300 rounded"/> مرتجعة كلياً</div>
                            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-50 border border-amber-200 rounded"/> مرتجعة جزئياً</div>
                        </div>
                    </div>
                </div>
            ) : (
              <ReturnForm />
            )}
          </CardContent>
          {selectedInvoiceId && (
            <CardFooter className="flex justify-between items-center">
                 <Button variant="outline" onClick={() => setSelectedInvoiceId(null)}>
                    اختيار فاتورة أخرى
                </Button>
                <Button size="lg" disabled={loading || isSaving} onClick={handleSaveReturn}>
                    {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                    {isSaving ? 'جارٍ الحفظ...' : 'حفظ المرتجع'}
                </Button>
            </CardFooter>
          )}
        </Card>
      </main>
    </>
  );
}
