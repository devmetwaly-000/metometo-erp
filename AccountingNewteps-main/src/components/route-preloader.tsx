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

    let cancelled = false;
    let timerId: any = null;

    // دالة تسخين وتخزين المسار بجميع صيغه (HTML, RSC Payload, JS Chunks) ليعمل أوفلاين 100%
    const warmupRoute = async (path: string) => {
      if (cancelled || !navigator.onLine) return;
      if (!path || !path.startsWith('/') || path.startsWith('/api') || path.startsWith('/_next')) return;

      // 1. Next.js Client-Side router prefetch (fetches JS chunks)
      try {
        router.prefetch(path);
      } catch {}

      // 2. تخزين وثيقة الـ HTML الأصلية في pages-cache
      // 3. تخزين محتوى الـ RSC في next-rsc-cache
      await Promise.allSettled([
        fetch(path, {
          headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml' },
          priority: 'low',
        } as any).catch(() => {}),
        fetch(path, {
          headers: { 'RSC': '1', 'Next-Router-Prefetch': '1' },
          priority: 'low',
        } as any).catch(() => {}),
      ]);
    };

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

    const startWarmupQueue = async () => {
      // الانتظار حتى يكون الـ Service Worker نشطاً وجاهزاً لاعتراض الطلبات وحفظها في الكاش
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.ready;
        } catch {}
      }

      if (cancelled || !navigator.onLine) return;

      let allNavRoutes: string[] = [];
      try {
        allNavRoutes = extractRoutes(navStructure || []);
      } catch {
        allNavRoutes = [];
      }

      const orderedRoutes = Array.from(new Set([...highPriorityRoutes, ...allNavRoutes]));
      let idx = 0;

      const processNext = async () => {
        if (cancelled || idx >= orderedRoutes.length) return;
        const nextRoute = orderedRoutes[idx++];
        await warmupRoute(nextRoute);
        if (!cancelled && idx < orderedRoutes.length) {
          timerId = setTimeout(processNext, 100);
        }
      };

      void processNext();
    };

    const startTimer = setTimeout(() => {
      void startWarmupQueue();
    }, 1200);

    const handleOnline = () => {
      void startWarmupQueue();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('online', handleOnline);
    };
  }, [router]);

  return null;
}
