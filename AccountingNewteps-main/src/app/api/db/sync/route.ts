import { NextResponse } from 'next/server';
import { getDbPool, getLocalDbConfig } from '@/lib/db';
import { logSystemError } from '@/lib/error-logger';

export const dynamic = 'force-dynamic';

export async function GET() {
    const localCfg = getLocalDbConfig();
    const serverName = String(localCfg.server || '').toLowerCase().trim();
    if (serverName === 'indexeddb' || serverName.includes('indexeddb') || serverName === 'browser') {
        return NextResponse.json({
            success: true,
            isIndexedDb: true,
            data: null,
            message: 'وضع المتصفح الذكي (IndexedDB + Firebase) نشط'
        });
    }

    try {
        const pool = await getDbPool();

        // 1. Core Master Data
        const [
            warehousesRes, inventorySectionsRes, itemSectionsRes, itemCategoriesRes,
            itemsRes, customersRes, suppliersRes, cashAccountsRes, rolesRes, usersRes,
            settingsRes, countersRes, posSessionsRes, barcodeDesignsRes, posTerminalsRes,
            paymentMethodsRes, partnersRes, employeesRes, licensesRes,
            // 2. Commercial Transactions
            salesInvoicesRes, salesReturnsRes, purchaseInvoicesRes, purchaseReturnsRes,
            purchaseOrdersRes, requisitionsRes,
            // 3. Financial Vouchers
            customerPaymentsRes, supplierPaymentsRes, expensesRes, treasuryTxRes,
            exceptionalIncomesRes, profitDistributionsRes, repRemittancesRes, employeeAdvancesRes,
            employeeAdjustmentsRes, payrollRes,
            // 4. Inventory Documents
            stockInRes, stockOutRes, stockTransferRes, stockAdjRes,
            stockIssuesRes, stockReturnsFromRepsRes, inventoryClosingsRes,
            // 5. Assets & POS Operational
            fixedAssetsRes, depreciationRecordsRes, heldInvoicesRes, posAuditLogsRes,
            restaurantTablesRes, promotionsRes, targetsRes, deliveryStaffRes, sellersRes,
            itemGroupsRes, itemColorsRes, itemSizesRes, priceChangeLogsRes, customerVisitsRes, loginHistoryRes,
            // 6. Upgrades
            gratuityLogsRes, gratuityDistributionsRes, itemSubCategories1Res, itemSubCategories2Res, inventoryZonesRes,
            snoozedRecsRes
        ] = await Promise.all([
            pool.request().query('SELECT * FROM dbo.Warehouses ORDER BY Name'),
            pool.request().query('SELECT * FROM dbo.InventorySections'),
            pool.request().query('SELECT * FROM dbo.ItemSections'),
            pool.request().query('SELECT * FROM dbo.ItemCategories'),
            pool.request().query('SELECT * FROM dbo.Items WHERE IsDisabled = 0 ORDER BY Name'),
            pool.request().query('SELECT * FROM dbo.Customers ORDER BY Name'),
            pool.request().query('SELECT * FROM dbo.Suppliers ORDER BY Name'),
            pool.request().query('SELECT * FROM dbo.CashAccounts ORDER BY Name'),
            pool.request().query('SELECT * FROM dbo.Roles'),
            pool.request().query('SELECT * FROM dbo.Users WHERE IsDisabled = 0'),
            pool.request().query('SELECT * FROM dbo.AppSettings'),
            pool.request().query('SELECT * FROM dbo.Counters'),
            pool.request().query('SELECT * FROM dbo.PosSessions ORDER BY StartTime DESC'),
            pool.request().query('SELECT * FROM dbo.BarcodeDesigns'),
            pool.request().query('SELECT * FROM dbo.PosTerminals'),
            pool.request().query('SELECT * FROM dbo.PaymentMethods'),
            pool.request().query('SELECT * FROM dbo.Partners'),
            pool.request().query('SELECT * FROM dbo.Employees'),
            pool.request().query('SELECT * FROM dbo.Licenses'),
            // Transactions
            pool.request().query('SELECT * FROM dbo.SalesInvoices ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.SalesReturns ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.PurchaseInvoices ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.PurchaseReturns ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.PurchaseOrders ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.Requisitions ORDER BY Date DESC'),
            // Financials
            pool.request().query('SELECT * FROM dbo.CustomerPayments ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.SupplierPayments ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.Expenses ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.TreasuryTransactions ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.ExceptionalIncomes ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.ProfitDistributions ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.RepRemittances ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.EmployeeAdvances ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.EmployeeAdjustments ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.PayrollRecords ORDER BY Date DESC'),
            // Inventory
            pool.request().query('SELECT * FROM dbo.StockInRecords ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.StockOutRecords ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.StockTransferRecords ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.StockAdjustmentRecords ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.StockIssuesToReps ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.StockReturnsFromReps ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.InventoryClosings ORDER BY ClosingDate DESC'),
            // Assets & POS
            pool.request().query('SELECT * FROM dbo.FixedAssets ORDER BY PurchaseDate DESC'),
            pool.request().query('SELECT * FROM dbo.DepreciationRecords ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.HeldInvoices ORDER BY HeldAt DESC'),
            pool.request().query('SELECT * FROM dbo.PosAuditLogs ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.RestaurantTables ORDER BY TableNumber'),
            pool.request().query('SELECT * FROM dbo.Promotions WHERE IsActive = 1'),
            pool.request().query('SELECT * FROM dbo.Targets'),
            pool.request().query('SELECT * FROM dbo.DeliveryStaff'),
            pool.request().query('SELECT * FROM dbo.Sellers'),
            pool.request().query('SELECT * FROM dbo.ItemGroups'),
            pool.request().query('SELECT * FROM dbo.ItemColors'),
            pool.request().query('SELECT * FROM dbo.ItemSizes'),
            pool.request().query('SELECT * FROM dbo.PriceChangeLogs ORDER BY Timestamp DESC'),
            pool.request().query('SELECT * FROM dbo.CustomerVisits ORDER BY Timestamp DESC'),
            pool.request().query('SELECT * FROM dbo.LoginHistory ORDER BY Timestamp DESC'),
            // Upgraded operational queries
            pool.request().query('SELECT * FROM dbo.GratuityLogs ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.GratuityDistributions ORDER BY Date DESC'),
            pool.request().query('SELECT * FROM dbo.ItemSubCategories1 ORDER BY Name'),
            pool.request().query('SELECT * FROM dbo.ItemSubCategories2 ORDER BY Name'),
            pool.request().query('SELECT * FROM dbo.InventoryZones ORDER BY Name'),
            pool.request().query("IF OBJECT_ID('dbo.SnoozedRecommendations', 'U') IS NOT NULL SELECT * FROM dbo.SnoozedRecommendations WHERE SnoozedUntil > SYSUTCDATETIME() ELSE SELECT 1 WHERE 1=0")
        ]);

        // Helpers
        const parseJson = (val: any, fallback: any = {}) => {
            if (!val) return fallback;
            try { return JSON.parse(val); } catch { return fallback; }
        };

        const parseItemsArray = (row: any) => parseJson(row.ItemsJson || row.itemsJson, []);

        // Roles Map
        const roles: Record<string, any> = {};
        for (const row of rolesRes.recordset) {
            roles[row.Id] = parseJson(row.PermissionsJson, {});
        }

        // Settings Map
        const settings: Record<string, any> = {};
        for (const row of settingsRes.recordset) {
            settings[row.SettingKey] = parseJson(row.SettingValue, row.SettingValue);
        }

        // Counters Map
        const counters: Record<string, number> = {};
        for (const row of countersRes.recordset) {
            counters[row.Name] = Number(row.CurrentValue);
        }

        // Users (including HRMS & Payroll fields)
        const users = usersRes.recordset.map(u => ({
            ...u,
            id: u.Id || u.id,
            loginName: u.LoginName || u.loginName,
            name: u.Name || u.name,
            password: u.Password || u.password,
            phone: u.Phone || u.phone || '',
            email: u.Email || u.email || '',
            nationalId: u.NationalId || u.nationalId || '',
            socialInsuranceNumber: u.SocialInsuranceNumber || u.socialInsuranceNumber || '',
            jobTitle: u.JobTitle || u.jobTitle || '',
            department: u.Department || u.department || '',
            hiringDate: u.HiringDate || u.hiringDate || '',
            basicSalary: Number(u.BasicSalary ?? u.basicSalary ?? 0),
            housingAllowance: Number(u.HousingAllowance ?? u.housingAllowance ?? 0),
            transportAllowance: Number(u.TransportAllowance ?? u.transportAllowance ?? 0),
            socialInsuranceDeduction: Number(u.SocialInsuranceDeduction ?? u.socialInsuranceDeduction ?? 0),
            photoUrl: u.PhotoUrl || u.photoUrl || '',
            weeklyOffDays: parseJson(u.WeeklyOffDays || u.weeklyOffDays, ['الجمعة']),
            annualLeaveDays: Number(u.AnnualLeaveDays ?? u.annualLeaveDays ?? 21),
            usedLeaveDays: Number(u.UsedLeaveDays ?? u.usedLeaveDays ?? 0),
            status: u.Status || u.status || 'active',
            branchId: u.BranchId || u.branchId || '',
            notes: u.Notes || u.notes || '',
            role: u.Role || u.role,
            warehouseIds: parseJson(u.WarehouseIds || u.warehouseIds, []),
            uid: u.Uid || u.uid,
            isCashier: !!(u.IsCashier ?? u.isCashier),
            isDelivery: !!(u.IsDelivery ?? u.isDelivery),
            isSalesRep: !!(u.IsSalesRep ?? u.isSalesRep),
            canOpenOwnShift: !!(u.CanOpenOwnShift ?? u.canOpenOwnShift),
            canDeleteFromCart: !!(u.CanDeleteFromCart ?? u.canDeleteFromCart),
            canProcessReturn: !!(u.CanProcessReturn ?? u.canProcessReturn),
            canCancelInvoice: !!(u.CanCancelInvoice ?? u.canCancelInvoice),
            canBypassScannerForReturn: !!(u.CanBypassScannerForReturn ?? u.canBypassScannerForReturn),
            isDisabled: !!(u.IsDisabled ?? u.isDisabled),
            themeSettings: parseJson(u.ThemeSettings || u.themeSettings, null)
        }));

        // Commercial Documents
        const salesInvoices = salesInvoicesRes.recordset.map(s => ({
            ...s,
            id: s.Id,
            invoiceNumber: s.InvoiceNumber,
            date: s.Date,
            customerId: s.CustomerId,
            customerName: s.CustomerName,
            warehouseId: s.WarehouseId,
            salesRepId: s.SalesRepId,
            cashierId: s.CashierId,
            subtotal: Number(s.Subtotal),
            discount: Number(s.Discount),
            tax: Number(s.Tax),
            total: Number(s.Total),
            paidAmount: Number(s.PaidAmount),
            initialPaidAmount: s.InitialPaidAmount == null ? null : Number(s.InitialPaidAmount),
            paidToAccountId: s.PaidToAccountId,
            status: s.Status,
            isDelivery: !!s.IsDelivery,
            deliveryReconciled: !!s.DeliveryReconciled,
            isTaxIncluded: !!s.IsTaxIncluded,
            etaUuid: s.EtaUuid || s.etaUuid || null,
            etaStatus: s.EtaStatus || s.etaStatus || null,
            etaSubmissionId: s.EtaSubmissionId || s.etaSubmissionId || null,
            notes: s.Notes,
            items: parseItemsArray(s)
        }));

        const purchaseInvoices = purchaseInvoicesRes.recordset.map(p => ({
            ...p,
            id: p.Id,
            invoiceNumber: p.InvoiceNumber,
            batchNumber: p.BatchNumber,
            date: p.Date,
            dueDate: p.DueDate,
            supplierId: p.SupplierId,
            supplierName: p.SupplierName,
            warehouseId: p.WarehouseId,
            createdById: p.CreatedById,
            createdByName: p.CreatedByName,
            subtotal: Number(p.Subtotal),
            discount: Number(p.Discount),
            tax: Number(p.Tax),
            total: Number(p.Total),
            paidAmount: Number(p.PaidAmount),
            initialPaidAmount: p.InitialPaidAmount == null ? null : Number(p.InitialPaidAmount),
            paidFromAccountId: p.PaidFromAccountId,
            isTaxIncluded: !!p.IsTaxIncluded,
            notes: p.Notes,
            items: parseItemsArray(p)
        }));

        const salesReturns = salesReturnsRes.recordset.map(r => ({
            ...r,
            id: r.Id,
            receiptNumber: r.ReceiptNumber,
            originalInvoiceId: r.OriginalInvoiceId,
            date: r.Date,
            customerId: r.CustomerId,
            warehouseId: r.WarehouseId,
            createdById: r.CreatedById,
            createdByName: r.CreatedByName,
            subtotal: Number(r.Subtotal),
            discount: Number(r.Discount || 0),
            tax: Number(r.Tax || 0),
            total: Number(r.Total),
            paidAmount: Number(r.PaidAmount),
            paidFromAccountId: r.PaidFromAccountId,
            notes: r.Notes,
            items: parseItemsArray(r)
        }));

        const purchaseReturns = purchaseReturnsRes.recordset.map(r => ({
            ...r,
            id: r.Id,
            receiptNumber: r.ReceiptNumber,
            originalInvoiceId: r.OriginalInvoiceId,
            date: r.Date,
            supplierId: r.SupplierId,
            warehouseId: r.WarehouseId,
            createdById: r.CreatedById,
            createdByName: r.CreatedByName,
            subtotal: Number(r.Subtotal),
            discount: Number(r.Discount),
            tax: Number(r.Tax || 0),
            total: Number(r.Total),
            paidAmount: Number(r.PaidAmount),
            paidToAccountId: r.PaidToAccountId,
            notes: r.Notes,
            items: parseItemsArray(r)
        }));

        const items = itemsRes.recordset.map(i => ({
            ...i,
            id: i.Id || i.id,
            code: i.Code || i.code,
            name: i.Name || i.name,
            cost: Number(i.Cost ?? i.cost ?? 0),
            price: Number(i.Price ?? i.price ?? 0),
            baseUnit: i.BaseUnit || i.baseUnit,
            itemType: i.ItemType || i.itemType,
            reorderPoint: Number(i.ReorderPoint ?? i.reorderPoint ?? 0),
            sectionId: i.SectionId || i.sectionId,
            categoryId: i.CategoryId || i.categoryId,
            itemGroupId: i.ItemGroupId || i.itemGroupId,
            subCategoryId1: i.SubCategoryId1 || i.subCategoryId1,
            subCategoryId2: i.SubCategoryId2 || i.subCategoryId2,
            color: i.Color || i.color,
            size: i.Size || i.size,
            defaultBinId: i.DefaultBinId || i.defaultBinId,
            barcode: i.Barcode || i.barcode || i.Code || i.code,
            barcodeType: i.BarcodeType || i.barcodeType,
            secondaryUnits: parseJson(i.SecondaryUnitsJson || i.secondaryUnitsJson || i.secondaryUnits, []),
            components: parseJson(i.ComponentsJson || i.componentsJson || i.components, []),
            isDisabled: !!(i.IsDisabled ?? i.isDisabled)
        }));

        const customers = customersRes.recordset.map(c => ({
            ...c,
            id: c.Id || c.id,
            name: c.Name || c.name,
            phone: c.Phone || c.phone,
            address: c.Address || c.address,
            allowCredit: !!(c.AllowCredit ?? c.allowCredit),
            creditLimit: Number(c.CreditLimit ?? c.creditLimit ?? 0),
            openingBalance: Number(c.OpeningBalance ?? c.openingBalance ?? 0),
            currentBalance: Number(c.CurrentBalance ?? c.currentBalance ?? 0),
            invoiceCount: Number(c.InvoiceCount ?? c.invoiceCount ?? 0),
            loyaltyPoints: Number(c.LoyaltyPoints ?? c.loyaltyPoints ?? 0),
            totalEarnedPoints: Number(c.TotalEarnedPoints ?? c.totalEarnedPoints ?? 0),
            totalRedeemedPoints: Number(c.TotalRedeemedPoints ?? c.totalRedeemedPoints ?? 0)
        }));

        const suppliers = suppliersRes.recordset.map(s => ({
            ...s,
            id: s.Id || s.id,
            name: s.Name || s.name,
            contact: s.Contact || s.contact,
            openingBalance: Number(s.OpeningBalance ?? s.openingBalance ?? 0),
            currentBalance: Number(s.CurrentBalance ?? s.currentBalance ?? 0),
            items: parseJson(s.ItemsJson || s.itemsJson || s.items, [])
        }));

        const warehouses = warehousesRes.recordset.map(w => {
            const wType = w.WarehouseType || w.warehouseType || (w.IsRepWarehouse || w.isRepWarehouse ? 'rep' : (w.IsMain || w.isMain ? 'warehouse' : 'branch'));
            const isMainVal = (wType === 'branch' || wType === 'rep') ? false : !!(w.IsMain ?? w.isMain);
            return {
                ...w,
                id: w.Id || w.id,
                code: w.Code || w.code,
                name: w.Name || w.name,
                address: w.Address || w.address,
                isRepWarehouse: !!(w.IsRepWarehouse ?? w.isRepWarehouse),
                isMain: isMainVal,
                isClosed: !!(w.IsClosed ?? w.isClosed),
                repId: w.RepId || w.repId || null,
                warehouseType: wType
            };
        });

        const cashAccounts = cashAccountsRes.recordset.map(ca => ({
            ...ca,
            id: ca.Id || ca.id,
            name: ca.Name || ca.name,
            type: ca.Type || ca.type,
            openingBalance: Number(ca.OpeningBalance ?? ca.openingBalance ?? 0),
            currentBalance: Number(ca.CurrentBalance ?? ca.currentBalance ?? 0),
            userId: ca.UserId || ca.userId,
            warehouseId: ca.WarehouseId || ca.warehouseId
        }));

        // POS & Restaurant
        const heldInvoices = heldInvoicesRes.recordset.map(h => {
            const parsedCart = parseJson(h.CartData || h.cartData || h.items || h.cart, []);
            const validCart = Array.isArray(parsedCart) ? parsedCart : (parsedCart?.cart || []);
            return {
                ...h,
                id: h.Id || h.id,
                heldAt: h.HeldAt || h.heldAt,
                cashierId: h.CashierId || h.cashierId,
                cashierName: h.CashierName || h.cashierName,
                terminalId: h.TerminalId || h.terminalId,
                tableId: h.TableId || h.tableId,
                customerName: h.CustomerName || h.customerName,
                total: Number(h.Total ?? h.total ?? 0),
                cart: validCart,
                items: validCart
            };
        });

        return NextResponse.json({
            success: true,
            data: {
                // Master Data
                warehouses,
                inventorySections: inventorySectionsRes.recordset.map(s => ({
                    ...s,
                    id: s.Id || s.id,
                    name: s.Name || s.name,
                    code: s.Code || s.code,
                    mainWarehouseId: s.MainWarehouseId || s.mainWarehouseId,
                    capacity: Number(s.Capacity ?? s.capacity ?? 0),
                    allowOverfill: s.AllowOverfill !== undefined ? !!s.AllowOverfill : true
                })),
                itemSections: itemSectionsRes.recordset.map(s => ({ ...s, id: s.Id || s.id, name: s.Name || s.name, code: s.Code || s.code })),
                itemCategories: itemCategoriesRes.recordset.map(c => ({
                    ...c,
                    id: c.Id || c.id,
                    name: c.Name || c.name,
                    code: c.Code || c.code,
                    sectionId: c.SectionId || c.sectionId,
                    showOnPos: c.ShowOnPos !== undefined && c.ShowOnPos !== null ? !!c.ShowOnPos : true,
                    color: c.Color || c.color || ''
                })),
                items,
                allItems: items,
                customers,
                suppliers,
                cashAccounts,
                roles,
                users,
                settings,
                main: settings['main'] || {},
                counters,
                posSessions: posSessionsRes.recordset.map(ps => ({
                    ...ps,
                    id: ps.Id || ps.id,
                    startTime: ps.StartTime ? new Date(ps.StartTime).toISOString() : (ps.startTime || null),
                    endTime: ps.EndTime ? new Date(ps.EndTime).toISOString() : (ps.endTime || null),
                    openedBy: ps.OpenedBy || ps.openedBy,
                    openedByName: ps.OpenedByName || ps.openedByName,
                    closedBy: ps.ClosedBy || ps.closedBy,
                    closedByName: ps.ClosedByName || ps.closedByName,
                    isClosed: ps.IsClosed !== undefined ? !!ps.IsClosed : !!ps.isClosed,
                    posTerminalId: ps.PosTerminalId || ps.posTerminalId,
                    cashierSessions: parseJson(ps.CashierSessionsJson || ps.cashierSessionsJson, ps.cashierSessions || {}),
                    closingStatement: parseJson(ps.ClosingStatementJson || ps.closingStatementJson, ps.closingStatement || null)
                })),
                barcodeDesigns: barcodeDesignsRes.recordset.map(bd => ({ id: bd.Id, name: bd.Name, ...parseJson(bd.ConfigJson, {}) })),
                posTerminals: posTerminalsRes.recordset.map(t => ({
                    ...t,
                    id: t.Id || t.id,
                    code: t.Code || t.code || '',
                    name: t.Name || t.name || '',
                    warehouseId: t.WarehouseId || t.warehouseId || '',
                    posPrinterType: t.PosPrinterType || t.posPrinterType || 'system',
                    posPrinterAddress: t.PosPrinterAddress || t.posPrinterAddress || '',
                    enableKitchenPrinter: t.EnableKitchenPrinter !== undefined ? !!t.EnableKitchenPrinter : (t.enableKitchenPrinter ?? false),
                    kitchenPrinterType: t.KitchenPrinterType || t.kitchenPrinterType || 'system',
                    kitchenPrinterAddress: t.KitchenPrinterAddress || t.kitchenPrinterAddress || ''
                })),
                paymentMethods: paymentMethodsRes.recordset.map(p => ({
                    ...p,
                    id: p.Id || p.id,
                    name: p.Name || p.name || '',
                    code: p.Code || p.code || '',
                    accountId: p.AccountId || p.accountId || '',
                    color: p.Color || p.color || '#3b82f6',
                    isEnabled: p.IsEnabled !== undefined ? !!p.IsEnabled : (p.isEnabled !== undefined ? !!p.isEnabled : (p.IsActive !== undefined ? !!p.IsActive : true)),
                    type: p.Type || p.type || 'cash'
                })),
                partners: partnersRes.recordset.map(p => ({
                    ...p,
                    id: p.Id || p.id,
                    name: p.Name || p.name || '',
                    capital: Number(p.Capital ?? p.capital ?? 0),
                    profitShare: Number(p.ProfitShare ?? p.profitShare ?? 0),
                    warehouseId: p.WarehouseId || p.warehouseId || '',
                    startDate: p.StartDate ? new Date(p.StartDate).toISOString() : (p.startDate || ''),
                    endDate: p.EndDate ? new Date(p.EndDate).toISOString() : (p.endDate || '')
                })),
                employees: employeesRes.recordset.map(e => ({
                    ...e,
                    id: e.Id || e.id,
                    name: e.Name || e.name || '',
                    phone: e.Phone || e.phone || '',
                    email: e.Email || e.email || '',
                    jobTitle: e.JobTitle || e.jobTitle || '',
                    department: e.Department || e.department || '',
                    basicSalary: Number(e.BasicSalary ?? e.basicSalary ?? 0),
                    branchId: e.BranchId || e.branchId || '',
                    status: e.Status || e.status || 'active'
                })),
                licenses: licensesRes.recordset.map(lic => ({
                    ...lic,
                    id: lic.Id || lic.id,
                    key: lic.Key || lic.key,
                    startDate: lic.StartDate ? new Date(lic.StartDate).toISOString() : (lic.startDate || null),
                    endDate: lic.EndDate ? new Date(lic.EndDate).toISOString() : (lic.endDate || null),
                    status: lic.Status || lic.status || 'available',
                    maxUsers: Number(lic.MaxUsers ?? lic.maxUsers ?? 10),
                    enabledModules: parseJson(lic.EnabledModules || lic.enabledModules, {}),
                    assignedWarehouseIds: parseJson(lic.AssignedWarehouseIds || lic.assignedWarehouseIds, []),
                    assignedTo: lic.AssignedTo || lic.assignedTo || null,
                    createdAt: lic.CreatedAt ? new Date(lic.CreatedAt).toISOString() : (lic.createdAt || new Date().toISOString())
                })),
                deliveryStaff: deliveryStaffRes.recordset.map(d => ({
                    ...d,
                    id: d.Id || d.id,
                    name: d.Name || d.name || '',
                    phone: d.Phone || d.phone || ''
                })),
                sellers: sellersRes.recordset.map(s => ({
                    ...s,
                    id: s.Id || s.id,
                    name: s.Name || s.name || '',
                    phone: s.Phone || s.phone || '',
                    targetAmount: Number(s.TargetAmount ?? s.targetAmount ?? 0),
                    commissionRate: Number(s.CommissionRate ?? s.commissionRate ?? 0),
                    warehouseId: s.WarehouseId || s.warehouseId || ''
                })),
                itemGroups: itemGroupsRes.recordset.map(g => ({
                    ...g,
                    id: g.Id || g.id,
                    name: g.Name || g.name,
                    code: g.Code || g.code,
                    parentCategoryId: g.ParentCategoryId || g.parentCategoryId,
                    showOnPos: g.ShowOnPos !== undefined && g.ShowOnPos !== null ? !!g.ShowOnPos : true,
                    color: g.Color || g.color || ''
                })),
                itemSubCategories1: itemSubCategories1Res.recordset.map(sc => ({ ...sc, id: sc.Id || sc.id, name: sc.Name || sc.name, code: sc.Code || sc.code })),
                itemSubCategories2: itemSubCategories2Res.recordset.map(sc => ({ ...sc, id: sc.Id || sc.id, name: sc.Name || sc.name, code: sc.Code || sc.code })),
                inventoryZones: inventoryZonesRes.recordset.map(z => ({
                    ...z,
                    id: z.Id || z.id,
                    name: z.Name || z.name,
                    warehouseId: z.WarehouseId || z.warehouseId || ''
                })),
                itemColors: itemColorsRes.recordset.map(c => ({
                    ...c,
                    id: c.Id || c.id,
                    name: c.Name || c.name,
                    colorCode: c.ColorCode || c.colorCode || ''
                })),
                itemSizes: itemSizesRes.recordset.map(s => ({
                    ...s,
                    id: s.Id || s.id,
                    name: s.Name || s.name
                })),
                restaurantTables: restaurantTablesRes.recordset.map(t => {
                    const rawNum = t.TableNumber ?? t.Number ?? t.number ?? '';
                    const parsedNum = Number(rawNum);
                    return {
                        ...t,
                        id: t.Id || t.id,
                        name: t.Name || t.name || '',
                        number: !isNaN(parsedNum) && rawNum !== '' ? parsedNum : rawNum,
                        seats: Number(t.Capacity ?? t.Seats ?? t.seats ?? 4),
                        capacity: Number(t.Capacity ?? t.Seats ?? t.seats ?? 4),
                        groupName: t.Zone || t.GroupName || t.groupName || '',
                        warehouseId: t.WarehouseId || t.warehouseId || '',
                        status: t.Status || t.status || 'available'
                    };
                }),
                promotions: promotionsRes.recordset.map(p => ({
                    ...p,
                    id: p.Id || p.id,
                    name: p.Name || p.name || '',
                    type: p.Type || p.type || 'percentage',
                    value: Number(p.Value ?? p.value ?? 0),
                    startDate: p.StartDate ? new Date(p.StartDate).toISOString() : (p.startDate || null),
                    endDate: p.EndDate ? new Date(p.EndDate).toISOString() : (p.endDate || null),
                    isActive: p.IsActive !== undefined ? !!p.IsActive : (p.isActive !== undefined ? !!p.isActive : true),
                    warehouseIds: parseJson(p.WarehouseIds || p.warehouseIds, [])
                })),
                targets: targetsRes.recordset.reduce((acc: any, t: any) => { acc[t.TargetKey] = parseJson(t.DetailsJson, t); return acc; }, {}),
                heldInvoices,
                posAuditLogs: posAuditLogsRes.recordset.map(l => ({ ...l, id: l.Id })),
                gratuityLogs: gratuityLogsRes.recordset.map(gl => ({ ...gl, id: gl.Id, amount: Number(gl.Amount), date: gl.Date ? new Date(gl.Date).toISOString() : null })),
                gratuityDistributions: gratuityDistributionsRes.recordset.map(gd => ({ ...gd, id: gd.Id, totalAmount: Number(gd.TotalAmount), date: gd.Date ? new Date(gd.Date).toISOString() : null, details: parseJson(gd.DetailsJson, {}) })),
                
                // Commercial Documents
                salesInvoices,
                salesReturns,
                purchaseInvoices,
                purchaseReturns,
                purchaseOrders: purchaseOrdersRes.recordset.map(po => ({ ...po, id: po.Id, items: parseItemsArray(po) })),
                requisitions: requisitionsRes.recordset.map(r => {
                    const extra = parseJson(r.DetailsJson || r.ItemsJson, {});
                    return {
                        ...r,
                        id: r.Id,
                        requisitionNumber: r.RequisitionNumber || r.requisitionNumber,
                        date: r.Date ? new Date(r.Date).toISOString() : null,
                        fromWarehouseId: r.FromWarehouseId || r.fromWarehouseId || r.WarehouseId || extra.fromWarehouseId,
                        toWarehouseId: r.ToWarehouseId || r.toWarehouseId || extra.toWarehouseId,
                        requestedById: r.RequestedById || r.requestedById,
                        requestedByName: r.RequestedByName || r.requestedByName,
                        status: r.Status || r.status || 'pending',
                        priority: r.Priority || r.priority || 'normal',
                        notes: r.Notes || r.notes || '',
                        items: parseItemsArray(r)
                    };
                }),
                
                // Financial Documents
                customerPayments: customerPaymentsRes.recordset.map(cp => ({
                    ...cp,
                    id: cp.Id || cp.id,
                    receiptNumber: cp.ReceiptNumber || cp.receiptNumber,
                    date: cp.Date ? new Date(cp.Date).toISOString() : (cp.date || null),
                    customerId: cp.CustomerId || cp.customerId,
                    invoiceId: cp.InvoiceId || cp.invoiceId || null,
                    amount: Number(cp.Amount ?? cp.amount ?? 0),
                    paidToAccountId: cp.PaidToAccountId || cp.paidToAccountId,
                    createdById: cp.CreatedById || cp.createdById,
                    createdByName: cp.CreatedByName || cp.createdByName,
                    notes: cp.Notes || cp.notes || ''
                })),
                supplierPayments: supplierPaymentsRes.recordset.map(sp => ({
                    ...sp,
                    id: sp.Id || sp.id,
                    receiptNumber: sp.ReceiptNumber || sp.receiptNumber,
                    date: sp.Date ? new Date(sp.Date).toISOString() : (sp.date || null),
                    supplierId: sp.SupplierId || sp.supplierId,
                    invoiceId: sp.InvoiceId || sp.invoiceId || null,
                    amount: Number(sp.Amount ?? sp.amount ?? 0),
                    paidFromAccountId: sp.PaidFromAccountId || sp.paidFromAccountId,
                    createdById: sp.CreatedById || sp.createdById,
                    createdByName: sp.CreatedByName || sp.createdByName,
                    notes: sp.Notes || sp.notes || ''
                })),
                expenses: expensesRes.recordset.map(ex => ({
                    ...ex,
                    id: ex.Id || ex.id,
                    receiptNumber: ex.ReceiptNumber || ex.receiptNumber,
                    date: ex.Date ? new Date(ex.Date).toISOString() : (ex.date || null),
                    expenseType: ex.ExpenseType || ex.expenseType,
                    description: ex.Description || ex.description,
                    amount: Number(ex.Amount ?? ex.amount ?? 0),
                    taxAmount: Number(ex.TaxAmount ?? ex.taxAmount ?? 0),
                    warehouseId: ex.WarehouseId || ex.warehouseId,
                    paidFromAccountId: ex.PaidFromAccountId || ex.paidFromAccountId,
                    status: ex.Status || ex.status || 'approved',
                    createdById: ex.CreatedById || ex.createdById,
                    createdByName: ex.CreatedByName || ex.createdByName
                })),
                treasuryTransactions: treasuryTxRes.recordset.map(tx => ({
                    ...tx,
                    id: tx.Id || tx.id,
                    receiptNumber: tx.ReceiptNumber || tx.receiptNumber,
                    date: tx.Date ? new Date(tx.Date).toISOString() : (tx.date || null),
                    accountId: tx.AccountId || tx.accountId,
                    type: tx.Type || tx.type,
                    amount: Number(tx.Amount ?? tx.amount ?? 0),
                    description: tx.Description || tx.description,
                    linkedTransaction: !!(tx.LinkedTransaction || tx.linkedTransaction || tx.LinkedTransactionId || tx.linkedTransactionId),
                    linkedTransactionId: tx.LinkedTransactionId || tx.linkedTransactionId,
                    createdById: tx.CreatedById || tx.createdById,
                    createdByName: tx.CreatedByName || tx.createdByName
                })),
                exceptionalIncomes: exceptionalIncomesRes.recordset.map(ei => ({
                    ...ei,
                    id: ei.Id || ei.id,
                    receiptNumber: ei.ReceiptNumber || ei.receiptNumber,
                    date: ei.Date ? new Date(ei.Date).toISOString() : (ei.date || null),
                    incomeType: ei.IncomeType || ei.incomeType,
                    description: ei.Description || ei.description,
                    amount: Number(ei.Amount ?? ei.amount ?? 0),
                    paidToAccountId: ei.PaidToAccountId || ei.paidToAccountId,
                    warehouseId: ei.WarehouseId || ei.warehouseId,
                    createdById: ei.CreatedById || ei.createdById,
                    createdByName: ei.CreatedByName || ei.createdByName
                })),
                profitDistributions: profitDistributionsRes.recordset.map(pd => ({
                    ...pd,
                    id: pd.Id || pd.id,
                    receiptNumber: pd.ReceiptNumber || pd.receiptNumber,
                    date: pd.Date ? new Date(pd.Date).toISOString() : (pd.date || null),
                    partnerId: pd.PartnerId || pd.partnerId,
                    partnerName: pd.PartnerName || pd.partnerName,
                    amount: Number(pd.Amount ?? pd.amount ?? 0),
                    paidFromAccountId: pd.PaidFromAccountId || pd.paidFromAccountId,
                    notes: pd.Notes || pd.notes || '',
                    createdById: pd.CreatedById || pd.createdById,
                    createdByName: pd.CreatedByName || pd.createdByName
                })),
                repRemittances: repRemittancesRes.recordset.map(rr => ({
                    ...rr,
                    id: rr.Id || rr.id,
                    date: rr.Date ? new Date(rr.Date).toISOString() : (rr.date || null),
                    salesRepId: rr.SalesRepId || rr.salesRepId,
                    userId: rr.SalesRepId || rr.salesRepId,
                    salesRepName: rr.SalesRepName || rr.salesRepName,
                    amount: Number(rr.Amount ?? rr.amount ?? 0),
                    toAccountId: rr.ToAccountId || rr.toAccountId,
                    receiptNumber: rr.ReceiptNumber || rr.receiptNumber,
                    notes: rr.Notes || rr.notes
                })),
                employeeAdvances: employeeAdvancesRes.recordset.map(ea => ({
                    ...ea,
                    id: ea.Id || ea.id,
                    date: ea.Date ? new Date(ea.Date).toISOString() : (ea.date || null),
                    employeeId: ea.EmployeeId || ea.employeeId,
                    amount: Number(ea.Amount ?? ea.amount ?? 0),
                    paidFromAccountId: ea.PaidFromAccountId || ea.paidFromAccountId,
                    notes: ea.Notes || ea.notes || ''
                })),
                employeeAdjustments: employeeAdjustmentsRes.recordset.map(adj => ({
                    ...adj,
                    id: adj.Id || adj.id,
                    date: adj.Date ? new Date(adj.Date).toISOString() : (adj.date || null),
                    employeeId: adj.EmployeeId || adj.employeeId,
                    employeeName: adj.EmployeeName || adj.employeeName,
                    type: adj.Type || adj.type,
                    amount: Number(adj.Amount ?? adj.amount ?? 0),
                    reason: adj.Reason || adj.reason || '',
                    createdById: adj.CreatedById || adj.createdById,
                    createdByName: adj.CreatedByName || adj.createdByName
                })),
                payrollRecords: payrollRes.recordset.map(pr => ({
                    ...pr,
                    id: pr.Id || pr.id,
                    date: pr.Date ? new Date(pr.Date).toISOString() : (pr.date || null),
                    month: pr.Month || pr.month,
                    paidFromAccountId: pr.PaidFromAccountId || pr.paidFromAccountId,
                    totalAmount: Number(pr.TotalAmount ?? pr.totalAmount ?? 0),
                    payrollData: parseJson(pr.DetailsJson || pr.payrollData, [])
                })),
                fixedAssets: fixedAssetsRes.recordset.map(fa => ({
                    ...fa,
                    id: fa.Id || fa.id,
                    code: fa.Code || fa.code,
                    name: fa.Name || fa.name,
                    purchaseDate: fa.PurchaseDate ? new Date(fa.PurchaseDate).toISOString() : (fa.purchaseDate || null),
                    purchasePrice: Number(fa.PurchasePrice ?? fa.Cost ?? fa.purchasePrice ?? 0),
                    cost: Number(fa.Cost ?? fa.PurchasePrice ?? fa.cost ?? 0),
                    currentValue: Number(fa.CurrentValue ?? fa.currentValue ?? 0),
                    usefulLifeYears: Number(fa.UsefulLifeYears ?? fa.usefulLifeYears ?? 5),
                    salvageValue: Number(fa.SalvageValue ?? fa.salvageValue ?? 0),
                    depreciationRate: Number(fa.DepreciationRate ?? fa.depreciationRate ?? 0),
                    depreciationMethod: fa.DepreciationMethod || fa.depreciationMethod || 'straight_line',
                    warehouseId: fa.WarehouseId || fa.warehouseId,
                    status: fa.Status || fa.status || 'active',
                    disposedDate: fa.DisposedDate ? new Date(fa.DisposedDate).toISOString() : (fa.disposedDate || null),
                    saleProceeds: (fa.SaleProceeds != null || fa.saleProceeds != null) ? Number(fa.SaleProceeds ?? fa.saleProceeds) : null,
                    notes: fa.Notes || fa.notes || ''
                })),
                depreciationRecords: depreciationRecordsRes.recordset.map(dr => ({
                    ...dr,
                    id: dr.Id || dr.id,
                    assetId: dr.AssetId || dr.assetId,
                    date: dr.Date ? new Date(dr.Date).toISOString() : (dr.date || null),
                    amount: Number(dr.Amount ?? dr.amount ?? 0),
                    accumulatedTotal: Number(dr.AccumulatedTotal ?? dr.accumulatedTotal ?? 0),
                    remainingValue: Number(dr.RemainingValue ?? dr.remainingValue ?? 0),
                    notes: dr.Notes || dr.notes || ''
                })),

                // Inventory Documents
                stockInRecords: stockInRes.recordset.map(si => ({
                    ...si,
                    id: si.Id || si.id,
                    date: si.Date ? new Date(si.Date).toISOString() : (si.date || null),
                    warehouseId: si.WarehouseId || si.warehouseId,
                    receiptNumber: si.ReceiptNumber || si.receiptNumber,
                    batchNumber: si.BatchNumber || si.batchNumber || null,
                    purchaseInvoiceId: si.PurchaseInvoiceId || si.purchaseInvoiceId || null,
                    stockTransferId: si.StockTransferId || si.stockTransferId || null,
                    reason: si.Reason || si.reason || null,
                    status: (si.Status || si.status || 'completed'),
                    createdById: si.CreatedById || si.createdById || null,
                    createdByName: si.CreatedByName || si.createdByName || null,
                    receivedById: si.ReceivedById || si.receivedById || null,
                    receivedByName: si.ReceivedByName || si.receivedByName || null,
                    receivedDate: si.ReceivedDate ? new Date(si.ReceivedDate).toISOString() : (si.receivedDate || null),
                    allocations: parseJson(si.AllocationsJson || si.allocationsJson || si.allocations, []),
                    items: parseItemsArray(si)
                })),
                stockOutRecords: stockOutRes.recordset.map(so => ({
                    ...so,
                    id: so.Id || so.id,
                    date: so.Date ? new Date(so.Date).toISOString() : (so.date || null),
                    warehouseId: so.WarehouseId || so.SourceId || so.warehouseId || so.sourceId,
                    sourceId: so.SourceId || so.WarehouseId || so.sourceId || so.warehouseId,
                    receiptNumber: so.ReceiptNumber || so.receiptNumber,
                    saleInvoiceId: so.SaleInvoiceId || so.saleInvoiceId || null,
                    reason: so.Reason || so.reason || null,
                    status: (so.Status || so.status || 'completed'),
                    requisitionId: so.RequisitionId || so.requisitionId || null,
                    toWarehouseId: so.ToWarehouseId || so.toWarehouseId || null,
                    createdByName: so.CreatedByName || so.createdByName || null,
                    notes: so.Notes || so.notes || '',
                    shippingCost: Number(so.ShippingCost ?? so.shippingCost ?? 0),
                    expenses: parseItemsArray({ items: so.ExpensesJson || so.expensesJson || '[]' }),
                    expensesJson: so.ExpensesJson || so.expensesJson || '[]',
                    shippingPaidBy: so.ShippingPaidBy ?? so.shippingPaidBy ?? null,
                    shippingPaidFromAccountId: so.ShippingPaidFromAccountId ?? so.shippingPaidFromAccountId ?? null,
                    shippingTreatment: so.ShippingTreatment ?? so.shippingTreatment ?? 'capitalized',
                    carrierName: so.CarrierName ?? so.carrierName ?? '',
                    trackingNumber: so.TrackingNumber ?? so.trackingNumber ?? '',
                    expenseId: so.ExpenseId ?? so.expenseId ?? null,
                    totalGoodsValue: Number(so.TotalGoodsValue ?? so.totalGoodsValue ?? 0),
                    totalTransferredValue: Number(so.TotalTransferredValue ?? so.totalTransferredValue ?? 0),
                    items: parseItemsArray(so)
                })),
                stockTransferRecords: stockTransferRes.recordset.map(st => ({
                    ...st,
                    id: st.Id,
                    date: st.Date ? new Date(st.Date).toISOString() : null,
                    fromWarehouseId: st.FromWarehouseId,
                    toWarehouseId: st.ToWarehouseId,
                    fromSourceId: st.FromWarehouseId,
                    toSourceId: st.ToWarehouseId,
                    receiptNumber: st.ReceiptNumber,
                    shippingCost: Number(st.ShippingCost ?? st.shippingCost ?? 0),
                    shippingPaidBy: st.ShippingPaidBy ?? st.shippingPaidBy ?? 'source',
                    shippingPaidFromAccountId: st.ShippingPaidFromAccountId ?? st.shippingPaidFromAccountId ?? null,
                    shippingTreatment: st.ShippingTreatment ?? st.shippingTreatment ?? 'expense',
                    carrierName: st.CarrierName ?? st.carrierName ?? '',
                    trackingNumber: st.TrackingNumber ?? st.trackingNumber ?? '',
                    expenseId: st.ExpenseId ?? st.expenseId ?? null,
                    expenses: parseItemsArray({ items: st.ExpensesJson || st.expensesJson || '[]' }),
                    expensesJson: st.ExpensesJson || st.expensesJson || '[]',
                    totalGoodsValue: Number(st.TotalGoodsValue ?? st.totalGoodsValue ?? 0),
                    totalTransferredValue: Number(st.TotalTransferredValue ?? st.totalTransferredValue ?? 0),
                    items: parseItemsArray(st)
                })),
                stockAdjustmentRecords: stockAdjRes.recordset.map(sa => ({
                    ...sa,
                    id: sa.Id,
                    date: sa.Date ? new Date(sa.Date).toISOString() : null,
                    warehouseId: sa.WarehouseId,
                    receiptNumber: sa.ReceiptNumber,
                    items: parseItemsArray(sa)
                })),
                stockIssuesToReps: stockIssuesRes.recordset.map(si => ({
                    ...si,
                    id: si.Id,
                    date: si.Date ? new Date(si.Date).toISOString() : null,
                    warehouseId: si.WarehouseId,
                    salesRepId: si.SalesRepId,
                    salesRepName: si.SalesRepName,
                    receiptNumber: si.ReceiptNumber,
                    items: parseItemsArray(si)
                })),
                stockReturnsFromReps: stockReturnsFromRepsRes.recordset.map(sr => ({
                    ...sr,
                    id: sr.Id,
                    date: sr.Date ? new Date(sr.Date).toISOString() : null,
                    warehouseId: sr.WarehouseId,
                    salesRepId: sr.SalesRepId,
                    salesRepName: sr.SalesRepName,
                    receiptNumber: sr.ReceiptNumber,
                    items: parseItemsArray(sr)
                })),
                inventoryClosings: inventoryClosingsRes.recordset.map(ic => ({
                    ...ic,
                    id: ic.Id,
                    closingDate: ic.ClosingDate ? new Date(ic.ClosingDate).toISOString() : null,
                    warehouseId: ic.WarehouseId,
                    closedById: ic.ClosedById,
                    closedByName: ic.ClosedByName,
                    notes: ic.Notes,
                    balances: parseJson(ic.BalancesJson, [])
                })),

                // Audit & Activity Logs
                priceChangeLogs: priceChangeLogsRes.recordset.map(l => ({ ...l, id: l.Id })),
                customerVisits: customerVisitsRes.recordset.map(v => {
                    let loc = parseJson(v.Location, null);
                    if (!loc && v.Latitude && v.Longitude) {
                        loc = { latitude: Number(v.Latitude), longitude: Number(v.Longitude) };
                    }
                    return {
                        ...v,
                        id: v.Id,
                        salesRepId: v.SalesRepId,
                        salesRepName: v.SalesRepName,
                        customerId: v.CustomerId || null,
                        customerName: v.CustomerName || 'زيارة بدون عميل محدد',
                        timestamp: v.Timestamp ? new Date(v.Timestamp).toISOString() : new Date().toISOString(),
                        notes: v.Notes || '',
                        location: loc
                    };
                }),
                loginHistory: loginHistoryRes.recordset.map(lh => ({
                    ...lh,
                    id: lh.Id,
                    userId: lh.UserId,
                    userName: lh.UserName,
                    timestamp: lh.Timestamp ? new Date(lh.Timestamp).toISOString() : new Date().toISOString(),
                    location: (lh.Latitude != null && lh.Longitude != null) ? {
                        latitude: Number(lh.Latitude),
                        longitude: Number(lh.Longitude)
                    } : null
                })),
                syncHistory: [],
                snoozedRecommendations: (snoozedRecsRes?.recordset || []).map((s: any) => ({
                    id: s.Id,
                    itemId: s.ItemId,
                    warehouseId: s.WarehouseId,
                    snoozedUntil: s.SnoozedUntil ? new Date(s.SnoozedUntil).toISOString() : null,
                    reason: s.Reason
                })),
                posCounters: {},
                posSales: salesInvoices.filter(s => s.cashierId || !s.invoiceNumber || s.invoiceNumber.startsWith('POS')),
                posReturns: salesReturns.filter(r => !r.receiptNumber || r.receiptNumber.startsWith('POS-RET'))
            }
        });
    } catch (error: any) {
        console.error('Error in /api/db/sync:', error);

        await logSystemError({
            source: 'API:db/sync',
            action: 'GET',
            endpoint: '/api/db/sync',
            errorMessage: error.message || 'Error in /api/db/sync',
            errorStack: error.stack,
            errorCode: error.number || error.code || 500,
            statusCode: 500
        });

        return NextResponse.json({
            success: false,
            error: error.message,
            code: error.code,
            database: process.env.DB_NAME || 'MultiBranchPOS_DB'
        }, { status: 500 });
    }
}
