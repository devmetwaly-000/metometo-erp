// استيراد React للسماح باستخدام JSX
import * as React from "react"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات (classes) بشكل شرطي
import { cn } from "@/lib/utils"

// تعريف مكون الإدخال (Input) باستخدام React.forwardRef
// هذا يسمح بتمرير ref إلى عنصر input الداخلي
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, ...props }, ref) => {
    const handleChange: React.ChangeEventHandler<HTMLInputElement> | undefined = type === "number" && onChange
      ? (event) => {
          const value = event.currentTarget.value;
          if (value) {
            const negative = value.startsWith("-");
            const unsigned = negative ? value.slice(1) : value;
            const [integerPart, ...fractionParts] = unsigned.split(".");
            const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
            const normalized = `${negative ? "-" : ""}${normalizedInteger}${fractionParts.length ? `.${fractionParts.join(".")}` : ""}`;
            if (normalized !== value) event.currentTarget.value = normalized;
          }
          onChange(event);
        }
      : onChange;

    return (
      <input
        type={type} // تحديد نوع الإدخال (text, password, number, etc.)
        // دمج الفئات الافتراضية مع أي فئات مخصصة يتم تمريرها عبر className
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref} // تمرير الـ ref إلى عنصر input
        onChange={handleChange}
        {...props} // تمرير باقي الخصائص (مثل value, onChange, placeholder, etc.)
      />
    )
  }
)
// تحديد اسم العرض (displayName) للمكون لتسهيل تصحيح الأخطاء
Input.displayName = "Input"

// تصدير المكون لاستخدامه في أجزاء أخرى من التطبيق
export { Input }
