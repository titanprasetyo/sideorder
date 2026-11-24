/**
 * Komponen UI bersama untuk halaman Admin SIDEORDER.
 * Menggunakan palet warm cream (#FAF6EC, #FFFDF9, #E8DFC8) dan aksen merah (#C52828)
 * agar tampilan seluruh tabel, kartu, dan formulir konsisten dan ramah pengguna.
 */
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Coffee, Search, Sparkles, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export function AdminPage({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'animate-sideline-fade-up mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 font-sans sm:p-6 lg:p-8',
                className,
            )}
        >
            {children}
        </div>
    );
}

export function PageHeader({
    icon: Icon,
    title,
    description,
    actions,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3 border-b border-[#E8DFC8] pb-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#C52828] to-[#991B1B] text-white shadow-sm ring-1 shadow-[#C52828]/25 ring-white/20">
                    <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                    <h1 className="truncate font-heading text-lg font-extrabold tracking-tight text-[#18181B] sm:text-xl">
                        {title}
                    </h1>
                    {description && (
                        <p className="truncate text-xs font-medium text-[#78716C]">
                            {description}
                        </p>
                    )}
                </div>
            </div>
            {actions && (
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
                    {actions}
                </div>
            )}
        </div>
    );
}

export function Panel({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'overflow-hidden rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] shadow-xs',
                className,
            )}
        >
            {children}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Statistik                                                                  */
/* -------------------------------------------------------------------------- */

type Tone = 'brand' | 'success' | 'warning' | 'neutral' | 'danger';

const toneIcon: Record<Tone, string> = {
    brand: 'bg-[#FDECEC] text-[#C52828] border border-[#F8D7D7]',
    success: 'bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]',
    warning: 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]',
    neutral: 'bg-[#F5EEDC] text-[#5B4126] border border-[#E8DFC8]',
    danger: 'bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]',
};

export function StatCard({
    label,
    value,
    hint,
    icon: Icon,
    tone = 'neutral',
}: {
    label: string;
    value: ReactNode;
    hint?: string;
    icon: LucideIcon;
    tone?: Tone;
}) {
    return (
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] p-4 shadow-xs transition-all hover:border-[#DFCFA9] hover:shadow-sm">
            <div
                className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-xl shadow-2xs',
                    toneIcon[tone],
                )}
            >
                <Icon className="size-5" />
            </div>
            <div className="min-w-0">
                <p className="truncate text-[11px] font-bold tracking-wide text-[#78716C] uppercase">
                    {label}
                </p>
                <p className="font-mono text-2xl leading-tight font-black tracking-tight text-[#18181B] tabular-nums">
                    {value}
                </p>
                {hint && (
                    <p className="truncate text-[11px] font-medium text-[#A8A29E]">
                        {hint}
                    </p>
                )}
            </div>
        </div>
    );
}

export function StatGrid({ children }: { children: ReactNode }) {
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    );
}

/* -------------------------------------------------------------------------- */
/* Badge status                                                               */
/* -------------------------------------------------------------------------- */

const tonePill: Record<Tone, string> = {
    brand: 'bg-[#FDECEC] text-[#C52828] ring-[#F8D7D7]',
    success: 'bg-[#DCFCE7] text-[#15803D] ring-[#BBF7D0]',
    warning: 'bg-[#FEF3C7] text-[#92400E] ring-[#FDE68A]',
    neutral: 'bg-[#F5EEDC] text-[#5B4126] ring-[#E8DFC8]',
    danger: 'bg-[#FEE2E2] text-[#B91C1C] ring-[#FECACA]',
};

export function StatusPill({
    tone = 'neutral',
    children,
    dot = false,
    icon: Icon,
    className,
}: {
    tone?: Tone;
    children: ReactNode;
    dot?: boolean;
    icon?: LucideIcon;
    className?: string;
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ring-1 ring-inset',
                tonePill[tone],
                className,
            )}
        >
            {dot && <span className="size-1.5 rounded-full bg-current" />}
            {Icon && <Icon className="size-3" />}
            {children}
        </span>
    );
}

/* -------------------------------------------------------------------------- */
/* Toolbar: pencarian & filter                                                */
/* -------------------------------------------------------------------------- */

export function SearchInput({
    value,
    onChange,
    placeholder = 'Cari...',
    className,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}) {
    return (
        <div className={cn('relative w-full sm:max-w-xs', className)}>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#A8A29E]" />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-10 w-full rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] pr-9 pl-9 text-sm font-medium text-[#18181B] shadow-xs transition outline-none placeholder:text-[#A8A29E] focus:border-[#C52828] focus:ring-3 focus:ring-[#C52828]/15"
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-[#78716C] hover:bg-[#F5EEDC] hover:text-[#18181B]"
                    aria-label="Hapus pencarian"
                >
                    <X className="size-3.5" />
                </button>
            )}
        </div>
    );
}

