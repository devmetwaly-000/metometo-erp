

"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { useData } from '@/contexts/data-provider';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Loader2, ArrowLeft, ArrowUp, ArrowDown, Filter, Search } from 'lucide-react';
import Link from 'next/link';
import { getLinkForReceipt } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface Transaction {
    date: Date; // Keep as Date object for sorting and filtering
    type: string;
    description: string;
    ref: string;
    incoming: number;
    outgoing: number;
    balance: number;
    userName: string;
}

interface ItemStock {
    id: string;
    name: string;
    code?: string;
    balance: number;
}

export default function ZoneDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const sectionId = params.id as string;

    const { 
        inventorySections, 
        stockInRecords, 
        stockOutRecords, 
        items: allItems, 
        warehouses, 
        loading 
    } = useData();

    const [filters, setFilters] = useState({ searchTerm: '', date: '' });

    const division = useMemo(() => {
        return inventorySections.find((s: any) => s.id === sectionId);
    }, [inventorySections, sectionId]);
    
    const warehouse = useMemo(() => {
        if (!division) return null;
        return warehouses.find((w: any) => w.id === division.mainWarehouseId);
    }, [division, warehouses]);

    const { transactions, currentStock } = useMemo(() => {
        if (!division || loading) return { transactions: [], currentStock: new Map<string, ItemStock>() };

        const allTransactions: any[] = [];
        const stockMap = new Map<string, ItemStock>();
        const itemIdsInSection = new Set<string>();
        
        const processAllocations = (allocations: any[] | undefined) => {
            (allocations || []).forEach((alloc: any) => {
                if (alloc.sectionId === sectionId) {
                    itemIdsInSection.add(alloc.itemId);
                    const itemName = allItems.find((i: any) => i.id === alloc.itemId)?.name || 'صنف غير معروف';
                    allTransactions.push({
                        date: new Date(alloc.date),
                        type: 'إيداع',
                        description: `تسكين من إذن دخول - ${itemName}`,
                        ref: '#', // We don't have the stock-in record id here easily
                        itemId: alloc.itemId,
                        qtyChange: alloc.quantity,
                        userName: alloc.userName || 'غير معروف'
                    });
                }
            });
        };
        
        stockInRecords.forEach((rec: any) => processAllocations(rec.allocations));
        
        stockOutRecords.forEach((rec: any) => {
            rec.items.forEach((item: any) => {
                if (item.sectionId === sectionId) {
                    itemIdsInSection.add(item.id);
                    allTransactions.push({
                        date: new Date(rec.date),
                        type: 'سحب',
                        description: `صرف لـ ${rec.reason || 'عملية غير محددة'} (إذن: ${rec.receiptNumber}) - ${item.name}`,
                        ref: getLinkForReceipt(rec.receiptNumber, rec.id),
                        itemId: item.id,
                        qtyChange: -item.qty,
                        userName: rec.createdByName || 'غير معروف'
                    });
                }
            });
        });

        allItems.filter((i:any) => itemIdsInSection.has(i.id)).forEach((itemDetails: any) => {
            stockMap.set(itemDetails.id, { id: itemDetails.id, name: itemDetails.name, code: itemDetails.code, balance: 0 });
        });

        allTransactions.sort((a,b) => a.date.getTime() - b.date.getTime());

        const finalTransactions: Transaction[] = [];
        
        allTransactions.forEach(tx => {
            const stockItem = stockMap.get(tx.itemId);
            if (stockItem) {
                const newBalance = stockItem.balance + tx.qtyChange;
                finalTransactions.push({
                    date: tx.date,
                    type: tx.type,
                    description: tx.description,
                    ref: tx.ref,
                    incoming: tx.qtyChange > 0 ? tx.qtyChange : 0,
                    outgoing: tx.qtyChange < 0 ? Math.abs(tx.qtyChange) : 0,
                    balance: newBalance,
                    userName: tx.userName
                });
                stockItem.balance = newBalance;
            }
        });

        return { 
            transactions: finalTransactions.sort((a,b) => b.date.getTime() - a.date.getTime()),
            currentStock: stockMap
        };

    }, [division, stockInRecords, stockOutRecords, allItems, loading, sectionId]);
    
    const filteredTransactions = useMemo(() => {
        return transactions.filter(tx => {
            const searchTermLower = filters.searchTerm.toLowerCase();
            const txDate = tx.date.toISOString().split('T')[0];
            const filterDate = filters.date ? new Date(filters.date).toISOString().split('T')[0] : '';
            
            const matchesSearch = !searchTermLower || tx.description.toLowerCase().includes(searchTermLower) || (tx.ref && tx.ref.toLowerCase().includes(searchTermLower));
            const matchesDate = !filterDate || txDate === filterDate;
            
            return matchesSearch && matchesDate;
        });
    }, [transactions, filters]);

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({...prev, [key]: value}));
    };

    if (loading) {
        return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>
    }

    if (!division) {
        return <PageHeader title="خطأ: القسم غير موجود" />;
    }

    return (
        <>
            <PageHeader title={`سجل حركة القسم: ${division.name}`}>
                 <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="ml-2 h-4 w-4" /> العودة للأقسام
                </Button>
            </PageHeader>
            <main className="flex-1 p-4 md:p-6 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Filter/> فلاتر البحث</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="search-term">بحث بالصنف أو البيان</Label>
                                <div className="relative">
                                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input id="search-term" placeholder="ابحث..." className="pr-9" value={filters.searchTerm} onChange={e => handleFilterChange('searchTerm', e.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="date-filter">التاريخ</Label>
                                <Input id="date-filter" type="date" value={filters.date} onChange={e => handleFilterChange('date', e.target.value)} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>الرصيد الحالي</CardTitle>
                        <CardDescription>الكميات الحالية لكل صنف داخل هذا القسم.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full overflow-auto border rounded-lg max-h-60">
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>الصنف</TableHead>
                                        <TableHead>الكود</TableHead>
                                        <TableHead className="text-center">الرصيد</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {Array.from(currentStock.values()).filter(item => item.balance > 0).length > 0 ? (
                                        Array.from(currentStock.values()).filter(item => item.balance > 0).map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell>{item.code}</TableCell>
                                            <TableCell className="text-center font-bold">{item.balance}</TableCell>
                                        </TableRow>
                                    ))
                                    ) : (
                                        <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">هذا القسم فارغ حاليًا.</TableCell></TableRow>
                                    )}
                                </TableBody>
                             </Table>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>سجل الحركات</CardTitle>
                        <CardDescription>جميع عمليات الإيداع والسحب التي تمت على هذا القسم.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full overflow-auto border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead>البيان</TableHead>
                                        <TableHead>المستخدم</TableHead>
                                        <TableHead className="text-center">وارد</TableHead>
                                        <TableHead className="text-center">صادر</TableHead>
                                        <TableHead className="text-center">الرصيد</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredTransactions.length > 0 ? filteredTransactions.map((tx, index) => (
                                        <TableRow key={index}>
                                            <TableCell>{tx.date.toLocaleString('ar-EG')}</TableCell>
                                            <TableCell>
                                                <Link href={tx.ref} className="hover:underline text-primary">
                                                    {tx.description}
                                                </Link>
                                            </TableCell>
                                            <TableCell>{tx.userName}</TableCell>
                                            <TableCell className="text-center text-green-600 font-semibold">{tx.incoming > 0 ? tx.incoming : '-'}</TableCell>
                                            <TableCell className="text-center text-destructive font-semibold">{tx.outgoing > 0 ? tx.outgoing : '-'}</TableCell>
                                            <TableCell className="text-center font-bold">{tx.balance}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">لا توجد حركات مسجلة تطابق الفلاتر.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </>
    )
}
