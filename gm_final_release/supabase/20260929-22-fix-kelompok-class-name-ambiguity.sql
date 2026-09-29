-- GEMAR MENGAJI — TAHAP 22
-- Hotfix Kelola Tahsin/Tahfidz: hilangkan ambiguitas nama variabel class_name
-- pada trigger proteksi relasi kelas anggota kelompok.
-- Aman dijalankan setelah SQL 17. Tidak mengubah data siswa/nilai/absensi/rapor.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.gm_ensure_group_member_class_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $f$
DECLARE
  v_class_id bigint;
  v_class_count integer;
  v_student_class_name text;
BEGIN
  IF NEW.active IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT s.kelas INTO v_student_class_name
  FROM public.students AS s
  WHERE s.id::text = NEW.student_id;

  IF v_student_class_name IS NULL THEN
    RAISE EXCEPTION 'Siswa ID % tidak ditemukan di master siswa', NEW.student_id;
  END IF;

  SELECT count(*), min(sc.id)
    INTO v_class_count, v_class_id
  FROM public.school_classes AS sc
  WHERE sc.academic_year_start = NEW.academic_year_start
    AND sc.normalized_name = lower(regexp_replace(trim(v_student_class_name), '[[:space:]]+', ' ', 'g'));

  IF v_class_count <> 1 THEN
    RAISE EXCEPTION 'Kelas % siswa ID % belum unik pada tahun ajaran %',
      v_student_class_name, NEW.student_id, NEW.academic_year_start;
  END IF;

  UPDATE public.student_class_assignments AS sca
     SET class_id = v_class_id
   WHERE sca.student_id::text = NEW.student_id
     AND sca.academic_year_start = NEW.academic_year_start
     AND sca.class_id IS DISTINCT FROM v_class_id;

  INSERT INTO public.student_class_assignments(student_id, class_id, academic_year_start)
  SELECT NEW.student_id::bigint, v_class_id, NEW.academic_year_start
  WHERE NOT EXISTS (
    SELECT 1 FROM public.student_class_assignments AS sca
    WHERE sca.student_id::text = NEW.student_id
      AND sca.academic_year_start = NEW.academic_year_start
  );

  RETURN NEW;
END
$f$;

REVOKE ALL ON FUNCTION public.gm_ensure_group_member_class_link() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS gm_ensure_group_member_class_link ON public.assessment_group_members;
CREATE TRIGGER gm_ensure_group_member_class_link
BEFORE INSERT OR UPDATE OF student_id, academic_year_start, active
ON public.assessment_group_members
FOR EACH ROW EXECUTE FUNCTION public.gm_ensure_group_member_class_link();

COMMIT;
NOTIFY pgrst, 'reload schema';

SELECT
  to_regprocedure('public.gm_ensure_group_member_class_link()') IS NOT NULL AS fungsi_siap,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'gm_ensure_group_member_class_link'
      AND tgrelid = 'public.assessment_group_members'::regclass
      AND NOT tgisinternal
  ) AS trigger_siap;
