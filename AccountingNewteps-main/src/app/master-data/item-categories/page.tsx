

"use client";

import React, { useState, useMemo, useCallback } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoreHorizontal, PlusCircle, Edit, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { AddEntityDialog } from "@/components/add-entity-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Combobox } from "@/components/ui/combobox";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dictionary } from "@/lib/dictionary";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const d = dictionary.general;

interface CategoryLevel {
    id?: string;
    name: string;
    code?: string;
    sectionId?: string;
    parentCategoryId?: string;
    parentGroupId?: string;
    showOnPos?: boolean;
}

const CategoryLevelForm = ({ item, onSave, onClose, level, allLevels, selectedPath }: {
    item?: Partial<CategoryLevel>;
    onSave: (data: Partial<CategoryLevel>) => Promise<void>;
    onClose: () => void;
    level: number;
    allLevels: {
        itemSections: any[];
        itemCategories: any[];
        itemGroups: any[];
        itemSubCategories1: any[];
        itemSubCategories2: any[];
    };
    selectedPath?: { level1: string; level2: string; level3: string; };
}) => {
    const [name, setName] = useState(item?.name || '');
    const [showOnPos, setShowOnPos] = useState(item?.showOnPos || false);
    const [path, setPath] = useState(() => {
        if (selectedPath) return selectedPath;

        const initialPath = { level1: '', level2: '', level3: '' };
        if (item) {
             if ((item as any).parentGroupId) { // For level 4 (now independent, but let's keep for editing logic if needed)
                const group = allLevels.itemGroups.find(i => i.id === (item as any).parentGroupId);
                const category = group ? allLevels.itemCategories.find(i => i.id === group.parentCategoryId) : null;
                const section = category ? allLevels.itemSections.find(i => i.id === category.sectionId) : null;
                return { level1: section?.id || '', level2: category?.id || '', level3: group?.id || '' };
            } else if (item.parentCategoryId) { // For level 3
                 const category = allLevels.itemCategories.find(i => i.id === item.parentCategoryId);
                 const section = category ? allLevels.itemSections.find(i => i.id === category.sectionId) : null;
                 return { level1: section?.id || '', level2: category?.id || '', level3: '' };
            } else if (item.sectionId) { // For level 2
                 return { level1: item.sectionId, level2: '', level3: '' };
            }
        }
        return initialPath;
    });

    const { toast } = useToast();

    const level1Options = useMemo(() => allLevels.itemSections.map(s => ({ value: s.id, label: s.name })), [allLevels.itemSections]);
    const level2Options = useMemo(() => allLevels.itemCategories.filter(c => c.sectionId === path.level1).map(c => ({ value: c.id, label: c.name })), [allLevels.itemCategories, path.level1]);
    
    const handleSubmit = async () => {
        const trimmedName = name.trim();
        if (!trimmedName || (level > 1 && level < 4 && !path.level1)) {
            toast({ variant: 'destructive', title: d.error, description: "الرجاء إدخال الاسم واختيار التسلسل الصحيح." });
            return;
        }

        // Check for duplicates
        let isDuplicate = false;
        const lowerCaseName = trimmedName.toLowerCase();

        if (level === 1) isDuplicate = allLevels.itemSections.some(i => i.name.toLowerCase() === lowerCaseName && i.id !== item?.id);
        else if (level === 2 && path.level1) isDuplicate = allLevels.itemCategories.some(i => i.sectionId === path.level1 && i.name.toLowerCase() === lowerCaseName && i.id !== item?.id);
        else if (level === 3 && path.level2) isDuplicate = allLevels.itemGroups.some(i => i.parentCategoryId === path.level2 && i.name.toLowerCase() === lowerCaseName && i.id !== item?.id);
        else if (level === 4) isDuplicate = allLevels.itemSubCategories1.some(i => i.name.toLowerCase() === lowerCaseName && i.id !== item?.id);
        else if (level === 5) isDuplicate = (allLevels as any).itemSubCategories2.some((i: any) => i.name.toLowerCase() === lowerCaseName && i.id !== item?.id);
        
        if (isDuplicate) {
            toast({ variant: 'destructive', title: 'اسم مكرر', description: `هذا الاسم مستخدم بالفعل في هذا المستوى.` });
            return;
        }
        
        const parentIdKeys: Record<number, string> = { 2: 'sectionId', 3: 'parentCategoryId' };
        const parentPathValues: Record<number, string> = { 2: path.level1, 3: path.level2 };

        const parentKey = parentIdKeys[level];
        const parentId = parentPathValues[level];

        const data: Partial<CategoryLevel> = { name: trimmedName };
        if (parentKey && parentId) {
            (data as any)[parentKey] = parentId;
        }
        
        if (level === 2 || level === 3) {
            data.showOnPos = showOnPos;
        }
        
        await onSave({ ...item, ...data });
        onClose();
    };

    return (
        <div className="space-y-4">
            {level > 1 && level < 4 && (
                <div className="space-y-3 p-3 border rounded-md bg-muted/50">
                    <Label className="font-semibold">اختر التسلسل</Label>
                    <Combobox options={level1Options} value={path.level1} onValueChange={v => setPath({ level1: v, level2: '', level3: '' })} placeholder="اختر الفئة (مستوى 1)..." emptyMessage="لا يوجد."/>
                    {level > 2 && <Combobox options={level2Options} value={path.level2} onValueChange={v => setPath(p => ({ ...p, level2: v, level3: '' }))} placeholder="اختر القسم (مستوى 2)..." emptyMessage="اختر فئة أولاً." disabled={!path.level1}/>}
                </div>
            )}
            <div className="space-y-2">
                <Label htmlFor="item-name">اسم العنصر الجديد</Label>
                <Input id="item-name" value={name} onChange={e => setName(e.target.value)} />
            </div>
             {(level === 2 || level === 3) && (
                <div className="flex items-center space-x-2 rtl:space-x-reverse pt-2">
                    <Checkbox id="show-on-pos" checked={showOnPos} onCheckedChange={(checked) => setShowOnPos(!!checked)} />
                    <Label htmlFor="show-on-pos">إظهار في شاشة الكاشير</Label>
                </div>
            )}
            <div className="flex justify-end pt-4">
                <Button onClick={handleSubmit}>{d.save}</Button>
            </div>
        </div>
    );
};


