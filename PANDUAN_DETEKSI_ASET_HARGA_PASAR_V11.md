# Arunika V11 — Deteksi spesifikasi otomatis & opsi penawaran pasar terbaru

## Yang berubah

- Kolom **Nama dan spesifikasi barang** dapat mendeteksi model dari teks: contoh `Fortuner 2012 MT` -> Toyota Fortuner, 2012, manual; `iPhone 18 Pro 512 GB` -> Apple iPhone 18, Pro, 512 GB. Deteksi adalah interpretasi teks, BUKAN verifikasi keberadaan model/katalog resmi.
- Setelah klik `Minta saran AI`, backend menggabungkan proyeksi yang ada, kondisi, dan harga pembanding bila tersedia. Hasil AI tidak langsung mengganti nilai dalam kekayaan bersih tanpa pilihan pengguna.
- Jika model AI tidak tersedia, menampilkan **Perhitungan rumus Arunika (BUKAN AI)** dan TIDAK menyediakan tombol `Pakai nilai AI`. Saldo bank/Buku Kas tidak disentuh.
- Opsional `Cari penawaran terbaru` memakai Cloudflare Web Search API melalui binding `AI`, dan memfilter hasil agar sesuai model, tahun, transmisi, varian, dan penyimpanan. Menyertakan sumber dan tanggal evaluasi. Hasil dari cuplikan pencarian, bukan bukti harga pasar final/transaksi.
- TIDAK ada pencarian tersembunyi di mode gratis.

## Cara instal di GitHub dari Arunika V10

1. Buat cadangan data Arunika sebelum perubahan.
2. Gunakan ZIP `Perubahan_Saja_V11` lalu unggah isi file dengan path persis; **tambahkan** 2 file baru `src/asset-identity.js` dan `src/market-search.js`.
3. Perbarui `src/valuation-ai.js`, `src/worker.js`, `src/validate.js`, `public/ai-valuation.js`, `public/index.html`, `public/style.css`, `tests/core.test.js`, `wrangler.jsonc`, `wrangler.worker.jsonc` dari paket.
4. Cloudflare Pages Production: Build Command `npm run build`, output `dist`. Dependencies dipasang dari `package-lock.json`. Periksa Build logs dan status deployment.
5. Pastikan binding D1 `DB` dan Workers AI `AI` pada lingkungan Production **tetap ada**. Jangan ganti username, password hash, atau database.
6. Sesudah deployment, login, hard refresh `Ctrl + Shift + R`. Periksa `/api/ai/status` (memerlukan sesi login), harus `"version":"v11-2026-11-16"`.
7. Klik `Uji AI sungguhan` — hal ini mengonsumsi sebagian kuota Workers AI. Coba satu aset.

## Mode tanpa biaya pencarian web (default)

Tidak memerlukan konfigurasi baru: `MARKET_SEARCH_ENABLED` tidak perlu dibuat. AI memakai alokasi Workers AI Cloudflare yang tersedia; setelah habis dapat dikenai biaya sesuai paket atau menghasilkan fallback; lihat Workers AI → Usage. Estimasi tanpa data pasar terbaru bukan harga realtime.

## Mode penelusuran penawaran terbaru (opsional, berpotensi dikenakan biaya)

**Bukan fitur gratis yang termasuk dalam kuota Workers AI.** Cloudflare Web Search API memerlukan AI Gateway credits atau kunci penyedia pencarian yang tersimpan di Gateway.

1. Konfigurasi AI Gateway `default` dan kredensial/kredit melalui Cloudflare. Baca https://developers.cloudflare.com/web-search/how-to-use/ .
2. Cloudflare Pages → Proyek Arunika → Settings → Variables and Secrets, lingkungan **Production**, tambahkan Text variable `MARKET_SEARCH_ENABLED` dengan value persis `true`. Jangan buat binding AI kedua. Deployment ulang jika perlu.
3. Pilih di formulir: `Cari penawaran terbaru (AI Gateway credits / mungkin berbayar)`, centang persetujuan biaya dan klik Hitung.
4. Backend membatasi paling banyak 10 percobaan mode live per hari (00:00 UTC), maksimum 1 pemanggilan Web Search per klik, hasil di-filter. Jika kredit habis, spesifikasi kurang jelas, atau kurang dari 2 penawaran relevan, mode ini tidak menghasilkan angka pasar baru; proyeksi/AI biasa tetap tersedia.
5. Untuk menonaktifkan, hapus `MARKET_SEARCH_ENABLED` atau set `false`. Tanpa flag ini **tidak mungkin terjadi pemanggilan websearch dari Arunika**.

## Keterangan penting

- Real-time = melakukan pencarian **pada saat tombol ditekan**, bukan feed otomatis per detik. Indeks mesin pencarian bisa terlambat; harga listing bisa kedaluwarsa, harga kredit, atau tidak akurat. Perlu verifikasi manual sebelum menjual atau membeli.
- Nama, spesifikasi, dan kondisi aset yang sedang dinilai dapat dikirim ke Workers AI. Mode live juga mengirimkan query model/varian ke penyedia pencarian. Data rekening, saldo bank, dan Buku Kas tidak dilibatkan.
- Aplikasi tidak bisa menjamin 100% bebas error jaringan/API. Saat model gagal terdapat fallback bertanda jelas; saat sesi habis login ulang, dan saat D1 gagal lakukan pengecekan deployment.
- Contoh `iPhone 18 Pro 512 GB` hanya contoh format yang dideteksi; ketersediaan produk resmi atau harga pasarnya **belum diverifikasi oleh aplikasi**.

## Pengujian yang telah dilakukan

- 50 tes Node.js lulus termasuk kompatibilitas data lama, CSRF, login, fallback, deteksi Fortuner MT & iPhone 18 Pro, filtering penawaran, pemisahan kuota/cost.
- Uji simulasi Chromium pada desktop dan HP berhasil (API/model/pencarian ditiru dalam test). **Belum ada panggilan langsung ke AI/Web Search Production**.
- Build esbuild lokal belum terverifikasi: dependensi npm tidak dapat dipasang dalam lingkungan pengujian karena timeout. Pastikan `npm ci && npm run build` berhasil pada Cloudflare Pages sebelum mengandalkan hasil Production.
