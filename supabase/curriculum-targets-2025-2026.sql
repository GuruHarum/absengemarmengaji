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
 if kind in ('JILID','AL-QUR''AN','GHARIB','TAJWID','FINISHING','SYAHADAH','TAKHASSUS') or (kind='BUKU' and book in ('2','3')) then result:=array['tahsin_makhraj','tahsin_tajwid','tahsin_tartil'];end if;
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
 if sub='tahsin' and not coalesce((kind in ('JILID','AL-QUR''AN','GHARIB','TAJWID','FINISHING','SYAHADAH','TAKHASSUS') or kind='BUKU' and scores->>'tahsin_book_number' in ('1','2','3')) or (nullif(kind,'') is null and (legacy ~ '^(BUKU\s*)?[1-3]$' or legacy in ('FINISHING','SYAHADAH','TAKHASSUS') or legacy ~ '^(JILID\s*)?(JUZ 27|4)$')),false) then stage:=stage||'"Tahap capaian Tahsin belum jelas"'::jsonb;end if;
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
  if kind is null or kind not in ('BUKU','JILID','AL-QUR''AN','GHARIB','TAJWID','FINISHING','SYAHADAH','TAKHASSUS') then raise exception 'Pilih jenis capaian Tahsin'; end if;
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
  if kind in ('AL-QUR''AN','GHARIB','TAJWID','FINISHING') then
   if nullif(trim(item->>'tahsin_juz_last'),'') is not null then
    if (item->>'tahsin_juz_last') !~ '^\d{1,2}$' or (item->>'tahsin_juz_last')::integer not between 1 and 30 then raise exception 'Juz terakhir Tahsin tidak valid';end if;
    result:=result||jsonb_build_object('tahsin_juz_last',(item->>'tahsin_juz_last')::integer);
   end if;
   if nullif(trim(item->>'tahsin_gharib_page'),'') is not null then
    if (item->>'tahsin_gharib_page') !~ '^\d{1,2}$' or (item->>'tahsin_gharib_page')::integer not between 1 and 60 then raise exception 'Halaman Gharib aktual tidak valid';end if;
    result:=result||jsonb_build_object('tahsin_gharib_page',(item->>'tahsin_gharib_page')::integer);
   end if;
   if nullif(trim(item->>'tahsin_tajwid_target_done'),'') is not null then
    if item->>'tahsin_tajwid_target_done' not in ('true','false') then raise exception 'Ketuntasan materi Tajwid tidak valid';end if;
    result:=result||jsonb_build_object('tahsin_tajwid_target_done',(item->>'tahsin_tajwid_target_done')::boolean);
   end if;
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

