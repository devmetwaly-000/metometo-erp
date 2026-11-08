
"use client"

// استيراد React والمكونات الأساسية من مكتبة Radix UI Dialog وأيقونة X
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

// استيراد دالة cn للمساعدة في دمج أسماء الفئات
import { cn } from "@/lib/utils"

// تعريف المكونات الأساسية من Radix UI بأسماء أبسط
const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

// تعريف مكون `DialogOverlay` الذي يمثل الخلفية المعتمة
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    // تطبيق الأنماط الأساسية للخلفية المعتمة وحركاتها
    className={cn(
      "fixed inset-0 z-40 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

// تعريف مكون `DialogContent` الذي يمثل محتوى الحوار
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideOverlay?: boolean }
>(({ className, children, hideOverlay, ...props }, ref) => (
  // `DialogPortal` يضمن عرض الحوار في أعلى شجرة DOM لتجنب مشاكل z-index
  <DialogPortal>
    {!hideOverlay && <DialogOverlay />} {/* عرض الخلفية المعتمة */}
    <DialogPrimitive.Content
      ref={ref}
      // تطبيق الأنماط الأساسية للحوار وحركاته
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      {/* زر الإغلاق الافتراضي (أيقونة X) */}
      <DialogPrimitive.Close className="absolute left-4 rtl:left-auto rtl:right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

// مكون `DialogHeader` لترتيب رأس الحوار
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // محاذاة النص لليمين في اللغات العربية
      "flex flex-col space-y-1.5 text-center sm:text-right",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

// مكون `DialogFooter` لترتيب تذييل الحوار
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // محاذاة الأزرار لليسار في اللغات العربية
      "flex flex-col-reverse sm:flex-row sm:justify-start sm:gap-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

// مكون `DialogTitle` لعنوان الحوار
const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight font-headline",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

// مكون `DialogDescription` لوصف الحوار
const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

// تصدير جميع المكونات للاستخدام
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
