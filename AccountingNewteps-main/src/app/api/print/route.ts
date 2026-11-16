import { NextRequest, NextResponse } from 'next/server';
import * as pdfToPrinter from 'pdf-to-printer';
import PDFDocument from 'pdfkit';
import os from 'os';
import fs from 'fs';
import path from 'path';
import ArabicReshaper from 'arabic-reshaper';
import { logSystemError } from '@/lib/error-logger';

function processText(text: string): string {
  try {
    if (!text) return '';
    
    // Split text into segments of Arabic and non-Arabic
    const arabicRegex = /([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)/g;
    
    if (!arabicRegex.test(text)) return text;

    const parts = text.split(arabicRegex);
    const processedParts = parts.map(part => {
      if (arabicRegex.test(part)) {
        const reshaped = ArabicReshaper.convertArabic(part);
        return reshaped.split('').reverse().join('');
      }
      return part;
    });

    return processedParts.reverse().join('');
  } catch (e) {
    return text;
  }
}

export async function POST(req: NextRequest) {
  let filePath = '';
  let printerName = '';
  let title = 'POS Receipt';
  let lines: Array<{ left?: string; right?: string }> = [];

  try {
    const body = await req.json();
    printerName = (body?.printer || '').trim();
    title = body?.content?.title || 'POS Receipt';
    lines = body?.content?.lines || [];
    const footer: string = body?.content?.footer || '';

    if (!printerName) {
      return NextResponse.json({ ok: false, error: 'اسم الطابعة مطلوب' }, { status: 400 });
    }

    const tmpDir = os.tmpdir();
    filePath = path.join(tmpDir, `pos-print-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.pdf`);

    // Use a system font (Arial) to support Arabic
    let fontPath = 'Helvetica';
    if (os.platform() === 'win32') {
      const winFontPath = 'C:\\Windows\\Fonts\\arial.ttf';
      if (fs.existsSync(winFontPath)) {
        fontPath = winFontPath;
      }
    }

    const width = body?.options?.width || '80mm';
    let pageWidth = 227; // 80mm default
    if (typeof width === 'number') {
        pageWidth = width;
    } else if (typeof width === 'string' && width.endsWith('mm')) {
        pageWidth = parseFloat(width) * 2.835;
    } else if (width === 'A4') {
        pageWidth = 595.28;
    }

    const doc = new PDFDocument({ 
      size: [pageWidth, 1000],
      margin: 10,
      font: fontPath
    });
    
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const titleSize = pageWidth > 300 ? 18 : 10; 
    const textSize = pageWidth > 300 ? 12 : 9;

    doc.fontSize(titleSize).text(processText(title), { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(textSize);

    for (const ln of lines) {
      const leftRaw = ln.left || '';
      const rightRaw = ln.right || '';
      
      const leftText = processText(leftRaw);
      const rightText = processText(rightRaw);
      
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);
      const startY = doc.y;

      if (!rightRaw && leftRaw) {
        doc.text(leftText, margin, startY, { width: contentWidth, align: 'left' });
      } else if (!leftRaw && rightRaw) {
        doc.text(rightText, margin, startY, { width: contentWidth, align: 'right' });
      } else {
        const col1Width = contentWidth * 0.65;
        const col2Width = contentWidth * 0.35;

        doc.text(leftText, margin, startY, { width: col1Width, align: 'left' });
        const yAfterLeft = doc.y;

        doc.text(rightText, margin + col1Width, startY, { width: col2Width, align: 'right' });
        const yAfterRight = doc.y;

        doc.y = Math.max(yAfterLeft, yAfterRight);
      }
    }

    if (footer) {
      doc.moveDown();
      doc.text(processText(footer), { align: 'center' });
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', (err) => reject(err));
    });

    // Detect virtual PDF / XPS printers
    const lowerPrinter = printerName.toLowerCase();
    const isVirtualPrinter = lowerPrinter.includes('print to pdf') || lowerPrinter.includes('xps') || lowerPrinter.includes('onenote');

    if (isVirtualPrinter) {
      // In automated background printing, virtual PDF printers cannot prompt for file path.
      // We simulate successful print without hanging or erroring out.
      return NextResponse.json({ 
        ok: true, 
        simulated: true, 
        printer: printerName,
        message: 'تم تجهيز الإيصال بنجاح (محاكاة طابعة افتراضية).'
      });
    }

    const printFunction = (pdfToPrinter as any)?.print || (pdfToPrinter as any)?.default?.print || (pdfToPrinter as any)?.default;
    if (typeof printFunction !== 'function') {
      throw new Error("دالة الطباعة غير مهيأة (pdf-to-printer function is unavailable).");
    }

    const sumatraPath = path.join(process.cwd(), 'public', 'SumatraPDF-3.4.6-32.exe');
    const printOptions: any = { printer: printerName };
    if (fs.existsSync(sumatraPath)) {
      printOptions.sumatraPdfPath = sumatraPath;
    }

    await printFunction(filePath, printOptions);

    return NextResponse.json({ ok: true, printer: printerName });
  } catch (e: any) {
    const errorMessage = e?.message || 'فشل إرسال أمر الطباعة';
    console.error('Print route error:', errorMessage);
    
    await logSystemError({
      source: 'Server:api/print',
      action: 'print_receipt',
      errorMessage,
      errorStack: e?.stack || null,
      requestPayload: { printer: printerName, title, linesCount: lines.length }
    }).catch(() => {});

    return NextResponse.json({ 
      ok: false, 
      error: errorMessage, 
      printer: printerName 
    }, { status: 200 });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {});
    }
  }
}
