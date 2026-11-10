
"use client";

// استيراد المكونات والأدوات اللازمة
import PageHeader from "@/components/page-header";
import { usePermissions } from "@/contexts/permissions-context";
import { 
    BarChart, BookUser, FilePieChart, PackageSearch, TrendingUp, UserSquare, 
    Warehouse, FileX, Undo2, Users, HandCoins, Building2, ShoppingBag, Coins, 
    TrendingDown, LayoutGrid, FileClock, Percent, Bike, UserRound, FileUp, FileDown, 
    History, AlertTriangle, FileText, Component as FileCog, ShoppingCart, ArrowRightLeft, 
    Scale, Flame, DollarSign, Receipt, CreditCard, Users2, Boxes
} from "lucide-react";
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// تعريف واجهة الخصائص (Props) لمكون بطاقة التقرير
interface ReportCardProps {
    title: string;
    description: string;
    href: string;
    icon: React.ReactNode;
    module: string; // الوحدة النمطية المرتبطة بالتقرير للتحقق من الصلاحيات
}

/**
 * مكون `ReportCard`
 * @param {ReportCardProps} props - الخصائص المستلمة.
 * @returns {JSX.Element | null} بطاقة قابلة للنقر تقود إلى صفحة تقرير محدد، أو لا شيء إذا لم يكن لدى المستخدم الصلاحية.
 * هذا المكون يعرض بطاقة أنيقة لكل تقرير، ويتحقق من صلاحيات المستخدم قبل عرضه.
 */
const ReportCard = ({ title, description, href, icon, module }: ReportCardProps) => {
    // استدعاء خطاف الصلاحيات للتحقق من إمكانية عرض التقرير
    const { can } = usePermissions();
    
    // إذا لم يكن لدى المستخدم صلاحية 'view' لهذه الوحدة، لا تعرض البطاقة
    if (!can('view', module)) return null;

    return (
        <Link href={href} prefetch={true} className="block group">
            <div className="p-6 border rounded-lg hover:shadow-lg hover:bg-muted transition-all h-full">
                <div className="flex items-start gap-4">
                    <div className="bg-primary/10 text-primary p-3 rounded-full">
                        {icon}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-1 group-hover:text-primary">{title}</h3>
                        <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                </div>
            </div>
        </Link>
    );
};

