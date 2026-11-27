"use client";

import React, { useState, useMemo } from "react";
import PageHeader from "@/components/page-header";
import { usePermissions } from "@/contexts/permissions-context";
import { 
    BarChart, BookUser, FilePieChart, PackageSearch, TrendingUp, UserSquare, 
    Warehouse, FileX, Undo2, Users, HandCoins, Building2, ShoppingBag, Coins, 
    TrendingDown, LayoutGrid, FileClock, Percent, FileUp, FileDown, 
    History, AlertTriangle, FileText, Component as FileCog, ShoppingCart, ArrowRightLeft, 
    Scale, Flame, DollarSign, Receipt, CreditCard, Users2, Boxes, Layers, ShieldCheck,
    Search, CheckCircle2, ChevronLeft, Sparkles, Filter
} from "lucide-react";
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ReportItem {
    title: string;
    description: string;
    href: string;
    icon: React.ReactNode;
    module: string;
    badge?: string;
    isNew?: boolean;
}

interface ReportCategory {
    name: string;
    value: string;
    icon: React.ReactNode;
    reports: ReportItem[];
}

const reportCategories: ReportCategory[] = [
    {
        name: "الرقابة وتدقيق نقاط البيع",
        value: "pos_audit",
        icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
        reports: [
            { 
                title: "المطابقة والرقابة لنقاط البيع (جديد)", 
                description: "مطابقة رقابية دقيقة بين مبيعات الأصناف وحركات السداد ورصد الانحرافات والعجز.", 
                href: "/reports/pos-reconciliation", 
                icon: <ShieldCheck className="h-6 w-6 text-emerald-600" />, 
                module: "reports_pos",
                badge: "رقابي أساسي",
                isNew: true
            },
            { 
                title: "تقرير العجز والزيادة في الورديات", 
                description: "ملخص الفروقات والعجز المالي في تقفيل ورديات وشفتات الكاشير اليومية.", 
                href: "/reports/cashier-discrepancies", 
                icon: <TrendingDown className="h-6 w-6 text-destructive" />, 
                module: "reports_pos",
                badge: "عجز وزيادة"
            },
            { 
                title: "تقرير طرق الدفع والمتحصلات", 
                description: "حصر ومطابقة المبالغ المحصلة كاش وعبر بطاقات الفيزا ومحافظ الدفع الإلكتروني.", 
                href: "/reports/payment-methods-report", 
                icon: <Coins className="h-6 w-6 text-amber-500" />, 
                module: "reports_pos" 
            },
            { 
                title: "الفواتير الملغاة والمحذوفة", 
                description: "سجل كامل بجميع فواتير وبنود نقاط البيع التي تم إلغاؤها أو التراجع عنها رقابياً.", 
                href: "/reports/cancelled-invoices", 
                icon: <FileX className="h-6 w-6 text-destructive" />, 
                module: "reports_pos",
                badge: "أمان ورقابة"
            },
            { 
                title: "تقرير عدم تطابق المخزون", 
                description: "كشف العمليات غير المرحلة والعمليات المعلقة التي تؤثر على دقة المخزون.", 
                href: "/reports/discrepancies", 
                icon: <AlertTriangle className="h-6 w-6 text-amber-600" />, 
                module: "reports_discrepancies" 
            },
            { 
                title: "سجل تغييرات الأسعار والتكاليف", 
                description: "تتبع جميع التعديلات التي تمت على أسعار البيع والتكاليف وتوقيتاتها.", 
                href: "/reports/price-change-logs", 
                icon: <History className="h-6 w-6 text-primary" />, 
                module: "reports_priceChangeLogs" 
            },
        ]
    },
    {
        name: "المبيعات ونقاط البيع",
        value: "sales",
        icon: <ShoppingBag className="h-4 w-4 text-primary" />,
        reports: [
            { title: "التحليلات الرسومية الشاملة", description: "نظرة عامة مرئية ورسوم بيانية على أداء عملك ومؤشرات النمو.", href: "/analytics", icon: <BarChart className="h-6 w-6 text-primary" />, module: "analytics" },
            { title: "تقرير المبيعات المفصل", description: "تحليل مفصل لجميع الفواتير مع فلاتر متعددة للعملاء والتواريخ.", href: "/reports/sales-reports", icon: <FileText className="h-6 w-6 text-blue-500" />, module: "reports_sales" },
            { title: "مبيعات نقاط البيع (مجمع)", description: "ملخص كميات وقيم مبيعات الأصناف عبر نقاط البيع والكاشير.", href: "/reports/pos-sales", icon: <ShoppingBag className="h-6 w-6 text-indigo-500" />, module: "reports_posSales" },
            { title: "تقارير نقاط البيع (تفصيلي)", description: "عرض تفصيلي لكل فاتورة كاشير مع أوقات الإصدار وطرق الدفع.", href: "/reports/pos-reports", icon: <FileText className="h-6 w-6 text-teal-600" />, module: "reports_pos" },
            { title: "مبيعات العملاء الإجمالية", description: "حجم وقيمة مشتريات كل عميل ومقارنة الأرصدة والمديونيات.", href: "/reports/sales-by-customer", icon: <UserSquare className="h-6 w-6 text-purple-500" />, module: "reports_sales" },
            { title: "تقرير مبيعات وأداء المناديب", description: "متابعة مبيعات المناديب، التحصيل، وتوريدات النقدية للفرع.", href: "/reports/rep-sales-report", icon: <Users2 className="h-6 w-6 text-orange-500" />, module: "reports_sales" },
            { title: "الأصناف الأكثر مبيعاً والراكدة", description: "تحليل المنتجات السريعة وحصر رأس المال المجمد بالأصناف الراكدة.", href: "/reports/fast-slow-moving", icon: <Flame className="h-6 w-6 text-red-500" />, module: "reports_sales" },
            { title: "تقرير مرتجعات المبيعات", description: "تحليل شامل لمرتجعات المبيعات وفواتير الرد وأسباب الإرجاع.", href: "/reports/sales-returns-report", icon: <Undo2 className="h-6 w-6 text-rose-500" />, module: "sales_returns" },
            { title: "تقرير عدد مرات البيع", description: "عرض أكثر الأصناف تكراراً في الفواتير ومعدل الطلب.", href: "/reports/item-sales-count", icon: <TrendingUp className="h-6 w-6 text-emerald-500" />, module: "reports_itemSalesCount" },
            { title: "تقرير الطاولات والصالات", description: "تحليل نشاط ومبيعات كل طاولة ومواقع الجلوس بالمطعم والكافيه.", href: "/reports/tables-report", icon: <LayoutGrid className="h-6 w-6 text-amber-500" />, module: "reports_restaurantTables" },
            { title: "حركات وصندوق الإكراميات (Tips)", description: "سجل الإكراميات المحصلة من فواتير الكاشير وتوزيعاتها على الموظفين.", href: "/accounting/gratuity", icon: <Wallet className="h-6 w-6 text-emerald-500" />, module: "accounting_gratuity" },
            { title: "تقرير أهداف البائعين والمبيعات", description: "متابعة أداء البائعين وموظفي المبيعات مقارنة بالتارجت المستهدف.", href: "/reports/seller-targets", icon: <Percent className="h-6 w-6 text-cyan-600" />, module: "reports_sellerTargets" },
            { title: "تحليلات وتدقيق العروض الترويجية", description: "تحليل ربحية ومبيعات العروض الترويجية والارتباط بين الأصناف.", href: "/reports/promotions", icon: <Percent className="h-6 w-6 text-pink-500" />, module: "marketing_promotions" },
        ]
    },
    {
        name: "المشتريات والموردين",
        value: "purchases",
        icon: <ShoppingCart className="h-4 w-4 text-indigo-500" />,
        reports: [
            { title: "تقرير المشتريات التفصيلي ومردوداتها", description: "حصر فواتير الشراء، المسدد نقداً، الآجل ومردودات الشراء للموردين.", href: "/reports/purchases-report", icon: <ShoppingCart className="h-6 w-6 text-indigo-600" />, module: "purchases_invoices" },
            { title: "كشف حساب الموردين", description: "عرض تفصيلي لجميع فواتير ودفعات وسندات صرف مورد محدد.", href: "/reports/supplier-statement", icon: <BookUser className="h-6 w-6 text-blue-600" />, module: "reports_supplierStatement" },
            { title: "مستحقات وأرصدة الموردين", description: "عرض إجمالي مستحقات كل مورد والمديونيات الآجلة وتواريخ استحقاقها.", href: "/reports/supplier-payables", icon: <Building2 className="h-6 w-6 text-violet-600" />, module: "reports_supplierPayables" },
        ]
    },
    {
        name: "المخزون واللوجستيك",
        value: "inventory",
        icon: <Warehouse className="h-4 w-4 text-amber-600" />,
        reports: [
            { title: "تقرير أرصدة الأصناف بكافة المستويات", description: "عرض الأرصدة وإجماليات القيمة لكافة مستويات التقسيم (قسم، فئة، مجموعة، صنف).", href: "/reports/stock-status", icon: <Warehouse className="h-6 w-6 text-amber-600" />, module: "reports_stockStatus" },
            { title: "تقييم المخزون وحد إعادة الطلب", description: "تقييم البضاعة بسعر التكلفة والبيع وتنبيهات النواقص وإعادة الشراء.", href: "/reports/inventory-valuation", icon: <Boxes className="h-6 w-6 text-emerald-600" />, module: "reports_stockStatus" },
            { title: "كارت الصنف التفصيلي (حركة الصنف)", description: "تتبع كل الحركات (وارد وصادر) لصنف معين عبر المخازن بالتاريخ.", href: "/reports/item-ledger", icon: <PackageSearch className="h-6 w-6 text-primary" />, module: "reports_itemLedger" },
            { title: "تقرير أرباح الأصناف", description: "تحليل ربحية كل صنف بناءً على سعر البيع الفعلي ومتوسط التكلفة.", href: "/reports/item-profit-loss", icon: <TrendingUp className="h-6 w-6 text-green-600" />, module: "reports_itemProfitLoss" },
            { title: "تقرير تكاليف الصرف والتحويلات والهوالك", description: "الرقابة المالية على تكاليف أذون الصرف، البضاعة المحولة، وخسائر التوالف.", href: "/reports/inventory-movements-cost", icon: <Layers className="h-6 w-6 text-rose-600" />, module: "inventory_adjustment" },
            { title: "تقرير مبيعات الأقسام والتصنيفات", description: "تحليل أداء المبيعات بناءً على التصنيفات الرئيسية والمجموعات.", href: "/reports/sales-by-category", icon: <FilePieChart className="h-6 w-6 text-purple-600" />, module: "reports_salesByCategory" },
            { title: "تقرير التصنيع والمكونات (Recipes)", description: "تتبع استهلاك المواد الخام وتكلفة وجدوى التصنيع وأوامر التشغيل.", href: "/reports/recipe-reports", icon: <FileCog className="h-6 w-6 text-slate-600" />, module: "reports_recipe" },
            { title: "تقرير تحويلات المخازن بين الفروع", description: "متابعة أذونات نقل البضاعة والشحنات في الطريق بين الفروع.", href: "/reports/stock-transfers-report", icon: <ArrowRightLeft className="h-6 w-6 text-blue-600" />, module: "inventory_transfer" },
            { title: "تسويات الجرد والعجز والإعدامات", description: "حصر الفروقات الجردية وتكلفة الهالك والتالف والإعدام المخزني.", href: "/reports/inventory-adjustments-report", icon: <Scale className="h-6 w-6 text-amber-700" />, module: "inventory_adjustment" },
            { title: "تقرير التسكين في الحاويات (الوارد)", description: "سجل عمليات إدخال البضاعة وتسكينها في أقسام وحاويات المخازن الرئيسية.", href: "/reports/stock-in-report", icon: <FileDown className="h-6 w-6 text-teal-600" />, module: "inventory_stockIn" },
            { title: "تقرير السحب والصرف (الصادر)", description: "سجل عمليات سحب البضاعة وصرفها من الأقسام والمستودعات.", href: "/reports/stock-out-report", icon: <FileUp className="h-6 w-6 text-orange-600" />, module: "reports_stockOutReport" },
            { title: "تقرير قرب انتهاء الصلاحية", description: "تنبيهات الأصناف والتشغيلات التي ستنتهي صلاحيتها قريباً.", href: "/reports/item-expiry", icon: <FileClock className="h-6 w-6 text-red-600" />, module: "reports_itemExpiry" },
        ]
    },
    {
        name: "المالية والحسابات العامة",
        value: "financial",
        icon: <DollarSign className="h-4 w-4 text-emerald-600" />,
        reports: [
            { title: "القوائم المالية المركزية", description: "عرض قائمة الدخل، الميزانية العمومية، وميزان المراجعة المعتمد.", href: "/reports/financial-statements", icon: <FilePieChart className="h-6 w-6 text-emerald-600" />, module: "reports_financialStatements" },
            { title: "تحليلات السيولة النقدية والاستحقاقات", description: "التدفقات النقدية المتوقعة والسيولة ومواعيد الشيكات والكمبيالات.", href: "/reports/liquidity", icon: <Coins className="h-6 w-6 text-teal-600" />, module: "reports_financialStatements" },
            { title: "تقرير المصروفات والتحليل المالي", description: "تحليل بنود المصروفات التشغيلية والعمومية ومعدل الصرف اليومي.", href: "/reports/expenses-report", icon: <DollarSign className="h-6 w-6 text-rose-600" />, module: "accounting_expenses" },
            { title: "كشف حساب عميل تفصيلي", description: "كشف حساب تفصيلي بحركات ومديونيات وفواتير عميل محدد.", href: "/reports/customer-statement", icon: <BookUser className="h-6 w-6 text-blue-600" />, module: "reports_customerReceivables" },
            { title: "مستحقات ومديونيات العملاء", description: "عرض إجمالي مستحقات كل عميل مع تحليل أعمار الديون والآجل.", href: "/reports/customer-receivables", icon: <HandCoins className="h-6 w-6 text-indigo-600" />, module: "reports_customerReceivables" },
            { title: "كشف حساب الخزينة والبنوك", description: "تتبع جميع الحركات وسندات القبض والصرف على كل خزينة أو بنك.", href: "/reports/cash-account-statement", icon: <Coins className="h-6 w-6 text-amber-600" />, module: "reports_cashAccountStatement" },
            { title: "إقرار ضريبة القيمة المضافة (VAT)", description: "حساب ضريبة المخرجات والمدخلات وصافي الإقرار الضريبي الرسمي.", href: "/reports/vat-report", icon: <Receipt className="h-6 w-6 text-cyan-600" />, module: "accounting_vat" },
            { title: "تقرير توزيع حصص الشركاء", description: "عرض أرباح وحصص الشركاء من صافي الربح المحقق في كل دورة.", href: "/reports/partner-shares", icon: <Users className="h-6 w-6 text-purple-600" />, module: "reports_partnerShares" },
        ]
    },
    {
        name: "الموارد البشرية والرواتب",
        value: "hr",
        icon: <CreditCard className="h-4 w-4 text-cyan-600" />,
        reports: [
            { title: "كشف مسير الرواتب والأجور الشهرية", description: "مسير رواتب شهري تفصيلي بالبدلات والخصومات والسلف وصافي الراتب المستحق.", href: "/reports/payroll-report", icon: <CreditCard className="h-6 w-6 text-cyan-600" />, module: "hr_payroll" },
        ]
    }
];

