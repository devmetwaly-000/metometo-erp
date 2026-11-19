
"use client";

import React, { useEffect, useState, useMemo } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { MoreHorizontal, PlusCircle, Edit, Trash2, Loader2, Printer, Building2, RefreshCw } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { useAuth } from "@/contexts/auth-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { printService } from "@/lib/print-service";


interface PosTerminal {
  id?: string;
  code: string;
  name: string;
  warehouseId: string;
  posPrinterType?: 'system' | 'ip' | 'bluetooth' | 'browser';
  posPrinterAddress?: string;
  enableKitchenPrinter?: boolean;
  kitchenPrinterType?: 'system' | 'ip' | 'bluetooth' | 'browser';
  kitchenPrinterAddress?: string;
}
interface Warehouse {
  id: string;
  name: string;
}

const normalizeTerminal = (t?: any): Partial<PosTerminal> => {
  if (!t) return {
    name: "",
    warehouseId: "",
    code: "",
    posPrinterType: 'system',
    posPrinterAddress: '',
    enableKitchenPrinter: false,
    kitchenPrinterType: 'system',
    kitchenPrinterAddress: ''
  };
  return {
    id: t.id || t.Id,
    code: t.code || t.Code || '',
    name: t.name || t.Name || '',
    warehouseId: t.warehouseId || t.WarehouseId || '',
    posPrinterType: t.posPrinterType || t.PosPrinterType || 'system',
    posPrinterAddress: t.posPrinterAddress || t.PosPrinterAddress || '',
    enableKitchenPrinter: t.enableKitchenPrinter !== undefined ? !!t.enableKitchenPrinter : (t.EnableKitchenPrinter !== undefined ? !!t.EnableKitchenPrinter : false),
    kitchenPrinterType: t.kitchenPrinterType || t.KitchenPrinterType || 'system',
    kitchenPrinterAddress: t.kitchenPrinterAddress || t.KitchenPrinterAddress || ''
  };
};

