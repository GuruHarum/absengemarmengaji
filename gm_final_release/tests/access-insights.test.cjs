"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
async function access(role, teacherError = null, attendanceEnabled = true) {
    const ctx = vm.createContext({ console });
    ctx.window = ctx;
    ctx.document = { readyState: 'loading', addEventListener() { } };
    ctx.supabase = {
        auth: { getUser: async () => ({ data: { user: { id: 'account-1' } } }) },
        from(table) {
            return { select() { return this; }, eq() { return this; },
                maybeSingle: async () => ({ data: role ? { role, teacher_id: '42' } : null }),
                single: async () => ({ data: teacherError ? null : { id: 42, nama: 'Guru A', attendance_enabled: attendanceEnabled }, error: teacherError })
            };
        }
    };
    vm.runInContext(read('js/access.js'), ctx);
    return ctx.AppAccess;
}
test('admin and coordinator can access every panel section', async () => {
    for (const role of ['admin', 'koordinator']) {
        const api = await access(role);
        await api.ready;
        for (const page of ['absensi', 'kelola', 'penilaian', 'infografik', 'pengaturan', 'maintenance'])
            assert.equal(api.canPage(page), true);
        assert.equal(api.full(), true);
    }
});
test('teacher pages and master-data queries are restricted to the mapped teacher', async () => {
    const api = await access('guru');
    await api.ready;
    assert.equal(api.full(), false);
    assert.equal(api.canPage('absensi'), true);
    assert.equal(api.canPage('kelola'), true);
    assert.equal(api.canPage('penilaian'), true);
    for (const page of ['infografik', 'pengaturan', 'maintenance'])
        assert.equal(api.canPage(page), false);
    const query = { eq: (column, value) => [column, value] };
    assert.deepEqual(api.scope(query, 'students'), ['nama guru', 'Guru A']);
    assert.deepEqual(api.scope(query, 'teachers'), ['id', '42']);
    assert.deepEqual(api.scope(query, 'attendance'), ['teacher', 'Guru A']);
});
test('a coordinator retains manager access and also resolves the linked teacher', async () => {
    const api = await access('koordinator');
    await api.ready;
    assert.equal(api.full(), true);
    assert.equal(api.profile.teacher_id, '42');
    assert.equal(api.profile.teacherName, 'Guru A');
    assert.equal(api.canPage('penilaian'), true);
    assert.equal(api.canPage('pengaturan'), true);
});
test('missing roles and invalid teacher mappings fail closed', async () => {
    for (const role of [null, 'superuser']) {
        const api = await access(role);
        await assert.rejects(api.ready, /belum diberi hak akses/);
        assert.equal(api.canPage('pengaturan'), false);
    }
    const api = await access('guru', new Error('not found'));
    await assert.rejects(api.ready, /belum terhubung/);
});
function insight() {
    const ctx = vm.createContext({});
    vm.runInContext(read('js/insights.js'), ctx);
    return ctx.buildAttendanceInsights;
}
test('comparison separates duplicate names across teachers/classes and ignores out-of-period records', () => {
    const calculate = insight();
    const students = [
        { 'nama guru': 'A', kelas: '1A', 'nama siswa': 'Ahmad' },
        { 'nama guru': 'B', kelas: '1B', 'nama siswa': 'Ahmad' }
    ];
    const result = calculate(students, [
        { date: '2026-09-01', teacher: 'A', class: '1A', student: 'Ahmad', status: 'hadir' },
        { date: '2026-09-01', teacher: 'B', class: '1B', student: 'Ahmad', status: 'izin' },
        { date: '2026-08-01', teacher: 'A', class: '1A', student: 'Ahmad', status: 'alpha' },
        { date: '2026-09-01', teacher: 'Other', class: '1A', student: 'Ahmad', status: 'alpha' }
    ], '2026-09-01', '2026-09-30', null, '2026-09-30');
    assert.equal(result.totals.recorded, 2);
    assert.equal(result.rate, 1 / 60 * 100);
    assert.equal(result.rows[0].name, '1A');
    assert.equal(result.rows[0].rate, 1 / 30 * 100);
    assert.equal(result.rows[1].rate, 0);
});
test('missing calendar days count as alpha including weekends; duplicate records count once', () => {
    const calculate = insight();
    const students = [
        { 'nama guru': 'A', kelas: '1A', 'nama siswa': 'One' },
        { 'nama guru': 'A', kelas: '1A', 'nama siswa': 'Two' },
        { 'nama guru': 'B', kelas: '2A', 'nama siswa': 'Three' }
    ];
    const row = { date: '2026-09-01', teacher: 'A', class: '1A', student: 'One', status: 'H' };
    const result = calculate(students, [row, row], '2026-09-01', '2026-09-30', null, '2026-09-30');
    assert.equal(result.totals.recorded, 1);
    assert.equal(result.totals.missing, 89);
    assert.equal(result.totals.alpha, 89);
    assert.equal(result.rows[1].days, 30);
    assert.equal(result.rows[1].rate, 0);
});
test('unrecognized statuses count as not filled and alpha', () => {
    const result = insight()([{ 'nama guru': 'A', kelas: '1A', 'nama siswa': 'One' }], [
        { date: '2026-09-01', teacher: 'A', class: '1A', student: 'One', status: 'unknown' }
    ], '2026-09-01', '2026-09-30', null, '2026-09-30');
    assert.equal(result.totals.missing, 30);
    assert.equal(result.totals.alpha, 30);
});
test('Tahfidz-only teacher has assessment access without the attendance panel', async () => {
    const api = await access('guru', null, false);
    await api.ready;
    assert.equal(api.canPage('penilaian'), true);
    assert.equal(api.canPage('absensi'), false);
    assert.equal(api.canPage('pengaturan'), false);
});
test('multiple nonadjacent months use calendar days, leap years and exclude future dates', () => {
    const students = [{ 'nama guru': 'A', kelas: '1A', 'nama siswa': 'One' }];
    const records = [{ date: '2024-02-29', teacher: 'A', class: '1A', student: 'One', status: 'H' }, { date: '2024-03-01', teacher: 'A', class: '1A', student: 'One', status: 'H' }, { date: '2024-04-01', teacher: 'A', class: '1A', student: 'One', status: 'I' }];
    const result = insight()(students, records, '2024-02-01', '2024-04-30', ['02', '04'], '2024-04-02');
    assert.equal(result.days, 31);
    assert.equal(result.totals.total, 31);
    assert.equal(result.totals.hadir, 1);
    assert.equal(result.totals.izin, 1);
    assert.equal(result.totals.alpha, 29);
    assert.equal(result.rate, 100 / 31);
    const future = insight()(students, records, '2024-05-01', '2024-05-31', ['05'], '2024-04-02');
    assert.equal(future.days, 0);
    assert.equal(future.rate, null);
});
test('only managers can manage Tahfidz groups while every approved role can open its profile', async () => {
    for (const role of ['admin', 'koordinator', 'guru']) {
        const api = await access(role);
        await api.ready;
        assert.equal(api.canPage('profil'), true);
        assert.equal(api.canPage('kelompok'), role !== 'guru');
    }
});
test('report page is restricted explicitly to coordinators', async () => {
    for (const role of ['admin', 'guru', 'koordinator']) {
        const api = await access(role);
        await api.ready;
        assert.equal(api.canPage('rapor'), role === 'koordinator');
    }
});
