-- Relasi absensi berbasis ID permanen; nama tetap menjadi label tampilan.
-- Jalankan setelah backup dan uji staging. File ini TIDAK dijalankan otomatis.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION app_private.current_teacher_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN r.teacher_id ~ '^[0-9]+$' THEN r.teacher_id::bigint
        ELSE NULL
    END
    FROM public.user_roles r
    WHERE r.user_id = (SELECT auth.uid())
      AND r.role = 'guru'
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION app_private.current_teacher_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.current_teacher_id() TO authenticated;

-- Helper hanya memvalidasi pasangan ID untuk INSERT baru.
-- Label nama/kelas diverifikasi untuk menjaga konsistensi data yang ditampilkan.
CREATE OR REPLACE FUNCTION app_private.valid_current_tahsin_attendance(
    p_student_id bigint,
    p_teacher_id bigint,
    p_class_id bigint,
    p_date date,
    p_student_name text,
    p_teacher_name text,
    p_class_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.students s
        JOIN public.teachers t ON t.id = p_teacher_id
        JOIN public.student_class_assignments sca
          ON sca.student_id = s.id
         AND sca.academic_year_start =
             (EXTRACT(YEAR FROM p_date)::integer
              - CASE WHEN EXTRACT(MONTH FROM p_date)::integer < 7 THEN 1 ELSE 0 END)
        JOIN public.school_classes sc
          ON sc.id = sca.class_id
         AND sc.academic_year_start = sca.academic_year_start
        JOIN public.assessment_group_members m
          ON m.student_id = s.id::text
         AND m.active
         AND m.subject = 'tahsin'
         AND m.academic_year_start = sca.academic_year_start
        JOIN public.teaching_assignments a
          ON a.id = m.assignment_id
         AND a.active
         AND a.subject = 'tahsin'
         AND a.academic_year_start = m.academic_year_start
         AND a.teacher_id = t.id::text
        WHERE s.id = p_student_id
          AND t.attendance_enabled IS NOT FALSE
          AND sc.id = p_class_id
          AND s."nama siswa" = p_student_name
          AND s.kelas = p_class_name
          AND t.nama = p_teacher_name
          AND sc.normalized_name =
              lower(regexp_replace(trim(p_class_name), '[[:space:]]+', ' ', 'g'))
    );
$$;
REVOKE ALL ON FUNCTION app_private.valid_current_tahsin_attendance(bigint,bigint,bigint,date,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.valid_current_tahsin_attendance(bigint,bigint,bigint,date,text,text,text) TO anon, authenticated;

-- Guru membaca/mengubah/menghapus riwayat milik teacher_id-nya.
-- teacher_class_access tetap membatasi cakupan kelas sebagaimana kebijakan lama.
DROP POLICY IF EXISTS scoped_read ON public.attendance;
DROP POLICY IF EXISTS scoped_insert ON public.attendance;
DROP POLICY IF EXISTS scoped_update ON public.attendance;
DROP POLICY IF EXISTS scoped_delete ON public.attendance;

CREATE POLICY scoped_read ON public.attendance
FOR SELECT TO authenticated
USING (
    app_private.is_manager()
    OR (teacher_id = app_private.current_teacher_id()
        AND app_private.owns_class(class))
);

CREATE POLICY scoped_insert ON public.attendance
FOR INSERT TO authenticated
WITH CHECK (
    app_private.is_manager()
    OR (
        teacher_id = app_private.current_teacher_id()
        AND app_private.owns_class(class)
        AND app_private.valid_current_tahsin_attendance(
            student_id, teacher_id, class_id, date, student, teacher, class
        )
    )
);

CREATE POLICY scoped_update ON public.attendance
FOR UPDATE TO authenticated
USING (
    app_private.is_manager()
    OR (teacher_id = app_private.current_teacher_id()
        AND app_private.owns_class(class))
)
WITH CHECK (
    app_private.is_manager()
    OR (
        teacher_id = app_private.current_teacher_id()
        AND app_private.owns_class(class)
        AND app_private.valid_tahsin_attendance_link(
            student_id, teacher_id, class_id, date, student, class
        )
    )
);

CREATE POLICY scoped_delete ON public.attendance
FOR DELETE TO authenticated
USING (
    app_private.is_manager()
    OR (teacher_id = app_private.current_teacher_id()
        AND app_private.owns_class(class))
);


-- Validasi relasi ID untuk UPDATE; membership historis tetap diakui meski
-- kelompok sudah nonaktif, sehingga koreksi absensi lama tidak terputus.
CREATE OR REPLACE FUNCTION app_private.valid_tahsin_attendance_link(
    p_student_id bigint,
    p_teacher_id bigint,
    p_class_id bigint,
    p_date date,
    p_student_name text,
    p_class_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT EXISTS (
        SELECT 1
        FROM public.students s
        JOIN public.teachers t ON t.id = p_teacher_id
        JOIN public.school_classes sc
          ON sc.id = p_class_id
         AND sc.academic_year_start =
             (EXTRACT(YEAR FROM p_date)::integer
              - CASE WHEN EXTRACT(MONTH FROM p_date)::integer < 7 THEN 1 ELSE 0 END)
        JOIN public.assessment_group_members m
          ON m.student_id = s.id::text
         AND m.subject = 'tahsin'
         AND m.academic_year_start = sc.academic_year_start
        JOIN public.teaching_assignments a
          ON a.id = m.assignment_id
         AND a.subject = 'tahsin'
         AND a.academic_year_start = m.academic_year_start
         AND a.teacher_id = t.id::text
        WHERE s.id = p_student_id
          AND s."nama siswa" = p_student_name
          AND sc.normalized_name =
              lower(regexp_replace(trim(p_class_name), '[[:space:]]+', ' ', 'g'))
    );
$fn$;
REVOKE ALL ON FUNCTION app_private.valid_tahsin_attendance_link(bigint,bigint,bigint,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.valid_tahsin_attendance_link(bigint,bigint,bigint,date,text,text) TO anon, authenticated;

-- Orang tua tetap memilih nama di halaman publik. Trigger BEFORE INSERT yang
-- sudah ada mengisi ID dari kelompok Tahsin aktif; policy memverifikasi ID itu.
DROP POLICY IF EXISTS public_today_insert ON public.attendance;
CREATE POLICY public_today_insert ON public.attendance
FOR INSERT TO anon
WITH CHECK (
    date::text = to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')
    AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_settings WHERE enabled = true
    )
    AND app_private.valid_current_tahsin_attendance(
        student_id, teacher_id, class_id, date, student, teacher, class
    )
);

DROP POLICY IF EXISTS public_today_update ON public.attendance;
CREATE POLICY public_today_update ON public.attendance
FOR UPDATE TO anon
USING (
    date::text = to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')
    AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_settings WHERE enabled = true
    )
)
WITH CHECK (
    date::text = to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')
    AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_settings WHERE enabled = true
    )
    AND app_private.valid_tahsin_attendance_link(
        student_id, teacher_id, class_id, date, student, class
    )
);


