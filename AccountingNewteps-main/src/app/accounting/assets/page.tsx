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
import { Plus, Calculator, Trash2, Edit, CheckCircle2, DollarSign, Archive, ArrowUpRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

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
    const { user } = useAuth();
    const { toast } = useToast();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isDepreciationDialogOpen, setIsDepreciationDialogOpen] = useState(false);

    // Depreciation Month & Year selector
    const currentDate = new Date();
    const [deprMonth, setDeprMonth] = useState<number>(currentDate.getMonth() + 1);
    const [deprYear, setDeprYear] = useState<number>(currentDate.getFullYear());

    // Asset Disposal Dialog State
    const [isDisposalDialogOpen, setIsDisposalDialogOpen] = useState(false);
    const [assetToDispose, setAssetToDispose] = useState<any>(null);
    const [saleProceeds, setSaleProceeds] = useState<number>(0);
    const [disposalDate, setDisposalDate] = useState<string>(new Date().toISOString().split('T')[0]);
    
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
        const targetMonthIdx = deprMonth - 1;
        const targetYear = deprYear;
        const depreciationDate = `${targetYear}-${String(deprMonth).padStart(2, '0')}-28`;

        let createdCount = 0;
        let totalDepreciationBatch = 0;

        for (const asset of fixedAssets) {
            if (asset.status !== 'active') continue;

            // Check if depreciation already exists for this month and year
            const alreadyDepreciated = depreciationRecords.some((r: DepreciationRecord) => {
                const rDate = new Date(r.date);
                return r.assetId === asset.id && rDate.getMonth() === targetMonthIdx && rDate.getFullYear() === targetYear;
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
                    note: `إهلاك شهر ${deprMonth}/${targetYear}`
                });
                createdCount++;
                totalDepreciationBatch += amountToRecord;
            }
        }

        if (createdCount > 0) {
            // Auto Post to General Ledger
            try {
                await fetch('/api/accounting/posting', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourceType: 'asset_depreciation',
                        sourceId: `depr_${targetYear}_${deprMonth}`,
                        sourceNumber: `DEP-${targetYear}-${deprMonth}`,
                        warehouseId: 'main',
                        date: depreciationDate,
                        description: `إثبات إهلاك الأصول الثابتة المجمع لشهر ${deprMonth}/${targetYear} (${createdCount} أصل)`,
                        lines: [
                            {
                                accountCode: '5301',
                                accountName: 'حـ/ مصروف إهلاك الأصول الثابتة',
                                debit: totalDepreciationBatch,
                                credit: 0,
                                memo: `مصروف إهلاك شهر ${deprMonth}/${targetYear}`
                            },
                            {
                                accountCode: '1301',
                                accountName: 'حـ/ مجمع إهلاك الأصول الثابتة',
                                debit: 0,
                                credit: totalDepreciationBatch,
                                memo: `مجمع إهلاك شهر ${deprMonth}/${targetYear}`
                            }
                        ],
                        userId: user?.id,
                        userName: user?.name
                    })
                });
            } catch (postErr) {
                console.warn('Auto GL Posting note:', postErr);
            }

            toast({
                title: "تم حساب وترحيل الإهلاك بنجاح",
                description: `تم إنشاء ${createdCount} قيد إهلاك بإجمالي ${formatCurrency(totalDepreciationBatch)} وترحيل القيد آلياً لدفتر الأستاذ العام.`,
            });
        } else {
            toast({
                title: "تنبيه",
                description: `لا توجد أصول تستحق الإهلاك لشهر ${deprMonth}/${targetYear} (أو تم حسابها مسبقاً)`,
            });
        }
        setIsDepreciationDialogOpen(false);
    };

    // Asset Disposal Execution
    const handleDisposalSubmit = async () => {
        if (!assetToDispose) return;
        const bookValue = assetToDispose.bookValue;
        const gainOrLoss = Number(saleProceeds) - bookValue;

        try {
            await dbAction('fixedAssets', 'update', {
                id: assetToDispose.id,
                data: { 
                    status: 'disposed',
                    disposalDate,
                    saleProceeds: Number(saleProceeds),
                    gainOrLoss
                }
            });

            // Post to General Ledger
            try {
                const lines: any[] = [];
                // 1. Debit Cash/Bank for sale proceeds if any
                if (saleProceeds > 0) {
                    lines.push({
                        accountCode: '1101',
                        accountName: 'حـ/ الصندوق والنقدية بالبنوك',
                        debit: Number(saleProceeds),
                        credit: 0,
                        memo: `متحصلات بيع أصل [${assetToDispose.name}]`
                    });
                }
                // 2. Debit Accumulated Depreciation to close it
                if (assetToDispose.totalDepreciation > 0) {
                    lines.push({
                        accountCode: '1301',
                        accountName: 'حـ/ مجمع إهلاك الأصول الثابتة',
                        debit: assetToDispose.totalDepreciation,
                        credit: 0,
                        memo: `إقفال مجمع إهلاك أصل [${assetToDispose.name}]`
                    });
                }
                // 3. Capital Gain or Loss
                if (gainOrLoss < 0) {
                    lines.push({
                        accountCode: '5305',
                        accountName: 'حـ/ خسائر استبعاد وبيع أصول ثابتة',
                        debit: Math.abs(gainOrLoss),
                        credit: 0,
                        memo: `خسائر بيع أصل [${assetToDispose.name}]`
                    });
                } else if (gainOrLoss > 0) {
                    lines.push({
                        accountCode: '4305',
                        accountName: 'حـ/ أرباح رأسمالية من بيع أصول ثابتة',
                        debit: 0,
                        credit: gainOrLoss,
                        memo: `أرباح بيع أصل [${assetToDispose.name}]`
                    });
                }
                // 4. Credit Asset Cost to remove asset
                lines.push({
                    accountCode: '1300',
                    accountName: 'حـ/ الأصول الثابتة بالتكلفة التاريخية',
                    debit: 0,
                    credit: assetToDispose.cost,
                    memo: `استبعاد التكلفة التاريخية للأصل [${assetToDispose.name}]`
                });

                await fetch('/api/accounting/posting', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourceType: 'asset_disposal',
                        sourceId: assetToDispose.id,
                        sourceNumber: `DIS-${Date.now().toString().slice(-6)}`,
                        warehouseId: assetToDispose.warehouseId || 'main',
                        date: disposalDate,
                        description: `إثبات استبعاد/بيع أصل [${assetToDispose.name}] بقيمة بيعية ${saleProceeds} ج.م وصافي ${gainOrLoss >= 0 ? `أرباح ${gainOrLoss}` : `خسائر ${Math.abs(gainOrLoss)}`}`,
                        lines,
                        userId: user?.id,
                        userName: user?.name
                    })
                });
            } catch (glErr) {
                console.warn('Disposal GL Posting Note:', glErr);
            }

            toast({
                title: "تم استبعاد الأصل وترحيل القيد",
                description: `تم استبعاد الأصل [${assetToDispose.name}] وصافي النتيجة: ${gainOrLoss >= 0 ? `ربح ${formatCurrency(gainOrLoss)}` : `خسارة ${formatCurrency(Math.abs(gainOrLoss))}`}`
            });

            setIsDisposalDialogOpen(false);
            setAssetToDispose(null);
        } catch (err: any) {
            toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
        }
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
                                <DialogTitle>حساب وترحيل الإهلاك الشهري الآلي</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <p className="text-sm">اختر الشهر والسنة لحساب الإهلاك لجميع الأصول النشطة وترحيل القيد آلياً لدفتر الأستاذ العام:</p>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">الشهر</Label>
                                        <Select value={String(deprMonth)} onValueChange={(v) => setDeprMonth(Number(v))}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                                    <SelectItem key={m} value={String(m)}>شهر {m}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">السنة</Label>
                                        <Input 
                                            type="number" 
                                            value={deprYear} 
                                            onChange={(e) => setDeprYear(Number(e.target.value))} 
                                        />
                                    </div>
                                </div>

                                <div className="p-3 bg-muted rounded-md text-xs space-y-1 text-muted-foreground">
                                    <p>• طريقة الحساب: القسط الثابت (Straight Line Method).</p>
                                    <p>• القيد المحاسبي المتولد: من حـ/ مصروف الإهلاك إلى حـ/ مجمع الإهلاك.</p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={runDepreciation} className="bg-primary text-primary-foreground">
                                    تأكيد وحساب وترحيل القيد
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* DISPOSAL / SALE DIALOG */}
                    <Dialog open={isDisposalDialogOpen} onOpenChange={setIsDisposalDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-destructive">
                                    <Archive className="h-5 w-5" />
                                    استبعاد / بيع أصل ثابت ({assetToDispose?.name})
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                <div className="grid grid-cols-2 gap-3 p-3 bg-muted rounded-md text-xs">
                                    <div>
                                        <span className="text-muted-foreground block">التكلفة التاريخية:</span>
                                        <span className="font-bold">{formatCurrency(assetToDispose?.cost || 0)}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground block">مجمع الإهلاك المسجل:</span>
                                        <span className="font-bold text-red-600">{formatCurrency(assetToDispose?.totalDepreciation || 0)}</span>
                                    </div>
                                    <div className="col-span-2 border-t pt-2">
                                        <span className="text-muted-foreground block">القيمة الدفترية الصافية:</span>
                                        <span className="font-bold text-blue-600 text-sm">{formatCurrency(assetToDispose?.bookValue || 0)}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>قيمة البيع / التعويض المحصل (ج.م)</Label>
                                    <Input 
                                        type="number" 
                                        min="0"
                                        value={saleProceeds} 
                                        onChange={(e) => setSaleProceeds(Number(e.target.value))} 
                                        placeholder="0 في حال التخريد والإعدام التام"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>تاريخ الاستبعاد / البيع</Label>
                                    <Input 
                                        type="date" 
                                        value={disposalDate} 
                                        onChange={(e) => setDisposalDate(e.target.value)} 
                                    />
                                </div>

                                <div className="p-3 bg-primary/10 border border-primary/20 rounded-md text-xs">
                                    <span className="font-bold block mb-1">النتيجة الرأسمالية المتوقعة:</span>
                                    {saleProceeds - (assetToDispose?.bookValue || 0) >= 0 ? (
                                        <span className="text-green-600 font-bold">
                                            أرباح رأسمالية: {formatCurrency(saleProceeds - (assetToDispose?.bookValue || 0))}
                                        </span>
                                    ) : (
                                        <span className="text-red-600 font-bold">
                                            خسائر رأسمالية: {formatCurrency(Math.abs(saleProceeds - (assetToDispose?.bookValue || 0)))}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setIsDisposalDialogOpen(false)}>إلغاء</Button>
                                <Button variant="destructive" onClick={handleDisposalSubmit}>
                                    تأكيد الاستبعاد وترحيل القيد
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </PageHeader>

            <Card>
                <CardHeader>
                    <CardTitle>قائمة الأصول الثابتة وسجل الإهلاك</CardTitle>
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
                                <TableHead className="text-center">إجراءات</TableHead>
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
                                             asset.status === 'fully_depreciated' ? 'مستهلك بالكامل' : 'تم استبعاده'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            {asset.status !== 'disposed' && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 h-8 px-2 text-xs"
                                                    onClick={() => {
                                                        setAssetToDispose(asset);
                                                        setSaleProceeds(0);
                                                        setIsDisposalDialogOpen(true);
                                                    }}
                                                    title="استبعاد أو بيع الأصل"
                                                >
                                                    <Archive className="h-3.5 w-3.5 ml-1" />
                                                    استبعاد/بيع
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteAsset(asset.id)}>
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
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
