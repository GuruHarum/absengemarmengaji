begin;

create table if not exists public.student_identifiers (
 student_id bigint primary key references public.students(id) on delete cascade,
 nis text,
 nisn text
);
alter table public.student_identifiers enable row level security;
revoke all on public.student_identifiers from public, anon, authenticated;
grant select on public.student_identifiers to authenticated;
drop policy if exists identifiers_read on public.student_identifiers;
create policy identifiers_read on public.student_identifiers for select to authenticated
 using (app_private.is_manager() or exists(
  select 1 from public.students s
  where s.id=student_id
    and s."nama guru"=app_private.teacher_name()
    and app_private.owns_class(s.kelas)
 ));

-- Canonicalize labels used by the importer only.  The alias is deliberately
-- conservative: it fixes the historical Umar Bin Khottob/Khattab split that
-- created duplicate IDs without applying fuzzy matching to unrelated classes.
create or replace function app_private.normalize_student_class(value text) returns text
language plpgsql immutable set search_path='' as $$
declare
 v text := upper(regexp_replace(trim(coalesce(value,'')), '^kelas\s*', '', 'i'));
 token text;
 n integer;
begin
 token := substring(v from '^(XII|XI|IX|VIII|VII|VI|IV|III|II|X|V|I)(?=\s|[A-H]|$)');
 if token is not null then
  n := array_position(array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'],token);
  v := n::text || substring(v from length(token)+1);
 end if;
 v := replace(v,'KHOTTOB','KHATTAB');
 v := trim(regexp_replace(v,'\s+',' ','g'));
 if v ~ '^[0-9]+\s*[A-Z]$' then return regexp_replace(v,'\s','','g'); end if;
 v := regexp_replace(v,'^([0-9]+)([A-Z])','\1 \2');
 return initcap(lower(v));
end $$;

create or replace function app_private.import_student_name_key(value text) returns text
language sql immutable set search_path='' as $$
 select regexp_replace(lower(normalize(coalesce(value,''),NFKC)), '[^[:alnum:]]', '', 'g');
$$;
revoke all on function app_private.import_student_name_key(text) from public,anon,authenticated;

create or replace function app_private.import_student_class_key(value text) returns text
language sql immutable set search_path='' as $$
 select regexp_replace(lower(normalize(app_private.normalize_student_class(value),NFKC)), '[^[:alnum:]]', '', 'g');
$$;
revoke all on function app_private.import_student_class_key(text) from public,anon,authenticated;

do $$ begin
 if exists(
  select nis from public.student_identifiers
  where nullif(trim(nis),'') is not null
  group by nis having count(*)>1
 ) then
  raise exception 'Ada NIS ganda pada student_identifiers. Perbaiki duplikasi NIS sebelum menjalankan migrasi.';
 end if;
end $$;
create unique index if not exists student_nis_unique
 on public.student_identifiers(nis)
 where nis is not null and nis<>'';

create or replace function app_private.import_teacher_name_key(label text) returns text
language sql immutable set search_path='' as $$
 select regexp_replace(lower(normalize(coalesce(label,''),NFKC)), '[^[:alnum:]]', '', 'g');
$$;
revoke all on function app_private.import_teacher_name_key(text) from public,anon,authenticated;

create or replace function app_private.find_import_teacher(label text) returns text
language plpgsql stable security definer set search_path='' as $$
declare matches text[]; tahsin_matches text[]; normalized text:=app_private.import_teacher_name_key(label);
begin
 if nullif(normalized,'') is null then return null; end if;
 select array_agg(id::text order by id::text) into matches
 from public.teachers
 where app_private.import_teacher_name_key(nama)=normalized
    or app_private.import_teacher_name_key(nama_lengkap)=normalized;
 if coalesce(cardinality(matches),0)>1 then
  select array_agg(id::text order by id::text) into tahsin_matches
  from public.teachers
  where id::text=any(matches) and attendance_enabled;
  if cardinality(tahsin_matches)=1 then return tahsin_matches[1]; end if;
 end if;
 if coalesce(cardinality(matches),0)>1 then
  raise exception 'Nama guru % ambigu, rapikan data guru terlebih dahulu',label;
 end if;
 return matches[1];
end $$;
revoke all on function app_private.find_import_teacher(text) from public,anon,authenticated;

create or replace function app_private.import_teacher(label text, tahsin boolean) returns text
language plpgsql security definer set search_path='' as $$
declare teacher_key text;
begin
 if nullif(trim(label),'') is null then return null; end if;
 if app_private.import_teacher_name_key(label)='' then raise exception 'Nama guru harus berisi huruf atau angka'; end if;
 teacher_key:=app_private.find_import_teacher(label);
 if teacher_key is null then
  if not app_private.is_manager() then raise exception 'Hanya pengelola dapat menambahkan guru'; end if;
  insert into public.teachers(nama,nama_lengkap,attendance_enabled)
  values(regexp_replace(trim(label),'\s+',' ','g'),regexp_replace(trim(label),'\s+',' ','g'),tahsin)
  returning id::text into teacher_key;
 elsif tahsin and app_private.is_manager() then
  update public.teachers set attendance_enabled=true
  where id::text=teacher_key and not attendance_enabled;
 end if;
 if app_private.is_manager() then
  update public.teachers
  set nama_lengkap=regexp_replace(trim(label),'\s+',' ','g')
  where id::text=teacher_key and nullif(trim(nama_lengkap),'') is null;
 end if;
 return teacher_key;
end $$;
revoke all on function app_private.import_teacher(text,boolean) from public,anon,authenticated;

-- IMPOR IDENTITAS AMAN (v4): setiap duplikasi NIS atau NISN dalam file,
-- atau pemakaian nomor milik ID siswa lain, menyebabkan KEDUA nomor siswa
-- bersangkutan dikosongkan. Nomor ambigu tidak pernah dipakai untuk memilih ID.
-- Bila identitas siswa tidak bisa ditetapkan lewat nama+kelas yang UNIK,
-- pratinjau tetap meminta pemeriksaan manual: tidak boleh membuat ID ganda.
create or replace function app_private.prepare_student_import_entries(entries jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $prepare$
declare
 item jsonb; out_rows jsonb:='[]'::jsonb;
 orig_nis text; orig_nisn text; nm text; cl text;
 nis_count integer; nisn_count integer; name_count integer; target bigint;
 db_nis_count integer; db_nisn_count integer; external_owners text;
 clear_both boolean; needs_review boolean; warning text;
begin
 if jsonb_typeof(entries) is distinct from 'array' then raise exception 'File siswa harus berupa daftar baris'; end if;
 for item in select value from jsonb_array_elements(entries) loop
  orig_nis:=nullif(trim(item->>'nis'),''); orig_nisn:=nullif(trim(item->>'nisn'),'');
  if (orig_nis is not null and orig_nis !~ '^[0-9]{1,32}$')
      or (orig_nisn is not null and orig_nisn !~ '^[0-9]{1,32}$') then
   raise exception 'NIS/NISN pada baris % harus angka maksimal 32 digit',item->>'row';
  end if;
  nm:=nullif(trim(item->>'nama'),''); cl:=nullif(app_private.normalize_student_class(item->>'kelas'),'');
  select count(*) into nis_count from jsonb_array_elements(entries) as e(value)
   where orig_nis is not null and nullif(trim(e.value->>'nis'),'')=orig_nis;
  select count(*) into nisn_count from jsonb_array_elements(entries) as e(value)
   where orig_nisn is not null and nullif(trim(e.value->>'nisn'),'')=orig_nisn;
  select count(*),min(s.id) into name_count,target
   from public.students s
   where nm is not null and cl is not null
     and app_private.import_student_name_key(s."nama siswa")=app_private.import_student_name_key(nm)
     and app_private.import_student_class_key(s.kelas)=app_private.import_student_class_key(cl);
  if name_count<>1 then target:=null; end if;
  select count(*) into db_nis_count from public.student_identifiers i
   where orig_nis is not null and i.nis=orig_nis
     and (target is null or i.student_id<>target);
  select count(*) into db_nisn_count from public.student_identifiers i
   where orig_nisn is not null and i.nisn=orig_nisn
     and (target is null or i.student_id<>target);
  select string_agg(DISTINCT (s.id::text||' — '||s."nama siswa"),'; ') into external_owners
    from public.student_identifiers i join public.students s on s.id=i.student_id
    where (target is null or i.student_id<>target) and
      ((orig_nis is not null and i.nis=orig_nis) or (orig_nisn is not null and i.nisn=orig_nisn));
  clear_both:=nis_count>1 or nisn_count>1 or db_nis_count>0 or db_nisn_count>0;
  needs_review:=clear_both and target is null and (db_nis_count>0 or db_nisn_count>0);
  warning:=concat_ws('; ',
   case when nis_count>1 then 'NIS sama pada '||nis_count||' baris file' end,
   case when nisn_count>1 then 'NISN sama pada '||nisn_count||' baris file' end,
   case when db_nis_count>0 then 'NIS juga dipakai ID lain dalam database' end,
   case when db_nisn_count>0 then 'NISN juga dipakai ID lain dalam database' end);
  item:=(item - '_identifier_clear' - '_identifier_review' - '_identifier_warning'
              - '_original_nis' - '_original_nisn' - '_identifier_db_owners');
  if clear_both then item:=jsonb_set(jsonb_set(item,'{nis}','null'::jsonb),'{nisn}','null'::jsonb); end if;
  item:=item||jsonb_build_object(
     '_identifier_clear',clear_both,'_identifier_review',needs_review,
     '_identifier_warning',warning,'_original_nis',orig_nis,
     '_original_nisn',orig_nisn,'_identifier_db_owners',external_owners);
  out_rows:=out_rows||jsonb_build_array(item);
 end loop;
 return out_rows;
end $prepare$;
revoke all on function app_private.prepare_student_import_entries(jsonb) from public,anon,authenticated;

-- Audit NIS/NISN kosong untuk admin/koordinator, tidak mengekspos data ke publik.
create or replace function public.list_missing_student_identifiers() returns jsonb
language plpgsql stable security definer set search_path='' as $missing$
declare result jsonb;
begin
 if auth.uid() is null or not app_private.is_manager() then
  raise exception 'Hanya admin/koordinator yang boleh memeriksa NIS dan NISN';
 end if;
 select jsonb_build_object(
    'total',count(*),
    'both_missing',count(*) filter(where nullif(trim(i.nis),'') is null and nullif(trim(i.nisn),'') is null),
    'nis_missing',count(*) filter(where nullif(trim(i.nis),'') is null),
    'nisn_missing',count(*) filter(where nullif(trim(i.nisn),'') is null),
    'rows',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'nama',s."nama siswa",
      'kelas',s.kelas,'guru',s."nama guru",'nis',i.nis,'nisn',i.nisn)
      order by s.kelas,s."nama siswa",s.id),'[]'::jsonb)) into result
 from public.students s left join public.student_identifiers i on i.student_id=s.id
 where nullif(trim(i.nis),'') is null or nullif(trim(i.nisn),'') is null;
 return result;
