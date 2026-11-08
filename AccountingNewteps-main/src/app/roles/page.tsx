

"use client";

import React, { useState, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Loader2, History, PlusCircle, Trash2, RefreshCcw } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { permissionsConfig, PermissionModule, PermissionAction, getModuleGroupLabel, initialRoles } from "@/contexts/permissions-context";
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
import { AddEntityDialog } from '@/components/add-entity-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


type Job = string;
type ModuleKey = keyof typeof permissionsConfig;

const AddJobForm = ({ onSave, onClose, existingJobs }: { onSave: (name: string, copyFrom: string) => void, onClose: () => void, existingJobs: string[] }) => {
    const [jobName, setJobName] = useState("");
    const [copyFrom, setCopyFrom] = useState("");

    const handleSubmit = () => {
        if (!jobName || !copyFrom) {
            alert("يرجى إدخال اسم الوظيفة واختيار وظيفة لنسخ الصلاحيات منها.");
            return;
        }
        onSave(jobName, copyFrom);
        onClose();
    };

    return (
        <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="job-name" className="text-right">اسم الوظيفة</Label>
                <Input id="job-name" value={jobName} onChange={e => setJobName(e.target.value)} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="copy-from" className="text-right">نسخ الصلاحيات من</Label>
                <Select value={copyFrom} onValueChange={setCopyFrom} required>
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="اختر وظيفة" />
                    </SelectTrigger>
                    <SelectContent>
                        {existingJobs.map(job => <SelectItem key={job} value={job}>{job}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
             <div className="flex justify-end mt-4">
                <Button onClick={handleSubmit}>إنشاء وظيفة</Button>
            </div>
        </div>
    )
}


export default function RolesPage() {
  const { roles: dataRoles, dbAction } = useData();
  const [jobs, setJobs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (dataRoles && Object.keys(dataRoles).length > 0) {
      setJobs(dataRoles);
    } else {
      setJobs(initialRoles);
    }
    setLoading(false);
  }, [dataRoles]);

  const handlePermissionChange = (
    job: Job,
    module: ModuleKey,
    action: PermissionAction,
    checked: boolean
  ) => {
    setJobs((prevJobs: any) => ({
      ...prevJobs,
      [job]: {
        ...prevJobs[job],
        [module]: {
          ...prevJobs[job]?.[module],
          [action]: checked,
        },
      },
    }));
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
        await dbAction('roles', 'update', { data: jobs });
        toast({ title: "تم الحفظ بنجاح", description: "تم تحديث صلاحيات الوظائف في SQL Server." });
    } catch (error) {
        toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ الصلاحيات." });
        console.error("Failed to save jobs:", error);
    } finally {
        setIsSaving(false);
    }
  }
  
  const handleAddJob = (name: string, copyFrom: string) => {
    if (jobs && jobs[name]) {
        toast({variant: 'destructive', title: 'خطأ', description: 'اسم الوظيفة موجود بالفعل.'});
        return;
    }
    const permissionsToCopy = jobs[copyFrom];
    setJobs((prevJobs: any) => ({
        ...prevJobs,
        [name]: JSON.parse(JSON.stringify(permissionsToCopy)) // Deep copy
    }));
    toast({title: 'تمت إضافة الوظيفة', description: 'لا تنس حفظ التغييرات.'});
  }
  
  const handleDeleteJob = async (jobName: string) => {
    if (initialRoles[jobName as keyof typeof initialRoles]) {
      toast({ variant: "destructive", title: "غير مسموح", description: "لا يمكن حذف الوظائف الأساسية." });
      return;
    }

    if (confirm(`هل أنت متأكد من حذف وظيفة "${jobName}"؟ هذا الإجراء سيحذفها نهائياً.`)) {
      const newJobs = { ...jobs };
      delete newJobs[jobName];
      setJobs(newJobs);
      await dbAction('roles', 'remove', { id: jobName });
      toast({ title: "تم الحذف", description: `تم حذف وظيفة "${jobName}".` });
    }
  };

  const handleRestoreDefaults = (jobToRestore?: Job) => {
    const restoreAction = async () => {
        setIsSaving(true);
        try {
            await dbAction('roles', 'update', { data: initialRoles });
            setJobs(initialRoles);
            toast({ title: "تم استعادة الافتراضيات", description: `تم استعادة جميع صلاحيات الوظائف.` });
        } catch {
            toast({ variant: "destructive", title: "خطأ", description: "فشل استعادة الإعدادات الافتراضية." });
        } finally {
            setIsSaving(false);
        }
    };

    if(jobToRestore) {
        const defaultPermissionsForJob = initialRoles[jobToRestore as keyof typeof initialRoles];
        if (!defaultPermissionsForJob) {
          toast({ variant: "destructive", title: "خطأ", description: "لم يتم العثور على الوظيفة الافتراضية." });
          return;
        }
        
        setJobs((prevJobs: any) => ({
          ...prevJobs,
          [jobToRestore]: defaultPermissionsForJob
        }));

        toast({ title: "تم استعادة الافتراضيات", description: `تم استعادة صلاحيات وظيفة "${jobToRestore}". اضغط على حفظ لتطبيق التغييرات.` });
    } else {
        restoreAction();
    }
  };


  const allPossibleActions: PermissionAction[] = ["view", "add", "edit", "delete", "print", "generate", "approve"];
  const allActionLabels: Record<PermissionAction, string> = {
    view: "عرض",
    add: "إضافة",
    edit: "تعديل",
    delete: "حذف",
    print: "طباعة",
    generate: "إنشاء",
    approve: "اعتماد"
  };

  const groupedModules = Object.entries(permissionsConfig).reduce((acc, [key, value]) => {
      const groupKey = value.group;
      if (!acc[groupKey]) {
          acc[groupKey] = [];
      }
      acc[groupKey].push({ key: key as ModuleKey, ...value } as any);
      return acc;
  }, {} as Record<string, (PermissionModule & { key: ModuleKey })[]>);


  if (loading || !jobs) {
      return (
        <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )
  }

  return (
    <>
      <PageHeader title="الوظائف والصلاحيات">
        <div className='flex gap-2'>
            <AddEntityDialog
                title="إضافة وظيفة جديدة"
                description="أدخل اسم الوظيفة الجديدة وانسخ الصلاحيات من وظيفة موجودة."
                triggerButton={
                    <Button variant="outline">
                        <PlusCircle className="ml-2 h-4 w-4" />
                        إضافة وظيفة
                    </Button>
                }
            >
                <AddJobForm onSave={handleAddJob} onClose={() => {}} existingJobs={Object.keys(jobs)} />
            </AddEntityDialog>
            <Button onClick={handleSaveChanges} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                {isSaving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
            </Button>
        </div>
      </PageHeader>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>إدارة صلاحيات الوظائف</CardTitle>
            <CardDescription>
              قم بتحديد الصلاحيات لكل وظيفة في النظام على مستوى كل شاشة.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {Object.keys(jobs).map((job) => (
                <AccordionItem value={job} key={job}>
                    <div className="flex w-full items-center justify-between pl-4 hover:bg-muted/50 rounded-t-md">
                        <AccordionTrigger className="flex-1 py-4 text-lg font-bold hover:no-underline">
                            {job}
                        </AccordionTrigger>
                        <div className='flex items-center gap-2'>
                            <Button variant="ghost" size="sm" disabled={!initialRoles[job as keyof typeof initialRoles]} onClick={() => handleRestoreDefaults(job)}>
                                <History className="ml-2 h-4 w-4" />
                                استعادة افتراضي
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={!!initialRoles[job as keyof typeof initialRoles]}>
                                        <Trash2 className="h-4 w-4"/>
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>هل أنت متأكد من حذف وظيفة "{job}"؟</AlertDialogTitle>
                                        <AlertDialogDescription>
                                        سيتم حذف هذه الوظيفة بشكل دائم.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteJob(job)} className="bg-destructive hover:bg-destructive/90">نعم، قم بالحذف</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>

                  <AccordionContent>
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>الشاشة/الوحدة</TableHead>
                            {allPossibleActions.map(action => (
                               <TableHead key={action} className="text-center">{allActionLabels[action]}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                           {Object.entries(groupedModules).map(([groupKey, modules]) => (
                               <React.Fragment key={groupKey}>
                                    <TableRow className="bg-muted/50">
                                        <TableCell colSpan={allPossibleActions.length + 1} className="font-bold">
                                            {getModuleGroupLabel(groupKey)}
                                        </TableCell>
                                    </TableRow>
                                    {modules.map((module) => {
                                        const moduleActions = module.actions;
                                        const jobPermissions = jobs[job]?.[module.key];

                                        return (
                                          <TableRow key={module.key}>
                                            <TableCell className="font-medium pr-6">{module.label}</TableCell>
                                            {allPossibleActions.map((actionKey) => {
                                              return(
                                                <TableCell key={actionKey} className="text-center">
                                                  {moduleActions.includes(actionKey) ? (
                                                    <Checkbox
                                                      checked={jobPermissions?.[actionKey] || false}
                                                      onCheckedChange={(checked) => handlePermissionChange(job, module.key, actionKey, !!checked)}
                                                    />
                                                  ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                  )}
                                                </TableCell>
                                              )
                                            })}
                                          </TableRow>
                                        );
                                    })}
                               </React.Fragment>
                           ))}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
