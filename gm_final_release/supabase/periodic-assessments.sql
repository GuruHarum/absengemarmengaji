begin;
do $$ declare item record; begin
 for item in select conname from pg_constraint where conrelid = 'public.user_roles'::regclass
 and contype = 'c' and pg_get_constraintdef(oid) like '%teacher_id%'
 loop execute format('alter table public.user_roles drop constraint %I', item.conname); end loop;
end $$;
alter table public.user_roles add constraint user_roles_teacher_link_check
 check ((role = 'guru' and teacher_id is not null) or role = 'koordinator' or (role = 'admin' and teacher_id is null));
create or replace function public.assign_school_account(account_email text, account_role text, linked_teacher text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid; teacher_label text;
begin
 if not app_private.is_manager() then raise exception 'Akses ditolak'; end if;
 if account_role not in ('admin','koordinator','guru') then raise exception 'Role tidak valid'; end if;
 select id into target from auth.users where lower(email) = lower(trim(account_email));
 if target is null then raise exception 'Email belum terdaftar di Authentication'; end if;
 lock table public.user_roles in share row exclusive mode;
 if account_role = 'guru' and exists(select 1 from public.user_roles where user_id = target and role in ('admin','koordinator'))
 and (select count(*) from public.user_roles where role in ('admin','koordinator')) <= 1 then raise exception 'Pengelola terakhir tidak dapat diubah menjadi guru'; end if;
 if account_role = 'guru' or (account_role = 'koordinator' and linked_teacher is not null) then
   select nama into teacher_label from public.teachers where id::text = linked_teacher;
   if teacher_label is null then raise exception 'Pilih guru yang valid'; end if;
   if (select count(*) from public.teachers where nama = teacher_label) <> 1 then raise exception 'Nama guru duplikat; rapikan nama sebelum memetakan akun'; end if;
 end if;
 insert into public.user_roles(user_id, role, teacher_id) values (target, account_role, case when account_role in ('guru','koordinator') then linked_teacher else null end)
 on conflict (user_id) do update set role = excluded.role, teacher_id = excluded.teacher_id;
 delete from public.teacher_class_access where user_id = target;
 if account_role = 'guru' or (account_role = 'koordinator' and linked_teacher is not null) then
   insert into public.teacher_class_access(user_id, class_name)
   select distinct target, kelas from public.students where "nama guru" = teacher_label and kelas is not null;
 end if;
end $$;

create table if not exists public.quran_surahs (
 number smallint primary key check (number between 1 and 114),
 name text not null,
 ayahs smallint not null check (ayahs between 1 and 286)
);
insert into public.quran_surahs(number,name,ayahs) values
(1,'Al-Faatiha',7),
(2,'Al-Baqara',286),
(3,'Aal-i-Imraan',200),
(4,'An-Nisaa',176),
(5,'Al-Maaida',120),
(6,'Al-An''aam',165),
(7,'Al-A''raaf',206),
(8,'Al-Anfaal',75),
(9,'At-Tawba',129),
(10,'Yunus',109),
(11,'Hud',123),
(12,'Yusuf',111),
(13,'Ar-Ra''d',43),
(14,'Ibrahim',52),
(15,'Al-Hijr',99),
(16,'An-Nahl',128),
(17,'Al-Israa',111),
(18,'Al-Kahf',110),
(19,'Maryam',98),
(20,'Taa-Haa',135),
(21,'Al-Anbiyaa',112),
(22,'Al-Hajj',78),
(23,'Al-Muminoon',118),
(24,'An-Noor',64),
(25,'Al-Furqaan',77),
(26,'Ash-Shu''araa',227),
(27,'An-Naml',93),
(28,'Al-Qasas',88),
(29,'Al-Ankaboot',69),
(30,'Ar-Room',60),
(31,'Luqman',34),
(32,'As-Sajda',30),
(33,'Al-Ahzaab',73),
(34,'Saba',54),
(35,'Faatir',45),
(36,'Yaseen',83),
(37,'As-Saaffaat',182),
(38,'Saad',88),
(39,'Az-Zumar',75),
(40,'Ghafir',85),
(41,'Fussilat',54),
(42,'Ash-Shura',53),
(43,'Az-Zukhruf',89),
(44,'Ad-Dukhaan',59),
(45,'Al-Jaathiya',37),
(46,'Al-Ahqaf',35),
(47,'Muhammad',38),
(48,'Al-Fath',29),
(49,'Al-Hujuraat',18),
(50,'Qaaf',45),
(51,'Adh-Dhaariyat',60),
(52,'At-Tur',49),
(53,'An-Najm',62),
(54,'Al-Qamar',55),
(55,'Ar-Rahmaan',78),
(56,'Al-Waaqia',96),
(57,'Al-Hadid',29),
(58,'Al-Mujaadila',22),
(59,'Al-Hashr',24),
(60,'Al-Mumtahana',13),
(61,'As-Saff',14),
(62,'Al-Jumu''a',11),
(63,'Al-Munaafiqoon',11),
(64,'At-Taghaabun',18),
(65,'At-Talaaq',12),
(66,'At-Tahrim',12),
(67,'Al-Mulk',30),
(68,'Al-Qalam',52),
(69,'Al-Haaqqa',52),
(70,'Al-Ma''aarij',44),
(71,'Nooh',28),
(72,'Al-Jinn',28),
(73,'Al-Muzzammil',20),
(74,'Al-Muddaththir',56),
(75,'Al-Qiyaama',40),
(76,'Al-Insaan',31),
(77,'Al-Mursalaat',50),
(78,'An-Naba',40),
(79,'An-Naazi''aat',46),
(80,'Abasa',42),
(81,'At-Takwir',29),
(82,'Al-Infitaar',19),
(83,'Al-Mutaffifin',36),
(84,'Al-Inshiqaaq',25),
(85,'Al-Burooj',22),
(86,'At-Taariq',17),
(87,'Al-A''laa',19),
(88,'Al-Ghaashiya',26),
(89,'Al-Fajr',30),
(90,'Al-Balad',20),
(91,'Ash-Shams',15),
(92,'Al-Lail',21),
(93,'Ad-Dhuhaa',11),
(94,'Ash-Sharh',8),
(95,'At-Tin',8),
(96,'Al-Alaq',19),
(97,'Al-Qadr',5),
(98,'Al-Bayyina',8),
(99,'Az-Zalzala',8),
(100,'Al-Aadiyaat',11),
(101,'Al-Qaari''a',11),
(102,'At-Takaathur',8),
(103,'Al-Asr',3),
(104,'Al-Humaza',9),
(105,'Al-Fil',5),
(106,'Quraish',4),
(107,'Al-Maa''un',7),
(108,'Al-Kawthar',3),
(109,'Al-Kaafiroon',6),
(110,'An-Nasr',3),
(111,'Al-Masad',5),
(112,'Al-Ikhlaas',4),
(113,'Al-Falaq',5),
(114,'An-Naas',6)
on conflict (number) do update set name = excluded.name, ayahs = excluded.ayahs;
alter table public.quran_surahs enable row level security;
revoke all on public.quran_surahs from anon, authenticated;
grant select on public.quran_surahs to authenticated;
drop policy if exists quran_reference_read on public.quran_surahs;
create policy quran_reference_read on public.quran_surahs for select to authenticated using (true);

create table if not exists public.periodic_assessments (
 id uuid primary key default gen_random_uuid(),
 student_id text not null,
 teacher_id text not null,
 academic_year_start smallint not null check (academic_year_start between 2000 and 2200),
 period text not null check (period in ('pts_ganjil','pas_ganjil','pts_genap','pas_genap')),
 student_name text not null,
 teacher_name text not null,
 class_name text not null,
 tahsin_makhraj numeric(5,2) not null check (tahsin_makhraj between 0 and 100),
 tahsin_tajwid numeric(5,2) not null check (tahsin_tajwid between 0 and 100),
 tahsin_tartil numeric(5,2) not null check (tahsin_tartil between 0 and 100),
 tahsin_gharib numeric(5,2) check (tahsin_gharib between 0 and 100),
 tahsin_book text not null check (length(trim(tahsin_book)) between 1 and 80),
 tahsin_page integer not null check (tahsin_page > 0),
 tahfidz_makhraj numeric(5,2) not null check (tahfidz_makhraj between 0 and 100),
 tahfidz_tajwid numeric(5,2) not null check (tahfidz_tajwid between 0 and 100),
 tahfidz_hafalan numeric(5,2) not null check (tahfidz_hafalan between 0 and 100),
 tahfidz_surah smallint not null references public.quran_surahs(number),
 tahfidz_ayah smallint not null check (tahfidz_ayah > 0),
 version integer not null default 1,
 created_by uuid,
 updated_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(student_id, academic_year_start, period)
);
create index if not exists periodic_assessments_teacher_period on public.periodic_assessments(teacher_id, academic_year_start, period);

create or replace function app_private.can_assess(student_key text, teacher_key text) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from public.students s join public.teachers t on t.nama = s."nama guru"
  where s.id::text = student_key and t.id::text = teacher_key
  and (app_private.is_manager() or exists (
   select 1 from public.user_roles r join public.teacher_class_access c on c.user_id = r.user_id
   where r.user_id = (select auth.uid()) and r.role = 'guru' and r.teacher_id = teacher_key and c.class_name = s.kelas
  ))
 );
