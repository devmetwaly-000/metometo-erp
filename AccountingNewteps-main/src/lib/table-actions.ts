/**
 * @fileOverview Shared utilities for restaurant table order transfer and merging into one check.
 */

export interface TableActionParams {
  sourceTable: { id: string; number: number; [key: string]: any };
  targetTable: { id: string; number: number; [key: string]: any };
  dbAction: (path: string, action: 'add' | 'update' | 'remove' | 'transaction', payload?: any) => Promise<any>;
  user?: { id?: string; name?: string } | null;
}

/**
 * Merges two cart item arrays, combining identical items (same id, price, and notes).
 */
export function mergeCartItems(targetCart: any[] = [], sourceCart: any[] = []): any[] {
  const merged = targetCart.map((item) => ({ ...item }));

  for (const srcItem of sourceCart) {
    const srcNotes = (srcItem.notes || '').trim();
    const matchIndex = merged.findIndex(
      (tItem) =>
        tItem.id === srcItem.id &&
        Number(tItem.price) === Number(srcItem.price) &&
        ((tItem.notes || '').trim() === srcNotes)
    );

    if (matchIndex > -1) {
      const existing = merged[matchIndex];
      const newQty = Number(existing.qty || 0) + Number(srcItem.qty || 0);
      const newTotal =
        existing.total !== undefined && srcItem.total !== undefined
          ? Number(existing.total) + Number(srcItem.total)
          : newQty * Number(existing.price || 0);
      merged[matchIndex] = {
        ...existing,
        qty: newQty,
        total: newTotal,
      };
    } else {
      merged.push({ ...srcItem });
    }
  }

  return merged;
}

/**
 * Transfers an active held order from one table to an available target table.
 */
export async function transferTableOrder({
  sourceTable,
  targetTable,
  heldInvoice,
  dbAction,
  user,
}: TableActionParams & { heldInvoice: any }) {
  if (!sourceTable || !targetTable || sourceTable.id === targetTable.id) {
    throw new Error('يرجى اختيار طاولة مستهدفة مختلفة.');
  }
  if (!heldInvoice) {
    throw new Error('لا يوجد طلب معلق على الطاولة الحالية لنقله.');
  }

  const targetLabel = `طاولة ${targetTable.number}`;

  await dbAction('heldInvoices', 'update', {
    id: heldInvoice.id,
    data: {
      tableId: targetTable.id,
      tableName: targetLabel,
      orderReference: targetLabel,
    },
  });

  await dbAction('restaurantTables', 'update', {
    id: sourceTable.id,
    data: { status: 'available' },
  });

  await dbAction('restaurantTables', 'update', {
    id: targetTable.id,
    data: { status: 'occupied' },
  });

  try {
    await dbAction('posAuditLogs', 'add', {
      date: new Date().toISOString(),
      cashierId: user?.id,
      cashierName: user?.name,
      action: 'TABLE_TRANSFERRED',
      details: {
        invoiceNumber: heldInvoice.id,
        fromTable: `طاولة ${sourceTable.number}`,
        toTable: targetLabel,
        total: heldInvoice.total,
      },
    });
  } catch {
    // Audit logging should not block the transfer
  }
}

/**
 * Merges two occupied tables' held orders into a single check on the target table.
 */
export async function mergeTableOrders({
  sourceTable,
  targetTable,
  sourceInvoice,
  targetInvoice,
  dbAction,
  user,
}: TableActionParams & { sourceInvoice: any; targetInvoice: any }) {
  if (!sourceTable || !targetTable || sourceTable.id === targetTable.id) {
    throw new Error('يرجى اختيار طاولة مستهدفة مختلفة للدمج.');
  }
  if (!sourceInvoice || !targetInvoice) {
    throw new Error('يجب أن تحتوي كلتا الطاولتين على طلب معلق لإتمام الدمج.');
  }

  const srcCart = Array.isArray(sourceInvoice.cart)
    ? sourceInvoice.cart
    : Array.isArray(sourceInvoice.items)
    ? sourceInvoice.items
    : [];
  const tgtCart = Array.isArray(targetInvoice.cart)
    ? targetInvoice.cart
    : Array.isArray(targetInvoice.items)
    ? targetInvoice.items
    : [];

  const mergedCart = mergeCartItems(tgtCart, srcCart);
  const mergedDiscount = Number(targetInvoice.discount || 0) + Number(sourceInvoice.discount || 0);
  const mergedTips = Number(targetInvoice.tips || 0) + Number(sourceInvoice.tips || 0);
  const subtotal = mergedCart.reduce(
    (sum, item) => sum + Number(item.total ?? Number(item.qty || 0) * Number(item.price || 0)),
    0
  );
  const mergedTotal = Math.max(0, subtotal - mergedDiscount) + mergedTips;
  const mergedItemCount = mergedCart.reduce((sum, item) => sum + Number(item.qty || 1), 0);

  const targetLabel = `طاولة ${targetTable.number}`;

  await dbAction('heldInvoices', 'update', {
    id: targetInvoice.id,
    data: {
      cart: mergedCart,
      discount: mergedDiscount,
      tips: mergedTips,
      total: mergedTotal,
      itemCount: mergedItemCount,
      tableId: targetTable.id,
      tableName: targetLabel,
      orderReference: targetLabel,
    },
  });

  await dbAction('heldInvoices', 'remove', { id: sourceInvoice.id });

  await dbAction('restaurantTables', 'update', {
    id: sourceTable.id,
    data: { status: 'available' },
  });

  await dbAction('restaurantTables', 'update', {
    id: targetTable.id,
    data: { status: 'occupied' },
  });

  try {
    await dbAction('posAuditLogs', 'add', {
      date: new Date().toISOString(),
      cashierId: user?.id,
      cashierName: user?.name,
      action: 'TABLE_MERGED',
      details: {
        invoiceNumber: targetInvoice.id,
        fromTable: `طاولة ${sourceTable.number}`,
        intoTable: targetLabel,
        mergedTotal,
      },
    });
  } catch {
    // Audit logging should not block the merge
  }
}
