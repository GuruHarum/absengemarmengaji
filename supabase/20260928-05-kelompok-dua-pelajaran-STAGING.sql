-- GEMAR MENGAJI 2026/27 — TAHAP 5 (STAGING DULU)
-- Satu master siswa, keanggotaan Tahsin/Tahfidz terpisah per tahun.
-- Tidak menghapus siswa, absensi, nilai ataupun rapor historis.
-- Prasyarat: Tahap ID 1+2, attendance-three-ids, 20260928-01..03 terpasang.
-- Simpan BACKUP sebelum dipasang; cek audit sebelum / sesudah.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $preflight$
BEGIN
 IF to_regclass('public.school_classes') IS NULL OR
    to_regclass('public.student_class_assignments') IS NULL OR
    to_regclass('public.assessment_group_members') IS NULL OR
    to_regclass('public.teaching_assignments') IS NULL OR
    to_regprocedure('public.gm_delete_student_verified(bigint,text,integer,text)') IS NULL OR
    to_regprocedure('public.gm_fill_attendance_ids_before_insert()') IS NULL OR
    to_regprocedure('public.preview_import_students(jsonb,integer)') IS NULL THEN
   RAISE EXCEPTION 'STOP: migrasi pengamanan, impor NIS/NISN dan 3 ID sebelumnya harus sudah terpasang';
 END IF;
 IF EXISTS(SELECT 1 FROM public.attendance WHERE student_id IS NULL OR class_id IS NULL OR teacher_id IS NULL) THEN
   RAISE EXCEPTION 'STOP: masih ada absensi tanpa tiga ID, selesaikan rekonsiliasi dahulu';
 END IF;
END $preflight$;

-- Kolom subject pada anggota adalah pembeda resmi dua daftar anggota.
ALTER TABLE public.assessment_group_members ADD COLUMN IF NOT EXISTS subject text;
UPDATE public.assessment_group_members m SET subject=a.subject
FROM public.teaching_assignments a WHERE a.id=m.assignment_id AND m.subject IS DISTINCT FROM a.subject;
ALTER TABLE public.assessment_group_members ALTER COLUMN subject SET DEFAULT 'tahfidz';
ALTER TABLE public.assessment_group_members ALTER COLUMN subject SET NOT NULL;
DO $check$
BEGIN
 IF EXISTS(SELECT 1 FROM public.assessment_group_members WHERE subject NOT IN ('tahsin','tahfidz')) THEN
  RAISE EXCEPTION 'STOP: ada anggota dengan pelajaran tidak valid';
 END IF;
END $check$;
ALTER TABLE public.assessment_group_members DROP CONSTRAINT IF EXISTS gm_group_member_subject_check;
ALTER TABLE public.assessment_group_members ADD CONSTRAINT gm_group_member_subject_check
 CHECK(subject IN ('tahsin','tahfidz'));
-- Indeks lama hanya mengizinkan SATU keanggotaan untuk seluruh pelajaran.
DROP INDEX IF EXISTS public.one_tahfidz_group_per_year;
CREATE UNIQUE INDEX IF NOT EXISTS gm_active_student_subject_year
 ON public.assessment_group_members(student_id,academic_year_start,subject) WHERE active;

CREATE OR REPLACE FUNCTION public.gm_check_group_member_subject()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE a_subject text; a_year integer;
BEGIN
 SELECT subject,academic_year_start INTO a_subject,a_year FROM public.teaching_assignments WHERE id=NEW.assignment_id;
 IF a_subject IS NULL OR NEW.subject<>a_subject OR NEW.academic_year_start<>a_year THEN
  RAISE EXCEPTION 'Anggota/pelajaran/tahun tidak sesuai kelompok';
 END IF;
 RETURN NEW;
END $body$;
REVOKE ALL ON FUNCTION public.gm_check_group_member_subject() FROM PUBLIC;
DROP TRIGGER IF EXISTS gm_check_group_member_subject ON public.assessment_group_members;
CREATE TRIGGER gm_check_group_member_subject BEFORE INSERT OR UPDATE OF assignment_id,subject,academic_year_start
 ON public.assessment_group_members FOR EACH ROW EXECUTE FUNCTION public.gm_check_group_member_subject();

