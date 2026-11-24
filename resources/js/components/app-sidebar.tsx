import { Link, router, usePage } from '@inertiajs/react';
import {
    ClipboardList,
    Coffee,
    LayoutGrid,
    LogOut,
    QrCode,
    SlidersHorizontal,
    UserCheck,
    Users,
    Wallet,
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

interface NavGroupConfig {
    label: string;
    roles: ('admin' | 'cashier')[];
    items: ExtendedNavItem[];
}

const navGroups: NavGroupConfig[] = [
    {
        label: 'Keuangan & Analitik',
        roles: ['admin'],
        items: [
            {
                title: 'Ringkasan',
                href: dashboard(),
                icon: LayoutGrid,
            },
            {
                title: 'Pengelolaan Keuangan',
                href: '/admin/financial-reports',
                icon: Wallet,
            },
        ],
    },
    {
        label: 'Manajemen Sistem & Master',
        roles: ['admin'],
        items: [
            {
                title: 'Menu & Kategori',
                href: '/admin/menus',
                icon: Coffee,
            },
            {
                title: 'Meja & QR Code',
                href: '/admin/tables',
                icon: QrCode,
            },
            {
                title: 'Staf & Hak Akses',
                href: '/admin/users',
                icon: Users,
            },
            {
                title: 'Manajemen Sistem',
                href: '/admin/location-settings',
                icon: SlidersHorizontal,
            },
        ],
    },
    {
        label: 'Operasional Kasir',
        roles: ['cashier'],
        items: [
            {
                title: 'Pesanan Masuk',
                href: '/cashier/orders',
                icon: ClipboardList,
                badge: '+Baru',
            },
        ],
    },
];

export function AppSidebar() {
    const { auth } = usePage<{ auth: { user: User } }>().props;
    const userRole = auth?.user?.role ?? 'cashier';
    const homeLink = userRole === 'cashier' ? '/cashier/orders' : dashboard();

    const visibleGroups = navGroups.filter((group) =>
        group.roles.includes(userRole),
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
            <SidebarContent className="gap-4 !bg-[#FAF6EC] py-3">
                {visibleGroups.map((group) => (
                    <div key={group.label}>
                        <div className="px-4 pb-1.5 text-[10px] font-extrabold tracking-widest text-[#8C7A6B] uppercase group-data-[collapsible=icon]:hidden">
                            {group.label}
                        </div>
                        <NavMain items={group.items} />
                    </div>
                ))}
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
