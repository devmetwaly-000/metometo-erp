// استيراد React للسماح باستخدام JSX
import * as React from "react"
// استيراد أداة لإنشاء متغيرات الفئات (variants) من مكتبة class-variance-authority
import { cva, type VariantProps } from "class-variance-authority"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات
import { cn } from "@/lib/utils"

// تعريف متغيرات الأنماط لمكون الشارة (Badge) باستخدام cva
const badgeVariants = cva(
  // الأنماط الأساسية المشتركة بين جميع المتغيرات
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // نمط الشارة الافتراضي
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        // النمط الثانوي
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        // نمط التنبيه المدمر (للأخطاء)
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        // نمط المخطط التفصيلي (outline)
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default", // تحديد النمط الافتراضي
    },
  }
)

// تعريف واجهة الخصائص (Props) لمكون الشارة
export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, // يمتد من خصائص HTML القياسية لـ div
    VariantProps<typeof badgeVariants> {} // يمتد من متغيرات الأنماط التي تم تعريفها

// تعريف مكون الشارة (Badge) كدالة وظيفية
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    // تطبيق الأنماط بناءً على الـ variant المحدد ودمج أي فئات مخصصة
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

// تصدير المكون ومتغيرات الأنماط للاستخدام في أجزاء أخرى من التطبيق
export { Badge, badgeVariants }
