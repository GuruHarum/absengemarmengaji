begin;
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
