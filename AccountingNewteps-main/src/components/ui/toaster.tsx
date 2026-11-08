
"use client"

// استيراد الخطاف المخصص `useToast` لإدارة حالة الإشعارات
import { useToast } from "@/hooks/use-toast"
// استيراد مكونات واجهة المستخدم الخاصة بالإشعارات
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

// تعريف مكون `Toaster` الذي سيكون مسؤولاً عن عرض جميع الإشعارات
export function Toaster() {
  // الحصول على قائمة الإشعارات الحالية من الخطاف `useToast`
  const { toasts } = useToast()

  return (
    // `ToastProvider` هو المكون الجذري الذي يجب أن يلتف حول الإشعارات
    <ToastProvider>
      {/* المرور على مصفوفة الإشعارات وعرض كل واحد منها */}
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
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
