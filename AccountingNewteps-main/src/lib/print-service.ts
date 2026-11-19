/**
 * @fileOverview خدمة موحدة للتعامل مع عمليات الطباعة عبر النظام، طابعات الشبكة (IP / TCP 9100)، وطابعة الويب للمتصفح (Web Printer)
 */

export interface PrintContent {
    title: string;
    lines: Array<{ left?: string; right?: string }>;
    footer?: string;
}

export interface PrintOptions {
    width?: string | number;
    printerType?: 'system' | 'ip' | 'browser' | 'bluetooth';
}

export const printService = {
    /**
     * جلب قائمة الطابعات المثبتة على النظام
     */
    async getSystemPrinters() {
        try {
            const response = await fetch('/api/system-printers', { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to fetch printers');
            const data = await response.json();
            return data.printers || [];
        } catch (error) {
            console.error('Error in getSystemPrinters:', error);
            return [];
        }
    },

    /**
     * تشغيل طابعة الويب التلقائية للمتصفح (Web Printer) باستخدام نافذة أو iframe طباعة فوري ونظيف
     */
    printViaWebBrowser(content: PrintContent, width: string | number = '80mm') {
        if (typeof window === 'undefined') return;

        const widthStr = String(width);
        const pageSize = widthStr === '58mm' ? '58mm auto' : widthStr === 'A4' ? 'A4 portrait' : '80mm auto';
        const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${content.title || 'إيصال طباعة'}</title>
  <style>
    @page {
      size: ${pageSize};
      margin: 0mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 5mm 4mm;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", Tahoma, sans-serif;
      font-size: 12px;
      color: #000;
      background: #fff;
      direction: rtl;
      width: 100%;
    }
    .header {
      text-align: center;
      margin-bottom: 6px;
    }
    .title {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .line {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      line-height: 1.35;
    }
    .line.left-only {
      justify-content: flex-start;
    }
    .line.right-only {
      justify-content: flex-end;
    }
    .footer {
      text-align: center;
      margin-top: 8px;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">${content.title || 'إيصال طباعة'}</div>
  </div>
  <div class="divider"></div>
  <div class="content">
    ${(content.lines || []).map(ln => {
      const left = ln.left || '';
      const right = ln.right || '';
      if (left && right) {
        return `<div class="line"><span>${left}</span><span>${right}</span></div>`;
      } else if (left) {
        return `<div class="line left-only"><span>${left}</span></div>`;
      } else if (right) {
        return `<div class="line right-only"><span>${right}</span></div>`;
      }
      return '';
    }).join('')}
  </div>
  ${content.footer ? `
    <div class="divider"></div>
    <div class="footer">${content.footer}</div>
  ` : ''}
</body>
</html>
        `;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.setAttribute('title', 'Web Print Frame');
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(html);
            doc.close();
            setTimeout(() => {
                try {
                    iframe.contentWindow?.focus();
                    iframe.contentWindow?.print();
                } finally {
                    setTimeout(() => {
                        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                    }, 2000);
                }
            }, 300);
        } else {
            const printWin = window.open('', '_blank');
            if (printWin) {
                printWin.document.write(html);
                printWin.document.close();
                setTimeout(() => {
                    printWin.focus();
                    printWin.print();
                    printWin.close();
                }, 300);
            }
        }
    },

    /**
     * إرسال أمر طباعة مباشر إلى طابعة النظام، طابعة شبكة IP (Port 9100)، أو طابعة الويب (Browser)
     */
    async sendToPrinter(printerName: string, content: PrintContent, options: PrintOptions = { width: '80mm' }) {
        if (options.printerType === 'browser') {
            this.printViaWebBrowser(content, options.width || '80mm');
            return { success: true, mode: 'web-browser' };
        }

        try {
            const response = await fetch('/api/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    printer: printerName,
                    printerType: options.printerType,
                    options,
                    content
                })
            });

            const data = await response.json().catch(() => null);
            if (!response.ok || (data && data.ok === false)) {
                throw new Error(data?.error || 'فشل إرسال أمر الطباعة');
            }

            return { success: true, data };
        } catch (error: any) {
            console.error('Error in sendToPrinter:', error);
            throw error;
        }
    }
};
