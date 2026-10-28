import { Head, Link, router } from '@inertiajs/react';
import {
    AlertCircle,
    ArrowLeft,
    Ban,
    CheckCircle2,
    Clock,
    Coffee,
    Copy,
    Loader2,
    PartyPopper,
    Receipt,
    UtensilsCrossed,
} from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

interface Order {
    id: number;
    order_number: string;
    customer_name: string;
    subtotal: string;
    total_amount: string;
    order_status: 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled';
    payment_status: 'unpaid' | 'paid';
    payment_method: string | null;
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
}

interface Props {
    order: Order;
}

export default function OrderStatusPage({ order }: Props) {
    // Auto-polling pembaruan status setiap 4 detik selama pesanan belum selesai/batal
    useEffect(() => {
        if (order.order_status === 'completed' || order.order_status === 'cancelled') {
            return;
        }

        const interval = setInterval(() => {
            router.reload({ only: ['order'] });
        }, 4000);

        return () => clearInterval(interval);
    }, [order.order_status]);

    const formatRupiah = (amount: number | string) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
    };

    const copyOrderNumber = () => {
        navigator.clipboard.writeText(order.order_number);
        toast.success('Nomor pesanan disalin ke clipboard!');
    };

    const settledAmount = Number(
        order.settled_amount ?? (order.payment_status === 'paid' ? order.total_amount : 0),
    );
    const unpaidBalance = Number(
        order.unpaid_balance ?? (order.payment_status === 'paid' ? 0 : order.total_amount),
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
                              ? 'Menunggu Pembayaran Menu Tambahan'
                              : 'Menunggu Pembayaran Kasir',
                    description:
                        order.payment_status === 'paid'
                            ? 'Pembayaran sudah diterima. Pesanan Anda segera diracik oleh barista.'
                            : hasPartialPayment
                              ? 'Menu tambahan berhasil masuk ke pesanan. Silakan selesaikan pembayaran tambahan di kasir.'
                              : 'Pesanan Anda sudah masuk. Silakan bayar di kasir untuk mulai diracik.',
                    badgeColor: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
                    icon: Clock,
                    step: 1,
                };
            case 'processing':
                return {
                    title: 'Sedang Diracik Barista',
                    description: hasPartialPayment
                        ? 'Pesanan sedang diracik barista. Silakan selesaikan pembayaran menu tambahan di kasir.'
                        : 'Makanan dan minuman Anda sedang disiapkan dengan cermat.',
                    badgeColor: 'bg-blue-500/15 text-blue-800 border-blue-500/30',
                    icon: Coffee,
                    step: 2,
                };
            case 'ready':
                return {
                    title: 'Pesanan Siap Disajikan!',
                    description: 'Pesanan Anda sudah siap di meja bar atau sedang diantar pelayan.',
                    badgeColor: 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30',
                    icon: UtensilsCrossed,
                    step: 3,
                };
            case 'completed':
                return {
                    title: 'Pesanan Selesai',
                    description: 'Terima kasih telah berkunjung dan menikmati sajian Café SIDE LINE.',
                    badgeColor: 'bg-neutral-900 text-white',
                    icon: PartyPopper,
                    step: 4,
                };
            case 'cancelled':
                return {
                    title: 'Pesanan Dibatalkan',
                    description: 'Pesanan ini dibatalkan atau ditolak. Silakan hubungi kasir atau barista.',
                    badgeColor: 'bg-rose-500/15 text-rose-800 border-rose-500/30',
                    icon: AlertCircle,
                    step: 0,
                };
        }
    };

    const statusConfig = getStatusConfig();
    const StatusIcon = statusConfig.icon;

    return (
        <>
            <Head title={`Status Pesanan #${order.order_number} • SIDE LINE`} />

            {/* WRAPPER DESKTOP FRAME: Khusus tampilan Mobile / Tablet */}
            <div className="min-h-screen bg-neutral-900 md:py-6 flex justify-center items-start selection:bg-[#FF0000] selection:text-white font-sans">
                <div className="w-full max-w-md sm:max-w-lg min-h-screen md:min-h-[92vh] md:rounded-[36px] bg-[#FBF1CB] shadow-2xl relative overflow-x-hidden flex flex-col md:border-[8px] md:border-neutral-800 pb-12">
                    {/* Header */}
                    <header className="px-4 py-3 flex items-center justify-between border-b border-[#E8DCB2] bg-white/70 backdrop-blur">
                        <Link
                            href={`/order?table=${order.table.qr_token}`}
                            className="flex items-center gap-1.5 text-xs font-bold text-neutral-700 hover:text-black transition"
                        >
                            <ArrowLeft className="size-4" /> Kembali ke Menu
                        </Link>

                        <div className="flex items-center gap-1.5">
                            <span className="bg-neutral-950 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full">
                                MEJA {order.table.table_number}
                            </span>
                        </div>
                    </header>

                    <main className="p-4 space-y-4 flex-1">
                        {/* KARTU 1: Status Utama & Stepper */}
                        <div className="bg-white rounded-2xl p-5 text-center space-y-3.5 shadow-xs border border-[#E8DCB2]">
                            <div className="size-16 rounded-full bg-[#F5E6B4] text-neutral-800 flex items-center justify-center mx-auto shadow-inner">
                                <StatusIcon className="size-8 stroke-[1.8]" />
                            </div>

                            <div className="space-y-1">
                                <span
                                    className={`inline-block text-xs font-black px-3 py-1 rounded-full ${statusConfig.badgeColor}`}
                                >
                                    {statusConfig.title}
                                </span>
                                <p className="text-xs text-neutral-600 pt-1">
                                    {statusConfig.description}
                                </p>
                            </div>

                            {/* Stepper Progres */}
                            {order.order_status !== 'cancelled' && (
                                <div className="pt-2">
                                    <div className="grid grid-cols-4 gap-1 text-[10px] font-bold text-neutral-400">
                                        <div
                                            className={`flex flex-col items-center gap-1 ${statusConfig.step >= 1 ? 'text-[#FF0000]' : ''}`}
                                        >
                                            <div
                                                className={`size-2.5 rounded-full ${statusConfig.step >= 1 ? 'bg-[#FF0000] ring-2 ring-[#FF0000]/30' : 'bg-neutral-300'}`}
                                            />
                                            <span>Diterima</span>
                                        </div>
                                        <div
                                            className={`flex flex-col items-center gap-1 ${statusConfig.step >= 2 ? 'text-[#FF0000]' : ''}`}
                                        >
                                            <div
                                                className={`size-2.5 rounded-full ${statusConfig.step >= 2 ? 'bg-[#FF0000] ring-2 ring-[#FF0000]/30' : 'bg-neutral-300'}`}
                                            />
                                            <span>Diracik</span>
                                        </div>
                                        <div
                                            className={`flex flex-col items-center gap-1 ${statusConfig.step >= 3 ? 'text-[#FF0000]' : ''}`}
                                        >
                                            <div
                                                className={`size-2.5 rounded-full ${statusConfig.step >= 3 ? 'bg-[#FF0000] ring-2 ring-[#FF0000]/30' : 'bg-neutral-300'}`}
                                            />
                                            <span>Siap Saji</span>
                                        </div>
                                        <div
                                            className={`flex flex-col items-center gap-1 ${statusConfig.step >= 4 ? 'text-[#FF0000]' : ''}`}
                                        >
                                            <div
                                                className={`size-2.5 rounded-full ${statusConfig.step >= 4 ? 'bg-[#FF0000] ring-2 ring-[#FF0000]/30' : 'bg-neutral-300'}`}
                                            />
                                            <span>Selesai</span>
                                        </div>
                                    </div>
                                    <div className="h-1.5 bg-neutral-100 rounded-full mt-2.5 overflow-hidden">
                                        <div
                                            className="h-full bg-[#FF0000] transition-all duration-500 rounded-full"
                                            style={{ width: `${(statusConfig.step / 4) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Auto-update notice */}
                            {order.order_status !== 'completed' &&
                                order.order_status !== 'cancelled' && (
                                    <div className="flex items-center justify-center gap-1.5 text-[10px] text-neutral-500 pt-1">
                                        <Loader2 className="size-3 animate-spin text-[#FF0000]" />
                                        <span>Status diperbarui otomatis secara live</span>
                                    </div>
                                )}
                        </div>

                        {/* KARTU 2: Instruksi Pembayaran Kasir */}
                        {order.payment_status === 'unpaid' && (
                            <div className="p-4 rounded-2xl border border-amber-300 bg-[#FEF6D8] text-amber-950 space-y-1.5 text-xs shadow-xs">
                                <div className="flex items-center gap-1.5 font-black text-amber-900">
                                    <AlertCircle className="size-4 shrink-0 text-[#FF0000]" />
                                    <span>
                                        {hasPartialPayment
                                            ? 'Menunggu Pembayaran Menu Tambahan di Kasir'
                                            : 'Menunggu Pembayaran di Meja Kasir'}
                                    </span>
                                </div>
                                {hasPartialPayment ? (
                                    <p className="leading-relaxed text-[11px] text-neutral-700">
                                        Pembayaran awal sebesar{' '}
                                        <strong className="font-mono text-emerald-800">
                                            {formatRupiah(settledAmount)}
                                        </strong>{' '}
                                        tetap tercatat. Silakan menuju kasir untuk menyelesaikan{' '}
                                        <strong>tagihan menu tambahan</strong> sebesar{' '}
                                        <strong className="font-mono text-sm text-neutral-900 font-black">
                                            {formatRupiah(unpaidBalance)}
                                        </strong>{' '}
                                        atas nama <strong>{order.customer_name}</strong> (Meja{' '}
                                        {order.table.table_number}).
                                    </p>
                                ) : (
                                    <p className="leading-relaxed text-[11px] text-neutral-700">
                                        Silakan menuju ke kasir untuk menyelesaikan pembayaran sebesar{' '}
                                        <strong className="font-mono text-sm text-neutral-900 font-black">
                                            {formatRupiah(order.total_amount)}
                                        </strong>{' '}
                                        dengan menyebutkan nama: <strong>{order.customer_name}</strong> (Meja{' '}
                                        {order.table.table_number}).
                                    </p>
                                )}
                            </div>
                        )}

                        {/* KARTU 3: Rincian Nota Digital */}
                        <div className="bg-white rounded-2xl p-4 shadow-xs border border-[#E8DCB2] space-y-3">
                            <div className="flex items-center justify-between border-b pb-2.5">
                                <div className="flex items-center gap-1.5 font-heading font-bold text-sm text-neutral-900">
                                    <Receipt className="size-4 text-neutral-700" />
                                    <span>Nota Pemesanan</span>
                                </div>
                                <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        order.payment_status === 'paid'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : hasPartialPayment
                                              ? 'bg-amber-100 text-amber-800'
                                              : 'bg-rose-100 text-rose-700'
                                    }`}
                                >
                                    {order.payment_status === 'paid'
                                        ? 'LUNAS'
                                        : hasPartialPayment
                                          ? 'TAGIHAN TAMBAHAN'
                                          : 'BELUM DIBAYAR'}
                                </span>
                            </div>

                            {/* Metadata Order */}
                            <div className="grid grid-cols-2 gap-2 text-xs text-neutral-600 border-b pb-3">
                                <div>
                                    <span className="text-[10px] text-neutral-400">No. Pesanan:</span>
                                    <div className="flex items-center gap-1 font-mono font-bold text-neutral-900 pt-0.5">
                                        <span>{order.order_number}</span>
                                        <button
                                            type="button"
                                            onClick={copyOrderNumber}
                                            className="text-neutral-400 hover:text-black cursor-pointer"
                                            title="Salin No. Pesanan"
                                        >
                                            <Copy className="size-3" />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] text-neutral-400">Nama Pemesan:</span>
                                    <p className="font-bold text-neutral-900 pt-0.5">
                                        {order.customer_name}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-[10px] text-neutral-400">Lokasi:</span>
                                    <p className="font-semibold text-neutral-800">
                                        Meja {order.table.table_number} ({order.table.name || 'Dine-In'})
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] text-neutral-400">Waktu:</span>
                                    <p className="font-semibold text-neutral-800">
                                        {new Date(order.created_at).toLocaleTimeString('id-ID', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}{' '}
                                        WIB
                                    </p>
                                </div>
                            </div>

                            {/* Daftar Item Menu */}
                            <div className="space-y-2.5 divide-y divide-neutral-100">
                                {order.items.map((item) => {
                                    const isRejected = item.status === 'rejected';

                                    if (isRejected) {
                                        return (
                                            <div
                                                key={item.id}
                                                className="pt-2 first:pt-0 p-2 rounded-xl bg-rose-50/70 border border-rose-200 space-y-1"
                                            >
                                                <div className="flex items-start justify-between text-xs">
                                                    <div className="pr-2 font-bold text-neutral-400 line-through">
                                                        <span className="font-heading">{item.menu_name}</span>
                                                        <span className="font-mono font-normal ml-1.5">
                                                            x{item.quantity}
                                                        </span>
                                                    </div>
                                                    <span className="font-mono text-neutral-400 line-through">
                                                        {formatRupiah(item.total_price)}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] font-semibold text-rose-700 flex items-center gap-1">
                                                    <Ban className="size-3" />
                                                    <span>
                                                        Ditolak:{' '}
                                                        {item.rejection_reason || 'Stok bahan habis'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={item.id} className="pt-2 first:pt-0 space-y-0.5">
                                            <div className="flex items-start justify-between text-xs">
                                                <div className="pr-2 font-bold text-neutral-900">
                                                    <span className="font-heading">{item.menu_name}</span>
                                                    <span className="text-neutral-500 font-mono font-normal ml-1.5">
                                                        x{item.quantity}
                                                    </span>
                                                </div>
                                                <span className="font-mono font-bold text-neutral-900">
                                                    {formatRupiah(item.total_price)}
                                                </span>
                                            </div>

                                            {item.options.length > 0 && (
                                                <p className="text-[10px] text-neutral-500">
                                                    {item.options
                                                        .map((o) => `${o.group_name}: ${o.option_name}`)
                                                        .join(', ')}
                                                </p>
                                            )}

                                            {item.customer_notes && (
                                                <p className="text-[10px] text-amber-800 italic">
                                                    &quot;{item.customer_notes}&quot;
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Ringkasan Total Tagihan */}
                            <div className="border-t pt-3 space-y-1.5 text-xs">
                                <div className="flex items-center justify-between text-neutral-600">
                                    <span>Subtotal:</span>
                                    <span className="font-mono">{formatRupiah(order.subtotal)}</span>
                                </div>
                                <div className="flex items-center justify-between font-bold text-sm text-neutral-900 pt-1 border-t">
                                    <span>Total Tagihan:</span>
                                    <span className="font-mono text-base font-black text-neutral-950">
                                        {formatRupiah(order.total_amount)}
                                    </span>
                                </div>
                                {hasPartialPayment && (
                                    <div className="pt-1.5 mt-1 border-t border-dashed border-neutral-200 space-y-1">
                                        <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-700">
                                            <span>Sudah Dibayar Sebelumnya:</span>
                                            <span className="font-mono">
                                                {formatRupiah(settledAmount)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs font-extrabold text-[#C52828]">
                                            <span>Sisa Tagihan Menu Tambahan:</span>
                                            <span className="font-mono">
                                                {formatRupiah(unpaidBalance)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tombol Aksi Buat Pesanan Baru dari Meja Ini */}
                        <div className="pt-2 space-y-2">
                            <Link href={`/order?table=${order.table.qr_token}`}>
                                <button
                                    type="button"
                                    className="w-full h-12 bg-[#FF0000] hover:bg-[#e00000] text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-md active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <Coffee className="size-4" /> Pesan Lagi dari Meja Ini
                                </button>
                            </Link>
                            <p className="text-[11px] text-center text-neutral-600">
                                Pesanan berikutnya akan dibuatkan{' '}
                                <strong className="text-neutral-900">nota baru</strong> pada{' '}
                                <strong className="text-neutral-900">
                                    Meja {order.table.table_number}
                                </strong>
                                .
                            </p>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
