
/**
 * @fileOverview خدمة موحدة للتعامل مع عمليات الطباعة عبر الشبكة باستخدام fetch
 */

export interface PrintContent {
    title: string;
    lines: Array<{ left?: string; right?: string }>;
    footer?: string;
}

export interface PrintOptions {
    width?: string | number;
}

export const printService = {
    /**
     * جلب قائمة الطابعات المثبتة على النظام
     */
    async getSystemPrinters() {
        try {
            const response = await fetch('/api/system-printers');
            if (!response.ok) throw new Error('Failed to fetch printers');
            const data = await response.json();
            return data.printers || [];
        } catch (error) {
            console.error('Error in getSystemPrinters:', error);
            return [];
        }
    },

    /**
     * إرسال أمر طباعة مباشر إلى طابعة محددة
     */
    async sendToPrinter(printerName: string, content: PrintContent, options: PrintOptions = { width: '80mm' }) {
        try {
            const response = await fetch('/api/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    printer: printerName,
                    options,
                    content
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to print');
            }

            return { success: true };
        } catch (error: any) {
            console.error('Error in sendToPrinter:', error);
            throw error;
        }
    }
};
