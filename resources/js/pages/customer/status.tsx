import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowsClockwise,
    Check,
    CheckCircle,
    Clock,
    Coffee,
    Confetti,
    Copy,
    ForkKnife,
    Money,
    PencilSimpleLine,
    PlusCircle,
    Prohibit,
    QrCode,
    Receipt,
    WarningCircle,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { QrisPaymentView } from '@/components/payment/QrisPaymentModal';
import { cn } from '@/lib/utils';

interface OrderOption {
    id: number;
    group_name: string;
    option_name: string;
    additional_price: string;
}

interface OrderItem {
    id: number;
    menu_name: string;
    base_price: string;
    quantity: number;
    unit_price: string;
    total_price: string;
    customer_notes: string | null;
    status?: 'active' | 'rejected';
    rejection_reason?: string | null;
    options: OrderOption[];
}

interface StatusHistory {
    id: number;
    status: string;
    notes: string | null;
    created_at: string;
}

interface LatestPaymentSummary {
    payment_reference: string;
    gateway: string;
    gateway_label?: string | null;
    channel?: string | null;
    status: string;
    checkout_url?: string | null;
    qr_string?: string | null;
    expired_at?: string | null;
}

interface Order {
    id: number;
    order_number: string;
    customer_name: string;
    subtotal: string;
    total_amount: string;
    order_status:
        | 'pending'
        | 'processing'
        | 'ready'
        | 'completed'
        | 'cancelled';
    payment_status: 'unpaid' | 'paid' | 'failed' | 'refunded';
    payment_method: string | null;
    payment_gateway?: string | null;
    payment_channel?: string | null;
    payment_reference?: string | null;
    settled_amount?: number;
    unpaid_balance?: number;
    notes: string | null;
    created_at: string;
    table: {
        id: number;
        table_number: string;
        name: string | null;
        qr_token: string;
    };
    items: OrderItem[];
    status_histories?: StatusHistory[];
    latest_payment?: LatestPaymentSummary | null;
}

interface Props {
    order: Order;
    initialView?: string | null;
    canSimulate?: boolean;
    paymentGateway?: {
        driver?: string;
        label?: string;
        is_configured?: boolean;
        mode?: string;
    };
}

