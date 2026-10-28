import { Link, usePage } from '@inertiajs/react';
import { Maximize2, Store, Wifi } from 'lucide-react';
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
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E8DFC8] bg-[#FAF6EC] px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6">
            <div className="flex items-center gap-2">
                <SidebarTrigger className="-ml-1 !text-neutral-900 hover:!bg-[#EFE5CF]" />
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            </div>

            {/* Quick status widgets matching reference kiblat */}
            <div className="flex items-center gap-2.5">
                {/* Yellow POS Cloud Pill */}
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-[#FEF9C3] border border-[#FEF08A] rounded-full text-[11px] font-bold text-[#854D0E] shadow-2xs">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Koneksi POS Cloud AKTIF</span>
                </div>

                {/* Red Buka Kasir Button */}
                <Link
                    href="/cashier/orders"
                    className="h-8 px-3 bg-[#C52828] hover:bg-[#A81E1E] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                    <Store className="size-3.5" />
                    <span>Buka Kasir</span>
                </Link>

                {/* Status Icons */}
                <div className="hidden md:flex items-center gap-1 text-neutral-500">
                    <button
                        type="button"
                        onClick={() => {
                            if (!document.fullscreenElement) {
                                document.documentElement.requestFullscreen?.();
                            } else {
                                document.exitFullscreen?.();
                            }
                        }}
                        className="p-1.5 hover:bg-[#EFE5CF] rounded-lg transition-colors"
                        title="Layar Penuh"
                    >
                        <Maximize2 className="size-4" />
                    </button>
                    <div className="p-1.5 text-emerald-600" title="Jaringan Normal">
                        <Wifi className="size-4" />
                    </div>
                </div>

                {/* Admin Profile Pill */}
                <Link
                    href="/settings/profile"
                    className="flex items-center gap-2 pl-2 pr-3 py-1 bg-[#FFFDF9] border border-[#DFCFA9] rounded-xl hover:bg-[#FAF5E8] transition-colors shadow-2xs"
                >
                    <div className="size-7 rounded-full bg-[#E5D7B7] border border-[#D8C7A2] flex items-center justify-center text-neutral-900 font-black text-xs">
                        {userInitials}
                    </div>
                    <div className="text-left hidden lg:block">
                        <div className="text-xs font-bold text-neutral-900 leading-tight">
                            {userName}
                        </div>
                        <div className="text-[10px] text-neutral-500 font-medium">
                            {auth?.user?.role === 'admin' ? 'Head Barista / SPV' : 'Kasir SIDE LINE'}
                        </div>
                    </div>
                </Link>
            </div>
        </header>
    );
}
