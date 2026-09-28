"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function setup() {
    const ctx = vm.createContext({});
    ctx.window = ctx;
    vm.runInContext(read('js/quran-surahs.js'), ctx);
    vm.runInContext(read('js/assessments-core.js'), ctx);
    return ctx;
}
const context = { year: 2026, period: 'pts_ganjil', teacherId: 'teacher-1' };
const student = { id: 'student-1' };
const complete = () => ({ tahsin_makhraj: '80', tahsin_tajwid: '81.5', tahsin_tartil: '82', tahsin_gharib: '', tahsin_book: 'Jilid 4', tahsin_page: '24', tahfidz_makhraj: '83', tahfidz_tajwid: '84', tahfidz_hafalan: '85', tahfidz_surah: '2', tahfidz_ayah: '286' });
test('all 114 local surahs match the downloaded source and total 6236 verses', () => {
    const { QURAN_SURAHS } = setup();
    const source = JSON.parse(read('supabase/surah-indonesia-reference.json').replace(/^\uFEFF/, ''));
    assert.equal(QURAN_SURAHS.length, 114);
    assert.equal(QURAN_SURAHS.reduce((sum, s) => sum + s.ayahs, 0), 6236);
    QURAN_SURAHS.forEach((surah, index) => {
        assert.equal(surah.number, index + 1);
        assert.equal(surah.name, source[index].name);
        assert.equal(surah.ayahs, source[index].ayahs);
    });
    assert.equal(QURAN_SURAHS[0].ayahs, 7);
    assert.equal(QURAN_SURAHS[1].ayahs, 286);
    assert.equal(QURAN_SURAHS[107].ayahs, 3);
    assert.equal(QURAN_SURAHS[113].ayahs, 6);
});
test('four assessment periods and different academic years remain distinct', () => {
    const { AssessmentData } = setup();
    assert.equal(Object.keys(AssessmentData.periods).length, 4);
    const keys = new Set();
    for (const year of [2026, 2027])
        for (const period of Object.keys(AssessmentData.periods)) {
            const row = AssessmentData.payload({ ...context, year, period }, student, complete());
            keys.add(`${row.student_id}|${row.academic_year_start}|${row.period}`);
        }
    assert.equal(keys.size, 8);
});
test('optional Gharib is null; explicit zero is preserved', () => {
    const { AssessmentData } = setup();
    const row = AssessmentData.payload(context, student, complete());
    assert.equal(row.tahsin_gharib, null);
    const zero = AssessmentData.payload(context, student, { ...complete(), tahsin_gharib: '0', tahsin_makhraj: '0' });
    assert.equal(zero.tahsin_gharib, 0);
    assert.equal(zero.tahsin_makhraj, 0);
});
test('all mandatory scores enforce 0–100, precision, and nonempty values', () => {
    const { AssessmentData } = setup();
    for (const field of Object.keys(AssessmentData.scores)) {
        for (const value of ['-1', '100.01', '101', 'abc', 'NaN', '1e2', '90.555']) {
            assert.throws(() => AssessmentData.payload(context, student, { ...complete(), [field]: value }));
        }
        if (field !== 'tahsin_gharib')
            assert.throws(() => AssessmentData.payload(context, student, { ...complete(), [field]: '' }));
        assert.equal(AssessmentData.payload(context, student, { ...complete(), [field]: '100' })[field], 100);
    }
});
test('attainment requires book, positive page, valid surah and in-range verse', () => {
    const { AssessmentData } = setup();
    for (const value of ['', ' ', 'x'.repeat(81)])
        assert.throws(() => AssessmentData.payload(context, student, { ...complete(), tahsin_book: value }));
    for (const value of ['', '0', '-1', '1.5'])
        assert.throws(() => AssessmentData.payload(context, student, { ...complete(), tahsin_page: value }));
    for (const value of ['', '0', '115'])
        assert.throws(() => AssessmentData.payload(context, student, { ...complete(), tahfidz_surah: value }));
    for (const value of ['', '0', '-1', '8', '1.5'])
        assert.throws(() => AssessmentData.payload(context, student, { ...complete(), tahfidz_surah: '1', tahfidz_ayah: value }));
    assert.equal(AssessmentData.payload(context, student, { ...complete(), tahfidz_surah: '1', tahfidz_ayah: '7' }).tahfidz_ayah, 7);
});
test('reloading saved data round-trips zero/null and retains conflict version', () => {
    const { AssessmentData } = setup();
    const saved = { ...AssessmentData.payload(context, student, complete()), tahsin_makhraj: 0, version: 3 };
    const draft = AssessmentData.draft(saved);
    assert.equal(draft.tahsin_makhraj, '0');
    assert.equal(draft.tahsin_gharib, '');
    assert.equal(AssessmentData.dirty(draft, saved), false);
    const row = AssessmentData.payload(context, student, draft, saved);
    assert.equal(row.version, 3);
    draft.tahsin_makhraj = '';
    assert.equal(AssessmentData.dirty(draft, saved), true);
    assert.throws(() => AssessmentData.payload(context, student, draft, saved));
});
test('untouched empty students are not dirty and cannot be saved as zero grades', () => {
    const { AssessmentData } = setup();
    const blank = AssessmentData.draft();
    assert.equal(AssessmentData.dirty(blank), false);
    assert.throws(() => AssessmentData.payload(context, student, blank));
    blank.tahsin_gharib = '0';
    assert.equal(AssessmentData.dirty(blank), true);
});
