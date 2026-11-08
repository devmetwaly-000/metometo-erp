
"use client";

// استيراد المكونات والأدوات اللازمة
import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Loader2, MoreHorizontal, Edit, Trash2, Info, CheckCircle, Wallet } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from '@/contexts/data-provider';
import { Combobox } from '@/components/ui/combobox';
import { calculateAccountBalance } from '@/lib/accounting-utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';
import { cn } from "@/lib/utils";


// تعريف قائمة ثابتة بأنواع المصروفات
const EXPENSE_TYPES = [
    "إيجار", "رواتب", "كهرباء ومياه", "مواصلات", "تسويق وإعلان", "صيانة", "مستلزمات مكتبية", "مصروفات حكومية", "أخرى"
];

// تعريف واجهات البيانات (Interfaces)
interface Expense {
    id?: string;
    date: string;
    amount: number;
    description: string;
    warehouseId?: string;
    expenseType: string;
    paidFromAccountId: string;
    receiptNumber?: string;
    createdById?: string;
    createdByName?: string;
    taxAmount?: number;
    status?: 'paid' | 'pending';
}

interface Warehouse {
    id: string;
    name: string;
}

interface CashAccount {
    id: string;
    name: string;
    warehouseId?: string;
    userId?: string;
    salesRepId?: string;
    openingBalance?: number;
    currentBalance?: number;
}

/**
 * مكون `ExpenseForm`
 * @returns {JSX.Element} نموذج لإضافة أو تعديل مصروف.
 */
