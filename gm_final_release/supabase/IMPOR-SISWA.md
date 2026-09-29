# Impor siswa berdasarkan NIS

Jalankan ulang **student-import.sql** terbaru di Supabase SQL Editor setelah
`assessment-rosters.sql`. Deploy frontend, folder `js/vendor/`, dan template Excel
`assets/template-siswa.xlsx`. Migrasi tidak mengubah siswa sampai file diimpor.

Template: **Nama, NIS, NISN, Kelas, Guru Tahsin, Guru Tahfidz**. Judul kolom tidak
membedakan huruf besar/kecil. Hanya NIS wajib diisi. Kolom lain boleh kosong.
NIS/NISN berformat teks agar nol di awal tersimpan. Maksimal 5 MB dan 1.000 baris
per file XLSX, XLS, atau CSV. Satu baris per NIS; NIS berulang dalam file ditolak.

NIS sama memperbarui siswa yang sama, termasuk nama, kelas, NISN, dan pengampu
yang diisi. Kolom kosong mempertahankan data lama. ID siswa tetap. NIS baru
membuat siswa baru. Kelas Romawi I sampai XII dikonversi, misalnya IV B menjadi 4B.
NIS/NISN disimpan di tabel terlindungi student_identifiers, tidak ditampilkan
pada daftar siswa maupun dibaca pengunjung anonim.

Pencocokan mengutamakan NIS: NIS sama memperbarui siswa yang sama; NIS
berbeda mempertahankan dua siswa, meskipun nama dan kelas sama. Indeks unik
NIS mencegah dua identitas memakai NIS sama.

Jika NIS belum tertaut, pencocokan siswa lama tanpa NIS menggunakan nama dan
kelas (mengabaikan kapitalisasi/spasi dan mengonversi angka Romawi). Nama sama
namun kelas berbeda dianggap siswa berbeda. Pengelola dapat menghapus otomatis
baris master berlebih yang namanya dan kelasnya sama serta belum memiliki NIS.
ID dengan riwayat dipertahankan; jika beberapa ID mempunyai riwayat penilaian
atau kelompok, baris dilewati untuk penggabungan riwayat terlebih dahulu.
Riwayat absensi berbasis nama/kelas tidak dihapus. Siswa yang sudah memiliki
NIS lain tidak ikut digabung. Guru biasa tidak dapat menghapus duplikat.
Untuk kenaikan kelas siswa lama tanpa NIS, tautkan NIS terlebih dahulu agar
sistem dapat mengenali perpindahannya berdasarkan NIS.

Nama kelas disimpan dengan spasi dan huruf besar di awal kata, misalnya
`kelas I UMAR BIN KHATTAB` menjadi `1 Umar Bin Khattab`. Kelas singkat seperti
`IV B` tetap disimpan sebagai `4B`, dan ditampilkan `4 B` pada kartu penilaian.
Impor ulang file untuk memperbaiki nama kelas yang sebelumnya tersimpan tanpa
spasi; sistem tidak menebak batas kata dari nama yang sudah tergabung.

Kolom Guru Tahsin/Guru Tahfidz berisi **nama lengkap**. Sistem mencocokkan
`teachers.nama_lengkap` terlebih dahulu, tanpa membedakan huruf besar/kecil atau
spasi berulang. Spasi tersembunyi Excel dan tanda baca gelar juga dinormalisasi
(misalnya `S.Pd.` dan `S Pd`). Isi nama lengkap beserta gelar yang sama;
sistem tidak menebak nama panggilan atau menghapus gelar untuk mencocokkan orang.
Nama tampilan lama dipakai hanya sebagai cadangan untuk guru
yang nama lengkapnya masih kosong. Jika ada satu guru Tahsin yang cocok dan
duplikat khusus Tahfidz, impor memakai guru Tahsin tersebut. Jika masih ada
beberapa calon guru Tahsin, impor berhenti agar tidak salah menautkan guru.
Guru yang cocok mempertahankan ID, nama tampilan, dan akun lama.
Duplikat lama tidak dihapus otomatis karena bisa terkait akun dan riwayat nilai.
Data baru mengisi nama tampilan dan nama lengkap dari nama dalam file.
Guru baru dibuat otomatis oleh impor admin/koordinator, **tanpa akun login**.
Guru Tahsin tampil pada absensi; guru khusus Tahfidz tidak. Nama yang dipakai
pada kedua pelajaran menggunakan satu data guru. Akun dibuat dan ditautkan
kemudian oleh koordinator melalui Kelola Data. Guru tetap hanya dapat mengimpor
siswa/kelas dalam aksesnya dan tidak boleh mengatur Guru Tahfidz.

Pilih tahun awal ajaran Tahfidz, misalnya 2026 untuk 2026/2027. Guru Tahfidz yang
diisi menentukan kelompok Tahfidz [nama guru] Kelas [angka]. Pergantian guru
atau tingkat memperbarui keanggotaan pada tahun terpilih. Tahun lain dan nilai
yang sudah disimpan tetap dipertahankan. Kelas kosong memakai kelompok sementara
Kelas Belum Diisi. Kesalahan akses/validasi membatalkan seluruh transaksi impor,
termasuk data guru baru dalam transaksi tersebut.

Infografik menghitung Hadir / (jumlah siswa x hari yang sudah berjalan) x 100%.
Sabtu/Minggu dihitung hingga hari ini. Tidak mengisi termasuk Alfa. Bulan yang
tidak dipilih dan tanggal mendatang dikecualikan. Gabungan bulan memakai total
hari-siswa, bukan rata-rata sederhana persentase bulanan. Rekap mengikuti daftar
siswa/kelas saat ini; impor tidak menulis ulang riwayat absensi atau snapshot nilai.
