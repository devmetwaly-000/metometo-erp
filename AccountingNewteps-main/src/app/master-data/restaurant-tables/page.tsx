
"use client";

import React, { useState, useMemo } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Users, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AddEntityDialog } from "@/components/add-entity-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";


interface RestaurantTable {
  id?: string;
  number: number;
  seats: number;
  groupName?: string;
  description?: string;
  status?: 'available' | 'occupied' | 'reserved';
  warehouseId: string;
}

interface HeldInvoice {
    id: string;
    tableId?: string;
    // other fields
}

const TableForm = ({ table, onSave, onClose, allTables, warehouses, selectedWarehouseId }: { table?: RestaurantTable, onSave: (data: Partial<RestaurantTable>) => void, onClose: () => void, allTables: RestaurantTable[], warehouses: any[], selectedWarehouseId?: string }) => {
  const [formData, setFormData] = React.useState<Partial<RestaurantTable>>(
    table || { number: allTables.length + 1, seats: 4, warehouseId: selectedWarehouseId || '', groupName: 'داخلي', description: '' }
  );
  const { toast } = useToast();
  
  const warehouseOptions = useMemo(() => warehouses.map(w => ({value: w.id, label: w.name})), [warehouses]);

  const handleSubmit = () => {
    if (!formData.number || !formData.seats || !formData.warehouseId) {
      toast({ variant: "destructive", title: "خطأ", description: "رقم الطاولة، عدد المقاعد، والفرع حقول مطلوبة." });
      return;
    }
    const isNumberDuplicateInWarehouse = allTables.some(t => t.number === Number(formData.number) && t.warehouseId === formData.warehouseId && t.id !== table?.id);
    if (isNumberDuplicateInWarehouse) {
       toast({ variant: "destructive", title: "خطأ", description: "رقم الطاولة مستخدم بالفعل في هذا الفرع." });
       return;
    }
    onSave({ ...table, ...formData, number: Number(formData.number), seats: Number(formData.seats) });
    onClose();
  };

  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="table-warehouse" className="text-right">الفرع</Label>
        <div className="col-span-3">
          <Combobox
              options={warehouseOptions}
              value={formData.warehouseId || ''}
              onValueChange={(value) => setFormData({...formData, warehouseId: value})}
              placeholder="اختر الفرع..."
              emptyMessage="لا يوجد فروع."
              disabled={!!table} // Disable if editing
          />
        </div>
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="table-number" className="text-right">رقم الطاولة</Label>
        <Input id="table-number" type="number" value={formData.number} onChange={(e) => setFormData({...formData, number: Number(e.target.value)})} className="col-span-3" />
      </div>
       <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="table-group" className="text-right">المجموعة</Label>
        <Input id="table-group" value={formData.groupName} onChange={(e) => setFormData({...formData, groupName: e.target.value})} className="col-span-3" placeholder="مثال: داخلي، خارجي، حديقة" />
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="table-seats" className="text-right">عدد المقاعد</Label>
        <Input id="table-seats" type="number" value={formData.seats} onChange={(e) => setFormData({...formData, seats: Number(e.target.value)})} className="col-span-3" />
      </div>
       <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="table-description" className="text-right">الوصف</Label>
        <Textarea id="table-description" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="col-span-3" placeholder="مثال: بجوار النافذة" />
      </div>
      <div className="flex justify-end pt-4">
        <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </div>
  );
};


