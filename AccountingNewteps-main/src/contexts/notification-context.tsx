"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './auth-context';
import { useToast } from '@/hooks/use-toast';

interface NotificationContextType {
    notificationsEnabled: boolean;
    toggleNotifications: (enable: boolean) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
    notificationsEnabled: false,
    toggleNotifications: async () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        const savedPref = localStorage.getItem('notifications_enabled');
        if (savedPref === 'true') {
            setNotificationsEnabled(true);
        }
    }, []);

    const toggleNotifications = async (enable: boolean) => {
        setNotificationsEnabled(enable);
        localStorage.setItem('notifications_enabled', String(enable));
        toast({ title: enable ? "تم تفعيل إشعارات المبيعات" : "تم إيقاف إشعارات المبيعات" });
    };

    return (
        <NotificationContext.Provider value={{ notificationsEnabled, toggleNotifications }}>
            {children}
        </NotificationContext.Provider>
    );
};
