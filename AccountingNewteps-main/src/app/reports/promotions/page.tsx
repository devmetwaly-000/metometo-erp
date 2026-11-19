"use client";

import React, { useState, useMemo, useCallback } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useData } from "@/contexts/data-provider";
import { 
    Tag, Percent, ShoppingBag, TrendingUp, TrendingDown, AlertTriangle, 
    CheckCircle2, Sparkles, Filter, Printer, Download, Eye, Layers, 
    ArrowRightLeft, AlertCircle, Calendar, Store, Search, ExternalLink,
    HelpCircle, ShieldAlert, BarChart3, Clock, DollarSign, Package, Check
} from "lucide-react";
import Link from 'next/link';
import { cn } from "@/lib/utils";

// Interface definitions
interface Promotion {
    id?: string;
    promoCode?: string;
    name: string;
    description?: string;
    type: 'percentage' | 'fixed_amount' | 'buy_x_get_y_discount' | 'buy_n_get_cheapest_discount' | 'tiered_quantity';
    value: number;
    buyCount?: number;
    buyNTargetMode?: 'all' | 'specific';
    targetType: 'items' | 'itemSections' | 'itemCategories' | 'itemGroups' | 'itemSubCategories1' | 'itemSubCategories2';
    targetIds: string[];
    startDate: string;
    endDate: string;
    warehouseIds?: string[];
    tiers?: any[];
}

