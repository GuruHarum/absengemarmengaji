"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const XLSX = require('../js/vendor/xlsx.full.min.js');
const ctx = vm.createContext({ XLSX });
ctx.window = ctx;
vm.runInContext(fs.readFileSync('js/student-import.js', 'utf8'), ctx);
const importer = ctx.StudentImport;
test('headers ignore case, order and surrounding spaces; identifiers retain leading zeroes', () => {
    const rows = importer.parseRows([['NISN', ' NAMA ', 'guru TAHSIN', 'kelas', 'nis', 'GURU TAHFIDZ'], ['0012345678', 'Ali', 'Guru A', 'IV B', '00017']]);
    assert.equal(rows[0].nis, '00017');
    assert.equal(rows[0].nisn, '0012345678');
    assert.equal(rows[0].kelas, '4B');
    assert.throws(() => importer.parseRows([['nama', 'NIS', 'nis', 'kelas', 'guru tahsin']]), /Judul kolom/);
});
test('Roman class normalization handles all twelve levels and letter classes', () => {
    ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'].forEach((value, index) => {
        assert.equal(importer.normalizeClass('Kelas ' + value + ' A'), `${index + 1}A`);
        assert.equal(importer.normalizeClass(value + 'B'), `${index + 1}B`);
    });
    assert.equal(importer.normalizeClass('4 a'), '4A');
});
test('CSV quoted commas, semicolon separators and empty identifier columns import correctly', async () => {
    for (const csv of ['Nama,NIS,NISN,Kelas,Guru Tahsin,Guru Tahfidz\n"Ali, Ahmad",0001,,II A,Guru A', 'NAMA;NIS;NISN;KELAS;GURU TAHSIN;GURU TAHFIDZ\n"Ali, Ahmad";0001;;II A;Guru A']) {
        const result = await importer.read({ name: 'siswa.csv', size: csv.length, text: async () => csv });
        assert.equal(result[0].nama, 'Ali, Ahmad');
        assert.equal(result[0].nis, '0001');
        assert.equal(result[0].nisn, '');
        assert.equal(result[0].kelas, '2A');
    }
});
test('Excel template has correct empty input sheet and text-formatted identifiers', async () => {
    const buffer = fs.readFileSync('assets/template-siswa.xlsx');
    const book = XLSX.read(buffer, { type: 'buffer', cellNF: true, sheetStubs: true });
    assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets.Siswa, { header: 1, blankrows: false }), [['Nama', 'NIS', 'NISN', 'Kelas', 'Guru Tahsin', 'Guru Tahfidz']]);
    assert.equal(book.Sheets.Siswa.B2.z, '@');
    assert.equal(book.Sheets.Petunjuk.B11.v, '00123');
    assert.equal(book.Sheets.Petunjuk.C11.v, '0012345678');
    XLSX.utils.sheet_add_aoa(book.Sheets.Siswa, [['Ali', '0001', '0012345678', 'III', 'Guru A', 'Guru B']], { origin: 'A2' });
    const file = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
    const result = await importer.read({ name: 'siswa.xlsx', size: file.byteLength, arrayBuffer: async () => file });
    assert.equal(result[0].nis, '0001');
    assert.equal(result[0].kelas, '3');
    assert.equal(result[0].guru_tahfidz, 'Guru B');
});
test('invalid or oversized data is rejected before contacting the database', async () => {
    assert.throws(() => importer.parseRows([['Nama', 'NIS', 'NISN', 'Kelas', 'Guru Tahsin', 'Guru Tahfidz'], ['Ali', '1e9', '', '1', 'Guru A']]), /NIS/);
    await assert.rejects(importer.read({ name: 'data.exe', size: 1 }), /Excel/);
    await assert.rejects(importer.read({ name: 'data.xlsx', size: 6 * 1024 * 1024 }), /5 MB/);
});
test('NIS/NISN boleh kosong; nama kelas guru Tahsin tetap wajib', () => {
    const headers = ['Nama', 'NIS', 'NISN', 'Kelas', 'Guru Tahsin', 'Guru Tahfidz'];
    const rows=importer.parseRows([headers,['Ali','000123','','4A','Guru A',''],['Budi','','','4B','Guru B','']]);
    assert.equal(rows[0].nis, '000123');
    assert.equal(rows[1].nis, '');
    assert.equal(rows[1].nisn, '');
    assert.throws(() => importer.parseRows([headers, ['', '12', '', '4A', 'Guru A', '']]), /Nama/);
});
test('named classes retain word boundaries and use title case', () => {
    for (const value of ['kelas I UMAR BIN KHATTAB', 'i umar bin khattab', 'I Umar BIN Khattab']) {
        assert.equal(importer.normalizeClass(value), '1 Umar Bin Khattab');
    }
    assert.equal(importer.normalizeClass('II   ABU BAKAR'), '2 Abu Bakar');
});
test('historical class alias Khottob is canonicalized to Khattab to avoid duplicate class labels', () => {
    assert.equal(importer.normalizeClass('1 Umar Bin Khottob'), '1 Umar Bin Khattab');
    assert.equal(importer.normalizeClass('Kelas I Umar Bin Khottob'), '1 Umar Bin Khattab');
});
test('duplicate NISN in one file is preserved for full-file server analysis', () => {
    const headers = ['Nama', 'NIS', 'NISN', 'Kelas', 'Guru Tahsin', 'Guru Tahfidz'];
    const rows = importer.parseRows([
        headers,
        ['Ali', '1001', '3001', '1 A', 'Guru A', ''],
        ['Budi', '1002', '3001', '1 B', 'Guru B', '']
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].nisn, '3001');
    assert.equal(rows[1].nisn, '3001');
});
test('server importer requires preview and never auto-deletes duplicate students', () => {
    const sql = fs.readFileSync('supabase/student-import.sql', 'utf8');
    assert.match(sql, /preview_import_students/);
    assert.match(sql, /preview_token/);
    assert.match(sql, /Impor diblokir: jalankan Analisis File terbaru/);
    assert.doesNotMatch(sql, /delete\s+from\s+public\.students\s+where\s+id=duplicate_id/i);
    assert.match(sql, /Perbarui ID lama berdasarkan nama\+kelas yang unik; ID baru tidak dibuat/);
});

test('server preview reports repeated file identifiers as row conflicts instead of aborting the whole preview', () => {
    const sql = fs.readFileSync('supabase/student-import.sql', 'utf8');
    assert.match(sql, /NIS berulang dalam file pada lebih dari satu baris/);
    assert.match(sql, /NISN berulang dalam file pada lebih dari satu baris/);
    assert.doesNotMatch(sql, /raise exception 'NISN berulang dalam file/);
});
