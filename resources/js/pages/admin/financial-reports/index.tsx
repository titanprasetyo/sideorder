import { Head, Link, router } from '@inertiajs/react';
import {
    AlertCircle,
    ArrowDownRight,
    ArrowUpDown,
    ArrowUpRight,
    BarChart3,
    Calendar,
    Check,
    CheckCircle2,
    Clock,
    CreditCard,
    Download,
    Eye,
    FileSpreadsheet,
    FileText,
    Filter,
    Info,
    Printer,
    Receipt,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldCheck,
    TrendingUp,
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { BreadcrumbItem } from '@/types';

interface PaymentMethodStat {
    method: string;
    label: string;
    transactions_count: number;
    net_revenue: number;
}

interface PeriodMetrics {
    label: string;
    net_revenue: number;
    gross_revenue: number;
    previous_period_revenue: number;
    previous_period_label: string;
    period_growth_percent: number | null;
    total_orders_count: number;
    paid_transactions_count: number;
    average_order_value: number;
    previous_aov: number;
    aov_growth_percent: number | null;
    pending_payments_count: number;
    pending_payments_amount: number;
    failed_or_cancelled_count: number;
    cancelled_orders_count: number;
    failed_payments_count: number;
    failed_or_cancelled_amount: number;
    refunded_count: number;
    refund_amount: number;
}

interface SummaryData {
    today_revenue: number;
    today_paid_count: number;
    today_orders_count: number;
    yesterday_revenue: number;
    today_growth_percent: number | null;
    this_week_revenue: number;
    this_week_paid_count: number;
    this_week_orders_count: number;
    last_week_revenue: number;
    this_week_growth_percent: number | null;
    this_week_label: string;
    this_month_revenue: number;
    this_month_paid_count: number;
    this_month_orders_count: number;
    last_month_revenue: number;
    this_month_growth_percent: number | null;
    this_month_label: string;
    period: PeriodMetrics;
    payment_methods: PaymentMethodStat[];
}

interface RecapRow {
    date?: string;
    week_key?: string;
    week_start?: string;
    week_end?: string;
    month_key?: string;
    short_label: string;
    label: string;
    total_orders: number;
    paid_orders_count: number;
    unpaid_orders_count: number;
    cancelled_orders_count: number;
    gross_revenue: number;
    refund_amount: number;
    net_revenue: number;
    unpaid_amount: number;
    average_order_value: number;
}

interface RecapTotals {
    total_orders: number;
    paid_orders_count: number;
    unpaid_orders_count: number;
    cancelled_orders_count: number;
    gross_revenue: number;
    refund_amount: number;
    net_revenue: number;
    unpaid_amount: number;
    average_order_value: number;
}

interface RecapsData {
    daily: { rows: RecapRow[]; totals: RecapTotals };
    weekly: { rows: RecapRow[]; totals: RecapTotals };
    monthly: { rows: RecapRow[]; totals: RecapTotals };
}

interface ChartPoint {
    key: string;
    label: string;
    full_label: string;
    net_revenue: number;
    gross_revenue: number;
    paid_orders_count: number;
    total_orders_count: number;
    unpaid_amount: number;
    refund_amount: number;
    average_order_value: number;
}

interface ChartData {
    aggregation: 'daily' | 'weekly' | 'monthly';
    has_transactions: boolean;
    max_revenue: number;
    total_revenue: number;
    total_paid_orders: number;
    data: ChartPoint[];
}

interface TransactionOption {
    id: number;
    group_name: string;
    option_name: string;
    additional_price: number;
}

interface TransactionItem {
    id: number;
    menu_name: string;
    quantity: number;
    base_price: number;
    subtotal_options: number;
    unit_price: number;
    total_price: number;
    customer_notes: string | null;
    status: 'active' | 'rejected';
    rejection_reason: string | null;
    rejected_at_formatted: string | null;
    rejected_by_name: string | null;
    options: TransactionOption[];
}

interface StatusHistoryItem {
    id: number;
    status: string;
    status_label: string;
    notes: string | null;
    created_at: string;
    created_at_formatted: string;
    actor_name: string;
}

interface TransactionRecord {
    id: number;
    order_number: string;
    customer_name: string;
    table_number: string;
    table_name: string | null;
    transaction_date: string;
    transaction_date_formatted: string;
    created_at: string;
    created_at_formatted: string;
    paid_at: string | null;
    paid_at_formatted: string | null;
    payment_method: string | null;
    payment_method_label: string;
    payment_reference: string | null;
    payment_status: 'paid' | 'unpaid' | 'failed' | 'refunded' | string;
    payment_status_label: string;
    order_status: 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled' | string;
    order_status_label: string;
    initial_gross_amount: number;
    rejected_items_amount: number;
    subtotal: number;
    discount_amount: number | null;
    discount_supported: boolean;
    additional_fees_amount: number | null;
    additional_fees_supported: boolean;
    refund_amount: number;
    refunded_at_formatted: string | null;
    refund_reason: string | null;
    total_amount: number;
    net_revenue: number;
    is_realized_revenue: boolean;
    cash_received: number | null;
    change_amount: number | null;
    confirmed_by_name: string | null;
    notes: string | null;
    items_summary: string;
    items: TransactionItem[];
    status_histories: StatusHistoryItem[];
}

interface PaginatedTransactions {
    data: TransactionRecord[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
}

interface FiltersState {
    preset: string;
    start_date: string;
    end_date: string;
    period_label: string;
    aggregation: string;
    effective_aggregation: 'daily' | 'weekly' | 'monthly';
    recap_view: 'daily' | 'weekly' | 'monthly';
    search: string;
    payment_status: string;
    order_status: string;
    payment_method: string;
    sort_by: string;
    sort_dir: string;
    per_page: number;
}

interface FilteredTableTotals {
    count: number;
    subtotal: number;
    refund_amount: number;
    net_revenue: number;
    unpaid_amount: number;
}

interface CalculationRules {
    timezone: string;
    week_definition: string;
    authoritative_source: string;
    transaction_date_basis: string;
    realized_revenue_formula: string;
    unpaid_policy: string;
    cancelled_and_failed_policy: string;
    discount_support: string;
    additional_fees_support: string;
    profit_disclaimer: string;
}

interface Props {
    filters: FiltersState;
    summary: SummaryData;
    recaps: RecapsData;
    chart: ChartData;
    transactions: PaginatedTransactions;
    filtered_table_totals: FilteredTableTotals;
    calculation_rules: CalculationRules;
    synced_at: string;
}

const PRESET_OPTIONS = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'yesterday', label: 'Kemarin' },
    { key: 'last_7_days', label: '7 Hari Terakhir' },
    { key: 'this_week', label: 'Minggu Ini' },
    { key: 'this_month', label: 'Bulan Ini' },
    { key: 'last_month', label: 'Bulan Lalu' },
    { key: 'custom', label: 'Rentang Kustom' },
];

