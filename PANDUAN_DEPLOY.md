> PEMBARUAN: Ikuti PERBAIKAN_BINDING.md terlebih dahulu. wrangler.jsonc dalam paket ini SUDAH diganti menjadi konfigurasi Pages dengan ID D1 Anda. Arahan di bawah untuk menghapus wrangler.jsonc dan mengatur binding hanya melalui dashboard tidak berlaku untuk paket perbaikan ini.

# Arunika v4 — perbaikan Pages dan loading

Paket ini sekarang mendukung proyek **Cloudflare Pages** yang terlihat di rekaman Anda, melalui Pages Functions Advanced Mode. Paket v3 sebelumnya khusus Workers; memasangnya sebagai Pages dengan build `npm ci` dan output kosong tidak membangun backend.

## A. Perbaiki isi GitHub terlebih dahulu

1. Ekstrak ZIP v4, unggah ISINYA ke root repository yang terhubung dengan proyek Pages. `package.json`, `scripts/`, `src/`, `public/`, dan `migrations/` harus berada sejajar.
2. **Ganti wrangler.jsonc lama dengan file perbaikan dalam paket ini.** File baru adalah konfigurasi Pages dengan ID database Anda. Pertahankan file baru tersebut. Jangan menyisakan wrangler.toml atau wrangler.json yang berbeda.
3. Pastikan `package-lock.json` juga diganti dengan versi v4. Jangan hanya mengunggah ZIP atau folder `public` saja.
4. Jangan unggah `.dev.vars`, `password-hash.txt`, `.env`, `node_modules`, atau backup berisi data pribadi. `.gitignore` telah disediakan.

## B. Isi Settings → Build pada proyek Pages Anda

| Kolom | Isi persis |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory / Path | Kosong jika package.json ada di root repository |
| Production branch | `main` |

Cloudflare menginstall dependency dari package-lock sebelum menjalankan build. `npm run build` menyalin frontend dan membundel backend menjadi `dist/_worker.js`; `dist/_routes.json` memastikan semua request melewati backend. Build `npm ci` saja tidak membuat hasil ini.

Untuk paket v4 ini **boleh tetap menggunakan Pages**. Ini perubahan dari arahan v3 yang khusus Workers. Tidak perlu membuat proyek Pages baru atau mengganti alamat pages.dev Anda.

## C. Runtime

Settings → Runtime → Compatibility date: **2026-11-01**. Jika tersedia kolom Compatibility flags, tambahkan **nodejs_compat**. Terapkan untuk Production. Jangan menghubungkan Preview ke database pribadi produksi; nonaktifkan build preview atau gunakan database dan credential terpisah.

Hash scrypt membutuhkan CPU lebih besar dibanding situs statis. Gunakan paket Workers Paid untuk Functions bila batas CPU gratis tidak mencukupi; paket domain Cloudflare berbeda dari Workers Paid. Uji login di lingkungan produksi setelah deploy. Paket v4 tidak mengurangi kekuatan hash agar sekadar lolos batas CPU.

## D. Database D1 — wajib

1. Di Cloudflare, buka Storage & databases → D1 SQL Database → Create database, beri nama `arunika-private`. Jika database sudah ada dan berisi data, **gunakan database itu**.
2. Buka database → Console. Salin seluruh isi `migrations/0001.sql`, lalu jalankan. Skrip membuat tabel dan satu portofolio kosong bila belum ada; tidak menghapus portofolio yang sudah ada.
3. Binding DB sekarang ditetapkan pada wrangler.jsonc, menggunakan database yang terlihat dalam rekaman. Commit file perbaikan tersebut ke main, lalu tunggu deployment baru. Pengaturan binding berasal dari file ini. Preview tidak diberi akses D1 produksi.


## E. Perbaiki Secrets

Pada video, nilai `AUTH_PASSWORD_HASH` tampak berupa password biasa dan disimpan sebagai Text. Itu tidak cocok dengan verifikasi scrypt. Jangan menggunakan nilai tersebut lagi; ganti password karena sudah terlihat di rekaman.

Di komputer dengan Node.js 22+ (disarankan 24), buka terminal pada folder hasil ekstrak:

```sh
npm run password
```

Script ini tidak memerlukan npm install. Ketik password baru 14–128 karakter; tidak ditampilkan di terminal. Script membuat `password-hash.txt`. Buka file itu dan salin seluruh satu baris. Bentuknya `scrypt$...$...`; jangan salin contoh atau membuat hash sendiri.

Di proyek Pages → Settings → Variables and secrets:

