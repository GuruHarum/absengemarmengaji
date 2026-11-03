begin;
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated;
create table if not exists public.user_roles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role text not null check (role in ('admin','koordinator','guru')),
    teacher_id text,
    constraint user_roles_teacher_link_check check ((role = 'guru' and teacher_id is not null) or role = 'koordinator' or (role = 'admin' and teacher_id is null))
);
create table if not exists public.teacher_class_access (
    user_id uuid references public.user_roles(user_id) on delete cascade,
    class_name text not null,
    primary key(user_id, class_name)
);
create or replace function app_private.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.user_roles where user_id = (select auth.uid()) and role in ('admin','koordinator'));
$$;
create or replace function app_private.teacher_name() returns text
language sql stable security definer set search_path = '' as $$
 select t.nama from public.user_roles r join public.teachers t on t.id::text = r.teacher_id
 where r.user_id = (select auth.uid()) and r.role = 'guru'
 and (select count(*) from public.teachers same_name where same_name.nama = t.nama) = 1;
$$;
create or replace function app_private.owns_class(value text) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.teacher_class_access where user_id = (select auth.uid()) and class_name = value);
$$;
revoke all on function app_private.is_manager(), app_private.teacher_name(), app_private.owns_class(text) from public;
grant execute on function app_private.is_manager(), app_private.teacher_name(), app_private.owns_class(text) to anon, authenticated;

do $$ declare item record; begin
 for item in select schemaname, tablename, policyname from pg_policies
 where schemaname = 'public' and tablename in ('user_roles','teacher_class_access','teachers','students','attendance','school_profile','maintenance_settings')
 loop execute format('drop policy %I on %I.%I', item.policyname, item.schemaname, item.tablename); end loop;
end $$;
alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
alter table public.teacher_class_access enable row level security;
revoke all on public.teacher_class_access from anon, authenticated;
grant select, insert, update, delete on public.teacher_class_access to authenticated;
alter table public.teachers enable row level security;
revoke all on public.teachers from anon, authenticated;
grant select, insert, update, delete on public.teachers to authenticated;
alter table public.students enable row level security;
revoke all on public.students from anon, authenticated;
grant select, insert, update, delete on public.students to authenticated;
alter table public.attendance enable row level security;
revoke all on public.attendance from anon, authenticated;
grant select, insert, update, delete on public.attendance to authenticated;
alter table public.school_profile enable row level security;
revoke all on public.school_profile from anon, authenticated;
grant select, insert, update, delete on public.school_profile to authenticated;
alter table public.maintenance_settings enable row level security;
revoke all on public.maintenance_settings from anon, authenticated;
grant select, insert, update, delete on public.maintenance_settings to authenticated;

create policy role_read on public.user_roles for select to authenticated using (user_id = (select auth.uid()) or app_private.is_manager());
revoke insert, update, delete on public.user_roles from authenticated;
create policy class_read on public.teacher_class_access for select to authenticated using (user_id = (select auth.uid()) or app_private.is_manager());
revoke insert, update, delete on public.teacher_class_access from authenticated;
create policy teacher_read on public.teachers for select to authenticated using (app_private.is_manager() or nama = app_private.teacher_name());
create policy teacher_insert on public.teachers for insert to authenticated with check (app_private.is_manager());
create policy teacher_delete on public.teachers for delete to authenticated using (app_private.is_manager());
create policy teacher_update on public.teachers for update to authenticated using (app_private.is_manager() or nama = app_private.teacher_name()) with check (app_private.is_manager() or nama = app_private.teacher_name());
create or replace function app_private.protect_teacher_identity() returns trigger
language plpgsql security definer set search_path = '' as $$ begin
 if auth.uid() is not null and not app_private.is_manager() and (to_jsonb(new) - 'foto') is distinct from (to_jsonb(old) - 'foto') then
   raise exception 'Guru hanya dapat memperbarui foto profil sendiri';
 end if;
 return new;