function ReportCard({ title, description, href, icon, module, badge, isNew }: ReportItem) {
    const { hasPermission } = usePermissions();

    if (!hasPermission(module, 'view')) {
        return null;
    }

    return (
        <Link href={href} className="group block focus:outline-none">
            <Card className="h-full border border-border/60 hover:border-primary/50 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 bg-card/60 backdrop-blur-sm relative overflow-hidden">
                {isNew && (
                    <div className="absolute top-0 left-0 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-br-md flex items-center gap-1 shadow-sm">
                        <Sparkles className="h-2.5 w-2.5" />
                        جديد
                    </div>
                )}
                <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-3">
                        <div className="p-2.5 rounded-xl bg-muted/60 group-hover:bg-primary/10 transition-colors">
                            {icon}
                        </div>
                        {badge && (
                            <Badge variant="outline" className="text-[10px] font-semibold border-border">
                                {badge}
                            </Badge>
                        )}
                    </div>
                    <CardTitle className="text-base font-bold mt-3 group-hover:text-primary transition-colors flex items-center justify-between">
                        <span>{title}</span>
                        <ChevronLeft className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:-translate-x-1 transition-all" />
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                    <CardDescription className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {description}
                    </CardDescription>
                </CardContent>
            </Card>
        </Link>
    );
}

