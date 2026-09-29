const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('css/layout-responsive.css','utf8');
const accounts = fs.readFileSync('js/accounts.js','utf8');
const access = fs.readFileSync('js/access.js','utf8');
const sql = fs.readFileSync('supabase/20260928-16-koordinator-tertaut-guru.sql','utf8');

test('login stays horizontally centered, including short desktop viewports', () => {
  assert.match(css, /body\.login-page \{ min-height: 100dvh; display: flex; justify-content: center; align-items: center; \}/);
  const short = css.match(/@media screen and \(max-height: 600px\) \{[\s\S]*?body\.login-page \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(short, /justify-content:\s*center/);
  assert.doesNotMatch(short, /justify-content:\s*flex-start/);
});

test('coordinator may link to a teacher without losing coordinator role', () => {
  assert.match(accounts, /\['guru','koordinator'\]\.includes\(role\)/);
  assert.match(accounts, /row\.role === role/);
  assert.match(accounts, /Opsional: pilih data guru jika koordinator juga mengajar/);
  assert.match(access, /linkedTeacher/);
  assert.match(access, /Koordinator · \$\{profile\.teacherName\}/);
  assert.match(sql, /role = 'koordinator'/);
  assert.match(sql, /account_role IN \('guru','koordinator'\)/);
  assert.match(sql, /role=account_role AND teacher_id=linked_teacher/);
});
