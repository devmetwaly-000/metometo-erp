// استيراد React للسماح باستخدام JSX
import * as React from "react"
// استيراد أداة لإنشاء متغيرات الفئات (variants) من مكتبة class-variance-authority
import { cva, type VariantProps } from "class-variance-authority"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات
import { cn } from "@/lib/utils"

// تعريف متغيرات الأنماط لمكون التنبيه (Alert) باستخدام cva
// هذا يسمح بوجود أنماط مختلفة (variants) لمكون التنبيه
const alertVariants = cva(
  // الأنماط الأساسية المشتركة بين جميع المتغيرات
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        // نمط التنبيه الافتراضي
        default: "bg-background text-foreground",
        // نمط التنبيه المدمر (للأخطاء والتحذيرات الهامة)
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default", // تحديد النمط الافتراضي
    },
  }
)

// تعريف مكون التنبيه (Alert) باستخدام React.forwardRef
const Alert = React.forwardRef<
  HTMLDivElement,
  // دمج خصائص HTML القياسية مع خصائص المتغيرات من cva
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert" // تحديد دور العنصر للوصولية (accessibility)
    // تطبيق الأنماط بناءً على الـ variant المحدد ودمج أي فئات مخصصة
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert" // تحديد اسم العرض للمكون لتسهيل تصحيح الأخطاء

// تعريف مكون عنوان التنبيه (AlertTitle)
const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

// تعريف مكون وصف التنبيه (AlertDescription)
const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

// تصدير المكونات لاستخدامها في أجزاء أخرى من التطبيق
export { Alert, AlertTitle, AlertDescription }
