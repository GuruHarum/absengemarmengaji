"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require('../../.test-tools/node_modules/@electric-sql/pglite');
const sql = name => readFileSync(join(__dirname, '../../supabase', name), 'utf8');
test('v2 rules, target isolation, issuance snapshots and role authorization', async (t) => {
    const db = new PGlite();
    const manager = '00000000-0000-0000-0000-000000000001';
    const tahsin = '00000000-0000-0000-0000-000000000002';
    const tahfidz = '00000000-0000-0000-0000-000000000003';
    let year;
    const login = async (uid) => {
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid || '']);
        await db.exec(uid ? 'set role authenticated' : 'set role anon');
    };
    const save = async (entries) => (await db.query('select * from public.save_subject_assessments($1::jsonb)', [JSON.stringify(entries)])).rows;
    const entry = (subject, student = '2', version = 0) => ({
        student_id: student, teacher_id: subject === 'tahsin' ? '1' : '2', academic_year_start: year,
        period: 'pts_ganjil', subject, version,
        ...(subject === 'tahsin' ? { tahsin_makhraj: 0, tahsin_tajwid: 81.25, tahsin_tartil: 82, tahsin_gharib: null, tahsin_book: 'Jilid 3', tahsin_page: 42 }
            : { tahfidz_makhraj: 83, tahfidz_tajwid: 84, tahfidz_hafalan: 85, tahfidz_surah: 108, tahfidz_ayah: 3 })
    });
    try {
        await db.exec(`
            create role anon; create role authenticated;
            create schema auth; create schema storage;
            create table auth.users(id uuid primary key,email text);
            create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
            grant usage on schema auth to anon,authenticated;
            grant execute on function auth.uid() to anon,authenticated;
            create table storage.objects(id uuid,bucket_id text);
            create table public.teachers(id bigint primary key,nama text,foto text);
            create table public.students(id bigint primary key,"nama siswa" text,"nama guru" text,kelas text);
            create table public.attendance(id bigint primary key,student text,teacher text,class text,date text,status text);
            create table public.school_profile(id bigint primary key);
            create table public.maintenance_settings(id bigint primary key,enabled boolean);
            insert into auth.users values('${manager}','manager@example.test'),('${tahsin}','a@example.test'),('${tahfidz}','b@example.test');
            insert into teachers values(1,'Guru A',null),(2,'Guru B',null),(3,'Guru C',null);
            insert into students values(1,'Ahmad','Guru A','1A'),(2,'Bilal','Guru A','1A'),(3,'Cahya','Guru C','2A'),(4,'Dani','Guru A','3A'),(5,'Eka','Guru C','3A');
        `);
        await db.exec(sql('roles.sql'));
        await db.exec(sql('periodic-assessments.sql'));
        await db.exec(sql('teacher-full-name.sql'));
        await db.exec(`insert into user_roles values('${manager}','koordinator','1'),('${tahsin}','guru','1'),('${tahfidz}','guru','2');
            insert into teacher_class_access values('${tahsin}','1A');`);
        year = (await db.query("select extract(year from now() at time zone 'Asia/Jakarta')::int-case when extract(month from now() at time zone 'Asia/Jakarta')<7 then 1 else 0 end as year")).rows[0].year;
        await db.exec(sql('subject-assignments.sql'));
        await db.exec(sql('assessment-rosters.sql'));
        await db.exec(sql('student-import.sql'));
        await db.exec(sql('report-cards.sql'));
        await db.exec(sql('report-cards.sql'));
        await db.exec('revoke select on public.report_settings,public.report_reference from authenticated');
        await login(manager);
        await assert.rejects(db.query('select * from report_settings'), /permission denied/);
        await db.exec('reset role');
        await db.exec(sql('report-permissions-fix.sql'));
        await db.exec(sql('account-access-fix.sql'));
        await db.exec(sql('account-access-fix.sql'));
        await db.exec(sql('report-permissions-fix.sql'));
        await login(manager);
        assert.equal((await db.query('select * from report_settings')).rows.length, 1);
        assert.equal((await db.query('select * from list_school_accounts()')).rows.length, 3);
        await login(tahsin);
        assert.equal((await db.query('select * from report_settings')).rows.length, 0);
        await assert.rejects(db.query('select * from list_school_accounts()'), /admin\/koordinator/);
        assert.equal((await db.query('select * from report_reference')).rows.length, 1);
        await login(null);
        await assert.rejects(db.query('select * from report_settings'), /permission denied/);
        await db.exec('reset role');
        await db.exec("alter table school_profile add column name text,add column logo_url text;insert into school_profile values(1,'Sekolah Uji','https://example.test/logo.png');insert into student_identifiers values(2,'0002',null)");
        const admin = '00000000-0000-0000-0000-000000000004';
        await db.exec(`insert into auth.users values('${admin}','admin@example.test');insert into user_roles values('${admin}','admin',null)`);
        for (const uid of [null, admin, tahsin, tahfidz]) {
            await login(uid);
            await assert.rejects(db.query('select * from report_roster($1,$2,1,0)', [year, 'pts_ganjil']), /permission denied|koordinator/);
            if (uid)
                assert.equal((await db.query('select * from student_reports')).rows.length, 0);
        }
        await login(manager);
        await db.query("select manage_tahfidz_group('create',null,'2','Kelompok Uji',$1,array['2'])", [year]);
        const a = { ...entry('tahsin'), tahsin_progress_type: 'BUKU', tahsin_book_number: 1, tahsin_page: 60 };
        const b = { ...entry('tahfidz'), tahfidz_progress_type: 'SURAT', tahfidz_juz: 30, tahfidz_ayah_start: 1, tahfidz_aspect_confirmed: true };
        await db.exec('reset role');
        await db.exec(sql('assessment-report-v2.sql'));
        await db.exec(sql('assessment-report-v2.sql'));
        await login(manager);
        await save([{ ...a, tahsin_tajwid: null }, b]);
        const roster = async () => (await db.query('select report_roster($1,$2,1,0) r', [year, 'pts_ganjil'])).rows.map(x => x.r);
        let row = (await roster()).find(r => r.student.id === '2');
        assert.equal(row.score_checks.tahsin.complete, true);
        const untouched = (await roster()).find(r => r.student.id === '1');
        assert.equal(untouched.score_checks.tahsin.missing.length, 2);
        assert.equal(untouched.score_checks.tahfidz.missing.length, 3);
        assert.equal(untouched.teachers.tahsin, 'Guru A');
        const target = async (sub, v, prev = null) => db.query('select save_report_target($1,$2,1,$3,$4,75,$5)', [year, 'pts_ganjil', sub, v, prev]);
        await target('tahsin', a);
        await target('tahfidz', b);
        const settings = (await db.query('select * from report_settings')).rows[0];
        await db.query('select save_report_identity($1,$2)', [{ principal_name: 'Kepala Uji, S.Pd.', principal_niy: '001', coordinator_name: 'Koordinator Uji', coordinator_niy: '002', city: 'Kota Uji' }, settings.version]);
        row = (await roster()).find(r => r.student.id === '2');
        assert.equal(row.issues.length, 0);
        assert.ok(row.settings.tahsin_target);
        assert.ok(row.settings.tahfidz_target);
        await assert.rejects(target('tahsin', a), /berubah/);
        const issue = async (r) => db.query('select record_report_issuance($1)', [[{ student_id: r.student.id, year, period: 'pts_ganjil', fingerprint: r.fingerprint }]]);
        await issue(row);
        await assert.rejects(db.query("select review_student_report('2',$1,'pts_ganjil','DISETUJUI',1,1,'')", [year]), /permission denied/);
        const current = (await db.query('select * from report_settings')).rows[0];
        await db.query('select save_report_identity($1,$2)', [{ principal_name: 'Kepala Baru', principal_niy: '001', coordinator_name: 'Koordinator Baru', coordinator_niy: '002', city: 'Kota Baru' }, current.version]);
        assert.equal((await roster()).find(r => r.student.id === '2').officials.principal_name, 'Kepala Uji, S.Pd.');
        await assert.rejects(save([{ ...a, version: 1, tahsin_progress_type: 'FINISHING', tahsin_gharib: null }]), /gharib/);
        await save([{ ...a, version: 1, tahsin_progress_type: 'FINISHING', tahsin_gharib: 88 }]);
        await assert.rejects(issue(row), /berubah/);
        await save([{ ...a, version: 2, tahsin_book_number: 3, tahsin_gharib: null }]);
        row = (await roster()).find(r => r.student.id === '2');
        assert.equal(row.tahsin.scores.tahsin_gharib, 88);
        assert.equal(row.score_checks.tahsin.complete, true);
        await assert.rejects(save([{ ...a, version: 3, tahsin_book_number: 2, tahsin_tajwid: null }]), /tajwid/);
        await assert.rejects(save([{ ...b, version: 1, tahfidz_juz: 29, tahfidz_surah: 112 }]), /juz/);
        await login(tahsin);
        await assert.rejects(target('tahsin', a), /ditolak/);
        await assert.rejects(issue(row), /koordinator/);
        await assert.rejects(save([{ ...b, version: 1 }]), /penugasan/);
        await login(null);
        await assert.rejects(issue(row), /permission denied/);
        await db.exec('reset role');
        const vm = require('node:vm'), ctx = vm.createContext({});
        ctx.window = ctx;
        for (const name of ['quran-surahs', 'report-reference', 'report-core'])
            vm.runInContext(readFileSync(join(__dirname, '../../js/' + name + '.js'), 'utf8'), ctx);
        for (const type of ['BUKU', 'FINISHING', 'JILID', "AL-QUR'AN", 'SYAHADAH', 'TAKHASSUS', 'UNKNOWN'])
            for (const book of [1, 2, 3])
                for (const value of [null, '', '  ', 0, 80, 101]) {
                    const v = { tahsin_progress_type: type, tahsin_book_number: book, tahsin_makhraj: value, tahsin_tajwid: 80, tahsin_tartil: 80, tahsin_gharib: value };
                    const js = ctx.ReportCore.check(v, 'tahsin'), pg = (await db.query("select app_private.report_score_issues($1,'tahsin') r", [v])).rows[0].r;
                    assert.deepEqual(pg.missing, Array.from(js.missing));
                    assert.deepEqual(pg.invalid, Array.from(js.invalid));
                    assert.equal(pg.complete, js.complete);
                }
        await db.exec(sql('curriculum-targets-2025-2026.sql'));
        await db.exec(sql('curriculum-targets-2025-2026.sql'));
        await login(manager);
        const bookTarget = { curriculum_mode: 'BUKU', tahsin_progress_type: 'BUKU', tahsin_book_number: 1, target_page_start: 31, target_page_end: 44, tahsin_page: 44 };
        const hTarget = { curriculum_range: true, tahfidz_progress_type: 'SURAT', tahfidz_juz: 30, tahfidz_surah_start: 104, tahfidz_ayah_start: 1, tahfidz_surah: 101, tahfidz_ayah: 11 };
        await db.query('select save_report_target($1,$2,1,$3,$4,75,$5)', [year, 'pts_genap', 'tahsin', bookTarget, null]);
        await db.query('select save_report_target($1,$2,1,$3,$4,75,$5)', [year, 'pts_genap', 'tahfidz', hTarget, null]);
        const newRoster = (await db.query('select report_roster($1,$2,1,0) r', [year, 'pts_genap'])).rows.map(r=>r.r);
        const currentTarget = newRoster.find(r=>r.student.id==='2');
        assert.equal(currentTarget.settings.tahsin_target.target_page_end, 44);
        assert.equal(currentTarget.settings.tahfidz_target.tahfidz_surah_start,104);
        assert.ok(!currentTarget.issues.some(x=>String(x).includes('Pengaturan target')));
        assert.ok((await roster()).find(r=>r.student.id==='2').settings.tahsin_target);
    }
    finally {
        await db.close();
    }
});
