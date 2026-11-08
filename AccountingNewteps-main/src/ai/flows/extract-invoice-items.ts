'use server';

/**
 * @fileOverview An AI flow to extract structured invoice items from a text description.
 *
 * - extractInvoiceItems - A function that handles the invoice item extraction process.
 * - ExtractInvoiceItemsInput - The input type for the extractInvoiceItems function.
 * - ExtractInvoiceItemsOutput - The return type for the extractInvoiceItems function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { InvoiceItemSchema } from '@/ai/schemas';

const ExtractInvoiceItemsInputSchema = z.object({
  text: z.string().describe('The text description of the invoice.'),
});
export type ExtractInvoiceItemsInput = z.infer<typeof ExtractInvoiceItemsInputSchema>;


const ExtractInvoiceItemsOutputSchema = z.object({
  items: z.array(InvoiceItemSchema).describe('An array of structured items extracted from the invoice text.'),
});
export type ExtractInvoiceItemsOutput = z.infer<typeof ExtractInvoiceItemsOutputSchema>;


export async function extractInvoiceItems(
  input: ExtractInvoiceItemsInput
): Promise<ExtractInvoiceItemsOutput> {
  return extractInvoiceItemsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractInvoiceItemsPrompt',
  input: { schema: ExtractInvoiceItemsInputSchema },
  output: { schema: ExtractInvoiceItemsOutputSchema },
  prompt: `You are an expert at parsing and extracting structured data from unstructured text.
Your task is to analyze the following invoice description and extract all the line items, including their name, quantity, and unit price.
Do not make up information. If a value is not present, you can infer it or use a default like 1 for quantity if not specified.
The currency is not important, just extract the numerical value for the price.

Invoice Description:
{{{text}}}
`,
});

const extractInvoiceItemsFlow = ai.defineFlow(
  {
    name: 'extractInvoiceItemsFlow',
    inputSchema: ExtractInvoiceItemsInputSchema,
    outputSchema: ExtractInvoiceItemsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
