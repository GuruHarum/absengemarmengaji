begin;
create or replace function app_private.is_report_coordinator() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_roles where user_id=auth.uid() and role='koordinator');
$$;
create table if not exists public.report_settings(id integer primary key check(id=1), data jsonb not null default '{}',version integer not null default 1);
insert into public.report_settings(id) values(1) on conflict do nothing;
alter table public.report_settings enable row level security;
revoke all on public.report_settings from public,anon,authenticated;
grant select on public.report_settings to authenticated;
drop policy if exists report_settings_read on public.report_settings;
create policy report_settings_read on public.report_settings for select to authenticated using(app_private.is_manager());
create table if not exists public.report_reference(id integer primary key check(id=1),data jsonb not null,version integer not null default 1);
insert into public.report_reference values(1, $reference${"books": [{"book": 1, "page": 1, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 2, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 3, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 4, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 5, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 6, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 7, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 8, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 9, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 10, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 11, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 12, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 13, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 14, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 15, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 16, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 17, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 18, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 19, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 20, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 21, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 22, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 23, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 24, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 25, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 26, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 27, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 28, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 29, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 30, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 31, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 32, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 33, "material": "huruf Hijaiyah tunggal berharakat fathah"}, {"book": 1, "page": 34, "material": "huruf Hijaiyah sambung berharakat fathah"}, {"book": 1, "page": 35, "material": "huruf Hijaiyah sambung berharakat fathah"}, {"book": 1, "page": 36, "material": "huruf Hijaiyah sambung berharakat fathah"}, {"book": 1, "page": 37, "material": "huruf Hijaiyah sambung berharakat fathah"}, {"book": 1, "page": 38, "material": "huruf Hijaiyah sambung berharakat fathah"}, {"book": 1, "page": 39, "material": "huruf Hijaiyah sambung berharakat fathah"}, {"book": 1, "page": 40, "material": "huruf Hijaiyah sambung berharakat fathah"}, {"book": 1, "page": 41, "material": "huruf Hijaiyah sambung berharakat fathah"}, {"book": 1, "page": 42, "material": "huruf Hijaiyah sambung berharakat fathah"}, {"book": 1, "page": 43, "material": "huruf Hijaiyah sambung berharakat fathah"}, {"book": 1, "page": 44, "material": "huruf Hijaiyah sambung berharakat fathah"}, {"book": 1, "page": 45, "material": "huruf Hijaiyah sambung berharakat kasrah"}, {"book": 1, "page": 46, "material": "huruf Hijaiyah sambung berharakat kasrah"}, {"book": 1, "page": 47, "material": "huruf Hijaiyah sambung berharakat kasrah"}, {"book": 1, "page": 48, "material": "huruf Hijaiyah sambung berharakat kasrah"}, {"book": 1, "page": 49, "material": "huruf Hijaiyah sambung berharakat dhummah"}, {"book": 1, "page": 50, "material": "huruf Hijaiyah sambung berharakat dhummah"}, {"book": 1, "page": 51, "material": "huruf Hijaiyah sambung berharakat dhummah"}, {"book": 1, "page": 52, "material": "huruf Hijaiyah sambung berharakat dhummah"}, {"book": 1, "page": 53, "material": "huruf Hijaiyah sambung berharakat fathah tanwin"}, {"book": 1, "page": 54, "material": "huruf Hijaiyah sambung berharakat fathah tanwin"}, {"book": 1, "page": 55, "material": "huruf Hijaiyah sambung berharakat kasrah tanwin"}, {"book": 1, "page": 56, "material": "huruf Hijaiyah sambung berharakat kasrah tanwin"}, {"book": 1, "page": 57, "material": "huruf Hijaiyah sambung berharakat dhummah tanwin"}, {"book": 1, "page": 58, "material": "huruf Hijaiyah sambung berharakat dhummah tanwin"}, {"book": 1, "page": 59, "material": "huruf Hijaiyah sambung berharakat fathah, kasrah, dhummah dan tanwin"}, {"book": 1, "page": 60, "material": "huruf Hijaiyah sambung berharakat fathah, kasrah, dhummah dan tanwin"}, {"book": 2, "page": 1, "material": "bacaan Mad Thabii harakat fathah diikuti Alif"}, {"book": 2, "page": 2, "material": "bacaan Mad Thabii harakat fathah diikuti Alif"}, {"book": 2, "page": 3, "material": "bacaan Mad Thabii harakat fathah diikuti Alif"}, {"book": 2, "page": 4, "material": "bacaan Mad Thabii harakat fathah diikuti Alif"}, {"book": 2, "page": 5, "material": "bacaan Mad Thabii harakat fathah diikuti Alif"}, {"book": 2, "page": 6, "material": "bacaan Mad Thabii harakat fathah diikuti Alif"}, {"book": 2, "page": 7, "material": "kalimat bacaan Ta' Marbuthah (ة)"}, {"book": 2, "page": 8, "material": "bacaan Mad Thabii harakat fathah berdiri"}, {"book": 2, "page": 9, "material": "bacaan Mad Thabii harakat fathah berdiri"}, {"book": 2, "page": 10, "material": "bacaan Mad Thabii harakat fathah berdiri"}, {"book": 2, "page": 11, "material": "bacaan Mad Thabii harakat kasrah diikuti Ya sukun"}, {"book": 2, "page": 12, "material": "bacaan Mad Thabii harakat kasrah diikuti Ya sukun"}, {"book": 2, "page": 13, "material": "bacaan Mad Thabii harakat kasrah diikuti Ya sukun"}, {"book": 2, "page": 14, "material": "bacaan Mad Thabii harakat kasrah diikuti Ya sukun"}, {"book": 2, "page": 15, "material": "bacaan Mad Thabii harakat dhummah diikuti Wawu sukun"}, {"book": 2, "page": 16, "material": "bacaan Mad Thabii harakat dhummah diikuti Wawu sukun"}, {"book": 2, "page": 17, "material": "bacaan Mad Thobii kalimat berharakat fathah, fathah berdiri, kasrah, kasrah berdiri, dhummah dan dhummah berdiri"}, {"book": 2, "page": 18, "material": "bacaan Mad Thobii kalimat berharakat fathah, fathah berdiri, kasrah, kasrah berdiri, dhummah dan dhummah berdiri"}, {"book": 2, "page": 19, "material": "bacaan Mad Thobii kalimat berharakat fathah, fathah berdiri, kasrah, kasrah berdiri, dhummah dan dhummah berdiri"}, {"book": 2, "page": 20, "material": "bacaan Mad Thobii kalimat berharakat fathah, fathah berdiri, kasrah, kasrah berdiri, dhummah dan dhummah berdiri"}, {"book": 2, "page": 21, "material": "bacaan Alif-Lam berharakat sukun (اَلْ)"}, {"book": 2, "page": 22, "material": "bacaan Alif-Lam berharakat sukun (اَلْ)"}, {"book": 2, "page": 23, "material": "bacaan Alif-Lam berharakat sukun (اَلْ)"}, {"book": 2, "page": 24, "material": "bacaan Alif-Lam berharakat sukun (اَلْ)"}, {"book": 2, "page": 25, "material": "bacaan Alif-Lam berharakat sukun (اَلْ)"}, {"book": 2, "page": 26, "material": "bacaan Alif-Lam berharakat sukun (اَلْ)"}, {"book": 2, "page": 27, "material": "bacaan huruf Sin berharakat sukun (سْ)"}, {"book": 2, "page": 28, "material": "bacaan huruf Sin berharakat sukun (سْ)"}, {"book": 2, "page": 29, "material": "bacaan huruf Sin berharakat sukun (سْ)"}, {"book": 2, "page": 30, "material": "bacaan huruf Sin berharakat sukun (سْ)"}, {"book": 2, "page": 31, "material": "bacaan huruf Mim berharakat sukun (مْ)"}, {"book": 2, "page": 32, "material": "bacaan huruf Mim berharakat sukun (مْ)"}, {"book": 2, "page": 33, "material": "bacaan huruf Mim berharakat sukun (مْ)"}, {"book": 2, "page": 34, "material": "bacaan huruf Mim berharakat sukun (مْ)"}, {"book": 2, "page": 35, "material": "bacaan huruf Liin"}, {"book": 2, "page": 36, "material": "bacaan huruf Liin"}, {"book": 2, "page": 37, "material": "bacaan huruf Liin"}, {"book": 2, "page": 38, "material": "bacaan huruf Liin"}, {"book": 2, "page": 39, "material": "bacaan huruf Liin"}, {"book": 2, "page": 40, "material": "bacaan huruf Liin"}, {"book": 2, "page": 41, "material": "bacaan huruf Liin"}, {"book": 2, "page": 42, "material": "bacaan huruf Liin"}, {"book": 2, "page": 43, "material": "bacaan huruf Liin"}, {"book": 2, "page": 44, "material": "bacaan huruf Liin"}, {"book": 2, "page": 45, "material": "bacaan Ro' Tafkhim dan Ro' Tarqiq (رْ)"}, {"book": 2, "page": 46, "material": "bacaan Ro' Tafkhim dan Ro' Tarqiq (رْ)"}, {"book": 2, "page": 47, "material": "bacaan Ro' Tafkhim dan Ro' Tarqiq (رْ)"}, {"book": 2, "page": 48, "material": "bacaan Ro' Tafkhim dan Ro' Tarqiq (رْ)"}, {"book": 2, "page": 49, "material": "perbedaan bunyi huruf 'Ain berharakat sukun dan Hamzah berharakat sukun (عْ - ءْ)"}, {"book": 2, "page": 50, "material": "perbedaan bunyi huruf 'Ain berharakat sukun dan Hamzah berharakat sukun (عْ - ءْ)"}, {"book": 2, "page": 51, "material": "perbedaan bunyi huruf 'Ain berharakat sukun dan Hamzah berharakat sukun (عْ - ءْ)"}, {"book": 2, "page": 52, "material": "perbedaan bunyi huruf 'Ain berharakat sukun dan Hamzah berharakat sukun (عْ - ءْ)"}, {"book": 2, "page": 53, "material": "perbedaan bunyi huruf 'Ain berharakat sukun dan Hamzah berharakat sukun (عْ - ءْ)"}, {"book": 2, "page": 54, "material": "perbedaan bunyi huruf 'Ain berharakat sukun dan Hamzah berharakat sukun (عْ - ءْ)"}, {"book": 2, "page": 55, "material": "perbedaan bunyi huruf Fa' berharakat sukun dan Ha' berharakat sukun (فْ - حْ)"}, {"book": 2, "page": 56, "material": "perbedaan bunyi huruf Fa' berharakat sukun dan Ha' berharakat sukun (فْ - حْ)"}, {"book": 2, "page": 57, "material": "perbedaan bunyi huruf Kaf berharakat sukun dan Hamzah berharakat sukun (كْ - ءْ)"}, {"book": 2, "page": 58, "material": "perbedaan bunyi huruf Kaf berharakat sukun dan Hamzah berharakat sukun (كْ - ءْ)"}, {"book": 2, "page": 59, "material": "perbedaan bunyi huruf Kaf berharakat sukun dan Hamzah berharakat sukun (كْ - ءْ)"}, {"book": 2, "page": 60, "material": "perbedaan bunyi huruf Kaf berharakat sukun dan Hamzah berharakat sukun (كْ - ءْ)"}, {"book": 3, "page": 1, "material": "bacaan Ikhfa dari huruf Nun berharakat sukun (نْ)"}, {"book": 3, "page": 2, "material": "bacaan Ikhfa dari huruf Nun berharakat sukun (نْ)"}, {"book": 3, "page": 3, "material": "bacaan Ikhfa dari huruf Nun berharakat sukun (نْ)"}, {"book": 3, "page": 4, "material": "bacaan Ikhfa dari harakat Tanwin"}, {"book": 3, "page": 5, "material": "bacaan Ikhfa dari harakat Tanwin"}, {"book": 3, "page": 6, "material": "bacaan Ikhfa dari harakat Tanwin"}, {"book": 3, "page": 7, "material": "bacaan Ikhfa dari harakat Tanwin"}, {"book": 3, "page": 8, "material": "bacaan Ikhfa dari harakat Tanwin"}, {"book": 3, "page": 9, "material": "bacaan Mad Wajib Muttashil"}, {"book": 3, "page": 10, "material": "bacaan Mad Wajib Muttashil"}, {"book": 3, "page": 11, "material": "bacaan huruf Ghunnah (نّ - مّ)"}, {"book": 3, "page": 12, "material": "bacaan huruf Ghunnah (نّ - مّ)"}, {"book": 3, "page": 13, "material": "bacaan huruf Ghunnah (نّ - مّ)"}, {"book": 3, "page": 14, "material": "bacaan huruf bertasydid"}, {"book": 3, "page": 15, "material": "bacaan huruf bertasydid"}, {"book": 3, "page": 16, "material": "bacaan huruf Syamsiyah"}, {"book": 3, "page": 17, "material": "bacaan huruf Syamsiyah"}, {"book": 3, "page": 18, "material": "bacaan Idghom Bighunnah huruf Mim (م)"}, {"book": 3, "page": 19, "material": "bacaan Idghom Bighunnah huruf Mim (م)"}, {"book": 3, "page": 20, "material": "bacaan Idghom Bighunnah dan Idghom Mitsli"}, {"book": 3, "page": 21, "material": "bacaan Idghom Bilaghunnah"}, {"book": 3, "page": 22, "material": "bacaan Idghom Bilaghunnah"}, {"book": 3, "page": 23, "material": "bacaan Idghom Bighunnah huruf Ya' dan Wawu (ي - و)"}, {"book": 3, "page": 24, "material": "bacaan Idghom Bighunnah huruf Ya' dan Wawu (ي - و)"}, {"book": 3, "page": 25, "material": "bacaan Idghom Bighunnah huruf Ya' dan Wawu (ي - و)"}, {"book": 3, "page": 26, "material": "bacaan lafadz Allah dibaca Tafkhim dan Tarqiq"}, {"book": 3, "page": 27, "material": "bacaan lafadz Allah dibaca Tafkhim dan Tarqiq"}, {"book": 3, "page": 28, "material": "bacaan Mad Aridh Lissukun"}, {"book": 3, "page": 29, "material": "bacaan Mad Iwadh"}, {"book": 3, "page": 30, "material": "bacaan Qalqalah huruf Ba', Jim dan Dal berharakat sukun (بْ - جْ - دْ)"}, {"book": 3, "page": 31, "material": "bacaan Qalqalah huruf Ba', Jim dan Dal berharakat sukun (بْ - جْ - دْ)"}, {"book": 3, "page": 32, "material": "bacaan Qalqalah huruf Ba', Jim dan Dal berharakat sukun (بْ - جْ - دْ)"}, {"book": 3, "page": 33, "material": "bacaan Waqaf huruf Ha dan Ro (ه - ر)"}, {"book": 3, "page": 34, "material": "bacaan Waqaf huruf Ha dan Ro (ه - ر)"}, {"book": 3, "page": 35, "material": "bacaan Iqlab"}, {"book": 3, "page": 36, "material": "bacaan Waqaf Ta' Marbuthah (ة)"}, {"book": 3, "page": 37, "material": "bacaan Ikhfa Syafawi"}, {"book": 3, "page": 38, "material": "bacaan Ikhfa Syafawi"}, {"book": 3, "page": 39, "material": "bacaan Qalqalah huruf Tho' dan Qof berharakat sukun (طْ - قْ)"}, {"book": 3, "page": 40, "material": "bacaan Qalqalah huruf Tho' dan Qof berharakat sukun (طْ - قْ)"}, {"book": 3, "page": 41, "material": "bacaan Qalqalah huruf Tho' dan Qof berharakat sukun (طْ - قْ)"}, {"book": 3, "page": 42, "material": "bacaan Idzhar"}, {"book": 3, "page": 43, "material": "bacaan Idzhar"}, {"book": 3, "page": 44, "material": "bacaan Idzhar"}, {"book": 3, "page": 45, "material": "bacaan Idzhar"}, {"book": 3, "page": 46, "material": "bacaan Idzhar"}, {"book": 3, "page": 47, "material": "bacaan Idzhar"}, {"book": 3, "page": 48, "material": "bacaan Idzhar"}, {"book": 3, "page": 49, "material": "bacaan Idzhar"}, {"book": 3, "page": 50, "material": "bacaan Idzhar"}, {"book": 3, "page": 51, "material": "bacaan Idzhar"}, {"book": 3, "page": 52, "material": "bacaan tilawah surat-surat pilihan dalam Al-Qur'an"}, {"book": 3, "page": 53, "material": "bacaan tilawah surat-surat pilihan dalam Al-Qur'an"}, {"book": 3, "page": 54, "material": "bacaan tilawah surat-surat pilihan dalam Al-Qur'an"}, {"book": 3, "page": 55, "material": "bacaan tilawah surat-surat pilihan dalam Al-Qur'an"}, {"book": 3, "page": 56, "material": "bacaan tilawah surat-surat pilihan dalam Al-Qur'an"}, {"book": 3, "page": 57, "material": "bacaan tilawah surat-surat pilihan dalam Al-Qur'an"}, {"book": 3, "page": 58, "material": "bacaan tilawah surat-surat pilihan dalam Al-Qur'an"}, {"book": 3, "page": 59, "material": "bacaan tilawah surat-surat pilihan dalam Al-Qur'an"}, {"book": 3, "page": 60, "material": "bacaan tilawah surat-surat pilihan dalam Al-Qur'an"}], "surahGroups": {"SURAT_1_3": ["Tes Juz", "Review persiapan tes Juz", "QS. Al-Baqarah", "QS. Al-Imran"], "SURAT_25": ["Tes Juz 25", "Review persiapan tes Juz 25", "QS. Asy-Syura", "QS. Az-Zukhruf", "QS. Ad-Dukhan", "QS. Al-Jatsiyah"], "SURAT_26": ["Tes Juz 26", "Review persiapan tes Juz 26", "QS. Al-Ahqaf", "QS. Muhammad", "QS. Al-Fath", "QS. Al-Hujurat", "QS. Qaf", "QS. Adz-Dzariyat"], "SURAT_27": ["Tes Juz 27", "Review persiapan tes Juz 27", "QS. Adz-Dzariyat", "QS. Ath-Thur", "QS. An-Najm", "QS. Al-Qamar", "QS. Ar-Rahman", "QS. Al-Waqi'ah", "QS. Al-Hadid"], "SURAT_28": ["Tes Juz 28", "Review persiapan tes Juz 28", "QS. Al-Mujadilah", "QS. Al-Hasyr", "QS. Al-Mumtahanah", "QS. Ash-Shaf", "QS. Al-Jumu'ah", "QS. Al-Munafiqun", "QS. At-Taghabun", "QS. Ath-Thalaq", "QS. At-Tahrim"], "SURAT_29": ["Tes Juz 29", "Review persiapan tes Juz 29", "QS. Al-Mulk", "QS. Al-Qalam", "QS. Al-Haqqah", "QS. Al-Ma'arij", "QS. Nuh", "QS. Al-Jinn", "QS. Al-Muzzammil", "QS. Al-Muddatstsir", "QS. Al-Qiyamah", "QS. Al-Insan", "QS. Al-Mursalat"], "SURAT_30": ["Tes Juz 30", "Review persiapan tes Juz 30", "QS. An-Naba", "QS. An-Nazi'at", "QS. Abasa", "QS. At-Takwir", "QS. Al-Infithar", "QS. Al-Muthaffifin", "QS. Al-Insyiqaq", "QS. Al-Buruj", "QS. Ath-Thariq", "QS. Al-A'la", "QS. Al-Ghasyiyah", "QS. Al-Fajr", "QS. Al-Balad", "QS. Asy-Syams", "QS. Al-Lail", "QS. Adh-Dhuha", "QS. Al-Insyirah", "QS. At-Tiin", "QS. Al-Alaq", "QS. Al-Qadr", "QS. Al-Bayyinah", "QS. Al-Zalzalah", "QS. Al-Adiyat", "QS. Al-Qari'ah", "QS. At-Takatsur", "QS. Al-Ashr", "QS. Al-Humazah", "QS. Al-Fiil", "QS. Quraisy", "QS. Al-Ma'un", "QS. Al-Kautsar", "QS. Al-Kafirun", "QS. An-Nashr", "QS. Al-Lahab", "QS. Al-Ikhlash", "QS. Al-Falaq", "QS. An-Naas"], "SURAT_4": ["Tes Juz 4", "Review persiapan tes Juz 4", "QS. Al-Imran", "QS. An-Nisaa'"], "SURAT_5": ["Tes Juz 5", "Review persiapan tes Juz 5", "QS. An-Nisaa'"], "SURAT_6": ["Tes Juz 6", "Review persiapan tes Juz 6", "QS. An-Nisaa'", "QS. Al-Maidah"], "SURAT_7": ["Tes Juz 7", "Review persiapan tes Juz 7", "QS. Al-Maidah", "QS. Al-An'am"], "SURAT_8": ["Tes Juz 8", "Review persiapan tes Juz 8", "QS. Al-An'am", "QS. Al-A'raf"]}, "texts": {"AA1": " menunjukan pemahaman yang baik dalam melafalkan bacaan tahsin ", "AB1": " berhasil menuntaskan pelajaran tahsin metode Qiraati dan meraih ", "AC1": " membutuhkan bimbingan dalam melafalkan bacaan tahsin ", "AD1": "sesuai pengajaran dan bimbingan kaidah bacaan yang telah guru contohkan.", "AE1": " menunjukan pemahaman yang baik dalam melafalkan tilawah Al-Qur'an dalam kelas ", "AF1": " menunjukan pemahaman yang baik dalam melafalkan hafalan Al-Qur'an surat ", "AG1": " sesuai pengajaran dan bimbingan kaidah pelafalan ayat yang telah guru contohkan.", "AH1": " membutuhkan bimbingan dalam melafalkan hafalan Al-Qur'an surat ", "AI1": " menunjukan pemahaman yang baik dalam tes kompetensi hafalan Al-Qur'an kenaikan Juz ", "AJ1": " membutuhkan bimbingan lagi dalam tes kompetensi hafalan Al-Qur'an kenaikan Juz ", "AK1": " menunjukan pemahaman yang baik dalam sesi ", "AL1": " membutuhkan bimbingan dalam sesi "}, "types": ["BUKU", "JILID", "AL-QUR'AN", "FINISHING", "SYAHADAH", "TAKHASSUS"]}$reference$::jsonb,1) on conflict do nothing;
alter table public.report_reference enable row level security;
revoke all on public.report_reference from public,anon,authenticated;
grant select on public.report_reference to authenticated;
drop policy if exists report_reference_read on public.report_reference;
create policy report_reference_read on public.report_reference for select to authenticated using(exists(select 1 from public.user_roles where user_id=auth.uid()));
create table if not exists public.student_reports(
 student_id text not null,academic_year_start integer not null,period text not null check(period in ('pts_ganjil','pas_ganjil','pts_genap','pas_genap')),
 status text not null default 'DRAF' check(status in ('DRAF','DIAJUKAN','PERLU REVISI','DISETUJUI')),
 snapshot jsonb, reason text,approved_at timestamptz,approved_by uuid,updated_at timestamptz not null default now(),
 primary key(student_id,academic_year_start,period));