$$;
revoke all on function app_private.can_assess(text,text) from public, anon;
grant execute on function app_private.can_assess(text,text) to authenticated;

create or replace function app_private.validate_periodic_assessment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare max_ayah integer; student_row record;
begin
 if auth.uid() is null then raise exception 'Login diperlukan untuk menyimpan penilaian'; end if;
 if not app_private.can_assess(new.student_id, new.teacher_id) then raise exception 'Siswa bukan tanggung jawab guru yang dipilih'; end if;
 select ayahs into max_ayah from public.quran_surahs where number = new.tahfidz_surah;
 if max_ayah is null or new.tahfidz_ayah not between 1 and max_ayah then raise exception 'Ayat tidak sesuai dengan surat yang dipilih'; end if;
 if tg_op = 'INSERT' then
  select s."nama siswa" as student_name, s.kelas as class_name, t.nama as teacher_name into student_row
  from public.students s join public.teachers t on t.nama = s."nama guru"
  where s.id::text = new.student_id and t.id::text = new.teacher_id;
  new.student_name := student_row.student_name;
  new.teacher_name := student_row.teacher_name;
  new.class_name := student_row.class_name;
  new.created_at := now(); new.created_by := auth.uid(); new.version := 1;
 else
  if (new.student_id, new.teacher_id, new.academic_year_start, new.period) is distinct from (old.student_id, old.teacher_id, old.academic_year_start, old.period) then
    raise exception 'Identitas penilaian tidak boleh diubah';
  end if;
  new.student_name := old.student_name; new.teacher_name := old.teacher_name; new.class_name := old.class_name;
  new.created_at := old.created_at; new.created_by := old.created_by; new.version := old.version + 1;
 end if;
 new.updated_at := now(); new.updated_by := auth.uid();
 return new;