export default function FinancialReportsIndex({
    filters,
    summary,
    recaps,
    chart,
    transactions,
    filtered_table_totals,
    calculation_rules,
    synced_at,
}: Props) {
    const [startDate, setStartDate] = useState(filters.start_date);
    const [endDate, setEndDate] = useState(filters.end_date);
    const [dateError, setDateError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [recapTab, setRecapTab] = useState<'daily' | 'weekly' | 'monthly'>(filters.recap_view || 'daily');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isAutoSync, setIsAutoSync] = useState(true);
    const [selectedTx, setSelectedTx] = useState<TransactionRecord | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const pollRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        setStartDate(filters.start_date);
        setEndDate(filters.end_date);
    }, [filters.start_date, filters.end_date]);

    const formatRupiah = (amount: number | string | null | undefined) => {
        const num = typeof amount === 'string' ? parseFloat(amount) || 0 : amount || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(num);
    };

    const formatCompactRupiah = (amount: number) => {
        if (amount >= 1_000_000_000) {
            return `Rp ${(amount / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
        }
        if (amount >= 1_000_000) {
            return `Rp ${(amount / 1_000_000).toFixed(1).replace('.', ',')} jt`;
        }
        if (amount >= 1_000) {
            return `Rp ${Math.round(amount / 1_000)} rb`;
        }
        return `Rp ${Math.round(amount)}`;
    };

    const applyFilters = (overrides: Partial<FiltersState>) => {
        const nextParams: Record<string, string | number> = {
            preset: overrides.preset ?? filters.preset,
            start_date: overrides.start_date ?? startDate,
            end_date: overrides.end_date ?? endDate,
            aggregation: overrides.aggregation ?? filters.aggregation,
            recap_view: overrides.recap_view ?? recapTab,
            search: overrides.search !== undefined ? overrides.search : searchQuery,
            payment_status: overrides.payment_status ?? filters.payment_status,
            order_status: overrides.order_status ?? filters.order_status,
            payment_method: overrides.payment_method ?? filters.payment_method,
            sort_by: overrides.sort_by ?? filters.sort_by,
            sort_dir: overrides.sort_dir ?? filters.sort_dir,
            per_page: overrides.per_page ?? filters.per_page,
        };

        setIsRefreshing(true);
        router.get('/admin/financial-reports', nextParams, {
            preserveState: true,
            preserveScroll: true,
            onFinish: () => setIsRefreshing(false),
        });
    };

    const handlePresetSelect = (presetKey: string) => {
        setDateError(null);
        if (presetKey === 'custom') {
            applyFilters({ preset: 'custom', start_date: startDate, end_date: endDate });
            return;
        }
        applyFilters({ preset: presetKey });
    };

    const handleCustomDateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!startDate || !endDate) {
            setDateError('Tanggal mulai dan tanggal akhir wajib diisi.');
            return;
        }
        if (endDate < startDate) {
            setDateError('Tanggal akhir tidak boleh lebih awal dari tanggal mulai.');
            return;
        }
        setDateError(null);
        applyFilters({
            preset: 'custom',
            start_date: startDate,
            end_date: endDate,
        });
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        applyFilters({ search: searchQuery });
    };

    const handleSort = (column: string) => {
        const nextDir = filters.sort_by === column && filters.sort_dir === 'desc' ? 'asc' : 'desc';
        applyFilters({ sort_by: column, sort_dir: nextDir });
    };

    const handleManualRefresh = () => {
        setIsRefreshing(true);
        router.reload({
            onFinish: () => {
                setIsRefreshing(false);
                toast.success('Data laporan keuangan berhasil disinkronkan.');
            },
        });
    };

    // Sinkronisasi berkala setiap 15 detik & saat tab kembali aktif
    useEffect(() => {
        if (pollRef.current) clearTimeout(pollRef.current);
        if (!isAutoSync) return;

        pollRef.current = setTimeout(() => {
            if (!document.hidden && !isRefreshing) {
                router.reload({
                    only: ['summary', 'recaps', 'chart', 'transactions', 'filtered_table_totals', 'synced_at'],
                });
            }
        }, 15000);

        return () => {
            if (pollRef.current) clearTimeout(pollRef.current);
        };
    }, [isAutoSync, isRefreshing, synced_at]);

    useEffect(() => {
        const onFocus = () => {
            if (!document.hidden && isAutoSync && !isRefreshing) {
                router.reload({
                    only: ['summary', 'recaps', 'chart', 'transactions', 'filtered_table_totals', 'synced_at'],
                });
            }
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [isAutoSync, isRefreshing]);

    // Bangun query string aktif untuk tautan unduh CSV & PDF
    const exportQueryString = useMemo(() => {
        const params = new URLSearchParams({
            preset: filters.preset,
            start_date: filters.start_date,
            end_date: filters.end_date,
            aggregation: filters.aggregation,
            recap_view: recapTab,
            search: filters.search || '',
            payment_status: filters.payment_status,
            order_status: filters.order_status,
            payment_method: filters.payment_method,
            sort_by: filters.sort_by,
            sort_dir: filters.sort_dir,
        });
        return params.toString();
    }, [filters, recapTab]);

    const currentRecapData = useMemo(() => {
        return recaps[recapTab] || recaps.daily;
    }, [recaps, recapTab]);

    // Sumbu Y untuk Grafik
    const yAxisTicks = useMemo(() => {
        const max = Math.max(chart.max_revenue, 100000);
        return [max, max * 0.75, max * 0.5, max * 0.25, 0];
    }, [chart.max_revenue]);

    const renderGrowthBadge = (percent: number | null) => {
        if (percent === null || percent === undefined) return null;
        const isPositive = percent >= 0;
        return (
            <span
                className={`inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                    isPositive
                        ? 'bg-[#DCFCE7] text-[#15803D]'
                        : 'bg-[#FEE2E2] text-[#B91C1C]'
                }`}
            >
                {isPositive ? (
                    <ArrowUpRight className="size-3" />
                ) : (
                    <ArrowDownRight className="size-3" />
                )}
                {isPositive ? '+' : ''}
                {percent}%
            </span>
        );
    };

    const openTransactionDetail = (tx: TransactionRecord) => {
        setSelectedTx(tx);
        setIsDetailOpen(true);
    };

    return (
        <>
            <Head title="Laporan Keuangan & Analitik Pendapatan" />

            <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-7 bg-[#FAF6EC] min-h-screen font-sans text-neutral-800 antialiased">
                {/* ========================================================================= */}
                {/* 1. HEADER & EKSPOR LAPORAN */}
                {/* ========================================================================= */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-[#E8DFC8] pb-4">
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-neutral-900">
                                Laporan Keuangan &amp; Pendapatan
                            </h1>
                            <span className="bg-[#C52828] text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-2xs uppercase tracking-wider">
                                Financial Analytics
                            </span>
                            <span className="bg-[#FAF5E8] border border-[#DFCFA9] text-neutral-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                WIB (Asia/Jakarta)
                            </span>
                        </div>
                        <p className="text-xs text-neutral-600 font-medium mt-1">
                            Laporan pendapatan bersih terealisasi, rekapitulasi periodik, dan audit transaksi aktual SIDE LINE Cafe • Terakhir disinkronkan:{' '}
                            <strong className="text-neutral-800">{synced_at}</strong>
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsAutoSync(!isAutoSync)}
                            className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 shadow-2xs transition-colors ${
                                isAutoSync
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'bg-neutral-100 border-neutral-300 text-neutral-500'
                            }`}
                        >
                            <span
                                className={`size-2 rounded-full ${
                                    isAutoSync ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'
                                }`}
                            />
                            <span>{isAutoSync ? 'Auto-Sync Aktif' : 'Sync Dijeda'}</span>
                        </button>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleManualRefresh}
                            disabled={isRefreshing}
                            className="h-9 bg-white border-[#DFCFA9] hover:bg-[#FAF5E8] text-neutral-800 text-xs font-bold rounded-xl gap-1.5"
                        >
                            <RefreshCw className={`size-3.5 text-[#C52828] ${isRefreshing ? 'animate-spin' : ''}`} />
                            <span>Sync</span>
                        </Button>

                        <a
                            href={`/admin/financial-reports/export/csv?${exportQueryString}`}
                            className="h-9 px-3.5 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                        >
                            <FileSpreadsheet className="size-3.5 text-emerald-400" />
                            <span>Ekspor CSV</span>
                        </a>

                        <a
                            href={`/admin/financial-reports/export/pdf?${exportQueryString}`}
                            className="h-9 px-3.5 bg-[#C52828] hover:bg-[#A81E1E] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                        >
                            <FileText className="size-3.5" />
                            <span>Ekspor PDF</span>
                        </a>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 2. FILTER TANGGAL & PERIODE */}
                {/* ========================================================================= */}
                <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs space-y-3">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        {/* Preset Buttons */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                            {PRESET_OPTIONS.map((preset) => {
                                const active = filters.preset === preset.key;
                                return (
                                    <button
                                        key={preset.key}
                                        type="button"
                                        onClick={() => handlePresetSelect(preset.key)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                                            active
                                                ? 'bg-[#C52828] text-white shadow-2xs'
                                                : 'bg-[#FAF5E8] text-neutral-700 hover:bg-[#EFE5CF] border border-[#DFCFA9]'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Custom Date Range Picker */}
                        <form
                            onSubmit={handleCustomDateSubmit}
                            className="flex flex-wrap items-center gap-2"
                        >
                            <div className="flex items-center gap-1.5 bg-[#FAF5E8] border border-[#DFCFA9] rounded-xl px-2.5 py-1">
                                <Calendar className="size-3.5 text-[#C52828]" />
                                <span className="text-[11px] font-bold text-neutral-600">Dari:</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    aria-label="Tanggal Mulai"
                                    className="bg-transparent text-xs font-bold text-neutral-900 focus:outline-none"
                                />
                            </div>
                            <div className="flex items-center gap-1.5 bg-[#FAF5E8] border border-[#DFCFA9] rounded-xl px-2.5 py-1">
                                <Calendar className="size-3.5 text-[#C52828]" />
                                <span className="text-[11px] font-bold text-neutral-600">Sampai:</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    aria-label="Tanggal Akhir"
                                    className="bg-transparent text-xs font-bold text-neutral-900 focus:outline-none"
                                />
                            </div>
                            <Button
                                type="submit"
                                size="sm"
                                className="h-8 px-3 bg-[#18181B] hover:bg-black text-white text-xs font-bold rounded-xl"
                            >
                                Terapkan Tanggal
                            </Button>
                        </form>
                    </div>

                    {dateError && (
                        <div className="flex items-center gap-2 text-xs font-bold text-[#B91C1C] bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-3 py-2">
                            <AlertCircle className="size-4 shrink-0" />
                            <span>{dateError}</span>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-neutral-100 text-[11px] text-neutral-600 font-medium">
                        <div className="flex items-center gap-2">
                            <span className="inline-block size-2 rounded-full bg-[#C52828]" />
                            <span>
                                Periode Aktif: <strong className="text-neutral-900">{filters.period_label}</strong>
                            </span>
                        </div>
                        <span className="text-neutral-500">
                            Definisi Minggu: Senin 00:00 WIB s/d Minggu 23:59 WIB • Dasar Tanggal: Waktu Pembayaran Berhasil (WIB)
                        </span>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 3. KARTU RINGKASAN PENDAPATAN (BARIS 1: HARI INI, MINGGU INI, BULAN INI, PERIODE FILTER) */}
                {/* ========================================================================= */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Kartu 1: Pendapatan Hari Ini */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-600">
                                Pendapatan Hari Ini
                            </span>
                            <div className="size-8 rounded-xl bg-[#FAF5E8] border border-[#E8DFC8] flex items-center justify-center text-[#C52828]">
                                <Wallet className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <div className="text-2xl font-black text-neutral-900 tracking-tight">
                                {formatRupiah(summary.today_revenue)}
                            </div>
                            <div className="mt-1.5 flex items-center justify-between text-[11px] text-neutral-500 font-medium">
                                <div className="flex items-center gap-1.5">
                                    {renderGrowthBadge(summary.today_growth_percent)}
                                    <span>vs Kemarin ({formatRupiah(summary.yesterday_revenue)})</span>
                                </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-neutral-100 text-[11px] font-semibold text-neutral-700 flex items-center justify-between">
                                <span>Transaksi Lunas Hari Ini:</span>
                                <span className="font-black text-emerald-700">{summary.today_paid_count} transaksi</span>
                            </div>
                        </div>
                    </div>

                    {/* Kartu 2: Pendapatan Minggu Ini */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-xs font-bold text-neutral-600 block">
                                    Pendapatan Minggu Ini
                                </span>
                                <span className="text-[10px] text-neutral-400 font-medium">
                                    {summary.this_week_label}
                                </span>
                            </div>
                            <div className="size-8 rounded-xl bg-[#FAF5E8] border border-[#E8DFC8] flex items-center justify-center text-amber-700">
                                <Calendar className="size-4" />
                            </div>
                        </div>
                        <div className="mt-2.5">
                            <div className="text-2xl font-black text-neutral-900 tracking-tight">
                                {formatRupiah(summary.this_week_revenue)}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-500 font-medium">
                                {renderGrowthBadge(summary.this_week_growth_percent)}
                                <span>vs Minggu Lalu ({formatRupiah(summary.last_week_revenue)})</span>
                            </div>
                            <div className="mt-2 pt-2 border-t border-neutral-100 text-[11px] font-semibold text-neutral-700 flex items-center justify-between">
                                <span>Transaksi Lunas Minggu Ini:</span>
                                <span className="font-black text-emerald-700">{summary.this_week_paid_count} transaksi</span>
                            </div>
                        </div>
                    </div>

                    {/* Kartu 3: Pendapatan Bulan Ini */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-xs font-bold text-neutral-600 block">
                                    Pendapatan Bulan Ini
                                </span>
                                <span className="text-[10px] text-neutral-400 font-medium">
                                    {summary.this_month_label}
                                </span>
                            </div>
                            <div className="size-8 rounded-xl bg-[#FAF5E8] border border-[#E8DFC8] flex items-center justify-center text-emerald-700">
                                <TrendingUp className="size-4" />
                            </div>
                        </div>
                        <div className="mt-2.5">
                            <div className="text-2xl font-black text-neutral-900 tracking-tight">
                                {formatRupiah(summary.this_month_revenue)}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-500 font-medium">
                                {renderGrowthBadge(summary.this_month_growth_percent)}
                                <span>vs Bulan Lalu ({formatRupiah(summary.last_month_revenue)})</span>
                            </div>
                            <div className="mt-2 pt-2 border-t border-neutral-100 text-[11px] font-semibold text-neutral-700 flex items-center justify-between">
                                <span>Transaksi Lunas Bulan Ini:</span>
                                <span className="font-black text-emerald-700">{summary.this_month_paid_count} transaksi</span>
                            </div>
                        </div>
                    </div>

                    {/* Kartu 4: Total Pendapatan Bersih Periode Filter */}
                    <div className="bg-[#FFFDF9] border-2 border-[#C52828]/40 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-xs font-extrabold text-[#C52828] block">
                                    Pendapatan Bersih (Periode Filter)
                                </span>
                                <span className="text-[10px] text-neutral-500 font-semibold line-clamp-1">
                                    {summary.period.label}
                                </span>
                            </div>
                            <div className="size-8 rounded-xl bg-[#FDECEC] border border-[#F8D7D7] flex items-center justify-center text-[#C52828]">
                                <Receipt className="size-4" />
                            </div>
                        </div>
                        <div className="mt-2.5">
                            <div className="text-2xl font-black text-[#C52828] tracking-tight">
                                {formatRupiah(summary.period.net_revenue)}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-500 font-medium">
                                {renderGrowthBadge(summary.period.period_growth_percent)}
                                <span className="truncate">
                                    vs {formatRupiah(summary.period.previous_period_revenue)}
                                </span>
                            </div>
                            <div className="mt-2 pt-2 border-t border-[#E8DFC8] text-[11px] font-semibold text-neutral-700 flex items-center justify-between">
                                <span>Bruto Lunas:</span>
                                <span className="font-mono font-bold">{formatRupiah(summary.period.gross_revenue)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 4. KARTU RINGKASAN KEJELASAN STATUS TRANSAKSI (BARIS 2: LUNAS, AOV, BELUM DIBAYAR, GAGAL/REFUND) */}
                {/* ========================================================================= */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Kartu 5: Total Transaksi Berhasil */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-600">
                                Total Transaksi Berhasil
                            </span>
                            <span className="bg-[#DCFCE7] text-[#15803D] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                Diakui Pendapatan
                            </span>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="text-2xl font-black text-neutral-900">
                                {summary.period.paid_transactions_count}
                            </span>
                            <span className="text-xs font-semibold text-neutral-500">
                                dari {summary.period.total_orders_count} total pesanan
                            </span>
                        </div>
                        <p className="mt-2 text-[11px] text-neutral-500 font-medium">
                            Hanya transaksi berstatus <strong>Lunas (Paid)</strong> dan tidak dibatalkan yang dihitung sebagai pendapatan.
                        </p>
                    </div>

                    {/* Kartu 6: Rata-rata Nilai Transaksi (AOV) */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-4 shadow-xs">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-600">
                                Rata-rata Nilai Transaksi (AOV)
                            </span>
                            {renderGrowthBadge(summary.period.aov_growth_percent)}
                        </div>
                        <div className="mt-3">
                            <span className="text-2xl font-black text-neutral-900">
                                {formatRupiah(summary.period.average_order_value)}
                            </span>
                        </div>
                        <p className="mt-2 text-[11px] text-neutral-500 font-medium">
                            Periode sebelumnya: <strong>{formatRupiah(summary.period.previous_aov)}</strong> per transaksi lunas.
                        </p>
                    </div>

                    {/* Kartu 7: Pembayaran Menunggu (Belum Dibayar - Bukan Pendapatan) */}
                    <div className="bg-[#FFFDF9] border border-amber-200 rounded-2xl p-4 shadow-xs">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-800">
                                Pembayaran Menunggu (Unpaid)
                            </span>
                            <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                Bukan Pendapatan
                            </span>
                        </div>
                        <div className="mt-3 flex items-baseline justify-between">
                            <div>
                                <span className="text-2xl font-black text-amber-700">
                                    {summary.period.pending_payments_count}
                                </span>
                                <span className="text-xs font-semibold text-neutral-500 ml-1">
                                    pesanan
                                </span>
                            </div>
                            <span className="text-sm font-black font-mono text-amber-800">
                                {formatRupiah(summary.period.pending_payments_amount)}
                            </span>
                        </div>
                        <p className="mt-2 text-[11px] text-amber-800/80 font-medium">
                            Nilai pesanan yang belum dibayar dipisahkan dan <strong>tidak dihitung</strong> ke dalam pendapatan aktual.
                        </p>
                    </div>

                    {/* Kartu 8: Transaksi Gagal / Dibatalkan & Refund */}
                    <div className="bg-[#FFFDF9] border border-rose-200 rounded-2xl p-4 shadow-xs">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-rose-800">
                                Gagal / Dibatalkan &amp; Refund
                            </span>
                            <span className="bg-rose-100 text-rose-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                Dikecualikan / Pengurang
                            </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="p-2 rounded-xl bg-rose-50/70 border border-rose-100">
                                <span className="text-[10px] font-bold text-rose-700 block">
                                    Batal / Gagal ({summary.period.failed_or_cancelled_count})
                                </span>
                                <span className="text-xs font-black font-mono text-rose-900">
                                    {formatRupiah(summary.period.failed_or_cancelled_amount)}
                                </span>
                            </div>
                            <div className="p-2 rounded-xl bg-purple-50/70 border border-purple-100">
                                <span className="text-[10px] font-bold text-purple-700 block">
                                    Refund ({summary.period.refunded_count})
                                </span>
                                <span className="text-xs font-black font-mono text-purple-900">
                                    {formatRupiah(summary.period.refund_amount)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 5. GRAFIK TREN PENDAPATAN & KOMPOSISI METODE PEMBAYARAN */}
                {/* ========================================================================= */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Grafik Tren Pendapatan (2 Kolom) */}
                    <div className="lg:col-span-2 bg-white border border-[#E8DFC8] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                        <div>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#E8DFC8]">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <BarChart3 className="size-4 text-[#C52828]" />
                                        <h2 className="text-sm font-extrabold text-neutral-900">
                                            Grafik Tren Pendapatan Terealisasi
                                        </h2>
                                    </div>
                                    <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                                        Tren pendapatan bersih berdasarkan tanggal pembayaran (WIB) • Periode tanpa transaksi ditampilkan Rp 0
                                    </p>
                                </div>

                                {/* Pilihan Agregasi Grafik */}
                                <div className="flex items-center gap-1 bg-[#FAF5E8] border border-[#DFCFA9] p-1 rounded-xl">
                                    {[
                                        { key: 'auto', label: 'Otomatis' },
                                        { key: 'daily', label: 'Harian' },
                                        { key: 'weekly', label: 'Mingguan' },
                                        { key: 'monthly', label: 'Bulanan' },
                                    ].map((agg) => {
                                        const active = filters.aggregation === agg.key;
                                        return (
                                            <button
                                                key={agg.key}
                                                type="button"
                                                onClick={() => applyFilters({ aggregation: agg.key })}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                                    active
                                                        ? 'bg-[#18181B] text-white'
                                                        : 'text-neutral-700 hover:bg-[#EFE5CF]'
                                                }`}
                                            >
                                                {agg.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Area Grafik dengan Sumbu Y & Sumbu X */}
                            <div className="mt-5 relative">
                                {!chart.has_transactions && (
                                    <div className="mb-3 p-3 rounded-xl bg-[#FAF5E8] border border-[#DFCFA9] flex items-center gap-2.5 text-xs text-neutral-700">
                                        <Info className="size-4 text-[#C52828] shrink-0" />
                                        <span>
                                            Belum ada transaksi lunas pada periode ini. Grafik menampilkan garis dasar <strong>Rp 0</strong> untuk seluruh titik waktu pada periode terpilih.
                                        </span>
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    {/* Label Sumbu Y (Rupiah) */}
                                    <div className="flex flex-col justify-between h-56 pb-6 text-right pr-2 border-r border-[#E8DFC8] select-none shrink-0">
                                        {yAxisTicks.map((tick, i) => (
                                            <span
                                                key={i}
                                                className="text-[10px] font-mono font-bold text-neutral-500 leading-none"
                                            >
                                                {formatCompactRupiah(tick)}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Batang Grafik */}
                                    <div className="flex-1 overflow-x-auto">
                                        <div
                                            className="flex h-56 items-end gap-1.5 sm:gap-2 border-b border-[#E8DFC8] pb-2 min-w-[360px]"
                                        >
                                            {chart.data.map((point) => {
                                                const maxVal = Math.max(chart.max_revenue, 100000);
                                                const heightPct =
                                                    point.net_revenue > 0
                                                        ? Math.max(8, Math.round((point.net_revenue / maxVal) * 100))
                                                        : 2;

                                                return (
                                                    <div
                                                        key={point.key}
                                                        className="group relative flex flex-1 flex-col items-center h-full justify-end min-w-[26px]"
                                                    >
                                                        {/* Tooltip */}
                                                        <div className="pointer-events-none absolute -top-20 z-30 hidden group-hover:flex flex-col items-start rounded-xl bg-[#18181B] px-3 py-2 text-left text-[11px] text-white shadow-lg whitespace-nowrap border border-neutral-700">
                                                            <span className="font-extrabold text-[#DFCFA9]">
                                                                {point.full_label}
                                                            </span>
                                                            <span className="font-mono font-bold text-white mt-0.5">
                                                                Pendapatan: {formatRupiah(point.net_revenue)}
                                                            </span>
                                                            <span className="text-[10px] text-neutral-300">
                                                                {point.paid_orders_count} lunas • AOV {formatRupiah(point.average_order_value)}
                                                            </span>
                                                            {point.unpaid_amount > 0 && (
                                                                <span className="text-[10px] text-amber-300">
                                                                    Belum bayar: {formatRupiah(point.unpaid_amount)}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Bar */}
                                                        <div
                                                            className={`w-full max-w-[36px] rounded-t-md transition-all duration-300 ${
                                                                point.net_revenue > 0
                                                                    ? 'bg-[#C52828] group-hover:bg-[#A81E1E]'
                                                                    : 'bg-neutral-200'
                                                            }`}
                                                            style={{ height: `${heightPct}%` }}
                                                        />

                                                        {/* Label Sumbu X */}
                                                        <span className="mt-2 text-[10px] font-bold text-neutral-600 truncate max-w-[54px]">
                                                            {point.label}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
                            <div className="flex items-center gap-4">
                                <span className="inline-flex items-center gap-1.5 font-bold text-neutral-800">
                                    <span className="size-2.5 rounded-sm bg-[#C52828]" />
                                    Pendapatan Bersih Terealisasi
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-neutral-500">
                                    <span className="size-2.5 rounded-sm bg-neutral-200" />
                                    Periode Tanpa Transaksi (Rp 0)
                                </span>
                            </div>
                            <span className="font-bold text-neutral-900">
                                Total Grafik Periode: <span className="font-mono text-[#C52828]">{formatRupiah(chart.total_revenue)}</span> ({chart.total_paid_orders} transaksi lunas)
                            </span>
                        </div>
                    </div>

                    {/* Komposisi Metode Pembayaran & Ringkasan Kebijakan (1 Kolom) */}
                    <div className="bg-white border border-[#E8DFC8] rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                        <div>
                            <div className="flex items-center gap-2 pb-3 border-b border-[#E8DFC8]">
                                <CreditCard className="size-4 text-[#C52828]" />
                                <div>
                                    <h2 className="text-sm font-extrabold text-neutral-900">
                                        Metode Pembayaran Terealisasi
                                    </h2>
                                    <p className="text-[11px] text-neutral-500 font-medium">
                                        Distribusi pendapatan lunas per metode bayar
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 space-y-3">
                                {summary.payment_methods.map((pm) => {
                                    const pct =
                                        summary.period.net_revenue > 0
                                            ? Math.round((pm.net_revenue / summary.period.net_revenue) * 100)
                                            : 0;

                                    return (
                                        <div
                                            key={pm.method}
                                            className="p-3 rounded-xl bg-[#FAF5E8]/70 border border-[#E8DFC8] space-y-1.5"
                                        >
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-bold text-neutral-900">
                                                    {pm.label}
                                                </span>
                                                <span className="font-mono font-black text-neutral-900">
                                                    {formatRupiah(pm.net_revenue)}
                                                </span>
                                            </div>
                                            <div className="h-2 w-full rounded-full bg-[#E8DFC8] overflow-hidden">
                                                <div
                                                    className="h-full bg-[#C52828] rounded-full transition-all"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] font-semibold text-neutral-500">
                                                <span>{pm.transactions_count} transaksi berhasil</span>
                                                <span>{pct}% dari total pendapatan</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Catatan Penting Omzet vs Laba */}
                        <div className="p-3 rounded-xl bg-[#FEF9C3]/70 border border-[#FEF08A] text-[11px] text-[#854D0E] space-y-1">
                            <div className="font-extrabold flex items-center gap-1.5">
                                <ShieldCheck className="size-4 shrink-0 text-[#854D0E]" />
                                <span>Catatan Akuntansi (Omzet vs Laba)</span>
                            </div>
                            <p className="leading-relaxed">
                                {calculation_rules.profit_disclaimer}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 6. REKAPITULASI PENDAPATAN HARIAN, MINGGUAN, DAN BULANAN */}
                {/* ========================================================================= */}
                <div className="bg-white border border-[#E8DFC8] rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E8DFC8] pb-4">
                        <div>
                            <h2 className="text-base font-extrabold text-neutral-900">
                                Rekapitulasi Pendapatan Periodik (Harian, Mingguan &amp; Bulanan)
                            </h2>
                            <p className="text-xs text-neutral-500 font-medium mt-0.5">
                                Perhitungan otomatis dari transaksi valid tanpa mencampurkan periode sebelumnya dengan periode berjalan
                            </p>
                        </div>

                        {/* Pilihan Tampilan Harian / Mingguan / Bulanan */}
                        <div className="flex items-center gap-1 bg-[#FAF5E8] border border-[#DFCFA9] p-1 rounded-xl self-start sm:self-auto">
                            {[
                                { key: 'daily' as const, label: 'Rekap Harian' },
                                { key: 'weekly' as const, label: 'Rekap Mingguan' },
                                { key: 'monthly' as const, label: 'Rekap Bulanan' },
                            ].map((tab) => {
                                const active = recapTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setRecapTab(tab.key)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                            active
                                                ? 'bg-[#C52828] text-white shadow-2xs'
                                                : 'text-neutral-700 hover:bg-[#EFE5CF]'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Ringkasan Cepat Minggu Berjalan, Bulan Berjalan, dan Total Periode Filter */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl bg-[#FAF5E8] border border-[#DFCFA9] flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold text-neutral-500 uppercase block">
                                    Total Selama Minggu Berjalan
                                </span>
                                <span className="text-xs font-semibold text-neutral-600">
                                    {summary.this_week_label}
                                </span>
                            </div>
                            <span className="text-sm font-black font-mono text-neutral-900">
                                {formatRupiah(summary.this_week_revenue)}
                            </span>
                        </div>

                        <div className="p-3 rounded-xl bg-[#FAF5E8] border border-[#DFCFA9] flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold text-neutral-500 uppercase block">
                                    Total Selama Bulan Berjalan
                                </span>
                                <span className="text-xs font-semibold text-neutral-600">
                                    {summary.this_month_label}
                                </span>
                            </div>
                            <span className="text-sm font-black font-mono text-neutral-900">
                                {formatRupiah(summary.this_month_revenue)}
                            </span>
                        </div>

                        <div className="p-3 rounded-xl bg-[#FDECEC]/60 border border-[#F8D7D7] flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold text-[#C52828] uppercase block">
                                    Total Keseluruhan Periode Filter
                                </span>
                                <span className="text-xs font-semibold text-neutral-700">
                                    {filters.period_label}
                                </span>
                            </div>
                            <span className="text-sm font-black font-mono text-[#C52828]">
                                {formatRupiah(currentRecapData.totals.net_revenue)}
                            </span>
                        </div>
                    </div>

                    {/* Tabel Rekapitulasi */}
                    <div className="overflow-x-auto rounded-xl border border-[#E8DFC8]">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-[#FAF5E8] border-b border-[#E8DFC8] text-neutral-700 font-extrabold">
                                <tr>
                                    <th className="py-3 px-4">
                                        {recapTab === 'daily'
                                            ? 'Tanggal (WIB)'
                                            : recapTab === 'weekly'
                                              ? 'Rentang Minggu (Senin - Minggu)'
                                              : 'Bulan'}
                                    </th>
                                    <th className="py-3 px-3 text-center">Total Pesanan</th>
                                    <th className="py-3 px-3 text-center">Transaksi Lunas</th>
                                    <th className="py-3 px-3 text-center">Menunggu Bayar</th>
                                    <th className="py-3 px-3 text-center">Batal / Gagal</th>
                                    <th className="py-3 px-4 text-right">Bruto Lunas</th>
                                    <th className="py-3 px-4 text-right">Refund</th>
                                    <th className="py-3 px-4 text-right">Pendapatan Bersih</th>
                                    <th className="py-3 px-4 text-right">Nilai Belum Dibayar</th>
                                    <th className="py-3 px-4 text-right">Rata-rata (AOV)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8DFC8]/60 bg-white">
                                {currentRecapData.rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="py-8 text-center text-neutral-400">
                                            Tidak ada data rekapitulasi pada rentang tanggal ini.
                                        </td>
                                    </tr>
                                ) : (
                                    currentRecapData.rows.map((row, idx) => (
                                        <tr
                                            key={row.date || row.week_key || row.month_key || idx}
                                            className="hover:bg-[#FAF5E8]/40 transition-colors"
                                        >
                                            <td className="py-2.5 px-4 font-bold text-neutral-900">
                                                {row.label}
                                            </td>
                                            <td className="py-2.5 px-3 text-center font-semibold text-neutral-700">
                                                {row.total_orders}
                                            </td>
                                            <td className="py-2.5 px-3 text-center">
                                                <span className="bg-[#DCFCE7] text-[#15803D] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                                    {row.paid_orders_count}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-center">
                                                <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                                    {row.unpaid_orders_count}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-center">
                                                <span className="bg-rose-100 text-rose-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                                    {row.cancelled_orders_count}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono text-neutral-700">
                                                {formatRupiah(row.gross_revenue)}
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono text-rose-700">
                                                {row.refund_amount > 0 ? `- ${formatRupiah(row.refund_amount)}` : 'Rp 0'}
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono font-extrabold text-neutral-900">
                                                {formatRupiah(row.net_revenue)}
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono text-amber-800">
                                                {formatRupiah(row.unpaid_amount)}
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono text-neutral-600">
                                                {formatRupiah(row.average_order_value)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            <tfoot className="bg-[#FAF5E8] border-t-2 border-[#DFCFA9] font-extrabold text-neutral-900">
                                <tr>
                                    <td className="py-3 px-4">TOTAL KESELURUHAN PERIODE FILTER</td>
                                    <td className="py-3 px-3 text-center">{currentRecapData.totals.total_orders}</td>
                                    <td className="py-3 px-3 text-center text-emerald-700">
                                        {currentRecapData.totals.paid_orders_count}
                                    </td>
                                    <td className="py-3 px-3 text-center text-amber-800">
                                        {currentRecapData.totals.unpaid_orders_count}
                                    </td>
                                    <td className="py-3 px-3 text-center text-rose-700">
                                        {currentRecapData.totals.cancelled_orders_count}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono">
                                        {formatRupiah(currentRecapData.totals.gross_revenue)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-rose-700">
                                        {currentRecapData.totals.refund_amount > 0
                                            ? `- ${formatRupiah(currentRecapData.totals.refund_amount)}`
                                            : 'Rp 0'}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-[#C52828]">
                                        {formatRupiah(currentRecapData.totals.net_revenue)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-amber-800">
                                        {formatRupiah(currentRecapData.totals.unpaid_amount)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono">
                                        {formatRupiah(currentRecapData.totals.average_order_value)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 7. DETAIL TRANSAKSI DAN RIWAYAT KEUANGAN */}
                {/* ========================================================================= */}
                <div className="bg-white border border-[#E8DFC8] rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-[#E8DFC8] pb-4">
                        <div>
                            <h2 className="text-base font-extrabold text-neutral-900">
                                Detail Transaksi &amp; Riwayat Keuangan
                            </h2>
                            <p className="text-xs text-neutral-500 font-medium mt-0.5">
                                Klik salah satu baris transaksi untuk membuka rincian item pesanan, waktu pembayaran, dan riwayat audit status
                            </p>
                        </div>

                        {/* Filter Pencarian, Status Pembayaran, Status Pesanan, Metode Pembayaran */}
                        <div className="flex flex-wrap items-center gap-2">
                            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Cari ID Pesanan, Pelanggan, Meja..."
                                    className="h-9 pl-9 pr-8 bg-[#FAF5E8] border-[#DFCFA9] text-xs rounded-xl"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchQuery('');
                                            applyFilters({ search: '' });
                                        }}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                )}
                            </form>

                            {/* Filter Status Pembayaran */}
                            <Select
                                value={filters.payment_status}
                                onValueChange={(val) => applyFilters({ payment_status: val })}
                            >
                                <SelectTrigger className="h-9 text-xs bg-[#FAF5E8] border-[#DFCFA9] rounded-xl w-40 font-semibold">
                                    <SelectValue placeholder="Status Bayar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Semua Status Bayar</SelectItem>
                                    <SelectItem value="paid">Lunas (Paid)</SelectItem>
                                    <SelectItem value="unpaid">Menunggu Bayar</SelectItem>
                                    <SelectItem value="failed">Gagal (Failed)</SelectItem>
                                    <SelectItem value="refunded">Refund</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Filter Metode Pembayaran */}
                            <Select
                                value={filters.payment_method}
                                onValueChange={(val) => applyFilters({ payment_method: val })}
                            >
                                <SelectTrigger className="h-9 text-xs bg-[#FAF5E8] border-[#DFCFA9] rounded-xl w-36 font-semibold">
                                    <SelectValue placeholder="Metode Bayar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Semua Metode</SelectItem>
                                    <SelectItem value="cash">Tunai (Cash)</SelectItem>
                                    <SelectItem value="qris">QRIS</SelectItem>
                                    <SelectItem value="transfer">Transfer Bank</SelectItem>
                                    <SelectItem value="debit">Kartu Debit</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Filter Status Pesanan */}
                            <Select
                                value={filters.order_status}
                                onValueChange={(val) => applyFilters({ order_status: val })}
                            >
                                <SelectTrigger className="h-9 text-xs bg-[#FAF5E8] border-[#DFCFA9] rounded-xl w-36 font-semibold">
                                    <SelectValue placeholder="Status Pesanan" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Semua Status Order</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="processing">Sedang Diracik</SelectItem>
                                    <SelectItem value="ready">Siap Saji</SelectItem>
                                    <SelectItem value="completed">Selesai</SelectItem>
                                    <SelectItem value="cancelled">Dibatalkan</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Tabel Transaksi */}
                    <div className="overflow-x-auto rounded-xl border border-[#E8DFC8]">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-[#FAF5E8] border-b border-[#E8DFC8] text-neutral-700 font-extrabold">
                                <tr>
                                    <th className="py-3 px-3">
                                        <button
                                            type="button"
                                            onClick={() => handleSort('transaction_date')}
                                            className="inline-flex items-center gap-1 hover:text-[#C52828]"
                                        >
                                            <span>Tanggal &amp; Waktu (WIB)</span>
                                            <ArrowUpDown className="size-3" />
                                        </button>
                                    </th>
                                    <th className="py-3 px-3">
                                        <button
                                            type="button"
                                            onClick={() => handleSort('order_number')}
                                            className="inline-flex items-center gap-1 hover:text-[#C52828]"
                                        >
                                            <span>ID Pesanan</span>
                                            <ArrowUpDown className="size-3" />
                                        </button>
                                    </th>
                                    <th className="py-3 px-3">Meja</th>
                                    <th className="py-3 px-3">Metode Bayar</th>
                                    <th className="py-3 px-3 text-right">
                                        <button
                                            type="button"
                                            onClick={() => handleSort('total_amount')}
                                            className="inline-flex items-center gap-1 hover:text-[#C52828]"
                                        >
                                            <span>Subtotal</span>
                                            <ArrowUpDown className="size-3" />
                                        </button>
                                    </th>
                                    <th className="py-3 px-3 text-center">Diskon</th>
                                    <th className="py-3 px-3 text-center">Biaya Tambahan</th>
                                    <th className="py-3 px-3 text-right">Refund</th>
                                    <th className="py-3 px-3 text-right">Pendapatan Bersih</th>
                                    <th className="py-3 px-3 text-center">Status Bayar</th>
                                    <th className="py-3 px-3 text-center">Status Pesanan</th>
                                    <th className="py-3 px-3 text-right">Detail</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8DFC8]/60 bg-white">
                                {transactions.data.length === 0 ? (
                                    <tr>
                                        <td colSpan={12} className="py-12 text-center text-neutral-400">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <Receipt className="size-8 text-neutral-300" />
                                                <p className="text-xs font-bold text-neutral-600">
                                                    Tidak ada transaksi yang ditemukan untuk filter periode dan kriteria saat ini.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    transactions.data.map((tx) => (
                                        <tr
                                            key={tx.id}
                                            onClick={() => openTransactionDetail(tx)}
                                            className="hover:bg-[#FAF5E8]/50 transition-colors cursor-pointer"
                                        >
                                            {/* Tanggal & Waktu */}
                                            <td className="py-3 px-3 whitespace-nowrap">
                                                <div className="font-bold text-neutral-900">
                                                    {tx.transaction_date_formatted}
                                                </div>
                                                <div className="text-[10px] text-neutral-500">
                                                    {tx.paid_at_formatted
                                                        ? `Dibayar: ${tx.paid_at_formatted}`
                                                        : `Dibuat: ${tx.created_at_formatted}`}
                                                </div>
                                            </td>

                                            {/* ID Pesanan & Pelanggan */}
                                            <td className="py-3 px-3">
                                                <div className="font-mono font-bold text-neutral-900">
                                                    {tx.order_number}
                                                </div>
                                                <div className="text-[10px] text-neutral-500 font-medium">
                                                    {tx.customer_name}
                                                </div>
                                            </td>

                                            {/* Nomor Meja */}
                                            <td className="py-3 px-3">
                                                <span className="bg-[#18181B] text-white text-[10px] font-black px-2 py-0.5 rounded-md">
                                                    Meja {tx.table_number}
                                                </span>
                                            </td>

                                            {/* Metode Pembayaran */}
                                            <td className="py-3 px-3 font-semibold text-neutral-800">
                                                {tx.payment_method_label}
                                            </td>

                                            {/* Subtotal */}
                                            <td className="py-3 px-3 text-right font-mono font-semibold text-neutral-800">
                                                <div>{formatRupiah(tx.subtotal)}</div>
                                                {tx.rejected_items_amount > 0 && (
                                                    <div className="text-[10px] text-rose-600">
                                                        Ditolak: -{formatRupiah(tx.rejected_items_amount)}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Diskon */}
                                            <td className="py-3 px-3 text-center">
                                                <span
                                                    className="text-[10px] text-neutral-400 font-medium"
                                                    title="Fitur diskon belum didukung pada skema database saat ini"
                                                >
                                                    N/A
                                                </span>
                                            </td>

                                            {/* Biaya Tambahan */}
                                            <td className="py-3 px-3 text-center">
                                                <span
                                                    className="text-[10px] text-neutral-400 font-medium"
                                                    title="Biaya tambahan/pajak belum didukung pada skema database saat ini"
                                                >
                                                    N/A
                                                </span>
                                            </td>

                                            {/* Refund */}
                                            <td className="py-3 px-3 text-right font-mono text-rose-700">
                                                {tx.refund_amount > 0 ? `- ${formatRupiah(tx.refund_amount)}` : 'Rp 0'}
                                            </td>

                                            {/* Jumlah Bersih Pendapatan */}
                                            <td className="py-3 px-3 text-right font-mono font-extrabold">
                                                {tx.is_realized_revenue ? (
                                                    <span className="text-emerald-700">
                                                        {formatRupiah(tx.net_revenue)}
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-400" title="Belum/Tidak dihitung sebagai pendapatan terealisasi">
                                                        Rp 0
                                                    </span>
                                                )}
                                            </td>

                                            {/* Status Pembayaran */}
                                            <td className="py-3 px-3 text-center">
                                                {tx.payment_status === 'paid' ? (
                                                    <span className="bg-[#DCFCE7] text-[#15803D] text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                                        <Check className="size-3" />
                                                        Lunas
                                                    </span>
                                                ) : tx.payment_status === 'failed' ? (
                                                    <span className="bg-rose-100 text-rose-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                                        Gagal
                                                    </span>
                                                ) : tx.payment_status === 'refunded' ? (
                                                    <span className="bg-purple-100 text-purple-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                                        Refund
                                                    </span>
                                                ) : (
                                                    <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                                        Menunggu
                                                    </span>
                                                )}
                                            </td>

                                            {/* Status Pesanan */}
                                            <td className="py-3 px-3 text-center">
                                                {tx.order_status === 'completed' ? (
                                                    <span className="bg-neutral-100 text-neutral-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                        Selesai
                                                    </span>
                                                ) : tx.order_status === 'cancelled' ? (
                                                    <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                        Batal
                                                    </span>
                                                ) : tx.order_status === 'ready' ? (
                                                    <span className="bg-[#DCFCE7] text-[#15803D] text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                        Siap Saji
                                                    </span>
                                                ) : tx.order_status === 'processing' ? (
                                                    <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                        Diracik
                                                    </span>
                                                ) : (
                                                    <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                                        Pending
                                                    </span>
                                                )}
                                            </td>

                                            {/* Aksi Detail */}
                                            <td
                                                className="py-3 px-3 text-right"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openTransactionDetail(tx);
                                                }}
                                            >
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 px-2.5 bg-white border-[#DFCFA9] hover:bg-[#FAF5E8] text-neutral-800 text-[11px] font-bold rounded-lg"
                                                >
                                                    <Eye className="size-3 mr-1" />
                                                    Detail
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            <tfoot className="bg-[#FAF5E8] border-t-2 border-[#DFCFA9] font-extrabold text-neutral-900">
                                <tr>
                                    <td colSpan={4} className="py-3 px-3">
                                        TOTAL TRANSAKSI TERFILTER ({filtered_table_totals.count} pesanan)
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono">
                                        {formatRupiah(filtered_table_totals.subtotal)}
                                    </td>
                                    <td className="py-3 px-3 text-center text-[10px] text-neutral-400">N/A</td>
                                    <td className="py-3 px-3 text-center text-[10px] text-neutral-400">N/A</td>
                                    <td className="py-3 px-3 text-right font-mono text-rose-700">
                                        {filtered_table_totals.refund_amount > 0
                                            ? `- ${formatRupiah(filtered_table_totals.refund_amount)}`
                                            : 'Rp 0'}
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono text-[#C52828]">
                                        {formatRupiah(filtered_table_totals.net_revenue)}
                                    </td>
                                    <td colSpan={3} className="py-3 px-3 text-right text-[11px] text-amber-800">
                                        Belum Dibayar: {formatRupiah(filtered_table_totals.unpaid_amount)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 text-xs text-neutral-600">
                        <span>
                            Menampilkan {transactions.from ?? 0} - {transactions.to ?? 0} dari {transactions.total} transaksi
                        </span>
                        {transactions.links.length > 3 && (
                            <div className="flex flex-wrap items-center gap-1">
                                {transactions.links.map((link, idx) => {
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
                                            preserveScroll
                                            preserveState
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
                        )}
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 8. DOKUMENTASI ATURAN PERHITUNGAN KEUANGAN */}
                {/* ========================================================================= */}
                <div className="bg-[#FFFDF9] border border-[#E8DFC8] rounded-2xl p-4 shadow-xs text-xs text-neutral-700 space-y-2">
                    <h3 className="font-extrabold text-neutral-900 flex items-center gap-2">
                        <Info className="size-4 text-[#C52828]" />
                        <span>Dokumentasi Formula &amp; Kebijakan Pelaporan Keuangan SIDEORDER</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] leading-relaxed text-neutral-600">
                        <div>
                            <p>
                                <strong>• Sumber Data Otoritatif:</strong> {calculation_rules.authoritative_source}
                            </p>
                            <p>
                                <strong>• Rumus Pendapatan Bersih:</strong> {calculation_rules.realized_revenue_formula}
                            </p>
                            <p>
                                <strong>• Aturan Tanggal &amp; Zona Waktu:</strong> {calculation_rules.transaction_date_basis} ({calculation_rules.timezone}).
                            </p>
                        </div>
                        <div>
                            <p>
                                <strong>• Kebijakan Pesanan Belum Dibayar &amp; Batal:</strong> {calculation_rules.unpaid_policy} {calculation_rules.cancelled_and_failed_policy}
                            </p>
                            <p>
                                <strong>• Diskon &amp; Biaya Tambahan:</strong> Diskon ({calculation_rules.discount_support}) • Biaya Tambahan ({calculation_rules.additional_fees_support})
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* MODAL DETAIL LENGKAP TRANSAKSI & AUDIT RIWAYAT */}
            {/* ========================================================================= */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#FFFDF9] border-[#E8DFC8]">
                    {selectedTx && (
                        <div className="space-y-4">
                            <DialogHeader>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <DialogTitle className="text-lg font-black text-neutral-900">
                                        Rincian Transaksi #{selectedTx.order_number}
                                    </DialogTitle>
                                    <div className="flex items-center gap-1.5">
                                        <Badge className="bg-[#18181B] text-white font-mono text-xs">
                                            Meja {selectedTx.table_number}
                                            {selectedTx.table_name ? ` • ${selectedTx.table_name}` : ''}
                                        </Badge>
                                        <Badge
                                            className={`text-xs font-bold ${
                                                selectedTx.is_realized_revenue
                                                    ? 'bg-[#DCFCE7] text-[#15803D]'
                                                    : 'bg-[#FEF3C7] text-[#92400E]'
                                            }`}
                                        >
                                            {selectedTx.payment_status_label}
                                        </Badge>
                                    </div>
                                </div>
                                <DialogDescription className="text-xs text-neutral-600">
                                    Pelanggan: <strong className="text-neutral-900">{selectedTx.customer_name}</strong> • Status Pesanan:{' '}
                                    <strong className="text-neutral-900">{selectedTx.order_status_label}</strong>
                                </DialogDescription>
                            </DialogHeader>

                            {/* Grid Info Waktu & Pembayaran */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-[#FAF5E8] border border-[#DFCFA9] text-xs">
                                <div className="space-y-1">
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">Waktu Pesanan Dibuat:</span>
                                        <span className="font-bold text-neutral-900">{selectedTx.created_at_formatted}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">Waktu Pembayaran:</span>
                                        <span className="font-bold text-emerald-700">
                                            {selectedTx.paid_at_formatted ?? 'Belum Dibayar'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">Metode Pembayaran:</span>
                                        <span className="font-bold text-neutral-900">{selectedTx.payment_method_label}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">Referensi Pembayaran:</span>
                                        <span className="font-mono font-bold text-neutral-800">
                                            {selectedTx.payment_reference ?? '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">Dikonfirmasi Oleh:</span>
                                        <span className="font-bold text-neutral-800">
                                            {selectedTx.confirmed_by_name ?? (selectedTx.payment_status === 'paid' ? 'Gateway / Kasir' : '-')}
                                        </span>
                                    </div>
                                    {selectedTx.cash_received !== null && (
                                        <div className="flex justify-between">
                                            <span className="text-neutral-500">Nominal Dibayar / Kembali:</span>
                                            <span className="font-mono font-bold text-neutral-900">
                                                {formatRupiah(selectedTx.cash_received)} / {formatRupiah(selectedTx.change_amount ?? 0)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Daftar Item Pesanan */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-extrabold text-neutral-900">
                                    Daftar Item Pesanan ({selectedTx.items.length} baris item)
                                </h4>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {selectedTx.items.map((item) => {
                                        const isRejected = item.status === 'rejected';
                                        return (
                                            <div
                                                key={item.id}
                                                className={`p-3 rounded-xl border text-xs space-y-1 ${
                                                    isRejected
                                                        ? 'bg-rose-50/60 border-rose-200'
                                                        : 'bg-white border-[#E8DFC8]'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-extrabold text-neutral-900">
                                                            {item.quantity}x {item.menu_name}
                                                        </span>
                                                        {isRejected && (
                                                            <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                                                                DITOLAK
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`font-mono font-bold ${isRejected ? 'line-through text-rose-600' : 'text-neutral-900'}`}>
                                                        {formatRupiah(item.total_price)}
                                                    </span>
                                                </div>

                                                <div className="text-[11px] text-neutral-500">
                                                    Harga satuan: {formatRupiah(item.unit_price)} (Harga dasar: {formatRupiah(item.base_price)})
                                                </div>

                                                {item.options.length > 0 && (
                                                    <div className="text-[11px] text-neutral-600 pl-2 border-l-2 border-[#DFCFA9]">
                                                        {item.options.map((opt) => (
                                                            <div key={opt.id}>
                                                                + {opt.group_name}: {opt.option_name}{' '}
                                                                {opt.additional_price > 0 ? `(${formatRupiah(opt.additional_price)})` : ''}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {item.customer_notes && (
                                                    <div className="text-[11px] text-amber-800 italic">
                                                        Catatan item: &ldquo;{item.customer_notes}&rdquo;
                                                    </div>
                                                )}

                                                {isRejected && (
                                                    <div className="text-[11px] text-rose-700 font-medium pt-1 border-t border-rose-200/60">
                                                        Alasan ditolak: {item.rejection_reason ?? '-'}
                                                        {item.rejected_by_name ? ` • Oleh: ${item.rejected_by_name}` : ''}
                                                        {item.rejected_at_formatted ? ` (${item.rejected_at_formatted})` : ''}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Ringkasan Kalkulasi Keuangan */}
                            <div className="p-3.5 rounded-xl bg-[#FAF5E8] border border-[#DFCFA9] text-xs space-y-1.5">
                                <div className="flex justify-between text-neutral-600">
                                    <span>Total Bruto Awal Pesanan:</span>
                                    <span className="font-mono">{formatRupiah(selectedTx.initial_gross_amount)}</span>
                                </div>
                                {selectedTx.rejected_items_amount > 0 && (
                                    <div className="flex justify-between text-rose-700">
                                        <span>Pengurangan Item Ditolak:</span>
                                        <span className="font-mono">- {formatRupiah(selectedTx.rejected_items_amount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-neutral-800 font-bold">
                                    <span>Subtotal Item Aktif:</span>
                                    <span className="font-mono">{formatRupiah(selectedTx.subtotal)}</span>
                                </div>
                                <div className="flex justify-between text-neutral-500">
                                    <span>Diskon:</span>
                                    <span>Tidak Tersedia (Belum Didukung)</span>
                                </div>
                                <div className="flex justify-between text-neutral-500">
                                    <span>Biaya Tambahan / Pajak:</span>
                                    <span>Tidak Tersedia (Belum Didukung)</span>
                                </div>
                                <div className="flex justify-between text-rose-700">
                                    <span>Refund:</span>
                                    <span className="font-mono">
                                        {selectedTx.refund_amount > 0
                                            ? `- ${formatRupiah(selectedTx.refund_amount)} (${selectedTx.refund_reason ?? 'Refund'})`
                                            : 'Rp 0 (Tidak ada refund)'}
                                    </span>
                                </div>
                                <div className="flex justify-between font-extrabold text-sm text-neutral-900 pt-2 border-t border-[#DFCFA9]">
                                    <span>Pendapatan Bersih Diakui (Net Revenue):</span>
                                    <span className="font-mono text-[#C52828]">
                                        {formatRupiah(selectedTx.net_revenue)}
                                    </span>
                                </div>
                            </div>

                            {/* Riwayat Perubahan Status */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-extrabold text-neutral-900">
                                    Riwayat Perubahan Status &amp; Audit Log
                                </h4>
                                {selectedTx.status_histories.length === 0 ? (
                                    <p className="text-xs text-neutral-400">Belum ada riwayat perubahan status.</p>
                                ) : (
                                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                                        {selectedTx.status_histories.map((hist) => (
                                            <div
                                                key={hist.id}
                                                className="p-2.5 rounded-xl bg-white border border-[#E8DFC8] text-[11px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                                            >
                                                <div>
                                                    <span className="font-extrabold text-neutral-900 uppercase mr-2">
                                                        [{hist.status_label}]
                                                    </span>
                                                    <span className="text-neutral-700">{hist.notes}</span>
                                                </div>
                                                <div className="text-[10px] text-neutral-500 shrink-0 font-medium">
                                                    {hist.actor_name} • {hist.created_at_formatted}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsDetailOpen(false)}
                                    className="rounded-xl border-[#DFCFA9]"
                                >
                                    Tutup
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

FinancialReportsIndex.layout = {
    breadcrumbs: [
        {
            title: 'SIDEORDER',
            href: '/dashboard',
        },
        {
            title: 'Laporan Keuangan',
            href: '/admin/financial-reports',
        },
    ] as BreadcrumbItem[],
};
