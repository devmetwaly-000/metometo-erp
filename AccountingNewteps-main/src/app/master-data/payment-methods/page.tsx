

"use client";

import React from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Lock } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface PaymentMethod {
  id?: string;
  name: string;
  code: string;
  isEnabled: boolean;
  color?: string;
}

const PaymentMethodForm = ({ method, onSave, onClose, allMethods }: { method?: PaymentMethod, onSave: (data: Partial<PaymentMethod>) => void, onClose: () => void, allMethods: PaymentMethod[] }) => {
  const [formData, setFormData] = React.useState<Partial<PaymentMethod>>(
    method || { name: "", code: "", isEnabled: true, color: "#3b82f6" }
  );
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!formData.name || !formData.code) {
        toast({variant: 'destructive', title: "خطأ", description: "الاسم والكود حقول مطلوبة."});
        return;
    }
    
    // Check for duplicate name or code
    const isNameDuplicate = allMethods.some(m => m.name.trim().toLowerCase() === formData.name?.trim().toLowerCase() && m.id !== method?.id);
    if(isNameDuplicate) {
        toast({variant: 'destructive', title: "خطأ", description: "اسم طريقة الدفع هذا مستخدم بالفعل."});
        return;
    }
    const isCodeDuplicate = allMethods.some(m => m.code.trim().toLowerCase() === formData.code?.trim().toLowerCase() && m.id !== method?.id);
     if(isCodeDuplicate) {
        toast({variant: 'destructive', title: "خطأ", description: "كود طريقة الدفع هذا مستخدم بالفعل."});
        return;
    }

    await onSave(formData);
    onClose();
  };

  return (
    <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="method-name" className="text-right">
            اسم الطريقة
          </Label>
          <Input id="method-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="method-code" className="text-right">
            الكود
          </Label>
          <Input id="method-code" value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="method-color" className="text-right">
            اللون المميز
          </Label>
          <div className="col-span-3 flex items-center gap-2">
            <Input 
              id="method-color" 
              type="color" 
              value={formData.color || "#3b82f6"} 
              onChange={(e) => setFormData({...formData, color: e.target.value})} 
              className="w-16 h-10 p-1 cursor-pointer" 
            />
            <span className="text-sm text-muted-foreground">{formData.color || "#3b82f6"}</span>
          </div>
        </div>
         <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="method-enabled" className="text-right">
            الحالة
          </Label>
          <Switch id="method-enabled" checked={formData.isEnabled} onCheckedChange={(checked) => setFormData({...formData, isEnabled: checked})} />
        </div>
       <div className="flex justify-end pt-4">
         <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </div>
  );
};


export default function PaymentMethodsPage() {
  const { paymentMethods, dbAction, loading } = useData();
  const { toast } = useToast();

  const handleSave = async (method: Partial<PaymentMethod>) => {
    try {
      const { id, ...data } = method;
      if (id) {
        await dbAction('paymentMethods', 'update', { id, data });
        toast({ title: "تم التحديث بنجاح" });
      } else {
        await dbAction('paymentMethods', 'add', {
            name: data.name, 
            code: data.code, 
            isEnabled: data.isEnabled ?? true,
            color: data.color
        });
        toast({ title: "تمت إضافة طريقة الدفع بنجاح" });
      }
    } catch(e) {
      console.error(e);
      toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ طريقة الدفع." });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dbAction('paymentMethods', 'remove', { id });
      toast({ title: "تم الحذف بنجاح" });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف طريقة الدفع." });
    }
  };
  
  const isDefaultMethod = (method: PaymentMethod) => method.code === 'CASH';

  const processedPaymentMethods = React.useMemo(() => {
    const methods = [...(paymentMethods || [])];
    const hasCash = methods.some(m => m.code === 'CASH');
    if (!hasCash) {
        methods.unshift({ id: 'default-cash', name: 'نقدي', code: 'CASH', isEnabled: true });
    }
    return methods;
  }, [paymentMethods]);

  return (
    <>
      <PageHeader title="إدارة طرق الدفع">
        <AddEntityDialog
            title="إضافة طريقة دفع جديدة"
            description="أدخل تفاصيل طريقة الدفع التي ستظهر في شاشة الكاشير."
            triggerButton={
                <Button size="sm" className="gap-1">
                <PlusCircle className="h-4 w-4" />
                إضافة طريقة دفع
                </Button>
            }
            >
            {({onClose}) => <PaymentMethodForm onSave={handleSave} onClose={onClose} allMethods={paymentMethods} />}
        </AddEntityDialog>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>قائمة طرق الدفع</CardTitle>
            <CardDescription>
              إدارة طرق الدفع المتاحة في نقاط البيع.
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
                                <TableHead>اسم الطريقة</TableHead>
                                <TableHead>الكود</TableHead>
                                <TableHead>الحالة</TableHead>
                                <TableHead className="text-center w-[100px]">
                                    <span className="sr-only">الإجراءات</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {processedPaymentMethods && processedPaymentMethods.length > 0 ? processedPaymentMethods.map((method: PaymentMethod) => (
                                <TableRow key={method.id} className={isDefaultMethod(method) ? 'bg-muted/30' : ''}>
                                    <TableCell className="font-medium">
                                      <div className="flex items-center gap-2">
                                        {method.color && (
                                          <div 
                                            className="w-4 h-4 rounded-full border shadow-sm" 
                                            style={{ backgroundColor: method.color }} 
                                            title={method.color}
                                          />
                                        )}
                                        {method.name}
                                      </div>
                                    </TableCell>
                                    <TableCell className="font-mono">{method.code}</TableCell>
                                    <TableCell>
                                        <Badge variant={method.isEnabled ? 'default' : 'destructive'}>
                                          {method.isEnabled ? 'مفعلة' : 'معطلة'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {isDefaultMethod(method) ? (
                                            <div className="flex justify-center items-center text-muted-foreground" title="طريقة دفع أساسية لا يمكن تعديلها أو حذفها.">
                                                <Lock className="h-4 w-4" />
                                            </div>
                                        ) : (
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
                                                            title="تعديل طريقة الدفع"
                                                            description="قم بتحديث تفاصيل طريقة الدفع."
                                                            triggerButton={
                                                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                                <Edit className="ml-2 h-4 w-4" />
                                                                تعديل
                                                                </DropdownMenuItem>
                                                            }
                                                        >
                                                            {({onClose}) => <PaymentMethodForm method={method} onSave={handleSave} onClose={onClose} allMethods={paymentMethods} />}
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
                                                            هذا الإجراء سيحذف طريقة الدفع بشكل دائم.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDelete(method.id!)}>متابعة</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                        لا توجد طرق دفع مسجلة.
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