// تعريف مصفوفة تحتوي على جميع التقارير وتفاصيلها مقسمة حسب الفئة
const reportCategories = [
    {
        name: "المبيعات والعملاء",
        value: "sales",
        reports: [
            { title: "التحليلات الرسومية", description: "نظرة عامة مرئية على أداء عملك ومؤشرات النمو.", href: "/analytics", icon: <BarChart />, module: "analytics" },
            { title: "تقرير المبيعات المفصل", description: "تحليل مفصل لجميع الفواتير مع فلاتر متعددة.", href: "/reports/sales-reports", icon: <BarChart />, module: "reports_sales" },
            { title: "مبيعات نقاط البيع (مجمع)", description: "ملخص مبيعات الأصناف عبر نقاط البيع والكاشير.", href: "/reports/pos-sales", icon: <ShoppingBag />, module: "reports_posSales" },
            { title: "تقارير نقاط البيع (مفصل)", description: "عرض تفصيلي لكل فاتورة كاشير مع طرق الدفع.", href: "/reports/pos-reports", icon: <FileText />, module: "reports_pos" },
            { title: "مبيعات العملاء الإجمالية", description: "حجم وقيمة مشتريات كل عميل ومقارنة الأرصدة.", href: "/reports/sales-by-customer", icon: <UserSquare />, module: "reports_sales" },
            { title: "تقرير مبيعات وأداء المناديب", description: "متابعة مبيعات المناديب، التحصيل، وتوريدات النقدية.", href: "/reports/rep-sales-report", icon: <Users2 />, module: "reports_sales" },
            { title: "الأصناف الأكثر مبيعاً والراكدة", description: "تحليل المنتجات السريعة وحصر رأس المال المجمد بالراكد.", href: "/reports/fast-slow-moving", icon: <Flame />, module: "reports_sales" },
            { title: "تقرير مرتجعات المبيعات", description: "تحليل شامل لمرتجعات المبيعات وفواتير الرد.", href: "/reports/sales-returns-report", icon: <Undo2 />, module: "sales_returns" },
            { title: "الفواتير الملغاة", description: "سجل بجميع فواتير نقاط البيع التي تم إلغاؤها.", href: "/reports/cancelled-invoices", icon: <FileX />, module: "reports_pos" },
            { title: "تقرير عدد مرات البيع", description: "عرض أكثر الأصناف تكراراً في الفواتير.", href: "/reports/item-sales-count", icon: <TrendingUp />, module: "reports_itemSalesCount" },
            { title: "تقرير الطاولات", description: "تحليل نشاط ومبيعات كل طاولة بالمطعم.", href: "/reports/tables-report", icon: <LayoutGrid />, module: "reports_restaurantTables" },
            { title: "تقرير العجز والزيادة", description: "ملخص الفروقات في ورديات الكاشيرات اليومية.", href: "/reports/cashier-discrepancies", icon: <TrendingDown />, module: "reports_pos" },
            { title: "تقرير طرق الدفع", description: "إجمالي المبالغ المحصلة من كل طريقة دفع.", href: "/reports/payment-methods-report", icon: <Coins />, module: "reports_pos" },
            { title: "تقرير أهداف البائعين", description: "متابعة أداء البائعين مقارنة بالأهداف المحددة.", href: "/reports/seller-targets", icon: <Percent />, module: "reports_sellerTargets" },
        ]
    },
    {
        name: "المشتريات والموردين",
        value: "purchases",
        reports: [
            { title: "تقرير المشتريات التفصيلي ومردوداتها", description: "حصر فواتير الشراء، المسدد نقداً، الآجل ومردودات الشراء.", href: "/reports/purchases-report", icon: <ShoppingCart />, module: "purchases_invoices" },
            { title: "كشف حساب الموردين", description: "عرض تفصيلي لجميع فواتير ودفعات مورد محدد.", href: "/reports/supplier-statement", icon: <BookUser />, module: "reports_supplierStatement" },
            { title: "مستحقات وأرصدة الموردين", description: "عرض إجمالي مستحقات كل مورد والمديونيات الآجلة.", href: "/reports/supplier-payables", icon: <Building2 />, module: "reports_supplierPayables" },
        ]
    },
    {
        name: "المخزون واللوجيستيك",
        value: "inventory",
        reports: [
            { title: "تقرير أرصدة المخازن", description: "عرض الأرصدة الحالية لجميع الأصناف في كل الفروع.", href: "/reports/stock-status", icon: <Warehouse />, module: "reports_stockStatus" },
            { title: "تقييم المخزون وحد إعادة الطلب", description: "تقييم البضاعة بسعر التكلفة والبيع وتنبيهات النواقص.", href: "/reports/inventory-valuation", icon: <Boxes />, module: "reports_stockStatus" },
            { title: "كارت الصنف التفصيلي", description: "تتبع كل الحركات (وارد وصادر) لصنف معين عبر المخازن.", href: "/reports/item-ledger", icon: <PackageSearch />, module: "reports_itemLedger" },
            { title: "تقرير أرباح الأصناف", description: "تحليل ربحية كل صنف بناءً على المبيعات والتكلفة.", href: "/reports/item-profit-loss", icon: <TrendingUp />, module: "reports_itemProfitLoss" },
            { title: "تقرير مبيعات الأقسام", description: "تحليل أداء المبيعات بناءً على التصنيفات الرئيسية.", href: "/reports/sales-by-category", icon: <FilePieChart />, module: "reports_salesByCategory" },
            { title: "تقرير التصنيع والمكونات", description: "تتبع استهلاك المواد الخام ومصفوفة جدوى التصنيع.", href: "/reports/recipe-reports", icon: <FileCog />, module: "reports_recipe" },
            { title: "تقرير تحويلات المخازن بين الفروع", description: "متابعة أذونات نقل البضاعة والشحنات في الطريق.", href: "/reports/stock-transfers-report", icon: <ArrowRightLeft />, module: "inventory_transfer" },
            { title: "تسويات الجرد والعجز والإعدامات", description: "حصر الفروقات الجردية وتكلفة الهالك والتالف والإعدام.", href: "/reports/inventory-adjustments-report", icon: <Scale />, module: "inventory_adjustment" },
            { title: "تقرير التسكين (الوارد)", description: "سجل عمليات إدخال البضاعة وتسكينها في الأقسام.", href: "/reports/stock-in-report", icon: <FileDown />, module: "inventory_stockIn" },
            { title: "تقرير السحب (الصادر)", description: "سجل عمليات سحب البضاعة من الأقسام.", href: "/reports/stock-out-report", icon: <FileUp />, module: "reports_stockOutReport" },
            { title: "سجل تغييرات الأسعار", description: "تتبع جميع التعديلات على أسعار وتكاليف الأصناف.", href: "/reports/price-change-logs", icon: <History />, module: "reports_priceChangeLogs" },
            { title: "تقرير عدم تطابق المخزون", description: "كشف العمليات غير المرحلة التي تؤثر على دقة المخزون.", href: "/reports/discrepancies", icon: <AlertTriangle />, module: "reports_discrepancies" },
            { title: "تقرير قرب انتهاء الصلاحية", description: "عرض الأصناف التي ستنتهي صلاحيتها قريبًا.", href: "/reports/item-expiry", icon: <FileClock />, module: "reports_itemExpiry" },
        ]
    },
    {
        name: "المالية والحسابات",
        value: "financial",
        reports: [
            { title: "القوائم المالية", description: "عرض قائمة الدخل، الميزانية العمومية، وميزان المراجعة.", href: "/reports/financial-statements", icon: <FilePieChart />, module: "reports_financialStatements" },
            { title: "تقرير المصروفات والتحليل المالي", description: "تحليل بنود المصروفات التشغيلية ومعدل الصرف اليومي.", href: "/reports/expenses-report", icon: <DollarSign />, module: "accounting_expenses" },
            { title: "كشف حساب عميل تفصيلي", description: "كشف حساب تفصيلي بحركات ومديونيات عميل محدد.", href: "/reports/customer-statement", icon: <BookUser />, module: "reports_customerReceivables" },
            { title: "مستحقات ومديونيات العملاء", description: "عرض إجمالي مستحقات كل عميل مع رسم بياني للآجل.", href: "/reports/customer-receivables", icon: <HandCoins />, module: "reports_customerReceivables" },
            { title: "كشف حساب الخزينة والبنوك", description: "تتبع جميع الحركات على خزينة أو حساب بنكي محدد.", href: "/reports/cash-account-statement", icon: <Coins />, module: "reports_cashAccountStatement" },
            { title: "إقرار ضريبة القيمة المضافة", description: "حساب ضريبة المخرجات والمدخلات وصافي الإقرار الضريبي.", href: "/reports/vat-report", icon: <Receipt />, module: "accounting_vat" },
            { title: "تقرير حصص الشركاء", description: "عرض حصص الشركاء من صافي الربح المحقق.", href: "/reports/partner-shares", icon: <Users />, module: "reports_partnerShares" },
        ]
    },
    {
        name: "الموارد البشرية والرواتب",
        value: "hr",
        reports: [
            { title: "كشف مسير الرواتب والأجور", description: "مسير رواتب شهري تفصيلي بالبدلات والخصومات والسلف.", href: "/reports/payroll-report", icon: <CreditCard />, module: "hr_payroll" },
        ]
    }
];

export default function ReportsHubPage() {
    return (
        <>
            <PageHeader title="مركز التقارير" />
            <main className="flex-1 p-4 md:p-6">
                <Tabs defaultValue="sales" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto p-1 gap-1">
                        {reportCategories.map(category => (
                            <TabsTrigger key={category.value} value={category.value} className="text-xs py-2">{category.name}</TabsTrigger>
                        ))}
                    </TabsList>
                    {reportCategories.map(category => (
                        <TabsContent key={category.value} value={category.value} className="mt-4">
                            <Card className="border shadow-sm">
                                <CardContent className="pt-6">
                                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                        {category.reports.map((report) => (
                                            <ReportCard key={report.href} {...report} />
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    ))}
                </Tabs>
            </main>
        </>
    );
}
