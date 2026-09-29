-- HANYA Supabase PENGUJIAN setelah ID 1213 dan 1214 telanjur dihapus.
-- Rekatkan relasi orphan yang masih menggunakan kedua ID tersebut ke ID lama.
-- BUKAN mekanisme penggabungan umum, BUKAN untuk produksi.
-- Tidak mengisi NISN resmi, tidak menyentuh attendance, tidak mengubah nilai.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TEMP TABLE recover_deleted_imports (
  old_id bigint PRIMARY KEY, deleted_id bigint UNIQUE NOT NULL,
  expected_name text NOT NULL
) ON COMMIT DROP;
INSERT INTO recover_deleted_imports(old_id,deleted_id,expected_name) VALUES
 (38,1213,'Muhammad Gibran Ardana'),
 (39,1214,'Muhammad Ibrahim Albarra Maliq');

DO $$
DECLARE entry record; orphan_count integer; active_old_count integer;
BEGIN
  -- Hentikan jika data master tidak sesuai kasus pengujian yang telah diaudit.
  FOR entry IN SELECT * FROM recover_deleted_imports LOOP
    IF EXISTS(SELECT 1 FROM public.students WHERE id=entry.deleted_id)
       OR NOT EXISTS(SELECT 1 FROM public.students s WHERE s.id=entry.old_id
              AND lower(trim(s."nama siswa"))=lower(entry.expected_name)) THEN
      RAISE EXCEPTION 'Master ID %, % tidak sesuai; jangan lanjut',entry.old_id,entry.deleted_id;
    END IF;
    IF EXISTS(SELECT 1 FROM public.subject_assessments WHERE student_id=entry.deleted_id::text)
       OR EXISTS(SELECT 1 FROM public.periodic_assessments WHERE student_id=entry.deleted_id::text)
       OR EXISTS(SELECT 1 FROM public.student_reports WHERE student_id=entry.deleted_id::text)
       OR EXISTS(SELECT 1 FROM public.student_identifiers WHERE student_id=entry.deleted_id)
    THEN
      RAISE EXCEPTION 'ID orphan % memiliki nilai/rapor/identitas: audit manual dulu',entry.deleted_id;
    END IF;
    SELECT count(*) INTO orphan_count
      FROM public.assessment_group_members gm
      WHERE gm.student_id=entry.deleted_id::text AND gm.active;
    SELECT count(*) INTO active_old_count
      FROM public.assessment_group_members gm
      WHERE gm.student_id=entry.old_id::text AND gm.active
        AND gm.academic_year_start IN
          (SELECT orphan.academic_year_start FROM public.assessment_group_members orphan
           WHERE orphan.student_id=entry.deleted_id::text AND orphan.active);
    IF orphan_count>0 AND active_old_count>0 THEN
      IF EXISTS(
        SELECT 1 FROM public.assessment_group_members orphan
        WHERE orphan.student_id=entry.deleted_id::text AND orphan.active
          AND NOT EXISTS (
            SELECT 1 FROM public.assessment_group_members existing
            WHERE existing.student_id=entry.old_id::text
              AND existing.assignment_id=orphan.assignment_id
              AND existing.academic_year_start=orphan.academic_year_start AND existing.active
          )
      ) THEN
        RAISE EXCEPTION 'ID lama % sudah berada di grup Tahfidz lain; audit manual',entry.old_id;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Simpan pasangan identik yang perlu diaktifkan pada ID lama. Urutan penting:
-- hapus dahulu orphan yang identik, BARU aktifkan ID lama, agar indeks
-- one_tahfidz_group_per_year tidak menolak dua anggota aktif sekaligus.
CREATE TEMP TABLE restore_matching_groups ON COMMIT DROP AS
SELECT DISTINCT p.old_id, existing.assignment_id, existing.academic_year_start
FROM public.assessment_group_members AS orphan
JOIN recover_deleted_imports AS p ON orphan.student_id=p.deleted_id::text
JOIN public.assessment_group_members AS existing
 ON existing.student_id=p.old_id::text
 AND existing.assignment_id=orphan.assignment_id
 AND existing.academic_year_start=orphan.academic_year_start
WHERE orphan.active AND NOT existing.active;

-- Buang hanya keanggotaan orphan yang sudah mempunyai pasangan ID lama
-- di grup dan tahun yang persis sama (aktif maupun nonaktif).
DELETE FROM public.assessment_group_members AS orphan
USING recover_deleted_imports AS p
WHERE orphan.student_id=p.deleted_id::text
 AND EXISTS (
  SELECT 1 FROM public.assessment_group_members AS existing
  WHERE existing.student_id=p.old_id::text
   AND existing.assignment_id=orphan.assignment_id
   AND existing.academic_year_start=orphan.academic_year_start
 );

-- Baru aktifkan baris lama jika orphan semula aktif di grup yang sama.
UPDATE public.assessment_group_members AS existing
SET active=true
FROM restore_matching_groups AS m
WHERE existing.student_id=m.old_id::text
 AND existing.assignment_id=m.assignment_id
 AND existing.academic_year_start=m.academic_year_start
 AND NOT existing.active;

-- Jika ID lama sudah aktif di kelompok lain tahun yang sama, pemindahan akan
-- menabrak indeks one_tahfidz_group_per_year dan rollback (bukan hapus massal).
UPDATE public.assessment_group_members AS orphan
SET student_id=p.old_id::text
FROM recover_deleted_imports AS p
WHERE orphan.student_id=p.deleted_id::text;

-- Baris peserta rapor duplikat orphan: jika ID lama sudah punya periode yang
-- sama, cukup hapus orphan yang terkait dua ID pengujian yang telah dihapus.
DELETE FROM public.report_period_students AS orphan
USING recover_deleted_imports AS p
WHERE orphan.student_id=p.deleted_id::text
  AND EXISTS (
   SELECT 1 FROM public.report_period_students AS current_roster
   WHERE current_roster.student_id=p.old_id::text
     AND current_roster.academic_year_start=orphan.academic_year_start
     AND current_roster.period=orphan.period
  );
UPDATE public.report_period_students AS orphan
SET student_id=p.old_id::text
FROM recover_deleted_imports AS p
WHERE orphan.student_id=p.deleted_id::text;

DO $$
BEGIN
 IF EXISTS(
   SELECT 1 FROM public.assessment_group_members
   WHERE student_id IN ('1213','1214')
 ) OR EXISTS(
   SELECT 1 FROM public.report_period_students
   WHERE student_id IN ('1213','1214')
 ) THEN
    RAISE EXCEPTION 'Masih ada orphan 1213/1214; seluruh transaksi dibatalkan';
 END IF;
END $$;
COMMIT;
-- Setelah berhasil, ulangi impor dengan kode importer baru agar seluruh siswa
-- di file mendapat tautan Tahfidz dan 4 periode rapor tahun ajaran pilihan.
