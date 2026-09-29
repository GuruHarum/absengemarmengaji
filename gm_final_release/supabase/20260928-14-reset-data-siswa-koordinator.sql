-- GEMAR MENGAJI 2026/27 — TAHAP 14
-- Reset tahunan dari Pengaturan Sistem.
-- HANYA menghapus data siswa dan data operasional terkait.
-- TIDAK menghapus teachers, auth.users, user_roles, foto guru, school_profile,
-- pengaturan rapor, referensi materi/surat, maintenance, atau struktur database.
-- Uji di staging dan BACKUP produksi sebelum digunakan.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.gm_student_data_reset_preview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE unknown_tables text[]; unknown_assignments text[]; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='koordinator') THEN
   RAISE EXCEPTION 'Hanya koordinator dapat menjalankan reset data siswa';
 END IF;
 SELECT array_agg(table_name ORDER BY table_name) INTO unknown_tables
 FROM information_schema.columns
 WHERE table_schema='public' AND column_name='student_id'
   AND table_name <> ALL(ARRAY[
     'attendance','assessment_group_members','report_period_students','periodic_assessments',
     'subject_assessments','student_reports','student_identifiers','student_class_assignments'
   ]);
 IF unknown_tables IS NOT NULL THEN
   RAISE EXCEPTION 'STOP: ditemukan tabel student_id yang belum diaudit: %', array_to_string(unknown_tables, ', ');
 END IF;
 SELECT array_agg(table_name ORDER BY table_name) INTO unknown_assignments FROM information_schema.columns
 WHERE table_schema='public' AND column_name='assignment_id'
   AND table_name <> ALL(ARRAY['assessment_group_members','subject_assessments','subject_assessment_history']);
 IF unknown_assignments IS NOT NULL THEN
   RAISE EXCEPTION 'STOP: ditemukan tabel assignment_id yang belum diaudit: %', array_to_string(unknown_assignments, ', ');
 END IF;
 result := jsonb_build_object('counts',jsonb_build_object(
   'students',(SELECT count(*) FROM public.students),
   'attendance',(SELECT count(*) FROM public.attendance),
   'subject_assessments',(SELECT count(*) FROM public.subject_assessments),
   'periodic_assessments',(SELECT count(*) FROM public.periodic_assessments),
   'student_reports',(SELECT count(*) FROM public.student_reports),
   'report_period_students',(SELECT count(*) FROM public.report_period_students),
   'teaching_assignments',(SELECT count(*) FROM public.teaching_assignments),
   'assessment_group_members',(SELECT count(*) FROM public.assessment_group_members),
   'student_identifiers',(SELECT count(*) FROM public.student_identifiers),
   'student_class_assignments',(SELECT count(*) FROM public.student_class_assignments),
   'subject_assessment_history',(SELECT count(*) FROM public.subject_assessment_history),
   'student_report_history',(SELECT count(*) FROM public.student_report_history)
 ),'preserved',jsonb_build_array('teachers','auth.users','user_roles','teacher_photos','school_profile','report_settings','report_reference','maintenance_settings','quran_surahs'));
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION public.gm_student_data_reset_preview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gm_student_data_reset_preview() TO authenticated;

CREATE OR REPLACE FUNCTION public.gm_reset_all_student_data_verified(
 p_expected_students bigint,
 p_expected_attendance bigint,
 p_expected_assessments bigint,
 p_confirmation text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE students_now bigint; attendance_now bigint; assessments_now bigint; unknown_tables text[]; unknown_assignments text[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='koordinator') THEN
   RAISE EXCEPTION 'Hanya koordinator dapat menjalankan reset data siswa';
 END IF;
 IF p_confirmation IS DISTINCT FROM 'HAPUS SEMUA DATA SISWA' THEN RAISE EXCEPTION 'Konfirmasi reset salah'; END IF;
 PERFORM pg_advisory_xact_lock(20260928,14);
 SELECT count(*) INTO students_now FROM public.students;
 SELECT count(*) INTO attendance_now FROM public.attendance;
 SELECT count(*) INTO assessments_now FROM public.subject_assessments;
 IF students_now IS DISTINCT FROM p_expected_students OR attendance_now IS DISTINCT FROM p_expected_attendance OR assessments_now IS DISTINCT FROM p_expected_assessments THEN
   RAISE EXCEPTION 'Data berubah sejak pratinjau (siswa %, absensi %, nilai %). Muat ulang pratinjau sebelum reset',students_now,attendance_now,assessments_now;
 END IF;
 SELECT array_agg(table_name ORDER BY table_name) INTO unknown_tables
 FROM information_schema.columns
 WHERE table_schema='public' AND column_name='student_id'
   AND table_name <> ALL(ARRAY[
     'attendance','assessment_group_members','report_period_students','periodic_assessments',
     'subject_assessments','student_reports','student_identifiers','student_class_assignments'
   ]);
 IF unknown_tables IS NOT NULL THEN RAISE EXCEPTION 'STOP: tabel student_id belum diaudit: %',array_to_string(unknown_tables,', '); END IF;
 SELECT array_agg(table_name ORDER BY table_name) INTO unknown_assignments FROM information_schema.columns
 WHERE table_schema='public' AND column_name='assignment_id'
   AND table_name <> ALL(ARRAY['assessment_group_members','subject_assessments','subject_assessment_history']);
 IF unknown_assignments IS NOT NULL THEN RAISE EXCEPTION 'STOP: tabel assignment_id belum diaudit: %',array_to_string(unknown_assignments,', '); END IF;

 -- Hapus histori/snapshot terlebih dahulu agar FK tidak menghalangi.
 DELETE FROM public.subject_assessment_history;
 DELETE FROM public.student_report_history;
 DELETE FROM public.student_reports;
 DELETE FROM public.report_period_students;
 DELETE FROM public.subject_assessments;
 DELETE FROM public.periodic_assessments;
 DELETE FROM public.assessment_group_members;
 DELETE FROM public.teaching_assignments;
 DELETE FROM public.attendance;
 DELETE FROM public.student_class_assignments;
 DELETE FROM public.student_identifiers;
 DELETE FROM public.students;

 RETURN jsonb_build_object(
   'deleted_students',students_now,
   'deleted_attendance',attendance_now,
   'deleted_subject_assessments',assessments_now,
   'teachers_preserved',(SELECT count(*) FROM public.teachers),
   'accounts_preserved',(SELECT count(*) FROM public.user_roles)
 );
END $f$;
REVOKE ALL ON FUNCTION public.gm_reset_all_student_data_verified(bigint,bigint,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gm_reset_all_student_data_verified(bigint,bigint,bigint,text) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';

SELECT
 to_regprocedure('public.gm_student_data_reset_preview()') IS NOT NULL AS preview_reset_siap,
 to_regprocedure('public.gm_reset_all_student_data_verified(bigint,bigint,bigint,text)') IS NOT NULL AS reset_siap;
