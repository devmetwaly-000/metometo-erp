"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export const LoginForm = () => {
    const { signIn, error } = useAuth();
    const [loginName, setLoginName] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    // Aggressive Cleanup for Pointer Events and Scroll
    useEffect(() => {
        const cleanup = () => {
            if (typeof document !== 'undefined') {
                document.body.style.pointerEvents = 'auto';
                document.body.style.overflow = 'auto';
            }
        };
        cleanup();
        const timer = setTimeout(cleanup, 300);
        return () => clearTimeout(timer);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await signIn(loginName, password);
            router.push('/');
        } catch (err: any) {
             toast({
                variant: 'destructive',
                title: 'فشل تسجيل الدخول',
                description: 'بيانات الاعتماد غير صحيحة أو أن المستخدم غير موجود.'
            });
        }
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
            <Card className="w-full max-w-sm shadow-xl border-border/60">
                <CardHeader className="items-center text-center space-y-3 pb-4">
                    <div className="h-20 w-20 rounded-2xl overflow-hidden shadow-lg border border-primary/20 bg-slate-950 p-1">
                        <img
                            src="/logo.svg"
                            alt="شعار النظام"
                            className="h-full w-full object-contain"
                        />
                    </div>
                    <div className="space-y-1">
                        <CardTitle className="text-2xl font-bold">تسجيل الدخول للنظام</CardTitle>
                        <CardDescription className="text-sm font-bold text-amber-500 tracking-wide">
                            Ahmed Metwaly
                        </CardDescription>
                    </div>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="loginName">اسم الدخول</Label>
                            <Input id="loginName" type="text" value={loginName} onChange={e => setLoginName(e.target.value)} required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="password" className="text-yellow-500">كلمة المرور</Label>
                            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                        </div>
                        {error && <p className="text-destructive text-sm">{error}</p>}
                    </CardContent>
                    <CardFooter className="flex flex-col gap-3">
                        <Button 
                            type="submit" 
                            className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold" 
                            disabled={isLoading}
                        >
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                            تسجيل الدخول
                        </Button>
                        <p className="text-[11px] text-muted-foreground text-center">
                            نظام إدارة الفروع والمخازن والمحاسبة — <strong className="text-foreground">Ahmed Metwaly</strong>
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
};
