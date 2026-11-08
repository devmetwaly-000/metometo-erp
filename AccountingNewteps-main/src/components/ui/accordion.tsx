
"use client"

// استيراد React والمكونات الأساسية من مكتبة Radix UI Accordion
import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
// استيراد أيقونة السهم من مكتبة lucide-react
import { ChevronDown } from "lucide-react"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات (classes) بشكل شرطي
import { cn } from "@/lib/utils"

// تعريف المكون الرئيسي (Accordion) كمرادف لمكون Radix الأساسي
const Accordion = AccordionPrimitive.Root

// تعريف مكون عنصر الأكورديون (AccordionItem)
const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    // تطبيق الأنماط الافتراضية مع أي أنماط مخصصة يتم تمريرها
    className={cn("border-b", className)}
    {...props}
  />
))
AccordionItem.displayName = "AccordionItem"

// تعريف مكون مشغل الأكورديون (AccordionTrigger) وهو الجزء الذي يتم النقر عليه للفتح والإغلاق
const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      // تطبيق الأنماط الافتراضية والأنماط الخاصة بحالة الفتح (open)
      className={cn(
        "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

// تعريف مكون محتوى الأكورديون (AccordionContent) وهو الجزء الذي يظهر ويختفي
const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    // تطبيق الأنماط الافتراضية وحركات الفتح والإغلاق
    className="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4 pt-0", className)}>{children}</div>
  </AccordionPrimitive.Content>
))
AccordionContent.displayName = AccordionPrimitive.Content.displayName

// تصدير جميع المكونات للاستخدام في التطبيق
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
