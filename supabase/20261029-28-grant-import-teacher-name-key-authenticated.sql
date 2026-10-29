-- Needed because expression indexes on public.teachers call this helper during UPDATE.
-- Keep row access controlled by the existing RLS policies on public.teachers.
grant execute on function app_private.import_teacher_name_key(text) to authenticated;
