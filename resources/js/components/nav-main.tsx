import { Link } from '@inertiajs/react';
import {
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';

export interface ExtendedNavItem extends NavItem {
    badge?: string;
}

export function NavMain({ items }: { items: ExtendedNavItem[] }) {
    const { isCurrentUrl } = useCurrentUrl();

    return (
        <SidebarGroup className="px-2.5 py-0 font-sans">
            <SidebarMenu className="gap-1">
                {items.map((item) => {
                    const active = isCurrentUrl(item.href);

                    return (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                                asChild
                                isActive={active}
                                tooltip={{ children: item.title }}
                                className={`h-10 rounded-xl px-3 text-xs font-bold transition-all ${
                                    active
                                        ? 'border border-[#DFCFA9] !bg-[#EBDDC1] !text-[#18181B] shadow-2xs'
                                        : '!text-[#3F2D1C] hover:!bg-[#EFE5CF] hover:!text-[#18181B]'
                                }`}
                            >
                                <Link
                                    href={item.href}
                                    prefetch="hover"
                                    className="flex w-full items-center justify-between"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        {item.icon && (
                                            <item.icon
                                                className={`size-4.5 shrink-0 transition-colors ${
                                                    active
                                                        ? 'text-[#C52828]'
                                                        : 'text-[#5B4126]'
                                                }`}
                                            />
                                        )}
                                        <span className="truncate font-bold tracking-tight !text-[#18181B]">
                                            {item.title}
                                        </span>
                                    </div>
                                    {item.badge && (
                                        <span className="shrink-0 rounded-md bg-[#C52828] px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-white shadow-2xs">
                                            {item.badge}
                                        </span>
                                    )}
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}
