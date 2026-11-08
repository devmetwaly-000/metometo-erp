
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
  id: string; // original item id
  name: string;
  qty: number;
  price: number; // This is the cost from the purchase invoice
  total: number;
  unit: string;
  uniqueId: string; // for list key
}

export default function NewPurchaseReturnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const { 
      items: availableItems, 
      suppliers, 
      warehouses, 
      dbAction, 
      getNextId, 
      loading,
      purchaseInvoices: invoices,
      purchaseReturns,
      cashAccounts,
      customerPayments,
      salesInvoices,
      posSales,
      posReturns,
      exceptionalIncomes,
      treasuryTransactions,
      expenses,
      supplierPayments,
      employeeAdvances,
      profitDistributions,
  } = useData();

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(searchParams.get('invoiceId'));
  const [items, setItems] = useState<ReturnItem[]>([]);
  
  const [subtotal, setSubtotal] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [total, setTotal] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0); // Refund received in cash
  const [paidToAccountId, setPaidToAccountId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [returnDate, setReturnDate] = useState('');

  const [filters, setFilters] = useState({
    supplierId: '',
    warehouseId: '',
    date: ''
  });

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setReturnDate(today);
  }, []);

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((inv: any) => {
        const invDate = new Date(inv.date).toISOString().split('T')[0];
        const filterDate = filters.date ? new Date(filters.date).toISOString().split('T')[0] : '';
        
        return (filters.supplierId && filters.supplierId !== 'all' ? inv.supplierId === filters.supplierId : true) &&
               (filters.warehouseId && filters.warehouseId !== 'all' ? inv.warehouseId === filters.warehouseId : true) &&
               (filters.date ? invDate === filterDate : true);
    });
  }, [invoices, filters]);

  const invoiceOptions = useMemo(() => {
      return filteredInvoices.map((inv: any) => ({
          value: inv.id,
          label: `${inv.invoiceNumber} - ${inv.supplierName} - (${new Date(inv.date).toLocaleDateString('ar-EG')})`
      }));
  }, [filteredInvoices]);

  useEffect(() => {
    if (selectedInvoiceId && invoices.length > 0 && availableItems.length > 0) {
      const invoice = invoices.find((inv: any) => inv.id === selectedInvoiceId);
      if (invoice) {
        setSupplierId(invoice.supplierId);
        setWarehouseId(invoice.warehouseId);
        const invoiceItems = invoice.items.map((item: any, index: any) => {
          const itemCost = item.cost || 0;
          return {
            id: item.id,
            name: item.name,
            qty: item.qty,
            price: itemCost, 
            total: item.qty * itemCost,
            unit: availableItems.find((i: any) => i.id === item.id)?.unit || 'قطعة',
            uniqueId: `${item.id}-${Date.now()}-${index}`
          }
        });
        setItems(invoiceItems);
      }
    } else {
        setItems([]);
        setSupplierId("");
        setWarehouseId("");
    }
  }, [selectedInvoiceId, invoices, availableItems]);
  
  useEffect(() => {
    const newSubtotal = items.reduce((acc, item) => acc + item.total, 0);
    setSubtotal(newSubtotal);
    setTotal(newSubtotal - discount);
  }, [items, discount]);

  const currentSupplierBalance = useMemo(() => {
    if (!supplierId) return 0;
    const s = suppliers.find((sup: any) => sup.id === supplierId);
    if (!s) return 0;

    let balance = Number(s.openingBalance) || 0;
    
    invoices.filter((inv: any) => inv.supplierId === supplierId)
        .forEach((inv: any) => {
            balance += (Number(inv.total) - Number(inv.paidAmount || 0));
        });

    supplierPayments.filter((p: any) => p.supplierId === supplierId && !p.invoiceId)
        .forEach((p: any) => {
            balance -= Number(p.amount);
        });

    purchaseReturns.filter((r: any) => r.supplierId === supplierId)
        .forEach((r: any) => {
            balance -= (Number(r.total) - Number(r.paidAmount || 0));
        });

    return balance;
  }, [supplierId, suppliers, invoices, supplierPayments, purchaseReturns]);

  const accountBalances = useMemo(() => {
    const balances = new Map<string, number>();
    cashAccounts.forEach((account: any) => {
        let balance = account.openingBalance || 0;
        customerPayments.forEach((p:any) => { if(p.paidToAccountId === account.id) balance += p.amount });
        salesInvoices.forEach((s: any) => { if (s.status === 'approved' && s.paidToAccountId === account.id) balance += (s.paidAmount || 0) });
        posSales.forEach((s: any) => { if (s.paidToAccountId === account.id) balance += (s.paidAmount || 0) });
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
  }, [cashAccounts, customerPayments, salesInvoices, posSales, exceptionalIncomes, treasuryTransactions, expenses, supplierPayments, employeeAdvances, profitDistributions]);

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
    if (!supplierId || !warehouseId || items.length === 0) {
        toast({ variant: "destructive", title: 'بيانات غير مكتملة', description: 'يرجى اختيار المورد والمخزن وإضافة صنف واحد على الأقل.' });
        return;
    }

    if (paidAmount > 0 && !paidToAccountId) {
        toast({ variant: "destructive", title: 'بيانات ناقصة', description: 'يرجى اختيار الخزينة التي تم استلام المبلغ فيها.' });
        return;
    }

    // Validation: Return qty should not exceed sold qty
    const invoice = invoices.find((inv: any) => inv.id === selectedInvoiceId);
    if (!invoice) return;

    const purchasedQtyByItem = new Map<string, number>();
    invoice.items.forEach((it: any) => purchasedQtyByItem.set(String(it.id), (purchasedQtyByItem.get(String(it.id)) || 0) + it.qty));

    const previousReturns = (purchaseReturns || []).filter((r: any) => r.originalInvoiceId === selectedInvoiceId);
    const prevReturnedByItem = new Map<string, number>();
    previousReturns.forEach((r: any) => r.items.forEach((it: any) => prevReturnedByItem.set(String(it.id), (prevReturnedByItem.get(String(it.id)) || 0) + it.qty)));

    const overReturned = items.some(retItem => {
        const purchased = purchasedQtyByItem.get(String(retItem.id)) || 0;
        const prev = prevReturnedByItem.get(String(retItem.id)) || 0;
        return (prev + retItem.qty) > purchased;
    });

    if (overReturned) {
        toast({ variant: 'destructive', title: 'خطأ في الكمية', description: 'كمية المرتجع تتجاوز الكمية المشتراة في الفاتورة الأصلية.' });
        return;
    }

    setIsSaving(true);
    try {
        const receiptNumber = `م-ش-${await getNextId('purchaseReturn')}`;
        
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
            supplierId,
            warehouseId,
            items: items.map(item => ({
                id: item.id,
                name: item.name,
                qty: item.qty,
                price: item.price,
                total: item.total,
            })),
            subtotal,
            discount,
            total,
            paidAmount: Number(paidAmount) || 0,
            paidToAccountId: paidAmount > 0 ? paidToAccountId : null,
            notes,
            receiptNumber,
            originalInvoiceId: selectedInvoiceId,
            createdById: user?.id,
            createdByName: user?.name,
        };
        await dbAction('purchaseReturns', 'add', returnData);
        toast({ title: 'تم الحفظ بنجاح', description: `تم حفظ مرتجع الشراء برقم: ${receiptNumber}` });
        router.push('/purchases/invoices/list');
    } catch (error) {
        console.error("Failed to save purchase return:", error);
        toast({ variant: "destructive", title: 'خطأ', description: 'فشل حفظ مرتجع الشراء.' });
    } finally {
        setIsSaving(false);
    }
  }

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({...prev, [key]: value}));
  };
  
  const supplierOptions = useMemo(() => ([{value: 'all', label: 'كل الموردين'}, ...suppliers.map((s:any) => ({value: s.id, label: s.name}))]), [suppliers]);
  const warehouseOptions = useMemo(() => ([{value: 'all', label: 'كل المخازن'}, ...warehouses.map((w:any) => ({value: w.id, label: w.name}))]), [warehouses]);


  const ReturnFormUI = () => (
    <>
        <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-2">
                <Label htmlFor="supplier">المورد</Label>
                <div className="flex flex-col gap-2">
                    <Input value={suppliers.find(s => s.id === supplierId)?.name} disabled className="bg-muted" />
                    <div className="flex items-center gap-2 p-2 rounded bg-muted/50 border">
                        <Wallet className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold">المستحقات الحالية:</span>
                        <Badge variant={currentSupplierBalance > 0 ? "default" : "destructive"} className="text-sm">
                            {Math.abs(currentSupplierBalance).toLocaleString()} ج.م 
                            {currentSupplierBalance > 0 ? " (له)" : currentSupplierBalance < 0 ? " (عليه)" : ""}
                        </Badge>
                    </div>
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="warehouse">من مخزن</Label>
                <Input value={warehouses.find(w => w.id === warehouseId)?.name} disabled className="bg-muted" />
            </div>
             <div className="space-y-2">
                <Label htmlFor="return-date">تاريخ المرتجع</Label>
                <Input id="return-date" type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
            </div>
        </div>

        <div>
        <Label>الأصناف المرتجعة</Label>
        <div className="w-full overflow-auto border rounded-lg">
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead className="w-[40%]">الصنف</TableHead>
                    <TableHead className="text-center">الوحدة</TableHead>
                    <TableHead className="text-center">الكمية</TableHead>
                    <TableHead className="text-center">سعر الوحدة</TableHead>
                    <TableHead className="text-center">الإجمالي</TableHead>
                    <TableHead className="text-center w-[100px]">الإجراء</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {items.map((item) => (
                    <TableRow key={item.uniqueId}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="text-center">{item.unit}</TableCell>
                    <TableCell><Input type="number" value={item.qty} onChange={e => setItems(items.map(i => i.uniqueId === item.uniqueId ? {...i, qty: Number(e.target.value), total: Number(e.target.value) * i.price} : i))} className="text-center h-8" /></TableCell>
                    <TableCell className="text-center">ج.م {item.price.toFixed(2)}</TableCell>
                    <TableCell className="text-center">ج.م {item.total.toFixed(2)}</TableCell>
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
                    <AlertTitle>التحصيل النقدي</AlertTitle>
                    <AlertDescription>
                        إذا قمت باستلام مبلغ نقدي من المورد مقابل المرتجع، أدخل القيمة أدناه واختر الخزينة. سيتم إيداعها في الخزينة ولن تؤثر على رصيد مستحقات المورد.
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
                        <Label htmlFor="paidAmount" className="font-semibold">المبلغ المستلم نقداً</Label>
                        <Input id="paidAmount" type="number" value={paidAmount} onFocus={e => e.target.select()} onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)} className="h-10 text-lg w-32 text-left" />
                    </div>
                    {paidAmount > 0 && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                            <Label htmlFor="paidToAccount">إيداع في خزينة</Label>
                            <Combobox
                                options={cashAccountOptions}
                                value={paidToAccountId}
                                onValueChange={setPaidToAccountId}
                                placeholder="اختر الخزينة..."
                                emptyMessage="لا يوجد خزائن متاحة."
                            />
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-sm text-muted-foreground border-t pt-2">
                        <span>الصافي المخصوم من حساب المورد</span>
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
      <PageHeader title="مرتجع شراء جديد" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>إذن مرتجع شراء</CardTitle>
            <CardDescription>
              تسجيل الأصناف المرتجعة للمورد وتأثيرها على المخزون وحساباته.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
                 <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : !selectedInvoiceId ? (
                <div className="space-y-6">
                     <Card>
                        <CardHeader>
                            <CardTitle>البحث عن فاتورة الشراء الأصلية</CardTitle>
                            <CardDescription>استخدم الفلاتر للبحث عن الفاتورة التي تريد عمل مرتجع لها.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>المورد</Label>
                                    <Combobox options={supplierOptions} value={filters.supplierId} onValueChange={(v) => handleFilterChange('supplierId', v)} placeholder="كل الموردين" emptyMessage="لا يوجد موردين." />
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
                        <Label htmlFor="invoice-select">اختر فاتورة الشراء</Label>
                        <Combobox
                            options={invoiceOptions}
                            value={selectedInvoiceId || ''}
                            onValueChange={setSelectedInvoiceId}
                            placeholder="اختر فاتورة..."
                            emptyMessage="لا توجد فواتير تطابق البحث."
                        />
                    </div>
                </div>
            ) : (
              <ReturnFormUI />
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
