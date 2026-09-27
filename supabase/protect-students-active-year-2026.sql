-- GEMAR MENGAJI: kunci DELETE master siswa selama TA berjalan.
-- Tidak menghapus/mengubah satu pun baris siswa, absensi, guru, akun atau foto.
-- Terapkan pada staging dahulu. Backup produksi terbaru harus tersedia.
-- FK yang sudah VALID di lima tabel dipertahankan.
BEGIN;
DO $guard$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname IN (
     'fk_integrity_student_assessment_group_members',
     'fk_integrity_student_periodic_assessments',
     'fk_integrity_student_report_period_students',
     'fk_integrity_student_student_reports',
     'fk_integrity_student_subject_assessments'
   ) AND contype='f' AND convalidated;
  IF n <> 5 THEN
    RAISE EXCEPTION 'Perlindungan belum lengkap: % dari 5 foreign key VALID. Jangan lanjut.',n;
  END IF;
END;
$guard$;
-- Jangan mengizinkan REST API/PostgREST melakukan hard-delete terhadap master siswa.
REVOKE DELETE ON TABLE public.students FROM PUBLIC, anon, authenticated;
-- Hapus kebijakan lama yang sebelumnya mengizinkan admin/guru menghapus siswa.
DROP POLICY IF EXISTS scoped_delete ON public.students;
COMMIT;
NOTIFY pgrst, 'reload schema';
-- Verifikasi: kedua peran harus FALSE.
SELECT has_table_privilege('anon','public.students','DELETE') AS anon_boleh_hapus,
       has_table_privilege('authenticated','public.students','DELETE') AS pengguna_boleh_hapus;
