-- GEMAR MENGAJI — MERGE DUPLIKAT SISWA TERVERIFIKASI (FIX DELETE GUARD 23c)
-- Perbaikan: update identitas keep_id dilakukan SETELAH merge_id dihapus agar
-- trigger gm_sync_student_identity tidak mendeteksi duplikasi sementara.
-- Tanggal: 2026-09-29
-- Tujuan: pertahankan ID lama/rendah, pindahkan seluruh data operasional dari ID baru/tinggi,
-- lalu hapus ID tinggi. Data ID tinggi menjadi sumber identitas terbaru (nama/kelas/guru/NIS/NISN).
-- PASANGAN TERVERIFIKASI:
-- 1108 -> 91   Muhamad Azzam Aulia Rahmat -> Muhammad Azzam Aulia R
-- 1111 -> 104  Alesha Naufalyn Hafizah -> Alesha Nauvalyn Hafizah
-- 1112 -> 144  Muhammad Ziyad AlFatih Pulungan -> Muhammad Ziyad Al Fatih
-- 1219 -> 44   Naya Talitha Zhafira -> Naya Thalita Zafira
-- 1251 -> 15   Hana Khalila -> Hana Kalila
-- 1252 -> 17   Lovell Reii Tama Kennedy -> Lovell Reii Tana Kennedy

BEGIN;
SET LOCAL lock_timeout = '8s';
SET LOCAL statement_timeout = '180s';

-- FIX 23c: pertahankan proteksi direct DELETE, tetapi izinkan hanya alur terverifikasi/merge audit.
-- Trigger app_private.prevent_direct_student_delete() tetap memblokir DELETE biasa.
CREATE OR REPLACE FUNCTION app_private.prevent_direct_student_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $guard$
BEGIN
  IF current_setting('app.gm_student_delete_mode', true) IN ('audited_merge','verified_delete') THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Hapus permanen siswa diblokir. Gunakan arsip atau alur gabung ID yang diaudit; nilai, rapor dan absensi historis harus dipertahankan.';
END;
$guard$;

-- Perbaiki RPC hapus terverifikasi agar tetap dapat bekerja melalui trigger guard.
CREATE OR REPLACE FUNCTION public.gm_delete_student_verified(
 p_student_id bigint,p_expected_name text,p_expected_attendance integer,p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r public.students%rowtype; total_att integer; deleted_students integer; rel record;
 known text[]:=ARRAY['attendance','assessment_group_members','report_period_students',
 'periodic_assessments','subject_assessments','student_reports','student_identifiers',
 'student_class_assignments'];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='koordinator')
 THEN RAISE EXCEPTION 'Hanya koordinator dapat menghapus siswa'; END IF;
 IF p_confirmation IS DISTINCT FROM ('HAPUS '||p_student_id::text)
 THEN RAISE EXCEPTION 'Konfirmasi kedua salah'; END IF;
 PERFORM pg_advisory_xact_lock(20260928,p_student_id::integer);
 SELECT * INTO r FROM public.students WHERE id=p_student_id FOR UPDATE;
 IF NOT FOUND OR r."nama siswa" IS DISTINCT FROM p_expected_name THEN
  RAISE EXCEPTION 'Data siswa berubah. Ulangi pratinjau sebelum menghapus'; END IF;
 FOR rel IN SELECT table_name FROM information_schema.columns
  WHERE table_schema='public' AND column_name='student_id'
  AND table_name <> ALL(known) LOOP
  RAISE EXCEPTION 'STOP: tabel % mempunyai student_id dan perlu audit manual sebelum menghapus',rel.table_name;
 END LOOP;
 SELECT count(*) INTO total_att FROM public.attendance WHERE student_id=p_student_id;
 IF total_att IS DISTINCT FROM p_expected_attendance THEN
  RAISE EXCEPTION 'Jumlah absensi berubah (%). Ulangi pratinjau',total_att; END IF;
 IF EXISTS(SELECT 1 FROM public.attendance WHERE student_id IS NULL
  AND student=r."nama siswa" AND class=r.kelas AND teacher=r."nama guru") THEN
  RAISE EXCEPTION 'Masih ada absensi tanpa ID yang berpotensi milik siswa ini'; END IF;
 DELETE FROM public.subject_assessment_history h
  USING public.subject_assessments a
  WHERE h.assessment_id=a.id AND a.student_id=p_student_id::text;
 DELETE FROM public.student_report_history
  WHERE previous_record->>'student_id'=p_student_id::text;
 DELETE FROM public.subject_assessments WHERE student_id=p_student_id::text;
 DELETE FROM public.periodic_assessments WHERE student_id=p_student_id::text;
 DELETE FROM public.student_reports WHERE student_id=p_student_id::text;
 DELETE FROM public.report_period_students WHERE student_id=p_student_id::text;
 DELETE FROM public.assessment_group_members WHERE student_id=p_student_id::text;
 DELETE FROM public.attendance WHERE student_id=p_student_id;
 DELETE FROM public.student_class_assignments WHERE student_id=p_student_id;
 DELETE FROM public.student_identifiers WHERE student_id=p_student_id;
 PERFORM set_config('app.gm_student_delete_mode','verified_delete',true);
 DELETE FROM public.students WHERE id=p_student_id;
 GET DIAGNOSTICS deleted_students = ROW_COUNT;
 PERFORM set_config('app.gm_student_delete_mode','',true);
 IF deleted_students <> 1 THEN RAISE EXCEPTION 'Penghapusan siswa gagal'; END IF;
 RETURN jsonb_build_object('deleted_student_id',p_student_id,'deleted_attendance',total_att);
