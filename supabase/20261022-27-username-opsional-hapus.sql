-- Perubahan aman: username opsional dapat dihapus sendiri melalui Pengaturan Profil.
-- Tidak menyentuh akun Auth, email, password, data guru, maupun kebijakan Storage.
create or replace function public.gm_set_login_username(new_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
    normalized text := lower(trim(coalesce(new_username, '')));
begin
    if auth.uid() is null then
        raise exception 'Login diperlukan';
    end if;
    if not exists (
        select 1 from public.user_roles
        where user_id = auth.uid() and role in ('guru', 'koordinator', 'admin')
    ) then
        raise exception 'Akses ditolak';
    end if;
    if normalized = '' then
        delete from public.teacher_login_usernames where user_id = auth.uid();
        return '';
    end if;
    if normalized !~ '^[a-z][a-z0-9._]{2,29}$' then
        raise exception 'Username 3 sampai 30 karakter, diawali huruf';
    end if;
    insert into public.teacher_login_usernames (user_id, username)
    values (auth.uid(), normalized)
    on conflict (user_id) do update set username = excluded.username;
    return normalized;
end;
$function$;
