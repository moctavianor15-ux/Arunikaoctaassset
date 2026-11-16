# Hasil pemeriksaan — 16 November 2026

## Lulus

- 7 kelompok pengujian otomatis (`npm test`, Node.js 24): hash password; validasi angka dan ID; penolakan API tanpa sesi dan CSRF; login/save/konflik/logout; kedaluwarsa dan pencabutan sesi akibat pergantian credential; rate limit; header dan ukuran permintaan; rumus rumah/emas/kripto/usaha/dana darurat.
- Pengujian SQL memakai SQLite dalam memori melalui adapter D1: kueri parameter dan pemeriksaan revisi atomik dijalankan, bukan hanya mock hasil tetap.
- Migrasi D1 lokal berhasil.
- Bundling Cloudflare `wrangler deploy --dry-run` berhasil dengan Wrangler 4.162.0. Tidak menerbitkan aplikasi.

## Batas verifikasi

- Belum deploy ke akun pengguna; belum menguji D1 remote, custom domain, kuota/CPU produksi, beban serentak, atau layanan harga pasar langsung pada deployment pengguna.
- Pengujian browser/visual otomatis tidak selesai: Chromium tidak dapat berjalan karena pembatasan socket pada lingkungan pengerjaan. Tidak mengklaim telah lulus uji UI end-to-end.
- Ini pengujian fungsional dan kontrol keamanan terpilih, bukan audit penetrasi atau sertifikasi keamanan.

## Pemeriksaan setelah deploy

1. Halaman utama tanpa login harus mengarah ke login; API portofolio harus 401.
2. Masuk dengan credential Anda; password salah harus ditolak.
3. Tambah aset masing-masing kategori, ubah, hapus, lalu muat ulang dan buka pada perangkat lain.
4. Buka dua tab, simpan di tab pertama, lalu simpan di tab kedua. Tab kedua harus menampilkan konflik dan tidak menimpa perubahan pertama.
5. Ekspor lalu impor cadangan uji; pastikan ada konfirmasi dan semua angka pulih.
6. Uji harga/kurs gagal: nilai belum tersedia tidak boleh dianggap harga nol yang pasti; gunakan mode manual.
7. Keluar: API kembali 401. Ganti secret password: sesi lama juga harus ditolak.
8. Periksa tampilan desktop dan ponsel, keyboard, tombol mata password, serta proses simpan lambat/gagal sebelum memasukkan seluruh data asli.
