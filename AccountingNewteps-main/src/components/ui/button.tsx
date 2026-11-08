// استيراد React والمكتبات المساعدة
import * as React from "react"
// Slot يسمح بتمرير الخصائص إلى العنصر الابن المباشر
import { Slot } from "@radix-ui/react-slot"
// cva (class-variance-authority) لإنشاء متغيرات للأنماط
import { cva, type VariantProps } from "class-variance-authority"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات
import { cn } from "@/lib/utils"

// تعريف متغيرات أنماط الزر باستخدام cva
const buttonVariants = cva(
  // الأنماط الأساسية المشتركة لجميع الأزرار
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: { // متغيرات المظهر
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: { // متغيرات الحجم
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10", // حجم مخصص للأزرار التي تحتوي على أيقونة فقط
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// تعريف واجهة الخصائص (Props) لمكون الزر
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean // خاصية اختيارية للسماح للمكون بتمرير خصائصه إلى ابنه المباشر
}

// تعريف مكون الزر (Button)
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // تحديد ما إذا كان المكون سيعرض كـ `button` أو كـ `Slot`
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        // تطبيق الأنماط بناءً على المتغيرات (variant, size) ودمج أي فئات مخصصة
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
// تحديد اسم العرض للمكون لتسهيل تصحيح الأخطاء
Button.displayName = "Button"

// تصدير المكون ومتغيرات الأنماط
export { Button, buttonVariants }