end $missing$;
revoke all on function public.list_missing_student_identifiers() from public,anon;
grant execute on function public.list_missing_student_identifiers() to authenticated;

-- Edit data siswa + NIS/NISN berlangsung dalam SATU transaksi.
-- Cegah penimpaan nomor milik siswa lain. Tidak memodifikasi absensi/rapor.
create or replace function public.save_student_profile_and_identifiers(
 p_student_id bigint,p_student_name text,p_class_name text,p_tahsin_teacher text,
 p_nis text default null,p_nisn text default null) returns jsonb
language plpgsql security definer set search_path='' as $save$
declare cleaned_nis text:=nullif(trim(p_nis),''); cleaned_nisn text:=nullif(trim(p_nisn),'');
 duplicate_name text; old public.students%rowtype;
begin
 if auth.uid() is null or not app_private.is_manager() then
  raise exception 'Hanya admin/koordinator yang boleh mengedit identitas siswa';
 end if;
 if nullif(trim(p_student_name),'') is null or length(trim(p_student_name))>200
    or nullif(trim(p_class_name),'') is null or length(trim(p_class_name))>40
    or nullif(trim(p_tahsin_teacher),'') is null or length(trim(p_tahsin_teacher))>160
    or (cleaned_nis is not null and cleaned_nis !~ '^[0-9]{1,32}$')
    or (cleaned_nisn is not null and cleaned_nisn !~ '^[0-9]{1,32}$') then
  raise exception 'Nama, kelas, guru dan NIS/NISN tidak valid';
 end if;
 lock table public.students, public.student_identifiers in share row exclusive mode;
 select * into old from public.students where id=p_student_id;
 if not found then raise exception 'Siswa ID % tidak ada',p_student_id; end if;
 select (s.id::text||' — '||s."nama siswa") into duplicate_name
 from public.student_identifiers i join public.students s on s.id=i.student_id
 where i.student_id<>p_student_id
   and ((cleaned_nis is not null and i.nis=cleaned_nis)
        or (cleaned_nisn is not null and i.nisn=cleaned_nisn))
 order by s.id limit 1;
 if duplicate_name is not null then
  raise exception 'NIS/NISN sudah digunakan oleh %. Kosongkan nomor yang belum diverifikasi.',duplicate_name;
 end if;
 update public.students set "nama siswa"=trim(p_student_name),
    kelas=trim(p_class_name),"nama guru"=trim(p_tahsin_teacher)
 where id=p_student_id;
 insert into public.student_identifiers(student_id,nis,nisn)
 values(p_student_id,cleaned_nis,cleaned_nisn)
 on conflict(student_id) do update set nis=excluded.nis,nisn=excluded.nisn;
 return jsonb_build_object('id',p_student_id,'nis',cleaned_nis,'nisn',cleaned_nisn);
