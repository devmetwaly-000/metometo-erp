"use client";

export interface ProductPointsPromotion {
    id: string;
    name: string;
    targetType: 'item' | 'category';
    targetId: string;
    targetName?: string;
    pointsMode: 'fixed_per_unit' | 'multiplier';
    pointsValue: number;
    isActive: boolean;
    startDate?: string;
    endDate?: string;
}

export interface CustomerExperienceConfig {
    loyalty: {
        enabled: boolean;
        amountPerPoint: number;       // مثلاً: كل 100 ج.م = 1 نقطة
        pointRedeemValue: number;     // مثلاً: كل 1 نقطة = 5 ج.م خصم كاش باك
        minPointsToRedeem: number;    // الحد الأدنى للنقاط المسموح باستبدالها
        awardOnDiscountedItems: boolean;
        productPointsPromotions?: ProductPointsPromotion[];
    };
    dualScreen: {
        enabled: boolean;
        welcomeTitle: string;
        welcomeSubtitle: string;
        idleStep: {
            showCompanyLogo: boolean;
            showWelcomeMessage: boolean;
            showActivePromotions: boolean;
            showLoyaltyBanner: boolean;
        };
        scanningStep: {
            showItemsList: boolean;
            showOriginalPriceAndDiscount: boolean;
            showPromotionsBadge: boolean;
            showCustomerNameAndPoints: boolean;
            showSubtotalAndTax: boolean;
        };
        paymentStep: {
            showInstaPayQr: boolean;
            instaPayAddress: string;
            showVodafoneCashQr: boolean;
            vodafoneCashNumber: string;
            showEarnedPointsSummary: boolean;
        };
    };
    whatsapp: {
        enabled: boolean;
        autoSendOnPosCheckout: boolean;
        mode: 'web_direct' | 'webhook_api';
        apiWebhookUrl: string;
        apiToken: string;
        includeItemsInMessage: boolean;
        includeLoyaltyPointsInMessage: boolean;
        footerMessage: string;
    };
}

export const DEFAULT_CUSTOMER_EXPERIENCE_CONFIG: CustomerExperienceConfig = {
    loyalty: {
        enabled: true,
        amountPerPoint: 100,
        pointRedeemValue: 5,
        minPointsToRedeem: 5,
        awardOnDiscountedItems: true,
        productPointsPromotions: [],
    },
    dualScreen: {
        enabled: true,
        welcomeTitle: "أهلاً ومرحباً بكم",
        welcomeSubtitle: "نسعد بخدمتكم دائماً.. استمتعوا بأفضل العروض ونقاط الولاء مع كل فاتورة",
        idleStep: {
            showCompanyLogo: true,
            showWelcomeMessage: true,
            showActivePromotions: true,
            showLoyaltyBanner: true,
        },
        scanningStep: {
            showItemsList: true,
            showOriginalPriceAndDiscount: true,
            showPromotionsBadge: true,
            showCustomerNameAndPoints: true,
            showSubtotalAndTax: true,
        },
        paymentStep: {
            showInstaPayQr: true,
            instaPayAddress: "merchant@instapay",
            showVodafoneCashQr: true,
            vodafoneCashNumber: "01000000000",
            showEarnedPointsSummary: true,
        },
    },
    whatsapp: {
        enabled: true,
        autoSendOnPosCheckout: false,
        mode: 'web_direct',
        apiWebhookUrl: "",
        apiToken: "",
        includeItemsInMessage: true,
        includeLoyaltyPointsInMessage: true,
        footerMessage: "شكراً لتعاملكم معنا! نسعد بزيارتكم القادمة 🌟",
    },
};

export function getCustomerExperienceConfig(settings: any): CustomerExperienceConfig {
    const saved = settings?.main?.customerExperience || {};
    return {
        loyalty: {
            ...DEFAULT_CUSTOMER_EXPERIENCE_CONFIG.loyalty,
            ...(saved.loyalty || {}),
        },
        dualScreen: {
            ...DEFAULT_CUSTOMER_EXPERIENCE_CONFIG.dualScreen,
            ...(saved.dualScreen || {}),
            idleStep: {
                ...DEFAULT_CUSTOMER_EXPERIENCE_CONFIG.dualScreen.idleStep,
                ...(saved.dualScreen?.idleStep || {}),
            },
            scanningStep: {
                ...DEFAULT_CUSTOMER_EXPERIENCE_CONFIG.dualScreen.scanningStep,
                ...(saved.dualScreen?.scanningStep || {}),
            },
            paymentStep: {
                ...DEFAULT_CUSTOMER_EXPERIENCE_CONFIG.dualScreen.paymentStep,
                ...(saved.dualScreen?.paymentStep || {}),
            },
        },
        whatsapp: {
            ...DEFAULT_CUSTOMER_EXPERIENCE_CONFIG.whatsapp,
            ...(saved.whatsapp || {}),
        },
    };
}

