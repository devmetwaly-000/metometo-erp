

"use client";

import React, { useMemo, useState, useEffect, useCallback } from 'react';
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
import { Loader2, Printer, Download, Component, Search } from "lucide-react";
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
import { calculateStockForItemInWarehouse } from '@/lib/inventory-utils';

// Data Interfaces
interface Item { 
    id: string; 
    name: string; 
    unit: string; 
    baseUnit?: string; 
    price: number; 
    cost?: number; 
    reorderPoint?: number; 
    code?: string; 
    itemType?: 'standard' | 'raw_material' | 'manufactured'; 
    components?: { itemId: string; quantity: number }[];
    secondaryUnits?: { name: string; conversionFactor: number; }[];
    sectionId?: string;
    categoryId?: string;
    itemGroupId?: string;
    subCategoryId1?: string;
    subCategoryId2?: string;
}
interface Warehouse { id: string; name: string; }


export default function StockStatusPage() {
    const router = useRouter(); 
    const [filters, setFilters] = useState({
        warehouseId: "all",
        searchTerm: "",
        itemType: 'all',
        sectionId: 'all',
        categoryId: 'all',
        itemGroupId: 'all',
        subCategoryId1: 'all',
        subCategoryId2: 'all',
    });
    const [reportData, setReportData] = useState<any[] | null>(null);

    const allDataContext = useData();
    const { 
        items: allItems, 
        warehouses,
        inventoryZones,
        itemSections,
        itemCategories,
        itemGroups,
        itemSubCategories1,
        itemSubCategories2,
        loading,
    } = allDataContext;

    const handleFilterChange = (key: keyof typeof filters, value: string | boolean) => {
        const newFilters = { ...filters, [key]: value };
        // Reset child filters when a parent filter changes
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
        ...allWarehouses.map((w:Warehouse) => ({ value: w.id, label: w.name }))
    ]), [allWarehouses]);
    
    const calculateManufacturableStock = useCallback((item: Item, warehouseId: string, allData: any): number => {
        if (!item.components || item.components.length === 0) {
            return 0; // Not a manufacturable item
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

    // Filter options for categories
    const sectionOptions = useMemo(() => ([{value: 'all', label: 'الكل'}, ...(itemSections || []).map((s:any) => ({value: s.id, label: s.name}))]), [itemSections]);
    const categoryOptions = useMemo(() => {
        const filtered = (itemCategories || []).filter((c:any) => filters.sectionId === 'all' || c.sectionId === filters.sectionId);
        return [{value: 'all', label: 'الكل'}, ...filtered.map((c:any) => ({value: c.id, label: c.name}))]
    }, [itemCategories, filters.sectionId]);
    const groupOptions = useMemo(() => {
        const filtered = (itemGroups || []).filter((g:any) => filters.categoryId === 'all' || g.parentCategoryId === filters.categoryId);
        return [{value: 'all', label: 'الكل'}, ...filtered.map((g:any) => ({value: g.id, label: g.name}))]
    }, [itemGroups, filters.categoryId]);
    const subCategory1Options = useMemo(() => ([{value: 'all', label: 'الكل'}, ...(itemSubCategories1 || []).map((s:any) => ({value: s.id, label: s.name}))]), [itemSubCategories1]);
    const subCategory2Options = useMemo(() => ([{value: 'all', label: 'الكل'}, ...(itemSubCategories2 || []).map((s:any) => ({value: s.id, label: s.name}))]), [itemSubCategories2]);


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
    
    const handleGenerateReport = () => {
         if (loading) return;

        let itemsToProcess: Item[] = allItems;
        
        const filterFunctions = [
            (item: Item) => !filters.searchTerm || item.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) || (item.code && item.code.toLowerCase().includes(filters.searchTerm.toLowerCase())),
            (item: Item) => filters.itemType === 'all' || item.itemType === filters.itemType,
            (item: Item) => filters.sectionId === 'all' || item.sectionId === filters.sectionId,
            (item: Item) => filters.categoryId === 'all' || item.categoryId === filters.categoryId,
            (item: Item) => filters.itemGroupId === 'all' || item.itemGroupId === filters.itemGroupId,
            (item: Item) => filters.subCategoryId1 === 'all' || item.subCategoryId1 === filters.subCategoryId1,
            (item: Item) => filters.subCategoryId2 === 'all' || item.subCategoryId2 === filters.subCategoryId2,
        ];

        itemsToProcess = itemsToProcess.filter(item => filterFunctions.every(fn => fn(item as any)));

        const warehousesToProcess = filters.warehouseId === 'all' ? allWarehouses : allWarehouses.filter(w => w.id === filters.warehouseId);

        const data: any[] = [];
        
        warehousesToProcess.forEach(warehouse => {
            itemsToProcess.forEach(itemMaster => {
                const isManufactured = itemMaster.itemType === 'manufactured';
                const currentStock = isManufactured ? calculateManufacturableStock(itemMaster, warehouse.id, allDataContext) : calculateStockForItemInWarehouse(itemMaster.id, warehouse.id, allDataContext);

                if (currentStock === 0) return;
                
                data.push({
                    id: `${warehouse.id}-${itemMaster.id}`,
                    warehouseId: warehouse.id,
                    itemId: itemMaster.id,
                    warehouseName: warehouse.name,
                    itemCode: itemMaster.code,
                    itemName: itemMaster.name,
                    unit: itemMaster.baseUnit || itemMaster.unit,
                    cost: itemMaster.cost || 0,
                    currentStock: currentStock,
                    formattedStock: formatStockDisplay(currentStock, itemMaster),
                    totalValue: currentStock * (itemMaster.cost || 0),
                    reorderPoint: itemMaster.reorderPoint || 0,
                    isCalculatedStock: isManufactured,
                });
            });
        });
        
        setReportData(data);
    }


    const handlePrint = () => {
      window.print();
    }
    
    const handleExportExcel = () => {
        if (!reportData) return;

        const dataForExport = reportData.map(item => ({
            'المخزن': item.warehouseName,
            'الباتش': item.batchNumber || '',
            'كود الصنف': item.itemCode,
            'اسم الصنف': item.itemName,
            'الرصيد المجمع': item.formattedStock,
            'الرصيد (الوحدة الأساسية)': item.currentStock,
            'التكلفة': item.cost,
            'القيمة الإجمالية': item.totalValue,
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataForExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Status");
        XLSX.writeFile(workbook, `StockStatus_${new Date().toISOString().split('T')[0]}.xlsx`);
    };
    
    const grandTotalValue = useMemo(() => {
        if (!reportData) return 0;
        return reportData.reduce((sum, item) => sum + item.totalValue, 0);
    }, [reportData]);

  return (
    <>
      <PageHeader title="أرصدة الفروع والمخازن" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card className="no-print">
            <CardHeader>
                <CardTitle>فلاتر البحث</CardTitle>
            </CardHeader>
            <CardContent>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 items-end">
                     <div className="space-y-2">
                        <Label>المخزن/الفرع</Label>
                         <Combobox
                          options={warehouseOptions}
                          value={filters.warehouseId}
                          onValueChange={(v) => handleFilterChange("warehouseId", v)}
                          placeholder="كل الفروع والمخازن"
                          emptyMessage="لم يتم العثور على فرع."
                        />
                    </div>
                     <div className="space-y-2">
                        <Label>بحث بالاسم أو الباركود</Label>
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="ابحث..."
                                className="pr-9"
                                value={filters.searchTerm}
                                onChange={e => handleFilterChange('searchTerm', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>الفئة (م1)</Label>
                        <Combobox options={sectionOptions} value={filters.sectionId} onValueChange={(v) => handleFilterChange('sectionId', v)} placeholder="الكل" emptyMessage="لا يوجد"/>
                    </div>
                     <div className="space-y-2">
                        <Label>القسم (م2)</Label>
                        <Combobox options={categoryOptions} value={filters.categoryId} onValueChange={(v) => handleFilterChange('categoryId', v)} placeholder="الكل" emptyMessage="اختر فئة أولاً" disabled={filters.sectionId === 'all'}/>
                    </div>
                    <div className="space-y-2">
                        <Label>المجموعة (م3)</Label>
                        <Combobox options={groupOptions} value={filters.itemGroupId} onValueChange={(v) => handleFilterChange('itemGroupId', v)} placeholder="الكل" emptyMessage="اختر قسماً أولاً" disabled={filters.categoryId === 'all'}/>
                    </div>
                     <div className="space-y-2">
                        <Label>م. فرعية 1 (UDF)</Label>
                        <Combobox options={subCategory1Options} value={filters.subCategoryId1} onValueChange={(v) => handleFilterChange('subCategoryId1', v)} placeholder="الكل" emptyMessage="لا يوجد"/>
                    </div>
                     <div className="space-y-2">
                        <Label>م. فرعية 2 (UDF)</Label>
                        <Combobox options={subCategory2Options} value={filters.subCategoryId2} onValueChange={(v) => handleFilterChange('subCategoryId2', v)} placeholder="الكل" emptyMessage="لا يوجد" />
                    </div>
                    <div className="space-y-2">
                        <Label>نوع الصنف</Label>
                        <Select value={filters.itemType} onValueChange={(v) => handleFilterChange("itemType", v)}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">كل الأنواع</SelectItem>
                                <SelectItem value="standard">منتجات عادية</SelectItem>
                                <SelectItem value="raw_material">مواد خام</SelectItem>
                                <SelectItem value="manufactured">منتجات مصنعة</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                 <Button className="w-full sm:w-auto" onClick={handleGenerateReport} disabled={loading}>
                    {loading ? <Loader2 className="animate-spin" /> : "عرض التقرير"}
                </Button>
            </CardFooter>
        </Card>

        {reportData ? (
            <Card className="printable-area">
              <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>تقرير الأرصدة</CardTitle>
                    <CardDescription>
                      عرض تفصيلي لأرصدة الأصناف في الفروع والمخازن المحددة.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 no-print">
                     <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!reportData || reportData.length === 0}>
                        <Download className="ml-2 h-4 w-4" />
                        تصدير إلى Excel
                     </Button>
                     <Button variant="outline" size="icon" onClick={handlePrint}>
                        <Printer className="h-4 w-4" />
                     </Button>
                  </div>
              </CardHeader>
              <CardContent>
                    <div className="w-full overflow-auto border rounded-lg">
                        <TooltipProvider>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>المخزن/الفرع</TableHead>
                                    <TableHead>الباركود</TableHead>
                                    <TableHead>الصنف</TableHead>
                                    <TableHead className="text-center">التكلفة</TableHead>
                                    <TableHead className="text-center">الرصيد ({reportData[0]?.unit || 'وحدة'})</TableHead>
                                    <TableHead className="text-center">الرصيد المجمع</TableHead>
                                    <TableHead className="text-center">إجمالي القيمة</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportData.length > 0 ? reportData.map((item) => (
                                <TableRow 
                                    key={item.id} 
                                    onClick={() => router.push(`/reports/item-ledger?itemId=${item.itemId}&warehouseId=${item.warehouseId}`)}
                                    className="cursor-pointer hover:bg-muted"
                                >
                                    <TableCell>{item.warehouseName}</TableCell>
                                    <TableCell className="font-mono text-xs">{item.itemCode}</TableCell>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            {item.isCalculatedStock && 
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Component className="h-4 w-4 text-blue-500"/>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>رصيد محسوب بناءً على المكونات المتاحة</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            }
                                            {item.itemName}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">{item.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-center font-bold text-muted-foreground">{item.currentStock.toLocaleString()}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={item.currentStock <= item.reorderPoint && item.reorderPoint > 0 ? 'destructive' : 'default'} className="text-sm">
                                            {item.formattedStock}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center font-semibold">
                                        {item.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                            لا توجد بيانات تطابق الفلاتر المحددة.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                            {reportData.length > 0 && (
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={6} className="font-bold text-base">إجمالي قيمة المخزون</TableCell>
                                        <TableCell className="text-center font-bold text-base">
                                            {grandTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                        </TooltipProvider>
                    </div>
              </CardContent>
            </Card>
        ) : (
             <Card>
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">يرجى تحديد الفلاتر والضغط على "عرض التقرير" لعرض البيانات.</p>
                </CardContent>
             </Card>
        )}
      </main>
    </>
  );
}
