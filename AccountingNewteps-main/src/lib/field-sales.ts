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
        repDailyRoutes: Record<string, string[]>;
    };
    commissions: {
        enabled: boolean;
        tiers: CommissionTier[];
        highMarginBonusEnabled: boolean;
        highMarginThresholdPercent: number;
        highMarginBonusRatePercent: number;
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
