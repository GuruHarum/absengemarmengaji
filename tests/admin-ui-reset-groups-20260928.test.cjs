'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');

test('Pengaturan Sistem exposes coordinator-only student reset with preserved teacher/account scope',()=>{
 const html=read('admin.html'),js=read('js/system-reset.js'),sql=read('supabase/20260928-14-reset-data-siswa-koordinator.sql');
 assert.match(html,/data-settings-view="data"/);
 assert.match(html,/id="systemResetExecute"/);
 assert.match(js,/AppAccess\.profile\?\.role === 'koordinator'/);
 assert.match(js,/HAPUS SEMUA DATA SISWA/);
 assert.match(sql,/DELETE FROM public\.students/);
 assert.match(sql,/DELETE FROM public\.attendance/);
 assert.doesNotMatch(sql,/DELETE FROM public\.teachers/);
 assert.doesNotMatch(sql,/DELETE FROM public\.user_roles/);
 assert.doesNotMatch(sql,/DELETE FROM auth\.users/);
});

test('learning group page renders only the selected teacher and uses compact cards',()=>{
 const js=read('js/learning-groups.js'),css=read('css/admin-refinement.css');
 assert.match(js,/data-view-teacher/);
 assert.match(js,/state\.groups\.filter\(group => String\(group\.teacher_id\) === String\(teacherId\)\)/);
 assert.match(js,/gm-group-card/);
 assert.match(css,/\.gm-group-cards/);
 assert.match(css,/\.gm-group-card-actions/);
});

test('admin first paint does not wait for initial data and teacher enrollment is lazy',()=>{
 const start=read('js/panel-start.js'),enroll=read('js/enrollment.js');
 assert.doesNotMatch(start,/await window\.panelDataReady/);
 assert.match(start,/Promise\.resolve\(window\.panelDataReady\)/);
 const ready=enroll.match(/document\.addEventListener\('panelready',[\s\S]*?\n\s*}\);/)?.[0]||'';
 assert.doesNotMatch(ready,/\bopen\(\);/);
});
