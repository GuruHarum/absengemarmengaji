-- PERBAIKAN IMPOR: jangan sampai perubahan Guru Tahfidz menonaktifkan anggota Tahsin.
-- Jalankan setelah 20260928-05 pada STAGING. Backup dan audit sebelum produksi.
BEGIN;
SET LOCAL lock_timeout='5s';
create or replace function public.import_students(entries jsonb, year_key integer default null, preview_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 item jsonb; row_preview jsonb; preview jsonb; checked_preview jsonb;
 pupil public.students%rowtype; old_ids public.student_identifiers%rowtype;
 nis_value text; nisn_value text; name_value text; class_value text;
 teacher_value text; teacher_input text; tahfidz_value text;
 pupil_id bigint; tahsin_id text; tahfidz_id text; group_id uuid; group_label text; grade_value text;
 candidate_count integer; current_count integer;
 created integer:=0; updated integer:=0; unchanged integer:=0;
 assigned integer:=0; reports_added integer:=0; reports_refreshed integer:=0;
 links_updated integer:=0; teachers_before integer; count_changed integer;
 changed boolean; link_changed boolean; manager boolean; clear_identifiers boolean;
begin
 manager:=app_private.is_manager();
 if auth.uid() is null or (not manager and app_private.teacher_name() is null) then
  raise exception 'Akses impor tidak diizinkan';
 end if;
 year_key:=coalesce(year_key,extract(year from now() at time zone 'Asia/Jakarta')::integer
              -case when extract(month from now() at time zone 'Asia/Jakarta')<7 then 1 else 0 end);
 preview:=public.preview_import_students(entries,year_key);
 if preview_token is null or preview_token<>(preview->>'token') then
  raise exception 'Impor diblokir: jalankan Analisis File terbaru sebelum menyimpan; hasil analisis sudah berubah';
 end if;
 if not coalesce((preview->>'can_import')::boolean,false) then
  raise exception 'Impor diblokir: masih ada baris Konflik/Perlu Diperiksa';
 end if;
 lock table public.teachers, public.students, public.student_identifiers,
   public.teaching_assignments, public.assessment_group_members,
   public.report_period_students, public.subject_assessments,
   public.periodic_assessments, public.student_reports
 in share row exclusive mode;
 -- Ulangi analisis SETELAH lock untuk mencegah ID/kelompok berubah di sela pratinjau dan simpan.
 checked_preview:=public.preview_import_students(entries,year_key);
 if checked_preview->>'token'<>preview_token
    or not coalesce((checked_preview->>'can_import')::boolean,false) then
  raise exception 'Database berubah setelah Analisis File. Analisis ulang sebelum impor';
 end if;
 preview:=checked_preview;
 -- Transformasi identitas ini dihitung ulang di SERVER dari file mentah.
 -- Preview token tidak dapat dipakai untuk mengirim keputusan pengosongan palsu.
 entries:=app_private.prepare_student_import_entries(entries);
 select count(*) into teachers_before from public.teachers;

 for item in select value from jsonb_array_elements(entries) loop
  select row_data.value into row_preview
  from jsonb_array_elements(preview->'rows') as row_data(value)
  where row_data.value->>'row'=item->>'row' limit 1;
  if row_preview is null or row_preview->>'action' not in ('new','update','unchanged') then
   raise exception 'Baris % tidak lolos pratinjau aman',item->>'row';
  end if;
  nis_value:=nullif(trim(item->>'nis'),''); nisn_value:=nullif(trim(item->>'nisn'),'');
  name_value:=nullif(trim(item->>'nama'),'');
  clear_identifiers:=coalesce((row_preview->>'clear_identifiers')::boolean,false);
  class_value:=nullif(app_private.normalize_student_class(item->>'kelas'),'');
  teacher_value:=nullif(trim(item->>'guru'),'');
  tahfidz_value:=nullif(trim(item->>'guru_tahfidz'),'');
  teacher_input:=teacher_value;
  pupil_id:=nullif(row_preview->>'target_student_id','')::bigint;
  pupil:=null; old_ids:=null;
  if pupil_id is not null then
   select * into pupil from public.students where id=pupil_id for update;
   if not found then raise exception 'ID target % hilang saat impor',pupil_id; end if;
   select * into old_ids from public.student_identifiers where student_id=pupil_id;
  end if;
  if not manager then
   if tahfidz_value is not null then raise exception 'Hanya pengelola boleh mengatur Guru Tahfidz'; end if;
   if pupil_id is not null and (pupil."nama guru" is distinct from app_private.teacher_name()
         or not app_private.owns_class(pupil.kelas)) then
    raise exception 'NIS di luar hak akses';
   end if;
   if lower(coalesce(teacher_value,pupil."nama guru",''))<>lower(app_private.teacher_name())
         or not app_private.owns_class(coalesce(class_value,pupil.kelas,'')) then
    raise exception 'Guru atau kelas di luar hak akses';
   end if;
  end if;

  tahsin_id:=app_private.import_teacher(teacher_input,true);
  tahfidz_id:=app_private.import_teacher(tahfidz_value,false);
  if tahsin_id is not null then
   select nama into teacher_value from public.teachers where id::text=tahsin_id;
  end if;
  name_value:=coalesce(name_value,pupil."nama siswa",'');
  class_value:=coalesce(class_value,pupil.kelas,'');
  teacher_value:=coalesce(teacher_value,pupil."nama guru",'');
  link_changed:=false;

  if pupil_id is null then
   insert into public.students("nama siswa",kelas,"nama guru")
   values(name_value,class_value,teacher_value) returning id into pupil_id;
   created:=created+1;
  else
   changed:=pupil."nama siswa" is distinct from name_value
       or app_private.normalize_student_class(pupil.kelas) is distinct from class_value
       or pupil."nama guru" is distinct from teacher_value
       or old_ids.nis is distinct from
         (case when clear_identifiers then null else coalesce(nis_value,old_ids.nis) end)
       or old_ids.nisn is distinct from
         (case when clear_identifiers then null else coalesce(nisn_value,old_ids.nisn) end);
   if changed then
    update public.students set "nama siswa"=name_value,kelas=class_value,"nama guru"=teacher_value
     where id=pupil_id;
    updated:=updated+1;
   else unchanged:=unchanged+1; end if;
  end if;
  insert into public.student_identifiers(student_id,nis,nisn)
   values(pupil_id,nis_value,nisn_value)
   on conflict(student_id) do update
     set nis=case when clear_identifiers then null
                  else coalesce(excluded.nis,public.student_identifiers.nis) end,
         nisn=case when clear_identifiers then null
                   else coalesce(excluded.nisn,public.student_identifiers.nisn) end;

  if manager and tahsin_id is not null and class_value<>'' then
   insert into public.teacher_class_access(user_id,class_name)
    select user_id,class_value from public.user_roles
    where teacher_id=tahsin_id and role='guru' on conflict do nothing;
   get diagnostics count_changed=ROW_COUNT;
   if count_changed>0 then link_changed:=true; end if;
  end if;

  -- Sinkronisasi setiap baris, TERMASUK status master 'unchanged'.
  -- Kolom Guru Tahfidz kosong TIDAK memindahkan / menghapus kelompok lama.
  if tahfidz_id is not null then
   select count(*) into current_count
   from public.assessment_group_members gm
   join public.teaching_assignments a on a.id=gm.assignment_id
   where gm.student_id=pupil_id::text and gm.academic_year_start=year_key and gm.active
     and a.academic_year_start=year_key and a.active and a.subject='tahfidz'
     and a.teacher_id=tahfidz_id;
   if current_count=0 then
    select nama into tahfidz_value from public.teachers where id::text=tahfidz_id;
    grade_value:=substring(class_value from '^[0-9]+');
    group_label:='Tahfidz '||tahfidz_value||case when grade_value is null
                 then ' Kelas Belum Diisi' else ' Kelas '||grade_value end;
    if length(group_label)>80 then
     raise exception 'Nama kelompok melebihi 80 karakter di baris %',item->>'row';
    end if;
    group_id:=null;
    -- Jika guru memiliki SATU kelompok aktif pada tingkat yang sama, pakai grup tersebut.
    -- Jangan membuat kelompok otomatis baru yang memecah rombel Tahfidz manual.
    select count(distinct a.id), min(a.id::text)::uuid into candidate_count,group_id
    from public.teaching_assignments a
    join public.assessment_group_members gm on gm.assignment_id=a.id and gm.active
    join public.students member_s on member_s.id::text=gm.student_id
    where a.active and a.subject='tahfidz' and a.roster_mode='members'
      and a.teacher_id=tahfidz_id and a.academic_year_start=year_key
      and gm.academic_year_start=year_key
      and substring(app_private.normalize_student_class(member_s.kelas) from '^[0-9]+')=grade_value;
    if candidate_count>1 then
     raise exception 'Guru Tahfidz memiliki lebih dari satu grup tingkat % (baris %)',grade_value,item->>'row';
    end if;
    if group_id is null then
     select id into group_id from public.teaching_assignments
      where academic_year_start=year_key and subject='tahfidz'
        and class_name=group_label and active;
     if group_id is not null and not exists(
       select 1 from public.teaching_assignments
        where id=group_id and teacher_id=tahfidz_id and roster_mode='members') then
      raise exception 'Nama kelompok Tahfidz dipakai pengampu lain (baris %)',item->>'row';
     end if;
    end if;
    if group_id is null then
     insert into public.teaching_assignments(teacher_id,subject,class_name,
        academic_year_start,created_by,roster_mode)
     values(tahfidz_id,'tahfidz',group_label,year_key,auth.uid(),'members')
     returning id into group_id;
    end if;
    -- Nonaktifkan hanya relasi tahun yang dipilih, bukan histori lintas tahun.
    update public.assessment_group_members set active=false
     where student_id=pupil_id::text and academic_year_start=year_key and subject='tahfidz' and active;
    insert into public.assessment_group_members(assignment_id,student_id,academic_year_start,subject)
     values(group_id,pupil_id::text,year_key,'tahfidz')
     on conflict(assignment_id,student_id) do update set active=true,subject='tahfidz';
    assigned:=assigned+1;
    link_changed:=true;
   end if;
  end if;

  -- Daftarkan setiap siswa ke EMPAT periode rapor tahun ajaran terpilih.
  -- Roster yang sudah memiliki nilai atau pernah diajukan/disetujui dibiarkan
  -- menjadi snapshot historis. Tidak ada pengubahan skor/rapor terbit.
  with changed_rows as (
   insert into public.report_period_students(student_id,academic_year_start,period,student_name,class_name)
   select pupil_id::text,year_key,p.period,name_value,class_value
    from unnest(array['pts_ganjil','pas_ganjil','pts_genap','pas_genap']) as p(period)
   on conflict(student_id,academic_year_start,period) do nothing
   returning 1
  ) select count(*) into count_changed from changed_rows;
  reports_added:=reports_added+count_changed;
  if count_changed>0 then link_changed:=true; end if;
  with changed_rows as (
   update public.report_period_students as cohort
      set student_name=name_value,class_name=class_value
    where cohort.student_id=pupil_id::text and cohort.academic_year_start=year_key
      and (cohort.student_name is distinct from name_value
        or cohort.class_name is distinct from class_value)
      and not exists(select 1 from public.subject_assessments sa
        where sa.student_id=cohort.student_id and sa.academic_year_start=cohort.academic_year_start and sa.period=cohort.period)
      and not exists(select 1 from public.periodic_assessments pa
        where pa.student_id=cohort.student_id and pa.academic_year_start=cohort.academic_year_start and pa.period=cohort.period)
      and not exists(select 1 from public.student_reports sr
        where sr.student_id=cohort.student_id and sr.academic_year_start=cohort.academic_year_start
          and sr.period=cohort.period and sr.status in ('DIAJUKAN','DISETUJUI'))
   returning 1
  ) select count(*) into count_changed from changed_rows;
  reports_refreshed:=reports_refreshed+count_changed;
  if count_changed>0 then link_changed:=true; end if;
  if link_changed then links_updated:=links_updated+1; end if;
 end loop;
 return jsonb_build_object('created',created,'filled',updated,'updated',updated,
     'unchanged',unchanged,'skipped',0,'issues','[]'::jsonb,
     'tahfidz_added',assigned,'report_added',reports_added,
     'report_refreshed',reports_refreshed,'links_updated',links_updated,
     'teachers_created',(select count(*) from public.teachers)-teachers_before,
     'identifiers_cleared',coalesce((preview->'summary'->>'identifiers_cleared')::integer,0));
end $$;
REVOKE ALL ON FUNCTION public.import_students(jsonb,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_students(jsonb,integer,text) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
