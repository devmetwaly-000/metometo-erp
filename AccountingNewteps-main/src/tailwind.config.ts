
// هذا الملف هو ملف إعدادات Tailwind CSS.

import type { Config } from "tailwindcss";

export default {
  // تحديد كيفية عمل الوضع الداكن (باستخدام فئة 'dark' في عنصر html)
  darkMode: ["class"],
  // تحديد الملفات التي سيبحث فيها Tailwind عن أسماء الفئات لاستخدامها
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // قسم لتخصيص وتوسيع سمة التصميم الافتراضية لـ Tailwind
  theme: {
    container: {
      center: true, // توسيط الحاويات تلقائيًا
      padding: "2rem",
      screens: {
        "2xl": "1400px", // تحديد نقطة توقف (breakpoint) مخصصة للشاشات الكبيرة جدًا
      },
    },
    extend: {
      // تعريف متغيرات الخطوط التي تم استيرادها في layout.tsx
      fontFamily: {
        body: ["var(--font-inter)", "sans-serif"],
        headline: ["var(--font-noto-kufi-arabic)", "sans-serif"],
      },
      // تعريف ألوان مخصصة باستخدام متغيرات CSS HSL من globals.css
      // هذا يسمح بتغيير الألوان ديناميكيًا مع السمات (فاتح/داكن/محايد)
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: { // تعريف مجموعة ألوان مخصصة للرسوم البيانية
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: { // تعريف مجموعة ألوان مخصصة للشريط الجانبي
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      // تعريف نصف قطر الحواف (border-radius) بناءً على متغير CSS
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // تعريف حركات مخصصة (keyframes) لمكونات مثل الأكورديون
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      // ربط الـ keyframes بأسماء حركات يمكن استخدامها في الفئات
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  // إضافة الإضافات (plugins) لـ Tailwind
  plugins: [
    require("tailwindcss-animate"), // إضافة للتعامل مع الحركات
    // إضافة مخصصة لإنشاء متغير (variant) جديد للسمة المحايدة 'neutral'
    function({ addVariant }: { addVariant: any }) {
      addVariant('neutral', '.neutral &');
    },
  ],
} satisfies Config;
