import { NextResponse } from 'next/server';
import net from 'net';
import { generateScaleExportPayload, ScaleItem, ScaleModel } from '@/lib/scale-export';

export const dynamic = 'force-dynamic';

export interface RegisteredScale {
    id: string;
    name: string;
    ip: string;
    port: number;
    model: ScaleModel | string;
    departmentId?: string;
    departmentName?: string;
    enabled?: boolean;
    lastSync?: string;
    lastStatus?: 'online' | 'offline' | 'error';
    latencyMs?: number;
}

interface BroadcastRequest {
    action: 'ping' | 'send';
    scales: RegisteredScale[];
    items?: ScaleItem[];
    barcodePrefix?: string;
    shelfLifeDays?: number;
    timeoutMs?: number;
}

/**
 * فحص الاتصال بميزان واحد عبر TCP
 */
async function pingScale(scale: RegisteredScale, timeoutMs = 3000): Promise<{
    id: string;
    name: string;
    ip: string;
    port: number;
    online: boolean;
    latencyMs: number;
    error?: string;
}> {
    const startTime = Date.now();
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let done = false;

        const finish = (online: boolean, error?: string) => {
            if (done) return;
            done = true;
            socket.destroy();
            resolve({
                id: scale.id,
                name: scale.name,
                ip: scale.ip,
                port: scale.port,
                online,
                latencyMs: Date.now() - startTime,
                error
            });
        };

        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
            finish(true);
        });

        socket.on('timeout', () => {
            finish(false, 'انتهت مهلة الاتصال (الميزان لا يستجيب)');
        });

        socket.on('error', (err) => {
            finish(false, err.message);
        });

        try {
            socket.connect(scale.port || 3001, scale.ip.trim());
        } catch (e: any) {
            finish(false, e.message);
        }
    });
}

/**
 * إرسال حمولة الأصناف إلى ميزان واحد عبر TCP
 */
async function sendToSingleScale(
    scale: RegisteredScale,
    items: ScaleItem[],
    barcodePrefix: string,
    shelfLifeDays: number,
    timeoutMs = 6000
): Promise<{
    id: string;
    name: string;
    ip: string;
    port: number;
    success: boolean;
    itemsCount: number;
    bytesSent: number;
    latencyMs: number;
    message: string;
}> {
    const startTime = Date.now();

    // فلترة الأصناف إذا كان الميزان مخصصاً لقسم معين
    const targetItems = (scale.departmentId && scale.departmentId !== 'all')
        ? items.filter((it: any) => it.department === scale.departmentId || String(it.department) === String(scale.departmentId) || it.category === scale.departmentName)
        : items;

    if (targetItems.length === 0) {
        return {
            id: scale.id,
            name: scale.name,
            ip: scale.ip,
            port: scale.port,
            success: true,
            itemsCount: 0,
            bytesSent: 0,
            latencyMs: 1,
            message: 'لا توجد أصناف خاصة بقسم هذا الميزان لتحديثها'
        };
    }

    const payload = generateScaleExportPayload({
        model: scale.model,
        items: targetItems,
        barcodePrefix,
        shelfLifeDays,
    });

    return new Promise((resolve) => {
        const socket = new net.Socket();
        let done = false;

        const finish = (success: boolean, bytesSent: number, message: string) => {
            if (done) return;
            done = true;
            socket.destroy();
            resolve({
                id: scale.id,
                name: scale.name,
                ip: scale.ip,
                port: scale.port,
                success,
                itemsCount: targetItems.length,
                bytesSent,
                latencyMs: Date.now() - startTime,
                message
            });
        };

        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
            const dataBuffer = typeof payload.content === 'string'
                ? Buffer.from(payload.content, 'utf8')
                : payload.content;

            socket.write(dataBuffer, (err) => {
                if (err) {
                    finish(false, 0, `خطأ أثناء كتابة البيانات: ${err.message}`);
                } else {
                    setTimeout(() => {
                        finish(true, dataBuffer.length, `تم إرسال ${targetItems.length} صنف بنجاح`);
                    }, 400);
                }
            });
        });

        socket.on('timeout', () => {
            finish(false, 0, `انتهت مهلة الاتصال (${timeoutMs}ms)`);
        });

        socket.on('error', (err) => {
            finish(false, 0, `فشل الاتصال: ${err.message}`);
        });

        try {
            socket.connect(scale.port || 3001, scale.ip.trim());
        } catch (e: any) {
            finish(false, 0, `خطأ في العنوان: ${e.message}`);
        }
    });
}

export async function POST(req: Request) {
    try {
        const body: BroadcastRequest = await req.json();
        const {
            action = 'send',
            scales = [],
            items = [],
            barcodePrefix = '21',
            shelfLifeDays = 15,
            timeoutMs = 5000
        } = body;

        const activeScales = scales.filter(s => s.enabled !== false && s.ip && s.ip.trim());

        if (activeScales.length === 0) {
            return NextResponse.json({
                success: false,
                message: 'لم يتم العثور على موازين مفعلة بإعدادات IP صحيحة'
            }, { status: 400 });
        }

        // 1. فحص الاتصال الجماعي لجميع الموازين
        if (action === 'ping') {
            const results = await Promise.all(
                activeScales.map(scale => pingScale(scale, timeoutMs || 3000))
            );

            const onlineCount = results.filter(r => r.online).length;
            const offlineCount = results.length - onlineCount;

            return NextResponse.json({
                success: true,
                action: 'ping',
                totalScales: results.length,
                onlineCount,
                offlineCount,
                results
            });
        }

        // 2. إرسال وتحديث الأسعار جماعياً لجميع الموازين بالتوازي
        if (action === 'send') {
            if (!items || items.length === 0) {
                return NextResponse.json({
                    success: false,
                    message: 'لا توجد أصناف للإرسال إلى الموازين'
                }, { status: 400 });
            }

            const results = await Promise.all(
                activeScales.map(scale => sendToSingleScale(scale, items, barcodePrefix, shelfLifeDays, timeoutMs))
            );

            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;

            return NextResponse.json({
                success: true,
                action: 'send',
                totalScales: results.length,
                successCount,
                failCount,
                results,
                message: `اكتمل الإرسال الجماعي: نجح ${successCount} ميزان من أصل ${results.length} ميزان.`
            });
        }

        return NextResponse.json({ success: false, message: 'إجراء غير معروف' }, { status: 400 });
    } catch (error: any) {
        console.error('Scale broadcast error:', error);
        return NextResponse.json({
            success: false,
            message: `حدث خطأ أثناء معالجة البث الجماعي: ${error.message}`
        }, { status: 500 });
    }
}
