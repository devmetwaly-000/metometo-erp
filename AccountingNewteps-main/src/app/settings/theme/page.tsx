
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from 'next-themes';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useData } from "@/contexts/data-provider";
import { Loader2, Save, Palette } from 'lucide-react';
import { cn } from "@/lib/utils";
import { hslStringToHex, hexToHsl, parseHsl, setCssVariable } from '@/lib/color-utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


interface ColorSettings {
    primary: string;
    accent: string;
    background: string;
    foreground: string;
    card: string;
    popover: string;
    border: string;
    secondary: string;
    muted: string;
    destructive: string;
}

const predefinedThemes = [
    {
        name: "افتراضي فاتح",
        colors: {
            primary: "#3b82f6",
            accent: "#f1f5f9",
            background: "#f9fafb",
            foreground: "#1c274c",
            card: "#ffffff",
            popover: "#ffffff",
            border: "#e5e7eb",
            secondary: "#f1f5f9",
            muted: "#f1f5f9",
            destructive: "#ef4444",
        }
    },
    {
        name: "افتراضي داكن",
        colors: {
            primary: "#82b3ff",
            background: "#1e293b",
            foreground: "#e5e7eb",
            card: "#28344a",
            popover: "#1e293b",
            secondary: "#334155",
            muted: "#334155",
            accent: "#334155",
            destructive: "#e54848",
            border: "#475569",
        }
    },
    {
        name: "محايد",
        colors: {
            primary: "#525f93",
            accent: "#907ab6",
            background: "#e8eaf6",
            foreground: "#28356c",
            card: "#f8f9ff",
            popover: "#f8f9ff",
            border: "#d9ddea",
            secondary: "#e0e3f0",
            muted: "#e0e3f0",
            destructive: "#e53935",
        }
    },
    {
        name: "محيطي",
        colors: {
            primary: "#2563eb", accent: "#60a5fa", background: "#f0f9ff",
            foreground: "#1e3a8a", card: "#ffffff", popover: "#ffffff",
            border: "#dbeafe", secondary: "#bfdbfe", muted: "#eff6ff", destructive: "#ef4444",
        }
    },
    {
        name: "غابة",
        colors: {
            primary: "#16a34a", accent: "#4ade80", background: "#f0fdf4",
            foreground: "#14532d", card: "#ffffff", popover: "#ffffff",
            border: "#dcfce7", secondary: "#bbf7d0", muted: "#f0fdf4", destructive: "#ef4444",
        }
    },
    {
        name: "حجري",
        colors: {
            primary: "#475569", accent: "#94a3b8", background: "#f8fafc",
            foreground: "#1e293b", card: "#ffffff", popover: "#ffffff",
            border: "#e2e8f0", secondary: "#cbd5e1", muted: "#f1f5f9", destructive: "#ef4444",
        }
    },
    {
        name: "دافئ",
        colors: {
            primary: "#ea580c", accent: "#fb923c", background: "#fff7ed",
            foreground: "#7c2d12", card: "#ffffff", popover: "#ffffff",
            border: "#fed7aa", secondary: "#ffedd5", muted: "#fffbeb", destructive: "#ef4444",
        }
    },
    {
        name: "ملكي",
        colors: {
            primary: "#7e22ce", accent: "#a855f7", background: "#fbf5ff",
            foreground: "#4a044e", card: "#ffffff", popover: "#ffffff",
            border: "#f3e8ff", secondary: "#e9d5ff", muted: "#faefff", destructive: "#be123c",
        }
    },
];

const ColorPicker = ({ label, color, onChange }: { label: string; color?: string; onChange: (color: string) => void }) => (
    <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
            <Input
                type="color"
                value={color || "#000000"}
                onChange={(e) => onChange(e.target.value)}
                className="p-1 h-10 w-14 cursor-pointer"
            />
            <Input
                value={color || ""}
                onChange={(e) => onChange(e.target.value)}
                placeholder="#RRGGBB"
                className="flex-1"
            />
             <div className="w-10 h-10 rounded-md border" style={{ backgroundColor: color || 'transparent' }}></div>
        </div>
    </div>
);


