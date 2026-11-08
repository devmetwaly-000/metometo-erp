

"use client";

import React, { useState, useMemo } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Target } from "lucide-react";
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
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/ui/combobox";


interface Seller {
  id?: string;
  name: string;
  code: string;
  warehouseId?: string;
  color?: string; // New color property
}

const COLORS = [
  'bg-slate-500', 'bg-gray-500', 'bg-zinc-500', 'bg-neutral-500', 'bg-stone-500', 
  'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-lime-500',
  'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
  'bg-pink-500', 'bg-rose-500'
];


const SellerForm = ({ seller, onSave, onClose, allSellers, warehouses }: { seller?: Seller, onSave: (data: Partial<Seller>) => void, onClose: () => void, allSellers: Seller[], warehouses: any[] }) => {
  const [formData, setFormData] = React.useState<Partial<Seller>>(
    seller || { name: "", code: "", warehouseId: "", color: COLORS[0] }
  );
  const { toast } = useToast();

  const warehouseOptions = React.useMemo(() => warehouses.map(w => ({value: w.id, label: w.name})), [warehouses]);

  const handleSubmit = () => {
    if (!formData.name || !formData.code || !formData.warehouseId) {
        toast({ variant: "destructive", title: "خطأ", description: "الاسم والكود والفرع حقول مطلوبة." });
        return;
    }
    const isCodeDuplicate = (allSellers || []).some(
        (s) => s.code === formData.code && s.id !== seller?.id
    );
    if (isCodeDuplicate) {
        toast({ variant: "destructive", title: "خطأ", description: "هذا الكود مستخدم بالفعل." });
        return;
    }

    onSave(formData);
    onClose();
  };

  return (
    <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="seller-name" className="text-right">
            اسم البائع
          </Label>
          <Input id="seller-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="seller-code" className="text-right">
            كود البائع
          </Label>
          <Input id="seller-code" value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="seller-warehouse" className="text-right">الفرع</Label>
            <div className="col-span-3">
              <Combobox
                options={warehouseOptions}
                value={formData.warehouseId || ""}
                onValueChange={(value) => setFormData({...formData, warehouseId: value})}
                placeholder="اختر الفرع..."
                emptyMessage="لا يوجد فروع"
              />
            </div>
        </div>
        <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">اللون المميز</Label>
             <div className="col-span-3 grid grid-cols-8 gap-2">
                {COLORS.map(color => (
                    <button key={color} onClick={() => setFormData({...formData, color})} className={`w-8 h-8 rounded-full ${color} transition-transform transform hover:scale-110 ${formData.color === color ? 'ring-2 ring-offset-2 ring-primary' : ''}`} />
                ))}
            </div>
        </div>
       <div className="flex justify-end pt-4">
         <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </div>
  );
};


export default function SellersPage() {
  const { sellers, warehouses, dbAction, loading } = useData();
  const { toast } = useToast();
  const router = useRouter();


  const handleSave = async (seller: Partial<Seller>) => {
    try {
      const { id, ...data } = seller;
      if (id) {
        await dbAction('sellers', 'update', { id, data });
        toast({ title: "تم التحديث بنجاح" });
      } else {
        await dbAction('sellers', 'add', data);
        toast({ title: "تمت إضافة البائع بنجاح" });
      }
    } catch(e) {
      console.error(e);
      toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ بيانات البائع." });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dbAction('sellers', 'remove', { id });
      toast({ title: "تم الحذف بنجاح" });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف البائع." });
    }
  };
  
  const getWarehouseName = (warehouseId?: string) => {
    if (!warehouseId) return 'غير محدد';
    return warehouses.find((w: any) => w.id === warehouseId)?.name || 'غير معروف';
  };

  return (
    <>
      <PageHeader title="إدارة البائعين">
        <AddEntityDialog
            title="إضافة بائع جديد"
            description="أدخل بيانات البائع الذي سيتم تسجيل المبيعات باسمه."
            triggerButton={
                <Button size="sm" className="gap-1">
                <PlusCircle className="h-4 w-4" />
                إضافة بائع
                </Button>
            }
            >
            <SellerForm onSave={handleSave} onClose={() => {}} allSellers={sellers} warehouses={warehouses} />
        </AddEntityDialog>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>قائمة البائعين</CardTitle>
            <CardDescription>
              إدارة بائعي المعرض لتتبع مبيعات كل منهم.
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
                                <TableHead>اسم البائع</TableHead>
                                <TableHead>كود البائع</TableHead>
                                <TableHead>الفرع</TableHead>
                                <TableHead className="text-center w-[100px]">
                                    <span className="sr-only">الإجراءات</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sellers && sellers.length > 0 ? sellers.map((seller: Seller) => (
                                <TableRow key={seller.id}>
                                    <TableCell className="font-medium flex items-center gap-2">
                                        <div className={`w-4 h-4 rounded-full ${seller.color || 'bg-gray-200'}`}/>
                                        {seller.name}
                                    </TableCell>
                                    <TableCell>{seller.code}</TableCell>
                                    <TableCell>{getWarehouseName(seller.warehouseId)}</TableCell>
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
                                                    <DropdownMenuItem onSelect={() => router.push(`/reports/seller-targets?sellerId=${seller.id}`)}>
                                                        <Target className="ml-2 h-4 w-4"/>
                                                        عرض تقرير الهدف
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <AddEntityDialog
                                                        title="تعديل بيانات البائع"
                                                        description="قم بتحديث تفاصيل البائع هنا."
                                                        triggerButton={
                                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                            <Edit className="ml-2 h-4 w-4" />
                                                            تعديل
                                                            </DropdownMenuItem>
                                                        }
                                                    >
                                                        <SellerForm seller={seller} onSave={handleSave} onClose={() => {}} allSellers={sellers} warehouses={warehouses} />
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
                                                        هذا الإجراء سيحذف البائع بشكل دائم.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDelete(seller.id!)}>متابعة</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                        لا يوجد بائعون مسجلون.
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
