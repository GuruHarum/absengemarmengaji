-- GEMAR MENGAJI 2026/27 — TAHAP 25
-- Memperbaiki mekanisme Arsip kelompok agar kelompok yang nonaktif
-- tidak lagi mengunci siswa dari kelompok baru.
--
-- Aman untuk master:
--   * students TIDAK dihapus
--   * teachers TIDAK dihapus
--   * teaching_assignments tetap ada sebagai arsip (active=false)
--   * assessment_group_members tetap ada sebagai riwayat, tetapi active=false

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.gm_archive_learning_group_v2(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $f$
DECLARE
  a public.teaching_assignments%rowtype;
  released integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin','koordinator')
  ) THEN
    RAISE EXCEPTION 'Hanya koordinator/admin dapat mengarsipkan kelompok';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text));

  SELECT * INTO a
  FROM public.teaching_assignments
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kelompok tidak ditemukan atau sudah dihapus';
  END IF;

  UPDATE public.assessment_group_members
  SET active = false
  WHERE assignment_id = p_group_id
    AND active = true;
  GET DIAGNOSTICS released = ROW_COUNT;

  UPDATE public.teaching_assignments
  SET active = false
  WHERE id = p_group_id;

  RETURN jsonb_build_object(
    'group_id', p_group_id,
    'subject', a.subject,
    'released_members', released,
    'archived', true
  );
END
$f$;

REVOKE ALL ON FUNCTION public.gm_archive_learning_group_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gm_archive_learning_group_v2(uuid) TO authenticated;

-- Perbaiki arsip lama yang mungkin masih menyimpan membership aktif.
UPDATE public.assessment_group_members gm
SET active = false
FROM public.teaching_assignments a
WHERE a.id = gm.assignment_id
  AND a.active = false
  AND gm.active = true;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Verifikasi baca saja: harus 0.
SELECT count(*) AS membership_aktif_dalam_kelompok_arsip
FROM public.assessment_group_members gm
JOIN public.teaching_assignments a ON a.id = gm.assignment_id
WHERE a.active = false
  AND gm.active = true;
