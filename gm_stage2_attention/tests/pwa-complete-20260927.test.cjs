'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('filter absensi excludes Tahfidz-only teachers',()=>{
 assert.match(read('js/admin.js'),/teachersData\.filter\(g => g\.attendance_enabled !== false\)/);
});
test('periodic teacher list obeys subject and teacher input hidden for ordinary teachers',()=>{
 const js=read('js/assessments.js');
 assert.match(js,/subject === 'tahsin'/);assert.match(js,/eq\('subject', subject\)/);
 assert.match(js,/teacherLabel\.hidden = !AppAccess\.full\(\)/);
});
test('student two-confirmation UI invokes guarded RPC, never direct table delete',()=>{
 const js=read('js/dashboard.js'), sql=read('supabase/20260928-01-keamanan-penghapusan.sql');
 assert.match(js,/gm_student_delete_preview/); assert.match(js,/gm_delete_student_verified/);
 assert.match(js,/KONFIRMASI 1\/2/);assert.match(js,/KONFIRMASI 2\/2/);
 assert.match(sql,/REVOKE UPDATE, DELETE ON public\.attendance FROM anon, PUBLIC/);
 assert.match(sql,/role='koordinator'/);
});
test('import blocks duplicate NIS(N), server matches unique identifiers',()=>{
 const js=read('js/student-import.js'),sql=read('supabase/20260928-03-impor-nisn-nis-v5.sql');
 assert.match(js,/can_import: issues.length === 0/);
 assert.match(sql,/match_by:='nisn'/);assert.match(sql,/match_by:='nis'/);
 assert.match(sql,/action:='conflict'; reason:='NIS dan NISN menunjuk ke siswa yang berbeda'/);
});
test('mobile name narrow; spreadsheet script lazy loaded; dashboard monthly range',()=>{
 assert.match(read('css/admin.css'),/max-width: 92px/);
 assert.match(read('js/student-import.js'),/async function ensureXlsx/);
 assert.doesNotMatch(read('js/panel-start.js'),/'js\/vendor\/xlsx\.full\.min\.js'/);
 assert.match(read('js/dashboard.js'),/unduh absensi saat filter/);
});
