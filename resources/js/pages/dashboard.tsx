import { Head, Link, router } from '@inertiajs/react';
import {
    AlertCircle,
    ArrowDownRight,
    ArrowRightLeft,
    ArrowUpDown,
    ArrowUpRight,
    Banknote,
    BarChart3,
    Calendar,
    CalendarDays,
    Check,
    CheckCircle2,
    Clock,
    Coffee,
    CreditCard,
    DollarSign,
    Download,
    ExternalLink,
    Eye,
    FileSpreadsheet,
    FileText,
    HelpCircle,
    Info,
    Landmark,
    Layers,
    LayoutGrid,
    PieChart,
    Printer,
    QrCode,
    Receipt,
    RefreshCw,
    Search,
    ShieldAlert,
    ShieldCheck,
    ShoppingBag,
    Sliders,
    Smartphone,
    Sparkles,
    Tag,
    Timer,
    TrendingDown,
    TrendingUp,
    UserCheck,
    Users,
    UtensilsCrossed,
    Wallet,
    X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
    FormDialogHeader,
    StandeeModalCard,
} from '@/components/admin/admin-ui';
import DateRangeFilterModal from '@/components/admin/financial/DateRangeFilterModal';
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
import { fetchAndDownloadSafely } from '@/lib/safe-download';
import type { BreadcrumbItem } from '@/types';

// =========================================================================
// DEFINISI TIPE DATA SISTEM MONITORING ADMIN SIDEORDER
// =========================================================================

export interface PaymentMethodStat {
    method: string;
    label: string;
    transactions_count: number;
    net_revenue: number;
    revenue_share_percent: number;
    count_share_percent: number;
    unpaid_count: number;
    unpaid_amount: number;
    cancelled_count: number;
    cancelled_amount: number;
}

export interface PeriodMetrics {
    label: string;
    net_revenue: number;
    gross_revenue: number;
    previous_period_revenue: number;
    previous_period_label: string;
    period_growth_percent: number | null;
    net_revenue_diff?: number;

    previous_gross_revenue?: number;
    gross_revenue_diff?: number;
    gross_growth_percent?: number | null;

    total_orders_count: number;
    previous_total_orders?: number;
    total_orders_diff?: number;
    orders_growth_percent?: number | null;

    completed_orders_count?: number;
    previous_completed_orders?: number;
    completed_orders_diff?: number;
    completed_growth_percent?: number | null;

    paid_transactions_count: number;
    previous_paid_count?: number;
    paid_transactions_diff?: number;

    average_order_value: number;
    previous_aov: number;
    aov_diff?: number;
    aov_growth_percent: number | null;

    items_sold: number;
    previous_items_sold: number;
    items_sold_diff?: number;
    items_sold_growth_percent: number | null;

    pending_payments_count: number;
    pending_payments_amount: number;
    failed_or_cancelled_count: number;

    cancelled_orders_count: number;
    previous_cancelled_orders?: number;
    cancelled_orders_diff?: number;
    cancelled_amount: number;
    previous_cancelled_amount?: number;
    cancelled_growth_percent?: number | null;

    failed_payments_count: number;
    failed_or_cancelled_amount: number;

    refunded_count: number;
    refund_amount: number;
    previous_refund_amount?: number;
    refund_diff?: number;
    refund_growth_percent?: number | null;

    discount_amount?: number;
    tax_service_amount?: number;
    cogs_amount?: number | null;
    cogs_status?: string;
    cogs_message?: string;
    gross_profit?: number;
    operational_expenses?: number | null;
    operational_expenses_status?: string;
    operational_expenses_message?: string;
    net_profit?: number | null;
    net_profit_status?: string;
    net_profit_message?: string;

    cash_flow?: {
        inflow_total: number;
        inflow_cash: number;
        inflow_qris: number;
        inflow_transfer?: number;
        inflow_xendit?: number;
        outflow_refund: number;
        net_cash_flow: number;
    };
}

export interface PaymentGatewayStat {
    gateway: string;
    label: string;
    transactions_count: number;
    net_revenue: number;
    revenue_share_percent: number;
    count_share_percent: number;
    unpaid_count: number;
    unpaid_amount: number;
    cancelled_count: number;
    cancelled_amount: number;
    is_active_slot: boolean;
}

export interface XenditIntegrationInfo {
    driver: string;
    label: string;
    configured: boolean;
    is_production: boolean;
    mode: string;
    webhook_endpoint: string;
    supported_channels: string[];
    transactions_count: number;
    net_revenue: number;
    pending_count: number;
    pending_amount: number;
}

export interface SummaryData {
    today_revenue: number;
    today_paid_count: number;
    today_orders_count: number;
    today_items_sold?: number;
    today_cancelled_count?: number;
    today_cancelled_amount?: number;
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
    this_month_items_sold?: number;
    this_month_cancelled_count?: number;
    this_month_cancelled_amount?: number;
    last_month_revenue: number;
    this_month_growth_percent: number | null;
    this_month_label: string;
    period: PeriodMetrics;
    payment_methods: PaymentMethodStat[];
    payment_gateways?: PaymentGatewayStat[];
    xendit_integration?: XenditIntegrationInfo;
}

export interface OperationalData {
    in_kitchen: number;
    ready_for_pickup: number;
    completed_today: number;
    pending_payments: number;
    total_tables: number;
    occupied_tables: number;
    occupancy_rate: number;
}

export interface SalesTrend7dItem {
    key: string;
    date: string;
    full_label: string;
    revenue: number;
    orders_count: number;
    is_today: boolean;
    is_peak: boolean;
}

export interface SalesTrend7dData {
    data: SalesTrend7dItem[];
    max_revenue: number;
    total_revenue: number;
    total_paid: number;
    peak_date?: string | null;
}

export interface HourlyTrendItem {
    hour: string;
    revenue: number;
    orders_count: number;
    is_peak?: boolean;
}

export interface HourlySummary {
    max_revenue: number;
    peak_hour: string | null;
    total_revenue: number;
    total_orders: number;
}

export interface TopMenuItem {
    rank?: number;
    menu_name: string;
    category_name?: string;
    total_qty: number;
    total_revenue: number;
    relative_percentage?: number;
    percentage?: number;
    contribution_percent?: number;
}

export interface SlowMovingItem {
    menu_id: number;
    menu_name: string;
    category_name: string;
    base_price: number;
    total_qty: number;
    total_revenue: number;
    is_zero_sales: boolean;
}

export interface CategoryPerformance {
    id: number;
    name: string;
    total_qty: number;
    total_revenue: number;
    menu_count: number;
    revenue_share_percent: number;
    qty_share_percent: number;
}

export interface ProductAnalytics {
    total_period_items_sold: number;
    total_period_menu_revenue: number;
    top_selling: TopMenuItem[];
    highest_revenue: TopMenuItem[];
    slow_moving: SlowMovingItem[];
    categories: CategoryPerformance[];
}

export interface PipelineStats {
    completed_count: number;
    processing_count: number;
    ready_count: number;
    pending_count: number;
    cancelled_count: number;
    unpaid_count: number;
    rejected_items_count: number;
    rejected_items_amount: number;
}

export interface CompletionTimeStats {
    average_minutes: number;
    formatted: string;
    sample_orders: number;
}

export interface DayOfWeekStat {
    day_num: number;
    day_name: string;
    revenue: number;
    orders_count: number;
    is_busiest: boolean;
}

export interface BusiestDayStats {
    day_of_week: DayOfWeekStat[];
    busiest_day_name: string | null;
    busiest_day_revenue: number;
    busiest_day_orders: number;
    peak_date_key: string | null;
    peak_date_label: string | null;
    peak_date_revenue: number;
    peak_date_orders: number;
}

export interface CashierActivityItem {
    user_id: number;
    user_name: string;
    user_role: string;
    total_orders: number;
    total_net_revenue: number;
    cash_count: number;
    cash_revenue: number;
    qris_count: number;
    qris_revenue: number;
}

export interface OperationalAnalytics {
    pipeline: PipelineStats;
    completion_time: CompletionTimeStats;
    period_hourly: {
        hours: HourlyTrendItem[];
        peak_hour: string | null;
        max_revenue: number;
    };
    busiest_day: BusiestDayStats;
    cashier_activity: CashierActivityItem[];
}

export interface RecapRow {
    date?: string;
    day_name?: string;
    week_key?: string;
    week_start?: string;
    week_end?: string;
    month_key?: string;
    short_label: string;
    label: string;
    full_label?: string;
    total_orders: number;
    paid_orders_count: number;
    completed_orders_count?: number;
    unpaid_orders_count: number;
    cancelled_orders_count: number;
    gross_revenue: number;
    discount_amount?: number;
    tax_amount?: number;
    refund_amount: number;
    net_revenue: number;
    unpaid_amount: number;
    average_order_value: number;
    items_sold?: number;
    cogs_status?: string;
    gross_profit?: number;
    operational_cost_status?: string;
    net_profit_status?: string;
    is_peak?: boolean;
    is_lowest?: boolean;
}

export interface RecapTotals {
    total_orders: number;
    paid_orders_count: number;
    completed_orders_count?: number;
    unpaid_orders_count: number;
    cancelled_orders_count: number;
    gross_revenue: number;
    discount_amount?: number;
    tax_amount?: number;
    refund_amount: number;
    net_revenue: number;
    unpaid_amount: number;
    average_order_value: number;
    items_sold?: number;
}

export interface RecapsData {
    daily: { rows: RecapRow[]; totals: RecapTotals };
    weekly: { rows: RecapRow[]; totals: RecapTotals };
    monthly: { rows: RecapRow[]; totals: RecapTotals };
}

export interface ChartPoint {
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
    items_sold?: number;
}

export interface ChartComparisonItem {
    key: string;
    current_label: string;
    current_revenue: number;
    current_orders: number;
    compare_label: string;
    compare_revenue: number;
    compare_orders: number;
}

export interface ChartData {
    aggregation: 'daily' | 'weekly' | 'monthly';
    has_transactions: boolean;
    max_revenue: number;
    total_revenue: number;
    total_paid_orders: number;
    data: ChartPoint[];
    comparison?: ChartComparisonItem[];
}

export interface TransactionOption {
    id: number;
    group_name: string;
    option_name: string;
    additional_price: number;
}

export interface TransactionItem {
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

export interface StatusHistoryItem {
    id: number;
    status: string;
    status_label: string;
    notes: string | null;
    created_at: string;
    created_at_formatted: string;
    actor_name: string;
}

export interface TransactionRecord {
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
    payment_gateway?: string;
    payment_gateway_label?: string;
    payment_channel?: string | null;
    payment_reference: string | null;
    payment_status: 'paid' | 'unpaid' | 'failed' | 'refunded' | string;
    payment_status_label: string;
    order_status:
        | 'pending'
        | 'processing'
        | 'ready'
        | 'completed'
        | 'cancelled'
        | string;
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

export interface PaginatedTransactions {
    data: TransactionRecord[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
}

export interface FiltersState {
    preset: string;
    start_date: string;
    end_date: string;
    period_label: string;
    compare_mode?: string;
    compare_start_date?: string;
    compare_end_date?: string;
    compare_label?: string | null;
    filter_date?: string;
    menu_id?: number | null;
    aggregation: string;
    effective_aggregation: 'daily' | 'weekly' | 'monthly';
    recap_view: 'daily' | 'weekly' | 'monthly';
    search: string;
    payment_status: string;
    order_status: string;
    payment_method: string;
    payment_gateway?: string;
    sort_by: string;
    sort_dir: string;
    per_page: number;
}

export interface FilteredTableTotals {
    count: number;
    subtotal: number;
    refund_amount: number;
    net_revenue: number;
    unpaid_amount: number;
}

export interface CalculationRules {
    timezone: string;
    week_definition: string;
    authoritative_source: string;
    transaction_date_basis: string;
    realized_revenue_formula: string;
    unpaid_policy: string;
    cancelled_and_failed_policy: string;
    cogs_status?: string;
    operational_costs_status?: string;
    discount_support: string;
    additional_fees_support: string;
    profit_disclaimer: string;
}

export interface DashboardProps {
    filters: FiltersState;
    available_menus?: { id: number; name: string }[];
    summary: SummaryData;
    operational: OperationalData;
    sales_trend_7d?: SalesTrend7dData;
    hourly_trend?: HourlyTrendItem[];
    hourly_summary?: HourlySummary;
    top_menus?: TopMenuItem[];
    product_analytics?: ProductAnalytics;
    operational_analytics?: OperationalAnalytics;
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
    { key: 'last_14_days', label: '14 Hari Terakhir' },
    { key: 'last_30_days', label: '30 Hari Terakhir' },
    { key: 'last_90_days', label: '90 Hari Terakhir' },
    { key: 'this_week', label: 'Minggu Ini' },
    { key: 'last_week', label: 'Minggu Lalu' },
    { key: 'this_month', label: 'Bulan Ini' },
    { key: 'last_month', label: 'Bulan Lalu' },
    { key: 'last_3_months', label: '3 Bulan Terakhir' },
    { key: 'last_6_months', label: '6 Bulan Terakhir' },
    { key: 'this_year', label: 'Tahun Ini' },
    { key: 'last_year', label: 'Tahun Lalu' },
    { key: 'all_time', label: 'Semua Waktu' },
    { key: 'custom', label: 'Rentang Kustom' },
];

export default function Dashboard({
    filters,
    available_menus = [],
    summary,
    operational,
    sales_trend_7d,
    hourly_trend = [],
    hourly_summary,
    top_menus = [],
    product_analytics,
    operational_analytics,
    recaps,
    chart,
    transactions,
    filtered_table_totals,
    calculation_rules,
    synced_at,
}: DashboardProps) {
    const [startDate, setStartDate] = useState(filters.start_date);
    const [endDate, setEndDate] = useState(filters.end_date);
    const [dateError, setDateError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState(filters.search || '');

    // Tab Navigasi Utama: Overview (Tren & Sales), Products (Menu & Kategori), Operations (Pipeline & Kasir), Financial (Rekap & Keuangan), Transactions (Tabel)
    const [activeMainTab, setActiveMainTab] = useState<
        'overview' | 'products' | 'operations' | 'financial' | 'transactions'
    >('overview');

    // Sub-tab grafik pendapatan harian (periode aktif, 7 hari terakhir, jam sibuk)
    const [activeChartTab, setActiveChartTab] = useState<
        'period' | '7days' | 'hourly'
    >('period');
    const [inspectedDateKey, setInspectedDateKey] = useState<string | null>(
        null,
    );

    // Sub-tab menu produk: top_qty, top_rev, slow_moving
    const [productTab, setProductTab] = useState<
        'top_qty' | 'top_rev' | 'slow_moving'
    >('top_qty');
    const [menuSearchQuery, setMenuSearchQuery] = useState('');

    // Sub-tab rekap finansial (daily, weekly, monthly)
    const [recapTab, setRecapTab] = useState<'daily' | 'weekly' | 'monthly'>(
        filters.recap_view || 'daily',
    );

    // Sub-tab khusus di Tab 4 (Keuangan & Rekap): breakdown, revenue, profit, cashflow, refunds
    const [financialSubTab, setFinancialSubTab] = useState<
        'breakdown' | 'revenue' | 'profit' | 'cashflow' | 'refunds'
    >('breakdown');

    // State kalkulator margin HPP simulasi (opsional dan transparan)
    const [simulatedHppMargin, setSimulatedHppMargin] = useState<number>(35); // Standar F&B 35%
    const [showHppSimulator, setShowHppSimulator] = useState(false);

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedTx, setSelectedTx] = useState<TransactionRecord | null>(
        null,
    );
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isPrintReceiptOpen, setIsPrintReceiptOpen] = useState(false);

    useEffect(() => {
        setStartDate(filters.start_date);
        setEndDate(filters.end_date);
    }, [filters.start_date, filters.end_date]);

