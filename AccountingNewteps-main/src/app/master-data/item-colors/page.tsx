

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

interface ItemColor {
  id?: string;
  name: string;
  code: string;
}

const ColorForm = ({ color, onSave, onClose }: { color?: ItemColor, onSave: (data: Partial<ItemColor>) => void, onClose: () => void }) => {
  const [formData, setFormData] = React.useState<Partial<ItemColor>>(
    color || { name: "", code: "" }
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
          <Label htmlFor="color-name" className="text-right">اسم اللون</Label>
          <Input id="color-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="color-code" className="text-right">كود اللون (رقمين)</Label>
          <Input id="color-code" value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value})} className="col-span-3" maxLength={2} />
        </div>
       <div className="flex justify-end pt-4">
         <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </div>
  );
};


export default function ItemColorsPage() {
  const { itemColors, dbAction, loading } = useData();
  const { toast } = useToast();

  const handleSave = async (color: Partial<ItemColor>) => {
    try {
      const { id, ...data } = color;
      if (id) {
        await dbAction('itemColors', 'update', { id, data });
        toast({ title: "تم التحديث بنجاح" });
      } else {
        await dbAction('itemColors', 'add', data);
        toast({ title: "تمت إضافة اللون بنجاح" });
      }
    } catch(e) {
      console.error(e);
      toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ اللون." });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dbAction('itemColors', 'remove', { id });
      toast({ title: "تم الحذف بنجاح" });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف اللون." });
    }
  };

  return (
    <>
      <PageHeader title="إدارة الألوان">
        <AddEntityDialog
            title="إضافة لون جديد"
            description="أدخل اسم اللون والكود المكون من رقمين."
            triggerButton={
                <Button size="sm" className="gap-1">
                <PlusCircle className="h-4 w-4" />
                إضافة لون
                </Button>
            }
            >
            {({onClose}) => <ColorForm onSave={handleSave} onClose={onClose} />}
        </AddEntityDialog>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>قائمة الألوان</CardTitle>
            <CardDescription>
              إدارة الألوان المستخدمة في الأصناف لإنشاء باركود فريد.
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
                                <TableHead>اسم اللون</TableHead>
                                <TableHead>الكود</TableHead>
                                <TableHead className="text-center w-[100px]">
                                    <span className="sr-only">الإجراءات</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {itemColors && itemColors.length > 0 ? itemColors.map((color: ItemColor) => (
                                <TableRow key={color.id}>
                                    <TableCell className="font-medium">{color.name}</TableCell>
                                    <TableCell>{color.code}</TableCell>
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
                                                        title="تعديل اللون"
                                                        description="قم بتحديث تفاصيل اللون هنا."
                                                        triggerButton={
                                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                            <Edit className="ml-2 h-4 w-4" />
                                                            تعديل
                                                            </DropdownMenuItem>
                                                        }
                                                    >
                                                        {({onClose}) => <ColorForm color={color} onSave={handleSave} onClose={onClose} />}
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
                                                        هذا الإجراء سيحذف اللون بشكل دائم.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDelete(color.id!)}>متابعة</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                                        لا توجد ألوان مسجلة.
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
