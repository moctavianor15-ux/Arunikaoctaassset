# Arunika v6 — Buku Kas dan Saldo Rekening Bank Otomatis

## Apa yang ditambahkan?

1. Menu **Buku Kas** di navigasi serta panel catatan uang masuk/keluar.
2. Catat **pemasukan**, **pengeluaran**, dan **transfer antar rekening bank**, lengkap tanggal, kategori, nominal, dan catatan.
3. Pilih tampilan **harian**, **mingguan (Senin–Minggu)**, **bulanan**, **tanggal khusus**, atau **seluruh waktu**. Tersedia filter jenis dan rekening.
4. Ringkasan total masuk, keluar, selisih kas, dan transfer sesuai filter. Riwayat bisa diubah, dihapus, dan diekspor sebagai **CSV**.
5. **Saldo terkini tiap rekening** dihitung otomatis dari saldo dasarnya dan seluruh transaksi; koreksi transaksi juga langsung memperbarui saldo serta kekayaan bersih.

## Cara memasang tanpa mengganti seluruh GitHub

Cadangkan data dengan tombol **Cadangan → Unduh cadangan** terlebih dahulu. Setelah itu, ganti/unggah hanya file berikut, **dengan struktur folder persis sama**:

- `public/index.html` (ganti)
- `public/style.css` (ganti)
- `public/app.js` (ganti)
- `public/cashflow.js` (**file baru**)
- `src/validate.js` (ganti)
- `src/worker.js` (ganti)
- `tests/core.test.js` (ganti; untuk tes regresi)

Simpan dengan **Commit changes** di GitHub. Periksa Cloudflare Pages → Deployments: tunggu sampai **Production: Success** dan pastikan domain yang digunakan adalah versi Production terbaru. Segarkan browser dengan `Ctrl + Shift + R`.

**Tidak perlu** menambah Secrets/Variables baru dan **tidak perlu** migrasi Cloudflare D1. Data disimpan bersama portofolio dalam kolom JSON `portfolio.data` yang sudah ada. Source lengkap juga disediakan jika dibutuhkan.

Jika build GitHub gagal, cek `package.json` dan pengaturan Build Command (`npm run build`) dan Build Output (`dist`) berdasarkan konfigurasi deployment Anda yang sudah berjalan. Jangan memublikasikan password/hash/kunci rahasia di repository.

## Cara mencatat transaksi

1. Pastikan punya setidaknya 1 aset **Tabungan bank** di Portofolio. Isi **saldo dasar** (saldo saat mulai memakai fitur), nama bank, dan hanya 4 digit terakhir rekening (opsional).
2. Buka **Buku Kas**. Klik **+ Uang masuk** untuk pemasukan, **− Uang keluar** untuk pengeluaran, atau **Transfer bank** bila ada minimal 2 rekening.
3. Isi tanggal, jumlah, rekening, kategori, dan catatan opsional. Simpan.
4. Saldo pada kartu rekening/total bank/kekayaan bersih terhitung otomatis. Transaksi dapat diubah dan dihapus dari riwayat.
5. Pilih Harian/Mingguan/Bulanan/Tanggal khusus/Semua waktu serta filter rekening untuk rekap.
6. Klik **Ekspor CSV** untuk mengunduh daftar transaksi pada periode dan filter yang sedang aktif.

### Rumus

`Saldo akhir rekening = Saldo dasar + total pemasukan − total pengeluaran − total transfer keluar + total transfer masuk`.

`Total tabungan bank di kekayaan bersih = jumlah saldo akhir seluruh rekening bank`.

`Selisih arus kas periode = uang masuk dalam periode − uang keluar dalam periode`. Transfer internal **tidak** dihitung sebagai penghasilan ataupun beban, sehingga tidak mengubah total kekayaan bersih.

**Perhatikan:** Saldo dasar rekening bukan saldo terbaru untuk ditulis ulang setiap kali ada transaksi. Isi saldo rekening **saat mulai** menggunakan buku kas. Jika Anda mengubah saldo dasar, nilai terkini ikut bergeser—jangan mencatat transaksi yang sama lagi. Aset pada kategori Dana Darurat/Tabungan Konsumtif yang sebenarnya berada di rekening bank yang sama tidak boleh dicatat dua kali sebagai aset terpisah. Pengalihan dana dari aset usaha ke bank pribadi membutuhkan penyesuaian pencatatan usaha agar tidak ganda.

## Perlindungan data dan batasan

- Data transaksi disimpan pada Cloudflare D1 yang sudah terhubung dan hanya bisa dibaca lewat sesi login yang valid.
- Saldo akhir tidak boleh negatif; jika pengubahan/penghapusan transaksi menimbulkan saldo negatif, penyimpanan ditolak.
- Rekening yang sudah memiliki riwayat transaksi tidak bisa langsung dihapus; riwayat harus dibereskan dahulu.
- Input tanggal transaksi dibatasi pada tanggal sekarang atau sebelumnya di browser. Riwayat yang ditambahkan belakangan tetap berpengaruh pada saldo terkini.
- Batas maksimum 5.000 transaksi per portofolio; ekspor CSV tersedia. Ekspor/backup berisi informasi finansial pribadi; simpan secara aman.
- Ini adalah **buku kas manual**, belum sinkronisasi otomatis via API bank, belum mendukung saldo tunai tersendiri, dan bukan pembukuan akuntansi double-entry formal. Tidak mencatat perubahan histori menurut saldo penutupan tiap tanggal; tanggal dipakai untuk rekap transaksi.

## Pengujian

Pengujian Node.js `node --test tests/core.test.js` mencakup kompatibilitas data lama, transaksi bank, saldo, transfer, validasi input, konflik revisi Cloudflare D1, serta pengujian keamanan sederhana. Simulasi Chromium pada desktop dan mobile juga telah menjalankan alur tambah/ubah/hapus transaksi, filter periode, ekspor CSV, penghapusan rekening dengan histori, dan pemeriksaan error JavaScript.

Pengujian masih **lokal/simulasi**; deployment Production dan akses nyata ke database Cloudflare pengguna tidak dijalankan dari lingkungan pengembangan ini. Jalankan build/deploy sesuai alur GitHub Anda dan buat cadangan sebelum penggunaan data sungguhan.
