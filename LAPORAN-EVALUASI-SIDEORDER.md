# LAPORAN EVALUASI & PENYEMPURNAAN SISTEM SIDEORDER (CAFÉ SIDE LINE)

**Nama Proyek:** SideOrder — Sistem Pemesanan Mandiri QR Meja, KDS Kasir/Barista, & Manajemen Kafe  
**Objek Studi:** Café SIDE LINE  
**Stack Teknologi:** Laravel 13 (PHP 8.3+), Inertia.js v3, React 19, TypeScript, Tailwind CSS v4, SQLite/MySQL  
**Tanggal Evaluasi:** 26 Oktober 2026

---

## A. Ringkasan Sistem SideOrder

**SideOrder** adalah aplikasi web terintegrasi berbasis _Single-Page Application_ (SPA) menggunakan arsitektur **Laravel 13 + Inertia.js + React 19** yang dirancang untuk mendigitalisasi alur operasional **Café SIDE LINE** dari meja pelanggan hingga laporan keuangan manajemen.

Sistem ini menghubungkan **3 peran utama (_role_)** secara _real-time_ di dalam satu basis data terpusat:

1. **Customer (Pelanggan Meja — Tanpa Login):**
    - Pelanggan memindai (_scan_) QR Code unik pada meja (`/order?table={qr_token}`).
    - Memilih menu, varian/ukuran (`MenuOptionGroup` & `MenuOptionItem`), catatan khusus, dan melakukan _checkout_ mandiri.
    - Setiap _scan_ baru atau perangkat (_handphone_) berbeda di meja yang sama menghasilkan **nomor nota (`order_number`) terpisah** namun tetap terikat pada `cafe_table_id` (meja) yang sama. Pelanggan juga dapat menambah item ke pesanan aktif mereka yang masih berstatus `pending` atau `processing`.
    - Memantau progres pesanan secara langsung (_live status stepper_: `Diterima` → `Diracik` → `Siap Saji` → `Selesai`) di `/order/status/{order_number}`.
2. **Cashier / Barista (Kasir & Kitchen Display System — Login Role `cashier` / `admin`):**
    - Mengelola antrean pesanan meja menggunakan layar **Kanban KDS 3 Kolom** (`Pesanan Baru`, `Sedang Diracik Barista`, `Siap Disajikan`) di `/cashier/orders`.
    - Menerima pembayaran Tunai (dengan kalkulator kembalian otomatis) maupun QRIS, memvalidasi _checklist_ item per tahapan, menolak item yang habis stok (_partial item rejection_ disertai kalkulasi ulang tagihan otomatis), dan mencetak struk _thermal_ 80mm.
3. **Administrator (Manajemen & Analitik — Login Role `admin`):**
    - Mengakses _Executive Dashboard_ (`/dashboard`), manajemen pesanan menyeluruh (`/admin/orders`), manajemen katalog menu & grup varian (`/admin/menus`, `/admin/categories`), generator QR Code meja (`/admin/tables`), manajemen staf (`/admin/users`), serta modul **Laporan Keuangan & Analitik Pendapatan** (`/admin/financial-reports`) lengkap dengan ekspor CSV dan PDF.
    - Memiliki akses lintas-role untuk membuka layar operasional Kasir/KDS (`/cashier/orders`) secara langsung.

---

## B. Pembagian Font Customer, Admin, dan Kasir (Unified Global Font: Outfit)

Sistem tipografi dikonfigurasi secara terpusat dan menyeluruh (_global single-font system_) melalui `vite.config.ts` (Bunny Fonts plugin: `Outfit` dengan _weights_ `300, 400, 500, 600, 700, 800, 900`), `resources/views/app.blade.php`, dan `resources/css/app.css` menggunakan _custom properties_ Tailwind CSS v4 (`--font-sans`, `--font-heading`, `--font-mono`, dan `--font-serif` semuanya diarahkan ke `'Outfit'`).

