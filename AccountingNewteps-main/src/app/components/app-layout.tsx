

"use client";

import React, { useState, useMemo, useEffect } from "react";
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

import {
  LayoutDashboard,
  Package,
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
  LayoutGrid, // Added
  ClipboardPlus,
  Scale,
  Loader2,
  KeyRound,
  ZoomIn,
  ZoomOut,
  Lightbulb,
  Archive,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ModeToggle } from "@/components/mode-toggle";
import { usePermissions } from "@/contexts/permissions-context";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { useData } from "@/contexts/data-provider";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { AppMenubar } from "@/components/app-menubar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ModernNavHub } from "@/components/modern-nav-hub";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LicenseActivationForm } from "@/components/license-activation-form";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";


const Logo = () => {
    const { settings } = useData();
    const companyName = settings?.main?.general?.companyName || "MultiBranch Accounting";

    return (
        <div className="flex items-center gap-2" >
            <Scale className="h-7 w-7 text-primary"/>
            <Laptop className="h-7 w-7 text-primary"/>
            <h1 className="text-lg font-bold text-primary">{companyName}</h1>
        </div>
    );
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
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link href={href} onClick={() => setOpenMobile(false)}>
          {icon}
          <span>{children}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

const NavCollapsible = ({ title, icon, children, modules, searchTerm, defaultOpen }: { title: string; icon: React.ReactNode; children: React.ReactNode; modules: readonly string[], searchTerm: string, defaultOpen?: boolean }) => {
    const pathname = usePathname();
    const { can } = usePermissions();
    
    // Check if user can view any of the direct children or any children of nested collapsibles
    const canViewAnyChild = (items: React.ReactNode): boolean => {
        return React.Children.toArray(items).some((child) => {
            if (React.isValidElement(child)) {
                // Direct link check
                if ((child.props as any).module && can('view', (child.props as any).module)) {
                    return true;
                }
                // Nested collapsible check (recursive)
                if ((child.props as any).children) {
                    return canViewAnyChild((child.props as any).children);
                }
            }
            return false;
        });
    };

    if (!canViewAnyChild(children)) {
        return null;
    }
    
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
    }

    const filteredChildren = React.Children.toArray(children).filter((child: any) => {
        if (React.isValidElement(child) && (child.props as any).children) {
            const grandChildren = React.Children.toArray((child.props as any).children);
            const hasMatchingGrandChild = grandChildren.some((gc: any) => 
                React.isValidElement(gc) && (gc.props as any).children?.toLowerCase().includes(searchTerm.toLowerCase())
            );
            return (child.props as any).title?.toLowerCase().includes(searchTerm.toLowerCase()) || hasMatchingGrandChild;
        }
        if (React.isValidElement(child) && typeof (child.props as any).children === 'string') {
            return (child.props as any).children.toLowerCase().includes(searchTerm.toLowerCase());
        }
        return false;
    });

     if (searchTerm && !title.toLowerCase().includes(searchTerm.toLowerCase()) && filteredChildren.length === 0) {
        return null;
    }

    return (
        <Collapsible defaultOpen={defaultOpen || isAnyChildActive(children) || (searchTerm !== '' && filteredChildren.length > 0)}>
            <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                     <SidebarMenuButton>
                        {icon}
                        <span>{title}</span>
                        <ChevronDown className="mr-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
            </SidebarMenuItem>
            <CollapsibleContent asChild>
                <SidebarMenuSub>{searchTerm ? filteredChildren : children}</SidebarMenuSub>
            </CollapsibleContent>
        </Collapsible>
    );
};

const NavSubLink = ({ href, children, module }: { href: string; children: React.ReactNode, module: string }) => {
    const pathname = usePathname();
    const { setOpenMobile } = useSidebar();
    const { can } = usePermissions();
    const isActive = pathname === href || pathname.startsWith(`${href}/`);

    if (!can('view', module)) {
        return null;
    }

    return (
        <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild isActive={isActive}>
                <Link href={href} onClick={() => setOpenMobile(false)}>{children}</Link>
            </SidebarMenuSubButton>
        </SidebarMenuSubItem>
    );
};

