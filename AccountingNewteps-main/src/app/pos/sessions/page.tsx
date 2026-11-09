
"use client";

import React, { useMemo, useState, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { useData } from "@/contexts/data-provider";
import { 
  Loader2, PlayCircle, PowerOff, Coins, TrendingDown, TrendingUp, HandCoins, 
  UserCheck, UserPlus, Warehouse, Laptop, Check, History, Undo2, AlertTriangle, 
  Building2, Printer, FileText, Calendar, Clock, CreditCard, Banknote, Wallet, ReceiptText, Users, CheckCircle2, Sparkles, ArrowRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddEntityDialog } from '@/components/add-entity-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getGeneralCashAccounts } from '@/lib/accounting-utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PosTerminal {
    id: string;
    code: string;
    name: string;
    warehouseId: string;
}
interface PosSession {
    id: string;
    startTime: string;
    endTime?: string;
    isClosed: boolean;
    openedBy: string;
    openedByName: string;
    closedBy?: string;
    closedByName?: string;
    cashierSessions: {
        [cashierId: string]: CashierSession;
    };
    closingStatement?: WorkDayClosingStatement;
}
interface CashierSession {
    cashierId: string;
    cashierName: string;
    startTime: string;
    openingBalance: number;
    isClosed: boolean;
    endTime?: string;
    expectedCash?: number;
    actualCash?: number;
    difference?: number;
    remittedToAccountId?: string;
    custodyFromAccountId?: string;
    sessionWarehouseId?: string; 
    posTerminalId?: string; 
    invoiceCounter?: number;
    totalSalesByMethod?: Record<string, number>;
    totalReturnsByMethod?: Record<string, number>;
    totalTips?: number;
}

export interface CashierStatementItem {
    cashierId: string;
    cashierName: string;
    terminalName: string;
    warehouseName: string;
    startTime: string;
    endTime?: string;
    openingBalance: number;
    salesByMethod: Record<string, number>;
    totalSales: number;
    returnsValue: number;
    tips: number;
    expectedCash: number;
    actualCash: number;
    difference: number;
    remittedToAccountName?: string;
}

export interface WorkDayClosingStatement {
    sessionId: string;
    workDayDate: string;
    startTime: string;
    endTime: string;
    closedByName: string;
    openedByName: string;
    branchName?: string;
    nextWorkDay?: string;
    cashiers: CashierStatementItem[];
    paymentMethodsList: string[];
    totals: {
        totalOpeningBalance: number;
        salesByMethod: Record<string, number>;
        totalSales: number;
        totalReturns: number;
        totalTips: number;
        totalExpectedCash: number;
        totalActualCash: number;
        totalDifference: number;
        totalNetRevenue: number;
    };
}


const AssignCustodyDialog = ({ users, onConfirm, onClose, cashAccounts, accountBalances, warehouses, terminals, activeSessions }: { users: any[], onConfirm: (data: { cashierId: string, openingBalance: number, fromAccountId?: string, sessionWarehouseId?: string, posTerminalId: string }) => void, onClose: () => void, cashAccounts: any[], accountBalances: Map<string, number>, warehouses: any[], terminals: PosTerminal[], activeSessions: any[] }) => {
    const [cashierId, setCashierId] = useState('');
    const [openingBalance, setOpeningBalance] = useState(0);
    const [fromAccountId, setFromAccountId] = useState('');
    const [posTerminalId, setPosTerminalId] = useState('');
    
    const cashierOptions = useMemo(() => users.map(u => ({ value: u.id, label: u.name })), [users]);
    
    const selectedTerminal = useMemo(() => terminals.find(t => t.id === posTerminalId), [posTerminalId, terminals]);
    const sessionWarehouseId = useMemo(() => selectedTerminal?.warehouseId, [selectedTerminal]);
    const sessionWarehouseName = useMemo(() => {
        if (!sessionWarehouseId) return "اختر نقطة بيع أولاً";
        return warehouses.find(w => w.id === sessionWarehouseId)?.name || "مخزن غير معروف";
    }, [sessionWarehouseId, warehouses]);


    const availableTerminals = useMemo(() => {
        const activeTerminalIds = new Set(activeSessions.map(s => s.posTerminalId));
        return terminals.filter(t => !activeTerminalIds.has(t.id));
    }, [terminals, activeSessions]);
    
    const terminalOptions = useMemo(() => {
        return availableTerminals.map(t => {
            const warehouseName = warehouses.find(w => w.id === t.warehouseId)?.name || 'غير محدد';
            return { value: t.id, label: `${t.name} (${warehouseName})` };
        });
    }, [availableTerminals, warehouses]);


    const handleSubmit = () => {
        if (openingBalance > 0 && fromAccountId) {
            const accountBalance = accountBalances.get(fromAccountId) || 0;
            if (accountBalance < openingBalance) {
                alert(`رصيد الخزينة المحدد (${accountBalance.toLocaleString()}) غير كافٍ لصرف عهدة بقيمة ${openingBalance.toLocaleString()}.`);
                return;
            }
        }
        
        onConfirm({ cashierId, openingBalance, fromAccountId: openingBalance > 0 ? fromAccountId : undefined, sessionWarehouseId: sessionWarehouseId, posTerminalId });
        onClose();
    };
    
    const isButtonDisabled = !cashierId || !posTerminalId || !sessionWarehouseId || openingBalance < 0 || (openingBalance > 0 && !fromAccountId);

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="cashier">الكاشير</Label>
                 <Combobox
                    options={cashierOptions}
                    value={cashierId}
                    onValueChange={setCashierId}
                    placeholder="اختر الكاشير..."
                    emptyMessage="لم يتم العثور على كاشير."
                />
            </div>
            
             <div className="space-y-2">
                <Label htmlFor="terminal">نقطة البيع (الكاشير)</Label>
                 <Combobox
                    options={terminalOptions}
                    value={posTerminalId}
                    onValueChange={setPosTerminalId}
                    placeholder="اختر نقطة البيع..."
                    emptyMessage="لا توجد نقاط بيع متاحة."
                />
            </div>
            
            <div className="space-y-2">
                <Label htmlFor="session-warehouse">مخزن الصرف لهذه الوردية</Label>
                <Input id="session-warehouse" value={sessionWarehouseName} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
                <Label htmlFor="opening-balance">عهدة بداية الوردية</Label>
                <Input id="opening-balance" type="number" value={openingBalance} onChange={e => setOpeningBalance(Number(e.target.value))} placeholder="0.00" />
            </div>
            {openingBalance > 0 && (
                <div className="space-y-2">
                    <Label htmlFor="from-account">صرف من خزينة</Label>
                    <Select value={fromAccountId} onValueChange={setFromAccountId}>
                        <SelectTrigger id="from-account"><SelectValue placeholder="اختر الخزينة" /></SelectTrigger>
                        <SelectContent>
                            {getGeneralCashAccounts(cashAccounts).map((acc:any) => <SelectItem key={acc.id} value={acc.id}>{`${acc.name} (الرصيد: ${(accountBalances.get(acc.id) || 0).toLocaleString()})`}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div className="flex justify-end">
                <Button onClick={handleSubmit} disabled={isButtonDisabled}>تسليم العهدة وبدء الوردية</Button>
            </div>
        </div>
    )
}

const CloseCashierSessionDialog = ({ cashierSession, onConfirm, onClose }: { cashierSession: any, onConfirm: (data: { actualCash: number, toAccountId: string, notes: string }) => void, onClose: () => void }) => {
    const { cashAccounts, paymentMethods } = useData();
    const [actualCash, setActualCash] = useState(cashierSession.expectedCash);
    const [toAccountId, setToAccountId] = useState('');
    const [notes, setNotes] = useState('');
    const mainCashAccounts = useMemo(() => getGeneralCashAccounts(cashAccounts), [cashAccounts]);

    const difference = actualCash - cashierSession.expectedCash;

    const handleConfirm = () => {
        if (!toAccountId) {
            alert("يرجى تحديد حساب لاستلام النقدية.");
            return;
        };
        onConfirm({ actualCash, toAccountId, notes });
        onClose();
    }
    
    return (
        <div className="space-y-4">
            <p className='text-lg'>إقفال وردية الكاشير: <span className="font-bold">{cashierSession.cashierName}</span></p>
            <div className="grid grid-cols-2 gap-4 text-center">
                 <div className="p-4 bg-muted rounded-lg"><p className="text-sm text-muted-foreground">النقدية المتوقعة (مبيعات + إكراميات)</p><p className="text-2xl font-bold">{cashierSession.expectedCash.toFixed(2)}</p></div>
                 <div className="p-4 bg-muted rounded-lg"><p className="text-sm text-muted-foreground">النقدية الفعلية (الجرد)</p><Input className="text-2xl font-bold h-12 text-center" value={actualCash} onChange={e => setActualCash(Number(e.target.value))} /></div>
            </div>
             <div className="border p-2 rounded-md">
                <h4 className="text-sm font-semibold mb-2">ملخص طرق الدفع والإكراميات</h4>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>البيان</TableHead>
                            <TableHead className="text-left">المبلغ</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Object.entries(cashierSession.totalSalesByMethod).map(([method, amount]) => (
                            (amount as number) > 0 &&
                            <TableRow key={method}>
                                <TableCell>{method}</TableCell>
                                <TableCell className="text-left font-semibold">{Number(amount).toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                        {cashierSession.totalTips > 0 && (
                            <TableRow className="bg-primary/5">
                                <TableCell className="font-bold text-primary">إجمالي الإكراميات (Tips)</TableCell>
                                <TableCell className="text-left font-bold text-primary">{Number(cashierSession.totalTips).toLocaleString()}</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className={`p-4 rounded-lg flex items-center justify-center gap-2 text-2xl font-bold ${difference === 0 ? 'bg-muted' : difference > 0 ? 'bg-green-100 dark:bg-green-900 text-green-600' : 'bg-red-100 dark:bg-red-900 text-destructive'}`}>
                {difference === 0 ? <Coins/> : difference > 0 ? <TrendingUp/> : <TrendingDown/>}
                <span>{difference === 0 ? 'لا يوجد فرق' : (difference > 0 ? `فائض: ${difference.toFixed(2)}` : `عجز: ${Math.abs(difference).toFixed(2)}`)}</span>
            </div>
            <div className="space-y-2">
                <Label htmlFor="to-account">توريد إلى خزينة/بنك</Label>
                <Select value={toAccountId} onValueChange={setToAccountId}>
                    <SelectTrigger id="to-account"><SelectValue placeholder="اختر حساب الاستلام" /></SelectTrigger>
                    <SelectContent>
                        {mainCashAccounts.map((acc:any) => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex justify-end">
                <Button onClick={handleConfirm} disabled={!toAccountId}>تأكيد الإقفال والتوريد</Button>
            </div>
        </div>
    );
}

const printClosingStatement = (statement: WorkDayClosingStatement, companyName: string) => {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const methodsHeaders = statement.paymentMethodsList.map(m => 
        `<th style="padding: 6px 8px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 11px;">${m}</th>`
    ).join('');
    
    const cashierRows = statement.cashiers.map((c, i) => {
        const methodCells = statement.paymentMethodsList.map(m => `
            <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">
                ${(c.salesByMethod[m] || 0).toLocaleString()}
            </td>
        `).join('');

        const diffStyle = c.difference === 0 ? 'color: #334155;' : c.difference > 0 ? 'color: #16a34a; font-weight: bold;' : 'color: #dc2626; font-weight: bold;';
        const diffText = c.difference === 0 ? '0' : c.difference > 0 ? `+${c.difference.toLocaleString()}` : `${c.difference.toLocaleString()}`;

        return `
            <tr>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">${i + 1}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold; font-size: 11px;">${c.cashierName}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 11px;">${c.terminalName}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">${c.openingBalance.toLocaleString()}</td>
                ${methodCells}
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; background: #f1f5f9; font-size: 11px;">${c.totalSales.toLocaleString()}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; color: #dc2626; font-size: 11px;">${c.returnsValue.toLocaleString()}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">${c.expectedCash.toLocaleString()}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; font-size: 11px;">${c.actualCash.toLocaleString()}</td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px; ${diffStyle}">${diffText}</td>
            </tr>
        `;
    }).join('');

    const totalsMethodCells = statement.paymentMethodsList.map(m => `
        <th style="padding: 8px; border: 1px solid #94a3b8; text-align: center; font-size: 12px; background: #e2e8f0; font-weight: bold;">
            ${(statement.totals.salesByMethod[m] || 0).toLocaleString()}
        </th>
    `).join('');

    const totalsRow = `
        <tr style="background: #e2e8f0; font-weight: bold;">
            <th colspan="3" style="padding: 8px; border: 1px solid #94a3b8; text-align: center; font-size: 12px;">الإجمالي المجمع لكافة الكاشيرات</th>
            <th style="padding: 8px; border: 1px solid #94a3b8; text-align: center; font-size: 12px;">${statement.totals.totalOpeningBalance.toLocaleString()}</th>
            ${totalsMethodCells}
            <th style="padding: 8px; border: 1px solid #94a3b8; text-align: center; font-size: 12px; background: #cbd5e1;">${statement.totals.totalSales.toLocaleString()}</th>
            <th style="padding: 8px; border: 1px solid #94a3b8; text-align: center; font-size: 12px; color: #dc2626;">${statement.totals.totalReturns.toLocaleString()}</th>
            <th style="padding: 8px; border: 1px solid #94a3b8; text-align: center; font-size: 12px;">${statement.totals.totalExpectedCash.toLocaleString()}</th>
            <th style="padding: 8px; border: 1px solid #94a3b8; text-align: center; font-size: 12px;">${statement.totals.totalActualCash.toLocaleString()}</th>
            <th style="padding: 8px; border: 1px solid #94a3b8; text-align: center; font-size: 12px;">${statement.totals.totalDifference.toLocaleString()}</th>
        </tr>
    `;

    const summaryCards = statement.paymentMethodsList.map(m => {
        const val = statement.totals.salesByMethod[m] || 0;
        const pct = statement.totals.totalSales > 0 ? ((val / statement.totals.totalSales) * 100).toFixed(1) : '0';
        return `
            <div style="flex: 1; min-width: 120px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #f8fafc; text-align: center;">
                <div style="font-size: 11px; color: #64748b; font-weight: bold; margin-bottom: 2px;">مبيعات ${m}</div>
                <div style="font-size: 15px; font-weight: bold; color: #0f172a;">${val.toLocaleString()} <span style="font-size: 10px;">ج.م</span></div>
                <div style="font-size: 10px; color: #64748b; margin-top: 2px;">نسبة ${pct}% من المبيعات</div>
            </div>
        `;
    }).join('');

    const htmlContent = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="utf-8">
            <title>بيان إقفال يوم العمل وتجميع طرق الدفع - ${statement.workDayDate}</title>
            <style>
                @page { size: A4 landscape; margin: 10mm; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 10px; color: #0f172a; direction: rtl; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                .meta-box { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
                .sig-box { display: flex; justify-content: space-between; margin-top: 35px; padding-top: 15px; }
                .sig-item { text-align: center; width: 28%; border-top: 1px dashed #64748b; padding-top: 6px; font-size: 12px; }
                @media print {
                    .no-print { display: none !important; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <div class="meta-box">
                <div>
                    <h2 style="margin: 0 0 4px 0; font-size: 18px;">${companyName || 'منظومة نقاط البيع والحسابات'}</h2>
                    <h3 style="margin: 0; font-size: 14px; color: #0284c7;">بيان إقفال يوم العمل وتجميع مبالغ طرق الدفع للمبيعات</h3>
                    <div style="font-size: 11px; color: #64748b; margin-top: 3px;">الفرع: ${statement.branchName || 'الفرع الرئيسي'}</div>
                </div>
                <div style="text-align: left; font-size: 11px; line-height: 1.6;">
                    <div><strong>تاريخ يوم العمل:</strong> ${statement.workDayDate}</div>
                    <div><strong>توقيت الإقفال:</strong> ${new Date(statement.endTime).toLocaleString('ar-EG')}</div>
                    <div><strong>أقفل بواسطة:</strong> ${statement.closedByName}</div>
                    ${statement.nextWorkDay ? `<div style="color: #15803d; font-weight: bold;">تم فتح اليوم التالي: ${statement.nextWorkDay}</div>` : ''}
                </div>
            </div>

            <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 120px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #f0fdf4; text-align: center;">
                    <div style="font-size: 11px; color: #166534; font-weight: bold; margin-bottom: 2px;">إجمالي المبيعات العامة</div>
                    <div style="font-size: 16px; font-weight: bold; color: #15803d;">${statement.totals.totalSales.toLocaleString()} <span style="font-size: 10px;">ج.م</span></div>
                    <div style="font-size: 10px; color: #166534; margin-top: 2px;">صافي الإيراد: ${statement.totals.totalNetRevenue.toLocaleString()} ج.م</div>
                </div>
                ${summaryCards}
                <div style="flex: 1; min-width: 120px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #eff6ff; text-align: center;">
                    <div style="font-size: 11px; color: #1e40af; font-weight: bold; margin-bottom: 2px;">النقدية الموردة بالخزينة</div>
                    <div style="font-size: 16px; font-weight: bold; color: #1d4ed8;">${statement.totals.totalActualCash.toLocaleString()} <span style="font-size: 10px;">ج.م</span></div>
                    <div style="font-size: 10px; color: #1e40af; margin-top: 2px;">عدد الكاشيرات: ${statement.cashiers.length}</div>
                </div>
            </div>

            <h4 style="margin: 10px 0 4px 0; font-size: 12px;">بيان تفصيلي لكل كاشير منفصل وفقاً لطرق الدفع المسددة:</h4>
            <table>
                <thead>
                    <tr style="background: #f1f5f9;">
                        <th style="padding: 6px 8px; border: 1px solid #cbd5e1; width: 25px; font-size: 11px;">#</th>
                        <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 11px;">اسم الكاشير</th>
                        <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 11px;">نقطة البيع</th>
                        <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 11px;">عهدة البداية</th>
                        ${methodsHeaders}
                        <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 11px; background: #e2e8f0;">إجمالي المبيعات</th>
                        <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 11px;">المرتجعات</th>
                        <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 11px;">المتوقع</th>
                        <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 11px;">المورد</th>
                        <th style="padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 11px;">الفارق</th>
                    </tr>
                </thead>
                <tbody>
                    ${cashierRows}
                    ${totalsRow}
                </tbody>
            </table>

            <div class="sig-box">
                <div class="sig-item">
                    <strong>توقيع مسؤولي الكاشيرات</strong>
                    <div style="margin-top: 20px; color: #94a3b8;">..........................................</div>
                </div>
                <div class="sig-item">
                    <strong>توقيع مشرف الفرع والوردية</strong>
                    <div style="margin-top: 20px; color: #94a3b8;">..........................................</div>
                </div>
                <div class="sig-item">
                    <strong>اعتماد الإدارة المالية والحسابات</strong>
                    <div style="margin-top: 20px; color: #94a3b8;">..........................................</div>
                </div>
            </div>

            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
};

const WorkDayClosingStatementDialog = ({
    statement,
    open,
    onOpenChange,
    companyName
}: {
    statement: WorkDayClosingStatement | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    companyName: string;
}) => {
    if (!statement) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
                <DialogHeader className="border-b pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-bold text-foreground">
                                    بيان إقفال يوم العمل وتجميع طرق الدفع للمبيعات
                                </DialogTitle>
                                <DialogDescription className="text-xs">
                                    تاريخ يوم العمل: {statement.workDayDate} | أقفل في: {new Date(statement.endTime).toLocaleTimeString('ar-EG')} بواسطة {statement.closedByName}
                                </DialogDescription>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Next Day Auto-Open Notice Banner */}
                    {statement.nextWorkDay && (
                        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 text-xs">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span>
                                <strong>تم إقفال يوم العمل بنجاح!</strong> تم فتح يوم العمل التالي تلقائياً بتاريخ <strong>({statement.nextWorkDay})</strong> لكافة الكاشيرات لبدء الورديات الجديدة مباشرة دون انقطاع.
                            </span>
                        </div>
                    )}

                    {/* Aggregate Summary Cards per Payment Method */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="p-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20 text-center">
                            <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">إجمالي المبيعات العامة</div>
                            <div className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-1">
                                {statement.totals.totalSales.toLocaleString()} <span className="text-[10px] font-normal">ج.م</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                صافي: {statement.totals.totalNetRevenue.toLocaleString()} ج.م
                            </div>
                        </div>

                        {statement.paymentMethodsList.map(method => {
                            const val = statement.totals.salesByMethod[method] || 0;
                            const pct = statement.totals.totalSales > 0 ? ((val / statement.totals.totalSales) * 100).toFixed(1) : '0';
                            return (
                                <div key={method} className="p-3 rounded-lg border bg-muted/40 text-center">
                                    <div className="text-[11px] font-semibold text-muted-foreground">{method}</div>
                                    <div className="text-lg font-black text-foreground mt-1">
                                        {val.toLocaleString()} <span className="text-[10px] font-normal">ج.م</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                        نسبة {pct}%
                                    </div>
                                </div>
                            );
                        })}

                        <div className="p-3 rounded-lg border bg-sky-500/5 border-sky-500/20 text-center">
                            <div className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">النقدية الموردة بالخزينة</div>
                            <div className="text-lg font-black text-sky-700 dark:text-sky-300 mt-1">
                                {statement.totals.totalActualCash.toLocaleString()} <span className="text-[10px] font-normal">ج.م</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                عدد الكاشيرات: {statement.cashiers.length}
                            </div>
                        </div>
                    </div>

                    {/* Detailed Per-Cashier Matrix Table */}
                    <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted/60 px-3 py-2 border-b text-xs font-bold flex items-center justify-between">
                            <span>تفصيل المبالغ المسددة لكل كاشير منفصل وفقاً لطرق الدفع:</span>
                            <span className="text-muted-foreground font-normal">
                                {statement.cashiers.length} كاشير شاركوا في هذا اليوم
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <Table className="text-xs">
                                <TableHeader className="bg-muted/40">
                                    <TableRow>
                                        <TableHead className="w-8 text-center">#</TableHead>
                                        <TableHead>الكاشير</TableHead>
                                        <TableHead>نقطة البيع</TableHead>
                                        <TableHead className="text-center">عهدة البداية</TableHead>
                                        {statement.paymentMethodsList.map(method => (
                                            <TableHead key={method} className="text-center">{method}</TableHead>
                                        ))}
                                        <TableHead className="text-center font-bold bg-muted/80">إجمالي المبيعات</TableHead>
                                        <TableHead className="text-center">المرتجعات</TableHead>
                                        <TableHead className="text-center">المتوقع</TableHead>
                                        <TableHead className="text-center">المورد</TableHead>
                                        <TableHead className="text-center">الفارق</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {statement.cashiers.map((c, index) => (
                                        <TableRow key={c.cashierId || index} className="hover:bg-muted/20">
                                            <TableCell className="text-center text-muted-foreground font-mono">{index + 1}</TableCell>
                                            <TableCell className="font-bold text-foreground">{c.cashierName}</TableCell>
                                            <TableCell className="text-muted-foreground">{c.terminalName}</TableCell>
                                            <TableCell className="text-center">{c.openingBalance.toLocaleString()}</TableCell>
                                            {statement.paymentMethodsList.map(method => (
                                                <TableCell key={method} className="text-center font-medium">
                                                    {(c.salesByMethod[method] || 0).toLocaleString()}
                                                </TableCell>
                                            ))}
                                            <TableCell className="text-center font-bold bg-muted/30">
                                                {c.totalSales.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-center text-destructive">
                                                {c.returnsValue > 0 ? c.returnsValue.toLocaleString() : '0'}
                                            </TableCell>
                                            <TableCell className="text-center">{c.expectedCash.toLocaleString()}</TableCell>
                                            <TableCell className="text-center font-bold text-foreground">{c.actualCash.toLocaleString()}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge 
                                                    variant={c.difference === 0 ? 'secondary' : c.difference > 0 ? 'default' : 'destructive'}
                                                    className="font-mono text-[11px]"
                                                >
                                                    {c.difference === 0 ? '0' : c.difference > 0 ? `+${c.difference.toLocaleString()}` : c.difference.toLocaleString()}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                    {/* Aggregated Totals Row */}
                                    <TableRow className="bg-muted/80 font-bold border-t-2 border-foreground/20 text-xs">
                                        <TableCell colSpan={3} className="text-center font-black">
                                            الإجمالي المجمع لكافة الكاشيرات
                                        </TableCell>
                                        <TableCell className="text-center font-black">
                                            {statement.totals.totalOpeningBalance.toLocaleString()}
                                        </TableCell>
                                        {statement.paymentMethodsList.map(method => (
                                            <TableCell key={method} className="text-center font-black text-foreground">
                                                {(statement.totals.salesByMethod[method] || 0).toLocaleString()}
                                            </TableCell>
                                        ))}
                                        <TableCell className="text-center font-black bg-muted text-foreground">
                                            {statement.totals.totalSales.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-center font-black text-destructive">
                                            {statement.totals.totalReturns.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-center font-black">
                                            {statement.totals.totalExpectedCash.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-center font-black text-foreground">
                                            {statement.totals.totalActualCash.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-center font-black">
                                            <Badge 
                                                variant={statement.totals.totalDifference === 0 ? 'secondary' : statement.totals.totalDifference > 0 ? 'default' : 'destructive'}
                                                className="font-mono"
                                            >
                                                {statement.totals.totalDifference === 0 ? '0' : statement.totals.totalDifference > 0 ? `+${statement.totals.totalDifference.toLocaleString()}` : statement.totals.totalDifference.toLocaleString()}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex flex-row items-center justify-between gap-2 border-t pt-3 sm:justify-between">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => printClosingStatement(statement, companyName)}
                        className="gap-1.5 font-bold border-primary/40 text-primary hover:bg-primary/10"
                    >
                        <Printer className="h-4 w-4" />
                        طباعة بيان الإقفال (A4 / تقرير رسمي)
                    </Button>
                    <Button 
                        size="sm" 
                        onClick={() => onOpenChange(false)}
                    >
                        إغلاق
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default function PosSessionsPage() {
    const { 
        cashAccounts, 
        dbAction, 
        getNextId, 
        loading,
        customerPayments, salesInvoices, exceptionalIncomes, treasuryTransactions,
        expenses, supplierPayments, employeeAdvances, posSales, users, posTerminals,
        posReturns, warehouses, paymentMethods, gratuityLogs,
        posSessions: allPosSessions,
        unreconciledDeliveryCount,
        settings,
        isCentral,
    } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    
    // State for Work Day Closing Statement (بيان إقفال يوم العمل وتجميع طرق الدفع)
    const [statementModalData, setStatementModalData] = useState<WorkDayClosingStatement | null>(null);
    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    
    const { openWorkDay, closedWorkDays, cashierSessionsData, allSessionsClosed, canCloseWorkDay } = useMemo(() => {
        if (!allPosSessions) {
            return { openWorkDay: null, closedWorkDays: [], cashierSessionsData: [], allSessionsClosed: true, canCloseWorkDay: true };
        }
        const openDay = allPosSessions.find((s: any) => !s.isClosed);
        const closedDays = allPosSessions.filter((s: any) => s.isClosed).sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        
        let sessionsData: any[] = [];
        if (openDay && openDay.cashierSessions) {
            const activeCashierSessions = Object.values(openDay.cashierSessions).filter((cs: any) => !cs.isClosed);
            sessionsData = activeCashierSessions.map((cs: any) => {
                const sessionStart = new Date(cs.startTime);
                const sessionSales = posSales.filter((sale: any) => sale.cashierId === cs.cashierId && new Date(sale.date) >= sessionStart);
                const sessionReturns = posReturns.filter((ret: any) => ret.cashierId === cs.cashierId && new Date(ret.date) >= sessionStart);
                const sessionTips = gratuityLogs.filter((log: any) => log.cashierId === cs.cashierId && new Date(log.date) >= sessionStart);

                const totalSalesByMethod: Record<string, number> = {};
                sessionSales.forEach((sale: any) => {
                    if (sale.payments && sale.payments.length > 0) {
                        sale.payments.forEach((p: any) => {
                            totalSalesByMethod[p.method] = (totalSalesByMethod[p.method] || 0) + p.amount;
                        });
                    } else if (sale.paidAmount > 0) {
                        const cashMethodName = paymentMethods.find((pm: any) => pm.name.toLowerCase().includes('cash') || pm.name.toLowerCase().includes('نقد'))?.name || 'نقدي';
                        totalSalesByMethod[cashMethodName] = (totalSalesByMethod[cashMethodName] || 0) + sale.paidAmount;
                    }
                });

                const cashMethodName = paymentMethods.find((pm: any) => pm.name.toLowerCase().includes('cash') || pm.name.toLowerCase().includes('نقد'))?.name || 'نقدي';
                const totalCashSales = totalSalesByMethod[cashMethodName] || 0;
                const totalReturnsValue = sessionReturns.reduce((sum: number, ret: any) => sum + ret.total, 0);
                const totalTips = sessionTips.reduce((sum: number, log: any) => sum + log.amount, 0);

                const warehouse = warehouses.find((w: any) => w.id === cs.sessionWarehouseId);
                const terminal = posTerminals.find((t: any) => t.id === cs.posTerminalId);
                return {
                    ...cs,
                    totalSalesByMethod,
                    totalCashSales,
                    totalReturnsValue,
                    totalTips,
                    transactionCount: sessionSales.length,
                    expectedCash: cs.openingBalance + totalCashSales - totalReturnsValue + totalTips,
                    warehouseName: warehouse?.name || 'غير محدد',
                    terminalName: terminal?.name || 'غير محدد'
                };
            });
        }
        
        const sessionsAreClosed = !openDay || !openDay.cashierSessions || Object.values(openDay.cashierSessions).every((cs: any) => cs.isClosed);
        const allUnreconciledDelivery = unreconciledDeliveryCount === 0;

        return {
            openWorkDay: openDay,
            closedWorkDays: closedDays,
            cashierSessionsData: sessionsData,
            allSessionsClosed: sessionsAreClosed,
            canCloseWorkDay: sessionsAreClosed && allUnreconciledDelivery
        };
    }, [allPosSessions, posSales, posReturns, warehouses, posTerminals, paymentMethods, unreconciledDeliveryCount, gratuityLogs]);

    const [isPosting, setIsPosting] = useState(false);
    
    const accountBalances = useMemo(() => {
        const balances = new Map<string, number>();
        cashAccounts.forEach((account: any) => {
            let balance = account.openingBalance || 0;
             customerPayments.forEach((p:any) => { if(p.paidToAccountId === account.id) balance += p.amount });
             salesInvoices.filter((s:any) => s.status === 'approved').forEach((s: any) => { if (s.paidToAccountId === account.id) balance += (s.paidAmount || 0) });
             exceptionalIncomes.forEach((i:any) => { if (i.paidToAccountId === account.id) balance += i.amount });
             treasuryTransactions.forEach((tx: any) => { if (tx.accountId === account.id && tx.type === 'deposit') balance += tx.amount });
             posSales.forEach((sale: any) => {
                if (account.warehouseId && sale.warehouseId === account.warehouseId) {
                    const totalPaidOnSale = sale.paidAmount ?? sale.payments?.reduce((sum: number, p: any) => sum + p.amount, 0) ?? sale.total;
                    balance += totalPaidOnSale;
                }
            });

            expenses.forEach((ex: any) => { if (ex.paidFromAccountId === account.id) balance -= ex.amount });
            supplierPayments.forEach((sp: any) => { if (sp.paidFromAccountId === account.id) balance -= sp.amount });
            employeeAdvances.forEach((ea: any) => { if (ea.paidFromAccountId === account.id) balance -= ea.amount });
            treasuryTransactions.forEach((tx: any) => { if (tx.accountId === account.id && tx.type === 'withdrawal') balance -= tx.amount });
            balances.set(account.id, balance);
        });
        return balances;
    }, [cashAccounts, customerPayments, salesInvoices, exceptionalIncomes, treasuryTransactions, expenses, supplierPayments, employeeAdvances, posSales]);


    const handleOpenWorkDay = async () => {
        if (isCentral) {
            toast({ variant: 'destructive', title: 'عملية محظورة', description: 'لا يمكن فتح يوم عمل في الإدارة المركزية. الكاشير مخصص لفروع البيع فقط.' });
            return;
        }
        try {
            await dbAction('posSessions', 'add', {
                startTime: new Date().toISOString(),
                isClosed: false,
                openedBy: user?.id,
                openedByName: user?.name,
                cashierSessions: {}
            });
            toast({title: 'تم بنجاح', description: `تم فتح يوم عمل جديد.`});
        } catch(error) {
            toast({variant: 'destructive', title: 'خطأ', description: 'فشل فتح يوم العمل.'});
        }
    }

    const handleAssignCustody = async (data: { cashierId: string, openingBalance: number, fromAccountId?: string, sessionWarehouseId?: string, posTerminalId: string }) => {
        if (isCentral) {
            toast({ variant: 'destructive', title: 'عملية محظورة', description: 'لا يمكن تسليم عهدة أو فتح وردية كاشير في الإدارة المركزية.' });
            return;
        }
        if (!openWorkDay) return;
        const { cashierId, openingBalance, fromAccountId, sessionWarehouseId, posTerminalId } = data;
        const cashier = users.find((u:any) => u.id === cashierId);
        if (!cashier) return;

        const newCashierSession: Partial<CashierSession> = {
            cashierId: cashierId,
            cashierName: cashier.name,
            startTime: new Date().toISOString(),
            openingBalance: openingBalance,
            isClosed: false,
            sessionWarehouseId: sessionWarehouseId, 
            posTerminalId: posTerminalId,
            invoiceCounter: 0, 
        };
        
        if (fromAccountId) {
            newCashierSession.custodyFromAccountId = fromAccountId;
        }

        if (openingBalance > 0 && fromAccountId) {
            await dbAction('expenses', 'add', {
                date: new Date().toISOString(),
                amount: openingBalance,
                expenseType: 'عهدة موظف',
                description: `صرف عهدة بداية الوردية للكاشير ${cashier.name}`,
                paidFromAccountId: fromAccountId
            });
        }

        const updatedSessions = { ...openWorkDay.cashierSessions, [cashierId]: newCashierSession };
        await dbAction('posSessions', 'update', { id: openWorkDay.id, data: { cashierSessions: updatedSessions } });
        toast({ title: "تم تسليم العهدة", description: `تم فتح وردية للكاشير ${cashier.name}` });
    }
    
     const handleCloseCashierSession = async (cashierId: string, closeData: { actualCash: number, toAccountId: string, notes: string }) => {
        if (!openWorkDay) return;
        const sessionToClose = cashierSessionsData.find(cs => cs.cashierId === cashierId);
        if (!sessionToClose) return;

        const { actualCash, toAccountId } = closeData;
        const difference = actualCash - sessionToClose.expectedCash;

        const closedSessionData = {
            ...openWorkDay.cashierSessions[cashierId],
            isClosed: true,
            endTime: new Date().toISOString(),
            expectedCash: sessionToClose.expectedCash,
            actualCash: actualCash,
            difference: difference,
            remittedToAccountId: toAccountId,
            totalSalesByMethod: sessionToClose.totalSalesByMethod,
            totalTips: sessionToClose.totalTips, // Save tips in session record
        };
        
        const updatedSessions = { ...openWorkDay.cashierSessions, [cashierId]: closedSessionData };
        
        await dbAction('posSessions', 'update', { id: openWorkDay.id, data: { cashierSessions: updatedSessions } });

        if (difference !== 0) {
            if (difference > 0) {
                await dbAction('exceptionalIncomes', 'add', { date: new Date().toISOString(), amount: difference, paidToAccountId: toAccountId, description: `فائض وردية الكاشير ${sessionToClose.cashierName}` });
            } else {
                await dbAction('expenses', 'add', { date: new Date().toISOString(), amount: Math.abs(difference), paidFromAccountId: toAccountId, description: `عجز وردية الكاشير ${sessionToClose.cashierName}`, expenseType: "عجز خزينة" });
            }
        }
        if (actualCash > 0) {
            await dbAction('treasuryTransactions', 'add', {
                date: new Date().toISOString(),
                amount: actualCash,
                accountId: toAccountId,
                type: 'deposit',
                description: `توريد من وردية الكاشير ${sessionToClose.cashierName} (شامل الإكراميات)`,
                receiptNumber: `ح-خ-${await getNextId('treasuryTransaction')}`,
                linkedTransaction: true,
            });
        }
        toast({ title: "تم إقفال الوردية", description: `تم إقفال وردية الكاشير ${sessionToClose.cashierName} بنجاح.` });
    };

    const buildClosingStatement = (session: any, nextDayDate?: string): WorkDayClosingStatement => {
        const cashiersList: CashierStatementItem[] = [];
        const dynamicPaymentMethods = new Set<string>();

        // Ensure default common payment methods exist in set
        dynamicPaymentMethods.add('نقدي');
        if (paymentMethods && Array.isArray(paymentMethods)) {
            paymentMethods.forEach((pm: any) => {
                if (pm.name) dynamicPaymentMethods.add(pm.name);
            });
        }

        const cashierEntries = Object.values(session?.cashierSessions || {}) as any[];
        
        for (const cs of cashierEntries) {
            const sessionStart = new Date(cs.startTime);
            const sessionSales = (posSales || []).filter((sale: any) => sale.cashierId === cs.cashierId && new Date(sale.date) >= sessionStart);
            const sessionReturns = (posReturns || []).filter((ret: any) => ret.cashierId === cs.cashierId && new Date(ret.date) >= sessionStart);
            const sessionTips = (gratuityLogs || []).filter((log: any) => log.cashierId === cs.cashierId && new Date(log.date) >= sessionStart);

            const salesByMethod: Record<string, number> = {};
            
            // Check recorded salesByMethod in session
            if (cs.totalSalesByMethod && typeof cs.totalSalesByMethod === 'object') {
                for (const [m, a] of Object.entries(cs.totalSalesByMethod)) {
                    salesByMethod[m] = Number(a) || 0;
                    dynamicPaymentMethods.add(m);
                }
            }

            // Cross-verify with sessionSales payments
            sessionSales.forEach((sale: any) => {
                if (sale.payments && sale.payments.length > 0) {
                    sale.payments.forEach((p: any) => {
                        salesByMethod[p.method] = (salesByMethod[p.method] || 0) + Number(p.amount || 0);
                        dynamicPaymentMethods.add(p.method);
                    });
                }
            });

            const totalSales = Object.values(salesByMethod).reduce((sum, v) => sum + v, 0);
            const returnsValue = sessionReturns.reduce((sum: number, ret: any) => sum + Number(ret.total || 0), 0);
            const tips = sessionTips.reduce((sum: number, log: any) => sum + Number(log.amount || 0), 0) || Number(cs.totalTips || 0);
            const terminal = (posTerminals || []).find((t: any) => t.id === cs.posTerminalId);
            const warehouse = (warehouses || []).find((w: any) => w.id === cs.sessionWarehouseId);
            const remittedAccount = (cashAccounts || []).find((acc: any) => acc.id === cs.remittedToAccountId);

            cashiersList.push({
                cashierId: cs.cashierId,
                cashierName: cs.cashierName || 'كاشير',
                terminalName: terminal?.name || terminal?.code || cs.terminalName || 'جهاز كاشير',
                warehouseName: warehouse?.name || cs.warehouseName || 'الفرع',
                startTime: cs.startTime,
                endTime: cs.endTime,
                openingBalance: Number(cs.openingBalance || 0),
                salesByMethod,
                totalSales,
                returnsValue,
                tips,
                expectedCash: Number(cs.expectedCash || 0),
                actualCash: Number(cs.actualCash || 0),
                difference: Number(cs.difference || 0),
                remittedToAccountName: remittedAccount?.name || '-'
            });
        }

        const methodsArray = Array.from(dynamicPaymentMethods);
        
        // Aggregate totals for each payment method across all cashiers
        const totalsSalesByMethod: Record<string, number> = {};
        for (const m of methodsArray) {
            totalsSalesByMethod[m] = cashiersList.reduce((sum, c) => sum + (c.salesByMethod[m] || 0), 0);
        }

        const totalOpeningBalance = cashiersList.reduce((sum, c) => sum + c.openingBalance, 0);
        const totalSales = cashiersList.reduce((sum, c) => sum + c.totalSales, 0);
        const totalReturns = cashiersList.reduce((sum, c) => sum + c.returnsValue, 0);
        const totalTips = cashiersList.reduce((sum, c) => sum + c.tips, 0);
        const totalExpectedCash = cashiersList.reduce((sum, c) => sum + c.expectedCash, 0);
        const totalActualCash = cashiersList.reduce((sum, c) => sum + c.actualCash, 0);
        const totalDifference = cashiersList.reduce((sum, c) => sum + c.difference, 0);
        const totalNetRevenue = totalSales - totalReturns;

        return {
            sessionId: session?.id || String(Date.now()),
            workDayDate: settings?.main?.posSettings?.workDay || new Date().toISOString().split('T')[0],
            startTime: session?.startTime || new Date().toISOString(),
            endTime: new Date().toISOString(),
            closedByName: user?.name || 'المدير',
            openedByName: session?.openedByName || 'غير محدد',
            branchName: settings?.main?.general?.companyName || 'الفرع الرئيسي',
            nextWorkDay: nextDayDate,
            cashiers: cashiersList,
            paymentMethodsList: methodsArray,
            totals: {
                totalOpeningBalance,
                salesByMethod: totalsSalesByMethod,
                totalSales,
                totalReturns,
                totalTips,
                totalExpectedCash,
                totalActualCash,
                totalDifference,
                totalNetRevenue
            }
        };
    };

    const handleCloseWorkDay = async () => {
        if (!openWorkDay) return;

        const currentWorkDay = new Date(settings?.main?.posSettings?.workDay || new Date());
        currentWorkDay.setDate(currentWorkDay.getDate() + 1);
        const nextWorkDay = currentWorkDay.toISOString().split('T')[0];

        // 1. Build financial closing statement data with all cashiers & payment methods
        const statementData = buildClosingStatement(openWorkDay, nextWorkDay);

        // 2. Close current work day session and save statement JSON
        const closeTime = new Date().toISOString();
        await dbAction('posSessions', 'update', { 
            id: openWorkDay.id, 
            data: { 
                isClosed: true, 
                endTime: closeTime, 
                closedBy: user?.id, 
                closedByName: user?.name,
                closingStatement: statementData,
                closingStatementJson: JSON.stringify(statementData)
            } 
        });
        
        // 3. Advance system work day in settings
        await dbAction('settings', 'update', { 
            id: 'main', 
            data: { 
                posSettings: { ...settings?.main?.posSettings, workDay: nextWorkDay } 
            } 
        });

        // 4. Automatically open next work day session if not Central HQ
        if (!isCentral) {
            await dbAction('posSessions', 'add', {
                startTime: closeTime,
                isClosed: false,
                openedBy: user?.id,
                openedByName: user?.name || 'النظام (تلقائي)',
                cashierSessions: {}
            });
        }

        // 5. Present closing statement dialog immediately to user
        setStatementModalData(statementData);
        setIsStatementModalOpen(true);
        
        toast({ 
            title: 'تم إقفال يوم العمل بنجاح', 
            description: `تم إقفال اليوم المالي وتوريد العهد، وتم فتح يوم العمل التالي (${nextWorkDay}) تلقائياً.` 
        });
    };

    const availableCashiers = useMemo(() => {
        if (!openWorkDay || !users) return [];
        const activeCashierIds = new Set(Object.keys(openWorkDay.cashierSessions || {}).filter(key => !openWorkDay.cashierSessions[key].isClosed));
        return users.filter((c:any) => c.isCashier && !activeCashierIds.has(c.id));
    }, [openWorkDay, users]);


    return (
        <>
            <PageHeader title="إدارة يومية نقاط البيع" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                {isCentral && (
                    <Card className="border-sky-500/40 bg-sky-500/5 shadow-sm">
                        <CardContent className="p-4 flex items-center gap-3">
                            <Building2 className="h-6 w-6 text-sky-600 shrink-0" />
                            <div className="space-y-0.5 text-xs">
                                <p className="font-bold text-sm text-foreground">وضع المراجعة والتدقيق المركزي (Central Review Mode)</p>
                                <p className="text-muted-foreground">
                                    النظام يعمل حالياً بدور <strong>الإدارة المركزية (Central HQ)</strong>. فتح أيام العمل، بدء الورديات، وتسليم العهد النقدية محظور في الإدارة ومخصص لفروع البيع فقط. تعرض هذه الشاشة ورديات الفروع المستلمة عبر المزامنة لأغراض المراجعة والتدقيق المالي.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}
                {loading ? <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
                : openWorkDay ? (
                    <div className="space-y-6">
                        <Card>
                             <CardHeader>
                                <CardTitle className='flex items-center gap-2'><PlayCircle className="text-green-500" />يوم العمل مفتوح</CardTitle>
                                <CardDescription>يوم العمل الحالي للنظام: {settings?.main?.posSettings?.workDay || 'غير محدد'}. بدأ في: {new Date(openWorkDay.startTime).toLocaleString('ar-EG')} بواسطة {openWorkDay.openedByName || 'غير معروف'}</CardDescription>
                            </CardHeader>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>الورديات المفتوحة حاليًا</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                {cashierSessionsData.map(cs => (
                                    <Card key={cs.cashierId} className="p-4">
                                        <div className="grid grid-cols-2 md:grid-cols-7 gap-4 items-center">
                                            <div className="col-span-2 md:col-span-2">
                                                <h3 className="font-bold flex items-center gap-2"><UserCheck />{cs.cashierName}</h3>
                                                <p className="text-xs text-muted-foreground">بدأت في: {new Date(cs.startTime).toLocaleTimeString('ar-EG')}</p>
                                                <p className="text-xs text-muted-foreground flex items-center gap-1"><Laptop className="h-3 w-3" />{cs.terminalName}</p>
                                                <p className="text-xs text-muted-foreground flex items-center gap-1"><Warehouse className="h-3 w-3" />{cs.warehouseName}</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-sm text-muted-foreground">مبيعات نقدية</p>
                                                <p className="font-bold">{cs.totalCashSales.toLocaleString()} ج.م</p>
                                            </div>
                                             <div className="text-center">
                                                <p className="text-sm text-muted-foreground">إكراميات (Tips)</p>
                                                <p className="font-bold text-primary">{cs.totalTips.toLocaleString()} ج.م</p>
                                            </div>
                                             <div className="text-center">
                                                <p className="text-sm text-muted-foreground">مرتجعات</p>
                                                <p className="font-bold text-destructive">{cs.totalReturnsValue.toLocaleString()} ج.م</p>
                                            </div>
                                             <div className="text-center">
                                                <p className="text-sm text-muted-foreground">متوقع بالدرج</p>
                                                <p className="font-bold">{cs.expectedCash.toLocaleString()} ج.م</p>
                                            </div>
                                            <div className="col-span-2 md:col-span-1 flex justify-end">
                                                {!isCentral ? (
                                                    <AddEntityDialog
                                                        title="إقفال وردية الكاشير"
                                                        description="تأكيد المبالغ وتوريدها إلى الخزينة الرئيسية."
                                                        triggerButton={<Button variant="destructive"><PowerOff className="ml-2 h-4 w-4"/>إقفال وردية</Button>}
                                                    >
                                                        <CloseCashierSessionDialog cashierSession={cs} onConfirm={(data) => handleCloseCashierSession(cs.cashierId, data)} onClose={()=>{}} />
                                                    </AddEntityDialog>
                                                ) : (
                                                    <Badge variant="outline" className="text-xs font-medium text-muted-foreground border-border/80">
                                                        متابعة فرع
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                                {cashierSessionsData.length === 0 && <p className="text-center text-muted-foreground py-4">لا توجد ورديات مفتوحة حاليًا.</p>}
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle>إدارة اليومية</CardTitle></CardHeader>
                            <CardContent className="flex gap-4">
                               {availableCashiers.length > 0 && !isCentral && (
                                     <AddEntityDialog
                                        title="تسليم عهدة وبدء وردية"
                                        description="اختر الكاشير وأدخل رصيد بداية الوردية."
                                        triggerButton={<Button><UserPlus className="ml-2 h-4 w-4" />تسليم عهدة جديدة</Button>}
                                    >
                                        <AssignCustodyDialog users={availableCashiers} onConfirm={handleAssignCustody} onClose={()=>{}} cashAccounts={cashAccounts} accountBalances={accountBalances} warehouses={warehouses} terminals={posTerminals} activeSessions={cashierSessionsData} />
                                    </AddEntityDialog>
                               )}
                                <Button variant="secondary" onClick={handleCloseWorkDay} disabled={!canCloseWorkDay || isCentral}>
                                    <PowerOff className="ml-2 h-4 w-4" />
                                    إقفال يوم العمل بالكامل
                                </Button>
                            </CardContent>
                             {!canCloseWorkDay && <CardFooter>
                                <div className="text-xs text-destructive flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>
                                        لا يمكن إقفال يوم العمل. 
                                        {!allSessionsClosed && " يجب إقفال جميع ورديات الكاشيرات أولاً."} 
                                        {unreconciledDeliveryCount > 0 && ` يوجد ${unreconciledDeliveryCount} فاتورة دليفري معلقة لم يتم تحصيلها.`}
                                    </span>
                                </div>
                             </CardFooter>}
                        </Card>
                    </div>
                ) : (
                    <Card className='text-center border-dashed'>
                        <CardHeader>
                            <CardTitle className='flex items-center justify-center gap-2'>
                                {isCentral ? (
                                    <>
                                        <Building2 className="h-6 w-6 text-sky-600" />
                                        وضع المراجعة والتدقيق المركزي (Central HQ)
                                    </>
                                ) : (
                                    <>
                                        <PowerOff className="text-destructive" />
                                        يوم العمل مغلق
                                    </>
                                )}
                            </CardTitle>
                            <CardDescription>
                                {isCentral 
                                    ? "فتح أيام العمل وبدء الورديات محظور في الإدارة المركزية، ومخصص لفروع البيع فقط. تعرض هذه الشاشة ورديات الفروع المستلمة عبر المزامنة لأغراض التدقيق المالي." 
                                    : "لا توجد يومية عمل مفتوحة حاليًا. يجب فتح يومية جديدة لبدء عمليات نقاط البيع."}
                            </CardDescription>
                        </CardHeader>
                        {!isCentral && (
                            <CardContent>
                                <Button size="lg" onClick={handleOpenWorkDay}>
                                    <PlayCircle className="ml-2 h-4 w-4"/>
                                    فتح يوم عمل جديد
                                </Button>
                            </CardContent>
                        )}
                    </Card>
                )}
                 {closedWorkDays.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><History /> سجل الورديات المقفلة</CardTitle>
                            <CardDescription>عرض تفصيلي لجميع أيام العمل والورديات التي تم إقفالها.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Accordion type="single" collapsible className="w-full">
                                {closedWorkDays.map((session: PosSession) => (
                                    <AccordionItem value={session.id} key={session.id}>
                                        <AccordionTrigger>
                                            <div className="flex justify-between w-full pr-4">
                                                <span>يوم عمل: {new Date(session.startTime).toLocaleDateString('ar-EG')}</span>
                                                <span className="text-sm text-muted-foreground">أقفل بواسطة: {session.closedByName}</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg mb-4 border">
                                                <div className="space-y-0.5">
                                                    <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                                                        <FileText className="h-4 w-4 text-primary" />
                                                        بيان إقفال اليوم المالي وتجميع طرق الدفع
                                                    </span>
                                                    <p className="text-[11px] text-muted-foreground">عرض وتدقيق مبيعات كل كاشير ومجموع الإيرادات حسب طريقة الدفع (A4 / تقرير رسمي)</p>
                                                </div>
                                                <Button 
                                                    size="sm" 
                                                    variant="outline" 
                                                    className="gap-1.5 font-bold border-primary/40 text-primary hover:bg-primary/10 h-8 text-xs"
                                                    onClick={() => {
                                                        const statement = session.closingStatement || buildClosingStatement(session);
                                                        setStatementModalData(statement);
                                                        setIsStatementModalOpen(true);
                                                    }}
                                                >
                                                    <ReceiptText className="h-4 w-4" />
                                                    عرض بيان طرق الدفع والإقفال
                                                </Button>
                                            </div>
                                             {session.cashierSessions && Object.values(session.cashierSessions).filter(cs => cs.isClosed).length > 0 ? (
                                                Object.values(session.cashierSessions).filter(cs => cs.isClosed).map(cs => {
                                                    const totalSessionSales = Object.values(cs.totalSalesByMethod || {}).reduce((sum, amount) => sum + amount, 0);
                                                    return (
                                                        <Card key={cs.cashierId} className="mb-4">
                                                            <CardHeader>
                                                                <CardTitle className="text-base">{cs.cashierName}</CardTitle>
                                                                <CardDescription>
                                                                    وردية من {new Date(cs.startTime).toLocaleTimeString('ar-EG')} إلى {cs.endTime ? new Date(cs.endTime).toLocaleTimeString('ar-EG') : ''}
                                                                </CardDescription>
                                                            </CardHeader>
                                                            <CardContent>
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow>
                                                                            <TableHead>البيان</TableHead>
                                                                            <TableHead className="text-left">القيمة</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        <TableRow><TableCell>عهدة بداية الوردية</TableCell><TableCell className="text-left">{cs.openingBalance.toLocaleString()}</TableCell></TableRow>
                                                                        {Object.entries(cs.totalSalesByMethod || {}).map(([method, amount]) => (
                                                                            <TableRow key={method}><TableCell className="pr-4">مبيعات ({method})</TableCell><TableCell className="text-left">{Number(amount).toLocaleString()}</TableCell></TableRow>
                                                                        ))}
                                                                        <TableRow className="font-bold bg-muted/30"><TableCell>إجمالي مبيعات الوردية</TableCell><TableCell className="text-left">{totalSessionSales.toLocaleString()}</TableCell></TableRow>
                                                                        <TableRow className="bg-primary/5"><TableCell className="font-bold text-primary">إجمالي الإكراميات (Tips)</TableCell><TableCell className="text-left font-bold text-primary">{cs.totalTips?.toLocaleString() || '0'}</TableCell></TableRow>
                                                                        <TableRow><TableCell>النقدية المتوقعة</TableCell><TableCell className="text-left">{cs.expectedCash?.toLocaleString() || '-'}</TableCell></TableRow>
                                                                        <TableRow><TableCell>النقدية الفعلية</TableCell><TableCell className="text-left">{cs.actualCash?.toLocaleString() || '-'}</TableCell></TableRow>
                                                                        <TableRow><TableCell>الفرق</TableCell><TableCell className="text-left"> <Badge variant={cs.difference === 0 ? 'secondary' : (cs.difference ?? 0) > 0 ? 'default' : 'destructive'}>{cs.difference?.toLocaleString() || '0'}</Badge></TableCell></TableRow>
                                                                        <TableRow><TableCell>مورد إلى</TableCell><TableCell className="text-left">{cashAccounts.find((acc:any) => acc.id === cs.remittedToAccountId)?.name || '-'}</TableCell></TableRow>
                                                                    </TableBody>
                                                                </Table>
                                                            </CardContent>
                                                        </Card>
                                                    )
                                                })
                                            ) : (
                                                <p className="text-center text-sm text-muted-foreground p-4">لا توجد ورديات مقفلة في يوم العمل هذا.</p>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </CardContent>
                    </Card>
                )}
            </main>

            {/* Financial Closing Statement Modal */}
            <WorkDayClosingStatementDialog 
                statement={statementModalData} 
                open={isStatementModalOpen} 
                onOpenChange={setIsStatementModalOpen} 
                companyName={settings?.main?.general?.companyName || 'Meto'} 
            />
        </>
    );
}
