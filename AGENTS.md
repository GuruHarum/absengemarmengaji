# Aturan pemeliharaan proyek

## Cache PWA

Pengguna mewajibkan pembaruan cache PWA pada setiap perubahan aplikasi yang akan dirilis.

- Selalu naikkan `VERSION` di `sw.js` saat mengubah HTML, JavaScript, CSS, aset, atau perilaku aplikasi. Jangan menggunakan ulang versi cache rilis sebelumnya.
- Selaraskan versi query aset yang berubah pada HTML, pemuat modul, dan daftar precache service worker.
- Jalankan `npm run build` untuk menghasilkan ulang `public-build`; jangan hanya mengubah berkas hasil build.
- Pastikan service worker hasil build memakai versi baru dan referensi aset yang tersedia, termasuk CSS Tailwind statis dengan hash terbaru.
- Jalankan pemeriksaan PWA yang relevan agar cache lama dibersihkan dan pembaruan tetap menghormati perlindungan draf pengguna.
- Sebutkan versi cache terbaru saat melaporkan perubahan aplikasi kepada pengguna.
- Build juga menambahkan hash isi aset pada `VERSION` service worker hasil build secara otomatis. Pertahankan mekanisme ini agar perubahan aset selalu menghasilkan cache berbeda, dan build identik memakai versi yang konsisten.

Perubahan dokumentasi saja tidak memerlukan perubahan cache aplikasi.
