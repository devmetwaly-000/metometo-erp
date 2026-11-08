

"use client";

import React from 'react';
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
import { PlusCircle, Loader2, MoreHorizontal, FileText, Undo2 } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PurchaseReturn {
  id: string;
  date: string;
  supplierId: string;
  total: number;
  items: any[];
}
interface Supplier {
    id: string;
    name: string;
}

export default function PurchaseReturnsListPage() {
  const { purchaseReturns: returns, suppliers, loading } = useData();
  const router = useRouter();

  const getSupplierName = (supplierId: string) => {
    return suppliers.find((s: any) => s.id === supplierId)?.name || 'غير معروف';
  }

  return (
    <>
      <PageHeader title="مرتجعات المشتريات">
        <Button size="sm" className="gap-1" onClick={() => router.push('/purchases/returns/new')}>
          <PlusCircle className="h-4 w-4" />
          إضافة مرتجع جديد
        </Button>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>قائمة مرتجعات المشتريات</CardTitle>
            <CardDescription>
              عرض وتعديل جميع مرتجعات المشتريات المسجلة.
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
                      <TableHead>رقم المرتجع</TableHead>
                      <TableHead>المورد</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>ملاحظات</TableHead>
                      <TableHead className="text-center">الإجمالي</TableHead>
                      <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returns.length > 0 ? (
                      returns.map((preturn: any) => (
                        <TableRow key={preturn.id}>
                          <TableCell className="font-mono">{preturn.id.slice(-6).toUpperCase()}</TableCell>
                          <TableCell>{getSupplierName(preturn.supplierId)}</TableCell>
                          <TableCell>{new Date(preturn.date).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <FileText className="h-4 w-4" />
                              <span>{`تحتوي على ${preturn.items.length} أصناف`}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-center">{preturn.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-center">
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button aria-haspopup="true" size="icon" variant="ghost">
                                        <MoreHorizontal className="h-4 w-4" />
                                        <span className="sr-only">قائمة</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                    <DropdownMenuItem>
                                        عرض التفاصيل
                                    </DropdownMenuItem>
                                     <DropdownMenuItem>
                                        طباعة
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          لا توجد مرتجعات مسجلة بعد.
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