end $$;
drop trigger if exists protect_teacher_identity on public.teachers;
create trigger protect_teacher_identity before update on public.teachers for each row execute function app_private.protect_teacher_identity();
create policy scoped_read on public.students for select to authenticated using (app_private.is_manager() or ("nama guru" = app_private.teacher_name() and app_private.owns_class(kelas)));
create policy scoped_insert on public.students for insert to authenticated with check (app_private.is_manager() or (("nama guru" = app_private.teacher_name() and app_private.owns_class(kelas))));
create policy scoped_update on public.students for update to authenticated using (app_private.is_manager() or ("nama guru" = app_private.teacher_name() and app_private.owns_class(kelas))) with check (app_private.is_manager() or (("nama guru" = app_private.teacher_name() and app_private.owns_class(kelas))));
create policy scoped_delete on public.students for delete to authenticated using (app_private.is_manager() or ("nama guru" = app_private.teacher_name() and app_private.owns_class(kelas)));
create policy scoped_read on public.attendance for select to authenticated using (app_private.is_manager() or (teacher = app_private.teacher_name() and app_private.owns_class(class)));
create policy scoped_insert on public.attendance for insert to authenticated with check (app_private.is_manager() or ((teacher = app_private.teacher_name() and app_private.owns_class(class)) and exists (select 1 from public.students s where s."nama siswa" = attendance.student and s."nama guru" = attendance.teacher and s.kelas = attendance.class)));
create policy scoped_update on public.attendance for update to authenticated using (app_private.is_manager() or (teacher = app_private.teacher_name() and app_private.owns_class(class))) with check (app_private.is_manager() or ((teacher = app_private.teacher_name() and app_private.owns_class(class)) and exists (select 1 from public.students s where s."nama siswa" = attendance.student and s."nama guru" = attendance.teacher and s.kelas = attendance.class)));
create policy scoped_delete on public.attendance for delete to authenticated using (app_private.is_manager() or (teacher = app_private.teacher_name() and app_private.owns_class(class)));
grant select on public.school_profile to anon;
create policy public_read on public.school_profile for select to anon, authenticated using (true);
create policy manager_write on public.school_profile for all to authenticated using (app_private.is_manager()) with check (app_private.is_manager());
grant select on public.maintenance_settings to anon;
create policy public_read on public.maintenance_settings for select to anon, authenticated using (true);
create policy manager_write on public.maintenance_settings for all to authenticated using (app_private.is_manager()) with check (app_private.is_manager());

drop policy if exists school_image_insert_guard on storage.objects;
drop policy if exists school_image_update_guard on storage.objects;
drop policy if exists school_image_delete_guard on storage.objects;
create policy school_image_insert_guard on storage.objects as restrictive for insert to anon, authenticated with check (bucket_id <> 'teachers' or app_private.is_manager());
create policy school_image_update_guard on storage.objects as restrictive for update to anon, authenticated using (bucket_id <> 'teachers' or app_private.is_manager()) with check (bucket_id <> 'teachers' or app_private.is_manager());
create policy school_image_delete_guard on storage.objects as restrictive for delete to anon, authenticated using (bucket_id <> 'teachers' or app_private.is_manager());
drop policy if exists manager_image_write on storage.objects;
create policy manager_image_write on storage.objects for all to authenticated using (bucket_id = 'teachers' and app_private.is_manager()) with check (bucket_id = 'teachers' and app_private.is_manager());

