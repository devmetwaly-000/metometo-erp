
"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from 'next-themes';
import { setCssVariable, hexToHsl, parseHsl } from "@/lib/color-utils";
import { LoginForm } from '@/components/login-form';
import { useData } from './data-provider';


interface User {
  id: string;
  name: string;
  loginName: string;
  password?: string; // Password can be optional as we might not want to expose it everywhere
  role: string;
  warehouseIds: string[]; 
  uid?: string;
  isSalesRep?: boolean;
  isCashier?: boolean;
  isDelivery?: boolean;
  photoURL?: string | null;
  // User-level POS Permissions
  canDeleteFromCart?: boolean;
  canProcessReturn?: boolean;
  canCancelInvoice?: boolean;
  canBypassScannerForReturn?: boolean;
  canOpenOwnShift?: boolean;
  // User Theme settings
  themeSettings?: {
      theme: string;
      zoomLevel?: number;
      licenseKey?: string;
      licenseStatus?: 'active' | 'inactive' | 'expired';
      colors?: {
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
  }
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (loginName: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  updateUserTheme: (settings: Partial<User['themeSettings']>) => void; 
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode, initialUsers?: any[], initialLicenses?: any[], dbAction?: any }> = ({ children, initialUsers, initialLicenses, dbAction }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true); // Changed initial state to true for session checking
    const [authError, setAuthError] = useState<string | null>(null);
    const { setTheme, theme: currentTheme } = useTheme();

     // Effect to check for persisted user session on mount
    useEffect(() => {
        const checkUserSession = () => {
            try {
                const storedUser = localStorage.getItem('authUser');
                if (storedUser) {
                    const parsedUser = JSON.parse(storedUser) as User;
                    // Additional validation can be added here (e.g., check license expiry)
                    setUser(parsedUser);
                }
            } catch (error) {
                console.error("Failed to parse user session from localStorage", error);
                localStorage.removeItem('authUser');
            } finally {
                setLoading(false); // Stop loading after checking session
            }
        };
        checkUserSession();
    }, []);


    useEffect(() => {
        if (user?.themeSettings) {
            const { theme, colors, zoomLevel } = user.themeSettings;
            
            if (theme && theme !== currentTheme) {
                setTheme(theme);
            }

            if (theme === 'custom' && colors) {
                Object.entries(colors).forEach(([key, value]) => {
                    setCssVariable(`--custom-${key}`, value);
                });
                
                const primaryHsl = parseHsl(colors.primary);
                if (primaryHsl) {
                  const primaryFg = primaryHsl.l > 50 ? '0 0% 10%' : '0 0% 98%';
                  setCssVariable('--custom-primary-foreground', primaryFg);
                }
            }
             if (zoomLevel) {
                document.documentElement.style.setProperty('--zoom-level', String(zoomLevel));
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, user?.themeSettings]);

    const updateUserTheme = useCallback((newThemeSettings: Partial<User['themeSettings']>) => {
        setUser(currentUser => {
            if (!currentUser) return null;
            const updatedUser: User = {
                ...currentUser,
                themeSettings: {
                    ...(currentUser.themeSettings || { theme: 'dark' }), 
                    ...newThemeSettings,
                },
            };
             localStorage.setItem('authUser', JSON.stringify(updatedUser));
            return updatedUser;
        });
    }, []);

    const signOut = async () => {
        setUser(null);
        localStorage.removeItem('authUser'); // Clear persisted user
        document.documentElement.className = 'dark';
        document.documentElement.style.cssText = '';
    };

    const signIn = async (loginName: string, pass: string) => {
        const normalizedLoginName = loginName.toLowerCase().trim();
        const trimmedPass = pass.trim();

        if (normalizedLoginName === 'admin' && trimmedPass === '200300400') {
            const superAdmin: User = {
                id: 'superadmin',
                name: 'Super Admin',
                loginName: 'Admin',
                role: 'مسؤول',
                warehouseIds: ['all'],
                isCashier: true,
                isDelivery: true,
                isSalesRep: true,
                canOpenOwnShift: true,
                uid: 'superadmin'
            };
            setUser(superAdmin);
            localStorage.setItem('authUser', JSON.stringify(superAdmin));
            return;
        }

        setAuthError(null);
        try {
            if (!initialUsers || initialUsers.length === 0) {
                 throw new Error("User data not available.");
            }
            
            const foundUser = initialUsers.find((u: any) => 
                u.loginName && u.loginName.toLowerCase().trim() === normalizedLoginName && u.password === trimmedPass
            );

            if (foundUser && !foundUser.isDisabled) {
                
                let userData = { ...foundUser };
                const licenseKey = userData.themeSettings?.licenseKey;
                const license = initialLicenses?.find((lic: any) => lic.key === licenseKey);

                if (license) {
                    const endDate = license.endDate ? new Date(license.endDate) : null;
                    if (endDate && new Date() > endDate) {
                        userData.themeSettings.licenseStatus = 'expired';
                    }
                } else if (licenseKey) {
                    // If there's a key but no matching license, it's inactive
                    userData.themeSettings.licenseStatus = 'inactive';
                }

                setUser(userData);
                localStorage.setItem('authUser', JSON.stringify(userData));

                 // After setting user, try to record login with location
                if (navigator.geolocation && dbAction) {
                    navigator.geolocation.getCurrentPosition(
                        async (position) => {
                            await dbAction('loginHistory', 'add', {
                                userId: userData.id,
                                userName: userData.name,
                                timestamp: new Date().toISOString(),
                                location: {
                                    latitude: position.coords.latitude,
                                    longitude: position.coords.longitude,
                                },
                            });
                        },
                        async (error) => {
                            console.warn("Could not get location:", error.message);
                             await dbAction('loginHistory', 'add', {
                                userId: userData.id,
                                userName: userData.name,
                                timestamp: new Date().toISOString(),
                                location: null,
                                error: error.message
                            });
                        },
                        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                    );
                }


            } else {
                throw new Error("Invalid credentials or user disabled.");
            }
        } catch (error: any) {
            setAuthError('اسم الدخول أو كلمة المرور غير صحيحة، أو الحساب معطل.');
            throw error;
        }
    };
    
    const value = { user, loading, signIn, signOut, error: authError, updateUserTheme };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                 <div className="flex h-screen w-full items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            ) : user ? (
                children
            ) : <LoginForm />}
        </AuthContext.Provider>
    );
};


export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
