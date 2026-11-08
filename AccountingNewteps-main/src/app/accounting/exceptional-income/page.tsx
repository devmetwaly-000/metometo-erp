
"use client";

// استيراد المكونات والأدوات اللازمة
import React, { useState } from 'react';
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
import { PlusCircle, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AddEntityDialog } from '@/components/add-entity-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from '@/contexts/data-provider';


// تعريف واجهات البيانات (Interfaces) لضمان تطابق أنواع البيانات لضمان تطابق أنواع البيانات
interface ExceptionalIncome {
    id?: string;
    date: string;
    amount: number;
    description: string;
    paidToAccountId: string;
    receiptNumber?: string;
    createdById?: string;
    createdByName?: string;
}

interface CashAccount {
    id: string;
    name: string;
}

/**
 * مكون `IncomeForm`
 * @param {object} props - الخصائص المستلمة.
 * @param {ExceptionalIncome} [props.income] - بيانات الدخل الحالية (للتعديل).
 * @param {Function} props.onSave - دالة يتم استدعاؤها لحفظ بيانات الدخل.
 * @param {Function} props.onClose - دالة لإغلاق الحوار بعد الحفظ.
 * @param {CashAccount[]} props.cashAccounts - قائمة الحسابات النقدية.
 * @returns {JSX.Element} نموذج لإضافة أو تعديل دخل استثنائي.
 * هذا المكون مسؤول عن عرض نموذج لإدخال دخل استثنائي جديد، ويشمل حقول التاريخ، المبلغ، الوصف، والحساب المستلم.
 */
const IncomeForm = ({ income, onSave, onClose, cashAccounts }: { income?: ExceptionalIncome, onSave: (data: Omit<ExceptionalIncome, 'id'|'receiptNumber'>) => void, onClose: () => void, cashAccounts: CashAccount[] }) => {
    // حالة (state) لتخزين بيانات النموذج
    const [formData, setFormData] = useState<Omit<ExceptionalIncome, 'id'|'receiptNumber'>>(
        income || { date: new Date().toISOString().split('T')[0], amount: 0, description: "", paidToAccountId: "" }
    );

    /**
     * دالة `handleSubmit`
     * يتم استدعاؤها عند النقر على زر الحفظ. تقوم باستدعاء دالة الحفظ `onSave`
     * مع تمرير بيانات النموذج، ثم تستدعي دالة `onClose` لإغلاق الحوار.
     */
    const handleSubmit = async () => {
        await onSave({ ...formData, amount: Number(formData.amount) });
        onClose();
    }

    return (
        <>
            <div className="grid gap-4 py-4">
                 {/* حقول النموذج المختلفة لإدخال البيانات */}
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="income-date" className="text-right">التاريخ</Label>
                    <Input id="income-date" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="col-span-3" />
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="paid-to" className="text-right">مستلم في</Label>
                    <Select value={formData.paidToAccountId} onValueChange={v => setFormData({...formData, paidToAccountId: v})} required>
                        <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="اختر حساب الاستلام" />
                        </SelectTrigger>
                        <SelectContent>
                           {cashAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="income-amount" className="text-right">المبلغ</Label>
                    <Input id="income-amount" type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value as any})} className="col-span-3" placeholder="أدخل مبلغ الدخل" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="income-description" className="text-right">الوصف</Label>
                    <Textarea id="income-description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="col-span-3" placeholder="أدخل وصفًا للدخل" />
                </div>
            </div>
            <div className="flex justify-end">
                <Button onClick={handleSubmit}>حفظ</Button>
            </div>
        </>
    );
};

/**
 * المكون الرئيسي لصفحة الدخل الاستثنائي `ExceptionalIncomePage`.
 * هذا المكون يدير حالة الصفحة ويعرض زر لإضافة دخل جديد وجدول بالسجلات الموجودة.
 * @returns {JSX.Element} واجهة مستخدم كاملة لإدارة الدخل الاستثنائي.
 */
