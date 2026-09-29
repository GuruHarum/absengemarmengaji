# Akun guru, profil, dan Google

## Aktivasi pendaftaran oleh koordinator

Perubahan halaman kelompok, filter kelas, profil, dan sidebar tidak membutuhkan
migrasi tambahan. Fitur membuat akun memerlukan SQL dan Edge Function berikut:

1. Pastikan seluruh migrasi sebelumnya sampai `assessment-rosters.sql` sudah diterapkan.
2. Jalankan **`teacher-enrollment.sql`** di Supabase SQL Editor.
3. Deploy folder `supabase/functions/create-teacher-account` ke proyek Supabase.
   Dari folder proyek, dengan Supabase CLI yang sudah login dan terhubung:

```
supabase functions deploy create-teacher-account --no-verify-jwt
```

Function melakukan verifikasi token lewat `auth.getUser(token)` dan memeriksa role
admin/koordinator sendiri untuk setiap permintaan. `--no-verify-jwt` hanya mematikan
pemeriksaan gateway; fungsi tidak menerima pembuatan akun tanpa autentikasi.
`SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` tersedia sebagai secret bawaan pada
Supabase Edge Functions. Jangan salin service-role key ke `js/config.js`, HTML,
ataupun variabel frontend.

Alternatif deploy: buat Edge Function bernama `create-teacher-account` melalui
Dashboard Supabase dan sertakan dua file `index.ts` dan `handler.mjs`; nonaktifkan
verifikasi JWT gateway bila memakai signing key baru. Verifikasi dalam handler
wajib tetap dipertahankan.

4. Muat ulang panel. Buka **Kelola Data > Daftarkan Data dan Akun Guru**.
5. Pilih data guru yang sudah ada dan belum memiliki akun, atau isi data guru baru.
   Masukkan email aktif (dipakai sebagai nama pengguna login) dan password sementara
   10-128 karakter. Akun dibuat dengan role Guru, bukan role dari isian browser.
6. Sampaikan password sementara langsung secara pribadi kepada guru. Fitur ini
   tidak mengirim email/password otomatis. Akun yang dibuat pengelola ditandai
   email terkonfirmasi oleh server dan dapat langsung dipakai untuk login.
7. Guru diarahkan ke **Pengaturan Profil** untuk mengganti password sementara.
   Penanda password sementara adalah pengingat UI, bukan kebijakan pemaksaan
   perubahan password di database. Nama profil tidak mengubah nama pada master guru.

Email yang sudah terdaftar tidak dibuat ulang/reset password-nya. Pasangkan akun
tersebut lewat **Pengaturan Sistem > Akses Akun**. Jika penyimpanan master gagal,
function membatalkan akun Auth baru yang belum dipetakan. Jika status jaringan
ambigu, pesan meminta pemeriksaan Authentication/Akses Akun sebelum mencoba lagi;
function tidak menghapus akun yang sudah berhasil dipetakan.

## Profil dan password

Semua role yang sudah diberi akses dapat membuka Pengaturan Profil. Perubahan
password memakai sesi sendiri melalui Supabase Auth. Bila Secure Password Change
meminta verifikasi ulang, gunakan Kirim kode verifikasi dan masukkan kodenya.
Tidak ada password yang disimpan pada tabel guru, localStorage, atau log aplikasi.
Penyedia Auth tetap menyimpan sesi normalnya seperti sebelumnya.

## Login hanya melalui akun yang dikelola sekolah

Login/pendaftaran Google dibatalkan. Halaman login hanya menyediakan email dan
password; guru dibuatkan akun oleh koordinator/admin. Tidak ada formulir daftar
mandiri. Jika provider Google atau pendaftaran publik pernah diaktifkan di
Supabase, nonaktifkan provider Google dan Allow new users to sign up pada pengaturan
Auth agar jalur backend juga ditutup. Admin createUser pada Edge Function tetap
merupakan jalur pembuatan akun oleh pengelola. Pengaturan proyek Supabase tidak
berubah hanya dengan menghapus tombol dari website.

## Pengujian

```
node --test tests/*.test.cjs tests/database/*.test.cjs
```

Tes mencakup akses halaman menurut role, password/konfirmasi, token/role function,
rollback pembuatan akun, perlindungan akun yang sudah terpetakan saat respons
terputus, serta pembatasan RPC provisioning hanya untuk service role.
Deploy/live Auth/OAuth tetap perlu diuji setelah aktivasi pada proyek Supabase.


## Penghapusan akun dan data guru

Jalankan `account-deletion.sql` setelah migrasi akun sebelumnya, lalu deploy:

```
supabase functions deploy delete-school-account --no-verify-jwt
```

Function memvalidasi sesi dengan Auth getUser dan RPC memeriksa role pengelola.
Tombol Hapus akun ada pada Pengaturan Sistem > Akses Akun. Hapus guru pada Kelola
Data memakai proses server yang sama dan menghapus semua akun Auth yang dipasangkan
ke ID guru tersebut. Penghapusan akun saja tidak menghapus master guru. Penghapusan
siswa tetap langsung diteruskan ke tabel students di Supabase seperti sebelumnya.
Siswa, nilai, dan riwayat absensi tidak ikut dihapus saat akun/guru dihapus.

Akun sendiri/pengelola terakhir tidak dapat dihapus. Akses panel target dicabut
saat proses dimulai. Jika penghapusan Auth gagal (misalnya akun memiliki objek di
Storage), selesaikan kendalanya lalu gunakan Lanjutkan hapus pada Akses Akun, atau
tekan Hapus guru kembali. Tabel account_deletion_jobs menyimpan target untuk retry;
aplikasi tidak melaporkan sukses sebelum Auth dan penghapusan master selesai.
Guru yang sedang dihapus tidak dapat dipasangkan kembali selama proses tertunda.
Tidak ada penghapusan otomatis file Storage dalam fitur ini.

Rujukan: [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data).

## Daftar akses gagal dimuat

Frontend kini menampilkan pesan dan kode error Supabase yang sebenarnya.
Jika RPC list_school_accounts hilang atau izin eksekusinya belum tersedia,
jalankan account-access-fix.sql sebagai pemilik database di SQL Editor.
File ini hanya memulihkan fungsi pembaca daftar akun dan izin eksekusinya;
tidak mengubah akun, pemetaan guru atau role. Tidak perlu menjalankan ulang
roles.sql karena migrasi lama tersebut mengganti sejumlah kebijakan aplikasi.
Hasil cek harus authenticated_can_execute=true dan anon_can_execute=false.
Jika masih gagal, gunakan pesan rinci yang tampil untuk diagnosis berikutnya.
