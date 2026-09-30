# Perapian panel admin dan guru

Perubahan tampilan bersama berada di `css/panel-layout.css`. Aturan hanya berlaku
pada layar (`@media screen`), sehingga aturan cetak tidak ikut ditimpa. File ini
menyamakan jarak panel, kontrol formulir, fokus keyboard, warna mode gelap,
susunan filter tablet, serta susunan kartu analitik/presentasi di ponsel.
ID elemen, event handler, modul aplikasi, dan database tidak diubah.

## Build

Jalankan `node scripts/build-static.cjs`. Publikasikan isi `public-build`.
Folder tersebut merupakan hasil build; perubahan dilakukan pada sumber di root.

Build menggabungkan kelompok stylesheet lokal dengan urutan yang sama dan tetap
mempertahankan posisi inline style, metadata, dan stylesheet eksternal.
Nama bundle mengandung hash konten. Admin dan guru berbagi bundle yang sama
jika isinya sama. Permintaan CSS lokal pada masing-masing halaman turun dari
19 menjadi 7 setelah build. Ini mengurangi jumlah permintaan, bukan mengurangi
jumlah aturan CSS; waktu muat aktual belum diukur melalui browser.

## Peluang optimasi berikutnya berdasarkan kode saat ini

- Pemisahan `admin.html` dan `guru.html` sudah ada. Pertahankan loader guru yang
  lebih kecil; memecah setiap menu menjadi HTML terpisah perlu mempertahankan
  sesi, filter, navigasi, dan draf penilaian.
- `js/panel-start.js` masih memuat modul rapor, impor, akun, dan pengaturan saat
  awal masuk. Modul tersebut dapat dimuat saat menu pertama kali dibuka setelah
  dependensi dan inisialisasi `panelready` diaudit. Jangan sekadar menghapusnya
  dari daftar loader karena handler global dapat dibutuhkan menu lain.
- Konsolidasikan CSS revisi lama per komponen setelah tersedia pengujian visual
  semua menu, mode terang/gelap, cetak, dan ukuran layar. Menghapus aturan yang
  terlihat duplikat tanpa memeriksa cascade bisa mengubah tampilan modul lain.
- Ukur permintaan data setiap perpindahan menu sebelum menambahkan cache data.
  Cache harus dibatalkan setelah penyimpanan agar nilai dan absensi tetap terbaru.

## Verifikasi

Build berhasil. Sepuluh pengujian bundle, interaksi admin, tab guru, pemisahan
panel, dan penilaian lulus. Pengujian bundle memeriksa urutan CSS, batas inline
style, keutuhan body HTML, dan hasil build berulang.

Empat pengujian di `tests/sidebar.test.cjs` gagal karena mock `classList` tidak
menyediakan `remove`; file sidebar dan pengujiannya tidak diubah dalam pekerjaan
ini. Verifikasi visual dan alur login langsung belum dilakukan karena browser
tidak tersedia pada sesi ini.
