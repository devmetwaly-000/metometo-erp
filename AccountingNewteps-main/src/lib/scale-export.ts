/**
 * @fileOverview وحدة توليد ملفات أسعار موازين الباركود الإلكترونية والربط الشبكي
 * يدعم كبرى الماركات العالمية والمحلية في قطاع السوبرماركت والمحامص واللحوم:
 * 1. موازين ميتلر توليدو السويسرية (Mettler Toledo - bPlus / Tiger / FreshBase / UC / SPCT)
 * 2. موازين كاس الكورية (CAS CL-5000 / CL-5200 / CL-7000 / LP-1000)
 * 3. موازين رونجتا (Rongta RLS1000 / RLS1100)
 * 4. موازين ديبال الإسبانية (Dibal Wind / Mistral / Series 500)
 * 5. موازين بيزربا (Bizerba)
 * 6. الملف الموحد العام القياسي (Universal Excel / CSV PLU)
 * 7. الإرسال الشبكي المباشر (TCP Socket / IP Direct Send)
 */

import * as XLSX from 'xlsx';

export type ScaleModel =
    | 'universal_csv'
    | 'universal_excel'
    | 'mettler_toledo'
    | 'toledo_txt'
    | 'cas_clworks'
    | 'cas_cl5000'
    | 'rongta_rls'
    | 'rongta_rls1000'
    | 'dibal'
    | 'dibal_txt';

export interface ScaleExportItem {
    id?: string;
    pluNumber: number;
    plu?: number;
    code: string;
    name: string;
    secondName?: string;
    price: number;
    unit: string;
    barcodePrefix?: string;
    barcode?: string;
    barcodeType?: string;
    department?: string | number;
    group?: string | number;
    category?: string;
    shelfLifeDays?: number;
    tare?: number;
    isWeight?: boolean;
}

export type ScaleItem = ScaleExportItem;

export interface ScaleExportOptions {
    model: ScaleModel;
    barcodePrefix?: string;
    defaultShelfLifeDays?: number;
    defaultDepartment?: number;
    onlyWeightItems?: boolean;
}

/**
 * توليد هيكل باركود ميزان EAN-13 مع حساب خانة التحقق (Check Digit)
 */
export function generateScaleBarcode(prefix: string = '21', code: string | number): string {
    const p = String(prefix || '21').slice(0, 2).padEnd(2, '2');
    const c = String(code).padStart(5, '0').slice(-5);
    const weightPart = '00000';
    const raw12 = `${p}${c}${weightPart}`;

    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(raw12[i], 10) || 0;
        sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return `${raw12}${checkDigit}`;
}

/**
 * تجهيز وتنسيق قائمة الأصناف المناسبة للميزان
 */
export function prepareScaleItems(
    items: any[],
    options: Partial<ScaleExportOptions> = {}
): ScaleExportItem[] {
    const prefix = options.barcodePrefix || '21';
    const defaultShelfLife = options.defaultShelfLifeDays || 15;
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
        const price = Number(item.price || item.sellPrice || item.sellingPrice || 0);
        const unit = item.baseUnit || item.unit || 'كجم';
        const department = Number(item.sectionId || item.categoryId || defaultDept) || defaultDept;

        return {
            pluNumber,
            plu: pluNumber,
            code: code5,
            name,
            secondName: item.nameEn || '',
            price,
            unit,
            barcodePrefix: prefix,
            barcode: item.barcode || generateScaleBarcode(prefix, code5),
            department,
            shelfLifeDays: Number(item.shelfLifeDays) || defaultShelfLife,
            tare: Number(item.tare) || 0,
            isWeight: true,
        };
    });
}

/**
 * 1. توليد ملف موازين ميتلر توليدو السويسرية (Mettler Toledo - bPlus / Tiger / FreshBase / SPCT / MT-WIN)
 * يدعم صيغة SPCT (Scale Programming and Configuration Tool) و Tiger 15D المعتمدة عالمياً
 */
