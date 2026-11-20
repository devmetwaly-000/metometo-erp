"use client";

import React, { useMemo, useState, useCallback } from 'react';
import PageHeader from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { 
  Loader2, 
  Printer, 
  Download, 
  Component, 
  Search, 
  Folder, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown, 
  Package, 
  Layers, 
  ListTree, 
  TableProperties, 
  AlertTriangle, 
  Boxes, 
  Tag, 
  Bookmark,
  Building2,
  Maximize2,
  Minimize2,
  Filter
} from "lucide-react";
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useData } from "@/contexts/data-provider";
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import * as XLSX from 'xlsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calculateStockForItemInWarehouse } from '@/lib/inventory-utils';

// Interfaces
interface Item { 
    id: string; 
    name: string; 
    unit: string; 
    baseUnit?: string; 
    price: number; 
    cost?: number; 
    reorderPoint?: number; 
    code?: string; 
    barcode?: string;
    itemType?: 'standard' | 'raw_material' | 'manufactured'; 
    components?: { itemId: string; quantity: number }[];
    secondaryUnits?: { name: string; conversionFactor: number; }[];
    sectionId?: string;
    categoryId?: string;
    itemGroupId?: string;
    subCategoryId1?: string;
    subCategoryId2?: string;
    colorId?: string;
    sizeId?: string;
    color?: string;
    size?: string;
}

interface Warehouse { id: string; name: string; }

interface StockItemRow {
    id: string;
    warehouseId: string;
    warehouseName: string;
    itemId: string;
    itemCode: string;
    barcode: string;
    itemName: string;
    unit: string;
    cost: number;
    price: number;
    currentStock: number;
    formattedStock: string;
    totalValue: number;
    totalRetailValue: number;
    reorderPoint: number;
    isLowStock: boolean;
    isCalculatedStock: boolean;
    sectionId: string;
    sectionName: string;
    categoryId: string;
    categoryName: string;
    itemGroupId: string;
    groupName: string;
    subCategoryId1: string;
    subCategory1Name: string;
    subCategoryId2: string;
    subCategory2Name: string;
    colorName?: string;
    sizeName?: string;
    itemType?: string;
}

// Tree Nodes for the 6 levels
interface TreeSub2 {
    id: string;
    name: string;
    items: StockItemRow[];
    itemsCount: number;
    totalStock: number;
    totalValue: number;
    lowStockCount: number;
}

interface TreeSub1 {
    id: string;
    name: string;
    sub2List: TreeSub2[];
    itemsCount: number;
    totalStock: number;
    totalValue: number;
    lowStockCount: number;
}

interface TreeGroup {
    id: string;
    name: string;
    sub1List: TreeSub1[];
    itemsCount: number;
    totalStock: number;
    totalValue: number;
    lowStockCount: number;
}

interface TreeCategory {
    id: string;
    name: string;
    groups: TreeGroup[];
    itemsCount: number;
    totalStock: number;
    totalValue: number;
    lowStockCount: number;
}

interface TreeSection {
    id: string;
    name: string;
    categories: TreeCategory[];
    itemsCount: number;
    totalStock: number;
    totalValue: number;
    lowStockCount: number;
}

