"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import PageHeader from "@/components/page-header";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { useData } from "@/contexts/data-provider";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
    MapPin,
    Navigation,
    TrendingUp,
    Barcode,
    Save,
    Plus,
    Trash2,
    CheckCircle2,
    AlertTriangle,
    Truck,
    Coins,
    PackageCheck,
    Loader2,
    ShieldCheck,
} from "lucide-react";

// حساب المسافة بالمتر بين نقطتين جغرافيتين (Haversine Formula)
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // نصف قطر الأرض بالمتر
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

export interface CommissionTier {
    id: string;
    minCollection: number;
    maxCollection: number;
    ratePercent: number;
}

export interface FieldSalesConfig {
    geoFencing: {
        enabled: boolean;
        enforceOnVisit: boolean;
        enforceOnInvoice: boolean;
        defaultRadiusMeters: number;
        customerCoordinates: Record<string, { latitude: number; longitude: number; radiusMeters?: number }>;
        repDailyRoutes: Record<string, string[]>; // key: `${repId}_${YYYY-MM-DD}` -> customerIds[]
    };
    commissions: {
        enabled: boolean;
        tiers: CommissionTier[];
        highMarginBonusEnabled: boolean;
        highMarginThresholdPercent: number; // مثلاً 30% هامش ربح
        highMarginBonusRatePercent: number; // مثلاً +1.5% عمولة إضافية
    };
}

export const DEFAULT_FIELD_SALES_CONFIG: FieldSalesConfig = {
    geoFencing: {
        enabled: true,
        enforceOnVisit: true,
        enforceOnInvoice: false,
        defaultRadiusMeters: 250,
        customerCoordinates: {},
        repDailyRoutes: {},
    },
    commissions: {
        enabled: true,
        tiers: [
            { id: "t1", minCollection: 0, maxCollection: 20000, ratePercent: 1.0 },
            { id: "t2", minCollection: 20001, maxCollection: 50000, ratePercent: 2.5 },
            { id: "t3", minCollection: 50001, maxCollection: 9999999, ratePercent: 4.0 },
        ],
        highMarginBonusEnabled: true,
        highMarginThresholdPercent: 30,
        highMarginBonusRatePercent: 1.5,
    },
};

export function getFieldSalesConfig(settings: any): FieldSalesConfig {
    const saved = settings?.main?.fieldSales || {};
    return {
        geoFencing: {
            ...DEFAULT_FIELD_SALES_CONFIG.geoFencing,
            ...(saved.geoFencing || {}),
            customerCoordinates: {
                ...DEFAULT_FIELD_SALES_CONFIG.geoFencing.customerCoordinates,
                ...(saved.geoFencing?.customerCoordinates || {}),
            },
            repDailyRoutes: {
                ...DEFAULT_FIELD_SALES_CONFIG.geoFencing.repDailyRoutes,
                ...(saved.geoFencing?.repDailyRoutes || {}),
            },
        },
        commissions: {
            ...DEFAULT_FIELD_SALES_CONFIG.commissions,
            ...(saved.commissions || {}),
            tiers:
                Array.isArray(saved.commissions?.tiers) && saved.commissions.tiers.length > 0
                    ? saved.commissions.tiers
                    : DEFAULT_FIELD_SALES_CONFIG.commissions.tiers,
        },
    };
}

