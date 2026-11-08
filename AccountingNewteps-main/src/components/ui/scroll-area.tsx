
"use client"

// استيراد React والمكونات الأساسية من مكتبة Radix UI Scroll Area
import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات
import { cn } from "@/lib/utils"

// تعريف مكون منطقة التمرير (ScrollArea)
const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  // استخدام المكون الأساسي من Radix UI
  <ScrollAreaPrimitive.Root
    ref={ref}
    // تطبيق الأنماط الأساسية
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    {/* منفذ العرض الذي يحتوي على المحتوى القابل للتمرير */}
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    {/* عرض شريط التمرير */}
    <ScrollBar />
    {/* زاوية شريط التمرير (إذا كان هناك شريطان أفقي وعمودي) */}
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

// تعريف مكون شريط التمرير (ScrollBar)
const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  // استخدام المكون الأساسي من Radix UI
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation} // تحديد اتجاه شريط التمرير (عمودي أو أفقي)
    // تطبيق الأنماط بناءً على الاتجاه
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    {/* مقبض شريط التمرير الذي يمكن للمستخدم سحبه */}
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

// تصدير المكونين للاستخدام
export { ScrollArea, ScrollBar }
