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

commit;
