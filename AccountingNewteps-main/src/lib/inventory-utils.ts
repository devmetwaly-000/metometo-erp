"use client";

// This file contains utility functions related to inventory calculation
// to be shared across different components and pages.

export const calculateStockForItemInWarehouse = (
    itemId: string, 
    warehouseId: string, 
    allData: any,
    asOfDate?: string | Date | null
): number => {
    if (!warehouseId || warehouseId === 'all') return 0;
    if (!allData) return 0;

    const {
        inventoryClosings, stockInRecords, stockOutRecords, stockTransferRecords, stockAdjustmentRecords,
        salesInvoices, salesReturns, posSales, posReturns, purchaseReturns,
        stockIssuesToReps, stockReturnsFromReps
    } = allData;

    const maxTime = asOfDate ? new Date(asOfDate).setHours(23, 59, 59, 999) : Infinity;

    // 1. Find all closings on or before asOfDate for this warehouse and sort descending
    const closingsForWarehouse = (inventoryClosings || [])
        .filter((c: any) => {
            const wMatch = (c.warehouseId === warehouseId || c.WarehouseId === warehouseId);
            if (!wMatch) return false;
            const cTime = new Date(c.closingDate || c.ClosingDate).getTime();
            return cTime <= maxTime;
        })
        .sort((a: any, b: any) => new Date(b.closingDate || b.ClosingDate).getTime() - new Date(a.closingDate || a.ClosingDate).getTime());
    
    const lastClosing = closingsForWarehouse[0] ?? null;
    const lastClosingTime = lastClosing ? new Date(lastClosing.closingDate || lastClosing.ClosingDate).getTime() : 0;
    
    // Look up snapshot opening balance
    let stock = 0;
    if (lastClosing) {
        const balances = lastClosing.balances || lastClosing.Balances || [];
        const found = balances.find((b: any) => (b.itemId || b.ItemId || b.id) === itemId);
        if (found) stock = Number(found.balance) || 0;
    }

    // Only consider transactions that happened strictly AFTER the closing snapshot and on or before asOfDate
    const filterTransactions = (t: any) => {
        const txDate = t?.date || t?.Date;
        if (!txDate) return false;
        const txTime = new Date(txDate).getTime();
        if (lastClosing && txTime <= lastClosingTime) return false;
        return txTime <= maxTime;
    };

    // Helper to safely get item quantity in base units
    const getBaseQty = (i: any): number => {
        // If originalQty is present, qty was already pre-multiplied into base units (e.g. In purchase receipts)
        if (i.originalQty !== undefined && i.originalQty !== null) {
            return Number(i.qty) || 0;
        }
        const rawQty = Number(i.qty ?? i.quantity ?? i.Quantity ?? 0);
        const factor = Number(i.conversionFactor ?? i.factor ?? 1);
        return rawQty * (factor > 0 ? factor : 1);
    };

    // --- INCOMING (+) ---
    
    // 1. Stock In (Purchases, Openings, Receipts)
    (stockInRecords || [])
        .filter((si: any) => (si.warehouseId === warehouseId || si.WarehouseId === warehouseId) && filterTransactions(si))
        .forEach((si: any) => {
            (si.items || []).forEach((i: any) => {
                if ((i.id || i.itemId || i.ItemId) === itemId) stock += getBaseQty(i);
            });
        });

    // 2. Transfers In
    (stockTransferRecords || [])
        .filter((t: any) => (t.toWarehouseId === warehouseId || t.ToWarehouseId === warehouseId || t.toSourceId === warehouseId || t.ToSourceId === warehouseId) && filterTransactions(t))
        .forEach((t: any) => {
            (t.items || []).forEach((i: any) => {
                if ((i.id || i.itemId || i.ItemId) === itemId) stock += getBaseQty(i);
            });
        });

    // 3. Adjustment Surplus
    (stockAdjustmentRecords || [])
        .filter((adj: any) => (adj.warehouseId === warehouseId || adj.WarehouseId === warehouseId) && filterTransactions(adj))
        .forEach((adj: any) => {
            (adj.items || []).forEach((i: any) => {
                if ((i.itemId || i.id || i.ItemId) === itemId && (Number(i.difference) || 0) > 0) {
                    stock += (Number(i.difference) || 0);
                }
            });
        });

    const processedReturnIds = new Set<string>();
    // 4. Sales Returns (Standard)
    (salesReturns || [])
        .filter((sr: any) => (sr.warehouseId === warehouseId || sr.WarehouseId === warehouseId) && filterTransactions(sr))
        .forEach((sr: any) => {
            if (sr.id) processedReturnIds.add(sr.id);
            (sr.items || []).forEach((i: any) => {
                if ((i.id || i.itemId || i.ItemId) === itemId) stock += getBaseQty(i);
            });
        });

    // 5. POS Returns (Avoid double counting if already in salesReturns)
    (posReturns || [])
        .filter((pr: any) => (pr.warehouseId === warehouseId || pr.WarehouseId === warehouseId || pr.source === 'POS') && filterTransactions(pr))
        .forEach((pr: any) => {
            if (pr.id && processedReturnIds.has(pr.id)) return;
            (pr.items || []).forEach((i: any) => {
                if ((i.id || i.itemId || i.ItemId) === itemId) stock += getBaseQty(i);
            });
        });

    // 6. Returns from Sales Reps
    (stockReturnsFromReps || [])
        .filter((rfr: any) => (rfr.warehouseId === warehouseId || rfr.WarehouseId === warehouseId) && filterTransactions(rfr))
        .forEach((rfr: any) => {
            (rfr.items || []).forEach((i: any) => {
                if ((i.id || i.itemId || i.ItemId) === itemId) stock += getBaseQty(i);
            });
        });
    
    // --- OUTGOING (-) ---

    const processedSaleIds = new Set<string>();
    // 7. Sales Invoices (Approved / Completed)
    (salesInvoices || [])
        .filter((s: any) => (s.warehouseId === warehouseId || s.WarehouseId === warehouseId) && (s.status === 'approved' || !s.status || s.status === 'completed') && filterTransactions(s))
        .forEach((s: any) => {
            if (s.id) processedSaleIds.add(s.id);
            (s.items || []).forEach((i: any) => {
                if ((i.id || i.itemId || i.ItemId) === itemId) stock -= getBaseQty(i);
            });
        });

    // 8. POS Sales (Avoid double counting if already in salesInvoices)
    (posSales || [])
        .filter((s: any) => (s.warehouseId === warehouseId || s.WarehouseId === warehouseId) && filterTransactions(s))
        .forEach((s: any) => {
            if (s.id && processedSaleIds.has(s.id)) return;
            (s.items || []).forEach((i: any) => {
                if ((i.id || i.itemId || i.ItemId) === itemId) stock -= getBaseQty(i);
            });
        });

    // 9. Manual Stock Out (Damaged, internal use, etc.)
    (stockOutRecords || [])
        .filter((so: any) => (so.warehouseId === warehouseId || so.WarehouseId === warehouseId || so.sourceId === warehouseId || so.SourceId === warehouseId) && filterTransactions(so))
        .forEach((so: any) => {
            (so.items || []).forEach((i: any) => {
                if ((i.id || i.itemId || i.ItemId) === itemId) stock -= getBaseQty(i);
            });
        });

    // 10. Transfers Out
    (stockTransferRecords || [])
        .filter((t: any) => (t.fromWarehouseId === warehouseId || t.FromWarehouseId === warehouseId || t.fromSourceId === warehouseId || t.FromSourceId === warehouseId) && filterTransactions(t))
        .forEach((t: any) => {
            (t.items || []).forEach((i: any) => {
                if ((i.id || i.itemId || i.ItemId) === itemId) stock -= getBaseQty(i);
            });
        });

    // 11. Adjustment Deficit
    (stockAdjustmentRecords || [])
        .filter((adj: any) => (adj.warehouseId === warehouseId || adj.WarehouseId === warehouseId) && filterTransactions(adj))
        .forEach((adj: any) => {
            (adj.items || []).forEach((i: any) => {
                if ((i.itemId || i.id || i.ItemId) === itemId && (Number(i.difference) || 0) < 0) {
                    stock += (Number(i.difference) || 0); // difference is already negative
                }
            });
        });

    // 12. Purchase Returns
    (purchaseReturns || [])
        .filter((pr: any) => (pr.warehouseId === warehouseId || pr.WarehouseId === warehouseId) && filterTransactions(pr))
        .forEach((pr: any) => {
            (pr.items || []).forEach((i: any) => {
                if ((i.id || i.itemId || i.ItemId) === itemId) stock -= getBaseQty(i);
            });
        });

    // 13. Issues to Sales Reps
    (stockIssuesToReps || [])
        .filter((itr: any) => (itr.warehouseId === warehouseId || itr.WarehouseId === warehouseId) && filterTransactions(itr))
        .forEach((itr: any) => {
            (itr.items || []).forEach((i: any) => {
                if ((i.id || i.itemId || i.ItemId) === itemId) stock -= getBaseQty(i);
            });
        });
    
    return stock;
};
