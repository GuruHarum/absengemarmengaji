-- AUDIT BACA-SAJA TAHAP 18
-- Ubah periode bila diperlukan. Query ini tidak mengubah data.
WITH p AS (
  SELECT
    EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
      - CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') < 7 THEN 1 ELSE 0 END AS yr,
    'pts_ganjil'::text AS pr
), active_students AS (
  SELECT DISTINCT s.id::text id, s."nama siswa" name, s.kelas
  FROM public.students s
  JOIN public.student_class_assignments sca ON sca.student_id=s.id
  JOIN p ON sca.academic_year_start=p.yr
), roster AS (
  SELECT m.student_id,m.subject,a.teacher_id,t.nama teacher_name
  FROM public.assessment_group_members m
  JOIN public.teaching_assignments a ON a.id=m.assignment_id AND a.active
  JOIN public.teachers t ON t.id::text=a.teacher_id
  JOIN p ON a.academic_year_start=p.yr AND m.academic_year_start=p.yr
  WHERE m.active AND m.subject=a.subject
), score_state AS (
  SELECT r.*,s."nama siswa",s.kelas,sa.id assessment_id,
         CASE WHEN sa.id IS NULL THEN false
              ELSE COALESCE((app_private.report_score_issues(COALESCE(sa.scores,'{}'::jsonb),r.subject)->>'complete')::boolean,false)
         END complete
  FROM roster r
  JOIN public.students s ON s.id::text=r.student_id
  CROSS JOIN p
  LEFT JOIN public.subject_assessments sa ON sa.student_id=r.student_id
    AND sa.academic_year_start=p.yr AND sa.period=p.pr AND sa.subject=r.subject
)
SELECT 'nilai_belum_lengkap' kategori, count(DISTINCT student_id) jumlah_siswa FROM score_state WHERE NOT complete
UNION ALL
SELECT 'belum_kelompok_tahsin', count(*) FROM active_students s WHERE NOT EXISTS(SELECT 1 FROM roster r WHERE r.student_id=s.id AND r.subject='tahsin')
UNION ALL
SELECT 'belum_kelompok_tahfidz', count(*) FROM active_students s WHERE NOT EXISTS(SELECT 1 FROM roster r WHERE r.student_id=s.id AND r.subject='tahfidz');
