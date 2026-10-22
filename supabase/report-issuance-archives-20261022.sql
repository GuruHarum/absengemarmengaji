-- Rapor: arsip data saat penerbitan Word/Excel. Telah diterapkan di proyek Supabase.
-- Jangan gunakan nilai saat ini untuk mengisi salinan penerbitan lama.
-- Snapshot tidak menyalin berkas Word/Excel, tetapi menyimpan data sumber penerbitan.
create table if not exists public.report_issuance_archives (
 id bigint generated always as identity primary key,
 student_id text not null,
 academic_year_start integer not null,
 period text not null check (period in ('pts_ganjil','pas_ganjil','pts_genap','pas_genap')),
 student_name text not null,
 class_name text not null,
 fingerprint text not null,
 snapshot jsonb not null,
 issued_at timestamptz not null default now(),
 issued_by uuid,
 constraint report_issuance_archive_version_unique unique (student_id,academic_year_start,period,fingerprint)
);
create index if not exists report_issuance_archive_date_idx on public.report_issuance_archives (issued_at desc,id desc);
alter table public.report_issuance_archives enable row level security;
drop policy if exists report_issuance_archive_coordinator_read on public.report_issuance_archives;
create policy report_issuance_archive_coordinator_read on public.report_issuance_archives for select to authenticated using (app_private.is_report_coordinator());
revoke all on table public.report_issuance_archives from anon,authenticated;
grant select on table public.report_issuance_archives to authenticated;

CREATE OR REPLACE FUNCTION public.record_report_issuance(entries jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb; payload jsonb; amount integer := 0;
begin
 if not app_private.is_report_coordinator() then raise exception 'Rapor hanya untuk koordinator'; end if;
 if jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries) not between 1 and 3000 then
  raise exception 'Daftar penerbitan tidak valid';
 end if;
 lock table public.teachers,public.students,public.student_identifiers,public.teaching_assignments,
 public.assessment_group_members,public.subject_assessments,public.report_settings,
 public.report_reference,public.school_profile in share mode;
 -- Validasi seluruh siswa sebelum mencatat penerbitan apa pun.
 for item in select value from jsonb_array_elements(entries) loop
  payload := app_private.report_payload(item->>'student_id',(item->>'year')::integer,item->>'period');
  if md5(payload::text) is distinct from item->>'fingerprint' then
   raise exception 'Data rapor berubah selama pembuatan dokumen. Muat ulang dan unduh kembali';
  end if;
  if jsonb_array_length(payload->'issues') > 0
   or not (payload->'score_checks'->'tahsin'->>'complete')::boolean
   or not (payload->'score_checks'->'tahfidz'->>'complete')::boolean then
   raise exception 'Rapor belum lengkap';
  end if;
 end loop;
 for item in select value from jsonb_array_elements(entries) loop
  payload := app_private.report_payload(item->>'student_id',(item->>'year')::integer,item->>'period');
  -- Struktur penerbitan lama dipertahankan, termasuk waktu dan pejabatnya.
  insert into public.student_reports(student_id,academic_year_start,period,issued_officials,issued_at)
   values (item->>'student_id',(item->>'year')::integer,item->>'period',payload->'officials',now())
   on conflict(student_id,academic_year_start,period)
   do update set issued_officials=coalesce(public.student_reports.issued_officials,excluded.issued_officials),
                 issued_at=coalesce(public.student_reports.issued_at,excluded.issued_at);
  -- Arsip edisi baru dipisahkan dari riwayat lama agar tidak memalsukan snapshot terbit dahulu.
  -- Tidak pernah menimpa snapshot dengan fingerprint sama.
  insert into public.report_issuance_archives
   (student_id,academic_year_start,period,student_name,class_name,fingerprint,snapshot,issued_at,issued_by)
  values
   (item->>'student_id',(item->>'year')::integer,item->>'period',
    coalesce(payload->'student'->>'name','-'),coalesce(payload->'student'->>'class','-'),
    item->>'fingerprint',payload,now(),auth.uid())
  on conflict (student_id,academic_year_start,period,fingerprint) do nothing;
  amount := amount+1;
 end loop;
 return amount;
end
$function$
