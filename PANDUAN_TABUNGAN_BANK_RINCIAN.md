# Arunika – Tabungan bank dan rincian kekayaan bersih

Pembaruan: 16 November 2026. Kode dasar berasal dari ZIP `Arunikaoctaassset-main (2).zip` yang dilampirkan pengguna.

## Fitur baru

1. **Tabungan bank** sebagai kategori aset tersendiri. Setiap rekening mempunyai nama catatan, nama bank, jenis rekening (tabungan/giro/deposito/lainnya), saldo rupiah, serta empat digit terakhir rekening secara opsional. Nomor rekening lengkap tidak diminta. Beberapa rekening dapat ditambah, diubah, dan dihapus. Nilainya masuk ke komposisi aset, total aset, dan kekayaan bersih.
2. **Tombol “Lihat rincian kekayaan bersih”** di kartu hijau ringkasan. Setelah ditekan, rincian ditampilkan **per kategori dan per aset**, termasuk nilai tanah/bangunan, ringkasan kripto, rekening bank, dan nilai usaha sesuai kepemilikan. Di bagian bawah terdapat perhitungan: **jumlah aset bernilai positif − utang pribadi − ekuitas usaha negatif = kekayaan bersih**. Posisi emas/kripto yang menunggu harga/kurs diberi keterangan dan tidak dianggap mempunyai nilai nol final.
3. **Ringkasan “Saldo tabungan bank”** yang menampilkan total semua rekening dan jumlah rekening. Tombol “Lihat rekening bank” langsung membuka filter kategori bank di Portofolio.
4. **Perhitungan dana darurat tetap seperti sebelumnya.** Sumber dana darurat tidak otomatis digabungkan dari rekening bank agar uang yang sama tidak terhitung dua kali.

**PENTING:** Jika Rp5 juta telah dicatat di kategori Tabungan Bank, jangan memasukkan saldo Rp5 juta yang sama ke kategori Tabungan Darurat, Tabungan Konsumtif, atau kas usaha. Masukkan saldo satu kali saja agar total aset tidak mengganda. Saat ini saldo bank diisi manual: aplikasi tidak mengakses rekening atau menghubungkan API bank.

## File yang diperbarui

Ubah hanya enam file ini di repositori GitHub, dengan mempertahankan lokasi foldernya:

- `public/index.html` — tombol rincian dan panel saldo tabungan bank.
- `public/style.css` — tampilan rincian, mobile, dan panel tiga kolom.
- `public/app.js` — perhitungan kekayaan bersih, kategori bank, formulir aset, dan interaksi.
- `public/portfolio.js` — formulir rekening bank dan detail rekening yang dimasker.
- `src/validate.js` — validasi sisi server untuk data rekening bank.
- `tests/core.test.js` — pengujian rekening, penyimpanan, rumus dan keamanan HTML.

File panduan ini opsional. Nama path tidak boleh diubah. **Jangan hanya mengganti file `public/app.js`: `src/validate.js` harus ikut diperbarui**, kalau tidak, server akan menolak penyimpanan rekening bank.

## Cara memasang jika Cloudflare Pages terhubung ke GitHub

1. **Sebelum mengubah apa pun**, buka Arunika versi online → tombol **Cadangan** → **Unduh cadangan**. Simpan secara privat dan jangan unggah cadangan JSON berisi informasi keuangan ke GitHub.
2. Buka repositori GitHub proyek Arunika Anda, lalu ganti **enam file** di atas pada path yang sama dengan file dari ZIP perubahan saja. Anda boleh mengunggahnya satu per satu melalui Edit/Upload files, memastikan GitHub tidak membuat folder bersarang ganda.
3. Commit perubahan, lalu periksa deployment baru di Cloudflare Pages.
4. Pengaturan build untuk kode ini: perintah build **`npm run build`** dan direktori output **`dist`**, dengan instalasi dependensi dari `package-lock.json` melalui langkah build Cloudflare. Jika memakai build command di dashboard `npm run build`, Pages umumnya menyiapkan `npm install` lebih dahulu sesuai konfigurasi framework/build.
5. Setelah deployment berhasil, muat ulang situs secara paksa (**Ctrl+Shift+R**). Tambah satu rekening untuk menguji, dan periksa rincian kekayaan bersih.

Jika Anda menggunakan **Direct Upload** dan bukan integrasi GitHub, file source di ZIP tidak boleh langsung dijadikan output Pages: jalankan `npm ci`, `npm run build`, lalu unggah folder `dist` yang dihasilkan.

## Database dan Secrets

- **Tidak ada migrasi D1 baru.** Rekening bank disimpan dalam JSON portofolio yang sudah ada. Versi data tetap `1`; catatan lama tidak perlu diubah.
- **Tidak perlu menambahkan Variable/Secret Cloudflare baru.** Binding `DB`, `AUTH_USERNAME`, dan `AUTH_PASSWORD_HASH` yang sudah berfungsi tetap digunakan.
- **Jangan ubah** password/secret, database ID, atau konfigurasi binding yang saat ini sudah berhasil.
- Selama deployment menunjuk ke D1 **yang sama**, catatan keuangan yang sudah ada tetap berada di database. Sebelum memperbarui apa pun, cadangkan datanya.
- Pembaruan ini tidak mengubah modul login, Worker route, migrasi D1, atau konfigurasi Wrangler.

## Pengujian

- `npm test` → **14 tes lulus**, termasuk tes API D1 yang disimulasikan menggunakan SQLite, validasi bank, perhitungan kekayaan bersih, dan sanitasi HTML.
- Simulasi browser Chromium terpisah → tampilan desktop dan mobile, membuka rincian, memfilter bank, menambah rekening, mengubah saldo, menghapus rekening, serta pemeriksaan overflow mobile: **lulus**, tanpa exception JavaScript.
- Simulasi browser menggunakan data buatan; belum melibatkan data finansial pengguna dan bukan uji deploy ke akun Cloudflare produksi.

## Perlu diketahui

Aplikasi menampilkan estimasi harta berdasarkan angka yang Anda input. Harga emas, kurs, dan sebagian kripto mengikuti perilaku fitur lama, bisa belum tersedia atau menggunakan hasil tersimpan. Bank tidak terhubung otomatis sehingga saldo perlu diperbarui saat berubah. Ekuitas usaha negatif dipisahkan dari total aset positif agar perhitungan kekayaan bersih transparan.
