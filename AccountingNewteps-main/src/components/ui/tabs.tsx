
"use client"

// استيراد React والمكونات الأساسية من مكتبة Radix UI Tabs
import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات (classes) بشكل شرطي
import { cn } from "@/lib/utils"

// تعريف المكون الرئيسي (Tabs) كمرادف لمكون Radix الأساسي
const Tabs = TabsPrimitive.Root

// تعريف مكون قائمة التبويبات (TabsList)
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    // تطبيق الأنماط الافتراضية مع أي أنماط مخصصة
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

// تعريف مكون زر التبويب (TabsTrigger)
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    // تطبيق الأنماط الافتراضية والأنماط الخاصة بالحالة النشطة
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

// تعريف مكون محتوى التبويب (TabsContent)
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    // تطبيق الأنماط الافتراضية للمحتوى
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

// تصدير جميع المكونات للاستخدام في التطبيق
export { Tabs, TabsList, TabsTrigger, TabsContent }
