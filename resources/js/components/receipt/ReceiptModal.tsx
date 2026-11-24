import { Printer, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { FormDialogHeader } from '@/components/admin/admin-ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
    getOrderPaymentSummary,
    groupOrderItemsByBatch,
    type OrderBatchItem,
} from '@/lib/order-batches';
import { cn } from '@/lib/utils';

export type ReceiptPaperWidth = '80' | '58';

export interface ReceiptCafeSettings {
    cafe_name?: string | null;
    address?: string | null;
    phone?: string | null;
    receipt_footer?: string | null;
}

export interface ReceiptOrderItem extends OrderBatchItem {
    unit_price?: string | number;
    customer_notes?: string | null;
}

export interface ReceiptOrder {
    id: number;
    order_number: string;
    customer_name: string;
    subtotal: string | number;
    total_amount: string | number;
    order_status: string;
    payment_status: string;
    payment_method: string | null;
    payment_channel?: string | null;
    settled_amount?: number;
    unpaid_balance?: number;
    notes?: string | null;
    created_at: string;
    table?: {
        id: number;
        table_number: string;
        name: string | null;
    } | null;
    items: ReceiptOrderItem[];
}

interface ReceiptModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    order: ReceiptOrder | null;
    cafeSettings?: ReceiptCafeSettings;
    staffName?: string;
}

const PAPER_STORAGE_KEY = 'sideorder_receipt_paper_width';

function formatRupiah(amount: number | string | undefined | null): string {
    const numeric =
        typeof amount === 'string'
            ? parseFloat(amount) || 0
            : Number(amount) || 0;
    return `Rp ${new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(numeric)}`;
}

function formatReceiptDateTimeWib(dateStr: string): string {
    const dt = new Date(dateStr);
    if (Number.isNaN(dt.getTime())) {
        return '-';
    }

    const formatted = dt.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
    });
    const time = dt.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta',
    });

    return `${formatted}, ${time} WIB`;
}

function resolveOrderStatusLabel(status: string): string {
    switch (status) {
        case 'pending':
            return 'Menunggu';
        case 'processing':
            return 'Diracik';
        case 'ready':
            return 'Siap Saji';
        case 'completed':
            return 'Selesai';
        case 'cancelled':
            return 'Dibatalkan';
        default:
            return status.toUpperCase();
    }
}

function resolvePaymentMethodLabel(order: ReceiptOrder): string {
    const channel = (order.payment_channel || '').trim();
    if (channel) {
        return channel.toUpperCase();
    }

    const method = (order.payment_method || '').toLowerCase();
    if (method === 'qris') return 'QRIS';
    if (method === 'cash') return 'Tunai';
    if (method === 'card') return 'Kartu';

    return order.payment_method ? order.payment_method.toUpperCase() : 'Tunai';
}

interface ThermalReceiptPaperProps {
    order: ReceiptOrder;
    cafeSettings?: ReceiptCafeSettings;
    staffName?: string;
    paperWidth: ReceiptPaperWidth;
    isPrintMode?: boolean;
}