export default function ItemClassificationPage() {
    const { 
        items: allItems,
        itemSections, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2, 
        loading, dbAction, getNextId
    } = useData();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("level1");
    const [filters, setFilters] = useState({
        level1: '', // sectionId
        level2: '', // categoryId
        level3: '', // groupId
        level4: '', // subCategory1Id
    });

    const allLevels = useMemo(() => ({
        itemSections: itemSections || [], itemCategories: itemCategories || [],
        itemGroups: itemGroups || [], itemSubCategories1: itemSubCategories1 || [],
        itemSubCategories2: itemSubCategories2 || [],
    }), [itemSections, itemCategories, itemGroups, itemSubCategories1, itemSubCategories2]);

    const { sectionMap, categoryMap, groupMap } = useMemo(() => {
        const sectionMap = new Map(allLevels.itemSections.map((i: any) => [i.id, i]));
        const categoryMap = new Map(allLevels.itemCategories.map((i: any) => [i.id, i]));
        const groupMap = new Map(allLevels.itemGroups.map((i: any) => [i.id, i]));
        return { sectionMap, categoryMap, groupMap };
    }, [allLevels]);

    const handleFilterChange = (level: keyof typeof filters, value: string) => {
        setFilters(prev => {
            const newFilters = { ...prev, [level]: value };
            if (level === 'level1') newFilters.level2 = newFilters.level3 = newFilters.level4 = '';
            if (level === 'level2') newFilters.level3 = newFilters.level4 = '';
            if (level === 'level3') newFilters.level4 = '';
            return newFilters;
        });
    };

    const handleRowClick = (item: any, level: number) => {
        if (level < 5) { // Can't drill down from level 5
            handleFilterChange(`level${level}` as keyof typeof filters, item.id);
            setActiveTab(`level${level + 1}`);
        }
    };
    
    const handleSave = async (dbActionPath: string, data: Partial<CategoryLevel>) => {
        try {
            const { id, ...dataToSave } = data;
            
            let newCodeData: { code?: string } = {};
            if (!id) {
                let siblings: any[] = [];
                let parentCode = '';
                
                const getNextCodePart = (s: any[]) => {
                    if(s.length === 0) return 1;
                    const codes = s.map((i: any) => {
                        const parts = String(i.code || '0').split('-');
                        const num = parseInt(parts[parts.length - 1] || '0', 10);
                        return isNaN(num) ? 0 : num;
                    });
                    return Math.max(...codes) + 1;
                }

                if (dbActionPath === "itemSections") {
                    siblings = allLevels.itemSections;
                    const codes = siblings.map(i => parseInt(i.code || '0', 10)).filter(n => !isNaN(n));
                    const currentMax = (codes.length > 0 ? Math.max(...codes) : 0) + 1;
                    
                    const nextNum = await getNextId('itemSectionCode', currentMax);
                    if (nextNum) newCodeData.code = String(nextNum).padStart(2, '0');
                } else if (dbActionPath === "itemCategories" && (dataToSave as any).sectionId) {
                    const sectionId = (dataToSave as any).sectionId;
                    siblings = allLevels.itemCategories.filter(c => c.sectionId === sectionId);
                    parentCode = allLevels.itemSections.find(s => s.id === sectionId)?.code || '00';
                    const currentMax = getNextCodePart(siblings);
                    
                    const nextNum = await getNextId(`itemCategoryCode_${sectionId}`, currentMax);
                    if (nextNum) newCodeData.code = `${parentCode}-${nextNum}`;
                } else if (dbActionPath === "itemGroups" && (dataToSave as any).parentCategoryId) {
                    const categoryId = (dataToSave as any).parentCategoryId;
                    siblings = allLevels.itemGroups.filter(g => g.parentCategoryId === categoryId);
                    parentCode = allLevels.itemCategories.find(c => c.id === categoryId)?.code || '00-0';
                    const currentMax = getNextCodePart(siblings);
                    
                    const nextNum = await getNextId(`itemGroupCode_${categoryId}`, currentMax);
                    if (nextNum) newCodeData.code = `${parentCode}-${nextNum}`;
                }
            }
            
            const finalData = { ...dataToSave, ...newCodeData };
            
            if (id) {
                await dbAction(dbActionPath, 'update', { id, data: dataToSave });
            } else {
                await dbAction(dbActionPath, 'add', finalData);
            }
            toast({ title: 'تم الحفظ بنجاح' });
        } catch (e) {
            console.error(`Failed to save to ${dbActionPath}:`, e);
            toast({ variant: "destructive", title: "خطأ", description: `فشل حفظ العنصر.` });
        }
    };
    
    const handleDelete = async (dbActionPath: string, id: string) => {
        await dbAction(dbActionPath, 'remove', {id});
        toast({ title: 'تم الحذف' });
    }
    
    const dbPaths: Record<number, string> = { 1: "itemSections", 2: "itemCategories", 3: "itemGroups", 4: "itemSubCategories1", 5: "itemSubCategories2" };

    const renderTable = (config: any) => {
        let filteredData = config.items;
        if (filters.level3 && config.level > 3) {
            filteredData = filteredData.filter((i: any) => i.parentGroupId === filters.level3);
        } else if (filters.level2 && config.level > 2) {
            filteredData = filteredData.filter((i: any) => i.parentCategoryId === filters.level2);
        } else if (filters.level1 && config.level > 1) {
            filteredData = filteredData.filter((i: any) => i.sectionId === filters.level1);
        }
        
        const headersToShow = config.headers;

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="text-center">{d.code}</TableHead>
                        <TableHead className="text-center">{d.name}</TableHead>
                        {headersToShow.map((h: any) => <TableHead className="text-center" key={h.key}>{h.label}</TableHead>)}
                        {config.level < 4 && <TableHead className="text-center">{config.childCountLabel}</TableHead>}
                        <TableHead className="text-center">عدد الأصناف</TableHead>
                        {(config.level === 2 || config.level === 3) && <TableHead className="text-center">عرض بالكاشير</TableHead>}
                        <TableHead className="text-center w-[100px]">{d.actions}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredData.map((item: any) => {
                        const itemCount = allItems.filter((i: any) => i[config.filterKey] === item.id).length;
                        
                        return (
                            <TableRow key={item.id} onClick={() => handleRowClick(item, config.level)} className={config.level < 5 ? "cursor-pointer" : ""}>
                               <TableCell className="font-mono text-center">{item.code || 'N/A'}</TableCell>
                               <TableCell className="font-semibold text-center">{item.name}</TableCell>
                               {headersToShow.map((h: any) => {
                                   let parentName = '';
                                   if (h.key === 'level1') {
                                       const category = categoryMap.get(item.parentCategoryId);
                                       if(category) parentName = sectionMap.get(category.sectionId)?.name;
                                       else parentName = sectionMap.get(item.sectionId)?.name; // For Level 2 items
                                   }
                                   if (h.key === 'level2') {
                                       parentName = categoryMap.get(item.parentCategoryId)?.name;
                                   }
                                   return <TableCell className="text-center" key={h.key}>{parentName}</TableCell>
                               })}
                                {config.level < 4 && <TableCell className="text-center"><Badge variant="secondary">{config.getChildCount(item)}</Badge></TableCell>}
                                <TableCell className="text-center">{itemCount}</TableCell>
                                {(config.level === 2 || config.level === 3) && (
                                    <TableCell className="text-center">
                                        <Checkbox
                                            checked={item.showOnPos}
                                            onCheckedChange={(checked) => handleSave(config.dbActionPath, { ...item, showOnPos: !!checked })}
                                            onClick={e => e.stopPropagation()} // Prevent row click
                                        />
                                    </TableCell>
                                )}
                                <TableCell className="text-center">
                                    <AlertDialog>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button aria-haspopup="true" size="icon" variant="ghost" onClick={e => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <AddEntityDialog title={`تعديل ${config.title}`} description="" triggerButton={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><Edit className="ml-2 h-4 w-4" /> {d.edit}</DropdownMenuItem>}>
                                                    {({ onClose }) => <CategoryLevelForm item={item} onSave={(data) => handleSave(config.dbActionPath, data)} onClose={onClose} level={config.level} allLevels={allLevels} />}
                                                </AddEntityDialog>
                                                <AlertDialogTrigger asChild><DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}><Trash2 className="ml-2 h-4 w-4" /> {d.delete}</DropdownMenuItem></AlertDialogTrigger>
                                            </DropdownMenuContent>
                                            <AlertDialogContent>
                                                <AlertDialogHeader><AlertDialogTitle>{d.confirmDeleteTitle}</AlertDialogTitle><AlertDialogDescription>{d.confirmDeleteDescription}</AlertDialogDescription></AlertDialogHeader>
                                                <AlertDialogFooter><AlertDialogCancel>{d.cancel}</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(config.dbActionPath, item.id)}>{d.continue}</AlertDialogAction></AlertDialogFooter>
                                            </AlertDialogContent>
                                        </DropdownMenu>
                                    </AlertDialog>
                                </TableCell>
                            </TableRow>
                        )
                    })}
                    {filteredData.length === 0 && (
                        <TableRow><TableCell colSpan={headersToShow.length + 8} className="text-center py-10 text-muted-foreground">لا توجد بيانات.</TableCell></TableRow>
                    )}
                </TableBody>
            </Table>
        );
    };
    
    const levelsConfig = [
        { level: 1, filterKey: 'sectionId', title: dictionary.pages.itemClassifications.level1Title, description: dictionary.pages.itemClassifications.level1Desc, dbActionPath: "itemSections", items: allLevels.itemSections, headers: [], childCountLabel: 'عدد الأقسام', getChildCount: (item: any) => allLevels.itemCategories.filter((c: any) => c.sectionId === item.id).length },
        { level: 2, filterKey: 'categoryId', title: dictionary.pages.itemClassifications.level2Title, description: dictionary.pages.itemClassifications.level2Desc, dbActionPath: "itemCategories", items: allLevels.itemCategories, headers: [{ key: 'level1', label: dictionary.pages.itemClassifications.level1Title }], childCountLabel: 'عدد المجموعات', getChildCount: (item: any) => allLevels.itemGroups.filter((g: any) => g.parentCategoryId === item.id).length },
        { level: 3, filterKey: 'itemGroupId', title: dictionary.pages.itemClassifications.level3Title, description: dictionary.pages.itemClassifications.level3Desc, dbActionPath: "itemGroups", items: allLevels.itemGroups, headers: [{ key: 'level1', label: dictionary.pages.itemClassifications.level1Title }, { key: 'level2', label: dictionary.pages.itemClassifications.level2Title }], childCountLabel: 'عدد م. فرعية 1', getChildCount: (item: any) => allLevels.itemSubCategories1.filter((s: any) => s.parentGroupId === item.id).length },
        { level: 4, filterKey: 'subCategoryId1', title: dictionary.pages.itemClassifications.level4Title, description: dictionary.pages.itemClassifications.level4Desc, dbActionPath: "itemSubCategories1", items: allLevels.itemSubCategories1, headers: [], childCountLabel: '', getChildCount: () => 0 },
        { level: 5, filterKey: 'subCategoryId2', title: dictionary.pages.itemClassifications.level5Title, description: dictionary.pages.itemClassifications.level5Desc, dbActionPath: "itemSubCategories2", items: allLevels.itemSubCategories2, headers: [], childCountLabel: '', getChildCount: () => 0 },
    ];
    
    
    const FilterBar = ({level}: {level: number}) => {
        const level1Options = useMemo(() => [{ value: '', label: 'الكل' }, ...allLevels.itemSections.map(s => ({ value: s.id, label: s.name }))], [allLevels.itemSections]);
        const level2Options = useMemo(() => [{ value: '', label: 'الكل' }, ...allLevels.itemCategories.filter(c => c.sectionId === filters.level1).map(c => ({ value: c.id, label: c.name }))], [allLevels.itemCategories, filters.level1]);
        const level3Options = useMemo(() => [{ value: '', label: 'الكل' }, ...allLevels.itemGroups.filter(g => g.parentCategoryId === filters.level2).map(g => ({ value: g.id, label: g.name }))], [allLevels.itemGroups, filters.level2]);
        
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                 {level >= 2 && <div className="space-y-1"><Label className="text-xs">الفئة</Label><Combobox options={level1Options} value={filters.level1} onValueChange={v => handleFilterChange('level1', v)} placeholder="الكل" emptyMessage="لا يوجد."/></div>}
                 {level >= 3 && <div className="space-y-1"><Label className="text-xs">القسم</Label><Combobox options={level2Options} value={filters.level2} onValueChange={v => handleFilterChange('level2', v)} placeholder="الكل" emptyMessage="اختر فئة أولاً." disabled={!filters.level1}/></div>}
                 {level >= 4 && <div className="space-y-1"><Label className="text-xs">المجموعة</Label><Combobox options={level3Options} value={filters.level3} onValueChange={v => handleFilterChange('level3', v)} placeholder="الكل" emptyMessage="اختر قسماً أولاً." disabled={!filters.level2}/></div>}
            </div>
        )
    };


    if (loading) {
        return <div className="flex h-full w-full justify-center items-center"><Loader2 className="h-8 w-8 animate-spin"/></div>
    }

    return (
        <>
            <PageHeader title={dictionary.pages.itemClassifications.title} />
            <main className="flex-1 p-4 md:p-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
                        {levelsConfig.map(config => (
                            <TabsTrigger key={config.level} value={`level${config.level}`}>{config.title}</TabsTrigger>
                        ))}
                    </TabsList>
                    {levelsConfig.map(config => (
                        <TabsContent key={config.level} value={`level${config.level}`}>
                             <Card>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle>{config.title}</CardTitle>
                                            <CardDescription>{config.description}</CardDescription>
                                        </div>
                                         <AddEntityDialog
                                            title={`إضافة ${config.title}`}
                                            description=""
                                            triggerButton={<Button size="sm"><PlusCircle className="ml-2 h-4 w-4"/>إضافة</Button>}
                                        >
                                           {({ onClose }) => (
                                                <CategoryLevelForm 
                                                    onSave={(data) => handleSave(dbPaths[config.level], data)}
                                                    onClose={onClose}
                                                    level={config.level}
                                                    allLevels={allLevels}
                                                    selectedPath={filters}
                                                />
                                            )}
                                        </AddEntityDialog>
                                    </div>
                                    {config.level > 1 && config.level < 4 && (
                                     <div className="pt-4">
                                        <FilterBar level={config.level} />
                                    </div>
                                    )}
                                </CardHeader>
                                <CardContent>
                                    <div className="w-full overflow-auto border rounded-lg">
                                        {renderTable(config)}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    ))}
                </Tabs>
            </main>
        </>
    )
}
