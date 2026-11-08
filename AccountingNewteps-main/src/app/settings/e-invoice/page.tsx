
"use client";

import React, { useState, useEffect, useMemo } from 'react';
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/data-provider";
import { Loader2, Save, Link as LinkIcon, AlertTriangle } from "lucide-react";
import { usePermissions } from "@/contexts/permissions-context";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Combobox } from '@/components/ui/combobox';

interface EInvoiceSettings {
    clientId: string;
    clientSecret: string;
    tokenEndpoint: string;
    invoiceEndpoint: string;
    activityCode: string;
    taxRegNumber: string;
    posDeviceSerial: string;
    branchCode: string; // New: For branch-specific settings
}

const DEFAULT_SETTINGS: EInvoiceSettings = {
    clientId: '',
    clientSecret: '',
    tokenEndpoint: 'https://id.eta.gov.eg/connect/token',
    invoiceEndpoint: 'https://api.preprod.invoicing.eta.gov.eg/api/v1.0/',
    activityCode: '',
    taxRegNumber: '',
    posDeviceSerial: '',
    branchCode: '0'
};

const SettingsForm = ({ settings, onSettingChange }: { settings: EInvoiceSettings, onSettingChange: (key: keyof EInvoiceSettings, value: string) => void }) => {
    return (
        <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <Label htmlFor="clientId">Client ID</Label>
                <Input id="clientId" value={settings.clientId} onChange={e => onSettingChange('clientId', e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret</Label>
                <Input id="clientSecret" type="password" value={settings.clientSecret} onChange={e => onSettingChange('clientSecret', e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="tokenEndpoint">Token Endpoint</Label>
                <Input id="tokenEndpoint" value={settings.tokenEndpoint} onChange={e => onSettingChange('tokenEndpoint', e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="invoiceEndpoint">Invoices Endpoint</Label>
                <Input id="invoiceEndpoint" value={settings.invoiceEndpoint} onChange={e => onSettingChange('invoiceEndpoint', e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="taxRegNumber">رقم التسجيل الضريبي</Label>
                <Input id="taxRegNumber" value={settings.taxRegNumber} onChange={e => onSettingChange('taxRegNumber', e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="activityCode">كود النشاط الضريبي</Label>
                <Input id="activityCode" value={settings.activityCode} onChange={e => onSettingChange('activityCode', e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="posDeviceSerial">الرقم التسلسلي لنقطة البيع (POS)</Label>
                <Input id="posDeviceSerial" value={settings.posDeviceSerial} onChange={e => onSettingChange('posDeviceSerial', e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="branchCode">كود الفرع الضريبي</Label>
                <Input id="branchCode" value={settings.branchCode} onChange={e => onSettingChange('branchCode', e.target.value)} placeholder="0 للفرع الرئيسي"/>
            </div>
        </div>
    );
};

export default function EInvoiceSettingsPage() {
    const { toast } = useToast();
    const { can } = usePermissions();
    const { settings: allData, dbAction, loading: dataLoading, warehouses } = useData();
    
    const [defaultSettings, setDefaultSettings] = useState<EInvoiceSettings>(DEFAULT_SETTINGS);
    const [branchOverrides, setBranchOverrides] = useState<Record<string, Partial<EInvoiceSettings>>>({});
    const [selectedBranchId, setSelectedBranchId] = useState<string>('');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const savedSettings = allData?.main?.eInvoice || {};
        setDefaultSettings({ ...DEFAULT_SETTINGS, ...(savedSettings.default || {}) });
        setBranchOverrides(savedSettings.branchOverrides || {});
        setIsLoading(false);
    }, [allData]);

    const handleSettingChange = (isDefault: boolean, key: keyof EInvoiceSettings, value: string) => {
        if (isDefault) {
            setDefaultSettings(prev => ({ ...prev, [key]: value }));
        } else if (selectedBranchId) {
            setBranchOverrides(prev => ({
                ...prev,
                [selectedBranchId]: {
                    ...(prev[selectedBranchId] || {}),
                    [key]: value
                }
            }));
        }
    };

    const handleSave = async () => {
        if (!can('edit', 'settings_eInvoice')) {
            toast({ variant: 'destructive', title: 'غير مصرح به' });
            return;
        }
        setIsSaving(true);
        try {
            await dbAction('settings', 'update', { id: 'main', data: { eInvoice: { default: defaultSettings, branchOverrides } } });
            toast({ title: "تم الحفظ بنجاح", description: `تم تحديث إعدادات الإيصال الإلكتروني.` });
        } catch (error) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ الإعدادات.' });
        } finally {
            setIsSaving(false);
        }
    };

    const currentBranchSettings = useMemo(() => {
        if (!selectedBranchId) return DEFAULT_SETTINGS;
        // Merge default settings with branch-specific overrides
        return { ...defaultSettings, ...(branchOverrides[selectedBranchId] || {}) };
    }, [selectedBranchId, defaultSettings, branchOverrides]);

    const warehouseOptions = useMemo(() => warehouses.map((w: any) => ({ value: w.id, label: w.name })), [warehouses]);
    
    if (isLoading || dataLoading) {
        return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>
    }

    return (
        <>
            <PageHeader title="إعدادات الإيصال الإلكتروني (ETA)">
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                    حفظ كل الإعدادات
                </Button>
            </PageHeader>
            <main className="flex-1 p-4 md:p-6 space-y-6">
                 <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>ميزة تجريبية وتحت التطوير</AlertTitle>
                    <AlertDescription>
                        هذه الشاشة مخصصة لإدخال بيانات التكامل مع منظومة الضرائب. الربط الفعلي لا يزال قيد الإنشاء.
                    </AlertDescription>
                </Alert>

                 <Tabs defaultValue="default">
                    <TabsList>
                        <TabsTrigger value="default">الإعدادات الافتراضية</TabsTrigger>
                        <TabsTrigger value="branch">تخصيص فرع</TabsTrigger>
                    </TabsList>
                    <TabsContent value="default">
                        <Card>
                            <CardHeader>
                                <CardTitle>الإعدادات الافتراضية</CardTitle>
                                <CardDescription>هذه هي الإعدادات العامة التي سيتم استخدامها ما لم يتم تخصيص إعدادات لفرع معين.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <SettingsForm 
                                    settings={defaultSettings} 
                                    onSettingChange={(key, value) => handleSettingChange(true, key, value)} 
                                />
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="branch">
                        <Card>
                             <CardHeader>
                                <CardTitle>تخصيص إعدادات لفرع</CardTitle>
                                <CardDescription>اختر فرعًا لتجاوز الإعدادات الافتراضية. الحقول الفارغة هنا ستستخدم القيمة من الإعدادات الافتراضية.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="max-w-sm space-y-2">
                                     <Label>اختر الفرع للتخصيص</Label>
                                     <Combobox options={warehouseOptions} value={selectedBranchId} onValueChange={setSelectedBranchId} placeholder="اختر فرعًا..." emptyMessage="لا توجد فروع."/>
                                </div>
                                {selectedBranchId && (
                                     <div className="pt-4 border-t">
                                        <SettingsForm 
                                            settings={currentBranchSettings} 
                                            onSettingChange={(key, value) => handleSettingChange(false, key, value)} 
                                        />
                                    </div>
                                )}
                             </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </>
    );
}
