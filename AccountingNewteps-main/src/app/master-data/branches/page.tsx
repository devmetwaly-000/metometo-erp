
"use client";

import React, { useState, useEffect, useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from "@/contexts/data-provider";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

interface Branch {
  id?: string;
  code: string;
  name: string;
  address: string;
}

const BranchForm = ({ branch, onSave, onClose, allWarehouses }: { branch?: Branch, onSave: (branch: Partial<Branch> & { createCashAccount?: boolean, createPosTerminal?: boolean, posTerminalName?: string, posTerminalCode?: string }) => Promise<void>, onClose: () => void, allWarehouses: Branch[] }) => {
  const [formData, setFormData] = React.useState<Partial<Branch>>(
    branch || { name: "", address: "", code: "" }
  );
  const [createCashAccount, setCreateCashAccount] = React.useState(!branch);
  const [createPosTerminal, setCreatePosTerminal] = React.useState(!branch);
  const [posTerminalName, setPosTerminalName] = React.useState(branch?.name ? `كاشير فرع ${branch.name}` : "");
  const [posTerminalCode, setPosTerminalCode] = React.useState("");

  const { toast } = useToast();
  
  React.useEffect(() => {
    if(!branch) {
      setPosTerminalName(`كاشير فرع ${formData.name}`);
    }
  }, [formData.name, branch]);

  const handleSubmit = async () => {
    if (!formData.code || !formData.name) {
        toast({ variant: "destructive", title: "خطأ", description: "كود الفرع واسم الفرع حقول مطلوبة." });
        return;
    }
    
    if (createPosTerminal && (!posTerminalName || !posTerminalCode)) {
         toast({ variant: "destructive", title: "خطأ", description: "الرجاء إدخل اسم وكود لنقطة البيع." });
        return;
    }

    // Check for unique code across all warehouses and branches
    const isCodeDuplicate = allWarehouses.some(
        (w) => String(w.code) === String(formData.code) && w.id !== branch?.id
    );

    if (isCodeDuplicate) {
        toast({ variant: "destructive", title: "خطأ", description: "كود الفرع/المخزن مستخدم بالفعل. يرجى اختيار كود آخر." });
        return;
    }

    await onSave({ 
        ...branch, 
        ...formData,
        code: String(formData.code), // Ensure code is a string
        createCashAccount: !branch ? createCashAccount : undefined,
        createPosTerminal: !branch ? createPosTerminal : undefined,
        posTerminalName: !branch ? posTerminalName : undefined,
        posTerminalCode: !branch ? posTerminalCode : undefined,
    });
    onClose();
  };

  return (
    <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="branch-code" className="text-right">
            كود الفرع
          </Label>
          <Input id="branch-code" value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="branch-name" className="text-right">
            اسم الفرع
          </Label>
          <Input id="branch-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="branch-address" className="text-right">
            العنوان
          </Label>
          <Textarea id="branch-address" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="col-span-3" />
        </div>
        {!branch?.id && (
            <div className="grid grid-cols-4 items-center gap-4">
                <div className="col-start-2 col-span-3 flex flex-col space-y-3 pt-2">
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <Checkbox 
                            id="create-cash-account" 
                            checked={createCashAccount} 
                            onCheckedChange={(checked) => setCreateCashAccount(!!checked)} 
                        />
                        <Label htmlFor="create-cash-account" className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            إنشاء خزينة خاصة للفرع
                        </Label>
                    </div>
                     <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <Checkbox 
                            id="create-pos-terminal" 
                            checked={createPosTerminal} 
                            onCheckedChange={(checked) => setCreatePosTerminal(!!checked)} 
                        />
                        <Label htmlFor="create-pos-terminal" className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            إنشاء نقطة بيع خاصة بالفرع
                        </Label>
                    </div>
                     {createPosTerminal && (
                        <div className="space-y-3 pl-6 rtl:pr-6">
                            <div className="space-y-2">
                                <Label htmlFor="pos-terminal-name">اسم نقطة البيع</Label>
                                <Input id="pos-terminal-name" value={posTerminalName} onChange={e => setPosTerminalName(e.target.value)} />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="pos-terminal-code">كود نقطة البيع</Label>
                                <Input id="pos-terminal-code" value={posTerminalCode} onChange={e => setPosTerminalCode(e.target.value)} placeholder="مثال: 1 أو C1"/>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
       <div className="flex justify-end pt-4">
         <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </div>
  );
};


export default function BranchesPage() {
  const { warehouses, posTerminals, loading, dbAction, licenses } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [clickCount, setClickCount] = useState(0);
  const [isSecretVisible, setIsSecretVisible] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState("");

  const branches = useMemo(() => {
    const b = warehouses.filter((w: any) => !w.isMain && !w.isRepWarehouse && !w.repId);
    if (user?.warehouseIds?.includes('all')) return b;
    return b.filter((w: any) => user?.warehouseIds?.includes(w.id));
  }, [warehouses, user]);

  useEffect(() => {
    if (clickCount >= 10) {
      setIsPasswordDialogOpen(true);
      setClickCount(0); // Reset after triggering
    }
  }, [clickCount]);

  const handleTitleClick = () => {
    setClickCount(prev => prev + 1);
  };

  const handlePasswordSubmit = () => {
    if (password === 'metometo') {
      setIsSecretVisible(true);
      setIsPasswordDialogOpen(false);
      toast({ title: "تم تفعيل وضع التعديل." });
    } else {
      toast({ variant: 'destructive', title: "كلمة المرور غير صحيحة" });
    }
    setPassword("");
  };


  const handleSave = async (branch: Partial<Branch> & { createCashAccount?: boolean, createPosTerminal?: boolean, posTerminalName?: string, posTerminalCode?: string }) => {
    try {
      if (branch.id) {
        await dbAction('warehouses', 'update', { id: branch.id, data: { name: branch.name, address: branch.address, code: branch.code } });
        toast({ title: "تم التحديث بنجاح" });
      } else {
        const newBranchData = {
          name: branch.name,
          address: branch.address,
          code: branch.code,
        };

        const newBranchId = await dbAction('warehouses', 'add', newBranchData);
        if (!newBranchId) {
            toast({ variant: "destructive", title: "خطأ فادح", description: "فشل إنشاء الفرع الجديد. لم يتم إرجاع معرف." });
            return;
        }
        
        // --- Sync License and User Permissions ---
        if (user) {
            const licenseKey = user.themeSettings?.licenseKey;
            const license = (licenses || []).find((l: any) => l.key === licenseKey);
            
            if (license && license.assignedWarehouseIds && !license.assignedWarehouseIds.includes('all')) {
                const updatedWarehouses = [...license.assignedWarehouseIds, newBranchId];
                await dbAction('licenses', 'update', { id: license.id, data: { assignedWarehouseIds: updatedWarehouses } });
                
                const updatedUserWarehouses = [...(user.warehouseIds || []), newBranchId];
                 await dbAction('users', 'update', { id: user.id, data: { warehouseIds: updatedUserWarehouses } });
            }
        }
        // --- End Sync ---

        let successMessages = ["تمت إضافة الفرع بنجاح."];

        if (branch.createCashAccount) {
          await dbAction('cashAccounts', 'add', {
            name: `خزينة فرع: ${branch.name}`,
            type: 'cash',
            openingBalance: 0,
            warehouseId: newBranchId,
          });
          successMessages.push("تم إنشاء الخزينة الخاصة به.");
        }
        
        if (branch.createPosTerminal && branch.posTerminalName && branch.posTerminalCode) {
            const isCodeDuplicate = posTerminals.some(
                (t: any) => String(t.code) === String(branch.posTerminalCode)
            );
             if (isCodeDuplicate) {
                toast({ variant: "destructive", title: "خطأ", description: "كود نقطة البيع مستخدم بالفعل. لم يتم إنشاء نقطة البيع." });
             } else {
                 await dbAction('posTerminals', 'add', {
                    name: branch.posTerminalName,
                    warehouseId: newBranchId,
                    code: branch.posTerminalCode,
                });
                successMessages.push("تم إنشاء نقطة البيع الخاصة به.");
             }
        }

        toast({ title: "اكتملت العملية", description: successMessages.join(' ') });
      }
    } catch(e) {
      console.error(e);
      toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ الفرع." });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dbAction('warehouses', 'remove', { id });
      toast({ title: "تم الحذف بنجاح" });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف الفرع." });
    }
  };

  return (
    <>
      <PageHeader title="الفروع">
        {isSecretVisible && (
            <AddEntityDialog
            title="إضافة فرع جديد"
            description="أدخل تفاصيل الفرع الجديد هنا."
            triggerButton={
                <Button size="sm" className="gap-1 animate-in fade-in">
                <PlusCircle className="h-4 w-4" />
                إضافة فرع
                </Button>
            }
            >
            {({onClose}) => <BranchForm onSave={handleSave} onClose={onClose} allWarehouses={warehouses} />}
            </AddEntityDialog>
        )}
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
       <AlertDialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>إدخال كلمة المرور</AlertDialogTitle>
                    <AlertDialogDescription>
                       لإظهار زر إضافة فرع، يرجى إدخال كلمة المرور.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                 <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="password" className="text-right">
                            كلمة المرور
                        </Label>
                        <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setClickCount(0)}>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={handlePasswordSubmit}>تأكيد</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <Card>
          <CardHeader>
            <CardTitle onClick={handleTitleClick} className="cursor-pointer">قائمة الفروع</CardTitle>
            <CardDescription>
              إدارة الفروع الخاصة بك من هنا.
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
                                <TableHead>كود الفرع</TableHead>
                                <TableHead>اسم الفرع</TableHead>
                                <TableHead>العنوان</TableHead>
                                <TableHead className="text-center w-[100px]">
                                    <span className="sr-only">الإجراءات</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {branches.map((branch: Branch) => (
                                <TableRow key={branch.id}>
                                    <TableCell>{branch.code || "-"}</TableCell>
                                    <TableCell className="font-medium">{branch.name}</TableCell>
                                    <TableCell>{branch.address}</TableCell>
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
                                                        title="تعديل الفرع"
                                                        description="قم بتحديث تفاصيل الفرع هنا."
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
                                                        هذا الإجراء سيحذف الفرع بشكل دائم. لا يمكن التراجع عن هذا الإجراء.
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
