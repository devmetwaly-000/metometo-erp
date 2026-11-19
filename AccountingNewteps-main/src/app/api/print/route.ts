import { NextRequest, NextResponse } from 'next/server';
import * as pdfToPrinter from 'pdf-to-printer';
import PDFDocument from 'pdfkit';
import os from 'os';
import fs from 'fs';
import path from 'path';
import net from 'net';
import ArabicReshaper from 'arabic-reshaper';
import { logSystemError } from '@/lib/error-logger';

function processText(text: string): string {
  try {
    if (!text) return '';

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
  } catch {
    return text;
  }
}

/**
 * خريطة تحويل الحروف العربية إلى ترميز Windows-1256 لطابعات الإيصالات الحرارية (ESC/POS)
 */
const WIN1256_MAP: Record<number, number> = {
  0x060C: 0xA1, 0x061B: 0xBA, 0x061F: 0xBF, 0x0621: 0xC1, 0x0622: 0xC2,
  0x0623: 0xC3, 0x0624: 0xC4, 0x0625: 0xC5, 0x0626: 0xC6, 0x0627: 0xC7,
  0x0628: 0xC8, 0x0629: 0xC9, 0x062A: 0xCA, 0x062B: 0xCB, 0x062C: 0xCC,
  0x062D: 0xCD, 0x062E: 0xCE, 0x062F: 0xCF, 0x0630: 0xD0, 0x0631: 0xD1,
  0x0632: 0xD2, 0x0633: 0xD3, 0x0634: 0xD4, 0x0635: 0xD5, 0x0636: 0xD6,
  0x0637: 0xD8, 0x0638: 0xD9, 0x0639: 0xDA, 0x063A: 0xDB, 0x0640: 0xDC,
  0x0641: 0xDD, 0x0642: 0xDE, 0x0643: 0xDF, 0x0644: 0xE1, 0x0645: 0xE3,
  0x0646: 0xE4, 0x0647: 0xE5, 0x0648: 0xE6, 0x0649: 0xEC, 0x064A: 0xED,
  0x064B: 0xF0, 0x064C: 0xF1, 0x064D: 0xF2, 0x064E: 0xF3, 0x064F: 0xF5,
  0x0650: 0xF6, 0x0651: 0xF8, 0x0652: 0xFA,
  0x0660: 0x30, 0x0661: 0x31, 0x0662: 0x32, 0x0663: 0x33, 0x0664: 0x34,
  0x0665: 0x35, 0x0666: 0x36, 0x0667: 0x37, 0x0668: 0x38, 0x0669: 0x39,
};

function encodeWindows1256(str: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (WIN1256_MAP[code] !== undefined) {
      bytes.push(WIN1256_MAP[code]);
    } else {
      bytes.push(0x3F); // '?' fallback for unsupported glyphs
    }
  }
  return Buffer.from(bytes);
}

function reverseArabicVisualOrder(text: string): string {
  const arabicRegex = /([\u0600-\u06FF]+)/g;
  if (!arabicRegex.test(text)) return text;
  const parts = text.split(arabicRegex);
  return parts
    .map((p) => (arabicRegex.test(p) ? p.split('').reverse().join('') : p))
    .reverse()
    .join('');
}

function buildEscPosReceiptBuffer(
  title: string,
  lines: Array<{ left?: string; right?: string }>,
  footer: string,
  widthOption?: string | number
): Buffer {
  const chunks: Buffer[] = [];
  const lineChars = String(widthOption) === '58mm' ? 32 : 42;

  // Initialize printer + select Windows-1256 Arabic codepage (ESC t 22)
  chunks.push(Buffer.from([0x1B, 0x40]));
  chunks.push(Buffer.from([0x1B, 0x74, 0x16]));

  // Title: Center + Bold + Double height
  chunks.push(Buffer.from([0x1B, 0x61, 0x01])); // Center
  chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold ON
  chunks.push(Buffer.from([0x1D, 0x21, 0x01])); // Double height
  chunks.push(encodeWindows1256(reverseArabicVisualOrder(title || 'POS Receipt') + '\n'));
  chunks.push(Buffer.from([0x1D, 0x21, 0x00])); // Normal size
  chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold OFF
  chunks.push(encodeWindows1256('-'.repeat(lineChars) + '\n'));

  // Body lines: Left aligned
  chunks.push(Buffer.from([0x1B, 0x61, 0x00])); // Left
  for (const ln of lines) {
    const leftRaw = reverseArabicVisualOrder((ln.left || '').trim());
    const rightRaw = reverseArabicVisualOrder((ln.right || '').trim());

    if (leftRaw && rightRaw) {
      const spaceCount = Math.max(1, lineChars - leftRaw.length - rightRaw.length);
      const formatted =
        leftRaw.length + rightRaw.length + 1 <= lineChars
          ? `${leftRaw}${' '.repeat(spaceCount)}${rightRaw}`
          : `${leftRaw}\n${' '.repeat(Math.max(0, lineChars - rightRaw.length))}${rightRaw}`;
      chunks.push(encodeWindows1256(formatted + '\n'));
    } else if (leftRaw) {
      chunks.push(encodeWindows1256(leftRaw + '\n'));
    } else if (rightRaw) {
      const pad = Math.max(0, lineChars - rightRaw.length);
      chunks.push(encodeWindows1256(' '.repeat(pad) + rightRaw + '\n'));
    }
  }

  // Footer
  if (footer) {
    chunks.push(encodeWindows1256('-'.repeat(lineChars) + '\n'));
    chunks.push(Buffer.from([0x1B, 0x61, 0x01])); // Center
    chunks.push(encodeWindows1256(reverseArabicVisualOrder(footer) + '\n'));
  }

  // Feed 4 lines & partial cut (GS V 66 0)
  chunks.push(Buffer.from([0x1B, 0x64, 0x04]));
  chunks.push(Buffer.from([0x1D, 0x56, 0x42, 0x00]));

  return Buffer.concat(chunks);
}

