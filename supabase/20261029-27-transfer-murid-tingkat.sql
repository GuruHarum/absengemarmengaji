-- GEMAR MENGAJI 2026/27 — Transfer kelompok dan murid pada tingkat kelas.
-- Perubahan dibatasi pada assignment guru dan keanggotaan aktif; kolom students.kelas
-- dan nama label kelompok tidak diubah. Pemetaan murid divalidasi sebelum mutasi apa pun.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Pindahkan seluruh kelompok dari seorang guru pada satu tingkat.
CREATE OR REPLACE FUNCTION public.gm_transfer_grade_groups(p_group_ids uuid[], p_source_teacher_id text, p_target_teacher_id text, p_grade integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  clean_ids uuid[];
  src public.teaching_assignments%rowtype;
  grp public.teaching_assignments%rowtype;
  target_teacher_short text;
  target_teacher_label text;
  groups_count integer := 0;
  students_count integer := 0;
  active_member_count integer := 0;
  parsed_grade integer;
BEGIN
  IF NOT app_private.is_manager() THEN
    RAISE EXCEPTION 'Hanya koordinator/admin dapat mentransfer kelompok';
  END IF;
  IF p_grade NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION 'Tingkat kelas tidak valid';
  END IF;
  IF coalesce(trim(p_source_teacher_id), '') = ''
     OR coalesce(trim(p_target_teacher_id), '') = ''
     OR p_source_teacher_id = p_target_teacher_id THEN
    RAISE EXCEPTION 'Pilih guru asal dan guru tujuan yang berbeda';
  END IF;
  IF coalesce(cardinality(p_group_ids), 0) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Daftar kelompok tingkat ini kosong atau terlalu banyak';
  END IF;

  SELECT array_agg(DISTINCT x ORDER BY x) INTO clean_ids
  FROM unnest(p_group_ids) AS x;
  IF clean_ids IS NULL
     OR cardinality(clean_ids) <> cardinality(p_group_ids)
     OR EXISTS (SELECT 1 FROM unnest(clean_ids) AS x WHERE x IS NULL) THEN
    RAISE EXCEPTION 'Daftar kelompok kosong atau ganda. Muat ulang daftar';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(
    'gm-grade-teacher:' || coalesce(p_source_teacher_id, '') || ':' ||
    coalesce(p_target_teacher_id, '') || ':' || p_grade::text
  )::bigint);

  SELECT a.* INTO src
  FROM public.teaching_assignments a
  WHERE a.id = ANY(clean_ids)
  ORDER BY a.id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kelompok tidak ditemukan atau sudah berubah';
  END IF;
  IF src.subject NOT IN ('tahsin', 'tahfidz') THEN
    RAISE EXCEPTION 'Jenis pelajaran kelompok tidak valid';
  END IF;

  SELECT t.nama, coalesce(nullif(trim(t.nama_lengkap), ''), t.nama)
  INTO target_teacher_short, target_teacher_label
  FROM public.teachers t
  WHERE t.id::text = p_target_teacher_id
    AND (src.subject <> 'tahsin' OR t.attendance_enabled IS NOT FALSE);
  IF target_teacher_short IS NULL THEN
    RAISE EXCEPTION 'Guru tujuan tidak ditemukan atau tidak mengampu Tahsin';
  END IF;

  SELECT count(*) INTO groups_count
  FROM public.teaching_assignments a
  WHERE a.id = ANY(clean_ids)
    AND a.active = true
    AND a.teacher_id = p_source_teacher_id
    AND a.subject = src.subject
    AND a.academic_year_start = src.academic_year_start;
  IF groups_count <> cardinality(clean_ids) THEN
    RAISE EXCEPTION 'Sebagian kelompok sudah berubah, tidak aktif, atau bukan milik guru asal. Muat ulang daftar';
  END IF;

  FOR grp IN
    SELECT a.*
    FROM public.teaching_assignments a
    WHERE a.id = ANY(clean_ids)
    ORDER BY a.id
    FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.assessment_group_members m
      JOIN public.students s ON s.id::text = m.student_id
      WHERE m.assignment_id = grp.id
        AND m.active = true
        AND substring(s.kelas FROM '^([1-6])')::integer IS DISTINCT FROM p_grade
    ) THEN
      RAISE EXCEPTION 'Kelompok % berisi siswa di luar tingkat %. Tidak ada perubahan yang disimpan', grp.class_name, p_grade;
    END IF;

    SELECT count(*) INTO active_member_count
    FROM public.assessment_group_members m
    WHERE m.assignment_id = grp.id AND m.active = true;

    IF active_member_count = 0 THEN
      parsed_grade := coalesce(
        substring(grp.class_name FROM '/[[:space:]]*([1-6])([[:space:]]|$)')::integer,
        substring(lower(grp.class_name) FROM 'kelas[[:space:]]+([1-6])')::integer
      );
      IF parsed_grade IS DISTINCT FROM p_grade THEN
        RAISE EXCEPTION 'Tingkat kelompok kosong % tidak bisa diverifikasi. Muat ulang atau periksa kelompok tersebut', grp.class_name;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.teaching_assignments
  SET teacher_id = p_target_teacher_id
  WHERE id = ANY(clean_ids);
  GET DIAGNOSTICS groups_count = ROW_COUNT;

  SELECT count(DISTINCT m.student_id) INTO students_count
  FROM public.assessment_group_members m
  WHERE m.assignment_id = ANY(clean_ids)
    AND m.active = true;

  IF src.subject = 'tahsin' THEN
    UPDATE public.students s
    SET "nama guru" = target_teacher_short
    WHERE s.id::text IN (
      SELECT m.student_id
      FROM public.assessment_group_members m
      WHERE m.assignment_id = ANY(clean_ids) AND m.active = true
    )
    AND s."nama guru" IS DISTINCT FROM target_teacher_short;

    INSERT INTO public.teacher_class_access(user_id, class_name)
    SELECT DISTINCT r.user_id, s.kelas
    FROM public.user_roles r
    JOIN public.assessment_group_members m ON m.assignment_id = ANY(clean_ids) AND m.active = true
    JOIN public.students s ON s.id::text = m.student_id
    WHERE r.role = 'guru' AND r.teacher_id = p_target_teacher_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'subject', src.subject,
    'academic_year_start', src.academic_year_start,
    'grade', p_grade,
    'groups_updated', groups_count,
    'students_kept', students_count,
    'target_teacher_id', p_target_teacher_id,
    'teacher_name', target_teacher_label
  );
