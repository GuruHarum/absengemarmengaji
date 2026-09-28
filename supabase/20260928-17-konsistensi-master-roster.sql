-- GEMAR MENGAJI - TAHAP 17
-- Menyamakan sumber data master siswa, relasi kelas, kelompok, dan roster absensi.
-- Aman terhadap nilai/absensi lama: tidak menghapus data dan tidak memindahkan kelompok.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1) Pastikan siswa yang dibuat manual maupun melalui impor selalu memiliki relasi kelas aktif.
CREATE OR REPLACE FUNCTION public.gm_sync_student_class_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $f$
DECLARE
  yr integer;
  cid bigint;
  found_count integer;
BEGIN
  yr := EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
        - CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') < 7 THEN 1 ELSE 0 END;

  SELECT count(*), min(id)
    INTO found_count, cid
  FROM public.school_classes
  WHERE academic_year_start = yr
    AND normalized_name = lower(regexp_replace(trim(NEW.kelas), '[[:space:]]+', ' ', 'g'));

  IF found_count <> 1 THEN
    RAISE EXCEPTION 'Kelas % belum unik di master kelas tahun %', NEW.kelas, yr;
  END IF;

  UPDATE public.student_class_assignments
     SET class_id = cid
   WHERE student_id = NEW.id
     AND academic_year_start = yr
     AND class_id IS DISTINCT FROM cid;

  INSERT INTO public.student_class_assignments(student_id, class_id, academic_year_start)
  SELECT NEW.id, cid, yr
  WHERE NOT EXISTS (
    SELECT 1 FROM public.student_class_assignments
    WHERE student_id = NEW.id AND academic_year_start = yr
  );

  RETURN NEW;
END
$f$;

REVOKE ALL ON FUNCTION public.gm_sync_student_class_only() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS gm_sync_student_class_only ON public.students;
CREATE TRIGGER gm_sync_student_class_only
AFTER INSERT OR UPDATE OF kelas ON public.students
FOR EACH ROW EXECUTE FUNCTION public.gm_sync_student_class_only();

-- 2) Jalur resmi tambah siswa manual: tetap menjadi master siswa yang sama seperti hasil impor.
CREATE OR REPLACE FUNCTION public.gm_create_student_master(
  p_student_name text,
  p_class_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $f$
DECLARE
  pupil public.students%rowtype;
  yr integer;
  cid bigint;
  class_count integer;
BEGIN
  IF NOT app_private.is_manager() THEN
    RAISE EXCEPTION 'Hanya koordinator/admin yang dapat menambah siswa';
  END IF;

  p_student_name := trim(coalesce(p_student_name, ''));
  p_class_name := regexp_replace(trim(coalesce(p_class_name, '')), '[[:space:]]+', ' ', 'g');
  IF p_student_name = '' OR p_class_name = '' THEN
    RAISE EXCEPTION 'Nama siswa dan kelas wajib diisi';
  END IF;

  yr := EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
        - CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') < 7 THEN 1 ELSE 0 END;

  SELECT count(*), min(id)
    INTO class_count, cid
  FROM public.school_classes
  WHERE academic_year_start = yr
    AND normalized_name = lower(p_class_name);

  IF class_count <> 1 THEN
    RAISE EXCEPTION 'Kelas % belum terdaftar unik pada tahun ajaran %', p_class_name, yr;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.students s
    WHERE lower(trim(s."nama siswa")) = lower(p_student_name)
      AND lower(regexp_replace(trim(s.kelas), '[[:space:]]+', ' ', 'g')) = lower(p_class_name)
  ) THEN
    RAISE EXCEPTION 'Nama + kelas sudah ada di master siswa; gunakan data yang sudah ada';
  END IF;

  INSERT INTO public.students("nama siswa", "nama guru", kelas)
  VALUES (p_student_name, 'Belum ditugaskan', p_class_name)
  RETURNING * INTO pupil;

  -- Trigger di atas juga membuat relasi ini. Upsert defensif menjaga konsistensi jika trigger berubah.
  UPDATE public.student_class_assignments
     SET class_id = cid
   WHERE student_id = pupil.id AND academic_year_start = yr;
  INSERT INTO public.student_class_assignments(student_id, class_id, academic_year_start)
  SELECT pupil.id, cid, yr
  WHERE NOT EXISTS (
    SELECT 1 FROM public.student_class_assignments
    WHERE student_id = pupil.id AND academic_year_start = yr
  );

  INSERT INTO public.student_identifiers(student_id, nis, nisn)
  SELECT pupil.id, NULL, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM public.student_identifiers WHERE student_id = pupil.id
  );

  RETURN jsonb_build_object(
    'id', pupil.id,
    'nama siswa', pupil."nama siswa",
    'nama guru', pupil."nama guru",
    'kelas', pupil.kelas,
    'class_id', cid,
    'academic_year_start', yr
  );