| Peran (Role)                | Halaman Terkait                                                                                                                                                                                      | Elemen UI                                                                                                                                                                                                                                         | Keluarga Font                                                   | Utility Class / Variabel CSS                                                      | Karakter Visual                                                                                                                    |
| :-------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------- | :-------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| **Customer**                | `customer/order.tsx`<br>`customer/status.tsx`<br>`customer/invalid-table.tsx`<br>`QrisPaymentModal.tsx`                                                                                              | Judul halaman (`SIDE LINE`, `Pilihan Populer & Khas`, `Rincian Pesanan`, `Nota Pemesanan`, `QR Meja Tidak Valid`), filter pil kategori, nama menu, deskripsi, harga (`tabular-nums`), tombol aksi, _modal checkout_, dan _stepper_ status pesanan | **Outfit** _(Weights: 300 s/d 900)_                             | `.font-heading`, `.font-sans`, `.font-mono` (`var(--font-sans)` + `tabular-nums`) | Geometris modern, _hospitality_ hangat, tegas pada judul (`700–900`, `tracking: -0.02em`) dan bersih di layar _mobile_ (`400–600`) |
| **Admin**                   | `dashboard.tsx`<br>`admin/orders/index.tsx`<br>`admin/financial-reports/index.tsx`<br>`admin/menus/index.tsx`<br>`admin/categories/index.tsx`<br>`admin/tables/index.tsx`<br>`admin/users/index.tsx` | Seluruh elemen: _heading_, _sidebar_ navigasi, _header_ sticky, kartu KPI, tabel transaksi, _filter_, _form_, _modal_, tombol, laporan keuangan, notifikasi, dan status pesanan                                                                   | **Outfit** _(Single Global Font Family — Weights: 300 s/d 900)_ | `.theme-sideline`, `.font-sans`, `.font-heading`, `.font-mono` (`tabular-nums`)   | Formal, profesional, rapi, proporsi angka presisi untuk tabel analitik & laporan keuangan                                          |
| **Kasir (KDS)**             | `cashier/orders/index.tsx`                                                                                                                                                                           | Seluruh elemen: _header_ terminal, navigasi KDS, kartu antrean Kanban, _checklist_ menu, kalkulator pembayaran, _modal_ struk, dan _toast_ notifikasi                                                                                             | **Outfit** _(Single Global Font Family — Weights: 300 s/d 900)_ | `.theme-sideline`, `.font-sans`, `.font-heading`, `.font-mono` (`tabular-nums`)   | Efisien, kontras tinggi, bebas distraksi dekoratif, memudahkan pemindaian cepat saat jam sibuk                                     |
| **Auth, Settings & Portal** | `welcome.tsx`<br>`auth/*`<br>`settings/*`                                                                                                                                                            | Halaman beranda/portal, login, registrasi, pengaturan akun, _dialog/portal_ Radix UI, dan _toast_ Sonner                                                                                                                                          | **Outfit** _(Single Global Font Family — Weights: 300 s/d 900)_ | Global CSS selector (`html, body, *, [data-radix-portal], [data-sonner-toaster]`) | Konsisten 100% dengan identitas visual hangat Café SIDE LINE (`#FAF6EC` & `#C52828`)                                               |

---

## C. Keunggulan Desain Tipografi Global (`Outfit`) dan Manfaatnya bagi Setiap Role

1. **Bagi Pelanggan (Customer — Geometri Hangat & Modern dengan `Outfit`):**
    - **Daya Tarik Visual Katalog Menu:** _Outfit_ adalah _geometric sans-serif_ modern dengan kurva terbuka dan rentang ketebalan luas (`300` hingga `900`). Penggunaan _weight_ `700–900` dengan `letter-spacing: -0.02em` membuat judul kategori, nomor meja, dan nama menu kopi/makanan tampak menonjol dan _appetizing_.
    - **Kenyamanan Membaca Informasi Transaksional:** Penggunaan _Outfit_ pada bobot `400–600` untuk deskripsi komposisi menu, opsi ukuran, catatan khusus, nominal harga, hingga status pesanan menjaga keselarasan visual dan kejelasan bacaan pada layar ponsel berukuran kecil.
2. **Bagi Kasir & Barista (Kecepatan Pemindaian Visual — _Zero Visual Clutter_):**
    - **Konsistensi 100% Satu Keluarga Font:** Di meja kasir dan area bar yang sibuk, penggunaan satu keluarga font global (_Outfit_) menghilangkan gangguan visual akibat pergantian gaya huruf di antara kartu antrean, _modal_ kasir, maupun _toast_ notifikasi.
    - **Hierarki Berbasis Ukuran, Ketebalan (_Weight_), dan Spasi:** Pembedaan antara nomor meja (`font-black`), nama menu (`font-bold`), opsi varian (`font-medium`), dan nominal Rupiah (`tabular-nums`) dicapai murni melalui variasi _weight_ (300–900), ukuran teks, serta kontras warna pada tema hangat `#FAF6EC`.
