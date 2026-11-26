import { Head, Link, router } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    BarChart3,
    CheckCircle2,
    Clock,
    CreditCard,
    Layers,
    MapPin,
    Package,
    RefreshCw,
    ShieldAlert,
    SlidersHorizontal,
    Store,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AdminPage,
    PageHeader,
    Panel,
    StatGrid,
    StatusPill,
} from '@/components/admin/admin-ui';
import DateRangeFilterModal from '@/components/admin/financial/DateRangeFilterModal';
import {
    formatCompactRupiah,
    formatRupiah,
    type FinancialChart,
    type FinancialSummary,
    type ReportFilters,
    type TopMenuEntry,
} from '@/components/admin/financial/financial-types';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { cn } from '@/lib/utils';
import { dashboard } from '@/routes';
import type { BreadcrumbItem } from '@/types';

interface OperationalSnapshot {
    in_kitchen: number;
    ready_for_pickup: number;
    completed_today: number;
    pending_payments: number;
    total_tables: number;
    occupied_tables: number;
    occupancy_rate: number;
}

interface AlertsSnapshot {
    expired_stock_count?: number;
    expired_stock_menus?: {
        id: number;
        name: string;
        stock_quantity: number;
        stock_valid_days: number;
        stock_updated_at_label?: string | null;
        stock_valid_until_label?: string | null;
    }[];
    low_stock_menus: {
        id: number;
        name: string;
        stock_quantity: number;
        stock_valid_days?: number;
    }[];
    menus_missing_cost_count: number;
}

interface SystemSnapshot {
    cafe_name: string;
    is_ordering_enabled: boolean;
    is_location_restricted: boolean;
    is_enforcement_active: boolean;
    access_radius_meters: number;
    allow_cash_payment: boolean;
    allow_digital_payment?: boolean;
    payment_expiry_minutes: number;
    gateway_label: string;
    gateway_mode: string;
    gateway_configured: boolean;
    digital_pending_payments: number;
    failed_payments_recent: number;
}

interface HourlyTrackingPoint {
    hour: string;
    revenue: number;
    orders_count: number;
    is_peak: boolean;
}

interface HourlyTrackingPayload {
    hours: HourlyTrackingPoint[];
    peak_hour: string | null;
    max_revenue: number;
}

interface TrackingBarItem {
    key: string;
    primaryLabel: string;
    secondaryLabel?: string;
    shortLabel: string;
    fullLabel: string;
    revenue: number;
    ordersCount: number;
    itemsSold?: number;
    isPeak: boolean;
    isToday?: boolean;
}

interface DashboardProps {
    filters: ReportFilters;
    summary: FinancialSummary;
    chart: FinancialChart;
    hourly_tracking?: HourlyTrackingPayload | null;
    top_menus: TopMenuEntry[];
    operational: OperationalSnapshot;
    alerts: AlertsSnapshot;
    system_snapshot: SystemSnapshot;
    synced_at: string;
}

