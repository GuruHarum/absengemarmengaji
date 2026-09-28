"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const c = vm.createContext({});
c.window = c;
for (const f of ['quran-surahs', 'report-reference', 'report-core', 'assessments-core'])
    vm.runInContext(fs.readFileSync('js/' + f + '.js', 'utf8'), c);
const R = c.ReportCore;
const tf = { tahfidz_progress_type: 'SURAT', tahfidz_juz: 30, tahfidz_surah: 108, tahfidz_ayah_start: 2, tahfidz_ayah: 3, tahfidz_aspect_confirmed: true, tahfidz_makhraj: 80, tahfidz_tajwid: 80, tahfidz_hafalan: 80 };
test('grades, decimal boundaries, predicates, null and explicit zero', () => { for (const [n, g] of [[0, 'D'], [59.99, 'D'], [60, 'C'], [69.99, 'C'], [70, 'C+'], [75, 'B-'], [80, 'B'], [85, 'B+'], [89.99, 'B+'], [90, 'A'], [100, 'A']])
    assert.equal(R.stats({ tahfidz_makhraj: n, tahfidz_tajwid: n, tahfidz_hafalan: n, tahfidz_aspect_confirmed: true }, 'tahfidz').grade, g); assert.equal(R.stats({}, 'tahsin').average, null); const s = { tahsin_progress_type: 'FINISHING', tahsin_makhraj: 80, tahsin_tajwid: 80, tahsin_tartil: 80, tahsin_gharib: null }; assert.equal(R.stats(s, 'tahsin').average, 80); s.tahsin_gharib = 0; assert.equal(R.stats(s, 'tahsin').average, 60); assert.match(R.stats(tf, 'tahfidz').predicate, /JAYYID JIDDAN/); });
test('all six Tahsin types and 180 book pages use real reference material', () => { assert.equal(c.ReportReference.books.length, 180); for (const r of c.ReportReference.books)
    assert.equal(R.validateProgress({ tahsin_progress_type: 'BUKU', tahsin_book_number: r.book, tahsin_page: r.page }, 'tahsin').tahsin_material, r.material); for (const type of ['FINISHING', 'SYAHADAH', 'TAKHASSUS'])
    assert.equal(R.validateProgress({ tahsin_progress_type: type }, 'tahsin').tahsin_page, undefined); assert.equal(R.validateProgress({ tahsin_progress_type: 'JILID', tahsin_jilid: 'JUZ 27' }, 'tahsin').tahsin_jilid, 'JUZ 27'); assert.equal(R.validateProgress({ tahsin_progress_type: "AL-QUR'AN", tahsin_surah_number: 108, tahsin_ayah: 3 }, 'tahsin').tahsin_ayah, 3); assert.throws(() => R.validateProgress({ tahsin_book: 'Teks tidak dikenal' }, 'tahsin'), /verifikasi/); });
test('legacy Hafalan requires explicit verification and verse ranges remain explicit', () => { assert.equal(R.check({ ...tf, tahfidz_aspect_confirmed: '' }, 'tahfidz').complete, false); assert.throws(() => R.validateProgress({ ...tf, tahfidz_ayah_start: 4 }, 'tahfidz'), /tidak valid/); assert.match(R.description('Siswa Uji', tf, 'tahfidz'), /ayat 2 - 3/); assert.match(R.description('Siswa Uji', { ...tf, tahfidz_hafalan: 20 }, 'tahfidz'), /bimbingan/); for (const kind of ['REVIEW', 'TES'])
    assert.ok(R.validateProgress({ ...tf, tahfidz_progress_type: kind, tahfidz_surah: '' }, 'tahfidz')); });
test('surah report names keep canonical numbers and period note uses active period', () => { assert.equal(R.surahName(111), 'Al-Lahab'); assert.equal(R.surahName(75), 'Al-Qiyamah'); for (const [key, label] of Object.entries(R.periods))
    assert.ok(R.note('Siswa Uji', key).includes(label)); });
test('attainment uses books/pages and curriculum surah order rather than alphabetic names', () => { assert.equal(R.attainment({ tahsin_progress_type: 'BUKU', tahsin_book_number: 2, tahsin_page: 1 }, { tahsin_progress_type: 'BUKU', tahsin_book_number: 1, tahsin_page: 60 }, 'tahsin'), 'TERCAPAI'); assert.equal(R.attainment(tf, { ...tf, tahfidz_surah: 110 }, 'tahfidz'), 'TERCAPAI'); assert.equal(R.attainment({ ...tf, tahfidz_juz: 29, tahfidz_surah: 75 }, { ...tf, tahfidz_juz: 29, tahfidz_surah: 73 }, 'tahfidz'), 'TERCAPAI'); assert.equal(R.attainment({}, tf, 'tahfidz'), 'BELUM DINILAI'); });
