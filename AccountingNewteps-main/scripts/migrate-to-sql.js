const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const sqlConfig = {
    user: process.env.DB_USER || 'meto_pos',
    password: process.env.DB_PASSWORD || 'MetoPosPass123!',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'MultiBranchPOS_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

const jsonPath = path.resolve(__dirname, '../../meto-pos-default-rtdb-export.json');
if (!fs.existsSync(jsonPath)) {
    console.error('JSON export file not found at:', jsonPath);
    process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const dateKeys = ['date', 'timestamp', 'startTime', 'heldAt', 'purchaseDate', 'closingDate', 'loginTime'];
function flattenGroupedData(node) {
    const records = [];
    if (!node || typeof node !== 'object') return records;

    function traverse(current, id) {
        if (!current || typeof current !== 'object') return;
        if (dateKeys.some(k => current[k])) {
            records.push({ id, ...current });
            return;
        }
        for (const [k, v] of Object.entries(current)) {
            traverse(v, k);
        }
    }

    for (const [k, v] of Object.entries(node)) {
        traverse(v, k);
    }
    return records;
}

function parseDate(d) {
    if (!d) return new Date();
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function migrateAll() {
    console.log('====================================================');
    console.log('🚀 بدء عملية الترحيل الشاملة لكافة بيانات ملف JSON إلى SQL Server');
    console.log('====================================================\n');

    const pool = await sql.connect(sqlConfig);
    console.log('✅ تم الاتصال بقاعدة بيانات SQL Server (MultiBranchPOS_DB)\n');

    // 0. Clean old tables in reverse dependency order
    console.log('🧹 تنظيف الجداول لضمان عدم تكرار السجلات وتكامل العلاقات...');
    await pool.request().query(`
        DELETE FROM dbo.SalesInvoiceItems;
        DELETE FROM dbo.SalesInvoices;
        DELETE FROM dbo.SalesReturnItems;
        DELETE FROM dbo.SalesReturns;
        DELETE FROM dbo.PurchaseInvoiceItems;
        DELETE FROM dbo.PurchaseInvoices;
        DELETE FROM dbo.PurchaseReturnItems;
        DELETE FROM dbo.PurchaseReturns;
        DELETE FROM dbo.CustomerPayments;
        DELETE FROM dbo.SupplierPayments;
        DELETE FROM dbo.Expenses;
        DELETE FROM dbo.TreasuryTransactions;
        DELETE FROM dbo.StockInRecordItems;
        DELETE FROM dbo.StockInRecords;
        DELETE FROM dbo.StockAdjustmentItems;
        DELETE FROM dbo.StockAdjustmentRecords;
        DELETE FROM dbo.StockIssuesToReps;
        DELETE FROM dbo.StockReturnsFromReps;
        DELETE FROM dbo.CustomerVisits;
        DELETE FROM dbo.LoginHistory;
        DELETE FROM dbo.PosSessions;
        DELETE FROM dbo.BarcodeDesigns;
        DELETE FROM dbo.Licenses;
        DELETE FROM dbo.Customers;
        DELETE FROM dbo.Suppliers;
        DELETE FROM dbo.Items;
        DELETE FROM dbo.ItemSections;
        DELETE FROM dbo.InventorySections;
        DELETE FROM dbo.Warehouses;
        DELETE FROM dbo.CashAccounts;
        DELETE FROM dbo.Roles;
        DELETE FROM dbo.Counters;
        DELETE FROM dbo.AppSettings;
    `);
    console.log('✅ تم تجهيز الجداول بنجاح.\n');

    // 1. Warehouses
    console.log('1️⃣ ترحيل المخازن والفروع (Warehouses)...');
    let warehouseCount = 0;
    if (rawData.warehouses) {
        for (const [id, w] of Object.entries(rawData.warehouses)) {
            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('Code', sql.NVarChar(50), w.code || null)
                .input('Name', sql.NVarChar(255), w.name || 'Unnamed Warehouse')
                .input('Address', sql.NVarChar(500), w.address || null)
                .query(`
                    INSERT INTO dbo.Warehouses (Id, Code, Name, Address)
                    VALUES (@Id, @Code, @Name, @Address);
                `);
            warehouseCount++;
        }
    }
    console.log(`   - تم ترحيل ${warehouseCount} مخزن/فرع.`);

    // 2. InventorySections
    console.log('2️⃣ ترحيل أقسام المخزون (InventorySections)...');
    let invSecCount = 0;
    if (rawData.inventorySections) {
        for (const [id, s] of Object.entries(rawData.inventorySections)) {
            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('MainWarehouseId', sql.NVarChar(64), s.mainWarehouseId || null)
                .input('Name', sql.NVarChar(255), s.name || 'Unnamed Section')
                .input('Capacity', sql.Int, Number(s.capacity) || 0)
                .input('AllowOverfill', sql.Bit, s.allowOverfill !== false ? 1 : 0)
                .query(`
                    INSERT INTO dbo.InventorySections (Id, MainWarehouseId, Name, Capacity, AllowOverfill)
                    VALUES (@Id, @MainWarehouseId, @Name, @Capacity, @AllowOverfill);
                `);
            invSecCount++;
        }
    }
    console.log(`   - تم ترحيل ${invSecCount} قسم مخزني.`);

    // 3. ItemSections
    console.log('3️⃣ ترحيل أقسام الأصناف (ItemSections)...');
    let itemSecCount = 0;
    if (rawData.itemSections) {
        for (const [id, s] of Object.entries(rawData.itemSections)) {
            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('Code', sql.NVarChar(50), s.code || null)
                .input('Name', sql.NVarChar(255), s.name || 'Unnamed')
                .query(`
                    INSERT INTO dbo.ItemSections (Id, Code, Name)
                    VALUES (@Id, @Code, @Name);
                `);
            itemSecCount++;
        }
    }
    console.log(`   - تم ترحيل ${itemSecCount} قسم صنف.`);

    // 4. Items
    console.log('4️⃣ ترحيل دليل الأصناف (Items)...');
    let itemsCount = 0;
    if (rawData.items) {
        for (const [id, itm] of Object.entries(rawData.items)) {
            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('Code', sql.NVarChar(100), String(itm.code || id))
                .input('Name', sql.NVarChar(255), itm.name || 'Unnamed Item')
                .input('Cost', sql.Decimal(18, 4), Number(itm.cost) || 0)
                .input('Price', sql.Decimal(18, 4), Number(itm.price) || 0)
                .input('BaseUnit', sql.NVarChar(50), itm.baseUnit || 'piece')
                .input('ItemType', sql.NVarChar(50), itm.itemType || 'standard')
                .input('ReorderPoint', sql.Decimal(18, 4), Number(itm.reorderPoint) || 0)
                .input('SectionId', sql.NVarChar(64), itm.sectionId || null)
                .input('CategoryId', sql.NVarChar(64), itm.categoryId || null)
                .input('Barcode', sql.NVarChar(100), itm.barcode || String(itm.code || id))
                .input('BarcodeType', sql.NVarChar(50), itm.barcodeType || 'code128')
                .input('Color', sql.NVarChar(50), itm.color || null)
                .input('Size', sql.NVarChar(50), itm.size || null)
                .input('SecondaryUnitsJson', sql.NVarChar(sql.MAX), itm.secondaryUnits ? JSON.stringify(itm.secondaryUnits) : null)
                .input('ComponentsJson', sql.NVarChar(sql.MAX), itm.components ? JSON.stringify(itm.components) : null)
                .input('IsDisabled', sql.Bit, itm.isDisabled ? 1 : 0)
                .query(`
                    INSERT INTO dbo.Items (Id, Code, Name, Cost, Price, BaseUnit, ItemType, ReorderPoint, SectionId, CategoryId, Barcode, BarcodeType, Color, Size, SecondaryUnitsJson, ComponentsJson, IsDisabled)
                    VALUES (@Id, @Code, @Name, @Cost, @Price, @BaseUnit, @ItemType, @ReorderPoint, @SectionId, @CategoryId, @Barcode, @BarcodeType, @Color, @Size, @SecondaryUnitsJson, @ComponentsJson, @IsDisabled);
                `);
            itemsCount++;
        }
    }
    console.log(`   - تم ترحيل ${itemsCount} صنف بنجاح.`);

    // 5. Customers
    console.log('5️⃣ ترحيل دليل العملاء (Customers)...');
    let customersCount = 0;
    if (rawData.customers) {
        for (const [id, c] of Object.entries(rawData.customers)) {
            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('Name', sql.NVarChar(255), c.name || 'Unnamed Customer')
                .input('Phone', sql.NVarChar(50), c.phone || null)
                .input('Address', sql.NVarChar(500), c.address || null)
                .input('AllowCredit', sql.Bit, c.allowCredit !== false ? 1 : 0)
                .input('CreditLimit', sql.Decimal(18, 4), Number(c.creditLimit) || 0)
                .input('OpeningBalance', sql.Decimal(18, 4), Number(c.openingBalance) || 0)
                .input('CurrentBalance', sql.Decimal(18, 4), Number(c.currentBalance) || 0)
                .input('InvoiceCount', sql.Int, Number(c.invoiceCount) || 0)
                .query(`
                    INSERT INTO dbo.Customers (Id, Name, Phone, Address, AllowCredit, CreditLimit, OpeningBalance, CurrentBalance, InvoiceCount)
                    VALUES (@Id, @Name, @Phone, @Address, @AllowCredit, @CreditLimit, @OpeningBalance, @CurrentBalance, @InvoiceCount);
                `);
            customersCount++;
        }
    }
    console.log(`   - تم ترحيل ${customersCount} عميل بنجاح.`);

    // 6. Suppliers
    console.log('6️⃣ ترحيل دليل الموردين (Suppliers)...');
    let suppliersCount = 0;
    if (rawData.suppliers) {
        for (const [id, s] of Object.entries(rawData.suppliers)) {
            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('Name', sql.NVarChar(255), s.name || 'Unnamed Supplier')
                .input('Contact', sql.NVarChar(255), s.contact || null)
                .input('OpeningBalance', sql.Decimal(18, 4), Number(s.openingBalance) || 0)
                .input('ItemsJson', sql.NVarChar(sql.MAX), s.items ? JSON.stringify(s.items) : null)
                .query(`
                    INSERT INTO dbo.Suppliers (Id, Name, Contact, OpeningBalance, ItemsJson)
                    VALUES (@Id, @Name, @Contact, @OpeningBalance, @ItemsJson);
                `);
            suppliersCount++;
        }
    }
    console.log(`   - تم ترحيل ${suppliersCount} مورد بنجاح.`);

    // 7. CashAccounts
    console.log('7️⃣ ترحيل الخزائن وحسابات النقدية (CashAccounts)...');
    let cashAccountsCount = 0;
    if (rawData.cashAccounts) {
        for (const [id, ca] of Object.entries(rawData.cashAccounts)) {
            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('Name', sql.NVarChar(255), ca.name || 'Cash Account')
                .input('Type', sql.NVarChar(50), ca.type || 'drawer')
                .input('OpeningBalance', sql.Decimal(18, 4), Number(ca.openingBalance) || 0)
                .input('UserId', sql.NVarChar(64), ca.userId || null)
                .query(`
                    INSERT INTO dbo.CashAccounts (Id, Name, Type, OpeningBalance, UserId)
                    VALUES (@Id, @Name, @Type, @OpeningBalance, @UserId);
                `);
            cashAccountsCount++;
        }
    }
    console.log(`   - تم ترحيل ${cashAccountsCount} حساب نقدي/خزينة.`);

    // 8. Roles
    console.log('8️⃣ ترحيل أدوار وصلاحيات النظام (Roles)...');
    let rolesCount = 0;
    if (rawData.roles) {
        for (const [roleName, perms] of Object.entries(rawData.roles)) {
            await pool.request()
                .input('Id', sql.NVarChar(100), roleName)
                .input('PermissionsJson', sql.NVarChar(sql.MAX), JSON.stringify(perms))
                .query(`
                    INSERT INTO dbo.Roles (Id, PermissionsJson)
                    VALUES (@Id, @PermissionsJson);
                `);
            rolesCount++;
        }
    }
    console.log(`   - تم ترحيل ${rolesCount} مجموعة صلاحيات.`);

    // 9. Users (Preserving admin + importing json users)
    console.log('9️⃣ ترحيل المستخدمين وحسابات الدخول (Users)...');
    // Ensure default admin exists
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE LoginName = 'Admin' OR Id = 'user-admin-1')
        BEGIN
            INSERT INTO dbo.Users (Id, LoginName, Name, Password, Role, IsCashier, IsSalesRep, CanOpenOwnShift, CanDeleteFromCart, CanProcessReturn)
            VALUES ('user-admin-1', 'Admin', N'المدير العام', '200300400', N'مسؤول', 1, 1, 1, 1, 1);
        END
    `);

    let usersCount = 0;
    if (rawData.users) {
        for (const [id, u] of Object.entries(rawData.users)) {
            if (!u || typeof u !== 'object') continue;
            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('LoginName', sql.NVarChar(100), u.loginName || id)
                .input('Name', sql.NVarChar(255), u.name || 'User')
                .input('Password', sql.NVarChar(255), u.password || '123456')
                .input('Phone', sql.NVarChar(50), u.phone || null)
                .input('Role', sql.NVarChar(100), u.role || 'كاشير')
                .input('WarehouseIds', sql.NVarChar(sql.MAX), u.warehouseIds ? JSON.stringify(u.warehouseIds) : null)
                .input('Uid', sql.NVarChar(100), u.uid || id)
                .input('IsCashier', sql.Bit, u.isCashier ? 1 : 0)
                .input('IsDelivery', sql.Bit, u.isDelivery ? 1 : 0)
                .input('IsSalesRep', sql.Bit, u.isSalesRep ? 1 : 0)
                .input('CanOpenOwnShift', sql.Bit, u.canOpenOwnShift !== false ? 1 : 0)
                .input('CanDeleteFromCart', sql.Bit, u.canDeleteFromCart !== false ? 1 : 0)
                .input('CanProcessReturn', sql.Bit, u.canProcessReturn !== false ? 1 : 0)
                .input('CanCancelInvoice', sql.Bit, u.canCancelInvoice ? 1 : 0)
                .input('CanBypassScannerForReturn', sql.Bit, u.canBypassScannerForReturn ? 1 : 0)
                .input('IsDisabled', sql.Bit, u.isDisabled ? 1 : 0)
                .input('ThemeSettings', sql.NVarChar(sql.MAX), u.themeSettings ? JSON.stringify(u.themeSettings) : null)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Id = @Id)
                    INSERT INTO dbo.Users (
                        Id, LoginName, Name, Password, Phone, Role, WarehouseIds, Uid,
                        IsCashier, IsDelivery, IsSalesRep, CanOpenOwnShift, CanDeleteFromCart,
                        CanProcessReturn, CanCancelInvoice, CanBypassScannerForReturn, IsDisabled, ThemeSettings
                    )
                    VALUES (
                        @Id, @LoginName, @Name, @Password, @Phone, @Role, @WarehouseIds, @Uid,
                        @IsCashier, @IsDelivery, @IsSalesRep, @CanOpenOwnShift, @CanDeleteFromCart,
                        @CanProcessReturn, @CanCancelInvoice, @CanBypassScannerForReturn, @IsDisabled, @ThemeSettings
                    );
                `);
            usersCount++;
        }
    }
    console.log(`   - تم ترحيل ${usersCount} مستخدم بالإضافة إلى حساب المدير العام.`);

    // 10. BarcodeDesigns & Licenses
    console.log('🔟 ترحيل تصاميم الباركود والتراخيص...');
    if (rawData.barcodeDesigns) {
        for (const [id, bd] of Object.entries(rawData.barcodeDesigns)) {
            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('Name', sql.NVarChar(255), bd.name || 'Barcode Design')
                .input('ConfigJson', sql.NVarChar(sql.MAX), JSON.stringify(bd))
                .query(`
                    INSERT INTO dbo.BarcodeDesigns (Id, Name, ConfigJson)
                    VALUES (@Id, @Name, @ConfigJson);
                `);
        }
    }
    if (rawData.licenses) {
        for (const [id, lic] of Object.entries(rawData.licenses)) {
            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('Key', sql.NVarChar(100), lic.key || id)
                .input('StartDate', sql.DateTime2, parseDate(lic.startDate))
                .input('EndDate', sql.DateTime2, parseDate(lic.endDate))
                .input('Status', sql.NVarChar(50), lic.status || 'active')
                .input('MaxUsers', sql.Int, Number(lic.maxUsers) || 10)
                .input('EnabledModules', sql.NVarChar(sql.MAX), lic.enabledModules ? JSON.stringify(lic.enabledModules) : null)
                .query(`
                    INSERT INTO dbo.Licenses (Id, [Key], StartDate, EndDate, Status, MaxUsers, EnabledModules)
                    VALUES (@Id, @Key, @StartDate, @EndDate, @Status, @MaxUsers, @EnabledModules);
                `);
        }
    }
    console.log('   - تم ترحيل تصاميم الباركود والتراخيص.');

    // 11. Counters & Settings
    console.log('1️⃣1️⃣ ترحيل العدادات وإعدادات النظام...');
    if (rawData.counters) {
        for (const [name, val] of Object.entries(rawData.counters)) {
            await pool.request()
                .input('Name', sql.NVarChar(100), name)
                .input('CurrentValue', sql.BigInt, Number(val) || 0)
                .query(`
                    INSERT INTO dbo.Counters (Name, CurrentValue) VALUES (@Name, @CurrentValue);
                `);
        }
    }
    if (rawData.settings) {
        for (const [k, v] of Object.entries(rawData.settings)) {
            await pool.request()
                .input('SettingKey', sql.NVarChar(100), k)
                .input('SettingValue', sql.NVarChar(sql.MAX), JSON.stringify(v))
                .query(`
                    INSERT INTO dbo.AppSettings (SettingKey, SettingValue) VALUES (@SettingKey, @SettingValue);
                `);
        }
    }
    console.log('   - تم ترحيل العدادات والإعدادات.');

    // 12. PosSessions
    console.log('1️⃣2️⃣ ترحيل جلسات الكاشير (PosSessions)...');
    let sessionCount = 0;
    if (rawData.posSessions) {
        for (const [id, s] of Object.entries(rawData.posSessions)) {
            await pool.request()
                .input('Id', sql.NVarChar(64), id)
                .input('StartTime', sql.DateTime2, parseDate(s.startTime))
                .input('EndTime', sql.DateTime2, s.endTime ? parseDate(s.endTime) : null)
                .input('OpenedBy', sql.NVarChar(64), s.openedBy || null)
                .input('OpenedByName', sql.NVarChar(255), s.openedByName || null)
                .input('ClosedBy', sql.NVarChar(64), s.closedBy || null)
                .input('ClosedByName', sql.NVarChar(255), s.closedByName || null)
                .input('IsClosed', sql.Bit, s.isClosed ? 1 : 0)
                .input('PosTerminalId', sql.NVarChar(64), s.posTerminalId || null)
                .input('CashierSessionsJson', sql.NVarChar(sql.MAX), s.cashierSessions ? JSON.stringify(s.cashierSessions) : null)
                .query(`
                    INSERT INTO dbo.PosSessions (Id, StartTime, EndTime, OpenedBy, OpenedByName, ClosedBy, ClosedByName, IsClosed, PosTerminalId, CashierSessionsJson)
                    VALUES (@Id, @StartTime, @EndTime, @OpenedBy, @OpenedByName, @ClosedBy, @ClosedByName, @IsClosed, @PosTerminalId, @CashierSessionsJson);
                `);
            sessionCount++;
        }
    }
    console.log(`   - تم ترحيل ${sessionCount} جلسة كاشير.`);

    // 13. SalesInvoices & Line Items
    console.log('1️⃣3️⃣ ترحيل فواتير المبيعات وبنودها التفصيلية (Sales Invoices & Items)...');
    const salesInvoices = flattenGroupedData(rawData.salesInvoices);
    let totalSaleItems = 0;
    for (const inv of salesInvoices) {
        const itemsJson = inv.items ? JSON.stringify(inv.items) : null;
        await pool.request()
            .input('Id', sql.NVarChar(64), inv.id)
            .input('InvoiceNumber', sql.NVarChar(100), inv.invoiceNumber ? String(inv.invoiceNumber) : null)
            .input('Date', sql.DateTime2, parseDate(inv.date))
            .input('CustomerId', sql.NVarChar(64), inv.customerId || null)
            .input('CustomerName', sql.NVarChar(255), inv.customerName || null)
            .input('WarehouseId', sql.NVarChar(64), inv.warehouseId || null)
            .input('SalesRepId', sql.NVarChar(64), inv.salesRepId || null)
            .input('CashierId', sql.NVarChar(64), inv.cashierId || null)
            .input('Subtotal', sql.Decimal(18, 4), Number(inv.subtotal) || 0)
            .input('Discount', sql.Decimal(18, 4), Number(inv.discount) || 0)
            .input('Tax', sql.Decimal(18, 4), Number(inv.tax) || 0)
            .input('Total', sql.Decimal(18, 4), Number(inv.total) || 0)
            .input('PaidAmount', sql.Decimal(18, 4), Number(inv.paidAmount) || 0)
            .input('PaidToAccountId', sql.NVarChar(64), inv.paidToAccountId || null)
            .input('Status', sql.NVarChar(50), inv.status || 'approved')
            .input('IsDelivery', sql.Bit, inv.isDelivery ? 1 : 0)
            .input('DeliveryReconciled', sql.Bit, inv.deliveryReconciled ? 1 : 0)
            .input('IsTaxIncluded', sql.Bit, inv.isTaxIncluded ? 1 : 0)
            .input('Notes', sql.NVarChar(sql.MAX), inv.notes || null)
            .input('ItemsJson', sql.NVarChar(sql.MAX), itemsJson)
            .query(`
                INSERT INTO dbo.SalesInvoices (
                    Id, InvoiceNumber, Date, CustomerId, CustomerName, WarehouseId, SalesRepId, CashierId,
                    Subtotal, Discount, Tax, Total, PaidAmount, PaidToAccountId, Status, IsDelivery,
                    DeliveryReconciled, IsTaxIncluded, Notes, ItemsJson
                )
                VALUES (
                    @Id, @InvoiceNumber, @Date, @CustomerId, @CustomerName, @WarehouseId, @SalesRepId, @CashierId,
                    @Subtotal, @Discount, @Tax, @Total, @PaidAmount, @PaidToAccountId, @Status, @IsDelivery,
                    @DeliveryReconciled, @IsTaxIncluded, @Notes, @ItemsJson
                );
            `);

        if (Array.isArray(inv.items)) {
            for (const item of inv.items) {
                await pool.request()
                    .input('InvoiceId', sql.NVarChar(64), inv.id)
                    .input('ItemId', sql.NVarChar(64), item.id || item.itemId || null)
                    .input('ItemCode', sql.NVarChar(100), item.code ? String(item.code) : null)
                    .input('ItemName', sql.NVarChar(255), item.name || 'Item')
                    .input('Qty', sql.Decimal(18, 4), Number(item.qty) || 1)
                    .input('Price', sql.Decimal(18, 4), Number(item.price) || 0)
                    .input('Cost', sql.Decimal(18, 4), Number(item.cost) || 0)
                    .input('Total', sql.Decimal(18, 4), Number(item.total) || 0)
                    .query(`
                        INSERT INTO dbo.SalesInvoiceItems (InvoiceId, ItemId, ItemCode, ItemName, Qty, Price, Cost, Total)
                        VALUES (@InvoiceId, @ItemId, @ItemCode, @ItemName, @Qty, @Price, @Cost, @Total);
                    `);
                totalSaleItems++;
            }
        }
    }
    console.log(`   - تم ترحيل ${salesInvoices.length} فاتورة مبيعات بإجمالي ${totalSaleItems} بند تفصيلي.`);

    // 14. CustomerPayments
    console.log('1️⃣4️⃣ ترحيل مقبوضات وسندات دفع العملاء (Customer Payments)...');
    const custPayments = flattenGroupedData(rawData.customerPayments);
    for (const p of custPayments) {
        await pool.request()
            .input('Id', sql.NVarChar(64), p.id)
            .input('ReceiptNumber', sql.NVarChar(100), p.receiptNumber ? String(p.receiptNumber) : null)
            .input('Date', sql.DateTime2, parseDate(p.date))
            .input('CustomerId', sql.NVarChar(64), p.customerId || '')
            .input('InvoiceId', sql.NVarChar(64), p.invoiceId || null)
            .input('Amount', sql.Decimal(18, 4), Number(p.amount) || 0)
            .input('PaidToAccountId', sql.NVarChar(64), p.paidToAccountId || 'main-cash')
            .input('CreatedById', sql.NVarChar(64), p.createdById || null)
            .input('CreatedByName', sql.NVarChar(255), p.createdByName || null)
            .input('Notes', sql.NVarChar(sql.MAX), p.notes || null)
            .query(`
                INSERT INTO dbo.CustomerPayments (Id, ReceiptNumber, Date, CustomerId, InvoiceId, Amount, PaidToAccountId, CreatedById, CreatedByName, Notes)
                VALUES (@Id, @ReceiptNumber, @Date, @CustomerId, @InvoiceId, @Amount, @PaidToAccountId, @CreatedById, @CreatedByName, @Notes);
            `);
    }
    console.log(`   - تم ترحيل ${custPayments.length} سند قبض عميل.`);

    // 15. PurchaseInvoices & Line Items
    console.log('1️⃣5️⃣ ترحيل فواتير المشتريات وبنودها (Purchase Invoices & Items)...');
    const purchaseInvoices = flattenGroupedData(rawData.purchaseInvoices);
    let totalPurchItems = 0;
    for (const inv of purchaseInvoices) {
        const itemsJson = inv.items ? JSON.stringify(inv.items) : null;
        await pool.request()
            .input('Id', sql.NVarChar(64), inv.id)
            .input('InvoiceNumber', sql.NVarChar(100), inv.invoiceNumber ? String(inv.invoiceNumber) : null)
            .input('BatchNumber', sql.NVarChar(100), inv.batchNumber ? String(inv.batchNumber) : null)
            .input('Date', sql.DateTime2, parseDate(inv.date))
            .input('DueDate', sql.DateTime2, inv.dueDate ? parseDate(inv.dueDate) : null)
            .input('SupplierId', sql.NVarChar(64), inv.supplierId || null)
            .input('SupplierName', sql.NVarChar(255), inv.supplierName || null)
            .input('WarehouseId', sql.NVarChar(64), inv.warehouseId || null)
            .input('CreatedById', sql.NVarChar(64), inv.createdById || null)
            .input('CreatedByName', sql.NVarChar(255), inv.createdByName || null)
            .input('Subtotal', sql.Decimal(18, 4), Number(inv.subtotal) || 0)
            .input('Discount', sql.Decimal(18, 4), Number(inv.discount) || 0)
            .input('Tax', sql.Decimal(18, 4), Number(inv.tax) || 0)
            .input('Total', sql.Decimal(18, 4), Number(inv.total) || 0)
            .input('PaidAmount', sql.Decimal(18, 4), Number(inv.paidAmount) || 0)
            .input('PaidFromAccountId', sql.NVarChar(64), inv.paidFromAccountId || null)
            .input('IsTaxIncluded', sql.Bit, inv.isTaxIncluded ? 1 : 0)
            .input('Notes', sql.NVarChar(sql.MAX), inv.notes || null)
            .input('ItemsJson', sql.NVarChar(sql.MAX), itemsJson)
            .query(`
                INSERT INTO dbo.PurchaseInvoices (
                    Id, InvoiceNumber, BatchNumber, Date, DueDate, SupplierId, SupplierName, WarehouseId,
                    CreatedById, CreatedByName, Subtotal, Discount, Tax, Total, PaidAmount, PaidFromAccountId,
                    IsTaxIncluded, Notes, ItemsJson
                )
                VALUES (
                    @Id, @InvoiceNumber, @BatchNumber, @Date, @DueDate, @SupplierId, @SupplierName, @WarehouseId,
                    @CreatedById, @CreatedByName, @Subtotal, @Discount, @Tax, @Total, @PaidAmount, @PaidFromAccountId,
                    @IsTaxIncluded, @Notes, @ItemsJson
                );
            `);

        if (Array.isArray(inv.items)) {
            for (const item of inv.items) {
                await pool.request()
                    .input('PurchaseInvoiceId', sql.NVarChar(64), inv.id)
                    .input('ItemId', sql.NVarChar(64), item.id || item.itemId || null)
                    .input('ItemCode', sql.NVarChar(100), item.code ? String(item.code) : null)
                    .input('ItemName', sql.NVarChar(255), item.name || 'Item')
                    .input('Qty', sql.Decimal(18, 4), Number(item.qty) || 1)
                    .input('OriginalQty', sql.Decimal(18, 4), Number(item.originalQty) || null)
                    .input('OriginalUnit', sql.NVarChar(50), item.originalUnit || null)
                    .input('ConversionFactor', sql.Decimal(18, 4), Number(item.conversionFactor) || 1)
                    .input('Cost', sql.Decimal(18, 4), Number(item.cost) || 0)
                    .input('SellingPrice', sql.Decimal(18, 4), Number(item.sellingPrice) || 0)
                    .input('Total', sql.Decimal(18, 4), Number(item.total) || 0)
                    .query(`
                        INSERT INTO dbo.PurchaseInvoiceItems (PurchaseInvoiceId, ItemId, ItemCode, ItemName, Qty, OriginalQty, OriginalUnit, ConversionFactor, Cost, SellingPrice, Total)
                        VALUES (@PurchaseInvoiceId, @ItemId, @ItemCode, @ItemName, @Qty, @OriginalQty, @OriginalUnit, @ConversionFactor, @Cost, @SellingPrice, @Total);
                    `);
                totalPurchItems++;
            }
        }
    }
    console.log(`   - تم ترحيل ${purchaseInvoices.length} فاتورة شراء بإجمالي ${totalPurchItems} بند.`);

    // 16. PurchaseReturns
    console.log('1️⃣6️⃣ ترحيل مرتجعات المشتريات (Purchase Returns)...');
    const purchaseReturns = flattenGroupedData(rawData.purchaseReturns);
    for (const pr of purchaseReturns) {
        const itemsJson = pr.items ? JSON.stringify(pr.items) : null;
        await pool.request()
            .input('Id', sql.NVarChar(64), pr.id)
            .input('ReceiptNumber', sql.NVarChar(100), pr.receiptNumber ? String(pr.receiptNumber) : null)
            .input('OriginalInvoiceId', sql.NVarChar(64), pr.originalInvoiceId || null)
            .input('Date', sql.DateTime2, parseDate(pr.date))
            .input('SupplierId', sql.NVarChar(64), pr.supplierId || null)
            .input('WarehouseId', sql.NVarChar(64), pr.warehouseId || null)
            .input('CreatedById', sql.NVarChar(64), pr.createdById || null)
            .input('CreatedByName', sql.NVarChar(255), pr.createdByName || null)
            .input('Subtotal', sql.Decimal(18, 4), Number(pr.subtotal) || 0)
            .input('Discount', sql.Decimal(18, 4), Number(pr.discount) || 0)
            .input('Total', sql.Decimal(18, 4), Number(pr.total) || 0)
            .input('PaidAmount', sql.Decimal(18, 4), Number(pr.paidAmount) || 0)
            .input('PaidToAccountId', sql.NVarChar(64), pr.paidToAccountId || null)
            .input('Notes', sql.NVarChar(sql.MAX), pr.notes || null)
            .input('ItemsJson', sql.NVarChar(sql.MAX), itemsJson)
            .query(`
                INSERT INTO dbo.PurchaseReturns (Id, ReceiptNumber, OriginalInvoiceId, Date, SupplierId, WarehouseId, CreatedById, CreatedByName, Subtotal, Discount, Total, PaidAmount, PaidToAccountId, Notes, ItemsJson)
                VALUES (@Id, @ReceiptNumber, @OriginalInvoiceId, @Date, @SupplierId, @WarehouseId, @CreatedById, @CreatedByName, @Subtotal, @Discount, @Total, @PaidAmount, @PaidToAccountId, @Notes, @ItemsJson);
            `);

        if (Array.isArray(pr.items)) {
            for (const item of pr.items) {
                await pool.request()
                    .input('ReturnId', sql.NVarChar(64), pr.id)
                    .input('ItemId', sql.NVarChar(64), item.id || item.itemId || null)
                    .input('ItemCode', sql.NVarChar(100), item.code ? String(item.code) : null)
                    .input('ItemName', sql.NVarChar(255), item.name || 'Item')
                    .input('Qty', sql.Decimal(18, 4), Number(item.qty) || 1)
                    .input('Cost', sql.Decimal(18, 4), Number(item.cost) || 0)
                    .input('Total', sql.Decimal(18, 4), Number(item.total) || 0)
                    .query(`
                        INSERT INTO dbo.PurchaseReturnItems (ReturnId, ItemId, ItemCode, ItemName, Qty, Cost, Total)
                        VALUES (@ReturnId, @ItemId, @ItemCode, @ItemName, @Qty, @Cost, @Total);
                    `);
            }
        }
    }
    console.log(`   - تم ترحيل ${purchaseReturns.length} إذن مرتجع مشتريات.`);

    // 17. SupplierPayments
    console.log('1️⃣7️⃣ ترحيل مدفوعات الموردين (Supplier Payments)...');
    const suppPayments = flattenGroupedData(rawData.supplierPayments);
    for (const p of suppPayments) {
        await pool.request()
            .input('Id', sql.NVarChar(64), p.id)
            .input('ReceiptNumber', sql.NVarChar(100), p.receiptNumber ? String(p.receiptNumber) : null)
            .input('Date', sql.DateTime2, parseDate(p.date))
            .input('SupplierId', sql.NVarChar(64), p.supplierId || '')
            .input('InvoiceId', sql.NVarChar(64), p.invoiceId || null)
            .input('Amount', sql.Decimal(18, 4), Number(p.amount) || 0)
            .input('PaidFromAccountId', sql.NVarChar(64), p.paidFromAccountId || 'main-cash')
            .input('CreatedById', sql.NVarChar(64), p.createdById || null)
            .input('CreatedByName', sql.NVarChar(255), p.createdByName || null)
            .input('Notes', sql.NVarChar(sql.MAX), p.notes || null)
            .query(`
                INSERT INTO dbo.SupplierPayments (Id, ReceiptNumber, Date, SupplierId, InvoiceId, Amount, PaidFromAccountId, CreatedById, CreatedByName, Notes)
                VALUES (@Id, @ReceiptNumber, @Date, @SupplierId, @InvoiceId, @Amount, @PaidFromAccountId, @CreatedById, @CreatedByName, @Notes);
            `);
    }
    console.log(`   - تم ترحيل ${suppPayments.length} سند صرف مورد.`);

    // 18. Expenses
    console.log('1️⃣8️⃣ ترحيل سندات المصروفات (Expenses)...');
    const expenses = flattenGroupedData(rawData.expenses);
    for (const ex of expenses) {
        await pool.request()
            .input('Id', sql.NVarChar(64), ex.id)
            .input('ReceiptNumber', sql.NVarChar(100), ex.receiptNumber ? String(ex.receiptNumber) : null)
            .input('Date', sql.DateTime2, parseDate(ex.date))
            .input('ExpenseType', sql.NVarChar(100), ex.expenseType || null)
            .input('Description', sql.NVarChar(500), ex.description || null)
            .input('Amount', sql.Decimal(18, 4), Number(ex.amount) || 0)
            .input('TaxAmount', sql.Decimal(18, 4), Number(ex.taxAmount) || 0)
            .input('WarehouseId', sql.NVarChar(64), ex.warehouseId || null)
            .input('PaidFromAccountId', sql.NVarChar(64), ex.paidFromAccountId || null)
            .input('Status', sql.NVarChar(50), ex.status || 'completed')
            .input('CreatedById', sql.NVarChar(64), ex.createdById || null)
            .input('CreatedByName', sql.NVarChar(255), ex.createdByName || null)
            .query(`
                INSERT INTO dbo.Expenses (Id, ReceiptNumber, Date, ExpenseType, Description, Amount, TaxAmount, WarehouseId, PaidFromAccountId, Status, CreatedById, CreatedByName)
                VALUES (@Id, @ReceiptNumber, @Date, @ExpenseType, @Description, @Amount, @TaxAmount, @WarehouseId, @PaidFromAccountId, @Status, @CreatedById, @CreatedByName);
            `);
    }
    console.log(`   - تم ترحيل ${expenses.length} سند مصروف.`);

    // 19. SalesReturns
    console.log('1️⃣9️⃣ ترحيل مرتجعات المبيعات (Sales Returns)...');
    const salesReturns = flattenGroupedData(rawData.salesReturns);
    let totalSaleReturnItems = 0;
    for (const sr of salesReturns) {
        const itemsJson = sr.items ? JSON.stringify(sr.items) : null;
        await pool.request()
            .input('Id', sql.NVarChar(64), sr.id)
            .input('ReceiptNumber', sql.NVarChar(100), sr.receiptNumber ? String(sr.receiptNumber) : null)
            .input('OriginalInvoiceId', sql.NVarChar(64), sr.originalInvoiceId || null)
            .input('Date', sql.DateTime2, parseDate(sr.date))
            .input('CustomerId', sql.NVarChar(64), sr.customerId || null)
            .input('WarehouseId', sql.NVarChar(64), sr.warehouseId || null)
            .input('CreatedById', sql.NVarChar(64), sr.createdById || null)
            .input('CreatedByName', sql.NVarChar(255), sr.createdByName || null)
            .input('Subtotal', sql.Decimal(18, 4), Number(sr.subtotal) || 0)
            .input('Total', sql.Decimal(18, 4), Number(sr.total) || 0)
            .input('PaidAmount', sql.Decimal(18, 4), Number(sr.paidAmount) || 0)
            .input('PaidFromAccountId', sql.NVarChar(64), sr.paidFromAccountId || null)
            .input('Notes', sql.NVarChar(sql.MAX), sr.notes || null)
            .input('ItemsJson', sql.NVarChar(sql.MAX), itemsJson)
            .query(`
                INSERT INTO dbo.SalesReturns (Id, ReceiptNumber, OriginalInvoiceId, Date, CustomerId, WarehouseId, CreatedById, CreatedByName, Subtotal, Total, PaidAmount, PaidFromAccountId, Notes, ItemsJson)
                VALUES (@Id, @ReceiptNumber, @OriginalInvoiceId, @Date, @CustomerId, @WarehouseId, @CreatedById, @CreatedByName, @Subtotal, @Total, @PaidAmount, @PaidFromAccountId, @Notes, @ItemsJson);
            `);

        if (Array.isArray(sr.items)) {
            for (const item of sr.items) {
                await pool.request()
                    .input('ReturnId', sql.NVarChar(64), sr.id)
                    .input('ItemId', sql.NVarChar(64), item.id || item.itemId || null)
                    .input('ItemCode', sql.NVarChar(100), item.code ? String(item.code) : null)
                    .input('ItemName', sql.NVarChar(255), item.name || 'Item')
                    .input('Qty', sql.Decimal(18, 4), Number(item.qty) || 1)
                    .input('Price', sql.Decimal(18, 4), Number(item.price) || 0)
                    .input('Cost', sql.Decimal(18, 4), Number(item.cost) || 0)
                    .input('Total', sql.Decimal(18, 4), Number(item.total) || 0)
                    .query(`
                        INSERT INTO dbo.SalesReturnItems (ReturnId, ItemId, ItemCode, ItemName, Qty, Price, Cost, Total)
                        VALUES (@ReturnId, @ItemId, @ItemCode, @ItemName, @Qty, @Price, @Cost, @Total);
                    `);
                totalSaleReturnItems++;
            }
        }
    }
    console.log(`   - تم ترحيل ${salesReturns.length} إذن مرتجع مبيعات بإجمالي ${totalSaleReturnItems} بند.`);

    // 20. StockInRecords
    console.log('2️⃣0️⃣ ترحيل أذون الإضافة المخزنية (Stock In Records)...');
    const stockInList = flattenGroupedData(rawData.stockInRecords);
    let totalStockInItems = 0;
    for (const si of stockInList) {
        const itemsJson = si.items ? JSON.stringify(si.items) : null;
        await pool.request()
            .input('Id', sql.NVarChar(64), si.id)
            .input('ReceiptNumber', sql.NVarChar(100), si.receiptNumber ? String(si.receiptNumber) : null)
            .input('BatchNumber', sql.NVarChar(100), si.batchNumber ? String(si.batchNumber) : null)
            .input('Date', sql.DateTime2, parseDate(si.date))
            .input('WarehouseId', sql.NVarChar(64), si.warehouseId || 'main-wh')
            .input('PurchaseInvoiceId', sql.NVarChar(64), si.purchaseInvoiceId || null)
            .input('Reason', sql.NVarChar(100), si.reason || 'manual')
            .input('Status', sql.NVarChar(50), si.status || 'completed')
            .input('Notes', sql.NVarChar(sql.MAX), si.notes || null)
            .input('ItemsJson', sql.NVarChar(sql.MAX), itemsJson)
            .query(`
                INSERT INTO dbo.StockInRecords (Id, ReceiptNumber, BatchNumber, Date, WarehouseId, PurchaseInvoiceId, Reason, Status, Notes, ItemsJson)
                VALUES (@Id, @ReceiptNumber, @BatchNumber, @Date, @WarehouseId, @PurchaseInvoiceId, @Reason, @Status, @Notes, @ItemsJson);
            `);

        if (Array.isArray(si.items)) {
            for (const item of si.items) {
                await pool.request()
                    .input('StockInId', sql.NVarChar(64), si.id)
                    .input('ItemId', sql.NVarChar(64), item.id || item.itemId || null)
                    .input('ItemCode', sql.NVarChar(100), item.code ? String(item.code) : null)
                    .input('ItemName', sql.NVarChar(255), item.name || 'Item')
                    .input('Qty', sql.Decimal(18, 4), Number(item.qty) || 1)
                    .input('Cost', sql.Decimal(18, 4), Number(item.cost) || 0)
                    .input('Total', sql.Decimal(18, 4), Number(item.total) || 0)
                    .query(`
                        INSERT INTO dbo.StockInRecordItems (StockInId, ItemId, ItemCode, ItemName, Qty, Cost, Total)
                        VALUES (@StockInId, @ItemId, @ItemCode, @ItemName, @Qty, @Cost, @Total);
                    `);
                totalStockInItems++;
            }
        }
    }
    console.log(`   - تم ترحيل ${stockInList.length} إذن إضافة مخزنية بإجمالي ${totalStockInItems} بند.`);

    // 21. StockAdjustmentRecords
    console.log('2️⃣1️⃣ ترحيل أذون التسوية والجرد المخزني (Stock Adjustments)...');
    const stockAdjList = flattenGroupedData(rawData.stockAdjustmentRecords);
    let totalStockAdjItems = 0;
    for (const sa of stockAdjList) {
        const itemsJson = sa.items ? JSON.stringify(sa.items) : null;
        await pool.request()
            .input('Id', sql.NVarChar(64), sa.id)
            .input('ReceiptNumber', sql.NVarChar(100), sa.receiptNumber ? String(sa.receiptNumber) : null)
            .input('Date', sql.DateTime2, parseDate(sa.date))
            .input('WarehouseId', sql.NVarChar(64), sa.warehouseId || 'main-wh')
            .input('Reason', sql.NVarChar(100), sa.reason || 'reconciliation')
            .input('CreatedById', sql.NVarChar(64), sa.createdById || null)
            .input('CreatedByName', sql.NVarChar(255), sa.createdByName || null)
            .input('Notes', sql.NVarChar(sql.MAX), sa.notes || null)
            .input('ItemsJson', sql.NVarChar(sql.MAX), itemsJson)
            .query(`
                INSERT INTO dbo.StockAdjustmentRecords (Id, ReceiptNumber, Date, WarehouseId, Reason, CreatedById, CreatedByName, Notes, ItemsJson)
                VALUES (@Id, @ReceiptNumber, @Date, @WarehouseId, @Reason, @CreatedById, @CreatedByName, @Notes, @ItemsJson);
            `);

        if (Array.isArray(sa.items)) {
            for (const item of sa.items) {
                await pool.request()
                    .input('AdjustmentId', sql.NVarChar(64), sa.id)
                    .input('ItemId', sql.NVarChar(64), item.id || item.itemId || null)
                    .input('ItemName', sql.NVarChar(255), item.name || 'Item')
                    .input('SystemQty', sql.Decimal(18, 4), Number(item.systemQty) || 0)
                    .input('ActualQty', sql.Decimal(18, 4), Number(item.actualQty) || 0)
                    .input('Difference', sql.Decimal(18, 4), Number(item.difference) || 0)
                    .query(`
                        INSERT INTO dbo.StockAdjustmentItems (AdjustmentId, ItemId, ItemName, SystemQty, ActualQty, Difference)
                        VALUES (@AdjustmentId, @ItemId, @ItemName, @SystemQty, @ActualQty, @Difference);
                    `);
                totalStockAdjItems++;
            }
        }
    }
    console.log(`   - تم ترحيل ${stockAdjList.length} إذن تسوية وجرد بإجمالي ${totalStockAdjItems} بند.`);

    // 22. TreasuryTransactions
    console.log('2️⃣2️⃣ ترحيل حركات الخزينة وسندات الإيداع (Treasury Transactions)...');
    const treasuryList = flattenGroupedData(rawData.treasuryTransactions);
    for (const tt of treasuryList) {
        await pool.request()
            .input('Id', sql.NVarChar(64), tt.id)
            .input('ReceiptNumber', sql.NVarChar(100), tt.receiptNumber ? String(tt.receiptNumber) : null)
            .input('Date', sql.DateTime2, parseDate(tt.date))
            .input('AccountId', sql.NVarChar(64), tt.accountId || 'main-cash')
            .input('Type', sql.NVarChar(50), tt.type || 'deposit')
            .input('Amount', sql.Decimal(18, 4), Number(tt.amount) || 0)
            .input('Description', sql.NVarChar(500), tt.description || null)
            .input('LinkedTransactionId', sql.NVarChar(64), tt.linkedTransactionId || null)
            .input('CreatedById', sql.NVarChar(64), tt.createdById || null)
            .input('CreatedByName', sql.NVarChar(255), tt.createdByName || null)
            .query(`
                INSERT INTO dbo.TreasuryTransactions (Id, ReceiptNumber, Date, AccountId, Type, Amount, Description, LinkedTransactionId, CreatedById, CreatedByName)
                VALUES (@Id, @ReceiptNumber, @Date, @AccountId, @Type, @Amount, @Description, @LinkedTransactionId, @CreatedById, @CreatedByName);
            `);
    }
    console.log(`   - تم ترحيل ${treasuryList.length} حركة خزينة.`);

    // 23. CustomerVisits & LoginHistory
    console.log('2️⃣3️⃣ ترحيل زيارات العملاء وسجل تسجيل الدخول (Audit Logs)...');
    const visitList = flattenGroupedData(rawData.customerVisits);
    for (const v of visitList) {
        await pool.request()
            .input('Id', sql.NVarChar(64), v.id)
            .input('SalesRepId', sql.NVarChar(64), v.salesRepId || null)
            .input('SalesRepName', sql.NVarChar(255), v.salesRepName || null)
            .input('CustomerName', sql.NVarChar(255), v.customerName || null)
            .input('Timestamp', sql.DateTime2, parseDate(v.timestamp || v.date))
            .input('Location', sql.NVarChar(500), v.location ? JSON.stringify(v.location) : null)
            .input('Notes', sql.NVarChar(sql.MAX), v.notes || null)
            .query(`
                INSERT INTO dbo.CustomerVisits (Id, SalesRepId, SalesRepName, CustomerName, Timestamp, Location, Notes)
                VALUES (@Id, @SalesRepId, @SalesRepName, @CustomerName, @Timestamp, @Location, @Notes);
            `);
    }

    const loginList = flattenGroupedData(rawData.loginHistory);
    for (const lh of loginList) {
        await pool.request()
            .input('Id', sql.NVarChar(64), lh.id)
            .input('UserId', sql.NVarChar(64), lh.userId || null)
            .input('UserName', sql.NVarChar(255), lh.userName || null)
            .input('Timestamp', sql.DateTime2, parseDate(lh.timestamp || lh.loginTime))
            .input('Latitude', sql.Decimal(10, 7), Number(lh.latitude) || null)
            .input('Longitude', sql.Decimal(10, 7), Number(lh.longitude) || null)
            .query(`
                INSERT INTO dbo.LoginHistory (Id, UserId, UserName, Timestamp, Latitude, Longitude)
                VALUES (@Id, @UserId, @UserName, @Timestamp, @Latitude, @Longitude);
            `);
    }
    console.log(`   - تم ترحيل ${visitList.length} زيارة عملاء و ${loginList.length} سجل دخول.`);

    console.log('\n========================================================');
    console.log('🎉 اكتملت عملية ترحيل كافة البيانات من JSON إلى SQL بنجاح تام 100%!');
    console.log('========================================================\n');

    // Final count verification from SQL Server
    const checkCounts = await pool.request().query(`
        SELECT 
            (SELECT COUNT(*) FROM dbo.Warehouses) AS Warehouses,
            (SELECT COUNT(*) FROM dbo.Items) AS Items,
            (SELECT COUNT(*) FROM dbo.Customers) AS Customers,
            (SELECT COUNT(*) FROM dbo.Suppliers) AS Suppliers,
            (SELECT COUNT(*) FROM dbo.CashAccounts) AS CashAccounts,
            (SELECT COUNT(*) FROM dbo.Users) AS Users,
            (SELECT COUNT(*) FROM dbo.SalesInvoices) AS SalesInvoices,
            (SELECT COUNT(*) FROM dbo.SalesInvoiceItems) AS SalesInvoiceItems,
            (SELECT COUNT(*) FROM dbo.SalesReturns) AS SalesReturns,
            (SELECT COUNT(*) FROM dbo.PurchaseInvoices) AS PurchaseInvoices,
            (SELECT COUNT(*) FROM dbo.PurchaseInvoiceItems) AS PurchaseInvoiceItems,
            (SELECT COUNT(*) FROM dbo.CustomerPayments) AS CustomerPayments,
            (SELECT COUNT(*) FROM dbo.SupplierPayments) AS SupplierPayments,
            (SELECT COUNT(*) FROM dbo.Expenses) AS Expenses,
            (SELECT COUNT(*) FROM dbo.StockInRecords) AS StockInRecords,
            (SELECT COUNT(*) FROM dbo.StockAdjustmentRecords) AS StockAdjustmentRecords,
            (SELECT COUNT(*) FROM dbo.TreasuryTransactions) AS TreasuryTransactions
    `);

    console.log('📊 الإحصائيات الختامية للجداول في قاعدة البيانات:');
    console.table(checkCounts.recordset[0]);

    await pool.close();
}

migrateAll().catch(err => {
    console.error('❌ خطأ أثناء عملية الترحيل:', err);
    process.exit(1);
});
