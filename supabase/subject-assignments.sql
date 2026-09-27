begin;
alter table public.teachers add column if not exists nama_lengkap text;
alter table public.teachers add column if not exists attendance_enabled boolean not null default true;
drop policy if exists public_roster on public.teachers;
create policy public_roster on public.teachers for select to anon using (attendance_enabled);

create or replace function app_private.teacher_name() returns text
language sql stable security definer set search_path='' as $$
 select t.nama from public.user_roles r join public.teachers t on t.id::text=r.teacher_id
 where r.user_id=auth.uid() and r.role='guru' and t.attendance_enabled
 and (select count(*) from public.teachers same_name where same_name.nama=t.nama)=1;
$$;
drop policy if exists teacher_read on public.teachers;
create policy teacher_read on public.teachers for select to authenticated using (
 app_private.is_manager() or id::text=(select teacher_id from public.user_roles where user_id=auth.uid())
);
drop policy if exists teacher_update on public.teachers;
create policy teacher_update on public.teachers for update to authenticated
 using (app_private.is_manager() or id::text=(select teacher_id from public.user_roles where user_id=auth.uid()))
 with check (app_private.is_manager() or id::text=(select teacher_id from public.user_roles where user_id=auth.uid()));

create table if not exists public.teaching_assignments (
 id uuid primary key default gen_random_uuid(),
 teacher_id text not null,
 subject text not null check(subject in ('tahsin','tahfidz')),
 class_name text not null check(length(trim(class_name)) > 0),
 academic_year_start integer not null check(academic_year_start between 2000 and 2200),
 active boolean not null default true,
 created_at timestamptz not null default now(), created_by uuid,
 ended_at timestamptz, ended_by uuid
);
create unique index if not exists teaching_assignment_active on public.teaching_assignments(academic_year_start,subject,class_name) where active;
alter table public.teaching_assignments enable row level security;
revoke all on public.teaching_assignments from anon, authenticated;
grant select on public.teaching_assignments to authenticated;
drop policy if exists assignments_read on public.teaching_assignments;
create policy assignments_read on public.teaching_assignments for select to authenticated using (
 app_private.is_manager() or teacher_id = (select teacher_id from public.user_roles where user_id=auth.uid())
);

create table if not exists public.subject_assessments (
 id uuid primary key default gen_random_uuid(), student_id text not null,
 academic_year_start integer not null check(academic_year_start between 2000 and 2200),
 period text not null check(period in ('pts_ganjil','pas_ganjil','pts_genap','pas_genap')),
 subject text not null check(subject in ('tahsin','tahfidz')),
 teacher_id text, assignment_id uuid references public.teaching_assignments(id),
 student_name text not null, class_name text not null, teacher_name text,
 scores jsonb not null, needs_review boolean not null default false,
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid, updated_by uuid,
 unique(student_id,academic_year_start,period,subject)
);
create table if not exists public.subject_assessment_history (
 id bigint generated always as identity primary key,
 assessment_id uuid not null references public.subject_assessments(id),
 previous_record jsonb not null, changed_at timestamptz not null default now(), changed_by uuid
);
alter table public.subject_assessments enable row level security;
alter table public.subject_assessment_history enable row level security;
revoke all on public.subject_assessments, public.subject_assessment_history from anon, authenticated;
grant select on public.subject_assessments, public.subject_assessment_history to authenticated;
drop policy if exists history_read on public.subject_assessment_history;
create policy history_read on public.subject_assessment_history for select to authenticated using (app_private.is_manager());

create or replace function app_private.can_assess_subject(student_key text, year_key integer, subject_key text, teacher_key text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teaching_assignments a join public.students s on s.kelas=a.class_name
 where s.id::text=student_key and a.active and a.academic_year_start=year_key and a.subject=subject_key and a.teacher_id=teacher_key
 and (app_private.is_manager() or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.teacher_id=teacher_key and r.role='guru')));
$$;
revoke all on function app_private.can_assess_subject(text,integer,text,text) from public, anon;
grant execute on function app_private.can_assess_subject(text,integer,text,text) to authenticated;
drop policy if exists subject_read on public.subject_assessments;
create policy subject_read on public.subject_assessments for select to authenticated using (
 app_private.is_manager() or exists(select 1 from public.user_roles r where r.user_id=auth.uid()
 and app_private.can_assess_subject(student_id,academic_year_start,subject,r.teacher_id))
);

