> **PEMBARUAN 25 SEPTEMBER 2026:** Bagian lama di bawah masih mendeskripsikan alur persetujuan dan pengecualian target per siswa yang sudah tidak dipakai. Ikuti aturan dan langkah terkini di [`../PANDUAN-MELANJUTKAN.md`](../PANDUAN-MELANJUTKAN.md). Untuk perubahan database terbaru gunakan `assessment-report-v2.sql` setelah `report-cards.sql`; jangan menjalankan SQL produksi tanpa cadangan dan pengujian.

# Penilaian terstruktur dan Rapor Siswa

## Penerapan

1. Pastikan migrasi roles, periodic-assessments, teacher-full-name,
   subject-assignments, assessment-rosters dan student-import telah diterapkan.
   Jangan menjalankan ulang migrasi lama untuk memasang modul rapor.
2. Jalankan **report-cards.sql** sebagai migrasi tambahan. Migrasi dapat diulang:
   tabel/referensi yang sudah ada tidak ditimpa. Tidak mengimpor contoh siswa,
   guru, NIS, nilai, target individual, pejabat ataupun tanggal dari Excel/foto.
3. Deploy admin.html, perubahan JS/CSS dan seluruh modul report-*, progress-form.
   Frontend capaian baru memerlukan RPC baru dalam migrasi yang sama.
4. Admin/koordinator mengisi profil/logo sekolah, pejabat, gelar, NIY, tempat,
   serta KKM dan target untuk masing-masing tahun/periode/tingkat di Pengaturan.
   Nilai 75 hanya usulan isian; tidak aktif sampai disimpan. Pilihan pengecualian
   siswa menyimpan target terpisah berdasarkan ID siswa.
5. Guru memeriksa capaian lama dan menyimpan nilai. Tahsin teks bebas yang tidak
   pasti tetap ditampilkan untuk diverifikasi. Nilai Hafalan lama tidak otomatis
   dianggap Tartil: verifikasi aspek ketiga, pilih juz dan isi ayat awal sebenarnya.
6. Koordinator membuka Rapor Siswa, memilih tahun, PTS/PAS, semester dan tingkat.
   Muat rapor. Rombel/siswa hanya memfilter pratinjau. Ajukan, revisi atau setujui
   siswa terpilih setelah pemeriksaan. Semua siswa harus lengkap dan disetujui
   sebelum Download Rapor PDF seluruh tingkat; tidak ada PDF resmi parsial.

## Audit sumber dan keputusan

Referensi diperiksa langsung dari INPUT NILAI PTS SMT 1 2026-2027.xlsm:
- TAHSIN = Lembar2 F18:F23: BUKU, JILID, AL-QUR'AN, FINISHING, SYAHADAH,
  TAKHASSUS. BUKU_1 S2:V61, BUKU_2 W2:Z61, BUKU_3 AA2:AD61 berisi 180
  pasangan buku/halaman (1?60). Kunci materi memakai dua angka, bukan gabungan
  string yang dapat ambigu.
- Jilid ditemukan pada AE2:AG3: JUZ 27 dan 4 (Bacaan dengung ikhfa).
  Tidak menambahkan Gharib/Tajwid/Shifatul Huruf sebagai pilihan jilid karena
  tidak ditemukan sebagai pilihan referensi pada rentang tersebut.
- SURAT_30 sampai SURAT_8 dipetakan ke nomor pada QURAN_SURAHS yang sudah ada.
  Review dan tes adalah jenis capaian terpisah, bukan surat baru. Nomor dan
  jumlah ayat tidak diubah. Nama rapor mengikuti referensi, alias bisa dikelola.
- PRINT_RAPORT memakai SUM/AVERAGE empat aspek Tahsin dan tiga aspek Tahfidz.
  KELAS 2 dan 5 memakai AVERAGE(Tn,Vn), sehingga melewatkan Tajwid; modul memakai
  ketiga aspek sesuai PRINT_RAPORT. Gharib null dikecualikan, nol disertakan.
- Grade memakai nilai sebelum pembulatan; rata-rata ditampilkan satu desimal.
  Batas 80 masuk Jayyid Jiddan dan redaksi pemahaman baik.
- Deskripsi memakai AA1:AL1 dan logika A22/A35, termasuk pengecualian
  Takhassus dan Syahadah. Catatan A38/Y1 memakai periode aktif, tanpa memotong
  nama siswa seperti MID(...,1,50) pada contoh Excel.
- Kolom AC/AD sheet kelas menggunakan sebagian konstanta tingkat dan indeks
  teks target yang berbeda antar-sheet; aplikasi memakai target yang diatur.
  Buku dibandingkan nomor lalu halaman. Al-Qur'an nomor surat lalu ayat.
  Jilid dibandingkan materi yang sama; lintas Jilid tidak ditebak setara buku.
  Tahfidz memakai urutan kurikulum 30,29,28,27,26,25,1?8; surat pada juz 30
  bergerak dari An-Naas ke An-Naba, juz lainnya mengikuti urutan surat.
  Review sesudah surat, tes sesudah review. Juz di luar urutan ini diberi
  BELUM DINILAI untuk ketercapaian, bukan klaim target tercapai.