function ThermalReceiptPaper({
    order,
    cafeSettings,
    staffName = 'Kasir',
    paperWidth,
    isPrintMode = false,
}: ThermalReceiptPaperProps) {
    const summary = useMemo(
        () => getOrderPaymentSummary<ReceiptOrderItem>(order),
        [order],
    );
    const batches = useMemo(
        () =>
            groupOrderItemsByBatch<ReceiptOrderItem>(
                order.items,
                order.payment_status,
                false,
            ),
        [order.items, order.payment_status],
    );

    const totalQty = useMemo(
        () =>
            summary.activeItems.reduce(
                (acc, item) => acc + Math.max(1, Number(item.quantity) || 1),
                0,
            ),
        [summary.activeItems],
    );

    const isNarrow = paperWidth === '58';
    const cafeName = cafeSettings?.cafe_name?.trim() || 'CAFÉ SIDE LINE';
    const cafeAddress = cafeSettings?.address?.trim() || null;
    const cafePhone = cafeSettings?.phone?.trim() || null;
    const receiptFooter =
        cafeSettings?.receipt_footer?.trim() ||
        'Terima kasih atas kunjungan Anda!';
    const tableNum = order.table?.table_number ?? '00';
    const methodLabel = resolvePaymentMethodLabel(order);

    const paymentBadgeLabel = summary.isFullyPaid
        ? 'LUNAS'
        : summary.hasPartialFollowup
          ? 'SEBAGIAN'
          : order.payment_status === 'failed'
            ? 'GAGAL'
            : order.payment_status === 'refunded'
              ? 'REFUND'
              : 'BELUM BAYAR';

    return (
        <div
            className={cn(
                'relative bg-white text-[#18181B]',
                isPrintMode
                    ? 'printable-receipt-paper'
                    : cn(
                          'w-full rounded-xl border border-[#DFCFA9] shadow-[0_12px_30px_-10px_rgba(24,24,27,0.16)]',
                          isNarrow
                              ? 'max-w-[264px] p-3'
                              : 'max-w-[336px] p-3.5 sm:p-4',
                      ),
            )}
        >
            {/* Header Brand Outlet */}
            <div className="flex flex-col items-center border-b-2 border-dashed border-[#D4C7AD] pb-2 text-center">
                <div
                    className={cn(
                        'mb-1.5 flex items-center justify-center rounded-xl font-black tracking-tight',
                        isNarrow ? 'size-7 text-[11px]' : 'size-8 text-xs',
                        isPrintMode
                            ? 'border-2 border-black bg-white text-black'
                            : 'bg-[#C52828] text-white shadow-xs',
                    )}
                >
                    SL
                </div>
                <h3
                    className={cn(
                        'font-black tracking-[0.08em] text-[#18181B] uppercase',
                        isNarrow ? 'text-[11px]' : 'text-[13px]',
                    )}
                >
                    {cafeName}
                </h3>
                <p className="text-[9.5px] font-semibold tracking-wider text-[#78716C] uppercase">
                    Coffee &amp; Eatery • Struk Resmi
                </p>
                {cafeAddress && (
                    <p className="mt-0.5 max-w-[92%] text-[9.5px] leading-snug text-[#57534E]">
                        {cafeAddress}
                    </p>
                )}
                {cafePhone && (
                    <p className="text-[9.5px] font-medium text-[#57534E]">
                        Telp: {cafePhone}
                    </p>
                )}
            </div>

            {/* Identitas Nomor Order & Meja */}
            <div
                className={cn(
                    'mt-2 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5',
                    isPrintMode
                        ? 'border-black bg-white'
                        : 'border-[#E8DFC8] bg-[#FAF6EC]',
                )}
            >
                <div className="min-w-0">
                    <span className="block text-[8.5px] font-bold tracking-wider text-[#78716C] uppercase">
                        No. Pesanan
                    </span>
                    <span
                        className={cn(
                            'font-mono font-black tracking-tight text-[#18181B]',
                            isNarrow ? 'text-[10.5px]' : 'text-[11.5px]',
                        )}
                    >
                        #{order.order_number}
                    </span>
                </div>
                <span
                    className={cn(
                        'shrink-0 rounded-md px-2 py-0.5 font-mono text-[9.5px] font-extrabold tracking-wide uppercase',
                        isPrintMode
                            ? 'border border-black text-black'
                            : 'bg-[#18181B] text-white',
                    )}
                >
                    MEJA {tableNum}
                </span>
            </div>

            {/* Metadata Transaksi */}
            <div className="mt-2 space-y-0.5 border-b border-dashed border-[#D4C7AD] pb-2 text-[10px]">
                <div className="flex items-start justify-between gap-2">
                    <span className="shrink-0 text-[#78716C]">Waktu</span>
                    <span className="text-right font-semibold text-[#18181B] tabular-nums">
                        {formatReceiptDateTimeWib(order.created_at)}
                    </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                    <span className="shrink-0 text-[#78716C]">Pelanggan</span>
                    <span className="text-right font-bold text-[#18181B]">
                        {order.customer_name}
                    </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                    <span className="shrink-0 text-[#78716C]">Kasir</span>
                    <span className="text-right font-semibold text-[#18181B]">
                        {staffName}
                    </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                    <span className="shrink-0 text-[#78716C]">Status</span>
                    <span className="text-right font-semibold text-[#18181B]">
                        {resolveOrderStatusLabel(order.order_status)}
                    </span>
                </div>
            </div>

            {/* Daftar Item & Varian */}
            <div className="mt-2 space-y-2 border-b border-dashed border-[#D4C7AD] pb-2">
                <div className="flex items-center justify-between text-[9px] font-extrabold tracking-wider text-[#78716C] uppercase">
                    <span>Item Pesanan</span>
                    <span>Subtotal</span>
                </div>

                {batches.map((group) => (
                    <div key={group.batchNumber} className="space-y-1">
                        {(batches.length > 1 || group.isFollowup) && (
                            <div
                                className={cn(
                                    'flex items-center justify-between border-b border-dotted pb-0.5 text-[9px] font-extrabold uppercase',
                                    isPrintMode
                                        ? 'border-black text-black'
                                        : 'border-[#D4C7AD] text-[#5B4126]',
                                )}
                            >
                                <span>{group.label}</span>
                                <span
                                    className={cn(
                                        isPrintMode
                                            ? 'text-black'
                                            : group.isBatchPaid
                                              ? 'text-emerald-700'
                                              : 'text-[#C52828]',
                                    )}
                                >
                                    {group.isBatchPaid
                                        ? 'LUNAS'
                                        : 'BELUM BAYAR'}
                                </span>
                            </div>
                        )}

                        {group.activeItems.map((item) => {
                            const qty = Math.max(1, Number(item.quantity) || 1);
                            const opts = item.options ?? [];

                            return (
                                <div key={item.id} className="space-y-0.5">
                                    <div className="flex items-baseline justify-between gap-2 text-[10.5px]">
                                        <span className="min-w-0 font-bold text-[#18181B]">
                                            {qty}x {item.menu_name}
                                        </span>
                                        <span className="shrink-0 font-mono font-bold text-[#18181B] tabular-nums">
                                            {formatRupiah(item.total_price)}
                                        </span>
                                    </div>
                                    {qty > 1 &&
                                        item.unit_price !== undefined && (
                                            <div className="pl-3 font-mono text-[9px] text-[#78716C] tabular-nums">
                                                @{' '}
                                                {formatRupiah(item.unit_price)}
                                            </div>
                                        )}
                                    {opts.length > 0 && (
                                        <div className="pl-3 text-[9.5px] leading-snug text-[#57534E]">
                                            {opts
                                                .map((opt) => {
                                                    const extra =
                                                        parseFloat(
                                                            String(
                                                                opt.additional_price ??
                                                                    0,
                                                            ),
                                                        ) || 0;
                                                    return extra > 0
                                                        ? `${opt.option_name} (+${formatRupiah(extra)})`
                                                        : opt.option_name;
                                                })
                                                .join(', ')}
                                        </div>
                                    )}
                                    {item.customer_notes && (
                                        <div className="pl-3 text-[9.5px] text-[#57534E] italic">
                                            Catatan: &ldquo;
                                            {item.customer_notes}&rdquo;
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}

                {order.notes && (
                    <div
                        className={cn(
                            'rounded-md border px-2 py-1 text-[9.5px]',
                            isPrintMode
                                ? 'border-black bg-white text-black'
                                : 'border-[#E8DFC8] bg-[#FAF8F4] text-[#57534E]',
                        )}
                    >
                        <span className="font-bold">Catatan Order:</span>{' '}
                        {order.notes}
                    </div>
                )}
            </div>

            {/* Ringkasan Biaya & Total */}
            <div className="mt-2 space-y-1 text-[10.5px]">
                <div className="flex items-center justify-between text-[#57534E]">
                    <span>Total Item</span>
                    <span className="font-mono font-semibold tabular-nums">
                        {totalQty} porsi
                    </span>
                </div>
                <div className="flex items-center justify-between text-[#57534E]">
                    <span>Subtotal</span>
                    <span className="font-mono font-semibold tabular-nums">
                        {formatRupiah(order.subtotal)}
                    </span>
                </div>

                {summary.hasPartialFollowup && (
                    <>
                        <div
                            className={cn(
                                'flex items-center justify-between font-semibold',
                                isPrintMode ? 'text-black' : 'text-emerald-700',
                            )}
                        >
                            <span>Sudah Dibayar</span>
                            <span className="font-mono tabular-nums">
                                {formatRupiah(summary.settledAmount)}
                            </span>
                        </div>
                        <div
                            className={cn(
                                'flex items-center justify-between font-bold',
                                isPrintMode ? 'text-black' : 'text-[#C52828]',
                            )}
                        >
                            <span>Tagihan Susulan</span>
                            <span className="font-mono tabular-nums">
                                {formatRupiah(summary.unpaidBalance)}
                            </span>
                        </div>
                    </>
                )}

                <div
                    className={cn(
                        'mt-1.5 flex items-center justify-between border-y-2 py-1.5 font-black',
                        isPrintMode
                            ? 'border-black text-black'
                            : 'border-[#18181B] text-[#18181B]',
                    )}
                >
                    <span className="text-[11px] tracking-wide uppercase">
                        Total Bayar
                    </span>
                    <span
                        className={cn(
                            'font-mono text-sm tabular-nums',
                            isPrintMode ? 'text-black' : 'text-[#C52828]',
                        )}
                    >
                        {formatRupiah(order.total_amount)}
                    </span>
                </div>

                {/* Metode & Status Bayar */}
                <div
                    className={cn(
                        'mt-1.5 flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-[10px]',
                        isPrintMode
                            ? 'border-black bg-white'
                            : 'border-[#E8DFC8] bg-[#FAF6EC]',
                    )}
                >
                    <span className="font-semibold text-[#57534E]">
                        Metode:{' '}
                        <strong className="font-extrabold text-[#18181B]">
                            {methodLabel}
                        </strong>
                    </span>
                    <span
                        className={cn(
                            'rounded px-1.5 py-0.5 text-[9px] font-black tracking-wide uppercase',
                            isPrintMode
                                ? 'border border-black text-black'
                                : summary.isFullyPaid
                                  ? 'bg-[#DCFCE7] text-[#15803D]'
                                  : summary.hasPartialFollowup
                                    ? 'bg-[#FEF3C7] text-[#B45309]'
                                    : 'bg-[#FEE2E2] text-[#B91C1C]',
                        )}
                    >
                        {paymentBadgeLabel}
                    </span>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-2 border-t border-dashed border-[#D4C7AD] pt-2 text-center">
                <p className="text-[10px] leading-snug font-bold text-[#18181B]">
                    {receiptFooter}
                </p>
                <p className="mt-0.5 text-[9px] text-[#78716C]">
                    Simpan struk ini sebagai bukti pesanan yang sah.
                </p>
                <p className="mt-1 font-mono text-[8.5px] tracking-[0.2em] text-[#A8A29E] uppercase">
                    SIDEORDER POS
                </p>
            </div>
        </div>
    );
}

export default function ReceiptModal({
    open,
    onOpenChange,
    order,
    cafeSettings,
    staffName = 'Kasir',
}: ReceiptModalProps) {
    const [paperWidth, setPaperWidth] = useState<ReceiptPaperWidth>(() => {
        if (typeof window === 'undefined') return '80';
        const saved = localStorage.getItem(PAPER_STORAGE_KEY);
        return saved === '58' ? '58' : '80';
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(PAPER_STORAGE_KEY, paperWidth);
        }
    }, [paperWidth]);

    const summary = useMemo(
        () => (order ? getOrderPaymentSummary<ReceiptOrderItem>(order) : null),
        [order],
    );

    const totalQty = useMemo(() => {
        if (!summary) return 0;
        return summary.activeItems.reduce(
            (acc, item) => acc + Math.max(1, Number(item.quantity) || 1),
            0,
        );
    }, [summary]);

    const cafeName = cafeSettings?.cafe_name?.trim() || 'CAFÉ SIDE LINE';
    const paymentMethodLabel = order ? resolvePaymentMethodLabel(order) : '';

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="no-print flex max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-4xl">
                    {order && (
                        <>
                            {/* Sticky Header Bar */}
                            <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-3.5 pb-3">
                                <FormDialogHeader
                                    icon={Printer}
                                    badge="Struk Pembayaran"
                                    tag={`MEJA ${order.table?.table_number ?? '00'}`}
                                    statusLabel={
                                        summary?.isFullyPaid
                                            ? 'Lunas'
                                            : summary?.hasPartialFollowup
                                              ? 'Sebagian'
                                              : 'Belum Bayar'
                                    }
                                    statusActive={Boolean(summary?.isFullyPaid)}
                                    title={`Nota #${order.order_number}`}
                                    description="Pratinjau struk resmi siap cetak ke printer thermal 58mm / 80mm atau Simpan ke PDF."
                                />
                            </div>

                            {/* Body 2 Kolom Landscape (Gaya Card Modal QRIS / Standee QR) */}
                            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-[#FAF8F4] p-4 sm:p-5 md:flex-row md:items-stretch md:gap-5 md:overflow-hidden">
                                {/* KOLOM KIRI: Merchant Banner ala QRIS, Ringkasan & Pengaturan Kertas */}
                                <div className="flex shrink-0 flex-col justify-between gap-3 md:w-[320px] lg:w-[340px]">
                                    <div className="space-y-3">
                                        {/* Dark Merchant Banner ala QRIS */}
                                        <div className="flex items-center justify-between gap-3 rounded-xl bg-[#1A1A1A] p-3.5 text-white shadow-sm">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black tracking-tight text-white">
                                                    POS
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-bold tracking-wide text-white uppercase">
                                                        {cafeName}
                                                    </p>
                                                    <p className="truncate font-mono text-[10px] text-white/65">
                                                        #{order.order_number} •
                                                        Meja{' '}
                                                        {order.table
                                                            ?.table_number ??
                                                            '00'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-[10px] font-medium text-white/60">
                                                    Total
                                                </p>
                                                <p className="font-mono text-sm font-black text-white tabular-nums">
                                                    {formatRupiah(
                                                        order.total_amount,
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Detail Transaksi Grid 2x2 */}
                                        <div className="space-y-2 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-3.5 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                            <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                                <span className="flex items-center gap-1.5">
                                                    <Sparkles className="size-3.5 text-[#C52828]" />
                                                    Ringkasan Nota
                                                </span>
                                                <span className="font-mono text-[10px] font-semibold text-[#6E6A64]">
                                                    {totalQty} porsi
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                <div className="rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-2.5">
                                                    <span className="block text-[10px] text-[#6E6A64]">
                                                        Pelanggan
                                                    </span>
                                                    <strong className="mt-0.5 block truncate font-bold text-[#1A1A1A]">
                                                        {order.customer_name}
                                                    </strong>
                                                </div>
                                                <div className="rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-2.5">
                                                    <span className="block text-[10px] text-[#6E6A64]">
                                                        Kasir Shift
                                                    </span>
                                                    <strong className="mt-0.5 block truncate font-bold text-[#1A1A1A]">
                                                        {staffName}
                                                    </strong>
                                                </div>
                                                <div className="rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-2.5">
                                                    <span className="block text-[10px] text-[#6E6A64]">
                                                        Pembayaran
                                                    </span>
                                                    <strong className="mt-0.5 block truncate font-bold text-[#1A1A1A]">
                                                        {paymentMethodLabel}
                                                    </strong>
                                                </div>
                                                <div className="rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-2.5">
                                                    <span className="block text-[10px] text-[#6E6A64]">
                                                        Waktu Order
                                                    </span>
                                                    <strong className="mt-0.5 block truncate font-bold text-[#1A1A1A] tabular-nums">
                                                        {formatReceiptDateTimeWib(
                                                            order.created_at,
                                                        )}
                                                    </strong>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Pilihan Lebar Kertas Thermal */}
                                        <div className="space-y-2 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-3.5 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                            <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                                <span>
                                                    Ukuran Kertas Thermal
                                                </span>
                                                <span className="font-mono text-[10px] text-[#6E6A64]">
                                                    {paperWidth}mm
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#E6DFD3] bg-[#FAF8F4] p-1">
                                                {(
                                                    [
                                                        {
                                                            id: '80',
                                                            title: '80mm Standar',
                                                            sub: 'POS Kasir',
                                                        },
                                                        {
                                                            id: '58',
                                                            title: '58mm Mini',
                                                            sub: 'Portable',
                                                        },
                                                    ] as const
                                                ).map((opt) => (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() =>
                                                            setPaperWidth(
                                                                opt.id,
                                                            )
                                                        }
                                                        className={cn(
                                                            'cursor-pointer rounded-lg px-2.5 py-1.5 text-left transition',
                                                            paperWidth ===
                                                                opt.id
                                                                ? 'bg-[#C52828] text-white shadow-xs'
                                                                : 'text-[#5B4126] hover:bg-white',
                                                        )}
                                                    >
                                                        <span className="block text-[11px] font-bold">
                                                            {opt.title}
                                                        </span>
                                                        <span
                                                            className={cn(
                                                                'block text-[9.5px]',
                                                                paperWidth ===
                                                                    opt.id
                                                                    ? 'text-white/80'
                                                                    : 'text-[#78716C]',
                                                            )}
                                                        >
                                                            {opt.sub}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-[10.5px] leading-snug text-[#6E6A64]">
                                                Pratinjau di samping sesuai
                                                skala cetak. Gunakan{' '}
                                                <strong className="text-[#1A1A1A]">
                                                    Simpan PDF
                                                </strong>{' '}
                                                atau printer thermal.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* KOLOM KANAN: Tray Pratinjau Struk Fisik */}
                                <div className="flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-y-auto rounded-xl border border-[#E8E2D9] bg-[#EFEAE0]/75 p-4 md:max-h-[68dvh]">
                                    <ThermalReceiptPaper
                                        order={order}
                                        cafeSettings={cafeSettings}
                                        staffName={staffName}
                                        paperWidth={paperWidth}
                                    />
                                </div>
                            </div>

                            {/* Sticky Footer */}
                            <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4] px-5 py-3">
                                <span className="hidden text-[11px] font-semibold text-[#78716C] sm:inline">
                                    Format kertas mendukung thermal {paperWidth}
                                    mm &amp; Simpan ke PDF (Portrait)
                                </span>
                                <div className="ml-auto flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => onOpenChange(false)}
                                        className="h-10 cursor-pointer rounded-xl border-[#E6DFD3] bg-white px-4 text-xs font-bold text-[#18181B] hover:bg-[#FAF5E8]"
                                    >
                                        Tutup
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => window.print()}
                                        className="h-10 cursor-pointer gap-1.5 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#A81E1E]"
                                    >
                                        <Printer className="size-3.5" />
                                        <span>Cetak Struk Sekarang</span>
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Sheet Cetak Terisolasi di luar Dialog Overlay/Transform */}
            {open &&
                order &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div
                        className="printable-receipt-sheet hidden print:block"
                        data-paper={paperWidth}
                    >
                        <ThermalReceiptPaper
                            order={order}
                            cafeSettings={cafeSettings}
                            staffName={staffName}
                            paperWidth={paperWidth}
                            isPrintMode
                        />
                    </div>,
                    document.body,
                )}
        </>
    );
}
