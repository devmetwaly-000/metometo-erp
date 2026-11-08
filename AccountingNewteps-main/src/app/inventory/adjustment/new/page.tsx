
"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter as CardFooterUI } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, Loader2, Download, Upload, Camera, Save, Boxes, AlertCircle } from "lucide-react";
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/auth-context";
import { useData } from "@/contexts/data-provider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateStockForItemInWarehouse } from "@/lib/inventory-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Html5Qrcode } from "html5-qrcode";

interface AdjustmentItem {
  itemId: string;
  itemName: string;
  systemQty: number; 
  actualQty: number;
  difference: number;
  uniqueId: string;
}

interface Item {
    id: string;
    name: string;
    code?: string;
    unit: string;
    itemType?: 'standard' | 'raw_material' | 'manufactured';
}

export default function NewStockAdjustmentPage() {
    const { toast } = useToast();
    const router = useRouter();
    const isMobile = useIsMobile();
    const allDataContext = useData();
    const { 
        items: allItems, 
        warehouses, 
        inventoryZones,
        dbAction, 
        getNextId, 
        loading 
    } = allDataContext;

    const [items, setItems] = useState<AdjustmentItem[]>([]);
    const [newItem, setNewItem] = useState({ itemId: "", actualQty: 0 });
    const [branchFilter, setBranchFilter] = useState<string>("all");
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
    const [notes, setNotes] = useState<string>("");
    const { user } = useAuth();
    const [adjustmentType, setAdjustmentType] = useState<'periodic_count' | 'opening_balance'>('periodic_count');
    
    const [isSaving, setIsSaving] = useState(false);
    const [duplicateItemInfo, setDuplicateItemInfo] = useState<{ item: AdjustmentItem, newQty: number } | null>(null);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [autoOpenScanner, setAutoOpenScanner] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    
    const newItemQtyInputRef = useRef<HTMLInputElement>(null);
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

    const authorizedBranches = useMemo(() => {
        const b = warehouses.filter((w: any) => !w.isMain && !w.isRepWarehouse && !w.repId);
        if (user?.warehouseIds?.includes('all')) return b;
        return b.filter((w: any) => user?.warehouseIds?.includes(w.id));
    }, [warehouses, user]);
    
    useEffect(() => {
        if (authorizedBranches.length === 1) {
            setBranchFilter(authorizedBranches[0].id);
        }
    }, [authorizedBranches]);

    const warehouseOptions = useMemo(() => {
        const combined = [...warehouses, ...inventoryZones].filter((w: any) => !w.isRepWarehouse);
        let filtered = combined;
        if (!user?.warehouseIds?.includes('all')) {
            filtered = combined.filter((w: any) => user?.warehouseIds?.includes(w.id));
        }
        if (branchFilter !== 'all') {
            filtered = filtered.filter((w: any) => {
                if (w.id === branchFilter) return true;
                return (w as any).branchId === branchFilter;
            });
        }
        return filtered.map((w: any) => ({ value: w.id, label: w.name }));
    }, [warehouses, inventoryZones, user, branchFilter]);

    const branchOptions = useMemo(() => {
         return [{ value: 'all', label: 'كل الفروع المصرح بها' }, ...authorizedBranches.map(b => ({ value: b.id, label: b.name }))];
     }, [authorizedBranches]);

    const availableItems = useMemo(() => {
        return allItems.filter((item: Item) => item.itemType !== 'manufactured');
    }, [allItems]);

    const calculateSystemStock = useCallback((itemId: string, warehouseId: string): number => {
        if (!itemId || !warehouseId || adjustmentType === 'opening_balance') return 0;
        return calculateStockForItemInWarehouse(itemId, warehouseId, allDataContext);
    }, [allDataContext, adjustmentType]);

    const handleScanSuccess = useCallback((scannedCode: string) => {
        const item = availableItems.find((i: Item) => i.code === scannedCode);
        if (item) {
            const existingItem = items.find(i => i.itemId === item.id);
            if (existingItem) {
                 toast({ title: "الصنف موجود بالفعل", description: `الصنف ${item.name} في القائمة بالفعل.` });
            } else {
                 setNewItem({ itemId: item.id, actualQty: 1 });
                 toast({ title: "تم العثور على الصنف", description: `تم تحديد الصنف: ${item.name}` });
                 setIsScannerOpen(false); 
                 setTimeout(() => newItemQtyInputRef.current?.focus(), 300);
            }
        } else {
            toast({ variant: 'destructive', title: "صنف غير موجود", description: `لم يتم العثور على صنف بالباركود: ${scannedCode}` });
        }
    }, [availableItems, items, toast]);

    useEffect(() => {
        const startScanner = async () => {
            if (!isScannerOpen) return;

            try {
                const html5QrCode = new Html5Qrcode("reader");
                html5QrCodeRef.current = html5QrCode;

                const qrConfig = { fps: 10, qrbox: { width: 250, height: 250 } };

                await html5QrCode.start(
                    { facingMode: "environment" },
                    qrConfig,
                    (decodedText) => {
                        handleScanSuccess(decodedText);
                    },
                    undefined
                );
                setHasCameraPermission(true);
            } catch (err: any) {
                console.error("Scanner startup failed:", err);
                setHasCameraPermission(false);
                toast({
                    variant: "destructive",
                    title: "خطأ في الكاميرا",
                    description: "فشل تشغيل الكاميرا. تأكد من منح الإذن واستخدام HTTPS."
                });
                setIsScannerOpen(false);
            }
        };

        if (isScannerOpen) {
            // Small timeout to ensure DOM element "reader" exists
            const timer = setTimeout(startScanner, 100);
            return () => {
                clearTimeout(timer);
                if (html5QrCodeRef.current) {
                    html5QrCodeRef.current.stop().catch(console.error);
                    html5QrCodeRef.current = null;
                }
            };
        }
    }, [isScannerOpen, handleScanSuccess, toast]);

    const availableItemsForCombobox = useMemo(() => {
        return availableItems.map((item: Item) => ({ value: item.id, label: `${item.name} (${item.code || 'N/A'})` }));
    }, [availableItems]);

    const handleDownloadTemplate = () => {
        const itemsToInclude = availableItems.filter((item: Item) => item.itemType !== 'manufactured');
        const data = itemsToInclude.map((item: Item) => ({
            'Code': item.code || item.id,
            'Name': item.name,
            'Unit': item.unit,
            'ActualQuantity': ''
        }));
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "InventoryCount");
        XLSX.writeFile(workbook, `InventoryCountTemplate_${selectedWarehouse}.xlsx`);
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedWarehouse) {
             toast({ variant: 'destructive', title: 'خطأ', description: 'يرجى اختيار مخزن أولاً.' });
             return;
        };

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json: any[] = XLSX.utils.sheet_to_json(worksheet);

                const newItems: AdjustmentItem[] = json.map(row => {
                    const itemCode = String(row['Code']);
                    const item = availableItems.find((i: Item) => (i.code === itemCode || i.id === itemCode));
                    if (!item) return null;

                    const actualQty = Number(row['ActualQuantity']) || 0;
                    const systemQty = calculateSystemStock(item.id, selectedWarehouse);
                    const difference = actualQty - systemQty;
                    
                    return {
                        itemId: item.id,
                        itemName: item.name,
                        systemQty,
                        actualQty,
                        difference,
                        uniqueId: `${item.id}-${Date.now()}`
                    };
                }).filter((item): item is AdjustmentItem => item !== null);
                
                setItems(newItems);
                toast({ title: 'تمت قراءة الملف', description: `تمت معالجة ${newItems.length} صنف.` });
            } catch (error) {
                toast({ variant: 'destructive', title: 'خطأ في الملف', description: 'لا يمكن قراءة الملف.' });
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleAddItem = () => {
        if (!newItem.itemId || !selectedWarehouse) {
            toast({ variant: "destructive", title: "خطأ", description: "يرجى اختيار مخزن وصنف." });
            return;
        }

        const existingItem = items.find(i => i.itemId === newItem.itemId);
        if (existingItem) {
            setDuplicateItemInfo({ item: existingItem, newQty: newItem.actualQty });
            return;
        }
        
        const selectedItemData = availableItems.find((i: Item) => i.id === newItem.itemId);
        if (!selectedItemData) return;
        
        const systemQty = calculateSystemStock(newItem.itemId, selectedWarehouse);
        const difference = newItem.actualQty - systemQty;

        setItems([
            ...items,
            { 
                itemId: selectedItemData.id,
                itemName: selectedItemData.name,
                systemQty: systemQty,
                actualQty: newItem.actualQty,
                difference: difference,
                uniqueId: `${selectedItemData.id}-${Date.now()}`
            },
        ]);
        setNewItem({ itemId: "", actualQty: 0 });

        if (autoOpenScanner) {
            setTimeout(() => setIsScannerOpen(true), 500);
        }
    };

    const handleUpdateDuplicate = () => {
        if (!duplicateItemInfo) return;
        const { item, newQty } = duplicateItemInfo;
        setItems(prevItems => prevItems.map(i => {
            if (i.itemId === item.itemId) {
                const newDifference = newQty - i.systemQty;
                return { ...i, actualQty: newQty, difference: newDifference };
            }
            return i;
        }));
        setNewItem({ itemId: "", actualQty: 0 });
        setDuplicateItemInfo(null);
        
        if (autoOpenScanner) {
            setTimeout(() => setIsScannerOpen(true), 500);
        }
    };

    const handleRemoveItem = (uniqueId: string) => {
        setItems(items.filter((item) => item.uniqueId !== uniqueId));
    };

    const handleConfirm = async () => {
        if (!selectedWarehouse || items.length === 0) {
            toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "يرجى اختيار مخزن وإضافة صنف واحد على الأقل." });
            return;
        }
        
        const itemsWithDifference = items.filter(item => item.difference !== 0 || adjustmentType === 'opening_balance');
        setIsSaving(true);

        try {
            const nextId = await getNextId('stockAdjustment');
            const now = new Date();
            const dateObj = new Date();
            dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

            const receiptNumber = `ت-م-${nextId}`;

            const record = {
                warehouseId: selectedWarehouse,
                date: dateObj.toISOString(),
                items: itemsWithDifference.map(item => ({
                    itemId: item.itemId,
                    name: item.itemName,
                    difference: item.difference,
                    actualQty: item.actualQty,
                    systemQty: item.systemQty,
                    cost: allItems.find((i:any) => i.id === item.itemId)?.cost || 0
                })),
                notes,
                reason: adjustmentType,
                receiptNumber,
                createdById: user?.id,
                createdByName: user?.name,
            };
            
            await dbAction('stockAdjustmentRecords', 'add', record);
            toast({ title: "اكتملت التسوية", description: `تم حفظ إذن التسوية رقم: ${receiptNumber}` });
            router.push('/inventory/adjustment');
        } catch (error) {
            toast({ variant: "destructive", title: `خطأ في الحفظ`, description: "فشل في حفظ إيصال التسوية." });
        } finally {
            setIsSaving(false);
        }
    };

  return (
    <>
        <AlertDialog open={!!duplicateItemInfo} onOpenChange={() => setDuplicateItemInfo(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>الصنف موجود بالفعل</AlertDialogTitle>
                <AlertDialogDescription>
                    الصنف "{duplicateItemInfo?.item.itemName}" موجود بالفعل. هل تريد تحديث الكمية الفعلية لتصبح ({duplicateItemInfo?.newQty})؟
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDuplicateItemInfo(null)}>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleUpdateDuplicate}>تحديث</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

      <Dialog open={isScannerOpen} onOpenChange={setIsScannerOpen}>
          <DialogContent className="max-w-md">
              <DialogHeader>
                  <DialogTitle>ماسح الباركود و QR Code</DialogTitle>
                  <DialogDescription>وجه الكاميرا الخلفية نحو الكود للتعرف عليه تلقائياً.</DialogDescription>
              </DialogHeader>
              <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden border-2 border-primary/20 shadow-inner">
                  <div id="reader" className="w-full h-full" />
                  {hasCameraPermission === false && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
                        <Alert variant="destructive" className="bg-background">
                            <AlertTitle>فشل تشغيل الكاميرا</AlertTitle>
                            <AlertDescription>
                                تأكد من السماح بالوصول للكاميرا من إعدادات المتصفح، واستخدام اتصال آمن HTTPS.
                            </AlertDescription>
                        </Alert>
                    </div>
                  )}
              </div>
              <DialogFooter className="flex justify-between items-center sm:justify-between gap-4 p-4 border-t">
                  <div className="flex items-center gap-2">
                      <Switch checked={autoOpenScanner} onCheckedChange={setAutoOpenScanner} id="scanner-auto-mode" />
                      <Label htmlFor="scanner-auto-mode" className="text-xs">مسح متتالي</Label>
                  </div>
                  <Button variant="outline" onClick={() => setIsScannerOpen(false)}>إلغاء</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      <PageHeader title="تسوية وجرد المخزون" />
      <main className="flex flex-1 flex-col gap-4 p-2 md:p-6">
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle>إيصال تسوية مخزنية</CardTitle>
            <CardDescription>تصحيح كميات المخزون بناءً على الجرد الفعلي.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-4 md:p-6">
            {loading ? (
                 <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                         <div className="space-y-2">
                            <Label htmlFor="adjustment-type">نوع التسوية</Label>
                            <Select value={adjustmentType} onValueChange={(v: any) => { setAdjustmentType(v); setItems([]); }}>
                                <SelectTrigger id="adjustment-type"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="periodic_count">جرد دوري (تسوية عجز/زيادة)</SelectItem>
                                    <SelectItem value="opening_balance">جرد افتتاحي (رصيد أول مدة)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>الفرع</Label>
                            <Combobox options={branchOptions} value={branchFilter} onValueChange={(v) => { setBranchFilter(v); setSelectedWarehouse(''); setItems([]); }} placeholder="فلترة حسب الفرع..." disabled={authorizedBranches.length === 1} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="warehouse">المخزن</Label>
                            <Combobox options={warehouseOptions} value={selectedWarehouse} onValueChange={(v) => { setSelectedWarehouse(v); setItems([]); }} placeholder="اختر المخزن..." emptyMessage="لا يوجد مخازن لهذا الفرع." />
                        </div>
                        <div className="space-y-2">
                             <Label className="hidden md:block">استيراد</Label>
                             <div className="flex gap-2">
                                <Button onClick={handleDownloadTemplate} disabled={!selectedWarehouse} variant="outline" className="flex-1"><Download className="ml-2 h-4 w-4" /> القالب</Button>
                                <Input id="file-upload" type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                                <Label htmlFor="file-upload" className="flex-grow"><Button asChild className="w-full cursor-pointer" disabled={!selectedWarehouse}><span className='flex items-center'><Upload className="ml-2 h-4 w-4" /> رفع</span></Button></Label>
                             </div>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-lg font-bold">الأصناف المضافة للجرد ({items.length})</Label>
                        <div className="flex items-center gap-4 bg-muted/50 p-2 rounded-lg border">
                            <div className="flex items-center gap-2">
                                <Switch checked={autoOpenScanner} onCheckedChange={setAutoOpenScanner} id="auto-scan-toggle" />
                                <Label htmlFor="auto-scan-toggle" className="text-xs cursor-pointer">مسح تلقائي مستمر</Label>
                            </div>
                        </div>
                      </div>
                      
                      <Card className="bg-muted/30 border-dashed">
                        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                            <div className="md:col-span-6 space-y-2">
                                <Label>اختيار الصنف</Label>
                                <div className="flex gap-2">
                                    <Combobox
                                        options={availableItemsForCombobox}
                                        value={newItem.itemId}
                                        onValueChange={(v) => {
                                            if(v) {
                                                setNewItem({ ...newItem, itemId: v });
                                                setTimeout(() => newItemQtyInputRef.current?.focus(), 100);
                                            }
                                        }}
                                        placeholder="ابحث عن صنف بالاسم أو الكود..."
                                        className="flex-1"
                                    />
                                    <Button variant={isScannerOpen ? "default" : "outline"} size="icon" onClick={() => setIsScannerOpen(true)} disabled={!selectedWarehouse}>
                                        <Camera className={cn("h-4 w-4", isScannerOpen && "animate-pulse")} />
                                    </Button>
                                </div>
                            </div>
                            <div className="md:col-span-4 space-y-2">
                                <Label>الكمية الفعلية المكتشفة</Label>
                                <Input 
                                    ref={newItemQtyInputRef}
                                    type="number" 
                                    placeholder="أدخل الكمية هنا..." 
                                    value={newItem.actualQty || ''} 
                                    onChange={e => setNewItem({...newItem, actualQty: parseFloat(e.target.value) || 0})}
                                    onFocus={e => e.target.select()}
                                    onKeyDown={(e) => {
                                        if(e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddItem();
                                        }
                                    }}
                                    className="text-lg h-10 font-bold"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <Button onClick={handleAddItem} className="w-full h-10" disabled={!selectedWarehouse || !newItem.itemId}>
                                    <PlusCircle className="ml-2 h-4 w-4" /> إضافة للجرد
                                </Button>
                            </div>
                        </CardContent>
                      </Card>

                      {isMobile ? (
                          <div className="space-y-3">
                              {items.map((item) => (
                                  <Card key={item.uniqueId} className="relative overflow-hidden shadow-sm">
                                      <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", item.difference > 0 ? "bg-green-500" : item.difference < 0 ? "bg-destructive" : "bg-muted")} />
                                      <CardContent className="p-4">
                                          <div className="flex justify-between items-start gap-2 mb-2">
                                              <div className="font-bold">{item.itemName}</div>
                                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleRemoveItem(item.uniqueId)}>
                                                  <Trash2 className="h-4 w-4" />
                                              </Button>
                                          </div>
                                          <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                              <div className="bg-muted p-2 rounded">
                                                  <p className="text-muted-foreground mb-1">النظام</p>
                                                  <p className="font-bold">{item.systemQty}</p>
                                              </div>
                                              <div className="bg-primary/5 p-2 rounded">
                                                  <p className="text-muted-foreground mb-1">الفعلي</p>
                                                  <p className="font-bold text-primary">{item.actualQty}</p>
                                              </div>
                                              <div className={cn("p-2 rounded", item.difference > 0 ? "bg-green-50" : "bg-red-50")}>
                                                  <p className="text-muted-foreground mb-1">الفرق</p>
                                                  <p className={cn("font-bold", item.difference > 0 ? "text-green-600" : "text-destructive")}>
                                                      {item.difference > 0 ? `+${item.difference}` : item.difference}
                                                  </p>
                                              </div>
                                          </div>
                                      </CardContent>
                                  </Card>
                              ))}
                          </div>
                      ) : (
                        <div className="w-full overflow-auto border rounded-lg shadow-sm">
                            <Table>
                                <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[40%]">الصنف</TableHead>
                                    {adjustmentType === 'periodic_count' && <TableHead className="text-center">الكمية بالنظام</TableHead>}
                                    <TableHead className="text-center">الكمية الفعلية</TableHead>
                                    <TableHead className="text-center">الفرق</TableHead>
                                    <TableHead className="text-center w-[100px]">إجراء</TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {items.map((item) => (
                                    <TableRow key={item.uniqueId}>
                                    <TableCell className="font-medium">{item.itemName}</TableCell>
                                    {adjustmentType === 'periodic_count' && <TableCell className="text-center font-mono text-muted-foreground">{item.systemQty}</TableCell>}
                                    <TableCell className="text-center font-bold text-primary">{item.actualQty}</TableCell>
                                    <TableCell className={`text-center font-bold ${item.difference > 0 ? 'text-green-500' : item.difference < 0 ? 'text-destructive' : ''}`}>
                                        <div className="flex items-center justify-center gap-1">
                                            {item.difference > 0 ? `+${item.difference}` : item.difference}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.uniqueId)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                    </TableRow>
                                ))}
                                {items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground italic">
                                            <Boxes className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                            لم يتم إضافة أي أصناف للجرد بعد.
                                        </TableCell>
                                    </TableRow>
                                )}
                                </TableBody>
                            </Table>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">ملاحظات عامة</Label>
                        <Textarea id="notes" placeholder="أضف أي ملاحظات هنا تظهر في التقرير..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                </>
            )}
          </CardContent>
          <CardFooterUI className="flex flex-col md:flex-row justify-between gap-4 p-4 md:p-6 bg-muted/10 border-t">
            <div className="flex items-center gap-2 text-amber-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>سيتم تحديث أرصدة المخزن المختار فور الحفظ وتعديل التكاليف محاسبياً.</span>
            </div>
            <Button size="lg" className="w-full md:w-auto px-10" disabled={loading || isSaving || items.length === 0} onClick={handleConfirm}>
                 {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                 تأكيد وحفظ التسوية النهائية
            </Button>
          </CardFooterUI>
        </Card>
      </main>
    </>
  );
}
