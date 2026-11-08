// استيراد دالة cn للمساعدة في دمج أسماء الفئات (classes) بشكل شرطي
import { cn } from "@/lib/utils"

/**
 * مكون الهيكل العظمي (Skeleton).
 * يستخدم لعرض عنصر نائب (placeholder) أثناء تحميل البيانات.
 * @param {React.HTMLAttributes<HTMLDivElement>} props - الخصائص القياسية لعنصر div.
 * @returns {JSX.Element} عنصر div مع أنماط التحميل.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // تطبيق الأنماط الافتراضية مع أي أنماط مخصصة يتم تمريرها
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

// تصدير المكون للاستخدام في التطبيق
export { Skeleton }
