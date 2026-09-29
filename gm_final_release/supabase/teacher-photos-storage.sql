begin;

alter table public.teachers add column if not exists foto_storage_path text;

insert into storage.buckets (id, name, public)
values ('teachers', 'teachers', true)
on conflict (id) do update set public = true;

create or replace function app_private.can_edit_teacher_photo(target_id text)
returns boolean language sql stable security definer set search_path = '' as $$
select app_private.is_manager() or exists (
    select 1 from public.user_roles r
    join public.teachers t on t.id::text = r.teacher_id
    where r.user_id = auth.uid() and r.role = 'guru'
      and r.teacher_id = target_id and t.attendance_enabled is distinct from false
);
$$;

create or replace function app_private.can_write_teacher_portrait(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
select object_name ~ '^portraits/[^/]+/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and app_private.can_edit_teacher_photo(split_part(object_name, '/', 2));
$$;

drop policy if exists manager_portrait_insert on storage.objects;
drop policy if exists manager_portrait_delete on storage.objects;
drop policy if exists own_portrait_insert on storage.objects;
drop policy if exists own_portrait_delete on storage.objects;
drop policy if exists own_portrait_select on storage.objects;

create policy own_portrait_select on storage.objects for select to authenticated
using (bucket_id = 'teachers' and app_private.can_write_teacher_portrait(name));
create policy manager_portrait_insert on storage.objects for insert to authenticated
with check (bucket_id = 'teachers' and app_private.is_manager());
create policy manager_portrait_delete on storage.objects for delete to authenticated
using (bucket_id = 'teachers' and app_private.is_manager());
create policy own_portrait_insert on storage.objects for insert to authenticated
with check (bucket_id = 'teachers' and app_private.can_write_teacher_portrait(name));
create policy own_portrait_delete on storage.objects for delete to authenticated
using (bucket_id = 'teachers' and app_private.can_write_teacher_portrait(name));

drop policy if exists school_image_insert_guard on storage.objects;
create policy school_image_insert_guard on storage.objects as restrictive
for insert to anon, authenticated with check (
    bucket_id <> 'teachers' or app_private.is_manager()
    or (auth.uid() is not null and app_private.can_write_teacher_portrait(name))
);
drop policy if exists school_image_delete_guard on storage.objects;
create policy school_image_delete_guard on storage.objects as restrictive
for delete to anon, authenticated using (
    bucket_id <> 'teachers' or app_private.is_manager()
    or (auth.uid() is not null and app_private.can_write_teacher_portrait(name))
);

create or replace function app_private.protect_teacher_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is not null and not app_private.is_manager()
       and (to_jsonb(new) - 'foto' - 'foto_storage_path')
         is distinct from (to_jsonb(old) - 'foto' - 'foto_storage_path') then
        raise exception 'Guru hanya dapat memperbarui foto profil sendiri';
    end if;
    return new;
end;
$$;

create or replace function public.teacher_portrait_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        if new.attendance_enabled = false and (new.foto is not null or new.foto_storage_path is not null) then
            raise exception 'Guru khusus Tahfidz tidak menggunakan foto profil';
        end if;
    elsif new.foto is distinct from old.foto or new.foto_storage_path is distinct from old.foto_storage_path then
        if auth.uid() is not null and not app_private.can_edit_teacher_photo(new.id::text) then
            raise exception 'Hanya pengelola atau guru Tahsin terkait dapat mengubah foto';
        end if;
        if new.attendance_enabled = false and (new.foto is not null or new.foto_storage_path is not null) then
            raise exception 'Foto profil hanya berlaku untuk guru Tahsin';
        end if;
        if new.foto is not null and (new.foto_storage_path is null or new.foto not like
             'https://%/storage/v1/object/public/teachers/' || new.foto_storage_path) then
            if not (app_private.is_manager() and new.foto_storage_path is null) then
                raise exception 'Unggah berkas foto melalui Supabase Storage';
            end if;
        end if;
        if new.foto_storage_path is distinct from old.foto_storage_path and new.foto_storage_path is not null
           and not exists (select 1 from storage.objects o where o.bucket_id='teachers' and o.name=new.foto_storage_path) then
            raise exception 'Berkas foto belum ditemukan di Supabase Storage';
        end if;
    end if;
    if new.foto_storage_path is not null and new.foto_storage_path !~
        ('^portraits/' || new.id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
        raise exception 'Lokasi berkas foto guru tidak sesuai';
    end if;
    return new;
end;
$$;

drop trigger if exists teacher_portrait_guard on public.teachers;
create trigger teacher_portrait_guard before insert or update of foto, foto_storage_path, attendance_enabled
on public.teachers for each row execute function public.teacher_portrait_guard();

commit;
notify pgrst, 'reload schema';
