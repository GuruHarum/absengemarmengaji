begin;
alter table public.teaching_assignments add column if not exists roster_mode text not null default 'class' check(roster_mode in ('class','members'));
create table if not exists public.assessment_group_members (
 assignment_id uuid not null references public.teaching_assignments(id),
 student_id text not null,
 academic_year_start integer not null check(academic_year_start between 2000 and 2200),
 active boolean not null default true,
 primary key(assignment_id,student_id)
);
create unique index if not exists one_tahfidz_group_per_year on public.assessment_group_members(student_id,academic_year_start) where active;
alter table public.assessment_group_members enable row level security;
revoke all on public.assessment_group_members from public,anon,authenticated;
grant select on public.assessment_group_members to authenticated;
drop policy if exists group_members_read on public.assessment_group_members;
create policy group_members_read on public.assessment_group_members for select to authenticated using (
 app_private.is_manager() or exists(select 1 from public.teaching_assignments a
 where a.id=assignment_id and a.active and a.teacher_id=(select teacher_id from public.user_roles where user_id=auth.uid()))
);
insert into public.assessment_group_members(assignment_id,student_id,academic_year_start)
select a.id,s.id::text,a.academic_year_start from public.teaching_assignments a join public.students s on s.kelas=a.class_name
where a.subject='tahfidz' and a.active and a.roster_mode='class'
on conflict do nothing;
update public.teaching_assignments set roster_mode='members' where subject='tahfidz' and roster_mode='class';

create or replace function app_private.can_assess_subject(student_key text, year_key integer, subject_key text, teacher_key text)
returns boolean language sql stable security definer set search_path='' as $$
 select year_key between 2000 and 2200
 and (app_private.is_manager() or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='guru' and r.teacher_id=teacher_key))
 and exists(select 1 from public.students s join public.teachers t on t.id::text=teacher_key
 where s.id::text=student_key and (
  (subject_key='tahsin' and t.attendance_enabled and s."nama guru"=t.nama
   and (select count(*) from public.teachers same_name where same_name.nama=t.nama)=1)
  or (subject_key='tahfidz' and exists(select 1 from public.assessment_group_members m
   join public.teaching_assignments a on a.id=m.assignment_id
   where m.student_id=student_key and m.active and a.active and a.subject='tahfidz'
    and a.teacher_id=teacher_key and a.academic_year_start=year_key and m.academic_year_start=year_key))
 ));
$$;

revoke execute on function public.manage_teaching_assignment(text,uuid,text,text,text,integer) from public,anon,authenticated;
create or replace function public.manage_tahfidz_group(action text, target_id uuid default null, teacher_key text default null,
 group_name text default null, year_key integer default null, student_keys text[] default null)
returns void language plpgsql security definer set search_path='' as $$
declare group_id uuid;
begin
 if not app_private.is_manager() then raise exception 'Hanya pengelola dapat mengatur kelompok Tahfidz'; end if;
 if action='end' then
  update public.teaching_assignments set active=false,ended_at=now(),ended_by=auth.uid()
  where id=target_id and active and subject='tahfidz';
  if not found then raise exception 'Kelompok sudah berubah. Muat ulang daftar'; end if;
  update public.assessment_group_members set active=false where assignment_id=target_id;
 elsif action='create' then
  if not exists(select 1 from public.teachers where id::text=teacher_key) then raise exception 'Guru tidak ditemukan'; end if;
  if group_name is null or length(trim(group_name)) not between 1 and 80 then raise exception 'Nama kelompok wajib diisi (maksimal 80 karakter)'; end if;
  if coalesce(cardinality(student_keys),0) not between 1 and 1000 then raise exception 'Pilih 1 sampai 1000 siswa'; end if;
  if exists(select 1 from unnest(student_keys) k where k is null or not exists(select 1 from public.students s where s.id::text=k)) then raise exception 'Ada siswa tidak valid. Muat ulang daftar'; end if;
  if cardinality(student_keys)<>(select count(distinct k) from unnest(student_keys) k) then raise exception 'Siswa dipilih lebih dari sekali'; end if;
  insert into public.teaching_assignments(teacher_id,subject,class_name,academic_year_start,created_by,roster_mode)
  values(teacher_key,'tahfidz',trim(group_name),year_key,auth.uid(),'members') returning id into group_id;
  insert into public.assessment_group_members(assignment_id,student_id,academic_year_start)
  select group_id,k,year_key from unnest(student_keys) k;
 else raise exception 'Tindakan tidak valid'; end if;
exception when unique_violation then raise exception 'Nama kelompok atau siswa sudah memiliki kelompok Tahfidz aktif pada tahun ini. Akhiri kelompok lama terlebih dahulu';
end $$;
revoke all on function public.manage_tahfidz_group(text,uuid,text,text,integer,text[]) from public,anon;
grant execute on function public.manage_tahfidz_group(text,uuid,text,text,integer,text[]) to authenticated;
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
  perform 1 from public.teachers where id::text=item->>'teacher_id' for share;
  if not app_private.can_assess_subject(item->>'student_id',yr,sub,item->>'teacher_id') then raise exception 'Daftar siswa atau pengampu telah berubah. Muat ulang'; end if;
  assignment := null;
  if sub='tahsin' then
   assignment.teacher_id := item->>'teacher_id';
  else
   select a.* into assignment from public.teaching_assignments a
   join public.assessment_group_members m on m.assignment_id=a.id
   where a.active and m.active and m.student_id=item->>'student_id' and a.teacher_id=item->>'teacher_id'
    and a.subject='tahfidz' and a.academic_year_start=yr and m.academic_year_start=yr for share of a,m;
   if not found then raise exception 'Kelompok Tahfidz telah berubah. Muat ulang'; end if;
  end if;
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

commit;
notify pgrst,'reload schema';