export default function ManageTablesPage() {
  const { restaurantTables, heldInvoices, dbAction, loading, warehouses } = useData();
  const { toast } = useToast();
  const { user } = useAuth();
  const [filterWarehouseId, setFilterWarehouseId] = useState('all');
  
  const branches = useMemo(() => warehouses.filter((w: any) => !w.isMain && !w.isRepWarehouse), [warehouses]);
  
  const warehouseOptions = useMemo(() => ([
    {value: 'all', label: 'كل الفروع'},
    ...branches.map((w: any) => ({value: w.id, label: w.name}))
  ]), [branches]);


  const handleSave = async (data: Partial<RestaurantTable>) => {
    try {
      if (data.id) {
        await dbAction('restaurantTables', 'update', { id: data.id, data: { number: data.number, seats: data.seats, groupName: data.groupName, description: data.description } });
        toast({ title: "تم التحديث بنجاح" });
      } else {
        await dbAction('restaurantTables', 'add', { ...data, status: 'available' });
        toast({ title: "تمت إضافة الطاولة بنجاح" });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ الطاولة." });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dbAction('restaurantTables', 'remove', { id });
      toast({ title: "تم الحذف بنجاح" });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف الطاولة." });
    }
  };
  
  const handleCancelOrder = async (table: RestaurantTable) => {
      const heldInvoice = heldInvoices.find((inv: HeldInvoice) => inv.tableId === table.id);
      if (!heldInvoice) {
          toast({ variant: "destructive", title: "خطأ", description: "لا يوجد طلب معلق لهذه الطاولة." });
          return;
      }
      
      try {
           // Log the cancellation
          await dbAction('posAuditLogs', 'add', {
              date: new Date().toISOString(),
              cashierId: user?.id,
              cashierName: user?.name,
              action: 'INVOICE_CANCELLED',
              details: {
                  invoiceNumber: `معلق - ${(heldInvoice as any).orderReference || (heldInvoice as any).tableName || heldInvoice.id}`,
                  items: (heldInvoice as any).cart,
                  total: heldInvoice.total,
              }
          });

          // Delete the held invoice
          await dbAction('heldInvoices', 'remove', { id: heldInvoice.id });

          toast({ title: 'تم الإلغاء', description: `تم إلغاء الطلب الخاص بالطاولة ${table.number}.` });
      } catch (error) {
           toast({ variant: "destructive", title: "خطأ", description: "فشل إلغاء الطلب." });
      }
  };


  const tablesWithStatus = useMemo(() => {
    if (!restaurantTables || !heldInvoices) return [];
    const heldTableIds = new Set(heldInvoices.map((inv: HeldInvoice) => inv.tableId));
    
    return restaurantTables
        .filter((table: RestaurantTable) => filterWarehouseId === 'all' || table.warehouseId === filterWarehouseId)
        .map((table: RestaurantTable) => {
        const isOccupied = heldTableIds.has(table.id);
        return {
            ...table,
            status: isOccupied ? 'occupied' : 'available',
            warehouseName: warehouses.find((w:any) => w.id === table.warehouseId)?.name || 'غير محدد'
        };
    }).sort((a, b) => a.number - b.number);
  }, [restaurantTables, heldInvoices, filterWarehouseId, warehouses]);

  return (
    <>
      <PageHeader title="إدارة الطاولات">
        {filterWarehouseId !== 'all' && (
            <AddEntityDialog
                title="إضافة طاولة جديدة"
                description="أدخل تفاصيل الطاولة الجديدة."
                triggerButton={
                    <Button size="sm" className="gap-1">
                    <PlusCircle className="h-4 w-4" />
                    إضافة طاولة
                    </Button>
                }
            >
                {({onClose}) => <TableForm onSave={handleSave} onClose={onClose} allTables={restaurantTables} warehouses={branches} selectedWarehouseId={filterWarehouseId} />}
            </AddEntityDialog>
        )}
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>قائمة الطاولات</CardTitle>
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <CardDescription>
                عرض وتعديل جميع الطاولات في المطعم أو المقهى.
              </CardDescription>
              <div className="max-w-xs w-full">
                <Combobox
                    options={warehouseOptions}
                    value={filterWarehouseId}
                    onValueChange={setFilterWarehouseId}
                    placeholder="عرض كل الفروع"
                    emptyMessage="لا يوجد فروع."
                />
              </div>
            </div>
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
                                <TableHead>الفرع</TableHead>
                                <TableHead>رقم الطاولة</TableHead>
                                <TableHead>المجموعة</TableHead>
                                <TableHead className="text-center">عدد المقاعد</TableHead>
                                <TableHead className="text-center">الحالة</TableHead>
                                <TableHead className="text-center w-[100px]">
                                    <span className="sr-only">الإجراءات</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tablesWithStatus.map((table: any) => (
                                <TableRow key={table.id}>
                                    <TableCell>{table.warehouseName}</TableCell>
                                    <TableCell>
                                        <div className="font-bold">{table.number}</div>
                                        <div className="text-xs text-muted-foreground">{table.description}</div>
                                    </TableCell>
                                    <TableCell>{table.groupName || '-'}</TableCell>
                                    <TableCell className="text-center">{table.seats}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={table.status === 'occupied' ? 'destructive' : 'default'}>
                                            {table.status === 'occupied' ? 'مشغولة' : 'متاحة'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <AlertDialog>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                <Button aria-haspopup="true" size="icon" variant="ghost">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
                                                    <AddEntityDialog
                                                        title="تعديل الطاولة"
                                                        description="قم بتحديث تفاصيل الطاولة."
                                                        triggerButton={
                                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                            <Edit className="ml-2 h-4 w-4" />
                                                            تعديل
                                                            </DropdownMenuItem>
                                                        }
                                                    >
                                                        {({onClose}) => <TableForm table={table} onSave={handleSave} onClose={onClose} allTables={restaurantTables} warehouses={branches}/>}
                                                    </AddEntityDialog>
                                                    {table.status === 'occupied' && (
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem onSelect={(e: any) => e.preventDefault()} className="text-destructive">
                                                                <XCircle className="ml-2 h-4 w-4"/>
                                                                إلغاء الحجز
                                                            </DropdownMenuItem>
                                                        </AlertDialogTrigger>
                                                    )}
                                                    <DropdownMenuSeparator />
                                                     <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}>
                                                            <Trash2 className="ml-2 h-4 w-4" />
                                                            حذف الطاولة
                                                        </DropdownMenuItem>
                                                    </AlertDialogTrigger>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            {table.status === 'occupied' ? (
                                                 <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>إلغاء حجز الطاولة؟</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            سيتم حذف الطلب المعلق على الطاولة "{table.number}" وستصبح متاحة مرة أخرى.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>تراجع</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleCancelOrder(table)}>نعم، قم بالإلغاء</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            ) : (
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            هذا الإجراء سيحذف الطاولة بشكل دائم. لا يمكن التراجع عن هذا الإجراء.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDelete(table.id!)}>متابعة</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            )}
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            ))}
                             {tablesWithStatus.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground p-6">
                                        {filterWarehouseId === 'all' ? 'لا توجد طاولات مسجلة.' : 'لا توجد طاولات في هذا الفرع.'}
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
