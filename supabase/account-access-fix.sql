begin;
create or replace function public.list_school_accounts()
returns table(email text, role text, teacher_name text)
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not app_private.is_manager() then
  raise exception 'Daftar akses hanya dapat dibaca admin/koordinator' using errcode='42501';
 end if;
 return query
 select u.email::text, r.role::text, t.nama::text
 from public.user_roles r
 join auth.users u on u.id=r.user_id
 left join public.teachers t on t.id::text=r.teacher_id
 order by u.email;
end $$;
grant usage on schema public to authenticated;
revoke all on function public.list_school_accounts() from public,anon;
grant execute on function public.list_school_accounts() to authenticated;
commit;
notify pgrst,'reload schema';
select has_function_privilege('authenticated','public.list_school_accounts()','EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon','public.list_school_accounts()','EXECUTE') as anon_can_execute;
