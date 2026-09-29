const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('REV43 exposes partial student transfer in both learning group pages', () => {
  const js = read('js/learning-groups.js');
  assert.match(js, /data-transfer-students/);
  assert.match(js, />Transfer Murid</);
  assert.match(js, /pickStudentsForTransfer/);
  assert.match(js, /p_student_ids:\s*choice\.studentIds/);
  assert.match(js, /gm_transfer_group_students/);
});

test('REV43 transfer SQL moves membership atomically and preserves Tahsin master teacher consistency', () => {
  const sql = read('supabase/20260929-26-transfer-murid-kelompok.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.gm_transfer_group_students/i);
  assert.match(sql, /SET active = false/i);
  assert.match(sql, /ON CONFLICT \(assignment_id, student_id\)/i);
  assert.match(sql, /IF src\.subject = 'tahsin'/i);
  assert.match(sql, /SET "nama guru" = target_teacher_short/i);
  assert.doesNotMatch(sql, /DELETE FROM public\.students/i);
  assert.doesNotMatch(sql, /DELETE FROM public\.teachers/i);
  assert.doesNotMatch(sql, /DELETE FROM public\.subject_assessments/i);
});

test('REV43 bumps PWA cache version', () => {
  assert.match(read('sw.js'), /const VERSION = 'loader43'/);
  assert.match(read('js/panel-start.js'), /20260929-rev43/);
});
