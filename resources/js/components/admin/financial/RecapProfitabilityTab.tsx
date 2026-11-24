import { CalendarDays, Coffee, Layers, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Panel, StatusPill } from '@/components/admin/admin-ui';
import {
    formatRupiah,
    type PeriodRecapRow,
    type TopMenuEntry,
} from '@/components/admin/financial/financial-types';
import { cn } from '@/lib/utils';

interface SlowMovingEntry {
    menu_id: number;
    menu_name: string;
    category_name: string;
    base_price: number;
    cost_price: number | null;
    total_qty: number;
    total_revenue: number;
    total_cogs: number;
    gross_profit: number;
    is_zero_sales: boolean;
}

interface CategoryPerformanceEntry {
    id: number;
    name: string;
    total_qty: number;
    total_revenue: number;
    total_cogs: number;
    gross_profit: number;
    margin_percent: number;
    menu_count: number;
    revenue_share_percent: number;
    qty_share_percent: number;
}

interface TodayOrderedEntry {
    menu_name: string;
    category_name: string;
    total_qty: number;
    paid_qty: number;
    unpaid_qty: number;
    total_amount: number;
    paid_revenue: number;
    unpaid_amount: number;
    orders_count: number;
}

interface ProductAnalyticsPayload {
    total_period_items_sold: number;
    total_period_menu_revenue: number;
    top_selling: TopMenuEntry[];
    highest_revenue: TopMenuEntry[];
    slow_moving: SlowMovingEntry[];
    categories: CategoryPerformanceEntry[];
    today_date_label: string;
    today_ordered_menus: TodayOrderedEntry[];
}

interface RecapsPayload {
    daily: { rows: PeriodRecapRow[]; totals: PeriodRecapRow };
    weekly: { rows: PeriodRecapRow[]; totals: PeriodRecapRow };
    monthly: { rows: PeriodRecapRow[]; totals: PeriodRecapRow };
}

interface RecapProfitabilityTabProps {
    recaps: RecapsPayload;
    productAnalytics: ProductAnalyticsPayload;
    initialRecapView?: 'daily' | 'weekly' | 'monthly';
    onDrilldownDate: (dateKey: string) => void;
}

