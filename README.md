# Arunika — perbaikan konfigurasi binding Pages

Baca **PERBAIKAN_BINDING.md** untuk langkah utama. File wrangler.jsonc sudah menjadi konfigurasi Pages yang menunjuk database D1 Anda.

Ganti wrangler.jsonc di root GitHub, commit baru ke main, dan jalankan migrations/0001.sql melalui Console D1. Build tetap npm run build, output dist. Tidak perlu mengganti frontend atau membuat database baru.

Binding DB dipasang melalui konfigurasi repository pada deployment baru. Secrets tetap di Cloudflare. Jangan hapus wrangler.jsonc yang telah diperbaiki ini.

Pengujian: npm test; build: npm run build. Backend dan rumus aset tidak diubah. Belum dideploy ke akun Anda oleh asisten.