## Data dan keamanan

subject_assessments tetap sumber nilai. Nama field tahfidz_hafalan dipertahankan
untuk kompatibilitas, dengan tahfidz_aspect_confirmed sebagai konfirmasi makna
Tartil/Kelancaran. RPC tetap mempertahankan pengampu, kunci baris, versi dan
subject_assessment_history. Capaian baru berada pada scores JSONB.

Rapor menggabungkan pelajaran menurut student_id, tahun dan periode. RPC rapor
serta tabel student_reports/student_report_history hanya dapat dibaca koordinator,
termasuk penolakan admin. Pengaturan dapat dikelola admin/koordinator. Tidak ada
service-role key pada frontend. Seluruh data diambil 250 baris per batch.

Persetujuan menyimpan snapshot identitas, NIS/NISN, nilai, pengampu, KKM/target,
referensi, profil/logo dan pejabat. Perubahan nilai membuat PERLU REVISI dan
mengarsipkan snapshot persetujuan sebelumnya. Perubahan pengaturan tidak menimpa
snapshot yang sudah disetujui. approved_at disimpan terpisah dari tanggal cetak
PDF yang selalu dihitung ulang dalam zona Asia/Jakarta.

Daftar siswa per periode dicatat pada report_period_students saat koordinator
pertama kali memuat tingkat tersebut, termasuk siswa yang belum dinilai.
Perpindahan kelas setelah pencatatan tidak mengeluarkan siswa tanpa nilai dari
daftar periode itu. Kelas historis memakai snapshot penilaian/persetujuan jika tersedia. Data lama
sebelum fitur ini yang belum punya penilaian/snapshot tidak memiliki riwayat kelas;
aplikasi hanya bisa memakai master saat ini. Periksa daftar siswa untuk periode
lama sebelum menyetujui, terutama jika pernah terjadi kenaikan/perpindahan kelas.

## PDF dan pengujian

Pratinjau dan PDF menggunakan ReportPDF.render yang sama. Canvas A4 memakai
font browser agar teks Indonesia/Arab materi tampil; jsPDF yang sudah digunakan
aplikasi menggabungkan gambar halaman. PDF berupa gambar halaman, bukan teks
selektabel. Satu siswa tepat satu halaman. Urutan rombel, nama, ID stabil; ID
berulang ditolak. Tidak memotong teks: isi yang terlalu panjang untuk batas
keterbacaan menampilkan kesalahan dan membatalkan download.

Logo diambil dari school_profile.logo_url; URL harus dapat dimuat dengan CORS
agar gambar bisa dimasukkan ke PDF. Data contoh pejabat dari foto tidak dipakai.

Perintah pengujian:
- node --test tests/*.test.cjs
- node --v8-pool-size=1 --wasm-num-compilation-tasks=1 --test tests/database/report-cards.test.cjs
- Uji browser lokal: outputs/student-import-20260924/check-assessment-new.cjs
- Uji PDF lokal: outputs/student-import-20260924/check-report.cjs

PDF QA memakai dua siswa sintetis, termasuk nama panjang, dua rombel, guru
berbeda, NISN kosong, Gharib kosong dan catatan panjang. PDF dibuka ulang untuk
memeriksa dua halaman A4; kedua halaman dirender untuk pemeriksaan visual.
Migrasi telah diuji dengan PGlite lokal, belum dijalankan ke Supabase online.


## Kelola data dan impor

Impor memakai satu file siswa yang sekaligus menautkan Guru Tahsin/Guru Tahfidz.
Pemilih jenis impor telah dihapus; Excel XLS/XLSX tetap didukung pada unggahan
berikutnya dan template tetap tampil. Label tahun menjadi Tahun awal ajaran.
Tab Kelola Data: Siswa, Guru Tahsin, Guru Tahfidz. Penanda attendance_enabled
menentukan kelompok tampilan, tanpa menyalin akun atau data guru: true/null
masuk Tahsin (termasuk guru kedua pelajaran), false khusus Tahfidz. Form tambah
guru mengikuti tab terpilih sebagai nilai awal; pengeditan memakai ID yang sama.

## Jika muncul permission denied for table report_settings

Pesan ini berarti role koneksi database belum mempunyai izin SELECT pada tabel,
bukan karena pengaturan rapor kosong. Jalankan report-permissions-fix.sql melalui
SQL Editor sebagai pemilik database setelah report-cards.sql. Perbaikan dapat
diulang dan tidak mengubah isi pengaturan. Hasil pemeriksaan: authenticated_can_read
true dan anon_can_read false. RLS tetap membatasi pengaturan ke admin/koordinator;
guru hanya dapat membaca referensi materi. Setelah itu muat ulang panel dengan akun
admin/koordinator. Jika pesan tetap sama, keluar dan masuk kembali untuk memperbarui
sesi login; izin authenticated tidak berlaku untuk koneksi anonim.
