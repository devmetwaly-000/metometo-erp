export interface InvoiceReturnTotals {
  discount: number;
  tax: number;
  total: number;
}

/** Allocate the original invoice discount and VAT proportionally to returned goods. */
export function calculateInvoiceReturnTotals(invoice: any, returnedSubtotal: number): InvoiceReturnTotals {
  const subtotal = Math.max(0, Number(returnedSubtotal) || 0);
  const sourceSubtotal = Math.max(0, Number(invoice?.subtotal) || 0);
  const sourceDiscount = Math.min(sourceSubtotal, Math.max(0, Number(invoice?.discount) || 0));
  const sourceTax = Math.max(0, Number(invoice?.tax) || 0);

  if (!subtotal || !sourceSubtotal) return { discount: 0, tax: 0, total: subtotal };

  const discount = Math.min(subtotal, sourceDiscount * (subtotal / sourceSubtotal));
  const taxableReturnBase = Math.max(0, subtotal - discount);
  const originalTaxableBase = Math.max(0, sourceSubtotal - sourceDiscount);
  const tax = originalTaxableBase > 0 ? sourceTax * (taxableReturnBase / originalTaxableBase) : 0;
  const total = Math.max(0, taxableReturnBase + (invoice?.isTaxIncluded ? 0 : tax));

  return {
    discount: Number(discount.toFixed(4)),
    tax: Number(tax.toFixed(4)),
    total: Number(total.toFixed(4)),
  };
}