END $f$;
REVOKE ALL ON FUNCTION public.gm_delete_student_verified(bigint,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gm_delete_student_verified(bigint,text,integer,text) TO authenticated;


CREATE TEMP TABLE gm_merge_map (
  keep_id bigint PRIMARY KEY,
  merge_id bigint UNIQUE NOT NULL,
  expected_keep_name text NOT NULL,
  expected_merge_name text NOT NULL,
  expected_class text NOT NULL,
  expected_teacher text NOT NULL
) ON COMMIT DROP;

INSERT INTO gm_merge_map(keep_id, merge_id, expected_keep_name, expected_merge_name, expected_class, expected_teacher) VALUES
 (91,  1108, 'Muhammad Azzam Aulia R',       'Muhamad Azzam Aulia Rahmat',       '1 Ali Bin Abi Thalib',       'Bu Amil'),
 (104, 1111, 'Alesha Nauvalyn Hafizah',      'Alesha Naufalyn Hafizah',          '1 Bilal Bin Rabbah',         'Bu Ulfa'),
 (144, 1112, 'Muhammad Ziyad Al Fatih',      'Muhammad Ziyad AlFatih Pulungan',  '1 Anas Bin Malik',           'Bu Amil'),
 (44,  1219, 'Naya Thalita Zafira',            'Naya Talitha Zhafira',             '1 Umar Bin Khattab',         'Pak Ali'),
 (15,  1251, 'Hana Kalila',                   'Hana Khalila',                     '1 Abu Bakar Ash Shiddiq',    'Pak Ali'),
 (17,  1252, 'Lovell Reii Tana Kennedy',      'Lovell Reii Tama Kennedy',         '1 Abu Bakar Ash Shiddiq',    'Pak Ali');

-- Kunci khusus agar dua proses merge tidak berjalan bersamaan.
SELECT pg_advisory_xact_lock(20260929, 23);

-- Simpan identitas terbaru ID tinggi sebelum ada perubahan.
CREATE TEMP TABLE gm_merge_source ON COMMIT DROP AS
SELECT
  m.keep_id,
  m.merge_id,
  s."nama siswa"::text AS latest_name,
  s.kelas::text AS latest_class,
  s."nama guru"::text AS latest_teacher,
  i.nis::text AS latest_nis,
  i.nisn::text AS latest_nisn
FROM gm_merge_map m
JOIN public.students s ON s.id = m.merge_id
LEFT JOIN public.student_identifiers i ON i.student_id = m.merge_id;

-- Validasi keras: hentikan SEMUA jika source berubah atau pasangan tidak lagi sesuai audit.
DO $verify$
DECLARE
  r record;
  k public.students%rowtype;
  n public.students%rowtype;
  k_nis text; k_nisn text; n_nis text; n_nisn text;
  unknown_tables text[];
BEGIN
  SELECT array_agg(c.table_name ORDER BY c.table_name)
  INTO unknown_tables
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'student_id'
    AND c.table_name <> ALL(ARRAY[
      'attendance','assessment_group_members','report_period_students','periodic_assessments',
      'subject_assessments','student_reports','student_identifiers','student_class_assignments'
    ]);

  IF unknown_tables IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: ditemukan tabel student_id yang belum diaudit: %', array_to_string(unknown_tables, ', ');
  END IF;

  FOR r IN SELECT * FROM gm_merge_map ORDER BY keep_id LOOP
    IF r.merge_id <= r.keep_id THEN
      RAISE EXCEPTION 'STOP: merge_id % harus lebih tinggi dari keep_id %', r.merge_id, r.keep_id;
    END IF;

    SELECT * INTO k FROM public.students WHERE id = r.keep_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'STOP: ID lama % tidak ditemukan', r.keep_id; END IF;

    SELECT * INTO n FROM public.students WHERE id = r.merge_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'STOP: ID baru % tidak ditemukan', r.merge_id; END IF;

    IF lower(trim(k."nama siswa")) IS DISTINCT FROM lower(trim(r.expected_keep_name)) THEN
      RAISE EXCEPTION 'STOP: nama ID lama % berubah: %', r.keep_id, k."nama siswa";
    END IF;
    IF lower(trim(n."nama siswa")) IS DISTINCT FROM lower(trim(r.expected_merge_name)) THEN
      RAISE EXCEPTION 'STOP: nama ID baru % berubah: %', r.merge_id, n."nama siswa";
    END IF;

    IF app_private.normalize_student_class(k.kelas) IS DISTINCT FROM app_private.normalize_student_class(r.expected_class)
       OR app_private.normalize_student_class(n.kelas) IS DISTINCT FROM app_private.normalize_student_class(r.expected_class) THEN
      RAISE EXCEPTION 'STOP: kelas pasangan % -> % tidak lagi sama dengan %', r.merge_id, r.keep_id, r.expected_class;
    END IF;

    IF lower(trim(k."nama guru")) IS DISTINCT FROM lower(trim(r.expected_teacher))
       OR lower(trim(n."nama guru")) IS DISTINCT FROM lower(trim(r.expected_teacher)) THEN
      RAISE EXCEPTION 'STOP: guru pasangan % -> % tidak lagi sama dengan %', r.merge_id, r.keep_id, r.expected_teacher;
    END IF;

    SELECT i.nis, i.nisn INTO k_nis, k_nisn FROM public.student_identifiers i WHERE i.student_id = r.keep_id;
    SELECT i.nis, i.nisn INTO n_nis, n_nisn FROM public.student_identifiers i WHERE i.student_id = r.merge_id;

    IF nullif(trim(k_nis),'') IS NOT NULL AND nullif(trim(n_nis),'') IS NOT NULL AND trim(k_nis) <> trim(n_nis) THEN
      RAISE EXCEPTION 'STOP: NIS berbeda pada % dan % (% vs %)', r.keep_id, r.merge_id, k_nis, n_nis;
    END IF;
    IF nullif(trim(k_nisn),'') IS NOT NULL AND nullif(trim(n_nisn),'') IS NOT NULL AND trim(k_nisn) <> trim(n_nisn) THEN
      RAISE EXCEPTION 'STOP: NISN berbeda pada % dan % (% vs %)', r.keep_id, r.merge_id, k_nisn, n_nisn;
    END IF;
  END LOOP;
END $verify$;

-- 1) IDENTITAS NIS/NISN: data ID tinggi menang bila tersedia.
CREATE TEMP TABLE gm_final_identifiers ON COMMIT DROP AS
SELECT
  m.keep_id,
  coalesce(nullif(trim(hi.nis),''), nullif(trim(lo.nis),'')) AS nis,
  coalesce(nullif(trim(hi.nisn),''), nullif(trim(lo.nisn),'')) AS nisn
