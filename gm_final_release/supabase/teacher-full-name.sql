begin;
alter table public.teachers add column if not exists nama_lengkap text;
comment on column public.teachers.nama_lengkap is
  'Nama lengkap beserta gelar untuk rapor; nama tetap menjadi label/penghubung absensi lama.';
commit;
notify pgrst, 'reload schema';
