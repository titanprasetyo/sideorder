import { Coffee } from 'lucide-react';

export default function AppLogo() {
    return (
        <div className="flex items-center gap-2.5">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-[#C52828] text-white shadow-xs">
                <Coffee className="size-5 text-white" />
            </div>
            <div className="grid flex-1 text-left">
                <span className="truncate leading-tight font-black tracking-wide text-neutral-900 text-sm">
                    SIDEORDER
                </span>
                <span className="truncate text-[10px] font-medium text-neutral-500">
                    SIDE LINE Cafe Admin
                </span>
            </div>
        </div>
    );
}
