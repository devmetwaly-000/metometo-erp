import { NextRequest, NextResponse } from 'next/server';
import Printer from 'pdf-to-printer';
import PDFDocument from 'pdfkit';
import os from 'os';
import fs from 'fs';
import path from 'path';
import ArabicReshaper from 'arabic-reshaper';

function processText(text: string): string {
  try {
    if (!text) return '';
    
    // Split text into segments of Arabic and non-Arabic
    // Arabic range: \u0600-\u06FF, \u0750-\u077F, \u08A0-\u08FF, \uFB50-\uFDFF, \uFE70-\uFEFF
    const arabicRegex = /([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)/g;
    
    // Check if there is any Arabic text
    if (!arabicRegex.test(text)) return text;

    const parts = text.split(arabicRegex);
    const processedParts = parts.map(part => {
      if (arabicRegex.test(part)) {
        // Reshape Arabic part
        const reshaped = ArabicReshaper.convertArabic(part);
        // Reverse for PDFKit LTR rendering
        return reshaped.split('').reverse().join('');
      }
      return part;
    });

    // Reverse the order of parts to handle mixed content RTL flow
    return processedParts.reverse().join('');
  } catch (e) {
    return text;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const printerName: string | undefined = body?.printer;
    const title: string = body?.content?.title || 'POS Receipt';
    const lines: Array<{ left?: string; right?: string }> = body?.content?.lines || [];
    const footer: string = body?.content?.footer || '';

    if (!printerName) {
      return NextResponse.json({ error: 'Printer name is required' }, { status: 400 });
    }

    const cleanPrinterName = printerName.trim();

    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `pos-print-${Date.now()}.pdf`);

    // Use a system font (Arial) to support Arabic
    let fontPath = 'Helvetica';
    if (os.platform() === 'win32') {
      const winFontPath = 'C:\\Windows\\Fonts\\arial.ttf';
      if (fs.existsSync(winFontPath)) {
        fontPath = winFontPath;
      }
    }

    const width = body?.options?.width || '80mm';
    
    // Convert width to points (1mm = 2.835pt)
    let pageWidth = 227; // 80mm default
    if (typeof width === 'number') {
        pageWidth = width;
    } else if (typeof width === 'string' && width.endsWith('mm')) {
        pageWidth = parseFloat(width) * 2.835;
    } else if (width === 'A4') {
        pageWidth = 595.28;
    }

    const doc = new PDFDocument({ 
      size: [pageWidth, 1000], // Long strip
      margin: 10,
      font: fontPath
    });
    
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Adjust font sizes for receipt
    const titleSize = pageWidth > 300 ? 18 : 10; 
    const textSize = pageWidth > 300 ? 12 : 9; // Standard thermal font size

    // Print Title
    doc.fontSize(titleSize).text(processText(title), { align: 'center' });
    doc.moveDown(0.5);
    
    doc.fontSize(textSize);

    // Process Lines
    for (const ln of lines) {
      const leftRaw = ln.left || '';
      const rightRaw = ln.right || '';
      
      const leftText = processText(leftRaw);
      const rightText = processText(rightRaw);
      
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);
      const startY = doc.y;

      // Layout Logic - STRICT LTR COLUMNS
      // Left content always on Left. Right content always on Right.
      // This prevents zig-zag alignment when mixing Arabic/English lines.
      
      // 1. Single Column (only left or only right)
      if (!rightRaw && leftRaw) {
        // Full width Left
        doc.text(leftText, margin, startY, { width: contentWidth, align: 'left' });
      } else if (!leftRaw && rightRaw) {
        // Full width Right
        doc.text(rightText, margin, startY, { width: contentWidth, align: 'right' });
      } else {
        // 2. Two Columns
        // Left Column (65% width) - usually Item Name
        const col1Width = contentWidth * 0.65;
        // Right Column (35% width) - usually Price/Value
        const col2Width = contentWidth * 0.35;

        // Print Left Content (Align Left)
        doc.text(leftText, margin, startY, { width: col1Width, align: 'left' });
        const yAfterLeft = doc.y;

        // Print Right Content (Align Right)
        // X = margin + col1Width
        doc.text(rightText, margin + col1Width, startY, { width: col2Width, align: 'right' });
        const yAfterRight = doc.y;

        // Set Y to max height to prevent overlap with next line
        doc.y = Math.max(yAfterLeft, yAfterRight);
      }
      
      // Add a tiny buffer if needed
      // doc.moveDown(0.1); 
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

    const sumatraPath = path.join(process.cwd(), 'public', 'SumatraPDF-3.4.6-32.exe');
    
    const printOptions: any = { printer: cleanPrinterName };
    if (fs.existsSync(sumatraPath)) {
      printOptions.sumatraPdfPath = sumatraPath;
    }

    await Printer.print(filePath, printOptions);

    fs.unlink(filePath, () => {});

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to print' }, { status: 500 });
  }
}