export default function ExceptionalIncomePage() {
    const { exceptionalIncomes: incomes, cashAccounts, dbAction, getNextId, loading } = useData();
    const { toast } = useToast();
    const { user } = useAuth();
    
    /**
     * دالة `getCashAccountName`
     * @param {string} [accountId] - معرف الحساب النقدي (اختياري).
     * @returns {string} اسم الحساب أو 'غير محدد' أو 'غير معروف'.
     * تبحث عن اسم الحساب النقدي في قائمة الحسابات باستخدام المعرف.
     */
    const getCashAccountName = (accountId?: string) => {
        if (!accountId) return 'غير محدد';
        return cashAccounts.find((w: CashAccount) => w.id === accountId)?.name || 'غير معروف';
    };

    /**
     * دالة `handleSave`
     * @param {Omit<ExceptionalIncome, 'id' | 'receiptNumber'>} data - بيانات الدخل الجديد.
     * دالة غير متزامنة (async) لحفظ سجل دخل جديد في قاعدة البيانات.
     * تقوم بإنشاء رقم إيصال فريد، إضافة بيانات المستخدم، ثم استدعاء `dbAction` للحفظ.
     */
    const handleSave = async (data: Omit<ExceptionalIncome, 'id' | 'receiptNumber'>) => {
        try {
            const receiptNumber = `إ-س-${await getNextId('exceptionalIncome')}`;
            
            // Fix: Include current time
            const now = new Date();
            const [year, month, day] = data.date.split('-').map(Number);
            const finalDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());

            const newIncome: ExceptionalIncome = {
                ...data,
                date: finalDate.toISOString(),
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            };
            await dbAction('exceptionalIncomes', 'add', newIncome);
            toast({ title: "تمت الإضافة بنجاح", description: `تم تسجيل الدخل برقم إيصال: ${receiptNumber}` });
        } catch (error) {
            toast({ variant: "destructive", title: "حدث خطأ", description: "فشل الحفظ" });
        }
    };

    /**
     * دالة `handleDelete`
     * @param {string} id - معرف السجل المراد حذفه.
     * دالة غير متزامنة (async) لحذف سجل دخل من قاعدة البيانات.
     */
    const handleDelete = async (id: string) => {
        try {
            await dbAction('exceptionalIncomes', 'remove', { id });
            toast({ title: "تم الحذف بنجاح" });
        } catch (error) {
            toast({ variant: "destructive", title: "حدث خطأ", description: "فشل الحذف" });
        }
    };

  return (
    <>
      <PageHeader title="الدخل الاستثنائي">
        {/* زر لإضافة كيان جديد يفتح مربع حوار */}
        <AddEntityDialog
            title="إضافة دخل استثنائي"
            description="سجل أي دخل لا يتعلق بعمليات البيع المباشرة."
            triggerButton={
                <Button size="sm" className="gap-1">
                    <PlusCircle className="h-4 w-4" />
                    إضافة دخل
                </Button>
            }
        >
            {({onClose}) => <IncomeForm onSave={handleSave} onClose={onClose} cashAccounts={cashAccounts} />}
        </AddEntityDialog>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
            <CardHeader>
                <CardTitle>سجل الدخل الاستثنائي</CardTitle>
                <CardDescription>عرض وتعديل جميع سجلات الدخل الاستثنائي.</CardDescription>
            </CardHeader>
            <CardContent>
                {/* عرض مؤشر تحميل أثناء جلب البيانات */}
                {loading ? (
                    <div className="flex justify-center items-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="w-full overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>الوصف</TableHead>
                                    <TableHead>الحساب المستلم</TableHead>
                                    <TableHead className="text-center">المبلغ</TableHead>
                                    <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {/* عرض كل سجل في صف بالجدول */}
                                {incomes.map((income: ExceptionalIncome) => (
                                    <TableRow key={income.id}>
                                        <TableCell>
                                            <div className="font-medium">{income.description}</div>
                                            <div className="text-sm text-muted-foreground">{new Date(income.date).toLocaleDateString('ar-EG')}</div>
                                            <div className="text-xs text-muted-foreground">بواسطة: {income.createdByName || 'غير معروف'}</div>
                                        </TableCell>
                                        <TableCell>{getCashAccountName(income.paidToAccountId)}</TableCell>
                                        <TableCell className="text-center">{income.amount.toLocaleString()}</TableCell>
                                        <TableCell className="text-center">
                                            {/* قائمة منسدلة تحتوي على إجراءات (حذف) */}
                                            <AlertDialog>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button aria-haspopup="true" size="icon" variant="ghost">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                            <span className="sr-only">قائمة</span>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}>
                                                                <Trash2 className="ml-2 h-4 w-4" />
                                                                حذف
                                                            </DropdownMenuItem>
                                                        </AlertDialogTrigger>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                 {/* مربع حوار تأكيد الحذف */}
                                                 <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            هذا الإجراء سيحذف السجل بشكل دائم. لا يمكن التراجع عن هذا الإجراء.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDelete(income.id!)}>متابعة</AlertDialogAction>
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
    </>
  );
}
