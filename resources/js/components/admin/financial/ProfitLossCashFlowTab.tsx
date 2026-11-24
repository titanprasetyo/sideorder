import { Link, router, useForm } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowDownCircle,
    ArrowUpCircle,
    Calculator,
    Coins,
    Landmark,
    Pencil,
    Plus,
    Receipt,
    Trash2,
    Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
    ConfirmDialog,
    EmptyState,
    FieldError,
    FormDialogHeader,
    IconAction,
    Panel,
    StatusPill,
} from '@/components/admin/admin-ui';
import {
    formatRupiah,
    type ExpenseRecord,
    type ExpensesAnalytics,
    type FinancialSummary,
} from '@/components/admin/financial/financial-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ProfitLossCashFlowTabProps {
    summary: FinancialSummary;
    expenses: ExpensesAnalytics;
    periodLabel: string;
    defaultExpenseDate: string;
}

export default function ProfitLossCashFlowTab({
    summary,
    expenses,
    periodLabel,
    defaultExpenseDate,
}: ProfitLossCashFlowTabProps) {
    const period = summary.period;
    const cashFlow = period.cash_flow;

    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [sourceFilter, setSourceFilter] = useState<string>('all');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(
        null,
    );
    const [deletingExpense, setDeletingExpense] =
        useState<ExpenseRecord | null>(null);
    const [deletingBusy, setDeletingBusy] = useState(false);

    const categoryKeys = Object.keys(expenses.categories || {});
    const sourceKeys = Object.keys(expenses.payment_sources || {});

    const form = useForm({
        expense_date: defaultExpenseDate,
        category: categoryKeys[0] ?? 'ingredients',
        title: '',
        amount: '',
        payment_source: sourceKeys[0] ?? 'cash',
        notes: '',
    });

    const openCreateModal = () => {
        setEditingExpense(null);
        form.clearErrors();
        form.setData({
            expense_date: defaultExpenseDate,
            category: categoryKeys[0] ?? 'ingredients',
            title: '',
            amount: '',
            payment_source: sourceKeys[0] ?? 'cash',
            notes: '',
        });
        setModalOpen(true);
    };

    const openEditModal = (exp: ExpenseRecord) => {
        setEditingExpense(exp);
        form.clearErrors();
        form.setData({
            expense_date: exp.expense_date,
            category: exp.category,
            title: exp.title,
            amount: String(Math.round(exp.amount)),
            payment_source: exp.payment_source,
            notes: exp.notes ?? '',
        });
        setModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingExpense) {
            form.put(`/admin/expenses/${editingExpense.id}`, {
                preserveScroll: true,
                onSuccess: () => {
                    setModalOpen(false);
                    toast.success('Catatan pengeluaran berhasil diperbarui.');
                },
                onError: () => {
                    toast.error('Periksa kembali data pengeluaran.');
                },
            });
        } else {
            form.post('/admin/expenses', {
                preserveScroll: true,
                onSuccess: () => {
                    setModalOpen(false);
                    toast.success('Pengeluaran operasional berhasil dicatat.');
                },
                onError: () => {
                    toast.error('Periksa kembali data pengeluaran.');
                },
            });
        }
    };

    const handleConfirmDelete = () => {
        if (!deletingExpense) return;
        setDeletingBusy(true);
        router.delete(`/admin/expenses/${deletingExpense.id}`, {
            preserveScroll: true,
            onSuccess: () => {
                setDeletingExpense(null);
                toast.success('Catatan pengeluaran dihapus.');
            },
            onError: () => {
                toast.error('Gagal menghapus pengeluaran.');
            },
            onFinish: () => setDeletingBusy(false),
        });
    };

    const filteredExpenses = expenses.items.filter((item) => {
        if (categoryFilter !== 'all' && item.category !== categoryFilter) {
            return false;
        }
        if (sourceFilter !== 'all' && item.payment_source !== sourceFilter) {
            return false;
        }
        return true;
    });

    const filteredExpensesTotal = filteredExpenses.reduce(
        (acc, row) => acc + row.amount,
        0,
    );

    return (
        <div className="space-y-6">
            {/* P&L Statement + Real Cash Flow Statement */}
            <div className="grid gap-5 lg:grid-cols-12">
                {/* Laporan Laba Rugi (7 cols) */}
                <Panel className="p-5 lg:col-span-7">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8DFC8] pb-3.5">
                        <div className="flex items-center gap-2">
                            <Calculator className="size-4 text-[#C52828]" />
                            <div>
                                <h2 className="font-heading text-base font-extrabold text-[#18181B]">
                                    Laporan Laba Rugi (Profit & Loss)
                                </h2>
                                <p className="text-[11px] font-medium text-[#78716C]">
                                    Periode: {periodLabel}
                                </p>
                            </div>
                        </div>
                        <StatusPill
                            tone={
                                period.cogs_status === 'complete'
                                    ? 'success'
                                    : 'warning'
                            }
                        >
                            Cakupan HPP: {period.cogs_coverage_percent}%
                        </StatusPill>
                    </div>

                    {period.cogs_coverage_percent < 100 && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#FDE68A] bg-[#FEF3C7]/60 px-3.5 py-2.5 text-xs text-[#92400E]">
                            <span className="flex items-center gap-2 font-semibold">
                                <AlertTriangle className="size-4 shrink-0" />
                                {period.cogs_message}
                            </span>
                            <Link
                                href="/admin/menus"
                                className="font-extrabold text-[#B45309] underline"
                            >
                                Lengkapi HPP Menu →
                            </Link>
                        </div>
                    )}

                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-[#E8DFC8] text-[10.5px] font-extrabold tracking-wider text-[#8C7A6B] uppercase">
                                    <th className="py-2 pr-3">Pos Akun</th>
                                    <th className="px-3 py-2 text-right">
                                        Periode Aktif
                                    </th>
                                    <th className="px-3 py-2 text-right">
                                        Pembanding
                                    </th>
                                    <th className="py-2 pl-3 text-right">
                                        Porsi / Growth
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#EFE5CF]">
                                <tr>
                                    <td className="py-2.5 pr-3 font-medium text-[#5B4126]">
                                        Omzet Bruto Penjualan Lunas
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#18181B]">
                                        {formatRupiah(period.gross_revenue)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-[#78716C]">
                                        -
                                    </td>
                                    <td className="py-2.5 pl-3 text-right text-[#78716C]">
                                        {period.paid_transactions_count} trx
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2.5 pr-3 font-medium text-[#B91C1C]">
                                        (-) Penyesuaian / Refund
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#B91C1C]">
                                        {period.refund_amount > 0
                                            ? `-${formatRupiah(period.refund_amount)}`
                                            : formatRupiah(0)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-[#78716C]">
                                        -
                                    </td>
                                    <td className="py-2.5 pl-3 text-right text-[#78716C]">
                                        {period.refunded_count} trx
                                    </td>
                                </tr>
                                <tr className="bg-[#FAF6EC]/80">
                                    <td className="py-2.5 pr-3 font-extrabold text-[#18181B]">
                                        = Pendapatan Bersih (Net Sales)
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono font-black text-[#18181B]">
                                        {formatRupiah(period.net_revenue)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#78716C]">
                                        {formatRupiah(
                                            period.previous_period_revenue,
                                        )}
                                    </td>
                                    <td className="py-2.5 pl-3 text-right font-bold text-[#3F2D1C]">
                                        {period.period_growth_percent > 0
                                            ? '+'
                                            : ''}
                                        {period.period_growth_percent}%
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2.5 pr-3 font-medium text-[#B91C1C]">
                                        (-) Harga Pokok Penjualan (HPP Modal)
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#B91C1C]">
                                        -{formatRupiah(period.cogs_amount)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-[#78716C]">
                                        -
                                        {formatRupiah(
                                            period.previous_cogs_amount,
                                        )}
                                    </td>
                                    <td className="py-2.5 pl-3 text-right font-semibold text-[#78716C]">
                                        {period.net_revenue > 0
                                            ? `${((period.cogs_amount / period.net_revenue) * 100).toFixed(1)}% omzet`
                                            : '0%'}
                                    </td>
                                </tr>
                                <tr className="bg-[#FAF6EC]/80">
                                    <td className="py-2.5 pr-3 font-extrabold text-[#18181B]">
                                        = Laba Kotor (Gross Profit)
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono font-black text-[#18181B]">
                                        {formatRupiah(period.gross_profit)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#78716C]">
                                        {formatRupiah(
                                            period.previous_gross_profit,
                                        )}
                                    </td>
                                    <td className="py-2.5 pl-3 text-right font-extrabold text-[#15803D]">
                                        Margin {period.gross_margin_percent}%
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2.5 pr-3 font-medium text-[#B91C1C]">
                                        (-) Beban Operasional (Opex)
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#B91C1C]">
                                        -
                                        {formatRupiah(
                                            period.operational_expenses,
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-[#78716C]">
                                        -
                                        {formatRupiah(
                                            period.previous_operational_expenses,
                                        )}
                                    </td>
                                    <td className="py-2.5 pl-3 text-right font-semibold text-[#78716C]">
                                        {period.operational_expenses_count}{' '}
                                        catatan
                                    </td>
                                </tr>
                                <tr className="border-t-2 border-[#DFCFA9] bg-[#FAF5E8]">
                                    <td className="py-3 pr-3 text-sm font-black text-[#18181B]">
                                        = LABA BERSIH RIIL (NET PROFIT)
                                    </td>
                                    <td
                                        className={cn(
                                            'px-3 py-3 text-right font-mono text-sm font-black',
                                            period.net_profit >= 0
                                                ? 'text-[#15803D]'
                                                : 'text-[#B91C1C]',
                                        )}
                                    >
                                        {formatRupiah(period.net_profit)}
                                    </td>
                                    <td className="px-3 py-3 text-right font-mono text-xs font-bold text-[#78716C]">
                                        {formatRupiah(
                                            period.previous_net_profit,
                                        )}
                                    </td>
                                    <td className="py-3 pl-3 text-right text-xs font-black text-[#18181B]">
                                        Margin {period.net_margin_percent}%
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Rincian Proporsi Beban per Kategori */}
                    {expenses.total_amount > 0 && (
                        <div className="mt-4 rounded-xl border border-[#EFE5CF] bg-[#FAF6EC]/70 p-3.5">
                            <p className="mb-2 text-[10.5px] font-extrabold tracking-wider text-[#78716C] uppercase">
                                Distribusi Beban Operasional per Kategori
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {expenses.by_category
                                    .filter((c) => c.amount > 0)
                                    .map((cat) => (
                                        <div
                                            key={cat.category}
                                            className="flex items-center justify-between gap-2 rounded-lg bg-[#FFFDF9] px-3 py-1.5 text-xs ring-1 ring-[#EFE5CF]"
                                        >
                                            <span className="truncate font-semibold text-[#3F2D1C]">
                                                {cat.label} ({cat.count}x)
                                            </span>
                                            <span className="shrink-0 font-mono font-bold text-[#18181B]">
                                                {formatRupiah(cat.amount)}{' '}
                                                <span className="text-[10px] text-[#8C7A6B]">
                                                    ({cat.share_percent}%)
                                                </span>
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </Panel>

                {/* Laporan Arus Kas Riil (5 cols) */}
                <Panel className="flex flex-col justify-between p-5 lg:col-span-5">
                    <div>
                        <div className="flex items-center gap-2 border-b border-[#E8DFC8] pb-3.5">
                            <Wallet className="size-4 text-[#C52828]" />
                            <div>
                                <h2 className="font-heading text-base font-extrabold text-[#18181B]">
                                    Arus Kas Riil (Cash Flow)
                                </h2>
                                <p className="text-[11px] font-medium text-[#78716C]">
                                    Aliran uang masuk vs kas keluar aktual per
                                    kantong
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 space-y-4">
                            {/* Kas Masuk */}
                            <div className="space-y-1.5 rounded-xl border border-[#BBF7D0] bg-[#DCFCE7]/35 p-3.5">
                                <div className="flex items-center justify-between text-xs font-extrabold text-[#15803D]">
                                    <span className="inline-flex items-center gap-1.5">
                                        <ArrowUpCircle className="size-4" />
                                        ARUS KAS MASUK (INFLOW)
                                    </span>
                                    <span className="font-mono">
                                        {formatRupiah(cashFlow.inflow_total)}
                                    </span>
                                </div>
                                <div className="space-y-1 border-t border-[#BBF7D0]/60 pt-2 text-xs text-[#3F2D1C]">
                                    <div className="flex justify-between">
                                        <span>Tunai Laci POS (Cash)</span>
                                        <span className="font-mono font-bold">
                                            {formatRupiah(cashFlow.inflow_cash)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>QRIS Dinamis</span>
                                        <span className="font-mono font-bold">
                                            {formatRupiah(cashFlow.inflow_qris)}
                                        </span>
                                    </div>
                                    {(cashFlow.inflow_transfer ?? 0) > 0 && (
                                        <div className="flex justify-between">
                                            <span>Transfer Bank</span>
                                            <span className="font-mono font-bold">
                                                {formatRupiah(
                                                    cashFlow.inflow_transfer,
                                                )}
                                            </span>
                                        </div>
                                    )}
                                    {(cashFlow.inflow_debit ?? 0) > 0 && (
                                        <div className="flex justify-between">
                                            <span>Kartu Debit / EDC</span>
                                            <span className="font-mono font-bold">
                                                {formatRupiah(
                                                    cashFlow.inflow_debit ?? 0,
                                                )}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Kas Keluar */}
                            <div className="space-y-1.5 rounded-xl border border-[#FECACA] bg-[#FEE2E2]/35 p-3.5">
                                <div className="flex items-center justify-between text-xs font-extrabold text-[#B91C1C]">
                                    <span className="inline-flex items-center gap-1.5">
                                        <ArrowDownCircle className="size-4" />
                                        ARUS KAS KELUAR (OUTFLOW)
                                    </span>
                                    <span className="font-mono">
                                        -
                                        {formatRupiah(
                                            cashFlow.outflow_expenses_total +
                                                cashFlow.outflow_refund,
                                        )}
                                    </span>
                                </div>
                                <div className="space-y-1 border-t border-[#FECACA]/60 pt-2 text-xs text-[#3F2D1C]">
                                    <div className="flex justify-between">
                                        <span>
                                            Belanja dari Laci Kasir Tunai
                                        </span>
                                        <span className="font-mono font-bold text-[#B91C1C]">
                                            -
                                            {formatRupiah(
                                                cashFlow.outflow_expenses_cash,
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>
                                            Pengeluaran via Rekening / Saldo QRIS
                                        </span>
                                        <span className="font-mono font-bold text-[#B91C1C]">
                                            -
                                            {formatRupiah(
                                                cashFlow.outflow_expenses_bank,
                                            )}
                                        </span>
                                    </div>
                                    {cashFlow.outflow_refund > 0 && (
                                        <div className="flex justify-between">
                                            <span>Pengembalian Dana (Refund)</span>
                                            <span className="font-mono font-bold text-[#B91C1C]">
                                                -
                                                {formatRupiah(
                                                    cashFlow.outflow_refund,
                                                )}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Posisi Saldo Bersih */}
                    <div className="mt-4 space-y-2 rounded-xl border border-[#DFCFA9] bg-[#FAF5E8] p-4">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-[#FFFDF9] p-2.5 ring-1 ring-[#E8DFC8]">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#78716C] uppercase">
                                    <Coins className="size-3 text-[#B45309]" />
                                    Net Kas Tunai
                                </span>
                                <p className="mt-0.5 font-mono text-sm font-black text-[#18181B]">
                                    {formatRupiah(cashFlow.net_cash_drawer)}
                                </p>
                            </div>
                            <div className="rounded-lg bg-[#FFFDF9] p-2.5 ring-1 ring-[#E8DFC8]">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#78716C] uppercase">
                                    <Landmark className="size-3 text-[#15803D]" />
                                    Net Bank / Digital
                                </span>
                                <p className="mt-0.5 font-mono text-sm font-black text-[#18181B]">
                                    {formatRupiah(cashFlow.net_bank_digital)}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-t border-[#E8DFC8] pt-2.5">
                            <span className="text-xs font-extrabold text-[#18181B]">
                                SALDO ARUS KAS BERSIH PERIODE
                            </span>
                            <span
                                className={cn(
                                    'font-mono text-base font-black',
                                    cashFlow.net_cash_flow >= 0
                                        ? 'text-[#15803D]'
                                        : 'text-[#B91C1C]',
                                )}
                            >
                                {formatRupiah(cashFlow.net_cash_flow)}
                            </span>
                        </div>
                    </div>
                </Panel>
            </div>

            {/* Modul CRUD Pengeluaran Operasional */}
            <Panel className="p-5">
                <div className="flex flex-col gap-3 border-b border-[#E8DFC8] pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                        <Receipt className="size-5 text-[#C52828]" />
                        <div>
                            <h2 className="font-heading text-base font-extrabold text-[#18181B]">
                                Buku Pengeluaran Operasional (Expenses)
                            </h2>
                            <p className="text-xs font-medium text-[#78716C]">
                                Catat pembelian bahan baku, utilitas, gaji,
                                kemasan, dan biaya operasional pada periode{' '}
                                <strong className="text-[#18181B]">
                                    {periodLabel}
                                </strong>
                                .
                            </p>
                        </div>
                    </div>

                    <Button
                        type="button"
                        onClick={openCreateModal}
                        className="h-10 cursor-pointer gap-1.5 rounded-xl bg-[#C52828] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#B02222]"
                    >
                        <Plus className="size-4" />
                        <span>Catat Pengeluaran</span>
                    </Button>
                </div>

                {/* Filter Bar Pengeluaran */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="h-9 rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 text-xs font-bold text-[#3F2D1C] outline-none focus:border-[#C52828]"
                        >
                            <option value="all">Semua Kategori</option>
                            {Object.entries(expenses.categories).map(
                                ([key, label]) => (
                                    <option key={key} value={key}>
                                        {label}
                                    </option>
                                ),
                            )}
                        </select>

                        <select
                            value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value)}
                            className="h-9 rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 text-xs font-bold text-[#3F2D1C] outline-none focus:border-[#C52828]"
                        >
                            <option value="all">Semua Sumber Kas</option>
                            {Object.entries(expenses.payment_sources).map(
                                ([key, label]) => (
                                    <option key={key} value={key}>
                                        {label}
                                    </option>
                                ),
                            )}
                        </select>
                    </div>

                    <div className="rounded-xl bg-[#FAF6EC] px-3 py-1.5 text-xs font-bold text-[#5B4126]">
                        {filteredExpenses.length} catatan • Total:{' '}
                        <span className="font-mono font-black text-[#B91C1C]">
                            {formatRupiah(filteredExpensesTotal)}
                        </span>
                    </div>
                </div>

                {filteredExpenses.length === 0 ? (
                    <EmptyState
                        icon={Receipt}
                        title="Belum Ada Catatan Pengeluaran"
                        description="Catat biaya bahan baku tambahan, listrik, sewa, kemasan, atau operasional lainnya agar laporan Laba Bersih dan Arus Kas akurat."
                        action={
                            <Button
                                type="button"
                                onClick={openCreateModal}
                                className="h-10 cursor-pointer gap-1.5 rounded-xl bg-[#C52828] px-4 text-xs font-bold text-white hover:bg-[#B02222]"
                            >
                                <Plus className="size-4" />
                                Catat Pengeluaran Pertama
                            </Button>
                        }
                    />
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-[#E8DFC8] bg-[#FAF6EC]/80 text-[10.5px] font-extrabold tracking-wider text-[#78716C] uppercase">
                                    <th className="px-3 py-2.5">Tanggal</th>
                                    <th className="px-3 py-2.5">Kategori</th>
                                    <th className="px-3 py-2.5">
                                        Keterangan Biaya
                                    </th>
                                    <th className="px-3 py-2.5">Sumber Kas</th>
                                    <th className="px-3 py-2.5 text-right">
                                        Nominal
                                    </th>
                                    <th className="px-3 py-2.5">Dicatat Oleh</th>
                                    <th className="px-3 py-2.5 text-right">
                                        Aksi
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#EFE5CF]">
                                {filteredExpenses.map((exp) => (
                                    <tr
                                        key={exp.id}
                                        className="transition-colors hover:bg-[#FAF6EC]/50"
                                    >
                                        <td className="px-3 py-2.5 font-semibold whitespace-nowrap text-[#3F2D1C]">
                                            {exp.expense_date_formatted}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            <StatusPill tone="neutral">
                                                {exp.category_label}
                                            </StatusPill>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <p className="font-bold text-[#18181B]">
                                                {exp.title}
                                            </p>
                                            {exp.notes && (
                                                <p className="text-[11px] text-[#78716C]">
                                                    {exp.notes}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-[#5B4126]">
                                            {exp.payment_source_label}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono font-extrabold whitespace-nowrap text-[#B91C1C]">
                                            -{formatRupiah(exp.amount)}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-[#78716C]">
                                            {exp.recorded_by_name}
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                            <div className="inline-flex items-center gap-1">
                                                <IconAction
                                                    icon={Pencil}
                                                    label="Ubah pengeluaran"
                                                    onClick={() =>
                                                        openEditModal(exp)
                                                    }
                                                />
                                                <IconAction
                                                    icon={Trash2}
                                                    label="Hapus pengeluaran"
                                                    variant="danger"
                                                    onClick={() =>
                                                        setDeletingExpense(exp)
                                                    }
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>

            {/* Modal Tambah / Edit Pengeluaran */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="flex w-full max-w-lg flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl">
                    <div className="border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                        <FormDialogHeader
                            icon={Receipt}
                            title={
                                editingExpense
                                    ? 'Edit Catatan Pengeluaran'
                                    : 'Catat Pengeluaran Operasional'
                            }
                            description="Pengeluaran akan langsung memengaruhi perhitungan Laba Bersih & Arus Kas."
                        />
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4 p-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-[#3F2D1C]">
                                    Tanggal Pengeluaran *
                                </label>
                                <input
                                    type="date"
                                    value={form.data.expense_date}
                                    onChange={(e) =>
                                        form.setData(
                                            'expense_date',
                                            e.target.value,
                                        )
                                    }
                                    className="h-10 w-full rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 text-xs font-semibold text-[#18181B] outline-none focus:border-[#C52828]"
                                    required
                                />
                                <FieldError message={form.errors.expense_date} />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-[#3F2D1C]">
                                    Kategori Biaya *
                                </label>
                                <select
                                    value={form.data.category}
                                    onChange={(e) =>
                                        form.setData('category', e.target.value)
                                    }
                                    className="h-10 w-full rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 text-xs font-semibold text-[#18181B] outline-none focus:border-[#C52828]"
                                >
                                    {Object.entries(expenses.categories).map(
                                        ([key, label]) => (
                                            <option key={key} value={key}>
                                                {label}
                                            </option>
                                        ),
                                    )}
                                </select>
                                <FieldError message={form.errors.category} />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[#3F2D1C]">
                                Keterangan / Item Pengeluaran *
                            </label>
                            <input
                                type="text"
                                placeholder="Contoh: Beli 10L Susu Fresh Milk Diamond"
                                value={form.data.title}
                                onChange={(e) =>
                                    form.setData('title', e.target.value)
                                }
                                className="h-10 w-full rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 text-xs font-semibold text-[#18181B] outline-none focus:border-[#C52828]"
                                required
                            />
                            <FieldError message={form.errors.title} />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-[#3F2D1C]">
                                    Nominal (Rp) *
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    placeholder="150000"
                                    value={form.data.amount}
                                    onChange={(e) =>
                                        form.setData('amount', e.target.value)
                                    }
                                    className="h-10 w-full rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 font-mono text-xs font-bold text-[#18181B] outline-none focus:border-[#C52828]"
                                    required
                                />
                                <FieldError message={form.errors.amount} />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-[#3F2D1C]">
                                    Sumber Dana *
                                </label>
                                <select
                                    value={form.data.payment_source}
                                    onChange={(e) =>
                                        form.setData(
                                            'payment_source',
                                            e.target.value,
                                        )
                                    }
                                    className="h-10 w-full rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] px-3 text-xs font-semibold text-[#18181B] outline-none focus:border-[#C52828]"
                                >
                                    {Object.entries(
                                        expenses.payment_sources,
                                    ).map(([key, label]) => (
                                        <option key={key} value={key}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                                <FieldError
                                    message={form.errors.payment_source}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[#3F2D1C]">
                                Catatan / Nomor Nota (Opsional)
                            </label>
                            <textarea
                                rows={2}
                                placeholder="Catatan supplier, no nota, dll"
                                value={form.data.notes}
                                onChange={(e) =>
                                    form.setData('notes', e.target.value)
                                }
                                className="w-full rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] p-3 text-xs font-medium text-[#18181B] outline-none focus:border-[#C52828]"
                            />
                            <FieldError message={form.errors.notes} />
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-[#EBE5DC] pt-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setModalOpen(false)}
                                className="h-10 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A]"
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                disabled={form.processing}
                                className="h-10 cursor-pointer rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white hover:bg-[#B02222]"
                            >
                                {form.processing
                                    ? 'Menyimpan...'
                                    : editingExpense
                                      ? 'Simpan Perubahan'
                                      : 'Simpan Pengeluaran'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Konfirmasi Hapus Pengeluaran */}
            <ConfirmDialog
                open={deletingExpense !== null}
                onOpenChange={(open) => !open && setDeletingExpense(null)}
                title="Hapus Catatan Pengeluaran?"
                description={
                    deletingExpense ? (
                        <span>
                            Anda akan menghapus catatan{' '}
                            <strong>{deletingExpense.title}</strong> senilai{' '}
                            <strong>
                                {formatRupiah(deletingExpense.amount)}
                            </strong>{' '}
                            pada tanggal{' '}
                            <strong>
                                {deletingExpense.expense_date_formatted}
                            </strong>
                            .
                        </span>
                    ) : (
                        ''
                    )
                }
                confirmLabel="Ya, Hapus Catatan"
                processing={deletingBusy}
                onConfirm={handleConfirmDelete}
            />
        </div>
    );
}