-- BUKAN otomatis menyalin Tahsin ke Tahfidz: kedua daftar berdiri sendiri.
-- Tahsin awal berasal dari master yang SUDAH ADA agar orang tua tidak kehilangan siswa.
-- Jangan menebak jika satu nama guru menunjuk >1 ID guru.
DO $audit_master$
DECLARE yr integer;
BEGIN
 yr:=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer-
     CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END;
 IF EXISTS(
   SELECT 1 FROM public.students s WHERE coalesce(trim(s."nama guru"),'')<>''
   AND s."nama guru"<>'Belum ditugaskan'
   AND (SELECT count(*) FROM public.teachers t WHERE t.nama=s."nama guru" AND t.attendance_enabled IS NOT FALSE)<>1
 ) THEN RAISE EXCEPTION 'STOP: master memiliki nama guru Tahsin tanpa ID tunggal; periksa audit sebelum pemasangan'; END IF;
 IF EXISTS(
   SELECT 1 FROM public.students s
   JOIN public.teachers t ON t.nama=s."nama guru" AND t.attendance_enabled IS NOT FALSE
   WHERE length('Tahsin '||t.nama||' / '||s.kelas)>80
 ) THEN RAISE EXCEPTION 'STOP: nama kelompok otomatis Tahsin melebihi 80 karakter'; END IF;
END $audit_master$;

INSERT INTO public.teaching_assignments(teacher_id,subject,class_name,academic_year_start,roster_mode)
SELECT DISTINCT t.id::text,'tahsin','Tahsin '||t.nama||' / '||s.kelas,
 EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer-
 CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END,'members'
FROM public.students s JOIN public.teachers t ON t.nama=s."nama guru" AND t.attendance_enabled IS NOT FALSE
WHERE coalesce(trim(s.kelas),'')<>''
AND NOT EXISTS(SELECT 1 FROM public.teaching_assignments a WHERE a.subject='tahsin' AND a.active
 AND a.class_name='Tahsin '||t.nama||' / '||s.kelas AND a.teacher_id=t.id::text
 AND a.academic_year_start=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer-
  CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END)
ON CONFLICT DO NOTHING;

-- Jika ada penugasan Tahsin lama dengan anggota yang sudah sah, utamakan anggota tersebut.
INSERT INTO public.assessment_group_members(assignment_id,student_id,academic_year_start,subject)
SELECT a.id,s.id::text,a.academic_year_start,'tahsin'
FROM public.students s
JOIN public.teachers t ON t.nama=s."nama guru" AND t.attendance_enabled IS NOT FALSE
JOIN public.teaching_assignments a ON a.teacher_id=t.id::text AND a.subject='tahsin'
 AND a.class_name='Tahsin '||t.nama||' / '||s.kelas AND a.active
 AND a.academic_year_start=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer-
 CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END
WHERE NOT EXISTS(SELECT 1 FROM public.assessment_group_members m
 WHERE m.student_id=s.id::text AND m.subject='tahsin' AND m.active
 AND m.academic_year_start=a.academic_year_start)
ON CONFLICT DO NOTHING;

-- Nonaktifkan hanya penugasan Tahsin kosong mode kelas lama TANPA nilai terkait.
-- Kelompok lama dengan nilai tetap tersedia sebagai riwayat, tanpa menghapus apa pun.
UPDATE public.teaching_assignments a
 SET active=false,ended_at=now()
WHERE a.subject='tahsin' AND a.active AND a.roster_mode='class'
 AND NOT EXISTS (SELECT 1 FROM public.assessment_group_members m
    WHERE m.assignment_id=a.id AND m.active)
 AND NOT EXISTS (SELECT 1 FROM public.subject_assessments sa WHERE sa.assignment_id=a.id);

