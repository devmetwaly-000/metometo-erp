"use client";

import React from 'react';
import { useData } from '@/contexts/data-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CloudOff, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function SyncIndicator() {
    const { isOnline, syncQueueCount } = useData();

    if (isOnline && syncQueueCount === 0) {
        return null;
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Link href="/settings/sync">
                        <Button variant="ghost" size="sm" className={`relative ${!isOnline ? 'text-destructive' : 'text-orange-500'}`}>
                            {isOnline ? (
                                <RefreshCw className={`h-4 w-4 ${syncQueueCount > 0 ? 'animate-spin' : ''}`} />
                            ) : (
                                <WifiOff className="h-4 w-4" />
                            )}
                            {syncQueueCount > 0 && (
                                <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] rounded-full">
                                    {syncQueueCount}
                                </Badge>
                            )}
                            <span className="sr-only">
                                {isOnline ? 'مزامنة البيانات' : 'وضع الأوفلاين'}
                            </span>
                        </Button>
                    </Link>
                </TooltipTrigger>
                <TooltipContent>
                    <p>
                        {!isOnline ? 'أنت تعمل الآن في وضع الأوفلاين' : 'جاري مزامنة البيانات...'}
                        <br />
                        {syncQueueCount > 0 && `يوجد ${syncQueueCount} عمليات معلقة`}
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
