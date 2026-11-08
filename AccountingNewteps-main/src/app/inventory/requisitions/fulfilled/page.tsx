
"use client";

import React, { useState, useMemo } from "react";
import PageHeader from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoreHorizontal, PlusCircle, Loader2, Eye, Truck, ArrowLeft } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Requisition {
  id: string;
  requisitionNumber?: string;
  requesterName: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  date: string;
  items: {
    itemId: string;
    name: string;
    quantity: number;
    code?: string;
  }[];
  status: 'pending' | 'fulfilled' | 'rejected';
}

const FulfilledItemsDialog = ({ requisition, allItems }: { requisition: Requisition | null, allItems: any[] }) => {
    if (!requisition) return null;

    const itemsWithDetails = requisition.items.map(item => {
        const masterItem = allItems.find(i => i.id === item.itemId);
        return {
            ...item,
            code: masterItem?.code || 'N/A'
        }
    });
    
    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>الأصناف في الطلب رقم: {requisition.requisitionNumber || requisition.id.slice(-6)}</DialogTitle>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
                <Table>
                    <TableHeader><TableRow><TableHead>الصنف</TableHead><TableHead>الباركود</TableHead><TableHead className="text-center">الكمية المطلوبة</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {itemsWithDetails.map((item, idx) => (
                            <TableRow key={idx}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell className="font-mono">{item.code}</TableCell>
                                <TableCell className="text-center">{item.quantity}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </DialogContent>
    );
};


export default function FulfilledRequisitionsPage() {
  const { requisitions, warehouses, items, loading } = useData();
  const router = useRouter();
  const [selectedRequisition, setSelectedRequisition] = useState<Requisition | null>(null);

  const fulfilledRequisitions = useMemo(() => {
    if (loading) return [];
    return requisitions
        .filter((req: Requisition) => req.status === 'fulfilled')
        .map((req: Requisition) => {
            const fromWarehouse = warehouses.find((w: any) => w.id === req.fromWarehouseId); // Requester
            const toWarehouse = warehouses.find((w: any) => w.id === req.toWarehouseId); // Source
            return {
                ...req,
                fromWarehouseName: fromWarehouse?.name || 'فرع غير معروف',
                requesterIsMain: fromWarehouse?.isMain || false,
                toWarehouseName: toWarehouse?.name || 'مخزن غير معروف',
            }
        })
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [requisitions, warehouses, loading]);

  return (
    <>
      <PageHeader title="سجل الطلبات المنفذة" />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
       <Dialog onOpenChange={(open) => !open && setSelectedRequisition(null)}>
        <Card>
          <CardHeader>
            <CardTitle>سجل الطلبات</CardTitle>
            <CardDescription>
                عرض لجميع طلبات البضاعة التي تم تحضيرها وصرفها من المخازن الرئيسية.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم الطلب</TableHead>
                      <TableHead>تفاصيل التحويل</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead className="text-center">عدد الأصناف</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-center w-[150px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fulfilledRequisitions.length > 0 ? (
                      fulfilledRequisitions.map((req: any) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-mono">{req.requisitionNumber || req.id.slice(-6)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                                <span className="font-medium flex items-center gap-1">من: {req.toWarehouseName}</span>
                                <span className="text-sm text-muted-foreground flex items-center gap-1"><ArrowLeft className="h-3 w-3"/>إلى: {req.fromWarehouseName}</span>
                                <span className="text-xs text-muted-foreground">بواسطة: {req.requesterName}</span>
                            </div>
                          </TableCell>
                          <TableCell>{new Date(req.date).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell className="text-center">{req.items.length}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="default" className="bg-green-600">تم التنفيذ</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                             <div className='flex justify-center items-center gap-2'>
                                <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => setSelectedRequisition(req)}>
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                </DialogTrigger>
                             </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          لا توجد طلبات منفذة بعد.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        <FulfilledItemsDialog requisition={selectedRequisition} allItems={items} />
        </Dialog>
      </main>
    </>
  );
}