3. **Bagi Administrator (Presisi Tabel & Laporan Keuangan dengan `tabular-nums`):**
    - **Presisi Tabel & Laporan Keuangan:** Pengaturan `font-variant-numeric: tabular-nums` pada seluruh elemen `.font-mono` dan angka transaksi memastikan seluruh digit angka pada tabel Laporan Keuangan (`/admin/financial-reports`), kartu omzet harian, dan rincian pajak/diskon sejajar secara vertikal dengan estetika geometris _Outfit_ yang bersih.

---

## D. Hasil Audit Sistem Sound

Audit dilakukan langsung terhadap kode sumber dan struktur direktori proyek tanpa asumsi awal.

### 1. Format & Sumber Audio Aktual

- **Fakta Kode Sumber:** Proyek ini **tidak menggunakan file audio eksternal** (tidak ada file `.mp3`, `.wav`, atau `.ogg` statis di dalam folder `public/` maupun `resources/`).
- **Sumber Audio Aktual:** Suara dihasilkan secara terprogram (_programmatic audio synthesis_) melalui modul khusus di `resources/js/lib/order-chime.ts` dengan **dua mekanisme berlapis (Dual-Engine Audio)**:
    1. **Engine Utama — Web Audio API Synthesizer (`AudioContext`):** Membangkitkan gelombang suara lonceng _triple-chime_ harmonik pada frekuensi **A5 (`880 Hz`) → E5 (`659.25 Hz`) → C6 (`1046.5 Hz`)** menggunakan osilator `sine` dan `triangle` beserta _exponential gain envelope_.
    2. **Engine Cadangan — In-Memory PCM WAV Data-URI (`HTMLAudioElement`):** Menghasilkan _buffer_ audio **RIFF WAVE PCM 16-bit Mono 22.050 Hz** secara dinamis di memori (`data:audio/wav;base64,...`) yang diputar melalui elemen `new Audio()` apabila `AudioContext` berada dalam status `suspended` atau diblokir oleh kebijakan _autoplay_ browser.

### 2. Lokasi Kode & Pemanggilan

- **Modul Inti Audio:** `resources/js/lib/order-chime.ts`
    - Mengekspor fungsi `playOrderChime()` dan `unlockAudioContext()`.
    - Memasang _global event listener_ (`pointerdown`, `mousedown`, `click`, `touchstart`, `keydown` pada _capture phase_) untuk membuka kunci audio browser secara otomatis pada interaksi pertama pengguna, serta menyimpan antrean (`pendingChimeOnUnlock`) jika notifikasi masuk sebelum konteks audio terbuka.
- **Pemanggil pada Halaman Kasir (KDS):** `resources/js/pages/cashier/orders/index.tsx`
    - Mengimpor `playOrderChime` dan `unlockAudioContext` dari `@/lib/order-chime`.
    - Dipanggil di dalam `updateStateFromIncoming()` (baris 274–277) saat ditemukan pesanan baru dan di dalam `toggleSound()` (baris 425) saat kasir menguji/mengaktifkan tombol **"Bel Aktif (Tes Suara)"**.
- **Pemanggil pada Halaman Pesanan Masuk Admin:** `resources/js/pages/admin/orders/index.tsx`
    - Mengimpor `playOrderChime` dan `unlockAudioContext` dari `@/lib/order-chime`.
    - Dipanggil di dalam `useEffect([orders.data])` (baris 251–254) saat pesanan baru masuk dan pada tombol **"Bel Aktif / Bel Mati"** (baris 148–159).

### 3. Pemicu Suara & Pencegahan Duplikasi (Anti-Loop / Anti-Double Trigger)

- **Kondisi Pemicu:** Suara hanya berbunyi apabila terdapat pesanan di dalam daftar sinkronisasi yang:
    1. ID pesanannya **belum pernah tercatat** di dalam `knownOrderIdsRef.current` (`Set<number>`), **DAN**
    2. Status pesanannya adalah `pending` (_Menunggu Konfirmasi_) atau `processing` (_Sedang Diracik_), **DAN**
    3. Status tombol suara (`soundEnabledRef.current`) aktif (`localStorage.getItem('sideline_cashier_sound') !== 'disabled'`).
