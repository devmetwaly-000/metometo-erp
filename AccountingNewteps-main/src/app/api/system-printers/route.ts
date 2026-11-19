import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getPrinters } from 'pdf-to-printer';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

export interface SystemPrinterItem {
  deviceId: string;
  name: string;
  paperSizes?: string[];
  driverName?: string;
  portName?: string;
  ipHint?: string;
  isDefault?: boolean;
}

function extractIpFromPort(portName?: string): string | undefined {
  if (!portName) return undefined;
  // Match standard IPv4 addresses like 10.110.16.119, 10.110.16.119_2, IP_192.168.1.50
  const match = portName.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  return match ? match[1] : undefined;
}

/**
 * 1. استرجاع الطابعات بسرعة فائقة من سجل ويندوز (Registry)
 */
async function getWindowsPrintersViaRegistry(): Promise<SystemPrinterItem[]> {
  const results: SystemPrinterItem[] = [];
  const seen = new Set<string>();

  const add = (name: string, portName?: string) => {
    const clean = (name || '').trim();
    if (!clean || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());

    results.push({
      deviceId: clean,
      name: clean,
      portName: portName?.trim() || undefined,
      ipHint: extractIpFromPort(portName),
    });
  };

  // أ. طابعات المستخدم الحالي والأجهزة المتصلة
  try {
    const { stdout } = await execFileAsync('reg.exe', [
      'query',
      'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices',
    ], { timeout: 2500, windowsHide: true });

    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/^\s*(.+?)\s+REG_SZ\s+(?:winspool,)?(.*)$/i);
      if (match) {
        const name = match[1].trim();
        const port = match[2].trim();
        if (name && !name.startsWith('HKEY_')) {
          add(name, port);
        }
      }
    }
  } catch {}

  // ب. طابعات النظام المثبتة محلياً (Control\\Print\\Printers)
  try {
    const { stdout } = await execFileAsync('reg.exe', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers',
    ], { timeout: 2500, windowsHide: true });

    const prefix = 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers\\';
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith(prefix)) {
        const name = trimmed.slice(prefix.length).trim();
        if (name) add(name);
      }
    }
  } catch {}

  // ج. طابعات برامج التشغيل ومنافذ الطباعة (SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Print\\Printers)
  try {
    const { stdout } = await execFileAsync('reg.exe', [
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Print\\Printers',
    ], { timeout: 2500, windowsHide: true });

    const prefix = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Print\\Printers\\';
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith(prefix)) {
        const name = trimmed.slice(prefix.length).trim();
        if (name) add(name);
      }
    }
  } catch {}

  return results;
}

/**
 * 2. استرجاع الطابعات المتقدم عبر PowerShell (CIM & WMI & .NET & Get-Printer)
 */
async function getWindowsPrintersViaPowerShell(): Promise<SystemPrinterItem[]> {
  const results: SystemPrinterItem[] = [];
  const seenNames = new Set<string>();

  const addPrinter = (name: string, driverName?: string, portName?: string, isDefault?: boolean) => {
    const clean = (name || '').trim();
    if (!clean || seenNames.has(clean.toLowerCase())) return;
    seenNames.add(clean.toLowerCase());
    results.push({
      deviceId: clean,
      name: clean,
      driverName: driverName ? String(driverName).trim() : undefined,
      portName: portName ? String(portName).trim() : undefined,
      ipHint: extractIpFromPort(portName),
      isDefault: Boolean(isDefault)
    });
  };

  // أ. عبر Get-CimInstance Win32_Printer (أشمل وأدق أمر في ويندوز)
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance -ClassName Win32_Printer | Select-Object Name, DriverName, PortName, Default | ConvertTo-Json -Compress',
      ],
      { timeout: 4000, windowsHide: true }
    );
    const raw = stdout.trim();
    if (raw) {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      list.forEach((p: any) => {
        if (p?.Name) addPrinter(String(p.Name), p.DriverName, p.PortName, p.Default);
      });
    }
  } catch {}

  // ب. Get-Printer (إذا كان متوفراً)
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
          '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Printer | Select-Object Name, DriverName, PortName | ConvertTo-Json -Compress',
        ],
        { timeout: 4000, windowsHide: true }
      );
      const raw = stdout.trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        list.forEach((p: any) => {
          if (p?.Name) addPrinter(String(p.Name), p.DriverName, p.PortName);
        });
      }
    } catch {}
  }

  // ج. Add-Type System.Drawing السريع
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
          '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; [System.Drawing.Printing.PrinterSettings]::InstalledPrinters',
        ],
        { timeout: 3000, windowsHide: true }
      );
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((name) => addPrinter(name));
    } catch {}
  }

  return results;
}

export async function GET() {
  const seen = new Map<string, SystemPrinterItem>();

  const registerPrinter = (item: SystemPrinterItem) => {
    const key = (item.name || item.deviceId || '').trim().toLowerCase();
    if (!key) return;
    if (!seen.has(key)) {
      seen.set(key, { ...item });
    } else {
      const existing = seen.get(key)!;
      if (!existing.portName && item.portName) existing.portName = item.portName;
      if (!existing.driverName && item.driverName) existing.driverName = item.driverName;
      if (!existing.ipHint && item.ipHint) existing.ipHint = item.ipHint;
      if (!existing.paperSizes && item.paperSizes) existing.paperSizes = item.paperSizes;
      if (item.isDefault) existing.isDefault = true;
    }
  };

  if (process.platform === 'win32') {
    // تشغيل كاشفين متوازيين لضمان جلب كل الطابعات: السجل السريع + CIM/WMI
    const [regPrintersResult, psPrintersResult] = await Promise.allSettled([
      getWindowsPrintersViaRegistry(),
      getWindowsPrintersViaPowerShell(),
    ]);

    if (regPrintersResult.status === 'fulfilled') {
      for (const p of regPrintersResult.value) {
        registerPrinter(p);
      }
    }

    if (psPrintersResult.status === 'fulfilled') {
      for (const p of psPrintersResult.value) {
        registerPrinter(p);
      }
    }
  }

  // فحص طابعات pdf-to-printer مع مهلة 2.5 ثانية
  try {
    const timeoutPromise = new Promise<any[]>((_, reject) =>
      setTimeout(() => reject(new Error('pdf-to-printer timeout')), 2500)
    );
    const printers = await Promise.race([getPrinters(), timeoutPromise]);
    if (Array.isArray(printers)) {
      for (const p of printers) {
        const name = String(p?.name || p?.deviceId || '').trim();
        if (name) {
          registerPrinter({
            deviceId: String(p?.deviceId || name),
            name,
            paperSizes: Array.isArray(p?.paperSizes) ? p.paperSizes : undefined,
          });
        }
      }
    }
  } catch {}

  const printerList = Array.from(seen.values());

  // استخراج قائمة الطابعات ذات عناوين IP المكتشفة تلقائياً لمساعدة المستخدم
  const networkPrinters = printerList.filter((p) => Boolean(p.ipHint));

  return NextResponse.json({
    printers: printerList,
    networkPrinters,
    count: printerList.length,
  });
}
