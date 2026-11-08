
"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MoreVertical, Users, Eye, Printer, XCircle, Loader2, DollarSign, Clock, FileText, LayoutDashboard } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent as UIDialogContent, DialogHeader as UIDialogHeader, DialogTitle as UIDialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PosReceipt } from "@/components/pos-receipt";
import { renderToString } from "react-dom/server";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { Combobox } from "@/components/ui/combobox";


interface RestaurantTable {
  id: string;
  number: number;
  seats: number;
  groupName?: string;
  description?: string;
  status: 'available' | 'occupied' | 'reserved';
  warehouseId: string;
}

interface HeldInvoice {
    id: string;
    heldAt: string;
    cashierName: string;
    itemCount: number;
    total: number;
    cart: any[];
    discount: number;
    orderReference?: string;
    tableId?: string;
    tableName?: string;
}


const TableItemsDialog = ({ table, heldInvoice, onOpenChange }: { table: RestaurantTable | null, heldInvoice: HeldInvoice | null, onOpenChange: (open: boolean) => void }) => {
    if (!table) return null;
    
    return (
        <UIDialogContent>
            <UIDialogHeader>
                <UIDialogTitle>الأصناف على طاولة: {table.number}</UIDialogTitle>
            </UIDialogHeader>
            <div className="max-h-96 overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>الصنف</TableHead>
                            <TableHead className="text-center">الكمية</TableHead>
                            <TableHead className="text-center">الإجمالي</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {heldInvoice && heldInvoice.cart.length > 0 ? (
                            heldInvoice.cart.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell className="text-center">{item.qty}</TableCell>
                                    <TableCell className="text-center">{item.total.toLocaleString()}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground p-4">لا توجد أصناف حاليًا.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </UIDialogContent>
    );
};


export default function TablesPage() {
  const router = useRouter();
  const { restaurantTables, heldInvoices, settings, dbAction, loading, warehouses } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('all');
  const [selectedTableForDetails, setSelectedTableForDetails] = useState<{table: RestaurantTable, heldInvoice: HeldInvoice | null} | null>(null);


  useEffect(() => {
    if (user?.warehouseIds && user.warehouseIds.length === 1 && user.warehouseIds[0] !== 'all') {
      setSelectedWarehouseId(user.warehouseIds[0]);
    }
  }, [user]);

  
  const companySettings = useMemo(() => settings?.main?.general || {}, [settings]);
  
  const receiptDesign = useMemo(() => {
      const warehouseSpecificDesign = settings?.main?.posReceipts?.[selectedWarehouseId];
      return warehouseSpecificDesign || settings?.main?.posReceipts?.defaultReceiptDesign || {};
  }, [settings, selectedWarehouseId]);

  const handleTableClick = (table: RestaurantTable) => {
    router.push(`/pos?tableId=${table.id}`);
  };

  const handlePrintCheck = (heldInvoice: HeldInvoice | null) => {
    if (!heldInvoice) {
        toast({ variant: 'destructive', title: 'خطأ', description: 'لا توجد أصناف لطباعة الشيك.' });
        return;
    }
    const receiptContent = (
        <PosReceipt 
            invoice={{ ...heldInvoice, isCheck: true }} 
            company={companySettings} 
            design={receiptDesign} 
        />
    );
    
    const receiptHtml = renderToString(receiptContent);

    const printWindow = window.open('', '_blank', 'height=600,width=800');
    if (printWindow) {
        printWindow.document.write(`
            <html>
                <head>
                    <title>طباعة الشيك</title>
                    <style>
                        @media print { 
                            @page { size: auto; margin: 0; } 
                            body { margin: 0; } 
                        }
                        body { direction: rtl; }
                    </style>
                </head>
                <body>${receiptHtml}</body>
            </html>
        `);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            printWindow.close();
        }, 500);
    }
  };
  
    const handleCancelOrder = async (table: any) => {
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


  const groupedTables = useMemo(() => {
    if (!restaurantTables || !heldInvoices) return {};

    const heldTableIds = new Set(heldInvoices.map((inv: HeldInvoice) => inv.tableId));
    
    const tables = restaurantTables
        .filter((table: RestaurantTable) => selectedWarehouseId === 'all' || table.warehouseId === selectedWarehouseId)
        .map((table: RestaurantTable) => {
            const isOccupied = heldTableIds.has(table.id);
            const status = isOccupied ? 'occupied' : 'available';
            return {
                ...table,
                status: status as 'available' | 'occupied' | 'reserved',
            };
    }).sort((a,b) => a.number - b.number);
    
    // Group by groupName
    return tables.reduce((acc, table) => {
        const group = table.groupName || 'غير مصنف';
        if (!acc[group]) {
            acc[group] = [];
        }
        acc[group].push(table);
        return acc;
    }, {} as Record<string, RestaurantTable[]>);

  }, [restaurantTables, heldInvoices, selectedWarehouseId]);

  const warehouseOptions = useMemo(() => ([
    {value: 'all', label: 'كل الفروع'},
    ...warehouses.map((w: any) => ({value: w.id, label: w.name}))
  ]), [warehouses]);


  return (
    <>
      <PageHeader title="اختر الفرع">
        <div className="w-full md:w-auto">
            <h3 className="text-sm font-medium mb-1">عرض طاولات فرع</h3>
             <Combobox
                options={warehouseOptions}
                value={selectedWarehouseId}
                onValueChange={setSelectedWarehouseId}
                placeholder="عرض كل الفروع"
                emptyMessage="لا يوجد فروع."
                disabled={!!(user && user.warehouseIds && user.warehouseIds.length === 1 && user.warehouseIds[0] !== 'all')}
                className="w-full md:w-[200px]"
            />
        </div>
      </PageHeader>
      <main className="flex-1 p-4 md:p-6 space-y-8">
        {loading ? (
            <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        ) : (
            <Dialog onOpenChange={(open) => !open && setSelectedTableForDetails(null)}>
                 <div className="space-y-8">
                    {Object.keys(groupedTables).length > 0 ? Object.entries(groupedTables).map(([groupName, tables]) => (
                        <div key={groupName}>
                            <h2 className="text-xl font-bold mb-4 border-b pb-2">{groupName} ({tables.length})</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                {tables.map((table: RestaurantTable) => {
                                    const isOccupied = table.status === 'occupied';
                                    const heldInvoice = isOccupied ? heldInvoices.find((inv: HeldInvoice) => inv.tableId === table.id) || null : null;
                                    return (
                                        <div key={table.id} className="group relative">
                                            <Card 
                                                className={cn(`flex flex-col justify-between overflow-hidden transition-all cursor-pointer h-40`,
                                                    isOccupied 
                                                    ? 'bg-red-500/10 dark:bg-red-900/40 border-red-500/50 hover:shadow-lg hover:shadow-red-500/10 hover:border-red-500' 
                                                    : 'bg-green-500/5 dark:bg-green-900/20 border-green-500/30 hover:shadow-lg hover:shadow-green-500/10 hover:border-green-500'
                                                )}
                                                onClick={() => handleTableClick(table)}
                                            >
                                                <CardHeader className="p-3 pb-0 text-center flex-1 justify-center items-center flex flex-col">
                                                    <LayoutDashboard className="w-12 h-12 text-muted-foreground/50"/>
                                                    <CardTitle className="text-2xl font-bold text-foreground/80">طاولة {table.number}</CardTitle>
                                                </CardHeader>
                                                <CardFooter className="p-2 bg-black/5 dark:bg-black/10 flex justify-center">
                                                    {isOccupied && heldInvoice ? (
                                                        <div className="w-full flex justify-between items-center text-xs text-muted-foreground">
                                                             <div className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                <span>{new Date(heldInvoice.heldAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 font-bold text-foreground">
                                                                <DollarSign className="h-3 w-3"/>
                                                                <span>{heldInvoice.total.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                         <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                                            <Users className="h-4 w-4"/>
                                                            <span>{table.seats} مقاعد</span>
                                                        </div>
                                                    )}
                                                </CardFooter>
                                            </Card>
                                             {isOccupied && (
                                                <div className="absolute top-2 left-2 rtl:left-auto rtl:right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                     <AlertDialog>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                            <Button aria-haspopup="true" size="icon" variant="secondary" className="h-8 w-8 rounded-full">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>إجراءات الطاولة</DropdownMenuLabel>
                                                                 <DialogTrigger asChild>
                                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSelectedTableForDetails({table, heldInvoice}); }}>
                                                                        <Eye className="ml-2 h-4 w-4" /> عرض الطلب
                                                                    </DropdownMenuItem>
                                                                </DialogTrigger>
                                                                <DropdownMenuItem onClick={() => handlePrintCheck(heldInvoice)}>
                                                                    <Printer className="ml-2 h-4 w-4" /> طباعة الشيك
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator/>
                                                                <AlertDialogTrigger asChild>
                                                                    <DropdownMenuItem className="text-destructive" onSelect={(e: any) => e.preventDefault()}>
                                                                        <XCircle className="ml-2 h-4 w-4"/> إلغاء الطلب
                                                                    </DropdownMenuItem>
                                                                </AlertDialogTrigger>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>إلغاء الطلب؟</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    سيتم حذف الطلب المعلق على الطاولة "{table.number}" وستصبح متاحة مرة أخرى. هذا الإجراء سيتم تسجيله للمراجعة.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>تراجع</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleCancelOrder(table)} className="bg-destructive hover:bg-destructive/90">نعم، قم بالإلغاء</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                     </AlertDialog>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )) : (
                         <Card className="col-span-full">
                            <CardContent className="p-10 text-center text-muted-foreground">
                                {selectedWarehouseId === 'all' ? 'لا توجد طاولات مسجلة.' : 'لا توجد طاولات في هذا الفرع.'}
                            </CardContent>
                        </Card>
                    )}
                </div>
                 <TableItemsDialog 
                    table={selectedTableForDetails?.table || null} 
                    heldInvoice={selectedTableForDetails?.heldInvoice || null} 
                    onOpenChange={(open) => !open && setSelectedTableForDetails(null)}
                />
            </Dialog>
        )}
      </main>
    </>
  );
}
