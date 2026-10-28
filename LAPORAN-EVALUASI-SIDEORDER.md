# LAPORAN EVALUASI & PENYEMPURNAAN SISTEM SIDEORDER (CAFÉ SIDE LINE)

**Nama Proyek:** SideOrder — Sistem Pemesanan Mandiri QR Meja, KDS Kasir/Barista, & Manajemen Kafe  
**Objek Studi:** Café SIDE LINE  
**Stack Teknologi:** Laravel 13 (PHP 8.3+), Inertia.js v3, React 19, TypeScript, Tailwind CSS v4, SQLite/MySQL  
**Tanggal Evaluasi:** 26 Oktober 2026  

---

## A. Ringkasan Sistem SideOrder

**SideOrder** adalah aplikasi web terintegrasi berbasis *Single-Page Application* (SPA) menggunakan arsitektur **Laravel 13 + Inertia.js + React 19** yang dirancang untuk mendigitalisasi alur operasional **Café SIDE LINE** dari meja pelanggan hingga laporan keuangan manajemen.

Sistem ini menghubungkan **3 peran utama (*role*)** secara *real-time* di dalam satu basis data terpusat:
1. **Customer (Pelanggan Meja — Tanpa Login):**
   - Pelanggan memindai (*scan*) QR Code unik pada meja (`/order?table={qr_token}`).
   - Memilih menu, varian/ukuran (`MenuOptionGroup` & `MenuOptionItem`), catatan khusus, dan melakukan *checkout* mandiri.
   - Setiap *scan* baru atau perangkat (*handphone*) berbeda di meja yang sama menghasilkan **nomor nota (`order_number`) terpisah** namun tetap terikat pada `cafe_table_id` (meja) yang sama. Pelanggan juga dapat menambah item ke pesanan aktif mereka yang masih berstatus `pending` atau `processing`.
   - Memantau progres pesanan secara langsung (*live status stepper*: `Diterima` → `Diracik` → `Siap Saji` → `Selesai`) di `/order/status/{order_number}`.
2. **Cashier / Barista (Kasir & Kitchen Display System — Login Role `cashier` / `admin`):**
   - Mengelola antrean pesanan meja menggunakan layar **Kanban KDS 3 Kolom** (`Pesanan Baru`, `Sedang Diracik Barista`, `Siap Disajikan`) di `/cashier/orders`.
   - Menerima pembayaran Tunai (dengan kalkulator kembalian otomatis) maupun QRIS, memvalidasi *checklist* item per tahapan, menolak item yang habis stok (*partial item rejection* disertai kalkulasi ulang tagihan otomatis), dan mencetak struk *thermal* 80mm.
3. **Administrator (Manajemen & Analitik — Login Role `admin`):**
   - Mengakses *Executive Dashboard* (`/dashboard`), manajemen pesanan menyeluruh (`/admin/orders`), manajemen katalog menu & grup varian (`/admin/menus`, `/admin/categories`), generator QR Code meja (`/admin/tables`), manajemen staf (`/admin/users`), serta modul **Laporan Keuangan & Analitik Pendapatan** (`/admin/financial-reports`) lengkap dengan ekspor CSV dan PDF.
   - Memiliki akses lintas-role untuk membuka layar operasional Kasir/KDS (`/cashier/orders`) secara langsung.

---

## B. Pembagian Font Customer, Admin, dan Kasir

Sistem tipografi dikonfigurasi secara terpusat melalui `vite.config.ts` (Bunny Fonts plugin) dan `resources/css/app.css` menggunakan *custom properties* Tailwind CSS v4 (`--font-sans`, `--font-heading`, dan `--font-mono`).

