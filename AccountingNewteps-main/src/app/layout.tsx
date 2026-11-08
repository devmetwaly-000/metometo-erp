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
import React, { ReactNode, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter", 
});

const notoKufi = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  variable: "--font-noto-kufi-arabic", 
  weight: ["400", "700"], 
});


// New component to handle PWA lifecycle events
const PWALifecycle = () => {
  const { toast } = useToast();
  const { isOnline } = useData();

  useEffect(() => {
    // Check for secure context (HTTPS or localhost)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
         toast({
            variant: "destructive",
            title: "تنبيه أمني (PWA)",
            description: "ميزات الأوفلاين والتثبيت لا تعمل إلا عبر HTTPS أو localhost. الاتصال الحالي غير آمن.",
            duration: 10000,
        });
    }

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

      // A common UX pattern for PWAs is to show a toast when a new version is available.
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

      // Register the service worker
      wb.register();
    }
  }, [toast]);

  return null;
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
          <meta name="application-name" content="MetoStore" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content="MetoStore" />
          <meta name="description" content="نظام إدارة المحلات المتكامل" />
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