FROM gm_merge_map m
LEFT JOIN public.student_identifiers hi ON hi.student_id = m.merge_id
LEFT JOIN public.student_identifiers lo ON lo.student_id = m.keep_id;

DELETE FROM public.student_identifiers i
USING gm_merge_map m
WHERE i.student_id IN (m.keep_id, m.merge_id);

INSERT INTO public.student_identifiers(student_id, nis, nisn)
SELECT keep_id, nis, nisn FROM gm_final_identifiers
ON CONFLICT (student_id) DO UPDATE
SET nis = EXCLUDED.nis, nisn = EXCLUDED.nisn;

-- 2) MASTER SISWA DITUNDA SAMPAI ID TINGGI DIHAPUS.
-- Alasan: trigger gm_sync_student_identity() melarang sementara dua baris
-- mempunyai nama+kelas yang sama. Seluruh relasi dipindahkan dahulu;
-- identitas master ID lama diperbarui setelah ID tinggi sudah tidak ada.

-- 3) RELASI KELAS: relasi ID tinggi menang pada tahun yang sama.
DELETE FROM public.student_class_assignments keep_sca
USING public.student_class_assignments src_sca, gm_merge_map m
WHERE keep_sca.student_id = m.keep_id
  AND src_sca.student_id = m.merge_id
  AND keep_sca.academic_year_start = src_sca.academic_year_start;

