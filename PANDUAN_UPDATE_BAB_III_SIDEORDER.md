# Panduan Pembaruan & Arahan Penggantian BAB III SideOrder (Versi Terbaru)

Dokumen ini merupakan panduan praktis langkah demi langkah untuk mengganti **BAB III lama** (`BAB_III_Perancangan_dan_Implementasi_SideOrder.docx`, 22 November 2026) dengan **BAB III versi terbaru** (`BAB_III_Perancangan_dan_Implementasi_SideOrder_Terbaru.docx`, 27 November 2026) yang telah diselaraskan 100% dengan *source code* dan alur aplikasi SideOrder terkini.

---

## 1. Ringkasan Perubahan Alur Sistem (Lama vs Terbaru)

Sebelum mengganti isi naskah skripsi, pahami 6 perubahan utama yang sudah diperbarui penuh pada teks, 25 tabel (`Tabel 3.1`–`3.25`), dan 9 diagram teknis (`Gambar 3.1`–`3.9`) di file terbaru:

| No | Aspek | Versi Lama (22 Nov 2026) | Versi Terbaru (27 Nov 2026) |
|---|---|---|---|
| 1 | **Payment Gateway & Alur QRIS** | Xendit Direct API (`/qr_codes`, `/v2/invoices`), pola *Strategy Pattern* (`PaymentGatewayInterface`, `XenditGatewayDriver`), modal lokal `QrisPaymentModal.tsx`, mode `sandbox_slot` & simulator bayar. | **FCGateway & Midtrans Snap (QRIS)** berpola *Client–Service* (`FcGatewayClient` + `PaymentService`). Saat checkout QRIS, pelanggan langsung diarahkan (`Inertia::location`) ke *hosted checkout* Midtrans Snap (`https://pay.fcs.my.id/p/{short_code}`). Seluruh rute Xendit & simulator lama dihapus (HTTP `404`). |
| 2 | **Keamanan Webhook & Sinkronisasi** | `POST /payments/webhook/{driver?}` dengan header `X-CALLBACK-TOKEN`. | `POST /api/webhooks/fcgateway` (`routes/api.php`, `throttle:120,1`, bebas CSRF) dengan **Verifikasi Ganda**: HMAC-SHA256 (`X-FC-Signature`) + verifikasi balik *server-to-server* ke `GET /api/v1/fc/payments/{id}/status`, plus pembatalan *best-effort* Midtrans saat alih Tunai & auto-polling status 2,5 dtk. |
| 3 | **Skema Basis Data & Media Cloud** | 13 tabel domain (26 migrasi); foto menu disimpan di `storage/app/public/menus` saja (rentan hilang saat *redeploy* di hosting *ephemeral*). | **14 tabel domain (28 migrasi)** dengan tambahan tabel **`menu_images`** + layanan `MenuImageStorageService` (3 lapis: DB → Disk → *Bundled*) dan endpoint *stateless* `GET /menu-images/{path}` (ETag `304`, cache `immutable`, anti-*path traversal*). |
| 4 | **Geofencing GPS** | Rumus Haversine murni (`d <= radius`) tanpa toleransi akurasi *indoor*. | Rumus Haversine + **Toleransi Akurasi GPS Indoor** (`effectiveRadius = radius + min(accuracy, min(250, max(150, radius)))`) serta *high-accuracy GPS refinement* (`refineHighAccuracyCoords`) di peramban pelanggan. |
| 5 | **Tipografi, KDS & Keuangan** | Font tunggal `Outfit`; sumber dana pengeluaran digital `xendit_balance`. | **Tipografi ganda**: `Outfit` (Customer *mobile*) & `Oxanium` *self-hosted* (Admin, Kasir KDS, Auth); auto-notifikasi KDS saat QRIS lunas (`newlyPaidQris`); sumber dana pengeluaran `digital_balance` & rekonsiliasi **FCGateway Midtrans vs Kasir POS**. |
| 6 | **Hasil Verifikasi Otomatis** | 124 tes lulus, 2 skip, 1.230 assertions; 22 peringatan PHPStan. | **126 tes lulus, 2 skip, 0 gagal, 1.248 assertions** (~11,2 dtk) termasuk `FcGatewayIntegrationTest` (6), `AccountAndPaymentPolicyTest` (5), `MenuImagePersistenceTest` (2), `LocationAccessControlTest` (8); TypeScript `0 error`; PHPStan turun menjadi **7 peringatan minor**. |

