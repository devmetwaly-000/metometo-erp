

"use client";

import React, { useState, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Download, Upload, Loader2, FileSpreadsheet, CheckCircle, AlertTriangle } from "lucide-react";
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/data-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Combobox } from '@/components/ui/combobox';


type ItemForImport = {
    name: string;
    code?: string;
    parentCode?: string; // New for clothing variants
    unit: number; // Changed to number
    cost: number;
    price: number;
    reorderPoint?: number;
    section: string; // Level 1
    category: string; // Level 2
    group?: string; // Level 3
    subCategory1?: string; // Level 4
    subCategory2?: string; // Level 5
    colorCode?: string;
    sizeCode?: string;
    warehouseCode?: string;
    openingStock?: number;
    itemType?: number; // Changed to number
    components?: string; // e.g. "CODE1:QTY,CODE2:QTY"
};

type ItemForDisplay = ItemForImport & {
    isDuplicate: boolean;
};


const REQUIRED_HEADERS = ['name', 'unit', 'cost', 'price', 'section', 'category', 'itemType'];

const itemTypeMap: Record<number, any> = { 1: 'standard', 2: 'raw_material', 3: 'manufactured' };
const unitMap: Record<number, any> = { 1: 'piece', 2: 'kilo', 3: 'gram', 4: 'meter' };

