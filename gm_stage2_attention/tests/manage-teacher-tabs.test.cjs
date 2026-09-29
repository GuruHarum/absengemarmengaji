"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const src = fs.readFileSync('js/dashboard.js', 'utf8');
test('teacher tabs separate Tahfidz-only identities and retain shared teachers in Tahsin', () => {
    const nodes = {};
    const ctx = vm.createContext({ document: { getElementById: id => nodes[id] ||= ({ setAttribute(name, value) { this[name] = value; }, className: '' }) } });
    vm.runInContext("let currentManageTab='siswa',currentTeacherGroup='tahsin',managePage=1;let studentsData=[{id:10}],teachersData=[{id:1,attendance_enabled:true},{id:2,attendance_enabled:false},{id:3}];function renderManageTable(){};" + src.slice(src.indexOf('function getManageData()'), src.indexOf('function getManageTitle(')) + src.slice(src.indexOf('function switchManageTab('), src.indexOf('async function openManageModal(')), ctx);
    vm.runInContext("switchManageTab('guru-tahsin')", ctx);
    assert.deepEqual(Array.from(vm.runInContext('getManageData().map(r=>r.id)', ctx)), [1, 3]);
    assert.equal(nodes['tab-guru-tahsin']['aria-pressed'], 'true');
    assert.equal(nodes['tab-guru-tahfidz']['aria-pressed'], 'false');
    vm.runInContext("switchManageTab('guru-tahfidz')", ctx);
    assert.deepEqual(Array.from(vm.runInContext('getManageData().map(r=>r.id)', ctx)), [2]);
    assert.equal(nodes['tab-guru-tahsin']['aria-pressed'], 'false');
    vm.runInContext("switchManageTab('siswa')", ctx);
    assert.deepEqual(Array.from(vm.runInContext('getManageData().map(r=>r.id)', ctx)), [10]);
});
test('unified importer uses preview before write and keeps its template across repeated uploads', async () => {
    const nodes = {};
    const node = id => nodes[id] ||= { value: '', disabled: false, hidden: false, files: [], textContent: '', addEventListener() {} };
    node('studentImportYear').value = '2026';
    const calls = [];
    const ctx = vm.createContext({
        document: { getElementById: node },
        AppAccess: { teacher: () => false, full: () => true },
        StudentImport: { read: async file => [{ row: 2, nama: file.name, nis: '1', nisn: '', kelas: '1A', guru: 'Guru A', guru_tahfidz: '' }], auditFileDuplicates: () => ({ can_import: true, rows: [], groups: [] }) },
        supabase: { rpc: async (name, args) => {
            calls.push(name);
            if (name === 'preview_import_students') return { data: { token: 'abc', can_import: true, summary: { new: 1, update: 0, unchanged: 0, review: 0, conflict: 0, teacher_new: 0 }, rows: [{ row: 2, nama: 'Ali', kelas: '1A', action: 'new', reason: 'baru', teacher_status: 'cocok', tahfidz_status: 'kosong' }] } };
            assert.equal(args.preview_token, 'abc');
            return { data: { created: 1, updated: 0, unchanged: 0, tahfidz_added: 0, teachers_created: 0 } };
        } },
        getStudents: async () => [], getTeachers: async () => [],
        AdminNotice: { notify() {}, confirm: async () => true }, Date
    });
    vm.runInContext(src.slice(src.indexOf('function refreshManageImportControls()'), src.indexOf('function switchManageTab')), ctx);
    vm.runInContext('function renderManageTable(){refreshManageImportControls();}\n' + src.slice(src.indexOf('let studentImportPreview = null;'), src.indexOf("\ndocument.addEventListener('panelready'", src.indexOf('let studentImportPreview = null;'))), ctx);
    for (const name of ['first.xlsx', 'second.xls']) {
        node('csvImportFile').files = [{ name, size: 10, lastModified: name.length }];
        await ctx.importManageCsv();
        assert.equal(node('csvImportBtn').textContent, 'Proses Impor Aman');
        await ctx.importManageCsv();
        assert.equal(node('csvImportFile').accept, '.xlsx,.xls,.csv');
        assert.equal(node('studentTemplateDownload').hidden, false);
    }
    assert.deepEqual(calls, ['preview_import_students','import_students','preview_import_students','import_students']);
    assert.ok(!fs.readFileSync('admin.html', 'utf8').includes('manageImportType'));
});

test('import review panel is persistent and blocking notification stays generic', () => {
    const html = fs.readFileSync('admin.html', 'utf8');
    const dashboard = fs.readFileSync('js/dashboard.js', 'utf8');
    assert.match(html, /Hasil pemeriksaan file impor/);
    assert.match(html, /Belum ada hasil pemeriksaan/);
    assert.match(dashboard, /AdminNotice\.notify\('File impor perlu diperiksa', 'error'\)/);
    assert.match(dashboard, /FILE IMPOR PERLU DIPERIKSA/);
});
