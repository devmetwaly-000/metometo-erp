
"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, Scale, Laptop } from 'lucide-react';
import { useData } from '@/contexts/data-provider';
import { Progress } from '@/components/ui/progress';

export const SplashPage = () => {
    const { settings, loading } = useData();
    const [progress, setProgress] = useState(0);

    const companyName = settings?.main?.general?.companyName || "Meto";
    const welcomeMessage = settings?.main?.general?.welcomeMessage || "نظام إدارة المحلات التجارية والمطاعم و نقاط البيع";

    useEffect(() => {
        if (loading) {
            setProgress(0);
            const interval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 95) {
                        clearInterval(interval);
                        return 95;
                    }
                    return prev + 5;
                });
            }, 200);
            return () => clearInterval(interval);
        } else {
            setProgress(100);
        }
    }, [loading]);

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground animate-in fade-in duration-1000">
            <div className="flex flex-col items-center gap-6 text-center">
                <h1 className="text-4xl font-bold text-primary tracking-wider">
                    {companyName}
                </h1>
                <div className="relative flex items-center justify-center my-8 gap-8">
                    <Laptop className="h-28 w-28 text-green-500" />
                    <Scale className="h-32 w-32 text-muted-foreground/80" />
                </div>
                
                {loading && (
                    <div className="w-full max-w-md space-y-2">
                        <Progress value={progress} className="w-full" />
                        <p className="text-sm text-muted-foreground">
                            جاري تجهيز البيانات للعمل أوفلاين... {Math.round(progress)}%
                        </p>
                    </div>
                )}

                {!loading && (
                    <p className="text-lg text-muted-foreground">
                        {welcomeMessage}
                    </p>
                )}
            </div>
        </div>
    );
};