| Peran (Role) | Halaman Terkait | Elemen UI | Keluarga Font | Utility Class / Variabel CSS | Karakter Visual |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Customer** | `customer/order.tsx`<br>`customer/status.tsx`<br>`customer/invalid-table.tsx` | Judul halaman (`SIDE LINE`, `Pilihan Populer & Khas`, `Rincian Pesanan`, `Nota Pemesanan`, `QR Meja Tidak Valid`), filter pil kategori, subjudul kategori, dan **nama menu** | **Plus Jakarta Sans** *(Weights: 600, 700, 800)* | `.font-heading` (`var(--font-heading)`) | Modern, ekspresif, berkarakter *hospitality* premium, memberi penekanan kuat pada nama produk & kategori |
| **Customer** | `customer/order.tsx`<br>`customer/status.tsx`<br>`customer/invalid-table.tsx` | Deskripsi menu, harga (`tabular-nums`), tombol aksi, input pencarian & catatan, *modal checkout*, instruksi pembayaran, dan *stepper* status pesanan | **DM Sans** *(Weights: 400, 500, 600, 700, 800)* | `.font-sans` (`var(--font-sans)`) | Bersih, nyaman dibaca di layar *mobile*, proporsi angka harga jelas |
| **Admin** | `dashboard.tsx`<br>`admin/orders/index.tsx`<br>`admin/financial-reports/index.tsx`<br>`admin/menus/index.tsx`<br>`admin/categories/index.tsx`<br>`admin/tables/index.tsx`<br>`admin/users/index.tsx` | Seluruh elemen: *heading*, *sidebar* navigasi, kartu KPI, tabel transaksi, *filter*, *form*, *modal*, tombol, laporan keuangan, notifikasi, dan status pesanan | **DM Sans** *(Single Font Family — Weights: 400 s/d 800)* | `.theme-sideline`, `.font-sans`, `.font-mono` (`tabular-nums`) | Formal, profesional, rapi, berfokus pada keterbacaan data operasional dan akurasi angka |
| **Kasir (KDS)** | `cashier/orders/index.tsx` | Seluruh elemen: *header* terminal, navigasi KDS, kartu antrean Kanban, *checklist* menu, kalkulator pembayaran, *modal* struk, dan *toast* notifikasi | **DM Sans** *(Single Font Family — Weights: 400 s/d 800)* | `.theme-sideline`, `.font-sans`, `.font-mono` (`tabular-nums`) | Efisien, kontras tinggi, bebas distraksi dekoratif, memudahkan pemindaian cepat saat jam sibuk |

---

## C. Keunggulan Desain Tipografi dan Manfaatnya bagi Setiap Role

1. **Bagi Pelanggan (Customer — Dual-Font Pairing: `Plus Jakarta Sans` + `DM Sans`):**
   - **Daya Tarik Visual Katalog Menu:** *Plus Jakarta Sans* memiliki geometri huruf modern dengan *x-height* tinggi yang membuat judul kategori dan nama menu kopi/makanan tampak menonjol dan premium layaknya aplikasi *food delivery* modern.
   - **Kenyamanan Membaca Informasi Transaksional:** Penggunaan *DM Sans* pada deskripsi komposisi menu, opsi ukuran, catatan khusus, nominal harga, hingga status pesanan menjaga kejelasan bacaan pada layar ponsel berukuran kecil.
2. **Bagi Kasir & Barista (Single-Font Family: `DM Sans`):**
   - **Kecepatan Pemindaian Visual (*Zero Visual Clutter*):** Di meja kasir dan area bar yang sibuk, penggunaan satu keluarga font tunggal (*DM Sans*) menghilangkan gangguan visual akibat pergantian gaya huruf.
   - **Hierarki Berbasis Ukuran, Ketebalan (*Weight*), dan Spasi:** Pembedaan antara nomor meja (`font-black`), nama menu (`font-bold`), opsi varian (`font-medium`), dan nominal Rupiah (`tabular-nums`) dicapai murni melalui variasi *weight* (400–800), ukuran teks, serta kontras warna pada tema hangat `#FAF6EC`.
3. **Bagi Administrator (Single-Font Family: `DM Sans` dengan `tabular-nums`):**
   - **Presisi Tabel & Laporan Keuangan:** Pengaturan `font-variant-numeric: tabular-nums` pada kelas numerik memastikan seluruh digit angka pada tabel Laporan Keuangan (`/admin/financial-reports`), kartu omzet harian, dan rincian pajak/diskon sejajar secara vertikal tanpa perlu berganti ke font *monospace* bergaya kaku.

---

## D. Hasil Audit Sistem Sound

Audit dilakukan langsung terhadap kode sumber dan struktur direktori proyek tanpa asumsi awal.

