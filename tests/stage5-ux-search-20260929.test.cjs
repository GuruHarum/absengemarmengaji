'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('coordinator attention teacher summary has no initials avatar', () => {
  const js = read('js/attention-center.js');
  const block = js.match(/function scoreGroupsMarkup\(groups\)[\s\S]*?function listMarkup\(/)?.[0] || '';
  assert.doesNotMatch(block, /gm-attention-teacher-avatar/);
  assert.match(block, /gm-attention-teacher-identity/);
  assert.match(block, /Kirim pengingat/);
});

test('learning group student search works before class selection', () => {
  const js = read('js/learning-groups.js');
  assert.match(js, /Cari nama siswa di semua kelas/);
  assert.match(js, /const candidates = search[\s\S]*?state\.students\.filter/);
  assert.match(js, /if \(!classSelect\.value && event\.target\.dataset\.studentClass\) classSelect\.value/);
  assert.match(js, /Pencarian dapat langsung digunakan tanpa memilih kelas/);
});

test('stage 5 provides skeletons, responsive tables and richer empty states', () => {
  const js = read('js/ux-stage5.js');
  const css = read('css/ux-stage5.css');
  const html = read('admin.html');
  assert.match(js, /skeletonList/);
  assert.match(js, /skeletonCards/);
  assert.match(js, /skeletonTable/);
  assert.match(js, /gm-table-card-mode/);
  assert.match(js, /MutationObserver/);
  assert.match(css, /gm-skeleton-line/);
  assert.match(css, /gm-table-card-mode/);
  assert.match(css, /gm-table-scroll-mode/);
  assert.match(css, /gm-empty-rich/);
  assert.match(html, /css\/ux-stage5\.css\?v=20260929-ux27/);
  assert.match(html, /js\/ux-stage5\.js\?v=20260929-ux27/);
});

test('high-use panels use stage 5 skeletons', () => {
  const groups = read('js/learning-groups.js');
  const assessments = read('js/assessments.js');
  const upgrade = read('js/gm-upgrade-20260928.js');
  const attention = read('js/attention-center.js');
  assert.match(groups, /window\.GMUX\.skeletonCards/);
  assert.match(groups, /window\.GMUX\.skeletonList/);
  assert.match(assessments, /window\.GMUX\.skeletonCards/);
  assert.match(upgrade, /window\.GMUX\.skeletonTable/);
  assert.match(attention, /window\.GMUX\.skeletonList/);
});
