<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\FinancialReportFilterRequest;
use App\Models\Order;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FinancialReportController extends Controller
{
    private const TIMEZONE = 'Asia/Jakarta';

    /**
     * Tampilkan halaman Laporan Keuangan & Analitik Pendapatan Admin.
     */
    public function index(FinancialReportFilterRequest $request): Response
    {
        $reportData = $this->buildReportData($request);

        return Inertia::render('admin/financial-reports/index', $reportData);
    }

    /**
     * Endpoint JSON untuk sinkronisasi data laporan keuangan secara real-time / on-demand.
     */
    public function sync(FinancialReportFilterRequest $request): JsonResponse
    {
        $reportData = $this->buildReportData($request);

        return response()->json($reportData);
    }

    /**
     * Ekspor Laporan Keuangan & Transaksi ke format CSV (UTF-8 BOM untuk kompatibilitas Excel).
     */
    public function exportCsv(FinancialReportFilterRequest $request): StreamedResponse
    {
        $resolved = $this->resolveDateRange($request);
        $summary = $this->computeSummaryMetrics($resolved);
        $recaps = $this->computePeriodRecaps($resolved['start'], $resolved['end_exclusive']);
        $transactionsQuery = $this->buildTransactionsQuery($request, $resolved['start'], $resolved['end_exclusive']);
        $transactions = $transactionsQuery->get();

        $filename = sprintf(
            'Laporan_Keuangan_SIDELINE_%s_sd_%s.csv',
            $resolved['start']->format('Ymd'),
            $resolved['end_inclusive']->format('Ymd')
        );

        return response()->streamDownload(function () use ($resolved, $summary, $recaps, $transactions, $request) {
            $handle = fopen('php://output', 'w');
            if ($handle === false) {
                return;
            }

            // Tambahkan UTF-8 BOM agar karakter & kolom terbaca sempurna di Microsoft Excel
            fwrite($handle, "\xEF\xBB\xBF");

            fputcsv($handle, ['LAPORAN KEUANGAN & ANALITIK PENDAPATAN - SIDE LINE CAFE (SIDEORDER)']);
            fputcsv($handle, ['Periode Laporan', $resolved['label'].' ('.$resolved['start']->format('d/m/Y').' - '.$resolved['end_inclusive']->format('d/m/Y').' WIB)']);
            fputcsv($handle, ['Waktu Cetak', Carbon::now(self::TIMEZONE)->format('d/m/Y H:i:s').' WIB']);
            fputcsv($handle, ['Dicetak Oleh', $request->user()?->name ?? 'Administrator']);
            fputcsv($handle, ['Dasar Perhitungan', 'Pendapatan Bersih Terealisasi dihitung dari transaksi berstatus pembayaran PAID (Lunas) dan status pesanan tidak dibatalkan (non-cancelled) berdasarkan waktu pembayaran (WIB).']);
            fputcsv($handle, []);

            // Bagian 1: Ringkasan Eksekutif Periode
            fputcsv($handle, ['=== RINGKASAN PENDAPATAN PERIODE TERPILIH ===']);
            fputcsv($handle, ['Metrik', 'Nilai / Jumlah', 'Format Rupiah']);
            fputcsv($handle, [
                'Total Pendapatan Bersih Terealisasi (Periode Filter)',
                number_format($summary['period']['net_revenue'], 2, '.', ''),
                $this->formatRupiah($summary['period']['net_revenue']),
            ]);
            fputcsv($handle, [
                'Total Bruto Transaksi Lunas',
                number_format($summary['period']['gross_revenue'], 2, '.', ''),
                $this->formatRupiah($summary['period']['gross_revenue']),
            ]);
            fputcsv($handle, [
                'Total Transaksi Berhasil (Lunas)',
                $summary['period']['paid_transactions_count'],
                $summary['period']['paid_transactions_count'].' transaksi',
            ]);
            fputcsv($handle, [
                'Rata-rata Nilai Transaksi (AOV)',
                number_format($summary['period']['average_order_value'], 2, '.', ''),
                $this->formatRupiah($summary['period']['average_order_value']),
            ]);
            fputcsv($handle, [
                'Pesanan Menunggu Pembayaran (Belum Terealisasi)',
                $summary['period']['pending_payments_count'],
                $this->formatRupiah($summary['period']['pending_payments_amount']).' (Tidak dihitung sebagai pendapatan)',
            ]);
            fputcsv($handle, [
                'Transaksi Gagal / Dibatalkan',
                $summary['period']['failed_or_cancelled_count'],
                $this->formatRupiah($summary['period']['failed_or_cancelled_amount']),
            ]);
            fputcsv($handle, [
                'Total Refund Tercatat',
                $summary['period']['refunded_count'],
                $this->formatRupiah($summary['period']['refund_amount']),
            ]);
            fputcsv($handle, [
                'Pendapatan Hari Ini',
                number_format($summary['today_revenue'], 2, '.', ''),
                $this->formatRupiah($summary['today_revenue']),
            ]);
            fputcsv($handle, [
                'Pendapatan Minggu Ini (Senin - Minggu)',
                number_format($summary['this_week_revenue'], 2, '.', ''),
                $this->formatRupiah($summary['this_week_revenue']),
            ]);
            fputcsv($handle, [
                'Pendapatan Bulan Ini',
                number_format($summary['this_month_revenue'], 2, '.', ''),
                $this->formatRupiah($summary['this_month_revenue']),
            ]);
            fputcsv($handle, []);

            // Bagian 2: Rekapitulasi Harian
            fputcsv($handle, ['=== REKAPITULASI PENDAPATAN HARIAN ===']);
            fputcsv($handle, [
                'Tanggal',
                'Label Hari',
                'Total Pesanan',
                'Transaksi Lunas',
                'Menunggu Bayar',
                'Batal / Gagal',
                'Bruto Transaksi Lunas (Rp)',
                'Refund (Rp)',
                'Pendapatan Bersih Terealisasi (Rp)',
                'Nilai Belum Dibayar (Rp)',
                'Rata-rata Transaksi / AOV (Rp)',
            ]);

            foreach ($recaps['daily']['rows'] as $row) {
                fputcsv($handle, [
                    $row['date'],
                    $row['label'],
                    $row['total_orders'],
                    $row['paid_orders_count'],
                    $row['unpaid_orders_count'],
                    $row['cancelled_orders_count'],
                    number_format($row['gross_revenue'], 2, '.', ''),
                    number_format($row['refund_amount'], 2, '.', ''),
                    number_format($row['net_revenue'], 2, '.', ''),
                    number_format($row['unpaid_amount'], 2, '.', ''),
                    number_format($row['average_order_value'], 2, '.', ''),
                ]);
            }

            fputcsv($handle, [
                'TOTAL PERIODE',
                $resolved['label'],
                $recaps['daily']['totals']['total_orders'],
                $recaps['daily']['totals']['paid_orders_count'],
                $recaps['daily']['totals']['unpaid_orders_count'],
                $recaps['daily']['totals']['cancelled_orders_count'],
                number_format($recaps['daily']['totals']['gross_revenue'], 2, '.', ''),
                number_format($recaps['daily']['totals']['refund_amount'], 2, '.', ''),
                number_format($recaps['daily']['totals']['net_revenue'], 2, '.', ''),
                number_format($recaps['daily']['totals']['unpaid_amount'], 2, '.', ''),
                number_format($recaps['daily']['totals']['average_order_value'], 2, '.', ''),
            ]);
            fputcsv($handle, []);

            // Bagian 3: Daftar Detail Transaksi
            fputcsv($handle, ['=== DETAIL TRANSAKSI DAN RIWAYAT KEUANGAN ===']);
            fputcsv($handle, [
                'Waktu Transaksi (WIB)',
                'Waktu Pesanan Dibuat (WIB)',
                'Waktu Pembayaran (WIB)',
                'ID Pesanan',
                'Pelanggan',
                'Nomor Meja',
                'Metode Pembayaran',
                'Subtotal Aktif (Rp)',
                'Nilai Item Ditolak (Rp)',
                'Diskon',
                'Biaya Tambahan',
                'Refund (Rp)',
                'Total Tagihan (Rp)',
                'Pendapatan Bersih Diakui (Rp)',
                'Status Pembayaran',
                'Status Pesanan',
                'Ringkasan Item',
            ]);

            $tableSubtotalSum = 0.0;
            $tableRefundSum = 0.0;
            $tableNetRevenueSum = 0.0;

            foreach ($transactions as $order) {
                $mapped = $this->formatOrderRecord($order);
                $tableSubtotalSum += $mapped['subtotal'];
                $tableRefundSum += $mapped['refund_amount'];
                $tableNetRevenueSum += $mapped['net_revenue'];

                fputcsv($handle, [
                    $mapped['transaction_date_formatted'],
                    $mapped['created_at_formatted'],
                    $mapped['paid_at_formatted'] ?? '-',
                    $mapped['order_number'],
                    $mapped['customer_name'],
                    'Meja '.$mapped['table_number'],
                    $mapped['payment_method_label'],
                    number_format($mapped['subtotal'], 2, '.', ''),
                    number_format($mapped['rejected_items_amount'], 2, '.', ''),
                    'Tidak Tersedia',
                    'Tidak Tersedia',
                    number_format($mapped['refund_amount'], 2, '.', ''),
                    number_format($mapped['total_amount'], 2, '.', ''),
                    number_format($mapped['net_revenue'], 2, '.', ''),
                    $mapped['payment_status_label'],
                    $mapped['order_status_label'],
                    $mapped['items_summary'],
                ]);
            }

            fputcsv($handle, [
                'TOTAL TRANSAKSI TERFILTER',
                '',
                '',
                $transactions->count().' pesanan',
                '',
                '',
                '',
                number_format($tableSubtotalSum, 2, '.', ''),
                '',
                'Tidak Tersedia',
                'Tidak Tersedia',
                number_format($tableRefundSum, 2, '.', ''),
                '',
                number_format($tableNetRevenueSum, 2, '.', ''),
                $this->formatRupiah($tableNetRevenueSum),
                '',
                '',
            ]);

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store, no-cache',
        ]);
    }

    /**
     * Ekspor Laporan Keuangan & Transaksi ke format PDF asli (application/pdf).
     */
    public function exportPdf(FinancialReportFilterRequest $request): HttpResponse
    {
        $resolved = $this->resolveDateRange($request);
        $summary = $this->computeSummaryMetrics($resolved);
        $recaps = $this->computePeriodRecaps($resolved['start'], $resolved['end_exclusive']);
        $transactions = $this->buildTransactionsQuery($request, $resolved['start'], $resolved['end_exclusive'])
            ->limit(250)
            ->get()
            ->map(fn (Order $order) => $this->formatOrderRecord($order));

        $filename = sprintf(
            'Laporan_Keuangan_SIDELINE_%s_sd_%s.pdf',
            $resolved['start']->format('Ymd'),
            $resolved['end_inclusive']->format('Ymd')
        );

        $lines = [];
        $lines[] = 'LAPORAN KEUANGAN & ANALITIK PENDAPATAN - SIDE LINE CAFE';
        $lines[] = str_repeat('=', 95);
        $lines[] = 'Periode Laporan : '.$resolved['label'].' ('.$resolved['start']->format('d M Y').' - '.$resolved['end_inclusive']->format('d M Y').' WIB)';
        $lines[] = 'Waktu Cetak     : '.Carbon::now(self::TIMEZONE)->format('d M Y H:i:s').' WIB';
        $lines[] = 'Dicetak Oleh    : '.($request->user()?->name ?? 'Administrator');
        $lines[] = str_repeat('-', 95);
        $lines[] = '1. RINGKASAN PENDAPATAN & TRANSAKSI';
        $lines[] = sprintf('   - Pendapatan Bersih Periode Terpilih : %s (%d transaksi lunas)', $this->formatRupiah($summary['period']['net_revenue']), $summary['period']['paid_transactions_count']);
        $lines[] = sprintf('   - Total Bruto Transaksi Lunas        : %s', $this->formatRupiah($summary['period']['gross_revenue']));
        $lines[] = sprintf('   - Rata-rata Nilai Transaksi (AOV)    : %s', $this->formatRupiah($summary['period']['average_order_value']));
        $lines[] = sprintf('   - Menunggu Pembayaran (Unpaid)       : %d pesanan (%s - Belum Terealisasi)', $summary['period']['pending_payments_count'], $this->formatRupiah($summary['period']['pending_payments_amount']));
        $lines[] = sprintf('   - Transaksi Gagal / Dibatalkan       : %d pesanan (%s)', $summary['period']['failed_or_cancelled_count'], $this->formatRupiah($summary['period']['failed_or_cancelled_amount']));
        $lines[] = sprintf('   - Total Refund Tercatat              : %d transaksi (%s)', $summary['period']['refunded_count'], $this->formatRupiah($summary['period']['refund_amount']));
        $lines[] = sprintf('   - Pendapatan Hari Ini                : %s', $this->formatRupiah($summary['today_revenue']));
        $lines[] = sprintf('   - Pendapatan Minggu Ini              : %s', $this->formatRupiah($summary['this_week_revenue']));
        $lines[] = sprintf('   - Pendapatan Bulan Ini               : %s', $this->formatRupiah($summary['this_month_revenue']));
        $lines[] = str_repeat('-', 95);
        $lines[] = '2. REKAPITULASI HARIAN PERIODE TERPILIH';
        $lines[] = sprintf('%-14s | %-10s | %-10s | %-18s | %-18s', 'Tanggal', 'Pesanan', 'Lunas', 'Belum Bayar', 'Pendapatan Bersih');
        $lines[] = str_repeat('-', 95);

        foreach ($recaps['daily']['rows'] as $row) {
            if ($row['total_orders'] > 0 || count($recaps['daily']['rows']) <= 14) {
                $lines[] = sprintf(
                    '%-14s | %-10d | %-10d | %-18s | %-18s',
                    $row['date'],
                    $row['total_orders'],
                    $row['paid_orders_count'],
                    $this->formatRupiah($row['unpaid_amount']),
                    $this->formatRupiah($row['net_revenue'])
                );
            }
        }

        $lines[] = str_repeat('-', 95);
        $lines[] = sprintf(
            '%-14s | %-10d | %-10d | %-18s | %-18s',
            'TOTAL PERIODE',
            $recaps['daily']['totals']['total_orders'],
            $recaps['daily']['totals']['paid_orders_count'],
            $this->formatRupiah($recaps['daily']['totals']['unpaid_amount']),
            $this->formatRupiah($recaps['daily']['totals']['net_revenue'])
        );
        $lines[] = str_repeat('-', 95);
        $lines[] = '3. DAFTAR TRANSAKSI TERFILTER';
        $lines[] = sprintf('%-18s | %-17s | %-7s | %-9s | %-11s | %-16s', 'Waktu (WIB)', 'ID Pesanan', 'Meja', 'Metode', 'Status', 'Pendapatan Bersih');
        $lines[] = str_repeat('-', 95);

        $totalTableNet = 0.0;
        foreach ($transactions as $tx) {
            $totalTableNet += $tx['net_revenue'];
            $lines[] = sprintf(
                '%-18s | %-17s | %-7s | %-9s | %-11s | %-16s',
                substr($tx['transaction_date_formatted'], 0, 18),
                substr($tx['order_number'], 0, 17),
                'Meja '.$tx['table_number'],
                substr($tx['payment_method_label'], 0, 9),
                substr($tx['payment_status_label'], 0, 11),
                $this->formatRupiah($tx['net_revenue'])
            );
        }

        $lines[] = str_repeat('-', 95);
        $lines[] = sprintf(
            'TOTAL PENDAPATAN BERSIH TRANSAKSI TERFILTER (%d pesanan): %s',
            $transactions->count(),
            $this->formatRupiah($totalTableNet)
        );
        $lines[] = 'Catatan: Angka pendapatan di atas adalah Pendapatan Penjualan Bersih (Omzet Terealisasi), bukan Laba Bersih.';

        $pdfBinary = $this->renderNativePdfDocument($lines);

        return response($pdfBinary, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
            'Cache-Control' => 'no-store, no-cache',
        ]);
    }

    /**
     * Bangun seluruh payload data untuk halaman Laporan Keuangan Admin.
     */
    private function buildReportData(FinancialReportFilterRequest $request): array
    {
        $resolved = $this->resolveDateRange($request);
        $summary = $this->computeSummaryMetrics($resolved);
        $recaps = $this->computePeriodRecaps($resolved['start'], $resolved['end_exclusive']);

        $requestedAggregation = (string) $request->query('aggregation', 'auto');
        $chartAggregation = $this->resolveChartAggregation($requestedAggregation, $resolved['days_count']);
        $chart = $this->buildChartSeries($resolved['start'], $resolved['end_exclusive'], $chartAggregation, $recaps);

        $recapView = (string) $request->query('recap_view', 'daily');
        if (! in_array($recapView, ['daily', 'weekly', 'monthly'], true)) {
            $recapView = 'daily';
        }

        $perPage = (int) $request->query('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $transactionsQuery = $this->buildTransactionsQuery($request, $resolved['start'], $resolved['end_exclusive']);

        // Hitung agregasi total dari tabel transaksi yang sudah difilter (search, status, metode bayar)
        $filteredTableMetrics = (clone $transactionsQuery)
            ->reorder()
            ->selectRaw("
                COUNT(orders.id) as filtered_count,
                COALESCE(SUM(orders.subtotal), 0) as filtered_subtotal,
                COALESCE(SUM(COALESCE(orders.refunded_amount, 0)), 0) as filtered_refund,
                COALESCE(SUM(CASE WHEN orders.payment_status = 'paid' AND orders.order_status != 'cancelled' THEN orders.total_amount - COALESCE(orders.refunded_amount, 0) ELSE 0 END), 0) as filtered_net_revenue,
                COALESCE(SUM(CASE WHEN orders.payment_status = 'unpaid' AND orders.order_status != 'cancelled' THEN orders.total_amount ELSE 0 END), 0) as filtered_unpaid_amount
            ")
            ->first();

        $paginated = $transactionsQuery->paginate($perPage)->withQueryString();
        $paginated->through(fn (Order $order) => $this->formatOrderRecord($order));

        return [
            'filters' => [
                'preset' => $resolved['preset'],
                'start_date' => $resolved['start']->format('Y-m-d'),
                'end_date' => $resolved['end_inclusive']->format('Y-m-d'),
                'period_label' => $resolved['label'],
                'aggregation' => $requestedAggregation,
                'effective_aggregation' => $chartAggregation,
                'recap_view' => $recapView,
                'search' => (string) $request->query('search', ''),
                'payment_status' => (string) $request->query('payment_status', 'all'),
                'order_status' => (string) $request->query('order_status', 'all'),
                'payment_method' => (string) $request->query('payment_method', 'all'),
                'sort_by' => (string) $request->query('sort_by', 'transaction_date'),
                'sort_dir' => (string) $request->query('sort_dir', 'desc'),
                'per_page' => $perPage,
            ],
            'summary' => $summary,
            'recaps' => $recaps,
            'chart' => $chart,
            'transactions' => $paginated,
            'filtered_table_totals' => [
                'count' => (int) ($filteredTableMetrics->filtered_count ?? 0),
                'subtotal' => (float) ($filteredTableMetrics->filtered_subtotal ?? 0),
                'refund_amount' => (float) ($filteredTableMetrics->filtered_refund ?? 0),
                'net_revenue' => max(0.0, (float) ($filteredTableMetrics->filtered_net_revenue ?? 0)),
                'unpaid_amount' => (float) ($filteredTableMetrics->filtered_unpaid_amount ?? 0),
            ],
            'calculation_rules' => [
                'timezone' => 'Asia/Jakarta (WIB)',
                'week_definition' => 'Senin 00:00:00 WIB sampai Minggu 23:59:59 WIB (sebelum Senin 00:00:00 WIB berikutnya)',
                'authoritative_source' => 'Tabel orders (1 baris = 1 transaksi pesanan unik, tanpa duplikasi join item)',
                'transaction_date_basis' => 'Menggunakan waktu pembayaran berhasil (paid_at) untuk pesanan lunas, dengan fallback ke waktu pembuatan pesanan (created_at) untuk data historis atau pesanan belum dibayar.',
                'realized_revenue_formula' => 'Pendapatan Bersih = SUM(total_amount - refunded_amount) untuk pesanan dengan payment_status = "paid" dan order_status != "cancelled".',
                'unpaid_policy' => 'Pesanan dengan payment_status = "unpaid" dicatat terpisah sebagai Pembayaran Menunggu dan bernilai Rp 0 pada Pendapatan Terealisasi.',
                'cancelled_and_failed_policy' => 'Pesanan yang dibatalkan (cancelled) atau pembayaran gagal (failed) tidak dihitung sebagai pendapatan terealisasi.',
                'discount_support' => 'Belum Didukung (skema database saat ini belum memiliki kolom diskon terpisah).',
                'additional_fees_support' => 'Belum Didukung (skema database saat ini belum memiliki pajak/service charge tambahan; total_amount = subtotal item aktif).',
                'profit_disclaimer' => 'Angka yang ditampilkan adalah Omzet / Pendapatan Penjualan Bersih (Realized Revenue), BUKAN Laba Bersih karena Harga Pokok Penjualan (HPP) dan beban operasional belum dicatat pada sistem.',
            ],
            'synced_at' => Carbon::now(self::TIMEZONE)->format('d M Y, H:i:s').' WIB',
        ];
    }

    /**
     * Resolusi preset tanggal dan rentang waktu ke zona waktu Asia/Jakarta.
     * Menggunakan batas half-open [start 00:00:00, end_exclusive 00:00:00 hari berikutnya)
     * agar tidak ada transaksi yang terhitung ganda atau hilang di batas tengah malam.
     */
    private function resolveDateRange(FinancialReportFilterRequest $request): array
    {
        $now = Carbon::now(self::TIMEZONE);
        $preset = (string) $request->query('preset', '');
        $startDateParam = $request->query('start_date');
        $endDateParam = $request->query('end_date');

        if ($preset === '' && ($startDateParam || $endDateParam)) {
            $preset = 'custom';
        } elseif ($preset === '') {
            $preset = 'this_month';
        }

        switch ($preset) {
            case 'today':
                $start = $now->copy()->startOfDay();
                $endInclusive = $now->copy()->endOfDay();
                $label = 'Hari Ini ('.$this->formatIndoDate($start).')';
                break;

            case 'yesterday':
                $yesterday = $now->copy()->subDay();
                $start = $yesterday->copy()->startOfDay();
                $endInclusive = $yesterday->copy()->endOfDay();
                $label = 'Kemarin ('.$this->formatIndoDate($start).')';
                break;

            case 'last_7_days':
                $start = $now->copy()->subDays(6)->startOfDay();
                $endInclusive = $now->copy()->endOfDay();
                $label = '7 Hari Terakhir ('.$this->formatIndoDate($start).' - '.$this->formatIndoDate($endInclusive).')';
                break;

            case 'this_week':
                $start = $now->copy()->startOfWeek(Carbon::MONDAY)->startOfDay();
                $endInclusive = $now->copy()->endOfWeek(Carbon::SUNDAY)->endOfDay();
                $label = 'Minggu Ini ('.$this->formatIndoDate($start).' - '.$this->formatIndoDate($endInclusive).')';
                break;

            case 'last_month':
                $lastMonth = $now->copy()->subMonthNoOverflow();
                $start = $lastMonth->copy()->startOfMonth()->startOfDay();
                $endInclusive = $lastMonth->copy()->endOfMonth()->endOfDay();
                $label = 'Bulan Lalu ('.$this->formatIndoMonthYear($start).')';
                break;

            case 'custom':
                $start = $startDateParam
                    ? Carbon::createFromFormat('Y-m-d', (string) $startDateParam, self::TIMEZONE)->startOfDay()
                    : $now->copy()->startOfMonth()->startOfDay();
                $endInclusive = $endDateParam
                    ? Carbon::createFromFormat('Y-m-d', (string) $endDateParam, self::TIMEZONE)->endOfDay()
                    : $now->copy()->endOfDay();

                if ($endInclusive->lt($start)) {
                    $endInclusive = $start->copy()->endOfDay();
                }

                $label = 'Rentang Kustom ('.$this->formatIndoDate($start).' - '.$this->formatIndoDate($endInclusive).')';
                break;

            case 'this_month':
            default:
                $preset = 'this_month';
                $start = $now->copy()->startOfMonth()->startOfDay();
                $endInclusive = $now->copy()->endOfMonth()->endOfDay();
                $label = 'Bulan Ini ('.$this->formatIndoMonthYear($start).')';
                break;
        }

        $endExclusive = $endInclusive->copy()->startOfDay()->addDay();
        $daysCount = (int) round($start->diffInDays($endExclusive));
        $daysCount = max(1, $daysCount);

        // Hitung periode pembanding sebelumnya dengan durasi yang setara dan tidak tumpang tindih
        if ($preset === 'this_month') {
            $prevMonth = $start->copy()->subMonthNoOverflow();
            $prevStart = $prevMonth->copy()->startOfMonth()->startOfDay();
            $prevEndExclusive = $prevMonth->copy()->endOfMonth()->startOfDay()->addDay();
            $prevLabel = 'Bulan Lalu ('.$this->formatIndoMonthYear($prevStart).')';
        } elseif ($preset === 'last_month') {
            $twoMonthsAgo = $start->copy()->subMonthNoOverflow();
            $prevStart = $twoMonthsAgo->copy()->startOfMonth()->startOfDay();
            $prevEndExclusive = $twoMonthsAgo->copy()->endOfMonth()->startOfDay()->addDay();
            $prevLabel = $this->formatIndoMonthYear($prevStart);
        } elseif ($preset === 'this_week') {
            $prevStart = $start->copy()->subWeek();
            $prevEndExclusive = $start->copy();
            $prevLabel = 'Minggu Lalu ('.$this->formatIndoDate($prevStart).' - '.$this->formatIndoDate($prevEndExclusive->copy()->subDay()).')';
        } else {
            $prevStart = $start->copy()->subDays($daysCount);
            $prevEndExclusive = $start->copy();
            $prevLabel = $this->formatIndoDate($prevStart).' - '.$this->formatIndoDate($prevEndExclusive->copy()->subDay());
        }

        return [
            'preset' => $preset,
            'start' => $start,
            'end_inclusive' => $endInclusive,
            'end_exclusive' => $endExclusive,
            'days_count' => $daysCount,
            'label' => $label,
            'prev_start' => $prevStart,
            'prev_end_exclusive' => $prevEndExclusive,
            'prev_label' => $prevLabel,
        ];
    }

    /**
     * Hitung seluruh metrik kartu ringkasan (Hari Ini, Minggu Ini, Bulan Ini, dan Periode Filter + Perbandingan).
     */
    private function computeSummaryMetrics(array $resolved): array
    {
        $now = Carbon::now(self::TIMEZONE);

        // Batas Hari Ini & Kemarin
        $todayStart = $now->copy()->startOfDay();
        $tomorrowStart = $todayStart->copy()->addDay();
        $yesterdayStart = $todayStart->copy()->subDay();

        // Batas Minggu Ini (Senin 00:00 WIB s/d sebelum Senin berikutnya) & Minggu Lalu
        $thisWeekStart = $now->copy()->startOfWeek(Carbon::MONDAY)->startOfDay();
        $nextWeekStart = $thisWeekStart->copy()->addWeek();
        $lastWeekStart = $thisWeekStart->copy()->subWeek();

        // Batas Bulan Ini & Bulan Lalu
        $thisMonthStart = $now->copy()->startOfMonth()->startOfDay();
        $nextMonthStart = $thisMonthStart->copy()->addMonthNoOverflow()->startOfMonth()->startOfDay();
        $lastMonthStart = $thisMonthStart->copy()->subMonthNoOverflow()->startOfMonth()->startOfDay();

        // Batas Periode Filter & Periode Sebelumnya
        $periodStart = $resolved['start'];
        $periodEndExclusive = $resolved['end_exclusive'];
        $prevPeriodStart = $resolved['prev_start'];
        $prevPeriodEndExclusive = $resolved['prev_end_exclusive'];

        $effDateExpr = 'COALESCE(orders.paid_at, orders.created_at)';
        $isRealizedExpr = "(orders.payment_status = 'paid' AND orders.order_status != 'cancelled')";
        $netAmountExpr = 'MAX(0, orders.total_amount - COALESCE(orders.refunded_amount, 0))';
        if (DB::connection()->getDriverName() === 'pgsql') {
            $netAmountExpr = 'GREATEST(0, orders.total_amount - COALESCE(orders.refunded_amount, 0))';
        }

        $metrics = DB::table('orders')
            ->selectRaw("
                -- Hari Ini & Kemarin
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as today_revenue,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN 1 END) as today_paid_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN 1 END) as today_orders_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as yesterday_revenue,

                -- Minggu Ini & Minggu Lalu
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as this_week_revenue,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN 1 END) as this_week_paid_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN 1 END) as this_week_orders_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as last_week_revenue,

                -- Bulan Ini & Bulan Lalu
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as this_month_revenue,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN 1 END) as this_month_paid_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN 1 END) as this_month_orders_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as last_month_revenue,

                -- Periode Terpilih (Filter Aktif)
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as period_net_revenue,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN orders.total_amount ELSE 0 END), 0) as period_gross_revenue,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN 1 END) as period_total_orders,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN 1 END) as period_paid_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.payment_status = 'unpaid' AND orders.order_status != 'cancelled' THEN 1 END) as period_unpaid_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.payment_status = 'unpaid' AND orders.order_status != 'cancelled' THEN orders.total_amount ELSE 0 END), 0) as period_unpaid_amount,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND (orders.order_status = 'cancelled' OR orders.payment_status = 'failed') THEN 1 END) as period_failed_cancelled_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.order_status = 'cancelled' THEN 1 END) as period_cancelled_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.payment_status = 'failed' THEN 1 END) as period_failed_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND (orders.order_status = 'cancelled' OR orders.payment_status = 'failed') THEN orders.total_amount ELSE 0 END), 0) as period_failed_cancelled_amount,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND (orders.payment_status = 'refunded' OR COALESCE(orders.refunded_amount, 0) > 0) THEN 1 END) as period_refunded_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN COALESCE(orders.refunded_amount, 0) ELSE 0 END), 0) as period_refund_amount,

                -- Periode Pembanding Sebelumnya
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as prev_period_net_revenue,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN 1 END) as prev_period_paid_count
            ", [
                // Hari Ini & Kemarin
                $todayStart->format('Y-m-d H:i:s'), $tomorrowStart->format('Y-m-d H:i:s'),
                $todayStart->format('Y-m-d H:i:s'), $tomorrowStart->format('Y-m-d H:i:s'),
                $todayStart->format('Y-m-d H:i:s'), $tomorrowStart->format('Y-m-d H:i:s'),
                $yesterdayStart->format('Y-m-d H:i:s'), $todayStart->format('Y-m-d H:i:s'),

                // Minggu Ini & Minggu Lalu
                $thisWeekStart->format('Y-m-d H:i:s'), $nextWeekStart->format('Y-m-d H:i:s'),
                $thisWeekStart->format('Y-m-d H:i:s'), $nextWeekStart->format('Y-m-d H:i:s'),
                $thisWeekStart->format('Y-m-d H:i:s'), $nextWeekStart->format('Y-m-d H:i:s'),
                $lastWeekStart->format('Y-m-d H:i:s'), $thisWeekStart->format('Y-m-d H:i:s'),

                // Bulan Ini & Bulan Lalu
                $thisMonthStart->format('Y-m-d H:i:s'), $nextMonthStart->format('Y-m-d H:i:s'),
                $thisMonthStart->format('Y-m-d H:i:s'), $nextMonthStart->format('Y-m-d H:i:s'),
                $thisMonthStart->format('Y-m-d H:i:s'), $nextMonthStart->format('Y-m-d H:i:s'),
                $lastMonthStart->format('Y-m-d H:i:s'), $thisMonthStart->format('Y-m-d H:i:s'),

                // Periode Filter
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),

                // Periode Sebelumnya
                $prevPeriodStart->format('Y-m-d H:i:s'), $prevPeriodEndExclusive->format('Y-m-d H:i:s'),
                $prevPeriodStart->format('Y-m-d H:i:s'), $prevPeriodEndExclusive->format('Y-m-d H:i:s'),
            ])
            ->first();

        // Breakdown Metode Pembayaran pada Periode Terpilih (hanya dari sumber otoritatif orders)
        $methodBreakdownRows = DB::table('orders')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [
                $periodStart->format('Y-m-d H:i:s'),
                $periodEndExclusive->format('Y-m-d H:i:s'),
            ])
            ->whereRaw($isRealizedExpr)
            ->selectRaw("
                COALESCE(payment_method, 'cash') as method,
                COUNT(id) as transactions_count,
                COALESCE(SUM({$netAmountExpr}), 0) as net_revenue
            ")
            ->groupByRaw("COALESCE(payment_method, 'cash')")
            ->get()
            ->keyBy('method');

        $paymentMethods = [];
        foreach (['cash' => 'Tunai (Cash)', 'qris' => 'QRIS', 'transfer' => 'Transfer Bank', 'debit' => 'Kartu Debit'] as $code => $label) {
            $row = $methodBreakdownRows->get($code);
            $paymentMethods[] = [
                'method' => $code,
                'label' => $label,
                'transactions_count' => (int) ($row->transactions_count ?? 0),
                'net_revenue' => (float) ($row->net_revenue ?? 0),
            ];
        }

        $todayRevenue = (float) ($metrics->today_revenue ?? 0);
        $yesterdayRevenue = (float) ($metrics->yesterday_revenue ?? 0);
        $thisWeekRevenue = (float) ($metrics->this_week_revenue ?? 0);
        $lastWeekRevenue = (float) ($metrics->last_week_revenue ?? 0);
        $thisMonthRevenue = (float) ($metrics->this_month_revenue ?? 0);
        $lastMonthRevenue = (float) ($metrics->last_month_revenue ?? 0);

        $periodNetRevenue = (float) ($metrics->period_net_revenue ?? 0);
        $periodGrossRevenue = (float) ($metrics->period_gross_revenue ?? 0);
        $periodPaidCount = (int) ($metrics->period_paid_count ?? 0);
        $periodAov = $periodPaidCount > 0 ? round($periodNetRevenue / $periodPaidCount, 2) : 0.0;

        $prevPeriodNetRevenue = (float) ($metrics->prev_period_net_revenue ?? 0);
        $prevPeriodPaidCount = (int) ($metrics->prev_period_paid_count ?? 0);
        $prevPeriodAov = $prevPeriodPaidCount > 0 ? round($prevPeriodNetRevenue / $prevPeriodPaidCount, 2) : 0.0;

        return [
            'today_revenue' => $todayRevenue,
            'today_paid_count' => (int) ($metrics->today_paid_count ?? 0),
            'today_orders_count' => (int) ($metrics->today_orders_count ?? 0),
            'yesterday_revenue' => $yesterdayRevenue,
            'today_growth_percent' => $this->calculateGrowthPercent($todayRevenue, $yesterdayRevenue),

            'this_week_revenue' => $thisWeekRevenue,
            'this_week_paid_count' => (int) ($metrics->this_week_paid_count ?? 0),
            'this_week_orders_count' => (int) ($metrics->this_week_orders_count ?? 0),
            'last_week_revenue' => $lastWeekRevenue,
            'this_week_growth_percent' => $this->calculateGrowthPercent($thisWeekRevenue, $lastWeekRevenue),
            'this_week_label' => $this->formatIndoDate($thisWeekStart).' - '.$this->formatIndoDate($nextWeekStart->copy()->subDay()),

            'this_month_revenue' => $thisMonthRevenue,
            'this_month_paid_count' => (int) ($metrics->this_month_paid_count ?? 0),
            'this_month_orders_count' => (int) ($metrics->this_month_orders_count ?? 0),
            'last_month_revenue' => $lastMonthRevenue,
            'this_month_growth_percent' => $this->calculateGrowthPercent($thisMonthRevenue, $lastMonthRevenue),
            'this_month_label' => $this->formatIndoMonthYear($thisMonthStart),

            'period' => [
                'label' => $resolved['label'],
                'net_revenue' => $periodNetRevenue,
                'gross_revenue' => $periodGrossRevenue,
                'previous_period_revenue' => $prevPeriodNetRevenue,
                'previous_period_label' => $resolved['prev_label'],
                'period_growth_percent' => $this->calculateGrowthPercent($periodNetRevenue, $prevPeriodNetRevenue),
                'total_orders_count' => (int) ($metrics->period_total_orders ?? 0),
                'paid_transactions_count' => $periodPaidCount,
                'average_order_value' => $periodAov,
                'previous_aov' => $prevPeriodAov,
                'aov_growth_percent' => $this->calculateGrowthPercent($periodAov, $prevPeriodAov),
                'pending_payments_count' => (int) ($metrics->period_unpaid_count ?? 0),
                'pending_payments_amount' => (float) ($metrics->period_unpaid_amount ?? 0),
                'failed_or_cancelled_count' => (int) ($metrics->period_failed_cancelled_count ?? 0),
                'cancelled_orders_count' => (int) ($metrics->period_cancelled_count ?? 0),
                'failed_payments_count' => (int) ($metrics->period_failed_count ?? 0),
                'failed_or_cancelled_amount' => (float) ($metrics->period_failed_cancelled_amount ?? 0),
                'refunded_count' => (int) ($metrics->period_refunded_count ?? 0),
                'refund_amount' => (float) ($metrics->period_refund_amount ?? 0),
            ],

            'payment_methods' => $paymentMethods,
        ];
    }

    /**
     * Hitung Rekapitulasi Harian, Mingguan, dan Bulanan menggunakan agregasi database per tanggal.
     */
    private function computePeriodRecaps(Carbon $start, Carbon $endExclusive): array
    {
        $driver = DB::connection()->getDriverName();
        $effDateExpr = 'COALESCE(orders.paid_at, orders.created_at)';
        $dayKeyExpr = $driver === 'pgsql'
            ? "TO_CHAR({$effDateExpr}, 'YYYY-MM-DD')"
            : "strftime('%Y-%m-%d', {$effDateExpr})";
        $isRealizedExpr = "(orders.payment_status = 'paid' AND orders.order_status != 'cancelled')";
        $netAmountExpr = $driver === 'pgsql'
            ? 'GREATEST(0, orders.total_amount - COALESCE(orders.refunded_amount, 0))'
            : 'MAX(0, orders.total_amount - COALESCE(orders.refunded_amount, 0))';

        $dailyDbRows = DB::table('orders')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [
                $start->format('Y-m-d H:i:s'),
                $endExclusive->format('Y-m-d H:i:s'),
            ])
            ->selectRaw("
                {$dayKeyExpr} as day_date,
                COUNT(orders.id) as total_orders,
                COUNT(CASE WHEN {$isRealizedExpr} THEN 1 END) as paid_orders_count,
                COUNT(CASE WHEN orders.payment_status = 'unpaid' AND orders.order_status != 'cancelled' THEN 1 END) as unpaid_orders_count,
                COUNT(CASE WHEN orders.order_status = 'cancelled' OR orders.payment_status = 'failed' THEN 1 END) as cancelled_orders_count,
                COALESCE(SUM(CASE WHEN {$isRealizedExpr} THEN orders.total_amount ELSE 0 END), 0) as gross_revenue,
                COALESCE(SUM(COALESCE(orders.refunded_amount, 0)), 0) as refund_amount,
                COALESCE(SUM(CASE WHEN {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as net_revenue,
                COALESCE(SUM(CASE WHEN orders.payment_status = 'unpaid' AND orders.order_status != 'cancelled' THEN orders.total_amount ELSE 0 END), 0) as unpaid_amount
            ")
            ->groupByRaw($dayKeyExpr)
            ->orderByRaw("{$dayKeyExpr} ASC")
            ->get()
            ->keyBy('day_date');

        $dailyRows = [];
        $weeklyBuckets = [];
        $monthlyBuckets = [];

        $totals = [
            'total_orders' => 0,
            'paid_orders_count' => 0,
            'unpaid_orders_count' => 0,
            'cancelled_orders_count' => 0,
            'gross_revenue' => 0.0,
            'refund_amount' => 0.0,
            'net_revenue' => 0.0,
            'unpaid_amount' => 0.0,
            'average_order_value' => 0.0,
        ];

        $cursor = $start->copy()->startOfDay();
        while ($cursor->lt($endExclusive)) {
            $dateKey = $cursor->format('Y-m-d');
            $dbRow = $dailyDbRows->get($dateKey);

            $totalOrders = (int) ($dbRow->total_orders ?? 0);
            $paidCount = (int) ($dbRow->paid_orders_count ?? 0);
            $unpaidCount = (int) ($dbRow->unpaid_orders_count ?? 0);
            $cancelledCount = (int) ($dbRow->cancelled_orders_count ?? 0);
            $grossRev = (float) ($dbRow->gross_revenue ?? 0.0);
            $refundAmt = (float) ($dbRow->refund_amount ?? 0.0);
            $netRev = (float) ($dbRow->net_revenue ?? 0.0);
            $unpaidAmt = (float) ($dbRow->unpaid_amount ?? 0.0);
            $aov = $paidCount > 0 ? round($netRev / $paidCount, 2) : 0.0;

            $dailyRows[] = [
                'date' => $dateKey,
                'short_label' => $this->formatIndoShortDate($cursor),
                'label' => $this->formatIndoDayDate($cursor),
                'total_orders' => $totalOrders,
                'paid_orders_count' => $paidCount,
                'unpaid_orders_count' => $unpaidCount,
                'cancelled_orders_count' => $cancelledCount,
                'gross_revenue' => $grossRev,
                'refund_amount' => $refundAmt,
                'net_revenue' => $netRev,
                'unpaid_amount' => $unpaidAmt,
                'average_order_value' => $aov,
            ];

            // Akumulasi ke Mingguan (Senin 00:00 WIB - Minggu 23:59 WIB)
            $weekMonday = $cursor->copy()->startOfWeek(Carbon::MONDAY);
            $weekSunday = $cursor->copy()->endOfWeek(Carbon::SUNDAY);
            $weekKey = $weekMonday->format('Y-m-d');

            if (! isset($weeklyBuckets[$weekKey])) {
                $weeklyBuckets[$weekKey] = [
                    'week_key' => $weekKey,
                    'week_start' => $weekMonday->format('Y-m-d'),
                    'week_end' => $weekSunday->format('Y-m-d'),
                    'short_label' => $this->formatIndoShortDate($weekMonday).' - '.$this->formatIndoShortDate($weekSunday),
                    'label' => 'Minggu ('.$this->formatIndoDate($weekMonday).' - '.$this->formatIndoDate($weekSunday).')',
                    'total_orders' => 0,
                    'paid_orders_count' => 0,
                    'unpaid_orders_count' => 0,
                    'cancelled_orders_count' => 0,
                    'gross_revenue' => 0.0,
                    'refund_amount' => 0.0,
                    'net_revenue' => 0.0,
                    'unpaid_amount' => 0.0,
                    'average_order_value' => 0.0,
                ];
            }

            $weeklyBuckets[$weekKey]['total_orders'] += $totalOrders;
            $weeklyBuckets[$weekKey]['paid_orders_count'] += $paidCount;
            $weeklyBuckets[$weekKey]['unpaid_orders_count'] += $unpaidCount;
            $weeklyBuckets[$weekKey]['cancelled_orders_count'] += $cancelledCount;
            $weeklyBuckets[$weekKey]['gross_revenue'] += $grossRev;
            $weeklyBuckets[$weekKey]['refund_amount'] += $refundAmt;
            $weeklyBuckets[$weekKey]['net_revenue'] += $netRev;
            $weeklyBuckets[$weekKey]['unpaid_amount'] += $unpaidAmt;

            // Akumulasi ke Bulanan (YYYY-MM)
            $monthKey = $cursor->format('Y-m');
            if (! isset($monthlyBuckets[$monthKey])) {
                $monthlyBuckets[$monthKey] = [
                    'month_key' => $monthKey,
                    'short_label' => $this->formatIndoShortMonthYear($cursor),
                    'label' => $this->formatIndoMonthYear($cursor),
                    'total_orders' => 0,
                    'paid_orders_count' => 0,
                    'unpaid_orders_count' => 0,
                    'cancelled_orders_count' => 0,
                    'gross_revenue' => 0.0,
                    'refund_amount' => 0.0,
                    'net_revenue' => 0.0,
                    'unpaid_amount' => 0.0,
                    'average_order_value' => 0.0,
                ];
            }

            $monthlyBuckets[$monthKey]['total_orders'] += $totalOrders;
            $monthlyBuckets[$monthKey]['paid_orders_count'] += $paidCount;
            $monthlyBuckets[$monthKey]['unpaid_orders_count'] += $unpaidCount;
            $monthlyBuckets[$monthKey]['cancelled_orders_count'] += $cancelledCount;
            $monthlyBuckets[$monthKey]['gross_revenue'] += $grossRev;
            $monthlyBuckets[$monthKey]['refund_amount'] += $refundAmt;
            $monthlyBuckets[$monthKey]['net_revenue'] += $netRev;
            $monthlyBuckets[$monthKey]['unpaid_amount'] += $unpaidAmt;

            // Akumulasi Grand Total Periode
            $totals['total_orders'] += $totalOrders;
            $totals['paid_orders_count'] += $paidCount;
            $totals['unpaid_orders_count'] += $unpaidCount;
            $totals['cancelled_orders_count'] += $cancelledCount;
            $totals['gross_revenue'] += $grossRev;
            $totals['refund_amount'] += $refundAmt;
            $totals['net_revenue'] += $netRev;
            $totals['unpaid_amount'] += $unpaidAmt;

            $cursor->addDay();
        }

        foreach ($weeklyBuckets as &$wb) {
            $wb['average_order_value'] = $wb['paid_orders_count'] > 0
                ? round($wb['net_revenue'] / $wb['paid_orders_count'], 2)
                : 0.0;
        }
        unset($wb);

        foreach ($monthlyBuckets as &$mb) {
            $mb['average_order_value'] = $mb['paid_orders_count'] > 0
                ? round($mb['net_revenue'] / $mb['paid_orders_count'], 2)
                : 0.0;
        }
        unset($mb);

        $totals['average_order_value'] = $totals['paid_orders_count'] > 0
            ? round($totals['net_revenue'] / $totals['paid_orders_count'], 2)
            : 0.0;

        return [
            'daily' => [
                'rows' => $dailyRows,
                'totals' => $totals,
            ],
            'weekly' => [
                'rows' => array_values($weeklyBuckets),
                'totals' => $totals,
            ],
            'monthly' => [
                'rows' => array_values($monthlyBuckets),
                'totals' => $totals,
            ],
        ];
    }

    /**
     * Tentukan mode agregasi grafik tren pendapatan (harian untuk rentang pendek, mingguan/bulanan untuk rentang panjang).
     */
    private function resolveChartAggregation(string $requested, int $daysCount): string
    {
        if (in_array($requested, ['daily', 'weekly', 'monthly'], true)) {
            return $requested;
        }

        if ($daysCount <= 31) {
            return 'daily';
        }

        if ($daysCount <= 120) {
            return 'weekly';
        }

        return 'monthly';
    }

    /**
     * Bangun data grafik tren pendapatan dengan nilai nol untuk periode tanpa transaksi.
     */
    private function buildChartSeries(Carbon $start, Carbon $endExclusive, string $aggregation, array $recaps): array
    {
        $sourceRows = match ($aggregation) {
            'weekly' => $recaps['weekly']['rows'],
            'monthly' => $recaps['monthly']['rows'],
            default => $recaps['daily']['rows'],
        };

        $series = [];
        $maxRevenue = 0.0;
        $totalRevenue = 0.0;
        $totalPaidOrders = 0;

        foreach ($sourceRows as $row) {
            $netRev = (float) $row['net_revenue'];
            $paidCount = (int) $row['paid_orders_count'];
            if ($netRev > $maxRevenue) {
                $maxRevenue = $netRev;
            }
            $totalRevenue += $netRev;
            $totalPaidOrders += $paidCount;

            $series[] = [
                'key' => $row['date'] ?? $row['week_key'] ?? $row['month_key'],
                'label' => $row['short_label'],
                'full_label' => $row['label'],
                'net_revenue' => $netRev,
                'gross_revenue' => (float) $row['gross_revenue'],
                'paid_orders_count' => $paidCount,
                'total_orders_count' => (int) $row['total_orders'],
                'unpaid_amount' => (float) $row['unpaid_amount'],
                'refund_amount' => (float) $row['refund_amount'],
                'average_order_value' => (float) $row['average_order_value'],
            ];
        }

        return [
            'aggregation' => $aggregation,
            'has_transactions' => $totalPaidOrders > 0 || $totalRevenue > 0,
            'max_revenue' => $maxRevenue,
            'total_revenue' => $totalRevenue,
            'total_paid_orders' => $totalPaidOrders,
            'data' => $series,
        ];
    }

    /**
     * Query daftar transaksi dengan filter rentang tanggal, pencarian, status, metode bayar, dan sorting.
     */
    private function buildTransactionsQuery(FinancialReportFilterRequest $request, Carbon $start, Carbon $endExclusive): Builder
    {
        $effDateExpr = 'COALESCE(orders.paid_at, orders.created_at)';

        $query = Order::query()
            ->with([
                'table',
                'confirmedByUser',
                'items.options',
                'items.rejectedByUser',
                'statusHistories.user',
            ])
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [
                $start->format('Y-m-d H:i:s'),
                $endExclusive->format('Y-m-d H:i:s'),
            ]);

        $paymentStatus = (string) $request->query('payment_status', 'all');
        if ($paymentStatus !== 'all') {
            $query->where('orders.payment_status', $paymentStatus);
        }

        $orderStatus = (string) $request->query('order_status', 'all');
        if ($orderStatus !== 'all') {
            $query->where('orders.order_status', $orderStatus);
        }

        $paymentMethod = (string) $request->query('payment_method', 'all');
        if ($paymentMethod !== 'all') {
            $query->where('orders.payment_method', $paymentMethod);
        }

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $like = '%'.strtolower($search).'%';
            $query->where(function (Builder $q) use ($like) {
                $q->whereRaw('LOWER(orders.order_number) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(orders.customer_name) LIKE ?', [$like])
                    ->orWhereHas('table', function (Builder $tq) use ($like) {
                        $tq->whereRaw('LOWER(cafe_tables.table_number) LIKE ?', [$like])
                            ->orWhereRaw('LOWER(COALESCE(cafe_tables.name, \'\')) LIKE ?', [$like]);
                    });
            });
        }

        $sortBy = (string) $request->query('sort_by', 'transaction_date');
        $sortDir = strtolower((string) $request->query('sort_dir', 'desc')) === 'asc' ? 'asc' : 'desc';

        if ($sortBy === 'total_amount') {
            $query->orderBy('orders.total_amount', $sortDir)->orderBy('orders.id', $sortDir);
        } elseif ($sortBy === 'order_number') {
            $query->orderBy('orders.order_number', $sortDir);
        } elseif ($sortBy === 'created_at') {
            $query->orderBy('orders.created_at', $sortDir)->orderBy('orders.id', $sortDir);
        } else {
            $query->orderByRaw("{$effDateExpr} {$sortDir}, orders.id {$sortDir}");
        }

        return $query;
    }

    /**
     * Format satu record Order menjadi struktur detail transaksi untuk UI dan ekspor.
     */
    private function formatOrderRecord(Order $order): array
    {
        $createdAt = Carbon::parse($order->created_at)->timezone(self::TIMEZONE);
        $paidAt = $order->paid_at ? Carbon::parse($order->paid_at)->timezone(self::TIMEZONE) : null;
        $effectiveDate = $paidAt ?? $createdAt;
        $refundedAt = $order->refunded_at ? Carbon::parse($order->refunded_at)->timezone(self::TIMEZONE) : null;

        $activeItems = $order->items->where('status', 'active');
        $rejectedItems = $order->items->where('status', 'rejected');

        $rejectedItemsAmount = (float) $rejectedItems->sum(fn ($it) => (float) $it->total_price);
        $subtotal = (float) $order->subtotal;
        $totalAmount = (float) $order->total_amount;
        $refundAmount = (float) ($order->refunded_amount ?? 0);
        $netRevenue = $order->getRealizedNetAmount();

        $itemsSummary = $activeItems->map(function ($it) {
            $optLabels = $it->options && $it->options->isNotEmpty()
                ? ' ('.$it->options->pluck('option_name')->join(', ').')'
                : '';

            return "{$it->quantity}x {$it->menu_name}{$optLabels}";
        })->join(', ');
        if ($itemsSummary === '' && $rejectedItems->isNotEmpty()) {
            $itemsSummary = 'Semua item ditolak ('.$rejectedItems->count().' item)';
        }

        return [
            'id' => $order->id,
            'order_number' => $order->order_number,
            'customer_name' => $order->customer_name,
            'table_number' => $order->table ? $order->table->table_number : '-',
            'table_name' => $order->table ? $order->table->name : null,
            'transaction_date' => $effectiveDate->toIso8601String(),
            'transaction_date_formatted' => $this->formatIndoDateTime($effectiveDate),
            'created_at' => $createdAt->toIso8601String(),
            'created_at_formatted' => $this->formatIndoDateTime($createdAt),
            'paid_at' => $paidAt ? $paidAt->toIso8601String() : null,
            'paid_at_formatted' => $paidAt ? $this->formatIndoDateTime($paidAt) : null,
            'payment_method' => $order->payment_method,
            'payment_method_label' => $this->getPaymentMethodLabel($order->payment_method, $order->payment_status),
            'payment_reference' => $order->payment_reference,
            'payment_status' => $order->payment_status,
            'payment_status_label' => $this->getPaymentStatusLabel($order->payment_status),
            'order_status' => $order->order_status,
            'order_status_label' => $this->getOrderStatusLabel($order->order_status),
            'initial_gross_amount' => $subtotal + $rejectedItemsAmount,
            'rejected_items_amount' => $rejectedItemsAmount,
            'subtotal' => $subtotal,
            'discount_amount' => null,
            'discount_supported' => false,
            'additional_fees_amount' => null,
            'additional_fees_supported' => false,
            'refund_amount' => $refundAmount,
            'refunded_at_formatted' => $refundedAt ? $this->formatIndoDateTime($refundedAt) : null,
            'refund_reason' => $order->refund_reason,
            'total_amount' => $totalAmount,
            'net_revenue' => $netRevenue,
            'is_realized_revenue' => $order->isRealizedRevenue(),
            'cash_received' => $order->cash_received !== null ? (float) $order->cash_received : null,
            'change_amount' => $order->change_amount !== null ? (float) $order->change_amount : null,
            'confirmed_by_name' => $order->confirmedByUser ? $order->confirmedByUser->name : null,
            'notes' => $order->notes,
            'items_summary' => $itemsSummary ?: '-',
            'items' => $order->items->map(function ($item) {
                return [
                    'id' => $item->id,
                    'menu_name' => $item->menu_name,
                    'quantity' => (int) $item->quantity,
                    'base_price' => (float) $item->base_price,
                    'subtotal_options' => (float) $item->subtotal_options,
                    'unit_price' => (float) $item->unit_price,
                    'total_price' => (float) $item->total_price,
                    'customer_notes' => $item->customer_notes,
                    'status' => $item->status ?? 'active',
                    'rejection_reason' => $item->rejection_reason,
                    'rejected_at_formatted' => $item->rejected_at
                        ? $this->formatIndoDateTime(Carbon::parse($item->rejected_at)->timezone(self::TIMEZONE))
                        : null,
                    'rejected_by_name' => $item->rejectedByUser ? $item->rejectedByUser->name : null,
                    'options' => $item->options->map(fn ($opt) => [
                        'id' => $opt->id,
                        'group_name' => $opt->group_name,
                        'option_name' => $opt->option_name,
                        'additional_price' => (float) $opt->additional_price,
                    ])->values()->all(),
                ];
            })->values()->all(),
            'status_histories' => $order->statusHistories->map(function ($hist) {
                $histTime = Carbon::parse($hist->created_at)->timezone(self::TIMEZONE);

                return [
                    'id' => $hist->id,
                    'status' => $hist->status,
                    'status_label' => $this->getOrderStatusLabel($hist->status),
                    'notes' => $hist->notes,
                    'created_at' => $histTime->toIso8601String(),
                    'created_at_formatted' => $this->formatIndoDateTime($histTime),
                    'actor_name' => $hist->user ? $hist->user->name : 'Sistem / Pelanggan',
                ];
            })->values()->all(),
        ];
    }

    private function calculateGrowthPercent(float $current, float $previous): ?float
    {
        if ($previous <= 0) {
            return $current > 0 ? 100.0 : 0.0;
        }

        return round((($current - $previous) / $previous) * 100, 1);
    }

    private function getPaymentMethodLabel(?string $method, string $paymentStatus): string
    {
        if ($paymentStatus === 'unpaid' && empty($method)) {
            return 'Belum Dipilih';
        }

        return match ($method) {
            'qris' => 'QRIS',
            'transfer' => 'Transfer Bank',
            'debit' => 'Kartu Debit',
            'cash' => 'Tunai',
            default => 'Tunai',
        };
    }

    private function getPaymentStatusLabel(string $status): string
    {
        return match ($status) {
            'paid' => 'Lunas',
            'unpaid' => 'Menunggu Pembayaran',
            'failed' => 'Gagal',
            'refunded' => 'Refund',
            default => strtoupper($status),
        };
    }

    private function getOrderStatusLabel(string $status): string
    {
        return match ($status) {
            'pending' => 'Menunggu',
            'processing' => 'Sedang Diracik',
            'ready' => 'Siap Saji',
            'completed' => 'Selesai',
            'cancelled' => 'Dibatalkan',
            default => strtoupper($status),
        };
    }

    private function formatRupiah(float $amount): string
    {
        return 'Rp '.number_format($amount, 0, ',', '.');
    }

    private function formatIndoDate(Carbon $date): string
    {
        $months = [
            1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr',
            5 => 'Mei', 6 => 'Jun', 7 => 'Jul', 8 => 'Agu',
            9 => 'Sep', 10 => 'Okt', 11 => 'Nov', 12 => 'Des',
        ];

        return $date->format('d').' '.($months[(int) $date->format('n')] ?? $date->format('M')).' '.$date->format('Y');
    }

    private function formatIndoShortDate(Carbon $date): string
    {
        $months = [
            1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr',
            5 => 'Mei', 6 => 'Jun', 7 => 'Jul', 8 => 'Agu',
            9 => 'Sep', 10 => 'Okt', 11 => 'Nov', 12 => 'Des',
        ];

        return $date->format('d').' '.($months[(int) $date->format('n')] ?? $date->format('M'));
    }

    private function formatIndoDayDate(Carbon $date): string
    {
        $days = [
            0 => 'Minggu', 1 => 'Senin', 2 => 'Selasa', 3 => 'Rabu',
            4 => 'Kamis', 5 => 'Jumat', 6 => 'Sabtu',
        ];

        return ($days[$date->dayOfWeek] ?? '').', '.$this->formatIndoDate($date);
    }

    private function formatIndoMonthYear(Carbon $date): string
    {
        $months = [
            1 => 'Januari', 2 => 'Februari', 3 => 'Maret', 4 => 'April',
            5 => 'Mei', 6 => 'Juni', 7 => 'Juli', 8 => 'Agustus',
            9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Desember',
        ];

        return ($months[(int) $date->format('n')] ?? $date->format('F')).' '.$date->format('Y');
    }

    private function formatIndoShortMonthYear(Carbon $date): string
    {
        $months = [
            1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr',
            5 => 'Mei', 6 => 'Jun', 7 => 'Jul', 8 => 'Agu',
            9 => 'Sep', 10 => 'Okt', 11 => 'Nov', 12 => 'Des',
        ];

        return ($months[(int) $date->format('n')] ?? $date->format('M')).' '.$date->format('Y');
    }

    private function formatIndoDateTime(Carbon $date): string
    {
        return $this->formatIndoDate($date).', '.$date->format('H:i').' WIB';
    }

    /**
     * Generator dokumen PDF 1.4 murni (tanpa library eksternal) menggunakan font Courier monospaced
     * agar tabel laporan keuangan dan total tercetak rapi serta dapat dibuka di semua PDF reader.
     *
     * @param  array<int, string>  $lines
     */
    private function renderNativePdfDocument(array $lines): string
    {
        $linesPerPage = 52;
        $pages = array_chunk($lines, $linesPerPage);
        if (empty($pages)) {
            $pages = [['Laporan Keuangan SIDE LINE Cafe']];
        }

        $objects = [];
        $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        $objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>';

        $pageObjectIds = [];
        $nextId = 4;

        foreach ($pages as $pageIndex => $pageLines) {
            $pageObjId = $nextId++;
            $contentObjId = $nextId++;
            $pageObjectIds[] = $pageObjId;

            $streamLines = [
                'BT',
                '/F1 8.2 Tf',
                '36 800 Td',
                '14 TL',
            ];

            foreach ($pageLines as $idx => $line) {
                $escaped = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $line);
                if ($idx === 0) {
                    $streamLines[] = "({$escaped}) Tj";
                } else {
                    $streamLines[] = "T* ({$escaped}) Tj";
                }
            }

            $footerText = sprintf('Halaman %d dari %d - SIDEORDER Financial Reporting System', $pageIndex + 1, count($pages));
            $escapedFooter = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $footerText);
            $streamLines[] = "T* T* ({$escapedFooter}) Tj";
            $streamLines[] = 'ET';

            $streamData = implode("\n", $streamLines);
            $streamLen = strlen($streamData);

            $objects[$contentObjId] = "<< /Length {$streamLen} >>\nstream\n{$streamData}\nendstream";
            $objects[$pageObjId] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {$contentObjId} 0 R >>";
        }

        $kidsRefs = implode(' ', array_map(fn ($id) => "{$id} 0 R", $pageObjectIds));
        $pageCount = count($pageObjectIds);
        $objects[2] = "<< /Type /Pages /Kids [ {$kidsRefs} ] /Count {$pageCount} >>";

        ksort($objects);

        $pdf = "%PDF-1.4\n";
        $offsets = [];

        foreach ($objects as $id => $body) {
            $offsets[$id] = strlen($pdf);
            $pdf .= "{$id} 0 obj\n{$body}\nendobj\n";
        }

        $xrefOffset = strlen($pdf);
        $totalObjects = count($objects) + 1;

        $pdf .= "xref\n0 {$totalObjects}\n";
        $pdf .= "0000000000 65535 f \n";

        for ($i = 1; $i < $totalObjects; $i++) {
            $offset = $offsets[$i] ?? 0;
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }

        $pdf .= "trailer\n<< /Size {$totalObjects} /Root 1 0 R >>\n";
        $pdf .= "startxref\n{$xrefOffset}\n%%EOF";

        return $pdf;
    }
}
