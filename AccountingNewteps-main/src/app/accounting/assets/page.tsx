"use client";

import React, { useState, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useData } from "@/contexts/data-provider";
import { Plus, Calculator, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

interface FixedAsset {
    id: string;
    name: string;
    purchaseDate: string;
    cost: number;
    usefulLifeYears: number;
    salvageValue: number;
    warehouseId: string;
    status: 'active' | 'disposed' | 'fully_depreciated';
}

interface DepreciationRecord {
    id: string;
    assetId: string;
    date: string;
    amount: number;
    note?: string;
}

export default function FixedAssetsPage() {
    const { fixedAssets, depreciationRecords, warehouses, dbAction } = useData();
    const { toast } = useToast();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isDepreciationDialogOpen, setIsDepreciationDialogOpen] = useState(false);
    
    // New Asset Form State
    const [newAsset, setNewAsset] = useState<Partial<FixedAsset>>({
        purchaseDate: new Date().toISOString().split('T')[0],
        status: 'active',
        cost: 0,
        usefulLifeYears: 5,
        salvageValue: 0
    });

    const handleAddAsset = async () => {
        if (!newAsset.name || !newAsset.cost || !newAsset.warehouseId) {
            toast({
                title: "خطأ",
                description: "يرجى ملء جميع الحقول المطلوبة",
                variant: "destructive",
            });
            return;
        }

        try {
            await dbAction('fixedAssets', 'add', newAsset);
            toast({
                title: "تم بنجاح",
                description: "تم إضافة الأصل بنجاح",
            });
            setIsAddDialogOpen(false);
            setNewAsset({
                purchaseDate: new Date().toISOString().split('T')[0],
                status: 'active',
                cost: 0,
                usefulLifeYears: 5,
                salvageValue: 0
            });
        } catch (error) {
            toast({
                title: "خطأ",
                description: "فشل إضافة الأصل",
                variant: "destructive",
            });
            console.error(error);
        }
    };

    const handleDeleteAsset = async (id: string) => {
        if(confirm("هل أنت متأكد من حذف هذا الأصل؟ سيتم حذف جميع سجلات الإهلاك المرتبطة به.")) {
            await dbAction('fixedAssets', 'remove', { id });
            // Cleanup depreciation records
            const assetRecords = depreciationRecords.filter((r:DepreciationRecord) => r.assetId === id);
            for(const record of assetRecords) {
                await dbAction('depreciationRecords', 'remove', { id: record.id });
            }
            toast({
                title: "تم الحذف",
                description: "تم حذف الأصل",
            });
        }
    };

    const runDepreciation = async () => {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const depreciationDate = today.toISOString().split('T')[0];

        let createdCount = 0;

        for (const asset of fixedAssets) {
            if (asset.status !== 'active') continue;

            // Check if depreciation already exists for this month
            const alreadyDepreciated = depreciationRecords.some((r: DepreciationRecord) => {
                const rDate = new Date(r.date);
                return r.assetId === asset.id && rDate.getMonth() === currentMonth && rDate.getFullYear() === currentYear;
            });

            if (alreadyDepreciated) continue;

            // Calculate Monthly Depreciation (Straight Line)
            // (Cost - Salvage) / (Life * 12)
            const depreciableAmount = asset.cost - (asset.salvageValue || 0);
            const totalMonths = asset.usefulLifeYears * 12;
            const monthlyDepreciation = depreciableAmount / totalMonths;

            // Check if fully depreciated
            const totalDepreciated = depreciationRecords
                .filter((r: DepreciationRecord) => r.assetId === asset.id)
                .reduce((sum: number, r: DepreciationRecord) => sum + r.amount, 0);
            
            if (totalDepreciated >= depreciableAmount) {
                // Mark as fully depreciated if not already
                 await dbAction('fixedAssets', 'update', { id: asset.id, data: { status: 'fully_depreciated' } });
                 continue;
            }

            // Cap the amount if it exceeds remaining value
            const remaining = depreciableAmount - totalDepreciated;
            const amountToRecord = Math.min(monthlyDepreciation, remaining);

            if (amountToRecord > 0) {
                await dbAction('depreciationRecords', 'add', {
                    assetId: asset.id,
                    date: depreciationDate,
                    amount: amountToRecord,
                    note: `إهلاك شهر ${currentMonth + 1}/${currentYear}`
                });
                createdCount++;
            }
        }

        if (createdCount > 0) {
            toast({
                title: "تم الحساب",
                description: `تم إنشاء ${createdCount} قيد إهلاك لهذا الشهر`,
            });
        } else {
            toast({
                title: "تنبيه",
                description: "لا توجد أصول تستحق الإهلاك لهذا الشهر (أو تم حسابها مسبقاً)",
            });
        }
        setIsDepreciationDialogOpen(false);
    };

    const assetsWithStats = useMemo(() => {
        return fixedAssets.map((asset: FixedAsset) => {
            const totalDepreciation = depreciationRecords
                .filter((r: DepreciationRecord) => r.assetId === asset.id)
                .reduce((sum: number, r: DepreciationRecord) => sum + r.amount, 0);
            
            return {
                ...asset,
                totalDepreciation,
                bookValue: asset.cost - totalDepreciation
            };
        });
    }, [fixedAssets, depreciationRecords]);

    return (
        <div className="space-y-6">
            <PageHeader title="الأصول الثابتة وإهلاكها">
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsDepreciationDialogOpen(true)}>
                        <Calculator className="ml-2 h-4 w-4" />
                        حساب الإهلاك الشهري
                    </Button>
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="ml-2 h-4 w-4" />
                                إضافة أصل جديد
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>إضافة أصل ثابت جديد</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>اسم الأصل</Label>
                                        <Input 
                                            value={newAsset.name || ''} 
                                            onChange={(e) => setNewAsset({...newAsset, name: e.target.value})}
                                            placeholder="مثال: سيارة توصيل"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>الموقع / المخزن</Label>
                                        <Select 
                                            value={newAsset.warehouseId} 
                                            onValueChange={(v) => setNewAsset({...newAsset, warehouseId: v})}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="اختر الموقع" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {warehouses.map((w: any) => (
                                                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>تاريخ الشراء</Label>
                                        <Input 
                                            type="date"
                                            value={newAsset.purchaseDate} 
                                            onChange={(e) => setNewAsset({...newAsset, purchaseDate: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>التكلفة (القيمة الشرائية)</Label>
                                        <Input 
                                            type="number"
                                            value={newAsset.cost} 
                                            onChange={(e) => setNewAsset({...newAsset, cost: parseFloat(e.target.value)})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>العمر الإنتاجي (سنوات)</Label>
                                        <Input 
                                            type="number"
                                            value={newAsset.usefulLifeYears} 
                                            onChange={(e) => setNewAsset({...newAsset, usefulLifeYears: parseFloat(e.target.value)})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>قيمة الخردة (Salvage Value)</Label>
                                        <Input 
                                            type="number"
                                            value={newAsset.salvageValue} 
                                            onChange={(e) => setNewAsset({...newAsset, salvageValue: parseFloat(e.target.value)})}
                                        />
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleAddAsset}>حفظ الأصل</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={isDepreciationDialogOpen} onOpenChange={setIsDepreciationDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>حساب الإهلاك الشهري</DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <p>هل تريد حساب وتسجيل قيود الإهلاك للشهر الحالي ({new Date().getMonth() + 1}/{new Date().getFullYear()}) لجميع الأصول النشطة؟</p>
                                <p className="text-sm text-muted-foreground mt-2">سيتم استخدام طريقة القسط الثابت (Straight Line).</p>
                            </div>
                            <DialogFooter>
                                <Button onClick={runDepreciation}>تأكيد وحساب</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </PageHeader>

            <Card>
                <CardHeader>
                    <CardTitle>قائمة الأصول</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>اسم الأصل</TableHead>
                                <TableHead>تاريخ الشراء</TableHead>
                                <TableHead>التكلفة</TableHead>
                                <TableHead>مجمع الإهلاك</TableHead>
                                <TableHead>القيمة الدفترية</TableHead>
                                <TableHead>العمر المتبقي</TableHead>
                                <TableHead>الحالة</TableHead>
                                <TableHead>إجراءات</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {assetsWithStats.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center text-muted-foreground">لا توجد أصول مسجلة</TableCell>
                                </TableRow>
                            )}
                            {assetsWithStats.map((asset: any) => (
                                <TableRow key={asset.id}>
                                    <TableCell className="font-medium">{asset.name}</TableCell>
                                    <TableCell>{asset.purchaseDate}</TableCell>
                                    <TableCell>{formatCurrency(asset.cost)}</TableCell>
                                    <TableCell className="text-red-600">{formatCurrency(asset.totalDepreciation)}</TableCell>
                                    <TableCell className="text-green-600 font-bold">{formatCurrency(asset.bookValue)}</TableCell>
                                    <TableCell>{asset.usefulLifeYears} سنوات</TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded text-xs ${
                                            asset.status === 'active' ? 'bg-green-100 text-green-800' : 
                                            asset.status === 'fully_depreciated' ? 'bg-yellow-100 text-yellow-800' : 
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {asset.status === 'active' ? 'نشط' : 
                                             asset.status === 'fully_depreciated' ? 'مستهلك بالكامل' : 'تم التخلص منه'}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteAsset(asset.id)}>
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
