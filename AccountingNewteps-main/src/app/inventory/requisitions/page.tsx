

"use client";

import React, { useState, useMemo } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
import { MoreHorizontal, PlusCircle, Loader2, Truck } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";


interface Requisition {
  id: string;
  requisitionNumber?: string;
  requesterName: string;
  fromWarehouseId: string; // Requester
  toWarehouseId: string; // Source
  date: string;
  items: {
    itemId: string;
    name: string;
    quantity: number;
    cost?: number;
  }[];
  status: 'pending' | 'fulfilled' | 'rejected';
}

export default function RequisitionsListPage() {
  const { requisitions, warehouses, dbAction, getNextId, loading } = useData();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const requisitionsWithDetails = useMemo(() => {
    if (loading) return [];
    return requisitions
        .map((req: Requisition) => {
            const fromWarehouse = warehouses.find((w: any) => w.id === req.fromWarehouseId);
            const toWarehouse = warehouses.find((w: any) => w.id === req.toWarehouseId);
            return {
                ...req,
                fromWarehouseName: fromWarehouse?.name || 'فرع غير معروف',
                isRequesterMain: fromWarehouse?.isMain || false, // <<< THIS IS THE KEY
                toWarehouseName: toWarehouse?.name || 'مخزن غير معروف',
            }
        })
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [requisitions, warehouses, loading]);
  
  const handlePutAway = async (req: Requisition) => {
      setIsProcessing(req.id);
      try {
          const newStockInRecord = {
              warehouseId: req.fromWarehouseId,
              fromWarehouseId: req.toWarehouseId,
              date: new Date().toISOString(),
              items: req.items.map(i => ({ itemId: i.itemId, name: i.name, qty: i.quantity, cost: i.cost || 0 })),
              reason: 'requisition',
              notes: `وارد بناءً على طلب بضاعة رقم ${req.requisitionNumber}`,
              receiptNumber: `إذ-د-${await getNextId('stockIn')}`,
              createdById: user?.id,
              createdByName: user?.name,
              requisitionId: req.id,
              status: 'pending_putaway', // New status for main warehouses
          };

          const newStockInId = await dbAction('stockInRecords', 'add', newStockInRecord);
          if (newStockInId) {
              router.push(`/inventory/stock-in?stockInId=${newStockInId}`);
          } else {
              throw new Error("Failed to create stock-in record.");
          }

      } catch (error) {
          toast({ variant: "destructive", title: "خطأ", description: "فشل إنشاء إذن دخول للتسكين." });
          console.error(error);
      } finally {
          setIsProcessing(null);
      }
  };


  const getStatusBadge = (status: Requisition['status']) => {
      switch(status) {
          case 'pending':
              return <Badge variant="outline" className="border-amber-500 text-amber-500">قيد التنفيذ</Badge>;
          case 'fulfilled':
              return <Badge variant="default" className="bg-green-600">تم التنفيذ</Badge>;
          case 'rejected':
              return <Badge variant="destructive">مرفوض</Badge>;
          default:
              return <Badge variant="secondary">{status}</Badge>;
      }
  }


  return (
    <>
      <PageHeader title="طلبات البضاعة">
        <Button size="sm" className="gap-1" onClick={() => router.push('/inventory/requisitions/new')}>
          <PlusCircle className="h-4 w-4" />
          إنشاء طلب جديد
        </Button>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>سجل الطلبات</CardTitle>
            <CardDescription>
                عرض لجميع طلبات البضاعة المقدمة من الفروع وحالتها.
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
                      <TableHead>الفرع الطالب</TableHead>
                      <TableHead>المستخدم</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead className="text-center">عدد الأصناف</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-center w-[150px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requisitionsWithDetails.length > 0 ? (
                      requisitionsWithDetails.map((req: any) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-medium">{req.fromWarehouseName}</TableCell>
                          <TableCell>{req.requesterName}</TableCell>
                          <TableCell>{new Date(req.date).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell className="text-center">{req.items.length}</TableCell>
                          <TableCell className="text-center">{getStatusBadge(req.status)}</TableCell>
                          <TableCell className="text-center">
                             <div className='flex justify-center items-center gap-2'>
                                {req.status === 'fulfilled' && req.isRequesterMain && (
                                    <Button variant="outline" size="sm" onClick={() => handlePutAway(req)} disabled={isProcessing === req.id}>
                                        {isProcessing === req.id ? <Loader2 className="animate-spin ml-2 h-4 w-4"/> : <Truck className="ml-2 h-4 w-4" />}
                                        تسكين
                                    </Button>
                                )}
                             </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          لا توجد طلبات مسجلة بعد.
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
