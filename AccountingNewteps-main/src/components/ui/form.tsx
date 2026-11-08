
"use client"

// استيراد React والمكونات اللازمة من Radix UI و react-hook-form
import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

// استيراد الأدوات المساعدة
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

// مكون Form هو مجرد مزود سياق (Provider) من react-hook-form
const Form = FormProvider

// تعريف نوع بيانات سياق حقل النموذج
type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName
}

// إنشاء سياق (Context) لمشاركة اسم الحقل بين المكونات الفرعية
const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

// مكون FormField الذي يلتف حول Controller من react-hook-form
const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    // توفير اسم الحقل للمكونات الفرعية عبر السياق
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

// خطاف (Hook) مخصص للوصول إلى حالة الحقل من داخل المكونات
const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  // الحصول على حالة الحقل (مثل الأخطاء)
  const fieldState = getFieldState(fieldContext.name, formState)

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }

  const { id } = itemContext

  // إرجاع جميع المعلومات المفيدة عن الحقل
  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

// تعريف نوع بيانات سياق عنصر النموذج
type FormItemContextValue = {
  id: string
}

// إنشاء سياق لمشاركة المعرف (id) الفريد للعنصر
const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

// مكون FormItem الذي يلتف حول مجموعة من مكونات النموذج (Label, Input, Message)
const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId() // إنشاء معرف فريد

  return (
    // توفير المعرف الفريد للمكونات الفرعية عبر السياق
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  )
})
FormItem.displayName = "FormItem"

// مكون FormLabel المخصص
const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField() // استخدام الخطاف للحصول على معلومات الحقل

  return (
    <Label
      ref={ref}
      // تطبيق فئة الخطأ إذا كان الحقل يحتوي على خطأ
      className={cn(error && "text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  )
})
FormLabel.displayName = "FormLabel"

// مكون FormControl الذي يلتف حول عنصر الإدخال الفعلي
const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return (
    // Slot يسمح بتمرير الخصائص إلى العنصر الابن
    <Slot
      ref={ref}
      id={formItemId}
      // ربط الحقل بالوصف ورسالة الخطأ للوصولية (accessibility)
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  )
})
FormControl.displayName = "FormControl"

// مكون FormDescription لعرض وصف الحقل
const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField()

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
})
FormDescription.displayName = "FormDescription"

// مكون FormMessage لعرض رسالة الخطأ
const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message ?? "") : children

  if (!body) {
    return null // لا تعرض شيئًا إذا لم يكن هناك خطأ أو أطفال
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  )
})
FormMessage.displayName = "FormMessage"

// تصدير جميع المكونات والخطاف
export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}