export default function PromotionsReportPage() {
    const { promotions = [], posSales = [], salesInvoices = [], items = [], warehouses = [], loading } = useData();

    // Filters
    const [selectedBranch, setSelectedBranch] = useState<string>('all');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    const [selectedAuditFilter, setSelectedAuditFilter] = useState<string>('all');
    const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Detailed dialog state
    const [inspectPromo, setInspectPromo] = useState<any | null>(null);

    // Manufactured item cost helper
    const calculateItemCost = useCallback((itemObj: any): number => {
        if (!itemObj) return 0;
        if (itemObj.itemType === 'manufactured' && Array.isArray(itemObj.components) && itemObj.components.length > 0) {
            return itemObj.components.reduce((sum: number, c: any) => {
                const raw = items.find((i: any) => i.id === c.itemId);
                return sum + (Number(c.quantity || 0) * Number(raw?.cost || 0));
            }, 0);
        }
        return Number(itemObj.cost || 0);
    }, [items]);

    // Handle Quick Date Presets
    const handleDatePreset = (preset: string) => {
        setDateRangeFilter(preset);
        const now = new Date();
        const fmt = (d: Date) => d.toISOString().split('T')[0];

        if (preset === 'today') {
            const todayStr = fmt(now);
            setStartDate(todayStr);
            setEndDate(todayStr);
        } else if (preset === 'week') {
            const lastWeek = new Date();
            lastWeek.setDate(now.getDate() - 7);
            setStartDate(fmt(lastWeek));
            setEndDate(fmt(now));
        } else if (preset === 'month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            setStartDate(fmt(firstDay));
            setEndDate(fmt(now));
        } else if (preset === 'last30') {
            const last30 = new Date();
            last30.setDate(now.getDate() - 30);
            setStartDate(fmt(last30));
            setEndDate(fmt(now));
        } else if (preset === 'all') {
            setStartDate('');
            setEndDate('');
        }
    };

    // Promotion Type Labels & Badges
    const getPromoTypeMeta = (type: string) => {
        switch (type) {
            case 'buy_x_get_y_discount':
                return { label: 'اشترِ صنفين، خصم على الأرخص (Cross-Item)', badge: 'bg-teal-500/10 text-teal-700 border-teal-500/30' };
            case 'buy_n_get_cheapest_discount':
                return { label: 'اشترِ N أصناف، خصم على الأرخص (Bundle/Combo)', badge: 'bg-sky-500/10 text-sky-700 border-sky-500/30' };
            case 'tiered_quantity':
                return { label: 'خصم كميات متدرج (Tiered)', badge: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30' };
            case 'percentage':
                return { label: 'خصم نسبة مئوية (%)', badge: 'bg-amber-500/10 text-amber-700 border-amber-500/30' };
            case 'fixed_amount':
                return { label: 'خصم مبلغ ثابت (مباشر)', badge: 'bg-purple-500/10 text-purple-700 border-purple-500/30' };
            default:
                return { label: type || 'عرض ترويجي', badge: 'bg-muted text-muted-foreground' };
        }
    };

    // Combine All Sales
    const allSales = useMemo(() => {
        const approvedInvoices = (salesInvoices || []).filter((s: any) => s.status === 'approved' || !s.status);
        const pos = posSales || [];
        return [...approvedInvoices, ...pos];
    }, [salesInvoices, posSales]);

    // Main Aggregated Analytics Engine
    const analytics = useMemo(() => {
        const now = new Date();

        // Map items for O(1) lookups
        const itemsMap = new Map<string, any>();
        items.forEach((i: any) => itemsMap.set(i.id, i));

        // Filter Sales by Date & Warehouse
        const filteredSales = allSales.filter((sale: any) => {
            const saleDate = sale.date || sale.createdAt;
            if (!saleDate) return true;

            const dateOnly = String(saleDate).split('T')[0];
            if (startDate && dateOnly < startDate) return false;
            if (endDate && dateOnly > endDate) return false;

            if (selectedBranch !== 'all') {
                const whId = sale.warehouseId || (sale as any).WarehouseId;
                if (whId && whId !== selectedBranch) return false;
            }

            return true;
        });

        // 1. Process Each Promotion
        const promoMap = new Map<string, any>();

        promotions.forEach((promo: Promotion) => {
            const isExpired = new Date(promo.endDate) < now;
            const isUpcoming = new Date(promo.startDate) > now;
            const isActive = !isExpired && !isUpcoming;

            // Target items resolution
            const targetItemIds = new Set<string>();
            (promo.targetIds || []).forEach(id => targetItemIds.add(id));

            // Cross-item specifics (Buy X Get Y)
            let itemA: any = null;
            let itemB: any = null;
            if (promo.type === 'buy_x_get_y_discount' && promo.targetIds?.length >= 2) {
                itemA = itemsMap.get(promo.targetIds[0]) || { id: promo.targetIds[0], name: 'الصنف الأول' };
                itemB = itemsMap.get(promo.targetIds[1]) || { id: promo.targetIds[1], name: 'الصنف الثاني (المرتبط)' };
            }

            promoMap.set(promo.id || '', {
                promo,
                id: promo.id,
                name: promo.name,
                promoCode: promo.promoCode || '',
                type: promo.type,
                value: promo.value,
                startDate: promo.startDate,
                endDate: promo.endDate,
                warehouseIds: promo.warehouseIds || [],
                isActive,
                isExpired,
                isUpcoming,
                itemA,
                itemB,
                targetItemIds,
                invoicesCount: 0,
                invoicesList: [] as any[],
                totalQtySold: 0,
                totalGrossSales: 0,
                totalDiscountGiven: 0,
                totalNetRevenue: 0,
                totalCost: 0,
                netProfit: 0,
                profitMargin: 0,
                isBelowCost: false,
                belowCostLoss: 0,
                itemsBreakdown: new Map<string, {
                    name: string;
                    code: string;
                    qty: number;
                    grossSales: number;
                    discount: number;
                    netSales: number;
                    cost: number;
                    profit: number;
                    isSellingBelowCost: boolean;
                }>()
            });
        });

        // 2. Iterate Sales to Match Applied Promotions
        filteredSales.forEach((sale: any) => {
            const saleItems = sale.items || [];
            const promosInThisSale = new Set<string>();

            saleItems.forEach((it: any) => {
                const promoId = it.promoApplied;
                if (!promoId || !promoMap.has(promoId)) return;

                const promoData = promoMap.get(promoId)!;
                promosInThisSale.add(promoId);

                const qty = Number(it.qty || 1);
                const unitPrice = Number(it.price || 0);
                const originalPrice = Number(it.originalPrice || unitPrice);
                const discount = Number(it.discountApplied || Math.max(0, (originalPrice - unitPrice) * qty));
                const gross = originalPrice * qty;
                const net = Number(it.total !== undefined ? it.total : (unitPrice * qty));

                const masterItem = itemsMap.get(it.id);
                const unitCost = (sale.type === 'POS' || sale.cashierId)
                    ? (it.cost || calculateItemCost(masterItem))
                    : (it.cost || calculateItemCost(masterItem));
                const totalLineCost = unitCost * qty;

                // Accumulate to Promo
                promoData.totalQtySold += qty;
                promoData.totalGrossSales += gross;
                promoData.totalDiscountGiven += discount;
                promoData.totalNetRevenue += net;
                promoData.totalCost += totalLineCost;

                // Below Cost Check
                if (unitPrice < unitCost && unitCost > 0) {
                    promoData.isBelowCost = true;
                    promoData.belowCostLoss += (unitCost - unitPrice) * qty;
                }

                // Item Breakdown Accumulator
                const currentBreakdown = promoData.itemsBreakdown.get(it.id) || {
                    name: it.name || masterItem?.name || 'صنف',
                    code: masterItem?.code || '',
                    qty: 0,
                    grossSales: 0,
                    discount: 0,
                    netSales: 0,
                    cost: 0,
                    profit: 0,
                    isSellingBelowCost: false
                };

                currentBreakdown.qty += qty;
                currentBreakdown.grossSales += gross;
                currentBreakdown.discount += discount;
                currentBreakdown.netSales += net;
                currentBreakdown.cost += totalLineCost;
                currentBreakdown.profit += (net - totalLineCost);
                if (unitPrice < unitCost && unitCost > 0) {
                    currentBreakdown.isSellingBelowCost = true;
                }

                promoData.itemsBreakdown.set(it.id, currentBreakdown);
            });

            // Count invoices and register invoice details
            promosInThisSale.forEach(promoId => {
                const promoData = promoMap.get(promoId);
                if (promoData) {
                    promoData.invoicesCount += 1;
                    promoData.invoicesList.push({
                        id: sale.id,
                        invoiceNumber: sale.invoiceNumber || sale.id,
                        date: sale.date || sale.createdAt,
                        warehouseId: sale.warehouseId,
                        customerName: sale.customerName || sale.clientName || 'عميل نقدي',
                        total: sale.total,
                        type: sale.type || 'POS'
                    });
                }
            });
        });

        // 3. Finalize Profits & Margins
        const promoList = Array.from(promoMap.values()).map(p => {
            p.netProfit = p.totalNetRevenue - p.totalCost;
            p.profitMargin = p.totalNetRevenue > 0 ? (p.netProfit / p.totalNetRevenue) * 100 : 0;
            return p;
        });

        // 4. Overlap & Conflict Detection
        const conflicts: { item: any; conflictingPromos: any[]; branch: string }[] = [];
        const itemActivePromoMap = new Map<string, { promo: any; whIds: string[] }[]>();

        promoList.filter(p => p.isActive).forEach(p => {
            p.promo.targetIds?.forEach((targetId: string) => {
                const existing = itemActivePromoMap.get(targetId) || [];
                existing.push({ promo: p, whIds: p.warehouseIds });
                itemActivePromoMap.set(targetId, existing);
            });
        });

        itemActivePromoMap.forEach((promoEntries, itemId) => {
            if (promoEntries.length > 1) {
                const masterItem = itemsMap.get(itemId);
                conflicts.push({
                    item: masterItem || { id: itemId, name: `صنف (#${itemId})` },
                    conflictingPromos: promoEntries.map(e => e.promo),
                    branch: promoEntries[0].whIds?.length ? promoEntries[0].whIds.map((wid: string) => warehouses.find((w: any) => w.id === wid)?.name || wid).join(', ') : 'جميع الفروع'
                });
            }
        });

        // 5. Frequently Bought Together (Natural Cross-Selling Combos)
        const pairFrequencyMap = new Map<string, { itemA: any; itemB: any; count: number; totalRevenue: number }>();
        filteredSales.forEach((sale: any) => {
            const saleItems = sale.items || [];
            if (saleItems.length >= 2) {
                for (let i = 0; i < saleItems.length; i++) {
                    for (let j = i + 1; j < saleItems.length; j++) {
                        const it1 = saleItems[i];
                        const it2 = saleItems[j];
                        if (it1.id === it2.id) continue;

                        const sortedIds = [it1.id, it2.id].sort();
                        const key = `${sortedIds[0]}_+_${sortedIds[1]}`;

                        const existing = pairFrequencyMap.get(key) || {
                            itemA: itemsMap.get(sortedIds[0]) || { id: sortedIds[0], name: it1.name },
                            itemB: itemsMap.get(sortedIds[1]) || { id: sortedIds[1], name: it2.name },
                            count: 0,
                            totalRevenue: 0
                        };

                        existing.count += 1;
                        existing.totalRevenue += Number(it1.total || (it1.price * it1.qty)) + Number(it2.total || (it2.price * it2.qty));
                        pairFrequencyMap.set(key, existing);
                    }
                }
            }
        });

        const topPairs = Array.from(pairFrequencyMap.values())
            .filter(p => p.count >= 2)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Overall Totals
        const totals = promoList.reduce((acc, p) => {
            acc.grossSales += p.totalGrossSales;
            acc.discountGiven += p.totalDiscountGiven;
            acc.netRevenue += p.totalNetRevenue;
            acc.cost += p.totalCost;
            acc.profit += p.netProfit;
            acc.invoicesCount += p.invoicesCount;
            acc.qtySold += p.totalQtySold;
            if (p.isBelowCost) acc.belowCostCount += 1;
            if (p.invoicesCount === 0 && p.isActive) acc.dormantCount += 1;
            return acc;
        }, {
            grossSales: 0,
            discountGiven: 0,
            netRevenue: 0,
            cost: 0,
            profit: 0,
            invoicesCount: 0,
            qtySold: 0,
            belowCostCount: 0,
            dormantCount: 0
        });

        const overallProfitMargin = totals.netRevenue > 0 ? (totals.profit / totals.netRevenue) * 100 : 0;

        return {
            promoList,
            totals: { ...totals, overallProfitMargin },
            conflicts,
            topPairs,
            filteredSalesCount: filteredSales.length
        };
    }, [allSales, promotions, items, warehouses, startDate, endDate, selectedBranch, calculateItemCost]);

    // Apply Filter Logic to Promos List
    const displayedPromos = useMemo(() => {
        return (analytics.promoList || []).filter(p => {
            // Text Search
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchesName = p.name.toLowerCase().includes(q);
                const matchesCode = (p.promoCode || '').toLowerCase().includes(q);
                const matchesItemA = p.itemA?.name?.toLowerCase().includes(q);
                const matchesItemB = p.itemB?.name?.toLowerCase().includes(q);
                if (!matchesName && !matchesCode && !matchesItemA && !matchesItemB) return false;
            }

            // Type Filter
            if (selectedType !== 'all') {
                if (selectedType === 'cross_item' && p.type !== 'buy_x_get_y_discount') return false;
                if (selectedType === 'bundle_n' && p.type !== 'buy_n_get_cheapest_discount') return false;
                if (selectedType === 'tiered' && p.type !== 'tiered_quantity') return false;
                if (selectedType === 'standard' && p.type !== 'percentage' && p.type !== 'fixed_amount') return false;
            }

            // Status Filter
            if (selectedStatus === 'active' && !p.isActive) return false;
            if (selectedStatus === 'expired' && !p.isExpired) return false;
            if (selectedStatus === 'upcoming' && !p.isUpcoming) return false;

            // Audit Filter
            if (selectedAuditFilter === 'below_cost' && !p.isBelowCost) return false;
            if (selectedAuditFilter === 'dormant' && (p.invoicesCount > 0 || !p.isActive)) return false;
            if (selectedAuditFilter === 'profitable' && p.netProfit <= 0) return false;
            if (selectedAuditFilter === 'unprofitable' && p.netProfit >= 0) return false;

            return true;
        });
    }, [analytics.promoList, searchQuery, selectedType, selectedStatus, selectedAuditFilter]);

    // Export to CSV
    const handleExportCSV = () => {
        const headers = ["اسم العرض", "كود العرض", "نوع العرض", "الصنف الأساسي", "الصنف المرتبط", "عدد الفواتير", "الكمية المباعة", "إجمالي المبيعات", "الخصم الممنوح", "صافي الإيراد", "التكلفة", "صافي الربح", "هامش الربح %", "الحالة", "تحذير بيع بأقل من التكلفة"];
        
        const rows = displayedPromos.map(p => [
            `"${p.name.replace(/"/g, '""')}"`,
            `"${p.promoCode || ''}"`,
            `"${getPromoTypeMeta(p.type).label}"`,
            `"${p.itemA?.name || '-'}"`,
            `"${p.itemB?.name || '-'}"`,
            p.invoicesCount,
            p.totalQtySold,
            p.totalGrossSales.toFixed(2),
            p.totalDiscountGiven.toFixed(2),
            p.totalNetRevenue.toFixed(2),
            p.totalCost.toFixed(2),
            p.netProfit.toFixed(2),
            `${p.profitMargin.toFixed(1)}%`,
            p.isActive ? 'نشط' : p.isExpired ? 'منتهي' : 'قادم',
            p.isBelowCost ? 'نعم (خسارة)' : 'لا'
        ]);

        const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `تقرير_مبيعات_العروض_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground animate-pulse font-medium">جاري احتساب وتدقيق مبيعات العروض الترويجية والأصناف المرتبطة...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            {/* 1. Header */}
            <PageHeader 
                title="تقارير مبيعات وتدقيق العروض الترويجية والأصناف المرتبطة"
                description="تحليل ربحية العروض وحزم الأصناف (Cross-Selling & Combos)، كشف التضارب، ومراجعة أمان هوامش الربح."
            >
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
                        <Printer className="h-4 w-4" />
                        طباعة التقرير
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
                        <Download className="h-4 w-4" />
                        تصدير Excel / CSV
                    </Button>
                    <Link href="/marketing/promotions">
                        <Button size="sm" className="gap-1.5 bg-primary">
                            <Tag className="h-4 w-4" />
                            إدارة وضبط العروض
                        </Button>
                    </Link>
                </div>
            </PageHeader>

            {/* 2. KPI Metrics Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <Card className="border shadow-sm">
                    <CardContent className="p-3.5 space-y-1">
                        <div className="flex items-center justify-between text-muted-foreground">
                            <span className="text-xs font-semibold">إجمالي المبيعات</span>
                            <ShoppingBag className="h-4 w-4 text-primary" />
                        </div>
                        <div className="text-xl font-black font-mono text-foreground">
                            {analytics.totals.netRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-xs font-normal text-muted-foreground mr-1">ج.م</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">من أصل {analytics.totals.grossSales.toFixed(0)} ج.م قبل الخصم</p>
                    </CardContent>
                </Card>

                <Card className="border shadow-sm">
                    <CardContent className="p-3.5 space-y-1">
                        <div className="flex items-center justify-between text-muted-foreground">
                            <span className="text-xs font-semibold">الخصومات الممنوحة</span>
                            <Percent className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="text-xl font-black font-mono text-amber-600 dark:text-amber-400">
                            {analytics.totals.discountGiven.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-xs font-normal text-muted-foreground mr-1">ج.م</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">مجموع دعم العروض للعملاء</p>
                    </CardContent>
                </Card>

                <Card className="border shadow-sm">
                    <CardContent className="p-3.5 space-y-1">
                        <div className="flex items-center justify-between text-muted-foreground">
                            <span className="text-xs font-semibold">تكلفة البضاعة (COGS)</span>
                            <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="text-xl font-black font-mono text-foreground">
                            {analytics.totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-xs font-normal text-muted-foreground mr-1">ج.م</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">تكلفة شراء وتصنيع الأصناف</p>
                    </CardContent>
                </Card>

                <Card className="border shadow-sm">
                    <CardContent className="p-3.5 space-y-1">
                        <div className="flex items-center justify-between text-muted-foreground">
                            <span className="text-xs font-semibold">صافي الربح المحقق</span>
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className={cn(
                            "text-xl font-black font-mono",
                            analytics.totals.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        )}>
                            {analytics.totals.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-xs font-normal text-muted-foreground mr-1">ج.م</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span>هامش ربح:</span>
                            <span className={cn("font-bold font-mono", analytics.totals.overallProfitMargin >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                {analytics.totals.overallProfitMargin.toFixed(1)}%
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border shadow-sm">
                    <CardContent className="p-3.5 space-y-1">
                        <div className="flex items-center justify-between text-muted-foreground">
                            <span className="text-xs font-semibold">الفواتير والكميات</span>
                            <BarChart3 className="h-4 w-4 text-sky-600" />
                        </div>
                        <div className="text-xl font-black font-mono text-foreground">
                            {analytics.totals.invoicesCount.toLocaleString()}
                            <span className="text-xs font-normal text-muted-foreground mr-1">فاتورة</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">بإجمالي {analytics.totals.qtySold.toLocaleString()} قطعة مباعة</p>
                    </CardContent>
                </Card>

                <Card className={cn("border shadow-sm", analytics.totals.belowCostCount > 0 ? "border-rose-500/40 bg-rose-500/5" : "")}>
                    <CardContent className="p-3.5 space-y-1">
                        <div className="flex items-center justify-between text-muted-foreground">
                            <span className="text-xs font-semibold">مؤشر أمان العروض</span>
                            {analytics.totals.belowCostCount > 0 ? (
                                <AlertTriangle className="h-4 w-4 text-rose-600 animate-pulse" />
                            ) : (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            )}
                        </div>
                        <div className="text-xl font-black font-mono">
                            {analytics.totals.belowCostCount > 0 ? (
                                <span className="text-rose-600 font-bold">{analytics.totals.belowCostCount} عروض خاسرة</span>
                            ) : (
                                <span className="text-emerald-600 font-bold">100% آمنة</span>
                            )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            {analytics.conflicts.length > 0 ? `${analytics.conflicts.length} تضارب في الأصناف` : 'لا يوجد تضارب مسجل'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* 3. Comprehensive Filters Card */}
            <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Filter className="h-4 w-4 text-primary" />
                            خيارات الفلترة والتخصيص المتقدم
                        </CardTitle>
                        {(selectedBranch !== 'all' || selectedType !== 'all' || selectedStatus !== 'all' || selectedAuditFilter !== 'all' || startDate || searchQuery) && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => {
                                    setSelectedBranch('all');
                                    setSelectedType('all');
                                    setSelectedStatus('all');
                                    setSelectedAuditFilter('all');
                                    handleDatePreset('all');
                                    setSearchQuery('');
                                }} 
                                className="h-7 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                            >
                                إعادة تعيين الفلاتر
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        {/* Search input */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">بحث بالعرض أو الصنف</Label>
                            <div className="relative">
                                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="اسم العرض، الكود، الصنف..."
                                    className="h-9 pr-8 text-xs"
                                />
                            </div>
                        </div>

                        {/* Branch filter */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">الفرع / المخزن</Label>
                            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="اختر الفرع" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">كافة الفروع والمخازن</SelectItem>
                                    {warehouses.map((w: any) => (
                                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Type filter */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">نوع العرض والارتباط</Label>
                            <Select value={selectedType} onValueChange={setSelectedType}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="نوع العرض" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">كافة أنواع العروض</SelectItem>
                                    <SelectItem value="cross_item">🔗 عروض الأصناف المرتبطة (Buy X Get Y)</SelectItem>
                                    <SelectItem value="bundle_n">📦 عروض حزم الأصناف المتعددة (Buy N)</SelectItem>
                                    <SelectItem value="tiered">📈 خصومات الكميات المتدرجة (Tiers)</SelectItem>
                                    <SelectItem value="standard">🏷️ خصومات النسبة والمبالغ المباشرة</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Status filter */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">حالة صلاحية العرض</Label>
                            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="حالة العرض" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">جميع الحالات</SelectItem>
                                    <SelectItem value="active">🟢 عروض نشطة حالياً</SelectItem>
                                    <SelectItem value="expired">🔴 عروض منتهية الصلاحية</SelectItem>
                                    <SelectItem value="upcoming">⏳ عروض ستبدأ لاحقاً</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Audit filter */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">تدقيق ومراجعة الأداء</Label>
                            <Select value={selectedAuditFilter} onValueChange={setSelectedAuditFilter}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="تدقيق الأداء" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">عرض الكل بدون استثناء</SelectItem>
                                    <SelectItem value="below_cost">⚠️ عروض خاسرة (أقل من التكلفة)</SelectItem>
                                    <SelectItem value="dormant">💤 عروض راكدة (بدون مبيعات)</SelectItem>
                                    <SelectItem value="profitable">✅ عروض رابحة فقط</SelectItem>
                                    <SelectItem value="unprofitable">🔻 عروض ذات عائد سلبي</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Date Presets and Custom Range */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-muted-foreground font-medium ml-1">فترة الفحص:</span>
                            <Button 
                                variant={dateRangeFilter === 'all' ? 'secondary' : 'outline'} 
                                size="sm" 
                                onClick={() => handleDatePreset('all')} 
                                className="h-7 text-xs px-2.5"
                            >
                                كل الفترات
                            </Button>
                            <Button 
                                variant={dateRangeFilter === 'today' ? 'secondary' : 'outline'} 
                                size="sm" 
                                onClick={() => handleDatePreset('today')} 
                                className="h-7 text-xs px-2.5"
                            >
                                اليوم
                            </Button>
                            <Button 
                                variant={dateRangeFilter === 'week' ? 'secondary' : 'outline'} 
                                size="sm" 
                                onClick={() => handleDatePreset('week')} 
                                className="h-7 text-xs px-2.5"
                            >
                                آخر 7 أيام
                            </Button>
                            <Button 
                                variant={dateRangeFilter === 'month' ? 'secondary' : 'outline'} 
                                size="sm" 
                                onClick={() => handleDatePreset('month')} 
                                className="h-7 text-xs px-2.5"
                            >
                                هذا الشهر
                            </Button>
                            <Button 
                                variant={dateRangeFilter === 'last30' ? 'secondary' : 'outline'} 
                                size="sm" 
                                onClick={() => handleDatePreset('last30')} 
                                className="h-7 text-xs px-2.5"
                            >
                                آخر 30 يوماً
                            </Button>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                                <span className="text-muted-foreground">من:</span>
                                <Input 
                                    type="date" 
                                    value={startDate} 
                                    onChange={e => { setStartDate(e.target.value); setDateRangeFilter('custom'); }} 
                                    className="h-7 text-xs w-32"
                                />
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-muted-foreground">إلى:</span>
                                <Input 
                                    type="date" 
                                    value={endDate} 
                                    onChange={e => { setEndDate(e.target.value); setDateRangeFilter('custom'); }} 
                                    className="h-7 text-xs w-32"
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 4. Main Multi-Tab Analysis Views */}
            <Tabs defaultValue="cross_items" className="w-full space-y-4">
                <TabsList className="grid w-full grid-cols-1 md:grid-cols-3 h-auto p-1 bg-muted/60 rounded-lg border">
                    <TabsTrigger value="cross_items" className="text-xs font-bold py-2 gap-1.5">
                        <ArrowRightLeft className="h-4 w-4 text-teal-600" />
                        تحليل مبيعات العروض المرتبطة والحزم ({displayedPromos.length})
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="text-xs font-bold py-2 gap-1.5">
                        <ShieldAlert className="h-4 w-4 text-rose-600" />
                        تدقيق ومراجعة العروض وكشف التضارب
                        {(analytics.conflicts.length > 0 || analytics.totals.belowCostCount > 0) && (
                            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                                {analytics.conflicts.length + analytics.totals.belowCostCount} تنبيه
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="combos" className="text-xs font-bold py-2 gap-1.5">
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        سلة الشراء واقتراح عروض مرتبطة جديدة ({analytics.topPairs.length})
                    </TabsTrigger>
                </TabsList>

                {/* TAB 1: Detailed Cross-Items & Bundles Sales Report */}
                <TabsContent value="cross_items" className="space-y-4">
                    <Card className="border shadow-sm">
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base font-bold">جدول مبيعات وربحية العروض الترويجية</CardTitle>
                                <CardDescription className="text-xs">
                                    يعرض تفاصيل المبيعات، الخصومات المقدمة، تكلفة البضاعة، والأرباح الصافية لكل عرض مرتبط.
                                </CardDescription>
                            </div>
                            <span className="text-xs font-mono bg-muted px-2.5 py-1 rounded-md text-muted-foreground">
                                عدد العروض المعروضة: {displayedPromos.length}
                            </span>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40 text-xs">
                                            <TableHead className="w-12 text-center">#</TableHead>
                                            <TableHead>اسم العرض والكود</TableHead>
                                            <TableHead>نوع العرض</TableHead>
                                            <TableHead>الأصناف المرتبطة بالعرض</TableHead>
                                            <TableHead className="text-center">الفواتير</TableHead>
                                            <TableHead className="text-center">القطع المباعة</TableHead>
                                            <TableHead className="text-right">إجمالي المبيعات</TableHead>
                                            <TableHead className="text-right text-amber-600">الخصم الممنوح</TableHead>
                                            <TableHead className="text-right">صافي الإيراد</TableHead>
                                            <TableHead className="text-right">التكلفة (COGS)</TableHead>
                                            <TableHead className="text-right">صافي الربح</TableHead>
                                            <TableHead className="text-center">هامش الربح</TableHead>
                                            <TableHead className="text-center">الحالة</TableHead>
                                            <TableHead className="text-center w-24">إجراءات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {displayedPromos.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={14} className="h-40 text-center text-muted-foreground text-sm">
                                                    لا توجد عروض تطابق خيارات الفلترة المحددة.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            displayedPromos.map((p, idx) => {
                                                const typeMeta = getPromoTypeMeta(p.type);
                                                return (
                                                    <TableRow key={p.id || idx} className="hover:bg-muted/30 text-xs font-medium">
                                                        <TableCell className="text-center font-mono text-muted-foreground">{idx + 1}</TableCell>
                                                        
                                                        {/* Name & Code */}
                                                        <TableCell>
                                                            <div className="font-bold text-foreground hover:underline cursor-pointer" onClick={() => setInspectPromo(p)}>
                                                                {p.name}
                                                            </div>
                                                            {p.promoCode && (
                                                                <span className="font-mono text-[10px] text-muted-foreground block">
                                                                    كود: {p.promoCode}
                                                                </span>
                                                            )}
                                                            {p.isBelowCost && (
                                                                <span className="inline-flex items-center gap-1 text-[10px] text-rose-600 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded mt-0.5">
                                                                    <AlertTriangle className="h-2.5 w-2.5" /> يباع بأقل من التكلفة
                                                                </span>
                                                            )}
                                                        </TableCell>

                                                        {/* Promo Type */}
                                                        <TableCell>
                                                            <Badge variant="outline" className={cn("text-[10px] font-semibold border", typeMeta.badge)}>
                                                                {p.type === 'buy_x_get_y_discount' && <ArrowRightLeft className="h-3 w-3 mr-1" />}
                                                                {p.type === 'buy_n_get_cheapest_discount' && <Layers className="h-3 w-3 mr-1" />}
                                                                {typeMeta.label}
                                                            </Badge>
                                                        </TableCell>

                                                        {/* Linked / Cross Items Details */}
                                                        <TableCell>
                                                            {p.type === 'buy_x_get_y_discount' && p.itemA && p.itemB ? (
                                                                <div className="space-y-1 text-[11px] leading-tight">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                                                        <span className="font-semibold text-foreground truncate max-w-[140px]" title={p.itemA.name}>
                                                                            {p.itemA.name}
                                                                        </span>
                                                                        <span className="text-[10px] text-muted-foreground font-mono">({Number(p.itemA.price || 0).toFixed(0)} ج.م)</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0"></span>
                                                                        <span className="truncate max-w-[140px]" title={p.itemB.name}>
                                                                            {p.itemB.name}
                                                                        </span>
                                                                        <span className="text-[10px] text-amber-600 font-mono font-bold">(خصم {p.value}%)</span>
                                                                    </div>
                                                                </div>
                                                            ) : p.promo.targetIds?.length > 0 ? (
                                                                <span className="text-muted-foreground text-[11px]">
                                                                    {p.promo.targetIds.length} أصناف مشمولة
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground text-[11px]">كافة أصناف المتجر</span>
                                                            )}
                                                        </TableCell>

                                                        {/* Invoices Count */}
                                                        <TableCell className="text-center font-mono font-bold">
                                                            {p.invoicesCount > 0 ? (
                                                                <Badge variant="secondary" className="font-mono">
                                                                    {p.invoicesCount.toLocaleString()}
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground">0</span>
                                                            )}
                                                        </TableCell>

                                                        {/* Qty Sold */}
                                                        <TableCell className="text-center font-mono font-semibold">
                                                            {p.totalQtySold.toLocaleString()}
                                                        </TableCell>

                                                        {/* Gross Sales */}
                                                        <TableCell className="text-right font-mono text-muted-foreground">
                                                            {p.totalGrossSales.toFixed(2)}
                                                        </TableCell>

                                                        {/* Discount */}
                                                        <TableCell className="text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                                                            {p.totalDiscountGiven > 0 ? `-${p.totalDiscountGiven.toFixed(2)}` : '0.00'}
                                                        </TableCell>

                                                        {/* Net Revenue */}
                                                        <TableCell className="text-right font-mono font-bold text-foreground">
                                                            {p.totalNetRevenue.toFixed(2)}
                                                        </TableCell>

                                                        {/* Total Cost */}
                                                        <TableCell className="text-right font-mono text-muted-foreground">
                                                            {p.totalCost.toFixed(2)}
                                                        </TableCell>

                                                        {/* Net Profit */}
                                                        <TableCell className="text-right font-mono font-bold">
                                                            <span className={cn(p.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                                                {p.netProfit >= 0 ? `+${p.netProfit.toFixed(2)}` : p.netProfit.toFixed(2)}
                                                            </span>
                                                        </TableCell>

                                                        {/* Profit Margin */}
                                                        <TableCell className="text-center font-mono">
                                                            <span className={cn(
                                                                "px-2 py-0.5 rounded text-[11px] font-bold",
                                                                p.profitMargin >= 25 ? "bg-emerald-500/10 text-emerald-700" :
                                                                p.profitMargin > 0 ? "bg-amber-500/10 text-amber-700" :
                                                                "bg-rose-500/10 text-rose-700"
                                                            )}>
                                                                {p.profitMargin.toFixed(1)}%
                                                            </span>
                                                        </TableCell>

                                                        {/* Status */}
                                                        <TableCell className="text-center">
                                                            {p.isActive ? (
                                                                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]">نشط</Badge>
                                                            ) : p.isExpired ? (
                                                                <Badge variant="outline" className="text-rose-600 border-rose-300 text-[10px]">منتهي</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-sky-600 border-sky-300 text-[10px]">قادم</Badge>
                                                            )}
                                                        </TableCell>

                                                        {/* Actions */}
                                                        <TableCell className="text-center">
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                onClick={() => setInspectPromo(p)}
                                                                className="h-7 px-2 text-[11px] gap-1"
                                                            >
                                                                <Eye className="h-3.5 w-3.5 text-primary" />
                                                                التفاصيل
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                    <TableFooter>
                                        <TableRow className="bg-muted/60 font-bold text-xs">
                                            <TableCell colSpan={4} className="text-right">الإجمالي العام للعروض المعروضة:</TableCell>
                                            <TableCell className="text-center font-mono font-black">{analytics.totals.invoicesCount}</TableCell>
                                            <TableCell className="text-center font-mono font-black">{analytics.totals.qtySold}</TableCell>
                                            <TableCell className="text-right font-mono font-black">{analytics.totals.grossSales.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-mono font-black text-amber-600">-{analytics.totals.discountGiven.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-mono font-black">{analytics.totals.netRevenue.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-mono font-black">{analytics.totals.cost.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-mono font-black">
                                                <span className={cn(analytics.totals.profit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                    {analytics.totals.profit.toFixed(2)} ج.م
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-center font-mono font-black">{analytics.totals.overallProfitMargin.toFixed(1)}%</TableCell>
                                            <TableCell colSpan={2}></TableCell>
                                        </TableRow>
                                    </TableFooter>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* TAB 2: Promotion Health & Overlap Conflict Audit */}
                <TabsContent value="audit" className="space-y-4">
                    {/* Conflict Alerts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Overlapping Promos */}
                        <Card className="border shadow-sm border-amber-500/20 bg-card">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-600">
                                    <Layers className="h-4 w-4" />
                                    تضارب العروض المتزامنة على نفس الصنف ({analytics.conflicts.length})
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    أصناف مشمولة في أكثر من عرض نشط في نفس الوقت ونفس الفرع، مما قد يسبب تضارباً في حساب الخصم للكاشير.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {analytics.conflicts.length === 0 ? (
                                    <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                        <span>ممتاز! لا يوجد أي تضارب بين العروض النشطة الحالية على أي صنف.</span>
                                    </div>
                                ) : (
                                    analytics.conflicts.map((c, i) => (
                                        <div key={i} className="border rounded-lg p-3 bg-muted/20 space-y-2 text-xs">
                                            <div className="flex items-center justify-between font-bold">
                                                <span className="text-foreground">{c.item?.name}</span>
                                                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                                                    {c.conflictingPromos.length} عروض متزامنة
                                                </Badge>
                                            </div>
                                            <div className="text-[11px] text-muted-foreground">
                                                الفرع: <span className="text-foreground font-medium">{c.branch}</span>
                                            </div>
                                            <div className="space-y-1">
                                                {c.conflictingPromos.map((p: any, idx: number) => (
                                                    <div key={idx} className="flex items-center justify-between bg-background p-1.5 rounded border text-[11px]">
                                                        <span className="font-semibold text-foreground">{p.name}</span>
                                                        <span className="text-muted-foreground font-mono">ينتهي: {p.endDate?.slice(0, 10)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium pt-1">
                                                💡 توصية: يُفضل تعديل تواريخ أحد العرضين أو استثناء هذا الصنف لمنع ازدواجية الخصم.
                                            </p>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>

                        {/* Below Cost Alerts */}
                        <Card className="border shadow-sm border-rose-500/20 bg-card">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-bold flex items-center gap-2 text-rose-600">
                                    <AlertTriangle className="h-4 w-4" />
                                    تنبيهات البيع بأقل من التكلفة المالية ({analytics.totals.belowCostCount})
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    عروض تسببت في بيع أصناف بسعر نهائي أقل من سعر الشراء أو التكلفة، مما يشكل خسارة مالية مباشرة.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {analytics.totals.belowCostCount === 0 ? (
                                    <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                        <span>جميع العروض تغطي تكلفة البضاعة بهامش ربح إيجابي.</span>
                                    </div>
                                ) : (
                                    analytics.promoList.filter(p => p.isBelowCost).map((p, i) => (
                                        <div key={i} className="border border-rose-500/30 rounded-lg p-3 bg-rose-500/5 space-y-2 text-xs">
                                            <div className="flex items-center justify-between font-bold">
                                                <span className="text-foreground">{p.name}</span>
                                                <Badge variant="destructive" className="text-[10px]">
                                                    خسارة إجمالية: {p.belowCostLoss.toFixed(2)} ج.م
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                                تم تطبيق نسبة خصم مرتفعة جعلت سعر بيع بعض الأصناف أقل من تكلفتها التوريدية/التصنيعية.
                                            </p>
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => setInspectPromo(p)}
                                                className="h-7 text-xs text-rose-600 border-rose-300 hover:bg-rose-500/10"
                                            >
                                                معاينة الأصناف المتأثرة
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Dormant / Inactive Promotions Audit */}
                    <Card className="border shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Clock className="h-4 w-4 text-primary" />
                                مراجعة تفاعل العروض الراكدة وغير المستغلة ({analytics.totals.dormantCount})
                            </CardTitle>
                            <CardDescription className="text-xs">
                                عروض نشطة ومتاحة في الكاشير ولكن لم تسجل أي مبيعات خلال الفترة المحددة، مما يستدعي مراجعة تصميمها التسويقي أو ترويجها.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {analytics.promoList.filter(p => p.isActive && p.invoicesCount === 0).length === 0 ? (
                                    <div className="col-span-3 text-center py-6 text-xs text-muted-foreground">
                                        جميع العروض النشطة سجلت عمليات بيع بنجاح.
                                    </div>
                                ) : (
                                    analytics.promoList.filter(p => p.isActive && p.invoicesCount === 0).map((p, idx) => (
                                        <div key={idx} className="border rounded-lg p-3 bg-muted/20 space-y-2 text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-foreground truncate max-w-[170px]">{p.name}</span>
                                                <Badge variant="outline" className="text-[10px] text-muted-foreground">0 مبيعات</Badge>
                                            </div>
                                            <div className="text-[11px] text-muted-foreground space-y-0.5">
                                                <div>نوع العرض: {getPromoTypeMeta(p.type).label}</div>
                                                <div>تاريخ الانتهاء: {p.endDate?.slice(0, 10)}</div>
                                            </div>
                                            <Link href="/marketing/promotions" className="inline-block pt-1">
                                                <span className="text-primary hover:underline text-[11px] font-semibold flex items-center gap-1">
                                                    تعديل العرض في شاشة التسويق <ExternalLink className="h-3 w-3" />
                                                </span>
                                            </Link>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* TAB 3: Smart Basket Correlation & Combo Suggestions */}
                <TabsContent value="combos" className="space-y-4">
                    <Card className="border shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base font-bold flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-amber-500" />
                                مصفوفة ارتباط الأصناف واقتراحات العروض الذكية (Market Basket Analysis)
                            </CardTitle>
                            <CardDescription className="text-xs leading-relaxed">
                                تحليل سلوك العملاء التلقائي في الفواتير: الأصناف التي يتم شراؤها معاً بشكل متكرر دون وجود عرض مسبق. يمكنك تحويل هذه الثنائيات إلى عروض (Buy X Get Y) لتعظيم حجم المبيعات!
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {analytics.topPairs.length === 0 ? (
                                    <div className="col-span-2 text-center py-12 text-sm text-muted-foreground">
                                        لا توجد بيانات كافية لثنائيات مشتراة معاً خلال هذه الفترة.
                                    </div>
                                ) : (
                                    analytics.topPairs.map((pair, idx) => (
                                        <div key={idx} className="border rounded-xl p-4 bg-card shadow-sm space-y-3 hover:border-primary/40 transition-colors">
                                            <div className="flex items-center justify-between border-b pb-2">
                                                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                                                    <Tag className="h-3.5 w-3.5 text-primary" />
                                                    ثنائي سلة مبيعات شائع #{idx + 1}
                                                </span>
                                                <Badge className="bg-teal-600 text-white font-mono text-[11px]">
                                                    اشتركا معاً في {pair.count} فاتورة
                                                </Badge>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                                                <div className="border rounded-lg p-2.5 bg-muted/30 space-y-1">
                                                    <span className="text-[10px] text-muted-foreground block">الصنف الأول (الأساسي)</span>
                                                    <span className="font-bold text-foreground block truncate" title={pair.itemA.name}>
                                                        {pair.itemA.name}
                                                    </span>
                                                    <span className="text-[11px] font-mono font-semibold text-primary block">
                                                        {Number(pair.itemA.price || 0).toFixed(2)} ج.م
                                                    </span>
                                                </div>

                                                <div className="border rounded-lg p-2.5 bg-muted/30 space-y-1">
                                                    <span className="text-[10px] text-muted-foreground block">الصنف الثاني (المقترن)</span>
                                                    <span className="font-bold text-foreground block truncate" title={pair.itemB.name}>
                                                        {pair.itemB.name}
                                                    </span>
                                                    <span className="text-[11px] font-mono font-semibold text-primary block">
                                                        {Number(pair.itemB.price || 0).toFixed(2)} ج.م
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between text-xs pt-1">
                                                <span className="text-muted-foreground">
                                                    إجمالي المبيعات المشتركة: <strong className="text-foreground font-mono">{pair.totalRevenue.toFixed(2)} ج.م</strong>
                                                </span>
                                                <Link href="/marketing/promotions">
                                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10">
                                                        <PlusCircle className="h-3.5 w-3.5" />
                                                        إنشاء عرض مرتبط
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* 5. Detailed Promotion Inspection Dialog */}
            {inspectPromo && (
                <Dialog open={!!inspectPromo} onOpenChange={(open) => !open && setInspectPromo(null)}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <div className="flex items-center justify-between pl-4">
                                <div>
                                    <DialogTitle className="text-lg font-bold flex items-center gap-2">
                                        <Tag className="h-5 w-5 text-primary" />
                                        تفاصيل العرض الترويجي: {inspectPromo.name}
                                    </DialogTitle>
                                    <DialogDescription className="text-xs mt-1">
                                        كود: {inspectPromo.promoCode || 'بدون كود'} | نوع العرض: {getPromoTypeMeta(inspectPromo.type).label}
                                    </DialogDescription>
                                </div>
                                <Badge className={inspectPromo.isActive ? "bg-emerald-600" : "bg-muted text-muted-foreground"}>
                                    {inspectPromo.isActive ? 'نشط حالياً' : 'غير نشط'}
                                </Badge>
                            </div>
                        </DialogHeader>

                        <div className="space-y-4 pt-2">
                            {/* Promo Financial Metrics */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="border rounded-lg p-3 bg-muted/20 text-center">
                                    <span className="text-[11px] text-muted-foreground block">إجمالي المبيعات</span>
                                    <span className="text-lg font-bold font-mono text-foreground">{inspectPromo.totalNetRevenue.toFixed(2)} ج.م</span>
                                </div>
                                <div className="border rounded-lg p-3 bg-amber-500/10 text-center">
                                    <span className="text-[11px] text-amber-700 block font-semibold">الخصم الإجمالي</span>
                                    <span className="text-lg font-bold font-mono text-amber-700">-{inspectPromo.totalDiscountGiven.toFixed(2)} ج.م</span>
                                </div>
                                <div className="border rounded-lg p-3 bg-muted/20 text-center">
                                    <span className="text-[11px] text-muted-foreground block">التكلفة (COGS)</span>
                                    <span className="text-lg font-bold font-mono text-foreground">{inspectPromo.totalCost.toFixed(2)} ج.م</span>
                                </div>
                                <div className="border rounded-lg p-3 bg-muted/20 text-center">
                                    <span className="text-[11px] text-muted-foreground block">صافي الربح المحقق</span>
                                    <span className={cn("text-lg font-bold font-mono", inspectPromo.netProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                        {inspectPromo.netProfit >= 0 ? `+${inspectPromo.netProfit.toFixed(2)}` : inspectPromo.netProfit.toFixed(2)} ج.م
                                    </span>
                                </div>
                            </div>

                            {/* Items Breakdown Table */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                    <Package className="h-4 w-4 text-primary" />
                                    مبيعات وتكلفة الأصناف المشمولة بالعرض
                                </h4>
                                <div className="border rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/40 text-xs">
                                                <TableHead>اسم الصنف</TableHead>
                                                <TableHead className="text-center">الكمية المباعة</TableHead>
                                                <TableHead className="text-right">المبيعات الإجمالية</TableHead>
                                                <TableHead className="text-right text-amber-600">الخصم الممنوح</TableHead>
                                                <TableHead className="text-right">صافي الإيراد</TableHead>
                                                <TableHead className="text-right">التكلفة</TableHead>
                                                <TableHead className="text-right">الربح</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Array.from(inspectPromo.itemsBreakdown.values()).length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                                                        لم يتم بيع أي صنف تحت هذا العرض حتى الآن.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                Array.from(inspectPromo.itemsBreakdown.values()).map((it: any, i: number) => (
                                                    <TableRow key={i} className="text-xs">
                                                        <TableCell className="font-semibold">
                                                            {it.name}
                                                            {it.isSellingBelowCost && (
                                                                <span className="text-[10px] text-rose-600 font-bold block">⚠️ يباع بأقل من التكلفة</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono">{it.qty}</TableCell>
                                                        <TableCell className="text-right font-mono">{it.grossSales.toFixed(2)}</TableCell>
                                                        <TableCell className="text-right font-mono text-amber-600">-{it.discount.toFixed(2)}</TableCell>
                                                        <TableCell className="text-right font-mono font-bold">{it.netSales.toFixed(2)}</TableCell>
                                                        <TableCell className="text-right font-mono text-muted-foreground">{it.cost.toFixed(2)}</TableCell>
                                                        <TableCell className={cn("text-right font-mono font-bold", it.profit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                            {it.profit.toFixed(2)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            {/* Invoices List */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                    <ShoppingBag className="h-4 w-4 text-primary" />
                                    قائمة الفواتير المستفيدة من العرض ({inspectPromo.invoicesList.length})
                                </h4>
                                <div className="border rounded-lg max-h-48 overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/40 text-xs">
                                                <TableHead>رقم الفاتورة</TableHead>
                                                <TableHead>التاريخ</TableHead>
                                                <TableHead>العميل</TableHead>
                                                <TableHead className="text-right">إجمالي الفاتورة</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {inspectPromo.invoicesList.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">
                                                        لا توجد فواتير مسجلة لهذا العرض خلال الفترة.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                inspectPromo.invoicesList.slice(0, 50).map((inv: any, idx: number) => (
                                                    <TableRow key={idx} className="text-xs">
                                                        <TableCell className="font-mono font-bold text-primary">{inv.invoiceNumber}</TableCell>
                                                        <TableCell className="text-muted-foreground">{String(inv.date).slice(0, 16)}</TableCell>
                                                        <TableCell>{inv.customerName}</TableCell>
                                                        <TableCell className="text-right font-mono font-bold">{Number(inv.total || 0).toFixed(2)} ج.م</TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="pt-2 border-t">
                            <Button variant="outline" size="sm" onClick={() => setInspectPromo(null)}>
                                إغلاق
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

function PlusCircle(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8" />
            <path d="M12 8v8" />
        </svg>
    );
}
