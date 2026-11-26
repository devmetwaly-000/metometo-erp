"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { navStructure } from "@/components/app-layout";

const highPriorityRoutes = [
  '/pos',
  '/pos/sessions',
  '/sales/invoices/list',
  '/sales/invoices',
  '/master-data/items',
  '/master-data/customers',
  '/purchases/invoices/list',
  '/purchases/invoices',
  '/inventory/stock-status',
  '/inventory/transfer',
  '/accounting/expenses',
  '/reports',
  '/reports/sales-reports',
  '/reports/purchases-report',
  '/reports/inventory-valuation',
  '/reports/pos-reconciliation',
];

export function RoutePreloader() {
  const router = useRouter();
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // دالة تسخين وتخزين المسار بجميع صيغه (HTML, RSC Payload, JS Chunks) ليعمل أوفلاين 100%
    const warmupRoute = (path: string) => {
      if (!path || !path.startsWith('/') || path.startsWith('/api') || path.startsWith('/_next')) return;

      // 1. Next.js Client-Side router prefetch
      try {
        router.prefetch(path);
      } catch {}

      // 2. تخزين وثيقة الـ HTML الأصلية في pages-cache
      try {
        fetch(path, {
          headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml' },
          priority: 'low',
        }).catch(() => {});
      } catch {}

      // 3. تخزين محتوى الـ RSC عبر الـ Headers في next-rsc-cache
      try {
        fetch(path, {
          headers: { 'RSC': '1', 'Next-Router-Prefetch': '1' },
          priority: 'low',
        }).catch(() => {});
      } catch {}

      // 4. تخزين محتوى الـ RSC عبر Query String المتوافق مع Next.js App Router
      try {
        const sep = path.includes('?') ? '&' : '?';
        fetch(`${path}${sep}_rsc=offline_ready`, {
          headers: { 'RSC': '1' },
          priority: 'low',
        }).catch(() => {});
      } catch {}
    };

    // استخراج جميع الروابط من القوائم
    const extractRoutes = (items: readonly any[]): string[] => {
      let routes: string[] = [];
      for (const item of items) {
        if (item.href && typeof item.href === 'string' && item.href.startsWith('/')) {
          routes.push(item.href);
        }
        if (item.children) {
          routes = routes.concat(extractRoutes(item.children));
        }
      }
      return routes;
    };

    // 1. تشغيل المسارات الأساسية ذات الأولوية فوراً
    highPriorityRoutes.forEach((route) => {
      warmupRoute(route);
    });

    // 2. تشغيل باقي المسارات تدريجياً في الخلفية بدون التأثير على سلاسة التطبيق
    let remainingRoutes: string[] = [];
    try {
      const all = extractRoutes(navStructure || []);
      remainingRoutes = Array.from(new Set(all.filter((r) => !highPriorityRoutes.includes(r))));
    } catch {
      remainingRoutes = [];
    }

    let idx = 0;
    let timerId: any = null;

    const prefetchNext = () => {
      if (idx < remainingRoutes.length) {
        const nextRoute = remainingRoutes[idx];
        warmupRoute(nextRoute);
        idx++;
        timerId = setTimeout(prefetchNext, 150);
      }
    };

    const idleTimer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => prefetchNext());
      } else {
        prefetchNext();
      }
    }, 2000);

    // إعادة تسخين الكاش عند عودة الاتصال لضمان تحديث الصفحات
    const handleOnline = () => {
      highPriorityRoutes.forEach((route) => warmupRoute(route));
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(idleTimer);
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('online', handleOnline);
    };
  }, [router]);

  return null;
}
