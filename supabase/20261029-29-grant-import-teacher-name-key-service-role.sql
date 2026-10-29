-- Server-side maintenance can also update public.teachers and maintain its expression indexes.
grant execute on function app_private.import_teacher_name_key(text) to service_role;
