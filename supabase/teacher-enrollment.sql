begin;
grant select on public.user_roles to service_role;
CREATE OR REPLACE FUNCTION public.provision_teacher_account(
    actor_id uuid,
    account_id uuid,
    linked_teacher text DEFAULT NULL,
    teacher_label text DEFAULT NULL,
    full_label text DEFAULT NULL,
    show_attendance boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    teacher_key text;
    label text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = actor_id AND role IN ('admin','koordinator')
    ) THEN
        RAISE EXCEPTION 'Hanya pengelola dapat membuat akun guru';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = account_id) THEN
        RAISE EXCEPTION 'Akun Authentication tidak ditemukan';
    END IF;

    LOCK TABLE public.teachers IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = account_id) THEN
        RAISE EXCEPTION 'Akun sudah diberi akses';
    END IF;

    IF linked_teacher IS NOT NULL THEN
        SELECT nama INTO label
        FROM public.teachers
        WHERE id::text = linked_teacher;
        IF label IS NULL THEN
            RAISE EXCEPTION 'Guru tidak ditemukan';
        END IF;
        teacher_key := linked_teacher;
        IF EXISTS (SELECT 1 FROM public.user_roles WHERE teacher_id = teacher_key) THEN
            RAISE EXCEPTION 'Guru sudah memiliki akun. Gunakan pemetaan akun yang tersedia';
        END IF;
    ELSE
        label := trim(teacher_label);
        IF label IS NULL OR length(label) NOT BETWEEN 1 AND 80
           OR full_label IS NULL OR length(trim(full_label)) NOT BETWEEN 1 AND 160 THEN
            RAISE EXCEPTION 'Nama guru dan nama lengkap wajib diisi';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.teachers
            WHERE lower(trim(nama)) = lower(label)
        ) THEN
            RAISE EXCEPTION 'Nama guru sudah ada. Pilih data guru yang sudah tersedia';
        END IF;
        INSERT INTO public.teachers(nama,nama_lengkap,attendance_enabled)
        VALUES(label,trim(full_label),coalesce(show_attendance,true))
        RETURNING id::text INTO teacher_key;
    END IF;

    INSERT INTO public.user_roles(user_id,role,teacher_id)
    VALUES(account_id,'guru',teacher_key);

    INSERT INTO public.teacher_class_access(user_id,class_name)
    SELECT DISTINCT account_id,s.kelas
    FROM public.students s
    JOIN public.assessment_group_members m ON m.student_id=s.id::text
    JOIN public.teaching_assignments a ON a.id=m.assignment_id
    WHERE a.teacher_id=teacher_key
      AND a.subject='tahsin'
      AND m.subject='tahsin'
      AND s.kelas IS NOT NULL
    ON CONFLICT DO NOTHING;

    RETURN teacher_key;
END;
$fn$;
revoke all on function public.provision_teacher_account(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.provision_teacher_account(uuid,uuid,text,text,text,boolean) to service_role;
commit;
notify pgrst,'reload schema';
