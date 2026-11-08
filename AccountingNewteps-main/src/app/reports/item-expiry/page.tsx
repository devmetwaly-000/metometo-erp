"use client";

import React, { useState, useMemo } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { Loader2 } from "lucide-react";
import { Combobox } from '@/components/ui/combobox';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';

interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  warehouseId: string;
  items: {
    id: string;
    name: string;
    qty: number;
    expiryDate?: string;
  }[];
}

interface Warehouse {
  id: string;
  name: string;
}

export default function ItemExpiryReportPage() {
  const { purchaseInvoices, warehouses, loading, inventory } = useData();
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [warehouseId, setWarehouseId] = useState(user?.warehouseIds?.length === 1 ? user.warehouseIds[0] : 'all');

  const reportData = useMemo(() => {
    if (loading) return [];

    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(now.getDate() + days);

    // 1. Build Inventory Map for O(1) access
    // Map<WarehouseID, Map<ItemID, Quantity>>
    const inventoryMap = new Map<string, Map<string, number>>();
    
    if (inventory) {
        inventory.forEach((inv: any) => {
            // ID format: warehouseId-sectionId
            // But sometimes warehouseId might contain dashes? Assuming standard format.
            // Better to use a simpler approach if structure is known.
            // Assuming inv.id is `${warehouseId}-${sectionId}`
            // We can just loop all sections and sum up.
            
            // To reliably get warehouseId, we might need to look up section?
            // But let's assume the splitting works as per original code implication.
            const firstDashIndex = inv.id.indexOf('-');
            if (firstDashIndex === -1) return;
            
            const wId = inv.id.substring(0, firstDashIndex);
            
            if (!inventoryMap.has(wId)) {
                inventoryMap.set(wId, new Map());
            }
            const wMap = inventoryMap.get(wId)!;
            
            if (inv.items) {
                Object.entries(inv.items).forEach(([itemId, itemData]: [string, any]) => {
                    const current = wMap.get(itemId) || 0;
                    wMap.set(itemId, current + (itemData.balance || 0));
                });
            }
        });
    }

    const expiringItems: any[] = [];

    purchaseInvoices.forEach((invoice: PurchaseInvoice) => {
      if (warehouseId !== 'all' && invoice.warehouseId !== warehouseId) {
        return;
      }
      
      const wMap = inventoryMap.get(invoice.warehouseId);

      invoice.items.forEach(item => {
        if (item.expiryDate) {
          const expiry = new Date(item.expiryDate);
          // Check if expiry is within threshold (or already expired)
          if (expiry <= thresholdDate) {
            const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            
            const currentStock = wMap?.get(item.id) || 0;
            
            // Only show items that are currently in stock
            if (currentStock > 0) {
                expiringItems.push({
                ...item,
                warehouseName: warehouses.find((w: Warehouse) => w.id === invoice.warehouseId)?.name || 'غير محدد',
                invoiceNumber: invoice.invoiceNumber,
                daysRemaining,
                isExpired: daysRemaining < 0,
                currentStock
                });
            }
          }
        }
      });
    });

    return expiringItems.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [purchaseInvoices, warehouses, days, warehouseId, loading, inventory]);
  
  const warehouseOptions = useMemo(() => {
    const options = [
        { value: 'all', label: 'كل الفروع' },
        ...warehouses.map((w: any) => ({ value: w.id, label: w.name }))
    ];
    if (user?.warehouseIds?.includes('all')) return options;
    return options.filter(w => w.value !== 'all' && user?.warehouseIds?.includes(w.value));
  }, [warehouses, user]);


  return (
    <>
      <PageHeader title="تقرير الأصناف قرب انتهاء الصلاحية" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>فلاتر البحث</CardTitle>
            <CardDescription>
              حدد المخزن وعدد الأيام المتبقية لعرض الأصناف التي ستنتهي صلاحيتها قريبًا أو انتهت بالفعل.
              <br/>
              <span className="text-xs text-muted-foreground text-amber-600 font-semibold">
                تنبيه: هذا التقرير يعتمد على تواريخ الصلاحية في فواتير الشراء. عمود "الرصيد الحالي" يوضح المخزون الفعلي المتاح الآن بغض النظر عن تاريخ الصلاحية.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>المخزن</Label>
                <Combobox
                  options={warehouseOptions}
                  value={warehouseId}
                  onValueChange={setWarehouseId}
                  placeholder="اختر الفرع..."
                  emptyMessage="لم يتم العثور على فرع."
                  disabled={user?.warehouseIds?.length === 1 && !user.warehouseIds.includes('all')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="days-until-expiry">الأصناف التي تنتهي خلال (يوم)</Label>
                <Input
                  id="days-until-expiry"
                  type="number"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  placeholder="e.g., 30"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>نتائج التقرير</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="w-full flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الصنف</TableHead>
                      <TableHead>المخزن</TableHead>
                      <TableHead>فاتورة الشراء</TableHead>
                      <TableHead className="text-center">تاريخ الصلاحية</TableHead>
                      <TableHead className="text-center">الأيام المتبقية</TableHead>
                      <TableHead className="text-center">الكمية المشتراة</TableHead>
                      <TableHead className="text-center">الرصيد الحالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.length > 0 ? reportData.map((item, index) => (
                      <TableRow key={`${item.id}-${index}`} className={item.daysRemaining < 7 ? 'bg-destructive/10' : item.daysRemaining < 30 ? 'bg-amber-500/10' : ''}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.warehouseName}</TableCell>
                        <TableCell className="font-mono">
                            <Link href={`/purchases/invoices/list`} className="hover:underline text-primary">
                                {item.invoiceNumber}
                            </Link>
                        </TableCell>
                        <TableCell className="text-center">{new Date(item.expiryDate).toLocaleDateString('ar-EG')}</TableCell>
                        <TableCell className="text-center font-bold">
                            {item.isExpired ? (
                                <span className="text-destructive">منتهي منذ {Math.abs(item.daysRemaining)} يوم</span>
                            ) : (
                                <span>{item.daysRemaining} يوم</span>
                            )}
                        </TableCell>
                        <TableCell className="text-center">{item.qty}</TableCell>
                        <TableCell className="text-center font-semibold">{item.currentStock}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                          لا توجد أصناف تنتهي صلاحيتها خلال الفترة المحددة.
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
