-- KHUSUS STAGING DAHULU. Dijalankan SETELAH Tahap 1 & 2 berhasil.
-- INSERT lama (nama saja) maupun PWA baru akan otomatis memperoleh 3 ID.
-- Tidak memodifikasi 17.924 absensi yang sudah ada; tidak menyentuh guru, akun, foto.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.gm_fill_attendance_ids_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $body$
DECLARE
 v_student_id bigint;
 v_class_id bigint;
 v_teacher_id bigint;
 v_student_count int;
 v_class_count int;
 v_teacher_count int;
 v_year int;
BEGIN
 v_year := EXTRACT(YEAR FROM NEW.date)::int
           - CASE WHEN EXTRACT(MONTH FROM NEW.date) < 7 THEN 1 ELSE 0 END;
 SELECT count(*), min(id) INTO v_student_count,v_student_id
 FROM public.students
 WHERE "nama siswa" = NEW.student AND kelas = NEW.class
   AND "nama guru" = NEW.teacher;
 IF v_student_count <> 1 THEN
   RAISE EXCEPTION 'Identitas siswa tidak tunggal untuk absen hari ini';
 END IF;
 SELECT count(*), min(id) INTO v_teacher_count,v_teacher_id
 FROM public.teachers WHERE nama = NEW.teacher;
 IF v_teacher_count <> 1 THEN
   RAISE EXCEPTION 'Identitas guru tidak tunggal';
 END IF;
 SELECT count(*), min(id) INTO v_class_count,v_class_id
 FROM public.school_classes
 WHERE academic_year_start = v_year
   AND normalized_name = lower(regexp_replace(btrim(NEW.class),'[[:space:]]+',' ','g'));
 IF v_class_count <> 1 THEN
   RAISE EXCEPTION 'ID kelas tidak ditemukan atau tidak unik';
 END IF;
 -- Hindari pemalsuan ID saat akses absensi publik; ketiga ID harus
 -- konsisten dengan nama siswa/kelas/guru yang dipilih.
 IF (NEW.student_id IS NOT NULL AND NEW.student_id <> v_student_id)
    OR (NEW.class_id IS NOT NULL AND NEW.class_id <> v_class_id)
    OR (NEW.teacher_id IS NOT NULL AND NEW.teacher_id <> v_teacher_id) THEN
    RAISE EXCEPTION 'ID absensi tidak cocok dengan master';
 END IF;
 NEW.student_id := v_student_id;
 NEW.class_id := v_class_id;
 NEW.teacher_id := v_teacher_id;
 RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION public.gm_fill_attendance_ids_before_insert() FROM PUBLIC;
DROP TRIGGER IF EXISTS gm_fill_attendance_ids_insert ON public.attendance;
CREATE TRIGGER gm_fill_attendance_ids_insert BEFORE INSERT ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.gm_fill_attendance_ids_before_insert();
-- Satu absensi per tanggal/siswa/guru. Uji staging dahulu;
-- jika sudah ada duplikasi, seluruh transaksi batal dan tidak mengubah data.
CREATE UNIQUE INDEX IF NOT EXISTS gm_attendance_one_per_student_teacher_date
 ON public.attendance(date,student_id,teacher_id)
 WHERE student_id IS NOT NULL AND teacher_id IS NOT NULL;
COMMIT;
-- Pastikan trigger aktif tanpa mengirim absen percobaan pada produksi.
SELECT tgname,tgenabled FROM pg_trigger
WHERE tgrelid='public.attendance'::regclass
  AND tgname='gm_fill_attendance_ids_insert';
