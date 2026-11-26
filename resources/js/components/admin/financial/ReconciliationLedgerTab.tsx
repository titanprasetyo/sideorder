import { Link, router } from '@inertiajs/react';
import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Clock,
    CreditCard,
    Eye,
    FileText,
    RotateCcw,
    ShieldCheck,
    SlidersHorizontal,
    UserCheck,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    EmptyState,
    FormDialogHeader,
    Panel,
    SearchInput,
    StatusPill,
} from '@/components/admin/admin-ui';
import {
    formatRupiah,
    type FinancialSummary,
    type ReportFilters,
    type TransactionRecord,
} from '@/components/admin/financial/financial-types';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface OperationalAnalyticsPayload {
    pipeline: {
        completed_count: number;
        processing_count: number;
        ready_count: number;
        pending_count: number;
        cancelled_count: number;
        unpaid_count: number;
        rejected_items_count: number;
        rejected_items_amount: number;
    };
    cashier_activity: {
        user_id: number;
        user_name: string;
        user_role: string;
        total_orders: number;
        total_net_revenue: number;
        cash_count: number;
        cash_revenue: number;
        qris_count: number;
        qris_revenue: number;
    }[];
    rejected_items_list: {
        id: number;
        order_number: string;
        customer_name: string;
        payment_status: string;
        menu_name: string;
        quantity: number;
        total_price: number;
        rejection_reason: string | null;
        rejected_by_name: string;
        rejected_at_formatted: string;
    }[];
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

interface ReconciliationLedgerTabProps {
    summary: FinancialSummary;
    operationalAnalytics: OperationalAnalyticsPayload;
    transactions: PaginatedTransactions;
    filteredTableTotals: {
        count: number;
        subtotal: number;
        refund_amount: number;
        net_revenue: number;
        unpaid_amount: number;
    };
    availableMenus: { id: number; name: string }[];
    filters: ReportFilters;
    onApplyLedgerFilters: (overrides: Record<string, string | number>) => void;
}

export default function ReconciliationLedgerTab({
    summary,
    operationalAnalytics,
    transactions,
    filteredTableTotals,
    availableMenus,
    filters,
    onApplyLedgerFilters,
}: ReconciliationLedgerTabProps) {
    const [searchText, setSearchText] = useState(filters.search ?? '');
    const [selectedTx, setSelectedTx] = useState<TransactionRecord | null>(
        null,
    );

    useEffect(() => {
        setSearchText(filters.search ?? '');
    }, [filters.search]);

    useEffect(() => {
        if (!selectedTx) return;
        const fresh = transactions.data.find((t) => t.id === selectedTx.id);
        if (fresh && fresh !== selectedTx) {
            setSelectedTx(fresh);
        }
    }, [transactions.data, selectedTx]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onApplyLedgerFilters({ search: searchText, page: 1 });
    };

    const hasActiveSubFilters = Boolean(
        filters.search ||
        (filters.payment_status && filters.payment_status !== 'all') ||
        (filters.order_status && filters.order_status !== 'all') ||
        (filters.payment_method && filters.payment_method !== 'all') ||
        (filters.payment_gateway && filters.payment_gateway !== 'all') ||
        filters.menu_id ||
        filters.filter_date,
    );

    const statusBadgeTone = (
        status: string,
    ): 'success' | 'warning' | 'danger' | 'neutral' => {
        if (status === 'paid' || status === 'completed') return 'success';
        if (status === 'unpaid' || status === 'pending' || status === 'ready')
            return 'warning';
        if (status === 'failed' || status === 'cancelled') return 'danger';
        return 'neutral';
    };

    return (
        <div className="space-y-6">
            {/* 1. Rekonsiliasi Gateway & Metode Pembayaran */}
            <div className="grid gap-5 lg:grid-cols-12">
                <Panel className="p-5 lg:col-span-5">
                    <div className="flex items-center justify-between gap-2 border-b border-[#E8DFC8] pb-3.5">
                        <div className="flex items-center gap-2">
                            <CreditCard className="size-4 text-[#C52828]" />
                            <div>
                                <h2 className="font-heading text-sm font-extrabold text-[#18181B]">
                                    Rekonsiliasi Gateway Pembayaran
                                </h2>
                                <p className="text-[11px] font-medium text-[#78716C]">
                                    Pembayaran Digital (
                                    {summary.gateway_integration.mode}) vs Kasir
                                    POS Manual
                                </p>
                            </div>
                        </div>
                        <Link
                            href="/admin/location-settings?tab=gateway"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C52828] hover:underline"
                        >
                            <SlidersHorizontal className="size-3" />
                            Atur Gateway
                        </Link>
                    </div>

                    <div className="mt-3 space-y-2.5">
                        {summary.payment_gateways.map((gw) => (
                            <div
                                key={gw.gateway}
                                className="rounded-xl border border-[#EFE5CF] bg-[#FAF6EC]/60 p-3.5"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-extrabold text-[#18181B]">
                                            {gw.label}
                                        </span>
                                        {gw.is_active_slot && (
                                            <StatusPill tone="brand">
                                                Aktif
                                            </StatusPill>
                                        )}
                                    </div>
                                    <span className="font-mono text-sm font-black text-[#18181B]">
                                        {formatRupiah(gw.net_revenue)}
                                    </span>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#78716C]">
                                    <span>
                                        {gw.transactions_count} lunas (
                                        {gw.revenue_share_percent}%)
                                    </span>
                                    <span>
                                        Unpaid: {gw.unpaid_count} (
                                        {formatRupiah(gw.unpaid_amount)}) •
                                        Batal: {gw.cancelled_count}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Panel>

                {/* Breakdown per Metode Pembayaran */}
                <Panel className="p-5 lg:col-span-7">
                    <div className="flex items-center gap-2 border-b border-[#E8DFC8] pb-3.5">
                        <ShieldCheck className="size-4 text-[#C52828]" />
                        <div>
                            <h2 className="font-heading text-sm font-extrabold text-[#18181B]">
                                Distribusi per Metode Pembayaran
                            </h2>
                            <p className="text-[11px] font-medium text-[#78716C]">
                                Rincian lunas, tagihan menunggu, & pembatalan
                                per kanal pembayaran
                            </p>
                        </div>
                    </div>

                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-[#E8DFC8] text-[10.5px] font-extrabold text-[#78716C] uppercase">
                                    <th className="py-2 pr-3">Metode</th>
                                    <th className="px-2 py-2 text-center">
                                        Lunas
                                    </th>
                                    <th className="px-2 py-2 text-right">
                                        Omzet Bersih
                                    </th>
                                    <th className="px-2 py-2 text-right">
                                        Pangsa
                                    </th>
                                    <th className="py-2 pl-2 text-right">
                                        Menunggu Bayar
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#EFE5CF]">
                                {summary.payment_methods.map((pm) => (
                                    <tr key={pm.method}>
                                        <td className="py-2.5 pr-3 font-bold text-[#18181B]">
                                            {pm.label}
                                        </td>
                                        <td className="px-2 py-2.5 text-center font-mono font-bold">
                                            {pm.transactions_count}
                                        </td>
                                        <td className="px-2 py-2.5 text-right font-mono font-extrabold text-[#18181B]">
                                            {formatRupiah(pm.net_revenue)}
                                        </td>
                                        <td className="px-2 py-2.5 text-right font-mono text-[#78716C]">
                                            {pm.revenue_share_percent}%
                                        </td>
                                        <td className="py-2.5 pl-2 text-right font-mono text-[#B45309]">
                                            {pm.unpaid_count > 0
                                                ? `${pm.unpaid_count} (${formatRupiah(pm.unpaid_amount)})`
                                                : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            </div>

            {/* 2. Settlement Staf Kasir & Audit Penolakan Item */}
            <div className="grid gap-5 lg:grid-cols-2">
                <Panel className="p-5">
                    <div className="flex items-center gap-2 border-b border-[#E8DFC8] pb-3.5">
                        <UserCheck className="size-4 text-[#C52828]" />
                        <div>
                            <h3 className="font-heading text-sm font-extrabold text-[#18181B]">
                                Settlement Kasir / Staf
                            </h3>
                            <p className="text-[11px] font-medium text-[#78716C]">
                                Rekonsiliasi setoran tunai & QRIS yang
                                dikonfirmasi masing-masing staf
                            </p>
                        </div>
                    </div>

                    {operationalAnalytics.cashier_activity.length === 0 ? (
                        <p className="py-8 text-center text-xs font-medium text-[#78716C]">
                            Belum ada transaksi yang dikonfirmasi manual oleh
                            kasir pada periode ini.
                        </p>
                    ) : (
                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-[#E8DFC8] text-[10.5px] font-extrabold text-[#78716C] uppercase">
                                        <th className="py-2 pr-2">Nama Staf</th>
                                        <th className="px-2 py-2 text-center">
                                            Pesanan
                                        </th>
                                        <th className="px-2 py-2 text-right">
                                            Tunai ({' '}
                                            {operationalAnalytics.cashier_activity.reduce(
                                                (a, c) => a + c.cash_count,
                                                0,
                                            )}
                                            )
                                        </th>
                                        <th className="py-2 pl-2 text-right">
                                            Total Setoran
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#EFE5CF]">
                                    {operationalAnalytics.cashier_activity.map(
                                        (c) => (
                                            <tr key={c.user_id}>
                                                <td className="py-2.5 pr-2">
                                                    <p className="font-bold text-[#18181B]">
                                                        {c.user_name}
                                                    </p>
                                                    <p className="text-[10.5px] text-[#78716C] uppercase">
                                                        {c.user_role}
                                                    </p>
                                                </td>
                                                <td className="px-2 py-2.5 text-center font-mono font-bold">
                                                    {c.total_orders}
                                                </td>
                                                <td className="px-2 py-2.5 text-right font-mono">
                                                    {formatRupiah(
                                                        c.cash_revenue,
                                                    )}{' '}
                                                    <span className="text-[10px] text-[#78716C]">
                                                        ({c.cash_count}x)
                                                    </span>
                                                </td>
                                                <td className="py-2.5 pl-2 text-right font-mono font-extrabold text-[#15803D]">
                                                    {formatRupiah(
                                                        c.total_net_revenue,
                                                    )}
                                                </td>
                                            </tr>
                                        ),
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>

                {/* Audit Penolakan Item & Pembatalan */}
                <Panel className="p-5">
                    <div className="flex items-center justify-between gap-2 border-b border-[#E8DFC8] pb-3.5">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="size-4 text-[#B91C1C]" />
                            <div>
                                <h3 className="font-heading text-sm font-extrabold text-[#18181B]">
                                    Audit Item Ditolak & Pembatalan
                                </h3>
                                <p className="text-[11px] font-medium text-[#78716C]">
                                    {
                                        operationalAnalytics.pipeline
                                            .rejected_items_count
                                    }{' '}
                                    item ditolak (
                                    {formatRupiah(
                                        operationalAnalytics.pipeline
                                            .rejected_items_amount,
                                    )}
                                    ) •{' '}
                                    {
                                        operationalAnalytics.pipeline
                                            .cancelled_count
                                    }{' '}
                                    pesanan batal
                                </p>
                            </div>
                        </div>
                    </div>

                    {operationalAnalytics.rejected_items_list.length === 0 ? (
                        <p className="py-8 text-center text-xs font-medium text-[#78716C]">
                            Tidak ada item yang ditolak dapur/kasir pada periode
                            ini.
                        </p>
                    ) : (
                        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                            {operationalAnalytics.rejected_items_list.map(
                                (item) => (
                                    <div
                                        key={item.id}
                                        className="rounded-xl border border-[#FECACA] bg-[#FEE2E2]/30 p-3 text-xs"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-extrabold text-[#18181B]">
                                                    {item.quantity}x{' '}
                                                    {item.menu_name}
                                                </p>
                                                <p className="text-[10.5px] font-semibold text-[#78716C]">
                                                    #{item.order_number} •{' '}
                                                    {item.customer_name} • Oleh:{' '}
                                                    {item.rejected_by_name}
                                                </p>
                                            </div>
                                            <span className="shrink-0 font-mono font-bold text-[#B91C1C]">
                                                {formatRupiah(item.total_price)}
                                            </span>
                                        </div>
                                        {item.rejection_reason && (
                                            <p className="mt-1 text-[11px] text-[#991B1B]">
                                                Alasan: {item.rejection_reason}
                                            </p>
                                        )}
                                    </div>
                                ),
                            )}
                        </div>
                    )}
                </Panel>
            </div>

            {/* 3. Buku Besar Transaksi (Transaction Ledger) */}
            <Panel className="p-5">
                <div className="flex flex-col gap-3 border-b border-[#E8DFC8] pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                        <FileText className="size-5 text-[#C52828]" />
                        <div>
                            <h2 className="font-heading text-base font-extrabold text-[#18181B]">
                                Buku Besar Transaksi (Transaction Ledger)
                            </h2>
                            <p className="text-xs font-medium text-[#78716C]">
                                Sumber audit tunggal per pesanan (klik Detail
                                untuk melihat riwayat status & item).
                            </p>
                        </div>
                    </div>

                    {filters.filter_date && (
                        <button
                            type="button"
                            onClick={() =>
                                onApplyLedgerFilters({
                                    filter_date: '',
                                    page: 1,
                                })
                            }
                            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[#FDECEC] px-3 text-xs font-bold text-[#C52828] hover:bg-[#FECACA]"
                        >
                            <span>Tanggal: {filters.filter_date}</span>
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>

                {/* Single Clean Filter Toolbar */}
                <div className="mt-4 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <form
                            onSubmit={handleSearchSubmit}
                            className="flex flex-1 items-center gap-2 sm:max-w-sm"
                        >
                            <SearchInput
                                value={searchText}
                                onChange={setSearchText}
                                placeholder="Cari order, nama, meja, ref..."
                                className="max-w-none flex-1"
                            />
                            <button
                                type="submit"
                                className="h-10 shrink-0 cursor-pointer rounded-xl border border-[#DFCFA9] bg-[#FAF6EC] px-3.5 text-xs font-bold text-[#3F2D1C] hover:bg-[#EFE5CF]"
                            >
                                Cari
                            </button>
                        </form>

                        <select
                            value={filters.payment_status ?? 'all'}
                            onChange={(e) =>
                                onApplyLedgerFilters({
                                    payment_status: e.target.value,
                                    page: 1,
                                })
                            }
                            className="h-10 rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 text-xs font-bold text-[#3F2D1C] outline-none focus:border-[#C52828]"
                        >
                            <option value="all">Semua Bayar</option>
                            <option value="paid">Lunas (Paid)</option>
                            <option value="unpaid">Menunggu (Unpaid)</option>
                            <option value="failed">Gagal</option>
                            <option value="refunded">Refund</option>
                        </select>

                        <select
                            value={filters.payment_gateway ?? 'all'}
                            onChange={(e) =>
                                onApplyLedgerFilters({
                                    payment_gateway: e.target.value,
                                    page: 1,
                                })
                            }
                            className="h-10 rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 text-xs font-bold text-[#3F2D1C] outline-none focus:border-[#C52828]"
                        >
                            <option value="all">Semua Gateway</option>
                            <option value="digital">Pembayaran Digital</option>
                            <option value="manual">Kasir POS Manual</option>
                        </select>

                        <select
                            value={filters.payment_method ?? 'all'}
                            onChange={(e) =>
                                onApplyLedgerFilters({
                                    payment_method: e.target.value,
                                    page: 1,
                                })
                            }
                            className="h-10 rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 text-xs font-bold text-[#3F2D1C] outline-none focus:border-[#C52828]"
                        >
                            <option value="all">Semua Metode</option>
                            <option value="qris">QRIS</option>
                            <option value="transfer">Transfer / VA</option>
                            <option value="cash">Tunai</option>
                            <option value="debit">Kartu Debit</option>
                        </select>

                        <select
                            value={
                                filters.menu_id ? String(filters.menu_id) : ''
                            }
                            onChange={(e) =>
                                onApplyLedgerFilters({
                                    menu_id: e.target.value,
                                    page: 1,
                                })
                            }
                            className="h-10 max-w-[190px] rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 text-xs font-bold text-[#3F2D1C] outline-none focus:border-[#C52828]"
                        >
                            <option value="">Semua Menu</option>
                            {availableMenus.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.name}
                                </option>
                            ))}
                        </select>

                        {hasActiveSubFilters && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchText('');
                                    onApplyLedgerFilters({
                                        search: '',
                                        payment_status: 'all',
                                        order_status: 'all',
                                        payment_method: 'all',
                                        payment_gateway: 'all',
                                        menu_id: '',
                                        filter_date: '',
                                        page: 1,
                                    });
                                }}
                                className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-xl border border-[#FECACA] bg-[#FEE2E2]/70 px-3 text-xs font-bold text-[#B91C1C] hover:bg-[#FEE2E2]"
                            >
                                <RotateCcw className="size-3.5" />
                                Reset Filter
                            </button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FAF6EC] px-3.5 py-2 text-xs font-semibold text-[#5B4126]">
                        <span>
                            Menampilkan{' '}
                            <strong>{filteredTableTotals.count}</strong>{' '}
                            transaksi terfilter • Total Omzet Bersih:{' '}
                            <strong className="font-mono text-[#15803D]">
                                {formatRupiah(filteredTableTotals.net_revenue)}
                            </strong>
                            {filteredTableTotals.unpaid_amount > 0 && (
                                <span className="ml-2 text-[#B45309]">
                                    (Menunggu:{' '}
                                    {formatRupiah(
                                        filteredTableTotals.unpaid_amount,
                                    )}
                                    )
                                </span>
                            )}
                        </span>

                        <div className="flex items-center gap-2">
                            <span>Per Halaman:</span>
                            <select
                                value={filters.per_page ?? 15}
                                onChange={(e) =>
                                    onApplyLedgerFilters({
                                        per_page: Number(e.target.value),
                                        page: 1,
                                    })
                                }
                                className="h-7 rounded-lg border border-[#DFCFA9] bg-[#FFFDF9] px-2 text-xs font-bold text-[#18181B]"
                            >
                                {[10, 15, 25, 50].map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {transactions.data.length === 0 ? (
                    <EmptyState
                        icon={FileText}
                        title="Tidak Ada Transaksi Ditemukan"
                        description="Ubah rentang tanggal atau reset filter pencarian untuk melihat daftar transaksi."
                    />
                ) : (
                    <>
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-[#E8DFC8] bg-[#FAF6EC]/80 text-[10.5px] font-extrabold tracking-wider text-[#78716C] uppercase">
                                        <th className="px-3 py-2.5">
                                            Waktu (WIB)
                                        </th>
                                        <th className="px-3 py-2.5">
                                            Order & Pelanggan
                                        </th>
                                        <th className="px-3 py-2.5">
                                            Gateway / Metode
                                        </th>
                                        <th className="px-3 py-2.5">Status</th>
                                        <th className="px-3 py-2.5 text-right">
                                            Omzet Diakui
                                        </th>
                                        <th className="px-3 py-2.5 text-right">
                                            Audit
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#EFE5CF]">
                                    {transactions.data.map((tx) => (
                                        <tr
                                            key={tx.id}
                                            className="transition-colors hover:bg-[#FAF6EC]/50"
                                        >
                                            <td className="px-3 py-2.5 whitespace-nowrap text-[#5B4126]">
                                                <p className="font-semibold">
                                                    {
                                                        tx.transaction_date_formatted
                                                    }
                                                </p>
                                                <p className="text-[10.5px] text-[#8C7A6B]">
                                                    Meja {tx.table_number}
                                                </p>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <p className="font-mono font-extrabold text-[#18181B]">
                                                    #{tx.order_number}
                                                </p>
                                                <p className="text-[11px] font-semibold text-[#5B4126]">
                                                    {tx.customer_name}
                                                </p>
                                                <p className="line-clamp-1 max-w-xs text-[10.5px] text-[#8C7A6B]">
                                                    {tx.items_summary}
                                                </p>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                <p className="font-bold text-[#18181B]">
                                                    {tx.payment_method_label}
                                                </p>
                                                <p className="text-[10.5px] text-[#78716C]">
                                                    {tx.payment_gateway_label}
                                                </p>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                <div className="flex flex-col items-start gap-1">
                                                    <StatusPill
                                                        tone={statusBadgeTone(
                                                            tx.payment_status,
                                                        )}
                                                    >
                                                        {
                                                            tx.payment_status_label
                                                        }
                                                    </StatusPill>
                                                    <span className="text-[10px] font-bold text-[#78716C]">
                                                        {tx.order_status_label}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-mono font-black whitespace-nowrap">
                                                <span
                                                    className={cn(
                                                        tx.is_realized_revenue
                                                            ? 'text-[#15803D]'
                                                            : 'text-[#78716C]',
                                                    )}
                                                >
                                                    {formatRupiah(
                                                        tx.net_revenue,
                                                    )}
                                                </span>
                                                {tx.refund_amount > 0 && (
                                                    <p className="text-[10px] font-bold text-[#B91C1C]">
                                                        Refund:{' '}
                                                        {formatRupiah(
                                                            tx.refund_amount,
                                                        )}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedTx(tx)
                                                    }
                                                    className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[#DFCFA9] bg-[#FFFDF9] px-2.5 text-[11px] font-bold text-[#3F2D1C] hover:bg-[#F5EEDC]"
                                                >
                                                    <Eye className="size-3.5" />
                                                    Detail
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {transactions.last_page > 1 && (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E8DFC8] pt-3 text-xs">
                                <span className="font-medium text-[#78716C]">
                                    Halaman {transactions.current_page} dari{' '}
                                    {transactions.last_page} (
                                    {transactions.total} total)
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        disabled={
                                            transactions.current_page <= 1
                                        }
                                        onClick={() =>
                                            onApplyLedgerFilters({
                                                page:
                                                    transactions.current_page -
                                                    1,
                                            })
                                        }
                                        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-[#E8DFC8] bg-[#FFFDF9] disabled:opacity-40"
                                    >
                                        <ChevronLeft className="size-4" />
                                    </button>
                                    {transactions.links
                                        .filter(
                                            (l) =>
                                                !l.label.includes('Previous') &&
                                                !l.label.includes('Next') &&
                                                !l.label.includes('«') &&
                                                !l.label.includes('»'),
                                        )
                                        .slice(0, 7)
                                        .map((link, idx) =>
                                            link.url ? (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() =>
                                                        router.get(
                                                            link.url!,
                                                            {},
                                                            {
                                                                preserveState: true,
                                                                preserveScroll: true,
                                                            },
                                                        )
                                                    }
                                                    className={cn(
                                                        'h-8 min-w-8 cursor-pointer rounded-lg px-2.5 font-bold',
                                                        link.active
                                                            ? 'bg-[#C52828] text-white'
                                                            : 'border border-[#E8DFC8] bg-[#FFFDF9] text-[#3F2D1C] hover:bg-[#FAF6EC]',
                                                    )}
                                                >
                                                    {link.label}
                                                </button>
                                            ) : (
                                                <span
                                                    key={idx}
                                                    className="px-1.5 text-[#A8A29E]"
                                                >
                                                    {link.label}
                                                </span>
                                            ),
                                        )}
                                    <button
                                        type="button"
                                        disabled={
                                            transactions.current_page >=
                                            transactions.last_page
                                        }
                                        onClick={() =>
                                            onApplyLedgerFilters({
                                                page:
                                                    transactions.current_page +
                                                    1,
                                            })
                                        }
                                        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-[#E8DFC8] bg-[#FFFDF9] disabled:opacity-40"
                                    >
                                        <ChevronRight className="size-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Panel>

            {/* Modal Audit Detail Transaksi */}
            <Dialog
                open={selectedTx !== null}
                onOpenChange={(open) => !open && setSelectedTx(null)}
            >
                <DialogContent className="flex max-h-[88vh] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl">
                    {selectedTx && (
                        <>
                            <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                                <FormDialogHeader
                                    icon={FileText}
                                    title={`Audit Transaksi #${selectedTx.order_number}`}
                                    description={`${selectedTx.customer_name} • Meja ${selectedTx.table_number} • ${selectedTx.transaction_date_formatted}`}
                                    statusLabel={
                                        selectedTx.payment_status_label
                                    }
                                    statusActive={
                                        selectedTx.payment_status === 'paid'
                                    }
                                />
                            </div>

                            <div className="space-y-4 overflow-y-auto p-5 text-xs">
                                {/* Ringkasan Pembayaran */}
                                <div className="grid gap-2.5 rounded-xl border border-[#E8DFC8] bg-[#FFFDF9] p-3.5 sm:grid-cols-2">
                                    <div>
                                        <p className="text-[10px] font-bold text-[#8C7A6B] uppercase">
                                            Gateway & Metode
                                        </p>
                                        <p className="mt-0.5 font-bold text-[#18181B]">
                                            {selectedTx.payment_gateway_label} —{' '}
                                            {selectedTx.payment_method_label}
                                        </p>
                                        <p className="font-mono text-[11px] text-[#78716C]">
                                            Ref:{' '}
                                            {selectedTx.payment_reference ??
                                                '-'}
                                        </p>
                                    </div>
                                    <div className="sm:text-right">
                                        <p className="text-[10px] font-bold text-[#8C7A6B] uppercase">
                                            Pendapatan Bersih Diakui
                                        </p>
                                        <p className="mt-0.5 font-mono text-base font-black text-[#15803D]">
                                            {formatRupiah(
                                                selectedTx.net_revenue,
                                            )}
                                        </p>
                                        {selectedTx.confirmed_by_name && (
                                            <p className="text-[11px] text-[#78716C]">
                                                Dikonfirmasi:{' '}
                                                {selectedTx.confirmed_by_name}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Daftar Item Pesanan */}
                                <div className="rounded-xl border border-[#E8DFC8] bg-[#FFFDF9] p-3.5">
                                    <p className="mb-2 font-extrabold text-[#18181B]">
                                        Rincian Item ({selectedTx.items.length})
                                    </p>
                                    <div className="divide-y divide-[#EFE5CF]">
                                        {selectedTx.items.map((it) => (
                                            <div
                                                key={it.id}
                                                className="flex items-start justify-between gap-2 py-2"
                                            >
                                                <div>
                                                    <p
                                                        className={cn(
                                                            'font-bold',
                                                            it.status ===
                                                                'rejected'
                                                                ? 'text-[#B91C1C] line-through'
                                                                : 'text-[#18181B]',
                                                        )}
                                                    >
                                                        {it.quantity}x{' '}
                                                        {it.menu_name}
                                                    </p>
                                                    {it.options.length > 0 && (
                                                        <p className="text-[10.5px] text-[#78716C]">
                                                            {it.options
                                                                .map(
                                                                    (o) =>
                                                                        `${o.group_name}: ${o.option_name}`,
                                                                )
                                                                .join(' • ')}
                                                        </p>
                                                    )}
                                                    {it.customer_notes && (
                                                        <p className="text-[10.5px] text-[#5B4126] italic">
                                                            Catatan:{' '}
                                                            {it.customer_notes}
                                                        </p>
                                                    )}
                                                    {it.status === 'rejected' &&
                                                        it.rejection_reason && (
                                                            <p className="text-[10.5px] font-bold text-[#B91C1C]">
                                                                Ditolak:{' '}
                                                                {
                                                                    it.rejection_reason
                                                                }
                                                            </p>
                                                        )}
                                                </div>
                                                <span className="font-mono font-bold text-[#18181B]">
                                                    {formatRupiah(
                                                        it.total_price,
                                                    )}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Timeline Log Status */}
                                {selectedTx.status_histories.length > 0 && (
                                    <div className="rounded-xl border border-[#E8DFC8] bg-[#FFFDF9] p-3.5">
                                        <p className="mb-2 flex items-center gap-1.5 font-extrabold text-[#18181B]">
                                            <Clock className="size-3.5 text-[#C52828]" />
                                            Log Audit Perubahan Status
                                        </p>
                                        <div className="space-y-2">
                                            {selectedTx.status_histories.map(
                                                (hist) => (
                                                    <div
                                                        key={hist.id}
                                                        className="rounded-lg border border-[#EFE5CF] bg-[#FAF6EC]/60 px-3 py-2"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="font-extrabold text-[#18181B]">
                                                                {
                                                                    hist.status_label
                                                                }{' '}
                                                                •{' '}
                                                                {
                                                                    hist.actor_name
                                                                }
                                                            </span>
                                                            <span className="text-[10.5px] text-[#78716C]">
                                                                {
                                                                    hist.created_at_formatted
                                                                }
                                                            </span>
                                                        </div>
                                                        {hist.notes && (
                                                            <p className="mt-0.5 text-[11px] text-[#5B4126]">
                                                                {hist.notes}
                                                            </p>
                                                        )}
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