### 1. Format & Sumber Audio Aktual
- **Fakta Kode Sumber:** Proyek ini **tidak menggunakan file audio eksternal** (tidak ada file `.mp3`, `.wav`, atau `.ogg` statis di dalam folder `public/` maupun `resources/`).
- **Sumber Audio Aktual:** Suara dihasilkan secara terprogram (*programmatic audio synthesis*) melalui modul khusus di `resources/js/lib/order-chime.ts` dengan **dua mekanisme berlapis (Dual-Engine Audio)**:
  1. **Engine Utama — Web Audio API Synthesizer (`AudioContext`):** Membangkitkan gelombang suara lonceng *triple-chime* harmonik pada frekuensi **A5 (`880 Hz`) → E5 (`659.25 Hz`) → C6 (`1046.5 Hz`)** menggunakan osilator `sine` dan `triangle` beserta *exponential gain envelope*.
  2. **Engine Cadangan — In-Memory PCM WAV Data-URI (`HTMLAudioElement`):** Menghasilkan *buffer* audio **RIFF WAVE PCM 16-bit Mono 22.050 Hz** secara dinamis di memori (`data:audio/wav;base64,...`) yang diputar melalui elemen `new Audio()` apabila `AudioContext` berada dalam status `suspended` atau diblokir oleh kebijakan *autoplay* browser.

### 2. Lokasi Kode & Pemanggilan
- **Modul Inti Audio:** `resources/js/lib/order-chime.ts`
  - Mengekspor fungsi `playOrderChime()` dan `unlockAudioContext()`.
  - Memasang *global event listener* (`pointerdown`, `mousedown`, `click`, `touchstart`, `keydown` pada *capture phase*) untuk membuka kunci audio browser secara otomatis pada interaksi pertama pengguna, serta menyimpan antrean (`pendingChimeOnUnlock`) jika notifikasi masuk sebelum konteks audio terbuka.
- **Pemanggil pada Halaman Kasir (KDS):** `resources/js/pages/cashier/orders/index.tsx`
  - Mengimpor `playOrderChime` dan `unlockAudioContext` dari `@/lib/order-chime`.
  - Dipanggil di dalam `updateStateFromIncoming()` (baris 274–277) saat ditemukan pesanan baru dan di dalam `toggleSound()` (baris 425) saat kasir menguji/mengaktifkan tombol **"Bel Aktif (Tes Suara)"**.
- **Pemanggil pada Halaman Pesanan Masuk Admin:** `resources/js/pages/admin/orders/index.tsx`
  - Mengimpor `playOrderChime` dan `unlockAudioContext` dari `@/lib/order-chime`.
  - Dipanggil di dalam `useEffect([orders.data])` (baris 251–254) saat pesanan baru masuk dan pada tombol **"Bel Aktif / Bel Mati"** (baris 148–159).

### 3. Pemicu Suara & Pencegahan Duplikasi (Anti-Loop / Anti-Double Trigger)
- **Kondisi Pemicu:** Suara hanya berbunyi apabila terdapat pesanan di dalam daftar sinkronisasi yang:
  1. ID pesanannya **belum pernah tercatat** di dalam `knownOrderIdsRef.current` (`Set<number>`), **DAN**
  2. Status pesanannya adalah `pending` (*Menunggu Konfirmasi*) atau `processing` (*Sedang Diracik*), **DAN**
  3. Status tombol suara (`soundEnabledRef.current`) aktif (`localStorage.getItem('sideline_cashier_sound') !== 'disabled'`).
- **Pencegahan Bunyi Berulang / Ganda:**
  - Begitu pesanan baru terdeteksi dan `playOrderChime()` dipanggil satu kali, seluruh ID pesanan langsung dimasukkan ke dalam `knownOrderIdsRef.current.add(o.id)`.
  - Pada siklus *polling* berikutnya (setiap 2 detik di Kasir / 3 detik di Admin), pesanan tersebut sudah berada di dalam `Set`, sehingga **tidak akan memicu bunyi berulang**.
  - Satu panggilan `playOrderChime()` hanya memainkan rangkaian nada berdurasi ~1,1 detik (tidak menggunakan atribut `loop`).