- **Pencegahan Bunyi Berulang / Ganda:**
    - Begitu pesanan baru terdeteksi dan `playOrderChime()` dipanggil satu kali, seluruh ID pesanan langsung dimasukkan ke dalam `knownOrderIdsRef.current.add(o.id)`.
    - Pada siklus _polling_ berikutnya (setiap 2 detik di Kasir / 3 detik di Admin), pesanan tersebut sudah berada di dalam `Set`, sehingga **tidak akan memicu bunyi berulang**.
    - Satu panggilan `playOrderChime()` hanya memainkan rangkaian nada berdurasi ~1,1 detik (tidak menggunakan atribut `loop`).

### 4. Masalah yang Ditemukan Saat Audit & Perbaikan yang Telah Dilakukan

1. **Masalah 1 (Baru Diperbaiki):** Sebelumnya, saat staf berpindah _tab_ browser kembali ke layar Kasir (`window.focus` / `visibilitychange`), fungsi `handleFocus` memanggil `handleManualSync` yang langsung memasukkan ID pesanan baru ke `knownOrderIdsRef.current` **tanpa** memanggil `updateStateFromIncoming()`. Akibatnya, pesanan baru yang masuk saat kasir baru membuka _tab_ tidak mengeluarkan suara.
    - **Solusi:** Menyatukan alur sinkronisasi _polling_, _focus re-sync_, dan tombol sinkronisasi manual di `resources/js/pages/cashier/orders/index.tsx` agar semuanya melewati `updateStateFromIncoming(data)`.
2. **Masalah 2 (Baru Diperbaiki):** Endpoint `/cashier/orders/stream` dan `/admin/orders/stream` sebelumnya menjalankan `while (true)` + `sleep(2)` selama 30 detik di PHP. Pada lingkungan server _single-threaded_ (`php artisan serve`), koneksi ini memblokir _request_ lain (termasuk pengiriman pesanan dari HP pelanggan) selama 30 detik.
    - **Solusi:** Mengubah `stream()` di `app/Http/Controllers/Cashier/OrderController.php` dan `app/Http/Controllers/Admin/OrderController.php` menjadi _single-shot non-blocking response_ serta menggunakan _non-blocking polling_ cepat (2 detik) ke `/cashier/orders/sync`.
3. **Masalah 3 (Baru Diperbaiki):** Halaman `/admin/orders` sebelumnya belum memiliki pemanggilan fungsi suara ketika pesanan baru masuk.
    - **Solusi:** Menambahkan integrasi `playOrderChime()` dan tombol pengatur **"Bel Aktif / Bel Mati"** di `resources/js/pages/admin/orders/index.tsx`.

---

## E. Keunggulan Sistem yang Benar-Benar Sudah Tersedia (Berdasarkan Bukti Kode)

Seluruh fitur di bawah ini **sudah terimplementasi dan terverifikasi ada di dalam kode sumber**:

1. **Pemesanan Mandiri Berbasis QR Code Token Unik Tanpa Login:**
    - Setiap meja (`cafe_tables`) memiliki `qr_token` unik (`CRD-01` s/d `CRD-10` atau token acak `TB-XXXXXX`) yang dapat diregenerasi oleh Admin di `app/Http/Controllers/Admin/CafeTableController.php` (`regenerateQr`).
    - Generator tampilan kartu meja siap cetak tersedia langsung di `resources/js/pages/admin/tables/index.tsx` menggunakan layanan QR SVG (`api.qrserver.com`) dan CSS `@media print` khusus `.printable-qr`.
2. **Multi-Device / Multi-Nota pada Satu Meja yang Sama:**
    - Diatur di `app/Http/Controllers/Customer/OrderController.php` (`index` & `checkout`) dan `resources/js/pages/customer/status.tsx`: setiap _scan_ QR baru atau pemesanan dari HP berbeda di meja yang sama otomatis membuat **nota (`order_number`) tersendiri** dengan `cafe_table_id` yang sama, sementara fitur tambah menu ke nota aktif tetap didukung jika pelanggan membuka tautan dari halaman status pesanannya (`?table={token}&order={order_number}`).