export function calculateEarnedPoints(invoiceTotal: number, config: CustomerExperienceConfig): number {
    if (!config.loyalty.enabled || invoiceTotal <= 0) return 0;
    const rate = Math.max(1, Number(config.loyalty.amountPerPoint) || 100);
    return Math.floor((invoiceTotal / rate) * 10) / 10;
}

export function getActiveProductPointsPromotions(config: CustomerExperienceConfig): ProductPointsPromotion[] {
    const list = config?.loyalty?.productPointsPromotions || [];
    const now = new Date();
    return list.filter((promo) => {
        if (!promo || !promo.isActive) return false;
        if (promo.startDate && new Date(promo.startDate) > now) return false;
        if (promo.endDate) {
            const end = new Date(promo.endDate);
            end.setHours(23, 59, 59, 999);
            if (end < now) return false;
        }
        return Number(promo.pointsValue) > 0;
    });
}

export function getItemPointsPromotion(
    item: { id: string; categoryId?: string },
    config: CustomerExperienceConfig
): ProductPointsPromotion | null {
    if (!config?.loyalty?.enabled) return null;
    const active = getActiveProductPointsPromotions(config);
    // الأولوية لعرض الصنف المحدد ثم عرض التصنيف
    return (
        active.find((p) => p.targetType === 'item' && p.targetId === item.id) ||
        active.find((p) => p.targetType === 'category' && Boolean(item.categoryId) && p.targetId === item.categoryId) ||
        null
    );
}

export function calculateInvoiceLoyaltyPoints(params: {
    invoiceTotal: number;
    items: { id: string; categoryId?: string; qty: number; total: number }[];
    config: CustomerExperienceConfig;
}): number {
    const { invoiceTotal, items, config } = params;
    if (!config?.loyalty?.enabled || invoiceTotal <= 0) return 0;

    const rate = Math.max(1, Number(config.loyalty.amountPerPoint) || 100);
    let totalPoints = invoiceTotal / rate;

    for (const item of items || []) {
        const promo = getItemPointsPromotion(item, config);
        if (!promo) continue;

        if (promo.pointsMode === 'fixed_per_unit') {
            totalPoints += Number(promo.pointsValue) * Math.max(0, Number(item.qty) || 0);
        } else if (promo.pointsMode === 'multiplier') {
            const extraMultiplier = Math.max(0, Number(promo.pointsValue) - 1);
            const itemBasePts = Math.max(0, Number(item.total) || 0) / rate;
            totalPoints += itemBasePts * extraMultiplier;
        }
    }

    return Math.floor(totalPoints * 10) / 10;
}

export function calculateRedeemableCash(points: number, config: CustomerExperienceConfig): number {
    if (!config.loyalty.enabled || points <= 0) return 0;
    const val = Math.max(0, Number(config.loyalty.pointRedeemValue) || 1);
    return Math.round(points * val * 100) / 100;
}

export interface CustomerDisplayPayload {
    step: 'idle' | 'scanning' | 'payment' | 'completed';
    timestamp: number;
    companyName?: string;
    branchName?: string;
    items: {
        id: string;
        name: string;
        qty: number;
        price: number;
        originalPrice?: number;
        total: number;
        discountApplied?: number;
        promoApplied?: string | null;
        promoName?: string;
    }[];
    subtotal: number;
    discount: number;
    loyaltyDiscount?: number;
    redeemedPoints?: number;
    tax: number;
    total: number;
    customer?: {
        id: string;
        name: string;
        phone?: string;
        loyaltyPoints: number;
        currentBalance?: number;
    } | null;
    earnedPoints: number;
    invoiceNumber?: string;
    activePromotions?: {
        id: string;
        name: string;
        description?: string;
        type?: string;
        value?: number;
    }[];
}

const CHANNEL_NAME = 'pos_customer_display_channel';
const STORAGE_KEY = 'pos_customer_display_state';