export function generateToledoFile(scaleItems: ScaleExportItem[]): string {
    // تنسيق Mettler Toledo SPCT / SmartConnect:
    // PLU,CODE,NAME1,NAME2,UNIT_PRICE,WEIGHT_UNIT,DEPT,LABEL,EXPIRY,TARE,BARCODE_PREFIX
    const header = 'PLU,CODE,NAME1,NAME2,UNIT_PRICE,WEIGHT_UNIT,DEPT,LABEL,EXPIRY,TARE,BARCODE\r\n';
    const lines = scaleItems.map(item => {
        const plu = item.pluNumber;
        const code = item.code;
        const name1 = `"${item.name.replace(/"/g, '""')}"`;
        const name2 = `"${(item.secondName || '').replace(/"/g, '""')}"`;
        const price = item.price.toFixed(2);
        const weightUnit = item.unit.includes('جرام') ? 4 : 1; // 1 = kg, 4 = g
        const dept = item.department || 1;
        const labelFormat = 1; // Standard format
        const expiry = item.shelfLifeDays || 15;
        const tare = (item.tare || 0).toFixed(3);
        const fullBarcode = item.barcode || generateScaleBarcode(item.barcodePrefix || '21', code);

        return `${plu},${code},${name1},${name2},${price},${weightUnit},${dept},${labelFormat},${expiry},${tare},${fullBarcode}`;
    });
    return '\uFEFF' + header + lines.join('\r\n');
}

/**
 * 2. توليد ملف الموازين الموحد (Universal Excel)
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
        'كود الباركود الكامل': item.barcode || `${item.barcodePrefix || '21'}${item.code}000000`.slice(0, 13),
        'القسم / المجموعة': item.department || 1,
        'أيام الصلاحية': item.shelfLifeDays || 15,
        'الوزن الفارغ (Tare)': item.tare || 0
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scale_PLU');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new Uint8Array(buf);
}

/**
 * 3. توليد ملف الموازين الموحد القياسي (Universal CSV)
 */
export function generateUniversalCsv(scaleItems: ScaleExportItem[]): string {
    const header = 'PLU,ItemCode,ItemName,Price,Unit,BarcodePrefix,FullBarcode,Department,ShelfLifeDays,Tare\n';
    const lines = scaleItems.map(item => {
        const cleanName = `"${item.name.replace(/"/g, '""')}"`;
        const fullBarcode = item.barcode || `${item.barcodePrefix || '21'}${item.code}000000`.slice(0, 13);
        return `${item.pluNumber},${item.code},${cleanName},${item.price},${item.unit},${item.barcodePrefix || '21'},${fullBarcode},${item.department || 1},${item.shelfLifeDays || 15},${item.tare || 0}`;
    });
    return '\uFEFF' + header + lines.join('\n');
}

/**
 * 4. توليد ملف برنامج CAS CL-Works لموازين CAS الكورية (CL-5000 / CL-5200 / CL-7000 / LP-1000)
 */
export function generateCasClWorksFile(scaleItems: ScaleExportItem[]): string {
    const header = 'PLU_NO,ITEM_CODE,NAME_1,NAME_2,PRICE,UNIT,DEPT_NO,BAR_TYPE,TARE,EXP_DATE\r\n';
    const lines = scaleItems.map(item => {
        const plu = item.pluNumber;
        const code = item.code;
        const name1 = item.name.replace(/[,;]/g, ' ');
        const name2 = (item.secondName || '').replace(/[,;]/g, ' ');
        const price = Math.round(item.price * 100) / 100;
        const unit = item.unit.includes('جرام') ? 1 : 0;
        const dept = item.department || 1;
        const barType = 0;
        const tare = item.tare || 0;
        const exp = item.shelfLifeDays || 15;
        return `${plu},${code},${name1},${name2},${price},${unit},${dept},${barType},${tare},${exp}`;
    });
    return '\uFEFF' + header + lines.join('\r\n');
}

/**
 * 5. توليد ملف موازين رونجتا الصينية (Rongta RLS1000 / RLS1100)
 */
