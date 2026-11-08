
// استيراد دالة cn للمساعدة في دمج أسماء الفئات (classes)
import { cn } from '@/lib/utils';
// استيراد React للسماح باستخدام JSX وتعريف أنواع الخصائص
import React from 'react';

// تعريف واجهة الخصائص (Props) لمكون PageHeader
type PageHeaderProps = {
  title: string; // العنوان الرئيسي للصفحة، وهو مطلوب
  description?: string; // وصف اختياري للصفحة
  children?: React.ReactNode; // أي عناصر إضافية (مثل الأزرار) يتم عرضها بجانب العنوان، وهي اختيارية
  className?: string; // فئة CSS إضافية لتخصيص النمط، وهي اختيارية
};

// تعريف مكون PageHeader كدالة وظيفية
export default function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    // العنصر الرئيسي للحاوية
    <div
      className={cn(
        // تطبيق الأنماط الافتراضية باستخدام Tailwind CSS
        'flex flex-col gap-4 md:flex-row md:items-center md:justify-between p-4 md:p-6 border-b bg-background rounded-b-lg md:rounded-t-lg md:rounded-b-none',
        // دمج أي فئات مخصصة يتم تمريرها
        className
      )}
    >
      {/* عرض العنوان الرئيسي والوصف */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight font-headline">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {/* حاوية لعرض العناصر الإضافية (الأطفال) */}
      <div className="flex flex-col items-start md:flex-row md:items-center gap-2">
        {children}
      </div>
    </div>
  );
}
