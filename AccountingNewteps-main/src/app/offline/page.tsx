"use client";

import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-muted text-muted-foreground p-4 text-center">
      <WifiOff className="w-16 h-16 mb-4" />
      <h1 className="text-2xl font-bold mb-2">أنت غير متصل بالإنترنت</h1>
      <p className="max-w-md">
        لا يمكن تحميل هذه الصفحة حاليًا. يرجى التحقق من اتصالك بالإنترنت. قد تتمكن من الوصول إلى الصفحات الأخرى التي قمت بزيارتها مؤخرًا.
      </p>
    </div>
  );
}