export default function RecapProfitabilityTab({
    recaps,
    productAnalytics,
    initialRecapView = 'daily',
    onDrilldownDate,
}: RecapProfitabilityTabProps) {
    const [recapView, setRecapView] = useState<'daily' | 'weekly' | 'monthly'>(
        initialRecapView,
    );
    const [productView, setProductView] = useState<
        'top_selling' | 'highest_revenue' | 'slow_moving' | 'today_ordered'
    >('highest_revenue');

    const currentRecap = recaps[recapView] ?? recaps.daily;

    return (
        <div className="space-y-6">
            {/* Rekapitulasi Pendapatan Harian / Mingguan / Bulanan */}
            <Panel className="p-5">
                <div className="flex flex-col gap-3 border-b border-[#E8DFC8] pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                        <CalendarDays className="size-5 text-[#C52828]" />
                        <div>
                            <h2 className="font-heading text-base font-extrabold text-[#18181B]">
                                Rekapitulasi Pendapatan Periode
                            </h2>
                            <p className="text-xs font-medium text-[#78716C]">
                                Klik baris tanggal harian untuk menyaring
                                transaksi di tab Rekonsiliasi & Buku Besar.
                            </p>
                        </div>
                    </div>

                    <div className="inline-flex rounded-xl border border-[#E8DFC8] bg-[#FAF6EC] p-0.5">
                        {(['daily', 'weekly', 'monthly'] as const).map((v) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setRecapView(v)}
                                className={cn(
                                    'h-8 cursor-pointer rounded-lg px-3 text-xs font-bold transition-colors',
                                    recapView === v
                                        ? 'bg-[#C52828] text-white'
                                        : 'text-[#78716C] hover:text-[#18181B]',
                                )}
                            >
                                {v === 'daily'
                                    ? 'Harian'
                                    : v === 'weekly'
                                      ? 'Mingguan'
                                      : 'Bulanan'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-[#E8DFC8] bg-[#FAF6EC]/80 text-[10.5px] font-extrabold tracking-wider text-[#78716C] uppercase">
                                <th className="px-3 py-2.5">
                                    Periode / Tanggal
                                </th>
                                <th className="px-3 py-2.5 text-center">
                                    Pesanan
                                </th>
                                <th className="px-3 py-2.5 text-center">
                                    Lunas
                                </th>
                                <th className="px-3 py-2.5 text-center">
                                    Unpaid
                                </th>
                                <th className="px-3 py-2.5 text-center">
                                    Batal
                                </th>
                                <th className="px-3 py-2.5 text-center">
                                    Porsi
                                </th>
                                <th className="px-3 py-2.5 text-right">
                                    Omzet Bersih
                                </th>
                                <th className="px-3 py-2.5 text-right">
                                    Belum Bayar
                                </th>
                                <th className="px-3 py-2.5 text-right">AOV</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFE5CF]">
                            {currentRecap.rows.map((row, idx) => {
                                const rowKey =
                                    row.date ??
                                    row.week_key ??
                                    row.month_key ??
                                    String(idx);
                                const canDrill = Boolean(
                                    recapView === 'daily' && row.date,
                                );

                                return (
                                    <tr
                                        key={rowKey}
                                        onClick={() => {
                                            if (canDrill && row.date) {
                                                onDrilldownDate(row.date);
                                            }
                                        }}
                                        className={cn(
                                            'transition-colors',
                                            canDrill
                                                ? 'cursor-pointer hover:bg-[#FAF6EC]'
                                                : 'hover:bg-[#FAF6EC]/50',
                                        )}
                                    >
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-[#18181B]">
                                                    {row.label}
                                                </span>
                                                {row.is_peak && (
                                                    <StatusPill tone="success">
                                                        Peak
                                                    </StatusPill>
                                                )}
                                                {row.is_lowest && (
                                                    <StatusPill tone="warning">
                                                        Terendah
                                                    </StatusPill>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-center font-mono text-[#78716C]">
                                            {row.total_orders}
                                        </td>
                                        <td className="px-3 py-2.5 text-center font-mono font-bold text-[#15803D]">
                                            {row.paid_orders_count}
                                        </td>
                                        <td className="px-3 py-2.5 text-center font-mono text-[#B45309]">
                                            {row.unpaid_orders_count}
                                        </td>
                                        <td className="px-3 py-2.5 text-center font-mono text-[#78716C]">
                                            {row.cancelled_orders_count}
                                        </td>
                                        <td className="px-3 py-2.5 text-center font-mono text-[#78716C]">
                                            {row.items_sold}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap text-[#18181B]">
                                            {formatRupiah(row.net_revenue)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap text-[#B45309]">
                                            {row.unpaid_amount > 0
                                                ? formatRupiah(
                                                      row.unpaid_amount,
                                                  )
                                                : formatRupiah(0)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap text-[#78716C]">
                                            {formatRupiah(
                                                row.average_order_value,
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-[#DFCFA9] bg-[#FAF5E8] font-black text-[#18181B]">
                                <td className="px-3 py-3">TOTAL PERIODE</td>
                                <td className="px-3 py-3 text-center font-mono">
                                    {currentRecap.totals.total_orders}
                                </td>
                                <td className="px-3 py-3 text-center font-mono text-[#15803D]">
                                    {currentRecap.totals.paid_orders_count}
                                </td>
                                <td className="px-3 py-3 text-center font-mono text-[#B45309]">
                                    {currentRecap.totals.unpaid_orders_count}
                                </td>
                                <td className="px-3 py-3 text-center font-mono">
                                    {currentRecap.totals.cancelled_orders_count}
                                </td>
                                <td className="px-3 py-3 text-center font-mono">
                                    {currentRecap.totals.items_sold}
                                </td>
                                <td className="px-3 py-3 text-right font-mono whitespace-nowrap">
                                    {formatRupiah(
                                        currentRecap.totals.net_revenue,
                                    )}
                                </td>
                                <td className="px-3 py-3 text-right font-mono whitespace-nowrap text-[#B45309]">
                                    {formatRupiah(
                                        currentRecap.totals.unpaid_amount ?? 0,
                                    )}
                                </td>
                                <td className="px-3 py-3 text-right font-mono whitespace-nowrap">
                                    {formatRupiah(
                                        currentRecap.totals.average_order_value,
                                    )}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Panel>

            {/* Kontribusi Kategori & Performa Produk */}
            <div className="grid gap-5 lg:grid-cols-12">
                {/* Performa Kategori (5 cols) */}
                <Panel className="p-5 lg:col-span-5">
                    <div className="flex items-center gap-2 border-b border-[#E8DFC8] pb-3.5">
                        <Layers className="size-4 text-[#C52828]" />
                        <div>
                            <h3 className="font-heading text-sm font-extrabold text-[#18181B]">
                                Kontribusi Omzet per Kategori
                            </h3>
                            <p className="text-[11px] font-medium text-[#78716C]">
                                Volume porsi dan porsi omzet tiap kategori menu
                            </p>
                        </div>
                    </div>

                    <div className="mt-3 space-y-2.5">
                        {productAnalytics.categories.map((cat) => (
                            <div
                                key={cat.id}
                                className="rounded-xl border border-[#EFE5CF] bg-[#FAF6EC]/60 p-3"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-xs font-extrabold text-[#18181B]">
                                            {cat.name}
                                        </p>
                                        <p className="text-[10.5px] font-medium text-[#78716C]">
                                            {cat.total_qty} porsi (
                                            {cat.qty_share_percent}%) •{' '}
                                            {cat.menu_count} menu
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-mono text-xs font-black text-[#18181B]">
                                            {formatRupiah(cat.total_revenue)}
                                        </p>
                                        <p className="text-[10px] font-bold text-[#78716C]">
                                            {cat.revenue_share_percent}% pangsa
                                            omzet
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E8DFC8]">
                                    <div
                                        style={{
                                            width: `${Math.min(100, cat.revenue_share_percent)}%`,
                                        }}
                                        className="h-full rounded-full bg-[#C52828]"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </Panel>

                {/* Performa Menu (7 cols) */}
                <Panel className="p-5 lg:col-span-7">
                    <div className="flex flex-col gap-3 border-b border-[#E8DFC8] pb-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="size-4 text-[#C52828]" />
                            <div>
                                <h3 className="font-heading text-sm font-extrabold text-[#18181B]">
                                    Performa & Evaluasi Menu
                                </h3>
                                <p className="text-[11px] font-medium text-[#78716C]">
                                    Ranking omzet, volume, slow-moving, & menu
                                    hari ini
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap rounded-xl border border-[#E8DFC8] bg-[#FAF6EC] p-0.5">
                            {(
                                [
                                    ['highest_revenue', 'Omzet Tertinggi'],
                                    ['top_selling', 'Terlaris (Qty)'],
                                    ['slow_moving', 'Slow Moving'],
                                    ['today_ordered', 'Order Hari Ini'],
                                ] as const
                            ).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setProductView(key)}
                                    className={cn(
                                        'h-7 cursor-pointer rounded-lg px-2.5 text-[11px] font-bold transition-colors',
                                        productView === key
                                            ? 'bg-[#C52828] text-white'
                                            : 'text-[#78716C] hover:text-[#18181B]',
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-3 overflow-x-auto">
                        {(productView === 'highest_revenue' ||
                            productView === 'top_selling') && (
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-[#E8DFC8] text-[10.5px] font-extrabold text-[#78716C] uppercase">
                                        <th className="py-2 pr-2">#</th>
                                        <th className="px-2 py-2">Menu</th>
                                        <th className="px-2 py-2 text-center">
                                            Qty
                                        </th>
                                        <th className="px-2 py-2 text-right">
                                            Omzet
                                        </th>
                                        <th className="py-2 pl-2 text-right">
                                            Kontribusi
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#EFE5CF]">
                                    {(productView === 'highest_revenue'
                                        ? productAnalytics.highest_revenue
                                        : productAnalytics.top_selling
                                    ).map((item, i) => (
                                        <tr key={`${item.menu_name}-${i}`}>
                                            <td className="py-2 pr-2 font-mono font-bold text-[#8C7A6B]">
                                                {item.rank ?? i + 1}
                                            </td>
                                            <td className="px-2 py-2">
                                                <p className="font-bold text-[#18181B]">
                                                    {item.menu_name}
                                                </p>
                                                <p className="text-[10.5px] text-[#78716C]">
                                                    {item.category_name}
                                                </p>
                                            </td>
                                            <td className="px-2 py-2 text-center font-mono font-bold">
                                                {item.total_qty}
                                            </td>
                                            <td className="px-2 py-2 text-right font-mono font-bold text-[#18181B]">
                                                {formatRupiah(
                                                    item.total_revenue,
                                                )}
                                            </td>
                                            <td className="py-2 pl-2 text-right font-mono font-bold text-[#5B4126]">
                                                {(
                                                    item.contribution_percent ??
                                                    item.relative_percentage ??
                                                    0
                                                ).toFixed(1)}
                                                %
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {productView === 'slow_moving' && (
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-[#E8DFC8] text-[10.5px] font-extrabold text-[#78716C] uppercase">
                                        <th className="py-2 pr-2">
                                            Menu Aktif
                                        </th>
                                        <th className="px-2 py-2 text-right">
                                            Harga Jual
                                        </th>
                                        <th className="px-2 py-2 text-center">
                                            Terjual
                                        </th>
                                        <th className="px-2 py-2 text-right">
                                            Omzet
                                        </th>
                                        <th className="py-2 pl-2 text-right">
                                            Status
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#EFE5CF]">
                                    {productAnalytics.slow_moving.map((sm) => (
                                        <tr key={sm.menu_id}>
                                            <td className="py-2 pr-2">
                                                <p className="font-bold text-[#18181B]">
                                                    {sm.menu_name}
                                                </p>
                                                <p className="text-[10.5px] text-[#78716C]">
                                                    {sm.category_name}
                                                </p>
                                            </td>
                                            <td className="px-2 py-2 text-right font-mono">
                                                {formatRupiah(sm.base_price)}
                                            </td>
                                            <td className="px-2 py-2 text-center font-mono font-bold">
                                                {sm.total_qty}
                                            </td>
                                            <td className="px-2 py-2 text-right font-mono text-[#78716C]">
                                                {formatRupiah(sm.total_revenue)}
                                            </td>
                                            <td className="py-2 pl-2 text-right">
                                                <StatusPill
                                                    tone={
                                                        sm.is_zero_sales
                                                            ? 'danger'
                                                            : 'warning'
                                                    }
                                                >
                                                    {sm.is_zero_sales
                                                        ? '0 Terjual'
                                                        : 'Lambat'}
                                                </StatusPill>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {productView === 'today_ordered' && (
                            <div className="space-y-2">
                                <p className="text-[11px] font-bold text-[#78716C]">
                                    <Coffee className="mr-1 inline size-3.5 text-[#C52828]" />
                                    Menu Dipesan Hari Ini (
                                    {productAnalytics.today_date_label}):{' '}
                                    {
                                        productAnalytics.today_ordered_menus
                                            .length
                                    }{' '}
                                    menu
                                </p>
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-[#E8DFC8] text-[10.5px] font-extrabold text-[#78716C] uppercase">
                                            <th className="py-2 pr-2">Menu</th>
                                            <th className="px-2 py-2 text-center">
                                                Total Qty
                                            </th>
                                            <th className="px-2 py-2 text-center">
                                                Lunas / Unpaid
                                            </th>
                                            <th className="py-2 pl-2 text-right">
                                                Total Nilai
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#EFE5CF]">
                                        {productAnalytics.today_ordered_menus.map(
                                            (tm, i) => (
                                                <tr
                                                    key={`${tm.menu_name}-${i}`}
                                                >
                                                    <td className="py-2 pr-2">
                                                        <p className="font-bold text-[#18181B]">
                                                            {tm.menu_name}
                                                        </p>
                                                        <p className="text-[10.5px] text-[#78716C]">
                                                            {tm.category_name} •{' '}
                                                            {tm.orders_count}{' '}
                                                            pesanan
                                                        </p>
                                                    </td>
                                                    <td className="px-2 py-2 text-center font-mono font-bold">
                                                        {tm.total_qty}
                                                    </td>
                                                    <td className="px-2 py-2 text-center text-[11px]">
                                                        <span className="font-bold text-[#15803D]">
                                                            {tm.paid_qty}
                                                        </span>{' '}
                                                        /{' '}
                                                        <span className="font-bold text-[#B45309]">
                                                            {tm.unpaid_qty}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 pl-2 text-right font-mono font-bold">
                                                        {formatRupiah(
                                                            tm.total_amount,
                                                        )}
                                                    </td>
                                                </tr>
                                            ),
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </Panel>
            </div>
        </div>
    );
}