export default function ThemeSettingsPage() {
    const { setTheme, theme } = useTheme();
    const { user, loading: authLoading } = useAuth();
    const { dbAction, loading: dataLoading } = useData();
    const { toast } = useToast();

    const [isSaving, setIsSaving] = useState(false);
    
    // State to hold colors in HEX format for the color pickers
    const [colors, setColors] = useState<ColorSettings>({
        primary: '#000000', accent: '#000000', background: '#FFFFFF', foreground: '#000000',
        card: '#FFFFFF', popover: '#FFFFFF', border: '#DDDDDD', secondary: '#EEEEEE',
        muted: '#F1F1F1', destructive: '#FF0000',
    });

    // Effect to initialize state from user settings or CSS variables
    useEffect(() => {
        if (user?.themeSettings?.colors && user?.themeSettings?.theme === 'custom') {
            const userColors = user.themeSettings.colors;
            setColors({
                primary: hslStringToHex(userColors.primary),
                accent: hslStringToHex(userColors.accent),
                background: hslStringToHex(userColors.background),
                foreground: hslStringToHex(userColors.foreground),
                card: hslStringToHex(userColors.card),
                border: hslStringToHex(userColors.border),
                secondary: hslStringToHex(userColors.secondary),
                destructive: hslStringToHex(userColors.destructive),
                popover: hslStringToHex(userColors.popover),
                muted: hslStringToHex(userColors.muted),
            });
        } else if (typeof window !== 'undefined') {
            // Fallback to currently applied CSS variables
            const rootStyle = getComputedStyle(document.documentElement);
            const getHex = (varName: string) => hslStringToHex(`hsl(${rootStyle.getPropertyValue(varName).trim()})`);
            
            setColors({
                primary: getHex('--primary'), accent: getHex('--accent'), background: getHex('--background'),
                foreground: getHex('--foreground'), card: getHex('--card'), popover: getHex('--popover'),
                border: getHex('--border'), secondary: getHex('--secondary'), muted: getHex('--muted'),
                destructive: getHex('--destructive'),
            });
        }
    }, [user, theme]);

    const handleColorChange = (colorType: keyof ColorSettings, value: string) => {
        setColors(prevColors => ({
            ...prevColors,
            [colorType]: value
        }));
    };
    
    const handleSave = async () => {
        if (!user) {
            toast({ variant: "destructive", title: "خطأ", description: "يجب تسجيل الدخول لحفظ الإعدادات." });
            return;
        }
        setIsSaving(true);
        try {
            const themeSettingsToSave = {
                theme: 'custom',
                colors: {
                    primary: hexToHsl(colors.primary), accent: hexToHsl(colors.accent),
                    background: hexToHsl(colors.background), foreground: hexToHsl(colors.foreground),
                    card: hexToHsl(colors.card), popover: hexToHsl(colors.popover),
                    border: hexToHsl(colors.border), secondary: hexToHsl(colors.secondary),
                    muted: hexToHsl(colors.muted), destructive: hexToHsl(colors.destructive),
                }
            };
            
            await dbAction('users', 'update', { 
                id: user.id, 
                data: { 
                    themeSettings: themeSettingsToSave
                } 
            });

            // Set the theme in next-themes and let the AuthProvider handle the CSS variables
            setTheme('custom');
            toast({ title: "تم الحفظ", description: "تم حفظ إعدادات المظهر المخصصة لحسابك." });
        } catch (error) {
            toast({ variant: 'destructive', title: "خطأ", description: "فشل حفظ الإعدادات." });
        } finally {
            setIsSaving(false);
        }
    };

    if (authLoading || dataLoading) {
        return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>
    }

    return (
        <>
            <PageHeader title="إعدادات المظهر" />
            <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card>
                    <CardHeader>
                        <CardTitle>تخصيص الألوان</CardTitle>
                        <CardDescription>
                            اختر من الثيمات الجاهزة أو عدل الألوان يدوياً. سيتم حفظ الإعدادات لحسابك الشخصي.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div>
                             <Label className="mb-2 block">الثيمات الجاهزة</Label>
                             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {predefinedThemes.map(theme => (
                                    <div key={theme.name} onClick={() => setColors(theme.colors as ColorSettings)} className="cursor-pointer group">
                                        <div className="flex flex-col items-center">
                                            <div className="flex -space-x-2 rtl:space-x-reverse overflow-hidden mb-1">
                                                <div className="w-8 h-8 rounded-full border-2 border-white" style={{ backgroundColor: theme.colors.primary }} />
                                                <div className="w-8 h-8 rounded-full border-2 border-white" style={{ backgroundColor: theme.colors.accent }} />
                                                <div className="w-8 h-8 rounded-full border-2 border-white" style={{ backgroundColor: theme.colors.foreground }} />
                                            </div>
                                             <p className="text-xs font-semibold group-hover:text-primary">{theme.name}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <Accordion type="multiple" className="w-full">
                            <AccordionItem value="main-colors">
                                <AccordionTrigger>الألوان الأساسية</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-4">
                                     <ColorPicker label="اللون الأساسي (Primary)" color={colors.primary} onChange={(c) => handleColorChange('primary', c)} />
                                     <ColorPicker label="لون التمييز (Accent)" color={colors.accent} onChange={(c) => handleColorChange('accent', c)} />
                                     <ColorPicker label="لون الحذف (Destructive)" color={colors.destructive} onChange={(c) => handleColorChange('destructive', c)} />
                                </AccordionContent>
                            </AccordionItem>
                             <AccordionItem value="background-colors">
                                <AccordionTrigger>ألوان الخلفيات</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-4">
                                     <ColorPicker label="خلفية الصفحة (Background)" color={colors.background} onChange={(c) => handleColorChange('background', c)} />
                                     <ColorPicker label="خلفية البطاقات (Card)" color={colors.card} onChange={(c) => handleColorChange('card', c)} />
                                      <ColorPicker label="خلفية القوائم (Popover)" color={colors.popover} onChange={(c) => handleColorChange('popover', c)} />
                                      <ColorPicker label="اللون الثانوي (Secondary)" color={colors.secondary} onChange={(c) => handleColorChange('secondary', c)} />
                                      <ColorPicker label="اللون الصامت (Muted)" color={colors.muted} onChange={(c) => handleColorChange('muted', c)} />
                                </AccordionContent>
                            </AccordionItem>
                              <AccordionItem value="text-colors">
                                <AccordionTrigger>ألوان النصوص والإطارات</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-4">
                                    <ColorPicker label="النصوص الرئيسية (Foreground)" color={colors.foreground} onChange={(c) => handleColorChange('foreground', c)} />
                                    <ColorPicker label="الإطارات (Border)" color={colors.border} onChange={(c) => handleColorChange('border', c)} />
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                        
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Save className="ml-2 h-4 w-4"/>}
                            حفظ المظهر المخصص
                        </Button>
                    </CardFooter>
                </Card>

                 <Card className="flex flex-col">
                    <CardHeader>
                        <CardTitle>معاينة حية</CardTitle>
                         <CardDescription>هكذا سيبدو تطبيقك بالألوان المختارة.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col items-center justify-center p-4 rounded-md border" style={{
                        '--primary': colors.primary,
                        '--accent': colors.accent,
                        '--background': colors.background,
                        '--foreground': colors.foreground,
                        '--card': colors.card,
                        '--popover': colors.popover,
                        '--border': colors.border,
                        '--secondary': colors.secondary,
                        '--muted': colors.muted,
                        '--destructive': colors.destructive,
                        backgroundColor: `var(--background)`,
                        color: `var(--foreground)`
                    } as React.CSSProperties}>
                        <div className="w-full max-w-sm space-y-4 rounded-lg p-6" style={{backgroundColor: `var(--card)`, color: `var(--foreground)`, border: `1px solid var(--border)`}}>
                            <h3 className="font-bold text-lg" style={{color: `var(--primary)`}}>مثال للمعاينه</h3>
                            <p style={{color: `hsl(${hexToHsl(colors.foreground, 0.7)})`}}>هذا نص باللون الخافت.</p>
                            <div className="flex flex-wrap gap-4">
                                <Button style={{backgroundColor: `var(--primary)`, color: (parseHsl(hexToHsl(colors.primary))?.l || 0) > 50 ? '#000' : '#FFF'}}>زر أساسي</Button>
                                <Button style={{backgroundColor: `var(--secondary)`, color: `var(--foreground)`}}>زر ثانوي</Button>
                                <Button style={{backgroundColor: `var(--destructive)`, color: (parseHsl(hexToHsl(colors.destructive))?.l || 0) > 50 ? '#000' : '#FFF'}}>زر حذف</Button>
                            </div>
                            <Alert style={{borderColor: `var(--accent)`, backgroundColor: `var(--muted)`}}>
                                <Palette className="h-4 w-4" style={{color: `var(--accent)`}} />
                                <AlertTitle style={{color: `var(--accent)`}}>تنبيه افتراضي</AlertTitle>
                                <AlertDescription style={{color: `hsl(${hexToHsl(colors.foreground, 0.7)})`}}>
                                    هذا مثال على شكل التنبيه بلون الـ Accent.
                                </AlertDescription>
                            </Alert>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" style={{borderColor: `var(--border)`}}>واجهة منبثقة</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-40" style={{backgroundColor: `var(--popover)`, color: `var(--foreground)`, borderColor: `var(--border)`}}>
                                    محتوى منبثق.
                                </PopoverContent>
                            </Popover>
                             <div className="flex items-center space-x-2">
                                <Checkbox id="terms-preview" style={{borderColor: `var(--primary)`}}/>
                                <label htmlFor="terms-preview">مربع اختيار (Checkbox)</label>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