insert into public.subject_assessments(student_id,academic_year_start,period,subject,teacher_id,student_name,class_name,teacher_name,scores,needs_review,version,created_at,updated_at,created_by,updated_by)
select p.student_id,p.academic_year_start,p.period,x.subject,
 case when x.subject='tahsin' then p.teacher_id else null end,p.student_name,p.class_name,p.teacher_name,
 (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(p)) where key like x.subject || '_%'),
 x.subject='tahfidz',p.version,p.created_at,p.updated_at,p.created_by,p.updated_by
from public.periodic_assessments p cross join (values('tahsin'),('tahfidz')) x(subject)
on conflict(student_id,academic_year_start,period,subject) do nothing;
revoke insert,update,delete on public.periodic_assessments from authenticated;
revoke execute on function public.save_periodic_assessments(jsonb) from public,anon,authenticated;
drop policy if exists assessment_read on public.periodic_assessments;
create policy assessment_read on public.periodic_assessments for select to authenticated using (app_private.is_manager());

insert into public.teaching_assignments(teacher_id,subject,class_name,academic_year_start)
select min(t.id::text),'tahsin',s.kelas,
 extract(year from now() at time zone 'Asia/Jakarta')::int - case when extract(month from now() at time zone 'Asia/Jakarta')<7 then 1 else 0 end
from public.students s join public.teachers t on t.nama=s."nama guru"
where t.attendance_enabled and s.kelas is not null and trim(s.kelas)<>''
and not exists(select 1 from public.teaching_assignments a where a.subject='tahsin' and a.class_name=s.kelas
 and a.academic_year_start=extract(year from now() at time zone 'Asia/Jakarta')::int - case when extract(month from now() at time zone 'Asia/Jakarta')<7 then 1 else 0 end)
group by s.kelas having count(distinct t.id)=1
on conflict do nothing;

