

"use client";

import React, { useState } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2 } from "lucide-react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";

interface ItemSize {
  id?: string;
  name: string;
  code: string;
}

const SizeForm = ({ size, onSave, onClose }: { size?: ItemSize, onSave: (data: Partial<ItemSize>) => void, onClose: () => void }) => {
  const [formData, setFormData] = React.useState<Partial<ItemSize>>(
    size || { name: "", code: "" }
  );

  const handleSubmit = () => {
    if (!formData.name || !formData.code) {
        alert("الاسم والكود حقول مطلوبة.");
        return;
    }
    onSave(formData);
    onClose();
  };

  return (
    <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="size-name" className="text-right">اسم المقاس</Label>
          <Input id="size-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="size-code" className="text-right">كود المقاس (رقمين)</Label>
          <Input id="size-code" value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value})} className="col-span-3" maxLength={2} />
        </div>
       <div className="flex justify-end pt-4">
         <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </div>
  );
};


export default function ItemSizesPage() {
  const { itemSizes, dbAction, loading } = useData();
  const { toast } = useToast();

  const handleSave = async (size: Partial<ItemSize>) => {
    try {
      const { id, ...data } = size;
      if (id) {
        await dbAction('itemSizes', 'update', { id, data });
        toast({ title: "تم التحديث بنجاح" });
      } else {
        await dbAction('itemSizes', 'add', data);
        toast({ title: "تمت إضافة المقاس بنجاح" });
      }
    } catch(e) {
      console.error(e);
      toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ المقاس." });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dbAction('itemSizes', 'remove', { id });
      toast({ title: "تم الحذف بنجاح" });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف المقاس." });
    }
  };

  return (
    <>
      <PageHeader title="إدارة المقاسات">
        <AddEntityDialog
            title="إضافة مقاس جديد"
            description="أدخل اسم المقاس والكود المكون من رقمين."
            triggerButton={
                <Button size="sm" className="gap-1">
                <PlusCircle className="h-4 w-4" />
                إضافة مقاس
                </Button>
            }
            >
            {({onClose}) => <SizeForm onSave={handleSave} onClose={onClose} />}
        </AddEntityDialog>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>قائمة المقاسات</CardTitle>
            <CardDescription>
              إدارة المقاسات المستخدمة في الأصناف لإنشاء باركود فريد.
            </CardDescription>
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
                                <TableHead>اسم المقاس</TableHead>
                                <TableHead>الكود</TableHead>
                                <TableHead className="text-center w-[100px]">
                                    <span className="sr-only">الإجراءات</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {itemSizes && itemSizes.length > 0 ? itemSizes.map((size: ItemSize) => (
                                <TableRow key={size.id}>
                                    <TableCell className="font-medium">{size.name}</TableCell>
                                    <TableCell>{size.code}</TableCell>
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
                                                        title="تعديل المقاس"
                                                        description="قم بتحديث تفاصيل المقاس هنا."
                                                        triggerButton={
                                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                            <Edit className="ml-2 h-4 w-4" />
                                                            تعديل
                                                            </DropdownMenuItem>
                                                        }
                                                    >
                                                        {({onClose}) => <SizeForm size={size} onSave={handleSave} onClose={onClose} />}
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
                                                        هذا الإجراء سيحذف المقاس بشكل دائم.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDelete(size.id!)}>متابعة</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                                        لا توجد مقاسات مسجلة.
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