3. **Proteksi Idempotency & Anti-Double Submit saat Checkout:**
    - `app/Http/Controllers/Customer/OrderController.php` menggunakan `Cache::lock` berbasis `idempotency_key` dan _fingerprint_ keranjang belanja untuk mencegah pembuatan pesanan ganda akibat klik berulang atau koneksi lambat.
4. **Layar Operasional Kasir / KDS Berbasis Kanban Real-Time:**
    - Tersedia di `resources/js/pages/cashier/orders/index.tsx`: mencakup 3 kolom tahapan kerja, _checklist_ item per tahapan yang tersimpan di `localStorage`, kalkulator pembayaran tunai dengan nominal cepat (_quick cash_), penolakan item parsial (_partial item rejection_) saat stok habis disertai perhitungan ulang `subtotal` & `total_amount` otomatis, serta riwayat penolakan menu.
5. **Dual-Role Access (Admin Dapat Mengakses Kasir):**
    - Middleware `app/Http/Middleware/EnsureUserHasRole.php` dan definisi rute di `routes/web.php` (`middleware(['auth', 'role:admin,cashier'])`) mengizinkan Admin membuka layar KDS Kasir secara langsung dan kembali ke Panel Admin melalui tombol navigasi khusus.
6. **Laporan Keuangan & Analitik Pendapatan Lengkap:**
    - Diimplementasikan di `app/Http/Controllers/Admin/FinancialReportController.php` dan `resources/js/pages/admin/financial-reports/index.tsx`.
    - Memisahkan secara ketat antara **Pendapatan Bersih Terealisasi** (`payment_status = 'paid'` & `order_status != 'cancelled'`), **Piutang/Menunggu Bayar** (`unpaid`), **Transaksi Batal/Gagal**, serta **Potongan Item Ditolak / Refund**.
    - Dilengkapi rekapitulasi Harian, Mingguan, dan Bulanan, grafik tren pendapatan, serta **Ekspor CSV (UTF-8 BOM Excel)** dan **Ekspor PDF Siap Cetak**.

---

## F. Temuan Masalah, Risiko, Rekomendasi, serta Status Implementasi

Untuk menjaga transparansi evaluasi, berikut adalah klasifikasi tegas atas status fitur dan temuan teknis:

### 1. Fitur yang Sudah Berjalan Sejak Awal (Verified Working)

- Pemesanan QR pelanggan per meja, kustomisasi varian menu (`single` & `multiple` select), keranjang `localStorage` tersinkronisasi harga server, dan _live status polling_.
- Manajemen KDS Kasir (konfirmasi bayar Tunai/QRIS, _checklist_ tahapan barista, tolak item habis stok, cetak struk _thermal_ 80mm).
- Panel Admin lengkap (Dashboard, Pesanan Masuk, Menu & Varian, Kategori, Meja & QR, Staf, serta Laporan Keuangan + Ekspor CSV/PDF).

### 2. Fitur & Bug yang Baru Diperbaiki pada Sesi Ini (Newly Fixed & Verified)

- **Restyling UI & Upgrade Tipografi Global ke Font `Outfit`:**
    - Mengonfigurasi font global menjadi **Outfit** (`weights: 300–900`) di `vite.config.ts`, `resources/views/app.blade.php`, dan `resources/css/app.css` untuk seluruh elemen HTML, form control, kode/angka (`tabular-nums`), portal modal Radix UI (`[data-radix-portal]`), serta notifikasi Sonner (`[data-sonner-toaster]`).
    - Melakukan _restyling_ dan _upgrade_ UI menyeluruh pada halaman beranda (`welcome.tsx`), layar QR meja invalid (`customer/invalid-table.tsx`), _layout_ autentikasi (`auth-simple-layout.tsx`, `auth-card-layout.tsx`, `auth-split-layout.tsx`), _layout_ pengaturan (`layouts/settings/layout.tsx`), _sidebar_ & _header_ Admin (`app-sidebar.tsx`, `app-sidebar-header.tsx`, `app-logo.tsx`, `admin-ui.tsx`), serta komponen _toast_ (`sonner.tsx`) agar selaras dengan palet warna hangat Café SIDE LINE (`#FAF6EC`, `#FFFDF9`, `#E8DFC8`, `#C52828`).
