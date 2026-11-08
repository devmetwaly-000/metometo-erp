
"use client";

// استيراد المكونات والأدوات اللازمة
import React, { useState, useEffect } from 'react';
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
import { PlusCircle, Loader2, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddEntityDialog } from '@/components/add-entity-dialog';
import { usePermissions } from '@/contexts/permissions-context';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/auth-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from '@/contexts/data-provider';

// تعريف واجهات البيانات (Interfaces) لضمان تطابق أنواع البيانات
interface EmployeeAdvance {
    id?: string;
    date: string;
    amount: number;
    employeeId: string;
    paidFromAccountId: string;
    notes?: string;
    receiptNumber?: string;
    createdById?: string;
    createdByName?: string;
}

interface Employee {
    id: string;
    name: string;
    warehouse?: string; // المخزن/الفرع المرتبط به الموظف
}

interface CashAccount {
    id: string;
    name: string;
    warehouseId?: string; // المعرف الخاص بالخزينة المرتبطة بفرع معين
}

/**
 * مكون `AdvanceForm`
 * @param {object} props - الخصائص المستلمة.
 * @param {EmployeeAdvance} [props.advance] - بيانات السلفة الحالية (للتعديل).
 * @param {Function} props.onSave - دالة يتم استدعاؤها لحفظ بيانات السلفة.
 * @param {Function} props.onClose - دالة لإغلاق الحوار بعد الحفظ.
 * @param {Employee[]} props.employees - قائمة الموظفين.
 * @param {CashAccount[]} props.cashAccounts - قائمة الحسابات النقدية.
 * @returns {JSX.Element} نموذج لإضافة أو تعديل سلفة موظف.
 * هذا المكون مسؤول عن عرض نموذج لإدخال سلفة جديدة للموظف.
 */
