begin;
create or replace function app_private.report_score_keys(scores jsonb, sub text) returns text[] language plpgsql immutable set search_path='' as $$
declare kind text:=scores->>'tahsin_progress_type';book text:=scores->>'tahsin_book_number';result text[]:=array['tahsin_makhraj','tahsin_tartil'];legacy text:=upper(trim(scores->>'tahsin_book'));
begin
 if sub='tahfidz' then return array['tahfidz_makhraj','tahfidz_tajwid','tahfidz_hafalan'];end if;
 if nullif(kind,'') is null then
  if legacy ~ '^(BUKU\s*)?[1-3]$' then kind:='BUKU';book:=right(legacy,1);
  elsif legacy in ('FINISHING','SYAHADAH','TAKHASSUS') then kind:=legacy;
  elsif legacy ~ '^(JILID\s*)?(JUZ 27|4)$' then kind:='JILID';end if;
 end if;
 if kind in ('JILID','AL-QUR''AN','FINISHING','SYAHADAH','TAKHASSUS') or (kind='BUKU' and book in ('2','3')) then result:=array['tahsin_makhraj','tahsin_tajwid','tahsin_tartil'];end if;
 if kind='FINISHING' then result:=result||'tahsin_gharib'::text;end if;return result;
end $$;
revoke all on function app_private.report_score_keys(jsonb,text) from public,anon,authenticated;
create or replace function app_private.report_score_issues(scores jsonb,sub text) returns jsonb language plpgsql immutable set search_path='' as $$
declare field text;raw text;missing jsonb:='[]';invalid jsonb:='[]';stage jsonb:='[]';kind text:=scores->>'tahsin_progress_type';legacy text:=upper(trim(scores->>'tahsin_book'));
begin
 foreach field in array app_private.report_score_keys(scores,sub) loop
  raw:=trim(scores->>field);
  if nullif(raw,'') is null then missing:=missing||to_jsonb(field);
  elsif raw !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' then invalid:=invalid||to_jsonb(field);
  elsif raw::numeric not between 0 and 100 then invalid:=invalid||to_jsonb(field);end if;
 end loop;
 if sub='tahsin' and not coalesce((kind in ('JILID','AL-QUR''AN','FINISHING','SYAHADAH','TAKHASSUS') or kind='BUKU' and scores->>'tahsin_book_number' in ('1','2','3')) or (nullif(kind,'') is null and (legacy ~ '^(BUKU\s*)?[1-3]$' or legacy in ('FINISHING','SYAHADAH','TAKHASSUS') or legacy ~ '^(JILID\s*)?(JUZ 27|4)$')),false) then stage:=stage||'"Tahap capaian Tahsin belum jelas"'::jsonb;end if;
 if sub='tahfidz' and nullif(trim(scores->>'tahfidz_hafalan'),'') is not null and coalesce(scores->>'tahfidz_aspect_confirmed','false')<>'true' then stage:=stage||'"Isi ulang Tartil/Kelancaran; Hafalan lama tetap dalam riwayat"'::jsonb;end if;
 return jsonb_build_object('missing',missing,'invalid',invalid,'stage',stage,'complete',jsonb_array_length(missing||invalid||stage)=0);
end $$;
revoke all on function app_private.report_score_issues(jsonb,text) from public,anon,authenticated;
create or replace function app_private.surah_in_juz(juz integer,surah integer) returns boolean language sql immutable set search_path='' as $$
 select coalesce(surah between (r->>0)::integer and (r->>1)::integer,false) from (select ('[[1, 2], [2, 2], [2, 3], [3, 4], [4, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 11], [11, 12], [12, 14], [15, 16], [17, 18], [18, 20], [21, 22], [23, 25], [25, 27], [27, 29], [29, 33], [33, 36], [36, 39], [39, 41], [41, 45], [46, 51], [51, 57], [58, 66], [67, 77], [78, 114]]'::jsonb)->(juz-1) r) x;