let globalCustomerWindow: Window | null = null;

export function broadcastToCustomerDisplay(payload: CustomerDisplayPayload) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}
    try {
        if ('BroadcastChannel' in window) {
            const bc = new BroadcastChannel(CHANNEL_NAME);
            bc.postMessage({ type: 'STATE_UPDATE', payload });
            bc.close();
        }
    } catch {}
}

export function getStoredCustomerDisplayState(): CustomerDisplayPayload | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export async function openCustomerDisplayWindow(): Promise<Window | null> {
    if (typeof window === 'undefined') return null;
    if (globalCustomerWindow && !globalCustomerWindow.closed) {
        try {
            globalCustomerWindow.focus();
        } catch {}
        return globalCustomerWindow;
    }

    const screenAny = window.screen as any;
    let targetLeft = Number(screenAny?.availLeft) || 0;
    let targetTop = Number(screenAny?.availTop) || 0;
    let targetWidth = window.screen.availWidth || 1280;
    let targetHeight = window.screen.availHeight || 800;

    // 1. محاولة استخدام Window Management API لاكتشاف الشاشة الثانوية (Extended Display) بدقة
    try {
        const winAny = window as any;
        if (typeof winAny.getScreenDetails === 'function') {
            const details = await winAny.getScreenDetails();
            const screens: any[] = details?.screens || [];
            const currentScreen = details?.currentScreen;
            const extendedScreen =
                screens.find((s) => currentScreen && s !== currentScreen && !s.isPrimary) ||
                screens.find((s) => !s.isPrimary) ||
                screens.find((s) => currentScreen && s !== currentScreen);

            if (extendedScreen) {
                targetLeft = extendedScreen.availLeft ?? extendedScreen.left ?? targetLeft;
                targetTop = extendedScreen.availTop ?? extendedScreen.top ?? targetTop;
                targetWidth = extendedScreen.availWidth ?? extendedScreen.width ?? targetWidth;
                targetHeight = extendedScreen.availHeight ?? extendedScreen.height ?? targetHeight;
            }
        } else if ((window.screen as any)?.isExtended) {
            // 2. Fallback للمتصفحات التي تدعم screen.isExtended بدون getScreenDetails
            const primaryWidth = window.screen.width || 1366;
            targetLeft = window.screenX >= primaryWidth ? 0 : primaryWidth;
            targetTop = 0;
            targetWidth = window.screen.availWidth || 1280;
            targetHeight = window.screen.availHeight || 800;
        }
    } catch {
        // Fallback في حال رفض صلاحية Window Management
        if ((window.screen as any)?.isExtended) {
            const primaryWidth = window.screen.width || 1366;
            targetLeft = window.screenX >= primaryWidth ? 0 : primaryWidth;
            targetTop = 0;
        }
    }

    globalCustomerWindow = window.open(
        '/pos/customer-display',
        'CustomerDualDisplayWindow',
        `left=${Math.round(targetLeft)},top=${Math.round(targetTop)},width=${Math.round(targetWidth)},height=${Math.round(targetHeight)},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );

    if (globalCustomerWindow) {
        try {
            globalCustomerWindow.moveTo(Math.round(targetLeft), Math.round(targetTop));
            globalCustomerWindow.resizeTo(Math.round(targetWidth), Math.round(targetHeight));
        } catch {}
    }

    return globalCustomerWindow;
}

export function closeCustomerDisplayWindow() {
    if (typeof window === 'undefined') return;
    try {
        if (globalCustomerWindow && !globalCustomerWindow.closed) {
            globalCustomerWindow.close();
        }
        globalCustomerWindow = null;
        if ('BroadcastChannel' in window) {
            const bc = new BroadcastChannel(CHANNEL_NAME);
            bc.postMessage({ type: 'CLOSE_WINDOW' });
            bc.close();
        }
    } catch {}
}

export function isCustomerDisplayWindowOpen(): boolean {
    return Boolean(globalCustomerWindow && !globalCustomerWindow.closed);
}

export function normalizeEgyptianPhone(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('20') && digits.length >= 12) return digits;
    if (digits.startsWith('01') && digits.length === 11) return `2${digits}`;
    if (digits.startsWith('1') && digits.length === 10) return `20${digits}`;
    return digits;
}

export function buildWhatsAppInvoiceMessage(params: {
    companyName: string;
    invoiceNumber: string;
    customerName?: string;
    date: string;
    items: { name: string; qty: number; price: number; total?: number }[];
    subtotal: number;
    discount: number;
    total: number;
    paidAmount: number;
    earnedPoints?: number;
    totalCustomerPoints?: number;
    config: CustomerExperienceConfig;
}): string {
    const {
        companyName,
        invoiceNumber,
        customerName,
        date,
        items,
        subtotal,
        discount,
        total,
        paidAmount,
        earnedPoints = 0,
        totalCustomerPoints = 0,
        config,
    } = params;

    const lines: string[] = [];
    lines.push(`🧾 *إيصال فاتورة مبيعات - ${companyName || 'متجرنا'}*`);
    lines.push(`━━━━━━━━━━━━━━━━━━`);
    lines.push(`📌 *رقم الفاتورة:* ${invoiceNumber}`);
    lines.push(`📅 *التاريخ:* ${new Date(date).toLocaleString('ar-EG')}`);
    if (customerName) {
        lines.push(`👤 *العميل:* ${customerName}`);
    }

    if (config.whatsapp.includeItemsInMessage && items && items.length > 0) {
        lines.push(`━━━━━━━━━━━━━━━━━━`);
        lines.push(`🛒 *الأصناف:*`);
        items.forEach((it, idx) => {
            const lineTotal = it.total ?? (it.qty * it.price);
            lines.push(`${idx + 1}. ${it.name} (${it.qty} × ${Number(it.price).toLocaleString()}) = *${Number(lineTotal).toLocaleString()} ج.م*`);
        });
    }

    lines.push(`━━━━━━━━━━━━━━━━━━`);
    if (discount > 0) {
        lines.push(`💵 *الإجمالي قبل الخصم:* ${Number(subtotal).toLocaleString()} ج.م`);
        lines.push(`🎁 *الخصم الممنوح:* -${Number(discount).toLocaleString()} ج.م`);
    }
    lines.push(`💰 *الصافي الإجمالي:* *${Number(total).toLocaleString()} ج.م*`);
    lines.push(`✅ *المدفوع:* ${Number(paidAmount).toLocaleString()} ج.م`);
    const remaining = Math.max(0, total - paidAmount);
    if (remaining > 0.01) {
        lines.push(`⏳ *المتبقي:* ${remaining.toLocaleString()} ج.م`);
    }

    if (config.whatsapp.includeLoyaltyPointsInMessage && config.loyalty.enabled && (earnedPoints > 0 || totalCustomerPoints > 0)) {
        lines.push(`━━━━━━━━━━━━━━━━━━`);
        if (earnedPoints > 0) {
            lines.push(`🌟 *نقاط الولاء المكتسبة من الفاتورة:* +${earnedPoints} نقطة`);
        }
        if (totalCustomerPoints > 0) {
            const cashVal = calculateRedeemableCash(totalCustomerPoints, config);
            lines.push(`🏆 *إجمالي رصيد نقاطك الحالي:* ${totalCustomerPoints} نقطة (تساوي ${cashVal} ج.م كاش باك)`);
        }
    }

    if (config.whatsapp.footerMessage) {
        lines.push(`━━━━━━━━━━━━━━━━━━`);
        lines.push(config.whatsapp.footerMessage);
    }

    return lines.join('\n');
}

export async function sendWhatsAppMessage(phone: string, message: string, config: CustomerExperienceConfig): Promise<{ success: boolean; method: string }> {
    const normalizedPhone = normalizeEgyptianPhone(phone);
    if (!normalizedPhone) {
        return { success: false, method: 'none' };
    }

    if (config.whatsapp.mode === 'webhook_api' && config.whatsapp.apiWebhookUrl) {
        try {
            const res = await fetch(config.whatsapp.apiWebhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(config.whatsapp.apiToken ? { Authorization: `Bearer ${config.whatsapp.apiToken}` } : {}),
                },
                body: JSON.stringify({
                    phone: normalizedPhone,
                    message,
                }),
            });
            if (res.ok) {
                return { success: true, method: 'webhook_api' };
            }
        } catch (e) {
            console.warn('WhatsApp webhook fallback to web_direct:', e);
        }
    }

    if (typeof window !== 'undefined') {
        const url = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
        return { success: true, method: 'web_direct' };
    }

    return { success: false, method: 'none' };
}