| Nama | Tipe | Nilai |
|---|---|---|
| AUTH_USERNAME | Secret | Username pilihan Anda, maksimal 80 karakter |
| AUTH_PASSWORD_HASH | Secret | Seluruh isi satu baris password-hash.txt |

Hapus/ganti entri Text lama dengan nama yang sama; jangan buat dua nilai tumpang tindih. Atur pada Production. Password asli digunakan saat login, bukan ditempel sebagai AUTH_PASSWORD_HASH. Jangan kirim password/hash kepada orang lain. Setelah selesai, hapus file hash lokal dan simpan password dalam password manager.

## F. Deploy ulang

Setelah GitHub, Build, Runtime, D1 dan Secrets selesai, lakukan deploy ulang dari branch main (Retry deployment atau push commit baru). Perubahan binding/Secrets membutuhkan deployment baru agar berlaku pada versi situs baru. Buka domain Production `https://nama-proyek.pages.dev` dari halaman Deployments.

Pesan **“Pratinjau tidak tersedia”** di ChatGPT Library yang terlihat pada awal video adalah pratinjau arsip ZIP, bukan halaman aplikasi yang telah berjalan. Untuk menjalankan aplikasi, gunakan URL deployment Pages. Arsip harus diunduh/diekstrak terlebih dahulu untuk mengunggah kode ke GitHub.

## G. Uji sebelum memasukkan seluruh data

- Tanpa login, aplikasi mengarah ke halaman masuk; `/api/portfolio` menolak akses (401 jika konfigurasi lengkap).
- Jika konfigurasi belum lengkap, frontend tetap tampil dan API menampilkan pesan yang menjelaskan binding/hash/schema yang perlu diperbaiki. Tidak ada password atau data aset dalam pesan tersebut.
- Login, tambah aset, muat ulang, pastikan data tetap ada. Uji dari perangkat lain.
- Uji salah password, Keluar, dan konflik penyimpanan dari dua tab.
- Loading memiliki animasi lembut dan progres berdasarkan tahap kerja, bukan persentase byte unduhan. Data pasar tidak menahan dashboard sampai semua harga selesai diambil.
- Loading macet akan menawarkan Coba lagi, bukan menampilkan layar kosong selamanya. Pengaturan reduced motion menghentikan animasi.

## H. Data lama dan keamanan

Data aset v3 tetap kompatibel; skema D1 tidak berubah. Gunakan database yang sama. Data lokal v2 dapat dipindahkan lewat tombol Pindahkan data browser lama (alamat/browser sama) atau impor JSON di menu Cadangan (alamat berbeda). Impor mengganti portofolio server setelah konfirmasi.

Semua perhitungan aset v3 tetap dipertahankan, termasuk defisit ekuitas usaha dan utang pribadi. Harga spot/kurs adalah estimasi dan dapat tertunda; mode manual tersedia. Aset yang belum memiliki harga tidak masuk total dan ditandai. Angka memakai JavaScript Number, bukan mesin akuntansi presisi desimal.

Proteksi: hash scrypt, token sesi acak yang disimpan dalam bentuk hash, cookie HttpOnly/Secure/SameSite=Strict, sesi maksimal 8 jam, pemeriksaan Origin, rate limit, query SQL parameter, validasi server, no-store, CSP, dan proteksi konflik revisi. Username/password baru membatalkan sesi lama. Login berhasil membersihkan sesi dan kounter kedaluwarsa pada Pages karena Pages tidak memakai cron Worker.

Frontend/code tampilan dapat diakses publik; **data pribadi hanya tersedia melalui API yang memerlukan sesi**. Tidak ada data aset yang ditanam di HTML. Jangan memasukkan rahasia ke berkas public. Backup JSON tidak terenkripsi. Belum ada MFA aplikasi, enkripsi end-to-end, atau audit penetrasi independen. Pemegang akses administrasi D1 dapat membaca database. Aktifkan MFA Cloudflare/GitHub dan unduh cadangan secara berkala.

## Alternatif Workers (opsional, bukan alur Pages di atas)

Jika Anda memilih Workers, isi ID D1 di `wrangler.worker.jsonc`, jalankan migrasi dengan `npx wrangler d1 migrations apply arunika-private --remote -c wrangler.worker.jsonc`, pasang kedua Secrets dengan flag `-c wrangler.worker.jsonc`, lalu `npm run deploy:worker`. Nama Worker harus sesuai konfigurasi. Jangan menggunakan kolom Build output Pages untuk alternatif ini.

Referensi resmi:
- https://developers.cloudflare.com/pages/functions/advanced-mode/
- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/pages/functions/get-started/