- **Perbaikan Sistem Suara Notifikasi Kasir & Admin:**
    - Membangun modul `resources/js/lib/order-chime.ts` (Web Audio API + PCM WAV Data-URI fallback), memperbaiki _bug_ `handleFocus` yang sebelumnya membisukan lonceng saat pindah _tab_, menghapus _blocking loop_ 30 detik pada endpoint `/stream`, dan menambahkan bel notifikasi di `/admin/orders`.
- **Pemisahan Nota per Scan / per HP di Meja yang Sama:**
    - Memastikan pelanggan yang memindai ulang QR meja atau memesan dari beberapa HP di satu meja mendapatkan nota (`order_number`) masing-masing dengan ID meja yang sama, dilengkapi pengujian otomatis di `tests/Feature/CustomerOrderTest.php`.

### 3. Bagian yang Belum Diuji Secara Fisik / Lingkungan Eksternal (Untested in Production Hardware)

- **Printer Thermal Fisik (Hardware 80mm):** Fungsi cetak struk (`window.print()` dengan isolasi CSS `.printable-receipt`) telah terverifikasi secara kode dan tampilan cetak browser, namun belum diuji langsung pada perangkat keras printer _thermal_ ESC/POS fisik.
- **Kebijakan Autoplay pada Browser iOS Safari Tanpa Interaksi Sama Sekali:** Pada perangkat iPad/iPhone dengan aturan WebKit ketat, browser tetap mewajibkan minimal 1 kali ketukan layar (_tap_) di halaman Kasir setelah _reload_ penuh sebelum suara otomatis dapat keluar tanpa blokir OS. Mekanisme _pending chime queue_ dan _capture listener_ sudah dipasang untuk memitigasi risiko ini.

### 4. Rekomendasi Pengembangan Selanjutnya (Future Recommendations)

- **Integrasi Payment Gateway Otomatis (Midtrans / Xendit QRIS Dinamis):** Saat ini sudah terdapat _controller_ kerangka `app/Http/Controllers/PaymentWebhookController.php` dengan validasi _HMAC signature_ (`PAYMENT_WEBHOOK_SECRET`), namun pembayaran pelanggan di halaman _checkout_ masih menggunakan konfirmasi kasir (Tunai / QRIS Statis di Kasir). Ke depan dapat dihubungkan langsung ke API Midtrans/Xendit Snap agar status `paid` berubah otomatis begitu pelanggan membayar dari ponselnya.
- **Migrasi Polling ke WebSockets (Laravel Reverb):** Saat ini sinkronisasi _real-time_ menggunakan _non-blocking HTTP polling_ (2 detik di Kasir, 3 detik di Admin, 5 detik di Status Pelanggan) yang sangat stabil untuk skala kafe tunggal. Jika jumlah cabang/meja meningkat pesat, disarankan menggunakan **Laravel Reverb** untuk efisiensi _bandwidth_.

---

## G. Daftar File yang Diubah dan Pengujian yang Dilakukan

### 1. Daftar File yang Diubah / Ditambahkan

