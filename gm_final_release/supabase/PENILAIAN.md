# Penilaian Periodik

Penilaian menggunakan empat periode per tahun ajaran: tengah dan akhir semester
ganjil, serta tengah dan akhir semester genap. Tahsin dan Tahfidz sekarang memiliki
pengampu serta penyimpanan mandiri.

## Aktivasi

Untuk pemasangan baru, jalankan `roles.sql`, `periodic-assessments.sql`, lalu
`subject-assignments.sql`, lalu `assessment-rosters.sql` secara berurutan. Jika penilaian lama sudah berjalan,
jalankan `subject-assignments.sql` jika belum pernah, lalu **`assessment-rosters.sql`**. Kolom nama lengkap juga dibuat oleh
migrasi terbaru bila belum ada.

Jangan menjalankan migrasi lama lagi setelah migrasi pengampu. Ikuti
[panduan pengampu](PENGAMPU-PENILAIAN.md) untuk pemetaan akun, penugasan rombel,
pengaturan guru khusus Tahfidz, dan verifikasi nilai lama.

## Pengisian

1. Buka Penilaian Periodik di panel.
2. Pilih tahun awal ajaran (2026 berarti 2026/2027), periode, guru, dan pelajaran.
   Akun guru hanya dapat memilih dirinya sendiri; koordinator/admin dapat memilih
   semua guru. Tahsin mengikuti master siswa Gemar Mengaji; Tahfidz mengikuti anggota kelompok aktif pada tahun ajaran tersebut.
3. Klik Tampilkan Siswa. Gunakan filter rombel, tingkat kelas (misalnya seluruh
   kelas 2), atau pencarian nama untuk mempersempit tampilan.
4. Isi pelajaran yang sedang dipilih dan klik Simpan Siswa, atau Simpan Semua.
   Tahsin dapat disimpan tanpa menunggu Tahfidz dan sebaliknya.

Tahsin: Makhraj, Tajwid, Tartil, Gharib (opsional), Buku/Jilid, dan halaman terakhir.
Tahfidz: Makhraj, Tajwid, Hafalan, surat terakhir, dan ayat terakhir.

Nilai berupa angka 0-100, maksimal dua desimal. Gharib kosong disimpan sebagai
NULL (tidak dinilai), bukan nol. Nilai wajib tidak boleh kosong. Buku/Jilid berupa
teks maksimal 80 karakter; halaman harus bilangan bulat positif. Pilihan ayat
mengikuti jumlah ayat surat yang dipilih; mengganti surat mereset pilihan ayat.
Data 114 surat (6.236 ayat) berasal dari https://api.alquran.cloud/v1/surah dan
disimpan lokal; dropdown tidak memerlukan permintaan jaringan tambahan.

## Penyimpanan dan riwayat

- Simpan Semua menyimpan semua siswa yang berubah pada konteks aktif, termasuk
  yang tersembunyi oleh filter atau berada di halaman lain. Siswa kosong yang
  belum disentuh tidak disimpan. Semua kolom wajib pelajaran itu harus lengkap.
- Satu permintaan maksimal 1.000 siswa. Seluruh batch berhasil bersama-sama;
  kegagalan satu siswa membatalkan seluruh permintaan. Untuk jumlah lebih besar,
  simpan per siswa atau muat pengampu dengan roster yang lebih kecil.
- Setiap pelajaran punya versi tersendiri. Perubahan dari tab/pengisi lain tidak
  ditimpa diam-diam; muat ulang bila server melaporkan konflik versi.
- Saat terjadi kegagalan, isian tetap tersedia di memori halaman. Mengganti konteks
  meminta konfirmasi jika ada perubahan. Browser juga diperingatkan saat halaman
  ditutup dengan isian belum tersimpan. Menutup paksa tetap bisa menghilangkan draf.
- Nilai Tahfidz lama bertanda Perlu verifikasi: pengelola harus memeriksa lalu
  menekan Verifikasi & Simpan per siswa. Guru tidak dapat mengeditnya sebelum itu.
- Nilai disimpan di `subject_assessments`; tabel gabungan lama menjadi arsip baca
  khusus pengelola. Riwayat perubahan tersedia di `subject_assessment_history`.

## Rapor

Gabungkan nilai Tahsin dan Tahfidz berdasarkan ID siswa, tahun ajaran, dan periode.
Rapor lengkap jika kedua pelajaran ada dan sudah diverifikasi. Snapshot identitas
siswa, kelas, dan pengampu disimpan bersama nilai. Kolom nama lengkap guru perlu
dilengkapi sebelum penilaian baru dibuat; jika kosong, nama tampilan dipakai.

Fitur ini menyediakan sumber data rapor. Bobot nilai, predikat, dan cetak rapor
belum ditambahkan karena rumus/formatnya belum ditentukan.