alter table public.student_reports enable row level security;
revoke all on public.student_reports from public,anon,authenticated;
grant select on public.student_reports to authenticated;
drop policy if exists reports_coordinator on public.student_reports;
create policy reports_coordinator on public.student_reports for select to authenticated using(app_private.is_report_coordinator());
create or replace function public.save_report_configuration(kind text, payload jsonb, expected integer) returns integer language plpgsql security definer set search_path='' as $$
declare next_version integer;
begin
 if not app_private.is_manager() then raise exception 'Akses pengaturan ditolak'; end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>250000 then raise exception 'Pengaturan tidak valid'; end if;
 if kind='settings' then
  update public.report_settings set data=payload,version=version+1 where id=1 and version=expected returning version into next_version;
 elsif kind='reference' then
  if jsonb_typeof(payload->'books')<>'array' or jsonb_typeof(payload->'texts')<>'object' then raise exception 'Referensi tidak lengkap'; end if;
  update public.report_reference set data=payload,version=version+1 where id=1 and version=expected returning version into next_version;
 else raise exception 'Jenis pengaturan tidak valid'; end if;
 if next_version is null then raise exception 'Pengaturan berubah. Muat ulang'; end if;return next_version;
end $$;
revoke all on function public.save_report_configuration(text,jsonb,integer) from public,anon;
grant execute on function public.save_report_configuration(text,jsonb,integer) to authenticated;

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
   select ayahs into max_ayah from public.quran_surahs where number=n;
   if max_ayah is null or stop_ayah is null or stop_ayah not between 1 and max_ayah or (item->>'tahfidz_ayah_start')::integer is null or (item->>'tahfidz_ayah_start')::integer not between 1 and stop_ayah then raise exception 'Rentang ayat Tahfidz tidak valid'; end if;
   result:=result||jsonb_build_object('tahfidz_surah',n,'tahfidz_ayah',stop_ayah,'tahfidz_ayah_start',(item->>'tahfidz_ayah_start')::integer);
  end if;
 end if;
 if length(coalesce(item->>'teacher_note',''))>500 then raise exception 'Catatan maksimal 500 karakter'; end if;
 return result||jsonb_build_object('teacher_note',coalesce(item->>'teacher_note',''));
