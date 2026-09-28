"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = '.';
const html = fs.readFileSync(`${root}/admin.html`, 'utf8');
const context = vm.createContext({});
context.window = context;
for (const file of ['quran-surahs', 'report-reference', 'report-core'])
    vm.runInContext(fs.readFileSync(`${root}/js/${file}.js`, 'utf8'), context);
const R = context.ReportCore;
test('a student with both subjects missing appears once with both subjects', () => {
    const student = { id: 7, name: 'Siswa Uji', class: '1 A' };
    const grouped = R.missingByStudent([{ student, teachers: { tahsin: 'Guru A', tahfidz: 'Guru B' } }]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].programs.length, 2);
    assert.deepEqual(Array.from(grouped[0].programs, p => p.teacher), ['Guru A', 'Guru B']);
});
test('names cannot merge different students, and program-only gaps do not duplicate pupils', () => {
    const entries = [
        { student: { id: 1, name: 'Nama Sama', class: '1 A' },
            tahsin: { scores: { tahsin_progress_type: 'BUKU', tahsin_book_number: 1,
                    tahsin_makhraj: 75, tahsin_tartil: 75 } } },
        { student: { id: 2, name: 'Nama Sama', class: '1 B' },
            tahsin: { scores: { tahsin_progress_type: 'BUKU', tahsin_book_number: 1,
                    tahsin_makhraj: 75, tahsin_tartil: 75 } } }
    ];
    const grouped = R.missingByStudent(entries);
    assert.equal(grouped.length, 2);
    assert.ok(grouped.every(g => g.programs.length === 1 && g.programs[0].subject === 'tahfidz'));
});
test('Book 1 Tajwid/Gharib never reported; Finishing Gharib reported', () => {
    const book = { tahsin_progress_type: 'BUKU', tahsin_book_number: 1,
        tahsin_makhraj: 75, tahsin_tartil: 75 };
    assert.equal(R.check(book, 'tahsin').missing.length, 0);
    const finishing = { ...book, tahsin_progress_type: 'FINISHING', tahsin_tajwid: 75 };
    assert.deepEqual(Array.from(R.check(finishing, 'tahsin').missing), ['tahsin_gharib']);
});
test('Raport checks list four columns, one identity audit, separate school page and three settings categories', () => {
    assert.match(html, /<th>Nama siswa<\/th><th>Kelas\/rombel<\/th><th>Aspek nilai kosong<\/th><th>Guru terkait<\/th>/);
    assert.match(html, /id="reportDataAudit"/);
    for (const section of ['page-identitas', 'settingsViewReport', 'settingsViewAccounts', 'settingsViewReference']) {
        assert.equal((html.match(new RegExp(`id="${section}"`, 'g')) || []).length, 1, section);
    }
    assert.match(html, /id="page-identitas"[\s\S]*id="schoolSettingsForm"[\s\S]*id="page-pengaturan"/);
    assert.doesNotMatch(html, /data-settings-view="school"/);
    const sidebar = html.match(/<nav class="admin-navigation"[\s\S]*?<\/nav>/)[0];
    for (const section of ['KEHADIRAN', 'PEMBELAJARAN', 'PENGATURAN'])
        assert.ok(sidebar.includes(section));
    for (const id of ['report-principal_name', 'report-coordinator_name', 'settingsSchoolLogo', 'accountRows', 'referenceSurah'])
        assert.ok(html.includes(`id="${id}"`), `preserve ${id}`);
});
test('PDF renders the resolved program teacher and centres text inside its cell', () => {
    const code = fs.readFileSync('js/report-pdf.js', 'utf8');
    assert.match(code, /report\.teachers\?\.\[sub\]\s*\|\|\s*row\?\.teacher_name/);
    assert.match(code, /const firstY\s*=\s*y\s*\+\s*\(h\s*-\s*total\)\s*\/\s*2/);
});


test('PDF preserves original capitalization for people names and academic degrees', () => {
    const code = fs.readFileSync('js/report-pdf.js', 'utf8');
    assert.match(code, /NAMA : ' \+ student\.name[\s\S]{0,120}preserveCase: true/);
    assert.match(code, /GURU PEMBIMBING : ' \+ actualTeacher[\s\S]{0,120}preserveCase: true/);
    assert.match(code, /text\(name \|\| '', x, 280, 60, 7, \{[\s\S]{0,120}preserveCase: true/);
});