UPDATE public.student_class_assignments sca
SET student_id = m.keep_id
FROM gm_merge_map m
WHERE sca.student_id = m.merge_id;

-- 4) KELOMPOK TAHSIN/TAHFIDZ: keanggotaan aktif ID tinggi menjadi sumber kebenaran.
UPDATE public.assessment_group_members keep_gm
SET active = false
FROM public.assessment_group_members src_gm, gm_merge_map m
WHERE keep_gm.student_id = m.keep_id::text
  AND src_gm.student_id = m.merge_id::text
  AND src_gm.active
  AND keep_gm.active
  AND keep_gm.academic_year_start = src_gm.academic_year_start
  AND keep_gm.subject = src_gm.subject
  AND keep_gm.assignment_id <> src_gm.assignment_id;

-- Jika assignment sama sudah ada pada ID lama, hapus baris lama agar baris ID tinggi dapat dipindahkan utuh.
DELETE FROM public.assessment_group_members keep_gm
USING public.assessment_group_members src_gm, gm_merge_map m
WHERE keep_gm.student_id = m.keep_id::text
  AND src_gm.student_id = m.merge_id::text
  AND keep_gm.assignment_id = src_gm.assignment_id;

UPDATE public.assessment_group_members gm
SET student_id = m.keep_id::text
FROM gm_merge_map m
WHERE gm.student_id = m.merge_id::text;

-- 5) ABSENSI: jika tanggal+guru bentrok, baris ID tinggi menang.
DELETE FROM public.attendance keep_a
USING public.attendance src_a, gm_merge_map m
WHERE keep_a.student_id = m.keep_id
  AND src_a.student_id = m.merge_id
  AND keep_a.date = src_a.date
  AND keep_a.teacher_id IS NOT DISTINCT FROM src_a.teacher_id;

UPDATE public.attendance a
SET student_id = m.keep_id
FROM gm_merge_map m
WHERE a.student_id = m.merge_id;

-- 6) NILAI SUBJEK: pada periode/pelajaran sama, data ID tinggi menang.
-- Pindahkan histori milik baris ID lama ke assessment ID tinggi sebelum baris lama dihapus.
UPDATE public.subject_assessment_history h
SET assessment_id = src.id
FROM gm_merge_map m
JOIN public.subject_assessments src
  ON src.student_id = m.merge_id::text
JOIN public.subject_assessments keep_sa
  ON keep_sa.student_id = m.keep_id::text
 AND keep_sa.academic_year_start = src.academic_year_start
 AND keep_sa.period = src.period
 AND keep_sa.subject = src.subject
WHERE h.assessment_id = keep_sa.id;

DELETE FROM public.subject_assessments keep_sa
USING public.subject_assessments src, gm_merge_map m
WHERE keep_sa.student_id = m.keep_id::text
  AND src.student_id = m.merge_id::text
  AND keep_sa.academic_year_start = src.academic_year_start
  AND keep_sa.period = src.period
  AND keep_sa.subject = src.subject;

UPDATE public.subject_assessments sa
SET student_id = m.keep_id::text
FROM gm_merge_map m
WHERE sa.student_id = m.merge_id::text;

-- Normalisasi student_id pada snapshot histori penilaian.
UPDATE public.subject_assessment_history h
SET previous_record = jsonb_set(h.previous_record, '{student_id}', to_jsonb(m.keep_id::text), true)
FROM gm_merge_map m
WHERE h.previous_record->>'student_id' = m.merge_id::text;