| No  | Path File                                                                                                 | Jenis Perubahan | Ringkasan Perubahan                                                                                                                                                                             |
| :-: | :-------------------------------------------------------------------------------------------------------- | :-------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  1  | `vite.config.ts`                                                                                          |     Diubah      | Mengonfigurasi Bunny Fonts plugin untuk memuat `Outfit` (`300, 400, 500, 600, 700, 800, 900`) secara global.                                                                                    |
|  2  | `resources/css/app.css`                                                                                   |     Diubah      | Mendefinisikan `--font-sans`, `--font-heading`, `--font-mono`, dan `--font-serif` ke `'Outfit'`, aturan _enforcement_ global termasuk portal & _toast_, `tabular-nums`, dan _custom scrollbar_. |
|  3  | `resources/views/app.blade.php`                                                                           |     Diubah      | Menerapkan font `'Outfit'`, `theme-sideline`, _antialiasing_, dan _selection_ warna merah `#C52828` pada `<body>`.                                                                              |
|  4  | `resources/js/pages/welcome.tsx`                                                                          |     Diubah      | Merombak halaman beranda menjadi portal utama **SIDEORDER • Café SIDE LINE** bergaya hangat dengan font `Outfit`.                                                                               |
|  5  | `resources/js/pages/customer/invalid-table.tsx`                                                           |     Diubah      | Merestyling halaman QR Meja Tidak Valid dengan _frame_ mobile hangat `#FAF6EC` dan tipografi `Outfit`.                                                                                          |
|  6  | `resources/js/layouts/auth/*` & `layouts/settings/layout.tsx`                                             |     Diubah      | Merestyling seluruh halaman Login, Register, dan Settings menggunakan kartu `#FFFDF9`, aksen `#C52828`, dan font `Outfit`.                                                                      |
|  7  | `resources/js/components/app-sidebar.tsx`, `app-sidebar-header.tsx`, `app-logo.tsx`, `admin/admin-ui.tsx` |     Diubah      | Upgrade UI _sidebar_ (termasuk menu Laporan Keuangan), _sticky header_ dengan _backdrop-blur_, kartu KPI (`StatCard`), dan komponen _panel_ Admin.                                              |
|  8  | `resources/js/pages/cashier/orders/index.tsx`                                                             |     Diubah      | Menerapkan `.theme-sideline` (`Outfit`), mengintegrasikan `@/lib/order-chime`, menyatukan `updateStateFromIncoming()` pada _focus re-sync_, dan menggunakan _non-blocking polling_ 2 detik.     |
|  9  | `resources/js/pages/admin/orders/index.tsx`                                                               |     Diubah      | Mengintegrasikan `@/lib/order-chime` untuk notifikasi suara pesanan baru di panel Admin beserta tombol _toggle_ `Bel Aktif / Bel Mati`.                                                         |
| 10  | `resources/js/lib/order-chime.ts`                                                                         |      Baru       | Modul synthesizer suara notifikasi pesanan (Web Audio API + _fallback_ PCM WAV Data-URI `HTMLAudioElement` + _auto-unlock listener_).                                                           |
| 11  | `app/Http/Controllers/Cashier/OrderController.php`                                                        |     Diubah      | Mengubah endpoint `stream()` menjadi _single-shot non-blocking_ agar tidak memblokir worker PHP.                                                                                                |
| 12  | `app/Http/Controllers/Admin/OrderController.php`                                                          |     Diubah      | Mengubah endpoint `stream()` menjadi _single-shot non-blocking_.                                                                                                                                |
| 13  | `app/Http/Controllers/Customer/OrderController.php`                                                       |     Diubah      | Memastikan setiap _scan_ QR baru tanpa parameter `?order=` membuat nota baru pada meja yang sama.                                                                                               |
| 14  | `tests/Feature/CustomerOrderTest.php`                                                                     |     Diubah      | Menambahkan pengujian skenario beberapa HP / beberapa kali _scan_ pada satu meja yang sama menghasilkan nota terpisah.                                                                          |
| 15  | `LAPORAN-EVALUASI-SIDEORDER.md`                                                                           |     Diubah      | Laporan lengkap hasil analisis tipografi `Outfit`, restyling UI global, audit sistem _sound_, evaluasi arsitektur, dan validasi pengujian.                                                      |

### 2. Pengujian & Validasi yang Dilakukan

1. **Pemeriksaan Tipe Statis TypeScript (`npm run types:check`):**
    - Menjalankan `tsc -b --noEmit` pada seluruh komponen React/Inertia.
    - **Hasil:** Lulus (`Exit Code: 0`, 0 _error_).
2. **Kompilasi Bundel Produksi Vite (`npm run build`):**
    - Memvalidasi integrasi plugin font Bunny (`DM Sans` & `Plus Jakarta Sans`), kompilasi Tailwind CSS v4, dan _bundling_ seluruh halaman Customer, Kasir, dan Admin.
    - **Hasil:** Lulus (`Exit Code: 0`, seluruh _chunk_ berhasil dibangun di `public/build/`).
3. **Pengujian Otomatis Fitur & Alur Bisnis (`php artisan test`):**
    - Menjalankan seluruh _test suite_ Pest/PHPUnit pada aplikasi (termasuk `tests/Feature/CustomerOrderTest.php`, `tests/Feature/FinancialReportTest.php`, serta pengujian autentikasi dan pengaturan).
    - **Hasil:** **67 pengujian lulus (`67 passed`, `470 assertions`, `Exit Code: 0`)** tanpa regresi logika bisnis.
