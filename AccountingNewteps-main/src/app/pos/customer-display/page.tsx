"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useData } from "@/contexts/data-provider";
import {
    getCustomerExperienceConfig,
    getStoredCustomerDisplayState,
    calculateRedeemableCash,
    CustomerDisplayPayload,
} from "@/lib/customer-experience";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ShoppingCart,
    Sparkles,
    Gift,
    QrCode,
    CheckCircle2,
    User,
    Tag,
    Maximize2,
    X,
    Store,
    Wallet,
    Smartphone,
} from "lucide-react";

export default function CustomerDualDisplayPage() {
    const { settings, promotions } = useData();
    const config = useMemo(() => getCustomerExperienceConfig(settings), [settings]);
    const companyName = settings?.main?.general?.companyName || "متجرنا";
    const companyLogo = settings?.main?.general?.logoUrl || "/logo.png";

    const [state, setState] = useState<CustomerDisplayPayload>({
        step: "idle",
        timestamp: Date.now(),
        items: [],
        subtotal: 0,
        discount: 0,
        tax: 0,
        total: 0,
        earnedPoints: 0,
    });

    useEffect(() => {
        const stored = getStoredCustomerDisplayState();
        if (stored) {
            setState(stored);
        }

        const handleStorage = (e: StorageEvent) => {
            if (e.key === "pos_customer_display_state" && e.newValue) {
                try {
                    setState(JSON.parse(e.newValue));
                } catch {}
            }
        };
        window.addEventListener("storage", handleStorage);

        let bc: BroadcastChannel | null = null;
        if ("BroadcastChannel" in window) {
            bc = new BroadcastChannel("pos_customer_display_channel");
            bc.onmessage = (event) => {
                if (event.data?.type === "STATE_UPDATE" && event.data.payload) {
                    setState(event.data.payload);
                } else if (event.data?.type === "CLOSE_WINDOW") {
                    window.close();
                }
            };
        }

        return () => {
            window.removeEventListener("storage", handleStorage);
            if (bc) bc.close();
        };
    }, []);

    // تلقائياً العودة لوضع الانتظار بعد 8 ثوانٍ من إتمام الفاتورة
    useEffect(() => {
        if (state.step === "completed") {
            const timer = setTimeout(() => {
                setState((prev) => ({
                    ...prev,
                    step: "idle",
                    items: [],
                    subtotal: 0,
                    discount: 0,
                    loyaltyDiscount: 0,
                    total: 0,
                    earnedPoints: 0,
                }));
            }, 8000);
            return () => clearTimeout(timer);
        }
    }, [state.step]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    };

    const activePromos = useMemo(() => {
        if (state.activePromotions && state.activePromotions.length > 0) {
            return state.activePromotions;
        }
        return (promotions || []).filter((p: any) => p.isActive !== false).slice(0, 6);
    }, [state.activePromotions, promotions]);

    const effectiveStep = useMemo(() => {
        if (state.step === "completed") return "completed";
        if (state.step === "payment" && state.items.length > 0) return "payment";
        if (state.items && state.items.length > 0) return "scanning";
        return "idle";
    }, [state.step, state.items]);

    if (!config.dualScreen.enabled) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-center" dir="rtl">
                <Store className="h-16 w-16 text-slate-600 mb-4" />
                <h1 className="text-2xl font-bold mb-2">شاشة عرض العميل متوقفة حالياً</h1>
                <p className="text-slate-400 text-sm mb-6">يمكنك تفعيلها من إعدادات تجربة العملاء ونقاط الولاء.</p>
                <Button variant="outline" onClick={() => window.close()}>إغلاق النافذة</Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col justify-between select-none overflow-hidden" dir="rtl">
            {/* الشريط العلوي */}
            <header className="flex items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    {config.dualScreen.idleStep.showCompanyLogo && (
                        <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center overflow-hidden">
                            <Store className="h-6 w-6 text-emerald-400" />
                        </div>
                    )}
                    <div>
                        <h1 className="text-xl font-extrabold tracking-tight text-white">{state.companyName || companyName}</h1>
                        <p className="text-xs text-slate-400">{state.branchName || "نقطة البيع الذكية"}</p>
                    </div>
                </div>

                {/* بطاقة العميل ونقاط الولاء في الهيدر */}
                {config.dualScreen.scanningStep.showCustomerNameAndPoints && state.customer && (
                    <div className="flex items-center gap-4 bg-slate-800/70 border border-slate-700 px-4 py-2 rounded-xl">
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-emerald-400" />
                            <span className="text-sm font-bold">{state.customer.name}</span>
                        </div>
                        {config.loyalty.enabled && (
                            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 gap-1.5 px-3 py-1">
                                <Gift className="h-3.5 w-3.5" />
                                رصيد نقاطك: {Number(state.customer.loyaltyPoints || 0).toLocaleString()} نقطة
                                ({calculateRedeemableCash(state.customer.loyaltyPoints || 0, config)} ج.م)
                            </Badge>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-slate-700 text-slate-300 font-mono text-xs px-3 py-1">
                        {effectiveStep === "idle" && "في انتظار العميل"}
                        {effectiveStep === "scanning" && "جاري تسجيل الأصناف"}
                        {effectiveStep === "payment" && "خطوة الدفع والسداد"}
                        {effectiveStep === "completed" && "تم إتمام الفاتورة"}
                    </Badge>
                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white h-8 w-8" onClick={toggleFullscreen} title="ملء الشاشة">
                        <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-400 h-8 w-8" onClick={() => window.close()} title="إغلاق الشاشة">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </header>

            {/* المحتوى الرئيسي المتغير حسب الخطوة */}
            <main className="flex-1 flex flex-col p-6 overflow-hidden">
                {/* 1. خطوة الانتظار والترحيب (IDLE STEP) */}
                {effectiveStep === "idle" && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center max-w-4xl mx-auto space-y-8">
                        {config.dualScreen.idleStep.showWelcomeMessage && (
                            <div className="space-y-3">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-medium">
                                    <Sparkles className="h-4 w-4" />
                                    مرحباً بكم في {state.companyName || companyName}
                                </div>
                                <h2 className="text-4xl md:text-5xl font-black text-white leading-tight">
                                    {config.dualScreen.welcomeTitle}
                                </h2>
                                <p className="text-lg text-slate-300 max-w-2xl mx-auto">
                                    {config.dualScreen.welcomeSubtitle}
                                </p>
                            </div>
                        )}

                        {config.dualScreen.idleStep.showLoyaltyBanner && config.loyalty.enabled && (
                            <div className="w-full bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-emerald-500/20 border border-amber-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-4 text-right">
                                    <div className="p-3.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
                                        <Gift className="h-8 w-8" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-amber-300">برنامج نقاط الولاء والكاش باك</h3>
                                        <p className="text-sm text-slate-300 mt-1">
                                            اكسب <span className="font-bold text-white">1 نقطة</span> مقابل كل <span className="font-bold text-white">{config.loyalty.amountPerPoint} ج.م</span> مشتريات، واستبدل كل نقطة بخصم فوري قيمته <span className="font-bold text-emerald-400">{config.loyalty.pointRedeemValue} ج.م</span>!
                                        </p>
                                    </div>
                                </div>
                                <Badge className="bg-amber-500 text-slate-950 font-bold text-sm px-4 py-2 shrink-0">
                                    خصم فوري على فاتورتك القادمة
                                </Badge>
                            </div>
                        )}

                        {config.dualScreen.idleStep.showActivePromotions && activePromos.length > 0 && (
                            <div className="w-full space-y-3">
                                <h3 className="text-sm font-bold text-slate-400 flex items-center justify-center gap-2">
                                    <Tag className="h-4 w-4 text-purple-400" />
                                    العروض الترويجية السارية اليوم
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    {activePromos.map((promo: any) => (
                                        <div key={promo.id} className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 text-right flex items-start gap-3">
                                            <Sparkles className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
                                            <div>
                                                <div className="font-bold text-purple-200 text-sm">{promo.name}</div>
                                                <div className="text-xs text-slate-300 mt-1">
                                                    {promo.description || (promo.value ? `خصم خاص بقيمة ${promo.value}` : "عرض ترويجي مميز")}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 2. خطوة ضرب الأصناف (SCANNING STEP) */}
                {effectiveStep === "scanning" && (
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
                        {/* قائمة الأصناف */}
                        {config.dualScreen.scanningStep.showItemsList && (
                            <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col overflow-hidden">
                                <div className="px-5 py-3.5 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2 font-bold text-base">
                                        <ShoppingCart className="h-5 w-5 text-emerald-400" />
                                        سلة المشتريات الحالية
                                    </div>
                                    <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        {state.items.reduce((sum, i) => sum + Number(i.qty || 0), 0)} قطعة ({state.items.length} صنف)
                                    </Badge>
                                </div>
                                <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70 p-2">
                                    {state.items.map((item, idx) => {
                                        const hasItemDiscount = (item.originalPrice && item.originalPrice > item.price) || (item.discountApplied && item.discountApplied > 0);
                                        const isLatest = idx === state.items.length - 1;
                                        return (
                                            <div
                                                key={`${item.id}-${idx}`}
                                                className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                                                    isLatest ? "bg-emerald-500/10 border border-emerald-500/30" : "hover:bg-slate-800/40"
                                                }`}
                                            >
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-lg text-white">{item.name}</span>
                                                        {config.dualScreen.scanningStep.showPromotionsBadge && (item.promoApplied || hasItemDiscount) && (
                                                            <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs gap-1">
                                                                <Sparkles className="h-3 w-3" />
                                                                {item.promoName || "عرض خاص"}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-slate-400 flex items-center gap-3">
                                                        <span>الكمية: <strong className="text-white font-mono text-sm">{item.qty}</strong></span>
                                                        <span>×</span>
                                                        <span>سعر الوحدة: <strong className="text-white font-mono text-sm">{Number(item.price).toLocaleString()} ج.م</strong></span>
                                                        {config.dualScreen.scanningStep.showOriginalPriceAndDiscount && item.originalPrice && item.originalPrice > item.price && (
                                                            <span className="line-through text-red-400 font-mono">
                                                                {Number(item.originalPrice).toLocaleString()} ج.م
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-left">
                                                    <div className="text-xl font-black font-mono text-emerald-400">
                                                        {Number(item.total ?? item.qty * item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                                                    </div>
                                                    {config.dualScreen.scanningStep.showOriginalPriceAndDiscount && hasItemDiscount && (
                                                        <div className="text-xs text-amber-400 font-medium">
                                                            وفرت {Number(((item.originalPrice || item.price) - item.price) * item.qty).toLocaleString()} ج.م
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ملخص الفاتورة والإجمالي */}
                        <div className={`${config.dualScreen.scanningStep.showItemsList ? "lg:col-span-4" : "lg:col-span-12 max-w-xl mx-auto w-full"} flex flex-col justify-between bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6`}>
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold border-b border-slate-800 pb-3">ملخص الحساب</h3>
                                {config.dualScreen.scanningStep.showSubtotalAndTax && (
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between text-slate-300">
                                            <span>الإجمالي الفرعي:</span>
                                            <span className="font-mono font-bold">{Number(state.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
                                        </div>
                                        {state.discount > 0 && (
                                            <div className="flex justify-between text-amber-400 font-medium">
                                                <span>إجمالي الخصومات والعروض:</span>
                                                <span className="font-mono">-{Number(state.discount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
                                            </div>
                                        )}
                                        {state.loyaltyDiscount && state.loyaltyDiscount > 0 ? (
                                            <div className="flex justify-between text-emerald-400 font-medium">
                                                <span>خصم نقاط الولاء المستبدلة ({state.redeemedPoints} نقطة):</span>
                                                <span className="font-mono">-{Number(state.loyaltyDiscount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
                                            </div>
                                        ) : null}
                                        {state.tax > 0 && (
                                            <div className="flex justify-between text-slate-400">
                                                <span>الضريبة المضافة:</span>
                                                <span className="font-mono">{Number(state.tax).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                {config.loyalty.enabled && config.dualScreen.scanningStep.showCustomerNameAndPoints && state.earnedPoints > 0 && (
                                    <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl p-3.5 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                                            <Gift className="h-4 w-4 shrink-0" />
                                            <span>نقاط الولاء المكتسبة من هذه الفاتورة:</span>
                                        </div>
                                        <Badge className="bg-amber-500 text-slate-950 font-bold">
                                            +{state.earnedPoints} نقطة
                                        </Badge>
                                    </div>
                                )}

                                <div className="bg-emerald-500/15 border-2 border-emerald-500/40 rounded-2xl p-5 text-center space-y-1">
                                    <div className="text-sm text-emerald-300 font-semibold">الإجمالي المطلوب سداده</div>
                                    <div className="text-4xl font-black font-mono text-emerald-400">
                                        {Number(state.total).toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xl">ج.م</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. خطوة الدفع ورمز الـ QR (PAYMENT STEP) */}
                {effectiveStep === "payment" && (
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center max-w-6xl mx-auto w-full">
                        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-5">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Wallet className="h-6 w-6 text-emerald-400" />
                                تأكيد وسداد الفاتورة
                            </h3>
                            <div className="space-y-2.5 text-sm border-y border-slate-800 py-4">
                                <div className="flex justify-between text-slate-300">
                                    <span>عدد الأصناف:</span>
                                    <span className="font-bold">{state.items.length} صنف</span>
                                </div>
                                <div className="flex justify-between text-slate-300">
                                    <span>الإجمالي قبل الخصم:</span>
                                    <span className="font-mono">{Number(state.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
                                </div>
                                {state.discount > 0 && (
                                    <div className="flex justify-between text-amber-400">
                                        <span>إجمالي الوفر والخصم:</span>
                                        <span className="font-mono">-{Number(state.discount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
                                    </div>
                                )}
                            </div>
                            <div className="bg-emerald-500/20 border-2 border-emerald-500/50 rounded-2xl p-6 text-center">
                                <div className="text-sm text-emerald-200 mb-1">المبلغ الإجمالي المستحق</div>
                                <div className="text-5xl font-black font-mono text-emerald-400">
                                    {Number(state.total).toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-2xl">ج.م</span>
                                </div>
                            </div>
                            {config.loyalty.enabled && state.earnedPoints > 0 && (
                                <div className="text-center text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl py-2.5 px-4">
                                    🌟 ستكسب <strong>+{state.earnedPoints} نقطة ولاء</strong> فور إتمام هذه الفاتورة!
                                </div>
                            )}
                        </div>

                        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {config.dualScreen.paymentStep.showInstaPayQr && config.dualScreen.paymentStep.instaPayAddress && (
                                <div className="bg-slate-900 border border-purple-500/40 rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
                                    <Badge className="bg-purple-600 text-white px-3 py-1 text-xs">الدفع السريع عبر InstaPay</Badge>
                                    <div className="bg-white p-4 rounded-2xl shadow-lg">
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                                                `instapay:${config.dualScreen.paymentStep.instaPayAddress}?amount=${state.total}`
                                            )}`}
                                            alt="InstaPay QR"
                                            className="w-40 h-40 object-contain"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs text-slate-400">عنوان الدفع (IPA):</div>
                                        <div className="font-mono font-bold text-purple-300 text-base">{config.dualScreen.paymentStep.instaPayAddress}</div>
                                    </div>
                                </div>
                            )}

                            {config.dualScreen.paymentStep.showVodafoneCashQr && config.dualScreen.paymentStep.vodafoneCashNumber && (
                                <div className="bg-slate-900 border border-red-500/40 rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
                                    <Badge className="bg-red-600 text-white px-3 py-1 text-xs">محفظة فودافون كاش / المحافظ الذكية</Badge>
                                    <div className="bg-white p-4 rounded-2xl shadow-lg">
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                                                `tel:*9*7*${config.dualScreen.paymentStep.vodafoneCashNumber}*${Math.round(state.total)}#`
                                            )}`}
                                            alt="Vodafone Cash QR"
                                            className="w-40 h-40 object-contain"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
                                            <Smartphone className="h-3.5 w-3.5" />
                                            رقم المحفظة للتحويل:
                                        </div>
                                        <div className="font-mono font-bold text-red-400 text-lg tracking-wider">{config.dualScreen.paymentStep.vodafoneCashNumber}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 4. خطوة إتمام الفاتورة والشكر (COMPLETED STEP) */}
                {effectiveStep === "completed" && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-6">
                        <div className="h-24 w-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 animate-bounce">
                            <CheckCircle2 className="h-14 w-14" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-4xl font-black text-white">شكراً لتسوقكم معنا!</h2>
                            <p className="text-slate-300 text-lg">
                                تم إصدار فاتورتكم رقم <span className="font-mono font-bold text-emerald-400">{state.invoiceNumber || ""}</span> بنجاح
                            </p>
                        </div>

                        {config.dualScreen.paymentStep.showEarnedPointsSummary && config.loyalty.enabled && state.earnedPoints > 0 && (
                            <div className="w-full bg-amber-500/15 border border-amber-500/40 rounded-2xl p-6 space-y-2">
                                <div className="flex items-center justify-center gap-2 text-amber-300 font-bold text-lg">
                                    <Gift className="h-6 w-6" />
                                    مبروك! لقد ربحت نقاط ولاء جديدة
                                </div>
                                <div className="text-3xl font-black text-white">
                                    +{state.earnedPoints} نقطة ولاء
                                </div>
                                {state.customer && (
                                    <p className="text-xs text-slate-300">
                                        إجمالي رصيد نقاطك الآن: <strong>{Number(state.customer.loyaltyPoints || 0).toLocaleString()} نقطة</strong> (تساوي {calculateRedeemableCash(state.customer.loyaltyPoints || 0, config)} ج.م خصم نقدي)
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* الفوتر السفلي */}
            <footer className="px-6 py-3 bg-slate-900/60 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>{state.companyName || companyName} — نظام نقاط البيع المتكامل</span>
                <span>نتمنى لكم يوماً سعيداً 🌟</span>
            </footer>
        </div>
    );
}
