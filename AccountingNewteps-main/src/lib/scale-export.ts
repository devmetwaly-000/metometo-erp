/**
 * @fileOverview وحدة توليد ملفات أسعار موازين الباركود الإلكترونية والربط الشبكي
 * يدعم كبرى الماركات العالمية والمحلية في قطاع السوبرماركت والمحامص واللحوم:
 * 1. موازين كاس (CAS CL-5000 / CL-5200 / CL-7000 / LP-1000)
 * 2. موازين رونجتا (Rongta RLS1000 / RLS1100)
 * 3. موازين ديبال (Dibal Wind / Mistral / Series 500)
 * 4. موازين ميتلر توليدو وبيزربا (Mettler Toledo / Bizerba)
 * 5. الملف الموحد العام القياسي (Universal Excel / CSV PLU)
 * 6. الإرسال الشبكي المباشر (TCP Socket / IP Direct Send)
 */

import * as XLSX from 'xlsx';

export type ScaleModel = 'universal_csv' | 'universal_excel' | 'cas_clworks' | 'rongta_rls' | 'dibal_txt' | 'toledo_txt';

export interface ScaleExportItem {
    pluNumber: number;
    code: string;
    name: string;
    secondName?: string;
    price: number;
    unit: string;
    barcodePrefix?: string;
    barcodeType?: string;
    department?: string | number;
    group?: string | number;
    shelfLifeDays?: number;
    tare?: number;
    isWeight?: boolean;
}

export interface ScaleExportOptions {
    model: ScaleModel;
    barcodePrefix?: string;
    defaultShelfLifeDays?: number;
    defaultDepartment?: number;
    onlyWeightItems?: boolean;
}

/**
 * تجهيز وتنسيق قائمة الأصناف المناسبة للميزان
 */
export function prepareScaleItems(
    items: any[],
    options: Partial<ScaleExportOptions> = {}
): ScaleExportItem[] {
    const prefix = options.barcodePrefix || '21';
    const defaultShelfLife = options.defaultShelfLifeDays || 7;
    const defaultDept = options.defaultDepartment || 1;

    let filtered = items.filter(item => !item.isDisabled);
    if (options.onlyWeightItems !== false) {
        filtered = filtered.filter(item => {
            const unitLower = String(item.baseUnit || item.unit || '').toLowerCase();
            const isWeight =
                item.barcodeType === 'ean13_scale' ||
                unitLower.includes('كجم') ||
                unitLower.includes('كيلو') ||
                unitLower.includes('جرام') ||
                unitLower.includes('kg') ||
                unitLower.includes('gram');
            return isWeight;
        });
    }

    return filtered.map((item, index) => {
        const pluNumber = Number(item.pluNumber) || (index + 1);
        const code5 = String(item.code || pluNumber).padStart(5, '0').slice(-5);
        const name = String(item.name || '').trim();
        const price = Number(item.price || item.sellPrice || 0);
        const unit = item.baseUnit || item.unit || 'كجم';
        const department = Number(item.sectionId || item.categoryId || defaultDept) || defaultDept;

        return {
            pluNumber,
            code: code5,
            name,
            secondName: item.nameEn || '',
            price,
            unit,
            barcodePrefix: prefix,
            department,
            shelfLifeDays: Number(item.shelfLifeDays) || defaultShelfLife,
            tare: Number(item.tare) || 0,
            isWeight: true,
        };
    });
}

/**
 * 1. توليد ملف الموازين الموحد (Universal Excel)
 */
