-- BACA SAJA: audit pencegahan duplikasi dan relasi setelah impor.
-- Jika dipakai di produksi, tidak mengubah data apa pun.
SELECT 'siswa' AS sumber, count(*)::bigint AS jumlah FROM public.students
UNION ALL SELECT 'absensi', count(*) FROM public.attendance
UNION ALL SELECT 'guru', count(*) FROM public.teachers
UNION ALL SELECT 'akun', count(*) FROM public.user_roles;

-- Indeks unik identitas harus ada: indeks partial NIS dan NISN dari student-import.sql.
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='student_identifiers'
  AND indexname IN ('student_nis_unique','student_nisn_unique')
ORDER BY indexname;

-- Potensi duplikat NIS/NISN (target setiap hasil nol).
SELECT 'NIS' AS jenis, nis AS nomor, count(*) AS jumlah
FROM public.student_identifiers WHERE nullif(trim(nis),'') IS NOT NULL
GROUP BY nis HAVING count(*)>1
UNION ALL
SELECT 'NISN', nisn, count(*)
FROM public.student_identifiers WHERE nullif(trim(nisn),'') IS NOT NULL
GROUP BY nisn HAVING count(*)>1;

-- Nama sama dan kelas sama: hanya kandidat pemeriksaan, BUKAN untuk dihapus otomatis.
SELECT app_private.import_student_name_key("nama siswa") AS kunci_nama,
       app_private.import_student_class_key(kelas) AS kunci_kelas,
       count(*) AS jumlah,
       array_agg(id ORDER BY id) AS id_siswa,
       array_agg("nama siswa" ORDER BY id) AS nama_siswa
FROM public.students
GROUP BY 1,2 HAVING count(*)>1 ORDER BY jumlah DESC;

-- Dua tabel anak yang sebelumnya memiliki entri yatim (target nol).
SELECT 'assessment_group_members' AS tabel, count(*) AS yatim
FROM public.assessment_group_members t WHERE NOT EXISTS
  (SELECT 1 FROM public.students s WHERE s.id::text=t.student_id)
UNION ALL
SELECT 'report_period_students', count(*)
FROM public.report_period_students t WHERE NOT EXISTS
  (SELECT 1 FROM public.students s WHERE s.id::text=t.student_id);

-- Jumlah kelompok Tahfidz aktif lebih dari satu untuk ID siswa yang sama/tahun sama.
-- Tinjau dengan koordinator jika ada hasil: tidak otomatis berarti duplikat siswa.
SELECT gm.student_id, gm.academic_year_start,
       count(DISTINCT gm.assignment_id) AS jumlah_kelompok,
       array_agg(DISTINCT a.class_name) AS nama_kelompok
FROM public.assessment_group_members gm
JOIN public.teaching_assignments a ON a.id=gm.assignment_id
WHERE gm.active AND a.active AND a.subject='tahfidz'
 AND a.academic_year_start=gm.academic_year_start
GROUP BY gm.student_id,gm.academic_year_start
HAVING count(DISTINCT gm.assignment_id)>1;