### 4. Masalah yang Ditemukan Saat Audit & Perbaikan yang Telah Dilakukan
1. **Masalah 1 (Baru Diperbaiki):** Sebelumnya, saat staf berpindah *tab* browser kembali ke layar Kasir (`window.focus` / `visibilitychange`), fungsi `handleFocus` memanggil `handleManualSync` yang langsung memasukkan ID pesanan baru ke `knownOrderIdsRef.current` **tanpa** memanggil `updateStateFromIncoming()`. Akibatnya, pesanan baru yang masuk saat kasir baru membuka *tab* tidak mengeluarkan suara.
   - **Solusi:** Menyatukan alur sinkronisasi *polling*, *focus re-sync*, dan tombol sinkronisasi manual di `resources/js/pages/cashier/orders/index.tsx` agar semuanya melewati `updateStateFromIncoming(data)`.
2. **Masalah 2 (Baru Diperbaiki):** Endpoint `/cashier/orders/stream` dan `/admin/orders/stream` sebelumnya menjalankan `while (true)` + `sleep(2)` selama 30 detik di PHP. Pada lingkungan server *single-threaded* (`php artisan serve`), koneksi ini memblokir *request* lain (termasuk pengiriman pesanan dari HP pelanggan) selama 30 detik.
   - **Solusi:** Mengubah `stream()` di `app/Http/Controllers/Cashier/OrderController.php` dan `app/Http/Controllers/Admin/OrderController.php` menjadi *single-shot non-blocking response* serta menggunakan *non-blocking polling* cepat (2 detik) ke `/cashier/orders/sync`.
3. **Masalah 3 (Baru Diperbaiki):** Halaman `/admin/orders` sebelumnya belum memiliki pemanggilan fungsi suara ketika pesanan baru masuk.
   - **Solusi:** Menambahkan integrasi `playOrderChime()` dan tombol pengatur **"Bel Aktif / Bel Mati"** di `resources/js/pages/admin/orders/index.tsx`.

---

## E. Keunggulan Sistem yang Benar-Benar Sudah Tersedia (Berdasarkan Bukti Kode)

Seluruh fitur di bawah ini **sudah terimplementasi dan terverifikasi ada di dalam kode sumber**:

1. **Pemesanan Mandiri Berbasis QR Code Token Unik Tanpa Login:**
   - Setiap meja (`cafe_tables`) memiliki `qr_token` unik (`CRD-01` s/d `CRD-10` atau token acak `TB-XXXXXX`) yang dapat diregenerasi oleh Admin di `app/Http/Controllers/Admin/CafeTableController.php` (`regenerateQr`).
   - Generator tampilan kartu meja siap cetak tersedia langsung di `resources/js/pages/admin/tables/index.tsx` menggunakan layanan QR SVG (`api.qrserver.com`) dan CSS `@media print` khusus `.printable-qr`.
2. **Multi-Device / Multi-Nota pada Satu Meja yang Sama:**
   - Diatur di `app/Http/Controllers/Customer/OrderController.php` (`index` & `checkout`) dan `resources/js/pages/customer/status.tsx`: setiap *scan* QR baru atau pemesanan dari HP berbeda di meja yang sama otomatis membuat **nota (`order_number`) tersendiri** dengan `cafe_table_id` yang sama, sementara fitur tambah menu ke nota aktif tetap didukung jika pelanggan membuka tautan dari halaman status pesanannya (`?table={token}&order={order_number}`).
3. **Proteksi Idempotency & Anti-Double Submit saat Checkout:**
   - `app/Http/Controllers/Customer/OrderController.php` menggunakan `Cache::lock` berbasis `idempotency_key` dan *fingerprint* keranjang belanja untuk mencegah pembuatan pesanan ganda akibat klik berulang atau koneksi lambat.
4. **Layar Operasional Kasir / KDS Berbasis Kanban Real-Time:**
   - Tersedia di `resources/js/pages/cashier/orders/index.tsx`: mencakup 3 kolom tahapan kerja, *checklist* item per tahapan yang tersimpan di `localStorage`, kalkulator pembayaran tunai dengan nominal cepat (*quick cash*), penolakan item parsial (*partial item rejection*) saat stok habis disertai perhitungan ulang `subtotal` & `total_amount` otomatis, serta riwayat penolakan menu.
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
- Pemesanan QR pelanggan per meja, kustomisasi varian menu (`single` & `multiple` select), keranjang `localStorage` tersinkronisasi harga server, dan *live status polling*.
- Manajemen KDS Kasir (konfirmasi bayar Tunai/QRIS, *checklist* tahapan barista, tolak item habis stok, cetak struk *thermal* 80mm).
- Panel Admin lengkap (Dashboard, Pesanan Masuk, Menu & Varian, Kategori, Meja & QR, Staf, serta Laporan Keuangan + Ekspor CSV/PDF).

