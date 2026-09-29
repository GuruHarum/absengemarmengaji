-- Audit baca-saja setelah migrasi tiga ID dan kelompok dua pelajaran.
-- Tidak memperbaiki/menimpa data, aman dijalankan sebelum deployment.
SELECT COUNT(*) AS total_absensi,
       COUNT(*) FILTER (WHERE student_id IS NULL OR class_id IS NULL OR teacher_id IS NULL) AS absensi_id_belum_lengkap
FROM public.attendance;
SELECT COUNT(*) AS id_siswa_tidak_ditemukan
FROM public.attendance a LEFT JOIN public.students s ON s.id=a.student_id
WHERE a.student_id IS NOT NULL AND s.id IS NULL;
SELECT COUNT(*) AS id_kelas_tidak_ditemukan
FROM public.attendance a LEFT JOIN public.school_classes c ON c.id=a.class_id
WHERE a.class_id IS NOT NULL AND c.id IS NULL;
SELECT COUNT(*) AS id_guru_tidak_ditemukan
FROM public.attendance a LEFT JOIN public.teachers t ON t.id=a.teacher_id
WHERE a.teacher_id IS NOT NULL AND t.id IS NULL;
SELECT a.subject,a.academic_year_start,COUNT(*) AS tugas_aktif_tanpa_master_guru
FROM public.teaching_assignments a LEFT JOIN public.teachers t ON t.id::text=a.teacher_id
WHERE a.active AND t.id IS NULL
GROUP BY a.subject,a.academic_year_start ORDER BY a.subject,a.academic_year_start;
SELECT m.subject,m.academic_year_start,COUNT(*) AS anggota_aktif_tanpa_master_siswa
FROM public.assessment_group_members m LEFT JOIN public.students s ON s.id::text=m.student_id
WHERE m.active AND s.id IS NULL
GROUP BY m.subject,m.academic_year_start ORDER BY m.subject,m.academic_year_start;
SELECT a.subject,a.academic_year_start,COUNT(*) AS kelompok_aktif_tidak_memiliki_kelas_valid
FROM public.teaching_assignments a LEFT JOIN public.school_classes c
 ON c.academic_year_start=a.academic_year_start
 AND c.normalized_name=lower(regexp_replace(trim(a.class_name),'[[:space:]]+',' ','g'))
WHERE a.active AND c.id IS NULL
GROUP BY a.subject,a.academic_year_start ORDER BY a.subject,a.academic_year_start;
SELECT to_regprocedure('public.gm_list_account_link_status()') IS NOT NULL AS rpc_daftar_tautan_akun_tersedia,
       to_regprocedure('public.gm_public_tahsin_students(integer)') IS NOT NULL AS roster_publik_tahsin_tersedia,
       to_regprocedure('public.gm_public_tahsin_teachers(integer)') IS NOT NULL AS guru_publik_tahsin_tersedia;
