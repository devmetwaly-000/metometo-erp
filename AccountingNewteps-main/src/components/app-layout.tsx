
"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarTrigger,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";

import { Badge } from "@/components/ui/badge";
import {
  Wifi,
  WifiOff,
  LayoutDashboard,
  Package,
  PackagePlus,
  Users,
  BookUser,
  AreaChart,
  Settings,
  ChevronDown,
  Boxes,
  ShoppingCart,
  ShoppingBag,
  BarChart,
  History,
  Gift,
  Warehouse,
  ArrowRightLeft,
  Banknote,
  DatabaseBackup,
  Landmark,
  Wallet,
  UserRound,
  Calculator,
  Undo2,
  Truck,
  FileUp,
  FileDown,
  Coins,
  LogOut,
  FileCheck,
  Monitor,
  List,
  Laptop,
  Group,
  Receipt,
  FilePieChart,
  UserSquare,
  Building2,
  Users2,
  PackageSearch,
  BookCopy,
  Printer,
  QrCode,
  PowerOff,
  ClipboardList,
  PanelLeft,
  FileText,
  Upload,
  Library,
  Layers3,
  Computer,
  Search,
  DollarSign,
  TrendingUp,
  FileX,
  AlertTriangle,
  HandCoins,
  Percent,
  Bike,
  Component,
  Home,
  Cloud,
  CloudOff,
  Palette,
  ArrowLeft,
  Moon,
  Sun,
  LayoutGrid, 
  ClipboardPlus,
  Scale,
  Loader2,
  KeyRound,
  ZoomIn,
  ZoomOut,
  Lightbulb,
  Archive,
  MapPin,
  HeartHandshake,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ModeToggle } from "@/components/mode-toggle";
import { usePermissions } from "@/contexts/permissions-context";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "./ui/button";
import { useData } from "@/contexts/data-provider";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { AppMenubar } from "./app-menubar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { ModernNavHub } from "./modern-nav-hub";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LicenseActivationForm } from "./license-activation-form";
import { Slider } from "./ui/slider";
import { Label } from "./ui/label";
import { dictionary } from "@/lib/dictionary";
import { Progress } from "@/components/ui/progress";


const Logo = () => {
  const { settings, isOnline, retryDatabaseConnection } = useData();
  const companyName = settings?.main?.general?.companyName || "Meto";
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (retrying) return;
    setRetrying(true);
    try {
      await retryDatabaseConnection();
    } finally {
      setTimeout(() => setRetrying(false), 500);
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-0 max-w-full">
        <img src="/logo.svg" alt="Logo" className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg shrink-0 object-contain" />
        <div className="flex flex-col min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-yellow-500 dark:text-yellow-400 leading-none truncate">{companyName}</h1>
            {!isOnline ? (
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1 text-[9px] sm:text-[10px] text-destructive hover:text-destructive/80 font-semibold truncate hover:underline cursor-pointer"
                title="اضغط هنا لإعادة فحص الاتصال وتحديث الحالة فوراً"
              >
                <span>وضع الأوفلاين</span>
                <RefreshCw className={`h-2.5 w-2.5 shrink-0 ${retrying ? 'animate-spin' : ''}`} />
              </button>
            ) : null}
        </div>
    </div>
  );
};

const normalizeArabicSearch = (text: string): string => {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F]/g, "")
    .trim();
};

const matchesSearch = (text: string | undefined, query: string): boolean => {
  const normQuery = normalizeArabicSearch(query);
  if (!normQuery) return true;
  if (!text) return false;
  const normText = normalizeArabicSearch(text);
  const words = normQuery.split(/\s+/).filter(Boolean);
  return words.every((w) => normText.includes(w));
};

