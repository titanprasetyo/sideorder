import { Head, Link, router } from '@inertiajs/react';
import {
    AlertCircle,
    ArrowLeft,
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
    // Auto-polling pembaruan status setiap 5 detik selama pesanan belum selesai/batal
    useEffect(() => {
        if (order.order_status === 'completed' || order.order_status === 'cancelled') {
            return;
        }

        const interval = setInterval(() => {
            router.reload({ only: ['order'] });
        }, 5000);

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

    // Konfigurasi visual tahapan progres pesanan
    const getStatusConfig = () => {
        switch (order.order_status) {
            case 'pending':
                return {
                    title: 'Pesanan Diterima',
                    description: 'Pesanan Anda sudah masuk ke sistem antrean kafe.',
                    badgeColor: 'bg-amber-500/15 text-amber-700 border-amber-500/20',
                    icon: Clock,
                    step: 1,
                };
            case 'processing':
                return {
                    title: 'Sedang Diracik Barista',
                    description: 'Makanan dan minuman Anda sedang disiapkan dengan cermat.',
                    badgeColor: 'bg-blue-500/15 text-blue-700 border-blue-500/20',
                    icon: Coffee,
                    step: 2,
                };
            case 'ready':
                return {
                    title: 'Pesanan Siap Disajikan!',
                    description: 'Pesanan Anda sudah siap di meja bar atau sedang diantar pelayan.',
                    badgeColor: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20',
                    icon: UtensilsCrossed,
                    step: 3,
                };
            case 'completed':
                return {
                    title: 'Pesanan Selesai',
                    description: 'Terima kasih telah berkunjung dan menikmati sajian Café SIDE LINE.',
                    badgeColor: 'bg-neutral-500/15 text-neutral-700 border-neutral-500/20',
                    icon: PartyPopper,
                    step: 4,
                };
            case 'cancelled':
                return {
                    title: 'Pesanan Dibatalkan',
                    description: 'Pesanan ini dibatalkan. Silakan hubungi kasir atau barista.',
                    badgeColor: 'bg-destructive/15 text-destructive border-destructive/20',
                    icon: AlertCircle,
                    step: 0,
                };
        }
    };

    const statusConfig = getStatusConfig();
    const StatusIcon = statusConfig.icon;

    return (
        <>
            <Head title={`Status Pesanan ${order.order_number} - Café SIDE LINE`} />

            <div className="min-h-screen bg-muted/20 pb-16">
                {/* Header */}
                <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b px-4 py-3 shadow-2xs">
                    <div className="max-w-md mx-auto flex items-center justify-between">
                        <Link
                            href={`/order?table=${order.table.qr_token}`}
                            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                        >
                            <ArrowLeft className="size-4" /> Pesan Menu Lain
                        </Link>

                        <Badge variant="outline" className="font-mono text-xs font-bold border-primary/30">
                            Meja {order.table.table_number}
                        </Badge>
                    </div>
                </header>

                <main className="max-w-md mx-auto p-4 space-y-4">
                    {/* KARTU 1: Status Utama & Stepper */}
                    <Card className="border shadow-xs overflow-hidden">
                        <CardContent className="p-6 text-center space-y-4">
                            <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
                                <StatusIcon className="size-8 stroke-[1.8]" />
                            </div>

                            <div className="space-y-1">
                                <Badge className={`${statusConfig.badgeColor} text-xs font-semibold px-3 py-0.5`}>
                                    {statusConfig.title}
                                </Badge>
                                <p className="text-xs text-muted-foreground pt-1">
                                    {statusConfig.description}
                                </p>
                            </div>

                            {/* Stepper Progres */}
                            {order.order_status !== 'cancelled' && (
                                <div className="pt-2">
                                    <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold text-muted-foreground">
                                        <div className={`flex flex-col items-center gap-1 ${statusConfig.step >= 1 ? 'text-primary' : ''}`}>
                                            <div className={`size-2.5 rounded-full ${statusConfig.step >= 1 ? 'bg-primary ring-2 ring-primary/30' : 'bg-muted-foreground/30'}`} />
                                            <span>Diterima</span>
                                        </div>
                                        <div className={`flex flex-col items-center gap-1 ${statusConfig.step >= 2 ? 'text-primary' : ''}`}>
                                            <div className={`size-2.5 rounded-full ${statusConfig.step >= 2 ? 'bg-primary ring-2 ring-primary/30' : 'bg-muted-foreground/30'}`} />
                                            <span>Diracik</span>
                                        </div>
                                        <div className={`flex flex-col items-center gap-1 ${statusConfig.step >= 3 ? 'text-primary' : ''}`}>
                                            <div className={`size-2.5 rounded-full ${statusConfig.step >= 3 ? 'bg-primary ring-2 ring-primary/30' : 'bg-muted-foreground/30'}`} />
                                            <span>Siap Saji</span>
                                        </div>
                                        <div className={`flex flex-col items-center gap-1 ${statusConfig.step >= 4 ? 'text-primary' : ''}`}>
                                            <div className={`size-2.5 rounded-full ${statusConfig.step >= 4 ? 'bg-primary ring-2 ring-primary/30' : 'bg-muted-foreground/30'}`} />
                                            <span>Selesai</span>
                                        </div>
                                    </div>
                                    <div className="h-1 bg-muted rounded-full mt-2 overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-500"
                                            style={{ width: `${(statusConfig.step / 4) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Auto-update notice */}
                            {order.order_status !== 'completed' && order.order_status !== 'cancelled' && (
                                <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                                    <Loader2 className="size-3 animate-spin text-primary" />
                                    <span>Halaman ini memantau status secara otomatis</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* KARTU 2: Instruksi Pembayaran Kasir */}
                    {order.payment_status === 'unpaid' && (
                        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 space-y-1.5 text-xs">
                            <div className="flex items-center gap-1.5 font-bold text-amber-800">
                                <AlertCircle className="size-4 shrink-0 text-amber-600" />
                                <span>Menunggu Pembayaran di Kasir</span>
                            </div>
                            <p className="leading-relaxed">
                                Silakan menuju ke meja kasir untuk menyelesaikan pembayaran sebesar{' '}
                                <strong className="font-mono text-sm">{formatRupiah(order.total_amount)}</strong>{' '}
                                dengan menyebutkan nama pemesan: <strong>{order.customer_name}</strong> atau Nomor Meja: <strong>{order.table.table_number}</strong>.
                            </p>
                        </div>
                    )}

                    {/* KARTU 3: Rincian Nota Digital (Receipt) */}
                    <Card className="border shadow-xs">
                        <CardHeader className="p-4 pb-2 border-b">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                                    <Receipt className="size-4 text-primary" />
                                    Nota Pemesanan
                                </CardTitle>
                                <Badge
                                    variant={order.payment_status === 'paid' ? 'default' : 'outline'}
                                    className={`text-[10px] ${order.payment_status === 'paid' ? 'bg-emerald-600' : 'border-amber-500 text-amber-600'}`}
                                >
                                    {order.payment_status === 'paid' ? 'LUNAS' : 'BELUM DIBAYAR'}
                                </Badge>
                            </div>
                        </CardHeader>

                        <CardContent className="p-4 space-y-4">
                            {/* Metadata Order */}
                            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-b pb-3">
                                <div>
                                    <span>No. Pesanan:</span>
                                    <div className="flex items-center gap-1 font-mono font-bold text-foreground pt-0.5">
                                        <span>{order.order_number}</span>
                                        <button
                                            type="button"
                                            onClick={copyOrderNumber}
                                            className="text-muted-foreground hover:text-foreground"
                                            title="Salin No. Pesanan"
                                        >
                                            <Copy className="size-3" />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span>Nama Pemesan:</span>
                                    <p className="font-bold text-foreground pt-0.5">{order.customer_name}</p>
                                </div>
                                <div>
                                    <span>Lokasi Meja:</span>
                                    <p className="font-medium text-foreground">Meja {order.table.table_number} ({order.table.name || 'Utama'})</p>
                                </div>
                                <div className="text-right">
                                    <span>Waktu Order:</span>
                                    <p className="font-medium text-foreground">{new Date(order.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</p>
                                </div>
                            </div>

                            {/* Daftar Item Menu */}
                            <div className="space-y-3 divide-y divide-border/60">
                                {order.items.map((item) => (
                                    <div key={item.id} className="pt-2 first:pt-0 space-y-0.5">
                                        <div className="flex items-start justify-between text-xs">
                                            <div className="pr-2">
                                                <span className="font-bold text-foreground">{item.menu_name}</span>
                                                <span className="text-muted-foreground text-[11px] font-mono ml-1.5">
                                                    x{item.quantity}
                                                </span>
                                            </div>
                                            <span className="font-mono font-semibold text-foreground">
                                                {formatRupiah(item.total_price)}
                                            </span>
                                        </div>

                                        {/* Snapshot Opsi Terpilih */}
                                        {item.options.length > 0 && (
                                            <p className="text-[11px] text-muted-foreground pl-0.5">
                                                {item.options.map((o) => `${o.group_name}: ${o.option_name}`).join(', ')}
                                            </p>
                                        )}

                                        {/* Catatan bebas */}
                                        {item.customer_notes && (
                                            <p className="text-[11px] text-amber-700 italic pl-0.5">
                                                "{item.customer_notes}"
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Ringkasan Total Tagihan */}
                            <div className="border-t pt-3 space-y-1.5 text-xs">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span>Subtotal:</span>
                                    <span className="font-mono">{formatRupiah(order.subtotal)}</span>
                                </div>
                                <div className="flex items-center justify-between font-bold text-sm text-foreground pt-1 border-t">
                                    <span>Total Akhir:</span>
                                    <span className="font-mono text-base text-emerald-600">
                                        {formatRupiah(order.total_amount)}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tombol Aksi Bawah */}
                    <div className="pt-2">
                        <Link href={`/order?table=${order.table.qr_token}`}>
                            <Button variant="outline" className="w-full h-11 text-xs rounded-xl font-semibold gap-2">
                                <Coffee className="size-4" /> Tambah Pesanan Lain dari Meja Ini
                            </Button>
                        </Link>
                    </div>
                </main>
            </div>
        </>
    );
}