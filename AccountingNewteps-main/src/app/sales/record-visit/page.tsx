
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, MapPin } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';

interface Customer {
  id: string;
  name: string;
}

export default function RecordVisitPage() {
    const { customers, dbAction, loading } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);

    // Automatically get location on component mount
    useEffect(() => {
        if (!navigator.geolocation) {
            setLocationError("المتصفح لا يدعم تحديد الموقع.");
            return;
        }

        setLocationError(null);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
            },
            (error) => {
                const errorMessage = `خطأ في تحديد الموقع: ${error.message}`;
                setLocationError(errorMessage);
                toast({ variant: 'destructive', title: "خطأ", description: errorMessage });
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, [toast]);

    const handleSaveVisit = async () => {
        if (!location) {
            toast({ variant: 'destructive', title: 'الموقع مطلوب', description: 'لم يتم تحديد الموقع الجغرافي بعد. يرجى الانتظار أو التأكد من منح الإذن.' });
            return;
        }

        setIsSaving(true);
        try {
            await dbAction('customerVisits', 'add', {
                salesRepId: user?.id,
                salesRepName: user?.name,
                customerId: null, // No customer is selected now
                customerName: 'زيارة بدون عميل محدد',
                timestamp: new Date().toISOString(),
                notes: notes,
                location: location,
            });
            toast({ title: 'تم تسجيل الزيارة بنجاح' });
            router.push('/sales/monitor-visits');
        } catch (error) {
            console.error("Failed to save visit:", error);
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ بيانات الزيارة.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col min-h-screen">
            <PageHeader title="تسجيل زيارة عميل" />
            <main className="flex-1 p-4 md:p-6">
                <Card className="w-full max-w-2xl mx-auto">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           تسجيل زيارة جديدة
                           {location && <MapPin className="h-5 w-5 text-green-500 animate-pulse" />}
                        </CardTitle>
                        <CardDescription>املأ التفاصيل التالية لتسجيل زيارتك الميدانية.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {loading ? <Loader2 className="animate-spin mx-auto"/> : (
                             <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="notes">ملاحظات الزيارة</Label>
                                    <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اكتب ملاحظاتك هنا... (مطلوب)" rows={5}/>
                                </div>
                                {locationError && (
                                    <p className="text-sm text-destructive text-center">{locationError}</p>
                                )}
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-end">
                        <Button onClick={handleSaveVisit} disabled={isSaving || loading || !location || !notes.trim()}>
                            {isSaving && <Loader2 className="animate-spin ml-2 h-4 w-4"/>}
                            {isSaving ? 'جارٍ الحفظ...' : 'تسجيل الزيارة'}
                        </Button>
                    </CardFooter>
                </Card>
            </main>
        </div>
    );
}
