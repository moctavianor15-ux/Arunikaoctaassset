# Arunika v4 — Pages + backend + loading

**Mulai dari PANDUAN_DEPLOY.md.** Paket v4 menyesuaikan proyek Cloudflare Pages yang sudah dibuat. Login, D1 dan perhitungan tetap tersedia.

Pengaturan Pages:
- Framework: None
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: kosong jika package.json di root
- Runtime: compatibility date 2026-11-01, nodejs_compat
- Binding D1: DB; jalankan migrations/0001.sql
- Secrets: AUTH_USERNAME dan AUTH_PASSWORD_HASH (hasil `npm run password`, bukan password asli)

**Hapus wrangler.jsonc v3 dari repository.** Konfigurasi alternatif Workers sekarang bernama wrangler.worker.jsonc.

```sh
npm ci
npm test
npm run build
```

`dist/_worker.js` adalah backend Pages; jangan mengunggah hanya public/ atau menetapkan output kosong. Unggah isi ZIP ke repository GitHub, bukan ZIP sebagai satu file. Deploy ulang sesudah mengganti binding/Secrets.

Tidak ada credential produksi/default dalam paket. Lihat HASIL_PENGUJIAN.md untuk batas verifikasi.
