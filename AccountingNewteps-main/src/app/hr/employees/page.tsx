"use client";

import React, { useState, useMemo } from "react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
    Building2, 
    Briefcase, 
    DollarSign, 
    Calendar, 
    ShieldCheck, 
    Phone, 
    Mail, 
    Edit, 
    Trash2,
    Eye,
    Award
} from "lucide-react";
import * as XLSX from 'xlsx';

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
    status: 'active' | 'suspended' | 'terminated';
    branchId?: string;
    notes?: string;
}

export default function EmployeesManagementPage() {
    const { toast } = useToast();
    const { user: currentUser } = useAuth();
    const { users: allUsers, warehouses, dbAction } = useData();

    const [searchQuery, setSearchQuery] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'terminated'>('all');

    // Dialog state
    const [isAddEditOpen, setIsAddEditOpen] = useState(false);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
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
        status: 'active',
        branchId: 'main',
        notes: ''
    });

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
            status: 'active',
            branchId: 'main',
            notes: ''
        });
        setIsAddEditOpen(true);
    };

    const handleOpenEdit = (emp: Employee) => {
        setSelectedEmployee(emp);
        setFormData({ ...emp });
        setIsAddEditOpen(true);
    };

    const handleSaveEmployee = async () => {
        if (!formData.name?.trim()) {
            toast({ title: 'تنبيه', description: 'يرجى إدخال اسم الموظف.', variant: 'destructive' });
            return;
        }

        try {
            if (selectedEmployee) {
                // Update existing user/employee
                await dbAction('users', 'update', {
                    id: selectedEmployee.id,
                    data: formData
                });
                toast({ title: 'تم التحديث', description: `تم تحديث ملف الموظف [${formData.name}] بنجاح.` });
            } else {
                // Add new employee
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
                description="إدارة ملفات العاملين، الرواتب، البدلات، التأمينات الاجتماعية، وتاريخ التعيين"
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
                        سجل العاملين والبيانات المالية
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
                                    <TableHead className="text-right">البدلات</TableHead>
                                    <TableHead className="text-right">إجمالي الاستحقاق</TableHead>
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

                                        return (
                                            <TableRow key={emp.id}>
                                                <TableCell>
                                                    <div className="font-semibold text-primary">{emp.name}</div>
                                                    {emp.nationalId && (
                                                        <div className="text-[11px] text-muted-foreground">ق: {emp.nationalId}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell>{emp.jobTitle}</TableCell>
                                                <TableCell><Badge variant="outline">{emp.department}</Badge></TableCell>
                                                <TableCell className="text-muted-foreground text-xs">{emp.phone || '-'}</TableCell>
                                                <TableCell className="font-semibold">{emp.basicSalary.toLocaleString('ar-EG')} ج.م</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {allowances > 0 ? `${allowances.toLocaleString('ar-EG')} ج.م` : '-'}
                                                </TableCell>
                                                <TableCell className="font-bold text-green-600">
                                                    {totalPackage.toLocaleString('ar-EG')} ج.م
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
                            أدخل البيانات الشخصية، التعاقدية، والملف المالي والتأميني للموظف
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
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

                        {/* Section 2: Financial & Salary Profile */}
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

                        {/* Section 3: Contract Dates & Status */}
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
                            <div className="p-3 bg-muted/40 rounded-lg space-y-1.5">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">الوظيفة:</span>
                                    <span className="font-bold">{selectedEmployee.jobTitle}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">القسم:</span>
                                    <span>{selectedEmployee.department}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">رقم الهاتف:</span>
                                    <span>{selectedEmployee.phone || 'غير مسجل'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">الرقم القومي:</span>
                                    <span>{selectedEmployee.nationalId || 'غير مسجل'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">تاريخ التعيين:</span>
                                    <span>{selectedEmployee.hiringDate}</span>
                                </div>
                            </div>

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
