import { Head, Link, router } from '@inertiajs/react';
import {
    AlertCircle,
    ArrowRight,
    Calendar,
    Check,
    CheckCircle2,
    CircleDot,
    ClipboardList,
    Clock,
    Coffee,
    DollarSign,
    ExternalLink,
    Eye,
    Filter,
    Loader2,
    Printer,
    RefreshCw,
    Search,
    ShieldCheck,
    Store,
    Trash2,
    UserCheck,
    UtensilsCrossed,
    Volume2,
    VolumeX,
    Wallet,
    X,
    XCircle,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { playOrderChime, unlockAudioContext } from '@/lib/order-chime';
import type { BreadcrumbItem } from '@/types';

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
    updated_at?: string;
    table: {
        id: number;
        table_number: string;
        name: string | null;
    };
    items: OrderItem[];
    status_histories?: StatusHistory[];
}

interface Props {
    orders: {
        data: Order[];
        current_page: number;
        last_page: number;
        total: number;
        links: { url: string | null; label: string; active: boolean }[];
    };
    counts: {
        all: number;
        pending: number;
        processing: number;
        ready: number;
        completed: number;
        cancelled: number;
        unpaid: number;
        today_orders?: number;
        yesterday_orders?: number;
        today_revenue: number;
        total_all_time: number;
    };
    filters: {
        status: string;
        payment: string;
        date: string;
        search: string;
    };
}

