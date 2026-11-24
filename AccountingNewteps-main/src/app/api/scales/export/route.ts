import { NextResponse } from 'next/server';
import { generateScaleExportPayload, ScaleItem, ScaleModel } from '@/lib/scale-export';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const rawModel = body.scaleModel || body.model || 'universal_excel';
        const items = body.items || [];
        const barcodePrefix = body.barcodePrefix || body.options?.barcodePrefix || '21';
        const shelfLifeDays = Number(body.shelfLifeDays || body.options?.defaultShelfLifeDays || 15);

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({
                success: false,
                message: 'لم يتم تحديد أي أصناف للتصدير. تأكد من وجود أصناف في القائمة.'
            }, { status: 400 });
        }

        // Mapping model aliases
        let model: ScaleModel = 'universal_excel';
        const m = String(rawModel).toLowerCase();
        if (m.includes('toledo') || m.includes('mettler')) {
            model = 'mettler_toledo';
        } else if (m.includes('cas') || m.includes('cl5000') || m.includes('clworks')) {
            model = 'cas_cl5000';
        } else if (m.includes('rongta') || m.includes('rls')) {
            model = 'rongta_rls1000';
        } else if (m.includes('dibal')) {
            model = 'dibal';
        } else if (m.includes('csv')) {
            model = 'universal_csv';
        } else {
            model = 'universal_excel';
        }

        const payload = generateScaleExportPayload({
            model,
            items: items as ScaleItem[],
            barcodePrefix,
            shelfLifeDays,
        });

        const bodyData = typeof payload.content === 'string'
            ? payload.content
            : Buffer.from(payload.content);

        return new NextResponse(bodyData as any, {
            status: 200,
            headers: {
                'Content-Type': payload.mimeType,
                'Content-Disposition': `attachment; filename="${payload.filename}"`,
                'Access-Control-Expose-Headers': 'Content-Disposition'
            }
        });
    } catch (err: any) {
        console.error('Scale export error:', err);
        return NextResponse.json({
            success: false,
            message: `حدث خطأ أثناء تصدير ملف الميزان: ${err.message}`
        }, { status: 500 });
    }
}
