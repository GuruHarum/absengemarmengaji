-- GEMAR MENGAJI — MERGE DUPLIKAT SISWA TERVERIFIKASI (FIX DELETE GUARD 23c)
-- Perbaikan: update identitas keep_id dilakukan SETELAH merge_id dihapus agar
-- trigger gm_sync_student_identity tidak mendeteksi duplikasi sementara.
-- Tanggal: 2026-09-29
-- Tujuan: pertahankan ID lama/rendah, pindahkan seluruh data operasional dari ID baru/tinggi,
-- lalu hapus ID tinggi. Data ID tinggi menjadi sumber identitas terbaru (nama/kelas/guru/NIS/NISN).
-- PASANGAN TERVERIFIKASI:
-- 1108 -> 91   Muhamad Azzam Aulia Rahmat -> Muhammad Azzam Aulia R
-- 1111 -> 104  Alesha Naufalyn Hafizah -> Alesha Nauvalyn Hafizah
-- 1112 -> 144  Muhammad Ziyad AlFatih Pulungan -> Muhammad Ziyad Al Fatih
-- 1219 -> 44   Naya Talitha Zhafira -> Naya Thalita Zafira
-- 1251 -> 15   Hana Khalila -> Hana Kalila
-- 1252 -> 17   Lovell Reii Tama Kennedy -> Lovell Reii Tana Kennedy

BEGIN;
SET LOCAL lock_timeout = '8s';
SET LOCAL statement_timeout = '180s';

-- FIX 23c: pertahankan proteksi direct DELETE, tetapi izinkan hanya alur terverifikasi/merge audit.
-- Trigger app_private.prevent_direct_student_delete() tetap memblokir DELETE biasa.
CREATE OR REPLACE FUNCTION app_private.prevent_direct_student_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $guard$
BEGIN
  IF current_setting('app.gm_student_delete_mode', true) IN ('audited_merge','verified_delete') THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Hapus permanen siswa diblokir. Gunakan arsip atau alur gabung ID yang diaudit; nilai, rapor dan absensi historis harus dipertahankan.';
END;
$guard$;

-- Perbaiki RPC hapus terverifikasi agar tetap dapat bekerja melalui trigger guard.
CREATE OR REPLACE FUNCTION public.gm_delete_student_verified(
 p_student_id bigint,p_expected_name text,p_expected_attendance integer,p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r public.students%rowtype; total_att integer; deleted_students integer; rel record;
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
 PERFORM set_config('app.gm_student_delete_mode','verified_delete',true);
 DELETE FROM public.students WHERE id=p_student_id;
 GET DIAGNOSTICS deleted_students = ROW_COUNT;
 PERFORM set_config('app.gm_student_delete_mode','',true);
 IF deleted_students <> 1 THEN RAISE EXCEPTION 'Penghapusan siswa gagal'; END IF;
 RETURN jsonb_build_object('deleted_student_id',p_student_id,'deleted_attendance',total_att);
END $f$;
REVOKE ALL ON FUNCTION public.gm_delete_student_verified(bigint,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gm_delete_student_verified(bigint,text,integer,text) TO authenticated;
COMMIT;
