-- GEMAR MENGAJI - TAHAP 18
-- Pusat Perlu Perhatian: nilai belum lengkap + siswa tanpa kelompok Tahsin/Tahfidz.
-- Additive: tidak menghapus/mengubah nilai, kelompok, siswa, absensi, atau rapor.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $check$
BEGIN
  IF to_regprocedure('app_private.report_score_issues(jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'Fungsi app_private.report_score_issues belum tersedia. Jalankan migrasi assessment-report-v2 terlebih dahulu.';
  END IF;
END
$check$;

CREATE OR REPLACE FUNCTION public.gm_attention_center(
  year_key integer DEFAULT NULL,
  period_key text DEFAULT NULL
)
RETURNS TABLE(
  issue_type text,
  student_id text,
  student_name text,
  class_name text,
  subject text,
  teacher_id text,
  teacher_name text,
  issue_payload jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  yr integer;
  pr text;
  role_name text;
  linked_teacher text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akun diperlukan';
  END IF;

  SELECT r.role, r.teacher_id
    INTO role_name, linked_teacher
  FROM public.user_roles r
  WHERE r.user_id = auth.uid();

  IF role_name IS NULL OR role_name NOT IN ('admin','koordinator','guru') THEN
    RAISE EXCEPTION 'Hak akses tidak tersedia';
  END IF;

  yr := COALESCE(
    year_key,
    EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
      - CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') < 7 THEN 1 ELSE 0 END
  );
  IF yr NOT BETWEEN 2000 AND 2200 THEN
    RAISE EXCEPTION 'Tahun ajaran tidak valid';
  END IF;

  pr := COALESCE(period_key,
    CASE
      WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') BETWEEN 7 AND 10 THEN 'pts_ganjil'
      WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') BETWEEN 11 AND 12 THEN 'pas_ganjil'
      WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') BETWEEN 1 AND 3 THEN 'pts_genap'
      ELSE 'pas_genap'
    END
  );
  IF pr NOT IN ('pts_ganjil','pas_ganjil','pts_genap','pas_genap') THEN
    RAISE EXCEPTION 'Periode penilaian tidak valid';
  END IF;

  IF role_name = 'guru' AND NULLIF(linked_teacher,'') IS NULL THEN
    RAISE EXCEPTION 'Akun guru belum tertaut ke master guru';
  END IF;

  RETURN QUERY
  WITH active_students AS (
    SELECT DISTINCT s.id::text AS id, s."nama siswa"::text AS name, s.kelas::text AS class_name
    FROM public.students s
    JOIN public.student_class_assignments sca
      ON sca.student_id = s.id AND sca.academic_year_start = yr
  ),
  active_roster AS (
    SELECT
      m.student_id::text AS student_id,
      a.subject::text AS subject,
      a.teacher_id::text AS teacher_id,
      COALESCE(NULLIF(trim(t.nama_lengkap),''),t.nama)::text AS teacher_name
    FROM public.assessment_group_members m
    JOIN public.teaching_assignments a
      ON a.id = m.assignment_id
     AND a.active
     AND a.subject = m.subject
     AND a.academic_year_start = yr
    JOIN public.teachers t ON t.id::text = a.teacher_id
    WHERE m.active
      AND m.academic_year_start = yr
      AND m.subject IN ('tahsin','tahfidz')
  ),
  score_attention AS (
    SELECT
      'incomplete_score'::text AS issue_type,
      s.id::text AS student_id,
      s."nama siswa"::text AS student_name,
      s.kelas::text AS class_name,
      r.subject::text AS subject,
      r.teacher_id::text AS teacher_id,
      r.teacher_name::text AS teacher_name,
      CASE
        WHEN sa.id IS NULL THEN jsonb_build_object(
          'missing', jsonb_build_array('nilai_belum_diisi'),
          'invalid', '[]'::jsonb,
          'stage', '[]'::jsonb,
          'complete', false,
          'assessment_exists', false
        )
        ELSE app_private.report_score_issues(COALESCE(sa.scores,'{}'::jsonb), r.subject)
             || jsonb_build_object('assessment_exists', true)
      END AS issue_payload
    FROM active_roster r
    JOIN public.students s ON s.id::text = r.student_id
    LEFT JOIN public.subject_assessments sa
      ON sa.student_id = r.student_id
     AND sa.academic_year_start = yr
     AND sa.period = pr
     AND sa.subject = r.subject
    WHERE role_name IN ('admin','koordinator') OR r.teacher_id = linked_teacher
  ),
  missing_groups AS (
    SELECT
      'missing_group'::text AS issue_type,
      s.id::text AS student_id,
      s.name::text AS student_name,
      s.class_name::text AS class_name,
      subjects.subject::text AS subject,
      NULL::text AS teacher_id,
      NULL::text AS teacher_name,
      jsonb_build_object(
        'missing_group', true,
        'complete', false,
        'assessment_exists', false
      ) AS issue_payload
    FROM active_students s
    CROSS JOIN (VALUES ('tahsin'::text),('tahfidz'::text)) AS subjects(subject)
    WHERE role_name IN ('admin','koordinator')
      AND NOT EXISTS (
        SELECT 1 FROM active_roster r
        WHERE r.student_id = s.id AND r.subject = subjects.subject
      )
  ),
  attention AS (
    SELECT sa.* FROM score_attention sa
    WHERE COALESCE((sa.issue_payload->>'complete')::boolean,false) = false
    UNION ALL
    SELECT * FROM missing_groups
  )
  SELECT
    q.issue_type, q.student_id, q.student_name, q.class_name,
    q.subject, q.teacher_id, q.teacher_name, q.issue_payload
  FROM attention q
  ORDER BY
    CASE q.issue_type WHEN 'incomplete_score' THEN 1 ELSE 2 END,
    q.class_name, q.student_name, q.subject;
END
$fn$;

REVOKE ALL ON FUNCTION public.gm_attention_center(integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_attention_center(integer,text) TO authenticated;

COMMENT ON FUNCTION public.gm_attention_center(integer,text) IS
'Pusat Perlu Perhatian. Koordinator/admin melihat nilai belum lengkap dan siswa tanpa kelompok; guru hanya nilai belum lengkap miliknya.';

COMMIT;
