
"use client";

// استيراد React للسماح باستخدام JSX
import React from "react";
// استيراد مكونات الحوار (Dialog) من مكتبة واجهة المستخدم
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// تعريف واجهة الخصائص (Props) لمكون AddEntityDialog
interface AddEntityDialogProps {
  triggerButton: React.ReactNode; // الزر أو العنصر الذي سيفتح الحوار
  title: string; // عنوان الحوار
  description: string; // وصف قصير يظهر تحت العنوان
  children: React.ReactNode | ((props: { onClose: () => void }) => React.ReactNode);
}

// تعريف المكون كدالة وظيفية
export function AddEntityDialog({
  triggerButton,
  title,
  description,
  children,
}: AddEntityDialogProps) {
  // استخدام حالة (state) للتحكم في فتح وإغلاق الحوار برمجيًا
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    // المكون الرئيسي للحوار من مكتبة Radix UI
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {/* DialogTrigger يلتف حول الزر الذي يفتح الحوار */}
      <DialogTrigger asChild>{triggerButton}</DialogTrigger>
      {/* DialogContent هو المحتوى الفعلي الذي يظهر عند فتح الحوار */}
      <DialogContent 
        className="sm:max-w-4xl" 
        // منع إغلاق الحوار عند النقر خارج حدوده إذا كان النقر داخل قائمة منسدلة
        onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            // This checks if the click is inside any popover, including comboboxes and dropdowns.
            if (target.closest('[data-radix-popper-content-wrapper]')) {
                e.preventDefault();
            }
        }}>
        {/* رأس الحوار يحتوي على العنوان والوصف */}
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {/* عرض المحتوى الداخلي (الأطفال) وتمرير دالة الإغلاق إليهم */}
        {typeof children === 'function' ? children({ onClose: () => setIsOpen(false) }) : children}
      </DialogContent>
    </Dialog>
  );
}
