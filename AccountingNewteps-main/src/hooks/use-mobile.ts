// استيراد أدوات React اللازمة
import * as React from "react"

// تحديد نقطة التوقف (breakpoint) التي تعتبر الحد الفاصل بين شاشة الموبايل والديسكتوب
const MOBILE_BREAKPOINT = 768

/**
 * خطاف (Hook) مخصص للتحقق مما إذا كان عرض الشاشة الحالي يعتبر "موبايل".
 * @returns {boolean} - `true` إذا كان عرض الشاشة أقل من `MOBILE_BREAKPOINT`, وإلا `false`.
 */
export function useIsMobile() {
  // حالة (state) لتخزين ما إذا كانت الشاشة موبايل أم لا.
  // القيمة الأولية `undefined` لتجنب مشاكل عدم التطابق أثناء التصيير من جانب الخادم (SSR).
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // `matchMedia` هي واجهة برمجة تطبيقات ويب (API) للتحقق من تطابق استعلامات الوسائط (media queries)
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    
    // دالة يتم استدعاؤها عند تغير حجم الشاشة وتجاوز نقطة التوقف
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    // إضافة مستمع لحدث التغيير
    mql.addEventListener("change", onChange)
    
    // تعيين القيمة الأولية عند تحميل المكون لأول مرة
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)

    // دالة التنظيف (cleanup function) التي يتم استدعاؤها عند إزالة المكون
    // لإزالة المستمع وتجنب تسرب الذاكرة.
    return () => mql.removeEventListener("change", onChange)
  }, []) // المصفوفة الفارغة تضمن تشغيل هذا الـ `useEffect` مرة واحدة فقط بعد التحميل الأولي

  // إرجاع القيمة المنطقية. `!!` تحول `undefined` إلى `false` بشكل آمن.
  return !!isMobile
}
