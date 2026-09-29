-- Setelah migrasi kelompok, dukung siswa belum ditugaskan dan pelajaran terpisah.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.gm_sync_student_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE yr integer; teacher_count integer; next_teacher bigint; next_class bigint; class_count integer;
BEGIN
 IF OLD."nama siswa" IS NOT DISTINCT FROM NEW."nama siswa"
  AND OLD.kelas IS NOT DISTINCT FROM NEW.kelas
  AND OLD."nama guru" IS NOT DISTINCT FROM NEW."nama guru" THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.students other WHERE other.id<>NEW.id
  AND lower(trim(other."nama siswa"))=lower(trim(NEW."nama siswa"))
  AND lower(trim(other.kelas))=lower(trim(NEW.kelas))) THEN
  RAISE EXCEPTION 'Nama + kelas sudah dimiliki ID siswa lain; periksa duplikasi'; END IF;
 yr:=EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::integer
   -CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Jakarta')<7 THEN 1 ELSE 0 END;
 SELECT count(*),min(id) INTO teacher_count,next_teacher FROM public.teachers
  WHERE nama=NEW."nama guru" AND attendance_enabled IS NOT FALSE;
 IF teacher_count<>1 AND NEW."nama guru" IS DISTINCT FROM 'Belum ditugaskan' THEN
  RAISE EXCEPTION 'Guru Tahsin tidak ditemukan atau ambigu'; END IF;
 SELECT count(*),min(id) INTO class_count,next_class FROM public.school_classes
  WHERE academic_year_start=yr
   AND normalized_name=lower(regexp_replace(trim(NEW.kelas),'[[:space:]]+',' ','g'));
 IF class_count<>1 THEN RAISE EXCEPTION 'Kelas baru belum terdaftar unik di school_classes untuk %',yr; END IF;
 IF OLD.kelas IS DISTINCT FROM NEW.kelas OR OLD."nama guru" IS DISTINCT FROM NEW."nama guru" THEN
  IF EXISTS(SELECT 1 FROM public.subject_assessments WHERE student_id=NEW.id::text AND academic_year_start=yr
   AND (OLD.kelas IS DISTINCT FROM NEW.kelas OR subject='tahsin'))
   OR EXISTS(SELECT 1 FROM public.periodic_assessments WHERE student_id=NEW.id::text AND academic_year_start=yr)
   OR EXISTS(SELECT 1 FROM public.student_reports WHERE student_id=NEW.id::text AND academic_year_start=yr AND status IN ('DIAJUKAN','DISETUJUI')) THEN
   RAISE EXCEPTION 'Perubahan kelas/guru siswa yang sudah dinilai perlu peninjauan koordinator; nilai tidak diubah otomatis';
  END IF;
 END IF;
 -- Nama baru berlaku di seluruh absensi yang ber-ID siswa ini.
 UPDATE public.attendance SET student=NEW."nama siswa" WHERE student_id=NEW.id
   AND student IS DISTINCT FROM NEW."nama siswa";
 -- Perubahan kelas/guru mengikuti tahun ajaran berjalan saja.
 IF OLD.kelas IS DISTINCT FROM NEW.kelas OR OLD."nama guru" IS DISTINCT FROM NEW."nama guru" THEN
  IF next_teacher IS NULL AND EXISTS(SELECT 1 FROM public.attendance WHERE student_id=NEW.id
     AND date>=make_date(yr,7,1) AND date<make_date(yr+1,7,1)) THEN
    RAISE EXCEPTION 'Siswa berabsensi tidak boleh kehilangan guru Tahsin';
  END IF;
  UPDATE public.attendance SET class=NEW.kelas,teacher=NEW."nama guru",
   class_id=next_class,teacher_id=next_teacher
   WHERE student_id=NEW.id AND date>=make_date(yr,7,1) AND date<make_date(yr+1,7,1);
  UPDATE public.student_class_assignments SET class_id=next_class
   WHERE student_id=NEW.id AND academic_year_start=yr;
  INSERT INTO public.student_class_assignments(student_id,class_id,academic_year_start)
   SELECT NEW.id,next_class,yr WHERE NOT EXISTS(
    SELECT 1 FROM public.student_class_assignments WHERE student_id=NEW.id AND academic_year_start=yr);
  INSERT INTO public.teacher_class_access(user_id,class_name)
   SELECT user_id,NEW.kelas FROM public.user_roles WHERE next_teacher IS NOT NULL
    AND teacher_id=next_teacher::text
    AND role='guru' ON CONFLICT DO NOTHING;
 END IF;
 -- Daftar periode tanpa nilai atau rapor terbit mengikuti master terbaru.
 UPDATE public.report_period_students rp
 SET student_name=NEW."nama siswa",class_name=NEW.kelas
 WHERE rp.student_id=NEW.id::text
  AND NOT EXISTS(SELECT 1 FROM public.subject_assessments sa WHERE sa.student_id=rp.student_id
   AND sa.academic_year_start=rp.academic_year_start AND sa.period=rp.period)
  AND NOT EXISTS(SELECT 1 FROM public.periodic_assessments pa WHERE pa.student_id=rp.student_id
   AND pa.academic_year_start=rp.academic_year_start AND pa.period=rp.period)
  AND NOT EXISTS(SELECT 1 FROM public.student_reports sr WHERE sr.student_id=rp.student_id
   AND sr.academic_year_start=rp.academic_year_start AND sr.period=rp.period
   AND sr.status IN ('DIAJUKAN','DISETUJUI'));
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.gm_sync_student_identity() FROM PUBLIC,anon;
COMMIT;
