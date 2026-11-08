

"use client";

import React from "react";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import Link from 'next/link';
import { usePermissions } from "@/contexts/permissions-context";


interface NavItem {
    type: 'link' | 'collapsible';
    title: string;
    icon?: React.ReactNode;
    module?: string;
    href?: string;
    children?: readonly NavItem[];
}

interface AppMenubarProps {
    navStructure: readonly any[];
}

export function AppMenubar({ navStructure }: AppMenubarProps) {
  const { can } = usePermissions();

  const renderMenuItems = (items: readonly any[] | undefined): React.ReactNode => {
    if (!items) return null;
    return items.map(child => {
        if (child.type === 'link') {
            if (!child.module || !can('view', child.module)) return null;
            return (
                <Link href={child.href!} key={child.href} passHref>
                    <MenubarItem>{child.title}</MenubarItem>
                </Link>
            );
        }
        if (child.type === 'collapsible') {
            const canViewAnyGrandChild = child.children?.some((c: any) => c.module && can('view', c.module));
            if (!canViewAnyGrandChild) return null;

            return (
                <MenubarSub key={child.title}>
                    <MenubarSubTrigger>{child.title}</MenubarSubTrigger>
                    <MenubarSubContent>
                        {renderMenuItems(child.children)}
                    </MenubarSubContent>
                </MenubarSub>
            );
        }
        return null;
    });
  };

  return (
    <div className="flex items-center">
        <Menubar className="rounded-none border-b border-none px-2 lg:px-4">
        {navStructure.map((item: NavItem) => {
            if (!item) return null;

            if (item.type === 'link') {
                if (!item.module || !can('view', item.module)) return null;
                return (
                    <Link href={item.href || '/'} key={item.href} passHref>
                        <MenubarMenu>
                            <MenubarTrigger>{item.title}</MenubarTrigger>
                        </MenubarMenu>
                    </Link>
                );
            }
            
            if (item.type === 'collapsible') {
                 const canViewAnyChild = item.children?.some((c: any) => {
                    if (c.type === 'link' && c.module && can('view', c.module)) {
                        return true;
                    }
                    if (c.type === 'collapsible') {
                        return c.children?.some((gc: any) => gc.module && can('view', gc.module));
                    }
                    return false;
                });

                if (!canViewAnyChild) return null;
                
                return (
                    <MenubarMenu key={item.title}>
                        <MenubarTrigger>{item.title}</MenubarTrigger>
                        <MenubarContent>
                            {renderMenuItems(item.children)}
                        </MenubarContent>
                    </MenubarMenu>
                );
            }

            return null;
        })}
        </Menubar>
    </div>
  );
}

    


    