const AdvanceForm = ({ advance, onSave, onClose, employees, cashAccounts }: { advance?: EmployeeAdvance, onSave: (data: Omit<EmployeeAdvance, 'id' | 'receiptNumber'>) => void, onClose: () => void, employees: Employee[], cashAccounts: CashAccount[] }) => {
    // حالة (state) لتخزين بيانات النموذج
    const [formData, setFormData] = useState(
        advance || { date: new Date().toISOString().split('T')[0], amount: 0, employeeId: "", paidFromAccountId: "", notes: "" }
    );
    // حالة لتخزين الحسابات النقدية المتاحة بناءً على فرع الموظف
    const [availableCashAccounts, setAvailableCashAccounts] = useState(cashAccounts);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

    // `useEffect` لتحديث الموظف المحدد عند تغيير قيمة `formData.employeeId`.
    useEffect(() => {
        const employee = employees.find(e => e.id === formData.employeeId);
        setSelectedEmployee(employee || null);
    }, [formData.employeeId, employees]);

    // `useEffect` لترشيح الحسابات النقدية المتاحة عند تغيير الموظف المحدد.
    // إذا كان الموظف مرتبطًا بفرع له خزينة، يتم عرض هذه الخزينة فقط.
    useEffect(() => {
        if (selectedEmployee?.warehouse) {
            const branchAccount = cashAccounts.find(acc => acc.warehouseId === selectedEmployee.warehouse);
            if (branchAccount) {
                setAvailableCashAccounts([branchAccount]);
                setFormData(prev => ({ ...prev, paidFromAccountId: branchAccount.id }));
            } else {
                // إذا لم يكن للفرع خزينة خاصة، يتم عرض الخزائن العامة
                setAvailableCashAccounts(cashAccounts.filter(acc => !acc.warehouseId));
                setFormData(prev => ({ ...prev, paidFromAccountId: '' }));
            }
        } else {
            // إذا لم يكن الموظف مرتبطًا بفرع، يتم عرض الخزائن العامة فقط
            setAvailableCashAccounts(cashAccounts.filter(acc => !acc.warehouseId));
             setFormData(prev => ({ ...prev, paidFromAccountId: '' }));
        }
    }, [selectedEmployee, cashAccounts]);


    /**
     * دالة `handleSubmit`
     * @param {React.FormEvent} e - كائن الحدث.
     * يتم استدعاؤها عند إرسال النموذج. تقوم بمنع السلوك الافتراضي، واستدعاء دالة الحفظ `onSave`
     * مع تمرير بيانات النموذج، ثم إعادة تعيين النموذج وإغلاق الحوار.
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSave({ ...formData, amount: Number(formData.amount) });
        if (!advance) { 
            setFormData({ date: new Date().toISOString().split('T')[0], amount: 0, employeeId: "", paidFromAccountId: "", notes: "" });
        }
        onClose();
    }

    return (
        <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="advance-date" className="text-right">التاريخ</Label>
                    <Input id="advance-date" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="col-span-3" required/>
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="advance-employee" className="text-right">الموظف</Label>
                    <Select value={formData.employeeId} onValueChange={v => setFormData({...formData, employeeId: v})} required>
                        <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="اختر موظفًا" />
                        </SelectTrigger>
                        <SelectContent>
                            {employees.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="advance-amount" className="text-right">المبلغ</Label>
                    <Input id="advance-amount" type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value as any})} className="col-span-3" placeholder="أدخل مبلغ السلفة" required/>
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="paid-from" className="text-right">مدفوع من</Label>
                    <Select value={formData.paidFromAccountId} onValueChange={v => setFormData({...formData, paidFromAccountId: v})} required>
                        <SelectTrigger className="col-span-3" disabled={availableCashAccounts.length === 0}>
                            <SelectValue placeholder="اختر حساب الدفع" />
                        </SelectTrigger>
                        <SelectContent>
                           {availableCashAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="advance-notes" className="text-right">ملاحظات</Label>
                    <Textarea id="advance-notes" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="col-span-3" placeholder="أدخل أي ملاحظات (اختياري)" />
                </div>
            </div>
            <div className="flex justify-end">
                <Button type="submit">
                    <PlusCircle className="ml-2 h-4 w-4" />
                    حفظ السلفة
                </Button>
            </div>
        </form>
    );
};

/**
 * المكون الرئيسي لصفحة سلف الموظفين `EmployeeAdvancesPage`.
 * هذا المكون يدير حالة الصفحة ويعرض زر لإضافة سلفة جديدة وجدول بالسلف المسجلة.
 * @returns {JSX.Element} واجهة مستخدم كاملة لإدارة سلف الموظفين.
 */
export default function EmployeeAdvancesPage() {
    // استدعاء السياقات والخطافات (Hooks) للحصول على البيانات والدوال اللازمة
    const { employeeAdvances: advances, employees, cashAccounts, dbAction, getNextId, loading } = useData();
    const { toast } = useToast();
    const { can } = usePermissions();
    const { user } = useAuth();
    
    /**
     * دالة `getEmployeeName`
     * @param {string} employeeId - معرف الموظف.
     * @returns {string} اسم الموظف أو 'غير معروف'.
     */
     const getEmployeeName = (employeeId: string) => {
        return employees.find((s: Employee) => s.id === employeeId)?.name || 'غير معروف';
    };

    /**
     * دالة `getCashAccountName`
     * @param {string} accountId - معرف الحساب النقدي.
     * @returns {string} اسم الحساب أو 'غير معروف'.
     */
    const getCashAccountName = (accountId: string) => {
        return cashAccounts.find((acc: CashAccount) => acc.id === accountId)?.name || 'غير معروف';
    }

    /**
     * دالة `handleSave`
     * @param {Omit<EmployeeAdvance, 'id' | 'receiptNumber'>} data - بيانات السلفة الجديدة.
     * دالة غير متزامنة لحفظ سلفة جديدة في قاعدة البيانات.
     * تتحقق من الصلاحيات، تنشئ رقم إيصال فريد، تضيف بيانات المستخدم، ثم تحفظ السجل.
     */
    const handleSave = async (data: Omit<EmployeeAdvance, 'id' | 'receiptNumber'>) => {
        try {
            if (!can('add', 'hr_advances')) return toast({ variant: "destructive", title: "غير مصرح به" });
            const receiptNumber = `س-م-${await getNextId('employeeAdvance')}`;
            
            // Fix: Include current time
            const now = new Date();
            const selectedDate = new Date(data.date);
            const finalDate = new Date(
                selectedDate.getFullYear(),
                selectedDate.getMonth(),
                selectedDate.getDate(),
                now.getHours(),
                now.getMinutes(),
                now.getSeconds()
            );

            const newAdvance: EmployeeAdvance = {
                ...data,
                date: finalDate.toISOString(),
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            };
            await dbAction('employeeAdvances', 'add', newAdvance);
            toast({ title: "تمت الإضافة بنجاح", description: `تم حفظ السلفة برقم إيصال: ${receiptNumber}` });
        } catch (error) {
            toast({ variant: "destructive", title: "حدث خطأ", description: "فشل الحفظ" });
        }
    };
    
    /**
     * دالة `handleDelete`
     * @param {string} id - معرف السلفة المراد حذفها.
     * دالة غير متزامنة لحذف سلفة من قاعدة البيانات.
     */
    const handleDelete = async (id: string) => {
        if(!can('delete', 'hr_advances')) return toast({ variant: "destructive", title: "غير مصرح به" });
        try {
            await dbAction('employeeAdvances', 'remove', { id });
            toast({ title: "تم الحذف بنجاح" });
        } catch (error) {
            toast({ variant: "destructive", title: "حدث خطأ", description: "فشل الحذف" });
        }
    };


  return (
    <>
      <PageHeader title="سلف الموظفين">
        {can('add', 'hr_advances') && (
            <AddEntityDialog
                title="إضافة سلفة جديدة"
                description="سجل دفعة مقدمة لأحد الموظفين."
                triggerButton={
                    <Button size="sm" className="gap-1">
                        <PlusCircle className="h-4 w-4" />
                        إضافة سلفة
                    </Button>
                }
            >
                {({ onClose }) => (
                    <AdvanceForm onSave={handleSave} onClose={onClose} employees={employees} cashAccounts={cashAccounts} />
                )}
            </AddEntityDialog>
        )}
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
            <Card>
                <CardHeader>
                    <CardTitle>سجل السلف</CardTitle>
                    <CardDescription>عرض وتعديل جميع السلف المسجلة للموظفين.</CardDescription>
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
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead>الموظف</TableHead>
                                        <TableHead>مدفوعة من</TableHead>
                                        <TableHead className="text-center w-[150px]">المبلغ</TableHead>
                                        <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {/* عرض كل سلفة في صف بالجدول */}
                                    {advances.map((advance: EmployeeAdvance) => (
                                        <TableRow key={advance.id}>
                                            <TableCell>
                                                <div>{new Date(advance.date).toLocaleDateString('ar-EG')}</div>
                                                <div className="text-xs text-muted-foreground">بواسطة: {advance.createdByName || 'غير معروف'}</div>
                                            </TableCell>
                                            <TableCell>{getEmployeeName(advance.employeeId)}</TableCell>
                                            <TableCell>{getCashAccountName(advance.paidFromAccountId)}</TableCell>
                                            <TableCell className="text-center">{advance.amount.toLocaleString()}</TableCell>
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
                                                            {can('delete', 'hr_advances') && (
                                                                <AlertDialogTrigger asChild>
                                                                    <DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}>
                                                                        <Trash2 className="ml-2 h-4 w-4" />
                                                                        حذف
                                                                    </DropdownMenuItem>
                                                                </AlertDialogTrigger>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                    {/* مربع حوار تأكيد الحذف */}
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                هذا الإجراء سيحذف السلفة بشكل دائم. لا يمكن التراجع عن هذا الإجراء.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDelete(advance.id!)}>متابعة</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {advances.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                                لا توجد سلف مسجلة.
                                            </TableCell>
                                        </TableRow>
                                    )}
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
