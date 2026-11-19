# 📘 المخطط الشامل والمرجع الهندسي لنظام الحسابات ونقاط البيع متعدد الفروع (MultiBranch ERP & POS)

> **الغرض من هذا الملف:**
> مرجع فني وتفصيلي كامل للبرنامج بالكامل — يغطي المعمارية البرمجية، جميع الشاشات والتبويبات والحوارات الفرعية (`179` مسار شاشة)، كافة نقاط الاتصال البرمجية (`20 API Routes`)، قاعدة البيانات ومصفوفة المزامنة (`72+ جدولاً` في SQL Server)، شجرة الصلاحيات، والمحركات الحسابية والتشغيلية. يُعتمد كمرجع أساسي قبل أي تطوير أو تعديل أو إضافة طلبات جديدة.

---

## 1. النظرة العامة والمعمارية التقنية (Tech Stack & Architecture)

### 1.1 التقنيات والمكتبات المعتمدة (`package.json`)
- **الإطار الأساسي:** `Next.js 15` (App Router) + `React 18` + `TypeScript 5` (منفذ التشغيل الافتراضي: `9002`).
- **الواجهة والتصميم:** `Tailwind CSS` + `Radix UI / shadcn/ui` + `Lucide Icons` + `Recharts` (الرسوم البيانية) + دعم كامل للغة العربية (RTL) والثيمات (`dark` / `light` / `custom` بألوان ودرجة تكبير `zoomLevel` لكل مستخدم).
- **قاعدة البيانات:** `Microsoft SQL Server` عبر مكتبة `mssql` (`src/lib/db.ts`)، ويدعم الاتصال المباشر بـ:
  - سيرفر محلي (`localhost:1433` أو شبكة داخلية LAN IP).
  - سيرفر سحابي (`Amazon AWS RDS`، `Azure SQL`، أو `VPS` خارجي) مع تشفير `Encrypt=true` وإدارة إعداداته في `local-db-config.json`.
- **العمل بدون إنترنت والأداء (PWA & Caching):** `@ducanh2912/next-pwa` (`public/sw.js`) + `localforage` (تخزين مؤقت فوري لبيانات النظام عبر `CACHE_KEY` في `IndexedDB`).
- **الطباعة والملفات والباركود:** `pdfkit` + `pdf-to-printer` (مع `SumatraPDF`) + `arabic-reshaper` + طباعة الشبكة المباشرة `TCP Raw Port 9100` (ESC/POS Win-1256) + طابعة الويب للمتصفح (`Web Printer`) + `xlsx` + `jsbarcode` / `react-barcode` / `qrcode.react` + `html5-qrcode` + `html-to-image`.
- **الذكاء الاصطناعي:** `Genkit` (`@genkit-ai/googleai` / `@genkit-ai/next` في `src/ai/*`) لاستخراج بنود الفواتير من النصوص غير المهيكلة.

### 1.2 أوضاع التشغيل (System Roles & Connectivity)
1. **وضع الفرع (`branch`) vs الوضع المركزي (`central`):**
   - يُكتشف الوضع من `AppSettings` وملف `local-db-config.json` ويعرض في واجهة البرنامج عبر `/api/system/mode` و`DataProvider` (`systemRole`, `isCentral`).
   - في وضع الفرع: يعمل الفرع على قاعدته المحلية ويزامن مع السيرفر المركزي (`10.110.16.16` أو حسب الإعداد) بالرفع (`push`) والسحب (`pull`) أو الثنائي (`bidirectional`).
2. **دورة حياة الاتصال والبيانات (`src/contexts/data-provider.tsx`):**
   - عند الفتح: تحميل فوري من الكاش المحلي (`localforage` بمهلة 750ms) ثم جلب حي من `/api/db/sync`.
   - فحص الصحة الدوري (`checkServerHealth`): يفحص `/api/db/health` (استعلام خفيف `SELECT 1`) كل 15 ثانية (أو كل 4–5 ثوانٍ في حالة الأوفلاين)، وعند عودة الاتصال يتحول فوراً لمتصل ويحدث البيانات في الخلفية دون تعطيل الواجهة.
   - يمكن إعادة محاولة الاتصال يدوياً من شارة **"وضع الأوفلاين"** في الشعار العلوي (`retryDatabaseConnection`).
   - عمليات الكتابة تمر عبر `dbAction(path, action, payload)` بتحديث متفائل للواجهة (Optimistic UI) ثم حفظ فعلي عبر `POST /api/db/action`.

### 1.3 أنماط التنقل وواجهة الاستخدام (`app-layout.tsx`, `app-menubar.tsx`, `modern-nav-hub.tsx`)
يوفر النظام 3 أنماط لتخطيط سطح المكتب يتم اختيارها من الإعدادات العامة:
1. **`sidebar`:** قائمة جانبية قابلة للطي مع بحث عربي مطبّع (`normalizeArabicSearch`) وتحكم في ارتفاع التبويبات (`compact` / `normal` / `comfortable`).
2. **`menubar`:** شريط قوائم علوي أفقي (`AppMenubar`).
3. **`modern_hub`:** واجهة البطاقات المركزية (`ModernNavHub`).

### 1.4 المصادقة والجلسات والصلاحيات (`auth-context.tsx`, `permissions-context.tsx`)
- **حماية جلسة الكاشير الوحيدة (`/api/auth/session`):** عند دخول مستخدم لديه `isCashier`، يحصل المتصفح على `SessionToken` ويُرسل نبضاً (`heartbeat`) كل 15 ثانية لجدول `dbo.ActiveUserSessions`. أي دخول من جهاز ثانٍ بنفس الحساب يُرفض بـ `409 Conflict` أو يُغلق الجلسة السابقة.
- **حساب الطوارئ:** `Admin` (كلمة مرور `200300400` أو `admin`) يمتلك صلاحيات كاملة وتجاوز فحص الترخيص.
- **الأدوار الافتراضية (`initialRoles`):** `مسؤول`، `محاسب`، `أمين مخزن`، `أمين صندوق`، `كاشير`، `مدير محل` — قابلة للتخصيص عبر `/roles` بأفعال: `view`, `add`, `edit`, `delete`, `print`, `generate`, `approve`.
- **صلاحيات الكاشير الخاصة على مستوى المستخدم (`Users`):** `canDeleteFromCart`, `canProcessReturn`, `canCancelInvoice`, `canBypassScannerForReturn`, `canOpenOwnShift`.
- **ربط التراخيص:** كل مستخدم يمكن تقييده بـ `warehouseIds` محددة ومفتاح ترخيص (`Licenses`) يحدد الوحدات المفعلة وتاريخ الانتهاء.

---

## 2. الخريطة الكاملة لجميع الشاشات والتبويبات والحوارات

> ملاحظة: بعض المسارات الإرثية تعمل كتحويلات (Redirects) إلى الشاشات المعتمدة (مثل `/branches`، `/master-data/warehouses`، `/master-data/item-sections`، `/inventory/price-update`، `/inventory/stock-transfers`، `/inventory/stock-in/list`، `/inventory/stock-in/new`، `/purchases/invoices/new`، `/sales/invoices/[id]`، `/sales/issue-to-rep`، `/settings/sync`، `/settings/licenses`).

