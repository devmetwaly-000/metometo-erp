
"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Coins, TrendingDown, TrendingUp } from "lucide-react";
import React, { useState, useMemo } from "react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';
import { useAuth } from "@/contexts/auth-context";

interface User {
    id: string;
    name: string;
    isSalesRep?: boolean;
}

interface CashAccount {
    id: string;
    name: string;
    userId?: string;
}

export default function RemitFromRepPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [selectedRepId, setSelectedRepId] = useState<string>("");
    const [amount, setAmount] = useState<number>(0);
    const [toAccountId, setToAccountId] = useState<string>("");
    const [notes, setNotes] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const {
        users,
        cashAccounts,
        salesInvoices,
        customerPayments,
        repRemittances,
        dbAction,
        getNextId,
        loading,
    } = useData();

    const { user } = useAuth();
    const reps = useMemo(() => {
        return users.filter((u: any) => u.isSalesRep || u.role === 'مندوب' || (u.role && u.role.includes('مندوب')));
    }, [users]);
    const mainCashAccounts = cashAccounts.filter((acc: CashAccount) => !acc.userId);

    const repBalance = useMemo(() => {
        if (!selectedRepId) return 0;
        
        const repCashAccount = cashAccounts.find((acc: CashAccount) => acc.userId === selectedRepId);
        const repAccountId = repCashAccount?.id;

        let balance = 0;
        // Add initial cash received by the rep from sales invoices (excluding linked customer payments to avoid double counting)
        salesInvoices.filter((inv: any) => 
            (inv.salesRepId === selectedRepId || inv.userId === selectedRepId) && 
            (inv.status === 'approved' || !inv.status || inv.status === 'completed') &&
            (!repAccountId || !inv.paidToAccountId || inv.paidToAccountId === repAccountId)
        ).forEach((inv: any) => {
            const linkedPaymentsTotal = customerPayments
                .filter((p: any) => p.invoiceId === inv.id)
                .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
            const initialCash = (Number(inv.paidAmount) || 0) - linkedPaymentsTotal;
            if (initialCash > 0) balance += initialCash;
        });
        
        // Add customer payments collected by the rep
        customerPayments.filter((p: any) => {
            const sale = salesInvoices.find((s: any) => s.id === p.invoiceId);
            const isRepSale = sale && (sale.salesRepId === selectedRepId || sale.userId === selectedRepId);
            const isRepPayer = (p.salesRepId === selectedRepId || p.userId === selectedRepId);
            const isRepAccount = repAccountId && p.paidToAccountId === repAccountId;
            return isRepSale || isRepPayer || isRepAccount;
        }).forEach((p: any) => balance += Number(p.amount || 0));

        // Subtract all remittances made by the rep
        repRemittances.filter((r: any) => r.userId === selectedRepId || r.salesRepId === selectedRepId)
            .forEach((r: any) => balance -= Number(r.amount || 0));
            
        return balance;

    }, [selectedRepId, cashAccounts, salesInvoices, customerPayments, repRemittances]);

    const difference = amount - repBalance;

    const handleConfirm = async () => {
        if (!selectedRepId || amount <= 0 || !toAccountId) {
            toast({ variant: "destructive", title: "بيانات غير مكتملة", description: "يرجى اختيار المندوب والحساب وإدخال مبلغ صحيح." });
            return;
        }

        const repUser = users.find((u: any) => u.id === selectedRepId);
        const repName = repUser?.name || 'غير معروف';

        let repCashAccount = cashAccounts.find((acc: CashAccount) => acc.userId === selectedRepId);
        
        // Auto-provision cash account for rep if missing
        if (!repCashAccount) {
            try {
                const newAccId = await dbAction('cashAccounts', 'add', {
                    name: `خزينة المندوب - ${repName}`,
                    userId: selectedRepId,
                    type: 'custody',
                    openingBalance: 0
                });
                repCashAccount = { id: String(newAccId), name: `خزينة المندوب - ${repName}`, userId: selectedRepId };
            } catch (err) {
                toast({ variant: "destructive", title: "خطأ", description: "فشل إنشاء خزينة للمندوب." });
                return;
            }
        }

        setIsSaving(true);

        try {
            const date = new Date().toISOString();
            const remittanceReceipt = `ت-ن-${await getNextId('remittance')}`;

            // 1. Record the remittance
            await dbAction('repRemittances', 'add', {
                userId: selectedRepId,
                salesRepId: selectedRepId,
                salesRepName: repName,
                fromAccountId: repCashAccount.id,
                toAccountId: toAccountId,
                date: date,
                amount: Number(amount),
                notes,
                receiptNumber: remittanceReceipt,
                type: 'sales_rep',
            });

            // 2. Handle discrepancy (shortage/overage)
            if (difference !== 0) {
                if (difference < 0) { // Shortage
                    await dbAction('expenses', 'add', {
                        date: date,
                        amount: Math.abs(difference),
                        expenseType: 'عجز عهدة',
                        description: `عجز عهدة المندوب ${repName} - مرجع: ${remittanceReceipt}`,
                        paidFromAccountId: repCashAccount.id, // The shortage is 'paid' from the rep's custody
                    });
                } else { // Overage
                    await dbAction('exceptionalIncomes', 'add', {
                        date: date,
                        amount: difference,
                        description: `زيادة عهدة المندوب ${repName} - مرجع: ${remittanceReceipt}`,
                        paidToAccountId: toAccountId, // Add overage to the main account
                    });
                }
            }

            toast({ title: "تم بنجاح", description: `تم تسجيل توريد النقدية وتسوية الفروقات بنجاح.` });
            router.push('/sales/rep-operations');
        } catch (error) {
            toast({ variant: "destructive", title: "حدث خطأ", description: "فشل في حفظ حركة التوريد." });
        } finally {
            setIsSaving(false);
        }
    };

  return (
    <>
      <PageHeader title="توريد نقدية من مندوب" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>إيصال توريد نقدية</CardTitle>
            <CardDescription>
                تسجيل المبالغ النقدية المحولة من عهدة المندوب المالية إلى خزينة الشركة الرئيسية أو البنك، مع تسوية أي عجز أو زيادة.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
                 <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="rep">من المندوب</Label>
                        <Select value={selectedRepId} onValueChange={setSelectedRepId}>
                            <SelectTrigger id="rep"><SelectValue placeholder="اختر المندوب" /></SelectTrigger>
                            <SelectContent>
                                {reps.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    
                    {selectedRepId && (
                        <Card className="bg-muted/50 p-4">
                            <div className="flex justify-between items-center">
                                <div className="text-sm">الرصيد المتوقع في العهدة</div>
                                <div className="text-lg font-bold text-primary">{repBalance.toLocaleString()} ج.م</div>
                            </div>
                        </Card>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="toAccount">إلى حساب</Label>
                        <Select value={toAccountId} onValueChange={setToAccountId}>
                            <SelectTrigger id="toAccount"><SelectValue placeholder="اختر حساب الخزينة/البنك الرئيسي" /></SelectTrigger>
                            <SelectContent>
                               {mainCashAccounts.map((acc:CashAccount) => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="amount">المبلغ المورد الفعلي</Label>
                        <Input id="amount" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} placeholder="أدخل المبلغ الفعلي الذي تم توريده" />
                    </div>

                    {selectedRepId && amount > 0 && (
                         <div className={`p-4 rounded-lg flex items-center justify-center gap-2 text-xl font-bold ${difference === 0 ? 'bg-muted' : difference > 0 ? 'bg-green-100 dark:bg-green-900 text-green-600' : 'bg-red-100 dark:bg-red-900 text-destructive'}`}>
                            {difference === 0 ? <Coins/> : difference > 0 ? <TrendingUp/> : <TrendingDown/>}
                            <span>{difference === 0 ? 'لا يوجد فرق' : (difference > 0 ? `زيادة: ${difference.toLocaleString()}` : `عجز: ${Math.abs(difference).toLocaleString()}`)}</span>
                        </div>
                    )}
                    
                    <div className="space-y-2">
                        <Label htmlFor="notes">ملاحظات</Label>
                        <Input id="notes" placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button size="lg" disabled={loading || isSaving} onClick={handleConfirm}>
                {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Save className="ml-2 h-4 w-4" />}
                حفظ وتسوية الحركة
            </Button>
          </CardFooter>
        </Card>
      </main>
    </>
  );
}
