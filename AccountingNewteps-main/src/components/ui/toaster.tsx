
"use client"

import * as React from "react"
// استيراد الخطاف المخصص `useToast` ودالة تعيين مدة الإشعار الافتراضية
import { useToast, setDefaultToastDuration } from "@/hooks/use-toast"
// استيراد مكونات واجهة المستخدم الخاصة بالإشعارات
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useData } from "@/contexts/data-provider"

// تعريف مكون `Toaster` الذي سيكون مسؤولاً عن عرض جميع الإشعارات وفق المدة المحددة في الإعدادات
export function Toaster() {
  // الحصول على قائمة الإشعارات الحالية من الخطاف `useToast`
  const { toasts } = useToast()
  
  let settings: any = null;
  try {
    const data = useData();
    settings = data?.settings;
  } catch {}

  const generalSettings = settings?.main?.general || settings?.general || {};
  const rawDuration = generalSettings?.toastDuration;
  const parsedSeconds = typeof rawDuration === 'number' ? rawDuration : parseFloat(rawDuration);
  const durationMs = (!isNaN(parsedSeconds) && parsedSeconds > 0)
    ? Math.round(parsedSeconds * 1000)
    : (typeof window !== 'undefined' && localStorage.getItem('app_toast_duration')
        ? Number(localStorage.getItem('app_toast_duration'))
        : 2500);

  // مزامنة مدة الإشعار المحددة في الإعدادات مع محرك الإشعارات
  React.useEffect(() => {
    setDefaultToastDuration(durationMs);
  }, [durationMs]);

  return (
    // `ToastProvider` هو المكون الجذري الذي يلتف حول الإشعارات ويتحكم بمدة بقائها
    <ToastProvider duration={durationMs}>
      {/* المرور على مصفوفة الإشعارات وعرض كل واحد منها */}
      {toasts.map(function ({ id, title, description, action, duration, ...props }) {
        return (
          <Toast key={id} duration={duration || durationMs} {...props}>
            <div className="grid gap-1">
              {/* عرض العنوان إذا كان موجودًا */}
              {title && <ToastTitle>{title}</ToastTitle>}
              {/* عرض الوصف إذا كان موجودًا */}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {/* عرض زر الإجراء إذا كان موجودًا */}
            {action}
            {/* عرض زر الإغلاق الافتراضي */}
            <ToastClose />
          </Toast>
        )
      })}
      {/* `ToastViewport` هو الحاوية التي تحدد مكان ظهور الإشعارات على الشاشة */}
      <ToastViewport />
    </ToastProvider>
  )
}
