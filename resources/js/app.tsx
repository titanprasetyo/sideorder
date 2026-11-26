import '../css/app.css';
import { createInertiaApp, router } from '@inertiajs/react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';
import SettingsLayout from '@/layouts/settings/layout';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

function applyPageFontTheme(componentName: string): void {
    if (typeof document === 'undefined') {
        return;
    }

    const isCustomerView = componentName.startsWith('customer/');
    const html = document.documentElement;
    const body = document.body;

    html.classList.toggle('theme-oxanium', !isCustomerView);
    html.classList.toggle('theme-customer', isCustomerView);
    body.classList.toggle('theme-oxanium', !isCustomerView);
    body.classList.toggle('theme-sideline', !isCustomerView);
    body.classList.toggle('theme-customer', isCustomerView);
}

if (typeof window !== 'undefined') {
    router.on('navigate', (event) => {
        const component = (
            event as CustomEvent<{ page?: { component?: string } }>
        ).detail?.page?.component;

        if (typeof component === 'string') {
            applyPageFontTheme(component);
        }
    });
}

void createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    layout: (name) => {
        applyPageFontTheme(name);

        switch (true) {
            case name === 'welcome':
                return null;
            case name.startsWith('auth/'):
                return AuthLayout;
            case name.startsWith('settings/'):
                return [AppLayout, SettingsLayout];
            case name.startsWith('customer/'):
                return null; // Bebas dari sidebar admin (layar penuh customer)
            case name.startsWith('cashier/'):
                return null; // Bebas dari sidebar admin (UI POS khusus kasir sesuai kiblat kasir)
            default:
                return AppLayout;
        }
    },
    strictMode: true,
    withApp(app, { ssr, page }) {
        if (!ssr && page?.component) {
            applyPageFontTheme(page.component);
        }

        return (
            <TooltipProvider delayDuration={0}>
                {app}
                <Toaster />
            </TooltipProvider>
        );
    },
    progress: {
        color: '#C52828',
    },
});

// This will set light / dark mode on load...
initializeTheme();
