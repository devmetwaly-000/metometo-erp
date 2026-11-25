"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Printer,
    CheckCircle2,
    Loader2,
    Settings2,
    HelpCircle,
    Info,
    RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface PosSilentPrinterConfig {
    enabled: boolean;
    printerType: 'system' | 'ip' | 'browser';
    printerAddress: string;
    paperWidth: '80mm' | '58mm';
    autoDrawer: boolean;
    copies: number;
}

export const DEFAULT_SILENT_CONFIG: PosSilentPrinterConfig = {
    enabled: true,
    printerType: 'system',
    printerAddress: '',
    paperWidth: '80mm',
    autoDrawer: false,
    copies: 1
};

export function getPosSilentPrinterConfig(): PosSilentPrinterConfig {
    if (typeof window === 'undefined') return DEFAULT_SILENT_CONFIG;
    try {
        const raw = localStorage.getItem('pos_silent_printer_config');
        if (!raw) return DEFAULT_SILENT_CONFIG;
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SILENT_CONFIG, ...parsed };
    } catch {
        return DEFAULT_SILENT_CONFIG;
    }
}

export function savePosSilentPrinterConfig(cfg: PosSilentPrinterConfig) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem('pos_silent_printer_config', JSON.stringify(cfg));
        window.dispatchEvent(new Event('pos-silent-printer-updated'));
    } catch {}
}

