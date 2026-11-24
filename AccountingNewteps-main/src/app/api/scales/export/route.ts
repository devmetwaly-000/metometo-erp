import { NextResponse } from 'next/server';
import {
    prepareScaleItems,
    generateUniversalExcel,
    generateUniversalCsv,
    generateCasClWorksFile,
    generateRongtaFile,
    generateDibalFile,
    ScaleModel
} from '@/lib/scale-export';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { items, model = 'universal_excel', options = {} } = body;

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ success: false, error: 'لم يتم تحديد أي أصناف للتصدير.' }, { status: 400 });
        }

        const scaleItems = prepareScaleItems(items, { ...options, model: model as ScaleModel });
        if (scaleItems.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'لم يتم العثور على أصناف وزنية صالحة للتصدير. تأكد من تحديد وحدة الصنف (كجم / جرام) أو نوع الباركود الوزني ean13_scale.'
            }, { status: 400 });
        }

        const timestamp = new Date().toISOString().slice(0, 10);

        if (model === 'universal_excel') {
            const excelBuffer = generateUniversalExcel(scaleItems);
            return new NextResponse(excelBuffer as any, {
                status: 200,
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition': `attachment; filename="scale_plu_export_${timestamp}.xlsx"`
                }
            });
        }

        if (model === 'universal_csv') {
            const csvContent = generateUniversalCsv(scaleItems);
            return new NextResponse(csvContent, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="scale_plu_universal_${timestamp}.csv"`
                }
            });
        }

        if (model === 'cas_clworks') {
            const casContent = generateCasClWorksFile(scaleItems);
            return new NextResponse(casContent, {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Content-Disposition': `attachment; filename="cas_clworks_plu_${timestamp}.txt"`
                }
            });
        }

        if (model === 'rongta_rls') {
            const rongtaContent = generateRongtaFile(scaleItems);
            return new NextResponse(rongtaContent, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="rongta_rls1000_plu_${timestamp}.csv"`
                }
            });
        }

        if (model === 'dibal_txt') {
            const dibalContent = generateDibalFile(scaleItems);
            return new NextResponse(dibalContent, {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Content-Disposition': `attachment; filename="dibal_articles_${timestamp}.txt"`
                }
            });
        }

        return NextResponse.json({ success: false, error: 'موديل الميزان غير مدعوم.' }, { status: 400 });
    } catch (err: any) {
        console.error('Scale export error:', err);
        return NextResponse.json({ success: false, error: err.message || 'حدث خطأ أثناء تصدير ملف الميزان.' }, { status: 500 });
    }
}