-- 7) PERIODIC ASSESSMENTS lama: pada periode sama, data ID tinggi menang.
DELETE FROM public.periodic_assessments keep_pa
USING public.periodic_assessments src_pa, gm_merge_map m
WHERE keep_pa.student_id = m.keep_id::text
  AND src_pa.student_id = m.merge_id::text
  AND keep_pa.academic_year_start = src_pa.academic_year_start
  AND keep_pa.period = src_pa.period;

UPDATE public.periodic_assessments pa
SET student_id = m.keep_id::text
FROM gm_merge_map m
WHERE pa.student_id = m.merge_id::text;

-- 8) PESERTA RAPOR: data ID tinggi menang pada periode sama.
DELETE FROM public.report_period_students keep_rp
USING public.report_period_students src_rp, gm_merge_map m
WHERE keep_rp.student_id = m.keep_id::text
  AND src_rp.student_id = m.merge_id::text
  AND keep_rp.academic_year_start = src_rp.academic_year_start
  AND keep_rp.period = src_rp.period;

UPDATE public.report_period_students rp
SET student_id = m.keep_id::text
FROM gm_merge_map m
WHERE rp.student_id = m.merge_id::text;

-- 9) RAPOR: data ID tinggi menang pada periode sama.
DELETE FROM public.student_reports keep_sr
USING public.student_reports src_sr, gm_merge_map m
WHERE keep_sr.student_id = m.keep_id::text
  AND src_sr.student_id = m.merge_id::text
  AND keep_sr.academic_year_start = src_sr.academic_year_start
  AND keep_sr.period = src_sr.period;

UPDATE public.student_reports sr
SET student_id = m.keep_id::text
FROM gm_merge_map m
WHERE sr.student_id = m.merge_id::text;

-- Sinkronkan snapshot teks operasional agar nama/kelas terbaru konsisten pada data aktif.
UPDATE public.subject_assessments sa
SET student_name = s.latest_name,
    class_name = app_private.normalize_student_class(s.latest_class)
FROM gm_merge_source s
WHERE sa.student_id = s.keep_id::text;

UPDATE public.periodic_assessments pa
SET student_name = s.latest_name,
    class_name = app_private.normalize_student_class(s.latest_class)
FROM gm_merge_source s
WHERE pa.student_id = s.keep_id::text;

UPDATE public.report_period_students rp
SET student_name = s.latest_name,
    class_name = app_private.normalize_student_class(s.latest_class)
FROM gm_merge_source s
WHERE rp.student_id = s.keep_id::text;

-- Histori rapor menyimpan student_id di JSON snapshot.
UPDATE public.student_report_history h
SET previous_record = jsonb_set(h.previous_record, '{student_id}', to_jsonb(m.keep_id::text), true)
FROM gm_merge_map m
WHERE h.previous_record->>'student_id' = m.merge_id::text;

-- 10) Override rapor per siswa pada report_settings: pindahkan suffix _IDTINGGI ke _IDLAMA.
DO $override$
DECLARE
  m record;
  cfg jsonb;
  ov jsonb;
  e record;
  new_key text;
BEGIN
  IF to_regclass('public.report_settings') IS NULL THEN RETURN; END IF;
  SELECT rs.data INTO cfg FROM public.report_settings rs WHERE rs.id = 1 FOR UPDATE;
  IF cfg IS NULL THEN RETURN; END IF;
  ov := coalesce(cfg->'overrides', '{}'::jsonb);

  FOR m IN SELECT * FROM gm_merge_map LOOP
    FOR e IN SELECT key, value FROM jsonb_each(ov) LOOP
      IF e.key ~ ('_' || m.merge_id::text || '$') THEN
        new_key := regexp_replace(e.key, '_' || m.merge_id::text || '$', '_' || m.keep_id::text);
        -- ID tinggi dianggap terbaru, sehingga override-nya menang jika key ID lama juga sudah ada.
        ov := (ov - e.key) || jsonb_build_object(new_key, e.value);
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.report_settings
  SET data = jsonb_set(data, '{overrides}', ov, true)
  WHERE id = 1;
END $override$;

