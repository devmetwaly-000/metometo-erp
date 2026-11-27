import { NextResponse } from 'next/server';
import { getDbPool, sql } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit-logger';
import { calculateInvoiceReturnTotals } from '@/lib/invoice-return-totals';
import { logSystemError } from '@/lib/error-logger';
import { getCentralConfig, connectToCentral } from '@/lib/central-sync';
import { recordRecipeSnapshot } from '@/lib/recipe-history';

async function getBranchInfo(pool: sql.ConnectionPool, explicitBranchCode?: string | null, explicitBranchName?: string | null) {
    if (explicitBranchCode && explicitBranchName) {
        return { branchCode: explicitBranchCode, branchName: explicitBranchName };
    }
    try {
        const syncConfig = await getCentralConfig();
        return {
            branchCode: explicitBranchCode || syncConfig?.currentBranchCode || '900',
            branchName: explicitBranchName || syncConfig?.currentBranchName || 'الفرع الرئيسي'
        };
    } catch {
        return {
            branchCode: explicitBranchCode || '900',
            branchName: explicitBranchName || 'الفرع الرئيسي'
        };
    }
}

class ReturnValidationError extends Error { }

function parseReturnItems(value: unknown): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function validateAndNormalizeReturn(
    tx: sql.Transaction,
    payload: any,
    kind: 'sales' | 'purchase'
) {
    const invoiceTable = kind === 'sales' ? 'dbo.SalesInvoices' : 'dbo.PurchaseInvoices';
    const returnTable = kind === 'sales' ? 'dbo.SalesReturns' : 'dbo.PurchaseReturns';
    const paymentTable = kind === 'sales' ? 'dbo.CustomerPayments' : 'dbo.SupplierPayments';
    const invoiceId = String(payload?.originalInvoiceId || '');
    if (!invoiceId) {
        if (kind === 'purchase' && payload?.isUnlinked) {
            if (!payload.supplierId) throw new ReturnValidationError('يجب تحديد المورد للمرتجع غير المرتبط.');
            if (!payload.warehouseId) throw new ReturnValidationError('يجب تحديد المخزن للمرتجع غير المرتبط.');
            const requestedItems = Array.isArray(payload.items) ? payload.items : [];
            if (!requestedItems.length) throw new ReturnValidationError('يجب إضافة صنف واحد على الأقل للمرتجع.');

            const trustedItems = requestedItems.filter((item: any) => Number(item.qty) > 0).map((item: any) => {
                const qty = Number(item.qty);
                const price = Number(item.price) || 0;
                const avgCost = Number(item.avgCost != null ? item.avgCost : (item.cost != null ? item.cost : price)) || 0;
                const total = Number((qty * price).toFixed(4));
                const inventoryTotal = Number((qty * avgCost).toFixed(4));
                const variance = Number((total - inventoryTotal).toFixed(4));
                return {
                    ...item,
                    id: String(item.id || item.itemId || ''),
                    itemId: String(item.id || item.itemId || ''),
                    name: String(item.name || item.itemName || 'صنف مرتجع'),
                    qty,
                    price,
                    cost: price,
                    avgCost,
                    total,
                    inventoryTotal,
                    variance,
                    unit: item.unit || 'قطعة'
                };
            });
            if (!trustedItems.length) throw new ReturnValidationError('أدخل كمية موجبة لصنف واحد على الأقل.');

            const subtotal = Number(trustedItems.reduce((s: number, i: any) => s + i.total, 0).toFixed(4));
            const totalInventoryCost = Number(trustedItems.reduce((s: number, i: any) => s + i.inventoryTotal, 0).toFixed(4));
            const priceVariance = Number((subtotal - totalInventoryCost).toFixed(4));
            const tax = Number(payload.tax) || 0;
            const total = Number((subtotal + tax).toFixed(4));
            const paidAmount = Number(payload.paidAmount) || 0;

            if (paidAmount > total + 0.01) {
                throw new ReturnValidationError('المبلغ النقدي المسترد لا يمكن أن يتجاوز إجمالي المرتجع.');
            }

            payload.items = trustedItems;
            payload.subtotal = subtotal;
            payload.discount = 0;
            payload.tax = tax;
            payload.total = total;
            payload.paidAmount = paidAmount;
            payload.totalInventoryCost = totalInventoryCost;
            payload.priceVariance = priceVariance;
            payload.isUnlinked = true;
            return;
        }
        throw new ReturnValidationError('يجب ربط المرتجع بفاتورته الأصلية.');
    }

    const invoiceResult = await new sql.Request(tx)
        .input('InvoiceId', sql.NVarChar(64), invoiceId)
        .query(`SELECT TOP 1 Id, CustomerId, SupplierId, WarehouseId, Subtotal, Discount, Tax, Total, PaidAmount, InitialPaidAmount, IsTaxIncluded, Status, ItemsJson
            FROM ${invoiceTable} WITH (UPDLOCK, HOLDLOCK) WHERE Id = @InvoiceId`);
    const invoice = invoiceResult.recordset[0];
    if (!invoice) throw new ReturnValidationError('تعذر العثور على الفاتورة الأصلية للمرتجع.');
    if (kind === 'sales' && invoice.Status && !['approved', 'completed'].includes(String(invoice.Status).toLowerCase())) {
        throw new ReturnValidationError('لا يمكن إرجاع فاتورة بيع غير معتمدة.');
    }

    const sourceItems = parseReturnItems(invoice.ItemsJson);
    const requestedItems = Array.isArray(payload.items) ? payload.items : [];
    if (!sourceItems.length || !requestedItems.length) throw new ReturnValidationError('لا توجد أصناف صالحة في الفاتورة أو المرتجع.');

    const sourceById = new Map<string, { qty: number; value: number; sample: any }>();
    for (const item of sourceItems) {
        const itemId = String(item.id ?? item.itemId ?? '');
        const qty = Number(item.qty) || 0;
        const unitValue = Number(kind === 'sales' ? item.price : item.cost ?? item.price) || 0;
        if (!itemId || qty <= 0) continue;
        const existing = sourceById.get(itemId) || { qty: 0, value: 0, sample: item };
        existing.qty += qty;
        existing.value += qty * unitValue;
        sourceById.set(itemId, existing);
    }

    const previousResult = await new sql.Request(tx)
        .input('InvoiceId', sql.NVarChar(64), invoiceId)
        .query(`SELECT ItemsJson, Total, PaidAmount FROM ${returnTable} WITH (UPDLOCK, HOLDLOCK) WHERE OriginalInvoiceId = @InvoiceId`);
    const previousQty = new Map<string, number>();
    let previousReturnTotal = 0;
    for (const row of previousResult.recordset) {
        previousReturnTotal += Number(row.Total) || 0;
        for (const item of parseReturnItems(row.ItemsJson)) {
            const itemId = String(item.id ?? item.itemId ?? '');
            previousQty.set(itemId, (previousQty.get(itemId) || 0) + (Number(item.qty) || 0));
        }
    }

    const currentQty = new Map<string, number>();
    const trustedItems = requestedItems.filter((item: any) => Number(item.qty) > 0).map((item: any) => {
        const itemId = String(item.id ?? item.itemId ?? '');
        const qty = Number(item.qty);
        const source = sourceById.get(itemId);
        if (!source || !Number.isFinite(qty)) throw new ReturnValidationError('كمية المرتجع غير صالحة أو الصنف غير موجود في الفاتورة الأصلية.');
        currentQty.set(itemId, (currentQty.get(itemId) || 0) + qty);
        if ((previousQty.get(itemId) || 0) + (currentQty.get(itemId) || 0) > source.qty + 0.0001) {
            throw new ReturnValidationError(`كمية المرتجع للصنف ${item.name || source.sample.name || ''} تتجاوز الكمية المتبقية من الفاتورة.`);
        }
        const unitValue = source.value / source.qty;
        const lineTotal = qty * unitValue;
        return { ...item, id: itemId, qty, price: kind === 'sales' ? unitValue : item.price, cost: kind === 'purchase' ? unitValue : item.cost, total: Number(lineTotal.toFixed(4)) };
    });
    if (!trustedItems.length) throw new ReturnValidationError('أدخل كمية موجبة لصنف واحد على الأقل.');

    const subtotal = Number(trustedItems.reduce((sum: number, item: any) => sum + item.total, 0).toFixed(4));
    const normalizedInvoice = {
        subtotal: Number(invoice.Subtotal) || 0,
        discount: Number(invoice.Discount) || 0,
        tax: Number(invoice.Tax) || 0,
        isTaxIncluded: Boolean(invoice.IsTaxIncluded),
    };
    const totals = calculateInvoiceReturnTotals(normalizedInvoice, subtotal);
    const originalTotal = Number(invoice.Total) || Math.max(0, normalizedInvoice.subtotal - normalizedInvoice.discount + (normalizedInvoice.isTaxIncluded ? 0 : normalizedInvoice.tax));
    if (previousReturnTotal + totals.total > originalTotal + 0.01) {
        throw new ReturnValidationError('إجمالي المرتجعات يتجاوز قيمة الفاتورة الأصلية بعد احتساب المرتجعات السابقة.');
    }

    const paymentResult = await new sql.Request(tx)
        .input('InvoiceId', sql.NVarChar(64), invoiceId)
        .query(`SELECT COALESCE(SUM(Amount), 0) AS LinkedPayments FROM ${paymentTable} WHERE InvoiceId = @InvoiceId`);
    const linkedPayments = Number(paymentResult.recordset[0]?.LinkedPayments) || 0;
    const initialPaid = invoice.InitialPaidAmount != null
        ? Number(invoice.InitialPaidAmount) || 0
        : Math.max((Number(invoice.PaidAmount) || 0) - linkedPayments, 0);
    const previouslyReturned = previousReturnTotal;
    const refundableRemaining = Math.max(0, initialPaid + linkedPayments - previouslyReturned);
    const paidAmount = Number(payload.paidAmount) || 0;
    if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > totals.total + 0.01) {
        throw new ReturnValidationError('المبلغ النقدي للمرتجع لا يمكن أن يتجاوز إجمالي المرتجع.');
    }
    if (paidAmount > refundableRemaining + 0.01) {
        throw new ReturnValidationError('المبلغ النقدي يتجاوز ما تم تحصيله أو دفعه فعليًا بعد احتساب المرتجعات السابقة.');
    }

    payload.items = trustedItems;
    payload.subtotal = subtotal;
    payload.discount = totals.discount;
    payload.tax = totals.tax;
    payload.total = totals.total;
    payload.paidAmount = paidAmount;
    payload.warehouseId = invoice.WarehouseId;
    if (kind === 'sales') payload.customerId = invoice.CustomerId || payload.customerId || null;
    else payload.supplierId = invoice.SupplierId || payload.supplierId || null;
    return invoice;
}

async function ensureRepWarehouseAndAccount(pool: sql.ConnectionPool, userId: string, userName: string, currentWarehouseIds?: any) {
    if (!userId) return;
    try {
        const whCheck = await pool.request()
            .input('RepId', sql.NVarChar(64), userId)
            .query(`SELECT Id, Name, Code FROM dbo.Warehouses WHERE RepId = @RepId`);

        let repWarehouseId = whCheck.recordset[0]?.Id;
        if (!repWarehouseId) {
            const countRes = await pool.request().query(`SELECT COUNT(*) as cnt FROM dbo.Warehouses WHERE IsRepWarehouse = 1 OR WarehouseType = 'rep'`);
            const repNum = (countRes.recordset[0]?.cnt || 0) + 1;
            const repCode = `REP-${String(repNum).padStart(2, '0')}`;
            repWarehouseId = `rep_wh_${userId}`;
            const repWarehouseName = `عهدة المندوب: ${userName || 'مندوب'}`;

            await pool.request()
                .input('Id', sql.NVarChar(64), repWarehouseId)
                .input('Code', sql.NVarChar(50), repCode)
                .input('Name', sql.NVarChar(255), repWarehouseName)
                .input('WarehouseType', sql.NVarChar(50), 'rep')
                .input('IsRepWarehouse', sql.Bit, 1)
                .input('IsMain', sql.Bit, 0)
                .input('IsClosed', sql.Bit, 0)
                .input('RepId', sql.NVarChar(64), userId)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.Warehouses WHERE Id = @Id OR RepId = @RepId)
                    BEGIN
                        INSERT INTO dbo.Warehouses (Id, Code, Name, WarehouseType, IsRepWarehouse, IsMain, IsClosed, RepId, BranchCode, BranchName, SyncStatus)
                        VALUES (@Id, @Code, @Name, @WarehouseType, @IsRepWarehouse, @IsMain, @IsClosed, @RepId, @Code, @Name, 'synced');
                    END
                `);
        }

        const cashCheck = await pool.request()
            .input('UserId', sql.NVarChar(64), userId)
            .query(`SELECT Id FROM dbo.CashAccounts WHERE UserId = @UserId`);

        if (cashCheck.recordset.length === 0) {
            const repCashId = `rep_cash_${userId}`;
            const repCashName = `عهدة: ${userName || 'مندوب'}`;
            await pool.request()
                .input('Id', sql.NVarChar(64), repCashId)
                .input('Name', sql.NVarChar(255), repCashName)
                .input('Type', sql.NVarChar(50), 'cash')
                .input('OpeningBalance', sql.Decimal(18, 4), 0)
                .input('UserId', sql.NVarChar(64), userId)
                .input('WarehouseId', sql.NVarChar(64), repWarehouseId)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.CashAccounts WHERE Id = @Id OR UserId = @UserId)
                    BEGIN
                        INSERT INTO dbo.CashAccounts (Id, Name, Type, OpeningBalance, UserId, WarehouseId)
                        VALUES (@Id, @Name, @Type, @OpeningBalance, @UserId, @WarehouseId);
                    END
                `);
        }

        const userRes = await pool.request()
            .input('Id', sql.NVarChar(64), userId)
            .query(`SELECT WarehouseIds FROM dbo.Users WHERE Id = @Id`);

        if (userRes.recordset.length > 0) {
            let existingWids: string[] = [];
            try {
                const raw = userRes.recordset[0].WarehouseIds;
                existingWids = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
            } catch {
                existingWids = [];
            }
            if (!Array.isArray(existingWids)) existingWids = [];
            if (!existingWids.includes(repWarehouseId)) {
                existingWids.push(repWarehouseId);
                await pool.request()
                    .input('Id', sql.NVarChar(64), userId)
                    .input('WarehouseIds', sql.NVarChar(sql.MAX), JSON.stringify(existingWids))
                    .query(`UPDATE dbo.Users SET WarehouseIds = @WarehouseIds WHERE Id = @Id`);
            }
        }
    } catch (e: any) {
        console.error('ensureRepWarehouseAndAccount error:', e.message);
    }
}