    const formatRupiah = (amount: number | string | null | undefined) => {
        const num =
            typeof amount === 'string' ? parseFloat(amount) || 0 : amount || 0;
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

    // Terapkan filter ke server via Inertia router
    const applyFilters = (overrides: Partial<FiltersState>) => {
        const nextParams: Record<string, string | number> = {
            preset: overrides.preset ?? filters.preset,
            start_date: overrides.start_date ?? startDate,
            end_date: overrides.end_date ?? endDate,
            compare_mode:
                overrides.compare_mode !== undefined
                    ? (overrides.compare_mode ?? '')
                    : (filters.compare_mode ?? 'previous_period'),
            compare_start_date:
                overrides.compare_start_date !== undefined
                    ? (overrides.compare_start_date ?? '')
                    : (filters.compare_start_date ?? ''),
            compare_end_date:
                overrides.compare_end_date !== undefined
                    ? (overrides.compare_end_date ?? '')
                    : (filters.compare_end_date ?? ''),
            filter_date:
                overrides.filter_date !== undefined
                    ? (overrides.filter_date ?? '')
                    : (filters.filter_date ?? ''),
            menu_id:
                overrides.menu_id !== undefined
                    ? (overrides.menu_id ?? '')
                    : (filters.menu_id ?? ''),
            aggregation: overrides.aggregation ?? filters.aggregation,
            recap_view: overrides.recap_view ?? recapTab,
            search:
                overrides.search !== undefined ? overrides.search : searchQuery,
            payment_status: overrides.payment_status ?? filters.payment_status,
            order_status: overrides.order_status ?? filters.order_status,
            payment_method: overrides.payment_method ?? filters.payment_method,
            payment_gateway:
                overrides.payment_gateway ?? filters.payment_gateway ?? 'all',
            sort_by: overrides.sort_by ?? filters.sort_by,
            sort_dir: overrides.sort_dir ?? filters.sort_dir,
            per_page: overrides.per_page ?? filters.per_page,
        };

        // Bersihkan parameter string kosong untuk kebersihan URL
        Object.keys(nextParams).forEach((k) => {
            if (
                nextParams[k] === '' ||
                nextParams[k] === null ||
                nextParams[k] === undefined
            ) {
                delete nextParams[k];
            }
        });

        setIsRefreshing(true);
        router.get('/dashboard', nextParams, {
            preserveState: true,
            preserveScroll: true,
            onFinish: () => setIsRefreshing(false),
            onError: () => setIsRefreshing(false),
        });
    };

    const handleDateRangeApply = (params: {
        preset: string;
        start_date?: string;
        end_date?: string;
        compare_mode?: string;
        compare_start_date?: string;
        compare_end_date?: string;
    }) => {
        setDateError(null);
        applyFilters({
            preset: params.preset,
            start_date: params.start_date ?? filters.start_date,
            end_date: params.end_date ?? filters.end_date,
            compare_mode: params.compare_mode ?? filters.compare_mode,
            compare_start_date: params.compare_start_date ?? '',
            compare_end_date: params.compare_end_date ?? '',
        });
    };

    const handleDrilldownDate = (dateStr: string) => {
        applyFilters({
            filter_date: dateStr,
        });
        setActiveMainTab('transactions');
        toast.info(`Menampilkan transaksi khusus tanggal ${dateStr}`);
    };

    const handlePresetChange = (presetValue: string) => {
        setDateError(null);
        applyFilters({ preset: presetValue });
    };

    const handleApplyCustomDates = () => {
        if (!startDate || !endDate) {
            setDateError('Tanggal mulai dan akhir harus diisi.');
            return;
        }
        if (new Date(endDate) < new Date(startDate)) {
            setDateError(
                'Tanggal akhir tidak boleh lebih awal dari tanggal mulai.',
            );
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

    const handleManualRefresh = () => {
        setIsRefreshing(true);
        router.reload({
            onFinish: () => {
                setIsRefreshing(false);
                toast.success('Data analitik berhasil disinkronkan.');
            },
        });
    };

    const openTransactionDetail = (tx: TransactionRecord) => {
        setSelectedTx(tx);
        setIsDetailOpen(true);
    };

    const openPrintReceipt = (tx: TransactionRecord) => {
        setSelectedTx(tx);
        setIsPrintReceiptOpen(true);
    };

    // Query string ekspor Excel, CSV & PDF dengan seluruh filter aktif
    const exportQueryString = useMemo(() => {
        const params = new URLSearchParams();
        params.set('preset', filters.preset);
        params.set('start_date', filters.start_date);
        params.set('end_date', filters.end_date);
        if (filters.compare_mode)
            params.set('compare_mode', filters.compare_mode);
        if (filters.compare_start_date)
            params.set('compare_start_date', filters.compare_start_date);
        if (filters.compare_end_date)
            params.set('compare_end_date', filters.compare_end_date);
        if (filters.filter_date) params.set('filter_date', filters.filter_date);
        if (filters.menu_id) params.set('menu_id', String(filters.menu_id));
        if (filters.search) params.set('search', filters.search);
        params.set('payment_status', filters.payment_status);
        params.set('order_status', filters.order_status);
        params.set('payment_method', filters.payment_method);
        params.set('payment_gateway', filters.payment_gateway ?? 'all');
        params.set('sort_by', filters.sort_by);
        params.set('sort_dir', filters.sort_dir);
        params.set('recap_view', recapTab);
        return params.toString();
    }, [filters, recapTab]);

    const [exportingType, setExportingType] = useState<
        'excel' | 'csv' | 'pdf' | null
    >(null);

    const handleExportReport = async (
        type: 'excel' | 'csv' | 'pdf',
        e?: React.MouseEvent<HTMLElement>,
    ) => {
        if (e) {
            e.preventDefault();
        }
        if (exportingType) return;

        setExportingType(type);
        const startCompact =
            (filters.start_date || '').replace(/-/g, '') || 'periode';
        const endCompact =
            (filters.end_date || '').replace(/-/g, '') || 'aktif';

        const configMap = {
            excel: {
                url: `/admin/financial-reports/export/excel?${exportQueryString}`,
                fallbackFilename: `Laporan_Keuangan_SIDELINE_${startCompact}_sd_${endCompact}.xlsx`,
                mimeType:
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                label: 'Excel (.xlsx)',
            },
            csv: {
                url: `/admin/financial-reports/export/csv?${exportQueryString}`,
                fallbackFilename: `Laporan_Keuangan_SIDELINE_${startCompact}_sd_${endCompact}.csv`,
                mimeType: 'text/csv;charset=utf-8;',
                label: 'CSV (.csv)',
            },
            pdf: {
                url: `/admin/financial-reports/export/pdf?${exportQueryString}`,
                fallbackFilename: `Laporan_Keuangan_SIDELINE_${startCompact}_sd_${endCompact}.pdf`,
                mimeType: 'application/pdf',
                label: 'PDF (.pdf)',
            },
        } as const;

        const target = configMap[type];

        try {
            const { filename } = await fetchAndDownloadSafely(
                target.url,
                target.fallbackFilename,
                target.mimeType,
            );
            toast.success(
                `Laporan ${target.label} berhasil diunduh (${filename})`,
            );
        } catch (err: any) {
            toast.error(
                err?.message ||
                    `Gagal mengunduh laporan ${target.label}. Silakan coba lagi.`,
            );
        } finally {
            setExportingType(null);
        }
    };

    // Rencana data produk aktif
    const activeTopSelling = product_analytics?.top_selling ?? top_menus;
    const activeHighestRevenue =
        product_analytics?.highest_revenue ?? top_menus;
    const activeSlowMoving = product_analytics?.slow_moving ?? [];
    const activeCategories = product_analytics?.categories ?? [];

    const filteredTopSelling = useMemo(() => {
        if (!menuSearchQuery.trim()) return activeTopSelling;
        const q = menuSearchQuery.toLowerCase();
        return activeTopSelling.filter(
            (m) =>
                m.menu_name.toLowerCase().includes(q) ||
                (m.category_name && m.category_name.toLowerCase().includes(q)),
        );
    }, [activeTopSelling, menuSearchQuery]);

    const filteredHighestRevenue = useMemo(() => {
        if (!menuSearchQuery.trim()) return activeHighestRevenue;
        const q = menuSearchQuery.toLowerCase();
        return activeHighestRevenue.filter(
            (m) =>
                m.menu_name.toLowerCase().includes(q) ||
                (m.category_name && m.category_name.toLowerCase().includes(q)),
        );
    }, [activeHighestRevenue, menuSearchQuery]);

    const filteredSlowMoving = useMemo(() => {
        if (!menuSearchQuery.trim()) return activeSlowMoving;
        const q = menuSearchQuery.toLowerCase();
        return activeSlowMoving.filter(
            (m) =>
                m.menu_name.toLowerCase().includes(q) ||
                (m.category_name && m.category_name.toLowerCase().includes(q)),
        );
    }, [activeSlowMoving, menuSearchQuery]);

    const renderMenuCategoryPill = (catName?: string | null) => {
        const name = catName || 'Umum';
        const lower = name.toLowerCase();
        if (lower.includes('coff')) {
            return (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 shadow-2xs">
                    <Coffee className="size-3 text-amber-700" />
                    <span>{name}</span>
                </span>
            );
        }
        if (lower.includes('food') || lower.includes('makan')) {
            return (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200/80 bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-900 shadow-2xs">
                    <UtensilsCrossed className="size-3 text-orange-700" />
                    <span>{name}</span>
                </span>
            );
        }
        if (
            lower.includes('juice') ||
            lower.includes('jus') ||
            lower.includes('bever') ||
            lower.includes('drink') ||
            lower.includes('milk')
        ) {
            return (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-900 shadow-2xs">
                    <Sparkles className="size-3 text-emerald-700" />
                    <span>{name}</span>
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-[11px] font-bold text-neutral-700 shadow-2xs">
                <Tag className="size-3 text-neutral-500" />
                <span>{name}</span>
            </span>
        );
    };

    const renderRankBadge = (rankIdx: number) => {
        if (rankIdx === 0) {
            return (
                <div className="flex items-center gap-1.5">
                    <span className="inline-flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-xs font-black text-white shadow-xs ring-2 ring-amber-200">
                        1
                    </span>
                    <Sparkles className="size-3.5 shrink-0 text-amber-500" />
                </div>
            );
        }
        if (rankIdx === 1) {
            return (
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 text-xs font-black text-slate-800 shadow-xs ring-2 ring-slate-200">
                    2
                </span>
            );
        }
        if (rankIdx === 2) {
            return (
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 to-amber-700 text-xs font-black text-white shadow-xs ring-2 ring-amber-300">
                    3
                </span>
            );
        }
        return (
            <span className="inline-flex size-6 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 font-mono text-xs font-bold text-neutral-600">
                {rankIdx + 1}
            </span>
        );
    };

    // Data operasional aktif
    const activePipeline = operational_analytics?.pipeline ?? {
        completed_count: operational.completed_today,
        processing_count: operational.in_kitchen,
        ready_count: operational.ready_for_pickup,
        pending_count: 0,
        cancelled_count: summary.period.cancelled_orders_count,
        unpaid_count: summary.period.pending_payments_count,
        rejected_items_count: 0,
        rejected_items_amount: 0,
    };
    const activeCompletionTime = operational_analytics?.completion_time ?? {
        average_minutes: 0,
        formatted: 'Belum Ada',
        sample_orders: 0,
    };
    const activeBusiestDay = operational_analytics?.busiest_day;
    const activeCashiers = operational_analytics?.cashier_activity ?? [];

    // Breakdown metode bayar
    const cashMethod = summary.payment_methods.find((m) => m.method === 'cash');
    const qrisMethod = summary.payment_methods.find((m) => m.method === 'qris');

    // Pertumbuhan badge render
    const renderGrowthBadge = (
        growthPercent: number | null,
        referenceLabel: string,
    ) => {
        if (growthPercent === null) {
            return (
                <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-500">
                    <span>Baru (tidak ada basis {referenceLabel})</span>
                </span>
            );
        }
        if (growthPercent > 0) {
            return (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    <ArrowUpRight className="size-3" />
                    <span>+{growthPercent}%</span>
                </span>
            );
        }
        if (growthPercent < 0) {
            return (
                <span className="inline-flex items-center gap-1 rounded-md border border-rose-200/60 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                    <ArrowDownRight className="size-3" />
                    <span>{growthPercent}%</span>
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">
                <span>0% (Stabil)</span>
            </span>
        );
    };

    const renderPaymentStatusBadge = (status: string, label: string) => {
        switch (status) {
            case 'paid':
                return (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-800">
                        <Check className="size-3" />
                        <span>{label}</span>
                    </span>
                );
            case 'unpaid':
                return (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-[10px] font-black text-amber-800">
                        <Clock className="size-3" />
                        <span>{label}</span>
                    </span>
                );
            case 'refunded':
                return (
                    <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-100 px-2.5 py-0.5 text-[10px] font-black text-purple-800">
                        <RefreshCw className="size-3" />
                        <span>{label}</span>
                    </span>
                );
            case 'failed':
            default:
                return (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-[10px] font-black text-rose-800">
                        <X className="size-3" />
                        <span>{label}</span>
                    </span>
                );
        }
    };

    const renderOrderStatusPill = (status: string, label: string) => {
        switch (status) {
            case 'completed':
                return (
                    <span className="inline-block rounded-md bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-white">
                        {label}
                    </span>
                );
            case 'processing':
                return (
                    <span className="inline-block rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                        {label}
                    </span>
                );
            case 'ready':
                return (
                    <span className="inline-block rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        {label}
                    </span>
                );
            case 'cancelled':
                return (
                    <span className="inline-block rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        {label}
                    </span>
                );
            case 'pending':
            default:
                return (
                    <span className="inline-block rounded-md bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-800">
                        {label}
                    </span>
                );
        }
    };

    // Hitung estimasi laba kotor simulasi (jika pengguna mengaktifkan toggle simulasi)
    const simulatedHppCost =
        (summary.period.net_revenue * simulatedHppMargin) / 100;
    const simulatedGrossProfit = summary.period.net_revenue - simulatedHppCost;

    // Data tren 7 hari
    const trend7dItems = sales_trend_7d?.data || [];
    const maxTrend7dRevenue = sales_trend_7d?.max_revenue || 1;

    // Data tren jam sibuk hari ini
    const maxHourlyRevenue = hourly_summary?.max_revenue || 1;

    // Skala Y-Axis & Detil Bar Periode Aktif
    const chartYAxisMax = useMemo(() => {
        const raw = chart.max_revenue || 0;
        if (raw <= 0) return 100000;
        if (raw <= 100000) return 100000;
        if (raw <= 250000) return 250000;
        if (raw <= 500000) return Math.ceil(raw / 50000) * 50000;
        if (raw <= 1000000) return Math.ceil(raw / 100000) * 100000;
        return Math.ceil(raw / 250000) * 250000;
    }, [chart.max_revenue]);

    const chartPeakPoint = useMemo(() => {
        if (!chart.data || chart.data.length === 0) return null;
        let peak = chart.data[0];
        for (const p of chart.data) {
            if (p.net_revenue > peak.net_revenue) {
                peak = p;
            }
        }
        return peak.net_revenue > 0 ? peak : null;
    }, [chart.data]);

    const activeInspectedPoint = useMemo(() => {
        if (!inspectedDateKey) return null;
        return chart.data?.find((p) => p.key === inspectedDateKey) || null;
    }, [chart.data, inspectedDateKey]);

    const trend7dYAxisMax = useMemo(() => {
        const raw = sales_trend_7d?.max_revenue || 0;
        if (raw <= 0) return 100000;
        if (raw <= 100000) return 100000;
        if (raw <= 250000) return 250000;
        if (raw <= 500000) return Math.ceil(raw / 50000) * 50000;
        return Math.ceil(raw / 100000) * 100000;
    }, [sales_trend_7d?.max_revenue]);

    return (
        <>
            <Head title="SIDEORDER - Laporan Bisnis & Keuangan" />

            {/* CONTAINER UTAMA DASHBOARD TERPADU */}
            <div className="animate-sideline-fade-up flex min-h-screen flex-col gap-6 bg-[#FAF6EC] p-4 font-sans text-neutral-800 antialiased select-none sm:p-6 lg:p-8">
                {/* ========================================================================= */}
                {/* 1. KONTROL PERIODE LAPORAN & EKSPOR */}
                {/* ========================================================================= */}
                <div className="flex flex-col gap-3 rounded-2xl border border-[#E8DFC8] bg-white p-3 shadow-2xs sm:p-3.5 xl:flex-row xl:items-center xl:justify-between">
                    {/* Left: Periode Laporan & Rentang Tanggal */}
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3">
                        {/* Box 1: Periode Laporan Modal Trigger */}
                        <DateRangeFilterModal
                            currentPreset={filters.preset}
                            currentStartDate={filters.start_date}
                            currentEndDate={filters.end_date}
                            currentPeriodLabel={filters.period_label}
                            compareMode={
                                filters.compare_mode ?? 'previous_period'
                            }
                            compareStartDate={filters.compare_start_date}
                            compareEndDate={filters.compare_end_date}
                            compareLabel={filters.compare_label}
                            onApply={handleDateRangeApply}
                        />

                        {/* Box 2: Rentang Tanggal */}
                        <div className="flex h-11 items-center gap-2.5 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-3.5 text-neutral-800 shadow-2xs">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                                <CalendarDays className="size-4 text-amber-600" />
                            </div>
                            <div className="flex flex-col items-start text-left">
                                <span className="text-[10px] leading-tight font-bold text-neutral-500">
                                    Rentang Tanggal
                                </span>
                                <span className="font-mono text-xs leading-tight font-extrabold text-neutral-900">
                                    {filters.start_date} s/d {filters.end_date}
                                </span>
                            </div>
                        </div>

                        {/* Filter Spesifik Tanggal (jika ada) */}
                        {filters.filter_date && (
                            <Badge className="flex items-center gap-1.5 rounded-xl bg-[#C52828] px-2.5 py-1.5 text-xs font-bold text-white">
                                <span>Tanggal: {filters.filter_date}</span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        applyFilters({ filter_date: '' })
                                    }
                                    className="ml-1 rounded-full p-0.5 hover:bg-black/20"
                                    title="Hapus Filter Tanggal"
                                >
                                    <X className="size-3" />
                                </button>
                            </Badge>
                        )}

                        {/* Filter Spesifik Menu (jika ada) */}
                        {filters.menu_id && (
                            <Badge className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white">
                                <span>
                                    Menu:{' '}
                                    {available_menus.find(
                                        (m) => m.id === filters.menu_id,
                                    )?.name || `ID ${filters.menu_id}`}
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        applyFilters({ menu_id: null })
                                    }
                                    className="ml-1 rounded-full p-0.5 hover:bg-black/20"
                                    title="Hapus Filter Menu"
                                >
                                    <X className="size-3" />
                                </button>
                            </Badge>
                        )}
                    </div>

                    {/* Right: Actions (Perbarui Data & Ekspor Laporan) */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
                        {/* Divider */}
                        <div className="mx-1 hidden h-7 w-px bg-neutral-200 xl:block" />

                        {/* Tombol Perbarui Data / Refresh */}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleManualRefresh}
                            disabled={isRefreshing}
                            className="h-10 cursor-pointer gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-bold text-neutral-800 shadow-2xs transition-colors hover:bg-neutral-50"
                            title="Perbarui data laporan terkini"
                        >
                            <RefreshCw
                                className={`size-3.5 text-neutral-700 ${isRefreshing ? 'animate-spin' : ''}`}
                            />
                            <span>Perbarui</span>
                        </Button>

                        {/* Tombol Ekspor Excel */}
                        <button
                            type="button"
                            onClick={(e) => handleExportReport('excel', e)}
                            disabled={exportingType !== null}
                            className="flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#1E2235] px-3.5 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-[#151928] disabled:opacity-60"
                            title="Unduh Laporan Excel (.xlsx)"
                        >
                            {exportingType === 'excel' ? (
                                <RefreshCw className="size-4 animate-spin text-emerald-400" />
                            ) : (
                                <FileSpreadsheet className="size-4 text-emerald-400" />
                            )}
                            <span className="hidden md:inline">
                                {exportingType === 'excel'
                                    ? 'Mengunduh...'
                                    : 'Ekspor Excel'}
                            </span>
                            <span className="md:hidden">Excel</span>
                        </button>

                        {/* Tombol Ekspor CSV */}
                        <button
                            type="button"
                            onClick={(e) => handleExportReport('csv', e)}
                            disabled={exportingType !== null}
                            className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[#1E2235] px-3 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-[#151928] disabled:opacity-60"
                            title="Unduh Laporan CSV (.csv)"
                        >
                            {exportingType === 'csv' ? (
                                <RefreshCw className="size-3.5 animate-spin text-neutral-300" />
                            ) : (
                                <FileText className="size-3.5 text-neutral-300" />
                            )}
                            <span className="hidden lg:inline">
                                {exportingType === 'csv' ? 'CSV...' : 'CSV'}
                            </span>
                        </button>

                        {/* Tombol Unduh PDF */}
                        <button
                            type="button"
                            onClick={(e) => handleExportReport('pdf', e)}
                            disabled={exportingType !== null}
                            className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[#C52828] px-3 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-[#A81E1E] disabled:opacity-60"
                            title="Unduh Laporan Resmi PDF (.pdf)"
                        >
                            {exportingType === 'pdf' ? (
                                <RefreshCw className="size-3.5 animate-spin text-white" />
                            ) : (
                                <Download className="size-3.5 text-white" />
                            )}
                            <span className="hidden lg:inline">
                                {exportingType === 'pdf' ? 'PDF...' : 'PDF'}
                            </span>
                        </button>

                        {/* Tombol Cetak Dokumen / Print */}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => window.print()}
                            className="h-10 cursor-pointer gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-bold text-neutral-800 shadow-2xs hover:bg-neutral-50"
                            title="Cetak Laporan (Ctrl+P)"
                        >
                            <Printer className="size-3.5 text-neutral-700" />
                            <span className="hidden xl:inline">Cetak</span>
                        </Button>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 2. RINGKASAN KINERJA KEUANGAN & OPERASIONAL */}
                {/* ========================================================================= */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="flex items-center gap-1.5 text-xs font-black tracking-wider text-neutral-700 uppercase">
                                <DollarSign className="size-4 text-[#C52828]" />
                                <span>
                                    Ringkasan Kinerja Keuangan &amp; Operasional
                                </span>
                            </h2>
                            <span className="hidden text-[10px] font-medium text-neutral-500 sm:inline">
                                Indikator utama pendapatan dan volume transaksi
                                pada periode laporan
                            </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-xs text-neutral-500">
                            <span>
                                Hari Ini:{' '}
                                <strong>
                                    {formatCompactRupiah(summary.today_revenue)}
                                </strong>
                            </span>
                            <span>•</span>
                            <span>
                                Bulan Ini:{' '}
                                <strong>
                                    {formatCompactRupiah(
                                        summary.this_month_revenue,
                                    )}
                                </strong>
                            </span>
                        </div>
                    </div>

                    {/* GRID 4 KARTU METRIK UTAMA TERKONSOLIDASI */}
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                        {/* KARTU 1: Pendapatan Bersih (Net Revenue dari Transaksi Lunas setelah Refund) */}
                        <div
                            onClick={() => {
                                setActiveMainTab('financial');
                                setFinancialSubTab('revenue');
                            }}
                            className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-emerald-300/80 bg-white bg-gradient-to-b from-white to-emerald-50/20 p-4 shadow-2xs transition-all hover:border-emerald-600 hover:shadow-sm sm:p-5"
                            title="Klik untuk membuka Rincian Pendapatan pada tab Laporan Keuangan"
                        >
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black tracking-wider text-emerald-800 uppercase">
                                        Pendapatan Bersih
                                    </span>
                                    <span className="rounded-lg border border-emerald-200/60 bg-emerald-50 p-1.5 text-emerald-800">
                                        <TrendingUp className="size-4" />
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <div className="font-mono text-xl font-black tracking-tight text-emerald-700 sm:text-2xl">
                                        {formatRupiah(
                                            summary.period.net_revenue,
                                        )}
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                        {renderGrowthBadge(
                                            summary.period
                                                .period_growth_percent,
                                            'periode sebelumnya',
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 space-y-1.5 border-t border-emerald-100/80 pt-3 text-[11px]">
                                <div className="flex items-center justify-between text-neutral-600">
                                    <span>Omzet:</span>
                                    <strong className="font-mono text-neutral-800">
                                        {formatCompactRupiah(
                                            summary.period.gross_revenue,
                                        )}
                                    </strong>
                                </div>
                                <div className="flex items-center justify-between text-neutral-500">
                                    <span>Via Xendit Gateway:</span>
                                    <span className="font-mono font-bold text-indigo-700">
                                        {formatCompactRupiah(
                                            summary.xendit_integration
                                                ?.net_revenue ??
                                                summary.period.cash_flow
                                                    ?.inflow_xendit ??
                                                0,
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between border-t border-dashed border-emerald-100 pt-1 font-bold text-emerald-700">
                                    <span>Laba Kotor:</span>
                                    <span className="font-mono">
                                        {formatCompactRupiah(
                                            summary.period.gross_profit ??
                                                summary.period.net_revenue,
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* KARTU 2: Total Pesanan */}
                        <div
                            onClick={() => {
                                setActiveMainTab('transactions');
                                applyFilters({ order_status: 'all' });
                            }}
                            className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-[#DFCFA9] bg-white p-4 shadow-2xs transition-all hover:border-neutral-700 hover:shadow-sm sm:p-5"
                            title="Klik untuk membuka Riwayat Transaksi"
                        >
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black tracking-wider text-neutral-600 uppercase transition-colors group-hover:text-neutral-900">
                                        Total Pesanan
                                    </span>
                                    <span className="rounded-lg border border-sky-200/60 bg-sky-50 p-1.5 text-sky-800">
                                        <ShoppingBag className="size-4" />
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <div className="font-mono text-xl font-black tracking-tight text-neutral-900 sm:text-2xl">
                                        {summary.period.total_orders_count}{' '}
                                        <span className="text-xs font-bold text-neutral-500">
                                            pesanan
                                        </span>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                        {renderGrowthBadge(
                                            summary.period
                                                .orders_growth_percent ?? null,
                                            'periode sebelumnya',
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 space-y-1.5 border-t border-[#F2EBD9] pt-3 text-[11px]">
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1 font-semibold text-emerald-700">
                                        <CheckCircle2 className="size-3 text-emerald-600" />{' '}
                                        Pesanan Selesai:
                                    </span>
                                    <strong className="font-mono text-emerald-800">
                                        {summary.period
                                            .completed_orders_count ??
                                            summary.period
                                                .paid_transactions_count}{' '}
                                        pesanan
                                    </strong>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1 font-semibold text-rose-600">
                                        <X className="size-3 text-rose-500" />{' '}
                                        Dibatalkan:
                                    </span>
                                    <span className="font-mono font-bold text-rose-700">
                                        {summary.period.cancelled_orders_count}{' '}
                                        pesanan{' '}
                                        {summary.period.cancelled_amount > 0
                                            ? `(${formatCompactRupiah(summary.period.cancelled_amount)})`
                                            : ''}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between border-t border-dashed border-[#F2EBD9] pt-1 text-neutral-500">
                                    <span>Transaksi Lunas:</span>
                                    <span className="font-mono font-bold text-neutral-700">
                                        {summary.period.paid_transactions_count}{' '}
                                        transaksi
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* KARTU 3: Rata-rata Nilai Pesanan */}
                        <div
                            onClick={() => setActiveMainTab('overview')}
                            className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-[#DFCFA9] bg-white p-4 shadow-2xs transition-all hover:border-sky-500 hover:shadow-sm sm:p-5"
                            title="Pendapatan Bersih dibagi Jumlah Transaksi Lunas"
                        >
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black tracking-wider text-neutral-600 uppercase transition-colors group-hover:text-neutral-900">
                                        Rata-rata Nilai Pesanan
                                    </span>
                                    <span className="rounded-lg border border-sky-200/60 bg-sky-50 p-1.5 text-sky-700">
                                        <Receipt className="size-4" />
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <div className="font-mono text-xl font-black tracking-tight text-neutral-900 sm:text-2xl">
                                        {formatRupiah(
                                            summary.period.average_order_value,
                                        )}
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                        {renderGrowthBadge(
                                            summary.period.aov_growth_percent,
                                            'periode sebelumnya',
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 space-y-1.5 border-t border-[#F2EBD9] pt-3 text-[11px]">
                                <div className="flex items-center justify-between text-neutral-600">
                                    <span>Dasar Perhitungan:</span>
                                    <span className="font-semibold text-neutral-800">
                                        Pendapatan Bersih / Lunas
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-neutral-500">
                                    <span>Transaksi Lunas:</span>
                                    <strong className="font-mono text-neutral-700">
                                        {summary.period.paid_transactions_count}{' '}
                                        transaksi
                                    </strong>
                                </div>
                                <div className="flex items-center justify-between border-t border-dashed border-[#F2EBD9] pt-1 font-bold text-sky-700">
                                    <span>Nilai Rata-rata per Transaksi</span>
                                    <ExternalLink className="size-3 shrink-0 text-sky-600" />
                                </div>
                            </div>
                        </div>

                        {/* KARTU 4: Total Porsi Terjual */}
                        <div
                            onClick={() => setActiveMainTab('products')}
                            className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-[#DFCFA9] bg-white p-4 shadow-2xs transition-all hover:border-orange-500 hover:shadow-sm sm:p-5"
                            title="Klik untuk membuka laporan kinerja produk"
                        >
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black tracking-wider text-neutral-600 uppercase transition-colors group-hover:text-neutral-900">
                                        Total Porsi Terjual
                                    </span>
                                    <span className="rounded-lg border border-orange-200/60 bg-orange-50 p-1.5 text-orange-700">
                                        <Coffee className="size-4" />
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <div className="font-mono text-xl font-black tracking-tight text-neutral-900 sm:text-2xl">
                                        {summary.period.items_sold}{' '}
                                        <span className="text-xs font-bold text-neutral-500">
                                            porsi
                                        </span>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                        {renderGrowthBadge(
                                            summary.period
                                                .items_sold_growth_percent,
                                            'periode sebelumnya',
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 space-y-1.5 border-t border-[#F2EBD9] pt-3 text-[11px]">
                                <div className="flex items-center justify-between text-neutral-600">
                                    <span>Kategori Aktif:</span>
                                    <strong className="font-mono text-neutral-800">
                                        {activeCategories.length} kategori
                                    </strong>
                                </div>
                                <div className="flex items-center justify-between text-neutral-500">
                                    <span>Menu Terlaris:</span>
                                    <span className="max-w-[130px] truncate font-semibold text-neutral-700">
                                        {activeTopSelling[0]?.menu_name ||
                                            'Belum tersedia'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between border-t border-dashed border-[#F2EBD9] pt-1 font-bold text-orange-700">
                                    <span>Lihat Kinerja Produk</span>
                                    <ExternalLink className="size-3 shrink-0 text-orange-600" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 3. BILAH TAB NAVIGASI UTAMA LAPORAN */}
                {/* ========================================================================= */}
                <div className="rounded-2xl border border-[#E8DFC8] bg-white p-1.5 shadow-2xs sm:p-2">
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2 md:grid-cols-3 xl:grid-cols-5">
                        {/* Tab 1: Ringkasan Penjualan */}
                        <button
                            type="button"
                            onClick={() => setActiveMainTab('overview')}
                            className={`group relative flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-left transition-all sm:px-3.5 sm:py-2.5 ${
                                activeMainTab === 'overview'
                                    ? 'border-[#C52828] bg-[#C52828] font-black text-white shadow-md ring-2 shadow-[#C52828]/25 ring-[#C52828]/20'
                                    : 'border-[#E8DFC8] bg-[#FAF6EC] font-bold text-neutral-700 shadow-2xs hover:border-[#DFCFA9] hover:bg-[#F3EAD5] hover:text-neutral-950'
                            }`}
                        >
                            <div className="flex min-w-0 items-center gap-2.5">
                                <div
                                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-all ${
                                        activeMainTab === 'overview'
                                            ? 'bg-white/20 text-white shadow-xs'
                                            : 'border border-[#DFCFA9] bg-white text-[#C52828] shadow-2xs group-hover:scale-105'
                                    }`}
                                >
                                    <BarChart3 className="size-4" />
                                </div>
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-xs leading-tight font-black sm:text-[13px]">
                                        Ringkasan Penjualan
                                    </span>
                                    <span
                                        className={`mt-0.5 truncate text-[10px] font-medium ${
                                            activeMainTab === 'overview'
                                                ? 'text-red-100'
                                                : 'text-neutral-500'
                                        }`}
                                    >
                                        Tren pendapatan &amp; distribusi
                                    </span>
                                </div>
                            </div>
                        </button>

                        {/* Tab 2: Kinerja Produk */}
                        <button
                            type="button"
                            onClick={() => setActiveMainTab('products')}
                            className={`group relative flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-left transition-all sm:px-3.5 sm:py-2.5 ${
                                activeMainTab === 'products'
                                    ? 'border-[#C52828] bg-[#C52828] font-black text-white shadow-md ring-2 shadow-[#C52828]/25 ring-[#C52828]/20'
                                    : 'border-[#E8DFC8] bg-[#FAF6EC] font-bold text-neutral-700 shadow-2xs hover:border-[#DFCFA9] hover:bg-[#F3EAD5] hover:text-neutral-950'
                            }`}
                        >
                            <div className="flex min-w-0 items-center gap-2.5">
                                <div
                                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-all ${
                                        activeMainTab === 'products'
                                            ? 'bg-white/20 text-white shadow-xs'
                                            : 'border border-[#DFCFA9] bg-white text-[#C52828] shadow-2xs group-hover:scale-105'
                                    }`}
                                >
                                    <Coffee className="size-4" />
                                </div>
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-xs leading-tight font-black sm:text-[13px]">
                                        Kinerja Produk
                                    </span>
                                    <span
                                        className={`mt-0.5 truncate text-[10px] font-medium ${
                                            activeMainTab === 'products'
                                                ? 'text-red-100'
                                                : 'text-neutral-500'
                                        }`}
                                    >
                                        Analisis menu &amp; kategori
                                    </span>
                                </div>
                            </div>
                            <span
                                className={`ml-1.5 shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold transition-colors ${
                                    activeMainTab === 'products'
                                        ? 'bg-white/25 text-white'
                                        : 'bg-neutral-900 text-white shadow-2xs'
                                }`}
                            >
                                {activeTopSelling.length}
                            </span>
                        </button>

                        {/* Tab 3: Operasional & Kasir */}
                        <button
                            type="button"
                            onClick={() => setActiveMainTab('operations')}
                            className={`group relative flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-left transition-all sm:px-3.5 sm:py-2.5 ${
                                activeMainTab === 'operations'
                                    ? 'border-[#C52828] bg-[#C52828] font-black text-white shadow-md ring-2 shadow-[#C52828]/25 ring-[#C52828]/20'
                                    : 'border-[#E8DFC8] bg-[#FAF6EC] font-bold text-neutral-700 shadow-2xs hover:border-[#DFCFA9] hover:bg-[#F3EAD5] hover:text-neutral-950'
                            }`}
                        >
                            <div className="flex min-w-0 items-center gap-2.5">
                                <div
                                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-all ${
                                        activeMainTab === 'operations'
                                            ? 'bg-white/20 text-white shadow-xs'
                                            : 'border border-[#DFCFA9] bg-white text-[#C52828] shadow-2xs group-hover:scale-105'
                                    }`}
                                >
                                    <UtensilsCrossed className="size-4" />
                                </div>
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-xs leading-tight font-black sm:text-[13px]">
                                        Operasional &amp; Kasir
                                    </span>
                                    <span
                                        className={`mt-0.5 truncate text-[10px] font-medium ${
                                            activeMainTab === 'operations'
                                                ? 'text-red-100'
                                                : 'text-neutral-500'
                                        }`}
                                    >
                                        Status layanan &amp; kinerja staf
                                    </span>
                                </div>
                            </div>
                        </button>

                        {/* Tab 4: Laporan Keuangan */}
                        <button
                            type="button"
                            onClick={() => setActiveMainTab('financial')}
                            className={`group relative flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-left transition-all sm:px-3.5 sm:py-2.5 ${
                                activeMainTab === 'financial'
                                    ? 'border-[#C52828] bg-[#C52828] font-black text-white shadow-md ring-2 shadow-[#C52828]/25 ring-[#C52828]/20'
                                    : 'border-[#E8DFC8] bg-[#FAF6EC] font-bold text-neutral-700 shadow-2xs hover:border-[#DFCFA9] hover:bg-[#F3EAD5] hover:text-neutral-950'
                            }`}
                        >
                            <div className="flex min-w-0 items-center gap-2.5">
                                <div
                                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-all ${
                                        activeMainTab === 'financial'
                                            ? 'bg-white/20 text-white shadow-xs'
                                            : 'border border-[#DFCFA9] bg-white text-[#C52828] shadow-2xs group-hover:scale-105'
                                    }`}
                                >
                                    <ShieldCheck className="size-4" />
                                </div>
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-xs leading-tight font-black sm:text-[13px]">
                                        Laporan Keuangan
                                    </span>
                                    <span
                                        className={`mt-0.5 truncate text-[10px] font-medium ${
                                            activeMainTab === 'financial'
                                                ? 'text-red-100'
                                                : 'text-neutral-500'
                                        }`}
                                    >
                                        Rekapitulasi, laba &amp; arus kas
                                    </span>
                                </div>
                            </div>
                        </button>

                        {/* Tab 5: Riwayat Transaksi */}
                        <button
                            type="button"
                            onClick={() => setActiveMainTab('transactions')}
                            className={`group relative flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-left transition-all sm:px-3.5 sm:py-2.5 ${
                                activeMainTab === 'transactions'
                                    ? 'border-[#C52828] bg-[#C52828] font-black text-white shadow-md ring-2 shadow-[#C52828]/25 ring-[#C52828]/20'
                                    : 'border-[#E8DFC8] bg-[#FAF6EC] font-bold text-neutral-700 shadow-2xs hover:border-[#DFCFA9] hover:bg-[#F3EAD5] hover:text-neutral-950'
                            }`}
                        >
                            <div className="flex min-w-0 items-center gap-2.5">
                                <div
                                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-all ${
                                        activeMainTab === 'transactions'
                                            ? 'bg-white/20 text-white shadow-xs'
                                            : 'border border-[#DFCFA9] bg-white text-[#C52828] shadow-2xs group-hover:scale-105'
                                    }`}
                                >
                                    <Receipt className="size-4" />
                                </div>
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-xs leading-tight font-black sm:text-[13px]">
                                        Riwayat Transaksi
                                    </span>
                                    <span
                                        className={`mt-0.5 truncate text-[10px] font-medium ${
                                            activeMainTab === 'transactions'
                                                ? 'text-red-100'
                                                : 'text-neutral-500'
                                        }`}
                                    >
                                        Daftar &amp; rincian transaksi
                                    </span>
                                </div>
                            </div>
                            <span
                                className={`ml-1.5 shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold transition-colors ${
                                    activeMainTab === 'transactions'
                                        ? 'bg-white/25 text-white'
                                        : 'bg-neutral-900 text-white shadow-2xs'
                                }`}
                            >
                                {filtered_table_totals.count}
                            </span>
                        </button>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* 4. KONTEN TAB 1: RINGKASAN PENJUALAN */}
                {/* ========================================================================= */}
                {activeMainTab === 'overview' && (
                    <div className="space-y-5">
                        {/* Baris 1: Grafik Utama Tren Pendapatan & Panel Distribusi Penjualan */}
                        <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
                            {/* KOLOM KIRI (2 Kolom): Grafik Tren Pendapatan */}
                            <div className="flex flex-col justify-between rounded-2xl border border-[#DFCFA9] bg-white p-4 shadow-2xs sm:p-5 lg:col-span-2">
                                <div className="flex flex-col justify-between gap-3 border-b border-[#F2EBD9] pb-3.5 sm:flex-row sm:items-center">
                                    <div>
                                        <h3 className="flex items-center gap-2 text-sm font-black text-neutral-900">
                                            <BarChart3 className="size-4 text-[#C52828]" />
                                            <span>Tren Pendapatan</span>
                                        </h3>
                                        <p className="mt-0.5 text-xs text-neutral-500">
                                            Perkembangan pendapatan bersih pada
                                            periode {filters.period_label}{' '}
                                            (Tampilan:{' '}
                                            {chart.aggregation === 'daily'
                                                ? 'Harian'
                                                : chart.aggregation === 'weekly'
                                                  ? 'Mingguan'
                                                  : 'Bulanan'}
                                            )
                                        </p>
                                    </div>

                                    {/* Indikator Periode Laporan */}
                                    <div className="flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] px-3 py-1.5 sm:self-auto">
                                        <Calendar className="size-3.5 text-[#C52828]" />
                                        <span className="text-xs font-black text-neutral-800">
                                            {filters.period_label}
                                        </span>
                                    </div>
                                </div>

                                {/* Banner Ringkasan Periode: Tanggal, Pendapatan Bersih & Status Lunas */}
                                <div className="mt-4 flex flex-col justify-between gap-2.5 rounded-2xl border border-[#DFCFA9] bg-gradient-to-r from-[#FAF6EC] to-[#F3EAD5] px-4 py-2.5 sm:flex-row sm:items-center">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <div className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                                        <div className="flex min-w-0 items-center gap-1.5 text-xs">
                                            <span className="font-medium text-neutral-500">
                                                Ringkasan Periode:
                                            </span>
                                            <strong className="truncate font-black text-neutral-900">
                                                {activeInspectedPoint
                                                    ? activeInspectedPoint.full_label
                                                    : chartPeakPoint
                                                      ? `${chartPeakPoint.full_label} (Pendapatan Tertinggi)`
                                                      : 'Arahkan kursor pada grafik untuk melihat rincian'}
                                            </strong>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2 font-mono text-xs">
                                        <span className="font-medium text-neutral-500">
                                            Pendapatan Bersih:
                                        </span>
                                        <strong className="text-sm font-black text-[#C52828]">
                                            {formatRupiah(
                                                activeInspectedPoint
                                                    ? activeInspectedPoint.net_revenue
                                                    : chartPeakPoint
                                                      ? chartPeakPoint.net_revenue
                                                      : chart.total_revenue,
                                            )}
                                        </strong>
                                        <span className="text-[11px] font-bold text-neutral-500">
                                            (
                                            {activeInspectedPoint
                                                ? activeInspectedPoint.paid_orders_count
                                                : chartPeakPoint
                                                  ? chartPeakPoint.paid_orders_count
                                                  : chart.total_paid_orders}{' '}
                                            transaksi lunas)
                                        </span>
                                    </div>
                                </div>

                                {/* GRAFIK TREN PENDAPATAN PERIODE LAPORAN */}
                                <div className="mt-3 flex flex-col">
                                    {chart.data.length === 0 ? (
                                        <div className="flex h-60 flex-col items-center justify-center p-4 text-center">
                                            <p className="text-xs font-bold text-neutral-500">
                                                Tidak ada transaksi pada periode
                                                laporan ini.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex w-full items-stretch gap-2.5">
                                            {/* Kolom Skala Nilai (Y-Axis) di Samping Kiri */}
                                            <div className="flex w-14 shrink-0 flex-col items-end justify-between pt-1 pb-7 font-mono text-[10px] font-bold text-neutral-400 select-none sm:w-16">
                                                <span>
                                                    {formatCompactRupiah(
                                                        chartYAxisMax,
                                                    )}
                                                </span>
                                                <span>
                                                    {formatCompactRupiah(
                                                        Math.round(
                                                            chartYAxisMax *
                                                                0.75,
                                                        ),
                                                    )}
                                                </span>
                                                <span>
                                                    {formatCompactRupiah(
                                                        Math.round(
                                                            chartYAxisMax * 0.5,
                                                        ),
                                                    )}
                                                </span>
                                                <span>
                                                    {formatCompactRupiah(
                                                        Math.round(
                                                            chartYAxisMax *
                                                                0.25,
                                                        ),
                                                    )}
                                                </span>
                                                <span>Rp 0</span>
                                            </div>

                                            {/* Canvas Grafik Batang & Sumbu X */}
                                            <div className="flex min-w-0 flex-1 flex-col">
                                                {/* Canvas Area dengan Garis Grid Horisontal */}
                                                <div className="relative h-60 w-full">
                                                    {/* Garis Grid Horisontal */}
                                                    <div className="pointer-events-none absolute inset-x-0 top-1 border-b border-dashed border-[#E8DFC8]" />
                                                    <div className="pointer-events-none absolute inset-x-0 top-[25%] border-b border-dashed border-[#E8DFC8]" />
                                                    <div className="pointer-events-none absolute inset-x-0 top-[50%] border-b border-dashed border-[#E8DFC8]" />
                                                    <div className="pointer-events-none absolute inset-x-0 top-[75%] border-b border-dashed border-[#E8DFC8]" />
                                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 border-b-2 border-[#DFCFA9]" />

                                                    {/* Batang-batang Kotak Pendapatan */}
                                                    <div className="absolute inset-0 flex items-end justify-between gap-1 px-0.5 pb-0.5 sm:gap-1.5">
                                                        {chart.data.map(
                                                            (point) => {
                                                                const isPeak =
                                                                    chartPeakPoint &&
                                                                    point.key ===
                                                                        chartPeakPoint.key;
                                                                const isHovered =
                                                                    inspectedDateKey ===
                                                                    point.key;
                                                                const hasRevenue =
                                                                    point.net_revenue >
                                                                    0;
                                                                const heightPercent =
                                                                    chartYAxisMax >
                                                                    0
                                                                        ? Math.min(
                                                                              100,
                                                                              Math.max(
                                                                                  hasRevenue
                                                                                      ? 6
                                                                                      : 2,
                                                                                  Math.round(
                                                                                      (point.net_revenue /
                                                                                          chartYAxisMax) *
                                                                                          100,
                                                                                  ),
                                                                              ),
                                                                          )
                                                                        : 2;

                                                                return (
                                                                    <div
                                                                        key={
                                                                            point.key
                                                                        }
                                                                        onMouseEnter={() =>
                                                                            setInspectedDateKey(
                                                                                point.key,
                                                                            )
                                                                        }
                                                                        onMouseLeave={() =>
                                                                            setInspectedDateKey(
                                                                                null,
                                                                            )
                                                                        }
                                                                        className="group relative flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end"
                                                                    >
                                                                        {/* Floating Pill: HANYA saat di-hover ATAU tanggal pendapatan tertinggi */}
                                                                        {(isHovered ||
                                                                            (isPeak &&
                                                                                !inspectedDateKey)) && (
                                                                            <div className="pointer-events-none absolute -top-8 z-30 animate-in whitespace-nowrap duration-150 zoom-in-95 fade-in">
                                                                                <span
                                                                                    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-black shadow-md ${
                                                                                        isPeak
                                                                                            ? 'bg-[#C52828] text-white ring-1 ring-white'
                                                                                            : 'bg-[#18181B] text-emerald-300 ring-1 ring-white/20'
                                                                                    }`}
                                                                                >
                                                                                    {formatCompactRupiah(
                                                                                        point.net_revenue,
                                                                                    )}
                                                                                </span>
                                                                            </div>
                                                                        )}

                                                                        {/* Bentuk Batang: KOTAK (Rectangular Box) */}
                                                                        {hasRevenue ? (
                                                                            <div
                                                                                style={{
                                                                                    height: `${heightPercent}%`,
                                                                                }}
                                                                                className={`w-full max-w-[28px] rounded-t-xs transition-all duration-200 ${
                                                                                    isPeak
                                                                                        ? 'bg-[#C52828] shadow-sm hover:bg-[#A81E1E]'
                                                                                        : 'bg-[#10B981] shadow-2xs hover:bg-[#059669]'
                                                                                } ${isHovered ? 'ring-2 ring-[#18181B] brightness-110' : ''}`}
                                                                            />
                                                                        ) : (
                                                                            <div
                                                                                className={`h-1.5 w-full max-w-[28px] rounded-xs bg-[#E8DFC8]/70 transition-colors hover:bg-[#DFCFA9] ${
                                                                                    isHovered
                                                                                        ? 'bg-[#C52828]/50'
                                                                                        : ''
                                                                                }`}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                );
                                                            },
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Sumbu X: Tanggal Harian di Bawah Setiap Bar */}
                                                <div className="mt-1 flex justify-between gap-1 px-0.5 pt-2 sm:gap-1.5">
                                                    {chart.data.map((point) => {
                                                        const dayNumber =
                                                            point.key.includes(
                                                                '-',
                                                            ) &&
                                                            point.key.split('-')
                                                                .length === 3
                                                                ? point.key.split(
                                                                      '-',
                                                                  )[2]
                                                                : point.label;
                                                        const isPeak =
                                                            chartPeakPoint &&
                                                            point.key ===
                                                                chartPeakPoint.key;
                                                        const isHovered =
                                                            inspectedDateKey ===
                                                            point.key;
                                                        const hasRevenue =
                                                            point.net_revenue >
                                                            0;

                                                        return (
                                                            <div
                                                                key={point.key}
                                                                onMouseEnter={() =>
                                                                    setInspectedDateKey(
                                                                        point.key,
                                                                    )
                                                                }
                                                                onMouseLeave={() =>
                                                                    setInspectedDateKey(
                                                                        null,
                                                                    )
                                                                }
                                                                className="flex min-w-0 flex-1 cursor-pointer flex-col items-center"
                                                            >
                                                                <span
                                                                    className={`block font-mono text-[10px] leading-none transition-colors ${
                                                                        isHovered
                                                                            ? 'scale-110 font-black text-[#C52828]'
                                                                            : isPeak
                                                                              ? 'font-black text-[#C52828]'
                                                                              : hasRevenue
                                                                                ? 'font-bold text-neutral-900'
                                                                                : 'font-medium text-neutral-400'
                                                                    }`}
                                                                    title={
                                                                        point.full_label
                                                                    }
                                                                >
                                                                    {dayNumber}
                                                                </span>
                                                                {/* Dot penanda ada transaksi */}
                                                                <span
                                                                    className={`mt-1 size-1 rounded-full transition-all ${
                                                                        isPeak
                                                                            ? 'bg-[#C52828]'
                                                                            : hasRevenue
                                                                              ? 'bg-emerald-500'
                                                                              : 'bg-transparent'
                                                                    }`}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Legenda & Ringkasan Bar Bawah */}
                                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 border-t border-[#F2EBD9] pt-2.5 text-xs text-neutral-600">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center gap-1.5 font-medium">
                                                <span className="size-2.5 rounded-xs bg-[#C52828]" />{' '}
                                                Pendapatan Tertinggi
                                            </span>
                                            <span className="flex items-center gap-1.5 font-medium">
                                                <span className="size-2.5 rounded-xs bg-emerald-600" />{' '}
                                                Transaksi Terealisasi
                                            </span>
                                            <span className="flex items-center gap-1.5 font-medium text-neutral-400">
                                                <span className="size-2.5 rounded-xs bg-[#E8DFC8]" />{' '}
                                                Tanpa Transaksi
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[11px]">
                                                    Kelompok Waktu:
                                                </span>
                                                <div className="inline-flex rounded-lg border border-[#DFCFA9] bg-[#FAF6EC] p-0.5 text-[10px] font-bold">
                                                    {(
                                                        [
                                                            {
                                                                key: 'daily',
                                                                label: 'Harian',
                                                            },
                                                            {
                                                                key: 'weekly',
                                                                label: 'Mingguan',
                                                            },
                                                            {
                                                                key: 'monthly',
                                                                label: 'Bulanan',
                                                            },
                                                        ] as const
                                                    ).map((agg) => (
                                                        <button
                                                            key={agg.key}
                                                            type="button"
                                                            onClick={() =>
                                                                applyFilters({
                                                                    aggregation:
                                                                        agg.key,
                                                                })
                                                            }
                                                            className={`cursor-pointer rounded-md px-2 py-0.5 font-sans ${
                                                                chart.aggregation ===
                                                                agg.key
                                                                    ? 'bg-[#18181B] text-white'
                                                                    : 'text-neutral-600 hover:text-neutral-900'
                                                            }`}
                                                        >
                                                            {agg.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <span className="font-mono text-xs">
                                                Total Pendapatan Bersih:{' '}
                                                <strong className="text-neutral-900">
                                                    {formatRupiah(
                                                        chart.total_revenue,
                                                    )}
                                                </strong>{' '}
                                                ({chart.total_paid_orders}{' '}
                                                lunas)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* KOLOM KANAN (1 Kolom): Distribusi Penjualan Mingguan & Proporsi Pembayaran */}
                            <div className="flex flex-col justify-between space-y-4">
                                {/* Panel Distribusi Penjualan Mingguan */}
                                <div className="rounded-2xl border border-[#DFCFA9] bg-white p-4 shadow-2xs sm:p-5">
                                    <div className="flex items-center justify-between border-b border-[#F2EBD9] pb-3">
                                        <h3 className="flex items-center gap-1.5 text-xs font-black tracking-wider text-neutral-900 uppercase">
                                            <Sparkles className="size-4 text-[#C52828]" />
                                            <span>
                                                Distribusi Penjualan Mingguan
                                            </span>
                                        </h3>
                                        <span className="rounded-md border border-[#DFCFA9] bg-[#FAF5E8] px-2 py-0.5 text-[10px] font-bold text-neutral-500">
                                            Periode Laporan
                                        </span>
                                    </div>

                                    <div className="mt-3.5 space-y-3">
                                        <div className="rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-3">
                                            <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                                Hari Penjualan Tertinggi
                                            </span>
                                            <div className="mt-1 flex items-baseline justify-between">
                                                <span className="text-lg font-black text-[#C52828]">
                                                    {activeBusiestDay?.busiest_day_name ||
                                                        'Belum Tersedia'}
                                                </span>
                                                <span className="font-mono text-xs font-bold text-neutral-800">
                                                    {formatRupiah(
                                                        activeBusiestDay?.busiest_day_revenue ??
                                                            0,
                                                    )}
                                                </span>
                                            </div>
                                            <span className="mt-0.5 block text-[10px] text-neutral-500">
                                                Total{' '}
                                                {activeBusiestDay?.busiest_day_orders ??
                                                    0}{' '}
                                                transaksi lunas pada hari
                                                tersebut
                                            </span>
                                        </div>

                                        {activeBusiestDay?.peak_date_label && (
                                            <div className="rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-3">
                                                <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                                    Tanggal Pendapatan Tertinggi
                                                </span>
                                                <div className="mt-1 text-xs font-black text-neutral-900">
                                                    {
                                                        activeBusiestDay.peak_date_label
                                                    }
                                                </div>
                                                <div className="mt-1 flex items-center justify-between font-mono text-xs font-bold text-emerald-700">
                                                    <span>
                                                        {formatRupiah(
                                                            activeBusiestDay.peak_date_revenue,
                                                        )}
                                                    </span>
                                                    <span className="font-normal text-neutral-500">
                                                        (
                                                        {
                                                            activeBusiestDay.peak_date_orders
                                                        }{' '}
                                                        pesanan)
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Sebaran Penjualan per Hari (Senin s/d Minggu) */}
                                        {activeBusiestDay?.day_of_week && (
                                            <div className="space-y-1.5 pt-1">
                                                <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                                    Sebaran Penjualan per Hari:
                                                </span>
                                                <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px]">
                                                    {activeBusiestDay.day_of_week.map(
                                                        (dow) => (
                                                            <div
                                                                key={
                                                                    dow.day_num
                                                                }
                                                                className={`rounded-lg border p-1 ${
                                                                    dow.is_busiest
                                                                        ? 'border-[#A81E1E] bg-[#C52828] font-black text-white'
                                                                        : dow.revenue >
                                                                            0
                                                                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                                                          : 'border-[#DFCFA9] bg-[#FAF5E8] text-neutral-400'
                                                                }`}
                                                                title={`${dow.day_name}: ${formatRupiah(dow.revenue)} (${dow.orders_count} pesanan)`}
                                                            >
                                                                <span>
                                                                    {dow.day_name.substring(
                                                                        0,
                                                                        3,
                                                                    )}
                                                                </span>
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Panel Proporsi Metode Pembayaran */}
                                <div className="rounded-2xl border border-[#DFCFA9] bg-white p-4 shadow-2xs sm:p-5">
                                    <div className="flex items-center justify-between border-b border-[#F2EBD9] pb-3">
                                        <h3 className="flex items-center gap-1.5 text-xs font-black tracking-wider text-neutral-900 uppercase">
                                            <Wallet className="size-4 text-[#C52828]" />
                                            <span>
                                                Proporsi Metode Pembayaran
                                            </span>
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setActiveMainTab('financial');
                                                setFinancialSubTab('revenue');
                                            }}
                                            className="text-[10px] font-bold text-[#C52828] hover:underline"
                                        >
                                            Rincian &rarr;
                                        </button>
                                    </div>

                                    <div className="mt-3 space-y-2.5">
                                        {/* QRIS via Xendit */}
                                        <div className="space-y-1 rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-2.5">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="flex items-center gap-1.5 font-bold text-neutral-900">
                                                    <QrCode className="size-3.5 text-indigo-600" />
                                                    <span>
                                                        QRIS Xendit (
                                                        {qrisMethod?.revenue_share_percent ??
                                                            0}
                                                        %)
                                                    </span>
                                                </span>
                                                <strong className="font-mono font-bold text-neutral-900">
                                                    {formatRupiah(
                                                        qrisMethod?.net_revenue ??
                                                            0,
                                                    )}
                                                </strong>
                                            </div>
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white">
                                                <div
                                                    style={{
                                                        width: `${qrisMethod?.revenue_share_percent ?? 0}%`,
                                                    }}
                                                    className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                                                />
                                            </div>
                                            <div className="flex justify-between pt-0.5 text-[10px] text-neutral-500">
                                                <span>
                                                    {qrisMethod?.transactions_count ??
                                                        0}{' '}
                                                    transaksi lunas
                                                </span>
                                                {qrisMethod?.unpaid_count ? (
                                                    <span className="font-bold text-amber-700">
                                                        {
                                                            qrisMethod.unpaid_count
                                                        }{' '}
                                                        belum dibayar
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        {/* Tunai */}
                                        <div className="space-y-1 rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-2.5">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="flex items-center gap-1.5 font-bold text-neutral-900">
                                                    <Banknote className="size-3.5 text-emerald-600" />
                                                    <span>
                                                        Tunai (
                                                        {cashMethod?.revenue_share_percent ??
                                                            0}
                                                        %)
                                                    </span>
                                                </span>
                                                <strong className="font-mono font-bold text-neutral-900">
                                                    {formatRupiah(
                                                        cashMethod?.net_revenue ??
                                                            0,
                                                    )}
                                                </strong>
                                            </div>
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white">
                                                <div
                                                    style={{
                                                        width: `${cashMethod?.revenue_share_percent ?? 0}%`,
                                                    }}
                                                    className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                                                />
                                            </div>
                                            <div className="flex justify-between pt-0.5 text-[10px] text-neutral-500">
                                                <span>
                                                    {cashMethod?.transactions_count ??
                                                        0}{' '}
                                                    transaksi lunas
                                                </span>
                                                {cashMethod?.unpaid_count ? (
                                                    <span className="font-bold text-amber-700">
                                                        {
                                                            cashMethod.unpaid_count
                                                        }{' '}
                                                        belum dibayar
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        {/* Slot Integrasi Xendit Payment Gateway */}
                                        <div className="space-y-1.5 rounded-xl border border-indigo-200/90 bg-indigo-50/70 p-2.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex min-w-0 items-center gap-1.5">
                                                    <CreditCard className="size-3.5 shrink-0 text-indigo-700" />
                                                    <span className="truncate text-[11px] font-black text-indigo-950">
                                                        {summary
                                                            .xendit_integration
                                                            ?.label ??
                                                            'Xendit Payment Gateway'}
                                                    </span>
                                                </div>
                                                <span className="shrink-0 rounded border border-indigo-200 bg-white px-1.5 py-0.5 text-[9.5px] font-bold text-indigo-700">
                                                    {summary.xendit_integration
                                                        ?.mode ??
                                                        'Sandbox Ready Slot'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] text-indigo-900/80">
                                                <span>
                                                    {summary.xendit_integration
                                                        ?.transactions_count ??
                                                        qrisMethod?.transactions_count ??
                                                        0}{' '}
                                                    transaksi selesai
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveMainTab(
                                                            'transactions',
                                                        );
                                                        applyFilters({
                                                            payment_gateway:
                                                                'xendit',
                                                        });
                                                    }}
                                                    className="cursor-pointer font-bold text-indigo-700 hover:underline"
                                                >
                                                    Lihat Transaksi Xendit
                                                    &rarr;
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* 5. KONTEN TAB 2: KINERJA PRODUK & KATEGORI */}
                {/* ========================================================================= */}
                {activeMainTab === 'products' && (
                    <div className="space-y-5">
                        {/* 1. Baris Distribusi Kontribusi Kategori Menu */}
                        <div className="space-y-4 rounded-2xl border border-[#DFCFA9] bg-white p-4 shadow-2xs sm:p-5">
                            <div className="flex flex-col justify-between gap-2 border-b border-[#F2EBD9] pb-3 sm:flex-row sm:items-center">
                                <div>
                                    <h3 className="flex items-center gap-2 text-sm font-black text-neutral-900">
                                        <Layers className="size-4 text-[#C52828]" />
                                        <span>
                                            Kontribusi Pendapatan per Kategori
                                        </span>
                                    </h3>
                                    <p className="mt-0.5 text-xs text-neutral-500">
                                        Distribusi volume penjualan dan
                                        kontribusi pendapatan tiap kategori pada
                                        periode {filters.period_label}
                                    </p>
                                </div>
                                <span className="self-start rounded-lg border border-[#DFCFA9] bg-[#FAF6EC] px-2.5 py-1 font-mono text-xs font-bold text-neutral-700 sm:self-auto">
                                    Total Volume:{' '}
                                    {product_analytics?.total_period_items_sold ??
                                        summary.period.items_sold}{' '}
                                    porsi
                                </span>
                            </div>

                            {/* Bar Kontribusi Visual Multi-Warna */}
                            {activeCategories.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex h-3 w-full overflow-hidden rounded-full border border-[#DFCFA9] bg-neutral-100">
                                        {activeCategories.map((cat, idx) => {
                                            const colors = [
                                                'bg-[#C52828]',
                                                'bg-[#D39E4E]',
                                                'bg-indigo-600',
                                                'bg-emerald-600',
                                                'bg-purple-600',
                                            ];
                                            const color =
                                                colors[idx % colors.length];
                                            if (cat.revenue_share_percent <= 0)
                                                return null;
                                            return (
                                                <div
                                                    key={cat.id}
                                                    style={{
                                                        width: `${cat.revenue_share_percent}%`,
                                                    }}
                                                    className={`${color} h-full transition-all`}
                                                    title={`${cat.name}: ${cat.revenue_share_percent}% (${formatRupiah(cat.total_revenue)})`}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 text-xs">
                                        {activeCategories.map((cat, idx) => {
                                            const dotColors = [
                                                'bg-[#C52828]',
                                                'bg-[#D39E4E]',
                                                'bg-indigo-600',
                                                'bg-emerald-600',
                                                'bg-purple-600',
                                            ];
                                            const dot =
                                                dotColors[
                                                    idx % dotColors.length
                                                ];
                                            return (
                                                <div
                                                    key={cat.id}
                                                    className="flex items-center gap-1.5 font-medium"
                                                >
                                                    <span
                                                        className={`size-2.5 rounded-xs ${dot}`}
                                                    />
                                                    <span>{cat.name}:</span>
                                                    <strong className="font-mono text-neutral-900">
                                                        {
                                                            cat.revenue_share_percent
                                                        }
                                                        %
                                                    </strong>
                                                    <span className="text-[10px] text-neutral-400">
                                                        ({cat.total_qty} porsi)
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Kartu Grid Performa Tiap Kategori */}
                            <div className="grid grid-cols-1 gap-3.5 pt-2 sm:grid-cols-2 lg:grid-cols-4">
                                {activeCategories.map((cat) => (
                                    <div
                                        key={cat.id}
                                        className="space-y-2 rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-3.5"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black tracking-wide text-neutral-900 uppercase">
                                                {cat.name}
                                            </span>
                                            <Badge
                                                variant="outline"
                                                className="border-[#DFCFA9] bg-white text-[10px]"
                                            >
                                                {cat.menu_count} menu
                                            </Badge>
                                        </div>
                                        <div className="font-mono text-lg font-black text-neutral-900">
                                            {formatRupiah(cat.total_revenue)}
                                        </div>
                                        <div className="flex justify-between border-t border-[#E8DFC8] pt-2 font-mono text-[11px] text-neutral-600">
                                            <span>
                                                Volume:{' '}
                                                <strong>
                                                    {cat.total_qty} porsi
                                                </strong>
                                            </span>
                                            <span>
                                                Kontribusi:{' '}
                                                <strong>
                                                    {cat.revenue_share_percent}%
                                                </strong>
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 2. Baris Analisis Produk: Volume Tertinggi, Pendapatan Tertinggi, Penjualan Terendah */}
                        <div className="space-y-5 rounded-3xl border border-[#DFCFA9] bg-white p-5 shadow-sm sm:p-6">
                            {/* Header & Sub-Tab Switcher & Quick Search */}
                            <div className="flex flex-col justify-between gap-4 border-b border-[#F2EBD9] pb-4 lg:flex-row lg:items-center">
                                <div className="flex items-start gap-3">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#C52828] text-white shadow-md shadow-[#C52828]/25">
                                        <Coffee className="size-5" />
                                    </div>
                                    <div>
                                        <h3 className="flex items-center gap-2 text-base font-black tracking-tight text-neutral-900">
                                            <span>Laporan Kinerja Menu</span>
                                        </h3>
                                        <p className="mt-0.5 text-xs font-medium text-neutral-500">
                                            Peringkat penjualan menu berdasarkan
                                            volume terjual, kontribusi
                                            pendapatan, dan evaluasi produk
                                            berkinerja rendah
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
                                    {/* Quick Realtime Search */}
                                    <div className="relative min-w-[200px]">
                                        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-neutral-400" />
                                        <input
                                            type="text"
                                            placeholder="Cari nama menu..."
                                            value={menuSearchQuery}
                                            onChange={(e) =>
                                                setMenuSearchQuery(
                                                    e.target.value,
                                                )
                                            }
                                            className="h-9 w-full rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] pr-8 pl-9 text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-1 focus:ring-[#C52828] focus:outline-none"
                                        />
                                        {menuSearchQuery && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setMenuSearchQuery('')
                                                }
                                                className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-neutral-400 hover:text-neutral-700"
                                            >
                                                <X className="size-3" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Switcher Sub-Tab Produk */}
                                    <div className="flex shrink-0 items-center gap-1 rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-1">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setProductTab('top_qty')
                                            }
                                            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                                                productTab === 'top_qty'
                                                    ? 'bg-[#C52828] font-black text-white shadow-xs'
                                                    : 'text-neutral-600 hover:bg-[#F2EBD9] hover:text-neutral-900'
                                            }`}
                                        >
                                            <Sparkles className="size-3.5" />
                                            <span>Volume Tertinggi</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setProductTab('top_rev')
                                            }
                                            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                                                productTab === 'top_rev'
                                                    ? 'bg-[#C52828] font-black text-white shadow-xs'
                                                    : 'text-neutral-600 hover:bg-[#F2EBD9] hover:text-neutral-900'
                                            }`}
                                        >
                                            <TrendingUp className="size-3.5" />
                                            <span>Pendapatan Tertinggi</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setProductTab('slow_moving')
                                            }
                                            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                                                productTab === 'slow_moving'
                                                    ? 'bg-[#C52828] font-black text-white shadow-xs'
                                                    : 'text-neutral-600 hover:bg-[#F2EBD9] hover:text-neutral-900'
                                            }`}
                                        >
                                            <AlertCircle className="size-3.5" />
                                            <span>Penjualan Terendah</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Ringkasan Sorotan Kinerja Menu */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="flex items-center gap-3 rounded-2xl border border-[#DFCFA9] bg-gradient-to-br from-[#FFFDF9] to-[#FAF6EC] p-3.5 shadow-2xs">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                                        <Sparkles className="size-5 text-amber-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                            Volume Penjualan Tertinggi
                                        </span>
                                        <strong className="block truncate text-xs font-black text-neutral-900">
                                            {activeTopSelling[0]?.menu_name ||
                                                'Belum Tersedia'}
                                        </strong>
                                        <span className="font-mono text-[11px] font-bold text-neutral-600">
                                            {activeTopSelling[0]?.total_qty ??
                                                0}{' '}
                                            porsi (
                                            {activeTopSelling[0]
                                                ?.contribution_percent ?? 0}
                                            %)
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 rounded-2xl border border-[#DFCFA9] bg-gradient-to-br from-[#FFFDF9] to-[#FAF6EC] p-3.5 shadow-2xs">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                                        <TrendingUp className="size-5 text-emerald-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                            Kontribusi Pendapatan Tertinggi
                                        </span>
                                        <strong className="block truncate text-xs font-black text-neutral-900">
                                            {activeHighestRevenue[0]
                                                ?.menu_name || 'Belum Tersedia'}
                                        </strong>
                                        <span className="font-mono text-[11px] font-bold text-emerald-700">
                                            {formatRupiah(
                                                activeHighestRevenue[0]
                                                    ?.total_revenue ?? 0,
                                            )}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 rounded-2xl border border-[#DFCFA9] bg-gradient-to-br from-[#FFFDF9] to-[#FAF6EC] p-3.5 shadow-2xs">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-800">
                                        <AlertCircle className="size-5 text-rose-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                            Evaluasi Kinerja Produk
                                        </span>
                                        <strong className="block truncate text-xs font-black text-neutral-900">
                                            {
                                                activeSlowMoving.filter(
                                                    (m) => m.is_zero_sales,
                                                ).length
                                            }{' '}
                                            Menu Tanpa Penjualan
                                        </strong>
                                        <span className="text-[11px] font-medium text-neutral-500">
                                            Perlu evaluasi harga atau promosi
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* TABEL PRODUK 1: PERINGKAT MENU BERDASARKAN VOLUME TERJUAL */}
                            {productTab === 'top_qty' && (
                                <div className="overflow-hidden rounded-2xl border border-[#DFCFA9] bg-white shadow-2xs">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead className="border-b border-[#DFCFA9] bg-[#FAF5E8] text-[10px] font-black tracking-wider text-neutral-700 uppercase">
                                                <tr>
                                                    <th className="w-16 px-3.5 py-3">
                                                        Peringkat
                                                    </th>
                                                    <th className="px-3.5 py-3">
                                                        Nama Menu
                                                    </th>
                                                    <th className="px-3.5 py-3">
                                                        Kategori
                                                    </th>
                                                    <th className="px-3.5 py-3 text-right">
                                                        Volume Terjual
                                                    </th>
                                                    <th className="px-3.5 py-3 text-right">
                                                        Total Pendapatan
                                                    </th>
                                                    <th className="w-60 px-3.5 py-3">
                                                        Proporsi Volume
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#F2EBD9]">
                                                {filteredTopSelling.length ===
                                                0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={6}
                                                            className="py-12 text-center text-neutral-400"
                                                        >
                                                            <div className="flex flex-col items-center gap-2">
                                                                <Coffee className="size-8 text-neutral-300" />
                                                                <span className="text-xs font-bold">
                                                                    Tidak ada
                                                                    data menu
                                                                    pada periode
                                                                    ini
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredTopSelling.map(
                                                        (item, idx) => (
                                                            <tr
                                                                key={
                                                                    item.menu_name
                                                                }
                                                                className={`transition-colors ${
                                                                    idx === 0
                                                                        ? 'bg-amber-50/40 hover:bg-amber-50/70'
                                                                        : 'hover:bg-[#FAF6EC]/70'
                                                                }`}
                                                            >
                                                                <td className="px-3.5 py-3.5 font-mono font-bold">
                                                                    {renderRankBadge(
                                                                        idx,
                                                                    )}
                                                                </td>
                                                                <td className="px-3.5 py-3.5">
                                                                    <div className="flex items-center gap-2.5">
                                                                        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] text-[#C52828] shadow-2xs">
                                                                            <Coffee className="size-4" />
                                                                        </div>
                                                                        <div className="flex flex-col">
                                                                            <span className="text-xs leading-tight font-black text-neutral-900 sm:text-[13px]">
                                                                                {
                                                                                    item.menu_name
                                                                                }
                                                                            </span>
                                                                            {item.total_qty >
                                                                                0 && (
                                                                                <span className="mt-0.5 font-mono text-[10px] font-medium text-neutral-500">
                                                                                    {formatRupiah(
                                                                                        Math.round(
                                                                                            item.total_revenue /
                                                                                                item.total_qty,
                                                                                        ),
                                                                                    )}{' '}
                                                                                    /
                                                                                    porsi
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-3.5 py-3.5">
                                                                    {renderMenuCategoryPill(
                                                                        item.category_name,
                                                                    )}
                                                                </td>
                                                                <td className="px-3.5 py-3.5 text-right font-mono">
                                                                    <span className="text-sm font-black text-neutral-900">
                                                                        {
                                                                            item.total_qty
                                                                        }
                                                                    </span>
                                                                    <span className="ml-1 text-[11px] font-bold text-neutral-500">
                                                                        porsi
                                                                    </span>
                                                                </td>
                                                                <td className="px-3.5 py-3.5 text-right font-mono">
                                                                    <span className="text-sm font-black text-neutral-900">
                                                                        {formatRupiah(
                                                                            item.total_revenue,
                                                                        )}
                                                                    </span>
                                                                    <span className="block text-[10px] font-bold text-emerald-700">
                                                                        Terealisasi
                                                                    </span>
                                                                </td>
                                                                <td className="px-3.5 py-3.5">
                                                                    <div className="flex items-center gap-2.5">
                                                                        <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-[#E8DFC8] bg-[#FAF6EC]">
                                                                            <div
                                                                                style={{
                                                                                    width: `${Math.min(100, item.relative_percentage ?? item.percentage ?? 100)}%`,
                                                                                }}
                                                                                className={`h-full rounded-full transition-all duration-500 ${
                                                                                    idx ===
                                                                                    0
                                                                                        ? 'bg-gradient-to-r from-[#C52828] to-amber-500'
                                                                                        : 'bg-gradient-to-r from-amber-500 to-amber-600'
                                                                                }`}
                                                                            />
                                                                        </div>
                                                                        <span className="shrink-0 rounded-md border border-[#DFCFA9] bg-white px-2 py-0.5 font-mono text-xs font-bold text-neutral-800 shadow-2xs">
                                                                            {item.contribution_percent ??
                                                                                0}
                                                                            %
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ),
                                                    )
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* TABEL PRODUK 2: PERINGKAT MENU BERDASARKAN PENDAPATAN */}
                            {productTab === 'top_rev' && (
                                <div className="overflow-hidden rounded-2xl border border-[#DFCFA9] bg-white shadow-2xs">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead className="border-b border-[#DFCFA9] bg-[#FAF5E8] text-[10px] font-black tracking-wider text-neutral-700 uppercase">
                                                <tr>
                                                    <th className="w-16 px-3.5 py-3">
                                                        Peringkat
                                                    </th>
                                                    <th className="px-3.5 py-3">
                                                        Nama Menu
                                                    </th>
                                                    <th className="px-3.5 py-3">
                                                        Kategori
                                                    </th>
                                                    <th className="px-3.5 py-3 text-right">
                                                        Volume Terjual
                                                    </th>
                                                    <th className="px-3.5 py-3 text-right">
                                                        Total Pendapatan
                                                    </th>
                                                    <th className="w-60 px-3.5 py-3">
                                                        Proporsi Pendapatan
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#F2EBD9]">
                                                {filteredHighestRevenue.length ===
                                                0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={6}
                                                            className="py-12 text-center text-neutral-400"
                                                        >
                                                            <div className="flex flex-col items-center gap-2">
                                                                <Coffee className="size-8 text-neutral-300" />
                                                                <span className="text-xs font-bold">
                                                                    Tidak ada
                                                                    data
                                                                    pendapatan
                                                                    menu pada
                                                                    periode ini
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredHighestRevenue.map(
                                                        (item, idx) => (
                                                            <tr
                                                                key={
                                                                    item.menu_name
                                                                }
                                                                className={`transition-colors ${
                                                                    idx === 0
                                                                        ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                                                                        : 'hover:bg-[#FAF6EC]/70'
                                                                }`}
                                                            >
                                                                <td className="px-3.5 py-3.5 font-mono font-bold">
                                                                    {renderRankBadge(
                                                                        idx,
                                                                    )}
                                                                </td>
                                                                <td className="px-3.5 py-3.5">
                                                                    <div className="flex items-center gap-2.5">
                                                                        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] text-emerald-700 shadow-2xs">
                                                                            <TrendingUp className="size-4" />
                                                                        </div>
                                                                        <div className="flex flex-col">
                                                                            <span className="text-xs leading-tight font-black text-neutral-900 sm:text-[13px]">
                                                                                {
                                                                                    item.menu_name
                                                                                }
                                                                            </span>
                                                                            {item.total_qty >
                                                                                0 && (
                                                                                <span className="mt-0.5 font-mono text-[10px] font-medium text-neutral-500">
                                                                                    {formatRupiah(
                                                                                        Math.round(
                                                                                            item.total_revenue /
                                                                                                item.total_qty,
                                                                                        ),
                                                                                    )}{' '}
                                                                                    /
                                                                                    porsi
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-3.5 py-3.5">
                                                                    {renderMenuCategoryPill(
                                                                        item.category_name,
                                                                    )}
                                                                </td>
                                                                <td className="px-3.5 py-3.5 text-right font-mono">
                                                                    <span className="text-sm font-black text-neutral-900">
                                                                        {
                                                                            item.total_qty
                                                                        }
                                                                    </span>
                                                                    <span className="ml-1 text-[11px] font-bold text-neutral-500">
                                                                        porsi
                                                                    </span>
                                                                </td>
                                                                <td className="px-3.5 py-3.5 text-right font-mono">
                                                                    <span className="text-sm font-black text-emerald-800">
                                                                        {formatRupiah(
                                                                            item.total_revenue,
                                                                        )}
                                                                    </span>
                                                                    <span className="block text-[10px] font-bold text-emerald-700">
                                                                        Terealisasi
                                                                    </span>
                                                                </td>
                                                                <td className="px-3.5 py-3.5">
                                                                    <div className="flex items-center gap-2.5">
                                                                        <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-[#E8DFC8] bg-[#FAF6EC]">
                                                                            <div
                                                                                style={{
                                                                                    width: `${Math.min(100, item.relative_percentage ?? 100)}%`,
                                                                                }}
                                                                                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-all duration-500"
                                                                            />
                                                                        </div>
                                                                        <span className="shrink-0 rounded-md border border-[#DFCFA9] bg-white px-2 py-0.5 font-mono text-xs font-bold text-neutral-800 shadow-2xs">
                                                                            {item.contribution_percent ??
                                                                                0}
                                                                            %
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ),
                                                    )
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* TABEL PRODUK 3: EVALUASI MENU BERKINERJA RENDAH */}
                            {productTab === 'slow_moving' && (
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3 rounded-2xl border border-amber-200/90 bg-amber-50 p-3.5 text-xs text-amber-950 shadow-2xs">
                                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                                        <div>
                                            <strong className="block font-black text-amber-900">
                                                Evaluasi Menu Berkinerja Rendah
                                            </strong>
                                            <span className="leading-relaxed text-amber-800/90">
                                                Daftar menu di bawah memiliki
                                                volume penjualan terendah atau
                                                belum terjual pada periode
                                                laporan ini. Disarankan
                                                melakukan evaluasi harga jual,
                                                promosi paket, atau penataan
                                                ulang daftar menu.
                                            </span>
                                        </div>
                                    </div>

                                    <div className="overflow-hidden rounded-2xl border border-[#DFCFA9] bg-white shadow-2xs">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-xs">
                                                <thead className="border-b border-[#DFCFA9] bg-[#FAF5E8] text-[10px] font-black tracking-wider text-neutral-700 uppercase">
                                                    <tr>
                                                        <th className="px-3.5 py-3">
                                                            Nama Menu
                                                        </th>
                                                        <th className="px-3.5 py-3">
                                                            Kategori
                                                        </th>
                                                        <th className="px-3.5 py-3 text-right">
                                                            Harga Satuan
                                                        </th>
                                                        <th className="px-3.5 py-3 text-right">
                                                            Volume Terjual
                                                        </th>
                                                        <th className="px-3.5 py-3 text-right">
                                                            Total Pendapatan
                                                        </th>
                                                        <th className="px-3.5 py-3">
                                                            Status &amp; Tindak
                                                            Lanjut
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#F2EBD9]">
                                                    {filteredSlowMoving.length ===
                                                    0 ? (
                                                        <tr>
                                                            <td
                                                                colSpan={6}
                                                                className="py-12 text-center text-neutral-400"
                                                            >
                                                                <div className="flex flex-col items-center gap-2">
                                                                    <CheckCircle2 className="size-8 text-emerald-400" />
                                                                    <span className="text-xs font-bold">
                                                                        Seluruh
                                                                        menu
                                                                        memiliki
                                                                        penjualan
                                                                        aktif
                                                                        pada
                                                                        periode
                                                                        ini
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        filteredSlowMoving.map(
                                                            (item) => (
                                                                <tr
                                                                    key={
                                                                        item.menu_id
                                                                    }
                                                                    className="transition-colors hover:bg-[#FAF6EC]/70"
                                                                >
                                                                    <td className="px-3.5 py-3.5">
                                                                        <div className="flex items-center gap-2.5">
                                                                            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] text-amber-700 shadow-2xs">
                                                                                <Coffee className="size-4" />
                                                                            </div>
                                                                            <span className="text-xs font-black text-neutral-900 sm:text-[13px]">
                                                                                {
                                                                                    item.menu_name
                                                                                }
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-3.5 py-3.5">
                                                                        {renderMenuCategoryPill(
                                                                            item.category_name,
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3.5 py-3.5 text-right font-mono text-neutral-700">
                                                                        <span className="text-xs font-bold">
                                                                            {formatRupiah(
                                                                                item.base_price,
                                                                            )}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3.5 py-3.5 text-right font-mono">
                                                                        <span className="text-sm font-black text-neutral-900">
                                                                            {
                                                                                item.total_qty
                                                                            }
                                                                        </span>
                                                                        <span className="ml-1 text-[11px] font-bold text-neutral-500">
                                                                            porsi
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3.5 py-3.5 text-right font-mono">
                                                                        <span className="text-xs font-bold text-neutral-800">
                                                                            {formatRupiah(
                                                                                item.total_revenue,
                                                                            )}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3.5 py-3.5">
                                                                        {item.is_zero_sales ? (
                                                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-[10px] font-black text-rose-800 shadow-2xs">
                                                                                <AlertCircle className="size-3 text-rose-600" />
                                                                                <span>
                                                                                    Belum
                                                                                    Ada
                                                                                    Penjualan
                                                                                    (Evaluasi
                                                                                    Produk)
                                                                                </span>
                                                                            </span>
                                                                        ) : (
                                                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-900 shadow-2xs">
                                                                                <Timer className="size-3 text-amber-700" />
                                                                                <span>
                                                                                    Penjualan
                                                                                    Rendah
                                                                                    (Disarankan
                                                                                    Promosi)
                                                                                </span>
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ),
                                                        )
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* 6. KONTEN TAB 3: OPERASIONAL & KASIR */}
                {/* ========================================================================= */}
                {activeMainTab === 'operations' && (
                    <div className="space-y-5">
                        {/* 1. Baris Status Pembayaran: QRIS vs Tunai Lengkap */}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            {/* KARTU PEMBAYARAN: QRIS */}
                            <div className="space-y-4 rounded-2xl border border-[#DFCFA9] bg-white p-5 shadow-2xs">
                                <div className="flex items-center justify-between border-b border-[#F2EBD9] pb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-indigo-700">
                                            <QrCode className="size-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-neutral-900">
                                                Penerimaan Pembayaran QRIS
                                            </h3>
                                            <p className="text-[11px] text-neutral-500">
                                                Rekapitulasi transaksi
                                                pembayaran nontunai (QRIS)
                                            </p>
                                        </div>
                                    </div>
                                    <Badge className="bg-indigo-600 font-mono text-xs text-white">
                                        {qrisMethod?.revenue_share_percent ?? 0}
                                        % Pendapatan
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-3">
                                        <span className="block text-[10px] font-bold text-neutral-500 uppercase">
                                            Pendapatan Bersih
                                        </span>
                                        <div className="mt-1 font-mono text-lg font-black text-neutral-900">
                                            {formatRupiah(
                                                qrisMethod?.net_revenue ?? 0,
                                            )}
                                        </div>
                                        <span className="mt-0.5 block text-[10px] font-bold text-emerald-700">
                                            {qrisMethod?.transactions_count ??
                                                0}{' '}
                                            transaksi lunas
                                        </span>
                                    </div>
                                    <div className="rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-3">
                                        <span className="block text-[10px] font-bold text-neutral-500 uppercase">
                                            Belum Dibayar / Dibatalkan
                                        </span>
                                        <div className="mt-1 font-mono text-sm font-black text-neutral-800">
                                            {qrisMethod?.unpaid_count ?? 0}{' '}
                                            Menunggu (
                                            {formatCompactRupiah(
                                                qrisMethod?.unpaid_amount ?? 0,
                                            )}
                                            )
                                        </div>
                                        <span className="mt-0.5 block text-[10px] font-bold text-rose-600">
                                            {qrisMethod?.cancelled_count ?? 0}{' '}
                                            transaksi dibatalkan (
                                            {formatCompactRupiah(
                                                qrisMethod?.cancelled_amount ??
                                                    0,
                                            )}
                                            )
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* KARTU PEMBAYARAN: TUNAI */}
                            <div className="space-y-4 rounded-2xl border border-[#DFCFA9] bg-white p-5 shadow-2xs">
                                <div className="flex items-center justify-between border-b border-[#F2EBD9] pb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-700">
                                            <Banknote className="size-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-neutral-900">
                                                Penerimaan Pembayaran Tunai
                                            </h3>
                                            <p className="text-[11px] text-neutral-500">
                                                Rekapitulasi transaksi
                                                pembayaran tunai di kasir
                                            </p>
                                        </div>
                                    </div>
                                    <Badge className="bg-emerald-600 font-mono text-xs text-white">
                                        {cashMethod?.revenue_share_percent ?? 0}
                                        % Pendapatan
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-3">
                                        <span className="block text-[10px] font-bold text-neutral-500 uppercase">
                                            Pendapatan Bersih
                                        </span>
                                        <div className="mt-1 font-mono text-lg font-black text-neutral-900">
                                            {formatRupiah(
                                                cashMethod?.net_revenue ?? 0,
                                            )}
                                        </div>
                                        <span className="mt-0.5 block text-[10px] font-bold text-emerald-700">
                                            {cashMethod?.transactions_count ??
                                                0}{' '}
                                            transaksi lunas
                                        </span>
                                    </div>
                                    <div className="rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-3">
                                        <span className="block text-[10px] font-bold text-neutral-500 uppercase">
                                            Belum Dibayar / Dibatalkan
                                        </span>
                                        <div className="mt-1 font-mono text-sm font-black text-neutral-800">
                                            {cashMethod?.unpaid_count ?? 0}{' '}
                                            Menunggu (
                                            {formatCompactRupiah(
                                                cashMethod?.unpaid_amount ?? 0,
                                            )}
                                            )
                                        </div>
                                        <span className="mt-0.5 block text-[10px] font-bold text-rose-600">
                                            {cashMethod?.cancelled_count ?? 0}{' '}
                                            transaksi dibatalkan (
                                            {formatCompactRupiah(
                                                cashMethod?.cancelled_amount ??
                                                    0,
                                            )}
                                            )
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Status Pemrosesan Pesanan & Kapasitas Layanan */}
                        <div className="space-y-4 rounded-2xl border border-[#DFCFA9] bg-white p-4 shadow-2xs sm:p-5">
                            <div className="flex flex-col justify-between gap-2 border-b border-[#F2EBD9] pb-3 sm:flex-row sm:items-center">
                                <div>
                                    <h3 className="flex items-center gap-2 text-sm font-black text-neutral-900">
                                        <Timer className="size-4 text-[#C52828]" />
                                        <span>
                                            Status Pemrosesan Pesanan &amp;
                                            Kapasitas Layanan
                                        </span>
                                    </h3>
                                    <p className="mt-0.5 text-xs text-neutral-500">
                                        Ringkasan tahapan penyelesaian pesanan,
                                        rata-rata waktu layanan, dan tingkat
                                        keterisian meja
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-lg border border-[#DFCFA9] bg-[#FAF6EC] px-2.5 py-1 font-mono text-xs font-bold text-neutral-800">
                                        Rata-rata Waktu Layanan:{' '}
                                        <strong className="text-[#C52828]">
                                            {activeCompletionTime.formatted}
                                        </strong>
                                    </span>
                                </div>
                            </div>

                            {/* Grid 6 Kolom Status Pesanan */}
                            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
                                <div className="rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-3">
                                    <span className="block text-[10px] font-bold text-neutral-500 uppercase">
                                        Pesanan Selesai
                                    </span>
                                    <div className="mt-1 font-mono text-xl font-black text-neutral-900">
                                        {activePipeline.completed_count}
                                    </div>
                                    <span className="mt-0.5 block text-[10px] font-bold text-emerald-700">
                                        Transaksi Tuntas
                                    </span>
                                </div>

                                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                                    <span className="block text-[10px] font-bold text-amber-800 uppercase">
                                        Sedang Diproses
                                    </span>
                                    <div className="mt-1 font-mono text-xl font-black text-amber-800">
                                        {activePipeline.processing_count}
                                    </div>
                                    <span className="mt-0.5 block text-[10px] font-bold text-amber-700">
                                        Antrean Produksi
                                    </span>
                                </div>

                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                                    <span className="block text-[10px] font-bold text-emerald-800 uppercase">
                                        Siap Disajikan
                                    </span>
                                    <div className="mt-1 font-mono text-xl font-black text-emerald-800">
                                        {activePipeline.ready_count}
                                    </div>
                                    <span className="mt-0.5 block text-[10px] font-bold text-emerald-700">
                                        Menunggu Pengantaran
                                    </span>
                                </div>

                                <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                                    <span className="block text-[10px] font-bold text-sky-800 uppercase">
                                        Menunggu Pembayaran
                                    </span>
                                    <div className="mt-1 font-mono text-xl font-black text-sky-800">
                                        {activePipeline.unpaid_count}
                                    </div>
                                    <span className="mt-0.5 block text-[10px] font-bold text-sky-700">
                                        Belum Terverifikasi
                                    </span>
                                </div>

                                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3">
                                    <span className="block text-[10px] font-bold text-rose-800 uppercase">
                                        Pesanan Dibatalkan
                                    </span>
                                    <div className="mt-1 font-mono text-xl font-black text-rose-800">
                                        {activePipeline.cancelled_count}
                                    </div>
                                    <span className="mt-0.5 block text-[10px] font-bold text-rose-600">
                                        Tidak Dihitung Omzet
                                    </span>
                                </div>

                                <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3">
                                    <span className="block text-[10px] font-bold text-purple-800 uppercase">
                                        Keterisian Meja
                                    </span>
                                    <div className="mt-1 font-mono text-xl font-black text-purple-800">
                                        {operational.occupancy_rate}%
                                    </div>
                                    <span className="mt-0.5 block text-[10px] font-bold text-purple-700">
                                        {operational.occupied_tables}/
                                        {operational.total_tables} meja terpakai
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Baris Rekapitulasi Penerimaan per Kasir */}
                        <div className="space-y-4 rounded-2xl border border-[#DFCFA9] bg-white p-4 shadow-2xs sm:p-5">
                            <div className="flex items-center justify-between border-b border-[#F2EBD9] pb-3">
                                <div>
                                    <h3 className="flex items-center gap-2 text-sm font-black text-neutral-900">
                                        <Users className="size-4 text-[#C52828]" />
                                        <span>
                                            Rekapitulasi Penerimaan per Kasir
                                        </span>
                                    </h3>
                                    <p className="mt-0.5 text-xs text-neutral-500">
                                        Rincian jumlah transaksi yang
                                        diverifikasi dan nilai pendapatan bersih
                                        per petugas kasir pada periode laporan
                                    </p>
                                </div>
                                <Badge
                                    variant="outline"
                                    className="border-[#DFCFA9] bg-[#FAF6EC] font-mono text-xs"
                                >
                                    {activeCashiers.length} Petugas Aktif
                                </Badge>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-[#DFCFA9] bg-[#FAF5E8] text-[10px] font-black tracking-wider text-neutral-700 uppercase">
                                        <tr>
                                            <th className="px-3 py-2.5">
                                                Nama Petugas
                                            </th>
                                            <th className="px-3 py-2.5">
                                                Jabatan
                                            </th>
                                            <th className="px-3 py-2.5 text-right">
                                                Jumlah Transaksi
                                            </th>
                                            <th className="px-3 py-2.5 text-right">
                                                Penerimaan Tunai
                                            </th>
                                            <th className="px-3 py-2.5 text-right">
                                                Penerimaan QRIS
                                            </th>
                                            <th className="px-3 py-2.5 text-right">
                                                Total Pendapatan Bersih
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#F2EBD9]">
                                        {activeCashiers.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={6}
                                                    className="py-6 text-center text-neutral-400"
                                                >
                                                    Belum ada transaksi yang
                                                    diverifikasi langsung oleh
                                                    kasir pada periode ini.
                                                </td>
                                            </tr>
                                        ) : (
                                            activeCashiers.map((cashier) => (
                                                <tr
                                                    key={cashier.user_id}
                                                    className="transition-colors hover:bg-[#FAF6EC]/60"
                                                >
                                                    <td className="flex items-center gap-2 px-3 py-3 font-bold text-neutral-900">
                                                        <span className="rounded-full bg-[#18181B] p-1.5 text-white">
                                                            <UserCheck className="size-3" />
                                                        </span>
                                                        <span>
                                                            {cashier.user_name}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <span className="rounded-md border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">
                                                            {cashier.user_role}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono font-bold text-neutral-900">
                                                        {cashier.total_orders}{' '}
                                                        transaksi
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono font-bold text-emerald-700">
                                                        {formatRupiah(
                                                            cashier.cash_revenue,
                                                        )}{' '}
                                                        ({cashier.cash_count}x)
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono font-bold text-indigo-700">
                                                        {formatRupiah(
                                                            cashier.qris_revenue,
                                                        )}{' '}
                                                        ({cashier.qris_count}x)
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono text-sm font-black text-neutral-900">
                                                        {formatRupiah(
                                                            cashier.total_net_revenue,
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* 7. KONTEN TAB 4: LAPORAN KEUANGAN & REKAPITULASI */}
                {/* ========================================================================= */}
                {activeMainTab === 'financial' && (
                    <div className="space-y-5">
                        {/* Sub-Navigasi Khusus Tab Laporan Keuangan */}
                        <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-[#DFCFA9] bg-white p-1 shadow-2xs">
                            <button
                                type="button"
                                onClick={() => setFinancialSubTab('breakdown')}
                                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                                    financialSubTab === 'breakdown'
                                        ? 'bg-[#18181B] text-white shadow-2xs'
                                        : 'text-neutral-600 hover:bg-[#FAF5E8] hover:text-neutral-900'
                                }`}
                            >
                                <Calendar className="size-3.5 text-[#C52828]" />
                                <span>Rekapitulasi Periode</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFinancialSubTab('revenue')}
                                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                                    financialSubTab === 'revenue'
                                        ? 'bg-[#18181B] text-white shadow-2xs'
                                        : 'text-neutral-600 hover:bg-[#FAF5E8] hover:text-neutral-900'
                                }`}
                            >
                                <DollarSign className="size-3.5 text-[#C52828]" />
                                <span>Rincian Pendapatan</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFinancialSubTab('profit')}
                                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                                    financialSubTab === 'profit'
                                        ? 'bg-[#18181B] text-white shadow-2xs'
                                        : 'text-neutral-600 hover:bg-[#FAF5E8] hover:text-neutral-900'
                                }`}
                            >
                                <TrendingUp className="size-3.5 text-[#C52828]" />
                                <span>Beban &amp; Laba Rugi</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFinancialSubTab('cashflow')}
                                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                                    financialSubTab === 'cashflow'
                                        ? 'bg-[#18181B] text-white shadow-2xs'
                                        : 'text-neutral-600 hover:bg-[#FAF5E8] hover:text-neutral-900'
                                }`}
                            >
                                <Landmark className="size-3.5 text-[#C52828]" />
                                <span>Laporan Arus Kas</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFinancialSubTab('refunds')}
                                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                                    financialSubTab === 'refunds'
                                        ? 'bg-[#18181B] text-white shadow-2xs'
                                        : 'text-neutral-600 hover:bg-[#FAF5E8] hover:text-neutral-900'
                                }`}
                            >
                                <ShieldAlert className="size-3.5 text-[#C52828]" />
                                <span>Audit Pembatalan &amp; Penolakan</span>
                            </button>
                        </div>

                        {/* SUB-BAGIAN 1: TABEL REKAPITULASI KEUANGAN */}
                        {financialSubTab === 'breakdown' && (
                            <div className="space-y-4 rounded-2xl border border-[#DFCFA9] bg-white p-4 shadow-2xs sm:p-5">
                                <div className="flex flex-col justify-between gap-3 border-b border-[#F2EBD9] pb-3.5 sm:flex-row sm:items-center">
                                    <div>
                                        <h3 className="flex items-center gap-2 text-sm font-black text-neutral-900">
                                            <Calendar className="size-4 text-[#C52828]" />
                                            <span>
                                                Tabel Rekapitulasi Keuangan
                                            </span>
                                        </h3>
                                        <p className="mt-0.5 text-xs text-neutral-500">
                                            Rincian kinerja keuangan berdasarkan
                                            periode waktu ({filters.start_date}{' '}
                                            s/d {filters.end_date}). Tanggal
                                            tanpa transaksi ditampilkan dengan
                                            nilai Rp 0.
                                        </p>
                                    </div>

                                    {/* Switcher View Rekap (Harian / Mingguan / Bulanan) */}
                                    <div className="flex shrink-0 items-center gap-1 self-start rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-1 sm:self-auto">
                                        {(
                                            [
                                                'daily',
                                                'weekly',
                                                'monthly',
                                            ] as const
                                        ).map((view) => (
                                            <button
                                                key={view}
                                                type="button"
                                                onClick={() => {
                                                    setRecapTab(view);
                                                    applyFilters({
                                                        recap_view: view,
                                                    });
                                                }}
                                                className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                                                    recapTab === view
                                                        ? 'bg-[#18181B] text-white shadow-2xs'
                                                        : 'text-neutral-600 hover:text-neutral-900'
                                                }`}
                                            >
                                                {view === 'daily'
                                                    ? 'Harian'
                                                    : view === 'weekly'
                                                      ? 'Mingguan'
                                                      : 'Bulanan'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="border-b border-[#DFCFA9] bg-[#FAF5E8] text-[10px] font-black tracking-wider text-neutral-700 uppercase">
                                            <tr>
                                                <th className="px-3 py-2.5">
                                                    Periode / Tanggal
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Total Pesanan
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Pesanan Selesai
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Omzet
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Diskon
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Pajak &amp; Layanan
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Penyesuaian
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Pendapatan Bersih
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    HPP
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Laba Kotor
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Beban Operasional
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Laba Bersih
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Rata-rata Transaksi
                                                </th>
                                                <th className="px-2.5 py-2.5 text-right">
                                                    Volume Terjual
                                                </th>
                                                <th className="px-3 py-2.5 text-center">
                                                    Rincian
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#F2EBD9]">
                                            {recaps[recapTab].rows.length ===
                                            0 ? (
                                                <tr>
                                                    <td
                                                        colSpan={15}
                                                        className="py-8 text-center text-neutral-400"
                                                    >
                                                        Tidak ada data
                                                        rekapitulasi pada
                                                        rentang tanggal ini.
                                                    </td>
                                                </tr>
                                            ) : (
                                                recaps[recapTab].rows.map(
                                                    (row, idx) => (
                                                        <tr
                                                            key={idx}
                                                            className={`transition-colors hover:bg-[#FAF6EC]/80 ${
                                                                row.is_peak
                                                                    ? 'bg-amber-50/40'
                                                                    : row.net_revenue >
                                                                        0
                                                                      ? ''
                                                                      : 'bg-[#FFFDF9]'
                                                            }`}
                                                        >
                                                            {/* Kolom 1: Periode / Tanggal */}
                                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-bold text-neutral-900">
                                                                        {
                                                                            row.label
                                                                        }
                                                                    </span>
                                                                    {row.is_peak && (
                                                                        <span className="py-0.2 inline-flex items-center rounded bg-[#C52828] px-1.5 text-[9px] font-black text-white">
                                                                            Tertinggi
                                                                        </span>
                                                                    )}
                                                                    {row.is_lowest &&
                                                                        row.net_revenue >
                                                                            0 && (
                                                                            <span className="py-0.2 inline-flex items-center rounded bg-neutral-200 px-1.5 text-[9px] font-black text-neutral-700">
                                                                                Terendah
                                                                            </span>
                                                                        )}
                                                                </div>
                                                            </td>

                                                            {/* Kolom 2: Total Pesanan */}
                                                            <td className="px-2.5 py-2.5 text-right font-mono text-neutral-800">
                                                                {
                                                                    row.total_orders
                                                                }
                                                            </td>

                                                            {/* Kolom 3: Pesanan Selesai */}
                                                            <td className="px-2.5 py-2.5 text-right font-mono font-bold text-emerald-700">
                                                                {row.completed_orders_count ??
                                                                    row.paid_orders_count}
                                                            </td>

                                                            {/* Kolom 4: Omzet */}
                                                            <td className="px-2.5 py-2.5 text-right font-mono text-neutral-700">
                                                                {formatRupiah(
                                                                    row.gross_revenue,
                                                                )}
                                                            </td>

                                                            {/* Kolom 5: Diskon */}
                                                            <td className="px-2.5 py-2.5 text-right font-mono text-neutral-400">
                                                                {row.discount_amount
                                                                    ? formatRupiah(
                                                                          row.discount_amount,
                                                                      )
                                                                    : '-'}
                                                            </td>

                                                            {/* Kolom 6: Pajak & Layanan */}
                                                            <td className="px-2.5 py-2.5 text-right font-mono text-neutral-400">
                                                                {row.tax_amount
                                                                    ? formatRupiah(
                                                                          row.tax_amount,
                                                                      )
                                                                    : '-'}
                                                            </td>

                                                            {/* Kolom 7: Pengembalian */}
                                                            <td className="px-2.5 py-2.5 text-right font-mono text-rose-600">
                                                                {row.refund_amount >
                                                                0
                                                                    ? `-${formatRupiah(row.refund_amount)}`
                                                                    : '-'}
                                                            </td>

                                                            {/* Kolom 8: Pendapatan Bersih */}
                                                            <td className="px-2.5 py-2.5 text-right font-mono font-black text-neutral-900">
                                                                {formatRupiah(
                                                                    row.net_revenue,
                                                                )}
                                                            </td>

                                                            {/* Kolom 9: HPP */}
                                                            <td className="px-2.5 py-2.5 text-right text-[10px] text-neutral-400 italic">
                                                                Belum Tersedia
                                                            </td>

                                                            {/* Kolom 10: Laba Kotor */}
                                                            <td className="px-2.5 py-2.5 text-right font-mono font-bold text-emerald-800">
                                                                {formatRupiah(
                                                                    row.gross_profit ??
                                                                        row.net_revenue,
                                                                )}
                                                            </td>

                                                            {/* Kolom 11: Beban Operasional */}
                                                            <td className="px-2.5 py-2.5 text-right text-[10px] text-neutral-400 italic">
                                                                Belum Tersedia
                                                            </td>

                                                            {/* Kolom 12: Laba Bersih */}
                                                            <td className="px-2.5 py-2.5 text-right text-[10px] text-neutral-400 italic">
                                                                Belum Tersedia
                                                            </td>

                                                            {/* Kolom 13: Rata-rata Transaksi */}
                                                            <td className="px-2.5 py-2.5 text-right font-mono text-neutral-800">
                                                                {formatRupiah(
                                                                    row.average_order_value,
                                                                )}
                                                            </td>

                                                            {/* Kolom 14: Volume Terjual */}
                                                            <td className="px-2.5 py-2.5 text-right font-mono font-bold text-neutral-900">
                                                                {row.items_sold ??
                                                                    0}{' '}
                                                                porsi
                                                            </td>

                                                            {/* Kolom 15: Rincian */}
                                                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                                                {row.date ? (
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() =>
                                                                            handleDrilldownDate(
                                                                                row.date!,
                                                                            )
                                                                        }
                                                                        className="h-6 rounded-lg border-[#DFCFA9] bg-white px-2 text-[10px] font-bold text-neutral-800 hover:bg-[#FAF5E8]"
                                                                        title={`Lihat daftar transaksi tanggal ${row.date}`}
                                                                    >
                                                                        Lihat
                                                                        Transaksi
                                                                        &rarr;
                                                                    </Button>
                                                                ) : (
                                                                    <span className="text-[10px] text-neutral-400">
                                                                        -
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ),
                                                )
                                            )}
                                        </tbody>
                                        {recaps[recapTab].rows.length > 0 && (
                                            <tfoot className="border-t-2 border-[#18181B] bg-[#FAF5E8] font-mono text-xs font-black">
                                                <tr>
                                                    <td className="px-3 py-3 text-neutral-900 uppercase">
                                                        TOTAL PERIODE
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-neutral-900">
                                                        {
                                                            recaps[recapTab]
                                                                .totals
                                                                .total_orders
                                                        }
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-emerald-800">
                                                        {recaps[recapTab].totals
                                                            .completed_orders_count ??
                                                            recaps[recapTab]
                                                                .totals
                                                                .paid_orders_count}
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-neutral-900">
                                                        {formatRupiah(
                                                            recaps[recapTab]
                                                                .totals
                                                                .gross_revenue,
                                                        )}
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-neutral-400">
                                                        -
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-neutral-400">
                                                        -
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-rose-600">
                                                        {formatRupiah(
                                                            recaps[recapTab]
                                                                .totals
                                                                .refund_amount,
                                                        )}
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-sm text-[#C52828]">
                                                        {formatRupiah(
                                                            recaps[recapTab]
                                                                .totals
                                                                .net_revenue,
                                                        )}
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-[10px] text-neutral-400 italic">
                                                        Belum Tersedia
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-emerald-800">
                                                        {formatRupiah(
                                                            recaps[recapTab]
                                                                .totals
                                                                .net_revenue,
                                                        )}
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-[10px] text-neutral-400 italic">
                                                        Belum Tersedia
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-[10px] text-neutral-400 italic">
                                                        Belum Tersedia
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-neutral-900">
                                                        {formatRupiah(
                                                            recaps[recapTab]
                                                                .totals
                                                                .average_order_value,
                                                        )}
                                                    </td>
                                                    <td className="px-2.5 py-3 text-right text-neutral-900">
                                                        {recaps[recapTab].totals
                                                            .items_sold ??
                                                            summary.period
                                                                .items_sold}{' '}
                                                        porsi
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        -
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* SUB-BAGIAN 2: RINCIAN PENDAPATAN */}
                        {financialSubTab === 'revenue' && (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-4 rounded-2xl border border-[#DFCFA9] bg-white p-5 shadow-2xs">
                                    <div className="flex items-center justify-between border-b border-[#F2EBD9] pb-3">
                                        <h3 className="flex items-center gap-1.5 text-sm font-black text-neutral-900">
                                            <DollarSign className="size-4 text-[#C52828]" />
                                            <span>Komposisi Pendapatan</span>
                                        </h3>
                                        <Badge className="bg-[#18181B] text-[10px] text-white">
                                            Pendapatan Terealisasi
                                        </Badge>
                                    </div>

                                    <div className="space-y-2.5 text-xs">
                                        <div className="flex justify-between border-b border-[#F2EBD9] py-1.5">
                                            <span className="text-neutral-600">
                                                Omzet (Nilai Kotor Transaksi
                                                Lunas):
                                            </span>
                                            <span className="font-mono font-bold text-neutral-900">
                                                {formatRupiah(
                                                    summary.period
                                                        .gross_revenue,
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-[#F2EBD9] py-1.5 text-neutral-500">
                                            <span>Potongan Diskon:</span>
                                            <span className="font-mono font-bold">
                                                -{' '}
                                                {formatRupiah(
                                                    summary.period
                                                        .discount_amount ?? 0,
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-[#F2EBD9] py-1.5 text-neutral-500">
                                            <span>
                                                Pajak &amp; Biaya Layanan:
                                            </span>
                                            <span className="font-mono font-bold">
                                                +{' '}
                                                {formatRupiah(
                                                    summary.period
                                                        .tax_service_amount ??
                                                        0,
                                                )}
                                            </span>
                                        </div>
                                        {summary.period.refund_amount > 0 && (
                                            <div className="flex justify-between border-b border-[#F2EBD9] py-1.5 font-bold text-rose-700">
                                                <span>
                                                    Penyesuaian Historis:
                                                </span>
                                                <span className="font-mono">
                                                    -{' '}
                                                    {formatRupiah(
                                                        summary.period
                                                            .refund_amount,
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between border-b-2 border-[#18181B] py-2 text-sm font-extrabold text-neutral-900">
                                            <span>Pendapatan Bersih:</span>
                                            <span className="font-mono text-base font-black text-[#C52828]">
                                                {formatRupiah(
                                                    summary.period.net_revenue,
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-[#F2EBD9] py-1.5 text-indigo-800">
                                            <span className="font-semibold">
                                                Terealisasi via Xendit Gateway:
                                            </span>
                                            <span className="font-mono font-bold">
                                                {formatRupiah(
                                                    summary.xendit_integration
                                                        ?.net_revenue ??
                                                        summary.period.cash_flow
                                                            ?.inflow_xendit ??
                                                        0,
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between py-1.5 text-amber-800">
                                            <span>
                                                Tagihan Menunggu Pembayaran:
                                            </span>
                                            <span className="font-mono font-bold">
                                                {formatRupiah(
                                                    summary.period
                                                        .pending_payments_amount,
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between py-1.5 text-neutral-500">
                                            <span>
                                                Nilai Pesanan Dibatalkan (Belum
                                                Bayar):
                                            </span>
                                            <span className="font-mono">
                                                {formatRupiah(
                                                    summary.period
                                                        .cancelled_amount,
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 rounded-2xl border border-[#DFCFA9] bg-white p-5 shadow-2xs">
                                    <div className="flex items-center justify-between border-b border-[#F2EBD9] pb-3">
                                        <h3 className="flex items-center gap-1.5 text-sm font-black text-neutral-900">
                                            <Wallet className="size-4 text-[#C52828]" />
                                            <span>
                                                Metode &amp; Gateway Pembayaran
                                            </span>
                                        </h3>
                                        {summary.xendit_integration && (
                                            <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                                {
                                                    summary.xendit_integration
                                                        .label
                                                }{' '}
                                                (
                                                {
                                                    summary.xendit_integration
                                                        .mode
                                                }
                                                )
                                            </span>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        {summary.payment_methods.map((pm) => (
                                            <div
                                                key={pm.method}
                                                className="space-y-1.5 rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-3"
                                            >
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="flex items-center gap-1.5 font-bold text-neutral-900">
                                                        {pm.method ===
                                                        'cash' ? (
                                                            <Banknote className="size-3.5 text-emerald-600" />
                                                        ) : (
                                                            <QrCode className="size-3.5 text-indigo-600" />
                                                        )}
                                                        <span>{pm.label}</span>
                                                    </span>
                                                    <strong className="font-mono text-neutral-900">
                                                        {formatRupiah(
                                                            pm.net_revenue,
                                                        )}
                                                    </strong>
                                                </div>
                                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white">
                                                    <div
                                                        style={{
                                                            width: `${pm.revenue_share_percent}%`,
                                                        }}
                                                        className={`h-full rounded-full ${pm.method === 'cash' ? 'bg-emerald-600' : 'bg-indigo-600'}`}
                                                    />
                                                </div>
                                                <div className="flex justify-between text-[10px] text-neutral-500">
                                                    <span>
                                                        {pm.transactions_count}{' '}
                                                        transaksi (
                                                        {pm.count_share_percent}
                                                        % volume)
                                                    </span>
                                                    <span>
                                                        Proporsi Pendapatan:{' '}
                                                        <strong>
                                                            {
                                                                pm.revenue_share_percent
                                                            }
                                                            %
                                                        </strong>
                                                    </span>
                                                </div>
                                            </div>
                                        ))}

                                        {summary.payment_gateways &&
                                            summary.payment_gateways.length >
                                                0 && (
                                                <div className="space-y-2 border-t border-[#F2EBD9] pt-2">
                                                    <div className="flex items-center justify-between text-[10px] font-black tracking-wider text-neutral-500 uppercase">
                                                        <span>
                                                            Rekapitulasi per
                                                            Payment Gateway
                                                        </span>
                                                        {summary
                                                            .xendit_integration
                                                            ?.webhook_endpoint && (
                                                            <span className="font-mono font-normal text-indigo-700">
                                                                {
                                                                    summary
                                                                        .xendit_integration
                                                                        .webhook_endpoint
                                                                }
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                        {summary.payment_gateways.map(
                                                            (gw) => (
                                                                <div
                                                                    key={
                                                                        gw.gateway
                                                                    }
                                                                    className={`space-y-1 rounded-xl border p-2.5 text-xs ${
                                                                        gw.gateway ===
                                                                        'xendit'
                                                                            ? 'border-indigo-200 bg-indigo-50/70'
                                                                            : 'border-[#DFCFA9] bg-[#FAF5E8]'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center justify-between gap-1">
                                                                        <span className="truncate font-bold text-neutral-900">
                                                                            {
                                                                                gw.label
                                                                            }
                                                                        </span>
                                                                        {gw.is_active_slot && (
                                                                            <span className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                                                                Aktif
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="font-mono text-xs font-black text-neutral-900">
                                                                        {formatRupiah(
                                                                            gw.net_revenue,
                                                                        )}
                                                                    </div>
                                                                    <div className="flex justify-between text-[10px] text-neutral-600">
                                                                        <span>
                                                                            {
                                                                                gw.transactions_count
                                                                            }{' '}
                                                                            lunas
                                                                        </span>
                                                                        <span>
                                                                            {
                                                                                gw.revenue_share_percent
                                                                            }
                                                                            %
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ),
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUB-BAGIAN 3: BEBAN & LABA RUGI */}
                        {financialSubTab === 'profit' && (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="flex flex-col justify-between space-y-3.5 rounded-2xl border border-[#DFCFA9] bg-white p-5 shadow-2xs">
                                    <div className="flex items-center justify-between border-b border-[#F2EBD9] pb-3">
                                        <h3 className="flex items-center gap-1.5 text-sm font-black text-neutral-900">
                                            <Info className="size-4 text-[#C52828]" />
                                            <span>
                                                Keterangan Perhitungan HPP &amp;
                                                Beban Operasional
                                            </span>
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowHppSimulator(
                                                    !showHppSimulator,
                                                )
                                            }
                                            className="flex items-center gap-1 text-[11px] font-bold text-[#C52828] hover:underline"
                                        >
                                            <Sliders className="size-3" />
                                            <span>
                                                {showHppSimulator
                                                    ? 'Tutup Simulasi'
                                                    : 'Simulasi Estimasi HPP'}
                                            </span>
                                        </button>
                                    </div>

                                    <div className="space-y-1.5 rounded-xl border border-[#DFCFA9] bg-[#FAF5E8] p-3 text-xs text-neutral-700">
                                        <div className="flex items-center gap-1.5 font-bold text-neutral-900">
                                            <ShieldCheck className="size-4 text-emerald-600" />
                                            <span>
                                                Catatan Akuntansi Laporan
                                            </span>
                                        </div>
                                        <p className="text-[11px] leading-relaxed">
                                            Sistem saat ini mencatat pendapatan
                                            dari transaksi penjualan secara
                                            aktual dan belum mencakup pencatatan
                                            Harga Pokok Penjualan (HPP) bahan
                                            baku maupun beban operasional. Untuk
                                            menjaga akurasi laporan keuangan,{' '}
                                            <strong>
                                                sistem tidak menampilkan
                                                estimasi otomatis pada tabel
                                                utama
                                            </strong>
                                            , sehingga Laba Kotor ditampilkan
                                            setara dengan Pendapatan Bersih.
                                        </p>
                                    </div>

                                    {/* Simulator Margin HPP Interaktif (Opsional untuk Proyeksi Manajemen) */}
                                    {showHppSimulator && (
                                        <div className="space-y-2.5 rounded-xl bg-neutral-900 p-3.5 text-xs text-white">
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-1.5 font-bold text-amber-300">
                                                    <Sparkles className="size-3.5" />
                                                    Simulasi Estimasi HPP
                                                </span>
                                                <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs font-black">
                                                    Rasio HPP:{' '}
                                                    {simulatedHppMargin}%
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] text-neutral-400">
                                                    20%
                                                </span>
                                                <input
                                                    type="range"
                                                    min="20"
                                                    max="55"
                                                    step="1"
                                                    value={simulatedHppMargin}
                                                    onChange={(e) =>
                                                        setSimulatedHppMargin(
                                                            Number(
                                                                e.target.value,
                                                            ),
                                                        )
                                                    }
                                                    className="w-full cursor-pointer accent-[#C52828]"
                                                />
                                                <span className="text-[10px] text-neutral-400">
                                                    55%
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 border-t border-neutral-800 pt-1 font-mono text-[11px]">
                                                <div>
                                                    <span className="block text-[9px] text-neutral-400">
                                                        Estimasi HPP:
                                                    </span>
                                                    <strong className="text-rose-400">
                                                        {formatRupiah(
                                                            simulatedHppCost,
                                                        )}
                                                    </strong>
                                                </div>
                                                <div>
                                                    <span className="block text-[9px] text-neutral-400">
                                                        Estimasi Laba Kotor:
                                                    </span>
                                                    <strong className="text-emerald-400">
                                                        {formatRupiah(
                                                            simulatedGrossProfit,
                                                        )}
                                                    </strong>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3.5 rounded-2xl border border-[#DFCFA9] bg-white p-5 shadow-2xs">
                                    <div className="border-b border-[#F2EBD9] pb-3">
                                        <h3 className="text-sm font-black text-neutral-900">
                                            Ikhtisar Laba Rugi Periode Laporan
                                        </h3>
                                    </div>
                                    <div className="space-y-2 text-xs">
                                        <div className="flex justify-between border-b border-[#F2EBD9] py-1.5">
                                            <span className="text-neutral-600">
                                                Pendapatan Bersih:
                                            </span>
                                            <span className="font-mono font-bold text-neutral-900">
                                                {formatRupiah(
                                                    summary.period.net_revenue,
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-[#F2EBD9] py-1.5">
                                            <span className="text-neutral-600">
                                                Harga Pokok Penjualan (HPP):
                                            </span>
                                            <Badge
                                                variant="outline"
                                                className="border-amber-300 bg-amber-50 text-[10px] text-amber-800"
                                            >
                                                Belum Tersedia
                                            </Badge>
                                        </div>
                                        <div className="flex justify-between border-b border-[#F2EBD9] py-1.5 font-bold text-emerald-800">
                                            <span>Laba Kotor:</span>
                                            <span className="font-mono">
                                                {formatRupiah(
                                                    summary.period
                                                        .gross_profit ??
                                                        summary.period
                                                            .net_revenue,
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-[#F2EBD9] py-1.5">
                                            <span className="text-neutral-600">
                                                Beban Operasional:
                                            </span>
                                            <Badge
                                                variant="outline"
                                                className="border-neutral-300 bg-neutral-100 text-[10px] text-neutral-600"
                                            >
                                                Belum Tersedia
                                            </Badge>
                                        </div>
                                        <div className="flex justify-between border-b-2 border-[#18181B] py-2 font-extrabold text-neutral-900">
                                            <span>Laba Bersih:</span>
                                            <Badge
                                                variant="outline"
                                                className="border-neutral-300 bg-neutral-100 text-[10px] text-neutral-600"
                                            >
                                                Belum Tersedia
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUB-BAGIAN 4: LAPORAN ARUS KAS OPERASIONAL */}
                        {financialSubTab === 'cashflow' && (
                            <div className="space-y-4 rounded-2xl border border-[#DFCFA9] bg-white p-5 shadow-2xs">
                                <div className="flex items-center justify-between border-b border-[#F2EBD9] pb-3">
                                    <div>
                                        <h3 className="flex items-center gap-1.5 text-sm font-black text-neutral-900">
                                            <Landmark className="size-4 text-[#C52828]" />
                                            <span>
                                                Laporan Arus Kas Operasional
                                            </span>
                                        </h3>
                                        <p className="mt-0.5 text-xs text-neutral-500">
                                            Rekapitulasi penerimaan kas dari
                                            transaksi pembayaran tunai dan
                                            Xendit Payment Gateway (QRIS)
                                        </p>
                                    </div>
                                    <Badge className="bg-emerald-700 font-mono text-xs text-white">
                                        Arus Kas Positif
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                                    <div className="space-y-1 rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-4">
                                        <span className="block text-[10px] font-bold text-neutral-500 uppercase">
                                            Total Penerimaan Kas
                                        </span>
                                        <div className="font-mono text-xl font-black text-neutral-900">
                                            {formatRupiah(
                                                summary.period.cash_flow
                                                    ?.inflow_total ??
                                                    summary.period
                                                        .gross_revenue,
                                            )}
                                        </div>
                                        <span className="block text-[10px] text-neutral-500">
                                            Nilai kotor transaksi lunas
                                        </span>
                                    </div>

                                    <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                                        <span className="block text-[10px] font-bold text-emerald-800 uppercase">
                                            Penerimaan Kas Tunai
                                        </span>
                                        <div className="font-mono text-xl font-black text-emerald-800">
                                            {formatRupiah(
                                                summary.period.cash_flow
                                                    ?.inflow_cash ??
                                                    cashMethod?.net_revenue ??
                                                    0,
                                            )}
                                        </div>
                                        <span className="block text-[10px] text-emerald-700">
                                            {cashMethod?.transactions_count ??
                                                0}{' '}
                                            transaksi tunai
                                        </span>
                                    </div>

                                    <div className="space-y-1 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
                                        <span className="block text-[10px] font-bold text-indigo-800 uppercase">
                                            Penerimaan Xendit (QRIS)
                                        </span>
                                        <div className="font-mono text-xl font-black text-indigo-800">
                                            {formatRupiah(
                                                summary.period.cash_flow
                                                    ?.inflow_xendit ??
                                                    summary.period.cash_flow
                                                        ?.inflow_qris ??
                                                    qrisMethod?.net_revenue ??
                                                    0,
                                            )}
                                        </div>
                                        <span className="block text-[10px] text-indigo-700">
                                            {summary.xendit_integration
                                                ?.transactions_count ??
                                                qrisMethod?.transactions_count ??
                                                0}{' '}
                                            transaksi via Xendit
                                        </span>
                                    </div>

                                    <div className="space-y-1 rounded-xl border border-purple-200 bg-purple-50/70 p-4">
                                        <span className="block text-[10px] font-bold text-purple-800 uppercase">
                                            Arus Kas Bersih
                                        </span>
                                        <div className="font-mono text-xl font-black text-purple-800">
                                            {formatRupiah(
                                                summary.period.cash_flow
                                                    ?.net_cash_flow ??
                                                    summary.period.net_revenue,
                                            )}
                                        </div>
                                        <span className="block text-[10px] text-purple-700">
                                            Akumulasi setoran tunai &amp; Xendit
                                            gateway
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUB-BAGIAN 5: AUDIT PEMBATALAN & PENOLAKAN MENU */}
                        {financialSubTab === 'refunds' && (
                            <div className="space-y-4 rounded-2xl border border-[#DFCFA9] bg-white p-5 shadow-2xs">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F2EBD9] pb-3">
                                    <div>
                                        <h3 className="flex items-center gap-1.5 text-sm font-black text-neutral-900">
                                            <ShieldAlert className="size-4 text-[#C52828]" />
                                            <span>
                                                Audit Pembatalan &amp; Penolakan
                                                Menu
                                            </span>
                                        </h3>
                                        <p className="mt-0.5 text-xs text-neutral-500">
                                            Pesanan yang telah dibayar bersifat
                                            final (tanpa pembatalan &amp; tanpa
                                            refund); penolakan item tetap
                                            dicatat untuk audit stok/menu.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setActiveMainTab('transactions');
                                            applyFilters({
                                                order_status: 'cancelled',
                                            });
                                        }}
                                        className="rounded-xl border-[#DFCFA9] text-xs"
                                    >
                                        Lihat Pesanan Dibatalkan &rarr;
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                                    <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                                        <span className="block text-[10px] font-bold text-amber-800 uppercase">
                                            Pembayaran Gagal / Kedaluwarsa
                                        </span>
                                        <div className="font-mono text-xl font-black text-amber-900">
                                            {
                                                summary.period
                                                    .failed_payments_count
                                            }{' '}
                                            transaksi
                                        </div>
                                        <span className="block text-[10px] text-amber-800">
                                            Tagihan non-realisasi:{' '}
                                            {formatRupiah(
                                                summary.period
                                                    .failed_or_cancelled_amount,
                                            )}
                                        </span>
                                    </div>

                                    <div className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-4">
                                        <span className="block text-[10px] font-bold text-rose-800 uppercase">
                                            Pesanan Dibatalkan (Belum Bayar)
                                        </span>
                                        <div className="font-mono text-xl font-black text-rose-800">
                                            {
                                                summary.period
                                                    .cancelled_orders_count
                                            }{' '}
                                            pesanan
                                        </div>
                                        <span className="block text-[10px] text-rose-700">
                                            Nilai:{' '}
                                            {formatRupiah(
                                                summary.period.cancelled_amount,
                                            )}
                                        </span>
                                    </div>

                                    <div className="space-y-1 rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] p-4">
                                        <span className="block text-[10px] font-bold text-neutral-500 uppercase">
                                            Tingkat Pembatalan
                                        </span>
                                        <div className="font-mono text-xl font-black text-neutral-900">
                                            {summary.period.total_orders_count >
                                            0
                                                ? Math.round(
                                                      (summary.period
                                                          .cancelled_orders_count /
                                                          summary.period
                                                              .total_orders_count) *
                                                          100,
                                                  )
                                                : 0}
                                            %
                                        </div>
                                        <span className="block text-[10px] text-neutral-500">
                                            Dari{' '}
                                            {summary.period.total_orders_count}{' '}
                                            total pesanan
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ========================================================================= */}
                {/* 8. KONTEN TAB 5: DAFTAR RIWAYAT TRANSAKSI */}
                {/* ========================================================================= */}
                {activeMainTab === 'transactions' && (
                    <div className="overflow-hidden rounded-2xl border border-[#DFCFA9] bg-white shadow-2xs">
                        {/* Header Tabel & Bilah Kontrol Multi-Filter */}
                        <div className="space-y-3.5 border-b border-[#E8DFC8] p-4 sm:p-5">
                            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                                <div>
                                    <h2 className="flex items-center gap-2 text-sm font-black text-neutral-900 sm:text-base">
                                        <Receipt className="size-4 text-[#C52828]" />
                                        <span>Daftar Riwayat Transaksi</span>
                                    </h2>
                                    <p className="mt-0.5 text-xs text-neutral-500">
                                        Pencarian data transaksi, penyaringan
                                        multi-kriteria, rincian pesanan, dan
                                        pencetakan nota
                                    </p>
                                </div>

                                <Link
                                    href="/admin/orders"
                                    className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-[#DFCFA9] bg-[#FAF5E8] px-3 py-1.5 text-xs font-bold text-neutral-800 shadow-2xs transition-colors hover:bg-[#EFE5CF] sm:self-auto"
                                >
                                    <span>Kelola Pesanan Aktif</span>
                                    <ArrowUpRight className="size-3.5 text-[#C52828]" />
                                </Link>
                            </div>

                            {/* Banner Filter Tanggal Spesifik (Jika Admin Melakukan Drilldown dari Tabel Rekapitulasi) */}
                            {filters.filter_date && (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-900">
                                    <span className="flex items-center gap-2">
                                        <Calendar className="size-4 text-[#C52828]" />
                                        <span>
                                            Menampilkan transaksi khusus
                                            tanggal:{' '}
                                            <strong className="font-mono text-[#C52828] underline">
                                                {filters.filter_date}
                                            </strong>
                                        </span>
                                    </span>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                            applyFilters({ filter_date: '' })
                                        }
                                        className="h-7 rounded-lg border-rose-300 bg-white text-xs font-bold text-rose-800 shadow-2xs hover:bg-rose-100"
                                    >
                                        <X className="mr-1 size-3 text-[#C52828]" />
                                        <span>
                                            Tampilkan Seluruh Periode Laporan
                                        </span>
                                    </Button>
                                </div>
                            )}

                            {/* 7 Kolom Filter Interaktif Lengkap */}
                            <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
                                {/* Filter 1: Periode Laporan */}
                                <div>
                                    <label className="mb-1 block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                        Periode Laporan
                                    </label>
                                    <Select
                                        value={filters.preset}
                                        onValueChange={(val) =>
                                            applyFilters({
                                                preset: val,
                                                filter_date: '',
                                            })
                                        }
                                    >
                                        <SelectTrigger className="h-8.5 rounded-xl border-[#DFCFA9] bg-[#FAF5E8] text-xs font-bold">
                                            <SelectValue placeholder="Pilih Periode" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PRESET_OPTIONS.map((opt) => (
                                                <SelectItem
                                                    key={opt.key}
                                                    value={opt.key}
                                                    className="text-xs font-medium"
                                                >
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Filter 2: Status Pembayaran */}
                                <div>
                                    <label className="mb-1 block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                        Status Pembayaran
                                    </label>
                                    <Select
                                        value={filters.payment_status}
                                        onValueChange={(val) =>
                                            applyFilters({
                                                payment_status: val,
                                            })
                                        }
                                    >
                                        <SelectTrigger className="h-8.5 rounded-xl border-[#DFCFA9] bg-white text-xs font-bold">
                                            <SelectValue placeholder="Semua Status Pembayaran" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem
                                                value="all"
                                                className="text-xs font-medium"
                                            >
                                                Semua Status Pembayaran
                                            </SelectItem>
                                            <SelectItem
                                                value="paid"
                                                className="text-xs font-medium"
                                            >
                                                Lunas
                                            </SelectItem>
                                            <SelectItem
                                                value="unpaid"
                                                className="text-xs font-medium"
                                            >
                                                Menunggu Pembayaran
                                            </SelectItem>
                                            <SelectItem
                                                value="failed"
                                                className="text-xs font-medium"
                                            >
                                                Gagal / Kedaluwarsa
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Filter 3: Status Pesanan */}
                                <div>
                                    <label className="mb-1 block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                        Status Pesanan
                                    </label>
                                    <Select
                                        value={filters.order_status}
                                        onValueChange={(val) =>
                                            applyFilters({ order_status: val })
                                        }
                                    >
                                        <SelectTrigger className="h-8.5 rounded-xl border-[#DFCFA9] bg-white text-xs font-bold">
                                            <SelectValue placeholder="Semua Status Pesanan" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem
                                                value="all"
                                                className="text-xs font-medium"
                                            >
                                                Semua Status Pesanan
                                            </SelectItem>
                                            <SelectItem
                                                value="pending"
                                                className="text-xs font-medium"
                                            >
                                                Pesanan Baru
                                            </SelectItem>
                                            <SelectItem
                                                value="processing"
                                                className="text-xs font-medium"
                                            >
                                                Sedang Diproses
                                            </SelectItem>
                                            <SelectItem
                                                value="ready"
                                                className="text-xs font-medium"
                                            >
                                                Siap Disajikan
                                            </SelectItem>
                                            <SelectItem
                                                value="completed"
                                                className="text-xs font-medium"
                                            >
                                                Pesanan Selesai
                                            </SelectItem>
                                            <SelectItem
                                                value="cancelled"
                                                className="text-xs font-medium"
                                            >
                                                Dibatalkan
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Filter 4: Metode Pembayaran */}
                                <div>
                                    <label className="mb-1 block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                        Metode Pembayaran
                                    </label>
                                    <Select
                                        value={filters.payment_method}
                                        onValueChange={(val) =>
                                            applyFilters({
                                                payment_method: val,
                                            })
                                        }
                                    >
                                        <SelectTrigger className="h-8.5 rounded-xl border-[#DFCFA9] bg-white text-xs font-bold">
                                            <SelectValue placeholder="Semua Metode" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem
                                                value="all"
                                                className="text-xs font-medium"
                                            >
                                                Semua Metode (QRIS &amp; Tunai)
                                            </SelectItem>
                                            <SelectItem
                                                value="cash"
                                                className="text-xs font-medium"
                                            >
                                                Tunai
                                            </SelectItem>
                                            <SelectItem
                                                value="qris"
                                                className="text-xs font-medium"
                                            >
                                                QRIS
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Filter 5: Gateway Pembayaran */}
                                <div>
                                    <label className="mb-1 block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                        Payment Gateway
                                    </label>
                                    <Select
                                        value={filters.payment_gateway ?? 'all'}
                                        onValueChange={(val) =>
                                            applyFilters({
                                                payment_gateway: val,
                                            })
                                        }
                                    >
                                        <SelectTrigger className="h-8.5 rounded-xl border-[#DFCFA9] bg-white text-xs font-bold">
                                            <SelectValue placeholder="Semua Gateway" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem
                                                value="all"
                                                className="text-xs font-medium"
                                            >
                                                Semua Gateway
                                            </SelectItem>
                                            <SelectItem
                                                value="xendit"
                                                className="text-xs font-medium"
                                            >
                                                Xendit Payment Gateway
                                            </SelectItem>
                                            <SelectItem
                                                value="manual"
                                                className="text-xs font-medium"
                                            >
                                                Kasir POS (Tunai)
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Filter 6: Menu Produk */}
                                <div>
                                    <label className="mb-1 block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                        Menu Produk
                                    </label>
                                    <Select
                                        value={
                                            filters.menu_id
                                                ? String(filters.menu_id)
                                                : 'all'
                                        }
                                        onValueChange={(val) =>
                                            applyFilters({
                                                menu_id:
                                                    val === 'all'
                                                        ? null
                                                        : Number(val),
                                            })
                                        }
                                    >
                                        <SelectTrigger className="h-8.5 rounded-xl border-[#DFCFA9] bg-white text-xs font-bold">
                                            <SelectValue placeholder="Semua Menu" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-56">
                                            <SelectItem
                                                value="all"
                                                className="text-xs font-medium"
                                            >
                                                Semua Menu Produk
                                            </SelectItem>
                                            {available_menus.map((m) => (
                                                <SelectItem
                                                    key={m.id}
                                                    value={String(m.id)}
                                                    className="text-xs font-medium"
                                                >
                                                    {m.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Filter 7: Urutan Data */}
                                <div>
                                    <label className="mb-1 block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                        Urutan Data
                                    </label>
                                    <Select
                                        value={`${filters.sort_by}_${filters.sort_dir}`}
                                        onValueChange={(val) => {
                                            const [by, dir] = val.split('_');
                                            applyFilters({
                                                sort_by: by,
                                                sort_dir: dir,
                                            });
                                        }}
                                    >
                                        <SelectTrigger className="h-8.5 rounded-xl border-[#DFCFA9] bg-white text-xs font-bold">
                                            <SelectValue placeholder="Urutan Data" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem
                                                value="transaction_date_desc"
                                                className="text-xs font-medium"
                                            >
                                                Waktu Terbaru &darr;
                                            </SelectItem>
                                            <SelectItem
                                                value="transaction_date_asc"
                                                className="text-xs font-medium"
                                            >
                                                Waktu Terlama &uarr;
                                            </SelectItem>
                                            <SelectItem
                                                value="total_amount_desc"
                                                className="text-xs font-medium"
                                            >
                                                Nilai Tertinggi &darr;
                                            </SelectItem>
                                            <SelectItem
                                                value="total_amount_asc"
                                                className="text-xs font-medium"
                                            >
                                                Nilai Terendah &uarr;
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Baris Pencarian Cepat & Ringkasan Hasil Filter */}
                            <div className="flex flex-col items-stretch justify-between gap-2.5 pt-1 sm:flex-row sm:items-center">
                                <form
                                    onSubmit={handleSearchSubmit}
                                    className="flex max-w-md flex-1 items-center gap-1.5"
                                >
                                    <div className="relative flex-1">
                                        <Search className="absolute top-2.5 left-3 size-3.5 text-neutral-400" />
                                        <Input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) =>
                                                setSearchQuery(e.target.value)
                                            }
                                            placeholder="Cari nomor pesanan, nama pelanggan, meja, atau menu..."
                                            className="h-8.5 rounded-xl border-[#DFCFA9] bg-white pr-2 pl-8 text-xs"
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        size="sm"
                                        className="h-8.5 shrink-0 rounded-xl bg-[#18181B] px-3 text-xs font-bold text-white hover:bg-black"
                                    >
                                        Cari
                                    </Button>
                                    {searchQuery && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setSearchQuery('');
                                                applyFilters({ search: '' });
                                            }}
                                            className="h-8.5 shrink-0 rounded-xl border-[#DFCFA9] px-2 text-neutral-600"
                                            title="Hapus Pencarian"
                                        >
                                            <X className="size-3.5" />
                                        </Button>
                                    )}
                                </form>

                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="rounded-lg border border-[#DFCFA9] bg-[#FAF6EC] px-2.5 py-1 font-mono text-neutral-700">
                                        <strong className="text-neutral-900">
                                            {filtered_table_totals.count}
                                        </strong>{' '}
                                        transaksi
                                    </span>
                                    <span className="rounded-lg border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 font-mono font-bold text-emerald-800">
                                        Pendapatan Bersih:{' '}
                                        {formatRupiah(
                                            filtered_table_totals.net_revenue,
                                        )}
                                    </span>
                                    {(filters.payment_status !== 'all' ||
                                        filters.order_status !== 'all' ||
                                        filters.payment_method !== 'all' ||
                                        (filters.payment_gateway &&
                                            filters.payment_gateway !==
                                                'all') ||
                                        searchQuery ||
                                        filters.preset !== 'this_month' ||
                                        filters.filter_date ||
                                        filters.menu_id) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearchQuery('');
                                                applyFilters({
                                                    preset: 'this_month',
                                                    payment_status: 'all',
                                                    order_status: 'all',
                                                    payment_method: 'all',
                                                    payment_gateway: 'all',
                                                    search: '',
                                                    filter_date: '',
                                                    menu_id: null,
                                                });
                                            }}
                                            className="px-1.5 py-0.5 text-[11px] font-bold text-[#C52828] hover:underline"
                                        >
                                            Atur Ulang Filter
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Tabel Data Transaksi */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-[#DFCFA9] bg-[#FAF5E8] text-[10px] font-black tracking-wider text-neutral-700 uppercase">
                                    <tr>
                                        <th className="px-3.5 py-3">
                                            Waktu Transaksi
                                        </th>
                                        <th className="px-3.5 py-3">
                                            Nomor Pesanan &amp; Meja
                                        </th>
                                        <th className="px-3.5 py-3">
                                            Nama Pelanggan
                                        </th>
                                        <th className="px-3.5 py-3">
                                            Rincian Menu
                                        </th>
                                        <th className="px-3.5 py-3">
                                            Metode &amp; Gateway
                                        </th>
                                        <th className="px-3.5 py-3">
                                            Status Transaksi
                                        </th>
                                        <th className="px-3.5 py-3 text-right">
                                            Nilai Transaksi
                                        </th>
                                        <th className="px-3.5 py-3 text-center">
                                            Tindakan
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F2EBD9]">
                                    {transactions.data.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={8}
                                                className="bg-[#FFFDF9] py-12 text-center"
                                            >
                                                <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-2">
                                                    <div className="rounded-full border border-[#DFCFA9] bg-[#FAF5E8] p-3 text-neutral-400">
                                                        <Receipt className="size-6 text-[#C52828]" />
                                                    </div>
                                                    <h4 className="text-sm font-bold text-neutral-800">
                                                        Tidak Ada Transaksi
                                                        Ditemukan
                                                    </h4>
                                                    <p className="text-xs text-neutral-500">
                                                        Tidak ditemukan data
                                                        transaksi yang sesuai
                                                        dengan kriteria periode
                                                        atau filter yang
                                                        dipilih.
                                                    </p>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() => {
                                                            setSearchQuery('');
                                                            applyFilters({
                                                                preset: 'this_month',
                                                                payment_status:
                                                                    'all',
                                                                order_status:
                                                                    'all',
                                                                payment_method:
                                                                    'all',
                                                                payment_gateway:
                                                                    'all',
                                                                search: '',
                                                            });
                                                        }}
                                                        className="mt-1 h-8 rounded-xl bg-[#18181B] px-3.5 text-xs font-bold text-white hover:bg-black"
                                                    >
                                                        Tampilkan Semua
                                                        Transaksi Bulan Ini
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        transactions.data.map((tx) => (
                                            <tr
                                                key={tx.id}
                                                className="transition-colors hover:bg-[#FAF6EC]/60"
                                            >
                                                {/* Kolom 1: Waktu Transaksi */}
                                                <td className="px-3.5 py-3 whitespace-nowrap">
                                                    <div className="font-mono text-xs font-bold text-neutral-900">
                                                        {
                                                            tx.transaction_date_formatted
                                                        }
                                                    </div>
                                                    <div className="mt-0.5 font-mono text-[10px] text-neutral-500">
                                                        Dibuat:{' '}
                                                        {
                                                            tx.created_at_formatted
                                                        }
                                                    </div>
                                                </td>

                                                {/* Kolom 2: Nomor Pesanan & Meja */}
                                                <td className="px-3.5 py-3 whitespace-nowrap">
                                                    <div className="font-mono text-xs font-black text-neutral-900">
                                                        #{tx.order_number}
                                                    </div>
                                                    <div className="mt-0.5">
                                                        <span className="inline-block rounded-md border border-[#DFCFA9] bg-[#FAF5E8] px-2 py-0.5 text-[10px] font-black text-neutral-800">
                                                            Meja{' '}
                                                            {tx.table_number}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Kolom 3: Nama Pelanggan */}
                                                <td className="px-3.5 py-3 whitespace-nowrap">
                                                    <div className="text-xs font-bold text-neutral-900">
                                                        {tx.customer_name}
                                                    </div>
                                                    {tx.notes && (
                                                        <div
                                                            className="mt-0.5 max-w-[130px] truncate text-[10px] text-amber-800 italic"
                                                            title={tx.notes}
                                                        >
                                                            &ldquo;{tx.notes}
                                                            &rdquo;
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Kolom 4: Rincian Menu */}
                                                <td className="max-w-[240px] px-3.5 py-3">
                                                    <div
                                                        className="line-clamp-1 text-xs font-medium text-neutral-800"
                                                        title={tx.items_summary}
                                                    >
                                                        {tx.items_summary ||
                                                            'Pesanan'}
                                                    </div>
                                                    {tx.rejected_items_amount >
                                                        0 && (
                                                        <span className="mt-0.5 block text-[10px] font-bold text-rose-600">
                                                            Item Ditolak (-
                                                            {formatRupiah(
                                                                tx.rejected_items_amount,
                                                            )}
                                                            )
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Kolom 5: Metode & Gateway Pembayaran */}
                                                <td className="px-3.5 py-3 whitespace-nowrap">
                                                    <div className="space-y-1">
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold ${
                                                                tx.payment_method ===
                                                                'cash'
                                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                                                    : 'border-indigo-200 bg-indigo-50 text-indigo-800'
                                                            }`}
                                                        >
                                                            {tx.payment_method ===
                                                            'cash' ? (
                                                                <Banknote className="size-3 text-emerald-600" />
                                                            ) : (
                                                                <QrCode className="size-3 text-indigo-600" />
                                                            )}
                                                            <span>
                                                                {tx.payment_method ===
                                                                'cash'
                                                                    ? 'Tunai'
                                                                    : 'QRIS'}
                                                            </span>
                                                        </span>
                                                        <div className="text-[10px] font-semibold text-neutral-600">
                                                            {tx.payment_gateway_label ??
                                                                (tx.payment_gateway ===
                                                                    'xendit' ||
                                                                tx.payment_method ===
                                                                    'qris'
                                                                    ? 'Xendit Payment Gateway'
                                                                    : 'Kasir POS')}
                                                        </div>
                                                        {tx.payment_reference && (
                                                            <div
                                                                className="max-w-[155px] truncate font-mono text-[9.5px] text-neutral-500"
                                                                title={
                                                                    tx.payment_reference
                                                                }
                                                            >
                                                                Ref:{' '}
                                                                {
                                                                    tx.payment_reference
                                                                }
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Kolom 6: Status Transaksi */}
                                                <td className="px-3.5 py-3 whitespace-nowrap">
                                                    <div className="flex flex-col gap-1">
                                                        {renderPaymentStatusBadge(
                                                            tx.payment_status,
                                                            tx.payment_status_label,
                                                        )}
                                                        <div>
                                                            {renderOrderStatusPill(
                                                                tx.order_status,
                                                                tx.order_status_label,
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Kolom 7: Nilai Transaksi */}
                                                <td className="px-3.5 py-3 text-right font-mono whitespace-nowrap">
                                                    {tx.is_realized_revenue ? (
                                                        <div>
                                                            <div className="text-xs font-black text-neutral-900 sm:text-sm">
                                                                {formatRupiah(
                                                                    tx.net_revenue,
                                                                )}
                                                            </div>
                                                            <span className="block text-[9px] font-bold text-emerald-700">
                                                                (Terealisasi)
                                                            </span>
                                                        </div>
                                                    ) : tx.order_status ===
                                                          'cancelled' ||
                                                      tx.payment_status ===
                                                          'failed' ? (
                                                        <div>
                                                            <div className="text-xs font-bold text-neutral-400 line-through">
                                                                {formatRupiah(
                                                                    tx.total_amount,
                                                                )}
                                                            </div>
                                                            <span className="block text-[9px] text-neutral-500">
                                                                (Dibatalkan)
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <div className="text-xs font-bold text-amber-800">
                                                                {formatRupiah(
                                                                    tx.total_amount,
                                                                )}
                                                            </div>
                                                            <span className="block text-[9px] font-bold text-amber-700">
                                                                (Menunggu)
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Kolom 8: Tindakan */}
                                                <td className="px-3.5 py-3 text-center whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() =>
                                                                openTransactionDetail(
                                                                    tx,
                                                                )
                                                            }
                                                            className="h-7 rounded-lg border-[#DFCFA9] bg-white px-2 text-[11px] font-bold hover:bg-[#FAF5E8]"
                                                            title="Lihat rincian transaksi"
                                                        >
                                                            <Eye className="mr-1 size-3 text-neutral-700" />
                                                            <span>Rincian</span>
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() =>
                                                                openPrintReceipt(
                                                                    tx,
                                                                )
                                                            }
                                                            className="h-7 rounded-lg border-[#DFCFA9] bg-white px-2 text-[11px] font-bold hover:bg-[#FAF5E8]"
                                                            title="Cetak nota transaksi"
                                                        >
                                                            <Printer className="mr-1 size-3 text-neutral-700" />
                                                            <span>Nota</span>
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer Paginasi */}
                        {transactions.last_page > 1 && (
                            <div className="flex flex-col gap-3 border-t border-[#E8DFC8] bg-[#FAF5E8] p-4 text-xs sm:flex-row sm:items-center sm:justify-between">
                                <span className="font-medium text-neutral-600">
                                    Menampilkan{' '}
                                    <strong className="font-mono text-neutral-900">
                                        {transactions.from ?? 0}
                                    </strong>{' '}
                                    -{' '}
                                    <strong className="font-mono text-neutral-900">
                                        {transactions.to ?? 0}
                                    </strong>{' '}
                                    dari{' '}
                                    <strong className="font-mono text-neutral-900">
                                        {transactions.total}
                                    </strong>{' '}
                                    transaksi
                                </span>

                                <div className="flex flex-wrap items-center gap-1">
                                    {transactions.links.map((link, idx) => {
                                        if (!link.url) {
                                            return (
                                                <span
                                                    key={idx}
                                                    dangerouslySetInnerHTML={{
                                                        __html: link.label,
                                                    }}
                                                    className="rounded-lg px-2.5 py-1 text-xs font-bold text-neutral-400 select-none"
                                                />
                                            );
                                        }
                                        return (
                                            <Link
                                                key={idx}
                                                href={link.url}
                                                preserveScroll
                                                preserveState
                                                dangerouslySetInnerHTML={{
                                                    __html: link.label,
                                                }}
                                                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                                                    link.active
                                                        ? 'bg-[#18181B] text-white shadow-2xs'
                                                        : 'border border-[#DFCFA9] bg-white text-neutral-800 hover:bg-[#FAF6EC]'
                                                }`}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* MODAL 1: RINCIAN TRANSAKSI (Gaya 2 Kolom Standee QR Meja)                 */}
            {/* ========================================================================= */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="flex max-h-[92dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-4xl">
                    {selectedTx && (
                        <>
                            {/* Sticky Header ala Modal QR Code Meja */}
                            <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                                <FormDialogHeader
                                    icon={Receipt}
                                    badge="Rincian Transaksi"
                                    tag={`MEJA ${selectedTx.table_number}`}
                                    statusLabel={
                                        selectedTx.payment_status_label
                                    }
                                    statusActive={
                                        selectedTx.payment_status === 'paid'
                                    }
                                    title={`Rincian Transaksi #${selectedTx.order_number}`}
                                    description={`Pelanggan: ${selectedTx.customer_name} • Status Pesanan: ${selectedTx.order_status_label}`}
                                />
                            </div>

                            {/* Body 2 Kolom ala Modal QR Code Meja */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                                <div className="flex flex-col items-stretch gap-5 md:flex-row">
                                    {/* KOLOM KIRI: Kartu Standee Transaksi */}
                                    <StandeeModalCard
                                        pillPrimary={`MEJA ${selectedTx.table_number}`}
                                        pillSecondary={selectedTx.customer_name}
                                        topBadgeIcon={Receipt}
                                        topBadgeLabel={selectedTx.payment_method_label.toUpperCase()}
                                        heading={`#${selectedTx.order_number}`}
                                        subheading={`Waktu Pesanan ${selectedTx.created_at_formatted} • ${selectedTx.items.length} item menu`}
                                        steps={[
                                            {
                                                num: '01',
                                                label: `${selectedTx.items.length} Menu`,
                                            },
                                            {
                                                num: '02',
                                                label: selectedTx.payment_method_label,
                                            },
                                            {
                                                num: '03',
                                                label: selectedTx.payment_status_label,
                                            },
                                        ]}
                                    >
                                        <div className="flex size-36 flex-col items-center justify-center gap-1.5 bg-[#FAF5E8] p-3 text-center">
                                            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#C52828] text-white shadow-sm">
                                                <Receipt className="size-6" />
                                            </div>
                                            <p className="text-[10px] font-bold tracking-wider text-[#78716C] uppercase">
                                                Pendapatan Bersih
                                            </p>
                                            <p className="font-heading text-sm font-black text-[#C52828] tabular-nums">
                                                {formatRupiah(
                                                    selectedTx.net_revenue,
                                                )}
                                            </p>
                                        </div>
                                    </StandeeModalCard>

                                    {/* KOLOM KANAN: Panel Informasi & Daftar Item */}
                                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3.5">
                                        <div className="space-y-3.5">
                                            {/* Dark Merchant & Pendapatan Bersih Banner ala QRIS */}
                                            <div className="flex items-center justify-between rounded-xl bg-[#1A1A1A] p-3.5 text-white shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-10 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black tracking-tight text-white">
                                                        TX
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold tracking-wide text-white uppercase">
                                                            SIDE LINE COFFEE •
                                                            MEJA{' '}
                                                            {
                                                                selectedTx.table_number
                                                            }
                                                        </p>
                                                        <p className="text-[10px] text-white/60">
                                                            {
                                                                selectedTx.payment_method_label
                                                            }{' '}
                                                            •{' '}
                                                            {selectedTx.payment_gateway_label ??
                                                                (selectedTx.payment_gateway ===
                                                                    'xendit' ||
                                                                selectedTx.payment_method ===
                                                                    'qris'
                                                                    ? 'Xendit Payment Gateway'
                                                                    : 'Kasir POS')}{' '}
                                                            •{' '}
                                                            {selectedTx.payment_reference ??
                                                                'Transaksi Kasir'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-medium text-white/60">
                                                        Pendapatan Bersih
                                                    </p>
                                                    <p className="text-sm font-black tracking-tight text-white tabular-nums">
                                                        {formatRupiah(
                                                            selectedTx.net_revenue,
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Grid Informasi Waktu & Pembayaran */}
                                            <div className="space-y-2.5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 text-xs shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                                <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                                    <span className="flex items-center gap-1.5">
                                                        <Sparkles className="size-3.5 text-[#C52828]" />
                                                        Informasi Pembayaran
                                                        &amp; Petugas
                                                    </span>
                                                    <span className="font-mono text-[10px] text-[#6E6A64]">
                                                        {
                                                            selectedTx.order_status_label
                                                        }
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                                    <div className="space-y-1.5 rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-2.5">
                                                        <div className="flex justify-between">
                                                            <span className="text-[#6E6A64]">
                                                                Waktu Pesanan:
                                                            </span>
                                                            <span className="font-bold text-[#1A1A1A]">
                                                                {
                                                                    selectedTx.created_at_formatted
                                                                }
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-[#6E6A64]">
                                                                Waktu
                                                                Pembayaran:
                                                            </span>
                                                            <span className="font-bold text-emerald-700">
                                                                {selectedTx.paid_at_formatted ??
                                                                    'Belum Dibayar'}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-[#6E6A64]">
                                                                Metode
                                                                Pembayaran:
                                                            </span>
                                                            <span className="font-bold text-[#1A1A1A]">
                                                                {
                                                                    selectedTx.payment_method_label
                                                                }
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between gap-2">
                                                            <span className="text-[#6E6A64]">
                                                                Gateway
                                                                Pembayaran:
                                                            </span>
                                                            <span
                                                                className={`font-bold ${
                                                                    selectedTx.payment_gateway ===
                                                                        'xendit' ||
                                                                    selectedTx.payment_method ===
                                                                        'qris'
                                                                        ? 'text-[#1876D1]'
                                                                        : 'text-[#1A1A1A]'
                                                                }`}
                                                            >
                                                                {selectedTx.payment_gateway_label ??
                                                                    (selectedTx.payment_gateway ===
                                                                        'xendit' ||
                                                                    selectedTx.payment_method ===
                                                                        'qris'
                                                                        ? 'Xendit Payment Gateway'
                                                                        : 'Kasir POS')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5 rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-2.5">
                                                        <div className="flex justify-between">
                                                            <span className="text-[#6E6A64]">
                                                                Petugas Kasir:
                                                            </span>
                                                            <span className="font-bold text-[#1A1A1A]">
                                                                {selectedTx.confirmed_by_name ??
                                                                    (selectedTx.payment_status ===
                                                                    'paid'
                                                                        ? 'Sistem / Kasir'
                                                                        : '-')}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between gap-2">
                                                            <span className="shrink-0 text-[#6E6A64]">
                                                                Nomor Referensi:
                                                            </span>
                                                            <span
                                                                className="truncate font-mono font-bold text-[#1A1A1A]"
                                                                title={
                                                                    selectedTx.payment_reference ??
                                                                    '-'
                                                                }
                                                            >
                                                                {selectedTx.payment_reference ??
                                                                    '-'}
                                                            </span>
                                                        </div>
                                                        {selectedTx.cash_received !==
                                                            null && (
                                                            <div className="flex justify-between">
                                                                <span className="text-[#6E6A64]">
                                                                    Tunai /
                                                                    Kembalian:
                                                                </span>
                                                                <span className="font-mono font-bold text-[#1A1A1A]">
                                                                    {formatRupiah(
                                                                        selectedTx.cash_received,
                                                                    )}{' '}
                                                                    /{' '}
                                                                    {formatRupiah(
                                                                        selectedTx.change_amount ??
                                                                            0,
                                                                    )}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Daftar Menu Pesanan */}
                                            <div className="space-y-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                                <h4 className="flex items-center gap-1.5 border-b border-[#EFEAE0] pb-2.5 text-xs font-bold text-[#1A1A1A]">
                                                    <Coffee className="size-3.5 text-[#C52828]" />
                                                    Daftar Menu Pesanan (
                                                    {selectedTx.items.length}{' '}
                                                    menu)
                                                </h4>
                                                <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                                                    {selectedTx.items.map(
                                                        (item) => {
                                                            const isRejected =
                                                                item.status ===
                                                                'rejected';
                                                            return (
                                                                <div
                                                                    key={
                                                                        item.id
                                                                    }
                                                                    className={`space-y-1 rounded-xl border p-3 text-xs ${
                                                                        isRejected
                                                                            ? 'border-rose-200 bg-rose-50/60'
                                                                            : 'border-[#EBE5DC] bg-[#FAF8F4]'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-extrabold text-[#1A1A1A]">
                                                                                {
                                                                                    item.quantity
                                                                                }
                                                                                x{' '}
                                                                                {
                                                                                    item.menu_name
                                                                                }
                                                                            </span>
                                                                            {isRejected && (
                                                                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">
                                                                                    DITOLAK
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <span
                                                                            className={`font-mono font-bold ${isRejected ? 'text-rose-600 line-through' : 'text-[#1A1A1A]'}`}
                                                                        >
                                                                            {formatRupiah(
                                                                                item.total_price,
                                                                            )}
                                                                        </span>
                                                                    </div>

                                                                    {item
                                                                        .options
                                                                        .length >
                                                                        0 && (
                                                                        <div className="border-l-2 border-[#E6DFD3] pl-2 text-[11px] text-[#6E6A64]">
                                                                            {item.options.map(
                                                                                (
                                                                                    opt,
                                                                                ) => (
                                                                                    <div
                                                                                        key={
                                                                                            opt.id
                                                                                        }
                                                                                    >
                                                                                        +{' '}
                                                                                        {
                                                                                            opt.group_name
                                                                                        }
                                                                                        :{' '}
                                                                                        {
                                                                                            opt.option_name
                                                                                        }{' '}
                                                                                        {opt.additional_price >
                                                                                        0
                                                                                            ? `(${formatRupiah(opt.additional_price)})`
                                                                                            : ''}
                                                                                    </div>
                                                                                ),
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    {item.customer_notes && (
                                                                        <div className="text-[11px] text-amber-800 italic">
                                                                            Catatan:
                                                                            &ldquo;
                                                                            {
                                                                                item.customer_notes
                                                                            }
                                                                            &rdquo;
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                </div>

                                                {/* Ringkasan Keuangan Transaksi */}
                                                <div className="space-y-1.5 border-t border-dashed border-[#E5DEC9] pt-3 text-xs">
                                                    <div className="flex justify-between text-[#6E6A64]">
                                                        <span>
                                                            Subtotal Menu Aktif:
                                                        </span>
                                                        <span className="font-mono font-bold text-[#1A1A1A]">
                                                            {formatRupiah(
                                                                selectedTx.subtotal,
                                                            )}
                                                        </span>
                                                    </div>
                                                    {selectedTx.refund_amount >
                                                        0 && (
                                                        <div className="flex justify-between text-rose-700">
                                                            <span>
                                                                Penyesuaian
                                                                Historis:
                                                            </span>
                                                            <span className="font-mono">
                                                                -{' '}
                                                                {formatRupiah(
                                                                    selectedTx.refund_amount,
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between border-t border-[#EFEAE0] pt-2 text-sm font-extrabold text-[#1A1A1A]">
                                                        <span>
                                                            Pendapatan Bersih:
                                                        </span>
                                                        <span className="font-mono font-black text-[#C52828]">
                                                            {formatRupiah(
                                                                selectedTx.net_revenue,
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5">
                                <span className="hidden text-xs font-semibold text-[#6E6A64] sm:inline">
                                    Data transaksi tercatat otomatis di laporan
                                    keuangan
                                </span>
                                <div className="ml-auto flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsDetailOpen(false)}
                                        className="h-11 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                                    >
                                        Tutup
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            setIsDetailOpen(false);
                                            setIsPrintReceiptOpen(true);
                                        }}
                                        className="h-11 cursor-pointer gap-1.5 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222]"
                                    >
                                        <Printer className="size-3.5" />
                                        <span>Cetak Nota Struk</span>
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 2: CETAK STRUK RESMI THERMAL KAFE SIDE LINE (Gaya 2 Kolom Standee)  */}
            {/* ========================================================================= */}
            <Dialog
                open={isPrintReceiptOpen}
                onOpenChange={setIsPrintReceiptOpen}
            >
                <DialogContent className="flex max-h-[92dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-4xl">
                    {selectedTx && (
                        <>
                            {/* Sticky Header */}
                            <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                                <FormDialogHeader
                                    icon={Printer}
                                    badge="Struk Resmi"
                                    tag={`MEJA ${selectedTx.table_number}`}
                                    statusLabel={
                                        selectedTx.payment_status_label
                                    }
                                    statusActive={
                                        selectedTx.payment_status === 'paid'
                                    }
                                    title={`Nota #${selectedTx.order_number}`}
                                    description="Format struk thermal 80mm resmi SIDE LINE COFFEE."
                                />
                            </div>

                            {/* Body 2 Kolom */}
                            <div className="flex-1 overflow-y-auto bg-[#FAF8F4] p-4 sm:p-5">
                                <div className="flex flex-col items-stretch gap-5 md:flex-row">
                                    {/* KOLOM KIRI: Standee Card Nota */}
                                    <StandeeModalCard
                                        pillPrimary={`MEJA ${selectedTx.table_number}`}
                                        pillSecondary={selectedTx.customer_name}
                                        topBadgeIcon={Printer}
                                        topBadgeLabel="CETAK THERMAL"
                                        heading={`Nota #${selectedTx.order_number}`}
                                        subheading="Pratinjau struk resmi kasir SIDE LINE siap cetak."
                                        steps={[
                                            {
                                                num: '01',
                                                label: '80mm Thermal',
                                            },
                                            {
                                                num: '02',
                                                label: selectedTx.payment_method_label,
                                            },
                                            { num: '03', label: 'Siap Cetak' },
                                        ]}
                                    >
                                        <div className="flex size-36 flex-col items-center justify-center gap-1.5 bg-[#FAF5E8] p-3 text-center">
                                            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#C52828] text-white shadow-sm">
                                                <Printer className="size-6" />
                                            </div>
                                            <p className="text-[10px] font-bold text-[#78716C] uppercase">
                                                Total Tagihan
                                            </p>
                                            <p className="font-heading text-sm font-black text-[#C52828] tabular-nums">
                                                {formatRupiah(
                                                    selectedTx.net_revenue,
                                                )}
                                            </p>
                                        </div>
                                    </StandeeModalCard>

                                    {/* KOLOM KANAN: Pratinjau Struk Thermal Resmi */}
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
                                                            STRUK RESMI
                                                        </p>
                                                        <p className="text-[10px] text-white/60">
                                                            {
                                                                selectedTx.transaction_date_formatted
                                                            }{' '}
                                                            •{' '}
                                                            {
                                                                selectedTx.payment_method_label
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-medium text-white/60">
                                                        Total
                                                    </p>
                                                    <p className="text-sm font-black text-white tabular-nums">
                                                        {formatRupiah(
                                                            selectedTx.net_revenue,
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-3 rounded-xl border border-dashed border-[#D6CFC2] bg-[#FFFDFB] p-4 font-mono text-xs text-[#1A1A1A] shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                                <div className="border-b border-dashed border-[#D6CFC2] pb-3 text-center">
                                                    <h3 className="text-sm font-black tracking-widest uppercase">
                                                        SIDE LINE CAFE
                                                    </h3>
                                                    <p className="text-[10px] text-[#6E6A64]">
                                                        Coffee &amp; Eatery •
                                                        Struk Resmi
                                                    </p>
                                                    <p className="mt-1 text-[10px] text-[#8C857B]">
                                                        Telp: 0812-3456-7890
                                                    </p>
                                                </div>

                                                <div className="space-y-0.5 border-b border-dashed border-[#D6CFC2] pb-2 text-[11px]">
                                                    <div className="flex justify-between">
                                                        <span>No. Nota:</span>
                                                        <span className="font-bold">
                                                            #
                                                            {
                                                                selectedTx.order_number
                                                            }
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>
                                                            Meja / Kasir:
                                                        </span>
                                                        <span>
                                                            Meja{' '}
                                                            {
                                                                selectedTx.table_number
                                                            }{' '}
                                                            /{' '}
                                                            {selectedTx.confirmed_by_name ??
                                                                'Kasir'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Waktu:</span>
                                                        <span>
                                                            {
                                                                selectedTx.transaction_date_formatted
                                                            }
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Pelanggan:</span>
                                                        <span className="font-bold">
                                                            {
                                                                selectedTx.customer_name
                                                            }
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5 border-b border-dashed border-[#D6CFC2] pb-2 text-[11px]">
                                                    {selectedTx.items
                                                        .filter(
                                                            (it) =>
                                                                it.status ===
                                                                'active',
                                                        )
                                                        .map((it) => (
                                                            <div key={it.id}>
                                                                <div className="flex justify-between">
                                                                    <span>
                                                                        {
                                                                            it.quantity
                                                                        }
                                                                        x{' '}
                                                                        {
                                                                            it.menu_name
                                                                        }
                                                                    </span>
                                                                    <span className="font-bold">
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
                                                                            className="pl-2 text-[10px] text-[#6E6A64]"
                                                                        >
                                                                            +{' '}
                                                                            {
                                                                                opt.option_name
                                                                            }
                                                                        </div>
                                                                    ),
                                                                )}
                                                            </div>
                                                        ))}
                                                </div>

                                                <div className="space-y-1 pt-1 text-[11px]">
                                                    <div className="flex justify-between font-bold">
                                                        <span>
                                                            TOTAL TAGIHAN:
                                                        </span>
                                                        <span className="text-[#C52828]">
                                                            {formatRupiah(
                                                                selectedTx.net_revenue,
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-[#6E6A64]">
                                                        <span>
                                                            Metode Bayar:
                                                        </span>
                                                        <span>
                                                            {
                                                                selectedTx.payment_method_label
                                                            }
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-[#6E6A64]">
                                                        <span>
                                                            Gateway Bayar:
                                                        </span>
                                                        <span className="font-semibold text-[#1A1A1A]">
                                                            {selectedTx.payment_gateway_label ??
                                                                (selectedTx.payment_gateway ===
                                                                    'xendit' ||
                                                                selectedTx.payment_method ===
                                                                    'qris'
                                                                    ? 'Xendit Payment Gateway'
                                                                    : 'Kasir POS')}
                                                        </span>
                                                    </div>
                                                    {selectedTx.payment_reference && (
                                                        <div className="flex justify-between gap-2 text-[#6E6A64]">
                                                            <span className="shrink-0">
                                                                Ref. Transaksi:
                                                            </span>
                                                            <span className="truncate font-mono text-[#1A1A1A]">
                                                                {
                                                                    selectedTx.payment_reference
                                                                }
                                                            </span>
                                                        </div>
                                                    )}
                                                    {selectedTx.cash_received !==
                                                        null && (
                                                        <>
                                                            <div className="flex justify-between text-[#6E6A64]">
                                                                <span>
                                                                    Tunai
                                                                    Diterima:
                                                                </span>
                                                                <span>
                                                                    {formatRupiah(
                                                                        selectedTx.cash_received,
                                                                    )}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between text-[#6E6A64]">
                                                                <span>
                                                                    Kembalian:
                                                                </span>
                                                                <span>
                                                                    {formatRupiah(
                                                                        selectedTx.change_amount ??
                                                                            0,
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                <div className="border-t border-dashed border-[#D6CFC2] pt-3 text-center text-[10px] text-[#8C857B]">
                                                    <p>
                                                        Terima kasih atas
                                                        kunjungan Anda!
                                                    </p>
                                                    <p className="mt-0.5">
                                                        Nikmati momen hangat di
                                                        SIDE LINE
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5">
                                <span className="hidden text-xs font-semibold text-[#6E6A64] sm:inline">
                                    Format kertas struk mendukung 58mm & 80mm
                                </span>
                                <div className="ml-auto flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            setIsPrintReceiptOpen(false)
                                        }
                                        className="h-11 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                                    >
                                        Tutup
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => window.print()}
                                        className="h-11 cursor-pointer gap-1.5 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222]"
                                    >
                                        <Printer className="size-3.5" />
                                        <span>Cetak Thermal</span>
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
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
            title: 'Ringkasan & Keuangan',
            href: '/dashboard',
        },
    ] as BreadcrumbItem[],
};
