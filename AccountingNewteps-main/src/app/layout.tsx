"use client";

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppLayout } from "@/app/app-layout";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { PermissionsProvider } from "@/contexts/permissions-context";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { DataProvider, useData } from "@/contexts/data-provider";
import { NotificationProvider } from "@/contexts/notification-context";
import React, { ReactNode, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, Smartphone, X, Database, Globe } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";


// New component to handle PWA lifecycle events and Mobile Install Banner
const PWALifecycle = () => {
  const { toast } = useToast();
  const { isOnline, hasCheckedConnection } = useData();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
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
    if (!hasCheckedConnection) return;

    if (!isOnline) {
      wasOfflineRef.current = true;
      toast({
        variant: "destructive",
        title: "أنت في وضع عدم الاتصال",
        description: "يتم استخدام البيانات والصفحات المخزنة محلياً.",
        duration: 5000,
      });
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      toast({
        title: "تمت استعادة الاتصال بالسيرفر",
        description: "عاد الاتصال بقاعدة البيانات وتمت مزامنة البيانات تلقائياً.",
        duration: 4000,
      });
    }
  }, [hasCheckedConnection, isOnline, toast]);

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
            {typeof window !== 'undefined' && !window.isSecureContext && (
              <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 space-y-1.5 text-xs">
                <p className="font-bold text-rose-600 dark:text-rose-400">
                  ⚠️ تنبيه هام للتثبيت عبر شبكة المحل (HTTP):
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  متصفح Chrome على أندرويد يمنع التثبيت الكامل (PWA) على الروابط غير المشفرة (<code dir="ltr">http://</code>). لتفعيل التثبيت الفوري على الموبايل:
                </p>
                <ol className="list-decimal list-inside text-[11px] space-y-1 text-muted-foreground pr-1">
                  <li>افتح في Chrome على الموبايل: <code dir="ltr" className="font-bold text-foreground">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code></li>
                  <li>فعّل الخيار إلى <strong>Enabled</strong> وأضف هذا الرابط: <code dir="ltr" className="font-bold text-primary">{window.location.origin}</code></li>
                  <li>أعد تشغيل Chrome واضغط تثبيت — أو استخدم رابط <strong>HTTPS</strong>.</li>
                </ol>
              </div>
            )}

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


const InnerDatabaseGate = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const {
        databaseSetupRequired, databaseName, createLocalDatabase,
        retryDatabaseConnection, databaseSetupError, isCreatingLocalDatabase
    } = useData();
    const [bypassSetup, setBypassSetup] = useState(false);
    const [showConnForm, setShowConnForm] = useState(false);
    const [connStrInput, setConnStrInput] = useState('Server=localhost,1433;Database=MultiBranchPOS_DB;User Id=meto_pos;Password=MetoPosPass123!;Encrypt=false;TrustServerCertificate=true;');
    const [isSavingConn, setIsSavingConn] = useState(false);
    const [connMsg, setConnMsg] = useState<string | null>(null);

    const isEmergencyAdmin =
        user?.id === 'superadmin' ||
        user?.id === 'admin_master' ||
        (user?.loginName && user.loginName.toLowerCase().trim() === 'admin');

    const handleSaveAndInitCustomServer = async () => {
        setIsSavingConn(true);
        setConnMsg(null);
        try {
            const res = await fetch('/api/db/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'init',
                    config: {
                        connectionMode: 'connectionString',
                        connectionString: connStrInput
                    }
                })
            });
            const data = await res.json();
            if (data.success) {
                setConnMsg(data.message);
                await retryDatabaseConnection();
            } else {
                setConnMsg(`خطأ: ${data.error || data.message}`);
            }
        } catch (e: any) {
            setConnMsg(`خطأ: ${e.message}`);
        } finally {
            setIsSavingConn(false);
        }
    };

    // Emergency Admin (Admin / 200300400) always connects and enters immediately without any database
    if (databaseSetupRequired && !isEmergencyAdmin && !bypassSetup) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
                <section className="w-full max-w-2xl rounded-2xl border bg-card p-6 text-center shadow-xl sm:p-9">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Database className="h-8 w-8" />
                    </div>
                    <h1 className="text-2xl font-bold">إعداد قاعدة البيانات</h1>
                    <div className="mt-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-right">
                        <div className="space-y-0.5">
                            <div className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5 justify-center sm:justify-start">
                                <Globe className="h-3.5 w-3.5 text-purple-600" />
                                <span>وضع المتصفح الذكي (Zero Installation)</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                تشغيل فوري داخل المتصفح (IndexedDB) ومزامنة سحابية مع Firebase بدون الحاجة لتثبيت SQL Server على هذا الجهاز!
                            </div>
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-8 shrink-0 w-full sm:w-auto"
                            onClick={async () => {
                                try {
                                    await fetch('/api/db/init', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            action: 'save',
                                            config: {
                                                connectionMode: 'fields',
                                                server: 'indexeddb',
                                                port: 0,
                                                database: 'MultiBranchPOS_IndexedDB',
                                                user: 'browser_user',
                                                password: '',
                                                connectionString: 'Engine=IndexedDB;Mode=BrowserLocal;Sync=FirebaseRTDB;'
                                            }
                                        })
                                    });
                                    localStorage.setItem('system_storage_engine', 'indexeddb_firebase');
                                    window.location.reload();
                                } catch {}
                            }}
                        >
                            <Globe className="h-3.5 w-3.5 ml-1" />
                            تفعيل والدخول فوراً
                        </Button>
                    </div>
                    <p className="mt-3 text-muted-foreground">
                        لم يتم العثور على قاعدة البيانات <span className="font-semibold text-foreground">{databaseName}</span>.
                        يمكنك إنشاؤها محلياً أو تحديد نص اتصال لسيرفر خارجي أو سحابي.
                    </p>
                    {databaseSetupError && (
                        <div role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                            {databaseSetupError}
                        </div>
                    )}
                    {connMsg && (
                        <div className="mt-4 rounded-lg border bg-muted p-3 text-xs font-mono">
                            {connMsg}
                        </div>
                    )}

                    <div className="mt-4">
                        <button
                            type="button"
                            onClick={() => setShowConnForm(!showConnForm)}
                            className="text-xs font-bold text-primary underline hover:opacity-80"
                        >
                            {showConnForm ? 'إخفاء إعدادات نص الاتصال الخارجي' : '⚙️ تحديد نص الاتصال لسيرفر خارجي أو سحابي'}
                        </button>
                    </div>

                    {showConnForm && (
                        <div className="mt-4 p-4 rounded-xl border bg-muted/30 text-right space-y-3">
                            <label className="block text-xs font-bold">نص الاتصال الكامل (Connection String):</label>
                            <textarea
                                dir="ltr"
                                rows={3}
                                value={connStrInput}
                                onChange={(e) => setConnStrInput(e.target.value)}
                                className="w-full rounded-lg border bg-background p-2.5 font-mono text-xs"
                                placeholder="Server=my-aws.rds.amazonaws.com,1433;Database=MultiBranchPOS_DB;User Id=admin;Password=123456;Encrypt=true;TrustServerCertificate=true;"
                            />
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    disabled={isSavingConn}
                                    onClick={handleSaveAndInitCustomServer}
                                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    {isSavingConn && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                    {isSavingConn ? 'جارٍ الاتصال وتأسيس الجداول...' : 'حفظ نص الاتصال وإنشاء/ربط القاعدة على هذا السيرفر'}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row flex-wrap">
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
                        <button
                            type="button"
                            onClick={() => setBypassSetup(true)}
                            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-5 py-2.5 font-semibold hover:bg-amber-500/20"
                        >
                            الدخول بدون قاعدة بيانات (وضع الطوارئ)
                        </button>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <NotificationProvider>
            <PermissionsProvider>
                <AppLayout>{children}</AppLayout>
                <Toaster />
                <PWALifecycle />
            </PermissionsProvider>
        </NotificationProvider>
    );
};

// This component wraps AuthProvider first so Emergency Admin (Admin / 200300400) can always log in without waiting for any database
const AppProviders = ({ children }: { children: React.ReactNode }) => {
    const { users, licenses, dbAction } = useData();

    return (
        <AuthProvider initialUsers={users} initialLicenses={licenses} dbAction={dbAction}>
            <InnerDatabaseGate>{children}</InnerDatabaseGate>
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
