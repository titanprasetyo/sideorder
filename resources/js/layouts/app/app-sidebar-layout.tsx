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
    // Terapkan tema admin (krem + merah brand + font Oxanium) ke <html> dan <body>
    // agar dialog/select/toast yang dirender via portal ikut memakai palet & font yang sama.
    useLayoutEffect(() => {
        document.documentElement.classList.add('theme-oxanium');
        document.documentElement.classList.remove('theme-customer');
        document.body.classList.add('theme-sideline', 'theme-oxanium');
        document.body.classList.remove('theme-customer');
    }, []);

    return (
        <AppShell variant="sidebar">
            <AppSidebar />
            <AppContent
                variant="sidebar"
                className="theme-sideline theme-oxanium min-w-0 overflow-x-clip bg-background text-foreground"
            >
                <AppSidebarHeader breadcrumbs={breadcrumbs} />
                {children}
            </AppContent>
        </AppShell>
    );
}
