
"use client";

import React, { useState, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2, Coins, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';


interface SaleInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  total: number;
  items: any[];
  isDelivery?: boolean;
  deliveryPersonId?: string;
  deliveryPersonName?: string;
  deliveryReconciled?: boolean; // New flag to track reconciliation
  type?: 'Invoice' | 'POS'; // To differentiate
  warehouseId?: string;
  paidAmount?: number; // Added for posSales consistency
}

const QuickCollectDialog = ({ invoice, onSave }: { invoice: SaleInvoice, onSave: () => void }) => {
    const { cashAccounts, dbAction, getNextId, warehouses } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const [amount, setAmount] = useState(invoice.total);
    const [isSaving, setIsSaving] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const branchCashAccount = useMemo(() => {
        if (!invoice.warehouseId) return null;
        return cashAccounts.find((acc: any) => acc.warehouseId === invoice.warehouseId);
    }, [cashAccounts, invoice.warehouseId]);
    
    const warehouseName = useMemo(() => warehouses.find((w: any) => w.id === invoice.warehouseId)?.name || 'غير محدد', [warehouses, invoice.warehouseId]);

    const handleSave = async () => {
        if (!branchCashAccount) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'لم يتم العثور على خزينة خاصة بهذا الفرع لاستلام النقدية.' });
            return;
        }
        if (amount <= 0) {
             toast({ variant: 'destructive', title: 'خطأ', description: 'الرجاء إدخل مبلغ صحيح.' });
            return;
        }

        setIsSaving(true);
        try {
            // Create a treasury transaction record
            await dbAction('treasuryTransactions', 'add', {
                date: new Date().toISOString(),
                amount: Number(amount),
                accountId: branchCashAccount.id,
                type: 'deposit',
                description: `تحصيل فاتورة دليفري #${invoice.invoiceNumber} من ${invoice.deliveryPersonName}`,
                receiptNumber: `ت-ن-${await getNextId('treasuryTransaction')}`,
                createdById: user?.id,
                createdByName: user?.name,
                linkedTransaction: true,
                isDeliveryReconciliation: true, // Custom flag
                deliveryPersonId: invoice.deliveryPersonId,
                originalInvoiceId: invoice.id,
            });

            // Mark the invoice as reconciled
            const collectionName = invoice.type === 'POS' ? 'posSales' : 'salesInvoices';
            await dbAction(collectionName, 'update', {
                id: invoice.id,
                data: { deliveryReconciled: true, paidAmount: (invoice.paidAmount || 0) + Number(amount) }
            });

            toast({ title: 'تم التحصيل', description: 'تم تسجيل المبلغ في خزينة الفرع.' });
            onSave();
            setIsOpen(false);
        } catch (error) {
            console.error("Failed to save collection:", error);
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ عملية التحصيل.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button size="sm">تحصيل</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>تحصيل فاتورة #{invoice.invoiceNumber}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>الطيار</Label>
                        <Input value={invoice.deliveryPersonName} disabled />
                    </div>
                     <div className="space-y-2">
                        <Label>العميل</Label>
                        <Input value={invoice.customerName} disabled />
                    </div>
                     <div className="space-y-2">
                        <Label>إيداع في خزينة</Label>
                        <Input value={branchCashAccount?.name || 'لا يوجد خزينة للفرع'} disabled />
                        <p className="text-xs text-muted-foreground">سيتم إيداع المبلغ في الخزينة المرتبطة بفرع الفاتورة: {warehouseName}</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="amount">المبلغ المحصل</Label>
                        <Input id="amount" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="text-lg font-bold" />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={isSaving || !branchCashAccount}>
                        {isSaving && <Loader2 className="animate-spin ml-2 h-4 w-4" />}
                        تأكيد التحصيل
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


const InvoiceItemsDialog = ({ items }: { items: any[] }) => (
    <DialogContent>
        <DialogHeader>
            <DialogTitle>تفاصيل أصناف الفاتورة</DialogTitle>
        </DialogHeader>
        <Table>
            <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead className="text-center">الكمية</TableHead><TableHead className="text-center">السعر</TableHead><TableHead className="text-center">الإجمالي</TableHead></TableRow></TableHeader>
            <TableBody>
                {items && items.map((item, idx) => (
                    <TableRow key={idx}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-center">{item.qty}</TableCell>
                        <TableCell className="text-center">{item.price?.toLocaleString() || '-'}</TableCell>
                        <TableCell className="text-center">{item.total?.toLocaleString() || '-'}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </DialogContent>
);

export default function DeliveryReconciliationPage() {
    const { salesInvoices, posSales, deliveryStaff, loading } = useData();
    const [filters, setFilters] = useState({ deliveryPersonId: 'all' });

    const deliveryStaffOptions = useMemo(() => {
        const staff = deliveryStaff || [];
        return [{ value: 'all', label: 'كل الطيارين' }, ...staff.map((u: any) => ({ value: u.id, label: u.name }))];
    }, [deliveryStaff]);
    
    const unreconciledInvoices = useMemo(() => {
        if (loading) return [];
        
        const allSales = [
            ...salesInvoices.map((inv: any) => ({ ...inv, type: 'Invoice' })),
            ...posSales.map((sale: any) => ({ ...sale, type: 'POS' }))
        ];

        return allSales
            .filter((inv: SaleInvoice) => inv.isDelivery && !inv.deliveryReconciled)
            .filter((inv: SaleInvoice) => filters.deliveryPersonId === 'all' || inv.deliveryPersonId === filters.deliveryPersonId)
            .sort((a: SaleInvoice, b: SaleInvoice) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [salesInvoices, posSales, filters, loading]);
    
    // Placeholder for refresh logic
    const handlePaymentSaved = () => {};

    return (
        <>
            <PageHeader title="تحصيل فواتير الدليفري" />
            <main className="flex-1 p-4 md:p-6 space-y-6">
                 <Card>
                    <CardHeader>
                        <CardTitle>فلترة الفواتير</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="max-w-xs space-y-2">
                             <Label>عرض فواتير الطيار</Label>
                             <Combobox
                                options={deliveryStaffOptions}
                                value={filters.deliveryPersonId}
                                onValueChange={(value) => setFilters({ ...filters, deliveryPersonId: value })}
                                placeholder="اختر طيارًا..."
                                emptyMessage="لا يوجد طيارون."
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>الفواتير المعلقة للتحصيل</CardTitle>
                        <CardDescription>هذه قائمة بجميع فواتير الدليفري التي تم تسليمها للطيارين ولم يتم تحصيل قيمتها بعد.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         {loading ? (
                            <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                        ) : (
                        <div className="w-full overflow-auto border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>رقم الفاتورة</TableHead>
                                        <TableHead>الطيار المسؤول</TableHead>
                                        <TableHead>العميل</TableHead>
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead className="text-center">المبلغ</TableHead>
                                        <TableHead className="text-center">الإجراءات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                {unreconciledInvoices.length > 0 ? unreconciledInvoices.map((invoice: SaleInvoice) => (
                                    <Dialog key={invoice.id}>
                                    <TableRow>
                                        <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                                        <TableCell>{invoice.deliveryPersonName}</TableCell>
                                        <TableCell>{invoice.customerName}</TableCell>
                                        <TableCell>{new Date(invoice.date).toLocaleDateString('ar-EG')}</TableCell>
                                        <TableCell className="text-center font-bold">{invoice.total.toLocaleString()}</TableCell>
                                        <TableCell className="text-center flex items-center justify-center gap-1">
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                                            </DialogTrigger>
                                            <QuickCollectDialog invoice={invoice} onSave={handlePaymentSaved} />
                                        </TableCell>
                                    </TableRow>
                                    <InvoiceItemsDialog items={invoice.items} />
                                    </Dialog>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                            لا توجد فواتير دليفري معلقة للتحصيل.
                                        </TableCell>
                                    </TableRow>
                                )}
                                </TableBody>
                            </Table>
                        </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
