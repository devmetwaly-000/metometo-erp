import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
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
            gratuityLogsRes, gratuityDistributionsRes, itemSubCategories1Res, itemSubCategories2Res, inventoryZonesRes
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
            pool.request().query('SELECT * FROM dbo.InventoryZones ORDER BY Name')
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

        // Users
        const users = usersRes.recordset.map(u => ({
            ...u,
            id: u.Id,
            loginName: u.LoginName,
            name: u.Name,
            password: u.Password,
            role: u.Role,
            warehouseIds: parseJson(u.WarehouseIds, []),
            uid: u.Uid,
            isCashier: !!u.IsCashier,
            isDelivery: !!u.IsDelivery,
            isSalesRep: !!u.IsSalesRep,
            canOpenOwnShift: !!u.CanOpenOwnShift,
            canDeleteFromCart: !!u.CanDeleteFromCart,
            canProcessReturn: !!u.CanProcessReturn,
            canCancelInvoice: !!u.CanCancelInvoice,
            canBypassScannerForReturn: !!u.CanBypassScannerForReturn,
            themeSettings: parseJson(u.ThemeSettings, null)
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
            paidToAccountId: s.PaidToAccountId,
            status: s.Status,
            isDelivery: !!s.IsDelivery,
            deliveryReconciled: !!s.DeliveryReconciled,
            isTaxIncluded: !!s.IsTaxIncluded,
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
            total: Number(r.Total),
            paidAmount: Number(r.PaidAmount),
            paidToAccountId: r.PaidToAccountId,
            notes: r.Notes,
            items: parseItemsArray(r)
        }));

        const items = itemsRes.recordset.map(i => ({
            ...i,
            id: i.Id,
            code: i.Code,
            name: i.Name,
            cost: Number(i.Cost),
            price: Number(i.Price),
            baseUnit: i.BaseUnit,
            itemType: i.ItemType,
            reorderPoint: Number(i.ReorderPoint),
            sectionId: i.SectionId,
            categoryId: i.CategoryId,
            itemGroupId: i.ItemGroupId,
            subCategoryId1: i.SubCategoryId1,
            subCategoryId2: i.SubCategoryId2,
            color: i.Color,
            size: i.Size,
            defaultBinId: i.DefaultBinId,
            barcode: i.Barcode || i.Code,
            barcodeType: i.BarcodeType,
            secondaryUnits: parseJson(i.SecondaryUnitsJson, []),
            components: parseJson(i.ComponentsJson, []),
            isDisabled: !!i.IsDisabled
        }));

        const customers = customersRes.recordset.map(c => ({
            ...c,
            id: c.Id,
            name: c.Name,
            phone: c.Phone,
            address: c.Address,
            allowCredit: !!c.AllowCredit,
            creditLimit: Number(c.CreditLimit),
            openingBalance: Number(c.OpeningBalance),
            currentBalance: Number(c.CurrentBalance),
            invoiceCount: Number(c.InvoiceCount)
        }));

        const suppliers = suppliersRes.recordset.map(s => ({
            ...s,
            id: s.Id,
            name: s.Name,
            contact: s.Contact,
            openingBalance: Number(s.OpeningBalance),
            currentBalance: Number(s.CurrentBalance || 0),
            items: parseJson(s.ItemsJson, [])
        }));

        const warehouses = warehousesRes.recordset.map(w => ({
            ...w,
            id: w.Id,
            code: w.Code,
            name: w.Name,
            address: w.Address
        }));

        const cashAccounts = cashAccountsRes.recordset.map(ca => ({
            ...ca,
            id: ca.Id,
            name: ca.Name,
            type: ca.Type,
            openingBalance: Number(ca.OpeningBalance),
            currentBalance: Number(ca.CurrentBalance || 0),
            userId: ca.UserId,
            warehouseId: ca.WarehouseId
        }));

        // POS & Restaurant
        const heldInvoices = heldInvoicesRes.recordset.map(h => ({
            ...h,
            id: h.Id,
            heldAt: h.HeldAt,
            cashierId: h.CashierId,
            cashierName: h.CashierName,
            terminalId: h.TerminalId,
            tableId: h.TableId,
            customerName: h.CustomerName,
            total: Number(h.Total),
            items: parseJson(h.CartData, [])
        }));

        return NextResponse.json({
            success: true,
            data: {
                // Master Data
                warehouses,
                inventorySections: inventorySectionsRes.recordset.map(s => ({ ...s, id: s.Id || s.id, name: s.Name || s.name, code: s.Code || s.code, allowOverfill: !!s.AllowOverfill })),
                itemSections: itemSectionsRes.recordset.map(s => ({ ...s, id: s.Id || s.id, name: s.Name || s.name, code: s.Code || s.code })),
                itemCategories: itemCategoriesRes.recordset.map(c => ({ ...c, id: c.Id || c.id, name: c.Name || c.name, code: c.Code || c.code, sectionId: c.SectionId || c.sectionId })),
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
                    id: ps.Id,
                    startTime: ps.StartTime ? new Date(ps.StartTime).toISOString() : null,
                    endTime: ps.EndTime ? new Date(ps.EndTime).toISOString() : null,
                    openedBy: ps.OpenedBy,
                    openedByName: ps.OpenedByName,
                    closedBy: ps.ClosedBy,
                    closedByName: ps.ClosedByName,
                    isClosed: !!ps.IsClosed,
                    posTerminalId: ps.PosTerminalId,
                    cashierSessions: parseJson(ps.CashierSessionsJson, {})
                })),
                barcodeDesigns: barcodeDesignsRes.recordset.map(bd => ({ id: bd.Id, name: bd.Name, ...parseJson(bd.ConfigJson, {}) })),
                posTerminals: posTerminalsRes.recordset.map(t => ({ ...t, id: t.Id, name: t.Name || t.name })),
                paymentMethods: paymentMethodsRes.recordset.map(p => ({ ...p, id: p.Id, name: p.Name || p.name })),
                partners: partnersRes.recordset.map(p => ({ ...p, id: p.Id, name: p.Name || p.name })),
                employees: employeesRes.recordset.map(e => ({ ...e, id: e.Id, name: e.Name || e.name })),
                licenses: licensesRes.recordset.map(lic => ({ ...lic, id: lic.Id })),
                deliveryStaff: deliveryStaffRes.recordset.map(d => ({ ...d, id: d.Id, name: d.Name || d.name })),
                sellers: sellersRes.recordset.map(s => ({ ...s, id: s.Id, name: s.Name || s.name })),
                itemGroups: itemGroupsRes.recordset.map(g => ({ ...g, id: g.Id || g.id, name: g.Name || g.name, code: g.Code || g.code, parentCategoryId: g.ParentCategoryId || g.parentCategoryId })),
                itemSubCategories1: itemSubCategories1Res.recordset.map(sc => ({ ...sc, id: sc.Id || sc.id, name: sc.Name || sc.name, code: sc.Code || sc.code })),
                itemSubCategories2: itemSubCategories2Res.recordset.map(sc => ({ ...sc, id: sc.Id || sc.id, name: sc.Name || sc.name, code: sc.Code || sc.code })),
                inventoryZones: inventoryZonesRes.recordset.map(z => ({ ...z, id: z.Id || z.id, name: z.Name || z.name })),
                itemColors: itemColorsRes.recordset.map(c => ({ ...c, id: c.Id || c.id, name: c.Name || c.name })),
                itemSizes: itemSizesRes.recordset.map(s => ({ ...s, id: s.Id || s.id, name: s.Name || s.name })),
                restaurantTables: restaurantTablesRes.recordset.map(t => ({ ...t, id: t.Id })),
                promotions: promotionsRes.recordset.map(p => ({ ...p, id: p.Id })),
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
                requisitions: requisitionsRes.recordset.map(r => ({ ...r, id: r.Id, items: parseItemsArray(r) })),
                
                // Financial Documents
                customerPayments: customerPaymentsRes.recordset.map(cp => ({
                    ...cp,
                    id: cp.Id,
                    receiptNumber: cp.ReceiptNumber,
                    date: cp.Date ? new Date(cp.Date).toISOString() : null,
                    customerId: cp.CustomerId,
                    invoiceId: cp.InvoiceId || null,
                    amount: Number(cp.Amount),
                    paidToAccountId: cp.PaidToAccountId,
                    createdById: cp.CreatedById,
                    createdByName: cp.CreatedByName,
                    notes: cp.Notes || ''
                })),
                supplierPayments: supplierPaymentsRes.recordset.map(sp => ({
                    ...sp,
                    id: sp.Id,
                    receiptNumber: sp.ReceiptNumber,
                    date: sp.Date ? new Date(sp.Date).toISOString() : null,
                    supplierId: sp.SupplierId,
                    invoiceId: sp.InvoiceId || null,
                    amount: Number(sp.Amount),
                    paidFromAccountId: sp.PaidFromAccountId,
                    createdById: sp.CreatedById,
                    createdByName: sp.CreatedByName,
                    notes: sp.Notes || ''
                })),
                expenses: expensesRes.recordset.map(ex => ({
                    ...ex,
                    id: ex.Id,
                    receiptNumber: ex.ReceiptNumber,
                    date: ex.Date ? new Date(ex.Date).toISOString() : null,
                    expenseType: ex.ExpenseType,
                    description: ex.Description,
                    amount: Number(ex.Amount),
                    taxAmount: Number(ex.TaxAmount || 0),
                    warehouseId: ex.WarehouseId,
                    paidFromAccountId: ex.PaidFromAccountId,
                    status: ex.Status || 'approved',
                    createdById: ex.CreatedById,
                    createdByName: ex.CreatedByName
                })),
                treasuryTransactions: treasuryTxRes.recordset.map(tx => ({
                    ...tx,
                    id: tx.Id,
                    receiptNumber: tx.ReceiptNumber,
                    date: tx.Date ? new Date(tx.Date).toISOString() : null,
                    accountId: tx.AccountId,
                    type: tx.Type,
                    amount: Number(tx.Amount),
                    description: tx.Description,
                    linkedTransaction: !!(tx.LinkedTransaction || tx.LinkedTransactionId),
                    linkedTransactionId: tx.LinkedTransactionId,
                    createdById: tx.CreatedById,
                    createdByName: tx.CreatedByName
                })),
                exceptionalIncomes: exceptionalIncomesRes.recordset.map(ei => ({
                    ...ei,
                    id: ei.Id,
                    receiptNumber: ei.ReceiptNumber,
                    date: ei.Date ? new Date(ei.Date).toISOString() : null,
                    incomeType: ei.IncomeType,
                    description: ei.Description,
                    amount: Number(ei.Amount),
                    paidToAccountId: ei.PaidToAccountId,
                    warehouseId: ei.WarehouseId,
                    createdById: ei.CreatedById,
                    createdByName: ei.CreatedByName
                })),
                profitDistributions: profitDistributionsRes.recordset.map(pd => ({
                    ...pd,
                    id: pd.Id,
                    receiptNumber: pd.ReceiptNumber,
                    date: pd.Date ? new Date(pd.Date).toISOString() : null,
                    partnerId: pd.PartnerId,
                    partnerName: pd.PartnerName,
                    amount: Number(pd.Amount),
                    paidFromAccountId: pd.PaidFromAccountId,
                    notes: pd.Notes || '',
                    createdById: pd.CreatedById,
                    createdByName: pd.CreatedByName
                })),
                repRemittances: repRemittancesRes.recordset.map(rr => ({
                    ...rr,
                    id: rr.Id,
                    date: rr.Date ? new Date(rr.Date).toISOString() : null,
                    salesRepId: rr.SalesRepId,
                    userId: rr.SalesRepId,
                    salesRepName: rr.SalesRepName,
                    amount: Number(rr.Amount),
                    toAccountId: rr.ToAccountId,
                    receiptNumber: rr.ReceiptNumber,
                    notes: rr.Notes
                })),
                employeeAdvances: employeeAdvancesRes.recordset.map(ea => ({
                    ...ea,
                    id: ea.Id,
                    date: ea.Date ? new Date(ea.Date).toISOString() : null,
                    employeeId: ea.EmployeeId,
                    amount: Number(ea.Amount),
                    paidFromAccountId: ea.PaidFromAccountId,
                    notes: ea.Notes || ''
                })),
                employeeAdjustments: employeeAdjustmentsRes.recordset.map(adj => ({
                    ...adj,
                    id: adj.Id,
                    date: adj.Date ? new Date(adj.Date).toISOString() : null,
                    employeeId: adj.EmployeeId,
                    employeeName: adj.EmployeeName,
                    type: adj.Type,
                    amount: Number(adj.Amount),
                    reason: adj.Reason || '',
                    createdById: adj.CreatedById,
                    createdByName: adj.CreatedByName
                })),
                payrollRecords: payrollRes.recordset.map(pr => ({
                    ...pr,
                    id: pr.Id,
                    date: pr.Date ? new Date(pr.Date).toISOString() : null,
                    month: pr.Month,
                    paidFromAccountId: pr.PaidFromAccountId,
                    totalAmount: Number(pr.TotalAmount),
                    payrollData: parseJson(pr.DetailsJson, [])
                })),
                fixedAssets: fixedAssetsRes.recordset.map(fa => ({ ...fa, id: fa.Id, purchasePrice: Number(fa.PurchasePrice), currentValue: Number(fa.CurrentValue) })),
                depreciationRecords: depreciationRecordsRes.recordset.map(dr => ({ ...dr, id: dr.Id, amount: Number(dr.Amount) })),

                // Inventory Documents
                stockInRecords: stockInRes.recordset.map(si => ({
                    ...si,
                    id: si.Id,
                    date: si.Date ? new Date(si.Date).toISOString() : null,
                    warehouseId: si.WarehouseId,
                    receiptNumber: si.ReceiptNumber,
                    items: parseItemsArray(si)
                })),
                stockOutRecords: stockOutRes.recordset.map(so => ({
                    ...so,
                    id: so.Id,
                    date: so.Date ? new Date(so.Date).toISOString() : null,
                    warehouseId: so.WarehouseId || so.SourceId,
                    sourceId: so.SourceId || so.WarehouseId,
                    receiptNumber: so.ReceiptNumber,
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
                snoozedRecommendations: [],
                posCounters: {},
                posSales: salesInvoices.filter(s => s.cashierId || !s.invoiceNumber || s.invoiceNumber.startsWith('POS')),
                posReturns: salesReturns.filter(r => !r.receiptNumber || r.receiptNumber.startsWith('POS-RET'))
            }
        });
    } catch (error: any) {
        console.error('Error in /api/db/sync:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
