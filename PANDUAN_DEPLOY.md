# Arunika v3 — Cloudflare Workers + D1

Aplikasi untuk **satu akun pemilik pribadi**, bukan layanan pendaftaran umum. Semua kategori versi sebelumnya tetap tersedia. Backend berada di `src/worker.js`; data utama berada di D1, bukan localStorage. Tampilan hanya dibuka setelah login dan data server berhasil dimuat.

## 1. Siapkan proyek

1. Simpan cadangan JSON dari aplikasi lama sebelum mengganti situs.
2. Ekstrak ZIP ini. Unggah isi folder proyek ke repository GitHub privat Anda. Jangan unggah `.dev.vars`, `password-hash.txt`, `.env`, `node_modules`, atau `.wrangler`.
3. Install Node.js 22 atau lebih baru (pengujian paket menggunakan Node.js 24), buka terminal dalam folder proyek.
4. Jalankan:

```sh
npm ci
npx wrangler login
npx wrangler d1 create arunika-private
```

Salin `database_id` hasil perintah ke `wrangler.jsonc`, menggantikan `GANTI_DENGAN_ID_D1`. Binding harus bernama **DB**, bukan nama lain. Jangan mengubah nama database lama atau membuat database baru saat update berikutnya.

```sh
npx wrangler d1 migrations apply arunika-private --remote
```

## 2. Username dan password

Tidak ada username/password bawaan dalam paket. Tentukan sendiri username dan password unik minimal 14 karakter (disarankan password manager). Password tidak dimasukkan ke JavaScript frontend ataupun GitHub.

```sh
npm run password
```

Ketik password pada terminal; karakter tidak ditampilkan. Script menghasilkan `password-hash.txt` lokal. Isinya hash scrypt dengan salt acak, bukan password asli. Jangan menuliskan password sebagai argumen shell.

Buat dua **Secrets**:

```sh
npx wrangler secret put AUTH_USERNAME
npx wrangler secret put AUTH_PASSWORD_HASH
```

- Untuk `AUTH_USERNAME`, masukkan username pilihan Anda, maksimal 80 karakter, tanpa spasi di awal/akhir.
- Untuk `AUTH_PASSWORD_HASH`, salin seluruh satu baris isi `password-hash.txt`. Jangan masukkan password asli ke secret ini.
- Jika diminta membuat Worker karena belum ada, izinkan pembuatan Worker dengan nama yang sama pada konfigurasi.
- Alternatif melalui Dashboard Cloudflare: Workers & Pages → Worker Arunika → Settings → Variables and Secrets → Add → **Secret**. Tambahkan kedua nama persis di atas dan deploy perubahan.
- Setelah secret terpasang, hapus file `password-hash.txt`. Simpan password aslinya di password manager.

Aplikasi menolak melayani data bila konfigurasi belum lengkap. Tidak ada endpoint pendaftaran, reset publik, atau password default.

## 3. Deploy

Konfigurasi menggunakan Workers Static Assets, **bukan upload folder public ke Pages statis/GitHub Pages**. Backend harus ikut dijalankan. `run_worker_first: true` memastikan permintaan halaman dan API melewati pemeriksaan login.

```sh
npm test
npm run deploy
```

Buka alamat HTTPS `workers.dev` dari output deploy. Setelah masuk, tambah satu aset, muat ulang, lalu buka di perangkat lain untuk memastikan data tetap sama. Uji Keluar dan pastikan `/api/portfolio` menghasilkan 401 ketika tidak login.

Untuk deployment dari GitHub, buat **Worker** dengan repository ini, root directory lokasi `package.json`, build command `npm ci`, deploy command `npx wrangler deploy`. D1 dan Secrets tetap harus diatur terlebih dahulu. Jangan aktifkan preview publik yang tidak Anda perlukan. Domain khusus dapat ditambahkan di Settings → Domains & Routes.

Konfigurasi menetapkan CPU 1.000 ms untuk hashing password. Gunakan **Workers Paid** untuk batas CPU ini; paket berbayar domain/zone Cloudflare berbeda dari Workers Paid. Pastikan paket dan penggunaan pada akun Anda sesuai. Uji login di deployment asli sebelum mengisi seluruh data; batas CPU aktual tidak dapat dipastikan dari pengujian lokal.

## 4. Migrasi dan cadangan

