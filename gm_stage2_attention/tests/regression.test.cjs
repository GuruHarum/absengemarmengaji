"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function context() {
    const ctx = vm.createContext({ console, Map, Date });
    ctx.window = ctx;
    ctx.__gemarMengajiRealtimeChannel = true;
    vm.runInContext("let attendanceData = []; let attendanceIndex = new Map(); let selectedTeacher = 'Guru A';", ctx);
    vm.runInContext(read('js/utils.js'), ctx);
    vm.runInContext(read('js/database.js'), ctx);
    return ctx;
}
test('all JavaScript and page script sequences parse with local dependencies present', () => {
    for (const file of fs.readdirSync(path.join(root, 'js'))) {
        if (file.endsWith('.js'))
            new vm.Script(read('js/' + file), { filename: file });
    }
    for (const page of ['index.html', 'admin.html', 'login.html', 'maintenance.html']) {
        const scripts = [...read(page).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(match => {
            const src = match[1].match(/src="([^"]+)"/);
            return src ? (/^https?:/.test(src[1]) ? '' : read(src[1].split('?')[0])) : match[2];
        });
        new vm.Script(scripts.join('\n;\n'), { filename: page });
    }
});
test('saved rows are immediately available for editing without waiting for realtime', () => {
    const ctx = context();
    vm.runInContext(`cacheAttendanceRecord({id: 1, date: '2026-09-23', teacher: 'Guru A', student: 'Siswa A', status: 'hadir'});`, ctx);
    assert.equal(vm.runInContext('attendanceData.length', ctx), 1);
    assert.equal(ctx.isAttendanceRecorded('Siswa A', '2026-09-23'), true);
    assert.equal(ctx.isAttendanceRecorded('Siswa A', '2026-09-24'), false);
    assert.equal(ctx.isAttendanceRecorded('Siswa B', '2026-09-23'), false);
});
test('repeated save/realtime responses do not duplicate rows and changed keys are removed', () => {
    const ctx = context();
    const row = { id: 1, date: '2026-09-23', teacher: 'Guru A', student: 'Siswa A', status: 'hadir' };
    ctx.cacheAttendanceRecord(row);
    ctx.cacheAttendanceRecord({ ...row, id: '1', status: 'izin' });
    assert.equal(vm.runInContext('attendanceData.length', ctx), 1);
    assert.equal(ctx.getAttendanceRecord('Siswa A', row.date).status, 'izin');
    ctx.cacheAttendanceRecord({ ...row, date: '2026-09-24' });
    assert.equal(ctx.isAttendanceRecorded('Siswa A', row.date), false);
    assert.equal(ctx.isAttendanceRecorded('Siswa A', '2026-09-24'), true);
});
test('database edits/deletes reject missing rows and preserve server errors', async () => {
    const ctx = context();
    let response;
    const query = { update() { return this; }, delete() { return this; }, eq() { return this; }, select() { return this; }, maybeSingle() { return Promise.resolve(response); } };
    ctx.supabase = { from: () => query };
    for (const operation of ['updateAttendance', 'deleteAttendance']) {
        response = { data: null, error: null };
        await assert.rejects(ctx[operation](1, {}), /tidak ditemukan/);
        const error = new Error('Permission denied');
        response = { data: null, error };
        await assert.rejects(ctx[operation](1, {}), /Permission denied/);
        response = { data: { id: 1 }, error: null };
        assert.equal((await ctx[operation](1, {})).id, 1);
    }
});
test('HTML text and attribute values are escaped without losing ordinary names', () => {
    const ctx = context();
    assert.equal(ctx.escapeHtml(`A & B <img src=x> " ' `), 'A &amp; B &lt;img src=x&gt; &quot; &#39; ');
    assert.equal(ctx.escapeHtml('Ahmad'), 'Ahmad');
    assert.equal(ctx.escapeHtml(null), '');
});
test('attendance filters use real column names and remain scoped to the chosen class', () => {
    const ctx = context();
    const filters = { filterYear: '2026', filterMonth: '09', filterTeacher: 'Guru A', filterClassNumber: '1', filterClassName: '1A' };
    ctx.document = { getElementById: id => ({ value: filters[id] || '' }) };
    ctx.teachersData = [{ id: 7, nama: 'Guru A' }];
    const source = read('js/admin.js');
    vm.runInContext(source.slice(source.indexOf('function getFilteredAttendanceRecords'), source.indexOf('async function filterAttendanceData')), ctx);
    const row = { date: '2026-09-23', teacher: 'Guru A', class: '1A' };
    const rows = [row, { ...row, class: '1B' }, { ...row, teacher: 'Guru B' }, { ...row, date: '2025-09-23' }];
    assert.equal(ctx.getFilteredAttendanceRecords(rows).length, 1);
    filters.filterTeacher = '7';
    assert.equal(ctx.getFilteredAttendanceRecords(rows).length, 1);
    filters.filterClassName = '';
    assert.equal(ctx.getFilteredAttendanceRecords(rows).length, 2);
});
test('dashboard has only one active definition for each management action', () => {
    const source = read('js/dashboard.js');
    for (const name of ['switchPage', 'renderManageTable', 'switchManageTab', 'openManageModal', 'handleFormSubmit', 'deleteData']) {
        assert.equal([...source.matchAll(new RegExp('function ' + name + '\\(', 'g'))].length, 1, name);
    }
});
test('monthly reports respect selected years, leap days, and teacher/student records', () => {
    const ctx = context();
    const elements = Object.fromEntries(['filterMonth', 'filterTeacher', 'filterClassNumber', 'filterClassName', 'filterYear', 'reportMonth', 'reportTeacher', 'reportClass', 'monthlyReportTable', 'reportAverage'].map(id => [id, { value: '' }]));
    elements.filterYear.value = '2024';
    ctx.document = { getElementById: id => elements[id] || null };
    ctx.studentsData = [{ 'nama siswa': 'Z & A', 'nama guru': 'Guru A', kelas: '1A' }];
    ctx.cacheAttendanceRecord({ id: 1, date: '2024-02-29', teacher: 'Guru A', student: 'Z & A', class: '1A', status: 'hadir' });
    vm.runInContext(read('js/report.js'), ctx);
    for (const teacher of ['', 'Guru A']) {
        ctx.generateMonthlyReport('02', teacher, '1', '1A');
        assert.equal(elements.reportMonth.textContent, 'Februari 2024');
        assert.match(elements.monthlyReportTable.innerHTML, /date-header">29<\/th>/);
        assert.match(elements.monthlyReportTable.innerHTML, /status-H">H<\/td>/);
        assert.match(elements.monthlyReportTable.innerHTML, /Z &amp; A/);
    }
    ctx.generateMonthlyReport('02', '', '1', '1A', 2025);
    assert.equal(elements.reportMonth.textContent, 'Februari 2025');
    assert.doesNotMatch(elements.monthlyReportTable.innerHTML, /date-header">29<\/th>/);
});
