import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getPrinters } from 'pdf-to-printer';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

interface SystemPrinterItem {
  deviceId: string;
  name: string;
  paperSizes?: string[];
  driverName?: string;
  portName?: string;
}

async function getWindowsPrintersViaPowerShell(): Promise<SystemPrinterItem[]> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Printer | Select-Object Name, DriverName, PortName | ConvertTo-Json -Compress',
      ],
      { timeout: 6000, windowsHide: true }
    );
    const raw = stdout.trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .filter((p: any) => p && p.Name)
      .map((p: any) => ({
        deviceId: String(p.Name),
        name: String(p.Name),
        driverName: p.DriverName ? String(p.DriverName) : undefined,
        portName: p.PortName ? String(p.PortName) : undefined,
      }));
  } catch {
    return [];
  }
}

export async function GET() {
  const seen = new Map<string, SystemPrinterItem>();

  try {
    const printers = await getPrinters();
    if (Array.isArray(printers)) {
      for (const p of printers) {
        const name = String(p?.name || p?.deviceId || '').trim();
        if (name && !seen.has(name)) {
          seen.set(name, {
            deviceId: String(p?.deviceId || name),
            name,
            paperSizes: Array.isArray(p?.paperSizes) ? p.paperSizes : undefined,
          });
        }
      }
    }
  } catch (e) {
    console.warn('[system-printers] pdf-to-printer failed, falling back to PowerShell:', e);
  }

  // Merge with Windows PowerShell Get-Printer (works on Windows 10/11, network printers & bundled Next.js builds)
  if (process.platform === 'win32') {
    const psPrinters = await getWindowsPrintersViaPowerShell();
    for (const p of psPrinters) {
      if (p.name && !seen.has(p.name)) {
        seen.set(p.name, p);
      }
    }
  }

  return NextResponse.json({ printers: Array.from(seen.values()) });
}
