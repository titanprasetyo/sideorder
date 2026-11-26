<?php

namespace App\Services;

use Carbon\Carbon;
use ZipArchive;

class ExcelReportService
{
    private const TIMEZONE = 'Asia/Jakarta';

    /**
     * Bangun file Excel (.xlsx) dengan 6 sheet lengkap dan simpan ke file temporary.
     * Mengembalikan absolute path file temporary .xlsx yang siap diunduh.
     *
     * @param  array<string, mixed>  $resolved
     * @param  array<string, mixed>  $summary
     * @param  array<string, mixed>  $recaps
     * @param  array<string, mixed>  $products
     * @param  array<string, mixed>  $ops
     * @param  iterable<int, array<string, mixed>>  $transactions
     */
    public function generateMultiSheetExcel(
        array $resolved,
        array $summary,
        array $recaps,
        array $products,
        array $ops,
        iterable $transactions,
        ?string $printedBy = 'Administrator'
    ): string {
        $tempFile = tempnam(sys_get_temp_dir(), 'sideorder_report_');
        if ($tempFile === false) {
            throw new \RuntimeException('Gagal membuat path file temporary Excel (.xlsx).');
        }
        $zip = new ZipArchive;
        if ($zip->open($tempFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Gagal membuat file temporary Excel (.xlsx).');
        }

        $nowStr = Carbon::now(self::TIMEZONE)->format('d/m/Y H:i:s').' WIB';
        /** @var Carbon $startCarbon */
        $startCarbon = $resolved['start'];
        /** @var Carbon $endInclusiveCarbon */
        $endInclusiveCarbon = $resolved['end_inclusive'];
        $periodLabel = $resolved['label'].' ('.$startCarbon->format('d/m/Y').' - '.$endInclusiveCarbon->format('d/m/Y').' WIB)';
        $gatewayInfo = $summary['gateway_integration'] ?? [
            'label' => 'Kasir POS (Tunai)',
            'mode' => 'Belum Terintegrasi (Tunai POS)',
            'transactions_count' => 0,
            'net_revenue' => 0.0,
        ];

        // 1. Data Sheet 1: Summary (Ringkasan Keuangan & Eksekutif)
        $sheet1Data = [
            ['LAPORAN KEUANGAN & ANALITIK PENDAPATAN - SIDE LINE CAFE (SIDEORDER)'],
            ['SHEET 1: RINGKASAN EKSEKUTIF & METRIK UTAMA'],
            ['Periode Laporan', $periodLabel],
            ['Waktu Pembuatan', $nowStr],
            ['Dicetak Oleh', $printedBy ?? 'Administrator'],
            ['Payment Gateway', ($gatewayInfo['label'] ?? 'Kasir POS (Tunai)').' ('.($gatewayInfo['mode'] ?? 'Belum Terintegrasi').')'],
            ['Zona Waktu', 'Asia/Jakarta (WIB)'],
            [],
            ['METRIK KEUANGAN', 'NILAI AKTUAL (RP)', 'FORMAT RUPIAH', 'PERIODE PEMBANDING', 'PERTUMBUHAN (%)'],
            [
                'Total Omzet Bersih (Net Sales)',
                $summary['period']['net_revenue'],
                $this->formatRupiah((float) $summary['period']['net_revenue']),
                $this->formatRupiah((float) $summary['period']['previous_period_revenue']),
                ($summary['period']['period_growth_percent'] !== null ? $summary['period']['period_growth_percent'].'%' : '-'),
            ],
            [
                'Total Omzet Bruto (Gross Sales)',
                $summary['period']['gross_revenue'],
                $this->formatRupiah((float) $summary['period']['gross_revenue']),
                '-',
                '-',
            ],
            [
                'Pendapatan Via Pembayaran Digital',
                (float) ($gatewayInfo['net_revenue'] ?? 0),
                $this->formatRupiah((float) ($gatewayInfo['net_revenue'] ?? 0)),
                ($gatewayInfo['transactions_count'] ?? 0).' transaksi lunas',
                '-',
            ],
            [
                'Total Item Menu Ditolak Staf',
                (float) ($ops['pipeline']['rejected_items_amount'] ?? 0),
                $this->formatRupiah((float) ($ops['pipeline']['rejected_items_amount'] ?? 0)),
                ($ops['pipeline']['rejected_items_count'] ?? 0).' item ditolak',
                '-',
            ],
            [
                'Total Diskon Faktur',
                0,
                'Rp 0 (Diskon per item sudah termasuk subtotal)',
                '-',
                '-',
            ],
            [],
            ['METRIK OPERASIONAL & VOLUME', 'JUMLAH', 'KETERANGAN', 'PERIODE PEMBANDING', 'PERTUMBUHAN (%)'],
            [
                'Total Pesanan Masuk (All Orders)',
                $summary['period']['total_orders_count'],
                $summary['period']['total_orders_count'].' pesanan',
                '-',
                '-',
            ],
            [
                'Pesanan Selesai / Lunas (Settled)',
                $summary['period']['paid_transactions_count'],
                $summary['period']['paid_transactions_count'].' pesanan lunas',
                '-',
                '-',
            ],
            [
                'Pesanan Dibatalkan (Belum Bayar)',
                $summary['period']['cancelled_orders_count'],
                $this->formatRupiah((float) $summary['period']['cancelled_amount']),
                '-',
                '-',
            ],
            [
                'Rata-Rata Nilai Transaksi (AOV)',
                $summary['period']['average_order_value'],
                $this->formatRupiah((float) $summary['period']['average_order_value']),
                $this->formatRupiah((float) $summary['period']['previous_aov']),
                ($summary['period']['aov_growth_percent'] !== null ? $summary['period']['aov_growth_percent'].'%' : '-'),
            ],
            [
                'Total Item/Porsi Menu Terjual',
                $summary['period']['items_sold'],
                $summary['period']['items_sold'].' porsi menu',
                $summary['period']['previous_items_sold'].' porsi',
                ($summary['period']['items_sold_growth_percent'] !== null ? $summary['period']['items_sold_growth_percent'].'%' : '-'),
            ],
            [
                'Rata-Rata Waktu Penyelesaian',
                $ops['completion_time']['average_minutes'] ?? 0,
                $ops['completion_time']['formatted'] ?? '-',
                '-',
                '-',
            ],
            [
                'Hari Paling Ramai',
                0,
                ($ops['busiest_day']['busiest_day_name'] ?? '-').' ('.$this->formatRupiah((float) ($ops['busiest_day']['busiest_day_revenue'] ?? 0)).')',
                '-',
                '-',
            ],
        ];

        // 2. Data Sheet 2: Daily Breakdown (Pemetaan Harian Paling Detail)
        $sheet2Data = [
            ['SHEET 2: PEMETAAN PENDAPATAN HARIAN (DAILY REVENUE BREAKDOWN)'],
            ['Periode Laporan', $periodLabel],
            ['Waktu Pembuatan', $nowStr],
            [],
            [
                'Tanggal',
                'Hari',
                'Total Transaksi',
                'Pesanan Lunas',
                'Omzet Bruto (Rp)',
                'Diskon (Rp)',
                'Pajak & Layanan (Rp)',
                'Penyesuaian (Rp)',
                'Omzet Bersih (Rp)',
                'Belum Dibayar (Rp)',
                'AOV (Rp)',
                'Item Terjual (Porsi)',
                'Status Hari',
            ],
        ];

        foreach ($recaps['daily']['rows'] as $r) {
            $statusHari = 'Normal';
            if (! empty($r['is_peak'])) {
                $statusHari = 'Pendapatan Tertinggi (Peak)';
            } elseif (! empty($r['is_lowest'])) {
                $statusHari = 'Pendapatan Terendah';
            } elseif ($r['net_revenue'] <= 0 && $r['total_orders'] === 0) {
                $statusHari = 'Tidak Ada Transaksi';
            }

            $sheet2Data[] = [
                $r['date'],
                $r['day_name'] ?? '-',
                $r['total_orders'],
                $r['paid_orders_count'],
                $r['gross_revenue'],
                0,
                0,
                $r['refund_amount'],
                $r['net_revenue'],
                $r['unpaid_amount'],
                $r['average_order_value'],
                $r['items_sold'] ?? 0,
                $statusHari,
            ];
        }

        // Baris Grand Total Daily
        $dailyTotals = $recaps['daily']['totals'];
        $sheet2Data[] = [];
        $sheet2Data[] = [
            'TOTAL PERIODE',
            'Semua Hari',
            $dailyTotals['total_orders'],
            $dailyTotals['paid_orders_count'],
            $dailyTotals['gross_revenue'],
            0,
            0,
            $dailyTotals['refund_amount'],
            $dailyTotals['net_revenue'],
            $dailyTotals['unpaid_amount'],
            $dailyTotals['average_order_value'],
            $summary['period']['items_sold'] ?? 0,
            '-',
        ];

        // 3. Data Sheet 3: Sales Transactions (Ledger Transaksi + Referensi Pembayaran)
        $sheet3Data = [
            ['SHEET 3: BUKU BESAR DETAIL TRANSAKSI & PEMBAYARAN (SALES TRANSACTION LEDGER)'],
            ['Periode Laporan', $periodLabel],
            ['Waktu Pembuatan', $nowStr],
            [],
            [
                'Nomor Pesanan',
                'Waktu Transaksi (WIB)',
                'Nama Pelanggan',
                'Nomor Meja',
                'Payment Gateway',
                'Metode Pembayaran',
                'Referensi Pembayaran',
                'Rincian Menu & Porsi',
                'Total Kuantitas Item',
                'Subtotal (Rp)',
                'Diskon (Rp)',
                'Pajak & Layanan (Rp)',
                'Total Tagihan (Rp)',
                'Penyesuaian (Rp)',
                'Pendapatan Bersih (Rp)',
                'Status Pembayaran',
                'Status Pesanan',
                'Kasir Konfirmasi',
                'Catatan',
            ],
        ];

        foreach ($transactions as $tx) {
            $sheet3Data[] = [
                $tx['order_number'],
                $tx['transaction_date_formatted'],
                $tx['customer_name'],
                'Meja '.$tx['table_number'],
                $tx['payment_gateway_label'] ?? 'Kasir POS',
                $tx['payment_method_label'],
                $tx['payment_reference'] ?? '-',
                $tx['items_summary'],
                count($tx['items'] ?? []),
                $tx['subtotal'],
                0,
                0,
                $tx['total_amount'],
                $tx['refund_amount'],
                $tx['net_revenue'],
                $tx['payment_status_label'],
                $tx['order_status_label'],
                $tx['confirmed_by_name'] ?? '-',
                $tx['notes'] ?? '-',
            ];
        }

        // 4. Data Sheet 4: Product Performance
        $sheet4Data = [
            ['SHEET 4: ANALISIS PERFORMA PRODUK & KATEGORI MENU'],
            ['Periode Laporan', $periodLabel],
            ['Waktu Pembuatan', $nowStr],
            [],
            ['=== MENU PALING LARIS (TOP SELLING BERDASARKAN KUANTITAS) ==='],
            ['Peringkat', 'Nama Menu', 'Kategori', 'Kuantitas Terjual (Porsi)', 'Total Omzet (Rp)', 'Kontribusi Penjualan (%)'],
        ];

        foreach ($products['top_selling'] ?? [] as $top) {
            $sheet4Data[] = [
                $top['rank'] ?? '-',
                $top['menu_name'],
                $top['category_name'],
                $top['total_qty'],
                $top['total_revenue'],
                ($top['contribution_percent'] ?? 0).'%',
            ];
        }

        $sheet4Data[] = [];
        $sheet4Data[] = ['=== MENU OMZET TERTINGGI (HIGHEST REVENUE) ==='];
        $sheet4Data[] = ['Peringkat', 'Nama Menu', 'Kategori', 'Kuantitas Terjual (Porsi)', 'Total Omzet (Rp)', 'Kontribusi Omzet (%)'];
        foreach ($products['highest_revenue'] ?? [] as $hr) {
            $sheet4Data[] = [
                $hr['rank'] ?? '-',
                $hr['menu_name'],
                $hr['category_name'],
                $hr['total_qty'],
                $hr['total_revenue'],
                ($hr['contribution_percent'] ?? 0).'%',
            ];
        }

        $sheet4Data[] = [];
        $sheet4Data[] = ['=== MENU SLOW-MOVING / MINIM TERJUAL ==='];
        $sheet4Data[] = ['ID Menu', 'Nama Menu', 'Kategori', 'Harga Dasar (Rp)', 'Terjual (Porsi)', 'Total Omzet (Rp)', 'Status Penjualan'];
        foreach ($products['slow_moving'] ?? [] as $sm) {
            $sheet4Data[] = [
                $sm['menu_id'] ?? '-',
                $sm['menu_name'],
                $sm['category_name'],
                $sm['base_price'],
                $sm['total_qty'],
                $sm['total_revenue'],
                ! empty($sm['is_zero_sales']) ? '0 Terjual (Nol)' : 'Rendah',
            ];
        }

        $sheet4Data[] = [];
        $sheet4Data[] = ['=== PERFORMA KATEGORI MENU ==='];
        $sheet4Data[] = ['ID', 'Nama Kategori', 'Jumlah Menu Aktif', 'Porsi Terjual', 'Pangsa Volume (%)', 'Total Omzet (Rp)', 'Pangsa Omzet (%)'];
        foreach ($products['categories'] ?? [] as $cat) {
            $sheet4Data[] = [
                $cat['id'],
                $cat['name'],
                $cat['menu_count'],
                $cat['total_qty'],
                ($cat['qty_share_percent'] ?? 0).'%',
                $cat['total_revenue'],
                ($cat['revenue_share_percent'] ?? 0).'%',
            ];
        }

        // 5. Data Sheet 5: Payment Gateway & Methods Summary
        $sheet5Data = [
            ['SHEET 5: REKAPITULASI PAYMENT GATEWAY & METODE PEMBAYARAN'],
            ['Periode Laporan', $periodLabel],
            ['Waktu Pembuatan', $nowStr],
            ['Status Integrasi Gateway', ($gatewayInfo['label'] ?? 'Kasir POS (Tunai)').' ('.($gatewayInfo['mode'] ?? 'Belum Terintegrasi').')'],
            [],
            ['=== RINGKASAN PER PAYMENT GATEWAY ==='],
            ['Kode Gateway', 'Nama Payment Gateway', 'Transaksi Lunas', 'Pangsa Transaksi (%)', 'Total Omzet Lunas (Rp)', 'Pangsa Omzet (%)', 'Menunggu Pembayaran', 'Nominal Menunggu (Rp)', 'Pesanan Batal', 'Nominal Batal (Rp)'],
        ];

        foreach ($summary['payment_gateways'] ?? [] as $gw) {
            $sheet5Data[] = [
                $gw['gateway'],
                $gw['label'],
                $gw['transactions_count'],
                ($gw['count_share_percent'] ?? 0).'%',
                $gw['net_revenue'],
                ($gw['revenue_share_percent'] ?? 0).'%',
                $gw['unpaid_count'],
                $gw['unpaid_amount'],
                $gw['cancelled_count'],
                $gw['cancelled_amount'],
            ];
        }

        $sheet5Data[] = [];
        $sheet5Data[] = ['=== DISTRIBUSI PER METODE PEMBAYARAN ==='];
        $sheet5Data[] = ['Kode Metode', 'Nama Metode Pembayaran', 'Transaksi Lunas', 'Pangsa Transaksi (%)', 'Total Omzet Lunas (Rp)', 'Pangsa Omzet (%)', 'Menunggu Pembayaran', 'Nominal Menunggu (Rp)', 'Pesanan Batal', 'Nominal Batal (Rp)'];

        foreach ($summary['payment_methods'] ?? [] as $pm) {
            $sheet5Data[] = [
                $pm['method'],
                $pm['label'],
                $pm['transactions_count'],
                ($pm['count_share_percent'] ?? 0).'%',
                $pm['net_revenue'],
                ($pm['revenue_share_percent'] ?? 0).'%',
                $pm['unpaid_count'],
                $pm['unpaid_amount'],
                $pm['cancelled_count'],
                $pm['cancelled_amount'],
            ];
        }

        // 6. Data Sheet 6: Item Rejections & Pre-payment Cancellations
        $sheet6Data = [
            ['SHEET 6: AUDIT PENOLAKAN MENU & PEMBATALAN PESANAN (BELUM BAYAR)'],
            ['Periode Laporan', $periodLabel],
            ['Waktu Pembuatan', $nowStr],
            [],
            ['RINGKASAN PENOLAKAN MENU & PEMBATALAN'],
            ['Kebijakan Sistem', 'Pesanan yang sudah dibayar bersifat final (tidak ada pembatalan/refund). Penolakan item menu dicatat sebagai audit operasional dapur.'],
            ['Total Item Menu Ditolak', ($ops['pipeline']['rejected_items_count'] ?? 0).' item', $this->formatRupiah((float) ($ops['pipeline']['rejected_items_amount'] ?? 0))],
            ['Total Pesanan Dibatalkan (Belum Bayar)', $summary['period']['cancelled_orders_count'].' pesanan', $this->formatRupiah((float) $summary['period']['cancelled_amount'])],
            [],
            ['DAFTAR PESANAN DENGAN ITEM DITOLAK ATAU PEMBATALAN SEBELUM BAYAR'],
            ['Nomor Pesanan', 'Waktu Pembuatan', 'Nama Pelanggan', 'Meja', 'Gateway', 'Status Pembayaran', 'Status Pesanan', 'Nominal Tagihan (Rp)', 'Nilai Item Ditolak (Rp)', 'Catatan Audit'],
        ];

        foreach ($transactions as $tx) {
            $hasRejected = ($tx['rejected_items_amount'] ?? 0) > 0;
            if ($tx['order_status'] === 'cancelled' || $hasRejected || ($tx['refund_amount'] ?? 0) > 0) {
                $sheet6Data[] = [
                    $tx['order_number'],
                    $tx['created_at_formatted'],
                    $tx['customer_name'],
                    'Meja '.$tx['table_number'],
                    $tx['payment_gateway_label'] ?? 'Kasir POS',
                    $tx['payment_status_label'],
                    $tx['order_status_label'],
                    $tx['total_amount'],
                    $tx['rejected_items_amount'] ?? 0,
                    $tx['refund_reason'] ?: ($tx['notes'] ?: 'Penolakan item / pembatalan sebelum bayar'),
                ];
            }
        }

        // Tulis semua sheet ke OpenXML ZIP
        $sheets = [
            1 => ['name' => 'Summary', 'data' => $sheet1Data],
            2 => ['name' => 'Daily Breakdown', 'data' => $sheet2Data],
            3 => ['name' => 'Sales Transactions', 'data' => $sheet3Data],
            4 => ['name' => 'Product Performance', 'data' => $sheet4Data],
            5 => ['name' => 'Gateway & Payments', 'data' => $sheet5Data],
            6 => ['name' => 'Item Reject & Cancel', 'data' => $sheet6Data],
        ];

        $zip->addFromString('[Content_Types].xml', $this->buildContentTypesXml(count($sheets)));
        $zip->addFromString('_rels/.rels', $this->buildRootRelsXml());
        $zip->addFromString('xl/_rels/workbook.xml.rels', $this->buildWorkbookRelsXml(count($sheets)));
        $zip->addFromString('xl/workbook.xml', $this->buildWorkbookXml($sheets));
        $zip->addFromString('xl/styles.xml', $this->buildStylesXml());

        foreach ($sheets as $idx => $sheetInfo) {
            $zip->addFromString("xl/worksheets/sheet{$idx}.xml", $this->buildWorksheetXml($sheetInfo['data']));
        }

        $zip->close();

        return $tempFile;
    }

    private function buildContentTypesXml(int $sheetCount): string
    {
        $overrides = '';
        for ($i = 1; $i <= $sheetCount; $i++) {
            $overrides .= "<Override PartName=\"/xl/worksheets/sheet{$i}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>\n";
        }

        return <<<XML
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
    <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
    {$overrides}
</Types>
XML;
    }

    private function buildRootRelsXml(): string
    {
        return <<<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
XML;
    }

    private function buildWorkbookRelsXml(int $sheetCount): string
    {
        $rels = '';
        for ($i = 1; $i <= $sheetCount; $i++) {
            $rels .= "<Relationship Id=\"rId{$i}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{$i}.xml\"/>\n";
        }
        $stylesId = $sheetCount + 1;
        $rels .= "<Relationship Id=\"rId{$stylesId}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>\n";

        return <<<XML
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    {$rels}
</Relationships>
XML;
    }

    /**
     * @param  array<int, array{name: string, data: array<int, array<int, mixed>>}>  $sheets
     */
    private function buildWorkbookXml(array $sheets): string
    {
        $sheetXml = '';
        foreach ($sheets as $id => $s) {
            $safeName = htmlspecialchars($s['name'], ENT_XML1, 'UTF-8');
            $sheetXml .= "<sheet name=\"{$safeName}\" sheetId=\"{$id}\" r:id=\"rId{$id}\"/>\n";
        }

        return <<<XML
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <sheets>
        {$sheetXml}
    </sheets>
</workbook>
XML;
    }

    private function buildStylesXml(): string
    {
        return <<<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <fonts count="2">
        <font>
            <sz val="10"/>
            <name val="Calibri"/>
        </font>
        <font>
            <b/>
            <sz val="11"/>
            <name val="Calibri"/>
        </font>
    </fonts>
    <fills count="2">
        <fill><patternFill patternType="none"/></fill>
        <fill><patternFill patternType="gray125"/></fill>
    </fills>
    <borders count="1">
        <border><left/><right/><top/><bottom/><diagonal/></border>
    </borders>
    <cellStyleXfs count="1">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    </cellStyleXfs>
    <cellXfs count="2">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
        <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    </cellXfs>
</styleSheet>
XML;
    }

    /**
     * @param  array<int, array<int, mixed>>  $rows
     */
    private function buildWorksheetXml(array $rows): string
    {
        $xml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n";
        $xml .= "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">\n";
        $xml .= "<sheetData>\n";

        foreach ($rows as $rowIndex => $cols) {
            $rowNum = $rowIndex + 1;
            if (empty($cols)) {
                $xml .= "<row r=\"{$rowNum}\"/>\n";

                continue;
            }

            $xml .= "<row r=\"{$rowNum}\">\n";
            foreach ($cols as $colIndex => $val) {
                $colLetter = $this->getColumnLetter($colIndex);
                $cellRef = "{$colLetter}{$rowNum}";

                if ($val === null || $val === '') {
                    continue;
                }

                if (is_int($val) || is_float($val)) {
                    $xml .= "<c r=\"{$cellRef}\" t=\"n\"><v>{$val}</v></c>\n";
                } else {
                    $escaped = htmlspecialchars((string) $val, ENT_XML1, 'UTF-8');
                    $xml .= "<c r=\"{$cellRef}\" t=\"inlineStr\"><is><t>{$escaped}</t></is></c>\n";
                }
            }
            $xml .= "</row>\n";
        }

        $xml .= "</sheetData>\n";
        $xml .= '</worksheet>';

        return $xml;
    }

    private function getColumnLetter(int $colIndex): string
    {
        $letter = '';
        $index = $colIndex;
        while ($index >= 0) {
            $letter = chr(65 + ($index % 26)).$letter;
            $index = intdiv($index, 26) - 1;
        }

        return $letter;
    }

    private function formatRupiah(float $amount): string
    {
        return 'Rp '.number_format($amount, 0, ',', '.');
    }
}
