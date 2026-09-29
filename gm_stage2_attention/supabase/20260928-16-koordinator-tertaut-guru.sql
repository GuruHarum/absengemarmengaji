-- GEMAR MENGAJI — koordinator dapat tetap berperan sebagai pengelola sekaligus ditautkan ke data guru.
-- Tidak mengubah role Koordinator menjadi Guru dan tidak mengurangi akses pengelola.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $preflight$
BEGIN
 IF to_regclass('public.user_roles') IS NULL OR to_regclass('public.teachers') IS NULL THEN
   RAISE EXCEPTION 'STOP: tabel user_roles/teachers belum tersedia';
 END IF;
 IF to_regprocedure('app_private.is_manager()') IS NULL THEN
   RAISE EXCEPTION 'STOP: fungsi hak akses manager belum tersedia';
 END IF;
END $preflight$;

-- Pastikan constraint mengizinkan teacher_id opsional untuk Koordinator.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_teacher_link_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_teacher_link_check
CHECK (
  (role = 'guru' AND teacher_id IS NOT NULL)
  OR role = 'koordinator'
  OR (role = 'admin' AND teacher_id IS NULL)
);

CREATE OR REPLACE FUNCTION public.assign_school_account(account_email text, account_role text, linked_teacher text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE
 target uuid;
 teacher_label text;
BEGIN
 IF NOT app_private.is_manager() THEN RAISE EXCEPTION 'Akses ditolak'; END IF;
 IF account_role NOT IN ('admin','koordinator','guru') THEN RAISE EXCEPTION 'Role tidak valid'; END IF;
 SELECT id INTO target FROM auth.users WHERE lower(email)=lower(trim(account_email));
 IF target IS NULL THEN RAISE EXCEPTION 'Email belum terdaftar di Authentication'; END IF;

 LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
 IF account_role='guru'
    AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=target AND role IN ('admin','koordinator'))
    AND (SELECT count(*) FROM public.user_roles WHERE role IN ('admin','koordinator')) <= 1
 THEN
   RAISE EXCEPTION 'Pengelola terakhir tidak dapat diubah menjadi guru';
 END IF;

 IF account_role='guru' AND linked_teacher IS NULL THEN
   RAISE EXCEPTION 'Akun Guru wajib ditautkan ke data guru';
 END IF;

 IF account_role IN ('guru','koordinator') AND linked_teacher IS NOT NULL THEN
   SELECT nama INTO teacher_label FROM public.teachers WHERE id::text=linked_teacher;
   IF teacher_label IS NULL THEN RAISE EXCEPTION 'Pilih guru yang valid'; END IF;
   IF (SELECT count(*) FROM public.teachers WHERE nama=teacher_label) <> 1 THEN
     RAISE EXCEPTION 'Nama guru duplikat; rapikan nama sebelum memetakan akun';
   END IF;
   IF EXISTS(
     SELECT 1 FROM public.user_roles
     WHERE user_id <> target AND role=account_role AND teacher_id=linked_teacher
   ) THEN
     RAISE EXCEPTION 'Data guru ini sudah tertaut ke akun dengan peran yang sama';
   END IF;
 END IF;

 INSERT INTO public.user_roles(user_id,role,teacher_id)
 VALUES(target,account_role,CASE WHEN account_role IN ('guru','koordinator') THEN linked_teacher ELSE NULL END)
 ON CONFLICT(user_id) DO UPDATE SET role=excluded.role, teacher_id=excluded.teacher_id;

 DELETE FROM public.teacher_class_access WHERE user_id=target;
 IF account_role IN ('guru','koordinator') AND linked_teacher IS NOT NULL THEN
   INSERT INTO public.teacher_class_access(user_id,class_name)
   SELECT DISTINCT target,kelas FROM public.students
   WHERE "nama guru"=teacher_label AND kelas IS NOT NULL
   ON CONFLICT DO NOTHING;
 END IF;
END $body$;

REVOKE ALL ON FUNCTION public.assign_school_account(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_school_account(text,text,text) TO authenticated;

COMMIT;
NOTIFY pgrst,'reload schema';
