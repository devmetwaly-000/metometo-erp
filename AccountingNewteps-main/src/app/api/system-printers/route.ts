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
}

/**
 * 1. استرجاع الطابعات بسرعة فائقة (بضعة أجزاء من الثانية) من سجل ويندوز (Registry)
 * يعمل على كافة إصدارات ويندوز (10, 11, Server, Home, Pro) دون الحاجة لأي صلاحيات إدارية أو وحدات PowerShell
 */
async function getWindowsPrintersViaRegistry(): Promise<SystemPrinterItem[]> {
  const results: SystemPrinterItem[] = [];
  const seen = new Set<string>();

  const add = (name: string, portName?: string) => {
    const clean = (name || '').trim();
    if (!clean || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());

    // استخراج IP من اسم المنفذ إن وُجد (مثل 10.110.16.119_2 أو IP_192.168.1.100)
    let ipHint: string | undefined;
    if (portName) {
      const match = portName.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (match) {
        ipHint = match[1];
      }
    }

    results.push({
      deviceId: clean,
      name: clean,
      portName: portName?.trim() || undefined,
      ipHint,
    });
  };

  // أ. طابعات المستخدم الحالي والأجهزة المتصلة والمحوّلة (Redirected Printers)
  try {
    const { stdout } = await execFileAsync('reg.exe', [
      'query',
      'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices',
    ], { timeout: 3000, windowsHide: true });

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

  // ب. طابعات النظام المثبتة على مستوى الجهاز بالكامل (Local Machine Printers)
  try {
    const { stdout } = await execFileAsync('reg.exe', [
      'query',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers',
    ], { timeout: 3000, windowsHide: true });

    const prefix = 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers\\';
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
 * 2. استرجاع الطابعات عبر PowerShell (.NET & WMI / Get-Printer)
 */
async function getWindowsPrintersViaPowerShell(): Promise<SystemPrinterItem[]> {
  const results: SystemPrinterItem[] = [];
  const seenNames = new Set<string>();

  const addPrinter = (name: string, driverName?: string, portName?: string) => {
    const clean = (name || '').trim();
    if (!clean || seenNames.has(clean.toLowerCase())) return;
    seenNames.add(clean.toLowerCase());
    results.push({
      deviceId: clean,
      name: clean,
      driverName: driverName ? String(driverName) : undefined,
      portName: portName ? String(portName) : undefined,
    });
  };

  // أ. عبر دوت نت السريع (Add-Type System.Drawing)
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
      { timeout: 4000, windowsHide: true }
    );
    stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((name) => addPrinter(name));
  } catch {}

  // ب. عبر Win32_Printer
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
        { timeout: 5000, windowsHide: true }
      );
      const raw = stdout.trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        list.forEach((p: any) => p?.Name && addPrinter(String(p.Name), p.DriverName, p.PortName));
      }
    } catch {}
  }

  // ج. Get-Printer
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
        { timeout: 5000, windowsHide: true }
      );
      const raw = stdout.trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        list.forEach((p: any) => p?.Name && addPrinter(String(p.Name), p.DriverName, p.PortName));
      }
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
      seen.set(key, item);
    } else {
      const existing = seen.get(key)!;
      if (!existing.portName && item.portName) existing.portName = item.portName;
      if (!existing.driverName && item.driverName) existing.driverName = item.driverName;
      if (!existing.ipHint && item.ipHint) existing.ipHint = item.ipHint;
      if (!existing.paperSizes && item.paperSizes) existing.paperSizes = item.paperSizes;
    }
  };

  // 1. في نظام ويندوز: قراءة السجل أولاً (أسرع وأدق طريقة لا تتطلب خدمات خارجية)
  if (process.platform === 'win32') {
    try {
      const regPrinters = await getWindowsPrintersViaRegistry();
      for (const p of regPrinters) {
        registerPrinter(p);
      }
    } catch {}
  }

  // 2. فحص طابعات pdf-to-printer مع مهلة 3 ثوانٍ حتى لا تُعطل الاستجابة إن علقت
  try {
    const timeoutPromise = new Promise<any[]>((_, reject) =>
      setTimeout(() => reject(new Error('pdf-to-printer timeout')), 3000)
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
  } catch (e) {
    // pdf-to-printer قد يفشل في بعض بيئات ويندوز المبنية، لا مشكلة السجل و PowerShell يغطيان ذلك
  }

  // 3. في ويندوز: إضافة أو تكملة عبر PowerShell إن كانت القائمة لا تزال فارغة
  if (process.platform === 'win32' && seen.size === 0) {
    try {
      const psPrinters = await getWindowsPrintersViaPowerShell();
      for (const p of psPrinters) {
        registerPrinter(p);
      }
    } catch {}
  }

  return NextResponse.json({ printers: Array.from(seen.values()) });
}
