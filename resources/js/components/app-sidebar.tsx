import { Link, router, usePage } from '@inertiajs/react';
import {
    ClipboardList,
    Coffee,
    FileSpreadsheet,
    Layers,
    LayoutGrid,
    LogOut,
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
        title: 'Ringkasan',
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
        title: 'Laporan Keuangan',
        href: '/admin/financial-reports',
        icon: FileSpreadsheet,
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
        title: 'Menu',
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
];

export function AppSidebar() {
    const { auth } = usePage<{ auth: { user: User } }>().props;
    const userRole = auth?.user?.role ?? 'cashier';
    const homeLink = userRole === 'cashier' ? '/cashier/orders' : dashboard();

    const filteredNavItems = allNavItems.filter(
        (item) => !item.roles || item.roles.includes(userRole)
    );

    const handleLogout = () => {
        router.post('/logout');
    };

    return (
        <Sidebar collapsible="icon" variant="sidebar" className="!bg-[#FAF6EC] border-r border-[#E8DFC8]">
            {/* Header: Logo SIDEORDER */}
            <SidebarHeader className="p-3.5 border-b
             border-[#E8DFC8] !bg-[#FAF6EC]">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild className="hover:!bg-[#EFE5CF]">
                            <Link href={homeLink} prefetch>
                                <AppLogo />
                                
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            {/* Menu Navigasi Utama */}
            <SidebarContent className="py-2.5 !bg-[#FAF6EC]">
                <NavMain items={filteredNavItems} />
            </SidebarContent>

            {/* Footer Navigasi: Profil & Logout */}
            <SidebarFooter className="p-3 border-t border-[#E8DFC8] space-y-1.5 !bg-[#FAF6EC]">
                <SidebarMenu className="gap-1">
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild className="h-10 px-3 rounded-xl text-xs font-bold !text-neutral-900 hover:!bg-[#EFE5CF] transition-colors">
                            <Link href="/settings/profile" prefetch className="flex items-center gap-3">
                                <UserCheck className="size-4.5 shrink-0 text-neutral-800" />
                                <span>Profil Admin</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <SidebarMenuButton
                            onClick={handleLogout}
                            className="h-10 px-3 rounded-xl text-xs font-bold !text-[#B91C1C] hover:!bg-[#FEE2E2] hover:!text-[#991B1B] transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <LogOut className="size-4.5 shrink-0 text-[#B91C1C]" />
                                <span>Logout</span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}