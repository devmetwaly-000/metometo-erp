
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ArchiveRestore, AlertTriangle } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/contexts/permissions-context";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";


export default function DeletedItemsPage() {
    const { items: allItems, dbAction, loading: dataLoading } = useData();
    const { toast } = useToast();
    const { can } = usePermissions();
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');

    const deletedItems = useMemo(() => {
        const filtered = allItems.filter((item: any) => item.isDisabled === true);
        if (searchTerm) {
            return filtered.filter((item: any) =>
                item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.code && item.code.includes(searchTerm))
            );
        }
        return filtered;
    }, [allItems, searchTerm]);

    const handleRestore = async (itemId: string) => {
        if (!can("edit", "inventory_items_deleted")) {
            toast({ variant: "destructive", title: "غير مصرح به" });
            return;
        }
        try {
            await dbAction('items', 'update', { id: itemId, data: { isDisabled: false } });
            toast({ title: "تم الاسترجاع", description: "تم استرجاع الصنف بنجاح." });
        } catch (error) {
            toast({ variant: "destructive", title: "خطأ", description: "فشل استرجاع الصنف." });
        }
    };

    const handlePermanentDelete = async (itemId: string) => {
        if (!can("delete", "inventory_items_deleted")) {
            toast({ variant: "destructive", title: "غير مصرح به" });
            return;
        }
        try {
            await dbAction('items', 'remove', { id: itemId });
            toast({ title: "تم الحذف نهائياً", description: "تم حذف الصنف بشكل نهائي." });
        } catch (error) {
            toast({ variant: "destructive", title: "خطأ", description: "فشل الحذف النهائي للصنف." });
        }
    };

    return (
        <>
            <PageHeader title="الأصناف المحذوفة" />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
                <Card>
                    <CardHeader>
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div>
                                <CardTitle>قائمة الأصناف المحذوفة</CardTitle>
                                <CardDescription>
                                    هذه قائمة بجميع الأصناف التي تم حذفها. يمكنك استرجاعها أو حذفها نهائياً.
                                </CardDescription>
                            </div>
                            <div className="w-full md:w-1/3">
                                <Input
                                    placeholder="بحث بالاسم أو الباركود..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {dataLoading ? (
                            <div className="flex justify-center items-center py-10">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="w-full overflow-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>اسم الصنف</TableHead>
                                            <TableHead>الباركود</TableHead>
                                            <TableHead className="text-center w-[150px]">الإجراءات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {deletedItems.length > 0 ? deletedItems.map((item: any) => (
                                            <TableRow key={item.id} className="bg-muted/30 text-muted-foreground">
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell className="font-mono">{item.code || 'N/A'}</TableCell>
                                                <TableCell className="text-center">
                                                    <AlertDialog>
                                                         <Button variant="ghost" size="sm" onClick={() => handleRestore(item.id)} disabled={!can("edit", "inventory_items_deleted")}>
                                                            <ArchiveRestore className="ml-2 h-4 w-4" />
                                                            استرجاع
                                                        </Button>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={!can("delete", "inventory_items_deleted")}>
                                                                حذف نهائي
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle/>هل أنت متأكد تماماً؟</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    هذا الإجراء سيحذف الصنف "{item.name}" بشكل نهائي من قاعدة البيانات. لا يمكن التراجع عن هذا الإجراء مطلقاً.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handlePermanentDelete(item.id)} className="bg-destructive hover:bg-destructive/90">
                                                                    نعم، قم بالحذف النهائي
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                             <TableRow>
                                                <TableCell colSpan={3} className="text-center py-10">
                                                    لا توجد أصناف محذوفة.
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
