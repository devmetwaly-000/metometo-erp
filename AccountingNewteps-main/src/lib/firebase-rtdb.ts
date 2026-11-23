/**
 * @fileOverview محرك الاتصال والمزامنة الفورية مع Firebase Realtime Database
 * يدعم الربط المباشر عالي السرعة بدون الحاجة لـ IP ثابت (No Real IP / Port Forwarding):
 * 1. فحص الاتصال وقياس زمن الاستجابة (Latency).
 * 2. قراءة وحفظ وتحديث الكائنات (JSON Trees) المتوافقة مع جداول النظام المحاسبي.
 * 3. المزامنة الذكية للحركات (Sales, Invoices, Items, Customers, Sessions).
 */

export interface FirebaseRealtimeConfig {
    databaseUrl: string;
    apiKey?: string;
    projectId?: string;
    authToken?: string; // Database secret or auth token
}

/**
 * تنظيف وتنسيق رابط قاعدة بيانات Firebase
 */
export function sanitizeFirebaseUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    let clean = rawUrl.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `https://${clean}`;
    }
    // إزالة السلاش في النهاية إن وجد
    return clean.replace(/\/+$/, '');
}

/**
 * فحص الاتصال بقاعدة بيانات Firebase Realtime Database
 */
export async function testFirebaseRealtimeConnection(config: FirebaseRealtimeConfig): Promise<{
    success: boolean;
    latencyMs?: number;
    error?: string;
    message?: string;
}> {
    const startTime = Date.now();
    try {
        const baseUrl = sanitizeFirebaseUrl(config.databaseUrl);
        if (!baseUrl) {
            return { success: false, error: 'يرجى إدخال رابط قاعدة بيانات Firebase الصحيح (Database URL).' };
        }

        // اختبار قراءة الـ shallow للتحقق من الاتصال والصلاحية
        let testUrl = `${baseUrl}/.info/connected.json`;
        if (config.authToken?.trim()) {
            testUrl += `?auth=${encodeURIComponent(config.authToken.trim())}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - startTime;

        if (response.ok) {
            return {
                success: true,
                latencyMs,
                message: `تم الاتصال بنجاح بسحابة Firebase Realtime (زمن الاستجابة: ${latencyMs}ms)`
            };
        }

        // في حال كانت الصلاحيات تمنع .info، نحاول مسار فحص مخصص
        let probeUrl = `${baseUrl}/_system_health.json`;
        if (config.authToken?.trim()) {
            probeUrl += `?auth=${encodeURIComponent(config.authToken.trim())}`;
        }

        const probeRes = await fetch(probeUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ping: true, timestamp: Date.now() })
        });

        if (probeRes.ok) {
            return {
                success: true,
                latencyMs: Date.now() - startTime,
                message: `تم الاتصال بنجاح وتوثيق الكتابة بسحابة Firebase (زمن الاستجابة: ${Date.now() - startTime}ms)`
            };
        }

        if (response.status === 401 || response.status === 403 || probeRes.status === 401 || probeRes.status === 403) {
            return {
                success: false,
                latencyMs,
                error: 'تم الوصول للسيرفر ولكن تم رفض الإذن (401/403). تأكد من صحة رمز المصادقة (Auth Token / Database Secret) أو قواعد الأمان (Rules).'
            };
        }

        return {
            success: false,
            latencyMs,
            error: `استجاب السيرفر بحالة خطأ HTTP ${response.status}: ${response.statusText}`
        };
    } catch (err: any) {
        const latencyMs = Date.now() - startTime;
        if (err.name === 'AbortError') {
            return { success: false, latencyMs, error: 'انتهت مهلة الاتصال (Timeout) بسيرفر Firebase. تأكد من توفر اتصال بالإنترنت.' };
        }
        return { success: false, latencyMs, error: err.message || 'تعذر الاتصال بقاعدة بيانات Firebase.' };
    }
}

/**
 * حفظ أو تحديث سجل محدد في مسار معين على Firebase (Upsert)
 */
export async function putFirebaseRecord(
    config: FirebaseRealtimeConfig,
    collectionPath: string,
    recordId: string,
    data: any
): Promise<boolean> {
    try {
        const baseUrl = sanitizeFirebaseUrl(config.databaseUrl);
        if (!baseUrl) return false;

        let url = `${baseUrl}/${collectionPath}/${encodeURIComponent(recordId)}.json`;
        if (config.authToken?.trim()) {
            url += `?auth=${encodeURIComponent(config.authToken.trim())}`;
        }

        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        return res.ok;
    } catch {
        return false;
    }
}

/**
 * تحديث مجموعة سجلات دفعة واحدة في Firebase
 */
export async function patchFirebaseMultiRecords(
    config: FirebaseRealtimeConfig,
    collectionPath: string,
    recordsMap: Record<string, any>
): Promise<boolean> {
    try {
        const baseUrl = sanitizeFirebaseUrl(config.databaseUrl);
        if (!baseUrl) return false;

        let url = `${baseUrl}/${collectionPath}.json`;
        if (config.authToken?.trim()) {
            url += `?auth=${encodeURIComponent(config.authToken.trim())}`;
        }

        const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recordsMap)
        });

        return res.ok;
    } catch {
        return false;
    }
}

/**
 * جلب جميع السجلات من مسار معين
 */
export async function getFirebaseRecords<T = any>(
    config: FirebaseRealtimeConfig,
    collectionPath: string
): Promise<Record<string, T> | null> {
    try {
        const baseUrl = sanitizeFirebaseUrl(config.databaseUrl);
        if (!baseUrl) return null;

        let url = `${baseUrl}/${collectionPath}.json`;
        if (config.authToken?.trim()) {
            url += `?auth=${encodeURIComponent(config.authToken.trim())}`;
        }

        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * جلب سجل واحد بمفتاحه
 */
export async function getFirebaseRecord<T = any>(
    config: FirebaseRealtimeConfig,
    collectionPath: string,
    recordId: string
): Promise<T | null> {
    try {
        const baseUrl = sanitizeFirebaseUrl(config.databaseUrl);
        if (!baseUrl) return null;

        let url = `${baseUrl}/${collectionPath}/${encodeURIComponent(recordId)}.json`;
        if (config.authToken?.trim()) {
            url += `?auth=${encodeURIComponent(config.authToken.trim())}`;
        }

        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * حذف سجل من Firebase
 */
export async function deleteFirebaseRecord(
    config: FirebaseRealtimeConfig,
    collectionPath: string,
    recordId: string
): Promise<boolean> {
    try {
        const baseUrl = sanitizeFirebaseUrl(config.databaseUrl);
        if (!baseUrl) return false;

        let url = `${baseUrl}/${collectionPath}/${encodeURIComponent(recordId)}.json`;
        if (config.authToken?.trim()) {
            url += `?auth=${encodeURIComponent(config.authToken.trim())}`;
        }

        const res = await fetch(url, {
            method: 'DELETE'
        });

        return res.ok;
    } catch {
        return false;
    }
}
