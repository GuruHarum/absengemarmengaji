# Guru Tahsin otomatis, kelompok Tahfidz lintas kelas

## Aktivasi terbaru

Jika `subject-assignments.sql` sudah dijalankan, cukup jalankan
**`assessment-rosters.sql`** di Supabase SQL Editor, kemudian muat ulang panel.
Untuk pemasangan baru, urutannya: `roles.sql`, `periodic-assessments.sql`,
`subject-assignments.sql`, lalu `assessment-rosters.sql`.
Jangan menjalankan ulang migrasi lama setelah migrasi terbaru.

## Tahsin: sama dengan Gemar Mengaji

Tidak perlu membuat penugasan kelas maupun kelompok untuk Tahsin. Pilih guru,
tahun ajaran dan periode pada Penilaian Periodik, pilih Tahsin, lalu Tampilkan
Siswa. Daftar otomatis diambil dari hubungan `students.nama guru` dengan guru
pada Gemar Mengaji, termasuk seluruh kelas asal siswa tersebut.

Contoh: Pak Bagus memiliki Ahmad dari 4A, Bilal dari 4B, dan Hasan dari 4C.
Ketiganya muncul pada Tahsin Pak Bagus meskipun berasal dari kelas yang berbeda.
Siswa guru Tahsin lain tidak ikut muncul hanya karena kelas asalnya sama.

Guru dan siswa yang ditambahkan ke master akan ikut muncul setelah daftar dimuat
ulang. Tidak diperlukan penugasan baru setiap tahun untuk Tahsin. Tahun ajaran
serta periode tetap memisahkan nilai tersimpan. Penugasan Tahsin dari migrasi lama
tetap menjadi riwayat, tetapi tidak lagi menentukan daftar atau akses penilaian.
Nama guru pada master harus unik agar pemetaan akun dan akses tidak ambigu.

## Tahfidz: pilih anggota kelompok

1. Pengelola membuka **Kelompok Tahfidz** melalui sidebar.
2. Isi tahun awal ajaran dan guru Tahfidz. Nama dibuat otomatis, misalnya `Tahfidz Pak Bagus Kelas 4`; kelas 4A/4B digabung menjadi angka 4. Untuk beberapa tingkat, contohnya `Tahfidz Pak Bagus Kelas 4, 5`.
3. Pada Anggota Tahfidz, pilih **Sama dengan siswa Tahsin guru ini** bila pengampu
   dan siswanya sama. Pilih satu atau beberapa pilihan pada **Kelas siswa Tahsin yang diikutkan** (buka dropdown lalu centang kelas): Kelas 4 untuk seluruh rombel
   tingkat 4, atau 4A untuk kelas tertentu. Hanya siswa Tahsin guru tersebut pada
   kelas pilihan yang menjadi anggota; tingkat/kelas lainnya tidak ikut. Guru tersebut juga menjadi pengampu Tahfidz mereka.
   Keanggotaan disalin saat disimpan; perubahan master selanjutnya tidak mengubah
   kelompok secara otomatis. Untuk susunan berbeda, pilih **Pilih siswa sendiri**.
   Pilih siswa dari daftar. Filter kelas asal, tingkat kelas, atau cari nama siswa/
   guru Tahsin untuk mempermudah. Pilihan tetap tersimpan saat filter berganti.
   Tombol Pilih hasil filter memilih seluruh hasil, bukan semua siswa sekolah.
4. Klik Simpan Kelompok Tahfidz.
5. Untuk menilai, pilih pengampu dan Tahfidz di form penilaian lalu Tampilkan Siswa.

Satu kelompok dapat berisi siswa dari 4A, 4B, 4C, maupun tingkat lain. Guru Tahfidz
boleh sudah menjadi guru Tahsin: gunakan data guru dan akun yang sama. Tetap pilih
Ya pada Tampil pada absensi bila guru itu juga mengajar Tahsin. Guru khusus Tahfidz
memilih Tidak agar tidak muncul pada absensi.

Satu siswa hanya boleh memiliki satu kelompok Tahfidz aktif per tahun ajaran.
Bila pengampu/anggota berubah, akhiri kelompok lama lalu buat kelompok pengganti.
Nilai tetap tersimpan dan dibaca oleh pengampu baru berdasarkan ID siswa, tahun,
periode, dan pelajaran. Riwayat versi sebelumnya tetap dipertahankan.

## Migrasi dan akses

- Kelompok Tahfidz lama yang berbasis kelas disalin sekali menjadi daftar anggota
  eksplisit sesuai master saat migrasi dijalankan. Periksa anggotanya pada daftar
  kelompok, lalu akhiri/buat ulang jika susunannya berbeda.
- Anggota Tahfidz ditentukan melalui ID siswa; mengganti kelas asal tidak mengubah
  keanggotaannya. Siswa baru pada kelas tersebut tidak otomatis menjadi anggota.
- Nilai kedua pelajaran tetap mandiri. Tahfidz lama yang bertanda Perlu verifikasi
  harus diperiksa dan disimpan oleh pengelola sebelum guru dapat mengeditnya.
- Guru hanya menilai siswa sesuai hubungan Tahsin atau keanggotaan Tahfidz miliknya.
  Admin/koordinator dapat memilih semua pengampu, tetapi tidak dapat menyimpan
  nilai atas nama guru yang tidak mengampu siswa tersebut.
- Guru khusus Tahfidz membaca roster melalui RPC khusus; akses untuk mengubah
  master siswa atau absensi tidak ditambahkan. Absensi publik tetap berjalan
  seperti sebelumnya tanpa login.
- Roster Tahsin mengikuti master saat ini, termasuk saat memilih periode lama.
  Snapshot kelas/nama pada nilai tersimpan tetap dipertahankan sebagai sumber rapor.

## Sumber rapor dan pengujian

Nilai ada di `subject_assessments`, dengan kunci unik siswa/tahun/periode/pelajaran.
Kolom `scores` berisi skor/capaian; snapshot nama lengkap pengampu, siswa, dan kelas
tersimpan bersama nilai. `assignment_id` untuk Tahsin baru bernilai NULL karena
pengampunya berasal dari master. Tahfidz menggunakan ID kelompok di
`teaching_assignments` dan keanggotaan di `assessment_group_members`.

Rapor lengkap jika kedua pelajaran tersedia dan `needs_review` false. Jangan
menganggap nilai yang belum diisi sebagai nol. Fitur cetak dan bobot rapor belum
ditambahkan. Riwayat nilai ada di `subject_assessment_history`.

Uji frontend: `node --test tests/*.test.cjs`.
Uji PostgreSQL lokal menggunakan PGlite:

```
npm.cmd install --prefix .test-tools --no-save --package-lock=false @electric-sql/pglite
node --test tests/database/subject-assignments.test.cjs
```

Pengujian mencakup Tahsin tanpa penugasan, siswa lintas kelas, pemisahan guru dalam
kelas yang sama, anggota Tahfidz eksplisit, duplikasi kelompok, penghentian akses,
preservasi nilai, RLS, konflik versi, dan rollback batch.


Satu guru boleh mengampu beberapa kelompok Tahfidz pada tahun yang sama, dengan
nama kelompok berbeda dan anggota yang tidak tumpang tindih. Satu kelompok juga
boleh memuat beberapa rombel. Pada Penilaian Periodik, filter Tingkat kelas hanya
berisi angka tingkat dan dapat mencakup beberapa kelas asal.
