begin;
do $$ begin
 if to_regclass('public.report_settings') is null or to_regclass('public.report_reference') is null then
  raise exception 'Jalankan report-cards.sql terlebih dahulu; tabel pengaturan rapor belum lengkap.';
 end if;
end $$;
grant usage on schema public, app_private to authenticated;
grant execute on function app_private.is_manager() to authenticated;
alter table public.report_settings enable row level security;
alter table public.report_reference enable row level security;
revoke all on public.report_settings, public.report_reference from anon;
grant select on public.report_settings, public.report_reference to authenticated;
drop policy if exists report_settings_read on public.report_settings;
create policy report_settings_read on public.report_settings for select to authenticated
 using (app_private.is_manager());
drop policy if exists report_reference_read on public.report_reference;
create policy report_reference_read on public.report_reference for select to authenticated
 using (exists(select 1 from public.user_roles where user_id=auth.uid()));
commit;
notify pgrst, 'reload schema';
select has_table_privilege('authenticated','public.report_settings','SELECT') as authenticated_can_read,
       has_table_privilege('anon','public.report_settings','SELECT') as anon_can_read;
