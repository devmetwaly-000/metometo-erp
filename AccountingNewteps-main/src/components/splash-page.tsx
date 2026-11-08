
"use client";

import React from 'react';
import { Laptop, Scale } from 'lucide-react';
import { useData } from '@/contexts/data-provider';

export const SplashPage = () => {
    const { settings } = useData();
    const companyName = settings?.main?.general?.companyName || "MultiBranch Accounting";
    const welcomeMessage = settings?.main?.general?.welcomeMessage || "مرحباً بك في نظام الإدارة. يرجى استخدام القائمة الجانبية للتنقل.";


    return (
        <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground animate-in fade-in duration-1000">
            <div className="flex flex-col items-center gap-6 text-center">
                <h1 className="text-4xl font-bold text-primary tracking-wider">
                    {companyName}
                </h1>
                <div className="relative flex items-center justify-center my-8 gap-8">
                    <Scale className="h-32 w-32 text-muted-foreground/80" />
                    <Laptop className="h-28 w-28 text-primary" />
                </div>
                <p className="text-lg text-muted-foreground">
                    {welcomeMessage}
                </p>
            </div>
        </div>
    );
};
