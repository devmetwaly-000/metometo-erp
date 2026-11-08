

"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, Printer, Save, Info, Loader2 } from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter, useParams } from 'next/navigation';
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/auth-context";
import { Combobox } from "@/components/ui/combobox";


interface InvoiceItem {
  id: string;
  name: string;
  qty: number;
  cost: number;
  sellingPrice: number;
  total: number;
  unit: string;
  code?: string;
  expiryDate?: string;
}

interface Item {
    id: string;
    name: string;
    unit: string;
    price?: number;
    cost?: number;
}

interface Supplier {
    id: string;
    name: string;
}

interface Warehouse {
    id: string;
    name: string;
}

interface CashAccount {
    id: string;
    name: string;
    openingBalance: number;
}

export default function EditPurchaseInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const invoiceId = params.id as string;
  
  const { 
    items: availableItems, 
    suppliers, 
    warehouses, 
    cashAccounts, 
    purchaseInvoices,
    dbAction, 
    getNextId, 
    loading,
    customerPayments,
    salesInvoices,
    exceptionalIncomes,
    treasuryTransactions,
    expenses,
    supplierPayments,
    employeeAdvances,
    profitDistributions,
  } = useData();

  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [newItem, setNewItem] = useState({ id: "", name: "", qty: 1, cost: 0, sellingPrice: 0, unit: "", expiryDate: "" });
  const [subtotal, setSubtotal] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [total, setTotal] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [applyTax, setApplyTax] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [paidFromAccountId, setPaidFromAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');

  useEffect(() => {
    if (purchaseInvoices.length > 0 && invoiceId) {
        const foundInvoice = purchaseInvoices.find((inv: any) => inv.id === invoiceId);
        if (foundInvoice) {
            setInvoice(foundInvoice);
            setItems(foundInvoice.items.map((item: any, index: number) => ({...item, id: `${item.id}-${index}` }))); // Ensure unique IDs for local state
            setDiscount(foundInvoice.discount || 0);
            setPaidAmount(foundInvoice.paidAmount || 0);
            setPaidFromAccountId(foundInvoice.paidFromAccountId || "");
            setNotes(foundInvoice.notes || "");
            setBatchNumber(foundInvoice.batchNumber || "");
            setInvoiceDate(new Date(foundInvoice.date).toISOString().split('T')[0]);
            setDueDate(new Date(foundInvoice.dueDate || foundInvoice.date).toISOString().split('T')[0]);
        }
    }
  }, [purchaseInvoices, invoiceId]);

  const itemsForCombobox = React.useMemo(() => {
    return availableItems.map((item: Item) => ({ value: item.id, label: item.name }));
  }, [availableItems]);
  
  const suppliersForCombobox = React.useMemo(() => {
    return suppliers.map((s: Supplier) => ({ value: s.id, label: s.name }));
  }, [suppliers]);
  
   const accountBalances = useMemo(() => {
        const balances = new Map<string, number>();
        cashAccounts.forEach((account:any) => {
            let balance = account.openingBalance || 0;
            // Add other transactions to calculate current balance
             customerPayments.filter((p: any) => p.paidToAccountId === account.id).forEach((p:any) => balance += p.amount);
             salesInvoices.filter((s:any) => s.status === 'approved' && s.paidToAccountId === account.id).forEach((s:any) => balance += (s.paidAmount || 0));
             exceptionalIncomes.filter((i: any) => i.paidToAccountId === account.id).forEach((i:any) => balance += i.amount);
             treasuryTransactions.filter((tx:any) => tx.accountId === account.id && tx.type === 'deposit').forEach((tx:any) => balance += tx.amount);
             expenses.filter((ex: any) => ex.paidFromAccountId === account.id).forEach((ex:any) => balance -= ex.amount);
             supplierPayments.filter((sp: any) => sp.supplierId !== invoiceId && sp.paidFromAccountId === account.id).forEach((sp:any) => balance -= sp.amount);
             employeeAdvances.filter((ea: any) => ea.paidFromAccountId === account.id).forEach((ea:any) => balance -= ea.amount);
             profitDistributions.filter((pd: any) => pd.paidFromAccountId === account.id).forEach((pd:any) => balance -= pd.amount);
             treasuryTransactions.filter((tx:any) => tx.accountId === account.id && tx.type === 'withdrawal').forEach((tx:any) => balance -= tx.amount);
            balances.set(account.id, balance);
        });
        return balances;
    }, [cashAccounts, customerPayments, salesInvoices, exceptionalIncomes, treasuryTransactions, expenses, supplierPayments, employeeAdvances, profitDistributions, invoiceId]);
    
    const cashAccountOptions = React.useMemo(() => {
        return cashAccounts.map((acc: CashAccount) => ({
            value: acc.id,
            label: `${acc.name} (الرصيد: ${(accountBalances.get(acc.id) || 0).toLocaleString()})`
        }))
    }, [cashAccounts, accountBalances]);
    
    const isBalanceSufficient = useMemo(() => {
        if (paidAmount <= 0) return true;
        if (!paidFromAccountId) return false;
        const balance = accountBalances.get(paidFromAccountId) || 0;
        return balance >= paidAmount;
    }, [paidAmount, paidFromAccountId, accountBalances]);


  useEffect(() => {
    const newSubtotal = items.reduce((acc, item) => acc + item.total, 0);
    const newTax = applyTax ? (newSubtotal - discount) * 0.14 : 0;
    const newTotal = newSubtotal - discount + newTax;
    setSubtotal(newSubtotal);
    setTax(newTax);
    setTotal(newTotal);
  }, [items, discount, applyTax]);

  const handleAddItem = () => {
    if (!newItem.id || newItem.qty <= 0 || newItem.cost <= 0) return;
    const selectedItem = availableItems.find((i: Item) => i.id === newItem.id);
    if (!selectedItem) return;

    setItems([
      ...items,
      { 
        ...newItem,
        id: `${selectedItem.id}-${Date.now()}`,
        name: selectedItem.name,
        total: newItem.qty * newItem.cost,
        unit: selectedItem.unit,
      },
    ]);
    setNewItem({ id: "", name: "", qty: 1, cost: 0, sellingPrice: 0, unit: "", expiryDate: "" });
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };
  
  const handleItemSelect = (itemId: string) => {
    const selectedItem = availableItems.find((i: Item) => i.id === itemId);
    if (selectedItem) {
        setNewItem({
            ...newItem,
            id: itemId,
            cost: selectedItem.cost || 0,
            sellingPrice: selectedItem.price || 0,
            unit: selectedItem.unit,
        });
    }
  }

  const handleSaveInvoice = async () => {
       if (!isBalanceSufficient) {
             toast({ variant: "destructive", title: "رصيد غير كافٍ", description: "رصيد الخزينة المحدد لا يكفي لتغطية المبلغ المدفوع." });
            return;
        }

        setIsSaving(true);
        try {
            const invoiceItems = items.map(item => {
                const originalItemId = item.id.split('-')[0];
                return {
                    id: originalItemId,
                    name: item.name,
                    code: item.code,
                    unit: item.unit,
                    qty: item.qty,
                    cost: item.cost,
                    sellingPrice: item.sellingPrice,
                    expiryDate: item.expiryDate,
                    total: item.total,
                }
            });
            
            const now = new Date();
            const selectedDate = new Date(invoiceDate);
            const finalInvoiceDate = new Date(
                selectedDate.getFullYear(),
                selectedDate.getMonth(),
                selectedDate.getDate(),
                now.getHours(),
                now.getMinutes(),
                now.getSeconds()
            );


            const invoiceData = {
                ...invoice, // Keep original data like invoiceNumber
                date: finalInvoiceDate.toISOString(),
                dueDate: new Date(dueDate).toISOString(),
                items: invoiceItems,
                subtotal,
                discount,
                tax,
                total,
                paidAmount,
                paidFromAccountId,
                notes,
                batchNumber: batchNumber,
            };

            await dbAction('purchaseInvoices', 'update', {id: invoiceId, data: invoiceData});
            
            // Update item master data with new cost and selling price
            for (const item of items) {
                const originalItemId = item.id.split('-')[0];
                await dbAction('items', 'update', {
                    id: originalItemId,
                    data: {
                        cost: item.cost, 
                        price: item.sellingPrice,
                    }
                });
            }
            
            toast({
                title: 'تم التحديث بنجاح',
                description: `تم تحديث فاتورة الشراء رقم ${invoice.invoiceNumber}.`
            });
            router.push('/purchases/invoices/list');
        } catch (error) {
            console.error("Failed to update purchase invoice:", error);
            toast({
                variant: 'destructive',
                title: 'خطأ',
                description: 'فشل تحديث الفاتورة. الرجاء المحاولة مرة أخرى.'
            });
        } finally {
            setIsSaving(false);
        }
  }

  if (loading || !invoice) {
    return <div className="flex flex-1 justify-center items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }
  
  return (
    <>
      <PageHeader title={`تعديل فاتورة شراء: ${invoice.invoiceNumber}`} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 printable-area">
        <Card>
          <CardHeader>
             <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                 <div>
                    <CardTitle>فاتورة شراء</CardTitle>
                 </div>
                 <div className="text-left text-sm md:text-base grid grid-cols-2 gap-x-4 gap-y-1">
                    <Label className="font-bold">رقم الفاتورة:</Label>
                    <span className="font-mono">{invoice.invoiceNumber}</span>
                    <Label htmlFor="invoiceDate" className="font-bold">تاريخ الفاتورة:</Label>
                    <Input id="invoiceDate" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="h-8"/>
                    <Label htmlFor="dueDate" className="font-bold">تاريخ الاستحقاق:</Label>
                    <Input id="dueDate" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8"/>
                </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <>
                <div className="grid md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                        <Label>المورد</Label>
                        <Input value={invoice.supplierName} disabled />
                    </div>
                    <div className="space-y-2">
                        <Label>المخزن المستلم</Label>
                        <Input value={warehouses.find((w: Warehouse) => w.id === invoice.warehouseId)?.name} disabled />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="batch-number">رقم التشغيلة (Batch)</Label>
                        <Input id="batch-number" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} placeholder="اختياري" />
                    </div>
                </div>

                
                <div>
                <Label>بنود الفاتورة</Label>
                <div className="w-full overflow-auto border rounded-lg">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead className="w-[30%]">الصنف</TableHead>
                            <TableHead className="text-center">كمية</TableHead>
                            <TableHead className="text-center">سعر الشراء (التكلفة)</TableHead>
                            <TableHead className="text-center">سعر البيع المقترح</TableHead>
                            <TableHead className="text-center">تاريخ الصلاحية</TableHead>
                            <TableHead className="text-center">الإجمالي</TableHead>
                            <TableHead className="text-center w-[100px] no-print">الإجراء</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {items.map((item, index) => (
                            <TableRow key={item.id}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="text-center">{item.qty}</TableCell>
                                <TableCell className="text-center">ج.م {item.cost.toFixed(2)}</TableCell>
                                <TableCell className="text-center bg-green-50 dark:bg-green-900/20">
                                     <Input 
                                        type="number" 
                                        value={item.sellingPrice} 
                                        onChange={e => {
                                            const newItems = [...items];
                                            newItems[index].sellingPrice = parseFloat(e.target.value) || 0;
                                            setItems(newItems);
                                        }} 
                                        className="text-center"
                                     />
                                </TableCell>
                                <TableCell>
                                     <Input 
                                        type="date" 
                                        value={item.expiryDate || ''} 
                                        onChange={e => {
                                            const newItems = [...items];
                                            newItems[index].expiryDate = e.target.value;
                                            setItems(newItems);
                                        }} 
                                        className="text-center"
                                     />
                                </TableCell>
                                <TableCell className="text-center">ج.م {item.total.toFixed(2)}</TableCell>
                                <TableCell className="text-center no-print">
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        <TableRow className="no-print bg-muted/20">
                            <TableCell className="p-2">
                                 <Combobox
                                    options={itemsForCombobox}
                                    value={newItem.id}
                                    onValueChange={handleItemSelect}
                                    placeholder="اختر صنفًا..."
                                    emptyMessage="لا توجد أصناف."
                                />
                            </TableCell>
                            <TableCell className="p-2">
                                <Input type="number" placeholder="الكمية" value={newItem.qty} onChange={e => setNewItem({...newItem, qty: parseInt(e.target.value) || 1})} className="text-center" />
                            </TableCell>
                            <TableCell className="p-2">
                                <Input type="number" placeholder="التكلفة" value={newItem.cost} onChange={e => setNewItem({...newItem, cost: parseFloat(e.target.value) || 0})} className="text-center" />
                            </TableCell>
                             <TableCell className="p-2 bg-green-50 dark:bg-green-900/20">
                                <Input type="number" placeholder="البيع" value={newItem.sellingPrice} onChange={e => setNewItem({...newItem, sellingPrice: parseFloat(e.target.value) || 0})} className="text-center" />
                            </TableCell>
                             <TableCell className="p-2">
                                <Input type="date" value={newItem.expiryDate} onChange={e => setNewItem({...newItem, expiryDate: e.target.value})} className="text-center" />
                            </TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-center p-2">
                                <Button onClick={handleAddItem} size="sm" disabled={!newItem.id}>
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
                       <Alert variant="destructive">
                            <Info className="h-4 w-4" />
                            <AlertTitle>تنبيه</AlertTitle>
                            <AlertDescription>
                                أي تعديل على هذه الفاتورة سيؤثر على قيود اليومية والتقارير المالية المرتبطة بها.
                            </AlertDescription>
                        </Alert>
                    </div>
                    <div className="w-full md:max-w-sm space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span>الإجمالي الفرعي</span>
                                <span>ج.م {subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span>الخصم</span>
                                <Input type="number" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} className="h-8 max-w-[120px] text-left" placeholder="0.00"/>
                            </div>
                            <div className="flex justify-between items-center">
                                <span>تطبيق ضريبة القيمة المضافة (14%)</span>
                                <Switch checked={applyTax} onCheckedChange={setApplyTax} />
                            </div>
                            <div className="flex justify-between">
                                <span>ضريبة القيمة المضافة (14%)</span>
                                <span>ج.م {tax.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-base border-t pt-2">
                                <span>الإجمالي الكلي</span>
                                <span>ج.م {total.toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="space-y-2 border-t pt-4">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="paidAmount" className="font-semibold">المبلغ المدفوع</Label>
                                <Input id="paidAmount" type="number" value={paidAmount} onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)} className="h-8 max-w-[120px] text-left" placeholder="0.00"/>
                            </div>
                             {paidAmount > 0 && <div className="space-y-2">
                                <Label htmlFor="paidFromAccount">الدفع من</Label>
                                <Combobox
                                    options={cashAccountOptions}
                                    value={paidFromAccountId}
                                    onValueChange={setPaidFromAccountId}
                                    placeholder="اختر حساب الدفع..."
                                    emptyMessage="لم يتم العثور على حساب."
                                />
                                {!isBalanceSufficient && paidFromAccountId && <p className="text-xs text-destructive">رصيد هذا الحساب غير كافٍ.</p>}
                            </div>}
                            <div className="flex justify-between font-bold text-base text-destructive">
                                <span>المبلغ المتبقي</span>
                                <span>ج.م {(total - paidAmount).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="notes">ملاحظات</Label>
                    <Textarea id="notes" placeholder="أضف أي ملاحظات هنا..." value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
            </>
          </CardContent>
          <CardFooter className="flex justify-between no-print">
            <Button variant="outline" onClick={() => router.push('/purchases/invoices/list')}>
                إلغاء
            </Button>
            <Button size="lg" disabled={isSaving || !isBalanceSufficient} onClick={handleSaveInvoice}>
                 {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                {isSaving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </CardFooter>
        </Card>
      </main>
    </>
  );
}

    
