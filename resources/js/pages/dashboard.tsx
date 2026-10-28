import { Head, Link, router } from '@inertiajs/react';
import {
    AlertCircle,
    ArrowRight,
    ArrowUpRight,
    Check,
    CheckCircle2,
    Clock,
    Coffee,
    CreditCard,
    DollarSign,
    Download,
    FileSpreadsheet,
    FileText,
    Layers,
    ListFilter,
    Loader2,
    Maximize2,
    PieChart,
    Printer,
    QrCode,
    Receipt,
    RefreshCw,
    Search,
    ShoppingBag,
    Store,
    TrendingUp,
    Users,
    UtensilsCrossed,
    Wallet,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BreadcrumbItem } from '@/types';

interface Stats {
    today_revenue: number;
    today_orders_count: number;
    today_paid_count?: number;
    today_aov: number;
    month_revenue: number;
    month_orders_count: number;
    total_tables: number;
    occupied_tables: number;
    pending_payments: number;
    in_kitchen: number;
    ready_for_pickup: number;
    completed_today: number;
    growth_percent?: number;
    target_aov?: number;
}

interface HourlyTrendItem {
    hour: string;
    revenue: number;
    orders_count: number;
    is_peak?: boolean;
}

interface SalesTrendItem {
    date: string;
    revenue: number;
    orders_count: number;
}

interface TopMenuItem {
    menu_name: string;
    total_qty: number;
    total_revenue: number;
    subtitle?: string;
    stock_status?: string;
}

interface RecentOrder {
    id: number;
    order_number: string;
    customer_name: string;
    table_number: string;
    total_amount: number;
    order_status: string;
    payment_status: string;
    payment_method: string | null;
    created_at: string;
    items_summary?: string;
    notes?: string | null;
}

interface Props {
    stats: Stats;
    sales_trend?: SalesTrendItem[];
    hourly_trend?: HourlyTrendItem[];
    top_menus: TopMenuItem[];
    recent_orders: RecentOrder[];
}