const NavLink = ({ href, children, icon, module }: { href: string; children: React.ReactNode; icon: React.ReactNode, module: string }) => {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { can } = usePermissions();
  const isActive = pathname === href;
  
  if (!can('view', module)) {
    return null;
  }

  return (
    <SidebarMenuItem className="my-0">
      <SidebarMenuButton asChild isActive={isActive} className="h-auto min-h-8 py-1.5 px-2.5 text-[13px] leading-snug">
        <Link 
          href={href} 
          prefetch={true}
          onClick={() => setOpenMobile(false)}
          className="flex items-center gap-2 w-full text-right"
        >
          {icon}
          <span className="flex-1 text-right leading-snug break-words whitespace-normal">{children}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

const NavCollapsible = ({ title, icon, children, modules, searchTerm, defaultOpen, isSubCollapsible, innerTabHeightClass, innerTabHeightPx }: { title: string; icon: React.ReactNode; children: React.ReactNode; modules: readonly string[], searchTerm: string, defaultOpen?: boolean, isSubCollapsible?: boolean, innerTabHeightClass: string, innerTabHeightPx: number }) => {
    const pathname = usePathname();
    const { can } = usePermissions();
    
    // Check if user can view any of the direct children or any children of nested collapsibles
    const canViewAnyChild = (items: React.ReactNode): boolean => {
        return React.Children.toArray(items).some((child) => {
            if (React.isValidElement(child)) {
                if ((child.props as any).module && can('view', (child.props as any).module)) {
                    return true;
                }
                if ((child.props as any).children) {
                    return canViewAnyChild((child.props as any).children);
                }
            }
            return false;
        });
    };

    const isAnyChildActive = (items: React.ReactNode): boolean => {
        return React.Children.toArray(items).some((child: any) => {
             if (React.isValidElement(child)) {
                 if((child.props as any).href && pathname.startsWith((child.props as any).href)) {
                     return true;
                 }
                 if((child.props as any).children){
                     return isAnyChildActive((child.props as any).children);
                 }
             }
             return false;
        });
    };

    const [isOpen, setIsOpen] = useState<boolean>(() => Boolean(defaultOpen || isAnyChildActive(children)));

    useEffect(() => {
        if (isAnyChildActive(children)) {
            setIsOpen(true);
        }
    }, [pathname]);

    if (!canViewAnyChild(children)) {
        return null;
    }

    // Recursive filter supporting sub-tabs and sub-sub-tabs of any depth
    const filterNodesRecursive = (nodes: React.ReactNode, query: string): React.ReactNode[] => {
        const trimmed = query.trim();
        if (!trimmed) return React.Children.toArray(nodes);

        return React.Children.toArray(nodes).reduce<React.ReactNode[]>((acc, child: any) => {
            if (!React.isValidElement(child)) return acc;
            const props = child.props as any;

            // Nested NavCollapsible (sub-tab group containing sub-sub-tabs)
            if (props.title && props.children) {
                const subTitleMatch = matchesSearch(props.title, trimmed);
                const matchingNested = filterNodesRecursive(props.children, trimmed);
                if (subTitleMatch || matchingNested.length > 0) {
                    acc.push(child);
                }
                return acc;
            }

            // Leaf link item
            const textContent = typeof props.children === 'string'
                ? props.children
                : Array.isArray(props.children)
                  ? props.children.filter((c: any) => typeof c === 'string').join(' ')
                  : '';

            if (matchesSearch(textContent, trimmed) || matchesSearch(props.title, trimmed)) {
                acc.push(child);
            }
            return acc;
        }, []);
    };

    const isSearching = searchTerm.trim().length > 0;
    const titleMatches = isSearching && matchesSearch(title, searchTerm);
    const filteredChildren = isSearching ? filterNodesRecursive(children, searchTerm) : [];

    if (isSearching && !titleMatches && filteredChildren.length === 0) {
        return null;
    }

    const childrenToRender = isSearching
        ? (filteredChildren.length > 0 ? filteredChildren : children)
        : children;

    return (
        <Collapsible
            open={isSearching ? true : isOpen}
            onOpenChange={(nextOpen) => {
                if (!isSearching) setIsOpen(nextOpen);
            }}
        >
            <SidebarMenuItem className="my-0">
                <CollapsibleTrigger asChild>
                     <SidebarMenuButton style={isSubCollapsible ? { minHeight: `${innerTabHeightPx}px` } : undefined} className={cn(
                         "h-auto w-full leading-normal",
                         isSubCollapsible ? `${innerTabHeightClass} px-2 text-xs` : "min-h-8 py-1.5 px-2.5 text-[13px]"
                     )}>
                        {icon}
                        <span className="flex-1 text-right leading-normal break-words whitespace-normal font-medium">{title}</span>
                        <ChevronDown className="mr-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
            </SidebarMenuItem>
            <CollapsibleContent asChild>
                <SidebarMenuSub>{childrenToRender}</SidebarMenuSub>
            </CollapsibleContent>
        </Collapsible>
    );
};

const NavSubLink = ({ href, children, module, innerTabHeightClass, innerTabHeightPx }: { href: string; children: React.ReactNode, module: string, innerTabHeightClass: string, innerTabHeightPx: number }) => {
    const pathname = usePathname();
    const { setOpenMobile } = useSidebar();
    const { can } = usePermissions();
    const isActive = pathname === href || pathname.startsWith(`${href}/`);

    if (!can('view', module)) {
        return null;
    }

    return (
        <SidebarMenuSubItem className="my-0 p-0">
            <SidebarMenuSubButton asChild isActive={isActive} style={{ minHeight: `${innerTabHeightPx}px` }} className={cn("h-auto w-full", innerTabHeightClass)}>
                <Link 
                    href={href} 
                    prefetch={true}
                    onClick={() => setOpenMobile(false)}
                    className="flex items-center gap-1.5 w-full text-right"
                >
                    <span className="flex-1 text-right leading-tight break-words whitespace-normal font-medium">{children}</span>
                </Link>
            </SidebarMenuSubButton>
        </SidebarMenuSubItem>
    );
};

export const navStructure = [
    { type: 'link', href: '/dashboard', icon: <LayoutDashboard />, module: 'dashboard', title: dictionary.nav.dashboard },
    { type: 'link', href: '/tables', icon: <LayoutDashboard />, module: 'restaurant_tables', title: dictionary.nav.tablesScreen },
    { type: 'collapsible', title: dictionary.nav.pos, icon: <Receipt />, modules: ['pos', 'pos_terminals', 'pos_itemGroups', 'pos_sessions', 'sales_posReturns', 'pos_paymentMethods', 'restaurant_tables'], children: [
        { type: 'link', href: '/pos', module: 'pos', title: dictionary.nav.pos },
        { type: 'link', href: '/master-data/pos-terminals', module: 'pos_terminals', title: dictionary.nav.posTerminalAdmin },
        { type: 'link', href: '/master-data/payment-methods', module: 'pos_paymentMethods', title: dictionary.nav.paymentMethodsAdmin },
        { type: 'link', href: '/master-data/item-groups', module: 'pos_itemGroups', title: dictionary.nav.posItemGroups },
        { type: 'link', href: '/pos/sessions', module: 'pos_sessions', title: dictionary.nav.posSessionAdmin },
        { type: 'link', href: '/sales/returns/pos', module: 'sales_posReturns', title: dictionary.nav.posReturns },
    ]},
    { type: 'collapsible', title: dictionary.nav.marketing, icon: <Percent />, modules: ['marketing_promotions', 'inventory_priceUpdate', 'marketing_targets', 'sellers_data'], children: [
        { type: 'link', href: '/marketing/promotions', module: 'marketing_promotions', title: dictionary.nav.promotions },
        { type: 'link', href: '/reports/promotions', module: 'marketing_promotions', title: 'تحليلات وتدقيق العروض' },
        { type: 'link', href: '/marketing/price-adjustments', module: 'inventory_priceUpdate', title: dictionary.nav.priceAdjustments },
        { type: 'link', href: '/master-data/sellers', module: 'sellers_data', title: dictionary.nav.sellersAdmin },
        { type: 'link', href: '/marketing/targets', module: 'marketing_targets', title: dictionary.nav.targetsAdmin },
    ]},
    { type: 'collapsible', title: dictionary.nav.itemsAndPricing, icon: <PackageSearch />, modules: [
        'inventory_items_list', 'inventory_items_categories', 
        'inventory_items_colors', 'inventory_items_sizes', 'inventory_items_deleted', 
        'inventory_importItems', 'inventory_barcodeDesigner', 'inventory_barcodePrint'
    ], children: [
        { type: 'link', href: '/master-data/item-categories', module: 'inventory_items_categories', title: dictionary.nav.itemClassifications },
        { type: 'link', href: '/master-data/items', module: 'inventory_items_list', title: dictionary.nav.itemsList },
        { type: 'link', href: '/master-data/items/deleted', module: 'inventory_items_deleted', title: dictionary.nav.deletedItems },
        { type: 'link', href: '/inventory/import-items', module: 'inventory_importItems', title: dictionary.nav.importFromExcel },
        { type: 'link', href: '/inventory/barcode-designer', module: 'inventory_barcodeDesigner', title: dictionary.nav.barcodeDesigner },
        { type: 'link', href: '/inventory/barcode-print', module: 'inventory_barcodePrint', title: dictionary.nav.barcodeBulkPrint },
        { type: 'link', href: '/inventory/scale-export', module: 'inventory_items_list', title: 'موازين الباركود الإلكترونية (PLU)' },
    ]},
    { type: 'collapsible', title: dictionary.nav.warehouses, icon: <Warehouse />, modules: ['inventory_warehouses', 'inventory_goodsInTransit', 'inventory_requisitions_recommendations', 'inventory_stockOut', 'inventory_transfer', 'inventory_adjustment', 'inventory_movements', 'inventory_requisitions', 'reports_recipe'], children: [
        { type: 'link', href: '/master-data/branches', module: 'inventory_warehouses', title: dictionary.nav.branches },
        { type: 'link', href: '/master-data/delegate-warehouses', module: 'inventory_warehouses', title: "مخازن المناديب" },
        { type: 'link', href: '/manufacturing/orders', module: 'reports_recipe', title: 'أوامر التصنيع والتشغيل' },
        { type: 'link', href: '/inventory/goods-in-transit', module: 'inventory_goodsInTransit', title: dictionary.nav.goodsInTransit },
        { type: 'link', href: '/inventory/requisitions/recommendations', icon: <Lightbulb />, module: 'inventory_requisitions_recommendations', title: dictionary.nav.requisitionRecommendations },
        { type: 'link', href: '/inventory/requisitions', module: 'inventory_requisitions', title: dictionary.nav.requisitions },
        { type: 'link', href: '/inventory/stock-out', module: 'inventory_stockOut', title: dictionary.nav.stockOut },
        { type: 'link', href: '/inventory/transfer', module: 'inventory_transfer', title: dictionary.nav.stockTransfer },
        { type: 'link', href: '/inventory/adjustment', module: 'inventory_adjustment', title: dictionary.nav.stockAdjustment },
        { type: 'link', href: '/inventory/movements', module: 'inventory_movements', title: dictionary.nav.stockMovements },
    ]},
    { type: 'collapsible', title: dictionary.nav.logistics, icon: <LayoutGrid />, modules: ['inventory_zones', 'inventory_requisitions', 'inventory_stockIn', 'reports_stockOutReport', 'inventory_stockStatus', 'inventory_movements'], children: [
        { type: 'link', href: '/inventory/zones', module: 'inventory_zones', title: dictionary.nav.mainWarehousesAndSections },
        { type: 'link', href: '/inventory/stock-in', module: 'inventory_stockIn', title: dictionary.nav.stockIn },
        { type: 'link', href: '/inventory/requisitions/processing', module: 'inventory_requisitions', title: dictionary.nav.processRequisitions },
        { type: 'link', href: '/inventory/requisitions/fulfilled', module: 'inventory_requisitions', title: dictionary.nav.fulfilledRequisitions },
        { type: 'collapsible', title: dictionary.nav.logisticsReports, modules: ['reports_stockOutReport', 'inventory_stockIn', 'inventory_stockStatus', 'inventory_movements', 'reports_discrepancies'], children: [
             { type: 'link', href: '/reports/stock-in-report', module: 'inventory_stockIn', title: "سجل التسكين (الوارد)" },
             { type: 'link', href: '/reports/stock-out-report', module: 'reports_stockOutReport', title: "سجل السحب (الصادر)" },
             { type: 'link', href: '/reports/stock-status', module: 'inventory_stockStatus', title: "كشف أرصدة المخازن" },
             { type: 'link', href: '/reports/discrepancies', module: 'reports_discrepancies', title: "سجل عدم تطابق المخزون" },
        ]},
    ]},
    { type: 'collapsible', title: dictionary.nav.customersAndSales, icon: <UserSquare />, modules: ['customers_data', 'sales_invoices', 'sales_returns', 'accounting_customerPayments'], children: [
        { type: 'link', href: '/master-data/customers', module: 'customers_data', title: dictionary.nav.customersData },
        { type: 'link', href: '/sales/invoices/list', module: 'sales_invoices', title: dictionary.nav.salesInvoices },
        { type: 'link', href: '/sales/returns', module: 'sales_returns', title: dictionary.nav.salesReturns },
        { type: 'link', href: '/accounting/customer-payments', module: 'accounting_customerPayments', title: dictionary.nav.customerPayments },
    ]},
    { type: 'collapsible', title: dictionary.nav.suppliersAndPurchases, icon: <Building2 />, modules: ['suppliers_data', 'purchases_invoices', 'purchases_orders', 'purchases_returns', 'accounting_supplierPayments'], children: [
        { type: 'link', href: '/master-data/suppliers', module: 'suppliers_data', title: dictionary.nav.suppliersData },
        { type: 'link', href: '/purchases/orders', module: 'purchases_orders', title: 'أوامر الشراء' },
        { type: 'link', href: '/purchases/invoices/list', module: 'purchases_invoices', title: dictionary.nav.purchaseInvoices },
        { type: 'link', href: '/purchases/returns/new', module: 'purchases_returns', title: dictionary.nav.purchaseReturns },
        { type: 'link', href: '/accounting/supplier-payments', module: 'accounting_supplierPayments', title: dictionary.nav.supplierPayments },
    ]},
    { type: 'collapsible', title: dictionary.nav.accountingAndFinance, icon: <BookCopy />, modules: ['accounting_journal', 'accounting_expenses', 'accounting_exceptionalIncome', 'accounting_treasury', 'accounting_profitDistribution', 'accounting_assets', 'accounting_vat', 'accounting_gratuity'], children: [
        { type: 'link', href: '/accounting/chart-of-accounts', module: 'accounting_journal', title: 'دليل الحسابات (شجرة الحسابات)' },
        { type: 'link', href: '/accounting/journal', module: 'accounting_journal', title: dictionary.nav.journal },
        { type: 'link', href: '/accounting/posting', module: 'accounting_journal', title: 'ترحيل القيود المركزية' },
        { type: 'link', href: '/accounting/assets', module: 'accounting_assets', title: dictionary.nav.fixedAssets },
        { type: 'link', href: '/accounting/vat', module: 'accounting_vat', title: dictionary.nav.vatReport },
        { type: 'link', href: '/accounting/expenses', module: 'accounting_expenses', title: dictionary.nav.expensesAdmin },
        { type: 'link', href: '/accounting/exceptional-income', module: 'accounting_exceptionalIncome', title: dictionary.nav.exceptionalIncome },
        { type: 'link', href: '/accounting/gratuity', module: 'accounting_gratuity', icon: <HeartHandshake />, title: "صندوق الإكراميات (Tips)" },
        { type: 'link', href: '/accounting/treasury', module: 'accounting_treasury', title: dictionary.nav.treasuryMovements },
        { type: 'link', href: '/accounting/profit-distribution', module: 'accounting_profitDistribution', title: dictionary.nav.profitDistribution },
        { type: 'link', href: '/reports/financial-statements', module: 'reports_financialStatements', title: 'القوائم المالية (ميزانية / دخل / أرباح)' },
    ]},
    { type: 'collapsible', title: dictionary.nav.employeesAndSalesReps, icon: <Users2 />, modules: ['users', 'partners_data', 'sales_issueToRep', 'sales_returnFromRep', 'sales_rep_new_invoice', 'sales_rep_my_invoices', 'sales_repInvoices', 'sales_repOperations', 'sales_remitFromRep', 'sales_recordVisit', 'sales_monitorVisits', 'sales_monitorLogins'], children: [
      { type: 'link', href: '/users', module: 'users', title: dictionary.nav.usersAndSalesReps },
      { type: 'link', href: '/master-data/partners', module: 'partners_data', title: dictionary.nav.partnersData },
      { type: 'link', href: '/sales/issue-to-rep/new', module: 'sales_issueToRep', title: dictionary.nav.issueToRep },
      { type: 'link', href: '/sales/issue-to-rep/list', module: 'sales_issueToRep', title: 'سجل أذونات الصرف' },
      { type: 'link', href: '/sales/return-from-rep/new', module: 'sales_returnFromRep', title: dictionary.nav.returnFromRep },
      { type: 'link', href: '/sales/rep-invoice', module: 'sales_rep_new_invoice', title: 'إنشاء فاتورة مندوب' },
      { type: 'link', href: '/sales/my-invoices', module: 'sales_rep_my_invoices', title: 'فواتيري' },
      { type: 'link', href: '/sales/rep-invoices', module: 'sales_repInvoices', title: dictionary.nav.approveRepInvoices },
      { type: 'link', href: '/sales/rep-operations', module: 'sales_repOperations', title: dictionary.nav.repOperations },
      { type: 'link', href: '/sales/field-sales-management', module: 'sales_repOperations', title: 'خطوط السير وعمولات وجرد المناديب (Van Sales)' },
      { type: 'link', href: '/sales/remit-from-rep', module: 'sales_remitFromRep', title: dictionary.nav.remitFromRep },
      { type: 'link', href: '/sales/record-visit', icon: <MapPin/>, module: 'sales_recordVisit', title: 'تسجيل زيارة' },
      { type: 'link', href: '/sales/monitor-visits', module: 'sales_monitorVisits', title: 'متابعة الزيارات' },
      { type: 'link', href: '/sales/monitor-logins', module: 'sales_monitorLogins', title: 'مراقبة تسجيلات الدخول' },
    ]},
    { type: 'collapsible', title: dictionary.nav.delivery, icon: <Bike />, modules: ['delivery_staff', 'delivery_operations', 'sales_deliveryReconciliation'], children: [
      { type: 'link', href: '/delivery/staff', module: 'delivery_staff', title: dictionary.nav.deliveryStaffAdmin },
      { type: 'link', href: '/delivery/operations', module: 'delivery_operations', title: dictionary.nav.deliveryOperations },
      { type: 'link', href: '/sales/delivery-reconciliation', module: 'sales_deliveryReconciliation', title: dictionary.nav.deliveryReconciliation },
    ]},
    { type: 'collapsible', title: dictionary.nav.hr, icon: <UserRound />, modules: ['hr_advances', 'hr_adjustments', 'hr_payroll'], children: [
        { type: 'link', href: '/hr/employees', module: 'hr_payroll', title: 'دليل الموظفين وشؤون العاملين' },
        { type: 'link', href: '/hr/advances', module: 'hr_advances', title: dictionary.nav.employeeAdvances },
        { type: 'link', href: '/hr/adjustments', module: 'hr_adjustments', title: dictionary.nav.employeeAdjustments },
        { type: 'link', href: '/hr/payroll', module: 'hr_payroll', title: dictionary.nav.payroll },
    ]},
     { type: 'collapsible', title: dictionary.nav.reports, icon: <BarChart />, modules: ['analytics', 'reports_recipe', 'reports_customerReceivables', 'reports_supplierPayables', 'reports_supplierStatement', 'reports_itemProfitLoss', 'reports_salesByCategory', 'reports_itemLedger', 'reports_financialStatements', 'reports_partnerShares', 'reports_sales', 'reports_pos', 'reports_posSales', 'reports_itemSalesCount', 'reports_priceChangeLogs', 'inventory_movements', 'reports_pos', 'sales_returns', 'reports_cashAccountStatement', 'reports_itemExpiry', 'reports_restaurantTables', 'reports_sellerTargets', 'inventory_stockIn', 'reports_stockStatus', 'reports_stockOutReport', 'accounting_expenses', 'accounting_vat', 'purchases_invoices', 'inventory_transfer', 'inventory_adjustment', 'hr_payroll'], children: [
        { type: 'link', href: '/reports', module: 'reports_sales', title: "مركز التقارير الموحد" },
        { type: 'link', href: '/analytics', module: 'analytics', title: dictionary.nav.graphicalAnalytics },
        { type: 'collapsible', title: "الرقابة وتدقيق نقاط البيع", modules: ['reports_pos'], children: [
            { type: 'link', href: '/reports/pos-reconciliation', module: 'reports_pos', title: "المطابقة والرقابة لنقاط البيع" },
            { type: 'link', href: '/reports/cashier-discrepancies', module: 'reports_pos', title: dictionary.nav.cashierDiscrepancies },
            { type: 'link', href: '/reports/payment-methods-report', module: 'reports_pos', title: dictionary.nav.paymentMethodsReport },
            { type: 'link', href: '/reports/cancelled-invoices', module: 'reports_pos', title: dictionary.nav.cancelledInvoices },
        ]},
        { type: 'collapsible', title: dictionary.nav.salesReports, modules: ['reports_sales', 'reports_posSales', 'reports_pos', 'sales_returns', 'reports_itemSalesCount', 'reports_restaurantTables', 'reports_sellerTargets'], children: [
            { type: 'link', href: '/reports/sales-reports', module: 'reports_sales', title: dictionary.nav.detailedSalesReport },
            { type: 'link', href: '/reports/pos-sales', module: 'reports_posSales', title: dictionary.nav.posSalesSummary },
            { type: 'link', href: '/reports/pos-reports', module: 'reports_pos', title: dictionary.nav.detailedPosReport },
            { type: 'link', href: '/reports/sales-by-customer', module: 'reports_sales', title: "مبيعات العملاء الإجمالية" },
            { type: 'link', href: '/reports/rep-sales-report', module: 'reports_sales', title: "تقرير مبيعات وأداء المناديب" },
            { type: 'link', href: '/reports/fast-slow-moving', module: 'reports_sales', title: "الأصناف الأكثر مبيعاً والراكدة" },
            { type: 'link', href: '/reports/sales-returns-report', module: 'sales_returns', title: dictionary.nav.salesReturnsReport },
            { type: 'link', href: '/reports/item-sales-count', module: 'reports_itemSalesCount', title: dictionary.nav.itemSalesCountReport },
            { type: 'link', href: '/reports/tables-report', module: 'reports_restaurantTables', title: dictionary.nav.tablesReport },
            { type: 'link', href: '/reports/seller-targets', module: 'reports_sellerTargets', title: dictionary.nav.sellerTargetsReport },
        ]},
        { type: 'collapsible', title: "تقارير المشتريات والموردين", modules: ['purchases_invoices', 'reports_supplierPayables', 'reports_supplierStatement'], children: [
            { type: 'link', href: '/reports/purchases-report', module: 'purchases_invoices', title: "تقرير المشتريات التفصيلي ومردوداتها" },
            { type: 'link', href: '/reports/supplier-statement', module: 'reports_supplierStatement', title: dictionary.nav.supplierStatement },
            { type: 'link', href: '/reports/supplier-payables', module: 'reports_supplierPayables', title: dictionary.nav.supplierPayables },
        ]},
        { type: 'collapsible', title: dictionary.nav.inventoryAndLogisticsReports, modules: ['reports_itemProfitLoss', 'reports_salesByCategory', 'reports_itemLedger', 'reports_priceChangeLogs', 'inventory_movements', 'reports_itemExpiry', 'reports_recipe', 'inventory_stockStatus', 'inventory_stockIn', 'reports_stockOutReport', 'reports_discrepancies', 'inventory_transfer', 'inventory_adjustment'], children: [
            { type: 'link', href: '/reports/stock-status', module: 'inventory_stockStatus', title: dictionary.nav.stockStatusReport },
            { type: 'link', href: '/reports/inventory-valuation', module: 'inventory_stockStatus', title: "تقييم المخزون وحد إعادة الطلب والنواقص" },
            { type: 'link', href: '/reports/item-ledger', module: 'reports_itemLedger', title: dictionary.nav.itemLedger },
            { type: 'link', href: '/reports/item-profit-loss', module: 'reports_itemProfitLoss', title: dictionary.nav.itemProfitLossReport },
            { type: 'link', href: '/reports/sales-by-category', module: 'reports_salesByCategory', title: dictionary.nav.salesByCategoryReport },
            { type: 'link', href: '/reports/recipe-reports', module: 'reports_recipe', title: dictionary.nav.manufacturingReports },
            { type: 'link', href: '/reports/inventory-movements-cost', module: 'inventory_adjustment', title: "تقرير تكاليف الصرف والتحويلات والهوالك" },
            { type: 'link', href: '/reports/stock-transfers-report', module: 'inventory_transfer', title: "تقرير تحويلات المخازن بين الفروع" },
            { type: 'link', href: '/reports/inventory-adjustments-report', module: 'inventory_adjustment', title: "تسويات الجرد والعجز والإعدامات" },
            { type: 'link', href: '/reports/frozen-balances', module: 'inventory_adjustment', title: "تقرير الأرصدة الدفترية المجنّبة" },
            { type: 'link', href: '/reports/stock-in-report', module: 'inventory_stockIn', title: dictionary.nav.stockInReport },
            { type: 'link', href: '/reports/stock-out-report', module: 'reports_stockOutReport', title: dictionary.nav.stockOutReport },
            { type: 'link', href: '/reports/discrepancies', module: 'reports_discrepancies', title: dictionary.nav.stockDiscrepancyReport },
            { type: 'link', href: '/reports/item-expiry', module: 'reports_itemExpiry', title: dictionary.nav.itemExpiryReport },
            { type: 'link', href: '/reports/price-change-logs', module: 'reports_priceChangeLogs', title: dictionary.nav.priceChangeLog },
        ]},
        { type: 'collapsible', title: dictionary.nav.financialAndAccountsReports, modules: ['reports_customerReceivables', 'reports_supplierPayables', 'reports_supplierStatement', 'reports_cashAccountStatement', 'reports_partnerShares', 'reports_financialStatements', 'accounting_expenses', 'accounting_vat'], children: [
            { type: 'link', href: '/reports/liquidity', module: 'reports_financialStatements', title: "تحليلات السيولة ومواعيد الاستحقاق" },
            { type: 'link', href: '/reports/financial-statements', module: 'reports_financialStatements', title: dictionary.nav.financialStatements },
            { type: 'link', href: '/reports/expenses-report', module: 'accounting_expenses', title: "تقرير المصروفات والتحليل المالي" },
            { type: 'link', href: '/reports/customer-statement', module: 'reports_customerReceivables', title: "كشف حساب عميل تفصيلي" },
            { type: 'link', href: '/reports/customer-receivables', module: 'reports_customerReceivables', title: dictionary.nav.customerReceivables },
            { type: 'link', href: '/reports/cash-account-statement', module: 'reports_cashAccountStatement', title: dictionary.nav.cashAccountStatement },
            { type: 'link', href: '/reports/vat-report', module: 'accounting_vat', title: "إقرار ضريبة القيمة المضافة" },
            { type: 'link', href: '/reports/partner-shares', module: 'reports_partnerShares', title: dictionary.nav.partnerSharesReport },
        ]},
        { type: 'collapsible', title: "تقارير الموارد البشرية والرواتب", modules: ['hr_payroll', 'hr_advances'], children: [
            { type: 'link', href: '/reports/payroll-report', module: 'hr_payroll', title: "كشف مسير الرواتب والأجور الشهرية" },
        ]},
    ]},
    { type: 'collapsible', title: dictionary.nav.settings, icon: <Settings />, modules: ['settings_users', 'settings_roles', 'settings_general', 'settings_backup', 'settings_periodClosing', 'settings_cashAccounts', 'settings_printers', 'settings_receiptDesigner', 'settings_restaurantTables', 'settings_theme', 'settings_eInvoice', 'settings_licenses', 'settings_sync'], children: [
      { type: 'link', href: '/users', module: 'settings_users', title: dictionary.nav.users },
      { type: 'link', href: '/roles', module: 'settings_roles', title: dictionary.nav.rolesAndPermissions },
      { type: 'link', href: '/settings/audit-trail', module: 'settings_general', title: 'سجل التدقيق الرقابي' },
      { type: 'link', href: '/master-data/cash-accounts', module: 'settings_cashAccounts', title: dictionary.nav.cashAndBanks },
      { type: 'link', href: '/master-data/restaurant-tables', module: 'settings_restaurantTables', title: dictionary.nav.tablesAdmin },
      { type: 'link', href: '/settings', module: 'settings_general', title: dictionary.nav.generalSettings },
      { type: 'link', href: '/settings/customer-experience', module: 'settings_general', title: 'تجربة العملاء ونقاط الولاء والشاشة الثانية' },
      { type: 'link', href: '/settings/e-invoice', module: 'settings_eInvoice', title: dictionary.nav.eInvoiceSettings },
      { type: 'link', href: '/settings/theme', module: 'settings_theme', title: dictionary.nav.themeSettings },
      { type: 'link', href: '/settings/printers', module: 'settings_printers', title: dictionary.nav.printSettings },
      { type: 'link', href: '/settings/receipt-designer', module: 'settings_receiptDesigner', title: dictionary.nav.receiptDesigner },
      { type: 'link', href: '/settings/license-keys', module: 'settings_licenses', title: dictionary.nav.licenseKeys },
      { type: 'link', href: '/settings/backup', module: 'settings_backup', title: dictionary.nav.backupAndRestore },
      { type: 'link', href: '/settings/period-closing', module: 'settings_periodClosing', title: dictionary.nav.periodClosing },
      { type: 'link', href: '/settings/central-sync', module: 'settings_sync', title: 'المزامنة المركزية والجدولة' },
      { type: 'link', href: '/settings/re-engineer', module: 'settings_sync', title: 'إدارة السيرفرات وقواعد البيانات (الفرع والإدارة)' },
    ]},
] as const;

const MobileSidebar = () => {
    const { user, signOut } = useAuth();
    const { settings } = useData();
    const [searchTerm, setSearchTerm] = useState('');
    const { openMobile, setOpenMobile } = useSidebar();
    const configuredTabHeight = settings?.main?.general?.innerTabHeight || settings?.general?.innerTabHeight || 'compact';
    const innerTabHeightPx = configuredTabHeight === 'compact' ? 22 : configuredTabHeight === 'comfortable' ? 32 : 26;
    const innerTabHeightClass = configuredTabHeight === 'compact'
        ? 'min-h-[22px] py-0 px-2 text-[11.5px]'
        : configuredTabHeight === 'comfortable'
            ? 'min-h-[32px] py-1.5 px-2 text-xs'
            : 'min-h-[26px] py-0.5 px-2 text-xs';

    return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
             <SheetContent 
                side="right" 
                className="w-[var(--sidebar-width-mobile)] bg-sidebar p-0 text-sidebar-foreground flex flex-col" 
                style={{ '--sidebar-width-mobile': '285px' } as React.CSSProperties}
                onOpenAutoFocus={(event) => event.preventDefault()}
            >
                 <SheetHeader className="p-2.5 border-b">
                     <SheetTitle>
                        <Logo />
                     </SheetTitle>
                     <SheetDescription className="sr-only">قائمة التنقل الرئيسية</SheetDescription>
                 </SheetHeader>
                  <div className="px-2 py-1.5">
                      <div className="relative">
                          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input placeholder="بحث في جميع التبويبات..." className="h-8 pr-8 pl-7 text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                          {searchTerm && (
                              <button
                                  type="button"
                                  onClick={() => setSearchTerm('')}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                  <X className="h-3.5 w-3.5" />
                              </button>
                          )}
                      </div>
                  </div>
                 <SidebarContent>
                     <SidebarMenu>
                         {navStructure.map((item: any) => {
                             if (item.type === 'link') {
                                 if (matchesSearch(item.title, searchTerm)) {
                                     return <NavLink key={item.href} href={item.href || '/'} icon={item.icon} module={item.module || ''}>{item.title}</NavLink>;
                                 }
                                 return null;
                             }
                             if (item.type === 'collapsible') {
                                 return (
                                     <NavCollapsible key={item.title} title={item.title} icon={item.icon} modules={item.modules} searchTerm={searchTerm} innerTabHeightClass={innerTabHeightClass} innerTabHeightPx={innerTabHeightPx}>
                                         {item.children?.map((child: any) => {
                                             if (child.type === 'collapsible') {
                                                 return (
                                                      <NavCollapsible key={child.title} title={child.title} icon={<div className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />} modules={child.modules || []} searchTerm={searchTerm} isSubCollapsible innerTabHeightClass={innerTabHeightClass} innerTabHeightPx={innerTabHeightPx}>
                                                          {child.children?.map((subChild: any) => (
                                                              <NavSubLink key={subChild.href} href={subChild.href} module={subChild.module} innerTabHeightClass={innerTabHeightClass} innerTabHeightPx={innerTabHeightPx}>{subChild.title}</NavSubLink>
                                                          ))}
                                                      </NavCollapsible>
                                                 );
                                             }
                                             if(child.type === 'link') {
                                                return <NavSubLink key={child.href} href={child.href} module={child.module} innerTabHeightClass={innerTabHeightClass} innerTabHeightPx={innerTabHeightPx}>{child.title}</NavSubLink>
                                             }
                                             return null;
                                         })}
                                     </NavCollapsible>
                                 );
                             }
                             return null;
                         })}
                     </SidebarMenu>
                 </SidebarContent>
                 <SidebarFooter>
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-card m-1.5">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 p-1 h-auto justify-start w-full">
                                    <Avatar className="h-7 w-7">
                                        <AvatarImage src={(user as any)?.photoUrl || user?.photoURL || ''} />
                                        <AvatarFallback className="text-xs">{user?.name?.charAt(0) || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col flex-1 overflow-hidden text-right">
                                        <span className="font-semibold text-xs truncate dark:text-yellow-400">{user?.name || "مستخدم"}</span>
                                    </div>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuLabel>مرحباً, {user?.name}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                    <ModeToggle />
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={signOut} className="text-destructive">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    تسجيل الخروج
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </SidebarFooter>
             </SheetContent>
        </Sheet>
    )
}