export interface FilterOption<T extends string | number> {
    value: T;
    label: string;
    count?: number;
}

export function FilterTabs<T extends string | number>({
    options,
    value,
    onChange,
}: {
    options: FilterOption<T>[];
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[#E8DFC8] bg-[#FFFDF9] p-1 shadow-xs">
            {options.map((opt) => {
                const active = opt.value === value;

                return (
                    <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors',
                            active
                                ? 'bg-[#C52828] text-white shadow-xs'
                                : 'text-[#78716C] hover:bg-[#F5EEDC] hover:text-[#18181B]',
                        )}
                    >
                        {opt.label}
                        {opt.count !== undefined && (
                            <span
                                className={cn(
                                    'rounded-md px-1.5 text-[10px] leading-4 font-black',
                                    active
                                        ? 'bg-white/20 text-white'
                                        : 'bg-[#F5EEDC] text-[#5B4126]',
                                )}
                            >
                                {opt.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-[#E8DFC8] bg-[#F5EEDC] text-[#5B4126]">
                <Icon className="size-6" />
            </div>
            <p className="text-sm font-bold text-[#18181B]">{title}</p>
            {description && (
                <p className="mt-1 max-w-sm text-xs font-medium text-[#78716C]">
                    {description}
                </p>
            )}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Tombol ikon aksi                                                           */
/* -------------------------------------------------------------------------- */

export function IconAction({
    icon: Icon,
    label,
    onClick,
    variant = 'default',
    disabled,
}: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
    variant?: 'default' | 'danger';
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            disabled={disabled}
            className={cn(
                'flex size-8 items-center justify-center rounded-lg border border-transparent transition-colors disabled:pointer-events-none disabled:opacity-40',
                variant === 'danger'
                    ? 'text-[#B91C1C] hover:border-[#FECACA] hover:bg-[#FEE2E2]'
                    : 'text-[#78716C] hover:border-[#E8DFC8] hover:bg-[#F5EEDC] hover:text-[#18181B]',
            )}
        >
            <Icon className="size-4" />
        </button>
    );
}

/* -------------------------------------------------------------------------- */
/* Switch (toggle aktif/nonaktif)                                             */
/* -------------------------------------------------------------------------- */

export function ToggleField({
    id,
    checked,
    onChange,
    label,
    description,
}: {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    description?: string;
}) {
    return (
        <label
            htmlFor={id}
            className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[#E8DFC8] bg-[#FAF5E8] px-4 py-3 transition-colors hover:bg-[#F5EEDC]"
        >
            <div>
                <p className="text-sm font-bold text-[#18181B]">{label}</p>
                {description && (
                    <p className="text-xs text-[#78716C]">{description}</p>
                )}
            </div>
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-[#C52828]/25 focus-visible:outline-none',
                    checked ? 'bg-[#16A34A]' : 'bg-[#D6CBB3]',
                )}
            >
                <span
                    className={cn(
                        'inline-block size-5 rounded-full bg-white shadow-sm transition-transform',
                        checked ? 'translate-x-5.5' : 'translate-x-0.5',
                    )}
                />
            </button>
        </label>
    );
}

/* -------------------------------------------------------------------------- */
/* Header dialog form (Gaya Card Modal Pemesanan Meja QRIS)                   */
/* -------------------------------------------------------------------------- */

export function FormDialogHeader({
    icon: Icon,
    title,
    description,
    badge = 'SIDE LINE • ADMIN',
    tag,
    statusLabel,
    statusActive = true,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    badge?: string;
    tag?: string;
    statusLabel?: string;
    statusActive?: boolean;
}) {
    return (
        <div className="space-y-1 pr-10 text-left">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-[#FDECEB] px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#C52828] uppercase">
                    <Icon className="size-3" />
                    {badge}
                </span>
                {tag && (
                    <span className="rounded-md bg-[#1A1A1A] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
                        {tag}
                    </span>
                )}
                {statusLabel && (
                    <span
                        className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase',
                            statusActive
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-neutral-200 text-neutral-700',
                        )}
                    >
                        <span
                            className={cn(
                                'size-1.5 rounded-full',
                                statusActive
                                    ? 'bg-emerald-500'
                                    : 'bg-neutral-500',
                            )}
                        />
                        {statusLabel}
                    </span>
                )}
            </div>
            <DialogHeader className="space-y-0.5 text-left">
                <DialogTitle className="text-[17px] font-bold tracking-tight text-[#1A1A1A] sm:text-lg">
                    {title}
                </DialogTitle>
                {description && (
                    <DialogDescription className="text-xs text-[#6E6A64]">
                        {description}
                    </DialogDescription>
                )}
            </DialogHeader>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Kartu Standee Preview Kiri (Gaya Modal QR Code Meja 2 Kolom)               */
/* -------------------------------------------------------------------------- */

export function StandeeModalCard({
    pillPrimary,
    pillSecondary,
    topBadgeIcon: TopBadgeIcon,
    topBadgeLabel = 'PREVIEW',
    heading,
    subheading,
    steps,
    children,
    footerSlot,
    className,
}: {
    pillPrimary: string;
    pillSecondary?: string;
    topBadgeIcon?: LucideIcon;
    topBadgeLabel?: string;
    heading: string;
    subheading?: string;
    steps: [
        { num?: string; label: string },
        { num?: string; label: string },
        { num?: string; label: string },
    ];
    children: ReactNode;
    footerSlot?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex w-full shrink-0 flex-col items-center justify-center gap-2.5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-3 shadow-[0_2px_12px_rgba(26,26,26,0.03)] md:w-[275px] lg:w-[290px]',
                className,
            )}
        >
            <div className="relative flex w-full max-w-[15.5rem] flex-col items-center overflow-hidden rounded-2xl border-2 border-[#E2D4B5] bg-[#FFFDF9] shadow-md">
                {/* Header Brand Café SIDE LINE */}
                <div className="relative w-full overflow-hidden bg-gradient-to-br from-[#C52828] via-[#B71C1C] to-[#8E1414] px-3.5 pt-2.5 pb-3.5 text-center text-white">
                    <div className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full bg-[#FBF1CB]/15 blur-lg" />
                    <div className="pointer-events-none absolute -bottom-8 -left-8 size-20 rounded-full bg-black/15 blur-lg" />

                    <div className="relative z-10 flex flex-col items-center">
                        <div className="mb-1 flex items-center gap-1.5 rounded-md border border-[#FBF1CB]/30 bg-white/10 px-2.5 py-0.5 backdrop-blur-xs">
                            <Coffee className="size-2.5 text-[#FBF1CB]" />
                            <span className="text-[8px] font-extrabold tracking-[0.2em] text-[#FBF1CB] uppercase">
                                Café & Roastery
                            </span>
                        </div>
                        <h3 className="font-heading text-lg leading-none font-black tracking-[0.14em] text-white uppercase">
                            SIDE LINE
                        </h3>
                    </div>
                </div>

                {/* Badge Melayang di Perbatasan Header */}
                <div className="relative z-20 -mt-3 flex flex-col items-center">
                    <div className="inline-flex items-center gap-1.5 rounded-md border-2 border-[#FFFDF9] bg-[#FBF1CB] px-3 py-0.5 shadow-md">
                        <span className="size-1.5 rounded-full bg-[#C52828]" />
                        <span className="max-w-[7rem] truncate font-heading text-[11px] font-black tracking-[0.08em] text-[#3F2D1C] uppercase">
                            {pillPrimary}
                        </span>
                        {pillSecondary && (
                            <>
                                <span className="text-[#C8B58A]">•</span>
                                <span className="max-w-[5.25rem] truncate text-[9px] font-bold text-[#78716C]">
                                    {pillSecondary}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Area Utama Bingkai Viewfinder & Konten Preview */}
                <div className="flex w-full flex-col items-center gap-2 px-3 pt-2.5 pb-2.5">
                    <div className="relative mt-0.5 rounded-2xl border border-[#E8DFC8] bg-gradient-to-b from-white to-[#FAF6EC] p-2.5 shadow-sm">
                        {/* Label Pill Atas Bingkai */}
                        <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2">
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#C52828] px-2.5 py-0.5 text-[8px] font-extrabold tracking-widest whitespace-nowrap text-white uppercase shadow-xs">
                                {TopBadgeIcon && (
                                    <TopBadgeIcon className="size-2.5" />
                                )}
                                {topBadgeLabel}
                            </span>
                        </div>

                        {/* 4 Siku Viewfinder Kamera (#C52828) */}
                        <span className="pointer-events-none absolute top-1.5 left-1.5 size-3.5 rounded-tl-lg border-t-[3px] border-l-[3px] border-[#C52828]" />
                        <span className="pointer-events-none absolute top-1.5 right-1.5 size-3.5 rounded-tr-lg border-t-[3px] border-r-[3px] border-[#C52828]" />
                        <span className="pointer-events-none absolute bottom-1.5 left-1.5 size-3.5 rounded-bl-lg border-b-[3px] border-l-[3px] border-[#C52828]" />
                        <span className="pointer-events-none absolute right-1.5 bottom-1.5 size-3.5 rounded-br-lg border-r-[3px] border-b-[3px] border-[#C52828]" />

                        {/* Isi Bingkai */}
                        <div className="relative overflow-hidden rounded-xl border border-[#EFE5CF] bg-white p-1.5 shadow-2xs">
                            {children}
                        </div>
                    </div>

                    {/* Teks Judul & Subjudul */}
                    <div className="space-y-0.5 px-1 text-center">
                        <p className="line-clamp-1 font-heading text-[13px] font-black tracking-tight text-[#18181B]">
                            {heading}
                        </p>
                        {subheading && (
                            <p className="line-clamp-2 text-[9.5px] leading-snug font-medium text-[#78716C]">
                                {subheading}
                            </p>
                        )}
                    </div>

                    {/* 3 Kotak Info/Langkah Visual */}
                    <div className="grid w-full grid-cols-3 gap-1 rounded-xl border border-[#E8DFC8] bg-[#FAF6EC] p-1 text-center">
                        {steps.map((step, idx) => (
                            <div
                                key={idx}
                                className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg bg-[#FFFDF9] px-1 py-1 shadow-2xs"
                            >
                                <span className="text-[8px] font-black text-[#C52828]">
                                    {step.num ?? `0${idx + 1}`}
                                </span>
                                <span className="w-full truncate text-[9px] leading-tight font-bold text-[#18181B]">
                                    {step.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Kartu Standee */}
                <div className="flex w-full items-center justify-center gap-1.5 border-t border-[#E8DFC8] bg-[#FAF5E8] px-3 py-1 text-[8px] font-extrabold tracking-[0.16em] text-[#78716C] uppercase">
                    <Sparkles className="size-2 text-[#C52828]" />
                    <span>SIDEORDER • DIGITAL MENU</span>
                </div>
            </div>

            {footerSlot}
        </div>
    );
}

export function FieldError({ message }: { message?: string }) {
    if (!message) return null;

    return <p className="text-xs font-semibold text-[#B91C1C]">{message}</p>;
}

/* -------------------------------------------------------------------------- */
/* Dialog konfirmasi hapus (Gaya Card Modal Pemesanan Meja QRIS)              */
/* -------------------------------------------------------------------------- */

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = 'Ya, Hapus',
    onConfirm,
    processing = false,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: ReactNode;
    confirmLabel?: string;
    onConfirm: () => void;
    processing?: boolean;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl">
                {/* Sticky Top Header ala QRIS Card Modal */}
                <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pr-14 pb-3.5">
                    <div className="mb-1 flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#FDECEB] px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#C52828] uppercase">
                            <AlertTriangle className="size-3" />
                            Konfirmasi Tindakan
                        </span>
                        <span className="rounded-md bg-[#1A1A1A] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
                            SIDE LINE
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">
                            <span className="size-1.5 rounded-full bg-amber-500" />
                            Perhatian
                        </span>
                    </div>
                    <DialogHeader className="space-y-0.5 text-left">
                        <DialogTitle className="text-[17px] font-bold tracking-tight text-[#1A1A1A] sm:text-lg">
                            {title}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-[#6E6A64]">
                            Pastikan kembali sebelum melanjutkan tindakan ini.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                {/* Inner Card Body 2-Bagian ala QRIS Card Modal */}
                <div className="space-y-3.5 bg-[#FAF8F4] p-4 sm:p-5">
                    <div className="flex items-center justify-between rounded-xl bg-[#1A1A1A] p-3.5 text-white shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black tracking-tight text-white">
                                <AlertTriangle className="size-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold tracking-wide text-white uppercase">
                                    SIDE LINE COFFEE • OTORISASI ADMIN
                                </p>
                                <p className="text-[10px] text-white/60">
                                    Tindakan bersifat permanen & langsung
                                    diperbarui di sistem
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-medium text-white/60">
                                Status
                            </p>
                            <p className="text-xs font-black text-amber-400 uppercase">
                                Konfirmasi
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                        <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                            <span className="flex items-center gap-1.5">
                                <Sparkles className="size-3.5 text-[#C52828]" />
                                Detail Konfirmasi Tindakan
                            </span>
                            <span className="font-mono text-[10px] text-[#6E6A64]">
                                Verifikasi Admin
                            </span>
                        </div>
                        <div className="rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-3 text-xs leading-relaxed text-[#4A4640]">
                            {description}
                        </div>
                    </div>
                </div>

                {/* Sticky Footer Action Bar ala QRIS Card Modal */}
                <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5">
                    <span className="hidden text-[11px] font-semibold text-[#6E6A64] sm:inline">
                        Tindakan ini memerlukan konfirmasi Anda
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                            onClick={() => onOpenChange(false)}
                            disabled={processing}
                        >
                            Batal
                        </Button>
                        <Button
                            type="button"
                            className="h-11 cursor-pointer gap-2 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222]"
                            onClick={onConfirm}
                            disabled={processing}
                        >
                            {processing ? 'Memproses...' : confirmLabel}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
