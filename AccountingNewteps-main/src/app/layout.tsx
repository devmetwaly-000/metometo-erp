"use client";

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppLayout } from "@/app/app-layout";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { PermissionsProvider } from "@/contexts/permissions-context";
import { AuthProvider } from "@/contexts/auth-context";
import { DataProvider, useData } from "@/contexts/data-provider";
import { NotificationProvider } from "@/contexts/notification-context";
import React, { ReactNode, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, Smartphone, X, Database } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";


// New component to handle PWA lifecycle events and Mobile Install Banner
const PWALifecycle = () => {
  const { toast } = useToast();
  const { isOnline } = useData();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );

    if (isStandalone) {
      setShowInstallBanner(false);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = sessionStorage.getItem('pwa_install_dismissed');
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Also on mobile devices, if beforeinstallprompt doesn't fire (e.g. iOS or LAN HTTP), show the banner anyway after 1.5s
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      const dismissed = sessionStorage.getItem('pwa_install_dismissed');
      if (!dismissed) {
        const timer = setTimeout(() => {
          setShowInstallBanner(true);
        }, 1500);
        return () => {
          clearTimeout(timer);
          window.removeEventListener('beforeinstallprompt', handler);
        };
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        toast({
          title: "تم تثبيت التطبيق بنجاح",
          description: "يمكنك الآن فتح البرنامج مباشرة من الشاشة الرئيسية للموبايل.",
        });
      }
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    } else {
      // Show installation guide modal for iOS or manual Android install
      setShowGuideModal(true);
    }
  };

  useEffect(() => {
    if (!isOnline) {
        toast({
            variant: "destructive",
            title: "أنت في وضع عدم الاتصال",
            description: "يتم استخدام البيانات والصفحات المخزنة محلياً.",
            duration: 5000,
        });
    }
  }, [isOnline, toast]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Auto-heal Workbox bad precaching / stale build cache errors
      const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        const reasonStr = String(event?.reason?.message || event?.reason || '');
        if (reasonStr.includes('bad-precaching-response') || reasonStr.includes('_buildManifest.js')) {
          console.warn('[PWA] Stale service worker cache detected. Purging old registrations...');
          navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => void r.unregister());
          });
          if ('caches' in window) {
            caches.keys().then(names => {
              names.forEach(name => void caches.delete(name));
            });
          }
        }
      };
      window.addEventListener('unhandledrejection', handleUnhandledRejection);

      if ((window as any).workbox !== undefined) {
        const wb = (window as any).workbox;

        wb.addEventListener('installed', (event: any) => {
          if (!event.isUpdate) {
              toast({
                  title: "التطبيق جاهز للعمل أوفلاين",
                  description: "تم تخزين جميع البيانات والصفحات للوصول إليها بدون اتصال بالإنترنت.",
                  duration: 6000,
              });
          }
        });

        wb.addEventListener('waiting', () => {
          void wb.messageSkipWaiting();
        });

        wb.addEventListener('activated', (event: any) => {
          if (event.isUpdate) window.location.reload();
        });

        void wb.register({ immediate: true })
          .then(() => wb.update())
          .catch((error: any) => console.warn('تعذر التحقق من تحديث التطبيق:', error));
      } else {
        // Direct Service Worker registration fallback for mobile PWA install
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then((reg) => {
            console.log('PWA Service Worker registered:', reg.scope);
          })
          .catch((error) => {
            console.warn('PWA Service Worker registration warning:', error);
          });
      }

      return () => {
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      };
    }
  }, [toast]);

  return (
    <>
      {showInstallBanner && (
        <div className="fixed bottom-3 left-3 right-3 md:left-4 md:right-auto md:w-96 z-50 bg-primary text-primary-foreground p-3 rounded-xl shadow-2xl border border-white/20 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-white/15 shrink-0">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">تثبيت تطبيق MetoStore على جهازك</p>
              <p className="text-[10px] opacity-90 truncate">سرعة أعلى، عمل أوفلاين، وجرد مباشر بالكاميرا</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-3 py-1.5 rounded-lg bg-white text-primary font-bold text-xs flex items-center gap-1 shadow hover:bg-white/90 transition"
            >
              <Download className="h-3.5 w-3.5" />
              تثبيت
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('pwa_install_dismissed', '1');
                setShowInstallBanner(false);
              }}
              className="p-1 rounded-md hover:bg-white/15 transition"
              aria-label="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <Dialog open={showGuideModal} onOpenChange={setShowGuideModal}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary font-bold">
              <Smartphone className="h-5 w-5" />
              تثبيت التطبيق على الهاتف
            </DialogTitle>
            <DialogDescription>
              خطوات سريعة لإضافة التطبيق إلى شاشة هاتفك الرئيسية للعمل كبرنامج مستقل وسريع:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm text-foreground">
            <div className="p-3 rounded-lg border bg-muted/30 space-y-1.5">
              <p className="font-bold text-xs text-primary flex items-center gap-1.5">
                <span>🤖</span> هواتف أندرويد (متصفح Chrome / Edge):
              </p>
              <ol className="list-decimal list-inside text-xs space-y-1 text-muted-foreground pr-1">
                <li>اضغط على زر القائمة (<strong>الثلاث نقاط ⋮</strong>) أعلى المتصفح.</li>
                <li>اضغط على <strong>"تثبيت التطبيق"</strong> أو <strong>"إضافة إلى الشاشة الرئيسية"</strong>.</li>
                <li>اضغط <strong>"تثبيت"</strong> لتظهر أيقونة التطبيق على شاشة هاتفك مباشرة.</li>
              </ol>
            </div>

            <div className="p-3 rounded-lg border bg-muted/30 space-y-1.5">
              <p className="font-bold text-xs text-primary flex items-center gap-1.5">
                <span>🍎</span> هواتف آيفون (متصفح Safari):
              </p>
              <ol className="list-decimal list-inside text-xs space-y-1 text-muted-foreground pr-1">
                <li>اضغط على زر <strong>المشاركة (Share)</strong> أسفل شاشة المتصفح.</li>
                <li>مرر للأسفل واختر <strong>"إضافة إلى الصفحة الرئيسية"</strong> (Add to Home Screen).</li>
                <li>اضغط <strong>"إضافة"</strong> في الزاوية العلوية.</li>
              </ol>
            </div>

            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300">
              💡 <strong>ملاحظة هامة:</strong> التطبيق يدعم العمل بدون إنترنت (أوفلاين) والجرد المباشر بالكاميرا من الهاتف بمجرد إضافته للشاشة.
            </div>
          </div>

          <DialogFooter>
            <Button className="w-full" onClick={() => setShowGuideModal(false)}>
              حسناً، فهمت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};


