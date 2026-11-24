import { NextResponse } from 'next/server';
import net from 'net';
import { generateScaleExportPayload, ScaleItem } from '@/lib/scale-export';

export const dynamic = 'force-dynamic';

interface SendToScaleRequest {
    scaleModel: 'universal_csv' | 'universal_excel' | 'cas_cl5000' | 'rongta_rls1000' | 'dibal';
    scaleIp: string;
    scalePort: number;
    items: ScaleItem[];
    barcodePrefix?: string;
    shelfLifeDays?: number;
    timeoutMs?: number;
}

export async function POST(req: Request) {
    try {
        const body: SendToScaleRequest = await req.json();
        const {
            scaleModel = 'cas_cl5000',
            scaleIp,
            scalePort = 4001,
            items = [],
            barcodePrefix = '21',
            shelfLifeDays = 15,
            timeoutMs = 5000,
        } = body;

        if (!scaleIp || !scaleIp.trim()) {
            return NextResponse.json(
                { success: false, message: 'عنوان IP الخاص بالميزان مطلوب' },
                { status: 400 }
            );
        }

        if (!items || items.length === 0) {
            return NextResponse.json(
                { success: false, message: 'لا توجد أصناف محددة للإرسال إلى الميزان' },
                { status: 400 }
            );
        }

        // Generate scale specific data payload
        const exportResult = generateScaleExportPayload({
            model: scaleModel,
            items,
            barcodePrefix,
            shelfLifeDays,
        });

        const startTime = Date.now();

        // Send payload via TCP socket to the scale
        const sendResult = await new Promise<{ success: boolean; bytesSent: number; latencyMs: number; error?: string }>((resolve) => {
            const socket = new net.Socket();
            let hasEnded = false;

            const cleanup = (res: { success: boolean; bytesSent: number; latencyMs: number; error?: string }) => {
                if (hasEnded) return;
                hasEnded = true;
                socket.destroy();
                resolve(res);
            };

            socket.setTimeout(timeoutMs);

            socket.on('connect', () => {
                const dataBuffer = typeof exportResult.content === 'string'
                    ? Buffer.from(exportResult.content, 'utf8')
                    : exportResult.content;

                socket.write(dataBuffer, (err) => {
                    const latency = Date.now() - startTime;
                    if (err) {
                        cleanup({ success: false, bytesSent: 0, latencyMs: latency, error: err.message });
                    } else {
                        // Success writing data
                        setTimeout(() => {
                            cleanup({ success: true, bytesSent: dataBuffer.length, latencyMs: latency });
                        }, 500);
                    }
                });
            });

            socket.on('timeout', () => {
                cleanup({
                    success: false,
                    bytesSent: 0,
                    latencyMs: Date.now() - startTime,
                    error: `انتهت مهلة الاتصال بالميزان (${scaleIp}:${scalePort}) بعد ${timeoutMs} مللي ثانية. يرجى التأكد من تشغيل الميزان وتوصيله بالشبكة.`
                });
            });

            socket.on('error', (err) => {
                cleanup({
                    success: false,
                    bytesSent: 0,
                    latencyMs: Date.now() - startTime,
                    error: `تعذر الاتصال بالميزان: ${err.message}`
                });
            });

            socket.connect(scalePort, scaleIp.trim());
        });

        if (!sendResult.success) {
            return NextResponse.json({
                success: false,
                message: sendResult.error || 'فشل الإرسال إلى الميزان',
                scaleIp,
                scalePort,
                latencyMs: sendResult.latencyMs,
            }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            message: `تم إرسال ${items.length} صنف بنجاح إلى الميزان (${scaleIp}:${scalePort}) [${sendResult.bytesSent} بايت] خلال ${sendResult.latencyMs} مللي ثانية.`,
            scaleIp,
            scalePort,
            itemsCount: items.length,
            bytesSent: sendResult.bytesSent,
            latencyMs: sendResult.latencyMs,
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            message: `حدث خطأ أثناء الإرسال: ${error.message}`
        }, { status: 500 });
    }
}
