# Optimasi pemuatan web

Build produksi dijalankan dengan `npm ci --include=optional` lalu `npm run build`. Dependensi gambar harus tersedia untuk platform build. Netlify memublikasikan direktori `public-build`.

Roster Tahsin pada panel diambil saat Data Absensi dibuka. Master guru/siswa diambil saat Kelola Data dibuka. Penilaian dan rapor tetap menggunakan filter penugasan, tahun, periode, dan tingkat yang sudah tersedia. Halaman publik mengambil absensi setelah guru/kelas dipilih, bukan seluruh absensi hari itu saat masuk.

Permintaan baca yang identik dan sedang berjalan menggunakan satu promise bersama, dengan kunci berdasarkan identitas pengguna. Hasil yang sudah selesai tidak disimpan sebagai cache data permanen. Kegagalan dapat dicoba kembali; perubahan data menghapus permintaan bersama dan menandai roster/master yang perlu diperbarui.

Log absensi mengambil satu halaman baris dengan jumlah total lengkap. Filter tingkat menggunakan indeks ringkas `id,class` dari periode/guru terpilih agar nama kelas historis tetap ditemukan, lalu mengambil isi baris untuk halaman tersebut. Rekap dan ekspor memakai jalur pengambilan lengkap sesuai filter; tidak memakai sepuluh baris log sebagai sumber laporan.

HTML menu Kelola, Rapor, Penilaian, Pengaturan, Identitas, Maintenance, Presentasi, Arsip, dan kelompok dipisahkan otomatis saat build. URL fragmen memiliki hash isi. Elemen/formulir diinisialisasi setelah HTML tersedia, hanya sekali; DOM tetap dipertahankan saat berpindah menu agar draf dan pencarian tidak hilang. HTML bersama yang diperlukan saat boot tetap berada di panel utama. Tailwind juga membaca fragmen saat kompilasi.

Logo tampilan memakai WebP terpisah berukuran maksimum 192 piksel. PNG logo asli untuk rapor tetap tersedia. Kompresi PNG ikon/logo tidak mengurangi warna atau piksel dan mempertahankan transparansi. Foto guru baru dioptimalkan sebelum diunggah dengan proporsi asli, maksimum 768 piksel, memakai WebP hanya jika lebih kecil; kegagalan konversi memakai file semula. Tidak ada penambahan lazy loading foto di luar layar.

Pada pemeriksaan 7 Oktober 2026, `https://gemarmengajisdit.netlify.app` mengirim HTML/CSS dengan Brotli dan JavaScript dengan Gzip saat diminta. Respons terkompresi benar-benar didekompresi dalam pemeriksaan. Jalankan `npm run check:compression` untuk memeriksa kembali kompresi dan satu kueri absensi baca-saja dengan pagination/count; ringkasan tanpa data pribadi disimpan di `outputs/live-performance-check.json`. Jangan menambahkan header `Content-Encoding` secara manual pada file yang tidak dikompresi.

Service worker hasil build mendapat `VERSION` dengan hash seluruh aset hasil build. Perubahan aset menghasilkan versi cache baru; build identik menghasilkan versi yang sama. Cache fragmen/CSS/JS/logo berhash dapat dipakai langsung; cache lama dibersihkan melalui alur PWA yang sudah ada dan perlindungan draf tetap dipertahankan.

Verifikasi optimasi: `npm run test:performance`. Setelah build, jalankan `npm run test:panel-dom` untuk memeriksa form/tombol pada DOM hasil build. Pengujian DOM tidak menggantikan pemeriksaan visual di browser.
