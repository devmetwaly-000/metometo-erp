/**
 * @fileOverview محرك المزامنة المركزي المتقدم المبني على التوقيت الزمني وتتبع التعديلات (Timestamp & Watermark Sync Engine)
 * يتولى الربط والتبادل الذكي بين قاعدة بيانات الفرع المحلية والسيرفر المركزي للإدارة:
 * 1. تتبع التعديلات والتوقيتات الزمنية (UpdatedAt, LastSyncedAt, CreatedAt) على مستوى كل جدول.
 * 2. جدول تتبع المزامنة المركزي في قاعدة البيانات: dbo.SyncTrackingMatrix (يخزن لكل جدول آخر تعديل وآخر مزامنة ناجحة).
 * 3. المزامنة الذكية القائمة على التحقق من وجود السطر (إذا وجد يُحدث، وإذا لم يوجد يُضاف - Upsert / Merge).
 * 4. دعم بيئة الفروع المتعددة: الإدارة تستقبل بيانات فروع متعددة بدون خلط الأعداد.
 */

import sql from 'mssql';
import { getDbPool } from '@/lib/db';

export interface CentralSyncConfig {
    systemRole?: 'branch' | 'central';
    currentBranchId: string;
    currentBranchCode: string;
    currentBranchName: string;
    centralServerIp: string;
    centralSqlPort: number;
    centralDatabase: string;
    centralUsername: string;
    centralPassword: string;
    autoSync: boolean;
    autoSyncIntervalMinutes: number;
    lastSyncTime?: string | null;
    lastSyncStatus?: 'success' | 'failed' | 'in_progress' | 'never' | 'ready';
    lastSyncError?: string | null;
    lastPushedCount?: number;
    lastPulledCount?: number;
}

const DEFAULT_CONFIG: CentralSyncConfig = {
    systemRole: 'branch',
    currentBranchId: '-OmnkFba_GsEb0rfdzyA',
    currentBranchCode: '900',
    currentBranchName: 'الفرع الرأيسي',
    centralServerIp: '10.110.16.16',
    centralSqlPort: 1433,
    centralDatabase: 'MultiBranchPOS_Central_DB',
    centralUsername: 'gmlogins',
    centralPassword: 'retgomladb',
    autoSync: true,
    autoSyncIntervalMinutes: 5,
    lastSyncTime: null,
    lastSyncStatus: 'ready'
};

export type SyncDirection = 'push' | 'pull' | 'bidirectional' | 'disabled';

export interface TableSyncMeta {
    name: string;
    category: string;
    direction: SyncDirection;
    idColumn: string;
    childTable?: string;
    foreignKey?: string;
    description?: string;
    dataScope?: string;
}

/**
 * خريطة بيانات ومحددات وتوصيف جميع جداول النظام الـ 69
 */
