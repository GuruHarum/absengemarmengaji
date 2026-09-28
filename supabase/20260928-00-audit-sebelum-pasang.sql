-- BACA SAJA. Jalankan STAGING dan PRODUKSI secara terpisah sebelum memasang paket.
-- Periksa total absensi dan kelengkapan tiga ID. Produksi dapat berbeda dari baseline staging.
SELECT COUNT(*) AS total_absensi,
 COUNT(*) FILTER(WHERE student_id IS NOT NULL AND class_id IS NOT NULL AND teacher_id IS NOT NULL) AS tiga_id_lengkap,
 COUNT(*) FILTER(WHERE student_id IS NULL OR class_id IS NULL OR teacher_id IS NULL) AS id_belum_lengkap
FROM public.attendance;
-- Hak publik yang efektif: UPDATE/DELETE harus false SETELAH migrasi 01.
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='attendance' AND grantee IN ('anon','PUBLIC')
ORDER BY grantee,privilege_type;
SELECT policyname, roles, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='attendance' ORDER BY policyname;
-- Hindari menjalankan migrasi penghapusan jika ada tabel terkait baru yang belum diaudit.
SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND column_name='student_id' ORDER BY table_name;
-- Ketahui apakah fungsi dan tabel prasyarat tersedia.
SELECT to_regclass('public.student_identifiers') IS NOT NULL AS ada_identitas,
 to_regclass('public.student_class_assignments') IS NOT NULL AS ada_penempatan,
 to_regclass('public.assessment_group_members') IS NOT NULL AS ada_anggota_tahfidz,
 to_regclass('public.subject_assessment_history') IS NOT NULL AS ada_riwayat_penilaian,
 to_regclass('public.student_report_history') IS NOT NULL AS ada_riwayat_rapor;