function GrowthChip({
    percent,
    inverse = false,
}: {
    percent: number;
    inverse?: boolean;
}) {
    const isPositive = percent > 0;
    const isZero = percent === 0;
    const good = inverse ? !isPositive : isPositive;

    if (isZero) {
        return (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-[#F5EEDC] px-2 py-0.5 text-[10px] font-bold text-[#78716C]">
                0% vs pembanding
            </span>
        );
    }

    return (
        <span
            className={cn(
                'inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[10px] font-extrabold',
                good
                    ? 'bg-[#DCFCE7] text-[#15803D]'
                    : 'bg-[#FEE2E2] text-[#B91C1C]',
            )}
        >
            {isPositive ? (
                <ArrowUpRight className="size-3" />
            ) : (
                <ArrowDownRight className="size-3" />
            )}
            {isPositive ? '+' : ''}
            {percent.toFixed(1)}%
        </span>
    );
}

const SHORT_MONTH_MAP: Record<string, string> = {
    '01': 'Jan',
    '02': 'Feb',
    '03': 'Mar',
    '04': 'Apr',
    '05': 'Mei',
    '06': 'Jun',
    '07': 'Jul',
    '08': 'Agu',
    '09': 'Sep',
    '10': 'Okt',
    '11': 'Nov',
    '12': 'Des',
};

export default function Dashboard({
    filters: initialFilters,
    summary: initialSummary,
    chart: initialChart,
    hourly_tracking: initialHourlyTracking,
    top_menus: initialTopMenus,
    operational: initialOperational,
    alerts: initialAlerts,
    system_snapshot: initialSystemSnapshot,
    synced_at: initialSyncedAt,
}: DashboardProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);

    const [liveData, setLiveData] = useState<DashboardProps>({
        filters: initialFilters,
        summary: initialSummary,
        chart: initialChart,
        hourly_tracking: initialHourlyTracking,
        top_menus: initialTopMenus,
        operational: initialOperational,
        alerts: initialAlerts,
        system_snapshot: initialSystemSnapshot,
        synced_at: initialSyncedAt,
    });

    useEffect(() => {
        setLiveData({
            filters: initialFilters,
            summary: initialSummary,
            chart: initialChart,
            hourly_tracking: initialHourlyTracking,
            top_menus: initialTopMenus,
            operational: initialOperational,
            alerts: initialAlerts,
            system_snapshot: initialSystemSnapshot,
            synced_at: initialSyncedAt,
        });
    }, [
        initialFilters,
        initialSummary,
        initialChart,
        initialHourlyTracking,
        initialTopMenus,
        initialOperational,
        initialAlerts,
        initialSystemSnapshot,
        initialSyncedAt,
    ]);

    const {
        filters,
        summary,
        chart,
        hourly_tracking,
        top_menus,
        operational,
        alerts,
        system_snapshot,
        synced_at,
    } = liveData;

    const syncUrl = useMemo(() => {
        const params = new URLSearchParams({
            scope: 'dashboard',
            preset: filters.preset,
            start_date: filters.start_date,
            end_date: filters.end_date,
            compare_mode: filters.compare_mode,
            aggregation: filters.aggregation,
        });
        if (filters.compare_start_date) {
            params.set('compare_start_date', filters.compare_start_date);
        }
        if (filters.compare_end_date) {
            params.set('compare_end_date', filters.compare_end_date);
        }

        return `/dashboard/sync?${params.toString()}`;
    }, [
        filters.preset,
        filters.start_date,
        filters.end_date,
        filters.compare_mode,
        filters.compare_start_date,
        filters.compare_end_date,
        filters.aggregation,
    ]);

    const handleRealtimeData = useCallback(
        (payload: Partial<DashboardProps>) => {
            if (!payload?.summary || !payload?.chart) {
                return;
            }

            setLiveData((prev) => ({
                filters: payload.filters ?? prev.filters,
                summary: payload.summary ?? prev.summary,
                chart: payload.chart ?? prev.chart,
                hourly_tracking:
                    payload.hourly_tracking !== undefined
                        ? payload.hourly_tracking
                        : prev.hourly_tracking,
                top_menus: payload.top_menus ?? prev.top_menus,
                operational: payload.operational ?? prev.operational,
                alerts: payload.alerts ?? prev.alerts,
                system_snapshot:
                    payload.system_snapshot ?? prev.system_snapshot,
                synced_at: payload.synced_at ?? prev.synced_at,
            }));
        },
        [],
    );

    const { isAutoSync, toggleAutoSync, isSyncing, syncNow } = useRealtimeSync<
        Partial<DashboardProps>
    >({
        syncUrl,
        intervalMs: 3000,
        onData: handleRealtimeData,
    });

    const period = summary.period;
    const cashFlow = period.cash_flow;

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

    const cashRevenue = manualGateway?.net_revenue ?? cashFlow.inflow_cash;
    const cashCount = manualGateway?.transactions_count ?? 0;
    const cashShare = manualGateway?.revenue_share_percent ?? 0;

    const failedOrCancelledCount =
        period.failed_or_cancelled_count ??
        period.cancelled_orders_count + period.failed_payments_count;
    const failedOrCancelledAmount =
        period.failed_or_cancelled_amount ?? period.cancelled_amount;

    const visitWithFilters = (overrides: Record<string, string>) => {
        const query: Record<string, string> = {
            preset: filters.preset,
            start_date: filters.start_date,
            end_date: filters.end_date,
            compare_mode: filters.compare_mode,
            aggregation: filters.aggregation,
            ...overrides,
        };
        if (filters.compare_start_date) {
            query.compare_start_date = filters.compare_start_date;
        }
        if (filters.compare_end_date) {
            query.compare_end_date = filters.compare_end_date;
        }

        setPinnedIndex(null);
        setHoveredIndex(null);

        router.get('/dashboard', query, {
            preserveState: true,
            preserveScroll: true,
        });
    };

    const handleRefresh = async () => {
        const ok = await syncNow();
        if (!ok) {
            router.reload();
        }
    };

    const isSingleDayMode =
        (filters.preset === 'today' || filters.preset === 'yesterday') &&
        (hourly_tracking?.hours?.length ?? 0) > 0;

    const todayIso = new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Jakarta',
    });

    const trackingBars = useMemo<TrackingBarItem[]>(() => {
        if (isSingleDayMode && hourly_tracking?.hours) {
            return hourly_tracking.hours.map((h) => ({
                key: h.hour,
                primaryLabel: h.hour.slice(0, 2),
                secondaryLabel: ':00',
                shortLabel: h.hour,
                fullLabel: `Pukul ${h.hour} WIB (${filters.preset === 'today' ? 'Hari Ini' : 'Kemarin'})`,
                revenue: h.revenue,
                ordersCount: h.orders_count,
                isPeak: h.is_peak,
            }));
        }

        const dataPoints = chart.data || [];
        const maxRev = Math.max(0, ...dataPoints.map((d) => d.net_revenue));

        return dataPoints.map((pt) => {
            const isDailyIso =
                chart.aggregation === 'daily' &&
                /^\d{4}-\d{2}-\d{2}$/.test(pt.key);
            let primaryLabel = pt.label;
            let secondaryLabel: string | undefined;

            if (isDailyIso) {
                const [, mStr, dStr] = pt.key.split('-');
                primaryLabel = dStr;
                secondaryLabel = SHORT_MONTH_MAP[mStr] ?? '';
            }

            return {
                key: pt.key,
                primaryLabel,
                secondaryLabel,
                shortLabel: pt.label,
                fullLabel: pt.full_label,
                revenue: pt.net_revenue,
                ordersCount: pt.paid_orders_count,
                itemsSold: pt.items_sold,
                isPeak: maxRev > 0 && pt.net_revenue === maxRev,
                isToday: isDailyIso && pt.key === todayIso,
            };
        });
    }, [
        isSingleDayMode,
        hourly_tracking,
        chart.data,
        chart.aggregation,
        filters.preset,
        todayIso,
    ]);

    const trackingPeakValue = useMemo(() => {
        const maxVal = Math.max(0, ...trackingBars.map((b) => b.revenue));
        return Math.max(1, maxVal);
    }, [trackingBars]);

    const trackingTotalRevenue = useMemo(() => {
        if (isSingleDayMode) {
            return trackingBars.reduce((acc, b) => acc + b.revenue, 0);
        }
        return chart.total_revenue;
    }, [isSingleDayMode, trackingBars, chart.total_revenue]);

    const trackingTotalOrders = useMemo(() => {
        if (isSingleDayMode) {
            return trackingBars.reduce((acc, b) => acc + b.ordersCount, 0);
        }
        return chart.total_paid_orders;
    }, [isSingleDayMode, trackingBars, chart.total_paid_orders]);

    const peakBar = useMemo(
        () => trackingBars.find((b) => b.isPeak && b.revenue > 0) ?? null,
        [trackingBars],
    );

    const activeIndex = hoveredIndex ?? pinnedIndex;
    const activeBar =
        activeIndex !== null && trackingBars[activeIndex]
            ? trackingBars[activeIndex]
            : null;

    const expiredStockCount = alerts.expired_stock_count ?? 0;
    const expiredStockMenus = alerts.expired_stock_menus ?? [];

    const hasAlerts =
        expiredStockCount > 0 ||
        alerts.low_stock_menus.length > 0 ||
        system_snapshot.failed_payments_recent > 0 ||
        !system_snapshot.is_ordering_enabled;

    return (
        <>
            <Head title="Ringkasan • Admin Café SIDE LINE" />

            <AdminPage>
                <PageHeader
                    icon={BarChart3}
                    title="Ringkasan Eksekutif"
                    description={`Rekap pendapatan online & status ${system_snapshot.cafe_name} • Update ${synced_at}`}
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
                                    visitWithFilters({
                                        preset: params.preset,
                                        start_date: params.start_date ?? '',
                                        end_date: params.end_date ?? '',
                                        aggregation: 'auto',
                                        compare_mode:
                                            params.compare_mode ??
                                            'previous_period',
                                        compare_start_date:
                                            params.compare_start_date ?? '',
                                        compare_end_date:
                                            params.compare_end_date ?? '',
                                    })
                                }
                            />

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
                                onClick={() => void handleRefresh()}
                                disabled={isSyncing}
                                className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 text-xs font-bold whitespace-nowrap text-[#3F2D1C] shadow-2xs transition-colors hover:bg-[#F5EEDC] disabled:opacity-50"
                            >
                                <RefreshCw
                                    className={cn(
                                        'size-3.5 text-[#5B4126]',
                                        isSyncing && 'animate-spin',
                                    )}
                                />
                                <span>Refresh</span>
                            </button>

                            <Link
                                href="/admin/financial-reports"
                                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#C52828] px-3.5 text-xs font-bold whitespace-nowrap text-white shadow-sm transition-colors hover:bg-[#B02222]"
                            >
                                <Wallet className="size-3.5" />
                                <span>Pengelolaan Keuangan</span>
                                <ArrowRight className="size-3.5" />
                            </Link>
                        </>
                    }
                />

                {/* Bar Status Sistem & Operasional Live (Pintu Pintas ke Manajemen Sistem & Meja) */}
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                    <Link
                        href="/admin/location-settings?tab=profile"
                        className="flex items-center justify-between gap-2.5 rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] px-3.5 py-3 transition-colors hover:border-[#DFCFA9] hover:bg-[#FAF6EC]"
                    >
                        <div className="flex min-w-0 items-center gap-2.5">
                            <div
                                className={cn(
                                    'flex size-8 shrink-0 items-center justify-center rounded-xl',
                                    system_snapshot.is_ordering_enabled
                                        ? 'bg-[#DCFCE7] text-[#15803D]'
                                        : 'bg-[#FEE2E2] text-[#B91C1C]',
                                )}
                            >
                                <Store className="size-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-[10px] font-bold tracking-wider text-[#78716C] uppercase">
                                    Pemesanan QR
                                </p>
                                <p className="truncate text-xs font-extrabold text-[#18181B]">
                                    {system_snapshot.is_ordering_enabled
                                        ? 'Buka (Aktif)'
                                        : 'Ditutup'}
                                </p>
                            </div>
                        </div>
                    </Link>

                    <Link
                        href="/admin/location-settings?tab=geofencing"
                        className="flex items-center justify-between gap-2.5 rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] px-3.5 py-3 transition-colors hover:border-[#DFCFA9] hover:bg-[#FAF6EC]"
                    >
                        <div className="flex min-w-0 items-center gap-2.5">
                            <div
                                className={cn(
                                    'flex size-8 shrink-0 items-center justify-center rounded-xl',
                                    system_snapshot.is_enforcement_active
                                        ? 'bg-[#DCFCE7] text-[#15803D]'
                                        : 'bg-[#F5EEDC] text-[#5B4126]',
                                )}
                            >
                                <MapPin className="size-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-[10px] font-bold tracking-wider text-[#78716C] uppercase">
                                    Geofencing GPS
                                </p>
                                <p className="truncate text-xs font-extrabold text-[#18181B]">
                                    {system_snapshot.is_enforcement_active
                                        ? `Aktif (${system_snapshot.access_radius_meters} m)`
                                        : system_snapshot.is_location_restricted
                                          ? 'Titik Belum Diisi'
                                          : 'Nonaktif'}
                                </p>
                            </div>
                        </div>
                    </Link>

                    <Link
                        href="/admin/location-settings?tab=gateway"
                        className="flex items-center justify-between gap-2.5 rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] px-3.5 py-3 transition-colors hover:border-[#DFCFA9] hover:bg-[#FAF6EC]"
                    >
                        <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#FDECEC] text-[#C52828]">
                                <CreditCard className="size-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-[10px] font-bold tracking-wider text-[#78716C] uppercase">
                                    Gateway Pembayaran
                                </p>
                                <p className="truncate text-xs font-extrabold text-[#18181B]">
                                    {system_snapshot.gateway_label}
                                </p>
                            </div>
                        </div>
                    </Link>

                    <Link
                        href="/admin/tables"
                        className="flex items-center justify-between gap-2.5 rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] px-3.5 py-3 transition-colors hover:border-[#DFCFA9] hover:bg-[#FAF6EC]"
                    >
                        <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#F5EEDC] text-[#5B4126]">
                                <Layers className="size-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-[10px] font-bold tracking-wider text-[#78716C] uppercase">
                                    Okupansi Meja
                                </p>
                                <p className="truncate text-xs font-extrabold text-[#18181B]">
                                    {operational.occupied_tables} /{' '}
                                    {operational.total_tables} Terisi (
                                    {operational.occupancy_rate}%)
                                </p>
                            </div>
                        </div>
                    </Link>
                </div>

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
                                title="Sinkronkan 4 kartu & grafik sekarang"
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
                                <GrowthChip
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
                            <div className="mt-2 border-t border-[#EFE5CF] pt-2 text-[10px] font-semibold text-[#8C7A6B]">
                                Hari ini: {formatRupiah(summary.today_revenue)}{' '}
                                ({summary.today_paid_count} lunas)
                            </div>
                        </Panel>

                        <Panel className="p-4">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-[11px] font-bold tracking-wide text-[#78716C] uppercase">
                                    Pembayaran Digital
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
                                <span>Non-Tunai</span>
                            </div>
                            <div className="mt-2 border-t border-[#EFE5CF] pt-2 text-[10px] font-semibold text-[#8C7A6B]">
                                Status: {summary.gateway_integration.mode}
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
                            <div className="mt-2 border-t border-[#EFE5CF] pt-2 text-[10px] font-semibold text-[#8C7A6B]">
                                Selesai: {period.completed_orders_count} dari{' '}
                                {period.total_orders_count} pesanan
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
                                <span>Tagihan belum lunas</span>
                            </div>
                            <div className="mt-2 border-t border-[#EFE5CF] pt-2 text-[10px] font-semibold text-[#8C7A6B]">
                                Batal / Gagal: {failedOrCancelledCount} pesanan
                                ({formatCompactRupiah(failedOrCancelledAmount)})
                            </div>
                        </Panel>
                    </StatGrid>
                </div>

                {/* Tracking Pendapatan (Diagram Batang Ringkas Ber-Tanggal) */}
                <Panel className="p-4 sm:p-5">
                    <div className="flex flex-col gap-2.5 border-b border-[#E8DFC8] pb-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="font-heading text-base font-extrabold text-[#18181B]">
                                    Tracking Pendapatan
                                </h2>
                                <StatusPill tone="brand">
                                    {filters.period_label}
                                </StatusPill>
                                <button
                                    type="button"
                                    onClick={toggleAutoSync}
                                    title={
                                        isAutoSync
                                            ? 'Grafik tersinkronisasi real-time — klik untuk menjeda'
                                            : 'Sinkronisasi dijeda — klik untuk mengaktifkan'
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
                                            ? `Live • ${synced_at}`
                                            : 'Live Dijeda'}
                                    </span>
                                </button>
                            </div>
                            <p className="mt-0.5 text-xs font-medium text-[#78716C]">
                                {isSingleDayMode
                                    ? 'Diagram batang pendapatan per jam operasional (WIB) — arahkan kursor atau klik batang untuk detail.'
                                    : 'Diagram batang pendapatan harian/periode — setiap batang menampilkan tanggalnya.'}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {isSingleDayMode ? (
                                <StatusPill tone="neutral" icon={Clock}>
                                    Tracking Per Jam (WIB)
                                </StatusPill>
                            ) : (
                                <div className="inline-flex rounded-xl border border-[#E8DFC8] bg-[#FAF6EC] p-0.5">
                                    {(
                                        ['daily', 'weekly', 'monthly'] as const
                                    ).map((agg) => (
                                        <button
                                            key={agg}
                                            type="button"
                                            onClick={() =>
                                                visitWithFilters({
                                                    aggregation: agg,
                                                })
                                            }
                                            className={cn(
                                                'h-7 cursor-pointer rounded-lg px-2.5 text-[11px] font-bold transition-colors',
                                                chart.aggregation === agg
                                                    ? 'bg-[#C52828] text-white'
                                                    : 'text-[#78716C] hover:text-[#18181B]',
                                            )}
                                        >
                                            {agg === 'daily'
                                                ? 'Harian'
                                                : agg === 'weekly'
                                                  ? 'Mingguan'
                                                  : 'Bulanan'}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {trackingBars.length === 0 ? (
                        <div className="py-8 text-center text-xs font-semibold text-[#78716C]">
                            Tidak ada rentang tanggal yang tersedia untuk
                            ditampilkan.
                        </div>
                    ) : (
                        <div className="mt-3 space-y-2.5">
                            {/* Strip Legenda & Ringkasan / Detail Bar Aktif */}
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EFE5CF] bg-[#FAF6EC]/80 px-3.5 py-2 text-xs">
                                <div className="flex flex-wrap items-center gap-3.5">
                                    <span className="inline-flex items-center gap-1.5 font-bold text-[#18181B]">
                                        <span className="size-2.5 rounded-none bg-[#C52828]" />
                                        Omzet Lunas
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#78716C]">
                                        <span className="size-2.5 rounded-none bg-[#991B1B]" />
                                        Puncak Periode
                                    </span>
                                </div>

                                <div className="font-mono text-xs font-bold text-[#3F2D1C]">
                                    {activeBar ? (
                                        <span>
                                            {activeBar.fullLabel}:{' '}
                                            <strong className="text-[#C52828]">
                                                {formatRupiah(
                                                    activeBar.revenue,
                                                )}
                                            </strong>{' '}
                                            ({activeBar.ordersCount} lunas
                                            {activeBar.itemsSold !== undefined
                                                ? ` • ${activeBar.itemsSold} porsi`
                                                : ''}
                                            )
                                        </span>
                                    ) : (
                                        <span>
                                            Total:{' '}
                                            <strong className="text-[#18181B]">
                                                {formatRupiah(
                                                    trackingTotalRevenue,
                                                )}
                                            </strong>{' '}
                                            ({trackingTotalOrders} lunas)
                                            {peakBar && (
                                                <span className="ml-2 text-[#C52828]">
                                                    • Puncak:{' '}
                                                    {peakBar.shortLabel} (
                                                    {formatCompactRupiah(
                                                        peakBar.revenue,
                                                    )}
                                                    )
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Diagram Batang Klasik (Skala Y, Grid Horizontal, Batang Kotak Tanpa Rounded, Tanggal di Bawah Tiap Batang) */}
                            {(() => {
                                const hasAnyRevenue = trackingBars.some(
                                    (b) => b.revenue > 0,
                                );
                                const nonZeroCount = trackingBars.filter(
                                    (b) => b.revenue > 0,
                                ).length;

                                return (
                                    <div className="rounded-xl border border-[#EFE5CF] bg-[#FFFDF9] px-3 pt-3 pb-2.5">
                                        <div className="flex items-start">
                                            {/* Skala Sumbu Y Kiri */}
                                            <div className="mt-5 mb-8 flex h-40 w-16 shrink-0 flex-col justify-between pr-2.5 text-right font-mono text-[10px] font-semibold text-[#8C7A6B]">
                                                <span>
                                                    {hasAnyRevenue
                                                        ? formatCompactRupiah(
                                                              trackingPeakValue,
                                                          )
                                                        : '-'}
                                                </span>
                                                <span>
                                                    {hasAnyRevenue
                                                        ? formatCompactRupiah(
                                                              trackingPeakValue /
                                                                  2,
                                                          )
                                                        : '-'}
                                                </span>
                                                <span>Rp 0</span>
                                            </div>

                                            {/* Area Plot + Batang + Label Sumbu X */}
                                            <div className="flex-1 overflow-x-auto pb-1">
                                                <div className="relative min-w-fit pt-5">
                                                    {/* Garis Bantu Horizontal & Garis Dasar Sumbu X */}
                                                    <div className="pointer-events-none absolute inset-x-0 top-5 h-40">
                                                        <div className="absolute inset-x-0 top-0 border-t border-dashed border-[#E8DFC8]" />
                                                        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-[#E8DFC8]" />
                                                        <div className="absolute inset-x-0 bottom-0 border-b-2 border-[#D6C7A3]" />
                                                    </div>

                                                    {/* Deretan Batang */}
                                                    <div className="relative z-10 flex items-start gap-1 px-1">
                                                        {trackingBars.map(
                                                            (bar, idx) => {
                                                                const hasRevenue =
                                                                    bar.revenue >
                                                                    0;
                                                                const rawPct =
                                                                    hasRevenue
                                                                        ? (bar.revenue /
                                                                              trackingPeakValue) *
                                                                          100
                                                                        : 0;
                                                                const isActive =
                                                                    hoveredIndex ===
                                                                        idx ||
                                                                    pinnedIndex ===
                                                                        idx;
                                                                const showBarLabel =
                                                                    hasRevenue &&
                                                                    (isActive ||
                                                                        bar.isPeak ||
                                                                        nonZeroCount <=
                                                                            10);
                                                                const minWidthClass =
                                                                    isSingleDayMode
                                                                        ? 'min-w-[38px]'
                                                                        : chart.aggregation ===
                                                                            'daily'
                                                                          ? trackingBars.length <=
                                                                            16
                                                                              ? 'min-w-[38px]'
                                                                              : 'min-w-[28px]'
                                                                          : 'min-w-[68px]';
                                                                const barWidthClass =
                                                                    isSingleDayMode ||
                                                                    chart.aggregation ===
                                                                        'daily'
                                                                        ? 'w-4 sm:w-5'
                                                                        : 'w-10 sm:w-12';

                                                                return (
                                                                    <button
                                                                        key={
                                                                            bar.key
                                                                        }
                                                                        type="button"
                                                                        onMouseEnter={() =>
                                                                            setHoveredIndex(
                                                                                idx,
                                                                            )
                                                                        }
                                                                        onMouseLeave={() =>
                                                                            setHoveredIndex(
                                                                                null,
                                                                            )
                                                                        }
                                                                        onClick={() =>
                                                                            setPinnedIndex(
                                                                                (
                                                                                    prev,
                                                                                ) =>
                                                                                    prev ===
                                                                                    idx
                                                                                        ? null
                                                                                        : idx,
                                                                            )
                                                                        }
                                                                        title={`${bar.fullLabel}: ${formatRupiah(bar.revenue)} (${bar.ordersCount} lunas)`}
                                                                        className={cn(
                                                                            'group flex flex-1 cursor-pointer flex-col items-center focus:outline-none',
                                                                            minWidthClass,
                                                                        )}
                                                                    >
                                                                        {/* Kolom Plot Batang (160px) */}
                                                                        <div
                                                                            className={cn(
                                                                                'relative flex h-40 w-full items-end justify-center transition-colors',
                                                                                isActive
                                                                                    ? 'bg-[#FDECEC]/65'
                                                                                    : 'group-hover:bg-[#FAF3E0]/75',
                                                                            )}
                                                                        >
                                                                            {hasRevenue ? (
                                                                                <div
                                                                                    style={{
                                                                                        height: `max(4px, ${rawPct.toFixed(2)}%)`,
                                                                                    }}
                                                                                    className={cn(
                                                                                        'relative rounded-none transition-all duration-200',
                                                                                        barWidthClass,
                                                                                        bar.isPeak
                                                                                            ? 'bg-[#991B1B]'
                                                                                            : 'bg-[#C52828]',
                                                                                        isActive &&
                                                                                            'brightness-110',
                                                                                    )}
                                                                                >
                                                                                    {showBarLabel && (
                                                                                        <span
                                                                                            className={cn(
                                                                                                'pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 font-mono text-[9px] font-extrabold whitespace-nowrap tabular-nums',
                                                                                                bar.isPeak ||
                                                                                                    isActive
                                                                                                    ? 'text-[#C52828]'
                                                                                                    : 'text-[#3F2D1C]',
                                                                                            )}
                                                                                        >
                                                                                            {formatCompactRupiah(
                                                                                                bar.revenue,
                                                                                            ).replace(
                                                                                                'Rp ',
                                                                                                '',
                                                                                            )}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            ) : null}
                                                                        </div>

                                                                        {/* Label Tanggal / Jam di Bawah Batang (Selalu Tampil) */}
                                                                        <div className="flex h-8 flex-col items-center justify-start pt-1.5 leading-none">
                                                                            <span
                                                                                className={cn(
                                                                                    'font-mono text-[10px] font-bold tracking-tight',
                                                                                    isActive ||
                                                                                        bar.isPeak ||
                                                                                        bar.isToday
                                                                                        ? 'font-black text-[#C52828]'
                                                                                        : hasRevenue
                                                                                          ? 'text-[#18181B]'
                                                                                          : 'text-[#78716C]',
                                                                                )}
                                                                            >
                                                                                {
                                                                                    bar.primaryLabel
                                                                                }
                                                                            </span>
                                                                            {bar.secondaryLabel && (
                                                                                <span className="mt-0.5 text-[8.5px] font-semibold text-[#8C7A6B]">
                                                                                    {
                                                                                        bar.secondaryLabel
                                                                                    }
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            },
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </Panel>

                {/* Bottom Grid: Top 5 Menu & Peringatan Sistem / Inventori */}
                <div className="grid gap-5 lg:grid-cols-2">
                    {/* Top 5 Menu */}
                    <Panel className="p-5">
                        <div className="flex items-center justify-between gap-2 border-b border-[#E8DFC8] pb-3.5">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="size-4 text-[#C52828]" />
                                <h3 className="font-heading text-sm font-extrabold text-[#18181B]">
                                    Top 5 Menu Terlaris Periode Ini
                                </h3>
                            </div>
                            <Link
                                href="/admin/financial-reports?tab=rekap"
                                className="text-xs font-bold text-[#C52828] hover:underline"
                            >
                                Rekap Menu Lengkap →
                            </Link>
                        </div>

                        {top_menus.length === 0 ? (
                            <p className="py-10 text-center text-xs font-medium text-[#78716C]">
                                Belum ada transaksi menu lunas pada periode
                                filter ini.
                            </p>
                        ) : (
                            <div className="mt-3 space-y-2.5">
                                {top_menus.map((menu, i) => (
                                    <div
                                        key={`${menu.menu_name}-${i}`}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-[#EFE5CF] bg-[#FAF6EC]/60 px-3.5 py-2.5"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-[#C52828] text-[11px] font-black text-white">
                                                {menu.rank ?? i + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-extrabold text-[#18181B]">
                                                    {menu.menu_name}
                                                </p>
                                                <p className="text-[10.5px] font-semibold text-[#78716C]">
                                                    {menu.total_qty} porsi
                                                    terjual
                                                    {menu.category_name
                                                        ? ` • ${menu.category_name}`
                                                        : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="font-mono text-xs font-black text-[#18181B]">
                                                {formatRupiah(
                                                    menu.total_revenue,
                                                )}
                                            </p>
                                            {menu.contribution_percent !==
                                                undefined && (
                                                <p className="text-[10px] font-bold text-[#78716C]">
                                                    {menu.contribution_percent}%
                                                    kontribusi
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>

                    {/* Peringatan Sistem & Layanan Pemesanan */}
                    <Panel className="p-5">
                        <div className="flex items-center justify-between gap-2 border-b border-[#E8DFC8] pb-3.5">
                            <div className="flex items-center gap-2">
                                <ShieldAlert className="size-4 text-[#B45309]" />
                                <h3 className="font-heading text-sm font-extrabold text-[#18181B]">
                                    Tindak Lanjut Sistem & Layanan
                                </h3>
                            </div>
                            <Link
                                href="/admin/location-settings"
                                className="inline-flex items-center gap-1 text-xs font-bold text-[#C52828] hover:underline"
                            >
                                <SlidersHorizontal className="size-3" />
                                Manajemen Sistem →
                            </Link>
                        </div>

                        <div className="mt-3 space-y-2.5">
                            {!hasAlerts && (
                                <div className="flex items-center gap-3 rounded-xl border border-[#BBF7D0] bg-[#DCFCE7]/60 p-3.5 text-xs font-semibold text-[#15803D]">
                                    <CheckCircle2 className="size-5 shrink-0" />
                                    <div>
                                        <p className="font-extrabold">
                                            Seluruh Sistem & Layanan Pemesanan
                                            Siap
                                        </p>
                                        <p className="text-[11px] opacity-85">
                                            Pemesanan QR buka, gateway aktif,
                                            dan stok menu aman.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {!system_snapshot.is_ordering_enabled && (
                                <Link
                                    href="/admin/location-settings?tab=profile"
                                    className="flex items-center justify-between gap-3 rounded-xl border border-[#FECACA] bg-[#FEE2E2]/60 p-3 text-xs text-[#991B1B] transition-colors hover:bg-[#FEE2E2]"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <AlertTriangle className="size-4 shrink-0" />
                                        <div>
                                            <p className="font-extrabold">
                                                Pemesanan Mandiri QR Sedang
                                                Ditutup
                                            </p>
                                            <p className="text-[11px]">
                                                Pelanggan tidak dapat membuat
                                                pesanan baru lewat meja QR.
                                            </p>
                                        </div>
                                    </div>
                                    <ArrowRight className="size-4 shrink-0" />
                                </Link>
                            )}

                            {expiredStockCount > 0 && (
                                <Link
                                    href="/admin/menus?filter=expired_stock"
                                    className="flex items-center justify-between gap-3 rounded-xl border border-[#FECACA] bg-[#FEE2E2]/70 p-3 text-xs text-[#991B1B] transition-colors hover:bg-[#FEE2E2]"
                                >
                                    <div className="flex items-start gap-2.5">
                                        <RefreshCw className="mt-0.5 size-4 shrink-0 text-[#C52828]" />
                                        <div>
                                            <p className="font-extrabold">
                                                Perlu Update Stok Harian (
                                                {expiredStockCount} Menu)
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-[#7F1D1D]">
                                                Otomatis tampil Habis di
                                                pelanggan:{' '}
                                                {expiredStockMenus
                                                    .map((m) => m.name)
                                                    .join(', ')}
                                                {expiredStockCount >
                                                expiredStockMenus.length
                                                    ? ` +${expiredStockCount - expiredStockMenus.length} lainnya`
                                                    : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <ArrowRight className="size-4 shrink-0" />
                                </Link>
                            )}

                            {alerts.low_stock_menus.length > 0 && (
                                <Link
                                    href="/admin/menus"
                                    className="flex items-center justify-between gap-3 rounded-xl border border-[#FDE68A] bg-[#FAF6EC] p-3 text-xs text-[#5B4126] transition-colors hover:bg-[#F5EEDC]"
                                >
                                    <div className="flex items-start gap-2.5">
                                        <Package className="mt-0.5 size-4 shrink-0 text-[#B45309]" />
                                        <div>
                                            <p className="font-extrabold text-[#18181B]">
                                                Stok Terbatas Menipis (
                                                {alerts.low_stock_menus.length}{' '}
                                                Menu)
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-[#78716C]">
                                                {alerts.low_stock_menus
                                                    .map(
                                                        (m) =>
                                                            `${m.name} (${m.stock_quantity} porsi)`,
                                                    )
                                                    .join(', ')}
                                            </p>
                                        </div>
                                    </div>
                                    <ArrowRight className="size-4 shrink-0" />
                                </Link>
                            )}

                            {system_snapshot.failed_payments_recent > 0 && (
                                <Link
                                    href="/admin/location-settings?tab=gateway"
                                    className="flex items-center justify-between gap-3 rounded-xl border border-[#E8DFC8] bg-[#FAF6EC] p-3 text-xs text-[#5B4126] transition-colors hover:bg-[#F5EEDC]"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <CreditCard className="size-4 shrink-0 text-[#C52828]" />
                                        <div>
                                            <p className="font-extrabold text-[#18181B]">
                                                {
                                                    system_snapshot.failed_payments_recent
                                                }{' '}
                                                Transaksi Gateway Gagal /
                                                Kedaluwarsa
                                            </p>
                                            <p className="text-[11px] text-[#78716C]">
                                                Pantau log gateway & masa
                                                berlaku QRIS di Manajemen
                                                Sistem.
                                            </p>
                                        </div>
                                    </div>
                                    <ArrowRight className="size-4 shrink-0" />
                                </Link>
                            )}

                            <div className="rounded-xl border border-[#EFE5CF] bg-[#FAF6EC]/70 p-3 text-[11px] text-[#78716C]">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>
                                        Metode Aktif:{' '}
                                        <strong className="text-[#18181B]">
                                            {[
                                                system_snapshot.allow_digital_payment &&
                                                    'Pembayaran Digital',
                                                system_snapshot.allow_cash_payment &&
                                                    'Tunai Kasir',
                                            ]
                                                .filter(Boolean)
                                                .join(' + ') || 'Nonaktif'}
                                        </strong>
                                    </span>
                                    <span>
                                        Expiry QRIS:{' '}
                                        <strong className="text-[#18181B]">
                                            {
                                                system_snapshot.payment_expiry_minutes
                                            }{' '}
                                            mnt
                                        </strong>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </Panel>
                </div>
            </AdminPage>
        </>
    );
}

Dashboard.layout = {
    breadcrumbs: [
        {
            title: 'Ringkasan',
            href: dashboard().url,
        },
    ] as BreadcrumbItem[],
};