-- 11) Pastikan tidak ada relasi langsung tersisa pada ID tinggi sebelum menghapus master.
DO $refs$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM gm_merge_map LOOP
    IF EXISTS(SELECT 1 FROM public.attendance WHERE student_id = r.merge_id)
       OR EXISTS(SELECT 1 FROM public.assessment_group_members WHERE student_id = r.merge_id::text)
       OR EXISTS(SELECT 1 FROM public.report_period_students WHERE student_id = r.merge_id::text)
       OR EXISTS(SELECT 1 FROM public.periodic_assessments WHERE student_id = r.merge_id::text)
       OR EXISTS(SELECT 1 FROM public.subject_assessments WHERE student_id = r.merge_id::text)
       OR EXISTS(SELECT 1 FROM public.student_reports WHERE student_id = r.merge_id::text)
       OR EXISTS(SELECT 1 FROM public.student_identifiers WHERE student_id = r.merge_id)
       OR EXISTS(SELECT 1 FROM public.student_class_assignments WHERE student_id = r.merge_id)
    THEN
      RAISE EXCEPTION 'STOP: masih ada relasi pada ID tinggi %; seluruh transaksi dibatalkan', r.merge_id;
    END IF;
  END LOOP;
END $refs$;

SELECT set_config('app.gm_student_delete_mode','audited_merge',true);

DELETE FROM public.students s
USING gm_merge_map m
WHERE s.id = m.merge_id;

SELECT set_config('app.gm_student_delete_mode','',true);

-- 12) BARU SEKARANG PERBARUI MASTER ID LAMA.
-- ID tinggi sudah hilang, sehingga trigger sinkronisasi tidak lagi melihat
-- nama+kelas duplikat sementara. ID tetap memakai keep_id / ID lama.
UPDATE public.students k
SET "nama siswa" = s.latest_name,
    kelas = app_private.normalize_student_class(s.latest_class),
    "nama guru" = s.latest_teacher
FROM gm_merge_source s
WHERE k.id = s.keep_id
  AND (
    k."nama siswa" IS DISTINCT FROM s.latest_name
    OR k.kelas IS DISTINCT FROM app_private.normalize_student_class(s.latest_class)
    OR k."nama guru" IS DISTINCT FROM s.latest_teacher
  );

-- 13) Verifikasi akhir: harus 6 ID tinggi hilang dan 6 ID lama tetap ada.
DO $final$
DECLARE n_keep integer; n_merge integer;
BEGIN
  SELECT count(*) INTO n_keep
  FROM public.students s JOIN gm_merge_map m ON m.keep_id = s.id;
  SELECT count(*) INTO n_merge
  FROM public.students s JOIN gm_merge_map m ON m.merge_id = s.id;

  IF n_keep <> 6 OR n_merge <> 0 THEN
    RAISE EXCEPTION 'STOP: verifikasi akhir gagal (keep %, merge %)', n_keep, n_merge;
  END IF;
END $final$;

COMMIT;

-- HASIL VERIFIKASI SETELAH COMMIT
SELECT
  s.id AS student_id,
  s."nama siswa" AS nama_siswa,
  s.kelas,
  s."nama guru" AS guru_tahsin,
  i.nis,
  i.nisn,
  (SELECT count(*) FROM public.attendance a WHERE a.student_id=s.id) AS absensi,
  (SELECT count(*) FROM public.assessment_group_members gm WHERE gm.student_id=s.id::text AND gm.active) AS kelompok_aktif,
  (SELECT count(*) FROM public.subject_assessments sa WHERE sa.student_id=s.id::text) AS nilai_subjek,
  (SELECT count(*) FROM public.periodic_assessments pa WHERE pa.student_id=s.id::text) AS nilai_periodik,
  (SELECT count(*) FROM public.report_period_students rp WHERE rp.student_id=s.id::text) AS peserta_rapor,
  (SELECT count(*) FROM public.student_reports sr WHERE sr.student_id=s.id::text) AS rapor
FROM public.students s
LEFT JOIN public.student_identifiers i ON i.student_id=s.id
WHERE s.id IN (91,104,144,44,15,17)
ORDER BY s.id;

SELECT
  id,
  "nama siswa",
  kelas,
  "nama guru"
FROM public.students
WHERE id IN (1108,1111,1112,1219,1251,1252)
ORDER BY id;
-- Query terakhir harus menghasilkan 0 baris.
