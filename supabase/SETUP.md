# Aktivasi role Supabase

Panel admin memerlukan migrasi role. Halaman publik tidak memerlukan akun.
Jika roles.sql versi lama sudah diterapkan, jalankan public-attendance.sql untuk membuka akses publik.
Untuk instalasi baru, roles.sql terbaru sudah mencakup izin publik tersebut.
Migrasi belum dijalankan pada database live oleh Codex.

1. Cadangkan database/policy. Jalankan `roles.sql` di SQL Editor proyek yang sama dengan `js/config.js`.
   Migrasi mengganti policy tabel aplikasi yang disebutkan, memisahkan akses publik (daftar guru/siswa dan absensi hari ini) dari akses panel,
   dan membatasi perubahan bucket `teachers`. Audit juga view/RPC lama: jangan biarkan jalur lain
   menggunakan SECURITY DEFINER atau view pemilik untuk mengekspos data tanpa pemeriksaan role.
2. Buat akun awal melalui Supabase Authentication (atau gunakan akun yang sudah ada).
   Jalankan SQL berikut dengan UUID akun pengelola yang benar (bukan ID guru):

   ```sql
   insert into public.user_roles (user_id, role, teacher_id)
   values ('GANTI-DENGAN-UUID-AUTH-USER', 'koordinator', null)
   on conflict (user_id) do update set role = excluded.role, teacher_id = null;
   ```

3. Deploy seluruh file frontend bersamaan. Login pengelola, buka **Pengaturan Sistem → Akses Akun**.
   Masukkan email yang sudah terdaftar di Authentication, pilih role dan nama guru.
   Form memetakan akun yang sudah ada; tidak membuat akun/password baru.
4. Saat memetakan guru, kelas yang diizinkan diambil dari `students.kelas` milik guru tersebut.
   Bila belum ada siswa, pengelola perlu mengisi data siswa lebih dahulu. Simpan ulang pemetaan
   untuk menyinkronkan izin kelas setelah pengelola menambah/memindahkan kelas.
5. Uji dua akun guru yang berbeda serta akun admin/koordinator di sesi browser terpisah.

## Matriks akses

| Akses | Admin / Koordinator | Guru | Tanpa login |
|---|---|---|---|
| Data di panel admin | Semua | Miliknya, pada kelas yang ditugaskan | Ditolak |
| Halaman publik / absensi hari ini | Terbuka | Terbuka | Terbuka: baca, isi, edit, hapus absensi hari ini |
| Kelola siswa | Semua | CRUD siswa sendiri di kelas yang ditugaskan | Ditolak |
| Kelola guru | Semua | Baca profil sendiri, ubah URL foto | Ditolak |
| Infografik, pengaturan, maintenance | Semua | Ditolak | Ditolak |
| Menetapkan role/pemetaan akun | Semua | Ditolak, termasuk lewat REST/RPC langsung | Ditolak |
| Profil publik sekolah & status maintenance | Baca | Baca | Baca |

Guru tidak dapat mengubah nama identitas guru atau membuat/menghapus guru, karena data lama
masih menghubungkan guru/siswa/absensi lewat nama. Dua guru bernama sama harus dibedakan
sebelum dipetakan; fungsi pemetaan menolak nama guru duplikat. Migrasi jangka panjang ke ID
guru/siswa pada semua tabel direkomendasikan. Foto guru dapat diubah dengan URL; unggah bucket
sekolah dikhususkan pengelola.

## Verifikasi wajib di proyek Supabase

- Guru A di panel (client authenticated): query/filter `teachers`, `students`, `attendance` tidak mengembalikan data Guru B.
- Guru A: insert/update siswa ke guru/kelas lain ditolak. Edit/hapus absensi Guru B ditolak.
- Guru A: update `user_roles`, kedua RPC pengelola, perubahan profil sekolah/maintenance ditolak.
- Akun tanpa pemetaan ditolak dari panel; jangan mengisi role dari `user_metadata` yang dapat diubah pengguna.
- Tanpa login: daftar guru/siswa dapat dibaca dan absensi hari ini dapat diisi, diedit, dihapus.
- Anon tidak dapat mengubah master guru/siswa, membaca riwayat hari lain, atau mengubah pengaturan/role.
- Saat maintenance aktif, perubahan absensi publik ditolak. Zona tanggal publik: Asia/Jakarta.
- Pengelola masih dapat CRUD, mencetak, mengunduh PDF dan mengubah settings/maintenance.
- Pemetaan yang dicabut/diubah membatasi akses database segera; pengguna login ulang untuk UI terbaru.

