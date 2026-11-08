
"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useAuth } from "@/contexts/auth-context";
import { useData } from "@/contexts/data-provider";

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ModeToggle() {
  const { setTheme } = useTheme();
  const { user } = useAuth();
  const { dbAction } = useData();

  const handleThemeChange = async (newTheme: string) => {
    // Apply theme visually immediately
    setTheme(newTheme);

    // Persist the change to the database
    if (user?.id) {
        try {
            // If the theme is one of the defaults, we only need to save the theme name.
            // We don't need to preserve custom colors if we're not on the custom theme.
            const newSettings = {
                theme: newTheme,
            };

            await dbAction('users', 'update', {
                id: user.id,
                data: { themeSettings: newSettings }
            });
        } catch (error) {
            console.error("Failed to save theme setting:", error);
            // Optionally, show a toast notification on failure
        }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-start px-0">
            <span>تغيير المظهر</span>
            <span className="sr-only">Toggle theme</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleThemeChange("light")}>
            فاتح
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleThemeChange("dark")}>
            داكن
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleThemeChange("neutral")}>
            محايد
          </DropdownMenuItem>
           <DropdownMenuItem onClick={() => handleThemeChange("custom")}>
            مخصص
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleThemeChange("system")}>
            النظام
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
