"use client";

import React, { useState, useMemo } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { 
  PlusCircle, 
  Loader2, 
  Warehouse, 
  UserPlus, 
  Phone, 
  Shield, 
  UserCheck, 
  ExternalLink,
  Users
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useData } from "@/contexts/data-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { usePermissions } from "@/contexts/permissions-context";

export default function SalesRepsPage() {
    const { users, warehouses, allWarehouses, repWarehouses, dbAction, loading } = useData();
    const { toast } = useToast();
    const router = useRouter();
    const { can } = usePermissions();

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        loginName: "",
        password: "",
        mainWarehouseId: "",
    });

    const salesReps = useMemo(() => {
        return users.filter((user: any) => 
            user.isSalesRep || 
            user.role === 'مندوب' || 
            (typeof user.role === 'string' && user.role.includes('مندوب'))
        );
    }, [users]);

    // Find the dedicated rep warehouse for a given sales rep
    const getRepWarehouseInfo = (rep: any) => {
        if (!rep) return { name: 'غير محدد', code: '-' };
        
        // 1. Look for warehouse linked directly via repId
        const directRepWh = allWarehouses.find((w: any) => w.repId === rep.id);
        if (directRepWh) {
            return { name: directRepWh.name, code: directRepWh.code || 'REP' };
        }

        // 2. Look in user's warehouseIds for any rep warehouse
        if (Array.isArray(rep.warehouseIds)) {
            const foundWh = allWarehouses.find((w: any) => 
                rep.warehouseIds.includes(w.id) && 
                (w.isRepWarehouse || w.warehouseType === 'rep' || (w.code && w.code.startsWith('REP-')))
            );
            if (foundWh) {
                return { name: foundWh.name, code: foundWh.code || 'REP' };
            }
        }

        return { name: 'جاري إنشاء العهدة...', code: '-' };
    };

    // Get the base operating branch (e.g. Main branch)
    const getMainBranchName = (rep: any) => {
        if (!rep || !rep.warehouseIds) return 'الفرع الرئيسي';
        if (rep.warehouseIds.includes('all')) return 'كافة الفروع والمخازن';
        
        const physicalBranch = warehouses.find((w: any) => 
            rep.warehouseIds.includes(w.id) && !w.isRepWarehouse && w.warehouseType !== 'rep'
        );
        return physicalBranch?.name || 'الفرع الرئيسي';
    };

    const branchOptions = useMemo(() => {
        return warehouses
            .filter((w: any) => !w.isRepWarehouse && w.warehouseType !== 'rep')
            .map((w: any) => ({
                value: w.id,
                label: w.name + (w.code ? ` (${w.code})` : '')
            }));
    }, [warehouses]);

    const handleCreateRep = async () => {
        if (!formData.name.trim() || !formData.loginName.trim() || !formData.password.trim()) {
            toast({
                variant: "destructive",
                title: "بيانات ناقصة",
                description: "يرجى ملء اسم المندوب، اسم الدخول، وكلمة المرور."
            });
            return;
        }

        // Check duplicate login name
        const duplicate = users.find((u: any) => u.loginName === formData.loginName.trim());
        if (duplicate) {
            toast({
                variant: "destructive",
                title: "اسم دخول مكرر",
                description: "اسم الدخول هذا مستخدم بالفعل. يرجى اختيار اسم دخول آخر."
            });
            return;
        }

        setIsSaving(true);
        try {
            const targetWarehouseIds: string[] = [];
            if (formData.mainWarehouseId) {
                targetWarehouseIds.push(formData.mainWarehouseId);
            } else if (warehouses.length > 0) {
                targetWarehouseIds.push(warehouses[0].id);
            }

            const repCount = allWarehouses.filter((w: any) => w.isRepWarehouse || w.warehouseType === 'rep').length;
            const repCode = `REP-${String(repCount + 1).padStart(2, '0')}`;
            const warehouseName = `عهدة المندوب: ${formData.name.trim()}`;

            const newUserId = await dbAction("users", "add", {
                name: formData.name.trim(),
                phone: formData.phone.trim(),
                loginName: formData.loginName.trim(),
                password: formData.password.trim(),
                role: 'مندوب مبيعات',
                isSalesRep: true,
                canOpenOwnShift: true,
                warehouseIds: targetWarehouseIds,
                uid: `db_${Date.now()}`
            }) as string;

            // Ensure client optimistic state creation for the warehouse as well
            if (newUserId) {
                const newWhId = await dbAction('warehouses', 'add', {
                    name: warehouseName,
                    code: repCode,
                    warehouseType: 'rep',
                    isRepWarehouse: true,
                    repId: newUserId
                }) as string;

                await dbAction('cashAccounts', 'add', {
                    name: `عهدة: ${formData.name.trim()}`,
                    type: 'cash',
                    openingBalance: 0,
                    userId: newUserId,
                    warehouseId: newWhId
                });

                if (newWhId && !targetWarehouseIds.includes(newWhId)) {
                    await dbAction('users', 'update', {
                        id: newUserId,
                        data: { warehouseIds: [...targetWarehouseIds, newWhId] }
                    });
                }
            }

            toast({
                title: "تم إضافة المندوب بنجاح",
                description: `تم إنشاء المندوب وتخصيص مخزن العهدة (${repCode}) وحساب النقدية له.`
            });

            setIsAddDialogOpen(false);
            setFormData({
                name: "",
                phone: "",
                loginName: "",
                password: "",
                mainWarehouseId: "",
            });
        } catch (error: any) {
            console.error("Create rep error:", error);
            toast({
                variant: "destructive",
                title: "خطأ",
                description: error.message || "فشل إنشاء المندوب."
            });
        } finally {
            setIsSaving(false);
        }
    };
    
  return (
    <>
      <PageHeader title="مناديب المبيعات">
        <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1 bg-primary text-primary-foreground" onClick={() => setIsAddDialogOpen(true)}>
                <UserPlus className="h-4 w-4" />
                إضافة مندوب جديد
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => router.push('/users')}>
                <Users className="h-4 w-4" />
                إدارة المستخدمين
            </Button>
        </div>
      </PageHeader>
      
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
                <CardHeader className="pb-2">
                    <CardDescription>إجمالي المناديب</CardDescription>
                    <CardTitle className="text-2xl font-bold flex items-center justify-between">
                        <span>{salesReps.length}</span>
                        <UserCheck className="h-5 w-5 text-muted-foreground" />
                    </CardTitle>
                </CardHeader>
            </Card>
            <Card>
                <CardHeader className="pb-2">
                    <CardDescription>مخازن عهد المناديب</CardDescription>
                    <CardTitle className="text-2xl font-bold flex items-center justify-between">
                        <span>{allWarehouses.filter((w: any) => w.isRepWarehouse || w.warehouseType === 'rep').length}</span>
                        <Warehouse className="h-5 w-5 text-muted-foreground" />
                    </CardTitle>
                </CardHeader>
            </Card>
            <Card>
                <CardHeader className="pb-2">
                    <CardDescription>الفروع التابعين لها</CardDescription>
                    <CardTitle className="text-2xl font-bold flex items-center justify-between">
                        <span>{warehouses.filter((w: any) => !w.isRepWarehouse).length}</span>
                        <Shield className="h-5 w-5 text-muted-foreground" />
                    </CardTitle>
                </CardHeader>
            </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>قائمة مناديب المبيعات ومخازن العهد المرتبطة</CardTitle>
            <CardDescription>
              يتم إنشاء مخزن عهدة خاص تلقائياً لكل مندوب عند إنشائه، لمتابعة حركات صرف البضاعة، المبيعات الميدانية، والمرتجعات.
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
                                <TableHead>اسم المندوب</TableHead>
                                <TableHead>اسم الدخول</TableHead>
                                <TableHead>رقم الهاتف</TableHead>
                                <TableHead className="text-center">كود العهدة</TableHead>
                                <TableHead>مخزن عهدة المندوب</TableHead>
                                <TableHead>الفرع الرئيسي التابع له</TableHead>
                                <TableHead className="text-center">إدارة</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {salesReps.map((rep: any) => {
                                const whInfo = getRepWarehouseInfo(rep);
                                return (
                                    <TableRow key={rep.id}>
                                        <TableCell className="font-medium flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                                {rep.name ? rep.name.charAt(0) : 'م'}
                                            </div>
                                            <span>{rep.name}</span>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{rep.loginName || '-'}</TableCell>
                                        <TableCell dir="ltr" className="text-right">{rep.phone || '-'}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">
                                                {whInfo.code}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5 font-medium">
                                                <Warehouse className="h-4 w-4 text-muted-foreground" />
                                                <span>{whInfo.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{getMainBranchName(rep)}</TableCell>
                                        <TableCell className="text-center">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="gap-1 text-xs" 
                                                onClick={() => router.push(`/users`)}
                                            >
                                                <span>تعديل</span>
                                                <ExternalLink className="h-3 w-3" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                             {salesReps.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                        لا يوجد مناديب مبيعات حالياً. اضغط على زر "إضافة مندوب جديد" لإنشاء أول مندوب ومخزن عهدته.
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

      {/* Add Sales Rep Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-md">
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                      <UserPlus className="h-5 w-5 text-primary" />
                      إضافة مندوب مبيعات جديد
                  </DialogTitle>
                  <DialogDescription>
                      أدخل بيانات المندوب؛ سيتم تلقائياً إنشاء مخزن عهدة خاص به وتخصيص حساب خزينة لعهدته.
                  </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-3">
                  <div className="space-y-2">
                      <Label htmlFor="rep-name">اسم المندوب <span className="text-destructive">*</span></Label>
                      <Input 
                          id="rep-name" 
                          placeholder="مثال: أحمد محمد"
                          value={formData.name} 
                          onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                      />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label htmlFor="rep-login">اسم الدخول <span className="text-destructive">*</span></Label>
                          <Input 
                              id="rep-login" 
                              placeholder="اسم تسجيل الدخول"
                              value={formData.loginName} 
                              onChange={(e) => setFormData(p => ({ ...p, loginName: e.target.value }))}
                          />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="rep-pass">كلمة المرور <span className="text-destructive">*</span></Label>
                          <Input 
                              id="rep-pass" 
                              type="password"
                              placeholder="كلمة المرور"
                              value={formData.password} 
                              onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
                          />
                      </div>
                  </div>

                  <div className="space-y-2">
                      <Label htmlFor="rep-phone">رقم الهاتف</Label>
                      <Input 
                          id="rep-phone" 
                          placeholder="01XXXXXXXXX"
                          value={formData.phone} 
                          onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                      />
                  </div>

                  <div className="space-y-2">
                      <Label htmlFor="rep-branch">الفرع الرئيسي التابع له</Label>
                      <Combobox
                          options={branchOptions}
                          value={formData.mainWarehouseId}
                          onValueChange={(val) => setFormData(p => ({ ...p, mainWarehouseId: val }))}
                          placeholder="اختر الفرع التابع له..."
                          emptyMessage="لا توجد فروع."
                      />
                      <p className="text-[11px] text-muted-foreground">
                          سيتم إنشاء مخزن العهدة الفرعي الخاص بالمندوب وربطه بهذا الفرع.
                      </p>
                  </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={isSaving}>
                      إلغاء
                  </Button>
                  <Button onClick={handleCreateRep} disabled={isSaving} className="gap-1">
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <UserPlus className="h-4 w-4 ml-1" />}
                      {isSaving ? "جارٍ الإنشاء..." : "حفظ وإنشاء العهدة"}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </>
  );
}
