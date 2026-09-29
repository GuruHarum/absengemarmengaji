-- GEMAR MENGAJI 2026/27 — TAHAP 13
-- Penghapusan konsisten dari web: kelompok yang benar-benar dihapus harus hilang dari DB beserta anggota.
-- Histori akademik TIDAK dihapus diam-diam. Jika kelompok sudah mempunyai nilai, hard-delete diblokir dan gunakan "Akhiri".
-- Jalankan setelah SQL 05, 08, 09. Uji di staging terlebih dahulu.
BEGIN;
SET LOCAL lock_timeout='5s';

DO $preflight$
BEGIN
 IF to_regclass('public.teaching_assignments') IS NULL OR
    to_regclass('public.assessment_group_members') IS NULL OR
    to_regprocedure('public.gm_manage_learning_group(text,text,uuid,text,text,integer,text[])') IS NULL THEN
   RAISE EXCEPTION 'STOP: pasang migrasi kelompok 05/08/09 dahulu';
 END IF;
END $preflight$;

-- Pastikan relasi anggota -> kelompok mempunyai cascade. Ini hanya menghapus anggota ketika induk kelompok benar-benar dihapus.
DO $fk$
DECLARE c record;
BEGIN
 FOR c IN
   SELECT conname
   FROM pg_constraint
   WHERE conrelid='public.assessment_group_members'::regclass
     AND contype='f'
     AND confrelid='public.teaching_assignments'::regclass
 LOOP
   EXECUTE format('ALTER TABLE public.assessment_group_members DROP CONSTRAINT %I', c.conname);
 END LOOP;
 ALTER TABLE public.assessment_group_members
   ADD CONSTRAINT assessment_group_members_assignment_id_fkey
   FOREIGN KEY (assignment_id) REFERENCES public.teaching_assignments(id) ON DELETE CASCADE;
END $fk$;

CREATE OR REPLACE FUNCTION public.gm_learning_group_delete_preview(p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE a public.teaching_assignments%rowtype;
        member_count integer;
        subject_score_count integer;
        legacy_score_count integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('admin','koordinator')) THEN
   RAISE EXCEPTION 'Hanya pengelola dapat menghapus kelompok';
 END IF;
 SELECT * INTO a FROM public.teaching_assignments WHERE id=p_group_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Kelompok tidak ditemukan'; END IF;

 SELECT count(*) INTO member_count FROM public.assessment_group_members WHERE assignment_id=p_group_id;
 SELECT count(*) INTO subject_score_count FROM public.subject_assessments WHERE assignment_id=p_group_id;
 -- periodic_assessments adalah format lama dan tidak mempunyai assignment_id; bila ada data yang mungkin terkait, jangan menebak/hapus otomatis.
 SELECT count(*) INTO legacy_score_count
 FROM public.periodic_assessments p
 WHERE p.academic_year_start=a.academic_year_start
   AND coalesce(p.teacher_id,'')=coalesce(a.teacher_id,'')
   AND p.student_id IN (SELECT m.student_id FROM public.assessment_group_members m WHERE m.assignment_id=p_group_id);

 RETURN jsonb_build_object(
   'id',a.id,'subject',a.subject,'name',a.class_name,'teacher_id',a.teacher_id,'year',a.academic_year_start,
   'active',a.active,'members',member_count,'subject_assessments',subject_score_count,'legacy_periodic',legacy_score_count,
   'can_delete',(subject_score_count=0 AND legacy_score_count=0)
 );
END $f$;
REVOKE ALL ON FUNCTION public.gm_learning_group_delete_preview(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gm_learning_group_delete_preview(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.gm_delete_learning_group_verified(p_group_id uuid,p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE a public.teaching_assignments%rowtype; members integer; scores integer; legacy integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('admin','koordinator')) THEN
   RAISE EXCEPTION 'Hanya pengelola dapat menghapus kelompok';
 END IF;
 IF p_confirmation IS DISTINCT FROM ('HAPUS '||p_group_id::text) THEN
   RAISE EXCEPTION 'Konfirmasi kedua salah';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text));
 SELECT * INTO a FROM public.teaching_assignments WHERE id=p_group_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Kelompok tidak ditemukan atau sudah dihapus'; END IF;
 SELECT count(*) INTO members FROM public.assessment_group_members WHERE assignment_id=p_group_id;
 SELECT count(*) INTO scores FROM public.subject_assessments WHERE assignment_id=p_group_id;
 SELECT count(*) INTO legacy FROM public.periodic_assessments p
 WHERE p.academic_year_start=a.academic_year_start
   AND coalesce(p.teacher_id,'')=coalesce(a.teacher_id,'')
   AND p.student_id IN (SELECT m.student_id FROM public.assessment_group_members m WHERE m.assignment_id=p_group_id);
 IF scores>0 OR legacy>0 THEN
   RAISE EXCEPTION 'STOP: kelompok memiliki nilai/penilaian historis. Gunakan Akhiri agar riwayat tidak hilang';
 END IF;
 -- assessment_group_members akan terhapus oleh FK ON DELETE CASCADE.
 DELETE FROM public.teaching_assignments WHERE id=p_group_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Penghapusan kelompok gagal'; END IF;
 RETURN jsonb_build_object('deleted_group_id',p_group_id,'deleted_members',members);
END $f$;
REVOKE ALL ON FUNCTION public.gm_delete_learning_group_verified(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gm_delete_learning_group_verified(uuid,text) TO authenticated;

-- Audit cepat fungsi penghapusan siswa yang wajib ada; fungsi ini sudah menghapus relasi siswa secara eksplisit.
DO $student_guard$
BEGIN
 IF to_regprocedure('public.gm_delete_student_verified(bigint,text,integer,text)') IS NULL THEN
   RAISE EXCEPTION 'STOP: fungsi penghapusan siswa terverifikasi belum ada';
 END IF;
END $student_guard$;

COMMIT;
NOTIFY pgrst,'reload schema';

-- VERIFIKASI BACA SAJA
SELECT
 to_regprocedure('public.gm_learning_group_delete_preview(uuid)') IS NOT NULL AS preview_kelompok_siap,
 to_regprocedure('public.gm_delete_learning_group_verified(uuid,text)') IS NOT NULL AS hapus_kelompok_siap,
 to_regprocedure('public.gm_delete_student_verified(bigint,text,integer,text)') IS NOT NULL AS hapus_siswa_siap;
