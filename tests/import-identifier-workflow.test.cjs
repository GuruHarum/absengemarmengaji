"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('admin.html','utf8');
const ui=fs.readFileSync('js/dashboard.js','utf8');
const sql=fs.readFileSync('supabase/student-import.sql','utf8');
const parser=fs.readFileSync('js/student-import.js','utf8');
test('import tab is adjacent to Tahfidz and import form is moved out of directory',()=>{
 assert.ok(html.indexOf('id="tab-impor"')>html.indexOf('id="tab-guru-tahfidz"'));
 assert.ok(html.indexOf('id="manageImportView"')>html.indexOf('id="manageDirectoryPagination"'));
 assert.match(ui,/currentManageTab === 'impor'/);
 assert.match(html,/id="manageCheckIdentifiersBtn"/);
});
test('manual edit uses manager-only atomic RPC for profile+NIS/NISN',()=>{
 assert.match(html,/id="manageIdentifierAudit"/);
 assert.match(ui,/id="inputSiswaNis"/);
 assert.match(ui,/id="inputSiswaNisn"/);
 assert.match(ui,/supabase\.rpc\('save_student_profile_and_identifiers'/);
 assert.match(sql,/not app_private\.is_manager\(\)/);
 assert.match(sql,/lock table public\.students, public\.student_identifiers in share row exclusive mode/);
 assert.match(sql,/on conflict\(student_id\) do update set nis=excluded\.nis,nisn=excluded\.nisn/);
});
test('server blanks both identifiers only when repeated and keeps ambiguous pupil IDs blocked',()=>{
 assert.match(sql,/clear_both:=nis_count>1 or nisn_count>1 or db_nis_count>0 or db_nisn_count>0/);
 assert.match(sql,/needs_review:=clear_both and target is null/);
 assert.match(sql,/duplicate_file_names>1/);
 assert.match(sql,/identifier_review then/);
 assert.match(sql,/clear_identifiers then null/);
 assert.match(sql,/not in \('new','update','unchanged'\)/);
 assert.doesNotMatch(sql,/delete\s+from\s+public\.students\b/i);
});
test('audit reports both/one missing and no public execute',()=>{
 assert.match(sql,/public\.list_missing_student_identifiers\(\)/);
 assert.match(sql,/count\(\*\) filter\(where nullif\(trim\(i\.nis\),''\) is null/);
 assert.match(sql,/revoke all on function public\.list_missing_student_identifiers\(\) from public,anon/);
 assert.match(ui,/supabase\.rpc\('list_missing_student_identifiers'\)/);
 assert.match(ui,/copyMissingStudentNames/);
});
test('client blocks duplicate numbers before server preview; server rechecks raw entries',()=>{
 assert.match(parser,/can_import: issues.length === 0/);
 assert.match(ui,/const \{ data, error \} = await supabase\.rpc\('preview_import_students'/);
 assert.match(sql,/entries:=app_private\.prepare_student_import_entries\(entries\)/);
 assert.match(sql,/md5\(raw_entries::text/);
 assert.match(sql,/checked_preview->>'token'<>preview_token/);
});