### القسم الأول: لوحة التحكم والتحليلات والصالات
| المسار | اسم الشاشة | التبويبات (`Tabs`) / البطاقات والحوارات الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/dashboard` | المعلومات الرئيسية (لوحة التحكم) | 8 مؤشرات KPI رئيسية (الأرصدة/السيولة، مستحقات العملاء، مستحقات الموردين، قيمة المخزون، صافي الربح، المبيعات، المحصل نقداً، تكلفة البضاعة) + نوافذ منبثقة لتحليل السيولة، المديونيات، وتحليل صافي الربح. | `DataContext` |
| `/analytics` | التحليلات الرسومية المتقدمة | بطاقات: إجمالي المبيعات، صافي الربح التقديري، نسبة الديون للمبيعات، هامش الربح + رسوم بيانية لاتجاهات المبيعات والأرباح، أداء المناديب، أرباح/خسائر الأصناف، وتوزيع المصروفات. | `DataContext` + `Recharts` |
| `/tables` | شاشة الطاولات (الصالة) | عرض تفاعلي لطاولات الفروع، الطاولات المشغولة/المتاحة، الحجز/الفتح المباشر على شاشة الكاشير، ومتابعة الفواتير المعلقة. | `posAuditLogs`, `heldInvoices` |

### القسم الثاني: نقاط البيع والكاشير والمطاعم
| المسار | اسم الشاشة | التبويبات / المكونات والوظائف الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/pos` | شاشة الكاشير الرئيسية | دعم باركود الميزان (EAN-13 ببادئة `21/23/25` وزن أو سعر) والملابس، مجموعات سريعة ملونة، سلة متعددة الوحدات، تطبيق العروض الآلي (`bestPromoId`)، نقاط الولاء واستبدالها، تعليق واسترجاع الفواتير، ربط الطاولات والدليفري والطيارين والبائعين، الدفع المتعدد، صندوق الإكراميات، فتح الوردية، مزامنة لحظية مع شاشة العميل الثانية، إرسال واتساب تلقائي/يدوي، وطباعة إيصال الكاشير + مطابخ متعددة. | `heldInvoices`, `posAuditLogs`, `gratuityLogs`, `stockOutRecords`, `customers`, `notifications`, `restaurantTables`, `posSessions`, `/api/print` |
| `/pos/customer-display` | شاشة عرض العميل الثانية (Dual Screen) | تعمل عبر `BroadcastChannel` و`localStorage` بـ 4 مراحل: الانتظار (`idle` مع الشعار والعروض)، المسح (`scanning` عرض البنود والخصومات والنقاط)، الدفع (`payment` مع QR إنستاباي وفودافون كاش)، والانتهاء (`completed` وعودة تلقائية للانتظار خلال 8 ثوانٍ). | `settings`, `promotions`, `customer-experience.ts` |
| `/pos/sessions` | إدارة يومية نقاط البيع (الورديات) | إدارة فتح وإغلاق يوم العمل والورديات، كشف الجرد الفعلي للدرج، رصد العجز والزيادة، تسجيل مصروفات/إيرادات وردية، حوار بيان إقفال يوم العمل وتجميع طرق الدفع، وطباعة تقرير Z. | `posSessions`, `expenses`, `exceptionalIncomes`, `treasuryTransactions`, `settings`, `/api/print` |
| `/master-data/pos-terminals` | إدارة نقاط البيع (الكاشيرات) | تعريف النقاط والكود والمخزن المرتبط + إعدادات طابعة الكاشير والمطبخ (طابعة نظام ويندوز مع كشف الـ IP والكتابة اليدوية، شبكة `IP/9100`، أو طابعة ويب للمتصفح `Web Printer`) + أزرار الاختبار المباشر. | `posTerminals`, `/api/system-printers`, `/api/print` |
| `/master-data/payment-methods` | إدارة طرق الدفع | تعريف طرق الدفع (نقدي، فيزا، إنستاباي، فودافون كاش، إلخ) وربطها بالحسابات. | `paymentMethods` |
| `/master-data/item-groups` | مجموعات أصناف الكاشير | **تبويبان:** `custom-groups` (مجموعات الكاشير المخصصة مع ألوان ومعاينة حية للأزرار) و `inventory-categories` (ربط الفئات المخزنية بالكاشير) + حوارات إدارة وربط الأصناف. | `itemGroups`, `items`, `itemCategories` |
| `/master-data/restaurant-tables` | إدارة الطاولات | تعريف طاولات الفروع والأقسام وحالاتها ومتابعة الفواتير المعلقة المرتبطة بها. | `restaurantTables`, `posAuditLogs`, `heldInvoices` |
| `/sales/returns/pos` | مرتجع نقاط البيع | البحث السريع عن الفاتورة الأصلية بالباركود أو رقم الفاتورة المعكوس/المعياري واسترداد الأصناف كلياً أو جزئياً. | `/api/sales/find-invoice` |

### القسم الثالث: التسويق والعروض والأسعار
| المسار | اسم الشاشة | التبويبات / الوظائف الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/marketing/promotions` | إدارة العروض والخصومات | **4 تبويبات:** `all` (كل العروض)، `active` (النشطة)، `upcoming` (القادمة)، `expired` (المنتهية) + حوارات إدارة العروض المتدرجة (`tiered_quantity`)، حزم أصناف (`buy_x_get_y_discount`)، اشتر N واحصل على الأرخص (`buy_n_get_cheapest_discount`)، نسبة/مبلغ ثابت، ورابط مباشر لتقرير تحليلات العروض. | `promotions` |
| `/reports/promotions` | تقارير مبيعات وتدقيق العروض والأصناف المرتبطة | **3 تبويبات:** `cross_items` (تحليل مبيعات العروض المرتبطة والحزم)، `audit` (تدقيق العروض: تضارب الصنف في أكثر من عرض، البيع بأقل من التكلفة، العروض الراكدة)، `combos` (تحليل سلة الشراء Market Basket Analysis واقتراح عروض مرتبطة) + فلاتر وتصدير CSV وطباعة وحوار فحص الفواتير. | `DataContext` |
| `/reports/promotions/[id]` | تفاصيل عرض ترويجي محدد | بطاقات المبيعات والأرباح والوحدات المباعة + أداء الأصناف والفواتير المتأثرة بالعرض. | `DataContext` |
| `/marketing/price-adjustments` | تعديلات أسعار البيع | عمل من 3 خطوات عبر Excel: تنزيل القائمة الحالية -> رفع الملف المعدل -> مراجعة الفروق وتأكيد التحديث. | `items`, `priceChangeLogs` |
| `/master-data/sellers` | إدارة البائعين | تعريف البائعين ونسب العمولات وربطهم بالفواتير والكاشير. | `sellers` |
| `/marketing/targets` | إدارة الأهداف (التارجت) | **تبويبان:** `sellers` (أهداف البائعين الشهرية) و `branches` (أهداف الفروع الشهرية). | `targets` |

### القسم الرابع: الأصناف والتصنيفات والباركود
| المسار | اسم الشاشة | التبويبات / الوظائف الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/master-data/item-categories` | تصنيفات الأصناف (شجرة 5 مستويات) | **5 تبويبات:** `level1` الفئات (`itemSections`)، `level2` الأقسام (`itemCategories`)، `level3` المجموعات (`itemGroups`)، `level4` مجموعات فرعية 1 (`itemSubCategories1`)، `level5` مجموعات فرعية 2 (`itemSubCategories2`) مع ترقيم هرمي وخيار العرض بالكاشير. | `itemSections`, `itemCategories`, `itemGroups`, `itemSubCategories1`, `itemSubCategories2` |
| `/master-data/items` | بطاقة الأصناف | شاشة شاملة (2718 سطراً): أصناف عادية/مواد خام/مصنعة (`BOM components`)، وحدات ثانوية ومعاملات تحويل، مصفوفة الأصناف (`color` × `size`)، التعديل الجماعي للتصنيفات والأسعار، باركود `Code128` و`EAN-13` ميزان/ملابس، حقن التصنيفات الافتراضية، وطباعة ملصقات. | `items`, `itemSections`, `itemCategories`, `itemGroups`, `itemSubCategories1`, `priceChangeLogs`, `/api/master-data/seed-categories`, `/api/db/sync` |
| `/master-data/items/deleted` | الأصناف المحذوفة | استعراض واستعادة الأصناف المعطلة/المحذوفة منطقياً (`IsDisabled = 1`). | `items` |
| `/master-data/item-colors` | إدارة الألوان | تعريف ألوان الأصناف المستخدمة في مصفوفة الأصناف. | `itemColors` |
| `/master-data/item-sizes` | إدارة المقاسات | تعريف مقاسات وأحجام الأصناف المستخدمة في مصفوفة الأصناف. | `itemSizes` |
| `/inventory/import-items` | استيراد الأصناف من Excel | معالج من 3 خطوات: تحديد الفرع -> رفع وتجهيز ملف Excel -> المراجعة واستيراد التصنيفات والأصناف وأرصدة البداية. | `itemSections`, `itemCategories`, `itemGroups`, `items`, `stockInRecords` |
| `/inventory/barcode-designer` | مصمم ملصقات الباركود | تصميم قوالب الاستيكر (المقاس، الخطوط، السعر، اسم الشركة، الكود، الباركود/QR) وحفظ التصميمات. | `barcodeDesigns` |
| `/inventory/barcode-print` | طباعة مجموعة أصناف | اختيار عدة أصناف وتحديد كمية الملصقات لكل صنف مع معاينة حية وطباعة دفعة واحدة. | `barcodeDesigns`, `items` |