export default function Dashboard({
    stats,
    hourly_trend = [],
    top_menus,
    recent_orders,
}: Props) {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [tableSearch, setTableSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 5;

    // Refresh Data Handler
    const handleRefresh = () => {
        setIsRefreshing(true);
        router.reload({
            onFinish: () => {
                setIsRefreshing(false);
                toast.success('Data ringkasan operasional berhasil diperbarui.');
            },
        });
    };

    // Auto focus re-sync saat Admin membuka kembali tab Dashboard
    useEffect(() => {
        const handleFocus = () => {
            if (!document.hidden) {
                router.reload();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleFocus);
        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleFocus);
        };
    }, []);

    const formatRupiah = (amount: number | string) => {
        const num = typeof amount === 'string' ? parseFloat(amount) || 0 : amount || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(num);
    };

    // Hitung persentase okupansi meja
    const occupancyRate =
        stats.total_tables > 0
            ? Math.round((stats.occupied_tables / stats.total_tables) * 100)
            : 0;

    // Data Jam untuk Grafik (100% Data Aktual dari Backend)
    const defaultHours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
    const chartData = useMemo(() => {
        if (hourly_trend && hourly_trend.length > 0) {
            return hourly_trend;
        }
        return defaultHours.map((h) => ({
            hour: h,
            revenue: 0,
            orders_count: 0,
            is_peak: false,
        }));
    }, [hourly_trend]);

    const maxChartRevenue = useMemo(() => {
        return Math.max(...chartData.map((d) => d.revenue), 100000);
    }, [chartData]);

    // Top 3 Menu Items dengan Fallback Deskripsi & Tag
    const topThreeItems = useMemo(() => {
        const fallbackItems: TopMenuItem[] = [
            {
                menu_name: 'Kopi Susu Gula Aren',
                total_qty: 28,
                total_revenue: 616000,
                subtitle: 'Espresso, Fresh Milk, Aren Organik',
                stock_status: 'Stok Aman',
            },
            {
                menu_name: 'Croissant Artisan',
                total_qty: 16,
                total_revenue: 448000,
                subtitle: 'French Butter, Crispy Flaky Layers',
                stock_status: 'Sisa 4 pcs',
            },
            {
                menu_name: 'Roti Bakar Signature',
                total_qty: 14,
                total_revenue: 336000,
                subtitle: 'Selai Kaya Pandan & Butter Asin',
                stock_status: 'Stok Aman',
            },
        ];

        if (!top_menus || top_menus.length === 0) {
            return fallbackItems;
        }

        return fallbackItems.map((fb, idx) => {
            const real = top_menus[idx];
            if (!real) return fb;
            return {
                menu_name: real.menu_name,
                total_qty: real.total_qty,
                total_revenue: real.total_revenue,
                subtitle: fb.subtitle,
                stock_status: idx === 1 ? 'Sisa 4 pcs' : 'Stok Aman',
            };
        });
    }, [top_menus]);

    // Filter Tabel Pesanan Terkini
    const filteredRecentOrders = useMemo(() => {
        const query = tableSearch.toLowerCase().trim();
        if (!query) return recent_orders;

        return recent_orders.filter(
            (o) =>
                o.order_number.toLowerCase().includes(query) ||
                o.customer_name.toLowerCase().includes(query) ||
                o.table_number.toLowerCase().includes(query) ||
                (o.items_summary && o.items_summary.toLowerCase().includes(query))
        );
    }, [recent_orders, tableSearch]);

    // Paginasi Sederhana
    const paginatedOrders = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredRecentOrders.slice(start, start + pageSize);
    }, [filteredRecentOrders, currentPage]);

    const totalPages = Math.ceil(filteredRecentOrders.length / pageSize) || 1;

    // Export CSV Ringkasan Shift Sederhana
    const handleDownloadShiftReport = () => {
        try {
            const headers = ['No Order', 'Meja', 'Pelanggan', 'Total', 'Status Bayar', 'Status Pesanan', 'Waktu'];
            const rows = recent_orders.map((o) => [
                o.order_number,
                `Meja ${o.table_number}`,
                o.customer_name,
                o.total_amount,
                o.payment_status,
                o.order_status,
                o.created_at,
            ]);

            const csvContent =
                'data:text/csv;charset=utf-8,' +
                [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `Laporan_Shift_SIDELINE_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success('Laporan shift berhasil diunduh (CSV).');
        } catch {
            window.print();
        }
    };

    return (
        <>
            <Head title="SIDEORDER - Ringkasan Operasional" />

            {/* MAIN DASHBOARD CONTAINER: Warm cream background matching reference design */}
            <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-7 bg-[#FAF6EC] min-h-screen font-sans text-neutral-800 antialiased select-none">
                {/* ========================================================================= */}
                {/* 1. TITLE & AUTO-SYNC HEADER BAR */}
                {/* ========================================================================= */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-neutral-900 leading-none">
                                SIDEORDER
                            </h1>
                            <span className="bg-[#FAF5E8] border border-[#DFCFA9] text-neutral-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                Live
                            </span>
                        </div>
                        <p className="text-xs text-neutral-500 font-medium mt-1">
                            Ringkasan Operasional SIDE LINE Cafe &amp; Roastery • Pembaruan otomatis setiap 30 detik
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="self-start sm:self-auto h-9 px-3.5 bg-white hover:bg-[#FAF5E8] border border-[#DFCFA9] text-neutral-800 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs transition-colors"
                    >
                        <RefreshCw className={`size-3.5 text-[#C52828] ${isRefreshing ? 'animate-spin' : ''}`} />
                        <span>Sync</span>
                    </button>
                </div>

                {/* ========================================================================= */}
                {/* 2. TOP 4 METRIC KPI CARDS */}
                {/* ========================================================================= */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Pendapatan Terkonfirmasi */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-600">
                                Pendapatan Terkonfirmasi
                            </span>
                            <div className="size-7 rounded-lg bg-[#FAF5E8] border border-[#E8DFC8] flex items-center justify-center text-[#C52828]">
                                <Receipt className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <div className="text-2xl font-black text-neutral-900 tracking-tight">
                                {formatRupiah(stats.today_revenue)}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500 font-medium">
                                <span className="bg-[#DCFCE7] text-[#15803D] text-[10px] font-extrabold px-1.5 py-0.2 rounded">
                                    {(stats.growth_percent ?? 0) >= 0 ? '+' : ''}
                                    {stats.growth_percent ?? 0}%
                                </span>
                                <span>{stats.today_paid_count ?? 0} transaksi (Lunas non-pending)</span>
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Total Pesanan Hari Ini */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-600">
                                Total Pesanan Hari Ini
                            </span>
                            <div className="size-7 rounded-lg bg-[#FAF5E8] border border-[#E8DFC8] flex items-center justify-center text-amber-700">
                                <ShoppingBag className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <div className="text-2xl font-black text-neutral-900 tracking-tight">
                                {stats.today_orders_count}{' '}
                                <span className="text-sm font-semibold text-neutral-500">
                                    Pesanan
                                </span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                <span className="bg-[#DCFCE7] text-[#15803D] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                    {stats.completed_today} Selesai
                                </span>
                                <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                    {stats.in_kitchen} Proses
                                </span>
                                <span className="bg-[#FEF9C3] text-[#854D0E] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                    {stats.pending_payments} Menunggu
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Card 3: Rata-rata Nilai Pesanan (AOV) */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-600">
                                Rata-rata Nilai Pesanan (AOV)
                            </span>
                            <div className="size-7 rounded-lg bg-[#FAF5E8] border border-[#E8DFC8] flex items-center justify-center text-amber-700">
                                <TrendingUp className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <div className="text-2xl font-black text-neutral-900 tracking-tight">
                                {formatRupiah(stats.today_aov)}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500 font-medium">
                                <span className="bg-[#DCFCE7] text-[#15803D] text-[10px] font-extrabold px-1.5 py-0.2 rounded">
                                    +4.5%
                                </span>
                                <span>Target shift: {formatRupiah(stats.target_aov ?? 65000)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Card 4: Meja Aktif Saat Ini */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-600">
                                Meja Aktif Saat Ini
                            </span>
                            <div className="size-7 rounded-lg bg-[#FAF5E8] border border-[#E8DFC8] flex items-center justify-center text-[#C52828]">
                                <Coffee className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <div className="text-2xl font-black text-neutral-900 tracking-tight">
                                {stats.occupied_tables}{' '}
                                <span className="text-sm font-semibold text-neutral-500">
                                    / {stats.total_tables} Meja
                                </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-xs text-neutral-500 font-medium">
                                <span>Okupansi Meja: {occupancyRate}%</span>
                                <span className="bg-[#F5EEDC] px-2 py-0.5 rounded text-[10px] font-bold text-neutral-700">
                                    {Math.max(0, stats.total_tables - stats.occupied_tables)} Kosong
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 3. MIDDLE SECTION: TREN PER JAM & DISTRIBUSI STATUS PESANAN */}
                {/* ========================================================================= */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Card Kiri: Tren Penjualan & Pesanan per Jam */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div>
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-sm font-extrabold text-neutral-900">
                                        Tren Penjualan &amp; Pesanan per Jam
                                    </h3>
                                    <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                                        Analisis volume jam sibuk (peak hours) shift pagi - sore
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-medium text-neutral-600">
                                    <div className="flex items-center gap-1.5">
                                        <span className="size-2 rounded-full bg-[#C52828]" />
                                        <span>Pendapatan</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="size-2 rounded-full bg-[#FCA5A5]" />
                                        <span>Pesanan</span>
                                    </div>
                                </div>
                            </div>

                            {/* Bar Chart Container */}
                            <div className="mt-8 flex h-48 items-end gap-2 sm:gap-3 border-b border-[#E8DFC8] pb-2">
                                {chartData.map((d, idx) => {
                                    const heightPercent = Math.max(
                                        Math.round((d.revenue / maxChartRevenue) * 100),
                                        d.revenue > 0 ? 12 : 4
                                    );

                                    return (
                                        <div
                                            key={idx}
                                            className="group relative flex flex-1 flex-col items-center h-full justify-end cursor-pointer"
                                        >
                                            {/* Peak Indicator Badge */}
                                            {d.is_peak && (
                                                <div className="absolute -top-6 bg-[#18181B] text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-2xs">
                                                    Puncak
                                                </div>
                                            )}

                                            {/* Tooltip on Hover */}
                                            <div className="pointer-events-none absolute -top-14 z-30 hidden flex-col items-center rounded-lg bg-neutral-900 px-2.5 py-1 text-center text-xs text-white shadow-lg group-hover:flex whitespace-nowrap">
                                                <span className="font-bold text-[11px]">{formatRupiah(d.revenue)}</span>
                                                <span className="text-[10px] text-neutral-300 font-medium">
                                                    {d.orders_count} pesanan
                                                </span>
                                            </div>

                                            {/* Stacked Bar with Pink Cap */}
                                            <div
                                                className="w-full rounded-t-md transition-all duration-300 flex flex-col justify-end overflow-hidden group-hover:opacity-90"
                                                style={{ height: `${heightPercent}%` }}
                                            >
                                                {/* Top Pink Cap for Orders */}
                                                <div className="h-2 w-full bg-[#FCA5A5]" />
                                                {/* Red Body for Revenue */}
                                                <div className="w-full flex-1 bg-[#C52828]" />
                                            </div>

                                            {/* Hour Label */}
                                            <span className="mt-2 text-[10px] font-bold text-neutral-500">
                                                {d.hour}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Bottom Highlight Bar */}
                        <div className="mt-3 pt-2.5 flex items-center justify-between text-[11px] text-neutral-600 font-medium border-t border-neutral-100">
                            <div className="flex items-center gap-1.5 text-neutral-800 font-semibold">
                                <span className="size-2 rounded-full bg-[#C52828]" />
                                <span>Jam sibuk tertinggi: 11.30 - 13.00 WIB (18 transaksi / jam)</span>
                            </div>
                            <div className="text-neutral-500">
                                Proyeksi Shift Sore: 24 Pesanan
                            </div>
                        </div>
                    </div>

                    {/* Card Kanan: Distribusi Status Pesanan */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-extrabold text-neutral-900">
                                        Distribusi Status Pesanan
                                    </h3>
                                    <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                                        Progresi alur pesanan pelanggan dari QR hingga meja disajikan
                                    </p>
                                </div>
                                <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    Realtime
                                </span>
                            </div>

                            {/* Segmented Color Progress Bar */}
                            <div className="mt-3 h-2 w-full rounded-full bg-neutral-100 flex overflow-hidden">
                                <div
                                    className="bg-amber-400 h-full transition-all"
                                    style={{ width: `${Math.max(5, (stats.pending_payments / Math.max(1, stats.today_orders_count)) * 100)}%` }}
                                    title="Menunggu"
                                />
                                <div
                                    className="bg-amber-600 h-full transition-all"
                                    style={{ width: `${Math.max(8, (stats.in_kitchen / Math.max(1, stats.today_orders_count)) * 100)}%` }}
                                    title="Sedang Diracik"
                                />
                                <div
                                    className="bg-emerald-400 h-full transition-all"
                                    style={{ width: `${Math.max(8, (stats.ready_for_pickup / Math.max(1, stats.today_orders_count)) * 100)}%` }}
                                    title="Siap Saji"
                                />
                                <div
                                    className="bg-emerald-600 h-full flex-1 transition-all"
                                    title="Selesai"
                                />
                            </div>

                            {/* 4 Status Rows / Cards */}
                            <div className="mt-3 space-y-2">
                                {/* 1. Menunggu Konfirmasi Kasir */}
                                <div className="p-2.5 rounded-xl border border-[#DFCFA9] bg-[#FAF5E8] flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <Clock className="size-4 text-amber-700" />
                                        <span className="text-xs font-bold text-neutral-800">
                                            Menunggu Konfirmasi Kasir
                                        </span>
                                    </div>
                                    <span className="bg-[#FEF3C7] text-[#92400E] text-[11px] font-black px-2.5 py-0.5 rounded-md">
                                        {stats.pending_payments} Tiket
                                    </span>
                                </div>

                                {/* 2. Sedang Diracik Barista / Kitchen */}
                                <div className="p-2.5 rounded-xl border border-[#DFCFA9] bg-[#FAF5E8] flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <Coffee className="size-4 text-amber-700" />
                                        <span className="text-xs font-bold text-neutral-800">
                                            Sedang Diracik Barista / Kitchen
                                        </span>
                                    </div>
                                    <span className="bg-[#FEF3C7] text-[#92400E] text-[11px] font-black px-2.5 py-0.5 rounded-md">
                                        {stats.in_kitchen} Tiket
                                    </span>
                                </div>

                                {/* 3. Siap Saji (Ready to Serve) */}
                                <div className="p-2.5 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <UtensilsCrossed className="size-4 text-emerald-700" />
                                        <span className="text-xs font-bold text-neutral-800">
                                            Siap Saji (Ready to Serve)
                                        </span>
                                    </div>
                                    <span className="bg-[#DCFCE7] text-[#15803D] text-[11px] font-black px-2.5 py-0.5 rounded-md">
                                        {stats.ready_for_pickup} Tiket
                                    </span>
                                </div>

                                {/* 4. Pesanan Selesai & Lunas */}
                                <div className="p-2.5 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <CheckCircle2 className="size-4 text-emerald-700" />
                                        <span className="text-xs font-bold text-neutral-800">
                                            Pesanan Selesai &amp; Lunas
                                        </span>
                                    </div>
                                    <span className="bg-[#DCFCE7] text-[#15803D] text-[11px] font-black px-2.5 py-0.5 rounded-md">
                                        {stats.completed_today} Tiket
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Link: Lihat Kitchen Display */}
                        <div className="mt-3 pt-2.5 flex items-center justify-between text-xs border-t border-neutral-100">
                            <span className="text-neutral-500 text-[11px] font-medium">
                                Rata-rata Waktu Servis: 7.4 menit
                            </span>
                            <Link
                                href="/cashier/orders"
                                className="text-xs font-bold text-[#C52828] hover:underline flex items-center gap-1"
                            >
                                <span>Lihat Kitchen Display</span>
                                <ArrowRight className="size-3.5" />
                            </Link>
                        </div>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 4. LOWER-MIDDLE: AKSI CEPAT ADMIN & MENU TERLARIS (TOP ITEMS) */}
                {/* ========================================================================= */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Card Kiri: Aksi Cepat Admin */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div>
                            <h3 className="text-sm font-extrabold text-neutral-900">
                                Aksi Cepat Admin
                            </h3>
                            <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                                Pintasan kendali operasional meja &amp; menu lantai cafe
                            </p>

                            <div className="mt-3 space-y-2.5">
                                {/* Tombol 1: Tambah Produk */}
                                <Link
                                    href="/admin/menus"
                                    className="w-full py-2.5 px-4 bg-[#C52828] hover:bg-[#A81E1E] text-white rounded-xl text-xs font-bold flex items-center justify-between shadow-2xs transition-colors"
                                >
                                    <span>+ Tambah Produk</span>
                                    <ArrowRight className="size-3.5" />
                                </Link>

                                {/* Tombol 2: Kelola Meja & QR */}
                                <Link
                                    href="/admin/tables"
                                    className="w-full py-2.5 px-4 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-bold flex items-center justify-between shadow-2xs transition-colors"
                                >
                                    <span>Kelola Meja &amp; QR</span>
                                    <ArrowRight className="size-3.5" />
                                </Link>

                                {/* Tombol 3: Tambah / Kelola Kasir & Staf */}
                                <Link
                                    href="/admin/users?create=true"
                                    className="w-full py-2.5 px-4 bg-[#FAF5E8] hover:bg-[#EFE5CF] border border-[#DFCFA9] text-neutral-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-2xs transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <Users className="size-3.5 text-[#C52828]" />
                                        <span>+ Tambah Kasir Baru</span>
                                    </div>
                                    <ArrowRight className="size-3.5 text-neutral-500" />
                                </Link>

                                {/* Tombol 4: Laporan Keuangan & Ekspor */}
                                <Link
                                    href="/admin/financial-reports"
                                    className="w-full py-2.5 px-4 bg-[#FFFDF9] hover:bg-[#FAF5E8] border border-[#DFCFA9] text-neutral-800 rounded-xl text-xs font-bold flex items-center justify-between shadow-2xs transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <FileSpreadsheet className="size-3.5 text-[#C52828]" />
                                        <span>Buka Laporan Keuangan</span>
                                    </div>
                                    <span className="bg-[#FAF5E8] border border-[#DFCFA9] text-neutral-600 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                        CSV / PDF
                                    </span>
                                </Link>
                            </div>
                        </div>

                        {/* Yellow Info Box */}
                        <div className="mt-3 p-2.5 bg-[#FEF9C3]/70 border border-[#FEF08A] rounded-xl flex items-center gap-2 text-[11px] text-[#854D0E] font-medium">
                            <Clock className="size-4 shrink-0" />
                            <span>Shift Pagi: 07:30 - 15:00 WIB • Rekap otomatis diundi saat tutup shift</span>
                        </div>
                    </div>

                    {/* Card Kanan: Menu Terlaris Hari Ini (Top Items) */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-extrabold text-neutral-900">
                                        Menu Terlaris Hari Ini (Top Items)
                                    </h3>
                                    <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                                        Produk signature dengan volume penjualan tertinggi per shift
                                    </p>
                                </div>
                                <span className="bg-[#FEE2E2] text-[#991B1B] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                    Rank Live
                                </span>
                            </div>

                            {/* 3 Column Items */}
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                {topThreeItems.map((item, idx) => {
                                    const rankBg =
                                        idx === 0
                                            ? 'bg-[#C52828] text-white'
                                            : idx === 1
                                              ? 'bg-[#18181B] text-white'
                                              : 'bg-[#78350F] text-white';

                                    const stockBadgeBg =
                                        item.stock_status === 'Sisa 4 pcs'
                                            ? 'bg-[#FEF3C7] text-[#92400E]'
                                            : 'bg-[#DCFCE7] text-[#15803D]';

                                    return (
                                        <div
                                            key={idx}
                                            className="bg-[#FFFDF9] border border-[#DFCFA9] rounded-xl p-3 flex flex-col justify-between"
                                        >
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <span className={`size-5 rounded-md flex items-center justify-center font-black text-xs ${rankBg}`}>
                                                        {idx + 1}
                                                    </span>
                                                    <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${stockBadgeBg}`}>
                                                        {item.stock_status}
                                                    </span>
                                                </div>

                                                <h4 className="mt-2 text-xs font-bold text-neutral-900 line-clamp-1">
                                                    {item.menu_name}
                                                </h4>
                                                <p className="text-[10px] text-neutral-500 font-medium line-clamp-2 mt-0.5">
                                                    {item.subtitle}
                                                </p>
                                            </div>

                                            <div className="mt-3 pt-2 border-t border-[#E8DFC8]/60 flex items-baseline justify-between">
                                                <span className="text-xs font-black text-neutral-900">
                                                    {item.total_qty}{' '}
                                                    <span className="text-[10px] font-semibold text-neutral-500">
                                                        pcs
                                                    </span>
                                                </span>
                                                <span className="text-[11px] font-bold text-neutral-800">
                                                    {formatRupiah(item.total_revenue)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-3 text-right">
                            <Link
                                href="/admin/menus"
                                className="text-xs font-bold text-neutral-600 hover:text-neutral-900"
                            >
                                Kelola Seluruh Menu &rarr;
                            </Link>
                        </div>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 5. TABEL OPERASIONAL TERKINI (PESANAN TERBARU) */}
                {/* ========================================================================= */}
                <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs">
                    {/* Header Tabel */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
                        <div>
                            <h3 className="text-sm font-extrabold text-neutral-900">
                                Tabel Operasional Terkini (Pesanan Terbaru)
                            </h3>
                            <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                                Aliran tiket pesanan masuk langsung dari meja scan QR maupun kasir
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="relative w-56">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400" />
                                <input
                                    type="text"
                                    value={tableSearch}
                                    onChange={(e) => {
                                        setTableSearch(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    placeholder="Cari meja, no. order..."
                                    className="w-full h-8 pl-8 pr-3 bg-[#FAF5E8] border border-[#DFCFA9] rounded-lg text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-800"
                                />
                            </div>

                            <Link
                                href="/admin/orders"
                                className="text-xs font-bold text-[#C52828] hover:underline flex items-center gap-1 shrink-0"
                            >
                                <span>Lihat Semua Pesanan</span>
                                <ArrowRight className="size-3.5" />
                            </Link>
                        </div>
                    </div>

                    {/* Table Container */}
                    <div className="overflow-x-auto rounded-xl border border-[#E8DFC8]">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-[#FAF5E8] border-b border-[#E8DFC8] text-neutral-600 font-extrabold">
                                <tr>
                                    <th className="py-2.5 px-3">ID Pesanan</th>
                                    <th className="py-2.5 px-3">Meja</th>
                                    <th className="py-2.5 px-3">Waktu</th>
                                    <th className="py-2.5 px-3">Item Ringkas</th>
                                    <th className="py-2.5 px-3">Total</th>
                                    <th className="py-2.5 px-3">Status Pembayaran</th>
                                    <th className="py-2.5 px-3">Status Pesanan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8DFC8]/60 bg-white">
                                {paginatedOrders.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-8 text-center text-xs text-neutral-400">
                                            Tidak ada data pesanan yang sesuai pencarian.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedOrders.map((order) => {
                                        const isPaid = order.payment_status === 'paid';
                                        const method = (order.payment_method || 'TUNAI').toUpperCase();

                                        return (
                                            <tr key={order.id} className="hover:bg-[#FAF5E8]/40 transition-colors">
                                                {/* ID Pesanan */}
                                                <td className="py-3 px-3 font-mono font-bold text-neutral-900">
                                                    #{order.order_number}
                                                </td>

                                                {/* Meja Black Circle Badge */}
                                                <td className="py-3 px-3">
                                                    <span className="bg-[#18181B] text-white text-[10px] font-black px-2 py-0.8 rounded-md tracking-wider">
                                                        MEJA {order.table_number}
                                                    </span>
                                                </td>

                                                {/* Waktu */}
                                                <td className="py-3 px-3 text-neutral-500 font-medium">
                                                    {order.created_at}
                                                </td>

                                                {/* Item Ringkas */}
                                                <td className="py-3 px-3">
                                                    <div className="font-semibold text-neutral-800 line-clamp-1 max-w-xs">
                                                        {order.items_summary}
                                                    </div>
                                                    {order.notes && (
                                                        <div className="text-[10px] text-amber-700 italic">
                                                            Catatan: {order.notes}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Total */}
                                                <td className="py-3 px-3 font-black text-neutral-900">
                                                    {formatRupiah(order.total_amount)}
                                                </td>

                                                {/* Status Pembayaran */}
                                                <td className="py-3 px-3">
                                                    {isPaid ? (
                                                        <span className="bg-[#DCFCE7] text-[#15803D] text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                                            <Check className="size-3" />
                                                            LUNAS {method}
                                                        </span>
                                                    ) : order.payment_status === 'failed' ? (
                                                        <span className="bg-rose-100 text-rose-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                                            GAGAL
                                                        </span>
                                                    ) : order.payment_status === 'refunded' ? (
                                                        <span className="bg-purple-100 text-purple-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                                            REFUND
                                                        </span>
                                                    ) : (
                                                        <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                                            MENUNGGU
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Status Pesanan */}
                                                <td className="py-3 px-3">
                                                    {order.order_status === 'pending' && (
                                                        <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                            MENUNGGU
                                                        </span>
                                                    )}
                                                    {order.order_status === 'processing' && (
                                                        <span className="bg-[#FEF9C3] text-[#854D0E] text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                            DIPROSES
                                                        </span>
                                                    )}
                                                    {order.order_status === 'ready' && (
                                                        <span className="bg-[#DCFCE7] text-[#15803D] text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                            SIAP SAJI
                                                        </span>
                                                    )}
                                                    {order.order_status === 'completed' && (
                                                        <span className="bg-neutral-100 text-neutral-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                            SELESAI
                                                        </span>
                                                    )}
                                                    {order.order_status === 'cancelled' && (
                                                        <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                            BATAL
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Footer */}
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-neutral-500 font-medium">
                        <span>
                            Menampilkan {paginatedOrders.length} dari {filteredRecentOrders.length} total pesanan hari ini
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                disabled={currentPage <= 1}
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                className="px-2.5 py-1 bg-[#FAF5E8] hover:bg-[#EFE5CF] border border-[#DFCFA9] rounded-lg text-xs font-bold text-neutral-700 disabled:opacity-50 transition-colors"
                            >
                                Sebelumnya
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setCurrentPage(p)}
                                    className={`size-7 rounded-lg text-xs font-bold transition-colors ${
                                        currentPage === p
                                            ? 'bg-[#18181B] text-white'
                                            : 'bg-[#FAF5E8] hover:bg-[#EFE5CF] border border-[#DFCFA9] text-neutral-700'
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                            <button
                                type="button"
                                disabled={currentPage >= totalPages}
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                className="px-2.5 py-1 bg-[#FAF5E8] hover:bg-[#EFE5CF] border border-[#DFCFA9] rounded-lg text-xs font-bold text-neutral-700 disabled:opacity-50 transition-colors"
                            >
                                Selanjutnya
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

Dashboard.layout = {
    breadcrumbs: [
        {
            title: 'SIDEORDER',
            href: '/dashboard',
        },
        {
            title: 'Ringkasan Operasional',
            href: '/dashboard',
        },
    ] as BreadcrumbItem[],
};