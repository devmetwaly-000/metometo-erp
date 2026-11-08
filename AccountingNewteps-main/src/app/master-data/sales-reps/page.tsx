

"use client";

import React from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useData } from "@/contexts/data-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'next/navigation';

interface User {
  id?: string;
  name: string;
  phone: string;
  warehouse: string;
  isSalesRep?: boolean;
}

interface Warehouse {
  id: string;
  name: string;
}

export default function SalesRepsPage() {
    const { users, warehouses, loading } = useData();
    const { toast } = useToast();
    const router = useRouter();

    const salesReps = users.filter((user: any) => user.isSalesRep || user.role === 'مندوب' || (user.role && user.role.includes('مندوب')));

    const getWarehouseName = (rep: any) => {
        if (!rep) return 'غير محدد';
        if (rep.warehouseIds && rep.warehouseIds.includes('all')) return 'كافة الفروع والمخازن';
        const targetId = rep.warehouse || (rep.warehouseIds && rep.warehouseIds[0]);
        return warehouses.find((w: any) => w.id === targetId)?.name || 'الرئيسي';
    };
    
  return (
    <>
      <PageHeader title="مناديب المبيعات">
        <Button size="sm" className="gap-1" onClick={() => router.push('/users')}>
          <PlusCircle className="h-4 w-4" />
          إدارة المستخدمين والمناديب
        </Button>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>قائمة مناديب المبيعات</CardTitle>
            <CardDescription>
              عرض جميع المستخدمين الذين تم تحديدهم كمناديب مبيعات. لإضافة أو تعديل مندوب، يرجى الذهاب إلى شاشة "المستخدمين".
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
                                <TableHead>اسم المندوب</TableHead>
                                <TableHead>رقم الهاتف</TableHead>
                                <TableHead>المخزن المرتبط</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {salesReps.map((rep: any) => (
                                <TableRow key={rep.id}>
                                    <TableCell className="font-medium">{rep.name}</TableCell>
                                    <TableCell>{rep.phone}</TableCell>
                                    <TableCell>{getWarehouseName(rep)}</TableCell>
                                </TableRow>
                            ))}
                             {salesReps.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                                        لا يوجد مناديب مبيعات. يمكنك تحديدهم من شاشة المستخدمين.
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
