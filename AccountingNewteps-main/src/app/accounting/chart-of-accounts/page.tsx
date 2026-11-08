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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  FolderTree, Search, ChevronRight, ChevronDown, 
  ExternalLink, Layers, ArrowUpRight, ArrowDownLeft, BookOpen, 
  ShieldCheck, CheckCircle2 
} from "lucide-react";
import { CHART_OF_ACCOUNTS, AccountNode } from "@/lib/chart-of-accounts";
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";

export default function ChartOfAccountsPage() {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedType, setSelectedType] = useState<string>("all");
    const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

    const toggleCollapse = (code: string) => {
        setCollapsedNodes(prev => ({ ...prev, [code]: !prev[code] }));
    };

    const filteredAccounts = useMemo(() => {
        return CHART_OF_ACCOUNTS.filter(acc => {
            const matchesSearch = searchTerm === "" || 
                acc.code.includes(searchTerm) || 
                acc.name.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesType = selectedType === "all" || acc.type === selectedType;

            return matchesSearch && matchesType;
        });
    }, [searchTerm, selectedType]);

    const typeBadges: Record<string, { label: string; className: string }> = {
        asset: { label: 'أصول', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
        liability: { label: 'التزامات', className: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
        equity: { label: 'حقوق ملكية', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
        revenue: { label: 'إيرادات', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
        expense: { label: 'مصروفات', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
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

    return (
        <>
            <PageHeader title="دليل الحسابات (شجرة الحسابات)" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                
                {/* Stats Overview */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Card 
                        className={cn("cursor-pointer transition-all border-l-4 border-l-blue-500", selectedType === 'asset' && 'ring-2 ring-blue-500')}
                        onClick={() => setSelectedType(selectedType === 'asset' ? 'all' : 'asset')}
                    >
                        <CardContent className="p-4">
                            <span className="text-xs text-muted-foreground font-semibold">1. الأصول (Assets)</span>
                            <div className="text-2xl font-black mt-1 text-blue-600">{stats.assetsCount} حساب</div>
                        </CardContent>
                    </Card>

                    <Card 
                        className={cn("cursor-pointer transition-all border-l-4 border-l-rose-500", selectedType === 'liability' && 'ring-2 ring-rose-500')}
                        onClick={() => setSelectedType(selectedType === 'liability' ? 'all' : 'liability')}
                    >
                        <CardContent className="p-4">
                            <span className="text-xs text-muted-foreground font-semibold">2. الالتزامات (Liabilities)</span>
                            <div className="text-2xl font-black mt-1 text-rose-600">{stats.liabilitiesCount} حساب</div>
                        </CardContent>
                    </Card>

                    <Card 
                        className={cn("cursor-pointer transition-all border-l-4 border-l-emerald-500", selectedType === 'equity' && 'ring-2 ring-emerald-500')}
                        onClick={() => setSelectedType(selectedType === 'equity' ? 'all' : 'equity')}
                    >
                        <CardContent className="p-4">
                            <span className="text-xs text-muted-foreground font-semibold">3. حقوق الملكية (Equity)</span>
                            <div className="text-2xl font-black mt-1 text-emerald-600">{stats.equityCount} حساب</div>
                        </CardContent>
                    </Card>

                    <Card 
                        className={cn("cursor-pointer transition-all border-l-4 border-l-purple-500", selectedType === 'revenue' && 'ring-2 ring-purple-500')}
                        onClick={() => setSelectedType(selectedType === 'revenue' ? 'all' : 'revenue')}
                    >
                        <CardContent className="p-4">
                            <span className="text-xs text-muted-foreground font-semibold">4. الإيرادات (Revenues)</span>
                            <div className="text-2xl font-black mt-1 text-purple-600">{stats.revenuesCount} حساب</div>
                        </CardContent>
                    </Card>

                    <Card 
                        className={cn("cursor-pointer transition-all border-l-4 border-l-amber-500", selectedType === 'expense' && 'ring-2 ring-amber-500')}
                        onClick={() => setSelectedType(selectedType === 'expense' ? 'all' : 'expense')}
                    >
                        <CardContent className="p-4">
                            <span className="text-xs text-muted-foreground font-semibold">5. المصروفات (Expenses)</span>
                            <div className="text-2xl font-black mt-1 text-amber-600">{stats.expensesCount} حساب</div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <FolderTree className="h-5 w-5 text-primary" />
                                    شجرة الحسابات المحاسبية المعتمدة
                                </CardTitle>
                                <CardDescription>
                                    دليل محاسبي قياسي موحد وفق معايير المحاسبة يربط جميع القيود والقوائم المالية آلياً.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <div className="relative w-full md:w-72">
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
                                    onClick={() => router.push('/accounting/journal')}
                                >
                                    <BookOpen className="ml-2 h-4 w-4" />
                                    دفتر اليومية
                                </Button>
                            </div>
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
                                    {filteredAccounts.map((acc) => {
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
                                                <TableCell className="font-mono font-bold text-primary">
                                                    {acc.code}
                                                </TableCell>
                                                <TableCell>
                                                    <div 
                                                        className="flex items-center gap-1.5"
                                                        style={{ paddingRight: `${indentPx}px` }}
                                                    >
                                                        {isParent ? (
                                                            <button 
                                                                onClick={() => toggleCollapse(acc.code)}
                                                                className="p-1 hover:bg-muted rounded"
                                                            >
                                                                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                            </button>
                                                        ) : (
                                                            <span className="w-5 inline-block text-center text-muted-foreground">•</span>
                                                        )}
                                                        <span>{acc.name}</span>
                                                        {acc.description && (
                                                            <span className="text-[10px] text-muted-foreground font-normal">({acc.description})</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className="text-[10px]">مستوى {acc.level}</Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className={cn("text-[10px]", typeBadges[acc.type]?.className)}>
                                                        {typeBadges[acc.type]?.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center font-semibold">
                                                    {acc.normalBalance === 'debit' ? (
                                                        <span className="text-blue-600 flex items-center justify-center gap-1 text-[11px]">
                                                            <ArrowUpRight className="h-3 w-3" /> مدين
                                                        </span>
                                                    ) : (
                                                        <span className="text-emerald-600 flex items-center justify-center gap-1 text-[11px]">
                                                            <ArrowDownLeft className="h-3 w-3" /> دائن
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {acc.level === 3 && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            className="h-7 text-xs gap-1"
                                                            onClick={() => router.push(`/accounting/journal?account=${encodeURIComponent(acc.name)}`)}
                                                        >
                                                            <ExternalLink className="h-3 w-3" />
                                                            الأستاذ
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </>
    );
}

