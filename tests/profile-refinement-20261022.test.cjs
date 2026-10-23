"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

for (const page of ['admin.html', 'guru.html']) {
  test(`Profil ${page}: feedback lokal, username dapat dihapus, tidak ada kartu ganda`, () => {
    const html = fs.readFileSync(page, 'utf8');
    const profile = html.split('id="page-profil"')[1]?.split('id="gmLearningSubnav"')[0] || '';
    for (const id of ['profilePhotoFeedback','profileIdentityFeedback','profileUsernameFeedback',
        'profilePasswordFeedback','profileUsernameRemove','profileUsernameSave']) {
      assert.match(profile, new RegExp(`id="${id}"`));
    }
    assert.match(profile, /class="profile-username-section"/);
    assert.doesNotMatch(profile, /<section class="assessment-controls"><form[^>]*id="profileUsernameForm"/);
    assert.match(html, /css\/ui-polish-20260928.css\?v=20261023-archive-light1/);
    assert.match(html, /js\/panel-modules.js\?v=20261023-archive-light1/);
  });
}

test('Perubahan profil menjaga alur penyimpanan, konfirmasi, dan sinkronisasi username', () => {
  const code = fs.readFileSync('js/profile.js', 'utf8');
  assert.match(code, /window.AdminNotice\?\.confirm/);
  assert.match(code, /gm_set_login_username', \{ new_username: '' \}/);
  assert.match(code, /if \(data !== ''\)/);
  assert.match(code, /clearPreview\(\);\s*renderPhotoProfile\(\);\s*return message\(error.message, true, 'profilePhotoFeedback'\)/);
  for (const id of ['profilePhotoFeedback','profileIdentityFeedback','profileUsernameFeedback','profilePasswordFeedback']) {
    assert.ok(code.includes(id));
  }
});

test('Penghapusan username di backend hanya menghapus pemetaan login sendiri', () => {
  const sql = fs.readFileSync('supabase/20261022-27-username-opsional-hapus.sql', 'utf8');
  assert.match(sql, /delete from public\.teacher_login_usernames where user_id = auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /(?:delete|truncate)\s+(?:from\s+)?auth\.users/i);
  assert.doesNotMatch(sql, /storage\.(?:objects|buckets)/i);
  assert.match(sql, /if normalized = '' then/i);
});

test('CSS profil dibatasi ke halaman profil dan PWA menaikkan cache', () => {
  const css = fs.readFileSync('css/ui-polish-20260928.css', 'utf8');
  const sw = fs.readFileSync('sw.js','utf8');
  assert.match(css, /PROFIL 2026-10-22/);
  assert.match(css, /#page-profil \.profile-local-feedback/);
  assert.match(css, /#page-profil \[hidden\] \{ display:none!important; \}/);
  assert.match(css, /max-width:420px/);
  assert.match(sw, /report-archive-light-20261023f/);
});