create or replace function public.assign_school_account(account_email text, account_role text, linked_teacher text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid; teacher_label text;
begin
 if not app_private.is_manager() then raise exception 'Akses ditolak'; end if;
 if account_role not in ('admin','koordinator','guru') then raise exception 'Role tidak valid'; end if;
 select id into target from auth.users where lower(email) = lower(trim(account_email));
 if target is null then raise exception 'Email belum terdaftar di Authentication'; end if;
 lock table public.user_roles in share row exclusive mode;
 if account_role = 'guru' and exists(select 1 from public.user_roles where user_id = target and role in ('admin','koordinator'))
 and (select count(*) from public.user_roles where role in ('admin','koordinator')) <= 1 then raise exception 'Pengelola terakhir tidak dapat diubah menjadi guru'; end if;
 if account_role = 'guru' or (account_role = 'koordinator' and linked_teacher is not null) then
   select nama into teacher_label from public.teachers where id::text = linked_teacher;
   if teacher_label is null then raise exception 'Pilih guru yang valid'; end if;
   if (select count(*) from public.teachers where nama = teacher_label) <> 1 then raise exception 'Nama guru duplikat; rapikan nama sebelum memetakan akun'; end if;
 end if;
 insert into public.user_roles(user_id, role, teacher_id) values (target, account_role, case when account_role in ('guru','koordinator') then linked_teacher else null end)
 on conflict (user_id) do update set role = excluded.role, teacher_id = excluded.teacher_id;
 delete from public.teacher_class_access where user_id = target;
 if account_role = 'guru' or (account_role = 'koordinator' and linked_teacher is not null) then
   insert into public.teacher_class_access(user_id, class_name)
   select distinct target, kelas from public.students where "nama guru" = teacher_label and kelas is not null;
 end if;
end $$;
create or replace function public.list_school_accounts()
returns table(email text, role text, teacher_name text) language plpgsql security definer set search_path = '' as $$ begin
 if not app_private.is_manager() then raise exception 'Akses ditolak'; end if;
 return query select u.email::text, r.role, t.nama::text from public.user_roles r join auth.users u on u.id = r.user_id left join public.teachers t on t.id::text = r.teacher_id order by u.email;
end $$;
revoke all on function public.assign_school_account(text,text,text), public.list_school_accounts() from public, anon;
grant execute on function public.assign_school_account(text,text,text), public.list_school_accounts() to authenticated;
grant select on public.teachers, public.students to anon;
grant select, insert, update, delete on public.attendance to anon;
drop policy if exists public_roster on public.teachers;
create policy public_roster on public.teachers for select to anon using (true);
drop policy if exists public_roster on public.students;
create policy public_roster on public.students for select to anon using (true);
drop policy if exists public_today_read on public.attendance;
create policy public_today_read on public.attendance for select to anon
using (date::text = to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD'));
drop policy if exists public_today_insert on public.attendance;
create policy public_today_insert on public.attendance for insert to anon
with check (date::text = to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD') and not exists (select 1 from public.maintenance_settings where enabled = true) and exists (select 1 from public.students s where s."nama siswa" = attendance.student and s."nama guru" = attendance.teacher and s.kelas = attendance.class))
;
drop policy if exists public_today_update on public.attendance;
create policy public_today_update on public.attendance for update to anon
using (date::text = to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD') and not exists (select 1 from public.maintenance_settings where enabled = true))
with check (date::text = to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD') and not exists (select 1 from public.maintenance_settings where enabled = true) and exists (select 1 from public.students s where s."nama siswa" = attendance.student and s."nama guru" = attendance.teacher and s.kelas = attendance.class))
;
drop policy if exists public_today_delete on public.attendance;
create policy public_today_delete on public.attendance for delete to anon
using (date::text = to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD') and not exists (select 1 from public.maintenance_settings where enabled = true))
;
do $$ declare seq text; begin
 seq := pg_get_serial_sequence('public.attendance', 'id');
 if seq is not null then execute format('grant usage on sequence %s to anon', seq); end if;
end $$;

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


-- Resolusi nama guru tetap memakai teacher_id, termasuk bila nama guru duplikat.
CREATE OR REPLACE FUNCTION app_private.teacher_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $
    SELECT t.nama
    FROM public.user_roles r
    JOIN public.teachers t ON t.id::text = r.teacher_id
    WHERE r.user_id = (SELECT auth.uid())
      AND r.role = 'guru'
    LIMIT 1;
$;
REVOKE ALL ON FUNCTION app_private.teacher_name() FROM PUBLIC;
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
AS $
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
$;
REVOKE ALL ON FUNCTION public.assign_school_account(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_school_account(text,text,text) TO authenticated;



-- Kebijakan baca siswa guru berbasis kelompok Tahsin dan teacher_id.
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
              SELECT r.teacher_id
              FROM public.user_roles r
              WHERE r.user_id = (SELECT auth.uid())
                AND r.role = 'guru'
          )
          AND a.academic_year_start = m.academic_year_start
    )
);

-- Profil guru dibaca/diperbarui melalui ID, bukan nama yang dapat berubah.
DROP POLICY IF EXISTS teacher_read ON public.teachers;
CREATE POLICY teacher_read ON public.teachers
FOR SELECT TO authenticated
USING (
    app_private.is_manager()
    OR id::text = (
        SELECT r.teacher_id
        FROM public.user_roles r
        WHERE r.user_id = (SELECT auth.uid())
    )
);
DROP POLICY IF EXISTS teacher_update ON public.teachers;
CREATE POLICY teacher_update ON public.teachers
FOR UPDATE TO authenticated
USING (
    app_private.is_manager()
    OR id::text = (
        SELECT r.teacher_id
        FROM public.user_roles r
        WHERE r.user_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    app_private.is_manager()
    OR id::text = (
        SELECT r.teacher_id
        FROM public.user_roles r
        WHERE r.user_id = (SELECT auth.uid())
    )
);

commit;
