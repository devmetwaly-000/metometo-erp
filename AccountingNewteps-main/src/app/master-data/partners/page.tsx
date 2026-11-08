
"use client";

import React, { useState } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Calendar } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AddEntityDialog } from "@/components/add-entity-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from "@/contexts/data-provider";


interface Partner {
  id?: string;
  name: string;
  capital: number;
  profitShare: number;
  warehouseId: string;
  startDate: string;
  endDate: string;
}

interface Warehouse {
  id: string;
  name: string;
}

const PartnerForm = ({ partner, onSave, onClose, warehouses }: { partner?: Partner, onSave: (partner: Partner) => void, onClose: () => void, warehouses: Warehouse[] }) => {
  const [formData, setFormData] = useState<Partner>(
    partner || { 
        name: "", 
        capital: 0, 
        profitShare: 0, 
        warehouseId: "", 
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 10)).toISOString().split('T')[0]
    }
  );

  const handleSubmit = async () => {
    if (!formData.name || !formData.warehouseId || !formData.startDate || !formData.endDate) {
        alert("يرجى ملء جميع الحقول المطلوبة.");
        return;
    }
    await onSave({
        ...formData,
        capital: Number(formData.capital),
        profitShare: Number(formData.profitShare),
    });
    onClose();
  };

  return (
    <>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="partner-name" className="text-right">
            اسم الشريك
          </Label>
          <Input id="partner-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="partner-warehouse" className="text-right">
            المخزن / الفرع
          </Label>
          <Select value={formData.warehouseId} onValueChange={(value) => setFormData({...formData, warehouseId: value})}>
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder="اختر المخزن المرتبط" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="partner-capital" className="text-right">
            رأس المال
          </Label>
          <Input id="partner-capital" type="number" value={formData.capital} onChange={(e) => setFormData({...formData, capital: e.target.value as any})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="partner-share" className="text-right">
            حصة الأرباح (%)
            </Label>
            <Input id="partner-share" type="number" value={formData.profitShare} onChange={(e) => setFormData({...formData, profitShare: e.target.value as any})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="start-date" className="text-right">بداية الشراكة</Label>
            <Input id="start-date" type="date" value={formData.startDate} onChange={(e) => setFormData({...formData, startDate: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="end-date" className="text-right">نهاية الشراكة</Label>
            <Input id="end-date" type="date" value={formData.endDate} onChange={(e) => setFormData({...formData, endDate: e.target.value})} className="col-span-3" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSubmit}>حفظ بيانات الشريك</Button>
      </div>
    </>
  );
};


export default function PartnersPage() {
    const { partners, warehouses, dbAction, loading } = useData();

    const loadingData = loading;

    const handleSave = (partner: Partner) => {
        if (partner.id) {
            const {id, ...data} = partner;
            dbAction('partners', 'update', { id, data });
        } else {
            dbAction('partners', 'add', partner);
        }
    };

    const handleDelete = (id: string) => {
        dbAction('partners', 'remove', {id});
    };
    
    const getWarehouseName = (warehouseId: string) => {
        return warehouses.find((w: any) => w.id === warehouseId)?.name || 'غير محدد';
    }


  return (
    <>
      <PageHeader title="إدارة الشركاء">
         <AddEntityDialog
          title="إضافة شريك جديد"
          description="أدخل تفاصيل الشريك وفترة الشراكة لتوزيع الأرباح بدقة."
          triggerButton={
            <Button size="sm" className="gap-1" disabled={loadingData}>
              <PlusCircle className="h-4 w-4" />
              إضافة شريك
            </Button>
          }
        >
          {({onClose}) => <PartnerForm onSave={handleSave} onClose={onClose} warehouses={warehouses} />}
        </AddEntityDialog>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>الشركاء وحصص الأرباح</CardTitle>
            <CardDescription>
              إدارة الشركاء مع تحديد فترة الشراكة لكل منهم لضمان توزيع عادل للأرباح اليومية.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingData ? (
                <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="w-full overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>اسم الشريك</TableHead>
                                <TableHead>المخزن / الفرع</TableHead>
                                <TableHead className="text-center">فترة الشراكة</TableHead>
                                <TableHead className="text-center">رأس المال</TableHead>
                                <TableHead className="text-center">الحصة (%)</TableHead>
                                <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {partners.map((partner: any) => (
                                <TableRow key={partner.id}>
                                    <TableCell className="font-medium">{partner.name}</TableCell>
                                    <TableCell>{getWarehouseName(partner.warehouseId)}</TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex flex-col text-xs">
                                            <span>من: {new Date(partner.startDate).toLocaleDateString('ar-EG')}</span>
                                            <span>إلى: {new Date(partner.endDate).toLocaleDateString('ar-EG')}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">{partner.capital?.toLocaleString()}</TableCell>
                                    <TableCell className="text-center">{partner.profitShare}%</TableCell>
                                    <TableCell className="text-center">
                                        <AlertDialog>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                <Button aria-haspopup="true" size="icon" variant="ghost">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                    <span className="sr-only">تبديل القائمة</span>
                                                </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                                    <AddEntityDialog
                                                        title="تعديل الشريك"
                                                        description="قم بتحديث تفاصيل الشريك وفترة الشراكة."
                                                        triggerButton={
                                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                            <Edit className="ml-2 h-4 w-4" />
                                                            تعديل
                                                            </DropdownMenuItem>
                                                        }
                                                    >
                                                    {({onClose}) => <PartnerForm partner={partner} onSave={handleSave} onClose={onClose} warehouses={warehouses} />}
                                                    </AddEntityDialog>
                                                     <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}>
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
                                                    هذا الإجراء سيحذف الشريك بشكل دائم. لا يمكن التراجع عن هذا الإجراء.
                                                </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDelete(partner.id!)}>متابعة</AlertDialogAction>
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
