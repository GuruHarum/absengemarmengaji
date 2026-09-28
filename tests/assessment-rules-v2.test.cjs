"use strict";
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const c = vm.createContext({});
c.window = c;
for (const f of ['quran-surahs', 'report-reference', 'report-core', 'progress-form', 'assessments-core'])
    vm.runInContext(fs.readFileSync('js/' + f + '.js', 'utf8'), c);
const R = c.ReportCore;
const base = { tahsin_makhraj: 80, tahsin_tajwid: 90, tahsin_tartil: 100, tahsin_gharib: 10, tahsin_progress_type: 'BUKU', tahsin_book_number: 1, tahsin_page: 30 };
test('Buku 1 excludes historical Tajwid/Gharib and requires both active aspects', () => { const v = { ...base, tahsin_tajwid: null, tahsin_gharib: null }; assert.equal(R.stats(v, 'tahsin').complete, true); assert.equal(R.stats(base, 'tahsin').average, 90); for (const k of ['tahsin_makhraj', 'tahsin_tartil'])
    assert.ok(R.check({ ...v, [k]: null }, 'tahsin').missing.includes(k)); });
for (const type of ['BUKU 2', 'BUKU 3', 'JILID', "AL-QUR'AN", 'SYAHADAH', 'TAKHASSUS'])
    test(type + ' requires Tajwid and excludes Gharib', () => { const v = { ...base, tahsin_progress_type: type.startsWith('BUKU') ? 'BUKU' : type, tahsin_book_number: Number(type.slice(-1)), tahsin_gharib: null }; assert.equal(R.check(v, 'tahsin').complete, true); assert.equal(R.stats({ ...v, tahsin_gharib: 0 }, 'tahsin').average, 90); assert.ok(R.check({ ...v, tahsin_tajwid: null }, 'tahsin').missing.includes('tahsin_tajwid')); });
test('Finishing requires Gharib, stage transitions preserve history and change calculation', () => { const v = { ...base, tahsin_progress_type: 'FINISHING' }; assert.equal(R.stats(v, 'tahsin').average, 70); assert.equal(R.stats(v, 'tahsin').complete, true); assert.equal(R.stats({ ...v, tahsin_gharib: null }, 'tahsin').grade, '-'); v.tahsin_progress_type = 'BUKU'; v.tahsin_book_number = 3; assert.equal(R.stats(v, 'tahsin').average, 90); assert.equal(v.tahsin_gharib, 10); v.tahsin_progress_type = 'FINISHING'; assert.equal(R.check(v, 'tahsin').keys.length, 4); });
test('unknown stage checks guaranteed aspects separately without granting an exemption', () => { const v = { ...base, tahsin_progress_type: 'UNKNOWN' }; assert.equal(R.check(v, 'tahsin').known, false); assert.equal(R.check(v, 'tahsin').keys.length, 2); assert.equal(R.stats(v, 'tahsin').complete, false); assert.equal(R.stats(v, 'tahsin').grade, '-'); assert.equal(R.check({}, 'tahsin').missing.length, 2); });
test('blank, whitespace, zero and invalid values have distinct results', () => { for (const n of [null, undefined, '', '   '])
    assert.ok(R.check({ ...base, tahsin_makhraj: n }, 'tahsin').missing.includes('tahsin_makhraj')); for (const n of [0, '0', 100])
    assert.equal(R.check({ ...base, tahsin_makhraj: n }, 'tahsin').complete, true); for (const n of [-1, 101, 'x', Infinity])
    assert.ok(R.check({ ...base, tahsin_makhraj: n }, 'tahsin').invalid.includes('tahsin_makhraj')); });
test('draft reports distinguish missing, invalid and zero values', () => {
    assert.equal(R.aspect(null), '-');
    assert.equal(R.aspect(' '), '-');
    assert.equal(R.aspect('tidak valid'), 'NILAI TIDAK VALID');
    assert.equal(R.aspect(101), 'NILAI TIDAK VALID');
    assert.equal(R.aspect(0), 'KURANG MEMUASKAN');
});
test('complete scores cannot be marked print-ready while settings are missing', () => {
    const scores = { ...base, tahsin_tajwid: null, tahsin_gharib: null };
    const tahfidz = { tahfidz_makhraj: 85, tahfidz_tajwid: 85, tahfidz_hafalan: 85, tahfidz_aspect_confirmed: true };
    assert.equal(R.check(scores, 'tahsin').complete, true);
    assert.equal(R.check(tahfidz, 'tahfidz').complete, true);
    const report = R.reportCheck({ student: { id: '1' }, tahsin: { scores }, tahfidz: { scores: tahfidz }, issues: ['Target Tahsin belum diatur'] });
    assert.equal(report.complete, false);
    assert.ok(report.problems.includes('Target Tahsin belum diatur'));
});
test('Tahfidz always requires three scores; legacy Hafalan is not silently reinterpreted', () => { const v = { tahfidz_makhraj: 0, tahfidz_tajwid: 80, tahfidz_hafalan: 90, tahfidz_aspect_confirmed: true }; for (const k of ['tahfidz_makhraj', 'tahfidz_tajwid', 'tahfidz_hafalan'])
    assert.equal(R.check({ ...v, [k]: '' }, 'tahfidz').missing.length, 1); assert.equal(R.stats(v, 'tahfidz').complete, true); assert.equal(R.check({ ...v, tahfidz_aspect_confirmed: false }, 'tahfidz').complete, false); assert.equal(c.AssessmentData.draft({ ...v, tahfidz_aspect_confirmed: false, version: 1 }).tahfidz_hafalan, ''); });
test('ungraded pupils and different subject teachers appear in missing checks', () => { const r = R.reportCheck({ student: { id: '1' }, teachers: { tahsin: 'A', tahfidz: 'B' } }); assert.equal(r.missing.length, 2); assert.equal(r.missing[0].teacher, 'A'); assert.equal(r.missing[1].teacher, 'B'); assert.equal(r.missing[1].fields.length, 3); assert.ok(r.problems.length); });
test('all 30 juz use canonical surah IDs and changing juz clears dependent fields', () => { for (let j = 1; j <= 30; j++)
    assert.ok(R.surahsForJuz(j).length); assert.deepEqual(Array.from(R.surahsForJuz(30), s => s.number), Array.from({ length: 37 }, (_, i) => 78 + i)); const v = { tahfidz_juz: 29, tahfidz_surah: 112, tahfidz_ayah: 4, tahfidz_ayah_start: 1 }; c.ProgressForm.changed(v, 'tahfidz_juz'); assert.equal(v.tahfidz_surah, ''); assert.equal(v.tahfidz_ayah, ''); assert.equal(v.tahfidz_ayah_start, ''); });
