-- GEMAR MENGAJI — pasang di STAGING dahulu. Menambah RPC baca-saja,
-- tidak memodifikasi akun, guru, absensi, kelas, nilai, atau rapor.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $preflight$
BEGIN
 IF to_regclass('public.user_roles') IS NULL OR to_regclass('public.teachers') IS NULL THEN
   RAISE EXCEPTION 'STOP: master guru/akun belum tersedia';
 END IF;
 IF to_regprocedure('app_private.is_manager()') IS NULL THEN
   RAISE EXCEPTION 'STOP: fungsi pemeriksaan hak akses belum tersedia';
 END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.gm_list_account_link_status()
RETURNS TABLE(email text,role text,teacher_name text,teacher_id bigint,link_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $body$
BEGIN
 IF auth.uid() IS NULL OR NOT app_private.is_manager() THEN
   RAISE EXCEPTION 'Hanya admin/koordinator dapat memeriksa tautan akun' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT u.email::text,
   COALESCE(r.role::text,'belum_ditetapkan'::text),
   t.nama::text,t.id,
   (CASE WHEN r.user_id IS NULL THEN 'unassigned'
         WHEN r.role='admin' THEN 'admin'
         WHEN r.teacher_id IS NOT NULL AND t.id IS NOT NULL THEN 'linked'
         ELSE 'unlinked' END)::text
 FROM auth.users u
 LEFT JOIN public.user_roles r ON r.user_id = u.id
 LEFT JOIN public.teachers t ON t.id::text = r.teacher_id
 WHERE u.email IS NOT NULL
 ORDER BY lower(u.email);
END $body$;
REVOKE ALL ON FUNCTION public.gm_list_account_link_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_list_account_link_status() TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
-- Setelah berhasil, login sebagai koordinator untuk menjalankan:
-- SELECT * FROM public.gm_list_account_link_status();
