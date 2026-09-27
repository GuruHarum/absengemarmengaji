-- Gemar Mengaji | Audit NIS/NISN pasca-impor — READ ONLY.
-- Jalankan satu query ini; tidak ada INSERT/UPDATE/DELETE.
WITH counts AS (
 SELECT
    (SELECT count(*) FROM public.students) AS jumlah_siswa,
    (SELECT count(*) FROM public.attendance) AS jumlah_absensi,
    (SELECT count(*) FROM public.student_identifiers) AS baris_identitas,
    (SELECT count(*) FROM public.students s LEFT JOIN public.student_identifiers i ON i.student_id=s.id
      WHERE nullif(trim(i.nis),'') is null) AS nis_kosong,
    (SELECT count(*) FROM public.students s LEFT JOIN public.student_identifiers i ON i.student_id=s.id
      WHERE nullif(trim(i.nisn),'') is null) AS nisn_kosong,
    (SELECT count(*) FROM public.students s LEFT JOIN public.student_identifiers i ON i.student_id=s.id
      WHERE nullif(trim(i.nis),'') is null AND nullif(trim(i.nisn),'') is null) AS keduanya_kosong,
    (SELECT count(*) FROM (SELECT nis FROM public.student_identifiers
         WHERE nullif(trim(nis),'') is not null GROUP BY nis HAVING count(*)>1) q) AS nis_ganda,
    (SELECT count(*) FROM (SELECT nisn FROM public.student_identifiers
         WHERE nullif(trim(nisn),'') is not null GROUP BY nisn HAVING count(*)>1) q) AS nisn_ganda
)
SELECT * FROM counts;