$$;
revoke all on function app_private.surah_in_juz(integer,integer) from public,anon,authenticated;
create or replace function app_private.validate_report_progress(item jsonb, sub text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='{}'; kind text; n integer; stop_ayah integer; max_ayah integer; material text;
begin
 if sub='tahsin' then
  kind:=item->>'tahsin_progress_type';
  if kind is null or kind not in ('BUKU','JILID','AL-QUR''AN','FINISHING','SYAHADAH','TAKHASSUS') then raise exception 'Pilih jenis capaian Tahsin'; end if;
  result:=jsonb_build_object('tahsin_progress_type',kind,'tahsin_book',kind);
  if kind='BUKU' then
   n:=(item->>'tahsin_book_number')::integer;stop_ayah:=(item->>'tahsin_page')::integer;
   select b->>'material' into material from public.report_reference r,jsonb_array_elements(r.data->'books') b where r.id=1 and (b->>'book')::integer=n and (b->>'page')::integer=stop_ayah;
   if material is null then raise exception 'Buku atau halaman tidak tersedia'; end if;
   result:=result||jsonb_build_object('tahsin_book_number',n,'tahsin_page',stop_ayah,'tahsin_book','Buku '||n,'tahsin_material',material);
  elsif kind='JILID' then
   if coalesce(item->>'tahsin_jilid','') not in ('JUZ 27','4') then raise exception 'Jilid tidak valid'; end if;
   result:=result||jsonb_build_object('tahsin_jilid',item->>'tahsin_jilid','tahsin_material',case when item->>'tahsin_jilid'='JUZ 27' then 'Bacaan tilawah surat-surat dalam Juz 27' else 'Bacaan dengung ikhfa' end);
  elsif kind='AL-QUR''AN' then
   n:=(item->>'tahsin_surah_number')::integer;stop_ayah:=(item->>'tahsin_ayah')::integer;
   select ayahs into max_ayah from public.quran_surahs where number=n;
   if max_ayah is null or stop_ayah is null or stop_ayah not between 1 and max_ayah then raise exception 'Surat/ayat Tahsin tidak valid'; end if;
   result:=result||jsonb_build_object('tahsin_surah_number',n,'tahsin_ayah',stop_ayah);
  end if;
 else
  kind:=item->>'tahfidz_progress_type';n:=(item->>'tahfidz_juz')::integer;
  if kind is null or kind not in ('SURAT','REVIEW','TES') or n is null or n not between 1 and 30 then raise exception 'Jenis capaian/Juz tidak valid'; end if;
  if coalesce(item->>'tahfidz_aspect_confirmed','false')<>'true' then raise exception 'Verifikasi nilai Tartil/Kelancaran'; end if;
  result:=jsonb_build_object('tahfidz_progress_type',kind,'tahfidz_juz',n,'tahfidz_aspect_confirmed',true);
  if kind='SURAT' then
   n:=(item->>'tahfidz_surah')::integer;stop_ayah:=(item->>'tahfidz_ayah')::integer;
   if not app_private.surah_in_juz((item->>'tahfidz_juz')::integer,n) then raise exception 'Surat tidak berada pada juz terpilih';end if;
   select ayahs into max_ayah from public.quran_surahs where number=n;
   if max_ayah is null or stop_ayah is null or stop_ayah not between 1 and max_ayah or (item->>'tahfidz_ayah_start')::integer is null or (item->>'tahfidz_ayah_start')::integer not between 1 and stop_ayah then raise exception 'Rentang ayat Tahfidz tidak valid'; end if;
   result:=result||jsonb_build_object('tahfidz_surah',n,'tahfidz_ayah',stop_ayah,'tahfidz_ayah_start',(item->>'tahfidz_ayah_start')::integer);
  end if;
 end if;
 if length(coalesce(item->>'teacher_note',''))>500 then raise exception 'Catatan maksimal 500 karakter'; end if;
 return result||jsonb_build_object('teacher_note',coalesce(item->>'teacher_note',''));
end $$;
create or replace function public.save_subject_assessments(entries jsonb)
returns setof public.subject_assessments language plpgsql security definer set search_path='' as $$
declare item jsonb; previous public.subject_assessments; saved public.subject_assessments;
 assignment public.teaching_assignments; pupil record; teacher_label text;
 expected integer; yr integer; sub text; score_data jsonb; field text; raw text; n numeric; max_ayah integer;
begin
 if auth.uid() is null then raise exception 'Login diperlukan'; end if;
 if entries is null or jsonb_typeof(entries)<>'array' then raise exception 'Daftar nilai tidak valid'; end if;
 if jsonb_array_length(entries) not between 1 and 1000 then raise exception 'Simpan 1 sampai 1000 siswa per permintaan'; end if;
 for item in select * from jsonb_array_elements(entries) loop
  yr := (item->>'academic_year_start')::integer; sub := item->>'subject'; expected := (item->>'version')::integer;
  if expected is null or expected<0 then raise exception 'Versi tidak valid'; end if;
  if not app_private.can_assess_subject(item->>'student_id',yr,sub,item->>'teacher_id') then raise exception 'Tidak ada penugasan aktif untuk siswa dan pelajaran ini'; end if;
  select s."nama siswa" as name,s.kelas as class into pupil from public.students s where s.id::text=item->>'student_id' for share;
  perform 1 from public.teachers where id::text=item->>'teacher_id' for share;
  if not app_private.can_assess_subject(item->>'student_id',yr,sub,item->>'teacher_id') then raise exception 'Daftar siswa atau pengampu telah berubah. Muat ulang'; end if;
  assignment := null;
  if sub='tahsin' then
   assignment.teacher_id := item->>'teacher_id';
  else
   select a.* into assignment from public.teaching_assignments a
   join public.assessment_group_members m on m.assignment_id=a.id
   where a.active and m.active and m.student_id=item->>'student_id' and a.teacher_id=item->>'teacher_id'
    and a.subject='tahfidz' and a.academic_year_start=yr and m.academic_year_start=yr for share of a,m;
   if not found then raise exception 'Kelompok Tahfidz telah berubah. Muat ulang'; end if;
  end if;
  select coalesce(nullif(trim(t.nama_lengkap),''),t.nama) into teacher_label from public.teachers t where t.id::text=assignment.teacher_id;
  score_data := '{}'::jsonb;
  foreach field in array app_private.report_score_keys(item,sub) loop
   raw := trim(item->>field);
   if raw is null or raw !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' then raise exception 'Nilai % wajib angka 0-100 maksimal dua desimal',field; end if;
   n := raw::numeric;
   if n<0 or n>100 then raise exception 'Nilai harus 0-100'; end if;
   score_data := score_data || jsonb_build_object(field,n);
  end loop;
  score_data := score_data || app_private.validate_report_progress(item,sub);
  if expected=0 then
   insert into public.subject_assessments(student_id,academic_year_start,period,subject,teacher_id,assignment_id,student_name,class_name,teacher_name,scores,created_by,updated_by)
   values(item->>'student_id',yr,item->>'period',sub,assignment.teacher_id,assignment.id,pupil.name,pupil.class,teacher_label,score_data,auth.uid(),auth.uid()) returning * into saved;
  else
   select * into previous from public.subject_assessments where student_id=item->>'student_id' and academic_year_start=yr and period=item->>'period' and subject=sub for update;
   if not found or previous.version<>expected then raise exception 'Nilai sudah berubah. Muat ulang sebelum menyimpan'; end if;
   if previous.needs_review and not app_private.is_manager() then raise exception 'Nilai Tahfidz lama perlu diverifikasi pengelola terlebih dahulu'; end if;
   insert into public.subject_assessment_history(assessment_id,previous_record,changed_by) values(previous.id,to_jsonb(previous),auth.uid());
   update public.subject_assessments set teacher_id=assignment.teacher_id,assignment_id=assignment.id,
    teacher_name=case when teacher_id=assignment.teacher_id and not needs_review then teacher_name else teacher_label end,
    scores=previous.scores||score_data,needs_review=false,version=version+1,updated_at=now(),updated_by=auth.uid()
    where id=previous.id returning * into saved;
  end if;
  return next saved;
 end loop;
exception when unique_violation then raise exception 'Nilai sudah tersimpan. Muat ulang sebelum mengubah';
end $$;

create or replace function public.save_report_identity(payload jsonb,expected integer) returns integer language plpgsql security definer set search_path='' as $$
declare v integer;key text;clean jsonb:='{}';
begin
 if not app_private.is_manager() then raise exception 'Akses pengaturan ditolak';end if;
 foreach key in array array['principal_name','principal_niy','coordinator_name','coordinator_niy','city'] loop
  if nullif(trim(payload->>key),'') is null or length(payload->>key)>150 then raise exception 'Identitas wajib lengkap, maksimal 150 karakter';end if;
  clean:=clean||jsonb_build_object(key,trim(payload->>key));
 end loop;
 update public.report_settings set data=data||clean||'{"principal_degree":"","coordinator_degree":""}'::jsonb,version=version+1 where id=1 and version=expected returning version into v;
 if v is null then raise exception 'Pengaturan telah berubah. Muat ulang sebelum menyimpan identitas';end if;return v;
end $$;
create or replace function public.save_report_target(yr integer,pr text,grade integer,sub text,target jsonb,kkm numeric,previous jsonb default null) returns integer language plpgsql security definer set search_path='' as $$
declare cfg jsonb;key text;record jsonb;existing jsonb;clean jsonb;v integer;
begin
 if not app_private.is_manager() then raise exception 'Akses pengaturan ditolak';end if;
 if yr is null or yr not between 2000 and 2200 or pr is null or pr not in ('pts_ganjil','pas_ganjil','pts_genap','pas_genap') or grade is null or grade not between 1 and 6 or sub is null or sub not in ('tahsin','tahfidz') or kkm is null or kkm not between 0 and 100 then raise exception 'Target tidak valid';end if;
 clean:=app_private.validate_report_progress(target||'{"tahfidz_aspect_confirmed":true}'::jsonb,sub);
 if sub='tahfidz' and clean->>'tahfidz_progress_type'<>'SURAT' then raise exception 'Target Tahfidz harus surat dan ayat terakhir';end if;
 select data into cfg from public.report_settings where id=1 for update;
 key:=yr::text||'_'||pr||'_'||grade::text;record:=coalesce(cfg->'curriculum'->key,'{}');
 if record ? (sub||'_target') then existing:=jsonb_build_object('target',record->(sub||'_target'),'kkm',record->(sub||'_kkm'));end if;
 if existing is distinct from previous then raise exception 'Target kartu ini telah berubah. Muat ulang pengaturan';end if;
 record:=record||jsonb_build_object(sub||'_target',clean,sub||'_kkm',kkm);
 update public.report_settings set data=jsonb_set(data,'{curriculum}',coalesce(data->'curriculum','{}')||jsonb_build_object(key,record)),version=version+1 where id=1 returning version into v;return v;
end $$;
revoke all on function public.save_report_identity(jsonb,integer),public.save_report_target(integer,text,integer,text,jsonb,numeric,jsonb) from public,anon;
grant execute on function public.save_report_identity(jsonb,integer),public.save_report_target(integer,text,integer,text,jsonb,numeric,jsonb) to authenticated;
alter table public.student_reports add column if not exists issued_officials jsonb;
alter table public.student_reports add column if not exists issued_at timestamptz;
update public.student_reports set issued_officials=snapshot->'officials',issued_at=approved_at where issued_officials is null and snapshot->'officials' is not null;
update public.student_reports r set issued_officials=h.previous_record->'snapshot'->'officials',issued_at=(h.previous_record->>'approved_at')::timestamptz from
 (select distinct on(previous_record->>'student_id',previous_record->>'academic_year_start',previous_record->>'period') previous_record from public.student_report_history where previous_record->'snapshot'->'officials' is not null order by previous_record->>'student_id',previous_record->>'academic_year_start',previous_record->>'period',changed_at desc) h
 where r.issued_officials is null and r.student_id=h.previous_record->>'student_id' and r.academic_year_start=(h.previous_record->>'academic_year_start')::integer and r.period=h.previous_record->>'period';
drop trigger if exists assessment_report_changed on public.subject_assessments;
revoke all on function public.review_student_report(text,integer,text,text,integer,integer,text) from public,anon,authenticated;
create or replace function app_private.report_payload(student_key text,yr integer,pr text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb;b jsonb;pupil jsonb;config jsonb;refs jsonb;school jsonb;settings jsonb;ident jsonb;lvl text;issues jsonb:='[]';r record;officials jsonb;teachers jsonb;ts text;tf text;
begin
 select to_jsonb(t) into a from public.subject_assessments t where student_id=student_key and academic_year_start=yr and period=pr and subject='tahsin';
 select to_jsonb(t) into b from public.subject_assessments t where student_id=student_key and academic_year_start=yr and period=pr and subject='tahfidz';
 select jsonb_build_object('id',id::text,'name',coalesce(a->>'student_name',b->>'student_name',"nama siswa"),'class',coalesce(a->>'class_name',b->>'class_name',kelas)) into pupil from public.students where id::text=student_key;
 if pupil is null then pupil:=jsonb_build_object('id',student_key,'name',coalesce(a->>'student_name',b->>'student_name'),'class',coalesce(a->>'class_name',b->>'class_name'));end if;
 if a is null and b is null then
  select jsonb_build_object('id',student_id,'name',student_name,'class',class_name) into ident from public.report_period_students where student_id=student_key and academic_year_start=yr and period=pr;
  pupil:=coalesce(ident,pupil);
 end if;
 select jsonb_build_object('nis',nis,'nisn',nisn) into ident from public.student_identifiers where student_id::text=student_key;
 pupil:=pupil||coalesce(ident,'{}');
 select data into config from public.report_settings where id=1;
 select data into refs from public.report_reference where id=1;
 select to_jsonb(t) into school from public.school_profile t where id=1;
 lvl:=substring(app_private.normalize_student_class(pupil->>'class') from '^([0-9]+)');
 settings:=config->'curriculum'->(yr::text||'_'||pr||'_'||lvl);
 settings:=coalesce(settings,'{}');

 if a->>'class_name' is distinct from b->>'class_name' and a is not null and b is not null then issues:=issues||'"Snapshot kelas kedua pelajaran berbeda"'::jsonb;end if;
 for r in select * from public.subject_assessments where student_id=student_key and academic_year_start=yr and period=pr loop
  if r.needs_review then issues:=issues||to_jsonb(r.subject||' perlu verifikasi pengampu');end if;
  begin perform app_private.validate_report_progress(r.scores,r.subject);exception when others then issues:=issues||to_jsonb(r.subject||': '||sqlerrm);end;
 end loop;
 if nullif(pupil->>'nis','') is null then issues:=issues||'"NIS belum tersedia"'::jsonb;end if;
 if nullif(school->>'name','') is null or nullif(school->>'logo_url','') is null then issues:=issues||'"Profil atau logo sekolah belum lengkap"'::jsonb;end if;
 select coalesce(issued_officials,snapshot->'officials') into officials from public.student_reports where student_id=student_key and academic_year_start=yr and period=pr;
 officials:=coalesce(officials,config-'curriculum'-'overrides');
 select coalesce(nullif(t.nama_lengkap,''),t.nama) into ts from public.teachers t join public.students s on s."nama guru"=t.nama where s.id::text=student_key and t.attendance_enabled limit 1;
 select coalesce(nullif(t.nama_lengkap,''),t.nama) into tf from public.teaching_assignments a join public.assessment_group_members m on m.assignment_id=a.id join public.teachers t on t.id::text=a.teacher_id where m.student_id=student_key and m.active and a.active and a.subject='tahfidz' and a.academic_year_start=yr and m.academic_year_start=yr order by a.id limit 1;
 teachers:=jsonb_build_object('tahsin',coalesce(ts,a->>'teacher_name','Pengampu Belum Ditetapkan'),'tahfidz',coalesce(tf,b->>'teacher_name','Pengampu Belum Ditetapkan'));
 if nullif(officials->>'principal_name','') is null or nullif(officials->>'coordinator_name','') is null or nullif(officials->>'principal_niy','') is null or nullif(officials->>'coordinator_niy','') is null or nullif(officials->>'city','') is null then issues:=issues||'"Penandatangan/tempat rapor belum lengkap"'::jsonb;end if;
 if settings->'tahsin_target' is null or settings->'tahfidz_target' is null or settings->>'tahsin_kkm' is null or settings->>'tahfidz_kkm' is null then issues:=issues||'"KKM/target periode dan tingkat belum diatur"'::jsonb;
 else
  begin
   perform app_private.validate_report_progress(settings->'tahsin_target','tahsin');
   perform app_private.validate_report_progress((settings->'tahfidz_target')||'{"tahfidz_aspect_confirmed":true}'::jsonb,'tahfidz');
   if (settings->>'tahsin_kkm')::numeric not between 0 and 100 or (settings->>'tahfidz_kkm')::numeric not between 0 and 100 then raise exception 'KKM harus 0?100';end if;
  exception when others then issues:=issues||to_jsonb('Pengaturan target: '||sqlerrm);end;
 end if;
 return jsonb_build_object('student',pupil,'year',yr,'period',pr,'tahsin',a,'tahfidz',b,'settings',settings,'officials',officials,'teachers',teachers,'score_checks',jsonb_build_object('tahsin',app_private.report_score_issues(coalesce(a->'scores','{}'),'tahsin'),'tahfidz',app_private.report_score_issues(coalesce(b->'scores','{}'),'tahfidz')),'school',school,'reference',refs,'issues',issues);
end $$;
create or replace function public.report_roster(yr integer,pr text,grade integer,start_at integer default 0) returns setof jsonb language plpgsql security definer set search_path='' as $$
declare rec record;payload jsonb;report public.student_reports;
begin
 if not app_private.is_report_coordinator() then raise exception 'Rapor hanya untuk koordinator';end if;
 if yr not between 2000 and 2200 or pr not in ('pts_ganjil','pas_ganjil','pts_genap','pas_genap') or grade not between 1 and 6 or start_at<0 then raise exception 'Filter tidak valid';end if;
 insert into public.report_period_students(student_id,academic_year_start,period,student_name,class_name)
 select distinct on(student_id) student_id,yr,pr,student_name,class_name from public.subject_assessments where academic_year_start=yr and period=pr order by student_id,subject desc on conflict do nothing;
 insert into public.report_period_students(student_id,academic_year_start,period,student_name,class_name)
 select id::text,yr,pr,"nama siswa",kelas from public.students
 where substring(app_private.normalize_student_class(kelas) from '^([0-9]+)')=grade::text
 on conflict do nothing;
 for rec in
  with ids as(select student_id id from public.report_period_students where academic_year_start=yr and period=pr union select student_id from public.subject_assessments where academic_year_start=yr and period=pr union select student_id from public.student_reports where academic_year_start=yr and period=pr),
  labels as(select ids.id,coalesce(a.class_name,cohort.class_name,s.kelas,r.snapshot->'student'->>'class') class_name from ids
   left join public.students s on s.id::text=ids.id
   left join public.report_period_students cohort on cohort.student_id=ids.id and cohort.academic_year_start=yr and cohort.period=pr
   left join lateral(select class_name from public.subject_assessments where student_id=ids.id and academic_year_start=yr and period=pr order by subject desc limit 1) a on true
   left join public.student_reports r on r.student_id=ids.id and r.academic_year_start=yr and r.period=pr and r.status='DISETUJUI')
  select * from labels where substring(app_private.normalize_student_class(class_name) from '^([0-9]+)')=grade::text order by id limit 250 offset start_at
 loop
  select * into report from public.student_reports where student_id=rec.id and academic_year_start=yr and period=pr;
  payload:=app_private.report_payload(rec.id,yr,pr);
  return next payload||jsonb_build_object('fingerprint',md5(payload::text),'issued_at',report.issued_at);
 end loop;
end $$;

create or replace function public.record_report_issuance(entries jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb;payload jsonb;amount integer:=0;
begin
 if not app_private.is_report_coordinator() then raise exception 'Rapor hanya untuk koordinator';end if;
 if jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries) not between 1 and 3000 then raise exception 'Daftar penerbitan tidak valid';end if;
 lock table public.teachers,public.students,public.student_identifiers,public.teaching_assignments,public.assessment_group_members,public.subject_assessments,public.report_settings,public.report_reference,public.school_profile in share mode;
 for item in select value from jsonb_array_elements(entries) loop
  payload:=app_private.report_payload(item->>'student_id',(item->>'year')::integer,item->>'period');
  if md5(payload::text) is distinct from item->>'fingerprint' then raise exception 'Data rapor berubah selama pembuatan PDF. Muat ulang dan unduh kembali';end if;
  if jsonb_array_length(payload->'issues')>0 or not (payload->'score_checks'->'tahsin'->>'complete')::boolean or not (payload->'score_checks'->'tahfidz'->>'complete')::boolean then raise exception 'Rapor belum lengkap';end if;
 end loop;
 for item in select value from jsonb_array_elements(entries) loop
  payload:=app_private.report_payload(item->>'student_id',(item->>'year')::integer,item->>'period');
  insert into public.student_reports(student_id,academic_year_start,period,issued_officials,issued_at)
  values(item->>'student_id',(item->>'year')::integer,item->>'period',payload->'officials',now())
  on conflict(student_id,academic_year_start,period) do update set issued_officials=coalesce(public.student_reports.issued_officials,excluded.issued_officials),issued_at=coalesce(public.student_reports.issued_at,excluded.issued_at);
  amount:=amount+1;
 end loop;return amount;
end $$;
revoke all on function public.record_report_issuance(jsonb) from public,anon;
grant execute on function public.record_report_issuance(jsonb) to authenticated;
commit;
notify pgrst,'reload schema';