### القسم الخامس: المخازن واللوجيستيك والتصنيع
| المسار | اسم الشاشة | التبويبات / الوظائف الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/master-data/branches` | الفروع | إدارة الفروع والمخازن وربطها بالتراخيص والمستخدمين والخزائن ونقاط البيع. | `warehouses`, `licenses`, `users`, `cashAccounts`, `posTerminals` |
| `/master-data/delegate-warehouses` و `[id]` | مخازن المناديب | قائمة مخازن عهد المناديب. وصفحة التفاصيل `[id]` تحتوي **3 تبويبات:** `inventory` (محتويات المخزن والجرد)، `movements` (سجل الصرف/الإرجاع)، `sales` (المبيعات والفواتير). | `warehouses`, `DataContext` |
| `/manufacturing/orders` | أوامر التصنيع والتشغيل (BOM & Work Orders) | بطاقات: إجمالي الأوامر، قيد التشغيل، مكتملة، إجمالي تكاليف الإنتاج + حوارات: إنشاء أمر تشغيل، إنهاء واعتماد الإنتاج (حساب الهالك الطبيعي وغير الطبيعي، أجور العمل، التكاليف الصناعية، وتوليد قيود WIP آلياً)، وتفاصيل/طباعة التشغيلة. | `/api/manufacturing/orders` |
| `/inventory/zones` و `[id]` | المخازن الرئيسية والأقسام والحاويات | تعريف قواطع ومناطق وأرفف التخزين (`InventoryZones` و`InventorySections`) وسعتها؛ وصفحة `[id]` تعرض الرصيد الحالي وسجل الحركات للقسم. | `warehouses`, `licenses`, `users`, `inventorySections` |
| `/inventory/stock-in` و `[id]` | تسكين وإدارة البضاعة الواردة | **تبويبان:** `pending` (أذونات بانتظار التسكين في الحاويات) و `history` (سجل الأذونات المكتملة) + حوار توزيع/إعادة توزيع الحاويات. | `inventorySections`, `stockInRecords` |
| `/inventory/stock-out`, `/new`, `/[id]` | أذون الصرف المخزني اليدوي | قائمة أذون الصرف، إنشاء إذن صرف (هالك/استهلاك/تجهيز طلب)، وعرض التفاصيل. | `stockOutRecords`, `requisitions` |
| `/inventory/transfer`, `/new`, `/[id]` | تحويلات المخزون بين الفروع | سجل التحويلات، إنشاء إذن تحويل بمصاريف الشحن وحالة بالطريق (`in_transit`)، واستعراض الإيصال. | `stockTransferRecords`, `stockInRecords`, `expenses` |
| `/inventory/goods-in-transit` | بضاعة بالطريق | متابعة الشحنات المحولة المعلقة واستلامها رسمياً بالمخزن المستلم. | `stockInRecords` |
| `/inventory/requisitions` | طلبات البضاعة | عرض الطلبات المرفوعة ومتابعة حالتها (`fulfilled` للطلبات المنفذة، `new` لإنشاء طلب، `processing` للتحضير والصرف اللوجستي). | `requisitions`, `stockOutRecords`, `stockInRecords` |
| `/inventory/requisitions/recommendations` | توصيات طلبات البضاعة | **تبويبان:** `new` (توصيات إعادة الطلب الذكية) و `pending` (طلبات قيد التنفيذ) مع حوار تحليل حركة مبيعات الصنف وإمكانية التغفيل (`snoozedRecommendations`). | `requisitions`, `purchaseOrders`, `snoozedRecommendations` |
| `/inventory/adjustment`, `/new`, `/[id]` | تسوية وجرد المخزون الذكي | سجل التسويات، وشاشة الجرد الذكي المتكاملة مع قراءة الكاميرا (`Barcode & QR`) ومقارنة الدفتري بالفعلي وحساب العجز/الزيادة. | `stockAdjustmentRecords` |
| `/inventory/movements` | سجل حركات المخزون | عرض مجمّع ومفلتر لجميع الحركات المخزنية وحوار تفاصيل الأصناف. | `DataContext` |
| `/inventory/item-ledger` و `/inventory/stock-status` | كارت الصنف وأرصدة المخازن | تتبع حركات الصنف زمنياً ومعرفة الرصيد الدفتري الفوري بكل فرع. | `calculateStockForItemInWarehouse` |

### القسم السادس: العملاء والمبيعات
| المسار | اسم الشاشة | التبويبات / الوظائف الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/master-data/customers` | إدارة العملاء | **تبويبان:** `detailed` (عرض تفصيلي) و `summary` (حسب الأصناف) + حوارات: سجل مشتريات العميل، تعديل العميل (الحد الائتماني/سماح بالآجل/نقاط الولاء)، وتسجيل دفعة جديدة. | `customers`, `customerPayments` |
| `/sales/invoices` | فاتورة بيع جديدة | إنشاء فاتورة مبيعات B2B/B2C مع اختيار العميل، المخزن، الوحدات الثانوية، الخصم، الضريبة، التحصيل الفوري، والتحقق من الرصيد والائتمان. | `customers`, `dbAction` |
| `/sales/invoices/list` | سجل فواتير البيع | بحث وفلترة متقدمة + حوار تفاصيل الفاتورة + شهادة الفاتورة الإلكترونية (ETA) وإرسال محاكاة بدون توكن + طباعة A4. | `/api/e-invoice/simulate-submit` |
| `/sales/returns` و `/new` | مرتجعات المبيعات | سجل المرتجعات وحوارات التفاصيل والطباعة، وإنشاء مرتجع مبيعات مع توزيع نسبي للخصم والضريبة (`calculateInvoiceReturnTotals`). | `salesReturns` |
| `/accounting/customer-payments` | مقبوضات العملاء | تسجيل سندات قبض العملاء، الربط الاختياري بفاتورة مستحقة، وعرض القيد المحاسبي المتوقع. | `customerPayments` |

