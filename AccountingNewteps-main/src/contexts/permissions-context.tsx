

"use client";

import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { Loader2 } from "lucide-react";
import { useAuth } from '@/contexts/auth-context';
import { useData } from './data-provider';

type RoleName = 'مسؤول' | 'محاسب' | 'أمين مخزن' | 'أمين صندوق' | 'كاشير' | 'مدير محل';

export type PermissionAction = "view" | "add" | "edit" | "delete" | "print" | "generate" | "approve";

export type PermissionModule = {
    label: string;
    group: string;
    actions: PermissionAction[];
};

export const permissionsConfig = {
    // General
    dashboard: { label: "لوحة التحكم", group: "general", actions: ["view"] },
    
    // POS
    pos: { label: "شاشة الكاشير", group: "pos", actions: ["view"] },
    restaurant_tables: { label: "شاشة الطاولات", group: "pos", actions: ["view"] },
    pos_terminals: { label: "إدارة نقاط البيع", group: "pos", actions: ["view", "add", "edit", "delete"] },
    pos_paymentMethods: { label: "طرق الدفع", group: "pos", actions: ["view", "add", "edit", "delete"] },
    pos_itemGroups: { label: "مجموعات أصناف الكاشير", group: "pos", actions: ["view", "add", "edit", "delete"] },
    pos_sessions: { label: "إدارة يومية الكاشير", group: "pos", actions: ["view", "add", "delete"] },
    sales_posReturns: { label: "مرتجع نقاط البيع", group: "pos", actions: ["view", "add"] },
    
    // Marketing
    marketing_promotions: { label: "العروض والخصومات", group: "marketing", actions: ["view", "add", "edit", "delete"] },
    marketing_targets: { label: "إدارة الأهداف", group: "marketing", actions: ["view", "edit"] },
    sellers_data: { label: "بيانات البائعين", group: "marketing", actions: ["view", "add", "edit", "delete"] },

    // Items and Pricing
    inventory_items_list: { label: "بطاقة الأصناف", group: "items", actions: ["view", "add", "edit", "delete"] },
    inventory_items_categories: { label: "تصنيفات الأصناف", group: "items", actions: ["view", "add", "edit", "delete"] },
    inventory_items_colors: { label: "الألوان", group: "items", actions: ["view", "add", "edit", "delete"] },
    inventory_items_sizes: { label: "المقاسات", group: "items", actions: ["view", "add", "edit", "delete"] },
    inventory_items_deleted: { label: "الأصناف المحذوفة", group: "items", actions: ["view", "edit", "delete"] },
    inventory_priceUpdate: { label: "تعديلات أسعار البيع", group: "items", actions: ["view", "edit"] },
    inventory_importItems: { label: "استيراد الأصناف", group: "items", actions: ["view", "add"] },
    inventory_barcodeDesigner: { label: "مصمم الباركود", group: "items", actions: ["view", "print", "edit", "add", "delete"] },
    inventory_barcodePrint: { label: "طباعة الباركود", group: "items", actions: ["view", "print"] },
    
    // Warehouses and Inventory
    inventory_warehouses: { label: "الفروع", group: "warehouses", actions: ["view", "add", "edit", "delete"] },
    inventory_goodsInTransit: { label: "بضاعة بالطريق", group: "warehouses", actions: ["view"] },
    inventory_requisitions_recommendations: { label: "توصيات طلبات البضاعة", group: "warehouses", actions: ["view", "generate"] },
    inventory_stockOut: { label: "صرف مخزون", group: "warehouses", actions: ["view", "add", "delete", "print"] },
    inventory_transfer: { label: "تحويل مخزون", group: "warehouses", actions: ["view", "add", "delete", "print"] },
    inventory_adjustment: { label: "تسوية المخزون", group: "warehouses", actions: ["view", "add", "delete", "print"] },
    inventory_movements: { label: "حركة المخزون", group: "warehouses", actions: ["view"] },
    
    // Logistics
    inventory_zones: { label: "المخازن الرئيسية والأقسام", group: "logistics", actions: ["view", "add", "edit", "delete"] },
    inventory_stockIn: { label: "تسكين البضاعة (إذن دخول)", group: "logistics", actions: ["view", "add", "delete", "print"] },
    inventory_requisitions: { label: "طلبات البضاعة", group: "logistics", actions: ["view", "add", "approve", "delete"] },
    
    // Customers and Sales
    customers_data: { label: "بيانات العملاء", group: "customers", actions: ["view", "add", "edit", "delete"] },
    sales_invoices: { label: "فواتير البيع", group: "customers", actions: ["view", "add", "edit", "delete", "print"] },
    sales_returns: { label: "مرتجعات البيع", group: "customers", actions: ["view", "add", "edit", "delete", "print"] },
    accounting_customerPayments: { label: "مقبوضات العملاء", group: "customers", actions: ["view", "add", "delete"] },

    // Suppliers and Purchases
    suppliers_data: { label: "بيانات الموردين", group: "suppliers", actions: ["view", "add", "edit", "delete"] },
    purchases_orders: { label: "أوامر الشراء", group: "suppliers", actions: ["view", "add", "edit", "delete"] },
    purchases_invoices: { label: "فواتير الشراء", group: "suppliers", actions: ["view", "add", "edit", "delete", "print"] },
    purchases_returns: { label: "مرتجعات الشراء", group: "suppliers", actions: ["view", "add", "edit", "delete", "print"] },
    accounting_supplierPayments: { label: "مدفوعات الموردين", group: "suppliers", actions: ["view", "add", "delete"] },

    // Accounting and Finance
    accounting_journal: { label: "قيود اليومية", group: "accounting", actions: ["view"] },
    accounting_expenses: { label: "إدارة المصروفات", group: "accounting", actions: ["view", "add", "delete"] },
    accounting_exceptionalIncome: { label: "الدخل الاستثنائي", group: "accounting", actions: ["view", "add", "delete"] },
    accounting_treasury: { label: "حركة الخزينة", group: "accounting", actions: ["view", "add", "delete"] },
    accounting_profitDistribution: { label: "توزيعات الأرباح", group: "accounting", actions: ["view", "add", "delete"] },
    
    // Sales Reps
    users: { label: "المستخدمون والمناديب", group: "salesReps", actions: ["view", "add", "edit", "delete"] },
    partners_data: { label: "بيانات الشركاء", group: "salesReps", actions: ["view", "add", "edit", "delete"] },
    sales_issueToRep: { label: "صرف بضاعة لمندوب", group: "salesReps", actions: ["view", "add", "delete"] },
    sales_returnFromRep: { label: "مرتجع بضاعة من مندوب", group: "salesReps", actions: ["view", "add", "delete"] },
    sales_rep_new_invoice: { label: 'إنشاء فاتورة مندوب', group: 'salesReps', actions: ['view', 'add'] },
    sales_repInvoices: { label: "اعتماد فواتير المناديب", group: "salesReps", actions: ["view", "approve", "delete"] },
    sales_repOperations: { label: "مراقبة أداء المناديب", group: "salesReps", actions: ["view"] },
    sales_remitFromRep: { label: "توريد نقدية من مندوب", group: "salesReps", actions: ["view", "add", "delete"] },
    sales_recordVisit: { label: "تسجيل زيارة", group: "salesReps", actions: ["view", "add"] },
    sales_monitorVisits: { label: "متابعة الزيارات", group: "salesReps", actions: ["view"] },
    sales_monitorLogins: { label: "مراقبة تسجيلات الدخول", group: "salesReps", actions: ["view"] },
    
    // Delivery
    delivery_staff: { label: "إدارة الطيارين", group: "delivery", actions: ["view", "add", "edit", "delete"] },
    delivery_operations: { label: "عمليات الطيارين", group: "delivery", actions: ["view"] },
    sales_deliveryReconciliation: { label: "تحصيل فواتير الدليفري", group: "delivery", actions: ["view", "approve", "delete"] },

    // HR
    hr_advances: { label: "سلف الموظفين", group: "hr", actions: ["view", "add", "delete"] },
    hr_adjustments: { label: "المكافآت والجزاءات", group: "hr", actions: ["view", "add", "delete"] },
    hr_payroll: { label: "احتساب الرواتب", group: "hr", actions: ["view", "generate", "print"] },

    // Reports
    analytics: { label: "التحليلات الرسومية", group: "reports", actions: ["view", "generate", "print"] },
    reports_sales: { label: "تقرير المبيعات المفصل", group: "reports", actions: ["view", "generate", "print"] },
    reports_posSales: { label: "مبيعات نقاط البيع (مجمع)", group: "reports", actions: ["view", "generate", "print"] },
    reports_pos: { label: "تقارير نقاط البيع (مفصل)", group: "reports", actions: ["view"] },
    reports_itemProfitLoss: { label: "تقرير أرباح الأصناف", group: "reports", actions: ["view", "generate", "print"] },
    reports_salesByCategory: { label: "تقرير مبيعات الأقسام", group: "reports", actions: ["view", "generate", "print"] },
    reports_itemSalesCount: { label: "تقرير عدد مرات البيع", group: "reports", actions: ["view", "generate", "print"] },
    reports_itemLedger: { label: "كارت الصنف", group: "reports", actions: ["view", "generate", "print"] },
    reports_priceChangeLogs: { label: "سجل تغييرات الأسعار", group: "reports", actions: ["view"] },
    reports_itemExpiry: { label: "قرب انتهاء الصلاحية", group: "reports", actions: ["view"] },
    reports_customerReceivables: { label: "مستحقات العملاء", group: "reports", actions: ["view", "generate", "print"] },
    reports_supplierPayables: { label: "مستحقات الموردين", group: "reports", actions: ["view", "generate", "print"] },
    reports_supplierStatement: { label: "كشف حساب الموردين", group: "reports", actions: ["view", "generate", "print"] },
    reports_cashAccountStatement: { label: "كشف حساب الخزينة", group: "reports", actions: ["view"] },
    reports_partnerShares: { label: "تقرير حصص الشركاء", group: "reports", actions: ["view", "generate", "print"] },
    reports_financialStatements: { label: "القوائم المالية", group: "reports", actions: ["view", "print"] },
    reports_recipe: { label: "تقارير التصنيع", group: "reports", actions: ["view", "generate", "print"] },
    reports_restaurantTables: { label: "تقرير الطاولات", group: "reports", actions: ["view"] },
    reports_sellerTargets: { label: "تقرير أهداف البائعين", group: "reports", actions: ["view", "generate", "print"] },
    reports_stockOutReport: { label: "تقرير السحب", group: "reports", actions: ["view", "generate", "print"] },
    reports_stockStatus: { label: "تقرير أرصدة المخازن", group: "reports", actions: ["view", "generate", "print"] },
    reports_discrepancies: { label: "تقرير عدم تطابق المخزون", group: "reports", actions: ["view"] },

    // Settings
    settings_users: { label: "المستخدمون", group: "settings", actions: ["view", "add", "edit", "delete"] },
    settings_roles: { label: "الوظائف والصلاحيات", group: "settings", actions: ["view", "edit"] },
    settings_cashAccounts: { label: "الخزائن والبنوك", group: "settings", actions: ["view", "add", "edit", "delete"] },
    settings_restaurantTables: { label: "إدارة الطاولات", group: "settings", actions: ["view", "add", "edit", "delete"] },
    settings_general: { label: "الإعدادات العامة", group: "settings", actions: ["view", "edit"] },
    settings_eInvoice: { label: "الإيصال الإلكتروني", group: "settings", actions: ["view", "edit"] },
    settings_printers: { label: "إعدادات الطباعة", group: "settings", actions: ["view", "edit"] },
    settings_receiptDesigner: { label: "مصمم الإيصالات", group: "settings", actions: ["view", "edit"] },
    settings_licenses: { label: "إنشاء التراخيص", group: "settings", actions: ["view", "add", "delete"] },
    settings_backup: { label: "النسخ الاحتياطي", group: "settings", actions: ["view", "generate"] },
    settings_periodClosing: { label: "إقفال الفترات", group: "settings", actions: ["view", "generate"] },
    settings_sync: { label: "حالة المزامنة", group: "settings", actions: ["view"] },
} as const;