### 2. Fitur & Bug yang Baru Diperbaiki pada Sesi Ini (Newly Fixed & Verified)
- **Konsistensi Sistem Font Berdasarkan Role:**
  - Mengganti konfigurasi font global dari *Instrument Sans* menjadi **DM Sans** (sebagai font tunggal seluruh halaman Admin & Kasir, serta font *body*/harga/checkout/status pada Customer) dan **Plus Jakarta Sans** (khusus judul halaman, kategori, dan nama menu pada Customer).
- **Perbaikan Sistem Suara Notifikasi Kasir & Admin:**
  - Membangun modul `resources/js/lib/order-chime.ts` (Web Audio API + PCM WAV Data-URI fallback), memperbaiki *bug* `handleFocus` yang sebelumnya membisukan lonceng saat pindah *tab*, menghapus *blocking loop* 30 detik pada endpoint `/stream`, dan menambahkan bel notifikasi di `/admin/orders`.
- **Pemisahan Nota per Scan / per HP di Meja yang Sama:**
  - Memastikan pelanggan yang memindai ulang QR meja atau memesan dari beberapa HP di satu meja mendapatkan nota (`order_number`) masing-masing dengan ID meja yang sama, dilengkapi pengujian otomatis di `tests/Feature/CustomerOrderTest.php`.

### 3. Bagian yang Belum Diuji Secara Fisik / Lingkungan Eksternal (Untested in Production Hardware)
- **Printer Thermal Fisik (Hardware 80mm):** Fungsi cetak struk (`window.print()` dengan isolasi CSS `.printable-receipt`) telah terverifikasi secara kode dan tampilan cetak browser, namun belum diuji langsung pada perangkat keras printer *thermal* ESC/POS fisik.
- **Kebijakan Autoplay pada Browser iOS Safari Tanpa Interaksi Sama Sekali:** Pada perangkat iPad/iPhone dengan aturan WebKit ketat, browser tetap mewajibkan minimal 1 kali ketukan layar (*tap*) di halaman Kasir setelah *reload* penuh sebelum suara otomatis dapat keluar tanpa blokir OS. Mekanisme *pending chime queue* dan *capture listener* sudah dipasang untuk memitigasi risiko ini.

### 4. Rekomendasi Pengembangan Selanjutnya (Future Recommendations)
- **Integrasi Payment Gateway Otomatis (Midtrans / Xendit QRIS Dinamis):** Saat ini sudah terdapat *controller* kerangka `app/Http/Controllers/PaymentWebhookController.php` dengan validasi *HMAC signature* (`PAYMENT_WEBHOOK_SECRET`), namun pembayaran pelanggan di halaman *checkout* masih menggunakan konfirmasi kasir (Tunai / QRIS Statis di Kasir). Ke depan dapat dihubungkan langsung ke API Midtrans/Xendit Snap agar status `paid` berubah otomatis begitu pelanggan membayar dari ponselnya.
- **Migrasi Polling ke WebSockets (Laravel Reverb):** Saat ini sinkronisasi *real-time* menggunakan *non-blocking HTTP polling* (2 detik di Kasir, 3 detik di Admin, 5 detik di Status Pelanggan) yang sangat stabil untuk skala kafe tunggal. Jika jumlah cabang/meja meningkat pesat, disarankan menggunakan **Laravel Reverb** untuk efisiensi *bandwidth*.

---

## G. Daftar File yang Diubah dan Pengujian yang Dilakukan

