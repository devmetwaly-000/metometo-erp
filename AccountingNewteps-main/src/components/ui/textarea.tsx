// استيراد React للسماح باستخدام JSX وتعريف أنواع الخصائص
import * as React from 'react';

// استيراد دالة cn للمساعدة في دمج أسماء الفئات (classes) بشكل شرطي
import {cn} from '@/lib/utils';

// تعريف مكون حقل النص متعدد الأسطر (Textarea)
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({className, ...props}, ref) => {
    return (
      <textarea
        // دمج الأنماط الافتراضية مع أي أنماط مخصصة يتم تمريرها
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref} // تمرير الـ ref إلى عنصر textarea
        {...props} // تمرير باقي الخصائص
      />
    );
  }
);
// تحديد اسم العرض (displayName) للمكون لتسهيل تصحيح الأخطاء
Textarea.displayName = 'Textarea';

// تصدير المكون
export {Textarea};
