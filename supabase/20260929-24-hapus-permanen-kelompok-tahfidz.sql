-- GEMAR MENGAJI 2026/27 — TAHAP 24
-- Bersihkan semua kelompok Tahfidz yang sudah diarsipkan (active=false),
-- lalu sediakan hard-delete aman untuk kelompok Tahfidz dari panel koordinator.
-- Prinsip:
--   * teaching_assignments + assessment_group_members kelompok dihapus permanen.
--   * students dan teachers TIDAK pernah dihapus.
--   * nilai/rapor siswa dipertahankan. subject_assessments hanya dilepas assignment_id-nya.
--   * periodic_assessments tidak disentuh karena format lama tidak memiliki assignment_id.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $preflight$
DECLARE unknown_tables text[];
BEGIN
  IF to_regclass('public.teaching_assignments') IS NULL
     OR to_regclass('public.assessment_group_members') IS NULL
     OR to_regclass('public.subject_assessments') IS NULL
     OR to_regclass('public.subject_assessment_history') IS NULL THEN
    RAISE EXCEPTION 'STOP: tabel kelompok/penilaian belum lengkap';
  END IF;

  SELECT array_agg(table_name ORDER BY table_name)
  INTO unknown_tables
  FROM information_schema.columns
  WHERE table_schema='public'
    AND column_name='assignment_id'
    AND table_name <> ALL(ARRAY['assessment_group_members','subject_assessments']);

  IF unknown_tables IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: ditemukan tabel assignment_id yang belum diaudit: %', array_to_string(unknown_tables, ', ');
  END IF;
END
$preflight$;

-- Pastikan FK anggota -> kelompok selalu cascade untuk penghapusan induk.
DO $fk$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid='public.assessment_group_members'::regclass
      AND contype='f'
      AND confrelid='public.teaching_assignments'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.assessment_group_members DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.assessment_group_members
    ADD CONSTRAINT assessment_group_members_assignment_id_fkey
    FOREIGN KEY (assignment_id)
    REFERENCES public.teaching_assignments(id)
    ON DELETE CASCADE;
END
$fk$;

-- =========================================================
-- ONE-TIME CLEANUP: HAPUS SEMUA KELOMPOK TAHFIDZ active=false
-- =========================================================
CREATE TEMP TABLE gm_archived_tahfidz_groups ON COMMIT DROP AS
SELECT id
FROM public.teaching_assignments
WHERE subject='tahfidz'
  AND active=false;

-- Hilangkan referensi assignment_id dari snapshot riwayat nilai.
-- Riwayat nilainya tetap ada; hanya hubungan ke grup yang dihapus.
UPDATE public.subject_assessment_history h
SET previous_record = h.previous_record - 'assignment_id'
WHERE h.previous_record ? 'assignment_id'
  AND (h.previous_record->>'assignment_id') IN (
    SELECT id::text FROM gm_archived_tahfidz_groups
  );

-- Nilai akademik tetap dipertahankan, tetapi tidak lagi menunjuk kelompok yang dihapus.
UPDATE public.subject_assessments sa
SET assignment_id = NULL
WHERE sa.assignment_id IN (
  SELECT id FROM gm_archived_tahfidz_groups
);

-- Membership akan ikut terhapus oleh ON DELETE CASCADE.
DELETE FROM public.teaching_assignments a
WHERE a.id IN (SELECT id FROM gm_archived_tahfidz_groups);

-- =========================================================
-- HARD DELETE UNTUK PANEL KOORDINATOR/ADMIN
-- =========================================================
CREATE OR REPLACE FUNCTION public.gm_delete_tahfidz_group_verified(
  p_group_id uuid,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $f$
DECLARE
  a public.teaching_assignments%rowtype;
  member_count integer;
  assessment_count integer;
  history_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id=auth.uid()
      AND role IN ('admin','koordinator')
  ) THEN
    RAISE EXCEPTION 'Hanya koordinator/admin dapat menghapus kelompok';
  END IF;

  IF p_confirmation IS DISTINCT FROM ('HAPUS ' || p_group_id::text) THEN
    RAISE EXCEPTION 'Konfirmasi penghapusan tidak sesuai';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text));

  SELECT * INTO a
  FROM public.teaching_assignments
  WHERE id=p_group_id
    AND subject='tahfidz'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kelompok Tahfidz tidak ditemukan atau sudah dihapus';
  END IF;

  SELECT count(*) INTO member_count
  FROM public.assessment_group_members
  WHERE assignment_id=p_group_id;

  SELECT count(*) INTO assessment_count
  FROM public.subject_assessments
  WHERE assignment_id=p_group_id;

  SELECT count(*) INTO history_count
  FROM public.subject_assessment_history
  WHERE previous_record->>'assignment_id'=p_group_id::text;

  -- Hilangkan jejak assignment_id dari snapshot histori; nilai historis tetap aman.
  UPDATE public.subject_assessment_history
  SET previous_record = previous_record - 'assignment_id'
  WHERE previous_record->>'assignment_id'=p_group_id::text;

  -- Pertahankan nilai siswa, lepaskan hanya hubungan ke kelompok yang akan dihapus.
  UPDATE public.subject_assessments
  SET assignment_id=NULL
  WHERE assignment_id=p_group_id;

  -- assessment_group_members terhapus otomatis oleh FK ON DELETE CASCADE.
  DELETE FROM public.teaching_assignments
  WHERE id=p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Penghapusan kelompok gagal';
  END IF;

  RETURN jsonb_build_object(
    'deleted_group_id', p_group_id,
    'deleted_members', member_count,
    'detached_assessments', assessment_count,
    'cleaned_history', history_count
  );
END
$f$;

REVOKE ALL ON FUNCTION public.gm_delete_tahfidz_group_verified(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gm_delete_tahfidz_group_verified(uuid,text) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- VERIFIKASI BACA SAJA
SELECT
  count(*) FILTER (WHERE subject='tahfidz' AND active=false) AS tahfidz_arsip_tersisa,
  count(*) FILTER (WHERE subject='tahfidz' AND active=true) AS tahfidz_aktif
FROM public.teaching_assignments;

SELECT
  to_regprocedure('public.gm_delete_tahfidz_group_verified(uuid,text)') IS NOT NULL AS hard_delete_tahfidz_siap;
