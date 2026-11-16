import { Link } from '@inertiajs/react';
import type { PropsWithChildren } from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn, toUrl } from '@/lib/utils';
import { edit as editAppearance } from '@/routes/appearance';
import { edit } from '@/routes/profile';
import { edit as editSecurity } from '@/routes/security';
import type { NavItem } from '@/types';

const sidebarNavItems: NavItem[] = [
    {
        title: 'Profile',
        href: edit(),
        icon: null,
    },
    {
        title: 'Security',
        href: editSecurity(),
        icon: null,
    },
    {
        title: 'Appearance',
        href: editAppearance(),
        icon: null,
    },
];

export default function SettingsLayout({ children }: PropsWithChildren) {
    const { isCurrentOrParentUrl } = useCurrentUrl();

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 font-sans text-[#18181B] sm:p-6 lg:p-8">
            <Heading
                title="Settings"
                description="Manage your profile and account settings"
            />

            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
                <aside className="w-full lg:w-56">
                    <nav
                        className="flex flex-col gap-1.5 rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] p-2 shadow-xs"
                        aria-label="Settings"
                    >
                        {sidebarNavItems.map((item, index) => {
                            const active = isCurrentOrParentUrl(item.href);
                            return (
                                <Button
                                    key={`${toUrl(item.href)}-${index}`}
                                    size="sm"
                                    variant="ghost"
                                    asChild
                                    className={cn(
                                        'h-9 w-full justify-start rounded-xl px-3.5 text-xs font-bold transition-all',
                                        active
                                            ? 'bg-[#C52828] text-white shadow-xs hover:bg-[#A81E1E] hover:text-white'
                                            : 'text-[#57534E] hover:bg-[#FAF6EC] hover:text-[#18181B]',
                                    )}
                                >
                                    <Link href={item.href}>
                                        {item.icon && (
                                            <item.icon className="h-4 w-4" />
                                        )}
                                        {item.title}
                                    </Link>
                                </Button>
                            );
                        })}
                    </nav>
                </aside>

                <Separator className="bg-[#E8DFC8] lg:hidden" />

                <div className="flex-1 md:max-w-2xl">
                    <section className="max-w-2xl space-y-10 rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] p-6 shadow-xs sm:p-8">
                        {children}
                    </section>
                </div>
            </div>
        </div>
    );
}
