
"use client";

import React, { useEffect, useState, useMemo } from "react";
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
import { MoreHorizontal, PlusCircle, Edit, Trash2, Loader2, Printer } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { useAuth } from "@/contexts/auth-context";
import { AddEntityDialog } from "@/components/add-entity-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { printService } from "@/lib/print-service";


interface PosTerminal {
  id?: string;
  code: string;
  name: string;
  warehouseId: string;
  posPrinterType?: 'system' | 'ip' | 'bluetooth' | 'browser';
  posPrinterAddress?: string;
  enableKitchenPrinter?: boolean;
  kitchenPrinterType?: 'system' | 'ip' | 'bluetooth' | 'browser';
  kitchenPrinterAddress?: string;
}
interface Warehouse {
  id: string;
  name: string;
}

const TerminalForm = ({ terminal, onSave, onClose, warehouses, allTerminals, systemPrinters }: { terminal?: PosTerminal; onSave: (data: Partial<PosTerminal>) => void; onClose: () => void; warehouses: Warehouse[], allTerminals: PosTerminal[], systemPrinters: Array<{ deviceId?: string, name: string }> }) => {
  const [formData, setFormData] = useState<Partial<PosTerminal>>(
    terminal || { name: "", warehouseId: "", code: "", posPrinterType: 'system', posPrinterAddress: '', enableKitchenPrinter: false, kitchenPrinterType: 'system', kitchenPrinterAddress: '' }
  );
  const { toast } = useToast();

  const handleTestSystemPrint = async (printerName: string) => {
    if (!printerName) return toast({ variant: 'destructive', title: 'خطأ', description: 'الرجاء اختيار طابعة أولاً.' });
    toast({ title: 'جارٍ إرسال الطباعة...', description: `يتم إرسال أمر طباعة تجريبي إلى ${printerName}` });
    try {
        await printService.sendToPrinter(printerName, {
            title: 'Test Print / طباعة تجريبية',
            lines: [
                { left: 'Test Successful', right: 'تم الاختبار بنجاح' },
                { left: 'Terminal', right: formData.name || 'Unknown' },
                { left: 'Date', right: new Date().toLocaleString('ar-EG') }
            ],
            footer: 'NewCashier POS System'
        });
        toast({ title: 'تمت الطباعة بنجاح' });
    } catch (error: any) {
        toast({ 
            variant: 'destructive', 
            title: 'فشل الطباعة', 
            description: error.message || 'تأكد من توصيل الطابعة وتثبيتها في النظام.'
        });
    }
  };

  const handleTestIpPrint = async (ipAddress: string) => {
    if (!ipAddress) return toast({ variant: 'destructive', title: 'خطأ', description: 'الرجاء إدخل عنوان IP أولاً.' });
    toast({ title: 'جارٍ إرسال الطباعة...', description: `يحاول الاتصال بـ ${ipAddress}` });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        await fetch(`http://${ipAddress}`, { mode: 'no-cors', signal: controller.signal });
        toast({ title: 'تم إرسال أمر الطباعة بنجاح' });
    } catch (error: any) {
         if (error.name === 'AbortError') toast({ variant: 'destructive', title: 'فشل الاتصال (مهلة)', description: 'انتهت مهلة الاتصال.' });
         else toast({ variant: 'destructive', title: 'فشل الاتصال', description: 'تعذر الوصول إلى الطابعة.' });
    } finally { clearTimeout(timeoutId); }
  };


  const handleSubmit = () => {
    if (!formData.name || !formData.warehouseId || !formData.code) {
        toast({ variant: "destructive", title: "خطأ", description: "جميع الحقول مطلوبة." });
        return;
    }

    if (formData.posPrinterType === 'system' && !formData.posPrinterAddress) {
        toast({ variant: "destructive", title: "خطأ", description: "يجب اختيار طابعة النظام لنقطة البيع." });
        return;
    }

    if (formData.posPrinterType === 'ip' && !formData.posPrinterAddress) {
        toast({ variant: "destructive", title: "خطأ", description: "يجب إدخال عنوان IP لطابعة نقطة البيع." });
        return;
    }

    if (formData.enableKitchenPrinter) {
        if (formData.kitchenPrinterType === 'system' && !formData.kitchenPrinterAddress) {
            toast({ variant: "destructive", title: "خطأ", description: "يجب اختيار طابعة النظام للمطبخ." });
            return;
        }

        if (formData.kitchenPrinterType === 'ip' && !formData.kitchenPrinterAddress) {
            toast({ variant: "destructive", title: "خطأ", description: "يجب إدخال عنوان IP لطابعة المطبخ." });
            return;
        }
    }
    
    const isCodeDuplicate = allTerminals.some(
        (t) => String(t.code) === String(formData.code) && t.id !== terminal?.id
    );

    if (isCodeDuplicate) {
        toast({ variant: "destructive", title: "خطأ", description: "كود نقطة البيع مستخدم بالفعل." });
        return;
    }

    onSave(formData);
    onClose();
  };

  return (
    <div className="space-y-4">
       <div className="space-y-2">
        <Label htmlFor="terminal-code">كود نقطة البيع</Label>
        <Input id="terminal-code" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="مثال: 1 أو C1" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="terminal-name">اسم/وصف نقطة البيع</Label>
        <Input id="terminal-name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="مثال: الكاشير الأمامي" />
      </div>
       <div className="space-y-2">
        <Label htmlFor="warehouse-id">المخزن المرتبط</Label>
        <Select value={formData.warehouseId} onValueChange={(v) => setFormData({ ...formData, warehouseId: v })}>
            <SelectTrigger id="warehouse-id">
                <SelectValue placeholder="اختر المخزن الذي تصرف منه هذه النقطة" />
            </SelectTrigger>
            <SelectContent>
                {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>إعدادات الطابعة لهذه النقطة</Label>
        <Select value={formData.posPrinterType || 'system'} onValueChange={(v: any) => setFormData({ ...formData, posPrinterType: v })}>
            <SelectTrigger><SelectValue placeholder="اختر نوع الطابعة" /></SelectTrigger>
            <SelectContent>
                <SelectItem value="system">طابعة النظام (طباعة يدوية)</SelectItem>
                <SelectItem value="ip">شبكة (IP)</SelectItem>
                <SelectItem value="browser">المتصفح (Browser)</SelectItem>
            </SelectContent>
        </Select>
        {formData.posPrinterType === 'browser' ? (
            <div className="flex gap-2 items-center border p-2 rounded bg-muted/50">
                <span className="text-sm text-muted-foreground flex-1">سيتم استخدام نافذة الطباعة الافتراضية للمتصفح.</span>
                <Button variant="outline" size="icon" onClick={() => window.print()} title="تجربة طباعة المتصفح">
                    <Printer className="h-4 w-4" />
                </Button>
            </div>
        ) : (formData.posPrinterType || 'system') === 'system' ? (
            <div className="flex gap-2">
                <Select value={formData.posPrinterAddress || ''} onValueChange={(v) => setFormData({ ...formData, posPrinterAddress: v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="اختر طابعة النظام لهذه النقطة" /></SelectTrigger>
                    <SelectContent>
                        {systemPrinters.length > 0 ? systemPrinters.map((p) => (
                            <SelectItem key={p.deviceId || p.name} value={p.name}>{p.name}</SelectItem>
                        )) : (
                            <div className="p-2 text-sm text-muted-foreground">لا توجد طابعات نظام متاحة.</div>
                        )}
                    </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => handleTestSystemPrint(formData.posPrinterAddress || '')} title="طباعة تجريبية">
                    <Printer className="h-4 w-4" />
                </Button>
            </div>
        ) : (
            <div className="flex gap-2">
                <Input className="flex-1" value={formData.posPrinterAddress || ''} onChange={e => setFormData({ ...formData, posPrinterAddress: e.target.value })} placeholder="أدخل عنوان IP للطابعة" />
                <Button variant="outline" size="icon" onClick={() => handleTestIpPrint(formData.posPrinterAddress || '')} title="طباعة تجريبية">
                    <Printer className="h-4 w-4" />
                </Button>
            </div>
        )}
      </div>
      <div className="space-y-4">
        <div className="flex items-center space-x-2 space-x-reverse">
          <Checkbox 
            id="enable-kitchen-printer" 
            checked={formData.enableKitchenPrinter || false} 
            onCheckedChange={(checked) => setFormData({ ...formData, enableKitchenPrinter: !!checked })}
          />
          <Label htmlFor="enable-kitchen-printer" className="cursor-pointer">تفعيل طابعة المطبخ لهذه النقطة</Label>
        </div>

        {formData.enableKitchenPrinter && (
            <div className="space-y-2 border p-4 rounded-md bg-muted/20">
                <Label>إعدادات طابعة المطبخ</Label>
                <Select value={formData.kitchenPrinterType || 'system'} onValueChange={(v: any) => setFormData({ ...formData, kitchenPrinterType: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر نوع طابعة المطبخ" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="system">طابعة النظام (طباعة يدوية)</SelectItem>
                        <SelectItem value="ip">شبكة (IP)</SelectItem>
                        <SelectItem value="browser">المتصفح (Browser)</SelectItem>
                    </SelectContent>
                </Select>
                {formData.kitchenPrinterType === 'browser' ? (
                     <div className="flex gap-2 items-center border p-2 rounded bg-muted/50">
                        <span className="text-sm text-muted-foreground flex-1">سيتم استخدام نافذة الطباعة الافتراضية للمتصفح.</span>
                        <Button variant="outline" size="icon" onClick={() => window.print()} title="تجربة طباعة المتصفح">
                            <Printer className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (formData.kitchenPrinterType || 'system') === 'system' ? (
                    <div className="flex gap-2">
                        <Select value={formData.kitchenPrinterAddress || ''} onValueChange={(v) => setFormData({ ...formData, kitchenPrinterAddress: v })}>
                            <SelectTrigger className="flex-1"><SelectValue placeholder="اختر طابعة النظام للمطبخ" /></SelectTrigger>
                            <SelectContent>
                                {systemPrinters.length > 0 ? systemPrinters.map((p) => (
                                    <SelectItem key={p.deviceId || p.name} value={p.name}>{p.name}</SelectItem>
                                )) : (
                                    <div className="p-2 text-sm text-muted-foreground">لا توجد طابعات نظام متاحة.</div>
                                )}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="icon" onClick={() => handleTestSystemPrint(formData.kitchenPrinterAddress || '')} title="طباعة تجريبية">
                            <Printer className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <Input className="flex-1" value={formData.kitchenPrinterAddress || ''} onChange={e => setFormData({ ...formData, kitchenPrinterAddress: e.target.value })} placeholder="أدخل عنوان IP لطابعة المطبخ" />
                        <Button variant="outline" size="icon" onClick={() => handleTestIpPrint(formData.kitchenPrinterAddress || '')} title="طباعة تجريبية">
                            <Printer className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </div>
        )}
      </div>
      <div className="flex justify-end pt-4">
        <Button onClick={handleSubmit}>حفظ</Button>
      </div>
    </div>
  );
};


export default function PosTerminalsPage() {
  const { posTerminals, warehouses, dbAction, loading } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const authorizedWarehouses = useMemo(() => {
    const wIds = user?.warehouseIds || [];
    if (wIds.includes('all')) return warehouses;
    return warehouses.filter((w: any) => wIds.includes(w.id));
  }, [warehouses, user]);

  const [systemPrinters, setSystemPrinters] = useState<Array<{ deviceId?: string, name: string }>>([]);
  
  useEffect(() => {
    const fetchPrinters = async () => {
      const printers = await printService.getSystemPrinters();
      if (printers.length) setSystemPrinters(printers);
    };
    fetchPrinters();
  }, []);

  const handleSave = async (data: Partial<PosTerminal>) => {
    try {
      const payload = {
        name: data.name,
        warehouseId: data.warehouseId,
        code: data.code,
        posPrinterType: data.posPrinterType || 'system',
        posPrinterAddress: data.posPrinterAddress || '',
        enableKitchenPrinter: data.enableKitchenPrinter || false,
        kitchenPrinterType: data.kitchenPrinterType || 'system',
        kitchenPrinterAddress: data.kitchenPrinterAddress || ''
      };

      if (data.id) {
        await dbAction("posTerminals", "update", { id: data.id, data: payload });
      } else {
        await dbAction("posTerminals", "add", payload);
      }
      toast({ title: 'تم الحفظ بنجاح' });
    } catch(e: any) {
      console.error("Failed to save terminal:", e);
      toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ نقطة البيع: " + (e.message || String(e)) });
    }
  };

  const handleDelete = async (id: string) => {
    await dbAction("posTerminals", "remove", { id });
    toast({ title: 'تم الحذف بنجاح' });
  };
  
  const getWarehouseName = (id: string) => warehouses.find((w: Warehouse) => w.id === id)?.name || 'غير محدد';

  return (
    <>
      <PageHeader title="نقاط البيع (الكاشيرات)">
        <AddEntityDialog
          title="إضافة نقطة بيع جديدة"
          description="عرّف أجهزة الكاشير الموجودة لديك واربط كل جهاز بمخزن محدد لصرف البضاعة منه."
          triggerButton={
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              إضافة نقطة بيع
            </Button>
          }
        >
          {({onClose}) => <TerminalForm onSave={handleSave} onClose={onClose} warehouses={authorizedWarehouses} allTerminals={posTerminals} systemPrinters={systemPrinters} />}
        </AddEntityDialog>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>قائمة نقاط البيع</CardTitle>
            <CardDescription>
              إدارة أجهزة نقاط البيع في فروعك المختلفة.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
              <div className="w-full overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>كود نقطة البيع</TableHead>
                      <TableHead>الاسم/الوصف</TableHead>
                      <TableHead>المخزن المرتبط</TableHead>
                      <TableHead className="text-center w-[100px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posTerminals && posTerminals.length > 0 ? posTerminals.map((terminal: any, index: number) => (
                      <TableRow key={terminal.id}>
                        <TableCell className="font-mono">{terminal.code}</TableCell>
                        <TableCell className="font-medium">{terminal.name}</TableCell>
                        <TableCell>{getWarehouseName(terminal.warehouseId)}</TableCell>
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
                                          title="تعديل نقطة البيع"
                                          description="تعديل اسم نقطة البيع والمخزن المرتبط بها."
                                          triggerButton={
                                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                  <Edit className="ml-2 h-4 w-4" /> تعديل
                                              </DropdownMenuItem>
                                          }
                                      >
                                          {({onClose}) => <TerminalForm terminal={terminal} onSave={handleSave} onClose={onClose} warehouses={authorizedWarehouses} allTerminals={posTerminals} systemPrinters={systemPrinters}/>}
                                      </AddEntityDialog>
                                      <AlertDialogTrigger asChild>
                                          <DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}>
                                              <Trash2 className="ml-2 h-4 w-4" /> حذف
                                          </DropdownMenuItem>
                                      </AlertDialogTrigger>
                                  </DropdownMenuContent>
                              </DropdownMenu>
                               <AlertDialogContent>
                                  <AlertDialogHeader>
                                      <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                      <AlertDialogDescription>سيؤدي هذا الإجراء إلى حذف نقطة البيع بشكل دائم.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDelete(terminal.id!)}>متابعة</AlertDialogAction>
                                  </AlertDialogFooter>
                              </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">لا توجد نقاط بيع مسجلة. قم بإضافة واحدة للبدء.</TableCell>
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
