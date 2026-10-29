-- These immutable text-normalization helpers back an expression index on public.students.
-- UPDATE-capable roles must be able to execute them while PostgreSQL maintains the index.
grant execute on function app_private.import_student_name_key(text) to authenticated, service_role;
grant execute on function app_private.import_student_class_key(text) to authenticated, service_role;