const ExpenseForm = ({ expense, onSave, onClose, warehouses, cashAccounts }: { expense?: Expense, onSave: (data: Omit<Expense, 'id'|'receiptNumber'>) => void, onClose: () => void, warehouses: Warehouse[], cashAccounts: CashAccount[] }) => {
    // حالة (state) لتخزين بيانات النموذج
    const [formData, setFormData] = useState<Omit<Expense, 'id'|'receiptNumber'>>(
        expense || { date: new Date().toISOString().split('T')[0], amount: 0, description: "", expenseType: "", paidFromAccountId: "", taxAmount: 0, status: 'paid' }
    );
    
    const [includesTax, setIncludesTax] = useState(!!(expense?.taxAmount && expense.taxAmount > 0));
    const [isPending, setIsPending] = useState(expense?.status === 'pending');

    // حالة لتخزين الحسابات النقدية المتاحة بناءً على الفرع المحدد
    const [availableCashAccounts, setAvailableCashAccounts] = useState<CashAccount[]>([]);
    const { toast } = useToast();
    const { user } = useAuth();


    // `useEffect` لتحديث الحسابات النقدية المتاحة عند تغيير الفرع المحدد.
    useEffect(() => {
        let filtered: CashAccount[] = [];
        
        // استثناء عهد المناديب دائماً من المصروفات الإدارية
        const nonRepAccounts = cashAccounts.filter(acc => !acc.userId && !acc.salesRepId);

        if (formData.warehouseId && formData.warehouseId !== 'none') {
            // إذا تم تحديد فرع، نحاول إيجاد خزينته أولاً
            const branchCashAccount = nonRepAccounts.find((acc: CashAccount) => acc.warehouseId === formData.warehouseId);
            if (branchCashAccount) {
                // إذا وجدت خزينة للفرع، نضعها في المقدمة ونضيف باقي الخزائن العامة كبديل
                filtered = [branchCashAccount, ...nonRepAccounts.filter(acc => !acc.warehouseId)];
            } else {
                // إذا لم يكن للفرع خزينة، نعرض كافة الخزائن العامة والبنوك
                filtered = nonRepAccounts.filter((acc: CashAccount) => !acc.warehouseId);
            }
        } else {
            // المصروفات العامة تظهر الخزائن الرئيسية والبنوك فقط
            filtered = nonRepAccounts.filter((acc: CashAccount) => !acc.warehouseId);
        }
        
        setAvailableCashAccounts(filtered);

        // منطق التحديد التلقائي
        if (filtered.length > 0) {
            if (!formData.paidFromAccountId || !filtered.find(a => a.id === formData.paidFromAccountId)) {
                if (filtered.length === 1) {
                    setFormData(prev => ({...prev, paidFromAccountId: filtered[0].id}));
                }
            }
        } else {
            setFormData(prev => ({...prev, paidFromAccountId: ''}));
        }
    }, [formData.warehouseId, cashAccounts]);

    useEffect(() => {
        if (includesTax && formData.amount) {
            const tax = formData.amount - (formData.amount / 1.14);
            setFormData(prev => ({ ...prev, taxAmount: tax }));
        } else {
            setFormData(prev => ({ ...prev, taxAmount: 0 }));
        }
    }, [formData.amount, includesTax]);


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ ...formData, amount: Number(formData.amount), status: isPending ? 'pending' : 'paid' });
        if (!expense) { 
            setFormData({ date: new Date().toISOString().split('T')[0], amount: 0, description: "", expenseType: "", paidFromAccountId: "", taxAmount: 0, status: 'paid' });
            setIncludesTax(false);
            setIsPending(false);
        }
        onClose();
    }
    
    const cashAccountOptions = useMemo(() => {
        return availableCashAccounts.map((acc: CashAccount) => ({
            value: acc.id,
            label: `${acc.name} (المتاح: ${acc.currentBalance?.toLocaleString() || 0})`
        }))
    }, [availableCashAccounts]);
    
     const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: w.name })), [warehouses]);


    return (
        <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
                 <div className="space-y-2">
                    <Label htmlFor="expense-date">التاريخ</Label>
                    <Input id="expense-date" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required/>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="expense-type">نوع المصروف</Label>
                    <Select value={formData.expenseType} onValueChange={v => setFormData({...formData, expenseType: v})} required>
                        <SelectTrigger>
                            <SelectValue placeholder="اختر نوع المصروف" />
                        </SelectTrigger>
                        <SelectContent>
                            {EXPENSE_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="expense-amount">المبلغ</Label>
                    <Input id="expense-amount" type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value as any})} placeholder="أدخل مبلغ المصروف" required/>
                </div>
                
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <Switch id="tax-included" checked={includesTax} onCheckedChange={setIncludesTax} />
                    <Label htmlFor="tax-included">شامل ضريبة القيمة المضافة (14%)</Label>
                </div>
                {includesTax && (
                    <div className="text-sm text-muted-foreground">
                        قيمة الضريبة: {formData.taxAmount?.toFixed(2)} ج.م
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="expense-description">الوصف</Label>
                    <Textarea id="expense-description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="أدخل وصفًا للمصروف" required/>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="expense-warehouse">تحميل على</Label>
                    <Combobox
                        options={[{value: 'none', label: 'بدون (عام)'}, ...warehouseOptions]}
                        value={formData.warehouseId || 'none'}
                        onValueChange={v => setFormData({...formData, warehouseId: v})}
                        placeholder="اختياري: اختر فرعًا"
                        emptyMessage="لا يوجد فروع."
                    />
                </div>
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <Switch id="pay-later" checked={isPending} onCheckedChange={(checked) => {
                        setIsPending(checked);
                        setFormData(prev => ({ ...prev, status: checked ? 'pending' : 'paid' }));
                    }} />
                    <Label htmlFor="pay-later">دفع لاحق (مصروف مستحق)</Label>
                </div>

                 <div className="space-y-2">
                    <Label htmlFor="paid-from">مدفوع من</Label>
                    <Combobox
                        options={cashAccountOptions}
                        value={formData.paidFromAccountId}
                        onValueChange={v => setFormData({...formData, paidFromAccountId: v})}
                        placeholder={isPending ? "سيتم التحديد عند الدفع" : "اختر حساب الدفع..."}
                        emptyMessage="لا توجد حسابات متاحة."
                        disabled={isPending}
                    />
                </div>
            </div>
            <div className="flex justify-end mt-4">
                <Button type="submit" className="w-full md:w-auto">
                    <PlusCircle className="ml-2 h-4 w-4" />
                    حفظ المصروف
                </Button>
            </div>
        </form>
    );
};

