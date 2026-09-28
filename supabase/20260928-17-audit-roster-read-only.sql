-- BACA-SAJA: audit seluruh guru Tahsin untuk membandingkan anggota kelompok aktif vs roster absensi publik.
WITH cfg AS (
  SELECT EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
         - CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') < 7 THEN 1 ELSE 0 END AS yr
), members AS (
  SELECT t.id AS teacher_id, t.nama AS nama_guru, count(DISTINCT m.student_id) AS anggota_kelompok
  FROM public.assessment_group_members m
  JOIN public.teaching_assignments a ON a.id=m.assignment_id
  JOIN public.teachers t ON t.id::text=a.teacher_id
  CROSS JOIN cfg
  WHERE m.active AND a.active AND m.subject='tahsin' AND a.subject='tahsin'
    AND m.academic_year_start=cfg.yr AND a.academic_year_start=cfg.yr
  GROUP BY t.id,t.nama
), roster AS (
  SELECT teacher_id, "nama guru" AS nama_guru, count(DISTINCT id) AS roster_absensi
  FROM public.gm_public_tahsin_students((SELECT yr FROM cfg))
  GROUP BY teacher_id,"nama guru"
)
SELECT
  coalesce(m.teacher_id,r.teacher_id) AS teacher_id,
  coalesce(m.nama_guru,r.nama_guru) AS nama_guru,
  coalesce(m.anggota_kelompok,0) AS anggota_kelompok,
  coalesce(r.roster_absensi,0) AS roster_absensi,
  coalesce(m.anggota_kelompok,0)-coalesce(r.roster_absensi,0) AS selisih,
  CASE WHEN coalesce(m.anggota_kelompok,0)=coalesce(r.roster_absensi,0)
       THEN 'OK' ELSE 'PERLU DIPERIKSA' END AS status
FROM members m
FULL JOIN roster r USING(teacher_id)
ORDER BY status DESC, nama_guru;

-- Siswa master yang belum punya relasi kelas tahun aktif.
WITH cfg AS (
  SELECT EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
         - CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') < 7 THEN 1 ELSE 0 END AS yr
)
SELECT s.id,s."nama siswa",s.kelas
FROM public.students s,cfg
WHERE NOT EXISTS (
  SELECT 1 FROM public.student_class_assignments sca
  WHERE sca.student_id=s.id AND sca.academic_year_start=cfg.yr
)
ORDER BY s.kelas,s."nama siswa";