- Jika memakai alamat situs dan browser yang sama: login → **Pindahkan data browser lama** → konfirmasi. Data browser baru dihapus setelah server menyatakan penyimpanan berhasil.
- Jika alamat berubah: ekspor JSON dari aplikasi lama terlebih dahulu, lalu login situs baru → **Cadangan** → pilih file JSON → konfirmasi pemulihan.
- Pemulihan mengganti semua catatan server, utang, dan target. Unduh cadangan server sebelum memulihkan.
- Cadangan JSON tidak terenkripsi dan berisi informasi finansial. Simpan secara privat. Aplikasi tidak menyimpan aset baru ke localStorage; hanya harga/kurs publik yang di-cache di browser.
- Buat cadangan lewat tombol Cadangan secara berkala. Cadangan database tambahan dapat dibuat dengan `npx wrangler d1 export arunika-private --remote --output=backup.sql`; simpan hasilnya secara privat di luar repository.

## 5. Mengganti password / kehilangan akses

Jalankan `npm run password`, ganti secret `AUTH_PASSWORD_HASH`, dan deploy perubahan. Semua sesi dengan credential lama otomatis ditolak. Mengganti username juga membatalkan sesi lama. Tidak perlu menghapus database; data tidak bergantung pada nama username.

Bila batas percobaan login tercapai, tunggu sampai jendela 15 menit berakhir. Ada batas per-IP 10 percobaan dan global 100 percobaan per 15 menit, termasuk login berhasil, untuk aplikasi satu pemilik. Pemblokiran global dapat mengganggu pemilik saat serangan; aktifkan aturan keamanan tambahan pada akun Cloudflare bila diperlukan.

## 6. Perhitungan dan batas fitur

| Jenis | Perhitungan |
|---|---|
| Rumah | Nilai tanah + nilai bangunan |
| Mobil, motor, tabungan | Nilai/saldo yang Anda isi |
| Emas spot | Gram × karat / 24 × harga spot rupiah/gram |
| Emas manual | Gram × buyback per gram untuk kadar tersebut |
| Kripto | Saldo USD atau unit × harga USD, dikalikan kurs |
| Usaha | (Kas + persediaan + piutang + peralatan + aset lain − utang usaha) × porsi kepemilikan |
| Kekayaan bersih | Total aset positif − utang pribadi − defisit ekuitas usaha |
| Dana darurat | Pengeluaran pokok bulanan × target bulan |

Jangan catat aset/utang usaha kembali sebagai aset/utang pribadi yang sama. Nilai pasar adalah estimasi, bukan harga transaksi pasti. Harga/kurs diambil langsung oleh browser dari Coinbase, Gold API, dan Frankfurter. Layanan dapat gagal atau data tertunda; tanggal sumber/pengambilan dan kondisi gagal ditampilkan. Kurs bukan tick real-time. Jika harga tidak tersedia, posisi tersebut ditandai dan belum masuk total; gunakan input manual bila perlu. Angka menggunakan JavaScript Number untuk estimasi pribadi, bukan mesin akuntansi presisi desimal atau pelaporan pajak.

## 7. Proteksi yang diterapkan

- Hash scrypt N=16384, r=8, p=5 dengan salt acak; perbandingan hash constant-time.
- Token sesi acak 256-bit; database hanya menyimpan hash token. Cookie HttpOnly, Secure, SameSite=Strict, prefix __Host; maksimal 8 jam dan dicabut saat logout.
- Validasi Origin untuk semua mutasi, validasi data di backend, query SQL berparameter, batas ukuran body, rate limit atomik di D1.
- Header CSP, anti-iframe, nosniff, no-referrer, HSTS, dan no-store untuk respons aplikasi/API.
- Tidak ada pendaftaran publik. Perubahan credential membatalkan sesi lama. Sesi/kounter kedaluwarsa dibersihkan setiap hari.
- Nomor revisi mencegah penimpaan dari tab/perangkat yang masih memakai data lama. Saat konflik, ekspor cadangan jika perlu lalu muat ulang; perubahan gagal tidak diklaim tersimpan.

Ini peningkatan keamanan dibanding versi statis, **bukan jaminan kebal serangan atau audit penetrasi independen**. Belum ada MFA dalam aplikasi, enkripsi end-to-end, atau riwayat perubahan individual. Pemegang akses administratif Cloudflare/D1 dapat membaca database. Aktifkan MFA akun Cloudflare dan GitHub, batasi akses repository, dan gunakan HTTPS. Menutup tab tidak menjamin sesi langsung berakhir karena perilaku pemulihan sesi browser; gunakan tombol Keluar pada perangkat bersama.

## 8. Struktur

- `public/`: tampilan, formulir, perhitungan dan login.
- `src/worker.js`: routing, API, sesi, limit, header keamanan.
- `src/auth.js`: hash dan verifikasi password.
- `src/validate.js`: validasi data server.
- `migrations/0001.sql`: struktur database (idempotent).
- `scripts/password.mjs`: pembuat hash di terminal.
- `tests/core.test.js`: pengujian otomatis keamanan, data dan rumus.

Referensi resmi: https://developers.cloudflare.com/workers/static-assets/binding/ ; https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/
