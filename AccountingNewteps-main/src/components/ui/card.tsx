// استيراد React للسماح باستخدام JSX
import * as React from "react"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات (classes) بشكل شرطي
import { cn } from "@/lib/utils"

// تعريف مكون البطاقة الرئيسي (Card) كعنصر div
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    // تطبيق الأنماط الافتراضية للبطاقة مع أي أنماط مخصصة يتم تمريرها
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
// تحديد اسم العرض (displayName) للمكون لتسهيل تصحيح الأخطاء
Card.displayName = "Card"

// تعريف مكون رأس البطاقة (CardHeader)
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

// تعريف مكون عنوان البطاقة (CardTitle)
const CardTitle = React.forwardRef<
  HTMLDivElement, // تغيير من HTMLParagraphElement إلى HTMLDivElement لتجنب خطأ النوع
  React.HTMLAttributes<HTMLDivElement> // تغيير من HTMLHeadingElement إلى HTMLDivElement
>(({ className, ...props }, ref) => (
  <div // تغيير من h3 إلى div ليكون أكثر مرونة
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

// تعريف مكون وصف البطاقة (CardDescription)
const CardDescription = React.forwardRef<
  HTMLDivElement, // تغيير من HTMLParagraphElement إلى HTMLDivElement
  React.HTMLAttributes<HTMLDivElement> // تغيير من HTMLParagraphElement إلى HTMLDivElement
>(({ className, ...props }, ref) => (
  <div // تغيير من p إلى div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

// تعريف مكون محتوى البطاقة (CardContent)
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

// تعريف مكون تذييل البطاقة (CardFooter)
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

// تصدير جميع المكونات للاستخدام
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
