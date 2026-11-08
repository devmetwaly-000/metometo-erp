
"use client";

// استيراد سياق المصادقة
import React, { useEffect } from "react";
import { AuthProvider } from "@/contexts/auth-context";

// هذا المكون هو غلاف (wrapper) لأن نموذج تسجيل الدخول نفسه أصبح الآن جزءًا من AuthProvider.
// سيقوم AuthProvider بعرض نموذج تسجيل الدخول إذا لم يكن المستخدم مصادقًا عليه.

// مكون لعرض رسالة مؤقتة أثناء إعادة التوجيه
const LoginPageContent = () => {
    // Aggressive Cleanup for Pointer Events and Scroll
    // This handles the edge case where a user logs out while a modal is stuck open
    useEffect(() => {
        const cleanup = () => {
            if (typeof document !== 'undefined') {
                document.body.style.pointerEvents = 'auto';
                document.body.style.overflow = 'auto';
            }
        };
        cleanup();
        // Run again after a short delay just in case
        const timer = setTimeout(cleanup, 500);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="flex items-center justify-center h-screen">
            <p>جارٍ إعادة التوجيه إلى صفحة تسجيل الدخول...</p>
        </div>
    );
};

// المكون الرئيسي لصفحة تسجيل الدخول
export default function LoginPage() {
    return (
        // يحيط AuthProvider بالمحتوى ليوفر إمكانية الوصول إلى حالة المصادقة
        <AuthProvider>
            <LoginPageContent />
        </AuthProvider>
    );
}