end $$;
revoke all on function app_private.validate_periodic_assessment() from public, anon, authenticated;
drop trigger if exists validate_periodic_assessment on public.periodic_assessments;
create trigger validate_periodic_assessment before insert or update on public.periodic_assessments for each row execute function app_private.validate_periodic_assessment();

alter table public.periodic_assessments enable row level security;
revoke all on public.periodic_assessments from anon, authenticated;
grant select, insert, update on public.periodic_assessments to authenticated;
drop policy if exists assessment_read on public.periodic_assessments;
drop policy if exists assessment_insert on public.periodic_assessments;
drop policy if exists assessment_update on public.periodic_assessments;
create policy assessment_read on public.periodic_assessments for select to authenticated
 using (app_private.is_manager() or app_private.can_assess(student_id, teacher_id));
create policy assessment_insert on public.periodic_assessments for insert to authenticated
 with check (app_private.can_assess(student_id, teacher_id));
create policy assessment_update on public.periodic_assessments for update to authenticated
 using (app_private.is_manager() or app_private.can_assess(student_id, teacher_id))
 with check (app_private.can_assess(student_id, teacher_id));

create or replace function public.save_periodic_assessments(entries jsonb)
returns setof public.periodic_assessments language plpgsql security invoker set search_path = '' as $$
declare item jsonb; value public.periodic_assessments; saved public.periodic_assessments; expected integer;
begin
 if auth.uid() is null then raise exception 'Login diperlukan'; end if;
 if entries is null or jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) < 1 or jsonb_array_length(entries) > 1000 then raise exception 'Daftar penilaian tidak valid'; end if;
 for item in select * from jsonb_array_elements(entries) loop
  value := jsonb_populate_record(null::public.periodic_assessments, item);
  expected := (item->>'version')::integer;
  if expected is null or expected < 0 then raise exception 'Versi penilaian tidak valid'; end if;
  if expected = 0 then
   insert into public.periodic_assessments(student_id, teacher_id, academic_year_start, period,
    tahsin_makhraj,tahsin_tajwid,tahsin_tartil,tahsin_gharib,tahsin_book,tahsin_page,
    tahfidz_makhraj,tahfidz_tajwid,tahfidz_hafalan,tahfidz_surah,tahfidz_ayah)
   values(value.student_id,value.teacher_id,value.academic_year_start,value.period,
    value.tahsin_makhraj,value.tahsin_tajwid,value.tahsin_tartil,value.tahsin_gharib,value.tahsin_book,value.tahsin_page,
    value.tahfidz_makhraj,value.tahfidz_tajwid,value.tahfidz_hafalan,value.tahfidz_surah,value.tahfidz_ayah)
   returning * into saved;
  else
   update public.periodic_assessments set
    tahsin_makhraj=value.tahsin_makhraj,tahsin_tajwid=value.tahsin_tajwid,tahsin_tartil=value.tahsin_tartil,
    tahsin_gharib=value.tahsin_gharib,tahsin_book=value.tahsin_book,tahsin_page=value.tahsin_page,
    tahfidz_makhraj=value.tahfidz_makhraj,tahfidz_tajwid=value.tahfidz_tajwid,tahfidz_hafalan=value.tahfidz_hafalan,
    tahfidz_surah=value.tahfidz_surah,tahfidz_ayah=value.tahfidz_ayah
   where student_id=value.student_id and teacher_id=value.teacher_id and academic_year_start=value.academic_year_start and period=value.period and version=expected
   returning * into saved;
   if not found then raise exception 'Data sudah berubah atau akses ditolak. Muat ulang periode sebelum menyimpan kembali'; end if;
  end if;
  return next saved;
 end loop;
exception when unique_violation then
 raise exception 'Nilai siswa untuk periode ini sudah tersimpan. Muat ulang sebelum mengubahnya';
end $$;
revoke all on function public.save_periodic_assessments(jsonb) from public, anon;
grant execute on function public.save_periodic_assessments(jsonb) to authenticated;
comment on table public.periodic_assessments is 'Report-card source: one student per academic year and period, with original roster snapshot, raw subject scores and final attainment. Optional gharib is NULL, not zero.';
commit;