const moduleGroupLabels: Record<string, string> = {
    general: "عام",
    pos: "نقاط البيع",
    marketing: "التسويق والمبيعات",
    items: "الأصناف والتسعير",
    warehouses: "المخازن والجرد",
    logistics: "اللوجيستيك والمخازن الرئيسية",
    customers: "العملاء",
    suppliers: "الموردون",
    accounting: "المحاسبة والمالية",
    salesReps: "الموظفون والمبيعات",
    delivery: "الدليفري",
    hr: "الموارد البشرية",
    reports: "التقارير والتحليلات",
    settings: "الإعدادات والإدارة",
};

export const getModuleGroupLabel = (groupKey: string) => moduleGroupLabels[groupKey] || groupKey;

// Function to generate full permissions for the admin role
const generateAdminPermissions = () => {
    const adminPermissions: { [key: string]: { [key: string]: boolean } } = {};
    for (const moduleKey in permissionsConfig) {
        adminPermissions[moduleKey] = {};
        const module = permissionsConfig[moduleKey as keyof typeof permissionsConfig];
        for (const action of module.actions) {
            adminPermissions[moduleKey][action] = true;
        }
    }
    return adminPermissions;
};

export const initialRoles = {
  "مسؤول": generateAdminPermissions(),
  "محاسب": {
    dashboard: { view: true },
    inventory_items_list: { view: true, add: true, edit: true, delete: false },
    sales_invoices: { view: true, add: true, edit: true, delete: false, print: true },
    sales_repInvoices: { view: true, approve: true, delete: true },
    purchases_invoices: { view: true, add: true, edit: true, delete: false, print: true },
    accounting_journal: { view: true },
    accounting_expenses: { view: true, add: true, edit: false, delete: false },
    reports_customerStatement: { view: true, generate: true, print: true },
  },
  "أمين مخزن": {
    dashboard: { view: true },
    inventory_items_list: { view: true, add: false, edit: false, delete: false },
    inventory_stockIn: { view: true, add: true, delete: false, print: true },
    inventory_stockOut: { view: true, add: true, delete: false, print: true },
    inventory_transfer: { view: true, add: true, delete: false, print: true },
    inventory_movements: { view: true },
  },
  "أمين صندوق": {
    dashboard: { view: true },
    accounting_customerPayments: { view: true, add: true, delete: false },
    accounting_supplierPayments: { view: true, add: true, delete: false },
    accounting_treasury: { view: true, add: true, delete: false },
  },
  "كاشير": {
    pos: { view: true },
    sales_posReturns: { view: true, add: true },
    reports_stockStatus: { view: true },
    customers_data: { view: true },
  },
  "مدير محل": {
    dashboard: { view: true },
    pos: { view: true },
    pos_sessions: { view: true, add: true },
    inventory_items_list: { view: true, add: true, edit: true },
    reports_stockStatus: { view: true, generate: true },
    inventory_movements: { view: true },
    sales_invoices: { view: true, add: true, print: true },
    purchases_invoices: { view: true, add: true, print: true },
    hr_employees: { view: true },
    hr_advances: { view: true, add: true },
    reports_sales: { view: true, generate: true },
    reports_posSales: { view: true, generate: true },
    reports_itemLedger: { view: true, generate: true },
  },
};


