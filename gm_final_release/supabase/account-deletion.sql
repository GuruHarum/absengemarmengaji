begin;
create table if not exists public.account_deletion_jobs (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('teacher','account')),
 target text not null, accounts uuid[] not null, complete boolean not null default false,
 created_at timestamptz not null default now(), created_by uuid
);
create unique index if not exists active_account_deletion on public.account_deletion_jobs(kind,target) where not complete;
alter table public.account_deletion_jobs enable row level security;
revoke all on public.account_deletion_jobs from public,anon,authenticated;
grant select on public.account_deletion_jobs to authenticated;
drop policy if exists deletion_job_read on public.account_deletion_jobs;
create policy deletion_job_read on public.account_deletion_jobs for select to authenticated using(app_private.is_manager());
revoke delete on public.teachers from authenticated;
create or replace function public.prepare_account_deletion(actor uuid, deletion_kind text, target_key text)
returns public.account_deletion_jobs language plpgsql security definer set search_path='' as $$
declare job public.account_deletion_jobs; ids uuid[];
begin
 lock table public.user_roles in share row exclusive mode;
 if not exists(select 1 from public.user_roles where user_id=actor and role in ('admin','koordinator')) then raise exception 'Hanya pengelola dapat menghapus akun'; end if;
 if deletion_kind not in ('teacher','account') or target_key is null then raise exception 'Target tidak valid'; end if;
 if deletion_kind='account' then target_key:=lower(trim(target_key)); end if;
 select * into job from public.account_deletion_jobs where kind=deletion_kind and target=target_key and not complete for update;
 if found then return job; end if;
 if deletion_kind='teacher' then
  if not exists(select 1 from public.teachers where id::text=target_key) then raise exception 'Guru tidak ditemukan'; end if;
  select coalesce(array_agg(user_id),'{}'::uuid[]) into ids from public.user_roles where teacher_id=target_key;
 else
  select array_agg(id) into ids from auth.users where lower(email)=target_key;
  if ids is null then raise exception 'Akun tidak ditemukan'; end if;
 end if;
 if actor=any(ids) then raise exception 'Tidak dapat menghapus akun sendiri atau guru yang terhubung dengan akun sendiri'; end if;
 if not exists(select 1 from public.user_roles where role in ('admin','koordinator') and not(user_id=any(ids))) then raise exception 'Pengelola terakhir tidak boleh dihapus'; end if;
 insert into public.account_deletion_jobs(kind,target,accounts,created_by) values(deletion_kind,target_key,ids,actor) returning * into job;
 delete from public.user_roles where user_id=any(ids);
 return job;
end $$;
create or replace function app_private.block_deleted_account_mapping() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.account_deletion_jobs where not complete and (new.user_id=any(accounts) or (kind='teacher' and target=new.teacher_id))) then raise exception 'Akun/guru sedang dalam proses penghapusan'; end if;
 return new;
end $$;
drop trigger if exists block_deleted_account_mapping on public.user_roles;
create trigger block_deleted_account_mapping before insert or update on public.user_roles for each row execute function app_private.block_deleted_account_mapping();
create or replace function public.finish_account_deletion(actor uuid, job_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare job public.account_deletion_jobs;
begin
 if not exists(select 1 from public.user_roles where user_id=actor and role in ('admin','koordinator')) then raise exception 'Akses ditolak'; end if;
 select * into job from public.account_deletion_jobs where id=job_id for update;
 if not found then raise exception 'Proses penghapusan tidak ditemukan'; end if;
 if job.complete then return; end if;
 if exists(select 1 from auth.users where id=any(job.accounts)) then raise exception 'Akun Authentication belum seluruhnya terhapus'; end if;
 if job.kind='teacher' then
  update public.assessment_group_members set active=false where assignment_id in (select id from public.teaching_assignments where teacher_id=job.target);
  update public.teaching_assignments set active=false,ended_at=now(),ended_by=actor where teacher_id=job.target and active;
  delete from public.teachers where id::text=job.target;
 end if;
 update public.account_deletion_jobs set complete=true where id=job.id;
end $$;
revoke all on function public.prepare_account_deletion(uuid,text,text),public.finish_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_account_deletion(uuid,text,text),public.finish_account_deletion(uuid,uuid) to service_role;
commit;
notify pgrst,'reload schema';
