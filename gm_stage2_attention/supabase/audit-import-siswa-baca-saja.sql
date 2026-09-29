-- BACA SAJA: setelah impor, ganti tahun 2026 sesuai form impor.
-- Blok 1: ringkasan referensi ID lama dan orphan ID yang telah dihapus.
SELECT
 (SELECT count(*) FROM public.students) AS master_siswa,
 (SELECT count(*) FROM public.attendance) AS jumlah_absensi,
 (SELECT count(*) FROM public.students WHERE id IN (38,39)) AS id_lama,
 (SELECT count(*) FROM public.students WHERE id IN (1213,1214)) AS id_duplikat,
 (SELECT count(*) FROM public.assessment_group_members WHERE student_id IN ('1213','1214')) AS grup_orphan,
 (SELECT count(*) FROM public.report_period_students WHERE student_id IN ('1213','1214')) AS rapor_orphan;

-- Blok 2: penugasan tiap siswa menurut tahun (tidak mengasumsikan
-- guru Tahsin dan Tahfidz harus sama). Ganti '%lilis%' bila perlu.
SELECT s.id,s."nama siswa" nama,s.kelas,s."nama guru" guru_tahsin,
 i.nis,i.nisn,
 COALESCE(string_agg(DISTINCT t.nama||' — '||a.class_name,'; ')
  FILTER (WHERE gm.active AND a.active AND a.subject='tahfidz' AND a.academic_year_start=2026),
  '(belum ada kelompok aktif)') AS kelompok_tahfidz_2026,
 (SELECT count(*) FROM public.report_period_students rp
   WHERE rp.student_id=s.id::text AND rp.academic_year_start=2026
     AND rp.period IN ('pts_ganjil','pas_ganjil','pts_genap','pas_genap')) AS jumlah_periode_rapor_2026
FROM public.students s
LEFT JOIN public.student_identifiers i ON i.student_id=s.id
LEFT JOIN public.assessment_group_members gm ON gm.student_id=s.id::text AND gm.academic_year_start=2026
LEFT JOIN public.teaching_assignments a ON a.id=gm.assignment_id
LEFT JOIN public.teachers t ON t.id::text=a.teacher_id
WHERE lower(s."nama guru") LIKE '%lilis%' OR s.id IN (38,39)
GROUP BY s.id,s."nama siswa",s.kelas,s."nama guru",i.nis,i.nisn
ORDER BY s.kelas,s."nama siswa";

-- Blok 3: anggota aktif tiap guru Tahfidz di tahun 2026, hanya siswa master valid.
SELECT t.nama AS guru_tahfidz,a.class_name AS nama_grup,
 COUNT(DISTINCT gm.student_id) AS siswa_aktif,
 COUNT(DISTINCT gm.student_id) FILTER (WHERE s.id IS NULL) AS orphan_tidak_ada_di_master
FROM public.teaching_assignments a
JOIN public.teachers t ON t.id::text=a.teacher_id
LEFT JOIN public.assessment_group_members gm ON gm.assignment_id=a.id AND gm.active
LEFT JOIN public.students s ON s.id::text=gm.student_id
WHERE a.subject='tahfidz' AND a.active AND a.academic_year_start=2026
GROUP BY t.nama,a.class_name
ORDER BY t.nama,a.class_name;
