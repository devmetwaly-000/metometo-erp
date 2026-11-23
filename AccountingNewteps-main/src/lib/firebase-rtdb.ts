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

/**
 * جلب شجرة البيانات الكاملة أو كافة الجداول من Firebase Realtime Database
 */
export async function fetchAllFirebaseData(config: FirebaseRealtimeConfig): Promise<Record<string, any> | null> {
    try {
        const baseUrl = sanitizeFirebaseUrl(config.databaseUrl);
        if (!baseUrl) return null;

        let url = `${baseUrl}.json`;
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
 * دالة ذكية لتطبيع وتحويل أي ملف أو كائن قادم من Firebase إلى مصفوفات جداول SQL (Normalize)
 */
export function normalizeFirebaseDataToTables(raw: any): Record<string, any[]> {
    if (!raw || typeof raw !== 'object') return {};

    const result: Record<string, any[]> = {};

    // 1. إذا كان يحتوي على غلاف tables أو كان الكائن مباشرة
    const root = raw.tables && typeof raw.tables === 'object' ? raw.tables : raw;

    for (const [key, val] of Object.entries(root)) {
        if (!val || typeof val !== 'object') continue;

        // استبعاد مفاتيح البيانات الوصفية
        if (['metadata', 'sync_metadata', 'version', '_info', '.info'].includes(key)) continue;

        // تنظيف اسم الجدول (dbo_Items -> Items, dbo.Items -> Items)
        let tableName = key;
        if (tableName.startsWith('dbo_')) tableName = tableName.substring(4);
        if (tableName.startsWith('dbo.')) tableName = tableName.substring(4);

        if (Array.isArray(val)) {
            result[tableName] = val;
        } else if (typeof val === 'object') {
            // في فايربيز تُخزن المجموعات على شكل { id1: record1, id2: record2 }
            const rows = Object.values(val).filter(r => r && typeof r === 'object');
            result[tableName] = rows;
        }
    }

    // 2. فحص ما إذا كانت البيانات منظمة وفق هيكل الفروع: branches[branchCode][collection]
    if (raw.branches && typeof raw.branches === 'object') {
        for (const branchObj of Object.values(raw.branches) as any[]) {
            if (!branchObj || typeof branchObj !== 'object') continue;
            for (const [colName, colVal] of Object.entries(branchObj)) {
                if (!colVal || typeof colVal !== 'object') continue;
                const rows = Array.isArray(colVal) ? colVal : Object.values(colVal).filter(r => r && typeof r === 'object');
                let mappedName = colName;
                if (colName === 'sales_invoices') mappedName = 'SalesInvoices';
                else if (colName === 'held_invoices') mappedName = 'HeldInvoices';
                else if (colName === 'pos_sessions') mappedName = 'PosSessions';
                else if (colName === 'feed') mappedName = 'SalesInvoiceItems';

                if (!result[mappedName]) result[mappedName] = [];
                result[mappedName].push(...(rows as any[]));
            }
        }
    }

    return result;
}

/**
 * تحويل وتجهيز شجرة جداول SQL لتتوافق 100% مع استيراد Firebase Console Realtime Database
 */
export function formatTablesForFirebase(tablesData: Record<string, any[]>): Record<string, any> {
    const firebaseTree: Record<string, any> = {};
    for (const [tableName, rows] of Object.entries(tablesData)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const collectionObj: Record<string, any> = {};
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const idVal = row.InvoiceId || row.InvoiceID || row.ItemId || row.ItemID || 
                          row.CustomerId || row.CustomerID || row.SupplierId || row.SupplierID || 
                          row.Id || row.ID || row.SettingKey || row.Code || `rec_${i + 1}`;
            const cleanKey = String(idVal).replace(/[\.\$#\[\]\/]/g, '_');
            collectionObj[cleanKey] = row;
        }
        firebaseTree[tableName] = collectionObj;
    }
    return firebaseTree;
}

/**
 * رفع وحفظ شجرة جداول كاملة دفعة واحدة في Firebase Realtime Database
 */
export async function pushAllTablesToFirebase(
    config: FirebaseRealtimeConfig,
    tablesData: Record<string, any[]>
): Promise<{ success: boolean; error?: string; tablesCount?: number; totalRecords?: number }> {
    try {
        const baseUrl = sanitizeFirebaseUrl(config.databaseUrl);
        if (!baseUrl) return { success: false, error: 'رابط Firebase غير صالح' };

        const formatted = formatTablesForFirebase(tablesData);
        const tableNames = Object.keys(formatted);
        let totalRecords = 0;

        let url = `${baseUrl}/tables.json`;
        if (config.authToken?.trim()) {
            url += `?auth=${encodeURIComponent(config.authToken.trim())}`;
        }

        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formatted)
        });

        if (!res.ok) {
            return { success: false, error: `استجاب Firebase بخطأ HTTP ${res.status}: ${res.statusText}` };
        }

        for (const rows of Object.values(tablesData)) {
            totalRecords += (rows || []).length;
        }

        return {
            success: true,
            tablesCount: tableNames.length,
            totalRecords
        };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
