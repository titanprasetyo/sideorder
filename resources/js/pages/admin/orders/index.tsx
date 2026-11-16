import { Head, Link, router } from '@inertiajs/react';
import {
    Calendar,
    Check,
    CheckCircle2,
    ClipboardList,
    Clock,
    Coffee,
    DollarSign,
    ExternalLink,
    Eye,
    Printer,
    RefreshCw,
    Search,
    Sparkles,
    Store,
    UtensilsCrossed,
    Volume2,
    VolumeX,
    Wallet,
    X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
    ConfirmDialog,
    FormDialogHeader,
    StandeeModalCard,
} from '@/components/admin/admin-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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
    order_status:
        | 'pending'
        | 'processing'
        | 'ready'
        | 'completed'
        | 'cancelled';
    payment_status: 'unpaid' | 'paid' | 'failed';
    payment_method: string | null;
    payment_gateway?: string | null;
    payment_channel?: string | null;
    payment_reference?: string | null;
    settled_amount?: number;
    unpaid_balance?: number;
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

export default function AdminOrdersIndex({
    orders: initialOrders,
    counts: initialCounts,
    filters,
}: Props) {
    const [orders, setOrders] = useState(initialOrders);
    const [counts, setCounts] = useState(initialCounts);
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isAutoSync, setIsAutoSync] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(() => {
        return typeof window !== 'undefined'
            ? localStorage.getItem('sideline_cashier_sound') !== 'disabled'
            : true;
    });

    useEffect(() => {
        setOrders(initialOrders);
        setCounts(initialCounts);
    }, [initialOrders, initialCounts]);

    // Refs untuk auto-polling & notifikasi pesanan masuk
    const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isSyncingRef = useRef(false);
    const isFirstMountRef = useRef(true);
    const knownOrderIdsRef = useRef<Set<number>>(
        new Set(initialOrders.data.map((o) => o.id)),
    );
    const soundEnabledRef = useRef<boolean>(soundEnabled);

    useEffect(() => {
        soundEnabledRef.current = soundEnabled;
    }, [soundEnabled]);

    const toggleSound = () => {
        unlockAudioContext();
        const nextState = !soundEnabled;
        setSoundEnabled(nextState);
        localStorage.setItem(
            'sideline_cashier_sound',
            nextState ? 'enabled' : 'disabled',
        );
        if (nextState) {
            playOrderChime();
            toast.success(
                'Suara bel notifikasi pesanan diaktifkan (Ding-Dong)',
            );
        } else {
            toast.info('Suara bel notifikasi pesanan dinonaktifkan');
        }
    };

    // Modal State
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
    const [checkedAdminItems, setCheckedAdminItems] = useState<
        Record<string, boolean>
    >({});

    const [isSubmittingAction, setIsSubmittingAction] = useState(false);

    const toggleAdminItemCheck = (stage: string, itemId: number) => {
        const key = `${stage}_${itemId}`;
        setCheckedAdminItems((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    // Sinkronisasi di latar belakang via fetch() (TIDAK memakai router.reload agar klik navigasi Sidebar tidak terbatalkan)
    const runBackgroundSync = async (isManual = false) => {
        if (isSyncingRef.current || isSubmittingAction) return;
        isSyncingRef.current = true;
        if (isManual) setIsRefreshing(true);

        try {
            const params = new URLSearchParams();
            if (filters.status) params.set('status', filters.status);
            if (filters.payment) params.set('payment', filters.payment);
            if (filters.date) params.set('date', filters.date);
            if (filters.search) params.set('search', filters.search);
            if (orders.current_page > 1)
                params.set('page', String(orders.current_page));

            const res = await fetch(`/admin/orders/sync?${params.toString()}`, {
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });

            if (res.ok) {
                const data = await res.json();
                if (data?.orders) setOrders(data.orders);
                if (data?.counts) setCounts(data.counts);
            }
        } catch {
            // Abaikan gangguan jaringan sementara saat background sync
        } finally {
            isSyncingRef.current = false;
            if (isManual) setIsRefreshing(false);
        }
    };

    // Auto-Polling Real-Time untuk Admin (Tiap 5 Detik via lightweight JSON fetch)
    const scheduleNextPoll = (delayMs = 5000) => {
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
        if (!isAutoSync) return;

        pollTimeoutRef.current = setTimeout(async () => {
            if (isSubmittingAction || document.hidden) {
                scheduleNextPoll(4000);
                return;
            }

            await runBackgroundSync(false);
            scheduleNextPoll(5000);
        }, delayMs);
    };

    useEffect(() => {
        scheduleNextPoll(5000);
        return () => {
            if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
        };
    }, [isAutoSync, filters, orders.current_page]);

    // Respon instan saat Admin kembali ke tab browser (Auto Focus Re-sync)
    useEffect(() => {
        const handleVisibilityOrFocus = () => {
            if (!document.hidden && !isSubmittingAction && isAutoSync) {
                runBackgroundSync(false);
            }
        };

        window.addEventListener('focus', handleVisibilityOrFocus);
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
        return () => {
            window.removeEventListener('focus', handleVisibilityOrFocus);
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityOrFocus,
            );
        };
    }, [isAutoSync, isSubmittingAction, filters, orders.current_page]);

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
                (o.order_status === 'pending' ||
                    o.order_status === 'processing'),
        );

        if (newIncoming.length > 0) {
            if (soundEnabledRef.current) {
                playOrderChime();
            }
            newIncoming.forEach((o) => {
                toast.success(
                    `🔔 Pesanan Baru Masuk! Meja ${o.table?.table_number ?? '00'}`,
                    {
                        description: `${o.customer_name} • Total: ${formatRupiah(o.total_amount)}`,
                        duration: 6000,
                    },
                );
            });
        }

        orders.data.forEach((o) => knownOrderIdsRef.current.add(o.id));
    }, [orders.data]);

    const formatRupiah = (amount: number | string) => {
        const num =
            typeof amount === 'string' ? parseFloat(amount) || 0 : amount || 0;
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
        const activeItems = order.items.filter(
            (it: any) => it.status !== 'rejected',
        );
        const currentStage = order.order_status;
        const allChecked =
            activeItems.length > 0 &&
            activeItems.every(
                (it) => checkedAdminItems[`${currentStage}_${it.id}`],
            );

        if (!allChecked) {
            toast.warning(
                'Silakan ceklis semua menu di atas terlebih dahulu sebelum mengubah tahapan pesanan.',
            );
            return;
        }

        if (newStatus === 'completed' && order.payment_status === 'unpaid') {
            toast.error(
                'Tidak dapat menyelesaikan pesanan sebelum pembayaran lunas.',
            );
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
                        setSelectedOrder({
                            ...selectedOrder,
                            order_status: newStatus as any,
                        });
                    }
                    toast.success(
                        `Status pesanan ${order.order_number} diubah ke ${newStatus.toUpperCase()}`,
                    );
                },
                onError: (err) => {
                    setIsSubmittingAction(false);
                    toast.error(
                        Object.values(err)[0] || 'Gagal mengubah status.',
                    );
                },
            },
        );
    };

    // Batalkan Pesanan (hanya pesanan belum dibayar)
    const handleCancelOrder = (order: Order) => {
        const isSettled =
            order.payment_status === 'paid' ||
            Number(order.settled_amount ?? 0) > 0;
        if (isSettled) {
            toast.error(
                `Pesanan ${order.order_number} sudah dibayar dan tidak dapat dibatalkan.`,
            );
            return;
        }

        setOrderToCancel(order);
    };

    const confirmCancelOrder = () => {
        if (!orderToCancel) return;

        setIsSubmittingAction(true);
        router.delete(`/admin/orders/${orderToCancel.id}`, {
            onSuccess: () => {
                setIsSubmittingAction(false);
                setOrderToCancel(null);
                setIsDetailModalOpen(false);
                toast.success(
                    `Pesanan ${orderToCancel.order_number} telah dibatalkan.`,
                );
            },
            onError: (err) => {
                setIsSubmittingAction(false);
                toast.error(
                    Object.values(err)[0] || 'Gagal membatalkan pesanan.',
                );
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

            <div className="flex h-full flex-1 flex-col gap-5 bg-[#FAF6EC]/30 p-4 md:p-8">
                {/* Header Utama Admin */}
                <div className="flex flex-col gap-4 border-b border-[#E8DFC8] pb-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black tracking-tight text-neutral-900 sm:text-2xl">
                                Manajemen Pesanan Masuk
                            </h1>
                            <span className="rounded-full bg-[#C52828] px-2 py-0.5 text-[11px] font-bold text-white shadow-2xs">
                                Panel Admin
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-neutral-600">
                            Pusat kontrol dan monitoring seluruh transaksi meja
                            scan QR maupun kasir SIDE LINE Cafe.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                        {/* Sound Toggle Indicator */}
                        <button
                            type="button"
                            onClick={toggleSound}
                            className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold shadow-2xs transition-colors ${
                                soundEnabled
                                    ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                    : 'border-neutral-300 bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                            }`}
                            title={
                                soundEnabled
                                    ? 'Suara Bel Aktif (Klik untuk tes/matikan)'
                                    : 'Aktifkan Suara Bel'
                            }
                        >
                            {soundEnabled ? (
                                <Volume2 className="size-3.5 text-amber-600" />
                            ) : (
                                <VolumeX className="size-3.5 text-neutral-400" />
                            )}
                            <span>
                                {soundEnabled ? 'Bel Aktif' : 'Bel Mati'}
                            </span>
                        </button>

                        {/* Auto-Sync Toggle Indicator */}
                        <button
                            type="button"
                            onClick={() => setIsAutoSync(!isAutoSync)}
                            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold shadow-2xs transition-colors ${
                                isAutoSync
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : 'border-neutral-300 bg-neutral-100 text-neutral-500'
                            }`}
                            title={
                                isAutoSync
                                    ? 'Jeda Sinkronisasi Otomatis'
                                    : 'Aktifkan Sinkronisasi Otomatis'
                            }
                        >
                            <span
                                className={`size-2 rounded-full ${isAutoSync ? 'animate-pulse bg-emerald-500' : 'bg-neutral-400'}`}
                            />
                            <span>
                                {isAutoSync ? 'Auto-Sync' : 'Sync Dijeda'}
                            </span>
                        </button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="cursor-pointer gap-2 border-[#DFCFA9] bg-white text-xs font-bold text-neutral-800 hover:bg-[#FAF5E8]"
                        >
                            <RefreshCw
                                className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                            />
                            Refresh
                        </Button>

                        {/* Tombol Pintasan ke Layar Kasir / KDS Operasional */}
                        <Link
                            href="/cashier/orders"
                            target="_blank"
                            className="flex shrink-0 items-center gap-2 rounded-xl bg-[#18181B] px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-black"
                            title="Buka layar KDS Kasir & Barista di tab baru"
                        >
                            <Store className="size-4 text-[#DFCFA9]" />
                            <span>Buka Kasir / KDS</span>
                            <ExternalLink className="size-3 text-neutral-400" />
                        </Link>
                    </div>
                </div>

                {/* Ringkasan Metrik Hari Ini */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {/* Metrik 1: Total Masuk */}
                    <div className="rounded-xl border border-[#E8DFC8] bg-white p-3 shadow-2xs">
                        <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                            Pesanan Hari Ini
                        </span>
                        <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-xl font-black text-neutral-900">
                                {counts.today_orders ?? counts.all}
                            </span>
                            <ClipboardList className="size-4 text-neutral-400" />
                        </div>
                    </div>

                    {/* Metrik 2: Menunggu Bayar */}
                    <div className="rounded-xl border border-[#E8DFC8] bg-white p-3 shadow-2xs">
                        <span className="block text-[10px] font-bold tracking-wider text-amber-700 uppercase">
                            Menunggu Bayar
                        </span>
                        <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-xl font-black text-amber-600">
                                {counts.pending}
                            </span>
                            <Clock className="size-4 text-amber-500" />
                        </div>
                    </div>

                    {/* Metrik 3: Sedang Diracik */}
                    <div className="rounded-xl border border-[#E8DFC8] bg-white p-3 shadow-2xs">
                        <span className="block text-[10px] font-bold tracking-wider text-blue-700 uppercase">
                            Sedang Diracik
                        </span>
                        <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-xl font-black text-blue-600">
                                {counts.processing}
                            </span>
                            <Coffee className="size-4 text-blue-500" />
                        </div>
                    </div>

                    {/* Metrik 4: Siap Saji */}
                    <div className="rounded-xl border border-[#E8DFC8] bg-white p-3 shadow-2xs">
                        <span className="block text-[10px] font-bold tracking-wider text-emerald-700 uppercase">
                            Siap Saji
                        </span>
                        <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-xl font-black text-emerald-600">
                                {counts.ready}
                            </span>
                            <CheckCircle2 className="size-4 text-emerald-500" />
                        </div>
                    </div>

                    {/* Metrik 5: Selesai */}
                    <div className="rounded-xl border border-[#E8DFC8] bg-white p-3 shadow-2xs">
                        <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                            Selesai Disajikan
                        </span>
                        <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-xl font-black text-neutral-700">
                                {counts.completed}
                            </span>
                            <UtensilsCrossed className="size-4 text-neutral-400" />
                        </div>
                    </div>

                    {/* Metrik 6: Pendapatan Hari Ini */}
                    <div className="rounded-xl border border-[#DFCFA9] bg-[#FAF5E8] p-3 shadow-2xs">
                        <span className="block text-[10px] font-bold tracking-wider text-[#854D0E] uppercase">
                            Omzet Hari Ini
                        </span>
                        <div className="mt-1 flex items-baseline justify-between">
                            <span className="truncate text-sm font-black text-neutral-900">
                                {formatRupiah(counts.today_revenue)}
                            </span>
                            <Wallet className="size-4 text-[#C52828]" />
                        </div>
                    </div>
                </div>

                {/* Filter & Toolbar Bar */}
                <div className="space-y-3 rounded-2xl border border-[#E8DFC8] bg-white p-4 shadow-xs">
                    {/* Status Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                        {[
                            {
                                key: 'all',
                                label: 'Semua Status',
                                count: counts.all,
                            },
                            {
                                key: 'pending',
                                label: 'Menunggu Bayar',
                                count: counts.pending,
                            },
                            {
                                key: 'processing',
                                label: 'Sedang Diracik',
                                count: counts.processing,
                            },
                            {
                                key: 'ready',
                                label: 'Siap Saji',
                                count: counts.ready,
                            },
                            {
                                key: 'completed',
                                label: 'Selesai',
                                count: counts.completed,
                            },
                            {
                                key: 'cancelled',
                                label: 'Dibatalkan',
                                count: counts.cancelled,
                            },
                        ].map((tab) => {
                            const isActive = filters.status === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() =>
                                        handleFilterChange('status', tab.key)
                                    }
                                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 font-bold transition-all ${
                                        isActive
                                            ? 'bg-[#18181B] text-white shadow-2xs'
                                            : 'border border-[#DFCFA9] bg-[#FAF5E8] text-neutral-700 hover:bg-[#EFE5CF]'
                                    }`}
                                >
                                    <span>{tab.label}</span>
                                    <span
                                        className={`py-0.2 rounded-full px-1.5 text-[10px] font-black ${
                                            isActive
                                                ? 'bg-neutral-800 text-white'
                                                : 'border border-[#DFCFA9] bg-white text-neutral-800'
                                        }`}
                                    >
                                        {tab.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Filter Baris Kedua: Pencarian, Tanggal, Pembayaran */}
                    <div className="flex flex-col items-center justify-between gap-3 border-t border-neutral-100 pt-2 sm:flex-row">
                        {/* Form Pencarian */}
                        <form
                            onSubmit={handleSearchSubmit}
                            className="relative w-full sm:w-80"
                        >
                            <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-neutral-400" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari No. Order, Meja, Nama..."
                                className="h-9 rounded-xl border-[#DFCFA9] bg-[#FAF5E8] pr-8 pl-9 text-xs focus:bg-white"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchQuery('');
                                        handleFilterChange('search', '');
                                    }}
                                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                                >
                                    <X className="size-3.5" />
                                </button>
                            )}
                        </form>

                        {/* Filter Tanggal & Pembayaran */}
                        <div className="flex w-full items-center gap-2 sm:w-auto">
                            {/* Filter Rentang Tanggal */}
                            <Select
                                value={filters.date}
                                onValueChange={(val) =>
                                    handleFilterChange('date', val)
                                }
                            >
                                <SelectTrigger className="h-9 w-36 rounded-xl border-[#DFCFA9] bg-[#FAF5E8] text-xs font-semibold">
                                    <Calendar className="mr-1.5 size-3.5 text-neutral-600" />
                                    <SelectValue placeholder="Waktu" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="today">
                                        Hari Ini
                                    </SelectItem>
                                    <SelectItem value="yesterday">
                                        Kemarin
                                    </SelectItem>
                                    <SelectItem value="this_week">
                                        Minggu Ini
                                    </SelectItem>
                                    <SelectItem value="this_month">
                                        Bulan Ini
                                    </SelectItem>
                                    <SelectItem value="all">
                                        Semua Waktu
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Filter Status Bayar */}
                            <Select
                                value={filters.payment}
                                onValueChange={(val) =>
                                    handleFilterChange('payment', val)
                                }
                            >
                                <SelectTrigger className="h-9 w-36 rounded-xl border-[#DFCFA9] bg-[#FAF5E8] text-xs font-semibold">
                                    <DollarSign className="mr-1.5 size-3.5 text-neutral-600" />
                                    <SelectValue placeholder="Bayar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        Semua Bayar
                                    </SelectItem>
                                    <SelectItem value="paid">
                                        Lunas (Paid)
                                    </SelectItem>
                                    <SelectItem value="unpaid">
                                        Belum Bayar
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Tabel Daftar Pesanan Masuk */}
                <div className="overflow-hidden rounded-2xl border border-[#E8DFC8] bg-white shadow-xs">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[850px] text-left text-xs">
                            <thead className="border-b border-[#E8DFC8] bg-[#FAF5E8] font-extrabold text-neutral-700">
                                <tr>
                                    <th className="px-4 py-3.5 whitespace-nowrap">
                                        No. Order &amp; Waktu
                                    </th>
                                    <th className="px-4 py-3.5 whitespace-nowrap">
                                        Meja &amp; Pelanggan
                                    </th>
                                    <th className="px-4 py-3.5">
                                        Rincian Item Menu
                                    </th>
                                    <th className="px-4 py-3.5 text-right whitespace-nowrap">
                                        Total Tagihan
                                    </th>
                                    <th className="px-4 py-3.5 text-center whitespace-nowrap">
                                        Status Bayar
                                    </th>
                                    <th className="px-4 py-3.5 text-center whitespace-nowrap">
                                        Status Pesanan
                                    </th>
                                    <th className="px-4 py-3.5 text-right whitespace-nowrap">
                                        Aksi Kelola
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8DFC8]/60">
                                {orders.data.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={7}
                                            className="py-12 text-center text-neutral-400"
                                        >
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <ClipboardList className="size-8 text-neutral-300" />
                                                <p className="text-xs font-semibold text-neutral-600">
                                                    {filters.date === 'today'
                                                        ? 'Belum ada pesanan masuk untuk Hari Ini.'
                                                        : 'Tidak ada data pesanan yang cocok dengan filter saat ini.'}
                                                </p>
                                                {filters.date === 'today' &&
                                                    (counts.yesterday_orders ??
                                                        0) > 0 && (
                                                        <div className="mt-2 flex flex-col items-center gap-2 sm:flex-row">
                                                            <span className="text-xs text-neutral-500">
                                                                Terdapat{' '}
                                                                {
                                                                    counts.yesterday_orders
                                                                }{' '}
                                                                transaksi
                                                                kemarin:
                                                            </span>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        handleFilterChange(
                                                                            'date',
                                                                            'yesterday',
                                                                        )
                                                                    }
                                                                    className="rounded-lg bg-[#18181B] px-3 py-1 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-black"
                                                                >
                                                                    Lihat
                                                                    Pesanan
                                                                    Kemarin (
                                                                    {
                                                                        counts.yesterday_orders
                                                                    }
                                                                    )
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        handleFilterChange(
                                                                            'date',
                                                                            'all',
                                                                        )
                                                                    }
                                                                    className="rounded-lg border border-[#DFCFA9] bg-white px-3 py-1 text-xs font-bold text-neutral-800 transition-colors hover:bg-[#FAF5E8]"
                                                                >
                                                                    Lihat Semua
                                                                    Waktu (
                                                                    {
                                                                        counts.total_all_time
                                                                    }
                                                                    )
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    orders.data.map((order) => {
                                        const activeOrderItems =
                                            order.items.filter(
                                                (it) =>
                                                    it.status !== 'rejected',
                                            );
                                        const sourceItems =
                                            activeOrderItems.length > 0
                                                ? activeOrderItems
                                                : order.items;
                                        const itemsSummary = sourceItems
                                            .map((it) => {
                                                const optText =
                                                    it.options &&
                                                    it.options.length > 0
                                                        ? ` (${it.options.map((o) => o.option_name).join(', ')})`
                                                        : '';
                                                return `${it.quantity}x ${it.menu_name}${optText}`;
                                            })
                                            .join(', ');

                                        return (
                                            <tr
                                                key={order.id}
                                                className="transition-colors hover:bg-[#FAF5E8]/40"
                                            >
                                                {/* No Order & Waktu */}
                                                <td className="px-4 py-3.5">
                                                    <div className="font-mono text-xs font-bold text-neutral-900">
                                                        {order.order_number}
                                                    </div>
                                                    <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-neutral-500">
                                                        <Clock className="size-3" />
                                                        {new Date(
                                                            order.created_at,
                                                        ).toLocaleTimeString(
                                                            'id-ID',
                                                            {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            },
                                                        )}{' '}
                                                        WIB
                                                    </div>
                                                </td>

                                                {/* Meja & Pelanggan */}
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex size-6 items-center justify-center rounded-md border border-[#DFCFA9] bg-[#FAF5E8] text-[11px] font-black text-neutral-900">
                                                            {order.table
                                                                ?.table_number ??
                                                                '00'}
                                                        </span>
                                                        <div>
                                                            <div className="font-bold text-neutral-900">
                                                                {
                                                                    order.customer_name
                                                                }
                                                            </div>
                                                            <div className="text-[10px] text-neutral-500">
                                                                Meja{' '}
                                                                {order.table
                                                                    ?.table_number ??
                                                                    'Bebas'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Rincian Menu */}
                                                <td className="max-w-xs px-4 py-3.5">
                                                    <p className="line-clamp-1 font-medium text-neutral-800">
                                                        {itemsSummary}
                                                    </p>
                                                    {order.notes && (
                                                        <p className="mt-0.5 truncate text-[10px] text-amber-700 italic">
                                                            "{order.notes}"
                                                        </p>
                                                    )}
                                                </td>

                                                {/* Total Tagihan */}
                                                <td className="px-4 py-3.5 text-right font-mono font-extrabold text-neutral-900">
                                                    {formatRupiah(
                                                        order.total_amount,
                                                    )}
                                                </td>

                                                {/* Status Pembayaran */}
                                                <td className="px-4 py-3.5 text-center">
                                                    {order.payment_status ===
                                                    'paid' ? (
                                                        <Badge className="border-emerald-500/30 bg-emerald-500/15 text-[10px] font-bold text-emerald-700">
                                                            Lunas (
                                                            {order.payment_method?.toUpperCase() ||
                                                                'TUNAI'}
                                                            )
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="border-amber-500/30 bg-amber-500/15 text-[10px] font-bold text-amber-800">
                                                            Belum Bayar
                                                        </Badge>
                                                    )}
                                                </td>

                                                {/* Status Pesanan */}
                                                <td className="px-4 py-3.5 text-center">
                                                    {order.order_status ===
                                                        'pending' && (
                                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 uppercase">
                                                            PENDING
                                                        </span>
                                                    )}
                                                    {order.order_status ===
                                                        'processing' && (
                                                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-800 uppercase">
                                                            DIRACIK
                                                        </span>
                                                    )}
                                                    {order.order_status ===
                                                        'ready' && (
                                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800 uppercase">
                                                            SIAP SAJI
                                                        </span>
                                                    )}
                                                    {order.order_status ===
                                                        'completed' && (
                                                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-black text-neutral-700 uppercase">
                                                            SELESAI
                                                        </span>
                                                    )}
                                                    {order.order_status ===
                                                        'cancelled' && (
                                                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700 uppercase">
                                                            BATAL
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Tombol Aksi (Monitoring & Struk) */}
                                                <td className="px-4 py-3.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {/* Tombol Detail Pesanan */}
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() =>
                                                                openDetailModal(
                                                                    order,
                                                                )
                                                            }
                                                            className="h-7 rounded-lg border-[#DFCFA9] bg-white px-2.5 text-[11px] font-bold text-neutral-800 hover:bg-[#FAF5E8]"
                                                            title="Buka rincian pesanan"
                                                        >
                                                            <Eye className="mr-1 size-3" />
                                                            Detail
                                                        </Button>

                                                        {/* Tombol Cetak Struk */}
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() =>
                                                                openReceiptModal(
                                                                    order,
                                                                )
                                                            }
                                                            className="size-7 p-0 text-neutral-600 hover:bg-[#FAF5E8] hover:text-neutral-900"
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
                        <div className="flex items-center justify-between border-t border-[#E8DFC8] bg-[#FAF5E8]/40 p-3 text-xs text-neutral-600">
                            <span>
                                Menampilkan {orders.data.length} dari{' '}
                                {orders.total} total pesanan
                            </span>
                            <div className="flex items-center gap-1">
                                {orders.links.map((link, idx) => {
                                    if (!link.url) {
                                        return (
                                            <span
                                                key={idx}
                                                dangerouslySetInnerHTML={{
                                                    __html: link.label,
                                                }}
                                                className="px-2.5 py-1 text-xs text-neutral-400"
                                            />
                                        );
                                    }
                                    return (
                                        <Link
                                            key={idx}
                                            href={link.url}
                                            dangerouslySetInnerHTML={{
                                                __html: link.label,
                                            }}
                                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                                                link.active
                                                    ? 'bg-[#18181B] text-white'
                                                    : 'border border-[#DFCFA9] bg-white text-neutral-700 hover:bg-[#EFE5CF]'
                                            }`}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL 1: DETAIL PESANAN & AUDIT TRAIL (Gaya 2 Kolom Standee QR Meja) */}
            <Dialog
                open={isDetailModalOpen}
                onOpenChange={setIsDetailModalOpen}
            >
                <DialogContent className="flex max-h-[92dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-4xl">
                    {selectedOrder && (
                        <>
                            {/* Sticky Header ala Modal QR Code Meja */}
                            <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                                <FormDialogHeader
                                    icon={ClipboardList}
                                    badge="Rincian Pesanan Meja"
                                    tag={`MEJA ${selectedOrder.table?.table_number ?? 'BEBAS'}`}
                                    statusLabel={
                                        selectedOrder.payment_status === 'paid'
                                            ? 'Lunas'
                                            : 'Belum Bayar'
                                    }
                                    statusActive={
                                        selectedOrder.payment_status === 'paid'
                                    }
                                    title={`Detail Pesanan #${selectedOrder.order_number}`}
                                    description={`Pemesan: ${selectedOrder.customer_name} • ${new Date(selectedOrder.created_at).toLocaleString('id-ID')}`}
                                />
                            </div>

                            {/* Body 2 Kolom ala Modal QR Code Meja */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                                <div className="flex flex-col items-stretch gap-5 md:flex-row">
                                    {/* KOLOM KIRI: Kartu Standee Pesanan Meja */}
                                    <StandeeModalCard
                                        pillPrimary={`MEJA ${selectedOrder.table?.table_number ?? '00'}`}
                                        pillSecondary={
                                            selectedOrder.customer_name
                                        }
                                        topBadgeIcon={ClipboardList}
                                        topBadgeLabel={selectedOrder.order_status.toUpperCase()}
                                        heading={`Order #${selectedOrder.order_number}`}
                                        subheading={`${selectedOrder.items.length} produk dipesan • Metode ${(selectedOrder.payment_method || 'Tunai').toUpperCase()}`}
                                        steps={[
                                            {
                                                num: '01',
                                                label: `${selectedOrder.items.length} Item`,
                                            },
                                            {
                                                num: '02',
                                                label: (
                                                    selectedOrder.payment_method ||
                                                    'Tunai'
                                                ).toUpperCase(),
                                            },
                                            {
                                                num: '03',
                                                label:
                                                    selectedOrder.payment_status ===
                                                    'paid'
                                                        ? 'Lunas'
                                                        : 'Unpaid',
                                            },
                                        ]}
                                    >
                                        <div className="flex size-36 flex-col items-center justify-center gap-1.5 bg-[#FAF5E8] p-3 text-center">
                                            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#C52828] text-white shadow-sm">
                                                <Coffee className="size-6" />
                                            </div>
                                            <p className="text-[10px] font-bold tracking-wider text-[#78716C] uppercase">
                                                Total Tagihan
                                            </p>
                                            <p className="font-heading text-sm font-black text-[#C52828] tabular-nums">
                                                {formatRupiah(
                                                    selectedOrder.total_amount,
                                                )}
                                            </p>
                                        </div>
                                    </StandeeModalCard>

                                    {/* KOLOM KANAN: Rincian Produk & Kontrol Tahapan */}
                                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3.5">
                                        <div className="space-y-3.5">
                                            {/* Dark Merchant & Total Tagihan Banner ala QRIS */}
                                            <div className="flex items-center justify-between rounded-xl bg-[#1A1A1A] p-3.5 text-white shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-10 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black tracking-tight text-white">
                                                        QR
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold tracking-wide text-white uppercase">
                                                            SIDE LINE COFFEE •
                                                            MEJA{' '}
                                                            {selectedOrder.table
                                                                ?.table_number ??
                                                                'BEBAS'}
                                                        </p>
                                                        <p className="text-[10px] text-white/60 uppercase">
                                                            {selectedOrder.payment_method ||
                                                                'TUNAI'}{' '}
                                                            •{' '}
                                                            {selectedOrder.payment_status ===
                                                            'paid'
                                                                ? 'LUNAS'
                                                                : 'BELUM BAYAR'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-medium text-white/60">
                                                        Total Tagihan
                                                    </p>
                                                    <p className="text-sm font-black tracking-tight text-white tabular-nums">
                                                        {formatRupiah(
                                                            selectedOrder.total_amount,
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Daftar Item Pesanan */}
                                            {(() => {
                                                const activeModalItems =
                                                    selectedOrder.items.filter(
                                                        (it: any) =>
                                                            it.status !==
                                                            'rejected',
                                                    );
                                                const currentStage =
                                                    selectedOrder.order_status;
                                                const isInteractiveStage =
                                                    currentStage ===
                                                        'pending' ||
                                                    currentStage ===
                                                        'processing' ||
                                                    currentStage === 'ready';
                                                const checkedModalCount =
                                                    activeModalItems.filter(
                                                        (it) =>
                                                            checkedAdminItems[
                                                                `${currentStage}_${it.id}`
                                                            ],
                                                    ).length;
                                                const allModalItemsChecked =
                                                    activeModalItems.length >
                                                        0 &&
                                                    activeModalItems.every(
                                                        (it) =>
                                                            checkedAdminItems[
                                                                `${currentStage}_${it.id}`
                                                            ],
                                                    );

                                                return (
                                                    <>
                                                        <div className="space-y-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                                            <div className="flex items-center justify-between border-b border-[#EFEAE0] pb-2.5">
                                                                <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#1A1A1A]">
                                                                    <Sparkles className="size-3.5 text-[#C52828]" />
                                                                    Daftar
                                                                    Produk
                                                                    Pesanan (
                                                                    {
                                                                        selectedOrder
                                                                            .items
                                                                            .length
                                                                    }
                                                                    )
                                                                </h4>
                                                                {isInteractiveStage && (
                                                                    <span className="rounded-full bg-[#FDECEB] px-2.5 py-0.5 text-[11px] font-bold text-[#C52828]">
                                                                        {
                                                                            checkedModalCount
                                                                        }{' '}
                                                                        dari{' '}
                                                                        {
                                                                            activeModalItems.length
                                                                        }{' '}
                                                                        siap
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                                                                {selectedOrder.items.map(
                                                                    (
                                                                        item: any,
                                                                    ) => {
                                                                        const isRejected =
                                                                            item.status ===
                                                                            'rejected';
                                                                        const isChecked =
                                                                            !!checkedAdminItems[
                                                                                `${currentStage}_${item.id}`
                                                                            ];

                                                                        return (
                                                                            <div
                                                                                key={
                                                                                    item.id
                                                                                }
                                                                                onClick={() => {
                                                                                    if (
                                                                                        isInteractiveStage &&
                                                                                        !isRejected
                                                                                    ) {
                                                                                        toggleAdminItemCheck(
                                                                                            currentStage,
                                                                                            item.id,
                                                                                        );
                                                                                    }
                                                                                }}
                                                                                className={`space-y-1 rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-3 text-xs ${
                                                                                    isInteractiveStage &&
                                                                                    !isRejected
                                                                                        ? 'cursor-pointer transition-colors select-none hover:border-[#C52828]/40'
                                                                                        : ''
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-start justify-between gap-2 font-bold text-[#1A1A1A]">
                                                                                    <div className="flex items-start gap-2">
                                                                                        {isInteractiveStage &&
                                                                                            !isRejected && (
                                                                                                <input
                                                                                                    type="checkbox"
                                                                                                    checked={
                                                                                                        isChecked
                                                                                                    }
                                                                                                    onChange={() => {}}
                                                                                                    className="mt-0.5 size-4 cursor-pointer rounded border-neutral-300 text-[#C52828] focus:ring-0"
                                                                                                />
                                                                                            )}
                                                                                        <span
                                                                                            className={
                                                                                                isRejected
                                                                                                    ? 'text-rose-400 line-through'
                                                                                                    : isInteractiveStage &&
                                                                                                        isChecked
                                                                                                      ? 'text-neutral-400 line-through'
                                                                                                      : ''
                                                                                            }
                                                                                        >
                                                                                            {
                                                                                                item.quantity
                                                                                            }
                                                                                            x{' '}
                                                                                            {
                                                                                                item.menu_name
                                                                                            }
                                                                                        </span>
                                                                                    </div>
                                                                                    <span className="font-mono tabular-nums">
                                                                                        {formatRupiah(
                                                                                            item.total_price,
                                                                                        )}
                                                                                    </span>
                                                                                </div>
                                                                                {item
                                                                                    .options
                                                                                    .length >
                                                                                    0 && (
                                                                                    <div className="pl-6 text-[11px] text-[#6E6A64]">
                                                                                        {item.options.map(
                                                                                            (
                                                                                                opt: any,
                                                                                            ) => (
                                                                                                <span
                                                                                                    key={
                                                                                                        opt.id
                                                                                                    }
                                                                                                    className="block"
                                                                                                >
                                                                                                    +{' '}
                                                                                                    {
                                                                                                        opt.group_name
                                                                                                    }
                                                                                                    :{' '}
                                                                                                    {
                                                                                                        opt.option_name
                                                                                                    }
                                                                                                </span>
                                                                                            ),
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                                {item.customer_notes && (
                                                                                    <p className="pl-6 text-[10px] text-amber-700 italic">
                                                                                        "
                                                                                        {
                                                                                            item.customer_notes
                                                                                        }
                                                                                        "
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    },
                                                                )}
                                                            </div>

                                                            <div className="space-y-1.5 border-t border-dashed border-[#E5DEC9] pt-3 text-xs">
                                                                <div className="flex justify-between text-[#6E6A64]">
                                                                    <span>
                                                                        Subtotal
                                                                        Menu
                                                                    </span>
                                                                    <span className="font-mono font-semibold text-[#1A1A1A]">
                                                                        {formatRupiah(
                                                                            selectedOrder.subtotal,
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between border-t border-[#EFEAE0] pt-1 text-sm font-extrabold text-[#1A1A1A]">
                                                                    <span>
                                                                        Total
                                                                        Akhir
                                                                    </span>
                                                                    <span className="font-mono text-[#C52828]">
                                                                        {formatRupiah(
                                                                            selectedOrder.total_amount,
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2.5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                                            <div className="flex items-center justify-between">
                                                                <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#1A1A1A]">
                                                                    <CheckCircle2 className="size-3.5 text-[#C52828]" />
                                                                    Ubah Tahapan
                                                                    Pesanan
                                                                </h4>
                                                                {isInteractiveStage &&
                                                                    !allModalItemsChecked && (
                                                                        <span className="text-[10px] font-semibold text-[#C52828]">
                                                                            *
                                                                            Ceklis
                                                                            semua
                                                                            menu
                                                                            di
                                                                            atas
                                                                            terlebih
                                                                            dahulu
                                                                        </span>
                                                                    )}
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    disabled={
                                                                        selectedOrder.order_status !==
                                                                            'pending' ||
                                                                        !allModalItemsChecked ||
                                                                        isSubmittingAction
                                                                    }
                                                                    onClick={() =>
                                                                        handleUpdateStatus(
                                                                            selectedOrder,
                                                                            'processing',
                                                                        )
                                                                    }
                                                                    className="h-9 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] text-[11px] font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                                                                >
                                                                    Proses Racik
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    disabled={
                                                                        selectedOrder.order_status !==
                                                                            'processing' ||
                                                                        !allModalItemsChecked ||
                                                                        isSubmittingAction
                                                                    }
                                                                    onClick={() =>
                                                                        handleUpdateStatus(
                                                                            selectedOrder,
                                                                            'ready',
                                                                        )
                                                                    }
                                                                    className="h-9 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] text-[11px] font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                                                                >
                                                                    Tandai Siap
                                                                    Saji
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    disabled={
                                                                        selectedOrder.order_status !==
                                                                            'ready' ||
                                                                        !allModalItemsChecked ||
                                                                        selectedOrder.payment_status ===
                                                                            'unpaid' ||
                                                                        isSubmittingAction
                                                                    }
                                                                    onClick={() =>
                                                                        handleUpdateStatus(
                                                                            selectedOrder,
                                                                            'completed',
                                                                        )
                                                                    }
                                                                    className="h-9 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] text-[11px] font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                                                                >
                                                                    Tandai
                                                                    Selesai
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Sticky Footer Bar ala Card Modal QRIS */}
                            <div className="flex shrink-0 flex-col-reverse gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                                {selectedOrder.payment_status !== 'paid' &&
                                Number(selectedOrder.settled_amount ?? 0) <=
                                    0 &&
                                selectedOrder.order_status !== 'completed' &&
                                selectedOrder.order_status !== 'cancelled' ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() =>
                                            handleCancelOrder(selectedOrder)
                                        }
                                        disabled={isSubmittingAction}
                                        className="h-10 cursor-pointer rounded-xl text-xs font-bold text-[#C52828] hover:bg-[#FDECEB]"
                                    >
                                        Batalkan Pesanan
                                    </Button>
                                ) : (
                                    <span className="text-[11px] font-semibold text-[#6E6A64]">
                                        {selectedOrder.payment_status ===
                                            'paid' ||
                                        Number(
                                            selectedOrder.settled_amount ?? 0,
                                        ) > 0
                                            ? 'Pesanan lunas bersifat final (tanpa pembatalan / refund).'
                                            : ''}
                                    </span>
                                )}
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            setIsDetailModalOpen(false)
                                        }
                                        className="h-11 flex-1 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6] sm:flex-none"
                                    >
                                        Tutup
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            setIsDetailModalOpen(false);
                                            openReceiptModal(selectedOrder);
                                        }}
                                        className="h-11 flex-1 cursor-pointer gap-1.5 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222] sm:flex-none"
                                    >
                                        <Printer className="size-3.5" /> Cetak
                                        Struk
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* MODAL 2: CETAK STRUK THERMAL (Gaya 2 Kolom Standee QR Meja) */}
            <Dialog
                open={isReceiptModalOpen}
                onOpenChange={setIsReceiptModalOpen}
            >
                <DialogContent className="flex max-h-[92dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-4xl">
                    {selectedOrder && (
                        <>
                            {/* Sticky Header */}
                            <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                                <FormDialogHeader
                                    icon={Printer}
                                    badge="Struk Pembayaran"
                                    tag={`MEJA ${selectedOrder.table?.table_number ?? '00'}`}
                                    statusLabel={
                                        selectedOrder.payment_status === 'paid'
                                            ? 'Lunas'
                                            : 'Belum Bayar'
                                    }
                                    statusActive={
                                        selectedOrder.payment_status === 'paid'
                                    }
                                    title={`Nota #${selectedOrder.order_number}`}
                                    description="Pratinjau struk kasir siap cetak ke printer thermal 58mm / 80mm."
                                />
                            </div>

                            {/* Body 2 Kolom */}
                            <div className="flex-1 overflow-y-auto bg-[#FAF8F4] p-4 sm:p-5">
                                <div className="flex flex-col items-stretch gap-5 md:flex-row">
                                    {/* KOLOM KIRI: Standee Card Ringkasan Nota */}
                                    <StandeeModalCard
                                        pillPrimary={`MEJA ${selectedOrder.table?.table_number ?? '00'}`}
                                        pillSecondary={
                                            selectedOrder.customer_name
                                        }
                                        topBadgeIcon={Printer}
                                        topBadgeLabel="CETAK NOTA"
                                        heading={`Nota #${selectedOrder.order_number}`}
                                        subheading="Pastikan printer thermal menyala sebelum menekan tombol cetak."
                                        steps={[
                                            { num: '01', label: '58 / 80mm' },
                                            {
                                                num: '02',
                                                label: `${selectedOrder.items.length} Item`,
                                            },
                                            { num: '03', label: 'Siap Cetak' },
                                        ]}
                                    >
                                        <div className="flex size-36 flex-col items-center justify-center gap-1.5 bg-[#FAF5E8] p-3 text-center">
                                            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#C52828] text-white shadow-sm">
                                                <Printer className="size-6" />
                                            </div>
                                            <p className="text-[10px] font-bold text-[#78716C] uppercase">
                                                Total Bayar
                                            </p>
                                            <p className="font-heading text-sm font-black text-[#C52828] tabular-nums">
                                                {formatRupiah(
                                                    selectedOrder.total_amount,
                                                )}
                                            </p>
                                        </div>
                                    </StandeeModalCard>

                                    {/* KOLOM KANAN: Pratinjau Struk Thermal */}
                                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3.5">
                                        <div className="space-y-3.5">
                                            <div className="flex items-center justify-between rounded-xl bg-[#1A1A1A] p-3.5 text-white shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-10 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black tracking-tight text-white">
                                                        POS
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold tracking-wide text-white uppercase">
                                                            SIDE LINE COFFEE •
                                                            NOTA KASIR
                                                        </p>
                                                        <p className="text-[10px] text-white/60">
                                                            Thermal Receipt 58mm
                                                            / 80mm
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-medium text-white/60">
                                                        Total
                                                    </p>
                                                    <p className="text-sm font-black text-white tabular-nums">
                                                        {formatRupiah(
                                                            selectedOrder.total_amount,
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            <div
                                                id="printable-admin-receipt"
                                                className="space-y-2.5 rounded-xl border border-dashed border-[#D6CFC2] bg-[#FFFDFB] p-4 font-mono text-xs text-[#1A1A1A] shadow-[0_2px_12px_rgba(26,26,26,0.03)]"
                                            >
                                                <div className="border-b border-dashed border-[#D6CFC2] pb-2.5 text-center">
                                                    <h3 className="text-sm font-bold tracking-widest">
                                                        SIDE LINE CAFE
                                                    </h3>
                                                    <p className="text-[10px] text-[#6E6A64]">
                                                        Jl. Kaliurang KM 5,
                                                        Yogyakarta
                                                    </p>
                                                    <p className="text-[10px] text-[#6E6A64]">
                                                        Telp: 0812-3456-7890
                                                    </p>
                                                </div>

                                                <div className="space-y-0.5 border-b border-dashed border-[#D6CFC2] pb-2 text-[11px]">
                                                    <div className="flex justify-between">
                                                        <span>No Order:</span>
                                                        <span className="font-bold">
                                                            {
                                                                selectedOrder.order_number
                                                            }
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>
                                                            Meja / Cust:
                                                        </span>
                                                        <span>
                                                            Meja{' '}
                                                            {selectedOrder.table
                                                                ?.table_number ??
                                                                '00'}{' '}
                                                            (
                                                            {
                                                                selectedOrder.customer_name
                                                            }
                                                            )
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Waktu:</span>
                                                        <span>
                                                            {new Date(
                                                                selectedOrder.created_at,
                                                            ).toLocaleString(
                                                                'id-ID',
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5 border-b border-dashed border-[#D6CFC2] py-1">
                                                    {selectedOrder.items.map(
                                                        (it) => (
                                                            <div
                                                                key={it.id}
                                                                className="space-y-0.5"
                                                            >
                                                                <div className="flex justify-between font-bold">
                                                                    <span>
                                                                        {
                                                                            it.quantity
                                                                        }
                                                                        x{' '}
                                                                        {
                                                                            it.menu_name
                                                                        }
                                                                    </span>
                                                                    <span>
                                                                        {formatRupiah(
                                                                            it.total_price,
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                {it.options.map(
                                                                    (opt) => (
                                                                        <div
                                                                            key={
                                                                                opt.id
                                                                            }
                                                                            className="flex justify-between pl-2 text-[10px] text-[#6E6A64]"
                                                                        >
                                                                            <span>
                                                                                +{' '}
                                                                                {
                                                                                    opt.option_name
                                                                                }
                                                                            </span>
                                                                            <span>
                                                                                {parseFloat(
                                                                                    opt.additional_price,
                                                                                ) >
                                                                                0
                                                                                    ? formatRupiah(
                                                                                          opt.additional_price,
                                                                                      )
                                                                                    : ''}
                                                                            </span>
                                                                        </div>
                                                                    ),
                                                                )}
                                                            </div>
                                                        ),
                                                    )}
                                                </div>

                                                <div className="space-y-1 border-b border-dashed border-[#D6CFC2] pb-2 text-[11px]">
                                                    <div className="flex justify-between pt-1 text-xs font-extrabold">
                                                        <span>TOTAL:</span>
                                                        <span className="text-[#C52828]">
                                                            {formatRupiah(
                                                                selectedOrder.total_amount,
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px]">
                                                        <span>Metode:</span>
                                                        <span className="font-bold uppercase">
                                                            {selectedOrder.payment_method ||
                                                                'Tunai'}{' '}
                                                            (
                                                            {selectedOrder.payment_status.toUpperCase()}
                                                            )
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="pt-1 text-center text-[10px] text-[#6E6A64]">
                                                    <p>
                                                        Terima Kasih Atas
                                                        Kunjungan Anda!
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Sticky Footer */}
                            <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5">
                                <span className="hidden text-xs font-semibold text-[#6E6A64] sm:inline">
                                    Format kertas struk mendukung 58mm & 80mm
                                </span>
                                <div className="ml-auto flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            setIsReceiptModalOpen(false)
                                        }
                                        className="h-11 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                                    >
                                        Tutup
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={handlePrintReceipt}
                                        className="h-11 cursor-pointer gap-1.5 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222]"
                                    >
                                        <Printer className="size-4" /> Cetak ke
                                        Printer
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={Boolean(orderToCancel)}
                onOpenChange={(open) => {
                    if (!open && !isSubmittingAction) {
                        setOrderToCancel(null);
                    }
                }}
                title="Batalkan Pesanan?"
                description={
                    orderToCancel
                        ? `Pesanan ${orderToCancel.order_number} (${orderToCancel.customer_name}) akan dibatalkan dan stok menu yang tereservasi akan dikembalikan.`
                        : undefined
                }
                confirmLabel="Ya, Batalkan Pesanan"
                onConfirm={confirmCancelOrder}
                processing={isSubmittingAction}
            />
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
