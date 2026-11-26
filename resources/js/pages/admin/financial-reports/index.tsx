import { Head, router } from '@inertiajs/react';
import {
    Download,
    FileSpreadsheet,
    FileText,
    Info,
    Minus,
    Printer,
    RefreshCw,
    TrendingDown,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AdminPage,
    FilterTabs,
    PageHeader,
    Panel,
    StatGrid,
    StatusPill,
} from '@/components/admin/admin-ui';
import DateRangeFilterModal from '@/components/admin/financial/DateRangeFilterModal';
import RecapProfitabilityTab from '@/components/admin/financial/RecapProfitabilityTab';
import ReconciliationLedgerTab from '@/components/admin/financial/ReconciliationLedgerTab';
import {
    formatCompactRupiah,
    formatRupiah,
    type FinancialSummary,
    type PeriodRecapRow,
    type ReportFilters,
} from '@/components/admin/financial/financial-types';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

type FinanceTab = 'rekap' | 'rekonsiliasi';

interface FinancialReportsPageProps {
    filters: ReportFilters;
    available_menus: { id: number; name: string }[];
    summary: FinancialSummary;
    recaps: {
        daily: { rows: PeriodRecapRow[]; totals: PeriodRecapRow };
        weekly: { rows: PeriodRecapRow[]; totals: PeriodRecapRow };
        monthly: { rows: PeriodRecapRow[]; totals: PeriodRecapRow };
    };
    transactions: {
        data: any[];
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
        from: number | null;
        to: number | null;
        links: { url: string | null; label: string; active: boolean }[];
    };
    filtered_table_totals: {
        count: number;
        subtotal: number;
        refund_amount: number;
        net_revenue: number;
        unpaid_amount: number;
    };
    product_analytics: any;
    operational_analytics: any;
    calculation_rules: Record<string, string>;
    synced_at: string;
}

function resolveInitialTab(): FinanceTab {
    if (typeof window === 'undefined') return 'rekap';
    const raw = new URLSearchParams(window.location.search).get('tab');
    if (raw === 'rekonsiliasi' || raw === 'rekap') {
        return raw;
    }
    return 'rekap';
}

