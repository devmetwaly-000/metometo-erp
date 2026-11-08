
"use client";

import React, { useState } from 'react';
import { Loader2, CheckCircle, KeyRound } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useData } from '@/contexts/data-provider';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export const LicenseActivationForm = () => {
    const { user, signOut, updateUserTheme } = useAuth(); // Get updateUserTheme from useAuth
    const { licenses, dbAction, settings, warehouses } = useData();
    const { toast } = useToast();
    const [licenseKey, setLicenseKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleActivate = async () => {
        const keyToActivate = licenseKey.trim();
        if (!keyToActivate) {
            toast({ variant: "destructive", title: "خطأ", description: "الرجاء إدخال مفتاح الترخيص." });
            return;
        }

        const licenseToUpdate = licenses.find((lic: any) => lic.key === keyToActivate);

        if (!licenseToUpdate) {
            toast({ variant: "destructive", title: "مفتاح غير صالح", description: "مفتاح الترخيص الذي أدخلته غير موجود." });
            return;
        }

        if (licenseToUpdate.status === 'assigned') {
            toast({ variant: "destructive", title: "مفتاح مستخدم", description: "هذا المفتاح تم استخدامه وتعيينه لعميل آخر بالفعل." });
            return;
        }
        
        setIsLoading(true);
        try {
             // 1. Update license status in DB
            await dbAction('licenses', 'update', { 
                id: licenseToUpdate.id, 
                data: { 
                    status: 'assigned', 
                    assignedTo: settings?.main?.general?.companyName || user?.name || 'Unknown Company' 
                }
            });
            
            const newThemeSettings = {
                ...(user?.themeSettings || {}),
                licenseKey: keyToActivate,
                licenseStatus: 'active' as const,
            };

            // --- Sync Branches on Activation ---
            const dataToUpdate: any = { themeSettings: newThemeSettings };
            if (licenseToUpdate.assignedWarehouseIds && licenseToUpdate.assignedWarehouseIds.length > 0) {
                // Set the user's branches to the license branches
                dataToUpdate.warehouseIds = licenseToUpdate.assignedWarehouseIds;
                
                // If the user is a sales rep, we must preserve their personal warehouse
                if (user?.isSalesRep) {
                    const repWarehouse = warehouses.find((w: any) => w.repId === user.id);
                    if (repWarehouse && !dataToUpdate.warehouseIds.includes(repWarehouse.id)) {
                        dataToUpdate.warehouseIds = [...dataToUpdate.warehouseIds, repWarehouse.id];
                    }
                }
            }
            // --- End Sync ---

            // 2. Update user data in DB
            await dbAction('users', 'update', { id: user!.id, data: dataToUpdate });
            
            // 3. Update user state locally immediately
            updateUserTheme(newThemeSettings);

            toast({ title: "تم التفعيل بنجاح!", description: "تم تفعيل حسابك." });

        } catch (error) {
             toast({ variant: "destructive", title: "خطأ", description: "فشل تفعيل الترخيص." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-2xl flex items-center gap-2"><KeyRound/> تفعيل الترخيص</CardTitle>
                    <CardDescription>
                        مرحباً {user?.name}. لاستخدام النظام، يرجى إدخال مفتاح الترخيص الخاص بك.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="licenseKey">مفتاح الترخيص</Label>
                        <Input 
                            id="licenseKey" 
                            type="text" 
                            value={licenseKey} 
                            onChange={e => setLicenseKey(e.target.value)} 
                            required 
                            className="font-mono text-left tracking-widest" 
                            dir="ltr"
                        />
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                    <Button onClick={handleActivate} className="w-full" disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                        تفعيل
                    </Button>
                    <Button variant="link" size="sm" onClick={signOut} className="text-muted-foreground">تسجيل الخروج</Button>
                </CardFooter>
            </Card>
        </div>
    )
}
