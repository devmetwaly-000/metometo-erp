"use client";

import React, { useState, useEffect, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Loader2, MapPin, ShieldCheck, AlertTriangle, Navigation } from "lucide-react";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { calculateDistanceMeters, getFieldSalesConfig } from "@/app/sales/field-sales-management/page";

export default function RecordVisitPage() {
    const { customers, settings, dbAction, loading } = useData();
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const fieldConfig = useMemo(() => getFieldSalesConfig(settings), [settings]);

    const [selectedCustomerId, setSelectedCustomerId] = useState("");
    const [notes, setNotes] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);

    const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
    const plannedRouteCustomerIds = useMemo(() => {
        if (!user?.id) return [];
        return fieldConfig.geoFencing.repDailyRoutes[`${user.id}_${todayStr}`] || [];
    }, [fieldConfig.geoFencing.repDailyRoutes, user?.id, todayStr]);

    const customerOptions = useMemo(() => {
        return (customers || []).map((c: any) => {
            const isInRoute = plannedRouteCustomerIds.includes(c.id);
            return {
                value: c.id,
                label: isInRoute ? `⭐ [ضمن خط سير اليوم] ${c.name}` : c.name,
            };
        });
    }, [customers, plannedRouteCustomerIds]);

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
                    longitude: position.coords.longitude,
                });
            },
            (error) => {
                const errorMessage = `خطأ في تحديد الموقع: ${error.message}`;
                setLocationError(errorMessage);
                toast({ variant: "destructive", title: "خطأ", description: errorMessage });
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, [toast]);

    // فحص النطاق الجغرافي (Geo-Fencing) للعميل المختار
    const geoFenceCheck = useMemo(() => {
        if (!selectedCustomerId || !location) return null;
        const coords = fieldConfig.geoFencing.customerCoordinates[selectedCustomerId];
        if (!coords) return { hasCoords: false, isInside: true, distance: 0, radius: fieldConfig.geoFencing.defaultRadiusMeters };

        const distance = calculateDistanceMeters(
            coords.latitude,
            coords.longitude,
            location.latitude,
            location.longitude
        );
        const radius = coords.radiusMeters || fieldConfig.geoFencing.defaultRadiusMeters || 250;
        return {
            hasCoords: true,
            isInside: distance <= radius,
            distance,
            radius,
        };
    }, [selectedCustomerId, location, fieldConfig.geoFencing]);

    const handleSaveVisit = async () => {
        if (!location) {
            toast({
                variant: "destructive",
                title: "الموقع مطلوب",
                description: "لم يتم تحديد الموقع الجغرافي بعد. يرجى الانتظار أو التأكد من منح الإذن.",
            });
            return;
        }

        if (
            fieldConfig.geoFencing.enabled &&
            fieldConfig.geoFencing.enforceOnVisit &&
            geoFenceCheck?.hasCoords &&
            !geoFenceCheck.isInside
        ) {
            toast({
                variant: "destructive",
                title: "خارج النطاق الجغرافي للعميل (Geo-Fence)",
                description: `أنت على بعد ${geoFenceCheck.distance} متر من موقع العميل المسجل (النطاق المسموح: ${geoFenceCheck.radius} متر). يجب التواجد عند العميل لتسجيل الزيارة.`,
            });
            return;
        }

        const selectedCustomer = (customers || []).find((c: any) => c.id === selectedCustomerId);

        setIsSaving(true);
        try {
            await dbAction("customerVisits", "add", {
                salesRepId: user?.id,
                salesRepName: user?.name,
                customerId: selectedCustomerId || null,
                customerName: selectedCustomer?.name || "زيارة ميدانية عامة",
                timestamp: new Date().toISOString(),
                notes: notes,
                location: location,
            });
            toast({ title: "تم تسجيل الزيارة والتحقق من الموقع الجغرافي بنجاح" });
            router.push("/sales/monitor-visits");
        } catch (error) {
            console.error("Failed to save visit:", error);
            toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ بيانات الزيارة." });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col min-h-screen">
            <PageHeader title="تسجيل زيارة عميل والتحقق الجغرافي (GPS)">
                <Button variant="outline" size="sm" onClick={() => router.push("/sales/field-sales-management")}>
                    <Navigation className="h-4 w-4 ml-1.5" />
                    إدارة خطوط السير وعمولات وجرد المناديب
                </Button>
            </PageHeader>
            <main className="flex-1 p-4 md:p-6">
                <Card className="w-full max-w-2xl mx-auto">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                تسجيل زيارة ميدانية جديدة
                                {location && <MapPin className="h-5 w-5 text-emerald-500 animate-pulse" />}
                            </span>
                            {plannedRouteCustomerIds.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                    خط سير اليوم: {plannedRouteCustomerIds.length} عملاء
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription>اختر العميل من خط السير أو القائمة ليتم التحقق تلقائياً من النطاق الجغرافي عبر الـ GPS.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {loading ? (
                            <Loader2 className="animate-spin mx-auto" />
                        ) : (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>العميل</Label>
                                    <Combobox
                                        options={customerOptions}
                                        value={selectedCustomerId}
                                        onValueChange={setSelectedCustomerId}
                                        placeholder="اختر العميل المراد تسجيل زيارته..."
                                        emptyMessage="لا يوجد عملاء."
                                    />
                                </div>

                                {geoFenceCheck && geoFenceCheck.hasCoords && (
                                    <div
                                        className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                                            geoFenceCheck.isInside
                                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                                                : "bg-destructive/10 border-destructive/30 text-destructive"
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {geoFenceCheck.isInside ? (
                                                <ShieldCheck className="h-5 w-5 shrink-0" />
                                            ) : (
                                                <AlertTriangle className="h-5 w-5 shrink-0" />
                                            )}
                                            <span>
                                                {geoFenceCheck.isInside
                                                    ? `أنت داخل النطاق الجغرافي المعتمد للعميل (المسافة: ${geoFenceCheck.distance} متر)`
                                                    : `تنبيه: أنت خارج النطاق الجغرافي للعميل (المسافة الحالية: ${geoFenceCheck.distance} متر - المسموح: ${geoFenceCheck.radius} متر)`}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="notes">ملاحظات الزيارة</Label>
                                    <Textarea
                                        id="notes"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="اكتب ملاحظاتك ونتيجة الزيارة هنا... (مطلوب)"
                                        rows={4}
                                    />
                                </div>
                                {locationError && <p className="text-sm text-destructive text-center">{locationError}</p>}
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-end">
                        <Button onClick={handleSaveVisit} disabled={isSaving || loading || !location || !notes.trim()}>
                            {isSaving && <Loader2 className="animate-spin ml-2 h-4 w-4" />}
                            {isSaving ? "جارٍ الحفظ..." : "تسجيل واعتماد الزيارة"}
                        </Button>
                    </CardFooter>
                </Card>
            </main>
        </div>
    );
}
