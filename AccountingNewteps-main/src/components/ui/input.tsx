// استيراد React للسماح باستخدام JSX
import * as React from "react"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات (classes) بشكل شرطي
import { cn } from "@/lib/utils"

// تعريف مكون الإدخال (Input) باستخدام React.forwardRef
// هذا يسمح بتمرير ref إلى عنصر input الداخلي
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type} // تحديد نوع الإدخال (text, password, number, etc.)
        // دمج الفئات الافتراضية مع أي فئات مخصصة يتم تمريرها عبر className
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref} // تمرير الـ ref إلى عنصر input
        {...props} // تمرير باقي الخصائص (مثل value, onChange, placeholder, etc.)
      />
    )
  }
)
// تحديد اسم العرض (displayName) للمكون لتسهيل تصحيح الأخطاء
Input.displayName = "Input"

// تصدير المكون لاستخدامه في أجزاء أخرى من التطبيق
export { Input }
