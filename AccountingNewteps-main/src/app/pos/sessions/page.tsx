
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
import { Loader2, PlayCircle, PowerOff, Coins, TrendingDown, TrendingUp, HandCoins, UserCheck, UserPlus, Warehouse, Laptop, Check, History, Undo2, AlertTriangle } from "lucide-react";
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
    }
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
    totalTips?: number; // New field
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
                            {cashAccounts.map((acc:any) => <SelectItem key={acc.id} value={acc.id}>{`${acc.name} (الرصيد: ${(accountBalances.get(acc.id) || 0).toLocaleString()})`}</SelectItem>)}
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
    const mainCashAccounts = cashAccounts.filter((acc: any) => !acc.salesRepId && !acc.userId);

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
    } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    
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

    const handleCloseWorkDay = async () => {
        if (!openWorkDay) return;
        await dbAction('posSessions', 'update', { id: openWorkDay.id, data: { isClosed: true, endTime: new Date().toISOString(), closedBy: user?.id, closedByName: user?.name } });
        
        const currentWorkDay = new Date(settings?.main?.posSettings?.workDay || new Date());
        currentWorkDay.setDate(currentWorkDay.getDate() + 1);
        const nextWorkDay = currentWorkDay.toISOString().split('T')[0];
        await dbAction('settings', 'update', { id: 'main', data: { posSettings: { ...settings.main.posSettings, workDay: nextWorkDay } } });
        
        toast({ title: 'تم إقفال يوم العمل', description: 'تم إقفال اليوم بنجاح. يوم العمل الجديد هو ' + nextWorkDay });
    }

    const availableCashiers = useMemo(() => {
        if (!openWorkDay || !users) return [];
        const activeCashierIds = new Set(Object.keys(openWorkDay.cashierSessions || {}).filter(key => !openWorkDay.cashierSessions[key].isClosed));
        return users.filter((c:any) => c.isCashier && !activeCashierIds.has(c.id));
    }, [openWorkDay, users]);


    return (
        <>
            <PageHeader title="إدارة يومية نقاط البيع" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
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
                                                <AddEntityDialog
                                                    title="إقفال وردية الكاشير"
                                                    description="تأكيد المبالغ وتوريدها إلى الخزينة الرئيسية."
                                                    triggerButton={<Button variant="destructive"><PowerOff className="ml-2 h-4 w-4"/>إقفال وردية</Button>}
                                                >
                                                    <CloseCashierSessionDialog cashierSession={cs} onConfirm={(data) => handleCloseCashierSession(cs.cashierId, data)} onClose={()=>{}} />
                                                </AddEntityDialog>
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
                               {availableCashiers.length > 0 && (
                                     <AddEntityDialog
                                        title="تسليم عهدة وبدء وردية"
                                        description="اختر الكاشير وأدخل رصيد بداية الوردية."
                                        triggerButton={<Button><UserPlus className="ml-2 h-4 w-4" />تسليم عهدة جديدة</Button>}
                                    >
                                        <AssignCustodyDialog users={availableCashiers} onConfirm={handleAssignCustody} onClose={()=>{}} cashAccounts={cashAccounts} accountBalances={accountBalances} warehouses={warehouses} terminals={posTerminals} activeSessions={cashierSessionsData} />
                                    </AddEntityDialog>
                               )}
                                <Button variant="secondary" onClick={handleCloseWorkDay} disabled={!canCloseWorkDay}>
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
                    <Card className='text-center'>
                        <CardHeader>
                            <CardTitle className='flex items-center justify-center gap-2'><PowerOff className="text-destructive" />يوم العمل مغلق</CardTitle>
                            <CardDescription>لا توجد يومية عمل مفتوحة حاليًا. يجب فتح يومية جديدة لبدء عمليات نقاط البيع.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button size="lg" onClick={handleOpenWorkDay}><PlayCircle className="ml-2 h-4 w-4"/>فتح يوم عمل جديد</Button>
                        </CardContent>
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
        </>
    );
}