export function generateUniversalExcel(scaleItems: ScaleExportItem[]): Uint8Array {
    const rows = scaleItems.map(item => ({
        'رقم الميزان (PLU)': item.pluNumber,
        'كود الصنف (5 أرقام)': item.code,
        'اسم الصنف': item.name,
        'الاسم اللاتيني': item.secondName || '',
        'سعر الكيلو / الوحدة': item.price,
        'الوحدة': item.unit,
        'بادئة الباركود': item.barcodePrefix || '21',
        'كود الباركود الكامل': `${item.barcodePrefix || '21'}${item.code}000000`.slice(0, 13),
        'القسم / المجموعة': item.department || 1,
        'أيام الصلاحية': item.shelfLifeDays || 7,
        'الوزن الفارغ (Tare)': item.tare || 0
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scale_PLU');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new Uint8Array(buf);
}

/**
 * 2. توليد ملف الموازين الموحد القياسي (Universal CSV)
 */
export function generateUniversalCsv(scaleItems: ScaleExportItem[]): string {
    const header = 'PLU,ItemCode,ItemName,Price,Unit,BarcodePrefix,FullBarcode,Department,ShelfLifeDays,Tare\n';
    const lines = scaleItems.map(item => {
        const cleanName = `"${item.name.replace(/"/g, '""')}"`;
        const fullBarcode = `${item.barcodePrefix || '21'}${item.code}000000`.slice(0, 13);
        return `${item.pluNumber},${item.code},${cleanName},${item.price},${item.unit},${item.barcodePrefix || '21'},${fullBarcode},${item.department || 1},${item.shelfLifeDays || 7},${item.tare || 0}`;
    });
    return '\uFEFF' + header + lines.join('\n');
}

/**
 * 3. توليد ملف برنامج CAS CL-Works لموازين CAS الكورية (CL-5000 / CL-5200 / CL-7000 / LP-1000)
 */
export function generateCasClWorksFile(scaleItems: ScaleExportItem[]): string {
    // تنسيق CAS CL-Works المعتمد عالمياً:
    // PLU_NO,ITEM_CODE,NAME_1,NAME_2,PRICE,UNIT,DEPT_NO,BAR_TYPE,TARE,EXP_DATE
    const header = 'PLU_NO,ITEM_CODE,NAME_1,NAME_2,PRICE,UNIT,DEPT_NO,BAR_TYPE,TARE,EXP_DATE\r\n';
    const lines = scaleItems.map(item => {
        const plu = item.pluNumber;
        const code = item.code;
        const name1 = item.name.replace(/[,;]/g, ' ');
        const name2 = (item.secondName || '').replace(/[,;]/g, ' ');
        const price = Math.round(item.price * 100) / 100;
        const unit = item.unit.includes('جرام') ? 1 : 0; // 0 = kg, 1 = 100g
        const dept = item.department || 1;
        const barType = 0; // Standard EAN-13
        const tare = item.tare || 0;
        const exp = item.shelfLifeDays || 7;
        return `${plu},${code},${name1},${name2},${price},${unit},${dept},${barType},${tare},${exp}`;
    });
    return '\uFEFF' + header + lines.join('\r\n');
}

/**
 * 4. توليد ملف موازين رونجتا الصينية (Rongta RLS1000 / RLS1100)
 */
export function generateRongtaFile(scaleItems: ScaleExportItem[]): string {
    // تنسيق Rongta PLU Manager المعتمد:
    // Name,LFCode,Code,UnitPrice,Unit,Dept,WeightUnit,PackageType,BarcodeType
    const header = 'Name,LFCode,Code,UnitPrice,Unit,Dept,WeightUnit,PackageType,BarcodeType\r\n';
    const lines = scaleItems.map(item => {
        const name = `"${item.name.replace(/"/g, '""')}"`;
        const plu = item.pluNumber;
        const code = item.code;
        const price = Math.round(item.price * 100); // Rongta stores price in cents/halalas or decimal
        return `${name},${plu},${code},${item.price},1,${item.department || 1},1,0,7`;
    });
    return '\uFEFF' + header + lines.join('\r\n');
}

/**
 * 5. توليد ملف موازين ديبال الإسبانية (Dibal Wind / Mistral TXT)
 */
export function generateDibalFile(scaleItems: ScaleExportItem[]): string {
    // تنسيق Dibal D-Connect:
    // PLU;ArticleCode;Name;Price;DirectKey;Dept;Sec
    const lines = scaleItems.map(item => {
        const plu = item.pluNumber;
        const code = item.code;
        const name = item.name.replace(/;/g, ' ');
        const price = Math.round(item.price * 100); // centimes / cents
        const dept = item.department || 1;
        return `${plu};${code};${name};${price};${plu};${dept};0`;
    });
    return lines.join('\r\n');
}

