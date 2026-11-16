import type { Auth } from '@/types/auth';

declare module 'react' {
    interface InputHTMLAttributes<T> {
        passwordrules?: string;
    }
}

export interface SharedPaymentGatewayProps {
    driver: string;
    label: string;
    isConfigured: boolean;
    mode: string;
}

export interface SharedFlashProps {
    success?: string | null;
    error?: string | null;
    info?: string | null;
    toast?: string | null;
}

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            sidebarOpen: boolean;
            flash?: SharedFlashProps;
            paymentGateway?: SharedPaymentGatewayProps;
            [key: string]: unknown;
        };
    }
}
