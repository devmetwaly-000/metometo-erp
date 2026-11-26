"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  WifiOff, 
  RefreshCw, 
  ArrowRight, 
  ShoppingCart, 
  FileText, 
  Boxes, 
  BarChart3, 
  Wallet, 
  ShoppingBag,
  CheckCircle2,
  Database
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function OfflinePage() {
  const router = useRouter();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isOnlineAgain, setIsOnlineAgain] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnlineAgain(true);
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  const handleRetry = () => {
    setIsReconnecting(true);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const offlineHubLinks = [
    {
      title: "نقطة البيع السريعة (POS)",
      description: "إصدار فواتير كاش وفيزا وطباعة إيصالات العملاء بدون إنترنت",
      href: "/pos",
      icon: ShoppingCart,
      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      title: "فواتير المبيعات",
      description: "استعراض وإنشاء فواتير المبيعات وحركات العملاء محلياً",
      href: "/sales/invoices",
      icon: FileText,
      color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    },
    {
      title: "إدارة وحالة المخزون",
      description: "متابعة أرصدة الأصناف والجرد والتحويلات المخزنية",
      href: "/inventory/stock-status",
      icon: Boxes,
      color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    },
    {
      title: "مركز التقارير",
      description: "تقارير المبيعات، النقدية، المصروفات، ومطابقة الكاشير",
      href: "/reports",
      icon: BarChart3,
      color: "text-purple-500 bg-purple-500/10 border-purple-500/20",
    },
    {
      title: "فواتير المشتريات",
      description: "تسجيل المشتريات وتوريدات البضاعة وحسابات الموردين",
      href: "/purchases/invoices",
      icon: ShoppingBag,
      color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
    },
    {
      title: "المصروفات اليومية",
      description: "تسجيل المصروفات النثرية والتشغيلية وسندات الصرف",
      href: "/accounting/expenses",
      icon: Wallet,
      color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 sm:p-6" dir="rtl">
      <div className="w-full max-w-4xl space-y-6">
        
        {/* Banner Alert */}
        <div className="rounded-2xl border bg-card p-6 shadow-lg text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            {isOnlineAgain ? (
              <CheckCircle2 className="h-8 w-8 text-emerald-500 animate-bounce" />
            ) : (
              <WifiOff className="h-8 w-8" />
            )}
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {isOnlineAgain ? "تمت استعادة الاتصال بالإنترنت!" : "أنت تعمل حالياً بدون اتصال بالإنترنت (Offline Mode)"}
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
              {isOnlineAgain
                ? "جاري إعادة تحديث الصفحة ومزامنة البيانات تلقائياً مع السيرفر..."
                : "النظام يعمل محلياً بكامل كفاءته عبر قاعدة البيانات الداخلية. يمكنك متابعة عمليات البيع، الفواتير، ومراجعة المخزون والتقارير دون توقف."}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              onClick={handleRetry}
              disabled={isReconnecting}
              variant="default"
              className="gap-2 font-bold px-6"
            >
              <RefreshCw className={`h-4 w-4 ${isReconnecting ? "animate-spin" : ""}`} />
              إعادة فحص الاتصال وتحديث الصفحة
            </Button>

            <Button
              onClick={() => router.back()}
              variant="outline"
              className="gap-2"
            >
              <ArrowRight className="h-4 w-4" />
              الرجوع للصفحة السابقة
            </Button>
          </div>

          <div className="pt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Database className="h-3.5 w-3.5 text-emerald-500" />
            <span>البيانات مخزنة ومحمية محلياً — المزامنة السحابية ستتم تلقائياً فور عودة الإنترنت</span>
          </div>
        </div>

        {/* Quick Access to Offline Working Hubs */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground pr-1">
            الشاشات والعمليات الجاهزة للعمل أوفلاين:
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {offlineHubLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="group block focus:outline-none">
                  <Card className="h-full border transition-all duration-200 hover:border-primary/50 hover:shadow-md cursor-pointer">
                    <CardContent className="p-4 flex items-start gap-3.5">
                      <div className={`p-2.5 rounded-xl border shrink-0 ${item.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-1 text-right">
                        <h3 className="text-sm font-bold group-hover:text-primary transition-colors">
                          {item.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
