-- GEMAR MENGAJI. JALANKAN DI STAGING DAHULU, sesudah migrasi 01-07 dan 3-ID.
-- Tidak menghapus siswa/absensi/penilaian. Perubahan anggota melalui RPC gm_manage_learning_group.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $preflight$
BEGIN
 IF to_regprocedure('public.gm_manage_learning_group(text,text,uuid,text,text,integer,text[])') IS NULL
 OR to_regprocedure('public.gm_public_tahsin_students(integer)') IS NULL
 OR to_regprocedure('public.gm_sync_student_identity()') IS NULL THEN
  RAISE EXCEPTION 'STOP: pasang migrasi kelompok 05, impor 06, dan sinkronisasi 07 dahulu';
 END IF;
 IF EXISTS (SELECT 1 FROM public.attendance WHERE student_id IS NULL OR class_id IS NULL OR teacher_id IS NULL) THEN
  RAISE EXCEPTION 'STOP: masih ada absensi tanpa tiga ID';
 END IF;
END $preflight$;

-- Setelah sistem kelompok aktif, perubahan identitas siswa tidak boleh diam-diam
-- memindahkan pengampu kelompok. Koordinator mengubahnya melalui menu kelompok.
DROP TRIGGER IF EXISTS gm_sync_tahsin_group_after_master ON public.students;

-- Saran email berdasarkan TAUTAN RESMI akun yang sudah ada, bukan menebak email dari nama.
-- Kolom email opsional pada tabel guru juga dipakai HANYA jika cocok persis dengan auth.users.
CREATE OR REPLACE FUNCTION public.gm_teacher_account_hints()
RETURNS TABLE(teacher_id bigint,email text,source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $func$
 SELECT t.id,u.email::text,'akun terhubung'::text
 FROM public.teachers t JOIN public.user_roles r ON r.teacher_id=t.id::text
 JOIN auth.users u ON u.id=r.user_id
 WHERE app_private.is_manager()
 UNION
 SELECT t.id,u.email::text,'email resmi guru'::text
 FROM public.teachers t JOIN auth.users u
   ON lower(u.email)=lower(nullif(trim(to_jsonb(t)->>'email'),''))
 WHERE app_private.is_manager() AND NULLIF(trim(to_jsonb(t)->>'email'),'') IS NOT NULL;
$func$;
REVOKE ALL ON FUNCTION public.gm_teacher_account_hints() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gm_teacher_account_hints() TO authenticated;

-- Indeks selektif untuk menu kelompok dan roster periode.
CREATE INDEX IF NOT EXISTS gm_assignment_subject_year_teacher_active
 ON public.teaching_assignments(subject,academic_year_start,teacher_id) WHERE active;
CREATE INDEX IF NOT EXISTS gm_members_subject_year_assignment_active
 ON public.assessment_group_members(subject,academic_year_start,assignment_id) WHERE active;
CREATE INDEX IF NOT EXISTS gm_subject_scores_student_year_subject_period
 ON public.subject_assessments(student_id,academic_year_start,subject,period);
-- Siswa baru dapat memiliki kelas tanpa harus langsung ditempatkan pada guru.
CREATE OR REPLACE FUNCTION public.gm_sync_student_class_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE yr integer; cid bigint; found_count integer;
BEGIN
 yr:=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
   -CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END;
 SELECT count(*),min(id) INTO found_count,cid FROM public.school_classes
 WHERE academic_year_start=yr
 AND normalized_name=lower(regexp_replace(trim(NEW.kelas),'[[:space:]]+',' ','g'));
 IF found_count<>1 THEN RAISE EXCEPTION 'Kelas % belum unik di master kelas %',NEW.kelas,yr; END IF;
 UPDATE public.student_class_assignments SET class_id=cid
 WHERE student_id=NEW.id AND academic_year_start=yr AND class_id IS DISTINCT FROM cid;
 INSERT INTO public.student_class_assignments(student_id,class_id,academic_year_start)
 SELECT NEW.id,cid,yr WHERE NOT EXISTS(
  SELECT 1 FROM public.student_class_assignments WHERE student_id=NEW.id AND academic_year_start=yr);
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.gm_sync_student_class_only() FROM PUBLIC,anon;
DROP TRIGGER IF EXISTS gm_sync_student_class_only ON public.students;
CREATE TRIGGER gm_sync_student_class_only AFTER INSERT OR UPDATE OF kelas
 ON public.students FOR EACH ROW EXECUTE FUNCTION public.gm_sync_student_class_only();
COMMIT;

-- Verifikasi baca-saja setelah transaksi berhasil.
SELECT to_regprocedure('public.gm_teacher_account_hints()') IS NOT NULL AS email_hint_siap,
       to_regprocedure('public.gm_manage_learning_group(text,text,uuid,text,text,integer,text[])') IS NOT NULL AS kelola_kelompok_siap;
SELECT tgname FROM pg_trigger WHERE tgrelid='public.students'::regclass AND tgname='gm_sync_tahsin_group_after_master';
-- SELECT terakhir harus No rows.