create or replace function app_private.validate_curriculum_target(v jsonb, sub text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare kind text; result jsonb:='{}'::jsonb; a integer; b integer; c integer; d integer; juz integer; max_a integer; max_b integer;
begin
 if sub='tahsin' then
  kind:=v->>'curriculum_mode';
  if kind not in ('BUKU','ALQ_GHARIB','GHARIB','TAJWID','IMTAS','TAKHASSUS') or kind is null then raise exception 'Jenis target Tahsin belum dipilih';end if;
  result:=jsonb_build_object('curriculum_mode',kind);
  if kind='BUKU' then
   if coalesce(v->>'tahsin_book_number','') !~ '^[1-3]$' then raise exception 'Buku harus 1 sampai 3';end if;
   if coalesce(v->>'target_page_start','') !~ '^\d{1,2}$' or coalesce(v->>'target_page_end','') !~ '^\d{1,2}$' then raise exception 'Halaman Buku wajib diisi';end if;
   a:=(v->>'target_page_start')::integer;b:=(v->>'target_page_end')::integer;
   if a<1 or b>60 or a>b then raise exception 'Rentang halaman Buku tidak valid';end if;
   result:=result||jsonb_build_object('tahsin_progress_type','BUKU','tahsin_book_number',(v->>'tahsin_book_number')::integer,'target_page_start',a,'target_page_end',b,'tahsin_page',b);
  elsif kind in ('ALQ_GHARIB','GHARIB','TAJWID') then
   if coalesce(v->>'target_juz_start','') !~ '^\d{1,2}$' or coalesce(v->>'target_juz_end','') !~ '^\d{1,2}$' then raise exception 'Rentang juz wajib diisi';end if;
   a:=(v->>'target_juz_start')::integer;b:=(v->>'target_juz_end')::integer;
   if a<1 or b>30 or a>b then raise exception 'Rentang juz tidak valid';end if;
   result:=result||jsonb_build_object('target_juz_start',a,'target_juz_end',b,'tahsin_progress_type',case when kind='ALQ_GHARIB' then 'AL-QUR''AN' else kind end);
   if kind='TAJWID' then
    if nullif(trim(v->>'target_tajwid'),'') is null or length(v->>'target_tajwid')>120 then raise exception 'Materi Tajwid wajib, maksimal 120 karakter';end if;
    result:=result||jsonb_build_object('target_tajwid',trim(v->>'target_tajwid'));
   else
    if coalesce(v->>'gharib_page_start','') !~ '^\d{1,2}$' or coalesce(v->>'gharib_page_end','') !~ '^\d{1,2}$' then raise exception 'Rentang halaman Gharib wajib diisi';end if;
    c:=(v->>'gharib_page_start')::integer;d:=(v->>'gharib_page_end')::integer;
    if c<1 or d>60 or c>d then raise exception 'Rentang halaman Gharib tidak valid';end if;
    result:=result||jsonb_build_object('gharib_page_start',c,'gharib_page_end',d);
   end if;
  elsif kind='IMTAS' then
   if coalesce(v->>'imtas_month','') not in ('NOVEMBER','FEBRUARI') then raise exception 'Pilih bulan IMTAS';end if;
   result:=result||jsonb_build_object('tahsin_progress_type','SYAHADAH','imtas_month',v->>'imtas_month','target_outcome','SYAHADAH');
  else
   result:=result||jsonb_build_object('tahsin_progress_type','TAKHASSUS','target_activity','TAHFIDZ');
  end if;
 elsif sub='tahfidz' then
  if coalesce(v->>'curriculum_range','false')<>'true' then raise exception 'Jenis target Tahfidz tidak valid';end if;
  if coalesce(v->>'tahfidz_juz','') !~ '^\d{1,2}$' then raise exception 'Pilih juz';end if;
  juz:=(v->>'tahfidz_juz')::integer;
  if juz<1 or juz>30 then raise exception 'Juz tidak valid';end if;
  if coalesce(v->>'tahfidz_surah_start','') !~ '^\d{1,3}$' or coalesce(v->>'tahfidz_surah','') !~ '^\d{1,3}$' then raise exception 'Pilih surat awal dan akhir';end if;
  a:=(v->>'tahfidz_surah_start')::integer;b:=(v->>'tahfidz_surah')::integer;
  if not app_private.surah_in_juz(juz,a) or not app_private.surah_in_juz(juz,b) then raise exception 'Surat tidak sesuai juz';end if;
  if (juz=30 and a<b) or (juz<>30 and a>b) then raise exception 'Urutan surat tidak sesuai arah hafalan juz';end if;
  select ayahs into max_a from public.quran_surahs where number=a;
  select ayahs into max_b from public.quran_surahs where number=b;
  if max_a is null or max_b is null or coalesce(v->>'tahfidz_ayah_start','') !~ '^\d{1,3}$' or coalesce(v->>'tahfidz_ayah','') !~ '^\d{1,3}$' then raise exception 'Rentang ayat wajib diisi';end if;
  c:=(v->>'tahfidz_ayah_start')::integer;d:=(v->>'tahfidz_ayah')::integer;
  if c<1 or c>max_a or d<1 or d>max_b or (a=b and c>d) then raise exception 'Rentang ayat Tahfidz tidak valid';end if;
  result:=jsonb_build_object('curriculum_range',true,'tahfidz_progress_type','SURAT','tahfidz_juz',juz,
   'tahfidz_surah_start',a,'tahfidz_ayah_start',c,'tahfidz_surah',b,'tahfidz_ayah',d);
 else
  raise exception 'Program penilaian tidak valid';
 end if;
 return result;
end $$;
revoke all on function app_private.validate_curriculum_target(jsonb,text) from public,anon,authenticated;

create or replace function public.save_report_target(
 yr integer,pr text,grade integer,sub text,target jsonb,kkm numeric,previous jsonb default null
) returns integer language plpgsql security definer set search_path='' as $$
declare cfg jsonb;key text;record jsonb;existing jsonb;clean jsonb;v integer;
begin
 if not coalesce(app_private.is_manager(),false) then raise exception 'Akses pengaturan ditolak';end if;
 if yr is null or yr not between 2000 and 2200 or pr is null or pr not in ('pts_ganjil','pas_ganjil','pts_genap','pas_genap')
  or grade is null or grade not between 1 and 6 or sub is null or sub not in ('tahsin','tahfidz') or kkm is null or kkm not between 0 and 100 then raise exception 'Target tidak valid';end if;
 if (sub='tahsin' and target ? 'curriculum_mode') or (sub='tahfidz' and target ? 'curriculum_range') then
  clean:=app_private.validate_curriculum_target(target,sub);
 else
  clean:=app_private.validate_report_progress(target||'{"tahfidz_aspect_confirmed":true}'::jsonb,sub);
  if sub='tahfidz' and clean->>'tahfidz_progress_type'<>'SURAT' then raise exception 'Target Tahfidz harus berupa surat dan ayat';end if;
 end if;
 select data into cfg from public.report_settings where id=1 for update;
 key:=yr::text||'_'||pr||'_'||grade::text;record:=coalesce(cfg->'curriculum'->key,'{}'::jsonb);
 if record ? (sub||'_target') then existing:=jsonb_build_object('target',record->(sub||'_target'),'kkm',record->(sub||'_kkm'));end if;
 if existing is distinct from previous then raise exception 'Target kartu ini telah berubah. Muat ulang pengaturan';end if;
 record:=record||jsonb_build_object(sub||'_target',clean,sub||'_kkm',kkm);
 update public.report_settings set data=jsonb_set(data,'{curriculum}',coalesce(data->'curriculum','{}'::jsonb)||jsonb_build_object(key,record)),version=version+1
 where id=1 returning version into v;
 return v;
end $$;
revoke all on function public.save_report_target(integer,text,integer,text,jsonb,numeric,jsonb) from public,anon;
grant execute on function public.save_report_target(integer,text,integer,text,jsonb,numeric,jsonb) to authenticated;
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
   if settings->'tahsin_target' ? 'curriculum_mode' then
    perform app_private.validate_curriculum_target(settings->'tahsin_target','tahsin');
   else
    perform app_private.validate_report_progress(settings->'tahsin_target','tahsin');
   end if;
   if settings->'tahfidz_target' ? 'curriculum_range' then
    perform app_private.validate_curriculum_target(settings->'tahfidz_target','tahfidz');
   else
    perform app_private.validate_report_progress((settings->'tahfidz_target')||'{"tahfidz_aspect_confirmed":true}'::jsonb,'tahfidz');
   end if;
   if (settings->>'tahsin_kkm')::numeric not between 0 and 100 or (settings->>'tahfidz_kkm')::numeric not between 0 and 100 then raise exception 'KKM harus 0?100';end if;
  exception when others then issues:=issues||to_jsonb('Pengaturan target: '||sqlerrm);end;
 end if;
 return jsonb_build_object('student',pupil,'year',yr,'period',pr,'tahsin',a,'tahfidz',b,'settings',settings,'officials',officials,'teachers',teachers,'score_checks',jsonb_build_object('tahsin',app_private.report_score_issues(coalesce(a->'scores','{}'),'tahsin'),'tahfidz',app_private.report_score_issues(coalesce(b->'scores','{}'),'tahfidz')),'school',school,'reference',refs,'issues',issues);
end $$;

commit;
