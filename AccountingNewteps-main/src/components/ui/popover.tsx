
"use client"

// استيراد React والمكونات الأساسية من مكتبة Radix UI Popover
import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات
import { cn } from "@/lib/utils"

// تعريف المكونات الأساسية من Radix UI بأسماء أبسط
const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger

// تعريف مكون محتوى النافذة المنبثقة (PopoverContent)
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  // `PopoverPortal` يضمن عرض المحتوى في أعلى شجرة DOM لتجنب مشاكل z-index
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align} // تحديد محاذاة المحتوى بالنسبة للمشغل
      sideOffset={sideOffset} // تحديد المسافة بين المحتوى والمشغل
      // تطبيق الأنماط الافتراضية وحركات الظهور والاختفاء
      className={cn(
        "z-[150] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 pointer-events-auto",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

// تصدير المكونات للاستخدام
export { Popover, PopoverTrigger, PopoverContent }
