
"use client"

// استيراد React والمكونات الأساسية من مكتبة Radix UI Separator
import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات
import { cn } from "@/lib/utils"

// تعريف مكون الفاصل (Separator)
const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(
  (
    { className, orientation = "horizontal", decorative = true, ...props },
    ref
  ) => (
    // استخدام المكون الأساسي من Radix UI
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation} // تحديد اتجاه الفاصل (أفقي أو عمودي)
      // تطبيق الأنماط بناءً على الاتجاه
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      )}
      {...props}
    />
  )
)
Separator.displayName = SeparatorPrimitive.Root.displayName

// تصدير المكون
export { Separator }
