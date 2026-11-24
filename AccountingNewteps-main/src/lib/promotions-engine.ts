/**
 * محرك التحقق من توقيت وسريان العروض والخصومات بدقة الدقيقة واليوم
 */

export interface PromotionTimeConfig {
    id?: string;
    startDate: string;
    endDate: string;
    warehouseIds?: string[];
    hasDailyTimeWindow?: boolean;
    dailyStartTime?: string; // HH:mm format, e.g. "14:00"
    dailyEndTime?: string;   // HH:mm format, e.g. "18:00"
    activeDays?: number[];   // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
    [key: string]: any;
}

/**
 * تحويل تاريخ أو نص تاريخ إلى كائن Date قياسي مع مراعاة حالة التاريخ فقط
 */
export function parsePromoDate(dateStr: string, isEndOfDay = false): Date {
    if (!dateStr) return isEndOfDay ? new Date(8640000000000000) : new Date(0);
    
    // If input is YYYY-MM-DD only
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return isEndOfDay
            ? new Date(y, m - 1, d, 23, 59, 59, 999)
            : new Date(y, m - 1, d, 0, 0, 0, 0);
    }

    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? (isEndOfDay ? new Date(8640000000000000) : new Date(0)) : d;
}

/**
 * التحقق الصارم من سريان العرض في اللحظة الزمنية الحالية باليوم والساعة والدقيقة
 */
export function isPromotionCurrentlyActive(
    promo: PromotionTimeConfig,
    now: Date = new Date(),
    currentWarehouseId?: string
): { active: boolean; reason?: string } {
    if (!promo) return { active: false, reason: 'العرض غير موجود' };

    // 1. فحص الفرع / المستودع
    if (promo.warehouseIds && promo.warehouseIds.length > 0 && currentWarehouseId) {
        if (!promo.warehouseIds.includes(currentWarehouseId)) {
            return { active: false, reason: 'العرض غير مخصص لهذا الفرع' };
        }
    }

    // 2. فحص النطاق الزمني الكلي (تاريخ ووقت البدء والانتهاء)
    const startDate = parsePromoDate(promo.startDate, false);
    const endDate = parsePromoDate(promo.endDate, true);

    const nowTime = now.getTime();
    if (nowTime < startDate.getTime()) {
        return { 
            active: false, 
            reason: `العرض لم يبدأ بعد (يبدأ في ${startDate.toLocaleString('ar-EG')})` 
        };
    }
    if (nowTime > endDate.getTime()) {
        return { 
            active: false, 
            reason: `العرض منتهي الصلاحية (انتهى في ${endDate.toLocaleString('ar-EG')})` 
        };
    }

    // 3. فحص الأيام المحددة في الأسبوع (إن وجدت)
    if (Array.isArray(promo.activeDays) && promo.activeDays.length > 0) {
        const currentDay = now.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
        if (!promo.activeDays.includes(currentDay)) {
            const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            return { 
                active: false, 
                reason: `العرض غير سارٍ اليوم (${dayNames[currentDay]})` 
            };
        }
    }

    // 4. فحص ساعات العمل اليومية (نافذة الساعات / Happy Hour)
    if (promo.hasDailyTimeWindow && promo.dailyStartTime && promo.dailyEndTime) {
        const [startH, startM] = promo.dailyStartTime.split(':').map(Number);
        const [endH, endM] = promo.dailyEndTime.split(':').map(Number);

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = (startH || 0) * 60 + (startM || 0);
        const endMinutes = (endH || 0) * 60 + (endM || 0);

        if (startMinutes <= endMinutes) {
            // نافذة عادية خلال نفس اليوم (مثلاً من 14:00 إلى 18:00)
            if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
                return { 
                    active: false, 
                    reason: `العرض سارٍ فقط بين الساعة ${promo.dailyStartTime} والساعة ${promo.dailyEndTime}` 
                };
            }
        } else {
            // نافذة عابرة لمنتصف الليل (مثلاً من 22:00 إلى 03:00)
            if (currentMinutes < startMinutes && currentMinutes > endMinutes) {
                return { 
                    active: false, 
                    reason: `العرض سارٍ فقط بين الساعة ${promo.dailyStartTime} وحتى ${promo.dailyEndTime}` 
                };
            }
        }
    }

    return { active: true };
}