const TerminalForm = ({ terminal, onSave, onClose, warehouses, allTerminals, systemPrinters, onRefreshPrinters }: { terminal?: PosTerminal; onSave: (data: Partial<PosTerminal>) => void; onClose: () => void; warehouses: Warehouse[], allTerminals: PosTerminal[], systemPrinters: Array<{ deviceId?: string, name: string, portName?: string, ipHint?: string, isDefault?: boolean }>, onRefreshPrinters?: () => Promise<void> }) => {
  const [formData, setFormData] = useState<Partial<PosTerminal>>(() => {
    const norm = normalizeTerminal(terminal);
    if (!norm.warehouseId && warehouses.length === 1) norm.warehouseId = warehouses[0].id;
    return norm;
  });
  const { toast } = useToast();
  const [isRefreshingPrinters, setIsRefreshingPrinters] = useState(false);
  const [manualInputPos, setManualInputPos] = useState(false);
  const [manualInputKitchen, setManualInputKitchen] = useState(false);

  const handleRefresh = async () => {
    if (!onRefreshPrinters) return;
    setIsRefreshingPrinters(true);
    try {
      await onRefreshPrinters();
    } finally {
      setIsRefreshingPrinters(false);
    }
  };

  useEffect(() => {
    void handleRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (terminal) {
      setFormData(normalizeTerminal(terminal));
    } else {
      setFormData({
        name: "",
        warehouseId: warehouses.length === 1 ? warehouses[0].id : "",
        code: "",
        posPrinterType: 'system',
        posPrinterAddress: '',
        enableKitchenPrinter: false,
        kitchenPrinterType: 'system',
        kitchenPrinterAddress: ''
      });
    }
  }, [terminal, warehouses]);

  const handleTestSystemPrint = async (printerName: string) => {
    if (!printerName) return toast({ variant: 'destructive', title: 'خطأ', description: 'الرجاء اختيار طابعة أولاً.' });

    // فحص ما إذا كان العنوان المدخل هو IP لطابعة شبكة (TCP 9100)
    const cleanAddress = printerName.trim().replace(/^https?:\/\//i, '');
    const isIp = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.test(cleanAddress);
    if (isIp) {
      return handleTestIpPrint(cleanAddress);
    }

    toast({ title: 'جارٍ إرسال الطباعة...', description: `يتم إرسال أمر طباعة تجريبي إلى ${printerName}` });
    try {
        await printService.sendToPrinter(printerName, {
            title: 'Test Print / طباعة تجريبية',
            lines: [
                { left: 'Test Successful', right: 'تم الاختبار بنجاح' },
                { left: 'Terminal', right: formData.name || 'Unknown' },
                { left: 'Date', right: new Date().toLocaleString('ar-EG') }
            ],
            footer: 'NewCashier POS System'
        });
        toast({ title: 'تمت الطباعة بنجاح' });
    } catch (error: any) {
        toast({ 
            variant: 'destructive', 
            title: 'فشل الطباعة', 
            description: error.message || 'تأكد من توصيل الطابعة وتثبيتها في النظام.'
        });
    }
  };

  const handleTestIpPrint = async (ipAddress: string) => {
    if (!ipAddress) return toast({ variant: 'destructive', title: 'خطأ', description: 'الرجاء إدخال عنوان IP أولاً.' });
    toast({ title: 'جارٍ إرسال الطباعة...', description: `يتم إرسال اختبار TCP 9100 إلى ${ipAddress}` });
    try {
        await printService.sendToPrinter(
            ipAddress,
            {
                title: 'Test Print / طباعة تجريبية',
                lines: [
                    { left: 'IP Printer', right: ipAddress },
                    { left: 'Terminal', right: formData.name || 'POS' },
                    { left: 'Status', right: 'تم الاتصال بنجاح' },
                    { left: 'Date', right: new Date().toLocaleString('ar-EG') },
                ],
                footer: 'NewCashier POS System',
            },
            { printerType: 'ip', width: '80mm' }
        );
        toast({ title: 'تمت الطباعة بنجاح ✅', description: `تم إرسال الاختبار إلى ${ipAddress}:9100` });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'فشل الاتصال بطابعة الشبكة (IP)',
            description: error?.message || `تعذر الوصول إلى طابعة الشبكة على ${ipAddress}:9100. إذا كانت الطابعة مثبتة على ويندوز، جرب اختيارها كطابعة نظام أو طابعة ويب.`,
        });
    }
  };

  const handleTestWebPrint = (target: 'pos' | 'kitchen' = 'pos') => {
    printService.printViaWebBrowser({
      title: 'طباعة تجريبية - طابعة الويب (Web Printer)',
      lines: [
        { left: 'نقطة البيع:', right: formData.name || 'POS Terminal' },
        { left: 'القسم:', right: target === 'pos' ? 'إيصالات الكاشير' : 'طابعة المطبخ' },
        { left: 'نوع الاتصال:', right: 'طابعة الويب / المتصفح' },
        { left: 'الحالة:', right: 'تم الاختبار بنجاح ✅' },
        { left: 'التاريخ والوقت:', right: new Date().toLocaleString('ar-EG') },
      ],
      footer: 'NewCashier POS System - Web Printer'
    });
    toast({ title: 'تم فتح نافذة طابعة الويب (Web Printer)', description: 'يمكنك اختيار أي طابعة موصولة بجهازك من نافذة المتصفح.' });
  };


  const handleSubmit = () => {
    if (!formData.name || !formData.warehouseId || !formData.code) {
        toast({ variant: "destructive", title: "خطأ", description: "جميع الحقول الأساسية (الكود، الاسم، المخزن المرتبط) مطلوبة." });
        return;
    }

    const finalData = { ...formData };
    
    // Auto-detect IP vs System Printer
    const posAddr = String(finalData.posPrinterAddress || '').trim();
    const isPosIp = /^(\d{1,3}(?:\.\d{1,3}){3})/.test(posAddr);
    if ((finalData.posPrinterType || 'system') === 'system' && isPosIp) {
        const matchingPrinter = systemPrinters.find(p => p.ipHint === posAddr);
        if (matchingPrinter) {
            finalData.posPrinterAddress = matchingPrinter.name;
        } else {
            finalData.posPrinterType = 'ip';
        }
    }

    if (finalData.posPrinterType === 'ip' && !finalData.posPrinterAddress) {
        toast({ variant: "destructive", title: "خطأ", description: "يجب إدخال عنوان IP لطابعة نقطة البيع." });
        return;
    }

    if (finalData.enableKitchenPrinter) {
        const kitchenAddr = String(finalData.kitchenPrinterAddress || '').trim();
        const isKitchenIp = /^(\d{1,3}(?:\.\d{1,3}){3})/.test(kitchenAddr);
        if ((finalData.kitchenPrinterType || 'system') === 'system' && isKitchenIp) {
            const matchingPrinter = systemPrinters.find(p => p.ipHint === kitchenAddr);
            if (matchingPrinter) {
                finalData.kitchenPrinterAddress = matchingPrinter.name;
            } else {
                finalData.kitchenPrinterType = 'ip';
            }
        }
        if (finalData.kitchenPrinterType === 'ip' && !finalData.kitchenPrinterAddress) {
            toast({ variant: "destructive", title: "خطأ", description: "يجب إدخال عنوان IP لطابعة المطبخ." });
            return;
        }
    }
    
    const termId = terminal?.id || (terminal as any)?.Id;
    const isCodeDuplicate = allTerminals.some(
        (t: any) => String(t.code || t.Code || '').trim().toLowerCase() === String(formData.code).trim().toLowerCase() && 
                    String(t.id || t.Id || '').trim() !== String(termId || '').trim()
    );

    if (isCodeDuplicate) {
        toast({ variant: "destructive", title: "خطأ", description: "كود نقطة البيع مستخدم بالفعل." });
        return;
    }

    onSave({ ...finalData, id: termId });
    onClose();
  };

  return (
    <div className="space-y-4">
       <div className="space-y-2">
        <Label htmlFor="terminal-code">كود نقطة البيع</Label>
        <Input id="terminal-code" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="مثال: 1 أو C1" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="terminal-name">اسم/وصف نقطة البيع</Label>
        <Input id="terminal-name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="مثال: الكاشير الأمامي" />
      </div>
       <div className="space-y-2">
        <Label htmlFor="warehouse-id">المخزن المرتبط</Label>
        <Select value={formData.warehouseId} onValueChange={(v) => setFormData({ ...formData, warehouseId: v })}>
            <SelectTrigger id="warehouse-id">
                <SelectValue placeholder="اختر المخزن الذي تصرف منه هذه النقطة" />
            </SelectTrigger>
            <SelectContent>
                {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>إعدادات الطابعة لهذه النقطة</Label>
          {(formData.posPrinterType || 'system') === 'system' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setManualInputPos(!manualInputPos)}
              className="text-xs text-primary h-auto py-0.5 px-1.5 hover:underline"
            >
              {manualInputPos ? 'اختيار من قائمة ويندوز' : 'كتابة اسم الطابعة يدوياً'}
            </Button>
          )}
        </div>
        <Select value={formData.posPrinterType || 'system'} onValueChange={(v: any) => setFormData({ ...formData, posPrinterType: v })}>
            <SelectTrigger><SelectValue placeholder="اختر نوع الطابعة" /></SelectTrigger>
            <SelectContent>
                <SelectItem value="system">طابعة النظام (طباعة يدوية عبر ويندوز)</SelectItem>
                <SelectItem value="ip">شبكة مباشرة (IP / TCP 9100)</SelectItem>
                <SelectItem value="browser">طابعة الويب / المتصفح (Web Printer)</SelectItem>
            </SelectContent>
        </Select>
        {formData.posPrinterType === 'browser' ? (
            <div className="flex gap-2 items-center justify-between border p-3 rounded-lg bg-primary/5 border-primary/20">
                <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Printer className="h-4 w-4 text-primary" />
                        طابعة الويب / المتصفح (Web Printer)
                    </p>
                    <p className="text-xs text-muted-foreground">
                        تفتح نافذة الطباعة التلقائية للمتصفح (تدعم جميع الطابعات المثبتة أو طابعات PDF دون أي تعريفات إضافية).
                    </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => handleTestWebPrint('pos')} className="shrink-0 gap-1.5 border-primary/30 hover:bg-primary/10" title="تجربة طباعة المتصفح">
                    <Printer className="h-4 w-4" />
                    اختبار طابعة الويب
                </Button>
            </div>
        ) : (formData.posPrinterType || 'system') === 'system' ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                {manualInputPos ? (
                  <Input
                    className="flex-1 font-mono text-sm"
                    value={formData.posPrinterAddress || ''}
                    onChange={(e) => setFormData({ ...formData, posPrinterAddress: e.target.value })}
                    placeholder="اكتب اسم الطابعة كما هو في ويندوز (مثال: EPSON TM-T20 ReceiptE4)"
                  />
                ) : (
                  <Select value={formData.posPrinterAddress || ''} onValueChange={(v) => setFormData({ ...formData, posPrinterAddress: v })}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="اختر طابعة النظام لهذه النقطة" /></SelectTrigger>
                      <SelectContent>
                          {formData.posPrinterAddress && !systemPrinters.some(p => p.name === formData.posPrinterAddress) && (
                              <SelectItem value={formData.posPrinterAddress}>{formData.posPrinterAddress}</SelectItem>
                          )}
                          {systemPrinters.length > 0 ? systemPrinters.map((p) => (
                              <SelectItem key={p.deviceId || p.name} value={p.name}>
                                <div className="flex items-center justify-between gap-2 w-full text-right">
                                  <span>{p.name}{p.isDefault ? ' ⭐(الافتراضية)' : ''}</span>
                                  {p.ipHint ? (
                                    <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">IP: {p.ipHint}</span>
                                  ) : p.portName && !p.portName.startsWith('Ne0') ? (
                                    <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{p.portName}</span>
                                  ) : null}
                                </div>
                              </SelectItem>
                          )) : (
                              <div className="p-2 text-sm text-muted-foreground">لا توجد طابعات نظام متاحة. اضغط تحديث 🔄 أو اكتب الاسم يدوياً.</div>
                          )}
                      </SelectContent>
                  </Select>
                )}
                <Button type="button" variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshingPrinters} title="تحديث قائمة طابعات النظام">
                    <RefreshCw className={`h-4 w-4 ${isRefreshingPrinters ? 'animate-spin' : ''}`} />
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => handleTestSystemPrint(formData.posPrinterAddress || '')} title="طباعة تجريبية">
                    <Printer className="h-4 w-4" />
                </Button>
              </div>

              {formData.posPrinterAddress && /^(\d{1,3}(?:\.\d{1,3}){3})/.test(formData.posPrinterAddress.trim()) && (
                <div className="text-xs p-2.5 rounded-lg border bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 space-y-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-semibold">العنوان المحدد ({formData.posPrinterAddress}) هو عنوان IP شبكة.</span>
                    <Button type="button" variant="link" size="sm" className="h-auto p-0 text-amber-600 dark:text-amber-300 underline font-semibold text-xs" onClick={() => setFormData({ ...formData, posPrinterType: 'ip' })}>
                      التحويل إلى اتصال شبكة (IP)
                    </Button>
                  </div>
                  {systemPrinters.find(p => p.ipHint === formData.posPrinterAddress?.trim()) && (
                    <div className="flex items-center justify-between pt-1 border-t border-amber-500/20">
                      <span>طابعة ويندوز المقترنة بهذا العنوان:</span>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-primary underline font-bold text-xs"
                        onClick={() => {
                          const matched = systemPrinters.find(p => p.ipHint === formData.posPrinterAddress?.trim());
                          if (matched) setFormData({ ...formData, posPrinterAddress: matched.name });
                        }}
                      >
                        اختيار &quot;{systemPrinters.find(p => p.ipHint === formData.posPrinterAddress?.trim())?.name}&quot;
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
        ) : (
            <div className="flex gap-2">
                <Input className="flex-1 font-mono" value={formData.posPrinterAddress || ''} onChange={e => setFormData({ ...formData, posPrinterAddress: e.target.value })} placeholder="أدخل عنوان IP للطابعة (مثال: 10.110.16.119)" />
                <Button variant="outline" size="icon" onClick={() => handleTestIpPrint(formData.posPrinterAddress || '')} title="طباعة تجريبية">
                    <Printer className="h-4 w-4" />
                </Button>
            </div>
        )}
      </div>
      <div className="space-y-4">
        <div className="flex items-center space-x-2 space-x-reverse">
          <Checkbox 
            id="enable-kitchen-printer" 
            checked={formData.enableKitchenPrinter || false} 
            onCheckedChange={(checked) => setFormData({ ...formData, enableKitchenPrinter: !!checked })}
          />
          <Label htmlFor="enable-kitchen-printer" className="cursor-pointer">تفعيل طابعة المطبخ لهذه النقطة</Label>
        </div>

        {formData.enableKitchenPrinter && (
            <div className="space-y-2 border p-4 rounded-md bg-muted/20">
                <div className="flex items-center justify-between">
                    <Label>إعدادات طابعة المطبخ</Label>
                    {(formData.kitchenPrinterType || 'system') === 'system' && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setManualInputKitchen(!manualInputKitchen)}
                            className="text-xs text-primary h-auto py-0.5 px-1.5 hover:underline"
                        >
                            {manualInputKitchen ? 'اختيار من قائمة ويندوز' : 'كتابة اسم الطابعة يدوياً'}
                        </Button>
                    )}
                </div>
                <Select value={formData.kitchenPrinterType || 'system'} onValueChange={(v: any) => setFormData({ ...formData, kitchenPrinterType: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر نوع طابعة المطبخ" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="system">طابعة النظام (طباعة يدوية عبر ويندوز)</SelectItem>
                        <SelectItem value="ip">شبكة مباشرة (IP / TCP 9100)</SelectItem>
                        <SelectItem value="browser">طابعة الويب / المتصفح (Web Printer)</SelectItem>
                    </SelectContent>
                </Select>
                {formData.kitchenPrinterType === 'browser' ? (
                     <div className="flex gap-2 items-center justify-between border p-3 rounded-lg bg-primary/5 border-primary/20">
                        <div className="space-y-0.5">
                            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                <Printer className="h-4 w-4 text-primary" />
                                طابعة الويب / المتصفح (Web Printer)
                            </p>
                            <p className="text-xs text-muted-foreground">
                                تفتح نافذة الطباعة التلقائية للمتصفح لإرسال أوامر تحضير الطلبات للمطبخ.
                            </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleTestWebPrint('kitchen')} className="shrink-0 gap-1.5 border-primary/30 hover:bg-primary/10" title="تجربة طباعة المتصفح">
                            <Printer className="h-4 w-4" />
                            اختبار طابعة الويب
                        </Button>
                    </div>
                ) : (formData.kitchenPrinterType || 'system') === 'system' ? (
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            {manualInputKitchen ? (
                                <Input
                                    className="flex-1 font-mono text-sm"
                                    value={formData.kitchenPrinterAddress || ''}
                                    onChange={(e) => setFormData({ ...formData, kitchenPrinterAddress: e.target.value })}
                                    placeholder="اكتب اسم طابعة المطبخ في ويندوز"
                                />
                            ) : (
                                <Select value={formData.kitchenPrinterAddress || ''} onValueChange={(v) => setFormData({ ...formData, kitchenPrinterAddress: v })}>
                                    <SelectTrigger className="flex-1"><SelectValue placeholder="اختر طابعة النظام للمطبخ" /></SelectTrigger>
                                    <SelectContent>
                                        {formData.kitchenPrinterAddress && !systemPrinters.some(p => p.name === formData.kitchenPrinterAddress) && (
                                            <SelectItem value={formData.kitchenPrinterAddress}>{formData.kitchenPrinterAddress}</SelectItem>
                                        )}
                                        {systemPrinters.length > 0 ? systemPrinters.map((p) => (
                                            <SelectItem key={p.deviceId || p.name} value={p.name}>
                                                <div className="flex items-center justify-between gap-2 w-full text-right">
                                                    <span>{p.name}{p.isDefault ? ' ⭐(الافتراضية)' : ''}</span>
                                                    {p.ipHint && <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">IP: {p.ipHint}</span>}
                                                </div>
                                            </SelectItem>
                                        )) : (
                                            <div className="p-2 text-sm text-muted-foreground">لا توجد طابعات نظام متاحة. اضغط تحديث 🔄 أو اكتب الاسم يدوياً.</div>
                                        )}
                                    </SelectContent>
                                </Select>
                            )}
                            <Button type="button" variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshingPrinters} title="تحديث قائمة طابعات النظام">
                                <RefreshCw className={`h-4 w-4 ${isRefreshingPrinters ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button type="button" variant="outline" size="icon" onClick={() => handleTestSystemPrint(formData.kitchenPrinterAddress || '')} title="طباعة تجريبية">
                                <Printer className="h-4 w-4" />
                            </Button>
                        </div>
                        {formData.kitchenPrinterAddress && /^(\d{1,3}(?:\.\d{1,3}){3})/.test(formData.kitchenPrinterAddress.trim()) && (
                            <div className="text-xs p-2.5 rounded-lg border bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 space-y-1.5">
                                <div className="flex items-center justify-between flex-wrap gap-1">
                                    <span className="font-semibold">العنوان المحدد ({formData.kitchenPrinterAddress}) هو عنوان IP شبكة.</span>
                                    <Button type="button" variant="link" size="sm" className="h-auto p-0 text-amber-600 underline text-xs font-semibold" onClick={() => setFormData({ ...formData, kitchenPrinterType: 'ip' })}>
                                        التحويل إلى اتصال شبكة (IP)
                                    </Button>
                                </div>
                                {systemPrinters.find(p => p.ipHint === formData.kitchenPrinterAddress?.trim()) && (
                                    <div className="flex items-center justify-between pt-1 border-t border-amber-500/20">
                                        <span>طابعة ويندوز المقترنة بهذا العنوان:</span>
                                        <Button
                                            type="button"
                                            variant="link"
                                            size="sm"
                                            className="h-auto p-0 text-primary underline font-bold text-xs"
                                            onClick={() => {
                                                const matched = systemPrinters.find(p => p.ipHint === formData.kitchenPrinterAddress?.trim());
                                                if (matched) setFormData({ ...formData, kitchenPrinterAddress: matched.name });
                                            }}
                                        >
                                            اختيار &quot;{systemPrinters.find(p => p.ipHint === formData.kitchenPrinterAddress?.trim())?.name}&quot;
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <Input className="flex-1 font-mono" value={formData.kitchenPrinterAddress || ''} onChange={e => setFormData({ ...formData, kitchenPrinterAddress: e.target.value })} placeholder="أدخل عنوان IP لطابعة المطبخ (مثال: 10.110.16.119)" />
                        <Button variant="outline" size="icon" onClick={() => handleTestIpPrint(formData.kitchenPrinterAddress || '')} title="طباعة تجريبية">
                            <Printer className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </div>
        )}
      </div>
      <div className="flex justify-end pt-4">
        <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </div>
  );
};


export default function PosTerminalsPage() {
  const { posTerminals, warehouses, allWarehouses, dbAction, loading, isCentral } = useData();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<PosTerminal | null>(null);
  const [terminalToDelete, setTerminalToDelete] = useState<PosTerminal | null>(null);
  
  const allWarehouseList = useMemo(() => {
    return (allWarehouses && allWarehouses.length > 0) ? allWarehouses : (warehouses || []);
  }, [allWarehouses, warehouses]);

  const authorizedWarehouses = useMemo(() => {
    // نقاط البيع (الكاشيرات) ترتبط بكافة الفروع والمخازن المتاحة للبيع، وتستبعد فقط عهد المناديب والمخازن المغلقة
    const salesBranches = (allWarehouseList || [])
      .filter((w: any) => 
        !w.isRepWarehouse && 
        !w.repId && 
        !w.isClosed && 
        w.warehouseType !== 'rep' && 
        !w.name?.includes('عهدة') && 
        !w.name?.includes('مندوب')
      )
      .filter((w: any, idx: number, arr: any[]) => 
        idx === arr.findIndex((t: any) => 
          t.id === w.id || 
          (t.code && w.code && String(t.code).trim() === String(w.code).trim()) || 
          (t.name && w.name && t.name.trim().toLowerCase() === w.name.trim().toLowerCase())
        )
      );
    const wIds = user?.warehouseIds || [];
    if (wIds.includes('all') || user?.role === 'مسؤول' || wIds.length === 0) return salesBranches;
    const permitted = salesBranches.filter((w: any) => wIds.includes(w.id || w.Id));
    return permitted.length > 0 ? permitted : salesBranches;
  }, [allWarehouseList, user]);

  const [systemPrinters, setSystemPrinters] = useState<Array<{ deviceId?: string, name: string, portName?: string, ipHint?: string, isDefault?: boolean }>>([]);
  
  const fetchPrinters = React.useCallback(async () => {
    const printers = await printService.getSystemPrinters();
    setSystemPrinters(Array.isArray(printers) ? printers : []);
  }, []);

  useEffect(() => {
    void fetchPrinters();
  }, [fetchPrinters]);

  const handleSave = async (data: Partial<PosTerminal>) => {
    if (isCentral) {
      toast({ variant: "destructive", title: "عملية محظورة", description: "إضافة أو تعديل نقاط البيع محظور في الإدارة المركزية. نقاط البيع تُدار من فروع البيع الفعلية فقط." });
      return;
    }
    try {
      const selectedWh = allWarehouseList.find((w: any) => String(w.id || w.Id).trim() === String(data.warehouseId).trim());
      const payload = {
        name: data.name,
        warehouseId: data.warehouseId,
        code: data.code,
        branchCode: selectedWh?.code || selectedWh?.Code || null,
        branchName: selectedWh?.name || selectedWh?.Name || null,
        posPrinterType: data.posPrinterType || 'system',
        posPrinterAddress: data.posPrinterAddress || '',
        enableKitchenPrinter: data.enableKitchenPrinter || false,
        kitchenPrinterType: data.kitchenPrinterType || 'system',
        kitchenPrinterAddress: data.kitchenPrinterAddress || ''
      };

      if (data.id) {
        await dbAction("posTerminals", "update", { id: data.id, data: payload });
      } else {
        await dbAction("posTerminals", "add", payload);
      }
      toast({ title: 'تم الحفظ بنجاح' });
    } catch(e: any) {
      console.error("Failed to save terminal:", e);
      toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ نقطة البيع: " + (e.message || String(e)) });
    }
  };

  const handleDelete = async (id: string) => {
    if (isCentral) {
      toast({ variant: "destructive", title: "عملية محظورة", description: "حذف نقاط البيع محظور في الإدارة المركزية." });
      return;
    }
    await dbAction("posTerminals", "remove", { id });
    toast({ title: 'تم الحذف بنجاح' });
  };
  
  const getWarehouseName = (id: string) => {
    if (!id) return 'غير محدد';
    const cleanId = String(id).trim();
    const found = allWarehouseList.find((w: any) => String(w.id || w.Id || '').trim() === cleanId);
    return found?.name || (found as any)?.Name || 'غير محدد';
  };

  return (
    <>
      <PageHeader title="نقاط البيع (الكاشيرات)">
        {!isCentral && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <PlusCircle className="h-4 w-4" />
                إضافة نقطة بيع
              </Button>
            </DialogTrigger>
            <DialogContent 
              className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
              onInteractOutside={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest('[data-radix-popper-content-wrapper]')) {
                  e.preventDefault();
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>إضافة نقطة بيع جديدة</DialogTitle>
                <DialogDescription>عرّف أجهزة الكاشير الموجودة لديك واربط كل جهاز بمخزن محدد لصرف البضاعة منه.</DialogDescription>
              </DialogHeader>
              <TerminalForm 
                onSave={handleSave} 
                onClose={() => setIsAddOpen(false)} 
                warehouses={authorizedWarehouses} 
                allTerminals={posTerminals} 
                systemPrinters={systemPrinters}
                onRefreshPrinters={fetchPrinters}
              />
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        {isCentral && (
          <Card className="border-sky-500/40 bg-sky-500/5 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <Building2 className="h-6 w-6 text-foreground shrink-0" />
              <div className="space-y-0.5 text-xs">
                <p className="font-bold text-sm text-foreground">وضع المراجعة والتدقيق المركزي (Central HQ)</p>
                <p className="text-muted-foreground">
                  النظام يعمل حالياً بدور <strong>الإدارة المركزية</strong>. إضافة أو تعديل نقاط البيع (الكاشيرات) محظور هنا ومخصص لفروع البيع فقط. تُعرض هذه القائمة لأغراض المراجعة والتدقيق لنقاط البيع المعرفة بالفروع.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>قائمة نقاط البيع</CardTitle>
            <CardDescription>
              إدارة أجهزة نقاط البيع في فروعك المختلفة.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>كود نقطة البيع</TableHead>
                      <TableHead>الاسم/الوصف</TableHead>
                      <TableHead>المخزن المرتبط</TableHead>
                      <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posTerminals && posTerminals.length > 0 ? posTerminals.map((terminal: any, index: number) => (
                      <TableRow key={terminal.id || terminal.Id}>
                        <TableCell className="font-mono font-bold text-foreground">{String(terminal.code || terminal.Code || '-').trim() || '-'}</TableCell>
                        <TableCell className="font-medium text-foreground">{String(terminal.name || terminal.Name || '-').trim() || '-'}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-muted/80 text-foreground border border-border/50">
                            {getWarehouseName(terminal.warehouseId || terminal.WarehouseId)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {isCentral ? (
                            <span className="text-[11px] text-muted-foreground font-medium px-2 py-1 rounded bg-muted">
                              مراجعة فقط
                            </span>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button aria-haspopup="true" size="icon" variant="ghost">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => setEditingTerminal(terminal)}>
                                  <Edit className="ml-2 h-4 w-4" /> تعديل
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => setTerminalToDelete(terminal)}>
                                  <Trash2 className="ml-2 h-4 w-4" /> حذف
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">لا توجد نقاط بيع مسجلة. قم بإضافة واحدة للبدء.</TableCell>
                        </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* نافذة تعديل نقطة البيع */}
      <Dialog open={!!editingTerminal} onOpenChange={(open) => !open && setEditingTerminal(null)}>
        <DialogContent 
          className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-radix-popper-content-wrapper]')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>تعديل نقطة البيع</DialogTitle>
            <DialogDescription>تعديل كود واسم نقطة البيع والمخزن المرتبط بها وإعدادات الطباعة.</DialogDescription>
          </DialogHeader>
          {editingTerminal && (
            <TerminalForm 
              terminal={editingTerminal} 
              onSave={handleSave} 
              onClose={() => setEditingTerminal(null)} 
              warehouses={authorizedWarehouses} 
              allTerminals={posTerminals} 
              systemPrinters={systemPrinters}
              onRefreshPrinters={fetchPrinters}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* حوار تأكيد حذف نقطة البيع */}
      <AlertDialog open={!!terminalToDelete} onOpenChange={(open) => !open && setTerminalToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيؤدي هذا الإجراء إلى حذف نقطة البيع "{terminalToDelete?.name}" بشكل دائم.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTerminalToDelete(null)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (terminalToDelete?.id) handleDelete(terminalToDelete.id);
                setTerminalToDelete(null);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
