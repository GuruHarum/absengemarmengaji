"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require('../../.test-tools/node_modules/@electric-sql/pglite');
const sql = name => readFileSync(join(__dirname, '../../supabase', name), 'utf8');
test('PostgreSQL migration, independent subject saves, RLS and reassignment history', async (t) => {
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
        await login(manager);
        const legacy = { ...entry('tahsin', '1'), ...entry('tahfidz', '1'), teacher_id: '1' };
        await db.query('select * from save_periodic_assessments($1::jsonb)', [JSON.stringify([legacy])]);
        await db.exec('reset role');
        await db.exec(sql('subject-assignments.sql'));
        await login(manager);
        await db.exec("update teachers set attendance_enabled=false,nama_lengkap='Ustadz B Lengkap' where id=2");
        await t.test('migration preserves both legacy subjects and marks only Tahfidz for review', async () => {
            const rows = (await db.query("select * from subject_assessments where student_id='1' order by subject")).rows;
            assert.equal(rows.length, 2);
            assert.equal(rows.find(r => r.subject === 'tahsin').scores.tahsin_makhraj, 0);
            assert.equal(rows.find(r => r.subject === 'tahfidz').teacher_id, null);
            assert.equal(rows.find(r => r.subject === 'tahfidz').needs_review, true);
            assert.equal((await db.query("select * from teaching_assignments where class_name='3A'")).rows.length, 0);
            await db.query("select manage_teaching_assignment('create',null,'2','tahfidz','1A',$1)", [year]);
            await assert.rejects(db.query("select manage_teaching_assignment('create',null,'3','tahfidz','1A',$1)", [year]), /sudah mempunyai pengampu/);
        });
        await t.test('anonymous roster excludes Tahfidz-only teachers and grades are private', async () => {
            await login(null);
            assert.deepEqual((await db.query('select id from teachers order by id')).rows.map(r => Number(r.id)), [1, 3]);
            await assert.rejects(db.query('select * from subject_assessments'), /permission denied/);
            await assert.rejects(save([entry('tahfidz')]), /permission denied/);
        });
        await t.test('Tahsin saves independently and cannot assess Tahfidz or another class', async () => {
            await login(tahsin);
            const rows = await save([entry('tahsin')]);
            assert.equal(rows[0].scores.tahsin_gharib, null);
            assert.equal(rows[0].scores.tahsin_makhraj, 0);
            await assert.rejects(save([entry('tahfidz')]), /Tidak ada penugasan/);
            await assert.rejects(save([entry('tahsin', '3')]), /Tidak ada penugasan/);
            assert.equal((await db.query("select * from subject_assessments where subject='tahfidz'")).rows.length, 0);
            assert.equal((await db.query('select * from periodic_assessments')).rows.length, 0);
        });
        await t.test('Tahfidz roster is scoped without giving master or attendance access', async () => {
            await login(tahfidz);
            const roster = (await db.query("select * from assessment_roster('2',$1,'tahfidz')", [year])).rows;
            assert.deepEqual(roster.map(r => r.id), ['1', '2']);
            assert.equal((await db.query("select * from assessment_roster('1',$1,'tahsin')", [year])).rows.length, 0);
            assert.equal((await db.query('select * from students')).rows.length, 0);
            assert.equal((await db.query('select * from attendance')).rows.length, 0);
            await assert.rejects(db.exec("insert into students values(6,'Fake','Guru B','1A')"), /row-level security/);
            await assert.rejects(db.exec("insert into attendance values(1,'Ahmad','Guru A','1A','2026-09-23','hadir')"), /row-level security/);
            assert.equal((await db.query('select * from teachers')).rows.length, 1);
            await db.exec("update teachers set foto='photo.png' where id=2");
            await assert.rejects(db.exec("update teachers set attendance_enabled=true where id=2"), /hanya dapat memperbarui foto/);
            await assert.rejects(db.query("select manage_teaching_assignment('create',null,'2','tahfidz','2A',$1)", [year]), /Hanya pengelola/);
        });
        await t.test('Tahfidz validates verse, saves independently, and requires manager legacy verification', async () => {
            await assert.rejects(save([{ ...entry('tahfidz'), tahfidz_ayah: 4 }]), /Surat atau ayat/);
            await assert.rejects(save([{ ...entry('tahfidz'), tahfidz_hafalan: 100.01 }]), /0-100/);
            const rows = await save([entry('tahfidz')]);
            assert.equal(rows[0].teacher_name, 'Ustadz B Lengkap');
            assert.equal(rows[0].scores.tahsin_makhraj, undefined);
            await assert.rejects(save([entry('tahfidz', '1', 1)]), /perlu diverifikasi/);
            await assert.rejects(db.exec("update subject_assessments set scores='{}'"), /permission denied/);
            await login(manager);
            const verified = await save([entry('tahfidz', '1', 1)]);
            assert.equal(verified[0].needs_review, false);
            assert.equal(verified[0].teacher_id, '2');
        });
        await t.test('a stale version rolls back the entire batch and assignment replacement preserves history', async () => {
            await login(tahfidz);
            await assert.rejects(save([{ ...entry('tahfidz', '1', 2), tahfidz_hafalan: 99 }, entry('tahfidz', '2', 5)]), /sudah berubah/);
            assert.equal((await db.query("select version from subject_assessments where student_id='1' and subject='tahfidz'")).rows[0].version, 2);
            await login(manager);
            const oldAssignment = (await db.query("select id from teaching_assignments where subject='tahfidz' and active")).rows[0].id;
            await db.query("select manage_teaching_assignment('end',$1)", [oldAssignment]);
            await db.query("select manage_teaching_assignment('create',null,'3','tahfidz','1A',$1)", [year]);
            await login(tahfidz);
            await assert.rejects(save([entry('tahfidz', '2', 1)]), /Tidak ada penugasan/);
            assert.equal((await db.query('select * from subject_assessments')).rows.length, 0);
            await login(manager);
            await save([{ ...entry('tahfidz', '2', 1), teacher_id: '3' }]);
            const history = (await db.query('select previous_record from subject_assessment_history')).rows;
            assert.equal(history.some(r => r.previous_record.needs_review && r.previous_record.teacher_id === null), true);
            assert.equal(history.some(r => r.previous_record.teacher_id === '2'), true);
            await assert.rejects(db.query('select * from save_periodic_assessments($1::jsonb)', [JSON.stringify([legacy])]), /permission denied/);
        });
        await t.test('rerunning migration does not reset grades or resurrect ended assignments', async () => {
            const ended = (await db.query("select id from teaching_assignments where subject='tahsin' and class_name='1A' and active")).rows[0].id;
            await db.query("select manage_teaching_assignment('end',$1)", [ended]);
            await db.exec('reset role');
            await db.exec(sql('subject-assignments.sql'));
            assert.equal((await db.query("select version from subject_assessments where student_id='1' and subject='tahfidz'")).rows[0].version, 2);
            assert.equal((await db.query("select * from teaching_assignments where subject='tahsin' and class_name='1A' and active")).rows.length, 0);
        });
        await t.test('updated Tahsin roster follows master across classes without assignments', async () => {
            await db.exec('reset role');
            await db.exec(sql('assessment-rosters.sql'));
            await login(tahsin);
            const roster = (await db.query("select * from assessment_roster('1',$1,'tahsin')", [year])).rows;
            assert.deepEqual(roster.map(row => row.id), ['1', '2', '4']);
            const nextYear = (await db.query("select * from assessment_roster('1',$1,'tahsin')", [year + 1])).rows;
            assert.deepEqual(nextYear.map(row => row.id), ['1', '2', '4']);
            const saved = await save([entry('tahsin', '4')]);
            assert.equal(saved[0].assignment_id, null);
            assert.equal(saved[0].teacher_id, '1');
            await assert.rejects(save([entry('tahsin', '5')]), /Tidak ada penugasan/);
            await login(tahfidz);
            assert.equal((await db.query("select * from assessment_roster('2',$1,'tahsin')", [year])).rows.length, 0);
        });
        await t.test('Tahfidz groups accept individual pupils across classes and preserve old memberships', async () => {
            await login(manager);
            const migrated = (await db.query("select * from assessment_roster('3',$1,'tahfidz')", [year])).rows;
            assert.deepEqual(migrated.map(row => row.id), ['1', '2']);
            await db.query("select manage_tahfidz_group('create',null,'2','Lintas kelas',$1,array['3','4'])", [year]);
            await assert.rejects(db.query("select manage_tahfidz_group('create',null,'1','Duplikat',$1,array['3','5'])", [year]), /sudah memiliki kelompok/);
            assert.equal((await db.query("select * from teaching_assignments where class_name='Duplikat'")).rows.length, 0);
            await assert.rejects(db.query("select manage_teaching_assignment('create',null,'1','tahsin','3A',$1)", [year]), /permission denied/);
            await login(tahfidz);
            const roster = (await db.query("select * from assessment_roster('2',$1,'tahfidz')", [year])).rows;
            assert.deepEqual(roster.map(row => row.id), ['3', '4']);
            assert.deepEqual(roster.map(row => row.kelas), ['2A', '3A']);
            await save([entry('tahfidz', '3')]);
            await assert.rejects(save([entry('tahfidz', '5')]), /Tidak ada penugasan/);
            await assert.rejects(db.query("select manage_tahfidz_group('create',null,'2','Ilegal',$1,array['5'])", [year]), /Hanya pengelola/);
            assert.equal((await db.query('select * from students')).rows.length, 0);
            await login(manager);
            const group = (await db.query("select id from teaching_assignments where class_name='Lintas kelas'")).rows[0].id;
            await db.query("select manage_tahfidz_group('end',$1)", [group]);
            await login(tahfidz);
            assert.equal((await db.query("select * from assessment_roster('2',$1,'tahfidz')", [year])).rows.length, 0);
            await assert.rejects(save([entry('tahfidz', '3', 1)]), /Tidak ada penugasan/);
            await db.exec('reset role');
            await db.exec(sql('assessment-rosters.sql'));
            assert.equal((await db.query("select * from assessment_group_members where assignment_id=$1 and active", [group])).rows.length, 0);
            assert.equal((await db.query("select * from subject_assessments where student_id='3' and subject='tahfidz'")).rows.length, 1);
        });
        await t.test('one teacher can hold two active groups with pupils from different classes', async () => {
            await login(manager);
            await db.query("select manage_tahfidz_group('create',null,'2','Kelompok Satu',$1,array['3'])", [year]);
            await db.query("select manage_tahfidz_group('create',null,'2','Kelompok Dua',$1,array['4'])", [year]);
            await login(tahfidz);
            assert.deepEqual((await db.query("select * from assessment_roster('2',$1,'tahfidz')", [year])).rows.map(row => row.id), ['3', '4']);
        });
        await t.test('account provisioning is service-only, checks manager, and creates teacher role atomically', async () => {
            await db.exec('reset role');
            await db.exec('create role service_role bypassrls; alter table teachers alter column id add generated by default as identity (start with 1000)');
            const account = '00000000-0000-0000-0000-000000000099';
            const other = '00000000-0000-0000-0000-000000000098';
            await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [account, 'new@example.test', other, 'other@example.test']);
            await db.exec(sql('teacher-enrollment.sql'));
            await login(manager);
            await assert.rejects(db.query("select provision_teacher_account($1,$2,null,'Guru D','Guru D Lengkap',false)", [manager, account]), /permission denied/);
            await db.exec('reset role; set role service_role');
            await assert.rejects(db.query("select provision_teacher_account($1,$2,null,'Guru D','Guru D Lengkap',false)", [tahsin, account]), /Hanya pengelola/);
            const created = (await db.query("select provision_teacher_account($1,$2,null,'Guru D','Guru D Lengkap',false) as teacher", [manager, account])).rows[0].teacher;
            await db.exec('reset role');
            const role = (await db.query('select * from user_roles where user_id=$1', [account])).rows[0];
            assert.equal(role.role, 'guru');
            assert.equal(role.teacher_id, created);
            assert.equal((await db.query('select attendance_enabled from teachers where id::text=$1', [created])).rows[0].attendance_enabled, false);
            await db.exec('set role service_role');
            await assert.rejects(db.query("select provision_teacher_account($1,$2,null,'Guru D','Guru D Lagi',true)", [manager, other]), /sudah ada/);
            await db.exec('reset role');
            assert.equal((await db.query('select * from user_roles where user_id=$1', [other])).rows.length, 0);
        });
        await t.test('teacher deletion revokes access, requires Auth deletion, and finishes without deleting pupils', async () => {
            await db.exec('reset role');
            await db.exec(sql('account-deletion.sql'));
            await login(manager);
            await assert.rejects(db.query("select prepare_account_deletion($1,'teacher','2')", [manager]), /permission denied/);
            await db.exec('reset role');
            await assert.rejects(db.query("select prepare_account_deletion($1,'teacher','1')", [manager]), /akun sendiri/);
            const job = (await db.query("select (prepare_account_deletion($1,'teacher','2')).*", [manager])).rows[0];
            assert.equal((await db.query('select * from user_roles where user_id=$1', [tahfidz])).rows.length, 0);
            assert.equal((await db.query('select * from teachers where id=2')).rows.length, 1);
            await assert.rejects(db.query('select finish_account_deletion($1,$2)', [manager, job.id]), /belum seluruhnya/);
            await assert.rejects(db.query("insert into user_roles values($1,'guru','2')", [tahfidz]), /proses penghapusan/);
            await db.query('delete from auth.users where id=$1', [tahfidz]);
            await db.query('select finish_account_deletion($1,$2)', [manager, job.id]);
            assert.equal((await db.query('select * from teachers where id=2')).rows.length, 0);
            assert.ok((await db.query('select * from students')).rows.length > 0);
            assert.equal((await db.query('select complete from account_deletion_jobs where id=$1', [job.id])).rows[0].complete, true);
        });
        await t.test('Excel import feeds the existing Tahfidz assessment roster without changing Tahsin', async () => {
            await db.exec('reset role');
            await db.exec(sql('student-import.sql'));
            await login(manager);
            const imported = (await db.query('select import_students($1::jsonb,$2) as result', [JSON.stringify([{ nama: 'Dani', nis: '0004', nisn: '', kelas: 'III A', guru: 'Guru A', guru_tahfidz: 'Guru C', row: 2 }]), year + 1])).rows[0].result;
            assert.equal(imported.tahfidz_added, 1);
            const roster = (await db.query("select * from assessment_roster('3',$1,'tahfidz')", [year + 1])).rows;
            assert.ok(roster.some(row => row.id === '4'));
            assert.equal((await db.query('select "nama guru" as guru from students where id=4')).rows[0].guru, 'Guru A');
        });
    }
    finally {
        await db.close();
    }
});