const PayExpenseDialog = ({ expense, onConfirm, onClose, cashAccounts }: { expense: Expense, onConfirm: (accountId: string) => void, onClose: () => void, cashAccounts: CashAccount[] }) => {
    const [selectedAccount, setSelectedAccount] = useState('');

    return (
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>دفع مصروف مستحق</AlertDialogTitle>
                <AlertDialogDescription>
                    اختر الخزينة التي سيتم دفع المصروف منها.
                    <br/>
                    المبلغ: {expense.amount.toLocaleString()} ج.م
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
                <Label>اختر الخزينة</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger>
                        <SelectValue placeholder="اختر الخزينة" />
                    </SelectTrigger>
                    <SelectContent>
                        {cashAccounts.filter(acc => !acc.userId && !acc.salesRepId).map(acc => (
                            <SelectItem key={acc.id} value={acc.id}>
                                {acc.name} (الرصيد: {acc.currentBalance?.toLocaleString()})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={onClose}>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => onConfirm(selectedAccount)} disabled={!selectedAccount}>تأكيد الدفع</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    );
};

export default function ExpensesPage() {
    const allDataContext = useData();
    const { 
        expenses, warehouses, cashAccounts: rawCashAccounts, dbAction, getNextId, loading: dataLoading 
    } = allDataContext;

    const { toast } = useToast();
    const { user } = useAuth();
    const isMobile = useIsMobile();
    
    const [payingExpense, setPayingExpense] = useState<Expense | null>(null);

    // حساب الأرصدة الحالية لجميع الحسابات
    const cashAccounts: CashAccount[] = useMemo(() => {
        if (dataLoading) return [];
        return rawCashAccounts.map((account: CashAccount) => {
            const currentBalance = calculateAccountBalance(account, allDataContext);
            return { ...account, currentBalance };
        });
    }, [dataLoading, rawCashAccounts, allDataContext]);

    const getCashAccountName = (accountId: string) => {
        return cashAccounts.find((acc: CashAccount) => acc.id === accountId)?.name || 'غير معروف';
    }

    const handleSave = async (data: Omit<Expense, 'id' | 'receiptNumber'>) => {
        if (data.status !== 'pending') {
            const account = cashAccounts.find((acc: CashAccount) => acc.id === data.paidFromAccountId);
            if (!account) {
                toast({ variant: "destructive", title: "حدث خطأ", description: "لم يتم العثور على حساب الدفع." });
                return;
            }

            if ((account.currentBalance || 0) < data.amount) {
                 toast({ variant: "destructive", title: "رصيد غير كافٍ", description: `رصيد الخزينة "${account.name}" لا يكفي لإتمام هذه العملية.` });
                 return;
            }
        }

        try {
            const receiptNumber = `م-${await getNextId('expense')}`;
            const now = new Date();
            const [year, month, day] = data.date.split('-').map(Number);
            const finalDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());

            const newExpense: Expense = {
                ...data,
                date: finalDate.toISOString(),
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            };
            await dbAction('expenses', 'add', newExpense);
            toast({ title: "تمت الإضافة بنجاح", description: `تم تسجيل المصروف برقم إيصال: ${receiptNumber}` });
        } catch (error) {
            toast({ variant: "destructive", title: "حدث خطأ", description: "فشل الحفظ" });
        }
    };
    
    const handleDelete = async (id: string) => {
        try {
            await dbAction('expenses', 'remove', { id });
            toast({ title: "تم الحذف بنجاح" });
        } catch (error) {
            toast({ variant: "destructive", title: "حدث خطأ", description: "فشل الحذف" });
        }
    };

    const handlePay = async (accountId: string) => {
        if (!payingExpense) return;
        
        const account = cashAccounts.find(a => a.id === accountId);
        if (!account || (account.currentBalance || 0) < payingExpense.amount) {
             toast({ variant: "destructive", title: "رصيد غير كافٍ" });
             return;
        }
    
        try {
            await dbAction('expenses', 'update', { 
                id: payingExpense.id, 
                data: { status: 'paid', paidFromAccountId: accountId } 
            });
            toast({ title: "تم دفع المصروف بنجاح" });
            setPayingExpense(null);
        } catch (e) {
            toast({ variant: "destructive", title: "حدث خطأ" });
        }
    };

  return (
    <>
      <PageHeader title="إدارة المصروفات" />
      <main className="flex flex-1 flex-col gap-4 p-2 md:p-6">
        <div className="grid gap-6 md:grid-cols-5 items-start">
            <Card className="md:col-span-2 shadow-md">
                <CardHeader>
                    <CardTitle>إضافة مصروف جديد</CardTitle>
                    <CardDescription>
                    سجل المصروفات وصنفها وقم بتحميلها على الفروع إن أمكن.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {dataLoading ? <div className="flex justify-center py-10"><Loader2 className='animate-spin text-primary' /></div> : <ExpenseForm onSave={handleSave} onClose={()=>{}} warehouses={warehouses} cashAccounts={cashAccounts} />}
                    <Alert className="mt-4 bg-muted/50 border-primary/20">
                        <Info className="h-4 w-4" />
                        <AlertTitle>القيد المحاسبي المتوقع</AlertTitle>
                        <AlertDescription className="text-xs">
                            من ح/ المصروفات (مدين) <br/>
                            إلى ح/ النقدية أو البنك (دائن)
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
            
            <Card className="md:col-span-3 shadow-md">
                <CardHeader>
                    <CardTitle>سجل المصروفات</CardTitle>
                </CardHeader>
                <CardContent className="p-0 md:p-6 md:pt-0">
                    {dataLoading ? (
                        <div className="flex justify-center items-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="w-full">
                            {isMobile ? (
                                <div className="space-y-3 p-3">
                                    {expenses.length > 0 ? [...expenses].reverse().map((expense: Expense) => (
                                        <Card key={expense.id} className="relative overflow-hidden border-r-4 border-r-primary shadow-sm">
                                            <CardContent className="p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <h4 className="font-bold text-base leading-tight">{expense.expenseType}</h4>
                                                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                                                            <CheckCircle className="h-3 w-3" />
                                                            {new Date(expense.date).toLocaleDateString('ar-EG')}
                                                            <span className="mx-1">•</span>
                                                            بواسطة: {expense.createdByName || 'غير معروف'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-lg font-black text-primary">{expense.amount.toLocaleString()} <span className="text-[10px]">ج.م</span></p>
                                                        {expense.taxAmount ? <p className="text-[9px] text-muted-foreground">شامل ضريبة: {expense.taxAmount.toFixed(2)}</p> : null}
                                                    </div>
                                                </div>
                                                <p className="text-sm text-muted-foreground mb-3 bg-muted/30 p-2 rounded italic">"{expense.description}"</p>
                                                <div className="flex justify-between items-center pt-3 border-t">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant={expense.status === 'pending' ? 'outline' : 'default'} className={cn("text-[10px] px-2 h-5", expense.status === 'pending' ? "text-amber-600 border-amber-600" : "bg-green-600")}>
                                                            {expense.status === 'pending' ? 'مستحق (لم يدفع)' : 'مدفوع'}
                                                        </Badge>
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            <Wallet className="h-3 w-3"/>
                                                            {getCashAccountName(expense.paidFromAccountId)}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        {expense.status === 'pending' && (
                                                            <Button size="sm" variant="outline" className="h-8 text-[10px] bg-green-500 hover:bg-green-600 text-white" onClick={() => setPayingExpense(expense)}>دفع الآن</Button>
                                                        )}
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>حذف المصروف؟</AlertDialogTitle>
                                                                    <AlertDialogDescription>سيتم حذف سجل المصروف بشكل نهائي من الدفاتر المالية.</AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => handleDelete(expense.id!)} className="bg-destructive hover:bg-destructive/90">حذف نهائي</AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )) : <div className="text-center py-20 text-muted-foreground italic">لا توجد مصروفات مسجلة بعد.</div>}
                                </div>
                            ) : (
                                <div className="w-full overflow-auto border rounded-lg">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead>النوع والتاريخ</TableHead>
                                                <TableHead>الوصف</TableHead>
                                                <TableHead>الحالة</TableHead>
                                                <TableHead>مدفوع من</TableHead>
                                                <TableHead className="text-center">المبلغ</TableHead>
                                                <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {expenses.map((expense: Expense) => (
                                                <TableRow key={expense.id} className="hover:bg-muted/30">
                                                    <TableCell>
                                                        <div className="font-bold">{expense.expenseType}</div>
                                                        <div className="text-[10px] text-muted-foreground">{new Date(expense.date).toLocaleDateString('ar-EG')}</div>
                                                    </TableCell>
                                                    <TableCell className="max-w-[200px] truncate text-xs" title={expense.description}>{expense.description}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={expense.status === 'pending' ? 'outline' : 'default'} className={cn("text-[10px]", expense.status === 'pending' ? "text-amber-600 border-amber-600" : "bg-green-600")}>
                                                            {expense.status === 'pending' ? 'مستحق' : 'مدفوع'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs font-medium">{getCashAccountName(expense.paidFromAccountId)}</TableCell>
                                                    <TableCell className="text-center font-black text-primary">{expense.amount.toLocaleString()}</TableCell>
                                                    <TableCell className="text-center">
                                                        <AlertDialog>
                                                            <DropdownMenu modal={false}>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button aria-haspopup="true" size="icon" variant="ghost">
                                                                        <MoreHorizontal className="h-4 w-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                                                    {expense.status === 'pending' && (
                                                                        <DropdownMenuItem onSelect={() => setPayingExpense(expense)} className="text-green-600 font-bold">
                                                                            <CheckCircle className="ml-2 h-4 w-4" />
                                                                            دفع المصروف
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                    <AlertDialogTrigger asChild>
                                                                        <DropdownMenuItem className="text-destructive font-semibold" onSelect={(e) => e.preventDefault()}>
                                                                            <Trash2 className="ml-2 h-4 w-4" />
                                                                            حذف
                                                                        </DropdownMenuItem>
                                                                    </AlertDialogTrigger>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        هذا الإجراء سيحذف السجل بشكل دائم من الدفاتر المالية. لا يمكن التراجع عنه.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => handleDelete(expense.id!)} className="bg-destructive hover:bg-destructive/90">تأكيد الحذف</AlertDialogAction>
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
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
        
        {payingExpense && (
            <AlertDialog open={!!payingExpense} onOpenChange={(open) => !open && setPayingExpense(null)}>
                <PayExpenseDialog 
                    expense={payingExpense} 
                    onConfirm={handlePay} 
                    onClose={() => setPayingExpense(null)} 
                    cashAccounts={cashAccounts} 
                />
            </AlertDialog>
        )}
      </main>
    </>
  );
}