export default function AdminOrdersIndex({ orders, counts, filters }: Props) {
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isAutoSync, setIsAutoSync] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(() => {
        return typeof window !== 'undefined'
            ? localStorage.getItem('sideline_cashier_sound') !== 'disabled'
            : true;
    });

    // Refs untuk auto-polling & notifikasi pesanan masuk
    const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isFirstMountRef = useRef(true);
    const knownOrderIdsRef = useRef<Set<number>>(new Set(orders.data.map((o) => o.id)));
    const soundEnabledRef = useRef<boolean>(soundEnabled);

    useEffect(() => {
        soundEnabledRef.current = soundEnabled;
    }, [soundEnabled]);

    const toggleSound = () => {
        unlockAudioContext();
        const nextState = !soundEnabled;
        setSoundEnabled(nextState);
        localStorage.setItem('sideline_cashier_sound', nextState ? 'enabled' : 'disabled');
        if (nextState) {
            playOrderChime();
            toast.success('Suara bel notifikasi pesanan diaktifkan (Ding-Dong)');
        } else {
            toast.info('Suara bel notifikasi pesanan dinonaktifkan');
        }
    };

    // Modal State
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
    const [checkedAdminItems, setCheckedAdminItems] = useState<Record<string, boolean>>({});

    const [isSubmittingAction, setIsSubmittingAction] = useState(false);

    const toggleAdminItemCheck = (stage: string, itemId: number) => {
        const key = `${stage}_${itemId}`;
        setCheckedAdminItems((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    // Auto-Polling Real-Time untuk Admin (Tiap 3 Detik)
    const scheduleNextPoll = (delayMs = 3000) => {
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
        if (!isAutoSync) return;

        pollTimeoutRef.current = setTimeout(() => {
            if (isSubmittingAction || document.hidden) {
                scheduleNextPoll(2500);
                return;
            }

            setIsRefreshing(true);
            router.reload({
                only: ['orders', 'counts'],
                onFinish: () => {
                    setIsRefreshing(false);
                    scheduleNextPoll(3000);
                },
                onError: () => {
                    setIsRefreshing(false);
                    scheduleNextPoll(5000);
                },
            });
        }, delayMs);
    };

    useEffect(() => {
        scheduleNextPoll(3000);
        return () => {
            if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
        };
    }, [isAutoSync, filters]);

    // Respon instan saat Admin kembali ke tab browser (Auto Focus Re-sync)
    useEffect(() => {
        const handleVisibilityOrFocus = () => {
            if (!document.hidden && !isSubmittingAction && isAutoSync) {
                setIsRefreshing(true);
                router.reload({
                    only: ['orders', 'counts'],
                    onFinish: () => {
                        setIsRefreshing(false);
                        scheduleNextPoll(3000);
                    },
                    onError: () => {
                        setIsRefreshing(false);
                        scheduleNextPoll(5000);
                    },
                });
            }
        };

        window.addEventListener('focus', handleVisibilityOrFocus);
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
        return () => {
            window.removeEventListener('focus', handleVisibilityOrFocus);
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
        };
    }, [isAutoSync, isSubmittingAction]);

    // Deteksi pesanan baru saat polling berlangsung & bunyikan bel + tampilkan alert
    useEffect(() => {
        if (isFirstMountRef.current) {
            isFirstMountRef.current = false;
            orders.data.forEach((o) => knownOrderIdsRef.current.add(o.id));
            return;
        }

        const newIncoming = orders.data.filter(
            (o) =>
                !knownOrderIdsRef.current.has(o.id) &&
                (o.order_status === 'pending' || o.order_status === 'processing'),
        );

        if (newIncoming.length > 0) {
            if (soundEnabledRef.current) {
                playOrderChime();
            }
            newIncoming.forEach((o) => {
                toast.success(`🔔 Pesanan Baru Masuk! Meja ${o.table?.table_number ?? '00'}`, {
                    description: `${o.customer_name} • Total: ${formatRupiah(o.total_amount)}`,
                    duration: 6000,
                });
            });
        }

        orders.data.forEach((o) => knownOrderIdsRef.current.add(o.id));
    }, [orders.data]);

    const formatRupiah = (amount: number | string) => {
        const num = typeof amount === 'string' ? parseFloat(amount) || 0 : amount || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(num);
    };

    const handleFilterChange = (key: string, value: string) => {
        const newFilters = {
            ...filters,
            [key]: value,
        };
        router.get('/admin/orders', newFilters, {
            preserveState: true,
            preserveScroll: true,
        });
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleFilterChange('search', searchQuery);
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        router.reload({
            onFinish: () => {
                setIsRefreshing(false);
                toast.success('Data pesanan berhasil diperbarui.');
            },
        });
    };

    // Buka Modal Detail
    const openDetailModal = (order: Order) => {
        setSelectedOrder(order);
        setIsDetailModalOpen(true);
    };

    // Update Status Pesanan
    const handleUpdateStatus = (order: Order, newStatus: string) => {
        const activeItems = order.items.filter((it: any) => it.status !== 'rejected');
        const currentStage = order.order_status;
        const allChecked =
            activeItems.length > 0 &&
            activeItems.every((it) => checkedAdminItems[`${currentStage}_${it.id}`]);

        if (!allChecked) {
            toast.warning('Silakan ceklis semua menu di atas terlebih dahulu sebelum mengubah tahapan pesanan.');
            return;
        }

        if (newStatus === 'completed' && order.payment_status === 'unpaid') {
            toast.error('Tidak dapat menyelesaikan pesanan sebelum pembayaran lunas.');
            return;
        }

        setIsSubmittingAction(true);
        router.post(
            `/admin/orders/${order.id}/update-status`,
            { status: newStatus },
            {
                onSuccess: () => {
                    setIsSubmittingAction(false);
                    if (selectedOrder?.id === order.id) {
                        setSelectedOrder({ ...selectedOrder, order_status: newStatus as any });
                    }
                    toast.success(`Status pesanan ${order.order_number} diubah ke ${newStatus.toUpperCase()}`);
                },
                onError: (err) => {
                    setIsSubmittingAction(false);
                    toast.error(Object.values(err)[0] || 'Gagal mengubah status.');
                },
            }
        );
    };

    // Batalkan Pesanan
    const handleCancelOrder = (order: Order) => {
        if (!confirm(`Batalkan pesanan ${order.order_number}?`)) return;

        setIsSubmittingAction(true);
        router.delete(`/admin/orders/${order.id}`, {
            onSuccess: () => {
                setIsSubmittingAction(false);
                setIsDetailModalOpen(false);
                toast.success(`Pesanan ${order.order_number} telah dibatalkan.`);
            },
            onError: (err) => {
                setIsSubmittingAction(false);
                toast.error(Object.values(err)[0] || 'Gagal membatalkan pesanan.');
            },
        });
    };

    // Buka Modal Cetak Struk
    const openReceiptModal = (order: Order) => {
        setSelectedOrder(order);
        setIsReceiptModalOpen(true);
    };

    // Handler Cetak Struk Fisik
    const handlePrintReceipt = () => {
        window.print();
    };

    return (
        <>
            <Head title="Manajemen Pesanan Masuk (Admin)" />

            <div className="flex h-full flex-1 flex-col gap-5 p-4 md:p-8 bg-[#FAF6EC]/30">
                {/* Header Utama Admin */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#E8DFC8] pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black tracking-tight text-neutral-900">
                                Manajemen Pesanan Masuk
                            </h1>
                            <span className="bg-[#C52828] text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-2xs">
                                Panel Admin
                            </span>
                        </div>
                        <p className="text-xs text-neutral-600 mt-1">
                            Pusat kontrol dan monitoring seluruh transaksi meja scan QR maupun kasir SIDE LINE Cafe.
                        </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                        {/* Sound Toggle Indicator */}
                        <button
                            type="button"
                            onClick={toggleSound}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer ${
                                soundEnabled
                                    ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                                    : 'bg-neutral-100 border-neutral-300 text-neutral-500 hover:bg-neutral-200'
                            }`}
                            title={soundEnabled ? 'Suara Bel Aktif (Klik untuk tes/matikan)' : 'Aktifkan Suara Bel'}
                        >
                            {soundEnabled ? (
                                <Volume2 className="size-3.5 text-amber-600" />
                            ) : (
                                <VolumeX className="size-3.5 text-neutral-400" />
                            )}
                            <span>{soundEnabled ? 'Bel Aktif' : 'Bel Mati'}</span>
                        </button>

                        {/* Auto-Sync Toggle Indicator */}
                        <button
                            type="button"
                            onClick={() => setIsAutoSync(!isAutoSync)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 shadow-2xs transition-colors ${
                                isAutoSync
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'bg-neutral-100 border-neutral-300 text-neutral-500'
                            }`}
                            title={isAutoSync ? 'Jeda Sinkronisasi Otomatis' : 'Aktifkan Sinkronisasi Otomatis'}
                        >
                            <span className={`size-2 rounded-full ${isAutoSync ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
                            <span>{isAutoSync ? 'Auto-Sync Aktif' : 'Sync Dijeda'}</span>
                        </button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="bg-white border-[#DFCFA9] hover:bg-[#FAF5E8] text-neutral-800 text-xs font-bold gap-2"
                        >
                            <RefreshCw className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>

                        {/* Tombol Pintasan ke Layar Kasir / KDS Operasional */}
                        <Link
                            href="/cashier/orders"
                            target="_blank"
                            className="px-3.5 py-2 bg-[#18181B] hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-2xs transition-colors"
                            title="Buka layar KDS Kasir & Barista di tab baru"
                        >
                            <Store className="size-4 text-[#DFCFA9]" />
                            <span>Buka Layar Kasir / KDS</span>
                            <ExternalLink className="size-3 text-neutral-400" />
                        </Link>
                    </div>
                </div>

                {/* Ringkasan Metrik Hari Ini */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {/* Metrik 1: Total Masuk */}
                    <div className="bg-white border border-[#E8DFC8] rounded-xl p-3 shadow-2xs">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                            Pesanan Hari Ini
                        </span>
                        <div className="flex items-baseline justify-between mt-1">
                            <span className="text-xl font-black text-neutral-900">{counts.today_orders ?? counts.all}</span>
                            <ClipboardList className="size-4 text-neutral-400" />
                        </div>
                    </div>

                    {/* Metrik 2: Menunggu Bayar */}
                    <div className="bg-white border border-[#E8DFC8] rounded-xl p-3 shadow-2xs">
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                            Menunggu Bayar
                        </span>
                        <div className="flex items-baseline justify-between mt-1">
                            <span className="text-xl font-black text-amber-600">{counts.pending}</span>
                            <Clock className="size-4 text-amber-500" />
                        </div>
                    </div>

                    {/* Metrik 3: Sedang Diracik */}
                    <div className="bg-white border border-[#E8DFC8] rounded-xl p-3 shadow-2xs">
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                            Sedang Diracik
                        </span>
                        <div className="flex items-baseline justify-between mt-1">
                            <span className="text-xl font-black text-blue-600">{counts.processing}</span>
                            <Coffee className="size-4 text-blue-500" />
                        </div>
                    </div>

                    {/* Metrik 4: Siap Saji */}
                    <div className="bg-white border border-[#E8DFC8] rounded-xl p-3 shadow-2xs">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                            Siap Saji
                        </span>
                        <div className="flex items-baseline justify-between mt-1">
                            <span className="text-xl font-black text-emerald-600">{counts.ready}</span>
                            <CheckCircle2 className="size-4 text-emerald-500" />
                        </div>
                    </div>

                    {/* Metrik 5: Selesai */}
                    <div className="bg-white border border-[#E8DFC8] rounded-xl p-3 shadow-2xs">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                            Selesai Disajikan
                        </span>
                        <div className="flex items-baseline justify-between mt-1">
                            <span className="text-xl font-black text-neutral-700">{counts.completed}</span>
                            <UtensilsCrossed className="size-4 text-neutral-400" />
                        </div>
                    </div>

                    {/* Metrik 6: Pendapatan Hari Ini */}
                    <div className="bg-[#FAF5E8] border border-[#DFCFA9] rounded-xl p-3 shadow-2xs">
                        <span className="text-[10px] font-bold text-[#854D0E] uppercase tracking-wider block">
                            Omzet Hari Ini
                        </span>
                        <div className="flex items-baseline justify-between mt-1">
                            <span className="text-sm font-black text-neutral-900 truncate">
                                {formatRupiah(counts.today_revenue)}
                            </span>
                            <Wallet className="size-4 text-[#C52828]" />
                        </div>
                    </div>
                </div>

                {/* Filter & Toolbar Bar */}
                <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs space-y-3">
                    {/* Status Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                        {[
                            { key: 'all', label: 'Semua Status', count: counts.all },
                            { key: 'pending', label: 'Menunggu Bayar', count: counts.pending },
                            { key: 'processing', label: 'Sedang Diracik', count: counts.processing },
                            { key: 'ready', label: 'Siap Saji', count: counts.ready },
                            { key: 'completed', label: 'Selesai', count: counts.completed },
                            { key: 'cancelled', label: 'Dibatalkan', count: counts.cancelled },
                        ].map((tab) => {
                            const isActive = filters.status === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => handleFilterChange('status', tab.key)}
                                    className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 flex items-center gap-2 ${
                                        isActive
                                            ? 'bg-[#18181B] text-white shadow-2xs'
                                            : 'bg-[#FAF5E8] text-neutral-700 hover:bg-[#EFE5CF] border border-[#DFCFA9]'
                                    }`}
                                >
                                    <span>{tab.label}</span>
                                    <span
                                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                                            isActive
                                                ? 'bg-neutral-800 text-white'
                                                : 'bg-white text-neutral-800 border border-[#DFCFA9]'
                                        }`}
                                    >
                                        {tab.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Filter Baris Kedua: Pencarian, Tanggal, Pembayaran */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-neutral-100">
                        {/* Form Pencarian */}
                        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari No. Order, Meja, Nama..."
                                className="h-9 pl-9 pr-8 bg-[#FAF5E8] border-[#DFCFA9] text-xs rounded-xl focus:bg-white"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchQuery('');
                                        handleFilterChange('search', '');
                                    }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                                >
                                    <X className="size-3.5" />
                                </button>
                            )}
                        </form>

                        {/* Filter Tanggal & Pembayaran */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            {/* Filter Rentang Tanggal */}
                            <Select
                                value={filters.date}
                                onValueChange={(val) => handleFilterChange('date', val)}
                            >
                                <SelectTrigger className="h-9 text-xs bg-[#FAF5E8] border-[#DFCFA9] rounded-xl w-36 font-semibold">
                                    <Calendar className="size-3.5 mr-1.5 text-neutral-600" />
                                    <SelectValue placeholder="Waktu" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="today">Hari Ini</SelectItem>
                                    <SelectItem value="yesterday">Kemarin</SelectItem>
                                    <SelectItem value="this_week">Minggu Ini</SelectItem>
                                    <SelectItem value="this_month">Bulan Ini</SelectItem>
                                    <SelectItem value="all">Semua Waktu</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Filter Status Bayar */}
                            <Select
                                value={filters.payment}
                                onValueChange={(val) => handleFilterChange('payment', val)}
                            >
                                <SelectTrigger className="h-9 text-xs bg-[#FAF5E8] border-[#DFCFA9] rounded-xl w-36 font-semibold">
                                    <DollarSign className="size-3.5 mr-1.5 text-neutral-600" />
                                    <SelectValue placeholder="Bayar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Semua Bayar</SelectItem>
                                    <SelectItem value="paid">Lunas (Paid)</SelectItem>
                                    <SelectItem value="unpaid">Belum Bayar</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Tabel Daftar Pesanan Masuk */}
                <div className="bg-white border border-[#E8DFC8] rounded-2xl shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-[#FAF5E8] border-b border-[#E8DFC8] text-neutral-700 font-extrabold">
                                <tr>
                                    <th className="py-3.5 px-4">No. Order &amp; Waktu</th>
                                    <th className="py-3.5 px-4">Meja &amp; Pelanggan</th>
                                    <th className="py-3.5 px-4">Rincian Item Menu</th>
                                    <th className="py-3.5 px-4 text-right">Total Tagihan</th>
                                    <th className="py-3.5 px-4 text-center">Status Bayar</th>
                                    <th className="py-3.5 px-4 text-center">Status Pesanan</th>
                                    <th className="py-3.5 px-4 text-right">Aksi Kelola</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8DFC8]/60">
                                {orders.data.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-neutral-400">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <ClipboardList className="size-8 text-neutral-300" />
                                                <p className="text-xs font-semibold text-neutral-600">
                                                    {filters.date === 'today'
                                                        ? 'Belum ada pesanan masuk untuk Hari Ini.'
                                                        : 'Tidak ada data pesanan yang cocok dengan filter saat ini.'}
                                                </p>
                                                {filters.date === 'today' && (counts.yesterday_orders ?? 0) > 0 && (
                                                    <div className="flex flex-col sm:flex-row items-center gap-2 mt-2">
                                                        <span className="text-xs text-neutral-500">
                                                            Terdapat {counts.yesterday_orders} transaksi kemarin:
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleFilterChange('date', 'yesterday')}
                                                                className="px-3 py-1 bg-[#18181B] hover:bg-black text-white text-xs font-bold rounded-lg transition-colors shadow-2xs"
                                                            >
                                                                Lihat Pesanan Kemarin ({counts.yesterday_orders})
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleFilterChange('date', 'all')}
                                                                className="px-3 py-1 bg-white border border-[#DFCFA9] hover:bg-[#FAF5E8] text-neutral-800 text-xs font-bold rounded-lg transition-colors"
                                                            >
                                                                Lihat Semua Waktu ({counts.total_all_time})
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    orders.data.map((order) => {
                                        const activeOrderItems = order.items.filter((it) => it.status !== 'rejected');
                                        const sourceItems = activeOrderItems.length > 0 ? activeOrderItems : order.items;
                                        const itemsSummary = sourceItems
                                            .map((it) => {
                                                const optText =
                                                    it.options && it.options.length > 0
                                                        ? ` (${it.options.map((o) => o.option_name).join(', ')})`
                                                        : '';
                                                return `${it.quantity}x ${it.menu_name}${optText}`;
                                            })
                                            .join(', ');

                                        return (
                                            <tr
                                                key={order.id}
                                                className="hover:bg-[#FAF5E8]/40 transition-colors"
                                            >
                                                {/* No Order & Waktu */}
                                                <td className="py-3.5 px-4">
                                                    <div className="font-mono font-bold text-neutral-900 text-xs">
                                                        {order.order_number}
                                                    </div>
                                                    <div className="text-[10px] text-neutral-500 font-medium flex items-center gap-1 mt-0.5">
                                                        <Clock className="size-3" />
                                                        {new Date(order.created_at).toLocaleTimeString('id-ID', {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}{' '}
                                                        WIB
                                                    </div>
                                                </td>

                                                {/* Meja & Pelanggan */}
                                                <td className="py-3.5 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="size-6 rounded-md bg-[#FAF5E8] border border-[#DFCFA9] text-neutral-900 font-black text-[11px] flex items-center justify-center">
                                                            {order.table?.table_number ?? '00'}
                                                        </span>
                                                        <div>
                                                            <div className="font-bold text-neutral-900">
                                                                {order.customer_name}
                                                            </div>
                                                            <div className="text-[10px] text-neutral-500">
                                                                Meja {order.table?.table_number ?? 'Bebas'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Rincian Menu */}
                                                <td className="py-3.5 px-4 max-w-xs">
                                                    <p className="font-medium text-neutral-800 line-clamp-1">
                                                        {itemsSummary}
                                                    </p>
                                                    {order.notes && (
                                                        <p className="text-[10px] text-amber-700 italic mt-0.5 truncate">
                                                            "{order.notes}"
                                                        </p>
                                                    )}
                                                </td>

                                                {/* Total Tagihan */}
                                                <td className="py-3.5 px-4 text-right font-mono font-extrabold text-neutral-900">
                                                    {formatRupiah(order.total_amount)}
                                                </td>

                                                {/* Status Pembayaran */}
                                                <td className="py-3.5 px-4 text-center">
                                                    {order.payment_status === 'paid' ? (
                                                        <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 font-bold text-[10px]">
                                                            Lunas ({order.payment_method?.toUpperCase() || 'TUNAI'})
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-amber-500/15 text-amber-800 border-amber-500/30 font-bold text-[10px]">
                                                            Belum Bayar
                                                        </Badge>
                                                    )}
                                                </td>

                                                {/* Status Pesanan */}
                                                <td className="py-3.5 px-4 text-center">
                                                    {order.order_status === 'pending' && (
                                                        <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                            PENDING
                                                        </span>
                                                    )}
                                                    {order.order_status === 'processing' && (
                                                        <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                            DIRACIK
                                                        </span>
                                                    )}
                                                    {order.order_status === 'ready' && (
                                                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                            SIAP SAJI
                                                        </span>
                                                    )}
                                                    {order.order_status === 'completed' && (
                                                        <span className="bg-neutral-100 text-neutral-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                            SELESAI
                                                        </span>
                                                    )}
                                                    {order.order_status === 'cancelled' && (
                                                        <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                            BATAL
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Tombol Aksi (Monitoring & Struk) */}
                                                <td className="py-3.5 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {/* Tombol Detail Pesanan */}
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => openDetailModal(order)}
                                                            className="h-7 px-2.5 bg-white border-[#DFCFA9] hover:bg-[#FAF5E8] text-neutral-800 text-[11px] font-bold rounded-lg"
                                                            title="Buka rincian pesanan"
                                                        >
                                                            <Eye className="size-3 mr-1" />
                                                            Detail
                                                        </Button>

                                                        {/* Tombol Cetak Struk */}
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => openReceiptModal(order)}
                                                            className="size-7 p-0 text-neutral-600 hover:text-neutral-900 hover:bg-[#FAF5E8]"
                                                            title="Cetak Struk Transaksi"
                                                        >
                                                            <Printer className="size-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Footer */}
                    {orders.links.length > 3 && (
                        <div className="p-3 bg-[#FAF5E8]/40 border-t border-[#E8DFC8] flex items-center justify-between text-xs text-neutral-600">
                            <span>
                                Menampilkan {orders.data.length} dari {orders.total} total pesanan
                            </span>
                            <div className="flex items-center gap-1">
                                {orders.links.map((link, idx) => {
                                    if (!link.url) {
                                        return (
                                            <span
                                                key={idx}
                                                dangerouslySetInnerHTML={{ __html: link.label }}
                                                className="px-2.5 py-1 text-neutral-400 text-xs"
                                            />
                                        );
                                    }
                                    return (
                                        <Link
                                            key={idx}
                                            href={link.url}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                                link.active
                                                    ? 'bg-[#18181B] text-white'
                                                    : 'bg-white border border-[#DFCFA9] text-neutral-700 hover:bg-[#EFE5CF]'
                                            }`}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL 1: DETAIL PESANAN & AUDIT TRAIL */}
            <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                    {selectedOrder && (
                        <div className="space-y-4">
                            <DialogHeader>
                                <div className="flex items-center justify-between">
                                    <DialogTitle className="text-lg font-black text-neutral-900">
                                        Detail Pesanan #{selectedOrder.order_number}
                                    </DialogTitle>
                                    <Badge className="font-mono text-xs">
                                        Meja {selectedOrder.table?.table_number ?? 'Bebas'}
                                    </Badge>
                                </div>
                                <DialogDescription className="text-xs text-neutral-500">
                                    Pemesan: <strong className="text-neutral-800">{selectedOrder.customer_name}</strong> •{' '}
                                    {new Date(selectedOrder.created_at).toLocaleString('id-ID')}
                                </DialogDescription>
                            </DialogHeader>

                            {/* Daftar Item Pesanan */}
                            {(() => {
                                const activeModalItems = selectedOrder.items.filter(
                                    (it: any) => it.status !== 'rejected'
                                );
                                const currentStage = selectedOrder.order_status;
                                const isInteractiveStage =
                                    currentStage === 'pending' ||
                                    currentStage === 'processing' ||
                                    currentStage === 'ready';
                                const checkedModalCount = activeModalItems.filter(
                                    (it) => checkedAdminItems[`${currentStage}_${it.id}`]
                                ).length;
                                const allModalItemsChecked =
                                    activeModalItems.length > 0 &&
                                    activeModalItems.every(
                                        (it) => checkedAdminItems[`${currentStage}_${it.id}`]
                                    );

                                return (
                                    <>
                                        <div className="space-y-2 border-y border-neutral-100 py-3">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-bold text-neutral-700">
                                                    Daftar Produk Pesanan:
                                                </h4>
                                                {isInteractiveStage && (
                                                    <span className="text-[11px] font-bold text-amber-900 bg-[#FFFDF5] border border-[#F5E4B3] px-2 py-0.5 rounded-full">
                                                        {checkedModalCount} dari {activeModalItems.length} siap
                                                    </span>
                                                )}
                                            </div>
                                            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                                {selectedOrder.items.map((item: any) => {
                                                    const isRejected = item.status === 'rejected';
                                                    const isChecked =
                                                        !!checkedAdminItems[`${currentStage}_${item.id}`];

                                                    return (
                                                        <div
                                                            key={item.id}
                                                            onClick={() => {
                                                                if (isInteractiveStage && !isRejected) {
                                                                    toggleAdminItemCheck(currentStage, item.id);
                                                                }
                                                            }}
                                                            className={`p-2.5 bg-[#FAF5E8]/60 border border-[#E8DFC8]/60 rounded-xl text-xs space-y-1 ${
                                                                isInteractiveStage && !isRejected
                                                                    ? 'cursor-pointer select-none hover:border-[#C52828]/40 transition-colors'
                                                                    : ''
                                                            }`}
                                                        >
                                                            <div className="flex items-start justify-between gap-2 font-bold text-neutral-900">
                                                                <div className="flex items-start gap-2">
                                                                    {isInteractiveStage && !isRejected && (
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isChecked}
                                                                            onChange={() => {}}
                                                                            className="size-4 mt-0.5 rounded border-neutral-300 text-[#C52828] focus:ring-0 cursor-pointer"
                                                                        />
                                                                    )}
                                                                    <span
                                                                        className={
                                                                            isRejected
                                                                                ? 'line-through text-rose-400'
                                                                                : isInteractiveStage && isChecked
                                                                                  ? 'line-through text-neutral-400'
                                                                                  : ''
                                                                        }
                                                                    >
                                                                        {item.quantity}x {item.menu_name}
                                                                    </span>
                                                                </div>
                                                                <span className="font-mono">
                                                                    {formatRupiah(item.total_price)}
                                                                </span>
                                                            </div>
                                                            {item.options.length > 0 && (
                                                                <div className="text-[11px] text-neutral-500 pl-6">
                                                                    {item.options.map((opt: any) => (
                                                                        <span key={opt.id} className="block">
                                                                            + {opt.group_name}: {opt.option_name}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {item.customer_notes && (
                                                                <p className="text-[10px] text-amber-700 italic pl-6">
                                                                    "{item.customer_notes}"
                                                                </p>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Ringkasan Biaya */}
                                        <div className="p-3 bg-[#FAF5E8] border border-[#DFCFA9] rounded-xl text-xs space-y-1.5">
                                            <div className="flex justify-between text-neutral-600">
                                                <span>Subtotal:</span>
                                                <span className="font-mono">{formatRupiah(selectedOrder.subtotal)}</span>
                                            </div>
                                            <div className="flex justify-between font-extrabold text-sm text-neutral-900 pt-1 border-t border-[#DFCFA9]">
                                                <span>Total Akhir:</span>
                                                <span className="font-mono text-[#C52828]">
                                                    {formatRupiah(selectedOrder.total_amount)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-[11px] text-neutral-500 pt-0.5">
                                                <span>Status Pembayaran:</span>
                                                <span className="font-bold uppercase text-neutral-800">
                                                    {selectedOrder.payment_status} ({selectedOrder.payment_method || 'Tunai'})
                                                </span>
                                            </div>
                                        </div>

                                        {/* Alur Aksi Cepat Administrator */}
                                        <div className="space-y-2 pt-1">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-bold text-neutral-700">
                                                    Ubah Tahapan Pesanan:
                                                </h4>
                                                {isInteractiveStage && !allModalItemsChecked && (
                                                    <span className="text-[10px] font-semibold text-[#C52828]">
                                                        * Ceklis semua menu di atas terlebih dahulu
                                                    </span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={
                                                        selectedOrder.order_status !== 'pending' ||
                                                        !allModalItemsChecked ||
                                                        isSubmittingAction
                                                    }
                                                    onClick={() => handleUpdateStatus(selectedOrder, 'processing')}
                                                    className="text-[11px] font-bold bg-[#FAF5E8] border-[#DFCFA9] hover:bg-[#EFE5CF]"
                                                >
                                                    Proses Racik
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={
                                                        selectedOrder.order_status !== 'processing' ||
                                                        !allModalItemsChecked ||
                                                        isSubmittingAction
                                                    }
                                                    onClick={() => handleUpdateStatus(selectedOrder, 'ready')}
                                                    className="text-[11px] font-bold bg-[#FAF5E8] border-[#DFCFA9] hover:bg-[#EFE5CF]"
                                                >
                                                    Tandai Siap Saji
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={
                                                        selectedOrder.order_status !== 'ready' ||
                                                        !allModalItemsChecked ||
                                                        selectedOrder.payment_status === 'unpaid' ||
                                                        isSubmittingAction
                                                    }
                                                    onClick={() => handleUpdateStatus(selectedOrder, 'completed')}
                                                    className="text-[11px] font-bold bg-[#FAF5E8] border-[#DFCFA9] hover:bg-[#EFE5CF]"
                                                >
                                                    Tandai Selesai
                                                </Button>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}

                            <DialogFooter className="flex sm:justify-between items-center gap-2 pt-3 border-t">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => handleCancelOrder(selectedOrder)}
                                    disabled={isSubmittingAction || selectedOrder.order_status === 'cancelled'}
                                    className="text-rose-600 hover:bg-rose-50 text-xs font-bold"
                                >
                                    Batalkan Pesanan
                                </Button>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsDetailModalOpen(false)}
                                    >
                                        Tutup
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            setIsDetailModalOpen(false);
                                            openReceiptModal(selectedOrder);
                                        }}
                                        className="gap-1.5"
                                    >
                                        <Printer className="size-3.5" /> Cetak Struk
                                    </Button>
                                </div>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* MODAL CETAK STRUK THERMAL */}
            <Dialog open={isReceiptModalOpen} onOpenChange={setIsReceiptModalOpen}>
                <DialogContent className="sm:max-w-sm">
                    {selectedOrder && (
                        <div className="space-y-3">
                            <DialogHeader>
                                <DialogTitle className="text-sm">Cetak Struk Pembayaran</DialogTitle>
                            </DialogHeader>

                            {/* Tampilan Struk Kasir Cetak */}
                            <div
                                id="printable-admin-receipt"
                                className="bg-[#FAFDF9] p-4 border border-dashed border-neutral-300 rounded-lg text-xs font-mono space-y-2 text-neutral-800"
                            >
                                <div className="text-center pb-2 border-b border-dashed">
                                    <h3 className="font-bold text-sm tracking-widest">SIDE LINE CAFE</h3>
                                    <p className="text-[10px] text-gray-500">Jl. Kaliurang KM 5, Yogyakarta</p>
                                    <p className="text-[10px] text-gray-500">Telp: 0812-3456-7890</p>
                                </div>

                                <div className="space-y-0.5 text-[11px] pb-2 border-b border-dashed">
                                    <div className="flex justify-between">
                                        <span>No Order:</span>
                                        <span className="font-bold">{selectedOrder.order_number}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Meja / Cust:</span>
                                        <span>
                                            Meja {selectedOrder.table?.table_number ?? '00'} ({selectedOrder.customer_name})
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Waktu:</span>
                                        <span>{new Date(selectedOrder.created_at).toLocaleString('id-ID')}</span>
                                    </div>
                                </div>

                                {/* Items List */}
                                <div className="py-1 space-y-1.5 border-b border-dashed">
                                    {selectedOrder.items.map((it) => (
                                        <div key={it.id} className="space-y-0.5">
                                            <div className="flex justify-between font-bold">
                                                <span>
                                                    {it.quantity}x {it.menu_name}
                                                </span>
                                                <span>{formatRupiah(it.total_price)}</span>
                                            </div>
                                            {it.options.map((opt) => (
                                                <div key={opt.id} className="flex justify-between text-[10px] text-gray-500 pl-2">
                                                    <span>+ {opt.option_name}</span>
                                                    <span>{parseFloat(opt.additional_price) > 0 ? formatRupiah(opt.additional_price) : ''}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>

                                {/* Total Tagihan */}
                                <div className="space-y-1 text-[11px] border-b pb-2">
                                    <div className="flex justify-between font-extrabold text-xs pt-1">
                                        <span>TOTAL:</span>
                                        <span>{formatRupiah(selectedOrder.total_amount)}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                        <span>Metode:</span>
                                        <span className="uppercase">
                                            {selectedOrder.payment_method || 'Tunai'} ({selectedOrder.payment_status.toUpperCase()})
                                        </span>
                                    </div>
                                </div>

                                <div className="text-center text-[10px] text-gray-500 pt-1">
                                    <p>Terima Kasih Atas Kunjungan Anda!</p>
                                </div>
                            </div>

                            <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t">
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

AdminOrdersIndex.layout = {
    breadcrumbs: [
        {
            title: 'SIDEORDER',
            href: '/dashboard',
        },
        {
            title: 'Pesanan Masuk (Admin)',
            href: '/admin/orders',
        },
    ] as BreadcrumbItem[],
};
