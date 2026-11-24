<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\FinancialReportFilterRequest;
use App\Models\Expense;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemOption;
use App\Models\OrderStatusHistory;
use App\Services\ExcelReportService;
use App\Services\Payments\PaymentService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FinancialReportController extends Controller
{
    private const TIMEZONE = 'Asia/Jakarta';

    private const PERIOD_FILTER_SESSION_KEY = 'sideline.admin_report_period_filter';

    /**
     * Tampilkan halaman Pengelolaan Keuangan & Analitik Profitabilitas Admin.
     */
    public function index(FinancialReportFilterRequest $request, PaymentService $paymentService): InertiaResponse
    {
        $paymentService->expireOverduePendingPayments();

        return Inertia::render('admin/financial-reports/index', $this->buildReportData($request));
    }

    /**
     * Endpoint JSON untuk sinkronisasi data laporan keuangan secara real-time / on-demand.
     */
    public function sync(FinancialReportFilterRequest $request, PaymentService $paymentService): JsonResponse
    {
        $paymentService->expireOverduePendingPayments();
        $reportData = $this->buildReportData($request);

        return response()->json($reportData);
    }

    /**
     * Ekspor Laporan Keuangan ke format Excel (.xlsx) 6 sheet terpisah.
     */
    public function exportExcel(FinancialReportFilterRequest $request, ExcelReportService $excelService): StreamedResponse
    {
        $resolved = $this->resolveDateRange($request);
        $summary = $this->computeSummaryMetrics($resolved);
        $recaps = $this->computePeriodRecaps($resolved['start'], $resolved['end_exclusive']);
        $products = $this->computeProductAnalytics($resolved['start'], $resolved['end_exclusive']);
        $ops = $this->computeOperationalAnalytics($resolved['start'], $resolved['end_exclusive']);
        $transactionsQuery = $this->buildTransactionsQuery($request, $resolved['start'], $resolved['end_exclusive']);
        $transactions = $transactionsQuery->get()->map(fn (Order $order): array => $this->formatOrderRecord($order));

        $actor = $request->user();
        $printedBy = $actor ? $actor->name : 'Administrator';

        $tempPath = $excelService->generateMultiSheetExcel(
            $resolved,
            $summary,
            $recaps,
            $products,
            $ops,
            $transactions,
            $printedBy
        );

        $filename = sprintf(
            'Laporan_Keuangan_SIDELINE_%s_sd_%s.xlsx',
            $resolved['start']->format('Ymd'),
            $resolved['end_inclusive']->format('Ymd')
        );

        $fileSize = is_file($tempPath) ? @filesize($tempPath) : false;
        $headers = [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Cache-Control' => 'no-store, no-cache, must-revalidate',
            'X-Content-Type-Options' => 'nosniff',
        ];
        if ($fileSize !== false && $fileSize > 0) {
            $headers['Content-Length'] = (string) $fileSize;
        }

        return response()->streamDownload(function () use ($tempPath): void {
            $stream = fopen($tempPath, 'rb');
            if ($stream) {
                fpassthru($stream);
                fclose($stream);
            }
            @unlink($tempPath);
        }, $filename, $headers);
    }

    /**
     * Ekspor Laporan Keuangan & Transaksi ke format CSV (UTF-8 BOM untuk kompatibilitas Excel).
     */
    public function exportCsv(FinancialReportFilterRequest $request): StreamedResponse
    {
        $resolved = $this->resolveDateRange($request);
        $summary = $this->computeSummaryMetrics($resolved);
        $recaps = $this->computePeriodRecaps($resolved['start'], $resolved['end_exclusive']);
        $products = $this->computeProductAnalytics($resolved['start'], $resolved['end_exclusive']);
        $ops = $this->computeOperationalAnalytics($resolved['start'], $resolved['end_exclusive']);
        $transactionsQuery = $this->buildTransactionsQuery($request, $resolved['start'], $resolved['end_exclusive']);
        $transactions = $transactionsQuery->get();

        $actor = $request->user();
        $printedBy = $actor ? $actor->name : 'Administrator';

        $filename = sprintf(
            'Laporan_Keuangan_SIDELINE_%s_sd_%s.csv',
            $resolved['start']->format('Ymd'),
            $resolved['end_inclusive']->format('Ymd')
        );

        return response()->streamDownload(function () use ($resolved, $summary, $recaps, $products, $ops, $transactions, $printedBy): void {
            $handle = fopen('php://output', 'w');
            if ($handle === false) {
                return;
            }

            // Tambahkan UTF-8 BOM agar karakter & kolom terbaca sempurna di Microsoft Excel
            fwrite($handle, "\xEF\xBB\xBF");

            fputcsv($handle, ['LAPORAN KEUANGAN & ANALITIK PENDAPATAN - SIDE LINE CAFE (SIDEORDER)']);
            fputcsv($handle, ['Periode Laporan', $resolved['label'].' ('.$resolved['start']->format('d/m/Y').' - '.$resolved['end_inclusive']->format('d/m/Y').' WIB)']);
            fputcsv($handle, ['Waktu Cetak', Carbon::now(self::TIMEZONE)->format('d/m/Y H:i:s').' WIB']);
            fputcsv($handle, ['Dicetak Oleh', $printedBy]);
            fputcsv($handle, ['Integrasi Payment Gateway', $summary['xendit_integration']['label'].' ('.$summary['xendit_integration']['mode'].')']);
            fputcsv($handle, ['Dasar Perhitungan', 'Pendapatan Bersih Terealisasi dihitung dari transaksi berstatus pembayaran PAID (Lunas) dan status pesanan non-cancelled berdasarkan waktu pembayaran (WIB).']);
            fputcsv($handle, []);

            // Bagian 1: Ringkasan Eksekutif Periode
            fputcsv($handle, ['=== RINGKASAN REKAP PENDAPATAN & OPERASIONAL PERIODE TERPILIH ===']);
            fputcsv($handle, ['Metrik', 'Nilai / Jumlah', 'Format Rupiah / Keterangan']);
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
                'Total Porsi Menu Terjual',
                $summary['period']['items_sold'],
                $summary['period']['items_sold'].' porsi',
            ]);
            fputcsv($handle, [
                'Pesanan Menunggu Pembayaran (Belum Terealisasi)',
                $summary['period']['pending_payments_count'],
                $this->formatRupiah($summary['period']['pending_payments_amount']).' (Tidak dihitung sebagai omzet)',
            ]);
            fputcsv($handle, [
                'Pesanan Dibatalkan (Belum Bayar)',
                $summary['period']['cancelled_orders_count'],
                $this->formatRupiah($summary['period']['cancelled_amount']),
            ]);
            fputcsv($handle, [
                'Item Menu Ditolak Staf',
                $ops['pipeline']['rejected_items_count'],
                $this->formatRupiah($ops['pipeline']['rejected_items_amount']),
            ]);
            fputcsv($handle, [
                'Rata-rata Waktu Penyelesaian Pesanan',
                $ops['completion_time']['average_minutes'],
                $ops['completion_time']['formatted'],
            ]);
            fputcsv($handle, [
                'Hari Paling Ramai',
                $ops['busiest_day']['busiest_day_name'] ?? '-',
                $this->formatRupiah($ops['busiest_day']['busiest_day_revenue']).' ('.$ops['busiest_day']['busiest_day_orders'].' pesanan)',
            ]);
            fputcsv($handle, [
                'Jam Puncak Penjualan',
                $ops['period_hourly']['peak_hour'] ? $ops['period_hourly']['peak_hour'].' WIB' : '-',
                $this->formatRupiah($ops['period_hourly']['max_revenue']),
            ]);
            fputcsv($handle, [
                'Pendapatan Hari Ini',
                number_format($summary['today_revenue'], 2, '.', ''),
                $this->formatRupiah($summary['today_revenue']),
            ]);
            fputcsv($handle, [
                'Pendapatan Minggu Ini',
                number_format($summary['this_week_revenue'], 2, '.', ''),
                $this->formatRupiah($summary['this_week_revenue']),
            ]);
            fputcsv($handle, [
                'Pendapatan Bulan Ini',
                number_format($summary['this_month_revenue'], 2, '.', ''),
                $this->formatRupiah($summary['this_month_revenue']),
            ]);
            fputcsv($handle, []);

            // Bagian 2: Rincian Payment Gateway (Digital & Kasir POS)
            fputcsv($handle, ['=== REKAPITULASI PAYMENT GATEWAY ===']);
            fputcsv($handle, ['Gateway', 'Transaksi Lunas', 'Omzet Bersih (Rp)', 'Pangsa Omzet (%)', 'Menunggu Bayar', 'Batal / Gagal']);
            foreach ($summary['payment_gateways'] as $gw) {
                fputcsv($handle, [
                    $gw['label'],
                    $gw['transactions_count'],
                    number_format($gw['net_revenue'], 2, '.', ''),
                    $gw['revenue_share_percent'].'%',
                    $gw['unpaid_count'].' ('.$this->formatRupiah($gw['unpaid_amount']).')',
                    $gw['cancelled_count'].' ('.$this->formatRupiah($gw['cancelled_amount']).')',
                ]);
            }
            fputcsv($handle, []);

            // Bagian 3: Rincian Metode Pembayaran
            fputcsv($handle, ['=== DISTRIBUSI METODE PEMBAYARAN ===']);
            fputcsv($handle, ['Metode', 'Transaksi Lunas', 'Omzet Bersih (Rp)', 'Pangsa Omzet (%)', 'Menunggu Bayar', 'Batal / Gagal']);
            foreach ($summary['payment_methods'] as $pm) {
                fputcsv($handle, [
                    $pm['label'],
                    $pm['transactions_count'],
                    number_format($pm['net_revenue'], 2, '.', ''),
                    $pm['revenue_share_percent'].'%',
                    $pm['unpaid_count'].' ('.$this->formatRupiah($pm['unpaid_amount']).')',
                    $pm['cancelled_count'].' ('.$this->formatRupiah($pm['cancelled_amount']).')',
                ]);
            }
            fputcsv($handle, []);

            // Bagian 4: Performa Kategori Menu
            fputcsv($handle, ['=== PERFORMA KATEGORI MENU ===']);
            fputcsv($handle, ['Kategori', 'Jumlah Menu', 'Porsi Terjual', 'Total Omzet (Rp)', 'Kontribusi Omzet (%)']);
            foreach ($products['categories'] as $cat) {
                fputcsv($handle, [
                    $cat['name'],
                    $cat['menu_count'],
                    $cat['total_qty'],
                    number_format($cat['total_revenue'], 2, '.', ''),
                    $cat['revenue_share_percent'].'%',
                ]);
            }
            fputcsv($handle, []);

            // Bagian 5: Menu Terlaris & Pendapatan Tertinggi
            fputcsv($handle, ['=== 10 MENU TERLARIS (VOLUME) ===']);
            fputcsv($handle, ['Peringkat', 'Nama Menu', 'Kategori', 'Porsi Terjual', 'Omzet Tercipta (Rp)', 'Pangsa Volume (%)']);
            foreach ($products['top_selling'] as $item) {
                fputcsv($handle, [
                    $item['rank'],
                    $item['menu_name'],
                    $item['category_name'],
                    $item['total_qty'],
                    number_format($item['total_revenue'], 2, '.', ''),
                    $item['contribution_percent'].'%',
                ]);
            }
            fputcsv($handle, []);

            // Bagian 6: Rekapitulasi Harian
            fputcsv($handle, ['=== REKAPITULASI PENDAPATAN HARIAN ===']);
            fputcsv($handle, [
                'Tanggal',
                'Label Hari',
                'Total Pesanan',
                'Transaksi Lunas',
                'Menunggu Bayar',
                'Batal / Gagal',
                'Bruto Transaksi Lunas (Rp)',
                'Penyesuaian (Rp)',
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

            // Bagian 7: Daftar Detail Transaksi
            fputcsv($handle, ['=== DETAIL TRANSAKSI DAN RIWAYAT KEUANGAN ===']);
            fputcsv($handle, [
                'Waktu Transaksi (WIB)',
                'Waktu Pesanan Dibuat (WIB)',
                'Waktu Pembayaran (WIB)',
                'ID Pesanan',
                'Pelanggan',
                'Nomor Meja',
                'Payment Gateway',
                'Metode Pembayaran',
                'Referensi Pembayaran',
                'Subtotal Aktif (Rp)',
                'Nilai Item Ditolak (Rp)',
                'Diskon (Rp)',
                'Biaya Tambahan (Rp)',
                'Penyesuaian (Rp)',
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
                    $this->sanitizeCsvCell((string) $mapped['order_number']),
                    $this->sanitizeCsvCell((string) $mapped['customer_name']),
                    'Meja '.$mapped['table_number'],
                    $this->sanitizeCsvCell((string) $mapped['payment_gateway_label']),
                    $this->sanitizeCsvCell((string) $mapped['payment_method_label']),
                    $this->sanitizeCsvCell((string) ($mapped['payment_reference'] ?? '-')),
                    number_format($mapped['subtotal'], 2, '.', ''),
                    number_format($mapped['rejected_items_amount'], 2, '.', ''),
                    '0.00 (Belum Diaktifkan)',
                    '0.00 (Belum Diaktifkan)',
                    number_format($mapped['refund_amount'], 2, '.', ''),
                    number_format($mapped['total_amount'], 2, '.', ''),
                    number_format($mapped['net_revenue'], 2, '.', ''),
                    $this->sanitizeCsvCell((string) $mapped['payment_status_label']),
                    $this->sanitizeCsvCell((string) $mapped['order_status_label']),
                    $this->sanitizeCsvCell((string) $mapped['items_summary']),
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
                '',
                '',
                number_format($tableSubtotalSum, 2, '.', ''),
                '',
                '0.00 (Belum Diaktifkan)',
                '0.00 (Belum Diaktifkan)',
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
            'Cache-Control' => 'no-store, no-cache, must-revalidate',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * Cegah CSV formula injection dengan mengawali tanda kutip tunggal pada string yang diawali karakter formula.
     */
    private function sanitizeCsvCell(string $value): string
    {
        if ($value === '' || $value === '-') {
            return $value;
        }

        if (preg_match('/^[=+\-@\t\r]/', $value) === 1) {
            return "'".$value;
        }

        return $value;
    }

    /**
     * Ekspor Laporan Keuangan & Transaksi ke format PDF asli (application/pdf).
     */
    public function exportPdf(FinancialReportFilterRequest $request): HttpResponse
    {
        $resolved = $this->resolveDateRange($request);
        $summary = $this->computeSummaryMetrics($resolved);
        $recaps = $this->computePeriodRecaps($resolved['start'], $resolved['end_exclusive']);
        $ops = $this->computeOperationalAnalytics($resolved['start'], $resolved['end_exclusive']);
        $transactions = $this->buildTransactionsQuery($request, $resolved['start'], $resolved['end_exclusive'])
            ->limit(250)
            ->get()
            ->map(fn (Order $order): array => $this->formatOrderRecord($order));

        $actor = $request->user();
        $printedBy = $actor ? $actor->name : 'Administrator';

        $filename = sprintf(
            'Laporan_Keuangan_SIDELINE_%s_sd_%s.pdf',
            $resolved['start']->format('Ymd'),
            $resolved['end_inclusive']->format('Ymd')
        );

        $xenditRow = null;
        $manualRow = null;
        if (is_array($summary['payment_gateways'])) {
            foreach ($summary['payment_gateways'] as $gwRow) {
                if (! is_array($gwRow)) {
                    continue;
                }
                if (($gwRow['gateway'] ?? '') === 'xendit') {
                    $xenditRow = $gwRow;
                } elseif (($gwRow['gateway'] ?? '') === 'manual') {
                    $manualRow = $gwRow;
                }
            }
        }

        $lines = [];
        $lines[] = 'LAPORAN KEUANGAN & ANALITIK PENDAPATAN - SIDE LINE CAFE';
        $lines[] = str_repeat('=', 95);
        $lines[] = 'Periode Laporan : '.$resolved['label'].' ('.$resolved['start']->format('d M Y').' - '.$resolved['end_inclusive']->format('d M Y').' WIB)';
        $lines[] = 'Waktu Cetak     : '.Carbon::now(self::TIMEZONE)->format('d M Y H:i:s').' WIB';
        $lines[] = 'Dicetak Oleh    : '.$printedBy;
        $lines[] = 'Payment Gateway : '.$summary['xendit_integration']['label'].' ('.$summary['xendit_integration']['mode'].')';
        $lines[] = str_repeat('-', 95);
        $lines[] = '1. RINGKASAN PENDAPATAN & OPERASIONAL';
        $lines[] = sprintf('   - Pendapatan Bersih Periode Terpilih : %s (%d transaksi lunas)', $this->formatRupiah($summary['period']['net_revenue']), $summary['period']['paid_transactions_count']);
        $lines[] = sprintf('   - Total Bruto Transaksi Lunas        : %s', $this->formatRupiah($summary['period']['gross_revenue']));
        $lines[] = sprintf('   - Rata-rata Nilai Transaksi (AOV)    : %s', $this->formatRupiah($summary['period']['average_order_value']));
        $lines[] = sprintf('   - Total Porsi Menu Terjual           : %d porsi', $summary['period']['items_sold']);
        $lines[] = sprintf('   - Pembayaran Digital (QRIS / VA)   : %d lunas (%s)', $xenditRow['transactions_count'] ?? 0, $this->formatRupiah((float) ($xenditRow['net_revenue'] ?? 0)));
        $lines[] = sprintf('   - Pembayaran Tunai Kasir (Manual)    : %d lunas (%s)', $manualRow['transactions_count'] ?? 0, $this->formatRupiah((float) ($manualRow['net_revenue'] ?? 0)));
        $lines[] = sprintf('   - Menunggu Pembayaran (Unpaid)       : %d pesanan (%s - Belum Terealisasi)', $summary['period']['pending_payments_count'], $this->formatRupiah($summary['period']['pending_payments_amount']));
        $lines[] = sprintf('   - Pesanan Dibatalkan / Item Ditolak  : %d batal (%s) | %d item ditolak (%s)', $summary['period']['cancelled_orders_count'], $this->formatRupiah($summary['period']['cancelled_amount']), $ops['pipeline']['rejected_items_count'], $this->formatRupiah($ops['pipeline']['rejected_items_amount']));
        $lines[] = sprintf('   - Rata-rata Waktu Penyelesaian       : %s', $ops['completion_time']['formatted']);
        $lines[] = sprintf('   - Hari Paling Ramai                  : %s (%s, %d pesanan)', $ops['busiest_day']['busiest_day_name'] ?? '-', $this->formatRupiah($ops['busiest_day']['busiest_day_revenue']), $ops['busiest_day']['busiest_day_orders']);
        $lines[] = sprintf('   - Jam Puncak Operasional             : %s (%s)', $ops['period_hourly']['peak_hour'] ? $ops['period_hourly']['peak_hour'].' WIB' : '-', $this->formatRupiah($ops['period_hourly']['max_revenue']));
        $lines[] = sprintf('   - Pendapatan Hari Ini                : %s', $this->formatRupiah($summary['today_revenue']));
        $lines[] = sprintf('   - Pendapatan Minggu Ini              : %s', $this->formatRupiah($summary['this_week_revenue']));
        $lines[] = sprintf('   - Pendapatan Bulan Ini               : %s', $this->formatRupiah($summary['this_month_revenue']));
        $lines[] = str_repeat('-', 95);
        $lines[] = '2. REKAPITULASI HARIAN PERIODE TERPILIH';
        $lines[] = sprintf('%-12s | %-7s | %-7s | %-18s | %-16s | %-16s', 'Tanggal', 'Lunas', 'Porsi', 'Omzet Bersih', 'Belum Bayar', 'Rata-rata AOV');
        $lines[] = str_repeat('-', 95);

        foreach ($recaps['daily']['rows'] as $row) {
            if ($row['total_orders'] > 0 || count($recaps['daily']['rows']) <= 14) {
                $lines[] = sprintf(
                    '%-12s | %-7d | %-7d | %-18s | %-16s | %-16s',
                    $row['date'],
                    $row['paid_orders_count'],
                    $row['items_sold'],
                    $this->formatRupiah($row['net_revenue']),
                    $this->formatRupiah($row['unpaid_amount']),
                    $this->formatRupiah($row['average_order_value'])
                );
            }
        }

        $lines[] = str_repeat('-', 95);
        $lines[] = sprintf(
            '%-12s | %-7d | %-7d | %-18s | %-16s | %-16s',
            'TOTAL',
            $recaps['daily']['totals']['paid_orders_count'],
            $recaps['daily']['totals']['items_sold'],
            $this->formatRupiah($recaps['daily']['totals']['net_revenue']),
            $this->formatRupiah($recaps['daily']['totals']['unpaid_amount']),
            $this->formatRupiah($recaps['daily']['totals']['average_order_value'])
        );
        $lines[] = str_repeat('-', 95);
        $lines[] = '3. DAFTAR TRANSAKSI TERFILTER';
        $lines[] = sprintf('%-16s | %-16s | %-7s | %-10s | %-11s | %-16s', 'Waktu (WIB)', 'ID Pesanan', 'Gateway', 'Metode', 'Status', 'Pendapatan Bersih');
        $lines[] = str_repeat('-', 95);

        $totalTableNet = 0.0;
        foreach ($transactions as $tx) {
            $totalTableNet += $tx['net_revenue'];
            $gatewayTag = match ($tx['payment_gateway']) {
                'xendit' => 'Digital',
                'midtrans' => 'Midtrn',
                default => 'Kasir',
            };
            $lines[] = sprintf(
                '%-16s | %-16s | %-7s | %-10s | %-11s | %-16s',
                substr($tx['transaction_date_formatted'], 0, 16),
                substr($tx['order_number'], 0, 16),
                $gatewayTag,
                substr($tx['payment_method_label'], 0, 10),
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
        $lines[] = 'Catatan: Pendapatan Bersih = transaksi berstatus paid & non-cancelled (WIB).';

        $pdfBinary = $this->renderNativePdfDocument($lines);
        $dispositionType = $request->boolean('inline') ? 'inline' : 'attachment';

        return response($pdfBinary, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => $dispositionType.'; filename="'.$filename.'"',
            'Content-Length' => (string) strlen($pdfBinary),
            'Cache-Control' => 'no-store, no-cache, must-revalidate',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * Bangun seluruh payload data untuk halaman Laporan Keuangan Admin.
     *
     * @return array<string, mixed>
     */
    public function buildReportData(FinancialReportFilterRequest $request): array
    {
        $resolved = $this->resolveDateRange($request);
        $summary = $this->computeSummaryMetrics($resolved);
        $recaps = $this->computePeriodRecaps($resolved['start'], $resolved['end_exclusive']);

        $requestedAggregation = $this->resolveRequestedAggregation($request);
        $chartAggregation = $this->resolveChartAggregation($requestedAggregation, $resolved['days_count']);
        $chart = $this->buildChartSeries($resolved['start'], $resolved['end_exclusive'], $chartAggregation, $recaps, $resolved);

        $recapView = (string) $request->query('recap_view', 'daily');
        if (! in_array($recapView, ['daily', 'weekly', 'monthly'], true)) {
            $recapView = 'daily';
        }

        $perPage = (int) $request->query('per_page', 15);
        if (! in_array($perPage, [5, 10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $productAnalytics = $this->computeProductAnalytics($resolved['start'], $resolved['end_exclusive']);
        $operationalAnalytics = $this->computeOperationalAnalytics($resolved['start'], $resolved['end_exclusive']);

        $transactionsQuery = $this->buildTransactionsQuery($request, $resolved['start'], $resolved['end_exclusive']);

        // Daftar menu untuk filter transaksi per produk
        $availableMenus = DB::table('menus')
            ->select('id', 'name')
            ->orderBy('name')
            ->get()
            ->map(fn ($m): array => ['id' => $m->id, 'name' => $m->name])
            ->all();

        // Hitung agregasi total dari tabel transaksi yang sudah difilter (search, status, metode bayar, gateway)
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
        $paginated->setPath($request->routeIs('dashboard*') ? '/dashboard' : '/admin/financial-reports');
        $paginated->through(fn (Order $order): array => $this->formatOrderRecord($order));

        $expensesAnalytics = $this->computeExpensesAnalytics($resolved['start'], $resolved['end_inclusive']);

        return [
            'filters' => $this->buildFilterPayload($request, $resolved, $requestedAggregation, $chartAggregation, $recapView, $perPage),
            'available_menus' => $availableMenus,
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
            'product_analytics' => $productAnalytics,
            'operational_analytics' => $operationalAnalytics,
            'expenses' => $expensesAnalytics,
            'calculation_rules' => [
                'timezone' => 'Asia/Jakarta (WIB)',
                'week_definition' => 'Senin 00:00:00 WIB sampai Minggu 23:59:59 WIB (sebelum Senin 00:00:00 WIB berikutnya)',
                'authoritative_source' => 'Tabel orders, order_items, dan payments sebagai sumber rekap pendapatan pesanan SideOrder.',
                'transaction_date_basis' => 'Menggunakan waktu pembayaran berhasil (paid_at) untuk pesanan lunas, dengan fallback ke waktu pembuatan pesanan (created_at) untuk data historis atau pesanan belum dibayar.',
                'realized_revenue_formula' => 'Pendapatan Bersih = SUM(total_amount - refunded_amount) untuk pesanan dengan payment_status = "paid" dan order_status != "cancelled".',
                'unpaid_policy' => 'Pesanan dengan payment_status = "unpaid" dicatat terpisah sebagai Pembayaran Menunggu dan bernilai Rp 0 pada Pendapatan Terealisasi.',
                'cancelled_and_failed_policy' => 'Pesanan yang dibatalkan sebelum dibayar (cancelled) atau pembayaran gagal (failed) tidak dihitung sebagai pendapatan terealisasi. Penolakan menu tercatat untuk audit dapur tanpa mengurangi setoran lunas.',
                'discount_support' => 'Diskon per menu sudah terhitung pada harga jual final item; tidak ada diskon terpisah di level faktur.',
                'additional_fees_support' => 'Pajak/service charge tidak dipisahkan pada skema saat ini; total_amount = subtotal item aktif.',
                'profit_disclaimer' => 'Laporan ini berfokus pada rekapitulasi pendapatan transaksi pesanan online QR dan kasir POS SideOrder.',
            ],
            'synced_at' => Carbon::now(self::TIMEZONE)->format('d M Y, H:i:s').' WIB',
        ];
    }

    /**
     * Payload ringkas berkecepatan tinggi khusus untuk halaman Ringkasan Eksekutif (/dashboard & polling real-time).
     *
     * @return array<string, mixed>
     */
    public function buildDashboardData(FinancialReportFilterRequest $request): array
    {
        $resolved = $this->resolveDateRange($request);
        $summary = $this->computeSummaryMetrics($resolved, false);
        $recaps = $this->computePeriodRecaps($resolved['start'], $resolved['end_exclusive'], false);

        $requestedAggregation = $this->resolveRequestedAggregation($request);
        $chartAggregation = $this->resolveChartAggregation($requestedAggregation, $resolved['days_count']);
        $chart = $this->buildChartSeries($resolved['start'], $resolved['end_exclusive'], $chartAggregation, $recaps, $resolved, false);

        $topMenus = $this->computeTopSellingMenus(
            $resolved['start'],
            $resolved['end_exclusive'],
            (int) ($summary['period']['items_sold'] ?? 0),
            5,
        );

        $hourlyTracking = in_array($resolved['preset'], ['today', 'yesterday'], true)
            ? $this->computeHourlyTracking($resolved['start'], $resolved['end_exclusive'])
            : null;

        return [
            'filters' => $this->buildFilterPayload($request, $resolved, $requestedAggregation, $chartAggregation),
            'summary' => $summary,
            'chart' => $chart,
            'hourly_tracking' => $hourlyTracking,
            'top_menus' => $topMenus,
            'synced_at' => Carbon::now(self::TIMEZONE)->format('d M Y, H:i:s').' WIB',
        ];
    }

    private function resolveRequestedAggregation(FinancialReportFilterRequest $request): string
    {
        $hasExplicitPeriod = $request->filled('preset')
            || $request->filled('period')
            || $request->filled('start_date')
            || $request->filled('end_date');
        $savedSession = $request->hasSession() ? $request->session()->get(self::PERIOD_FILTER_SESSION_KEY) : null;
        $savedAgg = is_array($savedSession) && is_string($savedSession['aggregation'] ?? null)
            ? $savedSession['aggregation']
            : 'auto';

        return $request->filled('aggregation')
            ? (string) $request->query('aggregation', 'auto')
            : ($hasExplicitPeriod ? 'auto' : $savedAgg);
    }

    /**
     * @param  array<string, mixed>  $resolved
     * @return array<string, mixed>
     */
    private function buildFilterPayload(
        FinancialReportFilterRequest $request,
        array $resolved,
        string $requestedAggregation,
        string $chartAggregation,
        string $recapView = 'daily',
        int $perPage = 15,
    ): array {
        return [
            'period' => $resolved['preset'],
            'preset' => $resolved['preset'],
            'start_date' => $resolved['start']->format('Y-m-d'),
            'end_date' => $resolved['end_inclusive']->format('Y-m-d'),
            'period_label' => $resolved['label'],
            'compare_mode' => $resolved['compare_mode'],
            'compare_start_date' => $resolved['prev_start'] ? $resolved['prev_start']->format('Y-m-d') : '',
            'compare_end_date' => $resolved['prev_end_exclusive'] ? $resolved['prev_end_exclusive']->copy()->subDay()->format('Y-m-d') : '',
            'compare_label' => $resolved['prev_label'],
            'filter_date' => (string) $request->query('filter_date', ''),
            'menu_id' => $request->filled('menu_id') ? (int) $request->query('menu_id') : null,
            'aggregation' => $requestedAggregation,
            'effective_aggregation' => $chartAggregation,
            'recap_view' => $recapView,
            'search' => (string) $request->query('search', ''),
            'payment_status' => (string) $request->query('payment_status', 'all'),
            'order_status' => (string) $request->query('order_status', 'all'),
            'payment_method' => (string) $request->query('payment_method', 'all'),
            'payment_gateway' => (string) $request->query('payment_gateway', 'all'),
            'sort_by' => (string) $request->query('sort_by', 'transaction_date'),
            'sort_dir' => (string) $request->query('sort_dir', 'desc'),
            'per_page' => $perPage,
        ];
    }

    /**
     * Ambil daftar lengkap & rekap pengeluaran operasional kafe pada rentang tanggal terpilih.
     *
     * @return array<string, mixed>
     */
    private function computeExpensesAnalytics(Carbon $start, Carbon $endInclusive): array
    {
        $startStr = $start->format('Y-m-d');
        $endStr = $endInclusive->format('Y-m-d');
        $expDateExpr = DB::connection()->getDriverName() === 'pgsql'
            ? 'expense_date::text'
            : 'substr(expense_date, 1, 10)';

        $rows = Expense::query()
            ->with('recordedByUser:id,name')
            ->whereRaw("{$expDateExpr} BETWEEN ? AND ?", [$startStr, $endStr])
            ->orderByDesc('expense_date')
            ->orderByDesc('id')
            ->get();

        $totalAmount = (float) $rows->sum('amount');
        $cashAmount = (float) $rows->where('payment_source', 'cash')->sum('amount');
        $bankAmount = (float) $rows->whereIn('payment_source', ['bank', 'xendit_balance'])->sum('amount');

        $byCategory = [];
        foreach (Expense::CATEGORIES as $catKey => $catLabel) {
            $catRows = $rows->where('category', $catKey);
            $catAmount = (float) $catRows->sum('amount');
            $byCategory[] = [
                'category' => $catKey,
                'label' => $catLabel,
                'count' => $catRows->count(),
                'amount' => $catAmount,
                'share_percent' => $totalAmount > 0 ? round(($catAmount / $totalAmount) * 100, 1) : 0.0,
            ];
        }

        usort($byCategory, fn (array $a, array $b): int => $b['amount'] <=> $a['amount']);

        $items = $rows->map(function (Expense $exp): array {
            $expDate = $exp->expense_date instanceof Carbon
                ? $exp->expense_date
                : Carbon::parse((string) $exp->expense_date, self::TIMEZONE);

            return [
                'id' => $exp->id,
                'expense_date' => $expDate->format('Y-m-d'),
                'expense_date_formatted' => $this->formatIndoDate($expDate),
                'category' => $exp->category,
                'category_label' => Expense::CATEGORIES[$exp->category] ?? ucfirst((string) $exp->category),
                'title' => $exp->title,
                'amount' => (float) $exp->amount,
                'payment_source' => $exp->payment_source,
                'payment_source_label' => Expense::PAYMENT_SOURCES[$exp->payment_source] ?? ucfirst((string) $exp->payment_source),
                'notes' => $exp->notes,
                'recorded_by_name' => $exp->recordedByUser?->name ?? 'Admin',
                'created_at_formatted' => $exp->created_at
                    ? $this->formatIndoDateTime(Carbon::parse($exp->created_at)->timezone(self::TIMEZONE))
                    : '-',
            ];
        })->values()->all();

        return [
            'count' => count($items),
            'total_amount' => $totalAmount,
            'cash_amount' => $cashAmount,
            'bank_amount' => $bankAmount,
            'by_category' => $byCategory,
            'items' => $items,
            'categories' => Expense::CATEGORIES,
            'payment_sources' => Expense::PAYMENT_SOURCES,
        ];
    }

    /**
     * Resolusi preset tanggal dan rentang waktu ke zona waktu Asia/Jakarta.
     * Menggunakan batas half-open [start 00:00:00, end_exclusive 00:00:00 hari berikutnya)
     * agar tidak ada transaksi yang terhitung ganda atau hilang di batas tengah malam.
     *
     * @return array<string, mixed>
     */
    private function resolveDateRange(FinancialReportFilterRequest $request): array
    {
        $hasExplicitPeriod = $request->filled('preset')
            || $request->filled('period')
            || $request->filled('start_date')
            || $request->filled('end_date');

        $savedRaw = (! $hasExplicitPeriod && $request->hasSession())
            ? $request->session()->get(self::PERIOD_FILTER_SESSION_KEY)
            : null;
        $savedFilter = is_array($savedRaw) ? $savedRaw : [];

        $now = Carbon::now(self::TIMEZONE);
        if ($hasExplicitPeriod) {
            $preset = (string) ($request->query('preset') ?? $request->query('period') ?? '');
            $startDateParam = $request->query('start_date');
            $endDateParam = $request->query('end_date');

            if ($preset === '' && ($startDateParam || $endDateParam)) {
                $preset = 'custom';
            } elseif ($preset === '') {
                $preset = 'this_month';
            }
        } else {
            $preset = is_string($savedFilter['preset'] ?? null) && $savedFilter['preset'] !== ''
                ? $savedFilter['preset']
                : 'this_month';
            $startDateParam = is_string($savedFilter['start_date'] ?? null) && $savedFilter['start_date'] !== ''
                ? $savedFilter['start_date']
                : null;
            $endDateParam = is_string($savedFilter['end_date'] ?? null) && $savedFilter['end_date'] !== ''
                ? $savedFilter['end_date']
                : null;
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

            case 'last_14_days':
                $start = $now->copy()->subDays(13)->startOfDay();
                $endInclusive = $now->copy()->endOfDay();
                $label = '14 Hari Terakhir ('.$this->formatIndoDate($start).' - '.$this->formatIndoDate($endInclusive).')';
                break;

            case 'last_30_days':
                $start = $now->copy()->subDays(29)->startOfDay();
                $endInclusive = $now->copy()->endOfDay();
                $label = '30 Hari Terakhir ('.$this->formatIndoDate($start).' - '.$this->formatIndoDate($endInclusive).')';
                break;

            case 'last_90_days':
                $start = $now->copy()->subDays(89)->startOfDay();
                $endInclusive = $now->copy()->endOfDay();
                $label = '90 Hari Terakhir ('.$this->formatIndoDate($start).' - '.$this->formatIndoDate($endInclusive).')';
                break;

            case 'this_week':
                $start = $now->copy()->startOfWeek(Carbon::MONDAY)->startOfDay();
                $endInclusive = $now->copy()->endOfWeek(Carbon::SUNDAY)->endOfDay();
                $label = 'Minggu Ini ('.$this->formatIndoDate($start).' - '.$this->formatIndoDate($endInclusive).')';
                break;

            case 'last_week':
                $lastWeekMonday = $now->copy()->startOfWeek(Carbon::MONDAY)->subWeek();
                $start = $lastWeekMonday->copy()->startOfDay();
                $endInclusive = $lastWeekMonday->copy()->endOfWeek(Carbon::SUNDAY)->endOfDay();
                $label = 'Minggu Lalu ('.$this->formatIndoDate($start).' - '.$this->formatIndoDate($endInclusive).')';
                break;

            case 'this_month':
                $start = $now->copy()->startOfMonth()->startOfDay();
                $endInclusive = $now->copy()->endOfMonth()->endOfDay();
                $label = 'Bulan Ini ('.$this->formatIndoMonthYear($start).')';
                break;

            case 'last_month':
                $lastMonth = $now->copy()->subMonthNoOverflow();
                $start = $lastMonth->copy()->startOfMonth()->startOfDay();
                $endInclusive = $lastMonth->copy()->endOfMonth()->endOfDay();
                $label = 'Bulan Lalu ('.$this->formatIndoMonthYear($start).')';
                break;

            case 'last_3_months':
                $start = $now->copy()->subMonthsNoOverflow(2)->startOfMonth()->startOfDay();
                $endInclusive = $now->copy()->endOfMonth()->endOfDay();
                $label = '3 Bulan Terakhir ('.$this->formatIndoMonthYear($start).' - '.$this->formatIndoMonthYear($endInclusive).')';
                break;

            case 'last_6_months':
                $start = $now->copy()->subMonthsNoOverflow(5)->startOfMonth()->startOfDay();
                $endInclusive = $now->copy()->endOfMonth()->endOfDay();
                $label = '6 Bulan Terakhir ('.$this->formatIndoMonthYear($start).' - '.$this->formatIndoMonthYear($endInclusive).')';
                break;

            case 'this_year':
                $start = $now->copy()->startOfYear()->startOfDay();
                $endInclusive = $now->copy()->endOfYear()->endOfDay();
                $label = 'Tahun Ini ('.$start->format('Y').')';
                break;

            case 'last_year':
                $lastYear = $now->copy()->subYear();
                $start = $lastYear->copy()->startOfYear()->startOfDay();
                $endInclusive = $lastYear->copy()->endOfYear()->endOfDay();
                $label = 'Tahun Lalu ('.$start->format('Y').')';
                break;

            case 'all_time':
                $earliestOrder = DB::table('orders')->min(DB::raw('COALESCE(orders.paid_at, orders.created_at)'));
                $start = $earliestOrder
                    ? Carbon::parse($earliestOrder)->timezone(self::TIMEZONE)->startOfDay()
                    : $now->copy()->startOfYear()->startOfDay();
                $endInclusive = $now->copy()->endOfDay();
                $label = 'Semua Waktu ('.$this->formatIndoDate($start).' - '.$this->formatIndoDate($endInclusive).')';
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

        // Resolusi Periode Pembanding (Compare Period)
        $compareModeRaw = $hasExplicitPeriod
            ? $request->query('compare_mode', 'previous_period')
            : ($request->query('compare_mode') ?? ($savedFilter['compare_mode'] ?? 'previous_period'));
        $compareMode = is_string($compareModeRaw) && in_array($compareModeRaw, ['previous_period', 'previous_month', 'previous_year', 'custom_compare', 'none'], true)
            ? $compareModeRaw
            : 'previous_period';

        $compareStartRaw = $hasExplicitPeriod
            ? $request->query('compare_start_date')
            : ($request->query('compare_start_date') ?? ($savedFilter['compare_start_date'] ?? null));
        $compareEndRaw = $hasExplicitPeriod
            ? $request->query('compare_end_date')
            : ($request->query('compare_end_date') ?? ($savedFilter['compare_end_date'] ?? null));

        if ($compareMode === 'none') {
            $prevStart = null;
            $prevEndExclusive = null;
            $prevLabel = null;
        } elseif ($compareMode === 'previous_month') {
            $prevStart = $start->copy()->subMonthNoOverflow()->startOfDay();
            $prevEndExclusive = $endExclusive->copy()->subMonthNoOverflow()->startOfDay();
            $prevLabel = 'Bulan Sebelumnya ('.$this->formatIndoDate($prevStart).' - '.$this->formatIndoDate($prevEndExclusive->copy()->subDay()).')';
        } elseif ($compareMode === 'previous_year') {
            $prevStart = $start->copy()->subYear()->startOfDay();
            $prevEndExclusive = $endExclusive->copy()->subYear()->startOfDay();
            $prevLabel = 'Tahun Sebelumnya ('.$this->formatIndoDate($prevStart).' - '.$this->formatIndoDate($prevEndExclusive->copy()->subDay()).')';
        } elseif ($compareMode === 'custom_compare' && is_string($compareStartRaw) && $compareStartRaw !== '' && is_string($compareEndRaw) && $compareEndRaw !== '') {
            $prevStart = Carbon::createFromFormat('Y-m-d', $compareStartRaw, self::TIMEZONE)->startOfDay();
            $cEnd = Carbon::createFromFormat('Y-m-d', $compareEndRaw, self::TIMEZONE)->endOfDay();
            $prevEndExclusive = $cEnd->copy()->startOfDay()->addDay();
            $prevLabel = 'Pembanding Kustom ('.$this->formatIndoDate($prevStart).' - '.$this->formatIndoDate($cEnd).')';
        } else {
            // Mode Default: Periode Sebelumnya dengan durasi yang setara
            if ($preset === 'this_year') {
                $prevYear = $start->copy()->subYear();
                $prevStart = $prevYear->copy()->startOfYear()->startOfDay();
                $prevEndExclusive = $prevYear->copy()->endOfYear()->startOfDay()->addDay();
                $prevLabel = 'Tahun Lalu ('.$prevStart->format('Y').')';
            } elseif ($preset === 'last_year') {
                $prevYear = $start->copy()->subYear();
                $prevStart = $prevYear->copy()->startOfYear()->startOfDay();
                $prevEndExclusive = $prevYear->copy()->endOfYear()->startOfDay()->addDay();
                $prevLabel = 'Tahun '.$prevStart->format('Y');
            } elseif ($preset === 'this_month') {
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
            } elseif ($preset === 'last_week') {
                $prevStart = $start->copy()->subWeek();
                $prevEndExclusive = $start->copy();
                $prevLabel = '2 Minggu Lalu ('.$this->formatIndoDate($prevStart).' - '.$this->formatIndoDate($prevEndExclusive->copy()->subDay()).')';
            } elseif ($preset === 'today') {
                $prevStart = $start->copy()->subDay();
                $prevEndExclusive = $start->copy();
                $prevLabel = 'Kemarin ('.$this->formatIndoDate($prevStart).')';
            } elseif ($preset === 'yesterday') {
                $prevStart = $start->copy()->subDay();
                $prevEndExclusive = $start->copy();
                $prevLabel = '2 Hari Lalu ('.$this->formatIndoDate($prevStart).')';
            } else {
                $prevStart = $start->copy()->subDays($daysCount);
                $prevEndExclusive = $start->copy();
                $prevLabel = 'Periode Sebelumnya ('.$this->formatIndoDate($prevStart).' - '.$this->formatIndoDate($prevEndExclusive->copy()->subDay()).')';
            }
        }

        if (($hasExplicitPeriod || $request->filled('aggregation')) && ! $request->expectsJson() && ! $request->routeIs('*.export.*') && $request->hasSession()) {
            $existingSession = $request->session()->get(self::PERIOD_FILTER_SESSION_KEY);
            $existingAgg = is_array($existingSession) && is_string($existingSession['aggregation'] ?? null)
                ? $existingSession['aggregation']
                : 'auto';
            $aggInput = $request->filled('aggregation')
                ? (string) $request->query('aggregation')
                : ($hasExplicitPeriod ? 'auto' : $existingAgg);
            if (! in_array($aggInput, ['auto', 'daily', 'weekly', 'monthly'], true)) {
                $aggInput = 'auto';
            }

            $request->session()->put(self::PERIOD_FILTER_SESSION_KEY, [
                'preset' => $preset,
                'start_date' => $preset === 'custom' ? $start->format('Y-m-d') : '',
                'end_date' => $preset === 'custom' ? $endInclusive->format('Y-m-d') : '',
                'compare_mode' => $compareMode,
                'compare_start_date' => $compareMode === 'custom_compare' && is_string($compareStartRaw) ? $compareStartRaw : '',
                'compare_end_date' => $compareMode === 'custom_compare' && is_string($compareEndRaw) ? $compareEndRaw : '',
                'aggregation' => $aggInput,
            ]);
        }

        return [
            'preset' => $preset,
            'start' => $start,
            'end_inclusive' => $endInclusive,
            'end_exclusive' => $endExclusive,
            'days_count' => $daysCount,
            'label' => $label,
            'compare_mode' => $compareMode,
            'prev_start' => $prevStart,
            'prev_end_exclusive' => $prevEndExclusive,
            'prev_label' => $prevLabel,
        ];
    }

    /**
     * Hitung seluruh metrik kartu ringkasan (Hari Ini, Minggu Ini, Bulan Ini, dan Periode Filter + Perbandingan).
     *
     * @param  array<string, mixed>  $resolved
     * @return array<string, mixed>
     */
    private function computeSummaryMetrics(array $resolved, bool $includeExpensesAndMissingCost = true): array
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
        /** @var Carbon $periodStart */
        $periodStart = $resolved['start'];
        /** @var Carbon $periodEndExclusive */
        $periodEndExclusive = $resolved['end_exclusive'];
        /** @var Carbon|null $prevPeriodStart */
        $prevPeriodStart = $resolved['prev_start'];
        /** @var Carbon|null $prevPeriodEndExclusive */
        $prevPeriodEndExclusive = $resolved['prev_end_exclusive'];

        $effDateExpr = 'COALESCE(orders.paid_at, orders.created_at)';
        $isRealizedExpr = "(orders.payment_status = 'paid' AND orders.order_status != 'cancelled')";
        $netAmountExpr = 'MAX(0, orders.total_amount - COALESCE(orders.refunded_amount, 0))';
        if (DB::connection()->getDriverName() === 'pgsql') {
            $netAmountExpr = 'GREATEST(0, orders.total_amount - COALESCE(orders.refunded_amount, 0))';
        }
        $effectiveGatewayExpr = "COALESCE(NULLIF(orders.payment_gateway, ''), CASE WHEN orders.payment_method IN ('qris', 'transfer', 'debit') THEN 'xendit' ELSE 'manual' END)";

        $metrics = DB::table('orders')
            ->selectRaw("
                -- Hari Ini & Kemarin
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as today_revenue,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN 1 END) as today_paid_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN 1 END) as today_orders_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.order_status = 'cancelled' THEN 1 END) as today_cancelled_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.order_status = 'cancelled' THEN orders.total_amount ELSE 0 END), 0) as today_cancelled_amount,
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
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.order_status = 'cancelled' THEN 1 END) as this_month_cancelled_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.order_status = 'cancelled' THEN orders.total_amount ELSE 0 END), 0) as this_month_cancelled_amount,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as last_month_revenue,

                -- Periode Terpilih (Filter Aktif)
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as period_net_revenue,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN orders.total_amount ELSE 0 END), 0) as period_gross_revenue,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN 1 END) as period_total_orders,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN 1 END) as period_paid_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.order_status = 'completed' THEN 1 END) as period_completed_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.payment_status = 'unpaid' AND orders.order_status != 'cancelled' THEN 1 END) as period_unpaid_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.payment_status = 'unpaid' AND orders.order_status != 'cancelled' THEN orders.total_amount ELSE 0 END), 0) as period_unpaid_amount,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND (orders.order_status = 'cancelled' OR orders.payment_status = 'failed') THEN 1 END) as period_failed_cancelled_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.order_status = 'cancelled' THEN 1 END) as period_cancelled_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.payment_status = 'failed' THEN 1 END) as period_failed_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.order_status = 'cancelled' THEN orders.total_amount ELSE 0 END), 0) as period_cancelled_amount,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND (orders.order_status = 'cancelled' OR orders.payment_status = 'failed') THEN orders.total_amount ELSE 0 END), 0) as period_failed_cancelled_amount,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND (orders.payment_status = 'refunded' OR COALESCE(orders.refunded_amount, 0) > 0) THEN 1 END) as period_refunded_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN COALESCE(orders.refunded_amount, 0) ELSE 0 END), 0) as period_refund_amount,

                -- Periode Pembanding Sebelumnya
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as prev_period_net_revenue,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN orders.total_amount ELSE 0 END), 0) as prev_period_gross_revenue,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN 1 END) as prev_period_total_orders,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$isRealizedExpr} THEN 1 END) as prev_period_paid_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.order_status = 'completed' THEN 1 END) as prev_period_completed_count,
                COUNT(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.order_status = 'cancelled' THEN 1 END) as prev_period_cancelled_count,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND orders.order_status = 'cancelled' THEN orders.total_amount ELSE 0 END), 0) as prev_period_cancelled_amount,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN COALESCE(orders.refunded_amount, 0) ELSE 0 END), 0) as prev_period_refund_amount
            ", [
                // Hari Ini & Kemarin
                $todayStart->format('Y-m-d H:i:s'), $tomorrowStart->format('Y-m-d H:i:s'),
                $todayStart->format('Y-m-d H:i:s'), $tomorrowStart->format('Y-m-d H:i:s'),
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
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),
                $periodStart->format('Y-m-d H:i:s'), $periodEndExclusive->format('Y-m-d H:i:s'),

                // Periode Pembanding Sebelumnya
                $prevPeriodStart ? $prevPeriodStart->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodEndExclusive ? $prevPeriodEndExclusive->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodStart ? $prevPeriodStart->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodEndExclusive ? $prevPeriodEndExclusive->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodStart ? $prevPeriodStart->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodEndExclusive ? $prevPeriodEndExclusive->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodStart ? $prevPeriodStart->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodEndExclusive ? $prevPeriodEndExclusive->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodStart ? $prevPeriodStart->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodEndExclusive ? $prevPeriodEndExclusive->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodStart ? $prevPeriodStart->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodEndExclusive ? $prevPeriodEndExclusive->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodStart ? $prevPeriodStart->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodEndExclusive ? $prevPeriodEndExclusive->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodStart ? $prevPeriodStart->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
                $prevPeriodEndExclusive ? $prevPeriodEndExclusive->format('Y-m-d H:i:s') : '1970-01-01 00:00:00',
            ])
            ->first();

        // Breakdown Metode Pembayaran & Payment Gateway dalam 1 query gabungan pada Periode Terpilih
        $paymentChannelBreakdown = DB::table('orders')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [
                $periodStart->format('Y-m-d H:i:s'),
                $periodEndExclusive->format('Y-m-d H:i:s'),
            ])
            ->selectRaw("
                COALESCE(payment_method, 'cash') as method,
                {$effectiveGatewayExpr} as gateway,
                COUNT(CASE WHEN {$isRealizedExpr} THEN 1 END) as paid_count,
                COALESCE(SUM(CASE WHEN {$isRealizedExpr} THEN {$netAmountExpr} ELSE 0 END), 0) as paid_net_revenue,
                COUNT(CASE WHEN orders.payment_status = 'unpaid' AND orders.order_status != 'cancelled' THEN 1 END) as unpaid_count,
                COALESCE(SUM(CASE WHEN orders.payment_status = 'unpaid' AND orders.order_status != 'cancelled' THEN orders.total_amount ELSE 0 END), 0) as unpaid_amount,
                COUNT(CASE WHEN orders.order_status = 'cancelled' OR orders.payment_status = 'failed' THEN 1 END) as cancelled_count,
                COALESCE(SUM(CASE WHEN orders.order_status = 'cancelled' OR orders.payment_status = 'failed' THEN orders.total_amount ELSE 0 END), 0) as cancelled_amount
            ")
            ->groupByRaw("COALESCE(payment_method, 'cash'), {$effectiveGatewayExpr}")
            ->get();

        $aggregateBucket = static function (Collection $rows, string $groupField): Collection {
            $buckets = [];
            foreach ($rows as $row) {
                $key = (string) $row->{$groupField};
                if (! isset($buckets[$key])) {
                    $buckets[$key] = (object) [
                        $groupField => $key,
                        'paid_count' => 0,
                        'paid_net_revenue' => 0.0,
                        'unpaid_count' => 0,
                        'unpaid_amount' => 0.0,
                        'cancelled_count' => 0,
                        'cancelled_amount' => 0.0,
                    ];
                }
                $buckets[$key]->paid_count += (int) $row->paid_count;
                $buckets[$key]->paid_net_revenue += (float) $row->paid_net_revenue;
                $buckets[$key]->unpaid_count += (int) $row->unpaid_count;
                $buckets[$key]->unpaid_amount += (float) $row->unpaid_amount;
                $buckets[$key]->cancelled_count += (int) $row->cancelled_count;
                $buckets[$key]->cancelled_amount += (float) $row->cancelled_amount;
            }

            return collect($buckets);
        };

        $methodBreakdownRows = $aggregateBucket($paymentChannelBreakdown, 'method');
        $gatewayBreakdownRows = $aggregateBucket($paymentChannelBreakdown, 'gateway');

        $periodNetRevenue = (float) ($metrics->period_net_revenue ?? 0);
        $periodGrossRevenue = (float) ($metrics->period_gross_revenue ?? 0);
        $periodPaidCount = (int) ($metrics->period_paid_count ?? 0);
        $periodAov = $periodPaidCount > 0 ? round($periodNetRevenue / $periodPaidCount, 2) : 0.0;

        $paymentMethods = [];
        $methodDefinitions = [
            'cash' => 'Tunai (Cash)',
            'qris' => 'QRIS',
            'transfer' => 'Transfer Bank',
            'debit' => 'Kartu Debit / EDC',
        ];
        foreach ($methodDefinitions as $code => $label) {
            $row = $methodBreakdownRows->get($code);
            $paidCount = (int) ($row->paid_count ?? 0);
            $paidNetRev = (float) ($row->paid_net_revenue ?? 0);
            $revShare = $periodNetRevenue > 0 ? round(($paidNetRev / $periodNetRevenue) * 100, 1) : 0.0;
            $countShare = $periodPaidCount > 0 ? round(($paidCount / $periodPaidCount) * 100, 1) : 0.0;

            $paymentMethods[] = [
                'method' => $code,
                'label' => $label,
                'transactions_count' => $paidCount,
                'net_revenue' => $paidNetRev,
                'revenue_share_percent' => $revShare,
                'count_share_percent' => $countShare,
                'unpaid_count' => (int) ($row->unpaid_count ?? 0),
                'unpaid_amount' => (float) ($row->unpaid_amount ?? 0),
                'cancelled_count' => (int) ($row->cancelled_count ?? 0),
                'cancelled_amount' => (float) ($row->cancelled_amount ?? 0),
            ];
        }

        $activeDriver = (string) config('services.payment_gateway.default_driver', 'xendit');
        $gatewayDefinitions = [
            'xendit' => 'Pembayaran Digital',
            'manual' => 'Kasir POS (Tunai Manual)',
            'midtrans' => 'Midtrans Snap',
        ];
        $paymentGateways = [];
        foreach ($gatewayDefinitions as $gwCode => $gwLabel) {
            $gwRow = $gatewayBreakdownRows->get($gwCode);
            $gwPaidCount = (int) ($gwRow->paid_count ?? 0);
            $gwPaidNetRev = (float) ($gwRow->paid_net_revenue ?? 0);

            if ($gwCode === 'midtrans' && $gwPaidCount === 0 && (int) ($gwRow->unpaid_count ?? 0) === 0 && $activeDriver !== 'midtrans') {
                continue;
            }

            $paymentGateways[] = [
                'gateway' => $gwCode,
                'label' => $gwLabel,
                'transactions_count' => $gwPaidCount,
                'net_revenue' => $gwPaidNetRev,
                'revenue_share_percent' => $periodNetRevenue > 0 ? round(($gwPaidNetRev / $periodNetRevenue) * 100, 1) : 0.0,
                'count_share_percent' => $periodPaidCount > 0 ? round(($gwPaidCount / $periodPaidCount) * 100, 1) : 0.0,
                'unpaid_count' => (int) ($gwRow->unpaid_count ?? 0),
                'unpaid_amount' => (float) ($gwRow->unpaid_amount ?? 0),
                'cancelled_count' => (int) ($gwRow->cancelled_count ?? 0),
                'cancelled_amount' => (float) ($gwRow->cancelled_amount ?? 0),
                'is_active_slot' => $gwCode === $activeDriver,
            ];
        }

        $xenditConfigured = ! empty(config('services.xendit.secret_key'));
        $xenditProduction = (bool) config('services.xendit.is_production', false);

        // Hitung Kuantitas Item Menu Terjual Aktual & HPP / COGS Riil dalam 1 query gabungan
        $todayStartStr = $todayStart->format('Y-m-d H:i:s');
        $tomorrowStartStr = $tomorrowStart->format('Y-m-d H:i:s');
        $thisMonthStartStr = $thisMonthStart->format('Y-m-d H:i:s');
        $nextMonthStartStr = $nextMonthStart->format('Y-m-d H:i:s');
        $periodStartStr = $periodStart->format('Y-m-d H:i:s');
        $periodEndExclusiveStr = $periodEndExclusive->format('Y-m-d H:i:s');
        $prevPeriodStartStr = $prevPeriodStart ? $prevPeriodStart->format('Y-m-d H:i:s') : '1970-01-01 00:00:00';
        $prevPeriodEndExclusiveStr = $prevPeriodEndExclusive ? $prevPeriodEndExclusive->format('Y-m-d H:i:s') : '1970-01-01 00:00:00';

        $effCostExpr = 'COALESCE(order_items.cost_price, menus.cost_price)';

        $itemsSoldStats = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->leftJoin('menus', 'order_items.menu_id', '=', 'menus.id')
            ->whereRaw($isRealizedExpr)
            ->where('order_items.status', 'active')
            ->selectRaw("
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN order_items.quantity ELSE 0 END), 0) as period_items_sold,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$effCostExpr} IS NOT NULL THEN order_items.quantity ELSE 0 END), 0) as period_cogs_covered_qty,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$effCostExpr} IS NOT NULL THEN ({$effCostExpr} * order_items.quantity) ELSE 0 END), 0) as period_cogs,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN order_items.quantity ELSE 0 END), 0) as prev_period_items_sold,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$effCostExpr} IS NOT NULL THEN ({$effCostExpr} * order_items.quantity) ELSE 0 END), 0) as prev_period_cogs,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN order_items.quantity ELSE 0 END), 0) as today_items_sold,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$effCostExpr} IS NOT NULL THEN ({$effCostExpr} * order_items.quantity) ELSE 0 END), 0) as today_cogs,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? THEN order_items.quantity ELSE 0 END), 0) as this_month_items_sold,
                COALESCE(SUM(CASE WHEN {$effDateExpr} >= ? AND {$effDateExpr} < ? AND {$effCostExpr} IS NOT NULL THEN ({$effCostExpr} * order_items.quantity) ELSE 0 END), 0) as this_month_cogs
            ", [
                $periodStartStr, $periodEndExclusiveStr,
                $periodStartStr, $periodEndExclusiveStr,
                $periodStartStr, $periodEndExclusiveStr,
                $prevPeriodStartStr, $prevPeriodEndExclusiveStr,
                $prevPeriodStartStr, $prevPeriodEndExclusiveStr,
                $todayStartStr, $tomorrowStartStr,
                $todayStartStr, $tomorrowStartStr,
                $thisMonthStartStr, $nextMonthStartStr,
                $thisMonthStartStr, $nextMonthStartStr,
            ])
            ->first();

        $periodItemsSold = (int) ($itemsSoldStats->period_items_sold ?? 0);
        $periodCogsCoveredQty = (int) ($itemsSoldStats->period_cogs_covered_qty ?? 0);
        $periodCogsAmount = round((float) ($itemsSoldStats->period_cogs ?? 0), 2);
        $prevPeriodItemsSold = ($prevPeriodStart && $prevPeriodEndExclusive)
            ? (int) ($itemsSoldStats->prev_period_items_sold ?? 0)
            : 0;
        $prevPeriodCogsAmount = ($prevPeriodStart && $prevPeriodEndExclusive)
            ? round((float) ($itemsSoldStats->prev_period_cogs ?? 0), 2)
            : 0.0;
        $todayItemsSold = (int) ($itemsSoldStats->today_items_sold ?? 0);
        $todayCogsAmount = round((float) ($itemsSoldStats->today_cogs ?? 0), 2);
        $thisMonthItemsSold = (int) ($itemsSoldStats->this_month_items_sold ?? 0);
        $thisMonthCogsAmount = round((float) ($itemsSoldStats->this_month_cogs ?? 0), 2);

        // Hitung Beban Operasional (Expenses) Riil dalam 1 query gabungan (hanya jika diminta oleh laporan lengkap)
        $periodExpensesTotal = 0.0;
        $periodExpensesCount = 0;
        $periodExpensesCash = 0.0;
        $periodExpensesBank = 0.0;
        $prevPeriodExpenses = 0.0;
        $todayExpenses = 0.0;
        $thisMonthExpenses = 0.0;
        $menusMissingCostCount = 0;

        if ($includeExpensesAndMissingCost) {
            $periodStartDateStr = $periodStart->format('Y-m-d');
            /** @var Carbon $periodEndInclusive */
            $periodEndInclusive = $resolved['end_inclusive'];
            $periodEndDateStr = $periodEndInclusive->format('Y-m-d');
            $prevStartDateStr = $prevPeriodStart ? $prevPeriodStart->format('Y-m-d') : '1970-01-01';
            $prevEndDateStr = $prevPeriodEndExclusive ? $prevPeriodEndExclusive->copy()->subDay()->format('Y-m-d') : '1970-01-01';
            $todayDateStr = $todayStart->format('Y-m-d');
            $thisMonthStartDateStr = $thisMonthStart->format('Y-m-d');
            $thisMonthEndDateStr = $nextMonthStart->copy()->subDay()->format('Y-m-d');

            $expDateExpr = DB::connection()->getDriverName() === 'pgsql'
                ? 'expense_date::text'
                : 'substr(expense_date, 1, 10)';

            $expenseStats = DB::table('expenses')
                ->selectRaw("
                    COALESCE(SUM(CASE WHEN {$expDateExpr} >= ? AND {$expDateExpr} <= ? THEN amount ELSE 0 END), 0) as period_expenses_total,
                    COUNT(CASE WHEN {$expDateExpr} >= ? AND {$expDateExpr} <= ? THEN 1 END) as period_expenses_count,
                    COALESCE(SUM(CASE WHEN {$expDateExpr} >= ? AND {$expDateExpr} <= ? AND payment_source = 'cash' THEN amount ELSE 0 END), 0) as period_expenses_cash,
                    COALESCE(SUM(CASE WHEN {$expDateExpr} >= ? AND {$expDateExpr} <= ? AND payment_source IN ('bank', 'xendit_balance') THEN amount ELSE 0 END), 0) as period_expenses_bank,
                    COALESCE(SUM(CASE WHEN {$expDateExpr} >= ? AND {$expDateExpr} <= ? THEN amount ELSE 0 END), 0) as prev_period_expenses,
                    COALESCE(SUM(CASE WHEN {$expDateExpr} = ? THEN amount ELSE 0 END), 0) as today_expenses,
                    COALESCE(SUM(CASE WHEN {$expDateExpr} >= ? AND {$expDateExpr} <= ? THEN amount ELSE 0 END), 0) as this_month_expenses
                ", [
                    $periodStartDateStr, $periodEndDateStr,
                    $periodStartDateStr, $periodEndDateStr,
                    $periodStartDateStr, $periodEndDateStr,
                    $periodStartDateStr, $periodEndDateStr,
                    $prevStartDateStr, $prevEndDateStr,
                    $todayDateStr,
                    $thisMonthStartDateStr, $thisMonthEndDateStr,
                ])
                ->first();

            $periodExpensesTotal = round((float) ($expenseStats->period_expenses_total ?? 0), 2);
            $periodExpensesCount = (int) ($expenseStats->period_expenses_count ?? 0);
            $periodExpensesCash = round((float) ($expenseStats->period_expenses_cash ?? 0), 2);
            $periodExpensesBank = round((float) ($expenseStats->period_expenses_bank ?? 0), 2);
            $prevPeriodExpenses = ($prevPeriodStart && $prevPeriodEndExclusive)
                ? round((float) ($expenseStats->prev_period_expenses ?? 0), 2)
                : 0.0;
            $todayExpenses = round((float) ($expenseStats->today_expenses ?? 0), 2);
            $thisMonthExpenses = round((float) ($expenseStats->this_month_expenses ?? 0), 2);

            $menusMissingCostCount = (int) DB::table('menus')
                ->where('is_active', true)
                ->whereNull('cost_price')
                ->count();
        }

        $todayRevenue = (float) ($metrics->today_revenue ?? 0);
        $yesterdayRevenue = (float) ($metrics->yesterday_revenue ?? 0);
        $thisWeekRevenue = (float) ($metrics->this_week_revenue ?? 0);
        $lastWeekRevenue = (float) ($metrics->last_week_revenue ?? 0);
        $thisMonthRevenue = (float) ($metrics->this_month_revenue ?? 0);
        $lastMonthRevenue = (float) ($metrics->last_month_revenue ?? 0);

        $prevPeriodNetRevenue = (float) ($metrics->prev_period_net_revenue ?? 0);
        $prevPeriodGrossRevenue = (float) ($metrics->prev_period_gross_revenue ?? 0);
        $prevPeriodPaidCount = (int) ($metrics->prev_period_paid_count ?? 0);
        $prevPeriodTotalOrders = (int) ($metrics->prev_period_total_orders ?? 0);
        $prevPeriodCompletedCount = (int) ($metrics->prev_period_completed_count ?? 0);
        $prevPeriodCancelledCount = (int) ($metrics->prev_period_cancelled_count ?? 0);
        $prevPeriodCancelledAmount = (float) ($metrics->prev_period_cancelled_amount ?? 0);
        $prevPeriodRefundAmount = (float) ($metrics->prev_period_refund_amount ?? 0);
        $prevPeriodAov = $prevPeriodPaidCount > 0 ? round($prevPeriodNetRevenue / $prevPeriodPaidCount, 2) : 0.0;

        $periodTotalOrders = (int) ($metrics->period_total_orders ?? 0);
        $periodCompletedCount = (int) ($metrics->period_completed_count ?? 0);
        $periodCancelledCount = (int) ($metrics->period_cancelled_count ?? 0);
        $periodCancelledAmount = (float) ($metrics->period_cancelled_amount ?? 0);
        $periodRefundAmount = (float) ($metrics->period_refund_amount ?? 0);
        $periodRefundCount = (int) ($metrics->period_refunded_count ?? 0);

        $cogsCoveragePercent = $periodItemsSold > 0
            ? round(($periodCogsCoveredQty / $periodItemsSold) * 100, 1)
            : 100.0;
        $cogsStatus = $periodItemsSold === 0
            ? 'complete'
            : ($periodCogsCoveredQty >= $periodItemsSold ? 'complete' : ($periodCogsCoveredQty > 0 ? 'partial' : 'unavailable'));
        $cogsMessage = match ($cogsStatus) {
            'complete' => '100% porsi terjual memiliki modal HPP dari master menu & snapshot transaksi.',
            'partial' => "{$cogsCoveragePercent}% porsi terjual ({$periodCogsCoveredQty}/{$periodItemsSold} porsi) sudah memiliki HPP. Lengkapi modal menu yang tersisa.",
            default => 'Belum ada item terjual di periode ini yang memiliki data HPP. Atur HPP di halaman Menu, Kategori & HPP.',
        };

        $periodGrossProfit = round($periodNetRevenue - $periodCogsAmount, 2);
        $prevPeriodGrossProfit = round($prevPeriodNetRevenue - $prevPeriodCogsAmount, 2);
        $grossMarginPercent = $periodNetRevenue > 0 ? round(($periodGrossProfit / $periodNetRevenue) * 100, 1) : 0.0;

        $periodNetProfit = round($periodGrossProfit - $periodExpensesTotal, 2);
        $prevPeriodNetProfit = round($prevPeriodGrossProfit - $prevPeriodExpenses, 2);
        $netMarginPercent = $periodNetRevenue > 0 ? round(($periodNetProfit / $periodNetRevenue) * 100, 1) : 0.0;

        $todayNetProfit = round($todayRevenue - $todayCogsAmount - $todayExpenses, 2);
        $thisMonthNetProfit = round($thisMonthRevenue - $thisMonthCogsAmount - $thisMonthExpenses, 2);

        $inflowXendit = (float) ($gatewayBreakdownRows->get('xendit')->paid_net_revenue ?? 0);
        $inflowCash = (float) ($methodBreakdownRows->get('cash')->paid_net_revenue ?? 0);
        $inflowQris = (float) ($methodBreakdownRows->get('qris')->paid_net_revenue ?? 0);
        $inflowTransfer = (float) ($methodBreakdownRows->get('transfer')->paid_net_revenue ?? 0);
        $inflowDebit = (float) ($methodBreakdownRows->get('debit')->paid_net_revenue ?? 0);

        return [
            'today_revenue' => $todayRevenue,
            'today_cogs' => $todayCogsAmount,
            'today_expenses' => $todayExpenses,
            'today_net_profit' => $todayNetProfit,
            'today_paid_count' => (int) ($metrics->today_paid_count ?? 0),
            'today_orders_count' => (int) ($metrics->today_orders_count ?? 0),
            'today_items_sold' => $todayItemsSold,
            'today_cancelled_count' => (int) ($metrics->today_cancelled_count ?? 0),
            'today_cancelled_amount' => (float) ($metrics->today_cancelled_amount ?? 0),
            'yesterday_revenue' => $yesterdayRevenue,
            'today_growth_percent' => $this->calculateGrowthPercent($todayRevenue, $yesterdayRevenue),

            'this_week_revenue' => $thisWeekRevenue,
            'this_week_paid_count' => (int) ($metrics->this_week_paid_count ?? 0),
            'this_week_orders_count' => (int) ($metrics->this_week_orders_count ?? 0),
            'last_week_revenue' => $lastWeekRevenue,
            'this_week_growth_percent' => $this->calculateGrowthPercent($thisWeekRevenue, $lastWeekRevenue),
            'this_week_label' => $this->formatIndoDate($thisWeekStart).' - '.$this->formatIndoDate($nextWeekStart->copy()->subDay()),

            'this_month_revenue' => $thisMonthRevenue,
            'this_month_cogs' => $thisMonthCogsAmount,
            'this_month_expenses' => $thisMonthExpenses,
            'this_month_net_profit' => $thisMonthNetProfit,
            'this_month_paid_count' => (int) ($metrics->this_month_paid_count ?? 0),
            'this_month_orders_count' => (int) ($metrics->this_month_orders_count ?? 0),
            'this_month_items_sold' => $thisMonthItemsSold,
            'this_month_cancelled_count' => (int) ($metrics->this_month_cancelled_count ?? 0),
            'this_month_cancelled_amount' => (float) ($metrics->this_month_cancelled_amount ?? 0),
            'last_month_revenue' => $lastMonthRevenue,
            'this_month_growth_percent' => $this->calculateGrowthPercent($thisMonthRevenue, $lastMonthRevenue),
            'this_month_label' => $this->formatIndoMonthYear($thisMonthStart),

            'period' => [
                'label' => $resolved['label'],
                'net_revenue' => $periodNetRevenue,
                'previous_period_revenue' => $prevPeriodNetRevenue,
                'net_revenue_diff' => $periodNetRevenue - $prevPeriodNetRevenue,
                'period_growth_percent' => $this->calculateGrowthPercent($periodNetRevenue, $prevPeriodNetRevenue),
                'previous_period_label' => $resolved['prev_label'],

                'gross_revenue' => $periodGrossRevenue,
                'previous_gross_revenue' => $prevPeriodGrossRevenue,
                'gross_revenue_diff' => $periodGrossRevenue - $prevPeriodGrossRevenue,
                'gross_growth_percent' => $this->calculateGrowthPercent($periodGrossRevenue, $prevPeriodGrossRevenue),

                'total_orders_count' => $periodTotalOrders,
                'previous_total_orders' => $prevPeriodTotalOrders,
                'total_orders_diff' => $periodTotalOrders - $prevPeriodTotalOrders,
                'orders_growth_percent' => $this->calculateGrowthPercent($periodTotalOrders, $prevPeriodTotalOrders),

                'completed_orders_count' => $periodCompletedCount,
                'previous_completed_orders' => $prevPeriodCompletedCount,
                'completed_orders_diff' => $periodCompletedCount - $prevPeriodCompletedCount,
                'completed_growth_percent' => $this->calculateGrowthPercent($periodCompletedCount, $prevPeriodCompletedCount),

                'paid_transactions_count' => $periodPaidCount,
                'previous_paid_count' => $prevPeriodPaidCount,
                'paid_transactions_diff' => $periodPaidCount - $prevPeriodPaidCount,

                'average_order_value' => $periodAov,
                'previous_aov' => $prevPeriodAov,
                'aov_diff' => $periodAov - $prevPeriodAov,
                'aov_growth_percent' => $this->calculateGrowthPercent($periodAov, $prevPeriodAov),

                'items_sold' => $periodItemsSold,
                'previous_items_sold' => $prevPeriodItemsSold,
                'items_sold_diff' => $periodItemsSold - $prevPeriodItemsSold,
                'items_sold_growth_percent' => $this->calculateGrowthPercent($periodItemsSold, $prevPeriodItemsSold),

                'pending_payments_count' => (int) ($metrics->period_unpaid_count ?? 0),
                'pending_payments_amount' => (float) ($metrics->period_unpaid_amount ?? 0),
                'failed_or_cancelled_count' => (int) ($metrics->period_failed_cancelled_count ?? 0),

                'cancelled_orders_count' => $periodCancelledCount,
                'previous_cancelled_orders' => $prevPeriodCancelledCount,
                'cancelled_orders_diff' => $periodCancelledCount - $prevPeriodCancelledCount,
                'cancelled_amount' => $periodCancelledAmount,
                'previous_cancelled_amount' => $prevPeriodCancelledAmount,
                'cancelled_growth_percent' => $this->calculateGrowthPercent($periodCancelledAmount, $prevPeriodCancelledAmount),

                'failed_payments_count' => (int) ($metrics->period_failed_count ?? 0),
                'failed_or_cancelled_amount' => (float) ($metrics->period_failed_cancelled_amount ?? 0),

                'refunded_count' => $periodRefundCount,
                'refund_amount' => $periodRefundAmount,
                'previous_refund_amount' => $prevPeriodRefundAmount,
                'refund_diff' => $periodRefundAmount - $prevPeriodRefundAmount,
                'refund_growth_percent' => $this->calculateGrowthPercent($periodRefundAmount, $prevPeriodRefundAmount),

                // Data Biaya, HPP & Laba Rugi Riil
                'discount_amount' => 0.0,
                'tax_service_amount' => 0.0,
                'cogs_amount' => $periodCogsAmount,
                'previous_cogs_amount' => $prevPeriodCogsAmount,
                'cogs_diff' => $periodCogsAmount - $prevPeriodCogsAmount,
                'cogs_growth_percent' => $this->calculateGrowthPercent($periodCogsAmount, $prevPeriodCogsAmount),
                'cogs_coverage_percent' => $cogsCoveragePercent,
                'cogs_covered_items' => $periodCogsCoveredQty,
                'cogs_total_items' => $periodItemsSold,
                'menus_missing_cost_count' => $menusMissingCostCount,
                'cogs_status' => $cogsStatus,
                'cogs_message' => $cogsMessage,

                'gross_profit' => $periodGrossProfit,
                'previous_gross_profit' => $prevPeriodGrossProfit,
                'gross_profit_diff' => $periodGrossProfit - $prevPeriodGrossProfit,
                'gross_profit_growth_percent' => $this->calculateGrowthPercent($periodGrossProfit, $prevPeriodGrossProfit),
                'gross_margin_percent' => $grossMarginPercent,

                'operational_expenses' => $periodExpensesTotal,
                'operational_expenses_cash' => $periodExpensesCash,
                'operational_expenses_bank' => $periodExpensesBank,
                'operational_expenses_count' => $periodExpensesCount,
                'previous_operational_expenses' => $prevPeriodExpenses,
                'operational_expenses_diff' => $periodExpensesTotal - $prevPeriodExpenses,
                'operational_expenses_growth_percent' => $this->calculateGrowthPercent($periodExpensesTotal, $prevPeriodExpenses),
                'operational_expenses_status' => $periodExpensesCount > 0 ? 'recorded' : 'empty',
                'operational_expenses_message' => $periodExpensesCount > 0
                    ? "{$periodExpensesCount} pengeluaran operasional tercatat pada periode ini."
                    : 'Belum ada catatan pengeluaran operasional pada periode ini.',

                'net_profit' => $periodNetProfit,
                'previous_net_profit' => $prevPeriodNetProfit,
                'net_profit_diff' => $periodNetProfit - $prevPeriodNetProfit,
                'net_profit_growth_percent' => $this->calculateGrowthPercent($periodNetProfit, $prevPeriodNetProfit),
                'net_margin_percent' => $netMarginPercent,
                'net_profit_status' => $cogsStatus === 'complete' ? 'complete' : 'partial',
                'net_profit_message' => $cogsStatus === 'complete'
                    ? 'Laba bersih dihitung akurat dari Omzet Bersih - HPP - Pengeluaran Operasional.'
                    : "Laba bersih menggunakan {$cogsCoveragePercent}% cakupan HPP item terjual.",

                // Arus Kas Riil Periode (Masuk vs Keluar)
                'cash_flow' => [
                    'inflow_total' => $periodNetRevenue,
                    'inflow_gross' => $periodGrossRevenue,
                    'inflow_cash' => $inflowCash,
                    'inflow_qris' => $inflowQris,
                    'inflow_transfer' => $inflowTransfer,
                    'inflow_debit' => $inflowDebit,
                    'inflow_xendit' => $inflowXendit,
                    'outflow_refund' => $periodRefundAmount,
                    'outflow_expenses_cash' => $periodExpensesCash,
                    'outflow_expenses_bank' => $periodExpensesBank,
                    'outflow_expenses_total' => $periodExpensesTotal,
                    'net_cash_drawer' => round($inflowCash - $periodExpensesCash, 2),
                    'net_bank_digital' => round(($inflowXendit + $inflowDebit) - $periodExpensesBank, 2),
                    'net_cash_flow' => round($periodNetRevenue - $periodExpensesTotal, 2),
                ],
            ],

            'payment_methods' => $paymentMethods,
            'payment_gateways' => $paymentGateways,
            'xendit_integration' => [
                'driver' => $activeDriver,
                'label' => 'Pembayaran Digital',
                'configured' => $xenditConfigured,
                'is_production' => $xenditProduction,
                'mode' => $xenditConfigured ? ($xenditProduction ? 'Production Live' : 'Sandbox Active') : 'Sandbox Ready Slot',
                'webhook_endpoint' => '/payments/webhook',
                'supported_channels' => ['QRIS', 'Tunai (Cash)'],
                'transactions_count' => (int) ($gatewayBreakdownRows->get('xendit')->paid_count ?? 0),
                'net_revenue' => $inflowXendit,
                'pending_count' => (int) ($gatewayBreakdownRows->get('xendit')->unpaid_count ?? 0),
                'pending_amount' => (float) ($gatewayBreakdownRows->get('xendit')->unpaid_amount ?? 0),
            ],
        ];
    }

    /**
     * Hitung Rekapitulasi Harian, Mingguan, dan Bulanan menggunakan agregasi database per tanggal.
     *
     * @return array<string, mixed>
     */
    private function computePeriodRecaps(Carbon $start, Carbon $endExclusive, bool $includeExpenses = true): array
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
                COUNT(CASE WHEN orders.order_status = 'completed' THEN 1 END) as completed_orders_count,
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

        // Kuantitas item terjual & HPP per hari
        $effCostExpr = 'COALESCE(order_items.cost_price, menus.cost_price)';
        $dailyItemsStats = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->leftJoin('menus', 'order_items.menu_id', '=', 'menus.id')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [
                $start->format('Y-m-d H:i:s'),
                $endExclusive->format('Y-m-d H:i:s'),
            ])
            ->whereRaw($isRealizedExpr)
            ->where('order_items.status', 'active')
            ->selectRaw("
                {$dayKeyExpr} as day_date,
                COALESCE(SUM(order_items.quantity), 0) as items_sold,
                COALESCE(SUM(CASE WHEN {$effCostExpr} IS NOT NULL THEN ({$effCostExpr} * order_items.quantity) ELSE 0 END), 0) as cogs_amount
            ")
            ->groupByRaw($dayKeyExpr)
            ->get()
            ->keyBy('day_date');

        // Pengeluaran operasional per hari
        $dailyExpensesByDate = [];
        if ($includeExpenses) {
            $endInclusiveStr = $endExclusive->copy()->subDay()->format('Y-m-d');
            $expDateExpr = DB::connection()->getDriverName() === 'pgsql'
                ? 'expense_date::text'
                : 'substr(expense_date, 1, 10)';
            $expenseDbRows = DB::table('expenses')
                ->whereRaw("{$expDateExpr} BETWEEN ? AND ?", [$start->format('Y-m-d'), $endInclusiveStr])
                ->selectRaw("{$expDateExpr} as expense_date, COALESCE(SUM(amount), 0) as total_expense")
                ->groupByRaw($expDateExpr)
                ->get();

            foreach ($expenseDbRows as $expRow) {
                $dKey = substr((string) $expRow->expense_date, 0, 10);
                $dailyExpensesByDate[$dKey] = ($dailyExpensesByDate[$dKey] ?? 0.0) + (float) $expRow->total_expense;
            }
        }

        $dailyRows = [];
        $weeklyBuckets = [];
        $monthlyBuckets = [];

        $totals = [
            'total_orders' => 0,
            'completed_orders_count' => 0,
            'paid_orders_count' => 0,
            'unpaid_orders_count' => 0,
            'cancelled_orders_count' => 0,
            'gross_revenue' => 0.0,
            'discount_amount' => 0.0,
            'tax_service_amount' => 0.0,
            'refund_amount' => 0.0,
            'net_revenue' => 0.0,
            'unpaid_amount' => 0.0,
            'average_order_value' => 0.0,
            'items_sold' => 0,
            'cogs_amount' => 0.0,
            'gross_profit' => 0.0,
            'operational_expense' => 0.0,
            'net_profit' => 0.0,
        ];

        $cursor = $start->copy()->startOfDay();
        while ($cursor->lt($endExclusive)) {
            $dateKey = $cursor->format('Y-m-d');
            $dbRow = $dailyDbRows->get($dateKey);
            $itemStat = $dailyItemsStats->get($dateKey);

            $totalOrders = (int) ($dbRow->total_orders ?? 0);
            $paidCount = (int) ($dbRow->paid_orders_count ?? 0);
            $completedCount = (int) ($dbRow->completed_orders_count ?? 0);
            $unpaidCount = (int) ($dbRow->unpaid_orders_count ?? 0);
            $cancelledCount = (int) ($dbRow->cancelled_orders_count ?? 0);
            $grossRev = (float) ($dbRow->gross_revenue ?? 0.0);
            $refundAmt = (float) ($dbRow->refund_amount ?? 0.0);
            $netRev = (float) ($dbRow->net_revenue ?? 0.0);
            $unpaidAmt = (float) ($dbRow->unpaid_amount ?? 0.0);
            $aov = $paidCount > 0 ? round($netRev / $paidCount, 2) : 0.0;
            $itemsSold = (int) ($itemStat->items_sold ?? 0);
            $dayCogs = round((float) ($itemStat->cogs_amount ?? 0.0), 2);
            $dayGrossProfit = round($netRev - $dayCogs, 2);
            $dayOpex = round((float) ($dailyExpensesByDate[$dateKey] ?? 0.0), 2);
            $dayNetProfit = round($dayGrossProfit - $dayOpex, 2);

            $dailyRows[] = [
                'date' => $dateKey,
                'day_name' => $this->getIndoDayName($cursor),
                'short_label' => $this->formatIndoShortDate($cursor),
                'label' => $this->formatIndoDayDate($cursor),
                'total_orders' => $totalOrders,
                'completed_orders_count' => $completedCount,
                'paid_orders_count' => $paidCount,
                'unpaid_orders_count' => $unpaidCount,
                'cancelled_orders_count' => $cancelledCount,
                'gross_revenue' => $grossRev,
                'discount_amount' => 0.0,
                'tax_service_amount' => 0.0,
                'refund_amount' => $refundAmt,
                'net_revenue' => $netRev,
                'cogs_amount' => $dayCogs,
                'gross_profit' => $dayGrossProfit,
                'operational_expense' => $dayOpex,
                'net_profit' => $dayNetProfit,
                'unpaid_amount' => $unpaidAmt,
                'average_order_value' => $aov,
                'items_sold' => $itemsSold,
                'is_peak' => false,
                'is_lowest' => false,
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
                    'completed_orders_count' => 0,
                    'paid_orders_count' => 0,
                    'unpaid_orders_count' => 0,
                    'cancelled_orders_count' => 0,
                    'gross_revenue' => 0.0,
                    'refund_amount' => 0.0,
                    'net_revenue' => 0.0,
                    'cogs_amount' => 0.0,
                    'gross_profit' => 0.0,
                    'operational_expense' => 0.0,
                    'net_profit' => 0.0,
                    'unpaid_amount' => 0.0,
                    'average_order_value' => 0.0,
                    'items_sold' => 0,
                ];
            }

            $weeklyBuckets[$weekKey]['total_orders'] += $totalOrders;
            $weeklyBuckets[$weekKey]['completed_orders_count'] += $completedCount;
            $weeklyBuckets[$weekKey]['paid_orders_count'] += $paidCount;
            $weeklyBuckets[$weekKey]['unpaid_orders_count'] += $unpaidCount;
            $weeklyBuckets[$weekKey]['cancelled_orders_count'] += $cancelledCount;
            $weeklyBuckets[$weekKey]['gross_revenue'] += $grossRev;
            $weeklyBuckets[$weekKey]['refund_amount'] += $refundAmt;
            $weeklyBuckets[$weekKey]['net_revenue'] += $netRev;
            $weeklyBuckets[$weekKey]['cogs_amount'] += $dayCogs;
            $weeklyBuckets[$weekKey]['gross_profit'] += $dayGrossProfit;
            $weeklyBuckets[$weekKey]['operational_expense'] += $dayOpex;
            $weeklyBuckets[$weekKey]['net_profit'] += $dayNetProfit;
            $weeklyBuckets[$weekKey]['unpaid_amount'] += $unpaidAmt;
            $weeklyBuckets[$weekKey]['items_sold'] += $itemsSold;

            // Akumulasi ke Bulanan (YYYY-MM)
            $monthKey = $cursor->format('Y-m');
            if (! isset($monthlyBuckets[$monthKey])) {
                $monthlyBuckets[$monthKey] = [
                    'month_key' => $monthKey,
                    'short_label' => $this->formatIndoShortMonthYear($cursor),
                    'label' => $this->formatIndoMonthYear($cursor),
                    'total_orders' => 0,
                    'completed_orders_count' => 0,
                    'paid_orders_count' => 0,
                    'unpaid_orders_count' => 0,
                    'cancelled_orders_count' => 0,
                    'gross_revenue' => 0.0,
                    'refund_amount' => 0.0,
                    'net_revenue' => 0.0,
                    'cogs_amount' => 0.0,
                    'gross_profit' => 0.0,
                    'operational_expense' => 0.0,
                    'net_profit' => 0.0,
                    'unpaid_amount' => 0.0,
                    'average_order_value' => 0.0,
                    'items_sold' => 0,
                ];
            }

            $monthlyBuckets[$monthKey]['total_orders'] += $totalOrders;
            $monthlyBuckets[$monthKey]['completed_orders_count'] += $completedCount;
            $monthlyBuckets[$monthKey]['paid_orders_count'] += $paidCount;
            $monthlyBuckets[$monthKey]['unpaid_orders_count'] += $unpaidCount;
            $monthlyBuckets[$monthKey]['cancelled_orders_count'] += $cancelledCount;
            $monthlyBuckets[$monthKey]['gross_revenue'] += $grossRev;
            $monthlyBuckets[$monthKey]['refund_amount'] += $refundAmt;
            $monthlyBuckets[$monthKey]['net_revenue'] += $netRev;
            $monthlyBuckets[$monthKey]['cogs_amount'] += $dayCogs;
            $monthlyBuckets[$monthKey]['gross_profit'] += $dayGrossProfit;
            $monthlyBuckets[$monthKey]['operational_expense'] += $dayOpex;
            $monthlyBuckets[$monthKey]['net_profit'] += $dayNetProfit;
            $monthlyBuckets[$monthKey]['unpaid_amount'] += $unpaidAmt;
            $monthlyBuckets[$monthKey]['items_sold'] += $itemsSold;

            // Akumulasi Grand Total Periode
            $totals['total_orders'] += $totalOrders;
            $totals['completed_orders_count'] += $completedCount;
            $totals['paid_orders_count'] += $paidCount;
            $totals['unpaid_orders_count'] += $unpaidCount;
            $totals['cancelled_orders_count'] += $cancelledCount;
            $totals['gross_revenue'] += $grossRev;
            $totals['refund_amount'] += $refundAmt;
            $totals['net_revenue'] += $netRev;
            $totals['cogs_amount'] += $dayCogs;
            $totals['gross_profit'] += $dayGrossProfit;
            $totals['operational_expense'] += $dayOpex;
            $totals['net_profit'] += $dayNetProfit;
            $totals['unpaid_amount'] += $unpaidAmt;
            $totals['items_sold'] += $itemsSold;

            $cursor->addDay();
        }

        // Tentukan Peak Day & Lowest Day
        $maxDailyRev = 0.0;
        foreach ($dailyRows as $dr) {
            if ($dr['net_revenue'] > $maxDailyRev) {
                $maxDailyRev = $dr['net_revenue'];
            }
        }
        $positiveRevs = array_filter(array_column($dailyRows, 'net_revenue'), fn ($r) => $r > 0);
        $minDailyRev = ! empty($positiveRevs) ? min($positiveRevs) : 0.0;

        foreach ($dailyRows as &$dr) {
            if ($maxDailyRev > 0 && $dr['net_revenue'] === $maxDailyRev) {
                $dr['is_peak'] = true;
            }
            if ($maxDailyRev > 0 && $dr['net_revenue'] === $minDailyRev && $minDailyRev < $maxDailyRev) {
                $dr['is_lowest'] = true;
            }
        }
        unset($dr);

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
     *
     * @param  array<string, mixed>  $recaps
     * @param  array<string, mixed>  $resolved
     * @return array<string, mixed>
     */
    private function buildChartSeries(
        Carbon $start,
        Carbon $endExclusive,
        string $aggregation,
        array $recaps,
        array $resolved = [],
        bool $includeComparison = true,
    ): array {
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
                'total_orders_count' => (int) ($row['total_orders'] ?? 0),
                'items_sold' => (int) ($row['items_sold'] ?? 0),
                'unpaid_amount' => (float) ($row['unpaid_amount'] ?? 0.0),
                'refund_amount' => (float) ($row['refund_amount'] ?? 0.0),
                'average_order_value' => (float) ($row['average_order_value'] ?? 0.0),
            ];
        }

        // Bangun data pembanding jika compare_mode aktif
        $comparisonData = [];
        if ($includeComparison && ! empty($resolved['prev_start']) && ! empty($resolved['prev_end_exclusive'])) {
            $prevRecaps = $this->computePeriodRecaps($resolved['prev_start'], $resolved['prev_end_exclusive']);
            $prevRows = match ($aggregation) {
                'weekly' => $prevRecaps['weekly']['rows'],
                'monthly' => $prevRecaps['monthly']['rows'],
                default => $prevRecaps['daily']['rows'],
            };

            $maxItems = max(count($sourceRows), count($prevRows));
            for ($i = 0; $i < $maxItems; $i++) {
                $cur = $sourceRows[$i] ?? null;
                $prv = $prevRows[$i] ?? null;

                $curRev = (float) ($cur['net_revenue'] ?? 0);
                $prvRev = (float) ($prv['net_revenue'] ?? 0);

                $comparisonData[] = [
                    'index' => $i + 1,
                    'current_key' => $cur['date'] ?? ($cur['week_key'] ?? ($cur['month_key'] ?? '-')),
                    'current_label' => $cur['short_label'] ?? '-',
                    'current_revenue' => $curRev,
                    'current_orders' => (int) ($cur['total_orders'] ?? 0),
                    'previous_key' => $prv['date'] ?? ($prv['week_key'] ?? ($prv['month_key'] ?? '-')),
                    'previous_label' => $prv['short_label'] ?? '-',
                    'previous_revenue' => $prvRev,
                    'previous_orders' => (int) ($prv['total_orders'] ?? 0),
                    'revenue_diff' => $curRev - $prvRev,
                    'growth_percent' => $this->calculateGrowthPercent($curRev, $prvRev),
                ];
            }
        }

        return [
            'aggregation' => $aggregation,
            'has_transactions' => $totalPaidOrders > 0 || $totalRevenue > 0,
            'max_revenue' => $maxRevenue,
            'total_revenue' => $totalRevenue,
            'total_paid_orders' => $totalPaidOrders,
            'data' => $series,
            'comparison' => $comparisonData,
        ];
    }

    /**
     * Hitung daftar menu terlaris berdasarkan kuantitas terjual aktual pada rentang tanggal.
     *
     * @return array<int, array<string, mixed>>
     */
    private function computeTopSellingMenus(
        Carbon $start,
        Carbon $endExclusive,
        int $totalPeriodQty,
        int $limit = 10,
    ): array {
        $effDateExpr = 'COALESCE(orders.paid_at, orders.created_at)';
        $isRealizedExpr = "(orders.payment_status = 'paid' AND orders.order_status != 'cancelled')";
        $effCostExpr = 'COALESCE(order_items.cost_price, menus.cost_price)';
        $startStr = $start->format('Y-m-d H:i:s');
        $endStr = $endExclusive->format('Y-m-d H:i:s');

        $topSellingRaw = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->leftJoin('menus', 'order_items.menu_id', '=', 'menus.id')
            ->leftJoin('categories', 'menus.category_id', '=', 'categories.id')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$startStr, $endStr])
            ->whereRaw($isRealizedExpr)
            ->where('order_items.status', 'active')
            ->selectRaw("
                order_items.menu_name,
                COALESCE(categories.name, 'Umum') as category_name,
                SUM(order_items.quantity) as total_qty,
                SUM(order_items.total_price) as total_revenue,
                COALESCE(SUM(CASE WHEN {$effCostExpr} IS NOT NULL THEN ({$effCostExpr} * order_items.quantity) ELSE 0 END), 0) as total_cogs
            ")
            ->groupBy('order_items.menu_name', 'categories.name')
            ->orderByDesc('total_qty')
            ->limit($limit)
            ->get();

        $maxQty = max(1, (int) ($topSellingRaw->max('total_qty') ?? 1));

        return $topSellingRaw->map(function (object $item, int|string $idx) use ($maxQty, $totalPeriodQty): array {
            $qty = (int) $item->total_qty;
            $rev = (float) $item->total_revenue;
            $cogs = round((float) ($item->total_cogs ?? 0), 2);
            $grossProfit = round($rev - $cogs, 2);

            return [
                'rank' => (int) $idx + 1,
                'menu_name' => $item->menu_name,
                'category_name' => $item->category_name,
                'total_qty' => $qty,
                'total_revenue' => $rev,
                'total_cogs' => $cogs,
                'gross_profit' => $grossProfit,
                'margin_percent' => $rev > 0 ? round(($grossProfit / $rev) * 100, 1) : 0.0,
                'relative_percentage' => (int) round(($qty / $maxQty) * 100),
                'contribution_percent' => $totalPeriodQty > 0 ? round(($qty / $totalPeriodQty) * 100, 1) : 0.0,
            ];
        })->values()->all();
    }

    /**
     * Hitung analisis performa produk, menu terlaris, pendapatan tertinggi, slow moving, dan kategori menu pada periode terpilih.
     *
     * @return array<string, mixed>
     */
    public function computeProductAnalytics(Carbon $start, Carbon $endExclusive): array
    {
        $effDateExpr = 'COALESCE(orders.paid_at, orders.created_at)';
        $isRealizedExpr = "(orders.payment_status = 'paid' AND orders.order_status != 'cancelled')";
        $startStr = $start->format('Y-m-d H:i:s');
        $endStr = $endExclusive->format('Y-m-d H:i:s');

        // Total item sold & total menu revenue in active period
        $periodTotals = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$startStr, $endStr])
            ->whereRaw($isRealizedExpr)
            ->where('order_items.status', 'active')
            ->selectRaw('
                COALESCE(SUM(order_items.quantity), 0) as total_qty,
                COALESCE(SUM(order_items.total_price), 0) as total_revenue
            ')
            ->first();

        $totalPeriodQty = (int) ($periodTotals->total_qty ?? 0);
        $totalPeriodRevenue = (float) ($periodTotals->total_revenue ?? 0);

        $effCostExpr = 'COALESCE(order_items.cost_price, menus.cost_price)';

        // 1. Menu Terlaris (Berdasarkan Kuantitas Terjual Aktual)
        $topSelling = $this->computeTopSellingMenus($start, $endExclusive, $totalPeriodQty, 10);

        // 2. Menu Pendapatan Tertinggi (Berdasarkan Kontribusi Omzet)
        $highestRevRaw = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->leftJoin('menus', 'order_items.menu_id', '=', 'menus.id')
            ->leftJoin('categories', 'menus.category_id', '=', 'categories.id')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$startStr, $endStr])
            ->whereRaw($isRealizedExpr)
            ->where('order_items.status', 'active')
            ->selectRaw("
                order_items.menu_name,
                COALESCE(categories.name, 'Umum') as category_name,
                SUM(order_items.quantity) as total_qty,
                SUM(order_items.total_price) as total_revenue,
                COALESCE(SUM(CASE WHEN {$effCostExpr} IS NOT NULL THEN ({$effCostExpr} * order_items.quantity) ELSE 0 END), 0) as total_cogs
            ")
            ->groupBy('order_items.menu_name', 'categories.name')
            ->orderByDesc('total_revenue')
            ->limit(10)
            ->get();

        $maxRev = max(1.0, (float) ($highestRevRaw->max('total_revenue') ?? 1.0));
        $highestRevenue = $highestRevRaw->map(function (object $item, int|string $idx) use ($maxRev, $totalPeriodRevenue): array {
            $qty = (int) $item->total_qty;
            $rev = (float) $item->total_revenue;
            $cogs = round((float) ($item->total_cogs ?? 0), 2);
            $grossProfit = round($rev - $cogs, 2);

            return [
                'rank' => (int) $idx + 1,
                'menu_name' => $item->menu_name,
                'category_name' => $item->category_name,
                'total_qty' => $qty,
                'total_revenue' => $rev,
                'total_cogs' => $cogs,
                'gross_profit' => $grossProfit,
                'margin_percent' => $rev > 0 ? round(($grossProfit / $rev) * 100, 1) : 0.0,
                'relative_percentage' => (int) round(($rev / $maxRev) * 100),
                'contribution_percent' => $totalPeriodRevenue > 0 ? round(($rev / $totalPeriodRevenue) * 100, 1) : 0.0,
            ];
        })->values()->all();

        // 3. Paling Sedikit Terjual / Slow-Moving (Evaluasi Menu & Stok)
        $slowMovingRaw = DB::table('menus')
            ->join('categories', 'menus.category_id', '=', 'categories.id')
            ->leftJoin('order_items', function ($join): void {
                $join->on('menus.id', '=', 'order_items.menu_id')
                    ->where('order_items.status', '=', 'active');
            })
            ->leftJoin('orders', function ($join) use ($effDateExpr, $isRealizedExpr, $startStr, $endStr): void {
                $join->on('order_items.order_id', '=', 'orders.id')
                    ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$startStr, $endStr])
                    ->whereRaw($isRealizedExpr);
            })
            ->where('menus.is_active', true)
            ->selectRaw("
                menus.id,
                menus.name as menu_name,
                categories.name as category_name,
                menus.base_price,
                menus.cost_price,
                COALESCE(SUM(CASE WHEN orders.id IS NOT NULL THEN order_items.quantity ELSE 0 END), 0) as total_qty,
                COALESCE(SUM(CASE WHEN orders.id IS NOT NULL THEN order_items.total_price ELSE 0 END), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN orders.id IS NOT NULL AND {$effCostExpr} IS NOT NULL THEN ({$effCostExpr} * order_items.quantity) ELSE 0 END), 0) as total_cogs
            ")
            ->groupBy('menus.id', 'menus.name', 'categories.name', 'menus.base_price', 'menus.cost_price')
            ->orderBy('total_qty', 'asc')
            ->orderBy('total_revenue', 'asc')
            ->limit(10)
            ->get();

        $slowMoving = $slowMovingRaw->map(function (object $item): array {
            $qty = (int) $item->total_qty;
            $rev = (float) $item->total_revenue;
            $cogs = round((float) ($item->total_cogs ?? 0), 2);
            $grossProfit = round($rev - $cogs, 2);

            return [
                'menu_id' => $item->id,
                'menu_name' => $item->menu_name,
                'category_name' => $item->category_name,
                'base_price' => (float) $item->base_price,
                'cost_price' => $item->cost_price !== null ? (float) $item->cost_price : null,
                'total_qty' => $qty,
                'total_revenue' => $rev,
                'total_cogs' => $cogs,
                'gross_profit' => $grossProfit,
                'is_zero_sales' => $qty === 0,
            ];
        })->values()->all();

        // 4. Performa Kategori Menu (Makanan, Coffe, Milk, Juice, dll)
        $categoriesRaw = DB::table('categories')
            ->leftJoin('menus', 'categories.id', '=', 'menus.category_id')
            ->leftJoin('order_items', function ($join): void {
                $join->on('menus.id', '=', 'order_items.menu_id')
                    ->where('order_items.status', '=', 'active');
            })
            ->leftJoin('orders', function ($join) use ($effDateExpr, $isRealizedExpr, $startStr, $endStr): void {
                $join->on('order_items.order_id', '=', 'orders.id')
                    ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$startStr, $endStr])
                    ->whereRaw($isRealizedExpr);
            })
            ->selectRaw("
                categories.id,
                categories.name,
                COALESCE(SUM(CASE WHEN orders.id IS NOT NULL THEN order_items.quantity ELSE 0 END), 0) as total_qty,
                COALESCE(SUM(CASE WHEN orders.id IS NOT NULL THEN order_items.total_price ELSE 0 END), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN orders.id IS NOT NULL AND {$effCostExpr} IS NOT NULL THEN ({$effCostExpr} * order_items.quantity) ELSE 0 END), 0) as total_cogs,
                COUNT(DISTINCT menus.id) as menu_count
            ")
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('total_revenue')
            ->get();

        $categories = $categoriesRaw->map(function (object $item) use ($totalPeriodRevenue, $totalPeriodQty): array {
            $qty = (int) $item->total_qty;
            $rev = (float) $item->total_revenue;
            $cogs = round((float) ($item->total_cogs ?? 0), 2);
            $grossProfit = round($rev - $cogs, 2);

            return [
                'id' => $item->id,
                'name' => $item->name,
                'total_qty' => $qty,
                'total_revenue' => $rev,
                'total_cogs' => $cogs,
                'gross_profit' => $grossProfit,
                'margin_percent' => $rev > 0 ? round(($grossProfit / $rev) * 100, 1) : 0.0,
                'menu_count' => (int) $item->menu_count,
                'revenue_share_percent' => $totalPeriodRevenue > 0 ? round(($rev / $totalPeriodRevenue) * 100, 1) : 0.0,
                'qty_share_percent' => $totalPeriodQty > 0 ? round(($qty / $totalPeriodQty) * 100, 1) : 0.0,
            ];
        })->values()->all();

        // 5. Daftar Seluruh Menu yang Dipesan Pelanggan Hari Ini (Tanpa Batas 10 Item)
        $todayStart = Carbon::today(self::TIMEZONE)->startOfDay();
        $todayEndExclusive = $todayStart->copy()->addDay();
        $todayStartStr = $todayStart->format('Y-m-d H:i:s');
        $todayEndStr = $todayEndExclusive->format('Y-m-d H:i:s');
        $isItemPaidExpr = "(orders.payment_status = 'paid' OR COALESCE(order_items.payment_status, 'unpaid') = 'paid')";

        $todayOrderedRaw = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->leftJoin('menus', 'order_items.menu_id', '=', 'menus.id')
            ->leftJoin('categories', 'menus.category_id', '=', 'categories.id')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$todayStartStr, $todayEndStr])
            ->where('orders.order_status', '!=', 'cancelled')
            ->whereIn('orders.payment_status', ['paid', 'unpaid'])
            ->where('order_items.status', 'active')
            ->selectRaw("
                order_items.menu_name,
                COALESCE(categories.name, 'Umum') as category_name,
                SUM(order_items.quantity) as total_qty,
                SUM(CASE WHEN {$isItemPaidExpr} THEN order_items.quantity ELSE 0 END) as paid_qty,
                SUM(CASE WHEN NOT {$isItemPaidExpr} THEN order_items.quantity ELSE 0 END) as unpaid_qty,
                SUM(order_items.total_price) as total_amount,
                SUM(CASE WHEN {$isItemPaidExpr} THEN order_items.total_price ELSE 0 END) as paid_revenue,
                SUM(CASE WHEN NOT {$isItemPaidExpr} THEN order_items.total_price ELSE 0 END) as unpaid_amount,
                COUNT(DISTINCT orders.id) as orders_count
            ")
            ->groupBy('order_items.menu_name', 'categories.name')
            ->orderByDesc('total_qty')
            ->orderBy('order_items.menu_name')
            ->get();

        $todayOrderedMenus = $todayOrderedRaw->map(function (object $item): array {
            return [
                'menu_name' => $item->menu_name,
                'category_name' => $item->category_name,
                'total_qty' => (int) $item->total_qty,
                'paid_qty' => (int) $item->paid_qty,
                'unpaid_qty' => (int) $item->unpaid_qty,
                'total_amount' => (float) $item->total_amount,
                'paid_revenue' => (float) $item->paid_revenue,
                'unpaid_amount' => (float) $item->unpaid_amount,
                'orders_count' => (int) $item->orders_count,
            ];
        })->values()->all();

        return [
            'total_period_items_sold' => $totalPeriodQty,
            'total_period_menu_revenue' => $totalPeriodRevenue,
            'top_selling' => $topSelling,
            'highest_revenue' => $highestRevenue,
            'slow_moving' => $slowMoving,
            'categories' => $categories,
            'today_date_label' => $this->formatIndoDayDate($todayStart),
            'today_ordered_menus' => $todayOrderedMenus,
        ];
    }

    /**
     * Hitung distribusi omzet per jam operasional (WIB) untuk rentang waktu tertentu.
     *
     * @return array{
     *     hours: array<int, array{hour: string, revenue: float, orders_count: int, is_peak: bool}>,
     *     peak_hour: string|null,
     *     max_revenue: float
     * }
     */
    private function computeHourlyTracking(Carbon $start, Carbon $endExclusive): array
    {
        $effDateExpr = 'COALESCE(orders.paid_at, orders.created_at)';
        $isRealizedExpr = "(orders.payment_status = 'paid' AND orders.order_status != 'cancelled')";
        $ordersInPeriod = DB::table('orders')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [
                $start->format('Y-m-d H:i:s'),
                $endExclusive->format('Y-m-d H:i:s'),
            ])
            ->whereRaw($isRealizedExpr)
            ->select('id', 'total_amount', 'refunded_amount', 'paid_at', 'created_at')
            ->get();

        return $this->buildHourlyTrendFromOrders($ordersInPeriod);
    }

    /**
     * @param  Collection<int, \stdClass>  $ordersInPeriod
     * @return array{
     *     hours: array<int, array{hour: string, revenue: float, orders_count: int, is_peak: bool}>,
     *     peak_hour: string|null,
     *     max_revenue: float
     * }
     */
    private function buildHourlyTrendFromOrders(Collection $ordersInPeriod): array
    {
        $minHour = 8;
        $maxHour = 22;
        foreach ($ordersInPeriod as $orderRow) {
            $orderHour = Carbon::parse((string) ($orderRow->paid_at ?? $orderRow->created_at))->timezone(self::TIMEZONE)->hour;
            $minHour = min($minHour, $orderHour);
            $maxHour = max($maxHour, $orderHour);
        }

        $hours = [];
        for ($hInt = $minHour; $hInt <= $maxHour; $hInt++) {
            $hours[] = sprintf('%02d:00', $hInt);
        }

        $periodHourlyTrend = [];
        $maxHourlyRev = 0.0;
        $peakHourStr = null;

        foreach ($hours as $h) {
            $hInt = (int) substr($h, 0, 2);
            $ordersAtH = $ordersInPeriod->filter(function (\stdClass $o) use ($hInt): bool {
                return Carbon::parse((string) ($o->paid_at ?? $o->created_at))->timezone(self::TIMEZONE)->hour === $hInt;
            });
            $hRev = (float) $ordersAtH->sum(fn (\stdClass $o): float => max(0.0, (float) $o->total_amount - (float) ($o->refunded_amount ?? 0)));
            $hCount = $ordersAtH->count();

            if ($hRev > $maxHourlyRev) {
                $maxHourlyRev = $hRev;
                $peakHourStr = $h;
            }

            $periodHourlyTrend[] = [
                'hour' => $h,
                'revenue' => $hRev,
                'orders_count' => $hCount,
                'is_peak' => false,
            ];
        }

        if ($maxHourlyRev > 0 && $peakHourStr !== null) {
            foreach ($periodHourlyTrend as &$item) {
                if ($item['hour'] === $peakHourStr) {
                    $item['is_peak'] = true;
                }
            }
            unset($item);
        }

        return [
            'hours' => $periodHourlyTrend,
            'peak_hour' => $peakHourStr,
            'max_revenue' => $maxHourlyRev,
        ];
    }

    /**
     * Hitung metrik operasional terperinci: pipeline status, durasi penyelesaian, jam sibuk, hari ramai, dan staf kasir.
     *
     * @return array<string, mixed>
     */
    public function computeOperationalAnalytics(Carbon $start, Carbon $endExclusive): array
    {
        $effDateExpr = 'COALESCE(orders.paid_at, orders.created_at)';
        $isRealizedExpr = "(orders.payment_status = 'paid' AND orders.order_status != 'cancelled')";
        $startStr = $start->format('Y-m-d H:i:s');
        $endStr = $endExclusive->format('Y-m-d H:i:s');

        // 1. Pipeline Status counts
        $pipeline = DB::table('orders')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$startStr, $endStr])
            ->selectRaw("
                COUNT(CASE WHEN order_status = 'completed' THEN 1 END) as completed_count,
                COUNT(CASE WHEN order_status = 'processing' THEN 1 END) as processing_count,
                COUNT(CASE WHEN order_status = 'ready' THEN 1 END) as ready_count,
                COUNT(CASE WHEN order_status = 'pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN order_status = 'cancelled' THEN 1 END) as cancelled_count,
                COUNT(CASE WHEN payment_status = 'unpaid' AND order_status != 'cancelled' THEN 1 END) as unpaid_count
            ")
            ->first();

        // Item Ditolak
        $rejectedItems = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$startStr, $endStr])
            ->where('order_items.status', 'rejected')
            ->selectRaw('
                COUNT(order_items.id) as rejected_count,
                COALESCE(SUM(order_items.total_price), 0) as rejected_amount
            ')
            ->first();

        // 2. Rata-rata Waktu Penyelesaian Pesanan Selesai (Menit) - Tanpa N+1 Query
        $completedOrders = DB::table('orders')
            ->where('order_status', 'completed')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$startStr, $endStr])
            ->select('id', 'created_at', 'updated_at')
            ->get();

        $completedHistoriesByOrder = collect();
        if ($completedOrders->isNotEmpty()) {
            $completedHistoriesByOrder = DB::table('order_status_histories')
                ->whereIn('order_id', $completedOrders->pluck('id')->all())
                ->where('status', 'completed')
                ->selectRaw('order_id, MAX(created_at) as completed_at')
                ->groupBy('order_id')
                ->pluck('completed_at', 'order_id');
        }

        $totalMinutes = 0;
        $validOrdersCount = 0;
        foreach ($completedOrders as $co) {
            $completedAtStr = $completedHistoriesByOrder->get($co->id);
            $finishTime = is_string($completedAtStr) ? Carbon::parse($completedAtStr) : Carbon::parse((string) $co->updated_at);
            $diffMins = Carbon::parse((string) $co->created_at)->diffInMinutes($finishTime);
            // Batasi outlier maksimal 24 jam (1440 min)
            if ($diffMins >= 0 && $diffMins <= 1440) {
                $totalMinutes += $diffMins;
                $validOrdersCount++;
            }
        }

        $avgCompletionMinutes = $validOrdersCount > 0 ? round($totalMinutes / $validOrdersCount, 1) : 0.0;
        $roundedMins = (int) round($avgCompletionMinutes);
        $formattedCompletionTime = $avgCompletionMinutes > 0
            ? ($roundedMins >= 60
                ? intdiv($roundedMins, 60).' jam '.($roundedMins % 60).' mnt'
                : $roundedMins.' menit')
            : 'Belum Ada';

        // 3. Distribusi Jam Sibuk Periode Filter (Default 08:00 - 22:00 WIB, meluas otomatis jika ada transaksi di luar jam tersebut)
        $ordersInPeriod = DB::table('orders')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$startStr, $endStr])
            ->whereRaw($isRealizedExpr)
            ->select('id', 'total_amount', 'refunded_amount', 'paid_at', 'created_at')
            ->get();

        $periodHourly = $this->buildHourlyTrendFromOrders($ordersInPeriod);

        // 4. Analisis Hari Paling Ramai (Senin s/d Minggu)
        $dayOfWeekMap = [
            1 => 'Senin',
            2 => 'Selasa',
            3 => 'Rabu',
            4 => 'Kamis',
            5 => 'Jumat',
            6 => 'Sabtu',
            7 => 'Minggu',
        ];

        /** @var array<int, array{day_num: int, day_name: string, revenue: float, orders_count: int, is_busiest: bool}> $dowStats */
        $dowStats = [];
        foreach ($dayOfWeekMap as $num => $name) {
            $dowStats[$num] = [
                'day_num' => $num,
                'day_name' => $name,
                'revenue' => 0.0,
                'orders_count' => 0,
                'is_busiest' => false,
            ];
        }

        /** @var array<string, array{date_key: string, label: string, revenue: float, orders_count: int}> $dailyStats */
        $dailyStats = [];
        foreach ($ordersInPeriod as $o) {
            $date = Carbon::parse((string) ($o->paid_at ?? $o->created_at))->timezone(self::TIMEZONE);
            $dow = $date->dayOfWeekIso; // 1-7
            $net = max(0.0, (float) $o->total_amount - (float) ($o->refunded_amount ?? 0));

            if (isset($dowStats[$dow])) {
                $dowStats[$dow]['revenue'] += $net;
                $dowStats[$dow]['orders_count'] += 1;
            }

            $dKey = $date->format('Y-m-d');
            if (! isset($dailyStats[$dKey])) {
                $dailyStats[$dKey] = [
                    'date_key' => $dKey,
                    'label' => $this->getIndoDayName($date).', '.$date->format('d').' '.$this->formatIndoMonthYear($date),
                    'revenue' => 0.0,
                    'orders_count' => 0,
                ];
            }
            $dailyStats[$dKey]['revenue'] += $net;
            $dailyStats[$dKey]['orders_count'] += 1;
        }

        $maxDowRev = 0.0;
        $busiestDowNum = null;
        foreach ($dowStats as $num => $stat) {
            if ($stat['revenue'] > $maxDowRev) {
                $maxDowRev = $stat['revenue'];
                $busiestDowNum = $num;
            }
        }
        $busiestDowStat = $busiestDowNum !== null && isset($dowStats[$busiestDowNum])
            ? $dowStats[$busiestDowNum]
            : null;
        if ($busiestDowNum !== null && $busiestDowStat !== null) {
            $dowStats[$busiestDowNum]['is_busiest'] = true;
        }

        $peakDate = collect($dailyStats)->sortByDesc('revenue')->first();

        // 5. Aktivitas Kasir & Staf yang Memproses Transaksi
        $cashierActivity = DB::table('orders')
            ->join('users', 'orders.confirmed_by', '=', 'users.id')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$startStr, $endStr])
            ->selectRaw("
                users.id as user_id,
                users.name as user_name,
                users.role as user_role,
                COUNT(orders.id) as total_orders,
                COALESCE(SUM(CASE WHEN {$isRealizedExpr} THEN orders.total_amount - COALESCE(orders.refunded_amount, 0) ELSE 0 END), 0) as total_net_revenue,
                COUNT(CASE WHEN orders.payment_method = 'cash' AND {$isRealizedExpr} THEN 1 END) as cash_count,
                COALESCE(SUM(CASE WHEN orders.payment_method = 'cash' AND {$isRealizedExpr} THEN orders.total_amount - COALESCE(orders.refunded_amount, 0) ELSE 0 END), 0) as cash_revenue,
                COUNT(CASE WHEN orders.payment_method = 'qris' AND {$isRealizedExpr} THEN 1 END) as qris_count,
                COALESCE(SUM(CASE WHEN orders.payment_method = 'qris' AND {$isRealizedExpr} THEN orders.total_amount - COALESCE(orders.refunded_amount, 0) ELSE 0 END), 0) as qris_revenue
            ")
            ->groupBy('users.id', 'users.name', 'users.role')
            ->orderByDesc('total_net_revenue')
            ->get();

        // 6. Rincian Audit Item Ditolak pada Periode Terpilih
        $rejectedItemsList = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->leftJoin('users as rejector', 'order_items.rejected_by', '=', 'rejector.id')
            ->whereRaw("{$effDateExpr} >= ? AND {$effDateExpr} < ?", [$startStr, $endStr])
            ->where('order_items.status', 'rejected')
            ->orderByDesc('order_items.rejected_at')
            ->orderByDesc('order_items.id')
            ->limit(50)
            ->get([
                'order_items.id',
                'orders.order_number',
                'orders.customer_name',
                'orders.payment_status',
                'order_items.menu_name',
                'order_items.quantity',
                'order_items.total_price',
                'order_items.rejection_reason',
                'order_items.rejected_at',
                'order_items.updated_at',
                'rejector.name as rejected_by_name',
            ])
            ->map(function (object $row): array {
                $ts = $row->rejected_at ?: $row->updated_at;

                return [
                    'id' => $row->id,
                    'order_number' => $row->order_number,
                    'customer_name' => $row->customer_name,
                    'payment_status' => $row->payment_status,
                    'menu_name' => $row->menu_name,
                    'quantity' => (int) $row->quantity,
                    'total_price' => (float) $row->total_price,
                    'rejection_reason' => $row->rejection_reason,
                    'rejected_by_name' => $row->rejected_by_name ?? 'Kasir / Dapur',
                    'rejected_at_formatted' => $ts
                        ? $this->formatIndoDateTime(Carbon::parse((string) $ts)->timezone(self::TIMEZONE))
                        : '-',
                ];
            })
            ->values()
            ->all();

        return [
            'pipeline' => [
                'completed_count' => (int) ($pipeline->completed_count ?? 0),
                'processing_count' => (int) ($pipeline->processing_count ?? 0),
                'ready_count' => (int) ($pipeline->ready_count ?? 0),
                'pending_count' => (int) ($pipeline->pending_count ?? 0),
                'cancelled_count' => (int) ($pipeline->cancelled_count ?? 0),
                'unpaid_count' => (int) ($pipeline->unpaid_count ?? 0),
                'rejected_items_count' => (int) ($rejectedItems->rejected_count ?? 0),
                'rejected_items_amount' => (float) ($rejectedItems->rejected_amount ?? 0),
            ],
            'completion_time' => [
                'average_minutes' => $avgCompletionMinutes,
                'formatted' => $formattedCompletionTime,
                'sample_orders' => $validOrdersCount,
            ],
            'period_hourly' => $periodHourly,
            'busiest_day' => [
                'day_of_week' => array_values($dowStats),
                'busiest_day_name' => $busiestDowStat['day_name'] ?? null,
                'busiest_day_revenue' => $maxDowRev,
                'busiest_day_orders' => $busiestDowStat['orders_count'] ?? 0,
                'peak_date_key' => $peakDate['date_key'] ?? null,
                'peak_date_label' => $peakDate['label'] ?? null,
                'peak_date_revenue' => (float) ($peakDate['revenue'] ?? 0),
                'peak_date_orders' => (int) ($peakDate['orders_count'] ?? 0),
            ],
            'cashier_activity' => $cashierActivity->map(fn (object $c): array => [
                'user_id' => $c->user_id,
                'user_name' => $c->user_name,
                'user_role' => $c->user_role,
                'total_orders' => (int) $c->total_orders,
                'total_net_revenue' => (float) $c->total_net_revenue,
                'cash_count' => (int) $c->cash_count,
                'cash_revenue' => (float) $c->cash_revenue,
                'qris_count' => (int) $c->qris_count,
                'qris_revenue' => (float) $c->qris_revenue,
            ])->values()->all(),
            'rejected_items_list' => $rejectedItemsList,
        ];
    }

    /**
     * Query daftar transaksi dengan filter rentang tanggal, pencarian, status, metode bayar, gateway, dan sorting.
     *
     * @return Builder<Order>
     */
    private function buildTransactionsQuery(FinancialReportFilterRequest $request, Carbon $start, Carbon $endExclusive): Builder
    {
        $effDateExpr = 'COALESCE(orders.paid_at, orders.created_at)';

        $query = Order::query()
            ->with([
                'table',
                'confirmedByUser',
                'latestPayment',
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

        $paymentGateway = (string) $request->query('payment_gateway', 'all');
        if ($paymentGateway !== 'all') {
            $effectiveGatewayExpr = "COALESCE(NULLIF(orders.payment_gateway, ''), CASE WHEN orders.payment_method IN ('qris', 'transfer', 'debit') THEN 'xendit' ELSE 'manual' END)";
            $query->whereRaw("{$effectiveGatewayExpr} = ?", [$paymentGateway]);
        }

        $filterDate = $request->query('filter_date');
        if (is_string($filterDate) && $filterDate !== '') {
            $driver = DB::connection()->getDriverName();
            $dayExpr = $driver === 'pgsql'
                ? "TO_CHAR({$effDateExpr}, 'YYYY-MM-DD')"
                : "strftime('%Y-%m-%d', {$effDateExpr})";
            $query->whereRaw("{$dayExpr} = ?", [$filterDate]);
        }

        $menuId = (int) $request->query('menu_id');
        if ($menuId > 0) {
            $query->whereHas('items', function (Builder $iq) use ($menuId): void {
                $iq->where('order_items.menu_id', $menuId);
            });
        }

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $like = '%'.strtolower($search).'%';
            $query->where(function (Builder $q) use ($like): void {
                $q->whereRaw('LOWER(orders.order_number) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(orders.customer_name) LIKE ?', [$like])
                    ->orWhereRaw("LOWER(COALESCE(orders.payment_reference, '')) LIKE ?", [$like])
                    ->orWhereHas('table', function (Builder $tq) use ($like): void {
                        $tq->whereRaw('LOWER(cafe_tables.table_number) LIKE ?', [$like])
                            ->orWhereRaw('LOWER(COALESCE(cafe_tables.name, \'\')) LIKE ?', [$like]);
                    })
                    ->orWhereHas('items', function (Builder $iq) use ($like): void {
                        $iq->whereRaw('LOWER(order_items.menu_name) LIKE ?', [$like]);
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
     *
     * @return array<string, mixed>
     */
    private function formatOrderRecord(Order $order): array
    {
        $createdAt = Carbon::parse($order->created_at)->timezone(self::TIMEZONE);
        $paidAt = $order->paid_at ? Carbon::parse($order->paid_at)->timezone(self::TIMEZONE) : null;
        $effectiveDate = $paidAt ?? $createdAt;
        $refundedAt = $order->refunded_at ? Carbon::parse($order->refunded_at)->timezone(self::TIMEZONE) : null;

        $activeItems = $order->items->where('status', 'active');
        $rejectedItems = $order->items->where('status', 'rejected');

        $activeItemsAmount = (float) $activeItems->sum(fn (OrderItem $it): float => (float) $it->total_price);
        $rejectedItemsAmount = (float) $rejectedItems->sum(fn (OrderItem $it): float => (float) $it->total_price);
        $subtotal = (float) $order->subtotal;
        $totalAmount = (float) $order->total_amount;
        $refundAmount = (float) ($order->refunded_amount ?? 0);
        $netRevenue = $order->getRealizedNetAmount();

        $itemsSummary = $activeItems->map(function (OrderItem $it): string {
            $optLabels = $it->options->isNotEmpty()
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
            'payment_gateway' => $order->resolveEffectivePaymentGateway(),
            'payment_gateway_label' => $order->resolvePaymentGatewayLabel(),
            'payment_channel' => $order->payment_channel,
            'payment_reference' => $order->payment_reference,
            'payment_status' => $order->payment_status,
            'payment_status_label' => $this->getPaymentStatusLabel($order->payment_status),
            'order_status' => $order->order_status,
            'order_status_label' => $this->getOrderStatusLabel($order->order_status),
            'initial_gross_amount' => max($subtotal, $activeItemsAmount + $rejectedItemsAmount),
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
            'items' => $order->items->map(function (OrderItem $item): array {
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
                    'options' => $item->options->map(fn (OrderItemOption $opt): array => [
                        'id' => $opt->id,
                        'group_name' => $opt->group_name,
                        'option_name' => $opt->option_name,
                        'additional_price' => (float) $opt->additional_price,
                    ])->values()->all(),
                ];
            })->values()->all(),
            'status_histories' => $order->statusHistories->map(function (OrderStatusHistory $hist): array {
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

    private function calculateGrowthPercent(float $current, float $previous): float
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

        return $date->format('d').' '.$months[(int) $date->format('n')].' '.$date->format('Y');
    }

    private function formatIndoShortDate(Carbon $date): string
    {
        $months = [
            1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr',
            5 => 'Mei', 6 => 'Jun', 7 => 'Jul', 8 => 'Agu',
            9 => 'Sep', 10 => 'Okt', 11 => 'Nov', 12 => 'Des',
        ];

        return $date->format('d').' '.$months[(int) $date->format('n')];
    }

    private function getIndoDayName(Carbon $date): string
    {
        $days = [
            0 => 'Minggu', 1 => 'Senin', 2 => 'Selasa', 3 => 'Rabu',
            4 => 'Kamis', 5 => 'Jumat', 6 => 'Sabtu',
        ];

        return $days[$date->dayOfWeek] ?? '';
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

        return $months[(int) $date->format('n')].' '.$date->format('Y');
    }

    private function formatIndoShortMonthYear(Carbon $date): string
    {
        $months = [
            1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr',
            5 => 'Mei', 6 => 'Jun', 7 => 'Jul', 8 => 'Agu',
            9 => 'Sep', 10 => 'Okt', 11 => 'Nov', 12 => 'Des',
        ];

        return $months[(int) $date->format('n')].' '.$date->format('Y');
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
