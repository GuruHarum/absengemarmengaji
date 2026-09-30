const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('REV47 presentation keeps Tahsin and Tahfidz target KPIs and uses Gemar Mengaji attendance', () => {
  const js = read('js/rev46-experience.js');
  assert.match(js, /Target Tahsin tercapai/);
  assert.match(js, /Target Tahfidz tercapai/);
  assert.match(js, /Kehadiran Gemar Mengaji/);
  assert.match(js, /attendanceAcademicSeries|attendanceSummary/i);
  assert.match(js, /Bulan yang belum berjalan dibiarkan kosong/i);
  assert.doesNotMatch(js, /Kelompok aktif/);
});

test('REV47 Gemar Mengaji attendance follows monthly recap semantics', () => {
  const js = read('js/rev46-experience.js');
  assert.match(js, /record\?attendanceCode\(record\.status\):'a'/);
  assert.match(js, /Math\.round\(counts\.h\/counts\.total\*100\)/);
  assert.match(js, /bucket\.sumStudentPct\/bucket\.students/);
  assert.match(js, /averagePct/);
});

test('REV47 presentation adds Tahsin stage distribution by grade without new target equivalence', () => {
  const js = read('js/rev46-experience.js');
  for (const label of ['Buku 1','Buku 2','Buku 3','Finishing']) assert.match(js, new RegExp(label));
  assert.match(js, /aggregateTahsinStages/);
  assert.match(js, /aggregateTahsinStages/);
});

test('REV47 presentation carousel is responsive and animates only when visible', () => {
  const js = read('js/rev46-experience.js');
  const css = read('css/rev46-experience.css');
  assert.match(js, /IntersectionObserver/);
  assert.match(js, /data-carousel-next/);
  assert.match(js, /touchstart/);
  assert.match(css, /gm-presentation-slide\.is-animated/);
  assert.match(css, /gm-stage-meter i/);
  assert.match(css, /gm-attendance-stack i/);
});

test('REV47 desktop collapsed sidebar opens on hover and keyboard focus', () => {
  const css = read('css/rev46-experience.css');
  assert.match(css, /sidebar-collapsed #sidebar:hover/);
  assert.match(css, /sidebar-collapsed #sidebar:focus-within/);
  assert.match(css, /width:264px/);
});

test('REV47 loader and cache busters are synchronized', () => {
  const sw = read('sw.js');
  const pwa = read('js/pwa.js');
  const admin = read('admin.html');
  const panel = read('js/panel-start.js');
  assert.match(sw, /const VERSION = 'loader49'/);
  assert.match(pwa, /const BUILD = 'loader49'/);
  assert.match(admin, /loader49/);
  assert.match(admin, /20260930-rev49/);
  assert.match(panel, /20260930-rev49/);
});
