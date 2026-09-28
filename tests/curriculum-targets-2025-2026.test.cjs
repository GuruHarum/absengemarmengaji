'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const c = vm.createContext({});c.window=c;
for (const file of ['quran-surahs','report-reference','curriculum-targets','report-core']) vm.runInContext(fs.readFileSync('js/'+file+'.js','utf8'),c);
const T=c.CurriculumTargets,R=c.ReportCore;
const periods=['pts_ganjil','pas_ganjil','pts_genap','pas_genap'];
test('all 48 reference targets from the 2025/2026 table are structured and valid',()=>{
 let count=0;
 for (let grade=1;grade<=6;grade++) for (const period of periods) for (const subject of ['tahsin','tahfidz']) {
  const raw=T.preset(subject,grade,period);assert.ok(raw,`${subject} kelas ${grade} ${period}`);
  const value=T.validate(raw,subject,R.surahsForJuz);
  assert.ok(T.label(value,subject).length>8);
  count++;
 }
 assert.equal(count,48);
});
test('reference Tahsin: Books 1-3, juz+Gharib, Tajwid, IMTAS and Takhossus',()=>{
 assert.equal(T.preset('tahsin',1,'pts_ganjil').target_page_end,15);
 assert.equal(T.preset('tahsin',1,'pas_ganjil').target_page_end,30);
 assert.equal(T.preset('tahsin',2,'pts_genap').tahsin_book_number,2);
 assert.deepEqual([T.preset('tahsin',4,'pts_ganjil').target_juz_end,T.preset('tahsin',4,'pts_ganjil').gharib_page_end],[6,15]);
 assert.equal(T.preset('tahsin',4,'pas_genap').curriculum_mode,'TAJWID');
 assert.equal(T.preset('tahsin',5,'pts_ganjil').imtas_month,'NOVEMBER');
 assert.equal(T.preset('tahsin',5,'pts_genap').imtas_month,'FEBRUARI');
 assert.equal(T.preset('tahsin',6,'pas_genap').curriculum_mode,'TAKHASSUS');
});
test('Tahfidz reference keeps both surat endpoints and partial verses',()=>{
 const a=T.preset('tahfidz',5,'pts_ganjil');assert.equal(a.tahfidz_surah_start,75);assert.equal(a.tahfidz_surah,76);assert.equal(a.tahfidz_ayah,15);
 const b=T.preset('tahfidz',5,'pas_ganjil');assert.equal(b.tahfidz_ayah_start,16);assert.equal(b.tahfidz_surah,77);
 const c=T.preset('tahfidz',5,'pts_genap');assert.equal(c.tahfidz_juz,27);assert.equal(c.tahfidz_surah,52);assert.equal(c.tahfidz_ayah,25);
 assert.match(T.label(c,'tahfidz'),/25/);
});
test('all target aspect rules remain about actual student stages, not class targets',()=>{
 assert.equal(R.applicable({tahsin_progress_type:'BUKU',tahsin_book_number:1},'tahsin').keys.length,2);
 assert.equal(R.applicable({tahsin_progress_type:'GHARIB'},'tahsin').keys.includes('tahsin_gharib'),false);
 assert.equal(R.applicable({tahsin_progress_type:'TAJWID'},'tahsin').keys.includes('tahsin_tajwid'),true);
 assert.equal(R.applicable({tahsin_progress_type:'FINISHING'},'tahsin').keys.includes('tahsin_gharib'),true);
});
test('no fabricated attainment for stages that have no detailed progress record',()=>{
 const target=T.preset('tahsin',4,'pts_ganjil');
 assert.equal(T.attainment({tahsin_progress_type:"AL-QUR'AN"},target,'tahsin'),'BELUM DINILAI');
 assert.equal(T.attainment({tahsin_progress_type:"AL-QUR'AN",tahsin_juz_last:5,tahsin_gharib_page:15},target,'tahsin'),'BELUM TERCAPAI');
 assert.equal(T.attainment({tahsin_progress_type:"AL-QUR'AN",tahsin_juz_last:6,tahsin_gharib_page:15},target,'tahsin'),'TERCAPAI');
 assert.equal(T.attainment({tahsin_progress_type:'BUKU',tahsin_book_number:1,tahsin_page:25},T.preset('tahsin',1,'pas_ganjil'),'tahsin'),'BELUM TERCAPAI');
 assert.equal(T.attainment({tahsin_progress_type:'BUKU',tahsin_book_number:1,tahsin_page:30},T.preset('tahsin',1,'pas_ganjil'),'tahsin'),'TERCAPAI');
});
test('out-of-range verses, reversed order and invalid Gharib pages are rejected',()=>{
 assert.throws(()=>T.validate({...T.preset('tahfidz',5,'pts_ganjil'),tahfidz_ayah:99},'tahfidz',R.surahsForJuz),/Ayat akhir/);
 assert.throws(()=>T.validate({...T.preset('tahfidz',1,'pts_ganjil'),tahfidz_surah_start:100,tahfidz_surah:114},'tahfidz',R.surahsForJuz),/Urutan/);
 assert.throws(()=>T.validate({...T.preset('tahsin',4,'pts_ganjil'),gharib_page_end:61},'tahsin',R.surahsForJuz),/Gharib/);
});
