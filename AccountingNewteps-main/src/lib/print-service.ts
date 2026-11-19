/**
 * @fileOverview خدمة موحدة للتعامل مع عمليات الطباعة عبر النظام أو طابعات الشبكة (IP / TCP 9100)
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
     * إرسال أمر طباعة مباشر إلى طابعة النظام أو طابعة شبكة IP (Port 9100)
     */
    async sendToPrinter(printerName: string, content: PrintContent, options: PrintOptions = { width: '80mm' }) {
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