Dokumentasi: https://supabase.com/docs/guides/database/postgres/row-level-security

## Pemisahan halaman

- `index.html` + `js/public-app.js`: pemilihan guru/kelas dan absensi publik. Tidak memuat panel,
  laporan, modal login, `access.js`, ataupun `admin.js`.
- `js/public-client.js`: client anonim tanpa penyimpanan sesi. Login panel di tab lain tidak membatasi
  halaman publik dan tidak dihapus. Sesi panel hanya dipakai untuk tautan menuju panel.
- `admin.html`: login dan role wajib; inisialisasi lewat `access.js` dan `panel-start.js`.
- `login.html`: tempat masuk ke panel.
- `maintenance.html`: tetap publik.

Sesuai kebutuhan, data yang disajikan halaman absensi publik memang dapat diakses pengunjung anonim,
termasuk pengguna yang juga memiliki akun guru. Pembatasan role bukan pembatasan terhadap akses publik
tersebut; role membatasi operasi panel dan riwayat yang tidak dipublikasikan.

## Penilaian Periodik dan koordinator sebagai guru

Jalankan migrasi tambahan `periodic-assessments.sql` setelah role terpasang.

Untuk kolom nama lengkap guru pada Kelola Data, jalankan `teacher-full-name.sql`.
Admin/koordinator dapat mengisi nama lengkap beserta gelar untuk rapor tanpa
mengubah nama guru yang dipakai sebagai penghubung absensi. Kolom ini opsional
agar data lama tetap dapat digunakan; lengkapi sebelum menerbitkan rapor.
Panduan lengkap: [PENILAIAN.md](PENILAIAN.md). Koordinator boleh memiliki `teacher_id`
tanpa kehilangan akses pengelola. Guru mendapat menu Penilaian Periodik untuk muridnya sendiri.


### Pemisahan pengampu Tahsin / Tahfidz

Setelah migrasi penilaian awal, jalankan `subject-assignments.sql` sebagai migrasi
terakhir. Ikuti [panduan pengampu](PENGAMPU-PENILAIAN.md) untuk menambahkan guru
khusus Tahfidz, memetakan akun, mengatur penugasan, dan memverifikasi nilai lama.
Jangan menjalankan ulang migrasi role/penilaian lama setelah migrasi pengampu.


### Koreksi roster: Tahsin otomatis dan Tahfidz lintas kelas

Jalankan `assessment-rosters.sql` SETELAH `subject-assignments.sql`. Tahsin tidak
memerlukan penugasan manual; siswa otomatis mengikuti guru pada Gemar Mengaji.
Hanya Tahfidz menggunakan kelompok beranggotakan siswa yang dipilih. Lihat
[panduan terbaru](PENGAMPU-PENILAIAN.md). Jangan menjalankan ulang migrasi lama
setelah migrasi ini.


### Akun guru dan profil

Untuk membuat data + akun guru langsung dari panel, jalankan `teacher-enrollment.sql`
dan deploy Edge Function `create-teacher-account`. Ikuti [panduan akun/profil](AKUN-PROFIL.md).
Login Google dan pendaftaran mandiri dibatalkan. Gunakan akun email/password yang dibuatkan oleh pengelola; lihat panduan untuk menutup provider/signup di Supabase jika sebelumnya diaktifkan.


Untuk penghapusan guru sekaligus akun Supabase Auth, jalankan `account-deletion.sql`
dan deploy `delete-school-account`. Lihat bagian penghapusan di [panduan akun](AKUN-PROFIL.md).

### Impor siswa Excel/CSV dan identitas rapor

Jalankan `student-import.sql` setelah migrasi yang sudah terpasang, lalu deploy
frontend terbaru termasuk folder `js/vendor` dan template Excel di `assets`.
Lihat [panduan impor siswa](IMPOR-SISWA.md). NIS/NISN tersimpan terpisah dari
data publik. NIS wajib menjadi kunci impor; kolom yang diisi memperbarui siswa
dengan NIS yang sama, sementara kolom kosong mempertahankan data lama. Jalankan
ulang `student-import.sql` terbaru untuk mengaktifkan pembaruan kelas/pengampu
dan pembuatan data guru otomatis tanpa akun login.