create or replace function public.manage_teaching_assignment(action text, target_id uuid default null, teacher_key text default null,
 subject_key text default null, class_key text default null, year_key integer default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not app_private.is_manager() then raise exception 'Hanya pengelola dapat mengatur penugasan'; end if;
 if action='end' then
  update public.teaching_assignments set active=false,ended_at=now(),ended_by=auth.uid() where id=target_id and active;
  if not found then raise exception 'Penugasan sudah berubah. Muat ulang daftar'; end if;
 elsif action='create' then
  if not exists(select 1 from public.teachers where id::text=teacher_key) then raise exception 'Guru tidak ditemukan'; end if;
  if not exists(select 1 from public.students where kelas=class_key) then raise exception 'Kelas tidak ditemukan'; end if;
  insert into public.teaching_assignments(teacher_id,subject,class_name,academic_year_start,created_by)
  values(teacher_key,subject_key,class_key,year_key,auth.uid());
 else raise exception 'Tindakan tidak valid'; end if;
exception when unique_violation then raise exception 'Kelas dan pelajaran ini sudah mempunyai pengampu aktif. Akhiri penugasan lama terlebih dahulu';
end $$;

create or replace function public.assessment_roster(teacher_key text, year_key integer, subject_key text)
returns table(id text,"nama siswa" text,kelas text) language sql stable security definer set search_path='' as $$
 select s.id::text,s."nama siswa"::text,s.kelas::text from public.students s
 where app_private.can_assess_subject(s.id::text,year_key,subject_key,teacher_key) order by s.id;
$$;

create or replace function public.save_subject_assessments(entries jsonb)
returns setof public.subject_assessments language plpgsql security definer set search_path='' as $$
declare item jsonb; previous public.subject_assessments; saved public.subject_assessments;
 assignment public.teaching_assignments; pupil record; teacher_label text;
 expected integer; yr integer; sub text; score_data jsonb; field text; raw text; n numeric; max_ayah integer;
begin
 if auth.uid() is null then raise exception 'Login diperlukan'; end if;
 if entries is null or jsonb_typeof(entries)<>'array' then raise exception 'Daftar nilai tidak valid'; end if;
 if jsonb_array_length(entries) not between 1 and 1000 then raise exception 'Simpan 1 sampai 1000 siswa per permintaan'; end if;
 for item in select * from jsonb_array_elements(entries) loop
  yr := (item->>'academic_year_start')::integer; sub := item->>'subject'; expected := (item->>'version')::integer;
  if expected is null or expected<0 then raise exception 'Versi tidak valid'; end if;
  if not app_private.can_assess_subject(item->>'student_id',yr,sub,item->>'teacher_id') then raise exception 'Tidak ada penugasan aktif untuk siswa dan pelajaran ini'; end if;
  select s."nama siswa" as name,s.kelas as class into pupil from public.students s where s.id::text=item->>'student_id' for share;
  select * into assignment from public.teaching_assignments a where a.active and a.class_name=pupil.class and a.teacher_id=item->>'teacher_id' and a.subject=sub and a.academic_year_start=yr for share;
  if not found then raise exception 'Penugasan telah berubah. Muat ulang'; end if;
  select coalesce(nullif(trim(t.nama_lengkap),''),t.nama) into teacher_label from public.teachers t where t.id::text=assignment.teacher_id;
  score_data := '{}'::jsonb;
  foreach field in array (case when sub='tahsin' then array['tahsin_makhraj','tahsin_tajwid','tahsin_tartil','tahsin_gharib'] else array['tahfidz_makhraj','tahfidz_tajwid','tahfidz_hafalan'] end) loop
   raw := item->>field;
   if field='tahsin_gharib' and (raw is null or raw='') then score_data := score_data || jsonb_build_object(field,null); continue; end if;
   if raw is null or raw !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' then raise exception 'Nilai % wajib angka 0-100 maksimal dua desimal',field; end if;
   n := raw::numeric;
   if n<0 or n>100 then raise exception 'Nilai harus 0-100'; end if;
   score_data := score_data || jsonb_build_object(field,n);
  end loop;
  if sub='tahsin' then
   raw := trim(item->>'tahsin_book');
   if raw is null or length(raw) not between 1 and 80 then raise exception 'Buku/Jilid wajib diisi'; end if;
   score_data := score_data || jsonb_build_object('tahsin_book',raw);
   raw := item->>'tahsin_page';
   if raw is null or raw !~ '^[0-9]+$' or raw::numeric not between 1 and 2147483647 then raise exception 'Halaman tidak valid'; end if;
   score_data := score_data || jsonb_build_object('tahsin_page',raw::integer);
  else
   select ayahs into max_ayah from public.quran_surahs where number=(item->>'tahfidz_surah')::integer;
   raw := item->>'tahfidz_ayah';
   if max_ayah is null or raw is null or raw !~ '^[0-9]+$' or raw::numeric not between 1 and max_ayah then raise exception 'Surat atau ayat tidak valid'; end if;
   score_data := score_data || jsonb_build_object('tahfidz_surah',(item->>'tahfidz_surah')::integer,'tahfidz_ayah',raw::integer);
  end if;
  if expected=0 then
   insert into public.subject_assessments(student_id,academic_year_start,period,subject,teacher_id,assignment_id,student_name,class_name,teacher_name,scores,created_by,updated_by)
   values(item->>'student_id',yr,item->>'period',sub,assignment.teacher_id,assignment.id,pupil.name,pupil.class,teacher_label,score_data,auth.uid(),auth.uid()) returning * into saved;
  else
   select * into previous from public.subject_assessments where student_id=item->>'student_id' and academic_year_start=yr and period=item->>'period' and subject=sub for update;
   if not found or previous.version<>expected then raise exception 'Nilai sudah berubah. Muat ulang sebelum menyimpan'; end if;
   if previous.needs_review and not app_private.is_manager() then raise exception 'Nilai Tahfidz lama perlu diverifikasi pengelola terlebih dahulu'; end if;
   insert into public.subject_assessment_history(assessment_id,previous_record,changed_by) values(previous.id,to_jsonb(previous),auth.uid());
   update public.subject_assessments set teacher_id=assignment.teacher_id,assignment_id=assignment.id,
    teacher_name=case when teacher_id=assignment.teacher_id and not needs_review then teacher_name else teacher_label end,
    scores=score_data,needs_review=false,version=version+1,updated_at=now(),updated_by=auth.uid()
    where id=previous.id returning * into saved;
  end if;
  return next saved;
 end loop;
exception when unique_violation then raise exception 'Nilai sudah tersimpan. Muat ulang sebelum mengubah';
end $$;
revoke all on function public.manage_teaching_assignment(text,uuid,text,text,text,integer),public.assessment_roster(text,integer,text),public.save_subject_assessments(jsonb) from public,anon;
grant execute on function public.manage_teaching_assignment(text,uuid,text,text,text,integer),public.assessment_roster(text,integer,text),public.save_subject_assessments(jsonb) to authenticated;
commit;
notify pgrst,'reload schema';
