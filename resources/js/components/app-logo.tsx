export default function AppLogo() {
    return (
        <div className="flex items-center gap-3 font-sans">
            <div className="flex aspect-square size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F3080A] text-white shadow-sm ring-1 shadow-[#F3080A]/25 ring-black/5">
                <img
                    src="/images/sideline-icon.png"
                    alt="SIDELINE"
                    className="size-full object-cover"
                />
            </div>
            <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-heading text-sm font-black tracking-tight text-[#18181B] uppercase">
                    SIDELINE
                </span>
                <span className="truncate text-[10px] font-bold tracking-[0.14em] text-[#78716C] uppercase">
                    Coffee &bull; Eatery
                </span>
            </div>
        </div>
    );
}