export function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { toggleSidebar } = useSidebar();
  const { settings, isOnline, dbAction, syncQueueCount, users, isCentral } = useData();
  const { can } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  const [offlineReadiness, setOfflineReadiness] = useState<number | null>(null);
  const [systemMode, setSystemMode] = useState<'production' | 'development'>(
    process.env.NODE_ENV === 'production' ? 'production' : 'development'
  );
  const [dbHosting, setDbHosting] = useState<{
    type: 'aws' | 'azure' | 'vps' | 'local' | 'indexeddb';
    label: string;
    server: string;
    database: string;
  }>({
    type: 'local',
    label: 'Local (محلي)',
    server: 'localhost:1433',
    database: 'MultiBranchPOS_DB'
  });
  const [centralHosting, setCentralHosting] = useState<{
    type: 'aws' | 'azure' | 'vps' | 'local';
    label: string;
    server: string;
    database: string;
  }>({
    type: 'local',
    label: 'محلي (Localhost)',
    server: 'localhost:1433',
    database: 'MultiBranchPOS_Central_DB'
  });

  useEffect(() => {
    fetch('/api/system/mode', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data?.mode) setSystemMode(data.mode);
        if (data?.branchHosting) {
          setDbHosting(data.branchHosting);
        } else if (data?.dbHostingType) {
          setDbHosting({
            type: data.dbHostingType,
            label: data.dbHostingLabel || 'Local (محلي)',
            server: data.dbServer || 'localhost:1433',
            database: data.dbName || 'MultiBranchPOS_DB'
          });
        }
        if (data?.centralHosting) {
          setCentralHosting(data.centralHosting);
        }
      })
      .catch(() => {});
  }, [pathname]);

  const [openTabs, setOpenTabs] = useState<{title: string, href: string}[]>([]);
  const openTabsStorageKey = user?.id ? `app_open_tabs_${user.id}` : null;
  const [tabsLoadedFor, setTabsLoadedFor] = useState<string | null>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // حذف التبويبات فقط عند عمل Hard Refresh (Ctrl + F5 أو Ctrl + Shift + R)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlF5 = (e.ctrlKey || e.metaKey) && (e.key === 'F5' || e.keyCode === 116);
      const isCtrlShiftR = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'r' || e.key === 'R');
      if (isCtrlF5 || isCtrlShiftR) {
        if (openTabsStorageKey) {
          try {
            sessionStorage.removeItem(openTabsStorageKey);
            localStorage.removeItem(openTabsStorageKey);
          } catch {}
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openTabsStorageKey]);

  // استرجاع التبويبات من الـ sessionStorage (الريفريش العادي يحافظ عليها، وإغلاق المتصفح/اليوزر يفرغها)
  useEffect(() => {
    if (!openTabsStorageKey) {
      setOpenTabs([]);
      setTabsLoadedFor(null);
      return;
    }

    try {
      // إزالة التخزين القديم الدائم من localStorage إن وجد
      try { localStorage.removeItem(openTabsStorageKey); } catch {}

      const storedTabs = JSON.parse(sessionStorage.getItem(openTabsStorageKey) || '[]');
      const validTabs = Array.isArray(storedTabs)
        ? storedTabs.filter((tab): tab is { title: string; href: string } =>
            tab && typeof tab.title === 'string' && typeof tab.href === 'string' && tab.href.startsWith('/')
          )
        : [];
      // الحد الأقصى 10 تبويبات دائماً
      setOpenTabs(validTabs.slice(-10));
    } catch {
      setOpenTabs([]);
    }
    setTabsLoadedFor(openTabsStorageKey);
  }, [openTabsStorageKey]);

  // حفظ التبويبات في sessionStorage بحد أقصى 10
  useEffect(() => {
    if (!openTabsStorageKey || tabsLoadedFor !== openTabsStorageKey) return;
    try {
      sessionStorage.setItem(openTabsStorageKey, JSON.stringify(openTabs.slice(-10)));
    } catch (error) {
      console.error('Failed to save open tabs', error);
    }
  }, [openTabs, openTabsStorageKey, tabsLoadedFor]);

  useEffect(() => {
        const checkReadiness = async () => {
            if (typeof window === 'undefined' || !('caches' in window)) return;
            
            const getPermittedPages = (items: readonly any[]) => {
                let pages: string[] = [];
                items.forEach(item => {
                     if (item.module && !can('view', item.module)) return;
                     
                     if (item.href) pages.push(item.href);
                     if (item.children) pages = pages.concat(getPermittedPages(item.children));
                });
                return pages;
            };

            const pagesToCheck = getPermittedPages(navStructure);
            if (pagesToCheck.length === 0) return;

            let cachedCount = 0;
            for (const href of pagesToCheck) {
                try {
                    const match = await caches.match(href, { ignoreSearch: true });
                    if (match) cachedCount++;
                } catch (e) {}
            }
            
            setOfflineReadiness((cachedCount / pagesToCheck.length) * 100);
        };

        checkReadiness();
  }, [can]);

  const findTitleForHref = useCallback((href: string) => {
    const traverse = (items: readonly any[]): string | undefined => {
      for (const item of items) {
        if (item.href === href) return item.title;
        if (item.children) {
            const found = traverse(item.children);
            if (found) return found;
        }
      }
      return undefined;
    };
    return traverse(navStructure);
  }, []);

  useEffect(() => {
    if (!openTabsStorageKey || tabsLoadedFor !== openTabsStorageKey) return;
    if (pathname && pathname !== '/' && pathname !== '/pos') {
        const title = findTitleForHref(pathname);
        if (title) {
            setOpenTabs(prev => {
                const existingIndex = prev.findIndex(tab => tab.href === pathname);
                if (existingIndex !== -1) {
                    if (prev[existingIndex].title !== title) {
                        const updated = [...prev];
                        updated[existingIndex] = { title, href: pathname };
                        return updated;
                    }
                    return prev;
                }
                const updated = [...prev, { title, href: pathname }];
                // الحد الأقصى 10 تبويبات فقط — وعند فتح التبويب الحادي عشر يتم إغلاق التبويب الأول تلقائياً (FIFO)
                return updated.length > 10 ? updated.slice(updated.length - 10) : updated;
            });
        }
    }
  }, [pathname, findTitleForHref, openTabsStorageKey, tabsLoadedFor]);

  // التحميل المسبق الفوري لجميع علامات التبويب المفتوحة لمنع أي تأخير في التنقل
  useEffect(() => {
    if (openTabs.length > 0) {
        openTabs.forEach(tab => {
            try {
                (router as any)?.prefetch?.(tab.href);
            } catch {}
        });
    }
  }, [openTabs, router]);



  useEffect(() => {
      if (user && users) {
          const currentUser = users.find((u: any) => u.id === user.id);
          if (currentUser && currentUser.isDisabled) {
               signOut();
          }
      }
  }, [user, users, signOut]);

 const handleZoom = async (newZoom: number) => {
    const clampedZoom = Math.max(0.8, Math.min(1.2, newZoom));
    
    document.documentElement.style.setProperty('--zoom-level', String(clampedZoom));

    if (user) {
        try {
            const currentThemeSettings = user.themeSettings || {};
            await dbAction('users', 'update', { id: user.id, data: { themeSettings: { ...currentThemeSettings, zoomLevel: clampedZoom } } });
        } catch(e) {
            console.error("Failed to save zoom level", e);
        }
    }
  };
  
  const generalSettings = settings?.main?.general || settings?.general || {};
  const fabPosition = generalSettings.mobileFabPosition || 'bottom-right';
  const desktopLayout = generalSettings.desktopLayout || 'sidebar';
  const innerTabHeight = generalSettings.innerTabHeight || 'compact';
  const innerTabHeightPx = innerTabHeight === 'compact' ? 22 : innerTabHeight === 'comfortable' ? 32 : 26;
  const innerTabHeightClass = innerTabHeight === 'compact'
    ? 'min-h-[22px] py-0 px-2 text-[11.5px]'
    : innerTabHeight === 'comfortable'
      ? 'min-h-[32px] py-1.5 px-2 text-xs'
      : 'min-h-[26px] py-0.5 px-2 text-xs';

  const memoizedNavStructure = useMemo(() => {
    if (!isCentral) return navStructure;
    return navStructure
      .filter((item: any) => item.href !== '/tables' && item.href !== '/pos')
      .map((item: any) => {
        if (item.title === dictionary.nav.pos || item.modules?.includes('pos')) {
          const filteredChildren = (item.children || []).filter((child: any) => {
            // Completely hide live sales screen, POS terminals management, and POS returns in Central HQ
            if (child.href === '/pos') return false;
            if (child.href === '/master-data/pos-terminals') return false;
            if (child.href === '/sales/returns/pos') return false;
            return true;
          }).map((child: any) => {
            if (child.href === '/pos/sessions') {
              return {
                ...child,
                title: 'مراجعة وتدقيق ورديات الفروع'
              };
            }
            return child;
          });

          return {
            ...item,
            children: filteredChildren
          };
        }
        return item;
      });
  }, [isCentral]);

  const isHubLayout = desktopLayout === 'modern_hub';
  const isPosScreen = pathname === '/pos' || pathname === '/pos/customer-display';
  const showHeader = !isPosScreen;

  const handleCloseTab = (e: React.MouseEvent, href: string) => {
      e.stopPropagation();
      e.preventDefault();
      setOpenTabs(prev => {
          const remaining = prev.filter(tab => tab.href !== href);
          if (pathname === href) {
              if (remaining.length > 0) {
                  router.push(remaining[remaining.length - 1].href);
              } else {
                  router.push('/');
              }
          }
          return remaining;
      });
  };

  const scrollTabs = (direction: 'left' | 'right') => {
      if (tabsContainerRef.current) {
          const scrollAmount = 240;
          tabsContainerRef.current.scrollBy({
              left: direction === 'left' ? -scrollAmount : scrollAmount,
              behavior: 'smooth'
          });
      }
  };

  const handleTabsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
      if (tabsContainerRef.current && e.deltaY !== 0) {
          tabsContainerRef.current.scrollBy({
              left: e.deltaY,
              behavior: 'smooth'
          });
      }
  };

  useEffect(() => {
      if (tabsContainerRef.current) {
          const activeEl = tabsContainerRef.current.querySelector('[data-active="true"]');
          if (activeEl) {
              activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          }
      }
  }, [pathname, openTabs]);


  return (
    <>
      {desktopLayout === 'sidebar' && !isPosScreen && (
        <Sidebar side="right">
          <SidebarHeader className="p-0 gap-0">
              <div className="flex flex-col w-full px-3 py-2.5 border-b gap-2">
                  <div className="flex w-full items-center justify-between">
                      <Logo />
                  </div>
                  {offlineReadiness !== null && (
                      <div className="w-full space-y-0.5">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>جاهزية الأوفلاين</span>
                              <span>{Math.round(offlineReadiness)}%</span>
                          </div>
                          <Progress value={offlineReadiness} className="h-1" />
                      </div>
                  )}
              </div>
              <div className="px-2 py-1.5">
                  <div className="relative">
                      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input placeholder="بحث في جميع التبويبات..." className="h-8 pr-8 pl-7 text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                      {searchTerm && (
                          <button
                              type="button"
                              onClick={() => setSearchTerm('')}
                              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                              <X className="h-3.5 w-3.5" />
                          </button>
                      )}
                  </div>
              </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {memoizedNavStructure.map((item: any) => {
                if(item.type === 'link' && matchesSearch(item.title, searchTerm)) {
                  return <NavLink key={item.href} href={item.href || '/'} icon={item.icon} module={item.module || ''}>{item.title}</NavLink>
                }
                if(item.type === 'collapsible') {
                  return (
                      <NavCollapsible key={item.title} title={item.title} icon={item.icon} modules={item.modules} searchTerm={searchTerm} innerTabHeightClass={innerTabHeightClass} innerTabHeightPx={innerTabHeightPx}>
                          {item.children?.map((child: any) => {
                              if (child.type === 'collapsible') {
                                  return (
                                       <NavCollapsible key={child.title} title={child.title} icon={<div className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />} modules={child.modules || []} searchTerm={searchTerm} isSubCollapsible innerTabHeightClass={innerTabHeightClass} innerTabHeightPx={innerTabHeightPx}>
                                           {child.children?.map((subChild: any) => (
                                               <NavSubLink key={subChild.href} href={subChild.href} module={subChild.module} innerTabHeightClass={innerTabHeightClass} innerTabHeightPx={innerTabHeightPx}>{subChild.title}</NavSubLink>
                                           ))}
                                       </NavCollapsible>
                                  )
                              }
                               if(child.type === 'link') {
                                return <NavSubLink key={child.href} href={child.href} module={child.module} innerTabHeightClass={innerTabHeightClass} innerTabHeightPx={innerTabHeightPx}>{child.title}</NavSubLink>
                               }
                               return null;
                          })}
                      </NavCollapsible>
                  )
                }
                return null;
              })}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="hidden md:flex p-1.5">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                         <Button variant="ghost" className="flex items-center justify-start gap-2 p-2 rounded-lg bg-card w-full h-auto">
                            <Avatar className="h-7 w-7">
                                <AvatarImage src={(user as any)?.photoUrl || user?.photoURL || ''} />
                                <AvatarFallback className="text-xs">{user?.name?.charAt(0) || 'U'}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col flex-1 overflow-hidden text-right">
                                <span className="font-semibold text-xs truncate dark:text-yellow-400">{user?.name || "مستخدم"}</span>
                                <span className="text-[10px] text-muted-foreground truncate">{user?.loginName ? `${user.loginName}@admin.com` : "email@example.com"}</span>
                            </div>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56 mb-2" side="top" align="end">
                         <DropdownMenuLabel>مرحباً, {user?.name}</DropdownMenuLabel>
                         <DropdownMenuSeparator />
                         <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <ModeToggle />
                         </DropdownMenuItem>
                         <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex flex-col items-start gap-2">
                            <Label className="text-xs">حجم الواجهة</Label>
                            <Slider
                                defaultValue={[user?.themeSettings?.zoomLevel || 1]}
                                max={1.2}
                                min={0.8}
                                step={0.05}
                                onValueChange={(value: number[]) => handleZoom(value[0])}
                            />
                        </DropdownMenuItem>
                         <DropdownMenuSeparator />
                         <DropdownMenuItem onClick={signOut} className="text-destructive">
                             <LogOut className="mr-2 h-4 w-4" />
                             تسجيل الخروج
                         </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
      )}

      {!isPosScreen && <MobileSidebar />}

      <SidebarInset className={cn(
        "h-screen max-h-screen overflow-hidden flex flex-col",
        isPosScreen && "w-full min-w-full m-0 p-0"
      )}>
         {!isPosScreen && (
           <div className="md:hidden fixed z-50">
            <SidebarTrigger className={cn(
                "rounded-full w-14 h-14 shadow-lg bg-primary text-primary-foreground hover:bg-primary/90",
                {
                    'top-4 right-4': fabPosition === 'top-right',
                    'bottom-4 right-4': fabPosition === 'bottom-right',
                    'top-1/2 right-4 -translate-y-1/2': fabPosition === 'middle-right',
                    'top-4 left-4': fabPosition === 'top-left',
                    'bottom-4 left-4': fabPosition === 'bottom-left',
                    'top-1/2 left-4 -translate-y-1/2': fabPosition === 'middle-left',
                }
            )} />
           </div>
         )}
        
        {showHeader && (
            <header className="flex h-14 items-center justify-between gap-2 sm:gap-4 border-b bg-background px-2 sm:px-4 shrink-0 sticky top-0 z-30">
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    {desktopLayout === 'sidebar' && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="hidden md:flex" 
                            onClick={toggleSidebar}
                        >
                            <PanelLeft />
                        </Button>
                    )}
                     <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => router.back()}
                        className="h-8 w-8 sm:h-9 sm:w-9"
                    >
                        <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                    </Button>
                     {isHubLayout && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => router.push('/')}
                            className="h-8 w-8 sm:h-9 sm:w-9"
                        >
                            <Home className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Button>
                    )}
                </div>
                
                 <div className="hidden md:flex flex-1 justify-center min-w-0">
                    {desktopLayout === 'menubar' ? (
                        <AppMenubar navStructure={memoizedNavStructure} />
                    ) : (
                        <Logo />
                    )}
                 </div>

                 <div className="md:hidden flex-1 min-w-0 flex items-center justify-center px-1">
                    <Logo />
                 </div>

                 <div className="flex items-center gap-1 sm:gap-2 justify-end shrink-0">
                     {can('add', 'inventory_items_list') && (
                       <TooltipProvider>
                         <Tooltip>
                           <TooltipTrigger asChild>
                             <Button asChild variant="ghost" size="icon" aria-label="إضافة صنف جديد" className="hidden sm:inline-flex">
                               <Link href="/master-data/items?newGood=1">
                                 <PackagePlus className="h-5 w-5" />
                               </Link>
                             </Button>
                           </TooltipTrigger>
                           <TooltipContent>إضافة صنف جديد</TooltipContent>
                         </Tooltip>
                       </TooltipProvider>
                     )}
                     {/* إشارة نوع سيرفر قاعدة البيانات: AWS RDS أو محلي Local أو VPS */}
                     <TooltipProvider>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <Link
                             href="/settings/re-engineer"
                             className={cn(
                               "flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border text-[10px] sm:text-[11px] font-bold select-none transition-colors whitespace-nowrap shrink-0",
                               dbHosting.type === 'indexeddb'
                                  ? 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20'
                                  : dbHosting.type === 'aws' || dbHosting.type === 'azure'
                                 ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20"
                                 : dbHosting.type === 'vps'
                                 ? "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20"
                                 : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                             )}
                           >
                             {dbHosting.type === 'indexeddb' ? (
                                <Laptop className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 text-purple-500" />
                              ) : dbHosting.type === 'aws' || dbHosting.type === 'azure' ? (
                               <Cloud className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 text-amber-500" />
                             ) : (
                               <DatabaseBackup className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                             )}
                             <span>
                               {dbHosting.type === 'aws'
                                 ? 'سحابي ☁️'
                                 : dbHosting.type === 'azure'
                                 ? 'سحابي ☁️'
                                 : dbHosting.type === 'vps'
                                 ? 'سيرفر شبكة 🌐'
                                 : 'محلي 💻'}
                             </span>
                           </Link>
                         </TooltipTrigger>
                         <TooltipContent side="bottom" className="text-xs max-w-sm text-right space-y-1.5 p-3">
                           <div className="font-bold text-foreground border-b pb-1 text-center">
                             حالة السيرفرات وقواعد البيانات (الفرع والإدارة)
                           </div>
                           <div className="space-y-0.5 text-[11px]">
                             <div className="flex items-center justify-between gap-2">
                               <span className="font-bold">🏪 سيرفر الفرع:</span>
                               <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                                 {dbHosting.type === 'indexeddb' ? 'متصفح (IndexedDB)' : dbHosting.type === 'aws' ? 'سحابي' : dbHosting.type === 'vps' ? 'سيرفر IP' : 'محلي'}
                               </Badge>
                             </div>
                             <div className="font-mono text-[10px] text-muted-foreground truncate" dir="ltr">
                               {dbHosting.server} ({dbHosting.database})
                             </div>
                           </div>
                           <div className="space-y-0.5 text-[11px] pt-1 border-t">
                             <div className="flex items-center justify-between gap-2">
                               <span className="font-bold">🏢 سيرفر الإدارة:</span>
                               <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                                 {centralHosting.type === 'aws' ? 'سحابي' : centralHosting.type === 'vps' ? 'سيرفر IP' : 'محلي'}
                               </Badge>
                             </div>
                             <div className="font-mono text-[10px] text-muted-foreground truncate" dir="ltr">
                               {centralHosting.server} ({centralHosting.database})
                             </div>
                           </div>
                           <div className="text-[10px] text-primary text-center font-bold pt-1 border-t">
                             💡 اضغط لفتح مركز إدارة السيرفرات وقواعد البيانات
                           </div>
                         </TooltipContent>
                       </Tooltip>
                     </TooltipProvider>

                     {/* إشارة نمط التشغيل: Production أو Development (تظهر على الشاشات المتوسطة والكبيرة لتجنب تداخل الموبايل) */}
                     <TooltipProvider>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted/40 text-[11px] font-mono select-none cursor-default transition-colors shrink-0">
                             <span className={cn(
                               "h-2 w-2 rounded-full",
                               systemMode === 'production' ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                             )} />
                             <span className="font-bold tracking-wider text-foreground">
                               {systemMode === 'production' ? 'Production' : 'Development'}
                             </span>
                           </div>
                         </TooltipTrigger>
                         <TooltipContent side="bottom" className="text-xs max-w-xs text-center">
                           {systemMode === 'production'
                             ? 'نمط الإنتاج (Production Mode) — النظام مجمّع ومحسّن للفرع والأجهزة المتعددة.'
                             : 'نمط التطوير (Development Mode) — وضع التعديل البرمجي والتحديث الحي.'}
                         </TooltipContent>
                       </Tooltip>
                     </TooltipProvider>

                     <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link href="/settings/sync" className="relative p-2 block">
                                    {isOnline ? (
                                        <Cloud className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <CloudOff className="h-5 w-5 text-muted-foreground" />
                                    )}
                                    {!isOnline && syncQueueCount > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                                            {syncQueueCount}
                                        </span>
                                    )}
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent>
                                {isOnline ? "متصل ومزامن" : 
                                 syncQueueCount > 0 ? `${syncQueueCount} معاملات معلقة للمزامنة` : 
                                 "غير متصل"}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>


                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                             <Button variant="ghost" size="icon" className="rounded-full">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={user?.photoURL || ''} />
                                    <AvatarFallback>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
                                </Avatar>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>مرحباً, {user?.name}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                             <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <ModeToggle />
                             </DropdownMenuItem>
                             <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex flex-col items-start gap-2">
                                <Label className="text-xs">حجم الواجهة</Label>
                                <Slider
                                    defaultValue={[user?.themeSettings?.zoomLevel || 1]}
                                    max={1.2}
                                    min={0.8}
                                    step={0.05}
                                    onValueChange={(value: number[]) => handleZoom(value[0])}
                                />
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={signOut} className="text-destructive">
                                <LogOut className="mr-2 h-4 w-4" />
                                تسجيل الخروج
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                </div>
            </header>
        )}
        
        <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
            <div
                className="flex-1 overflow-y-auto min-h-0"
                data-report-screen={pathname.startsWith('/reports') || pathname.startsWith('/analytics') || pathname.includes('report') ? 'true' : undefined}
            >
                {children}
            </div>

            {/* Taskbar / Open Tabs Bar */}
            {tabsLoadedFor === openTabsStorageKey && openTabs.length > 0 && !isPosScreen && (
                <div className="h-11 bg-card/95 backdrop-blur-md border-t flex items-center px-2 gap-1.5 shrink-0 z-40 sticky bottom-0 shadow-[0_-2px_10px_rgba(0,0,0,0.12)] no-print select-none">
                    {/* Scroll Right Button */}
                    <button
                        type="button"
                        onClick={() => scrollTabs('right')}
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                        title="تمرير لليمين"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>

                    {/* Scrollable Tabs Container */}
                    <div 
                        ref={tabsContainerRef}
                        onWheel={handleTabsWheel}
                        className="flex-1 flex items-center gap-1.5 overflow-x-auto scroll-smooth scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40 py-1"
                        style={{ scrollbarWidth: 'thin' }}
                    >
                        {openTabs.map((tab) => {
                            const isActive = pathname === tab.href;
                            return (
                                <Link 
                                    key={tab.href}
                                    href={tab.href}
                                    prefetch={true}
                                    data-active={isActive ? "true" : "false"}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap border shrink-0 select-none",
                                        isActive 
                                            ? "bg-primary/10 text-primary border-primary/40 shadow-sm font-semibold" 
                                            : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/50"
                                    )}
                                >
                                    <span className="truncate max-w-[170px]">{tab.title}</span>
                                    <span 
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => handleCloseTab(e, tab.href)}
                                        className="hover:bg-background/80 hover:text-destructive p-0.5 rounded-full inline-flex items-center justify-center transition-colors"
                                        title="إغلاق التبويب"
                                    >
                                        <X className="h-3 w-3" />
                                    </span>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Scroll Left Button */}
                    <button
                        type="button"
                        onClick={() => scrollTabs('left')}
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                        title="تمرير لليسار"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>

                    {/* Quick Action: Clear All Tabs */}
                    <button
                        type="button"
                        onClick={() => {
                            setOpenTabs([]);
                            if (openTabsStorageKey) {
                                try { sessionStorage.removeItem(openTabsStorageKey); } catch {}
                            }
                        }}
                        className="h-7 px-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive rounded-md hover:bg-muted shrink-0 transition-colors border border-transparent hover:border-border/40"
                        title="إغلاق جميع النوافذ المفتوحة"
                    >
                        <X className="h-3 w-3" />
                        <span className="hidden sm:inline">إغلاق الكل</span>
                    </button>
                </div>
            )}
        </div>
      </SidebarInset>
    </>
  );
}
