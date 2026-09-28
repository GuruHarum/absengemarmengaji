"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = fs.readFileSync('supabase/student-import.sql','utf8');
const ui = fs.readFileSync('js/dashboard.js','utf8');

test('read-only preview examines Tahsin teacher, Tahfidz membership and report cohort even for unchanged master', () => {
 const preview = sql.split('create or replace function public.preview_import_students')[1]
                    .split('drop function if exists public.import_students')[0];
 assert.match(preview,/tahsin_needs_sync/i);
 assert.match(preview,/tahfidz_needs_sync/i);
 assert.match(preview,/report_periods_missing/i);
 assert.match(preview,/class_access_needs_sync/i);
 assert.match(preview,/if action='unchanged' and \(tahsin_needs_sync or tahfidz_needs_sync/);
 assert.doesNotMatch(preview,/\b(delete|update|insert)\s+(from\s+|into\s+)?public\.(students|assessment_group_members|report_period_students)/i);
});

test('teacher lookup matches both short and full names to avoid accidental duplicate Bu Lilis teacher', () => {
 assert.match(sql,/import_teacher_name_key\(nama\)=normalized\s+or app_private\.import_teacher_name_key\(nama_lengkap\)=normalized/);
 assert.match(sql,/import_teacher_name_key\(nama_lengkap\)=app_private\.import_teacher_name_key\(tahfidz_input\)/);
});

test('write phase locks and revalidates preview before syncing ALL students including unchanged', () => {
 const writer = sql.split('create or replace function public.import_students')[1];
 assert.match(writer,/lock table public\.teachers,[\s\S]*?public\.report_period_students/);
 assert.match(writer,/checked_preview:=public\.preview_import_students\(entries,year_key\)/);
 assert.match(writer,/if checked_preview->>'token'<>preview_token/);
 assert.match(writer,/if tahfidz_id is not null then/);
 assert.match(writer,/if current_count=0 then/);
 assert.match(writer,/student_id=pupil_id::text/);
 assert.match(writer,/on conflict\(assignment_id,student_id\) do update set active=true/);
});

test('report roster sync creates four periods and preserves assessed or approved period snapshots', () => {
 const writer = sql.split('create or replace function public.import_students')[1];
 assert.match(writer,/unnest\(array\['pts_ganjil','pas_ganjil','pts_genap','pas_genap'\]\)/);
 assert.match(writer,/not exists\(select 1 from public\.subject_assessments sa/);
 assert.match(writer,/not exists\(select 1 from public\.periodic_assessments pa/);
 assert.match(writer,/not exists\(select 1 from public\.student_reports sr/);
 assert.match(writer,/sr\.status in \('DIAJUKAN','DISETUJUI'\)/);
 assert.doesNotMatch(writer,/delete\s+from\s+public\.(students|attendance|subject_assessments|student_reports)\b/i);
});

test('preview blocks duplicate master names even when NIS points at one of duplicate IDs', () => {
 assert.match(sql,/cardinality\(name_class_matches\),0\)>1 and action not in \('conflict','review'\)/);
 assert.match(sql,/NIS\/NISN cocok tetapi nama berbeda/);
 assert.match(sql,/duplicate_target_file_rows/);
 assert.match(ui,/duplicate_target_file_rows/);
 assert.match(sql,/Perpindahan guru Tahfidz memiliki nilai/);
});

test('UI discloses planned Tahsin/Tahfidz/rapor linking and acknowledges empty Tahfidz', () => {
 assert.match(ui,/RENCANA PEMBARUAN/);
 assert.match(ui,/Tahfidz: \$\{row\.guru_tahfidz\}/);
 assert.match(ui,/Tambah \$\{row\.report_periods_missing\} periode rapor/);
 assert.match(ui,/Guru Tahfidz kosong TIDAK akan dipindah/);
 assert.match(ui,/tahfidz_added \|\| 0/);
 assert.match(ui,/report_added \|\| 0/);
});

test('staging orphan recovery is scoped to 1213 and 1214; does not alter attendance or assessments', () => {
 const fix=fs.readFileSync('supabase/repair-staging-1213-1214.sql','utf8');
 assert.match(fix,/\(38,1213,'Muhammad Gibran Ardana'\)/);
 assert.match(fix,/\(39,1214,'Muhammad Ibrahim Albarra Maliq'\)/);
 assert.match(fix,/UPDATE public\.assessment_group_members/);
 assert.match(fix,/UPDATE public\.report_period_students/);
 assert.doesNotMatch(fix,/\b(delete|update|insert)\s+(from\s+|into\s+)?public\.(students|attendance|subject_assessments|student_reports)/i);
});

test('staging recovery removes matching orphan before reactivating old membership to avoid unique-index collision', () => {
 const fix = fs.readFileSync('supabase/repair-staging-1213-1214.sql','utf8');
 const deletePos = fix.indexOf('DELETE FROM public.assessment_group_members AS orphan');
 const activatePos = fix.indexOf('SET active=true\nFROM restore_matching_groups');
 const relocatePos = fix.indexOf('SET student_id=p.old_id::text');
 assert.ok(deletePos > 0 && activatePos > deletePos && relocatePos > activatePos);
 assert.match(fix,/CREATE TEMP TABLE restore_matching_groups ON COMMIT DROP AS/);
});