function sendRawTcpToIpPrinter(host: string, port: number, payload: Buffer, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finishSuccess = () => {
      if (!settled) {
        settled = true;
        try { socket.destroy(); } catch {}
        resolve();
      }
    };

    const cleanup = () => {
      try { socket.destroy(); } catch {}
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.write(payload, (writeErr) => {
        if (writeErr) {
          if (!settled) {
            settled = true;
            cleanup();
            reject(writeErr);
          }
          return;
        }
        // بعض الطابعات الحرارية لا ترد بحزمة FIN بسرعة بعد استلام البيانات، لذا ننهي الاتصال ونؤكد النجاح بعد تفريغ الـ Buffer
        try { socket.end(); } catch {}
        setTimeout(finishSuccess, 200);
      });
    });

    socket.on('close', () => {
      // Only resolve on close if connect/write already started; otherwise error handler rejects first
    });

    socket.on('timeout', () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error(`انتهت مهلة الاتصال بطابعة الشبكة (${host}:${port}). تأكد أن الطابعة تعمل ومتصلة بنفس الشبكة وأن المنفذ 9100 مفتوح.`));
      }
    });

    socket.on('error', (err: any) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error(`تعذر الاتصال بطابعة الشبكة (${host}:${port}): ${err.message}`));
      }
    });

    socket.connect(port, host);
  });
}

function parseIpAndPort(address: string): { isIp: boolean; host: string; port: number } {
  const clean = address.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const ipMatch = clean.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/);
  if (ipMatch) {
    return {
      isIp: true,
      host: ipMatch[1],
      port: ipMatch[2] ? parseInt(ipMatch[2], 10) : 9100
    };
  }
  return { isIp: false, host: clean, port: 9100 };
}

export async function POST(req: NextRequest) {
  let filePath = '';
  let printerName = '';
  let title = 'POS Receipt';
  let lines: Array<{ left?: string; right?: string }> = [];

  try {
    const body = await req.json();
    printerName = (body?.printer || '').trim();
    const explicitType = body?.printerType || body?.options?.printerType || '';
    title = body?.content?.title || 'POS Receipt';
    lines = body?.content?.lines || [];
    const footer: string = body?.content?.footer || '';

    if (explicitType === 'browser') {
      return NextResponse.json({
        ok: true,
        mode: 'browser',
        message: 'طابعة الويب (المتصفح) نشطة وجاهزة.'
      });
    }

    if (!printerName) {
      return NextResponse.json({ ok: false, error: 'اسم أو عنوان الطابعة مطلوب' }, { status: 400 });
    }

    // 1. Direct Raw TCP ESC/POS Network Printer (IP:9100)
    const parsedTarget = parseIpAndPort(printerName);
    if (explicitType === 'ip' || parsedTarget.isIp) {
      let host = parsedTarget.host;
      let port = parsedTarget.port || 9100;
      if (!parsedTarget.isIp && host.includes(':')) {
        const [h, p] = host.split(':');
        host = h.trim();
        port = parseInt(p.trim(), 10) || 9100;
      }

      const escPosBuffer = buildEscPosReceiptBuffer(title, lines, footer, body?.options?.width);
      await sendRawTcpToIpPrinter(host, port, escPosBuffer, 6000);

      return NextResponse.json({
        ok: true,
        mode: 'ip-raw-tcp',
        printer: `${host}:${port}`,
        message: `تم إرسال أمر الطباعة بنجاح إلى طابعة الشبكة (${host}:${port}).`
      });
    }

    // 2. Windows / System Spooler PDF Printing
    const tmpDir = os.tmpdir();
    filePath = path.join(tmpDir, `pos-print-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.pdf`);

    let fontPath = 'Helvetica';
    if (os.platform() === 'win32') {
      const winFontPath = 'C:\\Windows\\Fonts\\arial.ttf';
      if (fs.existsSync(winFontPath)) {
        fontPath = winFontPath;
      }
    }

    const width = body?.options?.width || '80mm';
    let pageWidth = 227;
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

    const lowerPrinter = printerName.toLowerCase();
    const isVirtualPrinter = lowerPrinter.includes('print to pdf') || lowerPrinter.includes('xps') || lowerPrinter.includes('onenote');

    if (isVirtualPrinter) {
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