export default function FieldSalesManagementPage() {
    const {
        users,
        customers,
        items: allItems,
        warehouses,
        salesInvoices,
        salesReturns,
        stockIssuesToReps,
        stockReturnsFromReps,
        repRemittances,
        customerVisits,
        settings,
        dbAction,
        getNextId,
        loading,
    } = useData();
    const { user } = useAuth();
    const { toast } = useToast();

    const [config, setConfig] = useState<FieldSalesConfig>(() => getFieldSalesConfig(settings));
    const [isSaving, setIsSaving] = useState(false);

    // فلاتر تخطيط خطوط السير
    const [selectedRouteRepId, setSelectedRouteRepId] = useState("");
    const [selectedRouteDate, setSelectedRouteDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [customerToAddRoute, setCustomerToAddRoute] = useState("");
    const [coordCustomerId, setCoordCustomerId] = useState("");
    const [coordLat, setCoordLat] = useState("");
    const [coordLng, setCoordLng] = useState("");

    // فلاتر حساب العمولات التصاعدية
    const [commFromDate, setCommFromDate] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().split("T")[0];
    });
    const [commToDate, setCommToDate] = useState(() => new Date().toISOString().split("T")[0]);

    // حالة جرد وتسوية عهدة سيارة المندوب بالباركود
    const [auditRepId, setAuditRepId] = useState("");
    const [barcodeScanInput, setBarcodeScanInput] = useState("");
    const [scannedQuantities, setScannedQuantities] = useState<Record<string, number>>({});
    const [isSubmittingReconciliation, setIsSubmittingReconciliation] = useState(false);
    const barcodeInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (settings?.main?.fieldSales) {
            setConfig(getFieldSalesConfig(settings));
        }
    }, [settings]);

    const salesReps = useMemo(() => {
        return (users || []).filter(
            (u: any) => u.isSalesRep || u.role === "مندوب" || (u.role && u.role.includes("مندوب"))
        );
    }, [users]);

    useEffect(() => {
        if (!selectedRouteRepId && salesReps.length > 0) {
            setSelectedRouteRepId(salesReps[0].id);
        }
        if (!auditRepId && salesReps.length > 0) {
            setAuditRepId(salesReps[0].id);
        }
    }, [salesReps, selectedRouteRepId, auditRepId]);

    const handleSaveConfig = async (updatedConfig?: FieldSalesConfig) => {
        const cfgToSave = updatedConfig || config;
        setIsSaving(true);
        try {
            const currentMain = settings?.main || {};
            await dbAction("settings", "update", {
                id: "main",
                data: {
                    ...currentMain,
                    fieldSales: cfgToSave,
                },
            });
            toast({
                title: "تم حفظ إعدادات التوزيع الميداني بنجاح",
                description: "تم تحديث خطوط السير والنطاق الجغرافي وشرائح العمولات.",
            });
        } catch {
            toast({ variant: "destructive", title: "خطأ", description: "تعذر حفظ الإعدادات." });
        } finally {
            setIsSaving(false);
        }
    };

    // 1. إدارة خط السير اليومي للمندوب
    const routeKey = `${selectedRouteRepId}_${selectedRouteDate}`;
    const currentRouteCustomerIds = config.geoFencing.repDailyRoutes[routeKey] || [];

    const handleAddCustomerToRoute = () => {
        if (!selectedRouteRepId || !customerToAddRoute) return;
        if (currentRouteCustomerIds.includes(customerToAddRoute)) {
            toast({ variant: "destructive", title: "موجود بالفعل", description: "العميل مضاف بالفعل لخط سير هذا اليوم." });
            return;
        }
        const nextRoute = [...currentRouteCustomerIds, customerToAddRoute];
        const nextConfig: FieldSalesConfig = {
            ...config,
            geoFencing: {
                ...config.geoFencing,
                repDailyRoutes: {
                    ...config.geoFencing.repDailyRoutes,
                    [routeKey]: nextRoute,
                },
            },
        };
        setConfig(nextConfig);
        setCustomerToAddRoute("");
        handleSaveConfig(nextConfig);
    };

    const handleRemoveCustomerFromRoute = (custId: string) => {
        const nextRoute = currentRouteCustomerIds.filter((id) => id !== custId);
        const nextConfig: FieldSalesConfig = {
            ...config,
            geoFencing: {
                ...config.geoFencing,
                repDailyRoutes: {
                    ...config.geoFencing.repDailyRoutes,
                    [routeKey]: nextRoute,
                },
            },
        };
        setConfig(nextConfig);
        handleSaveConfig(nextConfig);
    };

    const handleSaveCustomerCoords = () => {
        if (!coordCustomerId || !coordLat || !coordLng) {
            toast({ variant: "destructive", title: "بيانات ناقصة", description: "اختر العميل وأدخل خط العرض وخط الطول." });
            return;
        }
        const lat = Number(coordLat);
        const lng = Number(coordLng);
        if (isNaN(lat) || isNaN(lng)) return;

        const nextConfig: FieldSalesConfig = {
            ...config,
            geoFencing: {
                ...config.geoFencing,
                customerCoordinates: {
                    ...config.geoFencing.customerCoordinates,
                    [coordCustomerId]: {
                        latitude: lat,
                        longitude: lng,
                        radiusMeters: config.geoFencing.defaultRadiusMeters,
                    },
                },
            },
        };
        setConfig(nextConfig);
        handleSaveConfig(nextConfig);
        toast({ title: "تم حفظ الإحداثيات الجغرافية للعميل" });
    };

    const handleCaptureCurrentGps = () => {
        if (!navigator.geolocation) {
            toast({ variant: "destructive", title: "غير مدعوم", description: "المتصفح لا يدعم GPS." });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setCoordLat(pos.coords.latitude.toFixed(6));
                setCoordLng(pos.coords.longitude.toFixed(6));
                toast({ title: "تم التقاط الموقع الحالي بنجاح" });
            },
            (err) => {
                toast({ variant: "destructive", title: "تعذر التقاط الموقع", description: err.message });
            }
        );
    };

    // تحليل إنجاز خط السير والتحقق من الـ Geo-Fencing
    const routeProgressList = useMemo(() => {
        return currentRouteCustomerIds.map((custId, idx) => {
            const cust = (customers || []).find((c: any) => c.id === custId);
            const coords = config.geoFencing.customerCoordinates[custId];

            // البحث عن زيارة أو فاتورة للمندوب في هذا التاريخ لهذا العميل
            const visitOnDay = (customerVisits || []).find((v: any) => {
                const vDate = v.timestamp ? new Date(v.timestamp).toISOString().split("T")[0] : "";
                return (
                    v.salesRepId === selectedRouteRepId &&
                    vDate === selectedRouteDate &&
                    (v.customerId === custId || v.customerName === cust?.name)
                );
            });

            const invoiceOnDay = (salesInvoices || []).find((s: any) => {
                const sDate = s.date ? new Date(s.date).toISOString().split("T")[0] : "";
                return s.salesRepId === selectedRouteRepId && sDate === selectedRouteDate && s.customerId === custId;
            });

            let distanceMeters: number | null = null;
            let isInsideFence = false;
            const radius = coords?.radiusMeters || config.geoFencing.defaultRadiusMeters || 250;

            const recordedLoc = visitOnDay?.location || invoiceOnDay?.location;
            if (coords && recordedLoc && recordedLoc.latitude != null && recordedLoc.longitude != null) {
                distanceMeters = calculateDistanceMeters(
                    coords.latitude,
                    coords.longitude,
                    Number(recordedLoc.latitude),
                    Number(recordedLoc.longitude)
                );
                isInsideFence = distanceMeters <= radius;
            }

            return {
                order: idx + 1,
                customerId: custId,
                customerName: cust?.name || "عميل",
                phone: cust?.phone || "-",
                coords,
                visited: Boolean(visitOnDay || invoiceOnDay),
                hasInvoice: Boolean(invoiceOnDay),
                invoiceTotal: invoiceOnDay?.total || 0,
                distanceMeters,
                isInsideFence,
                radius,
            };
        });
    }, [
        currentRouteCustomerIds,
        customers,
        config.geoFencing,
        customerVisits,
        salesInvoices,
        selectedRouteRepId,
        selectedRouteDate,
    ]);

    // 2. حساب الشرائح والعمولات التصاعدية للمناديب بناءً على التحصيل الفعلي + الأصناف ذات هامش الربح المرتفع
    const repsCommissionReport = useMemo(() => {
        const start = commFromDate ? new Date(`${commFromDate}T00:00:00`) : null;
        const end = commToDate ? new Date(`${commToDate}T23:59:59`) : null;
        const inRange = (dStr: string) => {
            if (!dStr) return false;
            const d = new Date(dStr);
            if (start && d < start) return false;
            if (end && d > end) return false;
            return true;
        };

        const itemsMap = new Map((allItems || []).map((i: any) => [i.id, i]));

        return salesReps.map((rep: any) => {
            const repSales = (salesInvoices || []).filter(
                (s: any) =>
                    s.salesRepId === rep.id &&
                    (s.status === "approved" || s.status === "completed" || !s.status) &&
                    inRange(s.date)
            );
            const repRemits = (repRemittances || []).filter(
                (r: any) => (r.salesRepId === rep.id || r.userId === rep.id) && inRange(r.date)
            );

            const totalSoldValue = repSales.reduce((sum: number, s: any) => sum + Number(s.total || 0), 0);
            const paidOnInvoices = repSales.reduce((sum: number, s: any) => sum + Number(s.paidAmount || 0), 0);
            const totalRemitted = repRemits.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

            // التحصيل الفعلي المعتمد للعمولة (أكبر القيمتين بين المسدد على الفواتير أو المورد للخزينة)
            const actualCollected = Math.max(paidOnInvoices, totalRemitted);

            // تحديد شريحة العمولة التصاعدية
            const matchingTier =
                config.commissions.tiers.find(
                    (t) => actualCollected >= t.minCollection && actualCollected <= t.maxCollection
                ) || config.commissions.tiers[config.commissions.tiers.length - 1];

            const tierRate = matchingTier ? Number(matchingTier.ratePercent || 0) : 0;
            const collectionCommission = (actualCollected * tierRate) / 100;

            // حساب عمولة الأصناف ذات هامش الربح المرتفع
            let highMarginSalesValue = 0;
            let highMarginBonusCommission = 0;

            if (config.commissions.highMarginBonusEnabled) {
                repSales.forEach((sale: any) => {
                    (sale.items || []).forEach((it: any) => {
                        const master: any = itemsMap.get(it.id);
                        const cost = Number(it.cost || master?.cost || 0);
                        const price = Number(it.price || 0);
                        const qty = Number(it.qty || 1);
                        const lineRevenue = Number(it.total ?? qty * price);
                        if (price > 0) {
                            const marginPercent = ((price - cost) / price) * 100;
                            if (marginPercent >= config.commissions.highMarginThresholdPercent) {
                                highMarginSalesValue += lineRevenue;
                            }
                        }
                    });
                });
                highMarginBonusCommission =
                    (highMarginSalesValue * Number(config.commissions.highMarginBonusRatePercent || 0)) / 100;
            }

            return {
                repId: rep.id,
                repName: rep.name,
                invoicesCount: repSales.length,
                totalSoldValue,
                actualCollected,
                tierRate,
                collectionCommission,
                highMarginSalesValue,
                highMarginBonusCommission,
                totalCommission: collectionCommission + highMarginBonusCommission,
            };
        });
    }, [salesReps, salesInvoices, repRemittances, allItems, commFromDate, commToDate, config.commissions]);

    // 3. حساب الرصيد الدفتري لعهدة سيارة المندوب ومطابقته بالباركود
    const vanCustodyItems = useMemo(() => {
        if (!auditRepId) return [];
        const map = new Map<
            string,
            {
                id: string;
                code: string;
                barcode: string;
                name: string;
                price: number;
                cost: number;
                issued: number;
                sold: number;
                returnedToWh: number;
                customerReturns: number;
                bookBalance: number;
            }
        >();

        (allItems || []).forEach((it: any) => {
            map.set(it.id, {
                id: it.id,
                code: it.code || "",
                barcode: it.barcode || it.code || "",
                name: it.name,
                price: Number(it.price || 0),
                cost: Number(it.cost || 0),
                issued: 0,
                sold: 0,
                returnedToWh: 0,
                customerReturns: 0,
                bookBalance: 0,
            });
        });

        (stockIssuesToReps || [])
            .filter((iss: any) => iss.salesRepId === auditRepId)
            .forEach((iss: any) => {
                (iss.items || []).forEach((it: any) => {
                    const row = map.get(it.id || it.itemId);
                    if (row) row.issued += Number(it.qty || 0);
                });
            });

        (salesInvoices || [])
            .filter(
                (s: any) =>
                    s.salesRepId === auditRepId && (s.status === "approved" || s.status === "completed" || !s.status)
            )
            .forEach((s: any) => {
                (s.items || []).forEach((it: any) => {
                    const row = map.get(it.id || it.itemId);
                    if (row) row.sold += Number(it.qty || 0);
                });
            });

        (stockReturnsFromReps || [])
            .filter((r: any) => r.salesRepId === auditRepId)
            .forEach((r: any) => {
                (r.items || []).forEach((it: any) => {
                    const row = map.get(it.id || it.itemId);
                    if (row) row.returnedToWh += Number(it.qty || 0);
                });
            });

        (salesReturns || [])
            .filter((sr: any) => sr.salesRepId === auditRepId || sr.createdById === auditRepId)
            .forEach((sr: any) => {
                (sr.items || []).forEach((it: any) => {
                    const row = map.get(it.id || it.itemId);
                    if (row) row.customerReturns += Number(it.qty || 0);
                });
            });

        return Array.from(map.values())
            .map((row) => ({
                ...row,
                bookBalance: row.issued - row.sold - row.returnedToWh + row.customerReturns,
            }))
            .filter(
                (row) =>
                    row.bookBalance !== 0 ||
                    row.issued > 0 ||
                    scannedQuantities[row.id] !== undefined
            );
    }, [auditRepId, allItems, stockIssuesToReps, salesInvoices, stockReturnsFromReps, salesReturns, scannedQuantities]);

    const handleBarcodeScanSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const code = barcodeScanInput.trim();
        if (!code) return;

        const foundItem = (allItems || []).find(
            (i: any) =>
                String(i.code) === code ||
                String(i.barcode) === code ||
                i.name?.toLowerCase() === code.toLowerCase()
        );

        if (!foundItem) {
            toast({
                variant: "destructive",
                title: "باركود غير معروف",
                description: `لم يتم العثور على صنف يطابق الباركود (${code}).`,
            });
            setBarcodeScanInput("");
            return;
        }

        setScannedQuantities((prev) => ({
            ...prev,
            [foundItem.id]: (prev[foundItem.id] || 0) + 1,
        }));
        setBarcodeScanInput("");
        barcodeInputRef.current?.focus();
    };

    const handleApproveVanReconciliation = async () => {
        if (!auditRepId || vanCustodyItems.length === 0) return;
        setIsSubmittingReconciliation(true);
        try {
            const rep = salesReps.find((r: any) => r.id === auditRepId);
            const repWarehouse = (warehouses || []).find((w: any) => w.repId === auditRepId && w.isRepWarehouse);
            const targetWarehouseId = repWarehouse?.id || warehouses[0]?.id;

            const adjustmentItems = vanCustodyItems
                .map((item) => {
                    const actualQty = scannedQuantities[item.id] ?? item.bookBalance;
                    const difference = actualQty - item.bookBalance;
                    return {
                        itemId: item.id,
                        id: item.id,
                        name: item.name,
                        code: item.code,
                        systemQty: item.bookBalance,
                        actualQty,
                        difference,
                        cost: item.cost,
                    };
                })
                .filter((i) => i.difference !== 0);

            if (adjustmentItems.length === 0) {
                toast({
                    title: "العهدة مطابقة 100%",
                    description: "الجرد الفعلي بالباركود يطابق الرصيد الدفتري لسيارة المندوب تماماً ولا يوجد عجز أو زيادة.",
                });
                setIsSubmittingReconciliation(false);
                return;
            }

            const receiptNumber = `ت-م-${await getNextId("stockAdjustment")}`;
            await dbAction("stockAdjustmentRecords", "add", {
                receiptNumber,
                date: new Date().toISOString(),
                warehouseId: targetWarehouseId,
                salesRepId: auditRepId,
                reason: `تسوية جرد عهدة سيارة المندوب (${rep?.name || ""}) بالباركود`,
                notes: `تسوية آلية لعهدة سيارة المندوب ${rep?.name || ""}`,
                createdById: user?.id,
                createdByName: user?.name,
                items: adjustmentItems,
            });

            toast({
                title: "تم اعتماد تسوية عهدة السيارة بنجاح",
                description: `تم إصدار سند التسوية رقم ${receiptNumber} بعدد ${adjustmentItems.length} صنف به فروق جرد.`,
            });
        } catch {
            toast({ variant: "destructive", title: "خطأ", description: "فشل حفظ تسوية العهدة." });
        } finally {
            setIsSubmittingReconciliation(false);
        }
    };

    const customerOptions = useMemo(() => {
        return (customers || []).map((c: any) => ({ value: c.id, label: `${c.name} (${c.phone || "بدون هاتف"})` }));
    }, [customers]);

    return (
        <>
            <PageHeader title="إدارة المناديب والتوزيع الميداني (Field & Van Sales)">
                <Button size="sm" onClick={() => handleSaveConfig()} disabled={isSaving} className="gap-1.5">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    حفظ الإعدادات
                </Button>
            </PageHeader>

            <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <Tabs defaultValue="routes" className="w-full" dir="rtl">
                    <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto gap-2 p-1">
                        <TabsTrigger value="routes" className="gap-2 py-2.5">
                            <Navigation className="h-4 w-4" />
                            1. تخطيط خطوط السير والتحقق الجغرافي (Geo-Fencing)
                        </TabsTrigger>
                        <TabsTrigger value="commissions" className="gap-2 py-2.5">
                            <TrendingUp className="h-4 w-4" />
                            2. الشرائح والعمولات التصاعدية للمناديب
                        </TabsTrigger>
                        <TabsTrigger value="van-audit" className="gap-2 py-2.5">
                            <Barcode className="h-4 w-4" />
                            3. التسوية الآلية لعهدة سيارة المندوب بالباركود
                        </TabsTrigger>
                    </TabsList>

                    {/* التبويب الأول: تخطيط خطوط السير والـ Geo-Fencing */}
                    <TabsContent value="routes" className="space-y-6 mt-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* إعدادات النطاق الجغرافي */}
                            <Card className="lg:col-span-1">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <MapPin className="h-5 w-5 text-primary" />
                                        ضبط النطاق الجغرافي (Geo-Fencing)
                                    </CardTitle>
                                    <CardDescription>التحقق عبر الـ GPS من أن الزيارة أو الفاتورة تمت فعلياً عند موقع العميل.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs">تفعيل التحقق الجغرافي (Geo-Fence)</Label>
                                        <Switch
                                            checked={config.geoFencing.enabled}
                                            onCheckedChange={(v) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    geoFencing: { ...prev.geoFencing, enabled: v },
                                                }))
                                            }
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">نصف قطر النطاق الجغرافي المسموح للعميل (بالمتر)</Label>
                                        <Input
                                            type="number"
                                            min={20}
                                            value={config.geoFencing.defaultRadiusMeters}
                                            onChange={(e) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    geoFencing: {
                                                        ...prev.geoFencing,
                                                        defaultRadiusMeters: Math.max(20, Number(e.target.value) || 250),
                                                    },
                                                }))
                                            }
                                        />
                                    </div>

                                    <div className="border-t pt-4 space-y-3">
                                        <Label className="text-xs font-bold">تحديد الموقع الجغرافي (GPS) لعميل:</Label>
                                        <Combobox
                                            options={customerOptions}
                                            value={coordCustomerId}
                                            onValueChange={(val) => {
                                                setCoordCustomerId(val);
                                                const existing = config.geoFencing.customerCoordinates[val];
                                                if (existing) {
                                                    setCoordLat(String(existing.latitude));
                                                    setCoordLng(String(existing.longitude));
                                                } else {
                                                    setCoordLat("");
                                                    setCoordLng("");
                                                }
                                            }}
                                            placeholder="اختر العميل..."
                                            emptyMessage="لا يوجد عملاء."
                                        />
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-[11px]">خط العرض (Latitude)</Label>
                                                <Input
                                                    placeholder="30.0444"
                                                    value={coordLat}
                                                    onChange={(e) => setCoordLat(e.target.value)}
                                                    className="h-8 text-xs font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[11px]">خط الطول (Longitude)</Label>
                                                <Input
                                                    placeholder="31.2357"
                                                    value={coordLng}
                                                    onChange={(e) => setCoordLng(e.target.value)}
                                                    className="h-8 text-xs font-mono"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button type="button" variant="outline" size="sm" className="flex-1 text-xs" onClick={handleCaptureCurrentGps}>
                                                <MapPin className="h-3.5 w-3.5 ml-1" />
                                                التقاط موقعي الحالي
                                            </Button>
                                            <Button type="button" size="sm" className="flex-1 text-xs" onClick={handleSaveCustomerCoords}>
                                                حفظ موقع العميل
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* جدول خط السير اليومي للمندوب */}
                            <Card className="lg:col-span-2">
                                <CardHeader>
                                    <CardTitle className="text-base">جدول خط السير اليومي للمندوب ومتابعة الالتزام الجغرافي</CardTitle>
                                    <CardDescription>حدد المندوب والتاريخ لإسناد قائمة العملاء المطلوب زيارتهم ومتابعة التحقق عبر الـ GPS.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">المندوب</Label>
                                            <Select value={selectedRouteRepId} onValueChange={setSelectedRouteRepId}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="اختر المندوب" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {salesReps.map((r: any) => (
                                                        <SelectItem key={r.id} value={r.id}>
                                                            {r.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">تاريخ خط السير</Label>
                                            <Input type="date" value={selectedRouteDate} onChange={(e) => setSelectedRouteDate(e.target.value)} />
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <Combobox
                                                    options={customerOptions}
                                                    value={customerToAddRoute}
                                                    onValueChange={setCustomerToAddRoute}
                                                    placeholder="إضافة عميل لخط السير..."
                                                    emptyMessage="لا يوجد عملاء."
                                                />
                                            </div>
                                            <Button type="button" size="icon" onClick={handleAddCustomerToRoute} title="إضافة لخط السير">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="w-full overflow-auto border rounded-lg">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-12 text-center">#</TableHead>
                                                    <TableHead>العميل</TableHead>
                                                    <TableHead className="text-center">الإحداثيات المسجلة</TableHead>
                                                    <TableHead className="text-center">حالة الزيارة / الفاتورة</TableHead>
                                                    <TableHead className="text-center">التحقق الجغرافي (Geo-Fence)</TableHead>
                                                    <TableHead className="text-center">حذف</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {routeProgressList.length > 0 ? (
                                                    routeProgressList.map((item) => (
                                                        <TableRow key={item.customerId}>
                                                            <TableCell className="text-center font-mono font-bold">{item.order}</TableCell>
                                                            <TableCell>
                                                                <div className="font-medium">{item.customerName}</div>
                                                                <div className="text-xs text-muted-foreground font-mono">{item.phone}</div>
                                                            </TableCell>
                                                            <TableCell className="text-center text-xs font-mono">
                                                                {item.coords ? (
                                                                    <Badge variant="outline" className="font-mono text-[10px]">
                                                                        {item.coords.latitude.toFixed(4)}, {item.coords.longitude.toFixed(4)}
                                                                    </Badge>
                                                                ) : (
                                                                    <span className="text-muted-foreground">غير محددة</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                {item.visited ? (
                                                                    <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                                        تمت الزيارة {item.hasInvoice ? `(فاتورة: ${item.invoiceTotal.toLocaleString()} ج.م)` : ""}
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="secondary">في الانتظار</Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                {item.distanceMeters !== null ? (
                                                                    item.isInsideFence ? (
                                                                        <Badge className="bg-emerald-600 text-white gap-1">
                                                                            <ShieldCheck className="h-3 w-3" />
                                                                            داخل النطاق ({item.distanceMeters} متر)
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="destructive" className="gap-1">
                                                                            <AlertTriangle className="h-3 w-3" />
                                                                            خارج النطاق ({item.distanceMeters} متر)
                                                                        </Badge>
                                                                    )
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground">-</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 text-destructive"
                                                                    onClick={() => handleRemoveCustomerFromRoute(item.customerId)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                                            لم يتم إسناد عملاء لخط سير هذا المندوب في التاريخ المحدد. اختر عميلاً واضغط (+) لإضافته.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* التبويب الثاني: الشرائح والعمولات التصاعدية للمناديب */}
                    <TabsContent value="commissions" className="space-y-6 mt-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card className="lg:col-span-1">
                                <CardHeader>
                                    <CardTitle className="text-base">شرائح عمولات التحصيل والأصناف عالية الربحية</CardTitle>
                                    <CardDescription>تُحتسب العمولة تصاعدياً بناءً على التحصيل النقدي الفعلي + بونص الأصناف ذات الهامش المرتفع.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {config.commissions.tiers.map((tier, idx) => (
                                        <div key={tier.id} className="grid grid-cols-3 gap-2 items-end border p-2.5 rounded-lg bg-muted/20">
                                            <div>
                                                <Label className="text-[10px]">من تحصيل (ج.م)</Label>
                                                <Input
                                                    type="number"
                                                    value={tier.minCollection}
                                                    onChange={(e) => {
                                                        const next = [...config.commissions.tiers];
                                                        next[idx] = { ...tier, minCollection: Number(e.target.value) || 0 };
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            commissions: { ...prev.commissions, tiers: next },
                                                        }));
                                                    }}
                                                    className="h-8 text-xs font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[10px]">إلى تحصيل (ج.م)</Label>
                                                <Input
                                                    type="number"
                                                    value={tier.maxCollection}
                                                    onChange={(e) => {
                                                        const next = [...config.commissions.tiers];
                                                        next[idx] = { ...tier, maxCollection: Number(e.target.value) || 0 };
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            commissions: { ...prev.commissions, tiers: next },
                                                        }));
                                                    }}
                                                    className="h-8 text-xs font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[10px]">نسبة العمولة %</Label>
                                                <Input
                                                    type="number"
                                                    step="0.25"
                                                    value={tier.ratePercent}
                                                    onChange={(e) => {
                                                        const next = [...config.commissions.tiers];
                                                        next[idx] = { ...tier, ratePercent: Number(e.target.value) || 0 };
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            commissions: { ...prev.commissions, tiers: next },
                                                        }));
                                                    }}
                                                    className="h-8 text-xs font-mono font-bold text-emerald-500"
                                                />
                                            </div>
                                        </div>
                                    ))}

                                    <div className="border-t pt-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-bold">بونص الأصناف ذات هامش الربح المرتفع</Label>
                                            <Switch
                                                checked={config.commissions.highMarginBonusEnabled}
                                                onCheckedChange={(v) =>
                                                    setConfig((prev) => ({
                                                        ...prev,
                                                        commissions: { ...prev.commissions, highMarginBonusEnabled: v },
                                                    }))
                                                }
                                            />
                                        </div>
                                        {config.commissions.highMarginBonusEnabled && (
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <Label className="text-[11px]">هامش ربح الصنف أكبر من %</Label>
                                                    <Input
                                                        type="number"
                                                        value={config.commissions.highMarginThresholdPercent}
                                                        onChange={(e) =>
                                                            setConfig((prev) => ({
                                                                ...prev,
                                                                commissions: {
                                                                    ...prev.commissions,
                                                                    highMarginThresholdPercent: Number(e.target.value) || 30,
                                                                },
                                                            }))
                                                        }
                                                        className="h-8 text-xs font-mono"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-[11px]">عمولة إضافية %</Label>
                                                    <Input
                                                        type="number"
                                                        step="0.25"
                                                        value={config.commissions.highMarginBonusRatePercent}
                                                        onChange={(e) =>
                                                            setConfig((prev) => ({
                                                                ...prev,
                                                                commissions: {
                                                                    ...prev.commissions,
                                                                    highMarginBonusRatePercent: Number(e.target.value) || 1.5,
                                                                },
                                                            }))
                                                        }
                                                        className="h-8 text-xs font-mono font-bold text-amber-500"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button className="w-full" size="sm" onClick={() => handleSaveConfig()} disabled={isSaving}>
                                        حفظ شرائح العمولات
                                    </Button>
                                </CardFooter>
                            </Card>

                            <Card className="lg:col-span-2">
                                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                    <div>
                                        <CardTitle className="text-base">كشف احتساب عمولات المناديب الآلي</CardTitle>
                                        <CardDescription>يعتمد على التحصيل النقدي الفعلي + عمولة الأصناف عالية الربحية.</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input type="date" value={commFromDate} onChange={(e) => setCommFromDate(e.target.value)} className="h-8 text-xs w-36" />
                                        <span className="text-xs">إلى</span>
                                        <Input type="date" value={commToDate} onChange={(e) => setCommToDate(e.target.value)} className="h-8 text-xs w-36" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="w-full overflow-auto border rounded-lg">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>المندوب</TableHead>
                                                    <TableHead className="text-center">إجمالي المبيعات</TableHead>
                                                    <TableHead className="text-center">التحصيل الفعلي</TableHead>
                                                    <TableHead className="text-center">شريحة التحصيل</TableHead>
                                                    <TableHead className="text-center">عمولة التحصيل</TableHead>
                                                    <TableHead className="text-center">بونص الهامش المرتفع</TableHead>
                                                    <TableHead className="text-center">إجمالي العمولة المستحقة</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {repsCommissionReport.length > 0 ? (
                                                    repsCommissionReport.map((row) => (
                                                        <TableRow key={row.repId}>
                                                            <TableCell className="font-bold">{row.repName}</TableCell>
                                                            <TableCell className="text-center font-mono">{row.totalSoldValue.toLocaleString()} ج.م</TableCell>
                                                            <TableCell className="text-center font-mono font-semibold text-blue-500">
                                                                {row.actualCollected.toLocaleString()} ج.م
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Badge variant="outline" className="font-mono">
                                                                    {row.tierRate}%
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-center font-mono">
                                                                {row.collectionCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                                                            </TableCell>
                                                            <TableCell className="text-center font-mono text-amber-500">
                                                                +{row.highMarginBonusCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                                                            </TableCell>
                                                            <TableCell className="text-center font-mono">
                                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30">
                                                                    {row.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                                                                </span>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                            لا يوجد مناديب مسجلون.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* التبويب الثالث: التسوية الآلية لعهدة سيارة المندوب بالباركود */}
                    <TabsContent value="van-audit" className="space-y-6 mt-4">
                        <Card>
                            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Truck className="h-5 w-5 text-primary" />
                                        الجرد والتسوية الآلية لعهدة سيارة المندوب بالباركود
                                    </CardTitle>
                                    <CardDescription>
                                        اختر المندوب وامسح الباركود للبضاعة المتبقية في السيارة لمطابقتها فورياً مع الرصيد الدفتري وتوليد سند تسوية العجز أو الزيادة تلقائياً.
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const initial: Record<string, number> = {};
                                            vanCustodyItems.forEach((it) => {
                                                initial[it.id] = 0;
                                            });
                                            setScannedQuantities(initial);
                                            barcodeInputRef.current?.focus();
                                        }}
                                    >
                                        تصفير العداد لبدء الجرد بالباركود
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleApproveVanReconciliation}
                                        disabled={isSubmittingReconciliation || vanCustodyItems.length === 0}
                                        className="gap-1.5"
                                    >
                                        {isSubmittingReconciliation ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                                        اعتماد التسوية وتوليد سند الفروق تلقائياً
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div className="space-y-1.5">
                                        <Label>المندوب (عهدة السيارة)</Label>
                                        <Select
                                            value={auditRepId}
                                            onValueChange={(v) => {
                                                setAuditRepId(v);
                                                setScannedQuantities({});
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="اختر المندوب" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {salesReps.map((r: any) => (
                                                    <SelectItem key={r.id} value={r.id}>
                                                        {r.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <form onSubmit={handleBarcodeScanSubmit} className="md:col-span-2 flex gap-2">
                                        <div className="relative flex-1">
                                            <Barcode className="h-5 w-5 absolute right-3 top-2.5 text-primary" />
                                            <Input
                                                ref={barcodeInputRef}
                                                placeholder="امسح باركود الصنف هنا أو اكتب الكود واضغط Enter (+1 لكل مسحة)..."
                                                value={barcodeScanInput}
                                                onChange={(e) => setBarcodeScanInput(e.target.value)}
                                                className="pr-10 font-mono"
                                            />
                                        </div>
                                        <Button type="submit">إضافة +1</Button>
                                    </form>
                                </div>

                                <div className="w-full overflow-auto border rounded-lg">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>الباركود</TableHead>
                                                <TableHead>الصنف</TableHead>
                                                <TableHead className="text-center">مصروف للمندوب</TableHead>
                                                <TableHead className="text-center">مباع</TableHead>
                                                <TableHead className="text-center">مرتجع للمخزن</TableHead>
                                                <TableHead className="text-center font-bold">رصيد العهدة الدفتري</TableHead>
                                                <TableHead className="text-center">الجرد الفعلي بالباركود</TableHead>
                                                <TableHead className="text-center">الفرق (عجز / زيادة)</TableHead>
                                                <TableHead className="text-center">قيمة الفرق</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {vanCustodyItems.length > 0 ? (
                                                vanCustodyItems.map((item) => {
                                                    const actual = scannedQuantities[item.id] ?? item.bookBalance;
                                                    const diff = actual - item.bookBalance;
                                                    const diffVal = diff * item.price;
                                                    return (
                                                        <TableRow key={item.id}>
                                                            <TableCell className="font-mono text-xs">{item.barcode}</TableCell>
                                                            <TableCell className="font-medium">{item.name}</TableCell>
                                                            <TableCell className="text-center">{item.issued}</TableCell>
                                                            <TableCell className="text-center text-emerald-500">{item.sold}</TableCell>
                                                            <TableCell className="text-center">{item.returnedToWh}</TableCell>
                                                            <TableCell className="text-center font-bold font-mono text-primary">
                                                                {item.bookBalance}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Input
                                                                    type="number"
                                                                    value={actual}
                                                                    onChange={(e) =>
                                                                        setScannedQuantities((prev) => ({
                                                                            ...prev,
                                                                            [item.id]: Number(e.target.value) || 0,
                                                                        }))
                                                                    }
                                                                    className="w-24 h-8 mx-auto text-center font-mono font-bold"
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-center font-mono">
                                                                {diff === 0 ? (
                                                                    <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                                        مطابق (0)
                                                                    </Badge>
                                                                ) : diff < 0 ? (
                                                                    <Badge variant="destructive">عجز ({diff})</Badge>
                                                                ) : (
                                                                    <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                                        زيادة (+{diff})
                                                                    </Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell
                                                                className={`text-center font-mono font-bold ${
                                                                    diff < 0 ? "text-destructive" : diff > 0 ? "text-amber-500" : "text-muted-foreground"
                                                                }`}
                                                            >
                                                                {diff === 0 ? "-" : `${diffVal.toLocaleString()} ج.م`}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                                                        لا توجد أصناف بعهدة سيارة المندوب المختار حالياً.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </>
    );
}