export const navStructure = [
    { type: 'link', href: '/dashboard', icon: <LayoutDashboard />, module: 'dashboard', title: 'لوحة التحكم' },
    { type: 'link', href: '/tables', icon: <LayoutDashboard />, module: 'restaurant_tables', title: 'شاشة الطاولات' },
    { type: 'collapsible', title: 'نقاط البيع', icon: <Receipt />, modules: ['pos', 'pos_terminals', 'pos_itemGroups', 'pos_sessions', 'sales_posReturns', 'pos_paymentMethods', 'restaurant_tables'], children: [
        { type: 'link', href: '/pos', module: 'pos', title: 'شاشة الكاشير' },
        { type: 'link', href: '/master-data/pos-terminals', module: 'pos_terminals', title: 'إدارة نقاط البيع' },
        { type: 'link', href: '/master-data/payment-methods', module: 'pos_paymentMethods', title: 'إدارة طرق الدفع' },
        { type: 'link', href: '/master-data/item-groups', module: 'pos_itemGroups', title: 'مجموعات أصناف الكاشير' },
        { type: 'link', href: '/pos/sessions', module: 'pos_sessions', title: 'إدارة يومية الكاشير' },
        { type: 'link', href: '/sales/returns/pos', module: 'sales_posReturns', title: 'مرتجع نقاط البيع' },
    ]},
    { type: 'collapsible', title: 'التسويق', icon: <Percent />, modules: ['marketing_promotions', 'inventory_priceUpdate', 'marketing_targets', 'sellers_data'], children: [
        { type: 'link', href: '/marketing/promotions', module: 'marketing_promotions', title: 'العروض والخصومات' },
        { type: 'link', href: '/marketing/price-adjustments', module: 'inventory_priceUpdate', title: 'تعديلات أسعار البيع' },
        { type: 'link', href: '/master-data/sellers', module: 'sellers_data', title: 'إدارة البائعين' },
        { type: 'link', href: '/marketing/targets', module: 'marketing_targets', title: 'إدارة الأهداف' },
    ]},
    { type: 'collapsible', title: 'الأصناف', icon: <PackageSearch />, modules: [
        'inventory_items_list', 'inventory_items_sections', 'inventory_items_categories', 
        'inventory_items_colors', 'inventory_items_sizes', 'inventory_items_deleted', 
        'inventory_importItems', 'inventory_barcodeDesigner', 'inventory_barcodePrint'
    ], children: [
        { type: 'link', href: '/master-data/item-sections', module: 'inventory_items_sections', title: 'أقسام الأصناف' },
        { type: 'link', href: '/master-data/item-categories', module: 'inventory_items_categories', title: 'المجموعات السلعية' },
        { type: 'link', href: '/master-data/item-colors', module: 'inventory_items_colors', title: 'الألوان' },
        { type: 'link', href: '/master-data/item-sizes', module: 'inventory_items_sizes', title: 'المقاسات' },
        { type: 'link', href: '/master-data/items', module: 'inventory_items_list', title: 'بطاقة الأصناف' },
        { type: 'link', href: '/master-data/items/deleted', module: 'inventory_items_deleted', title: 'الأصناف المحذوفة' },
        { type: 'link', href: '/inventory/import-items', module: 'inventory_importItems', title: 'استيراد من Excel' },
        { type: 'link', href: '/inventory/barcode-designer', module: 'inventory_barcodeDesigner', title: 'مصمم ملصقات الباركود' },
        { type: 'link', href: '/inventory/barcode-print', module: 'inventory_barcodePrint', title: 'طباعة مجموعة اصناف' },
    ]},
    { type: 'collapsible', title: 'المخازن', icon: <Warehouse />, modules: ['inventory_warehouses', 'inventory_goodsInTransit', 'inventory_requisitions_recommendations', 'inventory_stockOut', 'inventory_transfer', 'inventory_adjustment', 'inventory_movements', 'inventory_requisitions'], children: [
        { type: 'link', href: '/master-data/branches', module: 'inventory_warehouses', title: 'الفروع' },
        { type: 'link', href: '/inventory/goods-in-transit', module: 'inventory_goodsInTransit', title: 'بضاعة بالطريق' },
        { type: 'link', href: '/inventory/requisitions/recommendations', icon: <Lightbulb />, module: 'inventory_requisitions_recommendations', title: 'توصيات طلبات البضاعة' },
        { type: 'link', href: '/inventory/requisitions', module: 'inventory_requisitions', title: 'طلبات البضاعة' },
        { type: 'link', href: '/inventory/stock-out/new', module: 'inventory_stockOut', title: 'صرف مخزون' },
        { type: 'link', href: '/inventory/transfer/new', module: 'inventory_transfer', title: 'تحويل مخزون' },
        { type: 'link', href: '/inventory/adjustment', module: 'inventory_adjustment', title: 'تسوية المخزون (الجرد)' },
        { type: 'link', href: '/inventory/movements', module: 'inventory_movements', title: 'حركة المخزون' },
    ]},
    { type: 'collapsible', title: 'اللوجيستيك (للمخازن الرئيسية)', icon: <LayoutGrid />, modules: ['inventory_zones', 'inventory_requisitions', 'inventory_stockIn', 'reports_stockOutReport', 'inventory_stockStatus', 'inventory_movements'], children: [
        { type: 'link', href: '/inventory/zones', module: 'inventory_zones', title: 'المخازن الرئيسية والأقسام' },
        { type: 'link', href: '/inventory/stock-in', module: 'inventory_stockIn', title: 'تسكين البضاعة' },
        { type: 'link', href: '/inventory/requisitions/processing', module: 'inventory_requisitions', title: 'تحضير الطلبات' },
        { type: 'link', href: '/inventory/requisitions/fulfilled', module: 'inventory_requisitions', title: 'الطلبات المنفذة' },
        { type: 'collapsible', title: 'التقارير اللوجيستية', modules: ['reports_stockOutReport', 'inventory_stockIn', 'inventory_stockStatus', 'inventory_movements', 'reports_discrepancies'], children: [
             { type: 'link', href: '/reports/stock-in-report', module: 'inventory_stockIn', title: 'تقرير التسكين' },
             { type: 'link', href: '/reports/stock-out-report', module: 'reports_stockOutReport', title: 'تقرير السحب' },
             { type: 'link', href: '/reports/stock-status', module: 'inventory_stockStatus', title: 'تقرير أرصدة المخازن' },
             { type: 'link', href: '/reports/discrepancies', module: 'reports_discrepancies', title: 'تقرير عدم تطابق المخزون' },
        ]},
    ]},
    { type: 'collapsible', title: 'العملاء والمبيعات', icon: <UserSquare />, modules: ['customers_data', 'sales_invoices', 'sales_returns', 'accounting_customerPayments'], children: [
        { type: 'link', href: '/master-data/customers', module: 'customers_data', title: 'بيانات العملاء' },
        { type: 'link', href: '/sales/invoices/list', module: 'sales_invoices', title: 'فواتير البيع' },
        { type: 'link', href: '/sales/returns/new', module: 'sales_returns', title: 'مرتجعات البيع' },
        { type: 'link', href: '/accounting/customer-payments', module: 'accounting_customerPayments', title: 'مقبوضات العملاء' },
    ]},
    { type: 'collapsible', title: 'الموردون والمشتريات', icon: <Building2 />, modules: ['suppliers_data', 'purchases_invoices', 'purchases_orders', 'purchases_returns', 'accounting_supplierPayments'], children: [
        { type: 'link', href: '/master-data/suppliers', module: 'suppliers_data', title: 'بيانات الموردين' },
        { type: 'link', href: '/purchases/orders', module: 'purchases_orders', title: 'أوامر الشراء' },
        { type: 'link', href: '/purchases/invoices/list', module: 'purchases_invoices', title: 'فواتير الشراء' },
        { type: 'link', href: '/purchases/returns/new', module: 'purchases_returns', title: 'مرتجعات الشراء' },
        { type: 'link', href: '/accounting/supplier-payments', module: 'accounting_supplierPayments', title: 'مدفوعات الموردين' },
    ]},
    { type: 'collapsible', title: 'المحاسبة والمالية', icon: <BookCopy />, modules: ['accounting_journal', 'accounting_expenses', 'accounting_exceptionalIncome', 'accounting_treasury', 'accounting_profitDistribution'], children: [
        { type: 'link', href: '/accounting/journal', module: 'accounting_journal', title: 'قيود اليومية' },
        { type: 'link', href: '/accounting/expenses', module: 'accounting_expenses', title: 'إدارة المصروفات' },
        { type: 'link', href: '/accounting/exceptional-income', module: 'accounting_exceptionalIncome', title: 'الدخل الاستثنائي' },
        { type: 'link', href: '/accounting/treasury', module: 'accounting_treasury', title: 'حركة الخزينة' },
        { type: 'link', href: '/accounting/profit-distribution', module: 'accounting_profitDistribution', title: 'توزيعات الأرباح' },
    ]},
    { type: 'collapsible', title: 'الموظفون والمبيعات', icon: <Users2 />, modules: ['users', 'sellers_data', 'partners_data', 'sales_issueToRep', 'sales_returnFromRep', 'sales_repInvoices', 'sales_repOperations', 'sales_remitFromRep'], children: [
      { type: 'link', href: '/users', module: 'users', title: 'المستخدمون والمناديب' },
      { type: 'link', href: '/master-data/sellers', module: 'sellers_data', title: 'إدارة البائعين' },
      { type: 'link', href: '/master-data/partners', module: 'partners_data', title: 'بيانات الشركاء' },
      { type: 'link', href: '/sales/issue-to-rep/list', module: 'sales_issueToRep', title: 'صرف بضاعة لمندوب' },
      { type: 'link', href: '/sales/return-from-rep/list', module: 'sales_returnFromRep', title: 'مرتجع بضاعة من مندوب' },
      { type: 'link', href: '/sales/rep-invoices', module: 'sales_repInvoices', title: 'اعتماد فواتير المناديب' },
      { type: 'link', href: '/sales/rep-operations', module: 'sales_repOperations', title: 'مراقبة أداء المناديب' },
      { type: 'link', href: '/sales/remit-from-rep', module: 'sales_remitFromRep', title: 'توريد نقدية من مندوب' },
    ]},
    { type: 'collapsible', title: 'الدليفري', icon: <Bike />, modules: ['delivery_staff', 'delivery_operations', 'sales_deliveryReconciliation'], children: [
      { type: 'link', href: '/delivery/staff', module: 'delivery_staff', title: 'إدارة الطيارين' },
      { type: 'link', href: '/delivery/operations', module: 'delivery_operations', title: 'عمليات الطيارين' },
      { type: 'link', href: '/sales/delivery-reconciliation', module: 'sales_deliveryReconciliation', title: 'تحصيل فواتير الدليفري' },
    ]},
    { type: 'collapsible', title: 'الموارد البشرية', icon: <UserRound />, modules: ['hr_advances', 'hr_adjustments', 'hr_payroll'], children: [
        { type: 'link', href: '/hr/advances', module: 'hr_advances', title: 'سلف الموظفين' },
        { type: 'link', href: '/hr/adjustments', module: 'hr_adjustments', title: 'المكافآت والجزاءات' },
        { type: 'link', href: '/hr/payroll', module: 'hr_payroll', title: 'احتساب الرواتب' },
    ]},
     { type: 'collapsible', title: 'التقارير', icon: <BarChart />, modules: ['analytics', 'reports_recipe', 'reports_customerReceivables', 'reports_supplierPayables', 'reports_supplierStatement', 'reports_itemProfitLoss', 'reports_salesByCategory', 'reports_itemLedger', 'reports_financialStatements', 'reports_partnerShares', 'reports_sales', 'reports_pos', 'reports_posSales', 'reports_itemSalesCount', 'reports_priceChangeLogs', 'inventory_movements', 'reports_pos', 'sales_returns', 'reports_cashAccountStatement', 'reports_itemExpiry', 'reports_restaurantTables', 'reports_sellerTargets', 'inventory_stockIn', 'reports_stockStatus', 'reports_stockOutReport'], children: [
        { type: 'link', href: '/analytics', module: 'analytics', title: 'التحليلات الرسومية' },
        { type: 'collapsible', title: 'تقارير المبيعات', modules: ['reports_sales', 'reports_posSales', 'reports_pos', 'sales_returns', 'reports_itemSalesCount', 'reports_restaurantTables', 'reports_sellerTargets'], children: [
            { type: 'link', href: '/reports/sales-reports', module: 'reports_sales', title: 'تقرير المبيعات المفصل' },
            { type: 'link', href: '/reports/pos-sales', module: 'reports_posSales', title: 'مبيعات نقاط البيع (مجمع)' },
            { type: 'link', href: '/reports/pos-reports', module: 'reports_pos', title: 'تقارير نقاط البيع (مفصل)' },
            { type: 'link', href: '/reports/sales-returns-report', module: 'sales_returns', title: 'تقرير مرتجعات المبيعات' },
            { type: 'link', href: '/reports/cancelled-invoices', module: 'reports_pos', title: 'الفواتير الملغاة' },
            { type: 'link', href: '/reports/item-sales-count', module: 'reports_itemSalesCount', title: 'تقرير عدد مرات البيع' },
            { type: 'link', href: '/reports/tables-report', module: 'reports_restaurantTables', title: 'تقرير الطاولات' },
            { type: 'link', href: '/reports/cashier-discrepancies', module: 'reports_pos', title: 'تقرير العجز والزيادة' },
            { type: 'link', href: '/reports/payment-methods-report', module: 'reports_pos', title: 'تقرير طرق الدفع' },
            { type: 'link', href: '/reports/seller-targets', module: 'reports_sellerTargets', title: 'تقرير أهداف البائعين' },
        ]},
        { type: 'collapsible', title: 'تقارير المخزون واللوجيستيك', modules: ['reports_itemProfitLoss', 'reports_salesByCategory', 'reports_itemLedger', 'reports_priceChangeLogs', 'inventory_movements', 'reports_itemExpiry', 'reports_recipe', 'inventory_stockStatus', 'inventory_stockIn', 'reports_stockOutReport', 'reports_discrepancies'], children: [
            { type: 'link', href: '/reports/item-profit-loss', module: 'reports_itemProfitLoss', title: 'تقرير أرباح الأصناف' },
            { type: 'link', href: '/reports/sales-by-category', module: 'reports_salesByCategory', title: 'تقرير مبيعات الأقسام' },
            { type: 'link', href: '/reports/recipe-reports', module: 'reports_recipe', title: 'تقارير التصنيع' },
            { type: 'link', href: '/reports/item-ledger', module: 'reports_itemLedger', title: 'كارت الصنف' },
            { type: 'link', href: '/reports/stock-in-report', module: 'inventory_stockIn', title: 'تقرير التسكين' },
            { type: 'link', href: '/reports/stock-out-report', module: 'reports_stockOutReport', title: 'تقرير السحب' },
            { type: 'link', href: '/reports/price-change-logs', module: 'reports_priceChangeLogs', title: 'سجل تغييرات الأسعار' },
            { type: 'link', href: '/reports/discrepancies', module: 'reports_discrepancies', title: 'تقرير عدم تطابق المخزون' },
            { type: 'link', href: '/reports/item-expiry', module: 'reports_itemExpiry', title: 'تقرير قرب انتهاء الصلاحية' },
            { type: 'link', href: '/reports/stock-status', module: 'reports_stockStatus', title: 'تقرير أرصدة المخازن' },
        ]},
        { type: 'collapsible', title: 'تقارير مالية وحسابات', modules: ['reports_customerReceivables', 'reports_supplierPayables', 'reports_supplierStatement', 'reports_cashAccountStatement', 'reports_partnerShares', 'reports_financialStatements'], children: [
            { type: 'link', href: '/reports/customer-receivables', module: 'reports_customerReceivables', title: 'مستحقات العملاء' },
            { type: 'link', href: '/reports/supplier-payables', module: 'reports_supplierPayables', title: 'مستحقات الموردين' },
            { type: 'link', href: '/reports/supplier-statement', module: 'reports_supplierStatement', title: 'كشف حساب الموردين' },
            { type: 'link', href: '/reports/cash-account-statement', module: 'reports_cashAccountStatement', title: 'كشف حساب الخزينة' },
            { type: 'link', href: '/reports/partner-shares', module: 'reports_partnerShares', title: 'تقرير حصص الشركاء' },
            { type: 'link', href: '/reports/financial-statements', module: 'reports_financialStatements', title: 'القوائم المالية' },
        ]},
    ]},
    { type: 'collapsible', title: 'الإعدادات', icon: <Settings />, modules: ['settings_users', 'settings_roles', 'settings_general', 'settings_backup', 'settings_periodClosing', 'settings_cashAccounts', 'settings_printers', 'settings_receiptDesigner', 'settings_restaurantTables', 'settings_theme', 'settings_eInvoice', 'settings_licenses', 'settings_sync'], children: [
      { type: 'link', href: '/users', module: 'settings_users', title: 'المستخدمون' },
      { type: 'link', href: '/roles', module: 'settings_roles', title: 'الوظائف والصلاحيات' },
      { type: 'link', href: '/master-data/cash-accounts', module: 'settings_cashAccounts', title: 'الخزائن والبنوك' },
      { type: 'link', href: '/master-data/restaurant-tables', module: 'settings_restaurantTables', title: 'إدارة الطاولات' },
      { type: 'link', href: '/settings', module: 'settings_general', title: 'الإعدادات العامة' },
      { type: 'link', href: '/settings/e-invoice', module: 'settings_eInvoice', title: 'إعدادات الإيصال الإلكتروني' },
      { type: 'link', href: '/settings/theme', module: 'settings_theme', title: 'إعدادات المظهر' },
      { type: 'link', href: '/settings/printers', module: 'settings_printers', title: 'إعدادات الطباعة' },
      { type: 'link', href: '/settings/receipt-designer', module: 'settings_receiptDesigner', title: 'مصمم الإيصالات' },
      { type: 'link', href: '/settings/license-keys', module: 'settings_licenses', title: 'إنشاء التراخيص' },
      { type: 'link', href: '/settings/backup', module: 'settings_backup', title: 'النسخ الاحتياطي' },
      { type: 'link', href: '/settings/period-closing', module: 'settings_periodClosing', title: 'إقفال الفترات' },
      { type: 'link', href: '/settings/sync', module: 'settings_sync', title: 'حالة المزامنة' },
    ]},
] as const;

