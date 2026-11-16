import { Link, usePage } from '@inertiajs/react';
import { Maximize2, Wifi } from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { BreadcrumbItem as BreadcrumbItemType, User } from '@/types';

export function AppSidebarHeader({
    breadcrumbs = [],
}: {
    breadcrumbs?: BreadcrumbItemType[];
}) {
    const { auth } = usePage<{ auth: { user: User } }>().props;
    const userName = auth?.user?.name ?? 'Arya Pratama';
    const userInitials = userName.slice(0, 2).toUpperCase();

    return (
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#E8DFC8] bg-[#FAF6EC]/95 px-4 font-sans backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5 pr-2">
                <SidebarTrigger className="-ml-1 shrink-0 rounded-xl !text-[#18181B] hover:!bg-[#EFE5CF]" />
                <div className="min-w-0 overflow-hidden">
                    <Breadcrumbs breadcrumbs={breadcrumbs} />
                </div>
            </div>

            {/* Quick status widgets */}
            <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
                {/* Status Icons */}
                <div className="hidden shrink-0 items-center gap-1 text-[#78716C] md:flex">
                    <button
                        type="button"
                        onClick={() => {
                            if (!document.fullscreenElement) {
                                document.documentElement.requestFullscreen?.();
                            } else {
                                document.exitFullscreen?.();
                            }
                        }}
                        className="cursor-pointer rounded-xl p-2 transition-colors hover:bg-[#EFE5CF] hover:text-[#18181B]"
                        title="Layar Penuh"
                    >
                        <Maximize2 className="size-4" />
                    </button>
                    <div
                        className="p-2 text-emerald-600"
                        title="Jaringan Normal"
                    >
                        <Wifi className="size-4" />
                    </div>
                </div>

                {/* Admin Profile Pill */}
                <Link
                    href="/settings/profile"
                    className="flex shrink-0 items-center gap-2.5 rounded-xl border border-[#E8DFC8] bg-[#FFFDF9] py-1 pr-2.5 pl-1.5 shadow-2xs transition-all hover:border-[#DFCFA9] hover:bg-[#FAF5E8] sm:pr-3.5 sm:pl-2"
                >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#C52828] text-xs font-extrabold text-white shadow-2xs">
                        {userInitials}
                    </div>
                    <div className="hidden text-left lg:block">
                        <div className="text-xs leading-tight font-extrabold tracking-tight text-[#18181B]">
                            {userName}
                        </div>
                        <div className="text-[10px] font-semibold text-[#78716C]">
                            {auth?.user?.role === 'admin'
                                ? 'Head Barista / SPV'
                                : 'Kasir SIDE LINE'}
                        </div>
                    </div>
                </Link>
            </div>
        </header>
    );
}
