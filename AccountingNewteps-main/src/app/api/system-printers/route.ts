import { NextResponse } from 'next/server';
import { getPrinters } from 'pdf-to-printer';

export async function GET() {
  try {
    const printers = await getPrinters();
    return NextResponse.json({ printers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to list printers' }, { status: 500 });
  }
}
