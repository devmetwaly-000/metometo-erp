
"use client";

import React from "react";
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

interface DeliveryStaff {
  id?: string;
  name: string;
  phone: string;
}

const StaffForm = ({ staff, onSave, onClose }: { staff?: DeliveryStaff, onSave: (data: DeliveryStaff) => void, onClose: () => void }) => {
  const [formData, setFormData] = React.useState<DeliveryStaff>(
    staff || { name: "", phone: "" }
  );

  const handleSubmit = () => {
    if (!formData.name || !formData.phone) {
        alert("الاسم ورقم الهاتف حقول مطلوبة.");
        return;
    }
    onSave(formData);
    onClose();
  };

  return (
    <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="staff-name" className="text-right">
            اسم الطيار
          </Label>
          <Input id="staff-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="staff-phone" className="text-right">
            رقم الهاتف
          </Label>
          <Input id="staff-phone" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="col-span-3" />
        </div>
       <div className="flex justify-end pt-4">
         <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </div>
  );
};


export default function DeliveryStaffPage() {
  const { deliveryStaff, dbAction, loading } = useData();
  const { toast } = useToast();

  const handleSave = async (staff: DeliveryStaff & {id?: string}) => {
    try {
      const { id, ...data } = staff;
      if (id) {
        await dbAction('deliveryStaff', 'update', { id, data });
        toast({ title: "تم التحديث بنجاح" });
      } else {
        await dbAction('deliveryStaff', 'add', data);
        toast({ title: "تمت إضافة الطيار بنجاح" });
      }
    } catch(e) {
      console.error(e);
      toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ بيانات الطيار." });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dbAction('deliveryStaff', 'remove', { id });
      toast({ title: "تم الحذف بنجاح" });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف الطيار." });
    }
  };

  return (
    <>
      <PageHeader title="إدارة الطيارين">
        <AddEntityDialog
            title="إضافة طيار جديد"
            description="أدخل بيانات الطيار هنا. لن يكون له حساب للدخول على النظام."
            triggerButton={
                <Button size="sm" className="gap-1">
                <PlusCircle className="h-4 w-4" />
                إضافة طيار
                </Button>
            }
            >
            {({ onClose }) => <StaffForm onSave={handleSave} onClose={onClose} />}
        </AddEntityDialog>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>قائمة الطيارين</CardTitle>
            <CardDescription>
              إدارة موظفي التوصيل (الطيارين).
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
                                <TableHead>اسم الطيار</TableHead>
                                <TableHead>رقم الهاتف</TableHead>
                                <TableHead className="text-center w-[100px]">
                                    <span className="sr-only">الإجراءات</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {deliveryStaff && deliveryStaff.length > 0 ? deliveryStaff.map((staff: DeliveryStaff) => (
                                <TableRow key={staff.id}>
                                    <TableCell className="font-medium">{staff.name}</TableCell>
                                    <TableCell>{staff.phone}</TableCell>
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
                                                        title="تعديل بيانات الطيار"
                                                        description="قم بتحديث تفاصيل الطيار هنا."
                                                        triggerButton={
                                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                            <Edit className="ml-2 h-4 w-4" />
                                                            تعديل
                                                            </DropdownMenuItem>
                                                        }
                                                    >
                                                        {({ onClose }) => <StaffForm staff={staff} onSave={handleSave} onClose={onClose} />}
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
                                                        هذا الإجراء سيحذف الطيار بشكل دائم.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDelete(staff.id!)}>متابعة</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                                        لا يوجد طيارون مسجلون.
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
