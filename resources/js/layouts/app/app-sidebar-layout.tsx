import { useLayoutEffect } from 'react';
import { AppContent } from '@/components/app-content';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import type { AppLayoutProps } from '@/types';

export default function AppSidebarLayout({
    children,
    breadcrumbs = [],
}: AppLayoutProps) {
    // Terapkan tema admin (krem + merah brand) ke <body> agar dialog/select
    // yang dirender via portal ikut memakai palet yang sama.
    useLayoutEffect(() => {
        document.body.classList.add('theme-sideline');

        return () => document.body.classList.remove('theme-sideline');
    }, []);

    return (
        <AppShell variant="sidebar">
            <AppSidebar />
            <AppContent variant="sidebar" className="theme-sideline min-w-0 overflow-x-clip bg-background text-foreground">
                <AppSidebarHeader breadcrumbs={breadcrumbs} />
                {children}
            </AppContent>
        </AppShell>
    );
}