// This new component wraps the providers that need data from DataProvider
const AppProviders = ({ children }: { children: React.ReactNode }) => {
    const {
        users, licenses, dbAction, loading,
        databaseSetupRequired, databaseName, createLocalDatabase,
        retryDatabaseConnection, databaseSetupError, isCreatingLocalDatabase
    } = useData();

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-muted-foreground animate-pulse">جارٍ تحميل البيانات...</p>
                </div>
            </div>
        );
    }

    if (databaseSetupRequired) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
                <section className="w-full max-w-xl rounded-2xl border bg-card p-6 text-center shadow-xl sm:p-9">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Database className="h-8 w-8" />
                    </div>
                    <h1 className="text-2xl font-bold">إعداد قاعدة البيانات المحلية</h1>
                    <p className="mt-3 text-muted-foreground">
                        لم يتم العثور على قاعدة البيانات المحلية <span className="font-semibold text-foreground">{databaseName}</span>.
                        هل تريد إنشاءها على هذا الجهاز لمتابعة تشغيل البرنامج؟
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        سيتم إنشاء الجداول والإعدادات الأساسية. لن يبدأ الإنشاء إلا بعد الضغط على الزر أدناه.
                    </p>
                    {databaseSetupError && (
                        <div role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                            {databaseSetupError}
                        </div>
                    )}
                    <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                        <button
                            type="button"
                            disabled={isCreatingLocalDatabase}
                            onClick={() => { void createLocalDatabase().catch(() => undefined); }}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isCreatingLocalDatabase && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isCreatingLocalDatabase ? 'جارٍ إنشاء قاعدة البيانات...' : 'إنشاء قاعدة البيانات محلياً'}
                        </button>
                        <button
                            type="button"
                            disabled={isCreatingLocalDatabase}
                            onClick={() => { void retryDatabaseConnection(); }}
                            className="inline-flex min-h-11 items-center justify-center rounded-lg border px-5 py-2.5 font-semibold hover:bg-muted disabled:opacity-60"
                        >
                            إعادة فحص الاتصال
                        </button>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <AuthProvider initialUsers={users} initialLicenses={licenses} dbAction={dbAction}>
            <NotificationProvider>
                <PermissionsProvider>
                    <AppLayout>{children}</AppLayout>
                    <Toaster />
                    <PWALifecycle />
                </PermissionsProvider>
            </NotificationProvider>
        </AuthProvider>
    );
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
       <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" />
          <meta name="application-name" content="MetoStore ERP" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="MetoStore" />
          <meta name="description" content="نظام إدارة المحلات والفروع والمخازن المتكامل" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="theme-color" content="#0f172a" />

          <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png" />
          <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512x512.png" />
          <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192x192.png" />
          <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512x512.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-72x72.png" />
          <link rel="icon" type="image/svg+xml" href="/icon.svg" />
          <link rel="manifest" href="/manifest.webmanifest" />

          <meta name="twitter:card" content="summary" />
          <meta name="twitter:title" content="MetoStore" />
          <meta name="twitter:description" content="نظام إدارة المحلات المتكامل" />
          <meta property="og:type" content="website" />
          <meta property="og:title" content="MetoStore" />
          <meta property="og:description" content="نظام إدارة المحلات المتكامل" />
          <meta property="og:site_name" content="MetoStore" />
      </head>
      <body
        suppressHydrationWarning={true}
        className={`font-headline antialiased`}
      >
        <ThemeProvider
            attribute="class"
            defaultTheme="dark" 
            enableSystem 
            disableTransitionOnChange 
            themes={['light', 'dark', 'neutral', 'custom']}
        >
            <DataProvider>
                <AppProviders>
                    {children}
                </AppProviders>
            </DataProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
