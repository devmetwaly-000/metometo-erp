
"use client"

// استيراد React والمكونات الأساسية من مكتبة Radix UI Progress
import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات
import { cn } from "@/lib/utils"

// تعريف مكون شريط التقدم (Progress)
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  // استخدام المكون الأساسي من Radix UI
  <ProgressPrimitive.Root
    ref={ref}
    // تطبيق الأنماط الافتراضية لشريط التقدم
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
      className
    )}
    {...props}
  >
    {/* مؤشر التقدم الذي يمثل القيمة الحالية */}
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      // تحديث عرض المؤشر بناءً على القيمة الممررة
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

// تصدير المكون
export { Progress }
