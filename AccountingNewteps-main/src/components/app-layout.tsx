
"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
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
  const { settings, isOnline } = useData();
  const companyName = settings?.main?.general?.companyName || "Meto";

  return (
    <div className="flex items-center gap-2" >
        <Scale className="h-7 w-7 text-green-500"/>
        <Laptop className="h-7 w-7 text-green-500"/>
        <div className="flex flex-col">
            <h1 className="text-lg font-bold text-primary leading-none">{companyName}</h1>
            {!isOnline && <span className="text-[10px] text-destructive font-semibold">وضع الأوفلاين</span>}
        </div>
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
    ]},
    { type: 'collapsible', title: dictionary.nav.warehouses, icon: <Warehouse />, modules: ['inventory_warehouses', 'inventory_goodsInTransit', 'inventory_requisitions_recommendations', 'inventory_stockOut', 'inventory_transfer', 'inventory_adjustment', 'inventory_movements', 'inventory_requisitions'], children: [
        { type: 'link', href: '/master-data/branches', module: 'inventory_warehouses', title: dictionary.nav.branches },
        { type: 'link', href: '/master-data/delegate-warehouses', module: 'inventory_warehouses', title: "مخازن المناديب" },
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
        { type: 'link', href: '/accounting/assets', module: 'accounting_assets', title: dictionary.nav.fixedAssets },
        { type: 'link', href: '/accounting/vat', module: 'accounting_vat', title: dictionary.nav.vatReport },
        { type: 'link', href: '/accounting/expenses', module: 'accounting_expenses', title: dictionary.nav.expensesAdmin },
        { type: 'link', href: '/accounting/exceptional-income', module: 'accounting_exceptionalIncome', title: dictionary.nav.exceptionalIncome },
        { type: 'link', href: '/accounting/gratuity', module: 'accounting_gratuity', icon: <HeartHandshake />, title: "صندوق الإكراميات (Tips)" },
        { type: 'link', href: '/accounting/treasury', module: 'accounting_treasury', title: dictionary.nav.treasuryMovements },
        { type: 'link', href: '/accounting/profit-distribution', module: 'accounting_profitDistribution', title: dictionary.nav.profitDistribution },
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
        { type: 'link', href: '/hr/advances', module: 'hr_advances', title: dictionary.nav.employeeAdvances },
        { type: 'link', href: '/hr/adjustments', module: 'hr_adjustments', title: dictionary.nav.employeeAdjustments },
        { type: 'link', href: '/hr/payroll', module: 'hr_payroll', title: dictionary.nav.payroll },
    ]},
     { type: 'collapsible', title: dictionary.nav.reports, icon: <BarChart />, modules: ['analytics', 'reports_recipe', 'reports_customerReceivables', 'reports_supplierPayables', 'reports_supplierStatement', 'reports_itemProfitLoss', 'reports_salesByCategory', 'reports_itemLedger', 'reports_financialStatements', 'reports_partnerShares', 'reports_sales', 'reports_pos', 'reports_posSales', 'reports_itemSalesCount', 'reports_priceChangeLogs', 'inventory_movements', 'reports_pos', 'sales_returns', 'reports_cashAccountStatement', 'reports_itemExpiry', 'reports_restaurantTables', 'reports_sellerTargets', 'inventory_stockIn', 'reports_stockStatus', 'reports_stockOutReport'], children: [
        { type: 'link', href: '/analytics', module: 'analytics', title: dictionary.nav.graphicalAnalytics },
        { type: 'collapsible', title: dictionary.nav.salesReports, modules: ['reports_sales', 'reports_posSales', 'reports_pos', 'sales_returns', 'reports_itemSalesCount', 'reports_restaurantTables', 'reports_sellerTargets'], children: [
            { type: 'link', href: '/reports/sales-reports', module: 'reports_sales', title: dictionary.nav.detailedSalesReport },
            { type: 'link', href: '/reports/pos-sales', module: 'reports_posSales', title: dictionary.nav.posSalesSummary },
            { type: 'link', href: '/reports/pos-reports', module: 'reports_pos', title: dictionary.nav.detailedPosReport },
            { type: 'link', href: '/reports/sales-returns-report', module: 'sales_returns', title: dictionary.nav.salesReturnsReport },
            { type: 'link', href: '/reports/cancelled-invoices', module: 'reports_pos', title: dictionary.nav.cancelledInvoices },
            { type: 'link', href: '/reports/item-sales-count', module: 'reports_itemSalesCount', title: dictionary.nav.itemSalesCountReport },
            { type: 'link', href: '/reports/tables-report', module: 'reports_restaurantTables', title: dictionary.nav.tablesReport },
            { type: 'link', href: '/reports/cashier-discrepancies', module: 'reports_pos', title: dictionary.nav.cashierDiscrepancies },
            { type: 'link', href: '/reports/payment-methods-report', module: 'reports_pos', title: dictionary.nav.paymentMethodsReport },
            { type: 'link', href: '/reports/seller-targets', module: 'reports_sellerTargets', title: dictionary.nav.sellerTargetsReport },
        ]},
        { type: 'collapsible', title: dictionary.nav.inventoryAndLogisticsReports, modules: ['reports_itemProfitLoss', 'reports_salesByCategory', 'reports_itemLedger', 'reports_priceChangeLogs', 'inventory_movements', 'reports_itemExpiry', 'reports_recipe', 'inventory_stockStatus', 'inventory_stockIn', 'reports_stockOutReport', 'reports_discrepancies'], children: [
            { type: 'link', href: '/reports/item-profit-loss', module: 'reports_itemProfitLoss', title: dictionary.nav.itemProfitLossReport },
            { type: 'link', href: '/reports/sales-by-category', module: 'reports_salesByCategory', title: dictionary.nav.salesByCategoryReport },
            { type: 'link', href: '/reports/recipe-reports', module: 'reports_recipe', title: dictionary.nav.manufacturingReports },
            { type: 'link', href: '/reports/item-ledger', module: 'reports_itemLedger', title: dictionary.nav.itemLedger },
            { type: 'link', href: '/reports/stock-in-report', module: 'inventory_stockIn', title: dictionary.nav.stockInReport },
            { type: 'link', href: '/reports/stock-out-report', module: 'reports_stockOutReport', title: dictionary.nav.stockOutReport },
            { type: 'link', href: '/reports/price-change-logs', module: 'reports_priceChangeLogs', title: dictionary.nav.priceChangeLog },
            { type: 'link', href: '/reports/discrepancies', module: 'reports_discrepancies', title: dictionary.nav.stockDiscrepancyReport },
            { type: 'link', href: '/reports/item-expiry', module: 'reports_itemExpiry', title: dictionary.nav.itemExpiryReport },
            { type: 'link', href: '/reports/stock-status', module: 'inventory_stockStatus', title: dictionary.nav.stockStatusReport },
        ]},
        { type: 'collapsible', title: dictionary.nav.financialAndAccountsReports, modules: ['reports_customerReceivables', 'reports_supplierPayables', 'reports_supplierStatement', 'reports_cashAccountStatement', 'reports_partnerShares', 'reports_financialStatements'], children: [
            { type: 'link', href: '/reports/customer-receivables', module: 'reports_customerReceivables', title: dictionary.nav.customerReceivables },
            { type: 'link', href: '/reports/supplier-payables', module: 'reports_supplierPayables', title: dictionary.nav.supplierPayables },
            { type: 'link', href: '/reports/supplier-statement', module: 'reports_supplierStatement', title: dictionary.nav.supplierStatement },
            { type: 'link', href: '/reports/cash-account-statement', module: 'reports_cashAccountStatement', title: dictionary.nav.cashAccountStatement },
            { type: 'link', href: '/reports/partner-shares', module: 'reports_partnerShares', title: dictionary.nav.partnerSharesReport },
            { type: 'link', href: '/reports/financial-statements', module: 'reports_financialStatements', title: dictionary.nav.financialStatements },
        ]},
    ]},
    { type: 'collapsible', title: dictionary.nav.settings, icon: <Settings />, modules: ['settings_users', 'settings_roles', 'settings_general', 'settings_backup', 'settings_periodClosing', 'settings_cashAccounts', 'settings_printers', 'settings_receiptDesigner', 'settings_restaurantTables', 'settings_theme', 'settings_eInvoice', 'settings_licenses', 'settings_sync'], children: [
      { type: 'link', href: '/users', module: 'settings_users', title: dictionary.nav.users },
      { type: 'link', href: '/roles', module: 'settings_roles', title: dictionary.nav.rolesAndPermissions },
      { type: 'link', href: '/master-data/cash-accounts', module: 'settings_cashAccounts', title: dictionary.nav.cashAndBanks },
      { type: 'link', href: '/master-data/restaurant-tables', module: 'settings_restaurantTables', title: dictionary.nav.tablesAdmin },
      { type: 'link', href: '/settings', module: 'settings_general', title: dictionary.nav.generalSettings },
      { type: 'link', href: '/settings/e-invoice', module: 'settings_eInvoice', title: dictionary.nav.eInvoiceSettings },
      { type: 'link', href: '/settings/theme', module: 'settings_theme', title: dictionary.nav.themeSettings },
      { type: 'link', href: '/settings/printers', module: 'settings_printers', title: dictionary.nav.printSettings },
      { type: 'link', href: '/settings/receipt-designer', module: 'settings_receiptDesigner', title: dictionary.nav.receiptDesigner },
      { type: 'link', href: '/settings/license-keys', module: 'settings_licenses', title: dictionary.nav.licenseKeys },
      { type: 'link', href: '/settings/backup', module: 'settings_backup', title: dictionary.nav.backupAndRestore },
      { type: 'link', href: '/settings/period-closing', module: 'settings_periodClosing', title: dictionary.nav.periodClosing },
      { type: 'link', href: '/settings/sync', module: 'settings_sync', title: dictionary.nav.syncStatus },
      { type: 'link', href: '/settings/central-sync', module: 'settings_sync', title: 'المزامنة والسيرفر المركزي' },
    ]},
] as const;

