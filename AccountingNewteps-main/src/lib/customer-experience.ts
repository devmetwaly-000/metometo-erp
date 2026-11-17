"use client";

export interface CustomerExperienceConfig {
    loyalty: {
        enabled: boolean;
        amountPerPoint: number;       // مثلاً: كل 100 ج.م = 1 نقطة
        pointRedeemValue: number;     // مثلاً: كل 1 نقطة = 5 ج.م خصم كاش باك
        minPointsToRedeem: number;    // الحد الأدنى للنقاط المسموح باستبدالها
        awardOnDiscountedItems: boolean;
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

export function openCustomerDisplayWindow(): Window | null {
    if (typeof window === 'undefined') return null;
    if (globalCustomerWindow && !globalCustomerWindow.closed) {
        globalCustomerWindow.focus();
        return globalCustomerWindow;
    }
    const width = Math.min(1280, window.screen.availWidth || 1024);
    const height = Math.min(800, window.screen.availHeight || 768);
    globalCustomerWindow = window.open(
        '/pos/customer-display',
        'CustomerDualDisplayWindow',
        `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );
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
