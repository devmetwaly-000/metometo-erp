
"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Home, Laptop, Scale, Shirt, LogOut, Cloud, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions, getModuleGroupLabel } from "@/contexts/permissions-context";
import { Button } from './ui/button';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { useData } from '@/contexts/data-provider';
import { useAuth } from '@/contexts/auth-context';
import { ModeToggle } from './mode-toggle';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";


interface NavItem {
    type: 'link' | 'collapsible';
    title: string;
    icon?: React.ReactNode;
    module?: string;
    href?: string;
    children?: readonly NavItem[];
}

interface ModernNavHubProps {
    navStructure: readonly NavItem[];
}

const Logo = () => {
    const { settings } = useData();
    const companyName = settings?.main?.general?.companyName || "Meto Store";

    return (
        <div className="flex flex-col items-center justify-center gap-2 mb-10">
            <h1 className="text-4xl font-bold text-primary">{companyName}</h1>
             <div className="relative flex items-center justify-center gap-8 mt-8">
                <Scale className="h-20 w-20 text-green-500/80" />
                <Laptop className="h-20 w-20 text-green-500" />
            </div>
        </div>
    );
};


export const ModernNavHub: React.FC<ModernNavHubProps> = ({ navStructure }) => {
    const [activeMenu, setActiveMenu] = useState<NavItem | null>(null);
    const { can } = usePermissions();
    const { isOnline } = useData();
    const { user, signOut } = useAuth();


    const handleMenuClick = (item: NavItem) => {
        if (item.children && item.children.length > 0) {
            setActiveMenu(item);
        }
    };

    const handleBackClick = () => {
        setActiveMenu(null);
    };
    
    const renderSubMenu = (items: readonly NavItem[] | undefined) => {
        if (!items) return null;
        return items.map(child => {
            if (child.module && !can('view', child.module)) return null;
            if (child.type === 'link') {
                return (
                    <Link 
                        href={child.href!} 
                        key={child.href} 
                        className="block p-4 rounded-lg bg-card hover:bg-muted transition-all duration-200 border-2 border-transparent hover:border-primary"
                    >
                        <h4 className="font-semibold text-md text-card-foreground">{child.title}</h4>
                    </Link>
                );
            }
            if (child.type === 'collapsible') {
                 const canViewAnyGrandChild = child.children?.some(gc => gc.module && can('view', gc.module));
                 if (!canViewAnyGrandChild) return null;

                return (
                    <div key={child.title} className="p-4 rounded-lg bg-card/50 border md:col-span-2 lg:col-span-3">
                        <h4 className="font-bold mb-3 text-foreground">{child.title}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                             {renderSubMenu(child.children)}
                        </div>
                    </div>
                );
            }
            return null;
        });
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4 md:p-8 relative">
            <div className="absolute top-4 left-4 flex items-center gap-4 z-50">
                 <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <button>
                                {isOnline ? (
                                    <Cloud className="h-5 w-5 text-green-500" />
                                ) : (
                                    <CloudOff className="h-5 w-5 text-muted-foreground" />
                                )}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {isOnline ? "متصل ومزامن" : "غير متصل (البيانات قد تكون غير محدثة)"}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                         <Button variant="ghost" size="icon" className="rounded-full">
                            <Avatar className="h-9 w-9">
                                <AvatarImage src={user?.photoURL || ''} />
                                <AvatarFallback>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>مرحباً, {user?.name}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                         <DropdownMenuItem>
                             <ModeToggle />
                         </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={signOut} className="text-destructive">
                            <LogOut className="mr-2 h-4 w-4" />
                            تسجيل الخروج
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="w-full max-w-5xl relative">
                <div className={cn(
                    "transition-all duration-500 ease-in-out", 
                    activeMenu 
                    ? 'opacity-0 transform -translate-x-full absolute invisible' 
                    : 'opacity-100 transform translate-x-0'
                )}>
                     <Logo />
                     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {navStructure.map(item => {
                             if (item.type === 'link') {
                                return (
                                    <Link href={item.href!} key={item.href} passHref>
                                        <div className="text-center group focus:outline-none focus:ring-2 focus:ring-primary rounded-xl h-full">
                                            <div 
                                                className="p-6 h-full border-2 bg-card hover:border-primary hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col items-center justify-center gap-4 rounded-xl group-hover:bg-primary/5 dark:group-hover:bg-primary/10 group-hover:shadow-inner"
                                            >
                                                <div className="p-4 bg-primary/10 rounded-full text-primary">
                                                    {item.icon ? React.cloneElement(item.icon as React.ReactElement, { className: "h-10 w-10" }) : null}
                                                </div>
                                                <h3 className="text-lg font-bold text-card-foreground group-hover:text-primary transition-colors">{item.title}</h3>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            }

                            if (item.type === 'collapsible') {
                                return (
                                    <button 
                                        key={item.title} 
                                        onClick={() => handleMenuClick(item)} 
                                        className="text-center group focus:outline-none focus:ring-2 focus:ring-primary rounded-xl h-full"
                                    >
                                        <div 
                                            className="p-6 h-full border-2 bg-card hover:border-primary hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col items-center justify-center gap-4 rounded-xl group-hover:bg-primary/5 dark:group-hover:bg-primary/10 group-hover:shadow-inner"
                                        >
                                            <div className="p-4 bg-primary/10 rounded-full text-primary">
                                                {item.icon ? React.cloneElement(item.icon as React.ReactElement, { className: "h-10 w-10" }) : null}
                                            </div>
                                            <h3 className="text-lg font-bold text-card-foreground group-hover:text-primary transition-colors">{item.title}</h3>
                                        </div>
                                    </button>
                                );
                            }

                            return null;
                        })}
                    </div>
                </div>

                <div className={cn(
                    "transition-all duration-500 ease-in-out w-full", 
                    !activeMenu 
                    ? 'opacity-0 transform translate-x-full absolute invisible' 
                    : 'opacity-100 transform translate-x-0'
                )}>
                    {activeMenu && (
                        <div>
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-4 text-foreground">
                                <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleBackClick}><ArrowLeft/></Button>
                                {activeMenu.icon ? React.cloneElement(activeMenu.icon as React.ReactElement, { className: "h-8 w-8" }) : null}
                                {activeMenu.title}
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {renderSubMenu(activeMenu.children)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
