import { Head, router } from '@inertiajs/react';
import {
    AlertCircle,
    CheckCircle2,
    CircleDot,
    ClipboardList,
    Clock,
    Coffee,
    DollarSign,
    Loader2,
    Printer,
    RefreshCw,
    Search,
    UtensilsCrossed,
    XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

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
    user?: { id: number; name: string };
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
    };
    items: OrderItem[];
    status_histories: StatusHistory[];
}

interface Props {
    orders: {
        data: Order[];
        total: number;
    };
    counts: {
        pending: number;
        processing: number;
        ready: number;
        completed_today: number;
    };
    currentFilter: string;
}

export default function CashierOrdersIndex({ orders, counts, currentFilter }: Props) {
    const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<Order | null>(null);
    const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Polling live setiap 6 detik untuk menarik pesanan baru
    useEffect(() => {
        const interval = setInterval(() => {
            router.reload({ only: ['orders', 'counts'] });
        }, 6000);

        return () => clearInterval(interval);
    }, []);

    const formatRupiah = (amount: number | string) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
    };

    // Aksi 1: Konfirmasi Bayar Tunai & Mulai Racik
    const handleConfirmPayment = (order: Order) => {
        router.post(`/cashier/orders/${order.id}/confirm-payment`, {}, {
            onSuccess: () => toast.success(`Pembayaran ${order.order_number} dikonfirmasi!`),
            onError: (err) => toast.error(Object.values(err)[0] || 'Gagal konfirmasi pembayaran.'),
        });
    };

    // Aksi 2: Pindah Status Pesanan
    const handleUpdateStatus = (order: Order, newStatus: string, note?: string) => {
        router.post(`/cashier/orders/${order.id}/update-status`, {
            status: newStatus,
            notes: note || null,
        }, {
            onSuccess: () => toast.success(`Status ${order.order_number} diubah ke ${newStatus}!`),
            onError: (err) => toast.error(Object.values(err)[0] || 'Gagal mengubah status.'),
        });
    };

    // Aksi 3: Batalkan Pesanan
    const handleCancelOrder = (order: Order) => {
        const reason = prompt(`Masukkan alasan pembatalan untuk pesanan ${order.order_number}:`);
        if (reason !== null) {
            handleUpdateStatus(order, 'cancelled', `Dibatalkan oleh staf kasir: ${reason || 'Tanpa alasan khusus'}`);
        }
    };

    const openReceiptModal = (order: Order) => {
        setSelectedOrderForReceipt(order);
        setIsReceiptModalOpen(true);
    };

    const handlePrintReceipt = () => {
        window.print();
    };

    const filterOptions = [
        { key: 'active', label: 'Pesanan Aktif', count: counts.pending + counts.processing + counts.ready },
        { key: 'pending', label: 'Menunggu Bayar', count: counts.pending },
        { key: 'processing', label: 'Sedang Diracik', count: counts.processing },
        { key: 'ready', label: 'Siap Saji', count: counts.ready },
        { key: 'completed', label: 'Selesai Hari Ini', count: counts.completed_today },
        { key: 'all', label: 'Semua Riwayat', count: null },
    ];

    const filteredOrders = orders.data.filter((o) =>
        o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.table.table_number.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <>
            <Head title="Papan Pesanan & Kasir - Café SIDE LINE" />

            <div className="flex h-full flex-1 flex-col gap-6 p-4 md:p-8">
                {/* Header */}
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight">Papan Pesanan & Kasir</h1>
                            <Badge variant="outline" className="flex items-center gap-1 text-[11px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                <CircleDot className="size-2 text-emerald-500 animate-pulse" /> Live Auto-Sync
                            </Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                            Pantau antrean pesanan masuk, konfirmasi pembayaran tunai kasir, dan kelola proses racik barista.
                        </p>
                    </div>

                    {/* Input Filter Pencarian */}
                    <div className="w-full md:w-72 relative">
                        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari meja, no. order, nama..."
                            className="pl-9 h-9 text-xs"
                        />
                    </div>
                </div>

                {/* Filter Tab Status (Pills) */}
                <div className="flex flex-wrap gap-2 items-center border-b pb-3">
                    {filterOptions.map((f) => (
                        <Button
                            key={f.key}
                            variant={currentFilter === f.key ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => router.get('/cashier/orders', { status: f.key }, { preserveState: true })}
                            className="rounded-full text-xs h-8 gap-1.5"
                        >
                            <span>{f.label}</span>
                            {f.count !== null && (
                                <Badge
                                    variant="secondary"
                                    className={`px-1.5 py-0 text-[10px] font-mono ${currentFilter === f.key ? 'bg-primary-foreground text-primary' : ''}`}
                                >
                                    {f.count}
                                </Badge>
                            )}
                        </Button>
                    ))}
                </div>

                {/* Grid Antrean Kartu Pesanan */}
                {filteredOrders.length === 0 ? (
                    <div className="rounded-2xl border bg-card p-16 text-center text-muted-foreground space-y-3">
                        <Coffee className="size-12 mx-auto stroke-1 opacity-40" />
                        <div className="space-y-1">
                            <p className="font-semibold text-base text-foreground">Tidak ada pesanan pada filter ini</p>
                            <p className="text-xs">Pesanan baru yang dibuat customer dari meja akan otomatis muncul di sini.</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredOrders.map((order) => {
                            const isUnpaid = order.payment_status === 'unpaid';
                            const isPending = order.order_status === 'pending';
                            const isProcessing = order.order_status === 'processing';
                            const isReady = order.order_status === 'ready';

                            return (
                                <Card
                                    key={order.id}
                                    className={`overflow-hidden border-2 flex flex-col justify-between transition-shadow hover:shadow-md ${
                                        isPending ? 'border-amber-500/40 bg-amber-500/[0.02]' :
                                        isProcessing ? 'border-blue-500/40 bg-blue-500/[0.02]' :
                                        isReady ? 'border-emerald-500/40 bg-emerald-500/[0.02]' : 'border-border'
                                    }`}
                                >
                                    {/* Header Kartu */}
                                    <CardHeader className="p-4 pb-3 border-b bg-muted/30">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Badge className="font-black text-sm px-2.5 py-0.5 bg-primary text-primary-foreground">
                                                    Meja {order.table.table_number}
                                                </Badge>
                                                <span className="font-bold text-sm text-foreground">
                                                    {order.customer_name}
                                                </span>
                                            </div>
                                            <span className="font-mono text-xs text-muted-foreground">
                                                {new Date(order.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between pt-1">
                                            <span className="font-mono text-xs font-semibold text-muted-foreground">
                                                #{order.order_number}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                {/* Badge Status Pembayaran */}
                                                <Badge
                                                    variant={order.payment_status === 'paid' ? 'default' : 'destructive'}
                                                    className={`text-[10px] font-bold ${order.payment_status === 'paid' ? 'bg-emerald-600' : ''}`}
                                                >
                                                    {order.payment_status === 'paid' ? 'LUNAS' : 'BELUM BAYAR'}
                                                </Badge>

                                                {/* Badge Status Operasional */}
                                                <Badge variant="outline" className="text-[10px] capitalize">
                                                    {order.order_status}
                                                </Badge>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    {/* Isi Pesanan (Untuk Barista) */}
                                    <CardContent className="p-4 space-y-3 flex-1">
                                        <div className="space-y-2.5 divide-y divide-border/60">
                                            {order.items.map((item) => (
                                                <div key={item.id} className="pt-2 first:pt-0 space-y-0.5">
                                                    <div className="flex items-start justify-between text-xs">
                                                        <div className="font-semibold text-foreground pr-2">
                                                            <span className="font-mono font-bold text-primary mr-1">
                                                                {item.quantity}x
                                                            </span>
                                                            {item.menu_name}
                                                        </div>
                                                        <span className="font-mono text-muted-foreground text-[11px]">
                                                            {formatRupiah(item.total_price)}
                                                        </span>
                                                    </div>

                                                    {/* Rincian Opsi Ukuran & Topping */}
                                                    {item.options.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 pl-4 pt-0.5">
                                                            {item.options.map((opt) => (
                                                                <span
                                                                    key={opt.id}
                                                                    className="text-[10px] bg-muted px-1.5 py-0.2 rounded font-medium text-muted-foreground"
                                                                >
                                                                    {opt.group_name}: {opt.option_name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Catatan Khusus Customer */}
                                                    {item.customer_notes && (
                                                        <p className="text-[11px] text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded font-medium mt-1">
                                                            Catatan: "{item.customer_notes}"
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Catatan Global */}
                                        {order.notes && (
                                            <p className="text-xs bg-muted/50 p-2 rounded text-muted-foreground border">
                                                <strong>Pesan Meja:</strong> {order.notes}
                                            </p>
                                        )}
                                    </CardContent>

                                    {/* Footer Kartu & Tombol Operasional */}
                                    <CardFooter className="p-3 bg-muted/20 border-t flex flex-col gap-2.5">
                                        <div className="flex items-center justify-between w-full text-xs">
                                            <span className="text-muted-foreground">Total Tagihan:</span>
                                            <span className="font-mono font-bold text-sm text-emerald-600">
                                                {formatRupiah(order.total_amount)}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 w-full">
                                            {/* TOMBOL AKSI UTAMA SESUAI ALUR */}
                                            {isUnpaid ? (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleConfirmPayment(order)}
                                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold h-9 gap-1"
                                                >
                                                    <DollarSign className="size-3.5" /> Terima Bayar Tunai & Racik
                                                </Button>
                                            ) : isProcessing ? (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleUpdateStatus(order, 'ready')}
                                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs font-bold h-9 gap-1"
                                                >
                                                    <UtensilsCrossed className="size-3.5" /> Selesai Diracik (Siap Saji)
                                                </Button>
                                            ) : isReady ? (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleUpdateStatus(order, 'completed')}
                                                    className="flex-1 bg-neutral-800 hover:bg-neutral-900 text-xs font-bold h-9 gap-1"
                                                >
                                                    <CheckCircle2 className="size-3.5" /> Pesanan Diantar (Selesai)
                                                </Button>
                                            ) : null}

                                            {/* Tombol Cetak Struk */}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openReceiptModal(order)}
                                                className="h-9 px-2.5"
                                                title="Cetak Struk Kasir / Tiket Dapur"
                                            >
                                                <Printer className="size-4" />
                                            </Button>

                                            {/* Tombol Batal jika pesanan masih aktif */}
                                            {order.order_status !== 'completed' && order.order_status !== 'cancelled' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleCancelOrder(order)}
                                                    className="h-9 px-2 text-destructive hover:bg-destructive/10"
                                                    title="Batalkan Pesanan"
                                                >
                                                    <XCircle className="size-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </CardFooter>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* MODAL: CETAK STRUK KASIR & TIKET DAPUR (FORMAT THERMAL PRINTER) */}
            <Dialog open={isReceiptModalOpen} onOpenChange={setIsReceiptModalOpen}>
                <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
                    {selectedOrderForReceipt && (
                        <div className="space-y-4 font-mono text-xs">
                            <DialogHeader>
                                <DialogTitle className="text-center font-sans font-bold text-base">
                                    Cetak Struk Kasir
                                </DialogTitle>
                                <DialogDescription className="text-center font-sans text-xs">
                                    Pratinjau struk kasir format thermal printer (80mm / 58mm).
                                </DialogDescription>
                            </DialogHeader>

                            {/* TAMPILAN KERTAS STRUK THERMAL */}
                            <div className="bg-white text-black p-5 rounded-lg border shadow-inner space-y-3 leading-relaxed">
                                <div className="text-center border-b pb-2 space-y-0.5">
                                    <h3 className="font-black text-sm uppercase tracking-wider">CAFÉ SIDE LINE</h3>
                                    <p className="text-[10px] text-gray-500">Jl. Samping Kopi No. 7</p>
                                    <p className="text-[10px] text-gray-500">Telp: 0812-XXXX-XXXX</p>
                                </div>

                                <div className="text-[11px] space-y-0.5 border-b pb-2">
                                    <div className="flex justify-between">
                                        <span>No: {selectedOrderForReceipt.order_number}</span>
                                        <span>{new Date(selectedOrderForReceipt.created_at).toLocaleDateString('id-ID')}</span>
                                    </div>
                                    <div className="flex justify-between font-bold">
                                        <span>MEJA: {selectedOrderForReceipt.table.table_number}</span>
                                        <span>{selectedOrderForReceipt.customer_name}</span>
                                    </div>
                                </div>

                                {/* Item Pesanan */}
                                <div className="space-y-2 border-b pb-2 text-[11px]">
                                    {selectedOrderForReceipt.items.map((item) => (
                                        <div key={item.id} className="space-y-0.5">
                                            <div className="flex justify-between">
                                                <span className="font-bold">{item.menu_name} x{item.quantity}</span>
                                                <span>{formatRupiah(item.total_price)}</span>
                                            </div>
                                            {item.options.map((opt) => (
                                                <div key={opt.id} className="flex justify-between text-[10px] text-gray-600 pl-2">
                                                    <span>+ {opt.option_name}</span>
                                                    <span>{parseFloat(opt.additional_price) > 0 ? formatRupiah(opt.additional_price) : ''}</span>
                                                </div>
                                            ))}
                                            {item.customer_notes && (
                                                <p className="text-[10px] italic text-gray-500 pl-2">
                                                    "{item.customer_notes}"
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Total Tagihan */}
                                <div className="space-y-1 text-[11px] border-b pb-2">
                                    <div className="flex justify-between">
                                        <span>Subtotal:</span>
                                        <span>{formatRupiah(selectedOrderForReceipt.subtotal)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold text-xs pt-1 border-t border-dashed">
                                        <span>TOTAL:</span>
                                        <span>{formatRupiah(selectedOrderForReceipt.total_amount)}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] pt-0.5">
                                        <span>Metode:</span>
                                        <span className="uppercase">{selectedOrderForReceipt.payment_method || 'Tunai'} ({selectedOrderForReceipt.payment_status.toUpperCase()})</span>
                                    </div>
                                </div>

                                <div className="text-center text-[10px] text-gray-500 pt-1 space-y-0.5">
                                    <p>Terima Kasih Atas Kunjungan Anda!</p>
                                    <p>WiFi: SIDELINE_FREE | Pass: kopisejuk</p>
                                </div>
                            </div>

                            <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t font-sans">
                                <Button type="button" variant="outline" onClick={() => setIsReceiptModalOpen(false)}>
                                    Tutup
                                </Button>
                                <Button type="button" onClick={handlePrintReceipt} className="gap-1.5">
                                    <Printer className="size-4" /> Cetak ke Printer
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

CashierOrdersIndex.layout = {
    breadcrumbs: [
        {
            title: 'Dashboard',
            href: '/dashboard',
        },
        {
            title: 'Pesanan Kasir & Bar',
            href: '/cashier/orders',
        },
    ],
};