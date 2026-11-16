"use client";

import React, { useState, useMemo } from 'react';
import PageHeader from "@/components/page-header";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  FolderTree, Search, ChevronRight, ChevronDown, 
  ExternalLink, ArrowUpRight, ArrowDownLeft, BookOpen, 
  Maximize2, Minimize2, Info
} from "lucide-react";
import { CHART_OF_ACCOUNTS, AccountNode } from "@/lib/chart-of-accounts";
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";

export default function ChartOfAccountsPage() {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedType, setSelectedType] = useState<string>("all");
    const [selectedLevel, setSelectedLevel] = useState<number | "all">("all");
    const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
    const [activeAccountModal, setActiveAccountModal] = useState<AccountNode | null>(null);

    const toggleCollapse = (code: string) => {
        setCollapsedNodes(prev => ({ ...prev, [code]: !prev[code] }));
    };

    const expandAll = () => {
        setCollapsedNodes({});
    };

    const collapseAll = () => {
        const allParents: Record<string, boolean> = {};
        CHART_OF_ACCOUNTS.forEach(a => {
            if (CHART_OF_ACCOUNTS.some(child => child.parentCode === a.code)) {
                allParents[a.code] = true;
            }
        });
        setCollapsedNodes(allParents);
    };

    const typeBadges: Record<string, { label: string; className: string }> = {
        asset: { label: 'أصول', className: 'text-foreground border-border bg-muted/40 font-semibold' },
        liability: { label: 'التزامات', className: 'text-foreground border-border bg-muted/40 font-semibold' },
        equity: { label: 'حقوق ملكية', className: 'text-foreground border-border bg-muted/40 font-semibold' },
        revenue: { label: 'إيرادات', className: 'text-foreground border-border bg-muted/40 font-semibold' },
        expense: { label: 'مصروفات', className: 'text-foreground border-border bg-muted/40 font-semibold' },
    };

    const stats = useMemo(() => {
        return {
            totalAccounts: CHART_OF_ACCOUNTS.length,
            assetsCount: CHART_OF_ACCOUNTS.filter(a => a.type === 'asset').length,
            liabilitiesCount: CHART_OF_ACCOUNTS.filter(a => a.type === 'liability').length,
            equityCount: CHART_OF_ACCOUNTS.filter(a => a.type === 'equity').length,
            revenuesCount: CHART_OF_ACCOUNTS.filter(a => a.type === 'revenue').length,
            expensesCount: CHART_OF_ACCOUNTS.filter(a => a.type === 'expense').length,
        };
    }, []);

    // Check if an account should be hidden because one of its ancestors is collapsed
    const isNodeHidden = (acc: AccountNode): boolean => {
        if (searchTerm.trim() !== '') return false; // Always show matching results during active search
        let currentParent = acc.parentCode;
        while (currentParent) {
            if (collapsedNodes[currentParent]) return true;
            const parentNode = CHART_OF_ACCOUNTS.find(a => a.code === currentParent);
            currentParent = parentNode?.parentCode;
        }
        return false;
    };

    const filteredAccounts = useMemo(() => {
        return CHART_OF_ACCOUNTS.filter(acc => {
            const matchesSearch = searchTerm.trim() === "" || 
                acc.code.includes(searchTerm.trim()) || 
                acc.name.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
                (acc.description && acc.description.toLowerCase().includes(searchTerm.trim().toLowerCase()));
            
            const matchesType = selectedType === "all" || acc.type === selectedType;
            const matchesLevel = selectedLevel === "all" || acc.level === selectedLevel;

            return matchesSearch && matchesType && matchesLevel;
        });
    }, [searchTerm, selectedType, selectedLevel]);

    const visibleAccounts = useMemo(() => {
        return filteredAccounts.filter(acc => !isNodeHidden(acc));
    }, [filteredAccounts, collapsedNodes, searchTerm]);

    return (
        <>
            <PageHeader title="دليل الحسابات (شجرة الحسابات)" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                
                {/* Stats Overview */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Card 
                        className={cn("cursor-pointer transition-all border-border", selectedType === 'asset' && 'ring-2 ring-primary border-primary')}
                        onClick={() => setSelectedType(selectedType === 'asset' ? 'all' : 'asset')}
                    >
                        <CardContent className="p-4">
                            <span className="text-xs text-muted-foreground font-semibold">1. الأصول (Assets)</span>
                            <div className="text-2xl font-black mt-1 text-foreground">{stats.assetsCount} حساب</div>
                        </CardContent>
                    </Card>

                    <Card 
                        className={cn("cursor-pointer transition-all border-border", selectedType === 'liability' && 'ring-2 ring-primary border-primary')}
                        onClick={() => setSelectedType(selectedType === 'liability' ? 'all' : 'liability')}
                    >
                        <CardContent className="p-4">
                            <span className="text-xs text-muted-foreground font-semibold">2. الالتزامات (Liabilities)</span>
                            <div className="text-2xl font-black mt-1 text-foreground">{stats.liabilitiesCount} حساب</div>
                        </CardContent>
                    </Card>

                    <Card 
                        className={cn("cursor-pointer transition-all border-border", selectedType === 'equity' && 'ring-2 ring-primary border-primary')}
                        onClick={() => setSelectedType(selectedType === 'equity' ? 'all' : 'equity')}
                    >
                        <CardContent className="p-4">
                            <span className="text-xs text-muted-foreground font-semibold">3. حقوق الملكية (Equity)</span>
                            <div className="text-2xl font-black mt-1 text-foreground">{stats.equityCount} حساب</div>
                        </CardContent>
                    </Card>

                    <Card 
                        className={cn("cursor-pointer transition-all border-border", selectedType === 'revenue' && 'ring-2 ring-primary border-primary')}
                        onClick={() => setSelectedType(selectedType === 'revenue' ? 'all' : 'revenue')}
                    >
                        <CardContent className="p-4">
                            <span className="text-xs text-muted-foreground font-semibold">4. الإيرادات (Revenues)</span>
                            <div className="text-2xl font-black mt-1 text-foreground">{stats.revenuesCount} حساب</div>
                        </CardContent>
                    </Card>

                    <Card 
                        className={cn("cursor-pointer transition-all border-border", selectedType === 'expense' && 'ring-2 ring-primary border-primary')}
                        onClick={() => setSelectedType(selectedType === 'expense' ? 'all' : 'expense')}
                    >
                        <CardContent className="p-4">
                            <span className="text-xs text-muted-foreground font-semibold">5. المصروفات (Expenses)</span>
                            <div className="text-2xl font-black mt-1 text-foreground">{stats.expensesCount} حساب</div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <FolderTree className="h-5 w-5 text-muted-foreground" />
                                    شجرة الحسابات المحاسبية المعتمدة
                                </CardTitle>
                                <CardDescription>
                                    دليل محاسبي قياسي موحد وفق معايير المحاسبة يربط جميع القيود والقوائم المالية آلياً.
                                </CardDescription>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                <div className="relative w-full md:w-64">
                                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        placeholder="بحث برقم الحساب أو الاسم..." 
                                        value={searchTerm} 
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="pr-9"
                                    />
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={expandAll}
                                    className="gap-1 text-xs"
                                    title="توسيع كافة فروع الشجرة"
                                >
                                    <Maximize2 className="h-3.5 w-3.5" />
                                    توسيع الكل
                                </Button>
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={collapseAll}
                                    className="gap-1 text-xs"
                                    title="طي كافة فروع الشجرة"
                                >
                                    <Minimize2 className="h-3.5 w-3.5" />
                                    طي الكل
                                </Button>
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => router.push('/accounting/journal')}
                                    className="gap-1 text-xs"
                                >
                                    <BookOpen className="h-3.5 w-3.5" />
                                    دفتر اليومية
                                </Button>
                            </div>
                        </div>

                        {/* Level and Type quick filters */}
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t mt-2 text-xs">
                            <span className="text-muted-foreground font-semibold">المستوى:</span>
                            <Button 
                                variant={selectedLevel === 'all' ? 'secondary' : 'ghost'} 
                                size="sm" 
                                className="h-7 px-2.5 text-xs"
                                onClick={() => setSelectedLevel('all')}
                            >
                                كافة المستويات
                            </Button>
                            <Button 
                                variant={selectedLevel === 1 ? 'secondary' : 'ghost'} 
                                size="sm" 
                                className="h-7 px-2.5 text-xs"
                                onClick={() => setSelectedLevel(1)}
                            >
                                المستوى 1 (رئيسي)
                            </Button>
                            <Button 
                                variant={selectedLevel === 2 ? 'secondary' : 'ghost'} 
                                size="sm" 
                                className="h-7 px-2.5 text-xs"
                                onClick={() => setSelectedLevel(2)}
                            >
                                المستوى 2 (مساعد)
                            </Button>
                            <Button 
                                variant={selectedLevel === 3 ? 'secondary' : 'ghost'} 
                                size="sm" 
                                className="h-7 px-2.5 text-xs"
                                onClick={() => setSelectedLevel(3)}
                            >
                                المستوى 3 (فرعي / تحليلي)
                            </Button>
                            
                            {selectedType !== 'all' && (
                                <Badge 
                                    variant="outline" 
                                    className="cursor-pointer ml-auto text-xs" 
                                    onClick={() => setSelectedType('all')}
                                >
                                    إلغاء تصفية النوع ({typeBadges[selectedType]?.label}) ✕
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full overflow-auto border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40 font-bold">
                                        <TableHead className="w-32">كود الحساب</TableHead>
                                        <TableHead>اسم الحساب المحاسبي</TableHead>
                                        <TableHead className="w-28 text-center">المستوى</TableHead>
                                        <TableHead className="w-32 text-center">النوع</TableHead>
                                        <TableHead className="w-32 text-center">الطبيعة</TableHead>
                                        <TableHead className="w-28 text-center">حساب الأستاذ</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {visibleAccounts.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                                لا توجد حسابات مطابقة لمعايير البحث الحالية.
                                            </TableCell>
                                        </TableRow>
                                    ) : visibleAccounts.map((acc) => {
                                        const isParent = CHART_OF_ACCOUNTS.some(a => a.parentCode === acc.code);
                                        const isCollapsed = collapsedNodes[acc.code];
                                        const indentPx = (acc.level - 1) * 24;

                                        return (
                                            <TableRow 
                                                key={acc.code}
                                                className={cn(
                                                    acc.level === 1 && "bg-muted/60 font-black text-sm",
                                                    acc.level === 2 && "bg-muted/20 font-bold text-xs",
                                                    acc.level === 3 && "text-xs hover:bg-muted/30"
                                                )}
                                            >
                                                <TableCell className="font-mono font-bold text-foreground">
                                                    {acc.code}
                                                </TableCell>
                                                <TableCell>
                                                    <div 
                                                        className="flex items-center gap-1.5"
                                                        style={{ paddingRight: `${indentPx}px` }}
                                                    >
                                                        {isParent ? (
                                                            <button 
                                                                type="button"
                                                                onClick={() => toggleCollapse(acc.code)}
                                                                className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                                                title={isCollapsed ? "توسيع الفرع" : "طي الفرع"}
                                                            >
                                                                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                            </button>
                                                        ) : (
                                                            <span className="w-5 inline-block text-center text-muted-foreground">•</span>
                                                        )}
                                                        <span className="text-foreground">{acc.name}</span>
                                                        {acc.description && (
                                                            <span className="text-[10px] text-muted-foreground font-normal">({acc.description})</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className="text-[10px] text-foreground border-border">مستوى {acc.level}</Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className={cn("text-[10px]", typeBadges[acc.type]?.className)}>
                                                        {typeBadges[acc.type]?.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center font-semibold">
                                                    {acc.normalBalance === 'debit' ? (
                                                        <span className="text-foreground flex items-center justify-center gap-1 text-[11px]">
                                                            <ArrowUpRight className="h-3 w-3 text-muted-foreground" /> مدين
                                                        </span>
                                                    ) : (
                                                        <span className="text-foreground flex items-center justify-center gap-1 text-[11px]">
                                                            <ArrowDownLeft className="h-3 w-3 text-muted-foreground" /> دائن
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="h-7 text-xs gap-1 text-foreground hover:text-foreground"
                                                        onClick={() => setActiveAccountModal(acc)}
                                                    >
                                                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                                        الأستاذ
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Account Details & Quick Drill-Down Modal */}
                <Dialog open={!!activeAccountModal} onOpenChange={(open) => { if (!open) setActiveAccountModal(null); }}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-foreground">
                                <Info className="h-5 w-5 text-muted-foreground" />
                                بطاقة الحساب: {activeAccountModal?.name}
                            </DialogTitle>
                            <DialogDescription>
                                تفاصيل الحساب المحاسبي والدليل المعتمد
                            </DialogDescription>
                        </DialogHeader>

                        {activeAccountModal && (
                            <div className="space-y-3 py-2 text-sm">
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">كود الحساب:</span>
                                    <span className="font-mono font-bold text-foreground">{activeAccountModal.code}</span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">النوع:</span>
                                    <Badge variant="outline" className={typeBadges[activeAccountModal.type]?.className}>
                                        {typeBadges[activeAccountModal.type]?.label}
                                    </Badge>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">طبيعة الحساب:</span>
                                    <span className="text-foreground font-semibold">
                                        {activeAccountModal.normalBalance === 'debit' ? 'مدين (Debit)' : 'دائن (Credit)'}
                                    </span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">المستوى المحاسبي:</span>
                                    <span className="text-foreground font-semibold">مستوى {activeAccountModal.level}</span>
                                </div>
                                {activeAccountModal.description && (
                                    <div className="border-b pb-2">
                                        <span className="text-muted-foreground block text-xs mb-1">الوصف والتوجيه:</span>
                                        <p className="text-xs text-foreground bg-muted/30 p-2 rounded border">
                                            {activeAccountModal.description}
                                        </p>
                                    </div>
                                )}

                                <div className="flex justify-end gap-2 pt-2">
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => setActiveAccountModal(null)}
                                    >
                                        إغلاق
                                    </Button>
                                    <Button 
                                        size="sm" 
                                        className="gap-1.5"
                                        onClick={() => {
                                            const accName = activeAccountModal.name;
                                            setActiveAccountModal(null);
                                            router.push(`/accounting/journal?account=${encodeURIComponent(accName)}`);
                                        }}
                                    >
                                        <BookOpen className="h-4 w-4" />
                                        عرض كشف الأستاذ العام
                                    </Button>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </main>
        </>
    );
}
