"use client";

import type { Metadata, Viewport } from "next";
import { Inter, Noto_Kufi_Arabic } from "next/font/google";
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
import { Loader2, Download, Smartphone, X } from "lucide-react";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter", 
});

const notoKufi = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  variable: "--font-noto-kufi-arabic", 
  weight: ["400", "700"], 
});


// New component to handle PWA lifecycle events and Mobile Install Banner
const PWALifecycle = () => {
  const { toast } = useToast();
  const { isOnline } = useData();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = sessionStorage.getItem('pwa_install_dismissed');
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
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
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && (window as any).workbox !== undefined) {
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
         toast({
            title: "تحديث جديد متاح",
            description: "أغلق جميع علامات التبويب الخاصة بالتطبيق وأعد فتحه لتطبيق التحديث.",
            duration: 10000,
        });
      });

      wb.register();
    }
  }, [toast]);

  if (!showInstallBanner || !deferredPrompt) return null;

  return (
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
  );
};


// This new component wraps the providers that need data from DataProvider
const AppProviders = ({ children }: { children: React.ReactNode }) => {
    const { users, licenses, dbAction, loading } = useData();

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
          <meta name="theme-color" content="#3b82f6" />

          <link rel="apple-touch-icon" href="/icons/icon-192x192.svg" />
          <link rel="icon" type="image/svg+xml" href="/icons/icon-192x192.svg" />
          <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />

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
        className={`${inter.variable} ${notoKufi.variable} font-headline antialiased`}
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