export const TABLE_METADATA_MAP: Record<string, TableSyncMeta> = {
    // 1. فواتير وعمليات (فواتير، مرتجعات، كاشير)
    SalesInvoices: { name: 'فواتير المبيعات', category: 'فواتير وعمليات', direction: 'push', idColumn: 'Id', childTable: 'SalesInvoiceItems', foreignKey: 'InvoiceId', description: 'بيانات فواتير المبيعات الصادرة من نقاط البيع، أرقام الفواتير، الإجماليات، والضرائب', dataScope: 'حركات مبيعات' },
    SalesInvoiceItems: { name: 'بنود فواتير المبيعات', category: 'فواتير وعمليات', direction: 'push', idColumn: 'Id', description: 'تفاصيل بنود الأصناف المباعة، الكميات، أسعار البيع والتكلفة والخصم', dataScope: 'حركات مبيعات' },
    SalesReturns: { name: 'مردودات المبيعات', category: 'فواتير وعمليات', direction: 'push', idColumn: 'Id', childTable: 'SalesReturnItems', foreignKey: 'ReturnId', description: 'سجل فواتير مرتجعات المبيعات المستردة من العملاء وقيم الاسترداد', dataScope: 'حركات مرتجعات' },
    SalesReturnItems: { name: 'بنود مردودات المبيعات', category: 'فواتير وعمليات', direction: 'push', idColumn: 'Id', description: 'تفاصيل بنود الأصناف المرتجعة والكميات المستردة للمخزن', dataScope: 'حركات مرتجعات' },
    HeldInvoices: { name: 'الفواتير المعلقة بالكاشير', category: 'فواتير وعمليات', direction: 'push', idColumn: 'Id', description: 'الفواتير المعلقة مؤقتاً على شاشات الكاشير قبل استكمال الدفع', dataScope: 'عمليات معلقة' },

    // 2. مشتريات وموردين
    PurchaseInvoices: { name: 'فواتير المشتريات', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id', childTable: 'PurchaseInvoiceItems', foreignKey: 'PurchaseInvoiceId', description: 'فواتير الشراء الواردة من الموردين بالمخازن وتكاليف الاستلام', dataScope: 'حركات مشتريات' },
    PurchaseInvoiceItems: { name: 'بنود فواتير المشتريات', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id', description: 'بنود وأسعار وتكاليف أصناف فواتير المشتريات المستلمة', dataScope: 'حركات مشتريات' },
    PurchaseReturns: { name: 'مردودات المشتريات', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id', childTable: 'PurchaseReturnItems', foreignKey: 'ReturnId', description: 'أذون إرجاع البضاعة والمشتريات للموردين وتسوية حساباتهم', dataScope: 'حركات مشتريات' },
    PurchaseReturnItems: { name: 'بنود مردودات المشتريات', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id', description: 'تفاصيل بنود الأصناف المرتجعة إلى الموردين', dataScope: 'حركات مشتريات' },
    PurchaseOrders: { name: 'أوامر الشراء للموردين', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id', description: 'أوامر وطلبات الشراء الصادرة للموردين قيد التنفيذ', dataScope: 'أوامر شراء' },
    Suppliers: { name: 'سجل الموردين', category: 'مشتريات وموردين', direction: 'bidirectional', idColumn: 'Id', description: 'سجل الموردين، بيانات الاتصال، والأرصدة الافتتاحية والآجلة', dataScope: 'بيانات رئيسية' },
    SupplierPayments: { name: 'سندات صرف الموردين', category: 'مشتريات وموردين', direction: 'push', idColumn: 'Id', description: 'سندات صرف النقدية والشيكات للموردين لتسوية الحسابات', dataScope: 'سندات صرف' },

    // 3. عملاء ومبيعات
    Customers: { name: 'سجل العملاء', category: 'عملاء ومبيعات', direction: 'bidirectional', idColumn: 'Id', description: 'قاعدة بيانات العملاء، أرقام الهواتف، والعناوين والحد الائتماني', dataScope: 'بيانات رئيسية' },
    CustomerPayments: { name: 'سندات قبض العملاء', category: 'عملاء ومبيعات', direction: 'push', idColumn: 'Id', description: 'سندات تحصيل وقبض النقدية من العملاء وتسوية المديونيات', dataScope: 'سندات قبض' },
    CustomerVisits: { name: 'سجل زيارات العملاء', category: 'عملاء ومبيعات', direction: 'push', idColumn: 'Id', description: 'سجل زيارات ومتابعات مندوبي المبيعات للعملاء والمحلات', dataScope: 'متابعة بيعية' },

    // 4. حسابات ومالية
    CashAccounts: { name: 'الخزائن والحسابات البنكية', category: 'حسابات ومالية', direction: 'bidirectional', idColumn: 'Id', description: 'دفاتر الخزائن النقدية، الحسابات البنكية، والعهد المالية', dataScope: 'حسابات مالية' },
    TreasuryTransactions: { name: 'حركات الخزينة والتحويلات', category: 'حسابات ومالية', direction: 'push', idColumn: 'Id', description: 'سجل حركة المقبوضات والمدفوعات والتحويلات بين الخزائن', dataScope: 'حركات مالية' },
    Expenses: { name: 'المصروفات التشغيلية', category: 'حسابات ومالية', direction: 'push', idColumn: 'Id', description: 'بنود المصروفات التشغيلية، الإيجارات، الفواتير، والمصاريف العامة', dataScope: 'مصروفات تشغيل' },
    ExceptionalIncomes: { name: 'الإيرادات الاستثنائية', category: 'حسابات ومالية', direction: 'push', idColumn: 'Id', description: 'الإيرادات العرضية والاستثنائية خارج النشاط البيعي المعتاد', dataScope: 'إيرادات أخرى' },
    ProfitDistributions: { name: 'توزيعات الأرباح', category: 'حسابات ومالية', direction: 'push', idColumn: 'Id', description: 'حركات توزيع الأرباح على الشركاء والمساهمين', dataScope: 'حقوق ملكية' },
    Partners: { name: 'سجل الشركاء والمساهمين', category: 'حسابات ومالية', direction: 'bidirectional', idColumn: 'Id', description: 'سجل الشركاء والمساهمين ونسب الحصص في رأس المال', dataScope: 'بيانات رئيسية' },
    PaymentMethods: { name: 'طرق الدفع والتحصيل', category: 'حسابات ومالية', direction: 'bidirectional', idColumn: 'Id', description: 'وسائل وطرق الدفع المقبولة (نقدي، فيزا، فودافون كاش، محفظة)', dataScope: 'إعدادات دفع' },

    // 5. أصول وإهلاك
    FixedAssets: { name: 'الأصول الثابتة', category: 'أصول وإهلاك', direction: 'bidirectional', idColumn: 'Id', description: 'سجل الأصول والعدد والأجهزة ومواقعها وقيمتها الدفترية', dataScope: 'أصول ثابتة' },
    DepreciationRecords: { name: 'قيود إهلاك الأصول', category: 'أصول وإهلاك', direction: 'push', idColumn: 'Id', description: 'قيود الإهلاك الدورية للأصول الثابتة ومجمع الإهلاك', dataScope: 'قيود إهلاك' },

    // 6. مخازن وأصناف
    Items: { name: 'الأصناف والمنتجات', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'بطاقات الأصناف، الأسعار، التكلفة، الوحدات، والباركودات', dataScope: 'بيانات رئيسية' },
    ItemCategories: { name: 'تصنيفات ومجموعات الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'التصنيفات والفئات لفرز وترتيب الأصناف في القوائم', dataScope: 'شجرة الأصناف' },
    ItemSections: { name: 'أقسام الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'الأقسام الرئيسية لتصنيف المخزون (مكملات، أغذية، أدوات)', dataScope: 'شجرة الأصناف' },
    ItemGroups: { name: 'الفئات العامة للأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'المجموعات العامة التابعة للفئات لترتيب المنتجات', dataScope: 'شجرة الأصناف' },
    ItemSubCategories1: { name: 'تصنيفات فرعية 1 للأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'تصنيفات الماركات والبراندات التجارية للأصناف', dataScope: 'شجرة الأصناف' },
    ItemSubCategories2: { name: 'تصنيفات فرعية 2 للأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'تصنيفات الموديل والطراز والنوع التفصيلي للأصناف', dataScope: 'شجرة الأصناف' },
    ItemColors: { name: 'ألوان وموديلات الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'ألوان ومتغيرات الأصناف وموديلاتها', dataScope: 'متغيرات أصناف' },
    ItemSizes: { name: 'مقاسات وأحجام الأصناف', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'مقاسات وأحجام وأوزان المنتجات', dataScope: 'متغيرات أصناف' },
    PriceChangeLogs: { name: 'سجل تعديلات الأسعار', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'سجل تتبع ومراجعة تعديلات الأسعار وتاريخ التغيير', dataScope: 'سجل رقابي' },
    Warehouses: { name: 'المستودعات والفروع', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'دليل المستودعات، المخازن الفرعية، ونقاط التوزيع', dataScope: 'مستودعات' },
    InventorySections: { name: 'قواطع وأقسام المستودع', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'تقسيمات وقواطع المستودع الداخلية لتنظيم التخزين', dataScope: 'مستودعات' },
    InventoryZones: { name: 'مناطق وأرفف التخزين', category: 'مخازن وأصناف', direction: 'bidirectional', idColumn: 'Id', description: 'الممرات والأرفف التفصيلية داخل أقسام المستودع', dataScope: 'مستودعات' },
    StockInRecords: { name: 'أذون إضافة واستلام مخزني', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id', childTable: 'StockInRecordItems', foreignKey: 'StockInId', description: 'أذون استلام وإضافة البضاعة والمنتجات للمخزن', dataScope: 'حركات مخزنية' },
    StockInRecordItems: { name: 'بنود أذون الإضافة المخزنية', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id', description: 'بنود أصناف وكميات أذون الإضافة المخزنية', dataScope: 'حركات مخزنية' },
    StockOutRecords: { name: 'أذون صرف وتسليم مخزني', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id', description: 'أذون صرف وتسليم البضاعة من المخزن للأقسام', dataScope: 'حركات مخزنية' },
    StockTransferRecords: { name: 'تحويلات المخزون بين الفروع', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id', description: 'مناقلات وتحويلات المخزون بين الفروع والمستودعات', dataScope: 'حركات مخزنية' },
    StockAdjustmentRecords: { name: 'تسويات الجرد المخزني', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id', childTable: 'StockAdjustmentItems', foreignKey: 'AdjustmentId', description: 'تسويات العجز والزيادة الناتجة عن الجرد الفعلي للمخزون', dataScope: 'تسويات جرد' },
    StockAdjustmentItems: { name: 'بنود تسويات الجرد المخزني', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id', description: 'تفاصيل بنود أصناف تسويات الجرد المخزني وتكاليفها', dataScope: 'تسويات جرد' },
    InventoryClosings: { name: 'تقفيلات الجرد الدوري', category: 'مخازن وأصناف', direction: 'push', idColumn: 'Id', description: 'محاضر إغلاق وتقفيل الجرد السنوي والدوري للمخازن', dataScope: 'إغلاق جرد' },

    // 7. توزيع ومندوبين
    StockIssuesToReps: { name: 'صرف بضاعة لعهدة المندوبين', category: 'توزيع ومندوبين', direction: 'push', idColumn: 'Id', description: 'إذن تسليم بضاعة لسيارات وعهدة مناديب البيع والتوزيع', dataScope: 'عهدة مناديب' },
    StockReturnsFromReps: { name: 'مرتجع بضاعة من عهدة المندوبين', category: 'توزيع ومندوبين', direction: 'push', idColumn: 'Id', description: 'سجل استرجاع البضاعة المتبقية من سيارات المندوبين للمخزن', dataScope: 'عهدة مناديب' },
    RepRemittances: { name: 'توريدات نقدية المندوبين', category: 'توزيع ومندوبين', direction: 'push', idColumn: 'Id', description: 'توريدات النقدية اليومية المحصلة من المندوبين للخزينة', dataScope: 'توريد مناديب' },
    Sellers: { name: 'البائعين والمسوقين', category: 'توزيع ومندوبين', direction: 'bidirectional', idColumn: 'Id', description: 'دليل البائعين وموظفي المبيعات ونسب عمولاتهم البيعية', dataScope: 'بيانات بيعية' },
    DeliveryStaff: { name: 'مناديب التوصيل والدليفري', category: 'توزيع ومندوبين', direction: 'bidirectional', idColumn: 'Id', description: 'سجل عمال الدليفري ومناديب الشحن والتوصيل للعملاء', dataScope: 'فريق التوصيل' },

    // 8. موارد بشرية
    Employees: { name: 'سجل الموظفين', category: 'موارد بشرية', direction: 'bidirectional', idColumn: 'Id', description: 'ملفات الموظفين، الوظائف، والبيانات الشخصية والتعاقدية', dataScope: 'شؤون عاملين' },
    EmployeeAdvances: { name: 'سلف الموظفين', category: 'موارد بشرية', direction: 'push', idColumn: 'Id', description: 'سجل سلف الموظفين والخصومات الشهرية من الرواتب', dataScope: 'استحقاقات رواتب' },
    EmployeeAdjustments: { name: 'بدلات وخصومات الموظفين', category: 'موارد بشرية', direction: 'push', idColumn: 'Id', description: 'بدلات ومكافآت وجزاءات العاملين المعتمدة', dataScope: 'استحقاقات رواتب' },
    PayrollRecords: { name: 'مسيرات الرواتب الشهرية', category: 'موارد بشرية', direction: 'push', idColumn: 'Id', description: 'كشوفات واعتمادات صرف الرواتب الشهرية وصافي المستحق', dataScope: 'مسيرات رواتب' },
    GratuityDistributions: { name: 'توزيعات مكافأة نهاية الخدمة', category: 'موارد بشرية', direction: 'push', idColumn: 'Id', description: 'صرف مستحقات ومكافآت نهاية الخدمة والتعويضات', dataScope: 'مستحقات نهاية خدمة' },
    GratuityLogs: { name: 'سجل مكافآت وبقشيش الكاشير', category: 'موارد بشرية', direction: 'push', idColumn: 'Id', description: 'سجل وتوزيع بقشيش وإكراميات عمال الصالة والكاشير', dataScope: 'إكراميات' },

    // 9. نقاط البيع
    PosSessions: { name: 'جلسات ودورات نقاط البيع', category: 'نقاط البيع', direction: 'push', idColumn: 'Id', description: 'سجل فتح وإغلاق دوريات وشفتات الكاشير اليومية وحصيلة الدرج', dataScope: 'جلسات كاشير' },
    PosTerminals: { name: 'شاشات وأجهزة الكاشير', category: 'نقاط البيع', direction: 'bidirectional', idColumn: 'Id', description: 'تعريف أجهزة وشاشات نقاط البيع وطابعات الإيصالات', dataScope: 'أجهزة نقاط بيع' },
    PosAuditLogs: { name: 'سجل رقابة وتدقيق الكاشير', category: 'نقاط البيع', direction: 'push', idColumn: 'Id', description: 'سجل رقابة عمليات الكاشير الحساسة وحذف الفواتير والبنود', dataScope: 'سجل رقابي' },
    Promotions: { name: 'العروض الترويجية والخصومات', category: 'نقاط البيع', direction: 'bidirectional', idColumn: 'Id', description: 'خطط الخصومات، العروض الترويجية، وكوبونات التخفيض', dataScope: 'عروض وخصومات' },
    RestaurantTables: { name: 'طاولات وصالات المطعم', category: 'نقاط البيع', direction: 'bidirectional', idColumn: 'Id', description: 'خريطة طاولات وصالات تقديم الطلبات ومواقع الجلوس', dataScope: 'صالات وطاولات' },

    // 10. إعدادات النظام ومستخدمين
    BarcodeDesigns: { name: 'تصميمات ونماذج الباركود', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'Id', description: 'قوالب وتصميمات طباعة استيكر الباركود والمقاسات', dataScope: 'نماذج باركود' },
    Users: { name: 'المستخدمين وحسابات الدخول', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'Id', description: 'حسابات المستخدمين، كلمات المرور المشفرة، وبيانات الدخول', dataScope: 'مستخدمين وأمان' },
    Roles: { name: 'الأدوار ومصفوفة الصلاحيات', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'Id', description: 'الأدوار الوظيفية ومصفوفة الصلاحيات وشاشات النظام', dataScope: 'مستخدمين وأمان' },
    Licenses: { name: 'التراخيص والنسخ المرخصة', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'Id', description: 'بيانات ترخيص النسخة وتاريخ صلاحية البرنامج والأجهزة', dataScope: 'تراخيص النظام' },
    AppSettings: { name: 'إعدادات النظام والمتغيرات', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'SettingKey', description: 'الإعدادات العامة للشركة، الضرائب، الترويسة، ودور النظام', dataScope: 'إعدادات النظام' },
    Counters: { name: 'عدادات الترقيم التلقائي', category: 'إعدادات النظام', direction: 'push', idColumn: 'Name', description: 'سلسلة الترقيم التلقائي التراكمي للفواتير والسندات المالية', dataScope: 'إعدادات الترقيم' },
    Targets: { name: 'الأهداف البيعية والعمولات', category: 'إعدادات النظام', direction: 'bidirectional', idColumn: 'Id', description: 'أهداف المبيعات المحددة للفروع والموظفين ونسب العمولات', dataScope: 'خطط مبيعات' },
    Requisitions: { name: 'طلبات الاحتياج والشراء', category: 'إعدادات النظام', direction: 'push', idColumn: 'Id', description: 'طلبات الاحتياج الداخلي ومذكرات الشراء المرفوعة من الفروع', dataScope: 'طلبات شراء' },
    Notifications: { name: 'الإشعارات والتنبيهات', category: 'إعدادات النظام', direction: 'push', idColumn: 'Id', description: 'إشعارات النظام اللحظية والتنبيهات الإدارية الهامة', dataScope: 'إشعارات' },
    LoginHistory: { name: 'سجل الدخول والأمان', category: 'إعدادات النظام', direction: 'push', idColumn: 'Id', description: 'سجل أمان وتتبع تسجيل دخول وخروج المستخدمين وعناوين IP', dataScope: 'سجل أمان' }
};

/**
 * خريطة المفاتيح الأجنبية للجداول الفرعية ذات عمود Identity
 */
export const CHILD_TABLE_FK_MAP: Record<string, string> = {
    SalesInvoiceItems: 'InvoiceId',
    SalesReturnItems: 'ReturnId',
    PurchaseInvoiceItems: 'PurchaseInvoiceId',
    PurchaseReturnItems: 'ReturnId',
    StockInRecordItems: 'StockInId',
    StockAdjustmentItems: 'AdjustmentId'
};

/**
 * بنية عنصر مصفوفة المزامنة لكل جدول
 */
export interface TableSyncMatrixItem {
    tableName: string;
    displayName: string;
    category: string;
    direction: SyncDirection;
    description?: string;
    dataScope?: string;

    // تواريخ التعديل والمزامنة (Timestamps & RowVersions)
    lastLocalModified: string | null;     // آخر timestamp في الجدول
    lastSyncedAt: string | null;          // آخر timestamp تم مزامنته بنجاح في الإدارة
    lastCentralModified: string | null;   // آخر timestamp في الإدارة
    lastPushRowVersion?: string | null;   // آخر rowversion تم رفعه للإدارة
    lastPullRowVersion?: string | null;   // آخر rowversion تم سحبه من الإدارة
    currentLocalRowVersion?: string | null;
    currentCentralRowVersion?: string | null;

    // أعداد السطور والتعديلات
    localBranchRows: number;
    pendingPushCount: number;
    centralBranchRows: number | null;
    centralTotalRows: number | null;
    pendingPullCount: number;

    // الحالة التفاعلية
    syncState: 'synced' | 'pending_push' | 'pending_pull' | 'pending_both' | 'empty' | 'unreachable';
    syncStateLabel: string;
}

export interface TablesSyncMatrixResponse {
    centralConnected: boolean;
    centralServer: string;
    centralDatabase: string;
    currentBranchCode: string;
    currentBranchName: string;
    lastSyncTimestamp: string | null;

    // مؤشرات KPI الكلية
    totalPendingPush: number;
    totalPendingPull: number;
    syncedTablesCount: number;
    pendingTablesCount: number;
    totalTablesCount: number;

    tables: TableSyncMatrixItem[];
}

/**
 * جلب إعدادات السيرفر المركزي من قاعدة البيانات المحلية
 */
export async function getCentralConfig(): Promise<CentralSyncConfig> {
    try {
        const pool = await getDbPool();
        const res = await pool.request()
            .input('Key', sql.NVarChar(100), 'central_sync')
            .query('SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = @Key');

        const roleRes = await pool.request()
            .input('RKey', sql.NVarChar(100), 'system_role')
            .query('SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = @RKey');

        const explicitRole = roleRes.recordset[0]?.SettingValue as ('branch' | 'central' | undefined);

        if (res.recordset.length > 0 && res.recordset[0].SettingValue) {
            try {
                const parsed = JSON.parse(res.recordset[0].SettingValue);
                const safePassword = (parsed.centralPassword && parsed.centralPassword.trim() !== '') 
                    ? parsed.centralPassword.trim() 
                    : DEFAULT_CONFIG.centralPassword;
                return { 
                    ...DEFAULT_CONFIG, 
                    ...parsed,
                    centralPassword: safePassword,
                    systemRole: explicitRole || parsed.systemRole || DEFAULT_CONFIG.systemRole
                };
            } catch {
                return { ...DEFAULT_CONFIG, systemRole: explicitRole || DEFAULT_CONFIG.systemRole };
            }
        }
        return { ...DEFAULT_CONFIG, systemRole: explicitRole || DEFAULT_CONFIG.systemRole };
    } catch (e) {
        console.error('Error fetching central sync config:', e);
        return DEFAULT_CONFIG;
    }
}

/**
 * حفظ إعدادات السيرفر المركزي في قاعدة البيانات المحلية
 */
export async function saveCentralConfig(config: Partial<CentralSyncConfig>): Promise<CentralSyncConfig> {
    const pool = await getDbPool();
    const current = await getCentralConfig();
    const cleanPassword = (config.centralPassword !== undefined && config.centralPassword !== null && config.centralPassword.trim() !== '')
        ? config.centralPassword.trim()
        : current.centralPassword;
    const updated: CentralSyncConfig = { 
        ...current, 
        ...config,
        centralPassword: cleanPassword
    };

    await pool.request()
        .input('Key', sql.NVarChar(100), 'central_sync')
        .input('Val', sql.NVarChar(sql.MAX), JSON.stringify(updated))
        .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = @Key)
                INSERT INTO dbo.AppSettings (SettingKey, SettingValue, SyncStatus, LastSyncedAt) VALUES (@Key, @Val, 'synced', SYSUTCDATETIME());
            ELSE
                UPDATE dbo.AppSettings SET SettingValue = @Val, SyncStatus = 'synced', LastSyncedAt = SYSUTCDATETIME() WHERE SettingKey = @Key;
        `);

    return updated;
}

/**
 * إنشاء اتصال منفصل بالسيرفر المركزي للإدارة
 */
export async function connectToCentral(config: CentralSyncConfig, targetDatabase?: string): Promise<sql.ConnectionPool> {
    let cleanServer = (config.centralServerIp || '10.110.16.16').trim();
    let port = Number(config.centralSqlPort) || 1433;

    if (cleanServer.includes(':')) {
        const [hostPart, portPart] = cleanServer.split(':');
        cleanServer = hostPart.trim();
        port = parseInt(portPart, 10) || port;
    }
    cleanServer = cleanServer.replace(/^https?:\/\//i, '').replace(/\/$/, '');

    const centralSqlConfig: sql.config = {
        user: config.centralUsername,
        password: config.centralPassword,
        server: cleanServer,
        port: port,
        database: targetDatabase || config.centralDatabase,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
            connectTimeout: 9000
        },
        pool: {
            max: 5,
            min: 1,
            idleTimeoutMillis: 10000
        }
    };

    const centralPool = new sql.ConnectionPool(centralSqlConfig);
    await centralPool.connect();
    return centralPool;
}

/**
 * اختبار الاتصال بالسيرفر المركزي
 */
export async function testCentralConnection(configOverride?: Partial<CentralSyncConfig>): Promise<{
    success: boolean;
    latencyMs?: number;
    serverVersion?: string;
    database?: string;
    databaseExists?: boolean;
    message?: string;
    error?: string;
}> {
    const current = await getCentralConfig();
    const cleanOverride = { ...(configOverride || {}) };
    
    if (!cleanOverride.centralPassword && current.centralPassword) {
        cleanOverride.centralPassword = current.centralPassword;
    }

    const config: CentralSyncConfig = { ...current, ...cleanOverride };
    const startTime = Date.now();
    let centralPool: sql.ConnectionPool | null = null;

    try {
        centralPool = await connectToCentral(config);
        const res = await centralPool.request().query('SELECT @@VERSION as version, DB_NAME() as dbName;');
        const latencyMs = Date.now() - startTime;

        await centralPool.close();
        return {
            success: true,
            databaseExists: true,
            latencyMs,
            serverVersion: res.recordset[0]?.version?.split('\n')[0] || 'Microsoft SQL Server',
            database: res.recordset[0]?.dbName || config.centralDatabase,
            message: 'تم الاتصال بالسيرفر المركزي وقاعدة البيانات بنجاح تام.'
        };
    } catch (err: any) {
        if (centralPool) {
            try { await centralPool.close(); } catch {}
            centralPool = null;
        }

        const errMsg: string = err.message || '';
        if (errMsg.toLowerCase().includes('cannot open database') || errMsg.includes('4060')) {
            try {
                const masterPool = await connectToCentral(config, 'master');
                const masterRes = await masterPool.request().query('SELECT @@VERSION as version;');
                const latencyMs = Date.now() - startTime;
                await masterPool.close();

                return {
                    success: true,
                    databaseExists: false,
                    latencyMs,
                    serverVersion: masterRes.recordset[0]?.version?.split('\n')[0] || 'Microsoft SQL Server',
                    database: config.centralDatabase,
                    message: `تم الاتصال بالسيرفر (${config.centralServerIp}) بنجاح! لكن قاعدة البيانات (${config.centralDatabase}) غير موجودة بعد.`
                };
            } catch {}
        }

        let userFriendlyError = errMsg;
        if (errMsg.toLowerCase().includes('failed to connect') || errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('etimedout')) {
            userFriendlyError = `تعذر الاتصال بعنوان السيرفر (${config.centralServerIp}:${config.centralSqlPort}). تأكد من أن السيرفر يعمل وتفعيل TCP/IP وجدار الحماية.`;
        } else if (errMsg.toLowerCase().includes('login failed') || errMsg.toLowerCase().includes('elogin')) {
            userFriendlyError = `فشل تسجيل الدخول للمستخدم (${config.centralUsername}). يرجى التحقق من صحة كلمة المرور وتفعيل Mixed Mode في SQL Server.`;
        }

        return {
            success: false,
            error: userFriendlyError
        };
    }
}

/**
 * التأكد من وجود جدول dbo.SyncTrackingMatrix وتحديثه في قاعدة البيانات
 */
async function ensureSyncTrackingMatrixTable(pool: sql.ConnectionPool) {
    await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncTrackingMatrix')
        BEGIN
            CREATE TABLE dbo.SyncTrackingMatrix (
                TableName NVARCHAR(128) NOT NULL,
                TableDisplayName NVARCHAR(255) NOT NULL,
                Category NVARCHAR(100) NOT NULL,
                SyncDirection NVARCHAR(30) NOT NULL DEFAULT ('push'),
                LastLocalTimestamp DATETIME2 NULL,
                LastSyncedTimestamp DATETIME2 NULL,
                LastCentralTimestamp DATETIME2 NULL,
                LocalRowsCount INT NOT NULL DEFAULT 0,
                CentralBranchRowsCount INT NULL DEFAULT 0,
                CentralTotalRowsCount INT NULL DEFAULT 0,
                PendingChangesCount INT NOT NULL DEFAULT 0,
                SyncStatus NVARCHAR(50) NOT NULL DEFAULT ('pending'),
                LastSyncCheckAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
                LastPushRowVersion BIGINT NULL,
                LastPullRowVersion BIGINT NULL,
                CurrentLocalRowVersion BIGINT NULL,
                CurrentCentralRowVersion BIGINT NULL,
                CONSTRAINT PK_SyncTrackingMatrix PRIMARY KEY CLUSTERED (TableName)
            );
        END
        ELSE
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SyncTrackingMatrix' AND COLUMN_NAME = 'LastPushRowVersion')
                ALTER TABLE dbo.SyncTrackingMatrix ADD LastPushRowVersion BIGINT NULL;
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SyncTrackingMatrix' AND COLUMN_NAME = 'LastPullRowVersion')
                ALTER TABLE dbo.SyncTrackingMatrix ADD LastPullRowVersion BIGINT NULL;
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SyncTrackingMatrix' AND COLUMN_NAME = 'CurrentLocalRowVersion')
                ALTER TABLE dbo.SyncTrackingMatrix ADD CurrentLocalRowVersion BIGINT NULL;
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SyncTrackingMatrix' AND COLUMN_NAME = 'CurrentCentralRowVersion')
                ALTER TABLE dbo.SyncTrackingMatrix ADD CurrentCentralRowVersion BIGINT NULL;
        END
    `);
}

/**
 * استخراج مصفوفة المزامنة الدقيقة لجميع الجداول وتحديث جدول dbo.SyncTrackingMatrix في قاعدة البيانات
 */
export async function getTablesSyncMatrix(): Promise<TablesSyncMatrixResponse> {
    const localPool = await getDbPool();
    const config = await getCentralConfig();
    const branchCode = config.currentBranchCode || '900';

    await ensureSyncTrackingMatrixTable(localPool);

    // جلب التوجيهات المخصصة وأرقام الـ RowVersion المخزنة في قاعدة البيانات أولاً
    let dbMatrixMap = new Map<string, any>();
    try {
        const dbMatrixRes = await localPool.request().query(`
            SELECT TableName, SyncDirection, DataDescription, DataScope,
                   LastPushRowVersion, LastPullRowVersion, CurrentLocalRowVersion, CurrentCentralRowVersion,
                   LastSyncedTimestamp, LastLocalTimestamp, LastCentralTimestamp
            FROM dbo.SyncTrackingMatrix
        `);
        dbMatrixMap = new Map<string, any>(dbMatrixRes.recordset.map(r => [r.TableName, r]));
    } catch {}

    // 1. استعلام محلي موحد فائق السرعة عبر الـ RowVersion والـ Timestamps
    const localTableEntries = Object.keys(TABLE_METADATA_MAP);
    const localUnionQueries = localTableEntries.map(table => `
        SELECT 
            '${table}' as tableName,
            COUNT(*) as localRows,
            MAX(CAST(t.[RowVersion] AS BIGINT)) as currentLocalRowVersion,
            SUM(CASE 
                WHEN (m.LastPushRowVersion IS NULL OR CAST(t.[RowVersion] AS BIGINT) > m.LastPushRowVersion)
                     AND (t.BranchCode = '${branchCode}' OR t.BranchCode IS NULL)
                THEN 1 ELSE 0 
            END) as pendingPush,
            MAX(t.UpdatedAt) as lastLocalModified,
            MAX(t.LastSyncedAt) as lastSyncedAt
        FROM dbo.[${table}] t
        LEFT JOIN dbo.SyncTrackingMatrix m ON m.TableName = '${table}'
    `).join(' UNION ALL ');

    const localRes = await localPool.request().query(localUnionQueries);
    const localDataMap = new Map<string, {
        localRows: number;
        currentLocalRowVersion: string | null;
        pendingPush: number;
        lastLocalModified: string | null;
        lastSyncedAt: string | null;
    }>();

    for (const row of localRes.recordset) {
        localDataMap.set(row.tableName, {
            localRows: Number(row.localRows) || 0,
            currentLocalRowVersion: row.currentLocalRowVersion ? String(row.currentLocalRowVersion) : null,
            pendingPush: Number(row.pendingPush) || 0,
            lastLocalModified: row.lastLocalModified ? new Date(row.lastLocalModified).toISOString() : null,
            lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt).toISOString() : null
        });
    }

    // 2. استعلام السيرفر المركزي عبر الـ RowVersion
    let centralConnected = false;
    let centralPool: sql.ConnectionPool | null = null;
    const centralDataMap = new Map<string, {
        centralTotalRows: number;
        centralBranchRows: number;
        currentCentralRowVersion: string | null;
        lastCentralModified: string | null;
    }>();

    try {
        centralPool = await connectToCentral(config);
        await ensureSyncTrackingMatrixTable(centralPool);
        
        const tablesInCentralRes = await centralPool.request().query(`
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'
        `);
        const centralExistingTables = new Set(tablesInCentralRes.recordset.map(r => r.TABLE_NAME));

        const centralValidTables = localTableEntries.filter(t => centralExistingTables.has(t));
        if (centralValidTables.length > 0) {
            const centralUnionQueries = centralValidTables.map(table => `
                SELECT 
                    '${table}' as tableName,
                    COUNT(*) as centralTotalRows,
                    SUM(CASE WHEN BranchCode = '${branchCode}' THEN 1 ELSE 0 END) as centralBranchRows,
                    MAX(CAST([RowVersion] AS BIGINT)) as currentCentralRowVersion,
                    MAX(UpdatedAt) as lastCentralModified
                FROM dbo.[${table}]
            `).join(' UNION ALL ');

            const centralRes = await centralPool.request().query(centralUnionQueries);
            for (const row of centralRes.recordset) {
                centralDataMap.set(row.tableName, {
                    centralTotalRows: Number(row.centralTotalRows) || 0,
                    centralBranchRows: Number(row.centralBranchRows) || 0,
                    currentCentralRowVersion: row.currentCentralRowVersion ? String(row.currentCentralRowVersion) : null,
                    lastCentralModified: row.lastCentralModified ? new Date(row.lastCentralModified).toISOString() : null
                });
            }
        }

        centralConnected = true;
        await centralPool.close();
    } catch {
        if (centralPool) {
            try { await centralPool.close(); } catch {}
        }
        centralConnected = false;
    }

    // 3. تركيب المصفوفة وتحديث جدول dbo.SyncTrackingMatrix في SQL
    let totalPendingPush = 0;
    let totalPendingPull = 0;
    let syncedTablesCount = 0;
    let pendingTablesCount = 0;

    const tables: TableSyncMatrixItem[] = localTableEntries.map(tableName => {
        const meta = TABLE_METADATA_MAP[tableName];
        const local = localDataMap.get(tableName) || {
            localRows: 0,
            currentLocalRowVersion: null,
            pendingPush: 0,
            lastLocalModified: null,
            lastSyncedAt: null
        };
        const central = centralDataMap.get(tableName) || null;
        const dbRow = dbMatrixMap.get(tableName);
        const effectiveDirection: SyncDirection = (dbRow?.SyncDirection || meta.direction) as SyncDirection;
        const effectiveDescription: string = dbRow?.DataDescription || meta.description || '';
        const effectiveScope: string = dbRow?.DataScope || meta.dataScope || '';

        let effectivePendingPush = 0;
        if (effectiveDirection === 'push' || effectiveDirection === 'bidirectional') {
            effectivePendingPush = local.pendingPush;
        }

        let effectivePendingPull = 0;
        if (effectiveDirection === 'pull' || effectiveDirection === 'bidirectional') {
            if (central && central.currentCentralRowVersion) {
                const lastPullRv = dbRow?.LastPullRowVersion ? String(dbRow.LastPullRowVersion) : null;
                const centralRv = central.currentCentralRowVersion;
                const otherBranchRows = Math.max(0, central.centralTotalRows - central.centralBranchRows);

                if (otherBranchRows > 0) {
                    if (!lastPullRv) {
                        effectivePendingPull = otherBranchRows;
                    } else if (BigInt(centralRv) > BigInt(lastPullRv)) {
                        effectivePendingPull = otherBranchRows;
                    }
                }
            }
        }

        totalPendingPush += effectivePendingPush;
        totalPendingPull += effectivePendingPull;

        let syncState: TableSyncMatrixItem['syncState'] = 'synced';
        let syncStateLabel = 'متطابق ومتزامن ✅';

        if (effectiveDirection === 'disabled') {
            syncState = 'empty';
            syncStateLabel = 'المزامنة متوقفة لهذا الجدول ⏸️';
            syncedTablesCount++;
        } else if (!centralConnected) {
            syncState = 'unreachable';
            syncStateLabel = 'السيرفر غير متصل ⚠️';
        } else if (local.localRows === 0 && (!central || central.centralTotalRows === 0)) {
            syncState = 'empty';
            syncStateLabel = 'لا توجد بيانات ⚪';
            syncedTablesCount++;
        } else if (effectivePendingPush > 0 && effectivePendingPull > 0) {
            syncState = 'pending_both';
            syncStateLabel = 'تعديلات وسحب معلق 🔁';
            pendingTablesCount++;
        } else if (effectivePendingPush > 0) {
            syncState = 'pending_push';
            syncStateLabel = `بانتظار الرفع (${effectivePendingPush}) ⬆️`;
            pendingTablesCount++;
        } else if (effectivePendingPull > 0) {
            syncState = 'pending_pull';
            syncStateLabel = `تحديثات جاهزة للسحب (${effectivePendingPull}) ⬇️`;
            pendingTablesCount++;
        } else {
            syncState = 'synced';
            syncStateLabel = 'متطابق ومحدث ✅';
            syncedTablesCount++;
        }

        return {
            tableName,
            displayName: meta.name,
            category: meta.category,
            direction: effectiveDirection,
            description: effectiveDescription,
            dataScope: effectiveScope,
            lastLocalModified: local.lastLocalModified,
            lastSyncedAt: local.lastSyncedAt || (dbRow?.LastSyncedTimestamp ? new Date(dbRow.LastSyncedTimestamp).toISOString() : null),
            lastCentralModified: central?.lastCentralModified || null,
            lastPushRowVersion: dbRow?.LastPushRowVersion ? String(dbRow.LastPushRowVersion) : null,
            lastPullRowVersion: dbRow?.LastPullRowVersion ? String(dbRow.LastPullRowVersion) : null,
            currentLocalRowVersion: local.currentLocalRowVersion,
            currentCentralRowVersion: central?.currentCentralRowVersion || null,
            localBranchRows: local.localRows,
            pendingPushCount: effectivePendingPush,
            centralBranchRows: central ? central.centralBranchRows : null,
            centralTotalRows: central ? central.centralTotalRows : null,
            pendingPullCount: effectivePendingPull,
            syncState,
            syncStateLabel
        };
    });

    // حفظ وتحديث بيانات كل جدول في dbo.SyncTrackingMatrix في قاعدة البيانات مع الحفاظ على التوجيه المخصص
    try {
        for (const t of tables) {
            const maxLocal = t.lastLocalModified ? `'${t.lastLocalModified}'` : 'NULL';
            const maxSynced = t.lastSyncedAt ? `'${t.lastSyncedAt}'` : 'NULL';
            const maxCentral = t.lastCentralModified ? `'${t.lastCentralModified}'` : 'NULL';
            const curLocalRv = t.currentLocalRowVersion ? `'${t.currentLocalRowVersion}'` : 'NULL';
            const curCentralRv = t.currentCentralRowVersion ? `'${t.currentCentralRowVersion}'` : 'NULL';
            const cBranch = t.centralBranchRows !== null ? t.centralBranchRows : 'NULL';
            const cTotal = t.centralTotalRows !== null ? t.centralTotalRows : 'NULL';
            const desc = (t.description || '').replace(/'/g, "''");
            const scope = (t.dataScope || '').replace(/'/g, "''");

            await localPool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM dbo.SyncTrackingMatrix WHERE TableName = '${t.tableName}')
                BEGIN
                    INSERT INTO dbo.SyncTrackingMatrix (
                        TableName, TableDisplayName, Category, SyncDirection, DataDescription, DataScope,
                        LastLocalTimestamp, LastSyncedTimestamp, LastCentralTimestamp,
                        CurrentLocalRowVersion, CurrentCentralRowVersion,
                        LocalRowsCount, CentralBranchRowsCount, CentralTotalRowsCount,
                        PendingChangesCount, SyncStatus, LastSyncCheckAt, UpdatedAt
                    ) VALUES (
                        '${t.tableName}', N'${t.displayName}', N'${t.category}', '${t.direction}', N'${desc}', N'${scope}',
                        ${maxLocal}, ${maxSynced}, ${maxCentral},
                        ${curLocalRv}, ${curCentralRv},
                        ${t.localBranchRows}, ${cBranch}, ${cTotal},
                        ${t.pendingPushCount}, '${t.syncState}', SYSUTCDATETIME(), SYSUTCDATETIME()
                    );
                END
                ELSE
                BEGIN
                    UPDATE dbo.SyncTrackingMatrix
                    SET TableDisplayName = N'${t.displayName}',
                        Category = N'${t.category}',
                        DataDescription = COALESCE(NULLIF(DataDescription, ''), N'${desc}'),
                        DataScope = COALESCE(NULLIF(DataScope, ''), N'${scope}'),
                        LastLocalTimestamp = ${maxLocal},
                        LastSyncedTimestamp = ${maxSynced},
                        LastCentralTimestamp = ${maxCentral},
                        CurrentLocalRowVersion = ${curLocalRv},
                        CurrentCentralRowVersion = ${curCentralRv},
                        LocalRowsCount = ${t.localBranchRows},
                        CentralBranchRowsCount = ${cBranch},
                        CentralTotalRowsCount = ${cTotal},
                        PendingChangesCount = ${t.pendingPushCount + t.pendingPullCount},
                        SyncStatus = '${t.syncState}',
                        LastSyncCheckAt = SYSUTCDATETIME()
                    WHERE TableName = '${t.tableName}';
                END
            `);
        }
    } catch (e: any) {
        console.warn('SyncTrackingMatrix update warning:', e.message);
    }

    return {
        centralConnected,
        centralServer: `${config.centralServerIp}:${config.centralSqlPort}`,
        centralDatabase: config.centralDatabase,
        currentBranchCode: branchCode,
        currentBranchName: config.currentBranchName || 'الفرع الرأيسي',
        lastSyncTimestamp: config.lastSyncTime || null,
        totalPendingPush,
        totalPendingPull,
        syncedTablesCount,
        pendingTablesCount,
        totalTablesCount: tables.length,
        tables
    };
}

/**
 * تشغيل دورة المزامنة الذكية ثنائية الاتجاه:
 * "إذا كان السطر موجوداً قم بتحديثه، وإذا لم يكن موجوداً قم بإضافته" (Upsert)
 */
export async function runFullSync(options?: {
    mode?: 'all' | 'push' | 'pull';
    targetTable?: string;
    forceFull?: boolean;
}): Promise<{
    success: boolean;
    pushedCount: number;
    pulledCount: number;
    error?: string;
    details?: string;
}> {
    const localPool = await getDbPool();
    const config = await getCentralConfig();
    const mode = options?.mode || 'all';

    let centralPool: sql.ConnectionPool | null = null;
    let totalPushed = 0;
    let totalPulled = 0;

    try {
        await saveCentralConfig({ lastSyncStatus: 'in_progress' });
        centralPool = await connectToCentral(config);

        await ensureSyncTrackingMatrixTable(localPool);
        await ensureSyncTrackingMatrixTable(centralPool);

        // وضع CONTEXT_INFO لمنع مشغلات التعديل من إعادة تعليم السجلات كـ pending أثناء دورة المزامنة
        await localPool.request().query("SET CONTEXT_INFO 0x53594E43;");
        await centralPool.request().query("SET CONTEXT_INFO 0x53594E43;");

        const tableEntries = Object.entries(TABLE_METADATA_MAP).filter(([tableName]) => {
            if (options?.targetTable) return tableName === options.targetTable;
            return true;
        });

        // جلب اتجاهات المزامنة وأرقام الـ RowVersion المخزنة في قاعدة البيانات
        let dbMatrixMap = new Map<string, any>();
        let dbDirectionsMap = new Map<string, SyncDirection>();
        try {
            const dbDirsRes = await localPool.request().query(`
                SELECT TableName, SyncDirection, LastPushRowVersion, LastPullRowVersion, CurrentLocalRowVersion, CurrentCentralRowVersion, LastSyncedTimestamp 
                FROM dbo.SyncTrackingMatrix
            `);
            dbMatrixMap = new Map<string, any>(dbDirsRes.recordset.map(r => [r.TableName, r]));
            dbDirectionsMap = new Map<string, SyncDirection>(dbDirsRes.recordset.map(r => [r.TableName, r.SyncDirection]));
        } catch {}

        const getTableDirection = (tName: string, defDir: SyncDirection): SyncDirection => {
            return (dbDirectionsMap.get(tName) || defDir) as SyncDirection;
        };

        if (options?.targetTable) {
            const targetDir = getTableDirection(options.targetTable, TABLE_METADATA_MAP[options.targetTable]?.direction || 'push');
            if (targetDir === 'disabled') {
                await centralPool.close();
                return {
                    success: false,
                    pushedCount: 0,
                    pulledCount: 0,
                    error: `لا يمكن إعادة مزامنة جدول "${TABLE_METADATA_MAP[options.targetTable]?.name || options.targetTable}" لأن اتجاه المزامنة محدد كـ "معطل" (Disabled) في إعدادات النظام. قم بتغيير اتجاه المزامنة أولاً.`
                };
            }
        }

        const effectiveMode = options?.targetTable 
            ? (getTableDirection(options.targetTable, TABLE_METADATA_MAP[options.targetTable]?.direction || 'push') === 'push' ? 'push' 
               : getTableDirection(options.targetTable, TABLE_METADATA_MAP[options.targetTable]?.direction || 'push') === 'pull' ? 'pull' 
               : 'all')
            : mode;

        // -------------------------------------------------------------
        // المرحلة 1: رفع التعديلات والحركات من الفرع للإدارة عبر RowVersion (Push: Upsert)
        // -------------------------------------------------------------
        if (effectiveMode === 'all' || effectiveMode === 'push') {
            const pushTables = tableEntries.filter(([tName, meta]) => {
                const dir = getTableDirection(tName, meta.direction);
                return dir === 'push' || dir === 'bidirectional';
            });

            for (const [tableName, meta] of pushTables) {
                try {
                    const idCol = meta.idColumn;
                    const dbRow = dbMatrixMap.get(tableName);
                    const lastPushRv = dbRow?.LastPushRowVersion ? String(dbRow.LastPushRowVersion) : null;
                    const isForced = !!options?.forceFull;

                    // إذا كان فرض إعادة مزامنة شاملة، نجلب كافة سجلات هذا الجدول بالفرع للتأكد من نقلها
                    const pushQuery = isForced
                        ? `SELECT *, CAST([RowVersion] AS BIGINT) as _RowVersionBigInt 
                           FROM dbo.[${tableName}]
                           WHERE (BranchCode = @BranchCode OR BranchCode IS NULL)
                           ORDER BY [RowVersion] ASC`
                        : `SELECT TOP 300 *, CAST([RowVersion] AS BIGINT) as _RowVersionBigInt 
                           FROM dbo.[${tableName}]
                           WHERE (
                               ${lastPushRv ? `CAST([RowVersion] AS BIGINT) > ${lastPushRv}` : '1=1'}
                               OR SyncStatus = 'pending'
                           )
                           AND (BranchCode = @BranchCode OR BranchCode IS NULL)
                           ORDER BY [RowVersion] ASC`;

                    const pendingRes = await localPool.request()
                        .input('BranchCode', sql.NVarChar(50), config.currentBranchCode)
                        .query(pushQuery);

                    const rows = pendingRes.recordset;
                    if (rows.length > 0) {
                        // محاذاة الأعمدة بالسيرفر المركزي
                        const centralColsRes = await centralPool.request()
                            .input('Tbl', sql.NVarChar(128), tableName)
                            .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @Tbl`);
                        const centralColSet = new Set(centralColsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

                        for (const col of Object.keys(rows[0])) {
                            if (col === '_RowVersionBigInt') continue;
                            if (!centralColSet.has(col.toLowerCase())) {
                                try {
                                    await centralPool.request().query(`ALTER TABLE dbo.[${tableName}] ADD [${col}] NVARCHAR(MAX) NULL;`);
                                    centralColSet.add(col.toLowerCase());
                                } catch {}
                            }
                        }

                        let maxPushedRv = lastPushRv ? BigInt(lastPushRv) : BigInt(0);
                        const isChildTableFk = CHILD_TABLE_FK_MAP[tableName];

                        for (const row of rows) {
                            const idVal = row[idCol];
                            if (idVal === undefined || idVal === null) continue;

                            if (row._RowVersionBigInt) {
                                const rRv = BigInt(row._RowVersionBigInt);
                                if (rRv > maxPushedRv) maxPushedRv = rRv;
                            }

                            // تصفية الأعمدة واستبعاد RowVersion نهائياً منعاً للخطأ 273 في SQL Server
                            const colNames = Object.keys(row).filter(c => 
                                (isChildTableFk ? c !== 'Id' : true) &&
                                c !== 'SyncStatus' && c !== 'LastSyncedAt' && c !== 'BranchCode' && c !== 'BranchName' &&
                                c.toLowerCase() !== 'rowversion' && c.toLowerCase() !== 'syncrowversion' && c !== '_RowVersionBigInt' &&
                                centralColSet.has(c.toLowerCase())
                            );

                            const insertCols = [...colNames, 'BranchCode', 'BranchName', 'SyncStatus', 'LastSyncedAt'].map(c => `[${c}]`).join(', ');
                            const paramCols = [...colNames.map(c => `@${c}`), `'${config.currentBranchCode}'`, `N'${config.currentBranchName}'`, `'synced'`, 'SYSUTCDATETIME()'].join(', ');

                            const centralReq = centralPool.request();
                            for (const col of colNames) {
                                let val = row[col] === undefined ? null : row[col];
                                if (tableName === 'Expenses' && col === 'ExpenseType' && !val) {
                                    val = 'عام';
                                }
                                if ((tableName === 'PurchaseReturns' || tableName === 'PurchaseInvoices') && col === 'SupplierName' && !val) {
                                    val = 'مورد عام';
                                }
                                centralReq.input(col, val);
                            }

                            if (isChildTableFk) {
                                const fk = isChildTableFk;
                                const updateSet = colNames.filter(c => c !== fk && c !== 'ItemId').map(c => `[${c}] = @${c}`).join(', ');
                                await centralReq.query(`
                                    IF EXISTS (
                                        SELECT 1 FROM dbo.[${tableName}] 
                                        WHERE [${fk}] = @${fk} 
                                          AND [ItemId] = @ItemId 
                                          AND ([BranchCode] = '${config.currentBranchCode}' OR [BranchCode] IS NULL)
                                    )
                                    BEGIN
                                        UPDATE dbo.[${tableName}]
                                        SET ${updateSet}, 
                                            [BranchCode] = '${config.currentBranchCode}', 
                                            [BranchName] = N'${config.currentBranchName}', 
                                            [SyncStatus] = 'synced', 
                                            [LastSyncedAt] = SYSUTCDATETIME()
                                        WHERE [${fk}] = @${fk} 
                                          AND [ItemId] = @ItemId 
                                          AND ([BranchCode] = '${config.currentBranchCode}' OR [BranchCode] IS NULL);
                                    END
                                    ELSE
                                    BEGIN
                                        INSERT INTO dbo.[${tableName}] (${insertCols}) 
                                        VALUES (${paramCols});
                                    END
                                `);
                            } else {
                                const isUsersTable = tableName === 'Users';
                                const checkCondition = isUsersTable 
                                    ? `([Id] = @Id OR [LoginName] = @LoginName)`
                                    : `[${idCol}] = @${idCol}`;

                                const updateSet = colNames.filter(c => c !== idCol).map(c => `[${c}] = @${c}`).join(', ');
                                await centralReq.query(`
                                    IF EXISTS (SELECT 1 FROM dbo.[${tableName}] WHERE ${checkCondition})
                                    BEGIN
                                        UPDATE dbo.[${tableName}]
                                        SET ${updateSet}, 
                                            [BranchCode] = '${config.currentBranchCode}', 
                                            [BranchName] = N'${config.currentBranchName}', 
                                            [SyncStatus] = 'synced', 
                                            [LastSyncedAt] = SYSUTCDATETIME()
                                        WHERE ${checkCondition};
                                    END
                                    ELSE
                                    BEGIN
                                        INSERT INTO dbo.[${tableName}] (${insertCols}) 
                                        VALUES (${paramCols});
                                    END
                                `);
                            }

                            // مزامنة البنود التابعة (Child line items) مع استبعاد RowVersion
                            if (meta.childTable && meta.foreignKey) {
                                try {
                                    const childRowsRes = await localPool.request()
                                        .input('ParentId', sql.NVarChar(128), idVal)
                                        .query(`SELECT * FROM dbo.[${meta.childTable}] WHERE [${meta.foreignKey}] = @ParentId`);

                                    if (childRowsRes.recordset.length > 0) {
                                        const cColsRes = await centralPool.request()
                                            .input('Tbl', sql.NVarChar(128), meta.childTable)
                                            .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @Tbl`);
                                        const cCentralCols = new Set(cColsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

                                        await centralPool.request()
                                            .input('ParentId', sql.NVarChar(128), idVal)
                                            .input('BranchCode', sql.NVarChar(50), config.currentBranchCode)
                                            .query(`DELETE FROM dbo.[${meta.childTable}] WHERE [${meta.foreignKey}] = @ParentId AND (BranchCode = @BranchCode OR BranchCode IS NULL)`);

                                        for (const cRow of childRowsRes.recordset) {
                                            const cCols = Object.keys(cRow).filter(k => 
                                                k !== 'Id' && 
                                                k !== 'SyncStatus' && 
                                                k !== 'LastSyncedAt' && 
                                                k !== 'BranchCode' && 
                                                k !== 'BranchName' &&
                                                k.toLowerCase() !== 'rowversion' && 
                                                k.toLowerCase() !== 'syncrowversion' && 
                                                k !== '_RowVersionBigInt' &&
                                                cCentralCols.has(k.toLowerCase())
                                            );
                                            const cInsert = [...cCols, 'BranchCode', 'BranchName', 'SyncStatus', 'LastSyncedAt'].map(c => `[${c}]`).join(', ');
                                            const cParams = [...cCols.map(k => `@${k}`), `'${config.currentBranchCode}'`, `N'${config.currentBranchName}'`, `'synced'`, 'SYSUTCDATETIME()'].join(', ');

                                            const cReq = centralPool.request();
                                            for (const k of cCols) {
                                                cReq.input(k, cRow[k] === undefined ? null : cRow[k]);
                                            }
                                            await cReq.query(`
                                                INSERT INTO dbo.[${meta.childTable}] (${cInsert})
                                                VALUES (${cParams});
                                            `);
                                        }

                                        await localPool.request()
                                            .input('ParentId', sql.NVarChar(128), idVal)
                                            .query(`
                                                UPDATE dbo.[${meta.childTable}]
                                                SET SyncStatus = 'synced', LastSyncedAt = SYSUTCDATETIME()
                                                WHERE [${meta.foreignKey}] = @ParentId;
                                            `);
                                    }
                                } catch (cErr: any) {
                                    console.warn(`Child sync error on ${meta.childTable}:`, cErr.message);
                                }
                            }

                            // تعليم السجل المحلي بأنه متزامن
                            await localPool.request()
                                .input('IdVal', isChildTableFk ? sql.Int : sql.NVarChar(128), idVal)
                                .query(`
                                    UPDATE dbo.[${tableName}] 
                                    SET SyncStatus = 'synced', LastSyncedAt = SYSUTCDATETIME() 
                                    WHERE [${idCol}] = @IdVal;
                                `);

                            totalPushed++;
                        }

                        // تحديث علامة LastPushRowVersion في جدول المزامنة استناداً إلى أقصى RowVersion محلي حالي
                        const maxLocalRes = await localPool.request().query(`
                            SELECT MAX(CAST([RowVersion] AS BIGINT)) as maxRv, MAX(UpdatedAt) as maxU, COUNT(*) as c 
                            FROM dbo.[${tableName}]
                        `);
                        const maxRv = maxLocalRes.recordset[0]?.maxRv || maxPushedRv.toString();
                        const maxU = maxLocalRes.recordset[0]?.maxU ? `'${new Date(maxLocalRes.recordset[0].maxU).toISOString()}'` : 'NULL';
                        const totalRows = maxLocalRes.recordset[0]?.c || 0;

                        await localPool.request().query(`
                            UPDATE dbo.SyncTrackingMatrix
                            SET LastPushRowVersion = ${maxRv},
                                CurrentLocalRowVersion = ${maxRv},
                                LastLocalTimestamp = ${maxU},
                                LastSyncedTimestamp = SYSUTCDATETIME(),
                                LocalRowsCount = ${totalRows},
                                PendingChangesCount = 0,
                                SyncStatus = 'synced',
                                LastSyncCheckAt = SYSUTCDATETIME()
                            WHERE TableName = '${tableName}';
                        `);

                        if (meta.childTable) {
                            const cMaxRes = await localPool.request().query(`SELECT MAX(UpdatedAt) as maxU, COUNT(*) as c FROM dbo.[${meta.childTable}]`);
                            const cMaxU = cMaxRes.recordset[0]?.maxU ? `'${new Date(cMaxRes.recordset[0].maxU).toISOString()}'` : 'NULL';
                            const cTotalRows = cMaxRes.recordset[0]?.c || 0;
                            await localPool.request().query(`
                                UPDATE dbo.SyncTrackingMatrix
                                SET LastLocalTimestamp = ${cMaxU},
                                    LastSyncedTimestamp = SYSUTCDATETIME(),
                                    LocalRowsCount = ${cTotalRows},
                                    PendingChangesCount = 0,
                                    SyncStatus = 'synced',
                                    LastSyncCheckAt = SYSUTCDATETIME()
                                WHERE TableName = '${meta.childTable}';
                            `);
                        }
                    } else {
                        // في حال عدم وجود حركات جديدة للرفع أو تمت مزامنتها مسبقاً، نحدّث رقم الـ RowVersion ليطابق أقصى قيمة محلية
                        const curMaxRvRes = await localPool.request().query(`SELECT MAX(CAST([RowVersion] AS BIGINT)) as maxRv, COUNT(*) as c FROM dbo.[${tableName}]`);
                        const maxRv = curMaxRvRes.recordset[0]?.maxRv || 0;
                        const totalRows = curMaxRvRes.recordset[0]?.c || 0;
                        await localPool.request().query(`
                            UPDATE dbo.SyncTrackingMatrix
                            SET LastPushRowVersion = ${maxRv},
                                CurrentLocalRowVersion = ${maxRv},
                                LocalRowsCount = ${totalRows},
                                PendingChangesCount = 0,
                                SyncStatus = 'synced',
                                LastSyncCheckAt = SYSUTCDATETIME()
                            WHERE TableName = '${tableName}';
                        `);
                    }
                } catch (pushErr: any) {
                    console.warn(`Sync push error on table ${tableName}:`, pushErr.message);
                }
            }
        }

        // -------------------------------------------------------------
        // المرحلة 2: سحب التحديثات المركزية من الإدارة للفرع عبر RowVersion (Pull: Upsert)
        // -------------------------------------------------------------
        if (effectiveMode === 'all' || effectiveMode === 'pull') {
            const pullTables = tableEntries.filter(([tName, meta]) => {
                const dir = getTableDirection(tName, meta.direction);
                return dir === 'pull' || dir === 'bidirectional';
            });

            for (const [tableName, meta] of pullTables) {
                try {
                    const idCol = meta.idColumn;
                    const dbRow = dbMatrixMap.get(tableName);
                    const lastPullRv = dbRow?.LastPullRowVersion ? String(dbRow.LastPullRowVersion) : null;

                    const isForced = !!options?.forceFull;

                    // سحب الحركات من الإدارة (إذا كان فرض مزامنة كاملة نسحب كافة سجلات السيرفر المركزي)
                    const centralReq = centralPool.request()
                        .input('CurrentBranchCode', sql.NVarChar(50), config.currentBranchCode);
                    
                    const pullQuery = isForced
                        ? `SELECT *, CAST([RowVersion] AS BIGINT) as _RowVersionBigInt 
                           FROM dbo.[${tableName}]
                           WHERE (BranchCode <> @CurrentBranchCode OR BranchCode IS NULL)
                           ORDER BY [RowVersion] ASC`
                        : `SELECT TOP 300 *, CAST([RowVersion] AS BIGINT) as _RowVersionBigInt 
                           FROM dbo.[${tableName}]
                           WHERE (${lastPullRv ? `CAST([RowVersion] AS BIGINT) > ${lastPullRv}` : '1=1'})
                             AND (BranchCode <> @CurrentBranchCode OR BranchCode IS NULL)
                           ORDER BY [RowVersion] ASC`;

                    const centralRes = await centralReq.query(pullQuery);
                    const centralRows = centralRes.recordset;

                    if (centralRows.length > 0) {
                        // جلب أسماء الأعمدة المحلية المتاحة
                        const localColsRes = await localPool.request()
                            .input('Tbl', sql.NVarChar(128), tableName)
                            .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @Tbl`);
                        const localColSet = new Set(localColsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

                        let maxPulledRv = lastPullRv ? BigInt(lastPullRv) : BigInt(0);
                        const isChildTableFk = CHILD_TABLE_FK_MAP[tableName];

                        for (const row of centralRows) {
                            const idVal = row[idCol];
                            if (!idVal) continue;

                            if (row._RowVersionBigInt) {
                                const rRv = BigInt(row._RowVersionBigInt);
                                if (rRv > maxPulledRv) maxPulledRv = rRv;
                            }

                            // تصفية الأعمدة واستبعاد RowVersion نهائياً منعاً للخطأ 273
                            const colNames = Object.keys(row).filter(c => 
                                (isChildTableFk ? c !== 'Id' : true) &&
                                c !== 'SyncStatus' && c !== 'LastSyncedAt' &&
                                c.toLowerCase() !== 'rowversion' && c.toLowerCase() !== 'syncrowversion' && c !== '_RowVersionBigInt' &&
                                localColSet.has(c.toLowerCase())
                            );

                            const insertCols = colNames.map(c => `[${c}]`).join(', ');
                            const paramCols = colNames.map(c => `@${c}`).join(', ');
                            const updateSet = colNames.filter(c => c !== idCol).map(c => `[${c}] = @${c}`).join(', ');

                            const localReq = localPool.request();
                            for (const c of colNames) {
                                localReq.input(c, row[c] === undefined ? null : row[c]);
                            }

                            // إذا كان موجوداً قم بتحديثه، وإذا لم يكن موجوداً قم بإضافته
                            await localReq.query(`
                                IF EXISTS (SELECT 1 FROM dbo.[${tableName}] WHERE [${idCol}] = @${idCol})
                                BEGIN
                                    UPDATE dbo.[${tableName}]
                                    SET ${updateSet}, SyncStatus = 'synced', LastSyncedAt = SYSUTCDATETIME()
                                    WHERE [${idCol}] = @${idCol};
                                END
                                ELSE
                                BEGIN
                                    INSERT INTO dbo.[${tableName}] (${insertCols}, SyncStatus, LastSyncedAt)
                                    VALUES (${paramCols}, 'synced', SYSUTCDATETIME());
                                END
                            `);

                            // سحب البنود التابعة (Child line items)
                            if (meta.childTable && meta.foreignKey) {
                                try {
                                    const cRowsRes = await centralPool.request()
                                        .input('ParentId', sql.NVarChar(128), idVal)
                                        .query(`SELECT * FROM dbo.[${meta.childTable}] WHERE [${meta.foreignKey}] = @ParentId`);

                                    if (cRowsRes.recordset.length > 0) {
                                        const lColsRes = await localPool.request()
                                            .input('Tbl', sql.NVarChar(128), meta.childTable)
                                            .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @Tbl`);
                                        const lCols = new Set(lColsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

                                        await localPool.request()
                                            .input('ParentId', sql.NVarChar(128), idVal)
                                            .query(`DELETE FROM dbo.[${meta.childTable}] WHERE [${meta.foreignKey}] = @ParentId`);

                                        for (const cRow of cRowsRes.recordset) {
                                            const cCols = Object.keys(cRow).filter(k => 
                                                k !== 'Id' && k !== 'SyncStatus' && k !== 'LastSyncedAt' &&
                                                k.toLowerCase() !== 'rowversion' && k.toLowerCase() !== 'syncrowversion' && k !== '_RowVersionBigInt' &&
                                                lCols.has(k.toLowerCase())
                                            );
                                            const cInsert = [...cCols, 'SyncStatus', 'LastSyncedAt'].map(c => `[${c}]`).join(', ');
                                            const cParams = [...cCols.map(k => `@${k}`), `'synced'`, 'SYSUTCDATETIME()'].join(', ');

                                            const cReq = localPool.request();
                                            for (const k of cCols) {
                                                cReq.input(k, cRow[k] === undefined ? null : cRow[k]);
                                            }
                                            await cReq.query(`
                                                INSERT INTO dbo.[${meta.childTable}] (${cInsert})
                                                VALUES (${cParams});
                                            `);
                                        }
                                    }
                                } catch (pullChildErr: any) {
                                    console.warn(`Pull child sync error on ${meta.childTable}:`, pullChildErr.message);
                                }
                            }

                            totalPulled++;
                        }

                        // تحديث علامة LastPullRowVersion في جدول التتبع
                        await localPool.request().query(`
                            UPDATE dbo.SyncTrackingMatrix
                            SET LastPullRowVersion = ${maxPulledRv.toString()},
                                CurrentCentralRowVersion = ${maxPulledRv.toString()},
                                LastSyncedTimestamp = SYSUTCDATETIME(),
                                LastSyncCheckAt = SYSUTCDATETIME()
                            WHERE TableName = '${tableName}';
                        `);
                    } else {
                        // في حال عدم وجود حركات جديدة للسحب من الإدارة، نحدّث رقم الـ LastPullRowVersion ليطابق أقصى قيمة مركزية
                        const curMaxCentralRvRes = await centralPool.request().query(`SELECT MAX(CAST([RowVersion] AS BIGINT)) as maxRv FROM dbo.[${tableName}]`);
                        const maxRv = curMaxCentralRvRes.recordset[0]?.maxRv || 0;
                        await localPool.request().query(`
                            UPDATE dbo.SyncTrackingMatrix
                            SET LastPullRowVersion = ${maxRv},
                                CurrentCentralRowVersion = ${maxRv},
                                LastSyncedTimestamp = SYSUTCDATETIME(),
                                LastSyncCheckAt = SYSUTCDATETIME()
                            WHERE TableName = '${tableName}';
                        `);
                    }
                } catch (pullErr: any) {
                    console.warn(`Sync pull error on table ${tableName}:`, pullErr.message);
                }
            }
        }

        const now = new Date().toISOString();
        await saveCentralConfig({
            lastSyncTime: now,
            lastSyncStatus: 'success',
            lastSyncError: null,
            lastPushedCount: totalPushed,
            lastPulledCount: totalPulled
        });

        await centralPool.close();
        const detailsMsg = options?.forceFull && options?.targetTable
            ? `تمت إعادة فحص ومزامنة كامل بيانات جدول "${TABLE_METADATA_MAP[options.targetTable]?.name || options.targetTable}" بنجاح: تم فحص وإرسال ${totalPushed} سجل للإدارة، وسحب ${totalPulled} سجل للفرع وفق اتجاه المزامنة المعتمد.`
            : `تمت المزامنة بنجاح: تم رفع وتحديث ${totalPushed} حركة من الفرع، وسحب ${totalPulled} تحديث من الإدارة.`;

        return {
            success: true,
            pushedCount: totalPushed,
            pulledCount: totalPulled,
            details: detailsMsg
        };

    } catch (err: any) {
        if (centralPool) {
            try { await centralPool.close(); } catch {}
        }

        await saveCentralConfig({
            lastSyncStatus: 'failed',
            lastSyncError: err.message
        });

        return {
            success: false,
            pushedCount: totalPushed,
            pulledCount: totalPulled,
            error: err.message || 'حدث خطأ أثناء إجراء المزامنة مع السيرفر المركزي.'
        };
    }
}

/**
 * دالة مساعدة متوافقة مع الواجهات السابقة
 */
export async function getTablesRowCountsComparison() {
    return await getTablesSyncMatrix();
}

/**
 * تحديث اتجاه مزامنة جدول محدد في قاعدة البيانات
 */
export async function updateTableSyncDirection(tableName: string, direction: SyncDirection) {
    const pool = await getDbPool();
    await pool.request()
        .input('TableName', sql.NVarChar(128), tableName)
        .input('Direction', sql.NVarChar(50), direction)
        .query(`
            UPDATE dbo.SyncTrackingMatrix 
            SET SyncDirection = @Direction, UpdatedAt = SYSUTCDATETIME()
            WHERE TableName = @TableName;
        `);
    return { success: true, tableName, direction };
}

/**
 * تحديث جماعي لاتجاهات المزامنة لقائمة جداول
 */
export async function updateTableSyncDirectionsBulk(updates: { tableName: string; direction: SyncDirection }[]) {
    const pool = await getDbPool();
    for (const item of updates) {
        await pool.request()
            .input('TableName', sql.NVarChar(128), item.tableName)
            .input('Direction', sql.NVarChar(50), item.direction)
            .query(`
                UPDATE dbo.SyncTrackingMatrix 
                SET SyncDirection = @Direction, UpdatedAt = SYSUTCDATETIME()
                WHERE TableName = @TableName;
            `);
    }
    return { success: true, updatedCount: updates.length };
}

/**
 * استعادة التوزيع القياسي الموصى به لجميع الجداول الـ 69
 */
export async function resetTableSyncDirections() {
    const pool = await getDbPool();
    for (const [tableName, meta] of Object.entries(TABLE_METADATA_MAP)) {
        await pool.request()
            .input('TableName', sql.NVarChar(128), tableName)
            .input('Direction', sql.NVarChar(50), meta.direction)
            .query(`
                UPDATE dbo.SyncTrackingMatrix 
                SET SyncDirection = @Direction, UpdatedAt = SYSUTCDATETIME()
                WHERE TableName = @TableName;
            `);
    }
    return { success: true };
}
