# ARUNIKA v5 — HP, Elektronik & Estimasi Perubahan Nilai

Dibangun di atas versi Tabungan Bank + Rincian Kekayaan Bersih, bukan source lama.
Tidak mengubah nama binding D1, AUTH_USERNAME, AUTH_PASSWORD_HASH, cookies, sesi, autentikasi, atau struktur tabel D1.

## Fitur baru

1. Kategori **HP & smartphone**: daftarkan perangkat satu per satu (nama/merek/model), harga perolehan, tanggal beli, dan arah/persentase perubahan nilai tiap tahun.
2. Kategori **Elektronik lainnya**: laptop, komputer/PC, tablet, televisi, kamera, audio/speaker, kulkas, mesin cuci, konsol game, jam pintar, atau lainnya. Catat per barang.
3. **Proyeksi otomatis**: dapat berupa penyusutan, kenaikan, atau tetap. Pilihan **manual** tersedia bila ada harga jual terkini yang lebih akurat.
4. Opsi **proyeksi nilai kendaraan** (mobil/motor) dan **rumah** (tanah naik, bangunan menyusut), hanya diaktifkan jika dipilih pengguna. Entri lama tetap memakai mode manual.
5. Panel **Perubahan nilai aset** dan detail setiap aset dalam **Rincian kekayaan bersih**, lengkap dengan selisih terhadap nilai dasar dan persentasenya.
6. HP/elektronik dihitung **sekali** sebagai nilai aset terkini; selisih naik/susut tidak ditambahkan atau dikurangkan lagi dari total aset.

## Rumus (estimasi dari asumsi, bukan harga jual riil)

Durasi = hari antara tanggal dasar dan tanggal lokal saat aplikasi dibuka / 365,2425.

- Penyusutan: `nilai sekarang = nilai dasar x (1 - tarif/100)^durasi`.
- Kenaikan: `nilai sekarang = nilai dasar x (1 + tarif/100)^durasi`.
- Tetap: `nilai sekarang = nilai dasar`.
- Rumah otomatis: `nilai tanah dasar x (1 + kenaikan tanah/100)^durasi + nilai bangunan dasar x (1 - penyusutan bangunan/100)^durasi`.
- Selisih = nilai sekarang - nilai dasar. Angka selisih hanya sebagai informasi dan tidak dihitung ganda.

Contoh sederhana: HP harga beli Rp10.000.000, penyusutan 20% per tahun: setelah sekitar setahun proyeksi kira-kira Rp8.000.000. Kenaikan nilai bisa dipilih untuk barang tertentu, tetapi tarif harus ditentukan sendiri.

**PERHATIAN:** Tidak ada pengambilan harga pasar otomatis dari marketplace. HP/elektronik adalah barang yang nilainya sangat bergantung pada kondisi fisik, usia, baterai, aksesori, dan tren pasar. Perbarui atau pilih mode manual bila memiliki harga jual riil yang lebih baik. Nilai di aplikasi bersifat perkiraan dan bukan dasar akuntansi pajak/pelaporan resmi. Untuk aset perusahaan, jangan catat lagi sebagai aset pribadi jika sudah tercatat dalam komponen aset usaha.

## Upload hanya file yang berubah

Ganti **keenam** file berikut di repository GitHub (struktur folder harus sama):

- `public/index.html`
- `public/style.css`
- `public/app.js`
- `public/portfolio.js`
- `src/validate.js`
- `tests/core.test.js`

Lalu commit dan periksa deployment Cloudflare Pages pada environment **Production** berhasil. **Jangan** ubah file `.env`/`wrangler.jsonc`/binding D1. Tidak ada migrasi D1. File `PANDUAN_HP_ELEKTRONIK_PENILAIAN_OTOMATIS.md` opsional untuk dokumentasi.

Sebelum penggantian: login ke situs, klik **Cadangan > Unduh cadangan** untuk menyimpan portofolio yang sudah ada. Simpan backup di tempat pribadi karena memuat data keuangan.

Setelah deploy: tekan `Ctrl+Shift+R`, buka **Tambah aset**, pilih **HP & smartphone** atau **Elektronik lainnya**. Isi harga & tanggal, lalu tarif perubahan tahunan. Cek bagian **Perubahan nilai aset** dan **Lihat rincian kekayaan bersih**. Tidak perlu mengulang setup username/hash password.

Jika repo Anda masih memakai versi sebelum fitur Tabungan Bank sebelumnya, paket v5 ini **sudah menyertakan** seluruh perubahan Tabungan Bank tersebut; pastikan keenam file diganti bersama-sama.

## Pengujian

- `node --test tests/*.test.js`: 19 pengujian berhasil (termasuk login, D1, tabungan bank, aset lama, HP/elektronik, proyeksi dan data invalid).
- Pemeriksaan `node --check` pada frontend & validator.
- Simulasi browser Chromium: tambah/edit HP, tambah TV, ubah mobil ke mode otomatis, rincian aset, total rekening bank, layout desktop/HP, dan tidak ada error JavaScript dalam skenario yang diuji.
- Belum dideploy ke akun Cloudflare Production pengguna; deployment perlu dilakukan oleh pemilik repository.

## Keterbatasan & keamanan

- Tidak ada perubahan saldo bank langsung; bukan koneksi ke API bank.
- Estimasi ulang dilakukan di browser saat halaman dibuka atau dirender, dan saat kembali ke tab. Nilai yang tersimpan di D1 adalah dasar, tanggal, dan tarif asumsi sehingga dapat dihitung kembali ketika hari berubah.
- Mode manual untuk catatan lama tidak mengubah nilai yang sudah ada sampai pengguna mengeditnya.
- Cloudflare Pages menggunakan `npm run build` agar file frontend + worker terbangun ke `dist/`; bila deployment Direct Upload, upload **dist**, bukan source mentah.