### القسم السابع: الموردون والمشتريات
| المسار | اسم الشاشة | التبويبات / الوظائف الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/master-data/suppliers` | إدارة الموردين | **تبويبان:** `detailed` (عرض تفصيلي) و `summary` (حسب الأصناف) + حوارات: سجل توريد الأصناف، الأصناف المرتبطة بالمورد، وتعديل البيانات. | `suppliers` |
| `/purchases/orders`, `/new`, `/[id]` | أوامر الشراء | قائمة أوامر الشراء، إنشاء أمر شراء جديد، واستعراض/تحويل أمر الشراء لفاتورة. | `purchaseOrders`, `suppliers` |
| `/purchases/invoices`, `/list`, `/[id]/edit` | فواتير الشراء | إنشاء فاتورة شراء (تحديث تكاليف، تواريخ صلاحية، استلام مباشر أو معلق حسب `purchaseWorkflow`)، تعديل الفواتير، سجل المشتريات مع خصم مكتسب وحذف/إلغاء مع عكس الأثر المحاسبي. | `suppliers`, `purchaseOrders`, `items`, `stockInRecords`, `purchaseInvoices`, `/api/accounting/void-invoice` |
| `/purchases/returns` و `/new` | مرتجعات المشتريات | قائمة المرتجعات وإنشاء إذن مرتجع لمورد بالبحث عن الفاتورة الأصلية. | `purchaseReturns` |
| `/accounting/supplier-payments` | مدفوعات الموردين | تسجيل سندات صرف وسداد للموردين وسجل المدفوعات. | `supplierPayments` |

### القسم الثامن: المحاسبة والمالية والأصول والضرائب
| المسار | اسم الشاشة | التبويبات / الوظائف الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/accounting/chart-of-accounts` | دليل الحسابات (شجرة الحسابات) | عرض هرمي لشجرة الحسابات القياسية (1 الأصول، 2 الالتزامات، 3 حقوق الملكية، 4 الإيرادات، 5 المصروفات) مع بطاقة تفصيلية تفاعلية لكل حساب. | `chart-of-accounts.ts` |
| `/accounting/journal` | قيود اليومية والأستاذ العام | **4 تبويبات:** `detailed-view` (عرض تفصيلي)، `journal-view` (عرض القيد المزدوج)، `accounts-list` (دليل الحسابات المستخدمة)، `ledger-view` (حساب الأستاذ العام لحساب محدد). | `DataContext` |
| `/accounting/posting` | الترحيل الآلي للقيود (Posting Controller) | **7 تبويبات:** `sales` (مبيعات)، `purchases` (مشتريات)، `expenses` (مصروفات)، `sales_returns` (مرتجع مبيعات)، `purchase_returns` (مرتجع مشتريات)، `imbalanced` (قيود غير متوازنة مع تخطيها تلقائياً عند الترحيل الجماعي)، `posted_ledger` (سجل القيود المرحّلة) + تصدير Excel وحوار معاينة/اعتماد/فك ترحيل القيد. | `/api/accounting/posting` |
| `/accounting/assets` | الأصول الثابتة وإهلاكها | إدارة الأصول، العمر الإنتاجي، قيمة الخردة، **حساب وترحيل الإهلاك الشهري الآلي**، واستبعاد/بيع الأصل مع أثره المحاسبي. | `fixedAssets`, `depreciationRecords`, `/api/accounting/posting` |
| `/accounting/vat` | إقرار ضريبة القيمة المضافة (نموذج 10) | **4 تبويبات:** `official_form` (الإقرار الرسمي نموذج 10 — مخرجات، مدخلات، تصفية الضريبة)، `sales` (سجل المبيعات)، `purchases` (سجل المشتريات)، `expenses` (المصروفات الضريبية). | `DataContext` |
| `/accounting/expenses` | إدارة المصروفات | تسجيل بنود المصروفات وربطها بالحساب المالي والفرع. | `expenses` |
| `/accounting/exceptional-income` | الدخل الاستثنائي | تسجيل الإيرادات العرضية والاستثنائية خارج النشاط التشغيلي. | `exceptionalIncomes` |
| `/accounting/gratuity` | صندوق الإكراميات (Tips) | **3 تبويبات:** `inflow` (المحصل تفصيلي)، `daily` (المحصل يومي)، `outflow` (الموزع/الصرف) + ملخص الكاشيرات وتوزيع الإكراميات. | `gratuityDistributions`, `expenses` |
| `/accounting/treasury` | إدارة حركة الخزينة | **تبويبان:** `deposit` (إيداع / زيادة رأس مال) و `withdrawal` (سحب / مسحوبات شخصية) + عرض أرصدة جميع الحسابات. | `treasuryTransactions` |
| `/accounting/profit-distribution` | توزيعات أرباح الشركاء | **تبويبان:** `log` (سجل الصرف للشركاء) و `daily` (تفاصيل الربح اليومي التراكمي). | `profitDistributions` |

### القسم التاسع: المناديب والتوزيع الميداني (Field & Van Sales)
| المسار | اسم الشاشة | التبويبات / الوظائف الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/master-data/sales-reps` | مناديب المبيعات | قائمة المناديب ومخازن العهد المرتبطة وحسابات العهد النقدية. | `users`, `warehouses`, `cashAccounts` |
| `/sales/issue-to-rep` (`/new`, `/list`, `/[id]`) | صرف بضاعة لمندوب | تحميل سيارة وعهدة المندوب بالبضاعة واستعراض أذونات الصرف. | `stockIssuesToReps` |
| `/sales/return-from-rep` (`/new`, `/list`, `/[id]`) | مرتجع بضاعة من مندوب | تفريغ حمولة المندوب وإرجاع المتبقي للمخزن الرئيسي. | `stockReturnsFromReps` |
| `/sales/rep-invoice` و `/sales/my-invoices` | فواتير المندوب وفواتيري | إصدار المندوب لفاتورة بيع من عهدته ومتابعة مبيعاته وتحصيلاته ومديونياته. | `DataContext` |
| `/sales/rep-invoices` | اعتماد فواتير المناديب | مراجعة فواتير المناديب المعلقة واعتمادها رسمياً لتأثيرها بالمخزون والعملاء. | `salesInvoices`, `customerPayments` |
| `/sales/rep-operations` | مراقبة أداء وعهدة المندوب | ملخص أرصدة وعهد جميع المناديب محسوباً مباشرة في SQL (`View_SalesRepBalances`) + تفاصيل الحركة. | `/api/reports/aggregated` |
| `/sales/field-sales-management` | إدارة المناديب والتوزيع الميداني (Van Sales) | **3 تبويبات:** `routes` (تخطيط خطوط السير والتحقق الجغرافي Geo-Fencing بالمسافة المترية Haversine)، `commissions` (الشرائح التصاعدية وبونص الهامش المرتفع)، `van-audit` (التسوية الآلية لعهدة سيارة المندوب بالباركود). | `settings`, `stockAdjustmentRecords`, `field-sales.ts` |
| `/sales/remit-from-rep` | توريد نقدية من مندوب | توريد التحصيل النقدي من عهدة المندوب إلى الخزينة الرئيسية. | `cashAccounts`, `repRemittances`, `expenses`, `exceptionalIncomes` |
| `/sales/record-visit`, `/monitor-visits`, `/monitor-logins` | تسجيل ومتابعة الزيارات والدخول | تسجيل زيارة العميل بالإحداثيات GPS ومراقبة زيارات المناديب وتسجيلات الدخول. | `customerVisits`, `loginHistory` |

### القسم العاشر: الدليفري والطيارين
| المسار | اسم الشاشة | الوظائف الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/delivery/staff` | إدارة الطيارين | إضافة وتعديل طياري التوصيل والبيانات الخاصة بهم. | `deliveryStaff` |
| `/delivery/operations` | عمليات الطيارين | كشف حساب ومراقبة طلبات ورسوم ومستحقات الطيار خلال فترة. | `DataContext` |
| `/sales/delivery-reconciliation` | تحصيل فواتير الدليفري | تسوية وتحصيل الفواتير المفتوحة المسلمة للطيارين وإيداعها الخزينة. | `treasuryTransactions` |

