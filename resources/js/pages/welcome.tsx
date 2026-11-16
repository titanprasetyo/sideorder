import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowRight, LogIn } from 'lucide-react';
import { dashboard, login } from '@/routes';

export default function Welcome() {
    const { auth } = usePage<{
        auth: { user?: { name: string; role?: string } | null };
    }>().props;

    const targetUrl = auth?.user
        ? auth.user.role === 'cashier'
            ? '/cashier/orders'
            : dashboard()
        : login();

    return (
        <>
            <Head title="SIDELINE • Coffee & Eatery" />

            <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 overflow-hidden bg-[#F3080A] px-6 select-none">
                {/* Logo SIDELINE Full Layar Tanpa Card / Bingkai */}
                <div className="animate-sideline-logo flex w-full max-w-4xl items-center justify-center">
                    <img
                        src="/images/sideline-logo.png?v=3"
                        alt="SIDELINE Coffee • Eatery"
                        className="h-auto w-full object-contain"
                        draggable={false}
                    />
                </div>

                {/* Tombol Akses Portal Tunggal */}
                <div
                    className="animate-sideline-fade-up flex flex-wrap items-center justify-center"
                    style={{ animationDelay: '0.28s' }}
                >
                    <Link
                        href={targetUrl}
                        className="inline-flex h-11 items-center gap-2.5 rounded-full bg-white px-8 text-sm font-extrabold text-[#F3080A] shadow-lg shadow-black/15 transition duration-200 hover:scale-[1.03] hover:bg-[#FFFDF9] active:scale-[0.98]"
                    >
                        <LogIn className="size-4" />
                        <span>Login</span>
                        <ArrowRight className="size-4" />
                    </Link>
                </div>
            </main>
        </>
    );
}