-- Resolusi nama guru tetap memakai teacher_id, termasuk bila nama guru duplikat.
CREATE OR REPLACE FUNCTION app_private.teacher_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT t.nama
    FROM public.user_roles r
    JOIN public.teachers t ON t.id::text = r.teacher_id
    WHERE r.user_id = (SELECT auth.uid())
      AND r.role = 'guru'
    LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION app_private.teacher_name() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.teacher_name() TO authenticated;

-- Pemetaan akun dan cakupan kelas diturunkan dari relasi ID kelompok,
-- bukan pencarian students."nama guru".
CREATE OR REPLACE FUNCTION public.assign_school_account(
    account_email text,
    account_role text,
    linked_teacher text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    target uuid;
    teacher_label text;
BEGIN
    IF NOT app_private.is_manager() THEN
        RAISE EXCEPTION 'Akses ditolak';
    END IF;
    IF account_role NOT IN ('admin','koordinator','guru') THEN
        RAISE EXCEPTION 'Role tidak valid';
    END IF;

    SELECT id INTO target
    FROM auth.users
    WHERE lower(email) = lower(trim(account_email));
    IF target IS NULL THEN
        RAISE EXCEPTION 'Email belum terdaftar di Authentication';
    END IF;

    IF account_role = 'guru'
       AND EXISTS (
           SELECT 1 FROM public.user_roles
           WHERE user_id = target AND role IN ('admin','koordinator')
       )
       AND (SELECT count(*) FROM public.user_roles WHERE role IN ('admin','koordinator')) <= 1 THEN
        RAISE EXCEPTION 'Pengelola terakhir tidak dapat diubah menjadi guru';
    END IF;

    IF account_role = 'guru'
       OR (account_role = 'koordinator' AND linked_teacher IS NOT NULL) THEN
        SELECT nama INTO teacher_label
        FROM public.teachers
        WHERE id::text = linked_teacher;
        IF teacher_label IS NULL THEN
            RAISE EXCEPTION 'Pilih guru yang valid';
        END IF;
    END IF;

    LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
    INSERT INTO public.user_roles(user_id, role, teacher_id)
    VALUES (
        target,
        account_role,
        CASE WHEN account_role IN ('guru','koordinator') THEN linked_teacher ELSE NULL END
    )
    ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role, teacher_id = EXCLUDED.teacher_id;

    DELETE FROM public.teacher_class_access WHERE user_id = target;

    IF account_role = 'guru'
       OR (account_role = 'koordinator' AND linked_teacher IS NOT NULL) THEN
        INSERT INTO public.teacher_class_access(user_id, class_name)
        SELECT DISTINCT target, s.kelas
        FROM public.students s
        JOIN public.assessment_group_members m ON m.student_id = s.id::text
        JOIN public.teaching_assignments a ON a.id = m.assignment_id
        WHERE a.teacher_id = linked_teacher
          AND a.subject = 'tahsin'
          AND m.subject = 'tahsin'
          AND s.kelas IS NOT NULL
        ON CONFLICT DO NOTHING;
    END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.assign_school_account(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_school_account(text,text,text) TO authenticated;


-- Kebijakan baca dan ubah master siswa mengikuti kelompok Tahsin berbasis ID.
DROP POLICY IF EXISTS scoped_read ON public.students;
CREATE POLICY scoped_read ON public.students
FOR SELECT TO authenticated
USING (
    app_private.is_manager()
    OR EXISTS (
        SELECT 1
        FROM public.assessment_group_members m
        JOIN public.teaching_assignments a ON a.id = m.assignment_id
        WHERE m.student_id = students.id::text
          AND m.active
          AND a.active
          AND a.teacher_id = (
              SELECT r.teacher_id FROM public.user_roles r
              WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'guru'
          )
          AND a.academic_year_start = m.academic_year_start
    )
);

DROP POLICY IF EXISTS scoped_update ON public.students;
CREATE POLICY scoped_update ON public.students
FOR UPDATE TO authenticated
USING (
    app_private.is_manager()
    OR (
        app_private.owns_class(kelas)
        AND EXISTS (
            SELECT 1
            FROM public.assessment_group_members m
            JOIN public.teaching_assignments a ON a.id = m.assignment_id
            WHERE m.student_id = students.id::text
              AND m.active
              AND a.active
              AND a.teacher_id = (
                  SELECT r.teacher_id FROM public.user_roles r
                  WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'guru'
              )
              AND a.academic_year_start = m.academic_year_start
        )
    )
)
WITH CHECK (
    app_private.is_manager()
    OR (
        app_private.owns_class(kelas)
        AND EXISTS (
            SELECT 1
            FROM public.assessment_group_members m
            JOIN public.teaching_assignments a ON a.id = m.assignment_id
            WHERE m.student_id = students.id::text
              AND m.active
              AND a.active
              AND a.teacher_id = (
                  SELECT r.teacher_id FROM public.user_roles r
                  WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'guru'
              )
              AND a.academic_year_start = m.academic_year_start
        )
    )
);


-- Sinkronisasi identitas siswa mengambil pengampu dari keanggotaan kelompok
-- aktif berdasarkan ID. Nama guru pada students tetap hanya label tampilan.
CREATE OR REPLACE FUNCTION public.gm_sync_student_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
    yr integer;
    teacher_count integer;
    next_teacher bigint;
    next_class bigint;
    class_count integer;
    current_teacher_name text;
BEGIN
    IF OLD."nama siswa" IS NOT DISTINCT FROM NEW."nama siswa"
       AND OLD.kelas IS NOT DISTINCT FROM NEW.kelas
       AND OLD."nama guru" IS NOT DISTINCT FROM NEW."nama guru" THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.students other
        WHERE other.id <> NEW.id
          AND lower(trim(other."nama siswa")) = lower(trim(NEW."nama siswa"))
          AND lower(trim(other.kelas)) = lower(trim(NEW.kelas))
    ) THEN
        RAISE EXCEPTION 'Nama + kelas sudah dimiliki ID siswa lain; periksa duplikasi';
    END IF;

    yr := EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
        - CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta') < 7 THEN 1 ELSE 0 END;

    -- Prioritas pertama: identitas guru dari relasi kelompok Tahsin yang aktif.
    SELECT count(*), min(t.id), min(t.nama)
    INTO teacher_count, next_teacher, current_teacher_name
    FROM public.assessment_group_members m
    JOIN public.teaching_assignments a ON a.id = m.assignment_id
    JOIN public.teachers t ON t.id::text = a.teacher_id
    WHERE m.student_id = NEW.id::text
      AND m.subject = 'tahsin'
      AND m.active
      AND a.subject = 'tahsin'
      AND a.active
      AND m.academic_year_start = yr
      AND a.academic_year_start = yr;

    IF teacher_count > 1 THEN
        RAISE EXCEPTION 'Siswa % memiliki lebih dari satu kelompok Tahsin aktif', NEW.id;
    END IF;

    -- Siswa baru/belum masuk kelompok masih boleh dipetakan dari nama yang dipilih.
    IF teacher_count = 0 AND NEW."nama guru" IS DISTINCT FROM 'Belum ditugaskan' THEN
        SELECT count(*), min(id), min(nama)
        INTO teacher_count, next_teacher, current_teacher_name
        FROM public.teachers
        WHERE nama = NEW."nama guru"
          AND attendance_enabled IS NOT FALSE;
        IF teacher_count <> 1 THEN
            RAISE EXCEPTION 'Guru Tahsin tidak ditemukan atau ambigu';
        END IF;
    END IF;

    SELECT count(*), min(id)
    INTO class_count, next_class
    FROM public.school_classes
    WHERE academic_year_start = yr
      AND normalized_name = lower(regexp_replace(trim(NEW.kelas), '[[:space:]]+', ' ', 'g'));
    IF class_count <> 1 THEN
        RAISE EXCEPTION 'Kelas baru belum terdaftar unik di school_classes untuk %', yr;
    END IF;

    IF OLD.kelas IS DISTINCT FROM NEW.kelas
       OR OLD."nama guru" IS DISTINCT FROM NEW."nama guru" THEN
        IF EXISTS (
            SELECT 1 FROM public.subject_assessments
            WHERE student_id = NEW.id::text
              AND academic_year_start = yr
              AND (OLD.kelas IS DISTINCT FROM NEW.kelas OR subject = 'tahsin')
        )
        OR EXISTS (
            SELECT 1 FROM public.periodic_assessments
            WHERE student_id = NEW.id::text AND academic_year_start = yr
        )
        OR EXISTS (
            SELECT 1 FROM public.student_reports
            WHERE student_id = NEW.id::text
              AND academic_year_start = yr
              AND status IN ('DIAJUKAN','DISETUJUI')
        ) THEN
            RAISE EXCEPTION 'Perubahan kelas/guru siswa yang sudah dinilai perlu peninjauan koordinator; nilai tidak diubah otomatis';
        END IF;
    END IF;

    UPDATE public.attendance
    SET student = NEW."nama siswa"
    WHERE student_id = NEW.id
      AND student IS DISTINCT FROM NEW."nama siswa";

    IF OLD.kelas IS DISTINCT FROM NEW.kelas
       OR OLD."nama guru" IS DISTINCT FROM NEW."nama guru" THEN
        IF next_teacher IS NULL AND EXISTS (
            SELECT 1 FROM public.attendance
            WHERE student_id = NEW.id
              AND date >= make_date(yr, 7, 1)
              AND date < make_date(yr + 1, 7, 1)
        ) THEN
            RAISE EXCEPTION 'Siswa berabsensi tidak boleh kehilangan guru Tahsin';
        END IF;

        UPDATE public.attendance
        SET class = NEW.kelas,
            teacher = COALESCE(current_teacher_name, NEW."nama guru"),
            class_id = next_class,
            teacher_id = next_teacher
        WHERE student_id = NEW.id
          AND date >= make_date(yr, 7, 1)
          AND date < make_date(yr + 1, 7, 1);

        UPDATE public.student_class_assignments
        SET class_id = next_class
        WHERE student_id = NEW.id AND academic_year_start = yr;

        INSERT INTO public.student_class_assignments(student_id, class_id, academic_year_start)
        SELECT NEW.id, next_class, yr
        WHERE NOT EXISTS (
            SELECT 1 FROM public.student_class_assignments
            WHERE student_id = NEW.id AND academic_year_start = yr
        );

        INSERT INTO public.teacher_class_access(user_id, class_name)
        SELECT user_id, NEW.kelas
        FROM public.user_roles
        WHERE next_teacher IS NOT NULL
          AND teacher_id = next_teacher::text
          AND role = 'guru'
        ON CONFLICT DO NOTHING;
    END IF;

    UPDATE public.report_period_students rp
    SET student_name = NEW."nama siswa",
        class_name = NEW.kelas
    WHERE rp.student_id = NEW.id::text
      AND NOT EXISTS (
          SELECT 1 FROM public.subject_assessments sa
          WHERE sa.student_id = rp.student_id
            AND sa.academic_year_start = rp.academic_year_start
            AND sa.period = rp.period
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.periodic_assessments pa
          WHERE pa.student_id = rp.student_id
            AND pa.academic_year_start = rp.academic_year_start
            AND pa.period = rp.period
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.student_reports sr
          WHERE sr.student_id = rp.student_id
            AND sr.academic_year_start = rp.academic_year_start
            AND sr.period = rp.period
            AND sr.status IN ('DIAJUKAN','DISETUJUI')
      );

    RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.gm_sync_student_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_sync_student_identity() TO authenticated;


COMMIT;

-- Verifikasi setelah penerapan:
-- 1. Guru dengan teacher_id yang sama tetap dapat membaca riwayat walau label teacher berubah.
-- 2. Guru lain tidak dapat membaca/mengubah riwayat tersebut.
-- 3. Insert publik hanya berhasil jika trigger mengisi tiga ID dari kelompok Tahsin aktif.
-- 4. Coba absensi publik, edit status hari ini, dan riwayat lama sebelum deploy aplikasi.