---

## 2. Daftar File yang Sudah Disiapkan

- **File BAB III Terbaru (Siap Pakai):** `BAB_III_Perancangan_dan_Implementasi_SideOrder_Terbaru.docx`
  - Format standar skripsi A4, margin 4-4-3-3 cm, Times New Roman 12 pt, spasi 1,5.
  - **Semua 9 diagram teknis (`Gambar 3.1` s.d. `Gambar 3.9`) sudah otomatis diperbarui** dengan kualitas 300 DPI sesuai alur FCGateway Midtrans, 14 tabel (`menu_images`), dan toleransi GPS indoor.
  - **Semua 25 tabel (`Tabel 3.1` s.d. `Tabel 3.25`)** sudah diperbarui 100%.
  - **10 tangkapan layar UI yang masih valid** (`Gambar 3.10`, `3.12`, `3.13`, `3.14`, `3.18`, `3.19`, `3.20`, `3.21`, `3.22`, `3.24`) sudah terpasang rapi.
  - **6 tangkapan layar UI yang wajib diganti** (`Gambar 3.11`, `3.15`, `3.16`, `3.17`, `3.23`, `3.25`) telah dipasang sebagai **kartu slot siap ganti** agar tidak ada lagi screenshot Xendit/`sandbox_slot` yang terlewat.
- **File BAB III Lama (Backup Aman):** `BAB_III_Perancangan_dan_Implementasi_SideOrder.docx` tetap disimpan apa adanya sebagai arsip pembanding.

---

## 3. Arahan Langkah demi Langkah Mengganti BAB III di Dokumen Skripsi Utama

### Tahap A — Mengganti 6 Tangkapan Layar Wajib pada File BAB III Terbaru

Sebelum menyalin ke dokumen skripsi utama, ganti terlebih dahulu **6 slot tangkapan layar** di `BAB_III_Perancangan_dan_Implementasi_SideOrder_Terbaru.docx`.

#### Persiapan Aplikasi Lokal sebelum Mengambil Screenshot
1. Pastikan aplikasi berjalan normal (`http://sideorder.test:8000` di Laravel Herd atau jalankan `php artisan serve` + `npm run build`).
2. Pastikan di berkas `.env`, nilai `FCGATEWAY_ENABLED=true`, `FCGATEWAY_API_KEY`, `FCGATEWAY_SECRET_KEY`, `FCGATEWAY_GATEWAY=MIDTRANS`, dan `FCGATEWAY_PAYMENT_METHOD=QRIS` sudah terisi.
3. Login sebagai Administrator pada `/login`, buka `/admin/location-settings?tab=gateway`, lalu aktifkan toggle **"Izinkan Pembayaran Digital (QRIS Midtrans — FCGateway)"** dan simpan.
4. Siapkan minimal 1 pesanan QRIS berstatus `pending` (untuk `Gambar 3.16`) dan 1 pesanan QRIS berstatus `paid` (untuk `Gambar 3.17`, `3.11`, `3.23`, `3.25`).

#### Daftar 6 Screenshot Wajib & Checklist Elemen yang Harus Terlihat