END
$function$
;
REVOKE ALL ON FUNCTION public.gm_transfer_grade_groups(uuid[], text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_transfer_grade_groups(uuid[], text, text, integer) TO authenticated;

-- Pindahkan siswa dengan tujuan yang otomatis cocok dari kelas dan roster.
CREATE OR REPLACE FUNCTION public.gm_transfer_grade_students(p_subject text, p_year integer, p_source_teacher_id text, p_target_teacher_id text, p_grade integer, p_student_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  clean_ids text[];
  sid text;
  student_class text;
  source_count integer := 0;
  target_teacher_short text;
  target_teacher_label text;
  target_group_id uuid;
  target_group_count integer := 0;
  exact_label_count integer := 0;
  exact_roster_count integer := 0;
  broad_group_count integer := 0;
  exact_label_id uuid;
  exact_roster_id uuid;
  broad_group_id uuid;
  one_group_id uuid;
  candidate record;
  mapping jsonb := '{}'::jsonb;
  used_target_groups integer := 0;
BEGIN
  IF NOT app_private.is_manager() THEN
    RAISE EXCEPTION 'Hanya koordinator/admin dapat mentransfer murid';
  END IF;
  IF p_subject NOT IN ('tahsin', 'tahfidz') OR p_year NOT BETWEEN 2000 AND 2200 OR p_grade NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION 'Pelajaran, tahun ajaran, atau tingkat kelas tidak valid';
  END IF;
  IF coalesce(trim(p_source_teacher_id), '') = ''
     OR coalesce(trim(p_target_teacher_id), '') = ''
     OR p_source_teacher_id = p_target_teacher_id THEN
    RAISE EXCEPTION 'Pilih guru asal dan guru tujuan yang berbeda';
  END IF;
  IF coalesce(cardinality(p_student_ids), 0) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Pilih 1 sampai 1.000 siswa untuk ditransfer';
  END IF;

  SELECT array_agg(DISTINCT trim(x) ORDER BY trim(x)) INTO clean_ids
  FROM unnest(p_student_ids) AS x
  WHERE trim(coalesce(x, '')) <> '';
  IF clean_ids IS NULL
     OR cardinality(clean_ids) <> cardinality(p_student_ids)
     OR EXISTS (
       SELECT 1 FROM unnest(clean_ids) AS x
       WHERE NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id::text = x)
     ) THEN
    RAISE EXCEPTION 'Daftar siswa kosong, ganda, atau sudah berubah';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(
    'gm-grade-student:' || p_subject || ':' || p_year::text || ':' || p_grade::text || ':' ||
    least(p_source_teacher_id, p_target_teacher_id) || ':' || greatest(p_source_teacher_id, p_target_teacher_id)
  )::bigint);

  SELECT t.nama, coalesce(nullif(trim(t.nama_lengkap), ''), t.nama)
  INTO target_teacher_short, target_teacher_label
  FROM public.teachers t
  WHERE t.id::text = p_target_teacher_id
    AND (p_subject <> 'tahsin' OR t.attendance_enabled IS NOT FALSE);
  IF target_teacher_short IS NULL THEN
    RAISE EXCEPTION 'Guru tujuan tidak ditemukan atau tidak mengampu program ini';
  END IF;

  SELECT count(DISTINCT m.student_id) INTO source_count
  FROM public.assessment_group_members m
  JOIN public.teaching_assignments a ON a.id = m.assignment_id
  JOIN public.students s ON s.id::text = m.student_id
  WHERE m.student_id = ANY(clean_ids)
    AND m.subject = p_subject
    AND m.academic_year_start = p_year
    AND m.active = true
    AND a.active = true
    AND a.subject = p_subject
    AND a.academic_year_start = p_year
    AND a.teacher_id = p_source_teacher_id
    AND substring(s.kelas FROM '^([1-6])')::integer = p_grade;
  IF source_count <> cardinality(clean_ids) THEN
    RAISE EXCEPTION 'Sebagian murid bukan anggota aktif guru asal pada tingkat ini. Muat ulang daftar; belum ada murid yang dipindahkan';
  END IF;

  -- Validasi dan tentukan tujuan setiap siswa dahulu. Perubahan baru dilakukan
  -- setelah seluruh siswa mempunyai satu tujuan yang unik.
  FOREACH sid IN ARRAY clean_ids LOOP
    SELECT s.kelas INTO student_class
    FROM public.students s
    WHERE s.id::text = sid;

    target_group_id := NULL;
    target_group_count := 0;
    exact_label_count := 0;
    exact_roster_count := 0;
    broad_group_count := 0;
    exact_label_id := NULL;
    exact_roster_id := NULL;
    broad_group_id := NULL;
    one_group_id := NULL;

    FOR candidate IN
      SELECT
        a.id,
        trim(regexp_replace(a.class_name, '^.*/', '')) AS class_suffix,
        coalesce(
          (
            SELECT min(substring(s2.kelas FROM '^([1-6])')::integer)
            FROM public.assessment_group_members m2
            JOIN public.students s2 ON s2.id::text = m2.student_id
            WHERE m2.assignment_id = a.id
              AND m2.subject = p_subject
              AND m2.academic_year_start = p_year
              AND m2.active = true
          ),
          substring(a.class_name FROM '/[[:space:]]*([1-6])([[:space:]]|$)')::integer,
          substring(lower(a.class_name) FROM 'kelas[[:space:]]+([1-6])')::integer
        ) AS group_grade,
        EXISTS (
          SELECT 1
          FROM public.assessment_group_members m3
          JOIN public.students s3 ON s3.id::text = m3.student_id
          WHERE m3.assignment_id = a.id
            AND m3.subject = p_subject
            AND m3.academic_year_start = p_year
            AND m3.active = true
            AND lower(regexp_replace(trim(s3.kelas), '[[:space:]]+', ' ', 'g')) =
                lower(regexp_replace(trim(student_class), '[[:space:]]+', ' ', 'g'))
        ) AS has_class_roster
      FROM public.teaching_assignments a
      WHERE a.teacher_id = p_target_teacher_id
        AND a.subject = p_subject
        AND a.academic_year_start = p_year
        AND a.active = true
      ORDER BY a.id
      FOR UPDATE OF a
    LOOP
      IF candidate.group_grade IS DISTINCT FROM p_grade THEN
        CONTINUE;
      END IF;

      target_group_count := target_group_count + 1;
      one_group_id := candidate.id;

      IF lower(regexp_replace(trim(candidate.class_suffix), '[[:space:]]+', ' ', 'g')) =
         lower(regexp_replace(trim(student_class), '[[:space:]]+', ' ', 'g')) THEN
        exact_label_count := exact_label_count + 1;
        exact_label_id := candidate.id;
      END IF;
      IF candidate.has_class_roster THEN
        exact_roster_count := exact_roster_count + 1;
        exact_roster_id := candidate.id;
      END IF;
      IF lower(trim(candidate.class_suffix)) = lower('kelas ' || p_grade::text) THEN
        broad_group_count := broad_group_count + 1;
        broad_group_id := candidate.id;
      END IF;
    END LOOP;

    IF target_group_count = 0 THEN
      RAISE EXCEPTION 'Guru tujuan belum memiliki kelompok aktif tingkat %. Buat kelompok tingkat ini terlebih dahulu; tidak ada murid yang dipindahkan', p_grade;
    ELSIF exact_label_count = 1 THEN
      target_group_id := exact_label_id;
    ELSIF exact_label_count > 1 THEN
      RAISE EXCEPTION 'Tujuan kelas % memiliki lebih dari satu kelompok yang cocok. Periksa kelompok guru tujuan; tidak ada murid yang dipindahkan', student_class;
    ELSIF exact_roster_count = 1 THEN
      target_group_id := exact_roster_id;
    ELSIF exact_roster_count > 1 THEN
      RAISE EXCEPTION 'Roster tujuan untuk kelas % tidak unik. Periksa kelompok guru tujuan; tidak ada murid yang dipindahkan', student_class;
    ELSIF broad_group_count = 1 THEN
      target_group_id := broad_group_id;
    ELSIF broad_group_count > 1 THEN
      RAISE EXCEPTION 'Kelompok umum tingkat % pada guru tujuan tidak unik. Periksa kelompok tujuan; tidak ada murid yang dipindahkan', p_grade;
    ELSIF target_group_count = 1 THEN
      target_group_id := one_group_id;
    ELSE
      RAISE EXCEPTION 'Kelas % tidak dapat dipetakan otomatis ke satu kelompok tujuan. Periksa kelompok guru tujuan; tidak ada murid yang dipindahkan', student_class;
    END IF;

    mapping := mapping || jsonb_build_object(sid, target_group_id::text);
  END LOOP;

  UPDATE public.assessment_group_members m
  SET active = false
  WHERE m.student_id = ANY(clean_ids)
    AND m.subject = p_subject
    AND m.academic_year_start = p_year
    AND m.active = true;

  FOREACH sid IN ARRAY clean_ids LOOP
    INSERT INTO public.assessment_group_members(
      assignment_id, student_id, academic_year_start, subject, active
    )
    VALUES ((mapping ->> sid)::uuid, sid, p_year, p_subject, true)
    ON CONFLICT (assignment_id, student_id)
    DO UPDATE SET
      academic_year_start = EXCLUDED.academic_year_start,
      subject = EXCLUDED.subject,
      active = true;
  END LOOP;

  IF p_subject = 'tahsin' THEN
    UPDATE public.students s
    SET "nama guru" = target_teacher_short
    WHERE s.id::text = ANY(clean_ids)
      AND s."nama guru" IS DISTINCT FROM target_teacher_short;

    INSERT INTO public.teacher_class_access(user_id, class_name)
    SELECT DISTINCT r.user_id, s.kelas
    FROM public.user_roles r
    JOIN public.students s ON s.id::text = ANY(clean_ids)
    WHERE r.role = 'guru' AND r.teacher_id = p_target_teacher_id
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT count(DISTINCT value) INTO used_target_groups
  FROM jsonb_each_text(mapping);

  RETURN jsonb_build_object(
    'subject', p_subject,
    'academic_year_start', p_year,
    'grade', p_grade,
    'moved', cardinality(clean_ids),
    'target_groups_used', used_target_groups,
    'target_teacher_id', p_target_teacher_id,
    'target_teacher_name', target_teacher_label
  );
END
$function$
;
REVOKE ALL ON FUNCTION public.gm_transfer_grade_students(text, integer, text, text, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_transfer_grade_students(text, integer, text, text, integer, text[]) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
