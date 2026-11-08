
"use client";

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
import { PlusCircle, Loader2, MoreHorizontal, Edit, Trash2, Award, CircleOff } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddEntityDialog } from '@/components/add-entity-dialog';
import { usePermissions } from '@/contexts/permissions-context';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/auth-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from '@/contexts/data-provider';


interface EmployeeAdjustment {
    id?: string;
    date: string;
    amount: number;
    employeeId: string;
    type: 'reward' | 'penalty';
    description: string;
    receiptNumber?: string;
    createdById?: string;
    createdByName?: string;
}

interface Employee {
    id: string;
    name: string;
}

const AdjustmentForm = ({ adjustment, onSave, onClose, employees }: { adjustment?: EmployeeAdjustment, onSave: (data: Omit<EmployeeAdjustment, 'id' | 'receiptNumber'>) => void, onClose: () => void, employees: Employee[]}) => {
    const [formData, setFormData] = useState<Omit<EmployeeAdjustment, 'id'|'receiptNumber'>>(
        adjustment || { date: new Date().toISOString().split('T')[0], amount: 0, employeeId: "", type: "reward", description: "" }
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSave({ ...formData, amount: Number(formData.amount) });
        if (!adjustment) { 
            setFormData({ date: new Date().toISOString().split('T')[0], amount: 0, employeeId: "", type: "reward", description: "" });
        }
        onClose();
    }

    return (
        <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="adj-date" className="text-right">التاريخ</Label>
                    <Input id="adj-date" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="col-span-3" required/>
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="adj-employee" className="text-right">الموظف</Label>
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
                    <Label htmlFor="adj-type" className="text-right">النوع</Label>
                    <Select value={formData.type} onValueChange={(v: 'reward' | 'penalty') => setFormData({...formData, type: v})} required>
                        <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="اختر النوع" />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="reward">مكافأة</SelectItem>
                           <SelectItem value="penalty">جزاء/خصم</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="adj-amount" className="text-right">المبلغ</Label>
                    <Input id="adj-amount" type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value as any})} className="col-span-3" placeholder="أدخل المبلغ" required/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="adj-description" className="text-right">الوصف</Label>
                    <Textarea id="adj-description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="col-span-3" placeholder="أدخل سبب المكافأة أو الجزاء" required />
                </div>
            </div>
            <div className="flex justify-end">
                <Button type="submit">
                    <PlusCircle className="ml-2 h-4 w-4" />
                    حفظ
                </Button>
            </div>
        </form>
    );
};

export default function EmployeeAdjustmentsPage() {
    const { employeeAdjustments: adjustments, employees, dbAction, getNextId, loading } = useData();
    const { toast } = useToast();
    const { can } = usePermissions();
    const { user } = useAuth();
    
     const getEmployeeName = (employeeId: string) => {
        return employees.find((s: Employee) => s.id === employeeId)?.name || 'غير معروف';
    };

    const handleSave = async (data: Omit<EmployeeAdjustment, 'id' | 'receiptNumber'>) => {
        try {
            if (!can('add', 'hr_adjustments')) return toast({ variant: "destructive", title: "غير مصرح به" });
            const receiptNumber = `ت-م-${await getNextId('employeeAdjustment')}`;
            
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

            const newAdjustment: EmployeeAdjustment = {
                ...data,
                date: finalDate.toISOString(),
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            };
            await dbAction('employeeAdjustments', 'add', newAdjustment);
            toast({ title: "تمت الإضافة بنجاح", description: `تم حفظ الإجراء برقم: ${receiptNumber}` });
        } catch (error) {
            toast({ variant: "destructive", title: "حدث خطأ", description: "فشل الحفظ" });
        }
    };
    
    const handleDelete = async (id: string) => {
        if(!can('delete', 'hr_adjustments')) return toast({ variant: "destructive", title: "غير مصرح به" });
        try {
            await dbAction('employeeAdjustments', 'remove', { id });
            toast({ title: "تم الحذف بنجاح" });
        } catch (error) {
            toast({ variant: "destructive", title: "حدث خطأ", description: "فشل الحذف" });
        }
    };


  return (
    <>
      <PageHeader title="المكافآت والجزاءات">
        {can('add', 'hr_adjustments') && (
            <AddEntityDialog
                title="إضافة بند جديد"
                description="سجل مكافأة أو جزاء لأحد الموظفين."
                triggerButton={
                    <Button size="sm" className="gap-1">
                        <PlusCircle className="h-4 w-4" />
                        إضافة بند
                    </Button>
                }
            >
                {({ onClose }) => (
                    <AdjustmentForm onSave={handleSave} onClose={onClose} employees={employees} />
                )}
            </AddEntityDialog>
        )}
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
            <Card>
                <CardHeader>
                    <CardTitle>سجل المكافآت والجزاءات</CardTitle>
                    <CardDescription>عرض وتعديل جميع المكافآت والجزاءات المسجلة للموظفين.</CardDescription>
                </CardHeader>
                <CardContent>
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
                                        <TableHead className="text-center">النوع</TableHead>
                                        <TableHead>الوصف</TableHead>
                                        <TableHead className="text-center w-[150px]">المبلغ</TableHead>
                                        <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {adjustments.map((adj : EmployeeAdjustment) => (
                                        <TableRow key={adj.id}>
                                            <TableCell>
                                                <div>{new Date(adj.date).toLocaleDateString('ar-EG')}</div>
                                                <div className="text-xs text-muted-foreground">بواسطة: {adj.createdByName || 'غير معروف'}</div>
                                            </TableCell>
                                            <TableCell>{getEmployeeName(adj.employeeId)}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={adj.type === 'reward' ? 'default' : 'destructive'}>
                                                    {adj.type === 'reward' ? <Award className="ml-1 h-3 w-3"/> : <CircleOff className="ml-1 h-3 w-3"/>}
                                                    {adj.type === 'reward' ? 'مكافأة' : 'جزاء'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{adj.description}</TableCell>
                                            <TableCell className={`text-center font-semibold ${adj.type === 'reward' ? 'text-green-600' : 'text-destructive'}`}>
                                                {adj.amount.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-center">
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
                                                            {can('delete', 'hr_adjustments') && (
                                                                <AlertDialogTrigger asChild>
                                                                    <DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}>
                                                                        <Trash2 className="ml-2 h-4 w-4" />
                                                                        حذف
                                                                    </DropdownMenuItem>
                                                                </AlertDialogTrigger>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                     <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                هذا الإجراء سيحذف السجل بشكل دائم. لا يمكن التراجع عن هذا الإجراء.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDelete(adj.id!)}>متابعة</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {adjustments.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                                لا توجد مكافآت أو جزاءات مسجلة.
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