export default function StockStatusPage() {
    const router = useRouter(); 
    const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
    const [filters, setFilters] = useState({
        warehouseId: "all",
        searchTerm: "",
        itemType: 'all',
        sectionId: 'all',
        categoryId: 'all',
        itemGroupId: 'all',
        subCategoryId1: 'all',
        subCategoryId2: 'all',
        hideZeroStock: true,
        onlyLowStock: false,
        consolidateWarehouses: false,
    });
    const [reportData, setReportData] = useState<StockItemRow[] | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

    const allDataContext = useData();
    const { 
        items: allItems, 
        warehouses,
        inventoryZones,
        itemSections = [],
        itemCategories = [],
        itemGroups = [],
        itemSubCategories1 = [],
        itemSubCategories2 = [],
        itemColors = [],
        itemSizes = [],
        loading,
    } = allDataContext;

    const handleFilterChange = (key: keyof typeof filters, value: any) => {
        const newFilters = { ...filters, [key]: value };
        if (key === 'sectionId') {
            newFilters.categoryId = 'all';
            newFilters.itemGroupId = 'all';
        }
        if (key === 'categoryId') {
            newFilters.itemGroupId = 'all';
        }
        setFilters(newFilters);
    };
    
    const allWarehouses = useMemo(() => [...warehouses, ...inventoryZones], [warehouses, inventoryZones]);
    const warehouseOptions = useMemo(() => ([
        { value: 'all', label: 'كل الفروع والمخازن' },
        ...allWarehouses.map((w: Warehouse) => ({ value: w.id, label: w.name }))
    ]), [allWarehouses]);
    
    const calculateManufacturableStock = useCallback((item: Item, warehouseId: string, allData: any): number => {
        if (!item.components || item.components.length === 0) {
            return 0;
        }
        
        let maxPossibleUnits = Infinity;
        for (const component of item.components) {
            const componentStock = calculateStockForItemInWarehouse(component.itemId, warehouseId, allData);
            const unitsPossibleFromComponent = Math.floor(componentStock / component.quantity);
            if (unitsPossibleFromComponent < maxPossibleUnits) {
                maxPossibleUnits = unitsPossibleFromComponent;
            }
        }
        return maxPossibleUnits === Infinity ? 0 : maxPossibleUnits;
    }, []);

    // Filter options for classification levels
    const sectionOptions = useMemo(() => ([
        { value: 'all', label: 'الكل (كل الأقسام الرئيسية)' }, 
        ...(itemSections || []).map((s: any) => ({ value: s.id, label: s.name }))
    ]), [itemSections]);

    const categoryOptions = useMemo(() => {
        const filtered = (itemCategories || []).filter((c: any) => filters.sectionId === 'all' || c.sectionId === filters.sectionId);
        return [{ value: 'all', label: 'الكل (كل الفئات والتصنيفات)' }, ...filtered.map((c: any) => ({ value: c.id, label: c.name }))];
    }, [itemCategories, filters.sectionId]);

    const groupOptions = useMemo(() => {
        const filtered = (itemGroups || []).filter((g: any) => filters.categoryId === 'all' || g.parentCategoryId === filters.categoryId);
        return [{ value: 'all', label: 'الكل (كل المجموعات العامة)' }, ...filtered.map((g: any) => ({ value: g.id, label: g.name }))];
    }, [itemGroups, filters.categoryId]);

    const subCategory1Options = useMemo(() => ([
        { value: 'all', label: 'الكل (كل الماركات / UDF 1)' }, 
        ...(itemSubCategories1 || []).map((s: any) => ({ value: s.id, label: s.name }))
    ]), [itemSubCategories1]);

    const subCategory2Options = useMemo(() => ([
        { value: 'all', label: 'الكل (كل الموديلات / UDF 2)' }, 
        ...(itemSubCategories2 || []).map((s: any) => ({ value: s.id, label: s.name }))
    ]), [itemSubCategories2]);

    const formatStockDisplay = (totalQty: number, item: Item) => {
        const baseUnitName = item.baseUnit || item.unit || 'قطعة';
        if (!item.secondaryUnits || item.secondaryUnits.length === 0) {
            return `${totalQty.toLocaleString()} ${baseUnitName}`;
        }
        const secondaryUnits = [...item.secondaryUnits].sort((a, b) => b.conversionFactor - a.conversionFactor);
        
        let remainingQty = totalQty;
        const parts: string[] = [];

        for (const unit of secondaryUnits) {
            if (remainingQty >= unit.conversionFactor) {
                const count = Math.floor(remainingQty / unit.conversionFactor);
                parts.push(`${count} ${unit.name}`);
                remainingQty %= unit.conversionFactor;
            }
        }

        if (remainingQty > 0 || parts.length === 0) {
            parts.push(`${remainingQty.toLocaleString()} ${baseUnitName}`);
        }

        return parts.join(' و ');
    };

    // Quick lookup maps
    const sectionsMap = useMemo(() => new Map((itemSections || []).map((s: any) => [s.id, s.name])), [itemSections]);
    const categoriesMap = useMemo(() => new Map((itemCategories || []).map((c: any) => [c.id, c.name])), [itemCategories]);
    const groupsMap = useMemo(() => new Map((itemGroups || []).map((g: any) => [g.id, g.name])), [itemGroups]);
    const subs1Map = useMemo(() => new Map((itemSubCategories1 || []).map((s: any) => [s.id, s.name])), [itemSubCategories1]);
    const subs2Map = useMemo(() => new Map((itemSubCategories2 || []).map((s: any) => [s.id, s.name])), [itemSubCategories2]);
    const colorsMap = useMemo(() => new Map((itemColors || []).map((c: any) => [c.id, c.name])), [itemColors]);
    const sizesMap = useMemo(() => new Map((itemSizes || []).map((s: any) => [s.id, s.name])), [itemSizes]);
    
    const handleGenerateReport = () => {
        if (loading) return;

        let itemsToProcess: Item[] = allItems || [];
        
        const filterFunctions = [
            (item: Item) => !filters.searchTerm || 
                (item.name && item.name.toLowerCase().includes(filters.searchTerm.toLowerCase())) || 
                (item.code && item.code.toLowerCase().includes(filters.searchTerm.toLowerCase())) ||
                (item.barcode && item.barcode.toLowerCase().includes(filters.searchTerm.toLowerCase())),
            (item: Item) => filters.itemType === 'all' || item.itemType === filters.itemType,
            (item: Item) => filters.sectionId === 'all' || item.sectionId === filters.sectionId,
            (item: Item) => filters.categoryId === 'all' || item.categoryId === filters.categoryId,
            (item: Item) => filters.itemGroupId === 'all' || item.itemGroupId === filters.itemGroupId,
            (item: Item) => filters.subCategoryId1 === 'all' || item.subCategoryId1 === filters.subCategoryId1,
            (item: Item) => filters.subCategoryId2 === 'all' || item.subCategoryId2 === filters.subCategoryId2,
        ];

        itemsToProcess = itemsToProcess.filter(item => filterFunctions.every(fn => fn(item as any)));

        const warehousesToProcess = filters.warehouseId === 'all' ? allWarehouses : allWarehouses.filter(w => w.id === filters.warehouseId);

        const data: StockItemRow[] = [];
        
        if (filters.consolidateWarehouses && filters.warehouseId === 'all') {
            // Consolidate across all warehouses per item
            itemsToProcess.forEach(itemMaster => {
                let totalStockAll = 0;
                let isCalculated = itemMaster.itemType === 'manufactured';

                warehousesToProcess.forEach(wh => {
                    const st = isCalculated 
                        ? calculateManufacturableStock(itemMaster, wh.id, allDataContext) 
                        : calculateStockForItemInWarehouse(itemMaster.id, wh.id, allDataContext);
                    totalStockAll += st;
                });

                if (filters.hideZeroStock && totalStockAll === 0) return;
                const reorder = itemMaster.reorderPoint || 0;
                const isLow = reorder > 0 && totalStockAll <= reorder;
                if (filters.onlyLowStock && !isLow) return;

                const cost = itemMaster.cost || 0;
                const price = itemMaster.price || 0;

                data.push({
                    id: `consolidated-${itemMaster.id}`,
                    warehouseId: 'all',
                    warehouseName: 'جميع المخازن والفروع (مجمع)',
                    itemId: itemMaster.id,
                    itemCode: itemMaster.code || '',
                    barcode: itemMaster.barcode || '',
                    itemName: itemMaster.name,
                    unit: itemMaster.baseUnit || itemMaster.unit || 'وحدة',
                    cost: cost,
                    price: price,
                    currentStock: totalStockAll,
                    formattedStock: formatStockDisplay(totalStockAll, itemMaster),
                    totalValue: totalStockAll * cost,
                    totalRetailValue: totalStockAll * price,
                    reorderPoint: reorder,
                    isLowStock: isLow,
                    isCalculatedStock: isCalculated,
                    sectionId: itemMaster.sectionId || 'none',
                    sectionName: (itemMaster.sectionId && sectionsMap.get(itemMaster.sectionId)) || 'بدون قسم رئيسي (م1)',
                    categoryId: itemMaster.categoryId || 'none',
                    categoryName: (itemMaster.categoryId && categoriesMap.get(itemMaster.categoryId)) || 'بدون فئة (م2)',
                    itemGroupId: itemMaster.itemGroupId || 'none',
                    groupName: (itemMaster.itemGroupId && groupsMap.get(itemMaster.itemGroupId)) || 'بدون مجموعة (م3)',
                    subCategoryId1: itemMaster.subCategoryId1 || 'none',
                    subCategory1Name: (itemMaster.subCategoryId1 && subs1Map.get(itemMaster.subCategoryId1)) || 'بدون تصنيف فرعي 1 (م4/UDF1)',
                    subCategoryId2: itemMaster.subCategoryId2 || 'none',
                    subCategory2Name: (itemMaster.subCategoryId2 && subs2Map.get(itemMaster.subCategoryId2)) || 'بدون تصنيف فرعي 2 (م5/UDF2)',
                    colorName: (itemMaster.colorId && colorsMap.get(itemMaster.colorId)) || itemMaster.color || '',
                    sizeName: (itemMaster.sizeId && sizesMap.get(itemMaster.sizeId)) || itemMaster.size || '',
                    itemType: itemMaster.itemType,
                });
            });
        } else {
            warehousesToProcess.forEach(warehouse => {
                itemsToProcess.forEach(itemMaster => {
                    const isManufactured = itemMaster.itemType === 'manufactured';
                    const currentStock = isManufactured ? calculateManufacturableStock(itemMaster, warehouse.id, allDataContext) : calculateStockForItemInWarehouse(itemMaster.id, warehouse.id, allDataContext);

                    if (filters.hideZeroStock && currentStock === 0) return;
                    const reorder = itemMaster.reorderPoint || 0;
                    const isLow = reorder > 0 && currentStock <= reorder;
                    if (filters.onlyLowStock && !isLow) return;

                    const cost = itemMaster.cost || 0;
                    const price = itemMaster.price || 0;

                    data.push({
                        id: `${warehouse.id}-${itemMaster.id}`,
                        warehouseId: warehouse.id,
                        itemId: itemMaster.id,
                        warehouseName: warehouse.name,
                        itemCode: itemMaster.code || '',
                        barcode: itemMaster.barcode || '',
                        itemName: itemMaster.name,
                        unit: itemMaster.baseUnit || itemMaster.unit || 'وحدة',
                        cost: cost,
                        price: price,
                        currentStock: currentStock,
                        formattedStock: formatStockDisplay(currentStock, itemMaster),
                        totalValue: currentStock * cost,
                        totalRetailValue: currentStock * price,
                        reorderPoint: reorder,
                        isLowStock: isLow,
                        isCalculatedStock: isManufactured,
                        sectionId: itemMaster.sectionId || 'none',
                        sectionName: (itemMaster.sectionId && sectionsMap.get(itemMaster.sectionId)) || 'بدون قسم رئيسي (م1)',
                        categoryId: itemMaster.categoryId || 'none',
                        categoryName: (itemMaster.categoryId && categoriesMap.get(itemMaster.categoryId)) || 'بدون فئة (م2)',
                        itemGroupId: itemMaster.itemGroupId || 'none',
                        groupName: (itemMaster.itemGroupId && groupsMap.get(itemMaster.itemGroupId)) || 'بدون مجموعة (م3)',
                        subCategoryId1: itemMaster.subCategoryId1 || 'none',
                        subCategory1Name: (itemMaster.subCategoryId1 && subs1Map.get(itemMaster.subCategoryId1)) || 'بدون تصنيف فرعي 1 (م4/UDF1)',
                        subCategoryId2: itemMaster.subCategoryId2 || 'none',
                        subCategory2Name: (itemMaster.subCategoryId2 && subs2Map.get(itemMaster.subCategoryId2)) || 'بدون تصنيف فرعي 2 (م5/UDF2)',
                        colorName: (itemMaster.colorId && colorsMap.get(itemMaster.colorId)) || itemMaster.color || '',
                        sizeName: (itemMaster.sizeId && sizesMap.get(itemMaster.sizeId)) || itemMaster.size || '',
                        itemType: itemMaster.itemType,
                    });
                });
            });
        }
        
        setReportData(data);

        // Auto-expand section level by default
        const initialExpanded: Record<string, boolean> = {};
        data.forEach(item => {
            initialExpanded[`sec-${item.sectionId}`] = true;
        });
        setExpandedNodes(initialExpanded);
    };

    // Build the hierarchical tree from reportData
    const treeData = useMemo<TreeSection[]>(() => {
        if (!reportData || reportData.length === 0) return [];

        const sectionsMapInternal: Record<string, TreeSection> = {};

        reportData.forEach(item => {
            const secKey = item.sectionId;
            if (!sectionsMapInternal[secKey]) {
                sectionsMapInternal[secKey] = {
                    id: secKey,
                    name: item.sectionName,
                    categories: [],
                    itemsCount: 0,
                    totalStock: 0,
                    totalValue: 0,
                    lowStockCount: 0,
                };
            }
            const sec = sectionsMapInternal[secKey];
            sec.itemsCount += 1;
            sec.totalStock += item.currentStock;
            sec.totalValue += item.totalValue;
            if (item.isLowStock) sec.lowStockCount += 1;

            // Category
            const catKey = item.categoryId;
            let cat = sec.categories.find(c => c.id === catKey);
            if (!cat) {
                cat = {
                    id: catKey,
                    name: item.categoryName,
                    groups: [],
                    itemsCount: 0,
                    totalStock: 0,
                    totalValue: 0,
                    lowStockCount: 0,
                };
                sec.categories.push(cat);
            }
            cat.itemsCount += 1;
            cat.totalStock += item.currentStock;
            cat.totalValue += item.totalValue;
            if (item.isLowStock) cat.lowStockCount += 1;

            // Group
            const grpKey = item.itemGroupId;
            let grp = cat.groups.find(g => g.id === grpKey);
            if (!grp) {
                grp = {
                    id: grpKey,
                    name: item.groupName,
                    sub1List: [],
                    itemsCount: 0,
                    totalStock: 0,
                    totalValue: 0,
                    lowStockCount: 0,
                };
                cat.groups.push(grp);
            }
            grp.itemsCount += 1;
            grp.totalStock += item.currentStock;
            grp.totalValue += item.totalValue;
            if (item.isLowStock) grp.lowStockCount += 1;

            // SubCategory 1 (UDF 1)
            const sub1Key = item.subCategoryId1;
            let sub1 = grp.sub1List.find(s => s.id === sub1Key);
            if (!sub1) {
                sub1 = {
                    id: sub1Key,
                    name: item.subCategory1Name,
                    sub2List: [],
                    itemsCount: 0,
                    totalStock: 0,
                    totalValue: 0,
                    lowStockCount: 0,
                };
                grp.sub1List.push(sub1);
            }
            sub1.itemsCount += 1;
            sub1.totalStock += item.currentStock;
            sub1.totalValue += item.totalValue;
            if (item.isLowStock) sub1.lowStockCount += 1;

            // SubCategory 2 (UDF 2)
            const sub2Key = item.subCategoryId2;
            let sub2 = sub1.sub2List.find(s => s.id === sub2Key);
            if (!sub2) {
                sub2 = {
                    id: sub2Key,
                    name: item.subCategory2Name,
                    items: [],
                    itemsCount: 0,
                    totalStock: 0,
                    totalValue: 0,
                    lowStockCount: 0,
                };
                sub1.sub2List.push(sub2);
            }
            sub2.itemsCount += 1;
            sub2.totalStock += item.currentStock;
            sub2.totalValue += item.totalValue;
            if (item.isLowStock) sub2.lowStockCount += 1;

            // Level 6: Item row
            sub2.items.push(item);
        });

        return Object.values(sectionsMapInternal);
    }, [reportData]);

    const toggleNode = (nodeKey: string) => {
        setExpandedNodes(prev => ({
            ...prev,
            [nodeKey]: !prev[nodeKey]
        }));
    };

    const expandAll = () => {
        const next: Record<string, boolean> = {};
        treeData.forEach(sec => {
            const secKey = `sec-${sec.id}`;
            next[secKey] = true;
            sec.categories.forEach(cat => {
                const catKey = `${secKey}-cat-${cat.id}`;
                next[catKey] = true;
                cat.groups.forEach(grp => {
                    const grpKey = `${catKey}-grp-${grp.id}`;
                    next[grpKey] = true;
                    grp.sub1List.forEach(sub1 => {
                        const sub1Key = `${grpKey}-sub1-${sub1.id}`;
                        next[sub1Key] = true;
                        sub1.sub2List.forEach(sub2 => {
                            const sub2Key = `${sub1Key}-sub2-${sub2.id}`;
                            next[sub2Key] = true;
                        });
                    });
                });
            });
        });
        setExpandedNodes(next);
    };

    const collapseAll = () => {
        setExpandedNodes({});
    };

    const handlePrint = () => {
        window.print();
    };
    
    const handleExportExcel = () => {
        if (!reportData || reportData.length === 0) return;

        const dataForExport = reportData.map(item => ({
            'المخزن / الفرع': item.warehouseName,
            'مستوى 1: القسم الرئيسي (Section)': item.sectionName,
            'مستوى 2: الفئة / التصنيف (Category)': item.categoryName,
            'مستوى 3: المجموعة العامة (Group)': item.groupName,
            'مستوى 4: تصنيف فرعي 1 (UDF1 / الماركة)': item.subCategory1Name,
            'مستوى 5: تصنيف فرعي 2 (UDF2 / الموديل)': item.subCategory2Name,
            'كود الصنف': item.itemCode,
            'الباركود': item.barcode,
            'اسم الصنف': item.itemName,
            'اللون': item.colorName || '',
            'المقاس': item.sizeName || '',
            'الوحدة': item.unit,
            'الرصيد المتاح': item.currentStock,
            'الرصيد المجمع': item.formattedStock,
            'سعر التكلفة': item.cost,
            'سعر البيع': item.price,
            'إجمالي القيمة بالتكلفة': item.totalValue,
            'إجمالي القيمة بالبيع': item.totalRetailValue,
            'حد إعادة الطلب': item.reorderPoint,
            'حالة المخزون': item.isLowStock ? 'ناقص عن حد الطلب' : 'طبيعي',
            'نوع الصنف': item.itemType === 'manufactured' ? 'منتج مصنع' : item.itemType === 'raw_material' ? 'مادة خام' : 'منتج عادي',
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataForExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "أرصدة الأصناف بالمستويات");
        XLSX.writeFile(workbook, `MultiLevel_Stock_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    };
    
    // Summary statistics
    const stats = useMemo(() => {
        if (!reportData || reportData.length === 0) {
            return { totalItems: 0, totalStock: 0, totalValue: 0, totalRetail: 0, lowStockCount: 0, sectionsCount: 0 };
        }
        const totalItems = reportData.length;
        const totalStock = reportData.reduce((sum, item) => sum + item.currentStock, 0);
        const totalValue = reportData.reduce((sum, item) => sum + item.totalValue, 0);
        const totalRetail = reportData.reduce((sum, item) => sum + item.totalRetailValue, 0);
        const lowStockCount = reportData.filter(item => item.isLowStock).length;
        const sectionsCount = new Set(reportData.map(item => item.sectionId)).size;
        return { totalItems, totalStock, totalValue, totalRetail, lowStockCount, sectionsCount };
    }, [reportData]);

    return (
        <>
            <PageHeader title="تقرير أرصدة الأصناف بكافة المستويات الهرمية والتفصيلية" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                
                {/* Search & Multi-Level Filters Card */}
                <Card className="no-print shadow-sm border">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Filter className="h-5 w-5 text-primary" />
                                <CardTitle className="text-lg">فلاتر البحث وتقسيم المستويات (6 مستويات)</CardTitle>
                            </div>
                            <Badge variant="outline" className="font-mono text-xs">
                                قسم &gt; فئة &gt; مجموعة &gt; UDF1 &gt; UDF2 &gt; صنف
                            </Badge>
                        </div>
                        <CardDescription>
                            حدد المخزن أو الفرع مع إمكانية التصفية على أي مستوى من المستويات الستة وعرض الإجماليات بدقة
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            
                            {/* Warehouse */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>المخزن / الفرع</span>
                                </Label>
                                <Combobox
                                    options={warehouseOptions}
                                    value={filters.warehouseId}
                                    onValueChange={(v) => handleFilterChange("warehouseId", v)}
                                    placeholder="كل الفروع والمخازن"
                                    emptyMessage="لم يتم العثور على فرع."
                                />
                            </div>

                            {/* Search */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>بحث بالاسم أو الكود أو الباركود</span>
                                </Label>
                                <div className="relative">
                                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="اكتب اسم الصنف أو الكود..."
                                        className="pr-9 h-10"
                                        value={filters.searchTerm}
                                        onChange={e => handleFilterChange('searchTerm', e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Level 1: Section */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                    <Badge className="h-4 px-1 text-[10px] bg-sky-600">م1</Badge>
                                    <span>القسم الرئيسي (Section)</span>
                                </Label>
                                <Combobox 
                                    options={sectionOptions} 
                                    value={filters.sectionId} 
                                    onValueChange={(v) => handleFilterChange('sectionId', v)} 
                                    placeholder="الكل" 
                                    emptyMessage="لا يوجد أقسام"
                                />
                            </div>

                            {/* Level 2: Category */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                    <Badge className="h-4 px-1 text-[10px] bg-blue-600">م2</Badge>
                                    <span>الفئة / التصنيف (Category)</span>
                                </Label>
                                <Combobox 
                                    options={categoryOptions} 
                                    value={filters.categoryId} 
                                    onValueChange={(v) => handleFilterChange('categoryId', v)} 
                                    placeholder="الكل" 
                                    emptyMessage="اختر قسماً رئيسياً أولاً" 
                                    disabled={filters.sectionId === 'all'}
                                />
                            </div>

                            {/* Level 3: Item Group */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                    <Badge className="h-4 px-1 text-[10px] bg-indigo-600">م3</Badge>
                                    <span>المجموعة العامة (Item Group)</span>
                                </Label>
                                <Combobox 
                                    options={groupOptions} 
                                    value={filters.itemGroupId} 
                                    onValueChange={(v) => handleFilterChange('itemGroupId', v)} 
                                    placeholder="الكل" 
                                    emptyMessage="اختر فئة أولاً" 
                                    disabled={filters.categoryId === 'all'}
                                />
                            </div>

                            {/* Level 4: SubCategory 1 / UDF 1 */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                    <Badge className="h-4 px-1 text-[10px] bg-purple-600">م4</Badge>
                                    <span>تصنيف فرعي 1 (ماركة / UDF1)</span>
                                </Label>
                                <Combobox 
                                    options={subCategory1Options} 
                                    value={filters.subCategoryId1} 
                                    onValueChange={(v) => handleFilterChange('subCategoryId1', v)} 
                                    placeholder="الكل" 
                                    emptyMessage="لا يوجد"
                                />
                            </div>

                            {/* Level 5: SubCategory 2 / UDF 2 */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                    <Badge className="h-4 px-1 text-[10px] bg-pink-600">م5</Badge>
                                    <span>تصنيف فرعي 2 (موديل / UDF2)</span>
                                </Label>
                                <Combobox 
                                    options={subCategory2Options} 
                                    value={filters.subCategoryId2} 
                                    onValueChange={(v) => handleFilterChange('subCategoryId2', v)} 
                                    placeholder="الكل" 
                                    emptyMessage="لا يوجد"
                                />
                            </div>

                            {/* Item Type */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold">نوع الصنف</Label>
                                <Select value={filters.itemType} onValueChange={(v) => handleFilterChange("itemType", v)}>
                                    <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">كل الأنواع</SelectItem>
                                        <SelectItem value="standard">منتجات عادية</SelectItem>
                                        <SelectItem value="raw_material">مواد خام</SelectItem>
                                        <SelectItem value="manufactured">منتجات مصنعة</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                        </div>

                        {/* Options Checkboxes */}
                        <div className="flex flex-wrap items-center gap-6 pt-3 border-t">
                            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                                <Checkbox 
                                    checked={filters.hideZeroStock} 
                                    onCheckedChange={(c) => handleFilterChange('hideZeroStock', !!c)} 
                                />
                                <span>إخفاء الأرصدة الصفرية (المخزون المتوفر فقط)</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                                <Checkbox 
                                    checked={filters.onlyLowStock} 
                                    onCheckedChange={(c) => handleFilterChange('onlyLowStock', !!c)} 
                                />
                                <span className="text-amber-500 font-semibold">عرض النواقص فقط (الرصيد &le; حد إعادة الطلب)</span>
                            </label>

                            {filters.warehouseId === 'all' && (
                                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                                    <Checkbox 
                                        checked={filters.consolidateWarehouses} 
                                        onCheckedChange={(c) => handleFilterChange('consolidateWarehouses', !!c)} 
                                    />
                                    <span>تجميع كميات الصنف عبر كل المخازن في سطر واحد</span>
                                </label>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="flex items-center justify-between border-t pt-3 bg-muted/20">
                        <Button className="w-full sm:w-auto px-6 h-10 font-bold" onClick={handleGenerateReport} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin ml-2 h-4 w-4" /> : <Boxes className="ml-2 h-4 w-4" />}
                            عرض تقرير الأرصدة بالمستويات
                        </Button>
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                            يدعم التقرير تصدير Excel بالمستويات الستة وشجرة تفاعلية
                        </span>
                    </CardFooter>
                </Card>

                {/* Report Content */}
                {reportData ? (
                    <div className="space-y-4 printable-area">
                        
                        {/* KPI Summary Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            <Card className="border shadow-sm p-3">
                                <div className="text-xs text-muted-foreground font-medium">عدد الأصناف المعروضة</div>
                                <div className="text-2xl font-bold mt-1 text-primary">{stats.totalItems.toLocaleString()}</div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">صنف / بند مخزني</div>
                            </Card>

                            <Card className="border shadow-sm p-3">
                                <div className="text-xs text-muted-foreground font-medium">إجمالي رصيد القطع/الوحدات</div>
                                <div className="text-2xl font-bold mt-1 text-emerald-500">{stats.totalStock.toLocaleString()}</div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">وحدة أساسية</div>
                            </Card>

                            <Card className="border shadow-sm p-3">
                                <div className="text-xs text-muted-foreground font-medium">إجمالي قيمة المخزون (بالتكلفة)</div>
                                <div className="text-2xl font-bold mt-1 text-blue-500">
                                    {stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">جنيه / ريال (تكلفة)</div>
                            </Card>

                            <Card className="border shadow-sm p-3">
                                <div className="text-xs text-muted-foreground font-medium">إجمالي القيمة بسعر البيع</div>
                                <div className="text-2xl font-bold mt-1 text-purple-500">
                                    {stats.totalRetail.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">قيمة البيع المتوقعة</div>
                            </Card>

                            <Card className="border shadow-sm p-3">
                                <div className="text-xs text-muted-foreground font-medium">الأصناف تحت حد الطلب (نواقص)</div>
                                <div className={`text-2xl font-bold mt-1 ${stats.lowStockCount > 0 ? 'text-destructive' : 'text-emerald-500'}`}>
                                    {stats.lowStockCount.toLocaleString()}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">تحتاج لإعادة شراء</div>
                            </Card>
                        </div>

                        {/* Actions & View Mode Toolbar */}
                        <Card className="border shadow-sm">
                            <CardHeader className="p-3 sm:p-4">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex rounded-md border p-1 bg-muted/40">
                                            <Button 
                                                variant={viewMode === 'tree' ? 'default' : 'ghost'} 
                                                size="sm" 
                                                className="h-8 gap-1.5 text-xs font-bold"
                                                onClick={() => setViewMode('tree')}
                                            >
                                                <ListTree className="h-4 w-4" />
                                                <span>عرض شجري هرمي (المستويات الـ 6)</span>
                                            </Button>
                                            <Button 
                                                variant={viewMode === 'flat' ? 'default' : 'ghost'} 
                                                size="sm" 
                                                className="h-8 gap-1.5 text-xs font-bold"
                                                onClick={() => setViewMode('flat')}
                                            >
                                                <TableProperties className="h-4 w-4" />
                                                <span>عرض جدولي تفصيلي مسطح</span>
                                            </Button>
                                        </div>

                                        {viewMode === 'tree' && (
                                            <div className="flex items-center gap-1 mr-2 no-print">
                                                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={expandAll}>
                                                    <Maximize2 className="h-3.5 w-3.5" />
                                                    <span>توسيع الكل</span>
                                                </Button>
                                                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={collapseAll}>
                                                    <Minimize2 className="h-3.5 w-3.5" />
                                                    <span>طي الكل</span>
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-auto no-print">
                                        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={handleExportExcel} disabled={reportData.length === 0}>
                                            <Download className="ml-1 h-4 w-4" />
                                            <span>تصدير Excel (شامل المستويات)</span>
                                        </Button>
                                        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={handlePrint}>
                                            <Printer className="ml-1 h-4 w-4" />
                                            <span>طباعة</span>
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-3 sm:p-4 pt-0">
                                
                                {/* VIEW MODE 1: HIERARCHICAL TREE VIEW */}
                                {viewMode === 'tree' && (
                                    <div className="space-y-4">
                                        {treeData.length === 0 ? (
                                            <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/10">
                                                لا توجد أصناف تطابق الفلاتر المحددة.
                                            </div>
                                        ) : (
                                            treeData.map(section => {
                                                const secKey = `sec-${section.id}`;
                                                const isSecOpen = expandedNodes[secKey] ?? true;

                                                return (
                                                    <div key={secKey} className="border-2 border-sky-500/30 rounded-xl overflow-hidden bg-card shadow-sm">
                                                        
                                                        {/* Level 1: Section Header */}
                                                        <div 
                                                            className="flex flex-wrap items-center justify-between p-3.5 bg-sky-500/10 hover:bg-sky-500/20 cursor-pointer transition-colors border-b"
                                                            onClick={() => toggleNode(secKey)}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {isSecOpen ? <ChevronDown className="h-5 w-5 text-sky-600" /> : <ChevronRight className="h-5 w-5 text-sky-600" />}
                                                                <FolderOpen className="h-5 w-5 text-sky-600" />
                                                                <Badge className="bg-sky-600 text-white hover:bg-sky-700 text-xs font-bold">المستوى 1: القسم الرئيسي</Badge>
                                                                <span className="text-base font-bold text-foreground">{section.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-3 text-xs font-medium">
                                                                <span className="text-muted-foreground">{section.categories.length} فئات</span>
                                                                <span className="text-muted-foreground">|</span>
                                                                <span className="font-semibold">{section.itemsCount} صنف</span>
                                                                <span className="text-muted-foreground">|</span>
                                                                <span className="text-emerald-500 font-bold">{section.totalStock.toLocaleString()} وحدة</span>
                                                                <span className="text-muted-foreground">|</span>
                                                                <Badge variant="secondary" className="font-mono font-bold bg-sky-500/20 text-sky-700 dark:text-sky-300">
                                                                    إجمالي القيمة: {section.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                                                                </Badge>
                                                            </div>
                                                        </div>

                                                        {/* Section Body */}
                                                        {isSecOpen && (
                                                            <div className="p-3 space-y-3 bg-muted/5">
                                                                {section.categories.map(category => {
                                                                    const catKey = `${secKey}-cat-${category.id}`;
                                                                    const isCatOpen = expandedNodes[catKey] ?? false;

                                                                    return (
                                                                        <div key={catKey} className="border border-blue-500/30 rounded-lg overflow-hidden bg-card mr-3">
                                                                            
                                                                            {/* Level 2: Category Header */}
                                                                            <div 
                                                                                className="flex flex-wrap items-center justify-between p-2.5 bg-blue-500/10 hover:bg-blue-500/15 cursor-pointer transition-colors border-b"
                                                                                onClick={() => toggleNode(catKey)}
                                                                            >
                                                                                <div className="flex items-center gap-2">
                                                                                    {isCatOpen ? <ChevronDown className="h-4 w-4 text-blue-600" /> : <ChevronRight className="h-4 w-4 text-blue-600" />}
                                                                                    <Badge className="bg-blue-600 text-white text-[11px]">م2: الفئة</Badge>
                                                                                    <span className="font-bold text-sm text-foreground">{category.name}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-2.5 text-xs font-medium">
                                                                                    <span className="text-muted-foreground">{category.groups.length} مجموعات</span>
                                                                                    <span className="text-muted-foreground">|</span>
                                                                                    <span className="font-semibold">{category.itemsCount} صنف</span>
                                                                                    <span className="text-muted-foreground">|</span>
                                                                                    <span className="text-emerald-500 font-semibold">{category.totalStock.toLocaleString()} وحدة</span>
                                                                                    <span className="text-muted-foreground">|</span>
                                                                                    <Badge variant="outline" className="font-mono text-xs">
                                                                                        {category.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                                                                                    </Badge>
                                                                                </div>
                                                                            </div>

                                                                            {/* Category Body */}
                                                                            {isCatOpen && (
                                                                                <div className="p-2.5 space-y-2.5 bg-muted/10">
                                                                                    {category.groups.map(group => {
                                                                                        const grpKey = `${catKey}-grp-${group.id}`;
                                                                                        const isGrpOpen = expandedNodes[grpKey] ?? true;

                                                                                        return (
                                                                                            <div key={grpKey} className="border border-indigo-500/25 rounded-md overflow-hidden bg-card mr-3">
                                                                                                
                                                                                                {/* Level 3: Group Header */}
                                                                                                <div 
                                                                                                    className="flex flex-wrap items-center justify-between p-2 bg-indigo-500/10 hover:bg-indigo-500/15 cursor-pointer transition-colors border-b"
                                                                                                    onClick={() => toggleNode(grpKey)}
                                                                                                >
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        {isGrpOpen ? <ChevronDown className="h-3.5 w-3.5 text-indigo-600" /> : <ChevronRight className="h-3.5 w-3.5 text-indigo-600" />}
                                                                                                        <Badge className="bg-indigo-600 text-white text-[10px]">م3: المجموعة</Badge>
                                                                                                        <span className="font-semibold text-xs text-foreground">{group.name}</span>
                                                                                                    </div>
                                                                                                    <div className="flex items-center gap-2 text-xs">
                                                                                                        <span>{group.itemsCount} أصناف</span>
                                                                                                        <span className="text-muted-foreground">|</span>
                                                                                                        <span className="text-emerald-500 font-semibold">{group.totalStock.toLocaleString()} وحدة</span>
                                                                                                        <span className="text-muted-foreground">|</span>
                                                                                                        <span className="font-mono font-semibold">{group.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
                                                                                                    </div>
                                                                                                </div>

                                                                                                {/* Group Body */}
                                                                                                {isGrpOpen && (
                                                                                                    <div className="p-2 space-y-2 bg-muted/5">
                                                                                                        {group.sub1List.map(sub1 => {
                                                                                                            const sub1Key = `${grpKey}-sub1-${sub1.id}`;
                                                                                                            const isSub1Open = expandedNodes[sub1Key] ?? true;

                                                                                                            return (
                                                                                                                <div key={sub1Key} className="border border-purple-500/20 rounded-md overflow-hidden bg-card mr-3">
                                                                                                                    
                                                                                                                    {/* Level 4: SubCategory 1 / UDF 1 */}
                                                                                                                    <div 
                                                                                                                        className="flex flex-wrap items-center justify-between p-1.5 px-2 bg-purple-500/10 hover:bg-purple-500/15 cursor-pointer transition-colors border-b text-xs"
                                                                                                                        onClick={() => toggleNode(sub1Key)}
                                                                                                                    >
                                                                                                                        <div className="flex items-center gap-1.5">
                                                                                                                            {isSub1Open ? <ChevronDown className="h-3 w-3 text-purple-600" /> : <ChevronRight className="h-3 w-3 text-purple-600" />}
                                                                                                                            <Badge className="bg-purple-600 text-white text-[9px] px-1.5 py-0">م4 / UDF1</Badge>
                                                                                                                            <span className="font-medium text-foreground">{sub1.name}</span>
                                                                                                                        </div>
                                                                                                                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                                                                                            <span>{sub1.itemsCount} صنف</span>
                                                                                                                            <span>|</span>
                                                                                                                            <span className="text-emerald-500 font-bold">{sub1.totalStock.toLocaleString()} وحدة</span>
                                                                                                                            <span>|</span>
                                                                                                                            <span className="font-mono">{sub1.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
                                                                                                                        </div>
                                                                                                                    </div>

                                                                                                                    {/* Sub1 Body */}
                                                                                                                    {isSub1Open && (
                                                                                                                        <div className="p-2 space-y-2">
                                                                                                                            {sub1.sub2List.map(sub2 => {
                                                                                                                                const sub2Key = `${sub1Key}-sub2-${sub2.id}`;
                                                                                                                                const isSub2Open = expandedNodes[sub2Key] ?? true;

                                                                                                                                return (
                                                                                                                                    <div key={sub2Key} className="border border-pink-500/20 rounded-md overflow-hidden bg-card mr-3">
                                                                                                                                        
                                                                                                                                        {/* Level 5: SubCategory 2 / UDF 2 */}
                                                                                                                                        <div 
                                                                                                                                            className="flex flex-wrap items-center justify-between p-1 px-2 bg-pink-500/10 hover:bg-pink-500/15 cursor-pointer transition-colors border-b text-xs"
                                                                                                                                            onClick={() => toggleNode(sub2Key)}
                                                                                                                                        >
                                                                                                                                            <div className="flex items-center gap-1.5">
                                                                                                                                                {isSub2Open ? <ChevronDown className="h-3 w-3 text-pink-600" /> : <ChevronRight className="h-3 w-3 text-pink-600" />}
                                                                                                                                                <Badge className="bg-pink-600 text-white text-[9px] px-1.5 py-0">م5 / UDF2</Badge>
                                                                                                                                                <span className="font-medium text-foreground">{sub2.name}</span>
                                                                                                                                            </div>
                                                                                                                                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                                                                                                                <span>{sub2.itemsCount} صنف</span>
                                                                                                                                                <span>|</span>
                                                                                                                                                <span className="text-emerald-500 font-bold">{sub2.totalStock.toLocaleString()} وحدة</span>
                                                                                                                                                <span>|</span>
                                                                                                                                                <span className="font-mono">{sub2.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
                                                                                                                                            </div>
                                                                                                                                        </div>

                                                                                                                                        {/* Level 6: Items Table */}
                                                                                                                                        {isSub2Open && (
                                                                                                                                            <div className="overflow-x-auto">
                                                                                                                                                <Table className="text-xs">
                                                                                                                                                    <TableHeader>
                                                                                                                                                        <TableRow className="bg-muted/40">
                                                                                                                                                            <TableHead className="w-24">المخزن</TableHead>
                                                                                                                                                            <TableHead className="w-24">كود الصنف</TableHead>
                                                                                                                                                            <TableHead className="w-28">الباركود</TableHead>
                                                                                                                                                            <TableHead>اسم الصنف</TableHead>
                                                                                                                                                            <TableHead className="text-center w-16">الوحدة</TableHead>
                                                                                                                                                            <TableHead className="text-center w-20">سعر التكلفة</TableHead>
                                                                                                                                                            <TableHead className="text-center w-24">الرصيد المتاح</TableHead>
                                                                                                                                                            <TableHead className="text-center w-28">الرصيد المجمع</TableHead>
                                                                                                                                                            <TableHead className="text-center w-24">إجمالي القيمة</TableHead>
                                                                                                                                                            <TableHead className="text-center w-20">الحالة</TableHead>
                                                                                                                                                        </TableRow>
                                                                                                                                                    </TableHeader>
                                                                                                                                                    <TableBody>
                                                                                                                                                        {sub2.items.map(row => (
                                                                                                                                                            <TableRow 
                                                                                                                                                                key={row.id}
                                                                                                                                                                onClick={() => router.push(`/reports/item-ledger?itemId=${row.itemId}&warehouseId=${row.warehouseId}`)}
                                                                                                                                                                className="cursor-pointer hover:bg-muted/60 transition-colors"
                                                                                                                                                            >
                                                                                                                                                                <TableCell className="text-muted-foreground">{row.warehouseName}</TableCell>
                                                                                                                                                                <TableCell className="font-mono text-[11px] font-semibold">{row.itemCode}</TableCell>
                                                                                                                                                                <TableCell className="font-mono text-[11px] text-muted-foreground">{row.barcode || '-'}</TableCell>
                                                                                                                                                                <TableCell className="font-medium">
                                                                                                                                                                    <div className="flex items-center gap-1.5">
                                                                                                                                                                        {row.isCalculatedStock && (
                                                                                                                                                                            <TooltipProvider>
                                                                                                                                                                                <Tooltip>
                                                                                                                                                                                    <TooltipTrigger asChild>
                                                                                                                                                                                        <Component className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                                                                                                                                                                                    </TooltipTrigger>
                                                                                                                                                                                    <TooltipContent>رصيد محسوب بناءً على مكونات التصنيع</TooltipContent>
                                                                                                                                                                                </Tooltip>
                                                                                                                                                                            </TooltipProvider>
                                                                                                                                                                        )}
                                                                                                                                                                        <span>{row.itemName}</span>
                                                                                                                                                                        {row.colorName && <Badge variant="outline" className="text-[9px] px-1">{row.colorName}</Badge>}
                                                                                                                                                                        {row.sizeName && <Badge variant="outline" className="text-[9px] px-1">{row.sizeName}</Badge>}
                                                                                                                                                                    </div>
                                                                                                                                                                </TableCell>
                                                                                                                                                                <TableCell className="text-center text-muted-foreground">{row.unit}</TableCell>
                                                                                                                                                                <TableCell className="text-center font-mono">{row.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                                                                                                                                                <TableCell className="text-center font-bold text-emerald-500 font-mono">{row.currentStock.toLocaleString()}</TableCell>
                                                                                                                                                                <TableCell className="text-center">
                                                                                                                                                                    <Badge variant={row.isLowStock ? 'destructive' : 'secondary'} className="text-[10px]">
                                                                                                                                                                        {row.formattedStock}
                                                                                                                                                                    </Badge>
                                                                                                                                                                </TableCell>
                                                                                                                                                                <TableCell className="text-center font-mono font-semibold">
                                                                                                                                                                    {row.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                                                                                                                </TableCell>
                                                                                                                                                                <TableCell className="text-center">
                                                                                                                                                                    {row.isLowStock ? (
                                                                                                                                                                        <Badge variant="destructive" className="text-[9px] px-1 py-0">ناقص &le; {row.reorderPoint}</Badge>
                                                                                                                                                                    ) : (
                                                                                                                                                                        <Badge variant="outline" className="text-[9px] text-emerald-500 border-emerald-500/30 px-1 py-0">طبيعي</Badge>
                                                                                                                                                                    )}
                                                                                                                                                                </TableCell>
                                                                                                                                                            </TableRow>
                                                                                                                                                        ))}
                                                                                                                                                    </TableBody>
                                                                                                                                                </Table>
                                                                                                                                            </div>
                                                                                                                                        )}
                                                                                                                                    </div>
                                                                                                                                );
                                                                                                                            })}
                                                                                                                        </div>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                            );
                                                                                                        })}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}

                                {/* VIEW MODE 2: FLAT TABLE VIEW */}
                                {viewMode === 'flat' && (
                                    <div className="w-full overflow-auto border rounded-lg">
                                        <Table className="text-xs">
                                            <TableHeader>
                                                <TableRow className="bg-muted/50">
                                                    <TableHead className="w-24">المخزن/الفرع</TableHead>
                                                    <TableHead>م1: القسم الرئيسي</TableHead>
                                                    <TableHead>م2: الفئة / التصنيف</TableHead>
                                                    <TableHead>م3: المجموعة</TableHead>
                                                    <TableHead>م4: UDF 1</TableHead>
                                                    <TableHead>م5: UDF 2</TableHead>
                                                    <TableHead className="w-20">كود الصنف</TableHead>
                                                    <TableHead className="w-24">الباركود</TableHead>
                                                    <TableHead className="min-w-[150px]">اسم الصنف</TableHead>
                                                    <TableHead className="text-center w-16">الوحدة</TableHead>
                                                    <TableHead className="text-center w-20">سعر التكلفة</TableHead>
                                                    <TableHead className="text-center w-20">الرصيد</TableHead>
                                                    <TableHead className="text-center w-28">الرصيد المجمع</TableHead>
                                                    <TableHead className="text-center w-24">إجمالي القيمة</TableHead>
                                                    <TableHead className="text-center w-20">الحالة</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {reportData.length > 0 ? reportData.map((item) => (
                                                    <TableRow 
                                                        key={item.id} 
                                                        onClick={() => router.push(`/reports/item-ledger?itemId=${item.itemId}&warehouseId=${item.warehouseId}`)}
                                                        className="cursor-pointer hover:bg-muted/60 transition-colors"
                                                    >
                                                        <TableCell className="text-muted-foreground">{item.warehouseName}</TableCell>
                                                        <TableCell><Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20">{item.sectionName}</Badge></TableCell>
                                                        <TableCell><Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">{item.categoryName}</Badge></TableCell>
                                                        <TableCell><Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20">{item.groupName}</Badge></TableCell>
                                                        <TableCell><span className="text-muted-foreground text-[11px]">{item.subCategory1Name}</span></TableCell>
                                                        <TableCell><span className="text-muted-foreground text-[11px]">{item.subCategory2Name}</span></TableCell>
                                                        <TableCell className="font-mono text-[11px] font-semibold">{item.itemCode}</TableCell>
                                                        <TableCell className="font-mono text-[11px] text-muted-foreground">{item.barcode || '-'}</TableCell>
                                                        <TableCell className="font-medium">
                                                            <div className="flex items-center gap-1.5">
                                                                {item.isCalculatedStock && (
                                                                    <TooltipProvider>
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Component className="h-3.5 w-3.5 text-sky-600 shrink-0"/>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent>رصيد محسوب بناءً على مكونات التصنيع</TooltipContent>
                                                                        </Tooltip>
                                                                    </TooltipProvider>
                                                                )}
                                                                <span>{item.itemName}</span>
                                                                {item.colorName && <Badge variant="outline" className="text-[9px] px-1">{item.colorName}</Badge>}
                                                                {item.sizeName && <Badge variant="outline" className="text-[9px] px-1">{item.sizeName}</Badge>}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center text-muted-foreground">{item.unit}</TableCell>
                                                        <TableCell className="text-center font-mono">{item.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                                        <TableCell className="text-center font-bold text-emerald-500 font-mono">{item.currentStock.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant={item.isLowStock ? 'destructive' : 'secondary'} className="text-[10px]">
                                                                {item.formattedStock}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono font-semibold">
                                                            {item.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {item.isLowStock ? (
                                                                <Badge variant="destructive" className="text-[9px] px-1 py-0">ناقص &le; {item.reorderPoint}</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-[9px] text-emerald-500 border-emerald-500/30 px-1 py-0">طبيعي</Badge>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                )) : (
                                                    <TableRow>
                                                        <TableCell colSpan={15} className="text-center py-10 text-muted-foreground">
                                                            لا توجد أصناف تطابق الفلاتر المحددة.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                            {reportData.length > 0 && (
                                                <TableFooter>
                                                    <TableRow className="bg-muted font-bold text-sm">
                                                        <TableCell colSpan={11}>إجمالي قيمة المخزون العام لكافة الأصناف المعروضة</TableCell>
                                                        <TableCell className="text-center text-emerald-500">{stats.totalStock.toLocaleString()}</TableCell>
                                                        <TableCell></TableCell>
                                                        <TableCell className="text-center font-mono">
                                                            {stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                                                        </TableCell>
                                                        <TableCell></TableCell>
                                                    </TableRow>
                                                </TableFooter>
                                            )}
                                        </Table>
                                    </div>
                                )}

                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <Card className="border shadow-sm">
                        <CardContent className="py-12 text-center text-muted-foreground space-y-2">
                            <Boxes className="h-12 w-12 mx-auto text-muted-foreground/50" />
                            <p className="text-base font-semibold">يرجى تحديد الفلاتر المطلوبة والضغط على زر "عرض تقرير الأرصدة بالمستويات"</p>
                            <p className="text-xs text-muted-foreground">يمكنك تصفية المخزون حسب القسم، الفئة، المجموعة، UDF 1 و UDF 2 مع عرض شجري متكامل وإجماليات كل مستوى.</p>
                        </CardContent>
                    </Card>
                )}

            </main>
        </>
    );
}