### 1. Daftar File yang Diubah / Ditambahkan
| No | Path File | Jenis Perubahan | Ringkasan Perubahan |
| :---: | :--- | :---: | :--- |
| 1 | `vite.config.ts` | Diubah | Mengganti font Bunny dari `Instrument Sans` menjadi `DM Sans` (400–800) dan `Plus Jakarta Sans` (600–800). |
| 2 | `resources/css/app.css` | Diubah | Mendefinisikan `--font-sans` (`DM Sans`), `--font-heading` (`Plus Jakarta Sans`), `--font-mono` (`DM Sans` + `tabular-nums`), dan aturan konsistensi 1 font pada `.theme-sideline` (Admin & Kasir). |
| 3 | `resources/js/pages/customer/order.tsx` | Diubah | Menerapkan `font-heading` (`Plus Jakarta Sans`) pada judul halaman, kategori, dan nama menu; serta `font-sans` (`DM Sans`) pada deskripsi, harga, tombol, input, dan *modal checkout*. |
| 4 | `resources/js/pages/customer/status.tsx` | Diubah | Menerapkan `font-heading` pada judul bagian nota & nama menu, serta `font-sans` pada status pesanan, harga, instruksi pembayaran, dan tombol buat nota baru per meja. |
| 5 | `resources/js/pages/customer/invalid-table.tsx` | Diubah | Menerapkan `font-heading` pada judul halaman `QR Meja Tidak Valid` dan `font-sans` pada teks penjelasan. |
| 6 | `resources/js/pages/cashier/orders/index.tsx` | Diubah | Menerapkan `.theme-sideline` (`DM Sans` tunggal), mengintegrasikan `@/lib/order-chime`, menyatukan `updateStateFromIncoming()` pada *focus re-sync*, dan menggunakan *non-blocking polling* 2 detik. |
| 7 | `resources/js/pages/admin/orders/index.tsx` | Diubah | Mengintegrasikan `@/lib/order-chime` untuk notifikasi suara pesanan baru di panel Admin beserta tombol *toggle* `Bel Aktif / Bel Mati`. |
| 8 | `resources/js/lib/order-chime.ts` | Baru | Modul synthesizer suara notifikasi pesanan (Web Audio API + *fallback* PCM WAV Data-URI `HTMLAudioElement` + *auto-unlock listener*). |
| 9 | `app/Http/Controllers/Cashier/OrderController.php` | Diubah | Mengubah endpoint `stream()` menjadi *single-shot non-blocking* agar tidak memblokir worker PHP. |
| 10 | `app/Http/Controllers/Admin/OrderController.php` | Diubah | Mengubah endpoint `stream()` menjadi *single-shot non-blocking*. |
| 11 | `app/Http/Controllers/Customer/OrderController.php` | Diubah | Memastikan setiap *scan* QR baru tanpa parameter `?order=` membuat nota baru pada meja yang sama. |
| 12 | `tests/Feature/CustomerOrderTest.php` | Diubah | Menambahkan pengujian skenario beberapa HP / beberapa kali *scan* pada satu meja yang sama menghasilkan nota terpisah. |
| 13 | `LAPORAN-EVALUASI-SIDEORDER.md` | Baru | Laporan lengkap hasil analisis tipografi, audit sistem *sound*, evaluasi arsitektur, dan validasi pengujian. |

### 2. Pengujian & Validasi yang Dilakukan
1. **Pemeriksaan Tipe Statis TypeScript (`npm run types:check`):**
   - Menjalankan `tsc -b --noEmit` pada seluruh komponen React/Inertia.
   - **Hasil:** Lulus (`Exit Code: 0`, 0 *error*).
2. **Kompilasi Bundel Produksi Vite (`npm run build`):**
   - Memvalidasi integrasi plugin font Bunny (`DM Sans` & `Plus Jakarta Sans`), kompilasi Tailwind CSS v4, dan *bundling* seluruh halaman Customer, Kasir, dan Admin.
   - **Hasil:** Lulus (`Exit Code: 0`, seluruh *chunk* berhasil dibangun di `public/build/`).
3. **Pengujian Otomatis Fitur & Alur Bisnis (`php artisan test`):**
   - Menjalankan seluruh *test suite* Pest/PHPUnit pada aplikasi (termasuk `tests/Feature/CustomerOrderTest.php`, `tests/Feature/FinancialReportTest.php`, serta pengujian autentikasi dan pengaturan).
   - **Hasil:** **67 pengujian lulus (`67 passed`, `470 assertions`, `Exit Code: 0`)** tanpa regresi logika bisnis.
