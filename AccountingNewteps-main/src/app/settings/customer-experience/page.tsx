"use client";

import React, { useState, useEffect, useMemo } from "react";
import PageHeader from "@/components/page-header";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import {
    getCustomerExperienceConfig,
    CustomerExperienceConfig,
    calculateRedeemableCash,
    openCustomerDisplayWindow,
    closeCustomerDisplayWindow,
    broadcastToCustomerDisplay,
    sendWhatsAppMessage,
    buildWhatsAppInvoiceMessage,
} from "@/lib/customer-experience";
import {
    Gift,
    Monitor,
    MessageCircle,
    Save,
    ExternalLink,
    PowerOff,
    Sparkles,
    QrCode,
    Send,
    Search,
    CheckCircle2,
    Eye,
    Loader2,
} from "lucide-react";

export default function CustomerExperienceSettingsPage() {
    const { settings, customers, promotions, dbAction, loading } = useData();
    const { toast } = useToast();

    const [config, setConfig] = useState<CustomerExperienceConfig>(() => getCustomerExperienceConfig(settings));
    const [isSaving, setIsSaving] = useState(false);
    const [customerSearch, setCustomerSearch] = useState("");
    const [editingPointsCustomerId, setEditingPointsCustomerId] = useState<string | null>(null);
    const [editingPointsValue, setEditingPointsValue] = useState<string>("");
    const [testPhone, setTestPhone] = useState("");

    useEffect(() => {
        if (settings?.main?.customerExperience) {
            setConfig(getCustomerExperienceConfig(settings));
        }
    }, [settings]);

    const handleSaveSettings = async () => {
        setIsSaving(true);
        try {
            const currentMain = settings?.main || {};
            await dbAction("settings", "update", {
                id: "main",
                data: {
                    ...currentMain,
                    customerExperience: config,
                },
            });
            toast({
                title: "تم حفظ الإعدادات بنجاح",
                description: "تم تطبيق إعدادات نقاط الولاء وشاشة العميل الثانية ورسائل الواتساب على النظام.",
            });
        } catch (error) {
            toast({
                variant: "destructive",
                title: "خطأ",
                description: "تعذر حفظ الإعدادات.",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateCustomerPoints = async (customer: any) => {
        const newPts = Math.max(0, Number(editingPointsValue) || 0);
        try {
            await dbAction("customers", "update", {
                id: customer.id,
                data: {
                    loyaltyPoints: newPts,
                },
            });
            toast({
                title: "تم تحديث نقاط العميل",
                description: `أصبح رصيد نقاط العميل ${customer.name}: ${newPts} نقطة.`,
            });
            setEditingPointsCustomerId(null);
        } catch {
            toast({ variant: "destructive", title: "خطأ", description: "فشل تحديث نقاط العميل." });
        }
    };

    const handleSendCustomerStatementWhatsApp = async (customer: any) => {
        if (!customer.phone) {
            toast({ variant: "destructive", title: "لا يوجد رقم هاتف", description: "يرجى تسجيل رقم هاتف للعميل أولاً." });
            return;
        }
        const pts = Number(customer.loyaltyPoints || 0);
        const cashVal = calculateRedeemableCash(pts, config);
        const bal = Number(customer.currentBalance || 0);
        const companyName = settings?.main?.general?.companyName || "متجرنا";
        const msg = [
            `🌟 *مرحباً بك أ/ ${customer.name} من ${companyName}*`,
            `━━━━━━━━━━━━━━━━━━`,
            `🏆 *رصيد نقاط الولاء الحالي:* ${pts} نقطة`,
            `🎁 *قيمة الكاش باك المتاحة للاستبدال:* ${cashVal} ج.م`,
            bal > 0 ? `📌 *الرصيد المالي المستحق:* ${bal.toLocaleString()} ج.م` : `✅ *حسابكم المالي:* خالص بالكامل`,
            `━━━━━━━━━━━━━━━━━━`,
            config.whatsapp.footerMessage || "نسعد بخدمتكم دائماً!",
        ].join("\n");

        await sendWhatsAppMessage(customer.phone, msg, config);
    };

    const handleSimulateStepOnDualScreen = (step: "idle" | "scanning" | "payment" | "completed") => {
        openCustomerDisplayWindow();
        setTimeout(() => {
            broadcastToCustomerDisplay({
                step,
                timestamp: Date.now(),
                companyName: settings?.main?.general?.companyName || "متجرنا",
                branchName: "معاينة حية من شاشة الإدارة",
                items:
                    step === "idle"
                        ? []
                        : [
                              {
                                  id: "demo-1",
                                  name: "منتج تجريبي 1 - عرض خاص",
                                  qty: 2,
                                  price: 175,
                                  originalPrice: 200,
                                  total: 350,
                                  discountApplied: 50,
                                  promoApplied: "promo-1",
                                  promoName: "عرض التوفير",
                              },
                              {
                                  id: "demo-2",
                                  name: "منتج تجريبي 2",
                                  qty: 1,
                                  price: 150,
                                  originalPrice: 150,
                                  total: 150,
                              },
                          ],
                subtotal: 550,
                discount: 50,
                loyaltyDiscount: 25,
                redeemedPoints: 5,
                tax: 0,
                total: 475,
                customer: {
                    id: "cust-demo",
                    name: "أحمد محمد (عميل مميز)",
                    loyaltyPoints: 45,
                },
                earnedPoints: 4.7,
                invoiceNumber: "POS-DEMO-101",
                activePromotions: (promotions || []).slice(0, 4),
            });
        }, 400);
    };

    const filteredCustomers = useMemo(() => {
        return (customers || []).filter(
            (c: any) =>
                c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
                (c.phone && c.phone.includes(customerSearch))
        );
    }, [customers, customerSearch]);

    return (
        <>
            <PageHeader title="إدارة تجربة العملاء ونقاط الولاء والشاشة الثانية">
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCustomerDisplayWindow()}
                        className="gap-1.5 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
                    >
                        <ExternalLink className="h-4 w-4" />
                        فتح شاشة العميل الثانية
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => closeCustomerDisplayWindow()}
                        className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                        <PowerOff className="h-4 w-4" />
                        إغلاق شاشة العميل
                    </Button>
                    <Button size="sm" onClick={handleSaveSettings} disabled={isSaving} className="gap-1.5">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        حفظ كافة الإعدادات
                    </Button>
                </div>
            </PageHeader>

            <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                {/* بطاقات التفعيل السريع (الفتح والإغلاق) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className={config.loyalty.enabled ? "border-amber-500/40 bg-amber-500/5" : ""}>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                            <div className="flex items-center gap-2.5">
                                <Gift className="h-5 w-5 text-amber-500" />
                                <CardTitle className="text-base">نظام نقاط الولاء والكاش باك</CardTitle>
                            </div>
                            <Switch
                                checked={config.loyalty.enabled}
                                onCheckedChange={(v) => setConfig((prev) => ({ ...prev, loyalty: { ...prev.loyalty, enabled: v } }))}
                            />
                        </CardHeader>
                        <CardContent className="text-xs text-muted-foreground">
                            {config.loyalty.enabled
                                ? `مفعّل: كل ${config.loyalty.amountPerPoint} ج.م = 1 نقطة (النقطة = ${config.loyalty.pointRedeemValue} ج.م خصم)`
                                : "متوقف حالياً"}
                        </CardContent>
                    </Card>

                    <Card className={config.dualScreen.enabled ? "border-emerald-500/40 bg-emerald-500/5" : ""}>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                            <div className="flex items-center gap-2.5">
                                <Monitor className="h-5 w-5 text-emerald-500" />
                                <CardTitle className="text-base">شاشة عرض العميل الثانية</CardTitle>
                            </div>
                            <Switch
                                checked={config.dualScreen.enabled}
                                onCheckedChange={(v) => setConfig((prev) => ({ ...prev, dualScreen: { ...prev.dualScreen, enabled: v } }))}
                            />
                        </CardHeader>
                        <CardContent className="text-xs text-muted-foreground">
                            {config.dualScreen.enabled
                                ? "مفعّلة: تتزامن لحظياً مع الكاشير وتعرض الأصناف والعروض وQR الدفع"
                                : "متوقفة حالياً"}
                        </CardContent>
                    </Card>

                    <Card className={config.whatsapp.enabled ? "border-green-500/40 bg-green-500/5" : ""}>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                            <div className="flex items-center gap-2.5">
                                <MessageCircle className="h-5 w-5 text-green-500" />
                                <CardTitle className="text-base">إرسال الفواتير عبر WhatsApp</CardTitle>
                            </div>
                            <Switch
                                checked={config.whatsapp.enabled}
                                onCheckedChange={(v) => setConfig((prev) => ({ ...prev, whatsapp: { ...prev.whatsapp, enabled: v } }))}
                            />
                        </CardHeader>
                        <CardContent className="text-xs text-muted-foreground">
                            {config.whatsapp.enabled
                                ? `مفعّل (${config.whatsapp.autoSendOnPosCheckout ? "إرسال تلقائي مع إقفال الفاتورة" : "إرسال بضغطة زر"})`
                                : "متوقف حالياً"}
                        </CardContent>
                    </Card>
                </div>

                <Tabs defaultValue="dual-screen" className="w-full" dir="rtl">
                    <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto gap-2 p-1">
                        <TabsTrigger value="dual-screen" className="gap-2 py-2.5">
                            <Monitor className="h-4 w-4" />
                            1. شاشة عرض العميل الثانية وخيارات الخطوات
                        </TabsTrigger>
                        <TabsTrigger value="loyalty" className="gap-2 py-2.5">
                            <Gift className="h-4 w-4" />
                            2. نظام نقاط الولاء وأرصدة العملاء
                        </TabsTrigger>
                        <TabsTrigger value="whatsapp" className="gap-2 py-2.5">
                            <MessageCircle className="h-4 w-4" />
                            3. الربط مع WhatsApp وقوالب الرسائل
                        </TabsTrigger>
                    </TabsList>

                    {/* التبويب الأول: إعدادات شاشة عرض العميل الثانية حسب الخطوة */}
                    <TabsContent value="dual-screen" className="space-y-6 mt-4">
                        <Card>
                            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                    <CardTitle>التحكم في شاشة العميل الثانية واختيارات العرض لكل خطوة</CardTitle>
                                    <CardDescription>
                                        حدد بدقة ما يظهر للعميل في كل مرحلة من مراحل الفاتورة (الانتظار، ضرب الأصناف، الدفع ورموز الـ QR، وإتمام الفاتورة).
                                    </CardDescription>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button variant="secondary" size="sm" onClick={() => handleSimulateStepOnDualScreen("idle")}>
                                        <Eye className="h-3.5 w-3.5 ml-1" />
                                        معاينة خطوة الانتظار
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={() => handleSimulateStepOnDualScreen("scanning")}>
                                        <Eye className="h-3.5 w-3.5 ml-1" />
                                        معاينة خطوة ضرب الأصناف
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={() => handleSimulateStepOnDualScreen("payment")}>
                                        <QrCode className="h-3.5 w-3.5 ml-1" />
                                        معاينة خطوة الدفع والـ QR
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={() => handleSimulateStepOnDualScreen("completed")}>
                                        <CheckCircle2 className="h-3.5 w-3.5 ml-1" />
                                        معاينة خطوة الشكر
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>عنوان الترحيب الرئيسي في وضع الانتظار</Label>
                                        <Input
                                            value={config.dualScreen.welcomeTitle}
                                            onChange={(e) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    dualScreen: { ...prev.dualScreen, welcomeTitle: e.target.value },
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>النص الترحيبي الفرعي</Label>
                                        <Input
                                            value={config.dualScreen.welcomeSubtitle}
                                            onChange={(e) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    dualScreen: { ...prev.dualScreen, welcomeSubtitle: e.target.value },
                                                }))
                                            }
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* خطوة 1: وضع الانتظار */}
                                    <div className="border rounded-xl p-4 space-y-4 bg-muted/20">
                                        <div className="font-bold text-sm text-primary border-b pb-2 flex items-center justify-between">
                                            <span>الخطوة 1: وضع الانتظار (Idle)</span>
                                            <Badge variant="outline">قبل بدء الفاتورة</Badge>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs cursor-pointer">إظهار شعار واسم الشركة</Label>
                                                <Switch
                                                    checked={config.dualScreen.idleStep.showCompanyLogo}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                idleStep: { ...prev.dualScreen.idleStep, showCompanyLogo: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs cursor-pointer">إظهار رسالة الترحيب بالعملاء</Label>
                                                <Switch
                                                    checked={config.dualScreen.idleStep.showWelcomeMessage}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                idleStep: { ...prev.dualScreen.idleStep, showWelcomeMessage: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs cursor-pointer">إظهار العروض الترويجية السارية</Label>
                                                <Switch
                                                    checked={config.dualScreen.idleStep.showActivePromotions}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                idleStep: { ...prev.dualScreen.idleStep, showActivePromotions: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs cursor-pointer">إظهار بانر شرح نقاط الولاء</Label>
                                                <Switch
                                                    checked={config.dualScreen.idleStep.showLoyaltyBanner}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                idleStep: { ...prev.dualScreen.idleStep, showLoyaltyBanner: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* خطوة 2: أثناء ضرب الأصناف */}
                                    <div className="border rounded-xl p-4 space-y-4 bg-muted/20">
                                        <div className="font-bold text-sm text-emerald-500 border-b pb-2 flex items-center justify-between">
                                            <span>الخطوة 2: أثناء ضرب الأصناف</span>
                                            <Badge variant="outline">تكوين السلة</Badge>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs cursor-pointer">عرض قائمة الأصناف والكميات</Label>
                                                <Switch
                                                    checked={config.dualScreen.scanningStep.showItemsList}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                scanningStep: { ...prev.dualScreen.scanningStep, showItemsList: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs cursor-pointer">إظهار السعر الأصلي وقيمة الوفر</Label>
                                                <Switch
                                                    checked={config.dualScreen.scanningStep.showOriginalPriceAndDiscount}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                scanningStep: { ...prev.dualScreen.scanningStep, showOriginalPriceAndDiscount: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs cursor-pointer">إظهار شارة العرض الترويجي على الصنف</Label>
                                                <Switch
                                                    checked={config.dualScreen.scanningStep.showPromotionsBadge}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                scanningStep: { ...prev.dualScreen.scanningStep, showPromotionsBadge: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs cursor-pointer">إظهار اسم العميل ورصيد نقاط ولائه</Label>
                                                <Switch
                                                    checked={config.dualScreen.scanningStep.showCustomerNameAndPoints}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                scanningStep: { ...prev.dualScreen.scanningStep, showCustomerNameAndPoints: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs cursor-pointer">إظهار تفصيل الإجمالي الفرعي والخصم</Label>
                                                <Switch
                                                    checked={config.dualScreen.scanningStep.showSubtotalAndTax}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                scanningStep: { ...prev.dualScreen.scanningStep, showSubtotalAndTax: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* خطوة 3: الدفع ورموز الـ QR */}
                                    <div className="border rounded-xl p-4 space-y-4 bg-muted/20">
                                        <div className="font-bold text-sm text-purple-400 border-b pb-2 flex items-center justify-between">
                                            <span>الخطوة 3: عند الدفع والإقفال</span>
                                            <Badge variant="outline">QR السداد والشكر</Badge>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs cursor-pointer">إظهار رمز QR للدفع عبر InstaPay</Label>
                                                <Switch
                                                    checked={config.dualScreen.paymentStep.showInstaPayQr}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                paymentStep: { ...prev.dualScreen.paymentStep, showInstaPayQr: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                            {config.dualScreen.paymentStep.showInstaPayQr && (
                                                <div className="space-y-1">
                                                    <Label className="text-[11px] text-muted-foreground">عنوان حساب InstaPay (IPA)</Label>
                                                    <Input
                                                        placeholder="example@instapay"
                                                        value={config.dualScreen.paymentStep.instaPayAddress}
                                                        onChange={(e) =>
                                                            setConfig((prev) => ({
                                                                ...prev,
                                                                dualScreen: {
                                                                    ...prev.dualScreen,
                                                                    paymentStep: { ...prev.dualScreen.paymentStep, instaPayAddress: e.target.value },
                                                                },
                                                            }))
                                                        }
                                                        className="h-8 text-xs font-mono"
                                                    />
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between pt-1">
                                                <Label className="text-xs cursor-pointer">إظهار رمز QR لمحفظة فودافون كاش</Label>
                                                <Switch
                                                    checked={config.dualScreen.paymentStep.showVodafoneCashQr}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                paymentStep: { ...prev.dualScreen.paymentStep, showVodafoneCashQr: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                            {config.dualScreen.paymentStep.showVodafoneCashQr && (
                                                <div className="space-y-1">
                                                    <Label className="text-[11px] text-muted-foreground">رقم محفظة فودافون كاش / المحفظة الذكية</Label>
                                                    <Input
                                                        placeholder="010XXXXXXXX"
                                                        value={config.dualScreen.paymentStep.vodafoneCashNumber}
                                                        onChange={(e) =>
                                                            setConfig((prev) => ({
                                                                ...prev,
                                                                dualScreen: {
                                                                    ...prev.dualScreen,
                                                                    paymentStep: { ...prev.dualScreen.paymentStep, vodafoneCashNumber: e.target.value },
                                                                },
                                                            }))
                                                        }
                                                        className="h-8 text-xs font-mono"
                                                    />
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between pt-1">
                                                <Label className="text-xs cursor-pointer">إظهار شاشة الشكر والنقاط المكتسبة</Label>
                                                <Switch
                                                    checked={config.dualScreen.paymentStep.showEarnedPointsSummary}
                                                    onCheckedChange={(v) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            dualScreen: {
                                                                ...prev.dualScreen,
                                                                paymentStep: { ...prev.dualScreen.paymentStep, showEarnedPointsSummary: v },
                                                            },
                                                        }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="justify-end border-t pt-4">
                                <Button onClick={handleSaveSettings} disabled={isSaving}>
                                    <Save className="h-4 w-4 ml-2" />
                                    حفظ إعدادات شاشة العميل الثانية
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* التبويب الثاني: نقاط الولاء والكاش باك */}
                    <TabsContent value="loyalty" className="space-y-6 mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>قواعد احتساب واستبدال نقاط الولاء والكاش باك</CardTitle>
                                <CardDescription>
                                    حدد معادلة منح النقاط التلقائية مع كل فاتورة، وقيمة النقطة بالجنيه عند استبدالها كخصم فوري في شاشة الكاشير.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <Label>معدل اكتساب النقاط (كم ج.م مبيعات = 1 نقطة؟)</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={config.loyalty.amountPerPoint}
                                        onChange={(e) =>
                                            setConfig((prev) => ({
                                                ...prev,
                                                loyalty: { ...prev.loyalty, amountPerPoint: Math.max(1, Number(e.target.value) || 100) },
                                            }))
                                        }
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        مثال: إذا كانت القيمة 100، فكل فاتورة بقيمة 350 ج.م تمنح العميل 3.5 نقطة تلقائياً.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label>قيمة استبدال النقطة الواحدة بالجنيه (كاش باك)</Label>
                                    <Input
                                        type="number"
                                        min={0.1}
                                        step="0.5"
                                        value={config.loyalty.pointRedeemValue}
                                        onChange={(e) =>
                                            setConfig((prev) => ({
                                                ...prev,
                                                loyalty: { ...prev.loyalty, pointRedeemValue: Math.max(0.1, Number(e.target.value) || 1) },
                                            }))
                                        }
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        مثال: إذا كانت القيمة 5 ج.م، فإن 10 نقاط تمنح العميل خصماً فورياً قدره 50 ج.م.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label>الحد الأدنى للنقاط المسموح باستبدالها</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={config.loyalty.minPointsToRedeem}
                                        onChange={(e) =>
                                            setConfig((prev) => ({
                                                ...prev,
                                                loyalty: { ...prev.loyalty, minPointsToRedeem: Math.max(1, Number(e.target.value) || 1) },
                                            }))
                                        }
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        يظهر زر استبدال النقاط في الكاشير بمجرد وصول رصيد العميل لهذا الحد.
                                    </p>
                                </div>
                            </CardContent>
                            <CardFooter className="justify-end border-t pt-4">
                                <Button onClick={handleSaveSettings} disabled={isSaving}>
                                    <Save className="h-4 w-4 ml-2" />
                                    حفظ قواعد نقاط الولاء
                                </Button>
                            </CardFooter>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                    <CardTitle>سجل أرصدة نقاط الولاء للعملاء</CardTitle>
                                    <CardDescription>متابعة وتعديل أرصدة نقاط العملاء وإرسال إشعارات الرصيد عبر WhatsApp.</CardDescription>
                                </div>
                                <div className="relative w-full sm:w-72">
                                    <Search className="h-4 w-4 absolute right-3 top-2.5 text-muted-foreground" />
                                    <Input
                                        placeholder="ابحث باسم العميل أو الهاتف..."
                                        value={customerSearch}
                                        onChange={(e) => setCustomerSearch(e.target.value)}
                                        className="pr-9 h-9"
                                    />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="w-full overflow-auto border rounded-lg max-h-96">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>العميل</TableHead>
                                                <TableHead>رقم الهاتف</TableHead>
                                                <TableHead className="text-center">رصيد النقاط الحالي</TableHead>
                                                <TableHead className="text-center">قيمة الكاش باك (ج.م)</TableHead>
                                                <TableHead className="text-center">إجراءات</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredCustomers.length > 0 ? (
                                                filteredCustomers.map((c: any) => {
                                                    const pts = Number(c.loyaltyPoints || 0);
                                                    const cashVal = calculateRedeemableCash(pts, config);
                                                    return (
                                                        <TableRow key={c.id}>
                                                            <TableCell className="font-medium">{c.name}</TableCell>
                                                            <TableCell className="font-mono text-xs">{c.phone || "-"}</TableCell>
                                                            <TableCell className="text-center">
                                                                {editingPointsCustomerId === c.id ? (
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <Input
                                                                            type="number"
                                                                            value={editingPointsValue}
                                                                            onChange={(e) => setEditingPointsValue(e.target.value)}
                                                                            className="w-24 h-8 text-center font-mono"
                                                                        />
                                                                        <Button size="sm" className="h-8" onClick={() => handleUpdateCustomerPoints(c)}>
                                                                            حفظ
                                                                        </Button>
                                                                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingPointsCustomerId(null)}>
                                                                            إلغاء
                                                                        </Button>
                                                                    </div>
                                                                ) : (
                                                                    <Badge variant={pts > 0 ? "default" : "secondary"} className="font-mono">
                                                                        {pts.toLocaleString()} نقطة
                                                                    </Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-center font-mono font-bold text-emerald-500">
                                                                {cashVal.toLocaleString()} ج.م
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-7 text-xs"
                                                                        onClick={() => {
                                                                            setEditingPointsCustomerId(c.id);
                                                                            setEditingPointsValue(String(pts));
                                                                        }}
                                                                    >
                                                                        تعديل النقاط
                                                                    </Button>
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-7 text-xs gap-1 text-green-600 border-green-500/30 hover:bg-green-500/10"
                                                                        onClick={() => handleSendCustomerStatementWhatsApp(c)}
                                                                    >
                                                                        <MessageCircle className="h-3.5 w-3.5" />
                                                                        إرسال واتساب
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                        لا يوجد عملاء مطابقون للبحث.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* التبويب الثالث: إعدادات الواتساب */}
                    <TabsContent value="whatsapp" className="space-y-6 mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>إعدادات إرسال الفواتير وكشوف الحساب عبر WhatsApp</CardTitle>
                                <CardDescription>
                                    ربط النظام بـ WhatsApp لإرسال إيصال الفاتورة ونقاط الولاء للعميل فور إقفال الفاتورة أو بضغطة زر.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4 border rounded-xl p-4 bg-muted/20">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <Label className="font-bold">الإرسال التلقائي فور إقفال فاتورة الكاشير</Label>
                                                <p className="text-xs text-muted-foreground">
                                                    عند التفعيل، سيقوم النظام بإرسال إيصال الفاتورة تلقائياً لواتساب العميل المسجل فور إنهاء البيع.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={config.whatsapp.autoSendOnPosCheckout}
                                                onCheckedChange={(v) =>
                                                    setConfig((prev) => ({
                                                        ...prev,
                                                        whatsapp: { ...prev.whatsapp, autoSendOnPosCheckout: v },
                                                    }))
                                                }
                                            />
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs">تضمين قائمة الأصناف والأسعار في الرسالة</Label>
                                            <Switch
                                                checked={config.whatsapp.includeItemsInMessage}
                                                onCheckedChange={(v) =>
                                                    setConfig((prev) => ({
                                                        ...prev,
                                                        whatsapp: { ...prev.whatsapp, includeItemsInMessage: v },
                                                    }))
                                                }
                                            />
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs">تضمين نقاط الولاء المكتسبة والرصيد الإجمالي</Label>
                                            <Switch
                                                checked={config.whatsapp.includeLoyaltyPointsInMessage}
                                                onCheckedChange={(v) =>
                                                    setConfig((prev) => ({
                                                        ...prev,
                                                        whatsapp: { ...prev.whatsapp, includeLoyaltyPointsInMessage: v },
                                                    }))
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4 border rounded-xl p-4 bg-muted/20">
                                        <div className="space-y-2">
                                            <Label>طريقة الربط والإرسال</Label>
                                            <Select
                                                value={config.whatsapp.mode}
                                                onValueChange={(v: "web_direct" | "webhook_api") =>
                                                    setConfig((prev) => ({
                                                        ...prev,
                                                        whatsapp: { ...prev.whatsapp, mode: v },
                                                    }))
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="web_direct">ربط مباشر عبر WhatsApp Web / التطبيق (مجاني وفوري)</SelectItem>
                                                    <SelectItem value="webhook_api">ربط عبر بوابة WhatsApp Business API / Webhook</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {config.whatsapp.mode === "webhook_api" && (
                                            <div className="space-y-3">
                                                <div className="space-y-1">
                                                    <Label className="text-xs">رابط بوابة الـ API (Webhook URL)</Label>
                                                    <Input
                                                        placeholder="https://api.whatsapp-gateway.com/send"
                                                        value={config.whatsapp.apiWebhookUrl}
                                                        onChange={(e) =>
                                                            setConfig((prev) => ({
                                                                ...prev,
                                                                whatsapp: { ...prev.whatsapp, apiWebhookUrl: e.target.value },
                                                            }))
                                                        }
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">مفتاح التوثيق (API Token)</Label>
                                                    <Input
                                                        type="password"
                                                        placeholder="Bearer Token..."
                                                        value={config.whatsapp.apiToken}
                                                        onChange={(e) =>
                                                            setConfig((prev) => ({
                                                                ...prev,
                                                                whatsapp: { ...prev.whatsapp, apiToken: e.target.value },
                                                            }))
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-1">
                                            <Label className="text-xs">رسالة الشكر الختامية في الفاتورة</Label>
                                            <Input
                                                value={config.whatsapp.footerMessage}
                                                onChange={(e) =>
                                                    setConfig((prev) => ({
                                                        ...prev,
                                                        whatsapp: { ...prev.whatsapp, footerMessage: e.target.value },
                                                    }))
                                                }
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="border rounded-xl p-4 flex flex-col sm:flex-row items-end gap-4 bg-green-500/5 border-green-500/20">
                                    <div className="space-y-1.5 flex-1 w-full">
                                        <Label className="text-xs">اختبار إرسال فاتورة تجريبية عبر WhatsApp (أدخل رقم الهاتف)</Label>
                                        <Input
                                            placeholder="010XXXXXXXX"
                                            value={testPhone}
                                            onChange={(e) => setTestPhone(e.target.value)}
                                            className="font-mono"
                                        />
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="gap-2 border-green-500/40 text-green-600 hover:bg-green-500/10"
                                        onClick={async () => {
                                            if (!testPhone) {
                                                toast({ variant: "destructive", title: "أدخل رقم الهاتف", description: "يرجى إدخال رقم هاتف لإرسال الرسالة التجريبية." });
                                                return;
                                            }
                                            const msg = buildWhatsAppInvoiceMessage({
                                                companyName: settings?.main?.general?.companyName || "متجرنا",
                                                invoiceNumber: "TEST-1001",
                                                customerName: "عميل تجريبي",
                                                date: new Date().toISOString(),
                                                items: [
                                                    { name: "صنف تجريبي 1", qty: 2, price: 150, total: 300 },
                                                    { name: "صنف تجريبي 2", qty: 1, price: 200, total: 200 },
                                                ],
                                                subtotal: 500,
                                                discount: 50,
                                                total: 450,
                                                paidAmount: 450,
                                                earnedPoints: 4.5,
                                                totalCustomerPoints: 24.5,
                                                config,
                                            });
                                            await sendWhatsAppMessage(testPhone, msg, config);
                                        }}
                                    >
                                        <Send className="h-4 w-4" />
                                        إرسال رسالة تجريبية الآن
                                    </Button>
                                </div>
                            </CardContent>
                            <CardFooter className="justify-end border-t pt-4">
                                <Button onClick={handleSaveSettings} disabled={isSaving}>
                                    <Save className="h-4 w-4 ml-2" />
                                    حفظ إعدادات الواتساب
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </>
    );
}