-- Otomatis ikut saat ada siswa baru/impor atau pindah pengampu pada MASTER.
-- Kelompok manual yang sudah sesuai guru dipertahankan, tanpa membuat duplikat.
CREATE OR REPLACE FUNCTION public.gm_sync_tahsin_group_after_master()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE yr integer; tid text; gid uuid; old_tid text; old_label text; label text; next_class bigint; n_class integer;
BEGIN
 yr:=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer-
     CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END;
 SELECT count(*),min(id) INTO n_class,next_class FROM public.school_classes
 WHERE academic_year_start=yr AND normalized_name=
 lower(regexp_replace(trim(NEW.kelas),'[[:space:]]+',' ','g'));
 IF n_class<>1 THEN RAISE EXCEPTION 'Kelas % belum unik pada master kelas aktif',NEW.kelas; END IF;
 UPDATE public.student_class_assignments SET class_id=next_class
 WHERE student_id=NEW.id AND academic_year_start=yr AND class_id IS DISTINCT FROM next_class;
 IF NOT EXISTS(SELECT 1 FROM public.student_class_assignments
  WHERE student_id=NEW.id AND academic_year_start=yr) THEN
  INSERT INTO public.student_class_assignments(student_id,class_id,academic_year_start)
  VALUES(NEW.id,next_class,yr);
 END IF;
 SELECT t.id::text INTO STRICT tid FROM public.teachers t
 WHERE t.nama=NEW."nama guru" AND t.attendance_enabled IS NOT FALSE;
 -- Jika perubahan hanya kelas dan guru tetap, pertahankan kelompok lintas kelas manual.
 SELECT a.teacher_id,a.class_name INTO old_tid,old_label FROM public.assessment_group_members m
 JOIN public.teaching_assignments a ON a.id=m.assignment_id
 WHERE m.student_id=NEW.id::text AND m.subject='tahsin' AND m.academic_year_start=yr
 AND m.active AND a.active AND a.academic_year_start=yr LIMIT 1;
 IF old_tid=tid AND (OLD.kelas IS NOT DISTINCT FROM NEW.kelas
  OR old_label IS DISTINCT FROM ('Tahsin '||NEW."nama guru"||' / '||OLD.kelas)) THEN RETURN NEW; END IF;
 IF old_tid IS NOT NULL AND EXISTS(SELECT 1 FROM public.subject_assessments
  WHERE student_id=NEW.id::text AND academic_year_start=yr AND subject='tahsin') THEN
  RAISE EXCEPTION 'Siswa sudah memiliki nilai Tahsin. Perpindahan pengampu perlu peninjauan koordinator.';
 END IF;
 UPDATE public.assessment_group_members SET active=false
 WHERE student_id=NEW.id::text AND subject='tahsin' AND academic_year_start=yr AND active;
 label:='Tahsin '||NEW."nama guru"||' / '||NEW.kelas;
 IF length(label)>80 THEN RAISE EXCEPTION 'Nama kelompok Tahsin terlalu panjang'; END IF;
 SELECT id INTO gid FROM public.teaching_assignments
 WHERE teacher_id=tid AND subject='tahsin' AND class_name=label AND academic_year_start=yr AND active LIMIT 1;
 IF gid IS NULL THEN
   INSERT INTO public.teaching_assignments(teacher_id,subject,class_name,academic_year_start,roster_mode)
   VALUES(tid,'tahsin',label,yr,'members') RETURNING id INTO gid;
 END IF;
 INSERT INTO public.assessment_group_members(assignment_id,student_id,academic_year_start,subject)
 VALUES(gid,NEW.id::text,yr,'tahsin')
 ON CONFLICT(assignment_id,student_id) DO UPDATE SET active=true,subject='tahsin',academic_year_start=yr;
 RETURN NEW;
EXCEPTION WHEN no_data_found THEN
 -- Siswa baru boleh disimpan tanpa guru; ia tidak masuk halaman absensi sampai diberi kelompok.
 IF NEW."nama guru" IS NULL OR NEW."nama guru"='' OR NEW."nama guru"='Belum ditugaskan' THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Guru Tahsin tidak ditemukan atau lebih dari satu';
 WHEN too_many_rows THEN RAISE EXCEPTION 'Nama guru Tahsin tidak unik';
END $body$;
REVOKE ALL ON FUNCTION public.gm_sync_tahsin_group_after_master() FROM PUBLIC;
DROP TRIGGER IF EXISTS gm_sync_tahsin_group_after_master ON public.students;
CREATE TRIGGER gm_sync_tahsin_group_after_master AFTER INSERT OR UPDATE OF kelas,"nama guru"
 ON public.students FOR EACH ROW EXECUTE FUNCTION public.gm_sync_tahsin_group_after_master();

