-- BACA SAJA: audit jumlah berdasarkan NAMA/ID guru serta anggota AKTIF tahun ajaran 2026/27.
-- Tahfidz tidak disamakan otomatis dengan Tahsin: jumlah dan siswa dapat berbeda.
WITH guru_target AS (
 SELECT id::text AS teacher_id, nama, attendance_enabled
 FROM public.teachers WHERE lower(nama) LIKE '%lilis%' OR lower(nama) LIKE '%agis%'
), siswa_tahsin AS (
 SELECT g.teacher_id, s.id::text student_id, s."nama siswa" nama, s.kelas
 FROM guru_target g JOIN public.students s ON s."nama guru"=g.nama
), siswa_tahfidz AS (
 SELECT a.teacher_id, m.student_id, s."nama siswa" nama, s.kelas
 FROM public.teaching_assignments a JOIN public.assessment_group_members m ON m.assignment_id=a.id
 JOIN public.students s ON s.id::text=m.student_id
 WHERE a.subject='tahfidz' AND a.academic_year_start=2026 AND a.active
 AND m.academic_year_start=2026 AND m.active
)
SELECT g.nama AS guru, g.teacher_id,
 (SELECT COUNT(DISTINCT st.student_id) FROM siswa_tahsin st WHERE st.teacher_id=g.teacher_id) AS jumlah_tahsin,
 (SELECT COUNT(DISTINCT sf.student_id) FROM siswa_tahfidz sf WHERE sf.teacher_id=g.teacher_id) AS jumlah_tahfidz,
 (SELECT COUNT(DISTINCT st.student_id) FROM siswa_tahsin st WHERE st.teacher_id=g.teacher_id
   AND lower(st.kelas) LIKE '1 umar%') AS tahsin_kelas_1_umar,
 (SELECT COUNT(DISTINCT sf.student_id) FROM siswa_tahfidz sf WHERE sf.teacher_id=g.teacher_id
   AND lower(sf.kelas) LIKE '1 umar%') AS tahfidz_kelas_1_umar,
 (SELECT COUNT(DISTINCT st.student_id) FROM siswa_tahsin st WHERE st.teacher_id=g.teacher_id
   AND st.kelas ~ '^1([[:space:]]|$)') AS tahsin_semua_kelas_1,
 (SELECT COUNT(DISTINCT sf.student_id) FROM siswa_tahfidz sf WHERE sf.teacher_id=g.teacher_id
   AND sf.kelas ~ '^1([[:space:]]|$)') AS tahfidz_semua_kelas_1
FROM guru_target g ORDER BY g.nama;

-- DETAIL: siswa yang ada di Tahsin tetapi bukan anggota Tahfidz guru sama, dan sebaliknya.
WITH guru_target AS (
 SELECT id::text teacher_id, nama FROM public.teachers
 WHERE lower(nama) LIKE '%lilis%' OR lower(nama) LIKE '%agis%'
), ts AS (
 SELECT g.teacher_id,g.nama AS guru,s.id::text student_id,s."nama siswa" nama,s.kelas
 FROM guru_target g JOIN public.students s ON s."nama guru"=g.nama
), tf AS (
 SELECT a.teacher_id, s.id::text student_id,s."nama siswa" nama,s.kelas
 FROM public.teaching_assignments a JOIN public.assessment_group_members m ON m.assignment_id=a.id
 JOIN public.students s ON s.id::text=m.student_id
 WHERE a.subject='tahfidz' AND a.academic_year_start=2026 AND a.active
 AND m.academic_year_start=2026 AND m.active
)
 , pasangan AS (
  SELECT teacher_id, student_id FROM ts
  UNION
  SELECT teacher_id, student_id FROM tf
)
SELECT g.nama AS guru, COALESCE(ts.nama,tf.nama) AS siswa,
 COALESCE(ts.kelas,tf.kelas) AS kelas,
 CASE WHEN ts.student_id IS NOT NULL AND tf.student_id IS NULL THEN 'TAHSIN SAJA'
      WHEN ts.student_id IS NULL AND tf.student_id IS NOT NULL THEN 'TAHFIDZ SAJA' END AS selisih
FROM pasangan p JOIN guru_target g ON g.teacher_id=p.teacher_id
LEFT JOIN ts ON ts.teacher_id=p.teacher_id AND ts.student_id=p.student_id
LEFT JOIN tf ON tf.teacher_id=p.teacher_id AND tf.student_id=p.student_id
WHERE (ts.student_id IS NULL OR tf.student_id IS NULL)
ORDER BY guru,kelas,siswa;

-- Selisih kelas 1 Pak Agis: cek seluruh siswa Tahfidz yang benar, jangan menambah anggota dari daftar Tahsin.
SELECT t.nama AS guru, s.id AS student_id,s."nama siswa" AS nama,s.kelas,
 a.id AS kelompok_id,a.class_name AS nama_kelompok
FROM public.teachers t JOIN public.teaching_assignments a ON a.teacher_id=t.id::text
JOIN public.assessment_group_members m ON m.assignment_id=a.id
JOIN public.students s ON s.id::text=m.student_id
WHERE lower(t.nama) LIKE '%agis%' AND a.subject='tahfidz' AND a.active
 AND m.active AND a.academic_year_start=2026 AND m.academic_year_start=2026
 AND s.kelas ~ '^1([[:space:]]|$)' ORDER BY s.kelas,s."nama siswa";