export async function POST(req: Request) {
    let body: any = null;
    try {
        body = await req.json();
        const { path: rawPath, action, payload, counterName, startFrom } = body;

        const { getLocalDbConfig } = await import('@/lib/db');
        const localCfg = getLocalDbConfig();
        const serverName = String(localCfg.server || '').toLowerCase().trim();
        if (serverName === 'indexeddb' || serverName.includes('indexeddb') || serverName === 'browser') {
            if (action === 'getNextId') {
                const initial = Number(startFrom) || 1;
                return NextResponse.json({ success: true, nextId: initial });
            }
            return NextResponse.json({
                success: true,
                id: payload?.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                isIndexedDb: true,
                message: 'تم الحفظ في المتصفح المحلي (IndexedDB)'
            });
        }

        const pool = await getDbPool();

        // 1. Atomic Counter Sequence Increment (getNextId)
        if (action === 'getNextId') {
            const name = counterName || 'default';
            const initial = Number(startFrom) || 1;

            const res = await pool.request()
                .input('Name', sql.NVarChar(100), name)
                .input('Initial', sql.BigInt, initial)
                .query(`
                    DECLARE @Result TABLE (Val BIGINT);
                    MERGE dbo.Counters WITH (HOLDLOCK) AS target
                    USING (SELECT @Name AS Name) AS source
                    ON (target.Name = source.Name)
                    WHEN MATCHED THEN
                        UPDATE SET CurrentValue = target.CurrentValue + 1
                    WHEN NOT MATCHED THEN
                        INSERT (Name, CurrentValue) VALUES (source.Name, @Initial)
                    OUTPUT INSERTED.CurrentValue INTO @Result;
                    SELECT Val AS CurrentValue FROM @Result;
                `);

            const nextVal = Number(res.recordset[0]?.CurrentValue) || initial;
            return NextResponse.json({ success: true, nextId: nextVal });
        }

        // Clean collection path
        const path = rawPath ? rawPath.split('/')[0] : '';
        const id = payload?.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const jsonString = (val: any) => (val !== undefined && val !== null ? JSON.stringify(val) : null);
        const parseDate = (d: any) => (d ? new Date(d) : new Date());
        const recalculateInvoicePaymentImpact = async (
            tx: sql.Transaction,
            kind: 'customer' | 'supplier',
            invoiceId: string
        ) => {
            const invoiceTable = kind === 'customer' ? 'dbo.SalesInvoices' : 'dbo.PurchaseInvoices';
            const paymentTable = kind === 'customer' ? 'dbo.CustomerPayments' : 'dbo.SupplierPayments';
            await new sql.Request(tx)
                .input('InvoiceId', sql.NVarChar(64), invoiceId)
                .query(`
                    UPDATE inv
                    SET InitialPaidAmount = base.InitialAmount,
                        PaidAmount = base.InitialAmount + COALESCE(pay.TotalPaid, 0),
                        UpdatedAt = SYSUTCDATETIME()
                    FROM ${invoiceTable} inv
                    OUTER APPLY (SELECT SUM(Amount) AS TotalPaid FROM ${paymentTable} WHERE InvoiceId = inv.Id) pay
                    CROSS APPLY (SELECT COALESCE(inv.InitialPaidAmount,
                        CASE WHEN inv.PaidAmount >= COALESCE(pay.TotalPaid, 0)
                            THEN inv.PaidAmount - COALESCE(pay.TotalPaid, 0)
                            ELSE inv.PaidAmount END) AS InitialAmount) base
                    WHERE inv.Id = @InvoiceId;
                `);
        };

        if (action === 'recalculatePaymentEffects') {
            const tx = new sql.Transaction(pool);
            await tx.begin();
            try {
                const results: Record<string, number> = {};
                for (const kind of ['customer', 'supplier'] as const) {
                    const invoiceTable = kind === 'customer' ? 'dbo.SalesInvoices' : 'dbo.PurchaseInvoices';
                    const paymentTable = kind === 'customer' ? 'dbo.CustomerPayments' : 'dbo.SupplierPayments';
                    const result = await new sql.Request(tx).query(`
                        UPDATE inv
                        SET InitialPaidAmount = base.InitialAmount,
                            PaidAmount = base.InitialAmount + COALESCE(pay.TotalPaid, 0),
                            UpdatedAt = SYSUTCDATETIME()
                        FROM ${invoiceTable} inv
                        OUTER APPLY (SELECT SUM(Amount) AS TotalPaid FROM ${paymentTable} WHERE InvoiceId = inv.Id) pay
                        CROSS APPLY (SELECT COALESCE(inv.InitialPaidAmount,
                            CASE WHEN inv.PaidAmount >= COALESCE(pay.TotalPaid, 0)
                                THEN inv.PaidAmount - COALESCE(pay.TotalPaid, 0)
                                ELSE inv.PaidAmount END) AS InitialAmount) base;
                        SELECT @@ROWCOUNT AS UpdatedCount;
                    `);
                    results[kind] = Number(result.recordset[0]?.UpdatedCount || 0);
                }
                await tx.commit();
                return NextResponse.json({ success: true, updatedInvoices: results });
            } catch (error) {
                await tx.rollback();
                throw error;
            }
        }

        const checkIsCentral = async (): Promise<boolean> => {
            try {
                const res = await pool.request().query("SELECT SettingKey, SettingValue FROM dbo.AppSettings WHERE SettingKey IN ('system_role', 'central_sync')");
                for (const row of res.recordset) {
                    if (row.SettingKey === 'system_role' && row.SettingValue === 'central') return true;
                    if (row.SettingKey === 'central_sync' && row.SettingValue) {
                        try {
                            const parsed = JSON.parse(row.SettingValue);
                            if (parsed?.systemRole === 'central') return true;
                        } catch { }
                    }
                }
            } catch { }
            return false;
        };

        // Automatic Immutable Audit Trail Hook (Non-blocking)
        if ((action === 'add' || action === 'update' || action === 'remove') && path && path !== 'loginHistory') {
            const auditActionMap: Record<string, 'INSERT' | 'UPDATE' | 'DELETE'> = {
                add: 'INSERT',
                update: 'UPDATE',
                remove: 'DELETE'
            };
            const targetId = payload?.id || id;
            const userId = payload?.createdById || payload?.cashierId || payload?.userId || payload?.data?.updatedBy || 'system';
            const userName = payload?.createdByName || payload?.cashierName || payload?.userName || 'مستخدم النظام';
            const docNum = payload?.invoiceNumber || payload?.receiptNumber || payload?.code || payload?.name || payload?.data?.name || '';
            logAuditEvent({
                action: auditActionMap[action] || 'UPDATE',
                entity: path,
                entityId: String(targetId),
                userId: String(userId),
                userName: String(userName),
                details: `${action === 'add' ? 'إضافة' : action === 'update' ? 'تعديل' : 'حذف'} في جدول [${path}] ${docNum ? `- (${docNum})` : ''}`,
                newState: action === 'remove' ? { deletedId: targetId } : (payload?.data || payload)
            }).catch(() => { });
        }

        // =====================================================================
        // ACTION: ADD (Document Principle: Every action generates a source record)
        // =====================================================================
        if (action === 'add') {
            // Commercial: Sales Invoices & POS Sales
            if (path === 'salesInvoices' || path === 'posSales' || path.startsWith('posSales')) {
                if (path === 'posSales' || path.startsWith('posSales') || payload.cashierId || payload.isPos) {
                    if (await checkIsCentral()) {
                        return NextResponse.json({
                            success: false,
                            error: "محظور: لا يمكن تسجيل حركات بيع كاشير في الإدارة المركزية. حركات البيع تصدر حصراً من فروع البيع."
                        }, { status: 403 });
                    }
                }
                const tx = new sql.Transaction(pool);
                await tx.begin();
                try {
                    const reqTx = new sql.Request(tx);
                    reqTx.input('Id', sql.NVarChar(64), id)
                        .input('InvoiceNumber', sql.NVarChar(100), payload.invoiceNumber ? String(payload.invoiceNumber) : null)
                        .input('Date', sql.DateTime2, parseDate(payload.date))
                        .input('CustomerId', sql.NVarChar(64), payload.customerId || null)
                        .input('CustomerName', sql.NVarChar(255), payload.customerName || null)
                        .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                        .input('SalesRepId', sql.NVarChar(64), payload.salesRepId || null)
                        .input('CashierId', sql.NVarChar(64), payload.cashierId || null)
                        .input('Subtotal', sql.Decimal(18, 4), Number(payload.subtotal) || 0)
                        .input('Discount', sql.Decimal(18, 4), Number(payload.discount) || 0)
                        .input('Tax', sql.Decimal(18, 4), Number(payload.tax) || 0)
                        .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                        .input('PaidAmount', sql.Decimal(18, 4), Number(payload.paidAmount) || 0)
                        .input('InitialPaidAmount', sql.Decimal(18, 4), Number(payload.paidAmount) || 0)
                        .input('PaidToAccountId', sql.NVarChar(64), payload.paidToAccountId || null)
                        .input('Status', sql.NVarChar(50), payload.status || 'approved')
                        .input('IsDelivery', sql.Bit, payload.isDelivery ? 1 : 0)
                        .input('DeliveryReconciled', sql.Bit, payload.deliveryReconciled ? 1 : 0)
                        .input('IsTaxIncluded', sql.Bit, payload.isTaxIncluded ? 1 : 0)
                        .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                        .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items));

                    await reqTx.query(`
                        INSERT INTO dbo.SalesInvoices (
                            Id, InvoiceNumber, Date, CustomerId, CustomerName, WarehouseId, SalesRepId, CashierId,
                            Subtotal, Discount, Tax, Total, PaidAmount, InitialPaidAmount, PaidToAccountId, Status, IsDelivery,
                            DeliveryReconciled, IsTaxIncluded, Notes, ItemsJson
                        )
                        VALUES (
                            @Id, @InvoiceNumber, @Date, @CustomerId, @CustomerName, @WarehouseId, @SalesRepId, @CashierId,
                            @Subtotal, @Discount, @Tax, @Total, @PaidAmount, @InitialPaidAmount, @PaidToAccountId, @Status, @IsDelivery,
                            @DeliveryReconciled, @IsTaxIncluded, @Notes, @ItemsJson
                        );
                    `);

                    if (Array.isArray(payload.items)) {
                        for (const itm of payload.items) {
                            const itmReq = new sql.Request(tx);
                            itmReq.input('InvoiceId', sql.NVarChar(64), id)
                                .input('ItemId', sql.NVarChar(64), itm.id || itm.itemId || null)
                                .input('ItemCode', sql.NVarChar(100), itm.code ? String(itm.code) : null)
                                .input('ItemName', sql.NVarChar(255), itm.name || 'Item')
                                .input('Qty', sql.Decimal(18, 4), Number(itm.qty) || 1)
                                .input('Price', sql.Decimal(18, 4), Number(itm.price) || 0)
                                .input('Cost', sql.Decimal(18, 4), Number(itm.cost) || 0)
                                .input('Total', sql.Decimal(18, 4), Number(itm.total) || 0);

                            await itmReq.query(`
                                INSERT INTO dbo.SalesInvoiceItems (InvoiceId, ItemId, ItemCode, ItemName, Qty, Price, Cost, Total)
                                VALUES (@InvoiceId, @ItemId, @ItemCode, @ItemName, @Qty, @Price, @Cost, @Total);
                            `);
                        }
                    }

                    await tx.commit();
                    return NextResponse.json({ success: true, id });
                } catch (err) {
                    await tx.rollback();
                    throw err;
                }
            }

            // Commercial: Sales Returns & POS Returns
            if (path === 'salesReturns' || path === 'posReturns' || path.startsWith('posReturns')) {
                await pool.request().query(`
                    IF COL_LENGTH('dbo.SalesReturns', 'CustomerName') IS NULL ALTER TABLE dbo.SalesReturns ADD CustomerName NVARCHAR(255) NULL;
                    IF COL_LENGTH('dbo.SalesReturns', 'Discount') IS NULL ALTER TABLE dbo.SalesReturns ADD Discount DECIMAL(18,4) NOT NULL CONSTRAINT DF_SalesReturns_Discount DEFAULT ((0));
                    IF COL_LENGTH('dbo.SalesReturns', 'Tax') IS NULL ALTER TABLE dbo.SalesReturns ADD Tax DECIMAL(18,4) NOT NULL CONSTRAINT DF_SalesReturns_Tax DEFAULT ((0));
                `);
                if (path === 'posReturns' || path.startsWith('posReturns') || payload.cashierId || payload.isPos) {
                    if (await checkIsCentral()) {
                        return NextResponse.json({
                            success: false,
                            error: "محظور: لا يمكن تسجيل مرتجعات كاشير في الإدارة المركزية. مرتجعات الكاشير تصدر حصراً من فروع البيع."
                        }, { status: 403 });
                    }
                }
                const tx = new sql.Transaction(pool);
                await tx.begin();
                try {
                    await validateAndNormalizeReturn(tx, payload, 'sales');
                    const reqTx = new sql.Request(tx);
                    reqTx.input('Id', sql.NVarChar(64), id)
                        .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                        .input('OriginalInvoiceId', sql.NVarChar(64), payload.originalInvoiceId || null)
                        .input('Date', sql.DateTime2, parseDate(payload.date))
                        .input('CustomerId', sql.NVarChar(64), payload.customerId || null)
                        .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                        .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                        .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                        .input('Subtotal', sql.Decimal(18, 4), Number(payload.subtotal) || 0)
                        .input('Discount', sql.Decimal(18, 4), Number(payload.discount) || 0)
                        .input('Tax', sql.Decimal(18, 4), Number(payload.tax) || 0)
                        .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                        .input('PaidAmount', sql.Decimal(18, 4), Number(payload.paidAmount) || 0)
                        .input('InitialPaidAmount', sql.Decimal(18, 4), Number(payload.paidAmount) || 0)
                        .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || null)
                        .input('CustomerName', sql.NVarChar(255), payload.customerName || null)
                        .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                        .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items));

                    await reqTx.query(`
                        INSERT INTO dbo.SalesReturns (
                            Id, ReceiptNumber, OriginalInvoiceId, Date, CustomerId, WarehouseId,
                            CreatedById, CreatedByName, Subtotal, Discount, Tax, Total, PaidAmount, PaidFromAccountId, CustomerName, Notes, ItemsJson
                        )
                        VALUES (
                            @Id, @ReceiptNumber, @OriginalInvoiceId, @Date, @CustomerId, @WarehouseId,
                            @CreatedById, @CreatedByName, @Subtotal, @Discount, @Tax, @Total, @PaidAmount, @PaidFromAccountId, @CustomerName, @Notes, @ItemsJson
                        );
                    `);

                    if (Array.isArray(payload.items)) {
                        for (const itm of payload.items) {
                            const itmReq = new sql.Request(tx);
                            itmReq.input('ReturnId', sql.NVarChar(64), id)
                                .input('ItemId', sql.NVarChar(64), itm.id || itm.itemId || null)
                                .input('ItemCode', sql.NVarChar(100), itm.code ? String(itm.code) : null)
                                .input('ItemName', sql.NVarChar(255), itm.name || 'Item')
                                .input('Qty', sql.Decimal(18, 4), Number(itm.qty) || 1)
                                .input('Price', sql.Decimal(18, 4), Number(itm.price) || 0)
                                .input('Cost', sql.Decimal(18, 4), Number(itm.cost) || 0)
                                .input('Total', sql.Decimal(18, 4), Number(itm.total) || 0);

                            await itmReq.query(`
                                INSERT INTO dbo.SalesReturnItems (ReturnId, ItemId, ItemCode, ItemName, Qty, Price, Cost, Total)
                                VALUES (@ReturnId, @ItemId, @ItemCode, @ItemName, @Qty, @Price, @Cost, @Total);
                            `);
                        }
                    }

                    await tx.commit();
                    return NextResponse.json({ success: true, id });
                } catch (err) {
                    await tx.rollback();
                    throw err;
                }
            }

            // Commercial: Purchase Invoices
            if (path === 'purchaseInvoices') {
                const tx = new sql.Transaction(pool);
                await tx.begin();
                try {
                    const reqTx = new sql.Request(tx);
                    reqTx.input('Id', sql.NVarChar(64), id)
                        .input('InvoiceNumber', sql.NVarChar(100), payload.invoiceNumber ? String(payload.invoiceNumber) : null)
                        .input('BatchNumber', sql.NVarChar(100), payload.batchNumber ? String(payload.batchNumber) : null)
                        .input('Date', sql.DateTime2, parseDate(payload.date))
                        .input('DueDate', sql.DateTime2, payload.dueDate ? parseDate(payload.dueDate) : null)
                        .input('SupplierId', sql.NVarChar(64), payload.supplierId || null)
                        .input('SupplierName', sql.NVarChar(255), payload.supplierName || null)
                        .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                        .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                        .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                        .input('Subtotal', sql.Decimal(18, 4), Number(payload.subtotal) || 0)
                        .input('Discount', sql.Decimal(18, 4), Number(payload.discount) || 0)
                        .input('Tax', sql.Decimal(18, 4), Number(payload.tax) || 0)
                        .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                        .input('PaidAmount', sql.Decimal(18, 4), Number(payload.paidAmount) || 0)
                        .input('InitialPaidAmount', sql.Decimal(18, 4), Number(payload.initialPaidAmount ?? payload.paidAmount) || 0)
                        .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || null)
                        .input('IsTaxIncluded', sql.Bit, payload.isTaxIncluded ? 1 : 0)
                        .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                        .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items));

                    await reqTx.query(`
                        INSERT INTO dbo.PurchaseInvoices (
                            Id, InvoiceNumber, BatchNumber, Date, DueDate, SupplierId, SupplierName, WarehouseId,
                            CreatedById, CreatedByName, Subtotal, Discount, Tax, Total, PaidAmount, InitialPaidAmount, PaidFromAccountId,
                            IsTaxIncluded, Notes, ItemsJson
                        )
                        VALUES (
                            @Id, @InvoiceNumber, @BatchNumber, @Date, @DueDate, @SupplierId, @SupplierName, @WarehouseId,
                            @CreatedById, @CreatedByName, @Subtotal, @Discount, @Tax, @Total, @PaidAmount, @InitialPaidAmount, @PaidFromAccountId,
                            @IsTaxIncluded, @Notes, @ItemsJson
                        );
                    `);

                    if (Array.isArray(payload.items)) {
                        for (const itm of payload.items) {
                            const itmReq = new sql.Request(tx);
                            itmReq.input('PurchaseInvoiceId', sql.NVarChar(64), id)
                                .input('ItemId', sql.NVarChar(64), itm.id || itm.itemId || null)
                                .input('ItemCode', sql.NVarChar(100), itm.code ? String(itm.code) : null)
                                .input('ItemName', sql.NVarChar(255), itm.name || 'Item')
                                .input('Qty', sql.Decimal(18, 4), Number(itm.qty) || 1)
                                .input('OriginalQty', sql.Decimal(18, 4), Number(itm.originalQty) || null)
                                .input('OriginalUnit', sql.NVarChar(50), itm.originalUnit || null)
                                .input('ConversionFactor', sql.Decimal(18, 4), Number(itm.conversionFactor) || 1)
                                .input('Cost', sql.Decimal(18, 4), Number(itm.cost) || 0)
                                .input('SellingPrice', sql.Decimal(18, 4), Number(itm.sellingPrice) || 0)
                                .input('Total', sql.Decimal(18, 4), Number(itm.total) || 0);

                            await itmReq.query(`
                                INSERT INTO dbo.PurchaseInvoiceItems (PurchaseInvoiceId, ItemId, ItemCode, ItemName, Qty, OriginalQty, OriginalUnit, ConversionFactor, Cost, SellingPrice, Total)
                                VALUES (@PurchaseInvoiceId, @ItemId, @ItemCode, @ItemName, @Qty, @OriginalQty, @OriginalUnit, @ConversionFactor, @Cost, @SellingPrice, @Total);
                            `);
                        }
                    }

                    await tx.commit();
                    return NextResponse.json({ success: true, id });
                } catch (err) {
                    await tx.rollback();
                    throw err;
                }
            }

            // Commercial: Purchase Returns
            if (path === 'purchaseReturns') {
                await pool.request().query(`
                    IF COL_LENGTH('dbo.PurchaseReturns', 'SupplierName') IS NULL ALTER TABLE dbo.PurchaseReturns ADD SupplierName NVARCHAR(255) NULL;
                    IF COL_LENGTH('dbo.PurchaseReturns', 'Discount') IS NULL ALTER TABLE dbo.PurchaseReturns ADD Discount DECIMAL(18,4) NOT NULL CONSTRAINT DF_PurchaseReturns_Discount DEFAULT ((0));
                    IF COL_LENGTH('dbo.PurchaseReturns', 'Tax') IS NULL ALTER TABLE dbo.PurchaseReturns ADD Tax DECIMAL(18,4) NOT NULL CONSTRAINT DF_PurchaseReturns_Tax DEFAULT ((0));
                    IF COL_LENGTH('dbo.PurchaseReturns', 'IsUnlinked') IS NULL ALTER TABLE dbo.PurchaseReturns ADD IsUnlinked BIT NOT NULL CONSTRAINT DF_PurchaseReturns_IsUnlinked DEFAULT ((0));
                    IF COL_LENGTH('dbo.PurchaseReturns', 'TotalInventoryCost') IS NULL ALTER TABLE dbo.PurchaseReturns ADD TotalInventoryCost DECIMAL(18,4) NULL;
                    IF COL_LENGTH('dbo.PurchaseReturns', 'PriceVariance') IS NULL ALTER TABLE dbo.PurchaseReturns ADD PriceVariance DECIMAL(18,4) NULL;
                `);
                const tx = new sql.Transaction(pool);
                await tx.begin();
                try {
                    await validateAndNormalizeReturn(tx, payload, 'purchase');
                    const reqTx = new sql.Request(tx);
                    reqTx.input('Id', sql.NVarChar(64), id)
                        .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                        .input('OriginalInvoiceId', sql.NVarChar(64), payload.originalInvoiceId || null)
                        .input('Date', sql.DateTime2, parseDate(payload.date))
                        .input('SupplierId', sql.NVarChar(64), payload.supplierId || null)
                        .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                        .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                        .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                        .input('Subtotal', sql.Decimal(18, 4), Number(payload.subtotal) || 0)
                        .input('Discount', sql.Decimal(18, 4), Number(payload.discount) || 0)
                        .input('Tax', sql.Decimal(18, 4), Number(payload.tax) || 0)
                        .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                        .input('PaidAmount', sql.Decimal(18, 4), Number(payload.paidAmount) || 0)
                        .input('PaidToAccountId', sql.NVarChar(64), payload.paidToAccountId || null)
                        .input('SupplierName', sql.NVarChar(255), payload.supplierName || null)
                        .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                        .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                        .input('IsUnlinked', sql.Bit, payload.isUnlinked ? 1 : 0)
                        .input('TotalInventoryCost', sql.Decimal(18, 4), payload.totalInventoryCost != null ? Number(payload.totalInventoryCost) : null)
                        .input('PriceVariance', sql.Decimal(18, 4), payload.priceVariance != null ? Number(payload.priceVariance) : null);

                    await reqTx.query(`
                        INSERT INTO dbo.PurchaseReturns (
                            Id, ReceiptNumber, OriginalInvoiceId, Date, SupplierId, WarehouseId,
                            CreatedById, CreatedByName, Subtotal, Discount, Tax, Total, PaidAmount, PaidToAccountId, SupplierName, Notes, ItemsJson,
                            IsUnlinked, TotalInventoryCost, PriceVariance
                        )
                        VALUES (
                            @Id, @ReceiptNumber, @OriginalInvoiceId, @Date, @SupplierId, @WarehouseId,
                            @CreatedById, @CreatedByName, @Subtotal, @Discount, @Tax, @Total, @PaidAmount, @PaidToAccountId, @SupplierName, @Notes, @ItemsJson,
                            @IsUnlinked, @TotalInventoryCost, @PriceVariance
                        );
                    `);

                    await tx.commit();
                    return NextResponse.json({ success: true, id });
                } catch (err) {
                    await tx.rollback();
                    throw err;
                }
            }

            // Commercial: Purchase Orders & Requisitions
            if (path === 'purchaseOrders') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('OrderNumber', sql.NVarChar(100), payload.orderNumber ? String(payload.orderNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('ExpectedDate', sql.DateTime2, payload.expectedDate ? parseDate(payload.expectedDate) : null)
                    .input('SupplierId', sql.NVarChar(64), payload.supplierId || null)
                    .input('SupplierName', sql.NVarChar(255), payload.supplierName || null)
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'pending')
                    .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.PurchaseOrders (Id, OrderNumber, Date, ExpectedDate, SupplierId, SupplierName, WarehouseId, Status, Total, CreatedById, CreatedByName, Notes, ItemsJson)
                        VALUES (@Id, @OrderNumber, @Date, @ExpectedDate, @SupplierId, @SupplierName, @WarehouseId, @Status, @Total, @CreatedById, @CreatedByName, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'requisitions') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('RequisitionNumber', sql.NVarChar(100), payload.requisitionNumber ? String(payload.requisitionNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || payload.fromWarehouseId || null)
                    .input('FromWarehouseId', sql.NVarChar(64), payload.fromWarehouseId || payload.warehouseId || null)
                    .input('ToWarehouseId', sql.NVarChar(64), payload.toWarehouseId || null)
                    .input('RequestedById', sql.NVarChar(64), payload.requestedById || payload.userId || null)
                    .input('RequestedByName', sql.NVarChar(255), payload.requestedByName || payload.userName || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'pending')
                    .input('Priority', sql.NVarChar(50), payload.priority || 'normal')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .input('DetailsJson', sql.NVarChar(sql.MAX), jsonString(payload))
                    .query(`
                        INSERT INTO dbo.Requisitions (Id, RequisitionNumber, Date, WarehouseId, FromWarehouseId, ToWarehouseId, RequestedById, RequestedByName, Status, Priority, Notes, ItemsJson, DetailsJson)
                        VALUES (@Id, @RequisitionNumber, @Date, @WarehouseId, @FromWarehouseId, @ToWarehouseId, @RequestedById, @RequestedByName, @Status, @Priority, @Notes, @ItemsJson, @DetailsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'snoozedRecommendations') {
                const sId = payload.id || id || `snooze_${Date.now()}`;
                await pool.request()
                    .input('Id', sql.NVarChar(64), sId)
                    .input('ItemId', sql.NVarChar(64), String(payload.itemId))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('SnoozedUntil', sql.DateTime2, parseDate(payload.snoozedUntil))
                    .input('Reason', sql.NVarChar(255), payload.reason || 'Snoozed by user')
                    .query(`
                        MERGE dbo.SnoozedRecommendations AS target
                        USING (SELECT @Id AS Id) AS source
                        ON (target.Id = source.Id OR (target.ItemId = @ItemId AND (target.WarehouseId = @WarehouseId OR (target.WarehouseId IS NULL AND @WarehouseId IS NULL))))
                        WHEN MATCHED THEN
                            UPDATE SET SnoozedUntil = @SnoozedUntil, Reason = @Reason, UpdatedAt = SYSUTCDATETIME()
                        WHEN NOT MATCHED THEN
                            INSERT (Id, ItemId, WarehouseId, SnoozedUntil, Reason)
                            VALUES (@Id, @ItemId, @WarehouseId, @SnoozedUntil, @Reason);
                    `);
                return NextResponse.json({ success: true, id: sId });
            }

            // Financial Documents
            if (path === 'customerPayments') {
                const tx = new sql.Transaction(pool);
                await tx.begin();
                try {
                    await new sql.Request(tx)
                        .input('Id', sql.NVarChar(64), id)
                        .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                        .input('Date', sql.DateTime2, parseDate(payload.date))
                        .input('CustomerId', sql.NVarChar(64), payload.customerId || '')
                        .input('InvoiceId', sql.NVarChar(64), payload.invoiceId || null)
                        .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                        .input('PaidToAccountId', sql.NVarChar(64), payload.paidToAccountId || 'main-cash')
                        .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                        .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                        .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                        .query(`
                            INSERT INTO dbo.CustomerPayments (Id, ReceiptNumber, Date, CustomerId, InvoiceId, Amount, PaidToAccountId, CreatedById, CreatedByName, Notes)
                            VALUES (@Id, @ReceiptNumber, @Date, @CustomerId, @InvoiceId, @Amount, @PaidToAccountId, @CreatedById, @CreatedByName, @Notes);
                        `);
                    if (payload.invoiceId) await recalculateInvoicePaymentImpact(tx, 'customer', String(payload.invoiceId));
                    await tx.commit();
                } catch (error) {
                    await tx.rollback();
                    throw error;
                }
                return NextResponse.json({ success: true, id });
            }

            if (path === 'supplierPayments') {
                const tx = new sql.Transaction(pool);
                await tx.begin();
                try {
                    await new sql.Request(tx)
                        .input('Id', sql.NVarChar(64), id)
                        .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                        .input('Date', sql.DateTime2, parseDate(payload.date))
                        .input('SupplierId', sql.NVarChar(64), payload.supplierId || '')
                        .input('InvoiceId', sql.NVarChar(64), payload.invoiceId || null)
                        .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                        .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || 'main-cash')
                        .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                        .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                        .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                        .query(`
                            INSERT INTO dbo.SupplierPayments (Id, ReceiptNumber, Date, SupplierId, InvoiceId, Amount, PaidFromAccountId, CreatedById, CreatedByName, Notes)
                            VALUES (@Id, @ReceiptNumber, @Date, @SupplierId, @InvoiceId, @Amount, @PaidFromAccountId, @CreatedById, @CreatedByName, @Notes);
                        `);
                    if (payload.invoiceId) await recalculateInvoicePaymentImpact(tx, 'supplier', String(payload.invoiceId));
                    await tx.commit();
                } catch (error) {
                    await tx.rollback();
                    throw error;
                }
                return NextResponse.json({ success: true, id });
            }

            if (path === 'expenses') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('ExpenseType', sql.NVarChar(100), payload.expenseType || null)
                    .input('Description', sql.NVarChar(500), payload.description || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('TaxAmount', sql.Decimal(18, 4), Number(payload.taxAmount) || 0)
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'completed')
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .query(`
                        INSERT INTO dbo.Expenses (Id, ReceiptNumber, Date, ExpenseType, Description, Amount, TaxAmount, WarehouseId, PaidFromAccountId, Status, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @ExpenseType, @Description, @Amount, @TaxAmount, @WarehouseId, @PaidFromAccountId, @Status, @CreatedById, @CreatedByName);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'exceptionalIncomes') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('IncomeType', sql.NVarChar(100), payload.incomeType || null)
                    .input('Description', sql.NVarChar(500), payload.description || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('PaidToAccountId', sql.NVarChar(64), payload.paidToAccountId || 'main-cash')
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .query(`
                        INSERT INTO dbo.ExceptionalIncomes (Id, ReceiptNumber, Date, IncomeType, Description, Amount, PaidToAccountId, WarehouseId, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @IncomeType, @Description, @Amount, @PaidToAccountId, @WarehouseId, @CreatedById, @CreatedByName);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'treasuryTransactions') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('AccountId', sql.NVarChar(64), payload.accountId || 'main-cash')
                    .input('Type', sql.NVarChar(50), payload.type || 'deposit')
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('Description', sql.NVarChar(500), payload.description || null)
                    .input('LinkedTransactionId', sql.NVarChar(64), payload.linkedTransactionId || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .query(`
                        INSERT INTO dbo.TreasuryTransactions (Id, ReceiptNumber, Date, AccountId, Type, Amount, Description, LinkedTransactionId, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @AccountId, @Type, @Amount, @Description, @LinkedTransactionId, @CreatedById, @CreatedByName);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'profitDistributions') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('PartnerId', sql.NVarChar(64), payload.partnerId || null)
                    .input('PartnerName', sql.NVarChar(255), payload.partnerName || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || 'main-cash')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .query(`
                        INSERT INTO dbo.ProfitDistributions (Id, ReceiptNumber, Date, PartnerId, PartnerName, Amount, PaidFromAccountId, Notes, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @PartnerId, @PartnerName, @Amount, @PaidFromAccountId, @Notes, @CreatedById, @CreatedByName);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'repRemittances') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('SalesRepId', sql.NVarChar(64), payload.salesRepId || payload.userId || '')
                    .input('SalesRepName', sql.NVarChar(255), payload.salesRepName || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('ToAccountId', sql.NVarChar(64), payload.toAccountId || 'main-cash')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .query(`
                        INSERT INTO dbo.RepRemittances (Id, ReceiptNumber, Date, SalesRepId, SalesRepName, Amount, ToAccountId, Notes, CreatedById, CreatedByName)
                        VALUES (@Id, @ReceiptNumber, @Date, @SalesRepId, @SalesRepName, @Amount, @ToAccountId, @Notes, @CreatedById, @CreatedByName);
                    `);
                return NextResponse.json({ success: true, id });
            }

            // Inventory Documents
            if (path === 'stockInRecords') {
                // Self-heal: add missing columns if needed
                await pool.request().query(`
                    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'StockTransferId')
                        ALTER TABLE dbo.StockInRecords ADD StockTransferId NVARCHAR(64) NULL;
                    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'ReceivedById')
                        ALTER TABLE dbo.StockInRecords ADD ReceivedById NVARCHAR(64) NULL;
                    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'ReceivedByName')
                        ALTER TABLE dbo.StockInRecords ADD ReceivedByName NVARCHAR(255) NULL;
                    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'ReceivedDate')
                        ALTER TABLE dbo.StockInRecords ADD ReceivedDate DATETIME2 NULL;
                    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'CreatedById')
                        ALTER TABLE dbo.StockInRecords ADD CreatedById NVARCHAR(64) NULL;
                    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.StockInRecords') AND name = 'CreatedByName')
                        ALTER TABLE dbo.StockInRecords ADD CreatedByName NVARCHAR(255) NULL;
                    IF COL_LENGTH('dbo.StockInRecords', 'AllocationsJson') IS NULL
                        ALTER TABLE dbo.StockInRecords ADD AllocationsJson NVARCHAR(MAX) NULL;
                `);
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('BatchNumber', sql.NVarChar(100), payload.batchNumber ? String(payload.batchNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('PurchaseInvoiceId', sql.NVarChar(64), payload.purchaseInvoiceId || null)
                    .input('StockTransferId', sql.NVarChar(64), payload.stockTransferId || null)
                    .input('Reason', sql.NVarChar(255), payload.reason || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'approved')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .input('AllocationsJson', sql.NVarChar(sql.MAX), payload.allocations ? jsonString(payload.allocations) : null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .query(`
                        INSERT INTO dbo.StockInRecords (
                            Id, ReceiptNumber, BatchNumber, Date, WarehouseId, PurchaseInvoiceId, StockTransferId,
                            Reason, Status, Notes, ItemsJson, AllocationsJson, CreatedById, CreatedByName
                        ) VALUES (
                            @Id, @ReceiptNumber, @BatchNumber, @Date, @WarehouseId, @PurchaseInvoiceId, @StockTransferId,
                            @Reason, @Status, @Notes, @ItemsJson, @AllocationsJson, @CreatedById, @CreatedByName
                        );
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'stockOutRecords') {
                // Self-heal: ensure workflow link columns exist (logistics preparation & dispatch)
                await pool.request().query(`
                    IF COL_LENGTH('dbo.StockOutRecords', 'RequisitionId') IS NULL
                        ALTER TABLE dbo.StockOutRecords ADD [RequisitionId] NVARCHAR(64) NULL;
                    IF COL_LENGTH('dbo.StockOutRecords', 'ToWarehouseId') IS NULL
                        ALTER TABLE dbo.StockOutRecords ADD [ToWarehouseId] NVARCHAR(64) NULL;
                `);
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || payload.sourceId || null)
                    .input('SourceId', sql.NVarChar(64), payload.sourceId || payload.warehouseId || null)
                    .input('SaleInvoiceId', sql.NVarChar(64), payload.saleInvoiceId || null)
                    .input('Reason', sql.NVarChar(255), payload.reason || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'approved')
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .input('RequisitionId', sql.NVarChar(64), payload.requisitionId || null)
                    .input('ToWarehouseId', sql.NVarChar(64), payload.toWarehouseId || null)
                    .input('ShippingCost', sql.Decimal(18, 4), Number(payload.shippingCost) || 0)
                    .input('ExpensesJson', sql.NVarChar(sql.MAX), jsonString(payload.expenses || payload.expensesJson))
                    .input('ShippingPaidBy', sql.NVarChar(50), payload.shippingPaidBy || null)
                    .input('ShippingPaidFromAccountId', sql.NVarChar(64), payload.shippingPaidFromAccountId || null)
                    .input('ShippingTreatment', sql.NVarChar(50), payload.shippingTreatment || 'capitalized')
                    .input('CarrierName', sql.NVarChar(255), payload.carrierName || null)
                    .input('TrackingNumber', sql.NVarChar(100), payload.trackingNumber || null)
                    .input('ExpenseId', sql.NVarChar(64), payload.expenseId || null)
                    .input('TotalGoodsValue', sql.Decimal(18, 4), Number(payload.totalGoodsValue) || 0)
                    .input('TotalTransferredValue', sql.Decimal(18, 4), Number(payload.totalTransferredValue) || 0)
                    .query(`
                        INSERT INTO dbo.StockOutRecords (
                            Id, ReceiptNumber, Date, WarehouseId, SourceId, SaleInvoiceId, Reason, Status,
                            CreatedById, CreatedByName, Notes, ItemsJson, RequisitionId, ToWarehouseId,
                            ShippingCost, ExpensesJson, ShippingPaidBy, ShippingPaidFromAccountId, ShippingTreatment,
                            CarrierName, TrackingNumber, ExpenseId, TotalGoodsValue, TotalTransferredValue
                        )
                        VALUES (
                            @Id, @ReceiptNumber, @Date, @WarehouseId, @SourceId, @SaleInvoiceId, @Reason, @Status,
                            @CreatedById, @CreatedByName, @Notes, @ItemsJson, @RequisitionId, @ToWarehouseId,
                            @ShippingCost, @ExpensesJson, @ShippingPaidBy, @ShippingPaidFromAccountId, @ShippingTreatment,
                            @CarrierName, @TrackingNumber, @ExpenseId, @TotalGoodsValue, @TotalTransferredValue
                        );
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'stockTransferRecords') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('FromWarehouseId', sql.NVarChar(64), payload.fromWarehouseId || payload.fromSourceId || null)
                    .input('ToWarehouseId', sql.NVarChar(64), payload.toWarehouseId || payload.toSourceId || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'pending')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .input('ShippingCost', sql.Decimal(18, 4), Number(payload.shippingCost) || 0)
                    .input('ShippingPaidBy', sql.NVarChar(50), payload.shippingPaidBy || 'source')
                    .input('ShippingPaidFromAccountId', sql.NVarChar(64), payload.shippingPaidFromAccountId || null)
                    .input('ShippingTreatment', sql.NVarChar(50), payload.shippingTreatment || 'capitalized')
                    .input('CarrierName', sql.NVarChar(255), payload.carrierName || null)
                    .input('TrackingNumber', sql.NVarChar(100), payload.trackingNumber || null)
                    .input('ExpenseId', sql.NVarChar(64), payload.expenseId || null)
                    .input('ExpensesJson', sql.NVarChar(sql.MAX), jsonString(payload.expenses || payload.expensesJson))
                    .input('TotalGoodsValue', sql.Decimal(18, 4), Number(payload.totalGoodsValue) || 0)
                    .input('TotalTransferredValue', sql.Decimal(18, 4), Number(payload.totalTransferredValue) || 0)
                    .query(`
                        INSERT INTO dbo.StockTransferRecords (
                            Id, ReceiptNumber, Date, FromWarehouseId, ToWarehouseId, Status, Notes, ItemsJson,
                            ShippingCost, ShippingPaidBy, ShippingPaidFromAccountId, ShippingTreatment, CarrierName, TrackingNumber, ExpenseId,
                            ExpensesJson, TotalGoodsValue, TotalTransferredValue
                        )
                        VALUES (
                            @Id, @ReceiptNumber, @Date, @FromWarehouseId, @ToWarehouseId, @Status, @Notes, @ItemsJson,
                            @ShippingCost, @ShippingPaidBy, @ShippingPaidFromAccountId, @ShippingTreatment, @CarrierName, @TrackingNumber, @ExpenseId,
                            @ExpensesJson, @TotalGoodsValue, @TotalTransferredValue
                        );
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'stockAdjustmentRecords') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('Reason', sql.NVarChar(255), payload.reason || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.StockAdjustmentRecords (Id, ReceiptNumber, Date, WarehouseId, Reason, CreatedById, CreatedByName, Notes, ItemsJson)
                        VALUES (@Id, @ReceiptNumber, @Date, @WarehouseId, @Reason, @CreatedById, @CreatedByName, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'stockIssuesToReps') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('SalesRepId', sql.NVarChar(64), payload.salesRepId || null)
                    .input('SalesRepName', sql.NVarChar(255), payload.salesRepName || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'approved')
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.StockIssuesToReps (Id, ReceiptNumber, Date, WarehouseId, SalesRepId, SalesRepName, Status, CreatedById, CreatedByName, Notes, ItemsJson)
                        VALUES (@Id, @ReceiptNumber, @Date, @WarehouseId, @SalesRepId, @SalesRepName, @Status, @CreatedById, @CreatedByName, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'stockReturnsFromReps') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ReceiptNumber', sql.NVarChar(100), payload.receiptNumber ? String(payload.receiptNumber) : null)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('SalesRepId', sql.NVarChar(64), payload.salesRepId || null)
                    .input('SalesRepName', sql.NVarChar(255), payload.salesRepName || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'approved')
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.StockReturnsFromReps (Id, ReceiptNumber, Date, WarehouseId, SalesRepId, SalesRepName, Status, CreatedById, CreatedByName, Notes, ItemsJson)
                        VALUES (@Id, @ReceiptNumber, @Date, @WarehouseId, @SalesRepId, @SalesRepName, @Status, @CreatedById, @CreatedByName, @Notes, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'inventoryClosings') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ClosingDate', sql.DateTime2, parseDate(payload.closingDate || payload.date))
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || '')
                    .input('ClosedById', sql.NVarChar(64), payload.closedById || null)
                    .input('ClosedByName', sql.NVarChar(255), payload.closedByName || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('BalancesJson', sql.NVarChar(sql.MAX), jsonString(payload.balances))
                    .query(`
                        INSERT INTO dbo.InventoryClosings (Id, ClosingDate, WarehouseId, ClosedById, ClosedByName, Notes, BalancesJson)
                        VALUES (@Id, @ClosingDate, @WarehouseId, @ClosedById, @ClosedByName, @Notes, @BalancesJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            // POS Operations: Restaurant Tables, Held Invoices & Audit Logs
            if (path === 'restaurantTables') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('TableNumber', sql.NVarChar(50), String(payload.number ?? payload.tableNumber ?? ''))
                    .input('Capacity', sql.Int, Number(payload.seats ?? payload.capacity ?? 4))
                    .input('Status', sql.NVarChar(50), payload.status || 'available')
                    .input('Zone', sql.NVarChar(100), payload.groupName || payload.zone || null)
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .query(`
                        INSERT INTO dbo.RestaurantTables (Id, TableNumber, Capacity, Status, Zone, WarehouseId)
                        VALUES (@Id, @TableNumber, @Capacity, @Status, @Zone, @WarehouseId);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'deliveryStaff') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || '')
                    .input('Phone', sql.NVarChar(50), payload.phone || null)
                    .input('VehicleType', sql.NVarChar(100), payload.vehicleType || null)
                    .input('VehicleNumber', sql.NVarChar(50), payload.vehicleNumber || null)
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('IsActive', sql.Bit, payload.isActive !== false ? 1 : 0)
                    .query(`
                        INSERT INTO dbo.DeliveryStaff (Id, Name, Phone, VehicleType, VehicleNumber, WarehouseId, IsActive)
                        VALUES (@Id, @Name, @Phone, @VehicleType, @VehicleNumber, @WarehouseId, @IsActive);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'employees') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || '')
                    .input('Role', sql.NVarChar(100), payload.role || null)
                    .input('Salary', sql.Decimal(18, 4), Number(payload.salary) || 0)
                    .input('Phone', sql.NVarChar(50), payload.phone || null)
                    .input('HireDate', sql.DateTime2, payload.hireDate ? parseDate(payload.hireDate) : null)
                    .query(`
                        INSERT INTO dbo.Employees (Id, Name, Role, Salary, Phone, HireDate)
                        VALUES (@Id, @Name, @Role, @Salary, @Phone, @HireDate);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'sellers') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || '')
                    .input('Phone', sql.NVarChar(50), payload.phone || null)
                    .input('CommissionRate', sql.Decimal(5, 2), Number(payload.commissionRate) || 0)
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('IsActive', sql.Bit, payload.isActive !== false ? 1 : 0)
                    .query(`
                        INSERT INTO dbo.Sellers (Id, Name, Phone, CommissionRate, WarehouseId, IsActive)
                        VALUES (@Id, @Name, @Phone, @CommissionRate, @WarehouseId, @IsActive);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'partners') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || '')
                    .input('SharePercentage', sql.Decimal(5, 2), Number(payload.sharePercentage ?? payload.share) || 0)
                    .input('Contact', sql.NVarChar(255), payload.contact || null)
                    .query(`
                        INSERT INTO dbo.Partners (Id, Name, SharePercentage, Contact)
                        VALUES (@Id, @Name, @SharePercentage, @Contact);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'paymentMethods') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || '')
                    .input('AccountId', sql.NVarChar(64), payload.accountId || null)
                    .query(`
                        INSERT INTO dbo.PaymentMethods (Id, Name, AccountId)
                        VALUES (@Id, @Name, @AccountId);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'promotions') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || '')
                    .input('Type', sql.NVarChar(50), payload.type || 'percentage')
                    .input('Value', sql.Decimal(18, 4), Number(payload.value) || 0)
                    .input('StartDate', sql.DateTime2, parseDate(payload.startDate))
                    .input('EndDate', sql.DateTime2, parseDate(payload.endDate))
                    .input('IsActive', sql.Bit, payload.isActive !== false ? 1 : 0)
                    .input('ConditionsJson', sql.NVarChar(sql.MAX), jsonString(payload))
                    .query(`
                        INSERT INTO dbo.Promotions (Id, Name, Type, Value, StartDate, EndDate, IsActive, ConditionsJson)
                        VALUES (@Id, @Name, @Type, @Value, @StartDate, @EndDate, @IsActive, @ConditionsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemColors') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(100), payload.name || '')
                    .input('ColorCode', sql.NVarChar(50), payload.colorCode || payload.code || null)
                    .query(`
                        INSERT INTO dbo.ItemColors (Id, Name, ColorCode)
                        VALUES (@Id, @Name, @ColorCode);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemSizes') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(100), payload.name || '')
                    .query(`
                        INSERT INTO dbo.ItemSizes (Id, Name)
                        VALUES (@Id, @Name);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'barcodeDesigns') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || null)
                    .input('ConfigJson', sql.NVarChar(sql.MAX), jsonString(payload))
                    .query(`
                        INSERT INTO dbo.BarcodeDesigns (Id, Name, ConfigJson)
                        VALUES (@Id, @Name, @ConfigJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'targets') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('TargetKey', sql.NVarChar(100), payload.targetKey || id)
                    .input('TargetPeriod', sql.NVarChar(50), payload.targetPeriod || 'monthly')
                    .input('TargetAmount', sql.Decimal(18, 4), Number(payload.targetAmount ?? payload.amount) || 0)
                    .input('AchievedAmount', sql.Decimal(18, 4), Number(payload.achievedAmount) || 0)
                    .input('DetailsJson', sql.NVarChar(sql.MAX), jsonString(payload))
                    .query(`
                        INSERT INTO dbo.Targets (Id, TargetKey, TargetPeriod, TargetAmount, AchievedAmount, DetailsJson)
                        VALUES (@Id, @TargetKey, @TargetPeriod, @TargetAmount, @AchievedAmount, @DetailsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'heldInvoices') {
                const cartPayload = {
                    cart: payload.cart || payload.items || [],
                    discount: Number(payload.discount || 0),
                    tips: Number(payload.tips || 0),
                    orderReference: payload.orderReference || '',
                    tableName: payload.tableName || '',
                };
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('HeldAt', sql.DateTime2, parseDate(payload.heldAt))
                    .input('CashierId', sql.NVarChar(64), payload.cashierId || null)
                    .input('CashierName', sql.NVarChar(255), payload.cashierName || null)
                    .input('TerminalId', sql.NVarChar(64), payload.terminalId || null)
                    .input('TableId', sql.NVarChar(64), payload.tableId || null)
                    .input('CustomerName', sql.NVarChar(255), payload.customerName || null)
                    .input('Total', sql.Decimal(18, 4), Number(payload.total) || 0)
                    .input('CartData', sql.NVarChar(sql.MAX), jsonString(cartPayload))
                    .query(`
                        INSERT INTO dbo.HeldInvoices (Id, HeldAt, CashierId, CashierName, TerminalId, TableId, CustomerName, Total, CartData)
                        VALUES (@Id, @HeldAt, @CashierId, @CashierName, @TerminalId, @TableId, @CustomerName, @Total, @CartData);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'posAuditLogs') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date || payload.timestamp))
                    .input('CashierId', sql.NVarChar(64), payload.cashierId || null)
                    .input('CashierName', sql.NVarChar(255), payload.cashierName || null)
                    .input('Action', sql.NVarChar(100), payload.action || 'audit')
                    .input('Details', sql.NVarChar(sql.MAX), jsonString(payload.details || payload))
                    .input('InvoiceId', sql.NVarChar(64), payload.invoiceId || null)
                    .input('TerminalId', sql.NVarChar(64), payload.terminalId || null)
                    .query(`
                        INSERT INTO dbo.PosAuditLogs (Id, Date, CashierId, CashierName, Action, Details, InvoiceId, TerminalId)
                        VALUES (@Id, @Date, @CashierId, @CashierName, @Action, @Details, @InvoiceId, @TerminalId);
                    `);
                return NextResponse.json({ success: true, id });
            }

            // Fixed Assets & Depreciation
            if (path === 'fixedAssets') {
                const assetCost = Number(payload.cost ?? payload.purchasePrice) || 0;
                const lifeYears = Number(payload.usefulLifeYears) || 5;
                const depRate = Number(payload.depreciationRate) || (lifeYears > 0 ? Number((100 / lifeYears).toFixed(2)) : 20);
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(100), payload.code || null)
                    .input('Name', sql.NVarChar(255), payload.name || 'Asset')
                    .input('PurchaseDate', sql.DateTime2, parseDate(payload.purchaseDate))
                    .input('PurchasePrice', sql.Decimal(18, 4), assetCost)
                    .input('Cost', sql.Decimal(18, 4), assetCost)
                    .input('CurrentValue', sql.Decimal(18, 4), Number(payload.currentValue ?? assetCost) || 0)
                    .input('UsefulLifeYears', sql.Int, lifeYears)
                    .input('SalvageValue', sql.Decimal(18, 4), Number(payload.salvageValue) || 0)
                    .input('DepreciationRate', sql.Decimal(5, 2), depRate)
                    .input('DepreciationMethod', sql.NVarChar(50), payload.depreciationMethod || 'straight_line')
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('Status', sql.NVarChar(50), payload.status || 'active')
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .query(`
                        INSERT INTO dbo.FixedAssets (Id, Code, Name, PurchaseDate, PurchasePrice, Cost, CurrentValue, UsefulLifeYears, SalvageValue, DepreciationRate, DepreciationMethod, WarehouseId, Status, Notes)
                        VALUES (@Id, @Code, @Name, @PurchaseDate, @PurchasePrice, @Cost, @CurrentValue, @UsefulLifeYears, @SalvageValue, @DepreciationRate, @DepreciationMethod, @WarehouseId, @Status, @Notes);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'depreciationRecords') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('AssetId', sql.NVarChar(64), payload.assetId || '')
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('AccumulatedTotal', sql.Decimal(18, 4), Number(payload.accumulatedTotal) || 0)
                    .input('RemainingValue', sql.Decimal(18, 4), Number(payload.remainingValue) || 0)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .query(`
                        INSERT INTO dbo.DepreciationRecords (Id, AssetId, Date, Amount, AccumulatedTotal, RemainingValue, Notes)
                        VALUES (@Id, @AssetId, @Date, @Amount, @AccumulatedTotal, @RemainingValue, @Notes);
                    `);
                return NextResponse.json({ success: true, id });
            }

            // Master Data: Items, Customers, Suppliers, Warehouses, Accounts
            if (path === 'items') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(100), String(payload.code || id))
                    .input('Name', sql.NVarChar(255), payload.name || 'Unnamed Item')
                    .input('Cost', sql.Decimal(18, 4), Number(payload.cost) || 0)
                    .input('Price', sql.Decimal(18, 4), Number(payload.price) || 0)
                    .input('BaseUnit', sql.NVarChar(50), payload.baseUnit || 'piece')
                    .input('ItemType', sql.NVarChar(50), payload.itemType || 'standard')
                    .input('ReorderPoint', sql.Decimal(18, 4), Number(payload.reorderPoint) || 0)
                    .input('SectionId', sql.NVarChar(64), payload.sectionId || null)
                    .input('CategoryId', sql.NVarChar(64), payload.categoryId || null)
                    .input('ItemGroupId', sql.NVarChar(64), payload.itemGroupId || null)
                    .input('SubCategoryId1', sql.NVarChar(64), payload.subCategoryId1 || null)
                    .input('SubCategoryId2', sql.NVarChar(64), payload.subCategoryId2 || null)
                    .input('Barcode', sql.NVarChar(100), payload.barcode || String(payload.code || id))
                    .input('BarcodeType', sql.NVarChar(50), payload.barcodeType || 'code128')
                    .input('Color', sql.NVarChar(50), payload.color || null)
                    .input('Size', sql.NVarChar(50), payload.size || null)
                    .input('DefaultBinId', sql.NVarChar(64), payload.defaultBinId || null)
                    .input('SecondaryUnitsJson', sql.NVarChar(sql.MAX), payload.secondaryUnits ? jsonString(payload.secondaryUnits) : null)
                    .input('ComponentsJson', sql.NVarChar(sql.MAX), payload.components ? jsonString(payload.components) : null)
                    .input('IsDisabled', sql.Bit, payload.isDisabled ? 1 : 0)
                    .query(`
                        INSERT INTO dbo.Items (Id, Code, Name, Cost, Price, BaseUnit, ItemType, ReorderPoint, SectionId, CategoryId, ItemGroupId, SubCategoryId1, SubCategoryId2, Barcode, BarcodeType, Color, Size, DefaultBinId, SecondaryUnitsJson, ComponentsJson, IsDisabled)
                        VALUES (@Id, @Code, @Name, @Cost, @Price, @BaseUnit, @ItemType, @ReorderPoint, @SectionId, @CategoryId, @ItemGroupId, @SubCategoryId1, @SubCategoryId2, @Barcode, @BarcodeType, @Color, @Size, @DefaultBinId, @SecondaryUnitsJson, @ComponentsJson, @IsDisabled);
                    `);
                if (Array.isArray(payload.components) && payload.components.length > 0) {
                    try {
                        await recordRecipeSnapshot(pool, {
                            itemId: id,
                            itemCode: payload.code ? String(payload.code) : null,
                            itemName: payload.name || 'Unnamed Item',
                            components: payload.components,
                            previousComponents: null,
                            changeNotes: payload.recipeChangeNotes || 'اعتماد المستند الأساسي للريسبي (الإصدار الأول)',
                            changedById: body?.userId || payload.createdById || null,
                            changedByName: body?.userName || payload.createdByName || 'المستخدم',
                        });
                    } catch (rhErr) {
                        console.warn('RecipeHistory snapshot on add failed:', rhErr);
                    }
                }
                return NextResponse.json({ success: true, id });
            }

            if (path === 'customers') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || 'Unnamed Customer')
                    .input('Phone', sql.NVarChar(50), payload.phone || null)
                    .input('Address', sql.NVarChar(500), payload.address || null)
                    .input('AllowCredit', sql.Bit, payload.allowCredit !== false ? 1 : 0)
                    .input('CreditLimit', sql.Decimal(18, 4), Number(payload.creditLimit) || 0)
                    .input('OpeningBalance', sql.Decimal(18, 4), Number(payload.openingBalance) || 0)
                    .input('CurrentBalance', sql.Decimal(18, 4), Number(payload.currentBalance) || 0)
                    .input('InvoiceCount', sql.Int, Number(payload.invoiceCount) || 0)
                    .input('LoyaltyPoints', sql.Decimal(18, 2), Number(payload.loyaltyPoints) || 0)
                    .input('TotalEarnedPoints', sql.Decimal(18, 2), Number(payload.totalEarnedPoints) || 0)
                    .input('TotalRedeemedPoints', sql.Decimal(18, 2), Number(payload.totalRedeemedPoints) || 0)
                    .query(`
                        INSERT INTO dbo.Customers (Id, Name, Phone, Address, AllowCredit, CreditLimit, OpeningBalance, CurrentBalance, InvoiceCount, LoyaltyPoints, TotalEarnedPoints, TotalRedeemedPoints)
                        VALUES (@Id, @Name, @Phone, @Address, @AllowCredit, @CreditLimit, @OpeningBalance, @CurrentBalance, @InvoiceCount, @LoyaltyPoints, @TotalEarnedPoints, @TotalRedeemedPoints);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'suppliers') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || 'Unnamed Supplier')
                    .input('Contact', sql.NVarChar(255), payload.contact || null)
                    .input('OpeningBalance', sql.Decimal(18, 4), Number(payload.openingBalance) || 0)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(payload.items))
                    .query(`
                        INSERT INTO dbo.Suppliers (Id, Name, Contact, OpeningBalance, ItemsJson)
                        VALUES (@Id, @Name, @Contact, @OpeningBalance, @ItemsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'warehouses') {
                const branch = await getBranchInfo(pool, payload.branchCode || payload.code, payload.branchName || payload.name);
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(50), payload.code || null)
                    .input('Name', sql.NVarChar(255), payload.name || 'Warehouse')
                    .input('Address', sql.NVarChar(500), payload.address || null)
                    .input('WarehouseType', sql.NVarChar(50), payload.warehouseType || (payload.isRepWarehouse ? 'rep' : payload.isMain ? 'warehouse' : 'branch'))
                    .input('IsRepWarehouse', sql.Bit, payload.isRepWarehouse ? 1 : 0)
                    .input('IsMain', sql.Bit, payload.isMain ? 1 : 0)
                    .input('IsClosed', sql.Bit, payload.isClosed ? 1 : 0)
                    .input('RepId', sql.NVarChar(64), payload.repId || null)
                    .input('BranchCode', sql.NVarChar(50), branch.branchCode)
                    .input('BranchName', sql.NVarChar(255), branch.branchName)
                    .query(`
                        INSERT INTO dbo.Warehouses (Id, Code, Name, Address, WarehouseType, IsRepWarehouse, IsMain, IsClosed, RepId, BranchCode, BranchName, SyncStatus, CreatedAt, UpdatedAt)
                        VALUES (@Id, @Code, @Name, @Address, @WarehouseType, @IsRepWarehouse, @IsMain, @IsClosed, @RepId, @BranchCode, @BranchName, 'synced', SYSUTCDATETIME(), SYSUTCDATETIME());
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'cashAccounts') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || 'Cash Account')
                    .input('Type', sql.NVarChar(50), payload.type || 'drawer')
                    .input('OpeningBalance', sql.Decimal(18, 4), Number(payload.openingBalance) || 0)
                    .input('UserId', sql.NVarChar(64), payload.userId || null)
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .query(`
                        INSERT INTO dbo.CashAccounts (Id, Name, Type, OpeningBalance, UserId, WarehouseId)
                        VALUES (@Id, @Name, @Type, @OpeningBalance, @UserId, @WarehouseId);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'users') {
                const isRepUser = !!(payload.isSalesRep || payload.role === 'مندوب' || (typeof payload.role === 'string' && payload.role.includes('مندوب')));

                // Guarantee user inherits creator's license or active system license
                let userTheme = payload.themeSettings;
                if (typeof userTheme === 'string') {
                    try { userTheme = JSON.parse(userTheme); } catch { userTheme = {}; }
                }
                userTheme = { ...(userTheme || {}) };
                if (!userTheme.licenseKey) {
                    const licRes = await pool.request().query(`
                        SELECT TOP 1 [Key] FROM dbo.Licenses 
                        WHERE Status IN ('active', 'assigned') 
                        ORDER BY CASE WHEN [Key] = 'SA-KEY-99ED28E7-023953BC' THEN 0 ELSE 1 END, CreatedAt DESC
                    `);
                    const fallbackKey = licRes.recordset[0]?.Key || 'SA-KEY-99ED28E7-023953BC';
                    userTheme.licenseKey = fallbackKey;
                    userTheme.licenseStatus = 'active';
                }

                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('LoginName', sql.NVarChar(100), payload.loginName || id)
                    .input('Name', sql.NVarChar(255), payload.name || 'User')
                    .input('Password', sql.NVarChar(255), payload.password || '123456')
                    .input('Phone', sql.NVarChar(50), payload.phone || null)
                    .input('Email', sql.NVarChar(255), payload.email || null)
                    .input('NationalId', sql.NVarChar(50), payload.nationalId || null)
                    .input('SocialInsuranceNumber', sql.NVarChar(50), payload.socialInsuranceNumber || null)
                    .input('JobTitle', sql.NVarChar(100), payload.jobTitle || null)
                    .input('Department', sql.NVarChar(100), payload.department || null)
                    .input('HiringDate', sql.NVarChar(50), payload.hiringDate || null)
                    .input('BasicSalary', sql.Decimal(18, 4), Number(payload.basicSalary) || 0)
                    .input('HousingAllowance', sql.Decimal(18, 4), Number(payload.housingAllowance) || 0)
                    .input('TransportAllowance', sql.Decimal(18, 4), Number(payload.transportAllowance) || 0)
                    .input('SocialInsuranceDeduction', sql.Decimal(18, 4), Number(payload.socialInsuranceDeduction) || 0)
                    .input('PhotoUrl', sql.NVarChar(sql.MAX), payload.photoUrl || null)
                    .input('WeeklyOffDays', sql.NVarChar(255), payload.weeklyOffDays ? jsonString(payload.weeklyOffDays) : JSON.stringify(['الجمعة']))
                    .input('AnnualLeaveDays', sql.Int, payload.annualLeaveDays !== undefined ? Number(payload.annualLeaveDays) : 21)
                    .input('UsedLeaveDays', sql.Int, payload.usedLeaveDays !== undefined ? Number(payload.usedLeaveDays) : 0)
                    .input('Status', sql.NVarChar(50), payload.status || 'active')
                    .input('BranchId', sql.NVarChar(64), payload.branchId || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .input('Role', sql.NVarChar(100), payload.role || 'كاشير')
                    .input('WarehouseIds', sql.NVarChar(sql.MAX), jsonString(payload.warehouseIds))
                    .input('IsCashier', sql.Bit, payload.isCashier ? 1 : 0)
                    .input('IsDelivery', sql.Bit, payload.isDelivery ? 1 : 0)
                    .input('IsSalesRep', sql.Bit, isRepUser ? 1 : 0)
                    .input('CanOpenOwnShift', sql.Bit, payload.canOpenOwnShift !== false ? 1 : 0)
                    .input('CanDeleteFromCart', sql.Bit, payload.canDeleteFromCart !== false ? 1 : 0)
                    .input('CanProcessReturn', sql.Bit, payload.canProcessReturn !== false ? 1 : 0)
                    .input('CanCancelInvoice', sql.Bit, payload.canCancelInvoice ? 1 : 0)
                    .input('CanBypassScannerForReturn', sql.Bit, payload.canBypassScannerForReturn ? 1 : 0)
                    .input('IsDisabled', sql.Bit, payload.isDisabled ? 1 : 0)
                    .input('ThemeSettings', sql.NVarChar(sql.MAX), jsonString(userTheme))
                    .query(`
                        INSERT INTO dbo.Users (
                            Id, LoginName, Name, Password, Phone, Email, NationalId, SocialInsuranceNumber,
                            JobTitle, Department, HiringDate, BasicSalary, HousingAllowance, TransportAllowance,
                            SocialInsuranceDeduction, PhotoUrl, WeeklyOffDays, AnnualLeaveDays, UsedLeaveDays,
                            Status, BranchId, Notes, Role, WarehouseIds,
                            IsCashier, IsDelivery, IsSalesRep, CanOpenOwnShift, CanDeleteFromCart,
                            CanProcessReturn, CanCancelInvoice, CanBypassScannerForReturn, IsDisabled, ThemeSettings
                        )
                        VALUES (
                            @Id, @LoginName, @Name, @Password, @Phone, @Email, @NationalId, @SocialInsuranceNumber,
                            @JobTitle, @Department, @HiringDate, @BasicSalary, @HousingAllowance, @TransportAllowance,
                            @SocialInsuranceDeduction, @PhotoUrl, @WeeklyOffDays, @AnnualLeaveDays, @UsedLeaveDays,
                            @Status, @BranchId, @Notes, @Role, @WarehouseIds,
                            @IsCashier, @IsDelivery, @IsSalesRep, @CanOpenOwnShift, @CanDeleteFromCart,
                            @CanProcessReturn, @CanCancelInvoice, @CanBypassScannerForReturn, @IsDisabled, @ThemeSettings
                        );
                    `);

                if (isRepUser) {
                    await ensureRepWarehouseAndAccount(pool, id, payload.name, payload.warehouseIds);
                }

                return NextResponse.json({ success: true, id });
            }

            if (path === 'posSessions') {
                if (await checkIsCentral()) {
                    return NextResponse.json({
                        success: false,
                        error: "محظور: لا يمكن فتح يوم عمل كاشير أو تسليم عهدة في الإدارة المركزية. الكاشير مخصص لفروع البيع فقط."
                    }, { status: 403 });
                }
                const branch = await getBranchInfo(pool, payload.branchCode, payload.branchName);
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('StartTime', sql.DateTime2, parseDate(payload.startTime))
                    .input('EndTime', sql.DateTime2, payload.endTime ? parseDate(payload.endTime) : null)
                    .input('OpenedBy', sql.NVarChar(64), payload.openedBy || null)
                    .input('OpenedByName', sql.NVarChar(255), payload.openedByName || null)
                    .input('ClosedBy', sql.NVarChar(64), payload.closedBy || null)
                    .input('ClosedByName', sql.NVarChar(255), payload.closedByName || null)
                    .input('IsClosed', sql.Bit, payload.isClosed ? 1 : 0)
                    .input('PosTerminalId', sql.NVarChar(64), payload.posTerminalId || null)
                    .input('CashierSessionsJson', sql.NVarChar(sql.MAX), payload.cashierSessions ? jsonString(payload.cashierSessions) : null)
                    .input('BranchCode', sql.NVarChar(50), branch.branchCode)
                    .input('BranchName', sql.NVarChar(255), branch.branchName)
                    .query(`
                        INSERT INTO dbo.PosSessions (Id, StartTime, EndTime, OpenedBy, OpenedByName, ClosedBy, ClosedByName, IsClosed, PosTerminalId, CashierSessionsJson, BranchCode, BranchName, SyncStatus, CreatedAt, UpdatedAt)
                        VALUES (@Id, @StartTime, @EndTime, @OpenedBy, @OpenedByName, @ClosedBy, @ClosedByName, @IsClosed, @PosTerminalId, @CashierSessionsJson, @BranchCode, @BranchName, 'synced', SYSUTCDATETIME(), SYSUTCDATETIME());
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'posTerminals') {
                if (await checkIsCentral()) {
                    return NextResponse.json({
                        success: false,
                        error: "محظور: لا يمكن إضافة أو تعريف أجهزة كاشير في الإدارة المركزية. نقاط البيع تُعرف وترتبط بفروع البيع الفعلية فقط."
                    }, { status: 403 });
                }
                let branchCode = payload.branchCode || null;
                let branchName = payload.branchName || null;
                if (!branchCode && payload.warehouseId) {
                    const whRes = await pool.request().input('WId', sql.NVarChar(64), payload.warehouseId).query('SELECT Code, Name FROM dbo.Warehouses WHERE Id = @WId');
                    if (whRes.recordset[0]) {
                        branchCode = whRes.recordset[0].Code;
                        branchName = whRes.recordset[0].Name;
                    }
                }
                const branch = await getBranchInfo(pool, branchCode, branchName);

                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(50), payload.code ? String(payload.code).trim() : null)
                    .input('Name', sql.NVarChar(255), payload.name || 'نقطة بيع')
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .input('BranchCode', sql.NVarChar(50), branch.branchCode)
                    .input('BranchName', sql.NVarChar(255), branch.branchName)
                    .input('PosPrinterType', sql.NVarChar(50), payload.posPrinterType || 'system')
                    .input('PosPrinterAddress', sql.NVarChar(255), payload.posPrinterAddress || null)
                    .input('EnableKitchenPrinter', sql.Bit, payload.enableKitchenPrinter ? 1 : 0)
                    .input('KitchenPrinterType', sql.NVarChar(50), payload.kitchenPrinterType || 'system')
                    .input('KitchenPrinterAddress', sql.NVarChar(255), payload.kitchenPrinterAddress || null)
                    .query(`
                        INSERT INTO dbo.PosTerminals (Id, Code, Name, WarehouseId, BranchCode, BranchName, PosPrinterType, PosPrinterAddress, EnableKitchenPrinter, KitchenPrinterType, KitchenPrinterAddress, CreatedAt, UpdatedAt, SyncStatus)
                        VALUES (@Id, @Code, @Name, @WarehouseId, @BranchCode, @BranchName, @PosPrinterType, @PosPrinterAddress, @EnableKitchenPrinter, @KitchenPrinterType, @KitchenPrinterAddress, SYSUTCDATETIME(), SYSUTCDATETIME(), 'synced');
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'gratuityLogs') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('InvoiceNumber', sql.NVarChar(100), payload.invoiceNumber ? String(payload.invoiceNumber) : null)
                    .input('InvoiceId', sql.NVarChar(64), payload.invoiceId || null)
                    .input('CashierId', sql.NVarChar(64), payload.cashierId || null)
                    .input('CashierName', sql.NVarChar(255), payload.cashierName || null)
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .query(`
                        INSERT INTO dbo.GratuityLogs (Id, Date, Amount, InvoiceNumber, InvoiceId, CashierId, CashierName, WarehouseId)
                        VALUES (@Id, @Date, @Amount, @InvoiceNumber, @InvoiceId, @CashierId, @CashierName, @WarehouseId);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'gratuityDistributions') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('TotalAmount', sql.Decimal(18, 4), Number(payload.totalAmount) || 0)
                    .input('DetailsJson', sql.NVarChar(sql.MAX), jsonString(payload.details || payload))
                    .query(`
                        INSERT INTO dbo.GratuityDistributions (Id, Date, TotalAmount, DetailsJson)
                        VALUES (@Id, @Date, @TotalAmount, @DetailsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemSections') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(50), payload.code ? String(payload.code) : (payload.Code ? String(payload.Code) : null))
                    .input('Name', sql.NVarChar(255), payload.name || payload.Name || 'Unnamed Section')
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.ItemSections WHERE Id = @Id)
                            INSERT INTO dbo.ItemSections (Id, Code, Name) VALUES (@Id, @Code, @Name);
                        ELSE
                            UPDATE dbo.ItemSections SET Code = @Code, Name = @Name WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemCategories') {
                // Existing installations may predate these optional category columns.
                // Upgrade before compiling the INSERT/UPDATE that references them.
                await pool.request().query(`
                    IF COL_LENGTH('dbo.ItemCategories', 'Code') IS NULL
                        ALTER TABLE dbo.ItemCategories ADD Code NVARCHAR(50) NULL;
                    IF COL_LENGTH('dbo.ItemCategories', 'ShowOnPos') IS NULL
                        ALTER TABLE dbo.ItemCategories ADD ShowOnPos BIT NULL DEFAULT ((1));
                    IF COL_LENGTH('dbo.ItemCategories', 'Color') IS NULL
                        ALTER TABLE dbo.ItemCategories ADD Color NVARCHAR(50) NULL;
                `);
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(50), payload.code ? String(payload.code) : (payload.Code ? String(payload.Code) : null))
                    .input('Name', sql.NVarChar(255), payload.name || payload.Name || 'Unnamed Category')
                    .input('SectionId', sql.NVarChar(64), payload.sectionId || payload.SectionId || null)
                    .input('ShowOnPos', sql.Bit, payload.showOnPos !== undefined ? (payload.showOnPos ? 1 : 0) : (payload.ShowOnPos !== undefined ? (payload.ShowOnPos ? 1 : 0) : 1))
                    .input('Color', sql.NVarChar(50), payload.color || payload.Color || null)
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.ItemCategories WHERE Id = @Id)
                            INSERT INTO dbo.ItemCategories (Id, Code, Name, SectionId, ShowOnPos, Color) VALUES (@Id, @Code, @Name, @SectionId, @ShowOnPos, @Color);
                        ELSE
                            UPDATE dbo.ItemCategories SET Code = @Code, Name = @Name, SectionId = @SectionId, ShowOnPos = @ShowOnPos, Color = @Color WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemGroups') {
                await pool.request().query(`
                    IF COL_LENGTH('dbo.ItemGroups', 'Code') IS NULL
                        ALTER TABLE dbo.ItemGroups ADD Code NVARCHAR(50) NULL;
                    IF COL_LENGTH('dbo.ItemGroups', 'ParentCategoryId') IS NULL
                        ALTER TABLE dbo.ItemGroups ADD ParentCategoryId NVARCHAR(64) NULL;
                    IF COL_LENGTH('dbo.ItemGroups', 'ShowOnPos') IS NULL
                        ALTER TABLE dbo.ItemGroups ADD ShowOnPos BIT NULL DEFAULT ((1));
                    IF COL_LENGTH('dbo.ItemGroups', 'Color') IS NULL
                        ALTER TABLE dbo.ItemGroups ADD Color NVARCHAR(50) NULL;
                `);
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(50), payload.code ? String(payload.code) : (payload.Code ? String(payload.Code) : null))
                    .input('Name', sql.NVarChar(255), payload.name || payload.Name || 'Unnamed Group')
                    .input('ParentCategoryId', sql.NVarChar(64), payload.parentCategoryId || payload.ParentCategoryId || null)
                    .input('ShowOnPos', sql.Bit, payload.showOnPos !== undefined ? (payload.showOnPos ? 1 : 0) : (payload.ShowOnPos !== undefined ? (payload.ShowOnPos ? 1 : 0) : 1))
                    .input('Color', sql.NVarChar(50), payload.color || payload.Color || null)
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.ItemGroups WHERE Id = @Id)
                            INSERT INTO dbo.ItemGroups (Id, Code, Name, ParentCategoryId, ShowOnPos, Color) VALUES (@Id, @Code, @Name, @ParentCategoryId, @ShowOnPos, @Color);
                        ELSE
                            UPDATE dbo.ItemGroups SET Code = @Code, Name = @Name, ParentCategoryId = @ParentCategoryId, ShowOnPos = @ShowOnPos, Color = @Color WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemSubCategories1') {
                await pool.request().query(`
                    IF COL_LENGTH('dbo.ItemSubCategories1', 'Code') IS NULL
                        ALTER TABLE dbo.ItemSubCategories1 ADD Code NVARCHAR(50) NULL;
                `);
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(50), payload.code || payload.Code || null)
                    .input('Name', sql.NVarChar(255), payload.name || payload.Name || 'Unnamed SubCategory')
                    .query(`
                        IF EXISTS (SELECT 1 FROM dbo.ItemSubCategories1 WHERE Id = @Id)
                            UPDATE dbo.ItemSubCategories1 SET Code = @Code, Name = @Name, UpdatedAt = sysutcdatetime() WHERE Id = @Id;
                        ELSE
                            INSERT INTO dbo.ItemSubCategories1 (Id, Code, Name) VALUES (@Id, @Code, @Name);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'itemSubCategories2') {
                await pool.request().query(`
                    IF COL_LENGTH('dbo.ItemSubCategories2', 'Code') IS NULL
                        ALTER TABLE dbo.ItemSubCategories2 ADD Code NVARCHAR(50) NULL;
                `);
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Code', sql.NVarChar(50), payload.code || payload.Code || null)
                    .input('Name', sql.NVarChar(255), payload.name || payload.Name || 'Unnamed SubCategory')
                    .query(`
                        IF EXISTS (SELECT 1 FROM dbo.ItemSubCategories2 WHERE Id = @Id)
                            UPDATE dbo.ItemSubCategories2 SET Code = @Code, Name = @Name, UpdatedAt = sysutcdatetime() WHERE Id = @Id;
                        ELSE
                            INSERT INTO dbo.ItemSubCategories2 (Id, Code, Name) VALUES (@Id, @Code, @Name);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'inventoryZones') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Name', sql.NVarChar(255), payload.name || 'Unnamed Zone')
                    .input('WarehouseId', sql.NVarChar(64), payload.warehouseId || null)
                    .query(`INSERT INTO dbo.InventoryZones (Id, Name, WarehouseId) VALUES (@Id, @Name, @WarehouseId);`);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'inventorySections') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('MainWarehouseId', sql.NVarChar(64), payload.mainWarehouseId || payload.MainWarehouseId || null)
                    .input('Name', sql.NVarChar(255), payload.name || payload.Name || 'قسم / حاوية')
                    .input('Capacity', sql.Int, Number(payload.capacity ?? payload.Capacity ?? 0))
                    .input('AllowOverfill', sql.Bit, payload.allowOverfill !== undefined ? (payload.allowOverfill ? 1 : 0) : 1)
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.InventorySections WHERE Id = @Id)
                            INSERT INTO dbo.InventorySections (Id, MainWarehouseId, Name, Capacity, AllowOverfill)
                            VALUES (@Id, @MainWarehouseId, @Name, @Capacity, @AllowOverfill);
                        ELSE
                            UPDATE dbo.InventorySections
                            SET MainWarehouseId = COALESCE(@MainWarehouseId, MainWarehouseId),
                                Name = @Name,
                                Capacity = @Capacity,
                                AllowOverfill = @AllowOverfill,
                                UpdatedAt = sysutcdatetime()
                            WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'customerVisits') {
                const locString = payload.location ? (typeof payload.location === 'string' ? payload.location : JSON.stringify(payload.location)) : null;
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('SalesRepId', sql.NVarChar(64), payload.salesRepId || null)
                    .input('SalesRepName', sql.NVarChar(255), payload.salesRepName || null)
                    .input('CustomerName', sql.NVarChar(255), payload.customerName || 'زيارة بدون عميل محدد')
                    .input('Timestamp', sql.DateTime2, parseDate(payload.timestamp))
                    .input('Location', sql.NVarChar(sql.MAX), locString)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .query(`
                        INSERT INTO dbo.CustomerVisits (Id, SalesRepId, SalesRepName, CustomerName, Timestamp, Location, Notes)
                        VALUES (@Id, @SalesRepId, @SalesRepName, @CustomerName, @Timestamp, @Location, @Notes);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'loginHistory') {
                let lat: number | null = null;
                let lng: number | null = null;
                if (payload.location) {
                    lat = Number(payload.location.latitude) || null;
                    lng = Number(payload.location.longitude) || null;
                }
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('UserId', sql.NVarChar(64), payload.userId || null)
                    .input('UserName', sql.NVarChar(255), payload.userName || null)
                    .input('Timestamp', sql.DateTime2, parseDate(payload.timestamp))
                    .input('Latitude', sql.Float, lat)
                    .input('Longitude', sql.Float, lng)
                    .query(`
                        INSERT INTO dbo.LoginHistory (Id, UserId, UserName, Timestamp, Latitude, Longitude)
                        VALUES (@Id, @UserId, @UserName, @Timestamp, @Latitude, @Longitude);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'priceChangeLogs') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('ItemId', sql.NVarChar(64), payload.itemId || null)
                    .input('ItemCode', sql.NVarChar(100), payload.itemCode ? String(payload.itemCode) : null)
                    .input('ItemName', sql.NVarChar(255), payload.itemName || null)
                    .input('OldPrice', sql.Decimal(18, 4), Number(payload.oldPrice) || 0)
                    .input('NewPrice', sql.Decimal(18, 4), Number(payload.newPrice) || 0)
                    .input('OldCost', sql.Decimal(18, 4), Number(payload.oldCost) || 0)
                    .input('NewCost', sql.Decimal(18, 4), Number(payload.newCost) || 0)
                    .input('Timestamp', sql.DateTime2, parseDate(payload.timestamp || payload.date))
                    .input('ChangedById', sql.NVarChar(64), payload.changedById || null)
                    .input('ChangedByName', sql.NVarChar(255), payload.changedByName || null)
                    .input('Reason', sql.NVarChar(sql.MAX), payload.reason || null)
                    .query(`
                        INSERT INTO dbo.PriceChangeLogs (Id, ItemId, ItemCode, ItemName, OldPrice, NewPrice, OldCost, NewCost, Timestamp, ChangedById, ChangedByName, Reason)
                        VALUES (@Id, @ItemId, @ItemCode, @ItemName, @OldPrice, @NewPrice, @OldCost, @NewCost, @Timestamp, @ChangedById, @ChangedByName, @Reason);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'employeeAdvances') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('EmployeeId', sql.NVarChar(64), payload.employeeId || null)
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || null)
                    .input('Notes', sql.NVarChar(sql.MAX), payload.notes || null)
                    .query(`
                        INSERT INTO dbo.EmployeeAdvances (Id, Date, EmployeeId, Amount, PaidFromAccountId, Notes)
                        VALUES (@Id, @Date, @EmployeeId, @Amount, @PaidFromAccountId, @Notes);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'employeeAdjustments') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('EmployeeId', sql.NVarChar(64), payload.employeeId || null)
                    .input('EmployeeName', sql.NVarChar(255), payload.employeeName || null)
                    .input('Type', sql.NVarChar(50), payload.type || 'deduction')
                    .input('Amount', sql.Decimal(18, 4), Number(payload.amount) || 0)
                    .input('Reason', sql.NVarChar(sql.MAX), payload.reason || null)
                    .input('CreatedById', sql.NVarChar(64), payload.createdById || null)
                    .input('CreatedByName', sql.NVarChar(255), payload.createdByName || null)
                    .input('CreatedAt', sql.DateTime2, parseDate(payload.createdAt))
                    .query(`
                        INSERT INTO dbo.EmployeeAdjustments (Id, Date, EmployeeId, EmployeeName, Type, Amount, Reason, CreatedById, CreatedByName, CreatedAt)
                        VALUES (@Id, @Date, @EmployeeId, @EmployeeName, @Type, @Amount, @Reason, @CreatedById, @CreatedByName, @CreatedAt);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'payrollRecords') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Date', sql.DateTime2, parseDate(payload.date))
                    .input('Month', sql.NVarChar(50), payload.month || null)
                    .input('PaidFromAccountId', sql.NVarChar(64), payload.paidFromAccountId || null)
                    .input('TotalAmount', sql.Decimal(18, 4), Number(payload.totalAmount) || 0)
                    .input('DetailsJson', sql.NVarChar(sql.MAX), jsonString(payload.details || payload.payrollData || payload))
                    .query(`
                        INSERT INTO dbo.PayrollRecords (Id, Date, Month, PaidFromAccountId, TotalAmount, DetailsJson)
                        VALUES (@Id, @Date, @Month, @PaidFromAccountId, @TotalAmount, @DetailsJson);
                    `);
                return NextResponse.json({ success: true, id });
            }

            if (path === 'licenses') {
                await pool.request()
                    .input('Id', sql.NVarChar(64), id)
                    .input('Key', sql.NVarChar(255), payload.key || payload.Key || '')
                    .input('StartDate', sql.DateTime2, payload.startDate ? parseDate(payload.startDate) : null)
                    .input('EndDate', sql.DateTime2, payload.endDate ? parseDate(payload.endDate) : null)
                    .input('Status', sql.NVarChar(50), payload.status || 'available')
                    .input('MaxUsers', sql.Int, Number(payload.maxUsers) || 10)
                    .input('EnabledModules', sql.NVarChar(sql.MAX), jsonString(payload.enabledModules))
                    .input('AssignedWarehouseIds', sql.NVarChar(sql.MAX), jsonString(payload.assignedWarehouseIds))
                    .input('AssignedTo', sql.NVarChar(255), payload.assignedTo || null)
                    .input('BranchCode', sql.NVarChar(50), payload.branchCode || null)
                    .input('BranchName', sql.NVarChar(255), payload.branchName || null)
                    .query(`
                        INSERT INTO dbo.Licenses (Id, [Key], StartDate, EndDate, Status, MaxUsers, EnabledModules, AssignedWarehouseIds, AssignedTo, BranchCode, BranchName, CreatedAt, UpdatedAt)
                        VALUES (@Id, @Key, @StartDate, @EndDate, @Status, @MaxUsers, @EnabledModules, @AssignedWarehouseIds, @AssignedTo, @BranchCode, @BranchName, SYSUTCDATETIME(), SYSUTCDATETIME());
                    `);
                return NextResponse.json({ success: true, id });
            }
        }

        // =====================================================================
        // ACTION: UPDATE
        // =====================================================================
        if (action === 'update') {
            const updateId = payload?.id;
            const data = payload?.data || payload || {};

            if (path === 'customers' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || null)
                    .input('Phone', sql.NVarChar(50), data.phone || null)
                    .input('Address', sql.NVarChar(500), data.address || null)
                    .input('CreditLimit', sql.Decimal(18, 4), data.creditLimit !== undefined ? Number(data.creditLimit) : null)
                    .input('CurrentBalance', sql.Decimal(18, 4), data.currentBalance !== undefined ? Number(data.currentBalance) : null)
                    .input('InvoiceCount', sql.Int, data.invoiceCount !== undefined ? Number(data.invoiceCount) : null)
                    .input('LoyaltyPoints', sql.Decimal(18, 2), data.loyaltyPoints !== undefined ? Number(data.loyaltyPoints) : null)
                    .input('TotalEarnedPoints', sql.Decimal(18, 2), data.totalEarnedPoints !== undefined ? Number(data.totalEarnedPoints) : null)
                    .input('TotalRedeemedPoints', sql.Decimal(18, 2), data.totalRedeemedPoints !== undefined ? Number(data.totalRedeemedPoints) : null)
                    .query(`
                        UPDATE dbo.Customers
                        SET 
                            Name = COALESCE(@Name, Name),
                            Phone = COALESCE(@Phone, Phone),
                            Address = COALESCE(@Address, Address),
                            CreditLimit = COALESCE(@CreditLimit, CreditLimit),
                            CurrentBalance = COALESCE(@CurrentBalance, CurrentBalance),
                            InvoiceCount = COALESCE(@InvoiceCount, InvoiceCount),
                            LoyaltyPoints = COALESCE(@LoyaltyPoints, LoyaltyPoints),
                            TotalEarnedPoints = COALESCE(@TotalEarnedPoints, TotalEarnedPoints),
                            TotalRedeemedPoints = COALESCE(@TotalRedeemedPoints, TotalRedeemedPoints)
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'items' && updateId) {
                let prevItemRow: any = null;
                if (Array.isArray(data.components)) {
                    try {
                        const prevRes = await pool.request()
                            .input('Id', sql.NVarChar(64), updateId)
                            .query(`SELECT TOP 1 Code, Name, ItemType, ComponentsJson FROM dbo.Items WHERE Id = @Id`);
                        prevItemRow = prevRes.recordset[0] || null;
                    } catch {}
                }
                const clearItemGroupId = (data.itemGroupId === '' || data.itemGroupId === null) ? 1 : 0;
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Code', sql.NVarChar(100), data.code ? String(data.code) : null)
                    .input('Name', sql.NVarChar(255), data.name || null)
                    .input('Price', sql.Decimal(18, 4), data.price !== undefined ? Number(data.price) : null)
                    .input('Cost', sql.Decimal(18, 4), data.cost !== undefined ? Number(data.cost) : null)
                    .input('ReorderPoint', sql.Decimal(18, 4), data.reorderPoint !== undefined ? Number(data.reorderPoint) : null)
                    .input('SectionId', sql.NVarChar(64), data.sectionId || null)
                    .input('CategoryId', sql.NVarChar(64), data.categoryId || null)
                    .input('ItemGroupId', sql.NVarChar(64), data.itemGroupId || null)
                    .input('ClearItemGroupId', sql.Bit, clearItemGroupId)
                    .input('SubCategoryId1', sql.NVarChar(64), data.subCategoryId1 || null)
                    .input('SubCategoryId2', sql.NVarChar(64), data.subCategoryId2 || null)
                    .input('Barcode', sql.NVarChar(100), data.barcode || null)
                    .input('BarcodeType', sql.NVarChar(50), data.barcodeType || null)
                    .input('Color', sql.NVarChar(50), data.color || null)
                    .input('Size', sql.NVarChar(50), data.size || null)
                    .input('DefaultBinId', sql.NVarChar(64), data.defaultBinId || null)
                    .input('SecondaryUnitsJson', sql.NVarChar(sql.MAX), data.secondaryUnits ? jsonString(data.secondaryUnits) : null)
                    .input('ComponentsJson', sql.NVarChar(sql.MAX), data.components ? jsonString(data.components) : null)
                    .input('IsDisabled', sql.Bit, data.isDisabled !== undefined ? (data.isDisabled ? 1 : 0) : null)
                    .query(`
                        UPDATE dbo.Items
                        SET 
                            Code = COALESCE(@Code, Code),
                            Name = COALESCE(@Name, Name),
                            Price = COALESCE(@Price, Price),
                            Cost = COALESCE(@Cost, Cost),
                            ReorderPoint = COALESCE(@ReorderPoint, ReorderPoint),
                            SectionId = COALESCE(@SectionId, SectionId),
                            CategoryId = COALESCE(@CategoryId, CategoryId),
                            ItemGroupId = CASE WHEN @ClearItemGroupId = 1 THEN NULL ELSE COALESCE(@ItemGroupId, ItemGroupId) END,
                            SubCategoryId1 = COALESCE(@SubCategoryId1, SubCategoryId1),
                            SubCategoryId2 = COALESCE(@SubCategoryId2, SubCategoryId2),
                            Barcode = COALESCE(@Barcode, Barcode),
                            BarcodeType = COALESCE(@BarcodeType, BarcodeType),
                            Color = COALESCE(@Color, Color),
                            Size = COALESCE(@Size, Size),
                            DefaultBinId = COALESCE(@DefaultBinId, DefaultBinId),
                            SecondaryUnitsJson = COALESCE(@SecondaryUnitsJson, SecondaryUnitsJson),
                            ComponentsJson = COALESCE(@ComponentsJson, ComponentsJson),
                            IsDisabled = COALESCE(@IsDisabled, IsDisabled)
                        WHERE Id = @Id;
                    `);
                if (Array.isArray(data.components)) {
                    try {
                        const prevComps = prevItemRow?.ComponentsJson ? JSON.parse(prevItemRow.ComponentsJson) : null;
                        await recordRecipeSnapshot(pool, {
                            itemId: updateId,
                            itemCode: data.code ? String(data.code) : (prevItemRow?.Code || null),
                            itemName: data.name || prevItemRow?.Name || 'صنف مصنع',
                            components: data.components,
                            previousComponents: prevComps,
                            changeNotes: data.recipeChangeNotes || undefined,
                            changedById: body?.userId || data.updatedById || null,
                            changedByName: body?.userName || data.updatedByName || 'المستخدم',
                        });
                    } catch (rhErr) {
                        console.warn('RecipeHistory snapshot on update failed:', rhErr);
                    }
                }
                return NextResponse.json({ success: true });
            }

            if (path === 'itemSections' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || data.Name || null)
                    .input('Code', sql.NVarChar(50), data.code || data.Code || null)
                    .query(`
                        UPDATE dbo.ItemSections 
                        SET Name = COALESCE(@Name, Name), Code = COALESCE(@Code, Code) 
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'itemCategories' && updateId) {
                await pool.request().query(`
                    IF COL_LENGTH('dbo.ItemCategories', 'Code') IS NULL
                        ALTER TABLE dbo.ItemCategories ADD Code NVARCHAR(50) NULL;
                    IF COL_LENGTH('dbo.ItemCategories', 'ShowOnPos') IS NULL
                        ALTER TABLE dbo.ItemCategories ADD ShowOnPos BIT NULL DEFAULT ((1));
                    IF COL_LENGTH('dbo.ItemCategories', 'Color') IS NULL
                        ALTER TABLE dbo.ItemCategories ADD Color NVARCHAR(50) NULL;
                `);
                const showOnPosVal = data.showOnPos !== undefined ? (data.showOnPos ? 1 : 0) : (data.ShowOnPos !== undefined ? (data.ShowOnPos ? 1 : 0) : null);
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || data.Name || null)
                    .input('Code', sql.NVarChar(50), data.code || data.Code || null)
                    .input('SectionId', sql.NVarChar(64), data.sectionId || data.SectionId || null)
                    .input('ShowOnPos', sql.Bit, showOnPosVal)
                    .input('Color', sql.NVarChar(50), data.color !== undefined ? data.color : (data.Color !== undefined ? data.Color : null))
                    .query(`
                        UPDATE dbo.ItemCategories 
                        SET Name = COALESCE(@Name, Name), Code = COALESCE(@Code, Code), SectionId = COALESCE(@SectionId, SectionId), ShowOnPos = COALESCE(@ShowOnPos, ShowOnPos), Color = COALESCE(@Color, Color)
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'itemGroups' && updateId) {
                await pool.request().query(`
                    IF COL_LENGTH('dbo.ItemGroups', 'Code') IS NULL
                        ALTER TABLE dbo.ItemGroups ADD Code NVARCHAR(50) NULL;
                    IF COL_LENGTH('dbo.ItemGroups', 'ParentCategoryId') IS NULL
                        ALTER TABLE dbo.ItemGroups ADD ParentCategoryId NVARCHAR(64) NULL;
                    IF COL_LENGTH('dbo.ItemGroups', 'ShowOnPos') IS NULL
                        ALTER TABLE dbo.ItemGroups ADD ShowOnPos BIT NULL DEFAULT ((1));
                    IF COL_LENGTH('dbo.ItemGroups', 'Color') IS NULL
                        ALTER TABLE dbo.ItemGroups ADD Color NVARCHAR(50) NULL;
                `);
                const showOnPosVal = data.showOnPos !== undefined ? (data.showOnPos ? 1 : 0) : (data.ShowOnPos !== undefined ? (data.ShowOnPos ? 1 : 0) : null);
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || data.Name || null)
                    .input('Code', sql.NVarChar(50), data.code || data.Code || null)
                    .input('ParentCategoryId', sql.NVarChar(64), data.parentCategoryId || data.ParentCategoryId || null)
                    .input('ShowOnPos', sql.Bit, showOnPosVal)
                    .input('Color', sql.NVarChar(50), data.color !== undefined ? data.color : (data.Color !== undefined ? data.Color : null))
                    .query(`
                        UPDATE dbo.ItemGroups 
                        SET Name = COALESCE(@Name, Name), Code = COALESCE(@Code, Code), ParentCategoryId = COALESCE(@ParentCategoryId, ParentCategoryId), ShowOnPos = COALESCE(@ShowOnPos, ShowOnPos), Color = COALESCE(@Color, Color)
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if ((path === 'itemSubCategories1' || path === 'itemSubCategories2') && updateId) {
                const tableName = path === 'itemSubCategories1' ? 'dbo.ItemSubCategories1' : 'dbo.ItemSubCategories2';
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || data.Name || null)
                    .input('Code', sql.NVarChar(50), data.code || data.Code || null)
                    .query(`
                        UPDATE ${tableName}
                        SET Name = COALESCE(@Name, Name), Code = COALESCE(@Code, Code), UpdatedAt = sysutcdatetime()
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'warehouses' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || data.Name || null)
                    .input('Code', sql.NVarChar(50), data.code || data.Code || null)
                    .input('Address', sql.NVarChar(500), data.address || data.Address || null)
                    .input('WarehouseType', sql.NVarChar(50), data.warehouseType || null)
                    .input('IsRepWarehouse', sql.Bit, data.isRepWarehouse !== undefined ? (data.isRepWarehouse ? 1 : 0) : null)
                    .input('IsMain', sql.Bit, data.isMain !== undefined ? (data.isMain ? 1 : 0) : null)
                    .input('IsClosed', sql.Bit, data.isClosed !== undefined ? (data.isClosed ? 1 : 0) : null)
                    .input('RepId', sql.NVarChar(64), data.repId || null)
                    .query(`
                        UPDATE dbo.Warehouses 
                        SET 
                            Name = COALESCE(@Name, Name), 
                            Code = COALESCE(@Code, Code), 
                            Address = COALESCE(@Address, Address),
                            WarehouseType = COALESCE(@WarehouseType, WarehouseType),
                            IsRepWarehouse = COALESCE(@IsRepWarehouse, IsRepWarehouse),
                            IsMain = COALESCE(@IsMain, IsMain),
                            IsClosed = COALESCE(@IsClosed, IsClosed),
                            RepId = COALESCE(@RepId, RepId),
                            UpdatedAt = SYSUTCDATETIME()
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'salesInvoices' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Status', sql.NVarChar(50), data.status || null)
                    .input('PaidAmount', sql.Decimal(18, 4), data.paidAmount !== undefined ? Number(data.paidAmount) : null)
                    .input('DeliveryReconciled', sql.Bit, data.deliveryReconciled !== undefined ? (data.deliveryReconciled ? 1 : 0) : null)
                    .input('EtaUuid', sql.NVarChar(64), data.etaUuid || null)
                    .input('EtaStatus', sql.NVarChar(50), data.etaStatus || null)
                    .input('EtaSubmissionId', sql.NVarChar(64), data.etaSubmissionId || null)
                    .query(`
                        UPDATE dbo.SalesInvoices
                        SET 
                            Status = COALESCE(@Status, Status),
                            PaidAmount = COALESCE(@PaidAmount, PaidAmount),
                            DeliveryReconciled = COALESCE(@DeliveryReconciled, DeliveryReconciled),
                            EtaUuid = COALESCE(@EtaUuid, EtaUuid),
                            EtaStatus = COALESCE(@EtaStatus, EtaStatus),
                            EtaSubmissionId = COALESCE(@EtaSubmissionId, EtaSubmissionId),
                            UpdatedAt = SYSUTCDATETIME()
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'fixedAssets' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || null)
                    .input('Code', sql.NVarChar(100), data.code || null)
                    .input('PurchasePrice', sql.Decimal(18, 4), (data.purchasePrice ?? data.cost) !== undefined ? Number(data.purchasePrice ?? data.cost) : null)
                    .input('Cost', sql.Decimal(18, 4), (data.cost ?? data.purchasePrice) !== undefined ? Number(data.cost ?? data.purchasePrice) : null)
                    .input('CurrentValue', sql.Decimal(18, 4), data.currentValue !== undefined ? Number(data.currentValue) : null)
                    .input('UsefulLifeYears', sql.Int, data.usefulLifeYears !== undefined ? Number(data.usefulLifeYears) : null)
                    .input('SalvageValue', sql.Decimal(18, 4), data.salvageValue !== undefined ? Number(data.salvageValue) : null)
                    .input('DepreciationRate', sql.Decimal(5, 2), data.depreciationRate !== undefined ? Number(data.depreciationRate) : null)
                    .input('DepreciationMethod', sql.NVarChar(50), data.depreciationMethod || null)
                    .input('WarehouseId', sql.NVarChar(64), data.warehouseId || null)
                    .input('Status', sql.NVarChar(50), data.status || null)
                    .input('DisposedDate', sql.DateTime2, data.disposedDate ? parseDate(data.disposedDate) : null)
                    .input('SaleProceeds', sql.Decimal(18, 4), data.saleProceeds !== undefined ? Number(data.saleProceeds) : null)
                    .input('Notes', sql.NVarChar(sql.MAX), data.notes !== undefined ? String(data.notes) : null)
                    .query(`
                        UPDATE dbo.FixedAssets
                        SET 
                            Name = COALESCE(@Name, Name),
                            Code = COALESCE(@Code, Code),
                            PurchasePrice = COALESCE(@PurchasePrice, PurchasePrice),
                            Cost = COALESCE(@Cost, Cost),
                            CurrentValue = COALESCE(@CurrentValue, CurrentValue),
                            UsefulLifeYears = COALESCE(@UsefulLifeYears, UsefulLifeYears),
                            SalvageValue = COALESCE(@SalvageValue, SalvageValue),
                            DepreciationRate = COALESCE(@DepreciationRate, DepreciationRate),
                            DepreciationMethod = COALESCE(@DepreciationMethod, DepreciationMethod),
                            WarehouseId = COALESCE(@WarehouseId, WarehouseId),
                            Status = COALESCE(@Status, Status),
                            DisposedDate = COALESCE(@DisposedDate, DisposedDate),
                            SaleProceeds = COALESCE(@SaleProceeds, SaleProceeds),
                            Notes = COALESCE(@Notes, Notes),
                            UpdatedAt = SYSUTCDATETIME()
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'purchaseInvoices' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Discount', sql.Decimal(18, 4), data.discount !== undefined ? Number(data.discount) : null)
                    .input('Total', sql.Decimal(18, 4), data.total !== undefined ? Number(data.total) : null)
                    .input('Subtotal', sql.Decimal(18, 4), data.subtotal !== undefined ? Number(data.subtotal) : null)
                    .input('PaidAmount', sql.Decimal(18, 4), data.paidAmount !== undefined ? Number(data.paidAmount) : null)
                    .input('Notes', sql.NVarChar(sql.MAX), data.notes !== undefined ? (data.notes || '') : null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), data.items ? jsonString(data.items) : null)
                    .query(`
                        UPDATE dbo.PurchaseInvoices
                        SET 
                            Discount = COALESCE(@Discount, Discount),
                            Total = COALESCE(@Total, Total),
                            Subtotal = COALESCE(@Subtotal, Subtotal),
                            PaidAmount = COALESCE(@PaidAmount, PaidAmount),
                            Notes = COALESCE(@Notes, Notes),
                            ItemsJson = COALESCE(@ItemsJson, ItemsJson)
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'posSessions' && updateId) {
                if (data.cashierSessions && typeof data.cashierSessions === 'object' && await checkIsCentral()) {
                    const sessions = Object.values(data.cashierSessions) as any[];
                    const hasNewlyOpened = sessions.some(s => s && !s.isClosed && !s.endTime);
                    if (hasNewlyOpened) {
                        return NextResponse.json({
                            success: false,
                            error: "محظور: لا يمكن بدء أو فتح وردية كاشير في الإدارة المركزية. الكاشير مخصص لفروع البيع فقط."
                        }, { status: 403 });
                    }
                }
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('EndTime', sql.DateTime2, data.endTime ? parseDate(data.endTime) : (data.isClosed ? new Date() : null))
                    .input('ClosedBy', sql.NVarChar(64), data.closedBy || null)
                    .input('ClosedByName', sql.NVarChar(255), data.closedByName || null)
                    .input('IsClosed', sql.Bit, data.isClosed !== undefined ? (data.isClosed ? 1 : 0) : null)
                    .input('CashierSessionsJson', sql.NVarChar(sql.MAX), data.cashierSessions ? jsonString(data.cashierSessions) : null)
                    .input('ClosingStatementJson', sql.NVarChar(sql.MAX), data.closingStatementJson || (data.closingStatement ? jsonString(data.closingStatement) : null))
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PosSessions') AND name = 'ClosingStatementJson')
                        BEGIN
                            EXEC('ALTER TABLE dbo.PosSessions ADD ClosingStatementJson NVARCHAR(MAX) NULL;');
                        END

                        EXEC sp_executesql N'
                            UPDATE dbo.PosSessions
                            SET 
                                EndTime = COALESCE(@EndTime, EndTime),
                                ClosedBy = COALESCE(@ClosedBy, ClosedBy),
                                ClosedByName = COALESCE(@ClosedByName, ClosedByName),
                                IsClosed = COALESCE(@IsClosed, IsClosed),
                                CashierSessionsJson = COALESCE(@CashierSessionsJson, CashierSessionsJson),
                                ClosingStatementJson = COALESCE(@ClosingStatementJson, ClosingStatementJson),
                                UpdatedAt = SYSUTCDATETIME()
                            WHERE Id = @Id;
                        ', N'@Id NVARCHAR(64), @EndTime DATETIME2, @ClosedBy NVARCHAR(64), @ClosedByName NVARCHAR(255), @IsClosed BIT, @CashierSessionsJson NVARCHAR(MAX), @ClosingStatementJson NVARCHAR(MAX)',
                        @Id, @EndTime, @ClosedBy, @ClosedByName, @IsClosed, @CashierSessionsJson, @ClosingStatementJson;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'posTerminals' && updateId) {
                if (await checkIsCentral()) {
                    return NextResponse.json({
                        success: false,
                        error: "محظور: لا يمكن تعديل أجهزة كاشير في الإدارة المركزية. نقاط البيع تُدار من فروع البيع الفعلية فقط."
                    }, { status: 403 });
                }
                let branchCode = data.branchCode || null;
                let branchName = data.branchName || null;
                if (!branchCode && data.warehouseId) {
                    const whRes = await pool.request().input('WId', sql.NVarChar(64), data.warehouseId).query('SELECT Code, Name FROM dbo.Warehouses WHERE Id = @WId');
                    if (whRes.recordset[0]) {
                        branchCode = whRes.recordset[0].Code;
                        branchName = whRes.recordset[0].Name;
                    }
                }
                const branch = await getBranchInfo(pool, branchCode, branchName);

                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Code', sql.NVarChar(50), data.code !== undefined ? String(data.code).trim() : null)
                    .input('Name', sql.NVarChar(255), data.name || null)
                    .input('WarehouseId', sql.NVarChar(64), data.warehouseId || null)
                    .input('BranchCode', sql.NVarChar(50), branch.branchCode)
                    .input('BranchName', sql.NVarChar(255), branch.branchName)
                    .input('PosPrinterType', sql.NVarChar(50), data.posPrinterType || null)
                    .input('PosPrinterAddress', sql.NVarChar(255), data.posPrinterAddress || null)
                    .input('EnableKitchenPrinter', sql.Bit, data.enableKitchenPrinter !== undefined ? (data.enableKitchenPrinter ? 1 : 0) : null)
                    .input('KitchenPrinterType', sql.NVarChar(50), data.kitchenPrinterType || null)
                    .input('KitchenPrinterAddress', sql.NVarChar(255), data.kitchenPrinterAddress || null)
                    .query(`
                        UPDATE dbo.PosTerminals
                        SET 
                            Code = COALESCE(@Code, Code),
                            Name = COALESCE(@Name, Name),
                            WarehouseId = COALESCE(@WarehouseId, WarehouseId),
                            BranchCode = COALESCE(@BranchCode, BranchCode),
                            BranchName = COALESCE(@BranchName, BranchName),
                            PosPrinterType = COALESCE(@PosPrinterType, PosPrinterType),
                            PosPrinterAddress = COALESCE(@PosPrinterAddress, PosPrinterAddress),
                            EnableKitchenPrinter = COALESCE(@EnableKitchenPrinter, EnableKitchenPrinter),
                            KitchenPrinterType = COALESCE(@KitchenPrinterType, KitchenPrinterType),
                            KitchenPrinterAddress = COALESCE(@KitchenPrinterAddress, KitchenPrinterAddress),
                            UpdatedAt = SYSUTCDATETIME()
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'users' && updateId) {
                const isRepUser = data.isSalesRep === true || data.role === 'مندوب' || (typeof data.role === 'string' && data.role.includes('مندوب'));
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Name', sql.NVarChar(255), data.name || null)
                    .input('LoginName', sql.NVarChar(100), data.loginName || null)
                    .input('Password', sql.NVarChar(255), data.password ? String(data.password) : null)
                    .input('Role', sql.NVarChar(100), data.role || null)
                    .input('Phone', sql.NVarChar(50), data.phone !== undefined ? (data.phone || null) : null)
                    .input('Email', sql.NVarChar(255), data.email !== undefined ? (data.email || null) : null)
                    .input('NationalId', sql.NVarChar(50), data.nationalId !== undefined ? (data.nationalId || null) : null)
                    .input('SocialInsuranceNumber', sql.NVarChar(50), data.socialInsuranceNumber !== undefined ? (data.socialInsuranceNumber || null) : null)
                    .input('JobTitle', sql.NVarChar(100), data.jobTitle !== undefined ? (data.jobTitle || null) : null)
                    .input('Department', sql.NVarChar(100), data.department !== undefined ? (data.department || null) : null)
                    .input('HiringDate', sql.NVarChar(50), data.hiringDate !== undefined ? (data.hiringDate || null) : null)
                    .input('BasicSalary', sql.Decimal(18, 4), data.basicSalary !== undefined ? Number(data.basicSalary) : null)
                    .input('HousingAllowance', sql.Decimal(18, 4), data.housingAllowance !== undefined ? Number(data.housingAllowance) : null)
                    .input('TransportAllowance', sql.Decimal(18, 4), data.transportAllowance !== undefined ? Number(data.transportAllowance) : null)
                    .input('SocialInsuranceDeduction', sql.Decimal(18, 4), data.socialInsuranceDeduction !== undefined ? Number(data.socialInsuranceDeduction) : null)
                    .input('PhotoUrl', sql.NVarChar(sql.MAX), data.photoUrl !== undefined ? (data.photoUrl || '') : null)
                    .input('WeeklyOffDays', sql.NVarChar(255), data.weeklyOffDays !== undefined ? jsonString(data.weeklyOffDays) : null)
                    .input('AnnualLeaveDays', sql.Int, data.annualLeaveDays !== undefined ? Number(data.annualLeaveDays) : null)
                    .input('UsedLeaveDays', sql.Int, data.usedLeaveDays !== undefined ? Number(data.usedLeaveDays) : null)
                    .input('Status', sql.NVarChar(50), data.status || null)
                    .input('BranchId', sql.NVarChar(64), data.branchId !== undefined ? (data.branchId || null) : null)
                    .input('Notes', sql.NVarChar(sql.MAX), data.notes !== undefined ? String(data.notes) : null)
                    .input('IsCashier', sql.Bit, data.isCashier !== undefined ? (data.isCashier ? 1 : 0) : null)
                    .input('IsDelivery', sql.Bit, data.isDelivery !== undefined ? (data.isDelivery ? 1 : 0) : null)
                    .input('IsSalesRep', sql.Bit, isRepUser ? 1 : (data.isSalesRep !== undefined ? (data.isSalesRep ? 1 : 0) : null))
                    .input('CanOpenOwnShift', sql.Bit, data.canOpenOwnShift !== undefined ? (data.canOpenOwnShift ? 1 : 0) : null)
                    .input('CanDeleteFromCart', sql.Bit, data.canDeleteFromCart !== undefined ? (data.canDeleteFromCart ? 1 : 0) : null)
                    .input('CanProcessReturn', sql.Bit, data.canProcessReturn !== undefined ? (data.canProcessReturn ? 1 : 0) : null)
                    .input('CanCancelInvoice', sql.Bit, data.canCancelInvoice !== undefined ? (data.canCancelInvoice ? 1 : 0) : null)
                    .input('CanBypassScannerForReturn', sql.Bit, data.canBypassScannerForReturn !== undefined ? (data.canBypassScannerForReturn ? 1 : 0) : null)
                    .input('IsDisabled', sql.Bit, data.isDisabled !== undefined ? (data.isDisabled ? 1 : 0) : null)
                    .input('WarehouseIds', sql.NVarChar(sql.MAX), data.warehouseIds ? jsonString(data.warehouseIds) : null)
                    .input('ThemeSettings', sql.NVarChar(sql.MAX), data.themeSettings ? jsonString(data.themeSettings) : null)
                    .query(`
                        UPDATE dbo.Users
                        SET 
                            Name = COALESCE(@Name, Name),
                            LoginName = COALESCE(@LoginName, LoginName),
                            Password = COALESCE(@Password, Password),
                            Role = COALESCE(@Role, Role),
                            Phone = COALESCE(@Phone, Phone),
                            Email = COALESCE(@Email, Email),
                            NationalId = COALESCE(@NationalId, NationalId),
                            SocialInsuranceNumber = COALESCE(@SocialInsuranceNumber, SocialInsuranceNumber),
                            JobTitle = COALESCE(@JobTitle, JobTitle),
                            Department = COALESCE(@Department, Department),
                            HiringDate = COALESCE(@HiringDate, HiringDate),
                            BasicSalary = COALESCE(@BasicSalary, BasicSalary),
                            HousingAllowance = COALESCE(@HousingAllowance, HousingAllowance),
                            TransportAllowance = COALESCE(@TransportAllowance, TransportAllowance),
                            SocialInsuranceDeduction = COALESCE(@SocialInsuranceDeduction, SocialInsuranceDeduction),
                            PhotoUrl = CASE WHEN @PhotoUrl IS NOT NULL THEN NULLIF(@PhotoUrl, '') ELSE PhotoUrl END,
                            WeeklyOffDays = COALESCE(@WeeklyOffDays, WeeklyOffDays),
                            AnnualLeaveDays = COALESCE(@AnnualLeaveDays, AnnualLeaveDays),
                            UsedLeaveDays = COALESCE(@UsedLeaveDays, UsedLeaveDays),
                            Status = COALESCE(@Status, Status),
                            BranchId = COALESCE(@BranchId, BranchId),
                            Notes = COALESCE(@Notes, Notes),
                            IsCashier = COALESCE(@IsCashier, IsCashier),
                            IsDelivery = COALESCE(@IsDelivery, IsDelivery),
                            IsSalesRep = COALESCE(@IsSalesRep, IsSalesRep),
                            CanOpenOwnShift = COALESCE(@CanOpenOwnShift, CanOpenOwnShift),
                            CanDeleteFromCart = COALESCE(@CanDeleteFromCart, CanDeleteFromCart),
                            CanProcessReturn = COALESCE(@CanProcessReturn, CanProcessReturn),
                            CanCancelInvoice = COALESCE(@CanCancelInvoice, CanCancelInvoice),
                            CanBypassScannerForReturn = COALESCE(@CanBypassScannerForReturn, CanBypassScannerForReturn),
                            IsDisabled = COALESCE(@IsDisabled, IsDisabled),
                            WarehouseIds = COALESCE(@WarehouseIds, WarehouseIds),
                            ThemeSettings = COALESCE(@ThemeSettings, ThemeSettings),
                            UpdatedAt = SYSUTCDATETIME()
                        WHERE Id = @Id;
                    `);

                if (isRepUser) {
                    const uRes = await pool.request().input('Id', sql.NVarChar(64), updateId).query(`SELECT Name, WarehouseIds FROM dbo.Users WHERE Id = @Id`);
                    const repName = data.name || uRes.recordset[0]?.Name || 'مندوب';
                    await ensureRepWarehouseAndAccount(pool, updateId, repName, data.warehouseIds);
                }

                return NextResponse.json({ success: true });
            }

            if (path === 'roles') {
                for (const [roleName, perms] of Object.entries(data)) {
                    await pool.request()
                        .input('Id', sql.NVarChar(100), roleName)
                        .input('PermissionsJson', sql.NVarChar(sql.MAX), jsonString(perms))
                        .query(`
                            IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE Id = @Id)
                                INSERT INTO dbo.Roles (Id, PermissionsJson) VALUES (@Id, @PermissionsJson);
                            ELSE
                                UPDATE dbo.Roles SET PermissionsJson = @PermissionsJson WHERE Id = @Id;
                        `);
                }
                return NextResponse.json({ success: true });
            }

            if (path === 'settings') {
                const targetKey = updateId || 'main';
                const currentRes = await pool.request()
                    .input('SettingKey', sql.NVarChar(100), targetKey)
                    .query('SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = @SettingKey');

                let existingObj: any = {};
                if (currentRes.recordset.length > 0 && currentRes.recordset[0].SettingValue) {
                    try { existingObj = JSON.parse(currentRes.recordset[0].SettingValue); } catch { }
                }

                const merged = { ...existingObj, ...data };

                await pool.request()
                    .input('SettingKey', sql.NVarChar(100), targetKey)
                    .input('SettingValue', sql.NVarChar(sql.MAX), JSON.stringify(merged))
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = @SettingKey)
                            INSERT INTO dbo.AppSettings (SettingKey, SettingValue) VALUES (@SettingKey, @SettingValue);
                        ELSE
                            UPDATE dbo.AppSettings SET SettingValue = @SettingValue WHERE SettingKey = @SettingKey;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'stockInRecords' && updateId) {
                // The receive/update path needs the same compatibility upgrade as creation.
                await pool.request().query(`
                    IF COL_LENGTH('dbo.StockInRecords', 'StockTransferId') IS NULL
                        ALTER TABLE dbo.StockInRecords ADD StockTransferId NVARCHAR(64) NULL;
                    IF COL_LENGTH('dbo.StockInRecords', 'ReceivedById') IS NULL
                        ALTER TABLE dbo.StockInRecords ADD ReceivedById NVARCHAR(64) NULL;
                    IF COL_LENGTH('dbo.StockInRecords', 'ReceivedByName') IS NULL
                        ALTER TABLE dbo.StockInRecords ADD ReceivedByName NVARCHAR(255) NULL;
                    IF COL_LENGTH('dbo.StockInRecords', 'ReceivedDate') IS NULL
                        ALTER TABLE dbo.StockInRecords ADD ReceivedDate DATETIME2 NULL;
                    IF COL_LENGTH('dbo.StockInRecords', 'AllocationsJson') IS NULL
                        ALTER TABLE dbo.StockInRecords ADD AllocationsJson NVARCHAR(MAX) NULL;
                `);
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Status', sql.NVarChar(50), data.status || null)
                    .input('Notes', sql.NVarChar(sql.MAX), data.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), data.items ? jsonString(data.items) : null)
                    .input('AllocationsJson', sql.NVarChar(sql.MAX), data.allocations ? jsonString(data.allocations) : null)
                    .input('ReceivedById', sql.NVarChar(64), data.receivedById || null)
                    .input('ReceivedByName', sql.NVarChar(255), data.receivedByName || null)
                    .input('ReceivedDate', sql.DateTime2, data.receivedDate ? new Date(data.receivedDate) : null)
                    .query(`
                        UPDATE dbo.StockInRecords
                        SET 
                            Status        = COALESCE(@Status, Status),
                            Notes         = COALESCE(@Notes, Notes),
                            ItemsJson     = COALESCE(@ItemsJson, ItemsJson),
                            AllocationsJson = COALESCE(@AllocationsJson, AllocationsJson),
                            ReceivedById  = COALESCE(@ReceivedById, ReceivedById),
                            ReceivedByName= COALESCE(@ReceivedByName, ReceivedByName),
                            ReceivedDate  = COALESCE(@ReceivedDate, ReceivedDate),
                            UpdatedAt     = sysutcdatetime()
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'stockOutRecords' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Status', sql.NVarChar(50), data.status || null)
                    .input('Notes', sql.NVarChar(sql.MAX), data.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), data.items ? jsonString(data.items) : null)
                    .query(`
                        UPDATE dbo.StockOutRecords
                        SET 
                            Status = COALESCE(@Status, Status),
                            Notes = COALESCE(@Notes, Notes),
                            ItemsJson = COALESCE(@ItemsJson, ItemsJson),
                            UpdatedAt = sysutcdatetime()
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'requisitions' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('Status', sql.NVarChar(50), data.status || null)
                    .input('Notes', sql.NVarChar(sql.MAX), data.notes || null)
                    .input('ItemsJson', sql.NVarChar(sql.MAX), data.items ? jsonString(data.items) : null)
                    .query(`
                        UPDATE dbo.Requisitions
                        SET 
                            Status = COALESCE(@Status, Status),
                            Notes = COALESCE(@Notes, Notes),
                            ItemsJson = COALESCE(@ItemsJson, ItemsJson),
                            UpdatedAt = sysutcdatetime()
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'inventorySections' && updateId) {
                await pool.request()
                    .input('Id', sql.NVarChar(64), updateId)
                    .input('MainWarehouseId', sql.NVarChar(64), data.mainWarehouseId || data.MainWarehouseId || null)
                    .input('Name', sql.NVarChar(255), data.name || data.Name || null)
                    .input('Capacity', sql.Int, data.capacity !== undefined ? Number(data.capacity) : null)
                    .input('AllowOverfill', sql.Bit, data.allowOverfill !== undefined ? (data.allowOverfill ? 1 : 0) : null)
                    .query(`
                        UPDATE dbo.InventorySections
                        SET 
                            MainWarehouseId = COALESCE(@MainWarehouseId, MainWarehouseId),
                            Name = COALESCE(@Name, Name),
                            Capacity = COALESCE(@Capacity, Capacity),
                            AllowOverfill = COALESCE(@AllowOverfill, AllowOverfill),
                            UpdatedAt = sysutcdatetime()
                        WHERE Id = @Id;
                    `);
                return NextResponse.json({ success: true });
            }

            if (path === 'licenses' && updateId) {
                const fields: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.key !== undefined || data.Key !== undefined) {
                    req.input('Key', sql.NVarChar(255), data.key || data.Key);
                    fields.push('[Key] = @Key');
                }
                if (data.startDate !== undefined) {
                    req.input('StartDate', sql.DateTime2, data.startDate ? parseDate(data.startDate) : null);
                    fields.push('StartDate = @StartDate');
                }
                if (data.endDate !== undefined) {
                    req.input('EndDate', sql.DateTime2, data.endDate ? parseDate(data.endDate) : null);
                    fields.push('EndDate = @EndDate');
                }
                if (data.status !== undefined) {
                    req.input('Status', sql.NVarChar(50), data.status);
                    fields.push('Status = @Status');
                }
                if (data.maxUsers !== undefined) {
                    req.input('MaxUsers', sql.Int, Number(data.maxUsers));
                    fields.push('MaxUsers = @MaxUsers');
                }
                if (data.enabledModules !== undefined) {
                    req.input('EnabledModules', sql.NVarChar(sql.MAX), jsonString(data.enabledModules));
                    fields.push('EnabledModules = @EnabledModules');
                }
                if (data.assignedWarehouseIds !== undefined) {
                    req.input('AssignedWarehouseIds', sql.NVarChar(sql.MAX), jsonString(data.assignedWarehouseIds));
                    fields.push('AssignedWarehouseIds = @AssignedWarehouseIds');
                }
                if (data.assignedTo !== undefined) {
                    req.input('AssignedTo', sql.NVarChar(255), data.assignedTo);
                    fields.push('AssignedTo = @AssignedTo');
                }
                await req.query(`UPDATE dbo.Licenses SET ${fields.join(', ')} WHERE Id = @Id OR [Key] = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'restaurantTables' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.number !== undefined || data.tableNumber !== undefined) {
                    req.input('TableNumber', sql.NVarChar(50), String(data.number ?? data.tableNumber));
                    fields.push('TableNumber = @TableNumber');
                }
                if (data.seats !== undefined || data.capacity !== undefined) {
                    req.input('Capacity', sql.Int, Number(data.seats ?? data.capacity ?? 4));
                    fields.push('Capacity = @Capacity');
                }
                if (data.status !== undefined) {
                    req.input('Status', sql.NVarChar(50), String(data.status));
                    fields.push('Status = @Status');
                }
                if (data.groupName !== undefined || data.zone !== undefined) {
                    req.input('Zone', sql.NVarChar(100), (data.groupName ?? data.zone) || null);
                    fields.push('Zone = @Zone');
                }
                if (data.warehouseId !== undefined) {
                    req.input('WarehouseId', sql.NVarChar(64), data.warehouseId || null);
                    fields.push('WarehouseId = @WarehouseId');
                }
                await req.query(`UPDATE dbo.RestaurantTables SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'heldInvoices' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.heldAt !== undefined) {
                    req.input('HeldAt', sql.DateTime2, parseDate(data.heldAt));
                    fields.push('HeldAt = @HeldAt');
                }
                if (data.tableId !== undefined) {
                    req.input('TableId', sql.NVarChar(64), data.tableId || null);
                    fields.push('TableId = @TableId');
                }
                if (data.customerName !== undefined) {
                    req.input('CustomerName', sql.NVarChar(255), data.customerName || null);
                    fields.push('CustomerName = @CustomerName');
                }
                if (data.total !== undefined) {
                    req.input('Total', sql.Decimal(18, 4), Number(data.total) || 0);
                    fields.push('Total = @Total');
                }
                if (data.cart !== undefined || data.items !== undefined) {
                    const cartPayload = {
                        cart: data.cart || data.items || [],
                        discount: Number(data.discount || 0),
                        tips: Number(data.tips || 0),
                        orderReference: data.orderReference || '',
                        tableName: data.tableName || '',
                    };
                    req.input('CartData', sql.NVarChar(sql.MAX), jsonString(cartPayload));
                    fields.push('CartData = @CartData');
                }
                await req.query(`UPDATE dbo.HeldInvoices SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'deliveryStaff' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.name !== undefined) { req.input('Name', sql.NVarChar(255), data.name); fields.push('Name = @Name'); }
                if (data.phone !== undefined) { req.input('Phone', sql.NVarChar(50), data.phone || null); fields.push('Phone = @Phone'); }
                if (data.vehicleType !== undefined) { req.input('VehicleType', sql.NVarChar(100), data.vehicleType || null); fields.push('VehicleType = @VehicleType'); }
                if (data.vehicleNumber !== undefined) { req.input('VehicleNumber', sql.NVarChar(50), data.vehicleNumber || null); fields.push('VehicleNumber = @VehicleNumber'); }
                if (data.warehouseId !== undefined) { req.input('WarehouseId', sql.NVarChar(64), data.warehouseId || null); fields.push('WarehouseId = @WarehouseId'); }
                if (data.isActive !== undefined) { req.input('IsActive', sql.Bit, data.isActive ? 1 : 0); fields.push('IsActive = @IsActive'); }
                await req.query(`UPDATE dbo.DeliveryStaff SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'employees' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.name !== undefined) { req.input('Name', sql.NVarChar(255), data.name); fields.push('Name = @Name'); }
                if (data.role !== undefined) { req.input('Role', sql.NVarChar(100), data.role || null); fields.push('Role = @Role'); }
                if (data.salary !== undefined) { req.input('Salary', sql.Decimal(18, 4), Number(data.salary) || 0); fields.push('Salary = @Salary'); }
                if (data.phone !== undefined) { req.input('Phone', sql.NVarChar(50), data.phone || null); fields.push('Phone = @Phone'); }
                if (data.hireDate !== undefined) { req.input('HireDate', sql.DateTime2, data.hireDate ? parseDate(data.hireDate) : null); fields.push('HireDate = @HireDate'); }
                await req.query(`UPDATE dbo.Employees SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'sellers' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.name !== undefined) { req.input('Name', sql.NVarChar(255), data.name); fields.push('Name = @Name'); }
                if (data.phone !== undefined) { req.input('Phone', sql.NVarChar(50), data.phone || null); fields.push('Phone = @Phone'); }
                if (data.commissionRate !== undefined) { req.input('CommissionRate', sql.Decimal(5, 2), Number(data.commissionRate) || 0); fields.push('CommissionRate = @CommissionRate'); }
                if (data.warehouseId !== undefined) { req.input('WarehouseId', sql.NVarChar(64), data.warehouseId || null); fields.push('WarehouseId = @WarehouseId'); }
                if (data.isActive !== undefined) { req.input('IsActive', sql.Bit, data.isActive ? 1 : 0); fields.push('IsActive = @IsActive'); }
                await req.query(`UPDATE dbo.Sellers SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'partners' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.name !== undefined) { req.input('Name', sql.NVarChar(255), data.name); fields.push('Name = @Name'); }
                if (data.sharePercentage !== undefined || data.share !== undefined) { req.input('SharePercentage', sql.Decimal(5, 2), Number(data.sharePercentage ?? data.share) || 0); fields.push('SharePercentage = @SharePercentage'); }
                if (data.contact !== undefined) { req.input('Contact', sql.NVarChar(255), data.contact || null); fields.push('Contact = @Contact'); }
                await req.query(`UPDATE dbo.Partners SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'paymentMethods' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.name !== undefined) { req.input('Name', sql.NVarChar(255), data.name); fields.push('Name = @Name'); }
                if (data.accountId !== undefined) { req.input('AccountId', sql.NVarChar(64), data.accountId || null); fields.push('AccountId = @AccountId'); }
                await req.query(`UPDATE dbo.PaymentMethods SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'promotions' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.name !== undefined) { req.input('Name', sql.NVarChar(255), data.name); fields.push('Name = @Name'); }
                if (data.type !== undefined) { req.input('Type', sql.NVarChar(50), data.type); fields.push('Type = @Type'); }
                if (data.value !== undefined) { req.input('Value', sql.Decimal(18, 4), Number(data.value) || 0); fields.push('Value = @Value'); }
                if (data.startDate !== undefined) { req.input('StartDate', sql.DateTime2, parseDate(data.startDate)); fields.push('StartDate = @StartDate'); }
                if (data.endDate !== undefined) { req.input('EndDate', sql.DateTime2, parseDate(data.endDate)); fields.push('EndDate = @EndDate'); }
                if (data.isActive !== undefined) { req.input('IsActive', sql.Bit, data.isActive ? 1 : 0); fields.push('IsActive = @IsActive'); }
                req.input('ConditionsJson', sql.NVarChar(sql.MAX), jsonString(data));
                fields.push('ConditionsJson = @ConditionsJson');
                await req.query(`UPDATE dbo.Promotions SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'itemColors' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.name !== undefined) { req.input('Name', sql.NVarChar(100), data.name); fields.push('Name = @Name'); }
                if (data.colorCode !== undefined || data.code !== undefined) { req.input('ColorCode', sql.NVarChar(50), (data.colorCode ?? data.code) || null); fields.push('ColorCode = @ColorCode'); }
                await req.query(`UPDATE dbo.ItemColors SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'itemSizes' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.name !== undefined) { req.input('Name', sql.NVarChar(100), data.name); fields.push('Name = @Name'); }
                await req.query(`UPDATE dbo.ItemSizes SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'barcodeDesigns' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.name !== undefined) { req.input('Name', sql.NVarChar(255), data.name || null); fields.push('Name = @Name'); }
                req.input('ConfigJson', sql.NVarChar(sql.MAX), jsonString(data));
                fields.push('ConfigJson = @ConfigJson');
                await req.query(`UPDATE dbo.BarcodeDesigns SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'suppliers' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.name !== undefined) { req.input('Name', sql.NVarChar(255), data.name); fields.push('Name = @Name'); }
                if (data.contact !== undefined) { req.input('Contact', sql.NVarChar(255), data.contact || null); fields.push('Contact = @Contact'); }
                if (data.openingBalance !== undefined) { req.input('OpeningBalance', sql.Decimal(18, 4), Number(data.openingBalance) || 0); fields.push('OpeningBalance = @OpeningBalance'); }
                if (data.items !== undefined) { req.input('ItemsJson', sql.NVarChar(sql.MAX), jsonString(data.items)); fields.push('ItemsJson = @ItemsJson'); }
                await req.query(`UPDATE dbo.Suppliers SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'cashAccounts' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.name !== undefined) { req.input('Name', sql.NVarChar(255), data.name); fields.push('Name = @Name'); }
                if (data.type !== undefined) { req.input('Type', sql.NVarChar(50), data.type); fields.push('Type = @Type'); }
                if (data.openingBalance !== undefined) { req.input('OpeningBalance', sql.Decimal(18, 4), Number(data.openingBalance) || 0); fields.push('OpeningBalance = @OpeningBalance'); }
                if (data.userId !== undefined) { req.input('UserId', sql.NVarChar(64), data.userId || null); fields.push('UserId = @UserId'); }
                if (data.warehouseId !== undefined) { req.input('WarehouseId', sql.NVarChar(64), data.warehouseId || null); fields.push('WarehouseId = @WarehouseId'); }
                await req.query(`UPDATE dbo.CashAccounts SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'expenses' && updateId) {
                const fields: string[] = ['UpdatedAt = sysutcdatetime()'];
                const req = pool.request().input('Id', sql.NVarChar(64), String(updateId));
                if (data.date !== undefined) { req.input('Date', sql.DateTime2, parseDate(data.date)); fields.push('Date = @Date'); }
                if (data.expenseType !== undefined) { req.input('ExpenseType', sql.NVarChar(100), data.expenseType || null); fields.push('ExpenseType = @ExpenseType'); }
                if (data.description !== undefined) { req.input('Description', sql.NVarChar(500), data.description || null); fields.push('Description = @Description'); }
                if (data.amount !== undefined) { req.input('Amount', sql.Decimal(18, 4), Number(data.amount) || 0); fields.push('Amount = @Amount'); }
                if (data.paidFromAccountId !== undefined) { req.input('PaidFromAccountId', sql.NVarChar(64), data.paidFromAccountId || null); fields.push('PaidFromAccountId = @PaidFromAccountId'); }
                if (data.warehouseId !== undefined) { req.input('WarehouseId', sql.NVarChar(64), data.warehouseId || null); fields.push('WarehouseId = @WarehouseId'); }
                await req.query(`UPDATE dbo.Expenses SET ${fields.join(', ')} WHERE Id = @Id;`);
                return NextResponse.json({ success: true, id: updateId });
            }

            if (path === 'targets') {
                const tId = updateId || data?.id || 'main_targets';
                await pool.request()
                    .input('Id', sql.NVarChar(64), String(tId))
                    .input('TargetKey', sql.NVarChar(100), data?.targetKey || String(tId))
                    .input('TargetPeriod', sql.NVarChar(50), data?.targetPeriod || 'monthly')
                    .input('TargetAmount', sql.Decimal(18, 4), Number(data?.targetAmount ?? data?.amount) || 0)
                    .input('AchievedAmount', sql.Decimal(18, 4), Number(data?.achievedAmount) || 0)
                    .input('DetailsJson', sql.NVarChar(sql.MAX), jsonString(data))
                    .query(`
                        IF EXISTS (SELECT 1 FROM dbo.Targets WHERE Id = @Id OR TargetKey = @TargetKey)
                            UPDATE dbo.Targets SET TargetPeriod = @TargetPeriod, TargetAmount = @TargetAmount, AchievedAmount = @AchievedAmount, DetailsJson = @DetailsJson, UpdatedAt = sysutcdatetime() WHERE Id = @Id OR TargetKey = @TargetKey;
                        ELSE
                            INSERT INTO dbo.Targets (Id, TargetKey, TargetPeriod, TargetAmount, AchievedAmount, DetailsJson) VALUES (@Id, @TargetKey, @TargetPeriod, @TargetAmount, @AchievedAmount, @DetailsJson);
                    `);
                return NextResponse.json({ success: true, id: String(tId) });
            }
        }

        // =====================================================================
        // ACTION: REMOVE
        // =====================================================================
        if (action === 'remove') {
            const removeId = payload?.id || payload;
            if (removeId) {
                const tableMap: Record<string, string> = {
                    items: 'dbo.Items',
                    itemSections: 'dbo.ItemSections',
                    inventorySections: 'dbo.InventorySections',
                    inventoryZones: 'dbo.InventoryZones',
                    itemCategories: 'dbo.ItemCategories',
                    itemGroups: 'dbo.ItemGroups',
                    itemSubCategories1: 'dbo.ItemSubCategories1',
                    itemSubCategories2: 'dbo.ItemSubCategories2',
                    itemColors: 'dbo.ItemColors',
                    itemSizes: 'dbo.ItemSizes',
                    barcodeDesigns: 'dbo.BarcodeDesigns',
                    customers: 'dbo.Customers',
                    suppliers: 'dbo.Suppliers',
                    partners: 'dbo.Partners',
                    sellers: 'dbo.Sellers',
                    deliveryStaff: 'dbo.DeliveryStaff',
                    employees: 'dbo.Employees',
                    paymentMethods: 'dbo.PaymentMethods',
                    promotions: 'dbo.Promotions',
                    restaurantTables: 'dbo.RestaurantTables',
                    targets: 'dbo.Targets',
                    salesInvoices: 'dbo.SalesInvoices',
                    salesReturns: 'dbo.SalesReturns',
                    purchaseInvoices: 'dbo.PurchaseInvoices',
                    purchaseReturns: 'dbo.PurchaseReturns',
                    purchaseOrders: 'dbo.PurchaseOrders',
                    requisitions: 'dbo.Requisitions',
                    customerPayments: 'dbo.CustomerPayments',
                    supplierPayments: 'dbo.SupplierPayments',
                    expenses: 'dbo.Expenses',
                    exceptionalIncomes: 'dbo.ExceptionalIncomes',
                    treasuryTransactions: 'dbo.TreasuryTransactions',
                    profitDistributions: 'dbo.ProfitDistributions',
                    repRemittances: 'dbo.RepRemittances',
                    employeeAdvances: 'dbo.EmployeeAdvances',
                    employeeAdjustments: 'dbo.EmployeeAdjustments',
                    fixedAssets: 'dbo.FixedAssets',
                    depreciationRecords: 'dbo.DepreciationRecords',
                    heldInvoices: 'dbo.HeldInvoices',
                    warehouses: 'dbo.Warehouses',
                    cashAccounts: 'dbo.CashAccounts',
                    users: 'dbo.Users',
                    roles: 'dbo.Roles',
                    customerVisits: 'dbo.CustomerVisits',
                    loginHistory: 'dbo.LoginHistory',
                    priceChangeLogs: 'dbo.PriceChangeLogs',
                    payrollRecords: 'dbo.PayrollRecords',
                    stockInRecords: 'dbo.StockInRecords',
                    stockOutRecords: 'dbo.StockOutRecords',
                    stockTransferRecords: 'dbo.StockTransferRecords',
                    stockAdjustmentRecords: 'dbo.StockAdjustmentRecords',
                    stockIssuesToReps: 'dbo.StockIssuesToReps',
                    stockReturnsFromReps: 'dbo.StockReturnsFromReps',
                    inventoryClosings: 'dbo.InventoryClosings',
                    posTerminals: 'dbo.PosTerminals',
                    posSessions: 'dbo.PosSessions',
                    manufacturingOrders: 'dbo.ManufacturingOrders',
                    generalLedgerEntries: 'dbo.GeneralLedgerEntries',
                    licenses: 'dbo.Licenses',
                    snoozedRecommendations: 'dbo.SnoozedRecommendations'
                };

                const executeCascadeDeleteOnPool = async (targetPool: sql.ConnectionPool, tableName: string) => {
                    if (path === 'users' && removeId) {
                        await targetPool.request().input('RepId', sql.NVarChar(64), String(removeId)).query(`
                            DELETE FROM dbo.Warehouses WHERE RepId = @RepId;
                            DELETE FROM dbo.CashAccounts WHERE UserId = @RepId;
                            DELETE FROM dbo.Employees WHERE Id = @RepId;
                            DELETE FROM dbo.Sellers WHERE Id = @RepId;
                        `);
                    }
                    if (path === 'warehouses' && removeId) {
                        await targetPool.request().input('WhId', sql.NVarChar(64), String(removeId)).query(`
                            DELETE FROM dbo.PosTerminals WHERE WarehouseId = @WhId;
                            DELETE FROM dbo.CashAccounts WHERE WarehouseId = @WhId;
                            DELETE FROM dbo.InventorySections WHERE MainWarehouseId = @WhId;
                            DELETE FROM dbo.InventoryZones WHERE WarehouseId = @WhId;
                        `);
                    }
                    if (path === 'cashAccounts' && removeId) {
                        await targetPool.request().input('AccId', sql.NVarChar(64), String(removeId)).query(`
                            UPDATE dbo.PaymentMethods SET AccountId = NULL WHERE AccountId = @AccId;
                        `);
                    }
                    if (path === 'licenses') {
                        await targetPool.request()
                            .input('Id', sql.NVarChar(64), String(removeId))
                            .query(`DELETE FROM dbo.Licenses WHERE Id = @Id OR [Key] = @Id;`);
                    } else if (path === 'targets') {
                        await targetPool.request()
                            .input('Id', sql.NVarChar(64), String(removeId))
                            .query(`DELETE FROM dbo.Targets WHERE Id = @Id OR TargetKey = @Id;`);
                    } else {
                        await targetPool.request()
                            .input('Id', sql.NVarChar(64), String(removeId))
                            .query(`DELETE FROM ${tableName} WHERE Id = @Id;`);
                    }
                };

                const tableName = tableMap[path];
                if (tableName) {
                    if (path === 'customerPayments' || path === 'supplierPayments') {
                        const tx = new sql.Transaction(pool);
                        await tx.begin();
                        try {
                            const kind = path === 'customerPayments' ? 'customer' : 'supplier';
                            const paymentTable = kind === 'customer' ? 'dbo.CustomerPayments' : 'dbo.SupplierPayments';
                            const payment = await new sql.Request(tx)
                                .input('Id', sql.NVarChar(64), String(removeId))
                                .query(`SELECT InvoiceId FROM ${paymentTable} WHERE Id = @Id`);
                            const invoiceId = payment.recordset[0]?.InvoiceId as string | null;
                            if (invoiceId) await recalculateInvoicePaymentImpact(tx, kind, invoiceId);
                            await new sql.Request(tx)
                                .input('Id', sql.NVarChar(64), String(removeId))
                                .query(`DELETE FROM ${paymentTable} WHERE Id = @Id;`);
                            if (invoiceId) await recalculateInvoicePaymentImpact(tx, kind, invoiceId);
                            await tx.commit();
                        } catch (error) {
                            await tx.rollback();
                            throw error;
                        }
                    } else {
                        await executeCascadeDeleteOnPool(pool, tableName);
                    }

                    // Propagate deletion to Central HQ database so background Auto-Sync never pulls the deleted record back
                    try {
                        const cfg = await getCentralConfig();
                        if (cfg && cfg.centralServerIp) {
                            const centralPool = await connectToCentral(cfg);
                            try {
                                await executeCascadeDeleteOnPool(centralPool, tableName);
                            } finally {
                                await centralPool.close();
                            }
                        }
                    } catch {
                        // Best-effort central delete when central server is offline
                    }

                    return NextResponse.json({ success: true });
                }
            }
        }

        return NextResponse.json({ success: true, message: 'Processed' });
    } catch (error: any) {
        console.error('Error in /api/db/action:', error);

        // Safely log error into dbo.SystemErrorLogs table in SQL Server
        await logSystemError({
            source: 'API:db/action',
            action: body?.action ? `${body?.path}/${body?.action}` : (body?.path || 'unknown'),
            endpoint: '/api/db/action',
            errorMessage: error.message || 'Error in /api/db/action',
            errorStack: error.stack,
            errorCode: error.number || error.code || 500,
            statusCode: error instanceof ReturnValidationError ? 400 : 500,
            requestPayload: body,
            userId: body?.payload?.userId || body?.payload?.createdById || null,
            userName: body?.payload?.userName || body?.payload?.createdByName || null,
            warehouseId: body?.payload?.warehouseId || null,
            branchCode: body?.payload?.branchCode || null
        });

        return NextResponse.json({ success: false, error: error.message }, { status: error instanceof ReturnValidationError ? 400 : 500 });
    }
}
