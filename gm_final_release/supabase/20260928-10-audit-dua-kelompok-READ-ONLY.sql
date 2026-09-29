-- BACA SAJA. Audit setelah migrasi 05-09 (STAGING dan PRODUKSI terpisah).
-- A. Jumlah siswa per guru, pelajaran, dan satu rombel aktual.
WITH active AS (
 SELECT m.student_id,m.subject,a.teacher_id,a.academic_year_start
 FROM public.assessment_group_members m
 JOIN public.teaching_assignments a ON a.id=m.assignment_id
 WHERE m.active AND a.active AND m.subject=a.subject
 AND m.academic_year_start=a.academic_year_start
 AND a.academic_year_start=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
 -CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END
)
SELECT a.subject,t.nama AS guru,s.kelas,COUNT(*) AS jumlah_siswa
FROM active a JOIN public.teachers t ON t.id::text=a.teacher_id
JOIN public.students s ON s.id::text=a.student_id
GROUP BY a.subject,t.nama,s.kelas ORDER BY guru,a.subject,s.kelas;

-- B. Detail Bu Lilis dan Pak Agis; tidak mengasumsikan jumlah kedua pelajaran sama.
WITH active AS (
 SELECT m.student_id,m.subject,a.teacher_id
 FROM public.assessment_group_members m JOIN public.teaching_assignments a ON a.id=m.assignment_id
 WHERE m.active AND a.active AND m.subject=a.subject
 AND m.academic_year_start=a.academic_year_start
 AND a.academic_year_start=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
 -CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END
)
SELECT t.nama AS guru,a.subject,s.kelas,s.id AS student_id,s."nama siswa" AS nama
FROM active a JOIN public.teachers t ON t.id::text=a.teacher_id
JOIN public.students s ON s.id::text=a.student_id
WHERE t.nama ILIKE '%lilis%' OR t.nama ILIKE '%agis%'
ORDER BY guru,a.subject,s.kelas,nama;

-- C. Pengulangan satu siswa pada pelajaran yang sama (harus No rows).
SELECT m.student_id,m.subject,m.academic_year_start,COUNT(*) AS jumlah
FROM public.assessment_group_members m JOIN public.teaching_assignments a ON a.id=m.assignment_id
WHERE m.active AND a.active AND m.subject=a.subject AND m.academic_year_start=a.academic_year_start
GROUP BY m.student_id,m.subject,m.academic_year_start HAVING count(*)>1;

-- D. Siswa master yang belum diberi kelompok (informasi, bukan kesalahan otomatis).
SELECT s.kelas,s.id AS student_id,s."nama siswa" AS nama,
 NOT EXISTS (SELECT 1 FROM public.assessment_group_members m JOIN public.teaching_assignments a ON a.id=m.assignment_id
 WHERE m.student_id=s.id::text AND m.subject='tahsin' AND a.subject='tahsin' AND m.active AND a.active
 AND a.academic_year_start=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
 -CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END) AS belum_tahsin,
 NOT EXISTS (SELECT 1 FROM public.assessment_group_members m JOIN public.teaching_assignments a ON a.id=m.assignment_id
 WHERE m.student_id=s.id::text AND m.subject='tahfidz' AND a.subject='tahfidz' AND m.active AND a.active
 AND a.academic_year_start=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
 -CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END) AS belum_tahfidz
FROM public.students s ORDER BY s.kelas,s."nama siswa";

-- E. Riwayat absensi; target kolom tanpa_tiga_id = 0.
SELECT COUNT(*) AS total_absensi,
 COUNT(*) FILTER(WHERE student_id IS NULL OR class_id IS NULL OR teacher_id IS NULL) AS tanpa_tiga_id
FROM public.attendance;

-- F. Email akun yang tercatat; hasil hanya untuk akun pengelola sesuai RPC.
-- SELECT * FROM public.gm_teacher_account_hints();
