begin;
grant select on public.user_roles to service_role;
create or replace function public.provision_teacher_account(actor_id uuid, account_id uuid,
 linked_teacher text default null, teacher_label text default null, full_label text default null,
 show_attendance boolean default true)
returns text language plpgsql security definer set search_path='' as $$
declare teacher_key text; label text;
begin
 if not exists(select 1 from public.user_roles where user_id=actor_id and role in ('admin','koordinator')) then
  raise exception 'Hanya pengelola dapat membuat akun guru';
 end if;
 if not exists(select 1 from auth.users where id=account_id) then raise exception 'Akun Authentication tidak ditemukan'; end if;
 lock table public.teachers in share row exclusive mode;
 lock table public.user_roles in share row exclusive mode;
 if exists(select 1 from public.user_roles where user_id=account_id) then raise exception 'Akun sudah diberi akses'; end if;
 if linked_teacher is not null then
  select nama into label from public.teachers where id::text=linked_teacher;
  if label is null then raise exception 'Guru tidak ditemukan'; end if;
  teacher_key := linked_teacher;
  if exists(select 1 from public.user_roles where teacher_id=teacher_key) then raise exception 'Guru sudah memiliki akun. Gunakan pemetaan akun yang tersedia'; end if;
 else
  label := trim(teacher_label);
  if label is null or length(label) not between 1 and 80 or full_label is null or length(trim(full_label)) not between 1 and 160 then raise exception 'Nama guru dan nama lengkap wajib diisi'; end if;
  if exists(select 1 from public.teachers where lower(trim(nama))=lower(label)) then raise exception 'Nama guru sudah ada. Pilih data guru yang sudah tersedia'; end if;
  insert into public.teachers(nama,nama_lengkap,attendance_enabled) values(label,trim(full_label),coalesce(show_attendance,true)) returning id::text into teacher_key;
 end if;
 if (select count(*) from public.teachers where nama=label)<>1 then raise exception 'Nama guru duplikat. Rapikan master terlebih dahulu'; end if;
 insert into public.user_roles(user_id,role,teacher_id) values(account_id,'guru',teacher_key);
 insert into public.teacher_class_access(user_id,class_name)
 select distinct account_id,kelas from public.students where "nama guru"=label and kelas is not null;
 return teacher_key;
end $$;
revoke all on function public.provision_teacher_account(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.provision_teacher_account(uuid,uuid,text,text,text,boolean) to service_role;
commit;
notify pgrst,'reload schema';
