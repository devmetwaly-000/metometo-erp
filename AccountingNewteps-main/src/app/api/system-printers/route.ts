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
  const results: SystemPrinterItem[] = [];
  const seenNames = new Set<string>();

  const addPrinter = (name: string, driverName?: string, portName?: string) => {
    const clean = name.trim();
    if (!clean || seenNames.has(clean)) return;
    seenNames.add(clean);
    results.push({
      deviceId: clean,
      name: clean,
      driverName: driverName ? String(driverName) : undefined,
      portName: portName ? String(portName) : undefined,
    });
  };

  // Method A: Get-Printer
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Printer | Select-Object Name, DriverName, PortName | ConvertTo-Json -Compress',
      ],
      { timeout: 6000, windowsHide: true }
    );
    const raw = stdout.trim();
    if (raw) {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      list.forEach((p: any) => p?.Name && addPrinter(String(p.Name), p.DriverName, p.PortName));
    }
  } catch {}

  // Method B: Win32_Printer (works on all Windows versions even without PrintManagement module)
  if (results.length === 0) {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance -ClassName Win32_Printer | Select-Object Name, DriverName, PortName | ConvertTo-Json -Compress',
        ],
        { timeout: 6000, windowsHide: true }
      );
      const raw = stdout.trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        list.forEach((p: any) => p?.Name && addPrinter(String(p.Name), p.DriverName, p.PortName));
      }
    } catch {}
  }

  // Method C: wmic fallback
  if (results.length === 0) {
    try {
      const { stdout } = await execFileAsync(
        'cmd.exe',
        ['/c', 'wmic printer get name'],
        { timeout: 6000, windowsHide: true }
      );
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && line.toLowerCase() !== 'name')
        .forEach((name) => addPrinter(name));
    } catch {}
  }

  return results;
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