const MobileSidebar = () => {
    const { user, signOut } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const { openMobile, setOpenMobile } = useSidebar();

    return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
             <SheetContent 
                side="right" 
                className="w-[var(--sidebar-width-mobile)] bg-sidebar p-0 text-sidebar-foreground flex flex-col" 
                style={{ '--sidebar-width-mobile': '280px' } as React.CSSProperties}
                onOpenAutoFocus={(event) => event.preventDefault()}
            >
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
  const { settings, isOnline, dbAction, syncQueueCount, users } = useData();
  const { can } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  const [offlineReadiness, setOfflineReadiness] = useState<number | null>(null);

  const [openTabs, setOpenTabs] = useState<{title: string, href: string}[]>([]);

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
    if (pathname && pathname !== '/' && pathname !== '/pos') {
        const title = findTitleForHref(pathname);
        if (title) {
            setOpenTabs(prev => {
                if (prev.some(tab => tab.href === pathname)) return prev;
                return [...prev, { title, href: pathname }];
            });
        }
    }
  }, [pathname, findTitleForHref]);

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
  
  const generalSettings = settings?.main?.general || {};
  const fabPosition = generalSettings.mobileFabPosition || 'bottom-right';
  const desktopLayout = generalSettings.desktopLayout || 'sidebar';

  const memoizedNavStructure = useMemo(() => navStructure, []);

  const isHubLayout = desktopLayout === 'modern_hub';
  const showHeader = pathname !== '/pos';

  const handleCloseTab = (e: React.MouseEvent, href: string) => {
      e.stopPropagation();
      e.preventDefault();
      setOpenTabs(prev => prev.filter(tab => tab.href !== href));
      if (pathname === href) {
          router.push('/');
      }
  };


  return (
    <>
      {desktopLayout === 'sidebar' && (
        <Sidebar side="right">
          <SidebarHeader>
              <div className="flex flex-col w-full p-4 border-b gap-3">
                  <div className="flex w-full items-center justify-between">
                      <Logo />
                  </div>
                  {offlineReadiness !== null && (
                      <div className="w-full space-y-1">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>جاهزية الأوفلاين</span>
                              <span>{Math.round(offlineReadiness)}%</span>
                          </div>
                          <Progress value={offlineReadiness} className="h-1.5" />
                      </div>
                  )}
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

      <MobileSidebar />

      <SidebarInset className="h-screen max-h-screen overflow-hidden flex flex-col">
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
            <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4 shrink-0 sticky top-0 z-30">
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
        
        <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
            <div className="flex-1 overflow-y-auto min-h-0">
                {children}
            </div>

            {/* Taskbar / Open Tabs Bar */}
            {openTabs.length > 0 && pathname !== '/pos' && (
                <div className="h-12 bg-card/95 backdrop-blur-md border-t flex items-center px-4 gap-2 overflow-x-auto shrink-0 z-40 sticky bottom-0 shadow-[0_-2px_10px_rgba(0,0,0,0.12)] no-print">
                    {openTabs.map((tab) => (
                        <div 
                            key={tab.href}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap border-b-2 border-transparent",
                                pathname === tab.href 
                                    ? "bg-background text-primary border-primary shadow-sm" 
                                    : "hover:bg-background/50 text-muted-foreground"
                            )}
                            onClick={() => router.push(tab.href)}
                        >
                            <span>{tab.title}</span>
                            <button 
                                onClick={(e) => handleCloseTab(e, tab.href)}
                                className="hover:bg-muted p-0.5 rounded-full"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </SidebarInset>
    </>
  );
}
