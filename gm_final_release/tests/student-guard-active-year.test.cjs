"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
for (const sub of ['','public-build/']) {
  test(`${sub||'source '} menonaktifkan hapus siswa di UI tanpa menyentuh edit`,()=>{
    const code=fs.readFileSync(`${sub}js/dashboard.js`,'utf8');
    assert.match(code,/currentManageTab === 'guru' && !AppAccess\.teacher\(\)/);
    assert.match(code,/if \(currentManageTab !== 'guru'\)/);
    assert.doesNotMatch(code,/from\(['"]students['"]\)\.delete\(/);
    assert.match(code,/save_student_profile_and_identifiers/);
  });
}
test('SQL proteksi tidak menjalankan pembersihan atau reset',()=>{
 const sql=fs.readFileSync('supabase/protect-students-active-year-2026.sql','utf8');
 assert.match(sql,/REVOKE DELETE ON TABLE public\.students/);
 assert.match(sql,/DROP POLICY IF EXISTS scoped_delete ON public\.students/);
 assert.doesNotMatch(sql,/\bTRUNCATE\b|DELETE FROM public\./i);
});