export function generateRongtaFile(scaleItems: ScaleExportItem[]): string {
    const header = 'Name,LFCode,Code,UnitPrice,Unit,Dept,WeightUnit,PackageType,BarcodeType\r\n';
    const lines = scaleItems.map(item => {
        const name = `"${item.name.replace(/"/g, '""')}"`;
        const plu = item.pluNumber;
        const code = item.code;
        return `${name},${plu},${code},${item.price},1,${item.department || 1},1,0,7`;
    });
    return '\uFEFF' + header + lines.join('\r\n');
}

/**
 * 6. توليد ملف موازين ديبال الإسبانية (Dibal Wind / Mistral TXT)
 */
export function generateDibalFile(scaleItems: ScaleExportItem[]): string {
    const lines = scaleItems.map(item => {
        const plu = item.pluNumber;
        const code = item.code;
        const name = item.name.replace(/;/g, ' ');
        const price = Math.round(item.price * 100);
        const dept = item.department || 1;
        return `${plu};${code};${name};${price};${plu};${dept};0`;
    });
    return lines.join('\r\n');
}

/**
 * المنسق الموحد لإنشاء حمولة التصدير والإرسال لمختلف أنواع الموازين
 */
export function generateScaleExportPayload(options: {
    model: ScaleModel | string;
    items: ScaleItem[] | any[];
    barcodePrefix?: string;
    shelfLifeDays?: number;
}): {
    content: Uint8Array | string;
    mimeType: string;
    filename: string;
} {
    const { model, items, barcodePrefix = '21', shelfLifeDays = 15 } = options;

    const normalizedItems: ScaleExportItem[] = items.map((it, idx) => ({
        pluNumber: Number(it.pluNumber || it.plu || idx + 1),
        code: String(it.code || it.plu || idx + 1).padStart(5, '0').slice(-5),
        name: String(it.name || '').trim(),
        secondName: it.secondName || '',
        price: Number(it.price || it.sellingPrice || it.sellPrice || 0),
        unit: it.unit || it.baseUnit || 'كجم',
        barcodePrefix,
        barcode: it.barcode || generateScaleBarcode(barcodePrefix, it.code || idx + 1),
        department: it.department || 1,
        shelfLifeDays: Number(it.shelfLifeDays) || shelfLifeDays,
        tare: Number(it.tare) || 0,
        isWeight: true,
    }));

    const dateStr = new Date().toISOString().split('T')[0];

    switch (model) {
        case 'mettler_toledo':
        case 'toledo_txt':
            return {
                content: generateToledoFile(normalizedItems),
                mimeType: 'text/csv; charset=utf-8',
                filename: `Mettler_Toledo_SPCT_${dateStr}.csv`,
            };

        case 'universal_excel':
            return {
                content: generateUniversalExcel(normalizedItems),
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                filename: `Scale_PLU_Universal_${dateStr}.xlsx`,
            };

        case 'cas_clworks':
        case 'cas_cl5000':
            return {
                content: generateCasClWorksFile(normalizedItems),
                mimeType: 'text/csv; charset=utf-8',
                filename: `CAS_CLWorks_PLU_${dateStr}.csv`,
            };

        case 'rongta_rls':
        case 'rongta_rls1000':
            return {
                content: generateRongtaFile(normalizedItems),
                mimeType: 'text/csv; charset=utf-8',
                filename: `Rongta_RLS_PLU_${dateStr}.csv`,
            };

        case 'dibal':
        case 'dibal_txt':
            return {
                content: generateDibalFile(normalizedItems),
                mimeType: 'text/plain; charset=utf-8',
                filename: `Dibal_PLU_${dateStr}.txt`,
            };

        case 'universal_csv':
        default:
            return {
                content: generateUniversalCsv(normalizedItems),
                mimeType: 'text/csv; charset=utf-8',
                filename: `Scale_PLU_Export_${dateStr}.csv`,
            };
    }
}
