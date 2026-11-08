
"use client"

// استيراد جميع المكونات من مكتبة Radix UI Collapsible
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

// إعادة تسمية المكونات الأساسية لتسهيل الاستخدام
const Collapsible = CollapsiblePrimitive.Root
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

// تصدير المكونات المعدة للاستخدام في التطبيق
export { Collapsible, CollapsibleTrigger, CollapsibleContent }