function GrowthBadge({ percent }: { percent: number }) {
    if (percent > 0) {
        return (
            <span className="inline-flex items-center gap-1 rounded-md border border-[#BBF7D0] bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-bold text-[#15803D]">
                <TrendingUp className="size-3" />+{percent.toFixed(1)}%
            </span>
        );
    }
    if (percent < 0) {
        return (
            <span className="inline-flex items-center gap-1 rounded-md border border-[#FECACA] bg-[#FEE2E2] px-2 py-0.5 text-[11px] font-bold text-[#B91C1C]">
                <TrendingDown className="size-3" />
                {percent.toFixed(1)}%
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-md border border-[#E7DEC9] bg-[#FAF6EC] px-2 py-0.5 text-[11px] font-bold text-[#78716C]">
            <Minus className="size-3" />
            0%
        </span>
    );
}

export default function FinancialReportsIndex({
    filters: initialFilters,
    available_menus: initialAvailableMenus,
    summary: initialSummary,
    recaps: initialRecaps,
    transactions: initialTransactions,
    filtered_table_totals: initialFilteredTableTotals,
    product_analytics: initialProductAnalytics,
    operational_analytics: initialOperationalAnalytics,
    calculation_rules: initialCalculationRules,
    synced_at: initialSyncedAt,
}: FinancialReportsPageProps) {
    const [activeTab, setActiveTab] = useState<FinanceTab>(resolveInitialTab);
    const [showRules, setShowRules] = useState(false);

    const [liveData, setLiveData] = useState<FinancialReportsPageProps>({
        filters: initialFilters,
        available_menus: initialAvailableMenus,
        summary: initialSummary,
        recaps: initialRecaps,
        transactions: initialTransactions,
        filtered_table_totals: initialFilteredTableTotals,
        product_analytics: initialProductAnalytics,
        operational_analytics: initialOperationalAnalytics,
        calculation_rules: initialCalculationRules,
        synced_at: initialSyncedAt,
    });

    useEffect(() => {
        setLiveData({
            filters: initialFilters,
            available_menus: initialAvailableMenus,
            summary: initialSummary,
            recaps: initialRecaps,
            transactions: initialTransactions,
            filtered_table_totals: initialFilteredTableTotals,
            product_analytics: initialProductAnalytics,
            operational_analytics: initialOperationalAnalytics,
            calculation_rules: initialCalculationRules,
            synced_at: initialSyncedAt,
        });
    }, [
        initialFilters,
        initialAvailableMenus,
        initialSummary,
        initialRecaps,
        initialTransactions,
        initialFilteredTableTotals,
        initialProductAnalytics,
        initialOperationalAnalytics,
        initialCalculationRules,
        initialSyncedAt,
    ]);

    const {
        filters,
        available_menus,
        summary,
        recaps,
        transactions,
        filtered_table_totals,
        product_analytics,
        operational_analytics,
        calculation_rules,
        synced_at,
    } = liveData;

    const buildQuery = useCallback(
        (overrides: Record<string, string | number> = {}) => {
            const merged: Record<string, string> = {
                preset: filters.preset,
                start_date: filters.start_date,
                end_date: filters.end_date,
                compare_mode: filters.compare_mode,
                payment_status: filters.payment_status ?? 'all',
                order_status: filters.order_status ?? 'all',
                payment_method: filters.payment_method ?? 'all',
                payment_gateway: filters.payment_gateway ?? 'all',
                sort_by: filters.sort_by ?? 'transaction_date',
                sort_dir: filters.sort_dir ?? 'desc',
                per_page: String(filters.per_page ?? 15),
            };

            if (filters.compare_start_date) {
                merged.compare_start_date = filters.compare_start_date;
            }
            if (filters.compare_end_date) {
                merged.compare_end_date = filters.compare_end_date;
            }
            if (filters.filter_date) {
                merged.filter_date = filters.filter_date;
            }
            if (filters.menu_id) {
                merged.menu_id = String(filters.menu_id);
            }
            if (filters.search) {
                merged.search = filters.search;
            }

            for (const [k, v] of Object.entries(overrides)) {
                if (v === '' || v === undefined || v === null) {
                    delete merged[k];
                } else {
                    merged[k] = String(v);
                }
            }

            return merged;
        },
        [filters],
    );

    const syncUrl = useMemo(() => {
        const query = buildQuery(
            transactions.current_page > 1
                ? { page: transactions.current_page }
                : {},
        );
        return `/admin/financial-reports/sync?${new URLSearchParams(query).toString()}`;
    }, [buildQuery, transactions.current_page]);

    const handleRealtimeData = useCallback(
        (payload: Partial<FinancialReportsPageProps>) => {
            if (
                !payload?.summary ||
                !payload?.recaps ||
                !payload?.transactions
            ) {
                return;
            }

            setLiveData((prev) => ({
                filters: payload.filters ?? prev.filters,
                available_menus:
                    payload.available_menus ?? prev.available_menus,
                summary: payload.summary ?? prev.summary,
                recaps: payload.recaps ?? prev.recaps,
                transactions: payload.transactions ?? prev.transactions,
                filtered_table_totals:
                    payload.filtered_table_totals ?? prev.filtered_table_totals,
                product_analytics:
                    payload.product_analytics ?? prev.product_analytics,
                operational_analytics:
                    payload.operational_analytics ?? prev.operational_analytics,
                calculation_rules:
                    payload.calculation_rules ?? prev.calculation_rules,
                synced_at: payload.synced_at ?? prev.synced_at,
            }));
        },
        [],
    );

    const { isAutoSync, toggleAutoSync, isSyncing, syncNow } = useRealtimeSync<
        Partial<FinancialReportsPageProps>
    >({
        syncUrl,
        intervalMs: 3000,
        onData: handleRealtimeData,
    });

    const period = summary.period;
    const digitalGateway = summary.payment_gateways.find(
        (g) => g.gateway === 'digital',
    );
    const manualGateway = summary.payment_gateways.find(
        (g) => g.gateway === 'manual',
    );
    const digitalRevenue =
        digitalGateway?.net_revenue ?? summary.gateway_integration.net_revenue;
    const digitalCount =
        digitalGateway?.transactions_count ??
        summary.gateway_integration.transactions_count;
    const digitalShare = digitalGateway?.revenue_share_percent ?? 0;

    const cashRevenue =
        manualGateway?.net_revenue ?? period.cash_flow.inflow_cash;
    const cashCount = manualGateway?.transactions_count ?? 0;
    const cashShare = manualGateway?.revenue_share_percent ?? 0;

    const failedOrCancelledCount =
        period.failed_or_cancelled_count ??
        period.cancelled_orders_count + period.failed_payments_count;
    const failedOrCancelledAmount =
        period.failed_or_cancelled_amount ?? period.cancelled_amount;

    const navigateFilters = (overrides: Record<string, string | number>) => {
        router.get('/admin/financial-reports', buildQuery(overrides), {
            preserveState: true,
            preserveScroll: true,
        });
    };

    const handleTabChange = (nextTab: FinanceTab) => {
        setActiveTab(nextTab);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', nextTab);
            window.history.replaceState({}, '', url.toString());
        }
    };

    const handleRefresh = async () => {
        const ok = await syncNow();
        if (!ok) {
            router.reload();
        }
    };

    const exportQueryString = new URLSearchParams(buildQuery()).toString();

    return (
        <>
            <Head title="Pengelolaan Keuangan • Admin Café SIDE LINE" />

            <AdminPage>
                <PageHeader
                    icon={Wallet}
                    title="Pengelolaan Keuangan"
                    description={`Rekap omzet, performa menu & rekonsiliasi pembayaran • Update ${synced_at}`}
                    actions={
                        <>
                            <DateRangeFilterModal
                                currentPreset={filters.preset}
                                currentStartDate={filters.start_date}
                                currentEndDate={filters.end_date}
                                currentPeriodLabel={filters.period_label}
                                compareMode={filters.compare_mode}
                                compareStartDate={filters.compare_start_date}
                                compareEndDate={filters.compare_end_date}
                                compareLabel={filters.compare_label}
                                onApply={(params) =>
                                    navigateFilters({
                                        preset: params.preset,
                                        start_date: params.start_date ?? '',
                                        end_date: params.end_date ?? '',
                                        compare_mode:
                                            params.compare_mode ??
                                            'previous_period',
                                        compare_start_date:
                                            params.compare_start_date ?? '',
                                        compare_end_date:
                                            params.compare_end_date ?? '',
                                        filter_date: '',
                                        page: 1,
                                    })
                                }
                            />

                            <div className="inline-flex h-9 shrink-0 items-center divide-x divide-[#DFCFA9] overflow-hidden rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] shadow-2xs">
                                <a
                                    href={`/admin/financial-reports/export/excel?${exportQueryString}`}
                                    className="inline-flex h-full items-center gap-1.5 bg-[#DCFCE7]/50 px-2.5 text-xs font-bold whitespace-nowrap text-[#15803D] transition-colors hover:bg-[#DCFCE7]"
                                    title="Unduh Laporan Excel (.xlsx)"
                                >
                                    <FileSpreadsheet className="size-3.5" />
                                    <span>Excel</span>
                                </a>

                                <a
                                    href={`/admin/financial-reports/export/csv?${exportQueryString}`}
                                    className="inline-flex h-full items-center gap-1.5 px-2.5 text-xs font-bold whitespace-nowrap text-[#3F2D1C] transition-colors hover:bg-[#F5EEDC]"
                                    title="Unduh Laporan CSV"
                                >
                                    <Download className="size-3.5" />
                                    <span>CSV</span>
                                </a>

                                <a
                                    href={`/admin/financial-reports/export/pdf?${exportQueryString}`}
                                    className="inline-flex h-full items-center gap-1.5 px-2.5 text-xs font-bold whitespace-nowrap text-[#3F2D1C] transition-colors hover:bg-[#F5EEDC]"
                                    title="Unduh Laporan PDF"
                                >
                                    <FileText className="size-3.5" />
                                    <span>PDF</span>
                                </a>
                            </div>

                            <button
                                type="button"
                                onClick={() => window.print()}
                                title="Cetak Halaman"
                                className="hidden size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] text-[#3F2D1C] shadow-2xs transition-colors hover:bg-[#F5EEDC] sm:inline-flex"
                            >
                                <Printer className="size-3.5" />
                            </button>

                            <button
                                type="button"
                                onClick={toggleAutoSync}
                                title={
                                    isAutoSync
                                        ? 'Klik untuk menjeda sinkronisasi real-time otomatis'
                                        : 'Klik untuk mengaktifkan sinkronisasi real-time otomatis'
                                }
                                className={cn(
                                    'inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-xs font-bold whitespace-nowrap shadow-2xs transition-colors',
                                    isAutoSync
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                        : 'border-[#DFCFA9] bg-[#FAF6EC] text-[#78716C] hover:bg-[#F5EEDC]',
                                )}
                            >
                                <span
                                    className={cn(
                                        'size-2 rounded-full',
                                        isAutoSync
                                            ? 'animate-pulse bg-emerald-500'
                                            : 'bg-[#A8A29E]',
                                    )}
                                />
                                <span>
                                    {isAutoSync ? 'Auto-Sync' : 'Sync Dijeda'}
                                </span>
                            </button>

                            <button
                                type="button"
                                disabled={isSyncing}
                                title="Muat Ulang Data"
                                onClick={() => void handleRefresh()}
                                className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] text-[#3F2D1C] shadow-2xs transition-colors hover:bg-[#F5EEDC] disabled:opacity-50"
                            >
                                <RefreshCw
                                    className={cn(
                                        'size-3.5',
                                        isSyncing && 'animate-spin',
                                    )}
                                />
                            </button>
                        </>
                    }
                />

                {/* 4 KPI Rekap Pendapatan & Pembayaran SideOrder */}
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-heading text-sm font-extrabold tracking-tight text-[#18181B]">
                                Ringkasan Pendapatan &amp; Pembayaran
                            </h2>
                            <button
                                type="button"
                                onClick={toggleAutoSync}
                                title={
                                    isAutoSync
                                        ? 'Sinkronisasi real-time aktif — klik untuk menjeda'
                                        : 'Sinkronisasi real-time dijeda — klik untuk mengaktifkan'
                                }
                                className={cn(
                                    'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[11px] font-bold ring-1 transition-colors ring-inset',
                                    isAutoSync
                                        ? 'bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100'
                                        : 'bg-[#FAF6EC] text-[#78716C] ring-[#E8DFC8] hover:bg-[#F5EEDC]',
                                )}
                            >
                                <span
                                    className={cn(
                                        'size-1.5 rounded-full',
                                        isAutoSync
                                            ? 'animate-pulse bg-emerald-500'
                                            : 'bg-[#A8A29E]',
                                    )}
                                />
                                <span>
                                    {isAutoSync
                                        ? 'Real-Time (3 dtk)'
                                        : 'Sync Dijeda'}
                                </span>
                            </button>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] font-semibold text-[#78716C]">
                            <span className="font-mono tabular-nums">
                                Update {synced_at}
                            </span>
                            <button
                                type="button"
                                onClick={() => void handleRefresh()}
                                disabled={isSyncing}
                                title="Sinkronkan laporan keuangan sekarang"
                                className="inline-flex size-6 cursor-pointer items-center justify-center rounded-lg border border-[#E8DFC8] bg-[#FFFDF9] text-[#5B4126] transition-colors hover:bg-[#F5EEDC] disabled:opacity-50"
                            >
                                <RefreshCw
                                    className={cn(
                                        'size-3',
                                        isSyncing && 'animate-spin',
                                    )}
                                />
                            </button>
                        </div>
                    </div>

                    <StatGrid>
                        <Panel className="p-4">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-[11px] font-bold tracking-wide text-[#78716C] uppercase">
                                    Omzet Bersih Periode
                                </p>
                                <GrowthBadge
                                    percent={period.period_growth_percent}
                                />
                            </div>
                            <p className="mt-2 font-mono text-2xl font-black tracking-tight text-[#18181B] tabular-nums">
                                {formatRupiah(period.net_revenue)}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-[#78716C]">
                                <span>
                                    {period.paid_transactions_count} lunas
                                </span>
                                <span>•</span>
                                <span>{period.items_sold} porsi terjual</span>
                            </div>
                        </Panel>

                        <Panel className="p-4">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-[11px] font-bold tracking-wide text-[#78716C] uppercase">
                                    Pembayaran Digital (QRIS)
                                </p>
                                <StatusPill tone="brand">
                                    {digitalShare}% pangsa
                                </StatusPill>
                            </div>
                            <p className="mt-2 font-mono text-2xl font-black tracking-tight text-[#C52828] tabular-nums">
                                {formatRupiah(digitalRevenue)}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-[#78716C]">
                                <span>{digitalCount} transaksi lunas</span>
                                <span>•</span>
                                <span>QRIS</span>
                            </div>
                        </Panel>

                        <Panel className="p-4">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-[11px] font-bold tracking-wide text-[#78716C] uppercase">
                                    Tunai Kasir & Rata-rata
                                </p>
                                <StatusPill tone="neutral">
                                    AOV{' '}
                                    {formatCompactRupiah(
                                        period.average_order_value,
                                    )}
                                </StatusPill>
                            </div>
                            <p className="mt-2 font-mono text-2xl font-black tracking-tight text-[#18181B] tabular-nums">
                                {formatRupiah(cashRevenue)}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-[#78716C]">
                                <span>
                                    {cashCount} lunas ({cashShare}%)
                                </span>
                                <span>•</span>
                                <span>Tunai Laci Kasir</span>
                            </div>
                        </Panel>

                        <Panel className="border-[#DFCFA9] bg-gradient-to-br from-[#FFFDF9] to-[#FAF5E8] p-4">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-[11px] font-bold tracking-wide text-[#78716C] uppercase">
                                    Menunggu Bayar & Batal
                                </p>
                                <StatusPill
                                    tone={
                                        period.pending_payments_count > 0
                                            ? 'warning'
                                            : 'success'
                                    }
                                >
                                    {period.pending_payments_count} unpaid
                                </StatusPill>
                            </div>
                            <p
                                className={cn(
                                    'mt-2 font-mono text-2xl font-black tracking-tight tabular-nums',
                                    period.pending_payments_count > 0
                                        ? 'text-[#B45309]'
                                        : 'text-[#15803D]',
                                )}
                            >
                                {formatRupiah(period.pending_payments_amount)}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-[#78716C]">
                                <span>
                                    Batal / Gagal: {failedOrCancelledCount} (
                                    {formatCompactRupiah(
                                        failedOrCancelledAmount,
                                    )}
                                    )
                                </span>
                            </div>
                        </Panel>
                    </StatGrid>
                </div>

                {/* Sub-Navigasi 2 Tab + Tombol Basis Perhitungan */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <FilterTabs<FinanceTab>
                        value={activeTab}
                        onChange={handleTabChange}
                        options={[
                            {
                                value: 'rekap',
                                label: 'Rekapitulasi & Performa Menu',
                            },
                            {
                                value: 'rekonsiliasi',
                                label: 'Rekonsiliasi & Buku Besar',
                                count: filtered_table_totals.count,
                            },
                        ]}
                    />

                    <button
                        type="button"
                        onClick={() => setShowRules((prev) => !prev)}
                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-[#E8DFC8] bg-[#FFFDF9] px-3 text-xs font-bold text-[#5B4126] hover:bg-[#FAF6EC]"
                    >
                        <Info className="size-3.5 text-[#C52828]" />
                        <span>
                            {showRules
                                ? 'Tutup Basis Perhitungan'
                                : 'Basis Perhitungan'}
                        </span>
                    </button>
                </div>

                {showRules && (
                    <Panel className="border-[#DFCFA9] bg-[#FAF5E8] p-4 text-xs text-[#3F2D1C]">
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            <div>
                                <p className="font-extrabold text-[#18181B]">
                                    Rumus Pendapatan Bersih:
                                </p>
                                <p className="mt-0.5 text-[11.5px]">
                                    {calculation_rules.realized_revenue_formula}
                                </p>
                                <p className="mt-1 text-[11.5px]">
                                    {calculation_rules.profit_disclaimer}
                                </p>
                            </div>
                            <div>
                                <p className="font-extrabold text-[#18181B]">
                                    Basis Tanggal & Kebijakan Unpaid:
                                </p>
                                <p className="mt-0.5 text-[11.5px]">
                                    • {calculation_rules.transaction_date_basis}
                                </p>
                                <p className="mt-0.5 text-[11.5px]">
                                    • {calculation_rules.unpaid_policy}
                                </p>
                            </div>
                        </div>
                    </Panel>
                )}

                {activeTab === 'rekap' && (
                    <RecapProfitabilityTab
                        recaps={recaps}
                        productAnalytics={product_analytics}
                        initialRecapView={filters.recap_view ?? 'daily'}
                        onDrilldownDate={(dateKey) => {
                            handleTabChange('rekonsiliasi');
                            navigateFilters({
                                filter_date: dateKey,
                                page: 1,
                            });
                        }}
                    />
                )}

                {activeTab === 'rekonsiliasi' && (
                    <ReconciliationLedgerTab
                        summary={summary}
                        operationalAnalytics={operational_analytics}
                        transactions={transactions}
                        filteredTableTotals={filtered_table_totals}
                        availableMenus={available_menus}
                        filters={filters}
                        onApplyLedgerFilters={(overrides) =>
                            navigateFilters(overrides)
                        }
                    />
                )}
            </AdminPage>
        </>
    );
}

FinancialReportsIndex.layout = {
    breadcrumbs: [
        {
            title: 'Ringkasan',
            href: '/dashboard',
        },
        {
            title: 'Pengelolaan Keuangan',
            href: '/admin/financial-reports',
        },
    ] as BreadcrumbItem[],
};