export default function ImportItemsPage() {
    const { toast } = useToast();
    const { allItems, dbAction, getNextId, loading, itemSections, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2, warehouses, inventoryZones, settings, itemColors, itemSizes } = useData();
    const [importedData, setImportedData] = useState<ItemForDisplay[]>([]);
    const [fileName, setFileName] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [processingIndex, setProcessingIndex] = useState<number | null>(null);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');

    const isClothingStore = useMemo(() => settings?.main?.general?.isClothingStore || false, [settings]);
    const allWarehouses = useMemo(() => [...warehouses, ...inventoryZones], [warehouses, inventoryZones]);


    const handleDownloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        const selectedWarehouseCode = allWarehouses.find((w: any) => w.id === selectedWarehouse)?.code || 'MAIN';
        
        const headers = [
            // Basic (Required)
            { header: "اسم الصنف", key: "name", style: { fill: { fgColor: { rgb: "D6EAD6" } } } },
            { header: "وحدة القياس", key: "unit", style: { fill: { fgColor: { rgb: "D6EAD6" } } }, comment: "انظر الدليل: 1=قطعة, 2=كيلو..." },
            { header: "التكلفة", key: "cost", style: { fill: { fgColor: { rgb: "D6EAD6" } } } },
            { header: "سعر البيع", key: "price", style: { fill: { fgColor: { rgb: "D6EAD6" } } } },
            { header: "نوع الصنف", key: "itemType", style: { fill: { fgColor: { rgb: "D6EAD6" } } }, comment: "انظر الدليل: 1=عادي, 2=خام, 3=مصنع" },
            // Hierarchical Categories
            { header: "الفئة (م1)", key: "section", style: { fill: { fgColor: { rgb: "DCE6F1" } } } },
            { header: "القسم (م2)", key: "category", style: { fill: { fgColor: { rgb: "DCE6F1" } } } },
            { header: "المجموعة (م3)", key: "group", style: { fill: { fgColor: { rgb: "DCE6F1" } } } },
            // Pricing and Stock
            { header: "كود الصنف (باركود)", key: "code", style: { fill: { fgColor: { rgb: "FFF2CC" } } }, comment: "اتركه فارغاً للإنشاء التلقائي" },
            { header: "حد الطلب", key: "reorderPoint", style: { fill: { fgColor: { rgb: "FFF2CC" } } } },
            { header: "كود الفرع (للأرصدة)", key: "warehouseCode", style: { fill: { fgColor: { rgb: "FFF2CC" } } } },
            { header: "الرصيد الافتتاحي", key: "openingStock", style: { fill: { fgColor: { rgb: "FFF2CC" } } } },
            // Special Data
            { header: "المكونات (للمصنع)", key: "components", style: { fill: { fgColor: { rgb: "F2F2F2" } } }, comment: "صيغة: CODE1:QTY,CODE2:QTY" }
        ];

        const realisticItems: any[] = [
            // Standard Items (piece)
            { name: "شاي ليبتون 100 فتلة", code: "6221000000014", unit: 1, cost: 85, price: 100, reorderPoint: 50, section: "بقالة جافة", category: "مشروبات", group: "شاي وقهوة", warehouseCode: selectedWarehouseCode, openingStock: 140, itemType: 1 },
            { name: "زيت كريستال عباد 750 مل", code: "6221001002046", unit: 1, cost: 70, price: 85, reorderPoint: 40, section: "بقالة جافة", category: "زيوت وسمن", warehouseCode: selectedWarehouseCode, openingStock: 80, itemType: 1 },
            
            // Scale Items (kilo)
            { name: "جبنة رومي", code: "00001", unit: 2, cost: 220, price: 280, reorderPoint: 10, section: "أجبان ومبردات", category: "أجبان بالكيلو", warehouseCode: selectedWarehouseCode, openingStock: 15, itemType: 1 },
            { name: "تفاح أحمر مستورد", code: "00002", unit: 2, cost: 45, price: 60, reorderPoint: 20, section: "خضروات وفاكهة", category: "فاكهة", warehouseCode: selectedWarehouseCode, openingStock: 50, itemType: 1 },

            // Raw Materials
            { name: "خبز كيزر", code: "RAW-1001", unit: 1, cost: 2, price: 0, reorderPoint: 100, section: "مواد خام", category: "مخبوزات خام", warehouseCode: selectedWarehouseCode, openingStock: 200, itemType: 2 },
            { name: "لحم برجر مجمد", code: "RAW-1002", unit: 2, cost: 250, price: 0, reorderPoint: 30, section: "مواد خام", category: "لحوم مجمدة", warehouseCode: selectedWarehouseCode, openingStock: 50, itemType: 2 },

            // Manufactured Items
            { name: "ساندويتش برجر بالجبنة", code: "MANU-001", unit: 1, cost: 0, price: 75, reorderPoint: 0, section: "منتجات مصنعة", category: "ساندويتشات", group: "برجر", itemType: 3, components: "RAW-1001:1,RAW-1002:0.15" },
            { name: "وجبة برجر كومبو", code: "MANU-002", unit: 1, cost: 0, price: 120, reorderPoint: 0, section: "منتجات مصنعة", category: "وجبات", group: "برجر", itemType: 3, components: "MANU-001:1,RAW-1003:1" }, // Assuming RAW-1003 is fries
        ];


        const wsData = realisticItems.map(item => {
            const row: any = {};
            headers.forEach(h => {
                row[h.header] = (item as any)[h.key] ?? '';
            });
            return row;
        });
        
        wsData.unshift(Object.fromEntries(headers.map(h => [h.header, h.header])));

        const ws = XLSX.utils.json_to_sheet(wsData, { skipHeader: true });

        const headerKeys = Object.keys(wsData[0]);
        headerKeys.forEach((key, index) => {
            const cellAddress = XLSX.utils.encode_cell({ c: index, r: 0 });
            if (ws[cellAddress]) {
                const headerConfig = headers.find(h => h.header === key);
                if (headerConfig) {
                    ws[cellAddress].s = headerConfig.style;
                    if(headerConfig.comment) {
                        if (!ws[cellAddress].c) ws[cellAddress].c = [];
                        ws[cellAddress].c.push({a:"SheetJS", t: headerConfig.comment});
                    }
                }
            }
        });
        ws["!cols"] = headers.map(h => ({ wch: h.header.length + 5 }));


        XLSX.utils.book_append_sheet(wb, ws, "Items");

        // --- Guide Sheet Data ---
        let guideData = [
            ["الدليل الإرشادي لاستيراد الأصناف"],
            [],
            ["جدول نوع الصنف (itemType)"],
            ["الكود", "النوع", "الوصف"],
            [1, "standard", "منتج عادي جاهز للبيع (مثل المشروبات، المعلبات، الملابس)"],
            [2, "raw_material", "مادة خام تستخدم في التصنيع (مثل طماطم، خبز، قماش). إذا تُرك الكود فارغًا، سيتم إنشاء كود تلقائي (مثال: RAW-1001)."],
            [3, "manufactured", "منتج يتم تصنيعه داخلياً من مكونات أخرى (مثل ساندويتش)"],
            [],
            ["جدول الوحدات (unit)"],
            ["الكود", "الوحدة"],
            [1, "piece (قطعة)"],
            [2, "kilo (كيلو)"],
            [3, "gram (جرام)"],
            [4, "meter (متر)"],
            [],
            ["ملاحظات هامة:"],
            [`- الأصناف العادية (standard): إذا تُرك حقل 'code' فارغًا، سيقوم النظام بإنشاء باركود EAN-13 يبدأ بـ ${settings?.main?.financial?.standardItemBarcodePrefix || '25'} تلقائيًا.`],
            [`- أصناف الميزان (kilo/gram/meter): يجب إدخال كود مكون من 5 أرقام (مثال: 00001) في حقل 'code'. سيقوم النظام ببناء باركود الرف EAN-13 الكامل تلقائيًا (مثل: ${settings?.main?.financial?.scaleBarcodePrefix || '21'}00001000007).`],
            ["- الأصناف المصنعة (manufactured): يجب كتابة مكوناتها في عمود 'components' بالصيغة التالية: باركود_المكون_1:الكمية,باركود_المكون_2:الكمية."],
            ["- للأصناف المصنعة، سيتم تجاهل أي قيمة في عمود الرصيد الافتتاحي (openingStock)."],
            [`- أصناف الملابس (Clothing Store Mode): يجب إدخال 'parentCode' للربط بين تشكيلات اللون والمقاس المختلفة لنفس المنتج. الباركود النهائي (يبدأ بـ ${settings?.main?.financial?.clothingBarcodePrefix || '23'}) سيتم إنشاؤه تلقائياً.`]
        ];
        
        if (isClothingStore) {
             if (itemColors.length > 0) {
                guideData.push([], ["جدول أكواد الألوان (colorCode)"]);
                guideData.push(["الكود", "الاسم"]);
                itemColors.forEach((c: any) => guideData.push([c.code, c.name]));
            }
            if (itemSizes.length > 0) {
                guideData.push([], ["جدول أكواد المقاسات (sizeCode)"]);
                guideData.push(["الكود", "الاسم"]);
                itemSizes.forEach((s: any) => guideData.push([s.code, s.name]));
            }
        }
        
        const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
        XLSX.utils.book_append_sheet(wb, wsGuide, "الدليل (Guide)");
        
        XLSX.writeFile(wb, `ItemImportTemplate_With_Examples.xlsx`);
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedWarehouse) {
             toast({ variant: 'destructive', title: 'خطأ', description: 'يرجى اختيار فرع أولاً قبل رفع الملف.' });
             return;
        };

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames.find(name => name.toLowerCase() === 'items');
                if (!sheetName) {
                    toast({ variant: 'destructive', title: 'خطأ في الملف', description: 'لم يتم العثور على صفحة باسم "Items" في الملف المرفوع.' });
                    return;
                }
                
                const worksheet = workbook.Sheets[sheetName];
                const json: any[] = XLSX.utils.sheet_to_json(worksheet);

                if (json.length === 0) {
                    toast({ variant: 'destructive', title: 'ملف فارغ', description: 'الملف الذي تم رفعه لا يحتوي على بيانات.' });
                    return;
                }
                
                const reverseHeaderMap: {[key: string]: string} = {
                    'اسم الصنف': 'name', 'كود الصنف (باركود)': 'code', 'كود الصنف الأب': 'parentCode', 'وحدة القياس': 'unit',
                    'التكلفة': 'cost', 'سعر البيع': 'price', 'حد الطلب': 'reorderPoint', 'الفئة (م1)': 'section',
                    'القسم (م2)': 'category', 'المجموعة (م3)': 'group',
                    'كود اللون': 'colorCode', 'كود المقاس': 'sizeCode',
                    'كود الفرع (للأرصدة)': 'warehouseCode', 'الرصيد الافتتاحي': 'openingStock', 'نوع الصنف': 'itemType',
                    'المكونات (للمصنع)': 'components'
                };

                const standardizedJson = json.map(row => {
                    const newRow: any = {};
                    for (const key in row) {
                        const standardizedKey = Object.keys(reverseHeaderMap).find(k => k.trim() === key.trim());
                        if (standardizedKey && reverseHeaderMap[standardizedKey]) {
                            newRow[reverseHeaderMap[standardizedKey]] = row[key];
                        } else {
                            newRow[key] = row[key];
                        }
                    }
                    return newRow;
                });
                
                const headers = Object.keys(standardizedJson[0] || {});
                const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
                if (missingHeaders.length > 0) {
                    toast({
                        variant: 'destructive',
                        title: 'أعمدة ناقصة',
                        description: `الملف يفتقد للأعمدة المطلوبة: ${missingHeaders.join(', ')}`
                    });
                    return;
                }
                
                const existingItemNames = new Set(allItems.map((i: any) => i.name.trim().toLowerCase()));

                const dataForDisplay: ItemForDisplay[] = standardizedJson.map(row => ({
                    ...row,
                    isDuplicate: existingItemNames.has(String(row.name || '').trim().toLowerCase())
                }));

                setImportedData(dataForDisplay);
                 toast({ title: 'تمت قراءة الملف', description: `تم العثور على ${json.length} صنف. يرجى المراجعة قبل الاستيراد.` });
            } catch (error) {
                console.error(error);
                toast({ variant: 'destructive', title: 'خطأ في الملف', description: 'لا يمكن قراءة الملف. تأكد من أن أسماء الأعمدة مطابقة للقالب تمامًا.' });
            }
        };
        reader.readAsArrayBuffer(file);
    };
    
    const calculateEan13CheckDigit = (barcodeWithoutCheckDigit: string): string => {
        if (barcodeWithoutCheckDigit.length !== 12) return '0';
        let sumEven = 0, sumOdd = 0;
        barcodeWithoutCheckDigit.split('').forEach((char, index) => {
            const digit = parseInt(char, 10);
            if ((index + 1) % 2 === 0) { sumEven += digit; } 
            else { sumOdd += digit; }
        });
        const totalSum = sumOdd + (sumEven * 3);
        const remainder = totalSum % 10;
        const checkDigit = (remainder === 0) ? 0 : 10 - remainder;
        return String(checkDigit);
    };


    const handleConfirmImport = async () => {
        if (importedData.length === 0) return;
        setIsImporting(true);
        setImportProgress(0);
        setProcessingIndex(null);

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        try {
            const allItemsMap = new Map<string, string>();
            allItems.forEach((item: any) => {
                if (item.code) allItemsMap.set(String(item.code), item.id);
            });
            const allLevels = { itemSections, itemCategories, itemGroups };

            const sectionsMap = new Map((itemSections || []).map((s: any) => [s.name, s.id]));
            const categoriesMap = new Map((itemCategories || []).map((c: any) => [`${c.sectionId}-${c.name}`, c.id]));
            const groupsMap = new Map((itemGroups || []).map((g: any) => [`${g.parentCategoryId}-${g.name}`, g.id]));
            
            const subCategories1Map = new Map((itemSubCategories1 || []).map((s: any) => [s.name, s.id]));
            const subCategories2Map = new Map((itemSubCategories2 || []).map((s: any) => [s.name, s.id]));

            const colorsMap = new Map((itemColors || []).map((c:any) => [String(c.code), c.id]));
            const sizesMap = new Map((itemSizes || []).map((s:any) => [String(s.code), s.id]));
            const existingItemNames = new Set(allItems.map((i: any) => i.name.trim().toLowerCase()));

            const ensureHierarchy = async (item: ItemForImport) => {
                let sectionId = sectionsMap.get(item.section);
                if (!sectionId && item.section) {
                    const nextCode = String((await getNextId('itemSection', 1) || 1)).padStart(2, '0');
                    const newId = await dbAction('itemSections', 'add', { name: item.section, code: nextCode });
                    if (newId) { sectionId = newId as string; sectionsMap.set(item.section, sectionId); }
                }

                let categoryId = categoriesMap.get(`${sectionId}-${item.category}`);
                if (!categoryId && item.category && sectionId) {
                    const section = allLevels.itemSections.find((s:any) => s.id === sectionId);
                    const siblings = allLevels.itemCategories.filter((c:any) => c.sectionId === sectionId);
                    const nextNum = siblings.length > 0 ? Math.max(...siblings.map((s:any) => parseInt(String(s.code || '0').split('-')[1] || '0', 10))) + 1 : 1;
                    const newCode = `${section?.code}-${nextNum}`;
                    const newId = await dbAction('itemCategories', 'add', { name: item.category, sectionId, code: newCode });
                    if (newId) { categoryId = newId as string; categoriesMap.set(`${sectionId}-${item.category}`, categoryId); }
                }

                let groupId = groupsMap.get(`${categoryId}-${item.group}`);
                if (!groupId && item.group && categoryId) {
                    const category = allLevels.itemCategories.find((c:any) => c.id === categoryId);
                    const siblings = allLevels.itemGroups.filter((g:any) => g.parentCategoryId === categoryId);
                    const nextNum = siblings.length > 0 ? Math.max(...siblings.map((s:any) => parseInt(String(s.code || '0').split('-')[2] || '0', 10))) + 1 : 1;
                    const newCode = `${category?.code}-${nextNum}`;
                    const newId = await dbAction('itemGroups', 'add', { name: item.group, parentCategoryId: categoryId, code: newCode });
                    if (newId) { groupId = newId as string; groupsMap.set(`${categoryId}-${item.group}`, groupId); }
                }

                return { sectionId, categoryId, groupId };
            };
            
            const newItemsInThisSession = new Set<string>();

            for (let i = 0; i < importedData.length; i++) {
                const item = importedData[i];
                setProcessingIndex(i);

                const itemNameLower = String(item.name).trim().toLowerCase();
                
                if (existingItemNames.has(itemNameLower) || newItemsInThisSession.has(itemNameLower)) {
                    skippedCount++;
                    setImportProgress(((i + 1) / importedData.length) * 100);
                    await new Promise(resolve => setTimeout(resolve, 10));
                    continue;
                }

                try {
                    const { sectionId, categoryId, groupId } = await ensureHierarchy(item);
                    const itemType = itemTypeMap[item.itemType || 1] || 'standard';
                    const unit = unitMap[item.unit || 1] || 'piece';
                    
                    const colorId = item.colorCode ? (colorsMap.get(String(item.colorCode).padStart(2, '0')) || null) : null;
                    const sizeId = item.sizeCode ? (sizesMap.get(String(item.sizeCode).padStart(2, '0')) || null) : null;

                    const barcodeType = isClothingStore ? 'ean13_clothing' : (unit === 'kilo' || unit === 'gram' || unit === 'meter') ? 'ean13_scale' : 'code128';

                    let newItemData: any = {
                        name: item.name,
                        unit,
                        cost: Number(item.cost) || 0,
                        price: Number(item.price) || 0,
                        reorderPoint: Number(item.reorderPoint) || (itemType === 'raw_material' ? 10 : 0),
                        sectionId: sectionId || null,
                        categoryId: categoryId || null,
                        itemGroupId: groupId || null,
                        isDisabled: false,
                        itemType: itemType,
                        barcodeType: barcodeType,
                        color: colorId,
                        size: sizeId,
                        parentCode: item.parentCode || null,
                    };
                    
                    if (itemType === 'manufactured' && item.components) {
                         const componentsArray: { itemId: string; quantity: number }[] = [];
                         const componentStrings = String(item.components).split(',');
                         for (const compStr of componentStrings) {
                             const [code, qty] = compStr.split(':');
                             const componentId = allItemsMap.get(code.trim());
                             if (componentId && !isNaN(parseFloat(qty))) {
                                 componentsArray.push({ itemId: componentId, quantity: parseFloat(qty) });
                             } else { console.warn(`Component with code "${code.trim()}" not found or invalid quantity for item "${item.name}".`); }
                         }
                         newItemData.components = componentsArray;
                    }

                    let codeToSave = item.code ? String(item.code) : null;
                    if (!codeToSave) {
                        if (itemType === 'raw_material') {
                            codeToSave = `RAW-${await getNextId('rawMaterialCode', 1000)}`;
                        } else if (barcodeType === 'ean13_clothing') {
                             const section = itemSections.find((s:any) => s.id === sectionId);
                             const category = itemCategories.find((c:any) => c.id === categoryId);
                             
                             let parentIdCode = '000';
                             const parentItem = allItems.find((p: any) => p.code === item.parentCode);
                             if (parentItem) {
                                const last3 = String(parentItem.id).slice(-3);
                                parentIdCode = last3.padStart(3, '0');
                             }

                             const itemColor = itemColors.find((c:any) => c.id === colorId);
                             const itemSize = itemSizes.find((s:any) => s.id === sizeId);

                             const sectionCode = String(section?.code || '00').padStart(2, '0');
                             const categoryCode = String(category?.code?.split('-')[1] || '00').padStart(2, '0');
                             const itemColorCode = String(itemColor?.code || '00').padStart(2, '0');
                             const itemSizeCode = String(itemSize?.code || '00').padStart(2, '0');
                             
                             const clothingPrefix = settings?.main?.financial?.clothingBarcodePrefix || '23';
                            
                            const base = `${clothingPrefix}${sectionCode}${categoryCode}${parentIdCode}${itemColorCode}${itemSizeCode}`.slice(0, 12);
                            const checkDigit = calculateEan13CheckDigit(base);
                            codeToSave = `${base}${checkDigit}`;
                        } else if (barcodeType === 'code128') {
                             const standardPrefix = settings?.main?.financial?.standardItemBarcodePrefix || '25';
                             const nextId = await getNextId('standardItemCode', 1);
                             const uniquePart = String(nextId).padStart(10, '0'); // 10 digits for unique part
                             const baseCode = `${standardPrefix}${uniquePart}`;
                             const checkDigit = calculateEan13CheckDigit(baseCode);
                             codeToSave = `${baseCode}${checkDigit}`;
                        }
                    } else if (barcodeType === 'ean13_scale' && codeToSave && codeToSave.length > 0 && codeToSave.length <= 5) {
                        const scalePrefix = settings?.main?.financial?.scaleBarcodePrefix || '21';
                        const itemCodePadded = String(codeToSave).padStart(5, '0');
                        const base = `${scalePrefix}${itemCodePadded}00000`.slice(0, 12);
                        const checkDigit = calculateEan13CheckDigit(base);
                        codeToSave = `${base}${checkDigit}`;
                    }

                    newItemData.code = codeToSave;

                    const newItemId = await dbAction('items', 'add', newItemData) as string;
                    if(newItemId) {
                         if(newItemData.code) allItemsMap.set(newItemData.code, newItemId);
                         newItemsInThisSession.add(itemNameLower);
                         existingItemNames.add(itemNameLower); // Add to existing names to prevent duplicates within the same session
                    }
                    
                    if (newItemId && itemType !== 'manufactured' && item.openingStock && Number(item.openingStock) > 0) {
                        const warehouseCodeToUse = item.warehouseCode || allWarehouses.find((w: any) => w.id === selectedWarehouse)?.code;
                        const targetWarehouse = allWarehouses.find((w: any) => w.code === warehouseCodeToUse);

                        if (targetWarehouse) {
                             const isMainWarehouse = targetWarehouse.isMain;
                             const record = {
                                warehouseId: targetWarehouse.id,
                                date: new Date().toISOString(),
                                reason: 'opening_stock',
                                notes: `رصيد افتتاحي من شيت الإكسل`,
                                receiptNumber: `إذ-د-${await getNextId('stockIn')}`,
                                items: [{ itemId: newItemId, name: item.name, qty: Number(item.openingStock), cost: Number(item.cost) || 0 }],
                                status: isMainWarehouse ? 'pending_putaway' : 'completed',
                            };
                            await dbAction('stockInRecords', 'add', record);
                        } else { console.warn(`Warehouse with code "${warehouseCodeToUse}" not found for item "${item.name}". Skipping opening stock.`); }
                    }
                    successCount++;
                } catch (error: any) { console.error(`Failed to import item ${item.name}:`, error); errorCount++; }
                
                setImportProgress(((i + 1) / importedData.length) * 100);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

        } catch (error) {
            console.error("An error occurred during the import pre-processing:", error);
            toast({ variant: 'destructive', title: 'خطأ كبير', description: 'حدث خطأ أثناء تجهيز البيانات.' });
        }
        
        toast({
            title: `اكتمل الاستيراد`,
            description: `تم: ${successCount} | فشل: ${errorCount} | تم التجاوز: ${skippedCount}`
        });
        
        setIsImporting(false);
        setImportedData([]);
        setFileName('');
        setProcessingIndex(null);
    };
    
    const warehouseOptions = React.useMemo(() => allWarehouses.map((w: any) => ({ value: w.id, label: w.name })), [allWarehouses]);


    return (
        <>
            <PageHeader title="استيراد الأصناف من Excel" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle>الخطوة 1: تحديد الفرع</CardTitle>
                            <CardDescription>اختر الفرع الذي تريد إضافة الأرصدة الافتتاحية إليه. هذا الحقل إلزامي.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="space-y-2">
                                <Label>الفرع</Label>
                                <Combobox 
                                    options={warehouseOptions}
                                    value={selectedWarehouse}
                                    onValueChange={setSelectedWarehouse}
                                    placeholder="اختر الفرع المستهدف"
                                    emptyMessage="لا يوجد فروع"
                                />
                             </div>
                        </CardContent>
                    </Card>
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle>الخطوة 2: تجهيز ورفع الملف</CardTitle>
                            <CardDescription>قم بتنزيل القالب، ثم قم بتعبئته ببيانات أصنافك وارفعه هنا. يجب أن يكون لكل صنف كود (باركود) فريد.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-2">
                                <Button onClick={handleDownloadTemplate} disabled={!selectedWarehouse} className="flex-1"><Download className="ml-2 h-4 w-4" /> تحميل القالب مع أمثلة</Button>
                                <Input id="file-upload" type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                                <Label htmlFor="file-upload" className="flex-grow">
                                     <Button asChild className="w-full cursor-pointer" disabled={!selectedWarehouse}><span className='flex items-center'><Upload className="ml-2 h-4 w-4" /> رفع الملف</span></Button>
                                </Label>
                                {fileName && <div className="flex items-center gap-2 p-2 border rounded-md bg-muted min-w-48"><FileSpreadsheet className="h-4 w-4 text-green-600"/><span className="text-sm truncate">{fileName}</span></div>}
                            </div>
                        </CardContent>
                    </Card>
                </div>
                {importedData.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>الخطوة 3: المراجعة والتأكيد</CardTitle>
                            <CardDescription>تم العثور على {importedData.length} صنف. الأصناف المظللة باللون الأحمر موجودة بالفعل وسيتم تجاهلها.</CardDescription>
                             {isImporting && (
                                <div className="space-y-2 pt-4">
                                    <Progress value={importProgress} />
                                    <p className="text-sm text-muted-foreground text-center">
                                        جارٍ معالجة الصنف {processingIndex !== null ? processingIndex + 1 : 0} من {importedData.length}...
                                    </p>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent>
                             <div className="max-h-96 overflow-auto border rounded-md">
                                <Table>
                                    <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>الكود</TableHead><TableHead>النوع</TableHead><TableHead>التكلفة</TableHead><TableHead>السعر</TableHead><TableHead>رصيد افتتاحي</TableHead><TableHead>كود الفرع</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {importedData.map((item, index) => (
                                            <TableRow 
                                                key={index}
                                                className={cn(
                                                    item.isDuplicate && "bg-red-500/10 text-muted-foreground",
                                                    processingIndex === index && "bg-yellow-100 dark:bg-yellow-900/50 animate-pulse"
                                                )}
                                            >
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell>{item.code || '(سيتم إنشاؤه)'}</TableCell>
                                                <TableCell>{itemTypeMap[item.itemType || 1]}</TableCell>
                                                <TableCell>{item.cost}</TableCell>
                                                <TableCell>{item.price}</TableCell>
                                                <TableCell className="font-bold">{item.itemType === 3 ? '(N/A)' : (item.openingStock || '-')}</TableCell>
                                                <TableCell>{item.warehouseCode || '-'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                             </div>
                        </CardContent>
                        <CardFooter className="justify-end">
                            <Button size="lg" onClick={handleConfirmImport} disabled={isImporting}>
                                {isImporting ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <CheckCircle className="ml-2 h-4 w-4" />}
                                {isImporting ? 'جارٍ الاستيراد...' : 'تأكيد واستيراد البيانات الجديدة'}
                            </Button>
                        </CardFooter>
                    </Card>
                )}
            </main>
        </>
    );
}
