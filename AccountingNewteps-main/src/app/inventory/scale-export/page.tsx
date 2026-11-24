'use client';

import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/data-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScaleItem, ScaleModel, generateScaleBarcode } from '@/lib/scale-export';
import { 
    Scale, 
    Download, 
    Send, 
    FileSpreadsheet, 
    FileText, 
    Search, 
    Wifi, 
    CheckCircle2, 
    AlertCircle, 
    Loader2, 
    RefreshCw,
    SlidersHorizontal
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ScaleExportPage() {
    const { allItems = [], items = [], itemCategories = [] } = useData();
    const effectiveItems = allItems.length > 0 ? allItems : items;
    const { toast } = useToast();

    // Scale config state
    const [selectedModel, setSelectedModel] = useState<ScaleModel>('universal_excel');
    const [barcodePrefix, setBarcodePrefix] = useState('21');
    const [shelfLifeDays, setShelfLifeDays] = useState(15);
    const [onlyWeighted, setOnlyWeighted] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    // Direct IP Sending state
    const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
    const [scaleIp, setScaleIp] = useState('192.168.1.150');
    const [scalePort, setScalePort] = useState(4001);
    const [isSending, setIsSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);

    // Exporting loader
    const [isExporting, setIsExporting] = useState(false);

    // Filter items suitable for scales
    const filteredItems: ScaleItem[] = useMemo(() => {
        return (effectiveItems || [])
            .filter((item: any) => {
                if (!item) return false;

                // Category filter
                if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) {
                    return false;
                }

                // Search query
                if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase().trim();
                    const nameMatch = (item.name || '').toLowerCase().includes(q);
                    const codeMatch = (item.code || '').toLowerCase().includes(q);
                    const barcodeMatch = (item.barcode || '').toLowerCase().includes(q);
                    if (!nameMatch && !codeMatch && !barcodeMatch) return false;
                }

                // Weighted items filter
                if (onlyWeighted) {
                    const unit = String(item.unit || item.baseUnit || '').toLowerCase();
                    const barcode = String(item.barcode || '');
                    const isWeightName = /كيلو|كجم|وزن|جرام|kg|gram|g|كيلوغرام/i.test(unit) ||
                                         /لحم|جبن|خضار|فاكهة|دجاج|سمك|مكسرات|بهارات|وزن/i.test(item.name || '');
                    const isWeightBarcode = barcode.startsWith('21') || barcode.startsWith('20') || barcode.startsWith('22');
                    const isWeightFlag = item.isWeightBased || item.isWeighed || item.weighed;

                    return Boolean(isWeightName || isWeightBarcode || isWeightFlag);
                }

                return true;
            })
            .map((item: any, index: number) => ({
                id: item.id || `item-${index}`,
                code: item.code || String(index + 1),
                plu: item.plu ? Number(item.plu) : (index + 1),
                pluNumber: item.plu ? Number(item.plu) : (index + 1),
                name: item.name || 'صنف بدون اسم',
                barcode: item.barcode || generateScaleBarcode(barcodePrefix, item.code || String(index + 1)),
                price: Number(item.price || item.sellingPrice || item.sellPrice || 0),
                unit: item.unit || item.baseUnit || 'كجم',
                category: itemCategories.find((c: any) => c.id === item.categoryId)?.name || 'عام',
                shelfLifeDays: item.shelfLifeDays || shelfLifeDays,
            }));
    }, [effectiveItems, itemCategories, selectedCategory, searchQuery, onlyWeighted, barcodePrefix, shelfLifeDays]);

    // Handle File Export via API
    const handleDownload = async (model: ScaleModel) => {
        if (filteredItems.length === 0) {
            toast({
                variant: 'destructive',
                title: 'لا توجد أصناف',
                description: 'يرجى التأكد من وجود أصناف مطابقة للتصدير'
            });
            return;
        }

        setIsExporting(true);
        try {
            const res = await fetch('/api/scales/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scaleModel: model,
                    items: filteredItems,
                    barcodePrefix,
                    shelfLifeDays
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || 'فشل توليد ملف الميزان');
            }

            const blob = await res.blob();
            const disposition = res.headers.get('Content-Disposition');
            let filename = `scale_export_${model}.csv`;
            if (disposition && disposition.includes('filename=')) {
                filename = decodeURIComponent(disposition.split('filename=')[1].replace(/["']/g, ''));
            } else if (model === 'universal_excel') {
                filename = `scale_plu_export.xlsx`;
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast({
                title: 'تم تصدير ملف الميزان بنجاح ✅',
                description: `تم تنزيل ${filteredItems.length} صنف بصيغة ${model.toUpperCase()}`
            });
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'خطأ في التصدير',
                description: err.message
            });
        } finally {
            setIsExporting(false);
        }
    };

    // Handle Network IP Send
    const handleSendToScale = async () => {
        if (!scaleIp.trim()) {
            toast({
                variant: 'destructive',
                title: 'عنوان IP مطلوب',
                description: 'يرجى إدخال عنوان IP الخاص بالميزان على الشبكة'
            });
            return;
        }

        setIsSending(true);
        setSendResult(null);

        try {
            const res = await fetch('/api/scales/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scaleModel: selectedModel,
                    scaleIp: scaleIp.trim(),
                    scalePort: Number(scalePort) || 4001,
                    items: filteredItems,
                    barcodePrefix,
                    shelfLifeDays,
                    timeoutMs: 6000
                })
            });

            const data = await res.json();
            setSendResult(data);

            if (data.success) {
                toast({
                    title: 'تم الإرسال للميزان بنجاح 📡✅',
                    description: data.message
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'فشل الإرسال للميزان',
                    description: data.message
                });
            }
        } catch (err: any) {
            const msg = err.message || 'خطأ في شبكة الاتصال بالميزان';
            setSendResult({ success: false, message: msg });
            toast({
                variant: 'destructive',
                title: 'خطأ في الاتصال',
                description: msg
            });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6" dir="rtl">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-xl border shadow-sm">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Scale className="h-7 w-7 text-primary" />
                            <h1 className="text-2xl font-bold tracking-tight">إدارة وتصدير موازين الباركود الإلكترونية (Scale PLU)</h1>
                        </div>
                        <p className="text-muted-foreground text-sm">
                            استخراج ملفات الأسعار لجميع أنواع الموازين (CAS, Dibal, Rongta, Excel/CSV) أو الإرسال المباشر للميزان عبر شبكة TCP/IP.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button 
                            variant="outline" 
                            className="gap-2"
                            onClick={() => handleDownload('universal_excel')}
                            disabled={isExporting || filteredItems.length === 0}
                        >
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                            تصدير إكسل (.xlsx)
                        </Button>
                        <Button 
                            variant="outline" 
                            className="gap-2"
                            onClick={() => handleDownload(selectedModel)}
                            disabled={isExporting || filteredItems.length === 0}
                        >
                            <FileText className="h-4 w-4 text-blue-600" />
                            تصدير ملف الميزان ({selectedModel.split('_')[0].toUpperCase()})
                        </Button>
                        <Button 
                            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                            onClick={() => setIsSendDialogOpen(true)}
                            disabled={filteredItems.length === 0}
                        >
                            <Wifi className="h-4 w-4" />
                            إرسال عبر الشبكة (IP)
                        </Button>
                    </div>
                </div>

                {/* Configuration Card */}
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
                                <CardTitle className="text-lg">إعدادات ونموذج الميزان</CardTitle>
                            </div>
                            <Badge variant="secondary" className="font-mono">
                                {filteredItems.length} صنف متاح للميزان
                            </Badge>
                        </div>
                        <CardDescription>
                            حدد طراز الميزان المستخدم والبادئة الرقمية لباركود الوزن المتوافقة مع كاشير نقاط البيع (POS).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Scale Model */}
                            <div className="space-y-2">
                                <Label>طراز الميزان / الصيغة</Label>
                                <Select value={selectedModel} onValueChange={(val: ScaleModel) => setSelectedModel(val)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="اختر طراز الميزان" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="universal_excel">Excel عام (.xlsx) - متوافق شامل</SelectItem>
                                        <SelectItem value="universal_csv">CSV عام (.csv) - متوافق مع البرامج القياسية</SelectItem>
                                        <SelectItem value="cas_cl5000">CAS CL-Series (CL-5000 / CL-5200 / CL-7000)</SelectItem>
                                        <SelectItem value="rongta_rls1000">Rongta RLS1000 / RLS1100 (رونغتا)</SelectItem>
                                        <SelectItem value="dibal">Dibal Scales (.txt)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Barcode Prefix */}
                            <div className="space-y-2">
                                <Label>بادئة باركود الوزن (Prefix)</Label>
                                <Input 
                                    value={barcodePrefix} 
                                    onChange={(e) => setBarcodePrefix(e.target.value.slice(0, 2))}
                                    placeholder="21"
                                    maxLength={2}
                                    className="font-mono text-center"
                                />
                                <span className="text-xs text-muted-foreground block">
                                    الرمز الافتراضي (21) يتوافق تلقائياً مع قارئ نقاط البيع POS
                                </span>
                            </div>

                            {/* Shelf Life */}
                            <div className="space-y-2">
                                <Label>فترة الصلاحية الافتراضية (بالأيام)</Label>
                                <Input 
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={shelfLifeDays} 
                                    onChange={(e) => setShelfLifeDays(Number(e.target.value) || 1)}
                                    className="text-center"
                                />
                                <span className="text-xs text-muted-foreground block">
                                    تطبع على ملصق الميزان (تاريخ التعبئة + الصلاحية)
                                </span>
                            </div>

                            {/* Filter Weighted Items Switch */}
                            <div className="flex flex-col justify-center space-y-2 pt-2">
                                <div className="flex items-center justify-between border p-3 rounded-lg bg-muted/20">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium">أصناف الوزن فقط</Label>
                                        <p className="text-xs text-muted-foreground">تصفية أصناف الكيلو والجرامات</p>
                                    </div>
                                    <Switch 
                                        checked={onlyWeighted} 
                                        onCheckedChange={setOnlyWeighted} 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Search & Filter Bar */}
                        <div className="flex flex-col md:flex-row gap-3 pt-2 border-t">
                            <div className="relative flex-1">
                                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="بحث باسم الصنف، الكود، أو الباركود..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pr-9"
                                />
                            </div>
                            <div className="w-full md:w-64">
                                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="جميع التصنيفات" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">جميع التصنيفات</SelectItem>
                                        {itemCategories.map((cat: any) => (
                                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Items Preview Table */}
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-semibold">
                                معاينة بيانات الأصناف والباركود للميزان ({filteredItems.length})
                            </CardTitle>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 gap-1 text-xs"
                                onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                                إعادة ضبط الفلاتر
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="border-t max-h-[500px] overflow-auto">
                            <Table>
                                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                                    <TableRow>
                                        <TableHead className="w-16 text-center">رقم PLU</TableHead>
                                        <TableHead className="w-24">كود الصنف</TableHead>
                                        <TableHead>اسم الصنف في الميزان</TableHead>
                                        <TableHead className="w-24 text-center">الوحدة</TableHead>
                                        <TableHead className="w-28 text-left">سعر البيع</TableHead>
                                        <TableHead className="w-48 font-mono">هيكل باركود الميزان (21xxxxx)</TableHead>
                                        <TableHead className="w-28 text-center">الصلاحية</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredItems.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                لا توجد أصناف مطابقة للشروط الحالية. جرب إيقاف خيار "أصناف الوزن فقط" أو مسح كلمة البحث.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredItems.slice(0, 100).map((item, idx) => (
                                            <TableRow key={item.id || idx}>
                                                <TableCell className="text-center font-mono font-bold text-primary">
                                                    {item.plu}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                                                <TableCell className="font-medium">{item.name}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className="text-xs">{item.unit}</Badge>
                                                </TableCell>
                                                <TableCell className="text-left font-bold font-mono">
                                                    {item.price.toFixed(2)} ج.م
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-muted-foreground dir-ltr">
                                                    <span className="text-primary font-bold">{barcodePrefix}</span>
                                                    <span>{String(item.code || item.plu).padStart(5, '0').slice(-5)}</span>
                                                    <span className="text-emerald-600">00000</span>
                                                    <span className="text-xs text-gray-400">c</span>
                                                </TableCell>
                                                <TableCell className="text-center text-xs">
                                                    {item.shelfLifeDays || shelfLifeDays} يوم
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        {filteredItems.length > 100 && (
                            <div className="p-3 text-center text-xs text-muted-foreground bg-muted/20 border-t">
                                يتم عرض أول 100 صنف في المعاينة فقط. عند التصدير أو الإرسال سيتم تضمين كافة الأصناف ({filteredItems.length} صنف).
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Direct IP Send Dialog */}
                <Dialog open={isSendDialogOpen} onOpenChange={setIsSendDialogOpen}>
                    <DialogContent className="max-w-md" dir="rtl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Wifi className="h-5 w-5 text-primary" />
                                إرسال الأصناف المباشر إلى الميزان عبر الشبكة (TCP/IP)
                            </DialogTitle>
                            <DialogDescription>
                                يتم الاتصال بعنوان IP الميزان في شبكة المحل المحلية وإرسال ملف الأصناف فوراً دون الحاجة لفلاشة USB.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>عنوان IP الخاص بالميزان في الشبكة</Label>
                                <Input 
                                    value={scaleIp}
                                    onChange={(e) => setScaleIp(e.target.value)}
                                    placeholder="192.168.1.150"
                                    className="font-mono text-left"
                                    dir="ltr"
                                />
                                <span className="text-xs text-muted-foreground">
                                    مثال: 192.168.1.150 أو 10.0.0.88
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label>منفذ الميزان (Port)</Label>
                                    <Input 
                                        type="number"
                                        value={scalePort}
                                        onChange={(e) => setScalePort(Number(e.target.value) || 4001)}
                                        className="font-mono text-center"
                                        placeholder="4001"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        افتراضي Rongta: 4001 / CAS: 2002
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    <Label>عدد الأصناف للارسال</Label>
                                    <div className="h-10 flex items-center justify-center font-bold font-mono text-primary bg-primary/10 rounded-md border">
                                        {filteredItems.length} صنف
                                    </div>
                                </div>
                            </div>

                            {sendResult && (
                                <div className={`p-3 rounded-lg text-sm flex items-start gap-2 border ${
                                    sendResult.success 
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                        : 'bg-red-50 text-red-800 border-red-200'
                                }`}>
                                    {sendResult.success ? (
                                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                                    ) : (
                                        <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                                    )}
                                    <div className="space-y-1">
                                        <p className="font-semibold">{sendResult.success ? 'نجاح الإرسال' : 'فشل الإرسال'}</p>
                                        <p className="text-xs">{sendResult.message}</p>
                                        {sendResult.latencyMs && (
                                            <p className="text-xs font-mono">زمن الاستجابة: {sendResult.latencyMs}ms</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => setIsSendDialogOpen(false)}>
                                إغلاق
                            </Button>
                            <Button 
                                onClick={handleSendToScale} 
                                disabled={isSending || filteredItems.length === 0}
                                className="gap-2"
                            >
                                {isSending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        جارٍ الاتصال والإرسال...
                                    </>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4" />
                                        إرسال الآن ({filteredItems.length} صنف)
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
    );
}
