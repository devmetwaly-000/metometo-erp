"use client";

import React, { useState, useEffect, useMemo } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit, Trash2, Loader2, Eye } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from "@/components/ui/badge";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";

import { Switch } from "@/components/ui/switch";
import Link from "next/link";

interface Branch {
  id?: string;
  code: string;
  name: string;
  address: string;
  isRepWarehouse?: boolean;
  isClosed?: boolean;
}

const BranchForm = ({ branch, onSave, onClose, allWarehouses }: { branch?: Branch, onSave: (branch: Partial<Branch>) => void, onClose: () => void, allWarehouses: Branch[] }) => {
  const [formData, setFormData] = React.useState<Partial<Branch>>(
    branch || { name: "", address: "", code: "", isClosed: false }
  );

  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!formData.code || !formData.name) {
        toast({ variant: "destructive", title: "خطأ", description: "كود المخزن واسم المخزن حقول مطلوبة." });
        return;
    }
    
    // Check for unique code across all warehouses and branches
    const isCodeDuplicate = allWarehouses.some(
        (w) => String(w.code) === String(formData.code) && w.id !== branch?.id
    );

    if (isCodeDuplicate) {
        toast({ variant: "destructive", title: "خطأ", description: "كود المخزن مستخدم بالفعل. يرجى اختيار كود آخر." });
        return;
    }

    await onSave({ 
        ...branch, 
        ...formData,
        code: String(formData.code), // Ensure code is a string
    });
    onClose();
  };

  return (
    <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="branch-code" className="text-right">
            كود المخزن
          </Label>
          <Input id="branch-code" value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="branch-name" className="text-right">
            اسم المخزن
          </Label>
          <Input id="branch-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="branch-address" className="text-right">
            العنوان
          </Label>
          <Textarea id="branch-address" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="is-closed" className="text-right">
            حالة المخزن
          </Label>
          <div className="col-span-3 flex items-center space-x-2 rtl:space-x-reverse">
            <Switch
              id="is-closed"
              checked={formData.isClosed}
              onCheckedChange={(checked) => setFormData({ ...formData, isClosed: checked })}
            />
            <Label htmlFor="is-closed" className="cursor-pointer">
              {formData.isClosed ? "مغلق (لا يمكن الصرف له)" : "مفتوح"}
            </Label>
          </div>
        </div>
       <div className="flex justify-end pt-4">
         <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </div>
  );
};


export default function DelegateWarehousesPage() {
  const { warehouses, loading, dbAction } = useData();
  const { toast } = useToast();

  const branches = useMemo(() => warehouses.filter((w: any) => w.isRepWarehouse), [warehouses]);

  const handleSave = async (branch: Partial<Branch>) => {
    try {
      if (branch.id) {
        await dbAction('warehouses', 'update', { id: branch.id, data: { name: branch.name, address: branch.address, code: branch.code, isClosed: branch.isClosed } });
        toast({ title: "تم التحديث بنجاح" });
      }
    } catch(e) {
      console.error(e);
      toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ المخزن." });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dbAction('warehouses', 'remove', { id });
      toast({ title: "تم الحذف بنجاح" });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف المخزن." });
    }
  };

  return (
    <>
      <PageHeader title="مخازن المناديب">
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>قائمة مخازن المناديب</CardTitle>
            <CardDescription>
              عرض وإدارة مخازن العهدة الخاصة بالمناديب.
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
                                <TableHead>كود المخزن</TableHead>
                                <TableHead>اسم المخزن</TableHead>
                                <TableHead>العنوان</TableHead>
                                <TableHead className="text-center">الحالة</TableHead>
                                <TableHead className="text-center w-[100px]">
                                    <span className="sr-only">الإجراءات</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {branches.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                        لا توجد مخازن مناديب حالياً.
                                    </TableCell>
                                </TableRow>
                            )}
                            {branches.map((branch: Branch) => (
                                <TableRow key={branch.id}>
                                    <TableCell>{branch.code || "-"}</TableCell>
                                    <TableCell className="font-medium">{branch.name}</TableCell>
                                    <TableCell>{branch.address}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={branch.isClosed ? "destructive" : "default"}>
                                            {branch.isClosed ? "مغلق" : "مفتوح"}
                                        </Badge>
                                    </TableCell>
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
                                                    <DropdownMenuItem asChild>
                                                        <Link href={`/master-data/delegate-warehouses/${branch.id}`} className="flex items-center cursor-pointer">
                                                            <Eye className="ml-2 h-4 w-4" />
                                                            عرض التفاصيل
                                                        </Link>
                                                    </DropdownMenuItem>
                                                    <AddEntityDialog
                                                        title="تعديل المخزن"
                                                        description="قم بتحديث تفاصيل المخزن هنا."
                                                        triggerButton={
                                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                            <Edit className="ml-2 h-4 w-4" />
                                                            تعديل
                                                            </DropdownMenuItem>
                                                        }
                                                    >
                                                        {({onClose}) => <BranchForm branch={branch} onSave={handleSave} onClose={onClose} allWarehouses={warehouses} />}
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
                                                        هذا الإجراء سيحذف مخزن المندوب بشكل دائم. تأكد من عدم وجود أرصدة مرتبطة به.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDelete(branch.id!)}>متابعة</AlertDialogAction>
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
