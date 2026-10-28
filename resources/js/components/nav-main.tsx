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
        <SidebarGroup className="px-2.5 py-0">
            <SidebarMenu className="gap-1.5">
                {items.map((item) => {
                    const active = isCurrentUrl(item.href);

                    return (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                                asChild
                                isActive={active}
                                tooltip={{ children: item.title }}
                                className={`h-10 px-3 rounded-xl text-xs font-bold transition-all ${
                                    active
                                        ? '!bg-[#EBDDC1] !text-neutral-900 shadow-2xs border border-[#DFCFA9]'
                                        : '!text-neutral-800 hover:!bg-[#EFE5CF] hover:!text-neutral-950'
                                }`}
                            >
                                <Link href={item.href} prefetch className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-3">
                                        {item.icon && (
                                            <item.icon
                                                className={`size-4.5 shrink-0 ${
                                                    active ? 'text-[#C52828]' : 'text-neutral-800'
                                                }`}
                                            />
                                        )}
                                        <span className="font-bold tracking-tight !text-neutral-900">
                                            {item.title}
                                        </span>
                                    </div>
                                    {item.badge && (
                                        <span className="bg-[#C52828] text-white text-[10px] font-black px-1.5 py-0.2 rounded-full shadow-2xs">
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