type Role = keyof typeof initialRoles;
type Module = keyof typeof permissionsConfig;
type Action = PermissionAction;

interface PermissionsContextType {
  role: Role | null;
  permissions: any;
  can: (action: Action, module: Module | string) => boolean;
  licenses: any[];
  user: any; // Add user here for license checks
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { licenses, roles: allRoles, loading } = useData();

  const role = user?.role as Role | null;
  
  const permissions = useMemo(() => {
    if (loading || !allRoles) return null;
    return role ? allRoles[role] : null;
  }, [allRoles, role, loading]);


  const can = useCallback((action: Action, module: Module | string): boolean => {
    if (user?.id === 'superadmin') return true;
    if (!user) return false;
    
    // License check
    const currentLicenseKey = user?.themeSettings?.licenseKey;
    const license = licenses.find((lic: any) => lic.key === currentLicenseKey);
    
    if (!license || license.status !== 'assigned' || (license.endDate && new Date() > new Date(license.endDate))) {
        // Allow access only to essential settings if license is invalid
        return ['settings_general', 'settings_sync', 'settings_theme', 'settings_printers', 'settings_receiptDesigner', 'settings_licenses'].includes(module);
    }
    
    // If license has defined modules, check if the current module is enabled
    if (license.enabledModules && license.enabledModules[module] === false) {
        return false;
    }

    // Role-based permission check
    if (role === 'مسؤول') {
        return true;
    }
    
    if (!permissions) {
        return false;
    }
    
    const m = module as Module;
    if (!permissions[m] || typeof permissions[m] !== 'object' || !(action in permissions[m])) {
        return false;
    }

    return permissions[m][action as keyof typeof permissions[typeof m]] || false;

  }, [permissions, role, licenses, user]);


  if (loading) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="mr-2">جارٍ تحميل الصلاحيات...</p>
        </div>
    )
  }

  const value = { role, permissions, can, licenses, user };

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = (): PermissionsContextType => {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
};
