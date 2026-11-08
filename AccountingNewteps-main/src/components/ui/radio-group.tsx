
"use client"

// استيراد React والمكونات الأساسية من مكتبة Radix UI Radio Group وأيقونة من lucide
import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Circle } from "lucide-react"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات
import { cn } from "@/lib/utils"

// تعريف مكون مجموعة أزرار الراديو (RadioGroup)
const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    // استخدام المكون الأساسي من Radix UI
    <RadioGroupPrimitive.Root
      // تطبيق الأنماط الافتراضية
      className={cn("grid gap-2", className)}
      {...props}
      ref={ref}
    />
  )
})
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

// تعريف مكون عنصر زر الراديو (RadioGroupItem)
const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    // استخدام المكون الأساسي للعنصر من Radix UI
    <RadioGroupPrimitive.Item
      ref={ref}
      // تطبيق الأنماط الأساسية
      className={cn(
        "aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {/* مؤشر الاختيار الذي يظهر عند تحديد العنصر */}
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
})
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

// تصدير المكونين للاستخدام
export { RadioGroup, RadioGroupItem }