export default function OrderStatusPage({
    order,
    initialView,
    canSimulate = false,
    paymentGateway,
}: Props) {
    const [isQrisPageOpen, setIsQrisPageOpen] = useState(() => {
        if (initialView === 'status') {
            return false;
        }
        if (initialView === 'qris') {
            return order.payment_status !== 'paid';
        }
        return (
            order.payment_status === 'unpaid' && order.payment_method === 'qris'
        );
    });

    // Jika pembayaran sudah lunas dari hasil polling/webhook, otomatis tampilkan halaman status pesanan
    useEffect(() => {
        if (order.payment_status === 'paid' && isQrisPageOpen) {
            setIsQrisPageOpen(false);
        }
    }, [order.payment_status, isQrisPageOpen]);

    // Auto-polling pembaruan status setiap 4 detik selama pesanan belum selesai/batal
    useEffect(() => {
        if (
            order.order_status === 'completed' ||
            order.order_status === 'cancelled'
        ) {
            return;
        }

        const interval = setInterval(() => {
            router.reload({ only: ['order'] });
        }, 4000);

        return () => clearInterval(interval);
    }, [order.order_status]);

    const openQrisPage = () => {
        setIsQrisPageOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const closeQrisPage = () => {
        setIsQrisPageOpen(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const formatRupiah = (amount: number | string) => {
        const numeric =
            typeof amount === 'string' ? parseFloat(amount) : amount;
        const formatted = new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(Number.isFinite(numeric) ? numeric : 0);

        return `Rp ${formatted}`;
    };

    const copyOrderNumber = () => {
        navigator.clipboard.writeText(order.order_number);
        toast.success('Nomor pesanan disalin ke clipboard!');
    };

    const handleSimulateQrisSuccess = () => {
        router.reload({ only: ['order'] });
    };

    const handleSwitchToCash = () => {
        router.post(
            `/order/switch-payment-method/${order.order_number}`,
            { payment_method: 'cash' },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setIsQrisPageOpen(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    toast.success(
                        'Metode pembayaran dialihkan ke Tunai di Kasir.',
                    );
                },
            },
        );
    };

    const handleSwitchToQris = () => {
        router.post(
            `/order/switch-payment-method/${order.order_number}`,
            { payment_method: 'qris' },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setIsQrisPageOpen(true);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    toast.success('Metode pembayaran dialihkan ke QRIS.');
                },
            },
        );
    };

    const settledAmount = Number(
        order.settled_amount ??
            (order.payment_status === 'paid' ? order.total_amount : 0),
    );
    const unpaidBalance = Number(
        order.unpaid_balance ??
            (order.payment_status === 'paid' ? 0 : order.total_amount),
    );
    const hasPartialPayment = settledAmount > 0 && unpaidBalance > 0;

    // Konfigurasi visual tahapan progres pesanan
    const getStatusConfig = () => {
        switch (order.order_status) {
            case 'pending':
                return {
                    title:
                        order.payment_status === 'paid'
                            ? 'Menunggu Barista'
                            : hasPartialPayment
                              ? 'Menunggu Pembayaran Tambahan'
                              : order.payment_method === 'qris'
                                ? 'Menunggu Pembayaran QRIS'
                                : 'Menunggu Pembayaran di Kasir',
                    description:
                        order.payment_status === 'paid'
                            ? 'Pembayaran sudah diterima. Pesanan Anda segera diracik oleh barista.'
                            : hasPartialPayment
                              ? 'Menu tambahan berhasil masuk ke pesanan. Silakan selesaikan pembayaran tambahan.'
                              : order.payment_method === 'qris'
                                ? 'Buka halaman pembayaran QRIS di bawah ini untuk menyelesaikan pembayaran agar pesanan segera diracik barista.'
                                : 'Pesanan Anda sudah masuk. Silakan bayar tunai di kasir untuk mulai diracik.',
                    badgeStyle:
                        'bg-[#FFF3E0] text-[#9A5B13] border border-[#F3D9B1]',
                    iconCircleStyle:
                        'bg-[#F3EFE6] text-[#4A2C18] border border-[#E6DFD3]',
                    icon: Clock,
                    step: 1,
                };
            case 'processing':
                return {
                    title: 'Sedang Diracik Barista',
                    description: hasPartialPayment
                        ? 'Pesanan sedang diracik barista. Silakan selesaikan pembayaran menu tambahan di kasir.'
                        : 'Makanan dan minuman Anda sedang disiapkan dengan cermat oleh barista kami.',
                    badgeStyle:
                        'bg-[#FDECEB] text-[#C52828] border border-[#F5C6C4]',
                    iconCircleStyle:
                        'bg-[#FDECEB] text-[#C52828] border border-[#F5C6C4]',
                    icon: Coffee,
                    step: 2,
                };
            case 'ready':
                return {
                    title: 'Pesanan Siap Disajikan!',
                    description:
                        'Pesanan Anda sudah siap di meja bar atau sedang diantar pelayan ke meja Anda.',
                    badgeStyle:
                        'bg-emerald-50 text-emerald-800 border border-emerald-200',
                    iconCircleStyle:
                        'bg-emerald-50 text-emerald-700 border border-emerald-200',
                    icon: ForkKnife,
                    step: 3,
                };
            case 'completed':
                return {
                    title: 'Pesanan Selesai',
                    description:
                        'Terima kasih telah berkunjung dan menikmati sajian Café SIDE LINE.',
                    badgeStyle:
                        'bg-[#1A1A1A] text-white border border-[#1A1A1A]',
                    iconCircleStyle:
                        'bg-[#F3EFE6] text-[#1A1A1A] border border-[#E6DFD3]',
                    icon: Confetti,
                    step: 4,
                };
            case 'cancelled':
                return {
                    title: 'Pesanan Dibatalkan',
                    description:
                        'Pesanan ini dibatalkan atau ditolak. Silakan hubungi kasir atau barista.',
                    badgeStyle:
                        'bg-[#FDECEB] text-[#C52828] border border-[#F5C6C4]',
                    iconCircleStyle:
                        'bg-[#FDECEB] text-[#C52828] border border-[#F5C6C4]',
                    icon: WarningCircle,
                    step: 0,
                };
        }
    };

    const statusConfig = getStatusConfig();
    const StatusIcon = statusConfig.icon;

    const progressSteps = [
        { step: 1, label: 'Diterima' },
        { step: 2, label: 'Diracik' },
        { step: 3, label: 'Siap Saji' },
        { step: 4, label: 'Selesai' },
    ];

    return (
        <>
            <Head
                title={
                    isQrisPageOpen
                        ? `Pembayaran QRIS #${order.order_number} • SIDE LINE`
                        : `Status Pesanan #${order.order_number} • SIDE LINE`
                }
            />

            {/* WRAPPER DESKTOP FRAME */}
            <div className="flex min-h-screen items-start justify-center bg-[#141413] font-sans selection:bg-[#C52828] selection:text-white md:py-6">
                <div className="relative flex min-h-screen w-full max-w-md flex-col overflow-x-hidden bg-[#FAF8F4] pb-10 shadow-2xl sm:max-w-lg md:min-h-[92vh] md:rounded-2xl md:border-[8px] md:border-[#242321]">
                    {isQrisPageOpen ? (
                        /* ========================================================================= */
                        /* HALAMAN PEMBAYARAN QRIS PENUH (BUKAN MODAL POPUP)                         */
                        /* ========================================================================= */
                        <QrisPaymentView
                            orderNumber={order.order_number}
                            tableNumber={order.table.table_number}
                            tableName={order.table.name}
                            customerName={order.customer_name}
                            totalAmount={
                                unpaidBalance > 0
                                    ? unpaidBalance
                                    : Number(order.total_amount)
                            }
                            onBackToStatus={closeQrisPage}
                            onSimulateSuccess={handleSimulateQrisSuccess}
                            onSwitchToCash={handleSwitchToCash}
                            showSimulator={canSimulate}
                            paymentGateway={
                                order.payment_gateway ??
                                order.latest_payment?.gateway ??
                                paymentGateway?.driver ??
                                'xendit'
                            }
                            paymentGatewayLabel={
                                order.latest_payment?.gateway_label ??
                                paymentGateway?.label ??
                                'Xendit Payment Gateway'
                            }
                            paymentChannel={
                                order.payment_channel ??
                                order.latest_payment?.channel ??
                                'QRIS'
                            }
                            paymentReference={
                                order.latest_payment?.payment_reference ??
                                order.payment_reference ??
                                null
                            }
                            checkoutUrl={
                                order.latest_payment?.checkout_url ?? null
                            }
                            qrString={order.latest_payment?.qr_string ?? null}
                        />
                    ) : (
                        /* ========================================================================= */
                        /* HALAMAN MENUNGGU PESANAN / STATUS & NOTA PEMESANAN                        */
                        /* ========================================================================= */
                        <>
                            {/* Top Sticky Header */}
                            <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#EBE5DC] bg-[#FAF8F4]/95 px-4 py-3 backdrop-blur-xs">
                                <Link
                                    href={
                                        order.order_status === 'pending' ||
                                        order.order_status === 'processing'
                                            ? `/order?table=${order.table.qr_token}&order=${order.order_number}`
                                            : `/order?table=${order.table.qr_token}`
                                    }
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#E6DFD3] bg-[#F3EFE6] px-3 py-1.5 text-[11px] leading-none font-semibold whitespace-nowrap text-[#1A1A1A] transition hover:bg-[#EAE3D5]"
                                >
                                    <ArrowLeft
                                        weight="bold"
                                        className="size-3.5"
                                    />
                                    <span>Kembali ke Menu</span>
                                </Link>

                                <div className="flex items-center gap-2">
                                    <span className="rounded-[4px] bg-[#1A1A1A] px-2.5 py-1.5 text-[10px] leading-none font-bold whitespace-nowrap text-white">
                                        MEJA {order.table.table_number}
                                    </span>
                                </div>
                            </header>

                            <main className="flex-1 space-y-4 p-4 sm:p-5">
                                {/* KARTU 1: Status Utama & Stepper Progres */}
                                <div className="space-y-4 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-5 text-center shadow-[0_2px_12px_rgba(26,26,26,0.03)] sm:p-6">
                                    <div
                                        className={cn(
                                            'mx-auto flex size-16 items-center justify-center rounded-full',
                                            statusConfig.iconCircleStyle,
                                        )}
                                    >
                                        <StatusIcon
                                            weight="duotone"
                                            className="size-8"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <span
                                            className={cn(
                                                'inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1 text-xs font-bold',
                                                statusConfig.badgeStyle,
                                            )}
                                        >
                                            <span>{statusConfig.title}</span>
                                        </span>
                                        <p className="mx-auto max-w-xs pt-0.5 text-[13px] leading-relaxed text-[#6E6A64]">
                                            {statusConfig.description}
                                        </p>
                                    </div>

                                    {/* Stepper Progres */}
                                    {order.order_status !== 'cancelled' && (
                                        <div className="space-y-2.5 pt-2">
                                            <div className="grid grid-cols-4 gap-1.5">
                                                {progressSteps.map((item) => {
                                                    const isReached =
                                                        statusConfig.step >=
                                                        item.step;
                                                    const isCurrent =
                                                        statusConfig.step ===
                                                        item.step;

                                                    return (
                                                        <div
                                                            key={item.step}
                                                            className="flex flex-col items-center gap-1.5"
                                                        >
                                                            <div
                                                                className={cn(
                                                                    'flex size-6 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                                                                    isReached
                                                                        ? 'bg-[#C52828] text-white shadow-[0_2px_8px_rgba(197,40,40,0.28)]'
                                                                        : 'border border-[#E6DFD3] bg-[#F3EFE6] text-[#8C857B]',
                                                                    isCurrent &&
                                                                        'ring-3 ring-[#C52828]/20',
                                                                )}
                                                            >
                                                                {isReached ? (
                                                                    <Check
                                                                        weight="bold"
                                                                        className="size-3"
                                                                    />
                                                                ) : (
                                                                    item.step
                                                                )}
                                                            </div>
                                                            <span
                                                                className={cn(
                                                                    'text-[11px] font-semibold',
                                                                    isReached
                                                                        ? 'font-bold text-[#1A1A1A]'
                                                                        : 'text-[#8C857B]',
                                                                )}
                                                            >
                                                                {item.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <div className="h-1.5 overflow-hidden rounded-full bg-[#F3EFE6]">
                                                <div
                                                    className="h-full rounded-full bg-[#C52828] transition-all duration-500"
                                                    style={{
                                                        width: `${(statusConfig.step / 4) * 100}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Auto-update notice */}
                                    {order.order_status !== 'completed' &&
                                        order.order_status !== 'cancelled' && (
                                            <div className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#F3EFE6] px-3 py-1 text-[11px] font-medium text-[#6E6A64]">
                                                <ArrowsClockwise
                                                    weight="bold"
                                                    className="size-3.5 animate-spin text-[#C52828]"
                                                />
                                                <span>
                                                    Status diperbarui otomatis
                                                    secara real-time
                                                </span>
                                            </div>
                                        )}
                                </div>

                                {/* KARTU 2: Status Pembayaran (Lunas vs Gagal vs QRIS vs Tunai Kasir) */}
                                {order.payment_status === 'paid' ? (
                                    /* 2A: Tampilan Lunas Berhasil */
                                    <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200/90 bg-[#FFFDFB] p-4 shadow-[0_2px_10px_rgba(16,185,129,0.05)]">
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                                                <CheckCircle
                                                    weight="fill"
                                                    className="size-5.5"
                                                />
                                            </div>
                                            <div>
                                                <div className="text-[13px] font-bold text-[#1A1A1A]">
                                                    {order.payment_method ===
                                                    'qris'
                                                        ? 'Pembayaran QRIS Berhasil'
                                                        : 'Pembayaran Tunai Diterima'}
                                                </div>
                                                <div className="text-[11px] text-[#6E6A64]">
                                                    {order.payment_method ===
                                                    'qris'
                                                        ? `Terverifikasi via ${order.latest_payment?.gateway_label ?? paymentGateway?.label ?? 'Xendit Payment Gateway'}`
                                                        : 'Dikonfirmasi lunas oleh kasir'}
                                                </div>
                                                {(order.latest_payment
                                                    ?.payment_reference ||
                                                    order.payment_reference) && (
                                                    <div className="mt-0.5 font-mono text-[10px] text-[#6E6A64]">
                                                        Ref:{' '}
                                                        {order.latest_payment
                                                            ?.payment_reference ??
                                                            order.payment_reference}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <span className="inline-block rounded-[4px] border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                                LUNAS
                                            </span>
                                            <div className="mt-0.5 text-xs font-bold text-[#1A1A1A] tabular-nums">
                                                {formatRupiah(
                                                    order.total_amount,
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : order.payment_status === 'failed' ? (
                                    /* 2B: Tampilan Pembayaran Gagal / Kedaluwarsa */
                                    <div className="space-y-3 rounded-xl border-[1.5px] border-[#C52828] bg-[#FFFDFB] p-5 shadow-[0_2px_12px_rgba(197,40,40,0.06)]">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#FDECEB] text-[#C52828]">
                                                    <WarningCircle
                                                        weight="fill"
                                                        className="size-5"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="text-[14px] font-bold text-[#1A1A1A]">
                                                        Pembayaran QRIS
                                                        Kedaluwarsa
                                                    </div>
                                                    <div className="text-[11px] text-[#6E6A64]">
                                                        Silakan ulangi scan QRIS
                                                        atau bayar di kasir
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="shrink-0 rounded-[4px] bg-[#FDECEB] px-2.5 py-0.5 text-[10px] font-bold text-[#C52828]">
                                                Belum Lunas
                                            </span>
                                        </div>

                                        <p className="text-xs leading-relaxed text-[#6E6A64]">
                                            Transaksi belum terverifikasi atau
                                            melewati batas waktu pembayaran.
                                            Anda dapat membuka kembali halaman
                                            kode QRIS atau beralih ke pembayaran
                                            tunai.
                                        </p>

                                        <div className="grid grid-cols-1 gap-2 border-t border-[#EBE5DC] pt-2 sm:grid-cols-2">
                                            <button
                                                type="button"
                                                onClick={openQrisPage}
                                                className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#C52828] px-4 text-xs font-bold text-white shadow-xs transition hover:bg-[#B02222]"
                                            >
                                                <QrCode
                                                    weight="bold"
                                                    className="size-4"
                                                />
                                                <span>Buka Halaman QRIS</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSwitchToCash}
                                                className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#E6DFD3] bg-[#F3EFE6] px-4 text-xs font-semibold text-[#1A1A1A] transition hover:bg-[#EAE3D5]"
                                            >
                                                <Money
                                                    weight="bold"
                                                    className="size-4 text-[#4A2C18]"
                                                />
                                                <span>
                                                    Bayar Tunai di Kasir
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                ) : order.payment_method === 'qris' ? (
                                    /* 2C: Tampilan Tagihan QRIS Online */
                                    <div className="space-y-4 rounded-xl border-[1.5px] border-[#C52828] bg-[#FFFDFB] p-5 shadow-[0_4px_16px_rgba(197,40,40,0.06)]">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#C52828] text-white shadow-xs">
                                                    <QrCode
                                                        weight="bold"
                                                        className="size-5"
                                                    />
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="block text-[14px] leading-snug font-bold text-[#1A1A1A]">
                                                        {hasPartialPayment
                                                            ? 'Tagihan Tambahan via QRIS'
                                                            : 'Menunggu Pembayaran QRIS'}
                                                    </span>
                                                    <span className="block truncate text-[11px] text-[#6E6A64]">
                                                        Scan via{' '}
                                                        {order.latest_payment
                                                            ?.gateway_label ??
                                                            paymentGateway?.label ??
                                                            'Xendit Payment Gateway'}
                                                    </span>
                                                    {(order.latest_payment
                                                        ?.payment_reference ||
                                                        order.payment_reference) && (
                                                        <span className="block truncate font-mono text-[10px] text-[#6E6A64]">
                                                            Ref:{' '}
                                                            {order
                                                                .latest_payment
                                                                ?.payment_reference ??
                                                                order.payment_reference}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="shrink-0 rounded-[4px] bg-[#FDECEB] px-2.5 py-1 text-[10px] font-bold text-[#C52828]">
                                                Xendit QRIS
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between rounded-xl border border-[#E6DFD3] bg-[#F3EFE6] px-4 py-3">
                                            <div>
                                                <span className="block text-[10px] font-semibold tracking-wider text-[#6E6A64] uppercase">
                                                    Total Tagihan QRIS
                                                </span>
                                                <span className="text-[20px] font-bold text-[#C52828] tabular-nums">
                                                    {formatRupiah(
                                                        unpaidBalance > 0
                                                            ? unpaidBalance
                                                            : order.total_amount,
                                                    )}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={openQrisPage}
                                                className="flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C52828] px-4 text-xs font-bold text-white shadow-[0_4px_12px_rgba(197,40,40,0.25)] transition hover:bg-[#B02222] active:scale-95"
                                            >
                                                <QrCode
                                                    weight="bold"
                                                    className="size-4"
                                                />
                                                <span>Buka Halaman QRIS</span>
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                                            <span className="text-[11.5px] text-[#6E6A64]">
                                                Ingin bayar tunai di kasir saja?
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleSwitchToCash}
                                                className="cursor-pointer text-[11.5px] font-bold text-[#1A1A1A] underline underline-offset-4 transition hover:text-[#C52828]"
                                            >
                                                Ganti ke Tunai Kasir
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* 2D: Tampilan Tagihan Tunai di Meja Kasir */
                                    <div className="space-y-3.5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-5 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#E6DFD3] bg-[#F3EFE6] text-[#4A2C18]">
                                                    <Money
                                                        weight="duotone"
                                                        className="size-5.5"
                                                    />
                                                </div>
                                                <div>
                                                    <span className="block text-[14px] leading-snug font-bold text-[#1A1A1A]">
                                                        Menunggu Pembayaran di
                                                        Kasir
                                                    </span>
                                                    <span className="text-[11px] text-[#6E6A64]">
                                                        Sebutkan nama pemesan
                                                        atau nomor meja
                                                    </span>
                                                </div>
                                            </div>
                                            <span className="rounded-[4px] border border-[#E6DFD3] bg-[#F3EFE6] px-3 py-1 text-[10.5px] font-bold text-[#4A2C18]">
                                                Tunai Kasir
                                            </span>
                                        </div>

                                        <div className="rounded-xl border border-[#E6DFD3] bg-[#F3EFE6] p-3.5 text-xs leading-relaxed text-[#3F3A34]">
                                            Silakan menuju ke meja kasir untuk
                                            menyelesaikan pembayaran tunai
                                            sebesar{' '}
                                            <strong className="text-[14px] font-bold text-[#C52828] tabular-nums">
                                                {formatRupiah(
                                                    unpaidBalance > 0
                                                        ? unpaidBalance
                                                        : order.total_amount,
                                                )}
                                            </strong>{' '}
                                            atas nama{' '}
                                            <strong className="text-[#1A1A1A]">
                                                {order.customer_name}
                                            </strong>{' '}
                                            (Meja {order.table.table_number}).
                                        </div>

                                        <div className="flex items-center justify-between pt-1">
                                            <button
                                                type="button"
                                                onClick={handleSwitchToQris}
                                                className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#C52828] hover:underline"
                                            >
                                                <QrCode
                                                    weight="bold"
                                                    className="size-4"
                                                />
                                                <span>
                                                    Mau bayar praktis via QRIS
                                                    saja? Klik di sini
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* KARTU 3: Rincian Nota Digital */}
                                <div className="space-y-4 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-5 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                    <div className="flex items-center justify-between border-b border-[#EBE5DC] pb-3.5">
                                        <div className="flex items-center gap-2 text-[15px] font-bold text-[#1A1A1A]">
                                            <Receipt
                                                weight="duotone"
                                                className="size-5 text-[#4A2C18]"
                                            />
                                            <span>Nota Pemesanan</span>
                                        </div>
                                        <span
                                            className={cn(
                                                'rounded-[4px] px-2.5 py-0.5 text-[10.5px] font-bold',
                                                order.payment_status === 'paid'
                                                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                                    : hasPartialPayment
                                                      ? 'border border-[#F3D9B1] bg-[#FFF3E0] text-[#9A5B13]'
                                                      : 'bg-[#FDECEB] text-[#C52828]',
                                            )}
                                        >
                                            {order.payment_status === 'paid'
                                                ? 'LUNAS'
                                                : hasPartialPayment
                                                  ? 'TAGIHAN TAMBAHAN'
                                                  : 'BELUM DIBAYAR'}
                                        </span>
                                    </div>

                                    {/* Metadata Order */}
                                    <div className="grid grid-cols-2 gap-3 border-b border-[#EBE5DC] pb-3.5 text-xs text-[#6E6A64]">
                                        <div>
                                            <span className="block text-[10.5px] text-[#8C857B]">
                                                No. Pesanan
                                            </span>
                                            <div className="flex items-center gap-1.5 pt-0.5 font-bold text-[#1A1A1A] tabular-nums">
                                                <span>
                                                    {order.order_number}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={copyOrderNumber}
                                                    className="cursor-pointer text-[#8C857B] transition hover:text-[#1A1A1A]"
                                                    title="Salin No. Pesanan"
                                                >
                                                    <Copy
                                                        weight="bold"
                                                        className="size-3.5"
                                                    />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-[10.5px] text-[#8C857B]">
                                                Nama Pemesan
                                            </span>
                                            <p className="pt-0.5 font-bold text-[#1A1A1A]">
                                                {order.customer_name}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="block text-[10.5px] text-[#8C857B]">
                                                Lokasi Meja
                                            </span>
                                            <p className="pt-0.5 font-semibold text-[#3F3A34]">
                                                Meja {order.table.table_number}{' '}
                                                ({order.table.name || 'Dine-In'}
                                                )
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-[10.5px] text-[#8C857B]">
                                                Waktu Pesan
                                            </span>
                                            <p className="pt-0.5 font-semibold text-[#3F3A34] tabular-nums">
                                                {new Date(
                                                    order.created_at,
                                                ).toLocaleTimeString('id-ID', {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}{' '}
                                                WIB
                                            </p>
                                        </div>
                                        <div className="col-span-2 space-y-1.5 border-t border-dashed border-[#E6DFD3] pt-2 text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-[#6E6A64]">
                                                    Metode Pembayaran
                                                </span>
                                                <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#E6DFD3] bg-[#F3EFE6] px-2.5 py-0.5 text-[11px] font-bold text-[#1A1A1A]">
                                                    {order.payment_method ===
                                                    'qris' ? (
                                                        <QrCode
                                                            weight="bold"
                                                            className="size-3.5 text-[#C52828]"
                                                        />
                                                    ) : (
                                                        <Money
                                                            weight="bold"
                                                            className="size-3.5 text-[#4A2C18]"
                                                        />
                                                    )}
                                                    <span>
                                                        {order.payment_method ===
                                                        'qris'
                                                            ? 'QRIS Online (Scan QR)'
                                                            : 'Tunai di Kasir'}
                                                    </span>
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-[#6E6A64]">
                                                    Gateway Pembayaran
                                                </span>
                                                <span className="text-[11px] font-semibold text-[#1A1A1A]">
                                                    {order.payment_method ===
                                                    'qris'
                                                        ? (order.latest_payment
                                                              ?.gateway_label ??
                                                          paymentGateway?.label ??
                                                          'Xendit Payment Gateway')
                                                        : 'Kasir POS'}
                                                </span>
                                            </div>
                                            {(order.latest_payment
                                                ?.payment_reference ||
                                                order.payment_reference) && (
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] text-[#6E6A64]">
                                                        Ref. Transaksi
                                                    </span>
                                                    <span className="truncate font-mono text-[10.5px] font-semibold text-[#1A1A1A]">
                                                        {order.latest_payment
                                                            ?.payment_reference ??
                                                            order.payment_reference}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Daftar Item Menu */}
                                    <div className="space-y-3 divide-y divide-[#F0EAE1]">
                                        {order.items.map((item) => {
                                            const isRejected =
                                                item.status === 'rejected';

                                            if (isRejected) {
                                                return (
                                                    <div
                                                        key={item.id}
                                                        className="space-y-1 rounded-lg border border-[#F5C6C4] bg-[#FDECEB]/60 p-3 pt-2.5 first:pt-0"
                                                    >
                                                        <div className="flex items-start justify-between text-xs">
                                                            <div className="pr-2 font-bold text-[#8C857B] line-through">
                                                                <span>
                                                                    {
                                                                        item.menu_name
                                                                    }
                                                                </span>
                                                                <span className="ml-1.5 font-normal tabular-nums">
                                                                    &times;
                                                                    {
                                                                        item.quantity
                                                                    }
                                                                </span>
                                                            </div>
                                                            <span className="text-[#8C857B] tabular-nums line-through">
                                                                {formatRupiah(
                                                                    item.total_price,
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#C52828]">
                                                            <Prohibit
                                                                weight="bold"
                                                                className="size-3.5"
                                                            />
                                                            <span>
                                                                Ditolak:{' '}
                                                                {item.rejection_reason ||
                                                                    'Stok bahan habis'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div
                                                    key={item.id}
                                                    className="space-y-1.5 pt-3 first:pt-0"
                                                >
                                                    <div className="flex items-start justify-between text-[13.5px]">
                                                        <div className="pr-2 font-bold text-[#1A1A1A]">
                                                            <span>
                                                                {item.menu_name}
                                                            </span>
                                                            <span className="ml-1.5 font-semibold text-[#6E6A64] tabular-nums">
                                                                &times;
                                                                {item.quantity}
                                                            </span>
                                                        </div>
                                                        <span className="font-bold text-[#1A1A1A] tabular-nums">
                                                            {formatRupiah(
                                                                item.total_price,
                                                            )}
                                                        </span>
                                                    </div>

                                                    {item.options.length >
                                                        0 && (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {item.options.map(
                                                                (o) => (
                                                                    <span
                                                                        key={
                                                                            o.id
                                                                        }
                                                                        className="inline-flex items-center rounded-[4px] border border-[#E8E2D9] bg-[#F5F1E9] px-2 py-0.5 text-[10.5px] font-medium text-[#3F3A34]"
                                                                    >
                                                                        {
                                                                            o.group_name
                                                                        }
                                                                        :{' '}
                                                                        {
                                                                            o.option_name
                                                                        }
                                                                    </span>
                                                                ),
                                                            )}
                                                        </div>
                                                    )}

                                                    {item.customer_notes && (
                                                        <p className="flex items-center gap-1 text-[11px] text-[#5E5850] italic">
                                                            <PencilSimpleLine
                                                                weight="regular"
                                                                className="size-3 text-[#4A2C18]"
                                                            />
                                                            <span>
                                                                &ldquo;
                                                                {
                                                                    item.customer_notes
                                                                }
                                                                &rdquo;
                                                            </span>
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Ringkasan Total Tagihan */}
                                    <div className="space-y-2 border-t border-[#EBE5DC] pt-3.5 text-xs">
                                        <div className="flex items-center justify-between text-[#6E6A64]">
                                            <span>Subtotal Pesanan</span>
                                            <span className="font-medium text-[#1A1A1A] tabular-nums">
                                                {formatRupiah(order.subtotal)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between border-t border-[#F0EAE1] pt-2 text-sm font-bold text-[#1A1A1A]">
                                            <span>Total Tagihan</span>
                                            <span className="text-[19px] font-bold text-[#C52828] tabular-nums">
                                                {formatRupiah(
                                                    order.total_amount,
                                                )}
                                            </span>
                                        </div>
                                        {hasPartialPayment && (
                                            <div className="mt-1 space-y-1 border-t border-dashed border-[#E6DFD3] pt-2">
                                                <div className="flex items-center justify-between text-[11.5px] font-semibold text-emerald-700">
                                                    <span>
                                                        Sudah Dibayar Sebelumnya
                                                    </span>
                                                    <span className="tabular-nums">
                                                        {formatRupiah(
                                                            settledAmount,
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs font-bold text-[#C52828]">
                                                    <span>
                                                        Sisa Tagihan Menu
                                                        Tambahan
                                                    </span>
                                                    <span className="tabular-nums">
                                                        {formatRupiah(
                                                            unpaidBalance,
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Tombol Aksi Tambah Menu ke Pesanan Ini / Pesan Baru */}
                                <div className="space-y-2.5 pt-1">
                                    {order.order_status === 'pending' ||
                                    order.order_status === 'processing' ? (
                                        <>
                                            <Link
                                                href={`/order?table=${order.table.qr_token}&order=${order.order_number}`}
                                                className="block"
                                            >
                                                <button
                                                    type="button"
                                                    className="flex h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C52828] text-[14px] font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] transition hover:bg-[#B02222] active:scale-[0.99]"
                                                >
                                                    <PlusCircle
                                                        weight="bold"
                                                        className="size-5"
                                                    />
                                                    <span>
                                                        Tambah Menu ke Pesanan
                                                        Ini
                                                    </span>
                                                </button>
                                            </Link>
                                            <div className="flex items-center justify-between px-2 text-xs text-[#6E6A64]">
                                                <span>
                                                    Menu baru akan digabung ke #
                                                    {order.order_number}
                                                </span>
                                                <Link
                                                    href={`/order?table=${order.table.qr_token}&new=1`}
                                                    className="font-bold text-[#1A1A1A] underline underline-offset-4 hover:text-[#C52828]"
                                                >
                                                    Buat Nota Baru
                                                </Link>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <Link
                                                href={`/order?table=${order.table.qr_token}`}
                                                className="block"
                                            >
                                                <button
                                                    type="button"
                                                    className="flex h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C52828] text-[14px] font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] transition hover:bg-[#B02222] active:scale-[0.99]"
                                                >
                                                    <Coffee
                                                        weight="bold"
                                                        className="size-5"
                                                    />
                                                    <span>
                                                        Pesan Lagi dari Meja Ini
                                                    </span>
                                                </button>
                                            </Link>
                                            <p className="text-center text-xs text-[#6E6A64]">
                                                Pesanan berikutnya akan
                                                dibuatkan{' '}
                                                <strong className="text-[#1A1A1A]">
                                                    nota baru
                                                </strong>{' '}
                                                pada{' '}
                                                <strong className="text-[#1A1A1A]">
                                                    Meja{' '}
                                                    {order.table.table_number}
                                                </strong>
                                                .
                                            </p>
                                        </>
                                    )}
                                </div>
                            </main>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