-- Dua daftar, satu endpoint untuk membuat / memperbaiki / mengakhiri kelompok.
CREATE OR REPLACE FUNCTION public.gm_manage_learning_group(
 subject_key text,action text,target_id uuid DEFAULT NULL,teacher_key text DEFAULT NULL,
 group_name text DEFAULT NULL,year_key integer DEFAULT NULL,student_keys text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE a public.teaching_assignments%rowtype; gid uuid; teacher_name text;
 yr integer; n integer; sid text; clean_ids text[]; removed text[]; already text;
BEGIN
 IF NOT app_private.is_manager() THEN RAISE EXCEPTION 'Hanya koordinator/admin dapat mengelola kelompok'; END IF;
 IF subject_key NOT IN ('tahsin','tahfidz') OR action NOT IN ('create','replace','end') THEN
  RAISE EXCEPTION 'Jenis pelajaran atau tindakan tidak valid'; END IF;
 yr:=year_key;
 IF action IN ('replace','end') THEN
  SELECT * INTO a FROM public.teaching_assignments WHERE id=target_id AND subject=subject_key AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kelompok sudah berubah, muat ulang daftar'; END IF;
  yr:=a.academic_year_start;
  teacher_key:=a.teacher_id;
 END IF;
 IF yr NOT BETWEEN 2000 AND 2200 THEN RAISE EXCEPTION 'Tahun ajaran tidak valid'; END IF;
 IF action='end' THEN
  IF EXISTS(SELECT 1 FROM public.assessment_group_members m JOIN public.subject_assessments sa
    ON sa.student_id=m.student_id AND sa.academic_year_start=yr AND sa.subject=subject_key
    WHERE m.assignment_id=a.id AND m.active) THEN
   RAISE EXCEPTION 'Kelompok memiliki siswa bernilai; tidak dapat diakhiri tanpa peninjauan nilai'; END IF;
  IF EXISTS(SELECT 1 FROM public.assessment_group_members m JOIN public.periodic_assessments pa
    ON pa.student_id=m.student_id AND pa.academic_year_start=yr
    WHERE m.assignment_id=a.id AND m.active) THEN
   RAISE EXCEPTION 'Kelompok memiliki penilaian lama; periksa dahulu sebelum mengakhiri'; END IF;
  UPDATE public.assessment_group_members SET active=false WHERE assignment_id=a.id AND active;
  UPDATE public.teaching_assignments SET active=false,ended_at=now(),ended_by=auth.uid() WHERE id=a.id;
  RETURN jsonb_build_object('ended',a.id,'subject',subject_key);
 END IF;
 IF coalesce(cardinality(student_keys),0) NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'Pilih 1 sampai 1.000 siswa'; END IF;
 SELECT array_agg(DISTINCT trim(k)) INTO clean_ids FROM unnest(student_keys) k;
 IF cardinality(clean_ids)<>cardinality(student_keys) OR EXISTS(
   SELECT 1 FROM unnest(clean_ids) k WHERE k IS NULL OR k='' OR
   NOT EXISTS(SELECT 1 FROM public.students s WHERE s.id::text=k)) THEN
   RAISE EXCEPTION 'Daftar siswa kosong, ganda atau sudah berubah'; END IF;
 SELECT t.nama INTO teacher_name FROM public.teachers t WHERE t.id::text=teacher_key
 AND (subject_key<>'tahsin' OR t.attendance_enabled IS NOT FALSE);
 IF teacher_name IS NULL THEN RAISE EXCEPTION 'Guru tidak ditemukan atau tidak mengampu pelajaran ini'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(clean_ids) k JOIN public.students s ON s.id::text=k
  WHERE NOT EXISTS(SELECT 1 FROM public.school_classes sc
   WHERE sc.academic_year_start=yr AND sc.normalized_name=
   lower(regexp_replace(trim(s.kelas),'[[:space:]]+',' ','g')))) THEN
  RAISE EXCEPTION 'Ada siswa tanpa kelas aktif di school_classes. Perbaiki master dahulu'; END IF;
 -- Membaca daftar sejak awal, termasuk kasus siswa di kelompok Tahsin/Tahfidz lain.
 SELECT m.student_id INTO already FROM public.assessment_group_members m
  WHERE m.student_id=ANY(clean_ids) AND m.academic_year_start=yr AND m.subject=subject_key
    AND m.active AND (target_id IS NULL OR m.assignment_id<>target_id) LIMIT 1;
 IF already IS NOT NULL THEN
   RAISE EXCEPTION 'Siswa ID % sudah memiliki kelompok % aktif. Lepaskan dari kelompok sebelumnya dahulu',already,subject_key;
 END IF;
 IF action='create' THEN
  IF group_name IS NULL OR length(trim(group_name)) NOT BETWEEN 1 AND 80 THEN
   RAISE EXCEPTION 'Nama kelompok wajib 1-80 karakter'; END IF;
  INSERT INTO public.teaching_assignments(teacher_id,subject,class_name,academic_year_start,created_by,roster_mode)
  VALUES(teacher_key,subject_key,trim(group_name),yr,auth.uid(),'members') RETURNING id INTO gid;
 ELSE
  gid:=a.id;
  -- Tidak boleh menghilangkan anggota yang sudah mempunyai nilai.
  IF EXISTS(SELECT 1 FROM public.assessment_group_members m
   JOIN public.subject_assessments sa ON sa.student_id=m.student_id AND sa.academic_year_start=yr
     AND sa.subject=subject_key
   WHERE m.assignment_id=gid AND m.active AND NOT m.student_id=ANY(clean_ids)) THEN
   RAISE EXCEPTION 'Anggota yang sudah mempunyai nilai tidak boleh dilepas tanpa peninjauan koordinator'; END IF;
  IF EXISTS(SELECT 1 FROM public.assessment_group_members m
     JOIN public.periodic_assessments pa ON pa.student_id=m.student_id AND pa.academic_year_start=yr
     WHERE m.assignment_id=gid AND m.active AND NOT m.student_id=ANY(clean_ids)) THEN
    RAISE EXCEPTION 'Ada siswa dengan penilaian lama; peninjauan koordinator diperlukan'; END IF;
  UPDATE public.assessment_group_members SET active=false
   WHERE assignment_id=gid AND active AND NOT student_id=ANY(clean_ids);
 END IF;
 INSERT INTO public.assessment_group_members(assignment_id,student_id,academic_year_start,subject)
 SELECT gid,k,yr,subject_key FROM unnest(clean_ids) k
 ON CONFLICT(assignment_id,student_id) DO UPDATE SET active=true,subject=excluded.subject,academic_year_start=excluded.academic_year_start;
 IF subject_key='tahsin' THEN
  UPDATE public.students s SET "nama guru"=teacher_name
  WHERE s.id::text=ANY(clean_ids) AND s."nama guru" IS DISTINCT FROM teacher_name;
  INSERT INTO public.teacher_class_access(user_id,class_name)
  SELECT DISTINCT r.user_id,s.kelas FROM public.user_roles r JOIN public.students s ON s.id::text=ANY(clean_ids)
  WHERE r.role='guru' AND r.teacher_id=teacher_key ON CONFLICT DO NOTHING;
 END IF;
 RETURN jsonb_build_object('id',gid,'subject',subject_key,'members',cardinality(clean_ids));
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Kelompok atau siswa sudah terdaftar. Muat ulang daftar dan periksa kelompok lama';
END $body$;
REVOKE ALL ON FUNCTION public.gm_manage_learning_group(text,text,uuid,text,text,integer,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gm_manage_learning_group(text,text,uuid,text,text,integer,text[]) TO authenticated;

-- Penilaian: guru hanya siswa anggota kelompoknya pada pelajaran yang dipilih.
CREATE OR REPLACE FUNCTION app_private.can_assess_subject(student_key text,year_key integer,subject_key text,teacher_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $body$
 SELECT year_key BETWEEN 2000 AND 2200 AND subject_key IN ('tahsin','tahfidz')
 AND (app_private.is_manager() OR EXISTS(SELECT 1 FROM public.user_roles r
  WHERE r.user_id=auth.uid() AND r.role='guru' AND r.teacher_id=teacher_key))
 AND EXISTS(SELECT 1 FROM public.assessment_group_members m
  JOIN public.teaching_assignments a ON a.id=m.assignment_id
  JOIN public.students s ON s.id::text=m.student_id
  WHERE s.id::text=student_key AND m.subject=subject_key AND a.subject=subject_key
   AND m.active AND a.active AND m.academic_year_start=year_key AND a.academic_year_start=year_key
   AND a.teacher_id=teacher_key);
$body$;

-- Publik HANYA Tahsin; guru Tahfidz yang tidak mengajar Tahsin tidak ikut.
CREATE OR REPLACE FUNCTION public.gm_public_tahsin_students(year_key integer DEFAULT NULL)
RETURNS TABLE(id bigint,"nama siswa" text,kelas text,"nama guru" text,teacher_id bigint,class_id bigint,academic_year_start integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $body$
 SELECT s.id,s."nama siswa"::text,s.kelas::text,t.nama::text,t.id,sc.id,a.academic_year_start
 FROM public.assessment_group_members m JOIN public.teaching_assignments a ON a.id=m.assignment_id
 JOIN public.students s ON s.id::text=m.student_id JOIN public.teachers t ON t.id::text=a.teacher_id
 JOIN public.student_class_assignments sca ON sca.student_id=s.id AND sca.academic_year_start=a.academic_year_start
 JOIN public.school_classes sc ON sc.id=sca.class_id AND sc.academic_year_start=a.academic_year_start
 WHERE m.subject='tahsin' AND a.subject='tahsin' AND a.active AND m.active
 AND t.attendance_enabled IS NOT FALSE AND sc.normalized_name=lower(regexp_replace(trim(s.kelas),'[[:space:]]+',' ','g'))
 AND m.academic_year_start=a.academic_year_start
 AND a.academic_year_start=coalesce(year_key,
  EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer-
  CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END)
 ORDER BY s.kelas,s."nama siswa";
$body$;
REVOKE ALL ON FUNCTION public.gm_public_tahsin_students(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gm_public_tahsin_students(integer) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.gm_public_tahsin_teachers(year_key integer DEFAULT NULL)
RETURNS TABLE(id bigint,nama text,nama_lengkap text,foto text,attendance_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $body$
 SELECT DISTINCT t.id,t.nama::text,t.nama_lengkap::text,t.foto::text,t.attendance_enabled
 FROM public.teachers t JOIN public.teaching_assignments a ON a.teacher_id=t.id::text
 JOIN public.assessment_group_members m ON m.assignment_id=a.id AND m.active AND m.subject='tahsin'
 WHERE a.subject='tahsin' AND a.active AND t.attendance_enabled IS NOT FALSE
 AND a.academic_year_start=coalesce(year_key,
  EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer-
  CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END)
 ORDER BY 2;
$body$;
REVOKE ALL ON FUNCTION public.gm_public_tahsin_teachers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gm_public_tahsin_teachers(integer) TO anon,authenticated;

-- Browser lama dan baru: server menolak Tahfidz untuk absensi publik,
-- memeriksa ID server-side (bukan sekadar memercayai JavaScript).
CREATE OR REPLACE FUNCTION public.gm_fill_attendance_ids_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $body$
DECLARE n integer; sid bigint; cid bigint; tid bigint; yr integer;
BEGIN
 yr:=EXTRACT(YEAR FROM NEW.date)::integer-CASE WHEN EXTRACT(MONTH FROM NEW.date)<7 THEN 1 ELSE 0 END;
 SELECT count(*),min(s.id),min(sc.id),min(t.id) INTO n,sid,cid,tid
 FROM public.students s JOIN public.assessment_group_members m ON m.student_id=s.id::text
 JOIN public.teaching_assignments a ON a.id=m.assignment_id
 JOIN public.teachers t ON t.id::text=a.teacher_id
 JOIN public.student_class_assignments sca ON sca.student_id=s.id AND sca.academic_year_start=yr
 JOIN public.school_classes sc ON sc.id=sca.class_id AND sc.academic_year_start=yr
 WHERE m.active AND a.active AND m.subject='tahsin' AND a.subject='tahsin'
 AND a.academic_year_start=yr AND m.academic_year_start=yr
 AND t.attendance_enabled IS NOT FALSE
 AND s."nama siswa"=NEW.student AND s.kelas=NEW.class AND t.nama=NEW.teacher
 AND sc.normalized_name=lower(regexp_replace(trim(NEW.class),'[[:space:]]+',' ','g'))
 AND (NEW.student_id IS NULL OR NEW.student_id=s.id)
 AND (NEW.class_id IS NULL OR NEW.class_id=sc.id)
 AND (NEW.teacher_id IS NULL OR NEW.teacher_id=t.id);
 IF n<>1 THEN RAISE EXCEPTION 'Siswa/kelas/guru Tahsin tidak ditemukan atau ambigu dalam kelompok aktif. Muat ulang halaman'; END IF;
 NEW.student_id:=sid; NEW.class_id:=cid; NEW.teacher_id:=tid;
 RETURN NEW;
END $body$;
REVOKE ALL ON FUNCTION public.gm_fill_attendance_ids_before_insert() FROM PUBLIC;

-- Akses baca langsung siswa versi PWA lama juga dibatasi ke Tahsin aktif.
CREATE OR REPLACE FUNCTION app_private.gm_student_is_tahsin(student_key bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $body$
 SELECT EXISTS(SELECT 1 FROM public.assessment_group_members m
 JOIN public.teaching_assignments a ON a.id=m.assignment_id
 WHERE m.student_id=student_key::text AND m.subject='tahsin' AND a.subject='tahsin'
 AND m.active AND a.active AND m.academic_year_start=a.academic_year_start
 AND a.academic_year_start=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer-
 CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END);
$body$;
REVOKE ALL ON FUNCTION app_private.gm_student_is_tahsin(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.gm_student_is_tahsin(bigint) TO anon;
DROP POLICY IF EXISTS public_roster ON public.students;
CREATE POLICY public_roster ON public.students FOR SELECT TO anon
 USING(app_private.gm_student_is_tahsin(id));

-- Browser lama mengambil langsung tabel guru. Kebijakan anon juga hanya Tahsin.
DROP POLICY IF EXISTS public_roster ON public.teachers;
CREATE POLICY public_roster ON public.teachers FOR SELECT TO anon
 USING (attendance_enabled IS NOT FALSE AND EXISTS (
  SELECT 1 FROM public.teaching_assignments a
  JOIN public.assessment_group_members m ON m.assignment_id=a.id
  WHERE a.teacher_id=teachers.id::text AND a.subject='tahsin' AND m.subject='tahsin'
   AND a.active AND m.active AND m.academic_year_start=a.academic_year_start
   AND a.academic_year_start=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer-
    CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END));
-- Jangan izinkan akun guru membaca siswa hanya karena kolom guru legacy belum diperbarui.
DROP POLICY IF EXISTS scoped_read ON public.students;
CREATE POLICY scoped_read ON public.students FOR SELECT TO authenticated
 USING (app_private.is_manager());
-- Guru Tahfidz dapat mengakses peserta kelompoknya melalui policy baca master.
DROP POLICY IF EXISTS gm_group_teacher_student_read ON public.students;
CREATE POLICY gm_group_teacher_student_read ON public.students FOR SELECT TO authenticated
 USING(app_private.is_manager() OR EXISTS(
  SELECT 1 FROM public.assessment_group_members m JOIN public.teaching_assignments a ON a.id=m.assignment_id
  WHERE m.student_id=students.id::text AND m.active AND a.active AND a.teacher_id=
   (SELECT teacher_id FROM public.user_roles WHERE user_id=auth.uid() AND role='guru')
  AND a.academic_year_start=m.academic_year_start));

-- Perbaiki akses langsung untuk asesmen baca: tetap menggunakan fungsi di atas.
NOTIFY pgrst,'reload schema';
COMMIT;

-- Jalankan audit SESUDAH pemasangan, bukan untuk menambah/menghapus siswa.
SELECT a.subject,count(DISTINCT m.student_id) AS siswa_aktif
FROM public.assessment_group_members m JOIN public.teaching_assignments a ON a.id=m.assignment_id
WHERE m.active AND a.active GROUP BY a.subject ORDER BY a.subject;
SELECT count(*) AS total_absensi,count(*) FILTER(WHERE student_id IS NULL OR class_id IS NULL OR teacher_id IS NULL) AS tanpa_id
FROM public.attendance;
