# Arunika — Aset Pribadi v3

Paket lengkap frontend + backend Cloudflare Workers + D1 untuk satu pemilik. Login username/password, penyimpanan server lintas perangkat, perlindungan sesi, validasi server, konflik revisi, dan migrasi cadangan versi sebelumnya.

**Mulai dari [PANDUAN_DEPLOY.md](PANDUAN_DEPLOY.md).** Backend: `src/worker.js`. Tidak cukup mengunggah `public/` ke hosting statis. Buat D1 dan dua Secrets, lalu deploy Worker. Tidak ada password default atau credential produksi di paket.

```sh
npm ci
npm test
```

Node.js 22+; pengujian menggunakan Node.js 24. Lihat `HASIL_PENGUJIAN.md` untuk cakupan pengujian dan batasnya.