const MobileSidebar = () => {
    const { user, signOut } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const { openMobile, setOpenMobile } = useSidebar();

    return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
             <SheetContent side="right" className="w-[var(--sidebar-width-mobile)] bg-sidebar p-0 text-sidebar-foreground flex flex-col" style={{ '--sidebar-width-mobile': '280px' } as React.CSSProperties}>
                 <SheetHeader className="p-4 border-b">
                     <SheetTitle>
                        <Logo />
                     </SheetTitle>
                     <SheetDescription className="sr-only">قائمة التنقل الرئيسية</SheetDescription>
                 </SheetHeader>
                  <div className="p-2">
                      <div className="relative">
                          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="بحث في القائمة..." className="h-9 pr-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                      </div>
                  </div>
                 <SidebarContent>
                     <SidebarMenu>
                         {navStructure.map((item: any) => {
                             if (item.type === 'link') {
                                 if (!searchTerm || item.title.toLowerCase().includes(searchTerm.toLowerCase())) {
                                     return <NavLink key={item.href} href={item.href || '/'} icon={item.icon} module={item.module || ''}>{item.title}</NavLink>;
                                 }
                                 return null;
                             }
                             if (item.type === 'collapsible') {
                                 return (
                                     <NavCollapsible key={item.title} title={item.title} icon={item.icon} modules={item.modules} searchTerm={searchTerm}>
                                         {item.children?.map((child: any) => {
                                             if (child.type === 'collapsible') {
                                                 return (
                                                      <NavCollapsible key={child.title} title={child.title} icon={<div className="h-1 w-1 rounded-full bg-border" />} modules={child.modules || []} searchTerm={searchTerm}>
                                                          {child.children?.map((subChild: any) => (
                                                              <NavSubLink key={subChild.href} href={subChild.href} module={subChild.module}>{subChild.title}</NavSubLink>
                                                          ))}
                                                      </NavCollapsible>
                                                 );
                                             }
                                             if(child.type === 'link') {
                                                return <NavSubLink key={child.href} href={child.href} module={child.module}>{child.title}</NavSubLink>
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
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-card m-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 p-1 h-auto justify-start w-full">
                                    <Avatar>
                                        <AvatarImage src={user?.photoURL || ''} />
                                        <AvatarFallback>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col flex-1 overflow-hidden text-right">
                                        <span className="font-semibold text-sm truncate">{user?.name || "مستخدم"}</span>
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
  const { settings, isOnline, dbAction, syncQueueCount } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const pathname = usePathname();
  const router = useRouter();

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
  
  const generalSettings = settings?.main?.general || {};
  const fabPosition = generalSettings.mobileFabPosition || 'bottom-right';
  const desktopLayout = generalSettings.desktopLayout || 'sidebar';

  const memoizedNavStructure = useMemo(() => navStructure, []);

  const isHubLayout = desktopLayout === 'modern_hub';
  const showHeader = pathname !== '/pos';


  return (
    <>
      {desktopLayout === 'sidebar' && (
        <Sidebar side="right">
          <SidebarHeader>
              <div className="flex w-full items-center justify-between p-4 border-b">
                  <Logo />
              </div>
              <div className="p-2">
                  <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="بحث في القائمة..." className="h-9 pr-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
              </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {memoizedNavStructure.map((item: any) => {
                if(item.type === 'link' && (item.title.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm)) {
                  return <NavLink key={item.href} href={item.href || '/'} icon={item.icon} module={item.module || ''}>{item.title}</NavLink>
                }
                if(item.type === 'collapsible') {
                  return (
                      <NavCollapsible key={item.title} title={item.title} icon={item.icon} modules={item.modules} searchTerm={searchTerm}>
                          {item.children?.map((child: any) => {
                              if (child.type === 'collapsible') {
                                  return (
                                       <NavCollapsible key={child.title} title={child.title} icon={<div className="h-1 w-1 rounded-full bg-border" />} modules={child.modules || []} searchTerm={searchTerm}>
                                           {child.children?.map((subChild: any) => (
                                               <NavSubLink key={subChild.href} href={subChild.href} module={subChild.module}>{subChild.title}</NavSubLink>
                                           ))}
                                       </NavCollapsible>
                                  )
                              }
                               if(child.type === 'link') {
                                return <NavSubLink key={child.href} href={child.href} module={child.module}>{child.title}</NavSubLink>
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
          <SidebarFooter className="hidden md:flex">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                         <Button variant="ghost" className="flex items-center justify-start gap-2 p-3 m-2 rounded-lg bg-card w-[calc(100%-1rem)] h-auto">
                            <Avatar>
                                <AvatarImage src={user?.photoURL || ''} />
                                <AvatarFallback>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col flex-1 overflow-hidden text-right">
                                <span className="font-semibold text-sm truncate">{user?.name || "مستخدم"}</span>
                                <span className="text-xs text-muted-foreground truncate">{user?.loginName ? `${user.loginName}@admin.com` : "email@example.com"}</span>
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

      {/* This renders the mobile sidebar trigger and content */}
      <MobileSidebar />

      <SidebarInset>
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
        
        {showHeader && (
            <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4 sticky top-0 z-30">
                <div className="flex items-center gap-2">
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
                    >
                        <ArrowLeft />
                    </Button>
                     {isHubLayout && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => router.push('/')}
                        >
                            <Home />
                        </Button>
                    )}
                </div>
                
                 <div className="hidden md:flex flex-1 justify-center">
                    {desktopLayout === 'menubar' ? (
                        <AppMenubar navStructure={memoizedNavStructure} />
                    ) : (
                        <Logo />
                    )}
                 </div>

                 <div className="flex items-center gap-2 justify-end">
                    <div className="md:hidden absolute left-1/2 -translate-x-1/2">
                        <Logo/>
                    </div>
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
        
        {children}
      </SidebarInset>
    </>
  );
}

    