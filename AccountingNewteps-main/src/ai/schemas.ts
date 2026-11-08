/**
 * @fileOverview Shared Zod schemas for AI flows.
 */

import { z } from 'genkit';

export const InvoiceItemSchema = z.object({
  itemName: z.string().describe("The name of the item."),
  quantity: z.number().describe("The quantity of the item."),
  price: z.number().describe("The unit price of the item."),
});
export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