end $save$;
revoke all on function public.save_student_profile_and_identifiers(bigint,text,text,text,text,text) from public,anon;
grant execute on function public.save_student_profile_and_identifiers(bigint,text,text,text,text,text) to authenticated;

-- IMPOR TERINTEGRASI (v3) -- Jalankan hanya setelah backup/pengujian staging.
-- Pratinjau BACA SAJA: periksa ID, penugasan Tahsin/Tahfidz, dan daftar rapor.
-- Penambahan kelompok/rapor tidak berarti nilai telah diberikan.
create or replace function public.preview_import_students(entries jsonb, year_key integer default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 item jsonb; raw_entries jsonb;
 nis_value text; nisn_value text; name_value text; class_value text; teacher_input text; tahfidz_input text;
 nis_matches bigint[]; nisn_matches bigint[]; name_class_matches bigint[]; name_matches bigint[];
 teacher_matches text[]; tahfidz_matches text[];
 target_id bigint; target_nis text; target_nisn text; action text; reason text; match_by text;
 old_teacher text; resolved_tahsin text; grade_value text;
 missing_reports integer; refresh_reports integer; tahfidz_needs_sync boolean; tahsin_needs_sync boolean; class_access_needs_sync boolean;
 active_tahfidz_groups integer; candidate_group_count integer;
 rows_out jsonb:='[]'::jsonb;
 new_count integer:=0; update_count integer:=0; unchanged_count integer:=0;
 review_count integer:=0; conflict_count integer:=0; teacher_new_count integer:=0;
 link_sync_count integer:=0; missing_tahfidz_count integer:=0;
 manager boolean; row_no integer; token text; nis_file_count integer; nisn_file_count integer;
 clear_identifiers boolean; identifier_review boolean; identifier_warning text;
 duplicate_file_names integer; cleared_count integer:=0;
begin
 manager:=app_private.is_manager();
 if auth.uid() is null or (not manager and app_private.teacher_name() is null) then
  raise exception 'Akses impor tidak diizinkan';
 end if;
 if jsonb_typeof(entries) is distinct from 'array' then raise exception 'Format impor tidak valid'; end if;
 if jsonb_array_length(entries) not between 1 and 1000 then raise exception 'Isi 1 sampai 1.000 siswa per file'; end if;
 year_key:=coalesce(year_key,extract(year from now() at time zone 'Asia/Jakarta')::integer
              -case when extract(month from now() at time zone 'Asia/Jakarta')<7 then 1 else 0 end);
 if year_key not between 2000 and 2200 then raise exception 'Tahun ajaran tidak valid'; end if;
 raw_entries:=entries;
 entries:=app_private.prepare_student_import_entries(entries);

 for item in select value from jsonb_array_elements(entries) loop
  row_no:=coalesce(nullif(item->>'row','')::integer,0);
  nis_value:=nullif(trim(item->>'nis'),''); nisn_value:=nullif(trim(item->>'nisn'),'');
  name_value:=nullif(trim(item->>'nama'),'');
  class_value:=nullif(app_private.normalize_student_class(item->>'kelas'),'');
  teacher_input:=nullif(regexp_replace(trim(item->>'guru'),'\s+',' ','g'),'');
  tahfidz_input:=nullif(regexp_replace(trim(item->>'guru_tahfidz'),'\s+',' ','g'),'');
  clear_identifiers:=coalesce((item->>'_identifier_clear')::boolean,false);
  identifier_review:=coalesce((item->>'_identifier_review')::boolean,false);
  identifier_warning:=nullif(item->>'_identifier_warning','');
  if name_value is null or class_value is null or teacher_input is null
     or (nis_value is not null and nis_value !~ '^[0-9]{1,32}$')
     or (nisn_value is not null and nisn_value !~ '^[0-9]{1,32}$')
     or length(name_value)>200 or length(class_value)>40
     or length(teacher_input)>160 or length(tahfidz_input)>160 then
   raise exception 'Nama, kelas, guru dan NIS/NISN harus valid pada baris %',row_no;
  end if;
  select count(*) into nis_file_count from jsonb_array_elements(entries) e
   where nullif(trim(e->>'nis'),'')=nis_value;
  if nisn_value is not null then
   select count(*) into nisn_file_count from jsonb_array_elements(entries) e
    where nullif(trim(e->>'nisn'),'')=nisn_value;
  else nisn_file_count:=0; end if;

  select array_agg(student_id order by student_id) into nis_matches
   from public.student_identifiers where nis=nis_value;
  if nisn_value is not null then
   select array_agg(student_id order by student_id) into nisn_matches
    from public.student_identifiers where nisn=nisn_value;
  else nisn_matches:=null; end if;
  if name_value is not null and class_value is not null then
   select array_agg(s.id order by s.id) into name_class_matches
   from public.students s
   where app_private.import_student_name_key(s."nama siswa")=app_private.import_student_name_key(name_value)
     and app_private.import_student_class_key(s.kelas)=app_private.import_student_class_key(class_value);
  else name_class_matches:=null; end if;
  if name_value is not null then
   select array_agg(s.id order by s.id) into name_matches
   from public.students s
   where app_private.import_student_name_key(s."nama siswa")=app_private.import_student_name_key(name_value);
  else name_matches:=null; end if;

  select count(*) into duplicate_file_names from jsonb_array_elements(entries) as e(value)
    where app_private.import_student_name_key(e.value->>'nama')=app_private.import_student_name_key(name_value)
      and app_private.import_student_class_key(e.value->>'kelas')=app_private.import_student_class_key(class_value);
  target_id:=null; action:=null; reason:=null; match_by:=null;
  target_nis:=null; target_nisn:=null;
  if nis_file_count>1 then
   action:='conflict'; reason:='NIS berulang dalam file pada lebih dari satu baris';
  elsif nisn_file_count>1 then
   action:='conflict'; reason:='NISN berulang dalam file pada lebih dari satu baris; periksa identitas siswa';
  elsif coalesce(cardinality(nis_matches),0)>1 then
   action:='conflict'; reason:='NIS sudah dipakai lebih dari satu ID siswa';
  elsif coalesce(cardinality(nisn_matches),0)>1 then
   action:='conflict'; reason:='NISN sudah dipakai lebih dari satu ID siswa; koreksi identitas terlebih dahulu';
  elsif coalesce(cardinality(nis_matches),0)=1 then
   target_id:=nis_matches[1]; match_by:='nis';
   if coalesce(cardinality(nisn_matches),0)=1 and nisn_matches[1]<>target_id then
    action:='conflict'; reason:='NIS dan NISN menunjuk ke siswa yang berbeda';
   end if;
  elsif coalesce(cardinality(nisn_matches),0)=1 then
   target_id:=nisn_matches[1]; match_by:='nisn';
   select nis,nisn into target_nis,target_nisn from public.student_identifiers where student_id=target_id;
   if nullif(target_nis,'') is not null and nis_value is not null and target_nis<>nis_value then
    action:='conflict'; reason:='NISN cocok, tetapi siswa tersebut sudah mempunyai NIS berbeda';
   end if;
  elsif coalesce(cardinality(name_class_matches),0)=1 then
   target_id:=name_class_matches[1]; match_by:='nama_kelas';
   select nis,nisn into target_nis,target_nisn from public.student_identifiers where student_id=target_id;
   if nullif(target_nis,'') is not null and nis_value is not null and target_nis<>nis_value then
    action:='conflict'; reason:='Nama dan kelas cocok, tetapi ID lama sudah mempunyai NIS berbeda';
   end if;
  elsif coalesce(cardinality(name_class_matches),0)>1 then
   action:='review'; reason:='Ada lebih dari satu ID dengan nama dan kelas yang sama; jangan gabungkan otomatis';
  elsif coalesce(cardinality(name_matches),0)>0 then
   action:='review'; reason:='Nama sudah ada tetapi kelas berbeda; periksa pindah kelas/identitas';
  else
   action:='new'; reason:='Tidak ditemukan NIS, NISN, atau nama+kelas yang cocok';
  end if;

  if target_id is not null and action is null then
   select nis,nisn into target_nis,target_nisn from public.student_identifiers where student_id=target_id;
   if exists(select 1 from public.students s where s.id=target_id
     and s."nama siswa" is not distinct from name_value
     and app_private.normalize_student_class(s.kelas) is not distinct from class_value
     and (clear_identifiers is false or (target_nis is null and target_nisn is null))
     and (nis_value is null or coalesce(target_nis,'')=nis_value)
     and (nisn_value is null or coalesce(target_nisn,'')=nisn_value)) then
    action:='unchanged'; reason:='Data master siswa sudah sesuai';
   else
    action:='update'; reason:=case match_by
     when 'nis' then 'Perbarui ID yang sama berdasarkan NIS'
     when 'nisn' then 'Perbarui ID yang sama berdasarkan NISN'
     else 'Perbarui ID lama berdasarkan nama+kelas yang unik; ID baru tidak dibuat' end;
   end if;
  end if;

  -- Jangan menganggap NIS/NISN cocok sebagai izin mengabaikan duplikasi
  -- nama+kelas yang masih ada pada master. Harus diaudit/merge manual dahulu.
  if coalesce(cardinality(name_class_matches),0)>1 and action not in ('conflict','review') then
   action:='review'; reason:='Nama dan kelas masih dimiliki beberapa ID lama; lakukan audit/merge manual terlebih dahulu';
  end if;
  -- ID berdasar NIS/NISN tidak boleh menimpa identitas siswa lain.
  if target_id is not null and action in ('update','unchanged') and name_value is not null
     and match_by in ('nis','nisn') and not exists(
      select 1 from public.students s where s.id=target_id
       and app_private.import_student_name_key(s."nama siswa")
          =app_private.import_student_name_key(name_value)
     ) then
   action:='conflict'; reason:='NIS/NISN cocok tetapi nama berbeda dari ID pemilik; cek identitas terlebih dahulu';
  end if;

  if identifier_review then
   action:='review';
   reason:='Nomor sama dengan siswa database lain, tetapi nama+kelas belum cocok secara unik. Periksa siswa sebelum membuat ID baru';
  elsif duplicate_file_names>1 then
   action:='review'; reason:='Nama dan kelas berulang dalam file; jangan membuat ID siswa ganda';
  end if;
  if clear_identifiers and action in ('update','unchanged','new') then
   if action='unchanged' then action:='update'; end if;
   reason:=concat_ws('; ',reason,'NIS dan NISN akan dikosongkan: '||coalesce(identifier_warning,'nomor ganda'));
   cleared_count:=cleared_count+1;
  end if;

  -- Lihat guru secara read-only; hanya admin/koordinator dapat membuat yang belum ada.
  if teacher_input is not null then
   select array_agg(id::text order by id::text) into teacher_matches from public.teachers
   where app_private.import_teacher_name_key(nama)=app_private.import_teacher_name_key(teacher_input)
     or app_private.import_teacher_name_key(nama_lengkap)=app_private.import_teacher_name_key(teacher_input);
   if coalesce(cardinality(teacher_matches),0)>1 then
    action:='conflict'; reason:='Guru Tahsin ambigu: ada lebih dari satu guru dengan nama yang sama';
   elsif coalesce(cardinality(teacher_matches),0)=0 then teacher_new_count:=teacher_new_count+1; end if;
  else teacher_matches:=null; end if;
  if tahfidz_input is not null then
   select array_agg(id::text order by id::text) into tahfidz_matches from public.teachers
   where app_private.import_teacher_name_key(nama)=app_private.import_teacher_name_key(tahfidz_input)
     or app_private.import_teacher_name_key(nama_lengkap)=app_private.import_teacher_name_key(tahfidz_input);
   if coalesce(cardinality(tahfidz_matches),0)>1 then
    action:='conflict'; reason:='Guru Tahfidz ambigu: ada lebih dari satu guru dengan nama yang sama';
   elsif coalesce(cardinality(tahfidz_matches),0)=0 then teacher_new_count:=teacher_new_count+1; end if;
  else tahfidz_matches:=null; end if;

  missing_reports:=0; refresh_reports:=0;
  tahfidz_needs_sync:=false; tahsin_needs_sync:=false; class_access_needs_sync:=false;
  active_tahfidz_groups:=0; candidate_group_count:=0;
  if target_id is not null and action in ('unchanged','update') then
   select s."nama guru" into old_teacher from public.students s where s.id=target_id;
   -- Perpindahan kelas pada tahun yang sudah dinilai/rapor diajukan perlu tinjauan manual.
   if class_value is not null and exists(
       select 1 from public.students s where s.id=target_id
        and app_private.normalize_student_class(s.kelas) is distinct from class_value)
      and (
       exists(select 1 from public.subject_assessments sa
              where sa.student_id=target_id::text and sa.academic_year_start=year_key)
       or exists(select 1 from public.periodic_assessments pa
              where pa.student_id=target_id::text and pa.academic_year_start=year_key)
       or exists(select 1 from public.student_reports sr
              where sr.student_id=target_id::text and sr.academic_year_start=year_key
                and sr.status in ('DIAJUKAN','DISETUJUI'))
      ) then
    action:='review'; reason:='Kelas berubah tetapi siswa telah memiliki nilai/rapor tahun ini; periksa dulu';
   end if;
   if teacher_input is not null then
    select t.nama into resolved_tahsin from public.teachers t
    where t.id::text=teacher_matches[1];
    tahsin_needs_sync:=coalesce(resolved_tahsin,teacher_input) is distinct from old_teacher;
    if tahsin_needs_sync and (
      exists(select 1 from public.subject_assessments sa
       where sa.student_id=target_id::text and sa.academic_year_start=year_key and sa.subject='tahsin')
      or exists(select 1 from public.periodic_assessments pa
       where pa.student_id=target_id::text and pa.academic_year_start=year_key)
      or exists(select 1 from public.student_reports sr
       where sr.student_id=target_id::text and sr.academic_year_start=year_key
         and sr.status in ('DIAJUKAN','DISETUJUI'))
    ) then
     action:='review'; reason:='Guru Tahsin berbeda dari pengampu yang memiliki nilai pada tahun ini; periksa nilai/rapor dahulu';
    end if;
   end if;

   -- Akses kelas untuk akun guru Tahsin yang sudah tersedia juga disinkronkan.
   if teacher_input is not null and coalesce(cardinality(teacher_matches),0)=1
      and class_value is not null then
    class_access_needs_sync:=exists(
       select 1 from public.user_roles ur
       where ur.teacher_id=teacher_matches[1] and ur.role='guru'
         and not exists(select 1 from public.teacher_class_access tca
           where tca.user_id=ur.user_id and tca.class_name=class_value)
    );
   end if;
   if tahfidz_input is not null then
    select count(*) into active_tahfidz_groups
     from public.assessment_group_members gm
     join public.teaching_assignments a on a.id=gm.assignment_id
     where gm.student_id=target_id::text and gm.academic_year_start=year_key and gm.active
       and a.academic_year_start=year_key and a.active and a.subject='tahfidz'
       and (tahfidz_matches is null or a.teacher_id=tahfidz_matches[1]);
    -- Guru yang belum dibuat tidak dapat mempunyai grup yang sama.
    if coalesce(cardinality(tahfidz_matches),0)=0 then active_tahfidz_groups:=0; end if;
    tahfidz_needs_sync:=active_tahfidz_groups=0;
    if tahfidz_needs_sync and (
      exists(select 1 from public.subject_assessments sa
       where sa.student_id=target_id::text and sa.academic_year_start=year_key and sa.subject='tahfidz')
      or exists(select 1 from public.periodic_assessments pa
       where pa.student_id=target_id::text and pa.academic_year_start=year_key)
      or exists(select 1 from public.student_reports sr
       where sr.student_id=target_id::text and sr.academic_year_start=year_key
         and sr.status in ('DIAJUKAN','DISETUJUI'))
    ) then
     action:='review'; reason:='Perpindahan guru Tahfidz memiliki nilai pada tahun ini; periksa nilai/rapor dahulu';
    end if;
    if tahfidz_needs_sync and coalesce(cardinality(tahfidz_matches),0)=1 then
     grade_value:=substring(coalesce(class_value,'') from '^[0-9]+');
     select count(distinct a.id) into candidate_group_count
     from public.teaching_assignments a
     join public.assessment_group_members gm on gm.assignment_id=a.id and gm.active
     join public.students member_s on member_s.id::text=gm.student_id
     where a.active and a.subject='tahfidz' and a.roster_mode='members'
       and a.teacher_id=tahfidz_matches[1] and a.academic_year_start=year_key
       and gm.academic_year_start=year_key
       and substring(app_private.normalize_student_class(member_s.kelas) from '^[0-9]+')=grade_value;
     if candidate_group_count>1 then
      action:='review'; reason:='Guru Tahfidz memiliki lebih dari satu kelompok pada tingkat ini; pilih kelompok secara manual sebelum impor';
     end if;
    end if;
   end if;

   select 4-count(distinct rp.period) into missing_reports
   from public.report_period_students rp
   where rp.student_id=target_id::text and rp.academic_year_start=year_key
    and rp.period in ('pts_ganjil','pas_ganjil','pts_genap','pas_genap');
   select count(*) into refresh_reports
    from public.report_period_students rp
    where rp.student_id=target_id::text and rp.academic_year_start=year_key
      and (rp.student_name is distinct from coalesce(name_value,rp.student_name)
       or rp.class_name is distinct from coalesce(class_value,rp.class_name))
      and not exists(select 1 from public.subject_assessments sa
        where sa.student_id=rp.student_id and sa.academic_year_start=rp.academic_year_start and sa.period=rp.period)
      and not exists(select 1 from public.periodic_assessments pa
        where pa.student_id=rp.student_id and pa.academic_year_start=rp.academic_year_start and pa.period=rp.period)
      and not exists(select 1 from public.student_reports sr
        where sr.student_id=rp.student_id and sr.academic_year_start=rp.academic_year_start
          and sr.period=rp.period and sr.status in ('DIAJUKAN','DISETUJUI'));
   if action='unchanged' and (tahsin_needs_sync or tahfidz_needs_sync
        or class_access_needs_sync or missing_reports>0 or refresh_reports>0) then
    action:='update'; reason:='Data master cocok; perlu sinkronisasi guru/kelompok Tahfidz/daftar rapor';
   end if;
   if (tahsin_needs_sync or tahfidz_needs_sync or class_access_needs_sync
         or missing_reports>0 or refresh_reports>0)
      and action in ('update','unchanged') then link_sync_count:=link_sync_count+1; end if;
  end if;
  if tahfidz_input is null then missing_tahfidz_count:=missing_tahfidz_count+1; end if;
  if not manager and tahfidz_input is not null and action not in ('conflict','review') then
   action:='review'; reason:='Hanya admin/koordinator dapat memperbarui guru dan kelompok Tahfidz';
  end if;

  if action='new' then new_count:=new_count+1;
  elsif action='update' then update_count:=update_count+1;
  elsif action='unchanged' then unchanged_count:=unchanged_count+1;
  elsif action='review' then review_count:=review_count+1;
  else conflict_count:=conflict_count+1; end if;
  rows_out:=rows_out||jsonb_build_array(jsonb_build_object(
   'row',row_no,'nama',name_value,'nis',nis_value,'nisn',nisn_value,'kelas',class_value,
   'original_nis',item->>'_original_nis','original_nisn',item->>'_original_nisn',
   'clear_identifiers',clear_identifiers,'identifier_warning',identifier_warning,
   'identifier_db_owners',item->>'_identifier_db_owners','identifier_needs_review',identifier_review,
   'guru_tahsin',teacher_input,'guru_tahfidz',tahfidz_input,
   'action',action,'reason',reason,'match_by',match_by,'target_student_id',target_id,
   'database_candidate_ids',coalesce(to_jsonb(name_class_matches),'[]'::jsonb),
   'tahsin_needs_sync',tahsin_needs_sync,'tahfidz_needs_sync',tahfidz_needs_sync,
   'class_access_needs_sync',class_access_needs_sync,
   'report_periods_missing',case when target_id is null then 4 else missing_reports end,
   'report_periods_refresh',refresh_reports,
   'teacher_status',case when teacher_input is null then 'kosong'
       when coalesce(cardinality(teacher_matches),0)=0 then 'baru' else 'cocok' end,
   'tahfidz_status',case when tahfidz_input is null then 'kosong'
       when coalesce(cardinality(tahfidz_matches),0)=0 then 'baru' else 'cocok' end
  ));
 end loop;
 -- Dua baris file berbeda tidak boleh mengubah ID siswa yang sama,
 -- walaupun masing-masing NIS/NISN unik. Tampilkan kedua nama/barisnya.
 with matched as (
   select x.value as entry,x.ord,
          nullif(x.value->>'target_student_id','') as target_key
   from jsonb_array_elements(rows_out) with ordinality as x(value,ord)
 ), checked as (
   select entry,ord,target_key,
      count(*) over(partition by target_key) as target_count
   from matched
 )
 select coalesce(jsonb_agg(
   case when checked.target_key is not null and checked.target_count>1 then
    jsonb_set(jsonb_set(checked.entry,'{action}'::text[],'"conflict"'::jsonb),
       '{reason}'::text[],to_jsonb('Lebih dari satu baris file menunjuk ID siswa database yang sama; periksa identitas'::text))
    || jsonb_build_object('duplicate_target_file_rows',(
      select coalesce(jsonb_agg(jsonb_build_object('row',peer.entry->>'row',
                     'nama',peer.entry->>'nama','kelas',peer.entry->>'kelas')),'[]'::jsonb)
      from checked peer where peer.target_key=checked.target_key and peer.ord<>checked.ord))
   else checked.entry end order by checked.ord),'[]'::jsonb)
 into rows_out from checked;
 -- Ringkasan diambil dari status FINAL, bukan dari status sementara tiap baris.
 select
   count(*) filter(where x.value->>'action'='new'),
   count(*) filter(where x.value->>'action'='update'),
   count(*) filter(where x.value->>'action'='unchanged'),
   count(*) filter(where x.value->>'action'='review'),
   count(*) filter(where x.value->>'action'='conflict')
 into new_count,update_count,unchanged_count,review_count,conflict_count
 from jsonb_array_elements(rows_out) as x(value);
 select count(*) into cleared_count from jsonb_array_elements(rows_out) as x(value)
  where (x.value->>'clear_identifiers')::boolean
    and x.value->>'action' in ('new','update','unchanged');
 token:=md5(raw_entries::text||':'||year_key::text||':'||rows_out::text);
 return jsonb_build_object('token',token,'year_key',year_key,
   'can_import',(conflict_count=0 and review_count=0),
   'summary',jsonb_build_object('new',new_count,'update',update_count,'unchanged',unchanged_count,
      'review',review_count,'conflict',conflict_count,'teacher_new',teacher_new_count,
      'link_sync',link_sync_count,'tahfidz_empty',missing_tahfidz_count,'identifiers_cleared',cleared_count),
   'rows',rows_out);
end $$;
revoke all on function public.preview_import_students(jsonb,integer) from public,anon;
grant execute on function public.preview_import_students(jsonb,integer) to authenticated;

-- Penulisan hanya setelah pratinjau bersih. Semua perubahan satu transaksi.
-- Tidak pernah melakukan DELETE students/attendance atau menimpa skor dan rapor terbit.
drop function if exists public.import_students(jsonb);
drop function if exists public.import_students(jsonb,integer);
drop function if exists public.import_students(jsonb,integer,text);
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
     where student_id=pupil_id::text and academic_year_start=year_key and active;
    insert into public.assessment_group_members(assignment_id,student_id,academic_year_start)
     values(group_id,pupil_id::text,year_key)
     on conflict(assignment_id,student_id) do update set active=true;
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
revoke all on function public.import_students(jsonb,integer,text) from public,anon;
grant execute on function public.import_students(jsonb,integer,text) to authenticated;

-- Indeks untuk pencarian pengampu dan nama+kelas. Jika nomor historis masih
-- ganda, jangan memaksa unique-index NISN sebelum verifikasi dokumen resmi.
create index if not exists gm_imp_students_nama_kelas_idx
 on public.students ((app_private.import_student_name_key("nama siswa")),
                     (app_private.import_student_class_key(kelas)));
create index if not exists gm_imp_identifiers_nisn_idx
 on public.student_identifiers(nisn) where nisn is not null and nisn<>'';
create index if not exists gm_imp_teachers_nama_idx
 on public.teachers ((app_private.import_teacher_name_key(nama)));
create index if not exists gm_imp_teachers_lengkap_idx
 on public.teachers ((app_private.import_teacher_name_key(nama_lengkap)));
create index if not exists gm_imp_members_student_active_idx
 on public.assessment_group_members (student_id,academic_year_start,assignment_id) where active=true;
create index if not exists gm_imp_assignments_teacher_year_idx
 on public.teaching_assignments (teacher_id,academic_year_start,subject,active,roster_mode);
create index if not exists gm_imp_report_period_student_idx
 on public.report_period_students (student_id,academic_year_start,period);
create index if not exists gm_imp_subject_assessment_student_idx
 on public.subject_assessments (student_id,academic_year_start,period,subject);
create index if not exists gm_imp_periodic_assessment_student_idx
 on public.periodic_assessments (student_id,academic_year_start,period);
create index if not exists gm_imp_student_reports_student_idx
 on public.student_reports (student_id,academic_year_start,period,status);
alter function public.preview_import_students(jsonb,integer) set statement_timeout to '45s';
alter function public.import_students(jsonb,integer,text) set statement_timeout to '55s';
commit;
notify pgrst,'reload schema';