export function PosSilentPrinterDialog({
    open,
    onOpenChange,
    triggerButton
}: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    triggerButton?: React.ReactNode;
}) {
    const { toast } = useToast();
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = open !== undefined ? open : internalOpen;
    const setIsOpen = onOpenChange !== undefined ? onOpenChange : setInternalOpen;

    const [config, setConfig] = useState<PosSilentPrinterConfig>(DEFAULT_SILENT_CONFIG);
    const [systemPrinters, setSystemPrinters] = useState<any[]>([]);
    const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [showKioskGuide, setShowKioskGuide] = useState(false);

    // تحميل الإعدادات المحفوظة
    useEffect(() => {
        const current = getPosSilentPrinterConfig();
        setConfig(current);

        const onUpdated = () => setConfig(getPosSilentPrinterConfig());
        window.addEventListener('pos-silent-printer-updated', onUpdated);
        return () => window.removeEventListener('pos-silent-printer-updated', onUpdated);
    }, []);

    // جلب الطابعات المثبتة من النظام عبر API
    const loadSystemPrinters = useCallback(async () => {
        setIsLoadingPrinters(true);
        try {
            const res = await fetch('/api/system-printers', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                const list = data.printers || [];
                setSystemPrinters(list);

                // إذا لم تكن هناك طابعة محددة بعد، اختر الطابعة الافتراضية أو أول طابعة إيصالات
                setConfig(prev => {
                    if (!prev.printerAddress && list.length > 0) {
                        const defaultP = list.find((p: any) => p.isDefault) || list[0];
                        const newCfg = { ...prev, printerAddress: defaultP.name, printerType: 'system' as const };
                        savePosSilentPrinterConfig(newCfg);
                        return newCfg;
                    }
                    return prev;
                });
            }
        } catch (err) {
            console.warn('Failed to load system printers:', err);
        } finally {
            setIsLoadingPrinters(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadSystemPrinters();
        }
    }, [isOpen, loadSystemPrinters]);

    const handleUpdate = (patch: Partial<PosSilentPrinterConfig>) => {
        setConfig(prev => {
            const next = { ...prev, ...patch };
            savePosSilentPrinterConfig(next);
            return next;
        });
    };

    // طباعة تجريبية صامتة
    const handleTestPrint = async () => {
        if (!config.printerAddress && config.printerType !== 'browser') {
            toast({
                variant: 'destructive',
                title: 'تنبيه',
                description: 'يرجى اختيار طابعة النظام أو إدخال عنوان IP لطابعة الشبكة أولاً.'
            });
            return;
        }

        setIsTesting(true);
        try {
            const lines = [
                { left: 'طابعة الكاشير الصامتة', right: 'SUCCESS' },
                { left: '---------------------------', right: '' },
                { left: 'الوضع:', right: 'طباعة صامتة مباشرة 100%' },
                { left: 'عرض الورق:', right: config.paperWidth },
                { left: 'الهدف:', right: config.printerAddress || 'المتصفح' },
                { left: 'الوقت:', right: new Date().toLocaleTimeString('ar-EG') },
                { left: '---------------------------', right: '' },
                { left: 'الحالة:', right: 'جاهزة للعمل ✅' },
            ];

            const res = await fetch('/api/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    printer: config.printerAddress,
                    printerType: config.printerType,
                    options: { width: config.paperWidth },
                    content: {
                        title: 'تجربة الطباعة الصامتة',
                        lines,
                        footer: 'نظام إدارة نقاط البيع الذكي'
                    }
                })
            });

            const data = await res.json();
            if (res.ok && data?.ok !== false) {
                toast({
                    title: 'تم إرسال أمر الطباعة الصامتة بنجاح 🖨️',
                    description: `خرج أمر الطباعة فوراً إلى [${config.printerAddress || 'طابعة النظام'}].`
                });
            } else {
                throw new Error(data?.error || 'فشل إرسال أمر الطباعة');
            }
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'فشل اختبار الطباعة',
                description: err?.message || 'تأكد من تشغيل الطابعة وتوصيل الكابل.'
            });
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <>
            {triggerButton ? (
                <div onClick={() => setIsOpen(true)} className="inline-flex cursor-pointer">
                    {triggerButton}
                </div>
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 sm:h-9 px-2 sm:px-2.5 rounded-lg border flex items-center gap-1.5 font-bold text-xs"
                    onClick={() => setIsOpen(true)}
                    title="إعدادات طابعة الكاشير والطباعة الصامتة"
                >
                    <Printer className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", config.enabled && config.printerAddress ? "text-primary" : "text-muted-foreground")} />
                    <span className="hidden md:inline">
                        {config.enabled && config.printerAddress 
                            ? (config.printerAddress.length > 12 ? config.printerAddress.substring(0, 10) + '...' : config.printerAddress)
                            : 'طابعة الكاشير'}
                    </span>
                    {config.enabled && config.printerAddress && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 border-primary/40 text-primary hidden lg:inline-flex">
                            صامتة ✅
                        </Badge>
                    )}
                </Button>
            )}

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-lg w-[95vw] text-right" dir="rtl">
                    <DialogHeader className="border-b pb-3">
                        <DialogTitle className="text-base font-bold flex items-center gap-2">
                            <Printer className="h-5 w-5 text-primary" />
                            الطباعة الصامتة المباشرة لطابعة الكاشير (Silent Thermal Printing)
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground mt-1">
                            طباعة الفواتير الحرارية فورياً في الخلفية بدون ظهور نافذة معاينة الطباعة المزعجة للمتصفح.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2 text-xs">
                        {/* 1. مفتاح تفعيل الطباعة الصامتة */}
                        <div className="p-3 rounded-xl border-2 border-primary/30 bg-primary/5 flex items-center justify-between gap-3">
                            <div>
                                <Label className="font-bold text-sm text-foreground flex items-center gap-1.5 cursor-pointer">
                                    تفعيل الطباعة الصامتة المباشرة تلقائياً
                                </Label>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                    عند تفعيل هذا الخيار، يتم إرسال الفاتورة للطابعة الحرارية بمجرد الضغط على "إنهاء وطباعة" وتخرج الورقة فوراً بدون أي تأخير.
                                </p>
                            </div>
                            <Switch
                                checked={config.enabled}
                                onCheckedChange={(checked) => handleUpdate({ enabled: checked })}
                            />
                        </div>

                        {/* 2. نوع اتصال الطابعة */}
                        <div className="space-y-2">
                            <Label className="font-bold text-xs">نوع اتصال طابعة الكاشير:</Label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleUpdate({ printerType: 'system' })}
                                    className={cn(
                                        "p-2.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1.5",
                                        config.printerType === 'system'
                                            ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                                            : "border-border hover:bg-muted/50 text-muted-foreground"
                                    )}
                                >
                                    <Printer className="h-4 w-4" />
                                    <span>طابعة مثبتة (USB / نظام)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleUpdate({ printerType: 'ip' })}
                                    className={cn(
                                        "p-2.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1.5",
                                        config.printerType === 'ip'
                                            ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                                            : "border-border hover:bg-muted/50 text-muted-foreground"
                                    )}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    <span>طابعة شبكة (IP / Wi-Fi)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleUpdate({ printerType: 'browser' })}
                                    className={cn(
                                        "p-2.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1.5",
                                        config.printerType === 'browser'
                                            ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                                            : "border-border hover:bg-muted/50 text-muted-foreground"
                                    )}
                                >
                                    <Settings2 className="h-4 w-4" />
                                    <span>كشك المتصفح (Kiosk)</span>
                                </button>
                            </div>
                        </div>

                        {/* 3. اختيار الطابعة حسب النوع */}
                        {config.printerType === 'system' && (
                            <div className="space-y-2 p-3 rounded-xl border bg-card">
                                <div className="flex items-center justify-between">
                                    <Label className="font-bold text-xs">اختر الطابعة الحرارية المثبتة:</Label>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-[11px] gap-1 px-1.5 text-muted-foreground"
                                        onClick={loadSystemPrinters}
                                        disabled={isLoadingPrinters}
                                    >
                                        <RefreshCw className={cn("h-3 w-3", isLoadingPrinters && "animate-spin")} />
                                        إعادة فحص الطابعات
                                    </Button>
                                </div>
                                <select
                                    dir="ltr"
                                    value={config.printerAddress}
                                    onChange={(e) => handleUpdate({ printerAddress: e.target.value })}
                                    className="w-full h-10 px-3 rounded-lg border bg-background font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                    <option value="">-- اختر طابعة الكاشير من القائمة --</option>
                                    {systemPrinters.map((p: any) => (
                                        <option key={p.deviceId || p.name} value={p.name}>
                                            {p.name} {p.isDefault ? ' (الافتراضية ⭐)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-muted-foreground">
                                    💡 تشمل الطابعات الحرارية USB الشائعة: Xprinter, Rongta, Bixolon, Epson, POS-80C.
                                </p>
                            </div>
                        )}

                        {config.printerType === 'ip' && (
                            <div className="space-y-2 p-3 rounded-xl border bg-card">
                                <Label className="font-bold text-xs">عنوان IP لطابعة الشبكة الحرارية (ESC/POS Raw TCP):</Label>
                                <Input
                                    dir="ltr"
                                    placeholder="مثال: 192.168.1.100 أو 192.168.1.100:9100"
                                    value={config.printerAddress}
                                    onChange={(e) => handleUpdate({ printerAddress: e.target.value })}
                                    className="h-10 font-mono text-sm"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    🌐 يتم الاتصال بطابعات الشبكة الحرارية مباشرة عبر منفذ الطباعة الخام <strong>9100</strong> بسرعة فائقة بدون أي برامج وسيطة.
                                </p>
                            </div>
                        )}

                        {config.printerType === 'browser' && (
                            <div className="p-3 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200 space-y-2">
                                <div className="font-bold flex items-center gap-1.5 text-xs">
                                    <Info className="h-4 w-4 shrink-0 text-amber-600" />
                                    طريقة تشغيل الطباعة الصامتة عبر المتصفح (Chrome Kiosk Printing):
                                </div>
                                <p className="text-[11px] leading-relaxed">
                                    يمكنك تشغيل متصفح Chrome أو Edge بوضع الكشك الصامت بحيث يتم اعتماد الطابعة الافتراضية للويندوز والطباعة فوراً بدون ظهور نافذة المتصفح نهائياً.
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[11px] font-bold"
                                    onClick={() => setShowKioskGuide(!showKioskGuide)}
                                >
                                    {showKioskGuide ? 'إخفاء الدليل' : 'عرض خطوات تشغيل وضع الكشك 📖'}
                                </Button>
                                {showKioskGuide && (
                                    <div className="p-2.5 rounded bg-background/80 border text-[11px] font-mono leading-relaxed text-foreground space-y-1" dir="ltr">
                                        <p className="font-bold text-primary">Windows Chrome Shortcut:</p>
                                        <p className="bg-muted p-1.5 rounded select-all break-all">
                                            chrome.exe --kiosk --kiosk-printing "http://localhost:3000/pos"
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 4. خيارات حجم الورق وعدد النسخ */}
                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">عرض رول الورق الحراري:</Label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={config.paperWidth === '80mm' ? 'default' : 'outline'}
                                        className="h-8 text-xs font-bold"
                                        onClick={() => handleUpdate({ paperWidth: '80mm' })}
                                    >
                                        80mm (قياسي)
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={config.paperWidth === '58mm' ? 'default' : 'outline'}
                                        className="h-8 text-xs font-bold"
                                        onClick={() => handleUpdate({ paperWidth: '58mm' })}
                                    >
                                        58mm (صغير)
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">عدد النسخ لكل فاتورة:</Label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={config.copies === 1 ? 'default' : 'outline'}
                                        className="h-8 text-xs font-bold"
                                        onClick={() => handleUpdate({ copies: 1 })}
                                    >
                                        نسخة واحدة
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={config.copies === 2 ? 'default' : 'outline'}
                                        className="h-8 text-xs font-bold"
                                        onClick={() => handleUpdate({ copies: 2 })}
                                    >
                                        نسختين (للعميل والمحل)
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex flex-col sm:flex-row gap-2 border-t pt-3">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-9 font-bold text-xs gap-1.5 w-full sm:w-auto"
                            onClick={handleTestPrint}
                            disabled={isTesting}
                        >
                            {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5 text-primary" />}
                            {isTesting ? 'جارٍ الطباعة...' : 'طباعة تجريبية صامتة 🖨️'}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            className="h-9 font-bold text-xs gap-1.5 bg-primary w-full sm:w-auto"
                            onClick={() => {
                                savePosSilentPrinterConfig(config);
                                toast({ title: 'تم حفظ إعدادات الطباعة الصامتة بنجاح ✅' });
                                setIsOpen(false);
                            }}
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            حفظ وتطبيق فوراً
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