export default function ReportsHubPage() {
    const [searchQuery, setSearchQuery] = useState("");

    // تصفية وبحث في كامل شجرة التقارير
    const filteredCategories = useMemo(() => {
        if (!searchQuery.trim()) return reportCategories;
        const q = searchQuery.toLowerCase().trim();

        return reportCategories.map(cat => ({
            ...cat,
            reports: cat.reports.filter(r => 
                r.title.toLowerCase().includes(q) || 
                r.description.toLowerCase().includes(q)
            )
        })).filter(cat => cat.reports.length > 0);
    }, [searchQuery]);

    const totalReportsCount = useMemo(() => {
        return reportCategories.reduce((acc, cat) => acc + cat.reports.length, 0);
    }, []);

    return (
        <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
            <PageHeader 
                title="مركز التقارير والرقابة الموحد" 
                description={`منظومة التقارير الشاملة (${totalReportsCount} تقريراً متخصصاً) تشمل الرقابة الميدانية، المبيعات، المخازن، المالية، وتدقيق نقاط البيع.`}
            >
                <div className="relative w-full sm:w-80">
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="ابحث في كافة التقارير..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pr-9 h-9 text-xs bg-card"
                    />
                </div>
            </PageHeader>

            {searchQuery ? (
                // وضع نتائج البحث المباشر
                <div className="space-y-6">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                        <span>نتائج البحث عن: &ldquo;{searchQuery}&rdquo;</span>
                        <button onClick={() => setSearchQuery("")} className="text-primary hover:underline font-bold">
                            إلغاء البحث وعرض الأقسام
                        </button>
                    </div>

                    {filteredCategories.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <Filter className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                            <p className="font-bold">لم يتم العثور على أي تقرير يطابق بحثك.</p>
                        </div>
                    ) : (
                        filteredCategories.map(cat => (
                            <div key={cat.value} className="space-y-3">
                                <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                                    {cat.icon}
                                    {cat.name} ({cat.reports.length})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {cat.reports.map(report => (
                                        <ReportCard key={report.href} {...report} />
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                // التبويبات المنظمة الافتراضية
                <Tabs defaultValue="pos_audit" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 h-auto p-1.5 gap-1.5 bg-muted/40 border">
                        {reportCategories.map(category => (
                            <TabsTrigger 
                                key={category.value} 
                                value={category.value} 
                                className="text-xs py-2.5 flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                            >
                                {category.icon}
                                <span>{category.name}</span>
                                <span className="text-[10px] opacity-75 font-mono">({category.reports.length})</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {reportCategories.map(category => (
                        <TabsContent key={category.value} value={category.value} className="mt-5">
                            <Card className="border shadow-sm bg-card/40">
                                <CardHeader className="py-4 border-b">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {category.icon}
                                            <CardTitle className="text-base">{category.name}</CardTitle>
                                        </div>
                                        <Badge variant="secondary" className="text-xs font-mono">
                                            {category.reports.length} تقارير
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {category.reports.map((report) => (
                                            <ReportCard key={report.href} {...report} />
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    ))}
                </Tabs>
            )}
        </div>
    );
}
