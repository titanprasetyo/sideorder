import { Link } from '@inertiajs/react';
import { home } from '@/routes';
import type { AuthLayoutProps } from '@/types';

export default function AuthSimpleLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    return (
        <div className="theme-sideline theme-oxanium relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-[#FAF6EC] p-4 font-sans text-[#18181B] sm:p-6 md:p-10">
            <div className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-[#FBF1CB]/70 blur-3xl" />
            <div className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full bg-[#F3080A]/8 blur-3xl" />

            <div className="animate-sideline-stage relative z-10 w-full max-w-md">
                <div className="flex flex-col overflow-hidden rounded-3xl border border-[#E8DFC8] bg-[#FFFDF9] shadow-md">
                    {/* Top Brand Logo Banner */}
                    <Link
                        href={home()}
                        className="relative flex items-center justify-center overflow-hidden bg-[#F3080A] px-6 py-6 transition hover:opacity-95"
                    >
                        <div className="pointer-events-none absolute inset-0 overflow-hidden">
                            <div className="animate-sideline-shimmer h-full w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                        </div>
                        <img
                            src="/images/sideline-logo.png?v=3"
                            alt="SIDELINE Coffee • Eatery"
                            className="relative z-10 h-14 w-auto object-contain select-none sm:h-16"
                            draggable={false}
                        />
                        <span className="sr-only">{title}</span>
                    </Link>

                    <div className="flex flex-col gap-6 p-6 sm:p-8">
                        <div className="space-y-1.5 text-center">
                            <h1 className="font-heading text-xl font-extrabold tracking-tight text-[#18181B] sm:text-2xl">
                                {title}
                            </h1>
                            <p className="text-center text-sm leading-relaxed font-medium text-[#78716C]">
                                {description}
                            </p>
                        </div>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
