-- Setelah migrasi 08. Menjaga identitas guru legacy konsisten dengan kelompok
-- Tahsin aktif; impor TIDAK boleh diam-diam mengganti guru melalui teks saja.
-- Guru diganti oleh koordinator melalui Kelola Tahsin (RPC gm_manage_learning_group).
-- File impor tanpa guru baru tetap bisa memperbarui NIS/NISN, nama dan kelas.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $check$
BEGIN
 IF to_regprocedure('public.gm_manage_learning_group(text,text,uuid,text,text,integer,text[])') IS NULL THEN
  RAISE EXCEPTION 'STOP: fungsi kelompok 05 tidak tersedia';
 END IF;
 IF EXISTS(
  SELECT 1 FROM public.students s
  JOIN public.assessment_group_members m ON m.student_id=s.id::text AND m.subject='tahsin' AND m.active
  JOIN public.teaching_assignments a ON a.id=m.assignment_id AND a.subject='tahsin' AND a.active
  JOIN public.teachers t ON t.id::text=a.teacher_id
  WHERE m.academic_year_start=a.academic_year_start
    AND a.academic_year_start=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
      -CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END
    AND s."nama guru" IS DISTINCT FROM t.nama
 ) THEN
  RAISE EXCEPTION 'STOP: master guru lama berbeda dari kelompok Tahsin aktif. Audit dan benahi sebelum memasang pengaman';
 END IF;
END $check$;
CREATE OR REPLACE FUNCTION public.gm_guard_tahsin_teacher_master()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE current_teacher text; memberships integer; yr integer;
BEGIN
 IF OLD."nama guru" IS NOT DISTINCT FROM NEW."nama guru" THEN RETURN NEW; END IF;
 yr:=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
   -CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END;
 SELECT count(*),min(t.nama) INTO memberships,current_teacher
 FROM public.assessment_group_members m
 JOIN public.teaching_assignments a ON a.id=m.assignment_id AND a.active AND a.subject='tahsin'
 JOIN public.teachers t ON t.id::text=a.teacher_id
 WHERE m.student_id=NEW.id::text AND m.subject='tahsin' AND m.active
   AND m.academic_year_start=yr AND a.academic_year_start=yr;
 IF memberships>1 THEN
  RAISE EXCEPTION 'Siswa % memiliki lebih dari satu kelompok Tahsin aktif',NEW.id;
 END IF;
 IF memberships=1 AND current_teacher IS DISTINCT FROM NEW."nama guru" THEN
  RAISE EXCEPTION 'Guru Tahsin siswa % diatur pada Kelola Tahsin (%), bukan melalui edit/impor master (%). Ubah kelompok dahulu atau hapus kolom guru yang berubah dari file.',
    NEW.id,current_teacher,NEW."nama guru";
 END IF;
 RETURN NEW;
END $body$;
REVOKE ALL ON FUNCTION public.gm_guard_tahsin_teacher_master() FROM PUBLIC,anon;
DROP TRIGGER IF EXISTS gm_guard_tahsin_teacher_master ON public.students;
CREATE TRIGGER gm_guard_tahsin_teacher_master BEFORE UPDATE OF "nama guru" ON public.students
FOR EACH ROW EXECUTE FUNCTION public.gm_guard_tahsin_teacher_master();
COMMIT;
-- Verifikasi: trigger wajib hadir dan enabled='O'.
SELECT tgname,tgenabled FROM pg_trigger
WHERE tgrelid='public.students'::regclass AND tgname='gm_guard_tahsin_teacher_master';
