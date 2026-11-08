
"use client"

// استيراد React والمكونات الأساسية من مكتبة Radix UI Avatar
import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات
import { cn } from "@/lib/utils"

// تعريف المكون الرئيسي (Avatar) كمرادف لمكون Radix الأساسي
const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    // تطبيق الأنماط الافتراضية مع أي أنماط مخصصة
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

// تعريف مكون الصورة (AvatarImage)
const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    // تطبيق الأنماط الأساسية للصورة
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

// تعريف مكون الصورة الاحتياطية (AvatarFallback)
// يظهر هذا المكون إذا فشل تحميل الصورة أو لم يتم توفيرها
const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    // تطبيق الأنماط الأساسية للصورة الاحتياطية
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

// تصدير جميع المكونات للاستخدام
export { Avatar, AvatarImage, AvatarFallback }
