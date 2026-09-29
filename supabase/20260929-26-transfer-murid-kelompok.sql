-- GEMAR MENGAJI 2026/27 — TAHAP 26
-- Transfer sebagian anggota antar kelompok aktif pada pelajaran + tahun ajaran yang sama.
-- Aman untuk data akademik:
--   * students tidak dihapus
--   * teachers tidak dihapus
--   * nilai/rapor tidak dihapus atau ditimpa
--   * hanya membership aktif yang dipindahkan
--   * untuk Tahsin, master "nama guru" ikut diselaraskan ke guru kelompok tujuan

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.gm_transfer_group_students(
  p_source_group_id uuid,
  p_target_group_id uuid,
  p_student_ids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $f$
DECLARE
  src public.teaching_assignments%rowtype;
  tgt public.teaching_assignments%rowtype;
  clean_ids text[];
  requested_count integer := 0;
  moved_count integer := 0;
  source_remaining integer := 0;
  target_teacher_short text;
  target_teacher_label text;
BEGIN
  IF NOT app_private.is_manager() THEN
    RAISE EXCEPTION 'Hanya koordinator/admin dapat mentransfer murid';
  END IF;

  IF p_source_group_id IS NULL OR p_target_group_id IS NULL OR p_source_group_id = p_target_group_id THEN
    RAISE EXCEPTION 'Kelompok asal dan tujuan harus berbeda';
  END IF;

  IF coalesce(cardinality(p_student_ids), 0) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Pilih 1 sampai 1.000 siswa untuk ditransfer';
  END IF;

  SELECT array_agg(DISTINCT trim(x) ORDER BY trim(x))
    INTO clean_ids
  FROM unnest(p_student_ids) AS x
  WHERE trim(coalesce(x, '')) <> '';

  IF clean_ids IS NULL
     OR cardinality(clean_ids) <> cardinality(p_student_ids)
     OR EXISTS (
       SELECT 1
       FROM unnest(clean_ids) AS sid
       WHERE NOT EXISTS (
         SELECT 1 FROM public.students s WHERE s.id::text = sid
       )
     ) THEN
    RAISE EXCEPTION 'Daftar siswa kosong, ganda, atau sudah berubah';
  END IF;

  -- Kunci deterministik agar dua transfer pada kelompok yang sama tidak saling bertabrakan.
  PERFORM pg_advisory_xact_lock(hashtext(least(p_source_group_id::text, p_target_group_id::text))::bigint);
  PERFORM pg_advisory_xact_lock(hashtext(greatest(p_source_group_id::text, p_target_group_id::text))::bigint);

  SELECT * INTO src
  FROM public.teaching_assignments
  WHERE id = p_source_group_id
    AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kelompok asal tidak ditemukan atau sudah tidak aktif';
  END IF;

  SELECT * INTO tgt
  FROM public.teaching_assignments
  WHERE id = p_target_group_id
    AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kelompok tujuan tidak ditemukan atau sudah tidak aktif';
  END IF;

  IF src.subject IS DISTINCT FROM tgt.subject THEN
    RAISE EXCEPTION 'Kelompok asal dan tujuan harus pada pelajaran yang sama';
  END IF;

  IF src.academic_year_start IS DISTINCT FROM tgt.academic_year_start THEN
    RAISE EXCEPTION 'Kelompok asal dan tujuan harus pada tahun ajaran yang sama';
  END IF;

  SELECT count(*) INTO requested_count
  FROM public.assessment_group_members m
  WHERE m.assignment_id = src.id
    AND m.academic_year_start = src.academic_year_start
    AND m.subject = src.subject
    AND m.active = true
    AND m.student_id = ANY(clean_ids);

  IF requested_count <> cardinality(clean_ids) THEN
    RAISE EXCEPTION 'Sebagian siswa sudah tidak menjadi anggota aktif kelompok asal. Muat ulang daftar';
  END IF;

  -- Lepaskan dari kelompok asal terlebih dahulu agar unique membership aktif per
  -- siswa/pelajaran/tahun tidak menghalangi aktivasi pada kelompok tujuan.
  UPDATE public.assessment_group_members m
  SET active = false
  WHERE m.assignment_id = src.id
    AND m.active = true
    AND m.student_id = ANY(clean_ids);

  INSERT INTO public.assessment_group_members(
    assignment_id, student_id, academic_year_start, subject, active
  )
  SELECT tgt.id, sid, tgt.academic_year_start, tgt.subject, true
  FROM unnest(clean_ids) AS sid
  ON CONFLICT (assignment_id, student_id)
  DO UPDATE SET
    academic_year_start = EXCLUDED.academic_year_start,
    subject = EXCLUDED.subject,
    active = true;

  GET DIAGNOSTICS moved_count = ROW_COUNT;

  -- Master nama guru hanya merupakan pengampu Tahsin. Untuk transfer Tahfidz
  -- field ini tidak boleh disentuh.
  IF src.subject = 'tahsin' AND src.teacher_id IS DISTINCT FROM tgt.teacher_id THEN
    SELECT
      t.nama,
      coalesce(nullif(trim(t.nama_lengkap), ''), t.nama)
    INTO target_teacher_short, target_teacher_label
    FROM public.teachers t
    WHERE t.id::text = tgt.teacher_id;

    IF target_teacher_short IS NULL THEN
      RAISE EXCEPTION 'Guru kelompok tujuan tidak ditemukan';
    END IF;

    -- Membership tujuan sudah aktif saat master diperbarui. Trigger sinkronisasi
    -- Tahsin akan melihat penugasan yang baru sehingga tidak membuat duplikasi.
    UPDATE public.students s
    SET "nama guru" = target_teacher_short
    WHERE s.id::text = ANY(clean_ids)
      AND s."nama guru" IS DISTINCT FROM target_teacher_short;

    INSERT INTO public.teacher_class_access(user_id, class_name)
    SELECT DISTINCT r.user_id, s.kelas
    FROM public.user_roles r
    JOIN public.students s ON s.id::text = ANY(clean_ids)
    WHERE r.role = 'guru'
      AND r.teacher_id = tgt.teacher_id
    ON CONFLICT DO NOTHING;
  ELSE
    SELECT coalesce(nullif(trim(t.nama_lengkap), ''), t.nama)
      INTO target_teacher_label
    FROM public.teachers t
    WHERE t.id::text = tgt.teacher_id;
  END IF;

  SELECT count(*) INTO source_remaining
  FROM public.assessment_group_members m
  WHERE m.assignment_id = src.id
    AND m.active = true;

  RETURN jsonb_build_object(
    'source_group_id', src.id,
    'target_group_id', tgt.id,
    'subject', src.subject,
    'moved', moved_count,
    'source_remaining', source_remaining,
    'target_teacher_id', tgt.teacher_id,
    'target_teacher_name', coalesce(target_teacher_label, tgt.teacher_id),
    'target_group_name', tgt.class_name
  );
END
$f$;

REVOKE ALL ON FUNCTION public.gm_transfer_group_students(uuid,uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_transfer_group_students(uuid,uuid,text[]) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Verifikasi fungsi tersedia.
SELECT to_regprocedure('public.gm_transfer_group_students(uuid,uuid,text[])') IS NOT NULL AS fungsi_transfer_murid_siap;
