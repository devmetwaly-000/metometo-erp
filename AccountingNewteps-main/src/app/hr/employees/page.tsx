"use client";

import React, { useState, useMemo, useRef } from "react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/data-provider";
import { useAuth } from "@/contexts/auth-context";
import { 
    Users, 
    Plus, 
    Search, 
    FileSpreadsheet, 
    Calendar, 
    Edit, 
    Trash2,
    Eye,
    Camera,
    X,
    Palmtree,
    CalendarCheck
} from "lucide-react";
import * as XLSX from 'xlsx';

const WEEK_DAYS = [
    'الجمعة',
    'السبت',
    'الأحد',
    'الإثنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس'
];

interface Employee {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    nationalId?: string;
    socialInsuranceNumber?: string;
    jobTitle?: string;
    department?: string;
    hiringDate?: string;
    basicSalary: number;
    housingAllowance?: number;
    transportAllowance?: number;
    socialInsuranceDeduction?: number;
    photoUrl?: string;
    weeklyOffDays?: string[];
    annualLeaveDays?: number;
    usedLeaveDays?: number;
    status: 'active' | 'suspended' | 'terminated';
    branchId?: string;
    notes?: string;
}

export default function EmployeesManagementPage() {
    const { toast } = useToast();
    const { user: currentUser } = useAuth();
    const { users: allUsers, warehouses, dbAction } = useData();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'terminated'>('all');

    // Dialog state
    const [isAddEditOpen, setIsAddEditOpen] = useState(false);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [formData, setFormData] = useState<Partial<Employee>>({
        name: '',
        phone: '',
        email: '',
        nationalId: '',
        socialInsuranceNumber: '',
        jobTitle: '',
        department: 'الإدارة',
        hiringDate: new Date().toISOString().split('T')[0],
        basicSalary: 3000,
        housingAllowance: 0,
        transportAllowance: 0,
        socialInsuranceDeduction: 0,
        photoUrl: '',
        weeklyOffDays: ['الجمعة'],
        annualLeaveDays: 21,
        usedLeaveDays: 0,
        status: 'active',
        branchId: 'main',
        notes: ''
    });

    // Helper to normalize weeklyOffDays
    const normalizeOffDays = (raw: any): string[] => {
        if (Array.isArray(raw)) return raw.filter(Boolean);
        if (typeof raw === 'string' && raw.trim()) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed.filter(Boolean);
            } catch {
                return raw.split(',').map(s => s.trim()).filter(Boolean);
            }
        }
        return ['الجمعة'];
    };

    // Employees derived from users list
    const employees: Employee[] = useMemo(() => {
        return (allUsers || []).map((u: any) => ({
            id: u.id,
            name: u.name || 'موظف',
            email: u.email || '',
            phone: u.phone || '',
            nationalId: u.nationalId || '',
            socialInsuranceNumber: u.socialInsuranceNumber || '',
            jobTitle: u.jobTitle || u.role || 'موظف',
            department: u.department || 'العمليات',
            hiringDate: u.hiringDate || u.createdAt?.split('T')[0] || '2025-01-01',
            basicSalary: Number(u.basicSalary) || 0,
            housingAllowance: Number(u.housingAllowance) || 0,
            transportAllowance: Number(u.transportAllowance) || 0,
            socialInsuranceDeduction: Number(u.socialInsuranceDeduction) || 0,
            photoUrl: u.photoUrl || u.PhotoUrl || '',
            weeklyOffDays: normalizeOffDays(u.weeklyOffDays ?? u.WeeklyOffDays),
            annualLeaveDays: Number(u.annualLeaveDays ?? u.AnnualLeaveDays ?? 21),
            usedLeaveDays: Number(u.usedLeaveDays ?? u.UsedLeaveDays ?? 0),
            status: u.status || 'active',
            branchId: u.branchId || 'main',
            notes: u.notes || ''
        }));
    }, [allUsers]);

    // KPIs
    const kpis = useMemo(() => {
        const total = employees.length;
        const active = employees.filter(e => e.status === 'active').length;
        const totalMonthlyBasic = employees
            .filter(e => e.status === 'active')
            .reduce((sum, e) => sum + (Number(e.basicSalary) || 0), 0);
        const totalMonthlyAllowances = employees
            .filter(e => e.status === 'active')
            .reduce((sum, e) => sum + (Number(e.housingAllowance || 0) + Number(e.transportAllowance || 0)), 0);
        const avgSalary = active > 0 ? (totalMonthlyBasic / active) : 0;

        return { total, active, totalMonthlyBasic, totalMonthlyAllowances, avgSalary };
    }, [employees]);

    // Unique departments
    const departments = useMemo(() => {
        const set = new Set<string>();
        employees.forEach(e => { if (e.department) set.add(e.department); });
        return Array.from(set);
    }, [employees]);

    // Filtered list
    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
            if (departmentFilter !== 'all' && emp.department !== departmentFilter) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                return (
                    emp.name.toLowerCase().includes(q) ||
                    (emp.jobTitle && emp.jobTitle.toLowerCase().includes(q)) ||
                    (emp.phone && emp.phone.includes(q)) ||
                    (emp.nationalId && emp.nationalId.includes(q))
                );
            }
            return true;
        });
    }, [employees, statusFilter, departmentFilter, searchQuery]);

    // Compress and convert uploaded image to Data URL (optional photo)
    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast({ title: 'ملف غير مدعوم', description: 'يرجى اختيار ملف صورة صالح (JPG, PNG, WEBP).', variant: 'destructive' });
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxSize = 256;
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    setFormData(prev => ({ ...prev, photoUrl: compressedDataUrl }));
                }
            };
            if (typeof ev.target?.result === 'string') {
                img.src = ev.target.result;
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const toggleWeeklyOffDay = (day: string) => {
        const current = formData.weeklyOffDays || [];
        if (current.includes(day)) {
            setFormData({ ...formData, weeklyOffDays: current.filter(d => d !== day) });
        } else {
            setFormData({ ...formData, weeklyOffDays: [...current, day] });
        }
    };

    const handleOpenAdd = () => {
        setSelectedEmployee(null);
        setFormData({
            name: '',
            phone: '',
            email: '',
            nationalId: '',
            socialInsuranceNumber: '',
            jobTitle: '',
            department: 'المبيعات والتشغيل',
            hiringDate: new Date().toISOString().split('T')[0],
            basicSalary: 3500,
            housingAllowance: 0,
            transportAllowance: 0,
            socialInsuranceDeduction: 0,
            photoUrl: '',
            weeklyOffDays: ['الجمعة'],
            annualLeaveDays: 21,
            usedLeaveDays: 0,
            status: 'active',
            branchId: 'main',
            notes: ''
        });
        setIsAddEditOpen(true);
    };

    const handleOpenEdit = (emp: Employee) => {
        setSelectedEmployee(emp);
        setFormData({
            ...emp,
            weeklyOffDays: emp.weeklyOffDays && emp.weeklyOffDays.length > 0 ? emp.weeklyOffDays : ['الجمعة'],
            annualLeaveDays: emp.annualLeaveDays ?? 21,
            usedLeaveDays: emp.usedLeaveDays ?? 0,
            photoUrl: emp.photoUrl || ''
        });
        setIsAddEditOpen(true);
    };

    const handleSaveEmployee = async () => {
        if (!formData.name?.trim()) {
            toast({ title: 'تنبيه', description: 'يرجى إدخال اسم الموظف.', variant: 'destructive' });
            return;
        }

        try {
            if (selectedEmployee) {
                await dbAction('users', 'update', {
                    id: selectedEmployee.id,
                    data: formData
                });
                toast({ title: 'تم التحديث', description: `تم تحديث ملف الموظف [${formData.name}] بنجاح.` });
            } else {
                const newId = `emp_${Date.now()}`;
                await dbAction('users', 'add', {
                    id: newId,
                    ...formData
                });
                toast({ title: 'تمت الإضافة', description: `تم تسجيل الموظف الجديد [${formData.name}] بنجاح.` });
            }
            setIsAddEditOpen(false);
        } catch (err: any) {
            toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
        }
    };

    const handleDeleteEmployee = async (emp: Employee) => {
        if (confirm(`هل أنت متأكد من حذف الموظف [${emp.name}]؟`)) {
            try {
                await dbAction('users', 'remove', { id: emp.id });
                toast({ title: 'تم الحذف', description: `تم حذف الموظف [${emp.name}].` });
            } catch (err: any) {
                toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
            }
        }
    };

    const handleExportExcel = () => {
        const rows = filteredEmployees.map(e => ({
            'الاسم': e.name,
            'المسمى الوظيفي': e.jobTitle,
            'القسم': e.department,
            'رقم الهاتف': e.phone,
            'الرقم القومي': e.nationalId,
            'الراتب الأساسي': e.basicSalary,
            'بدل السكن': e.housingAllowance,
            'بدل الانتقال': e.transportAllowance,
            'إجمالي الراتب': (e.basicSalary + (e.housingAllowance || 0) + (e.transportAllowance || 0)),
            'أيام الإجازة الأسبوعية': (e.weeklyOffDays || ['الجمعة']).join('، '),
            'رصيد الإجازات السنوية': e.annualLeaveDays ?? 21,
            'الإجازات المستنفدة': e.usedLeaveDays ?? 0,
            'رصيد الإجازات المتبقي': Math.max(0, (e.annualLeaveDays ?? 21) - (e.usedLeaveDays ?? 0)),
            'تاريخ التعيين': e.hiringDate,
            'الحالة': e.status === 'active' ? 'نشط' : e.status === 'suspended' ? 'موقوف' : 'منتهي'
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "دليل الموظفين");
        XLSX.writeFile(wb, `Employees_Directory_${Date.now()}.xlsx`);
    };

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            <PageHeader 
                title="شؤون الموظفين والكوادر البشرية (Advanced HRMS)" 
                description="إدارة ملفات العاملين، الصور الشخصية، أيام الإجازة الأسبوعية والسنوية، الرواتب، والبدلات"
            >
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportExcel}>
                        <FileSpreadsheet className="h-4 w-4 ml-2" />
                        تصدير إكسيل
                    </Button>
                    <Button size="sm" onClick={handleOpenAdd} className="bg-primary text-primary-foreground">
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة موظف جديد
                    </Button>
                </div>
            </PageHeader>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي القوة العاملة</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpis.total} موظف</div>
                        <p className="text-xs text-muted-foreground mt-1">النشطين: {kpis.active}</p>
                    </CardContent>
                </Card>

                <Card className="border-blue-500/30 bg-blue-50/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-600">كتلة الرواتب الأساسية الشهرية</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{kpis.totalMonthlyBasic.toLocaleString('ar-EG')} ج.م</div>
                        <p className="text-xs text-muted-foreground mt-1">قبل البدلات والخصومات</p>
                    </CardContent>
                </Card>

                <Card className="border-green-500/30 bg-green-50/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-600">إجمالي البدلات والمزايا</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{kpis.totalMonthlyAllowances.toLocaleString('ar-EG')} ج.م</div>
                        <p className="text-xs text-muted-foreground mt-1">بدل سكن وانتقال</p>
                    </CardContent>
                </Card>

                <Card className="border-purple-500/30 bg-purple-50/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-purple-600">متوسط راتب الموظف</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600">{Math.round(kpis.avgSalary).toLocaleString('ar-EG')} ج.م</div>
                        <p className="text-xs text-muted-foreground mt-1">شهرياً للموظف النشط</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="relative w-full md:w-72">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="بحث بالاسم، الوظيفة، الهاتف..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pr-9"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {departments.length > 0 && (
                            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                                <SelectTrigger className="w-36 text-xs h-9">
                                    <SelectValue placeholder="القسم" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">كل الأقسام</SelectItem>
                                    {departments.map(d => (
                                        <SelectItem key={d} value={d}>{d}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        <div className="flex gap-1 border rounded-md p-1 bg-muted/20">
                            <Button 
                                size="sm" 
                                variant={statusFilter === 'all' ? 'default' : 'ghost'} 
                                className="h-7 text-xs px-2"
                                onClick={() => setStatusFilter('all')}
                            >
                                الكل ({employees.length})
                            </Button>
                            <Button 
                                size="sm" 
                                variant={statusFilter === 'active' ? 'default' : 'ghost'} 
                                className="h-7 text-xs px-2 text-green-600"
                                onClick={() => setStatusFilter('active')}
                            >
                                نشط ({kpis.active})
                            </Button>
                            <Button 
                                size="sm" 
                                variant={statusFilter === 'suspended' ? 'default' : 'ghost'} 
                                className="h-7 text-xs px-2 text-amber-600"
                                onClick={() => setStatusFilter('suspended')}
                            >
                                موقوف
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Employees Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        سجل العاملين والبيانات المالية والإجازات
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-right">الموظف</TableHead>
                                    <TableHead className="text-right">المسمى الوظيفي</TableHead>
                                    <TableHead className="text-right">القسم</TableHead>
                                    <TableHead className="text-right">الهاتف</TableHead>
                                    <TableHead className="text-right">الراتب الأساسي</TableHead>
                                    <TableHead className="text-right">إجمالي الاستحقاق</TableHead>
                                    <TableHead className="text-right">أيام الإجازة والرصيد</TableHead>
                                    <TableHead className="text-right">تاريخ التعيين</TableHead>
                                    <TableHead className="text-right">الحالة</TableHead>
                                    <TableHead className="text-center">الإجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredEmployees.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                                            لا توجد بيانات موظفين مطابقة للبحث.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredEmployees.map(emp => {
                                        const allowances = (emp.housingAllowance || 0) + (emp.transportAllowance || 0);
                                        const totalPackage = emp.basicSalary + allowances;
                                        const annualTotal = emp.annualLeaveDays ?? 21;
                                        const annualUsed = emp.usedLeaveDays ?? 0;
                                        const annualRemaining = Math.max(0, annualTotal - annualUsed);
                                        const offDays = emp.weeklyOffDays && emp.weeklyOffDays.length > 0 ? emp.weeklyOffDays : ['الجمعة'];

                                        return (
                                            <TableRow key={emp.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        {emp.photoUrl ? (
                                                            <img 
                                                                src={emp.photoUrl} 
                                                                alt={emp.name} 
                                                                className="h-10 w-10 rounded-full object-cover border-2 border-primary/30 shrink-0"
                                                            />
                                                        ) : (
                                                            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center border border-primary/20 shrink-0 text-sm">
                                                                {emp.name.trim().charAt(0)}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="font-semibold text-primary">{emp.name}</div>
                                                            {emp.nationalId && (
                                                                <div className="text-[11px] text-muted-foreground">ق: {emp.nationalId}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{emp.jobTitle}</TableCell>
                                                <TableCell><Badge variant="outline">{emp.department}</Badge></TableCell>
                                                <TableCell className="text-muted-foreground text-xs">{emp.phone || '-'}</TableCell>
                                                <TableCell className="font-semibold">{emp.basicSalary.toLocaleString('ar-EG')} ج.م</TableCell>
                                                <TableCell className="font-bold text-green-600">
                                                    {totalPackage.toLocaleString('ar-EG')} ج.م
                                                    {allowances > 0 && (
                                                        <div className="text-[10px] text-muted-foreground font-normal">
                                                            شامل بدلات: {allowances.toLocaleString('ar-EG')} ج.م
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1 mb-1">
                                                        {offDays.map(d => (
                                                            <Badge key={d} variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                                                                {d}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                                        <Palmtree className="h-3 w-3 text-emerald-600" />
                                                        <span>متبقي: <strong className="text-foreground">{annualRemaining}</strong> من {annualTotal} يوم</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs">{emp.hiringDate}</TableCell>
                                                <TableCell>
                                                    {emp.status === 'active' && <Badge className="bg-green-600">نشط</Badge>}
                                                    {emp.status === 'suspended' && <Badge variant="secondary" className="text-amber-600">موقوف</Badge>}
                                                    {emp.status === 'terminated' && <Badge variant="destructive">منتهي</Badge>}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            onClick={() => { setSelectedEmployee(emp); setIsViewOpen(true); }}
                                                            title="عرض الملف"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            onClick={() => handleOpenEdit(emp)}
                                                            title="تعديل البيانات"
                                                        >
                                                            <Edit className="h-4 w-4 text-blue-600" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => handleDeleteEmployee(emp)}
                                                            title="حذف"
                                                        >
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* ADD / EDIT EMPLOYEE MODAL */}
            <Dialog open={isAddEditOpen} onOpenChange={setIsAddEditOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-primary">
                            <Users className="h-5 w-5" />
                            {selectedEmployee ? `تعديل ملف الموظف: ${selectedEmployee.name}` : 'إضافة موظف جديد للمنظومة'}
                        </DialogTitle>
                        <DialogDescription>
                            أدخل البيانات الشخصية، الصورة الشخصية (اختياري)، أيام الإجازات، والملف المالي للموظف
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Optional Employee Photo Upload */}
                        <div className="flex flex-col sm:flex-row items-center gap-4 p-3 rounded-xl border bg-muted/20">
                            <div className="relative group">
                                {formData.photoUrl ? (
                                    <img 
                                        src={formData.photoUrl} 
                                        alt={formData.name || 'صورة الموظف'} 
                                        className="h-20 w-20 rounded-full object-cover border-2 border-primary shadow-sm"
                                    />
                                ) : (
                                    <div className="h-20 w-20 rounded-full bg-primary/10 text-primary flex flex-col items-center justify-center border-2 border-dashed border-primary/30">
                                        <Camera className="h-6 w-6 opacity-70" />
                                        <span className="text-[10px] mt-0.5">اختياري</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 text-center sm:text-right space-y-1.5">
                                <Label className="text-sm font-semibold block">صورة الموظف الشخصية (اختياري)</Label>
                                <p className="text-xs text-muted-foreground">
                                    يمكنك رفع صورة شخصية للموظف لتظهر في بطاقة التعريف وسجل الموظفين، أو تركها فارغة.
                                </p>
                                <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                                    <input 
                                        ref={fileInputRef}
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        onChange={handlePhotoUpload}
                                    />
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 text-xs"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <Camera className="h-3.5 w-3.5 ml-1.5 text-primary" />
                                        {formData.photoUrl ? 'تغيير الصورة' : 'رفع صورة الموظف'}
                                    </Button>
                                    {formData.photoUrl && (
                                        <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-8 text-xs text-destructive hover:text-destructive"
                                            onClick={() => setFormData({ ...formData, photoUrl: '' })}
                                        >
                                            <X className="h-3.5 w-3.5 ml-1" />
                                            إزالة الصورة
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Section 1: Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">اسم الموظف بالكامل *</Label>
                                <Input 
                                    value={formData.name || ''} 
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                                    placeholder="الاسم الرباعي..."
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">المسمى الوظيفي</Label>
                                <Input 
                                    value={formData.jobTitle || ''} 
                                    onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })} 
                                    placeholder="مثال: محاسب، كاشير، أمين مخزن..."
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">القسم / الإدارة</Label>
                                <Input 
                                    value={formData.department || ''} 
                                    onChange={(e) => setFormData({ ...formData, department: e.target.value })} 
                                    placeholder="مثال: المالية، المبيعات، المخازن..."
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">رقم الهاتف</Label>
                                <Input 
                                    value={formData.phone || ''} 
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })} 
                                    placeholder="01xxxxxxxxx"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">الرقم القومي (14 رقم)</Label>
                                <Input 
                                    value={formData.nationalId || ''} 
                                    onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })} 
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">الرقم التأميني (إن وجد)</Label>
                                <Input 
                                    value={formData.socialInsuranceNumber || ''} 
                                    onChange={(e) => setFormData({ ...formData, socialInsuranceNumber: e.target.value })} 
                                />
                            </div>
                        </div>

                        {/* Section 2: Vacation & Weekly Off Days */}
                        <div className="border-t pt-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="font-bold text-sm text-primary flex items-center gap-1.5">
                                    <CalendarCheck className="h-4 w-4" />
                                    أيام الإجازة الأسبوعية ورصيد الإجازات السنوية
                                </Label>
                                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                    الرصيد المتبقي: {Math.max(0, Number(formData.annualLeaveDays ?? 21) - Number(formData.usedLeaveDays ?? 0))} يوم
                                </Badge>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">أيام الراحة / الإجازة الأسبوعية (اضغط لاختيار يوم أو أكثر):</Label>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {WEEK_DAYS.map(day => {
                                        const isSelected = (formData.weeklyOffDays || []).includes(day);
                                        return (
                                            <Button
                                                key={day}
                                                type="button"
                                                size="sm"
                                                variant={isSelected ? "default" : "outline"}
                                                className={`h-8 text-xs px-3 ${isSelected ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
                                                onClick={() => toggleWeeklyOffDay(day)}
                                            >
                                                {day}
                                            </Button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">رصيد الإجازات السنوية المسموح (باليوم)</Label>
                                    <Input 
                                        type="number" 
                                        min="0"
                                        max="365"
                                        value={formData.annualLeaveDays ?? 21} 
                                        onChange={(e) => setFormData({ ...formData, annualLeaveDays: Number(e.target.value) })} 
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">أيام الإجازة المستنفدة خلال العام (باليوم)</Label>
                                    <Input 
                                        type="number" 
                                        min="0"
                                        max="365"
                                        value={formData.usedLeaveDays ?? 0} 
                                        onChange={(e) => setFormData({ ...formData, usedLeaveDays: Number(e.target.value) })} 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Financial & Salary Profile */}
                        <div className="border-t pt-3">
                            <Label className="font-bold text-sm text-primary block mb-2">الملف المالي وحزمة الرواتب</Label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">الراتب الأساسي الشهري (ج.م) *</Label>
                                    <Input 
                                        type="number" 
                                        min="0"
                                        value={formData.basicSalary || 0} 
                                        onChange={(e) => setFormData({ ...formData, basicSalary: Number(e.target.value) })} 
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">بدل سكن (ج.م)</Label>
                                    <Input 
                                        type="number" 
                                        min="0"
                                        value={formData.housingAllowance || 0} 
                                        onChange={(e) => setFormData({ ...formData, housingAllowance: Number(e.target.value) })} 
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">بدل انتقال (ج.م)</Label>
                                    <Input 
                                        type="number" 
                                        min="0"
                                        value={formData.transportAllowance || 0} 
                                        onChange={(e) => setFormData({ ...formData, transportAllowance: Number(e.target.value) })} 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Contract Dates & Status */}
                        <div className="border-t pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">تاريخ التعيين / بدء العمل</Label>
                                <Input 
                                    type="date" 
                                    value={formData.hiringDate || ''} 
                                    onChange={(e) => setFormData({ ...formData, hiringDate: e.target.value })} 
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">الحالة التعاقدية</Label>
                                <Select 
                                    value={formData.status || 'active'} 
                                    onValueChange={(v: any) => setFormData({ ...formData, status: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">نشط في الخدمة</SelectItem>
                                        <SelectItem value="suspended">موقوف مؤقتاً</SelectItem>
                                        <SelectItem value="terminated">إنهاء خدمة</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">ملاحظات إضافية</Label>
                            <Input 
                                value={formData.notes || ''} 
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })} 
                                placeholder="أي شروط تعاقدية أو بيانات خاصة..."
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsAddEditOpen(false)}>إلغاء</Button>
                        <Button onClick={handleSaveEmployee} className="bg-primary text-primary-foreground">
                            حفظ ملف الموظف
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* VIEW PROFILE MODAL */}
            <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            بطاقة الموظف: {selectedEmployee?.name}
                        </DialogTitle>
                    </DialogHeader>

                    {selectedEmployee && (
                        <div className="space-y-3 text-xs">
                            {/* Employee Avatar & Headline */}
                            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border">
                                {selectedEmployee.photoUrl ? (
                                    <img 
                                        src={selectedEmployee.photoUrl} 
                                        alt={selectedEmployee.name} 
                                        className="h-16 w-16 rounded-full object-cover border-2 border-primary"
                                    />
                                ) : (
                                    <div className="h-16 w-16 rounded-full bg-primary/10 text-primary font-bold text-xl flex items-center justify-center border border-primary/20">
                                        {selectedEmployee.name.trim().charAt(0)}
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <div className="font-bold text-base text-primary">{selectedEmployee.name}</div>
                                    <div className="text-muted-foreground">{selectedEmployee.jobTitle} — {selectedEmployee.department}</div>
                                    <div>
                                        {selectedEmployee.status === 'active' && <Badge className="bg-green-600 text-[10px]">نشط في الخدمة</Badge>}
                                        {selectedEmployee.status === 'suspended' && <Badge variant="secondary" className="text-amber-600 text-[10px]">موقوف مؤقتاً</Badge>}
                                        {selectedEmployee.status === 'terminated' && <Badge variant="destructive" className="text-[10px]">منتهي الخدمة</Badge>}
                                    </div>
                                </div>
                            </div>

                            <div className="p-3 bg-muted/40 rounded-lg space-y-1.5">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">رقم الهاتف:</span>
                                    <span>{selectedEmployee.phone || 'غير مسجل'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">الرقم القومي:</span>
                                    <span>{selectedEmployee.nationalId || 'غير مسجل'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">الرقم التأميني:</span>
                                    <span>{selectedEmployee.socialInsuranceNumber || 'غير مسجل'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">تاريخ التعيين:</span>
                                    <span>{selectedEmployee.hiringDate}</span>
                                </div>
                            </div>

                            {/* Vacation & Off Days Info */}
                            <div className="p-3 border rounded-lg space-y-1.5 bg-amber-500/5 border-amber-500/20">
                                <div className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-1">
                                    <Palmtree className="h-4 w-4" />
                                    بيانات الإجازات والراحة الأسبوعية
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">أيام الإجازة الأسبوعية:</span>
                                    <div className="flex flex-wrap gap-1">
                                        {(selectedEmployee.weeklyOffDays && selectedEmployee.weeklyOffDays.length > 0
                                            ? selectedEmployee.weeklyOffDays
                                            : ['الجمعة']
                                        ).map(d => (
                                            <Badge key={d} variant="outline" className="text-[10px] px-1.5 py-0">
                                                {d}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">رصيد الإجازات السنوية:</span>
                                    <span className="font-semibold">{selectedEmployee.annualLeaveDays ?? 21} يوم</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">الإجازات المستنفدة:</span>
                                    <span className="text-destructive font-semibold">{selectedEmployee.usedLeaveDays ?? 0} يوم</span>
                                </div>
                                <div className="flex justify-between border-t pt-1 font-bold text-emerald-600">
                                    <span>الرصيد المتبقي:</span>
                                    <span>{Math.max(0, (selectedEmployee.annualLeaveDays ?? 21) - (selectedEmployee.usedLeaveDays ?? 0))} يوم</span>
                                </div>
                            </div>

                            {/* Financial Info */}
                            <div className="p-3 border rounded-lg space-y-1.5 bg-primary/5">
                                <div className="flex justify-between font-semibold">
                                    <span>الراتب الأساسي:</span>
                                    <span>{selectedEmployee.basicSalary?.toLocaleString('ar-EG')} ج.م</span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>بدل سكن:</span>
                                    <span>{selectedEmployee.housingAllowance || 0} ج.م</span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>بدل انتقال:</span>
                                    <span>{selectedEmployee.transportAllowance || 0} ج.م</span>
                                </div>
                                <div className="flex justify-between border-t pt-1 font-bold text-sm text-primary">
                                    <span>إجمالي الحزمة الشهرية:</span>
                                    <span>
                                        {((selectedEmployee.basicSalary || 0) + (selectedEmployee.housingAllowance || 0) + (selectedEmployee.transportAllowance || 0)).toLocaleString('ar-EG')} ج.م
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsViewOpen(false)}>إغلاق</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
