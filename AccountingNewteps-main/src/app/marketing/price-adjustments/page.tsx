
"use client";

import React, { useState, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Download, Upload, Loader2, FileSpreadsheet, CheckCircle, TrendingUp, ArrowRight } from "lucide-react";
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { useData } from '@/contexts/data-provider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/auth-context';

type ItemForUpdate = {
    code: string;
    name: string;
    oldCost: number;
    newCost: number;
    oldPrice: number;
    newPrice: number;
    profit?: number;
};

export default function PriceUpdatePage() {
    const { toast } = useToast();
    const { items, dbAction, loading } = useData();
    const { user } = useAuth();
    const [importedData, setImportedData] = useState<ItemForUpdate[]>([]);
    const [fileName, setFileName] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateProgress, setUpdateProgress] = useState(0);

    const handleDownloadTemplate = () => {
        const dataToExport = items.map((item: any) => ({
            code: item.code,
            name: item.name,
            cost: item.cost || 0,
            price: item.price || 0,
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "PriceList");
        XLSX.writeFile(wb, "PriceUpdateTemplate.xlsx");
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json: any[] = XLSX.utils.sheet_to_json(worksheet);

                const requiredHeaders = ['code', 'name', 'cost', 'price'];
                const headers = Object.keys(json[0] || {});
                const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
                if (missingHeaders.length > 0) {
                    toast({ variant: 'destructive', title: 'أعمدة ناقصة', description: `الملف يفتقد للأعمدة المطلوبة: ${missingHeaders.join(', ')}` });
                    return;
                }
                
                const itemCodeMap = new Map(items.map((item: any) => [String(item.code), { oldPrice: item.price || 0, oldCost: item.cost || 0 }]));

                const dataWithDetails = json.map(row => {
                    const existingItem = itemCodeMap.get(String(row.code));
                    return {
                        code: String(row.code),
                        name: row.name,
                        oldCost: existingItem?.oldCost || 0,
                        newCost: Number(row.cost) || 0,
                        oldPrice: existingItem?.oldPrice || 0,
                        newPrice: Number(row.price) || 0,
                        profit: (Number(row.price) || 0) - (Number(row.cost) || 0)
                    }
                });

                setImportedData(dataWithDetails as ItemForUpdate[]);
                toast({ title: 'تمت قراءة الملف', description: `تم العثور على ${json.length} صنف. يرجى المراجعة قبل بدء التحديث.` });
            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'خطأ في الملف', description: 'لا يمكن قراءة الملف. تأكد من أنه ملف Excel صالح.' });
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleConfirmUpdate = async () => {
        if (importedData.length === 0) return;
        setIsUpdating(true);
        setUpdateProgress(0);

        const itemCodeMap = new Map(items.map((item: any) => [String(item.code), {id: item.id, oldPrice: item.price, oldCost: item.cost, name: item.name}]));
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < importedData.length; i++) {
            const row = importedData[i];
            const itemDetails = itemCodeMap.get(String(row.code));

            if (itemDetails) {
                try {
                    const newPrice = Number(row.newPrice);
                    const newCost = Number(row.newCost);
                    
                    const priceChanged = newPrice !== itemDetails.oldPrice;
                    const costChanged = newCost !== itemDetails.oldCost;

                    if(priceChanged || costChanged) {
                        await dbAction('items', 'update', { 
                            id: itemDetails.id, 
                            data: { cost: newCost, price: newPrice } 
                        });

                        await dbAction('priceChangeLogs', 'add', {
                            itemId: itemDetails.id,
                            itemName: itemDetails.name,
                            userId: user?.id,
                            userName: user?.name,
                            timestamp: new Date().toISOString(),
                            oldPrice: itemDetails.oldPrice || 0,
                            newPrice: newPrice,
                            oldCost: itemDetails.oldCost || 0,
                            newCost: newCost,
                            source: 'Excel Update'
                        });
                    }
                    successCount++;
                } catch (e) {
                    errorCount++;
                    console.error(`Failed to update item with code ${row.code}:`, e);
                }
            } else {
                errorCount++;
            }
            setUpdateProgress(((i + 1) / importedData.length) * 100);
        }

        toast({ title: 'اكتمل تحديث الأسعار', description: `تم تحديث ${successCount} صنف بنجاح. فشل تحديث ${errorCount} صنف.` });
        setIsUpdating(false);
        setImportedData([]);
        setFileName('');
    };

    return (
        <>
            <PageHeader title="تحديث أسعار الأصناف" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                <div className="grid gap-6 lg:grid-cols-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>الخطوة 1: تنزيل قائمة الأسعار الحالية</CardTitle>
                            <CardDescription>قم بتنزيل ملف Excel يحتوي على جميع الأصناف وأسعارها الحالية لتسهيل عملية التعديل.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <Button onClick={handleDownloadTemplate} disabled={loading || items.length === 0}>
                                <Download className="ml-2 h-4 w-4" />
                                تنزيل قائمة الأسعار
                            </Button>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader>
                            <CardTitle>الخطوة 2: رفع الملف بعد التعديل</CardTitle>
                            <CardDescription>بعد تعديل الأسعار في ملف Excel، قم برفعه هنا. سيتم تحديث الأسعار بناءً على "كود الصنف".</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="flex gap-2">
                                <Input id="file-upload" type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                                <Label htmlFor="file-upload" className="flex-grow">
                                     <Button asChild className="w-full cursor-pointer">
                                        <span>
                                            <Upload className="ml-2 h-4 w-4" />
                                            اختر ملف...
                                        </span>
                                    </Button>
                                </Label>
                                {fileName && <div className="flex items-center gap-2 p-2 border rounded-md bg-muted min-w-48"><FileSpreadsheet className="h-4 w-4 text-green-600"/><span className="text-sm truncate">{fileName}</span></div>}
                            </div>
                        </CardContent>
                    </Card>
                </div>
                {importedData.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>الخطوة 3: مراجعة وتأكيد التحديث</CardTitle>
                            <CardDescription>سيتم تحديث الأصناف التالية بالأسعار والتكاليف الجديدة. لن يتم إضافة أصناف جديدة من هذه الشاشة.</CardDescription>
                             {isUpdating && (
                                <div className="space-y-2 pt-4">
                                    <Progress value={updateProgress} />
                                    <p className="text-sm text-muted-foreground text-center">
                                        جارٍ تحديث الأسعار...
                                    </p>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent>
                             <div className="max-h-96 overflow-auto border rounded-md">
                                <Table>
                                    <TableHeader><TableRow><TableHead>الكود</TableHead><TableHead>الاسم</TableHead><TableHead className="text-center">التكلفة القديمة</TableHead><TableHead className="text-center">التكلفة الجديدة</TableHead><TableHead className="text-center">السعر القديم</TableHead><TableHead className="text-center">السعر الجديد</TableHead><TableHead className="text-center">الربح</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {importedData.map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{item.code}</TableCell>
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell className="text-center text-muted-foreground">{item.oldCost.toFixed(2)}</TableCell>
                                                <TableCell className="text-center font-semibold">{item.newCost.toFixed(2)}</TableCell>
                                                <TableCell className="text-center text-muted-foreground">{item.oldPrice.toFixed(2)}</TableCell>
                                                <TableCell className="text-center font-semibold">{item.newPrice.toFixed(2)}</TableCell>
                                                <TableCell className={`text-center font-bold ${item.profit && item.profit > 0 ? 'text-green-500' : 'text-destructive'}`}>
                                                    <div className="flex items-center justify-center gap-1">
                                                        <TrendingUp className="h-4 w-4" />
                                                        {item.profit?.toFixed(2) || '0.00'}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                             </div>
                        </CardContent>
                        <CardFooter className="justify-end">
                            <Button size="lg" onClick={handleConfirmUpdate} disabled={isUpdating}>
                                {isUpdating ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <CheckCircle className="ml-2 h-4 w-4" />}
                                {isUpdating ? 'جارٍ التحديث...' : 'تأكيد وتحديث الأسعار'}
                            </Button>
                        </CardFooter>
                    </Card>
                )}
            </main>
        </>
    );
}
