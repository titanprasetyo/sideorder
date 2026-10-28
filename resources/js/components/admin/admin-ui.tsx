/**
 * Komponen UI bersama untuk halaman Admin SIDEORDER.
 * Menggunakan palet warm cream (#FAF6EC, #FFFDF9, #E8DFC8) dan aksen merah (#C52828)
 * agar tampilan seluruh tabel, kartu, dan formulir konsisten dan ramah pengguna.
 */
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export function AdminPage({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn('mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8', className)}>
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#C52828] text-white shadow-sm shadow-[#C52828]/25">
                    <Icon className="size-5" />
                </div>
                <div>
                    <h1 className="text-xl font-extrabold tracking-tight text-[#18181B] sm:text-2xl">{title}</h1>
                    {description && <p className="mt-0.5 text-sm font-medium text-[#78716C]">{description}</p>}
                </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn('overflow-hidden rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] shadow-xs', className)}>
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
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] p-4 shadow-xs transition-shadow hover:shadow-sm">
            <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl shadow-2xs', toneIcon[tone])}>
                <Icon className="size-5" />
            </div>
            <div className="min-w-0">
                <p className="truncate text-xs font-bold text-[#78716C]">{label}</p>
                <p className="text-2xl font-black leading-tight tracking-tight text-[#18181B]">{value}</p>
                {hint && <p className="truncate text-[11px] font-medium text-[#A8A29E]">{hint}</p>}
            </div>
        </div>
    );
}

export function StatGrid({ children }: { children: ReactNode }) {
    return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
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
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset',
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
                className="h-10 w-full rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] pr-9 pl-9 text-sm font-medium text-[#18181B] shadow-xs outline-none transition placeholder:text-[#A8A29E] focus:border-[#C52828] focus:ring-3 focus:ring-[#C52828]/15"
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
                                    'rounded-full px-1.5 text-[10px] leading-4 font-black',
                                    active ? 'bg-white/20 text-white' : 'bg-[#F5EEDC] text-[#5B4126]',
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
            {description && <p className="mt-1 max-w-sm text-xs font-medium text-[#78716C]">{description}</p>}
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
                {description && <p className="text-xs text-[#78716C]">{description}</p>}
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
/* Header dialog form                                                         */
/* -------------------------------------------------------------------------- */

export function FormDialogHeader({
    icon: Icon,
    title,
    description,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
}) {
    return (
        <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FDECEC] text-[#C52828]">
                <Icon className="size-5" />
            </div>
            <div className="space-y-0.5">
                <DialogTitle className="text-base font-extrabold text-[#18181B]">{title}</DialogTitle>
                {description && <DialogDescription className="text-xs text-[#78716C]">{description}</DialogDescription>}
            </div>
        </DialogHeader>
    );
}

export function FieldError({ message }: { message?: string }) {
    if (!message) return null;

    return <p className="text-xs font-semibold text-[#B91C1C]">{message}</p>;
}

/* -------------------------------------------------------------------------- */
/* Dialog konfirmasi hapus                                                    */
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
            <DialogContent className="rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] sm:max-w-sm">
                <div className="flex flex-col items-center gap-3 pt-2 text-center">
                    <div className="flex size-14 items-center justify-center rounded-full bg-[#FEE2E2] text-[#B91C1C] ring-8 ring-[#FEF2F2]">
                        <AlertTriangle className="size-6" />
                    </div>
                    <DialogHeader className="items-center text-center">
                        <DialogTitle className="text-base font-extrabold text-[#18181B]">{title}</DialogTitle>
                        <DialogDescription className="text-sm text-[#78716C]">{description}</DialogDescription>
                    </DialogHeader>
                </div>
                <DialogFooter className="mt-2 gap-2 sm:justify-center">
                    <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl border-[#DFCFA9] bg-white font-semibold text-[#18181B] hover:bg-[#FAF5E8] sm:flex-1"
                        onClick={() => onOpenChange(false)}
                        disabled={processing}
                    >
                        Batal
                    </Button>
                    <Button
                        type="button"
                        className="rounded-xl bg-[#C52828] font-bold text-white hover:bg-[#A81E1E] sm:flex-1"
                        onClick={onConfirm}
                        disabled={processing}
                    >
                        {processing ? 'Memproses...' : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
