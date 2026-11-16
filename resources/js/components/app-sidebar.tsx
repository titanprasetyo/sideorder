import { Link, router, usePage } from '@inertiajs/react';
import {
    ClipboardList,
    Coffee,
    Layers,
    LayoutGrid,
    LogOut,
    MapPin,
    QrCode,
    UserCheck,
    Users,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavMain, type ExtendedNavItem } from '@/components/nav-main';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { dashboard } from '@/routes';
import type { User } from '@/types';

interface RoleNavItem extends ExtendedNavItem {
    roles?: ('admin' | 'cashier')[];
}

const allNavItems: RoleNavItem[] = [
    {
        title: 'Ringkasan & Keuangan',
        href: dashboard(),
        icon: LayoutGrid,
        roles: ['admin'],
    },
    {
        title: 'Pesanan Masuk',
        href: '/admin/orders',
        icon: ClipboardList,
        badge: '+Baru',
        roles: ['admin'],
    },
    {
        title: 'Pesanan Masuk',
        href: '/cashier/orders',
        icon: ClipboardList,
        badge: '+Baru',
        roles: ['cashier'],
    },
    {
        title: 'Kelola Kasir & Staf',
        href: '/admin/users',
        icon: Users,
        roles: ['admin'],
    },
    {
        title: 'Menu & Produk',
        href: '/admin/menus',
        icon: Coffee,
        roles: ['admin'],
    },
    {
        title: 'Kategori Menu',
        href: '/admin/categories',
        icon: Layers,
        roles: ['admin'],
    },
    {
        title: 'Meja & QR Code',
        href: '/admin/tables',
        icon: QrCode,
        roles: ['admin'],
    },
    {
        title: 'Lokasi & Radius Kafe',
        href: '/admin/location-settings',
        icon: MapPin,
        roles: ['admin'],
    },
];

export function AppSidebar() {
    const { auth } = usePage<{ auth: { user: User } }>().props;
    const userRole = auth?.user?.role ?? 'cashier';
    const homeLink = userRole === 'cashier' ? '/cashier/orders' : dashboard();

    const filteredNavItems = allNavItems.filter(
        (item) => !item.roles || item.roles.includes(userRole),
    );

    const handleLogout = () => {
        router.post('/logout');
    };

    return (
        <Sidebar
            collapsible="icon"
            variant="sidebar"
            className="border-r border-[#E8DFC8] !bg-[#FAF6EC] font-sans"
        >
            {/* Header: Logo SIDEORDER */}
            <SidebarHeader className="border-b border-[#E8DFC8] !bg-[#FAF6EC] p-3.5">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            size="lg"
                            asChild
                            className="rounded-xl transition-colors hover:!bg-[#EFE5CF]"
                        >
                            <Link href={homeLink} prefetch="hover">
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            {/* Menu Navigasi Utama */}
            <SidebarContent className="!bg-[#FAF6EC] py-3">
                <div className="px-4 pb-2 text-[10px] font-extrabold tracking-widest text-[#8C7A6B] uppercase group-data-[collapsible=icon]:hidden">
                    Menu Operasional
                </div>
                <NavMain items={filteredNavItems} />
            </SidebarContent>

            {/* Footer Navigasi: Profil & Logout */}
            <SidebarFooter className="space-y-1.5 border-t border-[#E8DFC8] !bg-[#FAF6EC] p-3">
                <SidebarMenu className="gap-1">
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            asChild
                            className="h-10 rounded-xl px-3 text-xs font-bold !text-[#18181B] transition-colors hover:!bg-[#EFE5CF]"
                        >
                            <Link
                                href="/settings/profile"
                                prefetch="hover"
                                className="flex items-center gap-3"
                            >
                                <UserCheck className="size-4.5 shrink-0 text-[#5B4126]" />
                                <span className="tracking-tight">
                                    Pengaturan Profil
                                </span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton
                            onClick={handleLogout}
                            className="h-10 cursor-pointer rounded-xl px-3 text-xs font-bold !text-[#B91C1C] transition-colors hover:!bg-[#FEE2E2] hover:!text-[#991B1B]"
                        >
                            <div className="flex items-center gap-3">
                                <LogOut className="size-4.5 shrink-0 text-[#B91C1C]" />
                                <span className="tracking-tight">
                                    Keluar / Logout
                                </span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