END
$f$;

REVOKE ALL ON FUNCTION public.gm_create_student_master(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_create_student_master(text, text) TO authenticated;

-- 3) Proteksi kedua: setiap siswa yang dimasukkan ke kelompok aktif wajib mempunyai relasi kelas tahun itu.
CREATE OR REPLACE FUNCTION public.gm_ensure_group_member_class_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $f$
DECLARE
  cid bigint;
  class_count integer;
  class_name text;
BEGIN
  IF NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT s.kelas INTO class_name
  FROM public.students s
  WHERE s.id::text = NEW.student_id;

  IF class_name IS NULL THEN
    RAISE EXCEPTION 'Siswa ID % tidak ditemukan di master siswa', NEW.student_id;
  END IF;

  SELECT count(*), min(sc.id)
    INTO class_count, cid
  FROM public.school_classes sc
  WHERE sc.academic_year_start = NEW.academic_year_start
    AND sc.normalized_name = lower(regexp_replace(trim(class_name), '[[:space:]]+', ' ', 'g'));

  IF class_count <> 1 THEN
    RAISE EXCEPTION 'Kelas % siswa ID % belum unik pada tahun ajaran %', class_name, NEW.student_id, NEW.academic_year_start;
  END IF;

  UPDATE public.student_class_assignments
     SET class_id = cid
   WHERE student_id::text = NEW.student_id
     AND academic_year_start = NEW.academic_year_start
     AND class_id IS DISTINCT FROM cid;

  INSERT INTO public.student_class_assignments(student_id, class_id, academic_year_start)
  SELECT NEW.student_id::bigint, cid, NEW.academic_year_start
  WHERE NOT EXISTS (
    SELECT 1 FROM public.student_class_assignments
    WHERE student_id::text = NEW.student_id
      AND academic_year_start = NEW.academic_year_start
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

-- 4) Perbaikan defensif satu kali untuk semua master siswa tahun berjalan yang kelasnya valid unik.
DO $f$
DECLARE
  yr integer;
BEGIN
  yr := EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
        - CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') < 7 THEN 1 ELSE 0 END;

  UPDATE public.student_class_assignments sca
     SET class_id = mapped.class_id
  FROM (
    SELECT s.id AS student_id, min(sc.id) AS class_id
    FROM public.students s
    JOIN public.school_classes sc
      ON sc.academic_year_start = yr
     AND sc.normalized_name = lower(regexp_replace(trim(s.kelas), '[[:space:]]+', ' ', 'g'))
    GROUP BY s.id
    HAVING count(*) = 1
  ) mapped
  WHERE sca.student_id = mapped.student_id
    AND sca.academic_year_start = yr
    AND sca.class_id IS DISTINCT FROM mapped.class_id;

  INSERT INTO public.student_class_assignments(student_id, class_id, academic_year_start)
  SELECT mapped.student_id, mapped.class_id, yr
  FROM (
    SELECT s.id AS student_id, min(sc.id) AS class_id
    FROM public.students s
    JOIN public.school_classes sc
      ON sc.academic_year_start = yr
     AND sc.normalized_name = lower(regexp_replace(trim(s.kelas), '[[:space:]]+', ' ', 'g'))
    GROUP BY s.id
    HAVING count(*) = 1
  ) mapped
  WHERE NOT EXISTS (
    SELECT 1 FROM public.student_class_assignments sca
    WHERE sca.student_id = mapped.student_id
      AND sca.academic_year_start = yr
  );
END
$f$;

COMMIT;

-- VERIFIKASI BACA-SAJA
WITH yr AS (
  SELECT EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
         - CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') < 7 THEN 1 ELSE 0 END AS y
)
SELECT
  (SELECT count(*) FROM public.students) AS master_siswa,
  (SELECT count(*) FROM public.student_class_assignments sca, yr WHERE sca.academic_year_start = yr.y) AS relasi_kelas_tahun_aktif,
  (SELECT count(*) FROM public.students s, yr WHERE NOT EXISTS (
      SELECT 1 FROM public.student_class_assignments sca
      WHERE sca.student_id = s.id AND sca.academic_year_start = yr.y
  )) AS siswa_tanpa_relasi_kelas,
  (SELECT count(*) FROM public.assessment_group_members m
     JOIN public.teaching_assignments a ON a.id = m.assignment_id, yr
     WHERE m.active AND a.active AND m.subject='tahsin' AND a.subject='tahsin'
       AND m.academic_year_start=yr.y AND a.academic_year_start=yr.y) AS anggota_tahsin_aktif,
  (SELECT count(*) FROM public.gm_public_tahsin_students()) AS roster_absensi_tahsin;
