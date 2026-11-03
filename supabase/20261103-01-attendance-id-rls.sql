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
    OR (teacher_id = app_private.current_teacher_id()
        AND app_private.owns_class(class))
);

CREATE POLICY scoped_delete ON public.attendance
FOR DELETE TO authenticated
USING (
    app_private.is_manager()
    OR (teacher_id = app_private.current_teacher_id()
        AND app_private.owns_class(class))
);

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
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance.student_id)
    AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = attendance.teacher_id)
    AND EXISTS (SELECT 1 FROM public.school_classes sc WHERE sc.id = attendance.class_id)
);

COMMIT;

-- Verifikasi setelah penerapan:
-- 1. Guru dengan teacher_id yang sama tetap dapat membaca riwayat walau label teacher berubah.
-- 2. Guru lain tidak dapat membaca/mengubah riwayat tersebut.
-- 3. Insert publik hanya berhasil jika trigger mengisi tiga ID dari kelompok Tahsin aktif.
-- 4. Coba absensi publik, edit status hari ini, dan riwayat lama sebelum deploy aplikasi.