| Gambar | Ukuran Layar | URL / Halaman Target | Elemen yang WAJIB Terlihat di Screenshot |
|---|---|---|---|
| **Gambar 3.11** | Desktop (`1440×900`) | `/dashboard` | Strip *GATEWAY PEMBAYARAN* menampilkan **FCGateway Midtrans** (bukan `sandbox_slot`), kartu KPI *Pembayaran Digital (QRIS)* aktif, grafik *Tracking Pendapatan*, serta tipografi **Oxanium**. |
| **Gambar 3.15** | Mobile (`430×900`, DevTools Responsive) | `/order?table={qr_token}` → Buka Modal Keranjang & Checkout | Rincian item, kolom Nama Pemesan, opsi metode **QRIS Online** dengan keterangan *"Pembayaran QRIS via Midtrans Snap"* dan tombol **"Bayar QRIS"** (bukan teks lama *"QRIS Instan"*). |
| **Gambar 3.16** *(Prioritas #1)* | Mobile (`430×900`) | Halaman redirect `https://pay.fcs.my.id/p/{short_code}` **ATAU** kartu *Menunggu Pembayaran QRIS* pada `/order/status/{order_number}` | Tampilan QRIS Dinamis Midtrans Snap via FCGateway **atau** kartu *Menunggu Pembayaran QRIS* (hitung mundur, Referensi Gateway `FCG-...`, tombol *"Buka Halaman Pembayaran QRIS"* & *"Bayar Tunai di Kasir"*). **Tidak boleh ada lagi panel Simulator / Sandbox Slot.** |
| **Gambar 3.17** | Mobile (`430×900`) | `/order/status/{order_number}` (pesanan QRIS yang sudah LUNAS) | Stepper progres (*Diterima* → *Diracik* → *Siap Saji*), kartu status **LUNAS** dengan teks *"Terverifikasi via FCGateway Midtrans"* dan kode referensi `PAY-...` terbaru (tanpa prefix lama `XND`). |
| **Gambar 3.23** | Desktop (`1440×900`) | `/admin/financial-reports?tab=rekonsiliasi` | Panel *Rekonsiliasi Gateway Pembayaran* menampilkan **FCGateway Midtrans (MIDTRANS)** vs **Kasir POS (Tunai Manual)** tanpa teks lama *(Sandbox Ready Slot)*, plus distribusi metode & tipografi **Oxanium**. |
| **Gambar 3.25** *(Prioritas #1)* | Desktop (`1440×900`) | `/admin/location-settings?tab=gateway` | Toggle *"Izinkan Pembayaran Digital (QRIS Midtrans — FCGateway)"* aktif, lencana **"Midtrans Siap"**, kotak **URL Webhook (`.../api/webhooks/fcgateway`)** lengkap dengan status `HMAC X-FC-Signature`, dan tabel 25 log transaksi terbaru. |

#### Cara Ganti Gambar 1-Klik di Microsoft Word (Tanpa Merusak Ukuran & Caption)
1. Buka `BAB_III_Perancangan_dan_Implementasi_SideOrder_Terbaru.docx` di Microsoft Word.
2. Pergi ke masing-masing kartu slot merah (`Gambar 3.11`, `3.15`, `3.16`, `3.17`, `3.23`, `3.25`).
3. **Klik kanan pada gambar slot** → pilih **Change Picture (Ubah Gambar)** → **From a File / This Device...** → pilih file `.png` screenshot terbaru Anda.
4. Dengan fitur *Change Picture*, posisi rata tengah, lebar gambar (`13,8 cm` desktop / `7,2 cm` mobile), dan caption di bawahnya **otomatis tetap rapi dan tidak bergeser**.
5. Setelah diganti, ubah kata `"Slot tangkapan layar pembaruan..."` pada baris *Sumber:* tepat di bawah caption menjadi `"Tangkapan layar implementasi aktual..."` (contoh: `Sumber: Tangkapan layar implementasi aktual aplikasi SideOrder (/dashboard, 2026)`).

#### (Opsional) Refresh 10 Screenshot Lainnya agar 100% Seragam Tipografi `Oxanium`
Ke-10 gambar berikut (`Gambar 3.10`, `3.12`, `3.13`, `3.14`, `3.18`, `3.19`, `3.20`, `3.21`, `3.22`, `3.24`) **sudah valid secara fungsional** dan bebas dari teks Xendit. Namun, apabila Anda ingin seluruh panel Admin & Kasir seragam menampilkan font terbaru **Oxanium** dan tanggal data yang sama dengan 6 screenshot baru di atas, Anda dapat menggantinya juga dengan cara *Change Picture* yang sama:
- `Gambar 3.10` (`/login`), `Gambar 3.12` (`/cashier/orders`), `Gambar 3.18` (`/admin/menus`), `Gambar 3.19` (`/admin/tables`), `Gambar 3.20` (Modal Standee QR `/admin/tables` — disarankan jika ingin URL di standee sesuai domain terbaru), `Gambar 3.21` (`/admin/orders`), `Gambar 3.22` (`/admin/financial-reports`), `Gambar 3.24` (`/admin/location-settings?tab=geofencing`).
- *Catatan:* `Gambar 3.13` dan `Gambar 3.14` (halaman Customer) tetap memakai font **Outfit**, sehingga sudah 100% sesuai versi terbaru.

---

### Tahap B — Memindahkan BAB III Terbaru ke Dokumen Skripsi Utama

1. **Buat backup** dokumen skripsi utama Anda terlebih dahulu (misal `Skripsi_SideOrder_BACKUP.docx`).
2. Buka dokumen skripsi utama, lalu **hapus seluruh isi BAB III lama** mulai dari judul `BAB III / PERANCANGAN DAN IMPLEMENTASI SISTEM` hingga sebelum `BAB IV` (jaga *Page Break / Section Break* sebelum BAB IV tetap utuh).
3. Buka `BAB_III_Perancangan_dan_Implementasi_SideOrder_Terbaru.docx`, tekan `Ctrl+A` lalu `Ctrl+C` (atau gunakan menu Word **Insert → Object → Text from File...** dan pilih file BAB III terbaru).
4. Tempelkan (`Ctrl+V` dengan opsi **Keep Source Formatting** atau sesuaikan ke *Style* Heading 1/2/3 kampus Anda jika templat skripsi menggunakan nomor heading otomatis).
5. Perbarui **Daftar Pustaka** utama di akhir skripsi:
   - Hapus referensi lama **Xendit (2026)** dan **Gamma et al. (1994)** (jika tidak dikutip lagi di bab lain).
   - Tambahkan tiga referensi baru dari *Daftar Acuan BAB III*:
     - `FCGateway. (2026). FCGateway & Midtrans Payment Gateway REST API Documentation...`
     - `Midtrans. (2026). Midtrans Snap API & Transaction Status Notification Documentation...`
     - `Krawczyk, H., Bellare, M., & Canetti, R. (1997). HMAC: Keyed-Hashing for Message Authentication (RFC 2104)...`
6. Tekan `Ctrl+A` pada dokumen skripsi utama, lalu tekan **`F9`** (atau klik kanan pada Daftar Isi, Daftar Tabel, dan Daftar Gambar → **Update Field → Update entire table**) agar seluruh nomor halaman dan judul gambar/tabel tersinkronisasi otomatis.

---

## 4. Checklist Sinkronisasi dengan BAB Lain (Wajib Dicek!)

Setelah BAB III diganti, lakukan pencarian (**`Ctrl+F`**) di **seluruh dokumen skripsi** (Abstrak, BAB I, BAB II, BAB IV, BAB V, dan Lampiran) untuk memastikan tidak ada inkonsistensi istilah lama yang tertinggal:

- [ ] Cari kata **`Xendit`** / **`xendit`** → ganti konteks pembayaran aktif di Abstrak, BAB I (Batasan Masalah / Tujuan), BAB II (Landasan Teori Payment Gateway), dan BAB V (Kesimpulan) menjadi **FCGateway & Midtrans Snap (QRIS)**.
- [ ] Cari kata **`X-CALLBACK-TOKEN`** → ganti menjadi **`X-FC-Signature` (HMAC-SHA256) + verifikasi balik `/status`**.
- [ ] Cari kata **`/payments/webhook`** atau **`/payments/orders`** atau **`/order/payment`** → ganti menjadi **`POST /api/webhooks/fcgateway`** dan alur *hosted checkout redirect* (`POST /order/checkout` → `Inertia::location(payment_url)`).
- [ ] Cari kata **`QrisPaymentModal`** atau **`sandbox_slot`** → hapus atau ganti menjadi *hosted checkout* Midtrans Snap via FCGateway & kartu *Menunggu Pembayaran QRIS* pada `/order/status/{order_number}`.
- [ ] Cari kata **`Strategy Pattern`** / **`PaymentGatewayInterface`** / **`XenditGatewayDriver`** → ganti menjadi arsitektur **Client–Service** (`FcGatewayClient` + `PaymentService`).
- [ ] Cari kata **`13 tabel`** / **`26 migrasi`** → perbarui menjadi **14 tabel domain** dan **28 berkas migrasi** (penambahan tabel `menu_images`).
- [ ] Cari kata **`124`** / **`1.230`** (angka pengujian lama) → perbarui menjadi **126 kasus uji lulus (2 dilewati by design), 0 gagal, dan 1.248 assertions** (serta 7 peringatan minor PHPStan).
- [ ] Cari kata **`xendit_balance`** → ganti menjadi **`digital_balance`** (*Saldo Pembayaran Digital*).

---

## 5. Arahan Tambahan: Jika Ingin Mengambil Bukti Transaksi Live FCGateway & Midtrans (Tabel 3.21)

Jika dosen pembimbing meminta bukti transaksi *live* (4 item pada **Tabel 3.21**) sebelum sidang:

1. **Ekspos Endpoint Webhook Publik HTTPS:**
   - Jika sudah di-*deploy* di Laravel Cloud / VPS ber-HTTPS: salin URL webhook dari `/admin/location-settings?tab=gateway` (format `https://domain-anda.com/api/webhooks/fcgateway`).
   - Jika masih uji dari laptop lokal: jalankan *tunnel* HTTPS (misal `ngrok http 8000`), perbarui `APP_URL` dan `FCGATEWAY_CALLBACK_URL` di `.env` sesuai URL HTTPS aktif, lalu jalankan `php artisan config:clear`.
2. **Pasang di Portal FCGateway:**
   - Masuk ke Portal FCGateway → menu **Pengaturan → Default Webhook URL** → tempel URL `{APP_URL}/api/webhooks/fcgateway` dan pastikan `Secret Key` sama dengan `FCGATEWAY_SECRET_KEY` di `.env`.
3. **Jalankan 1 Transaksi Uji End-to-End:**
   - Pindai QR meja → pilih 1 menu → pilih **QRIS Online** → klik **Bayar QRIS** → ambil screenshot halaman QRIS Midtrans Snap (`Tabel 3.21 #1` & `Gambar 3.16`).
   - Selesaikan pembayaran lewat Midtrans Sandbox Simulator / E-Wallet → ambil bukti bayar berhasil (`Tabel 3.21 #3`).
   - Cek **Webhook Logs** di Portal FCGateway untuk memastikan respons `HTTP 200 OK` (`Tabel 3.21 #2`).
   - Kembali ke `/order/status/{order_number}` (ambil `Gambar 3.17`), lalu ke `/dashboard`, `/admin/financial-reports?tab=rekonsiliasi`, dan `/admin/location-settings?tab=gateway` (ambil `Gambar 3.11`, `3.23`, `3.25`).
   - Setelah terverifikasi *live*, perbarui status item terkait pada **Tabel 3.24** dan **Tabel 3.25** di BAB III dari *"Belum Terverifikasi Live"* menjadi **"Lulus (Terverifikasi Live)"**.
