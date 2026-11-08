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
import { PlusCircle, Loader2, MoreHorizontal, FileText, User } from "lucide-react";
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useData } from '@/contexts/data-provider';

interface IssueToRep {
  id: string;
  receiptNumber: string;
  date: string;
  salesRepId: string;
  items: { name: string; qty: number; total: number }[];
}

interface SalesRep {
    id: string;
    name: string;
}

export default function IssueToRepListPage() {
  const { stockIssuesToReps: issues, users: reps, loading: loadingIssues } = useData();
  const router = useRouter();

  const loading = loadingIssues;

  const getRepName = (repId: string) => {
    return reps.find((r: any) => r.id === repId)?.name || 'غير معروف';
  };
  
  const getIssueTotal = (items: {total: number}[]) => {
      if (!items) return 0;
      return items.reduce((sum, item) => sum + (item.total || 0), 0);
  }
  
  const sortedIssues = [...issues].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());


  return (
    <>
      <PageHeader title="سجل صرف البضاعة للمناديب">
        <Button size="sm" className="gap-1" onClick={() => router.push('/sales/issue-to-rep/new')}>
          <PlusCircle className="h-4 w-4" />
          إضافة إذن صرف جديد
        </Button>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>قائمة أذونات الصرف</CardTitle>
            <CardDescription>
              عرض جميع أذونات صرف البضاعة لعهدة المناديب.
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
                      <TableHead>رقم الإذن</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>المندوب</TableHead>
                      <TableHead>ملاحظات</TableHead>
                      <TableHead className="text-center">إجمالي القيمة</TableHead>
                      <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedIssues.length > 0 ? (
                      sortedIssues.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono">{record.receiptNumber}</TableCell>
                          <TableCell>{new Date(record.date).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{getRepName(record.salesRepId)}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <FileText className="h-4 w-4" />
                              <span>{`تحتوي على ${record.items.length} أصناف`}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-semibold">{getIssueTotal(record.items).toLocaleString()} ج.م</TableCell>
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
                                    <DropdownMenuItem onClick={() => router.push(`/sales/issue-to-rep/${record.id}`)}>
                                        عرض / طباعة
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          لا توجد أذونات صرف مسجلة.
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