end $$;
revoke all on function app_private.validate_report_progress(jsonb,text) from public,anon,authenticated;

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
  foreach field in array (case when sub='tahsin' then array['tahsin_makhraj','tahsin_tajwid','tahsin_tartil','tahsin_gharib'] else array['tahfidz_makhraj','tahfidz_tajwid','tahfidz_hafalan'] end) loop
   raw := item->>field;
   if field='tahsin_gharib' and (raw is null or raw='') then score_data := score_data || jsonb_build_object(field,null); continue; end if;
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
    scores=score_data,needs_review=false,version=version+1,updated_at=now(),updated_by=auth.uid()
    where id=previous.id returning * into saved;
  end if;
  return next saved;
 end loop;
exception when unique_violation then raise exception 'Nilai sudah tersimpan. Muat ulang sebelum mengubah';
end $$;

create table if not exists public.report_period_students(
 student_id text not null,academic_year_start integer not null,period text not null,
 student_name text not null,class_name text not null,primary key(student_id,academic_year_start,period));
alter table public.report_period_students enable row level security;
revoke all on public.report_period_students from public,anon,authenticated;
grant select on public.report_period_students to authenticated;
drop policy if exists report_cohort_coordinator on public.report_period_students;
create policy report_cohort_coordinator on public.report_period_students for select to authenticated using(app_private.is_report_coordinator());
create or replace function app_private.report_payload(student_key text,yr integer,pr text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb;b jsonb;pupil jsonb;config jsonb;refs jsonb;school jsonb;settings jsonb;ident jsonb;lvl text;issues jsonb:='[]';r record;
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
 settings:=coalesce(settings,'{}')||coalesce(config->'overrides'->(yr::text||'_'||pr||'_'||student_key),'{}');
 if a is null then issues:=issues||'"Tahsin belum dinilai"'::jsonb;end if;
 if b is null then issues:=issues||'"Tahfidz belum dinilai"'::jsonb;end if;
 if a->>'class_name' is distinct from b->>'class_name' and a is not null and b is not null then issues:=issues||'"Snapshot kelas kedua pelajaran berbeda"'::jsonb;end if;
 for r in select * from public.subject_assessments where student_id=student_key and academic_year_start=yr and period=pr loop
  if r.needs_review then issues:=issues||to_jsonb(r.subject||' perlu verifikasi pengampu');end if;
  begin perform app_private.validate_report_progress(r.scores,r.subject);exception when others then issues:=issues||to_jsonb(r.subject||': '||sqlerrm);end;
 end loop;
 if nullif(pupil->>'nis','') is null then issues:=issues||'"NIS belum tersedia"'::jsonb;end if;
 if nullif(school->>'name','') is null or nullif(school->>'logo_url','') is null then issues:=issues||'"Profil atau logo sekolah belum lengkap"'::jsonb;end if;
 if nullif(config->>'principal_name','') is null or nullif(config->>'coordinator_name','') is null or nullif(config->>'principal_niy','') is null or nullif(config->>'coordinator_niy','') is null or nullif(config->>'city','') is null then issues:=issues||'"Penandatangan/tempat rapor belum lengkap"'::jsonb;end if;
 if settings->'tahsin_target' is null or settings->'tahfidz_target' is null or settings->>'tahsin_kkm' is null or settings->>'tahfidz_kkm' is null then issues:=issues||'"KKM/target periode dan tingkat belum diatur"'::jsonb;
 else
  begin
   perform app_private.validate_report_progress(settings->'tahsin_target','tahsin');
   perform app_private.validate_report_progress((settings->'tahfidz_target')||'{"tahfidz_aspect_confirmed":true}'::jsonb,'tahfidz');
   if (settings->>'tahsin_kkm')::numeric not between 0 and 100 or (settings->>'tahfidz_kkm')::numeric not between 0 and 100 then raise exception 'KKM harus 0?100';end if;
  exception when others then issues:=issues||to_jsonb('Pengaturan target: '||sqlerrm);end;
 end if;
 return jsonb_build_object('student',pupil,'year',yr,'period',pr,'tahsin',a,'tahfidz',b,'settings',settings,'officials',config-'curriculum'-'overrides','school',school,'reference',refs,'issues',issues);
end $$;
revoke all on function app_private.report_payload(text,integer,text) from public,anon,authenticated;

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
  labels as(select ids.id,coalesce(r.snapshot->'student'->>'class',a.class_name,cohort.class_name,s.kelas) class_name from ids
   left join public.students s on s.id::text=ids.id
   left join public.report_period_students cohort on cohort.student_id=ids.id and cohort.academic_year_start=yr and cohort.period=pr
   left join lateral(select class_name from public.subject_assessments where student_id=ids.id and academic_year_start=yr and period=pr order by subject desc limit 1) a on true
   left join public.student_reports r on r.student_id=ids.id and r.academic_year_start=yr and r.period=pr and r.status='DISETUJUI')
  select * from labels where substring(app_private.normalize_student_class(class_name) from '^([0-9]+)')=grade::text order by id limit 250 offset start_at
 loop
  select * into report from public.student_reports where student_id=rec.id and academic_year_start=yr and period=pr;
  payload:=case when report.status='DISETUJUI' then report.snapshot else app_private.report_payload(rec.id,yr,pr) end;
  return next payload||jsonb_build_object('status',coalesce(report.status,'DRAF'),'reason',report.reason,'approved_at',report.approved_at);
 end loop;
end $$;
revoke all on function public.report_roster(integer,text,integer,integer) from public,anon;
grant execute on function public.report_roster(integer,text,integer,integer) to authenticated;

create or replace function public.review_student_report(student_key text,yr integer,pr text,action text,tahsin_version integer,tahfidz_version integer,note text default '') returns text language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
 if not app_private.is_report_coordinator() then raise exception 'Rapor hanya untuk koordinator';end if;
 if action not in ('DIAJUKAN','PERLU REVISI','DISETUJUI') then raise exception 'Status tidak valid';end if;
 perform 1 from public.subject_assessments where student_id=student_key and academic_year_start=yr and period=pr order by subject for update;
 perform 1 from public.report_settings where id=1 for share;
 perform 1 from public.report_reference where id=1 for share;
 payload:=app_private.report_payload(student_key,yr,pr);
 if coalesce((payload->'tahsin'->>'version')::integer,0)<>tahsin_version or coalesce((payload->'tahfidz'->>'version')::integer,0)<>tahfidz_version then raise exception 'Nilai telah berubah. Muat ulang';end if;
 if action in ('DIAJUKAN','DISETUJUI') and jsonb_array_length(payload->'issues')>0 then raise exception 'Rapor belum lengkap: %',payload->'issues';end if;
 insert into public.student_reports(student_id,academic_year_start,period,status,snapshot,reason,approved_at,approved_by)
 values(student_key,yr,pr,action,case when action='DISETUJUI' then payload end,left(note,500),case when action='DISETUJUI' then now() end,case when action='DISETUJUI' then auth.uid() end)
 on conflict(student_id,academic_year_start,period) do update set status=excluded.status,snapshot=excluded.snapshot,reason=excluded.reason,approved_at=excluded.approved_at,approved_by=excluded.approved_by,updated_at=now();
 return action;
end $$;
revoke all on function public.review_student_report(text,integer,text,text,integer,integer,text) from public,anon;
grant execute on function public.review_student_report(text,integer,text,text,integer,integer,text) to authenticated;
create table if not exists public.student_report_history(
 id bigint generated always as identity primary key,previous_record jsonb not null,changed_at timestamptz not null default now(),changed_by uuid);
alter table public.student_report_history enable row level security;
revoke all on public.student_report_history from public,anon,authenticated;
grant select on public.student_report_history to authenticated;
drop policy if exists report_history_coordinator on public.student_report_history;
create policy report_history_coordinator on public.student_report_history for select to authenticated using(app_private.is_report_coordinator());
create or replace function app_private.archive_report_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.snapshot is not null then insert into public.student_report_history(previous_record,changed_by) values(to_jsonb(old),auth.uid());end if;
 return new;
end $$;
drop trigger if exists archive_report_revision on public.student_reports;
create trigger archive_report_revision before update on public.student_reports for each row execute function app_private.archive_report_revision();
create or replace function app_private.invalidate_report_approval() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.student_reports set status='PERLU REVISI',reason='Penilaian berubah setelah pemeriksaan',snapshot=null,approved_at=null,approved_by=null,updated_at=now()
 where student_id=new.student_id and academic_year_start=new.academic_year_start and period=new.period;
 return new;
end $$;
drop trigger if exists assessment_report_changed on public.subject_assessments;
create trigger assessment_report_changed after insert or update on public.subject_assessments for each row execute function app_private.invalidate_report_approval();
commit;
notify pgrst,'reload schema';
