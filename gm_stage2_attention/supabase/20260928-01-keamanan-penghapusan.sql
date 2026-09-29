-- Jalankan di STAGING terlebih dahulu setelah backup dan audit.
-- Tidak menghapus data ketika file ini dijalankan; hanya memasang RPC dan RLS.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Orang tua tetap SELECT hari ini dan INSERT publik. Hanya perubahan/hapus dibatasi.
REVOKE UPDATE, DELETE ON public.attendance FROM anon, PUBLIC;
DROP POLICY IF EXISTS public_today_update ON public.attendance;
DROP POLICY IF EXISTS public_today_delete ON public.attendance;
-- Semua perubahan siswa melalui RPC yang memeriksa seluruh relasi.
REVOKE DELETE ON public.students FROM authenticated, anon, PUBLIC;
DROP POLICY IF EXISTS scoped_delete ON public.students;
CREATE POLICY scoped_delete ON public.students FOR DELETE TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.gm_student_delete_preview(p_student_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r public.students%rowtype; total_att integer; total_scores integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='koordinator')
 THEN RAISE EXCEPTION 'Hanya koordinator dapat menghapus siswa'; END IF;
 SELECT * INTO r FROM public.students WHERE id=p_student_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Siswa tidak ditemukan'; END IF;
 SELECT count(*) INTO total_att FROM public.attendance WHERE student_id=p_student_id;
 SELECT count(*) INTO total_scores FROM public.subject_assessments WHERE student_id=p_student_id::text;
 IF EXISTS(SELECT 1 FROM public.attendance WHERE student_id IS NULL AND student=r."nama siswa"
 AND class=r.kelas AND teacher=r."nama guru") THEN
  RAISE EXCEPTION 'Masih ada absensi tanpa ID berpotensi milik siswa ini. Tautkan dahulu'; END IF;
 RETURN jsonb_build_object('id',p_student_id,'name',r."nama siswa",'class',r.kelas,
   'attendance',total_att,'subject_assessments',total_scores);
END $f$;
REVOKE ALL ON FUNCTION public.gm_student_delete_preview(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gm_student_delete_preview(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.gm_delete_student_verified(
 p_student_id bigint,p_expected_name text,p_expected_attendance integer,p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r public.students%rowtype; total_att integer; rel record;
 known text[]:=ARRAY['attendance','assessment_group_members','report_period_students',
 'periodic_assessments','subject_assessments','student_reports','student_identifiers',
 'student_class_assignments'];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='koordinator')
 THEN RAISE EXCEPTION 'Hanya koordinator dapat menghapus siswa'; END IF;
 IF p_confirmation IS DISTINCT FROM ('HAPUS '||p_student_id::text)
 THEN RAISE EXCEPTION 'Konfirmasi kedua salah'; END IF;
 PERFORM pg_advisory_xact_lock(20260928,p_student_id::integer);
 SELECT * INTO r FROM public.students WHERE id=p_student_id FOR UPDATE;
 IF NOT FOUND OR r."nama siswa" IS DISTINCT FROM p_expected_name THEN
  RAISE EXCEPTION 'Data siswa berubah. Ulangi pratinjau sebelum menghapus'; END IF;
 -- Tabel lain yang belum dikenal tidak boleh menyebabkan penghapusan parsial.
 FOR rel IN SELECT table_name FROM information_schema.columns
  WHERE table_schema='public' AND column_name='student_id'
  AND table_name <> ALL(known) LOOP
  RAISE EXCEPTION 'STOP: tabel % mempunyai student_id dan perlu audit manual sebelum menghapus',rel.table_name;
 END LOOP;
 SELECT count(*) INTO total_att FROM public.attendance WHERE student_id=p_student_id;
 IF total_att IS DISTINCT FROM p_expected_attendance THEN
  RAISE EXCEPTION 'Jumlah absensi berubah (%). Ulangi pratinjau',total_att; END IF;
 IF EXISTS(SELECT 1 FROM public.attendance WHERE student_id IS NULL
  AND student=r."nama siswa" AND class=r.kelas AND teacher=r."nama guru") THEN
  RAISE EXCEPTION 'Masih ada absensi tanpa ID yang berpotensi milik siswa ini'; END IF;
 -- Hapus jejak revisi khusus siswa berdasarkan snapshot sebelum induknya.
 DELETE FROM public.subject_assessment_history h
  USING public.subject_assessments a
  WHERE h.assessment_id=a.id AND a.student_id=p_student_id::text;
 DELETE FROM public.student_report_history
  WHERE previous_record->>'student_id'=p_student_id::text;
 DELETE FROM public.subject_assessments WHERE student_id=p_student_id::text;
 DELETE FROM public.periodic_assessments WHERE student_id=p_student_id::text;
 DELETE FROM public.student_reports WHERE student_id=p_student_id::text;
 DELETE FROM public.report_period_students WHERE student_id=p_student_id::text;
 DELETE FROM public.assessment_group_members WHERE student_id=p_student_id::text;
 DELETE FROM public.attendance WHERE student_id=p_student_id;
 DELETE FROM public.student_class_assignments WHERE student_id=p_student_id;
 DELETE FROM public.student_identifiers WHERE student_id=p_student_id;
 DELETE FROM public.students WHERE id=p_student_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Penghapusan siswa gagal'; END IF;
 RETURN jsonb_build_object('deleted_student_id',p_student_id,'deleted_attendance',total_att);
END $f$;
REVOKE ALL ON FUNCTION public.gm_delete_student_verified(bigint,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gm_delete_student_verified(bigint,text,integer,text) TO authenticated;
COMMIT;
