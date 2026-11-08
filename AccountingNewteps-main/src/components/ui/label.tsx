
"use client"

// استيراد React والمكتبات اللازمة من Radix UI
import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
// استيراد أداة لإنشاء متغيرات الفئات (variants)
import { cva, type VariantProps } from "class-variance-authority"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات
import { cn } from "@/lib/utils"

// تعريف متغيرات التسمية (label variants) باستخدام cva
// هذا يسمح بتطبيق أنماط مختلفة بسهولة، على الرغم من أنه في هذه الحالة يوجد نمط واحد فقط.
const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

// تعريف مكون التسمية (Label) باستخدام React.forwardRef
// يسمح هذا بتمرير ref إلى عنصر label الداخلي من Radix UI
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  // استخدام المكون الأساسي من Radix UI
  <LabelPrimitive.Root
    ref={ref}
    // دمج الفئات الافتراضية من labelVariants مع أي فئات مخصصة يتم تمريرها
    className={cn(labelVariants(), className)}
    {...props} // تمرير باقي الخصائص
  />
))
// تحديد اسم العرض (displayName) للمكون لتسهيل تصحيح الأخطاء
Label.displayName = LabelPrimitive.Root.displayName

// تصدير المكون لاستخدامه في أجزاء أخرى من التطبيق
export { Label }