### القسم الحادي عشر: الموارد البشرية والرواتب (HRMS)
| المسار | اسم الشاشة | الوظائف الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/hr/employees` | دليل الموظفين وشؤون العاملين (Advanced HRMS) | إدارة ملفات العاملين، الرواتب الأساسية، البدلات، التأمينات، الإجازات، والمؤشرات المالية للعمالة. | `users` |
| `/hr/advances` | سلف الموظفين | تسجيل وصرف سلف العاملين وربط استقطاعها بمسير الرواتب. | `employeeAdvances` |
| `/hr/adjustments` | المكافآت والجزاءات | تسجيل المكافآت والبدلات والخصومات/الجزاءات الشهرية للموظفين. | `employeeAdjustments` |
| `/hr/payroll` | احتساب وصرف الرواتب | احتساب مسير الرواتب الشهري آلياً (الأساسي + البدلات + المكافآت - الجزاءات - السلف) واعتماده مع إمكانية الترحيل للأستاذ العام. | `payrollRecords`, `/api/accounting/posting` |

### القسم الثاني عشر: مركز التقارير الشامل (`/reports`)
شاشة `/reports` منظمة في **5 تبويبات رئيسية:** `sales` (المبيعات والعملاء)، `purchases` (المشتريات والموردون)، `inventory` (المخزون واللوجيستيك)، `financial` (المالية والحسابات)، `hr` (الموارد البشرية والرواتب).

| التصنيف | التقارير والصفحات المتاحة (`src/app/reports/*`) |
|---|---|
| **المبيعات والعملاء** | `sales-reports` (المفصل)، `pos-sales` (مجمع)، `pos-reports` (فواتير POS)، `sales-by-customer`، `customer-purchases`، `rep-sales-report` (تبويبان: `summary`, `invoices`)، `fast-slow-moving` (تبويبان: `fast`, `slow`)، `sales-returns-report`، `cancelled-invoices`، `item-sales-count`، `tables-report`، `cashier-discrepancies`، `payment-methods-report`، `seller-targets` (تبويبان: `sellers`, `branches`)، `promotions` (3 تبويبات: `cross_items`, `audit`, `combos`) + `promotions/[id]`. |
| **المشتريات والموردين** | `purchases-report` (شامل الفواتير والمردودات والآجل)، `supplier-statement`، `supplier-payables` (يستخدم `/api/reports/aggregated`). |
| **المخزون واللوجيستيك** | `stock-status`، `inventory-valuation` (قيمة المخزون وحد إعادة الطلب والنواقص)، `item-ledger`، `item-profit-loss` (يستخدم `/api/reports/aggregated`)، `sales-by-category`، `recipe-reports` (تبويبان: `products` جدوى المنتجات المصنعة و`materials` مقارنة الخامات والتوالف)، `inventory-movements-cost` (3 تبويبات: `stock-out`, `transfers`, `write-offs`)، `stock-transfers-report`، `inventory-adjustments-report`، `stock-in-report`، `stock-out-report`، `discrepancies` (تبويبان: `pos`, `purchases`)، `item-expiry`، `price-change-logs`. |
| **المالية والحسابات** | `financial-statements` (3 تبويبات: `income-statement` قائمة الدخل، `balance-sheet` الميزانية العمومية، `trial-balance` ميزان المراجعة + حوارات التحقق التفصيلي `drillDownModal` ومعالج ترحيل/تصحيح البيانات)، `expenses-report`، `customer-statement`، `customer-receivables` (يستخدم `/api/reports/aggregated`)، `cash-account-statement`، `vat-report`، `partner-shares`. |
| **الموارد البشرية** | `payroll-report` (مسير الرواتب والأجور الشهري). |

### القسم الثالث عشر: الإعدادات، الصلاحيات، الطابعات، المزامنة، والأمان
| المسار | اسم الشاشة | التبويبات / الوظائف الرئيسية | المصادر والـ APIs |
|---|---|---|---|
| `/settings` | الإعدادات العامة والتشغيلية | **3 تبويبات:** `general` (بيانات المنشأة، الشعار، العلامة المائية، التخطيط `sidebar/menubar/modern_hub`، ارتفاع القائمة، مدة التوست، وضع محلات الملابس، الترخيص)، `financial` (رأس المال الافتتاحي، العملة، السماح بالسالب، بادئة الميزان/الملابس/العادي، دورة الشراء، الضريبة `vatRate`، طريقة التقييم `average`/`last_purchase`)، `pos` (يوم العمل، تركيز الميزان، أبعاد الأعمدة وتوزيع الشاشة، الطباعة التلقائية، إظهار الرصيد، تطبيق الضريبة). | `settings`, `licenses` |
| `/settings/printers` | إعدادات الطباعة | **تبويبان:** `default` و `branch` (تخصيص فرع) + دعم طابعات الكاشير، مطابخ متعددة بتصنيفات مستقلة (`kitchenPrinters`)، طابعة A4، طابعة الباركود عبر (طابعة النظام / بلوتوث / IP TCP 9100 / طابعة الويب). | `settings`, `/api/system-printers`, `/api/print` |
| `/settings/receipt-designer` | مصمم الإيصالات | **تبويبان:** `pos-receipt` و `kitchen-receipt` + معاينة حية لـ `PosReceipt` و`KitchenReceipt` + إعادة ترتيب أقسام الفاتورة (`sectionOrder`) وحجم الورق والخطوط وإظهار رمز QR الضريبي. | `settings` |
| `/settings/e-invoice` | الفاتورة والإيصال الإلكتروني (ETA & ZATCA) | **5 تبويبات:** `b2b_invoice`, `b2c_receipt`, `branch_overrides` (تخصيص الفروع), `simulate_submission` (تجربة الرفع بدون توكن USB), `architecture_guide`. | `settings`, `/api/e-invoice/simulate-submit` |
| `/settings/customer-experience` | تجربة العملاء والولاء والواتساب | **3 تبويبات:** `dual-screen` (تخصيص خطوات شاشة العميل وQR الدفع)، `loyalty` (قواعد النقاط والكاش باك وعروض نقاط الأصناف)، `whatsapp` (وضع ويب مباشر أو Webhook API). | `settings`, `customers` |
| `/settings/central-sync` | المزامنة المركزية وإدارة الربط السحابي | **4 تبويبات:** `matrix` (مصفوفة الـ 72 جدولاً وحالاتها)، `directions` (**محمية بكلمة مرور** لتحديد اتجاه المزامنة `push/pull/bidirectional/disabled` على مستوى الجدول أو الفئة)، `queue` (طابور الحركات المعلقة وسجل المزامنة)، `config` (إعدادات السيرفر المركزي وبناء الـ 71/72 جدولاً، وتغيير دور النظام `branch/central` وتصفير البيانات). | `/api/sync/central`, `/api/db/backup` |
| `/settings/re-engineer` | إعدادات اتصال سيرفر الفرع (IP / AWS) | **تبويبان:** `connectionString` (نص الاتصال الكامل) و `fields` (السيرفر، المنفذ، القاعدة، المستخدم، التشفير) + اختبار الاتصال وإنشاء وتهيئة قاعدة البيانات. | `/api/db/init`, `/api/db/sync` |
| `/settings/audit-trail` | سجل الرقابة وتتبع الأخطاء | **تبويبان:** `audit` (سجل التدقيق غير القابل للتعديل ببصمة SHA-256) و `errors` (سجل أخطاء SQL والنظام مع تفاصيلها). | `/api/audit-trail`, `/api/system/log-error` |
| `/settings/backup` | النسخ الاحتياطي وتصفير البيانات | تصدير نسخة احتياطية JSON شاملة، استعادة نسخة، حذف فرع/مخزن محدد، وتصفير الحركات أو إعادة ضبط المصنع (مع حماية بكلمة مرور الإدارة وتنفيذ متزامن على الفرع والمركزي). | `/api/db/backup` |
| `/settings/period-closing` و `/inventory/period-closing` | إقفال وأرشفة الفترات المالية والمخزنية | إقفال الفترة وتثبيت الرصيد الافتتاحي في `InventoryClosings`، ومعاينة وترحيل/أرشفة البيانات التاريخية القديمة إلى جداول `Archived*`. | `inventoryClosings`, `/api/archive/period` |
| `/settings/license-keys` | إنشاء وتراخيص البرنامج | إصدار وتعديل مفاتيح التراخيص، تحديد الوحدات المسموحة وتواريخ الانتهاء، ومتابعة المستخدمين المتصلين. | `licenses`, `users` |
| `/settings/theme` | إعدادات المظهر | اختيار الثيم (`dark/light/custom`) وتخصيص كافة متغيرات الألوان ومعاينة حية وحفظها لملف المستخدم. | `users` |
| `/users`, `/roles`, `/master-data/cash-accounts`, `/master-data/partners` | الإدارة والصلاحيات والحسابات والشركاء | إدارة المستخدمين وصلاحياتهم ومخازنهم، تخصيص مصفوفة الأدوار، إدارة الخزائن والبنوك، وتعريف الشركاء ونسب الأرباح. | `users`, `roles`, `cashAccounts`, `partners` |

---

## 3. خريطة نقاط الاتصال البرمجية (API Routes Reference)

| المسار (`src/app/api/...`) | الطرق | الوظيفة والمسؤولية التقنية |
|---|---|---|
| `/api/db/health` | `GET` | فحص سريع لصحة اتصال SQL Server (`SELECT 1`) مع كشف حالة غياب قاعدة البيانات `LOCAL_DATABASE_MISSING` وإعادة تهيئة الـ Pool عند الانقطاع. |
| `/api/db/sync` | `GET` | جلب لقطة شاملة لجميع كيانات النظام النشطة من SQL Server لتغذية `DataProvider` والكاش المحلي. |
| `/api/db/action` | `POST` | نقطة التنفيذ الموحدة (`add`, `update`, `remove`, `transaction`, `getNextId`) عبر كافة الجداول والمستندات (~50+ مساراً تشمل توليد العدادات، حفظ بنود الفواتير، فحص الكاشير والمرتجع). |
| `/api/db/init` | `GET`, `POST` | قراءة/حفظ/اختبار إعدادات الاتصال (`local-db-config.json`) وتشغيل `createAndInitializeDatabase` لإنشاء القاعدة وتوافق الجداول والأعمدة. |
| `/api/db/backup` | `GET`, `POST` | تصدير/استعادة النسخ الاحتياطية، إحصائيات السجلات، حذف فرع محدد، أو تنفيذ `reset-data` (تصفير الحركات أو ضبط المصنع) محلياً ومركزياً معاً. |
| `/api/sync/central` | `GET`, `POST` | جلب مصفوفة الجداول وطابور المزامنة (`skipCentral: true` للفتح السريع)، اختبار اتصال السيرفر المركزي، التحقق من كلمة مرور الإدارة/الاتجاهات، تشغيل المزامنة الكاملة أو لجدول واحد، تغيير دور النظام، وتعديل اتجاهات المزامنة. |
| `/api/accounting/posting` | `GET`, `POST`, `DELETE`, `PATCH` | إدارة قيود الأستاذ العام `dbo.GeneralLedgerEntries`: جلب القيود، ترحيل قيد مع منع التكرار وتوازن آلي لفروق التقريب، فك ترحيل قيد، أو تعديله. |
| `/api/accounting/void-invoice` | `POST` | إلغاء وحذف فاتورة (مشتريات/مبيعات/مصروف) مع حذف قيدها المرحّل في `GeneralLedgerEntries` وأذون استلامها وفك ربط الدفعات وتسجيل العملية في التدقيق. |
| `/api/manufacturing/orders` | `GET`, `POST` | إدارة أوامر التشغيل والتصنيع: إنشاء، استهلاك خامات، حساب الهالك الطبيعي/غير الطبيعي، تحديث تكلفة/سعر الصنف، وتوليد 3 قيود GL مزدوجة متزنة (`WIP`). |
| `/api/reports/aggregated` | `GET` | استعلامات SQL تجميعية سريعة (`GROUP BY` & Views): `customer-balances`, `supplier-balances`, `cash-balances`, `rep-summary`, `item-profit-loss`. |
| `/api/archive/period` | `GET`, `POST` | معاينة السجلات قبل تاريخ قطع محدد، أرشفتها ونقلها إلى جداول `Archived*` مع التسجيل في `ArchiveLogs` وتصفح الأرشيف. |
| `/api/audit-trail` | `GET` | جلب آخر 200 سجل تدقيق رقابي من `dbo.AuditTrailLogs`. |
| `/api/auth/session` | `POST` | إدارة جلسة الكاشير الوحيدة (`acquire`, `heartbeat`, `release`) على جدول `dbo.ActiveUserSessions` (TTL 60 ثانية). |
| `/api/e-invoice/simulate-submit` | `POST` | محاكاة توقيع واعتماد الفاتورة وفق مواصفات مصلحة الضرائب (ETA) وتوليد `UUID` و`Canonical Hash` و`ZATCA TLV Base64 QR`. |
| `/api/master-data/seed-categories` | `POST` | حقن شجرة تصنيفات جاهزة قياسية (مكملات غذائية، أغذية صحية، مستلزمات رياضية). |
| `/api/print` | `POST` | طباعة مباشرة: إما ESC/POS خام بتحويل Windows-1256 عبر `TCP Socket (Port 9100)` لطابعات الشبكة، أو توليد PDF عربي مع `ArabicReshaper` وإرساله لسبولر ويندوز عبر `pdf-to-printer` / `SumatraPDF`. |
| `/api/system-printers` | `GET` | استكشاف متوازٍ لجميع طابعات النظام (Registry + PowerShell `Win32_Printer` + `Get-Printer` + `pdf-to-printer`) مع استخراج تلقائي لعنوان الـ IP من `PortName`. |
| `/api/sales/find-invoice` | `GET` | البحث الذكي عن فاتورة مبيعات POS عبر الرقم الدقيق أو الترتيب المعكوس للأجزاء (`C1-10-Date-Seq` ⇄ `Seq-C1-10-Date`) أو البحث الجزئي. |
| `/api/system/log-error` | `POST`, `GET` | تسجيل واستعراض أخطاء السيرفر والاستعلامات والطباعة في `dbo.SystemErrorLogs`. |
| `/api/system/mode` | `GET` | إرجاع بيئة التشغيل (`production`/`development`)، نوع الاستضافة (`local`, `vps`, `aws`, `azure`)، والسيرفر والقاعدة النشطة. |

---

## 4. بنية قاعدة البيانات ومصفوفة المزامنة (SQL Server Schema — 72 Tables)

يتم تأسيس الجداول والتحقق منها تلقائياً في `src/lib/database-init.ts` ومتابعتها عبر `dbo.SyncTrackingMatrix` و`TABLE_METADATA_MAP` في `src/lib/central-sync.ts`:

| التصنيف | الجداول (`dbo.*`) | الاتجاه الافتراضي |
|---|---|---|
| **فواتير وعمليات** | `SalesInvoices` (`push` ← `SalesInvoiceItems`), `SalesReturns` (`push` ← `SalesReturnItems`), `HeldInvoices` (`push`) | `push` |
| **مشتريات وموردين** | `PurchaseInvoices` (`push` ← `PurchaseInvoiceItems`), `PurchaseReturns` (`push` ← `PurchaseReturnItems`), `PurchaseOrders` (`push`), `SupplierPayments` (`push`), `Suppliers` (`bidirectional`) | `push` / `bidirectional` |
| **عملاء ومبيعات** | `Customers` (`bidirectional`), `CustomerPayments` (`push`), `CustomerVisits` (`push`) | `bidirectional` / `push` |
| **حسابات ومالية** | `CashAccounts`, `Partners`, `PaymentMethods` (`bidirectional`) — `TreasuryTransactions`, `GeneralLedgerEntries`, `Expenses`, `ExceptionalIncomes`, `ProfitDistributions` (`push`) | مختلط |
| **أصول وإهلاك** | `FixedAssets` (`bidirectional`), `DepreciationRecords` (`push`) | مختلط |
| **مخازن وأصناف وتصنيع** | `Items`, `ItemCategories`, `ItemSections`, `ItemGroups`, `ItemSubCategories1`, `ItemSubCategories2`, `ItemColors`, `ItemSizes`, `PriceChangeLogs`, `Warehouses`, `InventorySections`, `InventoryZones` (`bidirectional`) — `ManufacturingOrders`, `StockInRecords` (← `StockInRecordItems`), `StockOutRecords`, `StockTransferRecords`, `StockAdjustmentRecords` (← `StockAdjustmentItems`), `InventoryClosings` (`push`) | مختلط |
| **توزيع ومناديب** | `Sellers`, `DeliveryStaff` (`bidirectional`) — `StockIssuesToReps`, `StockReturnsFromReps`, `RepRemittances` (`push`) | مختلط |
| **موارد بشرية** | `Employees` (`bidirectional`) — `EmployeeAdvances`, `EmployeeAdjustments`, `PayrollRecords`, `GratuityDistributions`, `GratuityLogs` (`push`) | مختلط |
| **نقاط البيع** | `PosTerminals`, `Promotions`, `RestaurantTables` (`bidirectional`) — `PosSessions`, `PosAuditLogs` (`push`) | مختلط |
| **نظام ورقابة وأرشفة** | `BarcodeDesigns`, `Users`, `Roles`, `Licenses`, `AppSettings`, `Targets` (`bidirectional`) — `Counters`, `Requisitions`, `Notifications`, `LoginHistory`, `AuditTrailLogs`, `SystemErrorLogs`, `ArchiveLogs` (`push`) | مختلط |
| **جداول إضافية** | `ActiveUserSessions` (جلسات الكاشير الحية)، `SyncTrackingMatrix`، وجداول الأرشيف `ArchivedSalesInvoices`, `ArchivedPurchaseInvoices`, `ArchivedStockIssuesToReps`, إلخ. | محلي / أرشيف |

> **ملاحظة تقنية هامة:** الجداول الفرعية ذات عمود `IDENTITY` هي 6 جداول (`SalesInvoiceItems`, `SalesReturnItems`, `PurchaseInvoiceItems`, `PurchaseReturnItems`, `StockInRecordItems`, `StockAdjustmentItems`) وتتزامن ضمنياً مع مستنداتها الأب أو عبر `CHILD_TABLE_FK_MAP`.

---

## 5. المحركات وقواعد العمل الأساسية (Core Business Rules & Engines)

1. **شجرة الحسابات والمحاسبة (`src/lib/chart-of-accounts.ts`, `src/lib/accounting-utils.ts`):**
   - الحسابات القياسية (1 للأصول: `1101` نقدية، `1102` عملاء، `1103` مخزون، `1104` سلف وعهد، `1105` ضريبة مدخلات، `1107` إنتاج تحت التشغيل WIP، `1201` أصول ثابتة، `1209` مجمع إهلاك؛ 2 للالتزامات: `2101` موردون، `2102` ضريبة مخرجات، `2103` مصروفات مستحقة؛ 3 لحقوق الملكية: `3101..3105`؛ 4 للإيرادات: `4101..4103`, `4201..4203`؛ 5 للتكاليف والمصروفات: `5101` COGS، `5201..5208`).
   - `calculateAccountBalance(account, allData)` تحسب الرصيد الصافي لأي خزينة/بنك بجمع 7 مصادر واردة وطرح 11 مصدراً صادراً مع التمييز الصارم لعهد المناديب (`isRepCustodyAccount`).
2. **محرك حساب المخزون (`src/lib/inventory-utils.ts`):**
   - `calculateStockForItemInWarehouse` يبدأ من أحدث إقفال دوري (`InventoryClosings`) إن وُجد، ثم يجمع الوارد (استلام مخزني غير `in_transit`/`pending`/`draft`، تحويلات واردة، فائض جرد، مرتجعات مبيعات/POS، مرتجعات مناديب) ويطرح المنصرف (مبيعات/POS، إذون صرف معتمدة، تحويلات صادرة، عجز جرد، مرتجع شراء، صرف لمناديب)، مع دعم معاملات التحويل للوحدات الثانوية (`conversionFactor`).
3. **محرك العروض والباركود في الكاشير (`src/app/pos/page.tsx`):**
   - يدعم باركود الميزان 13 خانة (تحليل الوزن أو السعر حسب إعدادات المالية) وباركود الملابس.
   - يحسب أفضل عرض ساري وقت البيع بين: الخصم بالنسبة/المبلغ، الشرائح الكمية (`tiered_quantity`)، اشترِ صنف X واحصل على خصم على Y (`buy_x_get_y_discount`)، واشترِ N قطع واحصل على خصم على الأرخص (`buy_n_get_cheapest_discount`).
4. **محرك التصنيع (`src/app/api/manufacturing/orders/route.ts`):**
   - يحسب الرصيد المتاح للخامات داخل الـ Transaction قبل الصرف، ويدعم توزيع هالك الخامات على الوحدات السليمة أو تحميله لخسائر التصنيع (`5207`)، وحساب الهالك الطبيعي وغير الطبيعي للمنتج النهائي وإقفال `WIP (1107)` بقيود متزنة.
5. **محرك الطباعة الموحد (`src/lib/print-service.ts`, `src/app/api/print/route.ts`):**
   - يدعم 4 أوضاع: `system` (PDF مع إعادة تشكيل العربية وإرسال لـ SumatraPDF/Spooler)، `ip` (ESC/POS Win-1256 مباشر عبر منفذ 9100)، `browser` (نافذة الطباعة التلقائية عبر `iframe` بدون تعريفات)، و`bluetooth`.
6. **منظومة الفوترة الإلكترونية (`src/lib/e-invoice-engine.ts`):**
   - يبني مستند `ETA JSON v1.0` (`buildEtaDocument`)، ويحسب البصمة الرقمية `SHA-256`، ويولد كود `QR TLV Base64` متوافق مع معايير `ETA` و`ZATCA`.
7. **تجربة العملاء والتوزيع الميداني (`src/lib/customer-experience.ts`, `src/lib/field-sales.ts`):**
   - حساب وكاش باك نقاط الولاء + عروض نقاط خاصة لكل صنف/فئة (`fixed_per_unit` / `multiplier`) + مشاركة فواتير WhatsApp + التحقق الجغرافي (`calculateDistanceMeters`) لزيارات وفواتير المناديب.
8. **محرك الذكاء الاصطناعي (`src/ai/flows/extract-invoice-items.ts`, `src/ai/genkit.ts`):**
   - تدفق `extractInvoiceItemsFlow` مبني على `Genkit` لاستخلاص بنود الفواتير (اسم الصنف، الكمية، سعر الوحدة) تلقائياً من الأوصاف النصية غير المهيكلة.

---

## 6. دليل المطور السريع (قواعد ذهبية عند تنفيذ أي طلب جديد)

1. **إضافة جدول أو عمود جديد:** يجب تحديث كل من `src/lib/database-init.ts` (لإنشاء الجدول/العمود آلياً)، و`src/lib/central-sync.ts` (`TABLE_METADATA_MAP` للمزامنة)، و`src/app/api/db/backup/route.ts` (ضمن قوائم النسخ الاحتياطي والتصفير)، و`src/app/api/db/sync/route.ts` + `src/app/api/db/action/route.ts` إذا كان يتدفق عبر `DataProvider`.
2. **إضافة شاشة جديدة:** يُضاف مسارها في `navStructure` داخل `src/components/app-layout.tsx`، ويُعرّف مفتاح صلاحيتها في `permissionsConfig` و`initialRoles` داخل `src/contexts/permissions-context.tsx`، وتسميتها في `src/lib/dictionary.ts`.
3. **أي تعديل محاسبي:** يجب الحفاظ على القيد المزدوج (المدين = الدائن)، وعدم كسر معادلات `calculateAccountBalance` أو شاشة `/accounting/posting` أو `chart-of-accounts.ts`، وتسجيل الحركات الحساسة في `logAuditEvent` و`logSystemError`.
4. **أداء الاتصال والأوفلاين:** لا تربط استعلامات السيرفر المركزي البعيدة (`10.110.16.16`) أو الاستعلامات الثقيلة بفتح الشاشات الأولي بشكل حاجز؛ اجعل فحص الصحة خفيفاً والمزامنة في الخلفية دائماً.

---

## 7. تدفقات العمل المتكاملة من البداية للنهاية (End-to-End Lifecycles)

1. **دورة المبيعات في الكاشير (POS Checkout & Shift Lifecycle):**
   - فتح يوم العمل والوردية عبر `/pos/sessions` (`PosSessions`) ← توليد رقم الفاتورة التسلسلي عبر `usePosInvoiceCounter` بصيغة `{count}-{terminalCode}-{warehouseCode}-{DDMMYY}` مع احتياطي محلي في `localforage`.
   - إضافة الأصناف بالباركود (`Code128` أو باركود الميزان/الملابس `EAN-13` ذو 13 خانة) أو المجموعات السريعة ← حساب أفضل عرض ساري (`bestPromoId`) ← احتساب/استبدال نقاط الولاء للعميل ← تحديث شاشة العميل الثانية لحظياً (`BroadcastChannel`).
   - إتمام الدفع (متعدد الطرق / طاولة / طيار دليفري / بائع / إكرامية) ← الحفظ عبر `dbAction('posSales', ...)` (يُحفظ في `SalesInvoices` مع علامة الكاشير) ← خصم المخزون ← طباعة إيصال الكاشير + إيصالات المطبخ الموزعة حسب تصنيف الصنف ← إرسال رسالة WhatsApp (اختياري) ← إقفال الوردية وجرد الدرج وتسجيل العجز/الزيادة.

2. **دورة المشتريات والتسكين المخزني (Purchase & Put-Away Lifecycle):**
   - اختياري: أمر شراء (`/purchases/orders`) ← فاتورة شراء (`/purchases/invoices`) تحسب الصافي `subtotal - discount + tax` وتدعم تواريخ الصلاحية.
   - حسب `purchaseWorkflow`: إما استلام مباشر (`direct`) في المخزن أو إذن دخول معلق (`manual`) يظهر في تبويب `pending` بشاشة `/inventory/stock-in` ليتم تسكينه داخل الحاويات والأرفف (`InventorySections` / `InventoryZones`).
   - عند تحويل البضاعة بين الفروع (`/inventory/transfer/new`): تخرج الشحنة بحالة `in_transit` وتظهر في `/inventory/goods-in-transit` لدى الفرع المستلم لتأكيد الاستلام.

3. **دورة المناديب والتوزيع الميداني (Field & Van Sales Lifecycle):**
   - ربط المندوب بمخزن عهدة وحساب عهدة نقدية (`/master-data/sales-reps`) ← صرف بضاعة لعهدته (`/sales/issue-to-rep/new`) ← تسجيل زيارة عميل مع تحقق GPS (`/sales/record-visit` و`Geo-Fencing`) ← إصدار فاتورة مندوب (`/sales/rep-invoice`).
   - الفاتورة تظل معلقة حتى اعتمادها في `/sales/rep-invoices` ← توريد النقدية من عهدة المندوب للخزينة (`/sales/remit-from-rep`) ← تفريغ الحمولة المتبقية (`/sales/return-from-rep/new`) ← جرد سيارة المندوب بالباركود واحتساب العمولات التصاعدية (`/sales/field-sales-management`).

4. **دورة التصنيع والإنتاج (Manufacturing BOM & WIP Lifecycle):**
   - تعريف الصنف المصنّع ومكوناته (`components`) في `/master-data/items` ← فتح أمر تشغيل في `/manufacturing/orders` (`/api/manufacturing/orders`).
   - سحب الخامات مع التحقق من الرصيد المتاح داخل Transaction SQL ← تحميل الأجور والتكاليف الصناعية على حساب `1107` (إنتاج تحت التشغيل) ← معالجة الهالك الطبيعي وغير الطبيعي (`5207`) ← استلام المنتج التام وتحديث تكلفته وسعر بيعه وتوليد 3 قيود أستاذ عام مزدوجة متزنة.

5. **دورة الترحيل المحاسبي والإقفال والأرشفة (Posting & Period Closing):**
   - تظل الفواتير والمصروفات والمرتجعات في الدفاتر المساعدة حتى مراجعتها في `/accounting/posting` (تخطي وعزل القيود غير المتزنة تلقائياً) وترحيلها لـ `dbo.GeneralLedgerEntries`.
   - بناء القوائم المالية (`/reports/financial-statements`) وميزان المراجعة وإقرار الضريبة (`/accounting/vat`).
   - إقفال الفترة المخزنية (`InventoryClosings`) لتثبيت الأرصدة الافتتاحية، وأرشفة السجلات التاريخية إلى جداول `Archived*` عبر `/api/archive/period`.

---

## 8. هيكل الإعدادات، المفاتيح المحلية، والمكونات المشتركة

### 8.1 شجرة الإعدادات الرئيسية (`settings.main` في `dbo.AppSettings`)
- `general`: معلومات الشركة، الشعار، اللغة، موضع زر الموبايل، التخطيط (`sidebar`/`menubar`/`modern_hub`)، ارتفاع التبويبات، مدة الإشعارات، العلامة المائية، وضع محلات الملابس، وحالة الترخيص.
- `financial`: رأس المال الافتتاحي، بداية السنة المالية، العملة، السماح بالرصيد السالب، بادئات الباركود (`scaleBarcodePrefix` / `clothingBarcodePrefix` / `standardItemBarcodePrefix`)، `purchaseWorkflow`، نسبة الضريبة `vatRate`، طريقة تقييم المخزون (`average`/`last_purchase`).
- `posSettings`: يوم العمل، تركيز الميزان، أبعاد أعمدة السلة وتوزيع الشاشة، الطباعة التلقائية، إظهار الرصيد، وتطبيق الضريبة.
- `printerSettings` (عام ولكل فرع): نوع وعنوان طابعة الكاشير، مصفوفة `kitchenPrinters` بالتصنيفات، طابعة A4، وطابعة الباركود.
- `posReceipt` / `kitchenReceipt`: مقاس الورق، الخطوط، إظهار الحقول، إظهار QR الضريبي، وترتيب الأقسام `sectionOrder`.
- `eInvoice`: إعدادات `B2B` و`B2C` وتخصيص الفروع (`branchOverrides`) لـ ETA/ZATCA.
- `customerExperience`: إعدادات الشاشة الثانية (`dualScreen`)، نظام الولاء وعروض النقاط (`loyalty`)، وقوالب WhatsApp (`whatsapp`).
- `fieldSales`: إعدادات النطاق الجغرافي (`geoFencing` وإحداثيات العملاء وخطوط السير) وشرائح العمولات (`commissions`).

### 8.2 مفاتيح التخزين في المتصفح (Browser Storage Keys)
- `localStorage`: `authUser` (بيانات الجلسة الحالية)، `app_pos_settings`، `app_toast_duration`، `notifications_enabled`، `pos_customer_display_state`، `app_last_auto_sync_trigger`.
- `sessionStorage`: `auth_session_token` (رمز قفل جلسة الكاشير الوحيدة)، `app_open_tabs_*` (التبويبات المفتوحة)، وكلمة مرور فتح تبويب اتجاهات المزامنة.
- `localforage` (IndexedDB): `CACHE_KEY` (نسخة كاش البيانات الكاملة للعمل الفوري والأوفلاين) وعدادات الكاشير المحلية `pos_{workDayId}_{terminalId}`.

### 8.3 المكونات والـ Hooks المشتركة الهامة
- **الطباعة والباركود والفواتير (`src/components/*`):** `PosReceipt` (`pos-receipt.tsx`)، `KitchenReceipt` (`kitchen-receipt.tsx`)، `InvoiceTemplate` (`invoice-template.tsx`)، `BarcodePreview` (`barcode-preview.tsx`)، `BarcodePrintDialog` (`barcode-print-dialog.tsx`).
- **مكونات الواجهة والبيانات:** `AddEntityDialog` (`add-entity-dialog.tsx`)، `SyncIndicator` (`sync-indicator.tsx`)، `PageHeader` (`page-header.tsx`)، `LoginForm` (`login-form.tsx`)، `LicenseActivationForm` (`license-activation-form.tsx`).
- **الـ Hooks:** `usePosInvoiceCounter` (`use-pos-invoice-counter.ts`)، `useToast` (`use-toast.ts`)، `useIsMobile` (`use-mobile.tsx`).

